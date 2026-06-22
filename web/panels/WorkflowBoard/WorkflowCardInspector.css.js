export default /*css*/ `
:host,
pg-workflow-card-inspector {
  display: block;
  height: 100%;
  min-height: 0;
}

pg-workflow-card-inspector .wci-shell {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  background: var(--sn-panel-bg);
  color: var(--sn-text);
  font-family: var(--sn-font);
}

pg-workflow-card-inspector .wci-header {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 38px;
  padding: 8px 12px;
  border-block-end: 1px solid var(--sn-node-border);
  background: var(--sn-node-header-bg);
  color: var(--sn-text);
}

pg-workflow-card-inspector .wci-title {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
  font-weight: 500;
}

pg-workflow-card-inspector .wci-badge {
  flex: 0 0 auto;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 10px;
  font-family: var(--sn-font-mono);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  background: var(--sn-chip-bg, rgba(127, 119, 221, 0.18));
  color: var(--sn-text-dim);
}
pg-workflow-card-inspector .wci-badge[data-kind="error"] { background: rgba(226, 75, 74, 0.18); color: #e24b4a; }
pg-workflow-card-inspector .wci-badge[data-kind="warning"] { background: rgba(239, 159, 39, 0.18); color: #ef9f27; }
pg-workflow-card-inspector .wci-badge[data-kind="ok"] { background: rgba(29, 158, 117, 0.18); color: #1d9e75; }

pg-workflow-card-inspector .wci-empty {
  flex: 1 1 auto;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  text-align: center;
  color: var(--sn-text-dim);
  font-size: 12px;
}

pg-workflow-card-inspector .wci-content {
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: auto;
}

pg-workflow-card-inspector .wci-agent {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  border-block-end: 1px solid var(--sn-node-border);
}

pg-workflow-card-inspector .wci-agent-dot {
  flex: 0 0 auto;
  width: 8px;
  height: 8px;
  border-radius: 2px;
  background: var(--sn-accent, #7f77dd);
  transform: rotate(45deg);
}

pg-workflow-card-inspector .wci-agent-name {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
  font-weight: 500;
}

pg-workflow-card-inspector .wci-chat-btn {
  flex: 0 0 auto;
  padding: 4px 10px;
  border: 1px solid var(--sn-node-border);
  border-radius: 6px;
  background: transparent;
  color: var(--sn-text);
  font: inherit;
  font-size: 11px;
  cursor: pointer;
}
pg-workflow-card-inspector .wci-chat-btn:hover {
  background: var(--sn-node-hover, rgba(127, 119, 221, 0.12));
}

pg-workflow-card-inspector .wci-metrics {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 1px;
  background: var(--sn-node-border);
  border-block-end: 1px solid var(--sn-node-border);
}

pg-workflow-card-inspector .wci-metric {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 8px 10px;
  background: var(--sn-panel-bg);
}

pg-workflow-card-inspector .wci-metric-label {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--sn-text-dim);
}

pg-workflow-card-inspector .wci-metric-value {
  font-size: 14px;
  font-weight: 500;
  font-family: var(--sn-font-mono);
}

pg-workflow-card-inspector .wci-section {
  padding: 10px 12px;
  border-block-end: 1px solid var(--sn-node-border);
}

pg-workflow-card-inspector .wci-section-label {
  margin-block-end: 8px;
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--sn-text-dim);
}

pg-workflow-card-inspector .wci-history-list {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

pg-workflow-card-inspector .wci-history-item {
  display: flex;
  align-items: baseline;
  gap: 8px;
  font-size: 11px;
}

pg-workflow-card-inspector .wci-history-dot {
  flex: 0 0 auto;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--sn-text-dim);
  align-self: center;
}
pg-workflow-card-inspector .wci-history-item[data-kind="error"] .wci-history-dot { background: #e24b4a; }
pg-workflow-card-inspector .wci-history-item[data-kind="warning"] .wci-history-dot { background: #ef9f27; }
pg-workflow-card-inspector .wci-history-item[data-kind="ok"] .wci-history-dot { background: #1d9e75; }

pg-workflow-card-inspector .wci-history-label {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

pg-workflow-card-inspector .wci-history-time {
  flex: 0 0 auto;
  color: var(--sn-text-dim);
  font-family: var(--sn-font-mono);
  font-size: 10px;
}

pg-workflow-card-inspector .wci-body-section {
  flex: 1 1 auto;
  min-height: 120px;
  display: flex;
  flex-direction: column;
  border-block-end: none;
}

pg-workflow-card-inspector .wci-view {
  flex: 1 1 auto;
  min-height: 0;
}
`;
