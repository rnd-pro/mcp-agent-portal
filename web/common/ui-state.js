import { readJsonCache, writeJsonCache, readStringCache, writeStringCache } from 'symbiote-node/core';
import { stateSync } from '../state-sync.js';

export { readJsonCache, writeJsonCache, readStringCache, writeStringCache };

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
