// @ctx TopologyPanel.css.ctx
export default /*css*/ `
.topology-panel {
  padding: 20px;
  color: #fff;
  height: 100%;
  overflow-y: auto;
  box-sizing: border-box;
}

.topology-panel h2 {
  margin-top: 0;
  font-weight: 500;
  border-bottom: 1px solid rgba(255,255,255,0.1);
  padding-bottom: 10px;
  display: flex;
  align-items: center;
  gap: 10px;
}

.node-table {
  width: 100%;
  border-collapse: collapse;
  margin-top: 20px;
  background: rgba(0, 0, 0, 0.2);
  border-radius: 8px;
  overflow: hidden;
}

.node-table th {
  text-align: left;
  padding: 12px 15px;
  background: rgba(255, 255, 255, 0.05);
  font-weight: 500;
  border-bottom: 1px solid rgba(255,255,255,0.1);
}

.node-table td {
  padding: 12px 15px;
  border-bottom: 1px solid rgba(255,255,255,0.05);
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

.badge.local { background: rgba(50, 205, 50, 0.2); color: #32CD32; }
.badge.remote { background: rgba(30, 144, 255, 0.2); color: #1E90FF; }
.badge.master { background: rgba(138, 43, 226, 0.2); color: #8A2BE2; }

.node-color {
  display: inline-block;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  margin-right: 10px;
  vertical-align: middle;
}
`;
