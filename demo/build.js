#!/usr/bin/env node
/**
 * demo/build.js — Assemble the demo dist for GitHub Pages deployment.
 *
 * Platform-native approach per JSDA principles:
 * - ESM import map for bare-specifier resolution (no bundler)
 * - Git submodules as canonical library source
 * - File copy to dist/ (no compile/bundle step)
 *
 * Usage:
 *   node demo/build.js                     # builds to dist/
 *   node demo/build.js --base /my-repo/    # custom base path
 *   node demo/build.js --out /tmp/demo     # custom output directory
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
    i++;
  } else if (process.argv[i] === '--out' && process.argv[i + 1]) {
    DIST = path.resolve(process.argv[i + 1]);
    i++;
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
    console.warn(`  ⚠ skipping (not found): ${path.relative(ROOT, src)}`);
    return 0;
  }
  fs.mkdirSync(dest, { recursive: true });
  let count = 0;
  for (let entry of fs.readdirSync(src, { withFileTypes: true })) {
    let srcPath = path.join(src, entry.name);
    let destPath = path.join(dest, entry.name);
    if (filter && !filter(entry.name, srcPath, entry)) continue;
    if (entry.isDirectory()) {
      count += copyDir(srcPath, destPath, filter);
    } else {
      fs.copyFileSync(srcPath, destPath);
      count++;
    }
  }
  return count;
}

function copyFile(src, dest) {
  if (!fs.existsSync(src)) {
    console.warn(`  ⚠ skipping (not found): ${path.relative(ROOT, src)}`);
    return;
  }
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
}

const SKIP = new Set([
  'node_modules', '.git', '.DS_Store', 'tmp', 'coverage',
  '.context', '.agents', '.project-graph-cache.json',
  'test', 'tests', '__tests__', 'scripts', '.github',
]);

function sourceFilter(name, fullPath, entry) {
  if (SKIP.has(name)) return false;
  if (name.startsWith('.') && name !== '.gitkeep') return false;
  if (entry.isDirectory()) return true;
  // Copy only JS, CSS, JSON, and font files
  return /\.(js|mjs|css|json|ttf|woff2?)$/.test(name);
}

// ── Step 1: Copy submodule packages to dist ─────────────────────
console.log('  → Copying packages from submodules');

let uiCount = copyDir(
  path.join(ROOT, 'packages', 'symbiote-ui'),
  path.join(DIST, 'packages', 'symbiote-ui'),
  sourceFilter,
);
console.log(`    symbiote-ui: ${uiCount} files`);

let engineCount = copyDir(
  path.join(ROOT, 'packages', 'symbiote-engine'),
  path.join(DIST, 'packages', 'symbiote-engine'),
  sourceFilter,
);
console.log(`    symbiote-engine: ${engineCount} files`);

// @symbiotejs/symbiote from node_modules (npm package, not submodule yet)
let symbioteCount = copyDir(
  path.join(ROOT, 'node_modules', '@symbiotejs', 'symbiote'),
  path.join(DIST, 'packages', '@symbiotejs', 'symbiote'),
  sourceFilter,
);
console.log(`    @symbiotejs/symbiote: ${symbioteCount} files`);

// ── Step 2: Copy web/ application source ─────────────────────────
console.log('  → Copying web/ application');

let webCount = copyDir(
  path.join(ROOT, 'web'),
  path.join(DIST, 'web'),
  sourceFilter,
);
console.log(`    web: ${webCount} files`);

// Copy src/iso/ (isomorphic code used by web/)
let isoCount = copyDir(
  path.join(ROOT, 'src', 'iso'),
  path.join(DIST, 'src', 'iso'),
  sourceFilter,
);
console.log(`    src/iso: ${isoCount} files`);

// ── Step 3: Copy demo adapter ────────────────────────────────────
console.log('  → Preparing demo adapter');

// Preprocess mock-data.js with README injection
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

let mockSrc = fs.readFileSync(path.join(ROOT, 'demo', 'mock-data.js'), 'utf-8');

// Inject main README
let readmePath = path.join(ROOT, 'README.md');
if (fs.existsSync(readmePath)) {
  let readme = stripBadges(fs.readFileSync(readmePath, 'utf-8'));
  mockSrc = mockSrc.replace('__README_CONTENT__', () => escapeForJsString(readme));
}

// Inject subproject READMEs
mockSrc = mockSrc.replace(/__SUBREADME:([^_]+)__/g, (_match, relPath) => {
  // Resolve to packages/ submodule path first, then fallback to node_modules
  let packageMatch = relPath.match(/^packages\/(symbiote-ui|symbiote-engine)\/(.+)$/);
  let fullPath;
  if (packageMatch) {
    fullPath = path.join(ROOT, 'packages', packageMatch[1], packageMatch[2]);
  } else {
    fullPath = path.join(ROOT, relPath);
  }
  if (fs.existsSync(fullPath)) {
    return escapeForJsString(stripBadges(fs.readFileSync(fullPath, 'utf-8')));
  }
  console.warn(`  ⚠ README not found: ${relPath}`);
  return `*README not found: ${relPath}*`;
});

fs.mkdirSync(path.join(DIST, 'demo'), { recursive: true });
fs.writeFileSync(path.join(DIST, 'demo', 'mock-data.js'), mockSrc);
copyFile(path.join(ROOT, 'demo', 'demo-adapter.js'), path.join(DIST, 'demo', 'demo-adapter.js'));

// ── Step 4: Copy static assets ──────────────────────────────────
console.log('  → Copying static assets');

// Material symbols CSS + font
copyDir(
  path.join(ROOT, 'packages', 'symbiote-ui', 'icons'),
  path.join(DIST, 'packages', 'symbiote-ui', 'icons'),
  (name) => /\.(css|ttf|woff2?)$/.test(name),
);

// ── Step 5: Generate three.js shim ──────────────────────────────
// three.js is used only for XR/spatial features — stub it for the demo
let threeShim = `// three.js shim — XR features not used in demo
export default {};
export class Scene {}
export class PerspectiveCamera {}
export class WebGLRenderer {}
export class Vector3 { constructor() { this.x = 0; this.y = 0; this.z = 0; } set() { return this; } copy() { return this; } }
export class Quaternion { constructor() { this.x = 0; this.y = 0; this.z = 0; this.w = 1; } }
export class Color { constructor() {} set() { return this; } }
export class Group { add() {} remove() {} }
export class Mesh { constructor() { this.position = new Vector3(); this.rotation = { x: 0, y: 0, z: 0 }; } }
export class BoxGeometry {}
export class SphereGeometry {}
export class MeshBasicMaterial {}
export class MeshStandardMaterial {}
export class LineBasicMaterial {}
export class BufferGeometry {}
export class Line { constructor() { this.position = new Vector3(); } }
export class Raycaster { setFromCamera() {} intersectObjects() { return []; } }
export class Clock { getDelta() { return 0; } getElapsedTime() { return 0; } }
export class Object3D { add() {} remove() {} }
export class Matrix4 {}
export class Euler {}
`;
fs.mkdirSync(path.join(DIST, 'packages'), { recursive: true });
fs.writeFileSync(path.join(DIST, 'packages', 'three-shim.js'), threeShim);

// ── Step 6: Generate import map ─────────────────────────────────
console.log('  → Generating import map');

// Auto-discover extensionless bare imports from all source files
function scanBareImports(dir) {
  let specifiers = new Set();
  if (!fs.existsSync(dir)) return specifiers;
  for (let entry of fs.readdirSync(dir, { withFileTypes: true })) {
    let full = path.join(dir, entry.name);
    if (SKIP.has(entry.name) || entry.name.startsWith('.')) continue;
    if (entry.isDirectory()) {
      for (let s of scanBareImports(full)) specifiers.add(s);
    } else if (entry.name.endsWith('.js')) {
      let src = fs.readFileSync(full, 'utf-8');
      let re = /from\s+['"]([^.'"][^'"]*)['"]/g;
      let m;
      while ((m = re.exec(src))) specifiers.add(m[1]);
      // Side-effect imports: import 'pkg' (no from, no bindings)
      let side = /import\s+['"]([^.'"][^'"]*)['"]/g;
      while ((m = side.exec(src))) specifiers.add(m[1]);
      // Dynamic imports: import('pkg')
      let dyn = /import\(['"]([^.'"][^'"]*)['"]\)/g;
      while ((m = dyn.exec(src))) specifiers.add(m[1]);
    }
  }
  return specifiers;
}

let allSpecs = new Set();
for (let s of scanBareImports(path.join(ROOT, 'web'))) allSpecs.add(s);
for (let s of scanBareImports(path.join(ROOT, 'src', 'iso'))) allSpecs.add(s);
for (let s of scanBareImports(path.join(ROOT, 'packages', 'symbiote-ui'))) allSpecs.add(s);
for (let s of scanBareImports(path.join(ROOT, 'packages', 'symbiote-engine'))) allSpecs.add(s);
for (let s of scanBareImports(path.join(ROOT, 'node_modules', '@symbiotejs', 'symbiote'))) allSpecs.add(s);

// Resolve specifier → file path in dist
function kebabToPascal(s) {
  return s.replace(/(^|-)(\w)/g, (_, _d, c) => c.toUpperCase());
}

function resolveSpecifier(spec, pkgName, pkgDir) {
  if (!spec.startsWith(pkgName + '/')) return null;
  let sub = spec.slice(pkgName.length + 1);
  // Exact `.js` package imports must remain exact. A package-prefix fallback bypasses the package's
  // public export boundary and can resolve private files that were never intended for consumers.
  if (sub.endsWith('.js')) return fs.existsSync(path.join(pkgDir, sub)) ? sub : null;
  let base = path.join(pkgDir, sub);
  // 1. dir/index.js
  if (fs.existsSync(path.join(base, 'index.js'))) return `${sub}/index.js`;
  // 2. sub.js
  if (fs.existsSync(base + '.js')) return `${sub}.js`;
  // 3. PascalCase: display/code-block → display/CodeBlock/CodeBlock.js
  let parts = sub.split('/');
  let last = parts[parts.length - 1];
  let pascal = kebabToPascal(last);
  let parent = parts.slice(0, -1).join('/');
  let pascalPath = parent ? `${parent}/${pascal}/${pascal}.js` : `${pascal}/${pascal}.js`;
  if (fs.existsSync(path.join(pkgDir, pascalPath))) return pascalPath;
  return null;
}

let imports = {
  // @symbiotejs/symbiote — core framework
  '@symbiotejs/symbiote': `${basePath}packages/@symbiotejs/symbiote/core/index.js`,

  // symbiote-ui — UI library (submodule)
  'symbiote-ui': `${basePath}packages/symbiote-ui/index.js`,
  'symbiote-ui/layout': `${basePath}packages/symbiote-ui/layout/index.js`,

  // symbiote-engine — runtime engine (submodule)
  'symbiote-engine': `${basePath}packages/symbiote-engine/index.js`,
  "symbiote-engine/": `${basePath}packages/symbiote-engine/`,

  // three.js — shimmed (XR not used in demo)
  "three": `${basePath}packages/three-shim.js`,
};

let uiDir = path.join(ROOT, 'packages', 'symbiote-ui');
let engineDir = path.join(ROOT, 'packages', 'symbiote-engine');
let symbioteDir = path.join(ROOT, 'node_modules', '@symbiotejs', 'symbiote');
let autoCount = 0;

for (let spec of allSpecs) {
  if (imports[spec]) continue; // already defined
  let resolved = resolveSpecifier(spec, 'symbiote-ui', uiDir)
    || resolveSpecifier(spec, 'symbiote-engine', engineDir)
    || resolveSpecifier(spec, '@symbiotejs/symbiote', symbioteDir);
  if (resolved) {
    let pkg;
    if (spec.startsWith('symbiote-engine/')) pkg = 'symbiote-engine';
    else if (spec.startsWith('@symbiotejs/symbiote/')) pkg = '@symbiotejs/symbiote';
    else pkg = 'symbiote-ui';
    imports[spec] = `${basePath}packages/${pkg}/${resolved}`;
    autoCount++;
  }
}

console.log(`    Auto-resolved ${autoCount} extensionless imports`);

let importMap = { imports };
let importMapJson = JSON.stringify(importMap, null, 2);

// ── Step 7: Generate index.html ─────────────────────────────────
console.log('  → Generating index.html');

let iconsCssPath = `${basePath}packages/symbiote-ui/icons/material-symbols.css`;
let themeCssPath = `${basePath}packages/symbiote-ui/themes/default-provider.css`;
let styleCssPath = `${basePath}web/style.css`;

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
\t<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap">
\t<link rel="stylesheet" href="${iconsCssPath}">
\t<link rel="stylesheet" href="${themeCssPath}">
\t<link rel="stylesheet" href="${styleCssPath}">
<script type="importmap">
${importMapJson}
</script>
<script type="module" src="${basePath}demo/demo-adapter.js"></script>
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
<script type="module" src="${basePath}web/app.js"></script>
</body>
</html>`;

fs.writeFileSync(path.join(DIST, 'index.html'), indexHtml);
fs.writeFileSync(path.join(DIST, '404.html'), indexHtml);
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
console.log(`\n  ✅ Built ${totalFiles} files → dist/`);
console.log(`  Import map: ${Object.keys(importMap.imports).length} entries\n`);
