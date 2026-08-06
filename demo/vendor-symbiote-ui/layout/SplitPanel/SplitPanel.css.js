import { themedScrollFadeBlockStyles } from '../../themes/scroll-fade-styles.js';

export default /*css*/ `
sn-split-panel {
  display: block;
  font-family: var(--sn-font, sans-serif);
  width: 100%;
  height: 100%;
  box-sizing: border-box;
}

.sn-split-container {
  display: flex;
  width: 100%;
  height: 100%;
  overflow: hidden;
  position: relative;
}

.sn-split-container[data-orientation="horizontal"] {
  flex-direction: row;
}

.sn-split-container[data-orientation="vertical"] {
  flex-direction: column;
}

.sn-split-panel-primary,
.sn-split-panel-secondary {
  overflow: auto;
  ${themedScrollFadeBlockStyles}
}

.sn-split-divider {
  background-color: var(--sn-outline-color-soft, var(--sn-sys-outline-subtle));
  position: relative;
  z-index: 10;
  user-select: none;
  transition: background-color var(--sn-transition-fast, 120ms);
}

.sn-split-divider:hover {
  background-color: color-mix(in oklch, var(--sn-sys-accent) var(--sn-sys-state-hover-mix), var(--sn-outline-color-soft, var(--sn-sys-outline-subtle)));
}

.sn-split-divider[data-active] {
  background-color: var(--sn-sys-accent);
}

.sn-split-container[data-orientation="horizontal"] > .sn-split-divider {
  width: 6px;
  cursor: col-resize;
  height: 100%;
}

.sn-split-container[data-orientation="vertical"] > .sn-split-divider {
  height: 6px;
  cursor: row-resize;
  width: 100%;
}
`;
