export default /*css*/ `
sn-timeline {
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  width: 100%;
  padding: var(--sn-timeline-padding, 8px 4px);
}

sn-timeline[hidden] {
  display: none !important;
}

sn-timeline-item {
  display: flex;
  box-sizing: border-box;
  position: relative;
  gap: var(--sn-timeline-item-gap, 12px);
  padding-bottom: var(--sn-timeline-item-padding, 16px);
}

sn-timeline-item:last-child {
  padding-bottom: 0;
}

.sn-timeline-badge-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  flex-shrink: 0;
  position: relative;
}

.sn-timeline-connector {
  width: 2px;
  flex: 1;
  background: var(--sn-timeline-connector-color, var(--sn-sys-outline-subtle));
  margin-top: var(--sn-step-2);
}

sn-timeline-item:last-child .sn-timeline-connector {
  display: none;
}

.sn-timeline-indicator {
  display: flex;
  align-items: center;
  justify-content: center;
  width: var(--sn-timeline-indicator-size, 10px);
  height: var(--sn-timeline-indicator-size, 10px);
  border-radius: 50%;
  background: var(--sn-timeline-indicator-bg, var(--sn-sys-outline));
  border: 2px solid var(--sn-timeline-indicator-border, var(--sn-sys-surface-panel));
  transition: all var(--sn-transition-normal, 240ms);
}

sn-timeline-item[variant="success"] .sn-timeline-indicator {
  background: var(--sn-sys-success);
}

sn-timeline-item[variant="warning"] .sn-timeline-indicator {
  background: var(--sn-sys-warning);
}

sn-timeline-item[variant="error"] .sn-timeline-indicator {
  background: var(--sn-sys-danger);
}

sn-timeline-item[variant="info"] .sn-timeline-indicator {
  background: var(--sn-sys-info);
}

.sn-timeline-item-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: var(--sn-step-2);
  font-family: var(--sn-font, sans-serif);
  min-width: 0;
}

.sn-timeline-title {
  font-size: var(--sn-timeline-title-size, 12px);
  font-weight: 600;
  color: var(--sn-timeline-title-color, var(--sn-sys-on-surface));
}

.sn-timeline-time {
  font-size: var(--sn-timeline-time-size, 10px);
  color: var(--sn-timeline-time-color, var(--sn-sys-on-surface-faint));
}

.sn-timeline-body {
  font-size: var(--sn-timeline-body-size, 11px);
  color: var(--sn-timeline-body-color, var(--sn-sys-on-surface-dim));
  line-height: 1.4;
}
`;
