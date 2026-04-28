export default /*css*/ `
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
}
`;
