export default `
:host {
  display: block;
}

pg-agent-chat {
  display: block;
  height: 100%;
  overflow: hidden;
  font-family: var(--sn-font);
}

.chat-shell {
  display: flex;
  height: 100%;
  background: var(--sn-bg);
  color: var(--sn-text);
  font-size: 13px;
}

/* ── Chat Nav (unchanged) ── */

/* ── Chat View ── */

.chat-view {
  flex: 1;
  display: flex;
  flex-direction: column;
  height: 100%;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  position: relative;
}

.chat-view:not([empty]) chat-transcript {
  display: flex;
  flex: 1 1 auto;
  min-height: 0;
  overflow: hidden;
}

.chat-view:not([empty]) chat-composer {
  flex: 0 0 auto;
}

.chat-view::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 20px;
  background: linear-gradient(to bottom, var(--sn-bg) 0%, transparent 100%);
  z-index: 2;
  pointer-events: none;
}

/* Empty state: composer centered */
.chat-view[empty] {
  justify-content: center;
  align-items: center;
}

.chat-view[empty] chat-transcript {
  display: none;
}

.chat-view[empty] chat-composer {
  position: relative;
  max-width: 640px;
  width: 90%;
}

/* Placeholder: 59% more faded than default */
chat-composer .composer-body textarea::placeholder {
  opacity: 0.41;
}

/* ── Mic button ── */
chat-composer .btn-mic {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  border: none;
  background: transparent;
  color: var(--sn-text-dim);
  cursor: pointer;
  transition: color 0.15s, background 0.15s;
  flex: 0 0 auto;
}

chat-composer .btn-mic:hover {
  color: var(--sn-text);
  background: var(--sn-node-hover);
}

chat-composer .btn-mic.recording {
  color: var(--sn-danger-color);
  animation: mic-pulse 1.5s ease-in-out infinite;
}

chat-composer .btn-mic.recording .material-symbols-outlined {
  font-variation-settings: 'FILL' 1;
}

chat-composer .btn-mic.processing {
  color: var(--sn-text-dim);
  pointer-events: none;
}

chat-composer .btn-mic.processing .material-symbols-outlined {
  animation: spin 1s linear infinite;
}

@keyframes mic-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

@keyframes spin {
  100% { transform: rotate(360deg); }
}

chat-composer .btn-mic .material-symbols-outlined {
  font-size: 18px;
}

/* ── Voice Preview Banner ── */
.voice-preview {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 10px 16px;
  margin: 0 0 4px;
  border-radius: 12px;
  background: var(--sn-node-hover);
  border: 1px solid var(--sn-node-border);
  animation: voice-preview-in 0.15s ease;
}

@keyframes voice-preview-in {
  from { opacity: 0; transform: translateY(4px); }
  to { opacity: 1; transform: translateY(0); }
}

.voice-preview.recording {
  border-color: color-mix(in srgb, var(--sn-danger-color) 40%, transparent);
}

.voice-preview.processing {
  border-color: var(--sn-node-border);
}

.voice-preview.result {
  border-color: color-mix(in srgb, var(--sn-node-selected) 40%, transparent);
}

.voice-preview-body {
  flex: 1;
  font-size: 13px;
  line-height: 1.5;
  color: var(--sn-text);
  min-height: 20px;
  outline: none;
  word-break: break-word;
}

.voice-preview-body.voice-preview-elapsed {
  color: var(--sn-text-dim);
  font-size: 12px;
  font-family: var(--sn-font-mono);
}

.voice-preview.recording .voice-preview-body.voice-preview-elapsed {
  color: var(--sn-danger-color);
}

.voice-preview-body[contenteditable="true"] {
  cursor: text;
  border-radius: 4px;
  padding: 2px 4px;
  margin: -2px -4px;
}

.voice-preview-body[contenteditable="true"]:focus {
  background: var(--sn-bg);
}

.voice-preview-actions {
  display: flex;
  gap: 4px;
  flex: 0 0 auto;
}

.voice-preview-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  border: none;
  cursor: pointer;
  transition: background 0.12s, color 0.12s;
}

.voice-preview-btn .material-symbols-outlined {
  font-size: 16px;
}

.voice-preview-btn.stop {
  background: var(--sn-danger-color);
  color: var(--sn-bg);
}

.voice-preview-btn.stop:hover {
  filter: brightness(1.15);
}

.voice-preview-btn.cancel {
  background: transparent;
  color: var(--sn-text-dim);
}

.voice-preview-btn.cancel:hover {
  background: var(--sn-node-hover);
  color: var(--sn-text);
}

.voice-preview-btn.send {
  background: var(--sn-node-selected);
  color: var(--sn-bg);
}

.voice-preview-btn.send:hover {
  filter: brightness(1.15);
}

`;
