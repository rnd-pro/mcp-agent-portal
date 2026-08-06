import { themedScrollFadeBlockStyles } from '../../themes/scroll-fade-styles.js';

export default /*css*/ `
graph-explorer-shell {
  display: block;
  height: 100%;
  position: relative;
  overflow: hidden;
  background: var(--sn-sys-surface);
  contain: strict;
}

graph-explorer-shell .graph-explorer-canvas-layer,
graph-explorer-shell node-canvas,
graph-explorer-shell canvas-graph {
  width: 100%;
  height: 100%;
}

graph-explorer-shell > [slot="canvas"],
graph-explorer-shell > .graph-explorer-canvas-layer {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}

graph-explorer-shell > [slot="overlay"] {
  position: absolute;
  inset: 0;
  z-index: var(--sn-graph-explorer-overlay-z);
  pointer-events: none;
}

graph-explorer-shell > dialog[slot="overlay"][open],
graph-explorer-shell > [slot="overlay"][data-interactive] {
  pointer-events: auto;
}

graph-explorer-shell node-canvas[hidden],
graph-explorer-shell canvas-graph[hidden] {
  display: none;
}

graph-explorer-shell .graph-explorer-toolbar {
  position: absolute;
  top: var(--sn-graph-explorer-toolbar-top);
  right: var(--sn-graph-explorer-toolbar-right);
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: var(--sn-graph-explorer-toolbar-gap);
  z-index: var(--sn-graph-explorer-toolbar-z);
  max-width: calc(100% - var(--sn-graph-explorer-toolbar-max-offset, 16px));
}

graph-explorer-shell .graph-explorer-btn {
  min-width: 0;
  min-height: var(--sn-graph-explorer-button-min-height, 28px);
  display: flex;
  align-items: center;
  gap: var(--sn-graph-explorer-button-gap, 4px);
  padding: var(--sn-graph-explorer-button-padding, 4px 10px);
  border: 1px solid var(--sn-sys-outline);
  border-radius: var(--sn-graph-explorer-button-radius, 3px);
  background: var(--sn-sys-surface-raised);
  color: var(--sn-sys-on-surface);
  cursor: pointer;
  font-family: var(--sn-font);
  font-size: var(--sn-graph-explorer-button-size, 10px);
  white-space: nowrap;
  transition: background var(--sn-transition-fast) var(--sn-transition-easing), border-color var(--sn-transition-fast) var(--sn-transition-easing);
}

graph-explorer-shell .graph-explorer-btn:focus-visible,
graph-explorer-shell .graph-explorer-icon-btn:focus-visible {
  outline: 2px solid var(--sn-sys-focus-ring);
  outline-offset: 2px;
}

graph-explorer-shell .graph-explorer-btn:hover {
  background: color-mix(in oklch, var(--sn-sys-accent) var(--sn-sys-state-hover-mix), var(--sn-sys-surface-raised));
}

graph-explorer-shell .graph-explorer-btn[data-active] {
  border-color: var(--sn-sys-accent);
  background: var(--sn-accent-bg-subtle);
}

graph-explorer-shell .graph-explorer-btn .material-symbols-outlined {
  font-size: var(--sn-graph-explorer-button-icon-size, 14px);
}

graph-explorer-shell .graph-explorer-toolbar-sep {
  width: var(--sn-graph-explorer-toolbar-sep-width, 1px);
  align-self: stretch;
  margin: var(--sn-graph-explorer-toolbar-sep-margin, 0 4px);
  background: var(--sn-sys-outline);
}

graph-explorer-shell .graph-explorer-layer-btn {
  padding: var(--sn-graph-explorer-layer-padding, 3px 6px);
  font-size: var(--sn-graph-explorer-layer-size, 9px);
  opacity: 0.7;
}

graph-explorer-shell .graph-explorer-layer-btn[data-active] {
  opacity: 1;
}

graph-explorer-shell .graph-explorer-layer-btn[data-hidden] {
  opacity: 0.3;
  text-decoration: line-through;
}

graph-explorer-shell .graph-explorer-stats {
  position: absolute;
  bottom: var(--sn-graph-explorer-stats-bottom);
  left: var(--sn-graph-explorer-stats-left);
  display: flex;
  gap: var(--sn-graph-explorer-stats-gap, 12px);
  z-index: var(--sn-graph-explorer-stats-z);
  max-height: var(--sn-graph-explorer-stats-max-height, 280px);
  overflow-y: auto;
  ${themedScrollFadeBlockStyles}
  padding: var(--sn-graph-explorer-stats-padding, 4px 10px);
  border: 1px solid var(--sn-sys-outline);
  border-radius: var(--sn-graph-explorer-stats-radius, 3px);
  background: var(--sn-bg-overlay);
  color: var(--sn-sys-on-surface-dim);
  font-family: var(--sn-font);
  font-size: var(--sn-graph-explorer-stats-size, 10px);
}

graph-explorer-shell .graph-explorer-stat-val {
  color: var(--sn-sys-on-surface);
  font-weight: 600;
}
`;
