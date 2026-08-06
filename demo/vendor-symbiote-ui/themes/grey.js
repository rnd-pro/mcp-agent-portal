/**
 * Grey Neutral — professional muted grey theme
 *
 * Zero saturation base (achromatic). All variation through
 * lightness only. Category accents retain color.
 *
 * @module symbiote-ui/themes/grey
 */

/** @type {import('./Theme.js').ThemeDefinition} */
export let GREY_NEUTRAL = {
  name: 'grey-neutral',
  tokens: {


    '--sn-hue-base': '0',
    '--sn-hue-accent': '207',
    '--sn-hue-success': '136',
    '--sn-hue-warning': '40',
    '--sn-hue-danger': '7',
    '--sn-hue-data': '265',


    '--sn-sat': '0%',
    '--sn-sat-vivid': '50%',
    '--sn-sat-muted': '0%',


    '--sn-lit-bg': '18%',
    '--sn-lit-surface': '24%',
    '--sn-lit-hover': '29%',
    '--sn-lit-text': '83%',
    '--sn-lit-text-dim': '63%',
    '--sn-lit-accent': '65%',


    '--sn-alpha-overlay': '0.94',
    '--sn-alpha-subtle': '0.15',
    '--sn-alpha-faint': '0.1',


    '--sn-sys-danger': 'hsl(var(--sn-hue-danger), var(--sn-sat-vivid), var(--sn-lit-accent))',
    '--sn-sys-success': 'hsl(var(--sn-hue-success), var(--sn-sat-vivid), var(--sn-lit-accent))',
    '--sn-sys-warning': 'hsl(var(--sn-hue-warning), var(--sn-sat-vivid), var(--sn-lit-accent))',


    '--sn-sys-surface': 'hsl(var(--sn-hue-base), var(--sn-sat), var(--sn-lit-bg))',
    '--sn-grid-dot': 'hsla(0, 0%, 100%, var(--sn-alpha-faint))',
    '--sn-grid-size': '20px',


    '--sn-sys-surface-raised': 'hsl(var(--sn-hue-base), var(--sn-sat), var(--sn-lit-surface))',
    '--sn-sys-outline': 'hsl(var(--sn-hue-base), var(--sn-sat), 33%)',
    '--sn-node-radius': '6px',
    '--sn-node-shadow': '0 2px 8px rgba(0, 0, 0, 0.4)',
    '--sn-shadow-color': 'rgba(0, 0, 0, 0.4)',
    '--sn-node-header-bg': 'hsl(var(--sn-hue-base), var(--sn-sat), 20%)',
    '--sn-sys-accent': 'hsl(var(--sn-hue-accent), var(--sn-sat-vivid), var(--sn-lit-accent))',


    '--sn-font': "'Inter', sans-serif",
    '--sn-sys-on-surface': 'hsl(0, 0%, var(--sn-lit-text))',
    '--sn-sys-on-surface-dim': 'hsl(0, 0%, var(--sn-lit-text-dim))',


    '--sn-socket-size': '12px',
    '--sn-socket-border-width': '2px',


    '--sn-conn-color': 'hsl(0, 0%, 54%)',
    '--sn-conn-width': '2',
    '--sn-conn-selected': 'hsl(var(--sn-hue-danger), var(--sn-sat-vivid), 60%)',


    '--sn-cat-server': 'hsl(var(--sn-hue-accent), var(--sn-sat-vivid), 68%)',
    '--sn-cat-instance': 'hsl(var(--sn-hue-success), var(--sn-sat-vivid), 58%)',
    '--sn-cat-control': 'hsl(var(--sn-hue-warning), var(--sn-sat-vivid), 60%)',
    '--sn-cat-data': 'hsl(var(--sn-hue-data), var(--sn-sat-vivid), 68%)',
    '--sn-cat-default': 'hsl(0, 0%, 60%)',
    '--sn-subgraph-accent': 'var(--sn-cat-data)',


    '--sn-sys-surface-overlay': 'hsl(0, 0%, 22%)',
    '--sn-ctx-border': 'hsl(0, 0%, 33%)',
    '--sn-ctx-color': 'hsl(0, 0%, var(--sn-lit-text))',
    '--sn-ctx-hover':
      'hsla(var(--sn-hue-accent), var(--sn-sat-vivid), var(--sn-lit-accent), var(--sn-alpha-subtle))',


    '--sn-comment-bg': 'hsla(0, 0%, 100%, 0.04)',
    '--sn-comment-border': 'hsla(0, 0%, 100%, 0.08)',
    '--sn-comment-radius': '4px',


    '--sn-toolbar-bg': 'hsla(0, 0%, 22%, var(--sn-alpha-overlay))',
    '--sn-toolbar-border': 'hsla(0, 0%, 100%, 0.08)',
    '--sn-toolbar-color': 'hsl(0, 0%, 67%)',
    '--sn-toolbar-hover':
      'hsla(var(--sn-hue-accent), var(--sn-sat-vivid), var(--sn-lit-accent), 0.18)',
    '--sn-toolbar-active': 'hsl(0, 0%, var(--sn-lit-text))',
    '--sn-toolbar-danger': 'hsla(var(--sn-hue-danger), var(--sn-sat-vivid), 60%, 0.22)',
    '--sn-toolbar-danger-color': 'hsl(var(--sn-hue-danger), var(--sn-sat-vivid), 60%)',


    '--sn-shape-fill': 'var(--sn-sys-surface-raised)',
    '--sn-shape-stroke': 'var(--sn-sys-outline)',
    '--sn-shape-stroke-width': '0.4',
  },
};

/** @type {import('./Palette.js').PaletteDefinition} */
export let GREY_PALETTE = {
  name: 'grey',
  colors: {
    '--sn-hue-base': '0',
    '--sn-hue-accent': '207',
    '--sn-hue-success': '136',
    '--sn-hue-warning': '40',
    '--sn-hue-danger': '7',
    '--sn-hue-data': '265',
    '--sn-sat': '0%',
    '--sn-sat-vivid': '50%',
    '--sn-sat-muted': '0%',
    '--sn-lit-bg': '18%',
    '--sn-lit-surface': '24%',
    '--sn-lit-hover': '29%',
    '--sn-lit-text': '83%',
    '--sn-lit-text-dim': '63%',
    '--sn-lit-accent': '65%',
    '--sn-alpha-overlay': '0.94',
    '--sn-alpha-subtle': '0.15',
    '--sn-alpha-faint': '0.1',
  },
};
