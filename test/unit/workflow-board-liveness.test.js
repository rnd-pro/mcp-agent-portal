import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { DEFAULT_WORKFLOW_BOARD_ID, validateBoardLiveness, createWorkflowBoard } from '../../src/iso/workflow-board.js';
import { StateGraph } from '../../src/node/state-graph.js';
import { createWorkflowBoardService } from '../../src/node/workflow-board-service.js';
import { humanPrincipal } from '../../src/node/server/principal.js';

// F3: the board liveness contract. Authoring-time `validateBoardLiveness` surfaces termination gaps
// (advisory, never blocks); the runtime `auditBoardLiveness` reports genuinely frozen cards and each
// waiting card's derived reason.

describe('validateBoardLiveness (authoring advisory)', () => {
  it('passes the default factory board (full lane set)', () => {
    let board = createWorkflowBoard({ id: DEFAULT_WORKFLOW_BOARD_ID });
    let result = validateBoardLiveness(board);
    assert.equal(result.ok, true, `default board has no liveness gap: ${JSON.stringify(result.warnings)}`);
  });

  it('warns when an execution board omits the human lane and reject terminal', () => {
    let board = createWorkflowBoard({
      id: 'no-lanes',
      columns: [
        { id: 'intake', title: 'Intake', entryPoint: true, automation: { action: 'classify' } },
        { id: 'build', title: 'Build', automation: { action: 'execute' } },
        { id: 'review', title: 'Review', automation: { action: 'audit' } },
        { id: 'done', title: 'Done', automation: { action: 'close', closeKind: 'success' } },
      ],
      transitions: [
        { from: 'intake', to: 'build', gates: ['has_owner_and_acceptance'] },
        { from: 'build', to: 'review', gates: ['no_active_blocker'] },
        { from: 'review', to: 'done', gates: ['audit_pass_or_explicit_waiver', 'clean_diff_and_hygiene'] },
      ],
    });
    let result = validateBoardLiveness(board);
    assert.equal(result.ok, false);
    let codes = result.warnings.map(w => w.code);
    assert.ok(codes.includes('no_human_lane'), 'flags the missing human lane');
    assert.ok(codes.includes('no_reject_terminal'), 'flags the missing reject terminal');
  });

  it('is advisory only: a warned board is still a structurally valid, creatable board', () => {
    // createWorkflowBoardFromSpec commits it (graph-valid) and returns warnings, never blocks.
    let tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'liveness-advisory-'));
    fs.mkdirSync(path.join(tmpDir, 'chats'), { recursive: true });
    let sg = new StateGraph({
      snapshotPath: path.join(tmpDir, 'state.json'),
      walPath: path.join(tmpDir, 'state.wal'),
      chatsDir: path.join(tmpDir, 'chats'),
    });
    let n = 1000;
    let service = createWorkflowBoardService({
      stateGraph: sg,
      now: () => n++,
      makeId: (prefix) => `${prefix}-x`,
      projectRoot: tmpDir,
      defaultPrincipal: humanPrincipal({ transport: { channel: 'loopback' }, label: 'local-human' }),
    });
    let result = service.createWorkflowBoardFromSpec({
      id: 'warned-board',
      columns: [
        { id: 'intake', title: 'Intake', entryPoint: true, automation: { action: 'classify' } },
        { id: 'build', title: 'Build', automation: { action: 'execute' } },
        { id: 'review', title: 'Review', automation: { action: 'audit' } },
        { id: 'done', title: 'Done', automation: { action: 'close', closeKind: 'success' } },
      ],
      transitions: [
        { from: 'intake', to: 'build', gates: ['has_owner_and_acceptance'] },
        { from: 'build', to: 'review', gates: ['no_active_blocker'] },
        { from: 'review', to: 'done', gates: ['audit_pass_or_explicit_waiver', 'clean_diff_and_hygiene'] },
      ],
    });
    assert.equal(result.ok, true, 'the board is created despite the liveness warnings');
    assert.ok(Array.isArray(result.livenessWarnings), 'warnings ride along on the create result');
    assert.ok(result.livenessWarnings.some(w => w.code === 'no_human_lane'));
    assert.ok(sg.get('workflowBoards/warned-board'), 'the board is durably committed');
    sg.flush();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });
});

describe('auditBoardLiveness (runtime alarm)', () => {
  let tmpDir;
  let sg;
  let service;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'liveness-runtime-'));
    fs.mkdirSync(path.join(tmpDir, 'chats'), { recursive: true });
    sg = new StateGraph({
      snapshotPath: path.join(tmpDir, 'state.json'),
      walPath: path.join(tmpDir, 'state.wal'),
      chatsDir: path.join(tmpDir, 'chats'),
    });
    let n = 1000;
    service = createWorkflowBoardService({
      stateGraph: sg,
      now: () => n++,
      makeId: (prefix) => `${prefix}-${n}`,
      projectRoot: tmpDir,
      defaultPrincipal: humanPrincipal({ transport: { channel: 'loopback' }, label: 'local-human' }),
    });
    service.ensureBoard();
  });

  afterEach(async () => {
    await sg.flushChatWrites();
    sg.flush();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('reports no frozen cards on a healthy board (fresh intake is not frozen)', () => {
    service.createOrUpdateCard({
      title: 'fresh', columnId: 'ready', projectId: 'p', domain: 'backend',
      owner: 'orchestrator', acceptanceCriteria: ['x'], actor: 'test',
    });
    let result = service.auditBoardLiveness(DEFAULT_WORKFLOW_BOARD_ID);
    assert.equal(result.ok, true);
    assert.equal(result.frozen.length, 0, 'a never-run intake card is awaiting a trigger, not frozen');
  });

  it('classifies a dependency-blocked card as waiting, not frozen', () => {
    let { card } = service.createOrUpdateCard({
      title: 'blocked', columnId: 'in-progress', projectId: 'p', domain: 'backend',
      owner: 'backend-engineer', acceptanceCriteria: ['x'], actor: 'test',
    });
    // Plant a worked-but-blocked card: a run exists, lifecycle blocked with the dependency clock.
    let base = sg.get(`workflowCards/${card.id}`);
    sg.commit([
      { op: 'set', path: `workflowRuns/run-b`, value: {
        schema: 'workflow-run/v1', id: 'run-b', boardId: DEFAULT_WORKFLOW_BOARD_ID, cardId: card.id,
        status: 'completed', taskIds: ['t-b'], startedAt: 1, updatedAt: 2,
      } },
      { op: 'set', path: `workflowCards/${card.id}`, value: {
        ...base, lifecycle: 'blocked', metadata: { ...base.metadata, dependencyBlock: { blockedAt: 5 } },
      } },
    ], 'plant-blocked', { durable: true });
    let result = service.auditBoardLiveness(DEFAULT_WORKFLOW_BOARD_ID);
    assert.equal(result.frozen.length, 0, 'a blocked card is waiting on a dependency, not frozen');
    assert.ok(result.waiting.some(w => w.cardId === card.id && w.reason === 'dependency'));
  });

  it('detects a genuinely frozen card: worked, stopped, auto-advancing column, no waiting reason', () => {
    let { card } = service.createOrUpdateCard({
      title: 'stuck', columnId: 'in-progress', projectId: 'p', domain: 'backend',
      owner: 'backend-engineer', acceptanceCriteria: ['x'], actor: 'test',
    });
    // A completed run (so the card is "worked") but no lifecycle/escalation/return/flags to explain
    // why it never advanced out of the auto-advancing execute column — a genuine stall.
    let base = sg.get(`workflowCards/${card.id}`);
    sg.commit([
      { op: 'set', path: `workflowRuns/run-s`, value: {
        schema: 'workflow-run/v1', id: 'run-s', boardId: DEFAULT_WORKFLOW_BOARD_ID, cardId: card.id,
        status: 'completed', taskIds: ['t-s'], startedAt: 1, updatedAt: 2,
      } },
      { op: 'set', path: `workflowCards/${card.id}`, value: {
        ...base, lifecycle: 'idle', recoveryFlags: [], metadata: { ...base.metadata },
      } },
    ], 'plant-frozen', { durable: true });
    let result = service.auditBoardLiveness(DEFAULT_WORKFLOW_BOARD_ID);
    assert.equal(result.ok, false, 'the frozen card makes the audit fail');
    assert.ok(result.frozen.some(f => f.cardId === card.id), 'the stalled card is flagged frozen');
  });
});
