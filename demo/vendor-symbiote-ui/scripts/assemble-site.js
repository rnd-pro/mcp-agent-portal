import { cp, mkdir, readdir, writeFile, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {
  normalizeSiteBasePath,
  NOT_FOUND_ROUTE,
  SITE_ROUTES,
} from '../site/routes.js';
import { COMPONENTS } from '../manifest/component-registry.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const site = path.join(root, '_site');

const ALLOWED_DIRS = [
  'board', 'canvas', 'chat', 'control', 'core', 'demo', 'display', 'effects',
  'graph', 'icons', 'inspector', 'interactions', 'layout', 'list', 'locale',
  'manifest', 'marketplace', 'menu', 'navigation', 'node', 'notifications',
  'palette', 'plugins', 'rules', 'runtime', 'schemas', 'shapes', 'surface',
  'themes', 'timeline', 'tokens', 'toolbar', 'tree', 'ui', 'viewport', 'xr'
];

const ALLOWED_FILES = [
  'custom-elements.json', 'webmcp.js', 'discover.js', 'index.js'
];

const RUNTIME_DEPS = ['@symbiotejs/symbiote', 'symbiote-engine'];

async function safeCopy(src, dest) {
  await cp(src, dest, { recursive: true });
}

await mkdir(site, { recursive: true });

for (const dir of ALLOWED_DIRS) {
  await safeCopy(path.join(root, dir), path.join(site, dir));
}

for (const file of ALLOWED_FILES) {
  await safeCopy(path.join(root, file), path.join(site, file));
}

const dynamicDescriptorCount = COMPONENTS.length;
let dynamicCapabilityCount = 0;
for (const comp of COMPONENTS) {
  if (comp.contract?.webmcp?.tools) {
    dynamicCapabilityCount += comp.contract.webmcp.tools.length;
  }
}
let timelineContent = await readFile(path.join(root, 'site', 'timeline.js'), 'utf8');
timelineContent = timelineContent
  .replace(/DESCRIPTOR_COUNT\s*=\s*\d+/, `DESCRIPTOR_COUNT = ${dynamicDescriptorCount}`)
  .replace(/CAPABILITY_COUNT\s*=\s*\d+/, `CAPABILITY_COUNT = ${dynamicCapabilityCount}`);
await writeFile(path.join(site, 'timeline.js'), timelineContent);
await safeCopy(path.join(root, 'site', 'animation.js'), path.join(site, 'animation.js'));

for (const dep of RUNTIME_DEPS) {
  const depDest = path.join(site, 'node_modules', dep);
  await mkdir(path.dirname(depDest), { recursive: true });
  await safeCopy(path.join(root, 'node_modules', dep), depDest);
}

await writeFile(path.join(site, '.nojekyll'), '');

async function getHtmlFiles(dir) {
  const dirents = await readdir(dir, { withFileTypes: true });
  const files = await Promise.all(dirents.map((dirent) => {
    const res = path.resolve(dir, dirent.name);
    return dirent.isDirectory() ? getHtmlFiles(res) : res;
  }));
  return files.flat().filter((file) => file.endsWith('.html'));
}

const allHtml = await getHtmlFiles(site);
const actualHtmlFiles = allHtml
  .map((file) => path.relative(site, file).split(path.sep).join('/'))
  .filter((file) => !file.startsWith('node_modules/'))
  .sort();
const expectedHtmlFiles = [
  ...SITE_ROUTES.map((route) => route.file),
  NOT_FOUND_ROUTE.file,
].sort();

if (JSON.stringify(actualHtmlFiles) !== JSON.stringify(expectedHtmlFiles)) {
  throw new Error(
    `Generated HTML routes differ from site/routes.js.\nExpected: ${expectedHtmlFiles.join(', ')}\nActual: ${actualHtmlFiles.join(', ')}`
  );
}

const basePath = normalizeSiteBasePath(process.env.PAGES_BASE_PATH || '/');
const configuredBaseUrl = process.env.PAGES_BASE_URL
  || 'https://rnd-pro.github.io/symbiote-ui/';
const baseUrl = new URL(
  configuredBaseUrl.endsWith('/') ? configuredBaseUrl : `${configuredBaseUrl}/`
).href;
const routes = SITE_ROUTES.map(({ file, path: routePath }) => ({
  file,
  path: routePath,
}));
const sitemapUrls = SITE_ROUTES.map((route) => (
  new URL(route.path.replace(/^\/+/, ''), baseUrl).href
));
const sitemapEntries = sitemapUrls.map((url) => (
  `  <url>\n    <loc>${url}</loc>\n  </url>`
)).join('\n');
const sitemapXml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${sitemapEntries}\n</urlset>`;

await writeFile(
  path.join(site, 'route-manifest.json'),
  JSON.stringify({ basePath, baseUrl, routes }, null, 2)
);
await writeFile(path.join(site, 'sitemap.xml'), sitemapXml);

const robotsTxt = `User-agent: *\nAllow: /\nSitemap: ${new URL('sitemap.xml', baseUrl).href}\n`;
await writeFile(path.join(site, 'robots.txt'), robotsTxt);

console.log('Assembled _site with explicit allowlist, sitemap, manifest, robots.txt');
