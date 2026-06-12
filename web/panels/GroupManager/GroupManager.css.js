export default `
:host,
pg-group-manager {
  display: block;
}

.gm-root {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--sn-panel-bg);
  color: var(--sn-text);
}

.gm-toolbar {
  height: 48px;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 14px;
  border-bottom: 1px solid var(--sn-node-border);
  background: var(--sn-bg);
  flex-shrink: 0;
}

.gm-status {
  font-size: 12px;
  color: var(--sn-success-color);
  margin-left: auto;
}

.gm-title {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--sn-text);
  font-size: 14px;
  font-weight: 600;
}

.gm-title .material-symbols-outlined {
  color: var(--sn-node-selected);
}

.gm-board {
  flex: 1;
  display: grid;
  grid-auto-flow: column;
  grid-auto-columns: minmax(248px, 312px);
  grid-template-rows: auto auto auto minmax(0, 1fr) auto;
  gap: 12px;
  overflow: auto;
  padding: 12px;
  align-items: stretch;
}

.gm-unassigned {
  display: grid;
  grid-template-columns: 128px minmax(0, 1fr);
  gap: 10px;
  align-items: center;
  padding: 10px 12px;
  border-bottom: 1px solid var(--sn-node-border);
  background: var(--sn-bg);
}

.gm-column {
  min-height: 100%;
  display: grid;
  grid-template-rows: subgrid;
  grid-row: span 5;
  background: var(--sn-bg);
  border: 1px solid var(--sn-node-border);
  border-radius: 8px;
  overflow: hidden;
}

.gm-column-head {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 12px;
  border-bottom: 1px solid var(--sn-node-border);
  background: var(--sn-node-bg);
}

.gm-column-head h2 {
  margin: 0 0 4px 0;
  font-size: 13px;
  font-weight: 650;
  color: var(--sn-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.gm-description {
  margin: 0 0 8px;
  color: var(--sn-text-dim);
  font-size: 11px;
  line-height: 1.35;
}

.gm-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.gm-meta span {
  font-size: 10px;
  line-height: 16px;
  color: var(--sn-text-dim);
  border: 1px solid var(--sn-node-border);
  border-radius: 999px;
  padding: 0 6px;
}

.gm-column-delete {
  margin-left: auto;
}

.gm-column-delete[data-delete-armed="true"] {
  color: var(--sn-danger-color);
  background: color-mix(in srgb, var(--sn-danger-color) 10%, transparent);
  border-color: color-mix(in srgb, var(--sn-danger-color) 42%, var(--sn-node-border));
}

.gm-column-config {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 72px;
  gap: 8px;
  padding: 10px 12px;
  border-bottom: 1px solid var(--sn-node-border);
}

.gm-agent-section {
  padding: 10px;
  border-bottom: 1px solid var(--sn-node-border);
  background: color-mix(in srgb, var(--sn-node-bg) 72%, transparent);
}

.gm-section-label {
  margin-bottom: 8px;
  color: var(--sn-text-dim);
  font-size: 10px;
  font-weight: 650;
  letter-spacing: 0;
  text-transform: uppercase;
}

.gm-agent-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-height: 34px;
  border-radius: 7px;
  transition: background-color 0.12s, outline-color 0.12s;
}

.gm-agent-list-pool {
  flex-direction: row;
  flex-wrap: wrap;
  min-height: 0;
}

.gm-agent-list.drag-over {
  background: color-mix(in srgb, var(--sn-node-selected) 14%, transparent);
  outline: 1px dashed color-mix(in srgb, var(--sn-node-selected) 64%, transparent);
  outline-offset: 4px;
}

.gm-agent-card {
  width: 100%;
  box-sizing: border-box;
  min-width: 0;
  max-width: 100%;
  display: grid;
  grid-template-columns: 32px minmax(0, 1fr) 28px;
  gap: 8px;
  align-items: center;
  padding: 8px;
  border: 1px solid var(--sn-node-border);
  border-radius: 8px;
  color: var(--sn-text-dim);
  background: var(--sn-node-bg);
  cursor: grab;
}

.gm-agent-list-pool .gm-agent-card {
  flex: 0 1 266px;
}

.gm-agent-card:active {
  cursor: grabbing;
}

.gm-agent-card[data-default-chat="true"] {
  border-color: color-mix(in srgb, var(--sn-node-selected) 52%, var(--sn-node-border));
}

.gm-agent-icon {
  width: 32px;
  height: 32px;
  display: grid;
  place-items: center;
  border-radius: 6px;
  background: color-mix(in srgb, var(--gm-agent-color, var(--sn-node-selected)) 14%, var(--sn-panel-bg));
  color: var(--gm-agent-color, var(--sn-node-selected));
}

.gm-agent-icon .material-symbols-outlined {
  font-size: 18px;
}

.gm-agent-main {
  min-width: 0;
}

.gm-agent-slug {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--sn-text);
  font-size: 12px;
  line-height: 1.25;
  font-weight: 600;
}

.gm-agent-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 3px;
}

.gm-agent-meta span {
  color: var(--sn-text-dim);
  font-size: 10px;
  line-height: 14px;
}

.gm-agent-default {
  padding: 0 5px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--sn-node-selected) 18%, transparent);
  color: var(--sn-node-selected) !important;
}

.gm-agent-edit {
  justify-self: end;
}

.gm-agent-empty {
  width: 100%;
  padding: 8px;
  border: 1px dashed var(--sn-node-border);
  border-radius: 7px;
  color: var(--sn-text-dim);
  font-size: 11px;
  text-align: center;
}

.gm-column-config label,
.gm-add-profile {
  min-width: 0;
}

.gm-column-config span {
  display: block;
  margin-bottom: 4px;
  color: var(--sn-text-dim);
  font-size: 10px;
  text-transform: uppercase;
}

.gm-column-config select,
.gm-column-config input,
.gm-add-profile select {
  width: 100%;
  min-width: 0;
  background: var(--sn-panel-bg);
  color: var(--sn-text);
  border: 1px solid var(--sn-node-border);
  border-radius: 6px;
  font: inherit;
  font-size: 12px;
  padding: 6px 8px;
}

.gm-profile-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-height: 0;
  padding: 10px;
  overflow-y: auto;
  transition: background-color 0.12s;
}

.gm-profile-list.drag-over {
  background: color-mix(in srgb, var(--sn-node-selected) 14%, transparent);
}

.gm-profile {
  display: grid;
  grid-template-columns: 32px minmax(0, 1fr) 28px;
  gap: 8px;
  align-items: center;
  padding: 8px;
  background: var(--sn-node-bg);
  border: 1px solid var(--sn-node-border);
  border-radius: 8px;
  cursor: grab;
}

.gm-profile:active {
  cursor: grabbing;
}

.gm-profile.inherited {
  opacity: 0.72;
  grid-template-columns: 32px minmax(0, 1fr);
  cursor: default;
}

.gm-profile.drop-before {
  box-shadow: 0 -2px 0 var(--sn-node-selected);
}

.gm-profile.drop-after {
  box-shadow: 0 2px 0 var(--sn-node-selected);
}

.gm-profile-icon {
  width: 32px;
  height: 32px;
  display: grid;
  place-items: center;
  border-radius: 6px;
  background: var(--sn-panel-bg);
  color: var(--sn-text-dim);
}

.gm-profile-icon .material-symbols-outlined {
  font-size: 18px;
}

.gm-profile-main {
  min-width: 0;
}

.gm-profile-provider {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 11px;
  color: var(--sn-text-dim);
  text-transform: uppercase;
}

.gm-profile-model {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
  color: var(--sn-text);
}

.gm-profile-meta-line {
  margin-top: 3px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--sn-text-dim);
  font-size: 10px;
  line-height: 14px;
}

.gm-add-profile {
  display: grid;
  grid-template-columns: 78px minmax(0, 1fr) 28px;
  gap: 6px;
  padding: 10px;
  border-top: 1px solid var(--sn-node-border);
  background: var(--sn-node-bg);
}

.gm-add-profile[data-provider="codex"] [data-add-reasoning] {
  grid-column: 2;
}

.gm-add-profile[data-provider="codex"] [data-add-profile] {
  grid-column: 3;
  grid-row: 1 / span 2;
}

.gm-add-profile:not([data-provider="codex"]) [data-add-reasoning] {
  display: none;
}
`;
