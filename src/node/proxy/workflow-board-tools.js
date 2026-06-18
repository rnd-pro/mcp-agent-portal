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

const SERVICE_IMPORT_ERROR = 'Workflow board service is unavailable. Provide ' +
  'options.workflowService, proxyManager.workflowBoardService, or implement ' +
  'src/node/workflow-board-service.js with getWorkflowBoardService().';

export const WORKFLOW_BOARD_TOOLS = [
  {
    name: 'list_workflow_boards',
    description: 'List workflow boards visible to the Portal workflow control plane.',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'string', description: 'Optional project filter.' },
        project_id: { type: 'string', description: 'Alias for projectId.' },
        scope: { type: 'string', enum: ['home', 'project'], description: 'Optional board scope.' },
        includeArchived: { type: 'boolean', description: 'Include archived boards.' },
        limit: { type: 'number', description: 'Maximum number of boards to return.' },
      },
    },
  },
  {
    name: 'get_workflow_board',
    description: 'Get one workflow board projection, optionally scoped to a project.',
    inputSchema: {
      type: 'object',
      properties: {
        boardId: { type: 'string', description: 'Workflow board ID.' },
        board_id: { type: 'string', description: 'Alias for boardId.' },
        id: { type: 'string', description: 'Alias for boardId.' },
        projectId: { type: 'string', description: 'Optional project filter.' },
        project_id: { type: 'string', description: 'Alias for projectId.' },
        includeCards: { type: 'boolean', description: 'Include board cards. Defaults to true.' },
        includeEvents: { type: 'boolean', description: 'Include recent transition events.' },
        includeRuntime: { type: 'boolean', description: 'Include linked runtime projection.' },
      },
      required: ['boardId'],
    },
  },
  {
    name: 'create_work_item',
    description: 'Create a workflow work item through the shared workflow board service.',
    inputSchema: {
      type: 'object',
      properties: {
        boardId: { type: 'string', description: 'Workflow board ID.' },
        board_id: { type: 'string', description: 'Alias for boardId.' },
        projectId: { type: 'string', description: 'Optional project ID.' },
        project_id: { type: 'string', description: 'Alias for projectId.' },
        title: { type: 'string', description: 'Work item title.' },
        body: { type: 'string', description: 'Optional work item body.' },
        kind: { type: 'string', description: 'Work item kind.' },
        priority: { type: 'string', description: 'Optional priority.' },
        columnId: { type: 'string', description: 'Initial workflow column ID.' },
        column_id: { type: 'string', description: 'Alias for columnId.' },
        owner: { type: 'string', description: 'Optional owner.' },
        acceptanceCriteria: {
          type: 'array',
          items: { type: 'string' },
          description: 'Acceptance criteria for gated transitions.',
        },
        acceptance_criteria: {
          type: 'array',
          items: { type: 'string' },
          description: 'Alias for acceptanceCriteria.',
        },
        entityRefs: { type: 'object', description: 'Linked goals, chats, tasks, or files.' },
        entity_refs: { type: 'object', description: 'Alias for entityRefs.' },
        metadata: { type: 'object', description: 'Additional workflow metadata.' },
      },
      required: ['title'],
    },
  },
  {
    name: 'update_work_item',
    description: 'Update a workflow work item through the shared workflow board service.',
    inputSchema: {
      type: 'object',
      properties: {
        boardId: { type: 'string', description: 'Workflow board ID.' },
        board_id: { type: 'string', description: 'Alias for boardId.' },
        cardId: { type: 'string', description: 'Workflow card or work item ID.' },
        card_id: { type: 'string', description: 'Alias for cardId.' },
        workItemId: { type: 'string', description: 'Alias for cardId.' },
        work_item_id: { type: 'string', description: 'Alias for cardId.' },
        id: { type: 'string', description: 'Alias for cardId.' },
        patch: { type: 'object', description: 'Fields to update.' },
        reason: { type: 'string', description: 'Reason for the update.' },
        expectedVersion: { type: 'number', description: 'Optimistic version guard.' },
        expected_version: { type: 'number', description: 'Alias for expectedVersion.' },
      },
      required: ['cardId'],
    },
  },
  {
    name: 'request_workflow_transition',
    description: 'Request a workflow transition through the shared gate engine.',
    inputSchema: {
      type: 'object',
      properties: {
        boardId: { type: 'string', description: 'Workflow board ID.' },
        board_id: { type: 'string', description: 'Alias for boardId.' },
        cardId: { type: 'string', description: 'Workflow card or work item ID.' },
        card_id: { type: 'string', description: 'Alias for cardId.' },
        workItemId: { type: 'string', description: 'Alias for cardId.' },
        work_item_id: { type: 'string', description: 'Alias for cardId.' },
        fromColumnId: { type: 'string', description: 'Expected current column ID.' },
        from_column_id: { type: 'string', description: 'Alias for fromColumnId.' },
        toColumnId: { type: 'string', description: 'Requested destination column ID.' },
        to_column_id: { type: 'string', description: 'Alias for toColumnId.' },
        actor: { type: 'string', description: 'Actor requesting the transition.' },
        actor_id: { type: 'string', description: 'Alias for actor.' },
        mode: {
          type: 'string',
          enum: ['manual', 'auto', 'gated'],
          description: 'Transition mode.',
        },
        reason: { type: 'string', description: 'Transition reason.' },
        entityRefs: { type: 'object', description: 'Linked goals, chats, tasks, or files.' },
        entity_refs: { type: 'object', description: 'Alias for entityRefs.' },
        expectedVersion: { type: 'number', description: 'Optimistic version guard.' },
        expected_version: { type: 'number', description: 'Alias for expectedVersion.' },
      },
      required: ['boardId', 'cardId', 'fromColumnId', 'toColumnId'],
    },
  },
  {
    name: 'claim_work_item',
    description: 'Claim a work item lease through the workflow board service.',
    inputSchema: {
      type: 'object',
      properties: {
        boardId: { type: 'string', description: 'Workflow board ID.' },
        board_id: { type: 'string', description: 'Alias for boardId.' },
        cardId: { type: 'string', description: 'Workflow card or work item ID.' },
        card_id: { type: 'string', description: 'Alias for cardId.' },
        workItemId: { type: 'string', description: 'Alias for cardId.' },
        work_item_id: { type: 'string', description: 'Alias for cardId.' },
        actor: { type: 'string', description: 'Actor claiming the work item.' },
        actor_id: { type: 'string', description: 'Alias for actor.' },
        leaseOwner: { type: 'string', description: 'Lease owner ID.' },
        lease_owner: { type: 'string', description: 'Alias for leaseOwner.' },
        ttlMs: { type: 'number', description: 'Optional lease TTL in milliseconds.' },
        ttl_ms: { type: 'number', description: 'Alias for ttlMs.' },
        reason: { type: 'string', description: 'Claim reason.' },
        expectedVersion: { type: 'number', description: 'Optimistic version guard.' },
        expected_version: { type: 'number', description: 'Alias for expectedVersion.' },
      },
      required: ['cardId'],
    },
  },
  {
    name: 'release_work_item',
    description: 'Release a work item lease through the workflow board service.',
    inputSchema: {
      type: 'object',
      properties: {
        boardId: { type: 'string', description: 'Workflow board ID.' },
        board_id: { type: 'string', description: 'Alias for boardId.' },
        cardId: { type: 'string', description: 'Workflow card or work item ID.' },
        card_id: { type: 'string', description: 'Alias for cardId.' },
        workItemId: { type: 'string', description: 'Alias for cardId.' },
        work_item_id: { type: 'string', description: 'Alias for cardId.' },
        actor: { type: 'string', description: 'Actor releasing the work item.' },
        actor_id: { type: 'string', description: 'Alias for actor.' },
        leaseOwner: { type: 'string', description: 'Lease owner ID.' },
        lease_owner: { type: 'string', description: 'Alias for leaseOwner.' },
        reason: { type: 'string', description: 'Release reason.' },
        expectedVersion: { type: 'number', description: 'Optimistic version guard.' },
        expected_version: { type: 'number', description: 'Alias for expectedVersion.' },
      },
      required: ['cardId'],
    },
  },
  {
    name: 'orchestrate_work_item',
    description: 'Ask the workflow service to orchestrate an eligible work item.',
    inputSchema: {
      type: 'object',
      properties: {
        boardId: { type: 'string', description: 'Workflow board ID.' },
        board_id: { type: 'string', description: 'Alias for boardId.' },
        cardId: { type: 'string', description: 'Workflow card or work item ID.' },
        card_id: { type: 'string', description: 'Alias for cardId.' },
        workItemId: { type: 'string', description: 'Alias for cardId.' },
        work_item_id: { type: 'string', description: 'Alias for cardId.' },
        actor: { type: 'string', description: 'Actor requesting orchestration.' },
        actor_id: { type: 'string', description: 'Alias for actor.' },
        mode: { type: 'string', enum: ['manual', 'auto', 'gated'], description: 'Orchestration mode.' },
        reason: { type: 'string', description: 'Orchestration reason.' },
        entityRefs: { type: 'object', description: 'Linked goals, chats, tasks, or files.' },
        entity_refs: { type: 'object', description: 'Alias for entityRefs.' },
        resource_group: { type: 'string', description: 'Optional resource group for execution.' },
        approval_mode: {
          type: 'string',
          enum: ['yolo', 'auto_edit', 'plan'],
          description: 'Execution approval mode.',
        },
        expectedVersion: { type: 'number', description: 'Optimistic version guard.' },
        expected_version: { type: 'number', description: 'Alias for expectedVersion.' },
      },
      required: ['cardId'],
    },
  },
  {
    name: 'resume_work_item',
    description: 'Request explicit recovery or resume for a workflow work item.',
    inputSchema: {
      type: 'object',
      properties: {
        boardId: { type: 'string', description: 'Workflow board ID.' },
        board_id: { type: 'string', description: 'Alias for boardId.' },
        cardId: { type: 'string', description: 'Workflow card or work item ID.' },
        card_id: { type: 'string', description: 'Alias for cardId.' },
        workItemId: { type: 'string', description: 'Alias for cardId.' },
        work_item_id: { type: 'string', description: 'Alias for cardId.' },
        actor: { type: 'string', description: 'Actor requesting resume.' },
        actor_id: { type: 'string', description: 'Alias for actor.' },
        runId: { type: 'string', description: 'Workflow run ID to resume.' },
        run_id: { type: 'string', description: 'Alias for runId.' },
        taskId: { type: 'string', description: 'Linked runtime task ID.' },
        task_id: { type: 'string', description: 'Alias for taskId.' },
        reason: { type: 'string', description: 'Resume reason.' },
        expectedVersion: { type: 'number', description: 'Optimistic version guard.' },
        expected_version: { type: 'number', description: 'Alias for expectedVersion.' },
      },
      required: ['cardId'],
    },
  },
  {
    name: 'control_work_item',
    description: 'Pause, stop, or cancel a workflow work item through the shared control plane.',
    inputSchema: {
      type: 'object',
      properties: {
        boardId: { type: 'string', description: 'Workflow board ID.' },
        board_id: { type: 'string', description: 'Alias for boardId.' },
        cardId: { type: 'string', description: 'Workflow card or work item ID.' },
        card_id: { type: 'string', description: 'Alias for cardId.' },
        workItemId: { type: 'string', description: 'Alias for cardId.' },
        work_item_id: { type: 'string', description: 'Alias for cardId.' },
        action: {
          type: 'string',
          enum: ['pause', 'stop', 'cancel'],
          description: 'Control action.',
        },
        actor: { type: 'string', description: 'Actor requesting the control action.' },
        actor_id: { type: 'string', description: 'Alias for actor.' },
        reason: { type: 'string', description: 'Control reason.' },
        expectedVersion: { type: 'number', description: 'Optimistic version guard.' },
        expected_version: { type: 'number', description: 'Alias for expectedVersion.' },
      },
      required: ['cardId', 'action'],
    },
  },
  {
    name: 'reconcile_workflow_recovery',
    description: 'Persist recovery flags and recovery run state for active workflow cards.',
    inputSchema: {
      type: 'object',
      properties: {
        boardId: { type: 'string', description: 'Optional workflow board ID.' },
        board_id: { type: 'string', description: 'Alias for boardId.' },
        projectId: { type: 'string', description: 'Optional project filter.' },
        project_id: { type: 'string', description: 'Alias for projectId.' },
        actor: { type: 'string', description: 'Actor requesting reconciliation.' },
        force: { type: 'boolean', description: 'Persist recovery run records even when flags did not change.' },
      },
    },
  },
  {
    name: 'import_workflow_work_items',
    description: 'Import markdown work-item files into workflow board cards.',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'string', description: 'Optional project workspace ID.' },
        project_id: { type: 'string', description: 'Alias for projectId.' },
        actor: { type: 'string', description: 'Actor requesting import.' },
      },
    },
  },
  {
    name: 'export_workflow_work_item',
    description: 'Export one workflow card to a markdown work-item file.',
    inputSchema: {
      type: 'object',
      properties: {
        cardId: { type: 'string', description: 'Workflow card or work item ID.' },
        card_id: { type: 'string', description: 'Alias for cardId.' },
        workItemId: { type: 'string', description: 'Alias for cardId.' },
        work_item_id: { type: 'string', description: 'Alias for cardId.' },
        projectId: { type: 'string', description: 'Optional project workspace ID.' },
        project_id: { type: 'string', description: 'Alias for projectId.' },
        markdownPath: { type: 'string', description: 'Optional workspace-relative markdown path.' },
        markdown_path: { type: 'string', description: 'Alias for markdownPath.' },
        actor: { type: 'string', description: 'Actor requesting export.' },
      },
      required: ['cardId'],
    },
  },
  {
    name: 'get_workflow_recovery_state',
    description: 'Get workflow recovery state for restart and resume decisions.',
    inputSchema: {
      type: 'object',
      properties: {
        boardId: { type: 'string', description: 'Optional workflow board ID.' },
        board_id: { type: 'string', description: 'Alias for boardId.' },
        cardId: { type: 'string', description: 'Optional workflow card or work item ID.' },
        card_id: { type: 'string', description: 'Alias for cardId.' },
        projectId: { type: 'string', description: 'Optional project filter.' },
        project_id: { type: 'string', description: 'Alias for projectId.' },
        includeResolved: { type: 'boolean', description: 'Include resolved recovery records.' },
        include_resolved: { type: 'boolean', description: 'Alias for includeResolved.' },
      },
    },
  },
  {
    name: 'list_workflow_events',
    description: 'List audited workflow events from the workflow board service.',
    inputSchema: {
      type: 'object',
      properties: {
        boardId: { type: 'string', description: 'Optional workflow board ID.' },
        board_id: { type: 'string', description: 'Alias for boardId.' },
        cardId: { type: 'string', description: 'Optional workflow card or work item ID.' },
        card_id: { type: 'string', description: 'Alias for cardId.' },
        projectId: { type: 'string', description: 'Optional project filter.' },
        project_id: { type: 'string', description: 'Alias for projectId.' },
        eventTypes: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional event type filter.',
        },
        event_types: {
          type: 'array',
          items: { type: 'string' },
          description: 'Alias for eventTypes.',
        },
        after: { type: 'string', description: 'Return events after this cursor or timestamp.' },
        before: { type: 'string', description: 'Return events before this cursor or timestamp.' },
        limit: { type: 'number', description: 'Maximum number of events to return.' },
      },
    },
  },
];

const WORKFLOW_BOARD_TOOL_NAMES = new Set(WORKFLOW_BOARD_TOOLS.map(tool => tool.name));

const COMMON_ALIASES = {
  boardId: ['board_id'],
  projectId: ['project_id'],
  cardId: ['card_id', 'workItemId', 'work_item_id'],
  actor: ['actor_id', 'actorId'],
  expectedVersion: ['expected_version'],
  entityRefs: ['entity_refs'],
  columnId: ['column_id'],
  acceptanceCriteria: ['acceptance_criteria'],
  fromColumnId: ['from_column_id', 'fromColumn', 'from_column', 'from'],
  toColumnId: ['to_column_id', 'toColumn', 'to_column', 'to'],
  leaseOwner: ['lease_owner'],
  ttlMs: ['ttl_ms'],
  runId: ['run_id'],
  taskId: ['task_id'],
  markdownPath: ['markdown_path'],
  includeResolved: ['include_resolved'],
  eventTypes: ['event_types'],
};

const ID_TARGETS = {
  get_workflow_board: 'boardId',
  update_work_item: 'cardId',
  request_workflow_transition: 'cardId',
  claim_work_item: 'cardId',
  release_work_item: 'cardId',
  orchestrate_work_item: 'cardId',
  resume_work_item: 'cardId',
  control_work_item: 'cardId',
  export_workflow_work_item: 'cardId',
};

export function isWorkflowBoardTool(toolName = '') {
  return WORKFLOW_BOARD_TOOL_NAMES.has(String(toolName || ''));
}

function textResult(value, extra = {}) {
  let payload = typeof value === 'string' ? { ok: false, error: value } : value;
  return {
    ...extra,
    content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }],
  };
}

function errorResult(message) {
  return textResult(message, { isError: true });
}

function isMcpResult(value) {
  return Boolean(value && typeof value === 'object' && Array.isArray(value.content));
}

function normalizeAliases(args = {}, toolName = '') {
  let normalized = { ...args };
  for (let [canonical, aliases] of Object.entries(COMMON_ALIASES)) {
    if (normalized[canonical] === undefined) {
      for (let alias of aliases) {
        if (normalized[alias] !== undefined) {
          normalized[canonical] = normalized[alias];
          break;
        }
      }
    }
    for (let alias of aliases) {
      if (alias !== canonical) delete normalized[alias];
    }
  }

  let idTarget = ID_TARGETS[toolName];
  if (idTarget && normalized[idTarget] === undefined && normalized.id !== undefined) {
    normalized[idTarget] = normalized.id;
  }
  if (idTarget) delete normalized.id;

  return normalized;
}

function missingServiceError(error) {
  return error?.code === 'ERR_MODULE_NOT_FOUND'
    && String(error.message || '').includes('workflow-board-service.js');
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

function getWorkflowServiceMethod(service, toolName) {
  let methodName = TOOL_METHODS[toolName];
  if (!methodName) return null;
  if (typeof service?.[methodName] !== 'function') {
    throw new Error(
      `Workflow board service is missing ${methodName}() required by ${toolName}.`,
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
    return errorResult(`Unknown workflow board tool: ${toolName}`);
  }

  let service;
  try {
    service = await resolveWorkflowBoardService(proxyManager, options);
  } catch (error) {
    return errorResult(error.message);
  }

  let method;
  try {
    method = getWorkflowServiceMethod(service, toolName);
  } catch (error) {
    return errorResult(error.message);
  }

  let context = {
    ...(options.context || {}),
    source,
    toolName,
    proxyManager,
  };
  let normalizedArgs = normalizeAliases(args, toolName);
  let result;
  try {
    result = await method(normalizedArgs, context);
  } catch (error) {
    return errorResult(`Workflow board service failed for ${toolName}: ${error.message}`);
  }
  if (isMcpResult(result)) return result;
  return textResult(result ?? { ok: true });
}
