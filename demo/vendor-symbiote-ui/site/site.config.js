import { defineSiteConfig, defineDocsRoutes } from 'library-pages/shell';
import { readPagesEnv, createUrlHelpers } from 'library-pages/url';

export const pagesEnv = readPagesEnv(process.env);
export const { resolvePath, resolveUrl } = createUrlHelpers({
  basePath: pagesEnv.basePath,
  baseUrl: pagesEnv.baseUrl,
});

const BRAND_MARK_URI = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32' fill='none' stroke='%234058bd' stroke-width='2.2'%3E%3Ccircle cx='8' cy='9' r='2.5'/%3E%3Ccircle cx='24' cy='9' r='2.5'/%3E%3Ccircle cx='16' cy='23' r='2.5'/%3E%3Cpath d='m10 10.5 4.2 8.5m7.8-8.5-4.2 8.5'/%3E%3C/svg%3E";

export const docsRoutes = defineDocsRoutes([
  {
    path: '/docs/',
    title: 'Overview',
    section: 'Principles',
    markdown: 'agent-ui-principles.md',
    editPath: 'agent-ui-principles.md',
    headers: ['agent', 'principles', 'provider', 'contract'],
    description: 'Agent UI principles: how Symbiote UI keeps generated interfaces coherent and host-owned.',
  },
  {
    path: '/docs/agent-ui-principles.html',
    title: 'Agent UI Principles',
    section: 'Principles',
    markdown: 'agent-ui-principles.md',
    editPath: 'agent-ui-principles.md',
    headers: ['agent', 'principles', 'discovery', 'workspace'],
    description: 'The principles behind agent-constructed interfaces on the Symbiote UI provider contract.',
  },
  {
    path: '/docs/cascade-theme.html',
    title: 'Cascade Theme',
    section: 'Theming',
    markdown: 'cascade-theme.md',
    editPath: 'cascade-theme.md',
    headers: ['theme', 'cascade', 'tokens', 'skin'],
    description: 'The cascade theme: tokens, rules, and helpers that keep workspaces legible.',
  },
  {
    path: '/docs/cascade-theme-architecture.html',
    title: 'Cascade Theme Architecture',
    section: 'Theming',
    markdown: 'cascade-theme-architecture.md',
    editPath: 'cascade-theme-architecture.md',
    headers: ['tiers', 'ramps', 'knobs', 'system'],
    description: 'The tiered token architecture behind the cascade theme system.',
  },
  {
    path: '/docs/platform-baseline.html',
    title: 'Platform Baseline',
    section: 'Platform',
    markdown: 'platform-baseline.md',
    editPath: 'platform-baseline.md',
    headers: ['baseline', 'browser', 'modern', 'standards'],
    description: 'The modern browser baseline Symbiote UI builds on.',
  },
  {
    path: '/docs/entry-points.html',
    title: 'Entry Points',
    section: 'Platform',
    markdown: 'entry-points.md',
    editPath: 'entry-points.md',
    headers: ['exports', 'entrypoints', 'node-safe', 'browser'],
    description: 'Node-safe and browser entrypoints of the symbiote-ui package.',
  },
  {
    path: '/docs/integration-contracts.html',
    title: 'Integration Contracts',
    section: 'Platform',
    markdown: 'integration-contracts.md',
    editPath: 'integration-contracts.md',
    headers: ['integration', 'contracts', 'manifest', 'webmcp'],
    description: 'Provider metadata, manifests, and WebMCP integration contracts.',
  },
  {
    path: '/docs/xr-html-in-canvas.html',
    title: 'XR HTML-in-Canvas Contract',
    section: 'Platform',
    markdown: 'xr-html-in-canvas.md',
    editPath: 'xr-html-in-canvas.md',
    headers: ['xr', 'html-in-canvas', 'webgl', 'fallback'],
    description: 'Experimental HTML-in-Canvas ownership, upload receipt, validation, and fallback contracts for XR panels.',
  },
  {
    path: '/docs/layout-and-spatial.html',
    title: 'Layout and Spatial',
    section: 'Construction',
    markdown: 'layout-and-spatial.md',
    editPath: 'layout-and-spatial.md',
    headers: ['layout', 'spatial', 'panels', 'splits'],
    description: 'Layout primitives and spatial surfaces for composed workspaces.',
  },
  {
    path: '/docs/runtime-ui-construction.html',
    title: 'Runtime UI Construction',
    section: 'Construction',
    markdown: 'runtime-ui-construction.md',
    editPath: 'runtime-ui-construction.md',
    headers: ['runtime', 'construction', 'agents', 'components'],
    description: 'How agents construct and update interfaces at runtime.',
  },
]);

const SYMBIOTE_STACK = {
  title: 'The Symbiote stack',
  items: [
    {
      label: 'symbiote-workspace',
      description: 'Turns chat intent into portable, executable workspaces. The flagship track of the stack.',
      path: 'https://rnd-pro.github.io/symbiote-workspace/',
    },
    {
      label: 'symbiote-engine',
      description: 'The execution library: portable graph execution behind workspace configs — or standalone.',
      path: 'https://rnd-pro.github.io/symbiote-engine/',
    },
    {
      label: 'symbiote-ui',
      description: 'Browser UI primitives, themes, and the component catalog. You are here.',
      current: true,
    },
  ],
};

const BASE_CONFIG = {
  brand: {
    title: 'Symbiote UI',
    logo: BRAND_MARK_URI,
  },
  metadata: {
    title: 'Symbiote UI',
    description: 'Agent-ready Web Components, layouts, themes, manifests, and UI contracts for Symbiote systems.',
    baseUrl: pagesEnv.baseUrl,
    icon: BRAND_MARK_URI,
  },
  navigation: [
    { label: 'Guide', path: '/docs/' },
    { label: 'Catalog', path: '/catalog/' },
    { label: 'Demo', path: '/demo/' },
    { label: 'GitHub', path: 'https://github.com/RND-PRO/symbiote-ui' },
  ],
  footer: {
    copyright: 'Symbiote UI · MIT License',
    links: [
      { label: 'Component catalog', path: '/catalog/' },
      { label: 'GitHub', path: 'https://github.com/RND-PRO/symbiote-ui' },
    ],
  },
  editBaseUrl: 'https://github.com/RND-PRO/symbiote-ui/edit/main/docs/',
  themeStorageKey: 'symbiote-theme',
  basePath: pagesEnv.basePath,
};

/**
 * @param {Object} [family]
 * @param {string} [family.pageStyles]
 * @param {string} [family.clientEntryPath]
 * @param {string} [family.description]
 * @param {boolean} [family.withStack]
 * @returns {Object}
 */
export function composeSiteConfig({ pageStyles = '', clientEntryPath = '/client/index.js', description, withStack = false } = {}) {
  return defineSiteConfig({
    ...BASE_CONFIG,
    ...(withStack ? { stack: SYMBIOTE_STACK } : {}),
    metadata: {
      ...BASE_CONFIG.metadata,
      description: description ?? BASE_CONFIG.metadata.description,
    },
    pageStyles,
    clientEntryPath,
  });
}

/**
 * @param {Object} currentRoute
 * @returns {Object}
 */
export function docsSiteConfig(currentRoute) {
  return composeSiteConfig({
    clientEntryPath: '/docs/index.js',
    description: currentRoute.description,
  });
}
