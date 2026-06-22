import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { StateGraph } from '../../src/node/state-graph.js';

// Single-writer ownership guard: two long-lived backends pointed at one snapshot must not both
// rewrite/compact it (the multi-backend race that clobbered persistent state). The newest claimant
// owns the snapshot; a superseded instance refuses to write and emits 'ownership-lost'.
describe('state-graph single-writer ownership guard', () => {
  let dir;
  let instances;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sg-ownership-'));
    instances = [];
  });

  afterEach(() => {
    for (let sg of instances) { try { clearInterval(sg._ownerHeartbeat); } catch { /* none */ } }
    fs.rmSync(dir, { recursive: true, force: true });
  });

  function makeSG(token, ownershipGuard = true) {
    let sg = new StateGraph({
      snapshotPath: path.join(dir, 'state.json'),
      walPath: path.join(dir, 'state.wal'),
      chatsDir: path.join(dir, 'chats'),
      oldConfigPath: path.join(dir, 'no-such-old-config.json'),
      ownershipGuard,
      instanceToken: token,
    });
    instances.push(sg);
    return sg;
  }

  let readSnapshot = () => JSON.parse(fs.readFileSync(path.join(dir, 'state.json'), 'utf8'));

  it('a superseded instance refuses to write the snapshot and emits ownership-lost; the owner writes', () => {
    let a = makeSG('A');
    a.load();                                   // A claims ownership
    a.commit([{ op: 'set', path: 'ui/x', value: 1 }], 'test');
    a._writeSnapshotSync();                      // A owns → writes
    assert.equal(readSnapshot().ui.x, 1, 'owner A persisted its commit');

    let b = makeSG('B');
    b.load();                                    // B claims ownership → A is now superseded

    let aLost = false;
    a.on('ownership-lost', () => { aLost = true; });
    a.commit([{ op: 'set', path: 'ui/x', value: 999 }], 'test'); // A mutates its own memory
    a._writeSnapshotSync();                       // A is NOT owner → must not write, signals loss

    assert.equal(aLost, true, 'the superseded instance emitted ownership-lost');
    assert.equal(readSnapshot().ui.x, 1, 'A did NOT clobber the snapshot with its stale 999');

    b.commit([{ op: 'set', path: 'ui/y', value: 2 }], 'test');
    b._writeSnapshotSync();                        // B owns → writes
    assert.equal(readSnapshot().ui.y, 2, 'owner B persists normally');
    assert.equal(readSnapshot().ui.x, 1, 'B kept the loaded value, no corruption');
  });

  it('the surviving owner reclaims after the previous owner record goes dead (stale pid)', () => {
    let a = makeSG('A');
    a.load();
    // Simulate a previous owner that is no longer alive: a dead pid + foreign token.
    fs.writeFileSync(path.join(dir, 'state.json.owner'), JSON.stringify({ pid: 2 ** 30, token: 'GHOST', startedAt: 1 }));
    assert.equal(a._ownsSnapshot(), true, 'a dead owner record is reclaimed (fail-open), A may write');
    a.commit([{ op: 'set', path: 'ui/z', value: 7 }], 'test');
    a._writeSnapshotSync();
    assert.equal(readSnapshot().ui.z, 7);
  });

  it('with the guard OFF (default) writes always proceed and no owner file is created', () => {
    let a = makeSG('A', false);
    a.load();
    assert.equal(a._ownsSnapshot(), true, 'no guard → always owner');
    a.commit([{ op: 'set', path: 'ui/q', value: 5 }], 'test');
    a._writeSnapshotSync();
    assert.equal(readSnapshot().ui.q, 5);
    assert.equal(fs.existsSync(path.join(dir, 'state.json.owner')), false, 'no ownership file without the guard');
  });
});
