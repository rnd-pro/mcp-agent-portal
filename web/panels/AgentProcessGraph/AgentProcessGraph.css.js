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

.apg-map-summary {
  position: absolute;
  inset-block-start: 56px;
  inset-inline-end: 12px;
  display: grid;
  gap: 8px;
  inline-size: min(360px, calc(100% - 24px));
  max-block-size: calc(100% - 112px);
  overflow: auto;
  padding: 10px;
  border: 1px solid var(--sn-node-border);
  border-radius: var(--sn-node-radius, 6px);
  background: color-mix(in oklab, var(--sn-panel-bg) 94%, transparent);
  box-shadow: var(--sn-shadow-sm);
  color: var(--sn-text);
  font-size: 11px;
}

.apg-map-summary[hidden] {
  display: none;
}

.apg-map-summary-head {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 6px;
}

.apg-map-summary-metric {
  display: grid;
  gap: 2px;
  min-width: 0;
  padding: 6px;
  border: 1px solid var(--sn-border);
  border-radius: 4px;
  background: var(--sn-node-bg);
}

.apg-map-summary-metric strong,
.apg-map-summary-metric span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.apg-map-summary-metric strong {
  font-family: var(--sn-font-mono);
  font-size: 12px;
}

.apg-map-summary-metric span {
  color: var(--sn-text-dim);
  font-family: var(--sn-font-mono);
  font-size: 9px;
  text-transform: uppercase;
}

.apg-map-summary-error {
  padding: 6px 8px;
  border: 1px solid color-mix(in oklab, #d64545 56%, var(--sn-border));
  border-radius: 4px;
  background: color-mix(in oklab, #d64545 12%, var(--sn-panel-bg));
  color: var(--sn-text);
}

.apg-map-summary-list {
  display: grid;
  gap: 4px;
}

.apg-map-summary-row {
  overflow: hidden;
  padding: 5px 6px;
  border-radius: 4px;
  background: var(--sn-surface-hover);
  color: var(--sn-text);
  font-family: var(--sn-font-mono);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.apg-map-summary-hints {
  display: grid;
  gap: 4px;
}

.apg-map-summary-hint {
  display: grid;
  gap: 2px;
  min-inline-size: 0;
  overflow: hidden;
  padding: 4px 6px;
  border: 1px solid var(--sn-border);
  border-radius: 4px;
  background: var(--sn-node-bg);
  color: var(--sn-text-dim);
}

.apg-map-summary-hint-title,
.apg-map-summary-hint-prompt {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.apg-map-summary-hint-title {
  color: var(--sn-text);
  font-family: var(--sn-font-mono);
}

.apg-map-summary-hint-prompt {
  color: var(--sn-text-dim);
}

.apg-stats {
  min-width: 0;
}
`;
