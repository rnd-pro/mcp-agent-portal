/**
 * Neon Glow — electric neon theme with luminous edges
 *
 * Deep black base (hue 230) with electric cyan accent (185).
 * All borders and shapes emit visible glow via elevated alpha
 * and vivid saturation. Designed for maximum visual impact.
 *
 * @module symbiote-ui/themes/neon
 */

/** @type {import('./Theme.js').ThemeDefinition} */
export let NEON_GLOW = {
  name: 'neon-glow',
  tokens: {


    '--sn-hue-base': '230',
    '--sn-hue-accent': '185',
    '--sn-hue-success': '150',
    '--sn-hue-warning': '50',
    '--sn-hue-danger': '355',
    '--sn-hue-data': '280',


    '--sn-sat': '30%',
    '--sn-sat-vivid': '100%',
    '--sn-sat-muted': '15%',


    '--sn-lit-bg': '4%',
    '--sn-lit-surface': '8%',
    '--sn-lit-hover': '14%',
    '--sn-lit-text': '90%',
    '--sn-lit-text-dim': '55%',
    '--sn-lit-accent': '60%',


    '--sn-alpha-overlay': '0.94',
    '--sn-alpha-subtle': '0.2',
    '--sn-alpha-faint': '0.06',


    '--sn-sys-danger': 'hsl(var(--sn-hue-danger), var(--sn-sat-vivid), var(--sn-lit-accent))',
    '--sn-sys-success': 'hsl(var(--sn-hue-success), var(--sn-sat-vivid), var(--sn-lit-accent))',
    '--sn-sys-warning': 'hsl(var(--sn-hue-warning), var(--sn-sat-vivid), var(--sn-lit-accent))',


    '--sn-sys-surface': 'hsl(var(--sn-hue-base), var(--sn-sat), var(--sn-lit-bg))',
    '--sn-grid-dot': 'hsla(var(--sn-hue-accent), var(--sn-sat-vivid), 50%, 0.12)',
    '--sn-grid-size': '22px',


    '--sn-sys-surface-raised': 'hsla(var(--sn-hue-base), var(--sn-sat), var(--sn-lit-surface), 0.9)',
    '--sn-sys-outline': 'hsl(var(--sn-hue-accent), 60%, 30%)',
    '--sn-node-radius': '8px',
    '--sn-node-shadow':
      '0 0 12px hsla(var(--sn-hue-accent), var(--sn-sat-vivid), 50%, 0.15), 0 4px 16px rgba(0, 0, 0, 0.5)',
    '--sn-shadow-color': 'hsla(var(--sn-hue-accent), var(--sn-sat-vivid), 50%, 0.15)',
    '--sn-sys-accent': 'hsl(var(--sn-hue-accent), var(--sn-sat-vivid), 55%)',
    '--sn-node-header-bg': 'hsla(var(--sn-hue-accent), 40%, 10%, 0.6)',


    '--sn-font': "'JetBrains Mono', 'Fira Code', monospace",
    '--sn-sys-on-surface': 'hsl(var(--sn-hue-accent), 20%, var(--sn-lit-text))',
    '--sn-sys-on-surface-dim': 'hsl(var(--sn-hue-accent), 15%, var(--sn-lit-text-dim))',


    '--sn-socket-size': '12px',
    '--sn-socket-border-width': '2px',


    '--sn-conn-color': 'hsl(var(--sn-hue-accent), var(--sn-sat-vivid), 55%)',
    '--sn-conn-width': '2',
    '--sn-conn-selected': 'hsl(var(--sn-hue-danger), var(--sn-sat-vivid), 60%)',


    '--sn-cat-server': 'hsl(var(--sn-hue-accent), var(--sn-sat-vivid), 55%)',
    '--sn-cat-instance': 'hsl(var(--sn-hue-success), var(--sn-sat-vivid), 55%)',
    '--sn-cat-control': 'hsl(var(--sn-hue-warning), var(--sn-sat-vivid), 55%)',
    '--sn-cat-data': 'hsl(var(--sn-hue-data), var(--sn-sat-vivid), 65%)',
    '--sn-cat-default': 'hsl(var(--sn-hue-accent), 30%, 45%)',
    '--sn-subgraph-accent': 'var(--sn-cat-data)',


    '--sn-sys-surface-overlay': 'hsla(var(--sn-hue-base), var(--sn-sat), 6%, 0.96)',
    '--sn-ctx-border': 'hsl(var(--sn-hue-accent), 50%, 25%)',
    '--sn-ctx-color': 'hsl(var(--sn-hue-accent), 20%, var(--sn-lit-text))',
    '--sn-ctx-hover': 'hsla(var(--sn-hue-accent), var(--sn-sat-vivid), 50%, 0.15)',


    '--sn-comment-bg': 'hsla(var(--sn-hue-accent), 80%, 50%, 0.04)',
    '--sn-comment-border': 'hsla(var(--sn-hue-accent), 80%, 50%, 0.12)',
    '--sn-comment-radius': '6px',


    '--sn-toolbar-bg': 'hsla(var(--sn-hue-base), var(--sn-sat), 6%, var(--sn-alpha-overlay))',
    '--sn-toolbar-border': 'hsla(var(--sn-hue-accent), 80%, 50%, 0.25)',
    '--sn-toolbar-color': 'hsl(var(--sn-hue-accent), 25%, 60%)',
    '--sn-toolbar-hover': 'hsla(var(--sn-hue-accent), var(--sn-sat-vivid), 50%, 0.18)',
    '--sn-toolbar-active': 'hsl(var(--sn-hue-accent), 40%, var(--sn-lit-text))',
    '--sn-toolbar-danger':
      'hsla(var(--sn-hue-danger), var(--sn-sat-vivid), var(--sn-lit-accent), 0.2)',
    '--sn-toolbar-danger-color': 'hsl(var(--sn-hue-danger), var(--sn-sat-vivid), 60%)',


    '--sn-shape-fill': 'var(--sn-sys-surface-raised)',
    '--sn-shape-stroke': 'hsl(var(--sn-hue-accent), 60%, 35%)',
    '--sn-shape-stroke-width': '0.5',
  },
};

/** @type {import('./Palette.js').PaletteDefinition} */
export let NEON_PALETTE = {
  name: 'neon',
  colors: {
    '--sn-hue-base': '230',
    '--sn-hue-accent': '185',
    '--sn-hue-success': '150',
    '--sn-hue-warning': '50',
    '--sn-hue-danger': '355',
    '--sn-hue-data': '280',
    '--sn-sat': '30%',
    '--sn-sat-vivid': '100%',
    '--sn-sat-muted': '15%',
    '--sn-lit-bg': '4%',
    '--sn-lit-surface': '8%',
    '--sn-lit-hover': '14%',
    '--sn-lit-text': '90%',
    '--sn-lit-text-dim': '55%',
    '--sn-lit-accent': '60%',
    '--sn-alpha-overlay': '0.94',
    '--sn-alpha-subtle': '0.2',
    '--sn-alpha-faint': '0.06',
  },
};
