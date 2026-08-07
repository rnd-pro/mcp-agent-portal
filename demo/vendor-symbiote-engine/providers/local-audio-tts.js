import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

import {
  AUDIO_SYNTHESIS_RECEIPT_HEADER,
  canonicalAudioSynthesisJson,
  createAudioProviderNotReadyError,
  normalizeAudioArtifact,
  normalizeAudioProvider,
  normalizeAudioProviderReadiness,
  normalizeAudioSynthesisReceipt,
} from '../contracts/audio-provider.js';

const EMPTY_HMAC = '0'.repeat(64);

function receiptError(code, message) {
  let error = new Error(message);
  error.code = code;
  return error;
}

function receiptSecretBytes(secret) {
  if (secret === undefined || secret === null) {
    throw receiptError('AUDIO_SYNTHESIS_RECEIPT_SECRET_INVALID', 'local audio TTS provider requires receiptSecret');
  }
  let bytes = Buffer.isBuffer(secret) ? secret : Buffer.from(secret);
  if (bytes.length < 32) {
    throw receiptError('AUDIO_SYNTHESIS_RECEIPT_SECRET_INVALID', 'local audio TTS provider receiptSecret must be at least 32 bytes');
  }
  return bytes;
}

function receiptPayload(receipt) {
  let normalized = normalizeAudioSynthesisReceipt({
    ...receipt,
    receiptHmac: receipt?.receiptHmac || EMPTY_HMAC,
  });
  let { receiptHmac, ...payload } = normalized;
  return payload;
}

function sameDigest(actual, expected) {
  let actualBytes = Buffer.from(actual, 'hex');
  let expectedBytes = Buffer.from(expected, 'hex');
  return actualBytes.length === expectedBytes.length && timingSafeEqual(actualBytes, expectedBytes);
}

export function createAudioSynthesisRequestHash(item) {
  return createHash('sha256').update(canonicalAudioSynthesisJson(item)).digest('hex');
}

export function createAudioArtifactHash(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

export function createAudioSynthesisReceiptHmac(receipt, receiptSecret) {
  return createHmac('sha256', receiptSecretBytes(receiptSecret))
    .update(canonicalAudioSynthesisJson(receiptPayload(receipt)))
    .digest('hex');
}

export function parseAudioSynthesisReceipt(encodedReceipt) {
  let encoded = cleanString(encodedReceipt, '');
  if (!encoded) {
    throw receiptError('AUDIO_SYNTHESIS_RECEIPT_MISSING', `${AUDIO_SYNTHESIS_RECEIPT_HEADER} header is required`);
  }
  if (!/^[A-Za-z0-9_-]+$/.test(encoded)) {
    throw receiptError('AUDIO_SYNTHESIS_RECEIPT_INVALID', `${AUDIO_SYNTHESIS_RECEIPT_HEADER} must be base64url`);
  }
  let bytes = Buffer.from(encoded, 'base64url');
  if (bytes.toString('base64url') !== encoded) {
    throw receiptError('AUDIO_SYNTHESIS_RECEIPT_INVALID', `${AUDIO_SYNTHESIS_RECEIPT_HEADER} must use canonical base64url`);
  }
  let parsed;
  try {
    parsed = JSON.parse(bytes.toString('utf8'));
  } catch {
    throw receiptError('AUDIO_SYNTHESIS_RECEIPT_INVALID', `${AUDIO_SYNTHESIS_RECEIPT_HEADER} must contain JSON`);
  }
  let normalized;
  try {
    normalized = normalizeAudioSynthesisReceipt(parsed);
  } catch (error) {
    throw receiptError('AUDIO_SYNTHESIS_RECEIPT_INVALID', error.message);
  }
  if (bytes.toString('utf8') !== canonicalAudioSynthesisJson(normalized)) {
    throw receiptError('AUDIO_SYNTHESIS_RECEIPT_INVALID', `${AUDIO_SYNTHESIS_RECEIPT_HEADER} JSON must be canonical`);
  }
  return normalized;
}

export function verifyAudioSynthesisReceipt({
  encodedReceipt,
  receiptSecret,
  item,
  audioBytes,
  mimeType,
  durationSec,
  sampleRate,
} = {}) {
  let secret = receiptSecretBytes(receiptSecret);
  let receipt = parseAudioSynthesisReceipt(encodedReceipt);
  let expectedRequestHash = createAudioSynthesisRequestHash(item);
  let expectedArtifactHash = createAudioArtifactHash(audioBytes);
  let expectedHmac = createAudioSynthesisReceiptHmac(receipt, secret);
  if (!sameDigest(receipt.receiptHmac, expectedHmac)) {
    throw receiptError('AUDIO_SYNTHESIS_RECEIPT_HMAC_INVALID', 'audio synthesis receipt HMAC verification failed');
  }
  if (!sameDigest(receipt.requestHash, expectedRequestHash)) {
    throw receiptError('AUDIO_SYNTHESIS_RECEIPT_REQUEST_MISMATCH', 'audio synthesis receipt does not match the public TTS item');
  }
  if (!sameDigest(receipt.artifactHash, expectedArtifactHash)) {
    throw receiptError('AUDIO_SYNTHESIS_RECEIPT_ARTIFACT_MISMATCH', 'audio synthesis receipt does not match the WAV bytes');
  }
  let probe = receipt.speakerProbe;
  if (!probe.enrolledVoiceMatch || !probe.segmentsConsistent
    || probe.maxEnrolledDistance > probe.thresholds.enrolledDistanceMax
    || probe.minOtherVoiceMargin < probe.thresholds.otherVoiceMarginMin
    || probe.maxSegmentDistance > probe.thresholds.segmentDistanceMax) {
    throw receiptError('AUDIO_SYNTHESIS_RECEIPT_SPEAKER_PROBE_FAILED', 'audio synthesis receipt speaker probe did not satisfy its signed verdicts and thresholds');
  }
  let expectedNormalization = item.normalize !== false;
  if (receipt.normalization.applied !== expectedNormalization) {
    throw receiptError('AUDIO_SYNTHESIS_RECEIPT_NORMALIZATION_FAILED', 'audio synthesis receipt normalization does not match the public TTS item');
  }
  if (receipt.requestedVoiceRef !== item.voiceRef) {
    throw receiptError('AUDIO_SYNTHESIS_RECEIPT_VOICE_MISMATCH', 'audio synthesis receipt requested voice does not match the TTS item');
  }
  if (receipt.language !== item.language) {
    throw receiptError('AUDIO_SYNTHESIS_RECEIPT_LANGUAGE_MISMATCH', 'audio synthesis receipt language does not match the TTS item');
  }
  if (receipt.sampleRate !== Number(sampleRate)) {
    throw receiptError('AUDIO_SYNTHESIS_RECEIPT_SAMPLE_RATE_MISMATCH', 'audio synthesis receipt sample rate does not match the audio response');
  }
  if (receipt.durationMs !== Math.round(Number(durationSec) * 1000)) {
    throw receiptError('AUDIO_SYNTHESIS_RECEIPT_DURATION_MISMATCH', 'audio synthesis receipt duration does not match the audio response');
  }
  if (!['audio/wav', 'audio/x-wav'].includes(cleanString(mimeType, '').toLowerCase())) {
    throw receiptError('AUDIO_SYNTHESIS_RECEIPT_ARTIFACT_MISMATCH', 'audio synthesis receipts require WAV audio bytes');
  }
  return receipt;
}

function cleanString(value, fallback = '') {
  let text = String(value ?? fallback ?? '').replace(/\s+/g, ' ').trim();
  return text && text !== 'undefined' && text !== 'null' ? text : String(fallback || '').trim();
}

function endpointUrl(endpoint, path) {
  let base = cleanString(endpoint, '');
  if (!base) throw new Error('local audio TTS provider requires an endpoint');
  return `${base.replace(/\/+$/, '')}${path}`;
}

function header(response, name) {
  return response?.headers?.get?.(name) || response?.headers?.get?.(name.toLowerCase()) || null;
}

function voiceRefId(input = {}) {
  let ref = input.voiceRef ?? input.voiceReference;
  if (ref && typeof ref === 'object') return cleanString(ref.id, 'voice:default') || 'voice:default';
  return cleanString(ref, 'voice:default') || 'voice:default';
}

function itemFromJob(job) {
  let input = job.input || {};
  return {
    id: cleanString(input.id, 'job') || 'job',
    text: cleanString(input.text, ''),
    language: cleanString(input.language, 'auto') || 'auto',
    voiceRef: voiceRefId(input),
    style: cleanString(input.style || input.instruct, ''),
    format: cleanString(input.format, 'wav') || 'wav',
    normalize: input.normalize !== false,
  };
}

async function readError(response, fallback) {
  try {
    let data = await response.json();
    return data?.error?.message || data?.message || fallback;
  } catch {
    return fallback;
  }
}

async function readAudioBytes(response) {
  let contentType = cleanString(header(response, 'content-type'), '');
  if (contentType.includes('application/json')) {
    let data = await response.json();
    if (!data?.audioBase64) throw new Error('local audio TTS provider requires audioBase64 or audio bytes');
    return {
      bytes: Buffer.from(data.audioBase64, 'base64'),
      mimeType: cleanString(data.mimeType, 'audio/wav') || 'audio/wav',
      durationSec: Number(data.durationSec ?? data.duration),
      sampleRate: Number(data.sampleRate ?? data.sample_rate),
      text: data.text,
      words: data.words,
    };
  }
  let bytes = Buffer.from(await response.arrayBuffer());
  return {
    bytes,
    mimeType: contentType.split(';')[0] || 'audio/wav',
    durationSec: Number(header(response, 'x-audio-duration-sec')),
    sampleRate: Number(header(response, 'x-audio-sample-rate')),
  };
}

export function createLocalAudioTtsProvider(options = {}) {
  let fetchImpl = options.fetch || globalThis.fetch;
  if (typeof fetchImpl !== 'function') throw new Error('local audio TTS provider requires fetch');
  let artifactStore = options.artifactStore || options.store;
  if (!artifactStore || typeof artifactStore.put !== 'function') {
    throw new Error('local audio TTS provider requires an artifact store');
  }
  let receiptSecret = receiptSecretBytes(options.receiptSecret);
  let provider = normalizeAudioProvider({
    id: options.id || 'local-tts',
    kind: options.kind || 'local-tts',
    profile: options.profile || 'local',
    modelClass: options.modelClass || options.profile || 'local-tts',
    modelVersion: options.modelVersion,
    checkReady: async (job, context = {}) => {
      let response = await fetchImpl(endpointUrl(options.endpoint, '/readyz'), {
        method: 'GET',
        signal: context.signal,
      });
      let data = await response.json().catch(() => ({}));
      if (response.status === 503) return normalizeAudioProviderReadiness({ ready: false, ...data });
      if (!response.ok) throw new Error(`local audio TTS provider readiness responded ${response.status}`);
      return normalizeAudioProviderReadiness(data);
    },
    execute: async (job, context = {}) => {
      if (job.kind !== 'tts') throw new Error(`local audio TTS provider handles "tts", got "${job.kind}"`);
      let item = itemFromJob(job);
      if (!item.text) throw new Error('local audio TTS provider requires input.text');
      let response = await fetchImpl(endpointUrl(options.endpoint, '/synthesize'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: context.signal,
        body: JSON.stringify({
          model: provider.profile,
          items: [item],
        }),
      });
      if (response.status === 503) {
        throw createAudioProviderNotReadyError(await readError(response, 'local audio TTS provider is not ready'));
      }
      if (!response.ok) throw new Error(`local audio TTS provider responded ${response.status}: ${await readError(response, 'request failed')}`);
      let result = await readAudioBytes(response);
      if (!result.bytes.length) throw new Error('local audio TTS provider returned empty audio');
      let synthesisReceipt = verifyAudioSynthesisReceipt({
        encodedReceipt: header(response, AUDIO_SYNTHESIS_RECEIPT_HEADER),
        receiptSecret,
        item,
        audioBytes: result.bytes,
        mimeType: result.mimeType,
        durationSec: result.durationSec,
        sampleRate: result.sampleRate,
      });
      let artifact = await artifactStore.put(result.bytes, {
        mimeType: result.mimeType || 'audio/wav',
        durationSec: result.durationSec,
        sampleRate: result.sampleRate,
        text: item.text,
        language: item.language,
        voiceRef: item.voiceRef,
        style: item.style,
        profile: provider.profile,
        providerId: provider.id,
        modelVersion: provider.modelVersion,
        synthesisReceipt,
      });
      return normalizeAudioArtifact({
        artifactId: artifact.artifactId,
        mimeType: artifact.mimeType,
        durationSec: result.durationSec,
        sampleRate: result.sampleRate,
        text: result.text,
        words: result.words,
        synthesisReceipt,
      });
    },
  });
  return provider;
}
