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
  sn-empty-state {
    padding: var(--sn-space-6);
    font-style: italic;
  }
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
  .pg-outline-title-icon {
    font-size: 14px;
  }
  .pg-outline-item {
    --sn-icon-font: 'Material Symbols Outlined';
    --sn-list-item-padding: 4px 8px;
    --sn-list-item-radius: 4px;
    --sn-list-item-label-font: var(--sn-font-mono);
    --sn-list-item-label-size: 11px;
    --sn-list-item-label-color: var(--sn-cat-server);
    --sn-list-item-description-display: none;
    --sn-list-item-icon-size: 13px;
    --sn-list-item-icon-color: var(--sn-cat-server);
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
  .pg-ctx-test {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 3px 0;
    font-size: 12px;
  }
  .pg-ctx-test-icon {
    font-size: 12px;
  }
  .pg-ctx-raw {
    font-size: 11px;
    color: var(--sn-text-dim);
  }
  .pg-pulse { animation: pulse 1.5s ease infinite; }
  @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
`;
