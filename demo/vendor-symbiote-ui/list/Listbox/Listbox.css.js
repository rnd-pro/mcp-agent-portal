import { themedScrollFadeBlockStyles } from '../../themes/scroll-fade-styles.js';

export default /*css*/ `
sn-listbox {
  display: block;
}

.sn-listbox {
  outline: none;
  background-color: var(--sn-listbox-bg, var(--sn-sys-surface-panel));
  border: 1px solid var(--sn-listbox-border, var(--sn-sys-outline-subtle));
  border-radius: var(--sn-listbox-radius, var(--sn-panel-radius, 8px));
  padding: var(--sn-step-2);
  max-height: var(--sn-listbox-max-height, 280px);
  overflow-y: auto;
  ${themedScrollFadeBlockStyles}
  box-sizing: border-box;
  box-shadow: var(--sn-listbox-shadow, var(--sn-sys-shadow-overlay));
  transition: border-color var(--sn-transition-fast, 120ms) ease;
}

.sn-listbox:focus-within {
  outline: var(--sn-sys-focus-ring-width) solid var(--sn-listbox-border-focus, var(--sn-sys-focus-ring));
  outline-offset: calc(-1 * var(--sn-sys-focus-ring-width));
}

.sn-listbox [role="option"] {
  display: flex;
  align-items: center;
  padding: calc(var(--sn-step-4, 8px) * var(--sn-theme-density, 1)) calc(var(--sn-step-6, 12px) * var(--sn-theme-density, 1));
  font-family: var(--sn-font, sans-serif);
  font-size: calc(var(--sn-text-md, 13px) * var(--sn-theme-type-scale, 1));
  color: var(--sn-listbox-text, var(--sn-sys-on-surface));
  border-radius: calc(var(--sn-panel-radius, 8px) - var(--sn-radius-sm, 4px));
  cursor: pointer;
  user-select: none;
  transition: background-color var(--sn-transition-fast, 120ms) ease, color var(--sn-transition-fast, 120ms) ease;
  margin-bottom: var(--sn-step-1);
}

.sn-listbox [role="option"]:last-child {
  margin-bottom: 0;
}

.sn-listbox [role="option"]:hover:not([disabled]):not([aria-disabled="true"]) {
  background-color: var(--sn-listbox-hover-bg, color-mix(in oklch, var(--sn-sys-accent) var(--sn-sys-state-hover-mix), var(--sn-sys-surface-panel)));
  color: var(--sn-listbox-hover-text, var(--sn-sys-on-surface));
}

.sn-listbox [role="option"][data-focused] {
  background-color: var(--sn-listbox-focus-bg, color-mix(in oklch, var(--sn-sys-accent) var(--sn-sys-state-selected-mix), var(--sn-sys-surface-panel)));
  color: var(--sn-listbox-focus-text, var(--sn-sys-on-surface));
}

.sn-listbox [role="option"][aria-selected="true"] {
  background-color: var(--sn-listbox-selected-bg, color-mix(in oklch, var(--sn-sys-accent) var(--sn-sys-state-selected-mix), var(--sn-sys-surface-panel)));
  color: var(--sn-listbox-selected-text, var(--sn-sys-on-surface));
  font-weight: 500;
}

.sn-listbox [role="option"][disabled],
.sn-listbox [role="option"][aria-disabled="true"] {
  opacity: var(--sn-sys-state-disabled-opacity, 0.38);
  cursor: not-allowed;
}
`;
