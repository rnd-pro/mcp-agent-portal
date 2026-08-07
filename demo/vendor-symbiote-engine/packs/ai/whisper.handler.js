/**
 * ai/whisper — audio transcription through the injected audio provider queue.
 *
 * @module symbiote-engine/packs/ai/whisper
 */

import { createAudioCacheKey } from '../../contracts/audio-provider.js';

const DEFAULT_PROVIDER_ID = 'local-whisper';
const DEFAULT_PROFILE = 'whisper';

function cleanString(value, fallback = '') {
  let text = String(value ?? fallback ?? '').replace(/\s+/g, ' ').trim();
  return text && text !== 'undefined' && text !== 'null' ? text : String(fallback || '').trim();
}

function audioQueue(params) {
  return params.context?.audio?.queue;
}

function audioRefFromInputs(inputs) {
  if (typeof inputs.audioRef === 'string') return inputs.audioRef;
  if (typeof inputs.audio === 'string') return inputs.audio;
  if (inputs.audio && typeof inputs.audio === 'object') {
    return inputs.audio.artifactId || inputs.audio.audioRef || inputs.audio.src;
  }
  return inputs.audioPath || '';
}

function queueMissing() {
  return {
    transcript: null,
    text: null,
    words: null,
    duration: 0,
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
      transcript: null,
      text: null,
      words: null,
      duration: 0,
      error: record?.error?.message || record?.error || `Audio provider job ${record?.status || 'did not complete'}.`,
    };
  }

  let result = record.result || {};
  let words = Array.isArray(result.words) ? result.words : [];
  let text = cleanString(result.text, words.map((word) => word.word).join(' '));
  let duration = Number(result.durationSec ?? result.duration ?? (words.at(-1)?.endSec || words.at(-1)?.end || 0));
  let transcript = {
    text,
    words,
    duration,
    durationSec: duration,
    artifactId: result.artifactId || null,
  };

  return {
    transcript,
    text,
    words,
    duration,
    error: null,
  };
}

export default {
  type: 'ai/whisper',
  category: 'ai',
  icon: 'hearing',

  driver: {
    description: 'Audio transcription through an injected audio provider queue',
    inputs: [
      { name: 'audioRef', type: 'string' },
      { name: 'audio', type: 'audio' },
    ],
    outputs: [
      { name: 'transcript', type: 'transcript' },
      { name: 'text', type: 'string' },
      { name: 'words', type: 'any' },
      { name: 'duration', type: 'number' },
      { name: 'error', type: 'string' },
    ],
    params: {
      providerId: { type: 'string', default: DEFAULT_PROVIDER_ID, description: 'Audio provider ID' },
      profile: { type: 'string', default: DEFAULT_PROFILE, description: 'Audio provider profile' },
      language: { type: 'string', default: 'es', description: 'Language code' },
      model: { type: 'string', default: 'large-v3', description: 'Transcription model ID' },
      priority: { type: 'string', default: 'batch', description: 'interactive | batch' },
      modelVersion: { type: 'string', default: '', description: 'Provider model version' },
      timeout: { type: 'int', default: 300000, description: 'Max wait time (ms)' },
    },
  },

  lifecycle: {
    validate: (inputs) => Boolean(audioRefFromInputs(inputs)),

    cacheKey: (inputs, params) => createAudioCacheKey({
      kind: 'transcribe',
      providerId: params.providerId || DEFAULT_PROVIDER_ID,
      profile: params.profile || DEFAULT_PROFILE,
      modelVersion: params.modelVersion || params.model || '',
      providerSettings: params.providerSettings || {},
      input: {
        audioRef: audioRefFromInputs(inputs),
        language: params.language || 'es',
        model: params.model || 'large-v3',
      },
    }),

    execute: async (inputs, params) => {
      let queue = audioQueue(params);
      if (!queue || typeof queue.submit !== 'function') return queueMissing();

      try {
        let record = await queue.submit({
          kind: 'transcribe',
          providerId: params.providerId || DEFAULT_PROVIDER_ID,
          profile: params.profile || DEFAULT_PROFILE,
          priority: params.priority || 'batch',
          modelVersion: params.modelVersion || params.model || '',
          providerSettings: params.providerSettings || {},
          input: {
            audioRef: audioRefFromInputs(inputs),
            language: params.language || 'es',
            model: params.model || 'large-v3',
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
