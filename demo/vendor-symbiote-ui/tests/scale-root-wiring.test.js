import { acquireCurrentTestFileLock } from './test-lock.js';
await acquireCurrentTestFileLock(import.meta.url);

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

import { DEFAULT_PROVIDER_THEME } from '../themes/default-provider.js';
import {
  rootSpacePrimitives,
  stepScaleTokens,
  typeScaleTokens,
  radiusScaleTokens,
  snapFontSizeToToken,
  snapRadiusToToken,
  snapSpaceToStep,
} from '../tokens/scale.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
// The root seeds the density-aware step ladder (calc form) + permanent aliases,
// so it re-resolves from --sn-base / --sn-density at runtime.
const PRODUCT = { ...rootSpacePrimitives(), ...typeScaleTokens(), ...radiusScaleTokens() };

test('default-provider token object seeds the canonical scale primitives', () => {
  let tokens = DEFAULT_PROVIDER_THEME.tokens;
  for (let [name, value] of Object.entries(PRODUCT)) {
    assert.equal(tokens[name], value, `${name} missing/incorrect in default-provider token object`);
  }
});

test('default-provider.css root mirrors the scale primitives (no drift)', () => {
  let css = readFileSync(resolve(__dirname, '../themes/default-provider.css'), 'utf-8');
  for (let [name, value] of Object.entries(PRODUCT)) {
    assert.match(css, new RegExp(`${name}:\\s*${value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')};`),
      `${name}: ${value} missing from default-provider.css :root`);
  }
});

test('type scale codifies the de-facto sizes and snaps font-size to a rung', () => {
  let tokens = typeScaleTokens();
  assert.equal(tokens['--sn-text-md'], '13px');
  assert.equal(tokens['--sn-text-xs'], '11px');
  assert.equal(tokens['--sn-text-2xl'], '18px');
  // exact rung
  assert.deepEqual(
    { token: snapFontSizeToToken('11px').token, exact: snapFontSizeToToken('11px').exact },
    { token: 'var(--sn-text-xs)', exact: true },
  );
  // off-scale snaps to nearest, flagged inexact (15 -> 14 lg)
  let near = snapFontSizeToToken('15px');
  assert.equal(near.token, 'var(--sn-text-lg)');
  assert.equal(near.exact, false);
});

test('the step ladder is the de-facto vocabulary and seeds the root', () => {
  let steps = stepScaleTokens();
  assert.equal(steps['--sn-step-0'], '0px');
  assert.equal(steps['--sn-step-3'], '6px'); // the 159x de-facto value, now a rung
  assert.equal(steps['--sn-step-6'], '12px'); // == legacy --sn-space-md
  assert.equal(steps['--sn-step-9'], '20px');
  assert.equal(steps['--sn-step-12'], '32px');
  // the dominant off-scale values snap EXACTLY (zero-change conversion)
  for (let [px, token] of [['2px', '--sn-step-1'], ['6px', '--sn-step-3'], ['10px', '--sn-step-5'], ['14px', '--sn-step-7'], ['20px', '--sn-step-9']]) {
    let snap = snapSpaceToStep(px);
    assert.equal(snap.token, `var(${token})`);
    assert.equal(snap.exact, true, `${px} should be an exact step rung`);
  }
});

test('legacy --sn-space-* px is preserved on the step ladder (zero-change)', () => {
  let steps = stepScaleTokens();
  // xs/sm/md/lg/xl map onto even rungs at the same px as before
  assert.equal(steps['--sn-step-2'], '4px'); // xs
  assert.equal(steps['--sn-step-4'], '8px'); // sm
  assert.equal(steps['--sn-step-6'], '12px'); // md
  assert.equal(steps['--sn-step-8'], '16px'); // lg
  assert.equal(steps['--sn-step-10'], '24px'); // xl
});

test('radius scale snaps corner radii, with a pill case for large values', () => {
  let tokens = radiusScaleTokens();
  assert.equal(tokens['--sn-radius-md'], '6px');
  assert.equal(tokens['--sn-radius-full'], '9999px');
  assert.equal(snapRadiusToToken('6px').token, 'var(--sn-radius-md)');
  assert.equal(snapRadiusToToken('6px').exact, true);
  // off-scale snaps to nearest rung (7 -> 6 md or 8 lg; nearest is md by <0.5 rule false)
  assert.equal(snapRadiusToToken('10px').token, 'var(--sn-radius-lg)'); // nearest to 8 vs 12
  // pill
  assert.equal(snapRadiusToToken('999px').token, 'var(--sn-radius-full)');
});

test('seeding primitives does not redefine derived geometry tokens', () => {
  // The migration is additive: node-radius/grid/etc keep their own values and
  // are not re-pointed at the scale yet, so nothing currently rendered changes.
  let tokens = DEFAULT_PROVIDER_THEME.tokens;
  assert.equal(tokens['--sn-node-radius'], 'calc(6px * var(--sn-theme-radius-scale))');
  assert.equal(tokens['--sn-grid-size'], '20px');
});
