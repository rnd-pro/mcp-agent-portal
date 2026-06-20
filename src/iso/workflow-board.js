export const WORKFLOW_BOARD_SCHEMA = 'workflow-board/v1';
export const WORKFLOW_CARD_SCHEMA = 'workflow-card/v1';
export const WORKFLOW_TRANSITION_SCHEMA = 'workflow-transition/v1';
export const WORKFLOW_CHECKS_SCHEMA = 'workflow-checks/v1';
export const WORKFLOW_RUN_SCHEMA = 'workflow-run/v1';
export const WORKFLOW_LEASE_SCHEMA = 'workflow-lease/v1';

export const DEFAULT_WORKFLOW_BOARD_ID = 'agent-workflow-default';

export const DEFAULT_WORKFLOW_COLUMN_IDS = [
  'ideas',
  'backlog',
  'ready',
  'in-progress',
  'quality-audit',
  'commit-publish',
  'done',
];

export const WORKFLOW_BOARD_MODES = [
  'passive',
  'armed',
  'autonomous',
  'manual',
  'paused',
  'draining',
  'stopped',
  'maintenance',
  'recovery_only',
];

export const WORKFLOW_BOARD_PICKUP_MODES = ['auto', 'manual', 'disabled'];
export const WORKFLOW_BOARD_RECOVERY_MODES = ['auto', 'manual', 'disabled'];
export const WORKFLOW_BOARD_STOP_POLICIES = ['pause_scheduling', 'drain', 'stop_active', 'cancel_active'];
export const WORKFLOW_BOARD_PUBLISH_MODES = ['manual', 'after_audit', 'disabled'];
export const WORKFLOW_BOARD_CONTROL_ACTIONS = [
  'pause',
  'resume',
  'drain',
  'stop',
  'maintenance',
  'manual',
  'recovery_only',
  'arm',
];

export const WORKFLOW_TRANSITION_MODES = ['manual', 'auto', 'gated'];
export const WORKFLOW_TRANSITION_STATUSES = [
  'accepted',
  'blocked',
  'pendingApproval',
  'rolledBack',
];

export const RECOVERY_FLAGS = [
  'needs_resume',
  'needs_audit',
  'blocked',
  'recovering',
];

export const ACTIVE_RECOVERY_COLUMN_IDS = [
  'ready',
  'in-progress',
  'quality-audit',
  'commit-publish',
];

const DEFAULT_WORKFLOW_COLUMNS = [
  {
    id: 'ideas',
    title: 'Ideas / Inbox',
    automation: { trigger: 'manual', action: 'classify', mode: 'gated' },
  },
  {
    id: 'backlog',
    title: 'Backlog',
    automation: { trigger: 'manual', action: 'scope', mode: 'gated', agents: ['orchestrator'] },
  },
  {
    id: 'ready',
    title: 'Tasks / Ready',
    automation: {
      trigger: 'on_enter',
      action: 'orchestrate',
      mode: 'auto',
      agents: ['orchestrator'],
      parallelLimit: 4,
    },
  },
  {
    id: 'in-progress',
    title: 'In Progress',
    automation: {
      trigger: 'lease_required',
      action: 'execute',
      mode: 'gated',
      agents: ['backend-engineer', 'ui-engineer', 'provider-engineer', 'tooling-engineer'],
      parallelLimit: 4,
    },
  },
  {
    id: 'quality-audit',
    title: 'Quality Audit',
    automation: {
      trigger: 'on_enter',
      action: 'audit',
      mode: 'gated',
      agents: ['qa-engineer', 'code-reviewer'],
      parallelLimit: 2,
    },
  },
  {
    id: 'commit-publish',
    title: 'Commit / Publish',
    automation: {
      trigger: 'manual',
      action: 'publish',
      mode: 'gated',
      agents: ['release-manager'],
      approvalMode: 'plan',
      parallelLimit: 1,
    },
  },
  {
    id: 'done',
    title: 'Done',
    automation: { trigger: 'manual', action: 'close', mode: 'manual' },
  },
];

const DEFAULT_WORKFLOW_BOARD_AUTOMATION = {
  pickup: 'auto',
  recovery: 'manual',
  stopPolicy: 'drain',
  publishMode: 'manual',
  defaultApprovalMode: 'plan',
  globalParallelLimit: 8,
  fallbackAgents: ['orchestrator'],
  manualGateOverride: false,
};

const DEFAULT_WORKFLOW_TRANSITIONS = [
  {
    from: 'ideas',
    to: 'backlog',
    gate: 'classified_and_project_scoped',
  },
  {
    from: 'backlog',
    to: 'ready',
    gate: 'has_owner_and_acceptance',
  },
  {
    from: 'ready',
    to: 'in-progress',
    gate: 'has_owner_and_acceptance',
    gates: ['has_owner_and_acceptance', 'no_active_blocker'],
  },
  {
    from: 'in-progress',
    to: 'quality-audit',
    gate: 'no_active_blocker',
  },
  {
    from: 'quality-audit',
    to: 'commit-publish',
    gate: 'audit_pass_or_explicit_waiver',
  },
  {
    from: 'commit-publish',
    to: 'done',
    gate: 'clean_diff_and_hygiene',
  },
];

const GATE_CHECKS = {
  classified_and_project_scoped: (card) => ({
    ok: hasText(card.projectId) && hasText(card.domain),
    reason: 'Card must have projectId and domain before leaving ideas.',
  }),
  has_owner_and_acceptance: (card) => ({
    ok: hasText(card.owner) && card.acceptanceCriteria.length > 0,
    reason: 'Card must have an owner and acceptance criteria.',
  }),
  no_active_blocker: (card) => ({
    ok: card.blockers.length === 0 && !card.recoveryFlags.includes('blocked'),
    reason: 'Card has an active blocker.',
  }),
  audit_pass_or_explicit_waiver: (card, checks) => ({
    ok: checkPassed(checks.audit) || checkPassed(checks.auditWaiver),
    reason: 'Quality audit must pass or have an explicit waiver.',
  }),
  clean_diff_and_hygiene: (card, checks) => ({
    ok: checkPassed(checks.cleanDiff) && (
      checkPassed(checks.hygiene)
      || checkPassed(checks.publicHygiene)
      || checkPassed(checks.packageHygiene)
    ),
    reason: 'Commit/publish requires clean diff plus hygiene check.',
  }),
};

function hasText(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function textOrNull(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'object') {
    let preferred = value.reason ?? value.message ?? value.title ?? value.description ?? value.code ?? value.status;
    if (preferred !== undefined && preferred !== null) return textOrNull(preferred);
    try {
      let text = JSON.stringify(value);
      return text && text !== '{}' ? text : null;
    } catch {
      return null;
    }
  }
  let text = String(value).trim();
  return text.length > 0 ? text : null;
}

function textArray(value) {
  let source = Array.isArray(value) ? value : (value === undefined || value === null ? [] : [value]);
  let items = source
    .map(item => textOrNull(item))
    .filter(Boolean);
  return [...new Set(items)];
}

function positiveVersion(value, fallback = 1) {
  let version = Number(value);
  if (!Number.isFinite(version) || version < 1) return fallback;
  return Math.floor(version);
}

function normalizeKnownValue(value, supported, fallback) {
  let text = textOrNull(value);
  if (!text) return fallback;
  return supported.includes(text) ? text : fallback;
}

function positiveIntegerOrUndefined(value) {
  let number = Number(value);
  if (!Number.isFinite(number) || number < 1) return undefined;
  return Math.floor(number);
}

export function checkPassed(value) {
  if (value === true) return true;
  if (value === false || value === null || value === undefined) return false;
  if (typeof value === 'object') return checkPassed(value.status);
  let status = String(value).trim().toLowerCase();
  return ['passed', 'pass', 'ok', 'clean', 'complete', 'waived', 'waiver'].includes(status);
}

function objectOrEmpty(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

export function normalizeWorkflowAutomation(input = {}) {
  let automation = objectOrEmpty(input);
  let normalized = {
    trigger: textOrNull(automation.trigger),
    action: textOrNull(automation.action),
    mode: textOrNull(automation.mode),
    agent: textOrNull(automation.agent ?? automation.agentSlug ?? automation.agent_slug),
    agents: textArray(automation.agents ?? automation.agentPool ?? automation.agent_pool),
    approvalMode: textOrNull(automation.approvalMode ?? automation.approval_mode),
    resourceGroup: textOrNull(automation.resourceGroup ?? automation.resource_group),
    parallelLimit: Number.isFinite(Number(automation.parallelLimit ?? automation.parallel_limit))
      ? Math.max(1, Math.floor(Number(automation.parallelLimit ?? automation.parallel_limit)))
      : undefined,
    enabled: automation.enabled === undefined ? undefined : Boolean(automation.enabled),
  };
  return Object.fromEntries(Object.entries(normalized).filter(([, value]) => {
    if (value === undefined || value === null) return false;
    if (Array.isArray(value) && value.length === 0) return false;
    return true;
  }));
}

export function normalizeWorkflowBoardMode(value, fallback = 'armed') {
  return normalizeKnownValue(value, WORKFLOW_BOARD_MODES, fallback);
}

export function normalizeWorkflowBoardAutomation(input = {}) {
  let automation = objectOrEmpty(input);
  let fallbackAgents = textArray(
    automation.fallbackAgents ?? automation.fallback_agents ?? automation.agents,
  );
  let globalParallelLimit = positiveIntegerOrUndefined(
    automation.globalParallelLimit ?? automation.global_parallel_limit,
  );
  let leaseTtlMs = positiveIntegerOrUndefined(
    automation.leaseTtlMs ?? automation.lease_ttl_ms,
  );
  return {
    pickup: normalizeKnownValue(
      automation.pickup ?? automation.pickupMode ?? automation.pickup_mode,
      WORKFLOW_BOARD_PICKUP_MODES,
      DEFAULT_WORKFLOW_BOARD_AUTOMATION.pickup,
    ),
    recovery: normalizeKnownValue(
      automation.recovery ?? automation.recoveryMode ?? automation.recovery_mode,
      WORKFLOW_BOARD_RECOVERY_MODES,
      DEFAULT_WORKFLOW_BOARD_AUTOMATION.recovery,
    ),
    stopPolicy: normalizeKnownValue(
      automation.stopPolicy ?? automation.stop_policy,
      WORKFLOW_BOARD_STOP_POLICIES,
      DEFAULT_WORKFLOW_BOARD_AUTOMATION.stopPolicy,
    ),
    publishMode: normalizeKnownValue(
      automation.publishMode ?? automation.publish_mode,
      WORKFLOW_BOARD_PUBLISH_MODES,
      DEFAULT_WORKFLOW_BOARD_AUTOMATION.publishMode,
    ),
    defaultApprovalMode: textOrNull(automation.defaultApprovalMode ?? automation.default_approval_mode)
      ?? DEFAULT_WORKFLOW_BOARD_AUTOMATION.defaultApprovalMode,
    globalParallelLimit: globalParallelLimit ?? DEFAULT_WORKFLOW_BOARD_AUTOMATION.globalParallelLimit,
    fallbackAgents: fallbackAgents.length
      ? fallbackAgents
      : [...DEFAULT_WORKFLOW_BOARD_AUTOMATION.fallbackAgents],
    manualGateOverride: Boolean(automation.manualGateOverride ?? automation.manual_gate_override),
    ...(leaseTtlMs ? { leaseTtlMs } : {}),
  };
}

export function normalizeRecoveryFlags(flags = []) {
  return textArray(flags).filter(flag => RECOVERY_FLAGS.includes(flag));
}

export function normalizeWorkflowEntityRefs(input = {}) {
  return {
    goalId: textOrNull(input.goalId ?? input.goal_id),
    chatId: textOrNull(input.chatId ?? input.chat_id),
    taskIds: textArray(input.taskIds ?? input.task_ids),
    files: textArray(input.files ?? input.filePaths ?? input.file_paths),
  };
}

export function createDefaultWorkflowBoard(opts = {}) {
  let now = opts.now ?? Date.now();
  let id = textOrNull(opts.id) ?? DEFAULT_WORKFLOW_BOARD_ID;
  return {
    schema: WORKFLOW_BOARD_SCHEMA,
    id,
    title: textOrNull(opts.title) ?? 'Agent Workflow',
    mode: normalizeWorkflowBoardMode(opts.mode, 'armed'),
    automation: normalizeWorkflowBoardAutomation(opts.automation),
    columns: DEFAULT_WORKFLOW_COLUMNS.map(column => ({
      ...column,
      automation: { ...column.automation },
    })),
    transitions: DEFAULT_WORKFLOW_TRANSITIONS.map((transition) => ({
      ...transition,
      gates: textArray(transition.gates ?? transition.gate),
    })),
    version: positiveVersion(opts.version),
    createdAt: opts.createdAt ?? now,
    updatedAt: opts.updatedAt ?? now,
  };
}

export function normalizeWorkflowChecksInput(input = {}, opts = {}) {
  let now = opts.now ?? Date.now();
  let cardId = textOrNull(opts.cardId ?? input.cardId ?? input.card_id);
  if (!cardId) throw new Error('Workflow checks require cardId.');
  let checks = input.checks && typeof input.checks === 'object' ? input.checks : input;
  return {
    schema: WORKFLOW_CHECKS_SCHEMA,
    cardId,
    checks: { ...checks },
    updatedAt: opts.updatedAt ?? input.updatedAt ?? now,
    updatedBy: textOrNull(opts.actor ?? input.updatedBy ?? input.updated_by) ?? 'system',
  };
}

export function normalizeWorkflowCardInput(input = {}, opts = {}) {
  let now = opts.now ?? Date.now();
  let id = textOrNull(opts.id ?? input.id);
  if (!id) throw new Error('Workflow card requires id.');
  let title = textOrNull(input.title);
  if (!title) throw new Error('Workflow card requires title.');
  let columnId = textOrNull(input.columnId ?? input.column_id) ?? 'ideas';
  if (!DEFAULT_WORKFLOW_COLUMN_IDS.includes(columnId)) {
    throw new Error(`Unknown workflow column "${columnId}". Supported: ${DEFAULT_WORKFLOW_COLUMN_IDS.join(', ')}`);
  }
  return {
    schema: WORKFLOW_CARD_SCHEMA,
    id,
    boardId: textOrNull(input.boardId ?? input.board_id) ?? DEFAULT_WORKFLOW_BOARD_ID,
    columnId,
    title,
    kind: textOrNull(input.kind) ?? 'work-item',
    priority: textOrNull(input.priority),
    body: textOrNull(input.body ?? input.description ?? input.summary),
    parentCardId: textOrNull(input.parentCardId ?? input.parent_card_id),
    projectId: textOrNull(input.projectId ?? input.project_id),
    domain: textOrNull(input.domain),
    cwd: textOrNull(input.cwd ?? input.workingDirectory ?? input.working_directory ?? input.metadata?.cwd),
    owner: textOrNull(input.owner),
    assignedAgent: textOrNull(input.assignedAgent ?? input.assigned_agent ?? input.agent ?? input.agentSlug ?? input.agent_slug),
    resourceGroup: textOrNull(input.resourceGroup ?? input.resource_group),
    approvalMode: textOrNull(input.approvalMode ?? input.approval_mode),
    acceptanceCriteria: textArray(input.acceptanceCriteria ?? input.acceptance_criteria),
    context: textArray(input.context),
    routingHints: textArray(input.routingHints ?? input.routing_hints),
    blockers: textArray(input.blockers),
    files: textArray(
      input.files
        ?? input.filePaths
        ?? input.file_paths
        ?? input.entityRefs?.files
        ?? input.entity_refs?.files
        ?? input.metadata?.files,
    ),
    automation: normalizeWorkflowAutomation(input.automation),
    entityRefs: normalizeWorkflowEntityRefs(input.entityRefs ?? input.entity_refs ?? {}),
    metadata: objectOrEmpty(input.metadata),
    recoveryFlags: normalizeRecoveryFlags(input.recoveryFlags ?? input.recovery_flags),
    version: positiveVersion(input.version ?? opts.version),
    createdAt: input.createdAt ?? input.created_at ?? opts.createdAt ?? now,
    updatedAt: opts.updatedAt ?? input.updatedAt ?? input.updated_at ?? now,
    createdBy: textOrNull(input.createdBy ?? input.created_by ?? opts.actor) ?? 'system',
    updatedBy: textOrNull(opts.actor ?? input.updatedBy ?? input.updated_by) ?? 'system',
  };
}

export function normalizeWorkflowTransitionRequest(input = {}) {
  let cardId = textOrNull(input.cardId ?? input.card_id);
  if (!cardId) throw new Error('Workflow transition requires cardId.');
  let toColumnId = textOrNull(input.toColumnId ?? input.to_column_id);
  if (!toColumnId) throw new Error('Workflow transition requires toColumnId.');
  let expectedVersion = input.expectedVersion ?? input.expected_version;
  let version = expectedVersion === undefined || expectedVersion === null
    ? null
    : positiveVersion(expectedVersion, 0);
  return {
    boardId: textOrNull(input.boardId ?? input.board_id) ?? DEFAULT_WORKFLOW_BOARD_ID,
    cardId,
    fromColumnId: textOrNull(input.fromColumnId ?? input.from_column_id),
    toColumnId,
    actor: textOrNull(input.actor) ?? 'system',
    mode: normalizeKnownValue(input.mode, WORKFLOW_TRANSITION_MODES, 'manual'),
    reason: textOrNull(input.reason),
    force: Boolean(input.force ?? input.finalize),
    entityRefs: normalizeWorkflowEntityRefs(input.entityRefs ?? input.entity_refs ?? {}),
    expectedVersion: version,
  };
}

export function normalizeWorkflowTransitionEvent(input = {}, opts = {}) {
  let now = opts.now ?? Date.now();
  let id = textOrNull(opts.id ?? input.id);
  if (!id) throw new Error('Workflow transition event requires id.');
  let status = normalizeKnownValue(input.status, WORKFLOW_TRANSITION_STATUSES, 'blocked');
  return {
    schema: WORKFLOW_TRANSITION_SCHEMA,
    id,
    eventType: textOrNull(input.eventType ?? input.event_type ?? input.type) ?? 'transition',
    boardId: textOrNull(input.boardId ?? input.board_id) ?? DEFAULT_WORKFLOW_BOARD_ID,
    cardId: textOrNull(input.cardId ?? input.card_id),
    fromColumnId: textOrNull(input.fromColumnId ?? input.from_column_id),
    toColumnId: textOrNull(input.toColumnId ?? input.to_column_id),
    actor: textOrNull(input.actor) ?? 'system',
    mode: normalizeKnownValue(input.mode, WORKFLOW_TRANSITION_MODES, 'manual'),
    reason: textOrNull(input.reason),
    entityRefs: normalizeWorkflowEntityRefs(input.entityRefs ?? input.entity_refs ?? {}),
    expectedVersion: input.expectedVersion ?? input.expected_version ?? null,
    cardVersion: input.cardVersion ?? input.card_version ?? null,
    status,
    gateResult: input.gateResult ?? input.gate_result ?? { ok: status === 'accepted', checks: [], failures: [] },
    sideEffects: Array.isArray(input.sideEffects) ? input.sideEffects : [],
    approvalRequired: Boolean(input.approvalRequired ?? input.approval_required),
    rollbackColumnId: textOrNull(input.rollbackColumnId ?? input.rollback_column_id),
    createdAt: input.createdAt ?? input.created_at ?? now,
  };
}

export function normalizeWorkflowRunInput(input = {}, opts = {}) {
  let now = opts.now ?? Date.now();
  let id = textOrNull(opts.id ?? input.id);
  if (!id) throw new Error('Workflow run requires id.');
  let cardId = textOrNull(input.cardId ?? input.card_id);
  if (!cardId) throw new Error('Workflow run requires cardId.');
  return {
    schema: WORKFLOW_RUN_SCHEMA,
    id,
    boardId: textOrNull(input.boardId ?? input.board_id) ?? DEFAULT_WORKFLOW_BOARD_ID,
    cardId,
    transitionId: textOrNull(input.transitionId ?? input.transition_id),
    leaseOwner: textOrNull(input.leaseOwner ?? input.lease_owner),
    taskIds: textArray(input.taskIds ?? input.task_ids),
    status: textOrNull(input.status) ?? 'running',
    startedAt: input.startedAt ?? input.started_at ?? now,
    updatedAt: opts.updatedAt ?? input.updatedAt ?? input.updated_at ?? now,
    completedAt: input.completedAt ?? input.completed_at ?? null,
  };
}

export function normalizeWorkflowLeaseInput(input = {}, opts = {}) {
  let now = opts.now ?? Date.now();
  let cardId = textOrNull(input.cardId ?? input.card_id ?? opts.cardId);
  if (!cardId) throw new Error('Workflow lease requires cardId.');
  return {
    schema: WORKFLOW_LEASE_SCHEMA,
    cardId,
    runId: textOrNull(input.runId ?? input.run_id),
    leaseOwner: textOrNull(input.leaseOwner ?? input.lease_owner),
    leaseExpiresAt: input.leaseExpiresAt ?? input.lease_expires_at ?? null,
    updatedAt: opts.updatedAt ?? input.updatedAt ?? input.updated_at ?? now,
  };
}

export function getWorkflowTransition(board, fromColumnId, toColumnId) {
  let transitions = Array.isArray(board?.transitions) ? board.transitions : [];
  return transitions.find(item => item.from === fromColumnId && item.to === toColumnId) ?? null;
}

export function evaluateWorkflowTransitionGates({ board, card, checks = {}, request }) {
  let failures = [];
  let transition = getWorkflowTransition(board, card.columnId, request.toColumnId);
  if (!transition) {
    failures.push({
      gate: 'transition_allowed',
      reason: `Transition ${card.columnId} -> ${request.toColumnId} is not allowed.`,
    });
    return { ok: false, checks: [], failures };
  }

  let gateIds = textArray(transition.gates ?? transition.gate);
  let results = [];
  for (let gate of gateIds) {
    let check = GATE_CHECKS[gate];
    if (!check) {
      failures.push({ gate, reason: `Unknown transition gate "${gate}".` });
      continue;
    }
    let result = check(card, checks, request);
    results.push({ gate, ok: result.ok });
    if (!result.ok) failures.push({ gate, reason: result.reason });
  }

  return { ok: failures.length === 0, checks: results, failures };
}
