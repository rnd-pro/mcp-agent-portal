import { getStateGraph } from '../state-graph.js';
import { fetchTaskResult } from './mcp-helpers.js';

export class TaskRouter {
  /**
   * @param {object} mcpProxy - Reference to the main proxy manager
   */
  constructor(mcpProxy) {
    this.mcpProxy = mcpProxy;
    /** @type {Map<string, object[]>} taskId → cached notifications before subscription */
    this.pendingNotifications = new Map();
  }

  /**
   * @param {object} notification
   */
  route(notification) {
    let { taskId, type, data } = notification.params || {};
    if (!taskId) return;

    console.log(`💬 [TaskNotify] taskId=${taskId} type=${type}`);

    let sg = getStateGraph();
    let meta = data?.meta;

    // Cache ALL events in StateGraph for delta sync and recovery
    if (type === 'event' && data) {
      try {
        // Compact event summary for ring buffer (but keep enough for UI rendering)
        let summary = {
          type: data.type || 'unknown',
          ts: Date.now(),
        };
        if (data.role) summary.role = data.role;
        if (data.name) summary.name = data.name;
        if (data.content && typeof data.content === 'string') {
          summary.content = data.content;
        }
        if (data.arguments) summary.arguments = data.arguments;
        if (data.output) summary.output = data.output;
        if (data.status) summary.status = data.status;

        // Initialize events array if needed
        let task = sg.get(`tasks/${taskId}`);
        if (task && !task.events) {
          sg.merge(`tasks/${taskId}`, { events: [] }, 'task-init');
        }

        sg.commit([{
          op: 'push',
          path: `tasks/${taskId}/events`,
          value: summary,
        }], 'task-event');
      } catch (err) {
        // Non-critical: event caching failure shouldn't break routing
        console.warn(`[TaskNotify] Event cache failed for ${taskId}:`, err.message);
      }
    }

    if (meta && type !== 'event') {
      let ops = [{ op: 'merge', path: `tasks/${taskId}`, value: {
        ...meta,
        type,
        updatedAt: Date.now(),
      }}];

      if (type === 'done' || type === 'error' || type === 'cancelled') {
        setTimeout(() => {
          try { sg.del(`tasks/${taskId}`, 'task-ttl'); } catch (e) { console.warn(`[TaskNotify] TTL cleanup failed for ${taskId}:`, e.message); }
        }, 10 * 60 * 1000);
      }
      try { sg.commit(ops, `agent-pool:${type}`); } catch (err) {
        console.error(`[TaskNotify] StateGraph commit failed for ${taskId}:`, err.message);
      }
    }

    let chatWsServer = this.mcpProxy.chatWsServer;
    let clients = chatWsServer ? chatWsServer.chatSubscriptions.get(taskId) : null;

    if (!clients || clients.size === 0) {
      console.log(`💬 [TaskNotify] No subscribers for taskId=${taskId}, type=${type} — caching for 5s`);
      
      if (!this.pendingNotifications.has(taskId)) {
        this.pendingNotifications.set(taskId, []);
        setTimeout(() => this.pendingNotifications.delete(taskId), 5000);
      }
      this.pendingNotifications.get(taskId).push(notification);


      if (type === 'done' || type === 'error') {
        let chatId = (chatWsServer ? chatWsServer.taskChatMap.get(taskId) : null) || data?.meta?.chatId || this._findChatForTask(taskId);
        if (chatId) {
          if (chatWsServer) chatWsServer.taskChatMap.delete(taskId);
          fetchTaskResult(this.mcpProxy, taskId).then(result => {
            let text = result.content?.[0]?.text || '';
            let jsonStr = result.content?.find(c => c.text?.startsWith('__RESULT_JSON__:'))?.text;
            let parsedResult = jsonStr ? JSON.parse(jsonStr.substring(16)) : null;
            this._persistFinalTaskResult(chatId, text, data?.meta?.startedAt, parsedResult);
            getStateGraph().updateChatTask(chatId, null);
          }).catch(err => {
            console.error(`[TaskRouter] Failed to fetch final task result:`, err.message);
            getStateGraph().updateChatTask(chatId, null);
          });
        }
      }
      return;
    }

    console.log(`💬 [TaskNotify] Routing to ${clients.size} client(s)`);

    let method = type === 'done' ? 'chat.done'
      : type === 'error' ? 'chat.error'
      : 'chat.event';

    if (type === 'done' || type === 'error') {
      let chatId = chatWsServer.taskChatMap.get(taskId) || data?.meta?.chatId || this._findChatForTask(taskId);
      if (chatId) chatWsServer.taskChatMap.delete(taskId);

      // IMMEDIATELY notify WS clients so UI can finalize streaming state.
      // Never block notification delivery on fetchTaskResult (which can timeout).
      if (chatWsServer) {
        chatWsServer.broadcastTaskEvent(taskId, method, { taskId });
      }

      // Then fetch + persist the rich parsed result in background
      fetchTaskResult(this.mcpProxy, taskId).then(result => {
        let text = result.content?.[0]?.text || '';
        let jsonStr = result.content?.find(c => c.text?.startsWith('__RESULT_JSON__:'))?.text;
        let parsedResult = jsonStr ? JSON.parse(jsonStr.substring(16)) : null;

        if (chatId) {
          this._persistFinalTaskResult(chatId, text, data?.meta?.startedAt, parsedResult);
          getStateGraph().updateChatTask(chatId, null);
        }
      }).catch(err => {
        console.error(`[TaskRouter] Failed to fetch final task result:`, err.message);
        if (chatId) getStateGraph().updateChatTask(chatId, null);
      }).finally(() => {
        if (chatWsServer) chatWsServer.unsubscribe(taskId);
      });
    } else {

      if (chatWsServer) {
        chatWsServer.broadcastTaskEvent(taskId, method, { taskId, event: data });
      }
    }
  }

  replayCachedNotifications(taskId) {
    let cached = this.pendingNotifications.get(taskId);
    if (cached && cached.length > 0) {
      console.log(`💬 [Chat] Replaying ${cached.length} cached notification(s) for taskId=${taskId}`);
      
      // Separate terminal notifications (done/error) from streaming events
      let streamingNotes = [];
      let terminalNotes = [];
      for (let note of cached) {
        let type = note.params?.type;
        if (type === 'done' || type === 'error') {
          terminalNotes.push(note);
        } else {
          streamingNotes.push(note);
        }
      }

      // Replay streaming events immediately
      for (let note of streamingNotes) {
        this.route(note);
      }

      // Delay terminal notifications so UI can process intermediate events first
      if (terminalNotes.length > 0) {
        setTimeout(() => {
          for (let note of terminalNotes) {
            this.route(note);
          }
        }, 200);
      }

      this.pendingNotifications.delete(taskId);
    }
  }

  _findChatForTask(taskId) {
    let sg = getStateGraph();
    let chats = sg.listChats();
    for (let chat of chats) {
      if (chat.pendingTaskId === taskId) {
        return chat.id;
      }
    }
    return null;
  }

  /**
   * @param {string} chatId 
   * @param {string} text 
   * @param {number} startedAt 
   * @param {object} parsedResult
   */
  _persistFinalTaskResult(chatId, text, startedAt, parsedResult) {
    let sg = getStateGraph();
    let chat = sg.getChat(chatId);
    if (!chat) return;

    let msgs = [...(chat.messages || [])];
    

    msgs = msgs.filter(m => 
      !(m.role === 'system' && (m.text.startsWith('⏳') || m.text.startsWith('✅')))
      && !(m.role === 'thinking' && !m.done)
    );

    // Remove old streaming tool blocks from UI
    msgs = msgs.filter(m => !(m.role === 'tool' && m.streaming));

    if (parsedResult?.toolCalls?.length > 0) {
      for (let i = 0; i < parsedResult.toolCalls.length; i++) {
        let call = parsedResult.toolCalls[i];
        let tRes = parsedResult.toolResults?.[i];
        msgs.push({
          role: 'tool',
          name: call.name,
          input: call.args,
          result: tRes ? (tRes.output || tRes.status) : null,
          streaming: false
        });
      }
    }

    let meta = {};
    if (text) {
      let lastAgent = [...msgs].reverse().find(m => m.role === 'agent');
      if (!lastAgent || !lastAgent.streaming) {
        let body = text;
        let startIdx = body.indexOf('## Agent Response');
        if (startIdx >= 0) {
          body = body.substring(startIdx + '## Agent Response'.length).trim();
        }
        let endIdx = body.search(/\n+(?:---|## Tools Used|## Errors|## Stats)/i);
        if (endIdx > 0) {
          body = body.substring(0, endIdx).trim();
        }
        msgs.push({ role: 'agent', text: body, streaming: false });
      } else {
        lastAgent.streaming = false;
      }

      let modeMatch = text.match(/- Mode:\s*(.+)/i);
      if (modeMatch) meta.mode = modeMatch[1].trim();
      let sidMatch = text.match(/- Session ID:\s*`([^`]+)`/i);
      if (sidMatch) {
        meta.sessionId = sidMatch[1];
        sg.updateChatSession(chatId, meta.sessionId);
      }
      let exitMatch = text.match(/- Exit code:\s*(\d+)/i);
      if (exitMatch) meta.exitCode = parseInt(exitMatch[1], 10);
      let toolsMatch = text.match(/## Tools Used \((\d+)\)/i);
      if (toolsMatch) meta.tools = parseInt(toolsMatch[1], 10);
      let tokensMatch = text.match(/- Tokens:\s*(\d+)/i);
      if (tokensMatch) meta.tokens = parseInt(tokensMatch[1], 10);
      let costMatch = text.match(/- Cost:\s*\$?([\d.]+)/i);
      if (costMatch) meta.cost = parseFloat(costMatch[1]);
      let errorsMatch = text.match(/## Errors\n+([\s\S]*?)(?=\n+##|$)/i);
      if (errorsMatch) meta.errors = errorsMatch[1].trim();
      let failMatch = text.match(/## \[ERR\] Agent Failed[\s\S]*?(?=\n+##|$)/i);
      if (failMatch) meta.errors = failMatch[0].trim();
    }

    let elapsedSec = startedAt ? Math.round((Date.now() - startedAt) / 1000) : 0;
    msgs.push({
      role: 'thinking',
      elapsed: elapsedSec,
      done: true,
      meta: Object.keys(meta).length > 0 ? meta : null
    });

    sg.replaceChatMessages(chatId, msgs);
    sg.updateChatTask(chatId, null);
    

    let lastTaskStatus = 'done';
    if (meta.exitCode !== undefined && meta.exitCode !== 0) {
      lastTaskStatus = 'error';
    }
    sg.updateChat(chatId, { lastTaskStatus });


    this.mcpProxy.broadcastMonitor({ jsonrpc: '2.0', method: 'patch', params: { path: 'chats.updated', value: chatId } });
  }
}

export default TaskRouter;
