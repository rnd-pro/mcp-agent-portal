import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  TOKEN_TIERS,
  SYSTEM_ROLES,
  SYSTEM_ROLE_SYNTAX,
  STATE_LAYER_MIX,
  REF_RAMP_STOPS,
  REF_RAMP_FAMILIES,
  classifyToken,
  aliasingAllowed,
  systemPropertyRegistrationsCss,
} from '../tokens/tiers.js';

// The tier contract is the machine half of docs/cascade-theme-architecture.md. These tests pin
// the invariants the audit checks and the DTCG generator rely on, so a contract edit is always
// a deliberate, test-visible act.
describe('token tier contract', () => {
  it('exposes the five tiers in knob→leaf order', () => {
    assert.deepEqual(TOKEN_TIERS, ['source', 'ref', 'sys', 'component', 'domain']);
  });

  it('every system role is a --sn-sys-* name and the list is duplicate-free', () => {
    assert.ok(SYSTEM_ROLES.length >= 40 && SYSTEM_ROLES.length <= 60, 'the contract stays small (~48 roles)');
    for (let role of SYSTEM_ROLES) assert.match(role, /^--sn-sys-[a-z0-9-]+$/);
    assert.equal(new Set(SYSTEM_ROLES).size, SYSTEM_ROLES.length);
  });

  it('the surface ladder is present and monotonic in name', () => {
    for (let role of [
      '--sn-sys-surface-sunken', '--sn-sys-surface', '--sn-sys-surface-panel',
      '--sn-sys-surface-raised', '--sn-sys-surface-toolbar', '--sn-sys-surface-overlay',
      '--sn-sys-scrim',
    ]) {
      assert.ok(SYSTEM_ROLES.includes(role), `${role} is part of the ladder`);
    }
  });

  it('state layers carry the MD3-aligned mix values', () => {
    assert.equal(STATE_LAYER_MIX.hover, '8%');
    assert.equal(STATE_LAYER_MIX.pressed, '12%');
    assert.equal(STATE_LAYER_MIX.selected, '16%');
    assert.equal(STATE_LAYER_MIX.dragged, '20%');
    assert.equal(STATE_LAYER_MIX.disabledOpacity, 0.38);
  });

  it('ref ramps declare their stops and hue families', () => {
    assert.ok(REF_RAMP_STOPS.includes(0) && REF_RAMP_STOPS.includes(100));
    assert.deepEqual([...REF_RAMP_STOPS].sort((a, b) => a - b), [...REF_RAMP_STOPS], 'stops are ascending');
    assert.deepEqual(REF_RAMP_FAMILIES, ['neutral', 'accent', 'success', 'warning', 'danger', 'info']);
  });

  it('classifyToken maps prefixes and the component fallback (legacy aliases are gone)', () => {
    assert.equal(classifyToken('--sn-theme-hue'), 'source');
    assert.equal(classifyToken('--sn-ref-neutral-20'), 'ref');
    assert.equal(classifyToken('--sn-sys-surface'), 'sys');
    assert.equal(classifyToken('--sn-dom-graph-type-data'), 'domain');
    assert.equal(classifyToken('--sn-kanban-card-bg'), 'component');
    assert.equal(classifyToken('color'), null);
  });

  it('every system role registers as a typed @property (Chromium-latest mandate)', () => {
    for (let role of Object.keys(SYSTEM_ROLE_SYNTAX)) {
      assert.ok(SYSTEM_ROLES.includes(role), `${role} syntax override targets a declared role`);
    }
    let css = systemPropertyRegistrationsCss();
    for (let role of SYSTEM_ROLES) {
      assert.ok(css.includes(`@property ${role} {`), `${role} is registered`);
    }
    // Typed registrations carry an initial-value; universal ('*') ones must not.
    assert.match(css, /syntax: '<color>';\n {2}inherits: true;\n {2}initial-value: transparent;/);
    let densityBlock = css.split('@property').find(block => block.includes('--sn-sys-density'));
    assert.ok(densityBlock && !densityBlock.includes('initial-value'), 'universal syntax omits initial-value');
    assert.ok(css.includes("syntax: '<percentage>'"), 'state mixes are typed percentages');
  });

  it('aliasing direction is one-way: component→sys→ref→source; nothing references component', () => {
    assert.equal(aliasingAllowed('component', 'sys'), true);
    assert.equal(aliasingAllowed('sys', 'ref'), true);
    assert.equal(aliasingAllowed('ref', 'source'), true);
    assert.equal(aliasingAllowed('domain', 'ref'), true);
    // forbidden directions
    assert.equal(aliasingAllowed('component', 'ref'), false, 'components never reach into ramps');
    assert.equal(aliasingAllowed('sys', 'component'), false, 'sys never depends on a component');
    assert.equal(aliasingAllowed('ref', 'sys'), false);
    assert.equal(aliasingAllowed('source', 'ref'), false, 'knobs depend on nothing');
  });
});
