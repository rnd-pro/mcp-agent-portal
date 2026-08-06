import { themedScrollFadeBlockStyles } from '../../themes/scroll-fade-styles.js';

export default /*css*/ `
sn-drawer {
  --sn-drawer-backdrop-bg: var(--sn-sys-scrim);
  --sn-drawer-bg: var(--sn-sys-surface-overlay);

  display: contents;
}

.sn-drawer-backdrop {
  display: none;
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  background-color: var(--sn-drawer-backdrop-bg);
  backdrop-filter: blur(4px);
  z-index: var(--sn-overlay-z-base, 20000);
  opacity: 0;
  transition: opacity var(--sn-transition-normal, 240ms) ease;
}

.sn-drawer-backdrop[data-visible] {
  display: block;
  opacity: 1;
}

.sn-drawer-panel {
  display: flex;
  flex-direction: column;
  position: fixed;
  background-color: var(--sn-drawer-bg);
  border: 1px solid var(--sn-sys-outline-subtle);
  box-shadow: var(--sn-sys-shadow-overlay);
  z-index: calc(var(--sn-overlay-z-base, 20000) + 1);
  overflow: hidden;
  box-sizing: border-box;
  transition: transform var(--sn-transition-normal, 240ms) ease;
}

.sn-drawer-panel[data-placement="right"] {
  top: 0;
  right: 0;
  width: var(--sn-drawer-size, 380px);
  max-width: 100vw;
  height: 100vh;
  transform: translateX(100%);
}

.sn-drawer-panel[data-placement="left"] {
  top: 0;
  left: 0;
  width: var(--sn-drawer-size, 380px);
  max-width: 100vw;
  height: 100vh;
  transform: translateX(-100%);
}

.sn-drawer-panel[data-placement="top"] {
  top: 0;
  left: 0;
  width: 100vw;
  height: var(--sn-drawer-size, 320px);
  max-height: 100vh;
  transform: translateY(-100%);
}

.sn-drawer-panel[data-placement="bottom"] {
  bottom: 0;
  left: 0;
  width: 100vw;
  height: var(--sn-drawer-size, 320px);
  max-height: 100vh;
  transform: translateY(100%);
}

.sn-drawer-panel[data-visible] {
  transform: none;
}

.sn-drawer-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: calc(16px * var(--sn-theme-density, 1)) calc(20px * var(--sn-theme-density, 1));
  border-bottom: 1px solid var(--sn-sys-outline-subtle);
}

.sn-drawer-title {
  margin: 0;
  font-family: var(--sn-font, sans-serif);
  font-size: calc(18px * var(--sn-theme-type-scale, 1) * var(--sn-theme-heading-scale, 1));
  font-weight: 600;
  color: var(--sn-sys-on-surface);
}

.sn-drawer-close-btn {
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

.sn-drawer-close-btn:hover {
  background-color: color-mix(in oklch, var(--sn-sys-accent) var(--sn-sys-state-hover-mix), transparent);
  color: var(--sn-sys-on-surface);
}

.sn-drawer-body {
  flex: 1;
  padding: calc(20px * var(--sn-theme-density, 1));
  overflow-y: auto;
  ${themedScrollFadeBlockStyles}
  font-family: var(--sn-font, sans-serif);
  font-size: calc(13px * var(--sn-theme-type-scale, 1));
  line-height: 1.5;
}

.sn-drawer-footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: var(--sn-step-6);
  padding: calc(16px * var(--sn-theme-density, 1)) calc(20px * var(--sn-theme-density, 1));
  border-top: 1px solid var(--sn-sys-outline-subtle);
  background-color: var(--sn-sys-surface-toolbar);
}
`;
