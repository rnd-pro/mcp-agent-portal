export default`
:host {
  display: block;
  height: 100%;
  overflow-y: auto;
  padding: 16px;
}

.pg-stg-metric {
  display: flex;
  justify-content: space-between;
  padding: 5px 0;
  border-bottom: 1px solid var(--sn-node-hover);
  font-size: 12px;
  color: var(--sn-text);
}

.pg-stg-metric:last-child {
  border-bottom: none;
}

.pg-stg-val {
  font-weight: 600;
  font-family: var(--sn-font-mono, 'JetBrains Mono', 'Fira Code', monospace);
}

.pg-stg-ok {
  color: var(--sn-success-color, #4caf50);
}

.pg-stg-warn {
  color: var(--sn-warning-color, #ff9800);
}

.pg-stg-pulse {
  animation: pg-stg-pulse 1.5s ease infinite;
}

@keyframes pg-stg-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}

/* Provider Models Section */
.pm-provider-tabs {
  display: flex;
  gap: 4px;
  margin-bottom: 12px;
}

.pm-provider-tab {
  padding: 6px 14px;
  border-radius: 8px;
  border: 1px solid var(--sn-node-border);
  background: var(--sn-node-bg);
  color: var(--sn-text-dim);
  cursor: pointer;
  font-size: 12px;
  font-weight: 500;
  transition: all 0.15s;
}

.pm-provider-tab:hover {
  border-color: var(--sn-node-selected);
}

.pm-provider-tab.active {
  background: var(--sn-node-selected);
  border-color: var(--sn-node-selected);
  color: #fff;
}

.pm-model-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 12px;
  min-height: 40px;
  padding: 8px;
  border: 1px solid var(--sn-node-border);
  border-radius: 8px;
  background: var(--sn-bg);
}

.pm-model-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 10px;
  border-radius: 12px;
  font-size: 11px;
  font-family: var(--sn-font-mono, monospace);
  background: var(--sn-node-bg);
  border: 1px solid var(--sn-node-border);
  color: var(--sn-text);
  cursor: default;
}

.pm-model-chip .remove {
  cursor: pointer;
  color: var(--sn-text-dim);
  font-size: 13px;
  line-height: 1;
  border-radius: 50%;
  width: 14px;
  height: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.pm-model-chip .remove:hover {
  color: var(--sn-danger-color);
  background: var(--sn-node-hover);
}

/* Directory & Grid */
.pm-directory {
  border: 1px solid var(--sn-node-border);
  border-radius: 8px;
  background: var(--sn-bg);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  margin-top: 12px;
}

.pm-search {
  padding: 8px 12px;
  border-bottom: 1px solid var(--sn-node-border);
  background: var(--sn-node-bg);
  display: flex;
  gap: 8px;
  align-items: center;
}

.pm-search input {
  flex: 1;
  background: transparent;
  border: none;
  color: var(--sn-text);
  font-size: 13px;
  outline: none;
}

.pm-grid-header {
  display: grid;
  grid-template-columns: 40px minmax(200px, 2fr) minmax(70px, 1fr) minmax(80px, 1fr) 90px 90px;
  padding: 8px 12px;
  background: var(--sn-node-hover);
  border-bottom: 1px solid var(--sn-node-border);
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  color: var(--sn-text-dim);
  align-items: center;
}

.pm-grid-header .sortable {
  cursor: pointer;
  user-select: none;
  display: flex;
  align-items: center;
  gap: 4px;
}

.pm-grid-header .sortable:hover {
  color: var(--sn-text);
}

.pm-grid-header .sortable.active {
  color: var(--sn-node-selected);
}

.pm-grid-body {
  max-height: 350px;
  overflow-y: auto;
}

.pm-grid-row {
  display: grid;
  grid-template-columns: 40px minmax(200px, 2fr) minmax(70px, 1fr) minmax(80px, 1fr) 90px 90px;
  padding: 6px 12px;
  border-bottom: 1px solid var(--sn-node-hover);
  align-items: center;
  transition: background 0.1s;
}

.pm-grid-row:hover {
  background: var(--sn-node-hover);
}

.pm-grid-row:last-child {
  border-bottom: none;
}

.pm-col-star {
  cursor: pointer;
  color: var(--sn-text-dim);
  font-size: 16px;
  user-select: none;
}

.pm-col-star:hover {
  color: var(--sn-text);
}

.pm-col-star.active {
  color: #ffb300;
}

.pm-col-name {
  display: flex;
  flex-direction: column;
  gap: 2px;
  overflow: hidden;
}

.pm-model-name {
  font-weight: 500;
  font-size: 12px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.pm-model-id {
  font-family: var(--sn-font-mono, monospace);
  font-size: 10px;
  color: var(--sn-text-dim);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.pm-tags {
  display: flex;
  gap: 4px;
  margin-top: 2px;
}

.pm-tag {
  font-size: 9px;
  background: var(--sn-bg);
  border: 1px solid var(--sn-node-border);
  padding: 1px 4px;
  border-radius: 4px;
  color: var(--sn-text-dim);
}

.pm-col-ctx {
  font-family: var(--sn-font-mono, monospace);
  font-size: 11px;
  color: var(--sn-text-dim);
}

.pm-col-price {
  font-family: var(--sn-font-mono, monospace);
  font-size: 11px;
  color: var(--sn-success-color);
}

.pm-price-free {
  color: var(--sn-node-selected);
  font-weight: 600;
  font-size: 10px;
  text-transform: uppercase;
}

.pm-actions {
  display: flex;
  gap: 8px;
  align-items: center;
}

.pm-status {
  font-size: 11px;
  color: var(--sn-text-dim);
  margin-left: 8px;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
`;