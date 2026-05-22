export default `
:host {
  display: block;
}

pg-graph-flows {
  display: block;
  height: 100%;
  min-width: 0;
  background: var(--sn-panel-bg);
  color: var(--sn-text);
  border-left: 1px solid var(--sn-node-border);
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
  border-bottom: 1px solid var(--sn-node-border);
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
.flows-icon-btn .material-symbols-outlined,
.flows-btn .material-symbols-outlined {
  font-size: 16px;
}

.flows-icon-btn,
.flows-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  border: 1px solid var(--sn-node-border);
  border-radius: 4px;
  background: var(--sn-node-bg);
  color: var(--sn-text);
  cursor: pointer;
}

.flows-icon-btn {
  width: 28px;
  height: 28px;
}

.flows-btn {
  min-height: 28px;
  padding: 4px 8px;
  font-size: 11px;
}

.flows-icon-btn:hover,
.flows-btn:hover,
.flows-story:hover {
  background: var(--sn-node-hover);
}

.flows-btn.primary {
  border-color: var(--sn-node-selected);
  color: var(--sn-node-selected);
}

.flows-list {
  overflow: auto;
  padding: 8px;
}

.flows-empty,
.flows-error {
  padding: 16px;
  color: var(--sn-text-dim);
  font-size: 12px;
  line-height: 1.5;
}

.flows-error {
  color: var(--sn-danger-color);
}

.flows-story {
  width: 100%;
  display: grid;
  gap: 4px;
  padding: 9px 10px;
  margin-bottom: 6px;
  border: 1px solid var(--sn-node-border);
  border-radius: 4px;
  background: var(--sn-node-bg);
  color: inherit;
  text-align: left;
  cursor: pointer;
}

.flows-story[data-active] {
  border-color: var(--sn-node-selected);
  background: var(--sn-accent-bg-subtle);
}

.flows-story-title {
  font-size: 12px;
  font-weight: 700;
}

.flows-story-desc,
.flows-story-count,
.flows-beat-kicker,
.flows-beat p,
.flows-tag {
  color: var(--sn-text-dim);
  font-size: 11px;
}

.flows-story-desc {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.flows-beat {
  padding: 12px;
  border-top: 1px solid var(--sn-node-border);
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
  padding: 2px 6px;
  border-radius: 3px;
  border: 1px solid var(--sn-node-border);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.flows-beat footer {
  display: flex;
  justify-content: space-between;
  gap: 6px;
}
`;
