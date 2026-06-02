import { WebSocketServer } from 'ws';
import path from 'node:path';
import { getStateGraph } from '../state-graph.js';
import { fetchTaskResult } from './mcp-helpers.js';

const DEFAULT_CHAT_AGENT = 'orchestrator';

/** WebSocket server for chat-based agent interactions. */
export class ChatWsServer {
  /**
   * @param {object} mcpProxy - Reference to the main proxy manager
   */
  constructor(mcpProxy) {
    this.mcpProxy = mcpProxy;
    /** @type {Map<string, Set<import('ws').WebSocket>>} taskId → chat WS clients */
    this.chatSubscriptions = new Map();
    /** @type {Map<string, string>} taskId → chatId */
    this.taskChatMap = new Map();
  }

  handleUpgrade(req, socket, head) {
    let wss = new WebSocketServer({ noServer: true });
    wss.handleUpgrade(req, socket, head, (ws) => {
      ws.on('message', async (data) => {
        try {
          let msg = JSON.parse(data.toString());
          if (msg.method === 'chat.send') {
            await this._handleChatSend(ws, msg.params || {});
          } else if (msg.method === 'chat.resume') {
            await this._handleChatResume(ws, msg.params || {});
          } else if (msg.method === 'chat.cancel') {
            await this._handleChatCancel(ws, msg.params || {});
          }
        } catch (e) {
          console.error('[ChatWS] Message handler error:', e);
          if (ws.readyState === 1) {
            ws.send(JSON.stringify({ method: 'chat.error', params: { error: e.message || 'Internal error' } }));
          }
        }
      });

      ws.on('close', () => {
        for (let [taskId, clients] of this.chatSubscriptions) {
          clients.delete(ws);
          if (clients.size === 0) this.chatSubscriptions.delete(taskId);
        }
      });
    });
  }

  async _handleChatSend(ws, params) {
    let { chatId, prompt, sessionId, timeout, model, provider, approval_mode, resource_group, context_mode } = params;
    let agentSlug = params.agent || params.agent_slug || DEFAULT_CHAT_AGENT;
    if (!prompt) return;

    let sg = getStateGraph();
    if (!chatId || !sg.getChat(chatId)) {
      let cwd = params.cwd || this.mcpProxy.projectRoot;
      let proj = sg.addProject({ path: cwd, name: path.basename(cwd) });

      let chat = sg.createChat({
        name: prompt.substring(0, 40) + (prompt.length > 40 ? '...' : ''),
        projectId: proj.id,
        agent: agentSlug && agentSlug !== 'none' ? agentSlug : null,
        provider: provider || null,
        model: model || null,
        approval_mode: approval_mode || null
      });
      chatId = chat.id;
      sg.appendChatMessage(chatId, { role: 'user', content: prompt });
    }

    let resolvedCwd = params.cwd;
    if (!resolvedCwd) {
      let chat = sg.getChat(chatId);
      if (chat?.projectId) {
        let proj = sg.get(`projects/${chat.projectId}`);
        if (proj?.path) resolvedCwd = proj.path;
      }
    }
    if (!resolvedCwd) resolvedCwd = this.mcpProxy.projectRoot !== '/' ? this.mcpProxy.projectRoot : process.env.HOME;


    if (!provider || !model || !sessionId) {
      let chatData = sg.getChat(chatId);
      if (chatData) {
        if (!provider && chatData.provider) provider = chatData.provider;
        if (!model && chatData.model) model = chatData.model;
        if (!sessionId && chatData.sessionId) sessionId = chatData.sessionId;
        if (!approval_mode && chatData.approval_mode) approval_mode = chatData.approval_mode;
        if (!resource_group && chatData.resource_group) resource_group = chatData.resource_group;
        if ((!agentSlug || agentSlug === 'none') && chatData.agent) agentSlug = chatData.agent;
      }
    }

    if (resource_group && resource_group !== 'none') {
      provider = null;
      model = null;
    }
    
    let delegateArgs = { prompt, timeout: timeout || 600, cwd: resolvedCwd };
    if (sessionId) delegateArgs.session_id = sessionId;
    if (model) delegateArgs.model = model;
    if (provider) delegateArgs.provider = provider;
    if (approval_mode) delegateArgs.approval_mode = approval_mode;
    if (resource_group && resource_group !== 'none') delegateArgs.resource_group = resource_group;
    if (context_mode === 'auto' || context_mode === 'off') delegateArgs.context_mode = context_mode;
    if (Array.isArray(params.files)) {
      let files = [...new Set(params.files.map(file => String(file || '').trim()).filter(Boolean))];
      if (files.length) delegateArgs.files = files;
    }
    
    // Agent selection: read from UI/MCP chat params or persisted chat metadata.
    if (agentSlug && agentSlug !== 'none') {
      delegateArgs.agent_slug = agentSlug;
      delegateArgs.chat_id = chatId;
    }

    try {
      let result = await this.mcpProxy.requestFromChild('agent-pool', 'tools/call', {
        name: 'delegate_task',
        arguments: delegateArgs,
      });
      let delegateText = result.content?.[0]?.text || '';
      
      if (result.isError) {
        console.error('[Chat] delegate_task returned an error state:', delegateText);
        if (ws.readyState === 1) {
          ws.send(JSON.stringify({ method: 'chat.error', params: { chatId, error: delegateText } }));
        }
        return;
      }

      let taskIdMatch = delegateText.match(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/);
      let taskId = taskIdMatch?.[1];

      if (taskId) {
        this.subscribe(taskId, ws, chatId);
        getStateGraph().updateChatTask(chatId, taskId);

                if (this.mcpProxy.taskRouter) {
          this.mcpProxy.taskRouter.replayCachedNotifications(taskId);
        }
      }
      
      ws.send(JSON.stringify({
        method: 'chat.delegated',
        params: { chatId, taskId, text: delegateText },
      }));
    } catch (err) {
      console.error('[Chat] Error in delegate_task:', err);
      if (ws.readyState === 1) {
        ws.send(JSON.stringify({ method: 'chat.error', params: { chatId, error: err.message || 'Server error' } }));
      }
    }
  }

  async _handleChatResume(ws, params) {
    let { chatId, taskId } = params;
    if (!taskId) return;

    this.subscribe(taskId, ws, chatId);

    try {
      let result = await fetchTaskResult(this.mcpProxy, taskId);
      let text = result.content?.find(c => c.text && !c.text.startsWith('__EVENTS__:'))?.text || '';
      
      if (text && !text.includes('still running')) {
        if (text.includes('Task not found')) {
          this._recoverLostTask(ws, chatId, taskId);
        } else {
          ws.send(JSON.stringify({ method: 'chat.done', params: { chatId, taskId } }));
          this.unsubscribe(taskId);
          getStateGraph().updateChatTask(chatId, null);
        }
      } else {
        // Task still running — client will start pulling messages via /api/chats/get
        ws.send(JSON.stringify({ method: 'chat.resumed', params: { chatId, taskId, status: 'running' } }));
      }
    } catch (err) {
      console.error('[Chat] Failed to fetch task result for resume:', err.message);
      this._recoverLostTask(ws, chatId, taskId);
    }
  }

  /**
   * Recover a lost task from StateGraph cached events.
   * When agent-pool restarts, tasks are lost from memory but their streaming
   * events are persisted in StateGraph via WAL.
   */
  _recoverLostTask(ws, chatId, taskId) {
    let sg = getStateGraph();
    let task = sg.get(`tasks/${taskId}`);
    // No need to replay raw events — chat.messages[] is already persisted
    // by TaskRouter._appendEventToChat. Client fetches via /api/chats/get.

    // Check if the task had a final status (done/error) in StateGraph
    let status = task?.status;
    if (status === 'done' || status === 'error' || status === 'lost') {
      // Task already completed — send done with whatever we have
      let errorMsg = task?.error;
      if (status === 'lost' && errorMsg) {
        ws.send(JSON.stringify({ method: 'chat.error', params: { taskId, text: `Task was lost: ${errorMsg}` } }));
      } else {
        ws.send(JSON.stringify({ method: 'chat.done', params: { taskId } }));
      }
      this.unsubscribe(taskId);
      sg.updateChatTask(chatId, null);
    } else {
      // Task status unknown — check if PID is still alive
      let pid = task?.pid;
      let alive = false;
      if (pid) {
        try { process.kill(pid, 0); alive = true; } catch (e) { /* dead */ }
      }
      if (alive) {
        ws.send(JSON.stringify({ method: 'chat.error', params: { taskId, text: 'Agent process is still running but connection was lost after server restart. Results will not be captured. Please try again.' } }));
      } else {
        ws.send(JSON.stringify({ method: 'chat.error', params: { taskId, text: 'Task was lost (server restart). Please try again.' } }));
      }
      this.unsubscribe(taskId);
      sg.updateChatTask(chatId, null);
    }
  }

  async _handleChatCancel(ws, params) {
    let { chatId, taskId } = params;
    if (!taskId && chatId) {
      let chat = getStateGraph().getChat(chatId);
      taskId = chat?.pendingTaskId;
    }
    if (taskId) {
      try {
        await this.mcpProxy.requestFromChild('agent-pool', 'tools/call', {
          name: 'cancel_task',
          arguments: { task_id: taskId }
        });
      } catch (e) { console.error('Failed to cancel task:', e); }
    }
  }

  subscribe(taskId, ws, chatId) {
    if (!this.chatSubscriptions.has(taskId)) {
      this.chatSubscriptions.set(taskId, new Set());
    }
    this.chatSubscriptions.get(taskId).add(ws);
    if (chatId) {
      this.taskChatMap.set(taskId, chatId);
    }
  }

  unsubscribe(taskId) {
    this.chatSubscriptions.delete(taskId);
  }

  broadcastTaskEvent(taskId, method, params) {
    let clients = this.chatSubscriptions.get(taskId);
    if (clients) {
      // Include chatId so the client can filter events by chat ownership
      let chatId = params.chatId ?? this.taskChatMap.get(taskId);
      let payload = JSON.stringify({ method, params: { ...params, chatId } });
      for (let client of clients) {
        if (client.readyState === 1) {
          client.send(payload);
        }
      }
    }
  }
}

export default ChatWsServer;
