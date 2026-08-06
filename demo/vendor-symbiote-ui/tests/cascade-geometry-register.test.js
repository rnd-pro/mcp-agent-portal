import { acquireCurrentTestFileLock } from './test-lock.js';
await acquireCurrentTestFileLock(import.meta.url);

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

import { geometrySpacePrimitives, geometryRegisterScaleTokens, GEOMETRY_PROFILE_NAMES } from '../tokens/scale.js';

const editorSource = new URL('../themes/CascadeThemeEditor/CascadeThemeEditor.js', import.meta.url);
const editorTemplate = new URL('../themes/CascadeThemeEditor/CascadeThemeEditor.tpl.js', import.meta.url);
const widgetSource = new URL('../themes/CascadeThemeWidget/CascadeThemeWidget.js', import.meta.url);
const widgetTemplate = new URL('../themes/CascadeThemeWidget/CascadeThemeWidget.tpl.js', import.meta.url);
const sharedTemplate = new URL('../themes/CascadeThemeControls.tpl.js', import.meta.url);

test('geometrySpacePrimitives emits the step ladder plus --sn-space-* aliases per register', () => {
  let product = geometrySpacePrimitives('product');
  // step ladder primitives carry the px; product is the airy default
  assert.equal(product['--sn-step-6'], '12px');
  assert.equal(product['--sn-step-3'], '6px');
  // legacy t-shirt names are permanent var() aliases onto even step rungs
  assert.equal(product['--sn-space-md'], 'var(--sn-step-6)');
  // the same rung index re-resolves denser/airier per register (base × density)
  assert.equal(geometrySpacePrimitives('tool')['--sn-step-6'], '9px');
  assert.equal(geometrySpacePrimitives('spacious')['--sn-step-6'], '15px');
  // derived geometry (node-radius) is not seeded here
  assert.equal('--sn-node-radius' in product, false);
});

test('geometryRegisterScaleTokens emits the density knobs a register preview writes', () => {
  // The register toggle writes these onto the target; the step ladder and every
  // calc(px * var(--sn-theme-density)) semantic token shift from one selection.
  let tool = geometryRegisterScaleTokens('tool');
  assert.equal(tool['--sn-theme-density'], '0.75');
  assert.equal(tool['--sn-theme-spacing-scale'], '0.75');
  assert.equal(tool['--sn-base'], '2px');
  assert.equal(geometryRegisterScaleTokens('spacious')['--sn-theme-density'], '1.25');
  assert.equal(geometryRegisterScaleTokens('product')['--sn-theme-density'], '1');
  // --sn-density carries the root formula, not a pinned number, so it keeps
  // deriving from --sn-theme-spacing-scale and composes with the density slider
  assert.equal(tool['--sn-density'], 'var(--sn-theme-spacing-scale, 1)');
  // a register does not pin concrete step px — steps follow the knob via calc
  assert.equal('--sn-step-6' in tool, false);
});

test('the cascade theme editor keeps geometry register APIs while exposing variant and tab shape controls', async () => {
  let [source, template, controls] = await Promise.all([
    readFile(editorSource, 'utf8'),
    readFile(editorTemplate, 'utf8'),
    readFile(sharedTemplate, 'utf8'),
  ]);

  assert.match(template, /cascadeThemeRegisterControls/);
  assert.match(template, /cascadeThemeVariantControls/);
  assert.match(template, /cascadeThemeTabShapeControls/);
  assert.match(controls, /data-theme-variant="modern"/);
  assert.match(controls, /data-theme-variant="classic"/);
  assert.match(controls, /data-tab-shape="frame"/);
  assert.match(controls, /data-tab-shape="ear"/);
  assert.match(controls, /data-tab-shape="classic-ear"/);
  // The editor renders register buttons so each selected scope can carry its own
  // layout density/radius profile beside the color theme.
  for (let register of GEOMETRY_PROFILE_NAMES) {
    assert.match(controls, new RegExp(`data-geometry-register="${register}"`));
  }
  assert.doesNotMatch(template, /=\{\{/);

  // component wires the toggle through the shared provider helper.
  assert.match(source, /applyCascadeGeometryRegister/);
  assert.match(source, /persistCascadeThemeScopeRegister/);
  assert.match(source, /onRegisterPick/);
  assert.match(source, /#applyGeometryRegister/);
  assert.match(source, /cascade-geometry-register-change/);
  assert.match(source, /get geometryRegister\(\)/);
});

test('the cascade theme widget keeps geometry register APIs while exposing variant and tab shape controls', async () => {
  let [source, template, controls] = await Promise.all([
    readFile(widgetSource, 'utf8'),
    readFile(widgetTemplate, 'utf8'),
    readFile(sharedTemplate, 'utf8'),
  ]);

  assert.doesNotMatch(template, /cascadeThemeRegisterControls/);
  assert.match(template, /cascadeThemeVariantControls/);
  assert.match(template, /cascadeThemeTabShapeControls/);
  assert.match(controls, /data-theme-variant="modern"/);
  assert.match(controls, /data-theme-variant="classic"/);
  assert.match(controls, /data-tab-shape="frame"/);
  assert.match(controls, /data-tab-shape="ear"/);
  assert.match(controls, /data-tab-shape="classic-ear"/);
  for (let register of GEOMETRY_PROFILE_NAMES) {
    assert.match(controls, new RegExp(`data-geometry-register="${register}"`));
  }
  assert.doesNotMatch(template, /'@aria-expanded': 'isOpen'/);
  assert.match(source, /applyCascadeGeometryRegister/);
  assert.match(source, /persistCascadeThemeScopeRegister/);
  assert.match(source, /#applyGeometryRegister/);
  assert.match(source, /#syncRegisterButtons/);
});
