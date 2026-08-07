import { cleanString, finiteNonNegativeNumber, isObject } from './render-utils.js';

const PROGRESS_BY_STAGE = Object.freeze({
  accepted: 0.51,
  queued: 0.52,
  running: 0.53,
  'browser:launch': 0.53,
  'browser:page': 0.54,
  'browser:navigate': 0.55,
  'browser:navigated': 0.56,
  'setup:start': 0.56,
  'setup-action:start': 0.565,
  'setup-action:done': 0.565,
  'setup:done': 0.567,
  'fonts:wait': 0.568,
  'fonts:ready': 0.57,
  'capture:start': 0.58,
  'capture:done': 0.82,
  'frame-sequence:done': 0.84,
  done: 0.84,
});

export const TERMINAL_RENDER_STATUSES = Object.freeze(new Set(['succeeded', 'failed', 'canceled', 'timeout']));

function clampProgress(value, fallback = 0) {
  let number = finiteNonNegativeNumber(value, fallback);
  if (!Number.isFinite(number)) number = fallback;
  return Math.min(1, Math.max(0, Number(number || 0)));
}

function eventStage(event = {}) {
  let stage = cleanString(event.stage, '');
  if (event.type === 'render-job:progress' && isObject(event.progress)) {
    stage = cleanString(event.progress.stage, stage || 'running');
  }
  if (!stage && typeof event.type === 'string') stage = cleanString(event.type.replace(/^render-job:/, ''), '');
  return stage || 'render';
}

function eventPhase(stage) {
  if (['accepted', 'queued', 'running'].includes(stage)) return 'queue';
  if (stage.startsWith('browser:') || stage.startsWith('setup:') || stage.startsWith('setup-action:') || stage.startsWith('fonts:')) return 'browser';
  if (stage.startsWith('capture:') || stage === 'frame-sequence:done') return 'capture';
  if (stage.startsWith('cleanup:')) return 'cleanup';
  if (stage === 'done') return 'finalize';
  if (['failed', 'canceled', 'timeout'].includes(stage)) return 'terminal';
  return 'render';
}

function errorCode(input = {}) {
  return cleanString(input?.code || input?.error?.code, '');
}

function errorDetail(input = {}) {
  return cleanString(
    input?.message
      || input?.error?.message
      || input?.timeoutReason
      || input?.cancelReason,
    '',
  );
}

export function createRenderCanceledError(reason = 'render job canceled') {
  let error = new Error(cleanString(reason, 'render job canceled') || 'render job canceled');
  error.code = 'RENDER_JOB_CANCELED';
  error.canceled = true;
  return error;
}

export function createRenderTimeoutError(reason = 'render job timed out', details = {}) {
  let message = cleanString(reason, 'render job timed out') || 'render job timed out';
  let error = new Error(message);
  error.code = 'RENDER_JOB_TIMEOUT';
  error.timeout = true;
  error.timeoutReason = message;
  if (details.renderQueue) error.renderQueue = details.renderQueue;
  if (details.audioQueue) error.audioQueue = details.audioQueue;
  if (details.renderJobId) error.renderJobId = details.renderJobId;
  if (details.audioJobId) error.audioJobId = details.audioJobId;
  return error;
}

export function classifyRenderError(error = {}) {
  let code = errorCode(error);
  let detail = errorDetail(error);
  if (error?.timeout === true || error?.status === 'timeout' || code === 'TIMEOUT' || code === 'RENDER_JOB_TIMEOUT') {
    return { kind: 'timeout', code: code || 'RENDER_JOB_TIMEOUT', ...(detail ? { detail } : {}) };
  }
  if (error?.canceled === true || code === 'RENDER_JOB_CANCELED' || error?.name === 'AbortError' || error?.status === 'canceled') {
    return { kind: 'canceled', code: code || 'RENDER_JOB_CANCELED', ...(detail ? { detail } : {}) };
  }
  return { kind: 'failed', code: code || 'RENDER_JOB_FAILED', ...(detail ? { detail } : {}) };
}

export function isRenderTimeout(error = {}) {
  return classifyRenderError(error).kind === 'timeout';
}

export function isTerminalRenderStatus(status) {
  return TERMINAL_RENDER_STATUSES.has(cleanString(status, ''));
}

export function buildTerminalRenderJobPatch(errorOrRecord = {}, jobContext = {}) {
  let classification = classifyRenderError(errorOrRecord);
  let canceled = jobContext?.cancelRequested === true || classification.kind === 'canceled';
  if (canceled) {
    let cancelReason = cleanString(
      jobContext?.cancelReason || classification.detail || errorDetail(errorOrRecord),
      'render job canceled',
    );
    return {
      status: 'canceled',
      ...(cancelReason ? { cancelReason } : {}),
    };
  }
  if (classification.kind === 'timeout') {
    let timeoutReason = cleanString(
      classification.detail || jobContext?.timeoutReason || errorDetail(errorOrRecord),
      'render job timed out',
    );
    let renderJobId = cleanString(errorOrRecord?.renderJobId || jobContext?.renderJobId, '');
    let audioJobId = cleanString(errorOrRecord?.audioJobId || jobContext?.audioJobId, '');
    return {
      status: 'timeout',
      timeout: true,
      timeoutReason,
      error: timeoutReason,
      ...(renderJobId ? { renderJobId } : {}),
      ...(audioJobId ? { audioJobId } : {}),
    };
  }
  return {
    status: 'failed',
    error: cleanString(classification.detail || errorDetail(errorOrRecord), 'render job failed'),
  };
}

export function reconcileTerminalRenderStatus(record = {}) {
  let source = isObject(record) ? record : {};
  let status = cleanString(source.status, '');
  let classification = classifyRenderError(source);
  if (status === 'timeout' || source.timeout === true || classification.kind === 'timeout') {
    return { status: 'timeout', timeout: true };
  }
  if (status === 'canceled' || source.canceled === true || classification.kind === 'canceled') {
    return { status: 'canceled', canceled: true };
  }
  if (status === 'succeeded') {
    return { status: 'succeeded' };
  }
  return { status: 'failed' };
}

export function buildRenderQueueSnapshot(record = {}, submitted = {}, options = {}) {
  let sanitizeMessage = typeof options.sanitizeMessage === 'function'
    ? options.sanitizeMessage
    : (value, fallback = '') => cleanString(value, fallback);
  let timeoutFallback = cleanString(options.timeoutFallback, 'render job timed out');
  let failureFallback = cleanString(options.failureFallback, 'render queue failed');
  let timeout = isRenderTimeout(record);
  let classification = classifyRenderError(record);
  let error = record?.error
    ? {
      message: sanitizeMessage(record.error?.message, String(record.error || failureFallback)),
      code: cleanString(record.error?.code, ''),
      ...(record.error?.proof && typeof record.error.proof === 'object'
        ? { proof: structuredClone(record.error.proof) }
        : {}),
    }
    : null;
  let snapshot = {
    jobId: cleanString(record?.jobId || submitted?.jobId, ''),
    status: cleanString(record?.status || submitted?.status, ''),
    stage: cleanString(record?.stage, ''),
    cacheHit: record?.cacheHit === true,
    timeout,
    timeoutReason: timeout
      ? sanitizeMessage(cleanString(classification.detail, timeoutFallback), timeoutFallback)
      : '',
    cancelReason: sanitizeMessage(record?.cancelReason, ''),
    cleanup: record?.cleanup || null,
    error,
  };
  if (options.includeKindProvider === true) {
    snapshot.kind = cleanString(record?.kind || submitted?.kind, '');
    snapshot.providerId = cleanString(record?.providerId || submitted?.providerId, '');
  }
  return snapshot;
}

export function mapRenderEventToProgress(event = {}, options = {}) {
  let stage = eventStage(event);
  let currentProgress = clampProgress(options.currentProgress, 0);
  let progress = PROGRESS_BY_STAGE[stage];
  if (event.type === 'render-job:progress' && isObject(event.progress)) {
    progress = 0.58 + Math.min(0.24, clampProgress(event.progress.progress, 0) * 0.24);
  } else if (stage.startsWith('cleanup:') || ['failed', 'canceled', 'timeout'].includes(stage)) {
    progress = currentProgress || (stage.startsWith('cleanup:') ? 0.84 : 0.52);
  }
  return {
    phase: eventPhase(stage),
    stage,
    progress: clampProgress(progress, currentProgress || 0.52),
  };
}
