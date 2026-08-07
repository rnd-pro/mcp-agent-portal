import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import os from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { createFileArtifactStore } from '../artifacts.js';
import { createLocalAudioTranscribeProvider } from '../providers/local-audio-transcribe.js';
import { createLocalAudioTtsProvider } from '../providers/local-audio-tts.js';

const WAV_BYTES = Buffer.from('RIFF0000WAVEfmt data');

function arrayBufferFrom(buffer) {
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
}

function response({ status = 200, headers = {}, body = Buffer.alloc(0), json } = {}) {
  let lowerHeaders = Object.fromEntries(
    Object.entries(headers).map(([key, value]) => [key.toLowerCase(), String(value)]),
  );
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get(name) {
        return lowerHeaders[String(name).toLowerCase()] || null;
      },
    },
    async arrayBuffer() {
      return arrayBufferFrom(Buffer.from(body));
    },
    async json() {
      return json;
    },
  };
}

test('local audio TTS HTTP provider probes readiness and stores engine-owned audio artifacts', async () => {
  let root = await mkdtemp(join(os.tmpdir(), 'sym-engine-tts-http-'));
  try {
    let store = createFileArtifactStore({ root });
    let calls = [];
    let provider = createLocalAudioTtsProvider({
      id: 'qwen3-http',
      profile: 'qwen3',
      endpoint: 'http://local-audio.test',
      artifactStore: store,
      fetch: async (url, options = {}) => {
        calls.push({ url, options });
        if (String(url).endsWith('/readyz')) {
          return response({
            json: { ready: true, model: 'qwen3', modelVersion: 'test' },
          });
        }
        return response({
          headers: {
            'content-type': 'audio/wav',
            'x-audio-duration-sec': '1.25',
            'x-audio-sample-rate': '24000',
          },
          body: WAV_BYTES,
        });
      },
    });

    assert.deepEqual(await provider.checkReady(), {
      ready: true,
      model: 'qwen3',
      modelVersion: 'test',
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

    assert.equal(calls[0].url, 'http://local-audio.test/readyz');
    assert.equal(calls[1].url, 'http://local-audio.test/synthesize');
    assert.deepEqual(JSON.parse(calls[1].options.body), {
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
    assert.equal(result.mimeType, 'audio/wav');
    assert.equal(result.durationSec, 1.25);
    assert.equal(result.sampleRate, 24000);

    let stored = await store.get(result.artifactId);
    assert.equal((await stat(stored.path)).isFile(), true);
    assert.equal((await readFile(stored.path)).toString(), WAV_BYTES.toString());
    assert.equal(stored.metadata.voiceRef, 'voice:mateo-es-v1');
    assert.equal(stored.metadata.profile, 'qwen3');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('local audio transcribe HTTP provider resolves audio refs and stores transcript artifacts', async () => {
  let root = await mkdtemp(join(os.tmpdir(), 'sym-engine-transcribe-http-'));
  try {
    let store = createFileArtifactStore({ root });
    let audio = await store.put(WAV_BYTES, {
      mimeType: 'audio/wav',
      durationSec: 1.25,
      sampleRate: 24000,
    });
    let seen;
    let provider = createLocalAudioTranscribeProvider({
      id: 'whisper-http',
      profile: 'whisper',
      endpoint: 'http://local-audio.test',
      artifactStore: store,
      fetch: async (url, options = {}) => {
        seen = { url, options };
        return response({
          json: {
            text: 'hola mundo',
            durationSec: 1.25,
            words: [
              { word: 'hola', startSec: 0, endSec: 0.4 },
              { word: 'mundo', startSec: 0.5, endSec: 1.1 },
            ],
          },
        });
      },
    });

    let result = await provider.execute({
      kind: 'transcribe',
      providerId: 'whisper-http',
      profile: 'whisper',
      input: {
        audioRef: audio.artifactId,
        language: 'es',
        model: 'large-v3',
      },
    });

    assert.equal(seen.url, 'http://local-audio.test/transcribe');
    assert.deepEqual(JSON.parse(seen.options.body), {
      audioRef: audio.artifactId,
      audioBase64: WAV_BYTES.toString('base64'),
      mimeType: 'audio/wav',
      language: 'es',
      model: 'large-v3',
    });
    assert.match(result.artifactId, /^sha256:[a-f0-9]{64}$/);
    assert.equal(result.mimeType, 'application/json');
    assert.equal(result.text, 'hola mundo');
    assert.equal(result.durationSec, 1.25);
    assert.deepEqual(result.words, [
      { word: 'hola', startSec: 0, endSec: 0.4 },
      { word: 'mundo', startSec: 0.5, endSec: 1.1 },
    ]);

    let stored = await store.get(result.artifactId);
    assert.equal(stored.mimeType, 'application/json');
    assert.equal(stored.metadata.text, 'hola mundo');

    await assert.rejects(
      () => provider.execute({
        kind: 'transcribe',
        providerId: 'whisper-http',
        profile: 'whisper',
        input: { audioPath: 'local.wav', language: 'es' },
      }),
      /audioRef/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
