import { acquireCurrentTestFileLock } from './test-lock.js';
await acquireCurrentTestFileLock(import.meta.url);

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { VoiceRuntime, blobToBase64 } from '../chat/voice-runtime.js';

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

test('VoiceRuntime capability detection in Node', () => {
  assert.equal(VoiceRuntime.isAvailable, false);
  assert.equal(VoiceRuntime.hasSpeechRecognition, false);
  assert.equal(VoiceRuntime.hasMediaCapture, false);
});

test('VoiceRuntime state machine and event emitters', async () => {
  const runtime = new VoiceRuntime();
  assert.equal(runtime.state, 'idle');

  runtime.setLanguage('ru-RU');
  assert.equal(runtime.language, 'ru-RU');

  // Since browser APIs are not available, start should throw
  await assert.rejects(async () => {
    await runtime.start({ language: 'ru-RU', mode: 'media' });
  }, /MediaDevices API not supported/);
});

test('VoiceRuntime mocked browser environment query/request permission', async () => {
  let streamStopped = false;
  const mockTrack = {
    stop() {
      streamStopped = true;
    }
  };

  const mockStream = {
    getTracks() {
      return [mockTrack];
    }
  };

  let restoreWindow = defineGlobal('window', {
    SpeechRecognition: class {},
    webkitSpeechRecognition: class {},
  });
  let restoreMediaRecorder = defineGlobal('MediaRecorder', class {
    constructor(stream, options) {
      this.stream = stream;
      this.options = options;
      this.mimeType = options?.mimeType || '';
      this.state = 'inactive';
    }

    static isTypeSupported() {
      return true;
    }

    start(interval) {
      this.interval = interval;
      this.state = 'recording';
    }

    stop() {
      this.state = 'inactive';
      this.onstop?.();
    }
  });
  let restoreNavigator = defineGlobal('navigator', {
    language: 'en-US',
    permissions: {
      async query() {
        return { state: 'granted' };
      }
    },
    mediaDevices: {
      async getUserMedia() {
        return mockStream;
      }
    }
  });

  try {
    assert.equal(VoiceRuntime.isAvailable, true);
    assert.equal(VoiceRuntime.hasSpeechRecognition, true);
    assert.equal(VoiceRuntime.hasMediaCapture, true);
    assert.equal(VoiceRuntime.hasMediaRecorder, true);

    const runtime = new VoiceRuntime();
    assert.equal(runtime.isAvailable, true);
    assert.equal(runtime.hasSpeechRecognition, true);
    assert.equal(runtime.hasMediaCapture, true);
    assert.equal(runtime.hasMediaRecorder, true);
    assert.equal(await runtime.checkPermission(), 'granted');
    assert.equal(await runtime.requestPermission(), 'granted');
    assert.equal(streamStopped, true);
  } finally {
    restoreNavigator();
    restoreMediaRecorder();
    restoreWindow();
  }
});

test('VoiceRuntime records media chunks and resolves stop result', async () => {
  let stopCount = 0;
  let recorderInstance = null;
  let restoreWindow = defineGlobal('window', {});
  let restoreNavigator = defineGlobal('navigator', {
    language: 'en-US',
    mediaDevices: {
      async getUserMedia() {
        return {
          getTracks() {
            return [{
              stop() {
                stopCount += 1;
              }
            }];
          }
        };
      }
    }
  });
  let restoreMediaRecorder = defineGlobal('MediaRecorder', class {
    constructor(stream, options) {
      this.stream = stream;
      this.mimeType = options?.mimeType || '';
      this.state = 'inactive';
      recorderInstance = this;
    }

    static isTypeSupported(type) {
      return type === 'audio/webm;codecs=opus';
    }

    start(interval) {
      this.interval = interval;
      this.state = 'recording';
    }

    stop() {
      this.state = 'inactive';
      this.ondataavailable?.({
        data: new Blob(['voice'], { type: this.mimeType }),
      });
      this.onstop?.();
    }
  });

  try {
    let runtime = new VoiceRuntime({ chunkInterval: 125 });
    let states = [];
    let chunkCount = 0;
    let blobType = '';
    runtime.addEventListener('statechange', (event) => states.push(event.detail.state));
    runtime.addEventListener('audiochunk', () => { chunkCount += 1; });
    runtime.addEventListener('audioblob', (event) => { blobType = event.detail.mimeType; });

    await runtime.startMediaRecorder();

    assert.equal(runtime.state, 'recording');
    assert.equal(recorderInstance.interval, 125);
    assert.deepEqual(states, ['starting', 'recording']);

    let result = await runtime.stop();

    assert.equal(runtime.state, 'idle');
    assert.equal(chunkCount, 1);
    assert.equal(result.blob.size, 5);
    assert.equal(result.mimeType, 'audio/webm;codecs=opus');
    assert.equal(blobType, 'audio/webm;codecs=opus');
    assert.equal(stopCount, 1);
    assert.deepEqual(states, ['starting', 'recording', 'processing', 'idle']);
  } finally {
    restoreMediaRecorder();
    restoreNavigator();
    restoreWindow();
  }
});

test('VoiceRuntime restarts active speech recognition with preserved text and new language', async () => {
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
        this.onstart?.();
      }

      stop() {
        this.onend?.();
      }

      abort() {
        this.aborted = true;
      }
    },
  });
  let restoreNavigator = defineGlobal('navigator', {
    language: 'en-US',
  });

  try {
    let runtime = new VoiceRuntime();
    let speech = [];
    let interim = [];
    let callbackStates = [];
    runtime.onInterim = (text) => interim.push(text);
    runtime.onStateChange = (state) => callbackStates.push(state);
    runtime.addEventListener('speechresult', (event) => speech.push(event.detail.text));

    await runtime.start({ language: 'en-US', mode: 'speech' });
    instances[0].onresult?.({
      results: Object.assign([[{ transcript: 'hello' }]], { length: 1 }),
    });

    assert.equal(runtime.state, 'recording');
    assert.equal(instances[0].lang, 'en-US');

    let restarted = await runtime.restartSpeechRecognition('es-ES', { initialText: 'hello' });

    assert.equal(restarted, true);
    assert.equal(instances[0].aborted, true);
    assert.equal(instances[1].lang, 'es-ES');
    assert.equal(runtime.state, 'recording');

    instances[1].onresult?.({
      results: Object.assign([[{ transcript: 'mundo' }]], { length: 1 }),
    });

    assert.deepEqual(speech, ['hello', 'hello mundo']);
    assert.deepEqual(interim, ['hello', 'hello mundo']);
    assert.deepEqual(await runtime.stop(), { text: 'hello mundo' });
    assert.deepEqual(callbackStates, ['starting', 'recording', 'starting', 'recording', 'processing', 'idle']);
  } finally {
    restoreNavigator();
    restoreWindow();
  }
});

test('blobToBase64 converts browser Blob payloads', async () => {
  class MockFileReader {
    readAsDataURL() {
      this.result = 'data:audio/webm;base64,dm9pY2U=';
      this.onloadend();
    }
  }
  let restoreFileReader = defineGlobal('FileReader', MockFileReader);

  try {
    assert.equal(await blobToBase64(new Blob(['voice'], { type: 'audio/webm' })), 'dm9pY2U=');
  } finally {
    restoreFileReader();
  }
});

test('VoiceRuntime cancel stops active media stream and resolves pending stop', async () => {
  let stopCount = 0;
  let recorderInstance = null;
  let restoreWindow = defineGlobal('window', {});
  let restoreNavigator = defineGlobal('navigator', {
    mediaDevices: {
      async getUserMedia() {
        return {
          getTracks() {
            return [{
              stop() {
                stopCount += 1;
              }
            }];
          }
        };
      }
    }
  });
  let restoreMediaRecorder = defineGlobal('MediaRecorder', class {
    constructor() {
      this.mimeType = '';
      this.state = 'inactive';
      recorderInstance = this;
    }

    static isTypeSupported() {
      return false;
    }

    start() {
      this.state = 'recording';
    }

    stop() {
      this.state = 'inactive';
    }
  });

  try {
    let runtime = new VoiceRuntime();
    await runtime.start({ mode: 'media' });
    let stopPromise = runtime.stop();

    runtime.cancel();
    let result = await stopPromise;

    assert.equal(runtime.state, 'idle');
    assert.equal(result.cancelled, true);
    assert.equal(stopCount, 1);
    assert.equal(recorderInstance.state, 'inactive');
  } finally {
    restoreMediaRecorder();
    restoreNavigator();
    restoreWindow();
  }
});
