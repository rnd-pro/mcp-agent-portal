export default `
  :host {
    display: flex;
    flex-direction: column;
    height: 100%;
    overflow: hidden;
    font-size: 12px;
    font-family: var(--sn-font, Georgia, serif);
  }
  .pg-library-title {
    display: flex;
    align-items: center;
    gap: 5px;
    padding: 6px 8px;
    border-bottom: 1px solid var(--sn-node-border);
    color: var(--sn-text-dim);
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
  }
  .pg-title-icon,
  .pg-toolbar-icon {
    font-size: 14px;
  }
  .pg-panel-toolbar {
    padding: 6px 8px;
    border-bottom: 1px solid var(--sn-node-border);
    display: flex;
    gap: 6px;
  }
  .pg-panel-toolbar input {
    flex: 1;
    min-width: 0;
    background: var(--sn-bg);
    border: 1px solid var(--sn-node-border);
    color: var(--sn-text);
    padding: 4px 8px;
    border-radius: 4px;
    font-size: 11px;
    font-family: inherit;
    outline: none;
  }
  .pg-collapse-all {
    background: var(--sn-bg);
    border: 1px solid var(--sn-node-border);
    color: var(--sn-text);
    border-radius: 4px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0 6px;
  }
  .pg-tree-content {
    flex: 1;
    overflow-y: auto;
    padding: 4px;
  }
  sn-tree-view {
    --sn-icon-font: 'Material Symbols Outlined';
    --sn-tree-indent: 16px;
    --sn-tree-row-min-height: 24px;
    --sn-tree-row-radius: 4px;
    --sn-tree-row-hover-bg: var(--sn-node-hover);
    --sn-tree-row-selected-bg: var(--sn-node-selected-soft, var(--sn-node-hover));
    --sn-tree-row-selected-border: transparent;
    --sn-tree-label-color: var(--sn-text-dim);
    --sn-tree-label-size: 12px;
    --sn-tree-label-weight: 400;
    --sn-tree-icon-size: 15px;
  }
  sn-tree-view[hidden] {
    display: none;
  }
  .pg-placeholder {
    padding: 12px;
    color: var(--sn-text-dim);
  }
  .pg-placeholder[hidden] {
    display: none;
  }
`;
