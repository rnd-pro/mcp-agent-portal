import { Symbiote } from "@symbiotejs/symbiote";
import { state } from "../../dashboard-state.js";
import css from "./AgentChat.css.js";

export class AgentChat extends Symbiote {
  init$ = {
    messages: [
      { role: "system", text: "Agent Chat ready. Select mode above." }
    ],
    inputVal: "",
    mode: "pool", // "pool" | "gemini" | "claude" | "opencode"
    
    onModeChange: (e) => {
      this.$.mode = e.target.value;
      this.$.messages.push({ role: "system", text: `Switched to ${this.$.mode} mode.` });
      this.$.messages = [...this.$.messages];
    },
    
    onKeyDown: (e) => {
      if (e.key === "Enter") {
        this.$.onSend();
      }
    },
    
    onSend: async () => {
      const prompt = this.$.inputVal.trim();
      if (!prompt) return;
      
      this.$.messages.push({ role: "user", text: prompt });
      this.$.messages = [...this.$.messages];
      this.$.inputVal = "";
      
      try {
        let reply = "";
        
        if (this.$.mode === "pool") {
          const res = await fetch("/api/mcp-call", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              serverName: "agent-pool",
              method: "tools/call",
              params: { 
                name: "delegate_task", 
                arguments: { prompt, timeout: 600 } 
              }
            })
          });
          const data = await res.json();
          reply = "Task dispatched.";
          if (data.content && data.content.length > 0) {
            reply = data.content[0].text;
          } else if (data.error) {
            reply = `Error: ${data.error.message}`;
          }
        } else {
          // Direct adapter mode
          this.$.messages.push({ role: "system", text: "Processing..." });
          this.$.messages = [...this.$.messages];
          
          const res = await fetch("/api/adapter/run", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ type: this.$.mode, prompt, timeout: 300 })
          });
          const data = await res.json();
          
          // Remove the "Processing..." system message
          this.$.messages.pop();
          
          if (data.error) {
            reply = `Error: ${data.error}`;
          } else {
            reply = data.response;
            if (data.errors && data.errors.length > 0) {
              reply += `\n\n[Warnings]:\n${data.errors.join('\n')}`;
            }
          }
        }
        
        this.$.messages.push({ role: "agent", text: reply });
        this.$.messages = [...this.$.messages];
      } catch (err) {
        // Remove "Processing..." if it was added
        if (this.$.messages[this.$.messages.length-1].text === "Processing...") {
          this.$.messages.pop();
        }
        this.$.messages.push({ role: "system", text: `Error: ${err.message}` });
        this.$.messages = [...this.$.messages];
      }
    }
  }
}

AgentChat.template = `
<div class="chat-wrapper">
  <div class="chat-header">
    <sym-icon icon="robot"></sym-icon>
    <span>Agent Chat</span>
    <select class="mode-select" set="onchange: onModeChange">
      <option value="pool">Pool (MCP)</option>
      <option value="gemini">Direct: gemini</option>
      <option value="claude">Direct: claude</option>
      <option value="opencode">Direct: opencode</option>
    </select>
  </div>
  
  <div class="chat-messages" itemize="messages">
    <template>
      <div class="message {{role}}">
        <div class="msg-content">{{text}}</div>
      </div>
    </template>
  </div>
  
  <div class="chat-input-bar">
    <input type="text" set="value: inputVal, onkeydown: onKeyDown" placeholder="Delegate a task to the pool...">
    <button set="onclick: onSend">
      <sym-icon icon="send"></sym-icon>
    </button>
  </div>
</div>
`;

AgentChat.rootStyles = css;
AgentChat.reg("pg-agent-chat");
