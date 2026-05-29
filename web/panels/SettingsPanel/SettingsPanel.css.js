export default`
:host,
pg-settings-panel {
  display: block;
  height: 100%;
  overflow-y: auto;
  padding: 16px;
}

.stg-actions {
  display: flex;
  gap: 8px;
  margin-bottom: 16px;
}

.stg-status {
  margin-bottom: 16px;
  font-size: 11px;
  color: var(--sn-text-dim);
}

.stg-status[data-status="warning"],
.pg-language-status[data-status="warning"],
.pg-network-status[data-status="warning"],
.pg-gateway-status[data-status="warning"],
.pm-status[data-status="warning"] {
  color: var(--sn-warning-color);
}

.stg-status[data-status="success"],
.pg-language-status[data-status="success"],
.pg-network-status[data-status="success"],
.pg-gateway-status[data-status="success"],
.pm-status[data-status="success"] {
  color: var(--sn-success-color);
}

.stg-status[data-status="error"],
.pg-language-status[data-status="error"],
.pg-network-status[data-status="error"],
.pg-gateway-status[data-status="error"],
.pm-status[data-status="error"] {
  color: var(--sn-danger-color);
}

.pm-status[data-status="accent"] {
  color: var(--sn-node-selected);
}

.stg-empty-error {
  --sn-empty-state-color: var(--sn-danger-color);
}

.stg-spin {
  animation: spin 1s linear infinite;
  font-size: 14px;
}

.stg-integrations {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.stg-instance-section {
  margin-block-end: 16px;
}

.stg-save-btn {
  align-self: flex-start;
}

.stg-search-icon {
  font-size: 16px;
  color: var(--sn-text-dim);
}

.pg-stg-pulse {
  animation: pg-stg-pulse 1.5s ease infinite;
}

@keyframes pg-stg-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}

/* Claude Gateway */
.pg-library-settings,
.pg-language-settings,
.pg-network-settings,
.pg-gateway {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.pg-language-settings select {
  font-family: var(--sn-font);
}

.pg-library-settings input,
.pg-gateway-grid input,
.pg-gateway-grid select {
  font-family: var(--sn-font-mono);
}

.pg-language-note,
.pg-language-status,
.pg-library-note {
  font-size: 11px;
  line-height: 1.4;
  color: var(--sn-text-dim);
}

.pg-gateway-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
}

.pg-settings-toggle {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  font-weight: 600;
  color: var(--sn-text);
}

.pg-settings-toggle input {
  margin: 0;
}

.pg-network-status {
  min-height: 16px;
  font-size: 11px;
  color: var(--sn-text-dim);
}

.pg-network-links {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.pg-network-approvals {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.pg-network-request {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 8px;
  align-items: center;
  padding: 8px;
  border: 1px solid var(--sn-node-border);
  border-radius: var(--sn-radius-sm);
  background: var(--sn-node-bg);
}

.pg-network-request-main {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.pg-network-request-title {
  color: var(--sn-text);
  font-size: 12px;
  font-weight: 600;
}

.pg-network-request-meta {
  color: var(--sn-text-dim);
  font: 11px var(--sn-font-mono);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.pg-network-request-actions {
  display: flex;
  gap: 6px;
}

.pg-network-links a {
  color: var(--sn-node-selected);
  font: 11px var(--sn-font-mono);
  text-decoration: none;
}

.pg-network-links a:hover {
  text-decoration: underline;
}

.pg-gateway-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(180px, 1fr));
  gap: 8px 12px;
}

.pg-gateway-wide {
  grid-column: 1 / -1;
}

.pg-gateway-status {
  min-height: 16px;
  font-size: 11px;
  color: var(--sn-text-dim);
}

.pm-model-suggestions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
}

.pm-model-suggestions span {
  color: var(--sn-text-dim);
  font-size: 11px;
}

.pm-suggest-model {
  font: 11px var(--sn-font-mono);
}

@media (max-width: 620px) {
  .pg-gateway-grid {
    grid-template-columns: 1fr;
  }
}

/* Provider Models Section */
.pm-provider-tabs {
  display: flex;
  gap: 4px;
  margin-bottom: 12px;
}

.pm-provider-tab {
  flex: 0 0 auto;
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
  font-family: var(--sn-font-mono);
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
  color: var(--sn-warning-color);
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
  font-family: var(--sn-font-mono);
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
}

.pm-tag .material-symbols-outlined {
  font-size: 12px;
}

.pm-col-ctx {
  font-family: var(--sn-font-mono);
  font-size: 11px;
  color: var(--sn-text-dim);
}

.pm-col-price {
  font-family: var(--sn-font-mono);
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

.pm-model-empty {
  padding: 4px;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
`;
