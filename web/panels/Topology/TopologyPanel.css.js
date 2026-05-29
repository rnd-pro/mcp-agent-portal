export default /*css*/ `
:host,
topology-panel {
  display: block;
  height: 100%;
}

.topo-main {
  height: 100%;
  overflow: auto;
  padding: 20px;
  background: var(--sn-panel-bg);
  color: var(--sn-text);
}

.topo-header {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.topo-title {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--sn-text);
  font-size: 16px;
  font-weight: 600;
}

.topo-title .material-symbols-outlined {
  color: var(--sn-node-selected);
}

.topo-desc {
  color: var(--sn-text-dim);
  font-size: 12px;
  line-height: 1.5;
}

sn-data-table {
  margin-top: 20px;
}
`;
