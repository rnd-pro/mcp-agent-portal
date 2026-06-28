/**
 * board-notification-source.js — pure, portal-specific mapping from workflow
 * board state to notification events.
 *
 * The reusable notification machinery (queue, debouncer, sound engine, narrator,
 * phrase bank) lives in symbiote-ui. This module owns only the product-specific
 * knowledge: how a normalized agent-portal board column maps onto a narration
 * event type and a muteable board stage, and how to diff two board snapshots into
 * the "card X moved to stage Y" events the widget narrates.
 *
 * Deterministic and DOM-free: it takes plain board projections (as produced by
 * services/workflow-board.js) and returns plain event descriptors, so the
 * mapping is fully unit-testable in Node.
 */

import { DEFAULT_WORKFLOW_COLUMN_IDS } from '../../src/iso/workflow-board.js';

/**
 * Canonical board column id → muteable board stage. The stages mirror the
 * widget's NOTIFICATION_BOARD_STAGES (intake/decompose/orchestrate/execute/
 * audit/terminal) so a user can silence, e.g., routine intake entries while
 * keeping terminal narration.
 */
const COLUMN_STAGE = Object.freeze({
  ideas: 'intake',
  backlog: 'intake',
  ready: 'orchestrate',
  'in-progress': 'execute',
  'quality-audit': 'audit',
  'commit-publish': 'audit',
  done: 'terminal',
  rejected: 'terminal',
  'needs-decision': 'orchestrate',
});

/** Columns that decompose a card into children get the decompose stage. */
const DECOMPOSE_COLUMNS = new Set(['backlog']);

/**
 * Column id → the narration event type used when a card enters that column.
 * Terminal and exceptional columns get their own event so the sound preset and
 * phrasing match (success chime for done, reject tone for rejected, escalation
 * for the human-decision lane).
 */
const COLUMN_EVENT_TYPE = Object.freeze({
  ideas: 'task.created',
  backlog: 'task.moved',
  ready: 'task.moved',
  'in-progress': 'task.started',
  'quality-audit': 'task.moved',
  'commit-publish': 'task.moved',
  done: 'task.completed',
  rejected: 'task.failed',
  'needs-decision': 'approval.required',
});

const DEFAULT_EVENT_TYPE = 'task.moved';
const DEFAULT_STAGE = 'orchestrate';

function asText(value, fallback = '') {
  let text = String(value ?? '').trim();
  return text || fallback;
}

/** Muteable board stage for a column id (unknown columns fall back to orchestrate). */
export function stageForColumn(columnId) {
  let id = asText(columnId);
  if (DECOMPOSE_COLUMNS.has(id)) return 'decompose';
  return COLUMN_STAGE[id] || DEFAULT_STAGE;
}

/** Narration event type for a card entering a column. */
export function eventTypeForColumn(columnId) {
  let id = asText(columnId);
  return COLUMN_EVENT_TYPE[id] || DEFAULT_EVENT_TYPE;
}

/** Human-facing stage label for narration params, derived from the column title. */
function stageLabel(board, columnId) {
  let column = (board?.columns || []).find((entry) => entry?.id === columnId);
  return asText(column?.title, titleFromColumnId(columnId));
}

function titleFromColumnId(columnId) {
  let id = asText(columnId);
  if (!id) return '';
  return id
    .split(/[-_:/]+/)
    .filter(Boolean)
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(' ');
}

/**
 * Build a flat { cardId -> { columnId, title, version } } map from a normalized
 * board projection. Used as the diff baseline between two board loads.
 */
export function indexBoardCards(board) {
  let index = new Map();
  for (let card of board?.cards || []) {
    if (!card?.id) continue;
    index.set(card.id, {
      columnId: asText(card.columnId),
      title: asText(card.title, card.id),
      version: Number.isFinite(Number(card.version)) ? Number(card.version) : null,
    });
  }
  return index;
}

/**
 * Compose a single notification event for a card that entered `toColumnId`.
 * Shape matches what NotificationWidget.notify expects: `type` selects sound +
 * phrasing, `stage` gates stage muting, `params` feed the `{title}`/`{stage}`
 * phrase slots.
 */
export function buildCardStageEvent(board, card, toColumnId, options = {}) {
  let columnId = asText(toColumnId || card?.columnId);
  let title = asText(card?.title || options.title, asText(card?.id, 'work item'));
  let type = eventTypeForColumn(columnId);
  let stage = stageForColumn(columnId);
  let label = stageLabel(board, columnId);
  let cardId = asText(card?.id);
  return {
    // Stable per (card, column) so the queue dedup collapses repeated loads that
    // re-report the same resting position; a real transition changes columnId.
    id: `board:${asText(board?.boardId || board?.id)}:${cardId}:${columnId}`,
    type,
    stage,
    severity: severityForEventType(type),
    cardId,
    boardId: asText(board?.boardId || board?.id),
    columnId,
    message: title,
    params: { title, stage: label },
  };
}

/** Map a narration event type to a notification-queue severity. */
export function severityForEventType(type) {
  switch (type) {
    case 'task.completed':
      return 'success';
    case 'task.failed':
      return 'error';
    case 'task.blocked':
      return 'warning';
    case 'approval.required':
      return 'warning';
    default:
      return 'info';
  }
}

/**
 * Diff a previous board snapshot against the current one and return the
 * notification events for every card that entered a new column (or was newly
 * created). The first observation (no previous snapshot) emits nothing so a page
 * load does not narrate the whole resting board — only live transitions speak.
 *
 * @param {object|null} previousBoard normalized board, or null on first load
 * @param {object} currentBoard normalized board
 * @returns {Array<object>} notification events for NotificationWidget.notify
 */
export function diffBoardTransitions(previousBoard, currentBoard) {
  if (!currentBoard) return [];
  let current = indexBoardCards(currentBoard);
  // First observation: seed the baseline silently.
  if (!previousBoard) return [];
  let previous = indexBoardCards(previousBoard);

  let events = [];
  for (let [cardId, now] of current) {
    let before = previous.get(cardId);
    if (before && before.columnId === now.columnId) continue;
    // New card lands directly in a working/terminal column, or an existing card
    // changed columns: both are a "card entered stage" narration.
    let card = (currentBoard.cards || []).find((entry) => entry?.id === cardId) || {
      id: cardId,
      title: now.title,
      columnId: now.columnId,
    };
    events.push(buildCardStageEvent(currentBoard, card, now.columnId));
  }
  return events;
}

/** The set of column ids this mapping recognizes, for diagnostics/tests. */
export function knownColumnIds() {
  return [...DEFAULT_WORKFLOW_COLUMN_IDS];
}

export default {
  stageForColumn,
  eventTypeForColumn,
  indexBoardCards,
  buildCardStageEvent,
  severityForEventType,
  diffBoardTransitions,
  knownColumnIds,
};
