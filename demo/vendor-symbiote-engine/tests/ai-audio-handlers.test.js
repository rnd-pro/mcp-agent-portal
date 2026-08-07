import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

import ttsHandler from '../packs/ai/tts.handler.js';
import whisperHandler from '../packs/ai/whisper.handler.js';

const AUDIO_REF = `sha256:${'a'.repeat(64)}`;
const TRANSCRIPT_REF = `sha256:${'b'.repeat(64)}`;

function forbiddenParamAssertions(params) {
  for (let key of ['mode', 'remoteHost', 'remotePath', 'remoteVenv', 'device', 'endpoint', 'outputDir', 'refAudio']) {
    assert.equal(params[key], undefined, `${key} must not be a serialized provider param`);
  }
}

test('ai/tts exposes portable provider params and submits synthesis to injected audio queue', async () => {
  forbiddenParamAssertions(ttsHandler.driver.params);
  assert.equal(ttsHandler.driver.params.providerId.default, 'local-tts');
  assert.equal(ttsHandler.driver.params.profile.default, 'qwen3');
  assert.equal(ttsHandler.driver.params.voiceRef.default, 'qwen3:speaker:vivian');

  let seenJob;
  let queue = {
    async submit(job) {
      seenJob = job;
      return {
        status: 'succeeded',
        result: {
          artifactId: AUDIO_REF,
          path: '/runtime/artifacts/abc.wav',
          mimeType: 'audio/wav',
          durationSec: 1.25,
          sampleRate: 24000,
        },
      };
    },
  };

  let output = await ttsHandler.lifecycle.execute(
    { text: 'Hola mundo' },
    {
      providerId: 'local-tts',
      profile: 'qwen3',
      language: 'es',
      voiceRef: 'voice:mateo-es-v1',
      style: 'warm',
      context: { audio: { queue } },
    },
  );

  assert.equal(seenJob.kind, 'tts');
  assert.equal(seenJob.providerId, 'local-tts');
  assert.equal(seenJob.profile, 'qwen3');
  assert.deepEqual(seenJob.input, {
    text: 'Hola mundo',
    language: 'es',
    voiceRef: 'voice:mateo-es-v1',
    style: 'warm',
    format: 'wav',
    normalize: true,
  });
  assert.equal(output.audioRef, AUDIO_REF);
  assert.equal(output.audioPath, '/runtime/artifacts/abc.wav');
  assert.equal(output.audio.src, '/runtime/artifacts/abc.wav');
  assert.equal(output.audio.duration, 1.25);
  assert.equal(output.error, null);
});

test('ai/tts returns a clean error when no audio queue is injected', async () => {
  let output = await ttsHandler.lifecycle.execute({ text: 'Hola' }, {});

  assert.equal(output.audioRef, null);
  assert.match(output.error, /audio provider queue/i);
});

test('ai/tts cache key uses audio cache key dimensions instead of mode or endpoints', () => {
  let key = ttsHandler.lifecycle.cacheKey(
    { text: 'Hola' },
    {
      providerId: 'local-tts',
      profile: 'qwen3',
      modelVersion: 'Qwen3-TTS-12Hz-1.7B-Base',
      language: 'es',
      voiceRef: 'voice:mateo-es-v1',
      style: 'warm',
      providerSettings: { sampleRate: 24000 },
    },
  );
  let providerVariant = ttsHandler.lifecycle.cacheKey(
    { text: 'Hola' },
    {
      providerId: 'other-local-tts',
      profile: 'qwen3',
      modelVersion: 'Qwen3-TTS-12Hz-1.7B-Base',
      language: 'es',
      voiceRef: 'voice:mateo-es-v1',
      style: 'warm',
      providerSettings: { sampleRate: 24000 },
    },
  );
  let settingsVariant = ttsHandler.lifecycle.cacheKey(
    { text: 'Hola' },
    {
      providerId: 'local-tts',
      profile: 'qwen3',
      modelVersion: 'Qwen3-TTS-12Hz-1.7B-Base',
      language: 'es',
      voiceRef: 'voice:mateo-es-v1',
      style: 'warm',
      providerSettings: { sampleRate: 48000 },
    },
  );

  assert.match(key, /^audio:/);
  assert.notEqual(key, providerVariant);
  assert.notEqual(key, settingsVariant);
  assert.doesNotMatch(key, /ssh|http|localhost|remote|endpoint/);
});

test('ai/whisper exposes portable provider params and submits transcription to injected audio queue', async () => {
  forbiddenParamAssertions(whisperHandler.driver.params);
  assert.equal(whisperHandler.driver.params.providerId.default, 'local-whisper');
  assert.equal(whisperHandler.driver.params.profile.default, 'whisper');

  let seenJob;
  let queue = {
    async submit(job) {
      seenJob = job;
      return {
        status: 'succeeded',
        result: {
          artifactId: TRANSCRIPT_REF,
          mimeType: 'application/json',
          text: 'hola mundo',
          words: [{ word: 'hola', startSec: 0, endSec: 0.4 }],
          durationSec: 0.9,
          sampleRate: 1,
        },
      };
    },
  };

  let output = await whisperHandler.lifecycle.execute(
    { audioRef: AUDIO_REF },
    {
      providerId: 'local-whisper',
      profile: 'whisper',
      language: 'es',
      model: 'large-v3',
      context: { audio: { queue } },
    },
  );

  assert.equal(seenJob.kind, 'transcribe');
  assert.equal(seenJob.providerId, 'local-whisper');
  assert.deepEqual(seenJob.input, {
    audioRef: AUDIO_REF,
    language: 'es',
    model: 'large-v3',
  });
  assert.equal(output.text, 'hola mundo');
  assert.deepEqual(output.words, [{ word: 'hola', startSec: 0, endSec: 0.4 }]);
  assert.equal(output.duration, 0.9);
  assert.equal(output.transcript.duration, 0.9);
  assert.equal(output.error, null);
});

test('ai/whisper returns a clean error when no audio queue is injected', async () => {
  let output = await whisperHandler.lifecycle.execute({ audioRef: AUDIO_REF }, {});

  assert.equal(output.text, null);
  assert.match(output.error, /audio provider queue/i);
});

test('ai/tts and ai/whisper source no longer contain SSH, localhost, or path-provider code', async () => {
  for (let file of ['../packs/ai/tts.handler.js', '../packs/ai/whisper.handler.js']) {
    let source = await readFile(new URL(file, import.meta.url), 'utf8');
    assert.doesNotMatch(source, /run-command-watchdog|remoteHost|remotePath|remoteVenv|TTS_REMOTE|WHISPER_REMOTE/);
    assert.doesNotMatch(source, /ssh |scp |localhost|127\.0\.0\.1|os\.tmpdir|refAudio|outputDir/);
  }
});
