import { stateSync } from '../state-sync.js';

export function readJsonCache(key) {
  if (typeof localStorage === 'undefined') return undefined;
  let raw = localStorage.getItem(key);
  if (raw == null) return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

export function writeJsonCache(key, value) {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(key, JSON.stringify(value));
}

export function readStringCache(key) {
  if (typeof localStorage === 'undefined') return undefined;
  return localStorage.getItem(key) ?? undefined;
}

export function writeStringCache(key, value) {
  if (typeof localStorage === 'undefined') return;
  if (value == null) localStorage.removeItem(key);
  else localStorage.setItem(key, String(value));
}

export function readUiValue(path, cacheKey, fallback) {
  let serverValue = stateSync.get(path);
  if (serverValue !== undefined) return serverValue;
  if (cacheKey) {
    let cached = readJsonCache(cacheKey);
    if (cached !== undefined) return cached;
    let raw = readStringCache(cacheKey);
    if (raw !== undefined) return raw;
  }
  return fallback;
}

export function persistUiValue(path, value, cacheKey) {
  if (cacheKey) writeJsonCache(cacheKey, value);
  stateSync.commit([{ op: 'set', path, value }]);
  fetch('/api/ui', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path, value }),
  }).catch(() => {});
}

export function layoutPathForKey(storageKey) {
  return `layouts/${encodeURIComponent(storageKey)}`;
}

export function readLayout(storageKey) {
  return readUiValue(layoutPathForKey(storageKey), storageKey, undefined);
}

export function persistLayout(storageKey, layoutTree) {
  persistUiValue(layoutPathForKey(storageKey), layoutTree, storageKey);
}
