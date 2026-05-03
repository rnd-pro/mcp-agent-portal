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
    if (meta && type !== 'event') {
      let ops = [{ op: 'set', path: `tasks/${taskId}`, value: {
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
        let chatId = (chatWsServer ? chatWsServer.taskChatMap.get(taskId) : null) || this._findChatForTask(taskId);
        if (chatId) {
          if (chatWsServer) chatWsServer.taskChatMap.delete(taskId);
          fetchTaskResult(this.mcpProxy, taskId).then(result => {
            let text = result.content?.[0]?.text || '';
            this._persistFinalTaskResult(chatId, text, data?.meta?.startedAt);
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
      let chatId = chatWsServer.taskChatMap.get(taskId) || this._findChatForTask(taskId);
      if (chatId) chatWsServer.taskChatMap.delete(taskId);

      fetchTaskResult(this.mcpProxy, taskId).then(result => {
        let text = result.content?.[0]?.text || '';
        

        if (chatId) {
          this._persistFinalTaskResult(chatId, text, data?.meta?.startedAt);
          getStateGraph().updateChatTask(chatId, null);
        }


        if (chatWsServer) {
          chatWsServer.broadcastTaskEvent(taskId, method, { taskId, text });
          chatWsServer.unsubscribe(taskId);
        }
      }).catch(err => {
        console.error(`[TaskRouter] Failed to fetch final task result:`, err.message);
        if (chatWsServer) chatWsServer.unsubscribe(taskId);
        if (chatId) getStateGraph().updateChatTask(chatId, null);
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
      for (let note of cached) {
        this.route(note);
      }
      this.pendingNotifications.delete(taskId);
    }
  }

  _findChatForTask(taskId) {
    let sg = getStateGraph();
    let state = sg.getState();
    if (!state.chats) return null;
    for (let chatId in state.chats) {
      if (state.chats[chatId].pendingTaskId === taskId) {
        return chatId;
      }
    }
    return null;
  }

  /**
   * @param {string} chatId 
   * @param {string} text 
   * @param {number} startedAt 
   */
  _persistFinalTaskResult(chatId, text, startedAt) {
    let sg = getStateGraph();
    let chat = sg.getChat(chatId);
    if (!chat) return;

    let msgs = [...(chat.messages || [])];
    

    msgs = msgs.filter(m => 
      !(m.role === 'system' && (m.text.startsWith('⏳') || m.text.startsWith('✅')))
      && !(m.role === 'thinking' && !m.done)
      && !(m.role === 'tool')
    );

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
