import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { DEFAULT_WORKFLOW_BOARD_ID, hasActiveEscalation } from '../../src/iso/workflow-board.js';
import { StateGraph } from '../../src/node/state-graph.js';
import { createWorkflowBoardService } from '../../src/node/workflow-board-service.js';
import { humanPrincipal } from '../../src/node/server/principal.js';

// Orchestrator return-mint (S6–S8): a worker emits `WORKFLOW_RETURN: <kind>` (optionally trailed by a
// JSON object) in its task output. reconcileWorkflowRuntimeTasks parses the marker the same way the
// escalation parser does (workerFinalAnswerText → runtime task events tail here) and folds the minted
// return into the per-card inbox (card.metadata.returns). A hard-interrupt return ALSO folds onto
// card.metadata.escalation so hasActiveEscalation stays true. Returns never move the card by themselves.
describe('workflow runtime reconcile — orchestrator return mint (S6–S8)', () => {
  let tmpDir;
  let sg;
  let now;
  let idSeq;
  let ledger;
  let service;

  // A delegate stub: the return-mint reconcile never spawns, but the service requires a proxyManager.
  function makeProxy() {
    let calls = [];
    return {
      calls,
      proxy: {
        requestFromChild: async (server, _method, _payload) => {
          calls.push({ server });
          return { content: [{ type: 'text', text: 'ok' }] };
        },
        chatWsServer: { taskChatMap: new Map() },
      },
    };
  }

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'workflow-return-mint-'));
    sg = new StateGraph({
      snapshotPath: path.join(tmpDir, 'state.json'),
      walPath: path.join(tmpDir, 'state.wal'),
      chatsDir: path.join(tmpDir, 'chats'),
    });
    now = 1000;
    idSeq = 0;
    ledger = makeProxy();
    service = createWorkflowBoardService({
      stateGraph: sg,
      now: () => now++,
      makeId: (prefix) => `${prefix}-${++idSeq}`,
      projectRoot: tmpDir,
      proxyManager: ledger.proxy,
      defaultPrincipal: humanPrincipal({ transport: { channel: 'loopback' }, label: 'local-human' }),
    });
  });

  afterEach(async () => {
    await sg.flushChatWrites();
    sg.flush();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // Plant a card in `in-progress` (lifecycle running) with a live run linked to a runtime task — the
  // scheduler-admitted shape. The worker's return marker is injected via the runtime task events tail
  // (the chat-less fallback path workerFinalAnswerText reads). Returns { cardId, runId, taskId }.
  function plantRunningCard(id = 'wip') {
    let created = service.createOrUpdateCard({
      id,
      title: `Card ${id}`,
      body: 'Runtime-linked work item.',
      columnId: 'in-progress',
      projectId: 'agent-portal',
      domain: 'backend',
      owner: 'orchestrator',
      assignedAgent: 'backend-engineer',
      resourceGroup: 'impl',
      acceptanceCriteria: ['Done when audited'],
      actor: 'test',
    });
    let card = created.card;
    let runId = `run-${id}`;
    let taskId = `task-${id}`;
    sg.commit([
      { op: 'set', path: `workflowCards/${id}`, value: { ...card, columnId: 'in-progress', lifecycle: 'running' } },
      { op: 'set', path: `workflowRuns/${runId}`, value: {
        schema: 'workflow-run/v1', id: runId, boardId: DEFAULT_WORKFLOW_BOARD_ID, cardId: id,
        status: 'running', taskIds: [taskId], startedAt: 900, updatedAt: 901,
      } },
    ], 'test:plant-running');
    return { cardId: id, runId, taskId };
  }

  // A running runtime task whose final event carries the marker text. Status `running` keeps the run
  // status unchanged so we exercise the still-live intermediate-return path (no column move).
  function runningTaskWithMarker(taskId, marker) {
    return new Map([[taskId, {
      id: taskId, status: 'running', updatedAt: 1400,
      events: [{ text: `working...\n${marker}` }],
    }]]);
  }

  it('appends a progress return (no escalation, no column move)', async () => {
    let { cardId } = plantRunningCard('prog');
    let runtimeTasks = runningTaskWithMarker('task-prog', 'WORKFLOW_RETURN: progress');

    await service.reconcileWorkflowRuntimeTasks({ boardId: DEFAULT_WORKFLOW_BOARD_ID }, runtimeTasks);

    let card = service.getCard(cardId);
    let returns = card.metadata?.returns ?? [];
    assert.equal(returns.length, 1, 'one return appended to the inbox');
    assert.equal(returns[0].kind, 'progress');
    assert.equal(returns[0].correlationId, cardId, 'correlationId is the cardId (inbox key)');
    assert.equal(returns[0].actionable, false, 'progress is coalesce-only (not actionable)');
    assert.equal(card.metadata?.escalation, undefined, 'a soft return sets NO escalation');
    assert.equal(hasActiveEscalation(card), false);
    assert.equal(card.columnId, 'in-progress', 'a return does not move the card');
    assert.equal(card.lifecycle, 'running', 'a still-live run keeps its lifecycle');
  });

  it('appends a discovered return (actionable, non-hard, no escalation)', async () => {
    let { cardId } = plantRunningCard('disc');
    let runtimeTasks = runningTaskWithMarker('task-disc', 'WORKFLOW_RETURN: discovered {"detail":"found a sub-task"}');

    await service.reconcileWorkflowRuntimeTasks({ boardId: DEFAULT_WORKFLOW_BOARD_ID }, runtimeTasks);

    let card = service.getCard(cardId);
    let returns = card.metadata?.returns ?? [];
    assert.equal(returns.length, 1);
    assert.equal(returns[0].kind, 'discovered');
    assert.equal(returns[0].actionable, true, 'discovered is actionable');
    assert.equal(returns[0].hardInterrupt, false, 'discovered is not a hard interrupt');
    assert.equal(returns[0].detail, 'found a sub-task', 'the trailing JSON detail is parsed');
    assert.equal(card.metadata?.escalation, undefined, 'a non-hard return sets NO escalation');
    assert.equal(card.columnId, 'in-progress');
  });

  it('appends a needs_decision return AND sets an active escalation (hard interrupt, needsResponse)', async () => {
    let { cardId } = plantRunningCard('dec');
    let runtimeTasks = runningTaskWithMarker(
      'task-dec', 'WORKFLOW_RETURN: needs_decision {"detail":"which API to call?"}',
    );

    await service.reconcileWorkflowRuntimeTasks({ boardId: DEFAULT_WORKFLOW_BOARD_ID }, runtimeTasks);

    let card = service.getCard(cardId);
    let returns = card.metadata?.returns ?? [];
    assert.equal(returns.length, 1);
    assert.equal(returns[0].kind, 'needs_decision');
    assert.equal(returns[0].hardInterrupt, true, 'needs_decision is a hard interrupt');
    assert.equal(returns[0].needsResponse, true, 'a hard interrupt needs a response');
    assert.equal(returns[0].escalationKind, 'needs_decision');
    // S8: the hard-interrupt return folds onto metadata.escalation so the driver re-engages it.
    assert.ok(card.metadata?.escalation, 'a hard interrupt sets the escalation state');
    assert.equal(card.metadata.escalation.kind, 'needs_decision', 'escalation kind mirrors the return');
    assert.equal(card.metadata.escalation.lastEscalation.detail, 'which API to call?');
    assert.equal(hasActiveEscalation(card), true, 'hasActiveEscalation stays true for the re-engage driver');
    assert.equal(card.columnId, 'in-progress', 'a hard-interrupt return still does not move the card');
  });

  it('a terminal completed run mints a completed return (correlationId=cardId)', async () => {
    let { cardId } = plantRunningCard('done');
    let runtimeTasks = new Map([['task-done', { id: 'task-done', status: 'completed', completedAt: 1500 }]]);

    await service.reconcileWorkflowRuntimeTasks({ boardId: DEFAULT_WORKFLOW_BOARD_ID }, runtimeTasks);

    let card = service.getCard(cardId);
    let returns = card.metadata?.returns ?? [];
    assert.equal(returns.length, 1, 'the terminal mint appended a return');
    assert.equal(returns[0].kind, 'completed');
    assert.equal(returns[0].terminal, true);
    assert.equal(returns[0].correlationId, cardId);
    assert.equal(card.metadata?.escalation, undefined, 'a completed return raises no escalation');
  });

  it('a terminal failed run mints a failed return', async () => {
    let { cardId } = plantRunningCard('fail');
    let runtimeTasks = new Map([['task-fail', { id: 'task-fail', status: 'failed', completedAt: 1500 }]]);

    await service.reconcileWorkflowRuntimeTasks({ boardId: DEFAULT_WORKFLOW_BOARD_ID }, runtimeTasks);

    let card = service.getCard(cardId);
    let returns = card.metadata?.returns ?? [];
    assert.equal(returns.length, 1);
    assert.equal(returns[0].kind, 'failed');
    assert.equal(returns[0].terminal, true);
  });

  it('a late progress after a terminal is dropped by coalesce (no inbox growth)', async () => {
    let { cardId } = plantRunningCard('late');
    // First reconcile: the run completes → a `completed` terminal return lands in the inbox.
    await service.reconcileWorkflowRuntimeTasks(
      { boardId: DEFAULT_WORKFLOW_BOARD_ID },
      new Map([['task-late', { id: 'task-late', status: 'completed', completedAt: 1500 }]]),
    );
    let afterTerminal = service.getCard(cardId);
    assert.equal(afterTerminal.metadata.returns.length, 1);
    assert.equal(afterTerminal.metadata.returns[0].kind, 'completed');

    // Re-plant a still-running run for the SAME card carrying a late progress marker, then reconcile.
    // coalesceReturnEvents drops a coalesce-only incoming once a terminal for that correlationId exists.
    sg.commit([{ op: 'set', path: 'workflowRuns/run-late2', value: {
      schema: 'workflow-run/v1', id: 'run-late2', boardId: DEFAULT_WORKFLOW_BOARD_ID, cardId,
      status: 'running', taskIds: ['task-late2'], startedAt: 1600, updatedAt: 1601,
    } }], 'test:replant-running');
    await service.reconcileWorkflowRuntimeTasks(
      { boardId: DEFAULT_WORKFLOW_BOARD_ID },
      runningTaskWithMarker('task-late2', 'WORKFLOW_RETURN: progress'),
    );

    let card = service.getCard(cardId);
    assert.equal(card.metadata.returns.length, 1, 'the late progress is dropped (terminal already landed)');
    assert.equal(card.metadata.returns[0].kind, 'completed', 'the terminal return is unchanged');
  });

  it('absent marker → no returns mutation (no-op on the inbox)', async () => {
    let { cardId } = plantRunningCard('noop');
    // A running task with NO marker in its events tail.
    let runtimeTasks = new Map([['task-noop', {
      id: 'task-noop', status: 'running', updatedAt: 1400, events: [{ text: 'still working, no marker here' }],
    }]]);

    await service.reconcileWorkflowRuntimeTasks({ boardId: DEFAULT_WORKFLOW_BOARD_ID }, runtimeTasks);

    let card = service.getCard(cardId);
    assert.equal(card.metadata?.returns, undefined, 'no marker leaves the inbox untouched');
    assert.equal(card.metadata?.escalation, undefined);
    assert.equal(card.columnId, 'in-progress');
  });
});
