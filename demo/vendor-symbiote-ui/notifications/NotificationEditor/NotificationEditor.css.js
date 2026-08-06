import { css } from '@symbiotejs/symbiote';
import { themedScrollFadeBlockStyles } from '../../themes/scroll-fade-styles.js';

export default css`
  notification-editor {
    display: block;
    width: 100%;
    height: 100%;
    min-width: 0;
    color: var(--sn-sys-on-surface);
    font-family: var(--sn-font);
  }

  notification-editor[hidden] {
    display: none !important;
  }

  notification-editor .ne-shell {
    display: flex;
    flex-direction: column;
    width: 100%;
    height: 100%;
    min-width: 0;
    box-sizing: border-box;
    background: var(--sn-sys-surface-panel);
  }

  notification-editor .ne-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--sn-notification-widget-gap, 8px);
    padding: var(--sn-notification-editor-header-padding, 12px 16px);
    border-bottom: 1px solid var(--sn-sys-outline);
  }

  notification-editor .ne-title {
    display: inline-flex;
    align-items: center;
    gap: var(--sn-notification-widget-gap, 8px);
    min-width: 0;
  }

  notification-editor .ne-title strong {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: var(--sn-notification-widget-title-size, var(--sn-app-title-size, 13px));
  }

  notification-editor .ne-title .material-symbols-outlined {
    flex: none;
    font-size: var(--sn-layout-header-icon-size, 16px);
    color: var(--sn-sys-on-surface-dim);
  }

  notification-editor .ne-icon-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: var(--sn-notification-widget-action-gap, 4px);
    border: 1px solid var(--sn-sys-outline);
    border-radius: var(--sn-button-radius, 6px);
    background: var(--sn-sys-surface-raised);
    color: var(--sn-sys-on-surface-dim);
    cursor: pointer;
  }

  notification-editor .ne-icon-button:hover {
    background: color-mix(in oklch, var(--sn-sys-accent) var(--sn-sys-state-hover-mix), var(--sn-sys-surface-raised));
    color: var(--sn-sys-on-surface);
  }

  notification-editor .ne-icon-button .material-symbols-outlined {
    font-size: var(--sn-layout-header-icon-size, 16px);
  }

  notification-editor .ne-body {
    flex: 1;
    min-width: 0;
    min-height: 0;
    overflow: auto;
    ${themedScrollFadeBlockStyles}
    display: grid;
    gap: var(--sn-notification-editor-section-gap, 14px);
    align-content: start;
    padding: var(--sn-notification-editor-body-padding, 14px 16px 20px);
  }

  notification-editor .ne-section {
    display: grid;
    gap: var(--sn-notification-widget-control-gap, 9px);
  }

  notification-editor .ne-section-title {
    color: var(--sn-sys-on-surface);
    font-size: var(--sn-notification-widget-section-size, 11px);
    font-weight: 600;
    letter-spacing: 0.4px;
    text-transform: uppercase;
  }

  notification-editor .ne-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: var(--sn-notification-widget-control-gap, 9px);
    color: var(--sn-sys-on-surface-dim);
    font-size: var(--sn-notification-widget-control-size, var(--sn-theme-editor-control-size, 12px));
  }

  notification-editor .ne-row label {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  notification-editor .ne-row input[type="checkbox"] {
    width: var(--sn-notification-widget-switch-size, 18px);
    height: var(--sn-notification-widget-switch-size, 18px);
    accent-color: var(--sn-sys-accent);
  }

  notification-editor .ne-row input[type="range"] {
    justify-self: end;
    width: var(--sn-notification-editor-range-width, 180px);
    max-width: 70%;
    height: var(--sn-notification-widget-range-hit-size, 34px);
    accent-color: var(--sn-sys-accent);
  }

  notification-editor .ne-control-group {
    display: inline-flex;
    align-items: center;
    gap: var(--sn-notification-widget-action-gap, 6px);
    min-width: 0;
    justify-self: end;
  }

  notification-editor .ne-play {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex: none;
    padding: var(--sn-notification-widget-action-gap, 4px);
    border: 1px solid var(--sn-sys-outline);
    border-radius: var(--sn-button-radius, 6px);
    background: var(--sn-sys-surface-raised);
    color: var(--sn-sys-on-surface-dim);
    cursor: pointer;
  }

  notification-editor .ne-play:hover {
    background: color-mix(in oklch, var(--sn-sys-accent) var(--sn-sys-state-hover-mix), var(--sn-sys-surface-raised));
    color: var(--sn-sys-on-surface);
  }

  notification-editor .ne-play .material-symbols-outlined {
    font-size: var(--sn-notification-widget-label-icon-size, 16px);
  }

  notification-editor .ne-select {
    min-width: var(--sn-notification-widget-select-width, 150px);
    padding: var(--sn-notification-widget-select-padding, 4px 8px);
    border: 1px solid var(--sn-sys-outline);
    border-radius: var(--sn-button-radius, 6px);
    background: var(--sn-sys-surface-raised);
    color: var(--sn-sys-on-surface);
    font: inherit;
    font-size: var(--sn-notification-widget-control-size, 12px);
  }

  notification-editor .ne-depth {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--sn-notification-widget-mode-gap, 4px);
    padding: var(--sn-notification-widget-mode-padding, 3px);
    border: 1px solid var(--sn-sys-outline);
    border-radius: var(--sn-node-radius, 8px);
    background: var(--sn-sys-surface);
  }

  notification-editor .ne-depth button {
    min-width: 0;
    min-height: var(--sn-notification-widget-mode-height, var(--sn-button-min-height, 28px));
    padding: var(--sn-notification-widget-mode-button-padding, 5px 10px);
    border: 1px solid transparent;
    border-radius: var(--sn-button-radius, 6px);
    background: var(--sn-notification-widget-depth-bg, transparent);
    color: var(--sn-sys-on-surface-dim);
    font: inherit;
    font-size: var(--sn-notification-widget-control-size, 12px);
    cursor: pointer;
  }

  notification-editor .ne-depth button[aria-pressed="true"] {
    border-color: var(--sn-button-primary-border, var(--sn-sys-accent));
    background: var(--sn-button-primary-bg, color-mix(in oklch, var(--sn-sys-accent) var(--sn-sys-state-selected-mix), var(--sn-sys-surface)));
    color: var(--sn-button-primary-color, var(--sn-sys-on-surface));
  }

  notification-editor .ne-phrase {
    display: grid;
    gap: var(--sn-notification-widget-phrase-gap, 5px);
  }

  notification-editor .ne-phrase-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--sn-notification-widget-action-gap, 8px);
    color: var(--sn-sys-on-surface-dim);
    font-size: var(--sn-notification-widget-control-size, 12px);
  }

  notification-editor .ne-phrase-head button {
    padding: var(--sn-notification-widget-chip-padding, 2px 8px);
    border: 1px solid var(--sn-sys-outline);
    border-radius: var(--sn-button-radius, 6px);
    background: var(--sn-sys-surface-raised);
    color: var(--sn-sys-on-surface-dim);
    font: inherit;
    font-size: var(--sn-notification-widget-chip-size, 11px);
    cursor: pointer;
  }

  notification-editor .ne-phrase textarea {
    width: 100%;
    min-height: var(--sn-notification-widget-phrase-height, 56px);
    padding: var(--sn-notification-widget-phrase-padding, 6px 8px);
    border: 1px solid var(--sn-sys-outline);
    border-radius: var(--sn-button-radius, 6px);
    background: var(--sn-sys-surface-raised);
    color: var(--sn-sys-on-surface);
    font: inherit;
    font-size: var(--sn-notification-widget-control-size, 12px);
    line-height: 1.45;
    resize: vertical;
    box-sizing: border-box;
  }

  notification-editor .ne-hint {
    color: var(--sn-sys-on-surface-dim);
    font-size: var(--sn-notification-widget-hint-size, 10.5px);
    opacity: 0.85;
  }

  notification-editor .ne-icon-button:focus-visible,
  notification-editor .ne-play:focus-visible,
  notification-editor .ne-row input:focus-visible,
  notification-editor .ne-select:focus-visible,
  notification-editor .ne-depth button:focus-visible,
  notification-editor .ne-phrase-head button:focus-visible,
  notification-editor .ne-phrase textarea:focus-visible {
    outline: var(--sn-effect-focus-ring, 2px solid var(--sn-sys-focus-ring));
    outline-offset: 2px;
  }
`;
