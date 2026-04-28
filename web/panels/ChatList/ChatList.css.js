export default /*css*/ `
.filter-bar {
  display: flex;
  gap: 4px;
  padding: 6px 12px;
  border-bottom: 1px solid var(--sn-node-border);
  flex-shrink: 0;
}

.filter-btn {
  background: transparent;
  border: 1px solid transparent;
  color: var(--sn-text-dim);
  padding: 3px 8px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 11px;
  font-family: inherit;
  transition: all 0.15s;
}

.filter-btn:hover {
  color: var(--sn-text);
}

.filter-btn[active] {
  background: var(--sn-node-bg);
  border-color: var(--sn-node-border);
  color: var(--sn-text);
}

.chat-item-top {
  display: flex;
  align-items: center;
  gap: 6px;
}

.chat-project-badge {
  font-size: 9px;
  font-weight: 600;
  padding: 1px 5px;
  border-radius: 3px;
  background: rgba(76, 139, 245, 0.12);
  color: var(--sn-node-selected);
  text-transform: uppercase;
  letter-spacing: 0.3px;
  white-space: nowrap;
}

.chat-name {
  font-size: 12px;
  font-weight: 500;
  color: var(--sn-text);
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.chat-adapter {
  font-size: 10px;
  color: var(--sn-text-dim);
  font-family: var(--sn-font-mono, monospace);
}

.chat-preview {
  font-size: 11px;
  color: var(--sn-text-dim);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 100%;
}

.chat-meta {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 10px;
  color: var(--sn-text-dim);
}

.chat-delete {
  display: none;
  background: none;
  border: none;
  color: var(--sn-text-dim);
  cursor: pointer;
  font-size: 14px;
  padding: 0 2px;
  margin-left: auto;
  transition: color 0.15s;
}

.ui-item:hover .chat-delete {
  display: inline;
}

.chat-delete:hover {
  color: var(--sn-danger-color);
}
`;
