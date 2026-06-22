function asText(value, fallback = '') {
  let out = String(value ?? '').trim();
  return out || fallback;
}

export function latestRun(card = null) {
  let runs = Array.isArray(card?.runs) ? card.runs : [];
  let candidate = card?.run && (card.run.id || card.run.status) ? card.run : null;
  let newest = runs
    .slice()
    .sort((a, b) => (Date.parse(b.updatedAt || b.startedAt || '') || 0) - (Date.parse(a.updatedAt || a.startedAt || '') || 0))[0];
  return candidate || newest || null;
}

export function agentName(card = null, run = null) {
  return asText(
    card?.assignedAgent
    || card?.owner
    || run?.leaseOwner
    || card?.lease?.leaseOwner,
  );
}

export function formatDuration(run = null) {
  let start = Date.parse(run?.startedAt || '');
  if (!Number.isFinite(start)) return '';
  let end = Date.parse(run?.completedAt || '');
  let ms = Math.max(0, (Number.isFinite(end) ? end : Date.now()) - start);
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
