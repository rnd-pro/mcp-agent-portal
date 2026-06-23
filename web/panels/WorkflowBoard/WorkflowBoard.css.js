export default /*css*/ `
:host,
pg-workflow-board {
  display: block;
  height: 100%;
  min-height: 0;
}

pg-workflow-board .wb-shell {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  background: var(--sn-panel-bg);
  color: var(--sn-text);
  font-family: var(--sn-font);
}

pg-workflow-board .wb-controls {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-height: 42px;
  padding: 8px 12px;
  border-block-end: 1px solid var(--sn-layout-border);
  flex-shrink: 0;
}

pg-workflow-board .wb-control-meta {
  display: flex;
  align-items: center;
  flex: 1 1 260px;
  flex-wrap: wrap;
  justify-content: flex-start;
  gap: 6px 8px;
  min-width: 0;
  color: var(--sn-text-dim);
  font-size: 11px;
}

pg-workflow-board .wb-control-actions {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  flex: 0 0 auto;
  flex-wrap: wrap;
  gap: 6px;
  min-width: 0;
}

pg-workflow-board .wb-control-meta sn-button,
pg-workflow-board .wb-control-actions sn-button {
  --sn-button-size: 28px;
  --sn-button-padding: 0;
  flex: 0 0 auto;
}

pg-workflow-board .wb-control-meta .material-symbols-outlined,
pg-workflow-board .wb-control-actions .material-symbols-outlined {
  font-size: 17px;
}

pg-workflow-board .wb-board-settings {
  position: relative;
}

pg-workflow-board .wb-board-settings-summary {
  display: inline-grid;
  place-items: center;
  width: 28px;
  height: 28px;
  border: 1px solid var(--sn-node-border);
  border-radius: var(--sn-button-radius, 6px);
  color: var(--sn-text-dim);
  cursor: pointer;
  list-style: none;
}

pg-workflow-board .wb-board-settings-summary::-webkit-details-marker {
  display: none;
}

pg-workflow-board .wb-board-settings-summary:hover,
pg-workflow-board .wb-board-settings-summary:focus-visible {
  color: var(--sn-node-selected);
  border-color: var(--sn-node-selected);
  outline: none;
}

pg-workflow-board .wb-board-settings-panel {
  position: absolute;
  inset-block-start: calc(100% + 6px);
  inset-inline-end: 0;
  z-index: 5;
  width: min(520px, calc(100vw - 96px));
  padding: 10px;
  border: 1px solid var(--sn-node-border);
  border-radius: var(--sn-card-radius);
  background: var(--sn-panel-bg);
  box-shadow: var(--sn-elevation-2, 0 10px 28px rgba(0, 0, 0, 0.28));
}

pg-workflow-board .wb-status {
  margin: 10px 16px 0;
  flex-shrink: 0;
}

pg-workflow-board .wb-board-readout {
  min-width: 0;
  flex: 1 1 130px;
  color: var(--sn-text-dim);
  font-size: 11px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

pg-workflow-board .wb-main {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 12px;
  min-height: 0;
  padding: 12px;
  flex: 1 1 auto;
}

pg-workflow-board .wb-board-region {
  min-width: 0;
  min-height: 0;
}

pg-workflow-board .wb-board-region {
  position: relative;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

pg-workflow-board .wb-board {
  flex: 1 1 auto;
  min-width: 0;
  min-height: 0;
  --sn-kanban-padding: 0 0 4px;
  --sn-kanban-card-hover-border: var(--sn-node-selected);
  --sn-kanban-header-min-height: 88px;
}

pg-workflow-board .wb-view-toggle {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  padding: 2px;
  border: 1px solid var(--sn-node-border);
  border-radius: var(--sn-button-radius, 8px);
  background: var(--sn-node-bg);
}

pg-workflow-board .wb-view-toggle-btn {
  --sn-button-size: 26px;
  --sn-button-padding: 0;
}

pg-workflow-board .wb-view-toggle-btn[aria-pressed="true"],
pg-workflow-board .wb-view-toggle-btn.is-active {
  --sn-button-bg: color-mix(in srgb, var(--sn-node-selected) 22%, transparent);
  color: var(--sn-node-selected);
}

pg-workflow-board .wb-graph-region {
  position: relative;
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  border: 1px solid var(--sn-node-border);
  border-radius: var(--sn-card-radius);
  background: var(--sn-node-bg);
}

pg-workflow-board .wb-graph-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  border-block-end: 1px solid var(--sn-layout-border);
  flex-shrink: 0;
}

pg-workflow-board .wb-graph-btn {
  --sn-button-size: 26px;
  --sn-button-padding: 0;
}

pg-workflow-board .wb-graph-stats {
  min-width: 0;
  color: var(--sn-text-dim);
  font-size: 11px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

pg-workflow-board .wb-graph-canvas {
  flex: 1 1 auto;
  min-width: 0;
  min-height: 0;
}

pg-workflow-board .wb-graph-empty {
  position: absolute;
  inset: 44px 0 0;
  display: grid;
  place-items: center;
  pointer-events: none;
}

pg-workflow-board .wb-chip {
  display: inline-flex;
  align-items: center;
  max-width: 100%;
  min-height: 19px;
  padding: 2px 6px;
  border: 1px solid var(--sn-node-border);
  border-radius: 999px;
  color: var(--sn-text-dim);
  font-size: 10px;
  font-weight: 600;
  line-height: 1.2;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

pg-workflow-board .wb-chip[data-kind="status"] {
  color: var(--sn-node-selected);
  border-color: color-mix(in srgb, var(--sn-node-selected) 42%, var(--sn-node-border));
}

pg-workflow-board .wb-chip[data-kind="warning"] {
  color: var(--sn-warning-color);
  border-color: color-mix(in srgb, var(--sn-warning-color) 50%, var(--sn-node-border));
}

pg-workflow-board .wb-chip[data-kind="error"] {
  color: var(--sn-danger-color);
  border-color: color-mix(in srgb, var(--sn-danger-color) 50%, var(--sn-node-border));
}

pg-workflow-board .wb-empty {
  min-height: 180px;
  border: 1px solid var(--sn-node-border);
  border-radius: var(--sn-card-radius);
  background: var(--sn-node-bg);
}

pg-workflow-board .wb-column-head {
  position: relative;
  display: grid;
  grid-column: 1 / -1;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 8px;
  min-width: 0;
  padding-inline-end: 30px;
}

pg-workflow-board .wb-column-copy {
  min-width: 0;
}

pg-workflow-board .wb-column-policy {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-block-start: 6px;
  min-width: 0;
}

pg-workflow-board .wb-column-tools {
  display: grid;
  grid-auto-flow: row;
  justify-items: end;
  gap: 6px;
}

pg-workflow-board .wb-action-row {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  min-width: 0;
}

pg-workflow-board .wb-settings-form {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 9px;
  margin-block-end: 10px;
}

pg-workflow-board .wb-setting-field {
  display: grid;
  gap: 4px;
  min-width: 0;
  color: var(--sn-text-dim);
  font-size: 11px;
}

pg-workflow-board .wb-setting-control {
  min-width: 0;
  min-height: 28px;
  padding: 4px 8px;
  border: 1px solid var(--sn-field-control-border, var(--sn-node-border));
  border-radius: var(--sn-field-control-radius, 6px);
  background: var(--sn-field-control-bg, var(--sn-panel-bg));
  color: var(--sn-text);
  font: inherit;
  font-size: 12px;
}

pg-workflow-board .wb-board-history {
  display: grid;
  gap: 5px;
  margin-block: 8px 10px;
  color: var(--sn-text-dim);
  font-size: 11px;
  line-height: 1.35;
}

pg-workflow-board .wb-board-history-row {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

pg-workflow-board .wb-board-history-row strong {
  min-width: max-content;
  color: var(--sn-text);
  font-weight: 650;
}

pg-workflow-board .wb-board-history-row span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

pg-workflow-board .wb-column-settings {
  grid-column: 1 / -1;
  min-width: 0;
  margin-block-start: 0;
}

pg-workflow-board .wb-column-settings:not([open]) {
  display: contents;
}

pg-workflow-board .wb-column-settings[open] {
  margin-block-start: 7px;
}

pg-workflow-board .wb-column-settings-summary {
  position: absolute;
  inset-block-start: 0;
  inset-inline-end: 0;
  display: inline-grid;
  place-items: center;
  width: 24px;
  height: 24px;
  padding: 0;
  border: 1px solid var(--sn-node-border);
  border-radius: 999px;
  color: var(--sn-text-dim);
  cursor: pointer;
  list-style: none;
}

pg-workflow-board .wb-column-settings-summary::-webkit-details-marker {
  display: none;
}

pg-workflow-board .wb-column-settings-summary:hover,
pg-workflow-board .wb-column-settings-summary:focus-visible {
  color: var(--sn-node-selected);
  border-color: var(--sn-node-selected);
  outline: none;
}

pg-workflow-board .wb-column-settings-summary .material-symbols-outlined {
  font-size: 15px;
}

pg-workflow-board .wb-column-settings .wb-settings-form {
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 6px;
  margin-block: 7px;
}

pg-workflow-board .wb-column-settings .wb-setting-field {
  gap: 3px;
  font-size: 10px;
}

pg-workflow-board .wb-column-settings .wb-setting-control {
  min-height: 26px;
  padding: 3px 6px;
  font-size: 11px;
}

pg-workflow-board .wb-action-row {
  align-items: center;
}

pg-workflow-board .wb-action-row sn-button {
  --sn-button-min-height: 28px;
  --sn-button-padding: 4px 9px;
  --sn-button-font-size: 11px;
}

pg-workflow-board [hidden] {
  display: none !important;
}

@media (max-width: 1180px) {
  pg-workflow-board .wb-main {
    grid-template-columns: minmax(0, 1fr);
    overflow: auto;
  }

  pg-workflow-board .wb-board-region {
    min-height: 380px;
  }
}

@media (max-width: 720px) {
  pg-workflow-board .wb-controls {
    align-items: flex-start;
    flex-direction: column;
  }

  pg-workflow-board .wb-control-meta {
    justify-content: flex-start;
    flex-wrap: wrap;
    width: 100%;
  }

  pg-workflow-board .wb-control-actions {
    justify-content: flex-start;
    width: 100%;
  }

  pg-workflow-board .wb-board-settings-panel {
    inset-inline: 0 auto;
    width: min(100%, calc(100vw - 40px));
  }

  pg-workflow-board .wb-settings-form {
    grid-template-columns: minmax(0, 1fr);
  }

  pg-workflow-board .wb-board {
    --sn-kanban-column-width: minmax(218px, 82vw);
  }
}

/* Resource-group accents: a categorical color per group (the glyph carries the distinction where the
   color does not apply); the border tints from the group color so it reads without shouting. */
sn-kanban-board .sn-kanban-chip[data-kind^="group-"] {
  font-weight: 600;
  border-color: color-mix(in srgb, currentColor 38%, var(--sn-node-border));
}
sn-kanban-board .sn-kanban-chip[data-kind="group-integrity"] { color: hsl(355 75% 62%); }
sn-kanban-board .sn-kanban-chip[data-kind="group-resilience"] { color: hsl(28 85% 58%); }
sn-kanban-board .sn-kanban-chip[data-kind="group-model"] { color: hsl(210 82% 64%); }
sn-kanban-board .sn-kanban-chip[data-kind="group-governance"] { color: hsl(265 70% 70%); }
sn-kanban-board .sn-kanban-chip[data-kind="group-collab-observability"] { color: hsl(175 62% 52%); }

/* Dependency degree: blocked-by (caution) vs unlocks (positive). */
sn-kanban-board .sn-kanban-chip[data-kind="dep-blocked"] {
  color: var(--sn-warning-color);
  border-color: color-mix(in srgb, var(--sn-warning-color) 46%, var(--sn-node-border));
}
sn-kanban-board .sn-kanban-chip[data-kind="dep-unlocks"] {
  color: var(--sn-success-color);
  border-color: color-mix(in srgb, var(--sn-success-color) 40%, var(--sn-node-border));
}
`;
