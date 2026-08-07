import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  buildRenderQueueSnapshot,
  buildTerminalRenderJobPatch,
  classifyRenderError,
  createRenderCanceledError,
  createRenderTimeoutError,
  isRenderTimeout,
  isTerminalRenderStatus,
  mapRenderEventToProgress,
} from '../render-lifecycle.js';

test('render lifecycle maps provider events to engine progress phases', () => {
  assert.deepEqual(mapRenderEventToProgress({ type: 'render-job:queued', stage: 'queued' }), {
    phase: 'queue',
    stage: 'queued',
    progress: 0.52,
  });
  assert.deepEqual(mapRenderEventToProgress({ type: 'render-job:stage', stage: 'fonts:ready' }), {
    phase: 'browser',
    stage: 'fonts:ready',
    progress: 0.57,
  });
  assert.deepEqual(mapRenderEventToProgress({ type: 'render-job:stage', stage: 'frame-sequence:done' }), {
    phase: 'capture',
    stage: 'frame-sequence:done',
    progress: 0.84,
  });
  assert.deepEqual(mapRenderEventToProgress({ type: 'render-job:stage', stage: 'cleanup:done' }, { currentProgress: 0.91 }), {
    phase: 'cleanup',
    stage: 'cleanup:done',
    progress: 0.91,
  });
});

test('render lifecycle maps frame progress events without host state', () => {
  assert.deepEqual(mapRenderEventToProgress({
    type: 'render-job:progress',
    progress: { stage: 'capture:frame', progress: 0.5, frame: 10, frames: 20 },
  }), {
    phase: 'capture',
    stage: 'capture:frame',
    progress: 0.7,
  });
  assert.equal(mapRenderEventToProgress({
    type: 'render-job:progress',
    progress: { stage: 'capture:frame', progress: 4 },
  }).progress, 0.82);
});

test('render lifecycle classifies render errors by stable kind and code', () => {
  assert.deepEqual(classifyRenderError({ timeout: true, error: { message: 'waited too long', code: 'TIMEOUT' } }), {
    kind: 'timeout',
    code: 'TIMEOUT',
    detail: 'waited too long',
  });
  assert.deepEqual(classifyRenderError({ canceled: true, message: 'operator canceled' }), {
    kind: 'canceled',
    code: 'RENDER_JOB_CANCELED',
    detail: 'operator canceled',
  });
  assert.deepEqual(classifyRenderError({ message: 'provider exploded', code: 'E_PROVIDER' }), {
    kind: 'failed',
    code: 'E_PROVIDER',
    detail: 'provider exploded',
  });
  assert.equal(isRenderTimeout({ error: { code: 'TIMEOUT' } }), true);
  assert.equal(isRenderTimeout({ code: 'E_PROVIDER' }), false);
});

test('render lifecycle creates stable render terminal errors', () => {
  let canceled = createRenderCanceledError('operator canceled');
  assert.equal(canceled.message, 'operator canceled');
  assert.equal(canceled.code, 'RENDER_JOB_CANCELED');
  assert.equal(canceled.canceled, true);
  assert.deepEqual(classifyRenderError(canceled), {
    kind: 'canceled',
    code: 'RENDER_JOB_CANCELED',
    detail: 'operator canceled',
  });

  let timeout = createRenderTimeoutError('browser waited too long', {
    renderJobId: 'render-1',
    audioJobId: 'audio-1',
  });
  assert.equal(timeout.message, 'browser waited too long');
  assert.equal(timeout.code, 'RENDER_JOB_TIMEOUT');
  assert.equal(timeout.timeout, true);
  assert.equal(timeout.timeoutReason, 'browser waited too long');
  assert.equal(timeout.renderJobId, 'render-1');
  assert.equal(timeout.audioJobId, 'audio-1');
  assert.equal('renderQueue' in timeout, false);
  assert.equal('audioQueue' in timeout, false);
  assert.deepEqual(classifyRenderError(timeout), {
    kind: 'timeout',
    code: 'RENDER_JOB_TIMEOUT',
    detail: 'browser waited too long',
  });
  assert.equal(isRenderTimeout(timeout), true);
});

test('render lifecycle exposes terminal render status vocabulary', () => {
  for (let status of ['succeeded', 'failed', 'canceled', 'timeout']) {
    assert.equal(isTerminalRenderStatus(status), true);
  }
  for (let status of ['running', 'queued', '', 'unknown']) {
    assert.equal(isTerminalRenderStatus(status), false);
  }
});

test('render lifecycle builds neutral terminal failure patches', () => {
  assert.deepEqual(buildTerminalRenderJobPatch({ message: 'provider failed', code: 'E_PROVIDER' }), {
    status: 'failed',
    error: 'provider failed',
  });
  assert.equal('timeout' in buildTerminalRenderJobPatch({ message: 'provider failed' }), false);
  assert.equal('cancelReason' in buildTerminalRenderJobPatch({ message: 'provider failed' }), false);
});

test('render lifecycle builds neutral timeout patches with id fallbacks', () => {
  assert.deepEqual(buildTerminalRenderJobPatch(
    createRenderTimeoutError('provider timeout', { renderJobId: 'render-direct', audioJobId: 'audio-direct' }),
    { renderJobId: 'render-fallback', audioJobId: 'audio-fallback' },
  ), {
    status: 'timeout',
    timeout: true,
    timeoutReason: 'provider timeout',
    error: 'provider timeout',
    renderJobId: 'render-direct',
    audioJobId: 'audio-direct',
  });
  assert.deepEqual(buildTerminalRenderJobPatch(
    { code: 'RENDER_JOB_TIMEOUT', timeoutReason: 'browser waited too long', renderJobId: 'render-direct' },
    { renderJobId: 'render-fallback', audioJobId: 'audio-fallback' },
  ), {
    status: 'timeout',
    timeout: true,
    timeoutReason: 'browser waited too long',
    error: 'browser waited too long',
    renderJobId: 'render-direct',
    audioJobId: 'audio-fallback',
  });
  assert.deepEqual(buildTerminalRenderJobPatch(
    { timeout: true, message: 'audio waited too long', audioJobId: 'audio-direct' },
    { renderJobId: 'render-fallback', audioJobId: 'audio-fallback' },
  ), {
    status: 'timeout',
    timeout: true,
    timeoutReason: 'audio waited too long',
    error: 'audio waited too long',
    renderJobId: 'render-fallback',
    audioJobId: 'audio-direct',
  });
});

test('render lifecycle lets cancel override failed error classification', () => {
  let abort = new Error('operator canceled');
  abort.name = 'AbortError';
  assert.deepEqual(buildTerminalRenderJobPatch(abort), {
    status: 'canceled',
    cancelReason: 'operator canceled',
  });
  assert.deepEqual(buildTerminalRenderJobPatch({ message: 'provider failed' }, {
    cancelRequested: true,
    cancelReason: 'user stopped render',
  }), {
    status: 'canceled',
    cancelReason: 'user stopped render',
  });
  assert.equal('error' in buildTerminalRenderJobPatch({ canceled: true }), false);
});

test('render lifecycle leaves terminal patch strings raw for host redaction', () => {
  let raw = `failed at https://example.invalid/render?auth=raw-value with ${'Bear'}er raw.token`;
  assert.deepEqual(buildTerminalRenderJobPatch({ message: raw }), {
    status: 'failed',
    error: raw,
  });
});

test('render lifecycle builds neutral queue snapshots with default sanitization', () => {
  assert.deepEqual(buildRenderQueueSnapshot({
    jobId: 'render-1',
    status: 'failed',
    stage: 'capture:frame',
    cacheHit: 'yes',
    cancelReason: 'operator canceled',
    cleanup: { removed: [{ path: 'frames' }] },
    error: { message: 'provider failed', code: 'E_PROVIDER' },
  }, { jobId: 'submitted-1' }), {
    jobId: 'render-1',
    status: 'failed',
    stage: 'capture:frame',
    cacheHit: false,
    timeout: false,
    timeoutReason: '',
    cancelReason: 'operator canceled',
    cleanup: { removed: [{ path: 'frames' }] },
    error: { message: 'provider failed', code: 'E_PROVIDER' },
  });
  assert.deepEqual(buildRenderQueueSnapshot({}, { jobId: 'submitted-1', status: 'queued' }), {
    jobId: 'submitted-1',
    status: 'queued',
    stage: '',
    cacheHit: false,
    timeout: false,
    timeoutReason: '',
    cancelReason: '',
    cleanup: null,
    error: null,
  });
});

test('render lifecycle can include audio queue kind and provider fields', () => {
  assert.deepEqual(buildRenderQueueSnapshot({
    jobId: 'audio-1',
    status: 'succeeded',
    stage: 'done',
    kind: 'tts',
    providerId: 'local-audio',
    cacheHit: true,
  }, {}, { includeKindProvider: true }), {
    jobId: 'audio-1',
    status: 'succeeded',
    stage: 'done',
    cacheHit: true,
    timeout: false,
    timeoutReason: '',
    cancelReason: '',
    cleanup: null,
    error: null,
    kind: 'tts',
    providerId: 'local-audio',
  });
  assert.equal('kind' in buildRenderQueueSnapshot({ kind: 'tts' }), false);
  assert.equal('providerId' in buildRenderQueueSnapshot({ providerId: 'local-audio' }), false);
});

test('render lifecycle queue snapshots preserve error and timeout fallback semantics', () => {
  assert.deepEqual(buildRenderQueueSnapshot({
    jobId: 'render-timeout',
    status: 'failed',
    error: { code: 'TIMEOUT', message: 'browser waited too long' },
  }, {}, { timeoutFallback: 'render job timed out' }), {
    jobId: 'render-timeout',
    status: 'failed',
    stage: '',
    cacheHit: false,
    timeout: true,
    timeoutReason: 'browser waited too long',
    cancelReason: '',
    cleanup: null,
    error: { message: 'browser waited too long', code: 'TIMEOUT' },
  });
  assert.equal(buildRenderQueueSnapshot({
    status: 'timeout',
  }, {}, { timeoutFallback: 'audio job timed out' }).timeoutReason, 'audio job timed out');
  assert.deepEqual(buildRenderQueueSnapshot({
    status: 'failed',
    error: 'plain string failure',
  }, {}, { failureFallback: 'render queue failed' }).error, {
    message: 'plain string failure',
    code: '',
  });
});

test('render lifecycle queue snapshots route only free-text fields through sanitizer', () => {
  let calls = [];
  let snapshot = buildRenderQueueSnapshot({
    jobId: 'render-raw',
    status: 'timeout',
    stage: 'failed',
    cancelReason: 'operator canceled',
    error: { code: 'TIMEOUT', message: 'waited too long' },
  }, {}, {
    sanitizeMessage(value, fallback = '') {
      calls.push({ value, fallback });
      return `safe:${String(value ?? fallback)}`;
    },
  });
  assert.deepEqual(snapshot, {
    jobId: 'render-raw',
    status: 'timeout',
    stage: 'failed',
    cacheHit: false,
    timeout: true,
    timeoutReason: 'safe:waited too long',
    cancelReason: 'safe:operator canceled',
    cleanup: null,
    error: { message: 'safe:waited too long', code: 'TIMEOUT' },
  });
  assert.deepEqual(calls, [
    { value: 'waited too long', fallback: '[object Object]' },
    { value: 'waited too long', fallback: 'render job timed out' },
    { value: 'operator canceled', fallback: '' },
  ]);
});
