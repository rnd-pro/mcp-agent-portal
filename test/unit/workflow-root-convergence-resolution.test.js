import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { classifyWorkflowGraph } from '../../src/iso/workflow-board.js';
import { StateGraph } from '../../src/node/state-graph.js';
import { createWorkflowBoardService } from '../../src/node/workflow-board-service.js';
import { humanPrincipal } from '../../src/node/server/principal.js';

// resolveRootConvergenceBreaches is the active half of the per-root convergence cap (Step 4): the
// admission gate REFUSES a capped re-decompose wave, this sweep ROUTES the breached root to a terminal
// so the HARD INVARIANT (every card reaches a terminal) holds. These tests pin: a breached root parks in
// the human-decision lane with an attributable reason + marker; idempotency (a re-run never re-parks);
// the reject-terminal fallback when no decision lane exists; and that an under-cap root is left alone.
describe('workflow board per-root convergence breach resolution', () => {
  let tmpDir;
  let sg;
  let now;
  let idSeq;
  let service;
  let boardId;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'workflow-root-conv-resolve-'));
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

  // Tighten fanout to 2 so a root + one descendant breaches the cap with a minimal subtree.
  function capFanoutAt(limit) {
    let res = service.updateWorkflowBoard({ boardId, automation: { rootConvergence: { fanout: limit } } });
    assert.equal(res.ok, true);
  }

  it('parks a breached root in the human-decision lane with an attributable marker', () => {
    capFanoutAt(2);
    let root = makeCard();
    makeCard({ parentCardId: root.id, rootCardId: root.id });

    let res = service.resolveRootConvergenceBreaches(boardId);
    assert.equal(res.ok, true);
    assert.equal(res.resolved.length, 1, 'exactly the breached root is resolved');
    let entry = res.resolved[0];
    assert.equal(entry.cardId, root.id);
    assert.equal(entry.root, root.id);
    assert.equal(entry.terminal, 'decision');

    let parked = service.getCard(root.id);
    assert.equal(parked.columnId, 'needs-decision', 'the breached root parks in the decision lane');
    assert.ok(parked.metadata?.rootConvergenceBreached, 'the convergence marker is stamped');
    assert.equal(parked.metadata.rootConvergenceBreached.root, root.id);
    let fanout = parked.metadata.rootConvergenceBreached.breaches.find(b => b.dimension === 'fanout');
    assert.ok(fanout, 'the breached dimension is recorded on the marker');
    let state = parked.metadata.escalation;
    assert.equal(state.kind, 'needs_decision');
    assert.match(state.lastEscalation.detail, /convergence cap/);
    assert.match(state.lastEscalation.detail, new RegExp(root.id));
  });

  it('is idempotent — a re-run never re-parks an already-resolved root', () => {
    capFanoutAt(2);
    let root = makeCard();
    makeCard({ parentCardId: root.id, rootCardId: root.id });

    let first = service.resolveRootConvergenceBreaches(boardId);
    assert.equal(first.resolved.length, 1);
    let versionAfterFirst = service.getCard(root.id).version;

    let second = service.resolveRootConvergenceBreaches(boardId);
    assert.equal(second.resolved.length, 0, 'an already-resolved root is skipped');
    assert.equal(service.getCard(root.id).version, versionAfterFirst, 'the card is not re-written');
  });

  it('retires a breached root to the reject terminal when no decision lane exists', () => {
    // Strip the await_human action from the decision column so decisionColumnId(board) resolves null and
    // parkCardForDecisionOps returns null — without orphaning the reject terminal's inbound edge (which a
    // full column delete would). The column stays a passive waypoint; the sweep falls back to reject-retire.
    let board = service.ensureBoard();
    let columns = board.columns.map(column =>
      column.id === 'needs-decision'
        ? { ...column, automation: { ...column.automation, action: 'classify' } }
        : column);
    sg.commit([{ op: 'set', path: `workflowBoards/${board.id}`, value: { ...board, columns } }], { actor: 'test' });

    capFanoutAt(2);
    let root = makeCard();
    makeCard({ parentCardId: root.id, rootCardId: root.id });

    let res = service.resolveRootConvergenceBreaches(boardId);
    assert.equal(res.resolved.length, 1);
    assert.equal(res.resolved[0].terminal, 'rejected');

    let retired = service.getCard(root.id);
    assert.equal(retired.columnId, 'rejected', 'the breached root retires to the reject terminal');
    assert.ok(retired.metadata?.rootConvergenceBreached, 'the marker rides along on the fallback path too');
    assert.equal(retired.metadata.resolution.status, 'rejected');
  });

  it('leaves an under-cap root untouched', () => {
    // Default ceilings — a tiny subtree is well under depth/fanout/runs.
    let root = makeCard();
    makeCard({ parentCardId: root.id, rootCardId: root.id });

    let res = service.resolveRootConvergenceBreaches(boardId);
    assert.equal(res.resolved.length, 0, 'no breach, no resolution');
    assert.equal(service.getCard(root.id).columnId, 'backlog', 'the root stays where it is');
  });

  // The cap is monotonic + permanent for a root, so the breaching wave's just-created children (backlog,
  // no run, parentCardId lineage but no dependsOn edge to the root) can never be admitted and are caught by
  // no other backstop. The sweep must cascade-terminalize them or they are stranded non-terminal forever —
  // a HARD INVARIANT breach. After the root is resolved, every non-terminal, non-running descendant retires.
  it('cascade-terminalizes the breached root\'s un-admittable descendants (no card stranded non-terminal)', () => {
    capFanoutAt(2);
    let root = makeCard();
    // Two descendants tip fanout past the cap; both rest in backlog with no run — never admitted, no edge.
    let kidA = makeCard({ parentCardId: root.id, rootCardId: root.id });
    let kidB = makeCard({ parentCardId: kidA.id, rootCardId: root.id });

    let res = service.resolveRootConvergenceBreaches(boardId);
    assert.equal(res.resolved.length, 1, 'the root is resolved once');

    // The root parks in the human-decision lane (its terminal resolution); the cascaded descendants are
    // discarded to the reject terminal so none of the three is stranded in a live (backlog) column.
    let classifier = classifyWorkflowGraph(service.ensureBoard());
    assert.equal(service.getCard(root.id).columnId, 'needs-decision', 'the root parks in the decision lane');
    for (let id of [kidA.id, kidB.id]) {
      let card = service.getCard(id);
      assert.ok(classifier.isTerminal(card.columnId), `descendant ${id} reaches a terminal column`);
      assert.equal(card.columnId, 'rejected', `descendant ${id} is retired to the reject terminal`);
      assert.equal(card.metadata.resolution.status, 'cancelled', `descendant ${id} is a discard, not a success`);
    }
  });

  // Regression: decompositionClosesParent (the default) auto-closes a root to a terminal column on its
  // first decompose, so a breaching subtree's root card is itself terminal. The sweep must NOT skip the
  // subtree on the root's column — the cap is a property of the subtree. A guard that `continue`d on a
  // terminal root left the breaching wave's just-created children un-admittable AND un-cascaded, i.e.
  // stranded non-terminal forever (a HARD INVARIANT breach the green suite masked).
  it('cascade-terminalizes descendants even when the root was already auto-closed to a terminal', () => {
    capFanoutAt(2);
    let root = makeCard();
    let kidA = makeCard({ parentCardId: root.id, rootCardId: root.id });
    let kidB = makeCard({ parentCardId: kidA.id, rootCardId: root.id });
    // Simulate decompositionClosesParent: the root is already retired to the `done` (close) terminal while
    // its subtree keeps breaching.
    let live = sg.get(`workflowCards/${root.id}`);
    sg.commit([{ op: 'set', path: `workflowCards/${root.id}`, value: { ...live, columnId: 'done' } }], { actor: 'test' });

    let res = service.resolveRootConvergenceBreaches(boardId);
    assert.equal(res.ok, true);

    let classifier = classifyWorkflowGraph(service.ensureBoard());
    // The already-closed root is left in its terminal column (no re-park), but its un-admittable
    // descendants are still cascaded to a terminal so none is stranded in a live column.
    assert.equal(service.getCard(root.id).columnId, 'done', 'the already-closed root keeps its terminal column');
    for (let id of [kidA.id, kidB.id]) {
      let card = service.getCard(id);
      assert.ok(classifier.isTerminal(card.columnId), `descendant ${id} reaches a terminal column (not stranded)`);
      assert.equal(card.metadata.resolution.status, 'cancelled', `descendant ${id} is a discard`);
    }
  });
});
