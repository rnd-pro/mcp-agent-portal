/**
 * Tier-contract audit CLI (W1, warning level — always exits 0; wave 3 flips it to a gate).
 *
 * Usage: node scripts/tier-audit.js [dir ...]
 * Walks component directories' *.css.js files, prints findings + a per-directory summary the
 * wave-2 re-base tracks against the measured baseline in docs/cascade-theme-architecture.md.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { auditCssText } from '../tokens/tier-audit.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_DIRS = [
  'board', 'chat', 'menu', 'list', 'control', 'display', 'toolbar', 'navigation', 'tree',
  'surface', 'inspector', 'notifications', 'palette', 'timeline', 'viewport', 'graph', 'canvas',
  'layout', 'ui',
];
// Theme/token sources hold literals and ramp math by design — tier-direction check only.
const CONTRACT_DIRS = ['themes', 'tokens'];

function* walkCss(dir) {
  for (let entry of fs.readdirSync(dir, { withFileTypes: true })) {
    let full = path.join(dir, entry.name);
    if (entry.isDirectory() && entry.name !== 'node_modules') yield* walkCss(full);
    else if (entry.isFile() && entry.name.endsWith('.css.js')) yield full;
  }
}

let dirs = process.argv.slice(2).length ? process.argv.slice(2) : DEFAULT_DIRS;
let totals = new Map();
let grand = 0;

for (let dir of [...dirs, ...CONTRACT_DIRS]) {
  let abs = path.join(root, dir);
  if (!fs.existsSync(abs)) continue;
  let kind = CONTRACT_DIRS.includes(dir) ? 'contract' : 'component';
  let count = 0;
  for (let file of walkCss(abs)) {
    let findings = auditCssText(fs.readFileSync(file, 'utf8'), {
      file: path.relative(root, file),
      kind,
    });
    for (let f of findings) {
      console.log(`[warn] ${f.check} ${f.file}:${f.line} — ${f.detail}`);
    }
    count += findings.length;
  }
  if (count) totals.set(dir, count);
  grand += count;
}

console.log('\nTier-audit summary (warnings):');
for (let [dir, count] of [...totals.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${String(count).padStart(4)}  ${dir}`);
}
console.log(`  ${String(grand).padStart(4)}  TOTAL`);
