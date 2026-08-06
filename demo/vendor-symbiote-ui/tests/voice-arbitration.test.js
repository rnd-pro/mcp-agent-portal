import { acquireCurrentTestFileLock } from './test-lock.js';
await acquireCurrentTestFileLock(import.meta.url);

import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  VoiceArbitrationChannel,
  VOICE_ARBITRATION_ROLES,
  DEFAULT_VOICE_ARBITRATION_PRIORITIES,
  getDefaultVoiceArbitrationChannel,
  resetDefaultVoiceArbitrationChannel,
} from '../chat/voice-arbitration.js';

test('grants the floor to the first requester and reports state', () => {
  let channel = new VoiceArbitrationChannel();
  assert.equal(channel.isBusy, false);
  let token = channel.request({ role: VOICE_ARBITRATION_ROLES.notification });
  assert.ok(token);
  assert.equal(channel.activeRole, 'notification');
  assert.equal(channel.isBusy, true);
  assert.equal(channel.isSpeaking, true);
  assert.equal(channel.isListening, false);
});

test('higher priority preempts a lower holder via onPreempt', () => {
  let channel = new VoiceArbitrationChannel();
  let preempted = null;
  let notif = channel.request({
    role: VOICE_ARBITRATION_ROLES.notification,
    onPreempt: (info) => { preempted = info; },
  });
  let speech = channel.request({ role: VOICE_ARBITRATION_ROLES.speech });
  assert.ok(speech);
  assert.equal(channel.activeRole, 'speech');
  assert.deepEqual(preempted, { role: 'speech', priority: DEFAULT_VOICE_ARBITRATION_PRIORITIES.speech });
  // The preempted token is now stale.
  assert.equal(channel.release(notif), false);
});

test('equal or lower priority is denied while a holder owns the floor', () => {
  let channel = new VoiceArbitrationChannel();
  channel.request({ role: VOICE_ARBITRATION_ROLES.speech });
  assert.equal(channel.request({ role: VOICE_ARBITRATION_ROLES.notification }), null);
  assert.equal(channel.request({ role: VOICE_ARBITRATION_ROLES.speech }), null);
  assert.equal(channel.canAcquire({ role: VOICE_ARBITRATION_ROLES.notification }), false);
  assert.equal(channel.canAcquire({ role: VOICE_ARBITRATION_ROLES.listening }), true);
});

test('listening blocks all speaking and preempts active speech', () => {
  let channel = new VoiceArbitrationChannel();
  let speechCancelled = false;
  channel.request({
    role: VOICE_ARBITRATION_ROLES.speech,
    onPreempt: () => { speechCancelled = true; },
  });
  let listen = channel.request({ role: VOICE_ARBITRATION_ROLES.listening });
  assert.ok(listen);
  assert.equal(speechCancelled, true);
  assert.equal(channel.isListening, true);
  assert.equal(channel.isSpeaking, false);
  // No speaking source may interrupt active listening.
  assert.equal(channel.request({ role: VOICE_ARBITRATION_ROLES.speech }), null);
  assert.equal(channel.request({ role: VOICE_ARBITRATION_ROLES.notification }), null);
});

test('releasing the floor frees it for the next requester', () => {
  let channel = new VoiceArbitrationChannel();
  let token = channel.request({ role: VOICE_ARBITRATION_ROLES.notification });
  assert.equal(channel.release(token), true);
  assert.equal(channel.isBusy, false);
  // Stale release is a no-op.
  assert.equal(channel.release(token), false);
  let next = channel.request({ role: VOICE_ARBITRATION_ROLES.notification });
  assert.ok(next);
});

test('clear force-releases and notifies the holder', () => {
  let channel = new VoiceArbitrationChannel();
  let cleared = null;
  channel.request({
    role: VOICE_ARBITRATION_ROLES.speech,
    onPreempt: (info) => { cleared = info; },
  });
  assert.equal(channel.clear(), true);
  assert.deepEqual(cleared, { role: null, priority: null });
  assert.equal(channel.isBusy, false);
  assert.equal(channel.clear(), false);
});

test('custom priorities override the default ladder', () => {
  let channel = new VoiceArbitrationChannel({ priorities: { notification: 99 } });
  channel.request({ role: VOICE_ARBITRATION_ROLES.notification });
  // Notification now outranks speech.
  assert.equal(channel.request({ role: VOICE_ARBITRATION_ROLES.speech }), null);
});

test('shared default channel is a stable singleton until reset', () => {
  resetDefaultVoiceArbitrationChannel();
  let a = getDefaultVoiceArbitrationChannel();
  let b = getDefaultVoiceArbitrationChannel();
  assert.equal(a, b);
  resetDefaultVoiceArbitrationChannel();
  assert.notEqual(getDefaultVoiceArbitrationChannel(), a);
});
