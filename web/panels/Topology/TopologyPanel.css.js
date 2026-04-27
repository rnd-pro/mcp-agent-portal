// @ctx TopologyPanel.css.ctx
export default /*css*/ `
:host {
  display: block;
  height: 100%;
}
.topology-panel {
  padding: 20px;
  color: var(--sn-text);
  height: 100%;
  overflow-y: auto;
  box-sizing: border-box;
}

.topology-panel h2 {
  margin-top: 0;
  font-weight: 500;
  border-bottom: 1px solid var(--sn-node-border);
  padding-bottom: 10px;
  display: flex;
  align-items: center;
  gap: 10px;
  color: var(--sn-text-dim);
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
}

.node-table td {
  padding: 12px 15px;
  border-bottom: 1px solid var(--sn-node-hover);
}

.node-table tr:last-child td {
  border-bottom: none;
}


.badge {
  display: inline-block;
  padding: 3px 8px;
  border-radius: 12px;
  font-size: 11px;
  font-weight: bold;
  text-transform: uppercase;
}

.badge.local { background: hsla(150, 55%, 38%, 0.2); color: var(--sn-success-color, hsl(150, 55%, 38%)); }
.badge.remote { background: hsla(210, 55%, 45%, 0.2); color: var(--sn-node-selected, hsl(210, 55%, 45%)); }
.badge.master { background: hsla(280, 55%, 45%, 0.2); color: var(--sn-cat-server, hsl(280, 55%, 45%)); }

.node-color {
  display: inline-block;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  margin-right: 10px;
  vertical-align: middle;
}
`;
