import {
  createAudioCacheKey,
  isAudioProviderNotReadyError,
  normalizeAudioJob,
  normalizeAudioProviderReadiness,
} from './contracts/audio-provider.js';

const TERMINAL_STATUSES = new Set(['succeeded', 'failed', 'canceled']);
const DEFAULT_READINESS_RETRY_MS = 1000;
const DEFAULT_EVENT_HISTORY_LIMIT = 50;

function cloneJson(value) {
  if (value === undefined) return undefined;
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

function cleanString(value, fallback = '') {
  let text = String(value ?? fallback ?? '').replace(/\s+/g, ' ').trim();
  return text && text !== 'undefined' && text !== 'null' ? text : String(fallback || '').trim();
}

function timeoutError(timeoutMs) {
  let error = new Error(`audio job timed out after ${timeoutMs}ms`);
  error.code = 'TIMEOUT';
  return error;
}

function errorFromAbort(signal) {
  let reason = signal?.reason;
  if (reason instanceof Error) return reason;
  let error = new Error(cleanString(reason, 'audio job canceled') || 'audio job canceled');
  error.name = 'AbortError';
  error.code = 'ABORT_ERR';
  return error;
}

function snapshot(record) {
  return cloneJson(record);
}

function timestamp() {
  return new Date().toISOString();
}

function stageFor(type, extra = {}) {
  if (type === 'audio-job:accepted') return 'accepted';
  if (type === 'audio-job:queued') return 'queued';
  if (type === 'audio-job:readiness-checking' || type === 'audio-job:not-ready') return 'readiness-wait';
  if (type === 'audio-job:running') return 'running';
  if (type === 'audio-job:progress') return cleanString(extra.progress?.stage, 'running');
  if (type === 'audio-job:artifact-write') return 'artifact-write';
  if (type === 'audio-job:cache-hit') return 'cache-hit';
  if (type === 'audio-job:timeout') return 'timeout';
  if (type === 'audio-job:succeeded') return 'done';
  if (type === 'audio-job:failed') return 'failed';
  if (type === 'audio-job:canceled') return 'canceled';
  return cleanString(type.replace(/^audio-job:/, ''), 'progress');
}

function jobGroup(job) {
  return cleanString(job.modelClass, job.profile || job.providerId);
}

function hasCapacity(activeByGroup, capacityByGroup, group) {
  let active = activeByGroup.get(group) || 0;
  let capacity = Number.isInteger(capacityByGroup[group]) ? capacityByGroup[group] : 1;
  return active < Math.max(0, capacity);
}

function setActive(activeByGroup, group, delta) {
  let next = Math.max(0, (activeByGroup.get(group) || 0) + delta);
  if (next === 0) activeByGroup.delete(group);
  else activeByGroup.set(group, next);
}

export function createAudioProviderJobQueue(options = {}) {
  let { registry } = options;
  if (!registry || typeof registry.execute !== 'function') {
    throw new Error('audio provider job queue requires a registry');
  }
  let capacityByGroup = options.capacityByGroup || {};
  let readinessRetryMs = Math.max(0, Number(options.readinessRetryMs ?? DEFAULT_READINESS_RETRY_MS));
  let defaultTimeoutMs = Math.max(0, Math.round(Number(options.timeoutMs ?? 0)));
  let eventHistoryLimit = Math.max(0, Math.round(Number(options.eventHistoryLimit ?? DEFAULT_EVENT_HISTORY_LIMIT)));
  let onEvent = typeof options.onEvent === 'function' ? options.onEvent : () => {};
  let records = new Map();
  let queue = [];
  let cache = new Map();
  let controllers = new Map();
  let timeoutTimers = new Map();
  let running = new Set();
  let waiters = new Map();
  let readinessChecks = new Set();
  let readinessRunning = new Set();
  let retryTimers = new Map();
  let retryUntilByGroup = new Map();
  let activeByGroup = new Map();
  let activeReleased = new Set();
  let terminalEmitted = new Set();

  function rememberEvent(type, record, extra = {}) {
    let at = timestamp();
    let event = {
      at,
      type,
      jobId: record.jobId,
      status: record.status,
      stage: stageFor(type, extra),
      kind: record.kind,
      providerId: record.providerId,
      profile: record.profile,
      modelClass: record.modelClass,
      modelVersion: record.modelVersion,
      ...cloneJson(extra),
    };
    record.stage = event.stage;
    record.updatedAt = at;
    if (type === 'audio-job:accepted') record.acceptedAt = record.acceptedAt || at;
    if (type === 'audio-job:queued') record.queuedAt = at;
    if (type === 'audio-job:readiness-checking') record.readinessCheckedAt = at;
    if (type === 'audio-job:running') record.startedAt = record.startedAt || at;
    if (type === 'audio-job:progress') record.lastProgress = cloneJson(extra.progress || {});
    if (extra.readiness) record.readiness = cloneJson(extra.readiness);
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
    resolveWaiters(record);
  }

  function clearRecordTimeout(record) {
    let timer = timeoutTimers.get(record.jobId);
    if (timer) clearTimeout(timer);
    timeoutTimers.delete(record.jobId);
  }

  function releaseActive(record) {
    if (!activeReleased.has(record.jobId)) {
      setActive(activeByGroup, record.group, -1);
      activeReleased.add(record.jobId);
    }
  }

  function emitTerminal(type, record, extra = {}) {
    if (terminalEmitted.has(record.jobId)) return;
    terminalEmitted.add(record.jobId);
    clearRecordTimeout(record);
    emit(type, record, extra);
  }

  function removeQueued(jobId) {
    let index = queue.indexOf(jobId);
    if (index >= 0) queue.splice(index, 1);
  }

  function timeoutRecord(record, error = timeoutError(record.timeoutMs || defaultTimeoutMs)) {
    if (!record || TERMINAL_STATUSES.has(record.status)) return;
    record.timeout = true;
    record.error = { message: error?.message || String(error), code: 'TIMEOUT' };
    let controller = controllers.get(record.jobId);
    if (controller && !controller.signal.aborted) controller.abort(error);
    removeQueued(record.jobId);
    if (record.status === 'running') releaseActive(record);
    controllers.delete(record.jobId);
    emit('audio-job:timeout', record, { error: record.error });
    record.status = 'failed';
    emitTerminal('audio-job:failed', record, { timeout: true });
    pump();
  }

  function armTimeout(record) {
    let timeoutMs = Math.max(0, Math.round(Number(record.timeoutMs || 0)));
    if (timeoutMs <= 0 || timeoutTimers.has(record.jobId)) return;
    let timer = setTimeout(() => timeoutRecord(record), timeoutMs);
    timeoutTimers.set(record.jobId, timer);
  }

  function recordFor(job, cacheKey) {
    let jobId = `job_${cacheKey.replace(/[^a-zA-Z0-9]/g, '_')}`;
    return {
      jobId,
      id: job.id,
      status: 'queued',
      stage: 'accepted',
      kind: job.kind,
      providerId: job.providerId,
      profile: job.profile || '',
      modelClass: job.modelClass || '',
      modelVersion: job.modelVersion || '',
      providerSettings: cloneJson(job.providerSettings || {}),
      priority: job.priority,
      input: cloneJson(job.input),
      cacheKey,
      cacheHit: false,
      group: jobGroup(job),
      createdAt: timestamp(),
      updatedAt: timestamp(),
      events: [],
    };
  }

  function insertQueued(jobId, priority) {
    if (queue.includes(jobId)) return;
    if (priority !== 'interactive') {
      queue.push(jobId);
      return;
    }
    let index = queue.findIndex((id) => records.get(id)?.priority !== 'interactive');
    if (index === -1) queue.push(jobId);
    else queue.splice(index, 0, jobId);
  }

  function blockedByReadiness(record) {
    let until = retryUntilByGroup.get(record.group) || 0;
    return Date.now() < until;
  }

  function schedulePump(group, delayMs = readinessRetryMs) {
    let existing = retryTimers.get(group);
    if (existing) clearTimeout(existing);
    let timer = setTimeout(() => {
      retryTimers.delete(group);
      retryUntilByGroup.delete(group);
      pump();
    }, Math.max(0, delayMs));
    if (typeof timer.unref === 'function') timer.unref();
    retryTimers.set(group, timer);
  }

  function notReadyRecord(record, readiness, delayMs = readinessRetryMs) {
    record.status = 'queued';
    record.readiness = normalizeAudioProviderReadiness(readiness);
    retryUntilByGroup.set(record.group, Date.now() + Math.max(0, delayMs));
    insertQueued(record.jobId, record.priority);
    emit('audio-job:not-ready', record, { readiness: record.readiness, retryMs: delayMs });
    schedulePump(record.group, delayMs);
  }

  function pump() {
    for (let jobId of [...queue]) {
      let record = records.get(jobId);
      if (!record || record.status !== 'queued') continue;
      if (blockedByReadiness(record)) continue;
      if (readinessChecks.has(record.jobId)) continue;
      if (!hasCapacity(activeByGroup, capacityByGroup, record.group)) continue;
      checkReadinessThenStart(record);
    }
  }

  function checkReadinessThenStart(record) {
    let provider = typeof registry.get === 'function' ? registry.get(record.providerId) : null;
    if (!provider?.checkReady) {
      start(record);
      return;
    }
    if (typeof registry.checkReady !== 'function') {
      start(record);
      return;
    }
    readinessChecks.add(record.jobId);
    emit('audio-job:readiness-checking', record);
    let promise = (async () => {
      try {
        let readiness = normalizeAudioProviderReadiness(await registry.checkReady({
          id: record.id,
          kind: record.kind,
          providerId: record.providerId,
          profile: record.profile,
          modelClass: record.modelClass,
          modelVersion: record.modelVersion,
          providerSettings: cloneJson(record.providerSettings || {}),
          input: cloneJson(record.input),
        }));
        let current = records.get(record.jobId);
        if (!current || current.status !== 'queued') return;
        if (!readiness.ready) {
          notReadyRecord(current, readiness);
          return;
        }
        current.readiness = readiness;
        start(current);
      } catch (err) {
        let current = records.get(record.jobId);
        if (!current || current.status !== 'queued') return;
        notReadyRecord(current, {
          ready: false,
          code: err?.code || 'READINESS_ERROR',
          reason: err?.message || String(err),
        });
      } finally {
        readinessChecks.delete(record.jobId);
      }
    })();
    readinessRunning.add(promise);
    promise.finally(() => readinessRunning.delete(promise)).catch(() => {});
  }

  function start(record) {
    let index = queue.indexOf(record.jobId);
    if (index >= 0) queue.splice(index, 1);
    if (TERMINAL_STATUSES.has(record.status)) return;
    let controller = new AbortController();
    controllers.set(record.jobId, controller);
    activeReleased.delete(record.jobId);
    setActive(activeByGroup, record.group, 1);
    record.status = 'running';
    emit('audio-job:running', record);

    let promise = (async () => {
      try {
        let result = await registry.execute({
          id: record.id,
          kind: record.kind,
          providerId: record.providerId,
          profile: record.profile,
          modelClass: record.modelClass,
          modelVersion: record.modelVersion,
          providerSettings: cloneJson(record.providerSettings || {}),
          input: cloneJson(record.input),
        }, {
          signal: controller.signal,
          onProgress(progress) {
            emit('audio-job:progress', record, { progress });
          },
        });
        if (TERMINAL_STATUSES.has(record.status)) {
          return snapshot(record);
        }
        if (record.timeout || controller.signal.aborted) {
          if (record.timeout) throw timeoutError(record.timeoutMs || defaultTimeoutMs);
          record.status = 'canceled';
          record.cancelReason = errorFromAbort(controller.signal).message;
        } else {
          emit('audio-job:artifact-write', record, {
            artifact: result?.artifactId ? {
              artifactId: result.artifactId,
              mimeType: result.mimeType,
              durationSec: result.durationSec,
            } : undefined,
          });
          record.status = 'succeeded';
          record.result = cloneJson(result);
          cache.set(record.cacheKey, cloneJson(result));
        }
      } catch (err) {
        if (TERMINAL_STATUSES.has(record.status)) {
          return snapshot(record);
        }
        let timedOut = record.timeout || err?.code === 'TIMEOUT';
        if (timedOut) {
          record.timeout = true;
          record.error = { message: err?.message || timeoutError(record.timeoutMs || defaultTimeoutMs).message, code: 'TIMEOUT' };
          emit('audio-job:timeout', record, { error: record.error });
          record.status = 'failed';
        } else if (!controller.signal.aborted && isAudioProviderNotReadyError(err)) {
          notReadyRecord(record, err.readiness || {
            ready: false,
            code: err?.code || 'NOT_READY',
            reason: err?.message || String(err),
          });
        } else {
          record.status = controller.signal.aborted ? 'canceled' : 'failed';
          if (record.status === 'canceled') record.cancelReason = errorFromAbort(controller.signal).message;
          else record.error = { message: err?.message || String(err), code: err?.code };
        }
      } finally {
        controllers.delete(record.jobId);
        releaseActive(record);
        if (TERMINAL_STATUSES.has(record.status)) {
          emitTerminal(`audio-job:${record.status}`, record, record.timeout ? { timeout: true } : {});
        }
        pump();
      }
      return snapshot(record);
    })();

    running.add(promise);
    promise.finally(() => running.delete(promise)).catch(() => {});
  }

  return {
    async submit(request = {}) {
      let job = normalizeAudioJob(request);
      let provider = typeof registry.get === 'function' ? registry.get(job.providerId) : null;
      if (provider && !job.modelClass) job.modelClass = provider.modelClass || provider.profile || provider.id;
      if (provider && !job.modelVersion) job.modelVersion = provider.modelVersion || '';
      let cacheKey = cleanString(request.cacheKey, createAudioCacheKey({
        kind: job.kind,
        providerId: job.providerId,
        profile: job.profile || '',
        modelVersion: job.modelVersion || '',
        providerSettings: job.providerSettings || {},
        input: job.input,
      }));
      let cached = cache.get(cacheKey);
      if (cached) {
        let existing = records.get(`job_${cacheKey.replace(/[^a-zA-Z0-9]/g, '_')}`);
        let record = existing || recordFor(job, cacheKey);
        record.status = 'succeeded';
        record.cacheHit = true;
        record.result = cloneJson(cached);
        if (!existing) records.set(record.jobId, record);
        emit('audio-job:cache-hit', record);
        emit('audio-job:succeeded', record);
        return {
          ...snapshot(record),
          status: 'succeeded',
          cacheHit: true,
          result: cloneJson(cached),
        };
      }
      let record = recordFor(job, cacheKey);
      record.timeoutMs = Math.max(0, Math.round(Number(request.timeoutMs ?? defaultTimeoutMs)));
      let existing = records.get(record.jobId);
      if (existing) return { ...snapshot(existing), idempotent: true };

      records.set(record.jobId, record);
      emit('audio-job:accepted', record);
      armTimeout(record);
      insertQueued(record.jobId, record.priority);
      emit('audio-job:queued', record);
      pump();
      return snapshot(record);
    },
    get(jobId) {
      let record = records.get(jobId);
      return record ? snapshot(record) : null;
    },
    async cancel(jobId, reason = 'audio-job.cancel') {
      let record = records.get(jobId);
      if (!record) throw new Error(`audio job "${jobId}" does not exist`);
      if (TERMINAL_STATUSES.has(record.status)) return snapshot(record);
      removeQueued(jobId);
      let controller = controllers.get(jobId);
      if (controller && !controller.signal.aborted) controller.abort(reason);
      record.status = 'canceled';
      record.cancelReason = reason;
      emitTerminal('audio-job:canceled', record);
      return snapshot(record);
    },
    wait(jobId) {
      let record = records.get(jobId);
      if (!record) return Promise.reject(new Error(`audio job "${jobId}" does not exist`));
      if (TERMINAL_STATUSES.has(record.status)) return Promise.resolve(snapshot(record));
      return new Promise((resolve) => {
        let resolvers = waiters.get(jobId) || [];
        resolvers.push(resolve);
        waiters.set(jobId, resolvers);
      });
    },
    async drain() {
      pump();
      while (running.size > 0 || readinessRunning.size > 0) {
        await Promise.allSettled([...running, ...readinessRunning]);
        pump();
      }
    },
    list() {
      return [...records.values()].map(snapshot);
    },
  };
}
