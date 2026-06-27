import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { StateGraph } from '../../src/node/state-graph.js';
import { createWorkflowBoardService } from '../../src/node/workflow-board-service.js';
import { humanPrincipal } from '../../src/node/server/principal.js';

// rootIndex is the single grouped pass shared by the per-decompose-subtree spend breakdown and the
// per-root convergence cap. These tests pin its three products (rootKeyOf, descendantsByRoot, runsByRoot),
// confirm decomposeSubtreeSpend still reads through it with the same shape/sort, and exercise the
// monotonic depth/fanout/runCount counters the convergence gate consumes.
describe('workflow board root index + per-root convergence counts', () => {
  let tmpDir;
  let sg;
  let now;
  let idSeq;
  let service;
  let boardId;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'workflow-root-index-'));
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
    boardId = service.ensureBoard().id;
  });

  afterEach(async () => {
    await sg.flushChatWrites();
    sg.flush();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function makeCard({ parentCardId = null, rootCardId = undefined } = {}) {
    return service.createOrUpdateCard({
      title: `Card ${++idSeq}`,
      body: 'Work item.',
      columnId: 'backlog',
      projectId: 'agent-portal',
      parentCardId,
      ...(rootCardId !== undefined ? { metadata: { rootCardId } } : {}),
      actor: 'test',
    }).card;
  }

  function seedRun(cardId, tokens) {
    let runId = `seed-run-${++idSeq}`;
    sg.commit([{ op: 'set', path: `workflowRuns/${runId}`, value: {
      schema: 'workflow-run/v1',
      id: runId,
      boardId,
      cardId,
      status: 'completed',
      startedAt: 1,
      updatedAt: 2,
      completedAt: 2,
      tokens,
      taskIds: [],
    } }], 'test:seed-run');
    return runId;
  }

  it('keys every card under its stamped rootCardId, grouping descendants and runs by root', () => {
    let root = makeCard();
    let child = makeCard({ parentCardId: root.id, rootCardId: root.id });
    let grandchild = makeCard({ parentCardId: child.id, rootCardId: root.id });
    let sibling = makeCard({ parentCardId: root.id, rootCardId: root.id });
    let lonely = makeCard();

    seedRun(child.id, 100);
    seedRun(grandchild.id, 250);
    seedRun(lonely.id, 40);

    let index = service.rootIndex(boardId);
    assert.equal(index.rootKeyOf(service.getCard(grandchild.id)), root.id, 'stamped rootCardId wins for a descendant');
    assert.equal(index.rootKeyOf(service.getCard(lonely.id)), lonely.id, 'an unparented card is its own root');

    let group = index.descendantsByRoot.get(root.id).map(c => c.id).sort();
    assert.deepEqual(group, [root.id, child.id, grandchild.id, sibling.id].sort(),
      'the root group holds the root plus every descendant sharing the stamped key');
    assert.deepEqual(index.descendantsByRoot.get(lonely.id).map(c => c.id), [lonely.id]);

    let rootRuns = index.runsByRoot.get(root.id);
    assert.equal(rootRuns.length, 2, 'both subtree runs roll under the root');
    assert.equal(rootRuns.reduce((t, r) => t + r.tokens, 0), 350);
  });

  it('falls back to the topmost ancestor when rootCardId is unstamped, surviving a retired chain', () => {
    // No metadata.rootCardId on any card: the key must come from the parentCardId walk.
    let root = makeCard();
    let child = makeCard({ parentCardId: root.id });
    let grandchild = makeCard({ parentCardId: child.id });

    let index = service.rootIndex(boardId);
    assert.equal(index.rootKeyOf(service.getCard(grandchild.id)), root.id, 'walks up to the topmost ancestor');
    assert.equal(index.rootKeyOf(service.getCard(child.id)), root.id);

    // A pruned parent pointer (child orphaned) makes that card its own root for the walk fallback.
    let orphan = makeCard({ parentCardId: 'missing-card' });
    let index2 = service.rootIndex(boardId);
    assert.equal(index2.rootKeyOf(service.getCard(orphan.id)), orphan.id);
  });

  it('decomposeSubtreeSpend reads through rootIndex with the same shape and tokens-desc sort', () => {
    let rootA = makeCard();
    let childA = makeCard({ parentCardId: rootA.id, rootCardId: rootA.id });
    let rootB = makeCard();

    seedRun(childA.id, 500);
    seedRun(rootB.id, 900);

    let spend = service.rootIndex(boardId); // touch the shared pass
    assert.ok(spend.runsByRoot.has(rootA.id) && spend.runsByRoot.has(rootB.id));

    // perRootConvergenceCounts and the subtree spend share the same root keys.
    let counts = service.perRootConvergenceCounts(service.ensureBoard(), rootA.id);
    assert.deepEqual(counts, { depth: 1, fanout: 2, runCount: 1 },
      'rootA: one nesting level, two cards, one charged run');
  });

  it('per-root counts are monotonic: depth = deepest chain, fanout = group size, runCount = subtree runs', () => {
    let root = makeCard();
    let child = makeCard({ parentCardId: root.id, rootCardId: root.id });
    let grandchild = makeCard({ parentCardId: child.id, rootCardId: root.id });
    makeCard({ parentCardId: root.id, rootCardId: root.id }); // a shallow sibling

    seedRun(child.id, 10);
    seedRun(grandchild.id, 20);
    seedRun(grandchild.id, 30);

    let board = service.ensureBoard();
    let counts = service.perRootConvergenceCounts(board, root.id);
    assert.equal(counts.depth, 2, 'deepest chain is root → child → grandchild');
    assert.equal(counts.fanout, 4, 'root plus three descendants');
    assert.equal(counts.runCount, 3, 'three runs charged anywhere in the subtree');

    // An unrelated root has its own independent, smaller counts.
    let other = makeCard();
    let otherCounts = service.perRootConvergenceCounts(board, other.id);
    assert.deepEqual(otherCounts, { depth: 0, fanout: 1, runCount: 0 });
  });
});
