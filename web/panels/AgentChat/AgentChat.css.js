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

/* ── Chat Nav (unchanged) ── */

.chat-nav {
  width: 200px;
  min-width: 200px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  border-right: 1px solid rgba(255, 255, 255, 0.06);
  background: transparent;
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
  background: transparent;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  flex-shrink: 0;
}

.chat-nav[collapsed] .chat-nav-header {
  justify-content: center;
  padding: 2px 0;
}

.chat-nav-header .nav-spacer { flex: 1; }
.chat-nav[collapsed] .nav-spacer { display: none; }

.chat-nav-header .nav-title {
  font-size: 11px;
  font-weight: 600;
  color: #888;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  white-space: nowrap;
  overflow: hidden;
}

.chat-nav[collapsed] .nav-title { display: none; }

.chat-nav-collapse-icon {
  transition: transform 0.2s ease;
}

.chat-nav[collapsed] .chat-nav-collapse-icon {
  transform: rotate(180deg);
}

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
  color: #888;
  font-size: 0.75rem;
  transition: background 0.1s, color 0.1s;
  flex-shrink: 0;
}

.nav-btn .material-symbols-outlined { font-size: 16px; }

.nav-btn:hover {
  background: rgba(255, 255, 255, 0.06);
  color: #d4d4d4;
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
  color: #888;
  transition: background 0.12s, color 0.12s;
  white-space: nowrap;
  overflow: hidden;
}

.chat-item:hover {
  background: rgba(255, 255, 255, 0.06);
  color: #d4d4d4;
}

.chat-item[active] {
  color: #d4d4d4;
  background: rgba(255, 255, 255, 0.06);
  border-left: 2px solid #888;
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
  color: #ccc;
}

.chat-item-adapter {
  font-size: 9px;
  color: #555;
  font-family: var(--sn-font-mono, monospace);
}

.chat-item-delete {
  display: none;
  width: 16px;
  height: 16px;
  border: none;
  background: transparent;
  color: #555;
  cursor: pointer;
  font-size: 14px;
  padding: 0;
  align-items: center;
  justify-content: center;
  border-radius: 3px;
}

.chat-item:hover .chat-item-delete { display: flex; }
.chat-item-delete:hover { color: #ef5350; }

/* ── Chat Hierarchy (delegation tree) ── */

.chat-expand-icon {
  font-size: 14px !important;
  transition: transform 0.15s ease;
  cursor: pointer;
  flex-shrink: 0;
  opacity: 0.5;
}

.chat-expand-icon:hover {
  opacity: 1;
}

.chat-item-expanded .chat-expand-icon {
  transform: rotate(90deg);
}

.chat-sub-items {
  max-height: 0;
  overflow: hidden;
  transition: max-height 0.2s ease;
}

.chat-sub-items[expanded] {
  max-height: 500px;
}

.chat-item-child {
  padding-left: 28px;
  font-size: 12px;
  min-height: 24px;
  position: relative;
}

.chat-item-child::before {
  content: '';
  position: absolute;
  left: 18px;
  top: 0;
  bottom: 0;
  width: 1px;
  background: rgba(255, 255, 255, 0.08);
}

.chat-item-child .material-symbols-outlined {
  font-size: 14px;
  opacity: 0.5;
}

.chat-item-child[active] {
  border-left: 2px solid #666;
  padding-left: 26px;
}

.chat-nav[collapsed] .chat-sub-items,
.chat-nav[collapsed] .chat-expand-icon {
  display: none;
}

/* ── Chat View ── */

.chat-view {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
  position: relative;
}

/* Empty state: composer centered */
.chat-view[empty] {
  justify-content: center;
  align-items: center;
}

.chat-view[empty] .chat-messages {
  display: none;
}

.chat-view[empty] .chat-composer {
  position: relative;
  max-width: 640px;
  width: 90%;
}

/* ── Messages ── */

.chat-messages {
  flex: 1;
  overflow-y: auto;
  padding: 24px 20px 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.message {
  max-width: 100%;
  display: flex;
}

.msg-content {
  padding: 12px 16px;
  white-space: pre-wrap;
  word-break: break-word;
  line-height: 1.5;
  border-radius: 16px;
  width: 100%;
}

.message.user .msg-content {
  background: #2A2A2A;
  color: #e0e0e0;
}

.message.agent .msg-content {
  background: #222222;
  color: #e0e0e0;
  line-height: 1.5;
}

.message.system {
  align-self: center;
  font-size: 11px;
  max-width: 90%;
  color: #888;
}
.message.system .msg-content {
  background: transparent;
  text-align: center;
  font-style: italic;
  padding: 4px;
}

/* ── Composer (input area) ── */

.chat-composer {
  padding: 12px 20px 16px;
  position: relative;
  z-index: 2;
}

.composer-body {
  display: flex;
  align-items: flex-end;
  gap: 8px;
  background: #2A2A2A;
  border-radius: 20px;
  padding: 8px 8px 8px 16px;
  transition: background 0.15s;
}

.composer-body:focus-within {
  background: #333333;
}

.composer-body textarea {
  flex: 1;
  background: transparent;
  border: none;
  color: #e0e0e0;
  padding: 4px 0;
  outline: none;
  font-family: inherit;
  font-size: 13px;
  line-height: 1.4;
  resize: none;
  min-height: 20px;
  max-height: 200px;
  overflow-y: auto;
}

.composer-body textarea::placeholder {
  color: #666;
}

.btn-send {
  width: 32px;
  height: 32px;
  min-width: 32px;
  border-radius: 50%;
  border: none;
  background: rgba(255, 255, 255, 0.15);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: background 0.15s, transform 0.1s;
}

.btn-send .material-symbols-outlined {
  font-size: 18px;
}

.btn-send:hover {
  background: rgba(255, 255, 255, 0.25);
  transform: scale(1.05);
}

.btn-send:disabled {
  opacity: 0.3;
  cursor: default;
  transform: none;
}

.btn-send.btn-stop {
  background: hsl(0, 65%, 50%);
}

.btn-send.btn-stop:hover {
  background: hsl(0, 65%, 60%);
}

.btn-send.btn-stop .material-symbols-outlined {
  font-variation-settings: 'FILL' 1;
}

/* Composer footer (model & mode selectors) */

.composer-footer {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 16px 0;
  min-height: 0;
}

.composer-footer:empty {
  display: none;
}

.composer-footer-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 8px;
  border-radius: 6px;
  border: none;
  background: transparent;
  color: #777;
  font-size: 11px;
  font-family: inherit;
  cursor: pointer;
  transition: background 0.12s, color 0.12s;
  white-space: nowrap;
}

.composer-footer-btn:hover {
  background: rgba(255, 255, 255, 0.06);
  color: #bbb;
}

.composer-footer-btn .material-symbols-outlined {
  font-size: 14px;
}

.composer-footer-select {
  background: transparent;
  border: none;
  color: #aaa;
  font-size: 11px;
  font-family: inherit;
  font-weight: 500;
  outline: none;
  cursor: pointer;
  appearance: none;
  padding-right: 12px;
  background-image: url("data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%228%22%20height%3D%228%22%20viewBox%3D%220%200%208%208%22%3E%3Cpath%20fill%3D%22%23888%22%20d%3D%22M2%203L4%206L6%203H2Z%22%2F%3E%3C%2Fsvg%3E");
  background-repeat: no-repeat;
  background-position: right center;
  background-size: 8px;
}

.composer-footer-select option {
  background: #2a2a2a;
  color: #e0e0e0;
}

/* ── Context bar ── */

.chat-context-bar {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding: 0 8px 8px;
  min-height: 0;
}

.chat-context-bar:empty {
  display: none;
}

.context-chip {
  display: flex;
  align-items: center;
  gap: 4px;
  background: rgba(255, 255, 255, 0.06);
  border-radius: 6px;
  padding: 3px 8px;
  font-size: 11px;
  color: #999;
}

.context-path {
  max-width: 200px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.context-remove {
  background: transparent;
  border: none;
  color: #999;
  cursor: pointer;
  padding: 0 2px;
  font-size: 14px;
  line-height: 1;
}

.context-remove:hover {
  color: #ef5350;
}

/* Drag-over state */
.chat-composer.drag-over .composer-body {
  background: rgba(255, 255, 255, 0.12);
  outline: 1px dashed rgba(255, 255, 255, 0.2);
  outline-offset: -1px;
}

/* ── Autocomplete Popup ── */

.autocomplete-popup {
  display: none;
  position: absolute;
  bottom: 100%;
  left: 20px;
  right: 20px;
  max-height: 240px;
  overflow-y: auto;
  background: #2a2a2a;
  border-radius: 12px;
  padding: 4px;
  margin-bottom: 4px;
  box-shadow: 0 -4px 24px rgba(0, 0, 0, 0.4);
  z-index: 10;
}

.autocomplete-popup.visible {
  display: block;
}

.autocomplete-header {
  padding: 6px 10px 4px;
  font-size: 10px;
  font-weight: 600;
  color: #666;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.autocomplete-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  border-radius: 8px;
  cursor: pointer;
  font-size: 12px;
  color: #ccc;
  transition: background 0.1s;
}

.autocomplete-item:hover,
.autocomplete-item.active {
  background: rgba(255, 255, 255, 0.08);
  color: #fff;
}

.autocomplete-item .material-symbols-outlined {
  font-size: 16px;
  color: #888;
}

.autocomplete-item-label {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.autocomplete-item-hint {
  font-size: 10px;
  color: #555;
}

/* ── Tool Call Cards ── */

.message.tool {
  align-self: flex-start;
  max-width: 100%;
  width: 100%;
}

.tool-card {
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.04);
  overflow: hidden;
  transition: background 0.15s ease;
}

.tool-card[open] {
  background: rgba(255, 255, 255, 0.06);
}

.tool-header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  font-size: 12px;
  font-weight: 600;
  color: #aaa;
  cursor: pointer;
  user-select: none;
  list-style: none;
}

.tool-header::-webkit-details-marker { display: none; }

.tool-header::before {
  content: '▸';
  font-size: 10px;
  transition: transform 0.15s ease;
  color: #666;
}

.tool-card[open] .tool-header::before {
  transform: rotate(90deg);
}

.tool-header .material-symbols-outlined {
  font-size: 14px;
  color: #888;
}

.tool-card[open] .tool-header {
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  color: #ccc;
}

.tool-card[open] .tool-header .material-symbols-outlined {
  color: #aaa;
}

.tool-section {
  padding: 8px 12px;
}

.tool-label {
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: #666;
  margin-bottom: 4px;
}

.tool-code {
  background: rgba(0, 0, 0, 0.2);
  border-radius: 6px;
  padding: 8px;
  font-family: var(--sn-font-mono, 'JetBrains Mono', monospace);
  font-size: 11px;
  color: #bbb;
  white-space: pre-wrap;
  word-break: break-all;
  max-height: 200px;
  overflow-y: auto;
}

/* ── Streaming & Markdown ── */

.spin-icon {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  100% { transform: rotate(360deg); }
}

.tool-waiting {
  color: #888;
  font-style: italic;
  font-size: 11px;
}

.streaming-cursor {
  display: inline-block;
  width: 6px;
  height: 14px;
  background-color: #888;
  vertical-align: middle;
  margin-left: 4px;
  animation: blink 1s step-end infinite;
}

@keyframes blink {
  50% { opacity: 0; }
}

.markdown-pre {
  background: rgba(0, 0, 0, 0.25);
  border-radius: 8px;
  padding: 12px;
  overflow-x: auto;
  margin: 6px 0;
  font-family: var(--sn-font-mono, 'JetBrains Mono', monospace);
  font-size: 12px;
}

.markdown-code {
  background: rgba(255, 255, 255, 0.08);
  padding: 2px 5px;
  border-radius: 4px;
  font-family: var(--sn-font-mono, 'JetBrains Mono', monospace);
  font-size: 11px;
  color: #ccc;
}

.markdown-link {
  color: #aaa;
  text-decoration: underline;
  text-decoration-color: rgba(255, 255, 255, 0.2);
}

.markdown-link:hover {
  color: #ddd;
}

/* ── Thinking / Worked blocks ── */

.message.thinking {
  max-width: 100%;
}

.thinking-block,
.work-summary {
  font-size: 12px;
  color: #888;
}

.thinking-block summary,
.work-summary summary {
  cursor: pointer;
  user-select: none;
  list-style: none;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 0;
  font-weight: 500;
}

.thinking-block summary::-webkit-details-marker,
.work-summary summary::-webkit-details-marker {
  display: none;
}

.thinking-block summary .material-symbols-outlined {
  font-size: 16px;
  animation: thinking-pulse 1.2s ease-in-out infinite;
}

@keyframes thinking-pulse {
  0%, 100% { opacity: 0.3; }
  50% { opacity: 1; }
}

.work-summary summary .material-symbols-outlined {
  font-size: 16px;
  color: hsl(140, 40%, 50%);
}

.work-body {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding: 6px 0 2px 24px;
}

/* ── Session Metadata (header chips) ── */

.chat-session-meta {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-left: 8px;
}

.chat-session-meta:empty {
  display: none;
}

.meta-chip {
  font-size: 10px;
  font-weight: 500;
  padding: 2px 7px;
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.05);
  color: #888;
  white-space: nowrap;
  font-family: var(--sn-font-mono, monospace);
  letter-spacing: 0.2px;
}

.meta-chip.meta-ok {
  color: hsl(140, 40%, 50%);
  background: hsla(140, 40%, 50%, 0.1);
}

.meta-chip.meta-err {
  color: hsl(0, 55%, 55%);
  background: hsla(0, 55%, 55%, 0.1);
}

.meta-chip.meta-sid {
  cursor: default;
  max-width: 110px;
  overflow: hidden;
  text-overflow: ellipsis;
}

.thinking-status {
  display: inline-block;
  margin-left: 8px;
  font-size: 11px;
  font-weight: 400;
  color: #666;
  font-style: italic;
}
`;
