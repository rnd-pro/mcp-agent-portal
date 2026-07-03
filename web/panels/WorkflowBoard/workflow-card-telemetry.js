function asText(value, fallback = '') {
  let out = String(value ?? '').trim();
  return out || fallback;
}

function runRecency(run) {
  return Date.parse(run?.updatedAt || run?.startedAt || '') || 0;
}

export function latestRun(card = null) {
  let pool = Array.isArray(card?.runs) ? card.runs.slice() : [];
  // `card.run` is the projection's singular run, which the normalizer fills from runs[0] (array order,
  // not recency) when the projection omits it. Fold it into the pool and pick the newest by timestamp
  // so a stale first run never shadows the actual latest (e.g. an old `paused` hiding a live `running`).
  if (card?.run && (card.run.id || card.run.status)) pool.push(card.run);
  if (!pool.length) return null;
  return pool.sort((a, b) => runRecency(b) - runRecency(a))[0];
}

function cardLifecycle(card = null) {
  return asText(card?.lifecycle || card?.raw?.lifecycle).toLowerCase();
}

// Run statuses that mean an agent is actively working the card RIGHT NOW. Note `recovery_detected` is
// deliberately excluded: it is a detection marker (an interrupted run flagged for re-drive), not live
// work — a card can sit in recovery_detected for hours after its lease expired, and a perpetual spinner
// on a stuck card is misleading. Genuine recovery re-runs hold a fresh lease, so leaseIsLive() covers
// the actively-recovering case. Single source of truth for both the board card and the inspector.
export const ACTIVE_RUN_STATUSES = new Set([
  'requested', 'running', 'recovering', 'started', 'active', 'streaming',
]);

function leaseIsLive(card = null) {
  let expires = Date.parse(card?.lease?.leaseExpiresAt || '');
  return Number.isFinite(expires) && expires > Date.now();
}

// A card is active when its newest run reports an active status, OR it holds an unexpired lease (a run
// is in flight regardless of the status token), OR its lifecycle is mid-execution. `queued` is excluded:
// a queued card is waiting in line, not working, so it gets a status label but no spinner.
export function isCardActive(card = null) {
  if (ACTIVE_RUN_STATUSES.has(asText(latestRun(card)?.status).toLowerCase())) return true;
  if (leaseIsLive(card)) return true;
  let lifecycle = cardLifecycle(card);
  return lifecycle === 'running' || lifecycle === 'admitting';
}

// The column already conveys the pipeline stage (Ready / In Progress / Quality Audit / Done / ...), so
// the card chip shows only the transient activity the column cannot: actively working, or queued to
// start. The historical run status is deliberately NOT surfaced here — it contradicts the column (a
// "Completed" run sitting in Ready awaiting rework reads as nonsense). Returns '' when the column says
// it all, so no chip is drawn.
export function effectiveStatus(card = null) {
  if (isCardActive(card)) return 'running';
  return cardLifecycle(card) === 'queued' ? 'queued' : '';
}

export function formatStatusLabel(value) {
  let key = asText(value);
  if (!key) return '';
  return key
    .split(/[-_:/]+/)
    .filter(Boolean)
    .map(part => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(' ');
}

export function agentName(card = null, run = null) {
  return asText(
    card?.assignedAgent
    || card?.owner
    || run?.leaseOwner
    || card?.lease?.leaseOwner,
  );
}

// Duration is only meaningful for a run that is either genuinely finished (has both a start and an end
// timestamp) or genuinely in progress right now (has a start, no end, AND a live/active status). Anything
// else — no start, or an end-less run sitting in a terminal/detection state like recovery_detected — has
// no honest duration to show: ticking Date.now() - startedAt against a corpse produces fabricated numbers
// like "254h 45m" on a run that died days ago. Callers render '' as the neutral "—" fallback.
export function formatDuration(run = null) {
  let start = Date.parse(run?.startedAt || '');
  if (!Number.isFinite(start)) return '';
  let end = Date.parse(run?.completedAt || '');
  let ms;
  if (Number.isFinite(end)) {
    ms = Math.max(0, end - start);
  } else if (ACTIVE_RUN_STATUSES.has(asText(run?.status).toLowerCase())) {
    ms = Math.max(0, Date.now() - start);
  } else {
    return '';
  }
  let s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  let m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  let h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

export function formatTokens(value) {
  if (value === null || value === undefined || value === '') return '';
  let n = Number(value);
  if (!Number.isFinite(n) || n < 0) return '';
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0)}k`;
  return `${(n / 1_000_000).toFixed(1)}M`;
}

export function relativeTime(iso) {
  let t = Date.parse(iso || '');
  if (!Number.isFinite(t)) return '';
  let s = Math.max(0, Math.round((Date.now() - t) / 1000));
  if (s < 60) return `${s}s`;
  let m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  let h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}
