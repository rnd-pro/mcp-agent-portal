export default `
:host {
  display: block;
}

pg-graph-flows {
  display: block;
  height: 100%;
  min-width: 0;
  background: var(--sn-sys-surface-panel);
  color: var(--sn-sys-on-surface);
  border-left: 1px solid var(--sn-sys-outline);
  font-family: var(--sn-font);
}

.flows-shell {
  height: 100%;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
}

.flows-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  border-bottom: 1px solid var(--sn-sys-outline);
}

.flows-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
}

.flows-title .material-symbols-outlined,
sn-button .material-symbols-outlined {
  font-size: 16px;
}

.flows-list {
  overflow: auto;
  padding: 8px;
}

.flows-empty,
.flows-error {
  min-height: var(--sn-empty-state-min-height);
}

.flows-error {
  color: var(--sn-sys-danger);
}

.flows-story {
  width: 100%;
  display: grid;
  gap: 4px;
  margin-bottom: 6px;
  text-align: left;
  cursor: pointer;
}

.flows-story[data-active] {
  --sn-list-item-bg: var(--sn-list-item-active-bg);
  --sn-list-item-border: var(--sn-list-item-active-border);
}

.flows-story-title {
  font-size: 12px;
  font-weight: 700;
}

.flows-story-desc,
.flows-story-count,
.flows-beat-kicker,
.flows-beat p,
.flows-beat p {
  color: var(--sn-sys-on-surface-dim);
  font-size: 11px;
}

.flows-story-desc {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.flows-beat {
  padding: 12px;
  border-top: 1px solid var(--sn-sys-outline);
  background: var(--sn-bg-overlay);
}

.flows-beat h3 {
  margin: 4px 0 6px;
  font-size: 14px;
  line-height: 1.25;
}

.flows-beat p {
  margin: 0 0 10px;
  line-height: 1.45;
}

.flows-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  margin-bottom: 10px;
}

.flows-tag {
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
}

.flows-beat footer {
  display: flex;
  justify-content: space-between;
  gap: 6px;
}
`;
