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

pg-workflow-board .wb-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding: 14px 16px;
  border-block-end: 1px solid var(--sn-layout-border);
  background: var(--sn-node-header-bg);
  flex-shrink: 0;
}

pg-workflow-board .wb-heading {
  min-width: 0;
}

pg-workflow-board .wb-eyebrow {
  color: var(--sn-text-dim);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0;
  text-transform: uppercase;
}

pg-workflow-board .wb-heading h2 {
  margin: 2px 0 4px;
  font-size: 18px;
  font-weight: 650;
  line-height: 1.15;
}

pg-workflow-board .wb-heading p {
  margin: 0;
  color: var(--sn-text-dim);
  font-size: 12px;
  line-height: 1.35;
}

pg-workflow-board .wb-header-meta {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  min-width: max-content;
  color: var(--sn-text-dim);
  font-size: 11px;
}

pg-workflow-board .wb-header-meta sn-button {
  --sn-button-size: 28px;
  --sn-button-padding: 0;
}

pg-workflow-board .wb-header-meta .material-symbols-outlined {
  font-size: 17px;
}

pg-workflow-board .wb-status {
  margin: 10px 16px 0;
  flex-shrink: 0;
}

pg-workflow-board .wb-summary {
  display: grid;
  grid-template-columns: repeat(6, minmax(96px, 1fr));
  gap: 8px;
  padding: 10px 12px 0;
  flex-shrink: 0;
}

pg-workflow-board .wb-counter {
  min-width: 0;
  padding: 8px 10px;
  border: 1px solid var(--sn-node-border);
  border-radius: var(--sn-card-radius);
  background: var(--sn-node-bg);
}

pg-workflow-board .wb-counter-label,
pg-workflow-board .wb-card-meta,
pg-workflow-board .wb-card-footer,
pg-workflow-board .wb-inspector-meta,
pg-workflow-board .wb-section-note {
  color: var(--sn-text-dim);
  font-size: 11px;
  line-height: 1.35;
}

pg-workflow-board .wb-counter-value {
  display: block;
  margin-block-start: 2px;
  color: var(--sn-text);
  font-size: 20px;
  font-weight: 700;
  line-height: 1.1;
}

pg-workflow-board .wb-filters {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-height: 42px;
  padding: 8px 12px;
  border-block-end: 1px solid var(--sn-layout-border);
  flex-shrink: 0;
}

pg-workflow-board .wb-filter {
  display: grid;
  grid-template-columns: auto minmax(160px, 260px);
  align-items: center;
  gap: 8px;
  min-width: 0;
  color: var(--sn-text-dim);
  font-size: 11px;
}

pg-workflow-board .wb-filter select,
pg-workflow-board .wb-move-select {
  min-width: 0;
  min-height: 28px;
  padding: 4px 8px;
  border: 1px solid var(--sn-field-control-border, var(--sn-node-border));
  border-radius: var(--sn-field-control-radius, 6px);
  background: var(--sn-field-control-bg, var(--sn-node-bg));
  color: var(--sn-text);
  font: inherit;
  font-size: 12px;
}

pg-workflow-board .wb-filter-readout {
  min-width: 0;
  color: var(--sn-text-dim);
  font-size: 11px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

pg-workflow-board .wb-main {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(300px, 360px);
  gap: 12px;
  min-height: 0;
  padding: 12px;
  flex: 1 1 auto;
}

pg-workflow-board .wb-board-region,
pg-workflow-board .wb-inspector {
  min-width: 0;
  min-height: 0;
}

pg-workflow-board .wb-board-region {
  position: relative;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

pg-workflow-board .wb-columns {
  display: grid;
  grid-auto-flow: column;
  grid-auto-columns: minmax(232px, 286px);
  gap: 10px;
  min-height: 0;
  flex: 1 1 auto;
  overflow: auto;
  padding-block-end: 4px;
}

pg-workflow-board .wb-column {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 240px;
  border: 1px solid var(--sn-node-border);
  border-radius: var(--sn-card-radius);
  background: var(--sn-node-bg);
  overflow: hidden;
}

pg-workflow-board .wb-column-header {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 8px;
  min-height: 54px;
  padding: 9px 10px;
  border-block-end: 1px solid var(--sn-node-border);
  background: var(--sn-node-header-bg);
}

pg-workflow-board .wb-column-title {
  min-width: 0;
  color: var(--sn-text);
  font-size: 13px;
  font-weight: 650;
  line-height: 1.25;
}

pg-workflow-board .wb-column-description {
  margin-block-start: 3px;
  color: var(--sn-text-dim);
  font-size: 11px;
  line-height: 1.3;
}

pg-workflow-board .wb-column-count {
  align-self: start;
  min-width: 24px;
  padding: 2px 7px;
  border: 1px solid var(--sn-node-border);
  border-radius: 999px;
  color: var(--sn-text-dim);
  font-size: 11px;
  line-height: 1.4;
  text-align: center;
}

pg-workflow-board .wb-card-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-height: 0;
  padding: 8px;
  overflow: auto;
}

pg-workflow-board .wb-card {
  display: grid;
  grid-template-rows: auto auto 1fr auto;
  gap: 7px;
  width: 100%;
  min-height: 118px;
  padding: 9px;
  border: 1px solid var(--sn-node-border);
  border-radius: 7px;
  background: var(--sn-panel-bg);
  color: var(--sn-text);
  font: inherit;
  text-align: start;
  cursor: pointer;
  transition: border-color 0.15s, background 0.15s, transform 0.15s;
}

pg-workflow-board .wb-card:hover,
pg-workflow-board .wb-card:focus-visible {
  border-color: var(--sn-node-selected);
  background: var(--sn-node-hover);
  outline: none;
}

pg-workflow-board .wb-card[aria-selected="true"] {
  border-color: var(--sn-node-selected);
  box-shadow: inset 3px 0 0 var(--sn-node-selected);
}

pg-workflow-board .wb-card-title {
  min-width: 0;
  color: var(--sn-text);
  font-size: 12px;
  font-weight: 650;
  line-height: 1.3;
  overflow-wrap: anywhere;
}

pg-workflow-board .wb-card-summary {
  min-width: 0;
  color: var(--sn-text-dim);
  font-size: 11px;
  line-height: 1.35;
  overflow: hidden;
}

pg-workflow-board .wb-card-meta,
pg-workflow-board .wb-card-footer {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 5px;
  min-width: 0;
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

pg-workflow-board .wb-card-action {
  margin-inline-start: auto;
  --sn-button-size: 24px;
  --sn-button-padding: 0;
  --sn-button-radius: 6px;
}

pg-workflow-board .wb-card-action .material-symbols-outlined {
  font-size: 15px;
}

pg-workflow-board .wb-column-empty {
  margin: 8px;
  padding: 16px 10px;
  border: 1px dashed var(--sn-node-border);
  border-radius: 7px;
  color: var(--sn-text-dim);
  font-size: 11px;
  line-height: 1.35;
  text-align: center;
}

pg-workflow-board .wb-empty {
  min-height: 180px;
  border: 1px solid var(--sn-node-border);
  border-radius: var(--sn-card-radius);
  background: var(--sn-node-bg);
}

pg-workflow-board .wb-inspector {
  display: flex;
  flex-direction: column;
  border: 1px solid var(--sn-node-border);
  border-radius: var(--sn-card-radius);
  background: var(--sn-node-bg);
  overflow: hidden;
}

pg-workflow-board .wb-inspector-scroll {
  min-height: 0;
  overflow: auto;
}

pg-workflow-board .wb-inspector-head {
  padding: 12px;
  border-block-end: 1px solid var(--sn-node-border);
  background: var(--sn-node-header-bg);
}

pg-workflow-board .wb-inspector-title {
  margin: 0;
  color: var(--sn-text);
  font-size: 15px;
  font-weight: 650;
  line-height: 1.25;
  overflow-wrap: anywhere;
}

pg-workflow-board .wb-inspector-summary {
  margin: 7px 0 0;
  color: var(--sn-text-dim);
  font-size: 12px;
  line-height: 1.4;
}

pg-workflow-board .wb-inspector-section {
  padding: 11px 12px;
  border-block-end: 1px solid var(--sn-node-border);
}

pg-workflow-board .wb-inspector-section:last-child {
  border-block-end: 0;
}

pg-workflow-board .wb-section-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-block-end: 8px;
  color: var(--sn-text);
  font-size: 12px;
  font-weight: 650;
  line-height: 1.3;
}

pg-workflow-board .wb-detail-grid {
  display: grid;
  grid-template-columns: minmax(78px, auto) minmax(0, 1fr);
  gap: 6px 10px;
  font-size: 11px;
  line-height: 1.35;
}

pg-workflow-board .wb-detail-grid dt {
  color: var(--sn-text-dim);
}

pg-workflow-board .wb-detail-grid dd {
  min-width: 0;
  margin: 0;
  color: var(--sn-text);
  overflow-wrap: anywhere;
}

pg-workflow-board .wb-chip-list,
pg-workflow-board .wb-action-row {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  min-width: 0;
}

pg-workflow-board .wb-action-row {
  align-items: center;
}

pg-workflow-board .wb-action-row sn-button {
  --sn-button-min-height: 28px;
  --sn-button-padding: 4px 9px;
  --sn-button-font-size: 11px;
}

pg-workflow-board .wb-list {
  display: flex;
  flex-direction: column;
  gap: 7px;
  margin: 0;
  padding: 0;
  list-style: none;
}

pg-workflow-board .wb-list-item {
  display: grid;
  gap: 2px;
  min-width: 0;
  padding: 7px;
  border: 1px solid var(--sn-node-border);
  border-radius: 6px;
  background: var(--sn-panel-bg);
  color: var(--sn-text);
  font-size: 11px;
  line-height: 1.35;
}

pg-workflow-board .wb-list-item strong,
pg-workflow-board .wb-list-item span {
  min-width: 0;
  overflow-wrap: anywhere;
}

pg-workflow-board .wb-list-item span {
  color: var(--sn-text-dim);
}

pg-workflow-board .wb-inspector-empty {
  margin: auto;
  padding: 18px;
}

pg-workflow-board [hidden] {
  display: none !important;
}

@media (max-width: 1180px) {
  pg-workflow-board .wb-summary {
    grid-template-columns: repeat(3, minmax(100px, 1fr));
  }

  pg-workflow-board .wb-main {
    grid-template-columns: minmax(0, 1fr);
    overflow: auto;
  }

  pg-workflow-board .wb-board-region {
    min-height: 380px;
  }

  pg-workflow-board .wb-inspector {
    min-height: 320px;
  }
}

@media (max-width: 720px) {
  pg-workflow-board .wb-header,
  pg-workflow-board .wb-filters {
    align-items: flex-start;
    flex-direction: column;
  }

  pg-workflow-board .wb-header-meta {
    justify-content: flex-start;
    flex-wrap: wrap;
    min-width: 0;
  }

  pg-workflow-board .wb-summary {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  pg-workflow-board .wb-filter {
    grid-template-columns: minmax(0, 1fr);
    width: 100%;
  }

  pg-workflow-board .wb-filter select {
    width: 100%;
  }

  pg-workflow-board .wb-columns {
    grid-auto-columns: minmax(218px, 82vw);
  }
}
`;
