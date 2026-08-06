import { themedScrollFadeBlockStyles } from '../../themes/scroll-fade-styles.js';

export default /*css*/ `
sn-select {
  display: block;
  font-family: var(--sn-font, sans-serif);
  position: relative;
  width: 100%;
  box-sizing: border-box;
}

.sn-select-container {
  position: relative;
  width: 100%;
}

.sn-select-trigger {
  box-sizing: border-box;
  display: inline-flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  min-height: calc(36px * var(--sn-theme-density, 1));
  padding: 0 calc(var(--sn-step-6, 12px) * var(--sn-theme-density, 1));
  background: var(--sn-field-control-bg, var(--sn-sys-surface));
  border: 1px solid var(--sn-field-control-border, var(--sn-outline-color-soft, var(--sn-sys-outline-subtle)));
  border-radius: var(--sn-field-control-radius, var(--sn-panel-radius, 6px));
  color: var(--sn-sys-on-surface);
  font-size: calc(var(--sn-text-md, 13px) * var(--sn-theme-type-scale, 1));
  cursor: pointer;
  text-align: left;
  transition: border-color var(--sn-transition-fast, 120ms), box-shadow var(--sn-transition-fast, 120ms);
}

.sn-select-trigger:focus-visible {
  outline: none;
  border-color: var(--sn-field-control-focus-border, var(--sn-sys-accent));
  box-shadow: 0 0 0 2px color-mix(in oklab, var(--sn-sys-accent) 25%, transparent);
}

.sn-select-arrow {
  color: var(--sn-sys-on-surface-dim);
  transition: transform var(--sn-transition-fast, 120ms) ease;
}

.sn-select-trigger[aria-expanded="true"] .sn-select-arrow {
  transform: rotate(180deg);
}

.sn-select-dropdown {
  display: none;
  position: absolute;
  top: 100%;
  left: 0;
  width: 100%;
  z-index: 1000;
  margin-top: var(--sn-step-2);
  background-color: var(--sn-sys-surface-panel);
  border: 1px solid var(--sn-outline-color-soft, var(--sn-sys-outline-subtle));
  border-radius: var(--sn-panel-radius, 6px);
  box-shadow: var(--sn-panel-shadow, var(--sn-sys-shadow-overlay));
  overflow-y: auto;
  ${themedScrollFadeBlockStyles}
  max-height: 240px;
  box-sizing: border-box;
}

.sn-select-dropdown[data-visible] {
  display: block;
  animation: snSelectFadeIn var(--sn-transition-fast, 120ms) ease;
}

.sn-select-options-list {
  list-style: none;
  margin: 0;
  padding: var(--sn-step-2);
}

.sn-select-option {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: calc(var(--sn-step-4, 8px) * var(--sn-theme-density, 1)) calc(var(--sn-step-6, 12px) * var(--sn-theme-density, 1));
  font-size: calc(var(--sn-text-md, 13px) * var(--sn-theme-type-scale, 1));
  color: var(--sn-sys-on-surface);
  border-radius: calc(var(--sn-panel-radius, 6px) - var(--sn-radius-xs, 2px));
  cursor: pointer;
  user-select: none;
  transition: background-color var(--sn-transition-fast, 120ms), color var(--sn-transition-fast, 120ms);
}

.sn-select-option:hover,
.sn-select-option[data-focused] {
  background-color: color-mix(in oklch, var(--sn-sys-accent) var(--sn-sys-state-hover-mix), var(--sn-sys-surface-panel));
  color: var(--sn-sys-on-surface);
}

.sn-select-option[data-selected] {
  background-color: color-mix(in oklab, var(--sn-sys-accent) 15%, transparent);
  color: var(--sn-sys-accent);
  font-weight: 500;
}

sn-select[disabled] .sn-select-trigger {
  cursor: not-allowed;
  opacity: 0.6;
  background: var(--sn-field-control-disabled-bg, color-mix(in oklab, var(--sn-sys-on-surface) 5%, transparent));
}

sn-select[invalid] .sn-select-trigger {
  border-color: var(--sn-status-error, var(--sn-sys-danger));
}

@keyframes snSelectFadeIn {
  from {
    opacity: 0;
    transform: translateY(-4px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
`;
