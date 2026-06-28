/**
 * board-notifier.js — portal wiring that turns workflow-board transition events
 * into notifications.
 *
 * The WorkflowBoard panel dispatches a bubbling, composed `workflow-board-loaded`
 * event after every load (initial, realtime ws/state sync, and post-transition
 * refresh) carrying the normalized board projection. This module listens once at
 * the document level, diffs each board against the previous snapshot for that
 * board id, and feeds the resulting "card entered stage" events into the
 * symbiote-ui NotificationWidget, which owns the queue, debounce, sound, and
 * narration (and its own config gate). All reusable behavior stays in
 * symbiote-ui; only the board→event subscription + mapping lives here.
 */

import { diffBoardTransitions } from '../services/board-notification-source.js';

const NOTIFICATION_WIDGET_TAG = 'notification-widget';

/**
 * Stateful diff tracker, independent of the DOM. Keeps the last seen board per
 * board id and turns each new board into the transition events to notify. The
 * first board for an id seeds the baseline silently (no page-load narration).
 */
export function createBoardNotificationTracker() {
  let lastByBoard = new Map();

  return {
    /**
     * Record a board projection and return the notification events for cards
     * that entered a new column since the previous projection of the same board.
     * @param {object} board normalized workflow board projection
     * @returns {Array<object>} events for NotificationWidget.notify
     */
    observe(board) {
      if (!board) return [];
      let boardId = String(board.boardId || board.id || '').trim() || 'board';
      let previous = lastByBoard.get(boardId) || null;
      lastByBoard.set(boardId, board);
      return diffBoardTransitions(previous, board);
    },

    /** Forget the baseline for a board id (or all boards). */
    reset(boardId) {
      if (boardId === undefined) lastByBoard.clear();
      else lastByBoard.delete(String(boardId));
    },

    get size() {
      return lastByBoard.size;
    },
  };
}

function resolveWidget(doc) {
  if (!doc) return null;
  return doc.querySelector(NOTIFICATION_WIDGET_TAG);
}

/**
 * Subscribe to board-loaded events and drive the notification widget.
 *
 * @param {object} [options]
 * @param {Document} [options.documentRef] document to listen on (default global).
 * @param {() => (Element|null)} [options.getWidget] resolver for the widget element.
 * @returns {() => void} unsubscribe
 */
export function installBoardNotifier(options = {}) {
  let doc = options.documentRef || (typeof document !== 'undefined' ? document : null);
  if (!doc?.addEventListener) return () => {};

  let tracker = createBoardNotificationTracker();
  let getWidget = options.getWidget || (() => resolveWidget(doc));

  let onBoardLoaded = (event) => {
    let board = event?.detail?.board;
    if (!board) return;
    let events = tracker.observe(board);
    if (events.length === 0) return;
    let widget = getWidget();
    if (!widget || typeof widget.notify !== 'function') return;
    for (let item of events) widget.notify(item);
  };

  doc.addEventListener('workflow-board-loaded', onBoardLoaded);
  return () => doc.removeEventListener('workflow-board-loaded', onBoardLoaded);
}

/**
 * Ensure a single <notification-widget> is mounted on the document body, mirror
 * the way other global portal widgets (quick-open, follow-ribbon) are surfaced.
 * Safe to call repeatedly; returns the existing instance if already present.
 *
 * @param {object} [options]
 * @param {Document} [options.documentRef]
 * @param {string} [options.storageKey] persisted-config storage key.
 * @param {string} [options.locale] active portal locale, so narration + the
 *   widget's settings UI follow the interface language rather than the browser.
 * @returns {Element|null}
 */
export function ensureNotificationWidget(options = {}) {
  let doc = options.documentRef || (typeof document !== 'undefined' ? document : null);
  if (!doc?.body) return null;
  let widget = doc.querySelector(NOTIFICATION_WIDGET_TAG);
  if (!widget) {
    widget = doc.createElement(NOTIFICATION_WIDGET_TAG);
    if (options.storageKey) widget.setAttribute('storage-key', options.storageKey);
    doc.body.appendChild(widget);
  }
  if (options.locale) widget.setAttribute('locale', options.locale);
  return widget;
}

export default installBoardNotifier;
