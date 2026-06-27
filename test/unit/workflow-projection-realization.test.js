import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { StateGraph } from '../../src/node/state-graph.js';
import { createWorkflowBoardService } from '../../src/node/workflow-board-service.js';
import { humanPrincipal } from '../../src/node/server/principal.js';

// getBoardProjection stamps each ROOT card (no parent, or rootCardId === id) with a
// metadata.realization rollup counting its subtree by terminal status. It rides metadata/raw (not a
// flattened display field) and is computed once per root from a single grouped pass over the cards.
describe('workflow board projection realization rollup', () => {
  let tmpDir;
  let sg;
  let now;
  let idSeq;
  let service;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'workflow-projection-realization-'));
    sg = new StateGraph({
      snapshotPath: path.join(tmpDir, 'state.json'),
      walPath: path.join(tmpDir, 'state.wal'),
      chatsDir: path.join(tmpDir, 'chats'),
    });
    now = 1000;
    idSeq = 0;
    service = createWorkflowBoardService({
      stateGraph: sg,
      now: () => now++,
      makeId: (prefix) => `${prefix}-${++idSeq}`,
      projectRoot: tmpDir,
      defaultPrincipal: humanPrincipal({ transport: { channel: 'loopback' }, label: 'local-human' }),
    });
    service.ensureBoard();
  });

  afterEach(async () => {
    await sg.flushChatWrites();
    sg.flush();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function makeCard({ parentCardId = null, rootCardId = undefined, columnId = 'backlog' } = {}) {
    return service.createOrUpdateCard({
      title: `Card ${++idSeq}`,
      body: 'Work item.',
      columnId,
      projectId: 'agent-portal',
      parentCardId,
      ...(rootCardId !== undefined ? { metadata: { rootCardId } } : {}),
      actor: 'test',
    }).card;
  }

  function projectedCard(id) {
    return service.getBoardProjection({ projectId: 'agent-portal' }).cards.find(c => c.id === id) ?? null;
  }

  it('stamps a subtree rollup on the root, bucketed by terminal column status', () => {
    let root = makeCard();
    makeCard({ parentCardId: root.id, rootCardId: root.id, columnId: 'done' });
    makeCard({ parentCardId: root.id, rootCardId: root.id, columnId: 'rejected' });
    let active = makeCard({ parentCardId: root.id, rootCardId: root.id, columnId: 'ready' });

    // A blocked descendant (lifecycle, not column) buckets as blocked.
    let blocked = makeCard({ parentCardId: active.id, rootCardId: root.id });
    service.createOrUpdateCard({ id: blocked.id, lifecycle: 'blocked', actor: 'test' });

    let realization = projectedCard(root.id).metadata.realization;
    assert.equal(realization.root, root.id);
    assert.equal(realization.total, 5, 'root plus four descendants');
    assert.equal(realization.done, 1);
    assert.equal(realization.rejected, 1);
    assert.equal(realization.blocked, 1);
    assert.equal(realization.active, 2, 'the root (backlog) and the ready descendant');
  });

  it('only roots carry realization; descendants are left untouched', () => {
    let root = makeCard();
    let child = makeCard({ parentCardId: root.id, rootCardId: root.id });

    assert.ok(projectedCard(root.id).metadata.realization, 'the root is stamped');
    assert.equal(projectedCard(child.id).metadata?.realization, undefined, 'a descendant is not stamped');
  });

  it('treats a self-rooted card (rootCardId === id) as a root even with a parent pointer', () => {
    let root = makeCard();
    // A re-decompose origin can carry rootCardId === its own id while still pointing at a parent.
    let selfRoot = makeCard({ parentCardId: root.id, rootCardId: undefined });
    service.createOrUpdateCard({ id: selfRoot.id, metadata: { rootCardId: selfRoot.id }, actor: 'test' });

    let realization = projectedCard(selfRoot.id).metadata.realization;
    assert.ok(realization, 'a self-rooted card is treated as a root');
    assert.equal(realization.root, selfRoot.id);
  });

  it('roots without descendants still get a singleton rollup (total 1)', () => {
    let lonely = makeCard();
    let realization = projectedCard(lonely.id).metadata.realization;
    assert.deepEqual(realization, { root: lonely.id, total: 1, done: 0, rejected: 0, active: 1, blocked: 0 });
  });
});
