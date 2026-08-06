import { css } from '@symbiotejs/symbiote';
import { themedScrollFadeBlockStyles } from '../scroll-fade-styles.js';

export default css`
  cascade-theme-editor {
    display: block;
    min-width: 0;
    min-height: 100%;
    container: cascade-theme-editor / inline-size;
    color: var(--sn-sys-on-surface);
    font-family: var(--sn-font);
    /* the editor is a control surface, not a live preview of its target — pin its own
       type + density scale to the baseline so it stays legible and unbroken even when it
       edits (or sits inside) a scope cranked to extreme type/density. The geometry-register
       and slider previews still apply to the target element, not here. */
    --sn-theme-type-scale: 1;
    --sn-theme-heading-scale: 1;
    --sn-theme-density: 1;
    --sn-theme-spacing-scale: 1;

    &[hidden] {
      display: none !important;
    }

    /* scroll as one panel: the editor grows to its natural height and the host
       panel's own scroll area moves the whole thing, instead of a separate inner
       scrollbar on the controls list. */
    .cte-shell {
      display: flex;
      flex-direction: column;
      gap: var(--sn-theme-editor-gap, var(--sn-lab-panel-gap, 12px));
      min-height: 100%;
      padding: var(--sn-theme-editor-padding, var(--sn-lab-panel-padding, 12px));
      border: 0;
      background: var(--sn-sys-surface-panel);
      color: var(--sn-sys-on-surface);
    }

    .cte-header,
    .cte-title,
    .cte-actions,
    .cte-mode,
    .cte-control,
    .cte-control-head,
    .cte-details summary {
      display: flex;
      align-items: center;
      min-width: 0;
    }

    .cte-header {
      justify-content: space-between;
      gap: var(--sn-theme-editor-header-gap, var(--sn-lab-row-gap, 8px));
    }

    .cte-title {
      flex: 1 1 auto;
      flex-wrap: nowrap;
      gap: var(--sn-theme-editor-title-gap, var(--sn-lab-control-gap, 8px));
      min-width: 0;
      font-size: var(--sn-theme-editor-title-size, var(--sn-lab-title-size, 14px));
      line-height: 1.2;
    }

    .cte-title strong {
      flex: 1 1 auto;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .cte-title .material-symbols-outlined {
      color: var(--sn-sys-accent);
      font-size: var(--sn-theme-editor-title-icon-size, var(--sn-layout-header-icon-size, 16px));
    }

    .cte-status {
      flex: 0 0 auto;
      padding: var(--sn-theme-editor-status-padding, var(--sn-badge-padding, 2px 8px));
      border: 1px solid var(--sn-badge-border, var(--sn-sys-outline));
      border-radius: var(--sn-badge-radius, 999px);
      background: var(--sn-badge-bg, var(--sn-sys-surface-raised));
      color: var(--sn-badge-color, var(--sn-sys-on-surface-dim));
      font-size: var(--sn-theme-editor-status-size, var(--sn-badge-font-size, 12px));
      font-variant-numeric: tabular-nums;
      white-space: nowrap;
    }

    .cte-actions {
      gap: var(--sn-theme-editor-action-gap, var(--sn-button-gap, 6px));
      flex: 0 0 auto;
    }

    .cte-icon-button,
    .cte-mode button {
      box-sizing: border-box;
      border: 1px solid var(--sn-button-border, var(--sn-sys-outline));
      border-radius: var(--sn-button-radius, 6px);
      background: var(--sn-button-bg, var(--sn-sys-surface-raised));
      color: var(--sn-button-color, var(--sn-sys-on-surface));
      font: inherit;
      cursor: pointer;
      transition: var(--sn-effect-hover-transition);
    }

    .cte-icon-button:hover,
    .cte-mode button:hover {
      background: var(--sn-button-hover-bg, color-mix(in oklch, var(--sn-sys-accent) var(--sn-sys-state-hover-mix), var(--sn-sys-surface-raised)));
    }

    .cte-icon-button:focus-visible,
    .cte-mode button:focus-visible,
    .cte-control input:focus-visible,
    .cte-details summary:focus-visible {
      outline: var(--sn-effect-focus-ring, 2px solid var(--sn-sys-focus-ring));
      outline-offset: var(--sn-sys-focus-ring-offset);
    }

    .cte-icon-button {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: var(--sn-theme-editor-icon-button-size, var(--sn-button-icon-size, 28px));
      min-width: var(--sn-theme-editor-icon-button-size, var(--sn-button-icon-size, 28px));
      height: var(--sn-theme-editor-icon-button-size, var(--sn-button-icon-size, 28px));
      padding: 0;
    }

    .cte-icon-button .material-symbols-outlined {
      font-size: var(--sn-button-icon-font-size, 16px);
    }

    .cte-mode {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: var(--sn-theme-editor-mode-gap, var(--sn-lab-segment-gap, 6px));
      padding: var(--sn-theme-editor-mode-padding, var(--sn-lab-segment-padding, 3px));
      border: 1px solid var(--sn-sys-outline);
      border-radius: var(--sn-node-radius, 8px);
      background: var(--sn-sys-surface);
    }

    .cte-tab-shape {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }

    .cte-mode button {
      display: block;
      text-align: center;
      min-width: 0;
      min-height: var(--sn-theme-editor-mode-height, var(--sn-button-min-height, 30px));
      padding: var(--sn-theme-editor-mode-button-padding, var(--sn-button-padding, 6px 14px));
      color: var(--sn-sys-on-surface-dim);
      font-size: var(--sn-theme-editor-control-size, var(--sn-button-font-size, 12px));
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .cte-mode button[aria-pressed="true"] {
      border-color: var(--sn-button-primary-border, var(--sn-sys-accent));
      /* full-strength primary-pressed fill */
      background: var(--sn-button-primary-bg, color-mix(in oklch, var(--sn-sys-accent) 100%, transparent));
      color: var(--sn-button-primary-color, var(--sn-sys-surface));
    }

    .cte-targets {
      position: sticky;
      top: var(--sn-theme-editor-sticky-top, 0);
      z-index: var(--sn-theme-editor-sticky-z, 4);
      display: flex;
      align-items: center;
      gap: var(--sn-theme-editor-mode-gap, var(--sn-lab-segment-gap, 6px));
      padding: var(--sn-theme-editor-mode-padding, var(--sn-lab-segment-padding, 3px));
      border: 1px solid var(--sn-sys-outline);
      border-radius: var(--sn-node-radius, 8px);
      background: var(--sn-sys-surface);
      box-shadow: var(--sn-theme-editor-sticky-shadow, 0 1px 0 color-mix(in oklch, var(--sn-sys-outline) 55%, transparent));
    }

    .cte-targets[hidden] {
      display: none;
    }

    .cte-mode[hidden] {
      display: none;
    }

    .cte-register {
      grid-template-columns: repeat(4, minmax(0, 1fr));
    }

    .cte-target-list {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      flex: 1 1 auto;
      min-width: 0;
      gap: var(--sn-theme-editor-mode-gap, var(--sn-lab-segment-gap, 6px));
    }

    .cte-target-item {
      display: inline-flex;
      align-items: stretch;
      flex: 1 1 auto;
      min-width: 0;
      gap: var(--sn-theme-editor-target-item-gap, 3px);
    }

    .cte-pick,
    .cte-apply-all,
    .cte-target-remove {
      box-sizing: border-box;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      flex: 0 0 auto;
      align-self: flex-start;
      width: var(--sn-theme-editor-icon-button-size, var(--sn-button-icon-size, 28px));
      height: var(--sn-theme-editor-icon-button-size, var(--sn-button-icon-size, 28px));
      padding: 0;
      border: 1px solid var(--sn-button-border, var(--sn-sys-outline));
      border-radius: var(--sn-button-radius, 6px);
      background: var(--sn-button-bg, var(--sn-sys-surface-raised));
      color: var(--sn-sys-on-surface-dim);
      cursor: pointer;
      transition: var(--sn-effect-hover-transition);
    }

    .cte-pick[hidden],
    .cte-apply-all[hidden],
    .cte-target-remove[hidden] {
      display: none;
    }

    .cte-pick .material-symbols-outlined,
    .cte-apply-all .material-symbols-outlined,
    .cte-target-remove .material-symbols-outlined {
      font-size: var(--sn-button-icon-font-size, 16px);
    }

    .cte-pick:hover,
    .cte-apply-all:hover,
    .cte-target-remove:hover {
      background: var(--sn-button-hover-bg, color-mix(in oklch, var(--sn-sys-accent) var(--sn-sys-state-hover-mix), var(--sn-sys-surface-raised)));
      color: var(--sn-sys-on-surface);
    }

    .cte-pick:focus-visible,
    .cte-apply-all:focus-visible,
    .cte-target-remove:focus-visible {
      outline: var(--sn-effect-focus-ring, 2px solid var(--sn-sys-focus-ring));
      outline-offset: var(--sn-sys-focus-ring-offset);
    }

    .cte-pick[aria-pressed="true"] {
      border-color: var(--sn-button-primary-border, var(--sn-sys-accent));
      /* full-strength primary-pressed fill */
      background: var(--sn-button-primary-bg, color-mix(in oklch, var(--sn-sys-accent) 100%, transparent));
      color: var(--sn-button-primary-color, var(--sn-sys-surface));
    }

    .cte-target {
      box-sizing: border-box;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: var(--sn-theme-editor-target-gap, var(--sn-button-gap, 6px));
      flex: 1 1 auto;
      min-width: 0;
      min-height: var(--sn-theme-editor-mode-height, var(--sn-button-min-height, 30px));
      padding: var(--sn-theme-editor-mode-button-padding, var(--sn-button-padding, 6px 12px));
      border: 1px solid var(--sn-button-border, var(--sn-sys-outline));
      border-radius: var(--sn-button-radius, 6px);
      background: var(--sn-button-bg, var(--sn-sys-surface-raised));
      color: var(--sn-sys-on-surface-dim);
      font: inherit;
      font-size: var(--sn-theme-editor-control-size, var(--sn-button-font-size, 12px));
      cursor: pointer;
      transition: var(--sn-effect-hover-transition);
    }

    .cte-target .material-symbols-outlined {
      font-size: var(--sn-button-icon-font-size, 16px);
    }

    .cte-target:hover {
      background: var(--sn-button-hover-bg, color-mix(in oklch, var(--sn-sys-accent) var(--sn-sys-state-hover-mix), var(--sn-sys-surface-raised)));
    }

    .cte-target:focus-visible {
      outline: var(--sn-effect-focus-ring, 2px solid var(--sn-sys-focus-ring));
      outline-offset: var(--sn-sys-focus-ring-offset);
    }

    .cte-target[aria-pressed="true"] {
      border-color: var(--sn-button-primary-border, var(--sn-sys-accent));
      /* full-strength primary-pressed fill */
      background: var(--sn-button-primary-bg, color-mix(in oklch, var(--sn-sys-accent) 100%, transparent));
      color: var(--sn-button-primary-color, var(--sn-sys-surface));
    }

    .cte-target-label {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .cte-controls {
      display: grid;
      align-content: start;
      flex: 0 0 auto;
      gap: var(--sn-theme-editor-control-gap, var(--sn-lab-control-gap, 8px));
    }

    .cte-control {
      display: grid;
      grid-template-columns: minmax(92px, 0.65fr) minmax(96px, 1fr) minmax(38px, auto);
      gap: var(--sn-theme-editor-control-gap, var(--sn-lab-control-gap, 8px));
      min-width: 0;
      color: var(--sn-sys-on-surface-dim);
      font-size: var(--sn-theme-editor-control-size, var(--sn-lab-control-font-size, 12px));
    }

    .cte-control-head {
      gap: var(--sn-theme-editor-control-gap, var(--sn-lab-control-gap, 8px));
      min-width: 0;
    }

    .cte-control-icon {
      flex: 0 0 auto;
      width: var(--sn-theme-editor-control-icon-box, calc(18px * var(--sn-theme-density, 1)));
      color: var(--sn-sys-accent);
      font-size: var(--sn-theme-editor-control-icon-size, var(--sn-layout-header-icon-size, 16px));
      line-height: 1;
      text-align: center;
    }

    .cte-control label {
      min-width: 0;
      overflow: hidden;
      color: var(--sn-field-label-color, var(--sn-sys-on-surface-dim));
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .cte-control input {
      width: 100%;
      min-width: 0;
      height: var(--sn-theme-editor-range-hit-size, var(--sn-socket-hit-size, 44px));
      accent-color: var(--sn-sys-accent);
    }

    .cte-control input[type="range"] {
      --cte-range-progress: 0%;
      --cte-range-track-height: var(--sn-theme-editor-range-track-height, calc(4px * var(--sn-theme-density, 1)));
      --cte-range-thumb-size: var(--sn-theme-editor-range-thumb-size, calc(14px * var(--sn-theme-density, 1)));
      --cte-range-border-width: calc(1px * var(--sn-theme-outline-strength, 0));
      appearance: none;
      background: transparent;
      cursor: pointer;
    }

    .cte-control input[type="range"]::-webkit-slider-runnable-track {
      height: var(--cte-range-track-height);
      border: var(--cte-range-border-width) solid var(--sn-sys-outline);
      border-radius: var(--sn-scrollbar-radius, 999px);
      background:
        linear-gradient(
          to right,
          var(--sn-sys-accent) 0 var(--cte-range-progress),
          color-mix(in oklab, var(--sn-sys-on-surface) 22%, transparent) var(--cte-range-progress) 100%
        );
    }

    .cte-control input[type="range"]::-webkit-slider-thumb {
      appearance: none;
      width: var(--cte-range-thumb-size);
      height: var(--cte-range-thumb-size);
      margin-top: calc((var(--cte-range-track-height) - var(--cte-range-thumb-size)) / 2 - var(--cte-range-border-width));
      border: var(--cte-range-border-width) solid var(--sn-sys-outline);
      border-radius: 50%;
      background: var(--sn-sys-accent);
      box-shadow: none;
    }

    .cte-control input[type="range"]:disabled {
      cursor: not-allowed;
      opacity: var(--sn-button-disabled-opacity, 0.6);
    }

    .cte-control output {
      color: var(--sn-sys-on-surface);
      font-variant-numeric: tabular-nums;
      text-align: right;
    }

    .cte-details {
      min-width: 0;
      border: 1px solid var(--sn-card-border, var(--sn-sys-outline));
      border-radius: var(--sn-card-radius, var(--sn-node-radius, 8px));
      background: var(--sn-card-bg, var(--sn-sys-surface-raised));
      overflow: hidden;
    }

    .cte-details summary {
      gap: var(--sn-theme-editor-control-gap, var(--sn-lab-control-gap, 8px));
      padding: var(--sn-theme-editor-summary-padding, var(--sn-button-padding, 6px 14px));
      color: var(--sn-sys-on-surface-dim);
      cursor: pointer;
      font-size: var(--sn-theme-editor-control-size, var(--sn-button-font-size, 12px));
      user-select: none;
    }

    .cte-details summary .material-symbols-outlined {
      font-size: var(--sn-theme-editor-summary-icon-size, var(--sn-button-icon-font-size, 16px));
    }

    .cte-params {
      max-height: var(--sn-theme-editor-params-max-height, 180px);
      margin: 0;
      padding: var(--sn-theme-editor-params-padding, var(--sn-lab-token-padding, 10px));
      border-top: 1px solid var(--sn-card-border, var(--sn-sys-outline));
      background: var(--sn-source-bg, var(--sn-sys-surface));
      color: var(--sn-source-editor-color, var(--sn-sys-on-surface));
      font-family: var(--sn-mono-font, ui-monospace, SFMono-Regular, Menlo, Consolas, monospace);
      font-size: var(--sn-theme-editor-params-size, var(--sn-lab-token-value-size, 11px));
      overflow: auto;
      ${themedScrollFadeBlockStyles}
      white-space: pre-wrap;
      word-break: break-word;
    }

    .cte-controls::-webkit-scrollbar,
    .cte-params::-webkit-scrollbar {
      width: var(--sn-scrollbar-size, 10px);
      height: var(--sn-scrollbar-size, 10px);
    }

    .cte-controls::-webkit-scrollbar-track,
    .cte-params::-webkit-scrollbar-track {
      background: var(--sn-scrollbar-track, transparent);
    }

    .cte-controls::-webkit-scrollbar-thumb,
    .cte-params::-webkit-scrollbar-thumb {
      min-height: var(--sn-scrollbar-thumb-min-size, 36px);
      border: var(--sn-scrollbar-thumb-border, 3px solid transparent);
      border-radius: var(--sn-scrollbar-radius, 999px);
      background: var(--sn-scrollbar-thumb);
      background-clip: content-box;
    }

    .cte-controls::-webkit-scrollbar-thumb:hover,
    .cte-params::-webkit-scrollbar-thumb:hover {
      background: var(--sn-scrollbar-thumb-hover, color-mix(in oklch, var(--sn-sys-accent) var(--sn-sys-state-hover-mix), var(--sn-scrollbar-thumb, transparent)));
      background-clip: content-box;
    }

    @container cascade-theme-editor (max-width: 360px) {
      .cte-header {
        gap: var(--sn-theme-editor-header-compact-gap, 6px);
      }

      .cte-status {
        display: none;
      }

      .cte-control {
        grid-template-columns: minmax(0, 1fr) minmax(92px, 1fr) minmax(28px, auto);
      }
    }
  }

  html[data-cascade-theme-picking],
  html[data-cascade-theme-picking] * {
    cursor: crosshair !important;
  }

  [data-cascade-theme-pick-hover] {
    outline: var(--sn-effect-focus-ring, 2px solid var(--sn-sys-focus-ring));
    outline-offset: calc(-1 * var(--sn-sys-focus-ring-offset));
  }
`;
