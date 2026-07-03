const WORKFLOW_BOARD_ENDPOINT = '/api/workflow-board';
const WORKFLOW_TRANSITIONS_ENDPOINT = '/api/workflow-board/transitions';
const WORKFLOW_DECOMPOSE_ENDPOINT = '/api/workflow-board/decompose';
const WORKFLOW_ORCHESTRATE_ENDPOINT = '/api/workflow-board/orchestrate';
const WORKFLOW_CONTROL_ENDPOINT = '/api/workflow-board/control';
const WORKFLOW_REPLY_ENDPOINT = '/api/workflow-board/cards/reply';
const WORKFLOW_DELETE_ENDPOINT = '/api/workflow-board/delete';
const WORKFLOW_BOARD_AUTOMATION_ENDPOINT = '/api/workflow-board/automation';
const WORKFLOW_COLUMN_UPDATE_ENDPOINT = '/api/workflow-board/columns/update';
const WORKFLOW_RECOVERY_RECONCILE_ENDPOINT = '/api/workflow-board/recovery/reconcile';
const WORKFLOW_MARKDOWN_IMPORT_ENDPOINT = '/api/workflow-board/markdown/import';

const DEFAULT_BOARD_ID = 'agent-workflow-default';
const DEFAULT_BOARD_MODE = 'passive';
const DEFAULT_COLUMN_ID = 'backlog';
const DEFAULT_COLUMNS = [
  {
    id: 'ideas',
    title: 'Ideas / Inbox',
    description: 'Raw ideas, audit follow-ups, and unscoped observations.',
  },
  {
    id: 'backlog',
    title: 'Backlog',
    description: 'Candidate work that needs scope before execution.',
  },
  {
    id: 'ready',
    title: 'Tasks',
    description: 'Accepted work with owner and acceptance criteria.',
  },
  {
    id: 'in-progress',
    title: 'In Progress',
    description: 'Active execution under orchestrator or human ownership.',
  },
  {
    id: 'quality-audit',
    title: 'Quality Audit',
    description: 'Review, tests, hygiene, and explicit waivers.',
  },
  {
    id: 'commit-publish',
    title: 'Commit / Publish',
    description: 'Release gate, clean diff, and publication readiness.',
  },
  {
    id: 'done',
    title: 'Done',
    description: 'Closed work with cleanup and closure recorded.',
  },
];

const ACTIVE_COLUMN_IDS = new Set(['ready', 'in-progress', 'quality-audit', 'commit-publish']);
const RECOVERY_FLAG_KEYS = new Set([
  'needs_resume',
  'needs-audit',
  'needs_audit',
  'recovering',
  'stale',
  'lost',
  'blocked',
]);

function normalizeText(value, fallback = '') {
  let text = String(value ?? '').replace(/\s+/g, ' ').trim();
  return text || fallback;
}

function normalizeBodyText(value, fallback = '') {
  let text = String(value ?? '').trim();
  return text || fallback;
}

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function asArray(value) {
  if (Array.isArray(value)) return value;
  if (value == null) return [];
  return [value];
}

function normalizeId(value, fallback = '') {
  let text = normalizeText(value, fallback);
  return text.toLowerCase().replace(/[^a-z0-9._:-]+/g, '-').replace(/^-+|-+$/g, '');
}

function titleFromId(value) {
  let text = normalizeText(value);
  if (!text) return '';
  return text
    .split(/[-_:/]+/)
    .filter(Boolean)
    .map(part => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(' ');
}

const SUMMARY_MARKER_PREFIX = /^\s*(?:#{1,6}\s+|[-*]\s+|(?:WHAT|TASK|GOAL|SUMMARY|CONTEXT|WHY|SCOPE)\s*:\s*)/i;
const SUMMARY_LIMIT = 140;

function summarizeCardText(value, limit = SUMMARY_LIMIT) {
  let raw = String(value ?? '').trim();
  if (!raw) return '';

  // Take the first non-empty line only — prompt/description bodies are
  // multi-line, but a card summary is a single-purpose label, not a dump.
  let firstLine = raw.split(/\r?\n/).find(line => line.trim()) || '';
  let text = firstLine
    .replace(SUMMARY_MARKER_PREFIX, '')
    .replace(/\*\*/g, '')
    .replace(/`/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!text) return '';

  // Prefer stopping at the first sentence boundary when it keeps the
  // summary reasonably short; otherwise fall back to a hard cap that
  // breaks on a word boundary instead of mid-word.
  let sentenceMatch = text.match(/^.{1,}?[.!?](?:\s|$)/);
  if (sentenceMatch && sentenceMatch[0].trim().length <= limit) {
    return sentenceMatch[0].trim();
  }

  if (text.length <= limit) return text;
  let truncated = text.slice(0, limit - 1);
  let lastSpace = truncated.lastIndexOf(' ');
  if (lastSpace > limit * 0.6) truncated = truncated.slice(0, lastSpace);
  return `${truncated.trimEnd()}…`;
}

function normalizeTimestamp(value) {
  if (!value) return '';
  let date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString();
}

function normalizeStringList(value) {
  if (Array.isArray(value)) {
    return value.map(item => normalizeText(item)).filter(Boolean);
  }
  if (value && typeof value === 'object') {
    return Object.entries(value)
      .filter(([, enabled]) => Boolean(enabled))
      .map(([key]) => normalizeText(key))
      .filter(Boolean);
  }
  return normalizeText(value) ? [normalizeText(value)] : [];
}

function normalizeFlags(card = {}) {
  let flags = new Set();
  for (let flag of normalizeStringList(card.flags)) flags.add(flag);
  for (let flag of normalizeStringList(card.recoveryFlags || card.recovery_flags)) flags.add(flag);

  let recovery = asObject(card.recovery);
  for (let [key, enabled] of Object.entries(recovery)) {
    if (enabled === true || normalizeText(enabled)) flags.add(key);
  }

  let status = normalizeText(card.status).toLowerCase();
  if (status === 'blocked') flags.add('blocked');
  if (status === 'stale' || card.stale === true) flags.add('stale');
  if (card.blocked === true || normalizeText(card.blockedReason)) flags.add('blocked');
  if (card.needsResume === true || card.needs_resume === true) flags.add('needs_resume');
  if (card.needsAudit === true || card.needs_audit === true) flags.add('needs_audit');
  if (card.recovering === true) flags.add('recovering');

  return [...flags].sort((a, b) => a.localeCompare(b));
}

function normalizeColumn(raw = {}, index = 0) {
  let column = asObject(raw);
  let id = normalizeId(column.id || column.columnId || column.key || column.name, `column-${index + 1}`);
  let title = normalizeText(column.title || column.label || column.name, titleFromId(id));
  return {
    id,
    title,
    description: normalizeText(column.description || column.summary),
    gate: normalizeText(column.gate || column.policy?.gate),
    limit: Number.isFinite(Number(column.limit)) ? Number(column.limit) : null,
    order: Number.isFinite(Number(column.order)) ? Number(column.order) : index,
    policy: asObject(column.policy),
    automation: asObject(column.automation),
    cards: [],
  };
}

function normalizeEntityRefs(card = {}) {
  let refs = asObject(card.entityRefs || card.entity_refs);
  let goalId = normalizeText(refs.goalId || refs.goal_id || card.goalId || card.goal_id);
  let chatId = normalizeText(refs.chatId || refs.chat_id || card.chatId || card.chat_id);
  let taskIds = normalizeStringList(refs.taskIds || refs.task_ids || card.taskIds || card.task_ids);
  return {
    ...(goalId ? { goalId } : {}),
    ...(chatId ? { chatId } : {}),
    ...(taskIds.length ? { taskIds } : {}),
  };
}

function normalizeCheck(raw = {}) {
  let check = asObject(raw);
  return {
    id: normalizeText(check.id || check.key || check.name),
    label: normalizeText(check.label || check.title || check.name || check.id, 'Check'),
    status: normalizeText(check.status ?? check.state, 'pending'),
    note: normalizeText(check.note || check.summary || check.message),
  };
}

function normalizeCheckEntry(key, raw) {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    return normalizeCheck({
      id: key,
      label: raw.label || raw.title || raw.name || titleFromId(key),
      ...raw,
    });
  }
  return normalizeCheck({
    id: key,
    label: titleFromId(key),
    status: raw,
  });
}

function normalizeChecks(raw) {
  if (Array.isArray(raw)) return raw.map(normalizeCheck);
  let checks = asObject(raw?.checks || raw);
  return Object.entries(checks)
    .map(([key, value]) => normalizeCheckEntry(key, value))
    .filter(check => check.id || check.label);
}

function normalizeEvent(raw = {}) {
  let event = asObject(raw);
  return {
    id: normalizeText(event.id || event.eventId || event.transitionId),
    eventType: normalizeText(event.eventType || event.event_type || event.type, 'transition'),
    label: normalizeText(event.label || event.title || event.type || event.status, 'Event'),
    status: normalizeText(event.status || event.result),
    actor: normalizeText(event.actor || event.owner),
    fromColumnId: normalizeText(event.fromColumnId || event.from_column_id || event.from),
    toColumnId: normalizeText(event.toColumnId || event.to_column_id || event.to),
    timestamp: normalizeTimestamp(event.timestamp || event.createdAt || event.updatedAt || event.time),
    note: normalizeText(event.note || event.reason || event.message || event.summary),
  };
}

function normalizeBoardAutomation(raw = {}) {
  let automation = asObject(raw);
  return {
    pickup: normalizeText(automation.pickup || automation.pickupMode || automation.pickup_mode, 'auto'),
    recovery: normalizeText(automation.recovery || automation.recoveryMode || automation.recovery_mode, 'manual'),
    stopPolicy: normalizeText(automation.stopPolicy || automation.stop_policy, 'drain'),
    publishMode: normalizeText(automation.publishMode || automation.publish_mode, 'manual'),
    defaultApprovalMode: normalizeText(automation.defaultApprovalMode || automation.default_approval_mode, 'plan'),
    globalParallelLimit: Number.isFinite(Number(automation.globalParallelLimit ?? automation.global_parallel_limit))
      ? Math.max(1, Math.floor(Number(automation.globalParallelLimit ?? automation.global_parallel_limit)))
      : 8,
    fallbackAgents: normalizeStringList(automation.fallbackAgents || automation.fallback_agents || automation.agents),
    manualGateOverride: Boolean(automation.manualGateOverride || automation.manual_gate_override),
    leaseTtlMs: Number.isFinite(Number(automation.leaseTtlMs ?? automation.lease_ttl_ms))
      ? Math.max(1, Math.floor(Number(automation.leaseTtlMs ?? automation.lease_ttl_ms)))
      : null,
  };
}

function normalizeRun(raw = {}) {
  let run = asObject(raw);
  return {
    id: normalizeText(run.id || run.runId || run.run_id),
    boardId: normalizeText(run.boardId || run.board_id),
    cardId: normalizeText(run.cardId || run.card_id),
    transitionId: normalizeText(run.transitionId || run.transition_id),
    leaseOwner: normalizeText(run.leaseOwner || run.lease_owner),
    taskIds: normalizeStringList(run.taskIds || run.task_ids),
    status: normalizeText(run.status || run.state),
    startedAt: normalizeTimestamp(run.startedAt || run.started_at),
    updatedAt: normalizeTimestamp(run.updatedAt || run.updated_at),
    completedAt: normalizeTimestamp(run.completedAt || run.completed_at),
    tokens: Number.isFinite(Number(run.tokens ?? run.token_total ?? run.totalTokens))
      ? Math.floor(Number(run.tokens ?? run.token_total ?? run.totalTokens))
      : null,
    chatId: normalizeText(run.chatId || run.chat_id),
    raw: run,
  };
}

function normalizeLease(raw = {}) {
  let lease = asObject(raw);
  return {
    cardId: normalizeText(lease.cardId || lease.card_id),
    runId: normalizeText(lease.runId || lease.run_id),
    leaseOwner: normalizeText(lease.leaseOwner || lease.lease_owner || lease.owner),
    leaseExpiresAt: normalizeTimestamp(lease.leaseExpiresAt || lease.lease_expires_at),
    updatedAt: normalizeTimestamp(lease.updatedAt || lease.updated_at),
    raw: lease,
  };
}

function normalizeCard(raw = {}, index = 0, fallbackColumnId = DEFAULT_COLUMN_ID) {
  let card = asObject(raw);
  let title = normalizeText(card.title || card.name || card.summary, `Work item ${index + 1}`);
  let id = normalizeText(card.id || card.cardId || card.key);
  if (!id) id = normalizeId(`${fallbackColumnId}-${title}`, `card-${index + 1}`);

  let columnId = normalizeId(
    card.columnId
      || card.column_id
      || card.workflowColumn
      || card.workflow_column
      || card.stage
      || fallbackColumnId,
    fallbackColumnId,
  );
  let flags = normalizeFlags(card);
  let labels = normalizeStringList(card.labels || card.tags).slice(0, 6);
  let entityRefs = normalizeEntityRefs(card);
  let files = normalizeStringList(card.files || card.fileRefs || card.file_refs || card.paths);
  let checks = normalizeChecks(card.checks || card.workflowChecks || card.workflow_checks);
  let events = asArray(card.events || card.eventHistory || card.event_history).map(normalizeEvent);
  let priority = normalizeText(card.priority || card.severity || card.rank);
  let runs = asArray(card.runs || card.workflowRuns || card.workflow_runs).map(normalizeRun);
  let run = normalizeRun(card.run || card.workflowRun || card.workflow_run || runs[0]);

  return {
    id,
    title,
    body: normalizeBodyText(card.body || card.markdown || card.description || card.prompt || ''),
    summary: summarizeCardText(card.description || card.summary || card.body || card.prompt || ''),
    columnId,
    parentCardId: normalizeText(card.parentCardId || card.parent_card_id),
    childCardIds: normalizeStringList(card.childCardIds || card.child_card_ids),
    projectId: normalizeText(card.projectId || card.project_id || card.project || entityRefs.projectId),
    kind: normalizeText(card.kind || card.type, 'work-item'),
    priority,
    status: normalizeText(card.status || card.runtimeStatus || card.runtime_status),
    lifecycle: normalizeText(card.lifecycle || card.workflowLifecycle || card.workflow_lifecycle),
    owner: normalizeText(card.owner || card.assignee || card.agent || card.agentSlug),
    assignedAgent: normalizeText(card.assignedAgent || card.assigned_agent || card.agent || card.agentSlug),
    resourceGroup: normalizeText(card.resourceGroup || card.resource_group),
    approvalMode: normalizeText(card.approvalMode || card.approval_mode),
    blocker: normalizeText(card.blocker || card.blockedReason || card.blocked_reason),
    updatedAt: normalizeTimestamp(card.updatedAt || card.updated_at || card.modifiedAt),
    createdAt: normalizeTimestamp(card.createdAt || card.created_at),
    version: Number.isFinite(Number(card.version)) ? Number(card.version) : null,
    order: Number.isFinite(Number(card.order ?? card.position ?? card.rank))
      ? Number(card.order ?? card.position ?? card.rank)
      : index,
    flags,
    labels,
    entityRefs,
    files,
    checks,
    events,
    run,
    runs,
    lease: normalizeLease(card.lease || card.workflowLease || card.workflow_lease),
    automation: asObject(card.automation),
    metadata: asObject(card.metadata),
    developmentMap: asObject(card.developmentMap || card.development_map),
    allowedTransitions: asArray(card.allowedTransitions || card.allowed_transitions),
    raw: card,
  };
}

function normalizeTransition(raw = {}) {
  let transition = asObject(raw);
  let from = normalizeId(transition.from || transition.fromColumnId || transition.from_column_id);
  let to = normalizeId(transition.to || transition.toColumnId || transition.to_column_id);
  if (!from || !to) return null;
  return {
    from,
    to,
    label: normalizeText(transition.label || transition.title, `Move to ${titleFromId(to)}`),
    gate: normalizeText(transition.gate || transition.policy?.gate),
    destructive: Boolean(transition.destructive),
    requiresReason: Boolean(transition.requiresReason || transition.requires_reason),
    mode: normalizeText(transition.mode || transition.intentMode),
  };
}

function embeddedCardsFromColumns(columns = []) {
  let cards = [];
  for (let column of asArray(columns)) {
    let columnId = normalizeId(column?.id || column?.columnId || column?.key || column?.name, DEFAULT_COLUMN_ID);
    for (let card of asArray(column?.cards || column?.items)) {
      cards.push({
        ...asObject(card),
        columnId: card?.columnId || card?.column_id || columnId,
      });
    }
  }
  return cards;
}

function ensureColumns(columns, cards) {
  let byId = new Map();
  for (let column of columns) byId.set(column.id, { ...column, cards: [] });
  for (let card of cards) {
    if (!byId.has(card.columnId)) {
      byId.set(card.columnId, {
        id: card.columnId,
        title: titleFromId(card.columnId),
        description: '',
        gate: '',
        limit: null,
        order: byId.size,
    policy: {},
    automation: {},
    cards: [],
      });
    }
  }
  return [...byId.values()].sort((a, b) => a.order - b.order);
}

function sortCards(cards = []) {
  return [...cards].sort((a, b) => {
    if (a.order !== b.order) return a.order - b.order;
    let aTime = Date.parse(a.updatedAt || a.createdAt || '') || 0;
    let bTime = Date.parse(b.updatedAt || b.createdAt || '') || 0;
    return bTime - aTime;
  });
}

function flagNeedsRecovery(flag) {
  let key = normalizeText(flag).toLowerCase();
  return RECOVERY_FLAG_KEYS.has(key);
}

function deriveCounters(cards, columns) {
  let counters = {
    total: cards.length,
    active: cards.filter(card => ACTIVE_COLUMN_IDS.has(card.columnId)).length,
    blocked: cards.filter(card => card.flags.some(flag => normalizeText(flag).toLowerCase() === 'blocked')).length,
    recovery: cards.filter(card => card.flags.some(flagNeedsRecovery)).length,
    done: cards.filter(card => card.columnId === 'done').length,
    columns: columns.length,
  };
  return counters;
}

function normalizeCounters(rawCounters, derived) {
  let counters = asObject(rawCounters);
  return {
    total: Number.isFinite(Number(counters.total ?? counters.cards)) ? Number(counters.total ?? counters.cards) : derived.total,
    active: Number.isFinite(Number(counters.active)) ? Number(counters.active) : derived.active,
    blocked: Number.isFinite(Number(counters.blocked)) ? Number(counters.blocked) : derived.blocked,
    recovery: Number.isFinite(Number(counters.recovery ?? counters.needsRecovery))
      ? Number(counters.recovery ?? counters.needsRecovery)
      : derived.recovery,
    done: Number.isFinite(Number(counters.done)) ? Number(counters.done) : derived.done,
    columns: Number.isFinite(Number(counters.columns)) ? Number(counters.columns) : derived.columns,
  };
}

function assignCardsToColumns(columns, cards) {
  let byColumn = new Map(columns.map(column => [column.id, { ...column, cards: [] }]));
  for (let card of sortCards(cards)) {
    let column = byColumn.get(card.columnId);
    if (column) column.cards.push(card);
  }
  return [...byColumn.values()];
}

function appendParam(params, key, value) {
  let text = normalizeText(value);
  if (text) params.set(key, text);
}

export function buildWorkflowBoardUrl(filters = {}, endpoint = WORKFLOW_BOARD_ENDPOINT) {
  let params = new URLSearchParams();
  appendParam(params, 'scope', filters.scope);
  appendParam(params, 'projectId', filters.projectId);
  appendParam(params, 'goalId', filters.goalId);
  appendParam(params, 'chatId', filters.chatId);
  appendParam(params, 'boardId', filters.boardId);
  appendParam(params, 'mode', filters.mode);
  if (filters.importMarkdown === true) params.set('importMarkdown', 'true');
  if (filters.reconcileRuntime === true) params.set('reconcileRuntime', 'true');
  let query = params.toString();
  return query ? `${endpoint}?${query}` : endpoint;
}

export function normalizeWorkflowBoardPayload(payload = {}, filters = {}) {
  let root = asObject(payload);
  let projection = asObject(root.projection);
  let source = asObject(
    projection.board
      || projection.workflowBoard
      || root.board
      || root.workflowBoard
      || root.workflow_board
      || projection
      || root,
  );
  let rawColumns = asArray(source.columns || root.columns);
  let rawCards = [
    ...embeddedCardsFromColumns(rawColumns),
    ...asArray(source.cards || source.items || projection.cards || projection.items || root.cards || root.items),
  ];

  let normalizedCards = rawCards.map((card, index) => {
    let fallbackColumnId = normalizeId(card?.columnId || card?.column_id || DEFAULT_COLUMN_ID);
    return normalizeCard(card, index, fallbackColumnId);
  });

  let columns = ensureColumns(
    rawColumns.length ? rawColumns.map(normalizeColumn) : DEFAULT_COLUMNS.map(normalizeColumn),
    normalizedCards,
  );
  columns = assignCardsToColumns(columns, normalizedCards);

  let transitions = asArray(source.transitions || root.transitions)
    .map(normalizeTransition)
    .filter(Boolean);
  let counters = normalizeCounters(
    source.counters || source.summary || projection.counts || projection.counters || root.counters,
    deriveCounters(normalizedCards, columns),
  );
  let boardId = normalizeText(source.id || source.boardId || source.board_id || projection.boardId || filters.boardId, DEFAULT_BOARD_ID);
  let scopeSource = asObject(source.scope || projection.scope);
  let scope = normalizeText(
    scopeSource.kind || scopeSource.scope || source.scope || filters.scope || (filters.projectId ? 'project' : 'home'),
    'home',
  );
  let projectId = normalizeText(scopeSource.projectId || source.projectId || source.project_id || filters.projectId);
  let mode = normalizeText(source.mode || source.boardMode || source.board_mode || filters.mode, DEFAULT_BOARD_MODE);
  let events = asArray(source.events || projection.events || root.events).map(normalizeEvent);

  return {
    id: boardId,
    boardId,
    title: normalizeText(source.title || source.name, projectId ? 'Project Workflow Board' : 'Workflow Board'),
    description: normalizeText(source.description || source.summary),
    scope,
    projectId,
    mode,
    automation: normalizeBoardAutomation(source.automation || source.policy?.automation),
    version: Number.isFinite(Number(source.version || projection.version || root.version))
      ? Number(source.version || projection.version || root.version)
      : null,
    updatedAt: normalizeTimestamp(source.updatedAt || source.updated_at || root.updatedAt),
    columns,
    cards: normalizedCards,
    transitions,
    counters,
    events,
    filters: asObject(source.filters || root.filters),
    recovery: asObject(source.recovery || root.recovery),
    raw: root,
  };
}

export async function fetchWorkflowBoard(filters = {}, options = {}) {
  let fetchImpl = options.fetchImpl || globalThis.fetch;
  if (typeof fetchImpl !== 'function') {
    throw new Error('Workflow board fetch failed: fetch is not available in this runtime.');
  }

  let response = await fetchImpl(buildWorkflowBoardUrl(filters, options.endpoint), {
    signal: options.signal,
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) {
    throw new Error(`Workflow board fetch failed: /api/workflow-board returned HTTP ${response.status}.`);
  }
  let payload = await response.json();
  if (payload?.error) {
    throw new Error(`Workflow board fetch failed: ${payload.error}`);
  }
  return normalizeWorkflowBoardPayload(payload, filters);
}

export async function requestWorkflowTransition(input = {}, options = {}) {
  let fetchImpl = options.fetchImpl || globalThis.fetch;
  if (typeof fetchImpl !== 'function') {
    throw new Error('Workflow transition request failed: fetch is not available in this runtime.');
  }

  let boardId = normalizeText(input.boardId || input.board_id);
  let cardId = normalizeText(input.cardId || input.card_id);
  let fromColumnId = normalizeId(input.fromColumnId || input.from_column_id);
  let toColumnId = normalizeId(input.toColumnId || input.to_column_id || input.to);
  if (!boardId) throw new Error('Workflow transition request failed: boardId is required.');
  if (!cardId) throw new Error('Workflow transition request failed: cardId is required.');
  if (!fromColumnId) throw new Error('Workflow transition request failed: fromColumnId is required.');
  if (!toColumnId) throw new Error('Workflow transition request failed: toColumnId is required.');

  let request = {
    boardId,
    cardId,
    fromColumnId,
    toColumnId,
    actor: normalizeText(input.actor, 'human'),
    mode: normalizeText(input.mode, 'manual'),
    reason: normalizeText(input.reason),
    entityRefs: asObject(input.entityRefs || input.entity_refs),
    expectedVersion: Number.isFinite(Number(input.expectedVersion)) ? Number(input.expectedVersion) : null,
  };

  let response = await fetchImpl(options.endpoint || WORKFLOW_TRANSITIONS_ENDPOINT, {
    method: 'POST',
    signal: options.signal,
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(request),
  });
  if (!response.ok) {
    throw new Error(`Workflow transition request failed: API returned HTTP ${response.status}.`);
  }

  let payload = await response.json();
  if (payload?.error) {
    throw new Error(`Workflow transition request failed: ${payload.error}`);
  }
  return payload;
}

async function postWorkflowAction(endpoint, input = {}, options = {}) {
  let fetchImpl = options.fetchImpl || globalThis.fetch;
  if (typeof fetchImpl !== 'function') {
    throw new Error('Workflow action failed: fetch is not available in this runtime.');
  }
  let response = await fetchImpl(options.endpoint || endpoint, {
    method: 'POST',
    signal: options.signal,
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    throw new Error(`Workflow action failed: API returned HTTP ${response.status}.`);
  }
  let payload = await response.json();
  if (payload?.error) throw new Error(`Workflow action failed: ${payload.error}`);
  return payload;
}

export function orchestrateWorkflowCard(input = {}, options = {}) {
  return postWorkflowAction(WORKFLOW_ORCHESTRATE_ENDPOINT, input, options);
}

export function decomposeWorkflowCard(input = {}, options = {}) {
  return postWorkflowAction(WORKFLOW_DECOMPOSE_ENDPOINT, input, options);
}

export function controlWorkflowCard(input = {}, options = {}) {
  return postWorkflowAction(WORKFLOW_CONTROL_ENDPOINT, input, options);
}

// Answer the orchestrator's question on a card parked in the human-decision lane. The human does NOT
// route the card — they ANSWER (a chosen `optionId` and/or free-text `body`); the reply is minted as a
// routed return into the orchestrator's inbox and the orchestrator decides what to do next. `resolve`
// (default: the card has a live needs_human/needs_decision episode) closes the open question.
export function replyToCard(input = {}, options = {}) {
  return postWorkflowAction(WORKFLOW_REPLY_ENDPOINT, input, options);
}

export function updateWorkflowBoardAutomation(input = {}, options = {}) {
  return postWorkflowAction(WORKFLOW_BOARD_AUTOMATION_ENDPOINT, input, options);
}

export function controlWorkflowBoard(input = {}, options = {}) {
  return postWorkflowAction(WORKFLOW_BOARD_AUTOMATION_ENDPOINT, input, options);
}

export function deleteWorkflowCard(input = {}, options = {}) {
  return postWorkflowAction(WORKFLOW_DELETE_ENDPOINT, input, options);
}

export function updateWorkflowColumn(input = {}, options = {}) {
  return postWorkflowAction(WORKFLOW_COLUMN_UPDATE_ENDPOINT, input, options);
}

export function reconcileWorkflowRecovery(input = {}, options = {}) {
  return postWorkflowAction(WORKFLOW_RECOVERY_RECONCILE_ENDPOINT, input, options);
}

export function importWorkflowWorkItems(input = {}, options = {}) {
  return postWorkflowAction(WORKFLOW_MARKDOWN_IMPORT_ENDPOINT, input, options);
}

export function getAdjacentColumn(board = {}, columnId = '', direction = 1) {
  let columns = asArray(board.columns);
  let index = columns.findIndex(column => column.id === columnId);
  if (index < 0) return null;
  return columns[index + direction] || null;
}

export function getCardTransitions(board = {}, card = {}) {
  let transitions = asArray(board.transitions)
    .filter(transition => transition.from === card.columnId);
  if (transitions.length) return transitions;

  let previous = getAdjacentColumn(board, card.columnId, -1);
  let next = getAdjacentColumn(board, card.columnId, 1);
  return [previous, next]
    .filter(Boolean)
    .map(column => ({
      from: card.columnId,
      to: column.id,
      label: `Move to ${column.title}`,
      gate: '',
      destructive: column.id === 'done' || column.id === 'backlog',
      requiresReason: column.id === 'done' || column.id === 'backlog',
      mode: 'manual',
    }));
}

export default fetchWorkflowBoard;
