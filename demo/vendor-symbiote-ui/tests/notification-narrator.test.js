import { acquireCurrentTestFileLock } from './test-lock.js';
await acquireCurrentTestFileLock(import.meta.url);

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { NotificationNarrator } from '../chat/notification-narrator.js';
import {
  VoiceArbitrationChannel,
  VOICE_ARBITRATION_ROLES,
} from '../chat/voice-arbitration.js';

class MockUtterance {
  constructor(text) {
    this.text = text;
    this.lang = '';
    this.pitch = 1;
    this.rate = 1;
    this.volume = 1;
    this.onend = null;
    this.onerror = null;
  }
}

function mockSynthesis() {
  let synthesis = {
    spoken: [],
    cancelCount: 0,
    speak(utterance) {
      this.spoken.push(utterance);
      this.last = utterance;
    },
    cancel() {
      this.cancelCount++;
    },
  };
  return synthesis;
}

function makeNarrator(overrides = {}) {
  let synthesis = mockSynthesis();
  let channel = new VoiceArbitrationChannel();
  let events = { start: 0, end: 0, skip: [] };
  let narrator = new NotificationNarrator({
    arbitration: channel,
    synthesis,
    utteranceFactory: MockUtterance,
    getLocale: () => 'en',
    getDepth: () => 'terse',
    getLanguage: (locale) => `${locale}-US`,
    random: () => 0,
    onStart: () => { events.start++; },
    onEnd: () => { events.end++; },
    onSkip: (info) => { events.skip.push(info.reason); },
    ...overrides,
  });
  return { narrator, synthesis, channel, events };
}

test('NotificationNarrator capability detection is false in Node', () => {
  assert.equal(NotificationNarrator.hasSpeechSynthesis, false);
});

test('compose selects a localized phrase without speaking', () => {
  let { narrator, synthesis } = makeNarrator();
  let narration = narrator.compose({ type: 'task.moved', params: { title: 'Build', stage: 'Review' } });
  assert.equal(narration.text, 'Build → Review');
  assert.equal(synthesis.spoken.length, 0);
});

test('compose uses the getVariants provider (edited phrase bank)', () => {
  let seen = null;
  let { narrator } = makeNarrator({
    getVariants: (query) => { seen = query; return ['{title} parked at {stage}']; },
  });
  let narration = narrator.compose({ type: 'task.moved', params: { title: 'Build', stage: 'Review' } });
  assert.equal(narration.text, 'Build parked at Review');
  assert.deepEqual(seen, { type: 'task.moved', locale: 'en', depth: 'terse' });
});

test('narrate speaks through speechSynthesis and holds the arbitration floor', () => {
  let { narrator, synthesis, channel, events } = makeNarrator();
  let result = narrator.narrate({ type: 'task.completed', params: { title: 'Deploy' } });
  assert.equal(result.spoken, true);
  assert.equal(synthesis.spoken.length, 1);
  assert.equal(synthesis.last.lang, 'en-US');
  assert.equal(narrator.speaking, true);
  assert.equal(channel.activeRole, VOICE_ARBITRATION_ROLES.notification);
  assert.equal(events.start, 1);

  // Completing the utterance releases the floor.
  synthesis.last.onend();
  assert.equal(narrator.speaking, false);
  assert.equal(channel.isBusy, false);
  assert.equal(events.end, 1);
});

test('narrate yields (is denied) when chat voice holds the floor', () => {
  let { narrator, synthesis, channel, events } = makeNarrator();
  channel.request({ role: VOICE_ARBITRATION_ROLES.speech });
  let result = narrator.narrate({ type: 'task.moved', params: { title: 'A', stage: 'B' } });
  assert.equal(result.spoken, false);
  assert.equal(result.reason, 'arbitration');
  assert.equal(synthesis.spoken.length, 0);
  assert.deepEqual(events.skip, ['arbitration']);
});

test('active narration is cancelled when a higher-priority source preempts it', () => {
  let { narrator, synthesis, channel } = makeNarrator();
  narrator.narrate({ type: 'task.failed', params: { title: 'CI' } });
  assert.equal(narrator.speaking, true);

  // Chat voice claims the floor — narration must stop.
  let speech = channel.request({ role: VOICE_ARBITRATION_ROLES.speech });
  assert.ok(speech);
  assert.equal(narrator.speaking, false);
  assert.equal(synthesis.cancelCount, 1);
  assert.equal(channel.activeRole, VOICE_ARBITRATION_ROLES.speech);
});

test('disabled narrator skips speaking', () => {
  let { narrator, synthesis, events } = makeNarrator({ enabled: false });
  let result = narrator.narrate({ type: 'task.completed', params: { title: 'X' } });
  assert.equal(result.spoken, false);
  assert.equal(result.reason, 'disabled');
  assert.equal(synthesis.spoken.length, 0);
  assert.deepEqual(events.skip, ['disabled']);
});

test('missing speechSynthesis reports unsupported and frees the floor', () => {
  let channel = new VoiceArbitrationChannel();
  let narrator = new NotificationNarrator({
    arbitration: channel,
    synthesis: null,
    utteranceFactory: null,
    random: () => 0,
  });
  let result = narrator.narrate({ type: 'task.started', params: { title: 'X' } });
  assert.equal(result.spoken, false);
  assert.equal(result.reason, 'unsupported');
  assert.equal(channel.isBusy, false);
});

test('cancel stops in-progress narration and releases the floor', () => {
  let { narrator, synthesis, channel } = makeNarrator();
  narrator.narrate({ type: 'task.blocked', params: { title: 'X' } });
  assert.equal(narrator.speaking, true);
  narrator.cancel();
  assert.equal(narrator.speaking, false);
  assert.equal(synthesis.cancelCount, 1);
  assert.equal(channel.isBusy, false);
});

test('applies injected voice params to the utterance', () => {
  let { narrator, synthesis } = makeNarrator({
    getVoiceParams: () => ({ pitch: 1.2, rate: 0.9, volume: 0.7 }),
  });
  narrator.narrate({ type: 'task.completed', params: { title: 'X' } });
  assert.equal(synthesis.last.pitch, 1.2);
  assert.equal(synthesis.last.rate, 0.9);
  assert.equal(synthesis.last.volume, 0.7);
});
