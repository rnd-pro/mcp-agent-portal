import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  NotificationNarrator,
  VOICE_ARBITRATION_ROLES,
  getDefaultVoiceArbitrationChannel,
  resetDefaultVoiceArbitrationChannel,
} from 'symbiote-ui';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

// Fake speechSynthesis so the narrator's browser path can run under Node; speak
// is synchronous and never auto-ends, so we control when the floor releases.
function fakeSynthesis() {
  let spoken = [];
  return {
    spoken,
    speak(utterance) { spoken.push(utterance); },
    cancel() {},
  };
}

function fakeUtterance() {
  return class FakeUtterance {
    constructor(text) {
      this.text = text;
      this.onend = null;
      this.onerror = null;
    }
  };
}

describe('AgentChat wires chat voice into the shared arbitration channel', () => {
  it('passes the shared voice-arbitration channel into its VoiceController', () => {
    let source = fs.readFileSync(path.join(ROOT, 'web/panels/AgentChat/AgentChat.js'), 'utf8');
    assert.match(source, /getDefaultVoiceArbitrationChannel/, 'imports the shared channel factory');
    assert.match(
      source,
      /new VoiceController\(\{[\s\S]*?arbitration:\s*getDefaultVoiceArbitrationChannel\(\)/,
      'passes arbitration: getDefaultVoiceArbitrationChannel() to VoiceController',
    );
  });
});

describe('notification narration yields to chat voice on the shared channel', () => {
  beforeEach(() => {
    resetDefaultVoiceArbitrationChannel();
  });

  function makeNarrator(channel) {
    return new NotificationNarrator({
      arbitration: channel,
      getLocale: () => 'en',
      getDepth: () => 'terse',
      synthesis: fakeSynthesis(),
      utteranceFactory: fakeUtterance(),
      random: () => 0,
    });
  }

  it('narration is blocked while the chat mic is listening', () => {
    let channel = getDefaultVoiceArbitrationChannel();
    // Chat acquires the listening floor (mic capture is the highest priority).
    let listen = channel.request({ role: VOICE_ARBITRATION_ROLES.listening });
    assert.ok(listen);

    let narrator = makeNarrator(channel);
    let result = narrator.narrate({ type: 'task.moved', params: { title: 'Fix login', stage: 'In Progress' } });
    assert.equal(result.spoken, false);
    assert.equal(result.reason, 'arbitration');
  });

  it('narration is blocked while the chat is speaking', () => {
    let channel = getDefaultVoiceArbitrationChannel();
    let speech = channel.request({ role: VOICE_ARBITRATION_ROLES.speech });
    assert.ok(speech);

    let narrator = makeNarrator(channel);
    let result = narrator.narrate({ type: 'task.completed', params: { title: 'Build', stage: 'Done' } });
    assert.equal(result.spoken, false);
    assert.equal(result.reason, 'arbitration');
  });

  it('chat speech preempts an in-progress narration', () => {
    let channel = getDefaultVoiceArbitrationChannel();
    let narrator = makeNarrator(channel);

    // Notification speaks first (lower priority).
    let result = narrator.narrate({ type: 'task.started', params: { title: 'Compile', stage: 'In Progress' } });
    assert.equal(result.spoken, true);
    assert.equal(narrator.speaking, true);
    assert.equal(channel.activeRole, VOICE_ARBITRATION_ROLES.notification);

    // Chat then requests the speech floor: it must win and preempt narration.
    let speech = channel.request({ role: VOICE_ARBITRATION_ROLES.speech });
    assert.ok(speech, 'chat speech wins the floor');
    assert.equal(channel.activeRole, VOICE_ARBITRATION_ROLES.speech);
    assert.equal(narrator.speaking, false, 'narration stopped when preempted');
  });

  it('narration speaks when the chat holds no floor', () => {
    let channel = getDefaultVoiceArbitrationChannel();
    let narrator = makeNarrator(channel);
    let result = narrator.narrate({ type: 'task.moved', params: { title: 'Ship', stage: 'Commit / Publish' } });
    assert.equal(result.spoken, true);
    assert.equal(channel.activeRole, VOICE_ARBITRATION_ROLES.notification);
  });
});
