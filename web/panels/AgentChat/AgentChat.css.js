export default `
.chat-wrapper {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--bg-1);
  color: var(--fg-1);
  font-family: var(--font-main);
}

.chat-header {
  padding: var(--gap-mid);
  border-bottom: 1px solid var(--border-1);
  display: flex;
  align-items: center;
  gap: var(--gap-min);
  font-weight: 500;
  background: var(--bg-2);
}

.mode-select {
  margin-left: auto;
  background: var(--bg-1);
  color: var(--fg-1);
  border: 1px solid var(--border-1);
  border-radius: 4px;
  padding: 4px 8px;
  font-family: inherit;
  font-size: 0.9em;
  outline: none;
  cursor: pointer;
}
.mode-select:hover {
  border-color: var(--accent-1);
}

.chat-messages {
  flex: 1;
  overflow-y: auto;
  padding: var(--gap-mid);
  display: flex;
  flex-direction: column;
  gap: var(--gap-mid);
}

.message {
  max-width: 80%;
  display: flex;
}

.message.user {
  align-self: flex-end;
}
.message.user .msg-content {
  background: var(--accent-1);
  color: var(--bg-1);
  border-radius: 12px 12px 0 12px;
}

.message.agent {
  align-self: flex-start;
}
.message.agent .msg-content {
  background: var(--bg-2);
  border: 1px solid var(--border-1);
  border-radius: 12px 12px 12px 0;
}

.message.system {
  align-self: center;
  font-size: 0.8em;
  opacity: 0.7;
  max-width: 90%;
}
.message.system .msg-content {
  background: transparent;
  text-align: center;
  font-style: italic;
}

.msg-content {
  padding: var(--gap-mid);
  white-space: pre-wrap;
  word-break: break-word;
}

.chat-input-bar {
  padding: var(--gap-mid);
  border-top: 1px solid var(--border-1);
  display: flex;
  gap: var(--gap-min);
  background: var(--bg-2);
}

.chat-input-bar input {
  flex: 1;
  background: var(--bg-1);
  border: 1px solid var(--border-1);
  color: var(--fg-1);
  padding: var(--gap-min) var(--gap-mid);
  border-radius: 4px;
  outline: none;
}
.chat-input-bar input:focus {
  border-color: var(--accent-1);
}

.chat-input-bar button {
  background: var(--accent-1);
  color: var(--bg-1);
  border: none;
  border-radius: 4px;
  width: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: opacity 0.2s;
}
.chat-input-bar button:hover {
  opacity: 0.8;
}
`;
