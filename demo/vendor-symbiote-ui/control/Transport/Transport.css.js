export default /*css*/ `
sn-transport {
  display: inline-flex;
  align-items: center;
  box-sizing: border-box;
  background: var(--sn-transport-bg, color-mix(in oklab, var(--sn-sys-on-surface) 5%, transparent));
  color: var(--sn-transport-fg, var(--sn-sys-on-surface));
  border: 1px solid var(--sn-transport-border, color-mix(in oklab, var(--sn-sys-on-surface) 12%, transparent));
  border-radius: var(--sn-transport-radius, var(--sn-field-control-radius, 4px));
  padding: var(--sn-step-2);
  gap: var(--sn-transport-gap, var(--sn-step-3));
  max-width: 100%;
  font-family: var(--sn-font);
}

sn-transport[disabled] {
  opacity: var(--sn-transport-disabled-opacity, 0.5);
  pointer-events: none;
}

.sn-transport-buttons {
  display: inline-flex;
  align-items: center;
  gap: var(--sn-transport-gap, var(--sn-step-2));
}

.sn-transport-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  border: 0;
  background: var(--sn-transport-btn-bg, transparent);
  color: inherit;
  padding: var(--sn-step-2);
  border-radius: calc(var(--sn-transport-radius, var(--sn-field-control-radius, 4px)) - var(--sn-radius-xs, 2px));
  cursor: pointer;
  outline: none;
  transition:
    background var(--sn-transition-normal, 150ms) var(--sn-transition-easing, ease),
    color var(--sn-transition-normal, 150ms) var(--sn-transition-easing, ease);
}

.sn-transport-btn:hover:not(:disabled) {
  background: var(--sn-transport-btn-hover, color-mix(in oklab, var(--sn-sys-on-surface) 8%, transparent));
}

.sn-transport-btn-play:not(:disabled) {
  color: var(--sn-transport-accent, var(--sn-sys-accent));
}

.sn-transport-btn:focus-visible {
  outline: var(--sn-transport-focus-ring, 2px solid var(--sn-sys-focus-ring, currentColor));
  outline-offset: -1px;
}

.sn-transport-btn:disabled {
  cursor: default;
}

.sn-transport-icon {
  inline-size: var(--sn-transport-icon-size, 18px);
  block-size: var(--sn-transport-icon-size, 18px);
  fill: currentColor;
  display: block;
}

.sn-transport-icon[hidden] {
  display: none;
}

.sn-transport-time {
  font-family: var(--sn-font-mono, ui-monospace, monospace);
  font-size: var(--sn-transport-time-font-size, var(--sn-text-xs, 11px));
  font-variant-numeric: tabular-nums;
  color: var(--sn-transport-fg, var(--sn-sys-on-surface));
  white-space: nowrap;
}

.sn-transport-scrub {
  -webkit-appearance: none;
  appearance: none;
  inline-size: var(--sn-transport-scrub-width, 140px);
  block-size: var(--sn-transport-scrub-height, 4px);
  background: var(--sn-transport-track, color-mix(in oklab, var(--sn-sys-on-surface) 20%, transparent));
  border-radius: var(--sn-radius-xs, 2px);
  outline: none;
  cursor: pointer;
}

.sn-transport-scrub[hidden] {
  display: none;
}

.sn-transport-scrub::-webkit-slider-runnable-track {
  inline-size: 100%;
  block-size: var(--sn-transport-scrub-height, 4px);
}

.sn-transport-scrub::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  inline-size: var(--sn-transport-thumb-size, 12px);
  block-size: var(--sn-transport-thumb-size, 12px);
  border-radius: 50%;
  background: var(--sn-transport-accent, var(--sn-sys-accent));
  cursor: pointer;
}

.sn-transport-scrub::-moz-range-thumb {
  inline-size: var(--sn-transport-thumb-size, 12px);
  block-size: var(--sn-transport-thumb-size, 12px);
  border: 0;
  border-radius: 50%;
  background: var(--sn-transport-accent, var(--sn-sys-accent));
  cursor: pointer;
}

.sn-transport-scrub:focus-visible {
  outline: var(--sn-transport-focus-ring, 2px solid var(--sn-sys-focus-ring, currentColor));
  outline-offset: 2px;
}
`;
