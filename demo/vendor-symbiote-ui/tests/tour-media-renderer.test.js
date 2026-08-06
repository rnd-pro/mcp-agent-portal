import { acquireCurrentTestFileLock } from './test-lock.js';
await acquireCurrentTestFileLock(import.meta.url);

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildCaptionPlacementTrack } from 'symbiote-engine/render-captions';

import {
  TourMediaRenderError,
  createTourCaptionTrack,
  createTourMediaRenderPlan,
  drawTourCaptionOverlay,
  getTourMediaSupport,
  normalizeTourMediaTimeline,
  renderTourVideo,
} from '../ui/tour-media-renderer.js';
import { createLiveCaptionTrack } from '../ui/live-captions.js';

class FakeTrack {
  constructor(kind, options = {}) {
    this.kind = kind;
    this.stopped = false;
    this.stopCount = 0;
    this.frameRequests = [];
    if (kind === 'video' && options.manualCapture !== false) {
      this.requestFrame = () => {
        if (options.requestFrameError) throw options.requestFrameError;
        this.frameRequests.push(options.clock?.now?.() ?? null);
      };
    }
  }

  stop() {
    this.stopped = true;
    this.stopCount += 1;
  }
}

class FakeStream {
  constructor(tracks = []) {
    this._tracks = tracks;
  }

  getTracks() {
    return this._tracks;
  }

  getAudioTracks() {
    return this._tracks.filter((track) => track.kind === 'audio');
  }

  getVideoTracks() {
    return this._tracks.filter((track) => track.kind === 'video');
  }
}

class FakeCanvasContext {
  constructor() {
    this.calls = [];
  }

  fillRect(...args) {
    this.calls.push(['fillRect', ...args]);
  }

  fillText(...args) {
    this.calls.push(['fillText', ...args]);
  }

  measureText(text) {
    return { width: String(text).length * 10 };
  }
}

class FakeCanvas {
  constructor(options = {}) {
    this.width = 0;
    this.height = 0;
    this.context = new FakeCanvasContext();
    this.captureRates = [];
    this.videoTrack = new FakeTrack('video', options);
  }

  getContext(type) {
    return type === '2d' ? this.context : null;
  }

  captureStream(rate) {
    this.captureRates.push(rate);
    return new FakeStream([this.videoTrack]);
  }
}

class FakeMediaRecorder extends EventTarget {
  static isTypeSupported(type) {
    return type === 'video/webm';
  }

  constructor(stream, options = {}) {
    super();
    this.stream = stream;
    this.mimeType = options.mimeType || 'video/webm';
    this.state = 'inactive';
    this.startCount = 0;
    this.stopCount = 0;
    this.constructor.instances.push(this);
  }

  start() {
    this.state = 'recording';
    this.startCount += 1;
  }

  stop() {
    this.stopCount += 1;
    this.state = 'inactive';
    queueMicrotask(() => {
      let event = new Event('dataavailable');
      event.data = new Blob(['webm'], { type: this.mimeType });
      this.dispatchEvent(event);
      this.dispatchEvent(new Event('stop'));
    });
  }
}

FakeMediaRecorder.instances = [];

function createFrameClock(startMs = 0) {
  let currentMs = startMs;
  let waits = [];
  return {
    now() {
      return currentMs;
    },
    async wait(durationMs, signal) {
      if (signal?.aborted) throw signal.reason;
      waits.push(durationMs);
      currentMs += durationMs;
    },
    advance(durationMs) {
      currentMs += durationMs;
    },
    get waits() {
      return waits.slice();
    },
  };
}

function rendererOptions(options = {}) {
  let frameClock = options.frameClock || createFrameClock();
  let canvas = options.canvas || new FakeCanvas({ clock: frameClock });
  return {
    canvas,
    frameClock,
    MediaRecorder: FakeMediaRecorder,
    MediaStream: FakeStream,
    Blob,
    preferredMimeTypes: ['video/webm'],
    ...options,
  };
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}

test('normalizes tour timeline and drops empty or undefined turns', () => {
  let timeline = normalizeTourMediaTimeline({
    title: '  Current UI  ',
    turns: [
      { persona: ' guide ', text: ' First section ' },
      { persona: 'ops', text: undefined },
      { persona: 'ops', text: 'undefined' },
      { persona: '', text: 'Second section' },
    ],
  });

  assert.equal(timeline.title, 'Current UI');
  assert.equal(timeline.turns.length, 2);
  assert.deepEqual(timeline.turns.map((turn) => turn.text), ['First section', 'Second section']);
  assert.deepEqual(timeline.turns.map((turn) => turn.persona), ['guide', 'ops']);
  assert.ok(timeline.totalMs > 0);
});

test('reports missing audio provider when audio rendering is requested', async () => {
  await assert.rejects(
    renderTourVideo(
      { turns: [{ text: 'Narrated section' }] },
      rendererOptions({
        canvas: new FakeCanvas(),
      })
    ),
    (error) => {
      assert.ok(error instanceof TourMediaRenderError);
      assert.equal(error.code, 'missing-audio-source');
      assert.equal(error.detail.audioTrackCount, 0);
      return true;
    }
  );
});

test('renders a webm blob when an audio stream is supplied', async () => {
  let frameClock = createFrameClock();
  let canvas = new FakeCanvas({ clock: frameClock });
  let audioTrack = new FakeTrack('audio');
  let result = await renderTourVideo(
    { title: 'Demo', turns: [{ text: 'One short section', durationMs: 250 }] },
    rendererOptions({
      canvas,
      frameClock,
      audioStream: new FakeStream([audioTrack]),
      fps: 4,
      filename: 'demo.webm',
    })
  );

  assert.equal(result.type, 'video/webm');
  assert.equal(result.filename, 'demo.webm');
  assert.equal(result.audio.requested, true);
  assert.equal(result.audio.trackCount, 1);
  assert.equal(result.video.trackCount, 1);
  assert.ok(result.blob.size > 0);
  assert.equal(canvas.videoTrack.stopped, true);
  assert.equal(audioTrack.stopped, true);
  assert.deepEqual(canvas.captureRates, [0]);
  assert.deepEqual(canvas.videoTrack.frameRequests, [0]);
});

test('creates karaoke caption tracks from audio word timings', () => {
  let track = createTourCaptionTrack({
    title: 'Workspace tour',
    turns: [{
      cueId: 'caption:hello-board',
      id: 'legacy-tour-id',
      index: 91,
      persona: 'guide',
      text: 'Hello board',
      durationMs: 120,
    }],
  }, {
    captionsMode: 'karaoke',
    width: 1280,
    height: 720,
    captionStyle: { preset: 'youtube' },
    wordTimings: [
      { index: 0, wordIndex: 0, word: 'Hello', startMs: 12, endMs: 42 },
      { index: 0, wordIndex: 1, word: 'board', startMs: 44, endMs: 82 },
    ],
  });

  assert.equal(track.mode, 'karaoke');
  assert.equal(track.schemaVersion, 'caption-presentation-track-v2');
  assert.equal(track.cues[0].cueId, 'caption:hello-board');
  assert.equal(track.wordTimingCount, 2);
  assert.deepEqual(
    track.cues[0].wordTimings.map((word) => [word.text, word.startSec, word.endSec]),
    [['Hello', 0.012, 0.042], ['board', 0.044, 0.082]],
  );
});

test('live and tour preview captions share canonical v2 cue identity', () => {
  let cueId = 'caption:shared-live-preview';
  let liveTrack = createLiveCaptionTrack([{
    cueId,
    id: 'legacy-live-id',
    index: 17,
    speaker: 'guide',
    text: 'Shared identity',
    startSec: 0,
    endSec: 1,
  }], {
    width: 1280,
    height: 720,
    captionStyle: { preset: 'youtube' },
  });
  let previewTrack = createTourCaptionTrack({
    turns: [{
      cueId,
      id: 'legacy-preview-id',
      index: 23,
      persona: 'guide',
      text: 'Shared identity',
      durationMs: 1000,
    }],
  }, {
    captionsMode: 'karaoke',
    width: 1280,
    height: 720,
    captionStyle: { preset: 'youtube' },
  });

  assert.equal(liveTrack.schemaVersion, 'caption-presentation-track-v2');
  assert.equal(previewTrack.schemaVersion, liveTrack.schemaVersion);
  assert.equal(liveTrack.cues[0].cueId, cueId);
  assert.equal(previewTrack.cues[0].cueId, cueId);
});

test('tour caption tracks reject legacy identity aliases without cueId', () => {
  let options = {
    captionsMode: 'karaoke',
    width: 1280,
    height: 720,
    captionStyle: { preset: 'youtube' },
  };
  assert.throws(() => createTourCaptionTrack({
    turns: [{ id: 'legacy-id', text: 'Legacy ID', durationMs: 1000 }],
  }, options), /requires a non-empty cueId/);
  assert.throws(() => createTourCaptionTrack({
    turns: [{ index: 5, text: 'Legacy index', durationMs: 1000 }],
  }, options), /requires a non-empty cueId/);
});

test('canvas captions use the engine-selected rectangle and output profile', () => {
  let plan = createTourMediaRenderPlan({
    title: 'Workspace tour',
    turns: [{ cueId: 'caption:canvas-hello', persona: 'guide', text: 'Hello board', durationMs: 1000 }],
  });
  let track = createTourCaptionTrack(plan, {
    captionsMode: 'karaoke',
    width: 1280,
    height: 720,
    captionStyle: { preset: 'youtube', fontSize: 40 },
    avoidRegions: [
      { id: 'editor', kind: 'attention', x: 0, y: 420, width: 1280, height: 300 },
    ],
  });
  let ctx = new FakeCanvasContext();

  drawTourCaptionOverlay(ctx, plan.frames[0], plan, {
    captionsMode: 'karaoke',
    captionTrack: track,
    width: 640,
    height: 360,
    nowMs: 200,
  });

  let rect = track.cues[0].measuredRect;
  assert.equal(track.cues[0].placement.zone, 'top');
  assert.ok(ctx.calls.some((call) => call[0] === 'fillRect'
    && call[1] === rect.x * 0.5
    && call[2] === rect.y * 0.5
    && call[3] === rect.width * 0.5
    && call[4] === rect.height * 0.5));
  assert.equal(ctx.font, `700 ${track.profile.fontSize * 0.5}px ${track.profile.fontName}`);
});

test('canvas captions render every simultaneously active canonical cue', () => {
  let plan = createTourMediaRenderPlan({
    title: 'Workspace tour',
    turns: [{ persona: 'guide', text: 'Host frame', durationMs: 1000 }],
  });
  let track = deepFreeze(buildCaptionPlacementTrack([
    { cueId: 'primary', startSec: 0, endSec: 1, text: 'Primary cue' },
    { cueId: 'secondary', startSec: 0.2, endSec: 0.8, text: 'Secondary cue' },
  ], {
    width: 1280,
    height: 720,
    captionStyle: { preset: 'youtube', speakerTreatment: 'none' },
  }));
  let ctx = new FakeCanvasContext();

  drawTourCaptionOverlay(ctx, plan.frames[0], plan, {
    captionsMode: 'karaoke',
    captionTrack: track,
    width: 1280,
    height: 720,
    nowMs: 500,
  });

  let renderedText = ctx.calls
    .filter((call) => call[0] === 'fillText')
    .map((call) => call[1]);
  assert.ok(renderedText.includes('Primary'));
  assert.ok(renderedText.includes('Secondary'));
  assert.notEqual(track.cues[0].placement.zone, track.cues[1].placement.zone);
  assert.equal(ctx.calls.filter((call) => call[0] === 'fillRect').length, 2);
});

test('burns karaoke captions into rendered tour video and returns caption sidecar metadata', async () => {
  let frameClock = createFrameClock();
  let canvas = new FakeCanvas({ clock: frameClock });
  let closed = 0;
  let result = await renderTourVideo(
    { title: 'Demo', turns: [{ cueId: 'caption:rendered-hello', text: 'Hello board', durationMs: 1000 }] },
    rendererOptions({
      canvas,
      frameClock,
      audioProvider: () => ({
        stream: new FakeStream([new FakeTrack('audio')]),
        wordTimings: [
          { index: 0, wordIndex: 0, word: 'Hello', startMs: 0, endMs: 400 },
          { index: 0, wordIndex: 1, word: 'board', startMs: 500, endMs: 900 },
        ],
        close: () => {
          closed += 1;
        },
      }),
      captionsMode: 'karaoke',
      fps: 4,
    })
  );

  assert.equal(result.audio.hasAudio, true);
  assert.equal(result.audio.wordTimingCount, 2);
  assert.equal(result.captions.mode, 'karaoke');
  assert.equal(result.captions.burnedIn, true);
  assert.equal(result.captions.wordTimingCount, 2);
  assert.equal(result.captions.track.cues[0].wordTimings[1].text, 'board');
  assert.equal(closed, 1);
  assert.ok(canvas.context.calls.some((call) => call[0] === 'fillText' && call[1] === 'Hello'));
  assert.ok(canvas.context.calls.some((call) => call[0] === 'fillText' && call[1] === 'board'));
});

test('accepts a custom frame renderer for host UI capture and overlays captions after it', async () => {
  let frameClock = createFrameClock();
  let canvas = new FakeCanvas({ clock: frameClock });
  let frames = [];
  let result = await renderTourVideo(
    { title: 'Live UI', turns: [{ cueId: 'caption:panel-status', persona: 'guide', text: 'Panel status', durationMs: 500 }] },
    rendererOptions({
      canvas,
      frameClock,
      audioStream: new FakeStream([new FakeTrack('audio')]),
      captionsMode: 'karaoke',
      fps: 4,
      frameRenderer({ ctx, frame, nowMs, captionTrack, width, height }) {
        frames.push({ index: frame.index, nowMs, wordCount: captionTrack.wordTimingCount, width, height });
        ctx.fillText('LIVE UI', 4, 8);
      },
    })
  );

  assert.equal(result.video.frameRenderer, 'custom');
  assert.equal(result.video.renderedFrameCount, 2);
  assert.equal(frames.length, 2);
  assert.equal(frames[0].wordCount, 0);
  let texts = canvas.context.calls.filter((call) => call[0] === 'fillText').map((call) => call[1]);
  assert.ok(texts.includes('LIVE UI'));
  assert.ok(texts.includes('Panel'));
  assert.ok(texts.includes('status'));
});

test('closes provider-owned audio input after rendering', async () => {
  let closed = 0;
  let audioTrack = new FakeTrack('audio');
  let frameClock = createFrameClock();
  await renderTourVideo(
    { title: 'Demo', turns: [{ text: 'One section', durationMs: 250 }] },
    rendererOptions({
      canvas: new FakeCanvas({ clock: frameClock }),
      frameClock,
      audioProvider: () => ({
        stream: new FakeStream([audioTrack]),
        close: () => {
          closed += 1;
        },
      }),
      fps: 4,
    })
  );

  assert.equal(closed, 1);
  assert.equal(audioTrack.stopped, true);
});

test('requests exact manual canvas frames on the absolute fps schedule', async () => {
  let frameClock = createFrameClock(5000);
  let canvas = new FakeCanvas({ clock: frameClock });
  let renderedTimes = [];

  let result = await renderTourVideo(
    { title: 'Scheduled', turns: [{ text: 'One second', durationMs: 1000 }] },
    rendererOptions({
      canvas,
      frameClock,
      audioStream: new FakeStream([new FakeTrack('audio')]),
      fps: 4,
      frameRenderer({ nowMs }) {
        renderedTimes.push(nowMs);
      },
    }),
  );

  assert.deepEqual(canvas.captureRates, [0]);
  assert.deepEqual(renderedTimes, [0, 250, 500, 750]);
  assert.deepEqual(canvas.videoTrack.frameRequests, [5000, 5250, 5500, 5750]);
  assert.deepEqual(frameClock.waits, [250, 250, 250, 250]);
  assert.equal(result.video.renderedFrameCount, 4);
  assert.equal(result.video.requestedFrameCount, 4);
});

test('uses a frozen canonical caption track by identity without rebuilding it', async () => {
  let timeline = {
    title: 'Canonical captions',
    turns: [{ cueId: 'caption:immutable-handoff', text: 'Immutable handoff', durationMs: 1000 }],
  };
  let captionTrack = deepFreeze(createTourCaptionTrack(timeline, {
    captionsMode: 'karaoke',
    width: 1280,
    height: 720,
    captionStyle: { preset: 'youtube' },
  }));
  let before = JSON.stringify(captionTrack);
  let frameClock = createFrameClock();
  let seenTracks = [];

  let result = await renderTourVideo(timeline, rendererOptions({
    canvas: new FakeCanvas({ clock: frameClock }),
    frameClock,
    audioStream: new FakeStream([new FakeTrack('audio')]),
    captionsMode: 'karaoke',
    captionTrack,
    captionStyle: { preset: 'tiktok' },
    fps: 2,
    frameRenderer({ captionTrack: renderedTrack }) {
      seenTracks.push(renderedTrack);
    },
  }));

  assert.equal(result.captions.track, captionTrack);
  assert.equal(result.captions.track.cues[0].cueId, 'caption:immutable-handoff');
  assert.ok(seenTracks.every((track) => track === captionTrack));
  assert.equal(JSON.stringify(captionTrack), before);
});

test('rejects a non-canonical caption track before acquiring audio', async () => {
  let providerCalls = 0;

  await assert.rejects(
    renderTourVideo(
      { turns: [{ text: 'Invalid captions', durationMs: 1000 }] },
      rendererOptions({
        captionTrack: { cues: [] },
        audioProvider() {
          providerCalls += 1;
          return new FakeStream([new FakeTrack('audio')]);
        },
      }),
    ),
    (error) => {
      assert.ok(error instanceof TourMediaRenderError);
      assert.equal(error.code, 'invalid-caption-track');
      assert.match(error.message, /caption-presentation-track-v2/);
      return true;
    },
  );
  assert.equal(providerCalls, 0);
});

test('fails closed when manual canvas frame capture is unavailable and cleans tracks', async () => {
  let frameClock = createFrameClock();
  let canvas = new FakeCanvas({ clock: frameClock, manualCapture: false });
  let audioTrack = new FakeTrack('audio');

  await assert.rejects(
    renderTourVideo(
      { turns: [{ text: 'Manual capture required', durationMs: 1000 }] },
      rendererOptions({
        canvas,
        frameClock,
        audioStream: new FakeStream([audioTrack]),
      }),
    ),
    (error) => {
      assert.ok(error instanceof TourMediaRenderError);
      assert.equal(error.code, 'manual-frame-capture-unavailable');
      return true;
    },
  );
  assert.equal(canvas.videoTrack.stopped, true);
  assert.equal(audioTrack.stopped, true);
});

test('fails closed when rendering misses a frame deadline and cleans recorder and tracks', async () => {
  let frameClock = createFrameClock();
  let canvas = new FakeCanvas({ clock: frameClock });
  let audioTrack = new FakeTrack('audio');
  let recorderIndex = FakeMediaRecorder.instances.length;

  await assert.rejects(
    renderTourVideo(
      { turns: [{ text: 'Late frame', durationMs: 1000 }] },
      rendererOptions({
        canvas,
        frameClock,
        audioStream: new FakeStream([audioTrack]),
        fps: 4,
        frameRenderer() {
          frameClock.advance(250);
        },
      }),
    ),
    (error) => {
      assert.ok(error instanceof TourMediaRenderError);
      assert.equal(error.code, 'frame-deadline-missed');
      assert.equal(error.detail.frameIndex, 0);
      return true;
    },
  );

  let recorder = FakeMediaRecorder.instances[recorderIndex];
  assert.equal(recorder.stopCount, 1);
  assert.deepEqual(canvas.videoTrack.frameRequests, []);
  assert.equal(canvas.videoTrack.stopped, true);
  assert.equal(audioTrack.stopped, true);
});

test('cleans recorder, video, and provider audio when frame rendering fails', async () => {
  let frameClock = createFrameClock();
  let canvas = new FakeCanvas({ clock: frameClock });
  let audioTrack = new FakeTrack('audio');
  let closed = 0;
  let recorderIndex = FakeMediaRecorder.instances.length;

  await assert.rejects(
    renderTourVideo(
      { turns: [{ text: 'Broken render', durationMs: 1000 }] },
      rendererOptions({
        canvas,
        frameClock,
        audioProvider: () => ({
          stream: new FakeStream([audioTrack]),
          close() {
            closed += 1;
          },
        }),
        frameRenderer() {
          throw new Error('paint failed');
        },
      }),
    ),
    (error) => {
      assert.ok(error instanceof TourMediaRenderError);
      assert.equal(error.code, 'frame-render-failed');
      return true;
    },
  );

  let recorder = FakeMediaRecorder.instances[recorderIndex];
  assert.equal(recorder.stopCount, 1);
  assert.equal(canvas.videoTrack.stopped, true);
  assert.equal(audioTrack.stopped, true);
  assert.equal(closed, 1);
});

test('cleans recorder, video, and audio when rendering is aborted', async () => {
  let frameClock = createFrameClock();
  let canvas = new FakeCanvas({ clock: frameClock });
  let audioTrack = new FakeTrack('audio');
  let controller = new AbortController();
  let recorderIndex = FakeMediaRecorder.instances.length;

  await assert.rejects(
    renderTourVideo(
      { turns: [{ text: 'Abort render', durationMs: 1000 }] },
      rendererOptions({
        canvas,
        frameClock,
        audioStream: new FakeStream([audioTrack]),
        signal: controller.signal,
        frameRenderer() {
          controller.abort();
        },
      }),
    ),
    (error) => error?.name === 'AbortError',
  );

  let recorder = FakeMediaRecorder.instances[recorderIndex];
  assert.equal(recorder.stopCount, 1);
  assert.deepEqual(canvas.videoTrack.frameRequests, []);
  assert.equal(canvas.videoTrack.stopped, true);
  assert.equal(audioTrack.stopped, true);
});

test('reports browser capability support from injected platform constructors', () => {
  let support = getTourMediaSupport({
    canvas: new FakeCanvas(),
    MediaRecorder: FakeMediaRecorder,
    MediaStream: FakeStream,
    Blob,
  });

  assert.equal(support.canvas, true);
  assert.equal(support.mediaRecorder, true);
  assert.equal(support.mediaStream, true);
  assert.equal(support.blob, true);
  assert.equal(support.supported, true);
});
