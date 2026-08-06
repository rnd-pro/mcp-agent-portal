/**
 * PCB Dark — Carbon-based theme with circuit board node styling
 *
 * Extends the Carbon neutral dark palette with PCB-inspired node shapes:
 * - IC chip rectangles with notch markers
 * - Copper-tinted traces for import connections
 * - Pin indicators on sockets
 * - CPU hub styling for high-connectivity nodes
 *
 * Background/surface/text colors match the global Carbon dashboard.
 *
 * @module symbiote-ui/themes/pcb
 */

/** @type {import('./Theme.js').ThemeDefinition} */
export let PCB_DARK = {
  name: 'pcb-dark',
  tokens: {


    '--sn-sys-surface': '#1a1a1a',
    '--sn-grid-dot': 'rgba(255, 255, 255, 0.04)',
    '--sn-grid-size': '20px',


    '--sn-sys-surface-raised': '#222222',
    '--sn-sys-outline': 'rgba(255, 255, 255, 0.12)',
    '--sn-node-shadow': '0 1px 4px rgba(0, 0, 0, 0.5)',
    '--sn-shadow-color': 'rgba(0, 0, 0, 0.5)',
    '--sn-node-header-bg': '#252525',
    '--sn-sys-accent': '#d4a04a',


    '--sn-font': "'Inter', sans-serif",
    '--sn-sys-on-surface': '#e0e0e0',
    '--sn-sys-on-surface-dim': '#888888',


    '--sn-socket-size': '10px',
    '--sn-socket-border-width': '2px',


    '--sn-conn-color': '#c87533',
    '--sn-conn-width': '1.5',
    '--sn-conn-selected': '#d4a04a',
    '--sn-conn-selected-width': '2.5',
    '--sn-conn-linecap': 'square',
    '--sn-conn-linejoin': 'miter',


    '--sn-conn-dot-fill': '#c87533',
    '--sn-conn-dot-stroke': '#222222',
    '--sn-conn-dot-stroke-width': 'var(--sn-socket-border-width)',
    '--sn-conn-dot-r': 'calc((var(--sn-socket-size) + var(--sn-conn-dot-stroke-width)) / 2)',


    '--sn-frame-border-style': 'dashed',
    '--sn-frame-border-width': '1px',
    '--sn-frame-radius': '6px',


    '--sn-cat-server': '#c87533',
    '--sn-cat-instance': '#4caf50',
    '--sn-cat-control': '#d4a04a',
    '--sn-cat-data': '#5c8dbf',
    '--sn-cat-default': '#555555',
    '--sn-subgraph-accent': 'var(--sn-cat-data)',

    '--sn-cat-directory': '#f0b840',
    '--sn-cat-file': '#5cb8ff',
    '--sn-cat-function': '#4ade80',
    '--sn-cat-class': '#a78bfa',
    '--sn-cat-module': '#ff6b9d',
    '--sn-cat-asset': '#8b8b8b',


    '--sn-sys-surface-overlay': '#2a2a2a',
    '--sn-ctx-border': 'rgba(255, 255, 255, 0.1)',
    '--sn-ctx-color': '#e0e0e0',
    '--sn-ctx-hover': 'rgba(200, 117, 51, 0.15)',


    '--sn-comment-bg': 'rgba(255, 255, 255, 0.03)',
    '--sn-comment-border': 'rgba(255, 255, 255, 0.06)',
    '--sn-comment-radius': '2px',


    '--sn-toolbar-bg': 'rgba(34, 34, 34, 0.95)',
    '--sn-toolbar-border': 'rgba(255, 255, 255, 0.08)',
    '--sn-toolbar-color': '#888888',
    '--sn-toolbar-hover': 'rgba(200, 117, 51, 0.18)',
    '--sn-toolbar-active': '#e0e0e0',
    '--sn-toolbar-danger': 'rgba(244, 67, 54, 0.22)',
    '--sn-toolbar-danger-color': '#f44336',


    '--sn-shape-fill': 'var(--sn-sys-surface-raised)',
    '--sn-shape-stroke': 'var(--sn-sys-outline)',
    '--sn-shape-stroke-width': '0.5',


    '--sn-sys-danger': '#f44336',
    '--sn-sys-success': '#4caf50',
    '--sn-sys-warning': '#ff9800',


    '--sn-hue-base': '0',
    '--sn-hue-accent': '28',
    '--sn-hue-success': '122',
    '--sn-hue-warning': '36',
    '--sn-hue-danger': '4',
    '--sn-hue-data': '210',
    '--sn-sat': '0%',
    '--sn-sat-vivid': '50%',
    '--sn-sat-muted': '0%',
    '--sn-lit-bg': '10%',
    '--sn-lit-surface': '13%',
    '--sn-lit-hover': '18%',
    '--sn-lit-text': '88%',
    '--sn-lit-text-dim': '53%',
    '--sn-lit-accent': '55%',
    '--sn-alpha-overlay': '0.95',
    '--sn-alpha-subtle': '0.12',
    '--sn-alpha-faint': '0.04',
  },


  extraCSS: `
    /* ── IC Chip Decorations (SVG shape nodes only) ── */

    /* IC chip notch marker — SVG shape nodes only */
    graph-node[data-svg-shape]::before {
      content: '';
      position: absolute;
      top: -1.5px;
      left: 50%;
      transform: translateX(-50%);
      width: 16px;
      height: 4px;
      background: var(--sn-sys-surface);
      border-radius: 0 0 4px 4px;
      border: 1px solid var(--sn-sys-outline);
      border-top: none;
      z-index: 1;
    }

    /* Pin markers on node sides — SVG shape nodes only */
    graph-node[data-svg-shape]::after {
      content: '';
      position: absolute;
      top: 50%;
      left: -5px;
      width: 4px;
      height: 4px;
      background: var(--sn-conn-color, #c87533);
      border-radius: 50%;
      transform: translateY(-50%);
      box-shadow: calc(100% + 6px) 0 0 0 var(--sn-conn-color, #c87533);
    }

    /* ── Connection Focus States ── */

    /* Selected node connections — full opacity, gold, thick */
    .sn-conn-path[data-active-conn] {
      opacity: 1 !important;
      stroke-width: var(--sn-conn-selected-width, 2.5) !important;
      stroke: var(--sn-sys-accent) !important;
    }

    /* Dim non-active connections when a node is selected */
    .sn-conn-path[data-dimmed] {
      opacity: 0.3 !important;
    }

    /* LOD: at low zoom, hide connections but keep active visible */
    [data-lod-dimmed] .sn-conn-path,
    [data-lod-dimmed] .sn-conn-marker {
      visibility: hidden;
    }
    [data-lod-dimmed] .sn-conn-path[data-active-conn],
    [data-lod-dimmed] .sn-conn-marker[data-active-conn] {
      visibility: visible;
      opacity: 1 !important;
    }
    .sn-conn-marker[data-collision-hidden] {
      visibility: hidden !important;
      opacity: 0 !important;
      pointer-events: none !important;
    }

    /* ── Compact SVG Shape Sizing ── */
    graph-node[data-svg-shape] {
      min-width: 100px;
      min-height: 60px;
    }

    /* Label styling */
    graph-node .sn-node-label {
      font-weight: 500;
      text-shadow: 0 1px 3px rgba(0,0,0,0.6);
    }

    /* CPU hub (shield shape) — larger, gold accent labels */
    graph-node[node-shape="shield"] .sn-node-label {
      font-size: 11px;
      font-weight: 700;
      color: var(--sn-cat-control, #d4a04a);
    }

    /* Via connections: cross-directory dashed traces */
    .sn-conn-path[data-via] {
      stroke-dasharray: 6 3;
      opacity: 0.7;
    }

    /* Frame label styling override for PCB silkscreen look */
    graph-frame .sn-frame-label {
      text-transform: uppercase;
      letter-spacing: 1px;
      opacity: 0.6;
    }
  `,
};
