import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { DEFAULT_WORKFLOW_BOARD_ID, normalizeWorkflowRunInput } from '../../src/iso/workflow-board.js';
import { StateGraph } from '../../src/node/state-graph.js';
import { createWorkflowBoardService } from '../../src/node/workflow-board-service.js';
import { humanPrincipal } from '../../src/node/server/principal.js';

describe('workflow run token total — schema', () => {
  it('persists a non-negative integer token total and rejects junk', () => {
    assert.equal(normalizeWorkflowRunInput({ cardId: 'c' }, { id: 'r' }).tokens, null);
    assert.equal(normalizeWorkflowRunInput({ cardId: 'c', tokens: 1234 }, { id: 'r' }).tokens, 1234);
    assert.equal(normalizeWorkflowRunInput({ cardId: 'c', tokens: 1234.9 }, { id: 'r' }).tokens, 1234);
    assert.equal(normalizeWorkflowRunInput({ cardId: 'c', tokens: -5 }, { id: 'r' }).tokens, null);
    assert.equal(normalizeWorkflowRunInput({ cardId: 'c', tokens: 'nope' }, { id: 'r' }).tokens, null);
    assert.equal(normalizeWorkflowRunInput({ cardId: 'c', token_total: 77 }, { id: 'r' }).tokens, 77);
  });
});

// Aggregation through reconcile: when a run terminalizes, the per-task token totals reported by its
// runtime tasks are summed onto run.tokens. Mirrors the in-process loopback-human harness the other
// runtime-reconcile suites use.
describe('workflow runtime reconcile — token aggregation', () => {
  let tmpDir;
  let sg;
  let now;
  let idSeq;
  let service;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'workflow-run-tokens-'));
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

  function plantRunningCard(id, taskIds) {
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
    let runId = `run-${id}`;
    sg.commit([
      { op: 'set', path: `workflowCards/${id}`, value: { ...created.card, columnId: 'in-progress', lifecycle: 'running' } },
      { op: 'set', path: `workflowRuns/${runId}`, value: {
        schema: 'workflow-run/v1', id: runId, boardId: DEFAULT_WORKFLOW_BOARD_ID, cardId: id,
        status: 'running', taskIds, startedAt: 900, updatedAt: 901,
      } },
    ], 'test:plant-running');
    return runId;
  }

  it('sums task.tokens across a run\'s tasks when it completes', async () => {
    let runId = plantRunningCard('multi', ['task-a', 'task-b']);
    let runtimeTasks = new Map([
      ['task-a', { id: 'task-a', status: 'completed', updatedAt: 1400, completedAt: 1400, tokens: 12000 }],
      ['task-b', { id: 'task-b', status: 'completed', updatedAt: 1410, completedAt: 1410, tokens: 3400 }],
    ]);

    await service.reconcileWorkflowRuntimeTasks({ boardId: DEFAULT_WORKFLOW_BOARD_ID }, runtimeTasks);

    let run = sg.get(`workflowRuns/${runId}`);
    assert.equal(run.status, 'completed');
    assert.equal(run.tokens, 15400);
  });

  it('reads the stats.total_tokens fallback shape', async () => {
    let runId = plantRunningCard('stats', ['task-c']);
    let runtimeTasks = new Map([
      ['task-c', { id: 'task-c', status: 'completed', updatedAt: 1400, completedAt: 1400, result: { stats: { total_tokens: 9100 } } }],
    ]);

    await service.reconcileWorkflowRuntimeTasks({ boardId: DEFAULT_WORKFLOW_BOARD_ID }, runtimeTasks);

    assert.equal(sg.get(`workflowRuns/${runId}`).tokens, 9100);
  });

  it('leaves tokens null when no task reports any', async () => {
    let runId = plantRunningCard('none', ['task-d']);
    let runtimeTasks = new Map([
      ['task-d', { id: 'task-d', status: 'completed', updatedAt: 1400, completedAt: 1400 }],
    ]);

    await service.reconcileWorkflowRuntimeTasks({ boardId: DEFAULT_WORKFLOW_BOARD_ID }, runtimeTasks);

    assert.equal(sg.get(`workflowRuns/${runId}`).tokens, null);
  });

  it('backfills tokens onto an already-terminal run when they arrive late', async () => {
    // The run terminalized before the worker token total landed on the task record (async results).
    // Terminal runs are not reprocessed by the status loop, so the backfill must still pick it up.
    let created = service.createOrUpdateCard({
      id: 'late', title: 'Late tokens', body: 'x', columnId: 'quality-audit', projectId: 'agent-portal',
      owner: 'orchestrator', assignedAgent: 'code-reviewer', acceptanceCriteria: ['Done'], actor: 'test',
    });
    sg.commit([
      { op: 'set', path: 'workflowCards/late', value: { ...created.card, columnId: 'quality-audit' } },
      { op: 'set', path: 'workflowRuns/run-late', value: {
        schema: 'workflow-run/v1', id: 'run-late', boardId: DEFAULT_WORKFLOW_BOARD_ID, cardId: 'late',
        status: 'completed', taskIds: ['task-late'], startedAt: 900, updatedAt: 1000, completedAt: 1000, tokens: null,
      } },
    ], 'test:plant-terminal');
    let runtimeTasks = new Map([
      ['task-late', { id: 'task-late', status: 'completed', updatedAt: 1000, completedAt: 1000, tokens: 5000 }],
    ]);

    await service.reconcileWorkflowRuntimeTasks({ boardId: DEFAULT_WORKFLOW_BOARD_ID }, runtimeTasks);

    assert.equal(sg.get('workflowRuns/run-late').tokens, 5000);
  });
});
