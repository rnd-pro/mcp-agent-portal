import { ICONS } from '../../common/icons.js';
import { emit as dashEmit } from '../../dashboard-state.js';

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
      buildSessionMetaHtml: (text) => string
    */
    this._chatWs = null;
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

  send(chatId, prompt, chatParams, sessionId) {
    return new Promise((resolve, reject) => {
      let ws = this._ensureChatWs();
      let startTime = Date.now();
      
      let thinkingMsg = { role: 'thinking', elapsed: 0, done: false };
      this.opts.setMessages([...this.opts.getMessages(), thinkingMsg]);

      let timerInterval = setInterval(() => {
        thinkingMsg.elapsed = Math.round((Date.now() - startTime) / 1000);
        this.opts.setMessages([...this.opts.getMessages()]);
      }, 1000);

      let sendMsg = () => {
        let params = { chatId, prompt, timeout: 600, ...chatParams };
        if (sessionId) params.sessionId = sessionId;
        console.log('[ChatWsClient] WS send params:', JSON.stringify(params));
        ws.send(JSON.stringify({ method: 'chat.send', params }));
      };

      let isFinished = false;

      let onClose = () => {
        if (isFinished) return;
        isFinished = true;
        clearInterval(timerInterval);
        ws.removeEventListener('message', onMessage);
        
        let crashMsg = `${ICONS.WAIT} Process crashed or connection closed unexpectedly.`;
        
        let msgs = this.opts.getMessages()
          .filter(m => !(m.role === 'thinking' && !m.done))
          .map(m => ({ ...m, streaming: false }));
          
        msgs.push({ role: 'system', text: crashMsg });
        this.opts.setMessages(msgs);
        this.opts.onBackgroundToggle(false);
        
        resolve(crashMsg);
      };
      ws.addEventListener('close', onClose);

      let onMessage = (e) => {
        try {
          let msg = JSON.parse(e.data);
          
          switch (msg.method) {
            case 'chat.delegated':
              break;

            case 'chat.event': {
              let ev = msg.params?.event;
              if (!ev) break;
              
              if (ev.type === 'message' && ev.role === 'system') {
                let msgs = [...this.opts.getMessages()];
                let thinkingIdx = msgs.findIndex(m => m.role === 'thinking' && !m.done);
                if (thinkingIdx >= 0) {
                  msgs[thinkingIdx].status = ev.content || '';
                } else {
                  msgs.push({ role: 'system', text: ev.content || '' });
                }
                this.opts.setMessages(msgs);
              } else if (ev.type === 'message' && ev.role === 'assistant') {
                let msgs = [...this.opts.getMessages()];
                let lastMsg = msgs[msgs.length - 1];
                if (!lastMsg || lastMsg.role !== 'agent' || !lastMsg.streaming) {
                  msgs.push({ role: 'agent', text: ev.content || '', streaming: true });
                } else {
                  lastMsg.text += (ev.content || '');
                }
                this.opts.setMessages(msgs);
              } else if (ev.type === 'tool_use') {
                let msgs = [...this.opts.getMessages()];
                msgs.push({
                  role: 'tool',
                  name: ev.name || ev.tool_name,
                  input: ev.parameters || ev.arguments,
                  result: null,
                  streaming: true
                });
                this.opts.setMessages(msgs);
              } else if (ev.type === 'tool_result') {
                let msgs = [...this.opts.getMessages()];
                for (let i = msgs.length - 1; i >= 0; i--) {
                  if (msgs[i].role === 'tool' && msgs[i].streaming) {
                    msgs[i].result = ev.output || ev.status;
                    msgs[i].streaming = false;
                    break;
                  }
                }
                this.opts.setMessages(msgs);
              }
              break;
            }

            case 'chat.done': {
              isFinished = true;
              clearInterval(timerInterval);
              ws.removeEventListener('message', onMessage);
              ws.removeEventListener('close', onClose);
              
              let msgs = this.opts.getMessages().map(m => ({ ...m, streaming: false }));
              this.opts.setMessages(msgs);
              
              let text = msg.params?.text || '';

              let sessionMatch = text.match(/Session ID:\s*`([a-f0-9-]+)`/);
              if (sessionMatch) {
                this.opts.onSessionId(sessionMatch[1]);
              }

              msgs = this.opts.getMessages().filter(m => 
                !(m.role === 'system' && (m.text.startsWith(ICONS.WAIT) || m.text.startsWith(ICONS.OK)))
                && !(m.role === 'thinking' && !m.done)
              );

              let meta = {};
              if (text) {
                let lastAgent = [...msgs].reverse().find(m => m.role === 'agent');
                if (!lastAgent) {
                  let bodyMatch = text.match(/## Agent Response\n+([\s\S]*?)(?=\n+(?:---|## Tools Used|## Errors|## Stats)|$)/i);
                  let body = bodyMatch ? bodyMatch[1].trim() : text;
                  msgs.push({ role: 'agent', text: body });
                }

                let modeMatch = text.match(/- Mode:\s*(.+)/i);
                if (modeMatch) meta.mode = modeMatch[1].trim();
                let sidMatch = text.match(/- Session ID:\s*`([^`]+)`/i);
                if (sidMatch) meta.sessionId = sidMatch[1];
                let exitMatch = text.match(/- Exit code:\s*(\d+)/i);
                if (exitMatch) meta.exitCode = parseInt(exitMatch[1], 10);
                let toolsMatch = text.match(/## Tools Used \((\d+)\)/i);
                if (toolsMatch) meta.tools = parseInt(toolsMatch[1], 10);
                let errorsMatch = text.match(/## Errors\n+([\s\S]*?)(?=\n+##|$)/i);
                if (errorsMatch) meta.errors = errorsMatch[1].trim();
                let failMatch = text.match(/## \[ERR\] Agent Failed[\s\S]*?(?=\n+##|$)/i);
                if (failMatch) meta.errors = failMatch[0].trim();

                this.opts.onMetaHtml(this.opts.buildSessionMetaHtml(text));
              }

              let elapsedSec = Math.round((Date.now() - startTime) / 1000);
              msgs.push({
                role: 'thinking',
                elapsed: elapsedSec,
                done: true,
                meta: Object.keys(meta).length > 0 ? meta : null
              });

              this.opts.setMessages(msgs);
              this.opts.onBackgroundToggle(false);

              fetch("/api/chats/messages", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ chatId, messages: this.opts.getMessages() }),
              }).catch(() => {});
              dashEmit("chats-updated");

              resolve('');
              break;
            }

            case 'chat.error': {
              isFinished = true;
              clearInterval(timerInterval);
              ws.removeEventListener('message', onMessage);
              ws.removeEventListener('close', onClose);
              
              let msgs = this.opts.getMessages().map(m => ({ ...m, streaming: false }));
              
              let errText = msg.params?.text || msg.params?.error || 'Unknown error';

              let errSessionMatch = errText.match(/Session ID:\s*`([a-f0-9-]+)`/);
              if (errSessionMatch) {
                this.opts.onSessionId(errSessionMatch[1]);
              }

              let finalMessages = [];
              for (let m of msgs) {
                if (m.role === 'tool') {
                  finalMessages.push({ ...m, streaming: false });
                } else if (!m.streaming) {
                  finalMessages.push(m);
                }
              }
              this.opts.setMessages(finalMessages);

              resolve(errText);
              break;
            }
          }
        } catch (e) { console.error('[ChatWsClient] WS message parse error:', e); }
      };

      ws.addEventListener('message', onMessage);

      let timeout = setTimeout(() => {
        clearInterval(timerInterval);
        ws.removeEventListener('message', onMessage);
        resolve('');
      }, 600_000);

      if (ws.readyState === WebSocket.OPEN) {
        sendMsg();
      } else {
        ws.addEventListener('open', () => sendMsg(), { once: true });
        ws.addEventListener('error', () => {
          clearInterval(timerInterval);
          ws.removeEventListener('message', onMessage);
          reject(new Error('WebSocket connection failed'));
        }, { once: true });
      }
    });
  }

  resume(chatId, taskId) {
    let msgs = [...this.opts.getMessages(), { role: 'system', text: `${ICONS.WAIT} Reconnecting to running task...` }];
    this.opts.setMessages(msgs);
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
        switch (msg.method) {
          case 'chat.resumed': {
            let msgs = [...this.opts.getMessages()];
            let last = msgs[msgs.length - 1];
            let isRunning = msg.params?.status === 'running';
            if (last && last.role === 'system' && last.text.startsWith(`${ICONS.WAIT} Reconnecting`)) {
              last.text = isRunning 
                ? `${ICONS.OK} Reconnected — task still running...`
                : `${ICONS.WAIT} Task status unknown, waiting...`;
            }
            this.opts.setMessages(msgs);
            break;
          }

          case 'chat.event': {
            let ev = msg.params?.event;
            if (!ev) break;
            if (ev.type === 'message' && ev.role === 'system') {
              let msgs = [...this.opts.getMessages()];
              let last = msgs[msgs.length - 1];
              if (last && last.role === 'system') {
                last.text = ev.content || '';
              } else {
                msgs.push({ role: 'system', text: ev.content || '' });
              }
              this.opts.setMessages(msgs);
            } else if (ev.type === 'message' && ev.role === 'assistant') {
              let msgs = [...this.opts.getMessages()];
              let last = msgs[msgs.length - 1];
              if (!last || last.role !== 'agent' || !last.streaming) {
                msgs.push({ role: 'agent', text: ev.content || '', streaming: true });
              } else {
                last.text += (ev.content || '');
              }
              this.opts.setMessages(msgs);
            } else if (ev.type === 'tool_use') {
              let msgs = [...this.opts.getMessages()];
              msgs.push({ role: 'tool', name: ev.name || ev.tool_name, input: ev.parameters || ev.arguments, result: null, streaming: true });
              this.opts.setMessages(msgs);
            } else if (ev.type === 'tool_result') {
              let msgs = [...this.opts.getMessages()];
              for (let i = msgs.length - 1; i >= 0; i--) {
                if (msgs[i].role === 'tool' && msgs[i].streaming) {
                  msgs[i].result = ev.output || ev.status;
                  msgs[i].streaming = false;
                  break;
                }
              }
              this.opts.setMessages(msgs);
            }
            break;
          }

          case 'chat.done': {
            ws.removeEventListener('message', onMessage);
            let msgs = this.opts.getMessages().map(m => ({ ...m, streaming: false }));
            this.opts.onBackgroundToggle(false);

            let text = msg.params?.text || '';
            let sessionMatch = text.match(/Session ID:\s*`([a-f0-9-]+)`/);
            if (sessionMatch) {
              this.opts.onSessionId(sessionMatch[1]);
            }

            let cleaned = msgs.filter(m => !(m.role === 'system' && (m.text.startsWith(ICONS.WAIT) || m.text.startsWith(ICONS.OK))));
            if (text) cleaned.push({ role: 'agent', text });
            this.opts.setMessages(cleaned);

            fetch("/api/chats/messages", {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ chatId, messages: this.opts.getMessages() }),
            }).catch(() => {});

            dashEmit("chats-updated");
            this.opts.onDone();
            break;
          }

          case 'chat.error': {
            ws.removeEventListener('message', onMessage);
            let msgs = this.opts.getMessages().map(m => ({ ...m, streaming: false }));
            this.opts.onBackgroundToggle(false);
            
            let errText = msg.params?.text || msg.params?.error || 'Task failed';
            
            if (errText.includes('lost')) {
              msgs.push({ role: 'system', text: `${ICONS.WARN} ${errText}` });
              this.opts.setMessages(msgs);
              fetch("/api/chats/messages", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ chatId, messages: this.opts.getMessages() }),
              }).catch(() => {});
            } else {
              msgs.push({ role: 'system', text: `Error: ${errText}` });
              this.opts.setMessages(msgs);
            }
            
            this.opts.onError(errText);
            break;
          }
        }
      } catch (e) { console.error('[ChatWsClient] WS message parse error:', e); }
    };
    ws.addEventListener('message', onMessage);
  }
}
