#!/usr/bin/env node
/**
 * demo/build.js — Assemble the demo dist for GitHub Pages deployment.
 *
 * Copies all required files into dist/ with correct relative paths.
 * Rewrites the importmap and asset paths for the GitHub Pages base path.
 *
 * Usage:
 *   node demo/build.js                     # builds to dist/
 *   node demo/build.js --base /my-repo/    # custom base path
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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

// ── Copy web/ ────────────────────────────────────────────────────
console.log('  → Copying web/');
copyDir(path.join(ROOT, 'web'), path.join(DIST, 'web'), webFilter);

// ── Copy demo/ (adapter + mock data) ─────────────────────────────
console.log('  → Copying demo/');
for (let f of ['demo-adapter.js', 'mock-data.js']) {
  copyFile(path.join(ROOT, 'demo', f), path.join(DIST, 'demo', f));
}

// ── Inject README content into mock-data.js ──────────────────────
console.log('  → Injecting README content into mock-data.js');

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

let mockPath = path.join(DIST, 'demo', 'mock-data.js');
let mockSrc = fs.readFileSync(mockPath, 'utf-8');

// 1. Inject main README.md → __README_CONTENT__
let readmePath = path.join(ROOT, 'README.md');
if (fs.existsSync(readmePath)) {
  let readme = stripBadges(fs.readFileSync(readmePath, 'utf-8'));
  let escaped = escapeForJsString(readme);
  mockSrc = mockSrc.replace('__README_CONTENT__', () => escaped);
}

// 2. Inject subproject READMEs → __SUBREADME:relative/path__
mockSrc = mockSrc.replace(/__SUBREADME:([^_]+)__/g, (_match, relPath) => {
  let fullPath = path.join(ROOT, relPath);
  if (fs.existsSync(fullPath)) {
    let content = stripBadges(fs.readFileSync(fullPath, 'utf-8'));
    return escapeForJsString(content);
  }
  console.warn(`  ⚠ README not found: ${relPath}`);
  return `*README not found: ${relPath}*`;
});

fs.writeFileSync(mockPath, mockSrc);

// ── Copy public Symbiote packages ────────────────────────────────
for (let packageName of ['symbiote-node', 'symbiote-ui']) {
  console.log(`  → Copying ${packageName}`);
  copyDir(
    path.join(ROOT, 'node_modules', packageName),
    path.join(DIST, 'packages', packageName),
    (name) => !SKIP_DIRS.has(name) && name !== '.git',
  );
}

// ── Copy node_modules/@symbiotejs/symbiote/ ──────────────────────
console.log('  → Copying @symbiotejs/symbiote');
copyDir(
  path.join(ROOT, 'node_modules', '@symbiotejs', 'symbiote'),
  path.join(DIST, 'node_modules', '@symbiotejs', 'symbiote'),
  (name) => name !== 'node_modules' && name !== '.git',
);

// ── Generate index.html with correct base paths ──────────────────
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
	<link rel="stylesheet" href="/packages/symbiote-ui/icons/material-symbols.css">
	<link rel="stylesheet" href="${basePath}packages/symbiote-ui/themes/default-provider.css">
	<link rel="stylesheet" href="${basePath}web/style.css">
<script type="importmap">
    {
      "imports": {
        "@symbiotejs/symbiote": "${basePath}node_modules/@symbiotejs/symbiote/core/index.js",
	        "@symbiotejs/symbiote/": "${basePath}node_modules/@symbiotejs/symbiote/",
	        "symbiote-ui": "${basePath}packages/symbiote-ui/index.js",
	        "symbiote-ui/core": "${basePath}packages/symbiote-ui/core/index.js",
	        "symbiote-ui/core/base-path.js": "${basePath}packages/symbiote-ui/core/base-path.js",
	        "symbiote-ui/ui": "${basePath}packages/symbiote-ui/ui/index.js",
	        "symbiote-ui/graph": "${basePath}packages/symbiote-ui/graph/index.js",
	        "symbiote-ui/locale": "${basePath}packages/symbiote-ui/locale/index.js",
	        "symbiote-ui/layout": "${basePath}packages/symbiote-ui/layout/index.js",
	        "symbiote-ui/xr": "${basePath}packages/symbiote-ui/xr/index.js",
	        "symbiote-node": "${basePath}packages/symbiote-node/index.js",
	        "symbiote-node/core": "${basePath}packages/symbiote-node/core.js",
	        "symbiote-node/core/base-path.js": "${basePath}packages/symbiote-ui/core/base-path.js",
	        "symbiote-node/ui": "${basePath}packages/symbiote-node/ui.js",
	        "symbiote-node/graph": "${basePath}packages/symbiote-node/graph.js",
	        "symbiote-node/locale": "${basePath}packages/symbiote-node/locale.js",
	        "symbiote-node/layout": "${basePath}packages/symbiote-node/layout.js",
	        "symbiote-node/xr": "${basePath}packages/symbiote-node/xr.js",
	        "symbiote-node/chat/chat-context.js": "${basePath}packages/symbiote-node/chat/chat-context.js",
	        "symbiote-node/display/highlight": "${basePath}packages/symbiote-node/display/highlight.js",
	        "symbiote-node/display/markdown-formatter": "${basePath}packages/symbiote-node/display/markdown-formatter.js",
	        "symbiote-node/display/format-utils": "${basePath}packages/symbiote-node/display/format-utils.js",
	        "symbiote-node/display/icons": "${basePath}packages/symbiote-node/display/icons.js",
	        "symbiote-node/display/event-feed-adapter": "${basePath}packages/symbiote-node/display/event-feed-adapter.js"
	      }
    }
  </script>
<script type="module" src="${basePath}demo/demo-adapter.js"></script>
</head>
<body>
<div class="app-shell">
<header class="app-topbar">
<div class="topbar-left">
<span class="material-symbols-outlined" style="font-size:20px;color:var(--project-accent,var(--sn-node-selected,#4c8bf5))">hub</span>
<span class="app-title">Agent Portal</span>
</div>
<div class="topbar-center" style="position: absolute; left: 50%; transform: translateX(-50%); font-family: 'SF Mono', monospace; font-size: 11px; color: var(--sn-text-dim, #999); display: flex; align-items: center; gap: 6px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 40vw;">
  <span class="material-symbols-outlined" style="font-size: 14px;">folder_open</span>
  <span id="active-project-path">Workspace not selected</span>
</div>
</header>
<project-tabs></project-tabs>
<div id="main-layout" class="app-workspace">
<layout-sidebar id="app-sidebar"></layout-sidebar>
<div class="app-content">
  <panel-layout id="app-layout" min-panel-size="150"></panel-layout>
</div>
</div>
</div>
<script type="module" src="${basePath}web/app.js"></script>
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
