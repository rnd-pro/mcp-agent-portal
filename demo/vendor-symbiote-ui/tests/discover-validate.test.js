import { acquireCurrentTestFileLock } from './test-lock.js';
await acquireCurrentTestFileLock(import.meta.url);

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { validateComponent, validateTokenUsage } from '../discover.js';

const BAD = [
  'sn-widget {',
  '  padding: 13px;',
  '  border-radius: 5px;',
  '  transition: all 200ms ease;',
  '}',
].join('\n');

const GOOD = [
  'sn-widget {',
  '  padding: var(--sn-space-md);',
  '  border-radius: var(--sn-node-radius);',
  '  transition: var(--sn-transition-fast) ease;',
  '}',
].join('\n');

test('validateComponent passes clean component CSS', () => {
  let result = validateComponent({ css: GOOD, file: 'good.css.js', profile: 'product' });
  assert.equal(result.command, 'validate-component');
  assert.equal(result.valid, true);
  assert.equal(result.summary.warnings, 0);
});

test('validateComponent surfaces geometry + motion findings with snap suggestions', () => {
  let result = validateComponent({ css: BAD, file: 'bad.css.js', profile: 'product' });
  // findings are warnings (not errors) so valid stays true unless contrast fails
  assert.equal(result.summary.warnings >= 3, true);
  let geometry = result.findings.filter((f) => f.type === 'geometry-lint');
  assert.ok(geometry.some((f) => f.suggestion === 'var(--sn-step-6)'));
  assert.ok(result.findings.some((f) => f.type === 'motion-lint'));
});

test('validateComponent fails on a resolved sub-AA contrast pair', () => {
  let result = validateComponent({
    css: GOOD,
    contrastPairs: [['#777777', '#888888'], ['#000000', '#ffffff', { largeText: false }]],
  });
  assert.equal(result.summary.contrastChecked, 2);
  assert.equal(result.summary.contrastFailures, 1);
  assert.equal(result.valid, false);
});

test('validateComponent surfaces the family semantic tokens for organic fit', () => {
  let known = validateComponent({ css: GOOD, file: 'card.css.js', family: 'card' });
  assert.equal(known.family, 'card');
  assert.ok(known.familyTokens.length > 0, 'card family should expose semantic tokens');
  assert.ok(known.familyTokens.some((t) => t.token === '--sn-card-bg'));
  assert.match(known.fit, /card.*family/i);

  let novel = validateComponent({ css: GOOD, family: 'totally-new-surface' });
  assert.equal(novel.familyTokens.length, 0);
  assert.match(novel.fit, /new surface/i);

  // family is opt-in: an unknown family (sn-widget) => no fit fields
  let plain = validateComponent({ css: GOOD });
  assert.equal('family' in plain, false);

  // but a known family is inferred automatically from the host selector
  let inferred = validateComponent({ css: 'sn-card {\n  padding: var(--sn-space-md);\n}' });
  assert.equal(inferred.family, 'card');
  assert.equal(inferred.familyInferred, true);
  assert.ok(inferred.familyTokens.some((t) => t.token === '--sn-card-bg'));

  // explicit family overrides inference and is not marked inferred
  let explicit = validateComponent({ css: 'sn-card { padding: 0; }', family: 'button' });
  assert.equal(explicit.family, 'button');
  assert.equal(explicit.familyInferred, false);
});

test('validateTokenUsage returns the literal -> token fix map', () => {
  let fixes = validateTokenUsage({ css: BAD, profile: 'product' });
  assert.ok(fixes.length >= 3);
  let padding = fixes.find((f) => f.property === 'padding');
  assert.equal(padding.suggestion, 'var(--sn-step-6)');
  assert.ok(fixes.some((f) => f.property === 'transition'));
});
