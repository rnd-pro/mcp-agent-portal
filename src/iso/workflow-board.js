export const WORKFLOW_BOARD_SCHEMA = 'workflow-board/v2';
export const WORKFLOW_CARD_SCHEMA = 'workflow-card/v2';
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
// Auto re-engagement of a dormant orchestrator on a queued (soft) return — distinct from `recovery`,
// which governs re-engaging stuck/escalated work. A return is new actionable work to pick up, so the
// return loop is on by default; hard-interrupts bypass this regardless (a blocked child cannot wait).
export const WORKFLOW_BOARD_RETURN_WAKE_MODES = ['auto', 'manual', 'disabled'];
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

export const WORKFLOW_ESCALATION_SCHEMA = 'workflow-escalation/v1';
export const WORKFLOW_ESCALATION_KINDS = [
  'insufficient_permission',
  'insufficient_context',
  'needs_decision',
  'rework',
];

/**
 * Normalize a typed worker escalation. Returns null for an absent/unknown kind so an untyped
 * `blocked` result preserves today's behavior; the service parser decides the needs_decision
 * fallback only for a confirmed terminal blocked with no typed block. The record carries NO rights
 * fields (approvalMode / resourceGroup / assignedAgent) — permission stays board/approval-owned.
 */
export function normalizeWorkflowEscalation(input = {}, opts = {}) {
  let kind = textOrNull(input.kind);
  if (!kind || !WORKFLOW_ESCALATION_KINDS.includes(kind)) return null;
  let now = Number(opts.now);
  let raisedAt = Number.isFinite(now) ? now : Number(input.raisedAt ?? input.raised_at);
  return {
    schema: WORKFLOW_ESCALATION_SCHEMA,
    kind,
    detail: textOrNull(input.detail),
    suggestedResolution: textOrNull(input.suggestedResolution ?? input.suggested_resolution),
    proposedLane: textOrNull(input.proposedLane ?? input.proposed_lane),
    raisedBy: textOrNull(input.raisedBy ?? input.raised_by ?? opts.raisedBy),
    raisedAt: Number.isFinite(raisedAt) ? raisedAt : null,
    runId: textOrNull(input.runId ?? opts.runId),
    taskId: textOrNull(input.taskId ?? opts.taskId),
  };
}

export const WORKFLOW_ESCALATION_STATE_SCHEMA = 'workflow-escalation-state/v1';

/**
 * Normalize the durable per-card escalation episode stored on `card.metadata.escalation`.
 * This is the loop-safety record the channel reasons about: `attemptCount` is owned by the
 * re-engagement step (NOT the parser), `nextAttemptAt` gates backoff, and `humanEscalated` is the
 * terminal state once the attempt cap is hit. The parser only records the latest typed escalation
 * and appends to `history`; it must never advance `attemptCount`, or the cap becomes unreachable.
 */
export function normalizeWorkflowEscalationState(input = {}) {
  let state = objectOrEmpty(input);
  let last = normalizeWorkflowEscalation(state.lastEscalation ?? state.last_escalation ?? state);
  let attemptCount = Number(state.attemptCount ?? state.attempt_count);
  let firstAt = Number(state.firstAt ?? state.first_at);
  let lastAt = Number(state.lastAt ?? state.last_at);
  let nextAttemptAt = Number(state.nextAttemptAt ?? state.next_attempt_at);
  let history = Array.isArray(state.history) ? state.history : [];
  return {
    schema: WORKFLOW_ESCALATION_STATE_SCHEMA,
    kind: last?.kind ?? textOrNull(state.kind),
    detail: last?.detail ?? textOrNull(state.detail),
    lastEscalation: last,
    attemptCount: Number.isFinite(attemptCount) && attemptCount > 0 ? Math.floor(attemptCount) : 0,
    firstAt: Number.isFinite(firstAt) ? firstAt : null,
    lastAt: Number.isFinite(lastAt) ? lastAt : null,
    nextAttemptAt: Number.isFinite(nextAttemptAt) ? nextAttemptAt : null,
    humanEscalated: Boolean(state.humanEscalated ?? state.human_escalated),
    lastRunId: textOrNull(state.lastRunId ?? state.last_run_id),
    history: history
      .map(item => ({
        kind: textOrNull(item?.kind),
        detail: textOrNull(item?.detail),
        runId: textOrNull(item?.runId ?? item?.run_id),
        at: Number.isFinite(Number(item?.at)) ? Number(item.at) : null,
      }))
      .filter(item => item.kind)
      .slice(-12),
  };
}

/** A card carries a live escalation episode the channel may still act on. */
export function hasActiveEscalation(card = {}) {
  let state = card?.metadata?.escalation;
  return Boolean(state && (state.kind || state.lastEscalation) && !(state.humanEscalated ?? state.human_escalated));
}

// ── Orchestrator return / subscription channel (event-driven control loop) ──────────────────────
// A child task reports back to the orchestrator via typed "return" events; the orchestrator is a
// dormant reducer woken by the board substrate only on ACTIONABLE returns. These are pure contracts;
// the node layer mints them on the reconcile path and drives the wake through the escalation channel.

export const WORKFLOW_RETURN_SCHEMA = 'workflow-return/v1';

export const WORKFLOW_RETURN_KINDS = [
  'completed', 'failed',                                  // terminal — run reached a final status
  'needs_decision', 'needs_context', 'needs_permission',  // intermediate — two-way
  'blocked',                                              // intermediate — hard-interrupt
  'partial', 'discovered', 'progress',                    // intermediate — soft
];
export const WORKFLOW_RETURN_TERMINAL_KINDS = ['completed', 'failed'];
export const WORKFLOW_RETURN_HARD_INTERRUPT_KINDS = ['needs_decision', 'blocked', 'needs_permission'];
export const WORKFLOW_RETURN_COALESCE_ONLY_KINDS = ['progress', 'partial'];
export const WORKFLOW_RETURN_ACTIONABLE_KINDS =
  WORKFLOW_RETURN_KINDS.filter(kind => !WORKFLOW_RETURN_COALESCE_ONLY_KINDS.includes(kind));

// Folds a two-way return onto the existing escalation vocabulary for re-engagement.
const RETURN_KIND_TO_ESCALATION = {
  needs_decision: 'needs_decision',
  needs_context: 'insufficient_context',
  needs_permission: 'insufficient_permission',
  blocked: 'needs_decision',
};

/** Does a return of this kind warrant waking the orchestrator (vs. coalesce-only progress/partial)? */
export function isActionableReturn(kind) { return WORKFLOW_RETURN_ACTIONABLE_KINDS.includes(textOrNull(kind)); }
/** A hard-interrupt return wakes regardless of subscription (the child cannot proceed without a reply). */
export function isHardInterrupt(kind) { return WORKFLOW_RETURN_HARD_INTERRUPT_KINDS.includes(textOrNull(kind)); }
/** A terminal return — the child's run reached a final status. */
export function isTerminalReturn(kind) { return WORKFLOW_RETURN_TERMINAL_KINDS.includes(textOrNull(kind)); }

/**
 * Does an inbox return event drive a wake of ITS OWN card? Actionable + unconsumed, and either
 * intermediate (a still-running card that needs routing/a reply) or `routed` (a result delivered to this
 * card from a child/join). A bare self-completion terminal return (`completed`/`failed` minted by the
 * card's own run) is NOT wake-driving — it only flows to subscribers/owners, so a finished leaf does not
 * re-orchestrate itself (and a card cycling through audit does not churn on its own terminal returns).
 */
export function isWakeDrivingReturn(event) {
  if (!event || event.actionable !== true || event.consumedAt) return false;
  return event.terminal !== true || event.routed === true;
}

/**
 * Normalize a typed return event. Flags are denormalized so the hot path does zero table lookups.
 * Returns null on an unknown kind or a missing correlationId (the inbox key, frozen as the cardId).
 * @param {object} input
 * @param {{ now?: number, seq?: number, correlationId?: string, runId?: string, taskId?: string, raisedBy?: string, eventId?: string }} [opts]
 */
export function normalizeWorkflowReturnEvent(input = {}, opts = {}) {
  let source = objectOrEmpty(input);
  let kind = textOrNull(source.kind);
  if (!kind || !WORKFLOW_RETURN_KINDS.includes(kind)) return null;
  let correlationId = textOrNull(source.correlationId ?? source.correlation_id ?? opts.correlationId);
  if (!correlationId) return null;

  let now = Number(opts.now);
  let raisedAt = Number.isFinite(now) ? now : Number(source.raisedAt ?? source.raised_at);
  let seq = Number(source.seq ?? opts.seq);

  let terminal = WORKFLOW_RETURN_TERMINAL_KINDS.includes(kind);
  let hardInterrupt = WORKFLOW_RETURN_HARD_INTERRUPT_KINDS.includes(kind);
  let actionable = WORKFLOW_RETURN_ACTIONABLE_KINDS.includes(kind);
  let twoWayByKind = hardInterrupt || kind === 'needs_context';
  let needsResponse = actionable && (twoWayByKind || source.needsResponse === true || source.needs_response === true);

  return {
    schema: WORKFLOW_RETURN_SCHEMA,
    eventId: textOrNull(source.eventId ?? source.event_id ?? opts.eventId),
    kind, terminal, actionable, hardInterrupt, needsResponse,
    // `routed` marks a return DELIVERED to this card from elsewhere (a join completion routed to its
    // owner) rather than minted by the card's own run. A routed terminal return drives a wake; a bare
    // self-completion terminal return does not re-engage its own card (it only flows to subscribers).
    routed: source.routed === true || opts.routed === true,
    correlationId,
    escalationKind: RETURN_KIND_TO_ESCALATION[kind] ?? null,
    seq: Number.isFinite(seq) ? seq : null,
    detail: textOrNull(source.detail),
    payload: objectOrNull(source.payload),
    supersedes: textOrNull(source.supersedes ?? source.supersedes_id),
    runId: textOrNull(source.runId ?? source.run_id ?? opts.runId),
    taskId: textOrNull(source.taskId ?? source.task_id ?? opts.taskId),
    raisedBy: textOrNull(source.raisedBy ?? source.raised_by ?? opts.raisedBy),
    raisedAt: Number.isFinite(raisedAt) ? raisedAt : null,
  };
}

/** Does `incoming` supersede `prior` in the per-card return inbox? (coalesce/dedup, inv: ordering-safe) */
export function returnEventSupersedes(incoming, prior) {
  if (!incoming || !prior) return false;
  if (incoming.correlationId !== prior.correlationId) return false;
  if (incoming.supersedes && incoming.supersedes === prior.eventId) return true;
  if (prior.needsResponse) return false;     // an unanswered question never auto-vanishes
  if (prior.terminal) return false;          // a late non-terminal cannot un-finish a run
  if (incoming.seq !== null && prior.seq !== null && incoming.seq < prior.seq) return false;
  let priorCoalesceOnly = !prior.actionable; // progress | partial
  return priorCoalesceOnly && (incoming.actionable || incoming.terminal);
}

/** Fold `incoming` into the bounded per-card return inbox, dropping superseded/stale entries. */
export function coalesceReturnEvents(events, incoming, limit = 12) {
  let list = Array.isArray(events) ? events : [];
  if (!incoming) return list.slice(-limit);
  // Idempotent re-mint: an incoming whose eventId already sits in the inbox (e.g. the reconcile
  // re-parsed a stable WORKFLOW_RETURN marker on a still-running run) is a no-op — the orchestrator
  // wakes once per DISTINCT return, not once per reconcile pass.
  if (incoming.eventId
    && list.some(prior => prior.eventId === incoming.eventId && prior.correlationId === incoming.correlationId)) {
    return list.slice(-limit);
  }
  // A coalesce-only incoming is dropped when a terminal for its correlationId already landed.
  if (!incoming.actionable && !incoming.terminal
    && list.some(prior => prior.correlationId === incoming.correlationId && prior.terminal)) {
    return list.slice(-limit);
  }
  let kept = list.filter(prior => !returnEventSupersedes(incoming, prior));
  kept.push(incoming);
  return kept.slice(-limit);
}

// ── Orchestrator subscription (when a child's return wakes the orchestrator) ─────────────────────
export const WORKFLOW_SUBSCRIPTION_SCHEMA = 'workflow-subscription/v1';
export const WORKFLOW_SUBSCRIPTION_MODES = ['final', 'stage', 'join'];
export const WORKFLOW_JOIN_POLICY_TYPES = ['all', 'any', 'quorum', 'all_settled'];
export const WORKFLOW_SUBSCRIPTION_ON_FAILURE = ['fail_fast', 'all_settled'];

/**
 * Normalize an orchestrator subscription. `join` is a FIXED-membership barrier over `members`,
 * realized as a synthetic dependent (releaseWhen: card_done); `completed` means subtree-complete,
 * not "this run exited", so fixed-member joins compose into a tree. Returns null for a memberless join.
 * @param {object} input
 */
export function normalizeWorkflowSubscription(input = {}) {
  let source = objectOrEmpty(input);
  let mode = normalizeKnownValue(source.mode, WORKFLOW_SUBSCRIPTION_MODES, 'final');
  let onFailure = normalizeKnownValue(source.onFailure ?? source.on_failure, WORKFLOW_SUBSCRIPTION_ON_FAILURE, 'fail_fast');
  // The synthetic join edge's release signal (S5). `card_done` is the safe default; `run_success`
  // releases as soon as a member's run succeeds (useful when members never reach a terminal column).
  let releaseWhen = normalizeKnownValue(source.releaseWhen ?? source.release_when, WORKFLOW_RELEASE_WHEN, 'card_done');
  if (mode !== 'join') return { schema: WORKFLOW_SUBSCRIPTION_SCHEMA, mode, onFailure, releaseWhen };
  let members = [...new Set(
    (Array.isArray(source.members) ? source.members : [])
      .map(member => textOrNull(member && typeof member === 'object' ? (member.cardId ?? member.id) : member))
      .filter(Boolean),
  )];
  if (!members.length) return null;
  let policy = objectOrEmpty(source.joinPolicy ?? source.join_policy);
  let type = normalizeKnownValue(policy.type, WORKFLOW_JOIN_POLICY_TYPES, 'all');
  let k = Number(policy.k);
  let quorumK = type === 'quorum' && Number.isFinite(k) && k >= 1 && k <= members.length ? Math.floor(k) : null;
  if (type === 'quorum' && quorumK === null) type = 'all';   // fail-safe: never under-wait
  return {
    schema: WORKFLOW_SUBSCRIPTION_SCHEMA, mode, onFailure, releaseWhen, members,
    joinPolicy: { type, ...(quorumK !== null ? { k: quorumK } : {}) },
  };
}

/**
 * Card lifecycle state machine (AD-4). Orthogonal to `columnId` and task status. The scheduler owns
 * every transition except `idle↔blocked`, which the dependency link/unlink path owns.
 */
export const WORKFLOW_CARD_LIFECYCLE_STATES = ['idle', 'blocked', 'queued', 'admitting', 'running'];

/** Normalize a card lifecycle value; absent/unknown/empty collapses to `idle`. */
export function normalizeWorkflowLifecycle(value) {
  let text = textOrNull(value);
  if (!text) return 'idle';
  return WORKFLOW_CARD_LIFECYCLE_STATES.includes(text) ? text : 'idle';
}

/** The two owners that may drive lifecycle transitions. */
export const WORKFLOW_LIFECYCLE_OWNERS = ['scheduler', 'dependency'];

const WORKFLOW_LIFECYCLE_TRANSITIONS = {
  scheduler: [
    ['idle', 'queued'],
    ['queued', 'admitting'],
    ['admitting', 'running'],
    ['running', 'idle'],
    ['admitting', 'queued'],
    ['running', 'queued'],
  ],
  dependency: [
    ['idle', 'blocked'],
    ['blocked', 'idle'],
  ],
};

/**
 * Is a lifecycle transition legal for the given owner? Same-state (from===to) is always allowed
 * (idempotent). The scheduler owns admission/rollback/re-drive; the `dependency` owner owns only
 * `idle↔blocked`. Any other (from, to) returns false.
 */
export function isWorkflowLifecycleTransitionAllowed(from, to, owner) {
  let f = normalizeWorkflowLifecycle(from);
  let t = normalizeWorkflowLifecycle(to);
  if (f === t) return true;
  let edges = WORKFLOW_LIFECYCLE_TRANSITIONS[owner];
  if (!edges) return false;
  return edges.some(([a, b]) => a === f && b === t);
}

/**
 * Board-native dependency release semantics (AD-5). `card_done` is the safe default; `run_success`
 * is documented unsafe under reworkable upstreams.
 */
export const WORKFLOW_RELEASE_WHEN = ['run_success', 'audit_passed', 'card_done'];
export const WORKFLOW_ON_UPSTREAM_FAILURE = ['block_and_escalate', 'release', 'cancel_self'];

/**
 * Normalize a `dependsOn` list into `{ cardId, releaseWhen, onUpstreamFailure }` entries. Accepts an
 * array of cardId strings (shorthand) or objects; entries without a cardId are dropped; unknown enum
 * values coerce to the default; entries dedupe by cardId (last wins).
 */
export function normalizeWorkflowDependsOn(input) {
  let source = Array.isArray(input) ? input : (input === undefined || input === null ? [] : [input]);
  let byCardId = new Map();
  for (let item of source) {
    let cardId = typeof item === 'object' && item !== null
      ? textOrNull(item.cardId ?? item.card_id ?? item.id)
      : textOrNull(item);
    if (!cardId) continue;
    let releaseWhen = normalizeKnownValue(
      typeof item === 'object' && item !== null ? (item.releaseWhen ?? item.release_when) : null,
      WORKFLOW_RELEASE_WHEN,
      'card_done',
    );
    let onUpstreamFailure = normalizeKnownValue(
      typeof item === 'object' && item !== null ? (item.onUpstreamFailure ?? item.on_upstream_failure) : null,
      WORKFLOW_ON_UPSTREAM_FAILURE,
      'block_and_escalate',
    );
    byCardId.set(cardId, { cardId, releaseWhen, onUpstreamFailure });
  }
  return [...byCardId.values()];
}

/**
 * Closed, frozen vocabulary of every built-in gate id — the keys of the build-time `GATE_CHECKS`
 * registry. Config may only REFERENCE these ids; an unknown gate id fails closed.
 */
export const WORKFLOW_GATE_VOCABULARY = [
  'classified_and_project_scoped',
  'has_owner_and_acceptance',
  'no_active_blocker',
  'audit_pass_or_explicit_waiver',
  'clean_diff_and_hygiene',
  'rework_authorized',
];

/** Floor-gate classification (inv 9, 10). */
export const WORKFLOW_HYGIENE_GATES = ['clean_diff_and_hygiene'];
export const WORKFLOW_AUDIT_GATES = ['audit_pass_or_explicit_waiver'];
export const WORKFLOW_RECOVERY_GATES = ['rework_authorized'];

export function gateIsHygiene(gateId) {
  return WORKFLOW_HYGIENE_GATES.includes(gateId);
}

export function gateIsAudit(gateId) {
  return WORKFLOW_AUDIT_GATES.includes(gateId);
}

export function gateIsRecovery(gateId) {
  return WORKFLOW_RECOVERY_GATES.includes(gateId);
}

/**
 * Floor-gate monotonicity: `customGateIds` must be a superset of the floor (hygiene + audit) gates
 * present in `baseGateIds`. Adding non-floor gates is fine; dropping a floor gate is non-monotonic.
 */
export function isFloorGateMonotonic(baseGateIds, customGateIds) {
  let base = textArray(baseGateIds);
  let custom = new Set(textArray(customGateIds));
  return base
    .filter(gate => gateIsHygiene(gate) || gateIsAudit(gate))
    .every(gate => custom.has(gate));
}

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
  returnWake: 'auto',
  stopPolicy: 'drain',
  publishMode: 'manual',
  defaultApprovalMode: 'plan',
  globalParallelLimit: 8,
  fallbackAgents: ['orchestrator'],
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
  // Governed rework kickback. The forward DAG is happy-path only; a stuck stage routes back to
  // `ready` (the column that owns the orchestrate action) so the orchestrator re-routes by
  // escalation kind. The `rework_authorized` gate keeps this from being a free backward move:
  // it requires a recorded escalation episode or a failed audit, never an arbitrary regression.
  {
    from: 'in-progress',
    to: 'ready',
    gate: 'rework_authorized',
  },
  {
    from: 'quality-audit',
    to: 'ready',
    gate: 'rework_authorized',
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
  // Backward rework is allowed only with a governed reason: a live escalation episode the orchestrator
  // must re-route, an audit the auditor explicitly failed, or a board return-loop re-engagement waking a
  // dormant orchestrator with queued returns to deliver. `request.reworkAuthorized` is set ONLY by the
  // daemon board-self-drive (the service gates it on the daemon principal), never by a caller body.
  rework_authorized: (card, checks, request) => ({
    ok: hasActiveEscalation(card) || checkFailed(checks.audit) || request?.reworkAuthorized === true,
    reason: 'Rework to ready requires a recorded escalation, a failed audit, or a board re-engagement.',
  }),
};

function checkFailed(value) {
  if (value === false) return true;
  if (value === null || value === undefined || value === true) return false;
  if (typeof value === 'object') return checkFailed(value.status);
  return ['failed', 'fail', 'error', 'blocked', 'rejected'].includes(String(value).trim().toLowerCase());
}

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

function objectOrNull(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
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
    returnWake: normalizeKnownValue(
      automation.returnWake ?? automation.return_wake,
      WORKFLOW_BOARD_RETURN_WAKE_MODES,
      DEFAULT_WORKFLOW_BOARD_AUTOMATION.returnWake,
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
  // Board-agnostic: the normalizer accepts any non-empty columnId (default `ideas`). It cannot know a
  // board's column set, so a custom column added via define_column is honored here; the service
  // validates `columnId ∈ board.columns` at the card-creation chokepoint (createOrUpdateCard / the
  // decompose child path), which is where the board is in scope.
  let columnId = textOrNull(input.columnId ?? input.column_id) ?? 'ideas';
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
    lifecycle: normalizeWorkflowLifecycle(input.lifecycle),
    dependsOn: normalizeWorkflowDependsOn(input.dependsOn ?? input.depends_on),
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

function transitionGateIds(transition) {
  return textArray(transition?.gates ?? transition?.gate);
}

function edgeIsRecoveryGated(gates) {
  return gates.some(gate => gateIsRecovery(gate));
}

function edgeIsHygieneGated(gates) {
  return gates.some(gate => gateIsHygiene(gate));
}

function edgeIsAuditGated(gates) {
  return gates.some(gate => gateIsAudit(gate));
}

/**
 * Longest-path topo rank over an adjacency map. Sources (no inbound) start at 0; each node's rank is
 * the max rank of its predecessors + 1 (Kahn order). If a cycle blocks Kahn from draining, the
 * remaining nodes fall back to a stable index order so the classifier never throws — the validator
 * reports the cycle separately.
 */
function computeStageRank(columnIds, forwardEdges) {
  let indegree = new Map(columnIds.map(id => [id, 0]));
  let adjacency = new Map(columnIds.map(id => [id, []]));
  for (let edge of forwardEdges) {
    if (!adjacency.has(edge.from) || !indegree.has(edge.to)) continue;
    adjacency.get(edge.from).push(edge.to);
    indegree.set(edge.to, indegree.get(edge.to) + 1);
  }
  let rank = new Map(columnIds.map(id => [id, 0]));
  let queue = columnIds.filter(id => indegree.get(id) === 0);
  let processed = 0;
  while (queue.length) {
    let node = queue.shift();
    processed += 1;
    for (let next of adjacency.get(node)) {
      rank.set(next, Math.max(rank.get(next), rank.get(node) + 1));
      indegree.set(next, indegree.get(next) - 1);
      if (indegree.get(next) === 0) queue.push(next);
    }
  }
  if (processed < columnIds.length) {
    // Cycle present: assign remaining (still-blocked) nodes a stable index-based rank.
    columnIds.forEach((id, index) => {
      if (indegree.get(id) > 0) rank.set(id, index);
    });
  }
  return rank;
}

/**
 * Shared transition-graph classifier (AD-6). Computes the forward subgraph `G_f` (all edges except
 * recovery edges), topological `stageRank` over `G_f`, the terminal set, and per-edge classification
 * (`forward`/`recovery`, `backward`, `destructive`). A **recovery edge** is recovery-gated AND
 * strictly rank-decreasing; rank is established over the non-recovery-gated edges so the definition is
 * well-founded. No column name is hardcoded — terminals come from `automation.action === 'close'`.
 */
export function classifyWorkflowGraph(board) {
  let columns = Array.isArray(board?.columns) ? board.columns : [];
  let columnIds = columns.map(column => column.id).filter(Boolean);
  let transitions = Array.isArray(board?.transitions) ? board.transitions : [];

  let terminals = new Set(
    columns.filter(column => column?.automation?.action === 'close').map(column => column.id),
  );

  let rawEdges = transitions
    .map((transition) => {
      let gates = transitionGateIds(transition);
      return {
        from: textOrNull(transition.from),
        to: textOrNull(transition.to),
        gates,
        recoveryGated: edgeIsRecoveryGated(gates),
      };
    })
    .filter(edge => edge.from && edge.to);

  // Rank basis: non-recovery-gated edges. Recovery-gated edges are the only recovery candidates.
  let rankBasisEdges = rawEdges.filter(edge => !edge.recoveryGated);
  let stageRank = computeStageRank(columnIds, rankBasisEdges);
  let rankOf = (columnId) => (stageRank.has(columnId) ? stageRank.get(columnId) : -1);

  let edges = rawEdges.map((edge) => {
    let fromRank = rankOf(edge.from);
    let toRank = rankOf(edge.to);
    let rankDecreasing = toRank < fromRank;
    let edgeClass = edge.recoveryGated && rankDecreasing ? 'recovery' : 'forward';
    let backward = rankDecreasing;
    let destructive = backward && (terminals.has(edge.from));
    return { from: edge.from, to: edge.to, gates: edge.gates, edgeClass, backward, destructive };
  });

  let edgeClassIndex = new Map(edges.map(edge => [`${edge.from}\x00${edge.to}`, edge.edgeClass]));

  return {
    stageRank,
    terminals,
    edges,
    rankOf,
    isTerminal: (columnId) => terminals.has(columnId),
    edgeClass: (from, to) => edgeClassIndex.get(`${from}\x00${to}`) ?? null,
  };
}

/**
 * Formal transition-graph validation (AD-6, inv 11). Returns `{ ok, errors, classifier }`. The forward
 * subgraph `G_f` (edges classified `forward`) must be acyclic; every terminal `t` must have a hygiene
 * inbound edge-cut (P1) and audit-domination (P2); reachability (no dead-end non-terminals, every
 * terminal reachable + non-orphan); and every referenced gate must be in the closed vocabulary.
 */
export function validateWorkflowTransitionGraph(board) {
  let classifier = classifyWorkflowGraph(board);
  let errors = [];
  let columns = Array.isArray(board?.columns) ? board.columns : [];
  let columnIds = columns.map(column => column.id).filter(Boolean);
  let terminals = classifier.terminals;
  let forwardEdges = classifier.edges.filter(edge => edge.edgeClass === 'forward');

  // (4) Unknown gate fails closed.
  for (let edge of classifier.edges) {
    for (let gate of edge.gates) {
      if (!WORKFLOW_GATE_VOCABULARY.includes(gate)) {
        errors.push({ code: 'unknown_gate', detail: `Transition ${edge.from} -> ${edge.to} references unknown gate "${gate}".` });
      }
    }
  }

  // (1) G_f acyclic — Kahn over forward edges; if it cannot drain, a forward cycle exists.
  let indegree = new Map(columnIds.map(id => [id, 0]));
  let adjacency = new Map(columnIds.map(id => [id, []]));
  let inbound = new Map(columnIds.map(id => [id, []]));
  for (let edge of forwardEdges) {
    if (!adjacency.has(edge.from) || !indegree.has(edge.to)) continue;
    adjacency.get(edge.from).push(edge.to);
    inbound.get(edge.to).push(edge);
    indegree.set(edge.to, indegree.get(edge.to) + 1);
  }
  let working = new Map(indegree);
  let queue = columnIds.filter(id => working.get(id) === 0);
  let visitedOrder = [];
  while (queue.length) {
    let node = queue.shift();
    visitedOrder.push(node);
    for (let next of adjacency.get(node)) {
      working.set(next, working.get(next) - 1);
      if (working.get(next) === 0) queue.push(next);
    }
  }
  let hasForwardCycle = visitedOrder.length < columnIds.length;
  if (hasForwardCycle) {
    errors.push({ code: 'forward_cycle', detail: 'Forward subgraph G_f contains a cycle.' });
  }

  // Sources = columns with no inbound forward edge.
  let sources = columnIds.filter(id => inbound.get(id).length === 0);

  // Forward reachability from the source set.
  let reachable = new Set();
  let stack = [...sources];
  while (stack.length) {
    let node = stack.pop();
    if (reachable.has(node)) continue;
    reachable.add(node);
    for (let next of adjacency.get(node) ?? []) stack.push(next);
  }

  // (3) Reachability: dead-end non-terminals; unreachable/orphan terminals.
  for (let id of columnIds) {
    let isTerminal = terminals.has(id);
    let outbound = adjacency.get(id) ?? [];
    if (!isTerminal && outbound.length === 0) {
      errors.push({ code: 'dead_end_column', detail: `Non-terminal column "${id}" has no outbound forward edge.` });
    }
    if (isTerminal) {
      if (inbound.get(id).length === 0) {
        errors.push({ code: 'dead_end_column', detail: `Terminal column "${id}" is an orphan (no inbound forward edge).` });
      }
      if (!reachable.has(id)) {
        errors.push({ code: 'unreachable_terminal', detail: `Terminal column "${id}" is not reachable from any source.` });
      }
    }
  }

  // A recovery-classed (kickback) edge into a terminal escapes the P1 hygiene inbound-cut and the P2
  // audit-domination check, both of which scan only forward edges — so a card could reach the close
  // column crossing no hygiene/audit gate while the validator still returns ok. A `rework_authorized`
  // kickback into a `close` column is also semantically invalid (you do not rework INTO done), so
  // reject any recovery-classed edge whose `to` is a terminal.
  for (let edge of classifier.edges) {
    if (edge.edgeClass === 'recovery' && terminals.has(edge.to)) {
      errors.push({ code: 'recovery_edge_into_terminal', detail: `Recovery edge ${edge.from} -> ${edge.to} targets terminal column "${edge.to}"; a kickback into a close column is invalid.` });
    }
  }

  // (2) Per-terminal floor-gate properties.
  for (let terminal of terminals) {
    let inboundEdges = inbound.get(terminal) ?? [];
    // P1 — hygiene inbound edge-cut: every inbound forward edge must be hygiene-gated.
    if (inboundEdges.length > 0 && !inboundEdges.every(edge => edgeIsHygieneGated(edge.gates))) {
      errors.push({ code: 'hygiene_cut_incomplete', detail: `Terminal column "${terminal}" has an inbound forward edge without a hygiene gate.` });
    }
    // P2 — audit domination: every forward path source -> terminal passes an audit-gated edge.
    if (!auditDominatesTerminal(terminal, sources, adjacency, inbound)) {
      errors.push({ code: 'audit_not_dominating', detail: `Audit-gated edges do not dominate terminal column "${terminal}".` });
    }
  }

  return { ok: errors.length === 0, errors, classifier };
}

/**
 * Audit-domination check: does every forward path from any source to `terminal` traverse at least one
 * audit-gated edge? Walk forward edges from the sources but stop descending through audit-gated edges
 * (they satisfy domination on that path). If the terminal is still reachable without crossing an audit
 * gate, domination fails.
 */
function auditDominatesTerminal(terminal, sources, adjacency, inbound) {
  let auditEdgeTargets = new Set();
  for (let [, edges] of inbound) {
    for (let edge of edges) {
      if (edgeIsAuditGated(edge.gates)) auditEdgeTargets.add(`${edge.from}\x00${edge.to}`);
    }
  }
  let reachedWithoutAudit = new Set();
  let stack = sources.filter(id => id !== terminal);
  while (stack.length) {
    let node = stack.pop();
    if (reachedWithoutAudit.has(node)) continue;
    reachedWithoutAudit.add(node);
    if (node === terminal) return false;
    for (let next of adjacency.get(node) ?? []) {
      // Crossing an audit-gated edge satisfies domination on this path; do not descend through it.
      if (auditEdgeTargets.has(`${node}\x00${next}`)) continue;
      stack.push(next);
    }
  }
  return !reachedWithoutAudit.has(terminal);
}

/**
 * One-time forward migration of a card to schema v2 (AD-8). Stamps the v2 schema, fills `lifecycle`
 * (default `idle`) and `dependsOn` (default `[]`) when absent, preserves every other field.
 * Idempotent and pure (no clock dependence beyond the passed-in card).
 */
export function migrateWorkflowCardToV2(card) {
  let source = objectOrEmpty(card);
  return {
    ...source,
    schema: WORKFLOW_CARD_SCHEMA,
    lifecycle: normalizeWorkflowLifecycle(source.lifecycle),
    dependsOn: normalizeWorkflowDependsOn(source.dependsOn ?? source.depends_on),
  };
}

/**
 * One-time forward migration of a board to schema v2 (AD-8, inv 17). Stamps the v2 schema and
 * normalizes columns/transitions to the current shape — FILL-ONLY: a user-customized column or
 * transition value is never overwritten; only missing v2 fields are added. Idempotent.
 */
export function migrateWorkflowBoardToV2(board) {
  let source = objectOrEmpty(board);
  let columns = Array.isArray(source.columns) ? source.columns : [];
  let transitions = Array.isArray(source.transitions) ? source.transitions : [];
  return {
    ...source,
    schema: WORKFLOW_BOARD_SCHEMA,
    columns: columns.map(column => ({
      ...column,
      automation: { ...objectOrEmpty(column?.automation) },
    })),
    transitions: transitions.map(transition => ({
      ...transition,
      gates: textArray(transition?.gates ?? transition?.gate),
    })),
  };
}
