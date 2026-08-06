import { acquireCurrentTestFileLock } from './test-lock.js';
await acquireCurrentTestFileLock(import.meta.url);

import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  composeNarration,
  selectNarrationPhrase,
  listNarrationVariants,
  NOTIFICATION_EVENT_TYPES,
  NARRATION_DEPTHS,
  DEFAULT_NARRATION_DEPTH,
} from '../chat/notification-phrases.js';

test('renders the task-moved template with interpolated params', () => {
  let result = composeNarration({
    type: 'task.moved',
    params: { title: 'Refactor', stage: 'Review' },
    locale: 'en',
    depth: 'chatty',
    random: () => 0,
  });
  assert.equal(result.text, 'Task Refactor has moved to Review.');
  assert.equal(result.type, 'task.moved');
  assert.equal(result.locale, 'en');
  assert.equal(result.depth, 'chatty');
  assert.equal(result.variantIndex, 0);
});

test('randomized selection is deterministic under an injected RNG', () => {
  let variants = listNarrationVariants({ type: 'task.moved', locale: 'en', depth: 'terse' });
  assert.ok(variants.length >= 3);
  // random just below 1 selects the last variant; clamped never out of range.
  let last = composeNarration({ type: 'task.moved', params: { title: 'A', stage: 'B' }, locale: 'en', depth: 'terse', random: () => 0.999 });
  assert.equal(last.variantIndex, variants.length - 1);
  let first = composeNarration({ type: 'task.moved', params: { title: 'A', stage: 'B' }, locale: 'en', depth: 'terse', random: () => 0 });
  assert.equal(first.variantIndex, 0);
});

test('explicit variants override the built-in bank', () => {
  let result = composeNarration({
    type: 'task.moved',
    params: { title: 'Build', stage: 'Review' },
    locale: 'en',
    depth: 'terse',
    variants: ['{title} now at {stage}'],
    random: () => 0,
  });
  assert.equal(result.text, 'Build now at Review');
  // An empty override list falls back to the built-in bank.
  let fallback = composeNarration({
    type: 'task.moved',
    params: { title: 'Build', stage: 'Review' },
    locale: 'en',
    depth: 'terse',
    variants: [],
    random: () => 0,
  });
  assert.notEqual(fallback.text, 'Build now at Review');
});

test('terse and chatty depth produce different phrasings', () => {
  let terse = selectNarrationPhrase({ type: 'task.completed', params: { title: 'X' }, locale: 'en', depth: 'terse', random: () => 0 });
  let chatty = selectNarrationPhrase({ type: 'task.completed', params: { title: 'X' }, locale: 'en', depth: 'chatty', random: () => 0 });
  assert.notEqual(terse, chatty);
  assert.match(chatty, /complete/i);
});

test('localizes phrases for ru and es', () => {
  let ru = selectNarrationPhrase({ type: 'task.moved', params: { title: 'Сборка', stage: 'Ревью' }, locale: 'ru', depth: 'chatty', random: () => 0 });
  assert.equal(ru, 'Задача Сборка перемещена в Ревью.');
  let es = selectNarrationPhrase({ type: 'task.failed', params: { title: 'Deploy' }, locale: 'es', depth: 'terse', random: () => 0 });
  assert.match(es, /Deploy/);
});

test('falls back to defaults for unknown type, depth and locale', () => {
  let result = composeNarration({
    type: 'does.not.exist',
    params: { message: 'Hello there' },
    locale: 'zz',
    depth: 'verbose',
    random: () => 0,
  });
  assert.equal(result.type, 'generic');
  assert.equal(result.locale, 'en');
  assert.equal(result.depth, DEFAULT_NARRATION_DEPTH);
  assert.equal(result.text, 'Hello there');
});

test('every event type has terse and chatty variants in every locale', () => {
  for (let locale of ['en', 'ru', 'es']) {
    for (let type of NOTIFICATION_EVENT_TYPES) {
      for (let depth of NARRATION_DEPTHS) {
        let variants = listNarrationVariants({ type, locale, depth });
        assert.ok(variants.length > 0, `${locale}/${type}/${depth} has variants`);
        for (let variant of variants) {
          assert.equal(typeof variant, 'string');
          assert.ok(variant.length > 0);
        }
      }
    }
  }
});
