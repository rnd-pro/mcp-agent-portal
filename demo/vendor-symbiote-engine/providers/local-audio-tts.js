import {
  createAudioProviderNotReadyError,
  normalizeAudioArtifact,
  normalizeAudioProvider,
  normalizeAudioProviderReadiness,
} from '../contracts/audio-provider.js';

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
      });
      return normalizeAudioArtifact({
        artifactId: artifact.artifactId,
        mimeType: artifact.mimeType,
        durationSec: result.durationSec,
        sampleRate: result.sampleRate,
        text: result.text,
        words: result.words,
      });
    },
  });
  return provider;
}
