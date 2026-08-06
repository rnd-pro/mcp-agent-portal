import { themedScrollFadeBlockStyles } from '../../themes/scroll-fade-styles.js';

export default /*css*/ `
sn-combobox {
  display: block;
}

.sn-combobox-wrapper {
  position: relative;
  width: 100%;
}

.sn-combobox-input-container {
  display: flex;
  align-items: center;
  background-color: var(--sn-field-bg, var(--sn-sys-surface-panel));
  border: 1px solid var(--sn-outline-color-soft, var(--sn-sys-outline-subtle));
  border-radius: var(--sn-panel-radius, 8px);
  overflow: hidden;
  box-sizing: border-box;
  transition: border-color var(--sn-transition-fast, 120ms) ease;
}

.sn-combobox-input-container:focus-within {
  border-color: var(--sn-primary, var(--sn-sys-accent));
  box-shadow: 0 0 0 1px color-mix(in oklch, var(--sn-sys-accent) var(--sn-sys-state-selected-mix), transparent);
}

.sn-combobox-input {
  flex: 1;
  background: transparent;
  border: none;
  color: var(--sn-sys-on-surface);
  padding: calc(var(--sn-step-4, 8px) * var(--sn-theme-density, 1)) calc(var(--sn-step-6, 12px) * var(--sn-theme-density, 1));
  font-family: var(--sn-font, sans-serif);
  font-size: calc(var(--sn-text-md, 13px) * var(--sn-theme-type-scale, 1));
  outline: none;
}

.sn-combobox-trigger {
  background: transparent;
  border: none;
  color: var(--sn-sys-on-surface-dim);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: var(--sn-step-4);
  transition: color var(--sn-transition-fast, 120ms);
}

.sn-combobox-trigger:hover {
  background: color-mix(in oklch, var(--sn-sys-accent) var(--sn-sys-state-hover-mix), transparent);
  color: var(--sn-sys-on-surface);
}

.sn-combobox-dropdown {
  display: none;
  position: fixed;
  z-index: var(--sn-overlay-z-base, 20000);
  background-color: var(--sn-sys-surface-panel);
  border: 1px solid var(--sn-outline-color-soft, var(--sn-sys-outline-subtle));
  border-radius: var(--sn-panel-radius, 8px);
  box-shadow: var(--sn-panel-shadow, var(--sn-sys-shadow-overlay));
  max-height: 240px;
  overflow-y: auto;
  ${themedScrollFadeBlockStyles}
  box-sizing: border-box;
  padding: var(--sn-step-2);
}

.sn-combobox-dropdown[data-visible] {
  display: block;
}

.sn-combobox-options {
  list-style: none;
  padding: 0;
  margin: 0;
}

.sn-combobox-option {
  padding: calc(var(--sn-step-4, 8px) * var(--sn-theme-density, 1)) calc(var(--sn-step-6, 12px) * var(--sn-theme-density, 1));
  font-family: var(--sn-font, sans-serif);
  font-size: calc(var(--sn-text-md, 13px) * var(--sn-theme-type-scale, 1));
  color: var(--sn-sys-on-surface);
  border-radius: calc(var(--sn-panel-radius, 8px) - 4px);
  cursor: pointer;
  user-select: none;
  transition: background-color var(--sn-transition-fast, 120ms), color var(--sn-transition-fast, 120ms);
  margin-bottom: var(--sn-step-1);
}

.sn-combobox-option:hover {
  background-color: color-mix(in oklch, var(--sn-sys-accent) var(--sn-sys-state-hover-mix), var(--sn-sys-surface-panel));
}

.sn-combobox-option[data-focused] {
  background-color: var(--sn-sys-accent);
}

.sn-combobox-option[aria-selected="true"] {
  background-color: var(--sn-primary, color-mix(in oklch, var(--sn-sys-accent) var(--sn-sys-state-selected-mix), var(--sn-sys-surface-overlay)));
  color: var(--sn-sys-on-surface);
}

.sn-combobox-empty {
  display: none;
  padding: calc(var(--sn-step-6, 12px) * var(--sn-theme-density, 1));
  text-align: center;
  color: var(--sn-sys-on-surface-dim);
  font-family: var(--sn-font, sans-serif);
  font-size: calc(var(--sn-text-md, 13px) * var(--sn-theme-type-scale, 1));
}

.sn-combobox-empty[data-visible] {
  display: block;
}
`;
