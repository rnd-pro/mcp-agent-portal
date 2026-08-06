export default /*css*/ `
sn-pagination {
  display: inline-flex;
  align-items: center;
  box-sizing: border-box;
  gap: var(--sn-pagination-gap, 4px);
  font-family: var(--sn-font, sans-serif);
  font-size: var(--sn-pagination-font-size, 12px);
}

sn-pagination[hidden] {
  display: none !important;
}

.sn-pagination-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: var(--sn-pagination-btn-size, 28px);
  height: var(--sn-pagination-btn-size, 28px);
  padding: 0 var(--sn-step-3);
  box-sizing: border-box;
  background: var(--sn-pagination-btn-bg, transparent);
  border: 1px solid var(--sn-pagination-btn-border, var(--sn-outline-color-soft, var(--sn-sys-outline-subtle)));
  border-radius: var(--sn-pagination-btn-radius, 4px);
  color: var(--sn-pagination-btn-color, var(--sn-sys-on-surface-dim));
  cursor: pointer;
  user-select: none;
  font: inherit;
  transition: background var(--sn-transition-fast, 120ms), border-color var(--sn-transition-fast, 120ms), color var(--sn-transition-fast, 120ms);
}

.sn-pagination-btn:hover:not([disabled]) {
  background: var(--sn-pagination-btn-hover-bg, color-mix(in oklch, var(--sn-sys-accent) var(--sn-sys-state-hover-mix), var(--sn-sys-surface)));
  color: var(--sn-pagination-btn-hover-color, var(--sn-sys-on-surface));
}

.sn-pagination-btn:focus-visible {
  outline: var(--sn-pagination-focus-ring, 2px solid var(--sn-sys-focus-ring, currentColor));
  outline-offset: 2px;
}

.sn-pagination-btn[active] {
  background: var(--sn-pagination-btn-active-bg, var(--sn-sys-accent));
  border-color: var(--sn-pagination-btn-active-border, var(--sn-sys-accent));
  color: var(--sn-pagination-btn-active-color, var(--sn-sys-on-surface));
  font-weight: 600;
}

.sn-pagination-btn[disabled] {
  cursor: not-allowed;
  opacity: var(--sn-pagination-disabled-opacity, 0.4);
}

.sn-pagination-ellipsis {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: var(--sn-pagination-btn-size, 28px);
  color: var(--sn-text-dim-extra, var(--sn-sys-on-surface-faint));
  user-select: none;
}

.sn-pagination-btn .material-symbols-outlined {
  font-size: var(--sn-text-xl);
}
`;
