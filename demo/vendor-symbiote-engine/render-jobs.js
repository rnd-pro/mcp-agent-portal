import { normalizeRenderJob } from './contracts/render-provider.js';

const TERMINAL_STATUSES = new Set(['succeeded', 'failed', 'canceled']);
const DEFAULT_EVENT_HISTORY_LIMIT = 80;

function cloneJson(value) {
  if (value === undefined) return undefined;
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
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
  let text = stableJson(value);
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

function cleanString(value, fallback = '') {
  let text = String(value ?? fallback ?? '').replace(/\s+/g, ' ').trim();
  return text && text !== 'undefined' && text !== 'null' ? text : String(fallback || '').trim();
}

function timestamp() {
  return new Date().toISOString();
}

function safeId(value, fallback = 'render-job') {
  return cleanString(value, fallback).replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 80) || fallback;
}

function timeoutError(timeoutMs) {
  let error = new Error(`render job timed out after ${timeoutMs}ms`);
  error.code = 'TIMEOUT';
  return error;
}

function errorFromAbort(signal) {
  let reason = signal?.reason;
  if (reason instanceof Error) return reason;
  let error = new Error(cleanString(reason, 'render job canceled') || 'render job canceled');
  error.name = 'AbortError';
  error.code = 'ABORT_ERR';
  return error;
}

function renderErrorRecord(error) {
  let record = { message: error?.message || String(error), code: error?.code };
  if (isObject(error?.proof)) {
    let proof = cloneJson(error.proof);
    delete proof.paths;
    record.proof = proof;
  }
  return record;
}

function stageFor(type, extra = {}) {
  if (type === 'render-job:accepted') return 'accepted';
  if (type === 'render-job:queued') return 'queued';
  if (type === 'render-job:running') return 'running';
  if (type === 'render-job:stage') return cleanString(extra.stage, 'running');
  if (type === 'render-job:progress') return cleanString(extra.progress?.stage, 'running');
  if (type === 'render-job:cache-hit') return 'cache-hit';
  if (type === 'render-job:cleanup-start') return 'cleanup:start';
  if (type === 'render-job:cleanup-done') return 'cleanup:done';
  if (type === 'render-job:cleanup-failed') return 'cleanup:failed';
  if (type === 'render-job:timeout') return 'timeout';
  if (type === 'render-job:succeeded') return 'done';
  if (type === 'render-job:failed') return 'failed';
  if (type === 'render-job:canceled') return 'canceled';
  return cleanString(type.replace(/^render-job:/, ''), 'progress');
}

function snapshot(record) {
  return cloneJson(record);
}

function cacheProjection(job = {}) {
  let projected = cloneJson(job);
  delete projected.id;
  delete projected.output;
  return projected;
}

export function createRenderJobCacheKey(job = {}, extra = {}) {
  let normalized = normalizeRenderJob(job);
  return `render:${stableHash({
    kind: normalized.kind,
    providerId: normalized.providerId,
    job: cacheProjection(normalized),
    ...cloneJson(extra),
  })}`;
}

export function createRenderProviderJobQueue(options = {}) {
  let { registry } = options;
  if (!registry || typeof registry.execute !== 'function') {
    throw new Error('render provider job queue requires a registry');
  }
  let concurrency = Math.max(1, Math.round(Number(options.concurrency ?? 1)));
  let defaultTimeoutMs = Math.max(0, Math.round(Number(options.timeoutMs ?? 0)));
  let eventHistoryLimit = Math.max(0, Math.round(Number(options.eventHistoryLimit ?? DEFAULT_EVENT_HISTORY_LIMIT)));
  let onEvent = typeof options.onEvent === 'function' ? options.onEvent : () => {};
  let cleanup = typeof options.cleanup === 'function' ? options.cleanup : async () => {};
  let records = new Map();
  let queue = [];
  let cache = new Map();
  let controllers = new Map();
  let running = new Set();
  let waiters = new Map();
  let sequence = 0;

  function rememberEvent(type, record, extra = {}) {
    let at = timestamp();
    let event = {
      at,
      type,
      jobId: record.jobId,
      id: record.id,
      status: record.status,
      stage: stageFor(type, extra),
      kind: record.kind,
      providerId: record.providerId,
      ...cloneJson(extra),
    };
    record.stage = event.stage;
    record.updatedAt = at;
    if (type === 'render-job:accepted') record.acceptedAt = record.acceptedAt || at;
    if (type === 'render-job:queued') record.queuedAt = at;
    if (type === 'render-job:running') record.startedAt = record.startedAt || at;
    if (type === 'render-job:progress') record.lastProgress = cloneJson(extra.progress || {});
    if (TERMINAL_STATUSES.has(record.status)) record.completedAt = record.completedAt || at;
    if (!Array.isArray(record.events)) record.events = [];
    if (eventHistoryLimit > 0) {
      record.events.push(event);
      if (record.events.length > eventHistoryLimit) {
        record.events.splice(0, record.events.length - eventHistoryLimit);
      }
    }
    return event;
  }

  function resolveWaiters(record) {
    if (!TERMINAL_STATUSES.has(record.status)) return;
    let resolvers = waiters.get(record.jobId);
    if (!resolvers) return;
    waiters.delete(record.jobId);
    for (let resolve of resolvers) resolve(snapshot(record));
  }

  function emit(type, record, extra = {}) {
    let event = rememberEvent(type, record, extra);
    onEvent(cloneJson(event));
    if (type === 'render-job:succeeded' || type === 'render-job:failed' || type === 'render-job:canceled') {
      resolveWaiters(record);
    }
  }

  function createRecord(job, cacheKey) {
    sequence += 1;
    let jobId = `render_${safeId(job.id, 'job')}_${String(sequence).padStart(4, '0')}`;
    return {
      jobId,
      id: job.id,
      status: 'queued',
      stage: 'accepted',
      kind: job.kind,
      providerId: job.providerId,
      input: cloneJson(job),
      cacheKey,
      cacheHit: false,
      createdAt: timestamp(),
      updatedAt: timestamp(),
      events: [],
    };
  }

  function activeCount() {
    return controllers.size;
  }

  function insertQueued(jobId) {
    if (!queue.includes(jobId)) queue.push(jobId);
  }

  function activeRecordByCacheKey(cacheKey) {
    for (let record of records.values()) {
      if (record.cacheKey === cacheKey && !TERMINAL_STATUSES.has(record.status)) return record;
    }
    return null;
  }

  async function runCleanup(record, reason) {
    emit('render-job:cleanup-start', record, { reason });
    try {
      let result = await cleanup(snapshot(record), { reason });
      record.cleanup = cloneJson(result || { ok: true });
      emit('render-job:cleanup-done', record, { reason, cleanup: record.cleanup });
    } catch (error) {
      record.cleanupError = { message: error?.message || String(error), code: error?.code };
      emit('render-job:cleanup-failed', record, { reason, error: record.cleanupError });
    }
  }

  async function finish(record, status, extra = {}) {
    record.status = status;
    if (extra.error) record.error = extra.error;
    if (extra.result) record.result = cloneJson(extra.result);
    if (extra.timeout) record.timeout = true;
    await runCleanup(record, status);
    emit(`render-job:${status}`, record, extra.timeout ? { timeout: true } : {});
  }

  function pump() {
    while (activeCount() < concurrency && queue.length > 0) {
      let jobId = queue.shift();
      let record = records.get(jobId);
      if (!record || record.status !== 'queued') continue;
      start(record);
    }
  }

  function start(record) {
    let controller = new AbortController();
    controllers.set(record.jobId, controller);
    record.status = 'running';
    emit('render-job:running', record);
    let timeoutMs = Math.max(0, Math.round(Number(record.timeoutMs || defaultTimeoutMs)));
    let timeout = null;
    if (timeoutMs > 0) {
      timeout = setTimeout(() => {
        record.timeout = true;
        if (!controller.signal.aborted) controller.abort(timeoutError(timeoutMs));
      }, timeoutMs);
    }

    let promise = (async () => {
      try {
        let result = await registry.execute(record.input, {
          signal: controller.signal,
          onStage(stage) {
            let detail = typeof stage === 'string' ? { stage } : { ...(stage || {}) };
            emit('render-job:stage', record, detail);
          },
          onProgress(progress) {
            emit('render-job:progress', record, { progress: cloneJson(progress || {}) });
          },
        });
        if (controller.signal.aborted) throw errorFromAbort(controller.signal);
        cache.set(record.cacheKey, cloneJson(result));
        await finish(record, 'succeeded', { result });
      } catch (error) {
        let aborted = controller.signal.aborted;
        let timeoutAbort = record.timeout || error?.code === 'TIMEOUT';
        if (aborted && timeoutAbort) {
          record.error = { message: error?.message || errorFromAbort(controller.signal).message, code: 'TIMEOUT' };
          emit('render-job:timeout', record, { error: record.error });
          await finish(record, 'failed', { error: record.error, timeout: true });
        } else if (aborted) {
          record.cancelReason = error?.message || errorFromAbort(controller.signal).message;
          await finish(record, 'canceled');
        } else {
          let err = renderErrorRecord(error);
          await finish(record, 'failed', { error: err });
        }
      } finally {
        if (timeout) clearTimeout(timeout);
        controllers.delete(record.jobId);
        pump();
      }
      return snapshot(record);
    })();

    running.add(promise);
    promise.finally(() => running.delete(promise)).catch(() => {});
  }

  async function cancelQueued(record, reason) {
    let index = queue.indexOf(record.jobId);
    if (index >= 0) queue.splice(index, 1);
    record.cancelReason = reason;
    await finish(record, 'canceled');
    return snapshot(record);
  }

  return {
    async submit(request = {}) {
      let job = normalizeRenderJob(request);
      let cacheKey = cleanString(request.cacheKey, createRenderJobCacheKey(job));
      let cached = cache.get(cacheKey);
      if (cached) {
        let record = createRecord(job, cacheKey);
        record.timeoutMs = Math.max(0, Math.round(Number(request.timeoutMs ?? defaultTimeoutMs)));
        records.set(record.jobId, record);
        emit('render-job:accepted', record);
        record.status = 'succeeded';
        record.cacheHit = true;
        record.result = cloneJson(cached);
        emit('render-job:cache-hit', record);
        await runCleanup(record, 'cache-hit');
        emit('render-job:succeeded', record);
        return snapshot(record);
      }

      let active = activeRecordByCacheKey(cacheKey);
      if (active) return { ...snapshot(active), idempotent: true };

      let record = createRecord(job, cacheKey);
      record.timeoutMs = Math.max(0, Math.round(Number(request.timeoutMs ?? defaultTimeoutMs)));
      records.set(record.jobId, record);
      emit('render-job:accepted', record);
      insertQueued(record.jobId);
      emit('render-job:queued', record);
      pump();
      return snapshot(record);
    },
    get(jobId) {
      let record = records.get(cleanString(jobId, ''));
      return record ? snapshot(record) : null;
    },
    async cancel(jobId, reason = 'render-job.cancel') {
      let record = records.get(cleanString(jobId, ''));
      if (!record) throw new Error(`render job "${jobId}" does not exist`);
      if (TERMINAL_STATUSES.has(record.status)) return snapshot(record);
      if (record.status === 'queued') return cancelQueued(record, reason);
      let controller = controllers.get(record.jobId);
      if (controller && !controller.signal.aborted) controller.abort(reason);
      return snapshot(record);
    },
    wait(jobId) {
      let record = records.get(cleanString(jobId, ''));
      if (!record) return Promise.reject(new Error(`render job "${jobId}" does not exist`));
      if (TERMINAL_STATUSES.has(record.status)) return Promise.resolve(snapshot(record));
      return new Promise((resolve) => {
        let resolvers = waiters.get(record.jobId) || [];
        resolvers.push(resolve);
        waiters.set(record.jobId, resolvers);
      });
    },
    async drain() {
      pump();
      while (running.size > 0) {
        await Promise.allSettled([...running]);
        pump();
      }
    },
    list() {
      return [...records.values()].map(snapshot);
    },
  };
}
