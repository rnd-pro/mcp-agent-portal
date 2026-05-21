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
    font-family: 'SF Mono', 'Fira Code', monospace;
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
  pg-skill-manager .pg-mode-toggle {
    display: flex;
    align-items: center;
    gap: 3px;
    padding: 2px 8px;
    border: 1px solid var(--sn-node-border);
    border-radius: 4px;
    background: var(--sn-bg);
    color: var(--sn-text-dim);
    font-family: inherit;
    font-size: 10px;
    cursor: pointer;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }
  pg-skill-manager .pg-mode-toggle:disabled {
    opacity: 0.45;
    cursor: default;
  }
  pg-skill-manager .pg-mode-toggle[hidden] {
    display: none;
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
