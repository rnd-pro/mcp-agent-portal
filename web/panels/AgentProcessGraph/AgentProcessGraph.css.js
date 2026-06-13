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
