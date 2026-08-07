import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm, stat } from 'node:fs/promises';
import os from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { createFileArtifactStore } from '../artifacts.js';
import { createLocalAudioTranscribeProvider } from '../providers/local-audio-transcribe.js';
import {
  createAudioArtifactHash,
  createAudioSynthesisReceiptHmac,
  createAudioSynthesisRequestHash,
  createLocalAudioTtsProvider,
} from '../providers/local-audio-tts.js';
import {
  AUDIO_SYNTHESIS_RECEIPT_VERSION,
  canonicalAudioSynthesisJson,
} from '../contracts/audio-provider.js';

const WAV_BYTES = Buffer.from('RIFF0000WAVEfmt data');
const RECEIPT_SECRET = 'test-receipt-secret-is-at-least-32-bytes';

function synthesisItem(overrides = {}) {
  return {
    id: 'job',
    text: 'Hola',
    language: 'es',
    voiceRef: 'voice:mateo-es-v1',
    style: 'warm',
    format: 'wav',
    normalize: true,
    ...overrides,
  };
}

function signedReceipt(item, bytes = WAV_BYTES, overrides = {}) {
  let receipt = {
    receiptVersion: AUDIO_SYNTHESIS_RECEIPT_VERSION,
    requestHash: createAudioSynthesisRequestHash(item),
    requestedVoiceRef: item.voiceRef,
    resolvedVoiceRef: 'qwen3:speaker:vivian',
    speakerAttestation: 'c'.repeat(64),
    speakerProbe: {
      probeFamily: 'speaker-embedding-v1',
      probeVersionToken: 'a'.repeat(64),
      enrollmentRevision: 'b'.repeat(64),
      segmentationRevision: 'segments-v1',
      segmentCount: 3,
      enrolledVoiceMatch: true,
      segmentsConsistent: true,
      maxEnrolledDistance: 0.2,
      minOtherVoiceMargin: 0.4,
      maxSegmentDistance: 0.15,
      thresholds: {
        enrolledDistanceMax: 0.3,
        otherVoiceMarginMin: 0.25,
        segmentDistanceMax: 0.2,
      },
    },
    normalization: {
      version: 'loudnorm-v1',
      applied: true,
      targetLufs: -16,
      truePeakLimitDbfs: -1.5,
    },
    model: { family: 'qwen3', versionToken: 'd'.repeat(64) },
    language: item.language,
    sampleRate: 24000,
    durationMs: 1250,
    artifactHash: createAudioArtifactHash(bytes),
    ...overrides,
  };
  receipt.receiptHmac = createAudioSynthesisReceiptHmac(receipt, RECEIPT_SECRET);
  return receipt;
}

function receiptHeader(receipt) {
  return Buffer.from(canonicalAudioSynthesisJson(receipt)).toString('base64url');
}

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
      receiptSecret: RECEIPT_SECRET,
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
            'x-audio-receipt': receiptHeader(signedReceipt(synthesisItem())),
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
    assert.equal(result.synthesisReceipt.receiptVersion, AUDIO_SYNTHESIS_RECEIPT_VERSION);

    let stored = await store.get(result.artifactId);
    assert.equal((await stat(stored.path)).isFile(), true);
    assert.equal((await readFile(stored.path)).toString(), WAV_BYTES.toString());
    assert.equal(stored.metadata.voiceRef, 'voice:mateo-es-v1');
    assert.equal(stored.metadata.profile, 'qwen3');
    assert.deepEqual(stored.metadata.synthesisReceipt, result.synthesisReceipt);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('local audio TTS rejects missing or malformed synthesis receipts before artifact writes', async () => {
  for (let encodedReceipt of [null, 'not+base64url']) {
    let root = await mkdtemp(join(os.tmpdir(), 'sym-engine-tts-receipt-invalid-'));
    try {
      let provider = createLocalAudioTtsProvider({
        endpoint: 'http://local-audio.test',
        artifactStore: createFileArtifactStore({ root }),
        receiptSecret: RECEIPT_SECRET,
        fetch: async () => response({
          headers: {
            'content-type': 'audio/wav',
            'x-audio-duration-sec': '1.25',
            'x-audio-sample-rate': '24000',
            ...(encodedReceipt ? { 'x-audio-receipt': encodedReceipt } : {}),
          },
          body: WAV_BYTES,
        }),
      });
      await assert.rejects(
        () => provider.execute({
          kind: 'tts',
          providerId: 'local-tts',
          input: synthesisItem(),
        }),
        (error) => error.code === (encodedReceipt
          ? 'AUDIO_SYNTHESIS_RECEIPT_INVALID'
          : 'AUDIO_SYNTHESIS_RECEIPT_MISSING'),
      );
      assert.deepEqual(await readdir(root), []);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }
});

test('local audio TTS accepts signed non-normalized bytes only for normalize false', async () => {
  let item = synthesisItem({ normalize: false });
  let receipt = signedReceipt(item, WAV_BYTES, {
    normalization: { version: 'loudnorm-v1', applied: false, targetLufs: -16, truePeakLimitDbfs: -1.5 },
  });
  let provider = createLocalAudioTtsProvider({
    endpoint: 'http://local-audio.test',
    artifactStore: { put: async (_bytes, metadata) => ({ artifactId: `sha256:${receipt.artifactHash}`, metadata }) },
    receiptSecret: RECEIPT_SECRET,
    fetch: async () => response({
      headers: {
        'content-type': 'audio/wav',
        'x-audio-duration-sec': '1.25',
        'x-audio-sample-rate': '24000',
        'x-audio-receipt': receiptHeader(receipt),
      },
      body: WAV_BYTES,
    }),
  });
  let result = await provider.execute({ kind: 'tts', providerId: 'local-tts', input: item });
  assert.equal(result.synthesisReceipt.normalization.applied, false);
});

test('local audio TTS rejects signed receipts for the wrong request or artifact bytes', async () => {
  let cases = [
    {
      code: 'AUDIO_SYNTHESIS_RECEIPT_REQUEST_MISMATCH',
      receipt: signedReceipt(synthesisItem({ text: 'Otro texto' })),
    },
    {
      code: 'AUDIO_SYNTHESIS_RECEIPT_ARTIFACT_MISMATCH',
      receipt: signedReceipt(synthesisItem(), Buffer.from('RIFFdifferentWAVE')),
    },
  ];
  for (let fixture of cases) {
    let provider = createLocalAudioTtsProvider({
      endpoint: 'http://local-audio.test',
      artifactStore: { put: async () => assert.fail('invalid audio must not be written') },
      receiptSecret: RECEIPT_SECRET,
      fetch: async () => response({
        headers: {
          'content-type': 'audio/wav',
          'x-audio-duration-sec': '1.25',
          'x-audio-sample-rate': '24000',
          'x-audio-receipt': receiptHeader(fixture.receipt),
        },
        body: WAV_BYTES,
      }),
    });
    await assert.rejects(
      () => provider.execute({ kind: 'tts', providerId: 'local-tts', input: synthesisItem() }),
      (error) => error.code === fixture.code,
    );
  }
});

test('local audio TTS rejects invalid receipt HMAC and response consistency mismatches', async () => {
  let badHmac = signedReceipt(synthesisItem());
  badHmac.receiptHmac = `${badHmac.receiptHmac.slice(0, -1)}${badHmac.receiptHmac.endsWith('0') ? '1' : '0'}`;
  let fixtures = [
    { code: 'AUDIO_SYNTHESIS_RECEIPT_HMAC_INVALID', receipt: badHmac },
    { code: 'AUDIO_SYNTHESIS_RECEIPT_VOICE_MISMATCH', receipt: signedReceipt(synthesisItem(), WAV_BYTES, { requestedVoiceRef: 'voice:other' }) },
    { code: 'AUDIO_SYNTHESIS_RECEIPT_LANGUAGE_MISMATCH', receipt: signedReceipt(synthesisItem(), WAV_BYTES, { language: 'en' }) },
    { code: 'AUDIO_SYNTHESIS_RECEIPT_SAMPLE_RATE_MISMATCH', receipt: signedReceipt(synthesisItem(), WAV_BYTES, { sampleRate: 48000 }) },
    { code: 'AUDIO_SYNTHESIS_RECEIPT_DURATION_MISMATCH', receipt: signedReceipt(synthesisItem(), WAV_BYTES, { durationMs: 1200 }) },
  ];
  for (let fixture of fixtures) {
    let provider = createLocalAudioTtsProvider({
      endpoint: 'http://local-audio.test',
      artifactStore: { put: async () => assert.fail('invalid audio must not be written') },
      receiptSecret: RECEIPT_SECRET,
      fetch: async () => response({
        headers: {
          'content-type': 'audio/wav',
          'x-audio-duration-sec': '1.25',
          'x-audio-sample-rate': '24000',
          'x-audio-receipt': receiptHeader(fixture.receipt),
        },
        body: WAV_BYTES,
      }),
    });
    await assert.rejects(
      () => provider.execute({ kind: 'tts', providerId: 'local-tts', input: synthesisItem() }),
      (error) => error.code === fixture.code,
    );
  }
});

test('local audio TTS rejects tampered, negative, and threshold-failing v2 evidence', async () => {
  let tampered = signedReceipt(synthesisItem());
  tampered.speakerProbe.maxEnrolledDistance = 0.21;
  let probe = signedReceipt(synthesisItem()).speakerProbe;
  let fixtures = [
    { code: 'AUDIO_SYNTHESIS_RECEIPT_HMAC_INVALID', receipt: tampered },
    {
      code: 'AUDIO_SYNTHESIS_RECEIPT_SPEAKER_PROBE_FAILED',
      receipt: signedReceipt(synthesisItem(), WAV_BYTES, {
        speakerProbe: { ...probe, enrolledVoiceMatch: false },
      }),
    },
    {
      code: 'AUDIO_SYNTHESIS_RECEIPT_SPEAKER_PROBE_FAILED',
      receipt: signedReceipt(synthesisItem(), WAV_BYTES, {
        speakerProbe: { ...probe, segmentsConsistent: false },
      }),
    },
    {
      code: 'AUDIO_SYNTHESIS_RECEIPT_SPEAKER_PROBE_FAILED',
      receipt: signedReceipt(synthesisItem(), WAV_BYTES, {
        speakerProbe: { ...probe, maxEnrolledDistance: 0.31 },
      }),
    },
    {
      code: 'AUDIO_SYNTHESIS_RECEIPT_SPEAKER_PROBE_FAILED',
      receipt: signedReceipt(synthesisItem(), WAV_BYTES, {
        speakerProbe: { ...probe, minOtherVoiceMargin: 0.24 },
      }),
    },
    {
      code: 'AUDIO_SYNTHESIS_RECEIPT_SPEAKER_PROBE_FAILED',
      receipt: signedReceipt(synthesisItem(), WAV_BYTES, {
        speakerProbe: { ...probe, maxSegmentDistance: 0.21 },
      }),
    },
    {
      code: 'AUDIO_SYNTHESIS_RECEIPT_NORMALIZATION_FAILED',
      receipt: signedReceipt(synthesisItem(), WAV_BYTES, {
        normalization: { ...signedReceipt(synthesisItem()).normalization, applied: false },
      }),
    },
  ];
  for (let fixture of fixtures) {
    let provider = createLocalAudioTtsProvider({
      endpoint: 'http://local-audio.test',
      artifactStore: { put: async () => assert.fail('unverified audio must not be written') },
      receiptSecret: RECEIPT_SECRET,
      fetch: async () => response({
        headers: {
          'content-type': 'audio/wav',
          'x-audio-duration-sec': '1.25',
          'x-audio-sample-rate': '24000',
          'x-audio-receipt': receiptHeader(fixture.receipt),
        },
        body: WAV_BYTES,
      }),
    });
    await assert.rejects(
      () => provider.execute({ kind: 'tts', providerId: 'local-tts', input: synthesisItem() }),
      (error) => error.code === fixture.code,
    );
  }
});

test('local audio TTS rejects out-of-range, private-field, and stale v1 receipts', async () => {
  let outOfRangeProbe = signedReceipt(synthesisItem());
  outOfRangeProbe.speakerProbe.maxSegmentDistance = 2.01;
  let outOfRangeNormalization = signedReceipt(synthesisItem());
  outOfRangeNormalization.normalization.targetLufs = -40;
  let privateField = signedReceipt(synthesisItem());
  privateField.speakerProbe.embedding = [0.1, 0.2];
  let staleV1 = signedReceipt(synthesisItem());
  staleV1.receiptVersion = 'symbiote-audio-synthesis-receipt-v1';
  let fixtures = [outOfRangeProbe, outOfRangeNormalization, privateField, staleV1];
  for (let receipt of fixtures) {
    let provider = createLocalAudioTtsProvider({
      endpoint: 'http://local-audio.test',
      artifactStore: { put: async () => assert.fail('invalid receipt must not be written') },
      receiptSecret: RECEIPT_SECRET,
      fetch: async () => response({
        headers: {
          'content-type': 'audio/wav',
          'x-audio-duration-sec': '1.25',
          'x-audio-sample-rate': '24000',
          'x-audio-receipt': receiptHeader(receipt),
        },
        body: WAV_BYTES,
      }),
    });
    await assert.rejects(
      () => provider.execute({ kind: 'tts', providerId: 'local-tts', input: synthesisItem() }),
      (error) => error.code === 'AUDIO_SYNTHESIS_RECEIPT_INVALID',
    );
  }
});

test('local audio TTS requires an explicit receipt secret of at least 32 bytes', () => {
  let options = {
    endpoint: 'http://local-audio.test',
    artifactStore: { put() {} },
    fetch() {},
  };
  assert.throws(() => createLocalAudioTtsProvider(options), /requires receiptSecret/);
  assert.throws(() => createLocalAudioTtsProvider({ ...options, receiptSecret: 'short' }), /at least 32 bytes/);
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
