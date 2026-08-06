function freezeRoutes(routes) {
  return Object.freeze(routes.map((route) => Object.freeze(route)));
}

export const SITE_ROUTES = freezeRoutes([
  { id: 'home', file: 'index.html', path: '/' },
  {
    id: 'docs',
    file: 'docs/index.html',
    path: '/docs/',
    title: 'Agent UI Principles',
    markdown: 'agent-ui-principles.md',
    navLabel: 'Docs',
  },
  {
    id: 'docs-agent-ui-principles',
    file: 'docs/agent-ui-principles.html',
    path: '/docs/agent-ui-principles.html',
    title: 'Agent UI Principles',
    markdown: 'agent-ui-principles.md',
    docsNavigation: true,
  },
  {
    id: 'docs-cascade-theme-architecture',
    file: 'docs/cascade-theme-architecture.html',
    path: '/docs/cascade-theme-architecture.html',
    title: 'Cascade Theme Architecture',
    markdown: 'cascade-theme-architecture.md',
    docsNavigation: true,
  },
  {
    id: 'docs-cascade-theme',
    file: 'docs/cascade-theme.html',
    path: '/docs/cascade-theme.html',
    title: 'Cascade Theme',
    markdown: 'cascade-theme.md',
    docsNavigation: true,
  },
  {
    id: 'docs-entry-points',
    file: 'docs/entry-points.html',
    path: '/docs/entry-points.html',
    title: 'Entry Points',
    markdown: 'entry-points.md',
    docsNavigation: true,
  },
  {
    id: 'docs-integration-contracts',
    file: 'docs/integration-contracts.html',
    path: '/docs/integration-contracts.html',
    title: 'Integration Contracts',
    markdown: 'integration-contracts.md',
    docsNavigation: true,
  },
  {
    id: 'docs-layout-and-spatial',
    file: 'docs/layout-and-spatial.html',
    path: '/docs/layout-and-spatial.html',
    title: 'Layout and Spatial',
    markdown: 'layout-and-spatial.md',
    docsNavigation: true,
  },
  {
    id: 'docs-platform-baseline',
    file: 'docs/platform-baseline.html',
    path: '/docs/platform-baseline.html',
    title: 'Platform Baseline',
    markdown: 'platform-baseline.md',
    docsNavigation: true,
  },
  {
    id: 'docs-runtime-ui-construction',
    file: 'docs/runtime-ui-construction.html',
    path: '/docs/runtime-ui-construction.html',
    title: 'Runtime UI Construction',
    markdown: 'runtime-ui-construction.md',
    docsNavigation: true,
  },
  {
    id: 'docs-xr-html-in-canvas',
    file: 'docs/xr-html-in-canvas.html',
    path: '/docs/xr-html-in-canvas.html',
    title: 'XR HTML-in-Canvas Contract',
    markdown: 'xr-html-in-canvas.md',
    docsNavigation: true,
  },
  {
    id: 'catalog',
    file: 'catalog/index.html',
    path: '/catalog/',
    navLabel: 'Catalog',
  },
  {
    id: 'demos',
    file: 'demo/index.html',
    path: '/demo/',
    navLabel: 'Demos',
  },
  {
    id: 'demo-animation',
    file: 'demo/animation.html',
    path: '/demo/animation.html',
    title: 'Native Web Animation Demo',
  },
  {
    id: 'demo-canvas-graph-gravity-lab',
    file: 'demo/canvas-graph-gravity-lab.html',
    path: '/demo/canvas-graph-gravity-lab.html',
  },
  {
    id: 'demo-cascade-theme-lab',
    file: 'demo/cascade-theme-lab.html',
    path: '/demo/cascade-theme-lab.html',
  },
  {
    id: 'demo-native-panels-webgl-lab',
    file: 'demo/native-panels-webgl-lab.html',
    path: '/demo/native-panels-webgl-lab.html',
  },
  {
    id: 'demo-pcb-router-stress',
    file: 'demo/pcb-router-stress.html',
    path: '/demo/pcb-router-stress.html',
  },
  {
    id: 'demo-standalone-theme-fixture',
    file: 'demo/standalone-theme-fixture.html',
    path: '/demo/standalone-theme-fixture.html',
  },
]);

export const NOT_FOUND_ROUTE = Object.freeze({
  id: 'not-found',
  file: '404.html',
  path: '/404.html',
});

export const PRIMARY_NAV_ROUTES = freezeRoutes([
  getSiteRoute('docs'),
  getSiteRoute('catalog'),
  getSiteRoute('demos'),
]);

export const DOCS_NAV_ROUTES = Object.freeze(
  SITE_ROUTES.filter((route) => route.docsNavigation)
);

export function getSiteRoute(id) {
  let route = SITE_ROUTES.find((candidate) => candidate.id === id);
  if (route) return route;

  let supported = SITE_ROUTES.map((candidate) => candidate.id).join(', ');
  throw new Error(`Unknown site route "${id}". Supported routes: ${supported}`);
}

export function normalizeSiteBasePath(basePath = '/') {
  let normalized = String(basePath || '/').trim() || '/';
  if (!normalized.startsWith('/')) normalized = `/${normalized}`;
  return normalized.endsWith('/') ? normalized : `${normalized}/`;
}

export function withSiteBasePath(basePath, routeOrPath) {
  let routePath = typeof routeOrPath === 'string' ? routeOrPath : routeOrPath.path;
  let normalizedBase = normalizeSiteBasePath(basePath);
  if (routePath === '/') return normalizedBase;
  return `${normalizedBase}${routePath.replace(/^\/+/, '')}`;
}
