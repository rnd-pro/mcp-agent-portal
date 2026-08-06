import { themedScrollFadeBlockStyles } from '../../themes/scroll-fade-styles.js';

export default /*css*/ `
sn-dialog {
  --sn-dialog-backdrop-bg: var(--sn-sys-scrim);

  display: contents;
}

.sn-dialog {
  padding: 0;
  border: none;
  background: transparent;
  color: var(--sn-sys-on-surface);
  max-width: min(calc(100% - 32px), var(--sn-dialog-max-width, 560px));
  max-height: min(calc(100% - 32px), var(--sn-dialog-max-height, 80vh));
  border-radius: var(--sn-panel-radius, 8px);
  box-shadow: var(--sn-sys-shadow-overlay);
  overflow: hidden;
  box-sizing: border-box;
}

.sn-dialog::backdrop {
  background-color: var(--sn-dialog-backdrop-bg);
  backdrop-filter: blur(4px);
  transition: backdrop-filter var(--sn-transition-normal, 240ms) ease;
}

.sn-dialog-panel {
  display: flex;
  flex-direction: column;
  background-color: var(--sn-sys-surface-overlay);
  border: 1px solid var(--sn-sys-outline-subtle);
  border-radius: var(--sn-panel-radius, 8px);
  overflow: hidden;
}

.sn-dialog-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: calc(var(--sn-step-8, 16px) * var(--sn-theme-density, 1)) calc(var(--sn-step-9, 20px) * var(--sn-theme-density, 1));
  border-bottom: 1px solid var(--sn-sys-outline-subtle);
}

.sn-dialog-title {
  margin: 0;
  font-family: var(--sn-font, sans-serif);
  font-size: calc(var(--sn-text-2xl, 18px) * var(--sn-theme-type-scale, 1) * var(--sn-theme-heading-scale, 1));
  font-weight: 600;
  color: var(--sn-sys-on-surface);
}

.sn-dialog-close-btn {
  background: transparent;
  border: none;
  color: var(--sn-sys-on-surface-dim);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: var(--sn-step-2);
  border-radius: var(--sn-radius-sm);
  transition: background-color var(--sn-transition-fast, 120ms), color var(--sn-transition-fast, 120ms);
}

.sn-dialog-close-btn:hover {
  background-color: color-mix(in oklch, var(--sn-sys-accent) var(--sn-sys-state-hover-mix), transparent);
  color: var(--sn-sys-on-surface);
}

.sn-dialog-close-btn:focus-visible {
  outline: var(--sn-sys-focus-ring-width) solid var(--sn-sys-focus-ring);
  outline-offset: 2px;
  background-color: color-mix(in oklch, var(--sn-sys-accent) var(--sn-sys-state-hover-mix), transparent);
  color: var(--sn-sys-on-surface);
}

.sn-dialog-body {
  padding: calc(var(--sn-step-9, 20px) * var(--sn-theme-density, 1));
  overflow-y: auto;
  ${themedScrollFadeBlockStyles}
  font-family: var(--sn-font, sans-serif);
  font-size: calc(var(--sn-text-md, 13px) * var(--sn-theme-type-scale, 1));
  line-height: 1.5;
}

.sn-dialog-footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: var(--sn-step-6);
  padding: calc(var(--sn-step-8, 16px) * var(--sn-theme-density, 1)) calc(var(--sn-step-9, 20px) * var(--sn-theme-density, 1));
  border-top: 1px solid var(--sn-sys-outline-subtle);
  background-color: var(--sn-sys-surface-toolbar);
}
`;
