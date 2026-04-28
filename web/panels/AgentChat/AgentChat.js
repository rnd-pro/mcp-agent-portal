import { Symbiote } from "@symbiotejs/symbiote";
import { state as dashState, events as dashEvents, emit as dashEmit } from "../../dashboard-state.js";
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

    // Fetch chats and render nav
    this._fetchChats();

    dashEvents.addEventListener('chats-updated', () => this._fetchChats());
    dashEvents.addEventListener('active-chat-changed', (e) => {
      this._loadChat(e.detail?.id);
      this._renderNavItems();
    });
    dashEvents.addEventListener('active-project-changed', () => this._renderNavItems());

    // Load initial chat if any
    if (dashState.activeChatId) {
      this._loadChat(dashState.activeChatId);
    }

    // Re-render messages when they change
    this.sub('messages', () => this._renderMessages());
  }

  _renderMessages() {
    let container = this.querySelector('.chat-messages');
    if (!container) return;
    container.innerHTML = '';

    let messages = this.$.messages || [];
    for (let msg of messages) {
      let div = document.createElement('div');
      div.className = `message ${msg.role}`;

      if (msg.role === 'tool') {
        // Tool call card
        let details = document.createElement('details');
        details.className = 'tool-card';

        let summary = document.createElement('summary');
        summary.className = 'tool-header';
        summary.innerHTML = `<span class="material-symbols-outlined" style="font-size:14px">build</span> ${this._escapeHtml(msg.name || 'tool')}`;
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
        }

        div.appendChild(details);
      } else {
        // Regular message
        let content = document.createElement('div');
        content.className = 'msg-content';
        content.textContent = msg.text;
        div.appendChild(content);
      }

      container.appendChild(div);
    }

    requestAnimationFrame(() => {
      container.scrollTop = container.scrollHeight;
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

        // Build delegate_task arguments — resume existing session if available
        let delegateArgs = { prompt, timeout: 600 };
        if (this._sessionId) {
          delegateArgs.session_id = this._sessionId;
        }

        let res = await fetch("/api/mcp-call", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            serverName: "agent-pool",
            method: "tools/call",
            params: { name: "delegate_task", arguments: delegateArgs },
          }),
        });
        let data = await res.json();
        let delegateText = data.content?.[0]?.text || "";

        // Extract task_id from response
        let taskIdMatch = delegateText.match(/`([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})`/);
        let taskId = taskIdMatch?.[1];

        if (!taskId) {
          // No task_id — show raw response
          reply = delegateText || data.error?.message || "Task dispatched (no task ID).";
          this.$.messages = this.$.messages.filter(m => m.role !== 'system' || !m.text.startsWith('⏳'));
        } else {
          // Poll get_task_result until done
          let maxPolls = 120; // 10 min max (5s intervals)
          let pollInterval = 5000;
          let startTime = Date.now();

          for (let i = 0; i < maxPolls; i++) {
            await new Promise(r => setTimeout(r, pollInterval));
            let elapsed = Math.round((Date.now() - startTime) / 1000);
            this.$.messages = this.$.messages.map(m =>
              (m.role === 'system' && m.text.startsWith('⏳'))
                ? { ...m, text: `⏳ Processing... (${elapsed}s)` }
                : m
            );

            let pollRes = await fetch("/api/mcp-call", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                serverName: "agent-pool",
                method: "tools/call",
                params: { name: "get_task_result", arguments: { task_id: taskId } },
              }),
            });
            if (!pollRes.ok) continue; // server error — retry next poll
            let pollData = await pollRes.json();
            let pollText = pollData.content?.[0]?.text || "";

            // Still running?
            if (pollText.includes("Task is still running")) continue;

            // Done or error — extract response
            reply = pollText;

            // Extract and persist sessionId for session continuity
            let sessionMatch = pollText.match(/Session ID:\s*`([a-f0-9-]+)`/);
            if (sessionMatch) {
              this._sessionId = sessionMatch[1];
              // Save to server
              fetch("/api/chats/session", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ chatId, sessionId: this._sessionId }),
              }).catch(() => {});
            }
            break;
          }

          // Remove processing indicator
          this.$.messages = this.$.messages.filter(m => m.role !== 'system' || !m.text.startsWith('⏳'));
          if (!reply) reply = "⏳ Task is still running after timeout. Check manually.";
        }
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

      // If we have structured events, render tool calls as separate messages
      if (structuredEvents?.length) {
        let newMessages = [];
        for (let block of structuredEvents) {
          if (block.type === 'tool_use') {
            newMessages.push({ role: 'tool', name: block.name, input: block.input, result: block.result });
          }
        }
        // Add text blocks as agent message
        let textBlocks = structuredEvents.filter(b => b.type === 'text').map(b => b.text).join('\n');
        let finalText = textBlocks || reply;
        if (finalText) {
          newMessages.push({ role: 'agent', text: finalText });
        }
        this.$.messages = [...this.$.messages, ...newMessages];
      } else {
        this.$.messages = [...this.$.messages, { role: "agent", text: reply }];
      }

      // Persist the final agent reply
      await fetch("/api/chats/message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chatId, role: "agent", text: reply }),
      });

      dashEmit("chats-updated");
    } catch (err) {
      this.$.messages = [...this.$.messages, { role: "system", text: `Error: ${err.message}` }];
    }
  }

  async _loadChat(chatId) {
    if (!chatId) {
      this.$.messages = [];
      this.$.chatName = "Select a chat";
      this.$.chatAdapter = "";
      this._sessionId = null;
      return;
    }

    try {
      let res = await fetch("/api/chats/get", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: chatId }),
      });
      if (!res.ok) {
        this.$.messages = [{ role: "system", text: `Server error: ${res.status}` }];
        return;
      }
      let chat = await res.json();
      if (chat.error) {
        this.$.messages = [{ role: "system", text: chat.error }];
        return;
      }

      this.$.chatName = chat.name || "Chat";
      this.$.chatAdapter = chat.adapter || "pool";
      this.$.messages = chat.messages || [];
      this._sessionId = chat.sessionId || null;
    } catch (err) {
      this.$.messages = [{ role: "system", text: `Load error: ${err.message}` }];
    }
  }
}

AgentChat.template = template;
AgentChat.rootStyles = css;
AgentChat.reg("pg-agent-chat");
