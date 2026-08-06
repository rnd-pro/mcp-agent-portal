import { themedScrollFadeInlineStyles } from '../../themes/scroll-fade-styles.js';

export default `
:host {
  display: block;
}

  code-block {
    display: block;
    height: 100%;
    overflow: hidden;
  }
  code-block .cb-scroll {
    display: flex;
    height: 100%;
    min-inline-size: 0;
    overflow: auto;
    ${themedScrollFadeInlineStyles}
    align-items: stretch;
    overscroll-behavior: contain;
    -webkit-overflow-scrolling: touch;
  }
  code-block .cb-gutter {
    position: sticky;
    left: 0;
    z-index: 1;
    margin: 0;
    padding: var(--sn-code-gutter-padding, 12px 8px 12px 12px);
    font-family: 'SF Mono', 'Fira Code', 'Cascadia Code', monospace;
    font-size: var(--sn-code-font-size, 12px);
    line-height: 1.6;
    text-align: right;
    color: var(
      --sn-code-gutter-color,
      color-mix(in oklch, var(--sn-sys-on-surface-dim) 64%, var(--sn-sys-surface))
    );
    background: var(
      --sn-code-gutter-bg,
      color-mix(in oklch, var(--sn-sys-surface) 92%, black)
    );
    border-right: 1px solid var(--sn-sys-outline);
    user-select: none;
    white-space: pre;
    min-width: var(--sn-code-gutter-width, 32px);
    flex-shrink: 0;
    /* size to the code's own height, not the scrollport, so the gutter background
       covers every line number; min-height keeps it filling the panel for short files */
    align-self: flex-start;
    min-height: 100%;
  }
  code-block .cb-pre {
    margin: 0;
    padding: var(--sn-code-padding, 12px);
    flex: 1 0 max-content;
    min-inline-size: var(--sn-code-content-min-inline-size, 0);
    font-family: 'SF Mono', 'Fira Code', 'Cascadia Code', monospace;
    font-size: var(--sn-code-font-size, 12px);
    line-height: 1.6;
    color: var(--sn-sys-on-surface);
    tab-size: 2;
    white-space: pre;
    box-sizing: border-box;
  }
  /* Rendered content flow — markdown body with inline content slots, hidden by default */
  code-block .cb-flow {
    display: none;
    flex-direction: column;
    flex: 1;
    min-width: 0;
    padding: var(--sn-code-markdown-padding, 20px 28px);
  }
  code-block .cb-md {
    overflow-wrap: break-word;
    word-wrap: break-word;
    line-height: 1.7;
    color: var(--sn-sys-on-surface);
    font-family: var(--sn-font);
    font-size: var(--sn-code-markdown-size, 14px);
    min-width: 0;
  }
  code-block .cb-content-slot {
    min-width: 0;
  }
  code-block .cb-content-slot:empty {
    display: none;
  }
  /* Image container — hidden by default */
  code-block .cb-img-wrap {
    display: none;
    flex: 1;
    padding: var(--sn-code-markdown-padding, 20px);
    justify-content: center;
    align-items: center;
    background: repeating-conic-gradient(var(--sn-sys-warning) 0% 25%, var(--sn-sys-surface) 0% 50%) 0 0 / 16px 16px;
  }
  code-block .cb-img {
    max-width: 100%;
    max-height: 100%;
    object-fit: contain;
    border-radius: var(--sn-radius-sm);
    box-shadow: var(--sn-sys-shadow-raised);
  }
  /* In markdown mode: hide code, show md */
  code-block[mode-markdown] .cb-gutter { display: none; }
  code-block[mode-markdown] .cb-pre { display: none; }
  code-block[mode-markdown] .cb-flow { display: flex; }
  /* In image mode: hide code, show image */
  code-block[mode-image] .cb-gutter { display: none; }
  code-block[mode-image] .cb-pre { display: none; }
  code-block[mode-image] .cb-img-wrap { display: flex; }

  code-block[line-numbers="hide"] .cb-gutter { display: none; }

  /* Markdown styles */
  code-block .md-h { margin: var(--sn-step-9, 20px) 0 var(--sn-step-4, 8px); color: var(--sn-sys-on-surface); font-weight: 700; }
  code-block h1.md-h { font-size: var(--sn-markdown-h1-size, 24px); border-bottom: 2px solid var(--sn-sys-outline); padding-bottom: 8px; }
  code-block h2.md-h { font-size: var(--sn-markdown-h2-size, 20px); border-bottom: 1px solid var(--sn-sys-outline); padding-bottom: 6px; }
  code-block h3.md-h { font-size: var(--sn-markdown-h3-size, 16px); }
  code-block h4.md-h { font-size: var(--sn-markdown-h4-size, 14px); }
  code-block .md-p { margin: var(--sn-step-4, 8px) 0; }
  code-block .md-quote {
    margin: var(--sn-step-4) 0;
    padding: var(--sn-step-4) var(--sn-step-8);
    border-left: 4px solid var(--sn-cat-server);
    background: var(--sn-accent-bg-subtle);
    border-radius: 0 var(--sn-radius-sm) var(--sn-radius-sm) 0;
    font-style: italic;
  }
  code-block .md-list {
    margin: var(--sn-step-4) 0;
    padding-left: var(--sn-step-10);
  }
  code-block .md-list li {
    margin: var(--sn-step-1, 3px) 0;
  }
  code-block .md-code-block {
    margin: var(--sn-step-6) 0;
    padding: var(--sn-code-padding, 12px 16px);
    background: var(--sn-sys-surface);
    border: 1px solid var(--sn-sys-outline);
    border-radius: var(--sn-radius-md);
    font-family: 'SF Mono', 'Fira Code', monospace;
    font-size: var(--sn-code-font-size, 12px);
    line-height: 1.6;
    overflow-x: auto;
    ${themedScrollFadeInlineStyles}
    white-space: pre;
  }
  code-block .md-inline-code {
    padding: var(--sn-step-0, 1px) var(--sn-step-2, 5px);
    background: color-mix(in oklch, var(--sn-sys-accent) var(--sn-sys-state-hover-mix), var(--sn-sys-surface));
    border-radius: var(--sn-radius-xs, 3px);
    font-family: 'SF Mono', 'Fira Code', monospace;
    font-size: 0.9em;
  }
  code-block .md-link {
    color: var(--sn-cat-server);
    text-decoration: underline;
    text-decoration-style: dotted;
  }
  code-block .md-link:hover { text-decoration-style: solid; }
  code-block .md-img {
    max-width: 100%;
    height: auto;
    border-radius: var(--sn-radius-md);
    margin: var(--sn-step-4) 0;
    border: 1px solid var(--sn-sys-outline);
    box-shadow: var(--sn-sys-shadow-raised);
  }
  code-block .md-hr {
    border: none;
    border-top: 1px solid var(--sn-sys-outline);
    margin: var(--sn-step-8) 0;
  }
  code-block .md-table {
    width: 100%;
    border-collapse: collapse;
    margin: var(--sn-step-6) 0;
    font-size: var(--sn-code-table-size, 13px);
  }
  code-block .md-table th,
  code-block .md-table td {
    padding: var(--sn-code-table-cell-padding, 6px 12px);
    border: 1px solid var(--sn-sys-outline);
    text-align: left;
  }
  code-block .md-table th {
    background: color-mix(in oklch, var(--sn-sys-accent) var(--sn-sys-state-hover-mix), var(--sn-sys-surface));
    font-weight: 600;
  }
  code-block .md-table tr:hover td {
    background: var(--sn-code-table-row-hover-bg, color-mix(in oklch, var(--sn-sys-accent) var(--sn-sys-state-hover-mix), var(--sn-sys-surface)));
  }
  /* Token colors */
  code-block .t-kw   { color: var(--sn-syntax-keyword); }
  code-block .t-str  { color: var(--sn-syntax-string); }
  code-block .t-cm   { color: var(--sn-syntax-comment); font-style: italic; }
  code-block .t-fn   { color: var(--sn-syntax-function); }
  code-block .t-num  { color: var(--sn-syntax-number); }
  code-block .t-bi   { color: var(--sn-syntax-builtin); }
  code-block .t-prop { color: var(--sn-syntax-property); }
  code-block .t-lit  { color: var(--sn-syntax-literal); }
  /* JSDoc */
  code-block .t-jd   { color: var(--sn-syntax-doc); font-style: italic; }
  code-block .t-jd-tag  { color: var(--sn-syntax-doc-tag); font-style: normal; font-weight: 500; }
  code-block .t-jd-type { color: var(--sn-syntax-doc-type); font-style: normal; }
  /* Template literal inner highlighting */
  code-block .t-tl       { color: var(--sn-syntax-template); }
  code-block .t-tl-tag   { color: var(--sn-syntax-template-tag); }
  code-block .t-tl-attr  { color: var(--sn-syntax-template-attr); }
  code-block .t-tl-bracket { color: var(--sn-syntax-template-bracket); }
  code-block .t-tl-interp { color: var(--sn-syntax-template-interpolation); }
  code-block .t-tl-sel   { color: var(--sn-syntax-template-selector); }
  code-block .t-tl-prop  { color: var(--sn-syntax-template-property); }
  code-block .t-tl-val   { color: var(--sn-syntax-template-value); }
  /* Lint squiggles */
  code-block .cb-scroll { position: relative; }
  code-block .cb-squiggle-layer { position: absolute; top: 0; left: 0; right: 0; bottom: 0; pointer-events: none; z-index: 2; }
  code-block .cb-squiggle { position: absolute; right: 0; height: calc(var(--sn-code-font-size, 12px) * 1.6); pointer-events: auto; cursor: help; border-radius: 2px; }
  code-block .cb-sev-2 { background: var(--sn-diagnostic-error-bg); border-bottom: 2px wavy var(--sn-diagnostic-error-border); }
  code-block .cb-sev-1 { background: var(--sn-diagnostic-warning-bg); border-bottom: 2px wavy var(--sn-diagnostic-warning-border); }

  code-block .cb-toolbar {
    display: none;
    align-items: center;
    justify-content: space-between;
    padding: var(--sn-code-toolbar-padding, 6px 12px);
    background: var(--sn-code-toolbar-bg, var(--sn-sys-surface-raised, color-mix(in oklch, var(--sn-sys-surface) 96%, black)));
    border-bottom: 1px solid var(--sn-sys-outline); /* audit-ok: raw 1px border is standard across UI panels */
    font-family: var(--sn-font, sans-serif);
    font-size: var(--sn-code-toolbar-font-size, 11px);
    color: var(--sn-sys-on-surface-dim);
  }
  code-block .cb-toolbar.cb-toolbar-visible {
    display: flex;
  }
  code-block .cb-lang-label {
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px; /* audit-ok: raw 0.5px tracking is standard brand styling for uppercase labels */
  }
  code-block .cb-lang-label.cb-lang-hidden {
    display: none;
  }
  code-block .cb-copy-btn {
    background: transparent;
    border: 1px solid var(--sn-sys-outline); /* audit-ok: raw 1px border matches default system panel styling */
    border-radius: var(--sn-radius-xs, 4px);
    color: var(--sn-sys-on-surface-dim);
    padding: var(--sn-step-2, 4px) var(--sn-step-4, 8px);
    cursor: pointer;
    font-size: var(--sn-code-toolbar-font-size, 11px);
    transition: background-color var(--sn-transition-fast, 120ms) var(--sn-transition-easing, ease), color var(--sn-transition-fast, 120ms) var(--sn-transition-easing, ease), border-color var(--sn-transition-fast, 120ms) var(--sn-transition-easing, ease);
    display: inline-flex;
    align-items: center;
  }
  code-block .cb-copy-btn:hover {
    background: var(--sn-sys-surface-hover, color-mix(in oklch, var(--sn-sys-surface) 90%, black));
    color: var(--sn-sys-on-surface);
  }
  code-block .cb-copy-btn.cb-copy-hidden {
    display: none;
  }

  code-block[frameless] .cb-pre,
  code-block[frameless] .cb-gutter,
  code-block[frameless] .cb-scroll {
    border: none !important;
    border-radius: 0 !important;
    background: transparent !important;
  }
`;
