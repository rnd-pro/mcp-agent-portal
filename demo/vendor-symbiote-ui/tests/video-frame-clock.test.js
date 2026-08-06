import { acquireCurrentTestFileLock } from './test-lock.js';
await acquireCurrentTestFileLock(import.meta.url);

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createVideoFrameClock } from '../ui/video-frame-clock.js';

function createFakeVideo() {
  let pending = new Map();
  let nextHandle = 1;
  return {
    duration: 4,
    currentTime: 0,
    requestVideoFrameCallback(callback) {
      let handle = nextHandle;
      nextHandle += 1;
      pending.set(handle, callback);
      return handle;
    },
    cancelVideoFrameCallback(handle) {
      pending.delete(handle);
    },
    get pendingCount() {
      return pending.size;
    },
    __pendingEntries() {
      return Array.from(pending.values()).map((callback) => ({ callback }));
    },
    presentFrame(metadata = {}) {
      let entries = Array.from(pending.entries());
      pending.clear();
      for (let [, callback] of entries) {
        callback(metadata.presentationTime ?? 0, metadata);
      }
    },
  };
}

test('video frame clock starts once and publishes rVFC metadata', () => {
  let video = createFakeVideo();
  let frames = [];
  let clock = createVideoFrameClock(video, { onFrame: (detail) => frames.push(detail) });

  assert.equal(clock.supported, true);
  assert.equal(clock.start(), true);
  assert.equal(clock.start(), false, 'second start is a no-op while running');
  assert.equal(video.pendingCount, 1, 'exactly one pending callback is registered');

  video.presentFrame({ mediaTime: 1.5, presentedFrames: 3, width: 1920, height: 1080 });
  assert.equal(frames.length, 1);
  assert.equal(frames[0].mediaTime, 1.5);
  assert.equal(frames[0].presentedFrames, 3);
  assert.equal(frames[0].width, 1920);
  assert.equal(frames[0].height, 1080);
  assert.equal(frames[0].frameId, 1);
  assert.equal(video.pendingCount, 1, 'a fresh callback is queued after each frame');

  video.presentFrame({ mediaTime: 1.6 });
  assert.equal(frames.length, 2);
  assert.equal(frames[1].frameId, 2);

  clock.dispose();
});

test('video frame clock cancels the pending callback and never publishes after stop', () => {
  let video = createFakeVideo();
  let frames = [];
  let clock = createVideoFrameClock(video, { onFrame: (detail) => frames.push(detail) });
  clock.start();
  assert.equal(video.pendingCount, 1);

  clock.stop();
  assert.equal(clock.running, false);
  assert.equal(video.pendingCount, 0, 'stop cancels the actual pending callback');

  // A stale frame that fires after stop must not publish.
  video.presentFrame({ mediaTime: 9 });
  assert.equal(frames.length, 0);

  // Re-start after stop resumes a single callback.
  assert.equal(clock.start(), true);
  assert.equal(video.pendingCount, 1);
  clock.dispose();
  assert.equal(video.pendingCount, 0, 'dispose cancels the pending callback');
});

test('video frame clock ignores a stale callback delivered after stop then restart', () => {
  let video = createFakeVideo();
  let frames = [];
  let clock = createVideoFrameClock(video, { onFrame: (detail) => frames.push(detail) });

  clock.start();
  // Capture the first-generation callback without firing it yet.
  let staleEntries = Array.from(video.__pendingEntries());

  clock.stop();
  clock.start();
  assert.equal(video.pendingCount, 1, 'restart keeps exactly one pending callback');

  // The old (generation-1) callback now fires late; it must not publish or schedule.
  for (let { callback } of staleEntries) callback(0, { mediaTime: 9 });
  assert.equal(frames.length, 0, 'a stale callback publishes nothing');
  assert.equal(video.pendingCount, 1, 'a stale callback schedules no extra loop');

  // The live handle survives the stale callback and is still cancelable by stop().
  clock.stop();
  assert.equal(video.pendingCount, 0, 'stop cancels the live handle after a stale callback');
  clock.start();

  // The live generation still works.
  video.presentFrame({ mediaTime: 2 });
  assert.equal(frames.length, 1);
  assert.equal(frames[0].mediaTime, 2);

  clock.dispose();
});

test('video frame clock keeps running when a consumer callback throws', () => {
  let video = createFakeVideo();
  let calls = 0;
  let clock = createVideoFrameClock(video, {
    onFrame: () => {
      calls += 1;
      throw new Error('consumer failure');
    },
  });
  clock.start();
  assert.throws(() => video.presentFrame({ mediaTime: 0.1 }), /consumer failure/);
  assert.equal(calls, 1);
  assert.equal(video.pendingCount, 1, 'next frame callback survives a consumer throw');
  clock.dispose();
});

test('video frame clock reports unsupported hosts without throwing', () => {
  let clock = createVideoFrameClock({}, { onFrame: () => {} });
  assert.equal(clock.supported, false);
  assert.equal(clock.start(), false);
  assert.equal(clock.running, false);
  clock.stop();
  clock.dispose();
});

test('video frame clock requires a cancelable callback surface', () => {
  let clock = createVideoFrameClock({ requestVideoFrameCallback: () => 1 });
  assert.equal(clock.supported, false);
  assert.equal(clock.start(), false);
});
