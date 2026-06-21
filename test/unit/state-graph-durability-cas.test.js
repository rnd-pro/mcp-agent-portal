import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { StateGraph } from '../../src/node/state-graph.js';

function makeSG(dir) {
  return new StateGraph({
    snapshotPath: path.join(dir, 'state.json'),
    walPath: path.join(dir, 'agent-portal.wal'),
    chatsDir: path.join(dir, 'chats'),
    // Isolate from the real user config so load() never migrates it in.
    oldConfigPath: path.join(dir, 'no-such-old-config.json'),
  });
}

// Simulate a hard crash: a fresh StateGraph over the same files, loaded, with
// NO flush()/snapshot from the writer — only what reached the WAL survives.
function recover(dir) {
  let sg = makeSG(dir);
  sg.load();
  return sg;
}

describe('StateGraph durability + commitCAS (WS-DUR / WS-CAS)', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sg-dur-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('durable commit reaches the WAL synchronously and survives a crash', () => {
    let sg = makeSG(tmpDir);
    sg.load();
    let v = sg.commit([{ op: 'set', path: 'workflowRuns/r1', value: { status: 'admitting' } }], 'admission', { durable: true });
    assert.equal(v, 1);

    // Crash before any flush()/snapshot — only the fsync'd WAL exists.
    let recovered = recover(tmpDir);
    assert.deepEqual(recovered.get('workflowRuns/r1'), { status: 'admitting' });
    assert.equal(recovered.version, 1);
  });

  it('non-durable commit is NOT on disk yet (async group-commit) — lost on immediate crash', () => {
    let sg = makeSG(tmpDir);
    sg.load();
    sg.commit([{ op: 'set', path: 'workflowRuns/r2', value: { status: 'queued' } }], 'test');

    // Immediately (the 50ms group-commit timer has not fired): a fresh load
    // recovers nothing — proving the durable path is what makes admission safe.
    let recovered = recover(tmpDir);
    assert.equal(recovered.get('workflowRuns/r2'), undefined);
    assert.equal(recovered.version, 0);
  });

  it('durable commit invokes the fsync barrier', () => {
    let calls = 0;
    let original = fs.fsyncSync;
    fs.fsyncSync = (fd) => { calls++; return original(fd); };
    try {
      let sg = makeSG(tmpDir);
      sg.load();
      sg.commit([{ op: 'set', path: 'workflowLeases/c1', value: { owner: 's1' } }], 'lease', { durable: true });
    } finally {
      fs.fsyncSync = original;
    }
    // At least the WAL fd fsync (and the parent-dir fsync on first WAL creation).
    assert.ok(calls >= 1, `expected fsyncSync to be called, got ${calls}`);
  });

  it('WAL replay is version-sorted (order-independent on disk)', () => {
    let walPath = path.join(tmpDir, 'agent-portal.wal');
    // Physically out-of-order WAL: v3 before v1/v2 (the durable/async interleave).
    let lines = [
      JSON.stringify({ v: 3, ts: 3, source: 'x', ops: [{ op: 'set', path: 'k/c', value: 3 }] }),
      JSON.stringify({ v: 1, ts: 1, source: 'x', ops: [{ op: 'set', path: 'k/a', value: 1 }] }),
      JSON.stringify({ v: 2, ts: 2, source: 'x', ops: [{ op: 'set', path: 'k/b', value: 2 }] }),
    ];
    fs.writeFileSync(walPath, lines.join('\n') + '\n');

    let sg = recover(tmpDir);
    assert.equal(sg.get('k/a'), 1);
    assert.equal(sg.get('k/b'), 2);
    assert.equal(sg.get('k/c'), 3);
    assert.equal(sg.version, 3);
  });

  it('commitCAS applies ops and bumps the epoch on a match', () => {
    let sg = makeSG(tmpDir);
    sg.load();
    let res = sg.commitCAS('workflowAdmissionLease/b1/epoch', 0,
      [{ op: 'set', path: 'workflowCards/c1', value: { lifecycle: 'admitting' } }], 'scheduler');
    assert.equal(res.ok, true);
    assert.equal(res.conflict, false);
    assert.equal(res.epoch, 1);
    assert.equal(sg.get('workflowAdmissionLease/b1/epoch'), 1);
    assert.deepEqual(sg.get('workflowCards/c1'), { lifecycle: 'admitting' });
  });

  it('commitCAS rejects a stale epoch and writes nothing', () => {
    let sg = makeSG(tmpDir);
    sg.load();
    sg.commitCAS('e/epoch', 0, [{ op: 'set', path: 'k/x', value: 'first' }], 's'); // epoch → 1
    let versionBefore = sg.version;

    let res = sg.commitCAS('e/epoch', 0, [{ op: 'set', path: 'k/x', value: 'stale' }], 's');
    assert.equal(res.ok, false);
    assert.equal(res.conflict, true);
    assert.equal(res.currentEpoch, 1);
    // Nothing applied, no version bump.
    assert.equal(sg.get('k/x'), 'first');
    assert.equal(sg.version, versionBefore);
  });

  it('commitCAS with { durable: true } fuses CAS + fsync and survives a crash', () => {
    let sg = makeSG(tmpDir);
    sg.load();
    let res = sg.commitCAS('workflowAdmissionLease/b1/epoch', 0,
      [{ op: 'set', path: 'workflowRuns/r9', value: { status: 'running', admissionId: 'a9' } }],
      'admission', { durable: true });
    assert.equal(res.ok, true);

    let recovered = recover(tmpDir);
    assert.equal(recovered.get('workflowAdmissionLease/b1/epoch'), 1);
    assert.deepEqual(recovered.get('workflowRuns/r9'), { status: 'running', admissionId: 'a9' });
  });

  it('a conflicting durable commitCAS does not write to the WAL', () => {
    let sg = makeSG(tmpDir);
    sg.load();
    sg.commitCAS('e/epoch', 0, [{ op: 'set', path: 'k/y', value: 1 }], 's', { durable: true }); // epoch → 1
    let res = sg.commitCAS('e/epoch', 0, [{ op: 'set', path: 'k/y', value: 2 }], 's', { durable: true });
    assert.equal(res.ok, false);

    let recovered = recover(tmpDir);
    assert.equal(recovered.get('k/y'), 1); // the conflicting write never happened
    assert.equal(recovered.get('e/epoch'), 1);
  });
});
