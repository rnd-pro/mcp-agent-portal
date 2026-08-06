import { themedScrollFadeBlockStyles } from '../../themes/scroll-fade-styles.js';

export default /*css*/ `
sn-floating-panel {
  display: block;
  position: fixed;
  font-family: var(--sn-font, sans-serif);
  z-index: 900;
  box-sizing: border-box;
}

.sn-floating-container {
  display: flex;
  flex-direction: column;
  background-color: var(--sn-sys-surface-panel);
  border: 1px solid var(--sn-outline-color-soft, var(--sn-sys-outline-subtle));
  border-radius: var(--sn-panel-radius, 6px);
  box-shadow: var(--sn-panel-shadow, var(--sn-sys-shadow-overlay));
  width: 100%;
  height: 100%;
  overflow: hidden;
  box-sizing: border-box;
}

.sn-floating-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--sn-step-4) var(--sn-step-6);
  background-color: var(--sn-sys-surface-panel);
  border-bottom: 1px solid var(--sn-outline-color-soft, var(--sn-sys-outline-subtle));
  cursor: move;
  user-select: none;
}

.sn-floating-title {
  font-size: calc(var(--sn-text-md, 13px) * var(--sn-theme-type-scale, 1));
  font-weight: 500;
  color: var(--sn-sys-on-surface);
}

.sn-floating-actions {
  display: flex;
  align-items: center;
  gap: var(--sn-step-3);
}

.sn-floating-action-btn {
  background: none;
  border: none;
  color: var(--sn-sys-on-surface-dim);
  cursor: pointer;
  padding: var(--sn-step-1);
  border-radius: var(--sn-radius-sm);
  display: inline-flex;
  align-items: center;
}

.sn-floating-action-btn:hover {
  color: var(--sn-sys-on-surface);
  background-color: color-mix(in oklch, var(--sn-sys-accent) var(--sn-sys-state-hover-mix), var(--sn-sys-surface-panel));
}

.sn-floating-action-icon {
  font-size: var(--sn-text-xl);
}

.sn-floating-action-btn[data-action="close"]:hover {
  background-color: color-mix(in oklch, var(--sn-sys-danger) var(--sn-sys-state-hover-mix), var(--sn-sys-surface-panel));
  color: var(--sn-sys-danger);
}

.sn-floating-body {
  flex: 1;
  overflow: auto;
  ${themedScrollFadeBlockStyles}
  padding: var(--sn-step-6);
  box-sizing: border-box;
}

sn-floating-panel[minimized] {
  height: auto !important;
}

sn-floating-panel[minimized] .sn-floating-body {
  display: none;
}

sn-floating-panel[maximized] {
  top: 0 !important;
  left: 0 !important;
  width: 100vw !important;
  height: 100vh !important;
}
`;
