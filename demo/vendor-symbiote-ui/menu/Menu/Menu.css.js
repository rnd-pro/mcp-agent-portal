export default /*css*/ `
sn-menu {
  --sn-menu-bg: var(--sn-sys-surface-overlay);
  --sn-menu-border: var(--sn-sys-outline-subtle);
  --sn-menu-shadow-color: var(--sn-sys-shadow-overlay);

  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  background: var(--sn-menu-bg);
  border: 1px solid var(--sn-menu-border);
  border-radius: var(--sn-menu-radius, 4px);
  padding: var(--sn-menu-padding, 4px 0);
  box-shadow: var(--sn-menu-shadow, 0 4px 12px var(--sn-menu-shadow-color));
  min-width: var(--sn-menu-min-width, 160px);
}

sn-menu[hidden] {
  display: none !important;
}

sn-menu-item {
  --sn-menu-item-color: var(--sn-sys-on-surface-dim);
  --sn-menu-item-hover-color: var(--sn-sys-on-surface);
  --sn-menu-item-checked-color: var(--sn-sys-on-surface);
  --sn-menu-item-shortcut-color: var(--sn-sys-on-surface-faint);

  display: flex;
  align-items: center;
  box-sizing: border-box;
  width: 100%;
  padding: var(--sn-menu-item-padding, 6px 12px);
  font-family: var(--sn-font, sans-serif);
  font-size: var(--sn-menu-item-font-size, 12px);
  color: var(--sn-menu-item-color);
  cursor: pointer;
  user-select: none;
  gap: var(--sn-menu-item-gap, 8px);
  outline: none;
  position: relative;
}

sn-menu-item[disabled] {
  cursor: not-allowed;
  opacity: var(--sn-sys-state-disabled-opacity);
}

sn-menu-item:focus,
sn-menu-item:hover:not([disabled]) {
  background: color-mix(in oklch, var(--sn-sys-accent) var(--sn-sys-state-hover-mix), transparent);
  color: var(--sn-menu-item-hover-color);
}

sn-menu-item[checked] {
  color: var(--sn-menu-item-checked-color);
}

.sn-menu-item-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: var(--sn-menu-item-icon-size, 16px);
  width: 1.25em;
  height: 1.25em;
}

.sn-menu-item-icon[hidden],
.sn-menu-item-shortcut[hidden],
.sn-menu-group-label[hidden] {
  display: none !important;
}

.sn-menu-item-label {
  flex: 1;
}

.sn-menu-item-shortcut {
  font-size: var(--sn-text-2xs, calc(var(--sn-menu-item-font-size, 12px) - 2px));
  color: var(--sn-menu-item-shortcut-color);
  margin-left: auto;
  padding-left: var(--sn-step-6);
}

sn-menu-separator {
  display: block;
  height: 1px;
  background: var(--sn-menu-separator-color, var(--sn-menu-border));
  margin: var(--sn-menu-separator-margin, 4px 0);
}

sn-menu-group {
  display: flex;
  flex-direction: column;
}

.sn-menu-group-label {
  --sn-menu-group-label-color: var(--sn-sys-on-surface-faint);

  font-family: var(--sn-font, sans-serif);
  font-size: var(--sn-menu-group-label-size, 10px);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--sn-menu-group-label-color);
  padding: var(--sn-menu-group-label-padding, 6px 12px 2px 12px);
  font-weight: 600;
}

sn-dropdown {
  --sn-dropdown-bg: var(--sn-sys-surface-overlay);
  --sn-dropdown-border: var(--sn-sys-outline-subtle);
  --sn-dropdown-shadow-color: var(--sn-sys-shadow-overlay);

  display: inline-block;
  position: relative;
}

sn-dropdown[hidden] {
  display: none !important;
}

/* Real box (never display: contents) — the popover anchors to this element, and a boxless
   element cannot serve as an anchor. Anchoring is per-instance via the popover's implicit
   invoker anchor (togglePopover({ source })), so no document-global anchor-name collisions. */
.sn-dropdown-trigger {
  display: inline-flex;
}

.sn-dropdown-popover {
  position: fixed;
  position-area: var(--sn-dropdown-position-area, block-end span-inline-start);
  position-try-fallbacks: flip-block, flip-inline;
  margin: var(--sn-dropdown-gap, 4px) 0 0 0;
  box-sizing: border-box;
  padding: 0;
  border: 1px solid var(--sn-dropdown-border);
  border-radius: var(--sn-menu-radius, 4px);
  background: var(--sn-dropdown-bg);
  box-shadow: var(--sn-dropdown-shadow, 0 4px 12px var(--sn-dropdown-shadow-color));
  min-width: var(--sn-dropdown-min-width, var(--sn-menu-min-width, 160px));

  &:not(:popover-open) {
    display: none;
  }
}
`;
