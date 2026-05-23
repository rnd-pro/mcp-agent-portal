export default `
  :host { display: block; height: 100%; background: var(--sn-panel-bg); }

  pg-active-context {
    & .ctx-shell {
      display: flex;
      flex-direction: column;
      height: 100%;
    }

    & .ctx-header {
      padding: 10px 12px;
      border-bottom: 1px solid var(--sn-node-border);
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    & .ctx-title {
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      color: var(--sn-text-dim);
    }

    & .ctx-file-list {
      flex: 1;
      overflow-y: auto;
      padding: 8px;
    }

    & .ctx-file-row {
      display: flex;
      align-items: center;
      gap: 6px;
      margin-block-end: 4px;
    }

    & .ctx-file-item {
      flex: 1 1 auto;
      min-width: 0;
      --sn-list-item-bg: var(--sn-node-bg);
      --sn-list-item-active-bg: var(--sn-node-bg);
      --sn-list-item-padding: 6px 8px;
      --sn-list-item-icon-color: var(--sn-cat-server);
      --sn-list-item-icon-font-size: 14px;
      --sn-list-item-description-size: 10px;
      --sn-list-item-description-color: var(--sn-text-dim);
    }

    & .ctx-empty-loading {
      padding: 10px;
    }

    & .ctx-empty-muted {
      padding: 20px;
      color: var(--sn-text-dim);
      font-size: 12px;
      text-align: center;
    }

    & .ctx-empty-error {
      padding: 10px;
      color: var(--sn-danger-color);
      font-size: 12px;
    }
  }
`;
