import { acquireCurrentTestFileLock } from './test-lock.js';
await acquireCurrentTestFileLock(import.meta.url);

import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  SEVERITY_RANK,
  severityRank,
  normalizeNotificationItem,
  notificationKey,
  createNotificationQueue,
  createNotificationDebouncer,
} from '../notifications/notification-queue.js';

test('normalizeNotificationItem fills stable defaults', () => {
  let item = normalizeNotificationItem({ type: 'price', severity: 'WARN', symbol: ' btc ', message: 'up' }, 0);
  assert.equal(item.type, 'price');
  assert.equal(item.severity, 'warn');
  assert.equal(item.symbol, 'BTC');
  assert.equal(item.message, 'up');
  assert.equal(item.rank, severityRank('warn'));
});

test('normalizeNotificationItem derives a deterministic fallback id', () => {
  let a = normalizeNotificationItem({ type: 'x', ts: 5 }, 2);
  let b = normalizeNotificationItem({ type: 'x', ts: 5 }, 2);
  assert.equal(a.id, b.id);
  assert.equal(a.id, 'x:5:2');
});

test('severityRank orders known severities and defaults unknown to info', () => {
  assert.ok(severityRank('critical') > severityRank('error'));
  assert.ok(severityRank('error') > severityRank('warning'));
  assert.ok(severityRank('warning') > severityRank('info'));
  assert.equal(severityRank('nonsense'), SEVERITY_RANK.info);
});

test('queue dedups by id and keeps newest within limit', () => {
  let q = createNotificationQueue({ limit: 3 });
  let accepted = q.push([
    { id: 'a', type: 'x' },
    { id: 'a', type: 'x' },
    { id: 'b', type: 'y' },
  ]);
  assert.equal(accepted.length, 2, 'duplicate id is rejected');
  assert.equal(q.size, 2);
  assert.ok(q.has('a'));

  q.push([{ id: 'c' }, { id: 'd' }]);
  assert.equal(q.size, 3, 'limit enforced');
  assert.equal(q.has('a'), false, 'oldest evicted and forgotten');
  assert.deepEqual(q.list().map((i) => i.id), ['b', 'c', 'd']);
});

test('queue.bySeverity sorts by rank then timestamp', () => {
  let q = createNotificationQueue();
  q.push([
    { id: '1', severity: 'info', ts: 10 },
    { id: '2', severity: 'critical', ts: 20 },
    { id: '3', severity: 'warning', ts: 30 },
    { id: '4', severity: 'critical', ts: 5 },
  ]);
  assert.deepEqual(q.bySeverity().map((i) => i.id), ['4', '2', '3', '1']);
});

test('notificationKey defaults to type', () => {
  assert.equal(notificationKey({ type: 'beep' }), 'beep');
  assert.equal(notificationKey({}), 'notification');
});

test('debouncer collapses a rapid same-type burst into one emission', () => {
  let d = createNotificationDebouncer({ debounceMs: 100, minIntervalMs: 100, maxWaitMs: 10000 });
  // 50 events of the same type, 1ms apart — classic spam.
  for (let i = 0; i < 50; i++) {
    assert.equal(d.push({ id: `e${i}`, type: 'ping', message: `m${i}` }, i), true);
  }
  // Still inside the quiet window -> nothing flushes yet.
  assert.deepEqual(d.flush(60), []);
  // Quiet period elapsed after last event (t=49) + 100ms.
  let out = d.flush(49 + 100);
  assert.equal(out.length, 1, 'one coalesced emission for the whole burst');
  assert.equal(out[0].count, 50);
  assert.equal(out[0].coalesced, true);
  assert.equal(out[0].message, 'm49', 'carries the latest payload');
  assert.equal(d.pending, 0);
});

test('debouncer keeps distinct types in separate buckets', () => {
  let d = createNotificationDebouncer({ debounceMs: 50, minIntervalMs: 50 });
  d.push({ id: 'a1', type: 'alpha' }, 0);
  d.push({ id: 'b1', type: 'beta' }, 0);
  d.push({ id: 'a2', type: 'alpha' }, 10);
  let out = d.flush(200).sort((x, y) => x.key.localeCompare(y.key));
  assert.equal(out.length, 2);
  assert.deepEqual(out.map((o) => o.key), ['alpha', 'beta']);
  assert.equal(out.find((o) => o.key === 'alpha').count, 2);
});

test('debouncer rate-limits repeated flushes of the same key', () => {
  let d = createNotificationDebouncer({ debounceMs: 10, minIntervalMs: 100, maxWaitMs: 100000 });
  d.push({ id: '1', type: 'tick' }, 0);
  let first = d.flush(10);
  assert.equal(first.length, 1, 'first window flushes');

  // New event right after the flush — still inside the rate-limit window.
  d.push({ id: '2', type: 'tick' }, 20);
  assert.deepEqual(d.flush(30), [], 'rate-limited: cannot beep again so soon');

  // Once minIntervalMs has passed since the first emission, it flushes.
  let second = d.flush(10 + 100);
  assert.equal(second.length, 1);
  assert.equal(second[0].count, 1);
});

test('debouncer caps coalescing of a never-ending stream via maxWaitMs', () => {
  let d = createNotificationDebouncer({ debounceMs: 1000, maxWaitMs: 500, minIntervalMs: 0 });
  // A continuous stream where the quiet window is never reached.
  for (let t = 0; t <= 600; t += 100) {
    d.push({ id: `s${t}`, type: 'stream' }, t);
  }
  // Quiet debounce (1000ms) never satisfied, but maxWaitMs(500) since first event is.
  let out = d.flush(600);
  assert.equal(out.length, 1, 'maxWait forces a flush so the stream is not starved');
  assert.ok(out[0].count >= 6);
});

test('debouncer dedups by id before coalescing', () => {
  let d = createNotificationDebouncer({ debounceMs: 50, minIntervalMs: 50 });
  assert.equal(d.push({ id: 'dup', type: 't' }, 0), true);
  assert.equal(d.push({ id: 'dup', type: 't' }, 5), false, 'duplicate id dropped');
  let out = d.flush(200);
  assert.equal(out[0].count, 1);
});

test('nextDueAt reports the earliest pending flush time and null when idle', () => {
  let d = createNotificationDebouncer({ debounceMs: 100, minIntervalMs: 100, maxWaitMs: 5000 });
  assert.equal(d.nextDueAt(), null, 'nothing pending');
  d.push({ id: 'a', type: 'x' }, 0);
  assert.equal(d.nextDueAt(), 100, 'firstSeen + debounce');
  d.push({ id: 'b', type: 'x' }, 40);
  assert.equal(d.nextDueAt(), 140, 'debounce slides with the latest event');
});

test('debouncer is deterministic and stateless across reset', () => {
  let d = createNotificationDebouncer({ debounceMs: 30 });
  d.push({ id: '1', type: 'x' }, 0);
  d.reset();
  assert.equal(d.pending, 0);
  assert.deepEqual(d.flush(1000), []);
});
