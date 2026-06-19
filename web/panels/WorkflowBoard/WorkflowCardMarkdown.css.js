export default /*css*/ `
:host,
pg-workflow-card-markdown {
  display: block;
  height: 100%;
  min-height: 0;
}

pg-workflow-card-markdown .wcm-shell {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  background: var(--sn-panel-bg);
  color: var(--sn-text);
  font-family: var(--sn-font);
}

pg-workflow-card-markdown .wcm-header {
  display: flex;
  align-items: center;
  min-height: 38px;
  padding: 8px 12px;
  border-block-end: 1px solid var(--sn-node-border);
  background: var(--sn-node-header-bg);
  color: var(--sn-text-dim);
  font-family: var(--sn-font-mono);
  font-size: 11px;
}

pg-workflow-card-markdown .wcm-header span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

pg-workflow-card-markdown .wcm-view {
  flex: 1 1 auto;
  min-height: 0;
}
`;
