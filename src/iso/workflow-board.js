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
  'paused',
  'maintenance',
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
    automation: { trigger: 'manual', action: 'scope', mode: 'gated' },
  },
  {
    id: 'ready',
    title: 'Tasks / Ready',
    automation: {
      trigger: 'on_enter',
      action: 'orchestrate',
      mode: 'gated',
      agent: 'orchestrator',
    },
  },
  {
    id: 'in-progress',
    title: 'In Progress',
    automation: { trigger: 'lease_required', action: 'execute', mode: 'gated' },
  },
  {
    id: 'quality-audit',
    title: 'Quality Audit',
    automation: {
      trigger: 'on_enter',
      action: 'audit',
      mode: 'gated',
      agent: 'reviewer',
    },
  },
  {
    id: 'commit-publish',
    title: 'Commit / Publish',
    automation: {
      trigger: 'manual',
      action: 'publish',
      mode: 'gated',
      approvalMode: 'plan',
    },
  },
  {
    id: 'done',
    title: 'Done',
    automation: { trigger: 'manual', action: 'close', mode: 'manual' },
  },
];

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

function checkPassed(value) {
  if (value === true) return true;
  if (value === false || value === null || value === undefined) return false;
  if (typeof value === 'object') return checkPassed(value.status);
  let status = String(value).trim().toLowerCase();
  return ['passed', 'pass', 'ok', 'clean', 'complete', 'waived', 'waiver'].includes(status);
}

function objectOrEmpty(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function normalizeWorkflowAutomation(input = {}) {
  let automation = objectOrEmpty(input);
  return Object.fromEntries(Object.entries({
    trigger: textOrNull(automation.trigger),
    action: textOrNull(automation.action),
    mode: textOrNull(automation.mode),
    agent: textOrNull(automation.agent ?? automation.agentSlug ?? automation.agent_slug),
    approvalMode: textOrNull(automation.approvalMode ?? automation.approval_mode),
    resourceGroup: textOrNull(automation.resourceGroup ?? automation.resource_group),
    enabled: automation.enabled === undefined ? undefined : Boolean(automation.enabled),
  }).filter(([, value]) => value !== undefined && value !== null));
}

export function normalizeRecoveryFlags(flags = []) {
  return textArray(flags).filter(flag => RECOVERY_FLAGS.includes(flag));
}

export function normalizeWorkflowEntityRefs(input = {}) {
  return {
    goalId: textOrNull(input.goalId ?? input.goal_id),
    chatId: textOrNull(input.chatId ?? input.chat_id),
    taskIds: textArray(input.taskIds ?? input.task_ids),
  };
}

export function createDefaultWorkflowBoard(opts = {}) {
  let now = opts.now ?? Date.now();
  let id = textOrNull(opts.id) ?? DEFAULT_WORKFLOW_BOARD_ID;
  return {
    schema: WORKFLOW_BOARD_SCHEMA,
    id,
    title: textOrNull(opts.title) ?? 'Agent Workflow',
    mode: normalizeKnownValue(opts.mode, WORKFLOW_BOARD_MODES, 'armed'),
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
    projectId: textOrNull(input.projectId ?? input.project_id),
    domain: textOrNull(input.domain),
    owner: textOrNull(input.owner),
    assignedAgent: textOrNull(input.assignedAgent ?? input.assigned_agent ?? input.agent ?? input.agentSlug ?? input.agent_slug),
    resourceGroup: textOrNull(input.resourceGroup ?? input.resource_group),
    approvalMode: textOrNull(input.approvalMode ?? input.approval_mode),
    acceptanceCriteria: textArray(input.acceptanceCriteria ?? input.acceptance_criteria),
    context: textArray(input.context),
    routingHints: textArray(input.routingHints ?? input.routing_hints),
    blockers: textArray(input.blockers),
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
