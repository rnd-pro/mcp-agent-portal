import { themedScrollFadeBlockStyles } from '../../themes/scroll-fade-styles.js';

export default /*css*/ `
sn-scroll-area {
  display: block;
  font-family: var(--sn-font, sans-serif);
  width: 100%;
  height: 100%;
  box-sizing: border-box;
  min-width: 0;
  min-height: 0;
  overflow: auto;
  padding: var(--sn-scroll-area-padding);
}

sn-scroll-area:has(> .sn-scroll-container) {
  overflow: hidden;
  padding: 0;
}

sn-scroll-area:not(:has(> .sn-scroll-container)) {
  ${themedScrollFadeBlockStyles}
}

.sn-scroll-container {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
}

.sn-scroll-viewport {
  width: 100%;
  height: 100%;
  overflow: scroll;
  scrollbar-width: none; /* Firefox */
  box-sizing: border-box;
  padding: var(--sn-scroll-area-padding);
}

.sn-scroll-viewport::-webkit-scrollbar {
  display: none; /* Chrome/Safari */
}

.sn-scrollbar {
  position: absolute;
  background-color: transparent;
  user-select: none;
  transition: opacity var(--sn-transition-fast, 120ms);
  opacity: 0;
  z-index: 100;
}

.sn-scroll-container:hover .sn-scrollbar,
.sn-scrollbar[data-active] {
  opacity: 1;
}

.sn-scrollbar-vertical {
  top: var(--sn-step-1);
  right: var(--sn-step-1);
  bottom: var(--sn-step-1);
  width: 6px;
}

.sn-scrollbar-horizontal {
  left: var(--sn-step-1);
  bottom: var(--sn-step-1);
  right: var(--sn-step-1);
  height: 6px;
}

.sn-scrollbar-thumb {
  background-color: var(--sn-scrollbar-thumb, var(--sn-sys-on-surface-dim));
  border-radius: var(--sn-radius-xs, 3px);
  cursor: pointer;
  position: absolute;
  top: 0;
  left: 0;
  transition: background-color var(--sn-transition-fast, 120ms);
}

.sn-scrollbar-thumb:hover {
  background-color: color-mix(in oklch, var(--sn-sys-accent) var(--sn-sys-state-hover-mix), var(--sn-scrollbar-thumb, var(--sn-sys-on-surface-dim)));
}

.sn-scrollbar-thumb[data-active] {
  background-color: var(--sn-sys-accent);
}

.sn-scrollbar-vertical .sn-scrollbar-thumb {
  width: 100%;
}

.sn-scrollbar-horizontal .sn-scrollbar-thumb {
  height: 100%;
}
`;
