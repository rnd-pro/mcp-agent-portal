import { acquireCurrentTestFileLock } from './test-lock.js';
await acquireCurrentTestFileLock(import.meta.url);

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { DEFAULT_PROVIDER_THEME } from '../themes/default-provider.js';
import {
  SEMANTIC_CATALOG_VERSION,
  SEMANTIC_ROLES,
  getSemanticTokenCatalog,
  tokensForFamily,
  tokensByRole,
} from '../tokens/semantic-catalog.js';

function roleOf(entries, token) {
  return entries.find((entry) => entry.token === token)?.role;
}

test('catalog is derived from the live provider tokens and well-formed', () => {
  let catalog = getSemanticTokenCatalog();
  assert.equal(catalog.version, SEMANTIC_CATALOG_VERSION);

  // Every --sn-* token in the provider object is accounted for exactly once.
  let providerTokens = Object.keys(DEFAULT_PROVIDER_THEME.tokens).filter((n) => n.startsWith('--sn-'));
  let catalogued = catalog.families.flatMap((f) => f.tokens.map((t) => t.token));
  assert.equal(catalog.totalTokens, providerTokens.length, 'totalTokens counts every --sn-* token');
  assert.equal(catalogued.length, catalog.totalTokens, 'tokenCounts sum to totalTokens');
  assert.deepEqual([...new Set(catalogued)].sort(), [...providerTokens].sort(), 'catalog covers the live tokens');

  // tokenCount matches the listed tokens for each family, and none is empty.
  for (let family of catalog.families) {
    assert.equal(family.tokenCount, family.tokens.length, `${family.family} tokenCount matches tokens`);
    assert.ok(family.tokenCount > 0, `${family.family} is non-empty`);
  }

  // Reported roles are a subset of the canonical list, in canonical order.
  for (let role of catalog.roles) assert.ok(SEMANTIC_ROLES.includes(role), `${role} is a known role`);
  let expectedOrder = SEMANTIC_ROLES.filter((r) => catalog.roles.includes(r));
  assert.deepEqual(catalog.roles, expectedOrder, 'roles follow the canonical order');
});

test('the system exposes many component families, sorted with _base first', () => {
  let catalog = getSemanticTokenCatalog();
  assert.ok(catalog.families.length > 15, `expected > 15 families, got ${catalog.families.length}`);

  assert.equal(catalog.families[0].family, '_base', 'primitive/global family sorts first');
  let rest = catalog.families.slice(1).map((f) => f.family);
  assert.deepEqual(rest, [...rest].sort(), 'component families sort by name');

  for (let name of ['card', 'button', 'field', 'badge', 'banner', 'list-detail', 'tree', 'dialog']) {
    assert.ok(catalog.families.some((f) => f.family === name), `${name} family is present`);
  }
});

test('roles cover the core CSS axes', () => {
  let catalog = getSemanticTokenCatalog();
  for (let role of ['bg', 'border', 'radius', 'spacing']) {
    assert.ok(catalog.roles.includes(role), `roles include ${role}`);
  }
});

test('the card family exposes its canonical reuse tokens with sensible roles', () => {
  let card = tokensForFamily('card');
  assert.ok(card.length > 0, 'card family is non-empty');

  assert.equal(roleOf(card, '--sn-card-bg'), 'bg');
  assert.equal(roleOf(card, '--sn-card-border'), 'border');
  assert.equal(roleOf(card, '--sn-card-radius'), 'radius');
  assert.equal(roleOf(card, '--sn-card-padding'), 'spacing');
});

test('tokensForFamily is case-insensitive and unknown families return []', () => {
  let lower = tokensForFamily('button');
  let mixed = tokensForFamily('Button');
  assert.ok(lower.length > 0, 'button family is non-empty');
  assert.deepEqual(mixed, lower, 'family lookup ignores case');
  assert.deepEqual(tokensForFamily('definitely-not-a-family'), [], 'unknown family is empty');
  assert.deepEqual(tokensForFamily(''), [], 'blank family is empty');
});

test('tokensByRole filters a family to a single role', () => {
  let cardBg = tokensByRole('card', 'bg');
  assert.ok(cardBg.includes('--sn-card-bg'), 'card bg tokens include --sn-card-bg');
  assert.ok(cardBg.every((t) => t.startsWith('--sn-card-')), 'only card tokens returned');

  assert.deepEqual(tokensByRole('card', 'radius'), ['--sn-card-radius'], 'card has one radius token');
  assert.deepEqual(tokensByRole('card', 'definitely-not-a-role'), [], 'unknown role is empty');
});
