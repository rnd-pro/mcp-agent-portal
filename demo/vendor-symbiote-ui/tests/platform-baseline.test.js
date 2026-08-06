import { acquireCurrentTestFileLock } from './test-lock.js';
await acquireCurrentTestFileLock(import.meta.url);

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('../', import.meta.url));
const baselinePath = join(repoRoot, 'docs/platform-baseline.md');
const allowedStatuses = new Set(['baseline', 'capability-detected', 'shimmed']);
const requiredFeatures = [
  'URLPattern',
  'Element.moveBefore / connectedMoveCallback',
  'Declarative Shadow DOM',
  'adoptedStyleSheets / rootStyles delivery',
  'view-transition-name custom idents',
  'document.modelContext',
];

function splitTableRow(line) {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((cell) => cell.trim());
}

function parseFeatureLedger(source) {
  let start = source.indexOf('## Feature Ledger');
  assert.notEqual(start, -1, 'Feature Ledger heading is required');

  let tableLines = source
    .slice(start)
    .split('\n')
    .filter((line) => line.trim().startsWith('|'));
  assert.ok(tableLines.length >= 3, 'Feature Ledger table must include headers and rows');

  let headers = splitTableRow(tableLines[0]).map((header) => header.toLowerCase());
  let rows = tableLines.slice(2).map((line) => {
    let values = splitTableRow(line);
    return Object.fromEntries(headers.map((header, index) => [header, values[index] || '']));
  });

  return rows;
}

test('platform baseline declares the Chromium target and R-UI28 exception class', async () => {
  let source = await readFile(baselinePath, 'utf8');

  assert.match(source, /`CHROMIUM_BASELINE_TARGET`:\s*`Chromium 133\+`/);
  assert.match(source, /shimmed` or `capability-detected` are the allowed R-UI28 exception\s+classes/);
  assert.match(source, /re-graded when the underlying API reaches stable Chromium/);
});

test('feature ledger rows carry valid status, shim, and consumer data', async () => {
  let source = await readFile(baselinePath, 'utf8');
  let rows = parseFeatureLedger(source);
  let rowsByFeature = new Map(rows.map((row) => [row.feature, row]));

  for (let feature of requiredFeatures) {
    assert.ok(rowsByFeature.has(feature), `missing feature ledger row: ${feature}`);
  }

  for (let row of rows) {
    assert.ok(row.status, `missing status for ${row.feature}`);
    assert.ok(allowedStatuses.has(row.status), `invalid status for ${row.feature}: ${row.status}`);
    assert.ok(row['spec consumers'], `missing spec consumers for ${row.feature}`);
    if (row.status === 'shimmed') {
      assert.ok(row.shim && row.shim !== '-', `shimmed row must name a shim: ${row.feature}`);
    }
  }

  assert.equal(rowsByFeature.get('document.modelContext').shim, 'symbiote-webmcp-shim');
});

test('platform baseline doc does not carry private machine details', async () => {
  let source = await readFile(baselinePath, 'utf8');

  assert.doesNotMatch(source, /\/Users\//);
  assert.doesNotMatch(source, /AGENT_PORTAL_MEMORY_ROOT/);
  assert.doesNotMatch(source, /Bearer\s+[A-Za-z0-9._-]+/);
  assert.doesNotMatch(source, /\b(?:API_KEY|SECRET|TOKEN)=/);
});

test('default runner skips browser smoke without the Chromium switch', () => {
  let result = spawnSync(process.execPath, [
    'tests/run-tests.js',
    '--',
    process.execPath,
    '--test',
    'tests/graph-browser-smoke.test.js',
  ], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: {
      ...process.env,
      SYMBIOTE_UI_CHROMIUM_SMOKE: '',
      SYMBIOTE_UI_ALLOW_SYSTEM_CHROME: '',
      CHROME_BIN: '',
      PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH: '',
    },
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(`${result.stdout}\n${result.stderr}`, /Chromium smoke skipped/);
});

test('runner exposes an explicit Chromium smoke switch', async () => {
  let source = await readFile(join(repoRoot, 'tests/run-tests.js'), 'utf8');

  assert.match(source, /--chromium-smoke/);
  assert.match(source, /SYMBIOTE_UI_CHROMIUM_SMOKE/);
});
