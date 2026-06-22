import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { StateGraph } from '../../src/node/state-graph.js';

// Must match SNAPSHOT_INTERVAL in src/node/state-graph.js — the number of
// commits that triggers the async _writeSnapshot() compaction path.
const SNAPSHOT_INTERVAL = 5000;

function makeSG(dir) {
  return new StateGraph({
    snapshotPath: path.join(dir, 'state.json'),
    walPath: path.join(dir, 'agent-portal.wal'),
    chatsDir: path.join(dir, 'chats'),
    // Isolate from the real user config so load() never migrates it in.
    oldConfigPath: path.join(dir, 'no-such-old-config.json'),
  });
}

// A fresh StateGraph over the same files, loaded — what survives a process
// restart given only the on-disk snapshot + WAL.
function recover(dir) {
  let sg = makeSG(dir);
  sg.load();
  return sg;
}

// Commit one distinct value per key, enough to cross SNAPSHOT_INTERVAL and fire
// the async _writeSnapshot(). Returns the expected key→value map.
function commitUntilSnapshot(sg) {
  let expected = {};
  for (let i = 0; i < SNAPSHOT_INTERVAL; i++) {
    let key = `kv/k${i}`;
    let value = `v${i}`;
    sg.commit([{ op: 'set', path: key, value }], 'snapshot-test');
    expected[key] = value;
  }
  return expected;
}

// Poll until the fire-and-forget async snapshot has completed. The WAL starts
// empty (the group-commit timer flushes it lazily), so we can't wait on an
// empty WAL — we wait on the snapshot having advanced to the committed version,
// which the method sets only after the durable rename + dir fsync + WAL
// truncation have all landed.
async function waitForSnapshot(sg, version, deadlineMs = 3000) {
  let start = Date.now();
  while (Date.now() - start < deadlineMs) {
    if (sg._snapshotVersion >= version) return;
    await new Promise((r) => setTimeout(r, 10));
  }
  throw new Error(`snapshot did not reach version ${version} (stuck at ${sg._snapshotVersion})`);
}

describe('StateGraph async snapshot durability (WS-SNAP-DUR)', () => {
  let tmpDir;
  let walPath;
  let snapshotPath;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sg-snap-'));
    walPath = path.join(tmpDir, 'agent-portal.wal');
    snapshotPath = path.join(tmpDir, 'state.json');
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('after the async snapshot, the snapshot alone holds all state and the WAL is truncated', async () => {
    let sg = makeSG(tmpDir);
    sg.load();
    let expected = commitUntilSnapshot(sg);
    await waitForSnapshot(sg, SNAPSHOT_INTERVAL);

    // (a) The WAL is empty (or only carries entries newer than the snapshot's
    //     version) — so truncating it could not have dropped any committed
    //     value, because every commit is captured in the snapshot.
    let snap = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'));
    let walRaw = fs.existsSync(walPath) ? fs.readFileSync(walPath, 'utf8') : '';
    let walEntries = walRaw.split('\n').filter(Boolean).map((l) => JSON.parse(l));
    for (let entry of walEntries) {
      assert.ok(entry.v > snap._v, `WAL entry v${entry.v} should be newer than snapshot v${snap._v}`);
    }

    // (b) Parsing the snapshot JSON directly yields every committed value.
    for (let [key, value] of Object.entries(expected)) {
      let leaf = key.split('/').reduce((acc, seg) => (acc == null ? acc : acc[seg]), snap);
      assert.equal(leaf, value, `snapshot missing ${key}`);
    }

    // (c) A fresh load() from the same paths returns every committed value.
    let recovered = recover(tmpDir);
    for (let [key, value] of Object.entries(expected)) {
      assert.equal(recovered.get(key), value, `recovery lost ${key}`);
    }
    assert.equal(recovered.version, SNAPSHOT_INTERVAL);
  });

  it('round-trip: snapshot then reload loses no value and duplicates none', async () => {
    let sg = makeSG(tmpDir);
    sg.load();
    let expected = commitUntilSnapshot(sg);
    await waitForSnapshot(sg, SNAPSHOT_INTERVAL);

    let recovered = recover(tmpDir);

    // Every committed value is present and exactly equal — none lost.
    for (let [key, value] of Object.entries(expected)) {
      assert.equal(recovered.get(key), value);
    }

    // No duplicate replay: the recovered version is the last committed version,
    // not inflated by re-applying snapshotted entries from the WAL.
    assert.equal(recovered.version, SNAPSHOT_INTERVAL);

    // The recovered kv map contains exactly the keys we committed — no extras.
    let recoveredKv = recovered.get('kv') || {};
    assert.equal(Object.keys(recoveredKv).length, SNAPSHOT_INTERVAL);
  });

  it('snapshot version tracking advances and clears the commit counter', async () => {
    let sg = makeSG(tmpDir);
    sg.load();
    commitUntilSnapshot(sg);
    await waitForSnapshot(sg, SNAPSHOT_INTERVAL);

    assert.equal(sg._snapshotVersion, SNAPSHOT_INTERVAL);
    assert.equal(sg._commitsSinceSnapshot, 0);
  });
});
