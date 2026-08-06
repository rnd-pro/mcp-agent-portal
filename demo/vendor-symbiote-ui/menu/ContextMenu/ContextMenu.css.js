import { css } from '@symbiotejs/symbiote';

export let styles = css`
  context-menu {
    --sn-ctx-border: var(--sn-sys-outline-subtle);
    --sn-ctx-color: var(--sn-sys-on-surface);
    --sn-ctx-shadow-color: var(--sn-sys-shadow-overlay);
    --sn-ctx-divider-color: var(--sn-sys-outline-subtle);
    --sn-ctx-check-color: var(--sn-sys-accent);
    --sn-ctx-detail-color: var(--sn-sys-on-surface-dim);
    --sn-ctx-destructive-color: var(--sn-sys-danger);

    margin: 0;
    padding: 0;
    border: none;
    inset: auto;
    position: fixed;
    min-width: min(180px, calc(100vw - 16px));
    max-width: calc(100vw - 16px);
    max-height: calc(100vh - 16px);
    box-sizing: border-box;
    background: var(--sn-sys-surface-overlay);
    border: 1px solid var(--sn-ctx-border);
    border-radius: var(--sn-radius-lg);
    box-shadow: var(--sn-ctx-shadow-color);
    padding: var(--sn-step-2);
    overflow: auto;
    color: var(--sn-ctx-color);
    font-family: var(--sn-font, sans-serif);

    &:not(:popover-open) {
      display: none;
    }
  }

  .ctx-items {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }

  .sn-ctx-divider {
    height: 1px;
    background: var(--sn-ctx-divider-color);
    margin: var(--sn-step-2) var(--sn-step-3);
  }

  .sn-ctx-divider[hidden],
  .sn-ctx-btn[hidden],
  .sn-ctx-icon[hidden],
  .sn-ctx-check-mark[hidden],
  .sn-ctx-detail[hidden] {
    display: none !important;
  }

  .sn-ctx-btn {
    display: flex;
    align-items: center;
    gap: var(--sn-step-4);
    width: 100%;
    min-width: 0;
    box-sizing: border-box;
    overflow: hidden;
    padding: var(--sn-step-3) var(--sn-step-6);
    border: none;
    background: transparent;
    color: var(--sn-ctx-color);
    font-family: var(--sn-font);
    font-size: var(--sn-text-md);
    cursor: pointer;
    border-radius: var(--sn-radius-sm);
    transition: background var(--sn-transition-fast, 0.1s), color var(--sn-transition-fast, 0.1s);
    outline: none;

    &:hover {
      background: color-mix(in oklch, var(--sn-sys-accent) var(--sn-sys-state-hover-mix), transparent);
    }

    &:focus-visible {
      background: color-mix(in oklch, var(--sn-sys-accent) var(--sn-sys-state-hover-mix), transparent);
      box-shadow: 0 0 0 2px var(--sn-sys-focus-ring, currentColor);
    }
  }

  .sn-ctx-icon {
    font-size: var(--sn-text-2xl);
    opacity: 0.7;
  }

  .sn-ctx-check-mark {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 16px;
    font-size: var(--sn-text-sm);
    color: var(--sn-ctx-check-color);
  }

  .sn-ctx-label {
    flex: 1;
    min-width: 0;
    overflow-wrap: anywhere;
    text-align: start;
  }

  .sn-ctx-detail {
    flex: 0 1 40%;
    min-width: 0;
    max-width: 40%;
    margin-left: auto;
    box-sizing: border-box;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: var(--sn-text-xs);
    color: var(--sn-ctx-detail-color);
    padding-left: var(--sn-step-6);
  }

  .sn-ctx-btn[destructive] {
    color: var(--sn-ctx-destructive-color);
  }

  .sn-ctx-btn[destructive]:hover {
    background: color-mix(in oklch, var(--sn-sys-danger) var(--sn-sys-state-hover-mix), transparent);
  }

  .sn-ctx-btn[destructive]:focus-visible {
    background: color-mix(in oklch, var(--sn-sys-danger) var(--sn-sys-state-hover-mix), transparent);
  }

  .sn-ctx-btn[disabled] {
    opacity: var(--sn-sys-state-disabled-opacity);
    cursor: not-allowed;
  }

  .sn-ctx-btn[disabled]:hover {
    /* disabled items never receive a state layer — mix a zero-strength state color so this
       stays inside the sanctioned color-mix system instead of a hand-rolled transparent. audit-ok */
    background: color-mix(in oklch, var(--sn-sys-accent) 0%, transparent);
  }

  .sn-ctx-btn[disabled]:focus-visible {
    background: color-mix(in oklch, var(--sn-sys-accent) 0%, transparent);
    box-shadow: none;
  }
`;
