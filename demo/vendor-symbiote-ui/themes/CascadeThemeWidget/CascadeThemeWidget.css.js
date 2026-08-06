import { css } from '@symbiotejs/symbiote';
import { themedScrollFadeBlockStyles } from '../scroll-fade-styles.js';

export default css`
  cascade-theme-widget {
    position: relative;
    display: inline-flex;
    align-items: center;
    color: var(--sn-sys-on-surface);
    font-family: var(--sn-font);
  }

  cascade-theme-widget[hidden] {
    display: none !important;
  }

  cascade-theme-widget .ctw-trigger {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: var(--sn-shell-menu-action-inner-gap, 6px);
    flex: 0 0 auto;
    min-height: var(--sn-shell-menu-action-height, 26px);
    padding: var(--sn-shell-menu-action-padding, 4px 10px);
    border: 1px solid transparent;
    border-radius: var(--sn-layout-header-button-radius, 4px);
    background: transparent;
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

  cascade-theme-widget .ctw-trigger:hover,
  cascade-theme-widget .ctw-trigger[active] {
    border-color: var(--sn-sys-outline);
    background: color-mix(in oklch, var(--sn-sys-accent) var(--sn-sys-state-hover-mix), transparent);
    color: var(--sn-sys-on-surface);
  }

  cascade-theme-widget .ctw-trigger .material-symbols-outlined,
  cascade-theme-widget .ctw-header-actions .material-symbols-outlined,
  .ctw-popover[data-overlay-portal] .ctw-header-actions .material-symbols-outlined {
    font-size: var(--sn-shell-menu-action-icon-size, var(--sn-layout-header-icon-size, 16px));
  }

  cascade-theme-widget .ctw-popover,
  .ctw-popover[data-overlay-portal] {
    --sn-overlay-z-tier: global;
    --sn-overlay-z-base: var(--sn-ctw-z, 20000);
    z-index: var(--sn-ctw-z, var(--sn-overlay-z-base, 20000));
    display: grid;
    grid-auto-rows: auto;
    gap: var(--sn-ctw-gap, calc(var(--sn-step-4, 8px) * var(--sn-theme-density, 1)));
    width: min(92vw, var(--sn-ctw-width, 320px));
    max-width: calc(100vw - 16px);
    padding: var(--sn-ctw-padding, calc(var(--sn-step-5, 10px) * var(--sn-theme-density, 1)));
    border: var(--sn-node-border-width, 1px) solid var(--sn-sys-outline);
    border-radius: var(--sn-node-radius, 8px);
    background: var(--sn-sys-surface-panel);
    box-shadow: var(--sn-panel-shadow, 0 16px 48px var(--sn-shadow-color, hsl(0 0% 0% / 0.28)));
    color: var(--sn-sys-on-surface);
    font-family: var(--sn-font);
  }

  cascade-theme-widget .ctw-popover {
    position: absolute;
    top: calc(100% + var(--sn-ctw-offset, 8px));
    right: 0;
  }

  .ctw-popover[data-overlay-portal] {
    position: fixed;
    top: 0;
    left: 0;
    right: auto;
  }

  cascade-theme-widget .ctw-popover[hidden],
  .ctw-popover[data-overlay-portal][hidden] {
    display: none;
  }

  cascade-theme-widget .ctw-header,
  cascade-theme-widget .ctw-header-actions,
  cascade-theme-widget .ctw-control,
  cascade-theme-widget .ctw-control-head,
  cascade-theme-widget .ctw-mode,
  .ctw-popover[data-overlay-portal] .ctw-header,
  .ctw-popover[data-overlay-portal] .ctw-header-actions,
  .ctw-popover[data-overlay-portal] .ctw-control,
  .ctw-popover[data-overlay-portal] .ctw-control-head,
  .ctw-popover[data-overlay-portal] .ctw-mode {
    display: flex;
    align-items: center;
    min-width: 0;
  }

  cascade-theme-widget .ctw-header,
  .ctw-popover[data-overlay-portal] .ctw-header {
    justify-content: space-between;
    gap: var(--sn-ctw-gap, 8px);
  }

  cascade-theme-widget .ctw-header strong,
  .ctw-popover[data-overlay-portal] .ctw-header strong {
    min-width: 0;
    overflow: hidden;
    font-size: var(--sn-ctw-title-size, var(--sn-app-title-size, 13px));
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  cascade-theme-widget .ctw-header-actions,
  .ctw-popover[data-overlay-portal] .ctw-header-actions {
    gap: var(--sn-ctw-action-gap, 4px);
  }

  cascade-theme-widget .ctw-header-actions button,
  cascade-theme-widget .ctw-mode button,
  cascade-theme-widget .ctw-target,
  .ctw-popover[data-overlay-portal] .ctw-header-actions button,
  .ctw-popover[data-overlay-portal] .ctw-mode button,
  .ctw-popover[data-overlay-portal] .ctw-target {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: 1px solid var(--sn-button-border, var(--sn-sys-outline));
    border-radius: var(--sn-button-radius, 6px);
    background: var(--sn-button-bg, var(--sn-sys-surface-raised));
    color: var(--sn-button-color, var(--sn-sys-on-surface));
    font: inherit;
    cursor: pointer;
  }

  cascade-theme-widget .ctw-header-actions button,
  .ctw-popover[data-overlay-portal] .ctw-header-actions button {
    width: var(--sn-ctw-icon-button-size, var(--sn-theme-editor-icon-button-size, 28px));
    min-width: var(--sn-ctw-icon-button-size, var(--sn-theme-editor-icon-button-size, 28px));
    height: var(--sn-ctw-icon-button-size, var(--sn-theme-editor-icon-button-size, 28px));
    padding: 0;
  }

  cascade-theme-widget .ctw-mode,
  .ctw-popover[data-overlay-portal] .ctw-mode {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--sn-ctw-mode-gap, 4px);
    padding: var(--sn-ctw-mode-padding, 3px);
    border: 1px solid var(--sn-sys-outline);
    border-radius: var(--sn-node-radius, 8px);
    background: var(--sn-sys-surface);
  }

  cascade-theme-widget .ctw-tab-shape,
  .ctw-popover[data-overlay-portal] .ctw-tab-shape {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  cascade-theme-widget .ctw-targets,
  .ctw-popover[data-overlay-portal] .ctw-targets {
    display: flex;
    align-items: center;
    gap: var(--sn-ctw-mode-gap, 4px);
    padding: var(--sn-ctw-mode-padding, 3px);
    border: 1px solid var(--sn-sys-outline);
    border-radius: var(--sn-node-radius, 8px);
    background: var(--sn-sys-surface);
  }

  cascade-theme-widget .ctw-targets[hidden],
  .ctw-popover[data-overlay-portal] .ctw-targets[hidden] {
    display: none;
  }

  cascade-theme-widget .ctw-target-list,
  .ctw-popover[data-overlay-portal] .ctw-target-list {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    flex: 1 1 auto;
    min-width: 0;
    gap: var(--sn-ctw-mode-gap, 4px);
  }

  cascade-theme-widget .ctw-mode button,
  cascade-theme-widget .ctw-target,
  .ctw-popover[data-overlay-portal] .ctw-mode button,
  .ctw-popover[data-overlay-portal] .ctw-target {
    min-width: 0;
    min-height: var(--sn-ctw-mode-height, var(--sn-button-min-height, 28px));
    padding: var(--sn-ctw-mode-button-padding, 5px 10px);
    color: var(--sn-sys-on-surface-dim);
    font-size: var(--sn-ctw-control-size, var(--sn-button-font-size, 12px));
  }

  cascade-theme-widget .ctw-target,
  .ctw-popover[data-overlay-portal] .ctw-target {
    gap: var(--sn-ctw-target-gap, var(--sn-button-gap, 6px));
    flex: 1 1 auto;
  }

  cascade-theme-widget .ctw-target .material-symbols-outlined,
  .ctw-popover[data-overlay-portal] .ctw-target .material-symbols-outlined {
    font-size: var(--sn-button-icon-font-size, 16px);
  }

  cascade-theme-widget .ctw-target-label,
  .ctw-popover[data-overlay-portal] .ctw-target-label {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  cascade-theme-widget .ctw-mode button[aria-pressed="true"],
  cascade-theme-widget .ctw-target[aria-pressed="true"],
  .ctw-popover[data-overlay-portal] .ctw-mode button[aria-pressed="true"],
  .ctw-popover[data-overlay-portal] .ctw-target[aria-pressed="true"] {
    border-color: var(--sn-button-primary-border, var(--sn-sys-accent));
    /* full-strength primary-pressed fill */
    background: var(--sn-button-primary-bg, color-mix(in oklch, var(--sn-sys-accent) 100%, transparent));
    color: var(--sn-button-primary-color, var(--sn-sys-surface));
  }

  cascade-theme-widget .ctw-controls,
  .ctw-popover[data-overlay-portal] .ctw-controls {
    display: grid;
    gap: var(--sn-ctw-control-gap, 7px);
    min-width: 0;
  }

  cascade-theme-widget .ctw-control,
  .ctw-popover[data-overlay-portal] .ctw-control {
    display: grid;
    grid-template-columns: minmax(82px, 0.52fr) minmax(96px, 1fr) minmax(34px, auto);
    gap: var(--sn-ctw-control-gap, 7px);
    color: var(--sn-sys-on-surface-dim);
    font-size: var(--sn-ctw-control-size, var(--sn-theme-editor-control-size, 12px));
  }

  cascade-theme-widget .ctw-control-head,
  .ctw-popover[data-overlay-portal] .ctw-control-head {
    gap: var(--sn-ctw-control-gap, 7px);
  }

  cascade-theme-widget .ctw-control-icon,
  .ctw-popover[data-overlay-portal] .ctw-control-icon {
    width: var(--sn-ctw-control-icon-box, calc(18px * var(--sn-theme-density, 1)));
    color: var(--sn-sys-accent);
    font-size: var(--sn-ctw-control-icon-size, var(--sn-layout-header-icon-size, 16px));
    line-height: 1;
    text-align: center;
  }

  cascade-theme-widget .ctw-control label,
  .ctw-popover[data-overlay-portal] .ctw-control label {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  cascade-theme-widget .ctw-control input,
  .ctw-popover[data-overlay-portal] .ctw-control input {
    width: 100%;
    min-width: 0;
    height: var(--sn-ctw-range-hit-size, 34px);
    accent-color: var(--sn-sys-accent);
  }

  cascade-theme-widget .ctw-control output,
  .ctw-popover[data-overlay-portal] .ctw-control output {
    color: var(--sn-sys-on-surface);
    font-variant-numeric: tabular-nums;
    text-align: right;
  }

  cascade-theme-widget .ctw-header-actions button:hover,
  cascade-theme-widget .ctw-mode button:hover,
  cascade-theme-widget .ctw-target:hover,
  .ctw-popover[data-overlay-portal] .ctw-header-actions button:hover,
  .ctw-popover[data-overlay-portal] .ctw-mode button:hover,
  .ctw-popover[data-overlay-portal] .ctw-target:hover {
    background: var(--sn-button-hover-bg, color-mix(in oklch, var(--sn-sys-accent) var(--sn-sys-state-hover-mix), var(--sn-sys-surface-raised)));
  }

  cascade-theme-widget .ctw-header-actions button:focus-visible,
  cascade-theme-widget .ctw-mode button:focus-visible,
  cascade-theme-widget .ctw-target:focus-visible,
  cascade-theme-widget .ctw-control input:focus-visible,
  cascade-theme-widget .ctw-trigger:focus-visible,
  .ctw-popover[data-overlay-portal] .ctw-header-actions button:focus-visible,
  .ctw-popover[data-overlay-portal] .ctw-mode button:focus-visible,
  .ctw-popover[data-overlay-portal] .ctw-target:focus-visible,
  .ctw-popover[data-overlay-portal] .ctw-control input:focus-visible {
    outline: var(--sn-effect-focus-ring, 2px solid var(--sn-sys-focus-ring));
    outline-offset: 2px;
  }

  @media (max-width: 820px) {
    cascade-theme-widget .ctw-trigger-label {
      display: none;
    }

    cascade-theme-widget .ctw-popover,
    .ctw-popover[data-overlay-portal] {
      position: fixed;
      top: var(--sn-ctw-mobile-top, calc(env(safe-area-inset-top) + var(--sn-step-12, 88px)));
      right: max(var(--sn-ctw-mobile-inset, 8px), env(safe-area-inset-right));
      left: max(var(--sn-ctw-mobile-inset, 8px), env(safe-area-inset-left));
      width: auto;
      max-width: none;
      max-height: calc(
        100dvh - var(--sn-ctw-mobile-top, calc(env(safe-area-inset-top) + 88px)) -
          max(var(--sn-ctw-mobile-inset, 8px), env(safe-area-inset-bottom))
      );
      overflow: auto;
      ${themedScrollFadeBlockStyles}
      transform: none;
    }
  }
`;
