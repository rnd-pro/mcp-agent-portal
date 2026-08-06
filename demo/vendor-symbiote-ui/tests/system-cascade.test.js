import { acquireCurrentTestFileLock } from './test-lock.js';
await acquireCurrentTestFileLock(import.meta.url);

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  SYSTEM_ROLES,
  STATE_LAYER_MIX,
  REF_RAMP_STOPS,
  REF_RAMP_FAMILIES,
} from '../tokens/tiers.js';
import {
  STATUS_HUE_OFFSETS,
  systemCascadeCss,
  undeclaredSystemRoles,
} from '../themes/system-cascade.js';

// system-cascade.js is the W1 T1/T2 derivation stylesheet (docs/cascade-theme-architecture.md).
// These tests pin the CSS-native contract: relative color syntax in OKLCH, `@property`
// registrations sourced from tokens/tiers.js (never hand-duplicated), color-mix state layers,
// and light-dark() mode branching — all as plain strings (Node-safe, no DOM/browser CSS engine
// required).
describe('system cascade stylesheet', () => {
  it('registers every T1 ramp stop and every T2 role as a typed @property', () => {
    let css = systemCascadeCss();
    for (let family of REF_RAMP_FAMILIES) {
      for (let stop of REF_RAMP_STOPS) {
        assert.ok(css.includes(`@property --sn-ref-${family}-${stop} {`), `--sn-ref-${family}-${stop} is registered`);
      }
    }
    for (let role of SYSTEM_ROLES) {
      assert.ok(css.includes(`@property ${role} {`), `${role} is registered`);
    }
  });

  it('derives every ramp stop with native relative color syntax in OKLCH, not JS math', () => {
    let css = systemCascadeCss();
    for (let family of REF_RAMP_FAMILIES) {
      for (let stop of REF_RAMP_STOPS) {
        assert.match(
          css,
          new RegExp(`--sn-ref-${family}-${stop}: oklch\\(from var\\(--sn-ref-${family}-seed\\) ${stop}% c h\\);`),
          `${family}-${stop} is a pure relative-color derivation`
        );
      }
    }
  });

  it('derives one OKLCH seed per hue family from the existing T0 knobs (no new knob invented)', () => {
    let css = systemCascadeCss();
    assert.match(css, /--sn-ref-neutral-seed: oklch\(var\(--sn-theme-bg-lightness\)[^;]*var\(--sn-theme-hue\)\);/);
    assert.match(css, /--sn-ref-accent-seed: oklch\([^;]*var\(--sn-theme-hue\)\);/);
    for (let [family, offset] of Object.entries(STATUS_HUE_OFFSETS)) {
      assert.ok(
        css.includes(`--sn-ref-${family}-seed: oklch(65% calc(var(--sn-theme-chroma) * 0.0028) calc(var(--sn-theme-hue) + ${offset}));`),
        `${family} seed is a hue rotation of the accent chroma, offset ${offset}`
      );
    }
  });

  it('accent seed reads the accentLightness/accentChroma T0 knobs via a branch-free auto-switch', () => {
    let css = systemCascadeCss();
    assert.ok(css.includes('--sn-theme-accent-lightness'), 'accent lightness knob is registered');
    assert.ok(css.includes('--sn-theme-accent-chroma'), 'accent chroma knob is registered');
    // the -1 sentinel switch must appear in the accent seed derivation, not hardcoded JS math
    assert.match(css, /--sn-ref-accent-seed: oklch\(calc\(clamp\(0, calc\(var\(--sn-theme-accent-lightness\) \+ 1\), 1\)/);
  });

  it('uses light-dark() + color-scheme for mode branching, never a duplicated light/dark block', () => {
    let css = systemCascadeCss();
    assert.ok(css.includes('color-scheme: light dark;'), 'color-scheme is declared once');
    assert.ok(css.includes('--sn-ref-elev-sign: light-dark(-1, 1);'), 'elevation sign flips via light-dark()');
    // no manual @media (prefers-color-scheme) or duplicated dark/light rule blocks
    assert.ok(!css.includes('@media'), 'no manual media-query mode branch');
  });

  it('the surface ladder is a monotonic neutral-ramp offset gated by the elevation sign', () => {
    let css = systemCascadeCss();
    assert.match(css, /--sn-sys-surface-sunken: oklch\(from var\(--sn-ref-neutral-seed\) calc\(l \+ -0\.03 \* var\(--sn-ref-elev-sign\)\) c h\);/);
    assert.match(css, /--sn-sys-surface-raised: oklch\(from var\(--sn-ref-neutral-seed\) calc\(l \+ 0\.06 \* var\(--sn-ref-elev-sign\)\) c h\);/);
    assert.match(css, /--sn-sys-surface-overlay: oklch\(from var\(--sn-ref-neutral-seed\) calc\(l \+ 0\.12 \* var\(--sn-ref-elev-sign\)\) c h\);/);
  });

  it('state layers are driven by STATE_LAYER_MIX, not a second hardcoded percentage', () => {
    let css = systemCascadeCss();
    assert.ok(css.includes(`--sn-sys-state-hover-mix: ${STATE_LAYER_MIX.hover};`));
    assert.ok(css.includes(`--sn-sys-state-pressed-mix: ${STATE_LAYER_MIX.pressed};`));
    assert.ok(css.includes(`--sn-sys-state-selected-mix: ${STATE_LAYER_MIX.selected};`));
    assert.ok(css.includes(`--sn-sys-state-dragged-mix: ${STATE_LAYER_MIX.dragged};`));
    assert.ok(css.includes(`--sn-sys-state-disabled-opacity: ${STATE_LAYER_MIX.disabledOpacity};`));
  });

  it('status containers use color-mix(in oklch, …) against the surface-raised ladder step', () => {
    let css = systemCascadeCss();
    for (let family of ['accent', 'success', 'warning', 'danger', 'info']) {
      assert.ok(
        css.includes(`--sn-sys-${family}-container: color-mix(in oklch, var(--sn-sys-${family}) 16%,`),
        `${family} container is a color-mix over the accent/status color`
      );
    }
  });

  it('emits only tiered token names at zero specificity — the legacy alias bridge is gone', () => {
    let css = systemCascadeCss();
    // every declaration in the value-bearing block is a knob, ramp stop, sys role, or color-scheme
    let block = css.split(':where(:root, :host) {')[1] ?? '';
    for (let line of block.split('\n')) {
      let name = line.trim().split(':')[0];
      if (!name.startsWith('--')) continue;
      assert.match(name, /^--sn-(theme|ref|sys)-/, `${name} is a tiered token, not a legacy alias`);
    }
    // the whole value-bearing block lives inside :where() so it carries zero specificity
    assert.match(css, /:where\(:root, :host\) \{/);
  });

  it('undeclaredSystemRoles reports no gaps: every system role gets a default in this stylesheet', () => {
    assert.deepEqual(undeclaredSystemRoles(), []);
  });
});
