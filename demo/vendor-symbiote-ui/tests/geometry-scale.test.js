import { acquireCurrentTestFileLock } from './test-lock.js';
await acquireCurrentTestFileLock(import.meta.url);

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

import { MODERN_SKIN, COMPACT_SKIN, ROUNDED_SKIN } from '../themes/Skin.js';
import {
  GEOMETRY_PROFILES,
  GEOMETRY_PROFILE_NAMES,
  SPACE_RUNGS,
  STEP_MULTIPLES,
  LEGACY_SPACE_STEP,
  buildSkinGeometry,
  geometryAxisForProperty,
  getGeometryScaleDescriptor,
  isGeometryToken,
  listGeometryTokens,
  snapValueToToken,
} from '../tokens/scale.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

test('skins are generated from the step ladder per register', () => {
  // product (MODERN) is zero-change vs the old 5-rung scale — same px via steps
  assert.equal(MODERN_SKIN.geometry['--sn-step-2'], '4px'); // was --sn-space-xs
  assert.equal(MODERN_SKIN.geometry['--sn-step-6'], '12px'); // was --sn-space-md
  assert.equal(MODERN_SKIN.geometry['--sn-step-10'], '24px'); // was --sn-space-xl
  assert.equal(MODERN_SKIN.geometry['--sn-step-3'], '6px'); // the new de-facto rung
  assert.equal(MODERN_SKIN.geometry['--sn-space-md'], 'var(--sn-step-6)');
  assert.equal(MODERN_SKIN.geometry['--sn-node-radius'], 'var(--sn-space-md)');
  assert.equal(MODERN_SKIN.geometry['--sn-socket-border-width'], '2px');
  assert.equal(MODERN_SKIN.geometry['--sn-conn-width'], '2');
  assert.equal(MODERN_SKIN.geometry['--sn-font-size'], '13px');

  // tool (COMPACT) re-resolves the same ladder denser (× 0.75), spacious airier (× 1.25)
  assert.equal(COMPACT_SKIN.geometry['--sn-step-6'], '9px');
  assert.equal(COMPACT_SKIN.geometry['--sn-space-md'], 'var(--sn-step-6)'); // alias is register-stable
  assert.equal(COMPACT_SKIN.geometry['--sn-font-size'], '12px');
  assert.equal(COMPACT_SKIN.geometry['--sn-conn-width'], '1.5');
  assert.equal(ROUNDED_SKIN.geometry['--sn-step-6'], '15px');
  assert.equal(ROUNDED_SKIN.geometry['--sn-node-radius'], 'var(--sn-space-lg)');
  assert.equal(ROUNDED_SKIN.geometry['--sn-font-size'], '14px');
});

test('buildSkinGeometry is the single source the skins are derived from', () => {
  assert.deepEqual(buildSkinGeometry('product'), MODERN_SKIN.geometry);
  assert.deepEqual(buildSkinGeometry('tool'), COMPACT_SKIN.geometry);
  assert.deepEqual(buildSkinGeometry('spacious'), ROUNDED_SKIN.geometry);
  // unknown profile falls back to the default (product)
  assert.deepEqual(buildSkinGeometry('nope'), MODERN_SKIN.geometry);
});

test('geometry token membership recognizes the canonical scale and rejects others', () => {
  for (let rung of SPACE_RUNGS) assert.ok(isGeometryToken(`--sn-space-${rung}`));
  assert.ok(isGeometryToken('--sn-node-radius'));
  assert.ok(isGeometryToken('--sn-font-size'));
  assert.equal(isGeometryToken('--sn-sys-surface'), false);
  assert.equal(isGeometryToken('--sn-space-2xl'), false);
  assert.ok(listGeometryTokens().includes('--sn-grid-size'));
});

test('geometryAxisForProperty classifies properties', () => {
  assert.equal(geometryAxisForProperty('padding'), 'space');
  assert.equal(geometryAxisForProperty('margin-inline-start'), 'space');
  assert.equal(geometryAxisForProperty('gap'), 'space');
  assert.equal(geometryAxisForProperty('border-radius'), 'radius');
  assert.equal(geometryAxisForProperty('font-size'), 'font-size');
  assert.equal(geometryAxisForProperty('color'), null);
});

test('snapValueToToken maps raw values to the nearest step rung', () => {
  // exact rung hit on the step ladder
  let exact = snapValueToToken('padding', '12px', 'product');
  assert.equal(exact.token, 'var(--sn-step-6)');
  assert.equal(exact.exact, true);
  // off-scale → nearest step, flagged inexact (7 → 6 = step-3)
  let near = snapValueToToken('gap', '7px', 'product');
  assert.equal(near.token, 'var(--sn-step-3)');
  assert.equal(near.exact, false);
  assert.equal(near.nearestPx, 6);
  // the step ladder is register-agnostic; the token resolves per register at use
  let dense = snapValueToToken('padding', '12px', 'tool');
  assert.equal(dense.token, 'var(--sn-step-6)');
  // the finer ladder captures the de-facto 6px exactly (was off-scale on 5 rungs)
  assert.equal(snapValueToToken('gap', '6px', 'product').exact, true);
  // radius axis also snaps to the step ladder
  let radius = snapValueToToken('border-radius', '16px', 'product');
  assert.equal(radius.token, 'var(--sn-step-8)');
  // font-size axis
  let font = snapValueToToken('font-size', '13px', 'product');
  assert.equal(font.token, 'var(--sn-font-size)');
  assert.equal(font.exact, true);
  // non-geometry property
  assert.equal(snapValueToToken('color', '#fff', 'product'), null);
});

test('tokens/scale.json register values stay in sync with the scale module', () => {
  let catalog = JSON.parse(readFileSync(resolve(__dirname, '../tokens/scale.json'), 'utf-8'));
  for (let rung of SPACE_RUNGS) {
    let entry = catalog.space[rung];
    assert.equal(entry.$type === undefined ? catalog.space.$type : entry.$type ?? catalog.space.$type, 'dimension');
    let registers = entry.$extensions.sn.registers;
    let step = LEGACY_SPACE_STEP[rung];
    for (let profileName of GEOMETRY_PROFILE_NAMES) {
      let p = GEOMETRY_PROFILES[profileName];
      assert.equal(
        registers[profileName],
        STEP_MULTIPLES[step] * p.base * p.density,
        `space.${rung} register ${profileName} drifted between scale.json and scale.js`,
      );
    }
  }
  // step-ladder register sync — the same invariant for the universal step rungs
  for (let n = 0; n < STEP_MULTIPLES.length; n++) {
    let entry = catalog.step[n];
    assert.ok(entry, `scale.json is missing step.${n}`);
    let registers = entry.$extensions.sn.registers;
    for (let profileName of GEOMETRY_PROFILE_NAMES) {
      let p = GEOMETRY_PROFILES[profileName];
      assert.equal(
        registers[profileName],
        STEP_MULTIPLES[n] * p.base * p.density,
        `step.${n} register ${profileName} drifted between scale.json and scale.js`,
      );
    }
  }
  // font-size sync
  let fontRegisters = catalog.font.size.$extensions.sn.registers;
  for (let profileName of GEOMETRY_PROFILE_NAMES) {
    assert.equal(fontRegisters[profileName], GEOMETRY_PROFILES[profileName].fontSize);
  }
});

test('tokens/scale.json uses typed DTCG dimensions for the numbered rungs', () => {
  let catalog = JSON.parse(readFileSync(resolve(__dirname, '../tokens/scale.json'), 'utf-8'));
  assert.equal(catalog.space.$type, 'dimension');
  assert.equal(catalog.space.md.$value.unit, 'px');
  assert.equal(typeof catalog.space.md.$value.value, 'number');
});

test('geometry scale descriptor is agent-readable', () => {
  let descriptor = getGeometryScaleDescriptor();
  assert.equal(descriptor.defaultProfile, 'product');
  assert.deepEqual(descriptor.spaceRungs, ['xs', 'sm', 'md', 'lg', 'xl']);
  assert.equal(descriptor.profiles.length, 3);
  assert.ok(descriptor.axes.space.includes('padding'));
  assert.ok(descriptor.tokens.includes('--sn-space-md'));
});
