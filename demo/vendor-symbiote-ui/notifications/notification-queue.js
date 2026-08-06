/**
 * Notification queue + debouncer — pure, deterministic, Node-safe.
 *
 * Two cooperating primitives:
 * - `createNotificationQueue` retains a deduplicated, severity-ordered list of
 *   normalized items for display (the seen-set dedup pattern from the crypto-mcp
 *   NotificationCenter).
 * - `createNotificationDebouncer` coalesces bursts of same-key events inside a
 *   configurable window and rate-limits emissions so rapid same-type events
 *   collapse into one — no constant beeping.
 *
 * Time is always injected (`now` in ms). Nothing here reads the wall clock,
 * touches the DOM, or schedules real timers, so it runs in Node and tests
 * deterministically against rapid-event spam.
 */

export const SEVERITY_RANK = Object.freeze({
  critical: 4,
  error: 3,
  warning: 2,
  warn: 2,
  info: 1,
  success: 1,
  debug: 0,
});

export function severityRank(severity) {
  return SEVERITY_RANK[String(severity ?? 'info').toLowerCase()] ?? 1;
}

let cleanSymbol = (value) => String(value ?? '').trim().toUpperCase();

let fallbackId = (item, index) =>
  `${item?.type ?? 'notification'}:${item?.ts ?? index}:${index}`;

/**
 * Normalize an arbitrary event into a stable notification shape.
 * @param {object} item
 * @param {number} [index]
 * @returns {{id:string,type:string,severity:string,rank:number,symbol:string,message:string,ts:number}}
 */
export function normalizeNotificationItem(item = {}, index = 0) {
  let type = String(item.type ?? 'notification').trim() || 'notification';
  let severity = String(item.severity ?? 'info').trim().toLowerCase() || 'info';
  let ts = Number(item.ts);
  return {
    id: String(item.id ?? fallbackId(item, index)),
    type,
    severity,
    rank: severityRank(severity),
    symbol: cleanSymbol(item.symbol),
    message: String(item.message ?? item.type ?? '').trim(),
    ts: Number.isFinite(ts) ? ts : index,
  };
}

/** Default coalescing key: collapse by event type. */
export function notificationKey(item) {
  return String(item?.type ?? 'notification');
}

/**
 * Retained, deduplicated display queue. Pure state machine — no timers.
 * @param {object} [options]
 * @param {number} [options.limit] Max retained items (newest kept).
 */
export function createNotificationQueue(options = {}) {
  let limit = Number(options.limit);
  limit = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : 50;
  let seen = new Set();
  let items = [];
  let seq = 0;

  let prune = () => {
    if (items.length <= limit) return;
    let removed = items.splice(0, items.length - limit);
    for (let item of removed) seen.delete(item.id);
  };

  return {
    /**
     * Push one or many raw events. Returns the items that were newly accepted
     * (i.e. not already seen) in arrival order.
     */
    push(input) {
      let batch = Array.isArray(input) ? input : [input];
      let accepted = [];
      for (let raw of batch) {
        let item = normalizeNotificationItem(raw, seq++);
        if (seen.has(item.id)) continue;
        seen.add(item.id);
        items.push(item);
        accepted.push(item);
      }
      prune();
      return accepted;
    },
    /** Current retained items, newest last. */
    list() {
      return items.slice();
    },
    /** Items sorted by severity (highest first), then by timestamp. */
    bySeverity() {
      return items
        .slice()
        .sort((a, b) => b.rank - a.rank || a.ts - b.ts);
    },
    has(id) {
      return seen.has(String(id));
    },
    get size() {
      return items.length;
    },
    clear() {
      items = [];
      seen.clear();
    },
  };
}

/**
 * Debouncer / coalescer for notification audio + desktop emissions.
 *
 * Behavior:
 * - Same-key events arriving inside `debounceMs` of each other are merged into a
 *   single pending notification carrying the latest payload and a `count`.
 * - A bucket flushes once the stream goes quiet for `debounceMs` (trailing
 *   debounce) OR once `maxWaitMs` has elapsed since the first event (so a
 *   never-ending stream still flushes periodically instead of starving).
 * - `minIntervalMs` rate-limits a given key: after a flush, that key cannot
 *   flush again until the interval passes, collapsing rapid bursts into one
 *   emission.
 *
 * Deterministic: caller drives time via `now`. Use `nextDueAt` to schedule a
 * real timer in product code; the core stays pure.
 *
 * @param {object} [options]
 * @param {number} [options.debounceMs] Quiet period before a bucket flushes.
 * @param {number} [options.maxWaitMs] Hard cap on coalescing a continuous stream.
 * @param {number} [options.minIntervalMs] Min gap between flushes of the same key.
 * @param {(item:object)=>string} [options.keyOf] Coalescing key selector.
 * @param {boolean} [options.dedup] Drop events whose id was already seen.
 */
export function createNotificationDebouncer(options = {}) {
  let debounceMs = toPositive(options.debounceMs, 250);
  let maxWaitMs = toPositive(options.maxWaitMs, Math.max(debounceMs * 4, 1000));
  let minIntervalMs = toNonNegative(options.minIntervalMs, debounceMs);
  let keyOf = typeof options.keyOf === 'function' ? options.keyOf : notificationKey;
  let dedup = options.dedup !== false;

  let buckets = new Map();
  let lastEmittedAt = new Map();
  let seen = new Set();
  let seq = 0;

  let bucketReady = (bucket, now) => {
    let quiet = now - bucket.lastSeenAt >= debounceMs;
    let capped = now - bucket.firstSeenAt >= maxWaitMs;
    if (!quiet && !capped) return false;
    let last = lastEmittedAt.get(bucket.key);
    if (last === undefined) return true;
    return now - last >= minIntervalMs;
  };

  let bucketDueAt = (bucket) => {
    let debounceDue = bucket.lastSeenAt + debounceMs;
    let cappedDue = bucket.firstSeenAt + maxWaitMs;
    let windowDue = Math.min(debounceDue, cappedDue);
    let last = lastEmittedAt.get(bucket.key);
    let rateDue = last === undefined ? windowDue : Math.max(windowDue, last + minIntervalMs);
    return rateDue;
  };

  return {
    /**
     * Record one raw event. Returns `true` if it was accepted into a bucket,
     * `false` if it was dropped as a duplicate.
     */
    push(raw, now) {
      let at = Number(now);
      let stamp = Number.isFinite(at) ? at : 0;
      let item = normalizeNotificationItem(raw, seq++);
      if (dedup) {
        if (seen.has(item.id)) return false;
        seen.add(item.id);
      }
      let key = String(keyOf(item));
      let bucket = buckets.get(key);
      if (!bucket) {
        buckets.set(key, {
          key,
          item,
          count: 1,
          firstSeenAt: stamp,
          lastSeenAt: stamp,
        });
      } else {
        bucket.item = item;
        bucket.count += 1;
        bucket.lastSeenAt = stamp;
      }
      return true;
    },

    /**
     * Pull every bucket that is ready at `now`. Each result is the latest item
     * with `count`, `coalesced`, and window timestamps. Removes flushed buckets
     * and records their emission time for rate-limiting.
     */
    flush(now) {
      let at = Number(now);
      let stamp = Number.isFinite(at) ? at : 0;
      let out = [];
      for (let bucket of buckets.values()) {
        if (!bucketReady(bucket, stamp)) continue;
        out.push({
          ...bucket.item,
          key: bucket.key,
          count: bucket.count,
          coalesced: bucket.count > 1,
          firstSeenAt: bucket.firstSeenAt,
          lastSeenAt: bucket.lastSeenAt,
        });
      }
      for (let result of out) {
        buckets.delete(result.key);
        lastEmittedAt.set(result.key, stamp);
      }
      return out;
    },

    /**
     * Earliest timestamp at which any pending bucket will be ready, or `null`
     * when nothing is pending. Product code schedules a single timer to this.
     */
    nextDueAt() {
      let due = null;
      for (let bucket of buckets.values()) {
        let at = bucketDueAt(bucket);
        if (due === null || at < due) due = at;
      }
      return due;
    },

    get pending() {
      return buckets.size;
    },

    reset() {
      buckets.clear();
      lastEmittedAt.clear();
      seen.clear();
    },
  };
}

function toPositive(value, fallback) {
  let n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function toNonNegative(value, fallback) {
  let n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

export default {
  SEVERITY_RANK,
  severityRank,
  normalizeNotificationItem,
  notificationKey,
  createNotificationQueue,
  createNotificationDebouncer,
};
