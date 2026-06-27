import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { StateGraph } from '../../src/node/state-graph.js';
import { createWorkflowBoardService } from '../../src/node/workflow-board-service.js';
import { humanPrincipal } from '../../src/node/server/principal.js';
import { DEFAULT_ROOT_MAX_FANOUT } from '../../src/iso/workflow-board.js';

// perRootConvergenceAvailable is the mandatory, always-on admission gate that converges the otherwise
// unbounded re-decompose loop. These tests pin its boardBudgetAvailable-shaped verdict: ok under the
// DEFAULT constants, a breach that names the breached dimension + root when a count reaches a limit, and
// that the bound holds with no authored automation.budget while still honouring an automation.rootConvergence
// override.
describe('workflow board per-root convergence admission gate', () => {
  let tmpDir;
  let sg;
  let now;
  let idSeq;
  let service;
  let boardId;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'workflow-root-conv-gate-'));
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

  it('admits a root well under the default ceilings', () => {
    let root = makeCard();
    makeCard({ parentCardId: root.id, rootCardId: root.id });

    let board = service.ensureBoard();
    let verdict = service.perRootConvergenceAvailable(board, service.getCard(root.id));
    assert.equal(verdict.ok, true, 'a small subtree is well under depth/fanout/runs');
    assert.equal(verdict.root, root.id, 'the verdict names the resolved root');
    assert.deepEqual(verdict.breaches, []);
    assert.deepEqual(verdict.counts, { depth: 1, fanout: 2, runCount: 0 });
  });

  it('refuses admission with a named breach when fanout reaches its default limit', () => {
    // DEFAULT_ROOT_MAX_FANOUT descendants (incl. the root) hit the >= ceiling exactly.
    let root = makeCard();
    for (let i = 1; i < DEFAULT_ROOT_MAX_FANOUT; i += 1) {
      makeCard({ parentCardId: root.id, rootCardId: root.id });
    }

    let board = service.ensureBoard();
    let verdict = service.perRootConvergenceAvailable(board, service.getCard(root.id));
    assert.equal(verdict.ok, false, 'a saturated fan-out breaches the cap');
    assert.equal(verdict.root, root.id);
    let fanout = verdict.breaches.find(b => b.dimension === 'fanout');
    assert.ok(fanout, 'the fanout dimension is reported as breached');
    assert.equal(fanout.spent, DEFAULT_ROOT_MAX_FANOUT);
    assert.equal(fanout.limit, DEFAULT_ROOT_MAX_FANOUT);
    assert.match(verdict.reason, /convergence cap reached/);
    assert.match(verdict.reason, new RegExp(`fanout ${DEFAULT_ROOT_MAX_FANOUT}/${DEFAULT_ROOT_MAX_FANOUT}`));
    assert.match(verdict.reason, new RegExp(root.id));
  });

  it('honours an automation.rootConvergence override while ignoring the optional board budget', () => {
    let root = makeCard();
    makeCard({ parentCardId: root.id, rootCardId: root.id });
    makeCard({ parentCardId: root.id, rootCardId: root.id });

    // Tighten fanout to 3 via the board override; leave automation.budget unauthored. fanout = 3 (root + 2).
    let board = { ...service.ensureBoard(), automation: { rootConvergence: { fanout: 3 } } };
    let verdict = service.perRootConvergenceAvailable(board, service.getCard(root.id));
    assert.equal(verdict.ok, false, 'fanout 3 reaches the overridden ceiling of 3');
    assert.equal(verdict.limits.fanout, 3, 'the override limit is surfaced');
    let fanout = verdict.breaches.find(b => b.dimension === 'fanout');
    assert.equal(fanout.spent, 3);
    assert.equal(fanout.limit, 3);

    // One fewer descendant stays under the overridden ceiling.
    let smallRoot = makeCard();
    makeCard({ parentCardId: smallRoot.id, rootCardId: smallRoot.id });
    let okVerdict = service.perRootConvergenceAvailable(board, service.getCard(smallRoot.id));
    assert.equal(okVerdict.ok, true, 'fanout 2 stays under the overridden ceiling of 3');
  });
});
