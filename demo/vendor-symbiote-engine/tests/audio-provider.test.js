import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm, stat } from 'node:fs/promises';
import os from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { test } from 'node:test';

import {
  createAudioCacheKey,
  createAudioProviderRegistry,
  normalizeAudioArtifact,
  normalizeAudioJob,
  normalizeAudioProvider,
  normalizeVoiceReference,
} from '../contracts/audio-provider.js';
import { createFileArtifactStore } from '../artifacts.js';
import { createAudioProviderJobQueue } from '../provider-jobs.js';
import { createLocalAudioTtsProvider } from '../providers/local-audio-tts.js';

const ARTIFACT_A = `sha256:${'a'.repeat(64)}`;
const ARTIFACT_B = `sha256:${'b'.repeat(64)}`;

test('audio provider contract validates providers, jobs, voice refs, and artifacts', async () => {
  let provider = normalizeAudioProvider({
    id: 'qwen3-local',
    kind: 'local-tts',
    profile: 'qwen3',
    execute: async () => ({
      artifactId: ARTIFACT_A,
      mimeType: 'audio/wav',
      durationSec: 1.2,
      sampleRate: 24000,
    }),
  });

  assert.equal(provider.id, 'qwen3-local');
  assert.equal(provider.kind, 'local-tts');
  assert.equal(provider.profile, 'qwen3');
  assert.equal(provider.modelClass, 'qwen3');
  assert.throws(() => normalizeAudioProvider({ id: 'bad', kind: 'ssh-tts', execute() {} }), /unsupported kind/);
  assert.throws(
    () => normalizeAudioProvider({ id: 'browser', kind: 'browser-tts', execute() {} }),
    /live-only/,
  );
  assert.throws(() => normalizeAudioProvider({ id: 'bad', kind: 'local-tts' }), /execute/);

  assert.deepEqual(
    normalizeAudioJob({
      id: 'job-1',
      kind: 'tts',
      providerId: 'qwen3-local',
      profile: 'qwen3',
      input: {
        text: 'Hola',
        language: 'es',
        voiceRef: 'voice:mateo-es-v1',
      },
    }),
    {
      id: 'job-1',
      kind: 'tts',
      providerId: 'qwen3-local',
      profile: 'qwen3',
      providerSettings: {},
      priority: 'batch',
      input: {
        text: 'Hola',
        language: 'es',
        voiceRef: 'voice:mateo-es-v1',
      },
    },
  );

  assert.deepEqual(normalizeVoiceReference('voice:mateo-es-v1'), { id: 'voice:mateo-es-v1' });
  assert.throws(() => normalizeVoiceReference('/Users/me/voice.wav'), /must not be a path/);
  assert.throws(() => normalizeVoiceReference('http://127.0.0.1/voice.wav'), /must not be a URL/);

  assert.deepEqual(
    normalizeAudioArtifact({
      artifactId: ARTIFACT_A,
      mimeType: 'audio/wav',
      durationSec: 1.2,
      sampleRate: 24000,
      words: [{ word: 'Hola', startSec: 0, endSec: 0.4 }],
    }),
    {
      artifactId: ARTIFACT_A,
      mimeType: 'audio/wav',
      durationSec: 1.2,
      sampleRate: 24000,
      words: [{ word: 'Hola', startSec: 0, endSec: 0.4 }],
    },
  );
});

test('audio provider registry executes selected provider and protects kind boundaries', async () => {
  let calls = [];
  let registry = createAudioProviderRegistry([
    {
      id: 'qwen3-local',
      kind: 'local-tts',
      profile: 'qwen3',
      execute: async (job) => {
        calls.push(job.input.text);
        return {
          artifactId: ARTIFACT_B,
          mimeType: 'audio/wav',
          durationSec: 1,
          sampleRate: 24000,
        };
      },
    },
  ]);

  assert.deepEqual(registry.list(), [{
    id: 'qwen3-local',
    kind: 'local-tts',
    profile: 'qwen3',
    modelClass: 'qwen3',
  }]);
  assert.throws(() => registry.register({ id: 'qwen3-local', kind: 'local-tts', execute() {} }), /duplicate/);

  let result = await registry.execute({
    kind: 'tts',
    providerId: 'qwen3-local',
    input: { text: 'Hola', language: 'es', voiceRef: 'voice:mateo-es-v1' },
  });

  assert.equal(calls.length, 1);
  assert.equal(result.artifactId, ARTIFACT_B);
  await assert.rejects(() => registry.execute({ kind: 'tts', providerId: 'missing', input: { text: 'x' } }), /unknown provider/);
  await assert.rejects(
    () => registry.execute({ kind: 'transcribe', providerId: 'qwen3-local', input: { audioRef: ARTIFACT_A } }),
    /handles "tts"/,
  );
});

test('audio cache keys include provider, settings, model, voice, text, language, and style', () => {
  let base = createAudioCacheKey({
    kind: 'tts',
    providerId: 'local-qwen3',
    profile: 'qwen3',
    modelVersion: 'Qwen3-TTS-12Hz-1.7B-Base',
    providerSettings: {
      sampleRate: 24000,
      speed: 1,
    },
    input: {
      text: 'Hola',
      language: 'es',
      voiceRef: 'voice:mateo-es-v1',
      style: 'warm',
    },
  });

  assert.equal(base, createAudioCacheKey({
    kind: 'tts',
    providerId: 'local-qwen3',
    profile: 'qwen3',
    modelVersion: 'Qwen3-TTS-12Hz-1.7B-Base',
    providerSettings: {
      speed: 1,
      sampleRate: 24000,
    },
    input: {
      language: 'es',
      style: 'warm',
      text: 'Hola',
      voiceRef: 'voice:mateo-es-v1',
    },
  }));
  assert.notEqual(base, createAudioCacheKey({
    kind: 'tts',
    providerId: 'local-moss',
    profile: 'moss',
    modelVersion: 'MOSS-TTSD-v1.5',
    providerSettings: {
      sampleRate: 24000,
      speed: 1,
    },
    input: {
      text: 'Hola',
      language: 'es',
      voiceRef: 'voice:mateo-es-v1',
      style: 'warm',
    },
  }));
  assert.notEqual(base, createAudioCacheKey({
    kind: 'tts',
    providerId: 'local-qwen3',
    profile: 'qwen3',
    modelVersion: 'Qwen3-TTS-12Hz-1.7B-Base',
    providerSettings: {
      sampleRate: 24000,
      speed: 1,
    },
    input: {
      text: 'Hola',
      language: 'es',
      voiceRef: 'voice:lucia-es-v1',
      style: 'warm',
    },
  }));
  assert.notEqual(base, createAudioCacheKey({
    kind: 'tts',
    providerId: 'local-qwen3',
    profile: 'qwen3',
    modelVersion: 'Qwen3-TTS-12Hz-1.7B-Base',
    providerSettings: {
      sampleRate: 48000,
      speed: 1,
    },
    input: {
      text: 'Hola',
      language: 'es',
      voiceRef: 'voice:mateo-es-v1',
      style: 'warm',
    },
  }));
});

test('file artifact store writes content-addressed audio metadata and stable refs', async () => {
  let root = await mkdtemp(join(os.tmpdir(), 'sym-engine-audio-artifacts-'));
  try {
    let store = createFileArtifactStore({ root });
    let first = await store.put(Buffer.from('RIFFfakewav'), {
      mimeType: 'audio/wav',
      durationSec: 0.4,
      sampleRate: 24000,
      voiceRef: 'voice:mateo-es-v1',
      cacheKey: 'audio:abc',
    });
    let second = await store.put(Buffer.from('RIFFfakewav'), {
      mimeType: 'audio/wav',
      durationSec: 0.4,
      sampleRate: 24000,
    });

    assert.equal(first.artifactId, second.artifactId);
    assert.match(first.artifactId, /^sha256:[a-f0-9]{64}$/);
    assert.equal((await stat(first.path)).isFile(), true);

    let sidecar = JSON.parse(await readFile(first.metadataPath, 'utf8'));
    assert.equal(sidecar.artifactId, first.artifactId);
    assert.equal(sidecar.mimeType, 'audio/wav');
    assert.equal(sidecar.voiceRef, 'voice:mateo-es-v1');

    let files = await readdir(root);
    assert.ok(files.some((file) => file.endsWith('.wav')));
    assert.ok(files.some((file) => file.endsWith('.json')));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('provider job queue serializes per model class, idempotently caches, and cancels queued jobs', async () => {
  let active = 0;
  let maxActive = 0;
  let releaseFirst;
  let firstBlocker = new Promise((resolve) => {
    releaseFirst = resolve;
  });
  let calls = [];
  let registry = createAudioProviderRegistry([
    {
      id: 'qwen3-local',
      kind: 'local-tts',
      profile: 'qwen3',
      execute: async (job) => {
        calls.push(job.id);
        active += 1;
        maxActive = Math.max(maxActive, active);
        if (job.input.text === 'one') await firstBlocker;
        active -= 1;
        return {
          artifactId: job.input.text === 'one' ? ARTIFACT_A : ARTIFACT_B,
          mimeType: 'audio/wav',
          durationSec: 1,
          sampleRate: 24000,
        };
      },
    },
  ]);
  let queue = createAudioProviderJobQueue({
    registry,
    capacityByGroup: { qwen3: 1 },
  });

  let first = await queue.submit({
    id: 'first',
    kind: 'tts',
    providerId: 'qwen3-local',
    profile: 'qwen3',
    input: { text: 'one', language: 'es', voiceRef: 'voice:a' },
  });
  let duplicate = await queue.submit({
    id: 'first-dup',
    kind: 'tts',
    providerId: 'qwen3-local',
    profile: 'qwen3',
    input: { text: 'one', language: 'es', voiceRef: 'voice:a' },
  });
  let second = await queue.submit({
    id: 'second',
    kind: 'tts',
    providerId: 'qwen3-local',
    profile: 'qwen3',
    input: { text: 'two', language: 'es', voiceRef: 'voice:a' },
  });
  let canceled = await queue.submit({
    id: 'cancel-me',
    kind: 'tts',
    providerId: 'qwen3-local',
    profile: 'qwen3',
    input: { text: 'cancel', language: 'es', voiceRef: 'voice:a' },
  });

  assert.equal(first.status, 'running');
  assert.equal(duplicate.jobId, first.jobId);
  assert.equal(duplicate.idempotent, true);
  assert.equal(second.status, 'queued');

  let cancelResult = await queue.cancel(canceled.jobId, 'test');
  assert.equal(cancelResult.status, 'canceled');

  releaseFirst();
  await queue.drain();

  assert.equal(maxActive, 1);
  assert.deepEqual(calls, ['first', 'second']);
  assert.equal(queue.get(first.jobId).status, 'succeeded');
  assert.equal(queue.get(second.jobId).status, 'succeeded');

  let cacheHit = await queue.submit({
    id: 'first-again',
    kind: 'tts',
    providerId: 'qwen3-local',
    profile: 'qwen3',
    input: { text: 'one', language: 'es', voiceRef: 'voice:a' },
  });
  assert.equal(cacheHit.status, 'succeeded');
  assert.equal(cacheHit.cacheHit, true);
  assert.equal(calls.length, 2);

  let settingsVariant = await queue.submit({
    id: 'first-settings-variant',
    kind: 'tts',
    providerId: 'qwen3-local',
    profile: 'qwen3',
    providerSettings: { sampleRate: 48000 },
    input: { text: 'one', language: 'es', voiceRef: 'voice:a' },
  });
  await queue.drain();
  assert.equal(queue.get(settingsVariant.jobId).status, 'succeeded');
  assert.equal(settingsVariant.cacheHit, false);
  assert.equal(calls.length, 3);
});

test('provider job queue times out running audio providers without caching artifacts', async () => {
  let events = [];
  let calls = 0;
  let aborted = false;
  let registry = createAudioProviderRegistry([
    {
      id: 'qwen3-local',
      kind: 'local-tts',
      profile: 'qwen3',
      execute: async (_job, context = {}) => {
        calls += 1;
        return new Promise((resolve, reject) => {
          context.signal.addEventListener('abort', () => {
            aborted = true;
            reject(context.signal.reason);
          }, { once: true });
        });
      },
    },
  ]);
  let queue = createAudioProviderJobQueue({
    registry,
    timeoutMs: 10,
    onEvent: (event) => events.push(event),
  });

  let submitted = await queue.submit({
    id: 'timeout-running',
    kind: 'tts',
    providerId: 'qwen3-local',
    profile: 'qwen3',
    input: { text: 'slow', language: 'en', voiceRef: 'voice:a' },
  });
  let completed = await queue.wait(submitted.jobId);

  assert.equal(completed.status, 'failed');
  assert.equal(completed.timeout, true);
  assert.equal(completed.error.code, 'TIMEOUT');
  assert.equal(completed.result, undefined);
  assert.equal(aborted, true);
  assert.equal(calls, 1);
  assert.ok(events.some((event) => event.type === 'audio-job:timeout' && event.stage === 'timeout'));
  assert.ok(events.some((event) => event.type === 'audio-job:failed' && event.timeout === true));
});

test('provider job queue timeout covers readiness retry waits', async () => {
  let events = [];
  let executeCalls = 0;
  let registry = createAudioProviderRegistry([
    {
      id: 'qwen3-local',
      kind: 'local-tts',
      profile: 'qwen3',
      checkReady: async () => ({ ready: false, code: 'MODEL_LOADING', reason: 'still loading' }),
      execute: async () => {
        executeCalls += 1;
        return {
          artifactId: ARTIFACT_A,
          mimeType: 'audio/wav',
          durationSec: 1,
          sampleRate: 24000,
        };
      },
    },
  ]);
  let queue = createAudioProviderJobQueue({
    registry,
    readinessRetryMs: 1000,
    timeoutMs: 20,
    onEvent: (event) => events.push(event),
  });

  let submitted = await queue.submit({
    id: 'timeout-readiness',
    kind: 'tts',
    providerId: 'qwen3-local',
    profile: 'qwen3',
    input: { text: 'waiting', language: 'en', voiceRef: 'voice:a' },
  });
  let completed = await queue.wait(submitted.jobId);

  assert.equal(completed.status, 'failed');
  assert.equal(completed.timeout, true);
  assert.equal(completed.error.code, 'TIMEOUT');
  assert.equal(executeCalls, 0);
  assert.ok(events.some((event) => event.type === 'audio-job:not-ready'));
  assert.ok(events.some((event) => event.type === 'audio-job:timeout' && event.stage === 'timeout'));
});

test('provider job queue keeps explicit running cancel distinct from timeout', async () => {
  let registry = createAudioProviderRegistry([
    {
      id: 'qwen3-local',
      kind: 'local-tts',
      profile: 'qwen3',
      execute: async (_job, context = {}) => new Promise((resolve, reject) => {
        context.signal.addEventListener('abort', () => reject(context.signal.reason), { once: true });
      }),
    },
  ]);
  let queue = createAudioProviderJobQueue({ registry, timeoutMs: 1000 });

  let submitted = await queue.submit({
    id: 'cancel-running',
    kind: 'tts',
    providerId: 'qwen3-local',
    profile: 'qwen3',
    input: { text: 'cancel', language: 'en', voiceRef: 'voice:a' },
  });
  await delay(1);
  await queue.cancel(submitted.jobId, 'operator canceled');
  let completed = await queue.wait(submitted.jobId);

  assert.equal(completed.status, 'canceled');
  assert.equal(completed.timeout, undefined);
  assert.equal(completed.cancelReason, 'operator canceled');
});

test('local audio TTS provider uses injected HTTP transport and stores engine artifacts', async () => {
  let root = await mkdtemp(join(os.tmpdir(), 'sym-engine-audio-http-'));
  try {
    let seen;
    let store = createFileArtifactStore({ root });
    let provider = createLocalAudioTtsProvider({
      id: 'qwen3-http',
      profile: 'qwen3',
      endpoint: 'http://local-audio.test',
      artifactStore: store,
      fetch: async (url, options) => {
        seen = { url, options };
        let bytes = Buffer.from('RIFFfakewav');
        return {
          ok: true,
          status: 200,
          headers: {
            get(name) {
              return {
                'content-type': 'audio/wav',
                'x-audio-duration-sec': '1.2',
                'x-audio-sample-rate': '24000',
              }[String(name).toLowerCase()] || null;
            },
          },
          async arrayBuffer() {
            return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
          },
        };
      },
    });

    let result = await provider.execute({
      kind: 'tts',
      providerId: 'qwen3-http',
      profile: 'qwen3',
      input: {
        text: 'Hola',
        language: 'es',
        voiceRef: 'voice:mateo-es-v1',
        style: 'warm',
      },
    });

    assert.equal(seen.url, 'http://local-audio.test/synthesize');
    assert.deepEqual(JSON.parse(seen.options.body), {
      model: 'qwen3',
      items: [{
        id: 'job',
        text: 'Hola',
        language: 'es',
        voiceRef: 'voice:mateo-es-v1',
        style: 'warm',
        format: 'wav',
        normalize: true,
      }],
    });
    assert.match(result.artifactId, /^sha256:[a-f0-9]{64}$/);
    assert.equal((await store.get(result.artifactId)).metadata.voiceRef, 'voice:mateo-es-v1');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('audio provider boundary stays out of workspace and browser avoids node-only stores', async () => {
  let files = [
    '../contracts/audio-provider.js',
    '../provider-jobs.js',
    '../artifacts.js',
    '../providers/local-audio-tts.js',
    '../providers/local-audio-transcribe.js',
  ];
  for (let file of files) {
    let source = await readFile(new URL(file, import.meta.url), 'utf8');
    assert.doesNotMatch(source, /symbiote-workspace/, `${file} must not import workspace`);
  }

  let browserSource = await readFile(new URL('../browser.js', import.meta.url), 'utf8');
  assert.doesNotMatch(browserSource, /artifacts|provider-jobs|local-audio/);
});
