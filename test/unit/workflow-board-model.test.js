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

function writeWorkItemSeed(root, projectId, fileName, frontmatter, body = 'Durable body.') {
  let dir = path.join(root, '.agent-portal', 'workspace', projectId, 'plans', 'work-items');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, fileName), `---\n${frontmatter.trim()}\n---\n\n${body}\n`, 'utf8');
}

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
      projectRoot: tmpDir,
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
      cwd: '/workspace/agent-portal',
      entityRefs: { goalId: 'goal-1', taskIds: 'task-1', files: 'src/node/workflow-board-service.js' },
      acceptanceCriteria: 'Backend foundation exists',
      blockers: [{ reason: 'Waiting for workflow approval' }],
    }, { id: 'card-1', now: 456 });

    assert.equal(board.id, DEFAULT_WORKFLOW_BOARD_ID);
    assert.equal(board.schema, 'workflow-board/v1');
    assert.deepEqual(board.columns.map(column => column.id), DEFAULT_WORKFLOW_COLUMN_IDS);
    assert.equal(board.mode, 'armed');
    assert.equal(board.automation.pickup, 'auto');
    assert.equal(board.automation.recovery, 'manual');
    assert.equal(board.automation.globalParallelLimit, 8);
    assert.deepEqual(board.automation.fallbackAgents, ['orchestrator']);
    assert.equal(
      board.transitions.find(item => item.from === 'ideas' && item.to === 'backlog')?.gate,
      'classified_and_project_scoped',
    );
    let readyColumn = board.columns.find(column => column.id === 'ready');
    assert.equal(readyColumn.automation.trigger, 'on_enter');
    assert.equal(readyColumn.automation.action, 'orchestrate');
    assert.equal(readyColumn.automation.mode, 'auto');
    assert.deepEqual(readyColumn.automation.agents, ['orchestrator']);
    assert.equal(readyColumn.automation.parallelLimit, 4);
    assert.deepEqual(
      board.columns.find(column => column.id === 'in-progress').automation.agents,
      ['backend-engineer', 'ui-engineer', 'provider-engineer', 'tooling-engineer'],
    );
    assert.deepEqual(
      board.columns.find(column => column.id === 'quality-audit').automation.agents,
      ['qa-engineer', 'code-reviewer'],
    );
    assert.deepEqual(
      board.columns.find(column => column.id === 'commit-publish').automation.agents,
      ['release-manager'],
    );
    assert.equal(card.schema, 'workflow-card/v1');
    assert.equal(card.id, 'card-1');
    assert.equal(card.columnId, 'ideas');
    assert.equal(card.cwd, '/workspace/agent-portal');
    assert.deepEqual(card.entityRefs.taskIds, ['task-1']);
    assert.deepEqual(card.entityRefs.files, ['src/node/workflow-board-service.js']);
    assert.deepEqual(card.files, ['src/node/workflow-board-service.js']);
    assert.deepEqual(card.acceptanceCriteria, ['Backend foundation exists']);
    assert.deepEqual(card.blockers, ['Waiting for workflow approval']);
    assert.ok(RECOVERY_FLAGS.includes('needs_resume'));
    assert.deepEqual(sg.get('workflowBoards'), {});
    assert.deepEqual(sg.get('workflowCards'), {});
    assert.deepEqual(sg.get('workflowTransitions'), {});
    assert.deepEqual(sg.get('workflowChecks'), {});
    assert.deepEqual(sg.get('workflowRuns'), {});
    assert.deepEqual(sg.get('workflowLeases'), {});
  });

  it('refreshes an existing default board to the current column automation policy', () => {
    let oldBoard = createDefaultWorkflowBoard({ now: 123 });
    oldBoard.version = 7;
    oldBoard.columns = oldBoard.columns.map((column) => (
      column.id === 'ready'
        ? {
            ...column,
            automation: {
              trigger: 'on_enter',
              action: 'orchestrate',
              mode: 'gated',
              agent: 'legacy-agent',
            },
          }
        : column
    ));
    oldBoard.transitions = oldBoard.transitions.filter(transition => transition.to !== 'ready');
    sg.commit([{ op: 'set', path: `workflowBoards/${DEFAULT_WORKFLOW_BOARD_ID}`, value: oldBoard }], 'seed');

    let projection = service.getBoardProjection();
    let board = projection.board;
    let readyColumn = board.columns.find(column => column.id === 'ready');

    assert.equal(board.version, 8);
    assert.equal(readyColumn.automation.mode, 'auto');
    assert.deepEqual(readyColumn.automation.agents, ['orchestrator']);
    assert.equal(readyColumn.automation.agent, undefined);
    assert.equal(readyColumn.automation.parallelLimit, 4);
    assert.ok(board.transitions.find(transition => transition.from === 'backlog' && transition.to === 'ready'));
    assert.equal(sg.get(`workflowBoards/${DEFAULT_WORKFLOW_BOARD_ID}`).version, 8);

    let updated = service.updateWorkflowColumn({
      columnId: 'ready',
      expectedVersion: board.version,
      patch: {
        automation: {
          mode: 'gated',
          agents: ['reviewer'],
          parallelLimit: 2,
        },
      },
      actor: 'test',
    });
    let afterReload = service.getBoardProjection().board;
    let reloadedReady = afterReload.columns.find(column => column.id === 'ready');

    assert.equal(updated.column.automation.mode, 'gated');
    assert.deepEqual(reloadedReady.automation.agents, ['reviewer']);
    assert.equal(reloadedReady.automation.parallelLimit, 2);
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

  it('persists update checks before accepting gated closeout transitions', () => {
    let created = service.createOrUpdateCard({
      title: 'Close audited workflow item',
      projectId: 'agent-portal',
      domain: 'orchestration',
      columnId: 'quality-audit',
      actor: 'test',
    });
    let blocked = service.requestTransition({
      cardId: created.card.id,
      fromColumnId: 'quality-audit',
      toColumnId: 'commit-publish',
      expectedVersion: created.card.version,
      actor: 'test',
      reason: 'Audit evidence is missing.',
    });

    assert.equal(blocked.status, 'blocked');
    assert.equal(blocked.gateResult.failures[0].gate, 'audit_pass_or_explicit_waiver');

    let updated = service.updateWorkItem({
      cardId: created.card.id,
      actor: 'test',
      expectedVersion: created.card.version,
      checks: {
        audit: { status: 'pass', evidence: 'node --test test/unit/workflow-board-model.test.js' },
        cleanDiff: { status: 'pass', evidence: 'git diff --check' },
        hygiene: { status: 'pass', evidence: 'reviewed staged diff' },
      },
    });

    assert.equal(updated.checks.audit.status, 'pass');
    assert.equal(service.getBoardProjection().cards[0].checks.audit.status, 'pass');

    let audited = service.requestTransition({
      cardId: created.card.id,
      fromColumnId: 'quality-audit',
      toColumnId: 'commit-publish',
      expectedVersion: updated.card.version,
      actor: 'test',
      reason: 'Audit evidence recorded.',
    });
    let done = service.requestTransition({
      cardId: created.card.id,
      fromColumnId: 'commit-publish',
      toColumnId: 'done',
      expectedVersion: audited.card.version,
      actor: 'test',
      reason: 'Clean diff and hygiene evidence recorded.',
    });

    assert.equal(audited.status, 'accepted');
    assert.equal(done.status, 'accepted');
    assert.equal(service.getCard(created.card.id).columnId, 'done');
  });

  it('decomposes a broad workflow card into linked child cards', () => {
    let parent = service.createOrUpdateCard({
      title: 'Implement broad workflow board work',
      projectId: 'agent-portal',
      domain: 'orchestration',
      columnId: 'backlog',
      owner: 'orchestrator',
      cwd: '/workspace/agent-portal',
      acceptanceCriteria: ['Children own scoped work'],
      context: ['Parent context'],
      actor: 'test',
    });
    let result = service.decomposeWorkItem({
      cardId: parent.card.id,
      expectedVersion: parent.card.version,
      actor: 'test',
      reason: 'Split broad card into scoped children.',
      childItems: [
        {
          title: 'Audit decomposition contract',
          owner: 'code-reviewer',
          assignedAgent: 'code-reviewer',
          acceptanceCriteria: ['Audit result is recorded'],
        },
        {
          title: 'Implement decomposition contract',
          owner: 'backend-engineer',
          assignedAgent: 'backend-engineer',
          domain: 'backend',
          cwd: '/workspace/agent-portal/packages/backend',
          acceptanceCriteria: ['Regression tests pass'],
          context: ['Child-specific context'],
        },
      ],
    });
    let projection = service.getBoardProjection();
    let projectedParent = projection.cards.find(card => card.id === parent.card.id);

    assert.equal(result.ok, true);
    assert.equal(result.children.length, 2);
    assert.deepEqual(result.children.map(card => card.parentCardId), [parent.card.id, parent.card.id]);
    assert.deepEqual(result.children.map(card => card.columnId), ['backlog', 'backlog']);
    assert.deepEqual(result.children.map(card => card.projectId), ['agent-portal', 'agent-portal']);
    assert.deepEqual(result.children.map(card => card.domain), ['orchestration', 'backend']);
    assert.deepEqual(result.children.map(card => card.cwd), [
      '/workspace/agent-portal',
      '/workspace/agent-portal/packages/backend',
    ]);
    assert.deepEqual(projectedParent.childCardIds, result.children.map(card => card.id));
    assert.equal(projection.cards.find(card => card.id === result.children[0].id).parentCardId, parent.card.id);
    assert.equal(result.event.eventType, 'decomposition');
    assert.deepEqual(
      result.event.sideEffects.map(item => item.type),
      ['child_card_created', 'child_card_created'],
    );
  });

  it('does not partially persist decomposition children when one child is invalid', () => {
    let parent = service.createOrUpdateCard({
      title: 'Split atomically',
      projectId: 'agent-portal',
      domain: 'orchestration',
      columnId: 'backlog',
      owner: 'orchestrator',
      acceptanceCriteria: ['No partial child cards'],
      actor: 'test',
    });

    assert.throws(
      () => service.decomposeWorkItem({
        cardId: parent.card.id,
        actor: 'test',
        childItems: [
          { id: 'child-valid', title: 'Valid child', acceptanceCriteria: ['Valid'] },
          { id: 'child-invalid', title: 'Invalid child', columnId: 'unknown-column' },
        ],
      }),
      /Unknown workflow column/,
    );
    assert.equal(service.getBoardProjection().cards.some(card => card.id === 'child-valid'), false);
    assert.equal(service.getBoardProjection().events.some(event => event.eventType === 'decomposition'), false);
  });

  it('returns board projections scoped by project without using markdown as live state', () => {
    let alpha = service.createOrUpdateCard({
      title: 'Alpha backend work',
      projectId: 'project-alpha',
      columnId: 'backlog',
      entityRefs: { goalId: 'goal-alpha', chatId: 'chat-alpha' },
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
    let goalScoped = service.getBoardProjection({ projectId: 'project-alpha', goalId: 'goal-alpha' });
    let chatScoped = service.getBoardProjection({ projectId: 'project-alpha', chatId: 'chat-alpha' });
    let missingGoal = service.getBoardProjection({ projectId: 'project-alpha', goalId: 'goal-missing' });

    assert.equal(all.cards.length, 3);
    assert.deepEqual(scoped.cards.map(card => card.id), [alpha.card.id]);
    assert.deepEqual(goalScoped.cards.map(card => card.id), [alpha.card.id]);
    assert.deepEqual(chatScoped.cards.map(card => card.id), [alpha.card.id]);
    assert.deepEqual(missingGoal.cards.map(card => card.id), []);
    assert.equal(goalScoped.scope.goalId, 'goal-alpha');
    assert.equal(chatScoped.scope.chatId, 'chat-alpha');
    assert.equal(scoped.columns.find(column => column.id === 'backlog').cards.length, 1);
    assert.equal(scoped.columns.find(column => column.id === 'ideas').cards.length, 0);
  });

  it('returns a compact status projection for workflow control without bulky history', async () => {
    let proxyManager = {
      requestFromChild: async (_server, _method, payload) => {
        assert.equal(payload.name, 'list_tasks');
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              tasks: [{
                id: 'task-active',
                kind: 'workflow-runtime-task',
                status: 'running',
                workflowBoardId: DEFAULT_WORKFLOW_BOARD_ID,
                workflowCardId: 'card-active',
                workflowRunId: 'run-active',
                startedAt: 1800,
                updatedAt: 1900,
                eventCount: 12,
              }],
              systemLoad: {
                total: 6,
                ours: 2,
                external: 1,
                cpu: { count: 8, loadRatio1m: 0.5 },
                memory: { usedRatio: 0.62 },
                capacity: {
                  state: 'available',
                  runningTaskCount: 1,
                  recommendedMaxParallelTasks: 4,
                  staleProcessCount: 0,
                },
              },
            }),
          }],
        };
      },
    };
    service = createWorkflowBoardService({
      stateGraph: sg,
      now: () => now++,
      makeId: (prefix) => `${prefix}-${++idSeq}`,
      projectRoot: tmpDir,
      proxyManager,
    });
    let active = service.createOrUpdateCard({
      id: 'card-active',
      title: 'Active workflow repair',
      projectId: 'agent-portal',
      domain: 'orchestration',
      columnId: 'in-progress',
      owner: 'orchestrator',
      acceptanceCriteria: ['Keep control response bounded'],
      entityRefs: { taskIds: ['task-active'] },
      actor: 'test',
    });
    service.createOrUpdateCard({
      id: 'card-done',
      title: 'Done with long history',
      projectId: 'agent-portal',
      domain: 'orchestration',
      columnId: 'done',
      owner: 'orchestrator',
      acceptanceCriteria: ['Already closed'],
      actor: 'test',
    });
    service.updateWorkItem({
      cardId: active.card.id,
      actor: 'test',
      checks: { audit: { status: 'fail', evidence: 'Needs compact response.' } },
    });

    let detailed = await service.getBoardProjectionWithRuntime({ projectId: 'agent-portal' });
    let compact = await service.getBoardProjectionWithRuntime({
      projectId: 'agent-portal',
      compact: true,
    });
    let compactColumn = compact.columns.find(column => column.id === 'in-progress');
    let compactCard = compact.cards.find(card => card.id === active.card.id);

    assert.equal(detailed.columns.find(column => column.id === 'done').cards.length, 1);
    assert.equal(compact.view, 'status');
    assert.equal(compact.board.mode, 'armed');
    assert.equal(compact.counts.done, 1);
    assert.equal(compactColumn.count, 1);
    assert.equal(compactColumn.cards, undefined);
    assert.deepEqual(compact.cards.map(card => card.id), [active.card.id]);
    assert.equal(compactCard.events, undefined);
    assert.deepEqual(compactCard.checks, { audit: 'fail' });
    assert.equal(compact.systemLoad.available, true);
    assert.equal(compact.systemLoad.capacity.runningTaskCount, 1);
    assert.equal(compact.systemLoad.capacity.recommendedMaxParallelTasks, 4);
    assert.equal(compact.activity.latestEventAt >= 1000, true);
  });

  it('imports missing durable work-item seeds during live projection without owning live status', async () => {
    service = createWorkflowBoardService({
      stateGraph: sg,
      now: () => now++,
      makeId: (prefix) => `${prefix}-${++idSeq}`,
      projectRoot: tmpDir,
    });
    writeWorkItemSeed(tmpDir, 'agent-portal', 'work-item-2026-06-18-agent-workflow-kanban-mvp.md', `
schema: agent-workflow-card/v1
id: work-item-2026-06-18-agent-workflow-kanban-mvp
project_id: agent-portal
title: Agent Workflow Kanban MVP
kind: work-item
priority: high
seed_board: agent-workflow-default
seed_column: in-progress
planning_status: accepted
runtime_source: stategraph-development-map
links:
  goal_ids: [goal-seed]
  chat_ids: [chat-seed]
  task_ids:
    - task-seed
`, 'Seed body must become card body only at import time.');

    let first = await service.getBoardProjectionWithRuntime({ projectId: 'agent-portal' });
    let seeded = first.cards.find(card => card.id === 'work-item-2026-06-18-agent-workflow-kanban-mvp');

    assert.ok(seeded);
    assert.equal(seeded.boardId, DEFAULT_WORKFLOW_BOARD_ID);
    assert.equal(seeded.columnId, 'in-progress');
    assert.equal(seeded.title, 'Agent Workflow Kanban MVP');
    assert.equal(seeded.entityRefs.goalId, 'goal-seed');
    assert.equal(seeded.entityRefs.chatId, 'chat-seed');
    assert.deepEqual(seeded.entityRefs.taskIds, ['task-seed']);
    assert.equal(seeded.metadata.markdownSeedColumn, 'in-progress');
    assert.equal(sg.get(`workflowCards/${seeded.id}`).columnId, 'in-progress');

    let moved = service.requestTransition({
      cardId: seeded.id,
      fromColumnId: 'in-progress',
      toColumnId: 'quality-audit',
      expectedVersion: seeded.version,
      actor: 'test',
      reason: 'Audit imported seed',
    });
    let second = await service.getBoardProjectionWithRuntime({ projectId: 'agent-portal' });
    let afterProjection = second.cards.find(card => card.id === seeded.id);
    let explicitImport = await service.importWorkflowWorkItems({
      projectId: 'agent-portal',
      actor: 'test',
    });

    assert.equal(moved.status, 'accepted');
    assert.equal(afterProjection.columnId, 'quality-audit');
    assert.equal(explicitImport.count, 0);
    assert.equal(explicitImport.skipped.length, 1);
    assert.equal(explicitImport.skipped[0].reason, 'already_imported');
    assert.equal(service.getCard(seeded.id).columnId, 'quality-audit');
  });

  it('projects unlinked workflow runtime tasks with history without promoting chat runs', () => {
    let linked = service.createOrUpdateCard({
      title: 'Linked runtime card',
      projectId: 'agent-portal',
      columnId: 'in-progress',
      entityRefs: { taskIds: ['task-linked'] },
      actor: 'test',
    });
    service.requestTransition({
      cardId: linked.card.id,
      fromColumnId: 'in-progress',
      toColumnId: 'quality-audit',
      expectedVersion: linked.card.version,
      actor: 'tester',
      reason: 'Audit linked work',
    });
    sg.set('tasks/task-linked', {
      status: 'running',
      prompt: 'Linked runtime task should not duplicate.',
      startedAt: 1100,
    }, 'test');
    sg.set('tasks/task-orphan', {
      kind: 'workflow-runtime-task',
      status: 'running',
      prompt: 'Runtime task without workflow card',
      workflowBoardId: 'agent-workflow-default',
      workflowCardId: 'missing-work-item',
      workflowRunId: 'runtime-run-missing-work-item',
      startedAt: 1200,
      eventCount: 2,
      events: [
        { type: 'message', text: 'started', ts: 1201 },
        { type: 'tool_use', name: 'edit', ts: 1202 },
      ],
    }, 'test');
    sg.set('tasks/chat-only-run', {
      status: 'running',
      prompt: 'Regular chat exchange should stay out of the workflow board.',
      chatId: 'chat-123',
      startedAt: 1300,
      events: [{ type: 'message', text: 'chat event', ts: 1301 }],
    }, 'test');

    let projection = service.getBoardProjection();
    let runtimeCard = projection.cards.find(card => card.id === 'runtime-task-orphan');

    assert.ok(runtimeCard);
    assert.equal(runtimeCard.kind, 'runtime-task');
    assert.equal(runtimeCard.columnId, 'in-progress');
    assert.equal(runtimeCard.metadata.runtimeOnly, true);
    assert.equal(runtimeCard.metadata.workflowCardId, 'missing-work-item');
    assert.deepEqual(runtimeCard.entityRefs.taskIds, ['task-orphan']);
    assert.equal(runtimeCard.events.length, 2);
    assert.equal(projection.cards.some(card => card.id === 'runtime-task-linked'), false);
    assert.equal(projection.cards.some(card => card.id === 'runtime-chat-only-run'), false);
    assert.equal(
      projection.cards.find(card => card.id === linked.card.id).events[0].status,
      'accepted',
    );
    assert.equal(projection.columns.find(column => column.id === 'in-progress').cards.some(card => card.id === runtimeCard.id), true);
  });

  it('orchestrates eligible work items with leases, chat links, and idempotent runs', async () => {
    let taskId = '11111111-1111-4111-8111-111111111111';
    let calls = [];
    let proxyManager = {
      projectRoot: tmpDir,
      requestFromChild: async (server, method, payload) => {
        calls.push({ server, method, payload });
        if (server === 'project-graph') {
          return { content: [{ type: 'text', text: JSON.stringify({ ok: true, skeleton: {}, files: [] }) }] };
        }
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
      resourceGroup: 'implementation',
      approvalMode: 'auto_edit',
      acceptanceCriteria: ['Runtime task is linked'],
      cwd: '/workspace/agent-portal',
      files: ['src/node/workflow-board-service.js'],
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
    assert.equal(first.card.columnId, 'in-progress');
    assert.equal(first.run.status, 'running');
    assert.deepEqual(first.run.taskIds, [taskId]);
    assert.equal(first.lease.leaseOwner, 'orchestrator');
    assert.equal(first.sideEffects[0].type, 'delegate_task');
    assert.equal(first.sideEffects[0].status, 'started');
    assert.equal(first.card.entityRefs.taskIds[0], taskId);
    assert.ok(first.card.entityRefs.chatId);
    assert.ok(first.card.entityRefs.goalId);
    assert.equal(second.idempotent, true);
    let delegateCalls = calls.filter(call => call.server === 'agent-pool' && call.payload.name === 'delegate_task');
    assert.equal(delegateCalls.length, 1);
    let delegateArgs = delegateCalls[0].payload.arguments;
    assert.match(delegateArgs.prompt, /Final response contract:/);
    assert.match(delegateArgs.prompt, /WORKFLOW_RESULT:/);
    assert.match(delegateArgs.prompt, /Board-first orchestration requirements:/);
    assert.match(delegateArgs.prompt, /workflow card and workflow run as the task source of truth/);
    assert.match(delegateArgs.prompt, /workflow_board` action `decompose`/);
    assert.match(delegateArgs.prompt, /Do not ask the user to approve workflow tool calls/);
    assert.match(delegateArgs.prompt, /mcp-agent-portal\.js" call workflow_board/);
    assert.ok(delegateArgs.prompt.includes(`--project ${JSON.stringify(tmpDir)}`));
    assert.match(delegateArgs.prompt, /user cancelled MCP tool call/);
    assert.match(delegateArgs.prompt, /empty_result/);
    assert.match(delegateArgs.prompt, /permission-blocked, approval-blocked/);
    assert.match(delegateArgs.prompt, /Move ready child cards through the workflow board/);
    assert.equal(delegateArgs.prompt.includes('Working directory: /workspace/agent-portal'), true);
    assert.match(delegateArgs.prompt, /File ownership scope:/);
    assert.equal(delegateArgs.cwd, '/workspace/agent-portal');
    assert.deepEqual(delegateArgs.files, ['src/node/workflow-board-service.js']);
    assert.equal(delegateArgs.resource_group, 'implementation');
    assert.equal(delegateArgs.approval_mode, 'auto_edit');
    assert.equal(sg.getChat(first.card.entityRefs.chatId)?.pendingTaskId, taskId);
    assert.equal(proxyManager.chatWsServer.taskChatMap.get(taskId), first.card.entityRefs.chatId);
    assert.equal(sg.get(`tasks/${taskId}`)?.kind, 'workflow-runtime-task');
    assert.equal(sg.get(`tasks/${taskId}`)?.workflowCardId, first.card.id);
    assert.equal(sg.get(`tasks/${taskId}`)?.workflowRunId, first.run.id);
  });

  it('auto-orchestrates accepted transitions into ready through the column agent pool', async () => {
    let taskId = '22222222-2222-4222-8222-222222222222';
    let calls = [];
    let proxyManager = {
      projectRoot: tmpDir,
      requestFromChild: async (server, method, payload) => {
        calls.push({ server, method, payload });
        if (server === 'project-graph') {
          return { content: [{ type: 'text', text: JSON.stringify({ ok: true, skeleton: {}, files: [] }) }] };
        }
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
      title: 'Ready auto start',
      body: 'Move through ready and start orchestration.',
      columnId: 'backlog',
      projectId: 'agent-portal',
      domain: 'backend',
      owner: 'orchestrator',
      assignedAgent: 'outside-stage-pool',
      acceptanceCriteria: ['Auto run is leased'],
      files: ['src/node/ready-auto-start.js'],
      actor: 'test',
    });

    let moved = await service.requestWorkflowTransition({
      cardId: created.card.id,
      fromColumnId: 'backlog',
      toColumnId: 'ready',
      expectedVersion: created.card.version,
      actor: 'human',
      reason: 'Ready for orchestrator pickup',
    });

    assert.equal(moved.status, 'accepted');
    assert.equal(moved.card.columnId, 'in-progress');
    assert.equal(moved.orchestration.ok, true);
    assert.equal(moved.orchestration.agent, 'orchestrator');
    assert.equal(moved.orchestration.result.run.status, 'running');
    assert.equal(moved.orchestration.result.lease.leaseOwner, 'orchestrator');
    assert.deepEqual(moved.orchestration.result.run.taskIds, [taskId]);
    let delegateCalls = calls.filter(call => call.server === 'agent-pool' && call.payload.name === 'delegate_task');
    assert.equal(delegateCalls.length, 1);
    let delegateArgs = delegateCalls[0].payload.arguments;
    assert.equal(delegateArgs.agent_slug, 'orchestrator');
    assert.deepEqual(delegateArgs.files, ['src/node/ready-auto-start.js']);
    assert.match(delegateArgs.prompt, /Preferred agent: orchestrator/);
    assert.doesNotMatch(delegateArgs.prompt, /outside-stage-pool/);
    assert.equal(sg.get(`tasks/${taskId}`).workflowCardId, created.card.id);
    assert.equal(service.listEvents({ cardId: created.card.id }).some(event => event.eventType === 'orchestration'), true);
  });

  it('blocks workflow orchestration when active file ownership scopes overlap', async () => {
    let calls = [];
    let proxyManager = {
      projectRoot: tmpDir,
      requestFromChild: async (_server, _method, payload) => {
        calls.push(payload);
        return { content: [{ type: 'text', text: 'Started task 33333333-3333-4333-8333-333333333333' }] };
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
    service.createOrUpdateCard({
      title: 'Parent implementation',
      columnId: 'in-progress',
      projectId: 'agent-portal',
      domain: 'backend',
      owner: 'l1-codex',
      acceptanceCriteria: ['Own workflow board service edits'],
      files: ['src/node/workflow-board-service.js'],
      actor: 'test',
    });
    let child = service.createOrUpdateCard({
      title: 'Child overlapping implementation',
      columnId: 'backlog',
      projectId: 'agent-portal',
      domain: 'backend',
      owner: 'orchestrator',
      acceptanceCriteria: ['Should wait for file ownership'],
      files: ['src/node'],
      actor: 'test',
    });

    let moved = await service.requestWorkflowTransition({
      cardId: child.card.id,
      fromColumnId: 'backlog',
      toColumnId: 'ready',
      expectedVersion: child.card.version,
      actor: 'orchestrator',
      reason: 'Ready for orchestrator pickup',
    });

    assert.equal(moved.status, 'accepted');
    assert.equal(moved.card.columnId, 'ready');
    assert.equal(moved.orchestration.ok, false);
    assert.equal(moved.orchestration.skipped, true);
    assert.match(moved.orchestration.reason, /file scope overlaps active card/);
    assert.equal(calls.length, 0);
    assert.deepEqual(Object.keys(sg.get('workflowRuns') ?? {}), []);
    await assert.rejects(
      service.orchestrateWorkItem({
        cardId: child.card.id,
        actor: 'orchestrator',
      }),
      /file scope overlaps active card/,
    );
  });

  it('adds required proof marker instructions when a workflow card names one', async () => {
    let taskId = '66666666-6666-4666-8666-666666666666';
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
      title: 'Release authorization packet',
      body: 'Prepare the release packet. Final proof marker must be RELEASE_AUTH_PACKET:*.',
      columnId: 'ready',
      projectId: 'symbiote-workspace',
      domain: 'release',
      owner: 'release-manager',
      assignedAgent: 'release-manager',
      acceptanceCriteria: ['The packet ends with a release authorization proof marker.'],
      actor: 'test',
    });

    await service.orchestrateWorkItem({
      cardId: created.card.id,
      actor: 'workflow-board',
    });

    assert.equal(calls.length, 1);
    assert.match(calls[0].arguments.prompt, /Required proof marker lines:/);
    assert.match(calls[0].arguments.prompt, /`RELEASE_AUTH_PACKET:PASS` or `RELEASE_AUTH_PACKET:FAIL`/);
    assert.match(calls[0].arguments.prompt, /before any `WORKFLOW_RESULT:/);
  });

  it('adds required proof marker instructions for custom workflow markers', async () => {
    let taskId = '77777777-7777-4777-8777-777777777777';
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
      title: 'Repair workflow-kanban closure audit',
      body: 'Final marker: WORKFLOW_KANBAN_MVP_CLOSURE_AUDIT:PASS or WORKFLOW_KANBAN_MVP_CLOSURE_AUDIT:FAIL.',
      columnId: 'ready',
      projectId: 'agent-portal',
      domain: 'orchestration',
      owner: 'orchestrator',
      assignedAgent: 'orchestrator',
      acceptanceCriteria: ['The final response includes the custom workflow-kanban proof marker.'],
      actor: 'test',
    });

    await service.orchestrateWorkItem({
      cardId: created.card.id,
      actor: 'workflow-board',
    });

    assert.equal(calls.length, 1);
    assert.match(calls[0].arguments.prompt, /Required proof marker lines:/);
    assert.match(
      calls[0].arguments.prompt,
      /`WORKFLOW_KANBAN_MVP_CLOSURE_AUDIT:PASS` or `WORKFLOW_KANBAN_MVP_CLOSURE_AUDIT:FAIL`/,
    );
    assert.doesNotMatch(calls[0].arguments.prompt, /`WORKFLOW_RESULT:PASS`/);
  });

  it('reconciles completed workflow runtime tasks into audit-ready board state', async () => {
    let taskId = '44444444-4444-4444-8444-444444444444';
    let proxyManager = {
      projectRoot: tmpDir,
      requestFromChild: async (_server, _method, payload) => {
        if (payload.name === 'list_tasks') return { content: [{ type: 'text', text: '[]' }] };
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
      title: 'Runtime completion sync',
      body: 'Completed task should release workflow state.',
      columnId: 'ready',
      projectId: 'agent-portal',
      domain: 'backend',
      owner: 'orchestrator',
      assignedAgent: 'orchestrator',
      acceptanceCriteria: ['Runtime completion updates the board'],
      actor: 'test',
    });
    let started = await service.orchestrateWorkItem({
      cardId: created.card.id,
      actor: 'orchestrator',
    });

    assert.equal(started.card.columnId, 'in-progress');
    assert.ok(sg.get(`workflowLeases/${created.card.id}`));

    sg.merge(`tasks/${taskId}`, {
      status: 'done',
      updatedAt: 9000,
      completedAt: 9000,
    }, 'test');

    let projection = await service.getBoardProjectionWithRuntime({ projectId: 'agent-portal' });
    let card = projection.cards.find(item => item.id === created.card.id);
    let run = card.runs.find(item => item.id === started.run.id);

    assert.equal(card.columnId, 'quality-audit');
    assert.equal(run.status, 'completed');
    assert.equal(run.completedAt, 9000);
    assert.equal(card.lease, null);
    assert.equal(sg.get(`workflowLeases/${created.card.id}`), undefined);
    assert.equal(service.listEvents({ cardId: created.card.id }).some(event => event.eventType === 'runtime'), true);
  });

  it('creates a stage child chat when column routing chooses a different agent', async () => {
    let taskId = '55555555-5555-4555-8555-555555555555';
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
    let rootChat = sg.createChat({
      name: 'Workflow root',
      adapter: 'pool',
      agent: 'orchestrator',
      projectId: 'agent-portal',
    }, 'test');
    let rootGoal = sg.createChatGoal({
      chatId: rootChat.id,
      projectId: 'agent-portal',
      title: 'Root goal',
    }, 'test');
    let created = service.createOrUpdateCard({
      title: 'Stage audit routing',
      body: 'Audit stage must use the audit agent.',
      columnId: 'quality-audit',
      projectId: 'agent-portal',
      domain: 'backend',
      owner: 'orchestrator',
      assignedAgent: 'orchestrator',
      acceptanceCriteria: ['Stage agent routing works'],
      entityRefs: { chatId: rootChat.id, goalId: rootGoal.id },
      actor: 'test',
    });

    let result = await service.orchestrateWorkItem({
      cardId: created.card.id,
      actor: 'workflow-board',
      agent: 'qa-engineer',
      mode: 'manual',
    });
    let childChat = sg.getChat(result.card.entityRefs.chatId);
    let childGoal = sg.getChatGoal(result.card.entityRefs.goalId);

    assert.equal(result.ok, true);
    assert.notEqual(childChat.id, rootChat.id);
    assert.equal(childChat.parentChatId, rootChat.id);
    assert.equal(childChat.agent, 'qa-engineer');
    assert.equal(childGoal.chatId, childChat.id);
    assert.equal(calls[0].arguments.chat_id, childChat.id);
    assert.equal(calls[0].arguments.agent_slug, 'qa-engineer');
    assert.match(calls[0].arguments.prompt, /Preferred agent: qa-engineer/);
    assert.equal(sg.get(`tasks/${taskId}`).chatId, childChat.id);
    assert.equal(sg.get(`tasks/${taskId}`).goalId, childGoal.id);
  });

  it('persists board automation policy and applies global pause/resume controls with audit events', async () => {
    let created = service.createOrUpdateCard({
      title: 'Board controlled run',
      body: 'Run should follow board automation controls.',
      columnId: 'ready',
      projectId: 'agent-portal',
      domain: 'backend',
      owner: 'orchestrator',
      acceptanceCriteria: ['Board controls are audited'],
      actor: 'test',
    });
    let policy = service.updateWorkflowBoard({
      patch: {
        mode: 'manual',
        automation: {
          pickup: 'manual',
          globalParallelLimit: 1,
          fallbackAgents: ['orchestrator', 'reviewer'],
        },
      },
      actor: 'test',
      reason: 'Switch to manual board control',
    });
    let run = await service.orchestrateWorkItem({
      cardId: created.card.id,
      actor: 'test',
      mode: 'manual',
      delegate: false,
    });
    let paused = await service.controlWorkflowBoard({
      action: 'pause',
      actor: 'test',
      reason: 'Pause all active runs',
    });
    let resumed = await service.controlWorkflowBoard({
      action: 'resume',
      actor: 'test',
      reason: 'Resume automation',
    });
    let boardEvents = service.listEvents({ eventTypes: ['board_control', 'board_update'] });

    assert.equal(policy.board.mode, 'manual');
    assert.equal(policy.board.automation.pickup, 'manual');
    assert.equal(policy.board.automation.globalParallelLimit, 1);
    assert.deepEqual(policy.board.automation.fallbackAgents, ['orchestrator', 'reviewer']);
    assert.equal(policy.event.eventType, 'board_update');
    assert.equal(run.run.status, 'requested');
    assert.equal(paused.board.mode, 'paused');
    assert.deepEqual(paused.affectedCardIds, [created.card.id]);
    assert.equal(service.getCard(created.card.id).recoveryFlags.includes('blocked'), true);
    assert.equal(sg.get(`workflowRuns/${run.run.id}`).status, 'paused');
    assert.equal(resumed.board.mode, 'armed');
    assert.deepEqual(resumed.affectedCardIds, [created.card.id]);
    assert.equal(
      service.getBoardProjection().cards
        .find(card => card.id === created.card.id)
        .runs
        .some(item => item.status === 'recovering'),
      true,
    );
    assert.deepEqual(boardEvents.map(event => event.eventType), ['board_update', 'board_control', 'board_control']);
    assert.equal(service.getBoardProjection().events.some(event => event.eventType === 'board_control'), true);
  });

  it('does not create board automation history for no-op updates', () => {
    let before = service.getBoardProjection().board;
    let noOp = service.updateWorkflowBoard({
      patch: {},
      actor: 'test',
      reason: 'No-op update should not pollute history',
    });
    let after = service.getBoardProjection().board;

    assert.equal(noOp.ok, true);
    assert.equal(noOp.noop, true);
    assert.equal(noOp.event, null);
    assert.equal(after.version, before.version);
    assert.deepEqual(service.listEvents({ eventTypes: ['board_update'] }), []);
  });

  it('honors board pickup mode before auto-orchestrating ready cards', async () => {
    let calls = [];
    let proxyManager = {
      projectRoot: tmpDir,
      requestFromChild: async (_server, _method, payload) => {
        calls.push(payload);
        return { content: [{ type: 'text', text: 'Started task 33333333-3333-4333-8333-333333333333' }] };
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
      title: 'Manual pickup ready card',
      columnId: 'backlog',
      projectId: 'agent-portal',
      domain: 'backend',
      owner: 'orchestrator',
      acceptanceCriteria: ['No automatic pickup while board is manual'],
      actor: 'test',
    });
    service.updateWorkflowBoard({
      patch: { mode: 'manual', automation: { pickup: 'manual' } },
      actor: 'test',
    });

    let moved = await service.requestWorkflowTransition({
      cardId: created.card.id,
      fromColumnId: 'backlog',
      toColumnId: 'ready',
      expectedVersion: created.card.version,
      actor: 'human',
      reason: 'Ready but manual board pickup',
    });

    assert.equal(moved.status, 'accepted');
    assert.equal(moved.orchestration.skipped, true);
    assert.match(moved.orchestration.reason, /board pickup is manual/);
    assert.equal(calls.length, 0);
  });

  it('deletes workflow cards from the board without deleting transition history', () => {
    let created = service.createOrUpdateCard({
      title: 'Remove obsolete work item',
      columnId: 'ideas',
      projectId: 'agent-portal',
      domain: 'backend',
      actor: 'test',
    });
    let moved = service.requestTransition({
      cardId: created.card.id,
      fromColumnId: 'ideas',
      toColumnId: 'backlog',
      expectedVersion: created.card.version,
      actor: 'test',
      reason: 'Classify before deletion',
    });

    assert.equal(moved.status, 'accepted');
    let deleted = service.deleteWorkItem({
      cardId: created.card.id,
      expectedVersion: moved.card.version,
      actor: 'test',
    });

    assert.equal(deleted.deleted, true);
    assert.throws(() => service.getCard(created.card.id), /not found/);
    assert.equal(service.listEvents({ cardId: created.card.id }).length, 1);
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

      let repeated = await importingService.importWorkflowWorkItems({
        projectId: 'agent-portal',
        actor: 'test',
      });

      assert.equal(repeated.count, 0);
      assert.equal(repeated.skipped[0].cardId, 'work-item-md');
      assert.equal(importingService.getCard('work-item-md').columnId, 'ready');
    } finally {
      await secondGraph.flushChatWrites();
      secondGraph.flush();
    }
  });
});
