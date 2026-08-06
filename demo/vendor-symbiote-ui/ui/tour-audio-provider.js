import { createTourMediaRenderPlan } from './tour-media-renderer.js';

const DEFAULT_START_DELAY_MS = 120;
const DEFAULT_PEAK_GAIN = 0.026;
const DEFAULT_TURN_CUE_MS = 150;
const DEFAULT_WORD_CUE_MS = 76;
const DEFAULT_WORD_LIMIT = 36;
const DEFAULT_RESUME_TIMEOUT_MS = 220;
const GAIN_FLOOR = 0.0001;

const PERSONA_FREQUENCIES = Object.freeze({
  guide: 238,
  agent: 224,
  ops: 174,
  system: 198,
});

export const TOUR_AUDIO_PROVIDER_BROWSER_ID = 'browser';
export const TOUR_AUDIO_PROVIDER_SYNTHETIC_CUES_ID = 'synthetic-cues';

const BUILTIN_TOUR_AUDIO_PROVIDERS = Object.freeze([
  {
    id: TOUR_AUDIO_PROVIDER_BROWSER_ID,
    label: 'Browser audio',
    strategy: 'display-capture',
    live: true,
    default: true,
  },
  {
    id: TOUR_AUDIO_PROVIDER_SYNTHETIC_CUES_ID,
    label: 'Synthetic cue track',
    strategy: 'media-stream',
    live: false,
  },
]);

export class TourAudioProviderError extends Error {
  constructor(code, message, detail = {}) {
    super(message);
    this.name = 'TourAudioProviderError';
    this.code = code;
    this.detail = detail;
  }
}

function cleanText(value, fallback = '') {
  let text = String(value ?? fallback ?? '').replace(/\s+/g, ' ').trim();
  return text && text !== 'undefined' && text !== 'null' ? text : String(fallback || '').trim();
}

function getGlobalAudioContext() {
  if (typeof globalThis === 'undefined') return null;
  return globalThis.AudioContext || globalThis.webkitAudioContext || null;
}

function abortError() {
  if (typeof DOMException !== 'undefined') return new DOMException('Aborted', 'AbortError');
  let error = new Error('Aborted');
  error.name = 'AbortError';
  return error;
}

function hashText(text) {
  let hash = 2166136261;
  let value = String(text || '');
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function deterministicNoise(seed, index) {
  let hash = hashText(`${seed}:${index}`);
  return (hash % 1000) / 1000;
}

function wordsFor(text) {
  return cleanText(text).split(/\s+/).filter(Boolean);
}

function personaBaseFrequency(persona) {
  let key = cleanText(persona, 'guide').toLowerCase();
  return PERSONA_FREQUENCIES[key] || PERSONA_FREQUENCIES.guide;
}

function normalizeTourAudioProviderDefinition(definition = {}) {
  let id = cleanText(definition.id, '');
  if (!id) return null;
  return {
    id,
    label: cleanText(definition.label, id),
    strategy: cleanText(definition.strategy, 'custom'),
    live: definition.live !== false,
    default: Boolean(definition.default),
    createProvider: typeof definition.createProvider === 'function' ? definition.createProvider : null,
    getExtraAudioInput: typeof definition.getExtraAudioInput === 'function' ? definition.getExtraAudioInput : null,
  };
}

export function listTourAudioProviders(extraProviders = []) {
  let providers = [
    ...BUILTIN_TOUR_AUDIO_PROVIDERS,
    ...(Array.isArray(extraProviders) ? extraProviders : []),
  ]
    .map(normalizeTourAudioProviderDefinition)
    .filter(Boolean);
  let seen = new Set();
  return providers.filter((provider) => {
    if (seen.has(provider.id)) return false;
    seen.add(provider.id);
    return true;
  });
}

export function resolveTourAudioProvider(id = TOUR_AUDIO_PROVIDER_BROWSER_ID, options = {}) {
  let requested = cleanText(id, TOUR_AUDIO_PROVIDER_BROWSER_ID);
  let providers = listTourAudioProviders(options.providers || options.extraProviders || []);
  let provider = providers.find((item) => item.id === requested);
  if (!provider && requested !== TOUR_AUDIO_PROVIDER_BROWSER_ID) {
    throw new TourAudioProviderError('unknown-audio-provider', `Unknown tour audio provider "${requested}".`, {
      requested,
      available: providers.map((item) => item.id),
    });
  }
  provider = provider ||
    providers.find((item) => item.default) ||
    providers.find((item) => item.id === TOUR_AUDIO_PROVIDER_BROWSER_ID);
  if (!provider) {
    throw new TourAudioProviderError('unknown-audio-provider', `Unknown tour audio provider "${requested}".`, {
      requested,
      available: providers.map((item) => item.id),
    });
  }
  return provider;
}

export function createBrowserTourAudioProvider(providerOptions = {}) {
  let definition = resolveTourAudioProvider(TOUR_AUDIO_PROVIDER_BROWSER_ID, providerOptions);
  return {
    ...definition,
    kind: 'browser-tour-audio-provider',
    captureAudio: true,
    async getExtraAudioInput() {
      return null;
    },
    async close() {},
  };
}

function resolveAudioContext(options = {}) {
  if (options.audioContext) return { audioCtx: options.audioContext, owned: false };
  if (typeof options.audioContextFactory === 'function') {
    let audioCtx = options.audioContextFactory();
    return { audioCtx, owned: false };
  }
  let AudioContextCtor = options.AudioContext || getGlobalAudioContext();
  return { audioCtx: AudioContextCtor ? new AudioContextCtor() : null, owned: true };
}

function rampGain(gainParam, start, stop, peak) {
  if (!gainParam) return;
  gainParam.setValueAtTime?.(GAIN_FLOOR, start);
  if (typeof gainParam.exponentialRampToValueAtTime === 'function' && peak > GAIN_FLOOR) {
    gainParam.exponentialRampToValueAtTime(peak, Math.min(start + 0.018, stop));
    gainParam.exponentialRampToValueAtTime(GAIN_FLOOR, stop);
    return;
  }
  gainParam.linearRampToValueAtTime?.(peak, Math.min(start + 0.018, stop));
  gainParam.linearRampToValueAtTime?.(GAIN_FLOOR, stop);
}

function scheduleTone(audioCtx, destination, cue, options = {}) {
  let oscillator = audioCtx.createOscillator?.();
  let gain = audioCtx.createGain?.();
  if (!oscillator || !gain) return null;
  oscillator.type = options.waveform || cue.waveform || 'triangle';
  oscillator.frequency?.setValueAtTime?.(cue.frequency, cue.startSec);
  rampGain(gain.gain, cue.startSec, cue.stopSec, cue.gain);
  oscillator.connect?.(gain);
  gain.connect?.(destination);
  oscillator.start?.(cue.startSec);
  oscillator.stop?.(cue.stopSec + 0.024);
  return oscillator;
}

async function tryResumeAudioContext(audioCtx, timeoutMs = DEFAULT_RESUME_TIMEOUT_MS) {
  if (audioCtx?.state !== 'suspended' || typeof audioCtx.resume !== 'function') return true;
  let timeout = Number.isFinite(Number(timeoutMs)) ? Math.max(0, Number(timeoutMs)) : DEFAULT_RESUME_TIMEOUT_MS;
  let timedOut = Symbol('timed-out');
  try {
    let result = await Promise.race([
      audioCtx.resume().then(() => true, () => false),
      new Promise((resolve) => setTimeout(() => resolve(timedOut), timeout)),
    ]);
    return result === true;
  } catch (_) {
    return false;
  }
}

export function createTourCueAudioPlan(timeline = {}, options = {}) {
  let mediaPlan = createTourMediaRenderPlan(timeline, options);
  let startDelayMs = Number.isFinite(Number(options.startDelayMs))
    ? Math.max(0, Number(options.startDelayMs))
    : DEFAULT_START_DELAY_MS;
  let peakGain = Number.isFinite(Number(options.peakGain))
    ? Math.max(0, Number(options.peakGain))
    : DEFAULT_PEAK_GAIN;
  let turnCueMs = Number.isFinite(Number(options.turnCueMs))
    ? Math.max(30, Number(options.turnCueMs))
    : DEFAULT_TURN_CUE_MS;
  let wordCueMs = Number.isFinite(Number(options.wordCueMs))
    ? Math.max(20, Number(options.wordCueMs))
    : DEFAULT_WORD_CUE_MS;
  let maxWordCues = Number.isFinite(Number(options.maxWordCues))
    ? Math.max(0, Math.floor(Number(options.maxWordCues)))
    : DEFAULT_WORD_LIMIT;
  let cues = [];
  let wordTimings = [];

  for (let frame of mediaPlan.frames) {
    let persona = cleanText(frame.persona, 'guide');
    let base = personaBaseFrequency(persona);
    let frameStart = startDelayMs + frame.startMs;
    cues.push({
      kind: 'turn',
      persona,
      index: frame.index,
      startMs: frameStart,
      durationMs: Math.min(turnCueMs, Math.max(30, frame.durationMs * 0.18)),
      frequency: base * 1.42,
      gain: peakGain * 1.18,
      waveform: 'sine',
    });

    let tokens = wordsFor(frame.text);
    let limit = Math.min(tokens.length, maxWordCues);
    if (!limit) continue;
    let speechStart = frameStart + Math.min(320, Math.max(140, frame.durationMs * 0.12));
    let speechSpan = Math.max(120, frame.durationMs - (speechStart - frameStart) - 160);
    let step = limit > 1 ? speechSpan / limit : speechSpan;

    for (let i = 0; i < limit; i += 1) {
      let token = tokens[i];
      let noise = deterministicNoise(`${persona}:${frame.text}`, i);
      let startMs = speechStart + i * step + (noise - 0.5) * Math.min(42, step * 0.25);
      let durationMs = Math.min(wordCueMs + noise * 22, Math.max(28, step * 0.68));
      let frequency = base + (noise - 0.5) * 46 + (i % 4) * 7;
      cues.push({
        kind: 'word',
        persona,
        index: frame.index,
        word: token,
        wordIndex: i,
        startMs,
        durationMs,
        frequency,
        gain: peakGain * (0.62 + noise * 0.25),
        waveform: i % 3 === 0 ? 'sine' : 'triangle',
      });
      wordTimings.push({
        persona,
        index: frame.index,
        word: token,
        wordIndex: i,
        startMs,
        endMs: startMs + durationMs,
      });
    }
  }

  return {
    ...mediaPlan,
    cues: cues.map((cue) => ({
      ...cue,
      endMs: cue.startMs + cue.durationMs,
    })),
    wordTimings,
    audio: {
      kind: 'synthetic-cues',
      startDelayMs,
      peakGain,
    },
  };
}

export function getTourAudioProviderSupport(options = {}) {
  let AudioContextCtor = options.AudioContext || getGlobalAudioContext();
  let hasFactory = typeof options.audioContextFactory === 'function' || Boolean(options.audioContext);
  return {
    audioContext: Boolean(AudioContextCtor || hasFactory),
    mediaStreamDestination: Boolean(options.audioContext?.createMediaStreamDestination || AudioContextCtor || hasFactory),
    supported: Boolean(AudioContextCtor || hasFactory),
  };
}

export function createTourCueAudioProvider(providerOptions = {}) {
  return async function provideTourCueAudio({ timeline, signal, options = {} } = {}) {
    if (signal?.aborted) throw abortError();
    let audioPlan = createTourCueAudioPlan(timeline, { ...options, ...providerOptions });
    let { audioCtx, owned } = resolveAudioContext({ ...options, ...providerOptions });
    if (!audioCtx) {
      throw new TourAudioProviderError('missing-audio-context', 'AudioContext is not available for tour audio rendering.');
    }
    if (typeof audioCtx.createMediaStreamDestination !== 'function') {
      throw new TourAudioProviderError(
        'missing-media-stream-destination',
        'AudioContext does not expose createMediaStreamDestination().'
      );
    }

    let destination = audioCtx.createMediaStreamDestination();
    let stream = destination?.stream;
    let track = stream?.getAudioTracks?.()[0] || null;
    if (!track) {
      throw new TourAudioProviderError('missing-audio-track', 'Tour audio provider did not produce an audio track.');
    }

    await tryResumeAudioContext(audioCtx, providerOptions.resumeTimeoutMs);

    let baseTime = Number(audioCtx.currentTime) || 0;
    let scheduled = [];
    for (let cue of audioPlan.cues) {
      let startSec = baseTime + cue.startMs / 1000;
      let stopSec = baseTime + cue.endMs / 1000;
      let node = scheduleTone(audioCtx, destination, {
        ...cue,
        startSec,
        stopSec,
      }, providerOptions);
      if (node) scheduled.push(node);
    }

    let closed = false;
    let close = async () => {
      if (closed) return;
      closed = true;
      for (let node of scheduled) {
        try {
          node.stop?.(0);
        } catch (_) {}
      }
      for (let audioTrack of stream?.getTracks?.() || []) {
        try {
          audioTrack.stop?.();
        } catch (_) {}
      }
      if (owned) {
        try {
          await audioCtx.close?.();
        } catch (_) {}
      }
    };

    return {
      kind: 'synthetic-tour-cues',
      stream,
      track,
      plan: audioPlan,
      wordTimings: audioPlan.wordTimings,
      close,
    };
  };
}

export function createTourAudioProvider(id = TOUR_AUDIO_PROVIDER_BROWSER_ID, providerOptions = {}) {
  let definition = resolveTourAudioProvider(id, providerOptions);
  if (definition.id === TOUR_AUDIO_PROVIDER_BROWSER_ID) return createBrowserTourAudioProvider(providerOptions);
  if (definition.id === TOUR_AUDIO_PROVIDER_SYNTHETIC_CUES_ID) {
    return {
      ...definition,
      kind: 'synthetic-cue-tour-audio-provider',
      captureAudio: false,
      async getExtraAudioInput(args = {}) {
        let provider = createTourCueAudioProvider(providerOptions);
        return provider(args);
      },
      createRenderAudioProvider() {
        return createTourCueAudioProvider(providerOptions);
      },
    };
  }
  if (definition.getExtraAudioInput) {
    return {
      ...definition,
      kind: 'custom-tour-audio-provider',
      captureAudio: !definition.live,
      getExtraAudioInput: definition.getExtraAudioInput,
    };
  }
  if (definition.createProvider) {
    let provider = definition.createProvider(providerOptions);
    if (!provider || typeof provider !== 'object') {
      throw new TourAudioProviderError('invalid-audio-provider', `Tour audio provider "${definition.id}" did not return an object.`);
    }
    return {
      ...definition,
      ...provider,
      id: definition.id,
      label: provider.label || definition.label,
    };
  }
  throw new TourAudioProviderError('invalid-audio-provider', `Tour audio provider "${definition.id}" has no provider factory.`);
}
