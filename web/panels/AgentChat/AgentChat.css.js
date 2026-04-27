export default `
pg-agent-chat {
  display: block;
  height: 100%;
  overflow: hidden;
  font-family: var(--sn-font, Georgia, serif);
}

.chat-wrapper {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--sn-panel-bg, hsl(228, 14%, 18%));
  color: var(--sn-text, #e0e0e0);
  font-size: 13px;
}

.chat-header {
  padding: 8px 12px;
  border-bottom: 1px solid var(--sn-node-border, hsl(228, 10%, 28%));
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 500;
  background: var(--sn-node-bg, hsl(228, 14%, 22%));
  color: var(--sn-text-dim, #a0a0a0);
}

.mode-select {
  margin-left: auto;
  background: var(--sn-panel-bg, hsl(228, 14%, 18%));
  color: var(--sn-text, #e0e0e0);
  border: 1px solid var(--sn-node-border, hsl(228, 10%, 28%));
  border-radius: 4px;
  padding: 4px 8px;
  font-family: inherit;
  font-size: 11px;
  outline: none;
  cursor: pointer;
  transition: border-color 0.15s ease;
}

.mode-select:hover, .mode-select:focus {
  border-color: var(--sn-cat-server, hsl(210, 45%, 45%));
}

.chat-messages {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.message {
  max-width: 85%;
  display: flex;
}

.message.user {
  align-self: flex-end;
}
.message.user .msg-content {
  background: hsla(210, 45%, 45%, 0.15);
  color: var(--sn-text, #e0e0e0);
  border: 1px solid var(--sn-cat-server, hsl(210, 45%, 45%));
  border-radius: 12px 12px 0 12px;
}

.message.agent {
  align-self: flex-start;
}
.message.agent .msg-content {
  background: var(--sn-node-bg, hsl(228, 14%, 22%));
  border: 1px solid var(--sn-node-border, hsl(228, 10%, 28%));
  border-radius: 12px 12px 12px 0;
  color: var(--sn-text, #e0e0e0);
}

.message.system {
  align-self: center;
  font-size: 11px;
  max-width: 90%;
  color: var(--sn-text-dim, #a0a0a0);
}
.message.system .msg-content {
  background: transparent;
  text-align: center;
  font-style: italic;
  padding: 4px;
}

.msg-content {
  padding: 10px 14px;
  white-space: pre-wrap;
  word-break: break-word;
  line-height: 1.4;
}

.chat-input-bar {
  padding: 10px;
  border-top: 1px solid var(--sn-node-border, hsl(228, 10%, 28%));
  display: flex;
  gap: 8px;
  background: var(--sn-node-bg, hsl(228, 14%, 22%));
}

.chat-input-bar input {
  flex: 1;
  background: var(--sn-panel-bg, hsl(228, 14%, 18%));
  border: 1px solid var(--sn-node-border, hsl(228, 10%, 28%));
  color: var(--sn-text, #e0e0e0);
  padding: 8px 12px;
  border-radius: 4px;
  outline: none;
  font-family: inherit;
  font-size: 12px;
  transition: border-color 0.15s ease;
}

.chat-input-bar input:focus {
  border-color: var(--sn-cat-server, hsl(210, 45%, 45%));
}
.chat-input-bar input::placeholder {
  color: var(--sn-text-dim, #a0a0a0);
}

.chat-input-bar button {
  background: hsla(210, 45%, 45%, 0.15);
  color: var(--sn-cat-server, hsl(210, 45%, 45%));
  border: 1px solid var(--sn-cat-server, hsl(210, 45%, 45%));
  border-radius: 4px;
  width: 42px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.15s ease;
}

.chat-input-bar button:hover {
  background: var(--sn-cat-server, hsl(210, 45%, 45%));
  color: #fff;
}
`;
