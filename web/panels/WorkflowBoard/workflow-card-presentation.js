import { tPortal } from '../../common/localization.js';
import { checkPassed } from '../../../src/iso/workflow-board.js';
import {
  latestRun,
  formatDuration,
  formatTokens,
  relativeTime,
  effectiveStatus,
  isCardActive,
  formatStatusLabel,
} from './workflow-card-telemetry.js';

// Pure presentation mapping shared by the board cards, the column headers, and the card inspector.
// One separated status taxonomy (the sn-kanban-board chip contract, final vocabulary):
//   'state'    execution state (running/queued/recovering) — the only animated family
//   'status'   positive outcome (audit passed, completed)
//   'error'    negative outcome / blocked
//   'warning'  attention (recovery flags, pending approvals)
//   'agent'    identity (data accent)
//   'dep-blocked' / 'dep-unlocks'  dependency counters
//   ''         quiet telemetry/metadata (duration, tokens, project, kind, resource group)

function asText(value, fallback = '') {
  let out = String(value ?? '').trim();
  return out || fallback;
}

function prettyLabel(value) {
  return asText(value)
    .split(/[-_:/]+/)
    .filter(Boolean)
    .map(part => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(' ');
}

// UI-chrome vocabulary (board modes, automation enums, control verbs) is localized through
// portal.workflow.enum.* keys; unknown tokens fall back to the prettified identifier so
// user-defined values (board DATA) pass through untranslated.
export function localizeWorkflowEnum(value, fallbackValue = value) {
  let token = asText(value).toLowerCase();
  if (!token) return '';
  let key = `workflow.enum.${token}`;
  let translated = tPortal(key);
  return translated === `portal.${key}` ? prettyLabel(fallbackValue) : translated;
}

// Recovery/blocking flags carry curated labels under portal.workflow.flag.*; unknown flags fall
// back to the prettified flag token.
export function flagLabel(flag) {
  let token = asText(flag).toLowerCase();
  if (!token) return '';
  let key = `workflow.flag.${token}`;
  let translated = tPortal(key);
  return translated === `portal.${key}` ? prettyLabel(token) : translated;
}

const STATE_STATUSES = new Set([
  'running', 'queued', 'recovering', 'requested', 'started', 'active', 'streaming', 'admitting',
]);
const ERROR_STATUSES = new Set([
  'error', 'failed', 'fail', 'blocked', 'lost', 'cancelled', 'rejected', 'reject',
]);
const WARNING_STATUSES = new Set([
  'stale', 'needs_resume', 'needs_audit', 'pendingapproval', 'pending_approval', 'paused',
  'recovery_detected', 'needs_decision', 'needs_human', 'needs_permission', 'needs_context',
]);
const POSITIVE_STATUSES = new Set([
  'completed', 'done', 'success', 'succeeded', 'accepted', 'passed', 'ok', 'resolved',
]);

// Status token → chip/badge kind. Execution states map to 'state' (the only animated family);
// positive outcomes to 'status'; the rest to 'error'/'warning'; unknown tokens stay quiet ('').
export function statusChipKind(status = '') {
  let key = asText(status).toLowerCase();
  if (!key) return '';
  if (STATE_STATUSES.has(key)) return 'state';
  if (ERROR_STATUSES.has(key)) return 'error';
  if (WARNING_STATUSES.has(key)) return 'warning';
  if (POSITIVE_STATUSES.has(key)) return 'status';
  return '';
}

// Recovery/blocking flag → chip kind: hard-stopped reads danger, in-recovery reads attention.
export function flagChipKind(flag = '') {
  let key = asText(flag).toLowerCase();
  if (key === 'blocked' || key === 'lost') return 'error';
  if (key.includes('audit') || key.includes('resume') || key === 'recovering' || key === 'stale') {
    return 'warning';
  }
  return '';
}

// Only a priority that demands attention earns a chip: critical/high/urgent render as danger;
// medium and low disappear from the card face entirely (the inspector still shows the raw value).
const ALERT_PRIORITIES = new Set(['critical', 'high', 'urgent']);

export function priorityChip(priority = '') {
  let value = asText(priority);
  if (!ALERT_PRIORITIES.has(value.toLowerCase())) return null;
  return {
    label: value,
    kind: 'error',
    title: tPortal('workflow.card.priorityTitle', { priority: value }),
  };
}

// U06: a distinct material-symbols icon per resource group so a card's group reads at a glance even
// though the chip itself stays quiet telemetry; unknown groups fall back to a neutral marker.
export const GROUP_ICONS = {
  integrity: 'verified',
  resilience: 'shield',
  model: 'model_training',
  governance: 'gavel',
  'collab-observability': 'monitoring',
};
export const GROUP_ICON_FALLBACK = 'category';

// Audit kickback escalation kinds (auditor rejected → routed back to the orchestrator for rework).
const AUDIT_ESCALATION_KINDS = new Set(['insufficient_permission', 'insufficient_context', 'needs_decision', 'rework']);

// The original check object form lives on `card.raw.checks` (the projection); the normalized card
// keeps only a display array under `card.checks`, so read verdicts from the raw side.
function rawCardCheck(card, key) {
  let checks = card?.raw?.checks;
  if (!checks || typeof checks !== 'object') return undefined;
  return checks[key];
}

function auditRejected(value) {
  if (value === false) return true;
  if (value === null || value === undefined || value === true) return false;
  if (typeof value === 'object') return auditRejected(value.status);
  return ['failed', 'fail', 'rejected', 'reject'].includes(String(value).trim().toLowerCase());
}

function cardHasAuditEscalation(card = {}) {
  let state = card?.metadata?.escalation;
  let kind = state?.kind || state?.lastEscalation?.kind;
  return Boolean(kind && AUDIT_ESCALATION_KINDS.has(String(kind)));
}

// The kanban footer verdict chip for a card that has reached the quality audit: a positive-outcome
// chip when the audit passed (or was waived), a danger "rework" chip when the auditor rejected it
// (an explicit failed audit check, or a needs_audit flag paired with an audit-related escalation).
export function auditVerdictChip(card = {}) {
  let audit = rawCardCheck(card, 'audit');
  let waiver = rawCardCheck(card, 'auditWaiver');
  if (checkPassed(audit) || checkPassed(waiver)) {
    let signedBy = audit && typeof audit === 'object' ? asText(audit.signedBy) : '';
    let passTitle = tPortal('workflow.card.auditPassTitle');
    return {
      label: tPortal('workflow.card.auditPass'),
      kind: 'status',
      title: signedBy ? `${passTitle} · ${signedBy}` : passTitle,
    };
  }
  let flags = Array.isArray(card.flags) ? card.flags : [];
  let needsAudit = flags.includes('needs_audit');
  if (auditRejected(audit) || (needsAudit && cardHasAuditEscalation(card))) {
    let state = card?.metadata?.escalation;
    let reason = (audit && typeof audit === 'object' ? asText(audit.reason) : '')
      || asText(state?.detail || state?.lastEscalation?.detail)
      || asText(state?.kind || state?.lastEscalation?.kind);
    let rejectTitle = tPortal('workflow.card.auditRejectTitle');
    return {
      label: tPortal('workflow.card.auditRework'),
      kind: 'error',
      title: reason ? `${rejectTitle} · ${reason}` : rejectTitle,
    };
  }
  return null;
}

// The meta row: quiet identity/telemetry (resource group, project, card kind) plus the one loud
// exception — an attention-priority chip. Long-form content stays in the inspector.
export function cardMetaChips(card = {}) {
  let group = asText(card.resourceGroup ?? card.raw?.resourceGroup);
  return [
    group ? {
      label: group,
      icon: GROUP_ICONS[group] ?? GROUP_ICON_FALLBACK,
      kind: '',
      title: tPortal('workflow.card.groupTitle', { group }),
    } : null,
    card.projectId ? { label: card.projectId, kind: '' } : null,
    card.kind ? { label: card.kind, kind: '' } : null,
    priorityChip(card.priority),
  ].filter(Boolean);
}

// Priority-ordered footer candidates: execution state first (what's happening now), then lock/unlock,
// audit verdict, identity, quiet telemetry, then flags. The caller applies its chip budget + overflow.
export function cardFooterChips(card = {}, { blockedBy = 0, unlocks = 0, agentChip = null } = {}) {
  let liveStatus = effectiveStatus(card);
  let run = latestRun(card);
  let duration = formatDuration(run);
  let tokens = formatTokens(run?.tokens);
  let auditChip = auditVerdictChip(card);
  let flagChips = (Array.isArray(card.flags) ? card.flags : [])
    .filter(flag => !(auditChip && flag === 'needs_audit'))
    .slice(0, 2)
    .map(flag => ({ label: flagLabel(flag), kind: flagChipKind(flag) }));

  return [
    liveStatus ? { label: formatStatusLabel(liveStatus), kind: 'state' } : null,
    blockedBy ? { label: String(blockedBy), icon: 'lock', kind: 'dep-blocked', title: tPortal('workflow.card.blockedByTitle', { count: blockedBy }) } : null,
    auditChip,
    unlocks ? { label: String(unlocks), icon: 'lock_open', kind: 'dep-unlocks', title: tPortal('workflow.card.unlocksTitle', { count: unlocks }) } : null,
    agentChip,
    duration ? { label: duration, icon: 'schedule', kind: '' } : null,
    tokens ? { label: tPortal('workflow.card.tokens', { tokens }), icon: 'toll', kind: '' } : null,
    ...flagChips,
  ].filter(Boolean);
}

const TICKER_ICONS = {
  state: 'autorenew',
  warning: 'warning',
  error: 'error',
  '': 'history',
};

function tickerTimestamp(value) {
  let ts = typeof value === 'number' ? value : Date.parse(value || '');
  return Number.isFinite(ts) && ts > 0 ? ts : null;
}

// The card's one-line "last agent action / live status" ticker, derived entirely from data the
// client already holds — the most recent of: (a) the latest run status change, (b) the latest card
// event, (c) the latest worker return note (metadata.returns), (d) a live lease. Returns
// `{ label, icon, kind, title }` for the sn-kanban-board ticker row, or null when nothing happened.
export function deriveCardTicker(card = {}, { now = Date.now() } = {}) {
  let best = null;
  // Candidates are considered in source order (run, event, return, lease); a strictly newer
  // timestamp wins, so ties keep the earlier — most authoritative — source.
  let consider = (ts, actor, text, statusToken) => {
    if (!ts || !asText(text)) return;
    if (best && ts <= best.ts) return;
    best = { ts, actor: asText(actor), text: asText(text), statusToken: asText(statusToken) };
  };

  let run = latestRun(card);
  if (run) {
    consider(
      tickerTimestamp(run.updatedAt || run.completedAt || run.startedAt),
      run.leaseOwner,
      formatStatusLabel(run.status),
      run.status,
    );
  }

  let newestEvent = null;
  for (let event of Array.isArray(card.events) ? card.events : []) {
    let ts = tickerTimestamp(event?.timestamp);
    if (ts && (!newestEvent || ts > newestEvent.ts)) newestEvent = { ...event, ts };
  }
  if (newestEvent) {
    consider(
      newestEvent.ts,
      newestEvent.actor,
      newestEvent.note || newestEvent.label || formatStatusLabel(newestEvent.eventType),
      newestEvent.status || newestEvent.eventType,
    );
  }

  let newestReturn = null;
  for (let entry of Array.isArray(card.metadata?.returns) ? card.metadata.returns : []) {
    let ts = tickerTimestamp(entry?.raisedAt);
    if (ts && (!newestReturn || ts > newestReturn.ts)) newestReturn = { ...entry, ts };
  }
  if (newestReturn) {
    consider(
      newestReturn.ts,
      newestReturn.raisedBy,
      newestReturn.detail || formatStatusLabel(newestReturn.kind),
      newestReturn.kind,
    );
  }

  let lease = card.lease || {};
  let leaseExpires = tickerTimestamp(lease.leaseExpiresAt);
  if (asText(lease.leaseOwner) && leaseExpires && leaseExpires > now) {
    consider(
      tickerTimestamp(lease.updatedAt) || now,
      lease.leaseOwner,
      tPortal('workflow.ticker.working'),
      'running',
    );
  }

  if (!best) return null;
  // A failed/recovery source keeps its severity even on an idle card; otherwise a busy card ticks
  // as live state and a settled one stays quiet.
  let severity = statusChipKind(best.statusToken);
  let kind = severity === 'error' || severity === 'warning' || severity === 'state'
    ? severity
    : (isCardActive(card) ? 'state' : '');
  let rel = relativeTime(new Date(best.ts).toISOString(), { now });
  let label = [
    best.actor,
    best.text,
    rel ? tPortal('workflow.ticker.ago', { time: rel }) : '',
  ].filter(Boolean).join(' · ');
  return { label, icon: TICKER_ICONS[kind], kind, title: label };
}

const AUTOMATED_BOARD_MODES = new Set(['autonomous', 'armed']);

// The column header shows the EFFECTIVE execution mode — what actually happens to a card entering
// the column — not the column's configured mode in isolation. Automation only drives when the BOARD
// runs autonomous/armed: then auto → live automation ('state', bolt), gated → automation with gate
// checkpoints ('status', checklist), manual → hand-moved. Any other board mode means every column is
// human-driven regardless of configuration; the configured mode survives in the tooltip. The trigger
// never earns chip space — it belongs to the column-settings popover and rides the tooltip here.
export function effectiveColumnAutomation(boardMode = '', automation = {}) {
  let configured = asText(automation.mode).toLowerCase() || 'manual';
  let trigger = asText(automation.trigger).toLowerCase() || 'manual';
  let agents = [automation.agent, ...(Array.isArray(automation.agents) ? automation.agents : [])]
    .map(item => asText(item))
    .filter(Boolean);
  let agentCount = new Set(agents).size;
  let details = [
    agentCount ? tPortal('workflow.automation.agents', { count: agentCount }) : '',
    automation.parallelLimit ? tPortal('workflow.automation.parallelLimit', { limit: automation.parallelLimit }) : '',
    tPortal('workflow.automation.trigger', { trigger: localizeWorkflowEnum(trigger) }),
  ];
  let title = (lead) => [lead, ...details].filter(Boolean).join(' · ');

  if (!AUTOMATED_BOARD_MODES.has(asText(boardMode).toLowerCase())) {
    return {
      effective: 'manual',
      configured,
      label: tPortal('workflow.automation.manual'),
      kind: '',
      icon: 'pan_tool',
      title: title(tPortal('workflow.automation.boardIdleTitle', {
        mode: localizeWorkflowEnum(boardMode || 'passive'),
        configured: localizeWorkflowEnum(configured),
      })),
    };
  }
  if (configured === 'auto') {
    return {
      effective: 'auto',
      configured,
      label: tPortal('workflow.automation.auto'),
      kind: 'state',
      icon: 'bolt',
      title: title(tPortal('workflow.automation.autoTitle')),
    };
  }
  if (configured === 'gated') {
    return {
      effective: 'gated',
      configured,
      label: tPortal('workflow.automation.autoGates'),
      kind: 'status',
      icon: 'checklist',
      title: title(tPortal('workflow.automation.autoGatesTitle')),
    };
  }
  return {
    effective: 'manual',
    configured,
    label: tPortal('workflow.automation.manual'),
    kind: '',
    icon: 'pan_tool',
    title: title(tPortal('workflow.automation.manualTitle')),
  };
}
