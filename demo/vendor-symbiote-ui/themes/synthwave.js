/**
 * Synthwave — neon retrowave theme
 *
 * High saturation (60%), purple base hue (270).
 * Neon accents with vivid category colors.
 *
 * @module symbiote-ui/themes/synthwave
 */

/** @type {import('./Theme.js').ThemeDefinition} */
export let SYNTHWAVE = {
  name: 'synthwave',
  tokens: {


    '--sn-hue-base': '270',
    '--sn-hue-accent': '300',
    '--sn-hue-success': '180',
    '--sn-hue-warning': '60',
    '--sn-hue-danger': '0',
    '--sn-hue-data': '300',


    '--sn-sat': '45%',
    '--sn-sat-vivid': '100%',
    '--sn-sat-muted': '25%',


    '--sn-lit-bg': '6%',
    '--sn-lit-surface': '12%',
    '--sn-lit-hover': '32%',
    '--sn-lit-text': '88%',
    '--sn-lit-text-dim': '48%',
    '--sn-lit-accent': '55%',


    '--sn-alpha-overlay': '0.92',
    '--sn-alpha-subtle': '0.2',
    '--sn-alpha-faint': '0.08',


    '--sn-sys-danger': 'hsl(var(--sn-hue-danger), var(--sn-sat-vivid), var(--sn-lit-accent))',
    '--sn-sys-success': 'hsl(var(--sn-hue-success), var(--sn-sat-vivid), var(--sn-lit-accent))',
    '--sn-sys-warning': 'hsl(var(--sn-hue-warning), var(--sn-sat-vivid), var(--sn-lit-accent))',


    '--sn-sys-surface': 'hsl(var(--sn-hue-base), var(--sn-sat), var(--sn-lit-bg))',
    '--sn-grid-dot': 'hsla(var(--sn-hue-accent), var(--sn-sat-vivid), 50%, var(--sn-alpha-faint))',
    '--sn-grid-size': '24px',


    '--sn-sys-surface-raised': 'hsl(var(--sn-hue-base), var(--sn-sat), var(--sn-lit-surface))',
    '--sn-sys-outline': 'hsl(var(--sn-hue-base), var(--sn-sat-muted), 25%)',
    '--sn-node-radius': '12px',
    '--sn-node-shadow': '0 4px 20px hsla(var(--sn-hue-base), var(--sn-sat-vivid), 50%, 0.2)',
    '--sn-shadow-color': 'hsla(var(--sn-hue-base), var(--sn-sat-vivid), 50%, 0.2)',
    '--sn-sys-accent': 'hsl(var(--sn-hue-accent), var(--sn-sat-vivid), 50%)',
    '--sn-node-header-bg': 'hsl(var(--sn-hue-base), var(--sn-sat), 9%)',


    '--sn-font': "'Space Grotesk', sans-serif",
    '--sn-sys-on-surface': 'hsl(var(--sn-hue-base), 30%, var(--sn-lit-text))',
    '--sn-sys-on-surface-dim': 'hsl(var(--sn-hue-base), 20%, var(--sn-lit-text-dim))',


    '--sn-socket-size': '14px',
    '--sn-socket-border-width': '2px',


    '--sn-conn-color': 'hsl(var(--sn-hue-accent), var(--sn-sat-vivid), 50%)',
    '--sn-conn-width': '2.5',
    '--sn-conn-selected': 'hsl(var(--sn-hue-success), var(--sn-sat-vivid), 50%)',


    '--sn-cat-server': 'hsl(340, 100%, 70%)',
    '--sn-cat-instance': 'hsl(var(--sn-hue-success), var(--sn-sat-vivid), 50%)',
    '--sn-cat-control': 'hsl(var(--sn-hue-warning), var(--sn-sat-vivid), 50%)',
    '--sn-cat-data': 'hsl(var(--sn-hue-data), var(--sn-sat-vivid), 50%)',
    '--sn-cat-default': 'hsl(var(--sn-hue-base), 20%, var(--sn-lit-text-dim))',
    '--sn-subgraph-accent': 'var(--sn-cat-data)',


    '--sn-sys-surface-overlay': 'hsl(var(--sn-hue-base), var(--sn-sat), var(--sn-lit-surface))',
    '--sn-ctx-border': 'hsl(var(--sn-hue-base), var(--sn-sat-muted), 25%)',
    '--sn-ctx-color': 'hsl(var(--sn-hue-base), 30%, var(--sn-lit-text))',
    '--sn-ctx-hover':
      'hsla(var(--sn-hue-accent), var(--sn-sat-vivid), 50%, var(--sn-alpha-subtle))',


    '--sn-comment-bg': 'hsla(var(--sn-hue-accent), var(--sn-sat-vivid), 50%, 0.05)',
    '--sn-comment-border': 'hsla(var(--sn-hue-accent), var(--sn-sat-vivid), 50%, 0.15)',
    '--sn-comment-radius': '8px',


    '--sn-toolbar-bg':
      'hsla(var(--sn-hue-base), var(--sn-sat), var(--sn-lit-surface), var(--sn-alpha-overlay))',
    '--sn-toolbar-border': 'hsla(var(--sn-hue-accent), var(--sn-sat-vivid), 50%, 0.2)',
    '--sn-toolbar-color': 'hsl(var(--sn-hue-base), 20%, 70%)',
    '--sn-toolbar-hover': 'hsla(var(--sn-hue-accent), var(--sn-sat-vivid), 50%, 0.2)',
    '--sn-toolbar-active': 'hsl(var(--sn-hue-base), 30%, var(--sn-lit-text))',
    '--sn-toolbar-danger':
      'hsla(var(--sn-hue-danger), var(--sn-sat-vivid), var(--sn-lit-accent), 0.25)',
    '--sn-toolbar-danger-color': 'hsl(var(--sn-hue-danger), 80%, 60%)',


    '--sn-shape-fill': 'var(--sn-sys-surface-raised)',
    '--sn-shape-stroke': 'var(--sn-sys-outline)',
    '--sn-shape-stroke-width': '0.4',
  },
};

/** @type {import('./Palette.js').PaletteDefinition} */
export let SYNTHWAVE_PALETTE = {
  name: 'synthwave',
  colors: {
    '--sn-hue-base': '270',
    '--sn-hue-accent': '300',
    '--sn-hue-success': '180',
    '--sn-hue-warning': '60',
    '--sn-hue-danger': '0',
    '--sn-hue-data': '300',
    '--sn-sat': '45%',
    '--sn-sat-vivid': '100%',
    '--sn-sat-muted': '25%',
    '--sn-lit-bg': '6%',
    '--sn-lit-surface': '12%',
    '--sn-lit-hover': '32%',
    '--sn-lit-text': '88%',
    '--sn-lit-text-dim': '48%',
    '--sn-lit-accent': '55%',
    '--sn-alpha-overlay': '0.92',
    '--sn-alpha-subtle': '0.2',
    '--sn-alpha-faint': '0.08',
  },
};
