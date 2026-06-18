import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  WORKFLOW_BOARD_TOOLS,
  handleWorkflowBoardTool,
  isWorkflowBoardTool,
} from '../../src/node/proxy/workflow-board-tools.js';

const TOOL_METHODS = {
  list_workflow_boards: 'listWorkflowBoards',
  get_workflow_board: 'getWorkflowBoard',
  create_work_item: 'createWorkItem',
  update_work_item: 'updateWorkItem',
  request_workflow_transition: 'requestWorkflowTransition',
  claim_work_item: 'claimWorkItem',
  release_work_item: 'releaseWorkItem',
  orchestrate_work_item: 'orchestrateWorkItem',
  resume_work_item: 'resumeWorkItem',
  control_work_item: 'controlWorkItem',
  reconcile_workflow_recovery: 'reconcileWorkflowRecovery',
  import_workflow_work_items: 'importWorkflowWorkItems',
  export_workflow_work_item: 'exportWorkflowWorkItem',
  get_workflow_recovery_state: 'getWorkflowRecoveryState',
  list_workflow_events: 'listWorkflowEvents',
};

function parseResult(result) {
  assert.equal(result.isError, undefined);
  return JSON.parse(result.content[0].text);
}

function createFakeWorkflowService(calls) {
  let service = {};
  for (let [toolName, methodName] of Object.entries(TOOL_METHODS)) {
    service[methodName] = async (args, context) => {
      calls.push({
        toolName,
        methodName,
        args,
        source: context.source,
        contextToolName: context.toolName,
        hasProxyManager: Boolean(context.proxyManager),
      });
      return { ok: true, toolName, methodName, args };
    };
  }
  return service;
}

describe('workflow board MCP tools', () => {
  it('defines the Portal workflow-board tool surface', () => {
    let names = WORKFLOW_BOARD_TOOLS.map(tool => tool.name);

    assert.deepEqual(names, Object.keys(TOOL_METHODS));
    for (let name of names) {
      assert.equal(isWorkflowBoardTool(name), true, `expected ${name} to be recognized`);
    }
    assert.equal(isWorkflowBoardTool('delegate_task'), false);
  });

  it('routes each tool to the injected workflow service with MCP JSON results', async () => {
    let calls = [];
    let workflowService = createFakeWorkflowService(calls);
    let proxyManager = { workflowBoardService: workflowService };

    for (let toolName of Object.keys(TOOL_METHODS)) {
      let result = await handleWorkflowBoardTool(
        proxyManager,
        toolName,
        {
          id: 'generic-id',
          board_id: 'board-1',
          card_id: 'card-1',
          actor_id: 'agent-1',
          expected_version: 7,
        },
        'test-source',
      );
      let payload = parseResult(result);
      assert.equal(payload.toolName, toolName);
      assert.equal(payload.methodName, TOOL_METHODS[toolName]);
    }

    assert.deepEqual(calls.map(call => call.methodName), Object.values(TOOL_METHODS));
    assert.equal(calls[0].source, 'test-source');
    assert.equal(calls[0].contextToolName, 'list_workflow_boards');
    assert.equal(calls[0].hasProxyManager, true);
    assert.equal(calls[1].args.boardId, 'board-1');
    assert.equal(calls[3].args.cardId, 'card-1');
    assert.equal(calls[4].args.expectedVersion, 7);
    assert.equal(calls[4].args.actor, 'agent-1');
  });

  it('preserves blocked transition gate semantics as a non-error tool result', async () => {
    let calls = [];
    let workflowService = {
      requestWorkflowTransition: async (args, context) => {
        calls.push({ args, context });
        return {
          ok: true,
          status: 'blocked',
          boardId: args.boardId,
          cardId: args.cardId,
          gateResult: {
            allowed: false,
            gate: 'has_owner_and_acceptance',
            reason: 'Owner and acceptance criteria are required before In Progress.',
          },
          sideEffects: [],
          approvalRequired: false,
          rollbackColumnId: args.fromColumnId,
        };
      },
    };

    let result = await handleWorkflowBoardTool(
      {},
      'request_workflow_transition',
      {
        boardId: 'board-1',
        cardId: 'card-1',
        fromColumnId: 'ready',
        toColumnId: 'in-progress',
        actor: 'orchestrator',
        mode: 'gated',
        reason: 'start accepted work',
        expectedVersion: 11,
      },
      'mcp-test',
      { workflowService },
    );

    assert.equal(result.isError, undefined);
    let payload = JSON.parse(result.content[0].text);
    assert.equal(payload.status, 'blocked');
    assert.deepEqual(payload.gateResult, {
      allowed: false,
      gate: 'has_owner_and_acceptance',
      reason: 'Owner and acceptance criteria are required before In Progress.',
    });
    assert.deepEqual(payload.sideEffects, []);
    assert.equal(payload.rollbackColumnId, 'ready');
    assert.equal(calls[0].args.mode, 'gated');
    assert.equal(calls[0].context.source, 'mcp-test');
  });

  it('returns MCP errors for unknown tools and missing service methods', async () => {
    let unknown = await handleWorkflowBoardTool(
      {},
      'move_card_directly',
      {},
      'test',
      { workflowService: {} },
    );
    assert.equal(unknown.isError, true);
    assert.match(JSON.parse(unknown.content[0].text).error, /Unknown workflow board tool/);

    let missingMethod = await handleWorkflowBoardTool(
      {},
      'claim_work_item',
      { boardId: 'board-1', cardId: 'card-1' },
      'test',
      { workflowService: {} },
    );
    assert.equal(missingMethod.isError, true);
    assert.match(JSON.parse(missingMethod.content[0].text).error, /claimWorkItem/);
  });
});
