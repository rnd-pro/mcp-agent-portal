import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { StateGraph } from '../../src/node/state-graph.js';
import { createWorkflowBoardService } from '../../src/node/workflow-board-service.js';
import { handleWorkflowBoardTool } from '../../src/node/proxy/workflow-board-tools.js';
import { humanPrincipal } from '../../src/node/server/principal.js';
import { DEFAULT_WORKFLOW_BOARD_ID, createDefaultWorkflowBoard } from '../../src/iso/workflow-board.js';

// Column automation action by default column id, so an autonomy assertion can read the per-stage
// autoAdvance the level preset cascades (keyed by action) back through each column.
const ACTION_BY_COLUMN = {
  ideas: 'classify',
  backlog: 'scope',
  ready: 'orchestrate',
  'in-progress': 'execute',
  'quality-audit': 'audit',
  'commit-publish': 'publish',
};

function columnsByAction(board) {
  let out = {};
  for (let column of board.columns) {
    let action = column?.automation?.action;
    if (action) out[action] = column.automation;
  }
  return out;
}

describe('autonomy level over MCP + default-board materialization', () => {
  let tmpDir;
  let sg;
  let now;
  let idSeq;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'workflow-autonomy-mcp-'));
    sg = new StateGraph({
      snapshotPath: path.join(tmpDir, 'state.json'),
      walPath: path.join(tmpDir, 'state.wal'),
      chatsDir: path.join(tmpDir, 'chats'),
    });
    now = 1000;
    idSeq = 0;
  });

  afterEach(async () => {
    await sg.flushChatWrites();
    sg.flush();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function makeService() {
    return createWorkflowBoardService({
      stateGraph: sg,
      now: () => now++,
      makeId: (prefix) => `${prefix}-${++idSeq}`,
      projectRoot: tmpDir,
    });
  }

  async function readBoard(service) {
    let { projection } = await service.getWorkflowBoard({});
    return projection.board;
  }

  it('the migrated default board materializes autonomyLevel 5 with every stage auto-advancing', async () => {
    let service = makeService();
    let board = await readBoard(service);
    assert.equal(board.automation.autonomyLevel, 5);
    assert.equal(board.automation.publishMode, 'after_audit');
    let byAction = columnsByAction(board);
    for (let action of Object.values(ACTION_BY_COLUMN)) {
      assert.equal(byAction[action].autoAdvance, true, `${action} should auto-advance at L5`);
    }
  });

  it('the policy refresh stamps autonomyLevel + per-column autoAdvance onto a stale persisted board', async () => {
    // Seed a pre-autonomy default board: an older policy version, no automation.autonomyLevel, and
    // columns whose automation never carried autoAdvance. The refresh must materialize the level 5
    // default and cascade autoAdvance, so the live projection surfaces them.
    let seed = createDefaultWorkflowBoard({ id: DEFAULT_WORKFLOW_BOARD_ID });
    let { autonomyLevel, publishMode, ...staleAutomation } = seed.automation;
    let stale = {
      ...seed,
      automation: staleAutomation,
      columns: seed.columns.map((column) => {
        let { autoAdvance, ...automation } = column.automation;
        return { ...column, automation };
      }),
      version: 35,
      metadata: { defaultPolicyVersion: 7 },
    };
    sg.commit([{ op: 'set', path: `workflowBoards/${DEFAULT_WORKFLOW_BOARD_ID}`, value: stale }], 'test-seed');

    let service = makeService();
    let board = await readBoard(service);
    assert.equal(board.automation.autonomyLevel, 5);
    assert.equal(board.automation.publishMode, 'after_audit');
    let byAction = columnsByAction(board);
    for (let action of Object.values(ACTION_BY_COLUMN)) {
      assert.equal(byAction[action].autoAdvance, true, `${action} autoAdvance materialized by the refresh`);
    }
    assert.ok(board.version > 35);
  });

  it('the policy refresh preserves a per-column autoAdvance customization on a numeric-level board', async () => {
    // Seed a stale default board that still sits at numeric autonomyLevel 5 but whose `ready`
    // (orchestrate) column a human deliberately pinned to {autoAdvance:false, mode:'manual'} via
    // updateWorkflowColumn. The one-time v9 migration must NOT re-cascade the L5 preset over that
    // tuned column (inv 17 fill-only): the customization survives, while the still-default columns
    // materialize their preset autoAdvance.
    let seed = createDefaultWorkflowBoard({ id: DEFAULT_WORKFLOW_BOARD_ID });
    let stale = {
      ...seed,
      columns: seed.columns.map((column) => {
        if (column.id !== 'ready') return column;
        return { ...column, automation: { ...column.automation, autoAdvance: false, mode: 'manual' } };
      }),
      version: 40,
      metadata: { defaultPolicyVersion: 7 },
    };
    sg.commit([{ op: 'set', path: `workflowBoards/${DEFAULT_WORKFLOW_BOARD_ID}`, value: stale }], 'test-seed');

    let service = makeService();
    let board = await readBoard(service);
    assert.equal(board.automation.autonomyLevel, 5);
    let byAction = columnsByAction(board);
    assert.equal(byAction.orchestrate.autoAdvance, false, 'tuned orchestrate column is not reverted');
    assert.equal(byAction.orchestrate.mode, 'manual', 'tuned orchestrate mode is preserved');
    for (let action of ['classify', 'scope', 'execute', 'audit', 'publish']) {
      assert.equal(byAction[action].autoAdvance, true, `${action} still materializes its L5 preset`);
    }
  });

  it('applyAutonomyLevel cascades a level-2 preset: intake auto-advances, later stages hold manual', () => {
    let service = makeService();
    let result = service.applyAutonomyLevel(
      { autonomyLevel: 2 },
      { principal: humanPrincipal({ label: 'local-human' }) },
    );
    assert.equal(result.ok, true);
    assert.equal(result.board.automation.autonomyLevel, 2);
    assert.equal(result.board.automation.publishMode, 'manual');
    let byAction = columnsByAction(result.board);
    assert.equal(byAction.classify.autoAdvance, true);
    assert.equal(byAction.scope.autoAdvance, true);
    assert.equal(byAction.orchestrate.autoAdvance, false);
    assert.equal(byAction.orchestrate.mode, 'manual');
    assert.equal(byAction.execute.autoAdvance, false);
    assert.equal(byAction.audit.autoAdvance, false);
    assert.equal(byAction.publish.autoAdvance, false);
  });

  it("applyAutonomyLevel 'manual' stamps manual and leaves a custom column untouched", () => {
    let service = makeService();
    let human = humanPrincipal({ label: 'local-human' });
    // Tune one column away from its L5 preset, then switch the board to 'manual': the preset must not
    // re-cascade, so the custom autoAdvance survives.
    service.updateWorkflowColumn(
      { columnId: 'ready', patch: { automation: { autoAdvance: false, mode: 'manual' } } },
      { principal: human },
    );
    let result = service.applyAutonomyLevel({ autonomyLevel: 'manual' }, { principal: human });
    assert.equal(result.ok, true);
    assert.equal(result.board.automation.autonomyLevel, 'manual');
    let byAction = columnsByAction(result.board);
    assert.equal(byAction.orchestrate.autoAdvance, false);
    assert.equal(byAction.orchestrate.mode, 'manual');
  });

  it('update_board with autonomyLevel routes to applyAutonomyLevel (not updateWorkflowBoard)', async () => {
    let service = makeService();
    let invoked = [];
    let spy = new Proxy(service, {
      get(target, prop, receiver) {
        let value = Reflect.get(target, prop, receiver);
        if ((prop === 'applyAutonomyLevel' || prop === 'updateWorkflowBoard') && typeof value === 'function') {
          return (...args) => { invoked.push(prop); return value.apply(target, args); };
        }
        return value;
      },
    });
    await handleWorkflowBoardTool(
      { workflowBoardService: spy },
      'workflow_board',
      { action: 'update_board', autonomyLevel: 2 },
      'mcp',
    );
    assert.deepEqual(invoked, ['applyAutonomyLevel']);

    invoked.length = 0;
    await handleWorkflowBoardTool(
      { workflowBoardService: spy },
      'workflow_board',
      { action: 'update_board', patch: { mode: 'manual' } },
      'mcp',
    );
    assert.deepEqual(invoked, ['updateWorkflowBoard']);
  });

  it('a READ+WRITE_CARD MCP principal is not allowed to apply an autonomy level', async () => {
    let service = makeService();
    // The MCP handler derives an mcp-client principal (READ + WRITE_CARD) for an unverified caller;
    // applyAutonomyLevel requires DEFINE/CONTROL, so the call is held, never silently applied.
    let result = await handleWorkflowBoardTool(
      { workflowBoardService: service },
      'workflow_board',
      { action: 'update_board', autonomyLevel: 1 },
      'mcp',
    );
    let payload = JSON.parse(result.content[0].text);
    assert.equal(payload.result.ok, false);
    assert.ok(payload.result.status === 'pendingApproval' || payload.result.status === 'blocked');
    assert.equal((await readBoard(service)).automation.autonomyLevel, 5);
  });

  it('update_board without any mutation field is rejected with a guided error', async () => {
    let service = makeService();
    let result = await handleWorkflowBoardTool(
      { workflowBoardService: service },
      'workflow_board',
      { action: 'update_board' },
      'mcp',
    );
    assert.equal(result.isError, true);
    let payload = JSON.parse(result.content[0].text);
    assert.match(payload.error, /autonomyLevel/);
  });
});
