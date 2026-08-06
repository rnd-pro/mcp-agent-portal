export default /*css*/ `
sn-popover {
  --sn-popover-bg: var(--sn-sys-surface-overlay);
  --sn-popover-border: var(--sn-sys-outline-subtle);
  --sn-popover-shadow: var(--sn-sys-shadow-overlay);

  display: inline-block;
  position: relative;
}

.sn-popover-trigger-wrapper {
  display: inline-flex;
}

.sn-popover-panel-wrapper {
  display: none;
  position: fixed;
  z-index: var(--sn-overlay-z-base, 20000);
  background-color: var(--sn-popover-bg);
  border: 1px solid var(--sn-popover-border);
  border-radius: var(--sn-popover-radius, var(--sn-panel-radius, 8px));
  padding: calc(var(--sn-step-6, 12px) * var(--sn-theme-density, 1));
  box-shadow: var(--sn-popover-shadow);
  color: var(--sn-sys-on-surface);
  font-family: var(--sn-font, sans-serif);
  font-size: calc(var(--sn-text-md, 13px) * var(--sn-theme-type-scale, 1));
  box-sizing: border-box;
  opacity: 0;
  transform: scale(0.96);
  transition: opacity var(--sn-transition-fast, 120ms) ease, transform var(--sn-transition-fast, 120ms) ease;
}

.sn-popover-panel-wrapper[data-visible] {
  display: block;
  opacity: 1;
  transform: scale(1);
}
`;
