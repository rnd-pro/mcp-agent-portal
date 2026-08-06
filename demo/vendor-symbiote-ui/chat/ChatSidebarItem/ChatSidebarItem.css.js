export default `
:host,
chat-sidebar-item,
chat-sidebar-sub-item {
  display: block;
  content-visibility: auto;
  contain-intrinsic-size: auto var(--sn-chat-sidebar-item-intrinsic-height, 28px);
  --sn-chat-compact-label-width: clamp(var(--sn-chat-sidebar-compact-label-min, 72px), calc(var(--sn-chat-compact-label-ch, 18) * var(--sn-chat-sidebar-compact-label-ch-width, 5px) + var(--sn-chat-sidebar-compact-label-extra, 20px)), var(--sn-chat-sidebar-compact-label-max, 320px));
  --sn-chat-compact-delete-width: var(--sn-chat-sidebar-compact-delete-width, 44px);
  --sn-chat-compact-flyout-width: calc(var(--sn-chat-compact-label-width) + var(--sn-chat-compact-delete-width));
}

.chat-item {
  display: flex;
  align-items: center;
  gap: var(--sn-chat-sidebar-row-gap, 10px);
  padding: var(--sn-chat-sidebar-row-padding, 6px 14px);
  min-height: var(--sn-chat-sidebar-row-min-height, 28px);
  cursor: pointer;
  color: var(--sn-sys-on-surface-dim);
  transition: background var(--sn-transition-fast) var(--sn-transition-easing), color var(--sn-transition-fast) var(--sn-transition-easing);
  white-space: nowrap;
  overflow: hidden;
}

.chat-item:hover {
  background: color-mix(in oklch, var(--sn-sys-accent) var(--sn-sys-state-hover-mix), var(--sn-sys-surface-raised));
  color: var(--sn-sys-on-surface);
}

:host([data-active]) > .chat-item,
:host([data-active]) > .chat-item-child,
chat-sidebar-item[data-active] > .chat-item,
chat-sidebar-sub-item[data-active] > .chat-item-child {
  color: var(--sn-sys-on-surface);
  background: color-mix(in oklab, var(--sn-chat-item-icon-color, var(--sn-cat-server)) 14%, color-mix(in oklch, var(--sn-sys-accent) var(--sn-sys-state-hover-mix), var(--sn-sys-surface-raised)));
  border-left: var(--sn-chat-sidebar-active-border-width, 2px) solid var(--sn-chat-item-icon-color, var(--sn-cat-server));
  padding-left: var(--sn-chat-sidebar-active-padding-left, 12px);
}

:host([data-group]) > .chat-item,
chat-sidebar-item[data-group] > .chat-item {
  color: var(--sn-sys-on-surface);
  font-weight: 600;
}

.chat-nav[data-group-dividers] chat-sidebar-item[data-group] + chat-sidebar-item[data-group] {
  position: relative;
  margin-block-start: var(--sn-chat-sidebar-group-divider-margin, 4px);
  padding-block-start: var(--sn-chat-sidebar-group-divider-padding, 4px);
}

.chat-nav[data-group-dividers] chat-sidebar-item[data-group] + chat-sidebar-item[data-group]::before {
  content: '';
  position: absolute;
  inset-block-start: 0;
  inset-inline-start: var(--sn-chat-sidebar-group-divider-inset, 16px);
  inline-size: var(--sn-chat-sidebar-group-divider-width, 16px);
  block-size: var(--sn-chat-sidebar-group-divider-height, 1px);
  background: var(--sn-tabs-divider);
}

:host([data-group]) > .chat-item .chat-item-label,
chat-sidebar-item[data-group] > .chat-item .chat-item-label {
  color: var(--sn-sys-on-surface);
}

:host([data-group]) > .chat-item .chat-item-delete,
chat-sidebar-item[data-group] > .chat-item .chat-item-delete {
  display: none;
}

.chat-item .material-symbols-outlined,
.chat-item-child .material-symbols-outlined {
  font-size: var(--sn-chat-sidebar-icon-size, 16px);
  flex-shrink: 0;
}

.chat-item-icon-slot {
  position: relative;
  width: var(--sn-chat-sidebar-icon-box-size, 16px);
  height: var(--sn-chat-sidebar-icon-box-size, 16px);
  flex: 0 0 var(--sn-chat-sidebar-icon-box-size, 16px);
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.chat-item-icon {
  color: var(--sn-chat-item-icon-color);
  transition: opacity var(--sn-transition-fast) var(--sn-transition-easing);
}

.chat-item-label {
  font-size: var(--sn-chat-sidebar-title-size, 11px);
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--sn-sys-on-surface);
}

.chat-status-icon {
  margin-left: var(--sn-chat-sidebar-status-margin, 4px);
  font-size: var(--sn-chat-status-icon-size);
}

.chat-status-icon[hidden] {
  display: none;
}

.chat-status-icon[data-status="running"] {
  color: var(--sn-sys-accent);
}

.chat-status-icon[data-status="running"] {
  animation: spin var(--sn-animation-duration-normal) linear infinite;
  animation-play-state: var(--sn-animation-play-state);
}

.chat-status-icon[data-status="done"] {
  color: var(--sn-sys-success);
}

.chat-status-icon[data-status="error"] {
  color: var(--sn-sys-danger);
}

@keyframes spin {
  100% { transform: rotate(360deg); }
}

.chat-item-adapter {
  font-size: var(--sn-chat-sidebar-meta-size, 9px);
  color: var(--sn-sys-on-surface-dim);
  font-family: var(--sn-font-mono, monospace);
  margin-left: var(--sn-chat-sidebar-meta-margin, 6px);
}

.chat-item-adapter:empty,
.chat-item-type:empty {
  display: none;
}

.chat-item-type {
  font-size: var(--sn-chat-sidebar-meta-size, 9px);
  color: var(--sn-cat-server);
  background: color-mix(in oklab, var(--sn-cat-server) 10%, transparent);
  font-family: var(--sn-font-mono, monospace);
  margin-left: auto;
  padding: var(--sn-chat-sidebar-type-padding, 2px 4px);
  border-radius: var(--sn-chat-sidebar-type-radius, 3px);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.chat-item-delete {
  position: absolute;
  inset: 0;
  display: flex;
  width: var(--sn-chat-sidebar-delete-box-size, 16px);
  height: var(--sn-chat-sidebar-delete-box-size, 16px);
  border: none;
  background: transparent;
  color: var(--sn-sys-on-surface-dim);
  cursor: pointer;
  font-size: var(--sn-chat-sidebar-delete-size, 14px);
  padding: 0;
  align-items: center;
  justify-content: center;
  border-radius: var(--sn-chat-sidebar-delete-radius, 3px);
  margin: 0;
  opacity: 0;
  pointer-events: none;
  transition: color var(--sn-transition-fast) var(--sn-transition-easing), opacity var(--sn-transition-fast) var(--sn-transition-easing);
}

.chat-item-delete .material-symbols-outlined {
  font-size: var(--sn-chat-sidebar-delete-icon-size, 15px);
}

.chat-item-delete[hidden] {
  display: none !important;
}

.chat-item:hover .chat-item-icon,
.chat-item-child:hover .chat-item-icon {
  opacity: 0;
}

.chat-item:hover .chat-item-delete,
.chat-item:has(.chat-item-delete:hover) .chat-item-delete,
.chat-item:has(.chat-item-delete:focus-visible) .chat-item-delete,
.chat-item-child:hover .chat-item-delete,
.chat-item-child:has(.chat-item-delete:hover) .chat-item-delete,
.chat-item-child:has(.chat-item-delete:focus-visible) .chat-item-delete {
  opacity: 1;
  pointer-events: auto;
}

.chat-item-delete:hover {
  opacity: 1;
  pointer-events: auto;
  color: var(--sn-sys-danger);
  background: color-mix(in oklch, var(--sn-sys-danger) var(--sn-sys-state-hover-mix), transparent);
}

.chat-expand-icon {
  margin-left: auto;
  font-size: var(--sn-chat-sidebar-expand-icon-size, 14px) !important;
  transition: transform var(--sn-transition-fast) var(--sn-transition-easing), opacity var(--sn-transition-fast) var(--sn-transition-easing);
  cursor: pointer;
  flex-shrink: 0;
  opacity: 0.2;
}

:host([data-has-sub]) .chat-expand-icon,
chat-sidebar-item[data-has-sub] > .chat-item .chat-expand-icon,
chat-sidebar-sub-item[data-has-sub] > .chat-item-child .chat-expand-icon {
  opacity: 0.5;
}

:host([data-has-sub]) .chat-expand-icon:hover,
chat-sidebar-item[data-has-sub] > .chat-item .chat-expand-icon:hover,
chat-sidebar-sub-item[data-has-sub] > .chat-item-child .chat-expand-icon:hover {
  opacity: 1;
}

:host([data-expanded]) .chat-expand-icon,
chat-sidebar-item[data-expanded] > .chat-item .chat-expand-icon,
chat-sidebar-sub-item[data-expanded] > .chat-item-child .chat-expand-icon {
  transform: rotate(90deg);
}

.chat-sub-items {
  width: 100%;
  max-height: 0;
  overflow: hidden;
  transition: max-height var(--sn-transition-normal) var(--sn-transition-easing);
}

:host([data-expanded]) .chat-sub-items,
chat-sidebar-item[data-expanded] > .chat-sub-items,
chat-sidebar-sub-item[data-expanded] > .chat-sub-items {
  max-height: 500px;
}

.chat-item-child {
  display: flex;
  align-items: center;
  gap: var(--sn-chat-sidebar-child-gap, 8px);
  padding: var(--sn-chat-sidebar-child-padding, 4px 14px 4px 38px);
  font-size: var(--sn-chat-sidebar-child-size, 12px);
  min-height: var(--sn-chat-sidebar-child-min-height, 24px);
  position: relative;
  color: var(--sn-sys-on-surface-dim);
  cursor: pointer;
  transition: background var(--sn-transition-fast) var(--sn-transition-easing), color var(--sn-transition-fast) var(--sn-transition-easing);
}

.chat-item-child:hover {
  background: color-mix(in oklch, var(--sn-sys-accent) var(--sn-sys-state-hover-mix), var(--sn-sys-surface-raised));
  color: var(--sn-sys-on-surface);
}

.chat-item-child::before {
  content: '';
  position: absolute;
  left: var(--sn-chat-sidebar-child-line-left, 20px);
  top: 0;
  bottom: 0;
  width: 1px;
  background: var(--sn-sys-outline-subtle);
}

chat-sidebar-sub-item .chat-sub-items chat-sidebar-sub-item .chat-item-child {
  padding-left: var(--sn-chat-sidebar-child-deep-padding-left, 58px);
}

:host([data-active]) > .chat-item-child,
chat-sidebar-sub-item[data-active] > .chat-item-child {
  padding-left: var(--sn-chat-sidebar-child-active-padding-left, 36px);
}

chat-sidebar-sub-item .chat-sub-items chat-sidebar-sub-item[data-active] > .chat-item-child {
  padding-left: var(--sn-chat-sidebar-child-deep-active-padding-left, 56px);
}

chat-sidebar-sub-item .chat-sub-items chat-sidebar-sub-item .chat-item-child::before {
  left: var(--sn-chat-sidebar-child-deep-line-left, 40px);
}

:host-context(.chat-nav[collapsed]) .chat-item-child::before,
.chat-nav[collapsed] chat-sidebar-sub-item .chat-item-child::before {
  content: none;
}

:host-context(.chat-nav[collapsed]) .chat-sub-items,
.chat-nav[collapsed] chat-sidebar-item .chat-sub-items,
.chat-nav[collapsed] chat-sidebar-sub-item .chat-sub-items {
  display: none;
  max-height: 0;
}

.chat-nav[collapsed] chat-sidebar-item[data-expanded] > .chat-sub-items,
.chat-nav[collapsed] chat-sidebar-sub-item[data-expanded] > .chat-sub-items {
  display: block;
  max-height: 500px;
  overflow: visible;
}

:host-context(.chat-nav[collapsed]) .chat-item-adapter,
:host-context(.chat-nav[collapsed]) .chat-expand-icon,
:host-context(.chat-nav[collapsed]) .chat-status-icon,
:host-context(.chat-nav[collapsed]) .chat-item-type,
.chat-nav[collapsed] chat-sidebar-item .chat-item-adapter,
.chat-nav[collapsed] chat-sidebar-sub-item .chat-item-adapter,
.chat-nav[collapsed] chat-sidebar-item .chat-expand-icon,
.chat-nav[collapsed] chat-sidebar-sub-item .chat-expand-icon,
.chat-nav[collapsed] chat-sidebar-item .chat-status-icon,
.chat-nav[collapsed] chat-sidebar-sub-item .chat-status-icon,
.chat-nav[collapsed] chat-sidebar-sub-item .chat-item-type {
  display: none;
}

:host-context(.chat-nav[collapsed]) .chat-item,
:host-context(.chat-nav[collapsed]) .chat-item-child,
.chat-nav[collapsed] chat-sidebar-item .chat-item,
.chat-nav[collapsed] chat-sidebar-sub-item .chat-item-child {
  position: relative;
  justify-content: center;
  padding: 0;
  overflow: visible;
}

:host-context(.chat-nav[collapsed]) .chat-item:hover,
:host-context(.chat-nav[collapsed]) .chat-item:focus-within,
:host-context(.chat-nav[collapsed]) .chat-item:has(.chat-item-delete:hover),
:host-context(.chat-nav[collapsed]) .chat-item:has(.chat-item-delete:focus-visible),
:host-context(.chat-nav[collapsed]) .chat-item-child:hover,
:host-context(.chat-nav[collapsed]) .chat-item-child:focus-within,
:host-context(.chat-nav[collapsed]) .chat-item-child:has(.chat-item-delete:hover),
:host-context(.chat-nav[collapsed]) .chat-item-child:has(.chat-item-delete:focus-visible),
.chat-nav[collapsed] chat-sidebar-item .chat-item:hover,
.chat-nav[collapsed] chat-sidebar-item .chat-item:focus-within,
.chat-nav[collapsed] chat-sidebar-item .chat-item:has(.chat-item-delete:hover),
.chat-nav[collapsed] chat-sidebar-item .chat-item:has(.chat-item-delete:focus-visible),
.chat-nav[collapsed] chat-sidebar-item .chat-item-child:hover,
.chat-nav[collapsed] chat-sidebar-item .chat-item-child:focus-within,
.chat-nav[collapsed] chat-sidebar-item .chat-item-child:has(.chat-item-delete:hover),
.chat-nav[collapsed] chat-sidebar-item .chat-item-child:has(.chat-item-delete:focus-visible),
.chat-nav[collapsed] chat-sidebar-sub-item .chat-item-child:hover,
.chat-nav[collapsed] chat-sidebar-sub-item .chat-item-child:focus-within,
.chat-nav[collapsed] chat-sidebar-sub-item .chat-item-child:has(.chat-item-delete:hover),
.chat-nav[collapsed] chat-sidebar-sub-item .chat-item-child:has(.chat-item-delete:focus-visible) {
  z-index: 30;
}

:host-context(.chat-nav[collapsed]) .chat-item-label,
.chat-nav[collapsed] chat-sidebar-item .chat-item-label,
.chat-nav[collapsed] chat-sidebar-sub-item .chat-item-label {
  position: absolute;
  inset-block: 0;
  inset-inline-start: var(--sn-chat-sidebar-compact-label-inset, 46px);
  inline-size: var(--sn-chat-compact-label-width);
  display: flex;
  align-items: center;
  padding-inline: var(--sn-chat-sidebar-compact-label-padding, 10px 0);
  background: var(--sn-sys-surface-raised);
  color: var(--sn-sys-on-surface);
  box-shadow: var(--sn-chat-item-child-shadow);
  z-index: 29;
  opacity: 0;
  pointer-events: none;
  transform: translateX(calc(-1 * var(--sn-chat-sidebar-compact-label-offset, 4px)));
  transition: opacity var(--sn-transition-fast) var(--sn-transition-easing), transform var(--sn-transition-fast) var(--sn-transition-easing);
}

:host-context(.chat-nav[collapsed]) .chat-item:hover .chat-item-label,
:host-context(.chat-nav[collapsed]) .chat-item:focus-within .chat-item-label,
:host-context(.chat-nav[collapsed]) .chat-item:has(.chat-item-delete:hover) .chat-item-label,
:host-context(.chat-nav[collapsed]) .chat-item:has(.chat-item-delete:focus-visible) .chat-item-label,
:host-context(.chat-nav[collapsed]) .chat-item-child:hover .chat-item-label,
:host-context(.chat-nav[collapsed]) .chat-item-child:focus-within .chat-item-label,
:host-context(.chat-nav[collapsed]) .chat-item-child:has(.chat-item-delete:hover) .chat-item-label,
:host-context(.chat-nav[collapsed]) .chat-item-child:has(.chat-item-delete:focus-visible) .chat-item-label,
.chat-nav[collapsed] chat-sidebar-item .chat-item:hover .chat-item-label,
.chat-nav[collapsed] chat-sidebar-item .chat-item:focus-within .chat-item-label,
.chat-nav[collapsed] chat-sidebar-item .chat-item:has(.chat-item-delete:hover) .chat-item-label,
.chat-nav[collapsed] chat-sidebar-item .chat-item:has(.chat-item-delete:focus-visible) .chat-item-label,
.chat-nav[collapsed] chat-sidebar-item .chat-item-child:hover .chat-item-label,
.chat-nav[collapsed] chat-sidebar-item .chat-item-child:focus-within .chat-item-label,
.chat-nav[collapsed] chat-sidebar-item .chat-item-child:has(.chat-item-delete:hover) .chat-item-label,
.chat-nav[collapsed] chat-sidebar-item .chat-item-child:has(.chat-item-delete:focus-visible) .chat-item-label,
.chat-nav[collapsed] chat-sidebar-sub-item .chat-item-child:hover .chat-item-label,
.chat-nav[collapsed] chat-sidebar-sub-item .chat-item-child:focus-within .chat-item-label,
.chat-nav[collapsed] chat-sidebar-sub-item .chat-item-child:has(.chat-item-delete:hover) .chat-item-label,
.chat-nav[collapsed] chat-sidebar-sub-item .chat-item-child:has(.chat-item-delete:focus-visible) .chat-item-label {
  opacity: 1;
  pointer-events: auto;
  transform: translateX(0);
}

:host-context(.chat-nav[collapsed]) .chat-item-icon-slot,
.chat-nav[collapsed] chat-sidebar-item .chat-item-icon-slot,
.chat-nav[collapsed] chat-sidebar-sub-item .chat-item-icon-slot {
  position: static;
}

:host-context(.chat-nav[collapsed]) .chat-item:hover .chat-item-icon,
:host-context(.chat-nav[collapsed]) .chat-item-child:hover .chat-item-icon,
.chat-nav[collapsed] chat-sidebar-item .chat-item:hover .chat-item-icon,
.chat-nav[collapsed] chat-sidebar-item .chat-item-child:hover .chat-item-icon,
.chat-nav[collapsed] chat-sidebar-sub-item .chat-item-child:hover .chat-item-icon {
  opacity: 1;
}

:host-context(.chat-nav[collapsed]) .chat-item-delete,
.chat-nav[collapsed] chat-sidebar-item .chat-item-delete,
.chat-nav[collapsed] chat-sidebar-sub-item .chat-item-delete {
  inset: 0 auto 0 calc(var(--sn-chat-sidebar-compact-label-inset, 46px) + var(--sn-chat-compact-label-width));
  width: var(--sn-chat-compact-delete-width);
  height: 100%;
  background: var(--sn-sys-surface-raised);
  border-radius: 0 var(--sn-radius-sm) var(--sn-radius-sm) 0;
  z-index: 31;
  transition: color var(--sn-transition-fast) var(--sn-transition-easing), opacity var(--sn-transition-fast) var(--sn-transition-easing);
}

:host-context(.chat-nav[collapsed]) .chat-item:hover .chat-item-delete,
:host-context(.chat-nav[collapsed]) .chat-item:focus-within .chat-item-delete,
:host-context(.chat-nav[collapsed]) .chat-item:has(.chat-item-delete:hover) .chat-item-delete,
:host-context(.chat-nav[collapsed]) .chat-item:has(.chat-item-delete:focus-visible) .chat-item-delete,
:host-context(.chat-nav[collapsed]) .chat-item-child:hover .chat-item-delete,
:host-context(.chat-nav[collapsed]) .chat-item-child:focus-within .chat-item-delete,
:host-context(.chat-nav[collapsed]) .chat-item-child:has(.chat-item-delete:hover) .chat-item-delete,
:host-context(.chat-nav[collapsed]) .chat-item-child:has(.chat-item-delete:focus-visible) .chat-item-delete,
.chat-nav[collapsed] chat-sidebar-item .chat-item:hover .chat-item-delete,
.chat-nav[collapsed] chat-sidebar-item .chat-item:focus-within .chat-item-delete,
.chat-nav[collapsed] chat-sidebar-item .chat-item:has(.chat-item-delete:hover) .chat-item-delete,
.chat-nav[collapsed] chat-sidebar-item .chat-item:has(.chat-item-delete:focus-visible) .chat-item-delete,
.chat-nav[collapsed] chat-sidebar-item .chat-item-child:hover .chat-item-delete,
.chat-nav[collapsed] chat-sidebar-item .chat-item-child:focus-within .chat-item-delete,
.chat-nav[collapsed] chat-sidebar-item .chat-item-child:has(.chat-item-delete:hover) .chat-item-delete,
.chat-nav[collapsed] chat-sidebar-item .chat-item-child:has(.chat-item-delete:focus-visible) .chat-item-delete,
.chat-nav[collapsed] chat-sidebar-sub-item .chat-item-child:hover .chat-item-delete,
.chat-nav[collapsed] chat-sidebar-sub-item .chat-item-child:focus-within .chat-item-delete,
.chat-nav[collapsed] chat-sidebar-sub-item .chat-item-child:has(.chat-item-delete:hover) .chat-item-delete,
.chat-nav[collapsed] chat-sidebar-sub-item .chat-item-child:has(.chat-item-delete:focus-visible) .chat-item-delete {
  opacity: 1;
  pointer-events: auto;
}
`;
