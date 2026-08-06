export default /*css*/ `
sn-chart {
  display: block;
  font-family: var(--sn-font, sans-serif);
  width: 100%;
  box-sizing: border-box;
}

.sn-chart-container {
  display: flex;
  flex-direction: column;
  background: var(--sn-sys-surface-panel);
  border: 1px solid var(--sn-sys-outline-subtle);
  border-radius: var(--sn-panel-radius, 6px);
  padding: 16px;
  box-sizing: border-box;
}

.sn-chart-header {
  margin-bottom: 12px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}

.sn-chart-title {
  font-size: calc(14px * var(--sn-theme-type-scale, 1));
  font-weight: 500;
  color: var(--sn-sys-on-surface);
}

.sn-chart-legend {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  font-size: 11px;
  color: var(--sn-sys-on-surface-dim);
}

.sn-chart-legend-item {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  user-select: none;
  transition: opacity var(--sn-transition-fast, 0.15s) ease;
}

.sn-chart-legend-item[data-hidden="true"] {
  opacity: 0.35;
}

.sn-chart-legend-color {
  display: inline-block;
  width: 12px;
  height: 8px;
  border-radius: 2px;
}

.sn-chart-svg-wrap {
  width: 100%;
  height: 220px;
  position: relative;
}

.sn-chart-svg {
  width: 100%;
  height: 100%;
  overflow: visible;
  user-select: none;
}

.sn-chart-axis {
  stroke: var(--sn-sys-outline-subtle);
  stroke-width: 1;
}

.sn-chart-grid-line {
  stroke: var(--sn-sys-outline-subtle);
  stroke-dasharray: 2 2;
  stroke-width: 1;
}

.sn-chart-bar {
  cursor: pointer;
  transition: fill var(--sn-transition-fast, 120ms);
}

.sn-chart-bar:hover {
  fill: color-mix(in oklch, var(--sn-sys-on-surface) var(--sn-sys-state-hover-mix), currentColor);
}

.sn-chart-line {
  fill: none;
  stroke-width: 2;
}

.sn-chart-area {
  stroke: none;
  opacity: 0.15;
}

.sn-chart-line-point {
  fill: var(--sn-sys-surface-panel);
  stroke-width: 2;
  cursor: pointer;
  transition: r var(--sn-transition-fast, 0.1s) ease, fill var(--sn-transition-fast, 0.1s) ease;
}

.sn-chart-line-point:hover {
  r: 6px;
}

.sn-chart-pie-slice {
  cursor: pointer;
  transition: transform var(--sn-transition-fast, 120ms);
}

.sn-chart-pie-slice:hover {
  transform: scale(1.03);
}

.sn-chart-threshold-line {
  stroke-width: 1;
  stroke-dasharray: 4 4;
}

.sn-chart-threshold-text {
  font-size: 9px;
  dominant-baseline: middle;
}

.sn-chart-brush-overlay {
  fill: color-mix(in oklch, var(--sn-sys-accent) 15%, transparent);
  stroke: var(--sn-chart-brush-stroke, var(--sn-sys-accent));
  stroke-width: 1;
  pointer-events: none;
}

.sn-chart-tooltip {
  position: absolute;
  background-color: var(--sn-tooltip-bg, var(--sn-sys-surface-overlay));
  color: var(--sn-tooltip-color, var(--sn-sys-on-surface));
  padding: 6px 10px;
  border-radius: 4px;
  font-size: 11px;
  pointer-events: none;
  z-index: 100;
  box-shadow: var(--sn-sys-shadow-overlay);
  line-height: 1.4;
}

.sn-chart-tooltip[hidden] {
  display: none;
}
`;
