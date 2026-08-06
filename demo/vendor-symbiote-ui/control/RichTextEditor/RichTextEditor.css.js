import { themedScrollFadeBlockStyles } from '../../themes/scroll-fade-styles.js';

export default /*css*/ `
sn-rich-text-editor {
  display: block;
  font-family: var(--sn-font, sans-serif);
  width: 100%;
  box-sizing: border-box;
}

.sn-editor-container {
  display: flex;
  flex-direction: column;
  background: var(--sn-field-control-bg, var(--sn-sys-surface));
  border: 1px solid var(--sn-field-control-border, var(--sn-outline-color-soft, var(--sn-sys-outline-subtle)));
  border-radius: var(--sn-panel-radius, 6px);
  overflow: hidden;
  width: 100%;
}

.sn-editor-toolbar {
  position: relative;
  display: flex;
  flex-wrap: wrap;
  gap: var(--sn-step-2);
  padding: var(--sn-step-3);
  background-color: var(--sn-sys-surface-panel);
  border-bottom: 1px solid var(--sn-outline-color-soft, var(--sn-sys-outline-subtle));
}

.sn-editor-btn {
  background: none;
  border: none;
  color: var(--sn-sys-on-surface-dim);
  cursor: pointer;
  padding: var(--sn-step-2);
  border-radius: var(--sn-radius-sm);
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.sn-editor-btn:hover {
  color: var(--sn-sys-on-surface);
  background-color: color-mix(in oklch, var(--sn-sys-accent) var(--sn-sys-state-hover-mix), var(--sn-sys-surface-panel));
}

.sn-editor-btn[data-active] {
  color: var(--sn-sys-accent);
  background-color: color-mix(in oklab, var(--sn-sys-accent) 10%, transparent);
}

.sn-editor-icon {
  font-size: var(--sn-text-2xl);
}

.sn-editor-link-overlay {
  display: flex;
  align-items: center;
  gap: var(--sn-step-3);
  position: absolute;
  right: var(--sn-step-3);
  top: 50%;
  transform: translateY(-50%);
  background-color: var(--sn-sys-surface-panel);
  border: 1px solid var(--sn-outline-color-soft, var(--sn-sys-outline-subtle));
  border-radius: var(--sn-radius-sm);
  padding: var(--sn-step-2) var(--sn-step-3);
  z-index: 10;
  box-shadow: 0 2px 8px var(--sn-shadow-color, var(--sn-sys-shadow-overlay));
}

.sn-editor-link-overlay[hidden] {
  display: none;
}

.sn-editor-link-input {
  background: var(--sn-field-control-bg, var(--sn-sys-surface));
  border: 1px solid var(--sn-outline-color-soft, var(--sn-sys-outline-subtle));
  border-radius: var(--sn-radius-sm);
  color: var(--sn-sys-on-surface);
  padding: var(--sn-step-2) var(--sn-step-4);
  font-size: var(--sn-text-sm);
  outline: none;
}

.sn-editor-link-input:focus {
  border-color: var(--sn-sys-accent);
  box-shadow: 0 0 0 1px color-mix(in oklch, var(--sn-sys-accent) var(--sn-sys-state-selected-mix), transparent);
}

.sn-editor-link-btn {
  background: color-mix(in oklch, var(--sn-sys-accent) var(--sn-sys-state-hover-mix), var(--sn-sys-surface-panel));
  border: 1px solid var(--sn-outline-color-soft, var(--sn-sys-outline-subtle));
  color: var(--sn-sys-on-surface);
  border-radius: var(--sn-radius-sm);
  padding: var(--sn-step-2) var(--sn-step-4);
  font-size: var(--sn-text-sm);
  cursor: pointer;
}

.sn-editor-link-btn:hover {
  background: color-mix(in oklch, var(--sn-sys-accent) var(--sn-sys-state-pressed-mix), var(--sn-sys-surface-panel));
}

.sn-editor-link-btn.confirm {
  background: var(--sn-sys-accent);
  color: var(--sn-sys-on-surface);
  border: none;
}

.sn-editor-link-btn.confirm:hover {
  background: color-mix(in oklch, var(--sn-sys-on-surface) var(--sn-sys-state-hover-mix), var(--sn-sys-accent));
}

.sn-editor-body {
  min-height: 120px;
  max-height: 300px;
  overflow-y: auto;
  ${themedScrollFadeBlockStyles}
  padding: var(--sn-step-6);
  color: var(--sn-sys-on-surface);
  font-size: calc(var(--sn-text-md, 13px) * var(--sn-theme-type-scale, 1));
  outline: none;
  box-sizing: border-box;
  background-color: transparent;
}

sn-rich-text-editor[disabled] .sn-editor-container {
  cursor: not-allowed;
  opacity: 0.6;
}
`;
