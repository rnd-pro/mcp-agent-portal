import { acquireCurrentTestFileLock } from './test-lock.js';
await acquireCurrentTestFileLock(import.meta.url);

import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  lintComponentCss,
  lintGeometryValue,
  lintMotionValue,
} from '../tokens/geometry-lint.js';
import {
  checkContrast,
  contrastRatio,
  parseColor,
  wcagLevel,
} from '../tokens/contrast.js';

test('lintGeometryValue flags raw lengths on geometry axes and snaps to a token', () => {
  let pad = lintGeometryValue('padding', '13px', 'product');
  assert.equal(pad.length, 1);
  assert.equal(pad[0].kind, 'raw-geometry');
  assert.equal(pad[0].suggestion, 'var(--sn-step-6)'); // nearest step rung (12px)
  assert.equal(pad[0].exact, false);

  let exact = lintGeometryValue('gap', '12px', 'product');
  assert.equal(exact[0].suggestion, 'var(--sn-step-6)');
  assert.equal(exact[0].exact, true);

  let font = lintGeometryValue('font-size', '13px', 'product');
  assert.equal(font[0].suggestion, 'var(--sn-text-md)'); // type scale, exact rung
  let label = lintGeometryValue('font-size', '11px', 'product');
  assert.equal(label[0].suggestion, 'var(--sn-text-xs)');
});

test('lintGeometryValue ignores tokens, zero, keywords, and non-geometry axes', () => {
  assert.deepEqual(lintGeometryValue('padding', 'var(--sn-space-md)', 'product'), []);
  assert.deepEqual(lintGeometryValue('padding', '0', 'product'), []);
  assert.deepEqual(lintGeometryValue('margin', 'auto', 'product'), []);
  assert.deepEqual(lintGeometryValue('color', '#fff', 'product'), []);
  // calc with a token base is allowed; only the masked remainder is scanned
  assert.deepEqual(lintGeometryValue('padding', 'calc(var(--sn-space-md) * 2)', 'product'), []);
});

test('lintGeometryValue handles shorthand multi-value declarations', () => {
  let findings = lintGeometryValue('padding', '8px 10px', 'product');
  assert.equal(findings.length, 2);
});

test('lintMotionValue flags raw durations only on motion properties and snaps to a token', () => {
  let hit = lintMotionValue('transition', 'all 200ms ease');
  assert.equal(hit.length, 1);
  assert.equal(hit[0].suggestion, 'var(--sn-transition-normal)'); // 200ms nearest 240
  assert.equal(lintMotionValue('transition', 'all var(--sn-transition-fast) ease').length, 0);
  assert.equal(lintMotionValue('padding', '200ms').length, 0);
  // animation properties snap to the animation duration rungs
  assert.equal(lintMotionValue('animation-duration', '1.1s')[0].suggestion, 'var(--sn-animation-duration-normal)');
});

test('lintComponentCss reports geometry, cascade, and escape behavior over a block', () => {
  let css = [
    'sn-card {',
    '  padding: 13px;',
    '  gap: var(--sn-space-md);',
    '  border-radius: 5px; /* lint-allow intentional */',
    '  margin: var(--sn-space-xs);',
    '}',
    ':root {',
    '  --sn-card-pad: var(--sn-space-md);',
    '}',
  ].join('\n');
  let { findings } = lintComponentCss({ content: css, file: 'card.css.js', profile: 'product' });

  // padding:13px flagged; border-radius escaped; gap uses token (no raw finding)
  let geometry = findings.filter((f) => f.type === 'geometry-lint');
  assert.equal(geometry.length, 1);
  assert.equal(geometry[0].line, 2);

  // gap (L3) and margin (L5) consume primitive rungs in a component selector
  let cascade = findings.filter((f) => f.type === 'cascade-lint');
  assert.equal(cascade.length, 2);
  assert.ok(cascade.every((f) => f.severity === 'info'));
  assert.deepEqual(cascade.map((f) => f.line).sort(), [3, 5]);
  // the primitive seeding :root is not flagged
  assert.ok(cascade.every((f) => f.line !== 8));
});

test('lintComponentCss flags anti-slop only when two or more signals coincide', () => {
  let slop = [
    'sn-hero {',
    '  background: linear-gradient(135deg, hsl(280 80% 60%), hsl(190 80% 55%));',
    '  border-radius: 4px;',
    '  border-radius: 9px;',
    '  border-radius: 17px;',
    '}',
  ].join('\n');
  let { findings } = lintComponentCss({ content: slop, file: 'hero.css.js' });
  assert.equal(findings.filter((f) => f.type === 'anti-slop').length, 1);

  let clean = 'sn-hero {\n  background: var(--sn-sys-surface);\n  border-radius: var(--sn-node-radius);\n}';
  assert.equal(lintComponentCss({ content: clean }).findings.filter((f) => f.type === 'anti-slop').length, 0);
});

test('contrast math matches known WCAG anchors', () => {
  assert.equal(contrastRatio('#000000', '#ffffff'), 21);
  assert.equal(contrastRatio('#ffffff', '#ffffff'), 1);
  assert.equal(wcagLevel(21), 'AAA');
  assert.equal(wcagLevel(4.6), 'AA');
  assert.equal(wcagLevel(3.2, { largeText: true }), 'AA');
  assert.equal(wcagLevel(2), 'fail');
});

test('contrast parses hex, rgb, and hsl but reports unresolved cascade chains', () => {
  assert.deepEqual(parseColor('#fff'), { r: 255, g: 255, b: 255 });
  assert.deepEqual(parseColor('rgb(0, 0, 0)'), { r: 0, g: 0, b: 0 });
  assert.deepEqual(parseColor('hsl(0 0% 100%)'), { r: 255, g: 255, b: 255 });
  assert.equal(parseColor('hsl(var(--sn-hue) 0% 50%)'), null);

  let resolved = checkContrast('#111', '#eee');
  assert.equal(resolved.resolved, true);
  assert.ok(resolved.passesAA);

  let unresolved = checkContrast('var(--sn-sys-on-surface)', 'var(--sn-sys-surface)');
  assert.equal(unresolved.resolved, false);
  assert.equal(unresolved.passesAA, false);
});
