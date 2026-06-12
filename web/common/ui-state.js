import {
  readJsonCache as readJsonCacheSource,
  writeJsonCache as writeJsonCacheSource,
  readStringCache as readStringCacheSource,
  writeStringCache as writeStringCacheSource,
} from 'symbiote-ui/core';
import { stateSync } from '../state-sync.js';

export function readJsonCache(key) {
  try {
    return readJsonCacheSource(key);
  } catch {
    return undefined;
  }
}

export function writeJsonCache(key, value) {
  try {
    writeJsonCacheSource(key, value);
  } catch {}
}

export function readStringCache(key) {
  try {
    return readStringCacheSource(key);
  } catch {
    return undefined;
  }
}

export function writeStringCache(key, value) {
  try {
    writeStringCacheSource(key, value);
  } catch {}
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
