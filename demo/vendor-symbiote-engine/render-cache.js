import { createHash } from 'node:crypto';
import { rm, stat } from 'node:fs/promises';
import { isAbsolute, relative, resolve } from 'node:path';

const CLEANUP_DELETE_KEYS = [
  'deletePaths',
  'tempPaths',
  'scratchPaths',
  'frameSequencePaths',
  'audioChunkPaths',
  'transcriptScratchPaths',
  'browserProfilePaths',
  'workerTempPaths',
  'providerTempPaths',
];

const CLEANUP_RETAIN_KEYS = [
  'retainPaths',
  'durablePaths',
  'cachePaths',
  'artifactPaths',
  'proofPaths',
  'reusableCachePaths',
];

export const RENDER_CACHE_PROJECTION_VERSION = 2;

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function cloneJson(value) {
  if (value === undefined) return undefined;
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

function cleanString(value, fallback = '') {
  let text = String(value ?? fallback ?? '').replace(/\s+/g, ' ').trim();
  return text && text !== 'undefined' && text !== 'null' ? text : String(fallback || '').trim();
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (isObject(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function stableHash(value) {
  return createHash('sha256').update(stableJson(value)).digest('hex').slice(0, 32);
}

function compactObject(value) {
  if (Array.isArray(value)) {
    let compacted = value.map(compactObject).filter((item) => item !== undefined);
    return compacted.length ? compacted : undefined;
  }
  if (!isObject(value)) {
    if (value === undefined || value === null || value === '') return undefined;
    return value;
  }
  let entries = Object.entries(value)
    .map(([key, item]) => [key, compactObject(item)])
    .filter(([, item]) => item !== undefined);
  return entries.length ? Object.fromEntries(entries) : undefined;
}

function mergePlain(base = {}, value = {}) {
  return {
    ...(isObject(base) ? base : {}),
    ...(isObject(value) ? value : {}),
  };
}

function cleanCacheString(value, fallback = '') {
  return cleanString(value, fallback).slice(0, 512);
}

function sanitizeUrl(value) {
  let text = cleanString(value, '');
  if (!text) return '';
  let isAbsoluteUrl = /^[a-z][a-z0-9+.-]*:/i.test(text);
  try {
    let url = new URL(text, 'http://symbiote.local');
    url.hash = '';
    for (let key of [...url.searchParams.keys()]) {
      if (/^(token|auth|authorization|access_token|bearer|api[_-]?key|key|secret|password|sig|signature)$/i.test(key)) {
        url.searchParams.delete(key);
      }
    }
    if (!isAbsoluteUrl) return `${url.pathname}${url.search}`;
    return `${url.protocol}//${url.host}${url.pathname}${url.search}`;
  } catch {
    return text.replace(/#.*$/, '').replace(/([?&])(?:token|auth|authorization|access_token|bearer|api[_-]?key|key|secret|password|sig|signature)=[^&]*/ig, '$1');
  }
}

function routeFromUrl(value) {
  let text = sanitizeUrl(value);
  if (!text) return '';
  try {
    let url = new URL(text, 'http://symbiote.local');
    return `${url.pathname}${url.search}`;
  } catch {
    return text.startsWith('/') ? text : '';
  }
}

function pickSurface(seed) {
  let surface = isObject(seed.surface) ? seed.surface : {};
  let source = isObject(seed.source) ? seed.source : {};
  let url = sanitizeUrl(seed.url || source.url || surface.url);
  return compactObject({
    url,
    route: sanitizeUrl(seed.route || source.route || surface.route || routeFromUrl(url)),
    surface: seed.activeSurface || surface.surface || surface.id || seed.surfaceId,
    tab: seed.activeTab || surface.tab || surface.tabId || seed.tabId,
  });
}

function pickViewport(seed) {
  let viewport = isObject(seed.viewport) ? seed.viewport : {};
  let video = isObject(seed.video) ? seed.video : {};
  return compactObject({
    width: viewport.width || video.viewportWidth || video.width,
    height: viewport.height || video.viewportHeight || video.height,
    dpr: seed.dpr || seed.deviceScaleFactor || viewport.dpr || viewport.deviceScaleFactor,
  });
}

function pickOutput(seed) {
  let video = isObject(seed.video) ? seed.video : {};
  let output = isObject(seed.output) ? seed.output : {};
  return compactObject({
    width: output.width || video.outputWidth || video.width,
    height: output.height || video.outputHeight || video.height,
    fps: output.fps || video.fps,
  });
}

function normalizedProjectionVersion(options = {}) {
  let version = Math.round(Number(options.version || RENDER_CACHE_PROJECTION_VERSION));
  return Number.isFinite(version) && version > 0 ? version : RENDER_CACHE_PROJECTION_VERSION;
}

export function normalizeRenderSeed(seed = {}, defaults = {}) {
  let raw = isObject(seed) ? seed : {};
  let fallback = isObject(defaults) ? defaults : {};
  let render = mergePlain(fallback.render, raw.render);
  let timeline = mergePlain(fallback.timeline, raw.timeline);
  let app = mergePlain(fallback.app, raw.app);
  let data = mergePlain(fallback.data, raw.data);
  let viewport = mergePlain(fallback.viewport, raw.viewport);
  let source = mergePlain(fallback.source, raw.source);
  let surface = mergePlain(fallback.surface, raw.surface);
  let state = raw.state ?? fallback.state;
  let appBuild = cleanCacheString(
    raw.appBuild || raw.build || raw.version || app.build || app.version || fallback.appBuild || fallback.build || fallback.version,
  );
  let dataHash = cleanCacheString(
    raw.dataHash || data.hash || data.version || fallback.dataHash || fallback.data?.hash || fallback.data?.version,
  );
  if (!appBuild) throw new Error('render seed appBuild is required for cache identity');
  if (!dataHash) throw new Error('render seed dataHash is required for cache identity');

  return compactObject({
    providerId: cleanCacheString(raw.providerId || render.providerId || fallback.providerId),
    renderer: cleanCacheString(raw.renderer || render.renderer || raw.renderProvider?.id || fallback.renderer),
    source: pickSurface({
      ...fallback,
      ...raw,
      source,
      surface,
    }),
    theme: raw.theme ?? fallback.theme ?? render.theme,
    cascadeTheme: raw.cascadeTheme ?? fallback.cascadeTheme ?? render.cascadeTheme,
    viewport: pickViewport({
      ...fallback,
      ...raw,
      viewport,
      video: mergePlain(fallback.video, raw.video),
    }),
    dpr: raw.dpr || raw.deviceScaleFactor || viewport.dpr || viewport.deviceScaleFactor || fallback.dpr || fallback.deviceScaleFactor,
    output: pickOutput({
      ...fallback,
      ...raw,
      output: mergePlain(fallback.output, raw.output),
      video: mergePlain(fallback.video, raw.video),
    }),
    timelineHash: cleanCacheString(raw.timelineHash || timeline.hash || render.timelineHash || fallback.timelineHash),
    appBuild,
    dataHash,
    state,
    stateHash: cleanCacheString(raw.stateHash || (isObject(state) || Array.isArray(state) ? `sha256:${stableHash(state)}` : '')),
    capture: raw.capture ?? fallback.capture ?? render.capture,
    providerSettings: raw.providerSettings ?? fallback.providerSettings ?? render.providerSettings,
  }) || {};
}

export function createRenderSeedProjection(seed = {}, extra = {}, options = {}) {
  return compactObject({
    version: normalizedProjectionVersion(options),
    ...normalizeRenderSeed(seed, options.defaults || {}),
    extra,
  }) || { version: normalizedProjectionVersion(options) };
}

function arrayFrom(value) {
  if (value === undefined || value === null || value === '') return [];
  return Array.isArray(value) ? value : [value];
}

function collectCleanupPaths(cleanup, keys) {
  if (!isObject(cleanup)) return [];
  let paths = [];
  for (let key of keys) {
    for (let item of arrayFrom(cleanup[key])) {
      let text = cleanString(item, '');
      if (text) paths.push(text);
    }
  }
  return paths;
}

function cleanupSources(record) {
  let input = isObject(record?.input) ? record.input : {};
  let result = isObject(record?.result) ? record.result : {};
  return [
    input.cleanup,
    input.render?.cleanup,
    input.audio?.cleanup,
    input.whisper?.cleanup,
    input.frames?.cleanup,
    result.cleanup,
  ].filter(isObject);
}

function retainResultPaths(record) {
  let result = isObject(record?.result) ? record.result : {};
  return [
    result.path,
    result.outputPath,
    result.manifestPath,
    result.proofPath,
    result.vttPath,
    result.captionsPath,
    result.metadataPath,
  ].map((path) => cleanString(path, '')).filter(Boolean);
}

function normalizeRoot(root) {
  let text = cleanString(root, '');
  if (!text) throw new Error('render retention cleanup root is required');
  return resolve(text);
}

function pathInsideRoot(path, root) {
  let rel = relative(root, path);
  return rel === '' || Boolean(rel) && !rel.startsWith('..') && !isAbsolute(rel);
}

function pathContains(parent, child) {
  let rel = relative(parent, child);
  return rel === '' || Boolean(rel) && !rel.startsWith('..') && !isAbsolute(rel);
}

function resolveCleanupPath(path, root) {
  let text = cleanString(path, '');
  if (!text || /^[a-z]+:\/\//i.test(text) || text.startsWith('file:')) return null;
  return resolve(isAbsolute(text) ? text : resolve(root, text));
}

function resolvedPathSet(paths = []) {
  return new Set(arrayFrom(paths)
    .map((path) => cleanString(path, ''))
    .filter(Boolean)
    .map((path) => resolve(path)));
}

export function didCleanupRemovePaths(cleanup = {}, paths = []) {
  let targetPaths = resolvedPathSet(paths);
  if (!targetPaths.size || !isObject(cleanup) || !Array.isArray(cleanup.removed)) return false;
  return cleanup.removed.some((item) => {
    let path = isObject(item) ? item.resolvedPath || item.path : item;
    let text = cleanString(path, '');
    return text ? targetPaths.has(resolve(text)) : false;
  });
}

export function buildRenderCleanupProofPatch(options = {}) {
  let frameScratchPaths = arrayFrom(options.frameScratchPaths);
  let retainedFramePaths = arrayFrom(options.retainedFramePaths);
  let scratchPaths = frameScratchPaths.filter((path) => !retainedFramePaths.includes(path));
  return {
    frameSequenceCleaned: scratchPaths.length > 0 && didCleanupRemovePaths(options.cleanup, scratchPaths),
    cleanup: options.cleanup,
  };
}

async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if (error?.code === 'ENOENT') return false;
    throw error;
  }
}

export function createRenderFrameCacheKey(seed = {}, extra = {}, options = {}) {
  return `frame:${stableHash(createRenderSeedProjection(seed, extra, options))}`;
}

export function createRenderOutputCacheKey(seed = {}, extra = {}, options = {}) {
  return `render:${stableHash(createRenderSeedProjection(seed, extra, options))}`;
}

function segmentRangeBounds(range, path) {
  let source = isObject(range) ? range : {};
  let start = Number(source.start);
  let end = Number(source.end);
  if (!Number.isInteger(start) || start < 0) throw new Error(`${path}.start must be a non-negative integer`);
  if (!Number.isInteger(end) || end < start) throw new Error(`${path}.end must be an integer >= ${path}.start`);
  return { start, end };
}

export function createRenderSegmentCacheKey(seed = {}, segmentRange = {}, extra = {}, options = {}) {
  let { start, end } = segmentRangeBounds(segmentRange, 'segmentRange');
  return `segment:${stableHash(createRenderSeedProjection(seed, extra, options))}:${start}-${end}`;
}

export function invalidateRenderSegmentRanges(segments = [], changedRange = {}) {
  let { start: changedStart, end: changedEnd } = segmentRangeBounds(changedRange, 'changedRange');
  let invalidated = [];
  let retained = [];
  for (let segment of Array.isArray(segments) ? segments : []) {
    let id = cleanString(segment?.id, '');
    if (!id) throw new Error('render segment requires id for range invalidation');
    let { start, end } = segmentRangeBounds(segment?.frameRange, `segment ${id} frameRange`);
    if (start <= changedEnd && end >= changedStart) invalidated.push(id);
    else retained.push(id);
  }
  return { invalidated, retained };
}

export function createMemoryFrameCacheStore(options = {}) {
  let entries = options.entries instanceof Map ? options.entries : new Map();
  return {
    async put(key, value, metadata = {}) {
      let cacheKey = cleanString(key, '');
      if (!cacheKey) throw new Error('frame cache key is required');
      let now = new Date().toISOString();
      let existing = entries.get(cacheKey);
      let entry = {
        key: cacheKey,
        value: cloneJson(value),
        metadata: cloneJson(metadata),
        createdAt: existing?.createdAt || now,
        updatedAt: now,
        hits: existing?.hits || 0,
      };
      entries.set(cacheKey, entry);
      return cloneJson(entry);
    },
    async get(key) {
      let cacheKey = cleanString(key, '');
      let entry = entries.get(cacheKey);
      if (!entry) return null;
      entry.hits += 1;
      entry.updatedAt = new Date().toISOString();
      return cloneJson(entry);
    },
    async has(key) {
      return entries.has(cleanString(key, ''));
    },
    async delete(key) {
      return entries.delete(cleanString(key, ''));
    },
    list() {
      return [...entries.values()].map(cloneJson);
    },
    clear() {
      entries.clear();
    },
  };
}

export function createRenderRetentionCleanup(options = {}) {
  let root = normalizeRoot(options.root);
  let allowOutsideRoot = options.allowOutsideRoot === true;
  let retainResultPath = options.retainResultPath !== false;

  return async function renderRetentionCleanup(record = {}, context = {}) {
    let sources = cleanupSources(record);
    let deletePaths = new Set();
    let retainPaths = new Set();

    for (let source of sources) {
      for (let path of collectCleanupPaths(source, CLEANUP_DELETE_KEYS)) deletePaths.add(path);
      for (let path of collectCleanupPaths(source, CLEANUP_RETAIN_KEYS)) retainPaths.add(path);
    }
    if (retainResultPath) {
      for (let path of retainResultPaths(record)) retainPaths.add(path);
    }

    let retained = [...retainPaths]
      .map((path) => resolveCleanupPath(path, root))
      .filter(Boolean)
      .filter((path) => allowOutsideRoot || pathInsideRoot(path, root));
    let removed = [];
    let skipped = [];
    let errors = [];

    for (let originalPath of deletePaths) {
      let path = resolveCleanupPath(originalPath, root);
      if (!path) {
        skipped.push({ path: originalPath, reason: 'invalid-path' });
        continue;
      }
      if (!allowOutsideRoot && !pathInsideRoot(path, root)) {
        skipped.push({ path: originalPath, resolvedPath: path, reason: 'outside-root' });
        continue;
      }
      if (path === root) {
        skipped.push({ path: originalPath, resolvedPath: path, reason: 'root' });
        continue;
      }
      if (retained.some((retainedPath) => pathContains(path, retainedPath) || pathContains(retainedPath, path))) {
        skipped.push({ path: originalPath, resolvedPath: path, reason: 'retained' });
        continue;
      }
      try {
        if (!await exists(path)) {
          skipped.push({ path: originalPath, resolvedPath: path, reason: 'missing' });
          continue;
        }
        await rm(path, { recursive: true, force: true });
        removed.push({ path: originalPath, resolvedPath: path });
      } catch (error) {
        errors.push({
          path: originalPath,
          resolvedPath: path,
          message: error?.message || String(error),
          code: error?.code,
        });
      }
    }

    return {
      ok: errors.length === 0,
      reason: cleanString(context.reason, ''),
      root,
      removed,
      retained: retained.map((path) => ({ path })),
      skipped,
      errors,
    };
  };
}
