export default `
:host {
  display: block;
}

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
  color: var(--sn-text);
  font-size: 13px;
}

/* ── Chat Nav (unchanged) ── */

chat-sidebar {
  display: flex;
  height: 100%;
  width: var(--chat-nav-width, 200px);
  min-width: var(--chat-nav-width, 200px);
  flex: 0 0 var(--chat-nav-width, 200px);
  position: relative;
  z-index: 10;
  transition: width 0.2s ease, min-width 0.2s ease, flex-basis 0.2s ease;
}

chat-sidebar[resizing] {
  transition: none;
}

chat-sidebar[resizing] .chat-nav {
  transition: none;
}

chat-sidebar-item, chat-sidebar-sub-item {
  display: block;
}

.chat-nav {
  height: 100%;
  width: var(--chat-nav-width, 200px);
  min-width: var(--chat-nav-width, 200px);
  flex-shrink: 0;
  position: relative;
  display: flex;
  flex-direction: column;
  border-right: none;
  background: var(--sn-node-bg);
  overflow: hidden;
  transition: width 0.2s ease, min-width 0.2s ease;
  user-select: none;
}

.chat-nav[collapsed] {
  width: var(--chat-nav-width, 48px);
  min-width: var(--chat-nav-width, 48px);
  overflow: visible;
}

.chat-nav[resizing],
.chat-nav[resizing] + * {
  user-select: none;
}

.chat-nav-resize-handle {
  position: absolute;
  top: 0;
  right: -1px;
  bottom: 0;
  width: 4px;
  cursor: col-resize;
  background: transparent;
  z-index: 20;
  transition: background 0.15s ease;
}

.chat-nav-resize-handle:hover,
.chat-nav-resize-handle.dragging,
.chat-nav[resizing] .chat-nav-resize-handle {
  background: rgba(255, 255, 255, 0.08);
}

.chat-nav-header {
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 2px 4px;
  min-height: 28px;
  background: var(--bg-header, var(--sn-node-bg));
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
  color: var(--sn-text-dim);
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
.chat-nav[collapsed] .chat-item-adapter {
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
  color: var(--sn-text-dim);
  font-size: 0.75rem;
  transition: background 0.1s, color 0.1s;
  flex-shrink: 0;
}

.nav-btn .material-symbols-outlined { font-size: 16px; }

.nav-btn:hover {
  background: var(--sn-node-hover);
  color: var(--sn-text);
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
  color: var(--sn-text-dim);
  transition: background 0.12s, color 0.12s;
  white-space: nowrap;
  overflow: hidden;
}

.chat-item:hover {
  background: var(--sn-node-hover);
  color: var(--sn-text);
}

.chat-item[data-active],
chat-sidebar-item[data-active] > .chat-item,
chat-sidebar-sub-item[data-active] > .chat-item-child {
  color: var(--sn-text);
  background: var(--sn-node-hover);
  border-left: 2px solid var(--sn-cat-server, #5cb8ff);
  padding-left: 12px;
}

.chat-item .material-symbols-outlined,
.chat-item-child .material-symbols-outlined {
  font-size: 16px;
  flex-shrink: 0;
}

.chat-item-icon-slot {
  position: relative;
  width: 16px;
  height: 16px;
  flex: 0 0 16px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.chat-item-icon {
  transition: opacity 0.12s;
}

.chat-item-label {
  font-size: 11px;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--sn-text);
}

.chat-status-container {
  display: flex;
  align-items: center;
}

.chat-item-adapter {
  font-size: 9px;
  color: var(--sn-text-dim);
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
  position: absolute;
  inset: 0;
  display: flex;
  width: 16px;
  height: 16px;
  border: none;
  background: transparent;
  color: var(--sn-text-dim);
  cursor: pointer;
  font-size: 14px;
  padding: 0;
  align-items: center;
  justify-content: center;
  border-radius: 3px;
  margin: 0;
  opacity: 0;
  pointer-events: none;
  transition: color 0.12s, opacity 0.12s;
}

.chat-item-delete .material-symbols-outlined {
  font-size: 15px;
}

.chat-item:hover .chat-item-icon,
.chat-item-child:hover .chat-item-icon {
  opacity: 0;
}

.chat-item:hover .chat-item-delete,
.chat-item-child:hover .chat-item-delete {
  opacity: 1;
  pointer-events: auto;
}

.chat-item-delete:hover { color: var(--sn-danger-color); }

.chat-nav[collapsed] .chat-item {
  position: relative;
  justify-content: center;
  padding: 0;
  overflow: visible;
}

.chat-nav[collapsed] .chat-item::after {
  content: '';
  position: absolute;
  top: 0;
  right: -48px;
  bottom: 0;
  width: 48px;
}

.chat-nav[collapsed] .chat-item-icon-slot {
  position: static;
}

.chat-nav[collapsed] .chat-item:hover .chat-item-icon,
.chat-nav[collapsed] .chat-item-child:hover .chat-item-icon {
  opacity: 1;
}

.chat-nav[collapsed] .chat-item-delete {
  inset: auto -48px 0 auto;
  top: 0;
  width: 48px;
  height: 100%;
  background: var(--sn-node-bg);
  border-radius: 0 4px 4px 0;
  box-shadow: 2px 0 4px rgba(0, 0, 0, 0.1);
  z-index: 30;
  transition: color 0.12s, opacity 0.12s;
}

.chat-nav[collapsed] .chat-item:hover .chat-item-delete,
.chat-nav[collapsed] .chat-item:focus-within .chat-item-delete,
.chat-nav[collapsed] .chat-item-child:hover .chat-item-delete,
.chat-nav[collapsed] .chat-item-child:focus-within .chat-item-delete {
  opacity: 1;
  pointer-events: auto;
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
  color: var(--sn-text-dim);
  cursor: pointer;
  transition: background 0.12s, color 0.12s;
}

.chat-item-child:hover {
  background: var(--sn-node-hover);
  color: var(--sn-text);
}

.chat-item-child::before {
  content: '';
  position: absolute;
  left: 20px;
  top: 0;
  bottom: 0;
  width: 1px;
  background: var(--sn-node-hover);
}

.chat-nav[collapsed] .chat-sub-items,
.chat-nav[collapsed] .chat-expand-icon,
.chat-nav[collapsed] .chat-status-container {
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

.chat-view::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 20px;
  background: linear-gradient(to bottom, var(--sn-bg, #1a1a1a) 0%, transparent 100%);
  z-index: 2;
  pointer-events: none;
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
  position: relative;
  z-index: 1;
}

chat-message-item {
  display: contents;
}

.scroll-bottom-btn {
  position: absolute;
  left: 50%;
  bottom: 92px;
  z-index: 30;
  width: 32px;
  height: 32px;
  border: none;
  border-radius: 50%;
  background: var(--sn-node-bg, #222222);
  color: var(--sn-text-dim, #a0a0a0);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  opacity: 0;
  pointer-events: none;
  transform: translateX(-50%) translateY(4px);
  box-shadow: var(--sn-shadow-lg, 0 6px 18px rgba(0, 0, 0, 0.28));
  transition: opacity 0.15s ease, transform 0.15s ease, background 0.12s ease, color 0.12s ease;
}

.scroll-bottom-btn.visible {
  opacity: 1;
  pointer-events: auto;
  transform: translateX(-50%) translateY(0);
}

.scroll-bottom-btn:hover {
  background: var(--sn-node-hover, #444444);
  color: var(--sn-text, #f0f0f0);
}

.scroll-bottom-btn .material-symbols-outlined {
  font-size: 18px;
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
  border-radius: 16px;
  width: 100%;
  line-height: 1.5;
  word-break: break-word;
}

.message.user .msg-content {
  background: var(--sn-node-bg);
  color: var(--sn-text);
}

.message.agent .msg-content {
  background: var(--sn-node-bg);
  color: var(--sn-text);
  line-height: 1.5;
}

.message.agent {
  flex-direction: column;
}

.message.system {
  align-self: center;
  font-size: 11px;
  max-width: 90%;
  color: var(--sn-text-dim);
}
.message.system .msg-content {
  background: transparent;
  text-align: center;
  font-style: italic;
  padding: 4px;
}

/* ── Composer (input area) ── */

.chat-composer {
  --chat-composer-bg: var(--sn-node-bg, #222222);
  --chat-composer-action-bg: var(--sn-node-hover, #444444);
  padding: 12px 20px 16px;
  position: relative;
  z-index: 2;
}

.composer-body {
  display: flex;
  align-items: flex-end;
  gap: 8px;
  background: var(--chat-composer-bg);
  border-radius: 20px;
  padding: 8px 8px 8px 16px;
  transition: background 0.15s;
}

.composer-body:focus-within {
  background: var(--chat-composer-bg);
}

.composer-body textarea {
  flex: 1;
  background: transparent;
  border: none;
  color: var(--sn-text);
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
  color: var(--sn-text-dim);
}

.btn-send {
  width: 32px;
  height: 32px;
  min-width: 32px;
  border-radius: 50%;
  border: none;
  background: var(--chat-composer-action-bg);
  color: var(--sn-text-dim, #a0a0a0);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  box-shadow: var(--sn-shadow-sm, 0 1px 4px rgba(0, 0, 0, 0.22));
  transition: background 0.15s, box-shadow 0.15s, transform 0.1s;
}

.btn-send .material-symbols-outlined {
  font-size: 18px;
}

.btn-send:hover {
  background: color-mix(in srgb, var(--chat-composer-action-bg) 78%, var(--sn-text, #ffffff) 12%);
  color: var(--sn-text, #f0f0f0);
  box-shadow: var(--sn-shadow-md, 0 2px 8px rgba(0, 0, 0, 0.28));
  transform: scale(1.05);
}

.btn-send:focus-visible {
  outline: 2px solid color-mix(in srgb, var(--sn-text-dim, #a0a0a0) 50%, transparent);
  outline-offset: 2px;
}

.btn-send:disabled {
  opacity: 0.3;
  cursor: default;
  transform: none;
}

.btn-send.btn-stop {
  background: var(--sn-danger-color);
  color: var(--sn-text, #ffffff);
}

.btn-send.btn-stop:hover {
  background: var(--sn-danger-color);
  color: var(--sn-text, #ffffff);
}

.btn-send.btn-stop .material-symbols-outlined {
  font-variation-settings: 'FILL' 1;
}

/* Composer footer (model & mode selectors) */

.composer-footer {
  container: composer-footer / inline-size;
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 16px 0;
  min-height: 0;
  overflow: hidden;
}

.composer-footer:empty {
  display: none;
}

.composer-footer-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  min-height: 24px;
  padding: 3px 8px;
  border-radius: 8px;
  border: none;
  background: transparent;
  color: var(--sn-text-dim);
  font-size: 11px;
  font-family: inherit;
  cursor: pointer;
  transition: background 0.12s, color 0.12s;
  white-space: nowrap;
  min-width: 0;
  flex: 0 1 auto;
}

.composer-footer-btn:hover {
  background: var(--sn-node-hover);
  color: var(--sn-text);
}

.composer-footer-btn .material-symbols-outlined {
  font-size: 14px;
  opacity: 0.75;
  flex: 0 0 auto;
}

.composer-footer-btn:hover .material-symbols-outlined {
  opacity: 1;
}

.composer-footer-select {
  background: transparent;
  border: none;
  color: var(--sn-text-dim);
  font-size: 11px;
  font-family: inherit;
  font-weight: 500;
  outline: none;
  cursor: pointer;
  appearance: none;
  field-sizing: content;
  width: fit-content;
  padding: 0 12px 0 0;
  background-image: url("data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%228%22%20height%3D%228%22%20viewBox%3D%220%200%208%208%22%3E%3Cpath%20fill%3D%22%23888%22%20d%3D%22M2%203L4%206L6%203H2Z%22%2F%3E%3C%2Fsvg%3E");
  background-repeat: no-repeat;
  background-position: right center;
  background-size: 8px;
  min-width: 0;
  max-width: 160px;
  text-overflow: ellipsis;
}

.composer-footer-select option {
  background: var(--sn-node-bg);
  color: var(--sn-text);
}

.composer-param-model .composer-footer-select {
  max-width: 190px;
}

.composer-toggle-icon {
  font-size: 20px !important;
}

.composer-footer-label {
  overflow: hidden;
  text-overflow: ellipsis;
}

.composer-param-collapsed .composer-footer-select,
.composer-param-collapsed .composer-footer-label {
  width: 10px;
  max-width: 10px;
  padding-right: 10px;
  color: transparent !important;
}

@container composer-footer (width <= 560px) {
  .composer-priority-1 .composer-footer-select,
  .composer-priority-1 .composer-footer-label {
    width: 10px;
    max-width: 10px;
    padding-right: 10px;
    color: transparent !important;
  }
}

@container composer-footer (width <= 500px) {
  .composer-priority-2 .composer-footer-select,
  .composer-priority-2 .composer-footer-label {
    width: 10px;
    max-width: 10px;
    padding-right: 10px;
    color: transparent !important;
  }
}

@container composer-footer (width <= 440px) {
  .composer-priority-3 .composer-footer-select,
  .composer-priority-3 .composer-footer-label {
    width: 10px;
    max-width: 10px;
    padding-right: 10px;
    color: transparent !important;
  }
}

@container composer-footer (width <= 380px) {
  .composer-priority-4 .composer-footer-select,
  .composer-priority-4 .composer-footer-label {
    width: 10px;
    max-width: 10px;
    padding-right: 10px;
    color: transparent !important;
  }
}

@container composer-footer (width <= 320px) {
  .composer-priority-5 .composer-footer-select,
  .composer-priority-5 .composer-footer-label {
    width: 10px;
    max-width: 10px;
    padding-right: 10px;
    color: transparent !important;
  }
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
  background: var(--sn-node-hover);
  border-radius: 6px;
  padding: 3px 8px;
  font-size: 11px;
  color: var(--sn-text-dim);
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
  color: var(--sn-text-dim);
  cursor: pointer;
  padding: 0 2px;
  font-size: 14px;
  line-height: 1;
}

.context-remove:hover {
  color: var(--sn-danger-color);
}

/* Drag-over state */
.chat-composer.drag-over .composer-body {
  background: var(--chat-composer-action-bg);
  outline: 1px dashed var(--sn-node-border);
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
  background: color-mix(in srgb, var(--sn-node-bg, #222222) 95%, transparent);
  border: 1px solid color-mix(in srgb, var(--sn-node-hover, #444444) 45%, transparent);
  border-radius: 16px;
  padding: 4px;
  margin-bottom: 6px;
  box-shadow: var(--sn-shadow-xl, 0 -8px 28px rgba(0, 0, 0, 0.32));
  z-index: 10;
  backdrop-filter: blur(8px);
}

.autocomplete-popup.visible {
  display: block;
}

.autocomplete-header {
  padding: 6px 10px 4px;
  font-size: 10px;
  font-weight: 600;
  color: var(--sn-text-dim);
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
  color: var(--sn-text);
  opacity: 0.75;
  transition: background 0.1s, opacity 0.1s, color 0.1s;
}

.autocomplete-item:hover,
.autocomplete-item.active {
  background: var(--sn-node-hover);
  color: var(--sn-text);
  opacity: 1;
}

.autocomplete-item .material-symbols-outlined {
  font-size: 16px;
  color: var(--sn-text-dim);
}

.autocomplete-item-label {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.autocomplete-item-hint {
  font-size: 10px;
  color: var(--sn-text-dim);
}

/* ── Tool Call Cards ── */

.message.tool {
  align-self: flex-start;
  max-width: 100%;
  width: 100%;
}

.tool-card {
  border-radius: 12px;
  background: var(--sn-node-hover);
  overflow: hidden;
  transition: background 0.15s ease;
}

.tool-card[open] {
  background: var(--sn-node-hover);
}

.tool-header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  font-size: 12px;
  font-weight: 600;
  color: var(--sn-text-dim);
  cursor: pointer;
  user-select: none;
  list-style: none;
}

.tool-header::-webkit-details-marker { display: none; }

.tool-header::before {
  content: '▸';
  font-size: 10px;
  transition: transform 0.15s ease;
  color: var(--sn-text-dim);
}

.tool-card[open] .tool-header::before {
  transform: rotate(90deg);
}

.tool-header .material-symbols-outlined {
  font-size: 14px;
  color: var(--sn-text-dim);
}

.tool-card[open] .tool-header {
  border-bottom: none;
  color: var(--sn-text);
}

.tool-card[open] .tool-header .material-symbols-outlined {
  color: var(--sn-text-dim);
}

.tool-section {
  padding: 8px 12px;
}

.tool-label {
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--sn-text-dim);
  margin-bottom: 4px;
}

.tool-code {
  background: var(--sn-bg);
  border-radius: 6px;
  padding: 8px;
  font-family: var(--sn-font-mono, 'JetBrains Mono', monospace);
  font-size: 11px;
  color: var(--sn-text-dim);
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
  color: var(--sn-text-dim);
  font-style: italic;
  font-size: 11px;
}

.streaming-cursor {
  display: inline-block;
  width: 6px;
  height: 14px;
  background-color: var(--sn-text-dim);
  vertical-align: middle;
  margin-left: 4px;
  animation: blink 1s step-end infinite;
}

@keyframes blink {
  50% { opacity: 0; }
}

.md-code-block {
  background: var(--sn-bg);
  border-radius: 8px;
  padding: 12px;
  overflow-x: auto;
  margin: 6px 0;
  font-family: var(--sn-font-mono, 'JetBrains Mono', monospace);
  font-size: 12px;
  white-space: pre;
}

.md-inline-code {
  background: var(--sn-node-hover);
  padding: 2px 5px;
  border-radius: 4px;
  font-family: var(--sn-font-mono, 'JetBrains Mono', monospace);
  font-size: 11px;
  color: var(--sn-text);
}

.markdown-mention {
  color: var(--sn-node-selected);
  background: var(--sn-accent-bg, rgba(100, 181, 246, 0.1));
  padding: 1px 4px;
  border-radius: 4px;
  font-weight: 500;
  word-break: break-all;
}

.md-link {
  color: var(--sn-text-dim);
  text-decoration: underline;
  text-decoration-color: var(--sn-node-border);
}

.md-link:hover {
  color: var(--sn-text);
}

/* Extended Markdown Styles */
.md-h { margin: 16px 0 8px; color: var(--sn-text); font-weight: 700; }
h1.md-h { font-size: 20px; border-bottom: 1px solid var(--sn-node-border); padding-bottom: 6px; }
h2.md-h { font-size: 18px; border-bottom: 1px solid var(--sn-node-border); padding-bottom: 4px; }
h3.md-h { font-size: 16px; }
h4.md-h { font-size: 14px; }
.md-p { margin: 0; }
.md-quote {
  margin: 8px 0;
  padding: 8px 16px;
  border-left: 4px solid var(--sn-node-selected);
  background: var(--sn-accent-bg-subtle, rgba(100, 181, 246, 0.05));
  border-radius: 0 4px 4px 0;
  font-style: italic;
  color: var(--sn-text-dim);
}
.md-list { margin: 8px 0; padding-left: 24px; }
.md-list li { margin: 3px 0; }
.md-img {
  max-width: 100%;
  height: auto;
  border-radius: 6px;
  margin: 8px 0;
  border: 1px solid var(--sn-node-border);
}
.md-hr {
  border: none;
  border-top: 1px solid var(--sn-node-border);
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
  border: 1px solid var(--sn-node-border);
  text-align: left;
}
.md-table th { background: var(--sn-node-hover); font-weight: 600; }
.md-table tr:hover td { background: var(--sn-node-hover); }

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

.work-summary-wrap {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  opacity: 0;
  transform: translateY(-2px);
  transition: opacity 0.12s ease, transform 0.12s ease;
}

.message.agent:hover .work-summary-wrap,
.message.agent:focus-within .work-summary-wrap,
.work-summary-wrap:focus-within {
  opacity: 1;
  transform: translateY(0);
}

.thinking-block,
.work-summary {
  font-size: 12px;
  color: var(--sn-text-dim);
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
  color: var(--sn-success-color);
}

.work-copy-btn {
  width: 24px;
  height: 24px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--sn-text-dim);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  opacity: 0.75;
  transition: background 0.12s ease, color 0.12s ease, opacity 0.12s ease;
}

.work-copy-btn:hover {
  background: var(--sn-node-hover);
  color: var(--sn-text);
  opacity: 1;
}

.work-copy-btn .material-symbols-outlined {
  font-size: 15px;
}

.work-copy-btn.copied {
  color: var(--sn-success-color);
}

.work-copy-btn.copy-error {
  color: var(--sn-danger-color);
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
  background: var(--sn-node-hover);
  color: var(--sn-text-dim);
  white-space: nowrap;
  font-family: var(--sn-font-mono, monospace);
  letter-spacing: 0.2px;
}

.meta-chip.meta-ok {
  color: var(--sn-success-color);
  background: hsla(140, 40%, 50%, 0.1);
}

.meta-chip.meta-err {
  color: var(--sn-danger-color);
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
  color: var(--sn-text-dim);
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
  background: var(--sn-node-hover);
  border: 1px solid var(--sn-node-hover);
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
  background: var(--card-accent, var(--sn-node-hover));
  transition: background 0.3s ease;
}

.delegation-card[data-status="running"] {
  border-color: var(--sn-accent-border, rgba(120, 180, 255, 0.15));
  --card-accent: var(--sn-cat-server, hsl(215, 70%, 55%));
}

.delegation-card[data-status="running"]::before {
  animation: card-progress 1.8s ease-in-out infinite;
}

@keyframes card-progress {
  0%, 100% { opacity: 0.5; }
  50% { opacity: 1; }
}

.delegation-card[data-status="done"] {
  border-color: var(--sn-success-border, rgba(100, 200, 120, 0.12));
  --card-accent: var(--sn-success-color);
}

.delegation-card[data-status="error"] {
  border-color: var(--sn-danger-border, rgba(220, 100, 100, 0.12));
  --card-accent: var(--sn-danger-color);
}

.delegation-card-linked {
  cursor: pointer;
}

.delegation-card-linked:hover {
  border-color: var(--sn-node-border);
  box-shadow: var(--sn-accent-glow, 0 0 12px rgba(120, 180, 255, 0.08));
}

.delegation-card-header {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  font-weight: 500;
  color: var(--sn-text);
}

.delegation-card-header .material-symbols-outlined {
  font-size: 16px;
}

.delegation-card-header .spin-icon {
  animation: spin 1.2s linear infinite;
}

.delegation-card-status {
  font-size: 11px;
  color: var(--sn-text-dim);
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
  background: var(--bg-surface, var(--sn-node-bg));
  color: var(--text-dim, var(--sn-text-dim));
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 11px;
  white-space: nowrap;
  max-width: 120px;
  overflow: hidden;
  text-overflow: ellipsis;
  border: 1px solid var(--border-color, var(--sn-node-border));
}

.delegation-card-event[data-type="tool_use"],
.delegation-card-event[data-type="tool_result"] {
  color: var(--text-color, var(--sn-text));
  border-color: var(--accent-color, #1976d2);
  background: var(--sn-accent-bg, rgba(25, 118, 210, 0.1));
}

.delegation-card-event[data-status="error"] {
  color: var(--sn-danger-color);
  border-color: var(--sn-danger-color);
  background: var(--sn-danger-bg, rgba(255, 82, 82, 0.1));
}

.delegation-card-event[data-type="message"] {
  color: var(--sn-cat-server, hsl(215, 50%, 60%));
  background: hsla(215, 50%, 60%, 0.08);
}

/* ── Live Status Indicator (server-authoritative streaming) ── */

.live-status-indicator {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  font-size: 12px;
  color: var(--sn-text-dim);
  animation: status-fade-in 0.2s ease;
}

.live-status-indicator .material-symbols-outlined {
  color: var(--sn-cat-server, hsl(215, 60%, 55%));
}

@keyframes status-fade-in {
  from { opacity: 0; transform: translateY(4px); }
  to { opacity: 1; transform: translateY(0); }
}
`;
