import crypto from 'node:crypto';
import { execFile, execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  checkPassed,
  classifyWorkflowGraph,
  DEFAULT_WORKFLOW_BOARD_ID,
  createDefaultWorkflowBoard,
  evaluateWorkflowTransitionGates,
  hasActiveEscalation,
  normalizeRecoveryFlags,
  normalizeWorkflowEscalation,
  normalizeWorkflowEscalationState,
  normalizeWorkflowBoardAutomation,
  normalizeWorkflowBoardMode,
  evaluateWorkflowBoardBudget,
  evaluateRootConvergence,
  summarizeRealizationByRoot,
  normalizeWorkflowCardInput,
  normalizeWorkflowChecksInput,
  normalizeWorkflowDependsOn,
  normalizeWorkflowLeaseInput,
  normalizeWorkflowLifecycle,
  normalizeWorkflowRunInput,
  normalizeWorkflowAutomation,
  normalizeColumnEntryPoint,
  normalizeWorkflowSubscription,
  isFloorGateMonotonic,
  isWorkflowLifecycleTransitionAllowed,
  migrateWorkflowBoardToV2,
  migrateWorkflowCardToV2,
  normalizeWorkflowReturnEvent,
  normalizeWorkflowComment,
  appendCardComment,
  coalesceReturnEvents,
  isWakeDrivingReturn,
  normalizeWorkflowTransitionEvent,
  normalizeWorkflowTransitionRequest,
  validateWorkflowTransitionGraph,
  createWorkflowBoard,
  isKnownWorkflowGate,
  listWorkflowGateIds,
  isKnownWorkflowAction,
  workflowActionIsExecution,
  workflowActionHoldsPendingChange,
  applyAutonomyLevel as applyAutonomyLevelToBoard,
  WORKFLOW_COLUMN_ACTIONS,
} from '../iso/workflow-board.js';
import { parseMarkdownFrontmatter } from './agents/frontmatter.js';
import { prepareDelegateTaskCall } from './proxy/chat-delegate-routing.js';
import {
  cardWorktreeRoot,
  commitWorktree,
  isGitRepo,
  mergeWorktree,
  provisionWorktree,
  reapOrphanWorktrees,
  removeWorktree,
} from './workflow-worktree.js';
import { CAP, daemonPrincipal, derivePrincipal, evaluateIntent, INTENT_CAPABILITY } from './server/principal.js';
import { getStateGraph } from './state-graph.js';
import { getTeamMemoryRoot } from '../../packages/agent-pool-mcp/src/runtime/paths.js';

const WORKFLOW_SOURCE = 'workflow-board';
const DEFAULT_EVENT_LIMIT = 50;
const MAX_EVENT_LIMIT = 200;
const COMPACT_CARD_LIMIT = 20;
const COMPACT_EVENT_LIMIT = 8;
const COMPACT_ACTIVE_COLUMN_IDS = new Set([
  'ready',
  'in-progress',
  'quality-audit',
  'commit-publish',
]);
const DEFAULT_LEASE_TTL_MS = 30 * 60 * 1000;
const DEFAULT_RUNTIME_HEARTBEAT_FRESHNESS_MS = 10 * 60 * 1000;
// Liveness watchdog: an active run with no runtime-task activity within this window is treated as a
// dead/phantom run (worker crashed, was killed externally, or agent-pool lost it) and reconciled to a
// resumable terminal status. Generous vs. the 10-min freshness window so a slow-but-live worker (which
// still streams events periodically) is never falsely reaped; tighter than the 30-min lease TTL.
const DEFAULT_RUNTIME_STALE_RUN_MS = 15 * 60 * 1000;
const DEFAULT_RECONCILE_TICK_MS = 60 * 1000;
// Edge-trigger debounce: a burst of agent-pool task events collapses into one near-immediate reconcile.
const DEFAULT_RECONCILE_TRIGGER_GAP_MS = 1000;
// Escalation channel: the re-engagement loop owns attempt accrual + backoff. ESCALATION_ACTOR
// labels channel-driven transitions/runs for board visibility. The cap bounds the loop — after
// this many re-engagements without a completed run the card is handed to a human (blocked + a
// precise question). Backoff is exponential off this base.
const ESCALATION_ACTOR = 'escalation-channel';
const DEFAULT_ESCALATION_MAX_ATTEMPTS = 3;
const DEFAULT_ESCALATION_BACKOFF_MS = 5 * 60 * 1000;
// Audit return-loop backstop: after this many CONSECUTIVE verdict-less / failed audits — each one
// returning the card to the orchestrator to re-route — the card is parked for an explicit human
// decision (a `needs_human` escalation → the needs-decision column) instead of being re-routed again.
// The counter lives on `card.metadata.reworkCycles` so it survives the re-execution run that would
// otherwise clear `metadata.escalation`; it resets the moment an audit actually passes. Without it a
// card could cycle audit → orchestrator → audit forever, never reaching the human/reject backstop.
const DEFAULT_AUDIT_REWORK_LIMIT = 3;
const ESCALATION_RESULT_PATTERN = /WORKFLOW_RESULT:\s*([a-z_]+)/i;
const ESCALATION_KIND_PATTERN = /ESCALATION_KIND:\s*([a-z_]+)/i;
const ESCALATION_DETAIL_PATTERN = /ESCALATION_DETAIL:\s*(.+)/i;
const ESCALATION_SUGGESTION_PATTERN = /ESCALATION_SUGGESTION:\s*(.+)/i;
// Human-decision button choices for a `needs_human` ask, pipe-separated (e.g. `a | b | c`). The
// orchestrator emits these so the inspector renders the question as buttons; free text is always allowed.
const ESCALATION_OPTIONS_PATTERN = /ESCALATION_OPTIONS:\s*(.+)/i;
const ESCALATION_LANE_PATTERN = /ESCALATION_LANE:\s*(.+)/i;
// Intermediate-return marker: a worker emits `WORKFLOW_RETURN: <kind>` (optionally trailed by a JSON
// object) in its final message/output, mirroring how escalation markers are emitted. The reconcile
// folds the parsed return into the per-card inbox (card.metadata.returns) — see computeIntermediateReturn.
const RETURN_MARKER_PATTERN = /WORKFLOW_RETURN:\s*([a-z_]+)\s*(\{[\s\S]*\})?/i;
// Bump to force refreshDefaultBoardPolicy to re-run its fill-only merge on every existing default
// board once — v6 self-heals a column automation gap (e.g. a `quality-audit` that lost its `action`
// to an older normalizer or a clobbered snapshot) so the on-enter audit and the autonomous release
// tail resolve their columns by action again. v8 renames the legacy `ready` title 'Tasks / Ready'
// (read as a status) to 'Tasks' — it is the task queue. v9 materializes the autonomy "volume slider":
// it stamps automation.autonomyLevel (default 5) and cascades the level preset to per-column
// autoAdvance/mode + board publishMode so the live board surfaces the level on its projection.
const DEFAULT_WORKFLOW_POLICY_VERSION = 10;
// Persisted board/card schema version. The iso normalizers are always-forward, so a single
// one-time sweep (ensureWorkflowSchemaMigrated) rewrites every persisted board + card to v2 once;
// no read-time `schema === 'v1'` branch ever exists. The durable `workflowSchema` marker guards it.
const WORKFLOW_SCHEMA_VERSION = 2;
const RUNNING_RUN_STATUSES = new Set(['requested', 'running', 'recovering']);
// Execution-class column actions: a card in a column with one of these actions can carry an
// in-flight run that needs recovery (orchestrate/execute/audit/publish each spawn or require a
// run). The passive intake/close actions (classify/scope/close) never strand a run.
const EXECUTION_COLUMN_ACTIONS = new Set(WORKFLOW_COLUMN_ACTIONS.filter(workflowActionIsExecution));
// Columns whose action implies a card may hold UNCOMMITTED working-tree changes still pending
// advance/audit/commit — there a TERMINAL run legitimately reserves file scope so a peer cannot clobber
// the produced changes. `orchestrate` (pre-execution / `ready`) is intentionally absent: a card sitting
// there has not started its current cycle, so a stale terminal run from a prior cycle must NOT reserve
// files (else same-file rework returns piled into `ready` mutually deadlock).
const PENDING_CHANGE_COLUMN_ACTIONS = new Set(WORKFLOW_COLUMN_ACTIONS.filter(workflowActionHoldsPendingChange));
const TASK_ERROR_STATUSES = new Set(['lost', 'stale', 'error', 'failed', 'cancelled']);
const RUNTIME_DONE_STATUSES = new Set(['done', 'finished', 'complete', 'completed', 'success']);
const RUNTIME_READY_STATUSES = new Set(['queued', 'pending', 'requested', 'created']);
const RUNTIME_RUNNING_STATUSES = new Set(['running', 'active', 'started', 'streaming']);
const TERMINAL_RUN_STATUSES = new Set(['completed', 'error', 'failed', 'cancelled', 'stopped']);
const KNOWN_WORKFLOW_PROOF_MARKERS = ['COMPLETION_PROOF', 'RELEASE_AUTH_PACKET'];
const PROOF_MARKER_PATTERN = /\b([A-Z][A-Z0-9_]{2,})\s*:\s*(?:\*|PASS|FAIL)(?=$|[^A-Z0-9_])/g;
// Floor check keys (inv 33): the concrete `workflowChecks` keys consumed by the audit/hygiene
// floor gates (audit_pass_or_explicit_waiver / clean_diff_and_hygiene). Writing any of these is a
// separated-duty signature — it requires AUDIT (intent checks.write.floor), never plain WRITE_CARD.
const FLOOR_CHECK_KEYS = new Set([
  'audit',
  'auditWaiver',
  'cleanDiff',
  'hygiene',
  'publicHygiene',
  'packageHygiene',
]);
// Card rights fields (inv 13): mutating any of these is policy authorship (intent policy.author),
// gated by AUTHOR. A non-author write is held for approval and the field is dropped from the patch.
const CARD_RIGHTS_FIELDS = ['approvalMode', 'resourceGroup', 'assignedAgent', 'proposedLane'];
// ── Scheduler / admission constants (WS-B1, v5 Decision 1) ──────────────────────────────────────
// The board-admission lease (D1.5) is short-lived with a heartbeat; it is DISTINCT from the 30-min
// per-card work lease (DEFAULT_LEASE_TTL_MS). One admitter per board holds it across a drain pass.
const ADMISSION_LEASE_TTL_MS = 15 * 1000;
const ADMISSION_LEASE_HEARTBEAT_MS = 5 * 1000;
// inv 44 (v5): ADMISSION_INFLIGHT_GRACE_MS >= board_lease_TTL + heartbeat + worst_case_delegate +
// clock_skew, measured on WALL-clock (cross-process post-restart cannot trust a monotonic clock).
// 15s TTL + 5s heartbeat + 600s worst-case delegate (the delegate_task spawn budget) + 30s skew
// = 650s. A live-but-slow admitter inside this window is never reclaimed; reclaim also requires the
// lease epoch to be stale (a newer holder bumped it), so a healthy heartbeating admitter is safe.
const ADMISSION_LEASE_TTL_BUDGET_MS = ADMISSION_LEASE_TTL_MS;
const ADMISSION_WORST_CASE_DELEGATE_MS = 600 * 1000;
const ADMISSION_CLOCK_SKEW_MS = 30 * 1000;
const ADMISSION_INFLIGHT_GRACE_MS = ADMISSION_LEASE_TTL_BUDGET_MS
  + ADMISSION_LEASE_HEARTBEAT_MS
  + ADMISSION_WORST_CASE_DELEGATE_MS
  + ADMISSION_CLOCK_SKEW_MS;
// Bounded admission budget per drain pass (inv 5: serial recount, no unbounded loop).
const DEFAULT_DRAIN_BUDGET = 32;
// Priority enum → ordinal for the fairness comparator (higher = admitted first; inv 6).
const WORKFLOW_PRIORITY_ORDER = { critical: 3, high: 2, normal: 1, low: 0 };
// Max time a card may sit `blocked` on an unsatisfied dependency before the release/reconcile tick
// escalates it to a typed `needs_decision` (inv 24: never a silent permanent block). The blocked-age
// clock is `card.metadata.dependencyBlock.blockedAt`, stamped when the dependency path blocks it.
const MAX_BLOCKED_AGE_MS = 24 * 60 * 60 * 1000;
// Default stale/aging budget (Axis C): max wall-clock a worked card may OCCUPY a non-terminal column
// after its run ends before the reconcile/drain tick escalates it to a typed `needs_decision`. This is
// the occupancy-aging counterpart of MAX_BLOCKED_AGE_MS — independent of the dependency-block clock —
// covering the gap where a card finished its run but was never advanced and ages silently. The clock
// is `card.metadata.enteredColumnAt` (stamped by the card normalizer on every column change). A
// per-column `automation.staleAgeMs` overrides this; an explicit 0 disables aging for that column.
// 1h, not 24h: on an autonomous board a card that finished its run and then sat in a non-terminal
// column without being advanced (no active escalation, no live run) is stuck — it should reach a human
// in the decision lane within the hour, not idle for a day. escalateStaleCards skips cards in escalation
// backoff or with a live run, so this only fires on genuinely-wedged work.
const DEFAULT_COLUMN_STALE_AGE_MS = 60 * 60 * 1000;

function priorityOrdinal(priority) {
  let key = textOrNull(priority);
  if (key && Object.hasOwn(WORKFLOW_PRIORITY_ORDER, key)) return WORKFLOW_PRIORITY_ORDER[key];
  return WORKFLOW_PRIORITY_ORDER.normal;
}

// Inverse of priorityOrdinal: map an ordinal back to its label (used to lift a synthetic join card's
// priority to the max member ordinal). An out-of-range ordinal collapses to `normal`.
function priorityLabel(ordinal) {
  let entry = Object.entries(WORKFLOW_PRIORITY_ORDER).find(([, value]) => value === ordinal);
  return entry ? entry[0] : 'normal';
}

// Deterministic code-unit string comparison (inv 6): locale-independent so the admission order is
// restart-stable across hosts, unlike `localeCompare` whose collation varies by ICU/locale.
function compareCodeUnits(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

// Deterministic, reconstructable admissionId (AD-2 / D1.1): a stable hash of the immutable enqueue
// identity. The same (boardId, cardId, enqueuedAt, queueEpoch) always yields the same id, so a
// re-drive under a new lease epoch produces the SAME admissionId — the ledger and agent-pool dedup
// on it, so zero extra reservations and zero extra spawns (inv 41).
function computeAdmissionId(boardId, cardId, enqueuedAt, queueEpoch) {
  let material = JSON.stringify([
    textOrNull(boardId) ?? '',
    textOrNull(cardId) ?? '',
    Number(enqueuedAt) || 0,
    Number(queueEpoch) || 0,
  ]);
  return `adm-${crypto.createHash('sha256').update(material).digest('hex').slice(0, 24)}`;
}

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

function finiteNumber(value) {
  let number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function latestTimestamp(values = []) {
  let timestamps = values
    .map(value => Number(value))
    .filter(Number.isFinite);
  return timestamps.length ? Math.max(...timestamps) : null;
}

function compactText(value, max = 220) {
  let text = textOrNull(value);
  if (!text || text.length <= max) return text;
  return `${text.slice(0, max - 3)}...`;
}

function nextId(makeId, prefix) {
  if (makeId) return makeId(prefix);
  return `${prefix}-${crypto.randomUUID().slice(0, 12)}`;
}

function sourceForPrincipal(principal) {
  let suffix = textOrNull(principal?.label);
  return suffix ? `${WORKFLOW_SOURCE}:${suffix}` : WORKFLOW_SOURCE;
}

function isPrincipal(value) {
  return Boolean(value && typeof value === 'object' && typeof value.label === 'string'
    && Array.isArray(value.capabilities));
}

function formatControlAction(value = '') {
  let text = textOrNull(value) ?? '';
  return text
    .split(/[-_:/]+/)
    .filter(Boolean)
    .map(part => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(' ') || 'Control';
}

function workflowBoardCliFallback(projectRoot) {
  let cliPath = process.env.AGENT_PORTAL_CLI_PATH
    || path.resolve(import.meta.dirname, '../../bin/mcp-agent-portal.js');
  return `node ${JSON.stringify(cliPath)} call workflow_board '<json-args>' --project ${JSON.stringify(projectRoot)}`;
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

// Drop nullish (undefined/null) own-values so a fill-only merge cannot have a default clobbered by a
// stored gap. `false`/`0`/`''` are real configured values and are preserved.
function definedOnly(value) {
  let source = asObject(value);
  let out = {};
  for (let key of Object.keys(source)) {
    if (source[key] !== undefined && source[key] !== null) out[key] = source[key];
  }
  return out;
}

function textArray(value) {
  let source = Array.isArray(value) ? value : (value === undefined || value === null ? [] : [value]);
  return [...new Set(source.map(textOrNull).filter(Boolean))];
}

function uniqueArray(items = []) {
  return [...new Set(items.map(textOrNull).filter(Boolean))];
}

function cardFileScope(card = {}, args = {}) {
  return uniqueArray([
    ...textArray(args.files ?? args.filePaths ?? args.file_paths),
    ...textArray(card.files),
    ...textArray(card.entityRefs?.files),
    ...textArray(card.metadata?.files),
  ]);
}

// Specialty map for stage-agent selection, expressed as data so a host can extend it without
// touching the scorer. Each rule scores a slug when a card's files match a path pattern, its
// `domain` matches, or one of its `routingHints` matches. Path signal outweighs hint/domain so a
// concrete file scope wins over a coarse label. A card with no signal scores 0 against every rule,
// which lets the caller fall back to the connected pool's first agent.
export const DEFAULT_STAGE_AGENT_SPECIALTIES = [
  {
    slug: 'ui-engineer',
    paths: [/(^|\/)symbiote-ui(\/|$)/i, /(^|\/)ui(\/|$)/i, /\.(css|html)$/i, /web-?components?/i],
    domains: ['ui', 'frontend', 'web', 'design'],
    hints: ['ui', 'css', 'component', 'web', 'frontend', 'theme'],
  },
  {
    slug: 'provider-engineer',
    paths: [/(^|\/)provider/i, /(^|\/)engine(\/|$)/i, /\.driver(\.|$)/i, /(^|\/)(manifest|tokens)(\.|\/|$)/i],
    domains: ['provider', 'engine', 'driver'],
    hints: ['provider', 'engine', 'driver', 'manifest', 'tokens'],
  },
  {
    slug: 'tooling-engineer',
    paths: [/(^|\/)packages\/[^/]+-mcp(\/|$)/i, /(^|\/)scripts(\/|$)/i, /\.config\./i, /(^|\/)proxy(\/|$)/i, /(^|\/)mcp(\/|$)/i],
    domains: ['tooling', 'mcp', 'build', 'infra'],
    hints: ['tooling', 'mcp', 'build', 'proxy', 'script', 'infra'],
  },
  {
    slug: 'backend-engineer',
    paths: [/(^|\/)src\/node(\/|$)/i, /(^|\/)server(\/|$)/i, /(^|\/)src\/iso(\/|$)/i],
    domains: ['backend', 'server', 'node', 'service'],
    hints: ['backend', 'server', 'node', 'service', 'api'],
  },
];

const STAGE_AGENT_PATH_WEIGHT = 3;
const STAGE_AGENT_DOMAIN_WEIGHT = 2;
const STAGE_AGENT_HINT_WEIGHT = 1;

// Pure, deterministic specialty score for one slug against a card's domain/files/routingHints. Only
// the rule whose slug matches contributes; an unknown slug (no rule) scores 0. Higher is a better fit.
export function scoreStageAgent(slug, card = {}, files = [], specialties = DEFAULT_STAGE_AGENT_SPECIALTIES) {
  let target = textOrNull(slug);
  if (!target) return 0;
  let rule = specialties.find((entry) => entry.slug === target);
  if (!rule) return 0;
  let domain = textOrNull(card.domain)?.toLowerCase() ?? null;
  let hints = textArray(card.routingHints).map((h) => h.toLowerCase());
  let scope = uniqueArray(files);
  let score = 0;
  for (let file of scope) {
    if ((rule.paths ?? []).some((pattern) => pattern.test(file))) score += STAGE_AGENT_PATH_WEIGHT;
  }
  if (domain && (rule.domains ?? []).includes(domain)) score += STAGE_AGENT_DOMAIN_WEIGHT;
  for (let hint of hints) {
    if ((rule.hints ?? []).includes(hint)) score += STAGE_AGENT_HINT_WEIGHT;
  }
  return score;
}

// Choose the best-fitting slug from a connected pool by specialty score. Returns null when no slug
// scores above zero so the caller can apply its own fallback. Ties resolve to pool order (the first
// connected agent), keeping selection deterministic.
export function pickStageAgentFromPool(pool = [], card = {}, files = [], specialties = DEFAULT_STAGE_AGENT_SPECIALTIES) {
  let best = null;
  let bestScore = 0;
  for (let slug of pool) {
    let score = scoreStageAgent(slug, card, files, specialties);
    if (score > bestScore) {
      best = slug;
      bestScore = score;
    }
  }
  return best;
}

// Scratch/junk/secret-bearing path patterns that must never reach a published changeset. A release
// probe that finds any of these in the worktree fails the hygiene floor rather than shipping it.
const HYGIENE_OFFENDER_PATTERNS = [
  /(^|\/)\.env(\.|$)/i,
  /\.(pem|key|p12|pfx)$/i,
  /(^|\/)id_(rsa|ed25519|ecdsa|dsa)(\.|$)/,
  /(^|\/)(tmp|scratch|sandbox|\.scratch)(\/|$)/i,
  /\.(log|tmp|bak|orig|swp|swo)$/i,
  /(^|\/)[^/]+\.(tar|tar\.gz|tgz|zip)$/i,
  /(^|\/)\.DS_Store$/,
];

// Parse one `git status --porcelain` v1 line into its path. The format is two status chars + a
// space (3-char prefix) then the path; a rename is `orig -> dest`, so the destination is the path
// that actually lands in the tree.
function porcelainPath(line) {
  let body = line.slice(3);
  let arrow = body.lastIndexOf(' -> ');
  return (arrow === -1 ? body : body.slice(arrow + 4)).trim();
}

// A real working-tree probe for the autonomous release tail — the daemon's substitute for an
// independent human's clean-diff/hygiene sign-off. Runs read-only git in the card's working
// directory and reports whether there is a non-empty, junk-free changeset to ship. Fail-safe: a
// missing / non-git / unreadable cwd yields `{ available: false }` so the caller fails CLOSED (holds
// the card) instead of fabricating a pass. Never mutates the repo (status only).
function probeReleaseGate(cwd) {
  let dir = textOrNull(cwd);
  if (!dir) return { available: false, reason: 'card has no working directory to probe' };
  let runGit = (args) => execFileSync('git', args, {
    cwd: dir, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 5000,
  });
  try {
    runGit(['rev-parse', '--is-inside-work-tree']);
  } catch {
    return { available: false, reason: `not a git work tree: ${dir}` };
  }
  let porcelain;
  try {
    porcelain = runGit(['status', '--porcelain']);
  } catch (err) {
    return { available: false, reason: `git status failed: ${err.message}` };
  }
  let changedPaths = porcelain.split('\n').filter(Boolean).map(porcelainPath).filter(Boolean);
  let offenders = changedPaths.filter(p => HYGIENE_OFFENDER_PATTERNS.some(re => re.test(p)));
  let changedFiles = changedPaths.length;
  return {
    available: true,
    changedFiles,
    changedPaths,
    offenders,
    hasDiff: changedFiles > 0,
    hygiene: offenders.length === 0,
    reason: changedFiles === 0
      ? 'working tree has no diff to ship'
      : offenders.length
        ? `hygiene offenders in worktree: ${offenders.join(', ')}`
        : `${changedFiles} changed path(s), no hygiene offenders`,
  };
}

// Documentation/prose paths whose change cannot affect the unit suite.
const DOC_PATH_PATTERN = /\.(md|markdown|mdx|txt|rst|adoc)$/i;

// Does a card's changeset include anything the unit suite could verify? The unit-test release gate is
// only meaningful for code; a docs/prose-only change (e.g. a new `docs/*.md`) has nothing for the suite
// to catch, so running the full, load-sensitive suite would only risk a FALSE hold under the live
// board's CPU contention. Conservative/fail-safe: an unreadable or non-doc changeset keeps the gate. The
// clean-diff + hygiene floor still gate every change regardless.
function changesetTouchesCode(cwd) {
  let probe = probeReleaseGate(cwd);
  if (!probe.available || !probe.changedPaths.length) return true;
  return !probe.changedPaths.every(p => DOC_PATH_PATTERN.test(p) || p.startsWith('docs/'));
}

// Real test verification for the release gate (proof-contract: ship only what passes). The audit run's
// self-reported PASS marker is NOT trusted on its own — the project's unit suite is actually run against
// the (still uncommitted) work before it advances to the commit stage. Fail-closed: a failing or
// timed-out run blocks the advance. A project with no unit-test script is "nothing to verify"
// (available:false), so it is not blocked. Async + non-blocking (execFile, never execFileSync) so the
// reconcile awaits the child without freezing the event loop or the ownership heartbeat.
async function probeReleaseTests(cwd) {
  let dir = textOrNull(cwd);
  if (!dir) return { available: false, reason: 'no working directory to verify' };
  let script;
  try {
    let pkg = JSON.parse(await fs.readFile(path.join(dir, 'package.json'), 'utf-8'));
    script = pkg?.scripts?.['test:unit'] ? 'test:unit' : (pkg?.scripts?.test ? 'test' : null);
  } catch {
    return { available: false, reason: 'no readable package.json to verify' };
  }
  if (!script) return { available: false, reason: 'no test script to verify' };
  // Run the gate suite in an ISOLATED state environment. A release gate must never touch the live
  // ~/.agent-portal snapshot: a test that builds an ownership-guarded StateGraph on the real state path
  // would claim the single-writer token, make THIS backend see `ownership-lost` and exit — a
  // self-inflicted restart-churn storm (the gate killing the server that launched it). Strip
  // PORTAL_BACKEND (no ownership guard in spawned test StateGraphs) and redirect every state + gateway
  // path to a throwaway temp dir so the run cannot read, write, or contend the production state.
  let isoDir = await fs.mkdtemp(path.join(os.tmpdir(), 'portal-release-test-'));
  let env = { ...process.env, PORTAL_STATE_DIR: isoDir, PORTAL_LOCAL_GATEWAY_DIR: isoDir };
  delete env.PORTAL_BACKEND;
  delete env.PORTAL_STATE_PATH;
  return await new Promise((resolve) => {
    let done = (result) => { fs.rm(isoDir, { recursive: true, force: true }).catch(() => {}); resolve(result); };
    execFile('npm', ['run', '--silent', script], {
      cwd: dir, timeout: 300_000, maxBuffer: 64 * 1024 * 1024, env,
    }, (err, stdout, stderr) => {
      if (err && err.code === 'ENOENT') return done({ available: false, reason: 'npm unavailable' });
      let out = `${stdout || ''}\n${stderr || ''}`;
      let failMatch = out.match(/^# fail (\d+)/m);
      let passMatch = out.match(/^# pass (\d+)/m);
      let failing = failMatch ? Number(failMatch[1]) : null;
      let timedOut = Boolean(err && err.killed);
      // Fail-closed: a non-zero exit (incl. timeout) OR a parsed failing-count > 0 fails the gate.
      let passed = !err && (failing === null || failing === 0);
      done({
        available: true,
        passed,
        failing,
        passing: passMatch ? Number(passMatch[1]) : null,
        reason: passed
          ? `unit tests passed${passMatch ? ` (${passMatch[1]})` : ''}`
          : timedOut ? 'unit tests timed out'
            : `unit tests failed${failing != null ? ` (${failing} failing)` : ''}`,
      });
    });
  });
}

function normalizeScopePath(value) {
  let text = textOrNull(value);
  if (!text) return null;
  let normalized = text.replace(/\\/g, '/').replace(/\/+$/g, '');
  return normalized.replace(/^\.\//, '');
}

function fileScopesOverlap(left = '', right = '') {
  let a = normalizeScopePath(left);
  let b = normalizeScopePath(right);
  if (!a || !b) return false;
  return a === b || a.startsWith(`${b}/`) || b.startsWith(`${a}/`);
}

function firstText(value) {
  return textArray(value)[0] ?? null;
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

// A delegate failure is a CAPACITY rejection (no slot granted; the scheduler re-queues) iff its
// message is the agent-pool slot-ledger at-capacity / ledger-busy signal. Any other delegation
// error is a hard failure that surfaces as a failed run rather than looping in the admission queue.
function isCapacityRejectionError(message) {
  let text = textOrNull(message);
  if (!text) return false;
  return /at capacity|group_at_capacity|host_at_capacity|ledger_busy|ledger_error/i.test(text);
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
  // A terminal-failed / lost ORPHAN runtime task (no linked workflow card) is runtime debris — a dead
  // task left over from a crashed or externally-killed worker. Project it into the reject terminal
  // (discarded) so it is visibly resolved instead of piling up forever in the active quality-audit lane.
  if (TASK_ERROR_STATUSES.has(status)) return 'rejected';
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
    reconcileTickMs = DEFAULT_RECONCILE_TICK_MS,
    // A swallowed reconcile exception silently stops a whole self-healing stage while the board keeps
    // ticking and looks healthy. Surface it by default; the host may override with structured logging.
    onReconcileTickError = (err, boardId) => {
      console.error(`[workflow-board] reconcile tick failed for board ${boardId ?? '?'}:`, err?.stack || err);
    },
    // Release-gate test verification (proof-contract). Injectable so the unit harness can stub it
    // instead of spawning a real `npm` subprocess; defaults to the module-level probe.
    probeReleaseTests: runReleaseTests = probeReleaseTests,
    // Trusted-embedder seam. `defaultPrincipal` is the committing identity for direct,
    // in-process callers (and the unit-test harness) that do not flow through the HTTP/MCP
    // seams. PRODUCTION wiring (web-server routes, MCP tool handler) never sets it, so the
    // seam-derived `context.principal` stays authoritative and an unauthenticated request
    // still fail-closes to anonymous (inv 45 preserved). It is NOT a way to grant rights to
    // an untrusted caller — only an embedder that already owns the process supplies it.
    defaultPrincipal = null,
    // Where per-card worktrees are checked out. Defaults under the repo's .git dir (untracked, durable,
    // invisible to the main working tree's `git status`). Overridable so the unit harness can point it
    // at a throwaway repo.
    worktreeRoot = cardWorktreeRoot(projectRoot),
    // Worktree git ops seam — injectable so service-level tests stub the lifecycle instead of driving
    // real git. Production uses the real module against the project repo.
    worktreeOps = { isGitRepo, provisionWorktree, commitWorktree, mergeWorktree, removeWorktree, reapOrphanWorktrees },
    // Specialty map that biases per-card stage-agent selection toward the best-fitting connected
    // agent. Data-driven and overridable so a host can extend the heuristics without forking the scorer.
    stageAgentSpecialties = DEFAULT_STAGE_AGENT_SPECIALTIES,
  } = opts;
  if (!stateGraph) {
    throw new Error('Workflow board service requires a StateGraph instance.');
  }
  // Memoized per-repo "is this a git work tree?" check (isolation requires one). Resolves once per
  // base repo for the life of the service instead of spawning git on every dispatch.
  let gitRepoChecks = new Map();
  function repoIsGit(repoRoot) {
    if (!gitRepoChecks.has(repoRoot)) gitRepoChecks.set(repoRoot, Promise.resolve(worktreeOps.isGitRepo(repoRoot)));
    return gitRepoChecks.get(repoRoot);
  }

  // ── Per-card worktree isolation ──────────────────────────────────────────────────────────────────
  // Isolation is an autonomous-mode feature: it is the mode that also commits and merges a card's work
  // back to base without a human, so the worktree lifecycle (provision → commit → merge → remove) is
  // owned by the same autonomous policy. In any other mode the board keeps the shared-working-tree model
  // (a human commits), so no worktree is provisioned. Opt out per board via automation.worktreeIsolation.
  function worktreeIsolationEnabled(board) {
    if (board?.mode !== 'autonomous') return false;
    return normalizeWorkflowBoardAutomation(board?.automation).worktreeIsolation !== false;
  }

  function cardColumnAction(board, card) {
    let columns = Array.isArray(board?.columns) ? board.columns : [];
    return textOrNull(columns.find(col => col.id === card?.columnId)?.automation?.action);
  }

  // The persisted worktree record for a card, if it owns one.
  function cardWorktree(card) {
    let wt = card?.metadata?.worktree;
    return wt && textOrNull(wt.path) ? wt : null;
  }

  // Does this card currently run in its own isolated worktree? (true once provisioned, until merged.)
  function cardIsIsolated(card) {
    return Boolean(cardWorktree(card));
  }

  // The filesystem repo of the project a card belongs to, resolved from the persisted `projects/<id>`
  // record's `path`. This is the single hook a card with a `projectId` but no explicit `cwd` uses to
  // reach its own repo: per-project isolation is driven by `card.cwd` captured at intake, and this
  // backstops the case where only the project id travelled. Returns null when the id is absent or has
  // no registered path, so `cardBaseRepo` falls through to the board's project root unchanged.
  function resolveRepoForProject(projectId) {
    let id = textOrNull(projectId);
    if (!id) return null;
    return textOrNull(stateGraph.get(`projects/${id}`)?.path);
  }

  // The base repo a card's worktree is cut from: the repo captured at first provision, else the card's
  // explicit cwd (an external project), else its project's registered repo, else the board's project root.
  function cardBaseRepo(card) {
    return textOrNull(card?.metadata?.worktree?.repoRoot)
      ?? textOrNull(card?.cwd)
      ?? resolveRepoForProject(card?.projectId)
      ?? projectRoot;
  }

  // The working directory a card's runs / release-gate probes execute in: its worktree when isolated,
  // else its explicit cwd, else the project root. Single source of truth for "where does this card run".
  function cardWorkingDir(card) {
    return textOrNull(card?.metadata?.worktree?.path) || textOrNull(card?.cwd) || projectRoot;
  }

  // Persist (or clear) the worktree record on a card. A shallow StateGraph merge replaces `metadata`
  // wholesale, so the full metadata object is written; the live `card` is mutated in place so the
  // caller sees the update without a re-read.
  function persistCardMetadata(card, mutate) {
    let latest = getCard(card.id) ?? card;
    let metadata = { ...asObject(latest.metadata) };
    mutate(metadata);
    stateGraph.merge(`workflowCards/${card.id}`, { metadata }, WORKFLOW_SOURCE);
    card.metadata = metadata;
    return metadata;
  }

  // Provision (or reuse) a worktree for a card about to run a file-mutating stage. Returns the worktree
  // record, or null when isolation does not apply (non-autonomous, non-git, or a non-mutating stage).
  // A provision failure degrades transparently: it is RECORDED on the card (metadata.worktreeError) and
  // the card falls back to the shared tree — never silently, and never blocking the run.
  // Where a card's worktrees live for a given base repo: the injectable service root for the project
  // repo (so the unit harness can redirect it), else that repo's own .git-local root.
  function worktreeRootFor(repoRoot) {
    return repoRoot === projectRoot ? worktreeRoot : cardWorktreeRoot(repoRoot);
  }

  async function ensureCardWorktree(card, board) {
    if (!worktreeIsolationEnabled(board)) return null;
    let existing = cardWorktree(card);
    // Provision for ANY execution-class stage (orchestrate/execute/audit/publish), not just the
    // pending-change ones: in the default board the work-doing run is dispatched while the card is still
    // in the `orchestrate` column (it moves the card to in-progress as a side effect), so gating on
    // pending-change only would run the actual file edits in the shared tree and leave the worktree
    // empty. A pure-routing orchestrator that only decomposes gets an unused worktree the reaper cleans.
    if (!existing && !EXECUTION_COLUMN_ACTIONS.has(cardColumnAction(board, card))) return null;
    let repoRoot = cardBaseRepo(card);
    if (!(await repoIsGit(repoRoot))) return null;
    let prov = await worktreeOps.provisionWorktree({ repoRoot, worktreeRoot: worktreeRootFor(repoRoot), cardId: card.id });
    if (!prov.ok) {
      persistCardMetadata(card, (m) => { m.worktreeError = { reason: prov.error, at: now() }; });
      onReconcileTickError(new Error(`worktree provision failed for ${card.id}: ${prov.error}`), board?.id);
      return null;
    }
    let record = {
      path: prov.path,
      branch: prov.branch,
      baseRef: prov.baseRef,
      baseSha: prov.baseSha,
      repoRoot,
      provisionedAt: existing?.provisionedAt ?? now(),
    };
    persistCardMetadata(card, (m) => { m.worktree = record; delete m.worktreeError; });
    return record;
  }

  // Reclaim worktrees that should no longer exist. Two sources: (1) a TERMINAL card (reject/done) still
  // holding a worktree pointer — its work is finished or discarded, so remove the tree + branch and clear
  // the pointer (this is the reject path, and the safety net for a done card whose merge cleanup did not
  // run); (2) a worktree on the project repo whose card was DELETED outright, leaving no metadata to drive
  // (1) — swept by branch prefix against the set of cards that may still legitimately own one. Best-effort
  // and idempotent; runs each drive pass. A still-RUNNING terminal card is left alone until its run ends.
  async function reconcileWorktreeCleanup(board) {
    if (!worktreeIsolationEnabled(board)) return { removed: [], reaped: [] };
    let classifier = classifyWorkflowGraph(board);
    let cards = Object.values(getCollection(stateGraph, 'workflowCards')).filter(c => c.boardId === board.id);
    let isRunning = (id) => getRunsForCard(id).some(run => RUNNING_RUN_STATUSES.has(run.status));
    let removed = [];
    for (let card of cards) {
      let wt = cardWorktree(card);
      if (!wt || !classifier.isTerminal(card.columnId) || isRunning(card.id)) continue;
      await worktreeOps.removeWorktree({
        repoRoot: wt.repoRoot ?? cardBaseRepo(card), worktreePath: wt.path, branch: wt.branch,
      });
      persistCardMetadata(card, (m) => { delete m.worktree; });
      removed.push({ cardId: card.id, branch: wt.branch });
    }
    let liveCardIds = new Set(cards
      .filter(c => !classifier.isTerminal(c.columnId) || isRunning(c.id))
      .map(c => c.id));
    let reaped = [];
    if (await repoIsGit(projectRoot)) {
      reaped = await worktreeOps.reapOrphanWorktrees({ repoRoot: projectRoot, worktreeRoot, liveCardIds });
    }
    return { removed, reaped };
  }

  let embedderPrincipal = isPrincipal(defaultPrincipal) ? defaultPrincipal : null;
  // Per-instance fast-path for the one-time schema migration. The service is constructed
  // per-request on some paths, so this flag is NOT authoritative for correctness — the durable
  // `workflowSchema` marker is. It only skips the single marker `get` on repeat calls within one
  // long-lived instance once we have observed the marker is current.
  let schemaMigrated = false;

  // Fail-closed identity: every mutator obtains its committing principal from the per-call
  // context (the HTTP/MCP seams put it on `context.principal`). Absent that, a trusted
  // in-process embedder's `defaultPrincipal` is used; otherwise the anonymous least-privilege
  // floor — never a privileged default identity.
  function resolvePrincipal(context = {}) {
    if (isPrincipal(context?.principal)) return context.principal;
    if (embedderPrincipal) return embedderPrincipal;
    return derivePrincipal({ channel: 'unknown' });
  }

  // Standard blocked verdict, shaped exactly like the transition path's blocked result so the
  // gate is indistinguishable from a failed transition gate to every caller. A mutator calls
  // `gate(type, principal, extra)` and, on a non-ok verdict, returns this WITHOUT committing.
  function gate(type, principal, extra = {}) {
    let verdict = evaluateIntent({ type, ...extra }, principal);
    if (verdict.ok) return { ok: true };
    return {
      ok: false,
      status: verdict.verdict === 'pendingApproval' ? 'pendingApproval' : 'blocked',
      failures: [{ gate: 'capability', reason: verdict.reason, capability: verdict.capability }],
    };
  }

  // The daemon drives the board's own self-healing/seed commits; its writes are bookkeeping, not a
  // human/agent card edit. Operational mutators map a daemon principal to `daemon.bookkeeping` (DAEMON)
  // and everyone else to the intent the operation actually represents.
  function isDaemonPrincipal(principal) {
    return principal?.kind === 'daemon';
  }

  // One-time forward migration to schema v2 (AD-8; inv 16). The durable `workflowSchema` marker is
  // authoritative: if it already reports the current version this is a single `get` no-op on the hot
  // path. Otherwise sweep every persisted board + card through the always-forward iso migrators
  // once, commit only the entries that actually changed plus the marker in one commit, and never
  // branch on a v1 schema again at read time. Idempotent: a second call hits the marker no-op.
  function ensureWorkflowSchemaMigrated() {
    if (schemaMigrated) return;
    if (stateGraph.get('workflowSchema')?.version === WORKFLOW_SCHEMA_VERSION) {
      schemaMigrated = true;
      return;
    }
    let ops = [];
    let boards = getCollection(stateGraph, 'workflowBoards');
    for (let [id, board] of Object.entries(boards)) {
      let migrated = migrateWorkflowBoardToV2(board);
      if (JSON.stringify(board) !== JSON.stringify(migrated)) {
        ops.push({ op: 'set', path: `workflowBoards/${id}`, value: migrated });
      }
    }
    let cards = getCollection(stateGraph, 'workflowCards');
    for (let [id, card] of Object.entries(cards)) {
      let migrated = migrateWorkflowCardToV2(card);
      if (JSON.stringify(card) !== JSON.stringify(migrated)) {
        ops.push({ op: 'set', path: `workflowCards/${id}`, value: migrated });
      }
    }
    ops.push({ op: 'set', path: 'workflowSchema', value: { version: WORKFLOW_SCHEMA_VERSION } });
    stateGraph.commit(ops, sourceForPrincipal(daemonPrincipal()));
    schemaMigrated = true;
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
    // Fill-only policy refresh (inv 17): a customized column/transition is never clobbered. For a
    // default column that already exists, current values win and defaults only fill gaps; a default
    // column missing from the board is added wholesale (a legitimate fill). Same for transitions by
    // from->to key. inv 19 still holds: an MVP-era board gains every missing v2 column/transition.
    let currentColumns = Array.isArray(board.columns) ? board.columns : [];
    let columnsById = new Map(currentColumns.map(column => [textOrNull(column?.id), column]));
    let defaultColumnIds = new Set(defaults.columns.map(column => column.id));
    let nextColumns = defaults.columns.map((defaultColumn) => {
      let current = columnsById.get(defaultColumn.id);
      if (!current) return { ...defaultColumn, automation: { ...defaultColumn.automation } };
      // Fill-only preserves a customized title, EXCEPT the one-time v8 rename: the legacy `ready` title
      // 'Tasks / Ready' read as a status, but the column is the task queue — re-sync that exact legacy
      // value to the new default ('Tasks'). Any other custom title is kept.
      let storedTitle = textOrNull(current.title);
      if (defaultColumn.id === 'ready' && storedTitle === 'Tasks / Ready') storedTitle = null;
      return {
        ...current,
        id: defaultColumn.id,
        title: storedTitle ?? defaultColumn.title,
        // Fill-only: a stored automation gap (a missing/nullish field — e.g. an `action` lost to an
        // older normalizer or a clobbered snapshot) falls back to the default instead of overwriting
        // it, so the column's action/trigger/mode self-heal on every reconcile.
        automation: { ...defaultColumn.automation, ...definedOnly(current.automation) },
        // A default column's entry marker tracks the factory canonical (the human entry column,
        // `ideas`, is entryPoint:true; every other default column false), self-healing like the
        // column action/trigger/mode and the title re-sync above — a board that predates the marker
        // gains it on this refresh. A bespoke entry point lives on a CUSTOM column, which is appended
        // as-is below and keeps its stored entryPoint.
        entryPoint: defaultColumn.entryPoint ?? false,
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
      let current = transitionsByKey.get(transitionKey(defaultTransition));
      if (!current) {
        return { ...defaultTransition, gates: textArray(defaultTransition.gates ?? defaultTransition.gate) };
      }
      return current;
    });
    for (let transition of currentTransitions) {
      if (!defaultTransitionKeys.has(transitionKey(transition))) nextTransitions.push(transition);
    }

    let metadata = {
      ...asObject(board.metadata),
      defaultPolicyVersion: DEFAULT_WORKFLOW_POLICY_VERSION,
    };
    let automation = normalizeWorkflowBoardAutomation(board.automation);
    // Materialize the autonomy "volume slider" so the live default board surfaces it on its projection:
    // cascade the board's normalized autonomyLevel (default 5 — full autonomy — for a board that never
    // carried one) to the board publishMode and to per-column autoAdvance/mode. A board already stamped
    // 'manual' is left per-column custom by the transform. The default behavior is unchanged: L5 is the
    // full-autonomy preset the factory already ships.
    // Fill-only (inv 17): a numeric level only materializes autoAdvance for a column whose stored
    // automation never carried an explicit `autoAdvance`; a column a human deliberately tuned via
    // updateWorkflowColumn (so the stored value is present, even `false`) keeps its setting — the
    // one-time migration must not revert a per-column customization made while the slider stayed numeric.
    let explicitAutoAdvanceColumnIds = new Set(
      currentColumns
        .filter(column => asObject(column?.automation).autoAdvance !== undefined)
        .map(column => textOrNull(column?.id))
        .filter(Boolean),
    );
    let leveled = applyAutonomyLevelToBoard({ ...board, automation, columns: nextColumns }, automation.autonomyLevel);
    let leveledById = new Map(leveled.columns.map(column => [textOrNull(column?.id), column]));
    let nextColumnsLeveled = nextColumns.map((column) => {
      let columnId = textOrNull(column?.id);
      if (explicitAutoAdvanceColumnIds.has(columnId)) return column;
      return leveledById.get(columnId) ?? column;
    });
    let automationLeveled = normalizeWorkflowBoardAutomation(leveled.automation);
    let changed = JSON.stringify(currentColumns) !== JSON.stringify(nextColumnsLeveled)
      || JSON.stringify(currentTransitions) !== JSON.stringify(nextTransitions)
      || JSON.stringify(asObject(board.automation)) !== JSON.stringify(automationLeveled);
    if (!changed && JSON.stringify(asObject(board.metadata)) === JSON.stringify(metadata)) return board;
    let next = {
      ...board,
      metadata,
      automation: automationLeveled,
      columns: nextColumnsLeveled,
      transitions: nextTransitions,
      version: Number.isFinite(Number(board.version)) ? Math.floor(Number(board.version)) + 1 : 1,
      updatedAt: ts,
    };
    stateGraph.commit([{ op: 'set', path: `workflowBoards/${id}`, value: next }], sourceForPrincipal(daemonPrincipal()));
    return clone(next);
  }

  // Lookup, then create-on-first-touch. A persisted board (default or non-default) is returned as-is.
  // On a miss the board materializes from a factory: the default id from the fixed default factory, a
  // non-default id ONLY when the caller supplies a column/transition `spec` (the multi-board path —
  // `create_board` and any first-touch with a known spec). A non-default id with no spec still fails
  // closed: a board cannot be fabricated without a graph. A spec-seeded board is graph-validated before
  // it persists so the ensure path can never seed an unoperable board.
  function ensureBoard(boardId = DEFAULT_WORKFLOW_BOARD_ID, opts = {}) {
    ensureWorkflowSchemaMigrated();
    let id = textOrNull(boardId) ?? DEFAULT_WORKFLOW_BOARD_ID;
    let existing = stateGraph.get(`workflowBoards/${id}`);
    if (existing) return refreshDefaultBoardPolicy(existing, id);
    let spec = opts.spec && typeof opts.spec === 'object' ? opts.spec : null;
    if (id !== DEFAULT_WORKFLOW_BOARD_ID && !spec) {
      throw new Error(`Workflow board not found: ${id}`);
    }
    let board = spec
      ? createWorkflowBoard({ ...spec, id, now: now() })
      : createDefaultWorkflowBoard({ id, now: now() });
    if (spec) {
      let validation = validateWorkflowTransitionGraph(board);
      if (!validation.ok) {
        throw new Error(`Invalid workflow board graph for ${id}: ${validation.errors[0].detail}`);
      }
    } else {
      board.metadata = { defaultPolicyVersion: DEFAULT_WORKFLOW_POLICY_VERSION };
    }
    stateGraph.commit([{ op: 'set', path: `workflowBoards/${id}`, value: board }], sourceForPrincipal(daemonPrincipal()));
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

  // A check write is a FLOOR write iff it touches any floor check key (audit/hygiene). A mixed
  // write (floor + basic keys) is treated as floor-wide (the stricter gate wins). The intent
  // type maps to checks.write.floor (AUDIT) or checks.write.basic (WRITE_CARD) accordingly.
  function checkWriteIntent(checksInput) {
    // Resolve the checks record EXACTLY as normalizeWorkflowChecksInput does — a nested `checks`
    // key is only unwrapped when it is an object, otherwise the outer object IS the record. This
    // keeps the floor classification from ever disagreeing with what gets persisted (a non-object
    // `checks` wrapper key was a floor-check self-grant bypass).
    let record = checksInput?.checks && typeof checksInput.checks === 'object'
      ? checksInput.checks
      : checksInput;
    let keys = Object.keys(asObject(record));
    let isFloor = keys.some(key => FLOOR_CHECK_KEYS.has(key));
    return isFloor ? 'checks.write.floor' : 'checks.write.basic';
  }

  // Rights fields present in an input that actually CHANGE the card's current value. Unchanged
  // pass-throughs (e.g. an update_item that re-sends the whole card) are not a rights mutation.
  function changedRightsFields(input, current) {
    let changed = [];
    for (let field of CARD_RIGHTS_FIELDS) {
      if (!(field in input)) continue;
      let nextValue = textOrNull(input[field]);
      let currentValue = textOrNull(current?.[field]);
      if (nextValue !== currentValue) changed.push(field);
    }
    return changed;
  }

  function createOrUpdateCard(input = {}, principal = resolvePrincipal()) {
    let actor = principal.label;
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

    // Gate the card-body write (non-rights fields). A daemon self-heal/seed commit is bookkeeping
    // (DAEMON); a human/agent edit is card.write (WRITE_CARD).
    let daemonWrite = isDaemonPrincipal(principal);
    let bodyGate = gate(daemonWrite ? 'daemon.bookkeeping' : 'card.write', principal, { boardId: board.id, cardId: id });
    if (!bodyGate.ok) return { ...bodyGate, board, card: current ? clone(current) : null, checks: getChecks(id) };

    // Rights-field authorship (inv 13). A rights field that changes a card value is a policy.author
    // intent (AUTHOR). A non-author write is held: the rights field is dropped, never applied; the
    // body write proceeds. `proposedLane` is advisory unless applied by a board-author here. The
    // daemon does not author rights — it never reaches this branch with a rights change in practice.
    let requestedRights = daemonWrite ? [] : changedRightsFields(input, current);
    let deniedRights = [];
    let scrubbedInput = input;
    if (requestedRights.length) {
      let rightsGate = gate('policy.author', principal, { boardId: board.id, cardId: id });
      if (!rightsGate.ok) {
        deniedRights = requestedRights;
        scrubbedInput = { ...input };
        for (let field of requestedRights) delete scrubbedInput[field];
      }
    }

    let ts = now();
    let merged = mergeDefined(current ?? {}, {
      ...scrubbedInput,
      id,
      boardId: board.id,
      version: current ? current.version + 1 : 1,
      createdAt: current?.createdAt,
      updatedAt: ts,
      updatedBy: actor,
    });
    // executedBy is service-owned (separated-duty integrity, inv 47). It is stamped only by the
    // run/delegate path; a caller can never set or clear it through metadata input, or it could
    // wipe its own executor record and then sign its card's audit.
    merged.metadata = {
      ...asObject(merged.metadata),
      executedBy: textArray(current?.metadata?.executedBy),
    };
    // Orchestrator return subscription (S5): persist it on the card at create/update so the JOIN
    // materializes whenever the card is first orchestrated — including by the auto-pickup daemon —
    // not only when a subscription is threaded through one explicit orchestrate() call (which races
    // auto-pickup and silently drops the join). An explicit input subscription wins; absent that, an
    // already-persisted subscription is preserved; an explicit invalid/memberless one clears it.
    let nextSubscription = input.subscription !== undefined
      ? normalizeWorkflowSubscription(input.subscription)
      : (current?.metadata?.subscription ?? null);
    if (nextSubscription) merged.metadata.subscription = nextSubscription;
    else delete merged.metadata.subscription;
    let card = normalizeWorkflowCardInput(merged, {
      id,
      actor,
      now: ts,
      version: merged.version,
      createdAt: current?.createdAt ?? ts,
      updatedAt: ts,
    });

    // Board-driven column authority (S5 carry-over). The iso normalizer is board-agnostic, so the
    // board's own column set is the authority here: a card may land in any default or
    // define_column-added column the board actually has, and a genuinely-unknown column is rejected.
    assertBoardColumn(board, card.columnId);

    // Narrow-only automation (inv 12). A card automation may only narrow (add to) a column's floor
    // gates, never drop one. Checked on the raw input automation (the card normalizer does not carry
    // a `gates` override) at the merge point — iso stays frozen. A non-monotonic override is rejected
    // without committing.
    let monotonic = cardAutomationIsMonotonic(board, card.columnId, asObject(scrubbedInput.automation));
    if (!monotonic.ok) {
      return {
        ok: false,
        status: 'blocked',
        failures: [{ gate: 'narrow_only_automation', reason: monotonic.reason }],
        board,
        card: current ? clone(current) : null,
        checks: getChecks(id),
      };
    }

    // Import/write-time dependency cycle re-check (inv 23): a card written (created, updated, or
    // imported/normalized-on-read) with `dependsOn` edges must not close a cycle. Each new upstream
    // edge is rejected if this card is already reachable from that upstream in the committed closure.
    // Rejected without committing — the link path enforces the same at edit time.
    for (let dep of card.dependsOn) {
      if (wouldCreateDependencyCycle(board.id, card.id, dep.cardId)) {
        return {
          ok: false,
          status: 'blocked',
          failures: [{ gate: 'dependency_cycle', reason: `Dependency ${card.id} → ${dep.cardId} would create a cycle.` }],
          board,
          card: current ? clone(current) : null,
          checks: getChecks(id),
        };
      }
    }

    let ops = [{ op: 'set', path: `workflowCards/${card.id}`, value: card }];
    let checks = getChecks(card.id);

    if (input.checks !== undefined) {
      // Separated-duty gated check-writing (inv 33, 47). Capability classification: a daemon write
      // authorizes via daemon.bookkeeping (DAEMON), a human/agent floor-gate check (audit/hygiene)
      // via checks.write.floor (AUDIT), a basic check via checks.write.basic (WRITE_CARD). Whether a
      // write IS a floor signature is decided from its keys alone — independent of the daemon mapping
      // — so the executedBy separated-duty constraint applies to daemon floor-writes too, not just
      // human/agent ones (the daemon both runs and reconciles a card in autonomous mode).
      let isFloorWrite = checkWriteIntent(input.checks) === 'checks.write.floor';
      let intentType = daemonWrite ? 'daemon.bookkeeping' : checkWriteIntent(input.checks);
      let checksGate = gate(intentType, principal, { boardId: board.id, cardId: id });
      if (!checksGate.ok) {
        return { ...checksGate, board, card: current ? clone(current) : null, checks };
      }
      if (isFloorWrite) {
        // An executor (its id in card.executedBy) can never sign a floor check for its own card, even
        // with AUDIT or DAEMON. The only escape is a daemon self-sign explicitly waived per board.
        let executedBy = textArray(current?.metadata?.executedBy);
        if (!floorSignSeparation(board, executedBy, principal).ok) {
          return {
            ok: false,
            status: 'blocked',
            failures: [{
              gate: 'separated_duty',
              reason: `Principal "${principal.id}" executed card ${id} and cannot sign its own floor-gate (audit/hygiene) check.`,
              capability: CAP.AUDIT,
            }],
            board,
            card: current ? clone(current) : null,
            checks,
          };
        }
      }
      let record = normalizeWorkflowChecksInput(input.checks, {
        cardId: card.id,
        actor,
        now: ts,
        updatedAt: ts,
      });
      checks = record.checks;
      ops.push({ op: 'set', path: `workflowChecks/${card.id}`, value: record });
    }

    stateGraph.commit(ops, sourceForPrincipal(principal));

    // F-DEP-1(a): enforce dependency satisfaction on the PRIMARY write path. Enforcement otherwise
    // lived only in linkDependency→recomputeDependencyLifecycle, so a card written here with a
    // populated `dependsOn` (create, update, import, decompose) stayed `idle`, enqueued, and admitted
    // with deps unmet. Recompute now: a not-yet-queued card with an unsatisfied edge → `blocked`.
    // The scheduler still owns queued/admitting/running, so those lifecycles are left untouched.
    let resultCard = card;
    if (card.dependsOn.length && ['idle', 'blocked'].includes(normalizeWorkflowLifecycle(card.lifecycle))) {
      let outcome = recomputeDependencyLifecycle(board, card, principal);
      resultCard = outcome.card;
    }
    return { ok: true, board, card: resultCard, checks, ...(deniedRights.length ? { deniedRightsFields: deniedRights } : {}) };
  }

  // Narrow-only floor-gate check (inv 12): a card's `automation.gates` override may only NARROW the
  // column's floor gates (add gates), never drop a floor (audit/hygiene) gate. Cards without a gate
  // override are unconstrained here — the column gates apply unchanged.
  function cardAutomationIsMonotonic(board, columnId, cardAutomation) {
    let cardGates = textArray(cardAutomation.gates ?? cardAutomation.gate);
    if (!cardGates.length) return { ok: true };
    let columnGates = textArray(columnAutomation(board, columnId).gates);
    if (!columnGates.length) return { ok: true };
    if (isFloorGateMonotonic(columnGates, cardGates)) return { ok: true };
    return {
      ok: false,
      reason: `Card automation may only narrow column "${columnId}" floor gates, not drop them.`,
    };
  }

  function createFailure(gate, reason) {
    return { gate, reason };
  }

  // Classifier + validator are pure over (columns, transitions); memoize per board id+version so a
  // single evaluateRequest (or any hot path) classifies once. The cache holds one entry per board id
  // and is invalidated by version, so a board edit (which bumps version) recomputes on next use.
  let graphCache = new Map();
  function boardGraph(board) {
    let id = textOrNull(board?.id) ?? DEFAULT_WORKFLOW_BOARD_ID;
    let version = Number(board?.version);
    let key = Number.isFinite(version) ? version : 'unversioned';
    let cached = graphCache.get(id);
    if (cached && cached.key === key) return cached.value;
    let value = {
      classifier: classifyWorkflowGraph(board),
      validation: validateWorkflowTransitionGraph(board),
    };
    graphCache.set(id, { key, value });
    return value;
  }

  // Board-aware destructive-move detection (replaces the former hardcoded set). A move is destructive
  // when it (1) enters a terminal column, (2) is flagged destructive by the classifier for an existing
  // graph edge (a backward move out of a terminal stage), or (3) — the not-an-edge fallback — is a
  // rank-decreasing backward move out of the execution stage (`automation.action === 'execute'`).
  // Anything backward into/out of a terminal that the classifier does not already cover is caught by
  // the rank/terminal fallback, so an unknown move is never silently treated as non-destructive.
  function hasDestructiveMove(board, fromColumnId, toColumnId) {
    let classifier = board?.classifier ?? boardGraph(board).classifier;
    if (classifier.isTerminal(toColumnId)) return true;
    let edgeDestructive = classifier.edges.some(
      edge => edge.from === fromColumnId && edge.to === toColumnId && edge.destructive,
    );
    if (edgeDestructive) return true;
    let fromRank = classifier.rankOf(fromColumnId);
    let toRank = classifier.rankOf(toColumnId);
    let backward = fromRank >= 0 && toRank >= 0 && toRank < fromRank;
    if (!backward) return false;
    let fromAction = textOrNull(columnAutomation(board, fromColumnId).action);
    return fromAction === 'execute' || classifier.isTerminal(fromColumnId);
  }

  // Board-derived active/recovery columns (inv 18, replaces the former hardcoded id list): a column is
  // active/recovery iff it is NON-terminal and its automation action is an execution-class action — a
  // card there can have an in-flight run needing recovery.
  function activeRecoveryColumnIds(board) {
    let classifier = boardGraph(board).classifier;
    return (Array.isArray(board?.columns) ? board.columns : [])
      .filter(column => !classifier.isTerminal(column.id))
      .filter(column => EXECUTION_COLUMN_ACTIONS.has(textOrNull(column?.automation?.action)))
      .map(column => column.id);
  }

  function evaluateRequest(board, card, checks, request) {
    let failures = [];
    let { classifier, validation } = boardGraph(board);
    // inv 11: a structurally-invalid custom board cannot be operated. The shipped default board is
    // verified valid, so this never fires for it. Surface the first validator error code + detail.
    if (!validation.ok) {
      let first = validation.errors[0];
      failures.push(createFailure(
        'invalid_board_graph',
        `Board ${board.id} transition graph is invalid (${first.code}): ${first.detail}`,
      ));
    }
    // Data-driven column existence: a custom board accepts its own column ids; the default set is no
    // longer the authority.
    if (!board.columns.some(column => column.id === request.toColumnId)) {
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
    let destructive = hasDestructiveMove({ ...board, classifier }, card.columnId, request.toColumnId);
    if (destructive && !request.reason) {
      failures.push(createFailure('reason_required', 'Destructive workflow moves require a reason.'));
    }
    // A destructive move must not strand an active run. activeRunForCard is a hoisted function
    // declaration (do not refactor it to a const arrow — that would TDZ here). Pass force to
    // override (the caller is expected to finalize/stop the run first).
    if (destructive && !request.force) {
      let liveRun = activeRunForCard(card.id);
      if (liveRun) {
        failures.push(createFailure(
          'active_run_blocks_move',
          `Card ${card.id} has active run ${liveRun.id} (${liveRun.status}). Stop or cancel the run (action=control) before moving out of ${card.columnId}, or pass force to override.`,
        ));
      }
    }

    let gateResult = evaluateWorkflowTransitionGates({ board, card, checks, request });
    return {
      ok: failures.length === 0 && gateResult.ok,
      checks: gateResult.checks,
      failures: [...failures, ...gateResult.failures],
    };
  }

  function requestTransition(input = {}, principal = resolvePrincipal()) {
    let actor = principal.label;
    let request = normalizeWorkflowTransitionRequest({ ...input, actor });
    let board = ensureBoard(request.boardId);
    let capabilityGate = gate(
      isDaemonPrincipal(principal) ? 'daemon.bookkeeping' : 'card.transition',
      principal,
      { boardId: request.boardId, cardId: request.cardId, toColumnId: request.toColumnId },
    );
    if (!capabilityGate.ok) return capabilityGate;
    let card = getCard(request.cardId);
    let checks = getChecks(card.id);
    // Rework authorization is the board's own return/escalation re-engagement waking a dormant
    // orchestrator (e.g. quality-audit → ready). It is honored ONLY for the daemon board-self-drive —
    // a caller-supplied flag from a human/agent transition is ignored, so the rework edge stays governed.
    let reworkAuthorized = isDaemonPrincipal(principal)
      && (input.reworkAuthorized === true || input.rework_authorized === true);
    let gateResult = evaluateRequest(board, card, checks, { ...request, reworkAuthorized });
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
        updatedBy: actor,
      }, {
        id: card.id,
        actor,
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

    stateGraph.commit(ops, sourceForPrincipal(principal));
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

  function stageOccupancyLimit(automation = {}) {
    let limit = Number(automation.occupancyLimit ?? automation.occupancy_limit);
    return Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : null;
  }

  // Count the cards currently OCCUPYING a column — every card in it, not just the ones with a live
  // run. This is the WIP figure the occupancy cap gates on: a card that finished its run but was not
  // advanced still occupies the column, so it must be counted (the whole point of Axis C).
  function columnOccupancyCount(boardId, columnId) {
    return Object.values(getCollection(stateGraph, 'workflowCards'))
      .filter(card => card.boardId === boardId && card.columnId === columnId)
      .length;
  }

  // Occupancy WIP cap (Axis C). Unlike stageCapacityAvailable — which bounds concurrently RUNNING
  // agents — this bounds how many cards may sit in the column at once. The candidate is already in its
  // column at admission time, so it is counted in the population and the cap is breached at `>`: a
  // column may hold up to `limit` cards, and admitting more work while the column is already at/over
  // the cap is refused. Absent limit → uncapped (prior behaviour).
  function columnOccupancyAvailable(board, card, automation = {}) {
    let limit = stageOccupancyLimit(automation);
    if (!limit) return { ok: true, limit: null, occupancy: 0 };
    let occupancy = columnOccupancyCount(board.id, card.columnId);
    return {
      ok: occupancy <= limit,
      limit,
      occupancy,
      reason: occupancy <= limit
        ? ''
        : `Column ${card.columnId} holds ${occupancy} card${occupancy === 1 ? '' : 's'} at occupancy cap ${limit}.`,
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

  // Sum cumulative spend over a set of runs across the three budget dimensions. tokens come from the
  // run-level total the task router persists; wall-clock is each run's elapsed span (a live run counts
  // up to now, a terminal run to its end stamp); run-count is the raw run tally. Generic over the run
  // set so the same accounting serves the board ceiling and the per-goal / per-decompose-subtree
  // breakdowns used in breach diagnostics.
  function sumRunsBudget(runs) {
    let nowTs = now();
    let tokens = 0;
    let wallClockMs = 0;
    let runCount = 0;
    for (let run of runs) {
      runCount += 1;
      let runTokens = Number(run.tokens);
      if (Number.isFinite(runTokens) && runTokens > 0) tokens += runTokens;
      let startedAt = Number(run.startedAt);
      if (Number.isFinite(startedAt) && startedAt > 0) {
        let endedAt = Number(run.completedAt ?? run.updatedAt);
        let end = Number.isFinite(endedAt) && endedAt >= startedAt
          ? endedAt
          : (RUNNING_RUN_STATUSES.has(run.status) ? nowTs : startedAt);
        wallClockMs += Math.max(0, end - startedAt);
      }
    }
    return { tokens, wallClockMs, runCount };
  }

  function boardRuns(boardId) {
    return Object.values(getCollection(stateGraph, 'workflowRuns')).filter(run => run.boardId === boardId);
  }

  // Cumulative spend for the whole board: one pass over its runs. This is the figure the admission
  // breaker gates on, so it stays cheap (no subtree walk) for the hot path.
  function boardBudgetSpend(boardId) {
    return sumRunsBudget(boardRuns(boardId));
  }

  // Board budget status: cumulative spend evaluated against the board's configured budget. ok=true and
  // configured=false when no budget is authored (uncapped — the prior behaviour).
  function boardBudgetStatus(board) {
    let automation = normalizeWorkflowBoardAutomation(board.automation);
    let spend = boardBudgetSpend(board.id);
    return { ...evaluateWorkflowBoardBudget(automation.budget ?? null, spend), spend };
  }

  function formatBudgetBreaches(breaches = []) {
    return breaches
      .map((breach) => {
        if (breach.dimension === 'wallClockMs') {
          return `wall-clock ${Math.round(breach.spent / 1000)}s/${Math.round(breach.limit / 1000)}s`;
        }
        let label = breach.dimension === 'runCount' ? 'runs' : breach.dimension;
        return `${label} ${breach.spent}/${breach.limit}`;
      })
      .join(', ');
  }

  // Admission-time budget gate. A breach refuses admission; the daemon drain pass additionally trips
  // the breaker (pause + escalate). Mirrors the boardCapacityAvailable shape so the two ceilings read
  // the same at every call site.
  function boardBudgetAvailable(board) {
    let status = boardBudgetStatus(board);
    if (status.ok) return { ok: true, budget: status.budget ?? null, spend: status.spend, breaches: [] };
    return {
      ok: false,
      reason: `Board ${board.id} budget exhausted: ${formatBudgetBreaches(status.breaches)}.`,
      budget: status.budget,
      spend: status.spend,
      breaches: status.breaches,
    };
  }

  // One grouped pass over a board's cards + runs, keyed by each card's root. The root key prefers the
  // stamped metadata.rootCardId (set transitively on every decomposed descendant) so it survives a
  // retired parent, falling back to the topmost-ancestor id from the parentCardId walk for cards minted
  // before the lean-brief precursor or with a pruned chain. Shared by both the per-decompose-subtree
  // spend breakdown (breaker diagnostics) and the per-root convergence cap, so neither pays for a second
  // walk. Returns rootKeyOf(card), descendantsByRoot (root → member cards incl. the root itself), and
  // runsByRoot (root → runs charged anywhere in the subtree).
  function rootIndex(boardId) {
    let cards = Object.values(getCollection(stateGraph, 'workflowCards')).filter(card => card.boardId === boardId);
    let byId = new Map(cards.map(card => [card.id, card]));
    let topmostAncestor = (card) => {
      let current = card;
      let guard = 0;
      while (current.parentCardId && byId.has(current.parentCardId) && guard < cards.length) {
        current = byId.get(current.parentCardId);
        guard += 1;
      }
      return current.id;
    };
    let rootKeyOf = (card) => textOrNull(card?.metadata?.rootCardId) ?? topmostAncestor(card);
    let descendantsByRoot = new Map();
    for (let card of cards) {
      let root = rootKeyOf(card);
      if (!descendantsByRoot.has(root)) descendantsByRoot.set(root, []);
      descendantsByRoot.get(root).push(card);
    }
    let runsByCard = new Map();
    for (let run of boardRuns(boardId)) {
      if (!runsByCard.has(run.cardId)) runsByCard.set(run.cardId, []);
      runsByCard.get(run.cardId).push(run);
    }
    let runsByRoot = new Map();
    for (let card of cards) {
      let runs = runsByCard.get(card.id) ?? [];
      if (!runs.length) continue;
      let root = rootKeyOf(card);
      if (!runsByRoot.has(root)) runsByRoot.set(root, []);
      runsByRoot.get(root).push(...runs);
    }
    return { byId, rootKeyOf, descendantsByRoot, runsByRoot };
  }

  // Per-decompose-subtree spend, keyed by the root decompose parent. Computed only when the breaker
  // trips (rare) so the hot admission path never pays for the closure walk. Used to name the heaviest
  // subtree in the escalation — the concrete "wide/deep decompose tree" that drove the board over budget.
  function decomposeSubtreeSpend(boardId) {
    let { runsByRoot } = rootIndex(boardId);
    return [...runsByRoot.entries()]
      .map(([rootCardId, runs]) => ({ rootCardId, ...sumRunsBudget(runs) }))
      .sort((a, b) => b.tokens - a.tokens);
  }

  // The three monotonic per-root convergence dimensions for one root, fed to the iso evaluateRootConvergence
  // gate. depth = the deepest decompose-nesting chain under the root (max ancestor hops among its members);
  // fanout = total descendants sharing the root (the descendantsByRoot group size); runCount = cumulative
  // runs charged anywhere in the root subtree. Each strictly increments on a fresh re-decompose wave
  // (one more nesting level and/or sibling, and at least one new run), so the gate converges the otherwise
  // unbounded happy-path loop. Shares the single rootIndex pass — one grouped walk per drive, not per root.
  function perRootConvergenceCounts(board, root, index = rootIndex(board.id)) {
    let { byId, descendantsByRoot, runsByRoot } = index;
    let group = descendantsByRoot.get(root) ?? [];
    let depthOf = (card) => {
      let current = card;
      let hops = 0;
      let guard = 0;
      while (current.parentCardId && byId.has(current.parentCardId) && current.id !== root && guard < group.length) {
        current = byId.get(current.parentCardId);
        hops += 1;
        guard += 1;
      }
      return hops;
    };
    let depth = 0;
    for (let card of group) depth = Math.max(depth, depthOf(card));
    let runCount = sumRunsBudget(runsByRoot.get(root) ?? []).runCount;
    return { depth, fanout: group.length, runCount };
  }

  // Admission-time per-root convergence gate. Mandatory and always-on (it never reads automation.budget
  // and has no configured:false escape — the DEFAULT_ROOT_MAX_* constants always apply), so it bounds the
  // otherwise-unbounded happy-path re-decompose loop even on an unauthored full-autonomy board. Resolves
  // the card's root via the shared rootIndex pass, computes the three monotonic counts, and evaluates them
  // against the board's optional automation.rootConvergence override. Returns the boardBudgetAvailable
  // shape so the candidate gate reads the same at every ceiling; a breach names the breached dimensions
  // and the root so the daemon sweep can route that root to a terminal with an attributable reason.
  function perRootConvergenceAvailable(board, card) {
    let index = rootIndex(board.id);
    let root = index.rootKeyOf(card);
    let counts = perRootConvergenceCounts(board, root, index);
    let override = normalizeWorkflowBoardAutomation(board.automation).rootConvergence;
    let result = evaluateRootConvergence(counts, override);
    if (result.ok) return { ok: true, root, limits: result.limits, counts, breaches: [] };
    return {
      ok: false,
      reason: `Root ${root} convergence cap reached: ${formatRootConvergenceBreaches(result.breaches)}.`,
      root,
      limits: result.limits,
      counts,
      breaches: result.breaches,
    };
  }

  function formatRootConvergenceBreaches(breaches = []) {
    return breaches
      .map((breach) => {
        let label = breach.dimension === 'runCount' ? 'runs' : breach.dimension;
        return `${label} ${breach.spent}/${breach.limit}`;
      })
      .join(', ');
  }

  // Per-goal spend, keyed by the goal a card's run is attached to (entityRefs.goalId). Computed with
  // the subtree breakdown only at trip time for diagnostics.
  function goalBudgetSpend(boardId) {
    let cards = Object.values(getCollection(stateGraph, 'workflowCards')).filter(card => card.boardId === boardId);
    let goalByCard = new Map(cards.map(card => [card.id, textOrNull(card.entityRefs?.goalId)]));
    let byGoal = new Map();
    for (let run of boardRuns(boardId)) {
      let goalId = goalByCard.get(run.cardId);
      if (!goalId) continue;
      if (!byGoal.has(goalId)) byGoal.set(goalId, []);
      byGoal.get(goalId).push(run);
    }
    return [...byGoal.entries()]
      .map(([goalId, runs]) => ({ goalId, ...sumRunsBudget(runs) }))
      .sort((a, b) => b.tokens - a.tokens);
  }

  // Trip the board budget breaker: flip the board to `paused` and raise a board-level `needs_decision`
  // escalation naming the breached dimensions plus the heaviest decompose subtree / goal that drove the
  // spend, so a human re-arms the board with intent. Idempotent — a second trip while already tripped
  // writes nothing, so a paused board never spams escalations.
  function tripBoardBudgetBreaker(board, status) {
    let principal = daemonPrincipal();
    let ts = now();
    let alreadyTripped = board.mode === 'paused' && Boolean(asObject(board.metadata).budgetBreaker);
    if (alreadyTripped) return { ok: true, board: clone(board), event: null, alreadyTripped: true };
    let topSubtree = decomposeSubtreeSpend(board.id)[0] ?? null;
    let topGoal = goalBudgetSpend(board.id)[0] ?? null;
    let detail = `Board ${board.id} budget exhausted (${formatBudgetBreaches(status.breaches)}). `
      + 'Admission refused and board paused.'
      + (topSubtree ? ` Heaviest decompose subtree ${topSubtree.rootCardId}: ${topSubtree.tokens} tokens over ${topSubtree.runCount} run(s).` : '');
    let breakerState = {
      trippedAt: ts,
      breaches: status.breaches,
      budget: status.budget ?? null,
      spend: status.spend,
      ...(topSubtree ? { topSubtree } : {}),
      ...(topGoal ? { topGoal } : {}),
    };
    let nextBoard = {
      ...board,
      mode: 'paused',
      version: boardVersion(board) + 1,
      updatedAt: ts,
      metadata: { ...asObject(board.metadata), budgetBreaker: breakerState },
    };
    let event = boardEvent(nextBoard, principal, { reason: detail }, {
      eventType: 'escalation',
      status: 'accepted',
      sideEffects: [{
        type: 'budget_breaker',
        status: 'tripped',
        kind: 'needs_decision',
        detail,
        breaches: status.breaches,
        spend: status.spend,
        ...(topSubtree ? { topSubtree } : {}),
        ...(topGoal ? { topGoal } : {}),
      }],
    });
    stateGraph.commit([
      { op: 'set', path: `workflowBoards/${nextBoard.id}`, value: nextBoard },
      { op: 'set', path: `workflowTransitions/${event.id}`, value: event },
    ], sourceForPrincipal(principal));
    return { ok: true, board: nextBoard, event, tripped: true };
  }

  function activeFileScopeConflicts(board, card, args = {}) {
    let files = cardFileScope(card, args);
    if (!files.length) return [];
    // Worktree isolation removes the shared-tree clobber the blocker exists to prevent. A card that runs
    // in its OWN worktree neither overwrites nor is overwritten by a peer, so it neither reserves shared
    // file scope nor collides on it — real overlaps surface (serialized) at MERGE time as a conflict the
    // board escalates, not as a pre-execution block. So: the starting card skips the blocker entirely
    // when it will run isolated, and any candidate already running isolated reserves nothing. Only
    // genuinely shared-tree cards (isolation off, non-git project, or a degraded provision) still
    // serialize on file overlap — exactly the activity-only semantics the blocker was meant to have.
    let cardWillIsolate = worktreeIsolationEnabled(board)
      && (cardIsIsolated(card) || EXECUTION_COLUMN_ACTIONS.has(cardColumnAction(board, card)));
    if (cardWillIsolate) return [];
    let activeColumnIds = new Set(activeRecoveryColumnIds(board));
    return Object.values(getCollection(stateGraph, 'workflowCards'))
      .filter(candidate => candidate.id !== card.id)
      .filter(candidate => candidate.boardId === board.id)
      .filter(candidate => !card.projectId || candidate.projectId === card.projectId)
      .filter(candidate => activeColumnIds.has(candidate.columnId))
      // Scope-hold semantics. An ISOLATED candidate edits its own worktree and reserves nothing. For a
      // shared-tree candidate: a RUNNING run is actively editing and always holds its file scope; a merely
      // TERMINAL run holds scope ONLY while the card is still in an execution/audit/publish column — there
      // its produced (uncommitted) changes are pending advance/audit/commit and a peer must not clobber
      // them. A card with no run, or one RETURNED to a pre-execution column (`orchestrate`/`ready`,
      // backlog) carrying only a STALE terminal run from a prior cycle, is not editing anything and must
      // NOT hold scope; otherwise N same-file cards piled into `ready` (e.g. several rework/return cards)
      // mutually deadlock and none can ever start.
      .filter((candidate) => {
        if (cardIsIsolated(candidate)) return false;
        let runs = getRunsForCard(candidate.id);
        if (runs.some(run => RUNNING_RUN_STATUSES.has(run.status))) return true;
        let action = textOrNull(
          (Array.isArray(board?.columns) ? board.columns : []).find(col => col.id === candidate.columnId)?.automation?.action,
        );
        return PENDING_CHANGE_COLUMN_ACTIONS.has(action)
          && runs.some(run => TERMINAL_RUN_STATUSES.has(run.status));
      })
      .map((candidate) => {
        let candidateFiles = cardFileScope(candidate);
        let overlappingFiles = files.filter(file => candidateFiles.some(candidateFile => fileScopesOverlap(file, candidateFile)));
        return overlappingFiles.length
          ? {
            cardId: candidate.id,
            title: candidate.title,
            columnId: candidate.columnId,
            files: overlappingFiles,
          }
          : null;
      })
      .filter(Boolean);
  }

  function fileScopeConflictReason(conflicts = []) {
    let first = conflicts[0];
    if (!first) return '';
    let suffix = conflicts.length > 1 ? ` and ${conflicts.length - 1} more active card(s)` : '';
    return `Workflow file scope overlaps active card ${first.cardId} (${first.columnId}): ${first.files.join(', ')}${suffix}.`;
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
    // No explicit or assigned agent: the stage's connected pool defines the candidate actions and the
    // orchestrator picks which connected agent fits THIS card by specialty. Only ever returns a slug
    // already in the pool; when no signal scores, fall back to the pool's first connected agent.
    let scored = pickStageAgentFromPool(pool, card, cardFileScope(card, args), stageAgentSpecialties);
    return scored ?? pool[0] ?? explicit ?? assigned ?? 'orchestrator';
  }

  function readyCardHasExecutionContract(card = {}) {
    return Boolean(textOrNull(card.owner) && Array.isArray(card.acceptanceCriteria) && card.acceptanceCriteria.length);
  }

  function readyOrchestrationGate(board, card, actor = 'workflow-board') {
    if (card.columnId !== 'ready') return { ok: true, checks: [], failures: [] };
    return evaluateRequest(board, card, getChecks(card.id), {
      boardId: board.id,
      cardId: card.id,
      fromColumnId: 'ready',
      toColumnId: 'in-progress',
      actor,
      mode: 'auto',
      reason: 'Evaluate ready card orchestration gates.',
      expectedVersion: null,
      entityRefs: {},
    });
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
    // Per-column autonomy gate: a stage whose autoAdvance is off is human-started — the daemon never
    // auto-fires its on-enter orchestration (the card waits in the column for a human to advance it).
    if (automation.autoAdvance === false) {
      return { ok: false, reason: 'column autoAdvance is off; awaiting a human', automation };
    }
    // Autonomous mode also auto-fires the `scope` action so the backlog self-starts (the orchestrator
    // scopes a raw card); armed/other modes keep scope manual — only on-enter orchestrate/audit auto-run.
    let autoActions = board.mode === 'autonomous'
      ? ['orchestrate', 'audit', 'scope']
      : ['orchestrate', 'audit'];
    let triggerEligible = automation.trigger === 'on_enter'
      || (board.mode === 'autonomous' && automation.action === 'scope');
    if (!triggerEligible || !autoActions.includes(automation.action)) {
      return { ok: false, reason: 'column is not configured for on-enter orchestration or autonomous scope', automation };
    }
    // Idempotency: do not re-run the audit action on a card that already has a passing audit
    // (re-entry, reconcile, or duplicate transition must not loop the auditor).
    if (automation.action === 'audit' && checkPassed(getChecks(card.id).audit)) {
      return { ok: false, reason: 'audit already passed for this card', automation };
    }
    // A `scope` is for raw cards: one that already carries an execution contract (owner + acceptance)
    // is promoted to the orchestrate column by the autonomous backlog driver, never re-scoped.
    if (automation.action === 'scope' && readyCardHasExecutionContract(card)) {
      return { ok: false, reason: 'card already has an execution contract; promote instead of scope', automation };
    }
    if (board.mode !== 'armed' && board.mode !== 'autonomous') {
      return { ok: false, reason: `board mode ${board.mode} does not allow automatic orchestration`, automation };
    }
    if (card.columnId === 'ready' && !readyCardHasExecutionContract(card)) {
      return { ok: false, reason: 'ready cards require owner and acceptance criteria before orchestration', automation };
    }
    let gateResult = readyOrchestrationGate(board, card);
    if (!gateResult.ok) {
      return {
        ok: false,
        reason: gateResult.failures[0]?.reason ?? 'ready card orchestration gate failed',
        automation,
        gateResult,
      };
    }
    let capacity = stageCapacityAvailable(board, card, automation);
    if (!capacity.ok && !args.force) {
      return { ok: false, reason: capacity.reason, automation, capacity };
    }
    let boardCapacity = boardCapacityAvailable(board, card);
    if (!boardCapacity.ok && !args.force) {
      return { ok: false, reason: boardCapacity.reason, automation, capacity, boardCapacity };
    }
    let occupancy = columnOccupancyAvailable(board, card, automation);
    if (!occupancy.ok && !args.force) {
      return { ok: false, reason: occupancy.reason, automation, capacity, boardCapacity, occupancy };
    }
    let boardBudget = boardBudgetAvailable(board);
    if (!boardBudget.ok && !args.force) {
      return { ok: false, reason: boardBudget.reason, automation, capacity, boardCapacity, occupancy, boardBudget };
    }
    // Mandatory per-root convergence cap: independent of the optional board budget and always-on, this is
    // the binding bound that converges the otherwise-unbounded re-decompose loop (every wave re-orchestrates
    // through here and strictly increments depth/fanout/runCount). A breach refuses admission; the daemon
    // sweep routes the breached root to a terminal.
    let rootConvergence = perRootConvergenceAvailable(board, card);
    if (!rootConvergence.ok && !args.force) {
      return { ok: false, reason: rootConvergence.reason, automation, capacity, boardCapacity, occupancy, boardBudget, rootConvergence };
    }
    let fileConflicts = activeFileScopeConflicts(board, card, args);
    if (fileConflicts.length && !args.force) {
      return {
        ok: false,
        reason: fileScopeConflictReason(fileConflicts),
        automation,
        capacity,
        boardCapacity,
        fileConflicts,
      };
    }
    return { ok: true, automation, capacity, boardCapacity, fileConflicts };
  }

  // ── Admission scheduler (WS-B1; v5 Decision 1, AD-2/9/10/13/14/16/17) ──────────────────────────
  // Storage shapes (all durable in StateGraph):
  //   workflowQueueEpoch/{boardId}        → monotonic int; the commitCAS fence epoch for this board
  //   workflowQueueEntries/{admissionId}  → { cardId, boardId, columnId, groupKey, priority,
  //                                           enqueuedAt, queueEpoch, admissionId, notBefore }
  //   workflowQueueCursor/{boardId}       → { groupKey } persisted round-robin cursor
  //   workflowAdmissionLease/{boardId}    → { owner, leaseEpoch, startedAt, heartbeatAt, ttlMs }
  //   workflowAdmissionResolution/{cardId}→ { cardId, leaseEpoch, admissionId, phase, startedAt }
  // The queue ENTRY overlaps the card lifecycle/run until `running` is durable (AD-2: never a gap).

  // groupKey = capacity-governing resource group, fallback projectId, then a board-wide bucket.
  function resolveGroupKey(card = {}) {
    return textOrNull(card.resourceGroup)
      ?? textOrNull(card.projectId)
      ?? `board:${textOrNull(card.boardId) ?? DEFAULT_WORKFLOW_BOARD_ID}`;
  }

  function readQueueEpoch(boardId) {
    let raw = stateGraph.get(`workflowQueueEpoch/${boardId}`);
    return (raw === undefined || raw === null) ? 0 : Number(raw) || 0;
  }

  function listQueueEntries(boardId) {
    return Object.values(getCollection(stateGraph, 'workflowQueueEntries'))
      .filter(entry => entry.boardId === boardId);
  }

  function liveQueueEntryForCard(boardId, cardId) {
    return listQueueEntries(boardId).find(entry => entry.cardId === cardId) ?? null;
  }

  // Enqueue (inv 3, 4, 31; AD-2). Appends a durable queue entry and sets lifecycle=queued in ONE
  // commitCAS frame on the board queue epoch. inv 31: at most one live entry per card — a re-enqueue
  // of an already-queued card is a no-op that returns the existing entry. enqueuedAt/queueEpoch are
  // immutable for a live entry. Returns { ok, entry, deduped?, reason? }.
  function enqueueWorkItem(board, card, opts = {}) {
    let existing = liveQueueEntryForCard(board.id, card.id);
    if (existing) return { ok: true, entry: existing, deduped: true };
    let principal = daemonPrincipal();
    let gateResult = gate('daemon.bookkeeping', principal, { boardId: board.id, cardId: card.id });
    if (!gateResult.ok) return { ok: false, reason: 'enqueue_gate_blocked', gate: gateResult };
    let enqueuedAt = now();
    let queueEpoch = readQueueEpoch(board.id);
    let admissionId = computeAdmissionId(board.id, card.id, enqueuedAt, queueEpoch);
    let notBefore = finiteNumber(opts.notBefore);
    // Priority inheritance (AD-5, inv 24): the admission-ordering priority is the MAX of this card's
    // own priority and every transitive downstream waiter's priority, so an upstream feeding a
    // high-priority dependent is admitted ahead of unrelated low-priority cards and never starved.
    // This is the enqueue-time snapshot; admissionOrder recomputes the inheritance LIVE at order time
    // so a dependent linked AFTER enqueue still lifts the frozen value (effectiveAdmissionPrioritiesFor).
    let entry = {
      schema: 'workflow-queue-entry/v1',
      admissionId,
      cardId: card.id,
      boardId: board.id,
      columnId: card.columnId,
      groupKey: resolveGroupKey(card),
      priority: effectiveAdmissionPriority(card, board),
      basePriority: priorityOrdinal(card.priority),
      priorityLabel: textOrNull(card.priority) ?? 'normal',
      enqueuedAt,
      queueEpoch,
      notBefore: notBefore ?? null,
    };
    let queued = normalizeWorkflowCardInput({
      ...card,
      lifecycle: 'queued',
      version: card.version + 1,
      updatedAt: enqueuedAt,
      updatedBy: principal.label,
    }, {
      id: card.id,
      actor: principal.label,
      now: enqueuedAt,
      version: card.version + 1,
      createdAt: card.createdAt,
      updatedAt: enqueuedAt,
    });
    // inv 36: the enqueue write is commitCAS-guarded on the queue epoch and durable; a stale-epoch
    // racer writes nothing. The one-live-entry uniqueness is enforced by the existing-entry check
    // above plus the synchronous CAS frame (no await between read and write).
    let res = stateGraph.commitCAS(
      `workflowQueueEpoch/${board.id}`,
      queueEpoch,
      [
        { op: 'set', path: `workflowQueueEntries/${admissionId}`, value: entry },
        { op: 'set', path: `workflowCards/${card.id}`, value: queued },
      ],
      sourceForPrincipal(principal),
      { durable: true },
    );
    if (!res.ok) return { ok: false, reason: 'queue_contended', currentEpoch: res.currentEpoch };
    return { ok: true, entry, card: queued };
  }

  // Deterministic, restart-stable admission order (inv 6): group round-robin off the persisted
  // cursor → priority desc → enqueuedAt asc → cardId asc. The cursor names the LAST group admitted;
  // groups after it (wrapping) sort first, so the next pass starts a different group — round-robin.
  function admissionOrder(boardId, entries) {
    let cursorGroup = textOrNull(stateGraph.get(`workflowQueueCursor/${boardId}`)?.groupKey);
    // inv 24 (live): recompute priority inheritance at order time so an upstream that gained a
    // high-priority dependent AFTER it was enqueued is no longer starved behind its frozen-low
    // entry.priority. Compute the transitive-max for every card once and override the comparison with
    // the live ordinal (falling back to the frozen value if a card is somehow absent from the board).
    let { effective: livePriority } = effectiveAdmissionPrioritiesFor(ensureBoard(boardId));
    let groups = [...new Set(entries.map(entry => entry.groupKey))].sort(compareCodeUnits);
    let rank = new Map();
    if (groups.length) {
      // F-SCH-5: round-robin fairness. The cursor names the last-admitted group; the next pass starts
      // at the group AFTER it. When that group has since drained (absent from `groups`), do not reset
      // to group 0 (which re-starves whatever was already served) — continue from the position the
      // cursor occupied by inserting it into the sorted order and resuming at the next index.
      let start;
      if (!cursorGroup) {
        start = 0;
      } else {
        let idx = groups.indexOf(cursorGroup);
        if (idx >= 0) {
          start = idx + 1;
        } else {
          // Cursor group drained: find where it WOULD sit and continue from the next surviving group.
          let insertAt = groups.findIndex(group => compareCodeUnits(group, cursorGroup) > 0);
          start = insertAt < 0 ? 0 : insertAt;
        }
      }
      for (let i = 0; i < groups.length; i += 1) {
        rank.set(groups[(start + i) % groups.length], i);
      }
    }
    return entries.slice().sort((a, b) => {
      let groupDelta = (rank.get(a.groupKey) ?? 0) - (rank.get(b.groupKey) ?? 0);
      if (groupDelta !== 0) return groupDelta;
      let pa = livePriority.get(a.cardId) ?? a.priority;
      let pb = livePriority.get(b.cardId) ?? b.priority;
      if (pa !== pb) return pb - pa;
      if (a.enqueuedAt !== b.enqueuedAt) return a.enqueuedAt - b.enqueuedAt;
      // F-SCH-4: deterministic code-unit tiebreak (locale-independent, restart-stable across hosts).
      return compareCodeUnits(a.cardId, b.cardId);
    });
  }

  // ── Board-native task dependencies (WS-B2; AD-5, inv 21-24) ───────────────────────────────────
  // A card's `dependsOn: [{ cardId, releaseWhen, onUpstreamFailure }]` (frozen iso vocabulary) gates
  // its admission: while any upstream edge is unsatisfied the dependent sits `idle↔blocked` (the only
  // lifecycle transition this path owns — the scheduler still owns queued→admitting→running). The
  // release tick (releaseDependencies) runs at the TOP of every admission pass, before drain: a
  // blocked card whose every edge is satisfied is enqueued (blocked→queued via the S8 enqueue path).
  // Failure propagation (an upstream terminal-failure or deletion) resolves each downstream edge per
  // its `onUpstreamFailure` so a dependent is never left silently blocked forever (inv 22). Cycles are
  // rejected at link (and re-checked at import + admission, inv 23). Priority inheritance lifts an
  // upstream's admission priority to the max over its transitive waiters so a chain feeding a
  // high-priority card is not starved (inv 24).

  function boardCardsFor(boardId) {
    return Object.values(getCollection(stateGraph, 'workflowCards')).filter(card => card.boardId === boardId);
  }

  function cardDependsOn(card) {
    return normalizeWorkflowDependsOn(card?.dependsOn ?? card?.depends_on);
  }

  // Is one `dependsOn` edge satisfied? `releaseWhen` selects the signal; a missing/deleted upstream is
  // NOT "satisfied" here — the failure path (propagateUpstreamResolution) owns that resolution.
  function dependencyEdgeSatisfied(dep, upstreamCard, upstreamRuns, upstreamChecks, classifier) {
    if (!upstreamCard) return false;
    switch (dep.releaseWhen) {
      case 'run_success':
        // Data-driven success signal. NOTE (inv 21): `run_success` is unsafe while the upstream can
        // still bounce backward via `rework_authorized` — a successful run does not pin the card in a
        // terminal column, so the release may fire before the upstream's work is durably done. It is
        // offered as an explicit opt-in; `card_done` is the safe default.
        return (upstreamRuns ?? []).some(run => ['success', 'completed'].includes(textOrNull(run.status)));
      case 'audit_passed':
        // Audit floor check signed off (reuse the iso `checkPassed` truth table).
        return checkPassed((upstreamChecks ?? {}).audit);
      case 'card_done':
      default:
        // Safe default: the upstream card reached a TERMINAL column. The terminal set is data-driven
        // off the board's `automation.action:'close'` classification — never the hardcoded 'done' id.
        return classifier.isTerminal(upstreamCard.columnId);
    }
  }

  // Is every edge of a dependent satisfied? An edge whose upstream resolved via `release`-on-failure
  // is treated as satisfied (recorded on the dependent's dependencyBlock.releasedEdges). A join card
  // carries `metadata.joinPolicy` (S5); the per-edge truth is folded by that policy instead of a flat
  // AND. A normal card has no joinPolicy, so the AND fast path below is byte-identical to before.
  function allDependenciesSatisfied(card, board, classifier, releasedEdges) {
    let deps = cardDependsOn(card);
    if (!deps.length) return true;
    let released = releasedEdges instanceof Set ? releasedEdges : new Set(releasedEdges ?? []);
    let policy = card?.metadata?.joinPolicy;
    if (policy) return joinPolicySatisfied(card, deps, released, classifier, policy);
    for (let dep of deps) {
      if (released.has(dep.cardId)) continue;
      let upstream = stateGraph.get(`workflowCards/${dep.cardId}`);
      let satisfied = dependencyEdgeSatisfied(
        dep,
        upstream,
        upstream ? getRunsForCard(upstream.id) : [],
        upstream ? getChecks(upstream.id) : {},
        classifier,
      );
      if (!satisfied) return false;
    }
    return true;
  }

  // Per-edge satisfaction reduced by a join policy. The per-edge boolean is computed ONCE here (same
  // `dependencyEdgeSatisfied` / `released.has` truth the AND loop uses) and folded by `policy.type`:
  // `all` mirrors the flat AND; `any` needs one edge; `quorum` needs >= policy.k; `all_settled` needs
  // every edge to be either edge-satisfied OR released (a released edge = settled-by-failure), i.e. no
  // edge still pending. Pure/read-only.
  function joinPolicySatisfied(card, deps, released, classifier, policy) {
    let satisfiedCount = 0;
    let settledCount = 0;
    // A released edge = settled-by-failure (its onUpstreamFailure resolved to `release`); for the
    // materialized join, an all_settled subscription maps failures to `release`, so a failed member
    // arrives here already released. (A non-release/escalating edge is governed by failure propagation,
    // not by this count.)
    for (let dep of deps) {
      let isReleased = released.has(dep.cardId);
      let edgeSatisfied = isReleased;
      if (!isReleased) {
        let upstream = stateGraph.get(`workflowCards/${dep.cardId}`);
        edgeSatisfied = dependencyEdgeSatisfied(
          dep,
          upstream,
          upstream ? getRunsForCard(upstream.id) : [],
          upstream ? getChecks(upstream.id) : {},
          classifier,
        );
      }
      if (edgeSatisfied) satisfiedCount += 1;
      if (edgeSatisfied || isReleased) settledCount += 1;
    }
    switch (policy.type) {
      case 'any':
        return satisfiedCount >= 1;
      case 'quorum':
        return satisfiedCount >= (Number(policy.k) || deps.length);
      case 'all_settled':
        return settledCount === deps.length;
      case 'all':
      default:
        return satisfiedCount === deps.length;
    }
  }

  function dependencyBlockState(card) {
    let block = card?.metadata?.dependencyBlock;
    return block && typeof block === 'object' ? block : null;
  }

  function releasedEdgesFor(card) {
    let block = dependencyBlockState(card);
    return new Set(Array.isArray(block?.releasedEdges) ? block.releasedEdges : []);
  }

  // Cycle check (inv 23). Linking `dependent → upstream` closes a cycle iff `dependent` is already
  // reachable FROM `upstream` in the current dependency closure (transitive DFS, not depth-1). A
  // self-link is trivially a cycle.
  function wouldCreateDependencyCycle(boardId, dependentCardId, upstreamCardId) {
    if (dependentCardId === upstreamCardId) return true;
    let seen = new Set();
    let stack = [upstreamCardId];
    while (stack.length) {
      let next = stack.pop();
      if (next === dependentCardId) return true;
      if (seen.has(next)) continue;
      seen.add(next);
      for (let dep of cardDependsOn(stateGraph.get(`workflowCards/${next}`))) {
        stack.push(dep.cardId);
      }
    }
    return false;
  }

  // Does `card`'s current dependency closure contain a cycle (any card reachable from itself)? Used as
  // the defensive admission guard (inv 23) — a card whose closure is cyclic must not be admitted.
  function dependencyClosureIsCyclic(cardId) {
    let seen = new Set();
    let stack = [cardId];
    let first = true;
    while (stack.length) {
      let next = stack.pop();
      if (!first && next === cardId) return true;
      first = false;
      if (seen.has(next)) continue;
      seen.add(next);
      for (let dep of cardDependsOn(stateGraph.get(`workflowCards/${next}`))) {
        stack.push(dep.cardId);
      }
    }
    return false;
  }

  // Priority inheritance (inv 24). An upstream's effective admission priority is the MAX of its own
  // priority and every transitive downstream waiter's priority, so a chain feeding a high-priority
  // card is admitted with the inherited (elevated) priority and never starved while blocked cards sit
  // outside the queue. Bounded by the cycle-safe `seen` guard.
  function effectiveAdmissionPriority(card, board) {
    let boardId = board?.id ?? card.boardId;
    let cards = boardCardsFor(boardId);
    // downstream adjacency: upstreamId → [dependent cards that wait on it]
    let waitersOf = new Map();
    for (let dependent of cards) {
      for (let dep of cardDependsOn(dependent)) {
        if (!waitersOf.has(dep.cardId)) waitersOf.set(dep.cardId, []);
        waitersOf.get(dep.cardId).push(dependent);
      }
    }
    let best = priorityOrdinal(card.priority);
    let seen = new Set([card.id]);
    let stack = [...(waitersOf.get(card.id) ?? [])];
    while (stack.length) {
      let waiter = stack.pop();
      if (seen.has(waiter.id)) continue;
      seen.add(waiter.id);
      best = Math.max(best, priorityOrdinal(waiter.priority));
      for (let next of waitersOf.get(waiter.id) ?? []) {
        if (!seen.has(next.id)) stack.push(next);
      }
    }
    return best;
  }

  // inv 24 (live): effective admission priorities for every card on the board, computed in one pass so
  // admissionOrder reflects priority inheritance recomputed live at order time (not just the value
  // frozen into entry.priority at enqueue). Builds the downstream `waitersOf` adjacency once (same
  // construction as effectiveAdmissionPriority) and memoizes each card's transitive-max over the shared
  // map — bounded O(cards + edges) total, cycle-safe via the per-walk `seen` guard. Returns a Map
  // cardId → effective ordinal.
  function effectiveAdmissionPrioritiesFor(board) {
    let cards = boardCardsFor(board.id);
    let waitersOf = new Map();
    for (let dependent of cards) {
      for (let dep of cardDependsOn(dependent)) {
        if (!waitersOf.has(dep.cardId)) waitersOf.set(dep.cardId, []);
        waitersOf.get(dep.cardId).push(dependent);
      }
    }
    let byId = new Map(cards.map(card => [card.id, card]));
    let memo = new Map();
    function effectiveFor(card) {
      let cached = memo.get(card.id);
      if (cached !== undefined) return cached;
      let best = priorityOrdinal(card.priority);
      let seen = new Set([card.id]);
      let stack = [...(waitersOf.get(card.id) ?? [])];
      while (stack.length) {
        let waiter = stack.pop();
        if (seen.has(waiter.id)) continue;
        seen.add(waiter.id);
        best = Math.max(best, priorityOrdinal(waiter.priority));
        for (let next of waitersOf.get(waiter.id) ?? []) {
          if (!seen.has(next.id)) stack.push(next);
        }
      }
      memo.set(card.id, best);
      return best;
    }
    for (let card of cards) effectiveFor(card);
    return { byId, effective: memo };
  }

  function dependencyLifecycleCard(card, lifecycle, principal, ts, metadata) {
    return normalizeWorkflowCardInput({
      ...card,
      lifecycle,
      metadata: metadata ?? card.metadata,
      version: card.version + 1,
      updatedAt: ts,
      updatedBy: principal.label,
    }, {
      id: card.id,
      actor: principal.label,
      now: ts,
      version: card.version + 1,
      createdAt: card.createdAt,
      updatedAt: ts,
    });
  }

  // Persist the dependent into `blocked` (idle→blocked), stamping the blocked-age clock so the
  // max-blocked-age escalation has a durable start time. Idempotent if already blocked.
  function commitDependencyBlock(board, card, principal) {
    if (normalizeWorkflowLifecycle(card.lifecycle) === 'blocked') return card;
    if (!isWorkflowLifecycleTransitionAllowed(card.lifecycle, 'blocked', 'dependency')) return card;
    let ts = now();
    let metadata = { ...(card.metadata ?? {}) };
    let block = dependencyBlockState(card) ?? {};
    metadata.dependencyBlock = {
      blockedAt: Number(block.blockedAt) || ts,
      releasedEdges: Array.isArray(block.releasedEdges) ? block.releasedEdges : [],
    };
    let blocked = dependencyLifecycleCard(card, 'blocked', principal, ts, metadata);
    stateGraph.commit([{ op: 'set', path: `workflowCards/${card.id}`, value: blocked }], sourceForPrincipal(principal));
    return blocked;
  }

  // Persist the dependent out of `blocked` back to `idle` (blocked→idle), clearing the blocked-age
  // clock. The release tick / auto-admit path then decides whether to enqueue.
  function commitDependencyUnblock(card, principal) {
    if (normalizeWorkflowLifecycle(card.lifecycle) !== 'blocked') return card;
    let ts = now();
    let metadata = { ...(card.metadata ?? {}) };
    delete metadata.dependencyBlock;
    let idle = dependencyLifecycleCard(card, 'idle', principal, ts, metadata);
    stateGraph.commit([{ op: 'set', path: `workflowCards/${card.id}`, value: idle }], sourceForPrincipal(principal));
    return idle;
  }

  // Build the frozen-channel pieces of a typed `needs_decision` escalation: the normalized escalation
  // state (folded onto `card.metadata.escalation`) plus the `escalation` transition event for board
  // visibility. Returns the next metadata + event without committing, so callers can fold both into
  // their own (possibly CAS-fenced) frame. Shared by the release/max-blocked-age path and the
  // admission-time cycle guard (inv 22) so every escalation uses one vocabulary.
  function buildDependencyEscalation(board, card, principal, detail, suggestedResolution, ts) {
    let escalation = normalizeWorkflowEscalation(
      { kind: 'needs_decision', detail, suggestedResolution, raisedBy: principal.label },
      { now: ts },
    );
    let existing = card.metadata?.escalation ? normalizeWorkflowEscalationState(card.metadata.escalation) : null;
    let state = normalizeWorkflowEscalationState({
      lastEscalation: escalation,
      attemptCount: existing?.attemptCount ?? 0,
      firstAt: existing?.firstAt ?? ts,
      lastAt: ts,
      nextAttemptAt: existing?.nextAttemptAt ?? ts,
      humanEscalated: existing?.humanEscalated ?? false,
      history: [
        ...(existing?.history ?? []),
        { kind: 'needs_decision', detail, runId: null, at: ts },
      ],
    });
    let metadata = { ...(card.metadata ?? {}), escalation: state };
    let escId = nextId(makeId, 'escalation');
    let event = normalizeWorkflowTransitionEvent({
      id: escId,
      eventType: 'escalation',
      boardId: board.id,
      cardId: card.id,
      fromColumnId: card.columnId,
      toColumnId: card.columnId,
      actor: principal.label,
      mode: 'auto',
      reason: detail,
      status: 'accepted',
      sideEffects: [{ type: 'escalation', status: 'raised', kind: 'needs_decision', detail }],
    }, { id: escId, now: ts });
    return { metadata, event };
  }

  // Raise a typed `needs_decision` escalation on a card (the dependency-failure / max-blocked-age
  // path), keeping the card's current lifecycle. Returns the updated card.
  function raiseDependencyEscalation(board, card, principal, detail, suggestedResolution) {
    let ts = now();
    let { metadata, event } = buildDependencyEscalation(board, card, principal, detail, suggestedResolution, ts);
    let next = dependencyLifecycleCard(card, card.lifecycle, principal, ts, metadata);
    stateGraph.commit([
      { op: 'set', path: `workflowCards/${card.id}`, value: next },
      { op: 'set', path: `workflowTransitions/${event.id}`, value: event },
    ], sourceForPrincipal(principal));
    return next;
  }

  // Cancel a dependent (the `cancel_self` failure resolution): drive it to the board's terminal
  // (close) column and clear its dependency block. Best-effort — if the board has no terminal column
  // the lifecycle is still cleared so the card is not left silently blocked.
  function cancelDependentCard(board, card, principal, reason) {
    let ts = now();
    let classifier = classifyWorkflowGraph(board);
    // A cancelled dependent is a discard, not a success: retire it to the reject terminal (resolution
    // `cancelled`), falling back to any terminal column, then to staying put so the lifecycle still clears.
    let targetColumnId = rejectTerminalColumnId(board)
      ?? board.columns.find(column => classifier.isTerminal(column.id))?.id
      ?? card.columnId;
    let metadata = { ...(card.metadata ?? {}) };
    delete metadata.dependencyBlock;
    if (classifier.isTerminal(targetColumnId)) {
      metadata.resolution = { status: 'cancelled', reason, at: ts, by: principal.label };
    }
    let cancelled = normalizeWorkflowCardInput({
      ...card,
      lifecycle: 'idle',
      columnId: targetColumnId,
      metadata,
      version: card.version + 1,
      updatedAt: ts,
      updatedBy: principal.label,
    }, {
      id: card.id,
      actor: principal.label,
      now: ts,
      version: card.version + 1,
      createdAt: card.createdAt,
      updatedAt: ts,
    });
    let eventId = nextId(makeId, 'dependency');
    let event = normalizeWorkflowTransitionEvent({
      id: eventId,
      eventType: 'transition',
      boardId: board.id,
      cardId: card.id,
      fromColumnId: card.columnId,
      toColumnId: cancelled.columnId,
      actor: principal.label,
      mode: 'auto',
      reason,
      status: 'accepted',
      sideEffects: [{ type: 'dependency_resolution', resolution: 'cancel_self', detail: reason }],
    }, { id: eventId, now: ts });
    stateGraph.commit([
      { op: 'set', path: `workflowCards/${card.id}`, value: cancelled },
      { op: 'set', path: `workflowTransitions/${event.id}`, value: event },
    ], sourceForPrincipal(principal));
    return cancelled;
  }

  // Record an edge as `release`-resolved on the dependent so allDependenciesSatisfied treats it as
  // satisfied without waiting for the (failed/deleted) upstream's normal signal.
  function commitReleasedEdge(card, upstreamCardId, principal) {
    let ts = now();
    let metadata = { ...(card.metadata ?? {}) };
    let block = dependencyBlockState(card) ?? {};
    let releasedEdges = new Set(Array.isArray(block.releasedEdges) ? block.releasedEdges : []);
    releasedEdges.add(upstreamCardId);
    metadata.dependencyBlock = {
      blockedAt: Number(block.blockedAt) || ts,
      releasedEdges: [...releasedEdges],
    };
    let next = dependencyLifecycleCard(card, card.lifecycle, principal, ts, metadata);
    stateGraph.commit([{ op: 'set', path: `workflowCards/${card.id}`, value: next }], sourceForPrincipal(principal));
    return next;
  }

  // Is an upstream card already in a settled terminal-failure state? (F-DEP-2 level check.) True when
  // its latest run terminal-FAILED (error|failed|cancelled) and nothing is still in flight that could
  // clear it (no requested/running/recovering run). This is the level-triggered counterpart of the
  // reconcile edge-trigger (which only fires on a status TRANSITION): an upstream that was already
  // failed when the edge was linked never transitions, so the dependent would otherwise sit blocked
  // until the 24h max-blocked-age tick. A terminal SUCCESS is satisfaction, not failure, and is not
  // reported here.
  function upstreamInTerminalFailure(upstreamCard) {
    if (!upstreamCard) return false;
    let runs = getRunsForCard(upstreamCard.id);
    if (!runs.length) return false;
    if (runs.some(run => RUNNING_RUN_STATUSES.has(run.status))) return false;
    let latest = runs[runs.length - 1];
    return ['error', 'failed', 'cancelled'].includes(textOrNull(latest.status));
  }

  // Failure propagation (inv 22): an upstream reaching a terminal-failure or being deleted resolves
  // every downstream edge that points at it, per the dependent's `onUpstreamFailure`. Fan-in fast-fail:
  // a dependent with multiple edges resolves the moment ANY required edge terminal-fails (we do not
  // wait for the others). Never a silent permanent block.
  function propagateUpstreamResolution(upstreamCard, board, kind) {
    let principal = daemonPrincipal();
    let resolved = [];
    let detailKind = kind === 'deleted' ? 'was deleted' : 'reached a terminal failure';
    for (let dependent of boardCardsFor(board.id)) {
      let deps = cardDependsOn(dependent);
      let edge = deps.find(dep => dep.cardId === upstreamCard.id);
      if (!edge) continue;
      let live = clone(stateGraph.get(`workflowCards/${dependent.id}`));
      if (!live) continue;
      let detail = `Upstream dependency ${upstreamCard.id} ${detailKind}; resolving edge on ${dependent.id} per onUpstreamFailure=${edge.onUpstreamFailure}.`;
      if (edge.onUpstreamFailure === 'release') {
        commitReleasedEdge(live, upstreamCard.id, principal);
        resolved.push({ cardId: dependent.id, resolution: 'release' });
      } else if (edge.onUpstreamFailure === 'cancel_self') {
        cancelDependentCard(board, live, principal, detail);
        resolved.push({ cardId: dependent.id, resolution: 'cancel_self' });
      } else {
        // block_and_escalate (default): a typed needs_decision on the dependent — never a silent block.
        raiseDependencyEscalation(board, live, principal, detail, 'Decide whether to release, reroute, or cancel the dependent.');
        resolved.push({ cardId: dependent.id, resolution: 'block_and_escalate' });
      }
    }
    return resolved;
  }

  // Release tick (inv 21, 24): for each `blocked` card on the board, if every edge is satisfied →
  // enqueue it (blocked→queued via the S8 enqueue path). A card blocked past MAX_BLOCKED_AGE_MS
  // escalates to needs_decision (never a silent permanent block). Runs at the TOP of the admission
  // pass, before drain, and in the reconcile loop.
  function releaseDependencies(boardId) {
    let board = ensureBoard(boardId);
    let classifier = classifyWorkflowGraph(board);
    let principal = daemonPrincipal();
    let released = [];
    let escalated = [];
    let currentNow = now();
    for (let card of boardCardsFor(board.id)) {
      // Process blocked cards plus any JOIN card that has not yet woken its owner — a join whose
      // members were already satisfied at materialization is created `idle`, so the plain blocked
      // guard would skip it and the owner would never be woken.
      let pendingJoin = card.kind === 'join' && !card.metadata?.ownerNotifiedAt;
      if (normalizeWorkflowLifecycle(card.lifecycle) !== 'blocked' && !pendingJoin) continue;
      let live = clone(card);
      let releasedEdges = releasedEdgesFor(live);
      // F-DEP-2: level-trigger onUpstreamFailure. Before the satisfaction check, resolve any edge
      // whose upstream is ALREADY in a settled terminal-failure (the edge-triggered reconcile path
      // only fires on a status transition, so an already-failed upstream at link time never escalates
      // until the 24h tick). Apply the edge's policy now: release marks the edge satisfied,
      // cancel_self cancels the dependent, block_and_escalate raises needs_decision. After resolution
      // the dependent's state may change, so re-read it before the satisfaction check below.
      let resolvedAny = false;
      for (let dep of cardDependsOn(live)) {
        if (releasedEdges.has(dep.cardId)) continue;
        let upstream = stateGraph.get(`workflowCards/${dep.cardId}`);
        if (!upstreamInTerminalFailure(upstream)) continue;
        let detail = `Upstream dependency ${dep.cardId} reached a terminal failure; resolving edge on ${card.id} per onUpstreamFailure=${dep.onUpstreamFailure}.`;
        if (dep.onUpstreamFailure === 'release') {
          commitReleasedEdge(live, dep.cardId, principal);
        } else if (dep.onUpstreamFailure === 'cancel_self') {
          cancelDependentCard(board, live, principal, detail);
        } else {
          raiseDependencyEscalation(board, live, principal, detail, 'Decide whether to release, reroute, or cancel the dependent.');
        }
        resolvedAny = true;
      }
      if (resolvedAny) {
        let refreshed = stateGraph.get(`workflowCards/${card.id}`);
        // cancel_self moved the card off `blocked` (to its terminal column) — nothing more to do.
        if (!refreshed || normalizeWorkflowLifecycle(refreshed.lifecycle) !== 'blocked') continue;
        live = clone(refreshed);
        releasedEdges = releasedEdgesFor(live);
      }
      if (allDependenciesSatisfied(live, board, classifier, releasedEdges)) {
        // A satisfied JOIN card is not work to admit — it is a coordination barrier. Its release
        // wakes the owner through the return-loop (mint a `completed` return onto the owner) and
        // retires the join card, instead of enqueuing the synthetic card as a runnable item.
        if (live.kind === 'join') {
          let woke = wakeJoinOwner(board, live, principal);
          released.push({ cardId: card.id, join: true, ownerCardId: textOrNull(live.parentCardId), ownerWoken: woke });
          continue;
        }
        let idle = commitDependencyUnblock(live, principal);
        let enqueued = enqueueWorkItem(board, idle);
        if (enqueued.ok) released.push({ cardId: card.id, admissionId: enqueued.entry?.admissionId });
        continue;
      }
      let block = dependencyBlockState(live);
      let blockedAt = Number(block?.blockedAt);
      if (Number.isFinite(blockedAt) && (currentNow - blockedAt) >= MAX_BLOCKED_AGE_MS && !hasActiveEscalation(live)) {
        raiseDependencyEscalation(
          board,
          live,
          principal,
          `Card ${card.id} has been blocked on an unsatisfied dependency for over ${Math.floor(MAX_BLOCKED_AGE_MS / 3600000)}h.`,
          'Decide whether to release, reroute, or cancel the blocked card.',
        );
        escalated.push({ cardId: card.id });
      }
    }
    return { ok: true, boardId: board.id, released, escalated };
  }

  // Resolve the stale/aging budget for a card's current column: an explicit per-column/card
  // `automation.staleAgeMs` wins (0 disables), otherwise the module default. Returned in ms.
  function resolveColumnStaleAgeMs(automation = {}) {
    let override = Number(automation.staleAgeMs ?? automation.stale_age_ms);
    if (Number.isFinite(override)) return Math.max(0, override);
    return DEFAULT_COLUMN_STALE_AGE_MS;
  }

  // Stale/aging escalation (Axis C). Independent of the dependency-block clock (releaseDependencies):
  // a card that ran and stopped but was never advanced occupies its column and ages silently — no
  // dependency block, no concurrency pressure (its run is done), so nothing else flags it. For each
  // non-terminal card that has been worked (>=1 run), is not currently running, is not dependency-
  // blocked (that path owns its own clock), and carries no active escalation, escalate to a typed
  // `needs_decision` once its time-in-column exceeds the budget. Idempotent: the raised escalation
  // sets hasActiveEscalation, so a re-tick skips the card (no escalation spam). Runs in the reconcile
  // loop and at the top of the drain pass, mirroring releaseDependencies.
  function escalateStaleCards(boardId) {
    let board = ensureBoard(boardId);
    let classifier = classifyWorkflowGraph(board);
    let principal = daemonPrincipal();
    let currentNow = now();
    let escalated = [];
    for (let card of boardCardsFor(board.id)) {
      if (classifier.isTerminal(card.columnId)) continue;
      // A dependency-blocked card is the MAX_BLOCKED_AGE clock's domain — keep the two independent.
      if (normalizeWorkflowLifecycle(card.lifecycle) === 'blocked') continue;
      if (hasActiveEscalation(card)) continue;
      // A live run is progress, not staleness; and a card never worked is intake, not a stalled run.
      if (activeRunForCard(card.id)) continue;
      if (!getRunsForCard(card.id).length) continue;
      let budget = resolveColumnStaleAgeMs(cardAutomation(board, card));
      if (!(budget > 0)) continue;
      let enteredAt = Number(card.metadata?.enteredColumnAt);
      if (!Number.isFinite(enteredAt)) continue;
      let age = currentNow - enteredAt;
      if (age < budget) continue;
      let hours = budget / 3600000;
      let label = hours >= 1 ? `${Math.floor(hours)}h` : `${Math.max(1, Math.round(budget / 60000))}m`;
      raiseDependencyEscalation(
        board,
        card,
        principal,
        `Card ${card.id} has occupied column "${card.columnId}" for over ${label} after its run ended without being advanced.`,
        'Advance, re-run, or cancel the stalled card.',
      );
      escalated.push({ cardId: card.id, columnId: card.columnId, ageMs: age });
    }
    return { ok: true, boardId: board.id, escalated };
  }

  // Per-root convergence breach resolution (Step 4). The admission gate (perRootConvergenceAvailable,
  // ~1975) REFUSES a fresh re-decompose wave once a root hits its depth/fanout/runCount cap, but a
  // refusal alone leaves the breached root resting non-terminal — the happy-path loop would simply idle
  // instead of converging. This sweep is the active half: a releaseDependencies/escalateStaleCards
  // sibling run at the top of every admission pass that routes each capped root to a TERMINAL so the
  // HARD INVARIANT (every card reaches a terminal) holds even when the orchestrator keeps asking for
  // more waves. Per-root and orthogonal to tripBoardBudgetBreaker — it never pauses the board, it
  // resolves one root at a time. The root parks in the human-decision lane (parkCardForDecisionOps) with
  // a reason naming the breached dimensions + rootCardId; when the board defines no decision lane it is
  // retired to the reject terminal so it can never silently stall. Idempotent: a root already terminal,
  // or already carrying the convergence resolution marker, is skipped, so a re-tick never re-parks it.
  // The cap is MONOTONIC and PERMANENT for the root, so the breaching wave's just-created children are
  // un-admittable forever (admission refuses them, and they carry no run/escalation/return that any
  // backstop would catch). The sweep therefore cascade-cancels every non-terminal descendant of the
  // breached root that is not actively running — running members settle on their own, never-admitted
  // members are retired to the reject terminal — so no descendant is stranded non-terminal.
  function resolveRootConvergenceBreaches(boardId) {
    let board = ensureBoard(boardId);
    let classifier = classifyWorkflowGraph(board);
    let principal = daemonPrincipal();
    let index = rootIndex(board.id);
    let resolved = [];
    for (let root of index.descendantsByRoot.keys()) {
      let rootCard = index.byId.get(root);
      if (!rootCard) continue;
      let verdict = perRootConvergenceAvailable(board, rootCard);
      if (verdict.ok) continue;
      let ts = now();
      let reason = `Root ${verdict.root} hit its convergence cap (${formatRootConvergenceBreaches(verdict.breaches)}); the re-decompose loop is bounded — routing to a terminal for a decision.`;
      // Resolve the ROOT card itself at most once. A root auto-closed by decompositionClosesParent is
      // already terminal (the default), and a root routed for a prior breach carries the marker — in both
      // cases it needs no re-routing. The breaching SUBTREE is still cascaded below regardless: the cap is
      // a property of the subtree, not of the root card's column, so a closed root must not skip the cascade.
      let rootHandled = classifier.isTerminal(rootCard.columnId) || Boolean(rootCard.metadata?.rootConvergenceBreached);
      if (!rootHandled) {
        let breachMarker = {
          rootConvergenceBreached: {
            root: verdict.root, at: ts, breaches: verdict.breaches, counts: verdict.counts, limits: verdict.limits,
          },
        };
        let park = parkCardForDecisionOps(
          board, clone(rootCard), reason,
          { type: 'decision', resolution: 'needs_decision', detail: reason, rootConvergence: verdict.breaches },
          principal, ts, breachMarker,
        );
        if (park) {
          stateGraph.commit(park.ops, sourceForPrincipal(principal));
          resolved.push({ cardId: rootCard.id, root: verdict.root, terminal: 'decision', breaches: verdict.breaches });
        } else {
          // No decision lane configured — retire to the reject terminal so the breached root still terminates.
          let targetColumnId = rejectTerminalColumnId(board)
            ?? board.columns.find(column => classifier.isTerminal(column.id))?.id
            ?? null;
          if (targetColumnId) {
            let metadata = { ...asObject(rootCard.metadata), ...breachMarker };
            delete metadata.dependencyBlock;
            metadata.resolution = { status: 'rejected', reason, at: ts, by: principal.label };
            let retired = normalizeWorkflowCardInput({
              ...rootCard, columnId: targetColumnId, lifecycle: 'idle', metadata,
              version: rootCard.version + 1, updatedAt: ts, updatedBy: principal.label,
            }, {
              id: rootCard.id, actor: principal.label, now: ts,
              version: rootCard.version + 1, createdAt: rootCard.createdAt, updatedAt: ts,
            });
            let eventId = nextId(makeId, 'convergence');
            let event = normalizeWorkflowTransitionEvent({
              id: eventId, eventType: 'transition', boardId: board.id, cardId: rootCard.id,
              fromColumnId: rootCard.columnId, toColumnId: targetColumnId, actor: principal.label, mode: 'auto',
              reason, status: 'accepted',
              sideEffects: [{ type: 'root_convergence', resolution: 'rejected', root: verdict.root, breaches: verdict.breaches }],
            }, { id: eventId, now: ts });
            stateGraph.commit([
              { op: 'set', path: `workflowCards/${rootCard.id}`, value: retired },
              { op: 'set', path: `workflowTransitions/${event.id}`, value: event },
            ], sourceForPrincipal(principal));
            resolved.push({ cardId: rootCard.id, root: verdict.root, terminal: 'rejected', breaches: verdict.breaches });
          }
        }
      }
      // Always cascade the breaching subtree's un-admittable descendants to a terminal — idempotent
      // (already-terminal / still-running members are skipped), so this no-ops once a wave is retired and
      // also catches a LATER wave's fresh children that the one-shot root marker would otherwise miss.
      cascadeBreachedRootDescendants(board, index, root, classifier, principal, reason);
    }
    return { ok: true, boardId: board.id, resolved };
  }

  // Cascade the convergence breach to the breached root's descendants. The cap is monotonic per root, so
  // a refused wave's just-created children (parentCardId lineage, no dependsOn edge to the root) can never
  // be admitted and are caught by no other backstop (escalateStaleCards skips never-run cards; the
  // re-engagement driver needs an escalation or queued return; cancelDependentCard cascades only along
  // dependsOn, not parentCardId). This retires every non-terminal, non-running descendant of the root to
  // the reject terminal so none is stranded — the root itself was already resolved by the caller, and a
  // descendant with a live run is left to settle on its own.
  function cascadeBreachedRootDescendants(board, index, root, classifier, principal, reason) {
    let group = index.descendantsByRoot.get(root) ?? [];
    for (let member of group) {
      if (member.id === root) continue;
      let live = stateGraph.get(`workflowCards/${member.id}`);
      if (!live) continue;
      if (classifier.isTerminal(live.columnId)) continue;
      if (activeRunForCard(live.id)) continue;
      cancelDependentCard(board, live, principal, reason);
    }
  }

  // Materialize a `join` subscription as a synthetic dependent card (S5). The join `dependsOn` every
  // member (releaseWhen: card_done); the per-member `onUpstreamFailure` is mapped from the
  // subscription's onFailure — `all_settled` => `release` (a failed member counts as settled, so the
  // all_settled / quorum / any policies release once a member is done-or-failed), and the default
  // `fail_fast` => `block_and_escalate` (a failed member hard-interrupts the join). The joinPolicy is
  // stored on `metadata.joinPolicy` so allDependenciesSatisfied folds the member edges by policy.
  // Reuses the createOrUpdateCard write path (which re-checks the cycle guard) and lifts the join's
  // priority to the max member priority via effectiveAdmissionPriority. Returns the created card, or
  // `{ ok:false, reason }` on a self-referential/cyclic join.
  function materializeJoinCard(board, subscription, ownerCardId, principal = resolvePrincipal(), options = {}) {
    let normalized = normalizeWorkflowSubscription(subscription);
    if (!normalized || normalized.mode !== 'join') return { ok: false, reason: 'not_a_join' };
    let ensuredBoard = ensureBoard(board?.id ?? board ?? DEFAULT_WORKFLOW_BOARD_ID);
    let onUpstreamFailure = normalized.onFailure === 'all_settled' ? 'release' : 'block_and_escalate';
    let releaseWhen = normalized.releaseWhen ?? 'card_done';
    let dependsOn = normalized.members.map(cardId => ({
      cardId,
      releaseWhen,
      onUpstreamFailure,
    }));
    let joinId = nextId(makeId, 'join');
    // Reject a self-referential or cyclic join before committing (a member equal to the join, or a
    // member that already reaches the join in the dependency closure).
    for (let dep of dependsOn) {
      if (wouldCreateDependencyCycle(ensuredBoard.id, joinId, dep.cardId)) {
        return { ok: false, reason: 'dependency_cycle', upstreamCardId: dep.cardId };
      }
    }
    // Lift the join's priority to the max member priority so a join feeding on a high-priority member
    // inherits the elevated admission ordinal (reuses effectiveAdmissionPriority's ordinal model).
    let liftedOrdinal = normalized.members.reduce((best, memberId) => {
      let member = stateGraph.get(`workflowCards/${memberId}`);
      let lifted = member ? effectiveAdmissionPriority(member, ensuredBoard) : 0;
      return Math.max(best, lifted);
    }, 0);
    let owner = stateGraph.get(`workflowCards/${ownerCardId}`);
    // Re-armable per-wave join (S6): stamp the originating wave on the join so a later wave's
    // orchestrate reuse guard skips a retired prior-wave join and mints a fresh one. Defaults to the
    // owner's live decomposeWaveSeq, so a never-decomposed single-wave owner keeps waveSeq 0.
    let joinWaveSeq = options.waveSeq ?? (Number(owner?.metadata?.decomposeWaveSeq) || 0);
    let created = createOrUpdateCard({
      id: joinId,
      boardId: ensuredBoard.id,
      columnId: 'backlog',
      kind: 'join',
      title: `Join: ${ownerCardId ?? joinId}`,
      priority: priorityLabel(liftedOrdinal),
      parentCardId: ownerCardId ?? null,
      projectId: owner?.projectId ?? null,
      domain: owner?.domain ?? null,
      owner: owner?.owner ?? 'orchestrator',
      dependsOn,
      metadata: { joinPolicy: normalized.joinPolicy, subscription: normalized, waveSeq: joinWaveSeq },
    }, principal);
    if (!created.ok) {
      return { ok: false, reason: created.failures?.[0]?.gate ?? 'join_create_failed', detail: created };
    }
    return created.card;
  }

  // Route a child/join return to its PARENT (owner) inbox (S5): mint a `routed` copy of `sourceEvent`
  // keyed on the parent (correlationId = parentId) and coalesce it onto the owner card's metadata.returns,
  // returning the owner `set` op for the caller's reconcile batch (or null when the owner is missing).
  // A still-live child's typed return reaches the orchestrator parent through this seam BEFORE all
  // children settle — the only prior parent delivery was wakeJoinOwner at full-join completion. The
  // eventId is deterministic on sourceEvent.eventId + parentId, so re-routing the same source on a
  // still-running run is a coalesce no-op (no double-wake). Skips when no parentId or no owner card.
  //
  // `drafts` is an optional per-pass Map<ownerId, ownerCard>: in a single reconcile pass several siblings
  // can route to the SAME parent, and each produces a whole-object owner `set` over the same path. Without
  // the draft, every call reads the identical PRE-PASS committed owner (the pass's ops are not yet applied)
  // and the last set silently overwrites the others (state-graph commit has no same-path merge). When a
  // draft map is supplied, each route reads/writes the accumulated owner draft so the returns stack, and
  // the caller flushes ONE op per owner after the loop.
  function routeReturnToParent(parentId, sourceEvent, ts, principal, drafts = null) {
    let ownerId = textOrNull(parentId);
    if (!ownerId || !sourceEvent) return null;
    let owner = (drafts && drafts.get(ownerId)) || stateGraph.get(`workflowCards/${ownerId}`);
    if (!owner) return null;
    let eventId = `routed-${crypto.createHash('sha256').update(`${sourceEvent.eventId ?? ''}:${ownerId}`).digest('hex').slice(0, 24)}`;
    let returnEvent = normalizeWorkflowReturnEvent(
      { kind: sourceEvent.kind, detail: sourceEvent.detail, payload: sourceEvent.payload },
      { now: ts, correlationId: ownerId, raisedBy: ESCALATION_ACTOR, eventId, routed: true },
    );
    if (!returnEvent) return null;
    let nextReturns = coalesceReturnEvents(owner.metadata?.returns, returnEvent);
    let ownerNext = normalizeWorkflowCardInput({
      ...owner,
      metadata: { ...(owner.metadata && typeof owner.metadata === 'object' ? owner.metadata : {}), returns: nextReturns },
      version: owner.version + 1,
      updatedAt: ts,
      updatedBy: principal.label,
    }, {
      id: owner.id,
      actor: principal.label,
      now: ts,
      version: owner.version + 1,
      createdAt: owner.createdAt,
      updatedAt: ts,
    });
    if (drafts) drafts.set(ownerId, ownerNext);
    return { op: 'set', path: `workflowCards/${ownerId}`, value: ownerNext };
  }

  // A released JOIN card wakes its owner (S5): mint a `completed` return onto the owner's inbox so the
  // orchestrator re-engages through the SAME return-loop driver (reconcileWorkflowEscalations), then
  // retire the join card to a terminal column. Idempotent — `metadata.ownerNotifiedAt` plus the
  // deterministic per-join eventId guard against any double-wake. Returns whether an owner was woken.
  function wakeJoinOwner(board, joinCard, principal) {
    let ts = now();
    if (joinCard.metadata?.ownerNotifiedAt) {
      commitDependencyUnblock(joinCard, principal);
      return false;
    }
    let ownerId = textOrNull(joinCard.parentCardId);
    let members = cardDependsOn(joinCard).map(dep => dep.cardId);
    let terminalColumnId = (board.columns ?? []).find(col => col?.automation?.action === 'close')?.id
      ?? (board.columns ?? []).find(col => col?.id === 'done')?.id
      ?? joinCard.columnId;
    let retiredMetadata = { ...(joinCard.metadata ?? {}), ownerNotifiedAt: ts };
    delete retiredMetadata.dependencyBlock;
    let retired = normalizeWorkflowCardInput({
      ...joinCard,
      columnId: terminalColumnId,
      lifecycle: 'idle',
      metadata: retiredMetadata,
      version: joinCard.version + 1,
      updatedAt: ts,
      updatedBy: principal.label,
    }, {
      id: joinCard.id,
      actor: principal.label,
      now: ts,
      version: joinCard.version + 1,
      createdAt: joinCard.createdAt,
      updatedAt: ts,
    });
    let ops = [{ op: 'set', path: `workflowCards/${joinCard.id}`, value: retired }];
    let ownerWoken = false;
    if (ownerId) {
      // The join completion is itself a `completed` return routed to the owner — mint it through the
      // shared routeReturnToParent helper. The synthetic source carries the stable per-join eventId so
      // the routed copy's deterministic eventId is unchanged across reconcile passes (no double-wake).
      let joinEventId = `join-${crypto.createHash('sha256').update(joinCard.id).digest('hex').slice(0, 20)}`;
      let ownerOp = routeReturnToParent(
        ownerId,
        { kind: 'completed', payload: { join: joinCard.id, members }, eventId: joinEventId },
        ts,
        principal,
      );
      if (ownerOp) {
        ops.push(ownerOp);
        ownerWoken = true;
      }
    }
    let eventId = nextId(makeId, 'join');
    let event = normalizeWorkflowTransitionEvent({
      id: eventId,
      eventType: 'join',
      boardId: board.id,
      cardId: joinCard.id,
      fromColumnId: joinCard.columnId,
      toColumnId: terminalColumnId,
      actor: principal.label,
      mode: 'auto',
      reason: ownerWoken ? `Join satisfied; woke owner ${ownerId}.` : 'Join satisfied; no owner to wake.',
      status: 'accepted',
      sideEffects: [{ type: 'join_release', ownerCardId: ownerId, members }],
    }, { id: eventId, now: ts });
    ops.push({ op: 'set', path: `workflowTransitions/${event.id}`, value: event });
    stateGraph.commit(ops, sourceForPrincipal(principal));
    return ownerWoken;
  }

  // Link a dependency: set/extend the dependent's `dependsOn` with `{ cardId|dependsOnCardId }`
  // upstream edges. Gated as a card mutation (card.write). Rejects (no commit) on a cycle (inv 23).
  // After link, recompute the dependent's lifecycle: an unsatisfied edge on an idle/blocked card →
  // blocked; an already-satisfied set leaves it idle for the release tick (or immediate enqueue if its
  // column auto-admits).
  function linkDependency(args = {}, context = {}) {
    let principal = resolvePrincipal(context);
    let cardId = textOrNull(args.cardId ?? args.card_id);
    if (!cardId) throw new Error('linkDependency requires cardId.');
    let linkGate = gate(
      isDaemonPrincipal(principal) ? 'daemon.bookkeeping' : 'card.write',
      principal,
      { cardId },
    );
    if (!linkGate.ok) return linkGate;
    let card = getCard(cardId);
    let board = ensureBoard(card.boardId);
    let additions = normalizeWorkflowDependsOn(args.dependsOn ?? args.depends_on);
    if (!additions.length) return { ok: false, reason: 'no_dependencies', card };
    for (let dep of additions) {
      if (!stateGraph.get(`workflowCards/${dep.cardId}`)) {
        return { ok: false, reason: 'upstream_not_found', upstreamCardId: dep.cardId, card };
      }
      if (wouldCreateDependencyCycle(board.id, cardId, dep.cardId)) {
        return { ok: false, reason: 'dependency_cycle', upstreamCardId: dep.cardId, card };
      }
    }
    let byCardId = new Map(cardDependsOn(card).map(dep => [dep.cardId, dep]));
    for (let dep of additions) byCardId.set(dep.cardId, dep);
    let nextDependsOn = [...byCardId.values()];
    let ts = now();
    let linked = normalizeWorkflowCardInput({
      ...card,
      dependsOn: nextDependsOn,
      version: card.version + 1,
      updatedAt: ts,
      updatedBy: principal.label,
    }, {
      id: card.id,
      actor: principal.label,
      now: ts,
      version: card.version + 1,
      createdAt: card.createdAt,
      updatedAt: ts,
    });
    stateGraph.commit([{ op: 'set', path: `workflowCards/${card.id}`, value: linked }], sourceForPrincipal(principal));
    let outcome = recomputeDependencyLifecycle(board, linked, principal);
    return { ok: true, card: outcome.card, dependsOn: outcome.card.dependsOn, lifecycle: outcome.card.lifecycle, ...outcome.extra };
  }

  // Unlink a dependency: remove the `{ cardId|dependsOnCardId }` upstream edge(s) from the dependent.
  // Gated as a card mutation. After unlink, recompute lifecycle (a now-fully-satisfied card clears to
  // idle/enqueues; a still-blocked card stays blocked).
  function unlinkDependency(args = {}, context = {}) {
    let principal = resolvePrincipal(context);
    let cardId = textOrNull(args.cardId ?? args.card_id);
    if (!cardId) throw new Error('unlinkDependency requires cardId.');
    let unlinkGate = gate(
      isDaemonPrincipal(principal) ? 'daemon.bookkeeping' : 'card.write',
      principal,
      { cardId },
    );
    if (!unlinkGate.ok) return unlinkGate;
    let card = getCard(cardId);
    let board = ensureBoard(card.boardId);
    let removeIds = new Set(
      normalizeWorkflowDependsOn(
        args.dependsOn ?? args.depends_on ?? args.dependsOnCardId ?? args.depends_on_card_id ?? args.upstreamCardId,
      ).map(dep => dep.cardId),
    );
    if (!removeIds.size) return { ok: false, reason: 'no_dependencies', card };
    let nextDependsOn = cardDependsOn(card).filter(dep => !removeIds.has(dep.cardId));
    let ts = now();
    let metadata = { ...(card.metadata ?? {}) };
    let block = dependencyBlockState(card);
    if (block && Array.isArray(block.releasedEdges)) {
      let releasedEdges = block.releasedEdges.filter(id => !removeIds.has(id));
      metadata.dependencyBlock = { ...block, releasedEdges };
    }
    let unlinked = normalizeWorkflowCardInput({
      ...card,
      dependsOn: nextDependsOn,
      metadata,
      version: card.version + 1,
      updatedAt: ts,
      updatedBy: principal.label,
    }, {
      id: card.id,
      actor: principal.label,
      now: ts,
      version: card.version + 1,
      createdAt: card.createdAt,
      updatedAt: ts,
    });
    stateGraph.commit([{ op: 'set', path: `workflowCards/${card.id}`, value: unlinked }], sourceForPrincipal(principal));
    let outcome = recomputeDependencyLifecycle(board, unlinked, principal);
    return { ok: true, card: outcome.card, dependsOn: outcome.card.dependsOn, lifecycle: outcome.card.lifecycle, ...outcome.extra };
  }

  // ── Board-policy authoring surface (WS-C; inv 8, 11) ──────────────────────────────────────────
  // Authoring a column/transition/gate is policy.define (DEFINE → pendingApproval for a non-author).
  // Every mutation re-runs validateWorkflowTransitionGraph on the proposed next board and REJECTS
  // (without committing) if the graph is invalid, so the board can never be authored into an
  // unoperable state (inv 11). A successful author commits durably and bumps the board version.

  function bumpBoardVersion(board) {
    return Number.isFinite(Number(board.version)) ? Math.floor(Number(board.version)) + 1 : 1;
  }

  // A define mutation: validate the proposed next board, reject on the first validator error without
  // committing, else commit the board and return the durable clone. The gate has already passed.
  function commitDefinedBoard(nextBoard, principal, extra = {}) {
    let validation = validateWorkflowTransitionGraph(nextBoard);
    if (!validation.ok) {
      let first = validation.errors[0];
      return {
        ok: false,
        status: 'blocked',
        failures: [{ gate: 'invalid_board_graph', code: first.code, reason: first.detail }],
      };
    }
    stateGraph.commit(
      [{ op: 'set', path: `workflowBoards/${nextBoard.id}`, value: nextBoard }],
      sourceForPrincipal(principal),
    );
    return { ok: true, board: clone(nextBoard), ...extra };
  }

  // define_column: add OR update a board column. Gate policy.define. Apply to board.columns (insert at
  // `after`/`position` for a new column; in-place update for an existing one), re-validate the graph,
  // commit durably, bump version.
  function defineWorkflowColumn(args = {}, context = {}) {
    let principal = resolvePrincipal(context);
    let board = ensureBoard(args.boardId ?? args.board_id ?? DEFAULT_WORKFLOW_BOARD_ID);
    let policyGate = gate(
      isDaemonPrincipal(principal) ? 'daemon.bookkeeping' : 'policy.define',
      principal,
      { boardId: board.id },
    );
    if (!policyGate.ok) return policyGate;
    let columnId = textOrNull(args.columnId ?? args.column_id ?? args.id);
    if (!columnId) throw new Error('defineWorkflowColumn requires columnId.');
    let ts = now();
    let columns = Array.isArray(board.columns) ? board.columns.slice() : [];
    let index = columns.findIndex(column => column.id === columnId);
    let title = textOrNull(args.title);
    let automationPatch = asObject(args.automation);
    let entryPointInput = args.entryPoint ?? args.entry_point;
    if (index >= 0) {
      let current = columns[index];
      columns[index] = {
        ...current,
        title: title ?? current.title,
        // Preserve the existing marker when the patch omits it; an explicit value (even false) wins.
        entryPoint: entryPointInput === undefined
          ? normalizeColumnEntryPoint(current.entryPoint)
          : normalizeColumnEntryPoint(entryPointInput),
        automation: Object.keys(automationPatch).length
          ? normalizeWorkflowAutomation({ ...asObject(current.automation), ...automationPatch })
          : asObject(current.automation),
      };
    } else {
      let column = {
        id: columnId,
        title: title ?? columnId,
        entryPoint: normalizeColumnEntryPoint(entryPointInput),
        automation: normalizeWorkflowAutomation(automationPatch),
      };
      let position = resolveColumnInsertIndex(columns, args, columns.length);
      columns.splice(position, 0, column);
    }
    // Closed action vocabulary (fail-closed). A column's automation.action selects its runtime behavior
    // class from the dispatch table; an action absent from that table has no dispatch and is rejected at
    // this authoring boundary, mirroring the closed gate vocabulary. Absent action is allowed (a passive
    // waypoint column); only a present-but-unknown action is rejected.
    let definedAction = textOrNull(columns.find(column => column.id === columnId)?.automation?.action);
    if (definedAction && !isKnownWorkflowAction(definedAction)) {
      throw new Error(`Unknown column action "${definedAction}". Supported: ${WORKFLOW_COLUMN_ACTIONS.join(', ')}`);
    }
    let nextBoard = {
      ...board,
      columns,
      version: bumpBoardVersion(board),
      updatedAt: ts,
      metadata: { ...asObject(board.metadata), columnSettingsUpdatedAt: ts },
    };
    let outcome = commitDefinedBoard(nextBoard, principal, {
      column: clone(columns.find(column => column.id === columnId)),
    });
    return outcome;
  }

  // delete_column: remove a board column. Gate policy.define. Reject (no mutation) if any live card
  // still occupies the column. Drop the column and every transition that references it (mirroring the
  // transitions handling), then re-validate: a removal that orphans the entry or strands a terminal is
  // rejected with the validator error rather than persisting a broken board. Commit durably, bump
  // version, report the removed column/transitions in the result.
  function deleteWorkflowColumn(args = {}, context = {}) {
    let principal = resolvePrincipal(context);
    let board = ensureBoard(args.boardId ?? args.board_id ?? DEFAULT_WORKFLOW_BOARD_ID);
    let policyGate = gate(
      isDaemonPrincipal(principal) ? 'daemon.bookkeeping' : 'policy.define',
      principal,
      { boardId: board.id },
    );
    if (!policyGate.ok) return policyGate;
    let columnId = textOrNull(args.columnId ?? args.column_id ?? args.id);
    if (!columnId) throw new Error('deleteWorkflowColumn requires columnId.');
    let columns = Array.isArray(board.columns) ? board.columns.slice() : [];
    let index = columns.findIndex(column => column.id === columnId);
    if (index < 0) throw new Error(`Workflow column not found: ${columnId}.`);
    let occupants = Object.values(getCollection(stateGraph, 'workflowCards'))
      .filter(card => card.boardId === board.id && card.columnId === columnId)
      .map(card => card.id);
    if (occupants.length) {
      return {
        ok: false,
        status: 'blocked',
        failures: [{
          gate: 'column_occupied',
          reason: `Workflow column "${columnId}" still holds ${occupants.length} card(s); move or remove them first.`,
          cardIds: occupants,
        }],
      };
    }
    let removedColumn = clone(columns[index]);
    columns.splice(index, 1);
    let transitions = Array.isArray(board.transitions) ? board.transitions.slice() : [];
    let removedTransitions = transitions.filter(transition => transition.from === columnId || transition.to === columnId);
    let nextTransitions = transitions.filter(transition => transition.from !== columnId && transition.to !== columnId);
    let ts = now();
    let nextBoard = {
      ...board,
      columns,
      transitions: nextTransitions,
      version: bumpBoardVersion(board),
      updatedAt: ts,
      metadata: { ...asObject(board.metadata), columnSettingsUpdatedAt: ts },
    };
    return commitDefinedBoard(nextBoard, principal, {
      column: removedColumn,
      removedTransitions: clone(removedTransitions),
    });
  }

  // Insertion index for a NEW column: after `args.after` (column id), else at `args.position` (clamped),
  // else appended. The default board keeps `done` terminal at the end; an author inserting before it
  // simply passes a position/after that lands earlier.
  function resolveColumnInsertIndex(columns, args, fallback) {
    let after = textOrNull(args.after);
    if (after) {
      let idx = columns.findIndex(column => column.id === after);
      if (idx >= 0) return idx + 1;
    }
    let position = Number(args.position);
    if (Number.isFinite(position)) return Math.max(0, Math.min(columns.length, Math.floor(position)));
    return fallback;
  }

  // Validate a proposed gate list against the closed iso vocabulary. Returns the deduped gate id array
  // or throws on an unknown gate (fail-closed; the validator would also reject it, this is the early,
  // precise error).
  function normalizeDefinedGates(gates) {
    let ids = textArray(gates);
    for (let id of ids) {
      if (!isKnownWorkflowGate(id)) {
        throw new Error(`Unknown workflow gate "${id}". Supported: ${listWorkflowGateIds().join(', ')}`);
      }
    }
    return ids;
  }

  let transitionEdgeKey = transition => `${textOrNull(transition?.from) ?? ''}->${textOrNull(transition?.to) ?? ''}`;

  // define_transition: add/update a transition edge {from, to, gates}. Gate policy.define. The gates
  // must be a subset of the closed vocabulary (reject unknown). Apply to board.transitions, re-validate,
  // commit durably.
  function defineWorkflowTransition(args = {}, context = {}) {
    let principal = resolvePrincipal(context);
    let board = ensureBoard(args.boardId ?? args.board_id ?? DEFAULT_WORKFLOW_BOARD_ID);
    let policyGate = gate(
      isDaemonPrincipal(principal) ? 'daemon.bookkeeping' : 'policy.define',
      principal,
      { boardId: board.id },
    );
    if (!policyGate.ok) return policyGate;
    let from = textOrNull(args.from);
    let to = textOrNull(args.to);
    if (!from || !to) throw new Error('defineWorkflowTransition requires from and to.');
    let gates = normalizeDefinedGates(args.gates ?? args.gate);
    let ts = now();
    let transitions = Array.isArray(board.transitions) ? board.transitions.slice() : [];
    let edge = { from, to, gates };
    let index = transitions.findIndex(transition => transitionEdgeKey(transition) === `${from}->${to}`);
    if (index >= 0) transitions[index] = { ...transitions[index], from, to, gates };
    else transitions.push(edge);
    let nextBoard = {
      ...board,
      transitions,
      version: bumpBoardVersion(board),
      updatedAt: ts,
    };
    return commitDefinedBoard(nextBoard, principal, {
      transition: clone(transitions.find(transition => transitionEdgeKey(transition) === `${from}->${to}`)),
    });
  }

  // define_gate: set/replace the gate list on an EXISTING transition (a focused alias of
  // define_transition that only touches gates). Gate policy.define. Same closed-vocabulary rule, plus
  // floor-gate monotonicity: a redefinition may not WEAKEN a floor gate on a forward edge. Re-validate,
  // commit durably.
  function defineWorkflowGate(args = {}, context = {}) {
    let principal = resolvePrincipal(context);
    let board = ensureBoard(args.boardId ?? args.board_id ?? DEFAULT_WORKFLOW_BOARD_ID);
    let policyGate = gate(
      isDaemonPrincipal(principal) ? 'daemon.bookkeeping' : 'policy.define',
      principal,
      { boardId: board.id },
    );
    if (!policyGate.ok) return policyGate;
    let from = textOrNull(args.from);
    let to = textOrNull(args.to);
    if (!from || !to) throw new Error('defineWorkflowGate requires from and to.');
    let gates = normalizeDefinedGates(args.gates ?? args.gate);
    let transitions = Array.isArray(board.transitions) ? board.transitions.slice() : [];
    let index = transitions.findIndex(transition => transitionEdgeKey(transition) === `${from}->${to}`);
    if (index < 0) throw new Error(`Workflow transition not found: ${from} -> ${to}.`);
    let current = transitions[index];
    // Floor-gate monotonicity (inv 9, 10): a forward edge's redefinition may not drop a floor
    // (audit/hygiene) gate it currently carries. A backward (rank-decreasing) edge is not a forward
    // edge, so monotonicity does not apply there. The classifier tells us the edge class.
    let classifier = classifyWorkflowGraph(board);
    let edgeClass = classifier.edgeClass(from, to);
    let currentGates = textArray(current.gates ?? current.gate);
    if (edgeClass === 'forward' && !isFloorGateMonotonic(currentGates, gates)) {
      return {
        ok: false,
        status: 'blocked',
        failures: [{
          gate: 'floor_gate_monotonic',
          reason: `Gate redefinition for forward edge ${from} -> ${to} may not weaken a floor (audit/hygiene) gate.`,
        }],
      };
    }
    transitions[index] = { ...current, from, to, gates };
    let ts = now();
    let nextBoard = {
      ...board,
      transitions,
      version: bumpBoardVersion(board),
      updatedAt: ts,
    };
    return commitDefinedBoard(nextBoard, principal, {
      transition: clone(transitions[index]),
    });
  }

  // enqueue (WS-C public action): resolve the card, gate card.transition (enqueue is an admission
  // request), then call the internal enqueueWorkItem. Returns the enqueue result (admissionId,
  // lifecycle). This is the explicit `enqueue` action — distinct from the auto-orchestrate reroute.
  function enqueueWorkflowCard(args = {}, context = {}) {
    let principal = resolvePrincipal(context);
    let cardId = normalizeCardId(args);
    let admissionGate = gate(
      isDaemonPrincipal(principal) ? 'daemon.bookkeeping' : 'card.transition',
      principal,
      { cardId },
    );
    if (!admissionGate.ok) return admissionGate;
    let card = getCard(cardId);
    let board = ensureBoard(card.boardId);
    let notBefore = args.notBefore ?? args.not_before;
    let enqueued = enqueueWorkItem(board, card, { notBefore });
    if (!enqueued.ok) return { ok: false, reason: enqueued.reason, ...(enqueued.gate ? { gate: enqueued.gate } : {}) };
    let nextCard = enqueued.card ?? getCard(cardId);
    return {
      ok: true,
      boardId: board.id,
      cardId: nextCard.id,
      admissionId: enqueued.entry?.admissionId ?? null,
      lifecycle: nextCard.lifecycle,
      deduped: enqueued.deduped ?? false,
      entry: enqueued.entry,
    };
  }

  // After a link/unlink, recompute the dependent's idle↔blocked lifecycle (the only transition this
  // path owns). An unsatisfied edge on a not-yet-queued card → blocked. A fully-satisfied set on a
  // blocked card → idle, then enqueue immediately if its column auto-admits (else leave for the
  // release tick). A card already queued/admitting/running is left to the scheduler.
  function recomputeDependencyLifecycle(board, card, principal) {
    let classifier = classifyWorkflowGraph(board);
    let lifecycle = normalizeWorkflowLifecycle(card.lifecycle);
    let releasedEdges = releasedEdgesFor(card);
    let satisfied = allDependenciesSatisfied(card, board, classifier, releasedEdges);
    if (['queued', 'admitting', 'running'].includes(lifecycle)) {
      return { card, extra: {} };
    }
    if (!satisfied) {
      let blocked = commitDependencyBlock(board, card, principal);
      return { card: blocked, extra: { blocked: true } };
    }
    // All edges satisfied. If it was blocked, clear to idle; then enqueue when the column auto-admits.
    let cleared = lifecycle === 'blocked' ? commitDependencyUnblock(card, principal) : card;
    if (columnAutoAdmits(board, cleared.columnId)) {
      let enqueued = enqueueWorkItem(board, cleared);
      if (enqueued.ok) {
        return { card: enqueued.card ?? getCard(cleared.id), extra: { enqueued: true, admissionId: enqueued.entry?.admissionId } };
      }
    }
    return { card: cleared, extra: {} };
  }

  // A column auto-admits iff its automation trigger fires on entry without a manual gate (the S8 auto
  // path). Used to decide whether a freshly-satisfied dependent enqueues immediately or waits for the
  // release tick.
  function columnAutoAdmits(board, columnId) {
    let automation = columnAutomation(board, columnId);
    return automation.mode === 'auto' && (automation.trigger === 'on_enter' || automation.trigger === 'lease_required');
  }

  // Per-column autonomy gate (the "volume slider" applied per stage). When a card's work in this column
  // finishes, may the daemon auto-advance it onward / auto-start its stage? Default true (an unset column
  // is full-auto), so this is a SUBTRACTIVE gate: it only ever HOLDS a card when autoAdvance is explicitly
  // false, leaving it for a human. Resolved by column id off the normalized automation.
  function columnAutoAdvances(board, columnId) {
    let automation = columnAutomation(board, columnId);
    return automation.autoAdvance !== false;
  }

  // Mark a card as parked for a human at a stage whose autoAdvance is off, so the UI can surface it.
  // Idempotent: re-marking the same stage is a no-op; advancing later clears it via clearAwaitingHuman.
  function markAwaitingHuman(card, board, columnId, at) {
    let automation = columnAutomation(board, columnId);
    let action = textOrNull(automation.action);
    let current = card?.metadata?.awaitingHuman;
    if (current && current.stage === columnId && current.action === action) return card;
    return {
      ...card,
      metadata: { ...asObject(card.metadata), awaitingHuman: { stage: columnId, action, at } },
    };
  }

  // Drop a stale awaitingHuman marker once a card has been advanced past the stage that set it.
  function clearAwaitingHuman(card) {
    if (!card?.metadata?.awaitingHuman) return card;
    let metadata = { ...asObject(card.metadata) };
    delete metadata.awaitingHuman;
    return { ...card, metadata };
  }

  // Stamp awaitingHuman on every settled card resting in a gated (autoAdvance:false) column so the UI can
  // surface that the stage is parked for a human. Mirrors the driver guards (no live run, no recovery flag
  // / blocker) and is idempotent (markAwaitingHuman skips a card already marked at this stage). Commits
  // under the daemon bookkeeping gate, exactly like the advance it stands in for. Returns the held ids.
  function markAwaitingHumanForColumn(board, columnId, principal, runtimeNow) {
    let ops = [];
    let held = [];
    for (let card of Object.values(getCollection(stateGraph, 'workflowCards'))) {
      if (card.boardId !== board.id || card.columnId !== columnId) continue;
      if (getRunsForCard(card.id).some(run => RUNNING_RUN_STATUSES.has(run.status))) continue;
      let flags = new Set(normalizeRecoveryFlags(card.recoveryFlags));
      if (flags.has('blocked') || flags.has('needs_resume') || flags.has('recovering') || (card.blockers?.length)) continue;
      let marked = markAwaitingHuman(clone(card), board, columnId, runtimeNow);
      if (marked === card || JSON.stringify(marked.metadata?.awaitingHuman) === JSON.stringify(card.metadata?.awaitingHuman)) continue;
      let next = normalizeWorkflowCardInput({
        ...marked, version: card.version + 1, updatedAt: runtimeNow, updatedBy: principal.label,
      }, {
        id: card.id, actor: principal.label, now: runtimeNow,
        version: card.version + 1, createdAt: card.createdAt, updatedAt: runtimeNow,
      });
      ops.push({ op: 'set', path: `workflowCards/${card.id}`, value: next });
      held.push(card.id);
    }
    if (ops.length) {
      let result = gate('daemon.bookkeeping', principal, { boardId: board.id });
      if (result.ok) stateGraph.commit(ops, sourceForPrincipal(principal));
    }
    return held;
  }

  // ── Board-admission lease (D1.5, inv 31, 35; AD-10/16) ────────────────────────────────────────
  function readAdmissionLease(boardId) {
    return clone(stateGraph.get(`workflowAdmissionLease/${boardId}`) ?? null);
  }

  function admissionLeaseEpochPath(boardId) {
    return `workflowAdmissionLease/${boardId}/leaseEpoch`;
  }

  // Acquire the board-admission lease, making the admit path single-writer per board. Reclaim of a
  // held lease requires the prior lease to be epoch-bumpable AND past its TTL+grace on wall-clock.
  // commitCAS on the lease epoch fences two contending admitters: only one bumps the epoch. Returns
  // { ok, owner, leaseEpoch } or { ok:false, reason }.
  function acquireAdmissionLease(boardId, owner) {
    let current = readAdmissionLease(boardId);
    let currentNow = now();
    let leaseEpoch = Number(current?.leaseEpoch) || 0;
    if (current && current.owner && current.owner !== owner) {
      let heartbeatAt = Number(current.heartbeatAt ?? current.startedAt) || 0;
      let ttlMs = Number(current.ttlMs) || ADMISSION_LEASE_TTL_MS;
      let healthy = currentNow <= heartbeatAt + ttlMs;
      if (healthy) return { ok: false, reason: 'admission_lease_held', owner: current.owner };
    }
    let nextLease = {
      schema: 'workflow-admission-lease/v1',
      owner,
      leaseEpoch: leaseEpoch + 1,
      startedAt: currentNow,
      heartbeatAt: currentNow,
      ttlMs: ADMISSION_LEASE_TTL_MS,
    };
    let res = stateGraph.commitCAS(
      admissionLeaseEpochPath(boardId),
      leaseEpoch,
      [{ op: 'set', path: `workflowAdmissionLease/${boardId}`, value: nextLease }],
      sourceForPrincipal(daemonPrincipal()),
      { durable: true },
    );
    if (!res.ok) return { ok: false, reason: 'admission_lease_contended' };
    return { ok: true, owner, leaseEpoch: nextLease.leaseEpoch };
  }

  function heartbeatAdmissionLease(boardId, owner, leaseEpoch) {
    let current = readAdmissionLease(boardId);
    if (!current || current.owner !== owner || Number(current.leaseEpoch) !== leaseEpoch) return false;
    let next = { ...current, heartbeatAt: now() };
    stateGraph.commit(
      [{ op: 'set', path: `workflowAdmissionLease/${boardId}`, value: next }],
      sourceForPrincipal(daemonPrincipal()),
      { durable: true },
    );
    return true;
  }

  function releaseAdmissionLease(boardId, owner, leaseEpoch) {
    let current = readAdmissionLease(boardId);
    if (!current || current.owner !== owner || Number(current.leaseEpoch) !== leaseEpoch) return false;
    stateGraph.commit(
      [{ op: 'delete', path: `workflowAdmissionLease/${boardId}` }],
      sourceForPrincipal(daemonPrincipal()),
      { durable: true },
    );
    return true;
  }

  // Detect a stranded `admitting` card whose admitter is gone: lease epoch-stale (a newer lease
  // exists or the lease is absent) AND wall-clock grace elapsed since the admission started. This is
  // the recovery barrier of AD-16 — recovery never reclaims an in-flight admission inside the grace.
  function admissionLeaseStranded(boardId, admittingStartedAt) {
    let current = readAdmissionLease(boardId);
    let started = Number(admittingStartedAt) || 0;
    let graceElapsed = now() > started + ADMISSION_INFLIGHT_GRACE_MS;
    if (!current) return graceElapsed;
    let healthy = now() <= (Number(current.heartbeatAt ?? current.startedAt) || 0) + (Number(current.ttlMs) || ADMISSION_LEASE_TTL_MS);
    if (healthy) return false;
    return graceElapsed;
  }

  // ── Drain / admission pass (D1.1-D1.5, inv 1-7, 36, 41-44) ────────────────────────────────────
  // The SOLE owner of queued→admitting→running + lease grant, run under the board-admission lease.
  // INLINE (best-effort after an enqueue) and the scheduler LOOP call the same code path.
  async function drainWorkflowQueue(boardId, opts = {}, context = {}) {
    let board = ensureBoard(boardId);
    // Release tick first (AD-5 admission pseudocode: releaseDependencies() then drain). Blocked cards
    // whose every edge is satisfied are enqueued before this pass picks the admission order, and a
    // card blocked past max-blocked-age escalates. Skipped only when the board mode forbids release.
    if (!['stopped', 'maintenance'].includes(board.mode)) {
      releaseDependencies(board.id);
      // Occupancy-aging tick (Axis C): escalate any worked card that has lingered in its column past
      // the stale budget. Independent of the dependency clock above; idempotent across passes.
      escalateStaleCards(board.id);
      // Per-root convergence sweep: route any root that hit its re-decompose cap to a terminal. Per-root,
      // never board-pausing — orthogonal to the budget breaker below. Idempotent across passes.
      resolveRootConvergenceBreaches(board.id);
    }
    let owner = textOrNull(opts.owner) ?? `drain-${slugSegment(board.id)}-${nextId(makeId, 'pass')}`;
    let budget = Number.isFinite(Number(opts.budget)) && Number(opts.budget) > 0
      ? Math.floor(Number(opts.budget))
      : DEFAULT_DRAIN_BUDGET;
    let admitted = [];
    let rolledBack = [];
    let skipped = [];

    // Board budget breaker (Axis E): cumulative spend is a hard admission ceiling. Concurrency limits
    // bound how many runs execute at once but not their total cost, so a wide/deep decompose tree can
    // burn unbounded tokens/wall-clock. When the board's summed run cost crosses its configured budget,
    // refuse admission for the whole pass, flip the board to paused, and raise a board-level escalation
    // so a human re-arms it with intent. The pause then halts subsequent passes until re-armed.
    let budgetStatus = boardBudgetStatus(board);
    if (!budgetStatus.ok) {
      tripBoardBudgetBreaker(board, budgetStatus);
      return { ok: true, drained: false, reason: 'board_budget_exhausted', budget: budgetStatus, admitted, rolledBack, skipped };
    }

    let lease = acquireAdmissionLease(board.id, owner);
    if (!lease.ok) {
      return { ok: true, drained: false, reason: lease.reason, admitted, rolledBack, skipped };
    }
    try {
      let entries = admissionOrder(board.id, listQueueEntries(board.id));
      let processed = 0;
      let lastHeartbeat = now();
      for (let entry of entries) {
        if (processed >= budget) break;
        // Re-read board mode per card (AD-16): a mode flip mid-pass must take effect immediately.
        let liveBoard = ensureBoard(board.id);
        if (['paused', 'draining', 'stopped', 'maintenance', 'recovery_only'].includes(liveBoard.mode)) {
          skipped.push({ admissionId: entry.admissionId, reason: `board_mode_${liveBoard.mode}` });
          break;
        }
        if (entry.notBefore !== null && now() < entry.notBefore) {
          skipped.push({ admissionId: entry.admissionId, reason: 'not_before' });
          continue;
        }
        processed += 1;
        if (now() - lastHeartbeat >= ADMISSION_LEASE_HEARTBEAT_MS) {
          heartbeatAdmissionLease(board.id, owner, lease.leaseEpoch);
          lastHeartbeat = now();
        }
        let outcome = await admitQueueEntry(liveBoard, entry, lease, opts, context);
        if (outcome.admitted) admitted.push(outcome);
        else if (outcome.rolledBack) rolledBack.push(outcome);
        else skipped.push(outcome);
      }
    } finally {
      releaseAdmissionLease(board.id, owner, lease.leaseEpoch);
    }
    return { ok: true, drained: true, owner, admitted, rolledBack, skipped };
  }

  // Admit one queue entry. (1) commitCAS-fenced admission write (D1.3, inv 36): in one durable frame
  // write the admission record carrying admissionId + set lifecycle=admitting. (2) Reserve the slot
  // by delegating with admission_id (D1.1/D1.2): agent-pool acquires the ledger slot keyed by
  // admissionId and persists its dedup record before ack. (3) On grant → lifecycle=running + remove
  // the queue entry. On at-capacity/not-granted → rollback to queued (head of class, enqueuedAt
  // preserved). A stale-epoch admitter's CAS fails and it writes nothing (no late compensation).
  async function admitQueueEntry(board, entry, lease, opts = {}, context = {}) {
    let card = stateGraph.get(`workflowCards/${entry.cardId}`);
    if (!card) {
      // Card vanished — drop the orphan entry under the same epoch fence.
      let epoch = readQueueEpoch(board.id);
      stateGraph.commitCAS(`workflowQueueEpoch/${board.id}`, epoch,
        [{ op: 'delete', path: `workflowQueueEntries/${entry.admissionId}` }],
        sourceForPrincipal(daemonPrincipal()), { durable: true });
      return { admissionId: entry.admissionId, reason: 'card_missing' };
    }
    card = clone(card);
    // Defensive admission-time cycle guard (inv 23): refuse to admit a card whose dependency closure
    // is cyclic. The link path already rejects cycles, but a malformed import or a concurrent edit
    // could slip a cycle in; admitting one would risk a non-terminating release/inheritance walk.
    // inv 22 (never a silent permanent block): a cycle will NOT self-resolve via the release tick, so
    // dropping the entry alone would strand the card with no entry, no trigger, and no escalation.
    // Escalate it instead — set lifecycle→idle (recoverable, mirroring the hard-failure path) and raise
    // the same typed `needs_decision` escalation the release path uses, so a human/auditor sees it. The
    // card set, escalation event, and entry delete land in ONE durable CAS under the queue epoch fence.
    if (dependencyClosureIsCyclic(entry.cardId)) {
      let principal = daemonPrincipal();
      let ts = now();
      let detail = `Card ${card.id} cannot be admitted: its dependency closure is cyclic.`;
      let { metadata, event } = buildDependencyEscalation(
        board, card, principal, detail, 'Break the dependency cycle, then re-enqueue the card.', ts,
      );
      let escalated = normalizeWorkflowCardInput({
        ...clone(card),
        lifecycle: 'idle',
        metadata,
        version: card.version + 1,
        updatedAt: ts,
        updatedBy: principal.label,
      }, {
        id: card.id,
        actor: principal.label,
        now: ts,
        version: card.version + 1,
        createdAt: card.createdAt,
        updatedAt: ts,
      });
      let epoch = readQueueEpoch(board.id);
      stateGraph.commitCAS(`workflowQueueEpoch/${board.id}`, epoch,
        [
          { op: 'set', path: `workflowCards/${card.id}`, value: escalated },
          { op: 'set', path: `workflowTransitions/${event.id}`, value: event },
          { op: 'delete', path: `workflowQueueEntries/${entry.admissionId}` },
        ],
        sourceForPrincipal(principal), { durable: true });
      return { admissionId: entry.admissionId, cardId: card.id, reason: 'dependency_cycle' };
    }
    // F-DEP-1(b): defense in depth. The queue must never run a card with unsatisfied dependencies,
    // even if one slipped past the write-path recompute (a concurrent edit, a stale enqueue, or an
    // upstream that regressed after enqueue). Re-block the card and drop its queue entry under the
    // epoch fence; the release tick re-enqueues it once every edge is satisfied.
    {
      let depClassifier = classifyWorkflowGraph(board);
      let depReleased = releasedEdgesFor(card);
      if (!allDependenciesSatisfied(card, board, depClassifier, depReleased)) {
        let epoch = readQueueEpoch(board.id);
        let reblocked = normalizeWorkflowCardInput({
          ...clone(card),
          lifecycle: 'blocked',
          version: card.version + 1,
          updatedAt: now(),
          updatedBy: daemonPrincipal().label,
        }, {
          id: card.id,
          actor: daemonPrincipal().label,
          now: now(),
          version: card.version + 1,
          createdAt: card.createdAt,
          updatedAt: now(),
        });
        stateGraph.commitCAS(`workflowQueueEpoch/${board.id}`, epoch,
          [
            { op: 'set', path: `workflowCards/${card.id}`, value: reblocked },
            { op: 'delete', path: `workflowQueueEntries/${entry.admissionId}` },
          ],
          sourceForPrincipal(daemonPrincipal()), { durable: true });
        return { admissionId: entry.admissionId, cardId: card.id, reason: 'dependencies_unsatisfied' };
      }
    }
    let principal = daemonPrincipal();
    let admittingStartedAt = now();
    let admissionRecord = {
      schema: 'workflow-admission/v1',
      admissionId: entry.admissionId,
      cardId: entry.cardId,
      boardId: board.id,
      groupKey: entry.groupKey,
      leaseEpoch: lease.leaseEpoch,
      queueEpoch: entry.queueEpoch,
      enqueuedAt: entry.enqueuedAt,
      startedAt: admittingStartedAt,
      phase: 'admitting',
    };
    let admittingCard = normalizeWorkflowCardInput({
      ...card,
      lifecycle: 'admitting',
      version: card.version + 1,
      updatedAt: admittingStartedAt,
      updatedBy: principal.label,
    }, {
      id: card.id,
      actor: principal.label,
      now: admittingStartedAt,
      version: card.version + 1,
      createdAt: card.createdAt,
      updatedAt: admittingStartedAt,
    });
    // (1) Fenced admission write. The queue epoch is the owning epoch: a concurrent drain that read
    // a stale epoch fails here and writes nothing (inv 36, the CAS fence). The bump also invalidates
    // any in-flight admitter that captured the older epoch.
    let queueEpoch = readQueueEpoch(board.id);
    let fenced = stateGraph.commitCAS(
      `workflowQueueEpoch/${board.id}`,
      queueEpoch,
      [
        { op: 'set', path: `workflowAdmissions/${entry.admissionId}`, value: admissionRecord },
        { op: 'set', path: `workflowCards/${card.id}`, value: admittingCard },
      ],
      sourceForPrincipal(principal),
      { durable: true },
    );
    if (!fenced.ok) {
      return { admissionId: entry.admissionId, reason: 'admission_cas_conflict', currentEpoch: fenced.currentEpoch };
    }

    // (2) Reserve the slot + spawn via the delegate path, threading admission_id. orchestrateWorkItem
    // grants the per-card WORK lease (durable) and creates the run; the delegate passes admission_id
    // to agent-pool, which acquires the ledger slot keyed by it (idempotent) and persists the dedup
    // record before ack. A capacity rejection surfaces as a delegate isError → run not started.
    let automation = cardAutomation(board, card);
    let agent = chooseStageAgent(automation, card, opts);
    let orchestrateResult;
    try {
      orchestrateResult = await orchestrateWorkItem({
        ...opts,
        boardId: board.id,
        cardId: card.id,
        admission_id: entry.admissionId,
        expectedVersion: undefined,
        expected_version: undefined,
        mode: automation.mode ?? 'auto',
        agent,
        leaseOwner: textOrNull(opts.leaseOwner ?? opts.lease_owner) ?? agent,
        approval_mode: opts.approval_mode ?? automation.approvalMode,
        resource_group: opts.resource_group ?? automation.resourceGroup,
        reason: textOrNull(opts.reason) ?? `Admission of card ${card.id}.`,
      }, { ...context, principal });
    } catch (error) {
      orchestrateResult = { ok: false, error: error.message, sideEffects: [] };
    }

    // F-SCH-3: re-validate that THIS pass still owns the admission lease before any promote/rollback
    // CAS write. The orchestrate await can block up to the worst-case delegate budget (≫ the 15s lease
    // TTL) with no heartbeat, so a second admitter may have reclaimed the lease and re-admitted this
    // entry meanwhile. If we were displaced, write nothing and return a benign result — the new lease
    // holder (and, failing that, recovery) owns the outcome. Combined with the idempotent-grant below,
    // the re-admit converges instead of double-writing or stranding.
    let liveLease = readAdmissionLease(board.id);
    if (!liveLease || liveLease.owner !== lease.owner || Number(liveLease.leaseEpoch) !== lease.leaseEpoch) {
      return { admissionId: entry.admissionId, cardId: card.id, displaced: true, reason: 'admission_lease_displaced' };
    }

    // F-SCH-1: a grant is the run being durably running OR an idempotent existing ACTIVE run.
    // orchestrateWorkItem returns `{ ok, idempotent:true, run }` when activeRunForCard finds an
    // existing run, and RUNNING_RUN_STATUSES includes `requested`/`recovering`. Such a run is already
    // being handled, so treat it as granted: promote lifecycle→running and drop the entry. Without
    // this, an idempotent `requested`/`recovering` run gave granted=false + slotRejected=false → the
    // hard-failure branch deleted the entry+record and stranded the card in `admitting` forever.
    let granted = Boolean(orchestrateResult?.ok)
      && (orchestrateResult?.run?.status === 'running'
        || (orchestrateResult?.idempotent
          && orchestrateResult?.run
          && RUNNING_RUN_STATUSES.has(orchestrateResult.run.status)));
    if (!granted) {
      // A capacity rejection (no slot granted) re-queues the card; any other delegation failure is a
      // hard error that orchestrateWorkItem already recorded as a failed run + needs_audit. A thrown
      // error (no result) is treated as transient and re-queued too.
      let slotRejected = orchestrateResult?.slotRejected !== false
        && (orchestrateResult?.slotRejected === true || !orchestrateResult?.ok);
      if (!slotRejected) {
        // (3a-hard) Hard delegation failure (a non-capacity error, e.g. unknown resource group).
        // orchestrateWorkItem already recorded the failed run + needs_audit recovery flag.
        // F-SCH-2: if agent-pool reserved a slot before the spawn failed, that slot is orphaned the
        // moment we delete the admission record (recovery can no longer see it). Release it first
        // (idempotent — a no-op when nothing was reserved).
        await releaseSlotForAdmission(entry.admissionId, context);
        // F-SCH-1 (defense): never leave the card in `admitting` with no admission record — that is
        // unrecoverable (reconcile only resolves `admitting` cards that still have a record). Demote
        // lifecycle→idle in the SAME frame that drops the entry + record, keeping the failed run and
        // needs_audit flag so a human/auditor can re-engage. A stuck card is then always recoverable.
        let failedCard = stateGraph.get(`workflowCards/${card.id}`) ?? admittingCard;
        let recoverableCard = normalizeWorkflowCardInput({
          ...clone(failedCard),
          lifecycle: 'idle',
          version: failedCard.version + 1,
          updatedAt: now(),
          updatedBy: principal.label,
        }, {
          id: card.id,
          actor: principal.label,
          now: now(),
          version: failedCard.version + 1,
          createdAt: failedCard.createdAt,
          updatedAt: now(),
        });
        let removeEpoch = readQueueEpoch(board.id);
        stateGraph.commitCAS(
          `workflowQueueEpoch/${board.id}`,
          removeEpoch,
          [
            { op: 'set', path: `workflowCards/${card.id}`, value: recoverableCard },
            { op: 'delete', path: `workflowQueueEntries/${entry.admissionId}` },
            { op: 'delete', path: `workflowAdmissions/${entry.admissionId}` },
          ],
          sourceForPrincipal(principal),
          { durable: true },
        );
        return {
          admissionId: entry.admissionId,
          cardId: card.id,
          result: orchestrateResult,
          failed: true,
          reason: orchestrateResult?.error ?? 'delegation_failed',
        };
      }
      // (3a-capacity) Rollback (inv 2): lifecycle→queued at the head of its fairness class, enqueuedAt
      // preserved (the entry was never removed). No slot was granted, so there is nothing to release;
      // releaseSlot remains the reconcile/recovery path's single-owner duty. admitting record cleared.
      let rolledCard = stateGraph.get(`workflowCards/${card.id}`) ?? admittingCard;
      let nextCard = normalizeWorkflowCardInput({
        ...clone(rolledCard),
        lifecycle: 'queued',
        version: rolledCard.version + 1,
        updatedAt: now(),
        updatedBy: principal.label,
      }, {
        id: card.id,
        actor: principal.label,
        now: now(),
        version: rolledCard.version + 1,
        createdAt: rolledCard.createdAt,
        updatedAt: now(),
      });
      let rollbackEpoch = readQueueEpoch(board.id);
      stateGraph.commitCAS(
        `workflowQueueEpoch/${board.id}`,
        rollbackEpoch,
        [
          { op: 'set', path: `workflowCards/${card.id}`, value: nextCard },
          { op: 'delete', path: `workflowAdmissions/${entry.admissionId}` },
        ],
        sourceForPrincipal(principal),
        { durable: true },
      );
      return {
        admissionId: entry.admissionId,
        cardId: card.id,
        rolledBack: true,
        reason: orchestrateResult?.error ?? 'slot_not_granted',
      };
    }

    // (3b) Granted: the run is durable (running) and the per-card lease is held. Promote
    // lifecycle→running and REMOVE the queue entry + admission record now that running is durable
    // (AD-2: the overlap ends only here). Advance the round-robin cursor to this group.
    let runningCard = stateGraph.get(`workflowCards/${card.id}`) ?? admittingCard;
    let promotedCard = normalizeWorkflowCardInput({
      ...clone(runningCard),
      lifecycle: 'running',
      version: runningCard.version + 1,
      updatedAt: now(),
      updatedBy: principal.label,
    }, {
      id: card.id,
      actor: principal.label,
      now: now(),
      version: runningCard.version + 1,
      createdAt: runningCard.createdAt,
      updatedAt: now(),
    });
    let promoteEpoch = readQueueEpoch(board.id);
    stateGraph.commitCAS(
      `workflowQueueEpoch/${board.id}`,
      promoteEpoch,
      [
        { op: 'set', path: `workflowCards/${card.id}`, value: promotedCard },
        { op: 'set', path: `workflowQueueCursor/${board.id}`, value: { groupKey: entry.groupKey } },
        { op: 'delete', path: `workflowQueueEntries/${entry.admissionId}` },
        { op: 'delete', path: `workflowAdmissions/${entry.admissionId}` },
      ],
      sourceForPrincipal(principal),
      { durable: true },
    );
    return {
      admissionId: entry.admissionId,
      cardId: card.id,
      admitted: true,
      agent,
      result: orchestrateResult,
    };
  }

  // Reroute (inv 31; v2 "enqueues a card; never jumps the admission queue"). What was the immediate
  // orchestrate trigger now ENQUEUES (lifecycle→queued) and then INLINE-DRAINS best-effort, so a card
  // that fits capacity is still admitted in the same request (today's responsiveness preserved). It
  // NEVER calls orchestrateWorkItem directly — the drain is the sole admission owner. The return
  // shape mirrors the legacy orchestrate result so existing callers keep reading
  // `orchestration.result.{card,run,lease}` and `orchestration.agent`.
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
        fileConflicts: candidate.fileConflicts,
        sideEffects: [],
      };
    }
    let automation = candidate.automation;
    let enqueued = enqueueWorkItem(board, card, { notBefore: args.notBefore ?? args.not_before });
    if (!enqueued.ok) {
      return {
        ok: false,
        skipped: true,
        enqueued: false,
        reason: enqueued.reason,
        automation,
        capacity: candidate.capacity,
        boardCapacity: candidate.boardCapacity,
        fileConflicts: candidate.fileConflicts,
        sideEffects: [],
      };
    }
    let admissionId = enqueued.entry.admissionId;
    // Inline best-effort drain (capacity-gated). Same code path as the scheduler loop.
    let drain = await drainWorkflowQueue(board.id, { ...args }, context);
    let mine = drain.admitted.find(item => item.admissionId === admissionId);
    if (mine) {
      let result = mine.result;
      return {
        ok: true,
        skipped: false,
        enqueued: true,
        admissionId,
        automation,
        capacity: candidate.capacity,
        boardCapacity: candidate.boardCapacity,
        fileConflicts: candidate.fileConflicts,
        agent: mine.agent,
        result,
        drain,
        sideEffects: result.sideEffects || [],
      };
    }
    // Hard delegation failure on this card's admission (not a capacity re-queue): admitQueueEntry
    // returns a non-admitted result with `failed:true`, which the drain collects into `skipped`.
    // Surface the failed run so the caller sees the failure rather than a silently-queued card.
    let mineHardFail = (drain.skipped ?? []).find(item => item.admissionId === admissionId && item.failed);
    if (mineHardFail?.result) {
      return {
        ok: true,
        skipped: false,
        enqueued: true,
        failed: true,
        admissionId,
        automation,
        capacity: candidate.capacity,
        boardCapacity: candidate.boardCapacity,
        fileConflicts: candidate.fileConflicts,
        agent: mineHardFail.agent ?? chooseStageAgent(automation, card, args),
        result: mineHardFail.result,
        drain,
        sideEffects: mineHardFail.result.sideEffects || [],
      };
    }
    // Enqueued but not admitted this pass (at capacity, deferred, or a concurrent admitter holds the
    // lease). The card stays `queued`; a later drain admits it. This is a successful enqueue, not a
    // failure — callers see ok:true, enqueued:true, and no started run.
    return {
      ok: true,
      skipped: false,
      enqueued: true,
      queued: true,
      admissionId,
      automation,
      capacity: candidate.capacity,
      boardCapacity: candidate.boardCapacity,
      fileConflicts: candidate.fileConflicts,
      drain,
      sideEffects: [],
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

  function wantsCompactProjection(filter = {}) {
    let view = String(filter.view ?? filter.projection ?? '').trim().toLowerCase();
    return Boolean(filter.compact) || ['compact', 'status', 'summary'].includes(view);
  }

  function checkStatusSummary(checks = {}) {
    return Object.fromEntries(
      Object.entries(checks)
        .map(([key, value]) => [key, textOrNull(value?.status) ?? 'unknown']),
    );
  }

  function latestCardRun(card = {}) {
    let runs = Array.isArray(card.runs) ? card.runs : [];
    return runs
      .slice()
      .sort((a, b) => ((b.updatedAt ?? b.startedAt ?? 0) - (a.updatedAt ?? a.startedAt ?? 0)))
      .map(run => ({
        id: run.id,
        status: run.status,
        taskIds: uniqueArray(run.taskIds),
        startedAt: run.startedAt ?? null,
        updatedAt: run.updatedAt ?? null,
        completedAt: run.completedAt ?? null,
        tokens: run.tokens ?? null,
        chatId: run.chatId ?? null,
      }))[0] ?? null;
  }

  function latestCardEvent(card = {}) {
    let events = Array.isArray(card.events) ? card.events : [];
    return events
      .slice()
      .sort((a, b) => ((b.createdAt ?? 0) - (a.createdAt ?? 0)))
      .map(event => ({
        id: event.id,
        eventType: event.eventType ?? event.type ?? null,
        status: event.status ?? null,
        actor: event.actor ?? null,
        reason: compactText(event.reason) ?? '',
        createdAt: event.createdAt ?? null,
      }))[0] ?? null;
  }

  function hasFailedCheck(card = {}) {
    return Object.values(card.checks || {})
      .some(check => String(check?.status || '').toLowerCase() === 'fail');
  }

  function isCompactRelevantCard(card = {}) {
    if (card.columnId !== 'done') return true;
    if ((card.blockers || []).length > 0) return true;
    if ((card.recoveryFlags || []).length > 0) return true;
    return hasFailedCheck(card);
  }

  function compactWorkflowCard(card = {}) {
    return {
      id: card.id,
      title: card.title,
      columnId: card.columnId,
      kind: card.kind,
      priority: card.priority,
      projectId: card.projectId,
      domain: card.domain,
      owner: card.owner,
      assignedAgent: card.assignedAgent,
      resourceGroup: card.resourceGroup,
      approvalMode: card.approvalMode,
      blockers: card.blockers || [],
      recoveryFlags: card.recoveryFlags || [],
      checks: checkStatusSummary(card.checks),
      entityRefs: {
        goalId: card.entityRefs?.goalId ?? null,
        chatId: card.entityRefs?.chatId ?? null,
        taskIds: uniqueArray(card.entityRefs?.taskIds),
      },
      latestRun: latestCardRun(card),
      latestEvent: latestCardEvent(card),
      childCardIds: uniqueArray(card.childCardIds),
      updatedAt: card.updatedAt ?? null,
      version: card.version ?? null,
    };
  }

  function compactEvent(event = {}) {
    return {
      id: event.id,
      eventType: event.eventType ?? 'transition',
      cardId: event.cardId ?? null,
      fromColumnId: event.fromColumnId ?? null,
      toColumnId: event.toColumnId ?? null,
      actor: event.actor ?? null,
      status: event.status ?? null,
      reason: compactText(event.reason) ?? '',
      sideEffectTypes: Array.isArray(event.sideEffects)
        ? event.sideEffects.map(item => textOrNull(item?.type)).filter(Boolean)
        : [],
      createdAt: event.createdAt ?? null,
    };
  }

  function compactLoadSummary(projection, runtimeState = {}) {
    let cards = Array.isArray(projection.cards) ? projection.cards : [];
    let activeCards = cards.filter(card => COMPACT_ACTIVE_COLUMN_IDS.has(card.columnId));
    let activeRuns = activeCards.flatMap(card => Array.isArray(card.runs) ? card.runs : [])
      .filter(run => RUNNING_RUN_STATUSES.has(String(run?.status || '').toLowerCase()));
    let activeLeases = activeCards.filter(card => Boolean(card.lease));
    let runningTaskCount = runtimeState.runtime?.runningTaskCount
      ?? compactRuntimeSummary(runtimeState.tasks).runningTaskCount;
    let queue = asObject(projection.queue);
    let telemetry = asObject(projection.telemetry);
    return {
      boardMode: projection.board.mode,
      globalParallelLimit: finiteNumber(projection.board.automation?.globalParallelLimit),
      activeCardCount: activeCards.length,
      blockedCardCount: cards.filter(card => (card.blockers || []).length > 0).length,
      activeRunCount: activeRuns.length,
      activeLeaseCount: activeLeases.length,
      runningTaskCount,
      // Admission backpressure at a glance for the L1 monitor (read from the full projection's
      // queue/telemetry; the compact view never recomputes them).
      queue: {
        depth: finiteNumber(queue.depth ?? telemetry.queueDepth) ?? 0,
        blockedOnDependencyCount: finiteNumber(
          queue.blockedOnDependencyCount ?? telemetry.blockedOnDependencyCount,
        ) ?? 0,
        admissions: finiteNumber(telemetry.admissions) ?? 0,
        admissionFailures: finiteNumber(telemetry.admissionFailures) ?? 0,
      },
    };
  }

  function compactSystemLoad(systemLoad = null, runtimeTasks = null) {
    let tasks = runtimeTasks instanceof Map ? [...runtimeTasks.values()] : [];
    let runningTaskCount = tasks
      .filter(task => RUNTIME_RUNNING_STATUSES.has(String(task?.status ?? task?.state ?? '').toLowerCase()))
      .length;
    if (!systemLoad || typeof systemLoad !== 'object') {
      return {
        available: false,
        capacity: {
          state: 'unknown',
          runningTaskCount,
          reason: 'runtime_system_load_unavailable',
        },
      };
    }
    let capacity = asObject(systemLoad.capacity);
    let agents = asObject(systemLoad.agents);
    return {
      available: true,
      agents: {
        total: finiteNumber(agents.total) ?? finiteNumber(systemLoad.total) ?? 0,
        ours: finiteNumber(agents.ours) ?? finiteNumber(systemLoad.ours) ?? 0,
        external: finiteNumber(agents.external) ?? finiteNumber(systemLoad.external) ?? 0,
      },
      cpu: {
        count: finiteNumber(systemLoad.cpu?.count),
        loadRatio1m: finiteNumber(systemLoad.cpu?.loadRatio1m),
      },
      memory: {
        totalBytes: finiteNumber(systemLoad.memory?.totalBytes),
        freeBytes: finiteNumber(systemLoad.memory?.freeBytes),
        availableBytes: finiteNumber(systemLoad.memory?.availableBytes),
        usedRatio: finiteNumber(systemLoad.memory?.usedRatio),
        estimatedNewTaskBytes: finiteNumber(systemLoad.memory?.estimatedNewTaskBytes),
        reserveBytes: finiteNumber(systemLoad.memory?.reserveBytes),
        availableForNewTasksBytes: finiteNumber(systemLoad.memory?.availableForNewTasksBytes),
        requiredForNextTaskBytes: finiteNumber(systemLoad.memory?.requiredForNextTaskBytes),
        deficitForNextTaskBytes: finiteNumber(systemLoad.memory?.deficitForNextTaskBytes),
        estimatedAdditionalTaskSlots: finiteNumber(systemLoad.memory?.estimatedAdditionalTaskSlots),
      },
      process: {
        trackedChildren: finiteNumber(systemLoad.process?.trackedChildren)
          ?? finiteNumber(agents.ours)
          ?? finiteNumber(systemLoad.ours)
          ?? 0,
        staleProcessCount: finiteNumber(capacity.staleProcessCount) ?? 0,
      },
      capacity: {
        state: capacity.state || 'unknown',
        reason: capacity.reason || null,
        runningTaskCount: finiteNumber(capacity.runningTaskCount) ?? runningTaskCount,
        recommendedMaxParallelTasks: finiteNumber(capacity.recommendedMaxParallelTasks),
        estimatedAdditionalTaskSlots: finiteNumber(capacity.estimatedAdditionalTaskSlots),
        trackedChildCount: finiteNumber(capacity.trackedChildCount)
          ?? finiteNumber(agents.ours)
          ?? finiteNumber(systemLoad.ours)
          ?? 0,
      },
    };
  }

  function compactRuntimeSummary(runtimeTasks = null) {
    let tasks = runtimeTasks instanceof Map ? [...runtimeTasks.values()] : [];
    let running = tasks.filter(task => (
      RUNTIME_RUNNING_STATUSES.has(String(task?.status ?? task?.state ?? '').toLowerCase())
    ));
    return {
      taskCount: tasks.length,
      runningTaskCount: running.length,
      latestTaskAt: latestTimestamp(tasks.flatMap(task => [
        task.updatedAt,
        task.completedAt,
        task.startedAt,
      ])),
      runningTaskIds: running.map(task => task.id).filter(Boolean).slice(0, COMPACT_CARD_LIMIT),
    };
  }

  function compactBoardProjection(projection, runtimeState = {}) {
    let cards = projection.cards
      .filter(isCompactRelevantCard)
      .slice(-COMPACT_CARD_LIMIT)
      .map(compactWorkflowCard);
    let activeCards = cards.filter(card => COMPACT_ACTIVE_COLUMN_IDS.has(card.columnId));
    let blockedCards = cards.filter(card => card.blockers.length > 0 || card.recoveryFlags.length > 0);
    let latestEvents = projection.events
      .slice(-COMPACT_EVENT_LIMIT)
      .map(compactEvent);
    let latestCardEventAt = latestTimestamp(cards.flatMap(card => [
      card.updatedAt,
      card.latestEvent?.createdAt,
      card.latestRun?.updatedAt,
      card.latestRun?.completedAt,
      card.latestRun?.startedAt,
    ]));
    let latestEventAt = latestTimestamp([
      latestCardEventAt,
      ...latestEvents.map(event => event.createdAt),
      runtimeState.runtime?.latestTaskAt,
    ]);

    return {
      schema: 'workflow-board-compact-projection/v1',
      view: 'status',
      board: {
        id: projection.board.id,
        title: projection.board.title,
        mode: projection.board.mode,
        version: projection.board.version,
        automation: projection.board.automation,
      },
      boardId: projection.boardId,
      scope: projection.scope,
      columns: projection.columns.map(column => ({
        id: column.id,
        title: column.title,
        automation: column.automation,
        count: column.cards.length,
        activeCount: column.cards.filter(card => card.columnId !== 'done').length,
        blockedCount: column.cards.filter(card => (card.blockers || []).length > 0).length,
        recoveryCount: column.cards.filter(card => (card.recoveryFlags || []).length > 0).length,
      })),
      counts: projection.counts,
      cards,
      activeCards,
      blockedCards,
      events: latestEvents,
      runtime: runtimeState.runtime ?? compactRuntimeSummary(runtimeState.tasks),
      load: compactLoadSummary(projection, runtimeState),
      systemLoad: compactSystemLoad(runtimeState.systemLoad, runtimeState.tasks),
      activity: {
        latestEventAt,
        latestWorkflowEventAt: latestTimestamp(latestEvents.map(event => event.createdAt)),
      },
      version: projection.version,
    };
  }

  function getBoardProjection(filter = {}, runtimeTasks = null) {
    ensureWorkflowSchemaMigrated();
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
    // Idea-realization rollup: stamp each ROOT card (no parent, or rootCardId === id) with a
    // realization summary counting its subtree by terminal status. Group cards by rootCardId once,
    // then summarize each group against its own members (group size, not the full list), so the pass
    // stays O(cards). It rides metadata.realization — the raw/structured slot, not a flattened display
    // field — so the web UI reads it off raw and never mistakes it for a board-level display column.
    let terminalActions = new Map(
      (Array.isArray(board?.columns) ? board.columns : []).map(column => [
        column.id,
        { action: textOrNull(column?.automation?.action), closeKind: textOrNull(column?.automation?.closeKind) },
      ]),
    );
    let cardsByRoot = new Map();
    for (let card of persistedBoardCards) {
      let root = textOrNull(card.metadata?.rootCardId) ?? card.id;
      let group = cardsByRoot.get(root) ?? [];
      group.push(card);
      cardsByRoot.set(root, group);
    }
    persistedBoardCards = persistedBoardCards.map((card) => {
      let isRoot = !textOrNull(card.parentCardId ?? card.parent_card_id)
        || textOrNull(card.metadata?.rootCardId) === card.id;
      if (!isRoot) return card;
      let realization = summarizeRealizationByRoot(cardsByRoot.get(card.id) ?? [card], card.id, { terminalActions });
      return { ...card, metadata: { ...(card.metadata ?? {}), realization } };
    });
    let linkedTaskIds = new Set(persistedBoardCards.flatMap(card => uniqueArray([
      ...card.entityRefs.taskIds,
      ...card.runs.flatMap(run => run.taskIds),
    ])));
    let runtimeCards = runtimeTaskProjectionCards(board, projectId, linkedTaskIds, runtimeTasks);
    let cards = [...persistedBoardCards, ...runtimeCards]
      .filter(card => !goalId || card.entityRefs?.goalId === goalId)
      .filter(card => !chatId || card.entityRefs?.chatId === chatId)
      .sort((a, b) => (a.createdAt - b.createdAt) || a.id.localeCompare(b.id))
      .map(projectCardV2);
    let columns = board.columns.map((column) => ({
      ...column,
      cards: cards.filter(card => card.columnId === column.id),
    }));

    let blockedOnDependencyCount = cards.filter(card => card.lifecycle === 'blocked').length;
    let includeCards = filter.includeCards ?? filter.include_cards;
    let includeEvents = filter.includeEvents ?? filter.include_events;
    let projection = {
      schema: 'workflow-board-projection/v2',
      board,
      boardId: board.id,
      scope: { projectId, goalId, chatId },
      columns: includeCards === false
        ? columns.map(column => ({ ...column, cards: [] }))
        : columns,
      cards: includeCards === false ? [] : cards,
      counts: Object.fromEntries(columns.map(column => [column.id, column.cards.length])),
      queue: {
        depth: 0,
        oldestEnqueuedAt: null,
        perGroupDepth: {},
        blockedOnDependencyCount,
      },
      telemetry: {
        queueDepth: 0,
        oldestEnqueuedAt: null,
        blockedOnDependencyCount,
        admissions: 0,
        admissionFailures: 0,
        drains: 0,
      },
      events: includeEvents === false
        ? []
        : listEvents({ boardId: board.id, limit: filter.eventLimit ?? filter.event_limit ?? 20 }),
      version: stateGraph.version,
    };
    return wantsCompactProjection(filter)
      ? compactBoardProjection(projection, { tasks: runtimeTasks })
      : projection;
  }

  // projection-v2 (AD-12): stamp every projected card with the frozen lifecycle / dependsOn / queue
  // shape. lifecycle and dependsOn are normalized (idle / [] defaults via the iso normalizers). The
  // per-card queue slot is all-null until the scheduler (S8) populates it; existing values on the
  // card are surfaced, never invented.
  function projectCardV2(card) {
    let queueSource = card.queue ?? {};
    return {
      ...card,
      lifecycle: normalizeWorkflowLifecycle(card.lifecycle),
      dependsOn: normalizeWorkflowDependsOn(card.dependsOn ?? card.depends_on),
      queue: {
        enqueuedAt: queueSource.enqueuedAt ?? null,
        queueEpoch: queueSource.queueEpoch ?? null,
        admissionId: queueSource.admissionId ?? null,
        priority: queueSource.priority ?? null,
        position: queueSource.position ?? null,
      },
    };
  }

  async function getBoardProjectionWithRuntime(filter = {}, context = {}) {
    await seedWorkflowWorkItemsForProjection(filter);
    let runtimeState = await readRuntimeState(context);
    if (filter.reconcileRuntime === true || filter.reconcile_runtime === true) {
      // Read-side reconcile is side-effect-light: drive defaults off so a projection read never
      // spawns an agent. Autonomous on_enter drive belongs to the reconcile loop (drive: true).
      await reconcileWorkflowRuntimeTasks(filter, runtimeState.tasks);
    }
    let projection = getBoardProjection({
      ...filter,
      compact: false,
      view: undefined,
      projection: undefined,
    }, runtimeState.tasks);
    return wantsCompactProjection(filter)
      ? compactBoardProjection(projection, {
        tasks: runtimeState.tasks,
        systemLoad: runtimeState.systemLoad,
        runtime: compactRuntimeSummary(runtimeState.tasks),
      })
      : projection;
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
        schema: 'workflow-card/v2',
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
          tokens: Number.isFinite(Number(task.tokens ?? task.result?.stats?.total_tokens ?? task.stats?.total_tokens))
            ? Math.floor(Number(task.tokens ?? task.result?.stats?.total_tokens ?? task.stats?.total_tokens))
            : null,
          chatId: textOrNull(task.chatId ?? task.chat_id ?? chat?.id),
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
          // A terminal-failed orphan task is reaped to the reject terminal as runtime debris; stamp the
          // resolution so the UI explains why it sits in `rejected` rather than as a real result.
          ...(TASK_ERROR_STATUSES.has(status)
            ? { resolution: { status: 'discarded', reason: 'Orphaned runtime task (no linked card); reaped as debris.', at: timestamp, by: 'runtime' } }
            : {}),
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

  // The worker's final answer is persisted as a `role:'agent'` chat message keyed by taskId
  // (task-router persistFinalTaskResult). Read it from the run's chat; fall back to a task event
  // tail. Pure read, never throws — the escalation parser must be resilient to missing state.
  function workerFinalAnswerText(run, runtimeTasks) {
    let taskIds = new Set(uniqueArray(run.taskIds));
    let chatIds = new Set();
    for (let taskId of taskIds) {
      let task = runtimeTasks instanceof Map ? runtimeTasks.get(taskId) : null;
      let chatId = textOrNull(task?.chatId ?? task?.chat_id);
      if (chatId) chatIds.add(chatId);
    }
    for (let chatId of chatIds) {
      let chat = stateGraph.getChat(chatId);
      let messages = Array.isArray(chat?.messages) ? chat.messages : [];
      let scoped = messages.filter(msg => msg?.role === 'agent' && taskIds.has(msg.taskId));
      let agentMsg = scoped[scoped.length - 1]
        ?? [...messages].reverse().find(msg => msg?.role === 'agent');
      let text = textOrNull(agentMsg?.text);
      if (text) return text;
    }
    for (let taskId of taskIds) {
      let task = runtimeTasks instanceof Map ? runtimeTasks.get(taskId) : null;
      let events = Array.isArray(task?.events) ? task.events : [];
      for (let event of [...events].reverse()) {
        let text = textOrNull(event?.text ?? event?.content ?? event?.message);
        if (text) return text;
      }
    }
    return null;
  }

  // Parse a typed escalation from a terminal worker run. Returns a normalized escalation for a
  // `blocked` result (typed kind, or a `needs_decision` fallback for an untyped block); null for
  // completed/needs_follow_up or when no signal exists. Wrapped so a parse failure never breaks
  // reconcile — an unparseable block degrades to no escalation, not a thrown reconcile.
  function parseRunEscalation(run, runtimeTasks, opts = {}) {
    try {
      let text = workerFinalAnswerText(run, runtimeTasks);
      let fromAuditColumn = Boolean(opts.fromAuditColumn);
      if (!text) {
        if (!opts.terminalBlocked) return null;
        return normalizeWorkflowEscalation(
          { kind: fromAuditColumn ? 'rework' : 'needs_decision', detail: opts.fallbackDetail ?? null },
          { now: opts.now, raisedBy: ESCALATION_ACTOR, runId: run.id, taskId: uniqueArray(run.taskIds)[0] ?? null },
        );
      }
      let resultMatch = text.match(ESCALATION_RESULT_PATTERN);
      let result = resultMatch ? resultMatch[1].toLowerCase() : null;
      // Only a blocked outcome (explicit, or an inferred terminal block) is an escalation.
      if (result && result !== 'blocked') return null;
      if (!result && !opts.terminalBlocked) return null;
      let kind = text.match(ESCALATION_KIND_PATTERN)?.[1]?.toLowerCase() ?? null;
      let detail = textOrNull(text.match(ESCALATION_DETAIL_PATTERN)?.[1]);
      let suggestion = textOrNull(text.match(ESCALATION_SUGGESTION_PATTERN)?.[1]);
      let lane = textOrNull(text.match(ESCALATION_LANE_PATTERN)?.[1]);
      let escalation = normalizeWorkflowEscalation({
        kind,
        detail,
        suggestedResolution: suggestion,
        proposedLane: lane,
      }, { now: opts.now, raisedBy: ESCALATION_ACTOR, runId: run.id, taskId: uniqueArray(run.taskIds)[0] ?? null });
      if (escalation) return escalation;
      // Blocked but no usable typed kind → governed fallback: rework if it came from the audit
      // stage, otherwise a decision for a human/orchestrator to make.
      return normalizeWorkflowEscalation(
        { kind: fromAuditColumn ? 'rework' : 'needs_decision', detail: detail ?? opts.fallbackDetail ?? null },
        { now: opts.now, raisedBy: ESCALATION_ACTOR, runId: run.id, taskId: uniqueArray(run.taskIds)[0] ?? null },
      );
    } catch {
      return null;
    }
  }

  // Decide the durable escalation-state delta for a terminal run. A non-completed terminal run
  // records/continues the episode (parser owns WHAT, never the attempt counter); a completed run
  // resolves and clears it. Returns the next `metadata` plus an event descriptor, or null when
  // there is nothing to write (dedup by run id, or no escalation at all).
  function computeTerminalEscalation(card, run, nextStatus, runtimeTasks, currentNow) {
    let metadata = card.metadata && typeof card.metadata === 'object' ? { ...card.metadata } : {};
    let existing = metadata.escalation
      ? normalizeWorkflowEscalationState(metadata.escalation)
      : null;

    if (nextStatus === 'completed') {
      if (!existing) return null;
      delete metadata.escalation;
      return { metadata, status: 'cleared', kind: existing.kind, detail: existing.detail };
    }

    let escalation = parseRunEscalation(run, runtimeTasks, {
      terminalBlocked: true,
      fromAuditColumn: card.columnId === 'quality-audit',
      now: currentNow,
    });
    if (!escalation) return null;
    if (existing && existing.lastRunId === run.id) return null; // already recorded this run

    let history = [
      ...(existing?.history ?? []),
      { kind: escalation.kind, detail: escalation.detail, runId: run.id, at: currentNow },
    ];
    let nextState = normalizeWorkflowEscalationState({
      lastEscalation: escalation,
      attemptCount: existing?.attemptCount ?? 0, // re-engagement owns accrual; never bump here
      firstAt: existing?.firstAt ?? currentNow,
      lastAt: currentNow,
      nextAttemptAt: existing?.nextAttemptAt ?? currentNow, // first episode is re-engageable now
      humanEscalated: existing?.humanEscalated ?? false,
      lastRunId: run.id,
      history,
    });
    return { metadata: { ...metadata, escalation: nextState }, status: 'raised', kind: escalation.kind, detail: escalation.detail };
  }

  // Mint a card-metadata patch that raises (or continues) a typed escalation episode the SAME way
  // computeTerminalEscalation does, but driven by the BOARD (not a worker run) — the audit return loop
  // and the human-decision backstop both use it. `options` carries the human-decision button choices
  // (only meaningful for a `needs_human` episode). Attempt accrual stays owned by the re-engagement
  // driver (never bumped here); a `needs_human` episode is skipped by that driver, so it simply waits.
  function raiseEscalationMetadata(card, { kind, detail, options = [], runId = null, at }) {
    let metadata = card.metadata && typeof card.metadata === 'object' ? { ...card.metadata } : {};
    let existing = metadata.escalation ? normalizeWorkflowEscalationState(metadata.escalation) : null;
    let escalation = normalizeWorkflowEscalation(
      { kind, detail, options, raisedBy: daemonPrincipal().label },
      { now: at, runId },
    );
    if (!escalation) return metadata;
    let nextState = normalizeWorkflowEscalationState({
      lastEscalation: escalation,
      attemptCount: existing?.attemptCount ?? 0,
      firstAt: existing?.firstAt ?? at,
      lastAt: at,
      nextAttemptAt: existing?.nextAttemptAt ?? at,
      humanEscalated: existing?.humanEscalated ?? false,
      lastRunId: runId ?? existing?.lastRunId ?? null,
      history: [...(existing?.history ?? []), { kind, detail, runId, at }],
    });
    return { ...metadata, escalation: nextState };
  }

  // Parse a typed intermediate return from the latest task output of a still-live run. A worker emits
  // `WORKFLOW_RETURN: <kind>` (optionally trailed by a JSON object) in its final message; we read that
  // text the same way computeTerminalEscalation does (workerFinalAnswerText → chat tail / runtime task
  // events). Returns a normalized return event, or null when there is no marker — zero cost on the
  // common no-marker reconcile pass. Wrapped so a parse failure degrades to null, never a thrown reconcile.
  function computeIntermediateReturn(card, run, runtimeTasks, currentNow) {
    try {
      let text = workerFinalAnswerText(run, runtimeTasks);
      if (!text) return null;
      let match = text.match(RETURN_MARKER_PATTERN);
      if (!match) return null;
      let kind = match[1].toLowerCase();
      let parsed = {};
      if (match[2]) {
        try { parsed = JSON.parse(match[2]); } catch { parsed = {}; }
      }
      // Deterministic eventId so re-parsing the SAME marker on a still-running run is idempotent
      // (coalesceReturnEvents drops the duplicate) — the inbox holds one entry per distinct marker.
      let eventId = `ret-${crypto.createHash('sha256').update(`${run.id}:${match[0]}`).digest('hex').slice(0, 24)}`;
      return normalizeWorkflowReturnEvent(
        { kind, ...(parsed && typeof parsed === 'object' ? parsed : {}) },
        { now: currentNow, correlationId: card.id, runId: run.id, taskId: uniqueArray(run.taskIds)[0] ?? null, raisedBy: ESCALATION_ACTOR, eventId },
      );
    } catch {
      return null;
    }
  }

  // Fold a minted return into the escalation state when it is a hard-interrupt (needs_decision | blocked
  // | needs_permission). A hard-interrupt return must keep hasActiveEscalation(card) true so the existing
  // re-engagement driver re-engages it — we write the SAME escalation-state shape buildDependencyEscalation
  // produces, mapping the return's escalationKind onto the channel. A non-hard-interrupt return never
  // touches metadata.escalation. Returns the next metadata, unchanged when not a hard interrupt.
  function foldReturnEscalation(metadata, event, currentNow) {
    if (!event || event.hardInterrupt !== true) return metadata;
    let existing = metadata.escalation ? normalizeWorkflowEscalationState(metadata.escalation) : null;
    let escalation = normalizeWorkflowEscalation(
      { kind: event.escalationKind, detail: event.detail, raisedBy: ESCALATION_ACTOR },
      { now: currentNow, runId: event.runId, taskId: event.taskId },
    );
    if (!escalation) return metadata;
    let state = normalizeWorkflowEscalationState({
      lastEscalation: escalation,
      attemptCount: existing?.attemptCount ?? 0, // re-engagement owns accrual; never bump here
      firstAt: existing?.firstAt ?? currentNow,
      lastAt: currentNow,
      nextAttemptAt: existing?.nextAttemptAt ?? currentNow, // first episode is re-engageable now
      humanEscalated: existing?.humanEscalated ?? false,
      lastRunId: event.runId,
      history: [
        ...(existing?.history ?? []),
        { kind: escalation.kind, detail: escalation.detail, runId: event.runId, at: currentNow },
      ],
    });
    return { ...metadata, escalation: state };
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

  function latestRuntimeTaskTimestamp(run, runtimeTasks) {
    let stamps = uniqueArray(run.taskIds)
      .map(taskId => runtimeTaskTimestamp(runtimeTasks instanceof Map ? runtimeTasks.get(taskId) : undefined))
      .filter(value => value !== null && value !== undefined)
      .map(Number)
      .filter(Number.isFinite);
    return stamps.length ? Math.max(...stamps) : null;
  }

  // Sum the run-level token total reported by each of the run's runtime tasks (task.tokens is
  // persisted by the task router from the agent's final summary; stats fallbacks cover other
  // runners). Returns null when no task reports tokens so the run keeps any prior value.
  function runtimeTaskTokenTotal(run, runtimeTasks) {
    if (!(runtimeTasks instanceof Map)) return null;
    let total = 0;
    let seen = false;
    for (let taskId of uniqueArray(run.taskIds)) {
      let task = runtimeTasks.get(taskId);
      let tokens = Number(
        task?.tokens
        ?? task?.result?.stats?.total_tokens
        ?? task?.stats?.total_tokens,
      );
      if (Number.isFinite(tokens) && tokens >= 0) {
        total += tokens;
        seen = true;
      }
    }
    return seen ? total : null;
  }

  // The chat a run's worker ran in (its own subagent chat), resolved from the run's first task.
  // A card keeps only the latest chat in entityRefs, so this lets each pass link to its own chat.
  function runtimeTaskChatId(run, runtimeTasks) {
    if (!(runtimeTasks instanceof Map)) return null;
    for (let taskId of uniqueArray(run.taskIds)) {
      let task = runtimeTasks.get(taskId);
      let chatId = textOrNull(task?.chatId ?? task?.chat_id);
      if (chatId) return chatId;
    }
    return null;
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

  // A run whose underlying task(s) ended `lost` or `stale` is a RESUMABLE interruption — a heartbeat
  // timeout or a worker orphaned by a backend restart — NOT a genuine failure. `workflowRunStatusFromRuntime`
  // collapses lost/stale into the run status `error` (they share TASK_ERROR_STATUSES), so the reconcile
  // would otherwise route the card to quality-audit as finished-but-failed. This recovers the distinction
  // from the raw task statuses so the reconcile can re-queue the card for resume instead of zombifying it.
  function runInterruptionResumable(run, runtimeTasks) {
    return uniqueArray(run.taskIds).some(taskId => {
      let status = runtimeStatusForTaskId(runtimeTasks, taskId);
      return status === 'lost' || status === 'stale';
    });
  }

  // Resolve the release-tail columns by automation action (never by hardcoded id) so a board that
  // renames or reorders columns still drives correctly.
  function releaseTailColumns(board) {
    let columns = board.columns ?? [];
    let byAction = (action) => columns.find(column => textOrNull(column?.automation?.action) === action)?.id ?? null;
    return {
      auditColumnId: byAction('audit'),
      publishColumnId: byAction('publish'),
      // The SUCCESS terminal: the first `close` column that is not flavored `rejected`. `done` precedes
      // `rejected` in the default order, so this stays `done` while ignoring the discard terminal.
      closeColumnId: columns.find(column =>
        textOrNull(column?.automation?.action) === 'close'
        && textOrNull(column?.automation?.closeKind) !== 'rejected')?.id ?? byAction('close'),
    };
  }

  // The reject terminal: a `close` column flavored `closeKind: 'rejected'` — cancelled, rejected, and
  // reaped runtime-debris cards land here. Resolved by action+flavor so the board stays data-driven;
  // falls back to a close column distinct from the success terminal, then null when the board has none.
  function rejectTerminalColumnId(board) {
    let columns = board.columns ?? [];
    let rejected = columns.find(column =>
      textOrNull(column?.automation?.action) === 'close'
      && textOrNull(column?.automation?.closeKind) === 'rejected');
    if (rejected) return rejected.id;
    let successId = columns.find(column => textOrNull(column?.automation?.action) === 'close')?.id ?? null;
    return columns.find(column =>
      textOrNull(column?.automation?.action) === 'close' && column.id !== successId)?.id ?? null;
  }

  // The human-decision lane: the (non-terminal) column whose action parks a card for an explicit human
  // answer. Resolved by action so the board stays data-driven; null when the board defines no such lane.
  function decisionColumnId(board) {
    return (board.columns ?? []).find(column =>
      textOrNull(column?.automation?.action) === 'await_human')?.id ?? null;
  }

  // Park a card in the human-decision lane with a typed needs_decision escalation, returning the
  // { ops, card } to apply (the caller batches or commits them). The board never fabricates a question
  // here — this is the generic "the board cannot self-resolve this, hand it to a human" hand-off (e.g. an
  // autonomous merge conflict). `extraMetadata` rides along on the card (e.g. the conflict detail); the
  // worktree pointer is intentionally preserved so a human can resolve it in place.
  function parkCardForDecisionOps(board, card, reason, sideEffect, principal, ts, extraMetadata = {}) {
    let laneId = decisionColumnId(board);
    if (!laneId) return null;
    let priorState = card.metadata?.escalation ? normalizeWorkflowEscalationState(card.metadata.escalation) : {};
    let escalation = normalizeWorkflowEscalationState({
      ...priorState,
      kind: 'needs_decision',
      lastEscalation: { schema: 'workflow-escalation/v1', kind: 'needs_decision', detail: reason, options: [], at: ts },
    });
    let metadata = { ...asObject(card.metadata), ...extraMetadata, escalation };
    delete metadata.reworkCycles;
    let parkFlags = normalizeRecoveryFlags((card.recoveryFlags ?? []).filter(flag => flag !== 'needs_audit'));
    let parked = normalizeWorkflowCardInput({
      ...card, columnId: laneId, lifecycle: 'idle', recoveryFlags: parkFlags,
      metadata, version: card.version + 1, updatedAt: ts, updatedBy: principal.label,
    }, {
      id: card.id, actor: principal.label, now: ts,
      version: card.version + 1, createdAt: card.createdAt, updatedAt: ts,
    });
    let eventId = nextId(makeId, 'escalation');
    let event = normalizeWorkflowTransitionEvent({
      id: eventId, eventType: 'transition', boardId: board.id, cardId: card.id,
      fromColumnId: card.columnId, toColumnId: laneId, actor: principal.label, mode: 'auto',
      reason, status: 'accepted',
      sideEffects: [sideEffect],
    }, { id: eventId, now: ts });
    return {
      ops: [
        { op: 'set', path: `workflowCards/${card.id}`, value: parked },
        { op: 'set', path: `workflowTransitions/${event.id}`, value: event },
      ],
      card: parked,
    };
  }

  // A daemon-signed floor check. Autonomous mode delegates the human/independent sign-off to the
  // daemon; the signature records that delegation explicitly (signedBy:'daemon') for the audit trail.
  function daemonSignedCheck(reason, at) {
    return { status: 'passed', signedBy: 'daemon', reason, at };
  }

  // A check signed off the result of a real probe rather than a bare daemon assertion. `signedBy`
  // is `daemon-probe` (not `daemon`) and the probe `evidence` rides along so the floor write is
  // auditable: the pass is backed by observed repository state, not a rubber stamp.
  function probeSignedCheck(reason, at, evidence) {
    return { status: 'passed', signedBy: 'daemon-probe', reason, at, evidence };
  }

  // The per-board waiver (if any) that authorizes the daemon to sign a floor check for a card it
  // executed (separated-duty escape, inv 47). Default-off: an absent or approver-less waiver returns
  // null, leaving separated duty fully enforced. A valid waiver carries the human approver who
  // accepted the daemon self-sign, so the bypass is attributable in the audit trail.
  function boardDaemonFloorSignWaiver(board) {
    return normalizeWorkflowBoardAutomation(board?.automation).daemonFloorSignWaiver ?? null;
  }

  // Separated-duty verdict for a floor-gate (audit/hygiene) signature (inv 33, 47). A principal whose
  // id is recorded in the card's executedBy executed the card and may not sign its floor gate — this
  // now includes the daemon, which both runs AND reconciles a card in autonomous mode. The only escape
  // is a daemon self-sign explicitly waived per board by a recorded approver; a non-daemon executor is
  // never waived. Returns the waiver when the escape is taken so the signature can record the approver.
  function floorSignSeparation(board, executedBy, principal) {
    if (!textArray(executedBy).includes(principal.id)) return { ok: true, waiver: null };
    if (isDaemonPrincipal(principal)) {
      let waiver = boardDaemonFloorSignWaiver(board);
      if (waiver) return { ok: true, waiver };
    }
    return { ok: false, waiver: null };
  }

  // Whether the audit floor is already signed by an INDEPENDENT principal — a signer not among the
  // card's executors. A persisted floor check with no recorded signer was written through the
  // AUDIT-gated, separated-duty-checked update_item path, so by construction its writer was not an
  // executor; it is independent. A signer recorded in executedBy (e.g. a waived daemon self-sign) is
  // NOT independent and does not, on its own, authorize the autonomous advance.
  function auditSignedIndependently(checks, executedBy) {
    let entry = checkPassed(checks.audit) ? checks.audit
      : (checkPassed(checks.auditWaiver) ? checks.auditWaiver : null);
    if (!entry) return false;
    let signer = textOrNull(typeof entry === 'object' ? entry.signedBy : null);
    if (!signer) return true;
    return !textArray(executedBy).includes(signer);
  }

  function checksSetOp(cardId, checks, at, principal) {
    return {
      op: 'set',
      path: `workflowChecks/${cardId}`,
      value: normalizeWorkflowChecksInput({ checks }, { cardId, now: at, updatedAt: at, actor: principal.label }),
    };
  }

  // A daemon runtime advance: set the card's column + record the runtime transition event, mirroring
  // the per-run auto-advance shape. Returns the next card and the ops (card + transition).
  function runtimeAdvanceCardOps(board, card, toColumnId, principal, at, reason, sideEffectType) {
    // A card that is actually advancing is no longer parked for a human at its prior stage.
    let advancing = clearAwaitingHuman(card);
    let nextCard = normalizeWorkflowCardInput({
      ...advancing,
      columnId: toColumnId,
      lifecycle: 'idle',
      version: card.version + 1,
      updatedAt: at,
      updatedBy: principal.label,
    }, {
      id: card.id,
      actor: principal.label,
      now: at,
      version: card.version + 1,
      createdAt: card.createdAt,
      updatedAt: at,
    });
    let eventId = nextId(makeId, 'runtime');
    let event = normalizeWorkflowTransitionEvent({
      id: eventId,
      eventType: 'runtime',
      boardId: board.id,
      cardId: card.id,
      fromColumnId: card.columnId,
      toColumnId,
      actor: principal.label,
      mode: 'auto',
      reason,
      status: 'accepted',
      sideEffects: [{ type: sideEffectType, fromColumnId: card.columnId, toColumnId }],
    }, { id: eventId, now: at });
    return {
      card: nextCard,
      ops: [
        { op: 'set', path: `workflowCards/${card.id}`, value: nextCard },
        { op: 'set', path: `workflowTransitions/${eventId}`, value: event },
      ],
    };
  }

  // Autonomous release tail (opt-in: board.mode==='autonomous'). The core reconcile advances a card
  // to quality-audit when its run completes; in `armed` mode an independent principal must then sign
  // the audit/publish floor gates by hand, so a finished card otherwise sits forever. Autonomous mode
  // delegates that sign-off to the daemon: once a card's audit run has completed cleanly (its latest
  // terminal run is `completed`, with no terminal failure), the daemon signs the audit floor check and
  // walks the card forward (quality-audit → commit-publish, and — when publishMode is `after_audit` —
  // commit-publish → done). A card whose latest run terminal-FAILED is left for recovery, never auto
  // -passed; a card with a live run is never disturbed. Bypasses the transition gates the same way the
  // per-run auto-advance does (daemon bookkeeping reflecting runtime reality), but signs the gates'
  // backing checks so the card's recorded state stays honest and idempotent.
  // The audit verdict for a finished audit run: an EXPLICIT pass/fail from the worker's final output
  // (WORKFLOW_RESULT, or a COMPLETION_PROOF / RELEASE_AUTH_PACKET marker) — never the bare process exit.
  // Returns 'pass' | 'fail' | null. A clean exit with no verdict is NOT a pass (completed != approved).
  function auditRunVerdict(run, runtimeTasks) {
    let text = workerFinalAnswerText(run, runtimeTasks) || '';
    if (!text) return null;
    let resultMatch = text.match(ESCALATION_RESULT_PATTERN);
    let result = resultMatch ? resultMatch[1].toLowerCase() : null;
    let passMarker = /\b(?:COMPLETION_PROOF|RELEASE_AUTH_PACKET)\s*:\s*PASS\b/i.test(text);
    let failMarker = /\b(?:COMPLETION_PROOF|RELEASE_AUTH_PACKET)\s*:\s*FAIL\b/i.test(text);
    if (['pass', 'passed', 'ok', 'success'].includes(result) || passMarker) return 'pass';
    if (['fail', 'failed', 'blocked', 'rejected'].includes(result) || failMarker) return 'fail';
    return null;
  }

  // A worker — typically the orchestrator — may decide a card is not worth completing and emit
  // `WORKFLOW_RESULT: rejected` (optionally with `ESCALATION_DETAIL:` as the reason). This is a terminal
  // DECISION: the card retires to the reject terminal, distinct from `blocked` (which escalates back) and
  // `completed` (which advances). Returns the reason string when a reject is requested, else null.
  function runRequestsReject(run, runtimeTasks) {
    let text = workerFinalAnswerText(run, runtimeTasks) || '';
    if (!text) return null;
    let result = text.match(ESCALATION_RESULT_PATTERN)?.[1]?.toLowerCase() ?? null;
    if (result !== 'rejected') return null;
    return textOrNull(text.match(ESCALATION_DETAIL_PATTERN)?.[1]) ?? 'Rejected by the orchestrator.';
  }

  // The orchestrator deliberately escalates to a human by ending with `WORKFLOW_RESULT: needs_human`
  // (the extreme case it cannot self-resolve). Unlike `blocked` — which rides an error exit and the board
  // auto re-engages — this is a clean DECISION: park the card in the decision lane with the question and
  // optional button choices. Returns `{ detail, options }` when requested, else null.
  function runRequestsHumanDecision(run, runtimeTasks) {
    let text = workerFinalAnswerText(run, runtimeTasks) || '';
    if (!text) return null;
    let result = text.match(ESCALATION_RESULT_PATTERN)?.[1]?.toLowerCase() ?? null;
    if (result !== 'needs_human') return null;
    let detail = textOrNull(text.match(ESCALATION_DETAIL_PATTERN)?.[1]) ?? 'The orchestrator requested a human decision.';
    let optionsRaw = textOrNull(text.match(ESCALATION_OPTIONS_PATTERN)?.[1]);
    let options = optionsRaw ? optionsRaw.split('|').map(part => part.trim()).filter(Boolean) : [];
    return { detail, options };
  }

  // Autonomous inbox self-start (opt-in: board.mode==='autonomous'). The very front of the pipeline: a
  // raw idea dropped in the classify column (Ideas/Inbox) is auto-promoted into the scope column
  // (Backlog), where driveAutonomousBacklog then triages it — the orchestrator scopes it into a contract
  // or rejects junk — and drives it onward. With this the board runs idea → done with NO human step at
  // all; in armed/manual mode the classify column stays a human triage inbox. Same guards as the backlog
  // driver: a card with a live run, a recovery flag, a blocker, or unsatisfied dependencies is held.
  // Columns resolved by automation.action, never by hardcoded id.
  function driveAutonomousInbox(board, principal, runtimeNow) {
    let columns = board.columns ?? [];
    let byAction = (action) => columns.find(column => textOrNull(column?.automation?.action) === action)?.id ?? null;
    let classifyColumnId = byAction('classify');
    let scopeColumnId = byAction('scope');
    let promoted = [];
    let blockedByDependency = [];
    let awaitingHuman = [];
    if (!classifyColumnId || !scopeColumnId) return { promoted, blockedByDependency, awaitingHuman };
    // Per-column autonomy gate: when the classify column's autoAdvance is off a human owns the hand-off.
    if (!columnAutoAdvances(board, classifyColumnId)) {
      let held = markAwaitingHumanForColumn(board, classifyColumnId, principal, runtimeNow);
      return { promoted, blockedByDependency, awaitingHuman: held };
    }
    let classifier = classifyWorkflowGraph(board);
    let ops = [];
    for (let card of Object.values(getCollection(stateGraph, 'workflowCards'))) {
      if (card.boardId !== board.id || card.columnId !== classifyColumnId) continue;
      if (getRunsForCard(card.id).some(run => RUNNING_RUN_STATUSES.has(run.status))) continue;
      let flags = new Set(normalizeRecoveryFlags(card.recoveryFlags));
      if (flags.has('blocked') || flags.has('needs_resume') || flags.has('recovering') || (card.blockers?.length)) continue;
      if (!allDependenciesSatisfied(card, board, classifier, releasedEdgesFor(card))) {
        blockedByDependency.push(card.id);
        continue;
      }
      let advance = runtimeAdvanceCardOps(
        board, clone(card), scopeColumnId, principal, runtimeNow,
        `Autonomous inbox: idea ${card.id} promoted to ${scopeColumnId} for scoping.`,
        'autonomous_promote',
      );
      ops.push(...advance.ops);
      promoted.push({ cardId: card.id, toColumnId: scopeColumnId });
    }
    if (ops.length) {
      let result = gate('daemon.bookkeeping', principal, { boardId: board.id });
      if (result.ok) stateGraph.commit(ops, sourceForPrincipal(principal));
    }
    return { promoted, blockedByDependency, awaitingHuman: [] };
  }

  // Autonomous backlog self-start (opt-in: board.mode==='autonomous'). The orchestrate column already
  // auto-fires on entry; this is the missing step before it. A backlog card (the `scope`-action column)
  // that already carries an execution contract (owner + acceptance) is promoted to the orchestrate
  // column — its on_enter orchestration then fires. A raw card with no contract and no prior run is
  // surfaced for the orchestrator to `scope` once (the caller drives it); a card that was already scoped
  // but still lacks a contract is left for a human rather than re-scoped in a loop. Columns resolved by
  // automation.action, never by hardcoded id. armed/manual keep the human scope step.
  function driveAutonomousBacklog(board, principal, runtimeNow) {
    let columns = board.columns ?? [];
    let byAction = (action) => columns.find(column => textOrNull(column?.automation?.action) === action)?.id ?? null;
    let scopeColumnId = byAction('scope');
    let orchestrateColumnId = byAction('orchestrate');
    let promoted = [];
    let scopeNeeded = [];
    let blockedByDependency = [];
    let awaitingHuman = [];
    if (!scopeColumnId || !orchestrateColumnId) return { promoted, scopeNeeded, blockedByDependency, awaitingHuman };
    // Per-column autonomy gate: a scope column with autoAdvance off parks its cards for a human promote.
    if (!columnAutoAdvances(board, scopeColumnId)) {
      let held = markAwaitingHumanForColumn(board, scopeColumnId, principal, runtimeNow);
      return { promoted, scopeNeeded, blockedByDependency, awaitingHuman: held };
    }
    let classifier = classifyWorkflowGraph(board);
    let ops = [];
    for (let card of Object.values(getCollection(stateGraph, 'workflowCards'))) {
      if (card.boardId !== board.id || card.columnId !== scopeColumnId) continue;
      let cardRuns = getRunsForCard(card.id);
      if (cardRuns.some(run => RUNNING_RUN_STATUSES.has(run.status))) continue;
      let flags = new Set(normalizeRecoveryFlags(card.recoveryFlags));
      if (flags.has('blocked') || flags.has('needs_resume') || flags.has('recovering') || (card.blockers?.length)) continue;
      // Dependency ordering: hold a card until its dependsOn upstreams are satisfied, so a dependent
      // never jumps ahead of its prerequisites (the deps gate admission only once `blocked`, which the
      // direct promote would otherwise bypass). It promotes on a later tick once the upstream is done.
      if (!allDependenciesSatisfied(card, board, classifier, releasedEdgesFor(card))) {
        blockedByDependency.push(card.id);
        continue;
      }
      if (readyCardHasExecutionContract(card)) {
        let advance = runtimeAdvanceCardOps(
          board, clone(card), orchestrateColumnId, principal, runtimeNow,
          `Autonomous backlog: scoped card ${card.id} promoted to ${orchestrateColumnId}.`,
          'autonomous_promote',
        );
        ops.push(...advance.ops);
        promoted.push({ cardId: card.id, toColumnId: orchestrateColumnId });
      } else if (!cardRuns.some(run => TERMINAL_RUN_STATUSES.has(run.status))) {
        scopeNeeded.push(card.id);
      }
    }
    if (ops.length) {
      let result = gate('daemon.bookkeeping', principal, { boardId: board.id });
      if (result.ok) stateGraph.commit(ops, sourceForPrincipal(principal));
    }
    return { promoted, scopeNeeded, blockedByDependency, awaitingHuman };
  }

  async function driveAutonomousReleaseTail(board, principal, runtimeNow, runtimeTasks) {
    let { auditColumnId, publishColumnId, closeColumnId } = releaseTailColumns(board);
    let publishMode = normalizeWorkflowBoardAutomation(board.automation).publishMode;
    let ops = [];
    let advanced = [];
    let closed = [];
    let merged = [];
    let conflicted = [];
    let awaitingHuman = [];
    for (let card of Object.values(getCollection(stateGraph, 'workflowCards'))) {
      if (card.boardId !== board.id) continue;
      let cardRuns = getRunsForCard(card.id);
      if (cardRuns.some(run => RUNNING_RUN_STATUSES.has(run.status))) continue;
      // Active recovery (blocked / lost lease / mid-recovery) means the card is not cleanly finished.
      let flags = new Set(normalizeRecoveryFlags(card.recoveryFlags));
      if (flags.has('blocked') || flags.has('needs_resume') || flags.has('recovering') || (card.blockers?.length)) continue;
      let latestCard = clone(card);
      let checks = getChecks(card.id);

      // Stage 1 — quality-audit → commit-publish. Proof-contract: completed != approved, AND separated
      // duty (inv 47). Advance ONLY when the audit floor is signed by a principal who did NOT execute
      // the card: either it is already signed independently (preferred — a human or qa/code-reviewer
      // via update_item, a signer not in executedBy), or the run reports an explicit PASS and the
      // daemon is itself independent (no recorded executor) OR explicitly waived per board to self-sign.
      // A daemon that ran the card may not auto-pass its own work on its own authority; absent an
      // independent sign-off or a waiver it is held as needs_audit for a human/re-audit, never shipped.
      // Per-column autonomy gate: a quality-audit column with autoAdvance off parks the card for a human
      // review/merge instead of auto-advancing it to commit-publish (audit sign-off stays untouched).
      if (latestCard.columnId === auditColumnId && publishColumnId
        && !columnAutoAdvances(board, auditColumnId)) {
        let marked = markAwaitingHuman(latestCard, board, auditColumnId, runtimeNow);
        if (JSON.stringify(marked.metadata?.awaitingHuman) !== JSON.stringify(latestCard.metadata?.awaitingHuman)) {
          let held = normalizeWorkflowCardInput({
            ...marked, version: latestCard.version + 1, updatedAt: runtimeNow, updatedBy: principal.label,
          }, {
            id: latestCard.id, actor: principal.label, now: runtimeNow,
            version: latestCard.version + 1, createdAt: latestCard.createdAt, updatedAt: runtimeNow,
          });
          ops.push({ op: 'set', path: `workflowCards/${latestCard.id}`, value: held });
          awaitingHuman.push(latestCard.id);
        }
        continue;
      }
      if (latestCard.columnId === auditColumnId && publishColumnId) {
        let finished = cardRuns.filter(run => TERMINAL_RUN_STATUSES.has(run.status));
        let latestFinished = finished.sort(
          (a, b) => (Number(a.completedAt ?? a.updatedAt ?? 0) - Number(b.completedAt ?? b.updatedAt ?? 0)),
        ).at(-1);
        if (latestFinished?.status === 'completed') {
          let executedBy = textArray(latestCard.metadata?.executedBy);
          let independentlySigned = auditSignedIndependently(checks, executedBy);
          let verdict = independentlySigned ? 'pass' : auditRunVerdict(latestFinished, runtimeTasks);
          // When the floor is not yet independently signed, the daemon would have to sign it itself —
          // allowed only when the daemon is not an executor of this card, or under an explicit waiver.
          let separation = independentlySigned
            ? { ok: true, waiver: null }
            : floorSignSeparation(board, executedBy, principal);
          // Autonomous independent audit: the latest audit run was performed by an agent the board
          // configures as a quality-audit reviewer — a role kept disjoint from the executor agents — so
          // its explicit PASS is an INDEPENDENT sign-off, not a daemon self-pass. This lets an autonomous
          // board advance audited work without a human while preserving separated duty (auditor !=
          // executor); only the rare extreme reaches a human via the orchestrator / needs_decision lane.
          let auditAgents = textArray((board.columns ?? []).find(col => col.id === auditColumnId)?.automation?.agents);
          let auditor = textOrNull(latestFinished.leaseOwner);
          let auditorIndependent = verdict === 'pass' && !independentlySigned && !!auditor && auditAgents.includes(auditor);
          // An INDEPENDENT audit pass (a recorded independent signer, or a configured reviewer agent's PASS
          // run) supersedes a lingering needs_audit flag — the fresh pass is authoritative. A bare daemon
          // self-sign still respects needs_audit (it may not self-pass a card flagged for rework).
          if (verdict === 'pass' && (independentlySigned || auditorIndependent || (separation.ok && !flags.has('needs_audit')))) {
            // Release proof-contract: a self-reported PASS marker is not enough to ship. Actually run
            // the unit suite against the (still uncommitted) work before it advances to the commit
            // stage. Fail-closed — a failing or timed-out run holds the card for rework (re-execution
            // resets its checks and re-verifies); a verified absence of a test setup does not block. A
            // docs/prose-only changeset has nothing the suite could verify, so skip it rather than risk a
            // FALSE hold from the load-sensitive suite (the clean-diff + hygiene floor still gate it).
            let testProbe = changesetTouchesCode(cardWorkingDir(latestCard))
              ? await runReleaseTests(cardWorkingDir(latestCard))
              : { available: false, reason: 'changeset touches no code; unit gate not applicable' };
            if (testProbe.available && !testProbe.passed) {
              let nextFlags = normalizeRecoveryFlags([...flags, 'needs_audit']);
              let held = normalizeWorkflowCardInput({
                ...latestCard, recoveryFlags: nextFlags, version: latestCard.version + 1,
                updatedAt: runtimeNow, updatedBy: principal.label,
              }, {
                id: latestCard.id, actor: principal.label, now: runtimeNow,
                version: latestCard.version + 1, createdAt: latestCard.createdAt, updatedAt: runtimeNow,
              });
              ops.push({ op: 'set', path: `workflowCards/${latestCard.id}`, value: held });
              latestCard = held;
              continue;
            }
            if (independentlySigned) {
              // Already signed by an independent principal — nothing to record.
            } else if (auditorIndependent) {
              // Attribute the floor sign to the independent reviewer agent that ran the audit, so the
              // pass stays auditable and auditSignedIndependently honours it on later passes.
              let signed = {
                status: 'passed',
                signedBy: auditor,
                reason: `autonomous mode: independent reviewer ${auditor} reported PASS`,
                at: runtimeNow,
              };
              checks = { ...checks, audit: signed };
              ops.push(checksSetOp(card.id, checks, runtimeNow, principal));
            } else {
              // Daemon self-sign. Under a waiver, record the approver who accepted the separated-duty
              // bypass so it stays attributable; without one (no recorded executor) it is an ordinary
              // daemon signature.
              let signed = separation.waiver
                ? {
                  ...daemonSignedCheck(
                    `autonomous mode: audit run reported PASS (daemon self-sign waived by ${separation.waiver.approver})`,
                    runtimeNow,
                  ),
                  waiver: { approver: separation.waiver.approver },
                }
                : daemonSignedCheck('autonomous mode: audit run reported PASS', runtimeNow);
              checks = { ...checks, audit: signed };
              ops.push(checksSetOp(card.id, checks, runtimeNow, principal));
            }
            // The audit passed: clear the consecutive-rework counter (so a later, unrelated stall starts
            // its own count) and drop a lingering needs_audit flag (the pass is authoritative) so the
            // advanced card lands clean.
            if (latestCard.metadata && 'reworkCycles' in latestCard.metadata) {
              let cleaned = { ...latestCard.metadata };
              delete cleaned.reworkCycles;
              latestCard = { ...latestCard, metadata: cleaned };
            }
            if (flags.has('needs_audit')) {
              latestCard = { ...latestCard, recoveryFlags: normalizeRecoveryFlags([...flags].filter(f => f !== 'needs_audit')) };
            }
            let advance = runtimeAdvanceCardOps(
              board, latestCard, publishColumnId, principal, runtimeNow,
              `Autonomous release tail: audit verdict PASS, advancing ${card.id} to ${publishColumnId}.`,
              'autonomous_release',
            );
            ops.push(...advance.ops);
            latestCard = advance.card;
            advanced.push({ cardId: card.id, toColumnId: publishColumnId });
          } else if (!hasActiveEscalation(latestCard)) {
            // The audit did NOT approve the work (FAIL, no verdict, or a daemon self-sign barred by
            // separated duty) AND no escalation episode is open yet — so the problem RETURNS TO THE
            // ORCHESTRATOR instead of sticking here silently or being parked for a human by the board:
            // raise a `rework` escalation and the re-engagement driver routes the card back to the
            // orchestrate column. The orchestrator owns the routing decision (re-audit, re-execute,
            // reject, or — the extreme case — ask a human with its OWN question). Gating on
            // `!hasActiveEscalation` (not the needs_audit flag) means a card ALREADY flagged needs_audit
            // — including one wedged before this code shipped — is still rescued; the open escalation then
            // prevents re-raising every tick. A bounded consecutive-rework counter (persisted on metadata,
            // so it survives the re-execution run that clears the escalation) flips the detail to an
            // explicit "automatic rework is exhausted — terminate now" directive so the orchestrator stops
            // looping and decides; the board never fabricates a human prompt or a terminal of its own here.
            let reworkCycles = Number(latestCard.metadata?.reworkCycles ?? 0) + 1;
            let exhausted = reworkCycles > DEFAULT_AUDIT_REWORK_LIMIT;
            let verdictText = verdict === 'fail' ? 'reported FAIL'
              : verdict === 'pass' ? 'passed but could not be independently signed (separated duty)'
                : 'produced no PASS/FAIL verdict';
            let detail = exhausted
              ? `Quality audit ${verdictText} for ${card.id} after ${reworkCycles - 1} orchestrator re-routes; automatic rework is exhausted. Decide now: reject (WORKFLOW_RESULT: rejected) or — only if a person genuinely must choose — ask a human (WORKFLOW_RESULT: needs_human with your own question and options). Do not request another plain rework.`
              : `Quality audit ${verdictText} for ${card.id}; returning to the orchestrator to re-route (re-audit, re-execute, or reject).`;
            let escalationMetadata = raiseEscalationMetadata(latestCard, {
              kind: 'rework',
              detail,
              options: [],
              runId: latestFinished?.id ?? null,
              at: runtimeNow,
            });
            let nextFlags = normalizeRecoveryFlags([...flags, 'needs_audit']);
            let held = normalizeWorkflowCardInput({
              ...latestCard, recoveryFlags: nextFlags,
              metadata: { ...escalationMetadata, reworkCycles },
              version: latestCard.version + 1,
              updatedAt: runtimeNow, updatedBy: principal.label,
            }, {
              id: latestCard.id, actor: principal.label, now: runtimeNow,
              version: latestCard.version + 1, createdAt: latestCard.createdAt, updatedAt: runtimeNow,
            });
            ops.push({ op: 'set', path: `workflowCards/${latestCard.id}`, value: held });
            latestCard = held;
          }
        }
      }

      // Stage 2 — commit-publish → done when publishMode delegates the publish to the board AND the
      // publish column's autoAdvance is on. With autoAdvance off a human owns the merge: the card waits in
      // commit-publish (marked awaitingHuman) even under publishMode 'after_audit'.
      if (latestCard.columnId === publishColumnId && closeColumnId && publishMode === 'after_audit'
        && !flags.has('needs_audit') && !columnAutoAdvances(board, publishColumnId)) {
        let marked = markAwaitingHuman(latestCard, board, publishColumnId, runtimeNow);
        if (JSON.stringify(marked.metadata?.awaitingHuman) !== JSON.stringify(latestCard.metadata?.awaitingHuman)) {
          let held = normalizeWorkflowCardInput({
            ...marked, version: latestCard.version + 1, updatedAt: runtimeNow, updatedBy: principal.label,
          }, {
            id: latestCard.id, actor: principal.label, now: runtimeNow,
            version: latestCard.version + 1, createdAt: latestCard.createdAt, updatedAt: runtimeNow,
          });
          ops.push({ op: 'set', path: `workflowCards/${latestCard.id}`, value: held });
          latestCard = held;
          awaitingHuman.push(card.id);
        }
      } else if (latestCard.columnId === publishColumnId && closeColumnId && publishMode === 'after_audit'
        && !flags.has('needs_audit')) {
        let needCleanDiff = !checkPassed(checks.cleanDiff);
        let needHygiene = !(checkPassed(checks.hygiene) || checkPassed(checks.publicHygiene) || checkPassed(checks.packageHygiene));
        // The clean-diff/hygiene floor is signed off a REAL probe of the card's working tree, never a
        // bare daemon signature: there must be a non-empty, junk-free changeset to ship. If the probe
        // is unavailable (no git repo) or shows an empty diff / hygiene offenders, the card is HELD as
        // needs_audit rather than auto-closed — fail-closed, so unverifiable work never ships.
        if (needCleanDiff || needHygiene) {
          let probe = probeReleaseGate(cardWorkingDir(card));
          if (!probe.available || !probe.hasDiff || !probe.hygiene) {
            let nextFlags = normalizeRecoveryFlags([...flags, 'needs_audit']);
            let held = normalizeWorkflowCardInput({
              ...latestCard, recoveryFlags: nextFlags, version: latestCard.version + 1,
              updatedAt: runtimeNow, updatedBy: principal.label,
            }, {
              id: latestCard.id, actor: principal.label, now: runtimeNow,
              version: latestCard.version + 1, createdAt: latestCard.createdAt, updatedAt: runtimeNow,
            });
            ops.push({ op: 'set', path: `workflowCards/${latestCard.id}`, value: held });
            latestCard = held;
            continue;
          }
          let evidence = { changedFiles: probe.changedFiles, offenders: probe.offenders };
          let reason = `autonomous release tail: ${probe.reason}`;
          checks = {
            ...checks,
            ...(needCleanDiff ? { cleanDiff: probeSignedCheck(reason, runtimeNow, evidence) } : {}),
            ...(needHygiene ? { hygiene: probeSignedCheck(reason, runtimeNow, evidence) } : {}),
          };
          ops.push(checksSetOp(card.id, checks, runtimeNow, principal));
        }
        // Autonomous publish = commit the card's isolated worktree to its branch and merge it back to
        // base, then close. This is where the autonomous mode "publishes" the work without a human — the
        // mode owns the merge. A non-isolated card (shared-tree fallback / non-git) skips straight to the
        // close, leaving its uncommitted changes for a human exactly as before. A merge CONFLICT is the
        // one case the board cannot self-resolve: the card parks in the decision lane with the conflict
        // detail and its worktree intact, so a human resolves it instead of the board force-merging.
        let wt = cardWorktree(latestCard);
        if (wt) {
          let repoRoot = wt.repoRoot ?? cardBaseRepo(latestCard);
          let label = `${latestCard.title} (${latestCard.id})`;
          let commitRes = await worktreeOps.commitWorktree({
            worktreePath: wt.path, message: `Agent Portal: ${label}`,
          });
          let mergeRes = commitRes.ok
            ? await worktreeOps.mergeWorktree({
              repoRoot, branch: wt.branch, baseRef: wt.baseRef, message: `Agent Portal: merge ${label}`,
            })
            : { ok: false, conflict: false, detail: commitRes.reason };
          if (!mergeRes.ok) {
            let reason = mergeRes.conflict
              ? `Autonomous merge of ${card.id} into ${wt.baseRef} hit a conflict (${mergeRes.detail}). Parked for a human to resolve the worktree at ${wt.path} on branch ${wt.branch}.`
              : `Autonomous publish of ${card.id} could not merge (${mergeRes.detail}). Parked for a human (worktree ${wt.path}, branch ${wt.branch}).`;
            let park = parkCardForDecisionOps(board, latestCard, reason, {
              type: 'decision', resolution: 'needs_decision', detail: reason,
              mergeConflict: { branch: wt.branch, baseRef: wt.baseRef, files: mergeRes.conflictFiles ?? [] },
            }, principal, runtimeNow, {
              mergeConflict: { at: runtimeNow, branch: wt.branch, baseRef: wt.baseRef, detail: mergeRes.detail, files: mergeRes.conflictFiles ?? [] },
            });
            if (park) {
              ops.push(...park.ops);
              latestCard = park.card;
              conflicted.push({ cardId: card.id, branch: wt.branch, files: mergeRes.conflictFiles ?? [] });
              continue;
            }
            // No decision lane configured — fall through and leave the card in publish (fail-closed).
            continue;
          }
          // Merged (or already-merged on a crash-retry). Remove the worktree + branch best-effort (the
          // orphan reaper backstops a failure here) and drop the worktree pointer so the closed card
          // carries no stale reference.
          await worktreeOps.removeWorktree({ repoRoot, worktreePath: wt.path, branch: wt.branch });
          latestCard = { ...latestCard, metadata: { ...asObject(latestCard.metadata) } };
          delete latestCard.metadata.worktree;
          merged.push({ cardId: card.id, branch: wt.branch });
        }
        let advance = runtimeAdvanceCardOps(
          board, latestCard, closeColumnId, principal, runtimeNow,
          `Autonomous release tail: published, closing ${card.id} to ${closeColumnId}.`,
          'autonomous_release',
        );
        ops.push(...advance.ops);
        latestCard = advance.card;
        closed.push(card.id);
      }
    }
    if (ops.length) {
      let result = gate('daemon.bookkeeping', principal, { boardId: board.id });
      if (result.ok) stateGraph.commit(ops, sourceForPrincipal(principal));
    }
    return { advanced, closed, merged, conflicted, awaitingHuman };
  }

  // Park any card carrying an active `needs_human` escalation in the human-decision lane (a daemon-bypass
  // move — no transition gate). This surfaces the "waiting on a human" state as a visible column instead
  // of a buried flag. `needs_human` is raised ONLY by the orchestrator's explicit `WORKFLOW_RESULT:
  // needs_human` decision (with its own question + options) — the board's loop-safety backstops never
  // fabricate one. Idempotent: a card already in the lane, already terminal, with a live run, or with no
  // decision lane configured is left untouched.
  function driveNeedsDecisionParking(board, principal, runtimeNow) {
    let laneId = decisionColumnId(board);
    if (!laneId) return { parked: [], notified: [] };
    let classifier = classifyWorkflowGraph(board);
    let ops = [];
    let parked = [];
    let notified = [];
    for (let card of Object.values(getCollection(stateGraph, 'workflowCards'))) {
      if (card.boardId !== board.id || card.columnId === laneId) continue;
      if (classifier.isTerminal(card.columnId)) continue;
      if (getRunsForCard(card.id).some(run => RUNNING_RUN_STATUSES.has(run.status))) continue;
      let state = card.metadata?.escalation ? normalizeWorkflowEscalationState(card.metadata.escalation) : null;
      if (!state || state.kind !== 'needs_human' || state.humanEscalated) continue;
      let advance = runtimeAdvanceCardOps(
        board, clone(card), laneId, principal, runtimeNow,
        `Parked for a human decision: ${state.detail ?? state.kind}.`,
        'needs_decision_park',
      );
      ops.push(...advance.ops);
      // Axis C: an explicit, watchable signal that a human is needed. Parking is the single chokepoint
      // every `needs_human` episode (backstop or orchestrator ask) flows through exactly once, so the
      // notification fires once per escalation without spamming.
      ops.push(humanEscalationNotificationOp(board, card, state, principal, runtimeNow));
      parked.push({ cardId: card.id, toColumnId: laneId });
      notified.push({ cardId: card.id, channel: 'human_escalated', escalationKind: state.kind });
    }
    if (ops.length) {
      let result = gate('daemon.bookkeeping', principal, { boardId: board.id });
      if (result.ok) stateGraph.commit(ops, sourceForPrincipal(principal));
    }
    return { parked, notified };
  }

  // Build a durable notification event for a card escalated to a human (Axis C). Previously reaching the
  // human-decision lane only moved the card; the collaboration surface needs an explicit, watchable
  // signal. One `notification` board event per parking, channel `human_escalated`, addressed to the
  // card's watchers (its owner plus any `metadata.watchers`) so a badge / watcher view can surface it.
  function humanEscalationNotificationOp(board, card, state, principal, ts) {
    let watchers = uniqueArray([
      textOrNull(card.owner),
      ...(Array.isArray(card.metadata?.watchers) ? card.metadata.watchers.map(textOrNull) : []),
    ].filter(Boolean));
    let detail = textOrNull(state?.detail ?? state?.lastEscalation?.detail) ?? 'A card needs a human decision.';
    let eventId = nextId(makeId, 'notification');
    let event = normalizeWorkflowTransitionEvent({
      id: eventId, eventType: 'notification', boardId: board.id, cardId: card.id,
      fromColumnId: card.columnId, toColumnId: card.columnId, actor: principal.label, mode: 'auto',
      reason: detail, status: 'accepted',
      sideEffects: [{
        type: 'notification', channel: 'human_escalated', cardId: card.id,
        escalationKind: state?.kind ?? 'needs_human', detail, watchers,
      }],
    }, { id: eventId, now: ts });
    return { op: 'set', path: `workflowTransitions/${event.id}`, value: event };
  }

  // ── Per-card collaboration surface (Axis C: human-agent collaboration) ───────────────────────────
  // An auditable comment/note stream plus a human reply path into the return inbox. Comments are
  // recorded two ways: a bounded display cache on `card.metadata.comments` (cheap render) and one
  // durable `comment` event per post in the board log (the unbounded audit trail). Neither moves the
  // card nor grants a right — attribution + timestamp are frozen from the caller's principal and clock.

  // Durable ops for one posted comment: the bumped card (cache appended) plus a `comment` board event.
  // The caller may pass already-merged metadata (e.g. a reply that also folded a return into the inbox)
  // so a single card write carries both the comment and its side effects.
  function buildCommentOps(board, card, comment, principal, ts, baseMetadata, extraSideEffects = []) {
    let metadata = baseMetadata ?? (card.metadata && typeof card.metadata === 'object' ? { ...card.metadata } : {});
    metadata = { ...metadata, comments: appendCardComment(metadata.comments, comment) };
    let nextCard = normalizeWorkflowCardInput({
      ...card, metadata, version: card.version + 1, updatedAt: ts, updatedBy: principal.label,
    }, {
      id: card.id, actor: principal.label, now: ts,
      version: card.version + 1, createdAt: card.createdAt, updatedAt: ts,
    });
    let eventId = nextId(makeId, 'comment');
    let event = normalizeWorkflowTransitionEvent({
      id: eventId, eventType: 'comment', boardId: board.id, cardId: card.id,
      fromColumnId: card.columnId, toColumnId: card.columnId, actor: principal.label, mode: 'manual',
      reason: comment.body ?? comment.optionId ?? comment.kind, status: 'accepted',
      sideEffects: [
        { type: 'comment', kind: comment.kind, commentId: comment.id, author: comment.author, body: comment.body, optionId: comment.optionId },
        ...extraSideEffects,
      ],
    }, { id: eventId, now: ts });
    return {
      card: nextCard,
      ops: [
        { op: 'set', path: `workflowCards/${card.id}`, value: nextCard },
        { op: 'set', path: `workflowTransitions/${event.id}`, value: event },
      ],
    };
  }

  // Post an auditable note/comment to a card (board:write-card). Free-form collaboration the board
  // records but never reasons about. Returns the frozen comment record.
  function addCardComment(args = {}, context = {}) {
    let principal = resolvePrincipal(context);
    let board = ensureBoard(args.boardId ?? args.board_id ?? DEFAULT_WORKFLOW_BOARD_ID);
    let cardId = textOrNull(args.cardId ?? args.card_id);
    let raw = cardId ? stateGraph.get(`workflowCards/${cardId}`) : null;
    if (!raw) return { ok: false, error: 'card_not_found' };
    let card = clone(raw);
    let verdict = gate('card.write', principal, { boardId: board.id, cardId: card.id });
    if (!verdict.ok) return verdict;
    let ts = now();
    let comment = normalizeWorkflowComment(
      { ...args, cardId: card.id, kind: args.kind ?? 'comment' },
      { now: ts, id: nextId(makeId, 'comment'), author: principal.label, authorRole: principal.kind },
    );
    if (!comment) return { ok: false, error: 'empty_comment' };
    let built = buildCommentOps(board, card, comment, principal, ts);
    stateGraph.commit(built.ops, sourceForPrincipal(principal));
    return { ok: true, cardId: card.id, comment };
  }

  // Read the bounded per-card comment cache (oldest first). The unbounded audit trail is the board
  // event log (`listWorkflowEvents` / eventType 'comment'); this is the cheap render surface.
  function listCardComments(args = {}) {
    let cardId = textOrNull(args.cardId ?? args.card_id);
    let raw = cardId ? stateGraph.get(`workflowCards/${cardId}`) : null;
    if (!raw) return { ok: false, error: 'card_not_found' };
    let card = clone(raw);
    let comments = Array.isArray(card.metadata?.comments) ? card.metadata.comments : [];
    return { ok: true, cardId: card.id, comments };
  }

  // A human reply on a card — the missing human→orchestrator return path (Axis C). Until now the return
  // inbox carried only agent→orchestrator events, so a `needs_decision` could be closed only by another
  // agent run. A reply records an auditable comment AND mints a return into the card's inbox attributed
  // to the human, so the SAME re-engagement driver wakes the orchestrator carrying the person's answer.
  // Governed by board:control (card.control — the decision-closing capability). `resolve`
  // (default true when a decision is live) also clears the live escalation so the person closes the
  // episode directly; the routed return still wakes the orchestrator to act on the answer.
  function replyToCard(args = {}, context = {}) {
    let principal = resolvePrincipal(context);
    let board = ensureBoard(args.boardId ?? args.board_id ?? DEFAULT_WORKFLOW_BOARD_ID);
    let cardId = textOrNull(args.cardId ?? args.card_id);
    let raw = cardId ? stateGraph.get(`workflowCards/${cardId}`) : null;
    if (!raw) return { ok: false, error: 'card_not_found' };
    let card = clone(raw);
    let verdict = gate('card.control', principal, { boardId: board.id, cardId: card.id });
    if (!verdict.ok) return verdict;
    let ts = now();
    let state = card.metadata?.escalation ? normalizeWorkflowEscalationState(card.metadata.escalation) : null;
    let liveDecision = Boolean(state && !state.humanEscalated && (state.kind === 'needs_decision' || state.kind === 'needs_human'));
    let resolve = args.resolve === undefined ? liveDecision : Boolean(args.resolve);

    let comment = normalizeWorkflowComment(
      { ...args, cardId: card.id, kind: 'reply' },
      { now: ts, id: nextId(makeId, 'comment'), author: principal.label, authorRole: principal.kind },
    );
    if (!comment) return { ok: false, error: 'empty_reply' };

    // Mint the reply as a routed actionable return into the inbox. `resolve` answers the open decision
    // (a routed `completed` — wake-driving, non-re-raising, mirroring a join answer routed to its owner);
    // a non-resolving reply is a routed `discovered` contribution that still wakes the loop once. raisedBy
    // is the HUMAN, so the inbox is no longer an agent-only channel.
    let returnDetail = [comment.optionId ? `Human chose: ${comment.optionId}` : null, comment.body]
      .filter(Boolean).join(' — ') || 'Human reply.';
    let eventId = `reply-${crypto.createHash('sha256').update(`${card.id}:${comment.id}`).digest('hex').slice(0, 24)}`;
    let returnEvent = normalizeWorkflowReturnEvent(
      { kind: resolve ? 'completed' : 'discovered', detail: returnDetail, payload: { optionId: comment.optionId, answer: comment.body, commentId: comment.id } },
      { now: ts, correlationId: card.id, raisedBy: principal.label, eventId, routed: true },
    );
    let metadata = card.metadata && typeof card.metadata === 'object' ? { ...card.metadata } : {};
    metadata.returns = coalesceReturnEvents(metadata.returns, returnEvent);
    metadata.humanAnswer = { optionId: comment.optionId, answer: comment.body, at: ts, by: principal.label };
    // The person closes the decision: clear the live escalation episode (the routed return remains in the
    // inbox as the durable answer + wakes the orchestrator). The auto-rework budget resets with it.
    if (resolve && state) {
      delete metadata.escalation;
      delete metadata.reworkCycles;
    }
    let built = buildCommentOps(board, card, comment, principal, ts, metadata, [
      { type: 'return', status: 'queued', kind: returnEvent.kind, source: 'human', resolved: resolve },
    ]);
    stateGraph.commit(built.ops, sourceForPrincipal(principal));
    return { ok: true, cardId: card.id, comment, resolved: resolve, returnEventId: returnEvent.eventId };
  }

  async function reconcileWorkflowRuntimeTasks(filter = {}, runtimeTasks = readStateGraphRuntimeTasks(), { drive = false } = {}) {
    // Schedule/projection-driven board self-reconciliation: the board's own automation
    // commits these runtime transitions, so the committing identity is the daemon.
    let principal = daemonPrincipal();
    let board = ensureBoard(filter.boardId ?? filter.board_id ?? DEFAULT_WORKFLOW_BOARD_ID);
    let projectId = textOrNull(filter.projectId ?? filter.project_id);
    let goalId = textOrNull(filter.goalId ?? filter.goal_id);
    let chatId = textOrNull(filter.chatId ?? filter.chat_id);
    let currentNow = now();
    let ops = [];
    // Per-pass owner-return drafts (finding: sibling routed returns clobbering on a shared ops batch).
    // Several children of the same parent can route a return in one pass; each routeReturnToParent call
    // reads/writes the accumulated owner draft here so the returns stack instead of last-write-wins, and
    // the drafts are flushed to ONE op per owner after the card loop (a parent reconciled in this same
    // pass merges its draft into its own card update so neither side is lost).
    let ownerReturnDrafts = new Map();
    // Upstream cards whose run reached a terminal-failure this pass — their downstream dependency
    // edges are resolved after the reconcile commit (inv 22) so the upstream's failed status is
    // already durable when propagation reads it.
    let failedUpstreamIds = new Set();
    // Cards auto-advanced into a new column this pass (e.g. in-progress→quality-audit). After the
    // commit lands, the destination column's on_enter automation is driven for these (drive only).
    let advanced = [];

    for (let card of Object.values(getCollection(stateGraph, 'workflowCards'))) {
      if (card.boardId !== board.id) continue;
      if (projectId && card.projectId !== projectId) continue;
      if (goalId && card.entityRefs?.goalId !== goalId) continue;
      if (chatId && card.entityRefs?.chatId !== chatId) continue;
      let allRuns = getRunsForCard(card.id);
      // Token backfill (timing-safe): a run's status can terminalize from its task before the
      // worker's token total lands on the task record (results persist asynchronously). Terminal
      // runs are not reprocessed below, so backfill their token total here while the runtime task is
      // still readable. Idempotent — only runs still missing a token total are touched.
      for (let run of allRuns) {
        if (RUNNING_RUN_STATUSES.has(run.status)) continue;
        let tokens = run.tokens == null ? runtimeTaskTokenTotal(run, runtimeTasks) : null;
        let chatId = run.chatId ? null : runtimeTaskChatId(run, runtimeTasks);
        if (tokens == null && chatId == null) continue;
        ops.push({ op: 'set', path: `workflowRuns/${run.id}`, value: normalizeWorkflowRunInput(
          { ...run, tokens: tokens ?? run.tokens ?? null, chatId: run.chatId ?? chatId },
          { id: run.id, now: currentNow, updatedAt: run.updatedAt ?? currentNow },
        ) });
      }
      let runs = allRuns.filter(run => RUNNING_RUN_STATUSES.has(run.status));
      if (!runs.length) continue;
      let latestCard = clone(card);
      let cardChanged = false;

      for (let run of runs) {
        let nextStatus = workflowRunStatusFromRuntime(run, runtimeTasks);

        // Lease heartbeat: slide the lease forward only while the linked runtime task is
        // demonstrably ALIVE — gated on activity freshness, not the status string alone. A task
        // frozen in "running" (agent-pool crashed/restarted, stale snapshot) has a stale or absent
        // activity timestamp; we then leave the lease to expire so recovery can see it (fail-closed).
        // Only extend forward, only for the lease this run owns.
        if (nextStatus === 'running') {
          let lease = stateGraph.get(`workflowLeases/${card.id}`);
          if (lease && (!lease.runId || lease.runId === run.id)) {
            let lastActivityAt = latestRuntimeTaskTimestamp(run, runtimeTasks);
            let fresh = lastActivityAt !== null
              && (currentNow - lastActivityAt) <= DEFAULT_RUNTIME_HEARTBEAT_FRESHNESS_MS;
            let refreshed = currentNow + DEFAULT_LEASE_TTL_MS;
            if (fresh && refreshed > Number(lease.leaseExpiresAt ?? 0)) {
              let nextLease = normalizeWorkflowLeaseInput(
                { ...lease, leaseExpiresAt: refreshed },
                { cardId: card.id, updatedAt: currentNow },
              );
              ops.push({ op: 'set', path: `workflowLeases/${card.id}`, value: nextLease });
            }
          }
        }

        // Liveness watchdog: an active run (running/requested/recovering) whose linked runtime task has
        // gone missing (nextStatus null) or shown no activity within the staleness window is a DEAD /
        // phantom run — the worker crashed, was killed externally, or agent-pool lost it. Reconcile it to
        // a resumable terminal status (`error` + watchdogLost) so the card self-heals (re-queued for
        // resume) instead of wedging "running" forever: a phantom-active run otherwise blocks its own
        // re-engagement (self-feed guard), holds its file scope, and cannot be deleted.
        let watchdogLost = false;
        if (RUNNING_RUN_STATUSES.has(run.status) && (nextStatus === null || nextStatus === 'running')) {
          let lastActivityAt = latestRuntimeTaskTimestamp(run, runtimeTasks);
          let referenceAt = lastActivityAt ?? Number(run.updatedAt ?? run.startedAt ?? 0);
          if (referenceAt > 0 && (currentNow - referenceAt) > DEFAULT_RUNTIME_STALE_RUN_MS) {
            nextStatus = 'error';
            watchdogLost = true;
          }
        }

        // Intermediate-return mint (S6): a still-live run may emit a `WORKFLOW_RETURN: <kind>` marker
        // before it terminalizes. Parse it BEFORE the no-status-change continue so a progress/discovered/
        // needs_decision return on a card whose run status is unchanged still lands in the inbox. Most
        // passes have no marker → computeIntermediateReturn returns null (zero cost).
        let returnEvent = !TERMINAL_RUN_STATUSES.has(nextStatus)
          ? computeIntermediateReturn(latestCard, run, runtimeTasks, currentNow)
          : null;
        if (returnEvent && nextStatus === run.status) {
          // No run-status transition this pass, but a return was minted: fold it (and, for a
          // hard-interrupt, its escalation) into the card and commit, then move to the next run.
          let nextReturns = coalesceReturnEvents(latestCard.metadata?.returns, returnEvent);
          let returnMetadata = foldReturnEscalation(
            { ...(latestCard.metadata && typeof latestCard.metadata === 'object' ? latestCard.metadata : {}), returns: nextReturns },
            returnEvent,
            currentNow,
          );
          latestCard = normalizeWorkflowCardInput({
            ...latestCard,
            metadata: returnMetadata,
            version: latestCard.version + 1,
            updatedAt: currentNow,
            updatedBy: principal.label,
          }, {
            id: latestCard.id,
            actor: principal.label,
            now: currentNow,
            version: latestCard.version + 1,
            createdAt: latestCard.createdAt,
            updatedAt: currentNow,
          });
          // Route an ACTIONABLE intermediate return to the live parent (owner) so the orchestrator can
          // act on it before all children settle. Soft progress/partial (non-actionable) is skipped so
          // the parent is not churned on every tick. Deterministic eventId + coalesce make a re-parse on
          // a still-running run a no-op (no double-wake). Rides the SAME reconcile commit batch.
          if (returnEvent.actionable && textOrNull(latestCard.parentCardId)) {
            // Accumulate into the per-pass owner draft (flushed once after the loop) so two siblings
            // routing to the same parent in this pass don't overwrite each other's appended return.
            routeReturnToParent(latestCard.parentCardId, returnEvent, currentNow, principal, ownerReturnDrafts);
          }
          cardChanged = true;
          continue;
        }

        if (!nextStatus || nextStatus === run.status) continue;
        let terminal = TERMINAL_RUN_STATUSES.has(nextStatus);
        // A run whose task(s) ended lost/stale (heartbeat timeout, or a worker orphaned by a backend
        // restart) is a RESUMABLE interruption surfacing as `error`, not a genuine failure: re-queue it
        // for the orchestrator to resume from prior work rather than push it to audit as failed.
        let resumableInterruption = nextStatus === 'error' && (watchdogLost || runInterruptionResumable(run, runtimeTasks));
        // A terminal-FAILURE upstream (error|failed|cancelled) triggers downstream edge resolution — but a
        // resumable interruption has not failed, so it must NOT fan out failure to its dependents.
        if (['error', 'failed', 'cancelled'].includes(nextStatus) && !resumableInterruption) failedUpstreamIds.add(card.id);
        let completedAt = terminal ? workflowRunCompletedAt(run, runtimeTasks, currentNow) : null;
        let nextRun = normalizeWorkflowRunInput({
          ...run,
          status: nextStatus,
          completedAt: terminal ? completedAt : run.completedAt,
          tokens: runtimeTaskTokenTotal(run, runtimeTasks) ?? run.tokens ?? null,
          chatId: run.chatId ?? runtimeTaskChatId(run, runtimeTasks),
        }, {
          id: run.id,
          now: currentNow,
          updatedAt: completedAt ?? currentNow,
        });
        ops.push({ op: 'set', path: `workflowRuns/${run.id}`, value: nextRun });

        // A resumable interruption returns to the orchestrate stage so the autonomous orchestrate drive
        // re-picks it under pickup=auto; the re-pickup carries the resume preamble (buildWorkItemPrompt
        // isResume) so the worker continues from prior on-disk work. A genuine terminal status advances
        // per runtimeColumnForCard.
        let orchestrateColumnId = (board.columns ?? []).find(column => textOrNull(column?.automation?.action) === 'orchestrate')?.id ?? 'ready';
        let nextColumnId = resumableInterruption ? orchestrateColumnId : runtimeColumnForCard(latestCard, nextStatus);
        // Per-column autonomy gate: when the source column's autoAdvance is off, a cleanly-completed run
        // does NOT auto-advance to audit — the card stays put for a human, marked awaitingHuman so the UI
        // can surface it. A failure/interruption still routes (for recovery), so the gate is happy-path only.
        let heldForHuman = terminal && nextStatus === 'completed' && !resumableInterruption
          && nextColumnId !== latestCard.columnId && !columnAutoAdvances(board, latestCard.columnId);
        if (heldForHuman) {
          latestCard = markAwaitingHuman(latestCard, board, latestCard.columnId, currentNow);
          nextColumnId = latestCard.columnId;
        }
        let flags = new Set(normalizeRecoveryFlags(latestCard.recoveryFlags));
        if (terminal) {
          if (resumableInterruption) {
            // Mark for resume rather than audit; the orchestrate re-pickup owns the next attempt.
            flags.delete('needs_audit');
            flags.add('needs_resume');
          } else {
            flags.delete('recovering');
            flags.delete('needs_resume');
            if (nextStatus !== 'completed') flags.add('needs_audit');
            // Execute-stage proof-contract: a `completed` exit is not proof of work. Cross-check the
            // run's working tree — a clean process exit that produced NO diff is a no-op masquerading as
            // done, so it advances to audit flagged needs_audit rather than presented as finished work.
            // Fail-safe: only a real probe that DEFINITIVELY shows an empty diff flags it (a non-git or
            // unreadable cwd cannot prove a no-op, so behavior is unchanged there).
            let columnAction = textOrNull(
              (board.columns ?? []).find(column => column.id === latestCard.columnId)?.automation?.action,
            );
            if (nextStatus === 'completed' && columnAction === 'execute') {
              let probe = probeReleaseGate(cardWorkingDir(latestCard));
              if (probe.available && !probe.hasDiff) flags.add('needs_audit');
            }
          }
        }
        let nextFlags = [...flags].filter(flag => normalizeRecoveryFlags([flag]).length > 0);
        // A resumable interruption is not an escalation episode (no human decision / rework needed) and
        // does not mint a `failed` return — it is simply re-queued for resume.
        let escalationDelta = terminal && !resumableInterruption
          ? computeTerminalEscalation(latestCard, run, nextStatus, runtimeTasks, currentNow)
          : null;
        let nextMetadata = escalationDelta ? escalationDelta.metadata : latestCard.metadata;
        // Terminal-return mint (S7): a run reaching a final status mints a completed|failed return. A
        // non-terminal status change (e.g. requested→running) carries any intermediate return parsed
        // above. Fold the minted return into the inbox (coalesce drops a late progress after a terminal,
        // so no extra logic) so it lands in the SAME card update / commit as the rest of the reconcile.
        let mintedReturn = terminal && !resumableInterruption
          ? normalizeWorkflowReturnEvent(
            { kind: nextStatus === 'completed' ? 'completed' : 'failed', detail: escalationDelta?.detail ?? null },
            // A per-run-distinct eventId so routeReturnToParent's derived `routed-<sha(eventId:owner)>` id
            // differs across sibling terminal completions under the same parent — otherwise every sibling's
            // routed copy would coalesce onto a single id and only the first ever reaches the orchestrator.
            { now: currentNow, correlationId: latestCard.id, runId: run.id, taskId: uniqueArray(run.taskIds)[0] ?? null, seq: nextRun.version ?? null, raisedBy: ESCALATION_ACTOR, eventId: `term-${crypto.createHash('sha256').update(run.id).digest('hex').slice(0, 20)}` },
          )
          : returnEvent;
        if (mintedReturn) {
          let baseMetadata = nextMetadata && typeof nextMetadata === 'object' ? nextMetadata : {};
          let nextReturns = coalesceReturnEvents(latestCard.metadata?.returns, mintedReturn);
          // S8: a hard-interrupt return ALSO folds onto metadata.escalation (same writer as the
          // escalation reconcile) so hasActiveEscalation stays true and the driver re-engages it.
          nextMetadata = foldReturnEscalation({ ...baseMetadata, returns: nextReturns }, mintedReturn, currentNow);
          // Route an ACTIONABLE terminal/carried return to the live parent (owner) so the orchestrator
          // sees a child's completed|failed (or carried intermediate) result before a full-join wake.
          // Non-actionable progress/partial is skipped; deterministic eventId + coalesce dedup any
          // re-route. Owner op rides the SAME reconcile commit batch (ops below at the pass commit).
          if (mintedReturn.actionable && textOrNull(latestCard.parentCardId)) {
            routeReturnToParent(latestCard.parentCardId, mintedReturn, currentNow, principal, ownerReturnDrafts);
          }
        }
        // Orchestrator reject DECISION: a completed run that emitted `WORKFLOW_RESULT: rejected` retires
        // the card to the reject terminal with a resolution status instead of advancing it. The decision
        // is final — clear any escalation episode and the needs_audit flag (nothing left to re-route).
        let rejectReason = terminal && nextStatus === 'completed' ? runRequestsReject(run, runtimeTasks) : null;
        if (rejectReason) {
          let rejectColumnId = rejectTerminalColumnId(board);
          if (rejectColumnId) {
            nextColumnId = rejectColumnId;
            let base = nextMetadata && typeof nextMetadata === 'object' ? { ...nextMetadata } : {};
            delete base.escalation;
            base.resolution = { status: 'rejected', reason: rejectReason, at: completedAt ?? currentNow, by: principal.label };
            nextMetadata = base;
            nextFlags = nextFlags.filter(flag => flag !== 'needs_audit');
          }
        }
        // Orchestrator human-decision ASK: a completed run that emitted `WORKFLOW_RESULT: needs_human`
        // raises a `needs_human` escalation (with its question + button options) and stays put — the
        // parking driver relocates it to the decision lane next pass. Mutually exclusive with reject.
        let humanAsk = !rejectReason && terminal && nextStatus === 'completed'
          ? runRequestsHumanDecision(run, runtimeTasks)
          : null;
        if (humanAsk) {
          nextColumnId = latestCard.columnId;
          nextMetadata = raiseEscalationMetadata(
            { ...latestCard, metadata: nextMetadata },
            { kind: 'needs_human', detail: humanAsk.detail, options: humanAsk.options, runId: run.id, at: completedAt ?? currentNow },
          );
          nextFlags = nextFlags.filter(flag => flag !== 'needs_audit');
        }
        // A terminated run leaves no live lifecycle; normalize stale `running` back to `idle`
        // (valid per WORKFLOW_CARD_LIFECYCLE_STATES) so bookkeeping reflects the ended run.
        let nextLifecycle = terminal ? 'idle' : latestCard.lifecycle;
        let needsCardUpdate = nextColumnId !== latestCard.columnId
          || nextFlags.join('|') !== normalizeRecoveryFlags(latestCard.recoveryFlags).join('|')
          || escalationDelta !== null
          || mintedReturn !== null
          || (terminal && latestCard.lifecycle === 'running');

        if (needsCardUpdate) {
          // Record an auto-advance so on_enter automation can be driven post-commit (inv: drive).
          if (nextColumnId !== latestCard.columnId) advanced.push({ cardId: latestCard.id, toColumnId: nextColumnId });
          latestCard = normalizeWorkflowCardInput({
            ...latestCard,
            columnId: nextColumnId,
            lifecycle: nextLifecycle,
            recoveryFlags: nextFlags,
            metadata: nextMetadata,
            version: latestCard.version + 1,
            updatedAt: completedAt ?? currentNow,
            updatedBy: principal.label,
          }, {
            id: latestCard.id,
            actor: principal.label,
            now: currentNow,
            version: latestCard.version + 1,
            createdAt: latestCard.createdAt,
            updatedAt: completedAt ?? currentNow,
          });
          cardChanged = true;
        }

        if (escalationDelta) {
          let escId = nextId(makeId, 'escalation');
          let escEvent = normalizeWorkflowTransitionEvent({
            id: escId,
            eventType: 'escalation',
            boardId: board.id,
            cardId: latestCard.id,
            fromColumnId: latestCard.columnId,
            toColumnId: latestCard.columnId,
            actor: principal.label,
            mode: 'auto',
            reason: escalationDelta.status === 'cleared'
              ? `Escalation resolved by completed run ${run.id}.`
              : `Escalation ${escalationDelta.kind} recorded from run ${run.id}.`,
            status: 'accepted',
            sideEffects: [{
              type: 'escalation',
              status: escalationDelta.status,
              kind: escalationDelta.kind,
              detail: escalationDelta.detail,
              runId: run.id,
            }],
          }, { id: escId, now: completedAt ?? currentNow });
          ops.push({ op: 'set', path: `workflowTransitions/${escEvent.id}`, value: escEvent });
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
          actor: principal.label,
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
        // If this card also received routed returns as an owner EARLIER in THIS pass, the draft (built on
        // the pre-pass owner base) would clobber this fresher own-update — merge the draft's routed entries
        // onto latestCard. Then record the own-update INTO the drafts map so a child routing to this owner
        // LATER in the pass bases its copy off this fresher value (not the stale committed owner), keeping
        // a single final op per card whether the own-update or a routed return comes first.
        let draft = ownerReturnDrafts.get(latestCard.id);
        if (draft) {
          let merged = latestCard;
          let draftReturns = (Array.isArray(draft.metadata?.returns) ? draft.metadata.returns : []).filter(r => r?.routed === true);
          for (let routed of draftReturns) {
            let nextReturns = coalesceReturnEvents(merged.metadata?.returns, routed);
            merged = normalizeWorkflowCardInput({
              ...merged,
              metadata: { ...(merged.metadata && typeof merged.metadata === 'object' ? merged.metadata : {}), returns: nextReturns },
            }, { id: merged.id, actor: principal.label, now: currentNow, version: merged.version, createdAt: merged.createdAt, updatedAt: merged.updatedAt });
          }
          latestCard = merged;
        }
        ownerReturnDrafts.set(latestCard.id, latestCard);
      }
    }

    // Flush one op per card that was own-updated and/or routed-to this pass; the map holds the single
    // merged final value per path (own-update fresher base + any routed returns), so neither side clobbers.
    for (let draft of ownerReturnDrafts.values()) {
      ops.push({ op: 'set', path: `workflowCards/${draft.id}`, value: draft });
    }

    let committed = false;
    if (ops.length) {
      // The daemon's self-driven reconcile is slot/step/lease bookkeeping — gated on
      // daemon.bookkeeping (DAEMON). A non-daemon principal here would fail the gate and
      // the reconcile would not commit (fail-closed).
      let result = gate('daemon.bookkeeping', principal, { boardId: board.id });
      if (result.ok) {
        stateGraph.commit(ops, sourceForPrincipal(principal));
        committed = true;
      }
    }
    // on_enter drive (opt-in): an auto-advanced card (e.g. into quality-audit) only fires its
    // destination column's on_enter automation on the explicit transition/create paths today. The
    // autonomous reconcile loop owns this drive so a runtime-completed card actually starts its audit
    // instead of sitting needs_audit forever. Best-effort and idempotent — maybeAutoOrchestrateCard's
    // candidate gate (board mode/pickup, audit-already-passed) is the authority, and we skip a card
    // that still has a live run. Read-side projection callers pass drive=false (no agent spawns).
    let driven = [];
    if (drive && committed) {
      for (let entry of advanced) {
        let card = stateGraph.get(`workflowCards/${entry.cardId}`);
        if (!card) continue;
        let automation = cardAutomation(board, card);
        if (automation.trigger !== 'on_enter' || !['orchestrate', 'audit'].includes(automation.action)) continue;
        if (getRunsForCard(card.id).some(run => RUNNING_RUN_STATUSES.has(run.status))) continue;
        let outcome = null;
        try {
          outcome = await maybeAutoOrchestrateCard(board, clone(card), {}, { principal });
        } catch {
          // best-effort autonomous drive — a failed on_enter must not abort the reconcile pass.
        }
        driven.push({ cardId: card.id, toColumnId: entry.toColumnId, ok: Boolean(outcome?.ok), skipped: outcome?.skipped ?? null });
      }
    }
    // Autonomous backlog self-start (drive only, opt-in via board.mode==='autonomous'): promote scoped
    // backlog cards into the orchestrate column (then fire its on_enter orchestration), and drive a
    // one-shot `scope` for raw, never-run cards. This is the missing front of the pipeline — with it the
    // board runs idea(human) → done without a human from backlog onward.
    let backlog = null;
    if (drive && board.mode === 'autonomous') {
      // Front of the pipeline: promote raw ideas → backlog first, so a freshly-promoted idea is scoped
      // by driveAutonomousBacklog in this same pass (it re-reads cards from the graph).
      driveAutonomousInbox(board, principal, now());
      backlog = driveAutonomousBacklog(board, principal, now());
      // Level-triggered orchestration: drive freshly promoted/scoped cards AND any card parked idle in
      // the orchestrate column. The edge-triggered drive (the `advanced` loop) only fires on the tick a
      // card changes column and is gated on a running-run commit, so a card promoted on an earlier pass
      // — or before a restart — would otherwise sit in ready forever. maybeAutoOrchestrateCard is the
      // authority (candidate gate, capacity, file-scope) and dedups, so re-driving is a safe no-op.
      let orchestrateColumnId = (board.columns ?? []).find(column => textOrNull(column?.automation?.action) === 'orchestrate')?.id;
      let driveSet = new Set([...backlog.promoted.map(p => p.cardId), ...backlog.scopeNeeded]);
      if (orchestrateColumnId) {
        for (let card of Object.values(getCollection(stateGraph, 'workflowCards'))) {
          if (card.boardId === board.id && card.columnId === orchestrateColumnId) driveSet.add(card.id);
        }
      }
      for (let entry of driveSet) {
        let card = stateGraph.get(`workflowCards/${entry}`);
        if (!card) continue;
        if (getRunsForCard(card.id).some(run => RUNNING_RUN_STATUSES.has(run.status))) continue;
        try {
          await maybeAutoOrchestrateCard(board, clone(card), {}, { principal });
        } catch {
          // best-effort — a failed backlog drive must not abort the reconcile pass.
        }
      }
    }
    // Autonomous release tail (drive only, opt-in via board.mode==='autonomous'): walk audited cards
    // through quality-audit → commit-publish → done so verified work closes without a human. Runs every
    // drive pass (not just when this pass committed) so a card parked from an earlier pass — its audit
    // already complete — is still picked up. Requires a real audit verdict (proof-contract).
    let releaseTail = null;
    if (drive && board.mode === 'autonomous') {
      releaseTail = await driveAutonomousReleaseTail(board, principal, now(), runtimeTasks);
      // Reclaim worktrees of terminal/deleted cards (reject path + orphan reaper). After the release tail
      // so a card that just merged + closed this pass is cleaned in the same pass.
      await reconcileWorktreeCleanup(board);
    }
    // Human-decision parking runs in every mode (the orchestrator can ask for a human regardless of
    // autonomous self-drive): make any `needs_human` card visible in the decision lane.
    if (drive) {
      driveNeedsDecisionParking(board, principal, now());
    }
    // Failure propagation (inv 22): now that each failed upstream's status is durable, resolve every
    // downstream dependency edge that points at it per the dependent's onUpstreamFailure. Fan-in
    // fast-fail — a dependent resolves the moment ANY required edge terminal-fails.
    let propagated = [];
    for (let upstreamId of failedUpstreamIds) {
      let upstream = stateGraph.get(`workflowCards/${upstreamId}`);
      if (upstream) propagated.push(...propagateUpstreamResolution(clone(upstream), board, 'terminal_failure'));
    }
    return drive
      ? { ok: true, updated: ops.length, propagated, advanced, driven, releaseTail, backlog }
      : { ok: true, updated: ops.length, propagated, advanced };
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
    let activeColumnIds = activeRecoveryColumnIds(projection.board);
    let activeColumnIdSet = new Set(activeColumnIds);
    let cards = projection.cards
      .filter(card => activeColumnIdSet.has(card.columnId))
      .map(card => deriveRecoveryCard(card, currentNow))
      .filter(card => card.recoveryFlags.length > 0);
    return {
      schema: 'workflow-recovery/v1',
      boardId: projection.boardId,
      scope: projection.scope,
      activeColumnIds,
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

  // create_board: author a NON-DEFAULT board from an explicit column/transition spec. policy.define
  // gated (an unprivileged author returns pendingApproval, exactly like define_column/transition/gate).
  // Create-only: it refuses to clobber an existing board (use the define_* surface to mutate one) and
  // refuses to recreate the fixed default board through the spec path. The proposed board is graph-
  // validated and persisted by the SAME commitDefinedBoard path the define_* authoring surface uses, so
  // an invalid graph is rejected without persisting (inv 11) and the commit is attributed to the author.
  function createWorkflowBoardFromSpec(args = {}, context = {}) {
    let principal = resolvePrincipal(context);
    let id = textOrNull(args.boardId ?? args.board_id ?? args.id);
    if (!id) throw new Error('create_board requires a board id.');
    if (id === DEFAULT_WORKFLOW_BOARD_ID) {
      throw new Error(`Cannot create the default board "${id}" from a spec; it is materialized from the fixed default factory.`);
    }
    let policyGate = gate(
      isDaemonPrincipal(principal) ? 'daemon.bookkeeping' : 'policy.define',
      principal,
      { boardId: id },
    );
    if (!policyGate.ok) return policyGate;
    if (stateGraph.get(`workflowBoards/${id}`)) {
      throw new Error(`Workflow board already exists: ${id}. Use define_column/define_transition/define_gate to modify it.`);
    }
    let ts = now();
    let board = createWorkflowBoard({
      id,
      title: args.title,
      mode: args.mode,
      automation: args.automation,
      columns: args.columns,
      transitions: args.transitions,
      now: ts,
      createdAt: ts,
      updatedAt: ts,
    });
    return commitDefinedBoard(board, principal);
  }

  async function getWorkflowBoard(args = {}, context = {}) {
    let projection = args.includeRuntime
      ? await getBoardProjectionWithRuntime(args, context)
      : await getBoardProjectionWithSeed(args);
    return { ok: true, projection };
  }

  async function createWorkItem(args = {}, context = {}) {
    let principal = resolvePrincipal(context);
    let result = createOrUpdateCard(args, principal);
    if (result.ok === false) return result;
    let orchestration = await maybeAutoOrchestrateCard(result.board, result.card, args, { ...context, principal });
    return {
      ok: true,
      ...result,
      card: orchestration.ok ? (orchestration.result?.card ?? result.card) : result.card,
      orchestration,
      sideEffects: orchestration.sideEffects || [],
    };
  }

  function updateWorkItem(args = {}, context = {}) {
    let principal = resolvePrincipal(context);
    let cardId = normalizeCardId(args);
    // Accept the patch either nested under `patch` or as top-level content fields (parity with
    // create_item). Without this, a top-level `{cardId, domain}` was silently ignored.
    let patch;
    if (args.patch && typeof args.patch === 'object') {
      patch = args.patch;
    } else {
      let {
        cardId: _c, card_id: _cs, id: _id, boardId: _b, board_id: _bs,
        expectedVersion: _ev, expected_version: _evs, checks: _ch, reason: _r,
        actor: _a, patch: _p, ...rest
      } = args;
      patch = rest;
    }
    let current = getCard(cardId);
    let requestedColumnId = textOrNull(patch.columnId ?? patch.column_id);
    if (requestedColumnId && requestedColumnId !== current.columnId) {
      throw new Error(
        `Workflow card ${cardId} cannot change column via update. Use action=transition to move columns through the gate.`,
      );
    }
    let { columnId: _ignoredColumn, column_id: _ignoredColumnSnake, ...contentPatch } = patch;
    let result = createOrUpdateCard({
      ...current,
      ...contentPatch,
      id: cardId,
      columnId: current.columnId,
      expectedVersion: args.expectedVersion ?? args.expected_version,
      checks: args.checks,
    }, principal);
    if (result.ok === false) return result;
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

  function decomposeWorkItem(args = {}, context = {}) {
    let principal = resolvePrincipal(context);
    let cardId = normalizeCardId(args);
    let decomposeGate = gate(
      isDaemonPrincipal(principal) ? 'daemon.bookkeeping' : 'card.write',
      principal,
      { cardId },
    );
    if (!decomposeGate.ok) return decomposeGate;
    let parent = getCard(cardId);
    let expectedVersion = args.expectedVersion ?? args.expected_version;
    if (expectedVersion !== undefined && expectedVersion !== null) {
      let version = Number(expectedVersion);
      if (!Number.isFinite(version) || parent.version !== Math.floor(version)) {
        throw new Error(`Workflow card version conflict for ${cardId}. Reload the card and retry.`);
      }
    }
    let actor = principal.label;
    let childColumnId = textOrNull(args.childColumnId ?? args.child_column_id ?? args.columnId ?? args.column_id) ?? 'backlog';
    let board = ensureBoard(parent.boardId);
    let ts = now();
    let rootCardId = parent.metadata?.rootCardId ?? parent.id;
    // Re-armable per-wave join (S6): each decompose strictly increments the parent's monotonic
    // decomposeWaveSeq. The seq is stamped on this wave's children and (below) on the parent metadata
    // even when the parent does not close, so the counter stays continuous across a closed+re-woken
    // parent and a later wave can mint a FRESH join card keyed on its own waveSeq.
    let currentWaveSeq = (Number(parent.metadata?.decomposeWaveSeq) || 0) + 1;
    let children = childItemsFromArgs(args).map((item) => {
      let childContext = textArray(item.context);
      let childRoutingHints = textArray(item.routingHints ?? item.routing_hints);
      let id = textOrNull(item.id ?? item.cardId ?? item.card_id) ?? nextId(makeId, 'card');
      if (stateGraph.get(`workflowCards/${id}`)) {
        throw new Error(`Workflow decomposition child card already exists: ${id}`);
      }
      let columnId = textOrNull(item.columnId ?? item.column_id) ?? childColumnId;
      // Board-driven column authority (S5 carry-over): a child card from untrusted childItems may only
      // land in a column the board actually has. The iso normalizer is board-agnostic, so this is the
      // chokepoint that rejects a genuinely-unknown column.
      assertBoardColumn(board, columnId);
      return normalizeWorkflowCardInput({
        ...item,
        id,
        boardId: parent.boardId,
        columnId,
        parentCardId: parent.id,
        projectId: textOrNull(item.projectId ?? item.project_id) ?? parent.projectId,
        domain: textOrNull(item.domain) ?? parent.domain,
        cwd: textOrNull(item.cwd ?? item.workingDirectory ?? item.working_directory) ?? parent.cwd,
        kind: textOrNull(item.kind) ?? 'task',
        priority: textOrNull(item.priority) ?? parent.priority,
        owner: textOrNull(item.owner) ?? parent.owner,
        resourceGroup: textOrNull(item.resourceGroup ?? item.resource_group) ?? parent.resourceGroup,
        approvalMode: textOrNull(item.approvalMode ?? item.approval_mode) ?? parent.approvalMode,
        // The child carries only the orchestrator-authored scoped context (inherited parent context plus
        // this child's own context); the origin idea is dereferenced via metadata.rootCardId, never
        // flattened into the worker-visible context.
        context: [...textArray(parent.context), ...childContext],
        // Transitive origin-idea pointer: a top-level idea's children stamp parent.id; a grandchild
        // inherits the parent child's already-stamped rootCardId, so every descendant points at the origin.
        metadata: { ...asObject(item.metadata), rootCardId, waveSeq: currentWaveSeq },
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
    // Processed-idea close: the parent's own work is the decomposition. Once it has spawned children,
    // auto-close it to the terminal column (resolved by automation.action, never a hardcoded id) so it
    // leaves the active lanes instead of lingering. Opt-out via board automation; only when children
    // were actually created and a terminal column exists and the parent is not already there.
    let boardAutomation = normalizeWorkflowBoardAutomation(board.automation);
    let closeColumnId = (board.columns ?? []).find(column => textOrNull(column?.automation?.action) === 'close')?.id ?? null;
    let parentCloses = boardAutomation.decompositionClosesParent
      && children.length > 0
      && Boolean(closeColumnId)
      && parent.columnId !== closeColumnId;
    let parentNextColumnId = parentCloses ? closeColumnId : parent.columnId;
    let resultParent = parent;
    let parentOps = [];
    // Persist the bumped wave seq on the parent regardless of close: a non-closing decompose still
    // advances the wave so a later re-orchestrate mints a fresh join rather than reusing a retired one.
    let parentMetadata = { ...asObject(parent.metadata), decomposeWaveSeq: currentWaveSeq };
    if (parentCloses) {
      resultParent = normalizeWorkflowCardInput({
        ...parent,
        columnId: parentNextColumnId,
        lifecycle: 'idle',
        metadata: parentMetadata,
        version: parent.version + 1,
        updatedAt: ts,
        updatedBy: actor,
      }, {
        id: parent.id,
        actor,
        now: ts,
        version: parent.version + 1,
        createdAt: parent.createdAt,
        updatedAt: ts,
      });
      parentOps.push({ op: 'set', path: `workflowCards/${parent.id}`, value: resultParent });
    } else {
      resultParent = normalizeWorkflowCardInput({
        ...parent,
        metadata: parentMetadata,
        version: parent.version + 1,
        updatedAt: ts,
        updatedBy: actor,
      }, {
        id: parent.id,
        actor,
        now: ts,
        version: parent.version + 1,
        createdAt: parent.createdAt,
        updatedAt: ts,
      });
      parentOps.push({ op: 'set', path: `workflowCards/${parent.id}`, value: resultParent });
    }
    let eventId = textOrNull(args.eventId ?? args.event_id) ?? nextId(makeId, 'decomposition');
    let event = normalizeWorkflowTransitionEvent({
      id: eventId,
      eventType: 'decomposition',
      boardId: board.id,
      cardId: parent.id,
      fromColumnId: parent.columnId,
      toColumnId: parentNextColumnId,
      actor,
      mode: 'manual',
      reason: textOrNull(args.reason)
        ?? `Decomposed workflow card ${parent.id} into ${children.length} child card(s)${parentCloses ? `; idea processed, closing to ${parentNextColumnId}.` : '.'}`,
      status: 'accepted',
      cardVersion: resultParent.version,
      gateResult: { ok: true, checks: [], failures: [] },
      sideEffects: [
        ...children.map(child => ({
          type: 'child_card_created',
          cardId: child.id,
          parentCardId: parent.id,
          columnId: child.columnId,
          assignedAgent: child.assignedAgent,
        })),
        ...(parentCloses ? [{ type: 'parent_closed', cardId: parent.id, toColumnId: parentNextColumnId }] : []),
      ],
    }, { id: eventId, now: ts });
    stateGraph.commit([
      ...children.map(child => ({ op: 'set', path: `workflowCards/${child.id}`, value: child })),
      ...parentOps,
      { op: 'set', path: `workflowTransitions/${event.id}`, value: event },
    ], sourceForPrincipal(principal));
    return {
      ok: true,
      board,
      parent: resultParent,
      children,
      event,
      childCardIds: children.map(child => child.id),
      parentClosed: parentCloses,
    };
  }

  function updateWorkflowColumn(args = {}, context = {}) {
    let principal = resolvePrincipal(context);
    let board = ensureBoard(args.boardId ?? args.board_id ?? DEFAULT_WORKFLOW_BOARD_ID);
    // Column definition is policy authorship (inv 8): a non-DEFINE principal is held for approval.
    let policyGate = gate(
      isDaemonPrincipal(principal) ? 'daemon.bookkeeping' : 'policy.define',
      principal,
      { boardId: board.id },
    );
    if (!policyGate.ok) return policyGate;
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
    stateGraph.commit([{ op: 'set', path: `workflowBoards/${board.id}`, value: nextBoard }], sourceForPrincipal(principal));
    return {
      ok: true,
      board: clone(nextBoard),
      column: clone(columns.find(column => column.id === columnId)),
    };
  }

  function boardVersion(board) {
    return Number.isFinite(Number(board.version)) ? Math.floor(Number(board.version)) : 0;
  }

  function boardEvent(board, principal, args = {}, options = {}) {
    let ts = now();
    let eventId = textOrNull(args.eventId ?? args.event_id ?? options.id) ?? nextId(makeId, 'board-event');
    return normalizeWorkflowTransitionEvent({
      id: eventId,
      eventType: options.eventType ?? 'board_control',
      boardId: board.id,
      cardId: null,
      actor: principal.label,
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
    let principal = resolvePrincipal(options);
    let board = ensureBoard(args.boardId ?? args.board_id ?? DEFAULT_WORKFLOW_BOARD_ID);
    // Board automation is policy authorship. `controlWorkflowBoard` already gated the caller on
    // board.control before routing the mode change here (options.gatedBy='board.control'), so it is
    // not re-gated; a direct automation edit is gated on policy.define (held for non-DEFINE callers).
    if (options.gatedBy !== 'board.control' && !isDaemonPrincipal(principal)) {
      let policyGate = gate('policy.define', principal, { boardId: board.id });
      if (!policyGate.ok) return policyGate;
    }
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
    let event = boardEvent(nextBoard, principal, args, {
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
    ], sourceForPrincipal(principal));
    return { ok: true, board: clone(nextBoard), event: clone(event) };
  }

  // Apply the global autonomy "volume slider" to a board: write the numeric level's preset publishMode
  // and per-column autoAdvance/mode (keyed by column action), or — for 'manual' — only stamp
  // autonomyLevel='manual' and leave the columns custom. The pure transform lives in the iso layer
  // (applyAutonomyLevelToBoard); this method persists the result and records a board-update event. Gated
  // like updateWorkflowBoard: board.control routes here pre-gated, otherwise policy.define is required.
  function applyAutonomyLevel(args = {}, options = {}) {
    let principal = resolvePrincipal(options);
    let board = ensureBoard(args.boardId ?? args.board_id ?? DEFAULT_WORKFLOW_BOARD_ID);
    if (options.gatedBy !== 'board.control' && !isDaemonPrincipal(principal)) {
      let policyGate = gate('policy.define', principal, { boardId: board.id });
      if (!policyGate.ok) return policyGate;
    }
    let level = args.level ?? args.autonomyLevel ?? args.autonomy_level;
    let ts = now();
    let applied = applyAutonomyLevelToBoard(board, level);
    let nextBoard = {
      ...applied,
      automation: normalizeWorkflowBoardAutomation(applied.automation),
      version: boardVersion(board) + 1,
      updatedAt: ts,
      metadata: {
        ...asObject(board.metadata),
        defaultPolicyVersion: DEFAULT_WORKFLOW_POLICY_VERSION,
        automationUpdatedAt: ts,
      },
    };
    let changed = JSON.stringify({ automation: board.automation, columns: board.columns })
      !== JSON.stringify({ automation: nextBoard.automation, columns: nextBoard.columns });
    if (!changed) return { ok: true, board: clone(board), event: null, noop: true };
    let event = boardEvent(nextBoard, principal, args, {
      eventType: options.eventType ?? 'board_update',
      reason: textOrNull(args.reason) ?? `Applied autonomy level ${nextBoard.automation.autonomyLevel}.`,
      sideEffects: [{
        type: 'board_automation_update',
        mode: nextBoard.mode,
        automation: nextBoard.automation,
      }],
    });
    stateGraph.commit([
      { op: 'set', path: `workflowBoards/${nextBoard.id}`, value: nextBoard },
      { op: 'set', path: `workflowTransitions/${event.id}`, value: event },
    ], sourceForPrincipal(principal));
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
    let principal = resolvePrincipal(context);
    let childContext = { ...context, principal };
    let board = ensureBoard(args.boardId ?? args.board_id ?? DEFAULT_WORKFLOW_BOARD_ID);
    let controlGate = gate(
      isDaemonPrincipal(principal) ? 'daemon.bookkeeping' : 'board.control',
      principal,
      { boardId: board.id },
    );
    if (!controlGate.ok) return controlGate;
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
          reason: textOrNull(args.reason) ?? `${formatControlAction(action)} from workflow board automation.`,
        }, childContext);
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
          reason: textOrNull(args.reason) ?? 'Resume from workflow board automation.',
        }, childContext);
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
      reason: textOrNull(args.reason) ?? `${formatControlAction(action)} board automation.`,
    }, {
      principal,
      gatedBy: 'board.control',
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
    let principal = resolvePrincipal(context);
    let transition = requestTransition(args, principal);
    if (transition.status !== 'accepted') {
      return { ok: true, ...transition, orchestration: null, sideEffects: [] };
    }
    let board = ensureBoard(transition.boardId);
    let orchestration = await maybeAutoOrchestrateCard(board, transition.card, args, { ...context, principal });
    return {
      ok: true,
      ...transition,
      card: orchestration.ok ? orchestration.result.card : transition.card,
      orchestration,
      sideEffects: orchestration.sideEffects || [],
    };
  }

  function deleteWorkItem(args = {}, context = {}) {
    let principal = resolvePrincipal(context);
    let cardId = normalizeCardId(args);
    let deleteGate = gate(
      isDaemonPrincipal(principal) ? 'daemon.bookkeeping' : 'card.write',
      principal,
      { cardId },
    );
    if (!deleteGate.ok) return deleteGate;
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
    ], sourceForPrincipal(principal));
    // Delete is an upstream-resolution trigger (inv 22): a deleted upstream resolves every downstream
    // edge that pointed at it per the dependent's onUpstreamFailure — never a silent permanent block.
    let board = ensureBoard(card.boardId);
    let propagated = propagateUpstreamResolution(card, board, 'deleted');
    return { ok: true, card, deleted: true, ...(propagated.length ? { propagated } : {}) };
  }

  function claimWorkItem(args = {}, context = {}) {
    let principal = resolvePrincipal(context);
    let cardId = normalizeCardId(args);
    // Lease control over a card run. Daemon lease bookkeeping maps to daemon.bookkeeping; a
    // human/agent claim is card.control (both hold CONTROL).
    let claimGate = gate(
      isDaemonPrincipal(principal) ? 'daemon.bookkeeping' : 'card.control',
      principal,
      { cardId },
    );
    if (!claimGate.ok) return claimGate;
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
      leaseOwner: args.leaseOwner ?? args.lease_owner ?? principal.label,
      leaseExpiresAt: Number.isFinite(ttlMs) && ttlMs > 0 ? ts + ttlMs : null,
    }, { cardId, updatedAt: ts });
    stateGraph.commit([{ op: 'set', path: `workflowLeases/${cardId}`, value: lease }], sourceForPrincipal(principal));
    return { ok: true, card, lease };
  }

  function releaseWorkItem(args = {}, context = {}) {
    let principal = resolvePrincipal(context);
    let cardId = normalizeCardId(args);
    let releaseGate = gate(
      isDaemonPrincipal(principal) ? 'daemon.bookkeeping' : 'card.control',
      principal,
      { cardId },
    );
    if (!releaseGate.ok) return releaseGate;
    let card = getCard(cardId);
    stateGraph.commit([{ op: 'delete', path: `workflowLeases/${cardId}` }], sourceForPrincipal(principal));
    return { ok: true, card, released: true };
  }

  function columnAutomation(board, columnId) {
    let column = board.columns.find(item => item.id === columnId);
    return asObject(column?.automation);
  }

  // Board-driven column existence check (S5 carry-over). The iso card normalizer is board-agnostic;
  // a card's columnId is authoritative against the BOARD's own columns (default or define_column-added),
  // not the global default-id constant. Throws a clear, board-scoped error for an unknown column.
  function assertBoardColumn(board, columnId) {
    let supported = (Array.isArray(board?.columns) ? board.columns : []).map(column => column.id);
    if (!supported.includes(columnId)) {
      throw new Error(`Unknown workflow column "${columnId}". Supported: ${supported.join(', ')}`);
    }
  }

  function cardAutomation(board, card) {
    let column = columnAutomation(board, card.columnId);
    let merged = {
      ...column,
      ...asObject(card.automation),
    };
    // autoAdvance is a COLUMN-stage property (the autonomy slider), never a per-card override: the card
    // normalizer always stamps a default, so let the column's value win to keep the per-column gate honest.
    if ('autoAdvance' in column) merged.autoAdvance = column.autoAdvance;
    return merged;
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
    // When the card runs in its own isolated worktree, tell the agent so: it works against a private
    // checkout on a dedicated branch, and the board commits + merges it back to base on completion — the
    // agent must NOT commit, push, or switch branches itself.
    let isolated = cardWorktree(card);
    let cwdHint = isolated
      ? `\n\nWorking directory: ${isolated.path}`
        + `\nThis is an ISOLATED git worktree on branch \`${isolated.branch}\` (cut from \`${isolated.baseRef}\`).`
        + ' Make your changes here; the board commits and merges this branch back to base automatically.'
        + ' Do not commit, push, switch, or delete branches yourself.'
      : (card.cwd ? `\n\nWorking directory: ${card.cwd}` : '');
    let fileScope = cardFileScope(card, args);
    let fileScopeHint = fileScope.length
      ? `\n\nFile ownership scope:\n${fileScope.map(file => `- ${file}`).join('\n')}`
      : '';
    let preferredAgent = textOrNull(args.agent ?? args.agent_slug ?? card.assignedAgent);
    let isAudit = card.columnId === 'quality-audit' || textOrNull(args.action) === 'audit';
    let auditBlock = isAudit
      ? [
        '',
        '',
        'Quality audit task:',
        '- This card is in the Quality Audit stage. Act as a reviewer, not an implementer.',
        '- Verify the work against every acceptance criterion and run the hygiene/test checks relevant to the changed files.',
        '- If you can, also record the verdict via the public `workflow_board` action `update_item` with a `checks` object (set `audit` to `passed` or `failed`); this needs audit authority and may be unavailable to you.',
        '- ALWAYS end your report with the explicit verdict marker on its own line, because that marker — not the bare run exit, and not a check you may lack rights to write — is what the autonomous gate reads to advance or rework the card: `COMPLETION_PROOF: PASS` when the work meets every acceptance criterion, or `COMPLETION_PROOF: FAIL` (with a one-line reason) when it does not.',
        '- Do not advance the card yourself; the gate moves it once an independent reviewer reports PASS.',
      ].join('\n')
      : '';
    let escalationState = card.metadata?.escalation
      ? normalizeWorkflowEscalationState(card.metadata.escalation)
      : null;
    let escalationBlock = escalationState && hasActiveEscalation(card)
      ? [
        '',
        '',
        `Escalation re-engagement (attempt ${escalationState.attemptCount}). A prior run could not self-resolve and routed this card back for re-routing.`,
        `- Escalation kind: ${escalationState.kind}`,
        escalationState.detail ? `- Detail: ${escalationState.detail}` : '',
        textOrNull(escalationState.lastEscalation?.suggestedResolution)
          ? `- Suggested resolution: ${escalationState.lastEscalation.suggestedResolution}`
          : '',
        textOrNull(escalationState.lastEscalation?.proposedLane)
          ? `- Proposed lane (advisory only): ${escalationState.lastEscalation.proposedLane}`
          : '',
        '- Route by kind:',
        '  - insufficient_permission: PROPOSE a capable lane (resource group / agent) and let the board gate or a human approve it. Never self-grant rights or approval.',
        '  - insufficient_context: gather and attach the missing context, or decompose an investigation child card, then re-delegate.',
        '  - needs_decision: set a precise blocker question via `workflow_board` `update_item` and stop; this needs a human or higher authority, not another execution attempt.',
        '  - rework (the common case): re-delegate the fix with the audit findings as acceptance criteria. But if the Detail above says automatic rework is exhausted, do NOT re-route again — decide a terminal: reject the card or, only in the extreme case, ask a human.',
        '- You own the routing decision when a card returns: rework with corrections (most often), reject (`WORKFLOW_RESULT: rejected`), or — the rare extreme — ask a human (`WORKFLOW_RESULT: needs_human`). The board never decides this for you.',
        '- When this card is the origin of a decomposed idea and intermediate child returns plus the idea-realization rollup show more work is warranted, you may instead `decompose` another wave of child cards — a legitimate routing choice alongside rework/reject/needs_human. Treat the rollup + rendered returns as the evidence: re-decompose only while the idea is genuinely unrealized; otherwise let it rest closed.',
        '- Permission and approval policy stay board/human-owned; this channel only proposes.',
      ].filter(Boolean).join('\n')
      : '';
    // Structured intermediate child results delivered to this card's inbox (routed from a live child, an
    // intermediate self-return, or a join completion). Distinct from the ~5-line laundered reason string
    // (summarizeQueuedReturns) the wake driver folds into args.reason: this renders the typed return —
    // kind, detail, the routed/terminal/hardInterrupt flags, and a one-line payload digest — so the
    // re-engaged orchestrator can act on the actual intermediate evidence, not a summary. Filtered to the
    // wake-driving set (actionable + unconsumed + intermediate-or-routed), matching hasQueuedActionableReturn.
    let queuedReturns = Array.isArray(card.metadata?.returns)
      ? card.metadata.returns.filter(item => isWakeDrivingReturn(item))
      : [];
    let summarizeReturnPayload = (payload) => {
      if (!payload || typeof payload !== 'object') return '';
      let parts = Object.entries(payload)
        .map(([key, value]) => {
          let text = typeof value === 'string' ? value : JSON.stringify(value);
          return `${key}=${text}`;
        })
        .join(', ');
      return parts.length > 160 ? `${parts.slice(0, 157)}...` : parts;
    };
    let returnsBlock = queuedReturns.length
      ? [
        '',
        '',
        `Intermediate child returns (${queuedReturns.length}) delivered to this card — structured evidence for the routing decision below:`,
        ...queuedReturns.map((item) => {
          let flags = [
            item.routed === true ? 'routed' : '',
            item.terminal === true ? 'terminal' : '',
            item.hardInterrupt === true ? 'hard-interrupt' : '',
          ].filter(Boolean);
          let payloadSummary = summarizeReturnPayload(item.payload);
          return [
            `- ${item.kind}`,
            flags.length ? ` [${flags.join(', ')}]` : '',
            item.detail ? `: ${item.detail}` : '',
            payloadSummary ? ` — ${payloadSummary}` : '',
          ].join('');
        }),
      ].join('\n')
      : '';
    // Cheap idea-realization rollup keyed on this card's root: counts the root plus every descendant
    // sharing metadata.rootCardId, bucketed by terminal status (done/rejected/blocked/active). Terminal
    // classification comes from the board's own columns (action/closeKind), so the iso helper stays
    // board-agnostic. This is the evidence for the realized-vs-redecompose call, not a judged verdict.
    let realizationBlock = '';
    {
      let board = ensureBoard(card.boardId);
      let terminalActions = new Map(
        (Array.isArray(board?.columns) ? board.columns : []).map(column => [
          column.id,
          { action: textOrNull(column?.automation?.action), closeKind: textOrNull(column?.automation?.closeKind) },
        ]),
      );
      let boardCards = Object.values(getCollection(stateGraph, 'workflowCards'))
        .filter(other => other.boardId === card.boardId);
      let rollup = summarizeRealizationByRoot(boardCards, card.metadata?.rootCardId ?? card.id, { terminalActions });
      if (rollup.total > 1) {
        realizationBlock = [
          '',
          '',
          `Idea-realization rollup for root ${rollup.root} (${rollup.total} cards in this idea's subtree):`,
          `- done: ${rollup.done}  rejected: ${rollup.rejected}  blocked: ${rollup.blocked}  active: ${rollup.active}`,
          '- Use this rollup with the intermediate returns above as the evidence for whether the idea is realized (close) or needs another wave (decompose).',
        ].join('\n');
      }
    }
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
      'Board-first orchestration requirements:',
      '- Treat the workflow card and workflow run as the task source of truth; the chat is only the execution channel.',
      '- For broad work with independent scopes, use `workflow_board` action `decompose` to create child cards with owners and acceptance criteria before doing or delegating the child work.',
      '- Do not ask the user to approve workflow tool calls from inside a workflow item; approval policy is owned by the host runner and blocked tools must be handled as runtime evidence.',
      `- If a Codex MCP call to \`workflow_board\` returns \`user cancelled MCP tool call\` or \`empty_result\`, immediately retry the same public workflow_board call through the CLI fallback: \`${workflowBoardCliFallback(projectRoot)}\`. Replace \`<json-args>\` with the exact JSON arguments for the workflow_board action.`,
      '- If `workflow_board` is unavailable, permission-blocked, approval-blocked, or the agent cannot call it directly, use the same CLI fallback before reporting that the workflow is blocked.',
      '- Move ready child cards through the workflow board so their runs, chats, task ids, checks, and transitions remain visible in board state and development maps.',
      '- Aggregate child-card results only after verifying their evidence against current files and runtime state.',
      '',
      'Final response contract:',
      '- Start with the workflow outcome: completed, blocked, or needs_follow_up.',
      '- Address every acceptance criterion explicitly.',
      '- Name the concrete evidence inspected and commands or checks run.',
      '- Separate product findings from Agent Portal workflow/runtime issues.',
      '- Do not end with an introduction to a report; include the report itself.',
      proofMarkerContract,
      '- End with `WORKFLOW_RESULT: completed`, `WORKFLOW_RESULT: blocked`, or `WORKFLOW_RESULT: needs_follow_up`.',
      '- Orchestrator terminal DECISIONS — use only when routing a card you own, on a clean finish:',
      '  - `decompose` (action via `workflow_board`) — when you own a decomposed idea and the rendered intermediate returns + idea-realization rollup show it is not yet realized, mint another wave of child cards instead of closing. This is a legitimate re-engagement choice alongside rework/reject/needs_human; re-decompose only while the idea is genuinely unrealized.',
      '  - `WORKFLOW_RESULT: rejected` — the card is not worth completing; it retires to the reject terminal. Put the reason on an `ESCALATION_DETAIL:` line.',
      '  - `WORKFLOW_RESULT: needs_human` — the extreme case: you genuinely cannot decide and must ask a human. Put the question on `ESCALATION_DETAIL:`, optional button choices on `ESCALATION_OPTIONS: choice a | choice b | choice c`. Write the question and every option label in the user\'s language (match the locale the user communicates in) — a person reads them. The card parks in the decision lane until a human answers, then the answer returns to you.',
      '- If you end with `WORKFLOW_RESULT: blocked`, emit a typed escalation on the lines just above it so the orchestrator can route it:',
      '  - `ESCALATION_KIND:` one of insufficient_permission, insufficient_context, needs_decision, needs_human, rework',
      '  - `ESCALATION_DETAIL:` one line — exactly what is missing and why you cannot self-resolve it',
      '  - `ESCALATION_SUGGESTION:` optional — the capability, context, or decision that would unblock it',
      '  - Never self-grant rights or approval; permission and approval stay board/human-owned.',
    ].filter(Boolean).join('\n');
    // Resume preamble: if a prior attempt that actually ran (had a task) was cut off — error/lost/stale
    // /cancelled, or the card is flagged for resume/recovery — this delegation is a CONTINUATION, not a
    // fresh start. Re-engagement may land in a new chat (no prior transcript), so the agent is told to
    // reconcile partial state from the working tree itself and continue, rather than redo everything.
    let priorWorkRuns = getRunsForCard(card.id).filter(run => (run.taskIds?.length));
    let recoveryFlags = new Set(normalizeRecoveryFlags(card.recoveryFlags));
    let isResume = priorWorkRuns.some(run => ['error', 'failed', 'lost', 'stale', 'cancelled'].includes(run.status))
      || recoveryFlags.has('needs_resume') || recoveryFlags.has('recovering');
    let resumeBlock = isResume
      ? [
        '',
        '',
        '⟳ RESUMING after interruption — a previous attempt on this card ran but was cut off before finishing (e.g. a backend restart or a lost run). You are CONTINUING that work, not starting over.',
        '- First inspect the current state: run read-only `git status` / `git diff` in the working directory and review any partial changes already made for this card; check each acceptance criterion against what is already in place.',
        '- Continue from where the prior attempt stopped. Do NOT redo or duplicate work that is already present, and do not revert valid partial progress.',
        '- If the partial state is broken or half-applied, reconcile it (finish or cleanly redo only the affected part), then proceed.',
      ].join('\n')
      : '';
    return [
      `Run the Agent Portal workflow work item "${card.title}".`,
      card.body ? `\n\n${card.body}` : '',
      resumeBlock,
      `\n\nWorkflow card id: ${card.id}`,
      card.projectId ? `\nProject: ${card.projectId}` : '',
      card.domain ? `\nDomain: ${card.domain}` : '',
      preferredAgent ? `\nPreferred agent: ${preferredAgent}` : '',
      criteria,
      context,
      fileHint,
      cwdHint,
      fileScopeHint,
      auditBlock,
      escalationBlock,
      returnsBlock,
      realizationBlock,
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

    // Provision (or reuse) the card's isolated worktree before dispatch when isolation is in force, so
    // the run — and every later release-gate probe — executes against the card's own tree instead of the
    // shared project working tree. Returns null (shared-tree fallback) outside autonomous mode, on a
    // non-git repo, or for a non-mutating stage.
    let board = ensureBoard(card.boardId);
    let worktree = await ensureCardWorktree(card, board);

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
      cwd: textOrNull(args.cwd) || worktree?.path || cardWorkingDir(card),
      chat_id: chatId,
      agent_slug: desiredAgent,
      context_mode: args.context_mode === 'off' ? 'off' : 'auto',
    };
    // Admission slot key (D1.1/D1.2). The board-minted admissionId is passed through to agent-pool,
    // which acquires the ledger slot keyed by it (idempotent) and persists its dedup record before
    // ack. prepareDelegateTaskCall forwards unknown fields unchanged.
    let admissionId = textOrNull(args.admission_id ?? args.admissionId);
    if (admissionId) delegateArgs.admission_id = admissionId;
    // D2.1 (parent side): the board declares the server-assigned slug for the spawned task so the
    // portal's connection→{taskId, serverAssignedSlug} principal map can be established when the
    // agent's MCP connection initializes. The per-task SECRET that makes this unforgeable is minted
    // and injected by agent-pool at spawn, then presented at MCP `initialize`. That mint/present
    // pipeline is agent-pool-side and OUT OF SCOPE here. SEAM: agent-pool must (a) mint a per-task
    // secret keyed by this `verified_slug`/admissionId at spawn and inject it as a non-overridable
    // credential, and (b) the MCP initialize handler must resolve that secret to this slug. Until
    // that lands, MCP principals still fall back to the WS-AUTH-P least-privilege default.
    if (desiredAgent) delegateArgs.verified_slug = desiredAgent;
    let approvalMode = textOrNull(args.approval_mode ?? card.approvalMode);
    if (approvalMode) delegateArgs.approval_mode = approvalMode;
    let resourceGroup = textOrNull(args.resource_group ?? card.resourceGroup);
    if (resourceGroup) delegateArgs.resource_group = resourceGroup;
    let files = cardFileScope(card, args);
    if (files.length) delegateArgs.files = files;

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
    let principal = resolvePrincipal(context);
    let cardId = normalizeCardId(args);
    let orchestrateGate = gate(
      isDaemonPrincipal(principal) ? 'daemon.bookkeeping' : 'card.orchestrate',
      principal,
      { cardId },
    );
    if (!orchestrateGate.ok) return orchestrateGate;
    let actor = principal.label;
    let card = getCard(cardId);
    let board = ensureBoard(args.boardId ?? args.board_id ?? card.boardId);
    let expectedVersion = args.expectedVersion ?? args.expected_version;
    if (expectedVersion !== undefined && expectedVersion !== null) {
      let version = Number(expectedVersion);
      if (!Number.isFinite(version) || card.version !== Math.floor(version)) {
        throw new Error(`Workflow card version conflict for ${cardId}. Reload the card and retry.`);
      }
    }
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
    let gateResult = readyOrchestrationGate(board, card, actor);
    if (!gateResult.ok) {
      throw new Error(gateResult.failures[0]?.reason ?? `Workflow card ${card.id} failed ready orchestration gates.`);
    }
    let capacity = stageCapacityAvailable(board, card, automation);
    if (!capacity.ok && !args.force) {
      throw new Error(capacity.reason);
    }
    let boardCapacity = boardCapacityAvailable(board, card);
    if (!boardCapacity.ok && !args.force) {
      throw new Error(boardCapacity.reason);
    }
    let occupancy = columnOccupancyAvailable(board, card, automation);
    if (!occupancy.ok && !args.force) {
      throw new Error(occupancy.reason);
    }
    let boardBudget = boardBudgetAvailable(board);
    if (!boardBudget.ok && !args.force) {
      throw new Error(boardBudget.reason);
    }
    let fileConflicts = activeFileScopeConflicts(board, card, effectiveArgs);
    if (fileConflicts.length && !args.force) {
      throw new Error(fileScopeConflictReason(fileConflicts));
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
    ], sourceForPrincipal(principal));

    let delegated = args.delegate === false
      ? { ok: false, sideEffects: [], taskIds: [], chatId: card.entityRefs.chatId, goalId: card.entityRefs.goalId }
      : null;
    if (args.delegate !== false) {
      try {
        delegated = await delegateWorkItem(card, run, effectiveArgs, context);
      } catch (error) {
        delegated = {
          ok: false,
          sideEffects: [{
            type: 'delegate_task',
            status: 'failed',
            chatId: card.entityRefs.chatId,
            goalId: card.entityRefs.goalId,
            taskId: null,
            runId: run.id,
            error: error.message,
          }],
          taskIds: [],
          chatId: card.entityRefs.chatId,
          goalId: card.entityRefs.goalId,
        };
      }
    }
    let delegationFailed = args.delegate !== false && !delegated.ok;
    // Slot-rejection vs hard failure (D1.1/D1.2): a capacity rejection from agent-pool means NO slot
    // was granted — the admission scheduler re-queues this card (transient). Any OTHER delegation
    // failure is a hard error (e.g. unknown resource group) that surfaces as a failed run + needs_audit
    // so it does not loop in the queue. `slotRejected` lets the drain branch on exactly this.
    let delegateError = textOrNull(delegated.sideEffects?.[0]?.error);
    let slotRejected = Boolean(delegationFailed && delegateError && isCapacityRejectionError(delegateError));
    let taskIds = uniqueArray([...run.taskIds, ...delegated.taskIds]);
    let nextRun = normalizeWorkflowRunInput({
      ...run,
      status: delegated.ok ? 'running' : delegationFailed ? 'failed' : run.status,
      taskIds,
    }, { id: run.id, now: ts, updatedAt: now() });
    let nextColumnId = delegated.ok && card.columnId === 'ready' ? 'in-progress' : card.columnId;
    // Execution attribution (inv 47): the principal that drove this run is recorded durably on
    // card.metadata.executedBy (dedup). A floor-check write later checks this list — an executor
    // cannot sign the audit/hygiene of a card it executed (separated duty).
    let nextExecutedBy = uniqueArray([...textArray(card.metadata?.executedBy), principal.id]);
    // A delegated card may carry an orchestrator-return subscription (S5). Persist the NORMALIZED
    // record on metadata.subscription beside the entityRefs merge; this only records the subscription
    // (a memberless join normalizes to null and is dropped) — join materialization is an explicit
    // materializeJoinCard call, not an auto-spawn here.
    let normalizedSubscription = effectiveArgs.subscription
      ? normalizeWorkflowSubscription(effectiveArgs.subscription)
      : (card.metadata?.subscription ?? null);
    let nextCard = normalizeWorkflowCardInput({
      ...card,
      columnId: nextColumnId,
      recoveryFlags: delegationFailed
        ? uniqueArray([...normalizeRecoveryFlags(card.recoveryFlags), 'needs_audit'])
        : card.recoveryFlags,
      metadata: {
        ...asObject(card.metadata),
        executedBy: nextExecutedBy,
        ...(normalizedSubscription ? { subscription: normalizedSubscription } : {}),
      },
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
    if (delegationFailed) {
      ops.push({ op: 'delete', path: `workflowLeases/${card.id}` });
    }
    if (nextColumnId !== card.columnId || delegated.sideEffects.length > 0) {
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
        reason: delegated.ok
          ? `Workflow orchestration started run ${run.id}.`
          : `Workflow orchestration did not start a task for run ${run.id}.`,
        status: delegated.ok ? 'accepted' : 'blocked',
        sideEffects: delegated.sideEffects,
      }, { id: eventId, now: ts });
      ops.push({ op: 'set', path: `workflowTransitions/${event.id}`, value: event });
    }
    stateGraph.commit(ops, sourceForPrincipal(principal));
    // S5 wiring: a persisted JOIN subscription materializes a synthetic join card that depends on the
    // members; when the join policy is satisfied its release wakes THIS owner through the return-loop
    // (see releaseDependencies). Idempotent per WAVE — a same-wave re-orchestrate reuses that wave's
    // join card, but a later wave (S6) skips the retired prior-wave join (different/absent waveSeq) and
    // mints a FRESH join with its own ownerNotifiedAt=unset so the owner is woken once per wave.
    let joinCard = null;
    if (normalizedSubscription?.mode === 'join') {
      // Wave key: the automatic decomposeWaveSeq (bumped by each decompose) is authoritative; an explicit
      // subscription.wave is the manual override the contract documents — it keys the join for a specific
      // wave when the caller drives waves without re-decomposing (decomposeWaveSeq unset). Both feed the
      // same reuse guard, so a later wave skips a retired prior-wave join and mints a fresh one.
      let currentWaveSeq = Number(card.metadata?.decomposeWaveSeq) || Number(normalizedSubscription.wave) || 0;
      let existingJoin = boardCardsFor(board.id).find(
        other => other.kind === 'join'
          && other.parentCardId === card.id
          && (Number(other.metadata?.waveSeq) || 0) === currentWaveSeq,
      );
      joinCard = existingJoin ?? null;
      if (!existingJoin) {
        let made = materializeJoinCard(board, normalizedSubscription, card.id, principal, { waveSeq: currentWaveSeq });
        if (made?.id) joinCard = made;
      }
    }
    return { ok: true, card: nextCard, run: nextRun, lease, capacity, boardCapacity, slotRejected, joinCardId: joinCard?.id ?? null, sideEffects: delegated.sideEffects };
  }

  function resumeWorkItem(args = {}, context = {}) {
    let principal = resolvePrincipal(context);
    let cardId = normalizeCardId(args);
    let resumeGate = gate(
      isDaemonPrincipal(principal) ? 'daemon.bookkeeping' : 'card.control',
      principal,
      { cardId },
    );
    if (!resumeGate.ok) return resumeGate;
    let actor = principal.label;
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
    let pauseBlockers = new Set([
      'Paused by workflow control.',
      textOrNull(args.reason) ?? '',
    ].filter(Boolean));
    let nextCard = normalizeWorkflowCardInput({
      ...card,
      blockers: card.blockers.filter(blocker => !pauseBlockers.has(blocker)),
      recoveryFlags: [...new Set([
        ...normalizeRecoveryFlags(card.recoveryFlags).filter(flag => flag !== 'blocked' && flag !== 'needs_resume'),
        'recovering',
      ])],
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
    ], sourceForPrincipal(principal));
    return { ok: true, card: nextCard, run };
  }

  async function controlWorkItem(args = {}, context = {}) {
    let principal = resolvePrincipal(context);
    let cardId = normalizeCardId(args);
    let controlGate = gate(
      isDaemonPrincipal(principal) ? 'daemon.bookkeeping' : 'card.control',
      principal,
      { cardId },
    );
    if (!controlGate.ok) return controlGate;
    let actor = principal.label;
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
    ], sourceForPrincipal(principal));
    return { ok: true, action, card: nextCard, sideEffects };
  }

  function readStateGraphRuntimeTasks() {
    return new Map(Object.entries(stateGraph.get('tasks') || {}).map(([id, task]) => [
      id,
      { id, ...task, runtimeSource: task?.runtimeSource ?? 'state_graph' },
    ]));
  }

  function parseToolJsonResult(result = {}) {
    let text = result?.content?.[0]?.text || '';
    if (!text) return null;
    try {
      return JSON.parse(text);
    } catch {
      return null;
    }
  }

  function extractRuntimeSystemLoad(value = null) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    let candidates = [
      value.systemLoad,
      value.system,
      value.developmentMap?.system,
      value.developmentMap?.systemLoad,
    ];
    return candidates.find(candidate => (
      candidate && typeof candidate === 'object' && !Array.isArray(candidate)
    )) ?? null;
  }

  async function resolveRuntimeSystemLoad(context = {}, pm = null, parsed = null) {
    return extractRuntimeSystemLoad(parsed)
      ?? extractRuntimeSystemLoad(context)
      ?? await readPortalSystemLoad(pm);
  }

  async function readPortalSystemLoad(pm) {
    if (!pm?.requestFromChild) return null;
    for (let name of ['get_portal_status', 'get_development_map']) {
      try {
        let result = await pm.requestFromChild('agent-pool', 'tools/call', {
          name,
          arguments: {},
        }, 60_000);
        let systemLoad = extractRuntimeSystemLoad(parseToolJsonResult(result));
        if (systemLoad) return systemLoad;
      } catch {
        continue;
      }
    }
    return null;
  }

  async function readRuntimeState(context = {}) {
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
        let systemLoad = await resolveRuntimeSystemLoad(context, pm, parsed);
        return {
          tasks: tasksById,
          systemLoad,
          staleProcesses: parsed && typeof parsed === 'object' && !Array.isArray(parsed)
            ? parsed.staleProcesses ?? []
            : [],
        };
      } catch {
        return {
          tasks: tasksById,
          systemLoad: await resolveRuntimeSystemLoad(context, pm),
          staleProcesses: [],
        };
      }
    }
    return {
      tasks: tasksById,
      systemLoad: await resolveRuntimeSystemLoad(context, pm),
      staleProcesses: [],
    };
  }

  async function readRuntimeTasks(context = {}) {
    let runtimeState = await readRuntimeState(context);
    return runtimeState.tasks;
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
    // A real audit pass (or explicit waiver) clears needs_audit — the column action is done.
    let checks = getChecks(card.id);
    if (checkPassed(checks.audit) || checkPassed(checks.auditWaiver)) flags.delete('needs_audit');
    return [...flags].filter(flag => normalizeRecoveryFlags([flag]).length > 0);
  }

  async function reconcileWorkflowRecovery(args = {}, context = {}) {
    // Recovery reconcile is board self-healing — the board recomputing its own recovery flags.
    // Identity is the daemon (consistent with runtime/escalation reconcile), so the periodic
    // tick (no per-call principal) and a public trigger both commit as bookkeeping.
    let principal = daemonPrincipal();
    let actor = principal.label;
    await seedWorkflowWorkItemsForProjection(args);
    let projection = getBoardProjection(args);
    let runtimeTasks = await readRuntimeTasks(context);
    let currentNow = now();
    let reconciled = [];
    let ops = [];
    let activeColumnIds = new Set(activeRecoveryColumnIds(projection.board));

    for (let card of projection.cards.filter(item => activeColumnIds.has(item.columnId))) {
      let current = getCard(card.id);
      let flags = derivePersistentRecoveryFlags(current, runtimeTasks, currentNow);
      let runs = getRunsForCard(current.id);
      let latestRun = runs[runs.length - 1] ?? null;
      if (latestRun && TERMINAL_RUN_STATUSES.has(latestRun.status) && current.blockers.length === 0) {
        flags = flags.filter(flag => flag !== 'blocked' && flag !== 'needs_resume' && flag !== 'recovering');
      }
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
        taskIds: uniqueArray([...current.entityRefs.taskIds, ...runs.flatMap(item => item.taskIds)]),
      }, { id: runId, now: currentNow, updatedAt: currentNow });
      ops.push(
        { op: 'set', path: `workflowCards/${current.id}`, value: nextCard },
        { op: 'set', path: `workflowRuns/${run.id}`, value: run },
      );
      reconciled.push({ card: nextCard, run, flags });
    }

    if (ops.length) {
      let result = gate('daemon.bookkeeping', principal, { boardId: projection.board.id });
      if (result.ok) stateGraph.commit(ops, sourceForPrincipal(principal));
    }
    return {
      ok: true,
      reconciled,
      recovery: getRecoveryState(args),
    };
  }

  // A queued, undelivered actionable return waiting to wake the orchestrator. The inbox holds at most
  // 12 entries (coalesceReturnEvents); a soft `progress`/`partial` is not actionable, so it never wakes
  // the loop. `consumedAt` is stamped when the driver re-engages (delivered ⟺ consumed), so this goes
  // false until a NEW return is minted — the idempotent edge of the level-triggered wake (S9a/S9b).
  function hasQueuedActionableReturn(card = {}) {
    // Wake-DRIVING returns only: an intermediate actionable return (the card needs routing/a reply) or a
    // routed result delivered to this card (a join completion). A bare self-completion terminal return
    // does NOT make a finished card a wake candidate — that flows to its owner, and it stops a card
    // cycling through the audit stage from re-orchestrating itself on its own `completed` returns.
    let returns = card?.metadata?.returns;
    return Array.isArray(returns) && returns.some(item => isWakeDrivingReturn(item));
  }

  // A hard-interrupt return (a blocked / needs_decision / needs_permission child) must wake the
  // orchestrator regardless of the board's `recovery` setting — a stuck child cannot self-clear, so
  // gating it on `recovery === 'auto'` would stall it forever (S9c, D4). Detected off the inbox so the
  // gate is per-card, not a single board-level early return.
  function hasUnconsumedHardInterrupt(card = {}) {
    let returns = card?.metadata?.returns;
    return Array.isArray(returns) && returns.some(item => item?.hardInterrupt === true && !item?.consumedAt);
  }

  // Compact one-line-per-return summary of the returns that actually DROVE this wake (wake-driving:
  // intermediate actionable or routed), newest first and capped, folded into the re-engagement reason
  // so the orchestrator wakes once and sees the batch (S10a). A bare self-completion terminal return is
  // not wake-driving, so it is not presented as a wake cause. Reuses the reason field — no new transport.
  function summarizeQueuedReturns(card = {}, limit = 5) {
    let returns = card?.metadata?.returns;
    if (!Array.isArray(returns)) return '';
    let lines = returns
      .filter(item => isWakeDrivingReturn(item))
      .slice(-limit)
      .reverse()
      .map(item => `- ${item.kind}${item.detail ? `: ${item.detail}` : ''}`);
    return lines.length ? `Queued returns (${lines.length}):\n${lines.join('\n')}` : '';
  }

  // Stamp `consumedAt` on every wake-DRIVING return so it wakes the orchestrator ONCE, not every tick
  // (S9b) — `consumedAt` then precisely means "this return drove a delivery". A bare self-completion
  // terminal return is not wake-driving (it never re-engages its own card), so it is left untouched as a
  // record. History survives (entries are marked, never deleted; the 12-cap bounds growth).
  function consumeActionableReturns(metadata, currentNow) {
    let returns = metadata?.returns;
    if (!Array.isArray(returns) || !returns.some(item => isWakeDrivingReturn(item))) {
      return metadata;
    }
    return {
      ...metadata,
      returns: returns.map(item => (
        isWakeDrivingReturn(item) ? { ...item, consumedAt: currentNow } : item
      )),
    };
  }

  // Escalation re-engagement loop. This is the ONLY place the attempt counter advances — it bumps
  // the count and pushes the backoff window in the same durable commit, BEFORE re-engaging the
  // orchestrator, so the cap is always reachable regardless of how the re-engaged run resolves. The
  // same loop drains queued actionable returns through the SAME driver (the event-driven wake): a
  // hard-interrupt return wakes regardless of `recovery` (S9c), a soft actionable return only on an
  // `auto` board, and the successful re-engagement stamps `consumedAt` in the same durable commit so a
  // return wakes the orchestrator exactly once (S9b).
  // Gate-resident: re-engagement routes the card back to `ready` (governed rework edge) so the
  // orchestrate automation re-routes by escalation kind — never a direct out-of-gate write, never
  // a silent rights grant. Opt-in per board via `automation.recovery === 'auto'`.
  async function reconcileWorkflowEscalations(args = {}, context = {}) {
    // Board-internal re-engagement automation: every commit here is the board driving
    // itself, so identity is the daemon. Re-engagement re-enters the gate as the daemon.
    let principal = daemonPrincipal();
    let daemonContext = { ...context, principal };
    let board = ensureBoard(args.boardId ?? args.board_id ?? DEFAULT_WORKFLOW_BOARD_ID);
    let boardAutomation = normalizeWorkflowBoardAutomation(board.automation);
    let recoveryAuto = boardAutomation.recovery === 'auto';
    let returnWakeAuto = boardAutomation.returnWake === 'auto';
    let projectId = textOrNull(args.projectId ?? args.project_id);
    let currentNow = now();
    let maxAttempts = Number(args.maxAttempts ?? args.max_attempts);
    if (!Number.isFinite(maxAttempts) || maxAttempts < 1) maxAttempts = DEFAULT_ESCALATION_MAX_ATTEMPTS;
    let reengaged = [];
    // No board-fabricated human escalations survive here (asking a person is the orchestrator's decision);
    // the loop-safety backstop now retires a terminally-stuck card to the reject terminal instead.
    let escalatedToHuman = [];
    let terminated = [];

    // S9a: a queued actionable return is a driver candidate alongside an active escalation, so a
    // return drives the orchestrator through this SAME re-engagement driver.
    let cards = Object.values(getCollection(stateGraph, 'workflowCards'))
      .filter(card => card.boardId === board.id)
      .filter(card => !projectId || card.projectId === projectId)
      .filter(card => hasActiveEscalation(card) || hasQueuedActionableReturn(card));

    for (let card of cards) {
      // Per-card wake gate (D4 + returnWake), applied PER-CARD not as a board-level early return:
      //   - an unconsumed hard-interrupt (a blocked child) wakes regardless — it cannot self-clear;
      //   - otherwise a queued wake-driving (soft) return is NEW actionable work, gated on `returnWake`
      //     (auto by default, so the return loop wakes a dormant orchestrator out of the box);
      //   - a card driven only by an escalation (stuck/recovering work) stays gated on `recovery`.
      if (!args.force && !hasUnconsumedHardInterrupt(card)) {
        let gateOpen = hasQueuedActionableReturn(card) ? returnWakeAuto : recoveryAuto;
        if (!gateOpen) continue;
      }
      let state = normalizeWorkflowEscalationState(card.metadata.escalation);
      // A `needs_human` episode is parked for an explicit human decision in the decision lane — the
      // board never auto re-engages it. The parking driver surfaces it; a human answer reactivates it.
      if (state.kind === 'needs_human') continue;
      // Rework loop-safety backstop (checked BEFORE the backoff gate — an exhausted loop must not wait
      // out an hours-long backoff window). reworkCycles persists across the completed re-execution runs
      // that reset attemptCount, so an audit that never passes would loop forever and pin the card's
      // file scope. Past a hard ceiling the board parks it in the decision lane for a human — the
      // documented extreme ("autonomous; the extreme case → Needs Decision"): a generic exhaustion
      // hand-off, not a fabricated question. needs-decision is not a pending-change column, so parking
      // also releases the card's file scope and unblocks every card that shared it.
      let reworkCyclesNow = Number(card.metadata?.reworkCycles ?? 0);
      if (state.kind === 'rework' && reworkCyclesNow > DEFAULT_AUDIT_REWORK_LIMIT + 1) {
        let decisionColumnId = (board.columns ?? [])
          .find(col => textOrNull(col?.automation?.action) === 'await_human')?.id ?? null;
        if (decisionColumnId) {
          let reason = `Automatic rework exhausted for ${card.id} after ${reworkCyclesNow} audit cycles without an orchestrator terminal; parking in the decision lane for a human (rework, reject, or accept).`;
          let parkedEscalation = normalizeWorkflowEscalationState({
            ...state,
            kind: 'needs_decision',
            lastEscalation: { schema: 'workflow-escalation/v1', kind: 'needs_decision', detail: reason, options: [], at: currentNow },
          });
          let metadata = { ...card.metadata, escalation: parkedEscalation };
          delete metadata.reworkCycles;
          let parkFlags = normalizeRecoveryFlags((card.recoveryFlags ?? []).filter(flag => flag !== 'needs_audit'));
          let parked = normalizeWorkflowCardInput({
            ...card, columnId: decisionColumnId, lifecycle: 'idle', recoveryFlags: parkFlags,
            metadata, version: card.version + 1, updatedAt: currentNow, updatedBy: principal.label,
          }, {
            id: card.id, actor: principal.label, now: currentNow,
            version: card.version + 1, createdAt: card.createdAt, updatedAt: currentNow,
          });
          let eventId = nextId(makeId, 'escalation');
          let event = normalizeWorkflowTransitionEvent({
            id: eventId, eventType: 'transition', boardId: board.id, cardId: card.id,
            fromColumnId: card.columnId, toColumnId: decisionColumnId, actor: principal.label, mode: 'auto',
            reason, status: 'accepted',
            sideEffects: [{ type: 'decision', resolution: 'needs_decision', detail: reason, reworkCycles: reworkCyclesNow }],
          }, { id: eventId, now: currentNow });
          stateGraph.commit([
            { op: 'set', path: `workflowCards/${card.id}`, value: parked },
            { op: 'set', path: `workflowTransitions/${event.id}`, value: event },
          ], sourceForPrincipal(principal));
          terminated.push({ cardId: card.id, kind: 'needs_decision', reworkCycles: reworkCyclesNow });
          continue;
        }
      }
      if (state.nextAttemptAt !== null && currentNow < state.nextAttemptAt && !args.force) continue;
      // Self-feed guard: never re-engage while a run is still active for this card. The backoff
      // window plus this guard mean each round drives exactly one orchestration.
      if (activeRunForCard(card.id) && !args.force) continue;

      // Loop-safety backstop. The board does NOT fabricate a human question here — asking a person is the
      // orchestrator's decision (WORKFLOW_RESULT: needs_human), not the board's. Below a hard ceiling an
      // exhausted card simply keeps RETURNING TO THE ORCHESTRATOR through the normal re-engage path below,
      // carrying the exhaustion directive its escalation detail already states, so the orchestrator stops
      // looping and decides (reject / ask a human / one targeted fix). Past the hard ceiling the card must
      // still reach a terminal (every card resolves), so the board retires it to the reject terminal as a
      // last-resort discard — a legitimate board terminal, never a fabricated human prompt or park.
      if (state.attemptCount >= maxAttempts * 2) {
        let rejectColumnId = rejectTerminalColumnId(board);
        if (rejectColumnId) {
          let reason = `Automatic re-engagement exhausted after ${state.attemptCount} attempts without an orchestrator terminal decision; retiring ${card.id} to the reject terminal.`;
          let metadata = { ...card.metadata };
          delete metadata.escalation;
          delete metadata.reworkCycles;
          metadata.resolution = { status: 'rejected', reason, at: currentNow, by: principal.label };
          let flags = normalizeRecoveryFlags((card.recoveryFlags ?? []).filter(flag => flag !== 'needs_audit' && flag !== 'blocked'));
          let rejected = normalizeWorkflowCardInput({
            ...card, columnId: rejectColumnId, lifecycle: 'idle', recoveryFlags: flags,
            metadata, version: card.version + 1, updatedAt: currentNow, updatedBy: principal.label,
          }, {
            id: card.id, actor: principal.label, now: currentNow,
            version: card.version + 1, createdAt: card.createdAt, updatedAt: currentNow,
          });
          let eventId = nextId(makeId, 'escalation');
          let event = normalizeWorkflowTransitionEvent({
            id: eventId, eventType: 'transition', boardId: board.id, cardId: card.id,
            fromColumnId: card.columnId, toColumnId: rejectColumnId, actor: principal.label, mode: 'auto',
            reason, status: 'accepted',
            sideEffects: [{ type: 'decision', resolution: 'rejected', detail: reason, attempts: state.attemptCount }],
          }, { id: eventId, now: currentNow });
          stateGraph.commit([
            { op: 'set', path: `workflowCards/${card.id}`, value: rejected },
            { op: 'set', path: `workflowTransitions/${event.id}`, value: event },
          ], sourceForPrincipal(principal));
          terminated.push({ cardId: card.id, kind: 'rejected', attempts: state.attemptCount, reason });
          continue;
        }
      }

      // Accrue FIRST, durably, before re-engaging — the central loop-safety invariant. An escalation
      // card bumps its attempt counter and pushes the backoff window; a card driven purely by a queued
      // return (no active escalation) accrues no phantom escalation state — `consumedAt` below is its
      // idempotency mechanism, and it re-engages immediately (no backoff).
      let escalated = hasActiveEscalation(card);
      let attemptCount = escalated ? state.attemptCount + 1 : 0;
      let nextAttemptAt = escalated
        ? currentNow + DEFAULT_ESCALATION_BACKOFF_MS * 2 ** (attemptCount - 1)
        : null;
      let accrued = escalated
        ? normalizeWorkflowEscalationState({ ...state, attemptCount, nextAttemptAt })
        : null;
      let escalationMetadata = accrued
        ? { ...card.metadata, escalation: accrued }
        : { ...card.metadata };
      // S9b: stamp `consumedAt` on every actionable, unconsumed return in the SAME durable commit as
      // the attempt accrual / re-engagement progress, so consumed ⟺ delivered. If no run is started
      // (the guards above `continue` before this point), the returns stay unconsumed and retry next
      // tick; once stamped, `hasQueuedActionableReturn` returns false until a NEW return is minted.
      let consumedMetadata = consumeActionableReturns(escalationMetadata, currentNow);
      let accruedCard = normalizeWorkflowCardInput({
        ...card,
        metadata: consumedMetadata,
        version: card.version + 1,
        updatedAt: currentNow,
        updatedBy: principal.label,
      }, {
        id: card.id,
        actor: principal.label,
        now: currentNow,
        version: card.version + 1,
        createdAt: card.createdAt,
        updatedAt: currentNow,
      });
      stateGraph.commit([{ op: 'set', path: `workflowCards/${card.id}`, value: accruedCard }], sourceForPrincipal(principal));

      // Re-engagement enqueues through the same admission queue (AD-17, inv 26): the accrued
      // backoff window becomes the queue entry's `notBefore`, so the card never jumps the queue and
      // the shipped escalation backoff pacing is preserved exactly. Attempt accrual already happened
      // durably above, so a dropped/contended enqueue does not burn an extra attempt here. S10a folds a
      // compact batch of the queued returns into the reason field the driver already builds so the
      // orchestrator wakes once and sees them all (no new transport).
      let returnSummary = summarizeQueuedReturns(card);
      let reengageReason = escalated
        ? `Escalation re-engagement #${attemptCount} (${accrued.kind}).`
        : 'Return re-engagement.';
      let reengageArgs = {
        boardId: board.id,
        cardId: card.id,
        reason: returnSummary ? `${reengageReason}\n${returnSummary}` : reengageReason,
        escalation: accrued,
        delegate: args.delegate,
        notBefore: nextAttemptAt,
        // Authorize the governed rework edge into `ready` when the woken card rests in a later column
        // (a dormant orchestrator finished its run in quality-audit). Honored only because this driver
        // runs as the daemon; a card carrying an active escalation already passes the gate without it.
        reworkAuthorized: true,
      };
      let outcome = null;
      try {
        if (accruedCard.columnId === 'ready') {
          outcome = await maybeAutoOrchestrateCard(board, accruedCard, reengageArgs, daemonContext);
        } else {
          outcome = await requestWorkflowTransition({ ...reengageArgs, toColumnId: 'ready' }, daemonContext);
        }
      } catch (error) {
        outcome = { ok: false, error: error.message };
      }
      reengaged.push({ cardId: card.id, attempt: attemptCount, kind: accrued?.kind ?? null, ok: Boolean(outcome?.ok) });
    }

    // A fully-manual board (neither recovery nor returnWake auto) still reports `skipped` when nothing
    // escaped the per-card gate (no hard-interrupt passthrough, no escalation/return re-engaged),
    // preserving the board-level contract.
    if (!recoveryAuto && !returnWakeAuto && !args.force && reengaged.length === 0 && escalatedToHuman.length === 0 && terminated.length === 0) {
      return { ok: true, skipped: true, reason: `board recovery is ${boardAutomation.recovery}, returnWake is ${boardAutomation.returnWake}`, reengaged, escalatedToHuman, terminated };
    }
    return { ok: true, reengaged, escalatedToHuman, terminated };
  }

  // ── Admission recovery / D1.4 resolution-from-phase (inv 25, 43; AD-11) ───────────────────────
  // Runs in the reconcile loop. It NEVER takes the board-admission lease (AD-16): it operates on a
  // read snapshot plus the lifecycle guard, so the two loops cannot deadlock. releaseSlot is owned
  // here only (single-owner). A `queued`+no-run card is legitimately queued — kept. A stranded
  // `admitting` card (admission lease epoch-stale + grace-elapsed) is resolved by an idempotent,
  // ordered, replayable sequence over a durable resolution record so a second crash re-drives from
  // the persisted phase. The displaced stale-epoch admitter performs no late compensation (D1.5):
  // its writes are CAS-rejected, so this loop is the sole cleanup owner.

  // Best-effort slot release through the agent-pool proxy. The agent-pool exposes no release tool
  // today (only the durable dead-pid liveness sweep on acquire/activeCount self-heals a leaked
  // slot), so this is the PARENT seam: it releases if a tool is wired, else relies on the sweep.
  // Idempotent on admissionId (inv 41/43). SEAM: agent-pool `release_slot` tool not yet exposed.
  async function releaseSlotForAdmission(admissionId, context = {}) {
    let pm = context.proxyManager ?? proxyManager;
    if (!pm?.requestFromChild) return { released: false, reason: 'proxy_unavailable' };
    try {
      let result = await pm.requestFromChild('agent-pool', 'tools/call', {
        name: 'release_slot',
        arguments: { admission_id: admissionId },
      }, 30_000);
      if (result?.isError) return { released: false, reason: 'release_tool_error' };
      return { released: true };
    } catch {
      // No release tool wired — the dead-pid liveness sweep reclaims the slot. Not an error.
      return { released: false, reason: 'release_tool_unavailable_sweep_owns' };
    }
  }

  // Drive a single resolution record forward from its persisted phase. Canonical phase order:
  //   'admitting' → 'rolled_back' (StateGraph run→terminal + lifecycle→queued + lease delete)
  //               → 'slot_released' (idempotent releaseSlot(admissionId))
  //               → cleared (resolution + admission records deleted).
  // Each step is idempotent and re-readable, so a second crash mid-resolution re-drives from here.
  async function driveAdmissionResolution(boardId, resolution, context = {}) {
    let principal = daemonPrincipal();
    let { cardId, admissionId } = resolution;
    let phase = resolution.phase ?? 'admitting';

    if (phase === 'admitting') {
      // Run→terminal, lifecycle admitting→queued (head, enqueuedAt preserved via the live entry),
      // per-card lease delete. The queue entry persisted across the crash (AD-2 overlap), so the
      // card returns to its fairness class without re-enqueue. Bump phase in the same durable frame.
      let card = stateGraph.get(`workflowCards/${cardId}`);
      let ops = [];
      if (card) {
        let cardCopy = clone(card);
        let lifecycle = normalizeWorkflowLifecycle(cardCopy.lifecycle);
        if (lifecycle === 'admitting') {
          let nextCard = normalizeWorkflowCardInput({
            ...cardCopy,
            lifecycle: 'queued',
            version: cardCopy.version + 1,
            updatedAt: now(),
            updatedBy: principal.label,
          }, {
            id: cardId,
            actor: principal.label,
            now: now(),
            version: cardCopy.version + 1,
            createdAt: cardCopy.createdAt,
            updatedAt: now(),
          });
          ops.push({ op: 'set', path: `workflowCards/${cardId}`, value: nextCard });
        }
      }
      for (let run of getRunsForCard(cardId)) {
        if (RUNNING_RUN_STATUSES.has(run.status) && run.cardId === cardId) {
          let terminal = normalizeWorkflowRunInput({
            ...run,
            status: 'stopped',
          }, { id: run.id, now: now(), updatedAt: now() });
          ops.push({ op: 'set', path: `workflowRuns/${run.id}`, value: terminal });
        }
      }
      // Clear an orphaned per-card lease ONLY for an admitting-resolution card whose lifecycle is
      // returning to queued — the lease was granted mid-admission and is now stale. (The general
      // reconcile rule clears leases only for {running,idle}; admitting resolution is the explicit
      // exception that re-queues the card and so must drop the half-granted lease.)
      let lease = stateGraph.get(`workflowLeases/${cardId}`);
      if (lease) ops.push({ op: 'delete', path: `workflowLeases/${cardId}` });
      ops.push({
        op: 'set',
        path: `workflowAdmissionResolution/${cardId}`,
        value: { ...resolution, phase: 'rolled_back', updatedAt: now() },
      });
      stateGraph.commit(ops, sourceForPrincipal(principal), { durable: true });
      phase = 'rolled_back';
    }

    if (phase === 'rolled_back') {
      await releaseSlotForAdmission(admissionId, context);
      stateGraph.commit([
        { op: 'set', path: `workflowAdmissionResolution/${cardId}`, value: { ...resolution, phase: 'slot_released', updatedAt: now() } },
      ], sourceForPrincipal(principal), { durable: true });
      phase = 'slot_released';
    }

    if (phase === 'slot_released') {
      stateGraph.commit([
        { op: 'delete', path: `workflowAdmissionResolution/${cardId}` },
        { op: 'delete', path: `workflowAdmissions/${admissionId}` },
      ], sourceForPrincipal(principal), { durable: true });
      phase = 'cleared';
    }
    return { cardId, admissionId, phase };
  }

  async function reconcileWorkflowAdmissions(args = {}, context = {}) {
    let board = ensureBoard(args.boardId ?? args.board_id ?? DEFAULT_WORKFLOW_BOARD_ID);
    let resolved = [];
    let kept = [];

    // 1. Re-drive any in-progress resolution record from its persisted phase (second-crash safe).
    let inflight = Object.values(getCollection(stateGraph, 'workflowAdmissionResolution'))
      .filter(record => record.boardId === board.id);
    for (let record of inflight) {
      let result = await driveAdmissionResolution(board.id, record, context);
      resolved.push(result);
    }

    // 2. Scan admission records for stranded `admitting` cards (lease epoch-stale + grace-elapsed).
    let admissions = Object.values(getCollection(stateGraph, 'workflowAdmissions'))
      .filter(record => record.boardId === board.id && record.phase === 'admitting');
    for (let record of admissions) {
      let card = stateGraph.get(`workflowCards/${record.cardId}`);
      if (!card) continue;
      let lifecycle = normalizeWorkflowLifecycle(card.lifecycle);
      if (lifecycle !== 'admitting') continue;
      if (stateGraph.get(`workflowAdmissionResolution/${record.cardId}`)) continue; // already driving
      if (!admissionLeaseStranded(board.id, record.startedAt)) {
        kept.push({ cardId: record.cardId, reason: 'admission_in_flight' });
        continue;
      }
      let resolution = {
        schema: 'workflow-admission-resolution/v1',
        cardId: record.cardId,
        boardId: board.id,
        leaseEpoch: record.leaseEpoch,
        admissionId: record.admissionId,
        phase: 'admitting',
        startedAt: now(),
      };
      stateGraph.commit([
        { op: 'set', path: `workflowAdmissionResolution/${record.cardId}`, value: resolution },
      ], sourceForPrincipal(daemonPrincipal()), { durable: true });
      let result = await driveAdmissionResolution(board.id, resolution, context);
      resolved.push(result);
    }

    // 3. A `queued`+no-run card with a live queue entry is legitimately queued — keep it.
    for (let entry of listQueueEntries(board.id)) {
      let card = stateGraph.get(`workflowCards/${entry.cardId}`);
      let lifecycle = normalizeWorkflowLifecycle(card?.lifecycle);
      if (lifecycle === 'queued' && !activeRunForCard(entry.cardId)) {
        kept.push({ cardId: entry.cardId, reason: 'legitimately_queued' });
      }
    }

    return { ok: true, resolved, kept };
  }

  function workspaceRoot() {
    let teamMemoryRoot = getTeamMemoryRoot();
    return teamMemoryRoot ? path.join(teamMemoryRoot, 'workspace') : null;
  }

  async function listWorkItemFiles(args = {}) {
    let root = workspaceRoot();
    if (!root) return [];
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
      filter.includeMarkdownSeed !== true
      && filter.includeMarkdownSeeds !== true
      && filter.importMarkdown !== true
    ) {
      return { ok: true, imported: [], skipped: [], count: 0 };
    }
    return importWorkflowWorkItems({
      boardId: filter.boardId ?? filter.board_id,
      projectId: filter.projectId ?? filter.project_id,
    }, { principal: daemonPrincipal() });
  }

  async function importWorkflowWorkItems(args = {}, context = {}) {
    let principal = resolvePrincipal(context);
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
      let result = createOrUpdateCard(cardInput, principal);
      if (result.ok === false) {
        skipped.push({
          cardId: cardInput.id,
          title: cardInput.title,
          markdownPath: cardInput.metadata.markdownPath,
          reason: result.status === 'pendingApproval' ? 'pending_approval' : 'blocked',
        });
        continue;
      }
      imported.push({
        cardId: result.card.id,
        title: result.card.title,
        markdownPath: result.card.metadata.markdownPath,
        version: result.card.version,
      });
    }
    return { ok: true, imported, skipped, count: imported.length };
  }

  async function exportWorkflowWorkItem(args = {}, context = {}) {
    let principal = resolvePrincipal(context);
    let cardId = normalizeCardId(args);
    let exportGate = gate(
      isDaemonPrincipal(principal) ? 'daemon.bookkeeping' : 'card.write',
      principal,
      { cardId },
    );
    if (!exportGate.ok) return exportGate;
    let actor = principal.label;
    let card = getCard(cardId);
    let projectId = textOrNull(args.projectId ?? args.project_id ?? card.projectId) ?? 'global';
    let root = workspaceRoot();
    if (!root) {
      throw new Error(
        'Team memory is not configured. Set agentPortal.teamMemoryRoot or AGENT_PORTAL_MEMORY_ROOT.',
      );
    }
    let markdownPath = textOrNull(args.markdownPath ?? args.markdown_path ?? card.metadata?.markdownPath)
      ?? path.join(slugSegment(projectId), 'plans', 'work-items', `${slugSegment(card.id)}.md`);
    let absPath = path.isAbsolute(markdownPath)
      ? markdownPath
      : path.join(root, markdownPath);
    if (!safeRelativePath(absPath, root)) {
      throw new Error('Workflow markdown export path must stay inside team-memory workspace.');
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
    stateGraph.commit([{ op: 'set', path: `workflowCards/${card.id}`, value: nextCard }], sourceForPrincipal(principal));
    return { ok: true, card: nextCard, markdownPath: relPath };
  }

  function getWorkflowRecoveryState(args = {}) {
    return { ok: true, recovery: getRecoveryState(args) };
  }

  function listWorkflowEvents(args = {}) {
    return { ok: true, events: listEvents(args) };
  }

  // Periodic self-healing: run reconcile on a timer so a board that is never read still has its
  // leases/recovery flags reconciled. Heals via the shared StateGraph; not auto-started.
  function createReconcileTick({ intervalMs = DEFAULT_RECONCILE_TICK_MS, triggerGapMs = DEFAULT_RECONCILE_TRIGGER_GAP_MS, onError = () => {} } = {}) {
    let timer = null;
    let triggerTimer = null;
    let running = false;
    let pending = false;
    async function runCycle() {
      let { boards } = listWorkflowBoards({ includeArchived: false });
      for (let board of boards) {
        try {
          await reconcileWorkflowRuntimeTasks({ boardId: board.id }, undefined, { drive: true });
          await reconcileWorkflowAdmissions({ boardId: board.id });
          await reconcileWorkflowRecovery({ boardId: board.id });
          await reconcileWorkflowEscalations({ boardId: board.id });
          // Dependency release tick (AD-5): enqueue blocked cards whose edges are satisfied and
          // escalate any card blocked past max-blocked-age, before the admission pass. The drain
          // also runs it, but the reconcile loop covers modes that drain skips.
          if (!['stopped', 'maintenance'].includes(board.mode)) {
            releaseDependencies(board.id);
            // Occupancy-aging tick (Axis C): escalate cards stalled in a column past the stale budget.
            escalateStaleCards(board.id);
            // Per-root convergence sweep: terminate any root that hit its re-decompose cap (Step 4).
            resolveRootConvergenceBreaches(board.id);
          }
          // Scheduler loop: a bounded admission pass drains the queue under the board-admission
          // lease. Separate from reconcile (which never takes that lease) per AD-9/16.
          await drainWorkflowQueue(board.id, {});
        } catch (err) {
          onError(err, board.id);
        }
      }
      return boards.length;
    }
    // Single-flight with a coalesced trailing edge: a tickOnce requested while a cycle is running sets
    // `pending` and the cycle re-runs ONCE more after it, so a burst of edge-triggers collapses into
    // one extra pass and the last task event is never dropped between periodic ticks.
    async function tickOnce() {
      if (running) { pending = true; return { ok: true, coalesced: true }; }
      running = true;
      try {
        let boards = 0;
        do { pending = false; boards = await runCycle(); } while (pending);
        return { ok: true, boards };
      } finally {
        running = false;
      }
    }
    // Edge-trigger entry: an agent-pool task event (status change / WORKFLOW_RETURN marker) requests a
    // near-immediate reconcile so a return wakes the orchestrator without waiting for the periodic tick.
    // Debounced by `triggerGapMs` so a stream of events collapses into one pass; the periodic
    // setInterval remains the DURABLE backstop — a dropped/lost edge-trigger self-heals next interval.
    function requestTick() {
      if (triggerTimer) return;
      triggerTimer = setTimeout(() => { triggerTimer = null; tickOnce().catch(onError); }, triggerGapMs);
      if (typeof triggerTimer.unref === 'function') triggerTimer.unref();
    }
    return {
      tickOnce,
      requestTick,
      start() {
        if (timer) return;
        timer = setInterval(() => { tickOnce().catch(onError); }, intervalMs);
        if (typeof timer.unref === 'function') timer.unref();
      },
      stop() {
        if (timer) { clearInterval(timer); timer = null; }
        if (triggerTimer) { clearTimeout(triggerTimer); triggerTimer = null; }
      },
      get active() { return timer !== null; },
    };
  }

  let reconcileTick = createReconcileTick({ intervalMs: reconcileTickMs, onError: onReconcileTickError });

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
    createWorkflowBoardFromSpec,
    getWorkflowBoard,
    createWorkItem,
    updateWorkItem,
    decomposeWorkItem,
    updateWorkflowBoard,
    applyAutonomyLevel,
    updateWorkflowColumn,
    controlWorkflowBoard,
    requestWorkflowTransition,
    deleteWorkItem,
    claimWorkItem,
    releaseWorkItem,
    orchestrateWorkItem,
    buildWorkItemPrompt,
    enqueueWorkItem,
    enqueueWorkflowCard,
    listQueueEntries,
    admissionOrder,
    rootIndex,
    perRootConvergenceCounts,
    perRootConvergenceAvailable,
    drainWorkflowQueue,
    linkDependency,
    unlinkDependency,
    materializeJoinCard,
    defineWorkflowColumn,
    deleteWorkflowColumn,
    defineWorkflowTransition,
    defineWorkflowGate,
    releaseDependencies,
    escalateStaleCards,
    resolveRootConvergenceBreaches,
    columnOccupancyAvailable,
    resumeWorkItem,
    controlWorkItem,
    reconcileWorkflowRuntimeTasks,
    reconcileWorkflowAdmissions,
    reconcileWorkflowRecovery,
    reconcileWorkflowEscalations,
    addCardComment,
    listCardComments,
    replyToCard,
    parseRunEscalation,
    importWorkflowWorkItems,
    exportWorkflowWorkItem,
    getWorkflowRecoveryState,
    listWorkflowEvents,
    reconcileTick,
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
