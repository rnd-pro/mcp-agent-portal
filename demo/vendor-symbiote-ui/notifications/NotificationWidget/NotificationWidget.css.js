import { css } from '@symbiotejs/symbiote';
import { themedScrollFadeBlockStyles } from '../../themes/scroll-fade-styles.js';

export default css`
  notification-widget {
    position: relative;
    display: inline-flex;
    align-items: center;
    color: var(--sn-sys-on-surface);
    font-family: var(--sn-font);
  }

  notification-widget[hidden] {
    display: none !important;
  }

  notification-widget .nw-trigger {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: var(--sn-shell-menu-action-inner-gap, 6px);
    flex: 0 0 auto;
    min-height: var(--sn-shell-menu-action-height, 26px);
    padding: var(--sn-shell-menu-action-padding, 4px 10px);
    border: 1px solid transparent;
    border-radius: var(--sn-layout-header-button-radius, 4px);
    background: var(--sn-shell-menu-action-bg, transparent);
    color: var(--sn-sys-on-surface-dim);
    font: inherit;
    font-size: var(--sn-shell-menu-action-size, 11px);
    font-weight: 600;
    letter-spacing: var(--sn-shell-menu-action-letter-spacing, 0.5px);
    white-space: nowrap;
    cursor: pointer;
    transition: background var(--sn-transition-fast) var(--sn-transition-easing),
      border-color var(--sn-transition-fast) var(--sn-transition-easing),
      color var(--sn-transition-fast) var(--sn-transition-easing);
  }

  notification-widget .nw-trigger:hover,
  notification-widget .nw-trigger[active] {
    border-color: var(--sn-sys-outline);
    background: color-mix(in oklch, var(--sn-sys-accent) var(--sn-sys-state-hover-mix), transparent);
    color: var(--sn-sys-on-surface);
  }

  notification-widget .nw-trigger .material-symbols-outlined,
  notification-widget .nw-header-actions .material-symbols-outlined,
  .nw-popover[data-overlay-portal] .nw-header-actions .material-symbols-outlined {
    font-size: var(--sn-shell-menu-action-icon-size, var(--sn-layout-header-icon-size, 16px));
  }

  notification-widget .nw-popover,
  .nw-popover[data-overlay-portal] {
    --sn-overlay-z-tier: global;
    --sn-overlay-z-base: var(--sn-notification-widget-z, 20000);
    z-index: var(--sn-notification-widget-z, var(--sn-overlay-z-base, 20000));
    display: grid;
    grid-template-rows: auto auto auto;
    gap: var(--sn-notification-widget-gap, calc(var(--sn-step-4, 8px) * var(--sn-theme-density, 1)));
    width: min(94vw, var(--sn-notification-widget-width, 340px));
    max-width: calc(100vw - 16px);
    max-height: min(78vh, var(--sn-notification-widget-max-height, 560px));
    padding: var(--sn-notification-widget-padding, calc(var(--sn-step-5, 10px) * var(--sn-theme-density, 1)));
    overflow: auto;
    ${themedScrollFadeBlockStyles}
    border: var(--sn-node-border-width, 1px) solid var(--sn-sys-outline);
    border-radius: var(--sn-node-radius, 8px);
    background: var(--sn-sys-surface-panel);
    box-shadow: var(--sn-panel-shadow, var(--sn-sys-shadow-overlay));
    color: var(--sn-sys-on-surface);
    font-family: var(--sn-font);
  }

  notification-widget .nw-popover {
    position: absolute;
    top: calc(100% + var(--sn-notification-widget-offset, 8px));
    right: 0;
  }

  .nw-popover[data-overlay-portal] {
    position: fixed;
    top: 0;
    left: 0;
    right: auto;
  }

  notification-widget .nw-popover[hidden],
  .nw-popover[data-overlay-portal][hidden] {
    display: none;
  }

  notification-widget .nw-header,
  .nw-popover[data-overlay-portal] .nw-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--sn-notification-widget-gap, 8px);
    min-width: 0;
  }

  notification-widget .nw-header strong,
  .nw-popover[data-overlay-portal] .nw-header strong {
    min-width: 0;
    overflow: hidden;
    font-size: var(--sn-notification-widget-title-size, var(--sn-app-title-size, 13px));
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  notification-widget .nw-header-actions,
  .nw-popover[data-overlay-portal] .nw-header-actions {
    display: flex;
    align-items: center;
    gap: var(--sn-notification-widget-action-gap, 4px);
  }

  notification-widget .nw-header-actions button,
  .nw-popover[data-overlay-portal] .nw-header-actions button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: var(--sn-notification-widget-icon-button-size, var(--sn-theme-editor-icon-button-size, 28px));
    min-width: var(--sn-notification-widget-icon-button-size, var(--sn-theme-editor-icon-button-size, 28px));
    height: var(--sn-notification-widget-icon-button-size, var(--sn-theme-editor-icon-button-size, 28px));
    padding: 0;
    border: 1px solid var(--sn-button-border, var(--sn-sys-outline));
    border-radius: var(--sn-button-radius, 6px);
    background: var(--sn-button-bg, var(--sn-sys-surface-raised));
    color: var(--sn-button-color, var(--sn-sys-on-surface));
    font: inherit;
    cursor: pointer;
  }

  notification-widget .nw-header-actions button:hover,
  .nw-popover[data-overlay-portal] .nw-header-actions button:hover {
    background: var(--sn-button-hover-bg, color-mix(in oklch, var(--sn-sys-accent) var(--sn-sys-state-hover-mix), var(--sn-sys-surface-raised)));
  }

  notification-widget .nw-compact,
  .nw-popover[data-overlay-portal] .nw-compact {
    display: grid;
    gap: var(--sn-notification-widget-control-gap, 9px);
    min-width: 0;
  }

  notification-widget .nw-row,
  .nw-popover[data-overlay-portal] .nw-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: var(--sn-notification-widget-control-gap, 9px);
    color: var(--sn-sys-on-surface-dim);
    font-size: var(--sn-notification-widget-control-size, var(--sn-theme-editor-control-size, 12px));
  }

  notification-widget .nw-row label,
  .nw-popover[data-overlay-portal] .nw-row label {
    display: inline-flex;
    align-items: center;
    gap: var(--sn-notification-widget-label-gap, 6px);
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  notification-widget .nw-row label .material-symbols-outlined,
  .nw-popover[data-overlay-portal] .nw-row label .material-symbols-outlined {
    flex: none;
    font-size: var(--sn-notification-widget-label-icon-size, 15px);
    color: var(--sn-sys-on-surface-dim);
  }

  notification-widget .nw-row input[type="range"],
  .nw-popover[data-overlay-portal] .nw-row input[type="range"] {
    width: 100%;
    min-width: 0;
    height: var(--sn-notification-widget-range-hit-size, 34px);
    accent-color: var(--sn-sys-accent);
  }

  notification-widget .nw-row input[type="checkbox"],
  .nw-popover[data-overlay-portal] .nw-row input[type="checkbox"] {
    width: var(--sn-notification-widget-switch-size, 18px);
    height: var(--sn-notification-widget-switch-size, 18px);
    accent-color: var(--sn-sys-accent);
  }

  notification-widget .nw-trigger:focus-visible,
  notification-widget .nw-header-actions button:focus-visible,
  notification-widget .nw-row input:focus-visible,
  .nw-popover[data-overlay-portal] .nw-header-actions button:focus-visible,
  .nw-popover[data-overlay-portal] .nw-row input:focus-visible {
    outline: var(--sn-effect-focus-ring, 2px solid var(--sn-sys-focus-ring));
    outline-offset: 2px;
  }

  @media (max-width: 820px) {
    notification-widget .nw-trigger-label {
      display: none;
    }

    notification-widget .nw-popover,
    .nw-popover[data-overlay-portal] {
      position: fixed;
      top: var(--sn-notification-widget-mobile-top, calc(env(safe-area-inset-top) + var(--sn-step-12, 88px)));
      right: max(var(--sn-notification-widget-mobile-inset, 8px), env(safe-area-inset-right));
      left: max(var(--sn-notification-widget-mobile-inset, 8px), env(safe-area-inset-left));
      width: auto;
      max-width: none;
      max-height: calc(
        100dvh - var(--sn-notification-widget-mobile-top, calc(env(safe-area-inset-top) + 88px)) -
          max(var(--sn-notification-widget-mobile-inset, 8px), env(safe-area-inset-bottom))
      );
      overflow: auto;
      transform: none;
    }
  }
`;
