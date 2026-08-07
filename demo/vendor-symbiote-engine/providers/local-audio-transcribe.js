import { readFile } from 'node:fs/promises';

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
  if (!base) throw new Error('local audio transcribe provider requires an endpoint');
  return `${base.replace(/\/+$/, '')}${path}`;
}

async function readError(response, fallback) {
  try {
    let data = await response.json();
    return data?.error?.message || data?.message || fallback;
  } catch {
    return fallback;
  }
}

function audioRefFromJob(job) {
  let input = job.input || {};
  let audioRef = cleanString(input.audioRef || input.audio?.artifactId || input.audio?.audioRef || input.audio?.src, '');
  if (!audioRef) throw new Error('local audio transcribe provider requires input.audioRef');
  return audioRef;
}

async function readArtifactBytes(artifactStore, audioRef) {
  if (typeof artifactStore.read === 'function') {
    let artifact = await artifactStore.read(audioRef);
    if (!artifact) throw new Error(`audio artifact "${audioRef}" does not exist`);
    return artifact;
  }
  if (typeof artifactStore.get === 'function') {
    let artifact = await artifactStore.get(audioRef);
    if (!artifact) throw new Error(`audio artifact "${audioRef}" does not exist`);
    return {
      ...artifact,
      content: await readFile(artifact.path),
    };
  }
  throw new Error('local audio transcribe provider requires artifact store read or get');
}

function normalizeWords(words = []) {
  if (!Array.isArray(words)) return [];
  return words.map((word) => ({
    word: cleanString(word.word ?? word.text, ''),
    startSec: Number(word.startSec ?? word.start ?? 0),
    endSec: Number(word.endSec ?? word.end ?? 0),
  }));
}

export function createLocalAudioTranscribeProvider(options = {}) {
  let fetchImpl = options.fetch || globalThis.fetch;
  if (typeof fetchImpl !== 'function') throw new Error('local audio transcribe provider requires fetch');
  let artifactStore = options.artifactStore || options.store;
  if (!artifactStore || typeof artifactStore.put !== 'function') {
    throw new Error('local audio transcribe provider requires an artifact store');
  }
  let provider = normalizeAudioProvider({
    id: options.id || 'local-whisper',
    kind: 'local-transcribe',
    profile: options.profile || 'whisper',
    modelClass: options.modelClass || options.profile || 'whisper',
    modelVersion: options.modelVersion,
    checkReady: async (job, context = {}) => {
      let response = await fetchImpl(endpointUrl(options.endpoint, '/readyz'), {
        method: 'GET',
        signal: context.signal,
      });
      let data = await response.json().catch(() => ({}));
      if (response.status === 503) return normalizeAudioProviderReadiness({ ready: false, ...data });
      if (!response.ok) throw new Error(`local audio transcribe provider readiness responded ${response.status}`);
      return normalizeAudioProviderReadiness(data);
    },
    execute: async (job, context = {}) => {
      if (job.kind !== 'transcribe') {
        throw new Error(`local audio transcribe provider handles "transcribe", got "${job.kind}"`);
      }
      let input = job.input || {};
      let audioRef = audioRefFromJob(job);
      let audio = await readArtifactBytes(artifactStore, audioRef);
      let language = cleanString(input.language, 'auto') || 'auto';
      let model = cleanString(input.model, provider.profile) || provider.profile;

      let response = await fetchImpl(endpointUrl(options.endpoint, '/transcribe'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: context.signal,
        body: JSON.stringify({
          audioRef,
          audioBase64: Buffer.from(audio.content).toString('base64'),
          mimeType: audio.mimeType,
          language,
          model,
        }),
      });
      if (response.status === 503) {
        throw createAudioProviderNotReadyError(await readError(response, 'local audio transcribe provider is not ready'));
      }
      if (!response.ok) {
        throw new Error(`local audio transcribe provider responded ${response.status}: ${await readError(response, 'request failed')}`);
      }

      let data = await response.json();
      let words = normalizeWords(data.words);
      let text = cleanString(data.text, words.map((word) => word.word).join(' '));
      let durationSec = Number(data.durationSec ?? data.duration ?? words.at(-1)?.endSec ?? 0);
      let transcript = {
        text,
        words,
        durationSec,
        language,
        model,
        audioRef,
      };
      let artifact = await artifactStore.put(`${JSON.stringify(transcript, null, 2)}\n`, {
        mimeType: 'application/json',
        text,
        words,
        durationSec,
        language,
        model,
        audioRef,
        profile: provider.profile,
        providerId: provider.id,
        modelVersion: provider.modelVersion,
      });
      return normalizeAudioArtifact({
        artifactId: artifact.artifactId,
        mimeType: 'application/json',
        durationSec,
        text,
        words,
      });
    },
  });
  return provider;
}
