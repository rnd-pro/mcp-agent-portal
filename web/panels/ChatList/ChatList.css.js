export default /*css*/ `
:host {
  display: block;
  height: 100%;
  overflow: hidden;
  font-family: var(--sn-font, 'Inter', -apple-system, sans-serif);
}

.chat-list-wrapper {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.chat-list-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  border-bottom: 1px solid var(--sn-node-border);
  flex-shrink: 0;
}

.chat-list-header span {
  font-size: 13px;
  font-weight: 600;
  color: var(--sn-text);
}

.new-chat-btn {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 4px;
  background: var(--sn-node-bg);
  border: 1px solid var(--sn-node-border);
  color: var(--sn-text);
  padding: 4px 10px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 11px;
  font-family: inherit;
  transition: border-color 0.15s;
}

.new-chat-btn:hover {
  border-color: var(--sn-node-selected, #4c8bf5);
}

.new-chat-btn .material-symbols-outlined {
  font-size: 14px;
}

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

.chat-items {
  flex: 1;
  overflow-y: auto;
  padding: 4px 0;
}

.chat-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 8px 12px;
  cursor: pointer;
  transition: background 0.12s;
  border-bottom: 1px solid var(--sn-node-hover, rgba(255,255,255,0.03));
}

.chat-item:hover {
  background: var(--sn-node-bg);
}

.chat-item[active] {
  background: var(--sn-node-bg);
  border-left: 2px solid var(--sn-node-selected, #4c8bf5);
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
  color: var(--sn-node-selected, #4c8bf5);
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

.chat-item:hover .chat-delete {
  display: inline;
}

.chat-delete:hover {
  color: var(--sn-danger-color, #ef5350);
}

.empty-state {
  color: var(--sn-text-dim);
  text-align: center;
  padding: 30px 16px;
  font-size: 12px;
}

.empty-state .material-symbols-outlined {
  font-size: 32px;
  display: block;
  margin-bottom: 8px;
  opacity: 0.3;
}
`;
