import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  WORKFLOW_BOARD_TOOLS,
  handleWorkflowBoardTool,
  isWorkflowBoardTool,
} from '../../src/node/proxy/workflow-board-tools.js';

const ACTION_METHODS = {
  list_boards: 'listWorkflowBoards',
  get_board: 'getWorkflowBoard',
  create_item: 'createWorkItem',
  update_item: 'updateWorkItem',
  update_board: 'updateWorkflowBoard',
  control_board: 'controlWorkflowBoard',
  update_column: 'updateWorkflowColumn',
  delete_item: 'deleteWorkItem',
  transition: 'requestWorkflowTransition',
  orchestrate: 'orchestrateWorkItem',
  control: 'controlWorkItem',
  recovery: 'getWorkflowRecoveryState',
  reconcile: 'reconcileWorkflowRecovery',
  list_events: 'listWorkflowEvents',
};

function parseResult(result) {
  assert.equal(result.isError, undefined);
  return JSON.parse(result.content[0].text);
}

function parseError(result) {
  assert.equal(result.isError, true);
  return JSON.parse(result.content[0].text);
}

function createFakeWorkflowService(calls) {
  let service = {};
  for (let [action, methodName] of Object.entries(ACTION_METHODS)) {
    service[methodName] = async (args, context) => {
      calls.push({
        action,
        methodName,
        args,
        source: context.source,
        contextToolName: context.toolName,
        contextAction: context.action,
        hasProxyManager: Boolean(context.proxyManager),
      });
      return { ok: true, action, methodName, boardId: args.boardId, cardId: args.cardId };
    };
  }
  return service;
}

describe('workflow board MCP tool', () => {
  it('publishes one self-guiding workflow_board tool instead of per-action tools', () => {
    assert.deepEqual(WORKFLOW_BOARD_TOOLS.map(tool => tool.name), ['workflow_board']);
    assert.equal(isWorkflowBoardTool('workflow_board'), true);
    for (let oldName of [
      'list_workflow_boards',
      'get_workflow_board',
      'request_workflow_transition',
      'claim_work_item',
      'release_work_item',
      'resume_work_item',
      'import_workflow_work_items',
      'export_workflow_work_item',
    ]) {
      assert.equal(isWorkflowBoardTool(oldName), false, `${oldName} must not remain public`);
    }

    let schema = WORKFLOW_BOARD_TOOLS[0].inputSchema;
    assert.deepEqual(schema.required, ['action']);
    assert.equal(schema.properties.action.enum.includes('help'), true);
    assert.equal(schema.properties.action.enum.includes('transition'), true);
    assert.equal(schema.properties.action.enum.includes('update_board'), true);
    assert.equal(schema.properties.action.enum.includes('control_board'), true);
    assert.equal(schema.properties.action.enum.includes('update_column'), true);
    assert.equal(schema.properties.action.enum.includes('claim_work_item'), false);
    assert.equal(schema.properties.domain.type, 'string');
    assert.equal(schema.properties.assignedAgent.type, 'string');
    assert.equal(schema.properties.context.items.type, 'string');
    assert.equal(schema.properties.routingHints.items.type, 'string');
    assert.equal(schema.properties.blockers.items.type, 'string');
    assert.equal(schema.properties.metadata.type, 'object');
    assert.equal(schema.properties.checks.type, 'object');
  });

  it('returns a built-in help contract without requiring the workflow service', async () => {
    let result = await handleWorkflowBoardTool(
      {},
      'workflow_board',
      { action: 'help' },
      'test-source',
      { workflowService: {} },
    );
    let payload = parseResult(result);

    assert.equal(payload.ok, true);
    assert.equal(payload.schemaVersion, 'workflow-board-tool/v1');
    assert.equal(payload.tool, 'workflow_board');
    assert.equal(payload.defaultBoardId, 'agent-workflow-default');
    assert.deepEqual(payload.columns, [
      'ideas',
      'backlog',
      'ready',
      'in-progress',
      'quality-audit',
      'commit-publish',
      'done',
    ]);
    assert.equal(payload.actions.transition.required.includes('toColumnId'), true);
    assert.deepEqual(payload.actions.control_board.required, ['control']);
    assert.match(payload.rule, /Legacy per-action workflow MCP tool names are not public/);
  });

  it('routes each action through the injected workflow service with guided MCP JSON results', async () => {
    let calls = [];
    let workflowService = createFakeWorkflowService(calls);
    let proxyManager = { workflowBoardService: workflowService };

    let argsByAction = {
      list_boards: { action: 'list_boards', projectId: 'project-1' },
      get_board: { action: 'get_board', boardId: 'board-1', goalId: 'goal-1', chatId: 'chat-1', includeRuntime: true },
      create_item: {
        action: 'create_item',
        title: 'Task',
        owner: 'agent',
        assignedAgent: 'release-manager',
        domain: 'orchestration',
        resourceGroup: 'implementation',
        approvalMode: 'auto_edit',
        acceptanceCriteria: ['Verify facts'],
        context: ['Use current release packet'],
        routingHints: ['release'],
        blockers: ['Waiting for approval'],
        metadata: { requiredFinalMarker: 'RELEASE_APPROVAL_REVALIDATION' },
      },
      update_item: {
        action: 'update_item',
        cardId: 'card-1',
        patch: { owner: 'agent' },
        checks: { audit: { status: 'pass' } },
      },
      update_board: { action: 'update_board', patch: { mode: 'manual', automation: { pickup: 'manual' } } },
      control_board: { action: 'control_board', control: 'pause', projectId: 'project-1' },
      update_column: { action: 'update_column', columnId: 'ready', patch: { automation: { mode: 'gated' } } },
      delete_item: { action: 'delete_item', cardId: 'card-1' },
      transition: { action: 'transition', cardId: 'card-1', toColumnId: 'ready', expectedVersion: 7 },
      orchestrate: { action: 'orchestrate', cardId: 'card-1', resourceGroup: 'codex' },
      control: { action: 'control', cardId: 'card-1', control: 'pause' },
      recovery: { action: 'recovery', includeResolved: true },
      reconcile: { action: 'reconcile', force: true },
      list_events: { action: 'list_events', eventTypes: ['transition'] },
    };

    for (let [action, args] of Object.entries(argsByAction)) {
      let result = await handleWorkflowBoardTool(
        proxyManager,
        'workflow_board',
        args,
        'test-source',
      );
      let payload = parseResult(result);
      assert.equal(payload.tool, 'workflow_board');
      assert.equal(payload.action, action);
      assert.equal(payload.result.methodName, ACTION_METHODS[action]);
      assert.ok(Array.isArray(payload.hints));
    }

    assert.deepEqual(calls.map(call => call.methodName), Object.values(ACTION_METHODS));
    assert.equal(calls[0].source, 'test-source');
    assert.equal(calls[0].contextToolName, 'workflow_board');
    assert.equal(calls[0].contextAction, 'list_boards');
    assert.equal(calls[0].hasProxyManager, true);
    assert.equal(calls[1].args.boardId, 'board-1');
    assert.equal(calls[1].args.goalId, 'goal-1');
    assert.equal(calls[1].args.chatId, 'chat-1');
    assert.equal(calls[2].args.boardId, 'agent-workflow-default');
    assert.equal(calls[2].args.domain, 'orchestration');
    assert.equal(calls[2].args.assignedAgent, 'release-manager');
    assert.equal(calls[2].args.resourceGroup, 'implementation');
    assert.equal(calls[2].args.approvalMode, 'auto_edit');
    assert.deepEqual(calls[2].args.acceptanceCriteria, ['Verify facts']);
    assert.deepEqual(calls[2].args.context, ['Use current release packet']);
    assert.deepEqual(calls[2].args.routingHints, ['release']);
    assert.deepEqual(calls[2].args.blockers, ['Waiting for approval']);
    assert.deepEqual(calls[2].args.metadata, { requiredFinalMarker: 'RELEASE_APPROVAL_REVALIDATION' });
    assert.deepEqual(calls[3].args.checks, { audit: { status: 'pass' } });
    assert.equal(calls[4].args.patch.mode, 'manual');
    assert.equal(calls[5].args.action, 'pause');
    assert.equal(calls[6].args.columnId, 'ready');
    assert.equal(calls[8].args.expectedVersion, 7);
    assert.equal(calls[9].args.resource_group, 'codex');
    assert.equal(calls[10].args.action, 'pause');
  });

  it('preserves blocked transition gate semantics and suggests the next action', async () => {
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
      'workflow_board',
      {
        action: 'transition',
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

    let payload = parseResult(result);
    assert.equal(payload.result.status, 'blocked');
    assert.deepEqual(payload.result.gateResult, {
      allowed: false,
      gate: 'has_owner_and_acceptance',
      reason: 'Owner and acceptance criteria are required before In Progress.',
    });
    assert.equal(payload.next.recommendedAction, 'update_item');
    assert.equal(payload.next.call.action, 'update_item');
    assert.equal(calls[0].args.mode, 'gated');
    assert.equal(calls[0].context.source, 'mcp-test');
  });

  it('returns guided MCP errors for old tools, unknown actions, and missing fields', async () => {
    let oldTool = await handleWorkflowBoardTool(
      {},
      'request_workflow_transition',
      {},
      'test',
      { workflowService: {} },
    );
    assert.match(parseError(oldTool).error, /Use workflow_board/);

    let unknownAction = await handleWorkflowBoardTool(
      {},
      'workflow_board',
      { action: 'move_card_directly' },
      'test',
      { workflowService: {} },
    );
    let unknownPayload = parseError(unknownAction);
    assert.match(unknownPayload.error, /Unknown workflow_board action/);
    assert.equal(unknownPayload.supportedActions.includes('transition'), true);

    let missingField = await handleWorkflowBoardTool(
      {},
      'workflow_board',
      { action: 'transition', cardId: 'card-1' },
      'test',
      { workflowService: {} },
    );
    let missingPayload = parseError(missingField);
    assert.match(missingPayload.error, /toColumnId/);
    assert.deepEqual(missingPayload.required, ['cardId', 'toColumnId']);
    assert.equal(missingPayload.example.action, 'transition');
  });
});
