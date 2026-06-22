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

const HISTORY_LIMIT = 8;

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
  if (to) {
    let from = formatColumnId(event.fromColumnId);
    return from ? `${from} → ${to}` : `→ ${to}`;
  }
  return text(event.label || event.eventType, '—');
}

function eventTitle(event = {}) {
  return [event.status, event.actor, event.note].map((p) => text(p)).filter(Boolean).join(' · ');
}

export class WorkflowCardInspector extends Symbiote {
  initCallback() {
    this.ref.lblStatus.textContent = tPortal('inspector.status');
    this.ref.lblDuration.textContent = tPortal('inspector.duration');
    this.ref.lblTokens.textContent = tPortal('inspector.tokens');
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
    if (status) {
      this.ref.statusBadge.textContent = status;
      this.ref.statusBadge.dataset.kind = statusKind(status);
      this.ref.statusBadge.hidden = false;
    } else {
      this.ref.statusBadge.hidden = true;
    }

    this.ref.agentName.textContent = agentName(card, run) || tPortal('inspector.unassigned');
    this._chatId = text(card.entityRefs?.chatId) || null;
    this.ref.chatBtn.hidden = !this._chatId;

    this.ref.mStatus.textContent = status || '—';
    this.ref.mStatus.dataset.kind = statusKind(status);
    this.ref.mDuration.textContent = formatDuration(run) || '—';
    this.ref.mTokens.textContent = formatTokens(run?.tokens) || '—';

    this.#renderHistory(card);

    this.ref.viewer?.setContent?.(
      text(card.body || card.raw?.body || card.summary, tPortal('inspector.empty')),
      'markdown',
    );
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

      let time = document.createElement('span');
      time.className = 'wci-history-time';
      time.textContent = relativeTime(event.timestamp);

      item.append(dot, label, time);
      list.append(item);
    }
  }
}

WorkflowCardInspector.template = template;
WorkflowCardInspector.rootStyles = css;
WorkflowCardInspector.reg('pg-workflow-card-inspector');

export default WorkflowCardInspector;
