import { acquireCurrentTestFileLock } from './test-lock.js';
await acquireCurrentTestFileLock(import.meta.url);

import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  VoiceController,
  isTerminalWakeError,
  voiceMicrophoneDeniedMessage,
  voiceStartErrorMessage,
  voiceWakeStartErrorMessage,
} from '../chat/voice-controller.js';
import {
  VoiceArbitrationChannel,
  VOICE_ARBITRATION_ROLES,
} from '../chat/voice-arbitration.js';

function defineGlobal(name, value) {
  let descriptor = Object.getOwnPropertyDescriptor(globalThis, name);
  Object.defineProperty(globalThis, name, {
    configurable: true,
    writable: true,
    value,
  });
  return () => {
    if (descriptor) {
      Object.defineProperty(globalThis, name, descriptor);
    } else {
      delete globalThis[name];
    }
  };
}

test('VoiceController capability detection in Node', () => {
  assert.equal(VoiceController.hasSpeechRecognition, false);
  assert.equal(VoiceController.hasSpeechSynthesis, false);
});

test('VoiceController basic properties and defaults', () => {
  const controller = new VoiceController();
  assert.equal(controller.wakeEnabled, false);
  assert.equal(controller.wakePaused, false);
  assert.equal(controller.speaking, false);
  assert.equal(controller.isWakeActive, false);
  assert.equal(controller.getLanguage(), 'en-US');
  assert.deepEqual(controller.getWakeCandidates(), []);
});

test('VoiceController exposes product-neutral voice error messages', () => {
  assert.equal(
    voiceMicrophoneDeniedMessage(),
    'Microphone access denied. Check browser microphone permissions.'
  );
  assert.equal(
    voiceStartErrorMessage({ wasMicrophonePrompt: true, permissionRefreshMessage: 'Refresh after permission.' }),
    'Refresh after permission.'
  );
  assert.equal(
    voiceStartErrorMessage({ wasMicrophonePrompt: false, permissionRefreshMessage: 'Refresh after permission.' }),
    'Microphone access denied. Check browser microphone permissions.'
  );
  assert.equal(
    voiceWakeStartErrorMessage('not-supported'),
    'Continuous listening requires browser speech recognition.'
  );
  assert.equal(
    voiceWakeStartErrorMessage('not-allowed'),
    'Microphone access denied. Check browser microphone permissions.'
  );
  assert.equal(isTerminalWakeError('service-not-allowed'), true);
  assert.equal(isTerminalWakeError('network'), false);
});

test('VoiceController reports unsupported wake recognition as a stable code', () => {
  let restoreWindow = defineGlobal('window', {});

  try {
    let wakeErrors = [];
    const controller = new VoiceController({
      onWakeError: (err) => {
        wakeErrors.push(err);
      }
    });

    controller.startWake();

    assert.equal(controller.wakeEnabled, false);
    assert.equal(controller.wakePaused, false);
    assert.equal(wakeErrors.length, 1);
    assert.equal(wakeErrors[0].error, 'not-supported');
    assert.match(wakeErrors[0].message, /not supported/i);
  } finally {
    restoreWindow();
  }
});

test('VoiceController reports wake start failures as a stable code', () => {
  let restoreWindow = defineGlobal('window', {
    SpeechRecognition: class {
      start() {
        throw new Error('already started');
      }
    }
  });

  try {
    let wakeErrors = [];
    const controller = new VoiceController({
      onWakeError: (err) => {
        wakeErrors.push(err);
      }
    });

    controller.startWake();

    assert.equal(controller.wakeEnabled, false);
    assert.equal(controller.wakePaused, false);
    assert.equal(wakeErrors.length, 1);
    assert.equal(wakeErrors[0].error, 'start-failed');
    assert.match(wakeErrors[0].message, /failed to start/i);
    assert.equal(wakeErrors[0].cause.message, 'already started');
  } finally {
    restoreWindow();
  }
});

test('VoiceController wake listening lifecycle with mocked SpeechRecognition', async () => {
  let instances = [];
  let restoreWindow = defineGlobal('window', {
    SpeechRecognition: class {
      constructor() {
        this.lang = '';
        this.interimResults = false;
        this.continuous = false;
        instances.push(this);
      }

      start() {
        this.started = true;
        setTimeout(() => this.onstart?.(), 0);
      }

      stop() {
        this.stopped = true;
        setTimeout(() => this.onend?.(), 0);
      }

      abort() {
        this.aborted = true;
        setTimeout(() => this.onend?.(), 0);
      }
    }
  });

  try {
    let wakeTriggered = 0;
    let wakeErrors = [];
    const controller = new VoiceController({
      getLanguage: () => 'ru-RU',
      getWakeCandidates: () => ['агент', 'привет агент'],
      onWakeTriggered: () => {
        wakeTriggered++;
      },
      onWakeError: (err) => {
        wakeErrors.push(err);
      }
    });

    assert.equal(VoiceController.hasSpeechRecognition, true);

    controller.startWake();
    assert.equal(controller.wakeEnabled, true);
    assert.equal(controller.wakePaused, false);
    assert.equal(controller.isWakeActive, true);

    // Wait for start
    await new Promise(resolve => setTimeout(resolve, 10));
    assert.equal(instances.length, 1);
    assert.equal(instances[0].started, true);
    assert.equal(instances[0].lang, 'ru-RU');

    // Simulate speech recognition result (no match)
    instances[0].onresult?.({
      resultIndex: 0,
      results: [[{ transcript: 'какая сегодня погода' }]]
    });
    assert.equal(wakeTriggered, 0);

    // Simulate speech recognition result (match)
    instances[0].onresult?.({
      resultIndex: 0,
      results: [[{ transcript: 'привет агент' }]]
    });
    assert.equal(wakeTriggered, 1);

    // Pause wake
    controller.pauseWake();
    assert.equal(controller.wakePaused, true);
    assert.equal(controller.isWakeActive, false);
    assert.equal(instances[0].aborted, true);

    // Resume wake
    controller.resumeWake();
    assert.equal(controller.wakePaused, false);
    assert.equal(controller.isWakeActive, true);
    await new Promise(resolve => setTimeout(resolve, 10));
    assert.equal(instances.length, 2);
    assert.equal(instances[1].started, true);

    // Stop wake
    controller.stopWake({ disableMode: true });
    assert.equal(controller.wakeEnabled, false);
    assert.equal(controller.isWakeActive, false);
    assert.equal(instances[1].aborted, true);
  } finally {
    restoreWindow();
  }
});

test('VoiceController speech synthesis lifecycle with mocked speechSynthesis', async () => {
  let speakUtterance = null;
  let cancelCalled = 0;
  
  let restoreSpeechSynthesis = defineGlobal('speechSynthesis', {
    speak(utterance) {
      speakUtterance = utterance;
      setTimeout(() => utterance.onend?.(), 0);
    },
    cancel() {
      cancelCalled++;
    }
  });
  let restoreUtterance = defineGlobal('SpeechSynthesisUtterance', class {
    constructor(text) {
      this.text = text;
      this.lang = '';
    }
  });
  let restoreWindow = defineGlobal('window', {
    SpeechRecognition: class {
      start() {}
      abort() {}
    }
  });

  try {
    let speechStarted = 0;
    let speechEnded = 0;

    const controller = new VoiceController({
      getLanguage: () => 'es-ES',
      onSpeechStart: () => {
        speechStarted++;
      },
      onSpeechEnd: () => {
        speechEnded++;
      }
    });

    assert.equal(VoiceController.hasSpeechSynthesis, true);

    // Enable wake listening first
    controller.startWake();
    assert.equal(controller.wakeEnabled, true);
    assert.equal(controller.wakePaused, false);

    // Speak
    controller.speak('hola amigo');
    assert.equal(controller.speaking, true);
    assert.equal(speechStarted, 1);
    // Speaking should automatically pause wake
    assert.equal(controller.wakePaused, true);
    assert.equal(speakUtterance.text, 'hola amigo');
    assert.equal(speakUtterance.lang, 'es-ES');

    // Wait for speak finish
    await new Promise(resolve => setTimeout(resolve, 10));
    assert.equal(controller.speaking, false);
    assert.equal(speechEnded, 1);
    // Finishing speaking should automatically resume wake
    assert.equal(controller.wakePaused, false);

    // Speak and then cancel
    controller.speak('adios');
    assert.equal(controller.speaking, true);
    assert.equal(speechStarted, 2);
    assert.equal(controller.wakePaused, true);

    controller.cancelSpeech();
    assert.equal(controller.speaking, false);
    assert.equal(speechEnded, 2);
    assert.equal(controller.wakePaused, false);
    assert.equal(cancelCalled, 3); // Cancel is called in cancelSpeech and inside speak (before start)
  } finally {
    restoreWindow();
    restoreUtterance();
    restoreSpeechSynthesis();
  }
});

test('VoiceController honors the shared arbitration channel for listen and speech floors', async () => {
  let restoreSpeechSynthesis = defineGlobal('speechSynthesis', {
    speak(utterance) {
      setTimeout(() => utterance.onend?.(), 0);
    },
    cancel() {},
  });
  let restoreUtterance = defineGlobal('SpeechSynthesisUtterance', class {
    constructor(text) {
      this.text = text;
      this.lang = '';
    }
  });
  let restoreWindow = defineGlobal('window', {
    SpeechRecognition: class {
      start() {}
      abort() {}
    }
  });

  try {
    let channel = new VoiceArbitrationChannel();
    const controller = new VoiceController({ arbitration: channel });

    // Active wake listening must hold the listening floor.
    controller.startWake();
    assert.equal(channel.activeRole, VOICE_ARBITRATION_ROLES.listening);
    // Background narration cannot speak over an active mic.
    assert.equal(channel.request({ role: VOICE_ARBITRATION_ROLES.notification }), null);

    // Speaking swaps the listening floor for the speech floor.
    controller.speak('hello');
    assert.equal(controller.speaking, true);
    assert.equal(channel.activeRole, VOICE_ARBITRATION_ROLES.speech);
    // Notification narration still yields to chat speech.
    assert.equal(channel.request({ role: VOICE_ARBITRATION_ROLES.notification }), null);

    // Finishing speech releases the speech floor and resumes the listening floor.
    await new Promise((resolve) => setTimeout(resolve, 10));
    assert.equal(controller.speaking, false);
    assert.equal(channel.activeRole, VOICE_ARBITRATION_ROLES.listening);

    // Stopping wake fully frees the channel.
    controller.stopWake({ disableMode: true });
    assert.equal(channel.isBusy, false);
  } finally {
    restoreWindow();
    restoreUtterance();
    restoreSpeechSynthesis();
  }
});
