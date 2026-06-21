import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { DEFAULT_WORKFLOW_BOARD_ID } from '../../src/iso/workflow-board.js';
import { StateGraph } from '../../src/node/state-graph.js';
import { createWorkflowBoardService } from '../../src/node/workflow-board-service.js';
import { humanPrincipal } from '../../src/node/server/principal.js';

// Board-native task dependencies (WS-B2; AD-5, inv 21-24). These drive the service in-process as the
// trusted local human (board-author caps), the same harness the S8 scheduler tests use.
describe('workflow board task dependencies', () => {
  let tmpDir;
  let sg;
  let now;
  let idSeq;
  let service;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'workflow-dependencies-'));
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
  });

  afterEach(async () => {
    await sg.flushChatWrites();
    sg.flush();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function makeCard(id, overrides = {}) {
    let created = service.createOrUpdateCard({
      id,
      title: overrides.title ?? `Card ${id}`,
      body: 'Durable body.',
      columnId: overrides.columnId ?? 'backlog',
      projectId: 'agent-portal',
      domain: 'backend',
      owner: 'orchestrator',
      priority: overrides.priority ?? 'normal',
      acceptanceCriteria: ['Done'],
      actor: 'test',
      ...overrides,
    });
    assert.equal(created.card.id, id, `card ${id} created`);
    return created.card;
  }

  // Force a card into a terminal (close) column so card_done edges read satisfied.
  function moveToTerminal(cardId) {
    let card = sg.get(`workflowCards/${cardId}`);
    sg.commit([{ op: 'set', path: `workflowCards/${cardId}`, value: { ...card, columnId: 'done' } }], 'test');
  }

  function writeRun(cardId, status, runId = `run-${cardId}`) {
    sg.commit([{
      op: 'set',
      path: `workflowRuns/${runId}`,
      value: {
        schema: 'workflow-run/v1',
        id: runId,
        boardId: DEFAULT_WORKFLOW_BOARD_ID,
        cardId,
        status,
        taskIds: [],
        startedAt: 900,
        updatedAt: 901,
      },
    }], 'test');
  }

  function writeAuditCheck(cardId, value) {
    sg.commit([{
      op: 'set',
      path: `workflowChecks/${cardId}`,
      value: { schema: 'workflow-checks/v1', cardId, checks: { audit: value }, updatedAt: 901, updatedBy: 'test' },
    }], 'test');
  }

  it('blocks a dependent on an unsatisfied dependency and clears on unlink', () => {
    makeCard('up');
    makeCard('down');

    let linked = service.linkDependency({ cardId: 'down', dependsOn: ['up'] });
    assert.equal(linked.ok, true);
    assert.equal(linked.lifecycle, 'blocked', 'unsatisfied dependency blocks the dependent');
    assert.equal(service.getCard('down').lifecycle, 'blocked');
    assert.equal(service.getCard('down').dependsOn[0].cardId, 'up');
    assert.equal(service.getCard('down').dependsOn[0].releaseWhen, 'card_done', 'default releaseWhen');

    let unlinked = service.unlinkDependency({ cardId: 'down', dependsOn: ['up'] });
    assert.equal(unlinked.ok, true);
    assert.equal(unlinked.lifecycle, 'idle', 'removing the only edge clears the block');
    assert.deepEqual(service.getCard('down').dependsOn, []);
  });

  it('leaves the dependent idle when the edge is already satisfied at link time', () => {
    makeCard('up', { columnId: 'done' });
    makeCard('down');

    let linked = service.linkDependency({ cardId: 'down', dependsOn: ['up'] });
    assert.equal(linked.ok, true);
    assert.equal(linked.lifecycle, 'idle', 'an already-satisfied card_done edge does not block');
  });

  it('releases a blocked card on the next release tick when its card_done upstream reaches a terminal column', () => {
    makeCard('up');
    makeCard('down');
    service.linkDependency({ cardId: 'down', dependsOn: ['up'] });
    assert.equal(service.getCard('down').lifecycle, 'blocked');

    moveToTerminal('up');
    let tick = service.releaseDependencies(DEFAULT_WORKFLOW_BOARD_ID);
    assert.equal(tick.released.length, 1);
    assert.equal(tick.released[0].cardId, 'down');
    assert.equal(service.getCard('down').lifecycle, 'queued', 'blocked → queued via the enqueue path');
  });

  it('releases on run_success and audit_passed for the matching signal', () => {
    makeCard('up-run');
    makeCard('down-run');
    service.linkDependency({ cardId: 'down-run', dependsOn: [{ cardId: 'up-run', releaseWhen: 'run_success' }] });
    assert.equal(service.getCard('down-run').lifecycle, 'blocked');
    writeRun('up-run', 'success');
    service.releaseDependencies(DEFAULT_WORKFLOW_BOARD_ID);
    assert.equal(service.getCard('down-run').lifecycle, 'queued', 'run_success releases on a successful run');

    makeCard('up-audit');
    makeCard('down-audit');
    service.linkDependency({ cardId: 'down-audit', dependsOn: [{ cardId: 'up-audit', releaseWhen: 'audit_passed' }] });
    assert.equal(service.getCard('down-audit').lifecycle, 'blocked');
    writeAuditCheck('up-audit', 'passed');
    service.releaseDependencies(DEFAULT_WORKFLOW_BOARD_ID);
    assert.equal(service.getCard('down-audit').lifecycle, 'queued', 'audit_passed releases on a passed audit check');
  });

  it('raises a needs_decision escalation on the dependent when a block_and_escalate upstream terminal-fails', () => {
    makeCard('up-fail');
    makeCard('down-block');
    service.linkDependency({ cardId: 'down-block', dependsOn: ['up-fail'] });

    // Upstream has a live (running) run whose runtime task reports failure — the runtime reconcile
    // transitions the run to a terminal-failure and propagates to the dependent.
    sg.commit([{
      op: 'set',
      path: 'workflowRuns/run-up-fail',
      value: {
        schema: 'workflow-run/v1',
        id: 'run-up-fail',
        boardId: DEFAULT_WORKFLOW_BOARD_ID,
        cardId: 'up-fail',
        status: 'running',
        taskIds: ['task-up-fail'],
        startedAt: 900,
        updatedAt: 901,
      },
    }], 'test');
    let card = sg.get('workflowCards/up-fail');
    sg.commit([{ op: 'set', path: 'workflowCards/up-fail', value: { ...card, columnId: 'in-progress', lifecycle: 'running' } }], 'test');

    // Drive the runtime reconcile with a stub runtime-tasks map reporting the task as failed.
    let runtimeTasks = new Map([['task-up-fail', { id: 'task-up-fail', status: 'failed' }]]);
    let reconciled = service.reconcileWorkflowRuntimeTasks({ boardId: DEFAULT_WORKFLOW_BOARD_ID }, runtimeTasks);
    assert.ok(reconciled.propagated.some(item => item.cardId === 'down-block' && item.resolution === 'block_and_escalate'));

    let down = service.getCard('down-block');
    let escalation = down.metadata?.escalation;
    assert.ok(escalation, 'dependent carries an escalation episode');
    assert.equal(escalation.kind, 'needs_decision', 'a typed needs_decision, not a silent block');
    let events = service.listEvents({ cardId: 'down-block' });
    assert.ok(events.some(event => event.eventType === 'escalation'), 'an escalation event is recorded');
  });

  it('lets a release-on-failure dependent proceed and cancels a cancel_self dependent', () => {
    makeCard('up-x');
    makeCard('down-release');
    makeCard('down-cancel');
    service.linkDependency({ cardId: 'down-release', dependsOn: [{ cardId: 'up-x', onUpstreamFailure: 'release' }] });
    service.linkDependency({ cardId: 'down-cancel', dependsOn: [{ cardId: 'up-x', onUpstreamFailure: 'cancel_self' }] });

    // Delete the upstream → resolves both edges per their onUpstreamFailure.
    let deleted = service.deleteWorkItem({ cardId: 'up-x' });
    assert.equal(deleted.deleted, true);
    assert.ok(deleted.propagated.some(item => item.cardId === 'down-release' && item.resolution === 'release'));
    assert.ok(deleted.propagated.some(item => item.cardId === 'down-cancel' && item.resolution === 'cancel_self'));

    // release: the edge is now satisfied → the release tick enqueues it.
    service.releaseDependencies(DEFAULT_WORKFLOW_BOARD_ID);
    assert.equal(service.getCard('down-release').lifecycle, 'queued', 'release lets the dependent proceed');

    // cancel_self: the dependent is driven to the terminal column and unblocked.
    assert.equal(service.getCard('down-cancel').columnId, 'done', 'cancel_self moves the dependent to terminal');
    assert.notEqual(service.getCard('down-cancel').lifecycle, 'blocked');
  });

  it('fan-in: a dependent on two upstreams fails fast when one terminal-fails', () => {
    makeCard('fan-a');
    makeCard('fan-b');
    makeCard('fan-down');
    service.linkDependency({ cardId: 'fan-down', dependsOn: ['fan-a', 'fan-b'] });
    assert.equal(service.getCard('fan-down').lifecycle, 'blocked');

    // Delete only fan-a — the dependent fails fast (escalates) without waiting for fan-b.
    let deleted = service.deleteWorkItem({ cardId: 'fan-a' });
    assert.ok(deleted.propagated.some(item => item.cardId === 'fan-down' && item.resolution === 'block_and_escalate'));
    let down = service.getCard('fan-down');
    assert.equal(down.metadata?.escalation?.kind, 'needs_decision');
    // fan-b is still an open edge — the dependent is escalated, not silently released.
    assert.ok(down.dependsOn.some(dep => dep.cardId === 'fan-b'));
  });

  it('rejects a dependency that would create a cycle (transitive)', () => {
    makeCard('a');
    makeCard('b');
    makeCard('c');

    assert.equal(service.linkDependency({ cardId: 'a', dependsOn: ['b'] }).ok, true);
    // Direct back-edge b → a closes a 2-cycle.
    let direct = service.linkDependency({ cardId: 'b', dependsOn: ['a'] });
    assert.equal(direct.ok, false);
    assert.equal(direct.reason, 'dependency_cycle');

    // Transitive: a → b, b → c, then c → a closes a 3-cycle.
    assert.equal(service.linkDependency({ cardId: 'b', dependsOn: ['c'] }).ok, true);
    let transitive = service.linkDependency({ cardId: 'c', dependsOn: ['a'] });
    assert.equal(transitive.ok, false);
    assert.equal(transitive.reason, 'dependency_cycle');
  });

  it('inherits the max downstream-waiter priority onto the upstream admission entry', () => {
    makeCard('chain-up', { columnId: 'done', priority: 'low' });
    makeCard('chain-down', { priority: 'critical' });
    makeCard('unrelated', { columnId: 'done', priority: 'low' });

    // chain-down waits on chain-up; chain-up is already done so it does not itself enqueue, but a
    // low-priority upstream feeding a critical waiter must inherit the elevated admission priority.
    service.linkDependency({ cardId: 'chain-down', dependsOn: ['chain-up'] });

    // Re-make chain-up as a not-yet-done blocked upstream to observe the inherited enqueue priority.
    let up = service.getCard('chain-up');
    let enqueued = service.enqueueWorkItem(sg.get(`workflowBoards/${DEFAULT_WORKFLOW_BOARD_ID}`), up);
    assert.equal(enqueued.ok, true);
    let entry = enqueued.entry;
    assert.equal(entry.basePriority, 0, 'own priority is low');
    assert.equal(entry.priority, 3, 'inherited admission priority is the critical waiter ordinal');

    let unrelated = service.getCard('unrelated');
    let unrelatedEntry = service.enqueueWorkItem(sg.get(`workflowBoards/${DEFAULT_WORKFLOW_BOARD_ID}`), unrelated).entry;
    assert.ok(entry.priority > unrelatedEntry.priority, 'the inheriting upstream sorts ahead of the unrelated low-priority card');
  });

  // F-DEP-1 regression: dependency enforcement must hold on the PRIMARY write path, not only in
  // linkDependency. A card written via createOrUpdateCard with a populated dependsOn whose upstream is
  // not yet done must become `blocked` (not idle), and the scheduler must refuse to admit it.
  it('blocks a card created via createOrUpdateCard with an unsatisfied dependsOn and never admits it', async () => {
    makeCard('up-direct');
    // Write the dependent directly with dependsOn populated — the bug left this at `idle`.
    let down = makeCard('down-direct', { dependsOn: ['up-direct'] });
    assert.equal(service.getCard(down.id).dependsOn[0].cardId, 'up-direct');
    assert.equal(service.getCard(down.id).lifecycle, 'blocked', 'an unsatisfied dependsOn blocks on the create path');

    // Defense in depth: even if a blocked card is forced into the queue, the scheduler must not admit
    // it while the dependency is unmet. Plant a queue entry + queued lifecycle and drain.
    let board = sg.get(`workflowBoards/${DEFAULT_WORKFLOW_BOARD_ID}`);
    let blocked = service.getCard(down.id);
    let enqueuedAt = now;
    sg.commit([
      { op: 'set', path: `workflowCards/${down.id}`, value: { ...blocked, lifecycle: 'queued' } },
      { op: 'set', path: `workflowQueueEntries/adm-down-direct`, value: {
        schema: 'workflow-queue-entry/v1', admissionId: 'adm-down-direct', cardId: down.id, boardId: board.id,
        columnId: blocked.columnId, groupKey: 'impl', priority: 1, basePriority: 1, priorityLabel: 'normal',
        enqueuedAt, queueEpoch: sg.get(`workflowQueueEpoch/${board.id}`) ?? 0, notBefore: null,
      } },
    ], 'test:force-queue', { durable: true });

    let drain = await service.drainWorkflowQueue(board.id, {});
    assert.equal(drain.admitted.length, 0, 'the scheduler refuses to admit a card with an unmet dependency');
    assert.notEqual(service.getCard(down.id).lifecycle, 'running', 'the unmet-dependency card never runs');
    assert.equal(service.getCard(down.id).lifecycle, 'blocked', 'the scheduler re-blocks the card');

    // Once the upstream is satisfied, the release tick frees it and a drain admits it.
    moveToTerminal('up-direct');
    service.releaseDependencies(board.id);
    assert.equal(service.getCard(down.id).lifecycle, 'queued', 'satisfied dependency releases the card to the queue');
  });

  // F-DEP-2 regression: onUpstreamFailure must be level-triggered for an upstream that was ALREADY in
  // a terminal-failure state at link time. The edge-triggered reconcile only fires on a status
  // transition, so without the level check the dependent waits the full 24h max-blocked-age window.
  it('applies onUpstreamFailure on the next release tick for an already-failed upstream (no 24h wait)', () => {
    // release: an already-failed upstream lets the dependent proceed on the next tick.
    makeCard('failed-up-rel');
    writeRun('failed-up-rel', 'failed');
    makeCard('down-rel', { dependsOn: [{ cardId: 'failed-up-rel', onUpstreamFailure: 'release' }] });
    assert.equal(service.getCard('down-rel').lifecycle, 'blocked', 'blocked at link time');

    // cancel_self: an already-failed upstream cancels the dependent on the next tick.
    makeCard('failed-up-can');
    writeRun('failed-up-can', 'failed');
    makeCard('down-can', { dependsOn: [{ cardId: 'failed-up-can', onUpstreamFailure: 'cancel_self' }] });

    // block_and_escalate (default): an already-failed upstream escalates the dependent on the tick.
    makeCard('failed-up-esc');
    writeRun('failed-up-esc', 'cancelled');
    makeCard('down-esc', { dependsOn: ['failed-up-esc'] });

    // A SINGLE release tick (not a 24h wait) resolves all three per policy.
    service.releaseDependencies(DEFAULT_WORKFLOW_BOARD_ID);

    assert.equal(service.getCard('down-rel').lifecycle, 'queued', 'release lets the dependent proceed');
    assert.equal(service.getCard('down-can').columnId, 'done', 'cancel_self moves the dependent to terminal');
    assert.notEqual(service.getCard('down-can').lifecycle, 'blocked', 'cancel_self unblocks the dependent');
    let esc = service.getCard('down-esc');
    assert.equal(esc.metadata?.escalation?.kind, 'needs_decision', 'block_and_escalate raises a typed needs_decision');
  });

  it('escalates a card blocked past the max-blocked-age threshold', () => {
    makeCard('stale-up');
    makeCard('stale-down');
    service.linkDependency({ cardId: 'stale-down', dependsOn: ['stale-up'] });
    assert.equal(service.getCard('stale-down').lifecycle, 'blocked');

    // Push the wall clock far past MAX_BLOCKED_AGE_MS (24h) so the next tick escalates.
    now += 25 * 60 * 60 * 1000;
    let tick = service.releaseDependencies(DEFAULT_WORKFLOW_BOARD_ID);
    assert.ok(tick.escalated.some(item => item.cardId === 'stale-down'));
    let down = service.getCard('stale-down');
    assert.equal(down.metadata?.escalation?.kind, 'needs_decision', 'max-blocked-age escalates, never a silent permanent block');
    assert.equal(down.lifecycle, 'blocked', 'the card stays blocked but is now human-visible');
  });
});
