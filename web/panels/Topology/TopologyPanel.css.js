export default /*css*/ `
:host {
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

.node-table {
  width: 100%;
  border-collapse: collapse;
  margin-top: 20px;
  background: var(--sn-node-bg);
  border: 1px solid var(--sn-node-border);
  border-radius: 8px;
  overflow: hidden;
}

.node-table th {
  text-align: left;
  padding: 12px 15px;
  background: var(--sn-panel-bg);
  font-weight: 500;
  border-bottom: 1px solid var(--sn-node-border);
  color: var(--sn-text-dim);
  font-size: 11px;
  text-transform: uppercase;
}

.node-table td {
  padding: 12px 15px;
  border-bottom: 1px solid var(--sn-node-hover);
  color: var(--sn-text);
  font-size: 13px;
}

.node-table tr:last-child td {
  border-bottom: none;
}

.node-color {
  display: inline-block;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  margin-right: 10px;
  vertical-align: middle;
  background: var(--topo-node-color, var(--sn-node-selected));
}

.topology-status {
  color: var(--sn-success-color);
}
`;
