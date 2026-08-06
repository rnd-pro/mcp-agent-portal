import { acquireCurrentTestFileLock } from './test-lock.js';
await acquireCurrentTestFileLock(import.meta.url);

import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  TOUR_AUDIO_PROVIDER_BROWSER_ID,
  TOUR_AUDIO_PROVIDER_SYNTHETIC_CUES_ID,
  TourAudioProviderError,
  createTourAudioProvider,
  createTourCueAudioPlan,
  createTourCueAudioProvider,
  getTourAudioProviderSupport,
  listTourAudioProviders,
  resolveTourAudioProvider,
} from '../ui/tour-audio-provider.js';

class FakeTrack {
  constructor(kind) {
    this.kind = kind;
    this.stopped = false;
  }

  stop() {
    this.stopped = true;
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
}

class FakeAudioParam {
  constructor() {
    this.calls = [];
  }

  setValueAtTime(value, time) {
    this.calls.push(['set', value, time]);
  }

  exponentialRampToValueAtTime(value, time) {
    this.calls.push(['exp', value, time]);
  }

  linearRampToValueAtTime(value, time) {
    this.calls.push(['linear', value, time]);
  }
}

class FakeAudioNode {
  constructor(kind) {
    this.kind = kind;
    this.connections = [];
  }

  connect(node) {
    this.connections.push(node);
    return node;
  }
}

class FakeOscillator extends FakeAudioNode {
  constructor() {
    super('oscillator');
    this.frequency = new FakeAudioParam();
    this.starts = [];
    this.stops = [];
    this.type = 'sine';
  }

  start(time) {
    this.starts.push(time);
  }

  stop(time) {
    this.stops.push(time);
  }
}

class FakeGain extends FakeAudioNode {
  constructor() {
    super('gain');
    this.gain = new FakeAudioParam();
  }
}

class FakeAudioContext {
  constructor() {
    this.currentTime = 1;
    this.state = 'suspended';
    this.closed = false;
    this.track = new FakeTrack('audio');
    this.destination = new FakeAudioNode('destination');
    this.oscillators = [];
  }

  createMediaStreamDestination() {
    return {
      stream: new FakeStream([this.track]),
    };
  }

  createOscillator() {
    let oscillator = new FakeOscillator();
    this.oscillators.push(oscillator);
    return oscillator;
  }

  createGain() {
    return new FakeGain();
  }

  async resume() {
    this.state = 'running';
  }

  async close() {
    this.closed = true;
  }
}

class FakeHangingResumeAudioContext extends FakeAudioContext {
  async resume() {
    return new Promise(() => {});
  }
}

test('builds deterministic cue and word timings from a tour timeline', () => {
  let first = createTourCueAudioPlan({
    title: 'Workspace tour',
    turns: [
      { persona: 'guide', text: 'Open the dispatcher board', durationMs: 1500 },
      { persona: 'ops', text: 'Review priority one work orders', durationMs: 1800 },
    ],
  });
  let second = createTourCueAudioPlan({
    title: 'Workspace tour',
    turns: [
      { persona: 'guide', text: 'Open the dispatcher board', durationMs: 1500 },
      { persona: 'ops', text: 'Review priority one work orders', durationMs: 1800 },
    ],
  });

  assert.equal(first.turns.length, 2);
  assert.equal(first.audio.kind, 'synthetic-cues');
  assert.ok(first.cues.length > first.turns.length);
  assert.ok(first.wordTimings.length >= 8);
  assert.deepEqual(first.cues, second.cues);
  assert.equal(first.cues[0].kind, 'turn');
  assert.equal(first.cues[1].kind, 'word');
});

test('creates a provider-owned MediaStream audio track and closes it', async () => {
  let fakeCtx = new FakeAudioContext();
  let provider = createTourCueAudioProvider({
    audioContext: fakeCtx,
    peakGain: 0.01,
  });

  let result = await provider({
    timeline: {
      turns: [{ persona: 'guide', text: 'Explain the current UI', durationMs: 1000 }],
    },
  });

  assert.equal(result.kind, 'synthetic-tour-cues');
  assert.equal(result.track.kind, 'audio');
  assert.equal(result.stream.getAudioTracks().length, 1);
  assert.ok(fakeCtx.oscillators.length > 1);
  assert.equal(fakeCtx.state, 'running');

  await result.close();
  assert.equal(fakeCtx.track.stopped, true);
  assert.equal(fakeCtx.closed, false);
});

test('does not block audio export when AudioContext resume is stalled', async () => {
  let fakeCtx = new FakeHangingResumeAudioContext();
  let provider = createTourCueAudioProvider({
    audioContext: fakeCtx,
    resumeTimeoutMs: 1,
  });

  let result = await provider({
    timeline: {
      turns: [{ persona: 'guide', text: 'Render the tour', durationMs: 1000 }],
    },
  });

  assert.equal(result.track.kind, 'audio');
  assert.equal(fakeCtx.state, 'suspended');
  await result.close();
});

test('reports provider support from injected AudioContext capability', () => {
  let support = getTourAudioProviderSupport({ AudioContext: FakeAudioContext });

  assert.equal(support.audioContext, true);
  assert.equal(support.mediaStreamDestination, true);
  assert.equal(support.supported, true);
});

test('lists browser audio as the default tour provider', () => {
  let providers = listTourAudioProviders();
  assert.deepEqual(
    providers.map((provider) => provider.id),
    [TOUR_AUDIO_PROVIDER_BROWSER_ID, TOUR_AUDIO_PROVIDER_SYNTHETIC_CUES_ID],
  );

  let browser = resolveTourAudioProvider();
  assert.equal(browser.id, TOUR_AUDIO_PROVIDER_BROWSER_ID);
  assert.equal(browser.live, true);

  let provider = createTourAudioProvider();
  assert.equal(provider.id, TOUR_AUDIO_PROVIDER_BROWSER_ID);
  assert.equal(provider.captureAudio, true);
  assert.equal(typeof provider.getExtraAudioInput, 'function');
});

test('creates a synthetic cue provider as an explicit non-default option', async () => {
  let fakeCtx = new FakeAudioContext();
  let provider = createTourAudioProvider(TOUR_AUDIO_PROVIDER_SYNTHETIC_CUES_ID, {
    audioContext: fakeCtx,
  });

  assert.equal(provider.id, TOUR_AUDIO_PROVIDER_SYNTHETIC_CUES_ID);
  assert.equal(provider.live, false);
  assert.equal(provider.captureAudio, false);

  let input = await provider.getExtraAudioInput({
    timeline: { turns: [{ text: 'Generated cue track', durationMs: 1000 }] },
  });

  assert.equal(input.track.kind, 'audio');
  await input.close();
});

test('rejects unknown tour audio provider ids', () => {
  assert.throws(
    () => resolveTourAudioProvider('symbiote-engine-local'),
    (error) => {
      assert.ok(error instanceof TourAudioProviderError);
      assert.equal(error.code, 'unknown-audio-provider');
      assert.deepEqual(error.detail.available, [
        TOUR_AUDIO_PROVIDER_BROWSER_ID,
        TOUR_AUDIO_PROVIDER_SYNTHETIC_CUES_ID,
      ]);
      return true;
    },
  );
});
