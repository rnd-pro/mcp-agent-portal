import { Symbiote, PubSub } from "@symbiotejs/symbiote";
import { state as dashState, events as dashEvents, emit as dashEmit } from "../../dashboard-state.js";
import { setGlobalParam, parseQuery, getRoute } from 'symbiote-node';
import template from "./AgentChat.tpl.js";
import css from "./AgentChat.css.js";

const STORAGE_KEY_CHAT_NAV = 'sn-chat-nav-collapsed';

/**
 * AgentChat — single layout panel with integrated chat-nav sidebar.
 *
 * Layout:
 *   [chat-nav] | [chat-view]
 *
 * chat-nav: sidebar-style list of chats (collapsed 48px / expanded 200px)
 * chat-view: header + messages + input
 *
 * Can be collapsed/fullscreened via standard layout panel controls.
 */
export class AgentChat extends Symbiote {
  static isoMode = true;
  init$ = {
    messages: [],
    inputVal: "",
    chatName: "Select a chat",
    chatAdapter: "",
    navCollapsed: false,

    onKeyDown: (e) => {
      if (e.key === "Enter") this._sendMessage();
    },

    onInput: (e) => {
      this.$.inputVal = e.target.value;
    },

    onSend: () => {
      this._sendMessage();
    },

    onToggleNav: () => {
      this.$.navCollapsed = !this.$.navCollapsed;
    },

    onNewChat: () => {
      this._createChat();
    },
  };

  renderCallback() {
    // Restore collapsed state from localStorage
    if (typeof localStorage !== 'undefined') {
      let stored = localStorage.getItem(STORAGE_KEY_CHAT_NAV);
      if (stored === 'true') {
        this.$.navCollapsed = true;
      }
    }

    // Reflect nav collapsed state and persist to localStorage
    this.sub('navCollapsed', (val) => {
      let nav = this.querySelector('.chat-nav');
      if (nav) nav.toggleAttribute('collapsed', val);

      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(STORAGE_KEY_CHAT_NAV, String(val));
      }
    });

    // Fetch chats, then sync from URL — component is ready when fetch completes
    this._fetchChats().then(() => {
      console.log("[AgentChat] _fetchChats completed. Calling _syncChatFromRouter");
      this._syncChatFromRouter();
    });

    dashEvents.addEventListener('chats-updated', () => this._fetchChats());
    dashEvents.addEventListener('active-chat-changed', (e) => {
      console.log("[AgentChat] active-chat-changed received:", e.detail);
      this._loadChat(e.detail?.id);
      this._renderNavItems();
    });
    dashEvents.addEventListener('active-project-changed', () => this._renderNavItems());

    // Self-register with router: react to ?chat= URL param changes
    this.sub('ROUTER/query', (query) => {
      console.log("[AgentChat] ROUTER/query changed:", query);
      this._syncChatFromRouter();
    });

    // Re-render messages when they change
    this.sub('messages', () => this._renderMessages());
  }

  _syncChatFromRouter() {
    let route = getRoute();
    let globals = parseQuery(route.query || '');
    let chatId = globals.chat || null;
    console.log("[AgentChat] _syncChatFromRouter: route=", route, "chatId=", chatId, "dashState.activeChatId=", dashState.activeChatId);

    if (chatId && chatId !== dashState.activeChatId) {
      console.log("[AgentChat] Emitting active-chat-changed for", chatId);
      dashState.activeChatId = chatId;
      dashEmit('active-chat-changed', { id: chatId, fromRoute: true });
    }
  }

  _formatMarkdown(text) {
    if (!text) return '';
    let html = this._escapeHtml(text);
    
    // Code blocks
    html = html.replace(/```([\s\S]*?)```/g, '<pre class="markdown-pre"><code>$1</code></pre>');
    // Inline code
    html = html.replace(/`([^`]+)`/g, '<code class="markdown-code">$1</code>');
    // Bold
    html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    // Italic
    html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');
    // Links
    html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" class="markdown-link">$1</a>');
    // Newlines
    html = html.split('\n').join('<br>');
    // Restore newlines inside pre
    html = html.replace(/<pre class="markdown-pre"><code>([\s\S]*?)<\/code><\/pre>/g, (match, p1) => {
      return `<pre class="markdown-pre"><code>${p1.split('<br>').join('\n')}</code></pre>`;
    });

    return html;
  }

  _renderMessages() {
    let container = this.querySelector('.chat-messages');
    if (!container) return;
    
    // Check if user has scrolled up
    let isAtBottom = container.scrollHeight - container.scrollTop <= container.clientHeight + 10;
    
    container.innerHTML = '';

    let messages = this.$.messages || [];
    for (let msg of messages) {
      let div = document.createElement('div');
      div.className = `message ${msg.role}`;
      if (msg.streaming) div.classList.add('streaming');

      if (msg.role === 'tool') {
        // Tool call card
        let details = document.createElement('details');
        details.className = 'tool-card';
        if (msg.streaming) details.setAttribute('open', ''); // Auto-open while running

        let summary = document.createElement('summary');
        summary.className = 'tool-header';
        
        let icon = msg.streaming ? 'build_circle' : 'build';
        let spinClass = msg.streaming ? 'spin-icon' : '';
        summary.innerHTML = `<span class="material-symbols-outlined ${spinClass}" style="font-size:14px">${icon}</span> ${this._escapeHtml(msg.name || 'tool')}`;
        details.appendChild(summary);

        if (msg.input) {
          let inputBlock = document.createElement('div');
          inputBlock.className = 'tool-section';
          inputBlock.innerHTML = `<div class="tool-label">Input</div><pre class="tool-code">${this._escapeHtml(typeof msg.input === 'string' ? msg.input : JSON.stringify(msg.input, null, 2))}</pre>`;
          details.appendChild(inputBlock);
        }

        if (msg.result) {
          let resultBlock = document.createElement('div');
          resultBlock.className = 'tool-section';
          let resultText = typeof msg.result === 'string' ? msg.result : JSON.stringify(msg.result, null, 2);
          // Truncate long results
          let truncated = resultText.length > 500 ? resultText.slice(0, 500) + '\n...' : resultText;
          resultBlock.innerHTML = `<div class="tool-label">Result</div><pre class="tool-code">${this._escapeHtml(truncated)}</pre>`;
          details.appendChild(resultBlock);
        } else if (msg.streaming) {
          let waitBlock = document.createElement('div');
          waitBlock.className = 'tool-section tool-waiting';
          waitBlock.innerHTML = `<em>Running...</em>`;
          details.appendChild(waitBlock);
        }

        div.appendChild(details);
      } else {
        // Regular message
        let content = document.createElement('div');
        content.className = 'msg-content';
        content.innerHTML = this._formatMarkdown(msg.text);
        if (msg.streaming) {
          let cursor = document.createElement('span');
          cursor.className = 'streaming-cursor';
          content.appendChild(cursor);
        }
        div.appendChild(content);
      }

      container.appendChild(div);
    }

    requestAnimationFrame(() => {
      if (isAtBottom) {
        container.scrollTop = container.scrollHeight;
      }
    });
  }


  _escapeHtml(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  async _fetchChats() {
    try {
      let res = await fetch('/api/chats');
      let data = await res.json();
      dashState.chats = data.chats || [];
      this._renderNavItems();
    } catch (err) {
      console.error('[AgentChat] fetch chats error:', err);
    }
  }

  _renderNavItems() {
    let container = this.querySelector('.chat-items');
    if (!container) return;
    container.innerHTML = '';

    let chats = dashState.chats || [];

    // Filter by active project if any
    let projectId = dashState.activeProjectId;
    if (projectId) {
      let projectChats = chats.filter(c => c.projectId === projectId);
      let otherChats = chats.filter(c => c.projectId !== projectId);
      chats = [...projectChats, ...otherChats];
    }

    for (let chat of chats) {
      let div = document.createElement('div');
      div.className = 'chat-item';
      if (chat.id === dashState.activeChatId) div.setAttribute('active', '');

      div.innerHTML = `
        <span class="material-symbols-outlined">chat</span>
        <span class="chat-item-label">${chat.name}</span>
        <span class="chat-item-adapter">${chat.adapter}</span>
        <button class="chat-item-delete" title="Delete">×</button>
      `;

      div.addEventListener('click', (e) => {
        if (e.target.closest('.chat-item-delete')) return;
        dashState.activeChatId = chat.id;
        setGlobalParam('chat', chat.id);
        dashEmit('active-chat-changed', { id: chat.id });
      });

      div.querySelector('.chat-item-delete').addEventListener('click', async (e) => {
        e.stopPropagation();
        await fetch('/api/chats/delete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: chat.id }),
        });
        if (dashState.activeChatId === chat.id) {
          dashState.activeChatId = null;
          setGlobalParam('chat', null);
          dashEmit('active-chat-changed', { id: null });
        }
        this._fetchChats();
      });

      container.appendChild(div);
    }
  }

  async _createChat() {
    let adapter = dashState.globalCli?.defaultAdapter || 'pool';
    let projectId = dashState.activeProjectId || null;
    let projectName = null;

    if (projectId) {
      let proj = (dashState.projectHistory || []).find(p => p.id === projectId);
      projectName = proj?.name;
    }

    let name = projectName ? `${projectName} — Chat` : 'New Chat';

    try {
      let res = await fetch('/api/chats', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, name, adapter }),
      });
      let data = await res.json();
      if (data.ok) {
        dashState.activeChatId = data.id;
        setGlobalParam('chat', data.id);
        dashEmit('active-chat-changed', { id: data.id });
        await this._fetchChats();
      }
    } catch (err) {
      console.error('[AgentChat] create chat error:', err);
    }
  }

  async _sendMessage() {
    let chatId = dashState.activeChatId;
    if (!chatId) return;

    let prompt = this.$.inputVal.trim();
    if (!prompt) return;

    this.$.messages = [...this.$.messages, { role: "user", text: prompt }];
    this.$.inputVal = "";
    if (this.ref.chatInput) this.ref.chatInput.value = '';

    // Persist
    await fetch("/api/chats/message", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chatId, role: "user", text: prompt }),
    });

    try {
      let adapter = this.$.chatAdapter || "pool";
      let reply = "";
      let structuredEvents = null;

      if (adapter === "pool") {
        // Show processing indicator
        this.$.messages = [...this.$.messages, { role: "system", text: "⏳ Delegating task..." }];

        reply = await this._sendViaWs(chatId, prompt);

        // Remove processing indicator
        this.$.messages = this.$.messages.filter(m => m.role !== 'system' || !m.text.startsWith('⏳'));
        if (!reply) reply = "⏳ Task is still running after timeout. Check manually.";
      } else {
        this.$.messages = [...this.$.messages, { role: "system", text: "Processing..." }];

        let res = await fetch("/api/adapter/run", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type: adapter, prompt, timeout: 300 }),
        });
        let data = await res.json();
        this.$.messages = this.$.messages.filter(m => m.text !== "Processing...");

        if (data.error) {
          reply = `Error: ${data.error}`;
        } else {
          reply = data.response;
          structuredEvents = data.events;
        }
        if (data.errors?.length) reply += `\n\n[Warnings]:\n${data.errors.join('\n')}`;
      }

      // If we used HTTP adapter and got structured events, render them
      if (adapter !== "pool") {
        if (structuredEvents?.length) {
          let newMessages = [];
          for (let block of structuredEvents) {
            if (block.type === 'tool_use') {
              newMessages.push({ role: 'tool', name: block.name, input: block.input, result: block.result });
            }
          }
          let textBlocks = structuredEvents.filter(b => b.type === 'text').map(b => b.text).join('\n');
          let finalText = textBlocks || reply;
          if (finalText) {
            newMessages.push({ role: 'agent', text: finalText });
          }
          this.$.messages = [...this.$.messages, ...newMessages];
        } else {
          this.$.messages = [...this.$.messages, { role: "agent", text: reply }];
        }
      }

      // Persist the full chat state (including tools and live streaming results)
      await fetch("/api/chats/messages", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chatId, messages: this.$.messages }),
      });

      dashEmit("chats-updated");
    } catch (err) {
      this.$.messages = [...this.$.messages, { role: "system", text: `Error: ${err.message}` }];
    }
  }

  /**
   * Ensure a WebSocket connection to /ws/chat is open.
   * Reuses existing connection if alive.
   */
  _ensureChatWs() {
    if (this._chatWs && this._chatWs.readyState === WebSocket.OPEN) return this._chatWs;
    if (this._chatWs) {
      try { this._chatWs.close(); } catch {}
    }

    let base = new URL('.', location.href).href.replace(/^http/, 'ws');
    this._chatWs = new WebSocket(`${base}ws/chat`);
    this._chatWs.onclose = () => { this._chatWs = null; };
    this._chatWs.onerror = () => {};
    return this._chatWs;
  }

  /**
   * Send a prompt via WebSocket and wait for the final response.
   * Streams progress events to the UI in real-time.
   *
   * @param {string} chatId
   * @param {string} prompt
   * @returns {Promise<string>} Final reply text
   */
  _sendViaWs(chatId, prompt) {
    return new Promise((resolve, reject) => {
      let ws = this._ensureChatWs();
      let startTime = Date.now();
      
      let timerInterval = setInterval(() => {
        let elapsed = Math.round((Date.now() - startTime) / 1000);
        this.$.messages = this.$.messages.map(m =>
          (m.role === 'system' && m.text.startsWith('⏳'))
            ? { ...m, text: `⏳ Processing... (${elapsed}s)` }
            : m
        );
      }, 1000);

      let send = () => {
        let params = { chatId, prompt, timeout: 600 };
        if (this._sessionId) params.sessionId = this._sessionId;
        if (dashState.globalCli?.model) params.model = dashState.globalCli.model;
        ws.send(JSON.stringify({ method: 'chat.send', params }));
      };

      let onMessage = (e) => {
        try {
          let msg = JSON.parse(e.data);
          
          switch (msg.method) {
            case 'chat.delegated':
              break;

            case 'chat.event': {
              let ev = msg.params?.event;
              if (!ev) break;
              
              // Live streaming logic
              if (ev.type === 'message' && ev.role === 'assistant') {
                let msgs = [...this.$.messages];
                let lastMsg = msgs[msgs.length - 1];
                if (!lastMsg || lastMsg.role !== 'agent' || !lastMsg.streaming) {
                  msgs.push({ role: 'agent', text: ev.content || '', streaming: true });
                } else {
                  lastMsg.text += (ev.content || '');
                }
                this.$.messages = msgs;
              } else if (ev.type === 'tool_use') {
                let msgs = [...this.$.messages];
                msgs.push({
                  role: 'tool',
                  name: ev.name || ev.tool_name,
                  input: ev.parameters || ev.arguments,
                  result: null,
                  streaming: true
                });
                this.$.messages = msgs;
              } else if (ev.type === 'tool_result') {
                let msgs = [...this.$.messages];
                for (let i = msgs.length - 1; i >= 0; i--) {
                  if (msgs[i].role === 'tool' && msgs[i].streaming) {
                    msgs[i].result = ev.output || ev.status;
                    msgs[i].streaming = false;
                    break;
                  }
                }
                this.$.messages = msgs;
              }
              break;
            }

            case 'chat.done': {
              clearInterval(timerInterval);
              ws.removeEventListener('message', onMessage);
              
              // Remove streaming flags from all messages
              this.$.messages = this.$.messages.map(m => ({ ...m, streaming: false }));
              
              let text = msg.params?.text || '';

              // Extract and persist sessionId
              let sessionMatch = text.match(/Session ID:\s*`([a-f0-9-]+)`/);
              if (sessionMatch) {
                this._sessionId = sessionMatch[1];
                fetch("/api/chats/session", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ chatId, sessionId: this._sessionId }),
                }).catch(() => {});
              }

              // Remove streaming text blocks, finalize tool blocks
              let finalMessages = [];
              for (let m of this.$.messages) {
                if (m.role === 'tool') {
                  finalMessages.push({ ...m, streaming: false });
                } else if (!m.streaming) {
                  finalMessages.push(m);
                }
              }
              this.$.messages = finalMessages;

              resolve(text);
              break;
            }

            case 'chat.error': {
              clearInterval(timerInterval);
              ws.removeEventListener('message', onMessage);
              
              // Remove streaming flags from all messages
              this.$.messages = this.$.messages.map(m => ({ ...m, streaming: false }));
              
              let errText = msg.params?.text || msg.params?.error || 'Unknown error';

              // Extract sessionId even from error responses
              let errSessionMatch = errText.match(/Session ID:\s*`([a-f0-9-]+)`/);
              if (errSessionMatch) {
                this._sessionId = errSessionMatch[1];
                fetch("/api/chats/session", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ chatId, sessionId: this._sessionId }),
                }).catch(() => {});
              }

              // Remove streaming text blocks, finalize tool blocks
              let finalMessages = [];
              for (let m of this.$.messages) {
                if (m.role === 'tool') {
                  finalMessages.push({ ...m, streaming: false });
                } else if (!m.streaming) {
                  finalMessages.push(m);
                }
              }
              this.$.messages = finalMessages;

              resolve(errText);
              break;
            }
          }
        } catch {}
      };

      ws.addEventListener('message', onMessage);

      // Timeout safety net (10 minutes)
      let timeout = setTimeout(() => {
        clearInterval(timerInterval);
        ws.removeEventListener('message', onMessage);
        resolve('');
      }, 600_000);

      // If WS is already open — send immediately, else wait for open
      if (ws.readyState === WebSocket.OPEN) {
        send();
      } else {
        ws.addEventListener('open', () => send(), { once: true });
        ws.addEventListener('error', () => {
          clearInterval(timerInterval);
          ws.removeEventListener('message', onMessage);
          reject(new Error('WebSocket connection failed'));
        }, { once: true });
      }
    });
  }

  async _loadChat(chatId) {
    console.log("[AgentChat] _loadChat called with", chatId);
    if (!chatId) {
      this.$.messages = [];
      this.$.chatName = "Select a chat";
      this.$.chatAdapter = "";
      this._sessionId = null;
      return;
    }

    try {
      console.log("[AgentChat] Fetching /api/chats/get for", chatId);
      let res = await fetch("/api/chats/get", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: chatId }),
      });
      if (!res.ok) {
        console.error("[AgentChat] Server error:", res.status);
        this.$.messages = [{ role: "system", text: `Server error: ${res.status}` }];
        return;
      }
      let chat = await res.json();
      if (chat.error) {
        console.error("[AgentChat] API error:", chat.error);
        this.$.messages = [{ role: "system", text: chat.error }];
        return;
      }

      console.log("[AgentChat] Successfully loaded chat:", chat);
      this.$.chatName = chat.name || "Chat";
      this.$.chatAdapter = chat.adapter || "pool";
      this.$.messages = chat.messages || [];
      this._sessionId = chat.sessionId || null;
    } catch (err) {
      console.error("[AgentChat] Catch error:", err);
      this.$.messages = [{ role: "system", text: `Load error: ${err.message}` }];
    }
  }
}

AgentChat.template = template;
AgentChat.rootStyles = css;
AgentChat.reg("pg-agent-chat");
