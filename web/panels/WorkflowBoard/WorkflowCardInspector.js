import { Symbiote } from '@symbiotejs/symbiote';
import 'symbiote-ui/display/code-block';
import { openChat } from '../../common/open-chat.js';
import { tPortal } from '../../common/localization.js';
import { agentCatalogSnapshot } from '../../services/agent-catalog.js';
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
  effectiveStatus,
  isCardActive,
  formatStatusLabel,
} from './workflow-card-telemetry.js';
import { statusChipKind } from './workflow-card-presentation.js';
import {
  createInspectorHistoryModel,
  createInspectorRunsModel,
} from './workflow-card-inspector-model.js';
import { createInspectorDecisionModel } from './workflow-card-inspector-decision.js';
import { replyToCard, fetchWorkflowCardDetail } from '../../services/workflow-board.js';
import { checkPassed } from '../../../src/iso/workflow-board.js';

const AUDIT_COLUMN_ID = 'quality-audit';
// The escalation kinds the auditor uses to bounce a card back to the orchestrator.
const AUDIT_ESCALATION_KINDS = new Set(['insufficient_permission', 'insufficient_context', 'needs_decision', 'rework']);

// A terminal card's resolution status (cancelled / rejected / discarded) → a short localized badge
// label; unknown statuses fall back to the prettified token.
const RESOLUTION_STATUSES = new Set(['rejected', 'cancelled', 'discarded']);

function resolutionLabel(status) {
  return RESOLUTION_STATUSES.has(status)
    ? tPortal(`workflow.resolution.${status}`)
    : formatColumnId(status);
}

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
  let state = card?.metadata?.escalation ?? card?.raw?.metadata?.escalation;
  return state && typeof state === 'object' ? state : null;
}

// The card's resolution record, set when it reached a terminal via cancel / reject / debris reap.
function resolutionState(card) {
  let res = card?.metadata?.resolution ?? card?.raw?.metadata?.resolution;
  return res && typeof res === 'object' ? res : null;
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

// The inspector shares the board's separated status taxonomy (workflow-card-presentation.js):
// 'state' execution, 'status' positive outcome, 'error' / 'warning' problems, '' quiet.
const statusKind = statusChipKind;

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

const HELD_FLAGS = new Set(['needs_audit', 'blocked', 'needs_resume', 'stale', 'recovering', 'lost']);

// Why a card is sitting still: surface the recovery/blocking flags (and any blocker text) so a card
// parked in e.g. quality-audit reads as "Needs audit" instead of looking frozen. Flag labels come
// from portal.workflow.flag.* (shared with the board card chips).
function heldReason(card = {}) {
  let labels = (Array.isArray(card.flags) ? card.flags : [])
    .filter((f) => HELD_FLAGS.has(f))
    .map((f) => tPortal(`workflow.flag.${f}`));
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
    this.ref.lblDecision.textContent = tPortal('inspector.decision');
    this.ref.decisionSendBtn.textContent = tPortal('inspector.decisionSend');
    this.ref.decisionText.placeholder = tPortal('inspector.decisionPlaceholder');

    this.ref.chatBtn.addEventListener('click', () => this.#openChat());
    this.ref.decisionSendBtn.addEventListener('click', () => this.#submitReply());

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

  // Build vs update: a NEW card id rebuilds every section; a silent refresh of the SAME card
  // patches values in place (textContent/dataset on fixed refs) and only rebuilds a list/section
  // whose derived content actually changed — so an open decision draft, focus, and scroll survive
  // realtime refreshes.
  //
  // The board list ships each card in its FACE form (latest run/event only, no body/full history), so
  // on selection we render the face immediately (no blank flash) and lazily fetch the FULL card detail
  // (full runs/events/body/metadata), cached per id for the session. When the detail resolves for the
  // still-selected card we re-render from the hydrated card, filling the runs/history/body sections.
  renderSelection(selection = null) {
    let board = selection?.board || null;
    // The board version advances on every reload / mutation; when it moves, the cached full details
    // may be stale, so drop the per-session cache and re-hydrate against the fresh board.
    let boardVersion = board?.version ?? null;
    if (boardVersion !== null && boardVersion !== this._detailBoardVersion) {
      this._detailBoardVersion = boardVersion;
      this.clearDetailCache();
    }
    let card = this.#hydrate(selection?.card || null);
    if (!card) {
      this._chatId = null;
      this._decisionCard = null;
      this._decisionBoard = null;
      this._renderedCardId = '';
      this._selectedBoard = null;
      this._sig = null;
      this.ref.title.textContent = tPortal('text.cardInspector');
      this.ref.statusBadge.hidden = true;
      this.ref.resolutionBadge.hidden = true;
      this.ref.decisionSection.hidden = true;
      this.ref.empty.hidden = false;
      this.ref.content.hidden = true;
      return;
    }
    this._decisionCard = card;
    this._decisionBoard = board;
    this._selectedBoard = board;
    let sameCard = this._renderedCardId === card.id;
    this._renderedCardId = card.id;
    if (!sameCard || !this._sig) this._sig = {};
    // Kick off (or reuse) the lazy full-detail fetch for this card; when it lands it re-renders.
    this.#ensureCardDetail(card, board);

    this.ref.empty.hidden = true;
    this.ref.content.hidden = false;

    let run = latestRun(card);
    this.ref.title.textContent = text(card.title, tPortal('text.cardInspector'));

    let status = effectiveStatus(card);
    let active = isCardActive(card);
    this.ref.spinner.hidden = !active;
    if (status) {
      this.ref.statusBadge.textContent = formatStatusLabel(status);
      this.ref.statusBadge.dataset.kind = statusKind(status);
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

    let agent = agentName(card, run);
    this.ref.agentName.textContent = agent || tPortal('inspector.unassigned');
    // The diamond carries the agent's declared identity color (team-memory frontmatter via
    // /api/agents); undeclared agents keep the theme accent through the stylesheet fallback.
    let agentMeta = agent ? agentCatalogSnapshot().get(agent) : null;
    this.ref.agentSection.style.setProperty('--wci-agent-accent', agentMeta?.color || '');
    this.ref.agentSection.title = agentMeta?.description || '';
    this._chatId = text(card.entityRefs?.chatId) || null;
    this.ref.chatBtn.hidden = !this._chatId;

    this.ref.mStatus.textContent = formatStatusLabel(status) || '—';
    this.ref.mStatus.dataset.kind = statusKind(status);
    this.ref.mDuration.textContent = formatDuration(run) || '—';
    this.ref.mTokens.textContent = formatTokens(run?.tokens) || '—';

    this.#renderResolution(card);
    this.#renderAudit(card, board);
    this.#renderDecision(card, sameCard);
    this.#renderRuns(card, sameCard);
    this.#renderHistory(card, sameCard);

    let body = text(card.body || card.raw?.body || card.summary, tPortal('inspector.empty'));
    if (!sameCard || this._sig.body !== body) {
      this._sig.body = body;
      this.ref.viewer?.setContent?.(body, 'markdown');
    }
  }

  // Merge the cached full detail (full events/runs/body/context/metadata/checks) onto the face card
  // so every downstream helper reads the complete card. The face card's live fields (columnId, flags,
  // lifecycle, lease, latest run/event) win — the face list refresh is fresher than a cached detail —
  // while the detail supplies the heavy history the face omitted.
  #hydrate(card) {
    if (!card) return null;
    let detail = this._detailCache?.get(card.id);
    if (!detail) return card;
    return {
      ...detail,
      ...card,
      // Prefer the fuller arrays/body from the detail; the face card only carries length-1 arrays.
      runs: (Array.isArray(detail.runs) && detail.runs.length >= (card.runs?.length ?? 0))
        ? detail.runs : card.runs,
      events: (Array.isArray(detail.events) && detail.events.length >= (card.events?.length ?? 0))
        ? detail.events : card.events,
      body: text(card.body) || text(detail.body),
      metadata: { ...(detail.metadata || {}), ...(card.metadata || {}) },
      raw: { ...(detail.raw || {}), ...(card.raw || {}) },
    };
  }

  // Fetch the full card detail once per id (session cache) and re-render on arrival if the card is
  // still selected. A fetch already in flight or a cached detail short-circuits.
  #ensureCardDetail(card, board) {
    if (!this._detailCache) this._detailCache = new Map();
    if (!this._detailPending) this._detailPending = new Set();
    let cardId = text(card?.id);
    if (!cardId || this._detailCache.has(cardId) || this._detailPending.has(cardId)) return;
    this._detailPending.add(cardId);
    fetchWorkflowCardDetail({
      cardId,
      boardId: board?.boardId || board?.id,
      projectId: board?.projectId,
    })
      .then((detail) => {
        this._detailPending.delete(cardId);
        if (!detail) return;
        this._detailCache.set(cardId, detail);
        // Only re-render if this card is still the one on screen; a stale fetch never clobbers a newer
        // selection.
        if (this._renderedCardId === cardId) {
          this.renderSelection({ card, board: this._selectedBoard || board });
        }
      })
      .catch(() => {
        this._detailPending.delete(cardId);
      });
  }

  // Drop the per-session detail cache — the board reloaded, so cached full cards may be stale.
  clearDetailCache() {
    this._detailCache?.clear();
    this._detailPending?.clear();
  }

  // Surface the quality-audit outcome: the verdict (pass / reject / pending), the auditor and any
  // signed reason, an orchestrator-kickback line when the auditor bounced the card, and a "next" hint
  // derived from the board mode. Shown whenever the card carries an audit verdict, is parked in the
  // audit column, or has an audit-related escalation; hidden otherwise.
  #renderAudit(card, board) {
    let audit = rawCheck(card, 'audit');
    let waiver = rawCheck(card, 'auditWaiver');
    let passed = checkPassed(audit) || checkPassed(waiver);
    let inAuditColumn = (card.columnId || card.raw?.columnId) === AUDIT_COLUMN_ID;
    let escalated = hasAuditEscalation(card);
    // An audit-related escalation means the auditor bounced the card back to the orchestrator — that
    // reads as a rejection in the badge, matching the card's ✗ rework chip, even when the audit check
    // object itself is still empty (the proof-contract held it before any pass verdict was signed).
    let rejected = !passed && (checkRejected(audit) || escalated);

    let relevant = passed || rejected || inAuditColumn || escalated;
    if (!relevant) {
      this.ref.auditSection.hidden = true;
      return;
    }
    this.ref.auditSection.hidden = false;

    let badge = this.ref.auditBadge;
    if (passed) {
      badge.textContent = tPortal('inspector.auditPassed');
      badge.dataset.kind = 'status';
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

  // The terminal resolution badge (Rejected / Cancelled / Discarded) for a card that reached a terminal
  // via a reject decision, cancellation, or a reaped runtime-debris orphan. The reason rides on the title.
  #renderResolution(card) {
    let res = resolutionState(card);
    let badge = this.ref.resolutionBadge;
    if (!res || !res.status) {
      badge.hidden = true;
      return;
    }
    let key = text(res.status).toLowerCase();
    badge.textContent = resolutionLabel(key);
    badge.dataset.kind = key === 'discarded' ? 'warning' : 'error';
    let reason = text(res.reason);
    if (reason) badge.title = reason;
    badge.hidden = false;
  }

  // The human-decision panel: shown for a card parked in the decision lane (or carrying a needs_human
  // escalation). The human only ANSWERS the orchestrator's question — picks one of the orchestrator's
  // options or types a free-text reply. The answer is minted as a routed return into the orchestrator's
  // inbox; the orchestrator decides how to route the card. The human never routes or rejects directly.
  #renderDecision(card, sameCard = false) {
    let model = createInspectorDecisionModel(card);
    if (!model.visible) {
      this.ref.decisionSection.hidden = true;
      if (this._sig) this._sig.decision = '';
      return;
    }
    // A silent refresh of the same unchanged question must not wipe the human's draft answer,
    // the option buttons' disabled state, or an in-flight "submitting" status.
    if (sameCard && this._sig?.decision === model.signature && !this.ref.decisionSection.hidden) return;
    if (this._sig) this._sig.decision = model.signature;
    this.ref.decisionSection.hidden = false;
    this.ref.decisionQuestion.textContent = text(
      model.question,
      tPortal('inspector.decisionQuestion'),
    );

    let host = this.ref.decisionOptions;
    host.replaceChildren();
    for (let opt of model.options) {
      let id = opt.id;
      let btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'wci-decision-option';
      btn.textContent = text(opt.label, id);
      btn.addEventListener('click', () => this.#submitReply({ optionId: id }));
      host.append(btn);
    }
    this.#setDecisionStatus('', '');
    this.#decisionDisabled(false);
  }

  #decisionDisabled(disabled) {
    for (let ref of [this.ref.decisionSendBtn, this.ref.decisionText]) {
      if (ref) ref.disabled = disabled;
    }
    for (let btn of this.ref.decisionOptions?.children ?? []) btn.disabled = disabled;
  }

  #setDecisionStatus(message, kind) {
    this.ref.decisionStatus.textContent = message;
    this.ref.decisionStatus.dataset.kind = kind || '';
    this.ref.decisionStatus.hidden = !message;
  }

  // Submit the human's answer to the orchestrator: a chosen optionId and/or free-text reply. The reply
  // becomes a routed return in the orchestrator's inbox; the orchestrator owns the routing decision.
  async #submitReply({ optionId } = {}) {
    let card = this._decisionCard;
    let board = this._decisionBoard;
    let boardId = text(board?.boardId || board?.id);
    let cardId = text(card?.id || card?.raw?.id);
    if (!boardId || !cardId) return;
    let body = text(this.ref.decisionText?.value);
    if (!optionId && !body) return; // nothing to send
    this.#decisionDisabled(true);
    this.#setDecisionStatus(tPortal('inspector.decisionSubmitting'), 'warning');
    try {
      await replyToCard({ boardId, cardId, optionId, body, actor: 'human' });
      this.#setDecisionStatus(tPortal('inspector.decisionDone'), 'status');
      if (this.ref.decisionText) this.ref.decisionText.value = '';
    } catch (error) {
      this.#setDecisionStatus(error?.message || String(error), 'error');
      this.#decisionDisabled(false);
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

  #renderRuns(card, sameCard = false) {
    let model = createInspectorRunsModel(card);
    if (sameCard && this._sig?.runs === model.signature) return;
    if (this._sig) this._sig.runs = model.signature;

    let list = this.ref.runsList;
    list.replaceChildren();
    // Only worth a list when the card went through more than one pass; a single run is already
    // summarized by the metrics row above.
    if (model.totalCount < 2 || model.runs.length < 2) {
      this.ref.runsSection.hidden = true;
      return;
    }
    this.ref.runsSection.hidden = false;

    for (let run of model.runs) {
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
      meta.textContent = [text(run.status), formatDuration(run), tokens ? tPortal('workflow.card.tokens', { tokens }) : '']
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

  #renderHistory(card, sameCard = false) {
    let model = createInspectorHistoryModel(card);
    if (sameCard && this._sig?.history === model.signature) return;
    if (this._sig) this._sig.history = model.signature;

    let list = this.ref.historyList;
    list.replaceChildren();
    if (!model.events.length) {
      this.ref.historySection.hidden = true;
      return;
    }
    this.ref.historySection.hidden = false;

    for (let event of model.events) {
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
