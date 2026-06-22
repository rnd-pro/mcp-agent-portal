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

  it('raises a needs_decision escalation on the dependent when a block_and_escalate upstream terminal-fails', async () => {
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
    let reconciled = await service.reconcileWorkflowRuntimeTasks({ boardId: DEFAULT_WORKFLOW_BOARD_ID }, runtimeTasks);
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

  // ── S4: join-policy fold in allDependenciesSatisfied ─────────────────────────────────────────────
  // Plant a join card directly with a `dependsOn` over members and `metadata.joinPolicy`; lifecycle is
  // `blocked` so the release tick re-runs allDependenciesSatisfied and frees the join exactly when the
  // policy is met. A satisfied join is RETIRED by the release tick (it wakes its owner via the
  // return-loop rather than being enqueued as work) — `metadata.ownerNotifiedAt` is the release signal.
  function plantJoinCard(id, members, joinPolicy) {
    let dependsOn = members.map(cardId => ({ cardId, releaseWhen: 'card_done', onUpstreamFailure: 'release' }));
    sg.commit([{
      op: 'set',
      path: `workflowCards/${id}`,
      value: {
        schema: 'workflow-card/v2', id, boardId: DEFAULT_WORKFLOW_BOARD_ID, columnId: 'backlog',
        kind: 'join', title: `Join ${id}`, lifecycle: 'blocked', dependsOn,
        metadata: { joinPolicy, dependencyBlock: { blockedAt: 100, releasedEdges: [] } },
        acceptanceCriteria: [], blockers: [], recoveryFlags: [], entityRefs: { taskIds: [], files: [] },
        version: 1, createdAt: 100, updatedAt: 100, createdBy: 'test', updatedBy: 'test',
      },
    }], 'test');
  }

  function joinReleased(joinId) {
    service.releaseDependencies(DEFAULT_WORKFLOW_BOARD_ID);
    // A satisfied join is retired (owner woken), stamped with metadata.ownerNotifiedAt; an unsatisfied
    // join stays blocked. The release signal is the notify stamp, not an enqueue.
    return Boolean(service.getCard(joinId).metadata?.ownerNotifiedAt);
  }

  it('S4 join `all`: unsatisfied until every member is done', () => {
    makeCard('all-m1');
    makeCard('all-m2');
    plantJoinCard('join-all', ['all-m1', 'all-m2'], { type: 'all' });

    assert.equal(joinReleased('join-all'), false, 'no member done → blocked');
    moveToTerminal('all-m1');
    assert.equal(joinReleased('join-all'), false, 'one of two done → still blocked');
    moveToTerminal('all-m2');
    assert.equal(joinReleased('join-all'), true, 'both done → released');
  });

  it('S4 join `any`: satisfied on the first member done', () => {
    makeCard('any-m1');
    makeCard('any-m2');
    plantJoinCard('join-any', ['any-m1', 'any-m2'], { type: 'any' });

    assert.equal(joinReleased('join-any'), false, 'no member done → blocked');
    moveToTerminal('any-m1');
    assert.equal(joinReleased('join-any'), true, 'first member done → released');
  });

  it('S4 join `quorum {k:2}` over 3 members: satisfied at 2', () => {
    makeCard('q-m1');
    makeCard('q-m2');
    makeCard('q-m3');
    plantJoinCard('join-quorum', ['q-m1', 'q-m2', 'q-m3'], { type: 'quorum', k: 2 });

    assert.equal(joinReleased('join-quorum'), false, '0 done → blocked');
    moveToTerminal('q-m1');
    assert.equal(joinReleased('join-quorum'), false, '1 of 3 done < quorum → blocked');
    moveToTerminal('q-m2');
    assert.equal(joinReleased('join-quorum'), true, '2 of 3 done == quorum → released');
  });

  it('S4 join `all_settled`: satisfied when every member is done-or-released(failed)', () => {
    makeCard('set-done');
    makeCard('set-fail');
    plantJoinCard('join-settled', ['set-done', 'set-fail'], { type: 'all_settled' });

    assert.equal(joinReleased('join-settled'), false, 'neither settled → blocked');
    moveToTerminal('set-done');
    assert.equal(joinReleased('join-settled'), false, 'one done, one still pending → blocked');

    // The failed member terminal-fails: its `release` edge resolves to a released (settled) edge, so
    // all_settled now sees every edge settled (one done, one settled-by-failure) → released.
    writeRun('set-fail', 'failed');
    assert.equal(joinReleased('join-settled'), true, 'all members done-or-failed → released');
  });

  it('S4 regression: a NORMAL card with plain dependsOn (no joinPolicy) still ANDs every edge', () => {
    // Byte-identical to the existing fan-in case: a 2-edge dependent stays blocked until BOTH are done.
    makeCard('and-a');
    makeCard('and-b');
    makeCard('and-down');
    service.linkDependency({ cardId: 'and-down', dependsOn: ['and-a', 'and-b'] });
    assert.equal(service.getCard('and-down').lifecycle, 'blocked');
    assert.equal(service.getCard('and-down').metadata?.joinPolicy, undefined, 'no joinPolicy on a normal card');

    moveToTerminal('and-a');
    service.releaseDependencies(DEFAULT_WORKFLOW_BOARD_ID);
    assert.equal(service.getCard('and-down').lifecycle, 'blocked', 'one of two done → AND still blocks');
    moveToTerminal('and-b');
    service.releaseDependencies(DEFAULT_WORKFLOW_BOARD_ID);
    assert.equal(service.getCard('and-down').lifecycle, 'queued', 'both done → AND releases');
  });

  // ── S5: materializeJoinCard + delegate-time subscription persistence ─────────────────────────────
  it('S5 materializeJoinCard: synthetic card depends on every member with the failure-mapped policy', () => {
    makeCard('jm-a');
    makeCard('jm-b');
    let board = sg.get(`workflowBoards/${DEFAULT_WORKFLOW_BOARD_ID}`);
    let join = service.materializeJoinCard(board, {
      mode: 'join', members: ['jm-a', 'jm-b'], onFailure: 'fail_fast', joinPolicy: { type: 'any' },
    }, 'owner-card');

    assert.ok(join.id, 'a join card was created');
    let deps = join.dependsOn;
    assert.deepEqual(deps.map(d => d.cardId).sort(), ['jm-a', 'jm-b'], 'depends on every member');
    assert.ok(deps.every(d => d.releaseWhen === 'card_done'), 'each member edge releaseWhen=card_done');
    assert.ok(
      deps.every(d => d.onUpstreamFailure === 'block_and_escalate'),
      'fail_fast → block_and_escalate on each member edge',
    );
    assert.equal(join.metadata.joinPolicy.type, 'any', 'the joinPolicy is stored on the synthetic card');
  });

  it('S5 materializeJoinCard: all_settled onFailure maps each member edge to release', () => {
    makeCard('js-a');
    makeCard('js-b');
    let board = sg.get(`workflowBoards/${DEFAULT_WORKFLOW_BOARD_ID}`);
    let join = service.materializeJoinCard(board, {
      mode: 'join', members: ['js-a', 'js-b'], onFailure: 'all_settled', joinPolicy: { type: 'all_settled' },
    }, 'owner-card');
    assert.ok(
      join.dependsOn.every(d => d.onUpstreamFailure === 'release'),
      'all_settled → release on each member edge (a failed member counts as settled)',
    );
    assert.equal(join.metadata.joinPolicy.type, 'all_settled');
  });

  it('S5 materializeJoinCard: a cyclic join is rejected by the cycle guard', () => {
    // The synthetic join id is minted via makeId('join') → the first call yields `join-1` (idSeq is
    // controlled by the harness and makeCard passes explicit ids, so no `join` id is minted before
    // this). Plant a member that ALREADY depends on `join-1`; materializing the join over that member
    // closes member → join-1 → member, which the cycle guard must reject without committing.
    sg.commit([{
      op: 'set', path: 'workflowCards/cyc-member',
      value: {
        schema: 'workflow-card/v2', id: 'cyc-member', boardId: DEFAULT_WORKFLOW_BOARD_ID, columnId: 'backlog',
        title: 'Cyc member', lifecycle: 'idle',
        dependsOn: [{ cardId: 'join-1', releaseWhen: 'card_done', onUpstreamFailure: 'release' }],
        metadata: {}, acceptanceCriteria: [], blockers: [], recoveryFlags: [], entityRefs: { taskIds: [], files: [] },
        version: 1, createdAt: 100, updatedAt: 100, createdBy: 'test', updatedBy: 'test',
      },
    }], 'test');
    let board = sg.get(`workflowBoards/${DEFAULT_WORKFLOW_BOARD_ID}`);
    let res = service.materializeJoinCard(board, {
      mode: 'join', members: ['cyc-member'], onFailure: 'fail_fast',
    }, 'cyc-member');
    assert.equal(res.ok, false, 'the cyclic join is rejected');
    assert.equal(res.reason, 'dependency_cycle');
    assert.equal(sg.get('workflowCards/join-1'), undefined, 'no join card was committed on rejection');
  });

  it('S5 materializeJoinCard: rejects a memberless subscription (not a join)', () => {
    let board = sg.get(`workflowBoards/${DEFAULT_WORKFLOW_BOARD_ID}`);
    let res = service.materializeJoinCard(board, { mode: 'join', members: [] }, 'owner');
    assert.equal(res.ok, false);
    assert.equal(res.reason, 'not_a_join', 'a memberless join normalizes to null → not_a_join');
  });

  it('S5 delegate persists a normalized subscription AND materializes the join card', async () => {
    // Orchestrate with delegate:false (no proxy in this harness) so the card-write path runs without a
    // real delegation. A join `subscription` arg is persisted as the NORMALIZED record and materializes
    // a synthetic join card over the members (the wiring that connects the subscription to the runtime).
    makeCard('sub-card', { columnId: 'ready' });
    makeCard('m1');
    makeCard('m2');
    let result = await service.orchestrateWorkItem({
      cardId: 'sub-card',
      delegate: false,
      subscription: { mode: 'join', members: ['m1', 'm2', 'm2'], onFailure: 'all_settled', joinPolicy: { type: 'quorum', k: 2 } },
    });
    assert.equal(result.ok, true);
    let sub = service.getCard('sub-card').metadata?.subscription;
    assert.ok(sub, 'a subscription record is persisted');
    assert.equal(sub.mode, 'join');
    assert.deepEqual(sub.members, ['m1', 'm2'], 'members are deduped by the normalizer');
    assert.equal(sub.joinPolicy.k, 2);
    assert.ok(result.joinCardId, 'a join card was materialized');
    let join = service.getCard(result.joinCardId);
    assert.equal(join.kind, 'join');
    assert.equal(join.parentCardId, 'sub-card', 'join card is owned by the orchestrating card');
    assert.deepEqual(join.dependsOn.map(d => d.cardId).sort(), ['m1', 'm2']);

    // Idempotent: re-orchestrating the same owner reuses its join card, no duplicate. force:true
    // bypasses the active-run early-return so the materialization guard is exercised on the second call.
    let again = await service.orchestrateWorkItem({
      cardId: 'sub-card',
      delegate: false,
      force: true,
      subscription: { mode: 'join', members: ['m1', 'm2'], joinPolicy: { type: 'all' } },
    });
    assert.equal(again.joinCardId, result.joinCardId, 're-orchestrate reuses the join card (no duplicate)');
  });

  it('S5 join release wakes the owner via a completed return and retires the join card', async () => {
    makeCard('jo-owner', { columnId: 'ready' });
    makeCard('jo-m1');
    makeCard('jo-m2');
    let result = await service.orchestrateWorkItem({
      cardId: 'jo-owner',
      delegate: false,
      subscription: { mode: 'join', members: ['jo-m1', 'jo-m2'], releaseWhen: 'run_success', joinPolicy: { type: 'all' } },
    });
    let joinId = result.joinCardId;
    assert.ok(joinId, 'join materialized');
    assert.equal(service.getCard(joinId).lifecycle, 'blocked', 'join blocked until members succeed');

    // Members complete (run_success) → release tick wakes the owner.
    writeRun('jo-m1', 'completed');
    writeRun('jo-m2', 'completed');
    service.releaseDependencies(DEFAULT_WORKFLOW_BOARD_ID);

    let owner = service.getCard('jo-owner');
    let returns = owner.metadata?.returns ?? [];
    let wake = returns.find(r => r.kind === 'completed' && r.correlationId === 'jo-owner');
    assert.ok(wake, 'a completed return was minted onto the owner inbox');
    assert.equal(wake.payload?.join, joinId, 'the return names the join that satisfied');
    assert.deepEqual((wake.payload?.members ?? []).sort(), ['jo-m1', 'jo-m2']);

    let join = service.getCard(joinId);
    assert.equal(join.columnId, 'done', 'the join card is retired to the terminal column');
    assert.ok(join.metadata?.ownerNotifiedAt, 'the notify guard is stamped');

    // Idempotent: a second release tick does not mint a duplicate owner return.
    service.releaseDependencies(DEFAULT_WORKFLOW_BOARD_ID);
    let after = (service.getCard('jo-owner').metadata?.returns ?? []).filter(r => r.payload?.join === joinId);
    assert.equal(after.length, 1, 'owner woken exactly once');
  });

  it('S5 join already satisfied at materialization still wakes the owner', async () => {
    makeCard('js2-owner', { columnId: 'ready' });
    makeCard('js2-m1');
    // Member already has a successful run BEFORE the join is materialized → join is created `idle`,
    // not `blocked`; the release tick must still wake the owner (pending-join guard).
    writeRun('js2-m1', 'completed');
    let result = await service.orchestrateWorkItem({
      cardId: 'js2-owner',
      delegate: false,
      subscription: { mode: 'join', members: ['js2-m1'], releaseWhen: 'run_success', joinPolicy: { type: 'all' } },
    });
    assert.ok(result.joinCardId, 'join materialized');
    service.releaseDependencies(DEFAULT_WORKFLOW_BOARD_ID);
    let wake = (service.getCard('js2-owner').metadata?.returns ?? []).find(r => r.payload?.join === result.joinCardId);
    assert.ok(wake, 'owner woken even though the join was idle at materialization');
  });

  it('S5 delegate without a subscription leaves metadata.subscription absent (unchanged behavior)', async () => {
    makeCard('nosub-card', { columnId: 'ready' });
    let result = await service.orchestrateWorkItem({ cardId: 'nosub-card', delegate: false });
    assert.equal(result.ok, true);
    assert.equal(service.getCard('nosub-card').metadata?.subscription, undefined, 'no subscription persisted');
    assert.equal(result.joinCardId, null, 'no join card without a join subscription');
  });
});
