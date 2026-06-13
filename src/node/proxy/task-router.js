import { getStateGraph } from '../state-graph.js';
import { fetchTaskResult } from './mcp-helpers.js';
import {
  createPortalTransactionKey,
  extractPortalProjectTransactions,
} from '../project-transactions.js';

const TERMINAL_TYPES = new Set(['done', 'error', 'cancelled']);

export function isTerminalTaskNotificationType(type) {
  return TERMINAL_TYPES.has(type);
}

export function extractFinalAgentResponse(text = '') {
  let body = text || '';
  let startIdx = body.indexOf('## Agent Response');
  if (startIdx >= 0) {
    body = body.substring(startIdx + '## Agent Response'.length).trim();
  }
  let endIdx = body.search(/\n+(?:---|## Tools Used|## Errors|## Stats)/i);
  if (endIdx > 0) {
    body = body.substring(0, endIdx).trim();
  }
  return body;
}

function formatProviderProfile(profile = {}) {
  let provider = profile.provider || 'provider';
  let model = profile.model || 'default';
  return `${provider}/${model}`;
}

export function formatProviderFallbackMessage(event = {}) {
  let from = formatProviderProfile(event.from);
  let to = formatProviderProfile(event.to);
  let suffix = event.reason ? ` Reason: ${event.reason}` : '';
  return `Provider fallback: ${from} -> ${to}.${suffix}`;
}

/** Routes task notifications from child servers to WebSocket subscribers. */
export class TaskRouter {
  /**
   * @param {object} mcpProxy - Reference to the main proxy manager
   */
  constructor(mcpProxy) {
    this.mcpProxy = mcpProxy;
    /** @type {Map<string, object[]>} taskId → cached notifications before subscription */
    this.pendingNotifications = new Map();
    /** @type {Map<string, object>} taskId → streaming state for live message building */
    this._streamState = new Map();
  }

  /**
   * @param {object} notification
   */
  route(notification) {
    let { taskId, type, data } = notification.params || {};
    if (!taskId) return;

    let sg = getStateGraph();
    let meta = data?.meta;

    // Cache ALL events in StateGraph for delta sync and recovery
    if (type === 'event' && data) {
      try {
        // Compact event summary for ring buffer (but keep enough for UI rendering)
        let summary = {
          type: data.type ?? 'unknown',
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
        if (data.type === 'provider_fallback') {
          if (data.from) summary.from = data.from;
          if (data.to) summary.to = data.to;
          if (data.reason) summary.reason = data.reason;
          if (data.resourceGroup) summary.resourceGroup = data.resourceGroup;
          if (data.attempt) summary.attempt = data.attempt;
          if (data.total) summary.total = data.total;
        }

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

      if (isTerminalTaskNotificationType(type)) {
        setTimeout(() => {
          try { sg.del(`tasks/${taskId}`, 'task-ttl'); } catch (e) { console.warn(`[TaskNotify] TTL cleanup failed for ${taskId}:`, e.message); }
        }, 10 * 60 * 1000);
      }
      try { sg.commit(ops, `agent-pool:${type}`); } catch (err) {
        console.error(`[TaskNotify] StateGraph commit failed for ${taskId}:`, err.message);
      }
    }

    let chatWsServer = this.mcpProxy.chatWsServer;
    let chatId = chatWsServer?.taskChatMap.get(taskId) ?? data?.meta?.chatId ?? this._findChatForTask(taskId);

    // ── Phase 1: Atomically update chat.messages[] on server ──
    let metaDelta = null;
    if (type === 'event' && data && chatId) {
      metaDelta = this._appendEventToChat(chatId, taskId, data);
    }

    let clients = chatWsServer ? chatWsServer.chatSubscriptions.get(taskId) : null;

    if (!clients || clients.size === 0) {
      if (!this.pendingNotifications.has(taskId)) {
        this.pendingNotifications.set(taskId, []);
        setTimeout(() => this.pendingNotifications.delete(taskId), 5000);
      }
      this.pendingNotifications.get(taskId).push(notification);


      if (isTerminalTaskNotificationType(type)) {
        if (chatId) {
          if (chatWsServer) chatWsServer.taskChatMap.delete(taskId);
          this._streamState.delete(taskId);
          if (type === 'cancelled') {
            this._finalizeCancelledTask(chatId, taskId, chatWsServer);
            return;
          }
          fetchTaskResult(this.mcpProxy, taskId).then(result => {
            let text = result.content?.[0]?.text ?? '';
            let jsonStr = result.content?.find(c => c.text?.startsWith('__RESULT_JSON__:'))?.text;
            let parsedResult = jsonStr ? JSON.parse(jsonStr.substring(16)) : null;
            this._persistFinalTaskResult(chatId, taskId, text, data?.meta?.startedAt, parsedResult);
            getStateGraph().updateChatTask(chatId, null, { expectedTaskId: taskId });
          }).catch(err => {
            console.error(`[TaskRouter] Failed to fetch final task result:`, err.message);
            getStateGraph().updateChatTask(chatId, null, { expectedTaskId: taskId });
          });
        }
      }
      return;
    }

    if (isTerminalTaskNotificationType(type)) {
      if (type === 'cancelled') {
        if (chatId) chatWsServer.taskChatMap.delete(taskId);
        this._streamState.delete(taskId);
        this._finalizeCancelledTask(chatId, taskId, chatWsServer);
        return;
      }

      // Clean up streaming state
      this._streamState.delete(taskId);

      let method = type === 'done' ? 'chat.done' : 'chat.error';
      fetchTaskResult(this.mcpProxy, taskId).then(result => {
        let text = result.content?.[0]?.text ?? '';
        let jsonStr = result.content?.find(c => c.text?.startsWith('__RESULT_JSON__:'))?.text;
        let parsedResult = jsonStr ? JSON.parse(jsonStr.substring(16)) : null;

        if (chatId) {
          this._persistFinalTaskResult(chatId, taskId, text, data?.meta?.startedAt, parsedResult);
          getStateGraph().updateChatTask(chatId, null, { expectedTaskId: taskId });
        }
        if (chatWsServer) {
          chatWsServer.broadcastTaskEvent(taskId, method, { taskId, chatId });
        }
      }).catch(err => {
        console.error(`[TaskRouter] Failed to fetch final task result:`, err.message);
        if (chatId) getStateGraph().updateChatTask(chatId, null, { expectedTaskId: taskId });
        if (chatWsServer) {
          chatWsServer.broadcastTaskEvent(taskId, 'chat.error', {
            taskId,
            chatId,
            error: 'Failed to fetch final task result',
          });
        }
      }).finally(() => {
        if (chatId) chatWsServer.taskChatMap.delete(taskId);
        if (chatWsServer) chatWsServer.unsubscribe(taskId);
      });
    } else {
      // ── Phase 2: Send only meta-delta, NOT raw event data ──
      if (chatWsServer && metaDelta) {
        chatWsServer.broadcastTaskEvent(taskId, 'chat.meta', metaDelta);
      }
    }
  }

  /**
   * Atomically append a streaming event to chat.messages[] in StateGraph.
   * Returns a meta-delta object for WS broadcast (lightweight, no content).
   * 
   * @param {string} chatId
   * @param {string} taskId
   * @param {object} data - Raw event from agent-pool
   * @returns {object|null} Meta-delta for WS broadcast
   */
  _appendEventToChat(chatId, taskId, data) {
    let sg = getStateGraph();
    let chat = sg.getChat(chatId);
    if (!chat) return null;

    let msgs = chat.messages || [];
    let state = this._streamState.get(taskId) || { phase: 'thinking' };
    let changed = false;

    switch (data.type) {
      case 'message': {
        if (data.role === 'system') {
          // System status — update thinking indicator status
          state.phase = 'thinking';
          state.thinkingStatus = data.content ?? '';
          // Don't persist transient system messages to chat.messages
        } else if (data.role === 'assistant') {
          let text = data.content ?? data.text ?? '';
          if (!text) break;
          state.phase = 'responding';

          // Find or create the streaming agent message
          let lastIdx = msgs.length - 1;
          let last = lastIdx >= 0 ? msgs[lastIdx] : null;
          if (last && last.role === 'agent' && last.streaming) {
            // Replace content from cumulative CLI delivery.
            msgs[lastIdx] = { ...last, text };
          } else {
            msgs.push({ role: 'agent', text, streaming: true });
          }
          changed = true;
        }
        break;
      }

      case 'tool_use': {
        let toolName = data.name ?? data.tool_name ?? data.toolCall?.name ?? data.tool_call?.name ?? data.function?.name ?? data.part?.name ?? data.part?.tool ?? 'unknown';
        let input = data.parameters ?? data.arguments ?? data.toolCall?.arguments ?? data.tool_call?.arguments ?? data.part?.parameters ?? data.part?.state?.input ?? {};
        
        state.phase = 'tool';
        state.lastToolName = toolName;

        msgs.push({
          role: 'tool',
          name: toolName,
          input,
          result: null,
          streaming: true,
        });
        changed = true;
        break;
      }

      case 'tool_result': {
        let result = data.output ?? data.status ?? '';
        state.phase = 'responding';

        // Find the last streaming tool and close it
        for (let i = msgs.length - 1; i >= 0; i--) {
          if (msgs[i].role === 'tool' && msgs[i].streaming) {
            msgs[i] = { ...msgs[i], result, streaming: false };
            changed = true;
            break;
          }
        }
        break;
      }

      case 'error': {
        let errText = data.message ?? data.error ?? JSON.stringify(data);
        msgs.push({ role: 'system', text: `Error: ${errText}` });
        changed = true;
        break;
      }

      case 'provider_fallback': {
        let text = formatProviderFallbackMessage(data);
        state.phase = 'thinking';
        state.thinkingStatus = text;
        msgs.push({ role: 'system', text });
        changed = true;
        break;
      }
    }

    this._streamState.set(taskId, state);

    if (changed) {
      sg.replaceChatMessages(chatId, msgs);
    }

    return {
      chatId,
      taskId,
      phase: state.phase,
      messageCount: msgs.length,
      lastToolName: state.lastToolName ?? null,
      thinkingStatus: state.thinkingStatus ?? null,
    };
  }

  replayCachedNotifications(taskId) {
    let cached = this.pendingNotifications.get(taskId);
    if (cached && cached.length > 0) {
      // Separate terminal notifications from streaming events
      let streamingNotes = [];
      let terminalNotes = [];
      for (let note of cached) {
        let type = note.params?.type;
        if (isTerminalTaskNotificationType(type)) {
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

  _finalizeCancelledTask(chatId, taskId, chatWsServer = this.mcpProxy.chatWsServer) {
    if (chatWsServer) {
      chatWsServer.broadcastTaskEvent(taskId, 'chat.error', {
        taskId,
        chatId,
        status: 'cancelled',
        error: 'Task cancelled',
      });
      chatWsServer.unsubscribe(taskId);
    }

    if (!chatId) return;

    let sg = getStateGraph();
    let chat = sg.getChat(chatId);
    if (chat) {
      let msgs = (chat.messages || []).map((message) => (
        message.streaming ? { ...message, streaming: false } : message
      ));
      sg.replaceChatMessages(chatId, msgs);
    }
    sg.updateChatTask(chatId, null, { expectedTaskId: taskId });
    sg.updateChat(chatId, { lastTaskStatus: 'cancelled' });
    this.mcpProxy.broadcastMonitor?.({ jsonrpc: '2.0', method: 'patch', params: { path: 'chats.updated', value: chatId } });
  }

  /**
   * @param {string} chatId 
   * @param {string} taskId
   * @param {string} text
   * @param {number} startedAt
   * @param {object} parsedResult
   */
  _persistFinalTaskResult(chatId, taskId, text, startedAt, parsedResult) {
    let sg = getStateGraph();
    let chat = sg.getChat(chatId);
    if (!chat) return;

    let msgs = [...(chat.messages || [])];
    

    msgs = msgs.filter(m => 
      !(m.role === 'system' && (m.text.startsWith('Waiting') || m.text.startsWith('Done')))
      && !(m.role === 'thinking' && !m.done)
    );

    // Remove old streaming tool blocks from UI
    msgs = msgs.filter(m => !(m.role === 'tool' && m.streaming));

    if (parsedResult?.toolCalls?.length > 0) {
      let toolMessages = [];
      for (let i = 0; i < parsedResult.toolCalls.length; i++) {
        let call = parsedResult.toolCalls[i];
        let tRes = parsedResult.toolResults?.[i];
        toolMessages.push({
          role: 'tool',
          name: call.name,
          input: call.args,
          result: tRes ? (tRes.output ?? tRes.status) : null,
          streaming: false,
        });
      }
      let lastStreamingAgentIndex = msgs.findLastIndex(m => m.role === 'agent' && m.streaming);
      if (lastStreamingAgentIndex >= 0) {
        msgs.splice(lastStreamingAgentIndex, 0, ...toolMessages);
      } else {
        msgs.push(...toolMessages);
      }
    }

    let meta = {};
    if (text) {
      let body = extractFinalAgentResponse(text);
      let lastAgent = [...msgs].reverse().find(m => m.role === 'agent');
      if (!lastAgent || !lastAgent.streaming) {
        msgs.push({ role: 'agent', text: body, streaming: false });
      } else {
        lastAgent.text = body || lastAgent.text;
        lastAgent.streaming = false;
      }

      let modeMatch = text.match(/- Mode:\s*(.+)/i);
      if (modeMatch) meta.mode = modeMatch[1].trim();
      let sidMatch = text.match(new RegExp('- Session ID:\\s*`([^`]+)`', 'i'));
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

    // Finalize all streaming flags
    msgs = msgs.map(m => m.streaming ? { ...m, streaming: false } : m);

    sg.replaceChatMessages(chatId, msgs);
    this._persistProjectTransactions(chat, taskId, text, parsedResult);
    sg.updateChatTask(chatId, null, { expectedTaskId: taskId });
    

    let lastTaskStatus = 'done';
    if (meta.exitCode !== undefined && meta.exitCode !== 0) {
      lastTaskStatus = 'error';
    }
    sg.updateChat(chatId, { lastTaskStatus });


    this.mcpProxy.broadcastMonitor({ jsonrpc: '2.0', method: 'patch', params: { path: 'chats.updated', value: chatId } });
  }

  _persistProjectTransactions(chat, taskId, text, parsedResult) {
    let projectId = chat.projectId || null;
    let applied = new Set(
      (chat.projectTransactions || []).map((transaction) => createPortalTransactionKey(projectId, transaction)),
    );
    let { accepted, rejected } = extractPortalProjectTransactions({
      text,
      parsedResult,
      projectId,
      applied,
    });

    for (let rejection of rejected) {
      console.warn('[TaskRouter] Rejected project transaction:', rejection);
    }

    let saved = getStateGraph().appendChatProjectTransactions(chat.id, accepted);
    if (saved.length === 0) return;

    for (let transaction of saved) {
      this.mcpProxy.chatWsServer?.broadcastTaskEvent(taskId, 'chat.projectTransaction', {
        taskId,
        chatId: chat.id,
        projectId,
        transaction,
      });
    }
  }
}

export default TaskRouter;
