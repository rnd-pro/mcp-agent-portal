export default `
:host {
  display: block;
}

  pg-ctx-panel {
    display: flex;
    flex-direction: column;
    height: 100%;
    overflow-y: auto;
    font-size: 12px;
    padding: 0;
    font-family: var(--sn-font);
  }
  .pg-ctx-outline { padding: 0; }
  .pg-ctx-body { padding: 8px; }
  .pg-outline-section {
    border-bottom: 1px solid var(--sn-node-border);
    padding: 8px;
  }
  .pg-outline-title {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 11px;
    font-weight: 600;
    color: var(--sn-text-dim);
    padding: 4px 4px 6px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }
  .pg-outline-item {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 4px 8px;
    cursor: default;
    border-radius: 4px;
    font-family: var(--sn-font-mono);
    font-size: 11px;
    color: var(--sn-cat-server);
    transition: background 80ms ease;
  }
  .pg-outline-item:hover {
    background: var(--sn-node-hover);
  }
  .pg-ctx-sig {
    font-family: var(--sn-font-mono);
    font-size: 11px;
    padding: 6px 8px;
    margin: 4px 0;
    background: var(--sn-bg);
    border-radius: 4px;
    border-left: 3px solid var(--sn-cat-server);
    color: var(--sn-text-dim);
  }
  .pg-ctx-desc { padding: 4px 0; color: var(--sn-text); }
  .pg-ctx-test { padding: 3px 0; font-size: 12px; }
  .pg-ctx-raw { font-size: 11px; color: var(--sn-text-dim); }
  .pg-placeholder { color: var(--sn-text-dim); text-align:center; padding:30px; font-style:italic; }
  .pg-pulse { animation: pulse 1.5s ease infinite; }
  @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
`;
