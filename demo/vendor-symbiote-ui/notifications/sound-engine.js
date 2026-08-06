/**
 * Generative notification sound engine.
 *
 * Web Audio only — no audio files. The preset/recipe layer and the tone-plan
 * builder are pure and Node-safe; the AudioContext playback layer is created
 * lazily and only touches browser globals when {@link createSoundEngine} methods
 * run, so importing this module stays side-effect free.
 */

const DEFAULT_PEAK_GAIN = 0.04;
const GAIN_FLOOR = 0.0001;
const DEFAULT_ATTACK = 0.015;
const OSC_RELEASE_PAD = 0.02;

/** Oscillator wave types the generative shape can force, plus 'auto' (per-preset). */
export const NOTIFICATION_SOUND_WAVEFORMS = Object.freeze([
  'auto',
  'sine',
  'triangle',
  'square',
  'sawtooth',
]);

/** Identity shape: every preset plays exactly as authored. */
export const DEFAULT_TONE_SHAPE = Object.freeze({ waveform: 'auto', semitones: 0, durationScale: 1 });

function clampRange(value, min, max, fallback) {
  let n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

/**
 * Normalize a global tone shape applied across every preset: an optional waveform
 * override, a semitone pitch transpose, and a duration (length) scale.
 * @param {{ waveform?: string, semitones?: number, durationScale?: number }} [shape]
 * @returns {{ waveform: string, semitones: number, durationScale: number }}
 */
export function normalizeToneShape(shape = {}) {
  let value = shape && typeof shape === 'object' ? shape : {};
  return {
    waveform: NOTIFICATION_SOUND_WAVEFORMS.includes(value.waveform) ? value.waveform : 'auto',
    semitones: Math.round(clampRange(value.semitones, -12, 12, 0)),
    durationScale: clampRange(value.durationScale, 0.5, 2, 1),
  };
}

/**
 * @typedef {Object} ToneStep
 * @property {number} frequency  Oscillator frequency in Hz.
 * @property {number} at         Offset from the recipe start, in seconds.
 * @property {number} duration   Tone length in seconds.
 * @property {number} [peakGain] Per-tone peak gain override.
 */

/**
 * @typedef {Object} ToneRecipe
 * @property {OscillatorType} oscillator Oscillator wave type.
 * @property {number} peakGain           Default envelope peak gain.
 * @property {number} attack             Attack ramp length in seconds.
 * @property {ToneStep[]} tones          Ordered tone sequence.
 */

/** @type {Record<string, ToneRecipe>} */
const CANONICAL_PRESETS = {
  'card-entered-stage': {
    oscillator: 'sine',
    peakGain: DEFAULT_PEAK_GAIN,
    attack: DEFAULT_ATTACK,
    tones: [
      { frequency: 330, at: 0, duration: 0.09 },
      { frequency: 440, at: 0.1, duration: 0.11 },
    ],
  },
  escalation: {
    oscillator: 'triangle',
    peakGain: 0.045,
    attack: 0.01,
    tones: [
      { frequency: 440, at: 0, duration: 0.07 },
      { frequency: 660, at: 0.09, duration: 0.07 },
      { frequency: 880, at: 0.18, duration: 0.1 },
    ],
  },
  'terminal-success': {
    oscillator: 'sine',
    peakGain: DEFAULT_PEAK_GAIN,
    attack: DEFAULT_ATTACK,
    tones: [
      { frequency: 523.25, at: 0, duration: 0.09 },
      { frequency: 659.25, at: 0.1, duration: 0.09 },
      { frequency: 783.99, at: 0.2, duration: 0.16 },
    ],
  },
  'terminal-reject': {
    oscillator: 'sine',
    peakGain: DEFAULT_PEAK_GAIN,
    attack: DEFAULT_ATTACK,
    tones: [
      { frequency: 440, at: 0, duration: 0.1 },
      { frequency: 330, at: 0.12, duration: 0.12 },
      { frequency: 220, at: 0.26, duration: 0.18 },
    ],
  },
};

/**
 * Severity/type aliases mapped onto canonical board-stage presets so the engine
 * can be keyed by notification type, severity, or board stage interchangeably.
 * @type {Record<string, keyof typeof CANONICAL_PRESETS>}
 */
const PRESET_ALIASES = {
  info: 'card-entered-stage',
  notice: 'card-entered-stage',
  progress: 'card-entered-stage',
  warning: 'escalation',
  warn: 'escalation',
  alert: 'escalation',
  error: 'terminal-reject',
  failure: 'terminal-reject',
  rejected: 'terminal-reject',
  success: 'terminal-success',
  completed: 'terminal-success',
  done: 'terminal-success',
};

/** Canonical preset keys, frozen to prevent mutation by consumers. */
export const NOTIFICATION_TONE_PRESETS = Object.freeze(CANONICAL_PRESETS);

/**
 * List every key that {@link resolveTonePreset} accepts (canonical + aliases).
 * @returns {string[]}
 */
export function listTonePresetKeys() {
  return [...Object.keys(CANONICAL_PRESETS), ...Object.keys(PRESET_ALIASES)];
}

/**
 * Resolve a preset key to its canonical name, following severity/type aliases.
 * @param {string} presetKey
 * @returns {keyof typeof CANONICAL_PRESETS | null}
 */
export function resolveTonePresetKey(presetKey) {
  if (typeof presetKey !== 'string') return null;
  const key = presetKey.trim().toLowerCase();
  if (key in CANONICAL_PRESETS) return /** @type {keyof typeof CANONICAL_PRESETS} */ (key);
  if (key in PRESET_ALIASES) return PRESET_ALIASES[key];
  return null;
}

/**
 * Resolve a preset key to its tone recipe.
 * @param {string} presetKey
 * @returns {ToneRecipe | null}
 */
export function resolveTonePreset(presetKey) {
  const canonical = resolveTonePresetKey(presetKey);
  return canonical ? CANONICAL_PRESETS[canonical] : null;
}

/**
 * @typedef {Object} ScheduledTone
 * @property {OscillatorType} oscillator
 * @property {number} frequency
 * @property {number} start      Absolute start time.
 * @property {number} attackAt   Time the envelope reaches peak gain.
 * @property {number} stop       Time the envelope returns to the floor.
 * @property {number} oscStop    Time the oscillator node stops.
 * @property {number} peakGain
 * @property {number} floor
 */

/**
 * Build an absolute, browser-agnostic playback plan for a recipe. Pure: returns
 * plain scheduling data the AudioContext layer can replay without re-deriving
 * timing. Exported for unit testing the timing/envelope math.
 * @param {ToneRecipe} recipe
 * @param {number} [startTime] Absolute base time (e.g. audioCtx.currentTime).
 * @param {{ waveform?: string, semitones?: number, durationScale?: number }} [shape]
 *   Global tone shape; omitted/identity leaves the preset exactly as authored.
 * @returns {ScheduledTone[]}
 */
export function buildTonePlan(recipe, startTime = 0, shape) {
  if (!recipe || !Array.isArray(recipe.tones)) return [];
  const s = normalizeToneShape(shape);
  const oscillator = s.waveform !== 'auto' ? s.waveform : (recipe.oscillator || 'sine');
  const basePeak = recipe.peakGain > 0 ? recipe.peakGain : DEFAULT_PEAK_GAIN;
  const attack = recipe.attack >= 0 ? recipe.attack : DEFAULT_ATTACK;
  const pitchFactor = Math.pow(2, s.semitones / 12);
  const lengthScale = s.durationScale;
  return recipe.tones.map((tone) => {
    const start = startTime + tone.at * lengthScale;
    const stop = start + tone.duration * lengthScale;
    const peakGain = tone.peakGain > 0 ? tone.peakGain : basePeak;
    return {
      oscillator,
      frequency: tone.frequency * pitchFactor,
      start,
      attackAt: Math.min(start + attack, stop),
      stop,
      oscStop: stop + OSC_RELEASE_PAD,
      peakGain,
      floor: GAIN_FLOOR,
    };
  });
}

/**
 * Total wall-clock length of a recipe, in seconds. Useful for arbitrating
 * playback against speech so they do not overlap.
 * @param {ToneRecipe} recipe
 * @returns {number}
 */
export function getPresetDuration(recipe) {
  if (!recipe || !Array.isArray(recipe.tones) || recipe.tones.length === 0) return 0;
  return recipe.tones.reduce((max, tone) => Math.max(max, tone.at + tone.duration), 0);
}

function resolveAudioContextClass() {
  if (typeof globalThis === 'undefined') return null;
  return globalThis.AudioContext || globalThis.webkitAudioContext || null;
}

const GESTURE_EVENTS = ['pointerdown', 'keydown', 'touchstart'];

/**
 * @typedef {Object} SoundEngineOptions
 * @property {number} [masterGain] Multiplier applied to every preset peak gain (default 1).
 * @property {boolean} [muted]     Start muted.
 * @property {() => (AudioContext | null)} [audioContextFactory] Override for tests.
 */

/**
 * Create a generative notification sound engine bound to Web Audio.
 *
 * The returned engine lazily creates a single AudioContext on first gesture or
 * first {@link play}. On platforms without Web Audio every method is a safe
 * no-op so callers never need to feature-detect.
 *
 * @param {SoundEngineOptions} [options]
 */
export function createSoundEngine(options = {}) {
  let masterGain = options.masterGain > 0 ? options.masterGain : 1;
  let toneShape = normalizeToneShape(options.toneShape);
  const audioContextFactory = options.audioContextFactory;
  let muted = Boolean(options.muted);
  /** @type {AudioContext | null} */
  let audioCtx = null;
  let unlocked = false;
  /** @type {(() => void) | null} */
  let detachGesture = null;

  function createContext() {
    if (audioCtx) return audioCtx;
    if (audioContextFactory) {
      audioCtx = audioContextFactory() || null;
      return audioCtx;
    }
    const AudioContextClass = resolveAudioContextClass();
    if (!AudioContextClass) return null;
    audioCtx = new AudioContextClass();
    return audioCtx;
  }

  function ensureRunning() {
    const ctx = createContext();
    if (!ctx) return null;
    if (ctx.state === 'suspended') ctx.resume?.();
    return ctx;
  }

  function unlock() {
    const ctx = ensureRunning();
    if (ctx) unlocked = true;
    return unlocked;
  }

  function installGestureUnlock(target) {
    const node = target || (typeof globalThis !== 'undefined' ? globalThis : null);
    if (!node || typeof node.addEventListener !== 'function') return () => {};
    if (detachGesture) return detachGesture;
    const handler = () => {
      unlock();
      detach();
    };
    function detach() {
      for (const type of GESTURE_EVENTS) node.removeEventListener?.(type, handler);
      detachGesture = null;
    }
    for (const type of GESTURE_EVENTS) {
      node.addEventListener(type, handler, { once: false, passive: true });
    }
    detachGesture = detach;
    return detach;
  }

  function play(presetKey) {
    if (muted) return false;
    const recipe = resolveTonePreset(presetKey);
    if (!recipe) return false;
    // Respect the gesture-activation requirement: do not force a context before
    // the user has interacted, otherwise the browser blocks and warns.
    const activated = unlocked || globalThis.navigator?.userActivation?.hasBeenActive;
    if (!activated) return false;
    const ctx = ensureRunning();
    if (!ctx) return false;
    const plan = buildTonePlan(recipe, ctx.currentTime, toneShape);
    try {
      for (const step of plan) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = step.oscillator;
        osc.frequency.setValueAtTime(step.frequency, step.start);
        const peak = Math.max(step.floor, step.peakGain * masterGain);
        gain.gain.setValueAtTime(step.floor, step.start);
        gain.gain.exponentialRampToValueAtTime(peak, step.attackAt);
        gain.gain.exponentialRampToValueAtTime(step.floor, step.stop);
        osc.connect(gain).connect(ctx.destination);
        osc.start(step.start);
        osc.stop(step.oscStop);
      }
    } catch {
      return false;
    }
    return true;
  }

  function setMuted(value) {
    muted = Boolean(value);
  }

  /** Live master-gain multiplier for every subsequent {@link play}. Accepts 0 (silent). */
  function setMasterGain(value) {
    let next = Number(value);
    if (Number.isFinite(next) && next >= 0) masterGain = next;
  }

  /** Live generative tone shape (waveform / pitch / length) for subsequent plays. */
  function setToneShape(shape) {
    toneShape = normalizeToneShape(shape);
  }

  function dispose() {
    detachGesture?.();
    const ctx = audioCtx;
    audioCtx = null;
    unlocked = false;
    ctx?.close?.();
  }

  return {
    play,
    unlock,
    installGestureUnlock,
    setMuted,
    setMasterGain,
    setToneShape,
    isMuted: () => muted,
    isUnlocked: () => unlocked,
    getPresetDuration: (presetKey) => getPresetDuration(resolveTonePreset(presetKey)),
    dispose,
  };
}
