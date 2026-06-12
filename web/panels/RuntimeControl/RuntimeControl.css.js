export default /*css*/ `
:host,
pg-runtime-control,
rc-instance-item {
  display: flex;
  flex-direction: column;
  height: 100%;
  width: 100%;
}

.rtc-header {
  align-items: center;
  background: var(--sn-panel-bg);
  border-bottom: 1px solid var(--sn-node-border);
  display: flex;
  flex-shrink: 0;
  gap: 12px;
  justify-content: space-between;
  padding: 16px 20px;
}

.rtc-title {
  align-items: center;
  color: var(--sn-text);
  display: flex;
  font-size: 16px;
  font-weight: 600;
  gap: 8px;
}

.rtc-title .material-symbols-outlined {
  color: var(--sn-node-selected);
}

.rtc-main {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 16px;
}

.rtc-btn-icon {
  font-size: 16px;
}

.rtc-summary {
  display: grid;
  gap: 12px;
  grid-template-columns: repeat(5, minmax(130px, 1fr));
  margin-bottom: 18px;
}

.rtc-summary-card {
  display: block;
  min-height: 86px;
  --sn-card-margin-block-end: 0;
  --sn-metric-border: transparent;
  --sn-metric-gap: 10px;
  --sn-metric-label-size: 11px;
  --sn-metric-value-size: 24px;
  --sn-metric-value-weight: 700;
}

.rtc-summary-note {
  color: var(--sn-text-dim);
  font-size: 11px;
  margin-top: 8px;
}

.rtc-section-head {
  align-items: flex-end;
  display: flex;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 10px;
}

.rtc-section-title {
  color: var(--sn-card-title-color);
  font-size: var(--sn-card-title-size);
  font-weight: var(--sn-card-title-weight);
  text-transform: uppercase;
  margin-bottom: 4px;
}

.rtc-updated {
  color: var(--sn-text-dim);
  font-size: 12px;
}

.rtc-instance-list {
  display: grid;
  gap: 10px;
}

.rtc-instance {
  display: block;
  --sn-card-margin-block-end: 0;
}

.rtc-instance-head {
  align-items: center;
  display: flex;
  gap: 10px;
  justify-content: space-between;
  margin-bottom: 12px;
}

.rtc-instance-name {
  color: var(--sn-text);
  font-size: 13px;
  font-weight: 600;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.rtc-status {
  align-items: center;
  color: var(--sn-success-color);
  display: inline-flex;
  flex-shrink: 0;
  font-size: 12px;
  gap: 6px;
}

.rtc-status-dot {
  background: currentColor;
  border-radius: 50%;
  height: 7px;
  width: 7px;
}

.rtc-metrics {
  display: grid;
  gap: 8px 14px;
  grid-template-columns: repeat(4, minmax(120px, 1fr));
  --sn-metric-border: transparent;
  --sn-metric-gap: 4px;
  --sn-metric-label-size: 10px;
}

.rtc-empty {
  min-height: 140px;
}

@media (max-width: 900px) {
  .rtc-summary,
  .rtc-metrics {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 560px) {
  .rtc-summary,
  .rtc-metrics {
    grid-template-columns: 1fr;
  }

  .rtc-section-head {
    align-items: flex-start;
    flex-direction: column;
  }
}
`;
