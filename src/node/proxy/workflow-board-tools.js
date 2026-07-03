import path from 'node:path';

import {
  DEFAULT_WORKFLOW_BOARD_ID,
  DEFAULT_WORKFLOW_COLUMN_IDS,
} from '../../iso/workflow-board.js';
import { derivePrincipal } from '../server/principal.js';
import { listBackends } from '../server/backend-lifecycle.js';

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
    description: 'Get one board projection with columns, cards, optional events, runtime data, or a compact status view. Each root card (no parentCardId, or rootCardId===id) carries a per-root realization rollup (card.realization: {total,done,rejected,active,blocked} over the root subtree) that rides the existing projection passthrough.',
    required: [],
  },
  create_board: {
    method: 'createWorkflowBoardFromSpec',
    description: 'Author a non-default board from a column/transition spec. The graph is validated before it persists; an invalid graph is rejected and a non-author returns pendingApproval. Use the default board or define_* to modify an existing board.',
    required: ['boardId', 'columns', 'transitions'],
    mutates: true,
  },
  create_item: {
    method: 'createWorkItem',
    description: 'Create a workflow card/work item.',
    required: ['title'],
    mutates: true,
  },
  decompose: {
    method: 'decomposeWorkItem',
    description: 'Split a broad workflow card into first-class child cards without starting them automatically. The origin idea is NOT auto-copied into children: each child\'s `body` and `context` must be self-contained. Carry any binding proof marker (e.g. COMPLETION_PROOF, RELEASE_AUTH_PACKET) or hard constraint from the origin idea explicitly into the specific child that must satisfy it. Children inherit a stamped metadata.rootCardId pointing at the origin idea and dereference it by reading that root card. Re-decomposable: a re-engaged orchestrator (re-woken on a child\'s routed intermediate return) may decompose ANOTHER wave instead of rework/reject/needs_human — each decompose bumps the parent\'s monotonic metadata.decomposeWaveSeq and mints a FRESH per-wave join (the retired prior-wave join is one-shot), so a later wave\'s completion still wakes the owner exactly once. The always-on per-root convergence cap (automation.rootConvergence) bounds total waves/fan-out/runs so the re-decompose loop always converges; once a root breaches the cap, admission is refused and the root is routed to a terminal (needs-decision park, reject fallback), never an unbounded loop.',
    required: ['cardId', 'childItems'],
    mutates: true,
  },
  update_item: {
    method: 'updateWorkItem',
    description: 'Patch a workflow card/work item.',
    required: ['cardId'],
    mutates: true,
  },
  update_board: {
    method: 'updateWorkflowBoard',
    description: 'Patch board-level automation mode and defaults such as pickup, recovery, stop policy, fallback agents, and global parallel limit. Optional automation.rootConvergence ({depth,fanout,runCount}) overrides the per-root re-decomposition convergence cap; UNLIKE the optional cost budget it is always-on (the DEFAULT_ROOT_MAX_* limits apply even unconfigured) and independent of automation.budget, so a runaway re-decompose loop always converges. The cap is enforced at candidate admission: when any dimension is breached the root is routed to a terminal through the existing path — parked in the needs-decision lane (reject-terminal fallback when no decision lane exists) with a reason naming the breached dimension(s) and rootCardId — never silently stalled or looped. Pass autonomyLevel (1..5 or "manual") to instead cascade that level\'s preset to columns (per-stage autoAdvance/mode + board publishMode) via the autonomy slider; routing to applyAutonomyLevel, which still requires DEFINE/CONTROL.',
    required: [],
    mutates: true,
  },
  control_board: {
    method: 'controlWorkflowBoard',
    description: 'Apply a board-level automation control action such as pause, resume, drain, stop, manual, recovery_only, or maintenance.',
    required: ['control'],
    mutates: true,
  },
  update_column: {
    method: 'updateWorkflowColumn',
    description: 'Patch column automation settings such as trigger, mode, agent pool, and parallel limit.',
    required: ['columnId', 'patch'],
    mutates: true,
  },
  delete_item: {
    method: 'deleteWorkItem',
    description: 'Remove a workflow card from the board while preserving audited transition history.',
    required: ['cardId'],
    mutates: true,
  },
  transition: {
    method: 'requestWorkflowTransition',
    description: 'Move a card through the shared gated transition engine. Entering auto columns can trigger orchestration.',
    required: ['cardId', 'toColumnId'],
    mutates: true,
  },
  enqueue: {
    method: 'enqueueWorkflowCard',
    description: 'Admit a card into the scheduler queue (lifecycle queued). Returns admissionId; the scheduler drains it under capacity.',
    required: ['cardId'],
    mutates: true,
  },
  queue: {
    method: 'getWorkflowBoard',
    description: 'Read-only queue/telemetry projection: per-card lifecycle, queue slots, and board queue depth.',
    required: [],
  },
  link_dependency: {
    method: 'linkDependency',
    description: 'Add upstream dependency edge(s) to a card. A card with an unsatisfied edge is held blocked until released.',
    required: ['cardId', 'dependsOn'],
    mutates: true,
  },
  unlink_dependency: {
    method: 'unlinkDependency',
    description: 'Remove upstream dependency edge(s) from a card and recompute its blocked/idle lifecycle.',
    required: ['cardId', 'dependsOn'],
    mutates: true,
  },
  define_column: {
    method: 'defineWorkflowColumn',
    description: 'Add or update a board column. Pass entryPoint:true to mark it as a human entry point (where new intake/human-authored cards land); omit entryPoint on update to preserve the current value. Re-validates the transition graph; an invalid graph is rejected. Authoring is policy.define.',
    required: ['columnId'],
    mutates: true,
  },
  define_transition: {
    method: 'defineWorkflowTransition',
    description: 'Add or update a transition edge with closed-vocabulary gates. Re-validates the graph. Authoring is policy.define.',
    required: ['from', 'to'],
    mutates: true,
  },
  define_gate: {
    method: 'defineWorkflowGate',
    description: 'Replace the gate list on an existing transition. Floor gates may not be weakened on a forward edge. Authoring is policy.define.',
    required: ['from', 'to', 'gates'],
    mutates: true,
  },
  delete_column: {
    method: 'deleteWorkflowColumn',
    description: 'Remove a board column and every transition that references it. Rejects if a live card still occupies the column, or if the removal would leave an invalid graph. Authoring is policy.define.',
    required: ['columnId'],
    mutates: true,
  },
  orchestrate: {
    method: 'orchestrateWorkItem',
    description: 'Ask the Portal orchestrator to run an eligible work item. A live child\'s typed intermediate return is now routed to the parent (owner) inbox before all children settle, so a parent can be re-woken and re-engaged on partial results; on re-engagement the orchestrator may emit a decompose (another wave) as a legitimate terminal-routing decision alongside rework/reject/needs_human, evidenced by the rendered returns and the per-root realization rollup.',
    required: ['cardId'],
    mutates: true,
  },
  control: {
    method: 'controlWorkItem',
    description: 'Pause, stop, or cancel a running/active workflow card.',
    required: ['cardId', 'control'],
    mutates: true,
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
    mutates: true,
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
  create_board: {
    action: 'create_board',
    boardId: 'team-review-board',
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
  },
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
    subscription: { members: ['child-a', 'child-b'], wave: 2 },
  },
  enqueue: {
    action: 'enqueue',
    boardId: DEFAULT_WORKFLOW_BOARD_ID,
    cardId: 'card-id',
    reason: 'Admit the card into the scheduler queue',
  },
  queue: {
    action: 'queue',
    boardId: DEFAULT_WORKFLOW_BOARD_ID,
    projectId: 'project-id',
  },
  link_dependency: {
    action: 'link_dependency',
    boardId: DEFAULT_WORKFLOW_BOARD_ID,
    cardId: 'downstream-card-id',
    dependsOn: ['upstream-card-id'],
  },
  unlink_dependency: {
    action: 'unlink_dependency',
    boardId: DEFAULT_WORKFLOW_BOARD_ID,
    cardId: 'downstream-card-id',
    dependsOn: ['upstream-card-id'],
  },
  define_column: {
    action: 'define_column',
    boardId: DEFAULT_WORKFLOW_BOARD_ID,
    columnId: 'design-review',
    title: 'Design Review',
    after: 'backlog',
    automation: { trigger: 'on_enter', action: 'audit', mode: 'gated', agents: ['code-reviewer'] },
  },
  define_transition: {
    action: 'define_transition',
    boardId: DEFAULT_WORKFLOW_BOARD_ID,
    from: 'backlog',
    to: 'design-review',
    gates: ['has_owner_and_acceptance'],
  },
  define_gate: {
    action: 'define_gate',
    boardId: DEFAULT_WORKFLOW_BOARD_ID,
    from: 'quality-audit',
    to: 'commit-publish',
    gates: ['audit_pass_or_explicit_waiver'],
  },
  delete_column: {
    action: 'delete_column',
    boardId: DEFAULT_WORKFLOW_BOARD_ID,
    columnId: 'design-review',
    reason: 'Retire the design-review stage',
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
        rootConvergence: { depth: 6, fanout: 64, runCount: 128 },
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

function appendParam(params, key, value) {
  if (value === undefined || value === null || value === '') return;
  if (Array.isArray(value)) {
    for (let item of value) appendParam(params, key, item);
    return;
  }
  params.append(key, String(value));
}

function queryString(args = {}) {
  let params = new URLSearchParams();
  for (let [key, value] of Object.entries(args)) {
    appendParam(params, key, value);
  }
  let query = params.toString();
  return query ? `?${query}` : '';
}

function liveWorkflowBackend(proxyManager = null, options = {}) {
  if (options.disableLiveWorkflowBackend === true) return null;
  if (options.workflowService || proxyManager?.workflowBoardService) return null;
  let projectRoot = options.projectRoot ?? proxyManager?.projectRoot;
  if (!projectRoot || projectRoot === '/') return null;
  let resolvedRoot = path.resolve(projectRoot);
  let discover = typeof options.backendDiscovery === 'function'
    ? options.backendDiscovery
    : listBackends;
  let backends = discover() || [];
  return backends.find(entry => (
    entry?.port
    && entry?.project
    && path.resolve(entry.project) === resolvedRoot
    && Number(entry.pid) !== process.pid
  )) ?? null;
}

function workflowBackendUrl(backend, routePath, args = null) {
  let base = backend.webDirect || backend.localUrl || `http://127.0.0.1:${backend.port}/`;
  let url = new URL(routePath, base);
  if (args) {
    let params = new URLSearchParams(queryString(args).slice(1));
    url.search = params.toString();
  }
  return url;
}

async function readWorkflowBackendPayload(response, url) {
  let text = await response.text();
  let payload = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    throw new Error(`Live workflow board backend returned non-JSON response from ${url.pathname}.`);
  }
  if (!response.ok || payload?.ok === false) {
    let detail = payload?.error || response.statusText || `HTTP ${response.status}`;
    throw new Error(`Live workflow board backend failed ${url.pathname}: ${detail}`);
  }
  return payload;
}

function unwrapResult(payload) {
  return payload && typeof payload === 'object' && 'result' in payload
    ? payload.result
    : payload;
}

function createRemoteWorkflowBoardService(backend) {
  let get = async (routePath, args = {}, unwrap = false) => {
    let url = workflowBackendUrl(backend, routePath, args);
    let response = await fetch(url, { headers: { Accept: 'application/json' } });
    let payload = await readWorkflowBackendPayload(response, url);
    return unwrap ? unwrapResult(payload) : payload;
  };
  let post = async (routePath, args = {}, unwrap = false) => {
    let url = workflowBackendUrl(backend, routePath);
    let response = await fetch(url, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify(args),
    });
    let payload = await readWorkflowBackendPayload(response, url);
    return unwrap ? unwrapResult(payload) : payload;
  };
  return {
    listWorkflowBoards: args => get('/api/workflow-board/boards', args),
    getWorkflowBoard: args => get('/api/workflow-board', args),
    createWorkItem: args => post('/api/workflow-board/cards', args),
    updateWorkItem: args => post('/api/workflow-board/cards/update', args),
    decomposeWorkItem: args => post('/api/workflow-board/decompose', args, true),
    updateWorkflowBoard: args => post('/api/workflow-board/automation', args, true),
    controlWorkflowBoard: args => post('/api/workflow-board/automation', args, true),
    updateWorkflowColumn: args => post('/api/workflow-board/columns/update', args, true),
    deleteWorkItem: args => post('/api/workflow-board/delete', args, true),
    requestWorkflowTransition: args => post('/api/workflow-board/transition', args, true),
    enqueueWorkflowCard: args => post('/api/workflow-board/enqueue', args, true),
    linkDependency: args => post('/api/workflow-board/dependencies/link', args, true),
    unlinkDependency: args => post('/api/workflow-board/dependencies/unlink', args, true),
    defineWorkflowColumn: args => post('/api/workflow-board/columns/define', args, true),
    deleteWorkflowColumn: args => post('/api/workflow-board/columns/delete', args, true),
    defineWorkflowTransition: args => post('/api/workflow-board/transitions/define', args, true),
    defineWorkflowGate: args => post('/api/workflow-board/gates/define', args, true),
    orchestrateWorkItem: args => post('/api/workflow-board/orchestrate', args, true),
    controlWorkItem: args => post('/api/workflow-board/control', args, true),
    getWorkflowRecoveryState: args => get('/api/workflow-board/recovery', args),
    reconcileWorkflowRecovery: args => post('/api/workflow-board/recovery/reconcile', args),
    listWorkflowEvents: args => get('/api/workflow-board/events', args),
  };
}

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
        reconcileRuntime: { type: 'boolean', description: 'Reconcile linked runtime task status before returning get_board.' },
        compact: { type: 'boolean', description: 'Return a bounded status projection for L1 monitoring instead of full card history.' },
        view: { type: 'string', enum: ['status', 'queue'], description: 'Projection view for get_board/queue. Use status for compact monitoring, queue for scheduler depth.' },
        includeResolved: { type: 'boolean', description: 'Include resolved recovery records for recovery.' },
        cardId: { type: 'string', description: 'Workflow card/work-item ID.' },
        parentCardId: { type: 'string', description: 'Parent workflow card ID for child cards.' },
        title: { type: 'string', description: 'Work-item title for create_item.' },
        body: { type: 'string', description: 'Optional work-item body for create_item.' },
        childItems: {
          type: 'array',
          items: { type: 'object' },
          description: 'Child card definitions for action=decompose. Each child must be self-contained: its `body` and `context` are the only intent the worker sees — the origin idea is never copied in. Put any binding proof marker or hard constraint from the origin idea into the relevant child\'s brief. Children are stamped with metadata.rootCardId (the origin idea) for on-demand dereference.',
        },
        columns: {
          type: 'array',
          items: { type: 'object' },
          description: 'Column spec ({id,title,automation}) for action=create_board.',
        },
        transitions: {
          type: 'array',
          items: { type: 'object' },
          description: 'Transition spec ({from,to,gates}) for action=create_board. Validated by validateWorkflowTransitionGraph before the board persists.',
        },
        kind: { type: 'string', description: 'Optional work-item kind.' },
        priority: { type: 'string', description: 'Optional priority.' },
        domain: { type: 'string', description: 'Optional work-item domain for classification gates.' },
        columnId: { type: 'string', description: 'Initial column for create_item; the target column for update_column, define_column, and delete_column.' },
        childColumnId: { type: 'string', description: 'Initial column for child cards created by action=decompose.' },
        cwd: { type: 'string', description: 'Optional working directory for delegated workflow execution. Captured on the card at intake; it also selects the repo the card\'s isolated worktree is cut from, so a card targeting another project runs in that project\'s repo. Absent, the card falls back to its registered project path, then the board project root.' },
        automation: { type: 'object', description: 'Column automation patch for action=update_column; board-level automation patch for action=update_board (pickup, recovery, stop policy, fallbackAgents, globalParallelLimit). For update_board it may also carry automation.rootConvergence ({depth,fanout,runCount}) to override the always-on per-root re-decomposition convergence cap (independent of the optional automation.budget cost breaker).' },
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
        files: {
          type: 'array',
          items: { type: 'string' },
          description: 'Structured file ownership scope for create_item, childItems, and orchestration.',
        },
        metadata: { type: 'object', description: 'Optional work-item metadata for create_item.' },
        subscription: { type: 'object', description: 'Optional orchestrator return subscription (e.g. a join over members) for create_item or orchestrate. Persisted on the card so the join materializes on first orchestration, including by auto-pickup. Pass subscription.wave (>=1) to tag the join for a specific re-decomposition wave: each re-decompose mints a FRESH join keyed on the parent\'s current wave, so a later wave\'s completion still wakes the owner exactly once; absent leaves the single-wave path unchanged.' },
        patch: { type: 'object', description: 'Fields to patch for update_item.' },
        checks: { type: 'object', description: 'Optional gate checks for update_item.' },
        fromColumnId: { type: 'string', description: 'Expected current column for transition.' },
        toColumnId: { type: 'string', description: 'Destination column for transition; validated board-aware by the service (assertBoardColumn / known_column), so custom-board columns are accepted.' },
        from: { type: 'string', description: 'Source column for define_transition/define_gate.' },
        to: { type: 'string', description: 'Destination column for define_transition/define_gate.' },
        gates: {
          type: 'array',
          items: { type: 'string' },
          description: 'Closed-vocabulary gate ids for define_transition/define_gate.',
        },
        title: { type: 'string', description: 'Column title for define_column.' },
        entryPoint: { type: 'boolean', description: 'Mark this column as a human entry point for define_column (where new intake/human-authored cards land). Default false; omit on update to preserve the current value.' },
        after: { type: 'string', description: 'Insert a new define_column column after this column id.' },
        position: { type: 'number', description: 'Insert a new define_column column at this index.' },
        dependsOn: {
          type: 'array',
          items: { type: ['string', 'object'] },
          description: 'Upstream dependency edge(s) for link_dependency/unlink_dependency.',
        },
        notBefore: { type: 'number', description: 'Earliest admission timestamp for enqueue.' },
        mode: { type: 'string', enum: ['manual', 'auto', 'gated'], description: 'Transition or orchestration mode.' },
        boardMode: { type: 'string', enum: ['passive', 'armed', 'autonomous', 'manual', 'paused', 'draining', 'stopped', 'maintenance', 'recovery_only'], description: 'Board mode for action=control_board resume overrides.' },
        autonomyLevel: { type: ['number', 'string'], enum: [1, 2, 3, 4, 5, 'manual'], description: 'Global autonomy "volume slider" for action=update_board. A number 1..5 cascades that level\'s preset to columns (per-stage autoAdvance/mode and board publishMode); 5 is full autonomy. "manual" stamps autonomyLevel=manual and leaves columns custom. Routes to applyAutonomyLevel (DEFINE/CONTROL gated).' },
        control: { type: 'string', enum: ['pause', 'stop', 'cancel', 'resume', 'drain', 'maintenance', 'manual', 'recovery_only', 'arm'], description: 'Runtime control action for action=control or board action for action=control_board.' },
        reason: { type: 'string', description: 'Human/audit reason.' },
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

  if (action === 'update_board'
    && !hasValue(args.patch) && !hasValue(args.automation) && !hasValue(args.boardMode) && !hasValue(args.autonomyLevel)) {
    return {
      ok: false,
      message: 'update_board needs at least one of patch, automation, boardMode, or autonomyLevel.',
      details: {
        action,
        example: ACTION_EXAMPLES.update_board,
      },
    };
  }

  // toColumnId is intentionally NOT range-checked here against the default ids: the service is
  // board-aware (assertBoardColumn / the `known_column` transition failure) and is the single authority
  // on which columns a board has, so a custom-board column would be wrongly rejected by a default-id
  // guard. Presence is still enforced via config.required above.

  return { ok: true };
}

function serviceArgsForAction(action, args = {}) {
  let common = cleanUndefined({
    boardId: args.boardId || DEFAULT_WORKFLOW_BOARD_ID,
    projectId: args.projectId,
    goalId: args.goalId,
    chatId: args.chatId,
    cardId: args.cardId,
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
      reconcileRuntime: args.reconcileRuntime ?? args.reconcile_runtime,
      compact: args.compact,
      view: args.view,
    });
  }
  if (action === 'create_board') {
    return cleanUndefined({
      ...common,
      title: args.title,
      mode: args.mode,
      automation: args.automation,
      columns: args.columns,
      transitions: args.transitions,
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
      cwd: args.cwd,
      owner: args.owner,
      assignedAgent: args.assignedAgent,
      resourceGroup: args.resourceGroup,
      approvalMode: args.approvalMode,
      acceptanceCriteria: args.acceptanceCriteria,
      context: args.context,
      routingHints: args.routingHints,
      blockers: args.blockers,
      files: args.files,
      metadata: args.metadata,
      subscription: args.subscription,
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
      cwd: args.cwd,
      files: args.files,
    });
  }
  if (action === 'update_board') {
    return cleanUndefined({
      ...common,
      mode: args.boardMode,
      automation: args.automation,
      autonomyLevel: args.autonomyLevel,
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
  if (action === 'enqueue') {
    return cleanUndefined({
      ...common,
      notBefore: args.notBefore,
    });
  }
  if (action === 'queue') {
    return cleanUndefined({
      ...common,
      includeCards: args.includeCards,
      includeRuntime: args.includeRuntime,
      view: 'queue',
    });
  }
  if (action === 'link_dependency' || action === 'unlink_dependency') {
    return cleanUndefined({
      ...common,
      dependsOn: args.dependsOn,
    });
  }
  if (action === 'define_column') {
    return cleanUndefined({
      ...common,
      columnId: args.columnId,
      title: args.title,
      entryPoint: args.entryPoint,
      automation: args.automation,
      after: args.after,
      position: args.position,
    });
  }
  if (action === 'delete_column') {
    return cleanUndefined({
      ...common,
      columnId: args.columnId,
    });
  }
  if (action === 'define_transition' || action === 'define_gate') {
    return cleanUndefined({
      ...common,
      from: args.from,
      to: args.to,
      gates: args.gates,
    });
  }
  if (action === 'orchestrate') {
    return cleanUndefined({
      ...common,
      mode: args.mode,
      resource_group: args.resourceGroup,
      approval_mode: args.approvalMode,
      cwd: args.cwd,
      files: args.files,
      subscription: args.subscription,
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
  let statusRefreshCall = (extra = {}) => cleanUndefined({
    action: 'get_board',
    boardId,
    projectId: args.projectId,
    includeRuntime: true,
    compact: true,
    view: 'status',
    ...extra,
  });

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
          call: statusRefreshCall(),
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
      call: statusRefreshCall(),
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
      call: statusRefreshCall(),
    };
  }
  if (action === 'enqueue') {
    return {
      recommendedAction: 'queue',
      reason: 'Inspect scheduler queue depth and the card lifecycle after admission.',
      call: cleanUndefined({ action: 'queue', boardId, projectId: args.projectId }),
    };
  }
  if (action === 'define_column' || action === 'delete_column' || action === 'define_transition' || action === 'define_gate') {
    if (result.ok === false) {
      return {
        recommendedAction: 'help',
        reason: 'The board edit was rejected by the graph validator, blocked because the column is still occupied, or held for approval; read failures, then retry.',
        call: { action: 'help' },
      };
    }
    return {
      recommendedAction: 'get_board',
      reason: 'Refresh the board projection to inspect the authored columns/transitions.',
      call: statusRefreshCall(),
    };
  }
  if (action === 'orchestrate' || action === 'control' || action === 'control_board' || action === 'update_item' || action === 'update_board' || action === 'update_column' || action === 'delete_item' || action === 'link_dependency' || action === 'unlink_dependency') {
    return {
      recommendedAction: 'get_board',
      reason: 'Refresh board state after runtime or card mutation.',
      call: statusRefreshCall(),
    };
  }
  return null;
}

function hintsForAction(action, result = {}) {
  let hints = [
    'Use action=help when unsure which workflow_board command to call.',
    'Use action=get_board to refresh current board state before deciding the next mutation.',
  ];
  if (action === 'get_board' || action === 'queue') {
    hints.push('Use action=transition for column moves; do not mutate columnId directly.');
  }
  if (action === 'define_column' || action === 'delete_column' || action === 'define_transition' || action === 'define_gate') {
    hints.push('Board authoring is policy.define: a non-author edit returns pendingApproval, and an invalid graph is rejected with the validator error.');
  }
  if (action === 'enqueue') {
    hints.push('Use action=queue to watch queue depth; the scheduler admits queued cards under capacity.');
  }
  if (result?.status === 'blocked' || result?.status === 'pendingApproval' || result?.ok === false) {
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
  let backend = liveWorkflowBackend(proxyManager, options);
  if (backend) return createRemoteWorkflowBoardService(backend);

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

// An update_board call that carries an autonomy level is the "volume slider": it cascades a level
// preset to every column, so it routes to applyAutonomyLevel instead of the plain mode/automation
// patch. Gating is unchanged — applyAutonomyLevel needs DEFINE/CONTROL, so an mcp-client (READ +
// WRITE_CARD) is still held, exactly as the plain update_board path holds it.
function methodNameForAction(action, args = {}) {
  if (action === 'update_board' && (hasValue(args.autonomyLevel) || hasValue(args.level))) {
    return 'applyAutonomyLevel';
  }
  return ACTIONS[action]?.method;
}

function getWorkflowServiceMethod(service, action, args = {}) {
  let methodName = methodNameForAction(action, args);
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

  // F-SEC: prevent loopback-forward identity laundering. A live workflow backend forwards only `args`
  // (no identity) to /api/workflow-board/*, whose principalForRequest returns a full human principal
  // for any 127.0.0.1 request — so an agent's MCP mutation forwarded cross-process would execute with
  // human DEFINE/AUTHOR/AUDIT rights. For any MUTATING action, force the in-process identity-aware
  // service so the MCP-derived (agent/anonymous) principal below is the one that actually gates the
  // write. Read-only actions may still use the live backend for a cross-process board read (no
  // mutation, so no privilege to launder). The local-UI loopback-human path on the route is
  // untouched: a real local browser with no forwarded principal stays human.
  let resolveOptions = ACTIONS[action]?.mutates
    ? { ...options, disableLiveWorkflowBackend: true }
    : options;

  let service;
  try {
    service = await resolveWorkflowBoardService(proxyManager, resolveOptions);
  } catch (error) {
    return errorResult(error.message, { action });
  }

  let serviceArgs = serviceArgsForAction(action, args);

  let method;
  try {
    method = getWorkflowServiceMethod(service, action, serviceArgs);
  } catch (error) {
    return errorResult(error.message, { action });
  }

  // Server-derived MCP identity. Body-supplied actor/agent_slug is never trusted as
  // identity. A per-task secret → verifiedSlug (D2.1) yields a full agent principal; without
  // one, a local MCP caller resolves to the intake floor (mcp-client: READ + WRITE_CARD) — it
  // can submit/edit work items but cannot drive or author the board. Identity stays
  // server-derived, so a forged payload actor can never launder a privileged identity.
  let verifiedSlug = options.context?.verifiedSlug ?? options.verifiedSlug;
  let principal = derivePrincipal({ channel: 'mcp', verifiedSlug });
  let context = {
    ...(options.context || {}),
    source,
    toolName,
    action,
    proxyManager,
    principal,
  };
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
