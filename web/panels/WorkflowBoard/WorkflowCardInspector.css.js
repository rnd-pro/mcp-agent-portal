export default /*css*/ `
:host,
pg-workflow-card-inspector {
  display: block;
  height: 100%;
  min-height: 0;
}

/* The [hidden] attribute toggles section visibility; an explicit display rule below would
   otherwise win over the UA [hidden]{display:none}, so enforce it. */
pg-workflow-card-inspector [hidden] {
  display: none !important;
}

pg-workflow-card-inspector .wci-shell {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  background: var(--sn-sys-surface-panel);
  color: var(--sn-sys-on-surface);
  font-family: var(--sn-font);
}

pg-workflow-card-inspector .wci-header {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 38px;
  padding: 8px 12px;
  border-block-end: 1px solid var(--sn-sys-outline);
  background: var(--sn-node-header-bg);
  color: var(--sn-sys-on-surface);
}

pg-workflow-card-inspector .wci-title {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
  font-weight: 500;
}

pg-workflow-card-inspector .wci-badge {
  flex: 0 0 auto;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 10px;
  font-family: var(--sn-font-mono);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  background: var(--sn-chip-bg, color-mix(in oklch, var(--sn-sys-accent) 18%, transparent));
  color: var(--sn-sys-on-surface-dim);
}
pg-workflow-card-inspector .wci-badge[data-kind="error"] { background: color-mix(in oklch, var(--sn-sys-danger) 18%, transparent); color: var(--sn-sys-danger); }
pg-workflow-card-inspector .wci-badge[data-kind="warning"] { background: color-mix(in oklch, var(--sn-sys-warning) 18%, transparent); color: var(--sn-sys-warning); }
pg-workflow-card-inspector .wci-badge[data-kind="ok"] { background: color-mix(in oklch, var(--sn-sys-success) 18%, transparent); color: var(--sn-sys-success); }

@keyframes wci-spin { to { transform: rotate(360deg); } }
pg-workflow-card-inspector .wci-spinner {
  flex: 0 0 auto;
  display: inline-block;
  width: 12px;
  height: 12px;
  border: 2px solid var(--sn-sys-outline);
  border-top-color: var(--sn-accent, var(--sn-sys-accent));
  border-radius: 50%;
  animation: wci-spin 0.8s linear infinite;
}

pg-workflow-card-inspector .wci-held {
  margin: 0 12px 10px;
  padding: 6px 10px;
  border-radius: 6px;
  font-size: 11px;
  background: color-mix(in oklch, var(--sn-sys-warning) 15%, transparent);
  color: var(--sn-sys-warning);
  border: 1px solid color-mix(in oklch, var(--sn-sys-warning) 30%, transparent);
}

pg-workflow-card-inspector .wci-audit-verdict {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}

pg-workflow-card-inspector .wci-audit-by {
  min-width: 0;
  color: var(--sn-sys-on-surface-dim);
  font-size: 11px;
  font-family: var(--sn-font-mono);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

pg-workflow-card-inspector .wci-audit-reason {
  margin-block-start: 6px;
  font-size: 11px;
  line-height: 1.4;
  color: var(--sn-sys-on-surface);
}

pg-workflow-card-inspector .wci-audit-returned {
  margin-block-start: 8px;
  font-size: 11px;
  font-weight: 500;
  color: var(--sn-sys-danger);
}

pg-workflow-card-inspector .wci-audit-detail {
  margin-block-start: 4px;
  font-size: 11px;
  line-height: 1.4;
  color: var(--sn-sys-on-surface-dim);
}

pg-workflow-card-inspector .wci-audit-next {
  margin-block-start: 8px;
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--sn-sys-on-surface-dim);
}

pg-workflow-card-inspector .wci-history-actor {
  flex: 0 0 auto;
  color: var(--sn-sys-on-surface-dim);
  font-family: var(--sn-font-mono);
  font-size: 10px;
  max-width: 38%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

pg-workflow-card-inspector .wci-empty {
  flex: 1 1 auto;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  text-align: center;
  color: var(--sn-sys-on-surface-dim);
  font-size: 12px;
}

pg-workflow-card-inspector .wci-content {
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: auto;
}

pg-workflow-card-inspector .wci-agent {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  border-block-end: 1px solid var(--sn-sys-outline);
}

pg-workflow-card-inspector .wci-agent-dot {
  flex: 0 0 auto;
  width: 8px;
  height: 8px;
  border-radius: 2px;
  background: var(--sn-accent, var(--sn-sys-accent));
  transform: rotate(45deg);
}

pg-workflow-card-inspector .wci-agent-name {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
  font-weight: 500;
}

pg-workflow-card-inspector .wci-chat-btn {
  flex: 0 0 auto;
  padding: 4px 10px;
  border: 1px solid var(--sn-sys-outline);
  border-radius: 6px;
  background: transparent;
  color: var(--sn-sys-on-surface);
  font: inherit;
  font-size: 11px;
  cursor: pointer;
}
pg-workflow-card-inspector .wci-chat-btn:hover {
  background: color-mix(in oklch, var(--sn-sys-accent) var(--sn-sys-state-hover-mix), var(--sn-sys-surface-panel));
}
/* U15: title-attribute tooltip is not reachable by keyboard alone; a visible focus ring gives
   keyboard/AT users the same "this is interactive, here's what it does" affordance sighted
   mouse users get from hover. */
pg-workflow-card-inspector .wci-chat-btn:focus-visible {
  outline: var(--sn-sys-focus-ring-width) solid var(--sn-sys-focus-ring);
  outline-offset: var(--sn-sys-focus-ring-offset);
}

pg-workflow-card-inspector .wci-metrics {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 1px;
  background: var(--sn-sys-outline);
  border-block-end: 1px solid var(--sn-sys-outline);
}

pg-workflow-card-inspector .wci-metric {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 8px 10px;
  background: var(--sn-sys-surface-panel);
}

pg-workflow-card-inspector .wci-metric-label {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--sn-sys-on-surface-dim);
}

pg-workflow-card-inspector .wci-metric-value {
  font-size: 14px;
  font-weight: 500;
  font-family: var(--sn-font-mono);
}

pg-workflow-card-inspector .wci-section {
  padding: 10px 12px;
  border-block-end: 1px solid var(--sn-sys-outline);
}

pg-workflow-card-inspector .wci-section-label {
  margin-block-end: 8px;
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--sn-sys-on-surface-dim);
}

pg-workflow-card-inspector .wci-history-list {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

pg-workflow-card-inspector .wci-history-item {
  display: flex;
  align-items: baseline;
  gap: 8px;
  font-size: 11px;
}

pg-workflow-card-inspector .wci-history-dot {
  flex: 0 0 auto;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--sn-sys-on-surface-dim);
  align-self: center;
}
pg-workflow-card-inspector .wci-history-item[data-kind="error"] .wci-history-dot { background: var(--sn-sys-danger); }
pg-workflow-card-inspector .wci-history-item[data-kind="warning"] .wci-history-dot { background: var(--sn-sys-warning); }
pg-workflow-card-inspector .wci-history-item[data-kind="ok"] .wci-history-dot { background: var(--sn-sys-success); }

pg-workflow-card-inspector .wci-history-label {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

pg-workflow-card-inspector .wci-history-time {
  flex: 0 0 auto;
  color: var(--sn-sys-on-surface-dim);
  font-family: var(--sn-font-mono);
  font-size: 10px;
}

pg-workflow-card-inspector .wci-runs-list {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

pg-workflow-card-inspector .wci-run-item {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 11px;
}

pg-workflow-card-inspector .wci-run-dot {
  flex: 0 0 auto;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--sn-sys-on-surface-dim);
}
pg-workflow-card-inspector .wci-run-item[data-kind="error"] .wci-run-dot { background: var(--sn-sys-danger); }
pg-workflow-card-inspector .wci-run-item[data-kind="warning"] .wci-run-dot { background: var(--sn-sys-warning); }
pg-workflow-card-inspector .wci-run-item[data-kind="ok"] .wci-run-dot { background: var(--sn-sys-success); }

pg-workflow-card-inspector .wci-run-agent {
  flex: 0 0 auto;
  font-weight: 500;
  max-width: 45%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

pg-workflow-card-inspector .wci-run-meta {
  flex: 1 1 auto;
  min-width: 0;
  text-align: end;
  color: var(--sn-sys-on-surface-dim);
  font-family: var(--sn-font-mono);
  font-size: 10px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

pg-workflow-card-inspector .wci-run-chat {
  flex: 0 0 auto;
  width: 20px;
  height: 20px;
  padding: 0;
  border: 1px solid var(--sn-sys-outline);
  border-radius: 5px;
  background: transparent;
  color: var(--sn-sys-on-surface);
  font: inherit;
  font-size: 12px;
  line-height: 1;
  cursor: pointer;
}
pg-workflow-card-inspector .wci-run-chat:hover {
  background: color-mix(in oklch, var(--sn-sys-accent) var(--sn-sys-state-hover-mix), var(--sn-sys-surface-panel));
}
/* U15: icon-only button, label carried solely by [title]; keyboard users get no hover tooltip,
   so a visible focus ring is the equivalent affordance (see .wci-chat-btn note above). */
pg-workflow-card-inspector .wci-run-chat:focus-visible {
  outline: var(--sn-sys-focus-ring-width) solid var(--sn-sys-focus-ring);
  outline-offset: var(--sn-sys-focus-ring-offset);
}

pg-workflow-card-inspector .wci-body-section {
  flex: 1 1 auto;
  min-height: 120px;
  display: flex;
  flex-direction: column;
  border-block-end: none;
}

pg-workflow-card-inspector .wci-view {
  flex: 1 1 auto;
  min-height: 0;
}

/* Human-decision panel: the orchestrator's parked question, its button options, and a free-text answer
   that routes back to the orchestrator (or rejects the card). */
pg-workflow-card-inspector .wci-decision-section {
  background: color-mix(in oklch, var(--sn-sys-accent) 6%, transparent);
}
pg-workflow-card-inspector .wci-decision-question {
  font-size: 12px;
  line-height: 1.4;
  color: var(--sn-sys-on-surface);
  margin-block-end: 8px;
}
pg-workflow-card-inspector .wci-decision-options {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-block-end: 8px;
}
pg-workflow-card-inspector .wci-decision-options:empty {
  display: none;
}
pg-workflow-card-inspector .wci-decision-option {
  padding: 5px 10px;
  border: 1px solid var(--sn-sys-outline);
  border-radius: 6px;
  background: var(--sn-sys-surface-panel);
  color: var(--sn-sys-on-surface);
  font: inherit;
  font-size: 11px;
  cursor: pointer;
}
pg-workflow-card-inspector .wci-decision-option:hover:not(:disabled) {
  background: color-mix(in oklch, var(--sn-sys-accent) var(--sn-sys-state-hover-mix), var(--sn-sys-surface-panel));
}
pg-workflow-card-inspector .wci-decision-option-reject {
  border-color: color-mix(in oklch, var(--sn-sys-danger) 40%, transparent);
  color: var(--sn-sys-danger);
}
pg-workflow-card-inspector .wci-decision-text {
  width: 100%;
  box-sizing: border-box;
  resize: vertical;
  padding: 6px 8px;
  border: 1px solid var(--sn-sys-outline);
  border-radius: 6px;
  background: var(--sn-sys-surface-panel);
  color: var(--sn-sys-on-surface);
  font: inherit;
  font-size: 11px;
  margin-block-end: 8px;
}
pg-workflow-card-inspector .wci-decision-actions {
  display: flex;
  gap: 8px;
}
pg-workflow-card-inspector .wci-decision-btn {
  flex: 1 1 auto;
  padding: 6px 10px;
  border: 1px solid var(--sn-sys-outline);
  border-radius: 6px;
  background: transparent;
  color: var(--sn-sys-on-surface);
  font: inherit;
  font-size: 11px;
  cursor: pointer;
}
pg-workflow-card-inspector .wci-decision-send {
  border-color: var(--sn-accent, var(--sn-sys-accent));
  color: var(--sn-accent, var(--sn-sys-accent));
}
pg-workflow-card-inspector .wci-decision-btn:hover:not(:disabled) {
  background: color-mix(in oklch, var(--sn-sys-accent) var(--sn-sys-state-hover-mix), var(--sn-sys-surface-panel));
}
pg-workflow-card-inspector .wci-decision-btn:disabled,
pg-workflow-card-inspector .wci-decision-option:disabled {
  opacity: 0.5;
  cursor: default;
}
pg-workflow-card-inspector .wci-decision-status {
  margin-block-start: 8px;
  font-size: 11px;
  color: var(--sn-sys-on-surface-dim);
}
pg-workflow-card-inspector .wci-decision-status[data-kind="error"] { color: var(--sn-sys-danger); }
pg-workflow-card-inspector .wci-decision-status[data-kind="ok"] { color: var(--sn-sys-success); }
pg-workflow-card-inspector .wci-decision-status[data-kind="warning"] { color: var(--sn-sys-warning); }
`;
