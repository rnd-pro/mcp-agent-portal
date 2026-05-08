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

// ── Inject README.md into mock-data.js ───────────────────────────
let readmePath = path.join(ROOT, 'README.md');
if (fs.existsSync(readmePath)) {
  console.log('  → Injecting README.md into mock-data.js');
  let readme = fs.readFileSync(readmePath, 'utf-8');
  // Strip badge lines at the top ([![...]) and blank lines before first heading
  readme = readme.replace(/^(\[!\[.*?\]\(.*?\)\]\(.*?\)\s*\n?)+\n*/m, '');
  // Escape for JS string literal: backslashes, backticks, ${}, newlines
  let escaped = readme
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n');
  let mockPath = path.join(DIST, 'demo', 'mock-data.js');
  let mockSrc = fs.readFileSync(mockPath, 'utf-8');
  mockSrc = mockSrc.replace('__README_CONTENT__', escaped);
  fs.writeFileSync(mockPath, mockSrc);
}

// ── Copy packages/symbiote-node/ ─────────────────────────────────
console.log('  → Copying packages/symbiote-node/');
copyDir(
  path.join(ROOT, 'packages', 'symbiote-node'),
  path.join(DIST, 'packages', 'symbiote-node'),
  (name) => !SKIP_DIRS.has(name) && name !== '.git',
);

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
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200&display=swap">
<link rel="stylesheet" href="${basePath}web/style.css">
<script type="importmap">
    {
      "imports": {
        "@symbiotejs/symbiote": "${basePath}node_modules/@symbiotejs/symbiote/core/index.js",
        "@symbiotejs/symbiote/": "${basePath}node_modules/@symbiotejs/symbiote/",
        "symbiote-node": "${basePath}packages/symbiote-node/index.js",
        "symbiote-node/": "${basePath}packages/symbiote-node/"
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
