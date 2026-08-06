import { themedScrollFadeBlockStyles } from '../../themes/scroll-fade-styles.js';

export default `
:host,
chat-sidebar-shell {
  display: flex;
  height: 100%;
  width: var(--chat-nav-width, var(--sn-chat-sidebar-width, 200px));
  min-width: var(--chat-nav-width, var(--sn-chat-sidebar-width, 200px));
  flex: 0 0 var(--chat-nav-width, var(--sn-chat-sidebar-width, 200px));
  position: relative;
  z-index: 10;
  transition: width var(--sn-transition-normal) var(--sn-transition-easing), min-width var(--sn-transition-normal) var(--sn-transition-easing), flex-basis var(--sn-transition-normal) var(--sn-transition-easing);
}

:host([resizing]),
chat-sidebar-shell[resizing]  {
  transition: none;
}

:host([resizing]) .chat-nav,
chat-sidebar-shell[resizing] .chat-nav  {
  transition: none;
}

.chat-nav {
  height: 100%;
  width: var(--chat-nav-width, var(--sn-chat-sidebar-width, 200px));
  min-width: var(--chat-nav-width, var(--sn-chat-sidebar-width, 200px));
  flex-shrink: 0;
  position: relative;
  display: flex;
  flex-direction: column;
  border-right: none;
  background: var(--sn-sys-surface-raised);
  overflow: hidden;
  transition: width var(--sn-transition-normal) var(--sn-transition-easing), min-width var(--sn-transition-normal) var(--sn-transition-easing);
  user-select: none;
}

.chat-nav[collapsed] {
  width: var(--chat-nav-width, var(--sn-chat-sidebar-collapsed-width, var(--sn-layout-header-block-size, calc(var(--sn-layout-header-min-height, 28px) + 3px))));
  min-width: var(--chat-nav-width, var(--sn-chat-sidebar-collapsed-width, var(--sn-layout-header-block-size, calc(var(--sn-layout-header-min-height, 28px) + 3px))));
  overflow: visible;
}

.chat-nav[resizing],
.chat-nav[resizing] + *  {
  user-select: none;
}

.chat-nav-resize-handle {
  position: absolute;
  top: 0;
  right: var(--sn-step-0, -1px);
  bottom: 0;
  width: var(--sn-chat-sidebar-resize-hit-size, 4px);
  cursor: col-resize;
  background: transparent;
  z-index: 20;
  transition: background var(--sn-transition-fast) var(--sn-transition-easing);
}

.chat-nav-resize-handle:hover,
.chat-nav-resize-handle.dragging,
.chat-nav[resizing] .chat-nav-resize-handle  {
  background: var(--sn-layout-resizer-hover-bg, color-mix(in oklch, var(--sn-sys-accent) var(--sn-sys-state-hover-mix), transparent));
}

.chat-nav-header {
  display: flex;
  align-items: center;
  gap: var(--sn-chat-sidebar-header-gap, 2px);
  padding: var(--sn-chat-sidebar-header-padding, 2px 4px);
  min-height: var(--sn-chat-sidebar-header-min-height, 28px);
  background: var(--sn-sys-surface-raised);
  border-bottom: none;
  flex-shrink: 0;
}

.chat-nav[collapsed] .chat-nav-header  {
  flex-direction: column-reverse;
  justify-content: flex-start;
  padding: var(--sn-chat-sidebar-collapsed-header-padding, 4px 0);
  gap: var(--sn-chat-sidebar-collapsed-header-gap, 8px);
}

.chat-nav-header .nav-spacer {
  flex: 1;
}

.chat-nav[collapsed] .nav-spacer  {
  display: none;
}

.chat-nav-header .nav-title {
  font-size: var(--sn-chat-sidebar-title-size, 11px);
  font-weight: 600;
  color: var(--sn-sys-on-surface-dim);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  white-space: nowrap;
  overflow: hidden;
}

.chat-nav[collapsed] .nav-title  {
  display: none;
}

.chat-nav-collapse-icon {
  transition: transform var(--sn-transition-normal) var(--sn-transition-easing);
}

.chat-nav[collapsed] .chat-nav-collapse-icon  {
  transform: rotate(180deg);
}

.nav-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--sn-chat-sidebar-button-padding, 4px 6px);
  background: transparent;
  border: none;
  border-radius: var(--sn-chat-sidebar-button-radius, 4px);
  cursor: pointer;
  color: var(--sn-sys-on-surface-dim);
  font-size: var(--sn-chat-sidebar-button-size, 0.75rem);
  transition: background var(--sn-transition-fast) var(--sn-transition-easing), color var(--sn-transition-fast) var(--sn-transition-easing);
  flex-shrink: 0;
}

.nav-btn .material-symbols-outlined {
  font-size: var(--sn-chat-sidebar-button-icon-size, 16px);
}

.nav-btn:hover {
  background: color-mix(in oklch, var(--sn-sys-accent) var(--sn-sys-state-hover-mix), var(--sn-sys-surface-raised));
  color: var(--sn-sys-on-surface);
}

.chat-items {
  flex: 1;
  overflow-y: auto;
  ${themedScrollFadeBlockStyles}
  padding: var(--sn-chat-sidebar-items-padding, 4px 0);
}

.chat-nav[collapsed] .chat-items  {
  overflow: visible;
}

`;
