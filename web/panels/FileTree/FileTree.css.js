export default `
:host {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
  font-family: var(--sn-font, Georgia, serif);
  font-size: 12px;
}

.pg-panel-toolbar {
  display: flex;
  gap: 6px;
  padding: 6px 8px;
  border-bottom: 1px solid var(--sn-node-border);
}

.pg-panel-toolbar input {
  flex: 1;
  min-width: 0;
  padding: 4px 8px;
  border: 1px solid var(--sn-node-border);
  border-radius: 4px;
  outline: none;
  background: var(--sn-bg);
  color: var(--sn-text);
  font-family: inherit;
  font-size: 11px;
}

.pg-panel-toolbar input:focus {
  border-color: var(--sn-node-selected);
}

.pg-collapse-all {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 6px;
  border: 1px solid var(--sn-node-border);
  border-radius: 4px;
  background: var(--sn-bg);
  color: var(--sn-text);
  cursor: pointer;
  transition: background 100ms ease;
}

.pg-collapse-all:hover {
  background: var(--sn-node-hover);
}

.pg-tree-content {
  flex: 1;
  overflow-y: auto;
  padding: 4px;
}

.pg-placeholder {
  padding: 8px;
  color: var(--sn-text-dim);
  font-size: 12px;
}

.pg-placeholder[hidden] {
  display: none;
}

sn-tree-view {
  --sn-tree-gap: 4px;
  --sn-tree-indent: 16px;
  --sn-tree-row-min-height: 22px;
  --sn-tree-row-padding-block: 2px;
  --sn-tree-row-radius: 4px;
  --sn-tree-row-selected-bg: var(--sn-node-selected-soft, var(--sn-node-hover));
  --sn-tree-row-selected-border: transparent;
  --sn-tree-label-color: var(--sn-text-dim);
  --sn-tree-label-size: 12px;
  --sn-tree-label-weight: 500;
  --sn-tree-muted-color: var(--sn-text-dim);
  --sn-tree-badge-radius: 8px;
  --sn-tree-badge-bg: var(--sn-node-hover);
  --sn-tree-badge-color: var(--sn-text-dim);
  --sn-tree-badge-size: 10px;
}

sn-tree-view[hidden] {
  display: none;
}
`;
