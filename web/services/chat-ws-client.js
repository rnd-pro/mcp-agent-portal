import { ICONS } from '../common/icons.js';
import { emit as dashEmit } from '../dashboard-state.js';

/**
 * Server-authoritative chat WS client.
 * 
 * The server (TaskRouter) is the single source of truth for chat.messages[].
 * This client receives only lightweight meta-deltas (phase, messageCount, lastToolName)
 * and fetches full messages from the server on demand.
 * 
 * WS protocol:
 *   → chat.send    { chatId, prompt, ... }
 *   → chat.resume  { chatId, taskId }
 *   → chat.cancel  { chatId, taskId }
 *   ← chat.delegated  { chatId, taskId }
 *   ← chat.meta       { chatId, phase, messageCount, lastToolName }
 *   ← chat.projectTransaction { chatId, projectId, transaction }
 *   ← chat.done       { chatId, taskId }
 *   ← chat.error      { chatId, error }
 */
export class ChatWsClient {
  constructor(opts) {
    this.opts = opts;
    /*
      opts:
      getMessages: () => Array
      setMessages: (Array) => void
      onSessionId: (id) => void
      onBackgroundToggle: (isActive) => void
      onMetaHtml: (html) => void
      onDone: () => void
      onError: (errText) => void
      onMeta: ({ phase, messageCount, lastToolName, thinkingStatus }) => void
      onProjectTransaction: ({ chatId, projectId, transaction }) => void
      buildSessionMetaHtml: (text) => string
    */
    this._chatWs = null;
    /** @type {number|null} Periodic pull timer for messages during streaming */
    this._pullTimer = null;
    /** @type {number} Last known messageCount from server */
    this._lastMessageCount = 0;
  }

  _ensureChatWs() {
    if (this._chatWs && this._chatWs.readyState === WebSocket.OPEN) return this._chatWs;
    if (this._chatWs) {
      try { this._chatWs.close(); } catch (e) { /* already closed */ }
    }

    let base = new URL('.', location.href).href.replace(/^http/, 'ws');
    this._chatWs = new WebSocket(`${base}ws/chat`);
    this._chatWs.onclose = () => { this._chatWs = null; };
    this._chatWs.onerror = () => {};
    return this._chatWs;
  }

  /**
   * Fetch current messages from server and update UI.
   * @param {string} chatId
   */
  async _pullMessages(chatId) {
    try {
      let res = await fetch('/api/chats/get', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: chatId }),
      });
      if (!res.ok) return;
      let chat = await res.json();
      if (chat && chat.messages) {
        this.opts.setMessages(chat.messages);
        if (chat.sessionId && this.opts.onSessionId) {
          this.opts.onSessionId(chat.sessionId);
        }
      }
    } catch (e) {
      // Non-critical: pull failure doesn't break the flow
    }
  }

  /**
   * Start periodic message pulling during streaming.
   * @param {string} chatId
   */
  _startPull(chatId) {
    this._stopPull();
    this._pullTimer = setInterval(() => this._pullMessages(chatId), 2000);
  }

  _stopPull() {
    if (this._pullTimer) {
      clearInterval(this._pullTimer);
      this._pullTimer = null;
    }
  }

  send(chatId, prompt, chatParams, sessionId) {
    return new Promise((resolve, reject) => {
      let ws = this._ensureChatWs();
      let startTime = Date.now();
      
      // Show initial thinking indicator via onMeta
      if (this.opts.onMeta) {
        this.opts.onMeta({ phase: 'thinking', messageCount: 0, lastToolName: null, thinkingStatus: '' });
      }

      let sendMsg = () => {
        let params = { ...chatParams, chatId, prompt };
        if (!params.timeout) params.timeout = 600;
        if (sessionId) params.sessionId = sessionId;
        ws.send(JSON.stringify({ method: 'chat.send', params }));
      };

      let isFinished = false;

      let onClose = () => {
        if (isFinished) return;
        isFinished = true;
        this._stopPull();
        ws.removeEventListener('message', onMessage);
        
        this.opts.onBackgroundToggle(false);
        if (this.opts.onMeta) this.opts.onMeta(null);

        // Fetch final state from server
        this._pullMessages(chatId).then(() => {
          let msgs = [...this.opts.getMessages()];
          msgs.push({ role: 'system', text: `${ICONS.WAIT} Process crashed or connection closed unexpectedly.` });
          this.opts.setMessages(msgs);
        });
        
        resolve('');
      };
      ws.addEventListener('close', onClose);

      let onMessage = (e) => {
        try {
          let msg = JSON.parse(e.data);
          let evChatId = msg.params?.chatId;
          if (evChatId && evChatId !== chatId) return;
          
          switch (msg.method) {
            case 'chat.delegated': {
              // Server created the task — start periodic pulling for messages
              this._startPull(chatId);
              break;
            }

            case 'chat.meta': {
              // Lightweight status update — no message content
              let { phase, messageCount, lastToolName, thinkingStatus } = msg.params;
              this._lastMessageCount = messageCount;
              if (this.opts.onMeta) {
                this.opts.onMeta({ phase, messageCount, lastToolName, thinkingStatus });
              }
              break;
            }

            case 'chat.projectTransaction': {
              this.opts.onProjectTransaction?.(msg.params);
              break;
            }

            case 'chat.done': {
              isFinished = true;
              this._stopPull();
              ws.removeEventListener('message', onMessage);
              ws.removeEventListener('close', onClose);
              
              this.opts.onBackgroundToggle(false);
              if (this.opts.onMeta) this.opts.onMeta(null);

              // Fetch final messages from server — single source of truth
              setTimeout(() => {
                this._pullMessages(chatId).then(() => {
                  dashEmit("chats-updated");
                }).catch(() => {
                  dashEmit("chats-updated");
                }).finally(() => {
                  if (this.opts.onDone) this.opts.onDone();
                  resolve('');
                });
              }, 500);

              break;
            }

            case 'chat.error': {
              isFinished = true;
              this._stopPull();
              ws.removeEventListener('message', onMessage);
              ws.removeEventListener('close', onClose);
              
              this.opts.onBackgroundToggle(false);
              if (this.opts.onMeta) this.opts.onMeta(null);

              // Fetch current state from server
              this._pullMessages(chatId).then(() => {
                dashEmit("chats-updated");
                if (this.opts.onDone) this.opts.onDone();
              }).catch(() => {
                if (this.opts.onDone) this.opts.onDone();
              });

              let errText = msg.params?.text || msg.params?.error || 'Unknown error';
              resolve(errText);
              break;
            }

            case 'chat.resumed': {
              // Resume confirmed — start pulling
              this._startPull(chatId);
              break;
            }
          }
        } catch (e) { console.error('[ChatWsClient] WS message parse error:', e); }
      };

      ws.addEventListener('message', onMessage);

      let timeout = setTimeout(() => {
        this._stopPull();
        ws.removeEventListener('message', onMessage);
        resolve('');
      }, 600_000);

      if (ws.readyState === WebSocket.OPEN) {
        sendMsg();
      } else {
        ws.addEventListener('open', () => sendMsg(), { once: true });
        ws.addEventListener('error', () => {
          this._stopPull();
          ws.removeEventListener('message', onMessage);
          reject(new Error('WebSocket connection failed'));
        }, { once: true });
      }
    });
  }

  stop(chatId, taskId) {
    let ws = this._ensureChatWs();
    let sendCancel = () => {
      ws.send(JSON.stringify({ method: 'chat.cancel', params: { chatId, taskId } }));
    };
    if (ws.readyState === WebSocket.OPEN) {
      sendCancel();
    } else {
      ws.addEventListener('open', sendCancel, { once: true });
    }
  }

  resume(chatId, taskId) {
    if (this.opts.onMeta) {
      this.opts.onMeta({ phase: 'thinking', messageCount: 0, lastToolName: null, thinkingStatus: 'Reconnecting...' });
    }
    this.opts.onBackgroundToggle(true);

    let ws = this._ensureChatWs();

    let sendMsg = () => {
      ws.send(JSON.stringify({ method: 'chat.resume', params: { chatId, taskId } }));
    };

    if (ws.readyState === WebSocket.OPEN) {
      sendMsg();
    } else {
      ws.addEventListener('open', sendMsg, { once: true });
    }

    let onMessage = (e) => {
      try {
        let msg = JSON.parse(e.data);
        let evChatId = msg.params?.chatId;
        if (evChatId && evChatId !== chatId) return;

        switch (msg.method) {
          case 'chat.resumed': {
            // Resume confirmed — start periodic message pulling
            this._startPull(chatId);
            if (this.opts.onMeta) {
              this.opts.onMeta({ phase: 'thinking', messageCount: 0, lastToolName: null, thinkingStatus: 'Reconnected' });
            }
            break;
          }

          case 'chat.meta': {
            let { phase, messageCount, lastToolName, thinkingStatus } = msg.params;
            this._lastMessageCount = messageCount;
            if (this.opts.onMeta) {
              this.opts.onMeta({ phase, messageCount, lastToolName, thinkingStatus });
            }
            break;
          }

          case 'chat.projectTransaction': {
            this.opts.onProjectTransaction?.(msg.params);
            break;
          }

          case 'chat.done': {
            ws.removeEventListener('message', onMessage);
            this._stopPull();
            this.opts.onBackgroundToggle(false);
            if (this.opts.onMeta) this.opts.onMeta(null);

            // Fetch final state from server
            this._pullMessages(chatId).then(() => {
              dashEmit("chats-updated");
            }).catch(() => {
              dashEmit("chats-updated");
            }).finally(() => {
              this.opts.onDone();
            });
            break;
          }

          case 'chat.error': {
            ws.removeEventListener('message', onMessage);
            this._stopPull();
            this.opts.onBackgroundToggle(false);
            if (this.opts.onMeta) this.opts.onMeta(null);
            
            // Fetch current state from server
            this._pullMessages(chatId);

            let errText = msg.params?.text || msg.params?.error || 'Task failed';
            this.opts.onError(errText);
            break;
          }
        }
      } catch (e) { console.error('[ChatWsClient] WS message parse error:', e); }
    };
    ws.addEventListener('message', onMessage);
  }
}
