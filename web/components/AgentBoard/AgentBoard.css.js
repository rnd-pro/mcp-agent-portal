export default /*css*/ `
:host {
  display: block;
  background: var(--bg-1);
  border-bottom: 1px solid var(--border-color);
  font-family: var(--font-main);
}

.board-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 16px;
  background: var(--bg-2);
  border-bottom: 1px solid var(--border-color);
}

.board-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-color);
}

.board-actions {
  display: flex;
  gap: 8px;
}

.btn-icon {
  background: none;
  border: none;
  color: var(--text-color);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 4px;
  border-radius: 4px;
  transition: background 0.2s;
}
.btn-icon:hover {
  background: var(--bg-3);
}

.board-content {
  padding: 16px;
  overflow-x: auto;
}

.board-columns {
  display: flex;
  gap: 16px;
  min-width: min-content;
}

.board-col {
  width: 280px;
  min-width: 280px;
  background: var(--bg-2);
  border-radius: 8px;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  border: 1px solid var(--border-color);
}

.col-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-weight: 500;
  color: var(--text-color);
  font-size: 13px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--border-color);
}

.col-count {
  background: var(--bg-3);
  padding: 2px 6px;
  border-radius: 12px;
  font-size: 11px;
}

.col-cards {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-height: 50px;
}

.agent-card {
  background: var(--bg-1);
  border-radius: 6px;
  padding: 10px;
  border-left: 3px solid var(--border-color);
  box-shadow: 0 1px 3px rgba(0,0,0,0.1);
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.status-queued { border-left-color: #9e9e9e; }
.status-running { border-left-color: #2196f3; }
.status-done { border-left-color: #4caf50; }
.status-error { border-left-color: #f44336; }
.status-cancelled { border-left-color: #ff9800; }

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.agent-slug {
  font-weight: 600;
  font-size: 13px;
  color: var(--text-color);
}

.card-header .material-symbols-outlined {
  font-size: 16px;
  color: var(--text-color-muted, #888);
}

.spin-icon {
  animation: spin 2s linear infinite;
}

@keyframes spin {
  100% { transform: rotate(360deg); }
}

.card-desc {
  font-size: 12px;
  color: var(--text-color);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  opacity: 0.8;
}

.card-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 11px;
  color: var(--text-color-muted, #888);
}

.metrics {
  background: var(--bg-2);
  padding: 2px 6px;
  border-radius: 4px;
}
`;
