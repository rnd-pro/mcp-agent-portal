export default `
  pg-file-tree {
    display: flex;
    flex-direction: column;
    height: 100%;
    overflow: hidden;
    font-size: 12px;
    font-family: var(--sn-font, Georgia, serif);
  }
  pg-file-tree .pg-panel-toolbar {
    padding: 6px 8px;
    border-bottom: 1px solid var(--sn-node-border, hsl(35, 18%, 80%));
    display: flex;
    gap: 6px;
  }
  pg-file-tree .pg-panel-toolbar input {
    flex: 1;
    background: var(--sn-bg, hsl(37, 30%, 91%));
    border: 1px solid var(--sn-node-border, hsl(35, 18%, 80%));
    color: var(--sn-text, hsl(30, 15%, 18%));
    padding: 4px 8px;
    border-radius: 4px;
    font-size: 11px;
    font-family: inherit;
    outline: none;
    min-width: 0;
  }
  pg-file-tree .pg-panel-toolbar input:focus {
    border-color: var(--sn-node-selected, hsl(210, 55%, 42%));
  }
  pg-file-tree .pg-collapse-all {
    background: var(--sn-bg, hsl(37, 30%, 91%));
    border: 1px solid var(--sn-node-border, hsl(35, 18%, 80%));
    color: var(--sn-text, hsl(30, 15%, 18%));
    border-radius: 4px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0 6px;
    transition: all 100ms ease;
  }
  pg-file-tree .pg-collapse-all:hover {
    background: var(--sn-node-hover, hsl(36, 22%, 88%));
  }
  pg-file-tree .pg-tree-content {
    flex: 1;
    overflow-y: auto;
    padding: 4px;
  }
  pg-file-tree .pg-tree-dir {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 3px 6px;
    color: var(--sn-text-dim, hsl(30, 10%, 45%));
    font-weight: 600;
    font-size: 11px;
    cursor: pointer;
    user-select: none;
  }
  pg-file-tree .pg-tree-dir:hover {
    background: var(--sn-node-hover, hsl(36, 22%, 88%));
    border-radius: 4px;
  }
  pg-file-tree .pg-tree-dir .pg-chevron {
    transition: transform 150ms ease;
  }
  pg-file-tree .pg-tree-children[hidden] {
    display: none;
  }
  pg-file-tree .pg-tree-file {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 3px 6px 3px 24px;
    cursor: pointer;
    border-radius: 4px;
    color: var(--sn-text-dim, hsl(30, 10%, 45%));
    transition: all 100ms ease;
  }
  pg-file-tree .pg-tree-file:hover {
    background: var(--sn-node-hover, hsl(36, 22%, 88%));
    color: var(--sn-text, hsl(30, 15%, 18%));
  }
  pg-file-tree .pg-tree-file.active {
    background: hsla(210, 45%, 45%, 0.12);
    color: var(--sn-cat-server, hsl(210, 45%, 45%));
  }
  pg-file-tree .pg-tree-dir.active {
    background: hsla(210, 45%, 45%, 0.12);
    color: var(--sn-cat-server, hsl(210, 45%, 45%));
    border-radius: 4px;
  }
  pg-file-tree .pg-tree-file[hidden] {
    display: none;
  }
  pg-file-tree .pg-tree-file.pg-non-source {
    opacity: 0.6;
  }
  pg-file-tree .pg-badge {
    margin-left: auto;
    font-size: 10px;
    padding: 0 5px;
    border-radius: 8px;
    background: var(--sn-node-hover, hsl(36, 22%, 88%));
    color: var(--sn-text-dim, hsl(30, 10%, 45%));
    border: 1px solid var(--sn-node-border, hsl(35, 18%, 80%));
  }
`;
