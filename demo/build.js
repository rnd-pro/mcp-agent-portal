#!/usr/bin/env node
/**
 * demo/build.js — Assemble the demo dist for GitHub Pages deployment.
 *
 * Uses esbuild to bundle web/app.js and demo/demo-adapter.js into single
 * ESM bundles, resolving all bare-specifier imports from node_modules.
 * Static assets (CSS, icons, fonts) are copied directly.
 *
 * Usage:
 *   node demo/build.js                     # builds to dist/
 *   node demo/build.js --base /my-repo/    # custom base path
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import esbuild from 'esbuild';

let __dirname = path.dirname(fileURLToPath(import.meta.url));
let ROOT = path.join(__dirname, '..');
let DIST = path.join(ROOT, 'dist');

// Parse --base flag
let basePath = '/mcp-agent-portal/';
for (let i = 2; i < process.argv.length; i++) {
  if (process.argv[i] === '--base' && process.argv[i + 1]) {
    basePath = process.argv[i + 1];
    if (!basePath.endsWith('/')) basePath += '/';
  }
}

console.log(`\n  ⬡ Building demo → dist/`);
console.log(`  Base path: ${basePath}\n`);

// ── Clean ────────────────────────────────────────────────────────
if (fs.existsSync(DIST)) {
  fs.rmSync(DIST, { recursive: true });
}
fs.mkdirSync(DIST, { recursive: true });

// ── Copy helpers ─────────────────────────────────────────────────

function copyDir(src, dest, filter) {
  if (!fs.existsSync(src)) {
    console.warn(`  ⚠ skipping (not found): ${src}`);
    return;
  }
  fs.mkdirSync(dest, { recursive: true });
  for (let entry of fs.readdirSync(src, { withFileTypes: true })) {
    let srcPath = path.join(src, entry.name);
    let destPath = path.join(dest, entry.name);
    if (filter && !filter(entry.name, srcPath)) continue;
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath, filter);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

function copyFile(src, dest) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
}

const SKIP_DIRS = new Set(['node_modules', '.git', '.DS_Store', 'tmp', 'coverage', '.context', '.agents', '.project-graph-cache.json']);

function webFilter(name) {
  return !SKIP_DIRS.has(name) && !name.endsWith('.log') && !name.endsWith('.tgz');
}

// ── Copy static assets ──────────────────────────────────────────
// CSS, icons and fonts are loaded via <link> tags, not import — copy them.
console.log('  → Copying static assets (CSS, icons, fonts)');

// Material symbols CSS + font
let iconsDir = path.join(ROOT, 'node_modules', 'symbiote-ui', 'icons');
copyDir(iconsDir, path.join(DIST, 'assets', 'icons'), (name) => {
  return name.endsWith('.css') || name.endsWith('.ttf') || name.endsWith('.woff2');
});

// Default provider theme CSS
let themeCss = path.join(ROOT, 'node_modules', 'symbiote-ui', 'themes', 'default-provider.css');
if (fs.existsSync(themeCss)) {
  copyFile(themeCss, path.join(DIST, 'assets', 'default-provider.css'));
}

// Web app styles
let webStyleCss = path.join(ROOT, 'web', 'style.css');
if (fs.existsSync(webStyleCss)) {
  copyFile(webStyleCss, path.join(DIST, 'assets', 'style.css'));
}

// ── Prepare mock-data.js with README injection ───────────────────
console.log('  → Preparing mock-data.js');

function escapeForJsString(text) {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\$/g, '\\$')
    .replace(/\n/g, '\\n');
}

function stripBadges(text) {
  return text.replace(/^(\[!\[.*?\]\(.*?\)\]\(.*?\)\s*\n?)+\n*/m, '');
}

function resolveReadmePath(relPath) {
  let packageMatch = relPath.match(/^packages\/(symbiote-ui|symbiote-engine)\/(.+)$/);
  if (packageMatch) {
    return path.join(ROOT, 'node_modules', packageMatch[1], packageMatch[2]);
  }
  return path.join(ROOT, relPath);
}

// Copy mock-data.js to a temp location for preprocessing
let mockSrcPath = path.join(ROOT, 'demo', 'mock-data.js');
let mockSrc = fs.readFileSync(mockSrcPath, 'utf-8');

// 1. Inject main README.md → __README_CONTENT__
let readmePath = path.join(ROOT, 'README.md');
if (fs.existsSync(readmePath)) {
  let readme = stripBadges(fs.readFileSync(readmePath, 'utf-8'));
  let escaped = escapeForJsString(readme);
  mockSrc = mockSrc.replace('__README_CONTENT__', () => escaped);
}

// 2. Inject subproject READMEs → __SUBREADME:relative/path__
mockSrc = mockSrc.replace(/__SUBREADME:([^_]+)__/g, (_match, relPath) => {
  let fullPath = resolveReadmePath(relPath);
  if (fs.existsSync(fullPath)) {
    let content = stripBadges(fs.readFileSync(fullPath, 'utf-8'));
    return escapeForJsString(content);
  }
  console.warn(`  ⚠ README not found: ${relPath}`);
  return `*README not found: ${relPath}*`;
});

// Write preprocessed mock-data to temp file for esbuild to consume
let tempMockPath = path.join(ROOT, 'demo', '.mock-data-processed.js');
fs.writeFileSync(tempMockPath, mockSrc);

// ── esbuild: Bundle app.js and demo-adapter.js ──────────────────
console.log('  → Bundling with esbuild');

// Plugin to redirect mock-data.js imports to the preprocessed version
let mockDataPlugin = {
  name: 'mock-data-redirect',
  setup(build) {
    build.onResolve({ filter: /\.\/mock-data\.js$/ }, (args) => {
      if (args.importer.includes('demo-adapter')) {
        return { path: tempMockPath };
      }
    });
  },
};

// Node builtins that appear in symbiote-engine server-side code but are
// never reached in the browser demo — mark them as external so esbuild
// does not attempt to bundle them.
let nodeExternals = [
  'node:fs', 'node:path', 'node:url', 'node:child_process', 'node:http',
  'node:https', 'node:net', 'node:os', 'node:stream', 'node:events',
  'node:crypto', 'node:util', 'node:worker_threads', 'node:readline',
  'node:process', 'node:buffer', 'node:assert', 'node:vm',
  'fs', 'path', 'url', 'child_process', 'http', 'https', 'net', 'os',
  'stream', 'events', 'crypto', 'util', 'worker_threads', 'readline',
  'process', 'buffer', 'assert', 'vm',
  // Server-side dependencies that won't work in browser
  'ws', 'telegraf', '@modelcontextprotocol/sdk',
  // linkedom is used for SSR only
  'linkedom',
  // jsda-kit is server tooling
  'jsda-kit', 'jsda-kit/node/md.js',
  // library-pages is server tooling
  'library-pages/client', 'library-pages/jsda', 'library-pages/search',
  'library-pages/shell', 'library-pages/url',
  // ajv is server validation
  'ajv/dist/2020.js',
  // three.js is heavy (~600KB) and only used for XR/spatial features
  'three',
];

try {
  // Bundle demo-adapter.js (loaded first, patches fetch/WebSocket)
  let adapterResult = await esbuild.build({
    entryPoints: [path.join(ROOT, 'demo', 'demo-adapter.js')],
    bundle: true,
    format: 'esm',
    outfile: path.join(DIST, 'js', 'demo-adapter.bundle.js'),
    external: nodeExternals,
    plugins: [mockDataPlugin],
    logLevel: 'warning',
    target: 'es2022',
    minify: true,
    sourcemap: false,
  });

  // Bundle web/app.js (main application) with code-splitting
  // Dynamic import() calls in app.js produce separate lazy chunks
  let appResult = await esbuild.build({
    entryPoints: [path.join(ROOT, 'web', 'app.js')],
    bundle: true,
    format: 'esm',
    splitting: true,
    outdir: path.join(DIST, 'js'),
    entryNames: 'app.bundle',
    chunkNames: 'chunk-[hash]',
    external: nodeExternals,
    logLevel: 'warning',
    target: 'es2022',
    minify: true,
    sourcemap: false,
  });

  let adapterErrors = adapterResult.errors?.length || 0;
  let appErrors = appResult.errors?.length || 0;
  if (adapterErrors || appErrors) {
    console.error(`  ✗ esbuild errors: adapter=${adapterErrors}, app=${appErrors}`);
    process.exit(1);
  }
  console.log('  ✓ Bundles created');
} catch (err) {
  console.error('  ✗ esbuild failed:', err.message);
  process.exit(1);
} finally {
  // Clean up temp file
  try { fs.unlinkSync(tempMockPath); } catch {}
}

// ── Report bundle sizes ─────────────────────────────────────────
let adapterSize = fs.statSync(path.join(DIST, 'js', 'demo-adapter.bundle.js')).size;
let appSize = fs.statSync(path.join(DIST, 'js', 'app.bundle.js')).size;
console.log(`    demo-adapter: ${(adapterSize / 1024).toFixed(0)} KB`);
console.log(`    app:          ${(appSize / 1024).toFixed(0)} KB`);

// ── Generate index.html ─────────────────────────────────────────
console.log('  → Generating index.html');

let indexHtml = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Agent Portal — Live Demo</title>
<meta name="description" content="Interactive live demo of Agent Portal — unified control center for MCP servers and AI agents.">
<meta property="og:title" content="Agent Portal — Live Demo">
<meta property="og:description" content="Interactive demo of the unified AI agent control plane. Explore MCP tools, multi-agent orchestration, and real-time monitoring.">
<meta property="og:type" content="website">
	<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap">
	<link rel="stylesheet" href="${basePath}assets/icons/material-symbols.css">
	<link rel="stylesheet" href="${basePath}assets/default-provider.css">
	<link rel="stylesheet" href="${basePath}assets/style.css">
<script type="module" src="${basePath}js/demo-adapter.bundle.js"></script>
</head>
<body>
<div class="app-shell">
<header class="app-topbar">
<div class="topbar-left">
<span class="material-symbols-outlined" style="font-size:20px;color:var(--project-accent,var(--sn-sys-accent))">hub</span>
<span class="app-title">Agent Portal</span>
</div>
<div class="topbar-center" style="position: absolute; left: 50%; transform: translateX(-50%); font-family: 'SF Mono', monospace; font-size: 11px; color: var(--sn-sys-on-surface-dim); display: flex; align-items: center; gap: 6px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 40vw;">
  <span class="material-symbols-outlined" style="font-size: 14px;">folder_open</span>
  <span id="active-project-path">Workspace not selected</span>
</div>
</header>
<project-tabs></project-tabs>
<div id="main-layout" class="app-workspace" data-workspace-host></div>
</div>
<script type="module" src="${basePath}js/app.bundle.js"></script>
</body>
</html>`;

fs.writeFileSync(path.join(DIST, 'index.html'), indexHtml);

// ── GitHub Pages: 404.html fallback for SPA routing ──────────────
fs.writeFileSync(path.join(DIST, '404.html'), indexHtml);

// ── .nojekyll to prevent GitHub Pages Jekyll processing ──────────
fs.writeFileSync(path.join(DIST, '.nojekyll'), '');

// ── Summary ──────────────────────────────────────────────────────
let totalFiles = 0;
function countFiles(dir) {
  for (let e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) countFiles(path.join(dir, e.name));
    else totalFiles++;
  }
}
countFiles(DIST);
console.log(`\n  ✅ Built ${totalFiles} files → dist/\n`);
