import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  DEFAULT_WORKFLOW_BOARD_ID,
  WORKFLOW_COLUMN_ACTIONS,
  WORKFLOW_ACTION_DISPATCH,
  isKnownWorkflowAction,
  workflowActionIsExecution,
  workflowActionHoldsPendingChange,
  registerWorkflowGate,
  getWorkflowGate,
  isKnownWorkflowGate,
  listWorkflowGateIds,
  WORKFLOW_GATE_VOCABULARY,
  createDefaultWorkflowBoard,
  validateWorkflowTransitionGraph,
  evaluateWorkflowTransitionGates,
} from '../../src/iso/workflow-board.js';
import { StateGraph } from '../../src/node/state-graph.js';
import { createWorkflowBoardService } from '../../src/node/workflow-board-service.js';
import { humanPrincipal } from '../../src/node/server/principal.js';
import { handleWorkflowBoardTool, WORKFLOW_BOARD_TOOLS } from '../../src/node/proxy/workflow-board-tools.js';

// Axis D: open the gate/action vocabulary and unpin the transition tool's toColumnId from the default
// column set. Covers the registrable gate-predicate registry, the validated action dispatch table, and
// the removal of the proxy-level toColumnId enum/guard in favor of the board-aware service.
describe('workflow gate registry (registrable predicates seeded with built-ins)', () => {
  it('seeds the registry with every built-in gate', () => {
    for (let id of WORKFLOW_GATE_VOCABULARY) {
      assert.equal(isKnownWorkflowGate(id), true, `built-in gate ${id} is known`);
      assert.equal(typeof getWorkflowGate(id), 'function', `built-in gate ${id} resolves to a predicate`);
    }
    let ids = listWorkflowGateIds();
    for (let id of WORKFLOW_GATE_VOCABULARY) assert.ok(ids.includes(id));
  });

  it('rejects an unregistered gate id (fail-closed)', () => {
    assert.equal(isKnownWorkflowGate('totally_unknown_gate'), false);
    assert.equal(getWorkflowGate('totally_unknown_gate'), null);
  });

  it('registers a custom predicate that becomes first-class for validation + evaluation', () => {
    let calls = [];
    registerWorkflowGate('reviewer_signed_off', (card, checks) => {
      calls.push({ card, checks });
      return { ok: checks?.reviewerSignoff === true, reason: 'Reviewer must sign off.' };
    });
    assert.equal(isKnownWorkflowGate('reviewer_signed_off'), true);
    assert.ok(listWorkflowGateIds().includes('reviewer_signed_off'));

    // A board whose transition references the registered custom gate passes graph validation: no
    // unknown_gate error is raised for it (it would have, against the closed array).
    let board = createDefaultWorkflowBoard({ id: 'custom-gate-board' });
    let edge = board.transitions.find(t => t.from === 'ready' && t.to === 'in-progress');
    edge.gates = [...edge.gates, 'reviewer_signed_off'];
    let validation = validateWorkflowTransitionGraph(board);
    assert.equal(
      validation.errors.some(e => e.code === 'unknown_gate' && /reviewer_signed_off/.test(e.detail)),
      false,
      'a registered custom gate must not be reported as unknown',
    );

    // The evaluator dispatches through the registry, so the custom predicate actually runs and gates.
    let card = { columnId: 'ready', projectId: 'p', domain: 'backend', owner: 'o', acceptanceCriteria: ['a'], blockers: [], recoveryFlags: [] };
    let failed = evaluateWorkflowTransitionGates({ board, card, checks: {}, request: { toColumnId: 'in-progress' } });
    assert.equal(failed.failures.some(f => f.gate === 'reviewer_signed_off'), true, 'custom predicate fails closed without signoff');
    let passed = evaluateWorkflowTransitionGates({ board, card, checks: { reviewerSignoff: true }, request: { toColumnId: 'in-progress' } });
    assert.equal(passed.failures.some(f => f.gate === 'reviewer_signed_off'), false, 'custom predicate passes once signed off');
    assert.ok(calls.length >= 2, 'the registered predicate was invoked by the evaluator');
  });

  it('still flags a genuinely unknown gate in graph validation', () => {
    let board = createDefaultWorkflowBoard({ id: 'unknown-gate-board' });
    let edge = board.transitions.find(t => t.from === 'ready' && t.to === 'in-progress');
    edge.gates = [...edge.gates, 'no_such_gate'];
    let validation = validateWorkflowTransitionGraph(board);
    assert.equal(validation.errors.some(e => e.code === 'unknown_gate' && /no_such_gate/.test(e.detail)), true);
  });
});

describe('workflow action dispatch table (validated; unknown rejected at define_column)', () => {
  let tmpDir;
  let sg;
  let now;
  let idSeq;
  let service;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'workflow-vocabulary-'));
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

  it('classifies built-in actions consistently between the table and derived helpers', () => {
    assert.deepEqual(WORKFLOW_COLUMN_ACTIONS, Object.keys(WORKFLOW_ACTION_DISPATCH));
    assert.equal(isKnownWorkflowAction('orchestrate'), true);
    assert.equal(isKnownWorkflowAction('nonsense'), false);
    // Execution + pending-change classes match the documented runtime behavior.
    assert.equal(workflowActionIsExecution('execute'), true);
    assert.equal(workflowActionIsExecution('classify'), false);
    assert.equal(workflowActionHoldsPendingChange('audit'), true);
    assert.equal(workflowActionHoldsPendingChange('orchestrate'), false);
  });

  // The action vocabulary is enforced at the authoring boundary, independent of the transition-graph
  // invariants (a bare new column would orphan the graph regardless of its action). These assert the
  // action check itself: a known or absent action passes it; an unknown one is rejected before commit.
  it('passes the action check for a known action (a new column referencing one is not rejected on the action)', () => {
    assert.doesNotThrow(() => service.defineWorkflowColumn({
      boardId: DEFAULT_WORKFLOW_BOARD_ID,
      columnId: 'staging-review',
      title: 'Staging Review',
      automation: { trigger: 'on_enter', action: 'audit', mode: 'gated', agents: ['qa-engineer'] },
      after: 'quality-audit',
    }));
  });

  it('passes the action check for an action-less passive waypoint column', () => {
    assert.doesNotThrow(() => service.defineWorkflowColumn({
      boardId: DEFAULT_WORKFLOW_BOARD_ID,
      columnId: 'parking',
      title: 'Parking',
      automation: { trigger: 'manual', mode: 'manual' },
      after: 'backlog',
    }));
  });

  it('accepts an in-place column update that keeps a known action and a valid graph', () => {
    let outcome = service.defineWorkflowColumn({
      boardId: DEFAULT_WORKFLOW_BOARD_ID,
      columnId: 'quality-audit',
      title: 'Quality Audit (renamed)',
      automation: { action: 'audit' },
    });
    assert.equal(outcome.ok !== false, true, 'updating an existing column with a known action is accepted');
  });

  it('rejects a column whose action is not in the dispatch table (fail-closed)', () => {
    assert.throws(
      () => service.defineWorkflowColumn({
        boardId: DEFAULT_WORKFLOW_BOARD_ID,
        columnId: 'weird',
        title: 'Weird',
        automation: { trigger: 'manual', action: 'teleport', mode: 'manual' },
        after: 'backlog',
      }),
      /Unknown column action "teleport"/,
    );
  });
});

describe('transition toColumnId is unpinned from the default column set', () => {
  it('drops the default-id enum from the transition tool schema', () => {
    let tool = WORKFLOW_BOARD_TOOLS.find(t => t.name === 'workflow_board');
    let toColumnId = tool.inputSchema.properties.toColumnId;
    assert.equal(toColumnId.type, 'string');
    assert.equal(toColumnId.enum, undefined, 'toColumnId must not pin to the default columns');
  });

  it('forwards a non-default destination column to the board-aware service instead of rejecting it', async () => {
    let calls = [];
    let stubService = {
      requestWorkflowTransition: (svcArgs) => {
        calls.push(svcArgs);
        return { ok: true, status: 'accepted', card: { id: svcArgs.cardId, columnId: svcArgs.toColumnId } };
      },
    };
    let result = await handleWorkflowBoardTool(
      {},
      'workflow_board',
      { action: 'transition', cardId: 'card-1', toColumnId: 'staging-review' },
      'test',
      { workflowService: stubService },
    );
    assert.equal(result.isError, undefined, 'a custom-board column must not be pre-rejected at the proxy');
    assert.equal(calls.length, 1, 'the transition reached the service');
    assert.equal(calls[0].toColumnId, 'staging-review');
  });
});
