export default `
:host {
  display: block;
  height: 100%;
  min-height: 0;
}

graph-explorer-shell,
canvas-graph {
  height: 100%;
}

.apg-toolbar {
  min-width: 0;
}

.apg-title {
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  color: var(--sn-text-dim);
  font-family: var(--sn-font-mono);
  font-size: 10px;
  text-transform: uppercase;
}

.apg-layout-picker {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 5px;
  color: var(--sn-text-dim);
  font-family: var(--sn-font-mono);
  font-size: 10px;
  text-transform: uppercase;
}

.apg-layout-picker span {
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.apg-layout-picker select {
  width: 104px;
  max-width: 32vw;
  min-height: var(--sn-graph-explorer-button-min-height, 28px);
  padding: 3px 24px 3px 8px;
  border: 1px solid var(--sn-node-border);
  border-radius: var(--sn-graph-explorer-button-radius, 3px);
  background: var(--sn-node-bg);
  color: var(--sn-text);
  font-family: var(--sn-font);
  font-size: var(--sn-graph-explorer-button-size, 10px);
}

.apg-layout-picker select:focus-visible {
  outline: 2px solid var(--sn-node-selected);
  outline-offset: 2px;
}

.apg-empty {
  position: absolute;
  inset: 48px 12px 44px;
  display: grid;
  place-content: center;
  gap: 8px;
  color: var(--sn-text-dim);
  font-family: var(--sn-font-mono);
  font-size: 11px;
  text-align: center;
  pointer-events: none;
}

.apg-empty .material-symbols-outlined {
  font-size: 22px;
  color: var(--sn-text-muted);
}

.apg-empty[hidden] {
  display: none;
}

.apg-stats {
  min-width: 0;
}
`;
