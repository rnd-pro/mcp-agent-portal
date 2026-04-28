import { Symbiote } from "@symbiotejs/symbiote";
import { state as dashState, events as dashEvents, emit as dashEmit } from "../../dashboard-state.js";
import css from "./AgentChat.css.js";

export class AgentChat extends Symbiote {
  init$ = {
    messages: [],
    inputVal: "",
    chatName: "No chat selected",
    chatAdapter: "pool",
    hasChatId: false,

    onKeyDown: (e) => {
      if (e.key === "Enter") {
        this.$.onSend();
      }
    },

    onInput: (e) => {
      this.$.inputVal = e.target.value;
    },

    onSend: async () => {
      let chatId = dashState.activeChatId;
      if (!chatId) return;

      let prompt = this.$.inputVal.trim();
      if (!prompt) return;

      // Append user message locally
      this.$.messages = [...this.$.messages, { role: "user", text: prompt }];
      this.$.inputVal = "";

      // Persist to server
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
              params: {
                name: "delegate_task",
                arguments: { prompt, timeout: 600 },
              },
            }),
          });
          let data = await res.json();
          reply = "Task dispatched.";
          if (data.content && data.content.length > 0) {
            reply = data.content[0].text;
          } else if (data.error) {
            reply = `Error: ${data.error.message}`;
          }
        } else {
          // Direct adapter mode
          this.$.messages = [...this.$.messages, { role: "system", text: "Processing..." }];

          let res = await fetch("/api/adapter/run", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ type: adapter, prompt, timeout: 300 }),
          });
          let data = await res.json();

          // Remove "Processing..." 
          this.$.messages = this.$.messages.filter(m => m.text !== "Processing...");

          if (data.error) {
            reply = `Error: ${data.error}`;
          } else {
            reply = data.response;
            if (data.errors && data.errors.length > 0) {
              reply += `\n\n[Warnings]:\n${data.errors.join('\n')}`;
            }
          }
        }

        this.$.messages = [...this.$.messages, { role: "agent", text: reply }];

        // Persist agent reply
        await fetch("/api/chats/message", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chatId, role: "agent", text: reply }),
        });

        dashEmit("chats-updated");
      } catch (err) {
        this.$.messages = [...this.$.messages, { role: "system", text: `Error: ${err.message}` }];
      }
    },
  };

  renderCallback() {
    dashEvents.addEventListener("active-chat-changed", (e) => {
      this._loadChat(e.detail?.id);
    });

    // Load initial chat if any
    if (dashState.activeChatId) {
      this._loadChat(dashState.activeChatId);
    }
  }

  async _loadChat(chatId) {
    if (!chatId) {
      this.$.messages = [];
      this.$.chatName = "No chat selected";
      this.$.chatAdapter = "pool";
      this.$.hasChatId = false;
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
      this.$.hasChatId = true;

      // Auto-scroll
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
<div class="chat-wrapper">
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
    <input type="text" bind="value: inputVal" set="oninput: onInput; onkeydown: onKeyDown" placeholder="Type a message...">
    <button set="onclick: onSend">
      <span class="material-symbols-outlined" style="font-size:18px">send</span>
    </button>
  </div>
</div>
`;

AgentChat.rootStyles = css;
AgentChat.reg("pg-agent-chat");
