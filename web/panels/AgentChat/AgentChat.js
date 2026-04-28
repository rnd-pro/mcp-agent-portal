import { Symbiote } from "@symbiotejs/symbiote";
import { state as dashState, events as dashEvents, emit as dashEmit } from "../../dashboard-state.js";
import css from "./AgentChat.css.js";

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
    // Reflect nav collapsed state (mirrors layout-sidebar pattern)
    this.sub('navCollapsed', (val) => {
      let nav = this.querySelector('.chat-nav');
      if (nav) nav.toggleAttribute('collapsed', val);
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

    // Clear input
    let input = this.querySelector('.chat-input-bar input');
    if (input) input.value = '';

    // Persist
    await fetch("/api/chats/message", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chatId, role: "user", text: prompt }),
    });

    try {
      let adapter = this.$.chatAdapter || "pool";
      let reply = "";

      if (adapter === "pool") {
        let res = await fetch("/api/mcp-call", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            serverName: "agent-pool",
            method: "tools/call",
            params: { name: "delegate_task", arguments: { prompt, timeout: 600 } },
          }),
        });
        let data = await res.json();
        reply = data.content?.[0]?.text || data.error?.message || "Task dispatched.";
      } else {
        this.$.messages = [...this.$.messages, { role: "system", text: "Processing..." }];

        let res = await fetch("/api/adapter/run", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type: adapter, prompt, timeout: 300 }),
        });
        let data = await res.json();
        this.$.messages = this.$.messages.filter(m => m.text !== "Processing...");

        reply = data.error ? `Error: ${data.error}` : data.response;
        if (data.errors?.length) reply += `\n\n[Warnings]:\n${data.errors.join('\n')}`;
      }

      this.$.messages = [...this.$.messages, { role: "agent", text: reply }];

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
      return;
    }

    try {
      let res = await fetch("/api/chats/get", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: chatId }),
      });
      let chat = await res.json();
      if (chat.error) {
        this.$.messages = [{ role: "system", text: chat.error }];
        return;
      }

      this.$.chatName = chat.name || "Chat";
      this.$.chatAdapter = chat.adapter || "pool";
      this.$.messages = chat.messages || [];

      requestAnimationFrame(() => {
        let msgEl = this.querySelector('.chat-messages');
        if (msgEl) msgEl.scrollTop = msgEl.scrollHeight;
      });
    } catch (err) {
      this.$.messages = [{ role: "system", text: `Load error: ${err.message}` }];
    }
  }
}

AgentChat.template = `
<div class="chat-shell">
  <div class="chat-nav">
    <div class="chat-nav-header">
      <button class="nav-btn nav-btn-add" set="onclick: onNewChat" title="New chat">
        <span class="material-symbols-outlined">add</span>
      </button>
      <span class="nav-title">Chats</span>
      <div class="nav-spacer"></div>
      <button class="nav-btn" set="onclick: onToggleNav">
        <span class="material-symbols-outlined chat-nav-collapse-icon">chevron_left</span>
      </button>
    </div>
    <div class="chat-items"></div>
  </div>

  <div class="chat-view">
    <div class="chat-header">
      <span class="material-symbols-outlined" style="font-size:18px">smart_toy</span>
      <span ${{ textContent: 'chatName' }}></span>
      <span class="chat-adapter-badge" ${{ textContent: 'chatAdapter' }}></span>
    </div>

    <div class="chat-messages" itemize="messages">
      <template>
        <div class="message {{role}}">
          <div class="msg-content">{{text}}</div>
        </div>
      </template>
    </div>

    <div class="chat-input-bar">
      <input type="text" set="oninput: onInput; onkeydown: onKeyDown" placeholder="Type a message...">
      <button set="onclick: onSend">
        <span class="material-symbols-outlined" style="font-size:18px">send</span>
      </button>
    </div>
  </div>
</div>
`;

AgentChat.rootStyles = css;
AgentChat.reg("pg-agent-chat");
