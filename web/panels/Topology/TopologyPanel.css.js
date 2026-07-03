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
  background: var(--sn-sys-surface-panel);
  color: var(--sn-sys-on-surface);
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
  color: var(--sn-sys-on-surface);
  font-size: 16px;
  font-weight: 600;
}

.topo-title .material-symbols-outlined {
  color: var(--sn-sys-accent);
}

.topo-desc {
  color: var(--sn-sys-on-surface-dim);
  font-size: 12px;
  line-height: 1.5;
}

sn-data-table {
  margin-top: 20px;
}
`;
