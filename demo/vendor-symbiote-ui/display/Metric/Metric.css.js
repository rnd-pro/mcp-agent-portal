export default /*css*/ `
sn-metric {
  display: flex;
  box-sizing: border-box;
  align-items: center;
  justify-content: space-between;
  gap: var(--sn-metric-gap, 8px);
  min-width: 0;
  padding: var(--sn-metric-padding, 4px 0);
  border-block-end: 1px solid var(--sn-metric-border, color-mix(in oklab, currentColor 12%, transparent));
  color: var(--sn-metric-color, inherit);
  font-family: var(--sn-font);
  font-size: var(--sn-metric-label-size, 12px);
}

sn-metric[hidden] {
  display: none !important;
}

sn-metric:last-child {
  border-block-end: 0;
}

sn-metric[variant="stacked"] {
  align-items: flex-start;
  flex-direction: column;
}

.sn-metric-label {
  min-width: 0;
  color: var(--sn-metric-label-color, var(--sn-sys-on-surface-dim));
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sn-metric-value {
  min-width: 0;
  color: var(--sn-metric-value-color, var(--sn-sys-on-surface));
  font-family: var(--sn-metric-value-font, var(--sn-font-mono, monospace));
  font-size: var(--sn-metric-value-size, 13px);
  font-weight: var(--sn-metric-value-weight, 600);
  text-align: end;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

sn-metric[status="success"] .sn-metric-value {
  color: var(--sn-metric-success-color, var(--sn-sys-success));
}

sn-metric[status="warning"] .sn-metric-value {
  color: var(--sn-metric-warning-color, var(--sn-sys-warning));
}

sn-metric[status="error"] .sn-metric-value {
  color: var(--sn-metric-error-color, var(--sn-sys-danger));
}
`;
