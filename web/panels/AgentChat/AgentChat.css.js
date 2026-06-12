export default `
:host {
  display: block;
}

pg-agent-chat {
  display: block;
  height: 100%;
  overflow: hidden;
  font-family: var(--sn-font);
}

.chat-shell {
  position: relative;
  display: flex;
  height: 100%;
  background: var(--sn-bg);
  color: var(--sn-text);
  font-size: 13px;
}

.chat-workspace-view {
  flex: 1 1 auto;
  min-width: 0;
  min-height: 0;
  height: 100%;
}

.composer-action-menu {
  --composer-action-menu-viewport-gutter: calc(var(--sn-layout-menu-gap, 4px) * 6);
  --composer-action-menu-inline-size: min(
    var(
      --sn-composer-action-menu-inline-size,
      calc((var(--sn-layout-menu-row-label-width, 66px) * 3) + (var(--sn-layout-menu-action-height, 28px) * 2))
    ),
    calc(100vw - var(--composer-action-menu-viewport-gutter))
  );
  --composer-action-menu-offset: calc(var(--sn-layout-menu-gap, 4px) * 2);
  --composer-action-menu-caret-size: calc(var(--sn-layout-menu-gap, 4px) * 2);
  position: fixed;
  inset: auto;
  z-index: calc(var(--sn-overlay-z-base, 20000) + 10);
  inline-size: var(--composer-action-menu-inline-size);
  transform: translateY(calc(-100% - var(--composer-action-menu-offset)));
}

.composer-action-menu[data-overlay-stack-item] {
  transform: none;
}

.composer-action-menu[hidden] {
  display: none !important;
}

.composer-action-menu[data-placement="below"] {
  transform: translateY(var(--composer-action-menu-offset));
}

.composer-action-menu::after {
  content: '';
  position: absolute;
  inset-block-end: calc(var(--composer-action-menu-caret-size) / -2);
  inset-inline-start: var(--composer-action-menu-caret-left, 22px);
  inline-size: var(--composer-action-menu-caret-size);
  block-size: var(--composer-action-menu-caret-size);
  border-inline-end: var(--sn-panel-menu-border-width, 1px) solid var(--sn-border);
  border-block-end: var(--sn-panel-menu-border-width, 1px) solid var(--sn-border);
  background: var(--sn-panel-bg);
  transform: translateX(-50%) rotate(45deg);
}

.composer-action-menu[data-placement="below"]::after {
  inset-block-start: calc(var(--composer-action-menu-caret-size) / -2);
  inset-block-end: auto;
  border: 0;
  border-inline-start: var(--sn-panel-menu-border-width, 1px) solid var(--sn-border);
  border-block-start: var(--sn-panel-menu-border-width, 1px) solid var(--sn-border);
}

.composer-action-menu-surface {
  overflow: hidden;
  border: var(--sn-panel-menu-border-width, 1px) solid var(--sn-border);
  border-radius: var(
    --sn-composer-action-menu-radius,
    calc(var(--sn-panel-radius, var(--sn-node-radius, 6px)) + var(--sn-layout-menu-gap, 4px))
  );
  background: var(--sn-panel-bg);
  box-shadow: var(--sn-panel-shadow, var(--sn-shadow-md));
}

.composer-action-item {
  --composer-action-switch-block-size: var(
    --sn-composer-action-switch-block-size,
    calc(var(--sn-layout-menu-action-height, 28px) * 0.64)
  );
  --composer-action-switch-inline-size: var(
    --sn-composer-action-switch-inline-size,
    var(--sn-layout-menu-action-height, 28px)
  );
  --composer-action-switch-thumb-size: calc(var(--composer-action-switch-block-size) - var(--sn-layout-menu-gap, 4px));
  --composer-action-switch-thumb-offset: calc(var(--sn-layout-menu-gap, 4px) / 2);
  display: grid;
  grid-template-columns:
    var(--sn-layout-menu-icon-size, 16px)
    minmax(0, 1fr)
    var(--composer-action-switch-inline-size);
  align-items: center;
  gap: calc(var(--sn-layout-menu-action-gap, 4px) * 2);
  width: 100%;
  min-block-size: var(
    --sn-composer-action-menu-row-height,
    var(--sn-layout-menu-row-height, 30px)
  );
  padding: var(
    --sn-composer-action-menu-row-padding,
    calc(var(--sn-layout-menu-gap, 4px) * 1.25) calc(var(--sn-layout-menu-gap, 4px) * 3)
  );
  border: 0;
  border-block-end: 1px solid var(--sn-border);
  background: transparent;
  color: var(--sn-text);
  font: inherit;
  text-align: start;
  cursor: pointer;
}

.composer-action-item:last-child {
  border-block-end: 0;
}

.composer-action-item:hover {
  background: var(--sn-surface-hover);
}

.composer-action-item .material-symbols-outlined {
  font-size: var(--sn-layout-menu-icon-size, 16px);
  color: var(--sn-muted);
}

.composer-action-label {
  min-inline-size: 0;
  overflow: hidden;
  font-size: var(--sn-composer-action-menu-label-size, calc(var(--sn-layout-menu-action-size, 12px) + 1px));
  font-weight: 500;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.composer-action-switch {
  justify-self: end;
  position: relative;
  inline-size: var(--composer-action-switch-inline-size);
  block-size: var(--composer-action-switch-block-size);
  border-radius: 999px;
  background: color-mix(in oklab, var(--sn-text-dim) 28%, var(--sn-panel-bg));
  transition: background var(--sn-transition-fast) var(--sn-transition-easing);
}

.composer-action-switch span {
  position: absolute;
  inset-block-start: var(--composer-action-switch-thumb-offset);
  inset-inline-start: var(--composer-action-switch-thumb-offset);
  inline-size: var(--composer-action-switch-thumb-size);
  block-size: var(--composer-action-switch-thumb-size);
  border-radius: 50%;
  background: var(--sn-text);
  box-shadow: var(--sn-shadow-sm);
  transition: transform var(--sn-transition-fast) var(--sn-transition-easing);
}

.composer-action-switch[data-active="true"] {
  background: var(--sn-node-selected);
}

.composer-action-switch[data-active="true"] span {
  transform: translateX(calc(var(--composer-action-switch-inline-size) - var(--composer-action-switch-thumb-size) - (var(--composer-action-switch-thumb-offset) * 2)));
}

.goal-status {
  --sn-overlay-stack-gap: calc(var(--sn-layout-menu-gap, 4px) * 2);
  --sn-overlay-stack-viewport-gutter: calc(var(--sn-layout-menu-gap, 4px) * 4);
  position: fixed;
  inset: auto;
  z-index: calc(var(--sn-overlay-z-base, 20000) + 5);
  inline-size: min(var(--sn-composer-goal-status-inline-size, 560px), calc(100vw - 32px));
}

.goal-status[hidden] {
  display: none !important;
}

.goal-status-surface {
  display: grid;
  grid-template-columns: var(--sn-layout-menu-icon-size, 16px) minmax(0, 1fr) auto auto;
  align-items: center;
  gap: calc(var(--sn-layout-menu-action-gap, 4px) * 2);
  min-block-size: var(--sn-layout-menu-row-height, 30px);
  padding: calc(var(--sn-layout-menu-gap, 4px) * 1.25) calc(var(--sn-layout-menu-gap, 4px) * 2);
  border: var(--sn-panel-menu-border-width, 1px) solid var(--sn-border);
  border-radius: var(--sn-panel-radius, var(--sn-node-radius, 8px));
  background: var(--sn-panel-bg);
  color: var(--sn-text);
  box-shadow: var(--sn-panel-shadow, var(--sn-shadow-md));
}

.goal-status-icon {
  font-size: var(--sn-layout-menu-icon-size, 16px);
  color: var(--sn-accent);
}

.goal-status-main {
  display: grid;
  min-inline-size: 0;
  gap: 1px;
}

.goal-status-title,
.goal-status-meta {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.goal-status-title {
  font-size: var(--sn-composer-action-menu-label-size, calc(var(--sn-layout-menu-action-size, 12px) + 1px));
  font-weight: 600;
}

.goal-status-meta {
  font-size: var(--sn-layout-menu-action-size, 12px);
  color: var(--sn-muted);
}

.goal-status-actions {
  display: flex;
  align-items: center;
  gap: var(--sn-layout-menu-gap, 4px);
}

.goal-status-queue {
  display: flex;
  align-items: center;
  gap: var(--sn-layout-menu-gap, 4px);
  min-inline-size: 0;
  padding-inline: var(--sn-layout-menu-gap, 4px);
  border-inline: 1px solid var(--sn-border);
}

.goal-status-queue[hidden] {
  display: none !important;
}

.goal-status-queue-label {
  max-inline-size: 92px;
  overflow: hidden;
  color: var(--sn-muted);
  font-size: var(--sn-layout-menu-action-size, 12px);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.goal-status-action {
  display: grid;
  place-items: center;
  inline-size: var(--sn-layout-menu-action-height, 28px);
  block-size: var(--sn-layout-menu-action-height, 28px);
  border: 0;
  border-radius: var(--sn-control-radius, 6px);
  background: transparent;
  color: var(--sn-muted);
  cursor: pointer;
}

.goal-status-action[hidden] {
  display: none !important;
}

.goal-status-action:hover {
  background: var(--sn-surface-hover);
  color: var(--sn-text);
}

.goal-status-action.mode[data-active="true"] {
  background: color-mix(in oklab, var(--sn-node-selected) 18%, transparent);
  color: var(--sn-accent);
}

.goal-status-action.danger:hover {
  color: var(--sn-danger, var(--sn-accent));
}

.goal-status-action .material-symbols-outlined {
  font-size: var(--sn-layout-menu-icon-size, 16px);
}

@media (max-width: 720px) {
  .goal-status {
    inline-size: min(420px, calc(100vw - 24px));
  }

  .goal-status-surface {
    grid-template-columns: var(--sn-layout-menu-icon-size, 16px) minmax(0, 1fr) auto;
  }

  .goal-status-queue {
    grid-column: 2 / -1;
    border-inline: 0;
    border-block-start: 1px solid var(--sn-border);
    padding-block-start: var(--sn-layout-menu-gap, 4px);
  }
}

`;
