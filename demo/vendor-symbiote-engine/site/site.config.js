import { defineSiteConfig, defineDocsRoutes } from 'library-pages/shell';
import { readPagesEnv, createUrlHelpers } from 'library-pages/url';

export const pagesEnv = readPagesEnv(process.env);
export const { resolvePath, resolveUrl } = createUrlHelpers({
  basePath: pagesEnv.basePath,
  baseUrl: pagesEnv.baseUrl,
});

const BRAND_MARK_URI = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Cpath d='M5 10.5 16 4l11 6.5v11L16 28 5 21.5z' fill='none' stroke='%234058bd' stroke-width='2.2'/%3E%3Cpath d='m5 10.5 11 6.3 11-6.3M16 16.8V28' fill='none' stroke='%234058bd' stroke-width='2.2'/%3E%3Ccircle cx='16' cy='16.8' r='2.7' fill='%234058bd'/%3E%3C/svg%3E";

export const docsRoutes = defineDocsRoutes([
  {
    path: '/docs/',
    editPath: 'site/docs/index.html.js',
    title: 'Overview',
    section: 'Getting Started',
    headers: ['architecture', 'execution', 'model', 'boundaries'],
    description: 'Understand Symbiote Engine execution model, architectural boundaries, and core design goals.',
  },
  {
    path: '/docs/getting-started/',
    editPath: 'site/docs/getting-started/index.html.js',
    title: 'Getting Started',
    section: 'Getting Started',
    headers: ['install', 'node', 'graph', 'register', 'executor'],
    description: 'Installation, basic graph construction, custom node registration, and execution pipeline.',
  },
  {
    path: '/docs/guide/',
    editPath: 'site/docs/guide/index.html.js',
    title: 'Guide',
    section: 'Guides & Runtime',
    headers: ['cache', 'caching', 'DAG', 'history', 'undo', 'redo'],
    description: 'Deep dive into input contracts, Kahn topological execution, caching modes, and undo/redo history.',
  },
  {
    path: '/docs/runtime/',
    editPath: 'site/docs/runtime/index.html.js',
    title: 'Runtime & CLI',
    section: 'Guides & Runtime',
    headers: ['command', 'line', 'GraphServer', 'handlers', 'packs'],
    description: 'Node packages, CLI commands, developer GraphServer primitive, and hot-loadable handler packs.',
  },
  {
    path: '/docs/rendering/',
    editPath: 'site/docs/rendering/index.html.js',
    title: 'Media Rendering',
    section: 'Guides & Runtime',
    headers: ['audio', 'video', 'capture', 'ffmpeg', 'frames'],
    description: 'In-memory queues, audio providers, parallel browser capture, and FFmpeg/ffprobe proof helpers.',
  },
  {
    path: '/docs/reference/',
    editPath: 'site/docs/reference/index.html.js',
    title: 'API Reference',
    section: 'Reference & Safety',
    headers: ['exports', 'symbols', 'modules', 'package'],
    description: 'Exact generated package export-map and live namespace inventories.',
  },
  {
    path: '/docs/safety/',
    editPath: 'site/docs/safety/index.html.js',
    title: 'Safety & Security',
    section: 'Reference & Safety',
    headers: ['sandbox', 'credentials', 'isolation', 'network', 'drivers'],
    description: 'Host-isolation boundaries, custom driver compilation, credentials security, and sandboxing requirements.',
  },
]);

const ENGINE_TOKENS = /*css*/ `
:root {
  --sn-sys-surface: var(--page);
  --sn-sys-on-surface: var(--ink);
  --sn-sys-on-surface-dim: var(--muted);
  --sn-sys-surface-panel: var(--surface);
  --sn-sys-surface-overlay: var(--page);
  --sn-sys-surface-raised: var(--surface-soft);
  --sn-sys-accent: var(--brand);
  --sn-sys-accent-soft: var(--brand-soft);
  --sn-sys-focus: var(--focus);
  --sn-sys-border: var(--line);
  --sn-sys-outline: var(--line);
  --sn-border: var(--line);
  --sn-outline-color: var(--focus);
  --sn-font: var(--sans);
  --sn-font-mono: var(--mono);
  --sn-syntax-keyword: var(--brand);
  --sn-syntax-string: var(--mint);
  --sn-syntax-comment: var(--muted);
  --sn-syntax-function: var(--ink);
  --sn-syntax-number: var(--amber);
  --sn-syntax-builtin: var(--brand);
  --sn-syntax-property: var(--ink);
  --sn-syntax-literal: var(--mint);
}
`;

const CONTENT_PAGE_STYLES = /*css*/ `
.lp-page-container {
  max-width: 920px;
}
h1, h2, h3, h4 {
  margin-top: 0;
  color: var(--ink);
  line-height: 1.12;
  letter-spacing: -0.025em;
}
h1 { font-size: clamp(2.2rem, 6vw, 4.8rem); }
h2 { font-size: clamp(1.8rem, 4vw, 3rem); }
h3 { font-size: clamp(1.15rem, 2vw, 1.45rem); }
p { margin: 0 0 1rem; }
code, pre { font-family: var(--mono); }
:not(pre) > code {
  border: 1px solid var(--line);
  border-radius: 0.35rem;
  background: var(--surface-soft);
  padding: 0.08rem 0.34rem;
  font-size: 0.88em;
}
a { color: var(--brand); text-underline-offset: 0.18em; }
a:hover { text-decoration-thickness: 0.12em; }
`;

const DOCS_PAGE_STYLES = /*css*/ `
.lp-article section {
  scroll-margin-top: 6rem;
  margin-bottom: 3.5rem;
}
.lp-article :is(h2, h3)[id] {
  scroll-margin-top: 6rem;
}
.reference-meta {
  font-size: 0.85rem;
  color: var(--muted);
}
table {
  width: 100%;
  border-collapse: collapse;
  margin: 1.5rem 0;
  display: block;
  overflow-x: auto;
}
th, td {
  padding: 0.75rem;
  text-align: left;
  border-bottom: 1px solid var(--line);
  vertical-align: top;
}
th {
  background: var(--surface);
  font-weight: 600;
  color: var(--ink);
}
.callout {
  margin: 1.5rem 0;
  padding: 1.05rem 1.15rem;
  border-radius: 8px;
  background: var(--surface-soft);
}
.callout--warning {
  background: var(--amber-soft);
}
.node-preview {
  margin: 2.25rem 0 2.5rem;
}
.node-preview-heading {
  margin: 0 0 0.75rem;
  color: var(--muted);
  font-size: 0.88rem;
  font-weight: 600;
  letter-spacing: 0.02em;
  text-transform: uppercase;
}
.node-preview-stage {
  min-height: 270px;
  overflow: hidden;
}
.node-preview-stage node-canvas {
  display: block;
  width: 100%;
  height: 270px;
  --sn-node-min-width: 180px;
  --sn-node-max-width: 220px;
  --sn-node-radius: 10px;
  --sn-node-border-width: 1px;
  --sn-sys-surface: var(--surface);
  --sn-grid-dot: var(--line-strong);
  --sn-accent-color: var(--brand);
  --sn-conn-color: var(--brand);
}
.node-preview-fallback {
  display: grid;
  min-height: 270px;
  place-items: center;
  padding: 2rem;
  color: var(--muted);
  text-align: center;
}
.node-preview.is-ready .node-preview-fallback {
  display: none;
}
.node-preview-note {
  margin: 0.75rem 0 0;
  color: var(--muted);
  font-size: 0.82rem;
  line-height: 1.5;
}
`;

const SYMBIOTE_STACK = {
  title: 'Part of the Symbiote stack',
  items: [
    {
      label: 'symbiote-workspace',
      description: 'Turns chat intent into portable, executable workspaces. The flagship track of the stack.',
      path: 'https://rnd-pro.github.io/symbiote-workspace/',
    },
    {
      label: 'symbiote-engine',
      description: 'The execution library: portable graph execution behind workspace configs — or standalone in your own backend.',
      current: true,
    },
    {
      label: 'symbiote-ui',
      description: 'Browser UI primitives and the component catalog the stack builds interfaces from.',
      path: 'https://rnd-pro.github.io/symbiote-ui/',
    },
  ],
};

const BASE_CONFIG = {
  brand: {
    title: 'Symbiote Engine',
    logo: BRAND_MARK_URI,
  },
  metadata: {
    title: 'Symbiote Engine',
    description: 'Portable, schema-driven graph execution for browser and Node.js hosts.',
    baseUrl: pagesEnv.baseUrl,
    icon: BRAND_MARK_URI,
  },
  navigation: [
    { label: 'Guide', path: '/docs/guide/' },
    { label: 'Reference', path: '/docs/reference/' },
    { label: 'Demo', path: '/demo/' },
    { label: 'GitHub', path: 'https://github.com/RND-PRO/symbiote-engine' },
  ],
  footer: {
    copyright: 'Portable graph execution with explicit host boundaries. Symbiote Engine · MIT License',
    links: [
      { label: 'GitHub', path: 'https://github.com/RND-PRO/symbiote-engine' },
    ],
  },
  editBaseUrl: 'https://github.com/RND-PRO/symbiote-engine/edit/main/',
  themeStorageKey: 'symbiote-theme',
  basePath: pagesEnv.basePath,
  symbioteTokenBridge: true,
};

/**
 * @param {Object} [family]
 * @param {string} [family.pageStyles]
 * @param {string} [family.clientEntryPath]
 * @param {string} [family.description]
 * @param {boolean} [family.narrow]
 * @returns {Object}
 */
export function composeSiteConfig({ pageStyles = '', clientEntryPath = '/client/index.js', description, narrow = false, withStack = false } = {}) {
  return defineSiteConfig({
    ...BASE_CONFIG,
    ...(withStack ? { stack: SYMBIOTE_STACK } : {}),
    metadata: {
      ...BASE_CONFIG.metadata,
      description: description ?? BASE_CONFIG.metadata.description,
    },
    pageStyles: `${ENGINE_TOKENS}${narrow ? CONTENT_PAGE_STYLES : ''}${pageStyles}`,
    clientEntryPath,
  });
}

/**
 * @param {Object} currentRoute
 * @returns {Object}
 */
export function docsSiteConfig(currentRoute) {
  return composeSiteConfig({
    pageStyles: DOCS_PAGE_STYLES,
    clientEntryPath: currentRoute.path === '/docs/getting-started/'
      ? '/docs/node-preview/index.js'
      : '/docs/index.js',
    description: currentRoute.description,
  });
}
