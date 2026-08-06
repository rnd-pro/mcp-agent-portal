export default /*css*/ `
sn-nav-list {
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  width: 100%;
  gap: var(--sn-nav-list-gap, 2px);
  padding: var(--sn-nav-list-padding, 4px 0);
}

sn-nav-list[hidden] {
  display: none !important;
}

sn-nav-item {
  display: flex;
  align-items: center;
  box-sizing: border-box;
  width: 100%;
  padding: var(--sn-nav-item-padding, 6px 12px);
  font-family: var(--sn-font, sans-serif);
  font-size: var(--sn-nav-item-font-size, 12px);
  color: var(--sn-nav-item-color, var(--sn-sys-on-surface-dim));
  cursor: pointer;
  user-select: none;
  gap: var(--sn-nav-item-gap, 8px);
  border-radius: var(--sn-nav-item-radius, 4px);
  text-decoration: none;
  transition: background var(--sn-transition-fast, 120ms), color var(--sn-transition-fast, 120ms);
  outline: none;
}

sn-nav-item:hover,
sn-nav-item:focus-visible {
  background: var(--sn-nav-item-hover-bg, color-mix(in oklch, var(--sn-sys-accent) var(--sn-sys-state-hover-mix), transparent));
  color: var(--sn-nav-item-hover-color, var(--sn-sys-on-surface));
}

sn-nav-item:focus-visible {
  outline: var(--sn-sys-focus-ring-width, 2px) solid var(--sn-sys-focus-ring);
  outline-offset: -2px;
}

sn-nav-item[active] {
  background: var(--sn-nav-item-active-bg, color-mix(in oklch, var(--sn-sys-accent) var(--sn-sys-state-selected-mix), transparent));
  color: var(--sn-nav-item-active-color, var(--sn-sys-on-surface));
  font-weight: 500;
}

sn-nav-item[disabled] {
  cursor: not-allowed;
  opacity: var(--sn-nav-item-disabled-opacity, var(--sn-sys-state-disabled-opacity, 0.38));
  pointer-events: none;
}

.sn-nav-item-icon {
  font-size: var(--sn-nav-item-icon-size, 16px);
}

.sn-nav-item-label {
  flex: 1;
}

.sn-nav-item-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0 var(--sn-step-2);
  min-width: 16px;
  height: 16px;
  border-radius: var(--sn-radius-lg);
  background: var(--sn-nav-item-badge-bg, var(--sn-sys-outline));
  color: var(--sn-nav-item-badge-color, var(--sn-sys-on-surface));
  font-size: var(--sn-text-2xs, 9px);
  font-weight: 600;
}
`;
