import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import { test } from 'node:test';

import { createAudioProviderRegistry } from '../contracts/audio-provider.js';
import { createAudioProviderJobQueue } from '../provider-jobs.js';

const AUDIO_ID = `sha256:${'a'.repeat(64)}`;
const SECOND_AUDIO_ID = `sha256:${'b'.repeat(64)}`;

test('provider job queue waits for provider readiness before dispatch', async () => {
  let ready = false;
  let readinessChecks = 0;
  let calls = 0;
  let events = [];
  let registry = createAudioProviderRegistry([
    {
      id: 'qwen3-local',
      kind: 'local-tts',
      profile: 'qwen3',
      modelClass: 'qwen3',
      checkReady: async () => {
        readinessChecks += 1;
        return ready
          ? { ready: true, status: 'ready', modelVersion: 'qwen3-test', accelerator: 'cuda' }
          : { ready: false, status: 'loading', reason: 'loading-weights', warmupMs: 1234, accelerator: 'cuda' };
      },
      execute: async (_job, context = {}) => {
        calls += 1;
        context.onProgress?.({ stage: 'synthesize', pct: 0.5 });
        return {
          artifactId: AUDIO_ID,
          mimeType: 'audio/wav',
          durationSec: 1,
          sampleRate: 24000,
        };
      },
    },
  ]);
  let queue = createAudioProviderJobQueue({
    registry,
    readinessRetryMs: 10,
    onEvent: (event) => events.push(event),
  });

  let submitted = await queue.submit({
    id: 'tts-1',
    kind: 'tts',
    providerId: 'qwen3-local',
    profile: 'qwen3',
    input: { text: 'Hola', language: 'es', voiceRef: 'voice:mateo-es-v1' },
  });

  await queue.drain();

  let waiting = queue.get(submitted.jobId);
  assert.equal(waiting.status, 'queued');
  assert.equal(waiting.stage, 'readiness-wait');
  assert.equal(waiting.readiness.status, 'loading');
  assert.equal(waiting.readiness.warmupMs, 1234);
  assert.ok(waiting.events.some((event) => event.type === 'audio-job:accepted'));
  assert.ok(waiting.events.some((event) => event.type === 'audio-job:not-ready'));
  assert.equal(queue.list()[0].stage, 'readiness-wait');
  assert.equal(calls, 0);
  assert.ok(readinessChecks >= 1);

  let completedJob = queue.wait(submitted.jobId);
  ready = true;
  await delay(20);
  let completed = await completedJob;

  assert.equal(completed.status, 'succeeded');
  assert.equal(completed.stage, 'done');
  assert.equal(completed.result.artifactId, AUDIO_ID);
  assert.equal(completed.readiness.accelerator, 'cuda');
  assert.equal(completed.lastProgress.stage, 'synthesize');
  assert.ok(completed.events.some((event) => event.type === 'audio-job:artifact-write'));
  assert.ok(events.some((event) => event.type === 'audio-job:progress' && event.progress.stage === 'synthesize'));
  assert.equal(calls, 1);

  let repeat = await queue.submit({
    id: 'tts-1',
    kind: 'tts',
    providerId: 'qwen3-local',
    profile: 'qwen3',
    input: { text: 'Hola', language: 'es', voiceRef: 'voice:mateo-es-v1' },
  });
  let cached = queue.get(repeat.jobId);
  assert.equal(repeat.cacheHit, true);
  assert.equal(cached.cacheHit, true);
  assert.ok(cached.events.some((event) => event.type === 'audio-job:cache-hit'));
});

test('provider job queue requeues retryable NOT_READY execution errors', async () => {
  let attempts = 0;
  let registry = createAudioProviderRegistry([
    {
      id: 'qwen3-local',
      kind: 'local-tts',
      profile: 'qwen3',
      modelClass: 'qwen3',
      execute: async () => {
        attempts += 1;
        if (attempts === 1) {
          let err = new Error('model is warming');
          err.code = 'NOT_READY';
          err.retryable = true;
          throw err;
        }
        return {
          artifactId: SECOND_AUDIO_ID,
          mimeType: 'audio/wav',
          durationSec: 1,
          sampleRate: 24000,
        };
      },
    },
  ]);
  let queue = createAudioProviderJobQueue({
    registry,
    readinessRetryMs: 5,
  });

  let submitted = await queue.submit({
    id: 'tts-2',
    kind: 'tts',
    providerId: 'qwen3-local',
    profile: 'qwen3',
    input: { text: 'Chau', language: 'es', voiceRef: 'voice:mateo-es-v1' },
  });

  await delay(20);
  await queue.drain();

  assert.equal(queue.get(submitted.jobId).status, 'succeeded');
  assert.equal(queue.get(submitted.jobId).result.artifactId, SECOND_AUDIO_ID);
  assert.equal(attempts, 2);
});
