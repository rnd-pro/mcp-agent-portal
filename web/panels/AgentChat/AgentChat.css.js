export default `
pg-agent-chat {
  display: block;
  height: 100%;
  overflow: hidden;
  font-family: var(--sn-font, 'Inter', -apple-system, sans-serif);
}

.chat-shell {
  display: flex;
  height: 100%;
  background: var(--sn-panel-bg, hsl(228, 14%, 18%));
  color: var(--sn-text, #e0e0e0);
  font-size: 13px;
}

/* ── Chat Nav (mirrors layout-sidebar pattern) ── */

.chat-nav {
  width: 200px;
  min-width: 200px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  border-right: 1px solid var(--sn-node-border, rgba(255, 255, 255, 0.06));
  background: var(--sn-bg, #1e1e1e);
  overflow: hidden;
  transition: width 0.2s ease, min-width 0.2s ease;
  user-select: none;
}

.chat-nav[collapsed] {
  width: 48px;
  min-width: 48px;
}

.chat-nav-header {
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 2px 4px;
  min-height: 28px;
  background: var(--bg-header, var(--sn-bg, #1e1e1e));
  border-bottom: 1px solid var(--sn-node-border, rgba(255, 255, 255, 0.06));
  flex-shrink: 0;
}

.chat-nav[collapsed] .chat-nav-header {
  justify-content: center;
  padding: 2px 0;
}

.chat-nav-header .nav-spacer {
  flex: 1;
}

.chat-nav[collapsed] .nav-spacer {
  display: none;
}

.chat-nav-header .nav-title {
  font-size: 11px;
  font-weight: 600;
  color: var(--sn-text-dim, #888);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  white-space: nowrap;
  overflow: hidden;
}

.chat-nav[collapsed] .nav-title {
  display: none;
}

.chat-nav-collapse-icon {
  transition: transform 0.2s ease;
}

.chat-nav[collapsed] .chat-nav-collapse-icon {
  transform: rotate(180deg);
}

/* Hide labels, adapters, delete when collapsed */
.chat-nav[collapsed] .chat-item-label,
.chat-nav[collapsed] .chat-item-adapter,
.chat-nav[collapsed] .chat-item-delete,
.chat-nav[collapsed] .nav-btn-add {
  display: none;
}

.nav-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 4px 6px;
  background: transparent;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  color: var(--text-dim, var(--sn-text-dim, #888));
  font-size: 0.75rem;
  transition: background 0.1s, color 0.1s;
  flex-shrink: 0;
}

.nav-btn .material-symbols-outlined { font-size: 16px; }

.nav-btn:hover {
  background: var(--bg-hover, var(--sn-node-hover, rgba(255, 255, 255, 0.06)));
  color: var(--text-main, var(--sn-text, #d4d4d4));
}

.chat-items {
  flex: 1;
  overflow-y: auto;
  padding: 4px 0;
}

.chat-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 14px;
  min-height: 28px;
  cursor: pointer;
  color: var(--text-dim, var(--sn-text-dim, #888));
  transition: background 0.12s, color 0.12s;
  white-space: nowrap;
  overflow: hidden;
}

.chat-item:hover {
  background: var(--bg-hover, var(--sn-node-hover, rgba(255, 255, 255, 0.06)));
  color: var(--text-main, var(--sn-text, #d4d4d4));
}

.chat-item[active] {
  color: var(--text-main, var(--sn-text, #d4d4d4));
  background: var(--bg-hover, var(--sn-node-hover, rgba(255, 255, 255, 0.06)));
  border-left: 2px solid var(--sn-cat-server, #5cb8ff);
  padding-left: 12px;
}

.chat-item .material-symbols-outlined {
  font-size: 16px;
  flex-shrink: 0;
}

.chat-item-label {
  font-size: 11px;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--sn-text, #e0e0e0);
}

.chat-item-adapter {
  font-size: 9px;
  color: var(--sn-text-dim, #555);
  font-family: var(--sn-font-mono, monospace);
}

.chat-item-delete {
  display: none;
  width: 16px;
  height: 16px;
  border: none;
  background: transparent;
  color: var(--sn-text-dim, #555);
  cursor: pointer;
  font-size: 14px;
  padding: 0;
  align-items: center;
  justify-content: center;
  border-radius: 3px;
}

.chat-item:hover .chat-item-delete { display: flex; }
.chat-item-delete:hover { color: #ef5350; }

/* ── Chat View ────────────────────────────── */

.chat-view {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
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
  flex-shrink: 0;
}

.chat-adapter-badge {
  margin-left: auto;
  font-size: 10px;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 4px;
  background: rgba(76, 139, 245, 0.1);
  color: var(--sn-node-selected, #4c8bf5);
  font-family: var(--sn-font-mono, monospace);
  text-transform: uppercase;
  letter-spacing: 0.3px;
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
  flex-shrink: 0;
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

.empty-chat {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: var(--sn-text-dim, #555);
  gap: 8px;
}

.empty-chat .material-symbols-outlined {
  font-size: 40px;
  opacity: 0.3;
}

/* ── Tool Call Cards ─────────────────────── */

.message.tool {
  align-self: flex-start;
  max-width: 92%;
  width: 100%;
}

.tool-card {
  border: 1px solid var(--sn-node-border, hsl(228, 10%, 28%));
  border-left: 3px solid var(--sn-cat-tool, #e9a33a);
  border-radius: 6px;
  background: var(--sn-node-bg, hsl(228, 14%, 22%));
  overflow: hidden;
  transition: border-color 0.15s ease;
}

.tool-card[open] {
  border-left-color: var(--sn-cat-server, #5cb8ff);
}

.tool-header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  font-size: 12px;
  font-weight: 600;
  color: var(--sn-cat-tool, #e9a33a);
  cursor: pointer;
  user-select: none;
  list-style: none;
}

.tool-header::-webkit-details-marker { display: none; }

.tool-header::before {
  content: '▸';
  font-size: 10px;
  transition: transform 0.15s ease;
  color: var(--sn-text-dim, #888);
}

.tool-card[open] .tool-header::before {
  transform: rotate(90deg);
}

.tool-header .material-symbols-outlined {
  color: var(--sn-cat-tool, #e9a33a);
}

.tool-card[open] .tool-header {
  border-bottom: 1px solid var(--sn-node-border, hsl(228, 10%, 28%));
  color: var(--sn-cat-server, #5cb8ff);
}

.tool-card[open] .tool-header .material-symbols-outlined {
  color: var(--sn-cat-server, #5cb8ff);
}

.tool-section {
  padding: 6px 10px;
}

.tool-section + .tool-section {
  border-top: 1px solid var(--sn-node-border, hsl(228, 10%, 28%));
}

.tool-label {
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--sn-text-dim, #888);
  margin-bottom: 4px;
}

.tool-code {
  margin: 0;
  padding: 6px 8px;
  background: var(--sn-panel-bg, hsl(228, 14%, 18%));
  border-radius: 4px;
  font-family: var(--sn-font-mono, 'JetBrains Mono', 'Fira Code', monospace);
  font-size: 11px;
  line-height: 1.4;
  color: var(--sn-text, #e0e0e0);
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 200px;
  overflow-y: auto;
}
`;
