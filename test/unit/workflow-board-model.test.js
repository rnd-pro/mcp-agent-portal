import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  DEFAULT_WORKFLOW_BOARD_ID,
  DEFAULT_WORKFLOW_COLUMN_IDS,
  RECOVERY_FLAGS,
  WORKFLOW_CARD_LIFECYCLE_STATES,
  WORKFLOW_ESCALATION_KINDS,
  classifyWorkflowGraph,
  createDefaultWorkflowBoard,
  isWorkflowLifecycleTransitionAllowed,
  migrateWorkflowBoardToV2,
  migrateWorkflowCardToV2,
  normalizeWorkflowCardInput,
  normalizeWorkflowDependsOn,
  normalizeWorkflowEscalation,
  normalizeWorkflowLifecycle,
  validateWorkflowTransitionGraph,
} from '../../src/iso/workflow-board.js';
import { StateGraph } from '../../src/node/state-graph.js';
import { createWorkflowBoardService } from '../../src/node/workflow-board-service.js';
import { humanPrincipal } from '../../src/node/server/principal.js';

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
  let oldMemoryRoot;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'workflow-board-model-'));
    oldMemoryRoot = process.env.AGENT_PORTAL_MEMORY_ROOT;
    process.env.AGENT_PORTAL_MEMORY_ROOT = path.join(tmpDir, '.agent-portal');
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
      // These tests drive the service in-process as the trusted local human (board-author caps),
      // so the ~hundreds of existing mutating assertions keep passing through the S6 gate. The
      // harness sets the principal once here; production wiring never sets defaultPrincipal.
      defaultPrincipal: humanPrincipal({ transport: { channel: 'loopback' }, label: 'local-human' }),
    });
  });

  afterEach(async () => {
    await sg.flushChatWrites();
    sg.flush();
    if (oldMemoryRoot === undefined) delete process.env.AGENT_PORTAL_MEMORY_ROOT;
    else process.env.AGENT_PORTAL_MEMORY_ROOT = oldMemoryRoot;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('self-heals a default column automation gap (a lost action) on a stale policy version', () => {
    let board = service.ensureBoard();
    // Simulate a clobbered/older-normalizer snapshot: the quality-audit column lost its action, and the
    // board still carries an older policy version so the fill-only refresh is allowed to run again.
    let columns = board.columns.map(column => column.id === 'quality-audit'
      ? { ...column, automation: { ...column.automation, action: undefined } }
      : column);
    sg.commit([{ op: 'set', path: `workflowBoards/${board.id}`, value: {
      ...board,
      columns,
      metadata: { ...board.metadata, defaultPolicyVersion: 1 },
    } }], 'test:corrupt-column');
    assert.equal(
      sg.get(`workflowBoards/${board.id}`).columns.find(c => c.id === 'quality-audit')?.automation?.action,
      undefined,
      'precondition: the stored column has no action',
    );

    let healed = service.ensureBoard();
    assert.equal(
      healed.columns.find(c => c.id === 'quality-audit')?.automation?.action,
      'audit',
      'the fill-only refresh restores the default action without clobbering customizations',
    );
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
    assert.equal(board.schema, 'workflow-board/v2');
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
    assert.equal(card.schema, 'workflow-card/v2');
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

  it('fill-only refreshes a default board: preserves customizations, adds missing defaults (inv 17, 19)', () => {
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
    // Fill-only (inv 17): the customized mode/agent survive the policy-version bump; they are NOT
    // reset to the default `auto`/`orchestrator`. Only missing default keys (agents, parallelLimit)
    // are filled in.
    assert.equal(readyColumn.automation.mode, 'gated');
    assert.equal(readyColumn.automation.agent, 'legacy-agent');
    assert.deepEqual(readyColumn.automation.agents, ['orchestrator']);
    assert.equal(readyColumn.automation.parallelLimit, 4);
    // inv 19: a missing default transition (the deleted backlog->ready) is still re-added.
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

  it('fill-only refresh preserves a customized transition gate while adding a missing default (inv 17)', () => {
    let oldBoard = createDefaultWorkflowBoard({ now: 123 });
    // Customize an existing default transition's gates (a user-authored stricter gate) and delete a
    // different default transition entirely so the refresh has a missing default to re-add.
    oldBoard.transitions = oldBoard.transitions
      .filter(transition => !(transition.from === 'backlog' && transition.to === 'ready'))
      .map(transition => (
        transition.from === 'quality-audit' && transition.to === 'commit-publish'
          ? { ...transition, gate: 'custom_release_gate', gates: ['custom_release_gate'] }
          : transition
      ));
    sg.commit([{ op: 'set', path: `workflowBoards/${DEFAULT_WORKFLOW_BOARD_ID}`, value: oldBoard }], 'seed');

    let board = service.getBoardProjection().board;
    let customized = board.transitions.find(t => t.from === 'quality-audit' && t.to === 'commit-publish');
    assert.deepEqual(customized.gates, ['custom_release_gate'], 'customized transition gates must survive the refresh');
    assert.ok(
      board.transitions.find(t => t.from === 'backlog' && t.to === 'ready'),
      'missing default transition must be re-added (inv 19)',
    );
  });

  it('runs a one-time forward schema-v2 migration over persisted boards and cards (AD-8, inv 16)', () => {
    // Seed v1-shaped board + card directly: pre-v2 schema strings, no lifecycle/dependsOn on the card.
    // No `workflowSchema` marker is seeded, so the one-time sweep must run on first access.
    let v1Board = {
      ...createDefaultWorkflowBoard({ now: 123 }),
      schema: 'workflow-board/v1',
    };
    // A genuine v1-shaped card: a fully-normalized card with the v2-only fields stripped and the
    // schema downgraded, so it differs from v2 exactly where the migrator fills (lifecycle/dependsOn).
    let normalizedCard = normalizeWorkflowCardInput(
      { title: 'Legacy card', boardId: DEFAULT_WORKFLOW_BOARD_ID, columnId: 'ideas' },
      { id: 'card-v1', now: 100 },
    );
    let { lifecycle, dependsOn, ...rest } = normalizedCard;
    let v1Card = { ...rest, schema: 'workflow-card/v1' };
    sg.commit([
      { op: 'set', path: `workflowBoards/${DEFAULT_WORKFLOW_BOARD_ID}`, value: v1Board },
      { op: 'set', path: 'workflowCards/card-v1', value: v1Card },
    ], 'seed');
    assert.equal(sg.get('workflowSchema'), undefined);

    // Any board entry point triggers the one-time sweep.
    service.getBoardProjection();

    let migratedBoard = sg.get(`workflowBoards/${DEFAULT_WORKFLOW_BOARD_ID}`);
    let migratedCard = sg.get('workflowCards/card-v1');
    assert.equal(migratedBoard.schema, 'workflow-board/v2');
    assert.equal(migratedCard.schema, 'workflow-card/v2');
    assert.equal(migratedCard.lifecycle, 'idle');
    assert.deepEqual(migratedCard.dependsOn, []);
    assert.deepEqual(sg.get('workflowSchema'), { version: 2 });

    // Idempotency: with the migration settled (marker set, board policy refreshed), a further
    // access must not re-commit. Capture version after a warm-up access, then assert the next
    // access leaves it untouched — proving the migration is a steady-state no-op.
    service.getBoardProjection();
    let versionBefore = sg.version;
    service.getBoardProjection();
    assert.equal(sg.version, versionBefore, 'steady-state access must not re-commit the migration');

    // No read-time schema branch: a migrated card reads identically on first and second access.
    let first = service.getCard('card-v1');
    let second = service.getCard('card-v1');
    assert.deepEqual(first, second);
    assert.equal(first.schema, 'workflow-card/v2');
  });

  it('a fresh service instance treats an already-migrated store as a marker no-op (durable guard)', () => {
    // First instance migrates and sets the durable marker.
    let legacy = normalizeWorkflowCardInput(
      { title: 'Legacy', boardId: DEFAULT_WORKFLOW_BOARD_ID, columnId: 'ideas' },
      { id: 'card-legacy', now: 1 },
    );
    let { lifecycle: _l, dependsOn: _d, ...legacyRest } = legacy;
    sg.commit([{
      op: 'set',
      path: 'workflowCards/card-legacy',
      value: { ...legacyRest, schema: 'workflow-card/v1' },
    }], 'seed');
    service.getBoardProjection();
    assert.deepEqual(sg.get('workflowSchema'), { version: 2 });

    // A second, freshly-constructed service (per-request seam) shares the StateGraph but starts with
    // its own per-instance flag. The DURABLE marker — not the flag — must keep it a no-op.
    let versionBefore = sg.version;
    let freshService = createWorkflowBoardService({
      stateGraph: sg,
      now: () => now++,
      makeId: (prefix) => `${prefix}-${++idSeq}`,
      projectRoot: tmpDir,
      defaultPrincipal: humanPrincipal({ transport: { channel: 'loopback' }, label: 'local-human' }),
    });
    freshService.getBoardProjection();
    assert.equal(sg.version, versionBefore, 'a fresh instance must not re-migrate when the marker is current');
  });

  it('freezes the projection-v2 lifecycle / dependsOn / queue / telemetry shape', async () => {
    let blocked = service.createOrUpdateCard({
      title: 'Blocked on upstream',
      columnId: 'ideas',
      projectId: 'agent-portal',
      domain: 'backend',
      lifecycle: 'blocked',
      dependsOn: ['card-upstream'],
      actor: 'test',
    });
    service.createOrUpdateCard({
      title: 'Plain idle card',
      columnId: 'ideas',
      projectId: 'agent-portal',
      domain: 'backend',
      actor: 'test',
    });
    // A standalone runtime task (not linked to any persisted card) synthesizes a runtime card.
    sg.commit([{
      op: 'set',
      path: 'tasks/task-rt-projection',
      value: { id: 'task-rt-projection', kind: 'workflow-task', status: 'running', projectId: 'agent-portal', updatedAt: 1500 },
    }], 'seed');

    let projection = await service.getBoardProjectionWithRuntime({ projectId: 'agent-portal' });

    assert.equal(projection.schema, 'workflow-board-projection/v2');

    // Board-level queue + telemetry: frozen shape, dependency-derived counts are real, rest are placeholders.
    assert.deepEqual(projection.queue, {
      depth: 0,
      oldestEnqueuedAt: null,
      perGroupDepth: {},
      blockedOnDependencyCount: 1,
    });
    assert.deepEqual(projection.telemetry, {
      queueDepth: 0,
      oldestEnqueuedAt: null,
      blockedOnDependencyCount: 1,
      admissions: 0,
      admissionFailures: 0,
      drains: 0,
    });

    // Every projected card carries lifecycle / dependsOn / a five-key null-default queue slot.
    let queueKeys = ['enqueuedAt', 'queueEpoch', 'admissionId', 'priority', 'position'];
    for (let card of projection.cards) {
      assert.ok(WORKFLOW_CARD_LIFECYCLE_STATES.includes(card.lifecycle), `lifecycle ${card.lifecycle}`);
      assert.ok(Array.isArray(card.dependsOn), 'dependsOn is an array');
      assert.deepEqual(Object.keys(card.queue).sort(), [...queueKeys].sort());
      for (let key of queueKeys) assert.equal(card.queue[key], null);
    }
    // The same per-card shape is present inside columns[].cards.
    for (let column of projection.columns) {
      for (let card of column.cards) {
        assert.ok(WORKFLOW_CARD_LIFECYCLE_STATES.includes(card.lifecycle));
        assert.deepEqual(Object.keys(card.queue).sort(), [...queueKeys].sort());
      }
    }

    let blockedCard = projection.cards.find(card => card.id === blocked.card.id);
    assert.equal(blockedCard.lifecycle, 'blocked');
    assert.equal(blockedCard.dependsOn[0].cardId, 'card-upstream');

    // Runtime-synthesized cards carry the frozen v2 fields with safe defaults.
    let runtimeCard = projection.cards.find(card => card.id.startsWith('runtime-'));
    assert.ok(runtimeCard, 'expected a runtime-synthesized card');
    assert.equal(runtimeCard.lifecycle, 'idle');
    assert.deepEqual(runtimeCard.dependsOn, []);
    assert.deepEqual(runtimeCard.queue, {
      enqueuedAt: null,
      queueEpoch: null,
      admissionId: null,
      priority: null,
      position: null,
    });
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

    // The unknown column is now rejected by the service's board-driven column check (the iso card
    // normalizer is board-agnostic after S5 carry-over), and the decomposition is still atomic.
    assert.throws(
      () => service.decomposeWorkItem({
        cardId: parent.card.id,
        actor: 'test',
        childItems: [
          { id: 'child-valid', title: 'Valid child', acceptanceCriteria: ['Valid'] },
          { id: 'child-invalid', title: 'Invalid child', columnId: 'unknown-column' },
        ],
      }),
      /Unknown workflow column "unknown-column"/,
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
      defaultPrincipal: humanPrincipal({ transport: { channel: 'loopback' }, label: 'local-human' }),
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
    sg.commit([
      {
        op: 'set',
        path: 'workflowRuns/run-done-stale',
        value: {
          id: 'run-done-stale',
          boardId: DEFAULT_WORKFLOW_BOARD_ID,
          cardId: 'card-done',
          status: 'running',
          taskIds: [],
          startedAt: 900,
          updatedAt: 901,
        },
      },
      {
        op: 'set',
        path: 'workflowLeases/card-done',
        value: {
          cardId: 'card-done',
          runId: 'run-done-stale',
          leaseOwner: 'orchestrator',
          leaseExpiresAt: 2000,
        },
      },
    ], 'test');
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
    assert.equal(compact.load.activeCardCount, 1);
    assert.equal(compact.load.activeRunCount, 0);
    assert.equal(compact.load.activeLeaseCount, 0);
    assert.equal(compactCard.events, undefined);
    assert.deepEqual(compactCard.checks, { audit: 'fail' });
    assert.equal(compact.systemLoad.available, true);
    assert.equal(compact.systemLoad.capacity.runningTaskCount, 1);
    assert.equal(compact.systemLoad.capacity.recommendedMaxParallelTasks, 4);
    assert.equal(compact.activity.latestEventAt >= 1000, true);
  });

  it('uses orchestrator context system load when task runtime omits capacity data', async () => {
    let calls = [];
    let proxyManager = {
      requestFromChild: async (_server, _method, payload) => {
        calls.push(payload.name);
        if (payload.name === 'list_tasks') {
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
                }],
              }),
            }],
          };
        }
        throw new Error(`unexpected tool ${payload.name}`);
      },
    };
    service = createWorkflowBoardService({
      stateGraph: sg,
      now: () => now++,
      makeId: (prefix) => `${prefix}-${++idSeq}`,
      projectRoot: tmpDir,
      proxyManager,
      defaultPrincipal: humanPrincipal({ transport: { channel: 'loopback' }, label: 'local-human' }),
    });
    service.createOrUpdateCard({
      id: 'card-active',
      title: 'Active workflow repair',
      projectId: 'agent-portal',
      domain: 'orchestration',
      columnId: 'in-progress',
      owner: 'orchestrator',
      acceptanceCriteria: ['Expose system load'],
      entityRefs: { taskIds: ['task-active'] },
      actor: 'test',
    });

    let compact = await service.getBoardProjectionWithRuntime({
      projectId: 'agent-portal',
      compact: true,
    }, {
      systemLoad: {
        agents: {
          total: 5,
          ours: 2,
          external: 1,
        },
        cpu: { count: 8, loadRatio1m: 0.4 },
        memory: { usedRatio: 0.71 },
        capacity: {
          state: 'available',
          runningTaskCount: 1,
          recommendedMaxParallelTasks: 3,
        },
      },
    });

    assert.deepEqual(calls, ['list_tasks']);
    assert.equal(compact.systemLoad.available, true);
    assert.equal(compact.systemLoad.capacity.state, 'available');
    assert.equal(compact.systemLoad.capacity.runningTaskCount, 1);
    assert.equal(compact.systemLoad.capacity.recommendedMaxParallelTasks, 3);
    assert.equal(compact.systemLoad.cpu.loadRatio1m, 0.4);
    assert.equal(compact.systemLoad.process.trackedChildren, 2);
  });

  it('keeps live projection read-only unless markdown seed import is explicit', async () => {
    service = createWorkflowBoardService({
      stateGraph: sg,
      now: () => now++,
      makeId: (prefix) => `${prefix}-${++idSeq}`,
      projectRoot: tmpDir,
      defaultPrincipal: humanPrincipal({ transport: { channel: 'loopback' }, label: 'local-human' }),
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

    let readOnly = await service.getBoardProjectionWithRuntime({ projectId: 'agent-portal' });
    assert.equal(readOnly.cards.some(card => card.id === 'work-item-2026-06-18-agent-workflow-kanban-mvp'), false);
    assert.equal(Object.keys(sg.get('workflowCards') ?? {}).length, 0);

    let first = await service.getBoardProjectionWithRuntime({
      projectId: 'agent-portal',
      importMarkdown: true,
    });
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
      defaultPrincipal: humanPrincipal({ transport: { channel: 'loopback' }, label: 'local-human' }),
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
      defaultPrincipal: humanPrincipal({ transport: { channel: 'loopback' }, label: 'local-human' }),
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
    // Reroute (WS-B1): the transition into the auto column ENQUEUED the card and INLINE-DRAINED it —
    // the card was admitted through the queue, not orchestrated directly. The auto trigger now stamps
    // a deterministic admissionId, threads it to the delegate, and the queue entry is consumed once
    // `running` is durable (inv 31: no live entry remains for an admitted card).
    assert.equal(moved.orchestration.enqueued, true);
    assert.ok(moved.orchestration.admissionId?.startsWith('adm-'));
    assert.equal(service.getCard(created.card.id).lifecycle, 'running');
    assert.equal(Object.values(sg.get('workflowQueueEntries') || {}).filter(e => e.cardId === created.card.id).length, 0);
    let delegateCalls = calls.filter(call => call.server === 'agent-pool' && call.payload.name === 'delegate_task');
    assert.equal(delegateCalls.length, 1);
    let delegateArgs = delegateCalls[0].payload.arguments;
    assert.equal(delegateArgs.agent_slug, 'orchestrator');
    assert.equal(delegateArgs.admission_id, moved.orchestration.admissionId, 'admissionId threaded to the delegate (D1.1)');
    assert.equal(delegateArgs.verified_slug, 'orchestrator', 'D2.1 parent-side slug correlation passed through');
    assert.deepEqual(delegateArgs.files, ['src/node/ready-auto-start.js']);
    assert.match(delegateArgs.prompt, /Preferred agent: orchestrator/);
    assert.doesNotMatch(delegateArgs.prompt, /outside-stage-pool/);
    assert.equal(sg.get(`tasks/${taskId}`).workflowCardId, created.card.id);
    assert.equal(service.listEvents({ cardId: created.card.id }).some(event => event.eventType === 'orchestration'), true);
  });

  it('keeps failed delegation out of active workflow runs', async () => {
    let calls = [];
    let proxyManager = {
      projectRoot: tmpDir,
      requestFromChild: async (server, method, payload) => {
        calls.push({ server, method, payload });
        if (server === 'project-graph') {
          return { content: [{ type: 'text', text: JSON.stringify({ ok: true, skeleton: {}, files: [] }) }] };
        }
        return {
          isError: true,
          content: [{ type: 'text', text: 'Resource group `audit` not found.' }],
        };
      },
      chatWsServer: { taskChatMap: new Map() },
    };
    service = createWorkflowBoardService({
      stateGraph: sg,
      now: () => now++,
      makeId: (prefix) => `${prefix}-${++idSeq}`,
      projectRoot: tmpDir,
      proxyManager,
      defaultPrincipal: humanPrincipal({ transport: { channel: 'loopback' }, label: 'local-human' }),
    });
    let created = service.createOrUpdateCard({
      title: 'Ready invalid resource group',
      body: 'Should not get stuck in progress when delegation fails.',
      columnId: 'backlog',
      projectId: 'agent-portal',
      domain: 'release',
      owner: 'orchestrator',
      assignedAgent: 'release-manager',
      resourceGroup: 'audit',
      acceptanceCriteria: ['Delegate failure is recoverable'],
      files: ['package.json'],
      actor: 'test',
    });

    let moved = await service.requestWorkflowTransition({
      cardId: created.card.id,
      fromColumnId: 'backlog',
      toColumnId: 'ready',
      expectedVersion: created.card.version,
      actor: 'orchestrator',
      reason: 'Ready for invalid resource group regression',
    });
    let run = Object.values(sg.get('workflowRuns') || {}).find(item => item.cardId === created.card.id);
    let event = service.listEvents({ cardId: created.card.id })
      .find(item => item.eventType === 'orchestration');

    assert.equal(moved.status, 'accepted');
    assert.equal(moved.card.columnId, 'ready');
    assert.equal(moved.orchestration.ok, true);
    assert.equal(moved.orchestration.result.run.status, 'failed');
    assert.equal(run.status, 'failed');
    assert.deepEqual(run.taskIds, []);
    assert.equal(sg.get(`workflowLeases/${created.card.id}`), undefined);
    assert.equal(service.getCard(created.card.id).recoveryFlags.includes('needs_audit'), true);
    assert.equal(event.fromColumnId, 'ready');
    assert.equal(event.toColumnId, 'ready');
    assert.equal(event.sideEffects[0].status, 'failed');
    assert.match(event.sideEffects[0].error, /Resource group `audit` not found/);
    // One delegate attempt, then one idempotent release_slot (F-SCH-2): the hard-failure branch
    // releases the admission slot before deleting the admission record so a slot reserved before a
    // non-capacity spawn failure is never orphaned.
    let agentPoolCalls = calls.filter(call => call.server === 'agent-pool');
    assert.equal(agentPoolCalls.length, 2);
    assert.equal(agentPoolCalls[1].payload?.name, 'release_slot');
  });

  it('does not orchestrate blocked ready cards through auto or direct paths', async () => {
    let calls = [];
    let proxyManager = {
      projectRoot: tmpDir,
      requestFromChild: async (_server, _method, payload) => {
        calls.push(payload);
        return { content: [{ type: 'text', text: 'Started task 88888888-8888-4888-8888-888888888888' }] };
      },
      chatWsServer: { taskChatMap: new Map() },
    };
    service = createWorkflowBoardService({
      stateGraph: sg,
      now: () => now++,
      makeId: (prefix) => `${prefix}-${++idSeq}`,
      projectRoot: tmpDir,
      proxyManager,
      defaultPrincipal: humanPrincipal({ transport: { channel: 'loopback' }, label: 'local-human' }),
    });
    let created = service.createOrUpdateCard({
      title: 'Blocked ready card',
      columnId: 'backlog',
      projectId: 'agent-portal',
      domain: 'orchestration',
      owner: 'orchestrator',
      acceptanceCriteria: ['Must not bypass blockers'],
      blockers: ['Waiting for audit owner'],
      actor: 'test',
    });

    let moved = await service.requestWorkflowTransition({
      cardId: created.card.id,
      fromColumnId: 'backlog',
      toColumnId: 'ready',
      expectedVersion: created.card.version,
      actor: 'test',
      reason: 'Ready but blocked',
    });

    assert.equal(moved.status, 'accepted');
    assert.equal(moved.card.columnId, 'ready');
    assert.equal(moved.orchestration.ok, false);
    assert.match(moved.orchestration.reason, /active blocker/);
    assert.equal(calls.length, 0);
    assert.deepEqual(Object.keys(sg.get('workflowRuns') ?? {}), []);
    await assert.rejects(
      service.orchestrateWorkItem({
        cardId: created.card.id,
        actor: 'test',
      }),
      /active blocker/,
    );
    assert.deepEqual(Object.keys(sg.get('workflowRuns') ?? {}), []);
    assert.equal(sg.get(`workflowLeases/${created.card.id}`), undefined);
  });

  it('rejects stale direct orchestration before creating a run or lease', async () => {
    let created = service.createOrUpdateCard({
      title: 'Stale direct orchestration',
      columnId: 'ready',
      projectId: 'agent-portal',
      domain: 'orchestration',
      owner: 'orchestrator',
      acceptanceCriteria: ['Stale version is rejected'],
      actor: 'test',
    });
    let updated = service.updateWorkItem({
      cardId: created.card.id,
      expectedVersion: created.card.version,
      patch: { priority: 'high' },
      actor: 'test',
    });

    assert.equal(updated.card.version, created.card.version + 1);
    await assert.rejects(
      service.orchestrateWorkItem({
        cardId: created.card.id,
        expectedVersion: created.card.version,
        actor: 'test',
      }),
      /version conflict/,
    );
    assert.deepEqual(Object.keys(sg.get('workflowRuns') ?? {}), []);
    assert.equal(sg.get(`workflowLeases/${created.card.id}`), undefined);
  });

  it('fails and audits thrown delegation errors after run and lease creation', async () => {
    let proxyManager = {
      projectRoot: tmpDir,
      requestFromChild: async (server) => {
        if (server === 'project-graph') {
          return { content: [{ type: 'text', text: JSON.stringify({ ok: true, skeleton: {}, files: [] }) }] };
        }
        throw new Error('transport disconnected');
      },
      chatWsServer: { taskChatMap: new Map() },
    };
    service = createWorkflowBoardService({
      stateGraph: sg,
      now: () => now++,
      makeId: (prefix) => `${prefix}-${++idSeq}`,
      projectRoot: tmpDir,
      proxyManager,
      defaultPrincipal: humanPrincipal({ transport: { channel: 'loopback' }, label: 'local-human' }),
    });
    let created = service.createOrUpdateCard({
      title: 'Thrown delegate error',
      columnId: 'ready',
      projectId: 'agent-portal',
      domain: 'orchestration',
      owner: 'orchestrator',
      acceptanceCriteria: ['Transport failure is audited'],
      actor: 'test',
    });

    let result = await service.orchestrateWorkItem({
      cardId: created.card.id,
      expectedVersion: created.card.version,
      actor: 'test',
    });
    let run = Object.values(sg.get('workflowRuns') || {}).find(item => item.cardId === created.card.id);
    let event = service.listEvents({ cardId: created.card.id })
      .find(item => item.eventType === 'orchestration');

    assert.equal(result.run.status, 'failed');
    assert.equal(run.status, 'failed');
    assert.equal(sg.get(`workflowLeases/${created.card.id}`), undefined);
    assert.equal(service.getCard(created.card.id).columnId, 'ready');
    assert.equal(service.getCard(created.card.id).recoveryFlags.includes('needs_audit'), true);
    assert.equal(event.status, 'blocked');
    assert.equal(event.sideEffects[0].status, 'failed');
    assert.match(event.sideEffects[0].error, /transport disconnected/);
  });

  it('cleans stale pause recovery after a resumed run completes successfully', async () => {
    let created = service.createOrUpdateCard({
      title: 'Paused then resumed',
      columnId: 'in-progress',
      projectId: 'agent-portal',
      domain: 'orchestration',
      owner: 'orchestrator',
      acceptanceCriteria: ['Resume does not leave stale pause blockers'],
      actor: 'test',
    });
    service.resumeWorkItem({
      cardId: created.card.id,
      actor: 'test',
      reason: 'Resume from workflow board automation.',
    });
    let paused = await service.controlWorkItem({
      cardId: created.card.id,
      action: 'pause',
      actor: 'test',
      reason: 'Pause for regression',
    });
    let resumed = service.resumeWorkItem({
      cardId: paused.card.id,
      actor: 'test',
      reason: 'Pause for regression',
    });
    let recoveringRun = Object.values(sg.get('workflowRuns') || {})
      .filter(run => run.cardId === created.card.id && run.status === 'recovering')
      .at(-1);

    sg.commit([{
      op: 'set',
      path: `workflowRuns/${recoveringRun.id}`,
      value: { ...recoveringRun, status: 'completed', completedAt: 5000 },
    }], 'test');
    let reconciled = await service.reconcileWorkflowRecovery({
      projectId: 'agent-portal',
      actor: 'test',
      force: true,
    });
    let card = reconciled.reconciled.find(item => item.card.id === created.card.id).card;

    assert.equal(resumed.card.blockers.includes('Pause for regression'), false);
    assert.equal(card.recoveryFlags.includes('blocked'), false);
    assert.equal(card.recoveryFlags.includes('needs_resume'), false);
    assert.equal(card.recoveryFlags.includes('recovering'), false);
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
      defaultPrincipal: humanPrincipal({ transport: { channel: 'loopback' }, label: 'local-human' }),
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
      defaultPrincipal: humanPrincipal({ transport: { channel: 'loopback' }, label: 'local-human' }),
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
      defaultPrincipal: humanPrincipal({ transport: { channel: 'loopback' }, label: 'local-human' }),
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
      defaultPrincipal: humanPrincipal({ transport: { channel: 'loopback' }, label: 'local-human' }),
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

    let projection = await service.getBoardProjectionWithRuntime({
      projectId: 'agent-portal',
      reconcileRuntime: true,
    });
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
      defaultPrincipal: humanPrincipal({ transport: { channel: 'loopback' }, label: 'local-human' }),
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
    assert.equal(service.getCard(created.card.id).recoveryFlags.includes('blocked'), true);
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
      defaultPrincipal: humanPrincipal({ transport: { channel: 'loopback' }, label: 'local-human' }),
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
      defaultPrincipal: humanPrincipal({ transport: { channel: 'loopback' }, label: 'local-human' }),
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
      defaultPrincipal: humanPrincipal({ transport: { channel: 'loopback' }, label: 'local-human' }),
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

  it('refreshes the lease while the linked runtime task is still running (heartbeat)', async () => {
    let created = service.createOrUpdateCard({
      title: 'Long running task',
      columnId: 'in-progress',
      projectId: 'agent-portal',
      owner: 'tooling-engineer',
      actor: 'test',
    });
    let cardId = created.card.id;
    let taskId = 'task-live-1';
    sg.commit([
      {
        op: 'set',
        path: 'workflowRuns/run-live-1',
        value: {
          id: 'run-live-1',
          boardId: DEFAULT_WORKFLOW_BOARD_ID,
          cardId,
          status: 'running',
          taskIds: [taskId],
          startedAt: 1,
          updatedAt: 2,
        },
      },
      {
        op: 'set',
        path: `workflowLeases/${cardId}`,
        value: { cardId, runId: 'run-live-1', leaseOwner: 'tooling-engineer', leaseExpiresAt: 2000 },
      },
      {
        op: 'set',
        path: `tasks/${taskId}`,
        value: { id: taskId, status: 'running', updatedAt: 1500 },
      },
    ], 'test');

    await service.getBoardProjectionWithRuntime({ reconcileRuntime: true });

    let lease = sg.get(`workflowLeases/${cardId}`);
    assert.ok(lease, 'lease should remain while the task is alive');
    assert.ok(
      Number(lease.leaseExpiresAt) > 1_700_000,
      `expected the lease to slide forward by the TTL, got ${lease.leaseExpiresAt}`,
    );
  });

  it('does not extend the lease when a running task is frozen/stale (zombie, fail-closed)', async () => {
    let created = service.createOrUpdateCard({
      title: 'Frozen task',
      columnId: 'in-progress',
      projectId: 'agent-portal',
      owner: 'tooling-engineer',
      actor: 'test',
    });
    let cardId = created.card.id;
    let taskId = 'task-zombie';
    sg.commit([
      {
        op: 'set',
        path: 'workflowRuns/run-zombie',
        value: {
          id: 'run-zombie',
          boardId: DEFAULT_WORKFLOW_BOARD_ID,
          cardId,
          status: 'running',
          taskIds: [taskId],
          startedAt: 1,
          updatedAt: 2,
        },
      },
      {
        op: 'set',
        path: `workflowLeases/${cardId}`,
        value: { cardId, runId: 'run-zombie', leaseOwner: 'tooling-engineer', leaseExpiresAt: 2000 },
      },
      // Runtime task is still "running" but carries NO activity timestamp — a frozen zombie.
      { op: 'set', path: `tasks/${taskId}`, value: { id: taskId, status: 'running' } },
    ], 'test');

    await service.getBoardProjectionWithRuntime({ reconcileRuntime: true });

    let lease = sg.get(`workflowLeases/${cardId}`);
    assert.equal(Number(lease.leaseExpiresAt), 2000, 'a frozen running task must NOT refresh the lease');
  });

  it('does not extend the lease when the task activity is older than the freshness window', async () => {
    let bigNow = 2_000_000_000_000;
    let localGraph = new StateGraph({
      snapshotPath: path.join(tmpDir, 'wallclock.json'),
      walPath: path.join(tmpDir, 'wallclock.wal'),
      chatsDir: path.join(tmpDir, 'wallclock-chats'),
    });
    let localService = createWorkflowBoardService({
      stateGraph: localGraph,
      now: () => bigNow++,
      makeId: (prefix) => `${prefix}-wc-${++idSeq}`,
      projectRoot: tmpDir,
      defaultPrincipal: humanPrincipal({ transport: { channel: 'loopback' }, label: 'local-human' }),
    });
    let created = localService.createOrUpdateCard({
      title: 'Idle task',
      columnId: 'in-progress',
      projectId: 'agent-portal',
      owner: 'tooling-engineer',
      actor: 'test',
    });
    let cardId = created.card.id;
    let taskId = 'task-stale-wc';
    localGraph.commit([
      {
        op: 'set',
        path: 'workflowRuns/run-stale-wc',
        value: {
          id: 'run-stale-wc',
          boardId: DEFAULT_WORKFLOW_BOARD_ID,
          cardId,
          status: 'running',
          taskIds: [taskId],
          startedAt: 1,
          updatedAt: 2,
        },
      },
      {
        op: 'set',
        path: `workflowLeases/${cardId}`,
        value: { cardId, runId: 'run-stale-wc', leaseOwner: 'tooling-engineer', leaseExpiresAt: 2000 },
      },
      // Activity timestamp far in the past relative to the wall-clock now -> outside the window.
      { op: 'set', path: `tasks/${taskId}`, value: { id: taskId, status: 'running', updatedAt: 1500 } },
    ], 'test');

    await localService.getBoardProjectionWithRuntime({ reconcileRuntime: true });

    let lease = localGraph.get(`workflowLeases/${cardId}`);
    assert.equal(Number(lease.leaseExpiresAt), 2000, 'stale activity (outside window) must NOT refresh the lease');
    await localGraph.flushChatWrites();
    localGraph.flush();
  });

  it('does not extend (and releases) the lease when the linked task is terminal', async () => {
    let created = service.createOrUpdateCard({
      title: 'Finished task',
      columnId: 'in-progress',
      projectId: 'agent-portal',
      owner: 'tooling-engineer',
      actor: 'test',
    });
    let cardId = created.card.id;
    let taskId = 'task-done-1';
    sg.commit([
      {
        op: 'set',
        path: 'workflowRuns/run-done-1',
        value: {
          id: 'run-done-1',
          boardId: DEFAULT_WORKFLOW_BOARD_ID,
          cardId,
          status: 'running',
          taskIds: [taskId],
          startedAt: 1,
          updatedAt: 2,
        },
      },
      {
        op: 'set',
        path: `workflowLeases/${cardId}`,
        value: { cardId, runId: 'run-done-1', leaseOwner: 'tooling-engineer', leaseExpiresAt: 2000 },
      },
      {
        op: 'set',
        path: `tasks/${taskId}`,
        value: { id: taskId, status: 'done', updatedAt: 1500 },
      },
    ], 'test');

    await service.getBoardProjectionWithRuntime({ reconcileRuntime: true });

    assert.equal(sg.get(`workflowLeases/${cardId}`), undefined, 'terminal run should release, not extend, the lease');
  });

  it('updateWorkItem rejects an out-of-gate column move', () => {
    let created = service.createOrUpdateCard({
      title: 'Move me', columnId: 'ready', projectId: 'agent-portal', owner: 'tooling-engineer', actor: 'test',
    });
    assert.throws(
      () => service.updateWorkItem({ cardId: created.card.id, actor: 'test', patch: { columnId: 'in-progress' } }),
      /cannot change column via update/i,
    );
    assert.equal(service.getCard(created.card.id).columnId, 'ready');
  });

  it('updateWorkItem applies content patches and ignores a same-column echo', () => {
    let created = service.createOrUpdateCard({
      title: 'Patch me', columnId: 'quality-audit', projectId: 'agent-portal', owner: 'tooling-engineer', actor: 'test',
    });
    let updated = service.updateWorkItem({
      cardId: created.card.id, actor: 'test', patch: { columnId: 'quality-audit', priority: 'high' },
    });
    assert.equal(updated.card.priority, 'high');
    assert.equal(updated.card.columnId, 'quality-audit');
  });

  it('blocks a destructive move out of in-progress while a run is active', () => {
    let created = service.createOrUpdateCard({
      title: 'Active', columnId: 'in-progress', projectId: 'agent-portal', owner: 'tooling-engineer', actor: 'test',
    });
    sg.commit([{
      op: 'set', path: 'workflowRuns/run-active-x',
      value: { id: 'run-active-x', boardId: DEFAULT_WORKFLOW_BOARD_ID, cardId: created.card.id, status: 'running', taskIds: [], startedAt: 1, updatedAt: 2 },
    }], 'test');
    let blocked = service.requestTransition({ cardId: created.card.id, toColumnId: 'ready', reason: 'reset', actor: 'test' });
    assert.equal(blocked.status, 'blocked');
    assert.ok(blocked.gateResult.failures.some(f => f.gate === 'active_run_blocks_move'));
    assert.equal(service.getCard(created.card.id).columnId, 'in-progress');
  });

  it('lets force override the active-run block on a destructive move', () => {
    let created = service.createOrUpdateCard({
      title: 'Forced', columnId: 'in-progress', projectId: 'agent-portal', owner: 'tooling-engineer', actor: 'test',
    });
    sg.commit([{
      op: 'set', path: 'workflowRuns/run-active-y',
      value: { id: 'run-active-y', boardId: DEFAULT_WORKFLOW_BOARD_ID, cardId: created.card.id, status: 'running', taskIds: [], startedAt: 1, updatedAt: 2 },
    }], 'test');
    let forced = service.requestTransition({ cardId: created.card.id, toColumnId: 'ready', reason: 'reset', force: true, actor: 'test' });
    assert.equal(forced.gateResult.failures.some(f => f.gate === 'active_run_blocks_move'), false);
  });

  it('runs the quality-audit on_enter audit action through the gate', async () => {
    let auditTaskId = '33333333-3333-4333-8333-333333333333';
    let calls = [];
    let proxyManager = {
      projectRoot: tmpDir,
      requestFromChild: async (server, method, payload) => {
        calls.push({ server, method, payload });
        if (server === 'project-graph') {
          return { content: [{ type: 'text', text: JSON.stringify({ ok: true, skeleton: {}, files: [] }) }] };
        }
        return { content: [{ type: 'text', text: `Started task ${auditTaskId}` }] };
      },
      chatWsServer: { taskChatMap: new Map() },
    };
    service = createWorkflowBoardService({
      stateGraph: sg, now: () => now++, makeId: (prefix) => `${prefix}-${++idSeq}`, projectRoot: tmpDir, proxyManager,
      defaultPrincipal: humanPrincipal({ transport: { channel: 'loopback' }, label: 'local-human' }),
    });
    let created = service.createOrUpdateCard({
      title: 'Audit me', columnId: 'in-progress', projectId: 'agent-portal', domain: 'backend',
      owner: 'code-reviewer', acceptanceCriteria: ['Reviewed against criteria'], files: ['src/node/x.js'], actor: 'test',
    });
    let moved = await service.requestWorkflowTransition({
      cardId: created.card.id, fromColumnId: 'in-progress', toColumnId: 'quality-audit',
      expectedVersion: created.card.version, actor: 'human', reason: 'ready for audit',
    });

    assert.equal(moved.status, 'accepted');
    assert.equal(moved.orchestration.ok, true);
    let delegateCalls = calls.filter(call => call.server === 'agent-pool' && call.payload.name === 'delegate_task');
    assert.equal(delegateCalls.length, 1);
    assert.match(delegateCalls[0].payload.arguments.prompt, /Quality audit task:/);
    assert.match(delegateCalls[0].payload.arguments.prompt, /Act as a reviewer/);
  });

  it('clears needs_audit on reconcile when the audit check passes', async () => {
    let passed = service.createOrUpdateCard({
      title: 'Audited ok', columnId: 'quality-audit', projectId: 'agent-portal', owner: 'code-reviewer', actor: 'test',
    });
    let pending = service.createOrUpdateCard({
      title: 'Not audited', columnId: 'quality-audit', projectId: 'agent-portal', owner: 'code-reviewer', actor: 'test',
    });
    sg.commit([
      { op: 'set', path: 'workflowRuns/run-err-pass', value: { id: 'run-err-pass', boardId: DEFAULT_WORKFLOW_BOARD_ID, cardId: passed.card.id, status: 'error', taskIds: [], startedAt: 1, updatedAt: 2 } },
      { op: 'set', path: 'workflowRuns/run-err-pend', value: { id: 'run-err-pend', boardId: DEFAULT_WORKFLOW_BOARD_ID, cardId: pending.card.id, status: 'error', taskIds: [], startedAt: 1, updatedAt: 2 } },
    ], 'test');
    service.updateWorkItem({ cardId: passed.card.id, actor: 'test', checks: { audit: { status: 'passed' } } });

    await service.reconcileWorkflowRecovery({ boardId: DEFAULT_WORKFLOW_BOARD_ID, force: true });

    assert.equal(service.getCard(passed.card.id).recoveryFlags.includes('needs_audit'), false, 'passed audit clears needs_audit');
    assert.equal(service.getCard(pending.card.id).recoveryFlags.includes('needs_audit'), true, 'un-audited error run keeps needs_audit');
  });

  it('reconcileTick.tickOnce heals an unread board', async () => {
    let created = service.createOrUpdateCard({
      title: 'Stranded', columnId: 'in-progress', projectId: 'agent-portal', owner: 'tooling-engineer', actor: 'test',
    });
    sg.commit([{
      op: 'set', path: `workflowLeases/${created.card.id}`,
      value: { cardId: created.card.id, runId: 'run-gone', leaseOwner: 'tooling-engineer', leaseExpiresAt: 1 },
    }], 'test');

    let result = await service.reconcileTick.tickOnce();

    assert.equal(result.ok, true);
    assert.ok(result.boards >= 1);
    assert.ok(service.getCard(created.card.id).recoveryFlags.includes('needs_resume'), 'tick flags the stranded card');
  });

  it('reconcileTick.tickOnce is a no-op on an idle board', async () => {
    let created = service.createOrUpdateCard({
      title: 'Just an idea', columnId: 'ideas', projectId: 'agent-portal', owner: 'tooling-engineer', actor: 'test',
    });
    let result = await service.reconcileTick.tickOnce();
    assert.equal(result.ok, true);
    assert.deepEqual(service.getCard(created.card.id).recoveryFlags, []);
  });

  it('reconcileTick start/stop is idempotent and tracks the active flag', () => {
    let ticked = createWorkflowBoardService({
      stateGraph: sg, now: () => now++, makeId: (prefix) => `${prefix}-tick-${++idSeq}`, projectRoot: tmpDir, reconcileTickMs: 10_000_000,
      defaultPrincipal: humanPrincipal({ transport: { channel: 'loopback' }, label: 'local-human' }),
    });
    assert.equal(ticked.reconcileTick.active, false);
    ticked.reconcileTick.start();
    assert.equal(ticked.reconcileTick.active, true);
    ticked.reconcileTick.start();
    assert.equal(ticked.reconcileTick.active, true);
    ticked.reconcileTick.stop();
    assert.equal(ticked.reconcileTick.active, false);
    ticked.reconcileTick.stop();
  });

  it('reconcileTick.tickOnce coalesces a concurrent re-entrant call into a trailing pass', async () => {
    let results = await Promise.all([
      service.reconcileTick.tickOnce(),
      service.reconcileTick.tickOnce(),
    ]);
    // Single-flight with a coalesced trailing edge: the re-entrant call is not dropped — it sets
    // `pending` so the running cycle re-runs once more, and the call resolves `coalesced` (not skipped).
    assert.equal(results.filter(r => r.coalesced).length, 1, 'exactly one concurrent tick is coalesced');
    assert.equal(results.filter(r => r.ok).length, 2, 'both calls resolve ok (no drop, no error)');
  });

  // ── Unified escalation channel ──
  // Seed a card with a still-running workflow run whose linked runtime task has gone terminal,
  // carrying the worker's final answer (with an optional typed escalation) on the run's chat.
  function seedTerminalRun({ card, runId, taskId, text, taskStatus = 'error' }) {
    let chat = sg.createChat({ name: `wf-${runId}`, adapter: 'pool', agent: 'backend-engineer' }, 'test');
    sg.appendChatMessage(chat.id, { role: 'agent', text, taskId });
    let ts = now;
    sg.set(`tasks/${taskId}`, {
      status: taskStatus, chatId: chat.id, startedAt: ts, updatedAt: ts, completedAt: ts, events: [],
    }, 'test');
    sg.commit([{
      op: 'set',
      path: `workflowRuns/${runId}`,
      value: {
        schema: 'workflow-run/v1', id: runId, boardId: DEFAULT_WORKFLOW_BOARD_ID, cardId: card.id,
        status: 'running', taskIds: [taskId], startedAt: ts, updatedAt: ts, completedAt: null,
      },
    }], 'test');
    return chat.id;
  }

  it('stores a typed escalation from a terminal blocked run and emits an escalation event', () => {
    let { card } = service.createOrUpdateCard({
      title: 'Worker blocked on permission',
      columnId: 'in-progress',
      projectId: 'agent-portal',
      domain: 'backend',
      owner: 'backend-engineer',
      acceptanceCriteria: ['Edit src/iso'],
      actor: 'test',
    });
    seedTerminalRun({
      card,
      runId: 'run-block-1',
      taskId: 'task-block-1',
      text: [
        'Could not finish.',
        'ESCALATION_KIND: insufficient_permission',
        'ESCALATION_DETAIL: needs write access to src/iso',
        'ESCALATION_SUGGESTION: route to a write-capable lane',
        'WORKFLOW_RESULT: blocked',
      ].join('\n'),
    });

    service.reconcileWorkflowRuntimeTasks({ boardId: DEFAULT_WORKFLOW_BOARD_ID });
    let stored = service.getCard(card.id).metadata.escalation;

    assert.ok(stored, 'escalation recorded on card metadata');
    assert.equal(stored.kind, 'insufficient_permission');
    assert.equal(stored.detail, 'needs write access to src/iso');
    assert.equal(stored.attemptCount, 0, 'parser never advances the attempt counter');
    assert.equal(stored.humanEscalated, false);
    assert.equal(stored.lastRunId, 'run-block-1');
    // Policy guard: no rights fields leak into the durable record.
    assert.equal('approvalMode' in stored.lastEscalation, false);
    assert.equal('resourceGroup' in stored.lastEscalation, false);
    let event = service.listEvents({ cardId: card.id }).find(e => e.eventType === 'escalation');
    assert.ok(event, 'escalation event emitted');
    assert.equal(event.sideEffects[0].kind, 'insufficient_permission');
  });

  it('falls back to needs_decision for an untyped block, and rework from the audit column', () => {
    let inProgress = service.createOrUpdateCard({
      title: 'Untyped block', columnId: 'in-progress', projectId: 'agent-portal', domain: 'backend',
      owner: 'backend-engineer', acceptanceCriteria: ['x'], actor: 'test',
    }).card;
    seedTerminalRun({ card: inProgress, runId: 'run-u1', taskId: 'task-u1', text: 'Stuck.\nWORKFLOW_RESULT: blocked' });

    let audit = service.createOrUpdateCard({
      title: 'Audit found problems', columnId: 'quality-audit', projectId: 'agent-portal', domain: 'backend',
      owner: 'qa-engineer', acceptanceCriteria: ['x'], actor: 'test',
    }).card;
    seedTerminalRun({ card: audit, runId: 'run-a1', taskId: 'task-a1', text: 'Audit failed: tests red.\nWORKFLOW_RESULT: blocked' });

    service.reconcileWorkflowRuntimeTasks({ boardId: DEFAULT_WORKFLOW_BOARD_ID });

    assert.equal(service.getCard(inProgress.id).metadata.escalation.kind, 'needs_decision');
    assert.equal(service.getCard(audit.id).metadata.escalation.kind, 'rework');
  });

  it('clears the escalation episode when a later run completes', () => {
    let { card } = service.createOrUpdateCard({
      title: 'Blocked then resolved', columnId: 'in-progress', projectId: 'agent-portal', domain: 'backend',
      owner: 'backend-engineer', acceptanceCriteria: ['x'], actor: 'test',
    });
    seedTerminalRun({ card, runId: 'run-r1', taskId: 'task-r1', text: 'Blocked.\nESCALATION_KIND: insufficient_context\nWORKFLOW_RESULT: blocked' });
    service.reconcileWorkflowRuntimeTasks({ boardId: DEFAULT_WORKFLOW_BOARD_ID });
    assert.ok(service.getCard(card.id).metadata.escalation, 'episode recorded');

    seedTerminalRun({ card, runId: 'run-r2', taskId: 'task-r2', text: 'Done.\nWORKFLOW_RESULT: completed', taskStatus: 'done' });
    service.reconcileWorkflowRuntimeTasks({ boardId: DEFAULT_WORKFLOW_BOARD_ID });

    assert.equal(service.getCard(card.id).metadata.escalation, undefined, 'episode cleared on completion');
  });

  it('does not re-engage when board recovery is manual', async () => {
    // A fully-manual board (recovery + returnWake both manual) re-engages nothing → reports skipped.
    service.updateWorkflowBoard({ boardId: DEFAULT_WORKFLOW_BOARD_ID, automation: { recovery: 'manual', returnWake: 'manual' } });
    let { card } = service.createOrUpdateCard({
      title: 'Manual recovery board', columnId: 'in-progress', projectId: 'agent-portal', domain: 'backend',
      owner: 'backend-engineer', acceptanceCriteria: ['x'], actor: 'test',
    });
    seedTerminalRun({ card, runId: 'run-m1', taskId: 'task-m1', text: 'Blocked.\nESCALATION_KIND: needs_decision\nWORKFLOW_RESULT: blocked' });
    service.reconcileWorkflowRuntimeTasks({ boardId: DEFAULT_WORKFLOW_BOARD_ID });

    let result = await service.reconcileWorkflowEscalations({ boardId: DEFAULT_WORKFLOW_BOARD_ID });
    assert.equal(result.skipped, true);
    assert.equal(service.getCard(card.id).metadata.escalation.attemptCount, 0, 'no accrual under manual recovery');
  });

  it('re-engages through the gate, advancing the attempt counter and routing the card to ready', async () => {
    service.updateWorkflowBoard({ boardId: DEFAULT_WORKFLOW_BOARD_ID, automation: { recovery: 'auto' } });
    let { card } = service.createOrUpdateCard({
      title: 'Auto re-engage', columnId: 'in-progress', projectId: 'agent-portal', domain: 'backend',
      owner: 'backend-engineer', acceptanceCriteria: ['Ship it'], actor: 'test',
    });
    seedTerminalRun({ card, runId: 'run-e1', taskId: 'task-e1', text: 'Blocked.\nESCALATION_KIND: rework\nWORKFLOW_RESULT: blocked' });
    service.reconcileWorkflowRuntimeTasks({ boardId: DEFAULT_WORKFLOW_BOARD_ID });

    let result = await service.reconcileWorkflowEscalations({ boardId: DEFAULT_WORKFLOW_BOARD_ID });
    let after = service.getCard(card.id);

    assert.equal(result.reengaged.length, 1);
    assert.equal(result.reengaged[0].attempt, 1);
    assert.equal(after.metadata.escalation.attemptCount, 1, 'accrual happens in the re-engage step');
    assert.ok(after.metadata.escalation.nextAttemptAt > now - 1, 'backoff window set');
    assert.equal(after.columnId, 'ready', 'card routed back to the orchestrate column');
  });

  it('escalates to a human after the attempt cap without ever exceeding it (natural N rounds)', async () => {
    service.updateWorkflowBoard({ boardId: DEFAULT_WORKFLOW_BOARD_ID, automation: { recovery: 'auto' } });
    let { card } = service.createOrUpdateCard({
      title: 'Unresolvable escalation', columnId: 'in-progress', projectId: 'agent-portal', domain: 'backend',
      owner: 'backend-engineer', acceptanceCriteria: ['Ship it'], actor: 'test',
    });
    seedTerminalRun({ card, runId: 'run-cap', taskId: 'task-cap', text: 'Blocked.\nESCALATION_KIND: needs_context\nESCALATION_DETAIL: missing API spec\nWORKFLOW_RESULT: blocked' });
    service.reconcileWorkflowRuntimeTasks({ boardId: DEFAULT_WORKFLOW_BOARD_ID });

    let counts = [];
    for (let round = 0; round < 3; round++) {
      now += 60 * 60 * 1000; // jump past the exponential backoff window
      await service.reconcileWorkflowEscalations({ boardId: DEFAULT_WORKFLOW_BOARD_ID });
      counts.push(service.getCard(card.id).metadata.escalation.attemptCount);
    }

    assert.deepEqual(counts, [1, 2, 3], 'attempt counter is monotonic, one bump per round');

    now += 60 * 60 * 1000;
    let capped = await service.reconcileWorkflowEscalations({ boardId: DEFAULT_WORKFLOW_BOARD_ID });
    let final = service.getCard(card.id);

    assert.equal(capped.escalatedToHuman.length, 1, 'card handed to a human at the cap');
    assert.equal(capped.reengaged.length, 0, 'no further re-engagement after the cap');
    assert.equal(final.metadata.escalation.humanEscalated, true);
    assert.equal(final.metadata.escalation.attemptCount, 3, 'counter never exceeds the cap');
    assert.equal(final.recoveryFlags.includes('blocked'), true);
    assert.ok(final.blockers.some(b => /Human decision required/.test(b)), 'precise human-handoff blocker recorded');

    now += 60 * 60 * 1000;
    let afterCap = await service.reconcileWorkflowEscalations({ boardId: DEFAULT_WORKFLOW_BOARD_ID });
    assert.equal(afterCap.reengaged.length, 0, 'human-escalated card stays put');
    assert.equal(afterCap.escalatedToHuman.length, 0, 'no repeated human handoff');
  });

  // S5 (WS-B3): the service derives the closed column set, destructive moves, the active/recovery
  // columns, and the structural-graph gate from the board itself — not a hardcoded constant. These
  // three default-board anchors must hold so the generalization does not change shipped behavior.
  function commitBoard(board) {
    sg.commit([{ op: 'set', path: `workflowBoards/${board.id}`, value: board }], 'test');
    return board;
  }
  function commitCard(card) {
    let value = { schema: 'workflow-card/v2', version: 1, lifecycle: 'idle', dependsOn: [], blockers: [], recoveryFlags: [], acceptanceCriteria: [], owner: 'tester', ...card };
    sg.commit([{ op: 'set', path: `workflowCards/${value.id}`, value }], 'test');
    return value;
  }

  it('S5 anchor: default-board destructive set is into-done plus in-progress->ready/backlog/ideas', () => {
    let card = service.createOrUpdateCard({
      title: 'Destructive anchor', columnId: 'in-progress', projectId: 'agent-portal', owner: 'tooling-engineer', actor: 'test',
    }).card;
    // Backward moves out of the execute stage are destructive (need a reason).
    for (let to of ['ready', 'backlog', 'ideas']) {
      let blocked = service.requestTransition({ cardId: card.id, fromColumnId: 'in-progress', toColumnId: to, actor: 'test' });
      assert.ok(
        blocked.gateResult.failures.some(f => f.gate === 'reason_required'),
        `in-progress -> ${to} must require a reason (destructive)`,
      );
    }
    // A backward rework out of quality-audit (audit action, not execute) is NOT destructive — it is
    // governed by rework_authorized instead, exactly as before.
    let auditCard = service.createOrUpdateCard({
      title: 'Audit rework', columnId: 'quality-audit', projectId: 'agent-portal', owner: 'qa-engineer', actor: 'test',
    }).card;
    let auditRework = service.requestTransition({ cardId: auditCard.id, fromColumnId: 'quality-audit', toColumnId: 'ready', actor: 'test' });
    assert.equal(
      auditRework.gateResult.failures.some(f => f.gate === 'reason_required'), false,
      'quality-audit -> ready is not a destructive move',
    );
    // Entering the terminal column is destructive regardless of source.
    let publishCard = service.createOrUpdateCard({
      title: 'Publish anchor', columnId: 'commit-publish', projectId: 'agent-portal', owner: 'release-manager', actor: 'test',
    }).card;
    let toDone = service.requestTransition({ cardId: publishCard.id, fromColumnId: 'commit-publish', toColumnId: 'done', actor: 'test' });
    assert.ok(toDone.gateResult.failures.some(f => f.gate === 'reason_required'), 'commit-publish -> done is destructive');
  });

  it('S5 anchor: default-board active/recovery columns are exactly the four execution columns', () => {
    let recovery = service.getRecoveryState({ boardId: DEFAULT_WORKFLOW_BOARD_ID });
    assert.deepEqual(
      [...recovery.activeColumnIds].sort(),
      ['commit-publish', 'in-progress', 'quality-audit', 'ready'],
    );
  });

  it('S5 anchor: the default board is structurally valid, so a normal transition is not graph-blocked', () => {
    let card = service.createOrUpdateCard({
      title: 'Classify intake', columnId: 'ideas', projectId: 'agent-portal', domain: 'backend', actor: 'test',
    }).card;
    let accepted = service.requestTransition({
      cardId: card.id, fromColumnId: 'ideas', toColumnId: 'backlog', expectedVersion: card.version, actor: 'test', reason: 'Classified.',
    });
    assert.equal(accepted.status, 'accepted');
    assert.equal(accepted.gateResult.failures.some(f => f.gate === 'invalid_board_graph'), false);
  });

  it('S5 data-driven: a custom board accepts a transition into its own column but rejects an unknown one', () => {
    let board = createDefaultWorkflowBoard({ id: 'custom-board' });
    board.columns = [...board.columns, { id: 'staging', title: 'Staging', automation: { trigger: 'manual', action: 'execute', mode: 'gated' } }];
    // The inbound edge to the custom column carries a gate the test card cannot pass, so the request
    // stays blocked at the gate (the iso card normalizer only mints default columns — see findings),
    // which is enough to prove the data-driven column-existence check no longer rejects "staging".
    board.transitions = [
      ...board.transitions,
      { from: 'commit-publish', to: 'staging', gates: ['has_owner_and_acceptance'] },
      { from: 'staging', to: 'done', gates: ['clean_diff_and_hygiene'] },
    ];
    commitBoard(board);
    let card = commitCard({ id: 'custom-card', boardId: 'custom-board', title: 'Custom', columnId: 'commit-publish', acceptanceCriteria: [] });

    let toCustom = service.requestTransition({
      boardId: 'custom-board', cardId: card.id, fromColumnId: 'commit-publish', toColumnId: 'staging', actor: 'test', reason: 'Stage it.',
    });
    assert.equal(
      toCustom.gateResult.failures.some(f => f.gate === 'known_column'), false,
      'a board column id must be accepted as a transition target',
    );
    assert.equal(
      toCustom.gateResult.failures.some(f => f.gate === 'invalid_board_graph'), false,
      'the custom board is structurally valid',
    );

    let toUnknown = service.requestTransition({
      boardId: 'custom-board', cardId: card.id, fromColumnId: 'commit-publish', toColumnId: 'nowhere', actor: 'test', reason: 'Bad target.',
    });
    assert.equal(toUnknown.status, 'blocked');
    assert.ok(toUnknown.gateResult.failures.some(f => f.gate === 'known_column'));
  });

  it('S5 validator wiring: a structurally invalid board fails every transition with invalid_board_graph', () => {
    let board = createDefaultWorkflowBoard({ id: 'broken-board' });
    // Inbound-to-terminal edge missing the hygiene gate -> hygiene_cut_incomplete (inv 11 violation).
    board.transitions = [...board.transitions, { from: 'quality-audit', to: 'done', gates: ['audit_pass_or_explicit_waiver'] }];
    commitBoard(board);
    let card = commitCard({ id: 'broken-card', boardId: 'broken-board', title: 'Broken', columnId: 'ideas', projectId: 'agent-portal', domain: 'backend' });

    let result = service.requestTransition({
      boardId: 'broken-board', cardId: card.id, fromColumnId: 'ideas', toColumnId: 'backlog', actor: 'test', reason: 'Classify.',
    });
    assert.equal(result.status, 'blocked');
    assert.ok(result.gateResult.failures.some(f => f.gate === 'invalid_board_graph'));
  });
});

describe('normalizeWorkflowEscalation', () => {
  it('exposes exactly the four escalation kinds', () => {
    assert.deepEqual(WORKFLOW_ESCALATION_KINDS, [
      'insufficient_permission', 'insufficient_context', 'needs_decision', 'rework',
    ]);
  });

  it('types a valid kind into a full record without rights fields', () => {
    let record = normalizeWorkflowEscalation(
      { kind: 'insufficient_permission', detail: 'needs write to src', suggestedResolution: 'route to a write lane', approvalMode: 'yolo', resourceGroup: 'admin' },
      { now: 1000, raisedBy: 'backend-engineer', runId: 'run-1', taskId: 'task-1' },
    );
    assert.equal(record.schema, 'workflow-escalation/v1');
    assert.equal(record.kind, 'insufficient_permission');
    assert.equal(record.detail, 'needs write to src');
    assert.equal(record.suggestedResolution, 'route to a write lane');
    assert.equal(record.raisedBy, 'backend-engineer');
    assert.equal(record.raisedAt, 1000);
    assert.equal(record.runId, 'run-1');
    assert.equal(record.taskId, 'task-1');
    // Policy-guard invariant: the record must NOT carry rights fields.
    assert.equal('approvalMode' in record, false);
    assert.equal('resourceGroup' in record, false);
    assert.equal('assignedAgent' in record, false);
  });

  it('returns null for an unknown or absent kind (preserves untyped-blocked behavior)', () => {
    assert.equal(normalizeWorkflowEscalation({ kind: 'totally_made_up', detail: 'x' }), null);
    assert.equal(normalizeWorkflowEscalation({ detail: 'no kind' }), null);
    assert.equal(normalizeWorkflowEscalation({}), null);
  });
});

describe('workflow card lifecycle (AD-4)', () => {
  it('normalizes absent, unknown, and every valid lifecycle state', () => {
    assert.equal(normalizeWorkflowLifecycle(undefined), 'idle');
    assert.equal(normalizeWorkflowLifecycle(null), 'idle');
    assert.equal(normalizeWorkflowLifecycle(''), 'idle');
    assert.equal(normalizeWorkflowLifecycle('not-a-state'), 'idle');
    for (let state of WORKFLOW_CARD_LIFECYCLE_STATES) {
      assert.equal(normalizeWorkflowLifecycle(state), state);
    }
  });

  it('defaults a normalized card lifecycle to idle and carries dependsOn', () => {
    let card = normalizeWorkflowCardInput({ title: 'Lifecycle default' }, { id: 'card-lc' });
    assert.equal(card.lifecycle, 'idle');
    assert.deepEqual(card.dependsOn, []);
  });

  it('honors a provided lifecycle state on the card', () => {
    let card = normalizeWorkflowCardInput({ title: 'Queued card', lifecycle: 'queued' }, { id: 'card-q' });
    assert.equal(card.lifecycle, 'queued');
  });

  it('allows the scheduler-owned transitions and denies them to the dependency owner', () => {
    let schedulerEdges = [
      ['idle', 'queued'],
      ['queued', 'admitting'],
      ['admitting', 'running'],
      ['running', 'idle'],
      ['admitting', 'queued'],
      ['running', 'queued'],
    ];
    for (let [from, to] of schedulerEdges) {
      assert.equal(isWorkflowLifecycleTransitionAllowed(from, to, 'scheduler'), true, `${from}->${to} scheduler`);
      assert.equal(isWorkflowLifecycleTransitionAllowed(from, to, 'dependency'), false, `${from}->${to} denied to dependency`);
    }
  });

  it('lets only the dependency owner drive idle<->blocked', () => {
    assert.equal(isWorkflowLifecycleTransitionAllowed('idle', 'blocked', 'dependency'), true);
    assert.equal(isWorkflowLifecycleTransitionAllowed('blocked', 'idle', 'dependency'), true);
    assert.equal(isWorkflowLifecycleTransitionAllowed('idle', 'blocked', 'scheduler'), false);
    assert.equal(isWorkflowLifecycleTransitionAllowed('blocked', 'idle', 'scheduler'), false);
  });

  it('allows same-state transitions (idempotent) and denies illegal edges', () => {
    assert.equal(isWorkflowLifecycleTransitionAllowed('running', 'running', 'scheduler'), true);
    assert.equal(isWorkflowLifecycleTransitionAllowed('idle', 'idle', 'dependency'), true);
    assert.equal(isWorkflowLifecycleTransitionAllowed('idle', 'running', 'scheduler'), false);
    assert.equal(isWorkflowLifecycleTransitionAllowed('queued', 'blocked', 'dependency'), false);
    assert.equal(isWorkflowLifecycleTransitionAllowed('idle', 'queued', 'nobody'), false);
  });
});

describe('workflow board-native dependencies (AD-5)', () => {
  it('expands a string shorthand into a defaulted dependency object', () => {
    assert.deepEqual(normalizeWorkflowDependsOn(['card-a']), [
      { cardId: 'card-a', releaseWhen: 'card_done', onUpstreamFailure: 'block_and_escalate' },
    ]);
  });

  it('coerces unknown enum values to their defaults', () => {
    assert.deepEqual(
      normalizeWorkflowDependsOn([
        { cardId: 'card-b', releaseWhen: 'whenever', onUpstreamFailure: 'explode' },
      ]),
      [{ cardId: 'card-b', releaseWhen: 'card_done', onUpstreamFailure: 'block_and_escalate' }],
    );
  });

  it('keeps known enum values and dedupes by cardId (last wins)', () => {
    assert.deepEqual(
      normalizeWorkflowDependsOn([
        { cardId: 'card-c', releaseWhen: 'run_success' },
        { cardId: 'card-c', releaseWhen: 'audit_passed', onUpstreamFailure: 'cancel_self' },
      ]),
      [{ cardId: 'card-c', releaseWhen: 'audit_passed', onUpstreamFailure: 'cancel_self' }],
    );
  });

  it('drops entries with no cardId and returns [] for empty input', () => {
    assert.deepEqual(normalizeWorkflowDependsOn([{ releaseWhen: 'card_done' }, '', null]), []);
    assert.deepEqual(normalizeWorkflowDependsOn([]), []);
    assert.deepEqual(normalizeWorkflowDependsOn(undefined), []);
  });
});

describe('workflow graph classifier (AD-6)', () => {
  it('ranks the default board stages in pipeline order', () => {
    let classifier = classifyWorkflowGraph(createDefaultWorkflowBoard());
    let order = ['ideas', 'backlog', 'ready', 'in-progress', 'quality-audit', 'commit-publish', 'done'];
    for (let i = 1; i < order.length; i += 1) {
      assert.ok(
        classifier.rankOf(order[i - 1]) < classifier.rankOf(order[i]),
        `${order[i - 1]} ranks before ${order[i]}`,
      );
    }
    assert.equal(classifier.rankOf('does-not-exist'), -1);
  });

  it('classes the two rework edges as recovery + backward, and only done as terminal', () => {
    let classifier = classifyWorkflowGraph(createDefaultWorkflowBoard());
    let reworkEdges = classifier.edges.filter(edge => edge.to === 'ready' && edge.edgeClass === 'recovery');
    assert.deepEqual(
      reworkEdges.map(edge => edge.from).sort(),
      ['in-progress', 'quality-audit'],
    );
    assert.ok(reworkEdges.every(edge => edge.backward === true));
    assert.deepEqual([...classifier.terminals], ['done']);
    assert.equal(classifier.isTerminal('done'), true);
    assert.equal(classifier.isTerminal('ready'), false);
    assert.equal(classifier.edgeClass('ideas', 'backlog'), 'forward');
    assert.equal(classifier.edgeClass('in-progress', 'ready'), 'recovery');
    assert.equal(classifier.edgeClass('nope', 'nope'), null);
  });
});

describe('workflow transition-graph validator (AD-6)', () => {
  function makeBoard(columns, transitions) {
    return { schema: 'workflow-board/v2', id: 'test-board', columns, transitions };
  }
  function column(id, action) {
    return { id, title: id, automation: action ? { action } : {} };
  }

  it('accepts the shipped default board (anchor)', () => {
    let result = validateWorkflowTransitionGraph(createDefaultWorkflowBoard());
    assert.equal(result.ok, true);
    assert.deepEqual(result.errors, []);
  });

  it('flags a forward cycle', () => {
    let board = makeBoard(
      [column('a'), column('b', 'close')],
      [
        { from: 'a', to: 'b', gates: ['audit_pass_or_explicit_waiver', 'clean_diff_and_hygiene'] },
        { from: 'b', to: 'a', gates: ['no_active_blocker'] },
      ],
    );
    let result = validateWorkflowTransitionGraph(board);
    assert.equal(result.ok, false);
    assert.ok(result.errors.some(error => error.code === 'forward_cycle'));
  });

  it('does not flag a governed rework recovery edge as a cycle', () => {
    let board = makeBoard(
      [column('start'), column('work'), column('audit'), column('done', 'close')],
      [
        { from: 'start', to: 'work', gate: 'no_active_blocker' },
        { from: 'work', to: 'audit', gate: 'audit_pass_or_explicit_waiver' },
        { from: 'audit', to: 'done', gate: 'clean_diff_and_hygiene' },
        { from: 'audit', to: 'work', gate: 'rework_authorized' },
      ],
    );
    let result = validateWorkflowTransitionGraph(board);
    assert.equal(result.ok, true, JSON.stringify(result.errors));
    assert.equal(result.classifier.edgeClass('audit', 'work'), 'recovery');
  });

  it('flags an audit-skipping one-hop terminal edge (audit_not_dominating)', () => {
    let board = makeBoard(
      [column('hotfix'), column('done', 'close')],
      [{ from: 'hotfix', to: 'done', gate: 'clean_diff_and_hygiene' }],
    );
    let result = validateWorkflowTransitionGraph(board);
    assert.equal(result.ok, false);
    assert.ok(result.errors.some(error => error.code === 'audit_not_dominating'));
  });

  it('flags a terminal with a non-hygiene inbound edge (hygiene_cut_incomplete)', () => {
    let board = makeBoard(
      [column('start'), column('audit'), column('done', 'close')],
      [
        { from: 'start', to: 'audit', gate: 'audit_pass_or_explicit_waiver' },
        // Inbound to terminal carries audit but not hygiene -> P1 fails, P2 holds.
        { from: 'audit', to: 'done', gate: 'audit_pass_or_explicit_waiver' },
      ],
    );
    let result = validateWorkflowTransitionGraph(board);
    assert.equal(result.ok, false);
    assert.ok(result.errors.some(error => error.code === 'hygiene_cut_incomplete'));
  });

  it('flags a dead-end non-terminal column', () => {
    let board = makeBoard(
      [column('start'), column('dead'), column('done', 'close')],
      [
        { from: 'start', to: 'done', gates: ['audit_pass_or_explicit_waiver', 'clean_diff_and_hygiene'] },
        { from: 'start', to: 'dead', gate: 'no_active_blocker' },
      ],
    );
    let result = validateWorkflowTransitionGraph(board);
    assert.equal(result.ok, false);
    assert.ok(result.errors.some(error => error.code === 'dead_end_column' && /dead/.test(error.detail)));
  });

  it('flags an orphan / unreachable terminal', () => {
    let board = makeBoard(
      [column('start'), column('mid'), column('done', 'close')],
      [
        // start -> mid is a forward path that never reaches done; done has no inbound edge.
        { from: 'start', to: 'mid', gates: ['audit_pass_or_explicit_waiver', 'clean_diff_and_hygiene'] },
      ],
    );
    let result = validateWorkflowTransitionGraph(board);
    assert.equal(result.ok, false);
    assert.ok(result.errors.some(error => error.code === 'dead_end_column' && /orphan/.test(error.detail)));
  });

  it('flags a transition referencing a bogus gate (unknown_gate)', () => {
    let board = makeBoard(
      [column('start'), column('done', 'close')],
      [{ from: 'start', to: 'done', gates: ['audit_pass_or_explicit_waiver', 'clean_diff_and_hygiene', 'totally_bogus'] }],
    );
    let result = validateWorkflowTransitionGraph(board);
    assert.equal(result.ok, false);
    assert.ok(result.errors.some(error => error.code === 'unknown_gate'));
  });

  // F-DEP-3 regression: a recovery-classed (rework_authorized, rank-decreasing) edge INTO a terminal
  // escapes the P1 hygiene inbound-cut and the P2 audit-domination check (both scan only forward
  // edges), so a card could reach the close column crossing no hygiene/audit gate while the validator
  // returns ok. The board below is otherwise fully valid; the ONLY defect is the recovery edge
  // `b -> done` into the `done` terminal. Pre-fix this returned ok:true (the vulnerability).
  it('rejects a recovery-classed edge that targets a terminal (recovery_edge_into_terminal)', () => {
    let board = makeBoard(
      [column('intake'), column('a'), column('b'), column('done', 'close'), column('release', 'close')],
      [
        // Early terminal reached at a low forward rank (P1 hygiene + P2 audit both satisfied).
        { from: 'intake', to: 'done', gates: ['audit_pass_or_explicit_waiver', 'clean_diff_and_hygiene'] },
        // A longer forward chain to a second terminal so `b` outranks `done`.
        { from: 'intake', to: 'a', gate: 'no_active_blocker' },
        { from: 'a', to: 'b', gate: 'no_active_blocker' },
        { from: 'b', to: 'release', gates: ['audit_pass_or_explicit_waiver', 'clean_diff_and_hygiene'] },
        // The defect: a rework_authorized kickback from a higher-rank column INTO the `done` terminal.
        { from: 'b', to: 'done', gate: 'rework_authorized' },
      ],
    );
    let result = validateWorkflowTransitionGraph(board);
    // The defect edge is classed `recovery` (recovery-gated + rank-decreasing).
    assert.equal(result.classifier.edgeClass('b', 'done'), 'recovery');
    assert.equal(result.ok, false);
    assert.ok(
      result.errors.some(error => error.code === 'recovery_edge_into_terminal' && /b -> done/.test(error.detail)),
      JSON.stringify(result.errors),
    );
  });

  // F-DEP-3 guard: the recovery edge that is NOT into a terminal (the shipped pattern) stays valid.
  it('still accepts a recovery edge into a non-terminal (the governed-rework pattern)', () => {
    let board = makeBoard(
      [column('start'), column('work'), column('audit'), column('done', 'close')],
      [
        { from: 'start', to: 'work', gate: 'no_active_blocker' },
        { from: 'work', to: 'audit', gate: 'audit_pass_or_explicit_waiver' },
        { from: 'audit', to: 'done', gate: 'clean_diff_and_hygiene' },
        { from: 'audit', to: 'work', gate: 'rework_authorized' },
      ],
    );
    let result = validateWorkflowTransitionGraph(board);
    assert.equal(result.ok, true, JSON.stringify(result.errors));
    assert.equal(result.classifier.edgeClass('audit', 'work'), 'recovery');
  });
});

describe('workflow schema v2 migration (AD-8)', () => {
  it('migrates a v1-shaped card to v2 with idle lifecycle and empty dependsOn', () => {
    let v1Card = {
      schema: 'workflow-card/v1',
      id: 'card-old',
      title: 'Legacy card',
      columnId: 'ready',
      owner: 'orchestrator',
    };
    let migrated = migrateWorkflowCardToV2(v1Card);
    assert.equal(migrated.schema, 'workflow-card/v2');
    assert.equal(migrated.lifecycle, 'idle');
    assert.deepEqual(migrated.dependsOn, []);
    assert.equal(migrated.owner, 'orchestrator');
    assert.equal(migrated.title, 'Legacy card');
  });

  it('is idempotent on an already-v2 card', () => {
    let v2Card = migrateWorkflowCardToV2({ id: 'card-v2', title: 'V2 card', lifecycle: 'queued', dependsOn: ['up-1'] });
    assert.deepEqual(migrateWorkflowCardToV2(v2Card), v2Card);
    assert.equal(v2Card.lifecycle, 'queued');
    assert.deepEqual(v2Card.dependsOn, [
      { cardId: 'up-1', releaseWhen: 'card_done', onUpstreamFailure: 'block_and_escalate' },
    ]);
  });

  it('fills board v2 fields without overwriting a customized column title', () => {
    let board = createDefaultWorkflowBoard();
    board.schema = 'workflow-board/v1';
    board.columns = board.columns.map(col => (col.id === 'ready' ? { ...col, title: 'Custom Ready' } : col));
    let migrated = migrateWorkflowBoardToV2(board);
    assert.equal(migrated.schema, 'workflow-board/v2');
    assert.equal(migrated.columns.find(col => col.id === 'ready').title, 'Custom Ready');
    assert.deepEqual(migrateWorkflowBoardToV2(migrated), migrated);
  });
});
