import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { StateGraph } from '../../src/node/state-graph.js';

// Single-writer ownership guard: two long-lived backends pointed at one snapshot must not both
// rewrite/compact it (the multi-backend race that clobbered persistent state). The newest claimant
// owns the snapshot; a superseded instance refuses to write and emits 'ownership-lost'. Identity is a
// per-instance token; the recorded pid is only a liveness signal for a DIFFERENT owner. Tests inject a
// distinct `instancePid` + `isPidAlive` so two simulated processes live inside this one test process.
describe('state-graph single-writer ownership guard', () => {
  let dir;
  let instances;
  let alive;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sg-ownership-'));
    instances = [];
    alive = new Set();
  });

  afterEach(() => {
    for (let sg of instances) { try { clearInterval(sg._ownerHeartbeat); } catch { /* none */ } }
    fs.rmSync(dir, { recursive: true, force: true });
  });

  function makeSG(token, { pid, guard = true } = {}) {
    if (pid) alive.add(pid);
    let sg = new StateGraph({
      snapshotPath: path.join(dir, 'state.json'),
      walPath: path.join(dir, 'state.wal'),
      chatsDir: path.join(dir, 'chats'),
      oldConfigPath: path.join(dir, 'no-such-old-config.json'),
      ownershipGuard: guard,
      instanceToken: token,
      instancePid: pid,
      isPidAlive: (p) => alive.has(p),
    });
    instances.push(sg);
    return sg;
  }

  let readSnapshot = () => JSON.parse(fs.readFileSync(path.join(dir, 'state.json'), 'utf8'));
  let ownerPath = () => path.join(dir, 'state.json.owner');

  it('a superseded instance refuses to write the snapshot and emits ownership-lost; the owner writes', () => {
    let a = makeSG('A', { pid: 1001 });
    a.load();
    a.commit([{ op: 'set', path: 'ui/x', value: 1 }], 'test');
    a._writeSnapshotSync();
    assert.equal(readSnapshot().ui.x, 1, 'owner A persisted its commit');

    let b = makeSG('B', { pid: 1002 });
    b.load(); // B (a distinct live pid) claims ownership → A is superseded

    let aLost = false;
    a.on('ownership-lost', () => { aLost = true; });
    a.commit([{ op: 'set', path: 'ui/x', value: 999 }], 'test');
    a._writeSnapshotSync();

    assert.equal(aLost, true, 'the superseded instance emitted ownership-lost');
    assert.equal(a._ownershipLost, true, 'and set its in-memory short-circuit flag');
    assert.equal(readSnapshot().ui.x, 1, 'A did NOT clobber the snapshot with its stale 999');

    b.commit([{ op: 'set', path: 'ui/y', value: 2 }], 'test');
    b._writeSnapshotSync();
    assert.equal(readSnapshot().ui.y, 2, 'owner B persists normally');
    assert.equal(readSnapshot().ui.x, 1, 'B kept the loaded value, no corruption');
  });

  it('FAIL-OPEN: a foreign-token record bearing OUR OWN pid (a failed re-claim) is reclaimed, never blocks', () => {
    // This is the inverse data-loss the guard must avoid: the sole backend silently stops persisting.
    let a = makeSG('A', { pid: 1001 });
    a.load();
    // Simulate a stale self-record: our pid, a foreign token (e.g. an earlier claim that lost its token).
    fs.writeFileSync(ownerPath(), JSON.stringify({ pid: 1001, token: 'STALE-SELF', startedAt: 1 }));
    assert.equal(a._ownsSnapshot(), true, 'our own pid with a foreign token is reclaimed, not blocked');
    a.commit([{ op: 'set', path: 'ui/v', value: 42 }], 'test');
    a._writeSnapshotSync();
    assert.equal(readSnapshot().ui.v, 42, 'the sole backend keeps persisting');
  });

  it('reclaims after the previous owner record goes dead (stale, non-alive pid)', () => {
    let a = makeSG('A', { pid: 1001 });
    a.load();
    fs.writeFileSync(ownerPath(), JSON.stringify({ pid: 9999, token: 'GHOST', startedAt: 1 })); // 9999 not in `alive`
    assert.equal(a._ownsSnapshot(), true, 'a dead owner record is reclaimed (fail-open)');
    a.commit([{ op: 'set', path: 'ui/z', value: 7 }], 'test');
    a._writeSnapshotSync();
    assert.equal(readSnapshot().ui.z, 7);
  });

  it('a superseded instance drops WAL writes (no version-colliding appends to the shared WAL)', () => {
    let a = makeSG('A', { pid: 1001 });
    a.load();
    let b = makeSG('B', { pid: 1002 });
    b.load(); // supersede A
    a._writeSnapshotSync(); // A detects loss → sets _ownershipLost
    assert.equal(a._ownershipLost, true);

    let walBefore = fs.existsSync(path.join(dir, 'state.wal')) ? fs.readFileSync(path.join(dir, 'state.wal'), 'utf8') : '';
    a.commit([{ op: 'set', path: 'ui/ghost', value: 'should-not-persist' }], 'test', { durable: true });
    let walAfter = fs.existsSync(path.join(dir, 'state.wal')) ? fs.readFileSync(path.join(dir, 'state.wal'), 'utf8') : '';
    assert.equal(walAfter, walBefore, 'the superseded instance appended nothing to the shared WAL');
    assert.ok(!walAfter.includes('should-not-persist'), 'its abandoned commit is not on disk');
  });

  it('re-reads ownership from disk before a WAL append, even when the heartbeat has not fired yet', async () => {
    // Closes the heartbeat-sized window: A loses ownership on disk but its cached flag is still clear.
    // The fresh _ownsSnapshot() re-check inside _flushWal must catch it before the async append lands.
    let a = makeSG('A', { pid: 1001 });
    a.load();
    a.commit([{ op: 'set', path: 'ui/a', value: 1 }], 'test');
    await a._flushWal();
    let walAfterOwner = fs.readFileSync(path.join(dir, 'state.wal'), 'utf8');

    // A different live writer takes the owner record on disk; A's cached flag is intentionally NOT set.
    alive.add(1002);
    fs.writeFileSync(ownerPath(), JSON.stringify({ pid: 1002, token: 'B', startedAt: Date.now() }));
    assert.equal(a._ownershipLost, false, 'cached flag still clear (heartbeat has not run)');

    a.commit([{ op: 'set', path: 'ui/a', value: 999 }], 'test');
    await a._flushWal();

    assert.equal(a._ownershipLost, true, 'the fresh on-disk re-check detected the takeover');
    assert.equal(
      fs.readFileSync(path.join(dir, 'state.wal'), 'utf8'),
      walAfterOwner,
      'A appended nothing after losing ownership on disk',
    );
  });

  it('stamps every WAL record with the writer token and a per-writer monotonic fence', async () => {
    let a = makeSG('A', { pid: 1001 });
    a.load();
    a.commit([{ op: 'set', path: 'ui/a', value: 1 }], 'test');
    a.commit([{ op: 'set', path: 'ui/b', value: 2 }], 'test');
    await a._flushWal();

    let entries = fs.readFileSync(path.join(dir, 'state.wal'), 'utf8')
      .split('\n').filter(Boolean).map((l) => JSON.parse(l));
    assert.ok(entries.length >= 2);
    for (let entry of entries) {
      assert.equal(entry.writer, 'A', 'record carries the writer token');
      assert.equal(typeof entry.fence, 'number', 'record carries a numeric fence');
    }
    let fences = entries.map((e) => e.fence);
    for (let i = 1; i < fences.length; i++) {
      assert.ok(fences[i] > fences[i - 1], 'the per-writer fence is strictly monotonic');
    }
  });

  it('with the guard OFF (default) writes always proceed and no owner file is created', () => {
    let a = makeSG('A', { guard: false });
    a.load();
    assert.equal(a._ownsSnapshot(), true, 'no guard → always owner');
    a.commit([{ op: 'set', path: 'ui/q', value: 5 }], 'test');
    a._writeSnapshotSync();
    assert.equal(readSnapshot().ui.q, 5);
    assert.equal(fs.existsSync(ownerPath()), false, 'no ownership file without the guard');
  });
});
