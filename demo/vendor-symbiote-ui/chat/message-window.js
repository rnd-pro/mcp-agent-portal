/**
 * Message-window pagination math.
 *
 * Pure helpers for tracking a sliding window over a chat's persisted message
 * list: how many items are loaded, where the window sits inside the full
 * history, and whether older/newer items remain to be fetched. The companion
 * page contract describes one fetched slice of history.
 *
 * Pure and dependency-free — no DOM, no fetch, no transport. Network fetching
 * (`/api/chats/messages/page`) and the rendering side-effects
 * (`workspace.prependMessages`, DOM transcript updates) stay portal-side; only
 * the boundary arithmetic lives here.
 *
 * Window shape: `{ startIndex, count, totalItems, hasOlder, hasNewer, start, end }`
 *   - `startIndex` / `start` — index of the first loaded item within full history.
 *   - `count` — number of loaded items in the window.
 *   - `end` — exclusive end index (`start + count`).
 *   - `totalItems` — size of the full history the window is a slice of.
 *   - `hasOlder` — older items exist before `start` and can be fetched.
 *   - `hasNewer` — newer items exist after `end` and can be fetched.
 *
 * Page shape (one fetched slice): `{ start, end, total, hasBefore, hasAfter, messages }`
 *   - `start` — index of the slice's first message in full history.
 *   - `end` — exclusive end index of the slice.
 *   - `total` — total message count in full history.
 *   - `hasBefore` — older messages exist before this slice.
 *   - `hasAfter` — newer messages exist after this slice.
 *   - `messages` — the message objects in the slice (used only to infer `end`
 *     when it is not provided).
 *
 * @module symbiote-ui/chat/message-window
 */

function toFiniteOr(value, fallback) {
  return Number.isFinite(value) ? value : fallback;
}

/**
 * Create an empty message window.
 *
 * @returns {{startIndex: number, count: number, totalItems: number, hasOlder: boolean, hasNewer: boolean, start: number, end: number}}
 *   A zero-sized window with no older or newer items.
 */
export function createMessageWindow() {
  return {
    startIndex: 0,
    count: 0,
    totalItems: 0,
    hasOlder: false,
    hasNewer: false,
    start: 0,
    end: 0,
  };
}

/**
 * Build a window from a fetched page slice.
 *
 * Mirrors the portal's `_messageWindowFromPage`: tolerates a partial page by
 * inferring `end` from the message count and `total` from `end`.
 *
 * @param {{start?: number, end?: number, total?: number, hasBefore?: boolean, hasAfter?: boolean, messages?: Array<*>}} [page]
 *   A fetched history slice.
 * @returns {{startIndex: number, count: number, totalItems: number, hasOlder: boolean, hasNewer: boolean, start: number, end: number}}
 *   The window describing the slice.
 */
export function messageWindowFromPage(page = {}) {
  let messageCount = Array.isArray(page.messages) ? page.messages.length : 0;
  let start = toFiniteOr(page.start, 0);
  let end = toFiniteOr(page.end, start + messageCount);
  let total = toFiniteOr(page.total, end);
  return {
    startIndex: start,
    count: Math.max(0, end - start),
    totalItems: total,
    hasOlder: Boolean(page.hasBefore),
    hasNewer: Boolean(page.hasAfter),
    start,
    end,
  };
}

/**
 * Extend a window by appending `count` newly persisted items at its tail.
 *
 * Mirrors the portal's `_extendMessageWindow`: grows `count`, `totalItems`, and
 * `end`, and clears `hasNewer` since the new items are now the latest. Returns
 * the original window unchanged when `count <= 0` or `window` is missing.
 *
 * @param {Object|null} window - The window to extend.
 * @param {number} [count=0] - Number of items appended at the tail.
 * @returns {Object} A new window with the appended items accounted for.
 */
export function extendMessageWindow(window, count = 0) {
  if (!window || !(count > 0)) return window;
  let start = toFiniteOr(window.startIndex, toFiniteOr(window.start, 0));
  let currentCount = toFiniteOr(window.count, 0);
  let end = toFiniteOr(window.end, start + currentCount);
  let total = toFiniteOr(window.totalItems, end);
  return {
    ...window,
    count: currentCount + count,
    totalItems: total + count,
    end: end + count,
    hasNewer: false,
  };
}

/**
 * Intersect two page slices, returning the overlapping index range.
 *
 * Useful when reconciling a freshly fetched page against the currently loaded
 * window to detect duplicate or contiguous ranges before prepending.
 *
 * @param {{start?: number, end?: number, messages?: Array<*>}} a - First slice.
 * @param {{start?: number, end?: number, messages?: Array<*>}} b - Second slice.
 * @returns {{start: number, end: number, count: number, overlaps: boolean}}
 *   The overlap range; `overlaps` is false and `count` is 0 when disjoint.
 */
export function intersectPages(a = {}, b = {}) {
  let aStart = toFiniteOr(a.start, 0);
  let aEnd = toFiniteOr(a.end, aStart + (Array.isArray(a.messages) ? a.messages.length : 0));
  let bStart = toFiniteOr(b.start, 0);
  let bEnd = toFiniteOr(b.end, bStart + (Array.isArray(b.messages) ? b.messages.length : 0));
  let start = Math.max(aStart, bStart);
  let end = Math.min(aEnd, bEnd);
  let count = Math.max(0, end - start);
  return { start, end, count, overlaps: count > 0 };
}

/**
 * Check a window's boundaries for internal consistency.
 *
 * Verifies the numeric fields are finite and non-negative, that `end` matches
 * `start + count`, that the window fits within `totalItems`, and that the
 * `hasOlder`/`hasNewer` flags agree with the window's position in history.
 *
 * @param {Object} window - The window to validate.
 * @returns {{valid: boolean, errors: string[]}} Validation result with one
 *   message per failed invariant.
 */
export function validateBoundaries(window) {
  let errors = [];
  if (!window || typeof window !== 'object') {
    return { valid: false, errors: ['window must be an object'] };
  }

  let start = toFiniteOr(window.startIndex, toFiniteOr(window.start, NaN));
  let count = toFiniteOr(window.count, NaN);
  let total = toFiniteOr(window.totalItems, NaN);
  let end = toFiniteOr(window.end, Number.isFinite(start) && Number.isFinite(count) ? start + count : NaN);

  if (!Number.isFinite(start)) errors.push('start index must be finite');
  if (!Number.isFinite(count)) errors.push('count must be finite');
  if (!Number.isFinite(total)) errors.push('totalItems must be finite');

  if (Number.isFinite(start) && start < 0) errors.push('start index must be non-negative');
  if (Number.isFinite(count) && count < 0) errors.push('count must be non-negative');
  if (Number.isFinite(total) && total < 0) errors.push('totalItems must be non-negative');

  if (Number.isFinite(start) && Number.isFinite(count) && Number.isFinite(end) && end !== start + count) {
    errors.push('end must equal start + count');
  }
  if (Number.isFinite(end) && Number.isFinite(total) && end > total) {
    errors.push('end must not exceed totalItems');
  }
  if (Number.isFinite(start) && start > 0 && window.hasOlder === false && Number.isFinite(count) && count >= total) {
    errors.push('hasOlder is false but window does not start at history head');
  }
  if (Number.isFinite(end) && Number.isFinite(total) && end < total && window.hasNewer === false) {
    errors.push('hasNewer is false but newer items remain after end');
  }

  return { valid: errors.length === 0, errors };
}
