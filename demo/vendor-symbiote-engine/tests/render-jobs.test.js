import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import { test } from 'node:test';

import { createRenderProviderRegistry } from '../contracts/render-provider.js';
import { createRenderProviderJobQueue } from '../render-jobs.js';

function artifact(path = '/tmp/render.mp4') {
  return {
    path,
    kind: 'screencast',
    providerId: 'browser-headless-screencast',
    frames: 2,
    fps: 24,
    durationSec: 1,
    width: 640,
    height: 360,
  };
}

test('render provider job queue runs a job and records progress events', async () => {
  let events = [];
  let cleanupCalls = [];
  let registry = createRenderProviderRegistry([
    {
      id: 'browser-headless-screencast',
      kind: 'screencast',
      execute: async (job, context = {}) => {
        job.cleanup.browserProfilePaths = ['/tmp/browser-profile'];
        context.onStage?.({ stage: 'browser:launch' });
        context.onProgress?.({ stage: 'frame:capture', frame: 1, frames: 2 });
        return artifact();
      },
    },
  ]);
  let queue = createRenderProviderJobQueue({
    registry,
    onEvent: (event) => events.push(event),
    cleanup: async (record, context) => {
      cleanupCalls.push({ jobId: record.jobId, reason: context.reason, cleanup: record.input.cleanup });
      return { ok: true, reason: context.reason };
    },
  });

  let submitted = await queue.submit({
    id: 'tour-smoke',
    kind: 'screencast',
    providerId: 'browser-headless-screencast',
    surface: { url: 'http://example.test/' },
    video: { width: 640, height: 360, fps: 24, durationMs: 1000, frameCount: 2 },
    cleanup: { retainPaths: [] },
  });
  let completed = await queue.wait(submitted.jobId);

  assert.equal(completed.status, 'succeeded');
  assert.equal(completed.stage, 'done');
  assert.equal(completed.result.path, '/tmp/render.mp4');
  assert.equal(completed.cacheHit, false);
  assert.deepEqual(completed.cleanup, { ok: true, reason: 'succeeded' });
  assert.deepEqual(cleanupCalls, [{
    jobId: submitted.jobId,
    reason: 'succeeded',
    cleanup: {
      retainPaths: [],
      browserProfilePaths: ['/tmp/browser-profile'],
    },
  }]);
  assert.ok(events.some((event) => event.type === 'render-job:stage' && event.stage === 'browser:launch'));
  assert.ok(events.some((event) => event.type === 'render-job:progress' && event.progress.frame === 1));
  assert.ok(events.some((event) => event.type === 'render-job:cleanup-start'));
  assert.ok(events.some((event) => event.type === 'render-job:cleanup-done'));
});

test('render provider job queue cancels a running provider and runs cleanup before wait resolves', async () => {
  let cleanupDone = false;
  let registry = createRenderProviderRegistry([
    {
      id: 'browser-headless-screencast',
      kind: 'screencast',
      execute: async (_job, context = {}) => new Promise((resolve, reject) => {
        context.signal.addEventListener('abort', () => {
          let error = new Error(String(context.signal.reason || 'canceled'));
          error.name = 'AbortError';
          reject(error);
        }, { once: true });
      }),
    },
  ]);
  let queue = createRenderProviderJobQueue({
    registry,
    cleanup: async () => {
      await delay(1);
      cleanupDone = true;
      return { ok: true, reason: 'canceled' };
    },
  });

  let submitted = await queue.submit({
    id: 'cancel-smoke',
    kind: 'screencast',
    providerId: 'browser-headless-screencast',
    surface: { url: 'http://example.test/' },
    video: { width: 640, height: 360, fps: 24, durationMs: 1000, frameCount: 2 },
  });
  await queue.cancel(submitted.jobId, 'operator canceled');
  let completed = await queue.wait(submitted.jobId);

  assert.equal(completed.status, 'canceled');
  assert.equal(completed.stage, 'canceled');
  assert.equal(completed.cancelReason, 'operator canceled');
  assert.deepEqual(completed.cleanup, { ok: true, reason: 'canceled' });
  assert.equal(cleanupDone, true);
});

test('render provider job queue times out stalled providers', async () => {
  let events = [];
  let registry = createRenderProviderRegistry([
    {
      id: 'browser-headless-screencast',
      kind: 'screencast',
      execute: async (_job, context = {}) => new Promise((resolve, reject) => {
        context.signal.addEventListener('abort', () => reject(context.signal.reason), { once: true });
      }),
    },
  ]);
  let queue = createRenderProviderJobQueue({
    registry,
    timeoutMs: 5,
    onEvent: (event) => events.push(event),
    cleanup: async (_record, context) => ({ ok: true, reason: context.reason }),
  });

  let submitted = await queue.submit({
    id: 'timeout-smoke',
    kind: 'screencast',
    providerId: 'browser-headless-screencast',
    surface: { url: 'http://example.test/' },
    video: { width: 640, height: 360, fps: 24, durationMs: 1000, frameCount: 2 },
  });
  let completed = await queue.wait(submitted.jobId);

  assert.equal(completed.status, 'failed');
  assert.equal(completed.stage, 'failed');
  assert.equal(completed.timeout, true);
  assert.equal(completed.error.code, 'TIMEOUT');
  assert.deepEqual(completed.cleanup, { ok: true, reason: 'failed' });
  assert.ok(events.some((event) => event.type === 'render-job:timeout' && event.stage === 'timeout'));
});

test('render provider job queue records cleanup failures without hiding provider errors', async () => {
  let events = [];
  let registry = createRenderProviderRegistry([
    {
      id: 'browser-headless-screencast',
      kind: 'screencast',
      execute: async () => {
        let error = new Error('provider exploded');
        error.code = 'E_PROVIDER';
        error.proof = {
          frame: 12,
          contentMatches: false,
          paths: ['/private/leader.webp', '/private/peer.webp'],
        };
        throw error;
      },
    },
  ]);
  let queue = createRenderProviderJobQueue({
    registry,
    onEvent: (event) => events.push(event),
    cleanup: async () => {
      let error = new Error('cleanup exploded');
      error.code = 'E_CLEANUP';
      throw error;
    },
  });

  let submitted = await queue.submit({
    id: 'failed-cleanup-smoke',
    kind: 'screencast',
    providerId: 'browser-headless-screencast',
    surface: { url: 'http://example.test/' },
    video: { width: 640, height: 360, fps: 24, durationMs: 1000, frameCount: 2 },
  });
  let completed = await queue.wait(submitted.jobId);

  assert.equal(completed.status, 'failed');
  assert.equal(completed.error.code, 'E_PROVIDER');
  assert.deepEqual(completed.error.proof, { frame: 12, contentMatches: false });
  assert.equal(completed.cleanupError.code, 'E_CLEANUP');
  assert.ok(events.some((event) => event.type === 'render-job:cleanup-failed'));
});

test('render provider job queue returns new cache-hit job ids for idempotent reruns', async () => {
  let calls = 0;
  let registry = createRenderProviderRegistry([
    {
      id: 'browser-headless-screencast',
      kind: 'screencast',
      execute: async () => {
        calls += 1;
        return artifact('/tmp/cache.mp4');
      },
    },
  ]);
  let queue = createRenderProviderJobQueue({ registry });
  let request = {
    id: 'cache-smoke',
    kind: 'screencast',
    providerId: 'browser-headless-screencast',
    cacheKey: 'render:stable-smoke',
    surface: { url: 'http://example.test/' },
    video: { width: 640, height: 360, fps: 24, durationMs: 1000, frameCount: 2 },
  };

  let first = await queue.submit(request);
  let completed = await queue.wait(first.jobId);
  let second = await queue.submit(request);

  assert.equal(completed.status, 'succeeded');
  assert.equal(second.status, 'succeeded');
  assert.equal(second.cacheHit, true);
  assert.notEqual(second.jobId, completed.jobId);
  assert.equal(second.result.path, '/tmp/cache.mp4');
  assert.equal(calls, 1);
});

test('render provider job queue deduplicates in-flight same-key submits', async () => {
  let calls = 0;
  let releaseFirst;
  let firstBlocker = new Promise((resolve) => {
    releaseFirst = resolve;
  });
  let registry = createRenderProviderRegistry([
    {
      id: 'browser-headless-screencast',
      kind: 'screencast',
      execute: async () => {
        calls += 1;
        await firstBlocker;
        return artifact('/tmp/inflight-cache.mp4');
      },
    },
  ]);
  let queue = createRenderProviderJobQueue({ registry });
  let request = {
    id: 'inflight-cache-smoke',
    kind: 'screencast',
    providerId: 'browser-headless-screencast',
    cacheKey: 'render:inflight-stable-smoke',
    surface: { url: 'http://example.test/' },
    video: { width: 640, height: 360, fps: 24, durationMs: 1000, frameCount: 2 },
  };

  let first = await queue.submit(request);
  let duplicate = await queue.submit({ ...request, id: 'inflight-cache-dup' });

  assert.equal(first.status, 'running');
  assert.equal(duplicate.jobId, first.jobId);
  assert.equal(duplicate.idempotent, true);
  assert.equal(calls, 1);

  releaseFirst();
  let completed = await queue.wait(first.jobId);
  let cacheHit = await queue.submit({ ...request, id: 'inflight-cache-again' });

  assert.equal(completed.status, 'succeeded');
  assert.equal(cacheHit.status, 'succeeded');
  assert.equal(cacheHit.cacheHit, true);
  assert.notEqual(cacheHit.jobId, completed.jobId);
  assert.equal(cacheHit.result.path, '/tmp/inflight-cache.mp4');
  assert.equal(calls, 1);
});
