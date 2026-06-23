import { Symbiote } from '@symbiotejs/symbiote';
import 'symbiote-ui/display/code-block';
import { openChat } from '../../common/open-chat.js';
import { tPortal } from '../../common/localization.js';
import template from './WorkflowCardInspector.tpl.js';
import css from './WorkflowCardInspector.css.js';
import {
  getWorkflowBoardSelection,
  selectionEvents,
} from './workflow-board-selection.js';
import {
  latestRun,
  agentName,
  formatDuration,
  formatTokens,
  relativeTime,
} from './workflow-card-telemetry.js';
import { checkPassed } from '../../../src/iso/workflow-board.js';

const HISTORY_LIMIT = 8;

const AUDIT_COLUMN_ID = 'quality-audit';
// The escalation kinds the auditor uses to bounce a card back to the orchestrator.
const AUDIT_ESCALATION_KINDS = new Set(['insufficient_permission', 'insufficient_context', 'needs_decision', 'rework']);

// Read a check value off the raw projection card. The web normalizer flattens `card.checks` into a
// display array, but keeps the original object form on `card.raw.checks`, which is what the gate
// semantics reason about (a bare 'passed'/'failed' string or a `{status, signedBy, reason}` record).
function rawCheck(card, key) {
  let checks = card?.raw?.checks;
  if (!checks || typeof checks !== 'object') return undefined;
  return checks[key];
}

// A reject is an explicit failed audit status (string or `{status:'failed'}`). `checkPassed` already
// covers the pass side (and waivers); anything not pass and not an explicit fail is treated as pending.
function checkRejected(value) {
  if (value === false) return true;
  if (value === null || value === undefined || value === true) return false;
  if (typeof value === 'object') return checkRejected(value.status);
  return ['failed', 'fail', 'rejected', 'reject'].includes(String(value).trim().toLowerCase());
}

function escalationState(card) {
  let state = card?.metadata?.escalation;
  return state && typeof state === 'object' ? state : null;
}

// Does this card's escalation belong to the audit kickback flow (auditor rejected → re-orchestrate)?
function hasAuditEscalation(card) {
  let state = escalationState(card);
  let kind = state?.kind || state?.lastEscalation?.kind;
  return Boolean(kind && AUDIT_ESCALATION_KINDS.has(String(kind)));
}

function text(value, fallback = '') {
  let out = String(value ?? '').trim();
  return out || fallback;
}

function statusKind(value = '') {
  let key = text(value).toLowerCase();
  if (['error', 'failed', 'cancelled', 'blocked', 'lost'].includes(key)) return 'error';
  if (['recovering', 'stale', 'needs_resume', 'needs_audit', 'pendingapproval'].includes(key)) return 'warning';
  if (['completed', 'done', 'success', 'accepted'].includes(key)) return 'ok';
  return '';
}

function formatColumnId(id) {
  let t = text(id);
  if (!t) return '';
  return t.replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

// Describe a card event for the history list. A transition becomes "From → To"; everything else
// falls back to its label/type so the row is never just a bare status like "accepted".
function eventLabel(event = {}) {
  let to = formatColumnId(event.toColumnId);
  let from = formatColumnId(event.fromColumnId);
  if (to && from && to !== from) return `${from} → ${to}`;
  // Self-loop (e.g. an audit re-orchestrated within quality-audit): "X → X" is noise, so show the
  // column plus what happened instead.
  if (to) {
    let kind = text(event.eventType);
    return kind ? `${to} · ${kind}` : to;
  }
  return text(event.label || event.eventType, '—');
}

function eventTitle(event = {}) {
  return [event.status, event.actor, event.note].map((p) => text(p)).filter(Boolean).join(' · ');
}

const RUNNING_STATUSES = new Set(['running', 'requested', 'recovering', 'started', 'active', 'streaming']);

const HELD_FLAG_LABELS = {
  needs_audit: 'Needs audit',
  blocked: 'Blocked',
  needs_resume: 'Needs resume',
  stale: 'Stale',
  recovering: 'Recovering',
  lost: 'Lost',
};

// Why a card is sitting still: surface the recovery/blocking flags (and any blocker text) so a card
// parked in e.g. quality-audit reads as "Needs audit" instead of looking frozen.
function heldReason(card = {}) {
  let labels = (Array.isArray(card.flags) ? card.flags : [])
    .map((f) => HELD_FLAG_LABELS[f])
    .filter(Boolean);
  let blocker = text(card.blocker);
  if (!labels.length && !blocker) return '';
  return [[...new Set(labels)].join(', '), blocker].filter(Boolean).join(' — ');
}

export class WorkflowCardInspector extends Symbiote {
  initCallback() {
    this.ref.lblStatus.textContent = tPortal('inspector.status');
    this.ref.lblDuration.textContent = tPortal('inspector.duration');
    this.ref.lblTokens.textContent = tPortal('inspector.tokens');
    this.ref.lblAudit.textContent = tPortal('inspector.audit');
    this.ref.lblRuns.textContent = tPortal('inspector.runs');
    this.ref.lblHistory.textContent = tPortal('inspector.history');
    this.ref.lblBody.textContent = tPortal('inspector.details');
    this.ref.empty.textContent = tPortal('inspector.empty');
    this.ref.chatBtn.textContent = tPortal('inspector.openChat');

    this.ref.chatBtn.addEventListener('click', () => this.#openChat());

    this._selectionHandler = (event) => this.renderSelection(event.detail);
    selectionEvents.addEventListener('workflow-board-selection-change', this._selectionHandler);
    this.renderSelection(getWorkflowBoardSelection());
  }

  disconnectedCallback() {
    super.disconnectedCallback?.();
    if (this._selectionHandler) {
      selectionEvents.removeEventListener('workflow-board-selection-change', this._selectionHandler);
      this._selectionHandler = null;
    }
  }

  #openChat() {
    openChat(this._chatId);
  }

  renderSelection(selection = null) {
    let card = selection?.card || null;
    let board = selection?.board || null;
    if (!card) {
      this._chatId = null;
      this.ref.title.textContent = tPortal('text.cardInspector');
      this.ref.statusBadge.hidden = true;
      this.ref.empty.hidden = false;
      this.ref.content.hidden = true;
      return;
    }

    this.ref.empty.hidden = true;
    this.ref.content.hidden = false;

    let run = latestRun(card);
    this.ref.title.textContent = text(card.title, tPortal('text.cardInspector'));

    let status = text(card.status || run?.status);
    let active = RUNNING_STATUSES.has(text(run?.status).toLowerCase());
    this.ref.spinner.hidden = !active;
    if (status) {
      this.ref.statusBadge.textContent = status;
      this.ref.statusBadge.dataset.kind = active ? 'warning' : statusKind(status);
      this.ref.statusBadge.hidden = false;
    } else {
      this.ref.statusBadge.hidden = true;
    }

    let held = heldReason(card);
    if (held && !active) {
      this.ref.heldNotice.textContent = held;
      this.ref.heldNotice.hidden = false;
    } else {
      this.ref.heldNotice.hidden = true;
    }

    this.ref.agentName.textContent = agentName(card, run) || tPortal('inspector.unassigned');
    this._chatId = text(card.entityRefs?.chatId) || null;
    this.ref.chatBtn.hidden = !this._chatId;

    this.ref.mStatus.textContent = status || '—';
    this.ref.mStatus.dataset.kind = statusKind(status);
    this.ref.mDuration.textContent = formatDuration(run) || '—';
    this.ref.mTokens.textContent = formatTokens(run?.tokens) || '—';

    this.#renderAudit(card, board);
    this.#renderRuns(card);
    this.#renderHistory(card);

    this.ref.viewer?.setContent?.(
      text(card.body || card.raw?.body || card.summary, tPortal('inspector.empty')),
      'markdown',
    );
  }

  // Surface the quality-audit outcome: the verdict (pass / reject / pending), the auditor and any
  // signed reason, an orchestrator-kickback line when the auditor bounced the card, and a "next" hint
  // derived from the board mode. Shown whenever the card carries an audit verdict, is parked in the
  // audit column, or has an audit-related escalation; hidden otherwise.
  #renderAudit(card, board) {
    let audit = rawCheck(card, 'audit');
    let waiver = rawCheck(card, 'auditWaiver');
    let passed = checkPassed(audit) || checkPassed(waiver);
    let rejected = !passed && checkRejected(audit);
    let inAuditColumn = (card.columnId || card.raw?.columnId) === AUDIT_COLUMN_ID;
    let escalated = hasAuditEscalation(card);

    let relevant = passed || rejected || inAuditColumn || escalated;
    if (!relevant) {
      this.ref.auditSection.hidden = true;
      return;
    }
    this.ref.auditSection.hidden = false;

    let badge = this.ref.auditBadge;
    if (passed) {
      badge.textContent = tPortal('inspector.auditPassed');
      badge.dataset.kind = 'ok';
    } else if (rejected) {
      badge.textContent = tPortal('inspector.auditRejected');
      badge.dataset.kind = 'error';
    } else {
      badge.textContent = tPortal('inspector.auditPending');
      badge.dataset.kind = 'warning';
    }

    // Auditor: prefer the recorded signer, fall back to the latest run's agent.
    let signedBy = audit && typeof audit === 'object' ? text(audit.signedBy) : '';
    let auditor = signedBy || agentName(card, latestRun(card));
    if (auditor) {
      this.ref.auditBy.textContent = tPortal('inspector.auditBy', { agent: auditor });
      this.ref.auditBy.hidden = false;
    } else {
      this.ref.auditBy.hidden = true;
    }

    let reason = audit && typeof audit === 'object' ? text(audit.reason) : '';
    if (reason) {
      this.ref.auditReason.textContent = reason;
      this.ref.auditReason.hidden = false;
    } else {
      this.ref.auditReason.hidden = true;
    }

    let escalation = escalationState(card);
    if ((rejected || escalated) && escalation) {
      let kind = text(escalation.kind || escalation.lastEscalation?.kind, '—');
      let attempt = Number(escalation.attemptCount);
      this.ref.auditReturned.textContent = tPortal('inspector.auditReturned', {
        kind,
        attempt: Number.isFinite(attempt) && attempt > 0 ? attempt : 1,
      });
      this.ref.auditReturned.hidden = false;
      let detail = text(escalation.detail || escalation.lastEscalation?.detail);
      let suggestion = text(escalation.lastEscalation?.suggestedResolution);
      let detailText = [detail, suggestion].filter(Boolean).join(' — ');
      if (detailText) {
        this.ref.auditDetail.textContent = detailText;
        this.ref.auditDetail.hidden = false;
      } else {
        this.ref.auditDetail.hidden = true;
      }
    } else {
      this.ref.auditReturned.hidden = true;
      this.ref.auditDetail.hidden = true;
    }

    let nextHint = this.#auditNextHint({ passed, rejected, mode: text(board?.mode).toLowerCase() });
    if (nextHint) {
      this.ref.auditNext.textContent = nextHint;
      this.ref.auditNext.hidden = false;
    } else {
      this.ref.auditNext.hidden = true;
    }
  }

  // The post-audit step, by board mode: a pass waits for an independent publish sign-off in `armed`
  // but auto-advances toward commit in `autonomous`; a reject is routed back for re-orchestration.
  #auditNextHint({ passed, rejected, mode }) {
    if (passed) {
      return mode === 'autonomous'
        ? tPortal('inspector.auditNextAutoCommit')
        : tPortal('inspector.auditNextAwaitPublish');
    }
    if (rejected) return tPortal('inspector.auditNextReorchestrate');
    return '';
  }

  #renderRuns(card) {
    let runs = (Array.isArray(card.runs) ? card.runs : [])
      .slice()
      .sort((a, b) => (Date.parse(a.startedAt || '') || 0) - (Date.parse(b.startedAt || '') || 0));

    let list = this.ref.runsList;
    list.replaceChildren();
    // Only worth a list when the card went through more than one pass; a single run is already
    // summarized by the metrics row above.
    if (runs.length < 2) {
      this.ref.runsSection.hidden = true;
      return;
    }
    this.ref.runsSection.hidden = false;

    for (let run of runs) {
      let item = document.createElement('li');
      item.className = 'wci-run-item';
      let kind = statusKind(run.status);
      if (kind) item.dataset.kind = kind;

      let dot = document.createElement('span');
      dot.className = 'wci-run-dot';
      dot.setAttribute('aria-hidden', 'true');

      let agent = document.createElement('span');
      agent.className = 'wci-run-agent';
      agent.textContent = text(run.leaseOwner, tPortal('inspector.unassigned'));

      let meta = document.createElement('span');
      meta.className = 'wci-run-meta';
      let tokens = formatTokens(run.tokens);
      meta.textContent = [text(run.status), formatDuration(run), tokens ? `${tokens} tok` : '']
        .filter(Boolean)
        .join(' · ');

      item.append(dot, agent, meta);

      let chatId = text(run.chatId) || text(card.entityRefs?.chatId);
      if (chatId) {
        let chatBtn = document.createElement('button');
        chatBtn.type = 'button';
        chatBtn.className = 'wci-run-chat';
        chatBtn.textContent = '↗';
        chatBtn.title = tPortal('inspector.openChat');
        chatBtn.setAttribute('aria-label', tPortal('inspector.openChat'));
        chatBtn.addEventListener('click', () => openChat(chatId));
        item.append(chatBtn);
      }
      list.append(item);
    }
  }

  #renderHistory(card) {
    let events = (Array.isArray(card.events) ? card.events : [])
      .slice()
      .sort((a, b) => (Date.parse(b.timestamp || '') || 0) - (Date.parse(a.timestamp || '') || 0))
      .slice(0, HISTORY_LIMIT);

    let list = this.ref.historyList;
    list.replaceChildren();
    if (!events.length) {
      this.ref.historySection.hidden = true;
      return;
    }
    this.ref.historySection.hidden = false;

    for (let event of events) {
      let item = document.createElement('li');
      item.className = 'wci-history-item';
      let kind = statusKind(event.status || event.label);
      if (kind) item.dataset.kind = kind;

      let dot = document.createElement('span');
      dot.className = 'wci-history-dot';
      dot.setAttribute('aria-hidden', 'true');

      let label = document.createElement('span');
      label.className = 'wci-history-label';
      label.textContent = eventLabel(event);
      let title = eventTitle(event);
      if (title) label.title = title;

      let actor = document.createElement('span');
      actor.className = 'wci-history-actor';
      actor.textContent = text(event.actor);

      let time = document.createElement('span');
      time.className = 'wci-history-time';
      time.textContent = relativeTime(event.timestamp);

      item.append(dot, label, actor, time);
      list.append(item);
    }
  }
}

WorkflowCardInspector.template = template;
WorkflowCardInspector.rootStyles = css;
WorkflowCardInspector.reg('pg-workflow-card-inspector');

export default WorkflowCardInspector;
