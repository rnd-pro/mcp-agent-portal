/**
 * Notification widget config core — pure, deterministic, Node-safe.
 *
 * Owns every decision the {@link NotificationWidget} surfaces: master on/off,
 * independent sound + voice volumes, narration toggle + depth, per-event tone-
 * preset selection, per-board-
 * stage narration toggles, and a live override layer for the randomized phrase
 * bank. Nothing here touches the DOM, Web Audio, speechSynthesis, or the wall
 * clock, so the widget's whole settings model is unit-testable in Node and the
 * browser layer only consumes the normalized result.
 */

import {
  listTonePresetKeys,
  resolveTonePresetKey,
  normalizeToneShape,
  NOTIFICATION_TONE_PRESETS,
  NOTIFICATION_SOUND_WAVEFORMS,
} from './sound-engine.js';
import {
  NARRATION_DEPTHS,
  NOTIFICATION_EVENT_TYPES,
  DEFAULT_NARRATION_DEPTH,
  listNarrationVariants,
} from '../chat/notification-phrases.js';
import { normalizeLocale, SUPPORTED_LOCALES } from '../locale/index.js';

/** Canonical tone-preset keys (board stages), the only ones offered per event. */
export const NOTIFICATION_PRESET_KEYS = Object.freeze(Object.keys(NOTIFICATION_TONE_PRESETS));

/** Default tone preset chosen for each narration event type. */
const DEFAULT_EVENT_PRESETS = Object.freeze({
  'task.created': 'card-entered-stage',
  'task.moved': 'card-entered-stage',
  'task.started': 'card-entered-stage',
  'task.completed': 'terminal-success',
  'task.failed': 'terminal-reject',
  'task.blocked': 'escalation',
  'approval.required': 'escalation',
  'agent.message': 'card-entered-stage',
  generic: 'card-entered-stage',
});

/**
 * Canonical board stages whose narration can be muted independently. Mirrors the
 * workflow board's terminal/working stages so a host can silence, e.g., routine
 * stage entries while keeping terminal narration.
 */
export const NOTIFICATION_BOARD_STAGES = Object.freeze([
  'intake',
  'decompose',
  'orchestrate',
  'execute',
  'audit',
  'terminal',
]);

/** Narration event type → its localized label key (shared by widget + editor). */
export const EVENT_LABEL_KEYS = Object.freeze({
  'task.created': 'notification.event.taskCreated',
  'task.moved': 'notification.event.taskMoved',
  'task.started': 'notification.event.taskStarted',
  'task.completed': 'notification.event.taskCompleted',
  'task.failed': 'notification.event.taskFailed',
  'task.blocked': 'notification.event.taskBlocked',
  'approval.required': 'notification.event.approvalRequired',
  'agent.message': 'notification.event.agentMessage',
  generic: 'notification.event.generic',
});

export const NOTIFICATION_CONFIG_DEFAULTS = Object.freeze({
  enabled: true,
  soundVolume: 0.8,
  voiceVolume: 0.8,
  soundWaveform: 'auto',
  soundPitch: 0,
  soundDuration: 1,
  soundEnabled: true,
  narrationEnabled: true,
  narrationDepth: DEFAULT_NARRATION_DEPTH,
  locale: 'auto',
  eventPresets: DEFAULT_EVENT_PRESETS,
  stageNarration: Object.freeze(
    Object.fromEntries(NOTIFICATION_BOARD_STAGES.map((stage) => [stage, true])),
  ),
  phraseOverrides: Object.freeze({}),
});

function clamp01(value, fallback) {
  let n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(1, Math.max(0, n));
}

function normalizeDepth(value) {
  return NARRATION_DEPTHS.includes(value) ? value : DEFAULT_NARRATION_DEPTH;
}

function normalizeLocaleSetting(value) {
  if (value === 'auto' || value == null) return 'auto';
  return SUPPORTED_LOCALES.includes(normalizeLocale(value, { fallback: '' }))
    ? normalizeLocale(value)
    : 'auto';
}

function normalizeEventPresets(value) {
  let result = {};
  for (let type of NOTIFICATION_EVENT_TYPES) {
    let candidate = value && typeof value === 'object' ? value[type] : undefined;
    // A canonical key is kept verbatim; a severity/type alias collapses to its
    // canonical stage so persisted aliases still round-trip to a real preset.
    let canonical = resolveTonePresetKey(candidate);
    result[type] = canonical || DEFAULT_EVENT_PRESETS[type] || NOTIFICATION_PRESET_KEYS[0];
  }
  return result;
}

function normalizeStageNarration(value) {
  let result = {};
  for (let stage of NOTIFICATION_BOARD_STAGES) {
    let candidate = value && typeof value === 'object' ? value[stage] : undefined;
    result[stage] = candidate === undefined ? true : Boolean(candidate);
  }
  return result;
}

/**
 * Live phrase-bank overrides: locale -> event type -> depth -> string[]. Only
 * recognized locales/events/depths survive, and each variant is trimmed; empty
 * variant lists are dropped so the base phrase bank shows through.
 */
function normalizePhraseOverrides(value) {
  if (!value || typeof value !== 'object') return {};
  let result = {};
  for (let [localeKey, events] of Object.entries(value)) {
    let locale = normalizeLocale(localeKey, { fallback: '' });
    if (!locale || !events || typeof events !== 'object') continue;
    for (let [type, depths] of Object.entries(events)) {
      if (!NOTIFICATION_EVENT_TYPES.includes(type) || !depths || typeof depths !== 'object') continue;
      for (let [depth, variants] of Object.entries(depths)) {
        if (!NARRATION_DEPTHS.includes(depth) || !Array.isArray(variants)) continue;
        let cleaned = variants.map((v) => String(v ?? '').trim()).filter(Boolean);
        if (cleaned.length === 0) continue;
        result[locale] ??= {};
        result[locale][type] ??= {};
        result[locale][type][depth] = cleaned;
      }
    }
  }
  return result;
}

/**
 * Normalize an arbitrary (e.g. persisted) settings blob into a complete, bounded
 * config. Always returns a fresh object safe to hand to the browser layer.
 * @param {object} [input]
 */
export function normalizeNotificationConfig(input = {}) {
  let value = input && typeof input === 'object' ? input : {};
  let shape = normalizeToneShape({
    waveform: value.soundWaveform,
    semitones: value.soundPitch,
    durationScale: value.soundDuration,
  });
  return {
    enabled: value.enabled === undefined ? true : Boolean(value.enabled),
    // A single legacy `volume` seeds both channels so a persisted pre-split config
    // round-trips into separate sound + voice levels.
    soundVolume: clamp01(value.soundVolume ?? value.volume, NOTIFICATION_CONFIG_DEFAULTS.soundVolume),
    voiceVolume: clamp01(value.voiceVolume ?? value.volume, NOTIFICATION_CONFIG_DEFAULTS.voiceVolume),
    soundWaveform: shape.waveform,
    soundPitch: shape.semitones,
    soundDuration: shape.durationScale,
    soundEnabled: value.soundEnabled === undefined ? true : Boolean(value.soundEnabled),
    narrationEnabled: value.narrationEnabled === undefined ? true : Boolean(value.narrationEnabled),
    narrationDepth: normalizeDepth(value.narrationDepth),
    locale: normalizeLocaleSetting(value.locale),
    eventPresets: normalizeEventPresets(value.eventPresets),
    stageNarration: normalizeStageNarration(value.stageNarration),
    phraseOverrides: normalizePhraseOverrides(value.phraseOverrides),
  };
}

/** The generative tone shape (waveform / pitch / length) the engine should apply. */
export function resolveToneShape(config) {
  return normalizeToneShape({
    waveform: config?.soundWaveform,
    semitones: config?.soundPitch,
    durationScale: config?.soundDuration,
  });
}

/** Serialize a config for localStorage. Normalizes first so storage stays clean. */
export function serializeNotificationConfig(config) {
  return JSON.stringify(normalizeNotificationConfig(config));
}

/** Parse a localStorage string back into a normalized config (defaults on junk). */
export function parseNotificationConfig(raw) {
  if (!raw) return normalizeNotificationConfig({});
  try {
    let parsed = JSON.parse(raw);
    return normalizeNotificationConfig(parsed && typeof parsed === 'object' ? parsed : {});
  } catch (error) {
    void error;
    return normalizeNotificationConfig({});
  }
}

/**
 * Resolve the tone-preset key the engine should play for an event type, honoring
 * the per-event override and falling back to the event default.
 * @param {object} config
 * @param {string} type
 * @returns {string}
 */
export function resolveEventPreset(config, type) {
  let presets = normalizeEventPresets(config?.eventPresets);
  return presets[type] || DEFAULT_EVENT_PRESETS.generic;
}

/** Is narration allowed for a given board stage under the current config? */
export function isStageNarrationEnabled(config, stage) {
  if (!config?.narrationEnabled) return false;
  let stages = normalizeStageNarration(config?.stageNarration);
  // Unknown stages are not muteable individually, so they default to allowed.
  return stages[stage] === undefined ? true : stages[stage];
}

/**
 * The effective phrase variants for an event under the live config: the user's
 * override list when present, otherwise the built-in randomized bank.
 * @param {object} config
 * @param {{ type: string, locale?: string, depth?: string }} query
 * @returns {string[]}
 */
export function resolvePhraseVariants(config, { type, locale, depth } = {}) {
  let resolvedLocale = normalizeLocale(locale, { fallback: 'en' });
  let resolvedDepth = normalizeDepth(depth ?? config?.narrationDepth);
  let overrides = config?.phraseOverrides?.[resolvedLocale]?.[type]?.[resolvedDepth];
  if (Array.isArray(overrides) && overrides.length > 0) return [...overrides];
  return listNarrationVariants({ type, locale: resolvedLocale, depth: resolvedDepth });
}

/**
 * Apply a phrase-bank edit immutably: returns a new config whose override layer
 * carries the cleaned variant list. An empty/whitespace list clears the override
 * so the base bank is restored for that slot.
 * @returns {object} normalized config
 */
export function setPhraseVariants(config, { type, locale, depth, variants } = {}) {
  let next = normalizeNotificationConfig(config);
  if (!NOTIFICATION_EVENT_TYPES.includes(type)) return next;
  let resolvedLocale = normalizeLocale(locale, { fallback: 'en' });
  let resolvedDepth = normalizeDepth(depth);
  let cleaned = (Array.isArray(variants) ? variants : [])
    .map((v) => String(v ?? '').trim())
    .filter(Boolean);
  let overrides = next.phraseOverrides;
  if (cleaned.length === 0) {
    // Clear the override and prune now-empty branches.
    if (overrides[resolvedLocale]?.[type]) {
      delete overrides[resolvedLocale][type][resolvedDepth];
      if (Object.keys(overrides[resolvedLocale][type]).length === 0) delete overrides[resolvedLocale][type];
      if (Object.keys(overrides[resolvedLocale]).length === 0) delete overrides[resolvedLocale];
    }
    return next;
  }
  overrides[resolvedLocale] ??= {};
  overrides[resolvedLocale][type] ??= {};
  overrides[resolvedLocale][type][resolvedDepth] = cleaned;
  return next;
}

/** List the tone-preset keys offered in the per-event selector (canonical only). */
export function listEventPresetOptions() {
  return [...NOTIFICATION_PRESET_KEYS];
}

/** Every preset key the engine accepts, for validation/diagnostics. */
export function listAllPresetKeys() {
  return listTonePresetKeys();
}

/** Waveform options offered in the generative-sound waveform selector. */
export { NOTIFICATION_SOUND_WAVEFORMS };

export default {
  NOTIFICATION_CONFIG_DEFAULTS,
  NOTIFICATION_PRESET_KEYS,
  NOTIFICATION_BOARD_STAGES,
  NOTIFICATION_SOUND_WAVEFORMS,
  normalizeNotificationConfig,
  serializeNotificationConfig,
  parseNotificationConfig,
  resolveEventPreset,
  resolveToneShape,
  isStageNarrationEnabled,
  resolvePhraseVariants,
  setPhraseVariants,
  listEventPresetOptions,
  listAllPresetKeys,
};
