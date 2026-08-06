import { themedScrollFadeBlockStyles } from '../../themes/scroll-fade-styles.js';

export default /*css*/ `
sn-transfer {
  display: block;
  font-family: var(--sn-font, sans-serif);
  width: 100%;
}

.sn-transfer-container {
  display: flex;
  align-items: center;
  gap: var(--sn-step-8);
  width: 100%;
}

.sn-transfer-panel {
  flex: 1;
  display: flex;
  flex-direction: column;
  background: var(--sn-field-control-bg, var(--sn-sys-surface));
  border: 1px solid var(--sn-field-control-border, var(--sn-outline-color-soft, var(--sn-sys-outline-subtle)));
  border-radius: var(--sn-panel-radius, 6px);
  min-height: 200px;
  max-height: 300px;
  box-sizing: border-box;
  overflow: hidden;
}

.sn-transfer-panel-header {
  padding: var(--sn-step-4) var(--sn-step-6);
  background: var(--sn-sys-surface-panel);
  border-bottom: 1px solid var(--sn-outline-color-soft, var(--sn-sys-outline-subtle));
  font-size: var(--sn-text-sm);
  color: var(--sn-sys-on-surface);
  font-weight: 500;
}

.sn-transfer-list {
  list-style: none;
  margin: 0;
  padding: var(--sn-step-2);
  overflow-y: auto;
  ${themedScrollFadeBlockStyles}
  flex: 1;
}

.sn-transfer-item {
  display: flex;
  align-items: center;
  gap: var(--sn-step-4);
  padding: calc(6px * var(--sn-theme-density, 1)) calc(8px * var(--sn-theme-density, 1));
  font-size: calc(12px * var(--sn-theme-type-scale, 1));
  color: var(--sn-sys-on-surface);
  border-radius: var(--sn-radius-sm);
  cursor: pointer;
  user-select: none;
}

.sn-transfer-item:hover {
  background-color: color-mix(in oklch, var(--sn-sys-accent) var(--sn-sys-state-hover-mix), var(--sn-sys-surface));
}

.sn-transfer-item:focus-visible {
  outline: var(--sn-focus-outline, 2px solid var(--sn-sys-focus-ring, currentColor));
  outline-offset: var(--sn-sys-focus-ring-offset);
}

.sn-transfer-item[data-selected] {
  background-color: color-mix(in oklab, var(--sn-sys-accent) 10%, transparent);
}

.sn-transfer-buttons {
  display: flex;
  flex-direction: column;
  gap: var(--sn-step-4);
}

.sn-transfer-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  background: var(--sn-sys-surface-panel);
  border: 1px solid var(--sn-outline-color-soft, var(--sn-sys-outline-subtle));
  border-radius: var(--sn-radius-md);
  color: var(--sn-sys-on-surface);
  cursor: pointer;
}

.sn-transfer-btn:hover:not([disabled]) {
  background: color-mix(in oklch, var(--sn-sys-accent) var(--sn-sys-state-hover-mix), var(--sn-sys-surface-panel));
  border-color: var(--sn-sys-accent);
}

.sn-transfer-btn:focus-visible {
  outline: var(--sn-focus-outline, 2px solid var(--sn-sys-focus-ring, currentColor));
  outline-offset: var(--sn-sys-focus-ring-offset);
}

.sn-transfer-btn[disabled] {
  opacity: 0.4;
  cursor: not-allowed;
}

sn-transfer[disabled] .sn-transfer-panel {
  opacity: 0.6;
  cursor: not-allowed;
}
`;
