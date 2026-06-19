import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import {
  ACTIVE_RECOVERY_COLUMN_IDS,
  DEFAULT_WORKFLOW_BOARD_ID,
  DEFAULT_WORKFLOW_COLUMN_IDS,
  createDefaultWorkflowBoard,
  evaluateWorkflowTransitionGates,
  normalizeRecoveryFlags,
  normalizeWorkflowBoardAutomation,
  normalizeWorkflowBoardMode,
  normalizeWorkflowCardInput,
  normalizeWorkflowChecksInput,
  normalizeWorkflowLeaseInput,
  normalizeWorkflowRunInput,
  normalizeWorkflowAutomation,
  normalizeWorkflowTransitionEvent,
  normalizeWorkflowTransitionRequest,
} from '../iso/workflow-board.js';
import { parseMarkdownFrontmatter } from './agents/frontmatter.js';
import { prepareDelegateTaskCall } from './proxy/chat-delegate-routing.js';
import { getStateGraph } from './state-graph.js';

const WORKFLOW_SOURCE = 'workflow-board';
const DEFAULT_EVENT_LIMIT = 50;
const MAX_EVENT_LIMIT = 200;
const DEFAULT_LEASE_TTL_MS = 30 * 60 * 1000;
const DEFAULT_WORKFLOW_POLICY_VERSION = 4;
const RUNNING_RUN_STATUSES = new Set(['requested', 'running', 'recovering']);
const TASK_ERROR_STATUSES = new Set(['lost', 'stale', 'error', 'failed', 'cancelled']);
const RUNTIME_DONE_STATUSES = new Set(['done', 'finished', 'complete', 'completed', 'success']);
const RUNTIME_READY_STATUSES = new Set(['queued', 'pending', 'requested', 'created']);
const RUNTIME_RUNNING_STATUSES = new Set(['running', 'active', 'started', 'streaming']);
const TERMINAL_RUN_STATUSES = new Set(['completed', 'error', 'failed', 'cancelled', 'stopped']);
const KNOWN_WORKFLOW_PROOF_MARKERS = ['COMPLETION_PROOF', 'RELEASE_AUTH_PACKET'];
const PROOF_MARKER_PATTERN = /\b([A-Z][A-Z0-9_]{2,})\s*:\s*(?:\*|PASS|FAIL)(?=$|[^A-Z0-9_])/g;

function clone(value) {
  if (value === undefined || value === null) return value;
  return JSON.parse(JSON.stringify(value));
}

function getCollection(stateGraph, path) {
  let value = stateGraph.get(path);
  if (value === undefined || value === null) return {};
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`Workflow StateGraph namespace "${path}" must be an object.`);
  }
  return clone(value);
}

function textOrNull(value) {
  if (value === undefined || value === null) return null;
  let text = String(value).trim();
  return text.length > 0 ? text : null;
}

function resolveLimit(value) {
  let limit = Number(value);
  if (!Number.isFinite(limit) || limit < 1) return DEFAULT_EVENT_LIMIT;
  return Math.min(MAX_EVENT_LIMIT, Math.floor(limit));
}

function nextId(makeId, prefix) {
  if (makeId) return makeId(prefix);
  return `${prefix}-${crypto.randomUUID().slice(0, 12)}`;
}

function sourceFor(actor) {
  let suffix = textOrNull(actor);
  return suffix ? `${WORKFLOW_SOURCE}:${suffix}` : WORKFLOW_SOURCE;
}

function formatControlAction(value = '') {
  let text = textOrNull(value) ?? '';
  return text
    .split(/[-_:/]+/)
    .filter(Boolean)
    .map(part => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(' ') || 'Control';
}

function mergeDefined(current, updates) {
  let next = { ...current };
  for (let [key, value] of Object.entries(updates)) {
    if (value !== undefined) next[key] = value;
  }
  return next;
}

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function textArray(value) {
  let source = Array.isArray(value) ? value : (value === undefined || value === null ? [] : [value]);
  return [...new Set(source.map(textOrNull).filter(Boolean))];
}

function uniqueArray(items = []) {
  return [...new Set(items.map(textOrNull).filter(Boolean))];
}

function firstText(value) {
  return textArray(value)[0] ?? null;
}

function hasDestructiveMove(fromColumnId, toColumnId) {
  if (toColumnId === 'done') return true;
  return fromColumnId === 'in-progress' && ['ideas', 'backlog', 'ready'].includes(toColumnId);
}

function slugSegment(value, fallback = 'item') {
  let text = textOrNull(value) ?? fallback;
  return text.toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || fallback;
}

function yamlScalar(value) {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'boolean' || typeof value === 'number') return String(value);
  let text = String(value);
  return JSON.stringify(text);
}

function yamlBlock(value, indent = 0) {
  let pad = ' '.repeat(indent);
  if (Array.isArray(value)) {
    if (!value.length) return '[]';
    return value.map(item => `${pad}- ${yamlScalar(item)}`).join('\n');
  }
  if (value && typeof value === 'object') {
    let lines = [];
    for (let [key, child] of Object.entries(value)) {
      if (child === undefined || child === null || child === '') continue;
      if (Array.isArray(child) || (child && typeof child === 'object')) {
        let rendered = yamlBlock(child, indent + 2);
        lines.push(`${pad}${key}:`);
        if (rendered) lines.push(rendered);
      } else {
        lines.push(`${pad}${key}: ${yamlScalar(child)}`);
      }
    }
    return lines.join('\n');
  }
  return yamlScalar(value);
}

function buildMarkdown(frontmatter, body = '') {
  return `---\n${yamlBlock(frontmatter)}\n---\n\n${String(body || '').trim()}\n`;
}

function safeRelativePath(file, root) {
  let rel = path.relative(root, file);
  return rel && !rel.startsWith('..') && !path.isAbsolute(rel) ? rel : null;
}

function extractTaskIdFromDelegateResult(result) {
  let text = result?.content?.map(item => item?.text || '').join('\n') || '';
  return text.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i)?.[0]
    ?? result?.taskId
    ?? result?.task_id
    ?? null;
}

function recoverySummary(cards) {
  let summary = {
    needsResume: 0,
    needsAudit: 0,
    blocked: 0,
    recovering: 0,
  };
  for (let card of cards) {
    if (card.recoveryFlags.includes('needs_resume')) summary.needsResume += 1;
    if (card.recoveryFlags.includes('needs_audit')) summary.needsAudit += 1;
    if (card.recoveryFlags.includes('blocked')) summary.blocked += 1;
    if (card.recoveryFlags.includes('recovering')) summary.recovering += 1;
  }
  return summary;
}

function runtimeTaskStatus(task = {}) {
  return String(task.status ?? task.state ?? task.type ?? 'unknown').trim().toLowerCase() || 'unknown';
}

function runtimeTaskColumnId(status) {
  if (RUNTIME_DONE_STATUSES.has(status)) return 'done';
  if (RUNTIME_READY_STATUSES.has(status)) return 'ready';
  if (TASK_ERROR_STATUSES.has(status)) return 'quality-audit';
  if (RUNTIME_RUNNING_STATUSES.has(status)) return 'in-progress';
  return 'in-progress';
}

function runtimeTaskRecoveryFlags(status) {
  if (status === 'stale' || status === 'lost') return ['needs_resume', 'needs_audit'];
  if (TASK_ERROR_STATUSES.has(status)) return ['needs_audit'];
  return [];
}

function runtimeTaskTimestamp(task = {}) {
  return task.updatedAt ?? task.completedAt ?? task.lastEventAt ?? task.startedAt ?? null;
}

function runtimeTaskCompletionTimestamp(task = {}) {
  return task.completedAt ?? task.completed_at ?? task.updatedAt ?? task.updated_at ?? task.lastEventAt ?? task.startedAt ?? null;
}

function runtimeTaskTitle(taskId, task = {}) {
  let title = textOrNull(task.title ?? task.name ?? task.chatName);
  if (title) return title;
  let prompt = textOrNull(task.prompt ?? task.description);
  if (prompt) return prompt.length > 96 ? `${prompt.slice(0, 93)}...` : prompt;
  return `Runtime task ${String(taskId).slice(0, 8)}`;
}

function runtimeTaskSummary(task = {}) {
  let prompt = textOrNull(task.prompt ?? task.description ?? task.text);
  if (!prompt) return 'Runtime task without a workflow card.';
  return prompt.length > 260 ? `${prompt.slice(0, 257)}...` : prompt;
}

function runtimeTaskEventLabel(event = {}) {
  return textOrNull(event.label ?? event.title ?? event.type ?? event.name ?? event.role) ?? 'Runtime event';
}

function runtimeTaskEventNote(event = {}) {
  let text = textOrNull(event.note ?? event.reason ?? event.message ?? event.summary ?? event.text ?? event.name);
  if (!text) return '';
  return text.length > 220 ? `${text.slice(0, 217)}...` : text;
}

function runtimeTaskEvents(taskId, task = {}) {
  let events = Array.isArray(task.events) ? task.events : [];
  return events.slice(-12).map((event, index) => ({
    id: `${taskId}-runtime-event-${index + 1}`,
    label: runtimeTaskEventLabel(event),
    status: textOrNull(event.status ?? event.state ?? event.type) ?? '',
    actor: textOrNull(event.actor ?? event.agent ?? event.role) ?? '',
    createdAt: event.ts ?? event.timestamp ?? event.createdAt ?? event.time ?? null,
    reason: runtimeTaskEventNote(event),
  }));
}

function runtimeTaskWorkflowRefs(task = {}) {
  let workflow = asObject(task.workflow);
  let metadata = asObject(task.metadata);
  let metadataWorkflow = asObject(metadata.workflow);
  let entityRefs = asObject(task.entityRefs ?? task.entity_refs ?? metadata.entityRefs ?? metadata.entity_refs);
  return {
    boardId: textOrNull(
      task.workflowBoardId
        ?? task.workflow_board_id
        ?? workflow.boardId
        ?? workflow.board_id
        ?? metadataWorkflow.boardId
        ?? metadataWorkflow.board_id
        ?? entityRefs.boardId
        ?? entityRefs.board_id,
    ),
    cardId: textOrNull(
      task.workflowCardId
        ?? task.workflow_card_id
        ?? task.workItemId
        ?? task.work_item_id
        ?? workflow.cardId
        ?? workflow.card_id
        ?? workflow.workItemId
        ?? workflow.work_item_id
        ?? metadataWorkflow.cardId
        ?? metadataWorkflow.card_id
        ?? metadataWorkflow.workItemId
        ?? metadataWorkflow.work_item_id
        ?? entityRefs.cardId
        ?? entityRefs.card_id
        ?? entityRefs.workItemId
        ?? entityRefs.work_item_id,
    ),
    runId: textOrNull(
      task.workflowRunId
        ?? task.workflow_run_id
        ?? workflow.runId
        ?? workflow.run_id
        ?? metadataWorkflow.runId
        ?? metadataWorkflow.run_id
        ?? entityRefs.runId
        ?? entityRefs.run_id,
    ),
  };
}

function isWorkflowRuntimeTask(task = {}) {
  let refs = runtimeTaskWorkflowRefs(task);
  if (refs.boardId || refs.cardId || refs.runId) return true;
  let kind = String(task.kind ?? task.type ?? task.category ?? '').trim().toLowerCase();
  if (['workflow-task', 'workflow-runtime-task', 'workflow-run', 'work-item'].includes(kind)) return true;
  let metadata = asObject(task.metadata);
  let labels = textArray(task.labels ?? metadata.labels).map(label => label.toLowerCase());
  return labels.some(label => ['workflow', 'workflow-task', 'workflow-runtime-task', 'work-item'].includes(label));
}

function normalizeCardId(args = {}) {
  let cardId = textOrNull(args.cardId ?? args.card_id ?? args.workItemId ?? args.work_item_id ?? args.id);
  if (!cardId) throw new Error('Workflow card id is required.');
  return cardId;
}

export function createWorkflowBoardService(opts = {}) {
  let {
    stateGraph,
    now = () => Date.now(),
    makeId = null,
    projectRoot = process.cwd(),
    proxyManager = null,
  } = opts;
  if (!stateGraph) {
    throw new Error('Workflow board service requires a StateGraph instance.');
  }

  function refreshDefaultBoardPolicy(existing, id) {
    if (id !== DEFAULT_WORKFLOW_BOARD_ID) return clone(existing);
    let board = clone(existing);
    if (asObject(board.metadata).defaultPolicyVersion === DEFAULT_WORKFLOW_POLICY_VERSION) {
      return board;
    }
    let ts = now();
    let defaults = createDefaultWorkflowBoard({
      id,
      createdAt: board.createdAt ?? ts,
      updatedAt: board.updatedAt ?? ts,
    });
    let currentColumns = Array.isArray(board.columns) ? board.columns : [];
    let columnsById = new Map(currentColumns.map(column => [textOrNull(column?.id), column]));
    let defaultColumnIds = new Set(defaults.columns.map(column => column.id));
    let nextColumns = defaults.columns.map((defaultColumn) => {
      let current = asObject(columnsById.get(defaultColumn.id));
      return {
        ...current,
        id: defaultColumn.id,
        title: defaultColumn.title,
        automation: { ...defaultColumn.automation },
      };
    });
    for (let column of currentColumns) {
      let columnId = textOrNull(column?.id);
      if (columnId && !defaultColumnIds.has(columnId)) nextColumns.push(column);
    }

    let currentTransitions = Array.isArray(board.transitions) ? board.transitions : [];
    let transitionKey = transition => `${textOrNull(transition?.from) ?? ''}->${textOrNull(transition?.to) ?? ''}`;
    let transitionsByKey = new Map(currentTransitions.map(transition => [transitionKey(transition), transition]));
    let defaultTransitionKeys = new Set(defaults.transitions.map(transitionKey));
    let nextTransitions = defaults.transitions.map((defaultTransition) => {
      let current = asObject(transitionsByKey.get(transitionKey(defaultTransition)));
      return {
        ...current,
        ...defaultTransition,
        gates: textArray(defaultTransition.gates ?? defaultTransition.gate),
      };
    });
    for (let transition of currentTransitions) {
      if (!defaultTransitionKeys.has(transitionKey(transition))) nextTransitions.push(transition);
    }

    let changed = JSON.stringify(currentColumns) !== JSON.stringify(nextColumns)
      || JSON.stringify(currentTransitions) !== JSON.stringify(nextTransitions);
    let metadata = {
      ...asObject(board.metadata),
      defaultPolicyVersion: DEFAULT_WORKFLOW_POLICY_VERSION,
    };
    let automation = normalizeWorkflowBoardAutomation(board.automation);
    changed = changed || JSON.stringify(asObject(board.automation)) !== JSON.stringify(automation);
    if (!changed && JSON.stringify(asObject(board.metadata)) === JSON.stringify(metadata)) return board;
    let next = {
      ...board,
      metadata,
      automation,
      columns: nextColumns,
      transitions: nextTransitions,
      version: Number.isFinite(Number(board.version)) ? Math.floor(Number(board.version)) + 1 : 1,
      updatedAt: ts,
    };
    stateGraph.commit([{ op: 'set', path: `workflowBoards/${id}`, value: next }], sourceFor('default-policy'));
    return clone(next);
  }

  function ensureBoard(boardId = DEFAULT_WORKFLOW_BOARD_ID) {
    let id = textOrNull(boardId) ?? DEFAULT_WORKFLOW_BOARD_ID;
    let existing = stateGraph.get(`workflowBoards/${id}`);
    if (existing) return refreshDefaultBoardPolicy(existing, id);
    if (id !== DEFAULT_WORKFLOW_BOARD_ID) {
      throw new Error(`Workflow board not found: ${id}`);
    }
    let board = createDefaultWorkflowBoard({ id, now: now() });
    board.metadata = { defaultPolicyVersion: DEFAULT_WORKFLOW_POLICY_VERSION };
    stateGraph.commit([{ op: 'set', path: `workflowBoards/${id}`, value: board }], WORKFLOW_SOURCE);
    return board;
  }

  function getChecks(cardId) {
    let record = stateGraph.get(`workflowChecks/${cardId}`);
    return clone(record?.checks ?? {});
  }

  function getCard(cardId) {
    let id = textOrNull(cardId);
    if (!id) throw new Error('Workflow card id is required.');
    let card = stateGraph.get(`workflowCards/${id}`);
    if (!card) throw new Error(`Workflow card not found: ${id}`);
    return clone(card);
  }

  function createOrUpdateCard(input = {}) {
    let actor = textOrNull(input.actor) ?? 'system';
    let id = textOrNull(input.id ?? input.cardId ?? input.card_id) ?? nextId(makeId, 'card');
    let current = stateGraph.get(`workflowCards/${id}`);
    let boardId = textOrNull(input.boardId ?? input.board_id ?? current?.boardId)
      ?? DEFAULT_WORKFLOW_BOARD_ID;
    let board = ensureBoard(boardId);
    let expectedVersion = input.expectedVersion ?? input.expected_version;
    if (current && expectedVersion !== undefined && expectedVersion !== null) {
      let version = Number(expectedVersion);
      if (!Number.isFinite(version) || current.version !== Math.floor(version)) {
        throw new Error(`Workflow card version conflict for ${id}. Reload the card and retry.`);
      }
    }

    let ts = now();
    let merged = mergeDefined(current ?? {}, {
      ...input,
      id,
      boardId: board.id,
      version: current ? current.version + 1 : 1,
      createdAt: current?.createdAt,
      updatedAt: ts,
      updatedBy: actor,
    });
    let card = normalizeWorkflowCardInput(merged, {
      id,
      actor,
      now: ts,
      version: merged.version,
      createdAt: current?.createdAt ?? ts,
      updatedAt: ts,
    });
    let ops = [{ op: 'set', path: `workflowCards/${card.id}`, value: card }];
    let checks = getChecks(card.id);

    if (input.checks !== undefined) {
      let record = normalizeWorkflowChecksInput(input.checks, {
        cardId: card.id,
        actor,
        now: ts,
        updatedAt: ts,
      });
      checks = record.checks;
      ops.push({ op: 'set', path: `workflowChecks/${card.id}`, value: record });
    }

    stateGraph.commit(ops, sourceFor(actor));
    return { board, card, checks };
  }

  function createFailure(gate, reason) {
    return { gate, reason };
  }

  function evaluateRequest(board, card, checks, request) {
    let failures = [];
    if (!DEFAULT_WORKFLOW_COLUMN_IDS.includes(request.toColumnId)) {
      failures.push(createFailure(
        'known_column',
        `Unknown workflow column "${request.toColumnId}".`,
      ));
    }
    if (request.fromColumnId && request.fromColumnId !== card.columnId) {
      failures.push(createFailure(
        'from_column_match',
        `Card is in "${card.columnId}", not "${request.fromColumnId}".`,
      ));
    }
    if (request.expectedVersion !== null && card.version !== request.expectedVersion) {
      failures.push(createFailure(
        'version_conflict',
        `Card version is ${card.version}, not ${request.expectedVersion}.`,
      ));
    }
    if (board.mode === 'paused') {
      failures.push(createFailure('board_mode', 'Board is paused.'));
    }
    if (hasDestructiveMove(card.columnId, request.toColumnId) && !request.reason) {
      failures.push(createFailure('reason_required', 'Destructive workflow moves require a reason.'));
    }

    let gateResult = evaluateWorkflowTransitionGates({ board, card, checks, request });
    return {
      ok: failures.length === 0 && gateResult.ok,
      checks: gateResult.checks,
      failures: [...failures, ...gateResult.failures],
    };
  }

  function requestTransition(input = {}) {
    let request = normalizeWorkflowTransitionRequest(input);
    let board = ensureBoard(request.boardId);
    let card = getCard(request.cardId);
    let checks = getChecks(card.id);
    let gateResult = evaluateRequest(board, card, checks, request);
    let status = gateResult.ok ? 'accepted' : 'blocked';
    let ts = now();
    let eventId = textOrNull(input.id ?? input.eventId ?? input.event_id) ?? nextId(makeId, 'transition');
    let nextCard = card;

    if (status === 'accepted') {
      nextCard = normalizeWorkflowCardInput({
        ...card,
        columnId: request.toColumnId,
        version: card.version + 1,
        updatedAt: ts,
        updatedBy: request.actor,
      }, {
        id: card.id,
        actor: request.actor,
        now: ts,
        version: card.version + 1,
        createdAt: card.createdAt,
        updatedAt: ts,
      });
    }

    let event = normalizeWorkflowTransitionEvent({
      ...request,
      id: eventId,
      fromColumnId: card.columnId,
      status,
      gateResult,
      rollbackColumnId: status === 'accepted' ? null : card.columnId,
      cardVersion: card.version,
    }, { id: eventId, now: ts });
    let ops = [{ op: 'set', path: `workflowTransitions/${event.id}`, value: event }];

    if (status === 'accepted') {
      ops.push({ op: 'set', path: `workflowCards/${card.id}`, value: nextCard });
    }

    stateGraph.commit(ops, sourceFor(request.actor));
    return { ...event, card: status === 'accepted' ? nextCard : card };
  }

  function activeRunCountForColumn(boardId, columnId, excludeCardId = '') {
    let cards = Object.values(getCollection(stateGraph, 'workflowCards'))
      .filter(card => card.boardId === boardId)
      .filter(card => card.columnId === columnId)
      .filter(card => card.id !== excludeCardId);
    let activeCardIds = new Set(cards.map(card => card.id));
    return Object.values(getCollection(stateGraph, 'workflowRuns'))
      .filter(run => activeCardIds.has(run.cardId))
      .filter(run => RUNNING_RUN_STATUSES.has(run.status))
      .length;
  }

  function activeRunCountForBoard(boardId, projectId = '', excludeCardId = '') {
    let cards = Object.values(getCollection(stateGraph, 'workflowCards'))
      .filter(card => card.boardId === boardId)
      .filter(card => !projectId || card.projectId === projectId)
      .filter(card => card.id !== excludeCardId);
    let activeCardIds = new Set(cards.map(card => card.id));
    return Object.values(getCollection(stateGraph, 'workflowRuns'))
      .filter(run => activeCardIds.has(run.cardId))
      .filter(run => RUNNING_RUN_STATUSES.has(run.status))
      .length;
  }

  function stageParallelLimit(automation = {}) {
    let limit = Number(automation.parallelLimit ?? automation.parallel_limit);
    return Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : null;
  }

  function stageCapacityAvailable(board, card, automation = {}) {
    let limit = stageParallelLimit(automation);
    if (!limit) return { ok: true, limit: null, active: 0 };
    let active = activeRunCountForColumn(board.id, card.columnId, card.id);
    return {
      ok: active < limit,
      limit,
      active,
      reason: active < limit
        ? ''
        : `Column ${card.columnId} has ${active} active run${active === 1 ? '' : 's'} and capacity ${limit}.`,
    };
  }

  function boardCapacityAvailable(board, card) {
    let automation = normalizeWorkflowBoardAutomation(board.automation);
    let limit = Number(automation.globalParallelLimit);
    if (!Number.isFinite(limit) || limit < 1) return { ok: true, limit: null, active: 0 };
    let active = activeRunCountForBoard(board.id, '', card.id);
    return {
      ok: active < limit,
      limit,
      active,
      reason: active < limit
        ? ''
        : `Board ${board.id} has ${active} active run${active === 1 ? '' : 's'} and capacity ${limit}.`,
    };
  }

  function stageAgentCandidates(automation = {}) {
    return uniqueArray([
      ...textArray(automation.agents ?? automation.agentPool ?? automation.agent_pool),
      automation.agent,
      automation.agentSlug,
      automation.agent_slug,
    ]);
  }

  function chooseStageAgent(automation = {}, card = {}, args = {}) {
    let pool = stageAgentCandidates(automation);
    let explicit = textOrNull(args.agent ?? args.agent_slug);
    if (explicit && (!pool.length || pool.includes(explicit))) return explicit;
    let assigned = textOrNull(card.assignedAgent);
    if (assigned && (!pool.length || pool.includes(assigned))) return assigned;
    return pool[0] ?? explicit ?? assigned ?? 'orchestrator';
  }

  function readyCardHasExecutionContract(card = {}) {
    return Boolean(textOrNull(card.owner) && Array.isArray(card.acceptanceCriteria) && card.acceptanceCriteria.length);
  }

  function autoOrchestrationCandidate(board, card, args = {}) {
    let automation = cardAutomation(board, card);
    let boardAutomation = normalizeWorkflowBoardAutomation(board.automation);
    if (boardAutomation.pickup !== 'auto') {
      return { ok: false, reason: `board pickup is ${boardAutomation.pickup}`, automation };
    }
    if (automation.enabled === false) {
      return { ok: false, reason: 'column automation is disabled', automation };
    }
    if (automation.trigger !== 'on_enter' || automation.action !== 'orchestrate') {
      return { ok: false, reason: 'column is not configured for on-enter orchestration', automation };
    }
    if (board.mode !== 'armed' && board.mode !== 'autonomous') {
      return { ok: false, reason: `board mode ${board.mode} does not allow automatic orchestration`, automation };
    }
    if (card.columnId === 'ready' && !readyCardHasExecutionContract(card)) {
      return { ok: false, reason: 'ready cards require owner and acceptance criteria before orchestration', automation };
    }
    let capacity = stageCapacityAvailable(board, card, automation);
    if (!capacity.ok && !args.force) {
      return { ok: false, reason: capacity.reason, automation, capacity };
    }
    let boardCapacity = boardCapacityAvailable(board, card);
    if (!boardCapacity.ok && !args.force) {
      return { ok: false, reason: boardCapacity.reason, automation, capacity, boardCapacity };
    }
    return { ok: true, automation, capacity, boardCapacity };
  }

  async function maybeAutoOrchestrateCard(board, card, args = {}, context = {}) {
    let candidate = autoOrchestrationCandidate(board, card, args);
    if (!candidate.ok) {
      return {
        ok: false,
        skipped: true,
        reason: candidate.reason,
        automation: candidate.automation,
        capacity: candidate.capacity,
        boardCapacity: candidate.boardCapacity,
        sideEffects: [],
      };
    }
    let automation = candidate.automation;
    let agent = chooseStageAgent(automation, card, args);
    let result = await orchestrateWorkItem({
      ...args,
      boardId: board.id,
      cardId: card.id,
      actor: textOrNull(args.actor) ?? 'workflow-board',
      mode: automation.mode ?? 'auto',
      agent,
      leaseOwner: textOrNull(args.leaseOwner ?? args.lease_owner) ?? agent,
      approval_mode: args.approval_mode ?? automation.approvalMode,
      resource_group: args.resource_group ?? automation.resourceGroup,
      reason: textOrNull(args.reason) ?? `Card entered ${card.columnId}.`,
    }, context);
    return {
      ok: true,
      skipped: false,
      automation,
      capacity: candidate.capacity,
      boardCapacity: candidate.boardCapacity,
      agent,
      result,
      sideEffects: result.sideEffects || [],
    };
  }

  function listEvents(filter = {}) {
    let boardId = textOrNull(filter.boardId ?? filter.board_id);
    let cardId = textOrNull(filter.cardId ?? filter.card_id);
    let eventTypes = new Set(textArray(filter.eventTypes ?? filter.event_types));
    let limit = resolveLimit(filter.limit);
    return Object.values(getCollection(stateGraph, 'workflowTransitions'))
      .filter(event => !boardId || event.boardId === boardId)
      .filter(event => !cardId || event.cardId === cardId)
      .filter(event => !eventTypes.size || eventTypes.has(event.eventType ?? 'transition'))
      .sort((a, b) => (a.createdAt - b.createdAt) || a.id.localeCompare(b.id))
      .slice(-limit);
  }

  function getBoardProjection(filter = {}, runtimeTasks = null) {
    let board = ensureBoard(filter.boardId ?? filter.board_id ?? DEFAULT_WORKFLOW_BOARD_ID);
    let projectId = textOrNull(filter.projectId ?? filter.project_id);
    let goalId = textOrNull(filter.goalId ?? filter.goal_id);
    let chatId = textOrNull(filter.chatId ?? filter.chat_id);
    let persistedBoardCards = Object.values(getCollection(stateGraph, 'workflowCards'))
      .filter(card => card.boardId === board.id)
      .filter(card => !projectId || card.projectId === projectId)
      .sort((a, b) => (a.createdAt - b.createdAt) || a.id.localeCompare(b.id))
      .map((card) => ({
        ...card,
        checks: getChecks(card.id),
        runs: getRunsForCard(card.id),
        lease: clone(stateGraph.get(`workflowLeases/${card.id}`) ?? null),
        events: listEvents({ boardId: board.id, cardId: card.id, limit: MAX_EVENT_LIMIT }),
      }));
    let childIdsByParent = new Map();
    for (let card of persistedBoardCards) {
      let parentCardId = textOrNull(card.parentCardId ?? card.parent_card_id);
      if (!parentCardId) continue;
      let childIds = childIdsByParent.get(parentCardId) ?? [];
      childIds.push(card.id);
      childIdsByParent.set(parentCardId, childIds);
    }
    persistedBoardCards = persistedBoardCards.map(card => ({
      ...card,
      childCardIds: childIdsByParent.get(card.id) ?? [],
    }));
    let linkedTaskIds = new Set(persistedBoardCards.flatMap(card => uniqueArray([
      ...card.entityRefs.taskIds,
      ...card.runs.flatMap(run => run.taskIds),
    ])));
    let runtimeCards = runtimeTaskProjectionCards(board, projectId, linkedTaskIds, runtimeTasks);
    let cards = [...persistedBoardCards, ...runtimeCards]
      .filter(card => !goalId || card.entityRefs?.goalId === goalId)
      .filter(card => !chatId || card.entityRefs?.chatId === chatId)
      .sort((a, b) => (a.createdAt - b.createdAt) || a.id.localeCompare(b.id));
    let columns = board.columns.map((column) => ({
      ...column,
      cards: cards.filter(card => card.columnId === column.id),
    }));

    return {
      schema: 'workflow-board-projection/v1',
      board,
      boardId: board.id,
      scope: { projectId, goalId, chatId },
      columns,
      cards,
      counts: Object.fromEntries(columns.map(column => [column.id, column.cards.length])),
      events: listEvents({ boardId: board.id, limit: filter.eventLimit ?? filter.event_limit ?? 20 }),
      version: stateGraph.version,
    };
  }

  async function getBoardProjectionWithRuntime(filter = {}, context = {}) {
    await seedWorkflowWorkItemsForProjection(filter);
    let runtimeTasks = await readRuntimeTasks(context);
    reconcileWorkflowRuntimeTasks(filter, runtimeTasks);
    return getBoardProjection(filter, runtimeTasks);
  }

  function runtimeTaskProjectionCards(board, projectId, linkedTaskIds = new Set(), runtimeTasks = null) {
    let tasks = runtimeTasks instanceof Map
      ? Object.fromEntries(runtimeTasks.entries())
      : getCollection(stateGraph, 'tasks');
    let chats = getCollection(stateGraph, 'chats');
    let goals = getCollection(stateGraph, 'goals');
    return Object.entries(tasks).flatMap(([taskId, task]) => {
      let id = textOrNull(taskId);
      if (!id || linkedTaskIds.has(id)) return [];
      if (!isWorkflowRuntimeTask(task)) return [];
      let workflowRefs = runtimeTaskWorkflowRefs(task);
      let chat = task.chatId
        ? chats[task.chatId]
        : Object.values(chats).find(item => item?.pendingTaskId === id);
      let chatProjectId = textOrNull(chat?.projectId ?? task.projectId ?? task.project_id);
      if (projectId && chatProjectId !== projectId) return [];
      let goal = Object.values(goals).find(item => item?.chatId === chat?.id && item?.status === 'active')
        ?? Object.values(goals).find(item => item?.chatId === chat?.id);
      let status = runtimeTaskStatus(task);
      let timestamp = runtimeTaskTimestamp(task) ?? now();
      return [{
        schema: 'workflow-card/v1',
        id: `runtime-${slugSegment(id)}`,
        boardId: board.id,
        title: runtimeTaskTitle(id, task),
        body: runtimeTaskSummary(task),
        columnId: runtimeTaskColumnId(status),
        projectId: chatProjectId,
        domain: textOrNull(task.domain) ?? 'runtime',
        kind: 'runtime-task',
        priority: '',
        status,
        owner: textOrNull(task.agent ?? task.slug ?? chat?.agent) ?? '',
        assignedAgent: textOrNull(task.agent ?? task.slug ?? chat?.agent) ?? '',
        resourceGroup: textOrNull(task.resourceGroup ?? task.resource_group ?? chat?.resource_group) ?? '',
        approvalMode: textOrNull(task.approvalMode ?? task.approval_mode ?? chat?.approval_mode) ?? '',
        acceptanceCriteria: [],
        context: [],
        blockers: [],
        recoveryFlags: runtimeTaskRecoveryFlags(status),
        labels: ['runtime'],
        files: [],
        entityRefs: {
          goalId: textOrNull(goal?.id),
          chatId: textOrNull(chat?.id ?? task.chatId ?? task.chat_id),
          taskIds: [id],
          ...(workflowRefs.cardId ? { cardId: workflowRefs.cardId } : {}),
        },
        checks: {},
        runs: [{
          id: workflowRefs.runId ?? `runtime-run-${slugSegment(id)}`,
          boardId: board.id,
          cardId: workflowRefs.cardId ?? `runtime-${slugSegment(id)}`,
          status,
          taskIds: [id],
          startedAt: task.startedAt ?? task.started_at ?? null,
          updatedAt: timestamp,
        }],
        lease: null,
        events: runtimeTaskEvents(id, task),
        automation: {},
        metadata: {
          runtimeOnly: true,
          runtimeSource: task.runtimeSource ?? 'state_graph',
          workflowBoardId: workflowRefs.boardId,
          workflowCardId: workflowRefs.cardId,
          workflowRunId: workflowRefs.runId,
          eventCount: task.eventCount ?? (Array.isArray(task.events) ? task.events.length : 0),
          pid: task.pid ?? null,
        },
        createdAt: task.startedAt ?? task.createdAt ?? timestamp,
        updatedAt: timestamp,
        updatedBy: 'runtime',
        version: 1,
      }];
    });
  }

  function getRunsForCard(cardId) {
    return Object.values(getCollection(stateGraph, 'workflowRuns'))
      .filter(run => run.cardId === cardId)
      .sort((a, b) => (a.startedAt - b.startedAt) || a.id.localeCompare(b.id));
  }

  function runtimeStatusForTaskId(runtimeTasks, taskId) {
    let task = runtimeTasks.get(taskId);
    if (!task) return null;
    return runtimeTaskStatus(task);
  }

  function workflowRunStatusFromRuntime(run, runtimeTasks) {
    let taskIds = uniqueArray(run.taskIds);
    if (!taskIds.length) return null;
    let statuses = taskIds.map(taskId => runtimeStatusForTaskId(runtimeTasks, taskId));
    if (statuses.some(status => !status)) return null;
    if (statuses.some(status => status === 'cancelled')) return 'cancelled';
    if (statuses.some(status => TASK_ERROR_STATUSES.has(status))) return 'error';
    if (statuses.every(status => RUNTIME_DONE_STATUSES.has(status))) return 'completed';
    if (statuses.some(status => RUNTIME_RUNNING_STATUSES.has(status))) return 'running';
    if (statuses.some(status => RUNTIME_READY_STATUSES.has(status))) return 'requested';
    return null;
  }

  function workflowRunCompletedAt(run, runtimeTasks, fallback) {
    let timestamps = uniqueArray(run.taskIds)
      .map(taskId => runtimeTaskCompletionTimestamp(runtimeTasks.get(taskId)))
      .filter(value => value !== null && value !== undefined);
    let numeric = timestamps.map(Number).filter(Number.isFinite);
    return numeric.length ? Math.max(...numeric) : fallback;
  }

  function runtimeColumnForCard(card, runStatus) {
    if (runStatus === 'running' && card.columnId === 'ready') return 'in-progress';
    if (TERMINAL_RUN_STATUSES.has(runStatus) && ['ready', 'in-progress'].includes(card.columnId)) {
      return 'quality-audit';
    }
    if (['error', 'failed', 'cancelled'].includes(runStatus) && card.columnId !== 'done') {
      return 'quality-audit';
    }
    return card.columnId;
  }

  function reconcileWorkflowRuntimeTasks(filter = {}, runtimeTasks = readStateGraphRuntimeTasks()) {
    let board = ensureBoard(filter.boardId ?? filter.board_id ?? DEFAULT_WORKFLOW_BOARD_ID);
    let projectId = textOrNull(filter.projectId ?? filter.project_id);
    let goalId = textOrNull(filter.goalId ?? filter.goal_id);
    let chatId = textOrNull(filter.chatId ?? filter.chat_id);
    let currentNow = now();
    let ops = [];

    for (let card of Object.values(getCollection(stateGraph, 'workflowCards'))) {
      if (card.boardId !== board.id) continue;
      if (projectId && card.projectId !== projectId) continue;
      if (goalId && card.entityRefs?.goalId !== goalId) continue;
      if (chatId && card.entityRefs?.chatId !== chatId) continue;
      let runs = getRunsForCard(card.id).filter(run => RUNNING_RUN_STATUSES.has(run.status));
      if (!runs.length) continue;
      let latestCard = clone(card);
      let cardChanged = false;

      for (let run of runs) {
        let nextStatus = workflowRunStatusFromRuntime(run, runtimeTasks);
        if (!nextStatus || nextStatus === run.status) continue;
        let terminal = TERMINAL_RUN_STATUSES.has(nextStatus);
        let completedAt = terminal ? workflowRunCompletedAt(run, runtimeTasks, currentNow) : null;
        let nextRun = normalizeWorkflowRunInput({
          ...run,
          status: nextStatus,
          completedAt: terminal ? completedAt : run.completedAt,
        }, {
          id: run.id,
          now: currentNow,
          updatedAt: completedAt ?? currentNow,
        });
        ops.push({ op: 'set', path: `workflowRuns/${run.id}`, value: nextRun });

        let nextColumnId = runtimeColumnForCard(latestCard, nextStatus);
        let flags = new Set(normalizeRecoveryFlags(latestCard.recoveryFlags));
        if (terminal) {
          flags.delete('recovering');
          flags.delete('needs_resume');
          if (nextStatus !== 'completed') flags.add('needs_audit');
        }
        let nextFlags = [...flags].filter(flag => normalizeRecoveryFlags([flag]).length > 0);
        let needsCardUpdate = nextColumnId !== latestCard.columnId
          || nextFlags.join('|') !== normalizeRecoveryFlags(latestCard.recoveryFlags).join('|');

        if (needsCardUpdate) {
          latestCard = normalizeWorkflowCardInput({
            ...latestCard,
            columnId: nextColumnId,
            recoveryFlags: nextFlags,
            version: latestCard.version + 1,
            updatedAt: completedAt ?? currentNow,
            updatedBy: 'workflow-runtime',
          }, {
            id: latestCard.id,
            actor: 'workflow-runtime',
            now: currentNow,
            version: latestCard.version + 1,
            createdAt: latestCard.createdAt,
            updatedAt: completedAt ?? currentNow,
          });
          cardChanged = true;
        }

        if (terminal) {
          let lease = stateGraph.get(`workflowLeases/${latestCard.id}`);
          if (lease && (!lease.runId || lease.runId === run.id)) {
            ops.push({ op: 'delete', path: `workflowLeases/${latestCard.id}` });
          }
        }

        let eventId = nextId(makeId, 'runtime');
        let event = normalizeWorkflowTransitionEvent({
          id: eventId,
          eventType: 'runtime',
          boardId: board.id,
          cardId: latestCard.id,
          fromColumnId: card.columnId,
          toColumnId: latestCard.columnId,
          actor: 'workflow-runtime',
          mode: 'auto',
          reason: `Workflow run ${run.id} reconciled from runtime task status ${nextStatus}.`,
          status: 'accepted',
          sideEffects: [{
            type: 'runtime_reconcile',
            runId: run.id,
            taskIds: uniqueArray(run.taskIds),
            status: nextStatus,
          }],
        }, { id: eventId, now: completedAt ?? currentNow });
        ops.push({ op: 'set', path: `workflowTransitions/${event.id}`, value: event });
      }

      if (cardChanged) {
        ops.push({ op: 'set', path: `workflowCards/${latestCard.id}`, value: latestCard });
      }
    }

    if (ops.length) stateGraph.commit(ops, sourceFor('runtime'));
    return { ok: true, updated: ops.length };
  }

  function deriveRecoveryCard(card, currentNow) {
    let runs = getRunsForCard(card.id);
    let lease = clone(stateGraph.get(`workflowLeases/${card.id}`) ?? null);
    let flags = new Set(normalizeRecoveryFlags(card.recoveryFlags));
    if (card.blockers.length > 0) flags.add('blocked');
    if (lease?.leaseExpiresAt && Number(lease.leaseExpiresAt) < currentNow) {
      flags.add('needs_resume');
    }
    if (runs.some(run => ['lost', 'stale', 'error'].includes(run.status))) {
      flags.add('needs_audit');
    }
    if (runs.some(run => run.status === 'recovering')) {
      flags.add('recovering');
    }
    return {
      ...card,
      checks: getChecks(card.id),
      runs,
      lease,
      recoveryFlags: [...flags].filter(flag => normalizeRecoveryFlags([flag]).length > 0),
    };
  }

  function getRecoveryState(filter = {}) {
    let projection = getBoardProjection(filter);
    let currentNow = now();
    let cards = projection.cards
      .filter(card => ACTIVE_RECOVERY_COLUMN_IDS.includes(card.columnId))
      .map(card => deriveRecoveryCard(card, currentNow))
      .filter(card => card.recoveryFlags.length > 0);
    return {
      schema: 'workflow-recovery/v1',
      boardId: projection.boardId,
      scope: projection.scope,
      activeColumnIds: ACTIVE_RECOVERY_COLUMN_IDS,
      cards,
      summary: recoverySummary(cards),
      checkedAt: currentNow,
    };
  }

  function listWorkflowBoards(args = {}) {
    let includeArchived = Boolean(args.includeArchived);
    let limit = Number(args.limit);
    let boards = Object.values(getCollection(stateGraph, 'workflowBoards'));
    if (!boards.some(board => board.id === DEFAULT_WORKFLOW_BOARD_ID)) {
      boards.unshift(ensureBoard(DEFAULT_WORKFLOW_BOARD_ID));
    }
    boards = boards
      .filter(board => includeArchived || !board.archived)
      .sort((a, b) => String(a.title || a.id).localeCompare(String(b.title || b.id)));
    if (Number.isFinite(limit) && limit > 0) boards = boards.slice(0, Math.floor(limit));
    return { ok: true, boards };
  }

  async function getWorkflowBoard(args = {}, context = {}) {
    let projection = args.includeRuntime
      ? await getBoardProjectionWithRuntime(args, context)
      : await getBoardProjectionWithSeed(args);
    return { ok: true, projection };
  }

  async function createWorkItem(args = {}, context = {}) {
    let result = createOrUpdateCard(args);
    let orchestration = await maybeAutoOrchestrateCard(result.board, result.card, args, context);
    return {
      ok: true,
      ...result,
      card: orchestration.ok ? orchestration.result.card : result.card,
      orchestration,
      sideEffects: orchestration.sideEffects || [],
    };
  }

  function updateWorkItem(args = {}) {
    let cardId = normalizeCardId(args);
    let patch = args.patch && typeof args.patch === 'object' ? args.patch : {};
    let current = getCard(cardId);
    let result = createOrUpdateCard({
      ...current,
      ...patch,
      id: cardId,
      actor: args.actor,
      expectedVersion: args.expectedVersion ?? args.expected_version,
      checks: args.checks,
    });
    return { ok: true, ...result };
  }

  function childItemsFromArgs(args = {}) {
    let value = args.childItems ?? args.child_items ?? args.children ?? args.items ?? args.subtasks;
    if (!Array.isArray(value) || value.length === 0) {
      throw new Error('Workflow decomposition requires a non-empty childItems array.');
    }
    return value.map((item, index) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) {
        throw new Error(`Workflow decomposition childItems[${index}] must be an object.`);
      }
      if (!textOrNull(item.title)) {
        throw new Error(`Workflow decomposition childItems[${index}] requires title.`);
      }
      return item;
    });
  }

  function decomposeWorkItem(args = {}) {
    let cardId = normalizeCardId(args);
    let parent = getCard(cardId);
    let expectedVersion = args.expectedVersion ?? args.expected_version;
    if (expectedVersion !== undefined && expectedVersion !== null) {
      let version = Number(expectedVersion);
      if (!Number.isFinite(version) || parent.version !== Math.floor(version)) {
        throw new Error(`Workflow card version conflict for ${cardId}. Reload the card and retry.`);
      }
    }
    let actor = textOrNull(args.actor) ?? 'orchestrator';
    let childColumnId = textOrNull(args.childColumnId ?? args.child_column_id ?? args.columnId ?? args.column_id) ?? 'backlog';
    let ts = now();
    let children = childItemsFromArgs(args).map((item) => {
      let childContext = textArray(item.context);
      let childRoutingHints = textArray(item.routingHints ?? item.routing_hints);
      let id = textOrNull(item.id ?? item.cardId ?? item.card_id) ?? nextId(makeId, 'card');
      if (stateGraph.get(`workflowCards/${id}`)) {
        throw new Error(`Workflow decomposition child card already exists: ${id}`);
      }
      return normalizeWorkflowCardInput({
        ...item,
        id,
        boardId: parent.boardId,
        columnId: textOrNull(item.columnId ?? item.column_id) ?? childColumnId,
        parentCardId: parent.id,
        projectId: textOrNull(item.projectId ?? item.project_id) ?? parent.projectId,
        domain: textOrNull(item.domain) ?? parent.domain,
        kind: textOrNull(item.kind) ?? 'task',
        priority: textOrNull(item.priority) ?? parent.priority,
        owner: textOrNull(item.owner) ?? parent.owner,
        resourceGroup: textOrNull(item.resourceGroup ?? item.resource_group) ?? parent.resourceGroup,
        approvalMode: textOrNull(item.approvalMode ?? item.approval_mode) ?? parent.approvalMode,
        context: [...textArray(parent.context), ...childContext],
        routingHints: [...textArray(parent.routingHints), ...childRoutingHints],
      }, {
        id,
        actor,
        now: ts,
        version: 1,
        createdAt: ts,
        updatedAt: ts,
      });
    });
    let board = ensureBoard(parent.boardId);
    let eventId = textOrNull(args.eventId ?? args.event_id) ?? nextId(makeId, 'decomposition');
    let event = normalizeWorkflowTransitionEvent({
      id: eventId,
      eventType: 'decomposition',
      boardId: board.id,
      cardId: parent.id,
      fromColumnId: parent.columnId,
      toColumnId: parent.columnId,
      actor,
      mode: 'manual',
      reason: textOrNull(args.reason) ?? `Decomposed workflow card ${parent.id} into ${children.length} child card(s).`,
      status: 'accepted',
      cardVersion: parent.version,
      gateResult: { ok: true, checks: [], failures: [] },
      sideEffects: children.map(child => ({
        type: 'child_card_created',
        cardId: child.id,
        parentCardId: parent.id,
        columnId: child.columnId,
        assignedAgent: child.assignedAgent,
      })),
    }, { id: eventId, now: ts });
    stateGraph.commit([
      ...children.map(child => ({ op: 'set', path: `workflowCards/${child.id}`, value: child })),
      { op: 'set', path: `workflowTransitions/${event.id}`, value: event },
    ], sourceFor(actor));
    return {
      ok: true,
      board,
      parent,
      children,
      event,
      childCardIds: children.map(child => child.id),
    };
  }

  function updateWorkflowColumn(args = {}) {
    let board = ensureBoard(args.boardId ?? args.board_id ?? DEFAULT_WORKFLOW_BOARD_ID);
    let columnId = textOrNull(args.columnId ?? args.column_id ?? args.id);
    if (!columnId) throw new Error('Workflow column id is required.');
    let expectedVersion = args.expectedVersion ?? args.expected_version;
    if (expectedVersion !== undefined && expectedVersion !== null) {
      let version = Number(expectedVersion);
      if (!Number.isFinite(version) || board.version !== Math.floor(version)) {
        throw new Error(`Workflow board version conflict for ${board.id}. Reload the board and retry.`);
      }
    }
    let patch = asObject(args.patch);
    let automationPatch = {
      ...asObject(args.automation),
      ...asObject(patch.automation),
    };
    let ts = now();
    let matched = false;
    let columns = board.columns.map((column) => {
      if (column.id !== columnId) return column;
      matched = true;
      return {
        ...column,
        ...(patch.title !== undefined ? { title: textOrNull(patch.title) ?? column.title } : {}),
        ...(patch.description !== undefined ? { description: textOrNull(patch.description) ?? '' } : {}),
        automation: Object.keys(automationPatch).length
          ? normalizeWorkflowAutomation({ ...asObject(column.automation), ...automationPatch })
          : asObject(column.automation),
      };
    });
    if (!matched) throw new Error(`Workflow column not found: ${columnId}`);
    let nextBoard = {
      ...board,
      columns,
      version: Number.isFinite(Number(board.version)) ? Math.floor(Number(board.version)) + 1 : 1,
      updatedAt: ts,
      metadata: {
        ...asObject(board.metadata),
        defaultPolicyVersion: DEFAULT_WORKFLOW_POLICY_VERSION,
        columnSettingsUpdatedAt: ts,
      },
    };
    stateGraph.commit([{ op: 'set', path: `workflowBoards/${board.id}`, value: nextBoard }], sourceFor(args.actor ?? 'column-settings'));
    return {
      ok: true,
      board: clone(nextBoard),
      column: clone(columns.find(column => column.id === columnId)),
    };
  }

  function boardVersion(board) {
    return Number.isFinite(Number(board.version)) ? Math.floor(Number(board.version)) : 0;
  }

  function boardEvent(board, args = {}, options = {}) {
    let ts = now();
    let eventId = textOrNull(args.eventId ?? args.event_id ?? options.id) ?? nextId(makeId, 'board-event');
    return normalizeWorkflowTransitionEvent({
      id: eventId,
      eventType: options.eventType ?? 'board_control',
      boardId: board.id,
      cardId: null,
      actor: textOrNull(args.actor) ?? 'system',
      mode: 'manual',
      reason: textOrNull(args.reason) ?? options.reason,
      status: options.status ?? 'accepted',
      cardVersion: board.version,
      gateResult: {
        ok: (options.status ?? 'accepted') === 'accepted',
        checks: [],
        failures: [],
      },
      sideEffects: Array.isArray(options.sideEffects) ? options.sideEffects : [],
      createdAt: ts,
    }, { id: eventId, now: ts });
  }

  function updateWorkflowBoard(args = {}, options = {}) {
    let board = ensureBoard(args.boardId ?? args.board_id ?? DEFAULT_WORKFLOW_BOARD_ID);
    let expectedVersion = args.expectedVersion ?? args.expected_version;
    if (expectedVersion !== undefined && expectedVersion !== null) {
      let version = Number(expectedVersion);
      if (!Number.isFinite(version) || board.version !== Math.floor(version)) {
        throw new Error(`Workflow board version conflict for ${board.id}. Reload the board and retry.`);
      }
    }
    let patch = asObject(args.patch);
    let automationPatch = {
      ...asObject(args.automation),
      ...asObject(patch.automation),
    };
    let ts = now();
    let modeInput = args.mode ?? patch.mode;
    let nextMode = modeInput !== undefined ? normalizeWorkflowBoardMode(modeInput, board.mode) : board.mode;
    let nextAutomation = Object.keys(automationPatch).length
      ? normalizeWorkflowBoardAutomation({ ...asObject(board.automation), ...automationPatch })
      : normalizeWorkflowBoardAutomation(board.automation);
    let sideEffects = Array.isArray(options.sideEffects) ? options.sideEffects : [];
    let changed = nextMode !== board.mode
      || JSON.stringify(normalizeWorkflowBoardAutomation(board.automation)) !== JSON.stringify(nextAutomation)
      || sideEffects.length > 0;
    if (!changed) {
      return { ok: true, board: clone(board), event: null, noop: true };
    }
    let nextBoard = {
      ...board,
      mode: nextMode,
      automation: nextAutomation,
      version: boardVersion(board) + 1,
      updatedAt: ts,
      metadata: {
        ...asObject(board.metadata),
        defaultPolicyVersion: DEFAULT_WORKFLOW_POLICY_VERSION,
        automationUpdatedAt: ts,
      },
    };
    let event = boardEvent(nextBoard, args, {
      eventType: options.eventType ?? 'board_update',
      reason: textOrNull(args.reason) ?? 'Updated workflow board automation.',
      sideEffects: [
        {
          type: 'board_automation_update',
          mode: nextBoard.mode,
          automation: nextBoard.automation,
        },
        ...sideEffects,
      ],
    });
    stateGraph.commit([
      { op: 'set', path: `workflowBoards/${nextBoard.id}`, value: nextBoard },
      { op: 'set', path: `workflowTransitions/${event.id}`, value: event },
    ], sourceFor(args.actor ?? 'board-automation'));
    return { ok: true, board: clone(nextBoard), event: clone(event) };
  }

  function activeCardsForBoardControl(board, args = {}) {
    let projectId = textOrNull(args.projectId ?? args.project_id);
    return Object.values(getCollection(stateGraph, 'workflowCards'))
      .filter(card => card.boardId === board.id)
      .filter(card => !projectId || card.projectId === projectId)
      .filter(card => activeRunForCard(card.id));
  }

  function pausedCardsForBoardControl(board, args = {}) {
    let projectId = textOrNull(args.projectId ?? args.project_id);
    return Object.values(getCollection(stateGraph, 'workflowCards'))
      .filter(card => card.boardId === board.id)
      .filter(card => !projectId || card.projectId === projectId)
      .filter(card => getRunsForCard(card.id).some(run => run.status === 'paused'));
  }

  function modeForBoardControl(action, board, args = {}) {
    if (action === 'resume') return normalizeWorkflowBoardMode(args.mode, 'armed');
    if (action === 'arm') return 'armed';
    if (action === 'pause') return 'paused';
    if (action === 'drain') return 'draining';
    if (action === 'stop') return 'stopped';
    if (action === 'maintenance') return 'maintenance';
    if (action === 'manual') return 'manual';
    if (action === 'recovery_only') return 'recovery_only';
    return board.mode;
  }

  async function controlWorkflowBoard(args = {}, context = {}) {
    let board = ensureBoard(args.boardId ?? args.board_id ?? DEFAULT_WORKFLOW_BOARD_ID);
    let actor = textOrNull(args.actor) ?? 'system';
    let action = textOrNull(args.action ?? args.control) ?? 'pause';
    if (!['pause', 'resume', 'drain', 'stop', 'maintenance', 'manual', 'recovery_only', 'arm'].includes(action)) {
      throw new Error('Workflow board control action must be pause, resume, drain, stop, maintenance, manual, recovery_only, or arm.');
    }
    let affectedCards = [];
    let sideEffects = [];
    if (action === 'pause' || action === 'stop') {
      let cardAction = action === 'pause' ? 'pause' : 'stop';
      for (let card of activeCardsForBoardControl(board, args)) {
        let result = await controlWorkItem({
          boardId: board.id,
          cardId: card.id,
          action: cardAction,
          actor,
          reason: textOrNull(args.reason) ?? `${formatControlAction(action)} from workflow board automation.`,
        }, context);
        affectedCards.push(card.id);
        sideEffects.push({
          type: 'card_control',
          action: cardAction,
          cardId: card.id,
          sideEffects: result.sideEffects || [],
        });
      }
    }
    if (action === 'resume') {
      for (let card of pausedCardsForBoardControl(board, args)) {
        let result = resumeWorkItem({
          boardId: board.id,
          cardId: card.id,
          actor,
          reason: textOrNull(args.reason) ?? 'Resume from workflow board automation.',
        });
        affectedCards.push(card.id);
        sideEffects.push({
          type: 'card_resume',
          cardId: card.id,
          runId: result.run.id,
        });
      }
    }
    let mode = modeForBoardControl(action, board, args);
    let result = updateWorkflowBoard({
      boardId: board.id,
      mode,
      actor,
      reason: textOrNull(args.reason) ?? `${formatControlAction(action)} board automation.`,
    }, {
      eventType: 'board_control',
      sideEffects: [
        {
          type: 'board_control',
          action,
          mode,
          affectedCardIds: affectedCards,
          projectId: textOrNull(args.projectId ?? args.project_id),
        },
        ...sideEffects,
      ],
    });
    return {
      ok: true,
      action,
      mode,
      affectedCardIds: affectedCards,
      ...result,
    };
  }

  async function requestWorkflowTransition(args = {}, context = {}) {
    let transition = requestTransition(args);
    if (transition.status !== 'accepted') {
      return { ok: true, ...transition, orchestration: null, sideEffects: [] };
    }
    let board = ensureBoard(transition.boardId);
    let orchestration = await maybeAutoOrchestrateCard(board, transition.card, args, context);
    return {
      ok: true,
      ...transition,
      card: orchestration.ok ? orchestration.result.card : transition.card,
      orchestration,
      sideEffects: orchestration.sideEffects || [],
    };
  }

  function deleteWorkItem(args = {}) {
    let cardId = normalizeCardId(args);
    let actor = textOrNull(args.actor) ?? 'system';
    let card = getCard(cardId);
    let expectedVersion = args.expectedVersion ?? args.expected_version;
    if (expectedVersion !== undefined && expectedVersion !== null) {
      let version = Number(expectedVersion);
      if (!Number.isFinite(version) || card.version !== Math.floor(version)) {
        throw new Error(`Workflow card version conflict for ${cardId}. Reload the card and retry.`);
      }
    }
    let activeRun = activeRunForCard(cardId);
    if (activeRun && !args.force) {
      throw new Error(`Workflow card ${cardId} has active run ${activeRun.id}. Stop or cancel it before deletion.`);
    }
    stateGraph.commit([
      { op: 'delete', path: `workflowCards/${cardId}` },
      { op: 'delete', path: `workflowLeases/${cardId}` },
    ], sourceFor(actor));
    return { ok: true, card, deleted: true };
  }

  function claimWorkItem(args = {}) {
    let cardId = normalizeCardId(args);
    let actor = textOrNull(args.actor) ?? 'system';
    let card = getCard(cardId);
    let expectedVersion = args.expectedVersion ?? args.expected_version;
    if (expectedVersion !== undefined && expectedVersion !== null) {
      let version = Number(expectedVersion);
      if (!Number.isFinite(version) || card.version !== Math.floor(version)) {
        throw new Error(`Workflow card version conflict for ${cardId}. Reload the card and retry.`);
      }
    }
    let ts = now();
    let ttlMs = Number(args.ttlMs ?? args.ttl_ms);
    let lease = normalizeWorkflowLeaseInput({
      boardId: args.boardId ?? args.board_id ?? card.boardId,
      cardId,
      runId: args.runId ?? args.run_id,
      leaseOwner: args.leaseOwner ?? args.lease_owner ?? actor,
      leaseExpiresAt: Number.isFinite(ttlMs) && ttlMs > 0 ? ts + ttlMs : null,
    }, { cardId, updatedAt: ts });
    stateGraph.commit([{ op: 'set', path: `workflowLeases/${cardId}`, value: lease }], sourceFor(actor));
    return { ok: true, card, lease };
  }

  function releaseWorkItem(args = {}) {
    let cardId = normalizeCardId(args);
    let actor = textOrNull(args.actor) ?? 'system';
    let card = getCard(cardId);
    stateGraph.commit([{ op: 'delete', path: `workflowLeases/${cardId}` }], sourceFor(actor));
    return { ok: true, card, released: true };
  }

  function columnAutomation(board, columnId) {
    let column = board.columns.find(item => item.id === columnId);
    return asObject(column?.automation);
  }

  function cardAutomation(board, card) {
    return {
      ...columnAutomation(board, card.columnId),
      ...asObject(card.automation),
    };
  }

  function activeRunForCard(cardId) {
    return getRunsForCard(cardId)
      .reverse()
      .find(run => RUNNING_RUN_STATUSES.has(run.status)) || null;
  }

  function ensureLease(card, args, runId, actor, currentNow) {
    let leaseOwner = textOrNull(args.leaseOwner ?? args.lease_owner ?? actor) ?? 'orchestrator';
    let currentLease = clone(stateGraph.get(`workflowLeases/${card.id}`) ?? null);
    if (
      currentLease?.leaseOwner
      && currentLease.leaseOwner !== leaseOwner
      && (!currentLease.leaseExpiresAt || Number(currentLease.leaseExpiresAt) > currentNow)
    ) {
      throw new Error(`Workflow card ${card.id} is already leased by ${currentLease.leaseOwner}.`);
    }
    let ttlMs = Number(args.ttlMs ?? args.ttl_ms);
    let lease = normalizeWorkflowLeaseInput({
      boardId: card.boardId,
      cardId: card.id,
      runId,
      leaseOwner,
      leaseExpiresAt: currentNow + (Number.isFinite(ttlMs) && ttlMs > 0 ? ttlMs : DEFAULT_LEASE_TTL_MS),
    }, { cardId: card.id, updatedAt: currentNow });
    return lease;
  }

  function requiredProofMarkersForWorkItem(card = {}, args = {}) {
    let text = [
      card.title,
      card.body,
      ...(Array.isArray(card.acceptanceCriteria) ? card.acceptanceCriteria : []),
      ...(Array.isArray(card.context) ? card.context : []),
      args.reason,
    ].filter(Boolean).join('\n');
    let markers = new Set();
    let match;
    while ((match = PROOF_MARKER_PATTERN.exec(text))) {
      if (match[1] !== 'WORKFLOW_RESULT') markers.add(match[1]);
    }
    for (let marker of KNOWN_WORKFLOW_PROOF_MARKERS) {
      if (new RegExp(`\\b${marker}\\b`).test(text)) markers.add(marker);
    }
    return [...markers];
  }

  function buildWorkItemPrompt(card, args = {}) {
    let criteria = card.acceptanceCriteria.length
      ? `\n\nAcceptance criteria:\n${card.acceptanceCriteria.map(item => `- ${item}`).join('\n')}`
      : '';
    let context = card.context.length
      ? `\n\nContext:\n${card.context.map(item => `- ${item}`).join('\n')}`
      : '';
    let markdownPath = textOrNull(card.metadata?.markdownPath);
    let fileHint = markdownPath ? `\n\nWorkflow work-item file: ${markdownPath}` : '';
    let preferredAgent = textOrNull(args.agent ?? args.agent_slug ?? card.assignedAgent);
    let proofMarkers = requiredProofMarkersForWorkItem(card, args);
    let proofMarkerContract = proofMarkers.length
      ? [
          '- Required proof marker lines:',
          ...proofMarkers.map(marker => `  - \`${marker}:PASS\` or \`${marker}:FAIL\``),
          '- Place required proof marker lines after the report body and before any `WORKFLOW_RESULT:` line.',
        ].join('\n')
      : '';
    let outputContract = [
      '',
      '',
      'Final response contract:',
      '- Start with the workflow outcome: completed, blocked, or needs_follow_up.',
      '- Address every acceptance criterion explicitly.',
      '- Name the concrete evidence inspected and commands or checks run.',
      '- Separate product findings from Agent Portal workflow/runtime issues.',
      '- Do not end with an introduction to a report; include the report itself.',
      proofMarkerContract,
      '- End with `WORKFLOW_RESULT: completed`, `WORKFLOW_RESULT: blocked`, or `WORKFLOW_RESULT: needs_follow_up`.',
    ].filter(Boolean).join('\n');
    return [
      `Run the Agent Portal workflow work item "${card.title}".`,
      card.body ? `\n\n${card.body}` : '',
      `\n\nWorkflow card id: ${card.id}`,
      card.projectId ? `\nProject: ${card.projectId}` : '',
      card.domain ? `\nDomain: ${card.domain}` : '',
      preferredAgent ? `\nPreferred agent: ${preferredAgent}` : '',
      criteria,
      context,
      fileHint,
      args.reason ? `\n\nTrigger reason: ${args.reason}` : '',
      outputContract,
    ].join('').trim();
  }

  async function delegateWorkItem(card, run, args = {}, context = {}) {
    let pm = context.proxyManager ?? proxyManager;
    if (!pm?.requestFromChild) {
      return {
        ok: false,
        sideEffects: [{ type: 'delegate_task', status: 'skipped', reason: 'proxyManager unavailable' }],
        taskIds: [],
        chatId: card.entityRefs.chatId,
        goalId: card.entityRefs.goalId,
      };
    }

    let desiredAgent = textOrNull(args.agent ?? args.agent_slug ?? card.assignedAgent) ?? 'orchestrator';
    let chatId = textOrNull(card.entityRefs.chatId);
    let parentChatId = null;
    if (chatId) {
      let existingChat = stateGraph.getChat(chatId);
      if (existingChat?.agent && desiredAgent && existingChat.agent !== desiredAgent) {
        parentChatId = existingChat.id;
        chatId = null;
      }
    }
    if (!chatId) {
      let chat = stateGraph.createChat({
        name: `Workflow: ${card.title}`,
        adapter: 'pool',
        agent: desiredAgent,
        parentChatId,
        projectId: card.projectId,
        approval_mode: textOrNull(args.approval_mode ?? card.approvalMode),
        resource_group: textOrNull(args.resource_group ?? card.resourceGroup),
        goalIntentActive: true,
      }, WORKFLOW_SOURCE);
      chatId = chat.id;
    }

    let goalId = textOrNull(card.entityRefs.goalId);
    let existingGoal = goalId ? stateGraph.getChatGoal(goalId) : null;
    if (!goalId || existingGoal?.chatId !== chatId) {
      let goal = stateGraph.createChatGoal({
        chatId,
        projectId: card.projectId,
        title: card.title,
        description: card.body || '',
        context: [
          `workflowCardId:${card.id}`,
          `workflowBoardId:${card.boardId}`,
        ],
        scenarios: card.acceptanceCriteria,
      }, WORKFLOW_SOURCE);
      goalId = goal.id;
    }

    let prompt = buildWorkItemPrompt(card, args);
    stateGraph.appendChatMessage(chatId, { role: 'user', text: prompt });
    let delegateArgs = {
      prompt,
      timeout: args.timeout || 600,
      cwd: args.cwd || projectRoot,
      chat_id: chatId,
      agent_slug: desiredAgent,
      context_mode: args.context_mode === 'off' ? 'off' : 'auto',
    };
    let approvalMode = textOrNull(args.approval_mode ?? card.approvalMode);
    if (approvalMode) delegateArgs.approval_mode = approvalMode;
    let resourceGroup = textOrNull(args.resource_group ?? card.resourceGroup);
    if (resourceGroup) delegateArgs.resource_group = resourceGroup;
    if (Array.isArray(args.files)) delegateArgs.files = args.files;

    let prepared = await prepareDelegateTaskCall(pm, 'delegate_task', delegateArgs, {
      source: WORKFLOW_SOURCE,
      stateGraph,
    });
    let result = await pm.requestFromChild('agent-pool', 'tools/call', {
      name: 'delegate_task',
      arguments: prepared.args,
    }, 600_000);
    let taskId = result?.isError ? null : extractTaskIdFromDelegateResult(result);
    if (taskId) {
      stateGraph.merge(`tasks/${taskId}`, {
        kind: 'workflow-runtime-task',
        source: WORKFLOW_SOURCE,
        chatId,
        goalId,
        projectId: card.projectId,
        workflowBoardId: card.boardId,
        workflowCardId: card.id,
        workflowRunId: run.id,
        workItemId: card.id,
        workflow: {
          boardId: card.boardId,
          cardId: card.id,
          runId: run.id,
        },
      }, WORKFLOW_SOURCE);
      stateGraph.updateChatTask(chatId, taskId);
      pm.chatWsServer?.taskChatMap?.set?.(taskId, chatId);
    }
    return {
      ok: Boolean(taskId),
      sideEffects: [{
        type: 'delegate_task',
        status: taskId ? 'started' : 'failed',
        chatId,
        goalId,
        taskId,
        runId: run.id,
        error: result?.isError ? (result?.content?.[0]?.text || 'Delegation failed.') : null,
      }],
      taskIds: taskId ? [taskId] : [],
      chatId,
      goalId,
    };
  }

  async function orchestrateWorkItem(args = {}, context = {}) {
    let cardId = normalizeCardId(args);
    let actor = textOrNull(args.actor) ?? 'system';
    let card = getCard(cardId);
    let board = ensureBoard(args.boardId ?? args.board_id ?? card.boardId);
    if (['paused', 'draining', 'stopped', 'maintenance', 'recovery_only'].includes(board.mode)) {
      throw new Error(`Workflow board ${board.id} is not accepting orchestration while mode is ${board.mode}.`);
    }
    let automation = cardAutomation(board, card);
    let stageAgent = chooseStageAgent(automation, card, args);
    let effectiveArgs = {
      ...args,
      agent: stageAgent,
      leaseOwner: textOrNull(args.leaseOwner ?? args.lease_owner) ?? stageAgent,
      approval_mode: args.approval_mode ?? automation.approvalMode,
      resource_group: args.resource_group ?? automation.resourceGroup,
    };
    let mode = textOrNull(effectiveArgs.mode) ?? automation.mode ?? 'manual';
    if (mode === 'auto' && board.mode !== 'autonomous' && board.mode !== 'armed') {
      throw new Error(`Workflow board ${board.id} mode ${board.mode} does not allow automatic orchestration.`);
    }
    if (!['ready', 'in-progress', 'quality-audit', 'commit-publish'].includes(card.columnId)) {
      throw new Error(`Workflow card ${card.id} in column ${card.columnId} is not eligible for orchestration.`);
    }
    if (card.columnId === 'ready' && !readyCardHasExecutionContract(card) && !args.force) {
      throw new Error(`Workflow card ${card.id} requires owner and acceptance criteria before orchestration.`);
    }
    let capacity = stageCapacityAvailable(board, card, automation);
    if (!capacity.ok && !args.force) {
      throw new Error(capacity.reason);
    }
    let boardCapacity = boardCapacityAvailable(board, card);
    if (!boardCapacity.ok && !args.force) {
      throw new Error(boardCapacity.reason);
    }
    let existingRun = activeRunForCard(card.id);
    if (existingRun && !args.force) {
      return {
        ok: true,
        card,
        run: existingRun,
        idempotent: true,
        sideEffects: [],
      };
    }
    let ts = now();
    let runId = textOrNull(effectiveArgs.runId ?? effectiveArgs.run_id) ?? nextId(makeId, 'run');
    let lease = ensureLease(card, effectiveArgs, runId, actor, ts);
    let run = normalizeWorkflowRunInput({
      id: runId,
      boardId: board.id,
      cardId,
      status: 'requested',
      leaseOwner: lease.leaseOwner,
      taskIds: effectiveArgs.taskIds ?? effectiveArgs.task_ids,
    }, { id: runId, now: ts, updatedAt: ts });
    stateGraph.commit([
      { op: 'set', path: `workflowRuns/${run.id}`, value: run },
      { op: 'set', path: `workflowLeases/${card.id}`, value: lease },
    ], sourceFor(actor));

    let delegated = args.delegate === false
      ? { ok: false, sideEffects: [], taskIds: [], chatId: card.entityRefs.chatId, goalId: card.entityRefs.goalId }
      : await delegateWorkItem(card, run, effectiveArgs, context);
    let taskIds = uniqueArray([...run.taskIds, ...delegated.taskIds]);
    let nextRun = normalizeWorkflowRunInput({
      ...run,
      status: delegated.ok ? 'running' : run.status,
      taskIds,
    }, { id: run.id, now: ts, updatedAt: now() });
    let nextColumnId = card.columnId === 'ready' ? 'in-progress' : card.columnId;
    let nextCard = normalizeWorkflowCardInput({
      ...card,
      columnId: nextColumnId,
      entityRefs: {
        ...card.entityRefs,
        chatId: delegated.chatId,
        goalId: delegated.goalId,
        taskIds: uniqueArray([...card.entityRefs.taskIds, ...taskIds]),
      },
      version: card.version + 1,
      updatedAt: now(),
      updatedBy: actor,
    }, {
      id: card.id,
      actor,
      now: now(),
      version: card.version + 1,
      createdAt: card.createdAt,
      updatedAt: now(),
    });
    let ops = [
      { op: 'set', path: `workflowRuns/${run.id}`, value: nextRun },
      { op: 'set', path: `workflowCards/${card.id}`, value: nextCard },
    ];
    if (nextColumnId !== card.columnId) {
      let eventId = nextId(makeId, 'orchestration');
      let event = normalizeWorkflowTransitionEvent({
        id: eventId,
        eventType: 'orchestration',
        boardId: board.id,
        cardId: card.id,
        fromColumnId: card.columnId,
        toColumnId: nextColumnId,
        actor,
        mode: 'auto',
        reason: `Workflow orchestration started run ${run.id}.`,
        status: 'accepted',
        sideEffects: delegated.sideEffects,
      }, { id: eventId, now: ts });
      ops.push({ op: 'set', path: `workflowTransitions/${event.id}`, value: event });
    }
    stateGraph.commit(ops, sourceFor(actor));
    return { ok: true, card: nextCard, run: nextRun, lease, capacity, boardCapacity, sideEffects: delegated.sideEffects };
  }

  function resumeWorkItem(args = {}) {
    let cardId = normalizeCardId(args);
    let actor = textOrNull(args.actor) ?? 'system';
    let card = getCard(cardId);
    let ts = now();
    let runId = textOrNull(args.runId ?? args.run_id) ?? nextId(makeId, 'run');
    let run = normalizeWorkflowRunInput({
      id: runId,
      boardId: args.boardId ?? args.board_id ?? card.boardId,
      cardId,
      status: 'recovering',
      taskIds: args.taskId ?? args.task_id ? [args.taskId ?? args.task_id] : [],
    }, { id: runId, now: ts, updatedAt: ts });
    let nextCard = normalizeWorkflowCardInput({
      ...card,
      recoveryFlags: [...new Set([...normalizeRecoveryFlags(card.recoveryFlags), 'recovering'])],
      version: card.version + 1,
      updatedAt: ts,
      updatedBy: actor,
    }, {
      id: card.id,
      actor,
      now: ts,
      version: card.version + 1,
      createdAt: card.createdAt,
      updatedAt: ts,
    });
    stateGraph.commit([
      { op: 'set', path: `workflowRuns/${run.id}`, value: run },
      { op: 'set', path: `workflowCards/${card.id}`, value: nextCard },
    ], sourceFor(actor));
    return { ok: true, card: nextCard, run };
  }

  async function controlWorkItem(args = {}, context = {}) {
    let cardId = normalizeCardId(args);
    let actor = textOrNull(args.actor) ?? 'system';
    let action = textOrNull(args.action) ?? 'pause';
    if (!['pause', 'stop', 'cancel'].includes(action)) {
      throw new Error('Workflow control action must be pause, stop, or cancel.');
    }
    let card = getCard(cardId);
    let ts = now();
    let taskIds = uniqueArray([
      ...card.entityRefs.taskIds,
      ...getRunsForCard(card.id).flatMap(run => run.taskIds),
    ]);
    let sideEffects = [];
    let pm = context.proxyManager ?? proxyManager;
    if (pm?.requestFromChild && (action === 'stop' || action === 'cancel')) {
      let toolName = action === 'stop' ? 'finish_task' : 'cancel_task';
      for (let taskId of taskIds) {
        try {
          await pm.requestFromChild('agent-pool', 'tools/call', {
            name: toolName,
            arguments: { task_id: taskId },
          }, 60_000);
          sideEffects.push({ type: toolName, status: 'requested', taskId });
        } catch (error) {
          sideEffects.push({ type: toolName, status: 'failed', taskId, error: error.message });
        }
      }
    }
    let runs = getRunsForCard(card.id);
    let runOps = runs.map(run => ({
      op: 'set',
      path: `workflowRuns/${run.id}`,
      value: normalizeWorkflowRunInput({
        ...run,
        status: action === 'pause' ? 'paused' : action === 'stop' ? 'stopped' : 'cancelled',
        completedAt: action === 'pause' ? null : ts,
      }, { id: run.id, now: ts, updatedAt: ts }),
    }));
    let flags = new Set(normalizeRecoveryFlags(card.recoveryFlags));
    if (action === 'pause') flags.add('blocked');
    if (action === 'stop' || action === 'cancel') flags.add('needs_audit');
    let blockers = new Set(card.blockers);
    if (action === 'pause') blockers.add(textOrNull(args.reason) ?? 'Paused by workflow control.');
    let nextCard = normalizeWorkflowCardInput({
      ...card,
      blockers: [...blockers],
      recoveryFlags: [...flags],
      version: card.version + 1,
      updatedAt: ts,
      updatedBy: actor,
    }, {
      id: card.id,
      actor,
      now: ts,
      version: card.version + 1,
      createdAt: card.createdAt,
      updatedAt: ts,
    });
    stateGraph.commit([
      ...runOps,
      { op: 'set', path: `workflowCards/${card.id}`, value: nextCard },
      ...(action === 'pause' ? [] : [{ op: 'delete', path: `workflowLeases/${card.id}` }]),
    ], sourceFor(actor));
    return { ok: true, action, card: nextCard, sideEffects };
  }

  function readStateGraphRuntimeTasks() {
    return new Map(Object.entries(stateGraph.get('tasks') || {}).map(([id, task]) => [
      id,
      { id, ...task, runtimeSource: task?.runtimeSource ?? 'state_graph' },
    ]));
  }

  async function readRuntimeTasks(context = {}) {
    let tasksById = readStateGraphRuntimeTasks();
    let pm = context.proxyManager ?? proxyManager;
    if (pm?.requestFromChild) {
      try {
        let result = await pm.requestFromChild('agent-pool', 'tools/call', {
          name: 'list_tasks',
          arguments: {},
        }, 60_000);
        let text = result?.content?.[0]?.text || '';
        let parsed = text ? JSON.parse(text) : {};
        let tasks = Array.isArray(parsed) ? parsed : (parsed.tasks || []);
        for (let task of tasks) {
          let id = task?.id || task?.taskId;
          if (id) tasksById.set(id, { id, ...task, runtimeSource: 'agent_pool' });
        }
        return tasksById;
      } catch {
        return tasksById;
      }
    }
    return tasksById;
  }

  function derivePersistentRecoveryFlags(card, runtimeTasks, currentNow) {
    let flags = new Set(normalizeRecoveryFlags(card.recoveryFlags));
    let lease = clone(stateGraph.get(`workflowLeases/${card.id}`) ?? null);
    let runs = getRunsForCard(card.id);
    let taskIds = uniqueArray([
      ...card.entityRefs.taskIds,
      ...runs.flatMap(run => run.taskIds),
    ]);

    if (card.blockers.length > 0) flags.add('blocked');
    if (lease?.leaseExpiresAt && Number(lease.leaseExpiresAt) < currentNow) flags.add('needs_resume');
    if (
      ['in-progress', 'quality-audit', 'commit-publish'].includes(card.columnId)
      && !runs.some(run => RUNNING_RUN_STATUSES.has(run.status))
      && taskIds.length === 0
    ) {
      flags.add('needs_resume');
    }
    if (runs.some(run => ['lost', 'stale', 'error', 'recovery_detected'].includes(run.status))) {
      flags.add('needs_audit');
    }
    for (let taskId of taskIds) {
      let task = runtimeTasks.get(taskId);
      let status = textOrNull(task?.status ?? task?.state ?? task?.type);
      if (!task || TASK_ERROR_STATUSES.has(String(status || '').toLowerCase())) {
        flags.add('needs_audit');
      }
    }
    if (runs.some(run => run.status === 'recovering')) flags.add('recovering');
    return [...flags].filter(flag => normalizeRecoveryFlags([flag]).length > 0);
  }

  async function reconcileWorkflowRecovery(args = {}, context = {}) {
    let actor = textOrNull(args.actor) ?? 'recovery';
    await seedWorkflowWorkItemsForProjection(args);
    let projection = getBoardProjection(args);
    let runtimeTasks = await readRuntimeTasks(context);
    let currentNow = now();
    let reconciled = [];
    let ops = [];

    for (let card of projection.cards.filter(item => ACTIVE_RECOVERY_COLUMN_IDS.includes(item.columnId))) {
      let current = getCard(card.id);
      let flags = derivePersistentRecoveryFlags(current, runtimeTasks, currentNow);
      let currentFlags = normalizeRecoveryFlags(current.recoveryFlags);
      let changed = flags.join('|') !== currentFlags.join('|');
      if (!changed && !args.force) continue;
      let nextCard = normalizeWorkflowCardInput({
        ...current,
        recoveryFlags: flags,
        version: current.version + 1,
        updatedAt: currentNow,
        updatedBy: actor,
      }, {
        id: current.id,
        actor,
        now: currentNow,
        version: current.version + 1,
        createdAt: current.createdAt,
        updatedAt: currentNow,
      });
      let runId = `recovery-${slugSegment(current.id)}`;
      let run = normalizeWorkflowRunInput({
        id: runId,
        boardId: current.boardId,
        cardId: current.id,
        status: flags.length ? 'recovery_detected' : 'clear',
        taskIds: uniqueArray([...current.entityRefs.taskIds, ...getRunsForCard(current.id).flatMap(item => item.taskIds)]),
      }, { id: runId, now: currentNow, updatedAt: currentNow });
      ops.push(
        { op: 'set', path: `workflowCards/${current.id}`, value: nextCard },
        { op: 'set', path: `workflowRuns/${run.id}`, value: run },
      );
      reconciled.push({ card: nextCard, run, flags });
    }

    if (ops.length) stateGraph.commit(ops, sourceFor(actor));
    return {
      ok: true,
      reconciled,
      recovery: getRecoveryState(args),
    };
  }

  function workspaceRoot() {
    return path.join(projectRoot, '.agent-portal', 'workspace');
  }

  async function listWorkItemFiles(args = {}) {
    let root = workspaceRoot();
    let projectId = textOrNull(args.projectId ?? args.project_id);
    let projects = projectId ? [slugSegment(projectId)] : [];
    if (!projects.length) {
      try {
        let entries = await fs.readdir(root, { withFileTypes: true });
        projects = entries.filter(entry => entry.isDirectory()).map(entry => entry.name);
      } catch {
        return [];
      }
    }
    let files = [];
    for (let project of projects) {
      let dir = path.join(root, project, 'plans', 'work-items');
      try {
        let entries = await fs.readdir(dir, { withFileTypes: true });
        for (let entry of entries) {
          if (entry.isFile() && entry.name.endsWith('.md')) files.push(path.join(dir, entry.name));
        }
      } catch {
        /* project has no work item dir */
      }
    }
    return files;
  }

  function cardInputFromMarkdown(file, parsed, fallbackProjectId) {
    let meta = asObject(parsed?.meta);
    let workflow = asObject(meta.workflow);
    let entityRefs = asObject(meta.entity_refs ?? meta.entityRefs);
    let links = asObject(meta.links);
    let root = workspaceRoot();
    let relPath = safeRelativePath(file, root) ?? file;
    let seedBoardId = textOrNull(meta.seed_board ?? meta.seedBoard);
    let seedColumnId = textOrNull(meta.seed_column ?? meta.seedColumn);
    return {
      id: textOrNull(meta.id ?? meta.card_id ?? meta.cardId) ?? `work-item-${slugSegment(path.basename(file, '.md'))}`,
      title: textOrNull(meta.title) ?? path.basename(file, '.md'),
      body: parsed?.body || '',
      boardId: textOrNull(workflow.board_id ?? workflow.boardId ?? meta.board_id ?? meta.boardId ?? seedBoardId)
        ?? DEFAULT_WORKFLOW_BOARD_ID,
      columnId: textOrNull(
        meta.columnId
          ?? meta.column_id
          ?? meta.workflow_column
          ?? workflow.column_snapshot
          ?? seedColumnId,
      ) ?? 'ideas',
      projectId: textOrNull(meta.project_id ?? meta.projectId) ?? fallbackProjectId,
      domain: meta.domain,
      kind: meta.kind,
      priority: meta.priority,
      owner: meta.owner,
      assignedAgent: meta.assigned_agent ?? meta.agent,
      resourceGroup: meta.resource_group,
      approvalMode: meta.approval_mode,
      acceptanceCriteria: meta.acceptance_criteria ?? meta.acceptanceCriteria,
      context: meta.context,
      routingHints: meta.routing_hints ?? meta.routingHints,
      entityRefs: {
        goalId: firstText(entityRefs.goal_id ?? entityRefs.goalId ?? links.goal_ids ?? links.goalIds),
        chatId: firstText(entityRefs.chat_id ?? entityRefs.chatId ?? links.chat_ids ?? links.chatIds),
        taskIds: entityRefs.task_ids ?? entityRefs.taskIds ?? links.task_ids ?? links.taskIds,
      },
      metadata: {
        ...asObject(meta.metadata),
        markdownPath: relPath,
        markdownImportedAt: now(),
        markdownSchema: textOrNull(meta.schema),
        markdownSeedBoard: seedBoardId,
        markdownSeedColumn: seedColumnId,
        planningStatus: textOrNull(meta.planning_status ?? meta.planningStatus),
        runtimeSource: textOrNull(meta.runtime_source ?? meta.runtimeSource),
        privacy: textOrNull(meta.privacy),
        publicExport: meta.public_export ?? meta.publicExport,
      },
    };
  }

  async function getBoardProjectionWithSeed(filter = {}) {
    await seedWorkflowWorkItemsForProjection(filter);
    return getBoardProjection(filter);
  }

  async function seedWorkflowWorkItemsForProjection(filter = {}) {
    if (
      filter.includeMarkdownSeed === false
      || filter.includeMarkdownSeeds === false
      || filter.importMarkdown === false
    ) {
      return { ok: true, imported: [], skipped: [], count: 0 };
    }
    return importWorkflowWorkItems({
      boardId: filter.boardId ?? filter.board_id,
      projectId: filter.projectId ?? filter.project_id,
      actor: textOrNull(filter.actor) ?? 'projection-seed-import',
    });
  }

  async function importWorkflowWorkItems(args = {}) {
    let actor = textOrNull(args.actor) ?? 'markdown-import';
    let files = await listWorkItemFiles(args);
    let imported = [];
    let skipped = [];
    for (let file of files) {
      let content = await fs.readFile(file, 'utf8');
      let parsed = parseMarkdownFrontmatter(content);
      if (!parsed) continue;
      let root = workspaceRoot();
      let rel = safeRelativePath(file, root) || '';
      let projectId = textOrNull(args.projectId ?? args.project_id)
        ?? rel.split(path.sep)[0]
        ?? null;
      let cardInput = cardInputFromMarkdown(file, parsed, projectId);
      let existing = stateGraph.get(`workflowCards/${cardInput.id}`);
      if (existing) {
        skipped.push({
          cardId: existing.id,
          title: existing.title,
          markdownPath: cardInput.metadata.markdownPath,
          version: existing.version,
          reason: 'already_imported',
        });
        continue;
      }
      let result = createOrUpdateCard({
        ...cardInput,
        actor,
      });
      imported.push({
        cardId: result.card.id,
        title: result.card.title,
        markdownPath: result.card.metadata.markdownPath,
        version: result.card.version,
      });
    }
    return { ok: true, imported, skipped, count: imported.length };
  }

  async function exportWorkflowWorkItem(args = {}) {
    let cardId = normalizeCardId(args);
    let actor = textOrNull(args.actor) ?? 'markdown-export';
    let card = getCard(cardId);
    let projectId = textOrNull(args.projectId ?? args.project_id ?? card.projectId) ?? 'global';
    let root = workspaceRoot();
    let markdownPath = textOrNull(args.markdownPath ?? args.markdown_path ?? card.metadata?.markdownPath)
      ?? path.join(slugSegment(projectId), 'plans', 'work-items', `${slugSegment(card.id)}.md`);
    let absPath = path.isAbsolute(markdownPath)
      ? markdownPath
      : path.join(root, markdownPath);
    if (!safeRelativePath(absPath, root)) {
      throw new Error('Workflow markdown export path must stay inside .agent-portal/workspace.');
    }
    let frontmatter = {
      id: card.id,
      title: card.title,
      project_id: card.projectId,
      domain: card.domain,
      kind: card.kind,
      priority: card.priority,
      owner: card.owner,
      assigned_agent: card.assignedAgent,
      resource_group: card.resourceGroup,
      approval_mode: card.approvalMode,
      acceptance_criteria: card.acceptanceCriteria,
      context: card.context,
      routing_hints: card.routingHints,
      entity_refs: {
        goal_id: card.entityRefs.goalId,
        chat_id: card.entityRefs.chatId,
        task_ids: card.entityRefs.taskIds,
      },
      workflow: {
        board_id: card.boardId,
        column_snapshot: card.columnId,
        card_version: card.version,
        runtime_source: 'state_graph',
        exported_at: new Date(now()).toISOString(),
      },
    };
    await fs.mkdir(path.dirname(absPath), { recursive: true });
    await fs.writeFile(absPath, buildMarkdown(frontmatter, card.body || ''), 'utf8');
    let relPath = safeRelativePath(absPath, root);
    let nextCard = normalizeWorkflowCardInput({
      ...card,
      metadata: {
        ...card.metadata,
        markdownPath: relPath,
        markdownExportedAt: now(),
      },
      version: card.version + 1,
      updatedAt: now(),
      updatedBy: actor,
    }, {
      id: card.id,
      actor,
      now: now(),
      version: card.version + 1,
      createdAt: card.createdAt,
      updatedAt: now(),
    });
    stateGraph.commit([{ op: 'set', path: `workflowCards/${card.id}`, value: nextCard }], sourceFor(actor));
    return { ok: true, card: nextCard, markdownPath: relPath };
  }

  function getWorkflowRecoveryState(args = {}) {
    return { ok: true, recovery: getRecoveryState(args) };
  }

  function listWorkflowEvents(args = {}) {
    return { ok: true, events: listEvents(args) };
  }

  return {
    ensureBoard,
    getCard,
    createOrUpdateCard,
    getBoardProjection,
    getBoardProjectionWithRuntime,
    requestTransition,
    listEvents,
    getRecoveryState,
    listWorkflowBoards,
    getWorkflowBoard,
    createWorkItem,
    updateWorkItem,
    decomposeWorkItem,
    updateWorkflowBoard,
    updateWorkflowColumn,
    controlWorkflowBoard,
    requestWorkflowTransition,
    deleteWorkItem,
    claimWorkItem,
    releaseWorkItem,
    orchestrateWorkItem,
    resumeWorkItem,
    controlWorkItem,
    reconcileWorkflowRecovery,
    importWorkflowWorkItems,
    exportWorkflowWorkItem,
    getWorkflowRecoveryState,
    listWorkflowEvents,
  };
}

export function getWorkflowBoardService(proxyManager = null, options = {}) {
  if (options.workflowService) return options.workflowService;
  if (proxyManager?.workflowBoardService) return proxyManager.workflowBoardService;
  let service = createWorkflowBoardService({
    stateGraph: options.stateGraph ?? proxyManager?.stateGraph ?? getStateGraph(),
    now: options.now,
    makeId: options.makeId,
    projectRoot: options.projectRoot ?? proxyManager?.projectRoot,
    proxyManager,
  });
  if (proxyManager) proxyManager.workflowBoardService = service;
  return service;
}
