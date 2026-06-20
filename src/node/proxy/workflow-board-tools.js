import {
  DEFAULT_WORKFLOW_BOARD_ID,
  DEFAULT_WORKFLOW_COLUMN_IDS,
} from '../../iso/workflow-board.js';

const WORKFLOW_BOARD_TOOL_NAME = 'workflow_board';
const WORKFLOW_BOARD_TOOL_SCHEMA = 'workflow-board-tool/v1';

const ACTIONS = {
  help: {
    method: null,
    description: 'Return this tool guide, actions, required fields, columns, and examples.',
    required: [],
  },
  list_boards: {
    method: 'listWorkflowBoards',
    description: 'List workflow boards visible to the Portal workflow control plane.',
    required: [],
  },
  get_board: {
    method: 'getWorkflowBoard',
    description: 'Get one board projection with columns, cards, optional events, runtime data, or a compact status view.',
    required: [],
  },
  create_item: {
    method: 'createWorkItem',
    description: 'Create a workflow card/work item.',
    required: ['title'],
  },
  decompose: {
    method: 'decomposeWorkItem',
    description: 'Split a broad workflow card into first-class child cards without starting them automatically.',
    required: ['cardId', 'childItems'],
  },
  update_item: {
    method: 'updateWorkItem',
    description: 'Patch a workflow card/work item.',
    required: ['cardId'],
  },
  update_board: {
    method: 'updateWorkflowBoard',
    description: 'Patch board-level automation mode and defaults such as pickup, recovery, stop policy, fallback agents, and global parallel limit.',
    required: ['patch'],
  },
  control_board: {
    method: 'controlWorkflowBoard',
    description: 'Apply a board-level automation control action such as pause, resume, drain, stop, manual, recovery_only, or maintenance.',
    required: ['control'],
  },
  update_column: {
    method: 'updateWorkflowColumn',
    description: 'Patch column automation settings such as trigger, mode, agent pool, and parallel limit.',
    required: ['columnId', 'patch'],
  },
  delete_item: {
    method: 'deleteWorkItem',
    description: 'Remove a workflow card from the board while preserving audited transition history.',
    required: ['cardId'],
  },
  transition: {
    method: 'requestWorkflowTransition',
    description: 'Move a card through the shared gated transition engine. Entering auto columns can trigger orchestration.',
    required: ['cardId', 'toColumnId'],
  },
  orchestrate: {
    method: 'orchestrateWorkItem',
    description: 'Ask the Portal orchestrator to run an eligible work item.',
    required: ['cardId'],
  },
  control: {
    method: 'controlWorkItem',
    description: 'Pause, stop, or cancel a running/active workflow card.',
    required: ['cardId', 'control'],
  },
  recovery: {
    method: 'getWorkflowRecoveryState',
    description: 'Read recovery state for restart and resume decisions.',
    required: [],
  },
  reconcile: {
    method: 'reconcileWorkflowRecovery',
    description: 'Persist recovery flags and recovery run state for active workflow cards.',
    required: [],
  },
  list_events: {
    method: 'listWorkflowEvents',
    description: 'List audited workflow events.',
    required: [],
  },
};

const ACTION_ORDER = Object.keys(ACTIONS);

const ACTION_EXAMPLES = {
  help: { action: 'help' },
  get_board: { action: 'get_board', boardId: DEFAULT_WORKFLOW_BOARD_ID, projectId: 'project-id' },
  create_item: {
    action: 'create_item',
    boardId: DEFAULT_WORKFLOW_BOARD_ID,
    title: 'Implement workflow kanban',
    projectId: 'project-id',
    owner: 'orchestrator',
    acceptanceCriteria: ['Tests pass', 'Audit is clean'],
  },
  decompose: {
    action: 'decompose',
    boardId: DEFAULT_WORKFLOW_BOARD_ID,
    cardId: 'parent-card-id',
    childItems: [
      {
        title: 'Audit scoped contract',
        owner: 'code-reviewer',
        acceptanceCriteria: ['Audit result is recorded'],
      },
    ],
  },
  transition: {
    action: 'transition',
    boardId: DEFAULT_WORKFLOW_BOARD_ID,
    cardId: 'card-id',
    toColumnId: 'in-progress',
    reason: 'Starting accepted work',
  },
  orchestrate: {
    action: 'orchestrate',
    boardId: DEFAULT_WORKFLOW_BOARD_ID,
    cardId: 'card-id',
    reason: 'Card entered the ready column',
  },
  delete_item: {
    action: 'delete_item',
    boardId: DEFAULT_WORKFLOW_BOARD_ID,
    cardId: 'card-id',
    reason: 'Remove obsolete work item',
  },
  update_column: {
    action: 'update_column',
    boardId: DEFAULT_WORKFLOW_BOARD_ID,
    columnId: 'ready',
    patch: {
      automation: {
        trigger: 'on_enter',
        action: 'orchestrate',
        mode: 'auto',
        agents: ['orchestrator'],
        parallelLimit: 4,
      },
    },
  },
  update_board: {
    action: 'update_board',
    boardId: DEFAULT_WORKFLOW_BOARD_ID,
    patch: {
      mode: 'armed',
      automation: {
        pickup: 'auto',
        globalParallelLimit: 8,
        fallbackAgents: ['orchestrator'],
      },
    },
  },
  control_board: {
    action: 'control_board',
    boardId: DEFAULT_WORKFLOW_BOARD_ID,
    control: 'pause',
    reason: 'Pause scheduling and active workflow runs',
  },
  control: {
    action: 'control',
    boardId: DEFAULT_WORKFLOW_BOARD_ID,
    cardId: 'card-id',
    control: 'pause',
    reason: 'Waiting for user input',
  },
};

const SERVICE_IMPORT_ERROR = 'Workflow board service is unavailable. Provide ' +
  'options.workflowService, proxyManager.workflowBoardService, or implement ' +
  'src/node/workflow-board-service.js with getWorkflowBoardService().';

export const WORKFLOW_BOARD_TOOLS = [
  {
    name: WORKFLOW_BOARD_TOOL_NAME,
    description: 'Single self-guiding Agent Portal workflow board command tool. Use action=help for the contract. Do not use legacy workflow-board tool names.',
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ACTION_ORDER,
          description: 'Workflow command. Use help when unsure.',
        },
        boardId: {
          type: 'string',
          description: `Workflow board ID. Defaults to ${DEFAULT_WORKFLOW_BOARD_ID}.`,
        },
        projectId: { type: 'string', description: 'Optional project scope.' },
        goalId: { type: 'string', description: 'Optional goal-linked workflow card filter.' },
        chatId: { type: 'string', description: 'Optional chat-linked workflow card filter.' },
        scope: { type: 'string', enum: ['home', 'project'], description: 'Optional board scope for list_boards.' },
        includeArchived: { type: 'boolean', description: 'Include archived boards for list_boards.' },
        includeCards: { type: 'boolean', description: 'Include cards for get_board. Defaults to true.' },
        includeEvents: { type: 'boolean', description: 'Include recent events for get_board.' },
        includeRuntime: { type: 'boolean', description: 'Include linked runtime projection for get_board.' },
        compact: { type: 'boolean', description: 'Return a bounded status projection for L1 monitoring instead of full card history.' },
        view: { type: 'string', enum: ['status'], description: 'Projection view for get_board. Use status for compact monitoring.' },
        includeResolved: { type: 'boolean', description: 'Include resolved recovery records for recovery.' },
        cardId: { type: 'string', description: 'Workflow card/work-item ID.' },
        parentCardId: { type: 'string', description: 'Parent workflow card ID for child cards.' },
        title: { type: 'string', description: 'Work-item title for create_item.' },
        body: { type: 'string', description: 'Optional work-item body for create_item.' },
        childItems: {
          type: 'array',
          items: { type: 'object' },
          description: 'Child card definitions for action=decompose.',
        },
        kind: { type: 'string', description: 'Optional work-item kind.' },
        priority: { type: 'string', description: 'Optional priority.' },
        domain: { type: 'string', description: 'Optional work-item domain for classification gates.' },
        columnId: { type: 'string', description: 'Initial column for create_item.' },
        childColumnId: { type: 'string', description: 'Initial column for child cards created by action=decompose.' },
        automation: { type: 'object', description: 'Column automation patch for action=update_column.' },
        owner: { type: 'string', description: 'Optional work-item owner.' },
        assignedAgent: { type: 'string', description: 'Optional preferred agent for create_item routing.' },
        acceptanceCriteria: {
          type: 'array',
          items: { type: 'string' },
          description: 'Acceptance criteria for gated transitions.',
        },
        context: {
          type: 'array',
          items: { type: 'string' },
          description: 'Durable work-item context lines for create_item.',
        },
        routingHints: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional routing hints for create_item.',
        },
        blockers: {
          type: 'array',
          items: { type: 'string' },
          description: 'Known work-item blockers for create_item.',
        },
        metadata: { type: 'object', description: 'Optional work-item metadata for create_item.' },
        patch: { type: 'object', description: 'Fields to patch for update_item.' },
        checks: { type: 'object', description: 'Optional gate checks for update_item.' },
        fromColumnId: { type: 'string', description: 'Expected current column for transition.' },
        toColumnId: { type: 'string', enum: DEFAULT_WORKFLOW_COLUMN_IDS, description: 'Destination column for transition.' },
        mode: { type: 'string', enum: ['manual', 'auto', 'gated'], description: 'Transition or orchestration mode.' },
        boardMode: { type: 'string', enum: ['passive', 'armed', 'autonomous', 'manual', 'paused', 'draining', 'stopped', 'maintenance', 'recovery_only'], description: 'Board mode for action=control_board resume overrides.' },
        control: { type: 'string', enum: ['pause', 'stop', 'cancel', 'resume', 'drain', 'maintenance', 'manual', 'recovery_only', 'arm'], description: 'Runtime control action for action=control or board action for action=control_board.' },
        reason: { type: 'string', description: 'Human/audit reason.' },
        actor: { type: 'string', description: 'Actor requesting the command.' },
        entityRefs: { type: 'object', description: 'Linked goals, chats, tasks, or files.' },
        expectedVersion: { type: 'number', description: 'Optimistic version guard.' },
        resourceGroup: { type: 'string', description: 'Optional resource group for create_item or orchestrate.' },
        approvalMode: { type: 'string', enum: ['yolo', 'auto_edit', 'plan'], description: 'Approval mode for create_item or orchestrate.' },
        eventTypes: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional event type filter for list_events.',
        },
        after: { type: 'string', description: 'Return events after this cursor or timestamp.' },
        before: { type: 'string', description: 'Return events before this cursor or timestamp.' },
        limit: { type: 'number', description: 'Maximum records to return.' },
        force: { type: 'boolean', description: 'Force recovery reconciliation record persistence.' },
      },
      required: ['action'],
    },
  },
];

export function isWorkflowBoardTool(toolName = '') {
  return String(toolName || '') === WORKFLOW_BOARD_TOOL_NAME;
}

function textResult(value, extra = {}) {
  let payload = typeof value === 'string' ? { ok: false, error: value } : value;
  return {
    ...extra,
    content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }],
  };
}

function errorResult(message, details = {}) {
  return textResult({
    ok: false,
    schemaVersion: WORKFLOW_BOARD_TOOL_SCHEMA,
    tool: WORKFLOW_BOARD_TOOL_NAME,
    error: message,
    ...details,
  }, { isError: true });
}

function isMcpResult(value) {
  return Boolean(value && typeof value === 'object' && Array.isArray(value.content));
}

function missingServiceError(error) {
  return error?.code === 'ERR_MODULE_NOT_FOUND'
    && String(error.message || '').includes('workflow-board-service.js');
}

function hasValue(value) {
  return value !== undefined && value !== null && value !== '';
}

function cleanUndefined(input = {}) {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined),
  );
}

function helpPayload() {
  return {
    ok: true,
    schemaVersion: WORKFLOW_BOARD_TOOL_SCHEMA,
    tool: WORKFLOW_BOARD_TOOL_NAME,
    defaultBoardId: DEFAULT_WORKFLOW_BOARD_ID,
    columns: DEFAULT_WORKFLOW_COLUMN_IDS,
    rule: 'Use this single workflow_board tool for board operations. Legacy per-action workflow MCP tool names are not public.',
    actions: Object.fromEntries(
      ACTION_ORDER.map(action => [
        action,
        {
          description: ACTIONS[action].description,
          required: ACTIONS[action].required,
          example: ACTION_EXAMPLES[action] || { action, boardId: DEFAULT_WORKFLOW_BOARD_ID },
        },
      ]),
    ),
  };
}

function validateActionArgs(action, args = {}) {
  let config = ACTIONS[action];
  if (!config) {
    return {
      ok: false,
      message: `Unknown workflow_board action: ${action || '(missing)'}.`,
      details: {
        supportedActions: ACTION_ORDER,
        example: ACTION_EXAMPLES.help,
      },
    };
  }

  let missing = config.required.filter(field => !hasValue(args[field]));
  if (missing.length > 0) {
    return {
      ok: false,
      message: `Missing required field${missing.length === 1 ? '' : 's'} for action=${action}: ${missing.join(', ')}.`,
      details: {
        action,
        required: config.required,
        example: ACTION_EXAMPLES[action] || { action, boardId: DEFAULT_WORKFLOW_BOARD_ID },
      },
    };
  }

  if (action === 'control' && !['pause', 'stop', 'cancel'].includes(args.control)) {
    return {
      ok: false,
      message: 'Invalid control value. Supported values: pause, stop, cancel.',
      details: {
        action,
        required: config.required,
        example: ACTION_EXAMPLES.control,
      },
    };
  }

  if (action === 'control_board' && !['pause', 'resume', 'drain', 'stop', 'maintenance', 'manual', 'recovery_only', 'arm'].includes(args.control)) {
    return {
      ok: false,
      message: 'Invalid board control value. Supported values: pause, resume, drain, stop, maintenance, manual, recovery_only, arm.',
      details: {
        action,
        required: config.required,
        example: ACTION_EXAMPLES.control_board,
      },
    };
  }

  if (action === 'transition' && !DEFAULT_WORKFLOW_COLUMN_IDS.includes(args.toColumnId)) {
    return {
      ok: false,
      message: `Invalid toColumnId. Supported columns: ${DEFAULT_WORKFLOW_COLUMN_IDS.join(', ')}.`,
      details: {
        action,
        columns: DEFAULT_WORKFLOW_COLUMN_IDS,
        example: ACTION_EXAMPLES.transition,
      },
    };
  }

  return { ok: true };
}

function serviceArgsForAction(action, args = {}) {
  let common = cleanUndefined({
    boardId: args.boardId || DEFAULT_WORKFLOW_BOARD_ID,
    projectId: args.projectId,
    goalId: args.goalId,
    chatId: args.chatId,
    cardId: args.cardId,
    actor: args.actor,
    reason: args.reason,
    expectedVersion: args.expectedVersion,
    entityRefs: args.entityRefs,
    limit: args.limit,
  });

  if (action === 'list_boards') {
    return cleanUndefined({
      projectId: args.projectId,
      scope: args.scope,
      includeArchived: args.includeArchived,
      limit: args.limit,
    });
  }
  if (action === 'get_board') {
    return cleanUndefined({
      ...common,
      includeCards: args.includeCards,
      includeEvents: args.includeEvents,
      includeRuntime: args.includeRuntime,
      compact: args.compact,
      view: args.view,
    });
  }
  if (action === 'create_item') {
    return cleanUndefined({
      ...common,
      title: args.title,
      body: args.body,
      kind: args.kind,
      priority: args.priority,
      domain: args.domain,
      columnId: args.columnId,
      parentCardId: args.parentCardId,
      owner: args.owner,
      assignedAgent: args.assignedAgent,
      resourceGroup: args.resourceGroup,
      approvalMode: args.approvalMode,
      acceptanceCriteria: args.acceptanceCriteria,
      context: args.context,
      routingHints: args.routingHints,
      blockers: args.blockers,
      metadata: args.metadata,
    });
  }
  if (action === 'update_item') {
    return cleanUndefined({
      ...common,
      patch: args.patch,
      checks: args.checks,
    });
  }
  if (action === 'decompose') {
    return cleanUndefined({
      ...common,
      childItems: args.childItems,
      childColumnId: args.childColumnId,
      columnId: args.columnId,
    });
  }
  if (action === 'update_board') {
    return cleanUndefined({
      ...common,
      mode: args.boardMode,
      automation: args.automation,
      patch: args.patch,
    });
  }
  if (action === 'control_board') {
    return cleanUndefined({
      ...common,
      action: args.control,
      mode: args.boardMode,
    });
  }
  if (action === 'update_column') {
    return cleanUndefined({
      ...common,
      columnId: args.columnId,
      automation: args.automation,
      patch: args.patch,
    });
  }
  if (action === 'delete_item') {
    return common;
  }
  if (action === 'transition') {
    return cleanUndefined({
      ...common,
      fromColumnId: args.fromColumnId,
      toColumnId: args.toColumnId,
      mode: args.mode,
    });
  }
  if (action === 'orchestrate') {
    return cleanUndefined({
      ...common,
      mode: args.mode,
      resource_group: args.resourceGroup,
      approval_mode: args.approvalMode,
    });
  }
  if (action === 'control') {
    return cleanUndefined({
      ...common,
      action: args.control,
    });
  }
  if (action === 'recovery') {
    return cleanUndefined({
      ...common,
      includeResolved: args.includeResolved,
    });
  }
  if (action === 'reconcile') {
    return cleanUndefined({
      ...common,
      force: args.force,
    });
  }
  if (action === 'list_events') {
    return cleanUndefined({
      ...common,
      eventTypes: args.eventTypes,
      after: args.after,
      before: args.before,
    });
  }
  return common;
}

function nextForAction(action, args = {}, result = {}) {
  let boardId = args.boardId || result.boardId || result.board?.id || DEFAULT_WORKFLOW_BOARD_ID;
  let cardId = args.cardId || result.cardId || result.card?.id || result.id || null;

  if (action === 'create_item') {
    return {
      recommendedAction: 'transition',
      reason: 'New work items usually need classification/scoping before orchestration.',
      call: cleanUndefined({ action: 'transition', boardId, cardId, toColumnId: 'backlog' }),
    };
  }
  if (action === 'transition') {
    if (result.status === 'blocked') {
      return {
        recommendedAction: 'update_item',
        reason: 'The transition was blocked by gates; update missing card fields or checks, then retry transition.',
        call: cleanUndefined({ action: 'update_item', boardId, cardId, patch: {} }),
      };
    }
    if (args.toColumnId === 'ready') {
      if (result.orchestration?.ok) {
        return {
          recommendedAction: 'get_board',
          reason: 'The ready column auto-started orchestration; refresh the board to inspect run and lease state.',
          call: cleanUndefined({ action: 'get_board', boardId, projectId: args.projectId, includeRuntime: true }),
        };
      }
      return {
        recommendedAction: 'orchestrate',
        reason: 'The ready column is configured for orchestrator handoff, but no automatic run was started.',
        call: cleanUndefined({ action: 'orchestrate', boardId, cardId }),
      };
    }
    return {
      recommendedAction: 'get_board',
      reason: 'Refresh the board projection after a workflow transition.',
      call: cleanUndefined({ action: 'get_board', boardId, projectId: args.projectId }),
    };
  }
  if (action === 'recovery') {
    return {
      recommendedAction: 'reconcile',
      reason: 'Persist recovery flags before resuming or orchestrating cards after restart.',
      call: cleanUndefined({ action: 'reconcile', boardId, projectId: args.projectId }),
    };
  }
  if (action === 'reconcile') {
    return {
      recommendedAction: 'get_board',
      reason: 'Refresh the board to inspect persisted recovery flags.',
      call: cleanUndefined({ action: 'get_board', boardId, projectId: args.projectId, includeRuntime: true }),
    };
  }
  if (action === 'orchestrate' || action === 'control' || action === 'control_board' || action === 'update_item' || action === 'update_board' || action === 'update_column' || action === 'delete_item') {
    return {
      recommendedAction: 'get_board',
      reason: 'Refresh board state after runtime or card mutation.',
      call: cleanUndefined({ action: 'get_board', boardId, projectId: args.projectId, includeRuntime: true }),
    };
  }
  return null;
}

function hintsForAction(action, result = {}) {
  let hints = [
    'Use action=help when unsure which workflow_board command to call.',
    'Use action=get_board to refresh current board state before deciding the next mutation.',
  ];
  if (action === 'get_board') {
    hints.push('Use action=transition for column moves; do not mutate columnId directly.');
  }
  if (result?.status === 'blocked' || result?.ok === false) {
    hints.push('Read gateResult/failures, then use action=update_item or checks before retrying.');
  }
  return hints;
}

function wrapResult(action, args, result) {
  return {
    ok: result?.ok === false ? false : true,
    schemaVersion: WORKFLOW_BOARD_TOOL_SCHEMA,
    tool: WORKFLOW_BOARD_TOOL_NAME,
    action,
    result,
    next: nextForAction(action, args, result),
    hints: hintsForAction(action, result),
  };
}

export async function resolveWorkflowBoardService(proxyManager = null, options = {}) {
  if (options.workflowService) return options.workflowService;
  if (proxyManager?.workflowBoardService) return proxyManager.workflowBoardService;

  let mod;
  try {
    mod = await import('../workflow-board-service.js');
  } catch (error) {
    if (missingServiceError(error)) {
      throw new Error(SERVICE_IMPORT_ERROR);
    }
    throw error;
  }

  if (typeof mod.getWorkflowBoardService === 'function') {
    return mod.getWorkflowBoardService(proxyManager, options);
  }
  if (mod.workflowBoardService) return mod.workflowBoardService;
  if (mod.default) {
    return typeof mod.default === 'function'
      ? mod.default(proxyManager, options)
      : mod.default;
  }

  throw new Error(
    'src/node/workflow-board-service.js must export getWorkflowBoardService() ' +
    'or workflowBoardService.',
  );
}

function getWorkflowServiceMethod(service, action) {
  let methodName = ACTIONS[action]?.method;
  if (!methodName) return null;
  if (typeof service?.[methodName] !== 'function') {
    throw new Error(
      `Workflow board service is missing ${methodName}() required by workflow_board action=${action}.`,
    );
  }
  return service[methodName].bind(service);
}

export async function handleWorkflowBoardTool(
  proxyManager,
  toolName,
  args = {},
  source = 'mcp',
  options = {},
) {
  if (!isWorkflowBoardTool(toolName)) {
    return errorResult(`Unknown workflow board tool: ${toolName}. Use ${WORKFLOW_BOARD_TOOL_NAME}.`);
  }

  let action = String(args.action || '').trim();
  if (action === 'help') return textResult(helpPayload());

  let validation = validateActionArgs(action, args);
  if (!validation.ok) return errorResult(validation.message, validation.details);

  let service;
  try {
    service = await resolveWorkflowBoardService(proxyManager, options);
  } catch (error) {
    return errorResult(error.message, { action });
  }

  let method;
  try {
    method = getWorkflowServiceMethod(service, action);
  } catch (error) {
    return errorResult(error.message, { action });
  }

  let context = {
    ...(options.context || {}),
    source,
    toolName,
    action,
    proxyManager,
  };
  let serviceArgs = serviceArgsForAction(action, args);
  let result;
  try {
    result = await method(serviceArgs, context);
  } catch (error) {
    return errorResult(`Workflow board service failed for action=${action}: ${error.message}`, {
      action,
      example: ACTION_EXAMPLES[action] || ACTION_EXAMPLES.help,
    });
  }
  if (isMcpResult(result)) return result;
  return textResult(wrapResult(action, serviceArgs, result ?? { ok: true }));
}
