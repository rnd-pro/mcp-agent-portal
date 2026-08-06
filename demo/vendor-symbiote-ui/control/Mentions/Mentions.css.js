import { themedScrollFadeBlockStyles } from '../../themes/scroll-fade-styles.js';

export default /*css*/ `
sn-mentions {
  display: block;
  font-family: var(--sn-font, sans-serif);
  position: relative;
  width: 100%;
}

.sn-mentions-container {
  position: relative;
  width: 100%;
}

.sn-mentions-dropdown {
  display: none;
  position: absolute;
  z-index: 1000;
  margin-top: var(--sn-step-2);
  background-color: var(--sn-sys-surface-panel);
  border: 1px solid var(--sn-outline-color-soft, var(--sn-sys-outline-subtle));
  border-radius: var(--sn-panel-radius, 6px);
  box-shadow: var(--sn-panel-shadow, var(--sn-sys-shadow-overlay));
  overflow-y: auto;
  ${themedScrollFadeBlockStyles}
  max-height: 180px;
  min-width: 150px;
  box-sizing: border-box;
  padding: var(--sn-step-2);
}

.sn-mentions-dropdown[data-visible] {
  display: block;
}

.sn-mentions-list {
  list-style: none;
  margin: 0;
  padding: 0;
}

.sn-mentions-option {
  display: flex;
  align-items: center;
  padding: calc(var(--sn-step-3, 6px) * var(--sn-theme-density, 1)) calc(var(--sn-step-5, 10px) * var(--sn-theme-density, 1));
  font-size: calc(var(--sn-text-sm, 12px) * var(--sn-theme-type-scale, 1));
  color: var(--sn-sys-on-surface);
  border-radius: var(--sn-radius-sm);
  cursor: pointer;
  user-select: none;
}

.sn-mentions-option:hover,
.sn-mentions-option[data-focused] {
  background-color: color-mix(in oklch, var(--sn-sys-accent) var(--sn-sys-state-hover-mix), var(--sn-sys-surface-panel));
}
`;
