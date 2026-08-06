import { acquireCurrentTestFileLock } from './test-lock.js';
await acquireCurrentTestFileLock(import.meta.url);

import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  NOTIFICATION_BOARD_STAGES,
  NOTIFICATION_CONFIG_DEFAULTS,
  NOTIFICATION_PRESET_KEYS,
  isStageNarrationEnabled,
  listAllPresetKeys,
  listEventPresetOptions,
  normalizeNotificationConfig,
  parseNotificationConfig,
  resolveEventPreset,
  resolvePhraseVariants,
  resolveToneShape,
  serializeNotificationConfig,
  setPhraseVariants,
} from '../notifications/notification-config.js';
import { NOTIFICATION_EVENT_TYPES, listNarrationVariants } from '../chat/notification-phrases.js';
import { NOTIFICATION_TONE_PRESETS } from '../notifications/sound-engine.js';

test('defaults are complete and bounded', () => {
  let config = normalizeNotificationConfig({});
  assert.equal(config.enabled, true);
  assert.equal(config.soundEnabled, true);
  assert.equal(config.narrationEnabled, true);
  assert.equal(config.narrationDepth, NOTIFICATION_CONFIG_DEFAULTS.narrationDepth);
  assert.ok(config.soundVolume >= 0 && config.soundVolume <= 1);
  assert.ok(config.voiceVolume >= 0 && config.voiceVolume <= 1);
  for (let type of NOTIFICATION_EVENT_TYPES) {
    assert.ok(NOTIFICATION_PRESET_KEYS.includes(config.eventPresets[type]), `${type} maps to a canonical preset`);
  }
  for (let stage of NOTIFICATION_BOARD_STAGES) {
    assert.equal(config.stageNarration[stage], true);
  }
});

test('normalize clamps sound + voice volume independently and coerces flags', () => {
  assert.equal(normalizeNotificationConfig({ soundVolume: 9 }).soundVolume, 1);
  assert.equal(normalizeNotificationConfig({ soundVolume: -3 }).soundVolume, 0);
  assert.equal(normalizeNotificationConfig({ voiceVolume: 9 }).voiceVolume, 1);
  assert.equal(normalizeNotificationConfig({ voiceVolume: -3 }).voiceVolume, 0);
  assert.equal(normalizeNotificationConfig({ soundVolume: 'x' }).soundVolume, NOTIFICATION_CONFIG_DEFAULTS.soundVolume);
  // The two channels are set independently of one another.
  let mixed = normalizeNotificationConfig({ soundVolume: 0.2, voiceVolume: 0.9 });
  assert.equal(mixed.soundVolume, 0.2);
  assert.equal(mixed.voiceVolume, 0.9);
  assert.equal(normalizeNotificationConfig({ enabled: 0 }).enabled, false);
  assert.equal(normalizeNotificationConfig({ narrationEnabled: 'yes' }).narrationEnabled, true);
});

test('generative sound shape normalizes + resolves', () => {
  let defaults = normalizeNotificationConfig({});
  assert.equal(defaults.soundWaveform, 'auto');
  assert.equal(defaults.soundPitch, 0);
  assert.equal(defaults.soundDuration, 1);
  // bounds + coercion
  let c = normalizeNotificationConfig({ soundWaveform: 'square', soundPitch: 99, soundDuration: 9 });
  assert.equal(c.soundWaveform, 'square');
  assert.equal(c.soundPitch, 12);
  assert.equal(c.soundDuration, 2);
  assert.equal(normalizeNotificationConfig({ soundWaveform: 'bogus' }).soundWaveform, 'auto');
  assert.equal(normalizeNotificationConfig({ soundPitch: -99 }).soundPitch, -12);
  // resolveToneShape projects the flat fields onto the engine shape
  assert.deepEqual(resolveToneShape(c), { waveform: 'square', semitones: 12, durationScale: 2 });
});

test('a legacy single volume seeds both channels', () => {
  let migrated = normalizeNotificationConfig({ volume: 0.33 });
  assert.equal(migrated.soundVolume, 0.33);
  assert.equal(migrated.voiceVolume, 0.33);
  // An explicit channel value wins over the legacy fallback.
  let partial = normalizeNotificationConfig({ volume: 0.33, voiceVolume: 0.7 });
  assert.equal(partial.soundVolume, 0.33);
  assert.equal(partial.voiceVolume, 0.7);
});

test('narration depth and locale fall back when invalid', () => {
  assert.equal(normalizeNotificationConfig({ narrationDepth: 'loud' }).narrationDepth, NOTIFICATION_CONFIG_DEFAULTS.narrationDepth);
  assert.equal(normalizeNotificationConfig({ narrationDepth: 'chatty' }).narrationDepth, 'chatty');
  assert.equal(normalizeNotificationConfig({ locale: 'fr' }).locale, 'auto');
  assert.equal(normalizeNotificationConfig({ locale: 'ru-RU' }).locale, 'ru');
  assert.equal(normalizeNotificationConfig({ locale: undefined }).locale, 'auto');
});

test('event preset aliases collapse to canonical board stages', () => {
  // 'success'/'error' are sound-engine severity aliases, not canonical keys.
  let config = normalizeNotificationConfig({
    eventPresets: { 'task.completed': 'success', 'task.failed': 'error', 'task.created': 'bogus' },
  });
  assert.equal(config.eventPresets['task.completed'], 'terminal-success');
  assert.equal(config.eventPresets['task.failed'], 'terminal-reject');
  // Unknown key falls back to the event default, still canonical.
  assert.ok(NOTIFICATION_PRESET_KEYS.includes(config.eventPresets['task.created']));
});

test('resolveEventPreset honors overrides and defaults', () => {
  let config = normalizeNotificationConfig({ eventPresets: { 'task.moved': 'escalation' } });
  assert.equal(resolveEventPreset(config, 'task.moved'), 'escalation');
  assert.equal(resolveEventPreset(config, 'task.completed'), 'terminal-success');
  // Every resolved preset is a real recipe in the engine map.
  for (let type of NOTIFICATION_EVENT_TYPES) {
    assert.ok(NOTIFICATION_TONE_PRESETS[resolveEventPreset(config, type)], `${type} resolves to a recipe`);
  }
});

test('listEventPresetOptions exposes only canonical keys; listAllPresetKeys is broader', () => {
  assert.deepEqual(listEventPresetOptions().sort(), [...NOTIFICATION_PRESET_KEYS].sort());
  assert.ok(listAllPresetKeys().length > listEventPresetOptions().length);
  assert.ok(listAllPresetKeys().includes('success'));
});

test('serialize -> parse round-trips a normalized config', () => {
  let config = normalizeNotificationConfig({
    soundVolume: 0.42,
    voiceVolume: 0.61,
    narrationDepth: 'chatty',
    eventPresets: { 'task.failed': 'terminal-reject' },
    stageNarration: { audit: false },
  });
  let restored = parseNotificationConfig(serializeNotificationConfig(config));
  assert.deepEqual(restored, config);
});

test('parse tolerates junk and missing storage values', () => {
  assert.deepEqual(parseNotificationConfig(''), normalizeNotificationConfig({}));
  assert.deepEqual(parseNotificationConfig('not json'), normalizeNotificationConfig({}));
  assert.deepEqual(parseNotificationConfig('null'), normalizeNotificationConfig({}));
  assert.deepEqual(parseNotificationConfig('[1,2]'), normalizeNotificationConfig({}));
});

test('stage narration gating respects master narration and per-stage toggles', () => {
  let config = normalizeNotificationConfig({ stageNarration: { audit: false } });
  assert.equal(isStageNarrationEnabled(config, 'execute'), true);
  assert.equal(isStageNarrationEnabled(config, 'audit'), false);
  // Unknown stages are not individually muteable, so they pass through.
  assert.equal(isStageNarrationEnabled(config, 'mystery'), true);
  // Master narration off mutes every stage.
  let off = normalizeNotificationConfig({ narrationEnabled: false });
  assert.equal(isStageNarrationEnabled(off, 'execute'), false);
});

test('resolvePhraseVariants returns the built-in bank with no override', () => {
  let config = normalizeNotificationConfig({});
  let variants = resolvePhraseVariants(config, { type: 'task.moved', locale: 'en', depth: 'terse' });
  assert.deepEqual(variants, listNarrationVariants({ type: 'task.moved', locale: 'en', depth: 'terse' }));
});

test('setPhraseVariants overrides, trims, and surfaces through resolvePhraseVariants', () => {
  let config = normalizeNotificationConfig({});
  let edited = setPhraseVariants(config, {
    type: 'task.completed',
    locale: 'en',
    depth: 'terse',
    variants: ['  {title} wrapped up ', '', '  ', 'Done: {title}'],
  });
  let variants = resolvePhraseVariants(edited, { type: 'task.completed', locale: 'en', depth: 'terse' });
  assert.deepEqual(variants, ['{title} wrapped up', 'Done: {title}']);
  // Other depth/event remains the built-in bank.
  assert.deepEqual(
    resolvePhraseVariants(edited, { type: 'task.completed', locale: 'en', depth: 'chatty' }),
    listNarrationVariants({ type: 'task.completed', locale: 'en', depth: 'chatty' }),
  );
});

test('setPhraseVariants is immutable and persists through round-trip', () => {
  let config = normalizeNotificationConfig({});
  let edited = setPhraseVariants(config, {
    type: 'task.failed',
    locale: 'ru',
    depth: 'chatty',
    variants: ['{title} упала'],
  });
  assert.deepEqual(config.phraseOverrides, {}, 'original config untouched');
  let restored = parseNotificationConfig(serializeNotificationConfig(edited));
  assert.deepEqual(
    resolvePhraseVariants(restored, { type: 'task.failed', locale: 'ru', depth: 'chatty' }),
    ['{title} упала'],
  );
});

test('clearing an override restores the base bank and prunes empty branches', () => {
  let config = setPhraseVariants(normalizeNotificationConfig({}), {
    type: 'task.started',
    locale: 'en',
    depth: 'terse',
    variants: ['custom {title}'],
  });
  assert.ok(config.phraseOverrides.en);
  let cleared = setPhraseVariants(config, {
    type: 'task.started',
    locale: 'en',
    depth: 'terse',
    variants: ['   ', ''],
  });
  assert.deepEqual(cleared.phraseOverrides, {}, 'empty branches pruned');
  assert.deepEqual(
    resolvePhraseVariants(cleared, { type: 'task.started', locale: 'en', depth: 'terse' }),
    listNarrationVariants({ type: 'task.started', locale: 'en', depth: 'terse' }),
  );
});

test('setPhraseVariants ignores unknown event types', () => {
  let config = normalizeNotificationConfig({});
  let edited = setPhraseVariants(config, { type: 'not.a.type', locale: 'en', depth: 'terse', variants: ['x'] });
  assert.deepEqual(edited.phraseOverrides, {});
});

test('phraseOverrides normalization drops unrecognized locales/events/depths', () => {
  let config = normalizeNotificationConfig({
    phraseOverrides: {
      en: { 'task.moved': { terse: ['{title} → {stage}'], shout: ['nope'] }, 'not.real': { terse: ['x'] } },
      fr: { 'task.moved': { terse: ['x'] } },
    },
  });
  assert.deepEqual(Object.keys(config.phraseOverrides), ['en']);
  assert.deepEqual(Object.keys(config.phraseOverrides.en), ['task.moved']);
  assert.deepEqual(Object.keys(config.phraseOverrides.en['task.moved']), ['terse']);
});
