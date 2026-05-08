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
  background: var(--sn-bg, #1a1a1a);
  color: var(--sn-text, #e0e0e0);
  font-size: 13px;
}

/* ── Chat Nav (unchanged) ── */

chat-sidebar {
  display: flex;
  height: 100%;
  position: relative;
  z-index: 10;
}

chat-sidebar-item, chat-sidebar-sub-item {
  display: block;
}

.chat-nav {
  height: 100%;
  width: 200px;
  min-width: 200px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  border-right: none;
  background: var(--sn-node-bg, #222222);
  overflow: hidden;
  transition: width 0.2s ease, min-width 0.2s ease;
  user-select: none;
}

.chat-nav[collapsed] {
  width: 48px;
  min-width: 48px;
  overflow: visible;
}

.chat-nav-header {
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 2px 4px;
  min-height: 28px;
  background: var(--bg-header, var(--sn-node-bg, #222222));
  border-bottom: none;
  flex-shrink: 0;
}

.chat-nav[collapsed] .chat-nav-header {
  flex-direction: column-reverse;
  justify-content: flex-start;
  padding: 4px 0;
  gap: 8px;
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
.chat-nav[collapsed] .chat-item-delete {
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

.chat-nav[collapsed] .chat-items {
  overflow: visible;
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

.chat-item[data-active],
chat-sidebar-item[data-active] > .chat-item,
chat-sidebar-sub-item[data-active] > .chat-item-child {
  color: #d4d4d4;
  background: rgba(255, 255, 255, 0.06);
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
  color: #ccc;
}

.chat-status-container {
  display: flex;
  align-items: center;
}

.chat-item-adapter {
  font-size: 9px;
  color: #555;
  font-family: var(--sn-font-mono, monospace);
  margin-left: 6px;
}

.chat-item-type {
  font-size: 9px;
  color: var(--sn-cat-server, #5cb8ff);
  background: color-mix(in srgb, var(--sn-cat-server, #5cb8ff) 10%, transparent);
  font-family: var(--sn-font-mono, monospace);
  margin-left: auto;
  padding: 2px 4px;
  border-radius: 3px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
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
  margin-left: auto;
}

.chat-item:hover .chat-item-delete,
.chat-item-child:hover .chat-item-delete { display: flex; }

/* Hide adapter and type badge when hovering, so delete button shows clearly */
.chat-item:hover .chat-item-adapter,
.chat-item-child:hover .chat-item-type {
  display: none;
}

.chat-item-delete:hover { color: #ef5350; }

.chat-nav[collapsed] .chat-item {
  position: relative;
  justify-content: center;
  padding: 0;
  overflow: visible;
}

.chat-nav[collapsed] .chat-item:hover .chat-item-delete {
  display: flex;
  position: absolute;
  /* Shift it outside by exactly its own width to make it a large square */
  right: -48px;
  top: 0;
  bottom: 0;
  width: 48px;
  height: 100%;
  background: var(--sn-node-bg, #222222);
  border-radius: 0 4px 4px 0;
  box-shadow: 2px 0 4px rgba(0,0,0,0.1);
}

/* ── Chat Hierarchy (delegation tree) ── */

.chat-expand-icon {
  margin-left: auto;
  font-size: 14px !important;
  transition: transform 0.15s ease, opacity 0.15s ease;
  cursor: pointer;
  flex-shrink: 0;
  opacity: 0.2;
}

chat-sidebar-item[data-has-sub] .chat-expand-icon {
  opacity: 0.5;
}

chat-sidebar-item[data-has-sub] .chat-expand-icon:hover {
  opacity: 1;
}

chat-sidebar-item[data-expanded] .chat-expand-icon {
  transform: rotate(90deg);
}

.chat-sub-items {
  width: 100%;
  max-height: 0;
  overflow: hidden;
  transition: max-height 0.2s ease;
}

chat-sidebar-item[data-expanded] .chat-sub-items {
  max-height: 500px;
}

.chat-item-child {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 14px 4px 38px;
  font-size: 12px;
  min-height: 24px;
  position: relative;
  color: #888;
  cursor: pointer;
  transition: background 0.12s, color 0.12s;
}

.chat-item-child:hover {
  background: rgba(255, 255, 255, 0.04);
  color: #d4d4d4;
}

.chat-item-child::before {
  content: '';
  position: absolute;
  left: 20px;
  top: 0;
  bottom: 0;
  width: 1px;
  background: rgba(255, 255, 255, 0.08);
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

.message.board {
  width: 100%;
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
  border-bottom: none;
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

.md-code-block {
  background: rgba(0, 0, 0, 0.25);
  border-radius: 8px;
  padding: 12px;
  overflow-x: auto;
  margin: 6px 0;
  font-family: var(--sn-font-mono, 'JetBrains Mono', monospace);
  font-size: 12px;
}

.md-inline-code {
  background: rgba(255, 255, 255, 0.08);
  padding: 2px 5px;
  border-radius: 4px;
  font-family: var(--sn-font-mono, 'JetBrains Mono', monospace);
  font-size: 11px;
  color: #ccc;
}

.markdown-mention {
  color: #64b5f6;
  background: rgba(100, 181, 246, 0.1);
  padding: 1px 4px;
  border-radius: 4px;
  font-weight: 500;
  word-break: break-all;
}

.md-link {
  color: #aaa;
  text-decoration: underline;
  text-decoration-color: rgba(255, 255, 255, 0.2);
}

.md-link:hover {
  color: #ddd;
}

/* Extended Markdown Styles */
.md-h { margin: 16px 0 8px; color: #eee; font-weight: 700; }
h1.md-h { font-size: 20px; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 6px; }
h2.md-h { font-size: 18px; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 4px; }
h3.md-h { font-size: 16px; }
h4.md-h { font-size: 14px; }
.md-p { margin: 8px 0; }
.md-quote {
  margin: 8px 0;
  padding: 8px 16px;
  border-left: 4px solid #64b5f6;
  background: rgba(100, 181, 246, 0.05);
  border-radius: 0 4px 4px 0;
  font-style: italic;
  color: #aaa;
}
.md-list { margin: 8px 0; padding-left: 24px; }
.md-list li { margin: 3px 0; }
.md-img {
  max-width: 100%;
  height: auto;
  border-radius: 6px;
  margin: 8px 0;
  border: 1px solid rgba(255,255,255,0.1);
}
.md-hr {
  border: none;
  border-top: 1px solid rgba(255,255,255,0.1);
  margin: 16px 0;
}
.md-table {
  width: 100%;
  border-collapse: collapse;
  margin: 12px 0;
  font-size: 12px;
}
.md-table th, .md-table td {
  padding: 6px 12px;
  border: 1px solid rgba(255,255,255,0.1);
  text-align: left;
}
.md-table th { background: rgba(255,255,255,0.05); font-weight: 600; }
.md-table tr:hover td { background: rgba(255,255,255,0.02); }

/* Syntax Highlight Token Colors */
.t-kw   { color: rgb(254, 165, 176); }
.t-str  { color: rgb(251, 182, 79); }
.t-cm   { color: rgb(149, 149, 149); font-style: italic; }
.t-fn   { color: rgb(180, 243, 255); }
.t-num  { color: rgb(251, 182, 79); }
.t-bi   { color: rgb(180, 243, 255); }
.t-prop { color: rgb(238, 131, 252); }
.t-lit  { color: rgb(254, 165, 176); }

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

/* ── Delegation Board (inline sub-agent cards) ── */

.delegation-board {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 4px 0;
  width: 100%;
}

.delegation-card {
  flex: 1 1 220px;
  max-width: 320px;
  background: rgba(255,255,255,0.03);
  border: 1px solid rgba(255,255,255,0.06);
  border-radius: 8px;
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
  position: relative;
  overflow: hidden;
}

.delegation-card::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 2px;
  background: var(--card-accent, rgba(255,255,255,0.06));
  transition: background 0.3s ease;
}

.delegation-card[data-status="running"] {
  border-color: rgba(120, 180, 255, 0.15);
  --card-accent: hsl(215, 70%, 55%);
}

.delegation-card[data-status="running"]::before {
  animation: card-progress 1.8s ease-in-out infinite;
}

@keyframes card-progress {
  0%, 100% { opacity: 0.5; }
  50% { opacity: 1; }
}

.delegation-card[data-status="done"] {
  border-color: rgba(100, 200, 120, 0.12);
  --card-accent: hsl(140, 50%, 45%);
}

.delegation-card[data-status="error"] {
  border-color: rgba(220, 100, 100, 0.12);
  --card-accent: hsl(0, 55%, 50%);
}

.delegation-card-linked {
  cursor: pointer;
}

.delegation-card-linked:hover {
  border-color: rgba(255, 255, 255, 0.15);
  box-shadow: 0 0 12px rgba(120, 180, 255, 0.08);
}

.delegation-card-header {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  font-weight: 500;
  color: #ccc;
}

.delegation-card-header .material-symbols-outlined {
  font-size: 16px;
}

.delegation-card-header .spin-icon {
  animation: spin 1.2s linear infinite;
}

.delegation-card-status {
  font-size: 11px;
  color: #777;
  display: flex;
  align-items: center;
  gap: 4px;
}

.delegation-card-events {
  display: flex;
  flex-wrap: wrap;
  gap: 3px;
}

.delegation-card-event {
  display: inline-block;
  background: var(--bg-surface, #222);
  color: var(--text-dim, #888);
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 11px;
  white-space: nowrap;
  max-width: 120px;
  overflow: hidden;
  text-overflow: ellipsis;
  border: 1px solid var(--border-color, #333);
}

.delegation-card-event[data-type="tool_use"],
.delegation-card-event[data-type="tool_result"] {
  color: var(--text-color, #ccc);
  border-color: var(--accent-color, #1976d2);
  background: rgba(25, 118, 210, 0.1);
}

.delegation-card-event[data-status="error"] {
  color: #ff5252;
  border-color: #ff5252;
  background: rgba(255, 82, 82, 0.1);
}

.delegation-card-event[data-type="message"] {
  color: hsl(215, 50%, 60%);
  background: hsla(215, 50%, 60%, 0.08);
}

/* ── Live Status Indicator (server-authoritative streaming) ── */

.live-status-indicator {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  font-size: 12px;
  color: #888;
  animation: status-fade-in 0.2s ease;
}

.live-status-indicator .material-symbols-outlined {
  color: hsl(215, 60%, 55%);
}

@keyframes status-fade-in {
  from { opacity: 0; transform: translateY(4px); }
  to { opacity: 1; transform: translateY(0); }
}
`;
