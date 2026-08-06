import { acquireCurrentTestFileLock } from './test-lock.js';
await acquireCurrentTestFileLock(import.meta.url);

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { hydrateMediaStudioPreviewPanel } from '../ui/media-studio-surface.js';

function createFakeVideo() {
  let pending = new Map();
  let next = 1;
  return {
    tagName: 'VIDEO',
    requestVideoFrameCallback(callback) {
      let handle = next;
      next += 1;
      pending.set(handle, callback);
      return handle;
    },
    cancelVideoFrameCallback(handle) {
      pending.delete(handle);
    },
    get pendingCount() {
      return pending.size;
    },
    present(metadata = {}) {
      let callbacks = Array.from(pending.values());
      pending.clear();
      for (let callback of callbacks) callback(metadata.presentationTime ?? 0, metadata);
    },
  };
}

function createFakeTimeline() {
  return {
    calls: [],
    setFrame(frame, options) {
      this.calls.push({ frame, options });
    },
  };
}

let fakeProjection = {
  timeToTick: (seconds) => Math.round(seconds * 90),
  timeToFrame: (seconds) => Math.floor(seconds * 30),
};

test('hydrateMediaStudioPreviewPanel installs one frame clock and derives frame/tick', () => {
  let video = createFakeVideo();
  let timeline = createFakeTimeline();
  let details = [];
  let controller = hydrateMediaStudioPreviewPanel(video, {
    projection: fakeProjection,
    timeline,
    onFrame: (detail) => details.push(detail),
  });

  assert.equal(controller.video, video);
  assert.equal(controller.clock.running, true);
  assert.equal(video.pendingCount, 1, 'exactly one rVFC callback is installed');

  video.present({ mediaTime: 1, presentedFrames: 30 });
  assert.equal(details.length, 1);
  assert.equal(details[0].mediaTime, 1);
  assert.equal(details[0].frame, 30);
  assert.equal(details[0].tick, 90);
  assert.deepEqual(timeline.calls, [{ frame: 30, options: { silent: true } }]);
  assert.equal(video.pendingCount, 1, 'the clock re-queues one callback');

  controller.dispose();
  assert.equal(video.pendingCount, 0, 'dispose cancels the pending rVFC handle');
});

test('hydrateMediaStudioPreviewPanel replaces a prior hydration without leaking callbacks', () => {
  let video = createFakeVideo();
  let firstDetails = [];
  let secondDetails = [];
  let first = hydrateMediaStudioPreviewPanel(video, {
    projection: fakeProjection,
    onFrame: (detail) => firstDetails.push(detail),
  });
  assert.equal(video.pendingCount, 1);

  let second = hydrateMediaStudioPreviewPanel(video, {
    projection: fakeProjection,
    onFrame: (detail) => secondDetails.push(detail),
  });
  assert.equal(first.clock.running, false, 'the prior clock is disposed on rehydration');
  assert.equal(video.pendingCount, 1, 'still exactly one pending callback after rehydration');

  video.present({ mediaTime: 2 });
  assert.equal(firstDetails.length, 0, 'the superseded hydration publishes nothing');
  assert.equal(secondDetails.length, 1);
  assert.equal(secondDetails[0].frame, 60);

  second.dispose();
  assert.equal(video.pendingCount, 0);
});

test('hydrateMediaStudioPreviewPanel works without a projection or timeline', () => {
  let video = createFakeVideo();
  let details = [];
  let controller = hydrateMediaStudioPreviewPanel(video, { onFrame: (detail) => details.push(detail) });
  video.present({ mediaTime: 0.5 });
  assert.equal(details.length, 1);
  assert.equal(details[0].frame, null);
  assert.equal(details[0].tick, null);
  controller.dispose();
  assert.equal(video.pendingCount, 0);
});

test('hydrateMediaStudioPreviewPanel returns a safe no-op when there is no preview video', () => {
  let root = { querySelector: () => null };
  let controller = hydrateMediaStudioPreviewPanel(root, { onFrame: () => {} });
  assert.equal(controller.video, null);
  assert.equal(controller.clock, null);
  assert.doesNotThrow(() => controller.dispose());
});

test('hydrateMediaStudioPreviewPanel finds the preview video inside a root element', () => {
  let video = createFakeVideo();
  let root = {
    querySelector(selector) {
      return selector === '[data-media-preview-video]' ? video : null;
    },
  };
  let controller = hydrateMediaStudioPreviewPanel(root, {});
  assert.equal(controller.video, video);
  assert.equal(video.pendingCount, 1);
  controller.dispose();
});

test('hydrateMediaStudioPreviewPanel surfaces timeline synchronization failures', () => {
  let video = createFakeVideo();
  let controller = hydrateMediaStudioPreviewPanel(video, {
    projection: fakeProjection,
    timeline: {
      setFrame() {
        throw new Error('timeline failed');
      },
    },
  });

  assert.throws(() => video.present({ mediaTime: 1 }), /timeline failed/);
  controller.dispose();
});
