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
  normalizeWorkflowCardInput,
  normalizeWorkflowChecksInput,
  normalizeWorkflowLeaseInput,
  normalizeWorkflowRunInput,
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
const RUNNING_RUN_STATUSES = new Set(['requested', 'running', 'recovering']);
const TASK_ERROR_STATUSES = new Set(['lost', 'stale', 'error', 'failed', 'cancelled']);

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

  function ensureBoard(boardId = DEFAULT_WORKFLOW_BOARD_ID) {
    let id = textOrNull(boardId) ?? DEFAULT_WORKFLOW_BOARD_ID;
    let existing = stateGraph.get(`workflowBoards/${id}`);
    if (existing) return clone(existing);
    if (id !== DEFAULT_WORKFLOW_BOARD_ID) {
      throw new Error(`Workflow board not found: ${id}`);
    }
    let board = createDefaultWorkflowBoard({ id, now: now() });
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

  function listEvents(filter = {}) {
    let boardId = textOrNull(filter.boardId ?? filter.board_id);
    let cardId = textOrNull(filter.cardId ?? filter.card_id);
    let limit = resolveLimit(filter.limit);
    return Object.values(getCollection(stateGraph, 'workflowTransitions'))
      .filter(event => !boardId || event.boardId === boardId)
      .filter(event => !cardId || event.cardId === cardId)
      .sort((a, b) => (a.createdAt - b.createdAt) || a.id.localeCompare(b.id))
      .slice(-limit);
  }

  function getBoardProjection(filter = {}) {
    let board = ensureBoard(filter.boardId ?? filter.board_id ?? DEFAULT_WORKFLOW_BOARD_ID);
    let projectId = textOrNull(filter.projectId ?? filter.project_id);
    let cards = Object.values(getCollection(stateGraph, 'workflowCards'))
      .filter(card => card.boardId === board.id)
      .filter(card => !projectId || card.projectId === projectId)
      .sort((a, b) => (a.createdAt - b.createdAt) || a.id.localeCompare(b.id))
      .map((card) => ({
        ...card,
        checks: getChecks(card.id),
        runs: getRunsForCard(card.id),
        lease: clone(stateGraph.get(`workflowLeases/${card.id}`) ?? null),
      }));
    let columns = board.columns.map((column) => ({
      ...column,
      cards: cards.filter(card => card.columnId === column.id),
    }));

    return {
      schema: 'workflow-board-projection/v1',
      board,
      boardId: board.id,
      scope: { projectId },
      columns,
      cards,
      counts: Object.fromEntries(columns.map(column => [column.id, column.cards.length])),
      version: stateGraph.version,
    };
  }

  function getRunsForCard(cardId) {
    return Object.values(getCollection(stateGraph, 'workflowRuns'))
      .filter(run => run.cardId === cardId)
      .sort((a, b) => (a.startedAt - b.startedAt) || a.id.localeCompare(b.id));
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

  function getWorkflowBoard(args = {}) {
    let projection = getBoardProjection(args);
    return { ok: true, projection };
  }

  function createWorkItem(args = {}) {
    let result = createOrUpdateCard(args);
    return { ok: true, ...result };
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
    });
    return { ok: true, ...result };
  }

  function requestWorkflowTransition(args = {}) {
    return { ok: true, ...requestTransition(args) };
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

  function buildWorkItemPrompt(card, args = {}) {
    let criteria = card.acceptanceCriteria.length
      ? `\n\nAcceptance criteria:\n${card.acceptanceCriteria.map(item => `- ${item}`).join('\n')}`
      : '';
    let context = card.context.length
      ? `\n\nContext:\n${card.context.map(item => `- ${item}`).join('\n')}`
      : '';
    let markdownPath = textOrNull(card.metadata?.markdownPath);
    let fileHint = markdownPath ? `\n\nWorkflow work-item file: ${markdownPath}` : '';
    return [
      `Run the Agent Portal workflow work item "${card.title}".`,
      card.body ? `\n\n${card.body}` : '',
      `\n\nWorkflow card id: ${card.id}`,
      card.projectId ? `\nProject: ${card.projectId}` : '',
      card.domain ? `\nDomain: ${card.domain}` : '',
      card.assignedAgent ? `\nPreferred agent: ${card.assignedAgent}` : '',
      criteria,
      context,
      fileHint,
      args.reason ? `\n\nTrigger reason: ${args.reason}` : '',
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

    let chatId = textOrNull(card.entityRefs.chatId);
    if (!chatId) {
      let chat = stateGraph.createChat({
        name: `Workflow: ${card.title}`,
        adapter: 'pool',
        agent: textOrNull(args.agent ?? args.agent_slug ?? card.assignedAgent) ?? 'orchestrator',
        projectId: card.projectId,
        approval_mode: textOrNull(args.approval_mode ?? card.approvalMode),
        resource_group: textOrNull(args.resource_group ?? card.resourceGroup),
        goalIntentActive: true,
      }, WORKFLOW_SOURCE);
      chatId = chat.id;
    }

    let goalId = textOrNull(card.entityRefs.goalId);
    if (!goalId) {
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
      agent_slug: textOrNull(args.agent ?? args.agent_slug ?? card.assignedAgent) ?? 'orchestrator',
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
    if (board.mode === 'paused' || board.mode === 'maintenance') {
      throw new Error(`Workflow board ${board.id} is not accepting orchestration while mode is ${board.mode}.`);
    }
    let automation = cardAutomation(board, card);
    let mode = textOrNull(args.mode) ?? automation.mode ?? 'manual';
    if (mode === 'auto' && board.mode !== 'autonomous' && board.mode !== 'armed') {
      throw new Error(`Workflow board ${board.id} mode ${board.mode} does not allow automatic orchestration.`);
    }
    if (!['ready', 'in-progress', 'quality-audit', 'commit-publish'].includes(card.columnId)) {
      throw new Error(`Workflow card ${card.id} in column ${card.columnId} is not eligible for orchestration.`);
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
    let runId = textOrNull(args.runId ?? args.run_id) ?? nextId(makeId, 'run');
    let lease = ensureLease(card, args, runId, actor, ts);
    let run = normalizeWorkflowRunInput({
      id: runId,
      boardId: board.id,
      cardId,
      status: 'requested',
      leaseOwner: lease.leaseOwner,
      taskIds: args.taskIds ?? args.task_ids,
    }, { id: runId, now: ts, updatedAt: ts });
    stateGraph.commit([
      { op: 'set', path: `workflowRuns/${run.id}`, value: run },
      { op: 'set', path: `workflowLeases/${card.id}`, value: lease },
    ], sourceFor(actor));

    let delegated = args.delegate === false
      ? { ok: false, sideEffects: [], taskIds: [], chatId: card.entityRefs.chatId, goalId: card.entityRefs.goalId }
      : await delegateWorkItem(card, run, args, context);
    let taskIds = uniqueArray([...run.taskIds, ...delegated.taskIds]);
    let nextRun = normalizeWorkflowRunInput({
      ...run,
      status: delegated.ok ? 'running' : run.status,
      taskIds,
    }, { id: run.id, now: ts, updatedAt: now() });
    let nextCard = normalizeWorkflowCardInput({
      ...card,
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
    stateGraph.commit([
      { op: 'set', path: `workflowRuns/${run.id}`, value: nextRun },
      { op: 'set', path: `workflowCards/${card.id}`, value: nextCard },
    ], sourceFor(actor));
    return { ok: true, card: nextCard, run: nextRun, lease, sideEffects: delegated.sideEffects };
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

  async function readRuntimeTasks(context = {}) {
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
        return new Map(tasks.map(task => [task.id || task.taskId, task]).filter(([id]) => id));
      } catch {
        return new Map(Object.entries(stateGraph.get('tasks') || {}).map(([id, task]) => [id, { id, ...task }]));
      }
    }
    return new Map(Object.entries(stateGraph.get('tasks') || {}).map(([id, task]) => [id, { id, ...task }]));
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
    let root = workspaceRoot();
    let relPath = safeRelativePath(file, root) ?? file;
    return {
      id: textOrNull(meta.id ?? meta.card_id ?? meta.cardId) ?? `work-item-${slugSegment(path.basename(file, '.md'))}`,
      title: textOrNull(meta.title) ?? path.basename(file, '.md'),
      body: parsed?.body || '',
      boardId: textOrNull(workflow.board_id ?? workflow.boardId ?? meta.board_id ?? meta.boardId) ?? DEFAULT_WORKFLOW_BOARD_ID,
      columnId: textOrNull(meta.columnId ?? meta.column_id ?? meta.workflow_column ?? workflow.column_snapshot) ?? 'ideas',
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
        goalId: entityRefs.goal_id ?? entityRefs.goalId,
        chatId: entityRefs.chat_id ?? entityRefs.chatId,
        taskIds: entityRefs.task_ids ?? entityRefs.taskIds,
      },
      metadata: {
        ...asObject(meta.metadata),
        markdownPath: relPath,
        markdownImportedAt: now(),
      },
    };
  }

  async function importWorkflowWorkItems(args = {}) {
    let actor = textOrNull(args.actor) ?? 'markdown-import';
    let files = await listWorkItemFiles(args);
    let imported = [];
    for (let file of files) {
      let content = await fs.readFile(file, 'utf8');
      let parsed = parseMarkdownFrontmatter(content);
      if (!parsed) continue;
      let root = workspaceRoot();
      let rel = safeRelativePath(file, root) || '';
      let projectId = textOrNull(args.projectId ?? args.project_id)
        ?? rel.split(path.sep)[0]
        ?? null;
      let result = createOrUpdateCard({
        ...cardInputFromMarkdown(file, parsed, projectId),
        actor,
      });
      imported.push({
        cardId: result.card.id,
        title: result.card.title,
        markdownPath: result.card.metadata.markdownPath,
        version: result.card.version,
      });
    }
    return { ok: true, imported, count: imported.length };
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
    requestTransition,
    listEvents,
    getRecoveryState,
    listWorkflowBoards,
    getWorkflowBoard,
    createWorkItem,
    updateWorkItem,
    requestWorkflowTransition,
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
