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

  .ui-btn-icon { background:transparent; border:none; color:var(--sn-text-dim); cursor:pointer; border-radius:4px; padding:4px; font-size:16px; }
  .ui-btn-icon:hover { background:var(--sn-node-hover); color:var(--sn-text); }
`;
