/**
 * LayoutSidebar styles
 * @module symbiote-ui/layout/LayoutSidebar
 */
import { css } from '@symbiotejs/symbiote';
import { themedScrollFadeBlockStyles } from '../../themes/scroll-fade-styles.js';

export let sidebarStyles = css`
  layout-sidebar {
    display: flex;
    flex-direction: column;
    width: var(--sn-sidebar-width);
    min-width: var(--sn-sidebar-width);
    background: var(--sn-sys-surface);
    border-top: 1px solid var(--sn-layout-border);
    border-right: 1px solid var(--sn-layout-border);
    overflow: hidden;
    transition:
      width 0.2s ease,
      min-width 0.2s ease;
    user-select: none;
    position: relative;

    &[collapsed] {
      width: var(--sn-sidebar-collapsed-width, var(--sn-layout-header-block-size, calc(var(--sn-layout-header-min-height, 28px) + 3px)));
      min-width: var(--sn-sidebar-collapsed-width, var(--sn-layout-header-block-size, calc(var(--sn-layout-header-min-height, 28px) + 3px)));
    }
  }

  /* Resize handle — right edge */
  layout-sidebar .sb-resize-handle {
    position: absolute;
    top: 0;
    right: calc(-1 * var(--sn-sidebar-resize-offset));
    width: var(--sn-sidebar-resize-width);
    height: 100%;
    cursor: col-resize;
    z-index: 10;
    transition: background var(--sn-transition-fast) var(--sn-transition-easing);

    &:hover,
    &.dragging {
      background: color-mix(in oklch, var(--sn-sys-accent) var(--sn-sys-state-hover-mix), transparent);
    }

    layout-sidebar[collapsed] & {
      display: none;
    }
  }

  /* ═══════════════════════ Header — same as panel headers ═══════════════════════ */
  layout-sidebar .sb-header {
    display: flex;
    align-items: center;
    gap: var(--sn-layout-header-gap, 2px);
    padding: var(--sn-layout-header-padding, 2px 4px);
    min-height: var(--sn-layout-header-min-height, 28px);
    block-size: var(--sn-layout-header-block-size, calc(var(--sn-layout-header-min-height, 28px) + 3px));
    min-block-size: var(--sn-layout-header-block-size, calc(var(--sn-layout-header-min-height, 28px) + 3px));
    background: var(--sn-layout-sidebar-header-bg, var(--sn-node-header-bg));
    box-sizing: border-box;
    border-bottom: 1px solid var(--sn-layout-sidebar-header-border, var(--sn-layout-border));
    flex-shrink: 0;

    /* Collapsed: center the collapse button */
    layout-sidebar[collapsed] & {
      justify-content: center;
      padding: var(--sn-layout-header-padding, 2px 4px);
    }
  }

  layout-sidebar .sb-header-spacer {
    flex: 1;

    layout-sidebar[collapsed] & {
      display: none;
    }
  }

  /* Header buttons — same style as panel header-btn */
  layout-sidebar .sb-header-btn {
    display: flex;
    align-items: center;
    gap: var(--sn-layout-header-button-gap, 4px);
    padding: var(--sn-layout-header-button-padding, 4px 6px);
    background: transparent;
    border: none;
    border-radius: var(--sn-layout-header-button-radius, 4px);
    cursor: pointer;
    color: var(--sn-sys-on-surface-dim);
    font-size: var(--sn-layout-header-button-size, 0.75rem);
    box-sizing: border-box;
    min-inline-size: var(--sn-layout-header-button-min-inline-size, 24px);
    block-size: var(--sn-layout-header-button-block-size, var(--sn-layout-header-button-min-block-size, 24px));
    min-block-size: var(--sn-layout-header-button-block-size, var(--sn-layout-header-button-min-block-size, 24px));
    min-width: 0;
    line-height: 1;
    transition:
      background var(--sn-transition-fast) var(--sn-transition-easing),
      color var(--sn-transition-fast) var(--sn-transition-easing);

    &:hover {
      background: var(--sn-layout-sidebar-header-button-hover-bg, color-mix(in oklch, var(--sn-sys-accent) var(--sn-sys-state-hover-mix), transparent));
      color: var(--sn-sys-on-surface);
    }

    & .material-symbols-outlined {
      font-size: var(--sn-layout-header-icon-size, 16px);
    }

    /* Active tune button in edit mode */
    layout-sidebar[edit-mode] &:first-child {
      color: var(--sn-cat-server);
      background: var(--sn-layout-sidebar-header-button-active-bg, color-mix(in oklab, var(--sn-cat-server) 10%, transparent));
    }
  }

  /* Reset button — visible only in edit mode */
  layout-sidebar .sb-reset-btn {
    display: none;

    layout-sidebar[edit-mode] & {
      display: flex;
    }

    layout-sidebar[collapsed] & {
      display: none;
    }

    &:hover {
      background: color-mix(in oklch, var(--sn-sys-warning) var(--sn-sys-state-hover-mix), transparent);
      color: var(--sn-sys-warning);
    }
  }

  /* Hide tune button when collapsed */
  layout-sidebar[collapsed] .sb-header-btn:first-child {
    display: none;
  }

  /* Collapse icon rotation */
  layout-sidebar .sb-collapse-icon {
    transition: transform var(--sn-transition-normal) var(--sn-transition-easing);
  }

  layout-sidebar[collapsed] .sb-collapse-icon {
    transform: rotate(180deg);
  }

  /* ═══════════════════════ Sections container ═══════════════════════ */
  layout-sidebar .sb-sections {
    flex: 1;
    overflow-y: auto;
    overflow-x: hidden;
    ${themedScrollFadeBlockStyles}
    padding: var(--sn-step-2) 0;

    layout-sidebar[collapsed] & {
      padding: var(--sn-sidebar-collapsed-sections-padding, var(--sn-step-2, 4px) 0);
    }
  }

  /* ═══════════════════════ SidebarSection ═══════════════════════ */
  sidebar-section {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    position: relative;

    /* Hidden section in normal mode */
    &[data-hidden] {
      display: none;
    }

    /* Disabled section — shown but not interactive */
    &[data-disabled] {
      opacity: 0.35;
      pointer-events: none;
      filter: grayscale(0.5);
    }

    /* In edit mode, show disabled sections normally (admin might want to toggle visibility) */
    layout-sidebar[edit-mode] &[data-disabled] {
      opacity: 0.5;
      pointer-events: auto;
      filter: none;
    }

    /* In edit mode, hidden sections are dimmed */
    layout-sidebar[edit-mode] &[data-hidden] {
      display: flex;
      opacity: 0.35;
    }

    /* Drag states */
    &[data-dragging] {
      opacity: 0.4;
    }

    &[data-dragover] {
      border-top: 2px solid var(--sn-cat-server);
    }
  }

  /* Drag handle — edit mode only */
  sidebar-section .sec-drag-handle {
    display: none;
    align-items: center;
    padding: 0 var(--sn-step-1);
    cursor: grab;
    color: var(--sn-sys-on-surface-dim);

    & .material-symbols-outlined {
      font-size: var(--sn-text-xl);
    }

    &:active {
      cursor: grabbing;
    }

    layout-sidebar[edit-mode] & {
      display: flex;
    }

    layout-sidebar[collapsed] & {
      display: none;
    }
  }

  /* Section row */
  sidebar-section .sec-item {
    display: flex;
    align-items: center;
    gap: var(--sn-step-5);
    flex: 1;
    padding: var(--sn-layout-sidebar-item-padding, var(--sn-step-2) var(--sn-step-7));
    box-sizing: border-box;
    block-size: var(--sn-layout-sidebar-item-block-size, var(--sn-layout-header-block-size, calc(var(--sn-layout-header-min-height, 28px) + 3px)));
    min-height: var(--sn-layout-sidebar-item-block-size, var(--sn-layout-header-block-size, calc(var(--sn-layout-header-min-height, 28px) + 3px)));
    cursor: pointer;
    color: var(--sn-sys-on-surface-dim);
    transition:
      background 0.12s,
      color 0.12s;
    white-space: nowrap;
    overflow: hidden;

    layout-sidebar[edit-mode] & {
      padding-left: var(--sn-step-2);
    }

    &:hover {
      background: color-mix(in oklch, var(--sn-sys-accent) var(--sn-sys-state-hover-mix), var(--sn-sys-surface));
      color: var(--sn-sys-on-surface);
    }

    layout-sidebar[collapsed] & {
      justify-content: center;
      flex: 0 0 auto;
      inline-size: var(--sn-sidebar-collapsed-item-size, var(--sn-layout-sidebar-item-block-size, var(--sn-layout-header-block-size, calc(var(--sn-layout-header-min-height, 28px) + 3px))));
      block-size: var(--sn-sidebar-collapsed-item-size, var(--sn-layout-sidebar-item-block-size, var(--sn-layout-header-block-size, calc(var(--sn-layout-header-min-height, 28px) + 3px))));
      min-height: var(--sn-sidebar-collapsed-item-size, var(--sn-layout-sidebar-item-block-size, var(--sn-layout-header-block-size, calc(var(--sn-layout-header-min-height, 28px) + 3px))));
      margin-inline: auto;
      padding: 0;
      border-radius: var(--sn-sidebar-collapsed-item-radius, var(--sn-radius-sm, 4px));
      box-sizing: border-box;
    }
  }

  sidebar-section .sec-icon {
    font-size: var(--sn-text-xl);
    flex-shrink: 0;
  }

  sidebar-section .sec-label {
    font-size: var(--sn-text-md);
    font-weight: 500;

    layout-sidebar[collapsed] & {
      display: none;
    }
  }

  /* Expand chevron */
  sidebar-section .sec-expand {
    margin-left: auto;
    font-size: var(--sn-text-xl);
    transition:
      transform 0.15s,
      opacity 0.15s;

    layout-sidebar[collapsed] & {
      display: none;
    }

    layout-sidebar[edit-mode] & {
      display: none;
    }

    /* Inactive state when no sub-panels */
    sidebar-section:not([data-has-sub]) & {
      opacity: 0.2;
      cursor: default;
    }
  }

  /* Active section */
  sidebar-section[data-active] > .sec-item {
    color: var(--sn-sys-on-surface);
    background: var(--sn-sys-surface-raised);
    border-left: 2px solid var(--sn-cat-server);
    padding-left: var(--sn-step-6);

    layout-sidebar[edit-mode] & {
      padding-left: var(--sn-step-1);
    }

    layout-sidebar[collapsed] & {
      justify-content: center;
      inline-size: var(--sn-sidebar-collapsed-item-size, var(--sn-layout-sidebar-item-block-size, var(--sn-layout-header-block-size, calc(var(--sn-layout-header-min-height, 28px) + 3px))));
      margin-inline: auto;
      border-radius: var(--sn-sidebar-collapsed-item-radius, var(--sn-radius-sm, 4px));
      padding: 0;
      border-left: 0;
      box-shadow: inset 2px 0 0 var(--sn-cat-server);
    }
  }

  /* Eye visibility button — edit mode only */
  sidebar-section .sec-eye {
    display: none;
    align-items: center;
    justify-content: center;
    padding: var(--sn-step-2) var(--sn-step-3);
    background: transparent;
    border: none;
    border-radius: var(--sn-radius-sm);
    cursor: pointer;
    color: var(--sn-sys-on-surface-dim);
    transition:
      color 0.15s,
      background 0.15s;
    flex-shrink: 0;

    &:hover {
      background: color-mix(in oklch, var(--sn-sys-accent) var(--sn-sys-state-hover-mix), var(--sn-sys-surface));
      color: var(--sn-sys-on-surface);
    }

    & .material-symbols-outlined {
      font-size: var(--sn-text-xl);
    }

    layout-sidebar[edit-mode] & {
      display: flex;
    }

    layout-sidebar[collapsed] & {
      display: none;
    }

    sidebar-section[data-hidden] & {
      opacity: 0.5;
    }
  }

  /* ═══════════════════════ Sub-panels ═══════════════════════ */
  sidebar-section .sec-sub-panels {
    width: 100%;
    overflow: hidden;
    max-height: 0;
    transition: max-height var(--sn-transition-normal) var(--sn-transition-easing);

    layout-sidebar[collapsed] & {
      display: none;
    }

    layout-sidebar[edit-mode] & {
      display: none;
    }
  }

  sidebar-section[data-expanded] .sec-sub-panels {
    max-height: 300px;
  }

  sidebar-section[data-expanded] .sec-expand {
    transform: rotate(90deg);
  }

  sidebar-section .sub-panel-item {
    display: flex;
    align-items: center;
    gap: var(--sn-step-4);
    padding: var(--sn-step-2) var(--sn-step-7) var(--sn-step-2) var(--sn-step-12, 38px);
    min-height: 24px;
    font-size: var(--sn-text-sm);
    color: var(--sn-sys-on-surface-dim);
    cursor: default;
    transition:
      background 0.12s,
      color 0.12s;

    &:hover {
      background: color-mix(in oklch, var(--sn-sys-accent) var(--sn-sys-state-hover-mix), var(--sn-sys-surface));
      color: var(--sn-sys-on-surface);
    }

    & .material-symbols-outlined {
      font-size: var(--sn-text-lg);
      opacity: 0.6;
    }
  }

  /* Close button on sub-panel items */
  sidebar-section .sub-panel-close {
    display: flex;
    align-items: center;
    justify-content: center;
    margin-left: auto;
    padding: var(--sn-step-1);
    background: transparent;
    border: none;
    border-radius: var(--sn-radius-xs, 3px);
    cursor: pointer;
    color: var(--sn-sys-on-surface-dim);
    opacity: 0;
    transition:
      opacity 0.12s,
      background 0.12s,
      color 0.12s;

    & .material-symbols-outlined {
      font-size: var(--sn-text-lg);
    }

    &:hover {
      background: color-mix(in oklch, var(--sn-sys-danger) var(--sn-sys-state-hover-mix), transparent);
      color: var(--sn-sys-danger);
    }
  }

  /* Show close only on hover of non-master items */
  sidebar-section .sub-panel-item:hover .sub-panel-close {
    opacity: 1;
  }

  /* Hide close button on master panel items */
  sidebar-sub-item[data-master] .sub-panel-close {
    display: none;
  }
`;
