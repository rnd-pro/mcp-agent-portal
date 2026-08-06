export default /*css*/ `
:host,
layout-shell-menu {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  min-height: 0;
  overflow: hidden;
  background-color: var(--sn-sys-surface);
  background-image: linear-gradient(to bottom, var(--sn-sys-surface-raised), var(--sn-sys-surface));
  background-repeat: no-repeat;
  background-size: 100% var(--sn-shell-top-gradient-size, 78px);
  color: var(--sn-sys-on-surface);
  font-family: var(--sn-font, Inter, system-ui, sans-serif);
}

.app-topbar {
  position: relative;
  z-index: var(--sn-shell-menu-z, 100);
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: space-between;
  min-width: 0;
  height: var(--sn-app-topbar-height, 40px);
  padding: var(--sn-app-topbar-padding, 0 16px);
  background: transparent;
  border-bottom: none;
}

.topbar-left,
.topbar-center,
.topbar-right {
  display: flex;
  align-items: center;
  min-width: 0;
}

.topbar-left {
  flex: 0 0 auto;
  gap: var(--sn-app-title-gap, 8px);
}

.topbar-center {
  position: absolute;
  left: 50%;
  max-width: min(40vw, var(--sn-shell-menu-center-max, 640px));
  gap: var(--sn-shell-menu-center-gap, 6px);
  color: var(--sn-sys-on-surface-dim);
  font-family: var(--sn-font-mono, ui-monospace, SFMono-Regular, Menlo, monospace);
  font-size: var(--sn-app-topbar-meta-size, 11px);
  line-height: 1;
  transform: translateX(-50%);
  white-space: nowrap;
}

.topbar-right {
  justify-content: flex-end;
  flex: 0 1 auto;
  gap: var(--sn-shell-menu-action-gap, 12px);
}

.app-title-icon {
  flex: 0 0 auto;
  color: var(--project-accent, var(--sn-sys-accent));
  font-size: var(--sn-app-title-icon-size, 16px);
}

.app-title {
  overflow: hidden;
  color: var(--sn-sys-on-surface);
  font-size: var(--sn-app-title-size, 13px);
  font-weight: 700;
  letter-spacing: var(--sn-app-title-letter-spacing, 0.5px);
  line-height: 1;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.topbar-project-icon {
  flex: 0 0 auto;
  color: var(--sn-sys-on-surface-dim);
  font-size: var(--sn-shell-menu-path-icon-size, 12px);
}

.topbar-project-path {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}

.topbar-right button,
.shell-action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--sn-shell-menu-action-inner-gap, 6px);
  min-height: var(--sn-shell-menu-action-height, 26px);
  padding: var(--sn-shell-menu-action-padding, 4px 10px);
  border: 1px solid transparent;
  border-radius: var(--sn-layout-header-button-radius, 4px);
  background: transparent;
  color: var(--sn-sys-on-surface-dim);
  font: inherit;
  font-size: var(--sn-shell-menu-action-size, 11px);
  font-weight: 600;
  cursor: pointer;
  letter-spacing: var(--sn-shell-menu-action-letter-spacing, 0.5px);
  white-space: nowrap;
}

.topbar-right button:hover,
.topbar-right button[active],
.shell-action:hover,
.shell-action[active] {
  border-color: var(--sn-sys-outline);
  background: color-mix(in oklch, var(--sn-sys-accent) var(--sn-sys-state-hover-mix), var(--sn-sys-surface));
  color: var(--sn-sys-on-surface);
}

.topbar-right button .material-symbols-outlined,
.shell-action .material-symbols-outlined {
  font-size: var(--sn-shell-menu-action-icon-size, 16px);
}

.shell-tabs-row {
  display: flex;
  flex: 0 0 auto;
  align-items: stretch;
  min-width: 0;
  min-height: var(--sn-tabs-height, 34px);
  background: transparent;
}

.shell-tabs {
  flex: 1 1 auto;
  min-width: 0;
  --sn-tabs-bg: var(--sn-shell-tabs-bg, transparent);
}

.app-workspace {
  display: flex;
  position: relative;
  flex: 1 1 auto;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}

::slotted([slot='sidebar']) {
  flex: 0 0 auto;
  min-height: 0;
}

.app-workspace-content {
  display: flex;
  position: relative;
  flex: 1 1 auto;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}

.app-workspace-content > * {
  min-width: 0;
  min-height: 0;
}

@media (max-width: 860px) {
  .app-topbar {
    gap: var(--sn-app-topbar-mobile-gap, 6px);
    padding: var(--sn-app-topbar-mobile-padding, 6px 10px);
  }

  .topbar-center {
    display: none;
  }

  .topbar-right {
    gap: var(--sn-shell-menu-mobile-action-gap, 6px);
  }
}
`;
