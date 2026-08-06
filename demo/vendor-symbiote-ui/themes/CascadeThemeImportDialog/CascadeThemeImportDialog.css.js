export default /*css*/ `
sn-theme-import-dialog {
  display: contents;
}

.sn-theme-import-prompt,
.sn-theme-import-status {
  margin: 0;
}

.sn-theme-import-prompt {
  color: var(--sn-sys-on-surface, #f2f3f5);
}

.sn-theme-import-status {
  margin-block-start: var(--sn-step-8, 16px);
  color: var(--sn-sys-on-surface-dim, #b8bbc2);
  font-size: var(--sn-text-sm, 12px);
}

.sn-theme-import-actions {
  flex-wrap: wrap;
}

.sn-dialog-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: var(--sn-button-min-height, 30px);
  padding: var(--sn-button-padding, 6px 12px);
  border: 1px solid var(--sn-button-border, #737780);
  border-radius: var(--sn-button-radius, 4px);
  background: var(--sn-button-bg, #303236);
  color: var(--sn-button-color, #f2f3f5);
  font: inherit;
  font-size: var(--sn-button-font-size, 12px);
  font-weight: var(--sn-button-font-weight, 500);
  line-height: var(--sn-button-line-height, 1.2);
  cursor: pointer;
}

.sn-dialog-btn:hover:not(:disabled) {
  border-color: var(--sn-button-hover-border, color-mix(in oklch, var(--sn-sys-accent) var(--sn-sys-state-hover-mix), var(--sn-button-border, #737780)));
  background: var(--sn-button-hover-bg, color-mix(in oklch, var(--sn-sys-accent) var(--sn-sys-state-hover-mix), var(--sn-button-bg, #303236)));
}

.sn-dialog-btn:focus-visible {
  outline: 2px solid var(--sn-sys-focus-ring, #8ab4ff);
  outline-offset: 2px;
}

.sn-dialog-btn:disabled {
  opacity: var(--sn-button-disabled-opacity, 0.5);
  cursor: not-allowed;
}

.sn-dialog-btn-primary {
  border-color: var(--sn-button-primary-border, #4d8df7);
  background: var(--sn-button-primary-bg, #4d8df7);
  color: var(--sn-button-primary-color, #101114);
}
`;
