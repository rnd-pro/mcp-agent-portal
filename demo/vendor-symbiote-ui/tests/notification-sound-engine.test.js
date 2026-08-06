import { acquireCurrentTestFileLock } from './test-lock.js';
await acquireCurrentTestFileLock(import.meta.url);

import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  NOTIFICATION_TONE_PRESETS,
  buildTonePlan,
  createSoundEngine,
  getPresetDuration,
  listTonePresetKeys,
  resolveTonePreset,
  resolveTonePresetKey,
} from '../notifications/sound-engine.js';

const BOARD_STAGES = ['card-entered-stage', 'escalation', 'terminal-success', 'terminal-reject'];

test('exposes a canonical preset for every board stage', () => {
  for (const stage of BOARD_STAGES) {
    const recipe = NOTIFICATION_TONE_PRESETS[stage];
    assert.ok(recipe, `missing preset ${stage}`);
    assert.ok(Array.isArray(recipe.tones) && recipe.tones.length > 0);
    assert.ok(recipe.peakGain > 0 && recipe.peakGain <= 0.06, 'peak gain stays low');
  }
});

test('preset map is frozen against mutation', () => {
  assert.ok(Object.isFrozen(NOTIFICATION_TONE_PRESETS));
});

test('resolves severity and type aliases onto board-stage presets', () => {
  assert.equal(resolveTonePresetKey('info'), 'card-entered-stage');
  assert.equal(resolveTonePresetKey('WARNING'), 'escalation');
  assert.equal(resolveTonePresetKey(' error '), 'terminal-reject');
  assert.equal(resolveTonePresetKey('success'), 'terminal-success');
  assert.equal(resolveTonePresetKey('card-entered-stage'), 'card-entered-stage');
});

test('returns null for unknown or invalid keys', () => {
  assert.equal(resolveTonePresetKey('nope'), null);
  assert.equal(resolveTonePresetKey(undefined), null);
  assert.equal(resolveTonePreset('nope'), null);
});

test('listTonePresetKeys includes canonical keys and aliases', () => {
  const keys = listTonePresetKeys();
  for (const stage of BOARD_STAGES) assert.ok(keys.includes(stage));
  assert.ok(keys.includes('warning'));
});

test('buildTonePlan produces absolute monotonic envelope timing', () => {
  const recipe = resolveTonePreset('terminal-success');
  const plan = buildTonePlan(recipe, 10);
  assert.equal(plan.length, recipe.tones.length);
  for (const step of plan) {
    assert.ok(step.start >= 10);
    assert.ok(step.attackAt >= step.start, 'attack after start');
    assert.ok(step.attackAt <= step.stop, 'attack peak within tone');
    assert.ok(step.stop > step.start, 'stop after start');
    assert.ok(step.oscStop > step.stop, 'oscillator releases after envelope floor');
    assert.equal(step.oscillator, 'sine');
    assert.ok(step.peakGain > 0);
    assert.ok(step.floor > 0 && step.floor < step.peakGain, 'floor below peak for exp ramp');
  }
});

test('buildTonePlan honors per-tone peak gain override', () => {
  const plan = buildTonePlan({ oscillator: 'sine', peakGain: 0.04, attack: 0.01, tones: [
    { frequency: 440, at: 0, duration: 0.1, peakGain: 0.02 },
    { frequency: 660, at: 0.2, duration: 0.1 },
  ] }, 0);
  assert.equal(plan[0].peakGain, 0.02);
  assert.equal(plan[1].peakGain, 0.04);
});

test('buildTonePlan tolerates malformed recipes', () => {
  assert.deepEqual(buildTonePlan(null), []);
  assert.deepEqual(buildTonePlan({}), []);
});

test('getPresetDuration measures the full tone sequence', () => {
  const recipe = resolveTonePreset('escalation');
  const last = recipe.tones[recipe.tones.length - 1];
  assert.equal(getPresetDuration(recipe), last.at + last.duration);
  assert.equal(getPresetDuration(null), 0);
});

test('engine is a safe no-op without Web Audio', () => {
  const engine = createSoundEngine();
  assert.equal(engine.isUnlocked(), false);
  assert.equal(engine.play('terminal-success'), false);
  assert.equal(engine.unlock(), false);
  engine.dispose();
});

test('engine plays through an injected AudioContext after a gesture', () => {
  const events = [];
  const fakeCtx = makeFakeAudioContext(events);
  const engine = createSoundEngine({ audioContextFactory: () => fakeCtx });

  // Blocked before activation.
  assert.equal(engine.play('card-entered-stage'), false);

  assert.equal(engine.unlock(), true);
  assert.equal(engine.isUnlocked(), true);
  assert.equal(fakeCtx.resumed, true);

  assert.equal(engine.play('card-entered-stage'), true);
  const recipe = resolveTonePreset('card-entered-stage');
  assert.equal(events.filter((e) => e === 'osc:start').length, recipe.tones.length);
  assert.ok(events.includes('gain:exp'));
});

test('engine respects mute', () => {
  const fakeCtx = makeFakeAudioContext([]);
  const engine = createSoundEngine({ audioContextFactory: () => fakeCtx });
  engine.unlock();
  engine.setMuted(true);
  assert.equal(engine.isMuted(), true);
  assert.equal(engine.play('escalation'), false);
  engine.setMuted(false);
  assert.equal(engine.play('escalation'), true);
});

test('masterGain scales the envelope peak', () => {
  let peak = 0;
  const fakeCtx = makeFakeAudioContext([], (value) => { peak = Math.max(peak, value); });
  const engine = createSoundEngine({ audioContextFactory: () => fakeCtx, masterGain: 0.5 });
  engine.unlock();
  engine.play('card-entered-stage');
  const recipe = resolveTonePreset('card-entered-stage');
  assert.ok(Math.abs(peak - recipe.peakGain * 0.5) < 1e-9);
});

test('setMasterGain rescales subsequent plays live', () => {
  let peak = 0;
  const fakeCtx = makeFakeAudioContext([], (value) => { peak = Math.max(peak, value); });
  const engine = createSoundEngine({ audioContextFactory: () => fakeCtx, masterGain: 1 });
  engine.unlock();
  engine.setMasterGain(0.25);
  engine.play('card-entered-stage');
  const recipe = resolveTonePreset('card-entered-stage');
  assert.ok(Math.abs(peak - recipe.peakGain * 0.25) < 1e-9);
  // Invalid values are ignored; a previously set gain stays in effect.
  peak = 0;
  engine.setMasterGain('loud');
  engine.play('card-entered-stage');
  assert.ok(Math.abs(peak - recipe.peakGain * 0.25) < 1e-9);
});

test('buildTonePlan applies the tone shape (waveform, pitch, length)', () => {
  const recipe = resolveTonePreset('card-entered-stage'); // sine; tones 330@0/0.09, 440@0.1/0.11
  const shaped = buildTonePlan(recipe, 0, { waveform: 'square', semitones: 12, durationScale: 2 });
  assert.equal(shaped[0].oscillator, 'square');
  assert.ok(Math.abs(shaped[0].frequency - 660) < 1e-6, '+12 semitones doubles 330Hz');
  assert.ok(Math.abs(shaped[1].start - 0.2) < 1e-9, 'onset scaled by length');
  assert.ok(Math.abs((shaped[0].stop - shaped[0].start) - 0.18) < 1e-9, 'duration scaled by length');
  // Omitting the shape leaves the preset exactly as authored.
  const plain = buildTonePlan(recipe, 0);
  assert.equal(plain[0].oscillator, 'sine');
  assert.ok(Math.abs(plain[0].frequency - 330) < 1e-6);
});

test('setToneShape reshapes subsequent plays live', () => {
  let oscs = [];
  const fakeCtx = makeFakeAudioContext([], null, (o) => oscs.push(o));
  const engine = createSoundEngine({ audioContextFactory: () => fakeCtx });
  engine.unlock();
  engine.setToneShape({ waveform: 'triangle', semitones: -12 });
  engine.play('card-entered-stage');
  assert.ok(oscs.length >= 1);
  assert.ok(oscs.every((o) => o.type === 'triangle'), 'waveform overridden');
  assert.ok(Math.abs(oscs[0].frequency - 165) < 1e-6, '-12 semitones halves 330Hz');
});

test('gesture unlock attaches and detaches listeners on a fake target', () => {
  const target = makeFakeEventTarget();
  const fakeCtx = makeFakeAudioContext([]);
  const engine = createSoundEngine({ audioContextFactory: () => fakeCtx });
  engine.installGestureUnlock(target);
  assert.ok(target.listeners.pointerdown);
  target.fire('pointerdown');
  assert.equal(engine.isUnlocked(), true);
  assert.equal(target.count('pointerdown'), 0, 'listener removed after first gesture');
});

function makeFakeAudioContext(events, onGainValue, onOsc) {
  return {
    state: 'suspended',
    currentTime: 0,
    resumed: false,
    resume() { this.resumed = true; this.state = 'running'; },
    close() { this.state = 'closed'; },
    createOscillator() {
      const osc = {
        type: 'sine',
        frequency: { setValueAtTime(value) { osc._frequency = value; } },
        connect(node) { return node; },
        start() { events.push('osc:start'); onOsc?.({ type: osc.type, frequency: osc._frequency }); },
        stop() { events.push('osc:stop'); },
      };
      return osc;
    },
    createGain() {
      return {
        gain: {
          setValueAtTime() {},
          exponentialRampToValueAtTime(value) {
            events.push('gain:exp');
            onGainValue?.(value);
          },
        },
        connect(node) { return node; },
      };
    },
    destination: {},
  };
}

function makeFakeEventTarget() {
  const listeners = {};
  return {
    listeners,
    addEventListener(type, fn) { (listeners[type] ||= new Set()).add(fn); },
    removeEventListener(type, fn) { listeners[type]?.delete(fn); },
    count(type) { return listeners[type]?.size || 0; },
    fire(type) { for (const fn of listeners[type] || []) fn(); },
  };
}
