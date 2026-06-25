import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  DEFAULT_WORKFLOW_BOARD_ID,
  WORKFLOW_BOARD_SCHEMA,
  createWorkflowBoard,
  createDefaultWorkflowBoard,
  validateWorkflowTransitionGraph,
} from '../../src/iso/workflow-board.js';
import { StateGraph } from '../../src/node/state-graph.js';
import { createWorkflowBoardService } from '../../src/node/workflow-board-service.js';
import { humanPrincipal } from '../../src/node/server/principal.js';
import { handleWorkflowBoardTool, WORKFLOW_BOARD_TOOLS } from '../../src/node/proxy/workflow-board-tools.js';

// Axis D: a non-default board can be authored from a column/transition spec (create_board), ensureBoard
// is relaxed from a default-only factory to lookup/create-on-first-touch, and the tool surface exposes
// create_board. A spec board is graph-validated by validateWorkflowTransitionGraph before it persists,
// so a board can never be authored into an unoperable state.

// A minimal but graph-valid spec: intake -> review -> done, with the success terminal both
// audit-dominated and hygiene edge-cut on its inbound edge.
function validSpec(id) {
  return {
    id,
    title: 'Team Review Board',
    columns: [
      { id: 'intake', title: 'Intake', automation: { action: 'classify' } },
      { id: 'review', title: 'Review', automation: { trigger: 'on_enter', action: 'audit', mode: 'gated', agents: ['code-reviewer'] } },
      { id: 'done', title: 'Done', automation: { action: 'close', closeKind: 'success' } },
    ],
    transitions: [
      { from: 'intake', to: 'review', gates: ['has_owner_and_acceptance'] },
      { from: 'review', to: 'done', gates: ['audit_pass_or_explicit_waiver', 'clean_diff_and_hygiene'] },
    ],
  };
}

describe('createWorkflowBoard (iso spec factory)', () => {
  it('shapes a board from an explicit column/transition spec', () => {
    let board = createWorkflowBoard({ ...validSpec('team-board'), now: 5 });
    assert.equal(board.schema, WORKFLOW_BOARD_SCHEMA);
    assert.equal(board.id, 'team-board');
    assert.equal(board.title, 'Team Review Board');
    assert.deepEqual(board.columns.map(column => column.id), ['intake', 'review', 'done']);
    assert.equal(board.columns[1].automation.action, 'audit');
    assert.equal(board.transitions.length, 2);
    assert.deepEqual(board.transitions[1].gates, ['audit_pass_or_explicit_waiver', 'clean_diff_and_hygiene']);
    assert.equal(validateWorkflowTransitionGraph(board).ok, true);
  });

  it('falls back to the default graph for an id-only spec (named, operable board)', () => {
    let board = createWorkflowBoard({ id: 'mirror-board' });
    let baseline = createDefaultWorkflowBoard({ id: 'mirror-board' });
    assert.equal(board.id, 'mirror-board');
    assert.deepEqual(board.columns.map(c => c.id), baseline.columns.map(c => c.id));
    assert.equal(validateWorkflowTransitionGraph(board).ok, true);
  });

  it('requires a board id', () => {
    assert.throws(() => createWorkflowBoard({ columns: [], transitions: [] }), /requires a board id/);
  });
});

describe('workflow board service multi-board authoring', () => {
  let tmpDir;
  let sg;
  let now;
  let idSeq;
  let service;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'workflow-multiboard-'));
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

  it('create_board validates the graph and persists a non-default board', () => {
    let result = service.createWorkflowBoardFromSpec(validSpec('team-review-board'));
    assert.equal(result.ok, true);
    assert.equal(result.board.id, 'team-review-board');
    let persisted = sg.get('workflowBoards/team-review-board');
    assert.ok(persisted, 'the board is durably committed');
    assert.deepEqual(persisted.columns.map(c => c.id), ['intake', 'review', 'done']);
    // The new board is now visible to the board list alongside the default board.
    let { boards } = service.listWorkflowBoards();
    assert.ok(boards.some(b => b.id === 'team-review-board'));
  });

  it('rejects an unoperable graph without persisting (no audit/hygiene cut to the terminal)', () => {
    let result = service.createWorkflowBoardFromSpec({
      id: 'broken-board',
      columns: [
        { id: 'intake', title: 'Intake', automation: { action: 'classify' } },
        { id: 'done', title: 'Done', automation: { action: 'close', closeKind: 'success' } },
      ],
      transitions: [{ from: 'intake', to: 'done', gates: ['has_owner_and_acceptance'] }],
    });
    assert.equal(result.ok, false);
    assert.equal(result.status, 'blocked');
    assert.equal(result.failures[0].gate, 'invalid_board_graph');
    assert.equal(sg.get('workflowBoards/broken-board'), undefined, 'an invalid board never persists');
  });

  it('refuses to recreate the fixed default board from a spec', () => {
    assert.throws(
      () => service.createWorkflowBoardFromSpec(validSpec(DEFAULT_WORKFLOW_BOARD_ID)),
      /default board/,
    );
  });

  it('is create-only: it refuses to clobber an existing board', () => {
    assert.equal(service.createWorkflowBoardFromSpec(validSpec('once-board')).ok, true);
    assert.throws(() => service.createWorkflowBoardFromSpec(validSpec('once-board')), /already exists/);
  });
});

describe('ensureBoard relaxed to lookup/create-on-first-touch', () => {
  let tmpDir;
  let sg;
  let service;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'workflow-ensure-'));
    sg = new StateGraph({
      snapshotPath: path.join(tmpDir, 'state.json'),
      walPath: path.join(tmpDir, 'state.wal'),
      chatsDir: path.join(tmpDir, 'chats'),
    });
    let n = 1000;
    service = createWorkflowBoardService({
      stateGraph: sg,
      now: () => n++,
      makeId: (prefix) => `${prefix}-x`,
      projectRoot: tmpDir,
      defaultPrincipal: humanPrincipal({ transport: { channel: 'loopback' }, label: 'local-human' }),
    });
  });

  afterEach(async () => {
    await sg.flushChatWrites();
    sg.flush();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('still creates the default board on first touch', () => {
    let board = service.ensureBoard(DEFAULT_WORKFLOW_BOARD_ID);
    assert.equal(board.id, DEFAULT_WORKFLOW_BOARD_ID);
  });

  it('still fails closed for an unknown non-default board with no spec', () => {
    assert.throws(() => service.ensureBoard('ghost-board'), /not found/);
  });

  it('creates a non-default board on first touch when a spec is supplied, then returns it', () => {
    let created = service.ensureBoard('seeded-board', { spec: validSpec('seeded-board') });
    assert.equal(created.id, 'seeded-board');
    assert.ok(sg.get('workflowBoards/seeded-board'));
    // A second touch with no spec now finds the persisted board instead of throwing.
    let again = service.ensureBoard('seeded-board');
    assert.equal(again.id, 'seeded-board');
  });

  it('refuses to seed an unoperable board through the ensure path', () => {
    assert.throws(
      () => service.ensureBoard('bad-seed', {
        spec: {
          id: 'bad-seed',
          columns: [
            { id: 'intake', automation: { action: 'classify' } },
            { id: 'done', automation: { action: 'close', closeKind: 'success' } },
          ],
          transitions: [{ from: 'intake', to: 'done', gates: ['has_owner_and_acceptance'] }],
        },
      }),
      /Invalid workflow board graph/,
    );
  });
});

describe('create_board tool surface', () => {
  it('exposes create_board in the workflow_board action enum', () => {
    let tool = WORKFLOW_BOARD_TOOLS.find(t => t.name === 'workflow_board');
    assert.ok(tool.inputSchema.properties.action.enum.includes('create_board'));
    assert.ok(tool.inputSchema.properties.columns, 'columns spec property is declared');
    assert.ok(tool.inputSchema.properties.transitions, 'transitions spec property is declared');
  });

  it('forwards the board spec to the gated service method', async () => {
    let calls = [];
    let stubService = {
      createWorkflowBoardFromSpec: (svcArgs) => {
        calls.push(svcArgs);
        return { ok: true, board: { id: svcArgs.boardId } };
      },
    };
    let spec = validSpec('team-review-board');
    let result = await handleWorkflowBoardTool(
      {},
      'workflow_board',
      { action: 'create_board', boardId: spec.id, title: spec.title, columns: spec.columns, transitions: spec.transitions },
      'test',
      { workflowService: stubService },
    );
    assert.equal(result.isError, undefined);
    assert.equal(calls.length, 1, 'the create_board call reached the service');
    assert.equal(calls[0].boardId, 'team-review-board');
    assert.deepEqual(calls[0].columns.map(c => c.id), ['intake', 'review', 'done']);
    assert.equal(calls[0].transitions.length, 2);
  });
});
