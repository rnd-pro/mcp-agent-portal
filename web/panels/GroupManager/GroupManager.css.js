export default `
:host,
pg-group-manager {
  display: block;
}

.gm-root {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--sn-sys-surface-panel);
  color: var(--sn-sys-on-surface);
}

.gm-toolbar {
  height: 48px;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 14px;
  border-bottom: 1px solid var(--sn-sys-outline);
  background: var(--sn-sys-surface);
  flex-shrink: 0;
}

.gm-status {
  font-size: 12px;
  color: var(--sn-sys-success);
  margin-left: auto;
}

.gm-title {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--sn-sys-on-surface);
  font-size: 14px;
  font-weight: 600;
}

.gm-title .material-symbols-outlined {
  color: var(--sn-sys-accent);
}

.gm-board {
  flex: 1;
  min-height: 0;
  --sn-kanban-column-width: minmax(248px, 312px);
  --sn-kanban-columns-height: max-content;
  --sn-kanban-columns-min-height: 100%;
  --sn-kanban-columns-align: stretch;
  --sn-kanban-column-min-height: 100%;
  --sn-kanban-gap: 12px;
  --sn-kanban-padding: 12px;
  --sn-kanban-header-padding: 0;
  --sn-kanban-header-min-height: 0;
  --sn-kanban-column-bg: var(--sn-sys-surface);
}

.gm-unassigned {
  display: grid;
  grid-template-columns: 128px minmax(0, 1fr);
  gap: 10px;
  align-items: center;
  padding: 10px 12px;
  border-bottom: 1px solid var(--sn-sys-outline);
  background: var(--sn-sys-surface);
}

.gm-board .sn-kanban-column-header {
  display: block;
}

.gm-board .sn-kanban-column-body {
  display: grid;
  grid-template-rows: auto auto minmax(0, 1fr) auto;
}

.gm-column-head {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 12px;
  border-bottom: 1px solid var(--sn-sys-outline);
  background: var(--sn-sys-surface-raised);
}

.gm-column-head h2 {
  margin: 0 0 4px 0;
  font-size: 13px;
  font-weight: 650;
  color: var(--sn-sys-on-surface);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.gm-description {
  margin: 0 0 8px;
  color: var(--sn-sys-on-surface-dim);
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
  color: var(--sn-sys-on-surface-dim);
  border: 1px solid var(--sn-sys-outline);
  border-radius: 999px;
  padding: 0 6px;
}

.gm-column-delete {
  margin-left: auto;
}

.gm-column-delete[data-delete-armed="true"] {
  color: var(--sn-sys-danger);
  background: color-mix(in srgb, var(--sn-sys-danger) 10%, transparent);
  border-color: color-mix(in srgb, var(--sn-sys-danger) 42%, var(--sn-sys-outline));
}

.gm-column-config {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 72px;
  gap: 8px;
  padding: 10px 12px;
  border-bottom: 1px solid var(--sn-sys-outline);
}

.gm-agent-section {
  padding: 10px;
  border-bottom: 1px solid var(--sn-sys-outline);
  background: color-mix(in srgb, var(--sn-sys-surface-raised) 72%, transparent);
}

.gm-section-label {
  margin-bottom: 8px;
  color: var(--sn-sys-on-surface-dim);
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
  background: color-mix(in srgb, var(--sn-sys-accent) 14%, transparent);
  outline: 1px dashed color-mix(in srgb, var(--sn-sys-accent) 64%, transparent);
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
  border: 1px solid var(--sn-sys-outline);
  border-radius: 8px;
  color: var(--sn-sys-on-surface-dim);
  background: var(--sn-sys-surface-raised);
  cursor: grab;
}

.gm-agent-list-pool .gm-agent-card {
  flex: 0 1 266px;
}

.gm-agent-card:active {
  cursor: grabbing;
}

.gm-agent-card[data-default-chat="true"] {
  border-color: color-mix(in srgb, var(--sn-sys-accent) 52%, var(--sn-sys-outline));
}

.gm-agent-icon {
  width: 32px;
  height: 32px;
  display: grid;
  place-items: center;
  border-radius: 6px;
  background: color-mix(in srgb, var(--gm-agent-color, var(--sn-sys-accent)) 14%, var(--sn-sys-surface-panel));
  color: var(--gm-agent-color, var(--sn-sys-accent));
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
  color: var(--sn-sys-on-surface);
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
  color: var(--sn-sys-on-surface-dim);
  font-size: 10px;
  line-height: 14px;
}

.gm-agent-default {
  padding: 0 5px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--sn-sys-accent) 18%, transparent);
  color: var(--sn-sys-accent) !important;
}

.gm-agent-edit {
  justify-self: end;
}

.gm-agent-empty {
  width: 100%;
  padding: 8px;
  border: 1px dashed var(--sn-sys-outline);
  border-radius: 7px;
  color: var(--sn-sys-on-surface-dim);
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
  color: var(--sn-sys-on-surface-dim);
  font-size: 10px;
  text-transform: uppercase;
}

.gm-column-config select,
.gm-column-config input,
.gm-add-profile select {
  width: 100%;
  min-width: 0;
  background: var(--sn-sys-surface-panel);
  color: var(--sn-sys-on-surface);
  border: 1px solid var(--sn-sys-outline);
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
  background: color-mix(in srgb, var(--sn-sys-accent) 14%, transparent);
}

.gm-profile {
  display: grid;
  grid-template-columns: 32px minmax(0, 1fr) 28px;
  gap: 8px;
  align-items: center;
  padding: 8px;
  background: var(--sn-sys-surface-raised);
  border: 1px solid var(--sn-sys-outline);
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
  box-shadow: 0 -2px 0 var(--sn-sys-accent);
}

.gm-profile.drop-after {
  box-shadow: 0 2px 0 var(--sn-sys-accent);
}

.gm-profile-icon {
  width: 32px;
  height: 32px;
  display: grid;
  place-items: center;
  border-radius: 6px;
  background: var(--sn-sys-surface-panel);
  color: var(--sn-sys-on-surface-dim);
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
  color: var(--sn-sys-on-surface-dim);
  text-transform: uppercase;
}

.gm-profile-model {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
  color: var(--sn-sys-on-surface);
}

.gm-profile-meta-line {
  margin-top: 3px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--sn-sys-on-surface-dim);
  font-size: 10px;
  line-height: 14px;
}

.gm-add-profile {
  display: grid;
  grid-template-columns: 78px minmax(0, 1fr) 28px;
  gap: 6px;
  padding: 10px;
  border-top: 1px solid var(--sn-sys-outline);
  background: var(--sn-sys-surface-raised);
}

.gm-add-profile[data-provider="codex"] [data-add-reasoning],
.gm-add-profile[data-provider="claude"] [data-add-reasoning] {
  grid-column: 2;
}

.gm-add-profile[data-provider="codex"] [data-add-service-tier] {
  grid-column: 2;
}

.gm-add-profile[data-provider="codex"] [data-add-profile] {
  grid-column: 3;
  grid-row: 1 / span 3;
}

.gm-add-profile[data-provider="claude"] [data-add-profile] {
  grid-column: 3;
  grid-row: 1 / span 2;
}

.gm-add-profile:not([data-provider="codex"]):not([data-provider="claude"]) [data-add-reasoning] {
  display: none;
}

.gm-add-profile:not([data-provider="codex"]) [data-add-service-tier] {
  display: none;
}
`;
