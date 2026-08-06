import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  createMessageWindow,
  extendMessageWindow,
  messageWindowFromPage,
  intersectPages,
  validateBoundaries,
} from '../chat/message-window.js';

test('createMessageWindow returns an empty window', () => {
  const window = createMessageWindow();
  assert.deepEqual(window, {
    startIndex: 0,
    count: 0,
    totalItems: 0,
    hasOlder: false,
    hasNewer: false,
    start: 0,
    end: 0,
  });
});

test('messageWindowFromPage maps the page contract', () => {
  const window = messageWindowFromPage({
    start: 40,
    end: 60,
    total: 100,
    hasBefore: true,
    hasAfter: true,
    messages: new Array(20).fill({}),
  });
  assert.equal(window.startIndex, 40);
  assert.equal(window.count, 20);
  assert.equal(window.totalItems, 100);
  assert.equal(window.hasOlder, true);
  assert.equal(window.hasNewer, true);
  assert.equal(window.start, 40);
  assert.equal(window.end, 60);
});

test('messageWindowFromPage infers end from messages and total from end', () => {
  const window = messageWindowFromPage({ start: 5, messages: new Array(3).fill({}) });
  assert.equal(window.end, 8);
  assert.equal(window.count, 3);
  assert.equal(window.totalItems, 8);
  assert.equal(window.hasOlder, false);
  assert.equal(window.hasNewer, false);
});

test('messageWindowFromPage defaults to an empty window', () => {
  const window = messageWindowFromPage();
  assert.equal(window.start, 0);
  assert.equal(window.end, 0);
  assert.equal(window.count, 0);
  assert.equal(window.totalItems, 0);
});

test('extendMessageWindow grows the window and clears hasNewer', () => {
  const base = messageWindowFromPage({ start: 0, end: 10, total: 10, hasAfter: true });
  const next = extendMessageWindow(base, 3);
  assert.equal(next.count, 13);
  assert.equal(next.totalItems, 13);
  assert.equal(next.end, 13);
  assert.equal(next.hasNewer, false);
  // original is not mutated
  assert.equal(base.count, 10);
});

test('extendMessageWindow returns the window unchanged for non-positive count', () => {
  const base = createMessageWindow();
  assert.equal(extendMessageWindow(base, 0), base);
  assert.equal(extendMessageWindow(base, -2), base);
});

test('extendMessageWindow tolerates a missing window', () => {
  assert.equal(extendMessageWindow(null, 5), null);
  assert.equal(extendMessageWindow(undefined, 5), undefined);
});

test('extendMessageWindow derives end from startIndex and count when absent', () => {
  const next = extendMessageWindow({ startIndex: 2, count: 4 }, 1);
  assert.equal(next.count, 5);
  assert.equal(next.end, 7);
  assert.equal(next.totalItems, 7);
});

test('intersectPages reports an overlapping range', () => {
  const result = intersectPages({ start: 0, end: 20 }, { start: 15, end: 30 });
  assert.deepEqual(result, { start: 15, end: 20, count: 5, overlaps: true });
});

test('intersectPages reports disjoint slices', () => {
  const result = intersectPages({ start: 0, end: 10 }, { start: 20, end: 30 });
  assert.equal(result.count, 0);
  assert.equal(result.overlaps, false);
});

test('intersectPages infers end from messages', () => {
  const result = intersectPages(
    { start: 0, messages: new Array(10).fill({}) },
    { start: 5, messages: new Array(10).fill({}) },
  );
  assert.deepEqual(result, { start: 5, end: 10, count: 5, overlaps: true });
});

test('validateBoundaries accepts a consistent window', () => {
  const window = messageWindowFromPage({ start: 40, end: 60, total: 100, hasBefore: true, hasAfter: true });
  const result = validateBoundaries(window);
  assert.equal(result.valid, true);
  assert.deepEqual(result.errors, []);
});

test('validateBoundaries flags end not matching start + count', () => {
  const result = validateBoundaries({ startIndex: 0, count: 5, end: 7, totalItems: 10, hasOlder: false, hasNewer: true });
  assert.equal(result.valid, false);
  assert.ok(result.errors.includes('end must equal start + count'));
});

test('validateBoundaries flags end exceeding totalItems', () => {
  const result = validateBoundaries({ startIndex: 0, count: 12, end: 12, totalItems: 10, hasOlder: false, hasNewer: false });
  assert.equal(result.valid, false);
  assert.ok(result.errors.includes('end must not exceed totalItems'));
});

test('validateBoundaries flags negative fields', () => {
  const result = validateBoundaries({ startIndex: -1, count: -2, end: -3, totalItems: -4, hasOlder: false, hasNewer: false });
  assert.equal(result.valid, false);
  assert.ok(result.errors.includes('start index must be non-negative'));
  assert.ok(result.errors.includes('count must be non-negative'));
  assert.ok(result.errors.includes('totalItems must be non-negative'));
});

test('validateBoundaries flags hasNewer false while newer items remain', () => {
  const result = validateBoundaries({ startIndex: 0, count: 5, end: 5, totalItems: 10, hasOlder: false, hasNewer: false });
  assert.equal(result.valid, false);
  assert.ok(result.errors.includes('hasNewer is false but newer items remain after end'));
});

test('validateBoundaries rejects a non-object', () => {
  const result = validateBoundaries(null);
  assert.equal(result.valid, false);
  assert.deepEqual(result.errors, ['window must be an object']);
});

test('create -> messageWindowFromPage older page -> extend keeps boundaries valid', () => {
  // Initial visible window: newest 20 of 100, older remain.
  let window = messageWindowFromPage({ start: 80, end: 100, total: 100, hasBefore: true, hasAfter: false });
  assert.equal(validateBoundaries(window).valid, true);
  assert.equal(window.hasOlder, true);
  assert.equal(window.hasNewer, false);

  // Two new persisted messages appended at the tail.
  window = extendMessageWindow(window, 2);
  assert.equal(window.end, 102);
  assert.equal(window.totalItems, 102);
  assert.equal(window.hasNewer, false);
  assert.equal(validateBoundaries(window).valid, true);
});
