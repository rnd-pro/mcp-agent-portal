export default /*css*/ `
sn-breadcrumb {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  box-sizing: border-box;
  gap: var(--sn-breadcrumb-gap, 6px);
  padding: var(--sn-breadcrumb-padding, 4px 8px);
  font-family: var(--sn-font, sans-serif);
  font-size: var(--sn-breadcrumb-font-size, 12px);
  color: var(--sn-breadcrumb-color, var(--sn-sys-on-surface-dim));
}

sn-breadcrumb[hidden] {
  display: none !important;
}

sn-breadcrumb-item {
  display: inline-flex;
  align-items: center;
  gap: var(--sn-breadcrumb-item-gap, 6px);
}

.bc-sep {
  color: var(--sn-breadcrumb-separator-color, var(--sn-sys-on-surface-faint));
  font-size: var(--sn-breadcrumb-separator-size, 1.1em);
  user-select: none;
}

.bc-label {
  display: inline-flex;
  align-items: center;
  gap: var(--sn-step-2);
  margin: 0;
  padding: 0;
  border: 0;
  background: none;
  font: inherit;
  cursor: pointer;
  text-decoration: none;
  color: inherit;
  transition: color var(--sn-transition-fast, 120ms);
}

button.bc-label:hover {
  color: var(--sn-breadcrumb-hover-color, var(--sn-sys-on-surface));
  background: color-mix(in oklch, var(--sn-sys-accent) var(--sn-sys-state-hover-mix), transparent);
}

button.bc-label:focus-visible {
  outline: var(--sn-sys-focus-ring-width, 2px) solid var(--sn-sys-focus-ring);
  outline-offset: var(--sn-sys-focus-ring-offset, 2px);
  border-radius: var(--sn-radius-xs, 3px);
}

sn-breadcrumb-item[data-active] .bc-label {
  font-weight: 500;
  color: var(--sn-breadcrumb-active-color, var(--sn-sys-on-surface));
  cursor: default;
  pointer-events: none;
}

.bc-label .material-symbols-outlined {
  font-size: var(--sn-text-xl);
}
`;
