import { acquireCurrentTestFileLock } from './test-lock.js';
await acquireCurrentTestFileLock(import.meta.url);

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const cssPath = resolve(__dirname, '../themes/default-provider.css');

test('default-provider.css includes prefers-contrast and forced-colors media queries', () => {
  const content = readFileSync(cssPath, 'utf8');
  
  assert.ok(content.includes('@media (prefers-contrast: more)'), 'Should contain prefers-contrast media query');
  assert.ok(content.includes('--sn-theme-outline-strength: 0.90'), 'Should contain high contrast outline override');
  assert.ok(content.includes('--sn-sys-on-surface-dim: var(--sn-sys-on-surface)'), 'Should override text-dim for high contrast readability');
  
  assert.ok(content.includes('@media (forced-colors: active)'), 'Should contain forced-colors media query');
  assert.ok(content.includes('--sn-sys-surface: Canvas'), 'Should map --sn-sys-surface to Canvas in forced-colors mode');
  assert.ok(content.includes('--sn-sys-on-surface: CanvasText'), 'Should map --sn-sys-on-surface to CanvasText in forced-colors mode');
});
