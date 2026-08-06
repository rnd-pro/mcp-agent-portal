export default /*css*/ `
sn-tooltip {
  display: inline-block;
  position: relative;
}

.sn-tooltip-popup {
  position: absolute;
  z-index: 1000;
  display: none;
  box-sizing: border-box;
  max-width: var(--sn-tooltip-max-width, 200px);
  padding: var(--sn-tooltip-padding, 4px 8px);
  border-radius: var(--sn-tooltip-radius, 4px);
  background: var(--sn-tooltip-bg, var(--sn-sys-surface-overlay));
  color: var(--sn-tooltip-color, var(--sn-sys-on-surface));
  font-family: var(--sn-font);
  font-size: var(--sn-tooltip-font-size, 11px);
  line-height: var(--sn-tooltip-line-height, 1.35);
  box-shadow: var(--sn-tooltip-shadow, var(--sn-sys-shadow-overlay));
  pointer-events: none;
  white-space: nowrap;
}

.sn-tooltip-popup[data-visible] {
  display: block;
}

.sn-tooltip-popup[data-overlay-portal] {
  position: fixed;
  inset-block-start: 0;
  inset-inline-start: 0;
  transform: translate(var(--sn-tooltip-x, 0), var(--sn-tooltip-y, 0));
}
`;
