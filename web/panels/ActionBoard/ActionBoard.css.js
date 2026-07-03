export default`
:host,
pg-action-board {
  display: block;
  height: 100%;
  min-height: 0;
}

.ab-shell {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  background: var(--sn-sys-surface-panel);
  color: var(--sn-sys-on-surface);
  font-family: var(--sn-font);
}

.ab-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 20px;
  padding: 14px 16px;
  border-block-end: 1px solid var(--sn-layout-border);
  background: var(--sn-node-header-bg);
  flex-shrink: 0;
}

.ab-eyebrow {
  color: var(--sn-sys-on-surface-dim);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0;
  text-transform: uppercase;
}

.ab-header h2 {
  margin: 2px 0 4px;
  font-size: 18px;
  font-weight: 650;
  line-height: 1.15;
}

.ab-header p {
  margin: 0;
  color: var(--sn-sys-on-surface-dim);
  font-size: 12px;
  line-height: 1.35;
}

.ab-header-meta {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 6px;
  min-width: max-content;
  color: var(--sn-sys-on-surface-dim);
  font-size: 11px;
}

.ab-status-banner {
  margin: 10px 16px 0;
  flex-shrink: 0;
}

.ab-main {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(220px, 280px);
  gap: 12px;
  min-height: 0;
  padding: 12px;
  flex: 1 1 auto;
  overflow: auto;
}

.ab-workspace,
.ab-next-actions {
  min-width: 0;
  min-height: 0;
}

.ab-workspace {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.ab-stats {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
  gap: 10px;
  padding: 10px;
  border: 1px solid var(--sn-sys-outline);
  border-radius: var(--sn-card-radius);
  background: var(--sn-sys-surface-raised);
  flex-shrink: 0;
  --sn-metric-border: transparent;
  --sn-metric-label-size: 11px;
  --sn-metric-value-size: 22px;
  --sn-metric-value-weight: 700;
  --sn-metric-padding: 4px 0;
}

.ab-stat-unit {
  margin-inline-start: 3px;
  font-size: 12px;
  color: var(--sn-sys-on-surface-dim);
}

.ab-feed-panel,
.ab-next-actions {
  display: flex;
  flex-direction: column;
  min-height: 0;
  border: 1px solid var(--sn-sys-outline);
  border-radius: var(--sn-card-radius);
  background: var(--sn-sys-surface-raised);
  overflow: hidden;
}

.ab-feed-panel {
  flex: 1;
  min-height: 240px;
}

.ab-section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-height: 34px;
  padding: 8px 10px;
  border-block-end: 1px solid var(--sn-sys-outline);
  background: var(--sn-node-header-bg);
  color: var(--sn-sys-on-surface);
  font-size: 12px;
  font-weight: 650;
}

.ab-section-head span:last-child {
  min-width: 0;
  color: var(--sn-sys-on-surface-dim);
  font-size: 11px;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

sn-event-feed {
  flex: 1 1 auto;
  min-height: 160px;
  --sn-empty-state-min-height: 120px;
}

.ab-next-actions {
  --sn-empty-state-min-height: 80px;
}

.ab-empty-note {
  border-block-end: 1px solid var(--sn-sys-outline);
}

.ab-action-list {
  display: flex;
  flex-direction: column;
  gap: 0;
  margin: 0;
  padding: 0;
  list-style: none;
  overflow: auto;
}

.ab-action-list li {
  display: grid;
  grid-template-columns: 24px minmax(0, 1fr);
  gap: 10px;
  padding: 12px;
  border-block-end: 1px solid var(--sn-sys-outline);
}

.ab-action-list li:last-child {
  border-block-end: 0;
}

.ab-action-list .material-symbols-outlined {
  color: var(--sn-sys-accent);
  font-size: 18px;
  line-height: 1.2;
}

.ab-action-list strong,
.ab-action-list span {
  display: block;
  min-width: 0;
}

.ab-action-list strong {
  color: var(--sn-sys-on-surface);
  font-size: 12px;
  font-weight: 650;
  line-height: 1.25;
}

.ab-action-list div > span {
  margin-block-start: 3px;
  color: var(--sn-sys-on-surface-dim);
  font-size: 11px;
  line-height: 1.35;
}

@media (max-width: 900px) {
  .ab-main {
    grid-template-columns: minmax(0, 1fr);
  }

  .ab-next-actions {
    min-height: 180px;
  }
}

@media (max-width: 620px) {
  .ab-header {
    flex-direction: column;
  }

  .ab-header-meta {
    align-items: flex-start;
  }

  .ab-stats {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .ab-feed-panel {
    min-height: 200px;
  }
}
`;
