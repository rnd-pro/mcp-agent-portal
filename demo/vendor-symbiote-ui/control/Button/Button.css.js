export default /*css*/ `
sn-button {
  display: inline-flex;
  box-sizing: border-box;
  align-items: center;
  justify-content: center;
  gap: var(--sn-button-gap, 8px);
  min-width: 0;
  min-height: var(--sn-button-min-height, 28px);
  padding: var(--sn-button-padding, 4px 12px);
  border: 1px solid var(--sn-button-border);
  border-radius: var(--sn-button-radius, 4px);
  background: var(--sn-button-bg);
  color: var(--sn-button-color);
  font-family: var(--sn-font);
  font-size: var(--sn-button-font-size, 12px);
  font-weight: var(--sn-button-font-weight, 500);
  line-height: var(--sn-button-line-height, 1.2);
  cursor: pointer;
  user-select: none;
  transition: background var(--sn-transition-normal, 150ms) var(--sn-transition-easing, ease),
              border-color var(--sn-transition-normal, 150ms) var(--sn-transition-easing, ease),
              color var(--sn-transition-normal, 150ms) var(--sn-transition-easing, ease),
              filter var(--sn-transition-normal, 150ms) var(--sn-transition-easing, ease);
}

sn-button[hidden] {
  display: none !important;
}

sn-button:hover:not([disabled]):not([loading]) {
  border-color: var(--sn-button-hover-border, var(--sn-sys-outline));
  background: var(--sn-button-hover-bg, color-mix(in oklch, var(--sn-sys-accent) var(--sn-sys-state-hover-mix), var(--sn-sys-surface-raised)));
}

sn-button:focus-visible {
  outline: var(--sn-button-focus-ring, 2px solid var(--sn-sys-focus-ring, currentColor));
  outline-offset: 2px;
}

sn-button[disabled],
sn-button[loading] {
  cursor: not-allowed;
  opacity: var(--sn-button-disabled-opacity, 0.5);
}

sn-button[loading] .sn-button-spinner {
  display: inline-block;
  width: 1em;
  height: 1em;
  border: 2px solid currentColor;
  border-right-color: transparent;
  border-radius: 50%;
  animation: sn-button-spin var(--sn-transition-slow, 600ms) linear infinite;
  margin-inline-end: var(--sn-button-gap, 8px);
}

@keyframes sn-button-spin {
  to { transform: rotate(360deg); }
}

@media (prefers-reduced-motion: reduce) {
  sn-button {
    transition: none !important;
  }
  sn-button[loading] .sn-button-spinner {
    animation-duration: var(--sn-animation-duration-slower, 2s);
  }
}

sn-button[block] {
  display: flex;
  width: 100%;
}

sn-button[size="sm"] {
  min-height: var(--sn-button-sm-min-height, 22px);
  padding: var(--sn-button-sm-padding, 2px 8px);
  font-size: var(--sn-button-sm-font-size, 11px);
}

sn-button[size="lg"] {
  min-height: var(--sn-button-lg-min-height, 36px);
  padding: var(--sn-button-lg-padding, 6px 16px);
  font-size: var(--sn-button-lg-font-size, 14px);
}

sn-button[pressed]:not([pressed="false"]),
sn-button[selected],
sn-button[current] {
  border-color: var(--sn-button-active-border, var(--sn-button-hover-border, var(--sn-sys-outline)));
  background: var(--sn-button-active-bg, var(--sn-button-hover-bg, color-mix(in oklch, var(--sn-sys-accent) var(--sn-sys-state-selected-mix), var(--sn-sys-surface-raised))));
  color: var(--sn-button-active-color, var(--sn-button-color, var(--sn-sys-on-surface)));
}

sn-button[variant="primary"] {
  border-color: var(--sn-button-primary-border);
  background: var(--sn-button-primary-bg);
  color: var(--sn-button-primary-color);
}

sn-button[variant="primary"]:hover:not([disabled]):not([loading]) {
  filter: var(--sn-button-primary-hover-filter);
}

sn-button[variant="success"] {
  border-color: var(--sn-button-success-border);
  background: var(--sn-button-success-bg);
  color: var(--sn-button-success-color);
}

sn-button[variant="success"]:hover:not([disabled]):not([loading]) {
  border-color: var(--sn-button-success-hover-border, var(--sn-sys-success));
  background: var(--sn-button-success-hover-bg, color-mix(in oklch, var(--sn-sys-on-surface) var(--sn-sys-state-hover-mix), var(--sn-sys-success)));
  color: var(--sn-button-success-hover-color, var(--sn-sys-on-status));
}

sn-button[variant="danger"] {
  border-color: var(--sn-button-danger-border);
  background: var(--sn-button-danger-bg);
  color: var(--sn-button-danger-color);
}

sn-button[variant="danger"]:hover:not([disabled]):not([loading]) {
  border-color: var(--sn-button-danger-hover-border, var(--sn-sys-danger));
  background: var(--sn-button-danger-hover-bg, color-mix(in oklch, var(--sn-sys-on-surface) var(--sn-sys-state-hover-mix), var(--sn-sys-danger)));
  color: var(--sn-button-danger-hover-color, var(--sn-sys-on-status));
}

sn-button[variant="icon"] {
  width: var(--sn-button-icon-size);
  min-height: var(--sn-button-icon-size);
  padding: 0;
  border-color: transparent;
  background: transparent;
  color: var(--sn-sys-on-surface-dim);
}

sn-button[variant="icon"]:hover:not([disabled]):not([loading]) {
  background: color-mix(in oklch, var(--sn-sys-accent) var(--sn-sys-state-hover-mix), transparent);
  color: var(--sn-sys-on-surface);
}

sn-button .material-symbols-outlined {
  font-size: var(--sn-button-icon-font-size);
}

sn-button > [slot="prefix"] {
  display: inline-flex;
  align-items: center;
}

sn-button > [slot="suffix"] {
  display: inline-flex;
  align-items: center;
}
`;
