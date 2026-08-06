import { css } from '@symbiotejs/symbiote';
import {
  themedScrollFadeBlockStyles,
} from '../../themes/scroll-fade-styles.js';
import { themedScrollbarStyles } from '../../themes/scrollbar-styles.js';

export let styles = css`
  layout-node {
    display: flex;
    flex: 1;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
    position: relative;

    /* Panel mode */
    &[node-type='panel'] {
      flex-direction: column;
      background: var(--sn-sys-surface-raised);
      border: 1px solid var(--sn-layout-border);
      border-radius: var(--sn-frame-radius, 0);
    }

    /* A collapsed rail that sits flush against a layout boundary flattens only that
       edge's two joints; a rail between panels keeps every joint at the frame radius. */
    &[collapse-flat-edge='bottom'] {
      border-bottom-left-radius: 0;
      border-bottom-right-radius: 0;
    }
    &[collapse-flat-edge='top'] {
      border-top-left-radius: 0;
      border-top-right-radius: 0;
    }
    &[collapse-flat-edge='right'] {
      border-top-right-radius: 0;
      border-bottom-right-radius: 0;
    }
    &[collapse-flat-edge='left'] {
      border-top-left-radius: 0;
      border-bottom-left-radius: 0;
    }

    .panel-view {
      display: flex;
      flex-direction: column;
      width: 100%;
      height: 100%;
      position: relative;
      container-type: inline-size;
      container-name: layout-panel;
    }

    .panel-header {
      box-sizing: border-box;
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
      align-items: center;
      gap: var(--sn-layout-header-gap, 2px);
      padding: var(--sn-layout-header-padding, 2px 4px);
      background: var(--sn-node-header-bg);
      border-bottom: 1px solid var(--sn-layout-border);
      flex-shrink: 0;
      block-size: var(--sn-layout-header-block-size, calc(var(--sn-layout-header-min-height, 28px) + 3px));
      min-block-size: var(--sn-layout-header-block-size, calc(var(--sn-layout-header-min-height, 28px) + 3px));
      position: relative;
      overflow: hidden;
    }

    &[panel-chrome='none'] {
      .panel-header {
        display: none !important;
      }
    }

    .header-btn {
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

      &[hidden] {
        display: none;
      }

      &:hover {
        background: color-mix(in oklch, var(--sn-sys-accent) var(--sn-sys-state-hover-mix), transparent);
        color: var(--sn-sys-on-surface);
      }

      .material-symbols-outlined {
        font-size: var(--sn-layout-header-icon-size, 16px);
      }
    }

    .type-btn {
      grid-column: 1;
      justify-self: start;
      justify-content: flex-start;
      max-inline-size: 100%;
      min-inline-size: 0;
      overflow: hidden;

      .panel-icon,
      .dropdown-arrow {
        flex: 0 0 auto;
      }

      .dropdown-arrow {
        font-size: var(--sn-layout-header-dropdown-size, 18px);
        margin-left: var(--sn-step-0, -2px);
        opacity: 0.6;
      }
    }

    .header-spacer {
      display: none;
    }

    .panel-menu-toggle {
      grid-column: 2;
      justify-self: center;
      position: static;
      transform: none;

      &[active] {
        background: color-mix(in oklch, var(--sn-sys-accent) var(--sn-sys-state-selected-mix), transparent);
        color: var(--sn-sys-on-surface);
      }

      .material-symbols-outlined + .material-symbols-outlined {
        margin-left: calc(var(--sn-layout-header-gap, 2px) * -1);
        opacity: 0.68;
      }
    }

    .panel-actions {
      grid-column: 3;
      display: flex;
      align-items: center;
      justify-content: flex-end;
      gap: var(--sn-layout-header-gap, 2px);
      min-width: 0;
      overflow: hidden;
    }

    .panel-title {
      font-weight: 500;
      font-size: var(--sn-layout-header-title-size, var(--sn-layout-header-button-size, 0.75rem));
      line-height: var(--sn-layout-header-title-line-height, 1.2);
      min-inline-size: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    @container layout-panel (max-width: 360px) {
      .panel-title {
        display: none;
      }
    }

    @container layout-panel (max-width: 260px) {
      .dropdown-arrow {
        display: none;
      }
    }

    @container layout-panel (max-width: 220px) {
      .fullscreen-btn {
        display: none;
      }
    }

    .panel-menu-drawer {
      flex: 0 0 auto;
      min-height: var(--sn-layout-menu-min-height, var(--sn-layout-header-min-height, 28px));
      padding: 0;
      border-bottom: 1px solid var(--sn-layout-border);
      background: color-mix(in oklab, var(--sn-node-header-bg) 88%, var(--sn-sys-surface) 12%);
      overflow: hidden;
      ${themedScrollbarStyles}
    }

    .panel-menu-drawer[hidden] {
      display: none;
    }

    .panel-menu-rows {
      display: flex;
      flex-direction: column;
      gap: var(--sn-layout-menu-section-gap, 4px);
      min-width: 0;
      padding: var(--sn-layout-menu-section-padding, 4px);
    }

    .panel-menu-row {
      --sn-layout-menu-row-span: 1;
      display: grid;
      grid-template-columns: minmax(0, 1fr);
      align-items: stretch;
      box-sizing: border-box;
      min-block-size: calc(var(--sn-layout-menu-row-height, var(--sn-layout-header-block-size, calc(var(--sn-layout-header-min-height, 28px) + 3px))) * var(--sn-layout-menu-row-span));
      border: 1px solid color-mix(in oklab, var(--sn-layout-border) 62%, transparent);
      border-radius: var(--sn-layout-menu-section-radius, var(--sn-layout-header-button-radius, 4px));
      background: color-mix(in oklab, var(--sn-sys-surface-raised) 74%, transparent);
      overflow: hidden;
    }

    .panel-menu-row-label {
      display: flex;
      align-items: center;
      min-width: 0;
      min-block-size: var(--sn-layout-menu-section-label-height, calc(var(--sn-layout-header-min-height, 28px) * 0.72));
      padding: var(--sn-layout-menu-label-padding, 3px 8px);
      border-block-end: 1px solid color-mix(in oklab, var(--sn-layout-border) 58%, transparent);
      background: color-mix(in oklab, var(--sn-node-header-bg) 76%, var(--sn-sys-surface) 24%);
      color: var(--sn-sys-on-surface-dim);
      font-size: var(--sn-layout-menu-label-size, calc(var(--sn-layout-header-button-size, 0.75rem) * 0.92));
      font-weight: 600;
      letter-spacing: 0.045em;
      text-transform: uppercase;
      white-space: nowrap;
      opacity: 0.86;
    }

    .panel-menu-actions {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: var(--sn-layout-menu-gap, var(--sn-layout-header-button-gap, 4px));
      box-sizing: border-box;
      min-block-size: var(--sn-layout-menu-row-height, var(--sn-layout-header-block-size, calc(var(--sn-layout-header-min-height, 28px) + 3px)));
      min-width: min-content;
      padding: var(--sn-layout-menu-row-padding, 4px);
      overflow: hidden;
      ${themedScrollbarStyles}
    }

    .panel-menu-action {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: var(--sn-layout-menu-action-gap, var(--sn-layout-header-button-gap, 4px));
      box-sizing: border-box;
      min-height: var(--sn-layout-menu-action-height, calc(var(--sn-layout-header-min-height, 28px) - 4px));
      padding: var(--sn-layout-menu-action-padding, var(--sn-layout-header-button-padding, 4px 6px));
      border: 1px solid transparent;
      border-radius: var(--sn-layout-header-button-radius, 4px);
      background: transparent;
      color: var(--sn-sys-on-surface-dim);
      font: inherit;
      font-size: var(--sn-layout-menu-action-size, var(--sn-layout-header-button-size, 0.75rem));
      white-space: nowrap;
      cursor: pointer;
      transition:
        background var(--sn-transition-fast) var(--sn-transition-easing),
        border-color var(--sn-transition-fast) var(--sn-transition-easing),
        color var(--sn-transition-fast) var(--sn-transition-easing);

      &:hover {
        background: color-mix(in oklch, var(--sn-sys-accent) var(--sn-sys-state-hover-mix), transparent);
        color: var(--sn-sys-on-surface);
      }

      &[active] {
        border-color: var(--sn-sys-accent);
        background: color-mix(in oklch, var(--sn-sys-accent) var(--sn-sys-state-selected-mix), transparent);
        color: var(--sn-sys-on-surface);
      }

      &[disabled] {
        opacity: var(--sn-button-disabled-opacity, 0.45);
        cursor: not-allowed;
      }

      .material-symbols-outlined {
        font-size: var(--sn-layout-menu-icon-size, var(--sn-layout-header-icon-size, 16px));
      }
    }

    .panel-menu-action-label {
      min-inline-size: 0;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    @container layout-panel (max-width: 360px) {
      .panel-menu-action {
        inline-size: var(--sn-layout-menu-action-icon-size, var(--sn-layout-header-button-min-inline-size, 24px));
        padding-inline: var(--sn-layout-menu-action-icon-padding-inline, 4px);
      }

      .panel-menu-action-label {
        display: none;
      }
    }

    @container layout-panel (max-width: 280px) {
      .panel-menu-row-label {
        min-block-size: var(--sn-layout-menu-section-label-compact-height, calc(var(--sn-layout-header-min-height, 28px) * 0.62));
        padding-block: var(--sn-layout-menu-label-compact-padding-block, 2px);
      }

      .panel-menu-actions {
        padding-block: var(--sn-layout-menu-row-compact-padding-block, 3px);
      }
    }

    .panel-content {
      box-sizing: border-box;
      flex: 1;
      min-inline-size: 0;
      min-block-size: 0;
      overflow: auto;
      position: relative;
      padding: var(--sn-frame-inset, 0);
      ${themedScrollFadeBlockStyles}
      ${themedScrollbarStyles}
    }

    .panel-content > sn-card {
      --sn-card-bg: var(--sn-layout-panel-card-bg, transparent);
      --sn-card-border: var(--sn-layout-panel-card-border, transparent);
      --sn-card-radius: var(--sn-layout-panel-card-radius, 0);
      box-sizing: border-box;
      inline-size: var(--sn-layout-panel-card-inline-size, 100%);
      min-block-size: var(--sn-layout-panel-card-min-block-size, 100%);
    }

    /* Collapsed state - vertical (bottom/top panels) */
    &[collapsed][collapse-dir='vertical'] {
      flex: 0 0 auto !important;
      /* fill the cross-axis: the split slot wrapper is a row, so flex-basis:auto would
         otherwise shrink the rail to its content width (a 2px sliver) */
      width: 100% !important;
      /* border-box so width:100% includes the border and the rail fits its slot
         exactly — otherwise the border overflow eats the inter-ear gap */
      box-sizing: border-box;
      height: var(--sn-layout-collapsed-vertical-size, 28px) !important;
      min-height: var(--sn-layout-collapsed-vertical-size, 28px) !important;
      max-height: var(--sn-layout-collapsed-vertical-size, 28px) !important;

      .panel-content,
      .panel-menu-drawer {
        display: none !important;
      }

      .panel-header {
        position: relative;
        display: flex;
      }

      /* Hide fullscreen button, dropdown, and spacer */
      .fullscreen-btn,
      .panel-menu-toggle,
      .dropdown-arrow,
      .panel-title,
      .header-spacer {
        display: none !important;
      }

      /* Panel icon at left */
      .type-btn {
        position: relative;
        z-index: 1;
        padding: var(--sn-layout-collapsed-type-padding, 4px 8px);
        background: none;
        cursor: default;
        pointer-events: none;

        .panel-icon {
          font-size: var(--sn-layout-collapsed-icon-size, 18px);
        }
      }

      .panel-actions {
        position: absolute;
        inset: 0;
        z-index: 0;
        display: block;
        inline-size: 100%;
        block-size: 100%;
      }

      /* Expand button centered */
      .collapse-btn {
        position: absolute;
        inset: 0;
        inline-size: 100%;
        block-size: 100%;
        min-block-size: 0;
        transform: none;
        align-items: center;
        justify-content: center;
        padding: var(--sn-layout-collapsed-button-padding, 4px);
      }
    }

    /* Collapsed state - horizontal (side panels) */
    &[collapsed][collapse-dir='horizontal'] {
      width: var(--sn-layout-collapsed-horizontal-size, 32px) !important;
      min-width: var(--sn-layout-collapsed-horizontal-size, 32px) !important;
      max-width: var(--sn-layout-collapsed-horizontal-size, 32px) !important;

      .panel-view {
        width: var(--sn-layout-collapsed-horizontal-size, 32px);
        display: flex;
        flex-direction: column;
        height: 100%;
      }

      .panel-content,
      .panel-menu-drawer {
        display: none !important;
      }

      .panel-header {
        display: flex;
        flex-direction: column;
        writing-mode: horizontal-tb;
        padding: 0;
        height: 100%;
        gap: 0;
        align-items: center;
        justify-content: flex-start;
        width: var(--sn-layout-collapsed-horizontal-size, 32px);
      }

      /* Hide fullscreen button, dropdown, and spacer */
      .fullscreen-btn,
      .panel-menu-toggle,
      .dropdown-arrow,
      .panel-title,
      .header-spacer {
        display: none !important;
      }

      /* Panel icon at top */
      .type-btn {
        order: 1;
        position: relative;
        z-index: 1;
        inline-size: 100%;
        block-size: var(--sn-layout-header-block-size, calc(var(--sn-layout-header-min-height, 28px) + 3px));
        min-block-size: var(--sn-layout-header-block-size, calc(var(--sn-layout-header-min-height, 28px) + 3px));
        justify-content: center;
        padding: var(--sn-layout-header-button-padding, 4px 6px);
        background: none;
        cursor: default;
        pointer-events: none;
        flex: 0 0 auto;

        .panel-icon {
          font-size: var(--sn-layout-header-icon-size, 16px);
        }
      }

      .panel-actions {
        order: 2;
        position: absolute;
        inset: 0;
        z-index: 0;
        display: block;
        align-items: center;
        justify-content: center;
        inline-size: 100%;
        block-size: 100%;
      }

      /* Expand button covers the collapsed rail so the action area remains full height. */
      .collapse-btn {
        padding: var(--sn-layout-collapsed-horizontal-button-padding, 8px 4px);
        flex: 0 0 auto;
        display: flex;
        inline-size: 100%;
        block-size: 100%;
        min-block-size: 0;
        align-items: center;
        justify-content: center;
      }
    }

    /* Fullscreen state */
    &[fullscreen] {
      position: fixed !important;
      inset:
        calc(var(--sn-layout-fullscreen-host-top, 0px) + var(--sn-fullscreen-tab-bar-height, 32px))
        var(--sn-layout-fullscreen-host-right, 0px)
        var(--sn-layout-fullscreen-host-bottom, 0px)
        var(--sn-layout-fullscreen-host-left, 0px) !important;
      flex: none !important;
      inline-size: auto !important;
      block-size: auto !important;
      width: auto !important;
      height: auto !important;
      max-inline-size: none !important;
      max-block-size: none !important;
      border-radius: 0 !important;
      z-index: var(--sn-fullscreen-panel-z, 30010) !important;
      box-shadow: 0 0 40px var(--sn-shadow-color);
    }

    /* Fullscreen: hide panel type selector and collapse btn */
    &[fullscreen] .type-btn,
    &[fullscreen] .collapse-btn {
      display: none !important;
    }

    /* Fullscreen: remove header bottom border */
    &[fullscreen] .panel-header {
      border-bottom: none !important;
    }

    /* Split mode */
    &[node-type='split'] {
      background: transparent;
      border: none;
    }

    .split-view {
      display: flex;
      width: 100%;
      height: 100%;
      gap: var(--sn-frame-gap, 0);

      &[direction='horizontal'] {
        flex-direction: row;
      }

      &[direction='vertical'] {
        flex-direction: column;
      }
    }

    /* Ears: two or more collapsed siblings share one rail band, laid out side by
       side as a row. The band keeps the themed gap between ears but never stretches
       past the collapsed rail size. */
    &[collapse-ears] > .split-view {
      flex-direction: row;
      align-items: stretch;
      /* the ear row hides its resizer, so add a matching gap between ears so the
         horizontal spacing equals the vertical resizer gap between stacked panels */
      gap: var(--sn-layout-resizer-thickness, 2px);

      > .split-resizer {
        display: none;
      }
    }

    &[collapse-ears='vertical'] > .split-view {
      height: var(--sn-layout-collapsed-vertical-size, 28px);
      min-height: var(--sn-layout-collapsed-vertical-size, 28px);
      max-height: var(--sn-layout-collapsed-vertical-size, 28px);
    }

    &[collapse-ears='horizontal'] > .split-view {
      width: var(--sn-layout-collapsed-horizontal-size, 32px);
      min-width: var(--sn-layout-collapsed-horizontal-size, 32px);
      max-width: var(--sn-layout-collapsed-horizontal-size, 32px);
    }

    .split-first,
    .split-second {
      display: flex;
      overflow: hidden;
      min-width: 0;
      min-height: 0;
    }

    /* Collapsed child handling */
    .split-first[collapsed-child] + .split-resizer + .split-second {
      flex: 1 1 auto !important;
      width: auto !important;
      height: auto !important;
    }

    .split-first:has(+ .split-resizer + .split-second[collapsed-child]) {
      flex: 1 1 auto !important;
      width: auto !important;
      height: auto !important;
    }

    .split-resizer {
      flex-shrink: 0;
      background: var(--sn-layout-gap-bg);
      transition: background var(--sn-transition-fast) var(--sn-transition-easing);
      z-index: 10;
    }

    .split-view[direction='horizontal'] > .split-resizer {
      width: var(--sn-layout-resizer-thickness, 2px);
      cursor: col-resize;
    }

    .split-view[direction='vertical'] > .split-resizer {
      height: var(--sn-layout-resizer-thickness, 2px);
      cursor: row-resize;
    }

    .split-resizer:hover {
      background: color-mix(in oklch, var(--sn-sys-accent) var(--sn-sys-state-hover-mix), var(--sn-layout-gap-bg));
    }

    &[resizing] .split-resizer {
      background: color-mix(in oklch, var(--sn-sys-accent) var(--sn-sys-state-dragged-mix), var(--sn-layout-gap-bg));
    }

    &[resizing] {
      user-select: none;
    }

    /* Hidden state */
    .panel-view[hidden],
    .split-view[hidden] {
      display: none;
    }
  }
`;
