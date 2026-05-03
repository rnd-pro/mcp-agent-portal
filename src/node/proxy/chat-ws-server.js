import { WebSocketServer } from 'ws';
import path from 'node:path';
import { getStateGraph } from '../state-graph.js';
import { fetchTaskResult } from './mcp-helpers.js';

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
          console.error('❌ [ChatWS] Message handler error:', e);
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
    let { chatId, prompt, sessionId, timeout, model, provider } = params;
    console.log(`💬 [Chat] Received chat.send for chatId=${chatId}, provider=${provider}, model=${model}`);
    if (!prompt) return;

    let sg = getStateGraph();
    if (!chatId || !sg.getChat(chatId)) {
      let cwd = params.cwd || this.mcpProxy.projectRoot;
      let proj = sg.addProject({ path: cwd, name: path.basename(cwd) });

      let chat = sg.createChat({ 
        name: prompt.substring(0, 40) + (prompt.length > 40 ? '...' : ''),
        projectId: proj.id
      });
      chatId = chat.id;
      sg.appendChatMessage(chatId, { role: 'user', content: prompt });
      console.log(`💬 [Chat] Created new chat ${chatId} for CLI request in project ${proj.id}`);
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
      }
    }
    
    let delegateArgs = { prompt, timeout: timeout || 600, cwd: resolvedCwd };
    if (sessionId) delegateArgs.session_id = sessionId;
    if (model) delegateArgs.model = model;
    if (provider) delegateArgs.provider = provider;

    try {
      console.log(`💬 [Chat] Calling delegate_task...`, delegateArgs);
      let result = await this.mcpProxy.requestFromChild('agent-pool', 'tools/call', {
        name: 'delegate_task',
        arguments: delegateArgs,
      });
      
      console.log(`💬 [Chat] delegate_task returned`, result);
      let delegateText = result.content?.[0]?.text || '';
      
      if (result.isError) {
        console.error(`❌ [Chat] delegate_task returned an error state:`, delegateText);
        if (ws.readyState === 1) {
          ws.send(JSON.stringify({ method: 'chat.error', params: { chatId, error: delegateText } }));
        }
        return;
      }

      let taskIdMatch = delegateText.match(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/);
      let taskId = taskIdMatch?.[1];

      if (taskId) {
        console.log(`💬 [Chat] Subscribing WS to taskId=${taskId}`);
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
      console.error(`❌ [Chat] Error in delegate_task:`, err);
      if (ws.readyState === 1) {
        ws.send(JSON.stringify({ method: 'chat.error', params: { chatId, error: err.message || 'Server error' } }));
      }
    }
  }

  async _handleChatResume(ws, params) {
    let { chatId, taskId } = params;
    if (!taskId) return;

    console.log(`💬 [Chat] Resuming subscription for taskId=${taskId}, chatId=${chatId}`);
    this.subscribe(taskId, ws, chatId);

    try {
      let result = await fetchTaskResult(this.mcpProxy, taskId);
      
      let text = result.content?.[0]?.text || '';
      if (text && !text.includes('still running')) {
        if (text.includes('Task not found')) {
          ws.send(JSON.stringify({ method: 'chat.error', params: { taskId, text: 'Task was lost (e.g. server restart). Please try again.' } }));
        } else {
          ws.send(JSON.stringify({ method: 'chat.done', params: { taskId, text } }));
        }
        this.unsubscribe(taskId);
        getStateGraph().updateChatTask(chatId, null);
      } else {
        ws.send(JSON.stringify({ method: 'chat.resumed', params: { taskId, status: 'running' } }));
      }
    } catch (err) {
      console.error(`❌ [Chat] Failed to fetch task result for resume:`, err.message);
      ws.send(JSON.stringify({ method: 'chat.error', params: { taskId, text: 'Failed to load task state: ' + err.message } }));
    }
  }

  async _handleChatCancel(ws, params) {
    let { chatId, taskId } = params;
    if (!taskId && chatId) {
      let chat = getStateGraph().getChat(chatId);
      taskId = chat?.pendingTaskId;
    }
    if (taskId) {
      console.log(`💬 [Chat] Canceling task: ${taskId} for chat ${chatId}`);
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
      let payload = JSON.stringify({ method, params });
      for (let client of clients) {
        if (client.readyState === 1) {
          client.send(payload);
        }
      }
    }
  }
}

export default ChatWsServer;
