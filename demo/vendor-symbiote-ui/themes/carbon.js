/**
 * Carbon — professional dark theme for code analysis
 *
 * Deep neutral greys with blue accent. Zero-saturation base
 * for maximum readability. Matches studio-grade tooling aesthetic.
 *
 * @module symbiote-ui/themes/carbon
 */

/** @type {import('./Theme.js').ThemeDefinition} */
export let CARBON = {
  name: 'carbon',
  tokens: {


    '--sn-hue-base': '0',
    '--sn-hue-accent': '218',
    '--sn-hue-success': '122',
    '--sn-hue-warning': '36',
    '--sn-hue-danger': '4',
    '--sn-hue-data': '265',


    '--sn-sat': '0%',
    '--sn-sat-vivid': '55%',
    '--sn-sat-muted': '0%',


    '--sn-lit-bg': '10%',
    '--sn-lit-surface': '13%',
    '--sn-lit-hover': '27%',
    '--sn-lit-text': '94%',
    '--sn-lit-text-dim': '60%',
    '--sn-lit-accent': '63%',


    '--sn-alpha-overlay': '0.95',
    '--sn-alpha-subtle': '0.15',
    '--sn-alpha-faint': '0.06',


    '--sn-sys-danger': '#f44336',
    '--sn-sys-success': '#4caf50',
    '--sn-sys-warning': '#ff9800',


    '--sn-sys-surface': '#1a1a1a',
    '--sn-grid-dot': 'rgba(255, 255, 255, 0.06)',
    '--sn-grid-size': '20px',


    '--sn-sys-surface-raised': '#222222',
    '--sn-sys-outline': 'rgba(255, 255, 255, 0.1)',
    '--sn-node-radius': '6px',
    '--sn-node-shadow': '0 2px 8px rgba(0, 0, 0, 0.4)',
    '--sn-shadow-color': 'rgba(0, 0, 0, 0.4)',
    '--sn-node-header-bg': '#222222',
    '--sn-sys-accent': '#4c8bf5',


    '--sn-font': "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
    '--sn-sys-on-surface': '#f0f0f0',
    '--sn-sys-on-surface-dim': '#999999',


    '--sn-socket-size': '12px',
    '--sn-socket-border-width': '2px',


    '--sn-conn-color': '#4c8bf5',
    '--sn-conn-width': '2',
    '--sn-conn-selected': '#f44336',


    '--sn-cat-server': '#4c8bf5',
    '--sn-cat-instance': '#4caf50',
    '--sn-cat-control': '#ff9800',
    '--sn-cat-data': '#9c27b0',
    '--sn-cat-default': '#666666',
    '--sn-subgraph-accent': 'var(--sn-cat-data)',


    '--sn-sys-surface-overlay': '#2a2a2a',
    '--sn-ctx-border': 'rgba(255, 255, 255, 0.1)',
    '--sn-ctx-color': '#f0f0f0',
    '--sn-ctx-hover': 'rgba(76, 139, 245, 0.15)',


    '--sn-comment-bg': 'rgba(255, 255, 255, 0.04)',
    '--sn-comment-border': 'rgba(255, 255, 255, 0.08)',
    '--sn-comment-radius': '4px',


    '--sn-toolbar-bg': 'rgba(34, 34, 34, 0.95)',
    '--sn-toolbar-border': 'rgba(255, 255, 255, 0.08)',
    '--sn-toolbar-color': '#999999',
    '--sn-toolbar-hover': 'rgba(76, 139, 245, 0.18)',
    '--sn-toolbar-active': '#f0f0f0',
    '--sn-toolbar-danger': 'rgba(244, 67, 54, 0.22)',
    '--sn-toolbar-danger-color': '#f44336',


    '--sn-shape-fill': 'var(--sn-sys-surface-raised)',
    '--sn-shape-stroke': 'var(--sn-sys-outline)',
    '--sn-shape-stroke-width': '0.4',
  },
};

/** @type {import('./Palette.js').PaletteDefinition} */
export let CARBON_PALETTE = {
  name: 'carbon',
  colors: {
    '--sn-hue-base': '0',
    '--sn-hue-accent': '218',
    '--sn-hue-success': '122',
    '--sn-hue-warning': '36',
    '--sn-hue-danger': '4',
    '--sn-hue-data': '265',
    '--sn-sat': '0%',
    '--sn-sat-vivid': '55%',
    '--sn-sat-muted': '0%',
    '--sn-lit-bg': '10%',
    '--sn-lit-surface': '13%',
    '--sn-lit-hover': '27%',
    '--sn-lit-text': '94%',
    '--sn-lit-text-dim': '60%',
    '--sn-lit-accent': '63%',
    '--sn-alpha-overlay': '0.95',
    '--sn-alpha-subtle': '0.15',
    '--sn-alpha-faint': '0.06',
  },
};
