import { acquireCurrentTestFileLock } from './test-lock.js';
await acquireCurrentTestFileLock(import.meta.url);

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const networkApprovalSource = new URL('../display/network-approval-page.js', import.meta.url);
const cellBgThemeSource = new URL('../effects/CellBg/cell-bg-theme.js', import.meta.url);

test('network approval page reuses CellBg standalone theme runtime', async () => {
  const [source, { createNetworkApprovalCellBgScript, renderNetworkApprovalPage }] = await Promise.all([
    readFile(networkApprovalSource, 'utf8'),
    import(networkApprovalSource.href),
  ]);
  const script = createNetworkApprovalCellBgScript();
  const page = renderNetworkApprovalPage({
    requestId: 'req-1',
    address: 'example.test',
    waitEndpoint: '/wait',
  });

  assert.match(source, /createCellBgStandaloneScript/);
  assert.doesNotMatch(source, /const CELL_SIZE = 14/);
  assert.doesNotMatch(source, /const STEP_MS = 75/);
  assert.doesNotMatch(source, /function buildPalette\(\)/);
  assert.match(source, /--sn-cell-size: 14px/);
  assert.match(source, /--sn-cell-min-radius: 2px/);
  assert.match(source, /--sn-cell-max-radius: 5px/);
  assert.match(source, /--sn-cell-step-ms: 75ms/);
  assert.match(source, /--sn-cell-fade-rate: 0\.04/);
  assert.match(source, /radial-gradient\(circle at 50% -10%, var\(--sn-cell-glare\)/);
  assert.match(source, /radial-gradient\(circle at 50% 50%, transparent 20%, var\(--sn-cell-vignette-mid\)/);
  assert.doesNotMatch(source, /radial-gradient\(ellipse/);

  assert.match(script, /sn-network-approval-canvas/);
  assert.equal(typeof new Function(script), 'function');
  assert.match(script, /--sn-cell-size/);
  assert.match(script, /--sn-cell-step-ms/);
  assert.match(script, /cascade-theme-change/);
  assert.match(script, /MutationObserver/);
  assert.match(script, /prefers-reduced-motion: reduce/);
  assert.match(page, /<canvas id="sn-network-approval-canvas"><\/canvas>/);
  assert.match(page, /--sn-cell-size: 14px/);
  assert.match(page, /requestId = "req-1"/);
});

test('CellBg helper owns standalone cellular canvas runtime generation', async () => {
  const [source, { createCellBgStandaloneScript }] = await Promise.all([
    readFile(cellBgThemeSource, 'utf8'),
    import(cellBgThemeSource.href),
  ]);
  const hostileScript = createCellBgStandaloneScript({ canvasId: '</script><script>alert(1)</script>' });

  assert.match(source, /createCellBgStandaloneScript/);
  assert.match(source, /CELL_BG_DEFAULTS/);
  assert.match(source, /state\.cellSize = Math\.max\(4, readNumber\('--sn-cell-size'/);
  assert.match(source, /state\.stepMs = Math\.max\(24, readNumber\('--sn-cell-step-ms'/);
  assert.match(source, /state\.fadeRate = clamp\(readNumber\('--sn-cell-fade-rate'/);
  assert.match(source, /typeof matchMedia === 'function'/);
  assert.match(source, /typeof MutationObserver === 'function'/);
  assert.doesNotMatch(hostileScript, /<\/script>/i);
  assert.match(hostileScript, /\\u003C\/script\\u003E/);
  assert.equal(typeof new Function(hostileScript), 'function');
});
