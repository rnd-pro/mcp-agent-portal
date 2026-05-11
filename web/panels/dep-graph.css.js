// CSS for pg-dep-graph. Kept separate so dep-graph.js stays focused on graph behavior.
export default `
  pg-dep-graph {
    display: block;
    height: 100%;
    position: relative;
    overflow: hidden;
    background: var(--sn-bg, #1a1a1a);
    /* Prevent scrollbar oscillation in parent .panel-content (overflow:auto)
       Canvas manages its own viewport — no scrollbars needed */
    contain: strict;
  }

  pg-dep-graph node-canvas,
  pg-dep-graph pg-canvas-graph {
    width: 100%;
    height: 100%;
  }

  /* Toolbar */
  .pcb-toolbar {
    position: absolute;
    top: 8px;
    right: 8px;
    display: flex;
    gap: 6px;
    z-index: 200;
  }

  .pcb-btn {
    background: var(--sn-node-bg, #222222);
    border: 1px solid var(--sn-node-border, rgba(255,255,255,0.12));
    color: var(--sn-text, #e0e0e0);
    border-radius: 3px;
    padding: 4px 10px;
    font-family: var(--sn-font, 'SF Mono', monospace);
    font-size: 10px;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 4px;
    transition: background 150ms, border-color 150ms;
  }

  .pcb-btn:hover {
    background: var(--sn-node-hover, #2d2d2d);
  }

  .pcb-btn[data-active] {
    border-color: var(--sn-node-selected, #d4a04a);
    background: rgba(212, 160, 74, 0.1);
  }

  .pcb-btn .material-symbols-outlined {
    font-size: 14px;
  }

  .pcb-stats {
    position: absolute;
    bottom: 8px;
    left: 8px;
    display: flex;
    gap: 12px;
    z-index: 10;
    font-family: var(--sn-font, 'SF Mono', monospace);
    font-size: 10px;
    color: var(--sn-text-dim, #888888);
    background: rgba(26, 26, 26, 0.9);
    padding: 4px 10px;
    border-radius: 3px;
    border: 1px solid rgba(255, 255, 255, 0.08);
  }

  .pcb-stat-val {
    color: var(--sn-text, #e0e0e0);
    font-weight: 600;
  }

  /* ── Pin Labels (dep-graph-specific feature) ── */
  .pcb-pin-overlay {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
    z-index: 2;
    opacity: 0;
    transition: opacity 0.25s ease-in-out;
  }
  .pcb-pin-overlay[data-visible] {
    opacity: 1;
  }
  .pcb-pin {
    position: absolute;
    font-family: var(--sn-font, 'JetBrains Mono', monospace);
    font-size: 8px;
    line-height: 1;
    white-space: nowrap;
    color: var(--sn-text-dim, #888);
    pointer-events: auto;
    cursor: default;
  }
  .pcb-pin::before {
    content: '';
    position: absolute;
    top: 50%;
    width: 4px;
    height: 4px;
    background: var(--sn-conn-color, #c87533);
    border-radius: 50%;
    transform: translateY(-50%);
  }
  .pcb-pin[data-side="left"] {
    left: -4px;
    transform: translateX(-100%);
    text-align: right;
    padding-right: 8px;
  }
  .pcb-pin[data-side="left"]::before {
    right: 0;
  }
  .pcb-pin[data-side="right"] {
    right: -4px;
    transform: translateX(100%);
    text-align: left;
    padding-left: 8px;
  }
  .pcb-pin[data-side="right"]::before {
    left: 0;
  }
  .pcb-pin[data-kind="class"] {
    color: var(--sn-cat-control, #d4a04a);
    font-weight: 600;
  }
  .pcb-pin[data-kind="fn"] {
    color: var(--sn-text, #e0e0e0);
  }
  .pcb-pin:hover {
    color: var(--sn-node-selected, #d4a04a) !important;
    text-shadow: 0 0 4px rgba(212, 160, 74, 0.4);
  }
  .pcb-pin[style*="cursor: pointer"]:hover::after {
    content: '→';
    margin-left: 3px;
    font-size: 7px;
    opacity: 0.6;
  }

  /* Toolbar separator */
  .pcb-toolbar-sep {
    width: 1px;
    background: rgba(255,255,255,0.1);
    margin: 0 4px;
    align-self: stretch;
  }

  /* Layer toggle buttons */
  .pcb-layer-btn {
    font-size: 9px;
    padding: 3px 6px;
    opacity: 0.7;
  }
  .pcb-layer-btn[data-active] {
    opacity: 1;
  }
  .pcb-layer-btn[data-hidden] {
    opacity: 0.3;
    text-decoration: line-through;
  }
`;
