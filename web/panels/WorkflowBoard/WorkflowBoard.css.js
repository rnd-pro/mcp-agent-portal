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
  background: var(--sn-sys-surface-panel);
  color: var(--sn-sys-on-surface);
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
  color: var(--sn-sys-on-surface-dim);
  font-size: 11px;
}

pg-workflow-board .wb-control-actions {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  flex: 0 0 auto;
  flex-wrap: wrap;
  gap: 10px;
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

/* U12: toolbar grouping. Related actions (mode toggle / destructive automation / routine
   maintenance) are wrapped by #groupToolbarControls into labeled groups that read as clusters
   instead of one flat row of 7 identical icon buttons. */
pg-workflow-board .wb-toolbar-group {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  padding: 2px;
  border: 1px solid var(--sn-sys-outline);
  border-radius: var(--sn-button-radius, 8px);
  background: var(--sn-sys-surface-panel);
}

/* Destructive automation (Drain/Stop) gets a quiet danger-tinted outline so it reads as separate
   in intent from routine maintenance (Import/Reconcile), without shouting via a filled color. */
pg-workflow-board .wb-toolbar-group-danger {
  border-color: color-mix(in oklch, var(--sn-sys-danger) 32%, var(--sn-sys-outline));
}

/* U12: visible pressed/active state for toggle-like toolbar buttons (Drain/Stop reflecting the
   current board mode), built from the shared state-layer mix — never a new hardcoded color. */
pg-workflow-board .wb-toolbar-group sn-button.is-active,
pg-workflow-board .wb-toolbar-group sn-button[aria-pressed="true"] {
  --sn-button-bg: color-mix(in oklch, var(--sn-sys-danger) var(--sn-sys-state-selected-mix), transparent);
  color: var(--sn-sys-danger);
}

/* U12: the one alarming signal (cards stuck in recovery) as its own visible warning flag ahead of
   the routine status text, instead of buried inside a truncating string. */
pg-workflow-board .wb-recovery-flag {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  flex: 0 0 auto;
  padding: 2px 8px;
  border: 1px solid color-mix(in oklch, var(--sn-sys-warning) 46%, var(--sn-sys-outline));
  border-radius: 999px;
  background: var(--sn-sys-warning-container);
  color: var(--sn-sys-on-warning-container);
  font-weight: 600;
  font-size: 11px;
  white-space: nowrap;
}

pg-workflow-board .wb-board-settings {
  position: relative;
}

pg-workflow-board .wb-board-settings-summary {
  display: inline-grid;
  place-items: center;
  width: 28px;
  height: 28px;
  border: 1px solid var(--sn-sys-outline);
  border-radius: var(--sn-button-radius, 6px);
  color: var(--sn-sys-on-surface-dim);
  cursor: pointer;
  list-style: none;
}

pg-workflow-board .wb-board-settings-summary::-webkit-details-marker {
  display: none;
}

pg-workflow-board .wb-board-settings-summary:hover,
pg-workflow-board .wb-board-settings-summary:focus-visible {
  color: var(--sn-sys-accent);
  border-color: var(--sn-sys-accent);
  outline: none;
}

pg-workflow-board .wb-board-settings-panel {
  position: absolute;
  inset-block-start: calc(100% + 6px);
  inset-inline-end: 0;
  z-index: 5;
  width: min(520px, calc(100vw - 96px));
  padding: 10px;
  border: 1px solid var(--sn-sys-outline);
  border-radius: var(--sn-card-radius);
  background: var(--sn-sys-surface-panel);
  box-shadow: var(--sn-elevation-2, var(--sn-sys-shadow-overlay));
}

pg-workflow-board .wb-status {
  margin: 10px 16px 0;
  flex-shrink: 0;
}

pg-workflow-board .wb-board-readout {
  min-width: 0;
  flex: 1 1 130px;
  color: var(--sn-sys-on-surface-dim);
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
  --sn-kanban-card-hover-border: var(--sn-sys-accent);
  --sn-kanban-header-min-height: 88px;
}

pg-workflow-board .wb-view-toggle {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  padding: 2px;
  border: 1px solid var(--sn-sys-outline);
  border-radius: var(--sn-button-radius, 8px);
  background: var(--sn-sys-surface-raised);
}

pg-workflow-board .wb-view-toggle-btn {
  --sn-button-size: 26px;
  --sn-button-padding: 0;
}

pg-workflow-board .wb-view-toggle-btn[aria-pressed="true"],
pg-workflow-board .wb-view-toggle-btn.is-active {
  --sn-button-bg: color-mix(in oklch, var(--sn-sys-accent) var(--sn-sys-state-selected-mix), transparent);
  color: var(--sn-sys-accent);
}

pg-workflow-board .wb-graph-region {
  position: relative;
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  border: 1px solid var(--sn-sys-outline);
  border-radius: var(--sn-card-radius);
  background: var(--sn-sys-surface-raised);
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
  color: var(--sn-sys-on-surface-dim);
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
  gap: 4px;
  max-width: 100%;
  min-height: 19px;
  padding: 2px 6px;
  border: 1px solid var(--sn-sys-outline);
  border-radius: 999px;
  color: var(--sn-sys-on-surface-dim);
  font-size: 10px;
  font-weight: 600;
  line-height: 1.2;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

pg-workflow-board .wb-chip .material-symbols-outlined {
  font-size: 12px;
}

/* U09/U15: the column-header automation indicator carries a filled container per kind (status =
   gated, warning = auto) so its meaning does not rely on color alone — it already pairs an icon
   (bolt/checklist/pan_tool) and label text from automationSummary(). */
pg-workflow-board .wb-chip[data-kind="status"] {
  border-color: color-mix(in oklch, var(--sn-sys-info) 46%, var(--sn-sys-outline));
  background: var(--sn-sys-info-container);
  color: var(--sn-sys-on-info-container);
}

pg-workflow-board .wb-chip[data-kind="warning"] {
  border-color: color-mix(in oklch, var(--sn-sys-warning) 50%, var(--sn-sys-outline));
  background: var(--sn-sys-warning-container);
  color: var(--sn-sys-on-warning-container);
}

pg-workflow-board .wb-chip[data-kind="error"] {
  border-color: color-mix(in oklch, var(--sn-sys-danger) 50%, var(--sn-sys-outline));
  background: var(--sn-sys-danger-container);
  color: var(--sn-sys-on-danger-container);
}

pg-workflow-board .wb-empty {
  min-height: 180px;
  border: 1px solid var(--sn-sys-outline);
  border-radius: var(--sn-card-radius);
  background: var(--sn-sys-surface-raised);
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
  color: var(--sn-sys-on-surface-dim);
  font-size: 11px;
}

pg-workflow-board .wb-setting-control {
  min-width: 0;
  min-height: 28px;
  padding: 4px 8px;
  border: 1px solid var(--sn-field-control-border, var(--sn-sys-outline));
  border-radius: var(--sn-field-control-radius, 6px);
  background: var(--sn-field-control-bg, var(--sn-sys-surface-panel));
  color: var(--sn-sys-on-surface);
  font: inherit;
  font-size: 12px;
}

pg-workflow-board .wb-board-history {
  display: grid;
  gap: 5px;
  margin-block: 8px 10px;
  color: var(--sn-sys-on-surface-dim);
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
  color: var(--sn-sys-on-surface);
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
  border: 1px solid var(--sn-sys-outline);
  border-radius: 999px;
  color: var(--sn-sys-on-surface-dim);
  cursor: pointer;
  list-style: none;
}

pg-workflow-board .wb-column-settings-summary::-webkit-details-marker {
  display: none;
}

pg-workflow-board .wb-column-settings-summary:hover,
pg-workflow-board .wb-column-settings-summary:focus-visible {
  color: var(--sn-sys-accent);
  border-color: var(--sn-sys-accent);
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

/* U14: resource-group accents. .sn-kanban-chip[data-kind="..."] plus the chip icon field are the
   documented public extension contract (icon glyph is the non-color signal per group; the group
   name is also in the chip label text, so the group never depends on color alone — U15). Group
   hues resolve through symbiote-ui T2 system roles instead of hardcoded hsl()/hex literals: no two
   groups share a role, spanning the danger/warning/accent/success/info system-role families so
   each stays visually distinct without inventing new domain-palette colors from this panel. */
sn-kanban-board .sn-kanban-chip[data-kind^="group-"] {
  font-weight: 600;
  border-color: color-mix(in oklch, currentColor 38%, var(--sn-sys-outline));
}
sn-kanban-board .sn-kanban-chip[data-kind="group-integrity"] { color: var(--sn-sys-danger); }
sn-kanban-board .sn-kanban-chip[data-kind="group-resilience"] { color: var(--sn-sys-warning); }
sn-kanban-board .sn-kanban-chip[data-kind="group-model"] { color: var(--sn-sys-info); }
sn-kanban-board .sn-kanban-chip[data-kind="group-governance"] { color: var(--sn-sys-accent); }
sn-kanban-board .sn-kanban-chip[data-kind="group-collab-observability"] { color: var(--sn-sys-success); }

/* Dependency degree: blocked-by (caution) vs unlocks (positive) — public data-kind contract,
   T2-role colors, paired with the lock/lock_open icon field so kind is never color-only. */
sn-kanban-board .sn-kanban-chip[data-kind="dep-blocked"] {
  color: var(--sn-sys-warning);
  border-color: color-mix(in oklch, var(--sn-sys-warning) 46%, var(--sn-sys-outline));
}
sn-kanban-board .sn-kanban-chip[data-kind="dep-unlocks"] {
  color: var(--sn-sys-success);
  border-color: color-mix(in oklch, var(--sn-sys-success) 40%, var(--sn-sys-outline));
}

/* Quality-audit verdict: a passed audit (success) vs. a rejected audit routed back as rework (danger). */
sn-kanban-board .sn-kanban-chip[data-kind="audit-pass"] {
  color: var(--sn-sys-success);
  border-color: color-mix(in oklch, var(--sn-sys-success) 46%, var(--sn-sys-outline));
}
sn-kanban-board .sn-kanban-chip[data-kind="audit-reject"] {
  color: var(--sn-sys-danger);
  border-color: color-mix(in oklch, var(--sn-sys-danger) 50%, var(--sn-sys-outline));
}
`;
