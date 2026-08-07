import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { parseHTML } from 'linkedom';
import { assertPagesOutput, createArtifactChecks } from 'library-pages/testing';
import { createUrlHelpers, readPagesEnv } from 'library-pages/url';

process.env.BASE_PATH ||= '/symbiote-engine';
process.env.BASE_URL ||= 'https://rnd-pro.github.io/symbiote-engine';

const SITE_DIR = path.resolve('_site');
const { basePath, baseUrl } = readPagesEnv(process.env);

const DOCS_ROUTE_PATHS = [
  '/docs/',
  '/docs/getting-started/',
  '/docs/guide/',
  '/docs/runtime/',
  '/docs/rendering/',
  '/docs/reference/',
  '/docs/safety/',
];

const REQUIRED_FILES = [
  'index.html',
  '404.html',
  'demo/index.html',
  ...DOCS_ROUTE_PATHS.map((routePath) => `${routePath.slice(1)}index.html`),
  'sitemap.xml',
  'manifest.json',
  'robots.txt',
  'llms.txt',
  'client/index.js',
  'docs/index.js',
  'docs/node-preview/index.js',
  'animation/index.js',
  'demo/index.js',
];

function sha256(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function walk(dir, fileList = []) {
  for (const entry of fs.readdirSync(dir)) {
    let entryPath = path.join(dir, entry);
    if (fs.statSync(entryPath).isDirectory()) {
      walk(entryPath, fileList);
    } else {
      fileList.push(entryPath);
    }
  }
  return fileList;
}

function readBuilt(relativePath) {
  return fs.readFileSync(path.join(SITE_DIR, relativePath), 'utf8');
}

const EXECUTABLE_INLINE_SCRIPT_TYPES = new Set([
  'text/javascript',
  'application/javascript',
  'text/ecmascript',
  'application/ecmascript',
]);

function partitionInlineScripts(document) {
  let executable = [];
  let skipped = [];
  for (let script of document.querySelectorAll('script')) {
    if (script.getAttribute('src')) {
      continue;
    }
    let type = (script.getAttribute('type') || '').trim().toLowerCase();
    if (type === '' || EXECUTABLE_INLINE_SCRIPT_TYPES.has(type)) {
      executable.push(script);
    } else {
      skipped.push(script);
    }
  }
  return { executable, skipped };
}

before(() => {
  if (!fs.existsSync(path.join(SITE_DIR, 'manifest.json'))) {
    execFileSync('npm', ['run', 'site:build'], { stdio: 'inherit', env: process.env });
  }
});

test('built output passes the shared pages artifact contract', async () => {
  await assertPagesOutput({
    outputDir: SITE_DIR,
    basePath,
    baseUrl,
    requiredFiles: REQUIRED_FILES,
    parseHTML,
  });
});

test('sitemap lists exactly the nine public URLs', () => {
  let sitemap = readBuilt('sitemap.xml');
  let urls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
  let expected = ['/', ...DOCS_ROUTE_PATHS, '/demo/'].map((routePath) => `${baseUrl}${routePath}`);
  assert.deepEqual(urls.sort(), expected.sort());
});

test('every built page exposes the shared search hooks', () => {
  let checks = createArtifactChecks({ parseHTML });
  let htmlFiles = walk(SITE_DIR).filter((filePath) => filePath.endsWith('.html'));
  assert.ok(htmlFiles.length >= 9, 'expected landing, 404, demo and seven docs pages');
  for (const htmlFile of htmlFiles) {
    let { document } = parseHTML(fs.readFileSync(htmlFile, 'utf8'));
    checks.checkSearchHooks(document);
    checks.checkNoBase(document);
    checks.checkForbiddenSelectors(document, {
      htmlFile,
      outputDir: SITE_DIR,
      basePath,
    });
  }
});

test('built site has no private selectors, broad UI imports, or editor residue', () => {
  let textFiles = walk(SITE_DIR).filter((filePath) => /\.(html|css|xml|txt|json)$/.test(filePath));
  for (const filePath of textFiles) {
    let content = fs.readFileSync(filePath, 'utf8');
    let relativePath = path.relative(SITE_DIR, filePath);
    assert.ok(!content.includes('.cb-'), `${relativePath} must not contain private .cb- selectors`);
    assert.ok(!content.includes('#cb-'), `${relativePath} must not contain private #cb- selectors`);
    assert.ok(!content.includes('GraphExplorerShell'), `${relativePath} must not contain GraphExplorerShell`);
    assert.ok(!content.includes('video-adapter'), `${relativePath} must not contain video-adapter residue`);
    if (filePath.endsWith('.html')) {
      assert.ok(!content.includes('inspector'), `${relativePath} must not expose inspector controls`);
    }
  }

  let jsFiles = walk(SITE_DIR).filter((filePath) => filePath.endsWith('.js'));
  for (const filePath of jsFiles) {
    let content = fs.readFileSync(filePath, 'utf8');
    let relativePath = path.relative(SITE_DIR, filePath);
    assert.ok(!content.includes('symbiote-ui/ui'), `${relativePath} must not reference broad symbiote-ui/ui`);
    assert.ok(!/from\s+['"]symbiote-ui['"]/.test(content), `${relativePath} must not keep a bare symbiote-ui import`);
    assert.ok(!content.includes('GraphExplorerShell'), `${relativePath} must not bundle GraphExplorerShell`);
    assert.ok(!content.includes('video-adapter'), `${relativePath} must not bundle video-adapter residue`);
  }
});

test('docs bundles stay narrow and deployed JavaScript parses', () => {
  let docsBundle = readBuilt('docs/index.js');
  assert.ok(docsBundle.includes('code-block'), 'docs bundle registers the public code-block element');
  assert.ok(!docsBundle.includes('GraphExplorerShell'), 'docs bundle must not pull the explorer shell');
  assert.ok(!docsBundle.includes('node-canvas'), 'docs bundle must not pull the canvas');

  let previewBundle = readBuilt('docs/node-preview/index.js');
  assert.ok(previewBundle.includes('node-canvas'), 'node preview bundle registers the public node-canvas element');
  assert.ok(!previewBundle.includes('GraphExplorerShell'), 'node preview bundle must not pull the explorer shell');

  for (const bundlePath of ['client/index.js', 'docs/index.js', 'docs/node-preview/index.js', 'animation/index.js', 'demo/index.js']) {
    execFileSync(process.execPath, ['--check', path.join(SITE_DIR, bundlePath)]);
  }

  let animationSource = fs.readFileSync('site/animation/index.js', 'utf8');
  let animationBuilt = readBuilt('animation/index.js');
  assert.ok(animationBuilt.length < animationSource.length, 'animation/index.js is minified');
  assert.ok(!animationBuilt.includes('\n\n'), 'animation/index.js contains no development spacing');
});

test('pages compose public code and node presentation contracts', () => {
  let gettingStarted = readBuilt('docs/getting-started/index.html');
  assert.ok(gettingStarted.includes(`${basePath}docs/node-preview/index.js`), 'getting-started loads the node preview bundle');
  assert.ok(!gettingStarted.includes(`${basePath}docs/index.js`), 'getting-started must not load the plain docs bundle');
  assert.ok(gettingStarted.includes('data-node-preview'), 'getting-started keeps the node preview mount point');

  let guide = readBuilt('docs/guide/index.html');
  assert.ok(guide.includes(`${basePath}docs/index.js`), 'guide loads the docs bundle');
  assert.ok(!guide.includes(`${basePath}docs/node-preview/index.js`), 'guide must not load the node preview bundle');

  for (const routePath of DOCS_ROUTE_PATHS) {
    let html = readBuilt(`${routePath.slice(1)}index.html`);
    assert.ok(!html.includes('<code-block'), `${routePath} keeps semantic pre > code fallback in static HTML`);
    assert.ok(!html.includes('<node-canvas'), `${routePath} keeps the static node preview fallback in static HTML`);
  }

  let landing = readBuilt('index.html');
  assert.ok(landing.includes('./animation/index.js'), 'landing keeps the animation entry');
  assert.ok(landing.includes(`${basePath}client/index.js`), 'landing loads the shared client entry');
});

test('demo source and robots assets stay frozen', () => {
  assert.equal(sha256('site/demo/index.js'), '0177d45b99037ffef4a364dc6405a180a6327eef457d8441d8abb9e9c011fd45');
  assert.equal(sha256('site/static-assets/robots.txt'), '16ceb5ee3e0dc13aa9adf31a3ebbe45a1d965b8c2b9f72eaf84e5911e140ed95');
  assert.equal(sha256(path.join(SITE_DIR, 'robots.txt')), '16ceb5ee3e0dc13aa9adf31a3ebbe45a1d965b8c2b9f72eaf84e5911e140ed95');
});

test('every executable inline script in built pages parses standalone', () => {
  let htmlFiles = walk(SITE_DIR).filter((filePath) => filePath.endsWith('.html'));
  assert.ok(htmlFiles.length >= 9, 'expected landing, 404, demo and seven docs pages');
  for (let htmlFile of htmlFiles) {
    let relativePath = path.relative(SITE_DIR, htmlFile);
    let { document } = parseHTML(fs.readFileSync(htmlFile, 'utf8'));
    let { executable, skipped } = partitionInlineScripts(document);
    assert.ok(executable.length > 0, `${relativePath} ships at least one executable inline script`);
    assert.ok(
      skipped.some((script) => script.hasAttribute('data-search-index')),
      `${relativePath} keeps the search-index JSON payload out of the executable set`,
    );
    for (let script of executable) {
      assert.doesNotThrow(
        () => new Function(script.textContent),
        `${relativePath} executable inline script must parse standalone after minification`,
      );
    }
  }
});

test('built pages expose the configured static mobile header navigation', async () => {
  let { composeSiteConfig } = await import('../site/site.config.js');
  let { navigation } = composeSiteConfig();
  assert.ok(Array.isArray(navigation) && navigation.length > 0, 'site config declares header navigation');
  let { resolvePath } = createUrlHelpers({ basePath, baseUrl });
  for (let routePath of ['/', ...DOCS_ROUTE_PATHS]) {
    let html = readBuilt(routePath === '/' ? 'index.html' : `${routePath.slice(1)}index.html`);
    let { document } = parseHTML(html);
    let mobileNav = document.querySelector('details.lp-header-nav');
    assert.ok(mobileNav, `${routePath} emits the static mobile header navigation`);
    let summary = mobileNav.querySelector('summary');
    assert.ok(summary && summary.textContent.trim().length > 0, `${routePath} mobile navigation has an accessible summary`);
    let menu = mobileNav.querySelector('nav.lp-header-nav-menu[aria-label]');
    assert.ok(menu, `${routePath} mobile navigation menu carries an accessible label`);
    for (let item of navigation) {
      let href = resolvePath(item.path);
      let link = menu.querySelector(`a.lp-nav-link[href="${href}"]`);
      assert.ok(link, `${routePath} mobile navigation links ${item.label} at ${href}`);
      let isCurrent = item.path === routePath;
      assert.equal(link.classList.contains('active'), isCurrent, `${routePath} marks only the current link active`);
      assert.equal(link.getAttribute('aria-current'), isCurrent ? 'page' : null, `${routePath} sets aria-current only on the current link`);
    }
  }
});

test('node preview bundle carries the graph-node registration while the docs bundle stays narrow', () => {
  let previewBundle = readBuilt('docs/node-preview/index.js');
  assert.match(previewBundle, /reg\(["']graph-node["']\)/, 'node preview bundle self-registers graph-node');

  let docsBundle = readBuilt('docs/index.js');
  assert.doesNotMatch(docsBundle, /reg\(["']graph-node["']\)/, 'docs bundle must not pull the graph-node registration');
});
