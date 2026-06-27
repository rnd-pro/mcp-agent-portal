import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { DEFAULT_WORKFLOW_BOARD_ID } from '../../src/iso/workflow-board.js';
import { StateGraph } from '../../src/node/state-graph.js';
import { createWorkflowBoardService } from '../../src/node/workflow-board-service.js';
import { humanPrincipal } from '../../src/node/server/principal.js';

// Live-child → parent routed-return transport (S5/step 5): a still-live child's typed WORKFLOW_RETURN is
// routed to its PARENT (owner) inbox as a `routed` copy in the SAME reconcile commit, so the orchestrator
// parent can act on intermediate results BEFORE all children settle (the only prior parent delivery was
// wakeJoinOwner at full-join completion). routeReturnToParent mints with correlationId=parentId and a
// deterministic eventId (on sourceEvent.eventId + parentId), so re-parsing the same marker is a no-op.
// Only ACTIONABLE returns route; soft progress/partial is skipped so the parent is not churned per tick.
describe('workflow runtime reconcile — live-child → parent routed-return transport (S5)', () => {
  let tmpDir;
  let sg;
  let now;
  let idSeq;
  let service;

  // The transport reconcile never spawns, but the service requires a proxyManager.
  function makeProxy() {
    return {
      requestFromChild: async (_server, _method, _payload) => ({ content: [{ type: 'text', text: 'ok' }] }),
      chatWsServer: { taskChatMap: new Map() },
    };
  }

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'workflow-return-transport-'));
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
      proxyManager: makeProxy(),
      defaultPrincipal: humanPrincipal({ transport: { channel: 'loopback' }, label: 'local-human' }),
    });
  });

  afterEach(async () => {
    await sg.flushChatWrites();
    sg.flush();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // A parent (orchestrator) card resting with no live run — the realistic owner of a routed return.
  function plantParent(id = 'parent') {
    let created = service.createOrUpdateCard({
      id,
      title: `Parent ${id}`,
      body: 'Orchestrator parent.',
      columnId: 'ready',
      projectId: 'agent-portal',
      domain: 'backend',
      owner: 'orchestrator',
      acceptanceCriteria: ['Re-decomposes or realizes'],
      actor: 'test',
    });
    return created.card;
  }

  // A child card in `in-progress` (lifecycle running) with a live run linked to a runtime task, carrying
  // a `parentCardId` so its actionable returns route to the parent inbox.
  function plantRunningChild(id, parentId) {
    let created = service.createOrUpdateCard({
      id,
      title: `Child ${id}`,
      body: 'Runtime-linked child work item.',
      columnId: 'in-progress',
      projectId: 'agent-portal',
      domain: 'backend',
      owner: 'orchestrator',
      assignedAgent: 'backend-engineer',
      resourceGroup: 'impl',
      acceptanceCriteria: ['Done when audited'],
      actor: 'test',
    });
    let runId = `run-${id}`;
    let taskId = `task-${id}`;
    sg.commit([
      { op: 'set', path: `workflowCards/${id}`, value: {
        ...created.card, columnId: 'in-progress', lifecycle: 'running', parentCardId: parentId,
      } },
      { op: 'set', path: `workflowRuns/${runId}`, value: {
        schema: 'workflow-run/v1', id: runId, boardId: DEFAULT_WORKFLOW_BOARD_ID, cardId: id,
        status: 'running', taskIds: [taskId], startedAt: 900, updatedAt: 901,
      } },
    ], 'test:plant-running-child');
    return { cardId: id, runId, taskId };
  }

  function runningTaskWithMarker(taskId, marker) {
    return new Map([[taskId, {
      id: taskId, status: 'running', updatedAt: 1400,
      events: [{ text: `working...\n${marker}` }],
    }]]);
  }

  function ownerReturns(parentId) {
    return service.getCard(parentId).metadata?.returns ?? [];
  }

  it('routes a live child\'s actionable intermediate return to the parent inbox (routed, correlationId=parentId)', async () => {
    plantParent('p1');
    plantRunningChild('c1', 'p1');
    let runtimeTasks = runningTaskWithMarker('task-c1', 'WORKFLOW_RETURN: discovered {"detail":"found a sub-task"}');

    await service.reconcileWorkflowRuntimeTasks({ boardId: DEFAULT_WORKFLOW_BOARD_ID }, runtimeTasks);

    // The child still carries its own (non-routed) copy on its inbox.
    let child = service.getCard('c1');
    assert.equal(child.metadata.returns.length, 1, 'the child inbox holds its own copy');
    assert.equal(child.metadata.returns[0].correlationId, 'c1');
    assert.equal(child.metadata.returns[0].routed, false, 'the child copy is not routed');

    // The parent received a routed copy keyed on its own id.
    let parentReturns = ownerReturns('p1');
    assert.equal(parentReturns.length, 1, 'the parent inbox received the routed copy');
    let routed = parentReturns[0];
    assert.equal(routed.kind, 'discovered', 'the routed copy carries the source kind');
    assert.equal(routed.detail, 'found a sub-task', 'the routed copy carries the source detail');
    assert.equal(routed.routed, true, 'the parent copy is marked routed');
    assert.equal(routed.correlationId, 'p1', 'the routed copy is keyed on the parent (its inbox key)');
    assert.equal(child.columnId, 'in-progress', 'the child is not moved by routing');
  });

  it('routes a live child\'s hard-interrupt return to the parent', async () => {
    plantParent('p2');
    plantRunningChild('c2', 'p2');
    let runtimeTasks = runningTaskWithMarker('task-c2', 'WORKFLOW_RETURN: needs_decision {"detail":"which API?"}');

    await service.reconcileWorkflowRuntimeTasks({ boardId: DEFAULT_WORKFLOW_BOARD_ID }, runtimeTasks);

    let parentReturns = ownerReturns('p2');
    assert.equal(parentReturns.length, 1, 'the hard-interrupt is routed to the parent');
    assert.equal(parentReturns[0].kind, 'needs_decision');
    assert.equal(parentReturns[0].routed, true);
    assert.equal(parentReturns[0].correlationId, 'p2');
  });

  it('does NOT route a soft progress/partial return (parent not churned per tick)', async () => {
    plantParent('p3');
    plantRunningChild('c3', 'p3');
    let runtimeTasks = runningTaskWithMarker('task-c3', 'WORKFLOW_RETURN: progress');

    await service.reconcileWorkflowRuntimeTasks({ boardId: DEFAULT_WORKFLOW_BOARD_ID }, runtimeTasks);

    // The child still records its own progress entry; the parent inbox stays empty.
    assert.equal(service.getCard('c3').metadata.returns.length, 1, 'the child records its own progress');
    assert.equal(service.getCard('p3').metadata?.returns, undefined, 'a soft progress return is not routed');
  });

  it('routes a terminal completed return to the parent before a full-join wake', async () => {
    plantParent('p4');
    plantRunningChild('c4', 'p4');
    let runtimeTasks = new Map([['task-c4', { id: 'task-c4', status: 'completed', completedAt: 1500 }]]);

    await service.reconcileWorkflowRuntimeTasks({ boardId: DEFAULT_WORKFLOW_BOARD_ID }, runtimeTasks);

    let parentReturns = ownerReturns('p4');
    assert.equal(parentReturns.length, 1, 'the terminal completed return is routed to the parent');
    assert.equal(parentReturns[0].kind, 'completed');
    assert.equal(parentReturns[0].terminal, true);
    assert.equal(parentReturns[0].routed, true, 'a routed terminal is wake-driving for the parent');
    assert.equal(parentReturns[0].correlationId, 'p4');
  });

  it('re-parsing the same marker is idempotent (deterministic eventId → coalesce no-op, no double-wake)', async () => {
    plantParent('p5');
    plantRunningChild('c5', 'p5');
    let marker = 'WORKFLOW_RETURN: discovered {"detail":"stable finding"}';

    await service.reconcileWorkflowRuntimeTasks(
      { boardId: DEFAULT_WORKFLOW_BOARD_ID }, runningTaskWithMarker('task-c5', marker),
    );
    assert.equal(ownerReturns('p5').length, 1, 'first parse routes one copy');
    let firstEventId = ownerReturns('p5')[0].eventId;

    // Re-parse the SAME marker on the SAME still-running run: the child eventId is deterministic on
    // runId + marker, and the routed eventId on the child eventId + parentId, so coalesce drops it.
    await service.reconcileWorkflowRuntimeTasks(
      { boardId: DEFAULT_WORKFLOW_BOARD_ID }, runningTaskWithMarker('task-c5', marker),
    );
    let after = ownerReturns('p5');
    assert.equal(after.length, 1, 'a re-parse of the same marker does not grow the parent inbox');
    assert.equal(after[0].eventId, firstEventId, 'the routed eventId is stable across re-parses');
  });

  it('a child with no parentCardId routes nothing (no owner to wake)', async () => {
    let orphan = plantRunningChild('orphan', null);
    let runtimeTasks = runningTaskWithMarker(orphan.taskId, 'WORKFLOW_RETURN: discovered {"detail":"x"}');

    await service.reconcileWorkflowRuntimeTasks({ boardId: DEFAULT_WORKFLOW_BOARD_ID }, runtimeTasks);

    // The orphan still records its own copy; nothing is routed (no parent card exists).
    assert.equal(service.getCard('orphan').metadata.returns.length, 1, 'the orphan records its own copy');
  });

  it('a return whose parentCardId points at a missing card is skipped (no throw, child copy intact)', async () => {
    plantRunningChild('c6', 'ghost-parent');
    let runtimeTasks = runningTaskWithMarker('task-c6', 'WORKFLOW_RETURN: discovered {"detail":"y"}');

    await service.reconcileWorkflowRuntimeTasks({ boardId: DEFAULT_WORKFLOW_BOARD_ID }, runtimeTasks);

    assert.equal(service.getCard('c6').metadata.returns.length, 1, 'the child copy is intact');
    assert.equal(sg.get('workflowCards/ghost-parent'), undefined, 'no card is conjured for the missing parent');
  });

  // Two siblings of the SAME parent emitting/settling in ONE reconcile pass. The routed copies share a
  // parent path; without the per-pass owner draft + per-source-distinct eventId, the second clobbers the
  // first (shared ops batch, last-write-wins) and/or coalesces onto a single id — the parent would learn
  // of only ONE sibling. Both transports (intermediate marker, terminal completion) must deliver both.
  it('two siblings emitting actionable intermediate returns in one pass both reach the parent', async () => {
    plantParent('p7');
    plantRunningChild('c7a', 'p7');
    plantRunningChild('c7b', 'p7');
    let runtimeTasks = new Map([
      ['task-c7a', { id: 'task-c7a', status: 'running', updatedAt: 1400, events: [{ text: 'WORKFLOW_RETURN: discovered {"detail":"from A"}' }] }],
      ['task-c7b', { id: 'task-c7b', status: 'running', updatedAt: 1400, events: [{ text: 'WORKFLOW_RETURN: discovered {"detail":"from B"}' }] }],
    ]);

    await service.reconcileWorkflowRuntimeTasks({ boardId: DEFAULT_WORKFLOW_BOARD_ID }, runtimeTasks);

    let details = ownerReturns('p7').map(r => r.detail).sort();
    assert.deepEqual(details, ['from A', 'from B'], 'both siblings\' routed returns survive the shared pass');
  });

  // A mid-tree node that is BOTH reconciled (its own run terminal-completes → column move + own return)
  // AND routed-to by its child in the SAME pass. The own-update and the routed return target the same
  // card path; without the per-pass merge the later op clobbers the earlier — either the column advance
  // or the child's routed return is lost. Both must survive in the single final write for that card.
  it('a node reconciled AND routed-to in one pass keeps its own advance and the child routed return', async () => {
    plantParent('mid');
    // `mid` is itself a child of an orchestrator grandparent and runs to completion this pass.
    let gp = plantParent('gp');
    sg.commit([{ op: 'set', path: 'workflowCards/mid', value: { ...service.getCard('mid'), columnId: 'in-progress', lifecycle: 'running', parentCardId: gp.id } }], 'test:link-mid');
    sg.commit([{ op: 'set', path: 'workflowRuns/run-mid', value: {
      schema: 'workflow-run/v1', id: 'run-mid', boardId: DEFAULT_WORKFLOW_BOARD_ID, cardId: 'mid',
      status: 'running', taskIds: ['task-mid'], startedAt: 900, updatedAt: 901,
    } }], 'test:run-mid');
    // `leaf` is mid's child, still live, emitting an actionable return routed to mid in this same pass.
    plantRunningChild('leaf', 'mid');

    let runtimeTasks = new Map([
      ['task-mid', { id: 'task-mid', status: 'completed', completedAt: 1500 }],
      ['task-leaf', { id: 'task-leaf', status: 'running', updatedAt: 1400, events: [{ text: 'WORKFLOW_RETURN: discovered {"detail":"leaf finding"}' }] }],
    ]);

    await service.reconcileWorkflowRuntimeTasks({ boardId: DEFAULT_WORKFLOW_BOARD_ID }, runtimeTasks);

    let mid = service.getCard('mid');
    assert.notEqual(mid.columnId, 'in-progress', 'mid\'s own terminal advance is preserved');
    let midReturns = mid.metadata?.returns ?? [];
    // mid carries its OWN completed return (correlationId=mid, not routed) AND the routed leaf finding.
    assert.ok(midReturns.some(r => r.kind === 'completed' && r.correlationId === 'mid'), 'mid keeps its own completed return');
    assert.ok(midReturns.some(r => r.routed && r.detail === 'leaf finding'), 'the child\'s routed return is not clobbered by mid\'s own update');
  });

  it('two siblings terminal-completing in one pass both reach the parent (distinct routed eventIds)', async () => {
    plantParent('p8');
    plantRunningChild('c8a', 'p8');
    plantRunningChild('c8b', 'p8');
    let runtimeTasks = new Map([
      ['task-c8a', { id: 'task-c8a', status: 'completed', completedAt: 1500 }],
      ['task-c8b', { id: 'task-c8b', status: 'completed', completedAt: 1500 }],
    ]);

    await service.reconcileWorkflowRuntimeTasks({ boardId: DEFAULT_WORKFLOW_BOARD_ID }, runtimeTasks);

    let parentReturns = ownerReturns('p8');
    assert.equal(parentReturns.length, 2, 'both terminal completions are routed (no eventId collision)');
    assert.equal(new Set(parentReturns.map(r => r.eventId)).size, 2, 'the two routed copies carry distinct eventIds');
    assert.ok(parentReturns.every(r => r.kind === 'completed' && r.routed && r.correlationId === 'p8'));
  });
});
