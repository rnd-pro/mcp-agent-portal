import { acquireCurrentTestFileLock } from './test-lock.js';
await acquireCurrentTestFileLock(import.meta.url);

import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  DEFAULT_SCREENCAST_HOTKEY,
  ScreencastRecorder,
  installScreencastHotkeys,
  matchesScreencastHotkey,
} from '../ui/screencast-recorder.js';
import { recordTourScreencast } from '../ui/tour-screencast.js';

class ListenerTarget {
  constructor() {
    this.listeners = new Map();
  }

  addEventListener(type, listener) {
    let listeners = this.listeners.get(type) || new Set();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type, listener) {
    this.listeners.get(type)?.delete(listener);
  }

  dispatchEvent(event) {
    for (let listener of this.listeners.get(event.type) || []) {
      listener(event);
    }
    return true;
  }
}

class FakeTrack extends ListenerTarget {
  constructor(kind = '') {
    super();
    this.kind = kind;
    this.stopped = false;
  }

  stop() {
    this.stopped = true;
  }

  end() {
    this.dispatchEvent({ type: 'ended' });
  }
}

class FakeStream {
  constructor(input = {}) {
    if (Array.isArray(input)) {
      this.tracks = input;
      this.videoTrack = input.find((track) => track.kind === 'video') || null;
      this.audioTrack = input.find((track) => track.kind === 'audio') || null;
      return;
    }
    let { audio = true, video = true } = input;
    this.videoTrack = video ? new FakeTrack('video') : null;
    this.audioTrack = audio ? new FakeTrack('audio') : null;
    this.tracks = [this.videoTrack, this.audioTrack].filter(Boolean);
  }

  getTracks() {
    return this.tracks;
  }

  getVideoTracks() {
    return this.videoTrack ? [this.videoTrack] : [];
  }

  getAudioTracks() {
    return this.audioTrack ? [this.audioTrack] : [];
  }
}

class FakeMediaRecorder extends ListenerTarget {
  static instances = [];

  static isTypeSupported(type) {
    return type === 'video/webm;codecs=vp8,opus' || type === 'video/webm;codecs=vp8' || type === 'video/webm';
  }

  constructor(stream, options = {}) {
    super();
    this.stream = stream;
    this.options = options;
    this.mimeType = options.mimeType || 'video/webm';
    this.state = 'inactive';
    this.timeslice = 0;
    FakeMediaRecorder.instances.push(this);
  }

  start(timeslice) {
    this.state = 'recording';
    this.timeslice = timeslice;
  }

  stop() {
    if (this.state !== 'recording') return;
    this.state = 'inactive';
    queueMicrotask(() => {
      this.dispatchEvent({ type: 'dataavailable', data: new Blob(['webm'], { type: this.mimeType }) });
      this.dispatchEvent({ type: 'stop' });
    });
  }
}

function createKeyEvent(overrides = {}) {
  return {
    type: 'keydown',
    code: 'KeyR',
    altKey: true,
    shiftKey: true,
    ctrlKey: false,
    metaKey: false,
    repeat: false,
    isComposing: false,
    defaultPrevented: false,
    propagationStopped: false,
    preventDefault() {
      this.defaultPrevented = true;
    },
    stopPropagation() {
      this.propagationStopped = true;
    },
    ...overrides,
  };
}

function createDocumentHarness() {
  let downloads = [];
  return {
    downloads,
    body: {
      appendChild(node) {
        downloads.push(node);
      },
    },
    createElement(tag) {
      assert.equal(tag, 'a');
      return {
        style: {},
        clicked: false,
        removeCalled: false,
        click() {
          this.clicked = true;
        },
        remove() {
          this.removeCalled = true;
        },
      };
    },
  };
}

test('screencast hotkey matcher uses browser KeyboardEvent code and exact modifiers', () => {
  assert.equal(matchesScreencastHotkey(createKeyEvent(), DEFAULT_SCREENCAST_HOTKEY), true);
  assert.equal(matchesScreencastHotkey(createKeyEvent({ code: 'KeyS' }), DEFAULT_SCREENCAST_HOTKEY), false);
  assert.equal(matchesScreencastHotkey(createKeyEvent({ metaKey: true }), DEFAULT_SCREENCAST_HOTKEY), false);
  assert.equal(matchesScreencastHotkey(createKeyEvent({ repeat: true }), DEFAULT_SCREENCAST_HOTKEY), false);
});

test('screencast recorder starts from hotkey, stops from hotkey, and downloads the blob', async () => {
  let hotkeyTarget = new ListenerTarget();
  let eventTarget = new ListenerTarget();
  let doc = createDocumentHarness();
  let stream = new FakeStream();
  let requestedOptions = null;
  let urls = [];
  let revoked = [];
  let states = [];
  let starts = [];
  let ready = [];
  let stops = [];

  eventTarget.addEventListener('sn-screencast-state-change', (event) => states.push(event.detail.state));
  eventTarget.addEventListener('sn-screencast-start', (event) => starts.push(event.detail));
  eventTarget.addEventListener('sn-screencast-ready', (event) => ready.push(event.detail));
  eventTarget.addEventListener('sn-screencast-stop', (event) => stops.push(event.detail));

  let recorder = installScreencastHotkeys({
    hotkeyTarget,
    eventTarget,
    document: doc,
    navigator: {
      mediaDevices: {
        async getDisplayMedia(options) {
          requestedOptions = options;
          return stream;
        },
      },
    },
    MediaRecorder: FakeMediaRecorder,
    URL: {
      createObjectURL(blob) {
        urls.push(blob);
        return `blob:test-${urls.length}`;
      },
      revokeObjectURL(url) {
        revoked.push(url);
      },
    },
    filename: 'agent-demo.webm',
    preferredMimeTypes: ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm;codecs=vp8', 'video/webm'],
  });

  assert.equal(ScreencastRecorder.isSupported({
    navigator: recorder.navigator,
    MediaRecorder: FakeMediaRecorder,
  }), true);

  let startEvent = createKeyEvent();
  hotkeyTarget.dispatchEvent(startEvent);
  await Promise.resolve();

  assert.equal(startEvent.defaultPrevented, true);
  assert.equal(recorder.state, 'recording');
  assert.equal(requestedOptions.video.cursor, 'always');
  assert.equal(requestedOptions.audio.suppressLocalAudioPlayback, false);
  assert.equal(requestedOptions.preferCurrentTab, true);
  assert.equal(requestedOptions.systemAudio, 'include');
  assert.equal(requestedOptions.windowAudio, 'system');
  assert.equal(FakeMediaRecorder.instances.at(-1).options.mimeType, 'video/webm;codecs=vp8,opus');
  assert.equal(FakeMediaRecorder.instances.at(-1).timeslice, 1000);
  assert.equal(starts.length, 1);
  assert.equal(starts[0].capture.audioRequested, true);
  assert.equal(starts[0].capture.audioTrackCount, 1);
  assert.equal(starts[0].capture.extraAudioTrackCount, 0);
  assert.equal(starts[0].capture.hasAudio, true);
  assert.equal(starts[0].capture.videoTrackCount, 1);
  assert.equal(starts[0].capture.hasVideo, true);

  let stopEvent = createKeyEvent();
  hotkeyTarget.dispatchEvent(stopEvent);
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(stopEvent.defaultPrevented, true);
  assert.equal(recorder.state, 'idle');
  assert.equal(stream.videoTrack.stopped, true);
  assert.equal(stream.audioTrack.stopped, true);
  assert.deepEqual(states, ['starting', 'recording', 'stopping', 'idle']);
  assert.equal(ready.length, 1);
  assert.equal(stops.length, 1);
  assert.equal(ready[0].blob.size, 4);
  assert.deepEqual(ready[0].capture, starts[0].capture);
  assert.equal(stops[0].filename, 'agent-demo.webm');
  assert.deepEqual(stops[0].capture, starts[0].capture);
  assert.equal(urls.length, 1);
  assert.equal(doc.downloads[0].download, 'agent-demo.webm');
  assert.equal(doc.downloads[0].clicked, true);
  assert.equal(doc.downloads[0].removeCalled, true);

  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepEqual(revoked, ['blob:test-1']);

  recorder.dispose();
  assert.equal(hotkeyTarget.listeners.get('keydown')?.size || 0, 0);
});

test('screencast recorder stops when the selected display track ends', async () => {
  let stream = new FakeStream();
  let recorder = new ScreencastRecorder({
    download: false,
    navigator: { mediaDevices: { getDisplayMedia: async () => stream } },
    MediaRecorder: FakeMediaRecorder,
  });

  await recorder.start();
  assert.equal(recorder.state, 'recording');
  stream.videoTrack.end();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(recorder.state, 'idle');
});

test('screencast recorder reports when capture returns no audio track', async () => {
  let stream = new FakeStream({ audio: false });
  let starts = [];
  let stops = [];
  let recorder = new ScreencastRecorder({
    download: false,
    eventTarget: {
      dispatchEvent(event) {
        if (event.type === 'sn-screencast-start') starts.push(event.detail);
        if (event.type === 'sn-screencast-stop') stops.push(event.detail);
      },
    },
    navigator: { mediaDevices: { getDisplayMedia: async () => stream } },
    MediaRecorder: FakeMediaRecorder,
  });

  await recorder.start();
  assert.equal(starts[0].capture.audioRequested, true);
  assert.equal(starts[0].capture.audioTrackCount, 0);
  assert.equal(starts[0].capture.hasAudio, false);
  assert.equal(starts[0].capture.videoTrackCount, 1);

  await recorder.stop();
  assert.equal(stops[0].capture.audioRequested, true);
  assert.equal(stops[0].capture.audioTrackCount, 0);
  assert.equal(stops[0].capture.hasAudio, false);
});

test('screencast recorder muxes provider audio into the recorded stream', async () => {
  let displayStream = new FakeStream({ audio: false });
  let extraTrack = new FakeTrack('audio');
  let closed = 0;
  let recorder = new ScreencastRecorder({
    download: false,
    navigator: { mediaDevices: { getDisplayMedia: async () => displayStream } },
    MediaRecorder: FakeMediaRecorder,
    MediaStream: FakeStream,
  });

  await recorder.start({
    filename: 'tour.webm',
    audioTrackProvider: async () => ({
      track: extraTrack,
      close() {
        closed += 1;
      },
    }),
  });

  let activeRecorder = FakeMediaRecorder.instances.at(-1);
  assert.equal(activeRecorder.stream.getVideoTracks().length, 1);
  assert.equal(activeRecorder.stream.getAudioTracks().length, 1);
  assert.equal(recorder.state, 'recording');

  let detail = await recorder.stop();
  assert.equal(detail.filename, 'tour.webm');
  assert.equal(detail.capture.audioTrackCount, 1);
  assert.equal(detail.capture.extraAudioTrackCount, 1);
  assert.equal(detail.capture.hasAudio, true);
  assert.equal(displayStream.videoTrack.stopped, true);
  assert.equal(extraTrack.stopped, true);
  assert.equal(closed, 1);
});

test('screencast recorder returns to idle when display capture is denied', async () => {
  let errors = [];
  let recorder = new ScreencastRecorder({
    download: false,
    eventTarget: {
      dispatchEvent(event) {
        if (event.type === 'sn-screencast-error') errors.push(event.detail.error);
      },
    },
    navigator: {
      mediaDevices: {
        async getDisplayMedia() {
          let error = new Error('Not allowed');
          error.name = 'NotAllowedError';
          throw error;
        },
      },
    },
    MediaRecorder: FakeMediaRecorder,
  });

  await assert.rejects(recorder.start(), { name: 'NotAllowedError' });
  assert.equal(recorder.state, 'idle');
  assert.equal(errors.length, 1);
});

test('recordTourScreencast starts capture before playback and stops after playback', async () => {
  let order = [];
  let recorder = {
    async start() {
      order.push('start');
    },
    async stop() {
      order.push('stop');
      return { blob: new Blob(['ok']) };
    },
  };

  let result = await recordTourScreencast({
    recorder,
    tailMs: 0,
    play: async () => {
      order.push('play');
      return 'played';
    },
  });

  assert.deepEqual(order, ['start', 'play', 'stop']);
  assert.equal(result.value, 'played');
  assert.equal(result.recording.blob.size, 2);
});

test('recordTourScreencast does not play when capture start fails', async () => {
  let played = false;
  let stopped = false;
  await assert.rejects(
    recordTourScreencast({
      recorder: {
        async start() {
          throw new Error('capture denied');
        },
        async stop() {
          stopped = true;
        },
      },
      play: async () => {
        played = true;
      },
    }),
    /capture denied/,
  );

  assert.equal(played, false);
  assert.equal(stopped, false);
});

test('recordTourScreencast stops an active recording when playback fails', async () => {
  let stopped = false;
  await assert.rejects(
    recordTourScreencast({
      recorder: {
        async start() {},
        async stop(reason) {
          stopped = reason;
        },
      },
      play: async () => {
        throw new Error('tour failed');
      },
    }),
    /tour failed/,
  );

  assert.equal(stopped, 'tour-screencast-error');
});
