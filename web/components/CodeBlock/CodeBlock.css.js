export default `
  code-block {
    display: block;
    height: 100%;
    overflow: hidden;
  }
  code-block .cb-scroll {
    display: flex;
    height: 100%;
    overflow: auto;
    align-items: stretch;
  }
  code-block .cb-gutter {
    position: sticky;
    left: 0;
    z-index: 1;
    margin: 0;
    padding: 12px 8px 12px 12px;
    font-family: 'SF Mono', 'Fira Code', 'Cascadia Code', monospace;
    font-size: 12px;
    line-height: 1.6;
    text-align: right;
    color: var(--sn-text-dim, hsl(30, 10%, 55%));
    opacity: 0.45;
    background: var(--sn-bg, hsl(37, 30%, 96%));
    border-right: 1px solid var(--sn-node-border, hsl(35, 18%, 88%));
    user-select: none;
    white-space: pre;
    min-width: 32px;
    flex-shrink: 0;
  }
  code-block .cb-pre {
    margin: 0;
    padding: 12px;
    flex: 1;
    min-width: 0;
    font-family: 'SF Mono', 'Fira Code', 'Cascadia Code', monospace;
    font-size: 12px;
    line-height: 1.6;
    color: var(--sn-text, hsl(30, 15%, 18%));
    tab-size: 2;
    white-space: pre;
    box-sizing: border-box;
  }
  /* Markdown container — hidden by default */
  code-block .cb-md {
    display: none;
    padding: 20px 28px;
    flex: 1;
    min-width: 0;
    overflow-wrap: break-word;
    word-wrap: break-word;
    line-height: 1.7;
    color: var(--sn-text, hsl(30, 15%, 18%));
    font-family: var(--sn-font, 'Inter', -apple-system, sans-serif);
    font-size: 14px;
  }
  /* Image container — hidden by default */
  code-block .cb-img-wrap {
    display: none;
    flex: 1;
    padding: 20px;
    justify-content: center;
    align-items: center;
    background: repeating-conic-gradient(hsl(30, 10%, 88%) 0% 25%, hsl(30, 10%, 94%) 0% 50%) 0 0 / 16px 16px;
  }
  code-block .cb-img {
    max-width: 100%;
    max-height: 100%;
    object-fit: contain;
    border-radius: 4px;
    box-shadow: 0 2px 12px rgba(0,0,0,0.12);
  }
  /* In markdown mode: hide code, show md */
  code-block[mode-markdown] .cb-gutter { display: none; }
  code-block[mode-markdown] .cb-pre { display: none; }
  code-block[mode-markdown] .cb-md { display: block; }
  /* In image mode: hide code, show image */
  code-block[mode-image] .cb-gutter { display: none; }
  code-block[mode-image] .cb-pre { display: none; }
  code-block[mode-image] .cb-img-wrap { display: flex; }

  /* Markdown styles */
  code-block .md-h { margin: 20px 0 8px; color: var(--sn-text, #222); font-weight: 700; }
  code-block h1.md-h { font-size: 24px; border-bottom: 2px solid var(--sn-node-border, #ddd); padding-bottom: 8px; }
  code-block h2.md-h { font-size: 20px; border-bottom: 1px solid var(--sn-node-border, #ddd); padding-bottom: 6px; }
  code-block h3.md-h { font-size: 16px; }
  code-block h4.md-h { font-size: 14px; }
  code-block .md-p { margin: 8px 0; }
  code-block .md-quote {
    margin: 8px 0;
    padding: 8px 16px;
    border-left: 4px solid var(--sn-cat-server, hsl(210, 45%, 55%));
    background: hsla(210, 40%, 55%, 0.08);
    border-radius: 0 4px 4px 0;
    font-style: italic;
  }
  code-block .md-list {
    margin: 8px 0;
    padding-left: 24px;
  }
  code-block .md-list li {
    margin: 3px 0;
  }
  code-block .md-code-block {
    margin: 12px 0;
    padding: 12px 16px;
    background: var(--sn-bg, hsl(37, 30%, 94%));
    border: 1px solid var(--sn-node-border, hsl(35, 18%, 85%));
    border-radius: 6px;
    font-family: 'SF Mono', 'Fira Code', monospace;
    font-size: 12px;
    line-height: 1.6;
    overflow-x: auto;
    white-space: pre;
  }
  code-block .md-inline-code {
    padding: 1px 5px;
    background: hsla(30, 20%, 50%, 0.12);
    border-radius: 3px;
    font-family: 'SF Mono', 'Fira Code', monospace;
    font-size: 0.9em;
  }
  code-block .md-link {
    color: var(--sn-cat-server, hsl(210, 55%, 50%));
    text-decoration: underline;
    text-decoration-style: dotted;
  }
  code-block .md-link:hover { text-decoration-style: solid; }
  code-block .md-img {
    max-width: 100%;
    height: auto;
    border-radius: 6px;
    margin: 8px 0;
    border: 1px solid var(--sn-node-border, hsl(35, 18%, 85%));
    box-shadow: 0 2px 8px rgba(0,0,0,0.08);
  }
  code-block .md-hr {
    border: none;
    border-top: 1px solid var(--sn-node-border, hsl(35, 18%, 85%));
    margin: 16px 0;
  }
  code-block .md-table {
    width: 100%;
    border-collapse: collapse;
    margin: 12px 0;
    font-size: 13px;
  }
  code-block .md-table th,
  code-block .md-table td {
    padding: 6px 12px;
    border: 1px solid var(--sn-node-border, hsl(35, 18%, 85%));
    text-align: left;
  }
  code-block .md-table th {
    background: hsla(30, 15%, 50%, 0.08);
    font-weight: 600;
  }
  code-block .md-table tr:hover td {
    background: hsla(30, 15%, 50%, 0.04);
  }
  /* Token colors */
  code-block .t-kw   { color: rgb(254, 165, 176); }
  code-block .t-str  { color: rgb(251, 182, 79); }
  code-block .t-cm   { color: rgb(149, 149, 149); font-style: italic; }
  code-block .t-fn   { color: rgb(180, 243, 255); }
  code-block .t-num  { color: rgb(251, 182, 79); }
  code-block .t-bi   { color: rgb(180, 243, 255); }
  code-block .t-prop { color: rgb(238, 131, 252); }
  code-block .t-lit  { color: rgb(254, 165, 176); }
  /* JSDoc */
  code-block .t-jd   { color: rgb(130, 155, 130); font-style: italic; }
  code-block .t-jd-tag  { color: rgb(180, 220, 140); font-style: normal; font-weight: 500; }
  code-block .t-jd-type { color: rgb(130, 210, 240); font-style: normal; }
  /* Template literal inner highlighting */
  code-block .t-tl       { color: rgb(206, 145, 120); }
  code-block .t-tl-tag   { color: rgb(86, 182, 194); }
  code-block .t-tl-attr  { color: rgb(156, 220, 254); }
  code-block .t-tl-bracket { color: rgb(128, 128, 128); }
  code-block .t-tl-interp { color: rgb(220, 220, 170); }
  code-block .t-tl-sel   { color: rgb(215, 186, 125); }
  code-block .t-tl-prop  { color: rgb(156, 220, 254); }
  code-block .t-tl-val   { color: rgb(206, 145, 120); }
  /* Lint squiggles */
  code-block .cb-scroll { position: relative; }
  code-block .cb-squiggle-layer { position: absolute; top: 0; left: 0; right: 0; bottom: 0; pointer-events: none; z-index: 2; }
  code-block .cb-squiggle { position: absolute; right: 0; height: 19.2px; pointer-events: auto; cursor: help; border-radius: 2px; }
  code-block .cb-sev-2 { background: hsla(0, 80%, 55%, 0.07); border-bottom: 2px wavy hsla(0, 80%, 55%, 0.55); }
  code-block .cb-sev-1 { background: hsla(40, 80%, 55%, 0.05); border-bottom: 2px wavy hsla(40, 80%, 55%, 0.45); }
`;
