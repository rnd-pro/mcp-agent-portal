import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  DEFAULT_WORKFLOW_BOARD_ID,
  DEFAULT_WORKFLOW_COLUMN_IDS,
  RECOVERY_FLAGS,
  createDefaultWorkflowBoard,
  normalizeWorkflowCardInput,
} from '../../src/iso/workflow-board.js';
import { StateGraph } from '../../src/node/state-graph.js';
import { createWorkflowBoardService } from '../../src/node/workflow-board-service.js';

describe('workflow board model and service', () => {
  let tmpDir;
  let sg;
  let now;
  let idSeq;
  let service;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'workflow-board-model-'));
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
    });
  });

  afterEach(async () => {
    await sg.flushChatWrites();
    sg.flush();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('defines the default board columns, gates, card shape, and recovery flags', () => {
    let board = createDefaultWorkflowBoard({ now: 123 });
    let card = normalizeWorkflowCardInput({
      title: 'Classify workflow board',
      boardId: DEFAULT_WORKFLOW_BOARD_ID,
      columnId: 'ideas',
      projectId: 'agent-portal',
      entityRefs: { goalId: 'goal-1', taskIds: 'task-1' },
      acceptanceCriteria: 'Backend foundation exists',
    }, { id: 'card-1', now: 456 });

    assert.equal(board.id, DEFAULT_WORKFLOW_BOARD_ID);
    assert.equal(board.schema, 'workflow-board/v1');
    assert.deepEqual(board.columns.map(column => column.id), DEFAULT_WORKFLOW_COLUMN_IDS);
    assert.equal(board.mode, 'armed');
    assert.equal(
      board.transitions.find(item => item.from === 'ideas' && item.to === 'backlog')?.gate,
      'classified_and_project_scoped',
    );
    assert.equal(card.schema, 'workflow-card/v1');
    assert.equal(card.id, 'card-1');
    assert.equal(card.columnId, 'ideas');
    assert.deepEqual(card.entityRefs.taskIds, ['task-1']);
    assert.deepEqual(card.acceptanceCriteria, ['Backend foundation exists']);
    assert.ok(RECOVERY_FLAGS.includes('needs_resume'));
    assert.deepEqual(sg.get('workflowBoards'), {});
    assert.deepEqual(sg.get('workflowCards'), {});
    assert.deepEqual(sg.get('workflowTransitions'), {});
    assert.deepEqual(sg.get('workflowChecks'), {});
    assert.deepEqual(sg.get('workflowRuns'), {});
    assert.deepEqual(sg.get('workflowLeases'), {});
  });

  it('blocks failed gates and optimistic version mismatches before accepting transitions', () => {
    let created = service.createOrUpdateCard({
      title: 'Raw workflow idea',
      columnId: 'ideas',
      actor: 'test',
    });
    let gateBlocked = service.requestTransition({
      cardId: created.card.id,
      fromColumnId: 'ideas',
      toColumnId: 'backlog',
      expectedVersion: created.card.version,
      actor: 'test',
      reason: 'Classify intake',
    });

    assert.equal(gateBlocked.status, 'blocked');
    assert.equal(gateBlocked.gateResult.ok, false);
    assert.equal(gateBlocked.gateResult.failures[0].gate, 'classified_and_project_scoped');
    assert.equal(service.getCard(created.card.id).columnId, 'ideas');

    let updated = service.createOrUpdateCard({
      id: created.card.id,
      projectId: 'agent-portal',
      domain: 'backend',
      actor: 'test',
      expectedVersion: created.card.version,
    });
    let stale = service.requestTransition({
      cardId: created.card.id,
      fromColumnId: 'ideas',
      toColumnId: 'backlog',
      expectedVersion: created.card.version,
      actor: 'test',
      reason: 'Use stale version',
    });

    assert.equal(stale.status, 'blocked');
    assert.equal(stale.gateResult.failures[0].gate, 'version_conflict');

    let accepted = service.requestTransition({
      cardId: created.card.id,
      fromColumnId: 'ideas',
      toColumnId: 'backlog',
      expectedVersion: updated.card.version,
      actor: 'test',
      reason: 'Classified for backend project',
    });

    assert.equal(accepted.status, 'accepted');
    assert.equal(accepted.card.columnId, 'backlog');
    assert.equal(accepted.card.version, updated.card.version + 1);
    assert.deepEqual(
      service.listEvents({ cardId: created.card.id }).map(event => event.status),
      ['blocked', 'blocked', 'accepted'],
    );
  });

  it('returns board projections scoped by project without using markdown as live state', () => {
    let alpha = service.createOrUpdateCard({
      title: 'Alpha backend work',
      projectId: 'project-alpha',
      columnId: 'backlog',
      actor: 'test',
    });
    service.createOrUpdateCard({
      title: 'Beta frontend work',
      projectId: 'project-beta',
      columnId: 'ready',
      actor: 'test',
    });
    service.createOrUpdateCard({
      title: 'Global idea',
      columnId: 'ideas',
      actor: 'test',
    });

    let all = service.getBoardProjection();
    let scoped = service.getBoardProjection({ projectId: 'project-alpha' });

    assert.equal(all.cards.length, 3);
    assert.deepEqual(scoped.cards.map(card => card.id), [alpha.card.id]);
    assert.equal(scoped.columns.find(column => column.id === 'backlog').cards.length, 1);
    assert.equal(scoped.columns.find(column => column.id === 'ideas').cards.length, 0);
  });

  it('orchestrates eligible work items with leases, chat links, and idempotent runs', async () => {
    let taskId = '11111111-1111-4111-8111-111111111111';
    let calls = [];
    let proxyManager = {
      projectRoot: tmpDir,
      requestFromChild: async (_server, _method, payload) => {
        calls.push(payload);
        return { content: [{ type: 'text', text: `Started task ${taskId}` }] };
      },
      chatWsServer: { taskChatMap: new Map() },
    };
    service = createWorkflowBoardService({
      stateGraph: sg,
      now: () => now++,
      makeId: (prefix) => `${prefix}-${++idSeq}`,
      projectRoot: tmpDir,
      proxyManager,
    });
    let created = service.createOrUpdateCard({
      title: 'Implement workflow automation',
      body: 'Use the workflow control plane.',
      columnId: 'ready',
      projectId: 'agent-portal',
      domain: 'backend',
      owner: 'orchestrator',
      assignedAgent: 'backend-engineer',
      acceptanceCriteria: ['Runtime task is linked'],
      actor: 'test',
    });

    let first = await service.orchestrateWorkItem({
      cardId: created.card.id,
      actor: 'orchestrator',
    });
    let second = await service.orchestrateWorkItem({
      cardId: first.card.id,
      actor: 'orchestrator',
    });

    assert.equal(first.ok, true);
    assert.equal(first.run.status, 'running');
    assert.deepEqual(first.run.taskIds, [taskId]);
    assert.equal(first.lease.leaseOwner, 'orchestrator');
    assert.equal(first.sideEffects[0].type, 'delegate_task');
    assert.equal(first.sideEffects[0].status, 'started');
    assert.equal(first.card.entityRefs.taskIds[0], taskId);
    assert.ok(first.card.entityRefs.chatId);
    assert.ok(first.card.entityRefs.goalId);
    assert.equal(second.idempotent, true);
    assert.equal(calls.length, 1);
    assert.equal(sg.getChat(first.card.entityRefs.chatId)?.pendingTaskId, taskId);
    assert.equal(proxyManager.chatWsServer.taskChatMap.get(taskId), first.card.entityRefs.chatId);
  });

  it('persists recovery reconciliation for active cards after runtime loss', async () => {
    let created = service.createOrUpdateCard({
      title: 'Resume active card',
      columnId: 'in-progress',
      projectId: 'agent-portal',
      actor: 'test',
    });

    let result = await service.reconcileWorkflowRecovery({
      projectId: 'agent-portal',
      actor: 'recovery-test',
    });
    let card = service.getCard(created.card.id);
    let run = sg.get(`workflowRuns/recovery-${created.card.id}`);

    assert.equal(result.ok, true);
    assert.equal(result.reconciled.length, 1);
    assert.deepEqual(card.recoveryFlags, ['needs_resume']);
    assert.equal(run.status, 'recovery_detected');
    assert.equal(service.getRecoveryState({ projectId: 'agent-portal' }).summary.needsResume, 1);
  });

  it('imports and exports markdown work items as durable intent', async () => {
    service = createWorkflowBoardService({
      stateGraph: sg,
      now: () => now++,
      makeId: (prefix) => `${prefix}-${++idSeq}`,
      projectRoot: tmpDir,
    });
    let created = service.createOrUpdateCard({
      id: 'work-item-md',
      title: 'Markdown backed work',
      body: 'Durable prompt body.',
      columnId: 'ready',
      projectId: 'agent-portal',
      domain: 'docs',
      owner: 'orchestrator',
      assignedAgent: 'writer',
      acceptanceCriteria: ['Markdown round trip works'],
      context: ['Use frontmatter metadata'],
      actor: 'test',
    });
    let exported = await service.exportWorkflowWorkItem({
      cardId: created.card.id,
      actor: 'test',
    });
    let content = fs.readFileSync(path.join(tmpDir, '.agent-portal', 'workspace', exported.markdownPath), 'utf8');

    assert.match(content, /runtime_source: "state_graph"/);
    assert.match(content, /column_snapshot: "ready"/);

    let secondGraph = new StateGraph({
      snapshotPath: path.join(tmpDir, 'state-import.json'),
      walPath: path.join(tmpDir, 'state-import.wal'),
      chatsDir: path.join(tmpDir, 'chats-import'),
    });
    let importingService = createWorkflowBoardService({
      stateGraph: secondGraph,
      now: () => now++,
      projectRoot: tmpDir,
    });
    try {
      let imported = await importingService.importWorkflowWorkItems({
        projectId: 'agent-portal',
        actor: 'test',
      });
      let importedCard = importingService.getCard('work-item-md');

      assert.equal(imported.count, 1);
      assert.equal(importedCard.body, 'Durable prompt body.');
      assert.equal(importedCard.assignedAgent, 'writer');
      assert.equal(importedCard.metadata.markdownPath, exported.markdownPath);
    } finally {
      await secondGraph.flushChatWrites();
      secondGraph.flush();
    }
  });
});
