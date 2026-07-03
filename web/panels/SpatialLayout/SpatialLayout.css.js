export default /*css*/ `
:host,
pg-spatial-layout {
  display: block;
  height: 100%;
  width: 100%;
}

.psl-shell {
  background: var(--sn-sys-surface);
  color: var(--sn-sys-on-surface);
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto auto;
  height: 100%;
  min-height: 0;
}

.psl-header {
  align-items: center;
  background: var(--sn-sys-surface-panel);
  border-bottom: 1px solid var(--sn-sys-outline);
  display: flex;
  gap: 16px;
  justify-content: space-between;
  padding: 12px 16px;
}

.psl-title {
  align-items: center;
  color: var(--sn-sys-on-surface);
  display: flex;
  font-size: 15px;
  font-weight: 650;
  gap: 8px;
  min-width: 0;
}

.psl-title .material-symbols-outlined {
  color: var(--sn-sys-accent);
  font-size: 20px;
}

.psl-controls {
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  justify-content: flex-end;
}

.psl-control {
  align-items: center;
  color: var(--sn-sys-on-surface-dim);
  display: inline-flex;
  font-size: 11px;
  font-weight: 600;
  gap: 7px;
  text-transform: uppercase;
}

.psl-control select,
.psl-control input {
  accent-color: var(--sn-sys-accent);
}

.psl-control select {
  background: var(--sn-field-control-bg);
  border: 1px solid var(--sn-sys-outline);
  border-radius: var(--sn-card-radius);
  color: var(--sn-sys-on-surface);
  font: inherit;
  min-width: 132px;
  padding: 6px 8px;
  text-transform: none;
}

.psl-control input {
  width: 112px;
}

.psl-enter {
  align-items: center;
  background: var(--sn-button-primary-bg);
  border: 1px solid var(--sn-button-primary-bg);
  border-radius: var(--sn-card-radius);
  color: var(--sn-button-color);
  cursor: pointer;
  display: inline-flex;
  font: inherit;
  font-size: 12px;
  font-weight: 650;
  gap: 7px;
  min-height: 32px;
  padding: 0 12px;
}

.psl-enter:hover {
  border-color: var(--sn-button-hover-border);
}

.psl-enter:disabled {
  background: var(--sn-field-control-bg);
  border-color: var(--sn-sys-outline);
  color: var(--sn-sys-on-surface-dim);
  cursor: default;
}

.psl-enter .material-symbols-outlined {
  font-size: 18px;
}

.psl-stage {
  background:
    radial-gradient(circle at 50% 38%, color-mix(in oklch, var(--sn-sys-accent) 15%, transparent), transparent 34%),
    linear-gradient(135deg, color-mix(in oklch, var(--sn-sys-surface) 86%, black), var(--sn-sys-surface));
  min-height: 0;
  overflow: hidden;
  perspective: 980px;
  position: relative;
  transform-style: preserve-3d;
}

.psl-floor {
  background:
    linear-gradient(color-mix(in oklch, var(--sn-sys-accent) 14%, transparent) 1px, transparent 1px),
    linear-gradient(90deg, color-mix(in oklch, var(--sn-sys-accent) 14%, transparent) 1px, transparent 1px);
  background-size: 54px 54px;
  bottom: -28%;
  height: 64%;
  left: 50%;
  opacity: 0.42;
  position: absolute;
  transform: translateX(-50%) rotateX(74deg);
  width: 130%;
}

.psl-space {
  inset: 0;
  position: absolute;
  transform-style: preserve-3d;
}

.psl-panel {
  background:
    linear-gradient(180deg, color-mix(in oklch, var(--psl-panel-bg, var(--sn-xr-panel-bg)) 86%, white 4%), var(--psl-panel-bg, var(--sn-xr-panel-bg)));
  border: 1px solid var(--psl-panel-border, var(--sn-xr-panel-border));
  border-radius: var(--psl-panel-radius, var(--sn-xr-panel-radius));
  box-shadow: var(--psl-panel-shadow, var(--sn-xr-panel-shadow));
  display: block;
  left: 50%;
  min-height: 34px;
  min-width: 42px;
  overflow: hidden;
  position: absolute;
  top: 50%;
  transform-style: preserve-3d;
  transition: border-color var(--sn-duration-fast) var(--sn-ease-standard),
    box-shadow var(--sn-duration-fast) var(--sn-ease-standard);
}

.psl-panel[data-hit="true"] {
  border-color: var(--sn-sys-accent);
  box-shadow:
    0 0 0 1px color-mix(in oklch, var(--sn-sys-accent) 72%, transparent),
    0 0 38px color-mix(in oklch, var(--sn-sys-accent) 30%, transparent),
    var(--psl-panel-shadow, var(--sn-xr-panel-shadow));
}

.psl-panel[data-gesture="dragging"] {
  border-color: var(--sn-sys-accent);
  box-shadow:
    0 0 0 2px color-mix(in oklch, var(--sn-sys-accent) 80%, transparent),
    0 0 46px color-mix(in oklch, var(--sn-sys-accent) 36%, transparent),
    var(--psl-panel-shadow, var(--sn-xr-panel-shadow));
}

.psl-panel::before,
.psl-panel::after {
  content: "";
  pointer-events: none;
  position: absolute;
  z-index: 2;
}

.psl-panel::before {
  background:
    linear-gradient(90deg, color-mix(in oklch, var(--sn-xr-pointer-color) 34%, transparent), transparent 22%),
    color-mix(in oklch, var(--sn-xr-panel-border) 64%, transparent);
  border-bottom: 1px solid color-mix(in oklch, var(--sn-xr-panel-border) 78%, transparent);
  height: max(16px, calc(var(--sn-space-lg) * 0.72));
  inset: 0 0 auto 0;
}

.psl-panel::after {
  border-bottom: 2px solid var(--sn-xr-pointer-color);
  border-right: 2px solid var(--sn-xr-pointer-color);
  bottom: var(--sn-space-xs);
  height: var(--sn-space-md);
  opacity: 0.76;
  right: var(--sn-space-xs);
  width: var(--sn-space-md);
}

.psl-panel-live {
  display: block;
  height: var(--sn-xr-content-height);
  min-height: 0;
  overflow: hidden;
  position: relative;
  transform: scale(var(--sn-xr-content-scale));
  transform-origin: 0 0;
  width: 100%;
  width: var(--sn-xr-content-width);
  z-index: 1;
}

.psl-panel-live > * {
  display: block;
  height: 100%;
  min-height: 0;
  width: 100%;
}

.psl-panel-canvas {
  border: 1px solid var(--sn-xr-panel-border);
  border-radius: var(--sn-xr-panel-radius);
  bottom: var(--sn-space-sm);
  height: 24%;
  max-height: calc(var(--sn-space-xl) * 4);
  max-width: calc(var(--sn-space-xl) * 8);
  opacity: 0.82;
  pointer-events: none;
  position: absolute;
  right: var(--sn-space-sm);
  width: 32%;
}

.psl-panel-canvas[data-preview="source"] {
  border: 0;
  bottom: auto;
  height: var(--sn-xr-content-height);
  inset: 0;
  max-height: none;
  max-width: none;
  opacity: 1;
  pointer-events: none;
  position: absolute;
  right: auto;
  top: auto;
  transform: none;
  width: var(--sn-xr-content-width);
  z-index: 0;
}

.psl-panel-canvas[data-live="true"] {
  border: 0;
  border-radius: 0;
  bottom: auto;
  height: 100%;
  inset: 0;
  max-height: none;
  max-width: none;
  opacity: 1;
  right: auto;
  width: 100%;
}

.psl-deep-graph {
  inset: 0;
  pointer-events: none;
  position: absolute;
  transform-style: preserve-3d;
  z-index: 3;
}

.psl-deep-edge {
  background: color-mix(in oklch, var(--sn-sys-outline) 62%, var(--sn-sys-accent));
  display: block;
  height: 1px;
  left: 50%;
  opacity: 0.42;
  position: absolute;
  top: 50%;
  transform:
    translate3d(calc(-50% + var(--psl-edge-x)), calc(-50% + var(--psl-edge-y)), var(--psl-edge-z))
    rotate(var(--psl-edge-angle));
  transform-origin: 0 50%;
  width: var(--psl-edge-length);
}

.psl-deep-node {
  align-items: center;
  background: color-mix(in oklch, var(--sn-xr-panel-bg) 84%, var(--sn-sys-accent) 16%);
  border: 1px solid color-mix(in oklch, var(--sn-sys-outline) 72%, var(--sn-sys-accent));
  border-radius: 999px;
  box-shadow: 0 0 18px color-mix(in oklch, var(--sn-sys-accent) 22%, transparent);
  color: transparent;
  display: inline-flex;
  height: var(--psl-node-size);
  justify-content: center;
  left: 50%;
  min-height: 7px;
  min-width: 7px;
  overflow: hidden;
  padding: 0;
  pointer-events: none;
  position: absolute;
  top: 50%;
  width: var(--psl-node-size);
}

.psl-deep-node[data-depth="0"] {
  background: var(--sn-sys-accent);
  border-color: var(--sn-sys-accent);
}

.psl-deep-node[data-focus="true"] {
  box-shadow:
    0 0 0 2px color-mix(in oklch, var(--sn-sys-accent) 86%, transparent),
    0 0 34px color-mix(in oklch, var(--sn-sys-accent) 44%, transparent);
}

.psl-xr-canvas-source {
  display: block;
  left: 0;
  position: absolute;
  top: 0;
}

.sn-xr-panel-fallback {
  align-items: center;
  color: var(--sn-sys-on-surface-dim);
  display: flex;
  font-size: 12px;
  height: 100%;
  justify-content: center;
  padding: 12px;
  text-align: center;
}

.psl-ray {
  background: linear-gradient(var(--sn-xr-pointer-color), transparent);
  height: 42%;
  left: 50%;
  opacity: 0.72;
  pointer-events: none;
  position: absolute;
  top: 50%;
  transform: translate3d(-50%, 0, 260px) rotateX(66deg);
  transform-origin: 50% 0%;
  width: 2px;
}

.psl-status {
  align-items: center;
  background: var(--sn-sys-surface-panel);
  border-top: 1px solid var(--sn-sys-outline);
  color: var(--sn-sys-on-surface-dim);
  display: flex;
  flex-wrap: wrap;
  font-size: 12px;
  gap: 14px;
  min-height: 36px;
  padding: 8px 16px;
}

.psl-geometry {
  background: var(--sn-sys-surface-panel);
  border-top: 1px solid var(--sn-sys-outline);
  color: var(--sn-sys-on-surface-dim);
  display: grid;
  gap: 6px;
  grid-template-columns: minmax(0, 1fr);
  max-height: 168px;
  overflow: auto;
  padding: 8px 16px 10px;
}

.psl-geometry:empty {
  display: none;
}

.psl-geometry-header {
  color: var(--sn-sys-on-surface);
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
}

.psl-html-canvas {
  align-items: center;
  background: color-mix(in oklch, var(--sn-sys-surface-panel) 82%, var(--sn-sys-outline));
  border: 1px solid var(--sn-sys-outline);
  border-radius: var(--sn-card-radius);
  display: flex;
  flex-wrap: wrap;
  gap: var(--sn-space-sm);
  min-height: 30px;
  padding: var(--sn-space-xs) var(--sn-space-sm);
}

.psl-html-canvas span {
  border: 1px solid var(--sn-sys-outline);
  border-radius: var(--sn-card-radius);
  color: var(--sn-sys-on-surface-dim);
  font-size: var(--sn-font-size);
  padding: var(--sn-space-xs) var(--sn-space-sm);
}

.psl-html-canvas span[data-active="true"] {
  border-color: var(--sn-sys-accent);
  color: var(--sn-sys-on-surface);
}

.psl-geometry-row {
  align-items: center;
  background: color-mix(in oklch, var(--sn-sys-surface-panel) 82%, var(--sn-sys-outline));
  border: 1px solid var(--sn-sys-outline);
  border-radius: var(--sn-card-radius);
  color: var(--sn-sys-on-surface-dim);
  cursor: pointer;
  display: grid;
  font: inherit;
  font-size: 11px;
  gap: 8px;
  grid-template-columns: minmax(92px, 1fr) minmax(86px, 0.85fr) minmax(112px, 1.1fr) minmax(86px, 0.75fr) minmax(86px, 0.75fr) minmax(104px, 0.9fr);
  min-height: 30px;
  padding: 5px 8px;
  text-align: left;
  transition: border-color var(--sn-duration-fast) var(--sn-ease-standard),
    color var(--sn-duration-fast) var(--sn-ease-standard),
    background var(--sn-duration-fast) var(--sn-ease-standard);
}

.psl-geometry-row:hover,
.psl-geometry-row:focus-visible,
.psl-geometry-row[data-active="true"],
.psl-geometry-row[data-gesture="dragging"] {
  background: color-mix(in oklch, var(--sn-sys-surface-panel) 78%, var(--sn-sys-accent));
  border-color: var(--sn-sys-accent);
  color: var(--sn-sys-on-surface);
}

.psl-geometry-row:focus-visible {
  outline: 2px solid var(--sn-sys-accent);
  outline-offset: 2px;
}

.psl-geometry-row span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

@media (max-width: 760px) {
  .psl-header {
    align-items: flex-start;
    flex-direction: column;
  }

  .psl-controls {
    justify-content: flex-start;
  }

  .psl-geometry-row {
    grid-template-columns: minmax(92px, 1fr) minmax(86px, 1fr);
  }

  .psl-geometry-row span:nth-child(n + 3) {
    display: none;
  }
}
`;
