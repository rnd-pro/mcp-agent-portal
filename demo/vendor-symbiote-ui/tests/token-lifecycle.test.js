import { acquireCurrentTestFileLock } from './test-lock.js';
await acquireCurrentTestFileLock(import.meta.url);

import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  geometryAtPropertyRegistrations,
  geometryAtPropertyCss,
} from '../tokens/scale.js';
import {
  diffTokenCatalogs,
  flattenTokens,
  formatTokenChangelog,
} from '../tokens/token-lifecycle.js';

test('@property registrations cover concrete primitives and inherit', () => {
  let regs = geometryAtPropertyRegistrations('product');
  let names = regs.map((r) => r.name);
  assert.ok(names.includes('--sn-step-6'));
  assert.ok(names.includes('--sn-conn-width'));
  assert.ok(names.includes('--sn-font-size'));
  // var()-valued aliases (--sn-space-md, --sn-node-radius) are not registered
  assert.equal(names.includes('--sn-space-md'), false);
  assert.equal(names.includes('--sn-node-radius'), false);

  let step6 = regs.find((r) => r.name === '--sn-step-6');
  assert.equal(step6.syntax, '<length>');
  assert.equal(step6.inherits, true);
  assert.equal(step6.initialValue, '12px');

  let conn = regs.find((r) => r.name === '--sn-conn-width');
  assert.equal(conn.syntax, '<number>');

  // dense profile re-resolves the same rung via base × density
  let dense = geometryAtPropertyRegistrations('tool').find((r) => r.name === '--sn-step-6');
  assert.equal(dense.initialValue, '9px');
});

test('geometryAtPropertyCss emits valid @property blocks', () => {
  let css = geometryAtPropertyCss('product');
  assert.match(css, /@property --sn-step-6 \{/);
  assert.match(css, /syntax: '<length>';/);
  assert.match(css, /inherits: true;/);
  assert.match(css, /initial-value: 12px;/);
});

test('flattenTokens reads the canonical scale catalog identity', async () => {
  let { readFileSync } = await import('node:fs');
  let { resolve, dirname } = await import('node:path');
  let { fileURLToPath } = await import('node:url');
  let here = dirname(fileURLToPath(import.meta.url));
  let catalog = JSON.parse(readFileSync(resolve(here, '../tokens/scale.json'), 'utf-8'));
  let tokens = flattenTokens(catalog);
  let spaceMd = tokens.find((t) => t.name === '--sn-space-md');
  assert.equal(spaceMd.uuid, 'geo-space-md');
  assert.equal(spaceMd.value, '12px');
  assert.equal(spaceMd.type, 'dimension');
});

// Synthetic catalogs use short opaque token names (the DTCG `token` extension)
// so the hygiene scan's secret heuristic does not false-positive on them.
function leaf(name, uuid, px, extra = {}) {
  return { $value: { value: px, unit: 'px' }, ...extra, $extensions: { sn: { token: name, uuid } } };
}

const OLD = {
  space: {
    $type: 'dimension',
    a: leaf('--sn-a', 'u-a', 8),
    b: leaf('--sn-b', 'u-b', 12),
    c: leaf('--sn-c', 'u-c', 16),
  },
};

const NEW = {
  space: {
    $type: 'dimension',
    a: leaf('--sn-az', 'u-a', 8), // renamed (same uuid)
    b: leaf('--sn-b', 'u-b', 14, { $deprecated: true }), // updated + deprecated
    d: leaf('--sn-d', 'u-d', 24), // added (c deleted)
  },
};

test('diffTokenCatalogs classifies rename / update / deprecate / add / delete', () => {
  let diff = diffTokenCatalogs(OLD, NEW);
  assert.deepEqual(diff.renamed, [{ uuid: 'u-a', from: '--sn-a', to: '--sn-az' }]);
  assert.deepEqual(diff.updated, [{ name: '--sn-b', from: '12px', to: '14px' }]);
  assert.deepEqual(diff.deprecated, [{ name: '--sn-b' }]);
  assert.deepEqual(diff.added, [{ name: '--sn-d', value: '24px' }]);
  assert.deepEqual(diff.deleted, [{ name: '--sn-c', value: '16px' }]);
  assert.equal(diff.breaking, true); // a delete occurred
});

test('a type change is breaking and a same-shape diff is not', () => {
  let typed = diffTokenCatalogs(OLD, {
    space: {
      $type: 'number',
      a: leaf('--sn-a', 'u-a', 8),
      b: leaf('--sn-b', 'u-b', 12),
      c: leaf('--sn-c', 'u-c', 16),
    },
  });
  assert.equal(typed.breaking, true);
  assert.equal(typed.typeChanges.length, 3);

  let identical = diffTokenCatalogs(OLD, OLD);
  assert.equal(identical.breaking, false);
  assert.equal(identical.added.length + identical.deleted.length + identical.updated.length, 0);
});

test('formatTokenChangelog renders a deterministic Markdown report', () => {
  let md = formatTokenChangelog(diffTokenCatalogs(OLD, NEW));
  assert.match(md, /\*\*BREAKING\*\*/);
  assert.match(md, /## Renamed/);
  assert.match(md, /`--sn-a` → `--sn-az`/);
  assert.match(md, /## Deleted \(breaking\)/);
});
