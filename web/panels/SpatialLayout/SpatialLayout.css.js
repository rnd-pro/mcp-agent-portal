export default /*css*/ `
:host,
pg-spatial-layout {
  display: block;
  height: 100%;
  width: 100%;
}

.psl-shell {
  background: var(--sn-bg);
  color: var(--sn-text);
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
  height: 100%;
  min-height: 0;
}

.psl-header {
  align-items: center;
  background: var(--sn-panel-bg);
  border-bottom: 1px solid var(--sn-node-border);
  display: flex;
  gap: 16px;
  justify-content: space-between;
  padding: 12px 16px;
}

.psl-title {
  align-items: center;
  color: var(--sn-text);
  display: flex;
  font-size: 15px;
  font-weight: 650;
  gap: 8px;
  min-width: 0;
}

.psl-title .material-symbols-outlined {
  color: var(--sn-node-selected);
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
  color: var(--sn-text-dim);
  display: inline-flex;
  font-size: 11px;
  font-weight: 600;
  gap: 7px;
  text-transform: uppercase;
}

.psl-control select,
.psl-control input {
  accent-color: var(--sn-node-selected);
}

.psl-control select {
  background: var(--sn-field-control-bg);
  border: 1px solid var(--sn-node-border);
  border-radius: var(--sn-card-radius);
  color: var(--sn-text);
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

.psl-enter .material-symbols-outlined {
  font-size: 18px;
}

.psl-stage {
  background:
    radial-gradient(circle at 50% 38%, color-mix(in oklch, var(--sn-node-selected) 15%, transparent), transparent 34%),
    linear-gradient(135deg, color-mix(in oklch, var(--sn-bg) 86%, black), var(--sn-bg));
  min-height: 0;
  overflow: hidden;
  perspective: 980px;
  position: relative;
  transform-style: preserve-3d;
}

.psl-floor {
  background:
    linear-gradient(color-mix(in oklch, var(--sn-node-selected) 14%, transparent) 1px, transparent 1px),
    linear-gradient(90deg, color-mix(in oklch, var(--sn-node-selected) 14%, transparent) 1px, transparent 1px);
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
  border-color: var(--sn-node-selected);
  box-shadow:
    0 0 0 1px color-mix(in oklch, var(--sn-node-selected) 72%, transparent),
    0 0 38px color-mix(in oklch, var(--sn-node-selected) 30%, transparent),
    var(--psl-panel-shadow, var(--sn-xr-panel-shadow));
}

.psl-panel-live {
  display: block;
  height: 100%;
  min-height: 0;
  overflow: hidden;
  width: 100%;
}

.psl-panel-live > * {
  display: block;
  height: 100%;
  min-height: 0;
  width: 100%;
}

.sn-xr-panel-fallback {
  align-items: center;
  color: var(--sn-text-dim);
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
  background: var(--sn-panel-bg);
  border-top: 1px solid var(--sn-node-border);
  color: var(--sn-text-dim);
  display: flex;
  flex-wrap: wrap;
  font-size: 12px;
  gap: 14px;
  min-height: 36px;
  padding: 8px 16px;
}

@media (max-width: 760px) {
  .psl-header {
    align-items: flex-start;
    flex-direction: column;
  }

  .psl-controls {
    justify-content: flex-start;
  }
}
`;
