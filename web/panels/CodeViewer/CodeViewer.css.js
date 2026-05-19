export default `
  pg-code-viewer {
    display: flex;
    flex-direction: column;
    height: 100%;
    overflow: hidden;
  }
  pg-code-viewer:not([has-file]) code-block {
    display: none;
  }
  .pg-code-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 6px 12px;
    font-family: 'SF Mono', 'Fira Code', monospace;
    font-size: 11px;
    color: var(--sn-text-dim, hsl(30, 10%, 45%));
    border-bottom: 1px solid var(--sn-node-border, hsl(35, 18%, 80%));
    background: var(--sn-node-header-bg, hsl(37, 25%, 93%));
    gap: 8px;
  }
  .pg-code-filename {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    min-width: 0;
  }
  .pg-code-controls {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-shrink: 0;
  }
  .pg-code-stats {
    font-size: 10px;
    color: var(--sn-cat-server, hsl(210, 45%, 45%));
    white-space: nowrap;
  }
  .pg-mode-toggle {
    display: flex;
    align-items: center;
    gap: 3px;
    padding: 2px 8px;
    border: 1px solid var(--sn-node-border, hsl(35, 18%, 80%));
    border-radius: 4px;
    background: var(--sn-bg, hsl(37, 30%, 91%));
    color: var(--sn-text-dim, hsl(30, 10%, 45%));
    font-family: inherit;
    font-size: 10px;
    cursor: pointer;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    transition: all 120ms ease;
  }
  .pg-mode-toggle:hover {
    background: var(--sn-node-hover, hsl(36, 22%, 88%));
    color: var(--sn-text, hsl(30, 15%, 18%));
  }
  pg-code-viewer[mode-raw] .pg-mode-toggle {
    background: hsla(210, 45%, 45%, 0.12);
    border-color: var(--sn-cat-server, hsl(210, 45%, 45%));
    color: var(--sn-cat-server, hsl(210, 45%, 45%));
  }
  .pg-mode-toggle[hidden] {
    display: none;
  }
  code-block {
    flex: 1;
    min-height: 0;
  }
`;
