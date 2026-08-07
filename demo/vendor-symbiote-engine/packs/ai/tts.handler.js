/**
 * ai/tts — text-to-speech through the injected audio provider queue.
 *
 * @module symbiote-engine/packs/ai/tts
 */

import { createAudioCacheKey } from '../../contracts/audio-provider.js';

const DEFAULT_PROVIDER_ID = 'local-tts';
const DEFAULT_PROFILE = 'qwen3';
const DEFAULT_VOICE_REF = 'qwen3:speaker:vivian';

function cleanString(value, fallback = '') {
  let text = String(value ?? fallback ?? '').replace(/\s+/g, ' ').trim();
  return text && text !== 'undefined' && text !== 'null' ? text : String(fallback || '').trim();
}

function audioQueue(params) {
  return params.context?.audio?.queue;
}

function queueMissing() {
  return {
    audio: null,
    audioRef: null,
    audioPath: null,
    duration: 0,
    sampleRate: null,
    error: 'Audio provider queue is not connected.',
  };
}

async function resolveSubmittedJob(queue, record) {
  if (record?.status === 'succeeded' || record?.status === 'failed' || record?.status === 'canceled') {
    return record;
  }
  if (typeof queue.wait === 'function') return queue.wait(record.jobId);
  if (typeof queue.drain === 'function') {
    await queue.drain();
    return typeof queue.get === 'function' ? queue.get(record.jobId) : record;
  }
  return record;
}

function formatResult(record) {
  if (!record || record.status !== 'succeeded') {
    return {
      audio: null,
      audioRef: null,
      audioPath: null,
      duration: 0,
      sampleRate: null,
      error: record?.error?.message || record?.error || `Audio provider job ${record?.status || 'did not complete'}.`,
    };
  }

  let result = record.result || {};
  let audioRef = cleanString(result.artifactId || result.audioRef || result.src, '');
  let path = cleanString(result.path || result.filePath || '', '');
  let src = path || audioRef;
  let duration = Number(result.durationSec ?? result.duration ?? 0);
  let sampleRate = result.sampleRate ?? result.sample_rate ?? null;

  return {
    audio: src ? {
      src,
      artifactId: audioRef,
      duration,
      durationSec: duration,
      sampleRate,
      mimeType: result.mimeType || 'audio/wav',
    } : null,
    audioRef: audioRef || null,
    audioPath: path || null,
    duration,
    sampleRate,
    error: null,
  };
}

export default {
  type: 'ai/tts',
  category: 'ai',
  icon: 'record_voice_over',

  driver: {
    description: 'Text-to-speech through an injected audio provider queue',
    inputs: [{ name: 'text', type: 'string' }],
    outputs: [
      { name: 'audio', type: 'audio' },
      { name: 'audioRef', type: 'string' },
      { name: 'audioPath', type: 'string' },
      { name: 'duration', type: 'number' },
      { name: 'error', type: 'string' },
    ],
    params: {
      providerId: { type: 'string', default: DEFAULT_PROVIDER_ID, description: 'Audio provider ID' },
      profile: { type: 'string', default: DEFAULT_PROFILE, description: 'Audio provider profile' },
      language: { type: 'string', default: 'es', description: 'Language code' },
      voiceRef: { type: 'string', default: DEFAULT_VOICE_REF, description: 'Portable voice reference ID' },
      style: { type: 'string', default: '', description: 'Voice style instruction' },
      format: { type: 'string', default: 'wav', description: 'Output format' },
      normalize: { type: 'boolean', default: true, description: 'Normalize generated audio' },
      priority: { type: 'string', default: 'batch', description: 'interactive | batch' },
      modelVersion: { type: 'string', default: '', description: 'Provider model version' },
      timeout: { type: 'int', default: 120000, description: 'Max wait time (ms)' },
    },
  },

  lifecycle: {
    validate: (inputs) => typeof inputs.text === 'string' && inputs.text.length > 0,

    cacheKey: (inputs, params) => createAudioCacheKey({
      kind: 'tts',
      providerId: params.providerId || DEFAULT_PROVIDER_ID,
      profile: params.profile || DEFAULT_PROFILE,
      modelVersion: params.modelVersion || '',
      providerSettings: params.providerSettings || {},
      input: {
        text: inputs.text,
        language: params.language || 'es',
        voiceRef: params.voiceRef || DEFAULT_VOICE_REF,
        style: params.style || '',
        format: params.format || 'wav',
        normalize: params.normalize !== false,
      },
    }),

    execute: async (inputs, params) => {
      let queue = audioQueue(params);
      if (!queue || typeof queue.submit !== 'function') return queueMissing();

      try {
        let record = await queue.submit({
          kind: 'tts',
          providerId: params.providerId || DEFAULT_PROVIDER_ID,
          profile: params.profile || DEFAULT_PROFILE,
          priority: params.priority || 'batch',
          modelVersion: params.modelVersion || '',
          providerSettings: params.providerSettings || {},
          input: {
            text: inputs.text,
            language: params.language || 'es',
            voiceRef: params.voiceRef || DEFAULT_VOICE_REF,
            style: params.style || '',
            format: params.format || 'wav',
            normalize: params.normalize !== false,
          },
        });
        return formatResult(await resolveSubmittedJob(queue, record));
      } catch (err) {
        return {
          ...queueMissing(),
          error: err?.message || String(err),
        };
      }
    },
  },
};
