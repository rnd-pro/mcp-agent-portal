export default /*css*/ `
sn-accordion {
  --sn-accordion-border: var(--sn-sys-outline-subtle);
  --sn-accordion-bg: var(--sn-sys-surface-panel);
  --sn-accordion-header-color: var(--sn-sys-on-surface);
  --sn-accordion-content-color: var(--sn-sys-on-surface-dim);

  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  width: 100%;
  border: 1px solid var(--sn-accordion-border);
  border-radius: var(--sn-accordion-radius, 4px);
  overflow: hidden;
  background: var(--sn-accordion-bg);
}

sn-accordion[hidden] {
  display: none !important;
}

sn-accordion-item {
  display: block;
  box-sizing: border-box;
  border-bottom: 1px solid var(--sn-accordion-border);
}

sn-accordion-item:last-child {
  border-bottom: none;
}

.sn-accordion-details {
  display: block;
  width: 100%;
}

.sn-accordion-summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--sn-accordion-header-padding, 10px 14px);
  font-family: var(--sn-font, sans-serif);
  font-size: var(--sn-accordion-header-size, 12px);
  font-weight: 500;
  color: var(--sn-accordion-header-color);
  cursor: pointer;
  user-select: none;
  list-style: none;
  outline: none;
  background: var(--sn-accordion-header-bg, transparent);
  transition: background var(--sn-transition-fast, 120ms);
}

.sn-accordion-summary::-webkit-details-marker {
  display: none;
}

.sn-accordion-summary:hover,
.sn-accordion-summary:focus-visible {
  background: var(--sn-accordion-header-hover-bg, color-mix(in oklch, var(--sn-sys-accent) var(--sn-sys-state-hover-mix), var(--sn-accordion-bg)));
}

.sn-accordion-summary:focus-visible {
  outline: var(--sn-sys-focus-ring-width) solid var(--sn-sys-focus-ring);
  outline-offset: -2px;
}

.sn-accordion-header-text {
  flex: 1;
}

.sn-accordion-icon {
  font-size: var(--sn-text-xl);
  color: var(--sn-sys-on-surface-dim);
  transition: transform var(--sn-transition-normal, 240ms);
  user-select: none;
}

.sn-accordion-details[open] .sn-accordion-icon {
  transform: rotate(90deg);
}

.sn-accordion-content {
  padding: var(--sn-accordion-content-padding, 12px 14px);
  font-family: var(--sn-font, sans-serif);
  font-size: var(--sn-accordion-content-size, 12px);
  color: var(--sn-accordion-content-color);
  border-top: 1px solid var(--sn-accordion-border);
  background: var(--sn-accordion-content-bg, transparent);
}

sn-accordion-item[disabled] .sn-accordion-summary {
  cursor: not-allowed;
  opacity: var(--sn-sys-state-disabled-opacity);
  pointer-events: none;
}
`;
