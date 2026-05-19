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
  }
`;
