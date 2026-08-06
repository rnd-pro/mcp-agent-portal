import { acquireCurrentTestFileLock } from './test-lock.js';
await acquireCurrentTestFileLock(import.meta.url);

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

import { cmdAudit } from '../audit.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const baseline = JSON.parse(readFileSync(resolve(__dirname, 'fixtures/audit-baseline.json'), 'utf-8'));

// Ratchet: hardcoded geometry/motion/color is surfaced as warnings, so the
// build stays green on existing debt — but new violations must not raise the
// ceiling. This fails loudly when a component adds debt above the baseline.
test('audit warning counts do not exceed the accepted debt baseline', async () => {
  let result = await cmdAudit({});
  assert.equal(result.valid, true, 'audit must have zero errors');

  let counts = {};
  for (let warning of result.warnings) {
    counts[warning.type] = (counts[warning.type] ?? 0) + 1;
  }

  for (let [type, ceiling] of Object.entries(baseline.maxWarnings)) {
    let actual = counts[type] ?? 0;
    assert.ok(
      actual <= ceiling,
      `audit '${type}' warnings rose to ${actual} (baseline ${ceiling}). `
      + 'Resolve the new hardcoded values; do not raise the baseline.',
    );
  }
});
