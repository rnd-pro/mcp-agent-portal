export default `
:host {
  display: block;
}

  pg-skill-manager {
    display: flex;
    flex-direction: column;
    height: 100%;
    overflow: hidden;
  }
  pg-skill-manager .pg-code-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 6px 12px;
    font-family: var(--sn-font-mono);
    font-size: 11px;
    color: var(--sn-text-dim);
    border-bottom: 1px solid var(--sn-node-border);
    background: var(--sn-node-header-bg);
    gap: 8px;
  }
  pg-skill-manager .pg-code-filename {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    min-width: 0;
  }
  pg-skill-manager .pg-code-controls {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-shrink: 0;
  }
  pg-skill-manager .pg-code-stats {
    font-size: 10px;
    color: var(--sn-cat-server);
    white-space: nowrap;
  }
  pg-skill-manager code-block {
    flex: 1;
    min-height: 0;
    cursor: text;
  }
  pg-skill-manager .pg-source-editor {
    display: none;
    flex: 1;
    min-height: 0;
    width: 100%;
  }
  pg-skill-manager[mode-edit] code-block {
    display: none;
  }
  pg-skill-manager[mode-edit] .pg-source-editor {
    display: block;
  }
`;
