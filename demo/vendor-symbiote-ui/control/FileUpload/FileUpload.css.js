export default /*css*/ `
sn-file-upload {
  display: block;
  font-family: var(--sn-font, sans-serif);
  width: 100%;
}

.sn-file-container {
  display: flex;
  flex-direction: column;
  gap: var(--sn-step-4);
  width: 100%;
}

.sn-file-dropzone {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  border: 2px dashed var(--sn-outline-color-soft, var(--sn-sys-outline-subtle));
  border-radius: var(--sn-panel-radius, 6px);
  padding: calc(var(--sn-step-10, 24px) * var(--sn-theme-density, 1)) calc(var(--sn-step-8, 16px) * var(--sn-theme-density, 1));
  background: var(--sn-field-control-bg, var(--sn-sys-surface));
  color: var(--sn-sys-on-surface-dim);
  cursor: pointer;
  transition: border-color var(--sn-transition-fast, 120ms), background-color var(--sn-transition-fast, 120ms);
}

.sn-file-dropzone:hover,
.sn-file-dropzone[data-dragover] {
  border-color: var(--sn-sys-accent);
  background-color: color-mix(in oklch, var(--sn-sys-accent) var(--sn-sys-state-hover-mix), var(--sn-sys-surface));
  color: var(--sn-sys-on-surface);
}

.sn-file-dropzone:focus-visible {
  outline: var(--sn-file-dropzone-focus-ring, 2px solid var(--sn-sys-focus-ring, currentColor));
  outline-offset: 2px;
}

.sn-file-live {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px; /* audit-ok: fixed visually-hidden live-region idiom, not themeable */
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

.sn-file-dropzone-icon {
  font-size: var(--sn-text-2xl, 32px);
  margin-bottom: var(--sn-step-4);
}

.sn-file-dropzone-text {
  font-size: calc(var(--sn-text-md, 13px) * var(--sn-theme-type-scale, 1));
  text-align: center;
}

.sn-file-list {
  display: flex;
  flex-direction: column;
  gap: var(--sn-step-3);
}

.sn-file-native-input {
  display: none;
}

.sn-file-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--sn-step-3) var(--sn-step-5);
  background: var(--sn-sys-surface-panel);
  border: 1px solid var(--sn-outline-color-soft, var(--sn-sys-outline-subtle));
  border-radius: var(--sn-radius-sm);
  font-size: calc(var(--sn-text-sm, 12px) * var(--sn-theme-type-scale, 1));
}

.sn-file-item-info {
  display: flex;
  flex-direction: column;
  gap: var(--sn-step-1);
}

.sn-file-item-name {
  color: var(--sn-sys-on-surface);
  font-weight: 500;
  word-break: break-all;
}

.sn-file-item-size {
  color: var(--sn-sys-on-surface-dim);
  font-size: var(--sn-text-xs);
}

.sn-file-item-remove {
  background: none;
  border: none;
  color: var(--sn-sys-on-surface-dim);
  cursor: pointer;
  padding: var(--sn-step-1);
  border-radius: var(--sn-radius-sm);
}

.sn-file-item-remove:hover {
  color: var(--sn-status-error, var(--sn-sys-danger));
  background-color: color-mix(in oklch, var(--sn-sys-accent) var(--sn-sys-state-hover-mix), var(--sn-sys-surface-panel));
}

sn-file-upload[disabled] .sn-file-dropzone {
  cursor: not-allowed;
  opacity: 0.6;
}
`;
