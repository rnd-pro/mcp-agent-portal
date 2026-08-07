import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  createRenderFrameCompletionTracker,
  partitionRenderFrameRanges,
} from '../render-workers.js';

test('render workers partition frames into exhaustive contiguous ranges', () => {
  assert.deepEqual(partitionRenderFrameRanges(10, 3), [
    { workerIndex: 0, startFrame: 0, endFrame: 3, frameCount: 4 },
    { workerIndex: 1, startFrame: 4, endFrame: 6, frameCount: 3 },
    { workerIndex: 2, startFrame: 7, endFrame: 9, frameCount: 3 },
  ]);
  assert.deepEqual(partitionRenderFrameRanges(2, 8), [
    { workerIndex: 0, startFrame: 0, endFrame: 0, frameCount: 1 },
    { workerIndex: 1, startFrame: 1, endFrame: 1, frameCount: 1 },
  ]);
  assert.throws(() => partitionRenderFrameRanges(0, 1), /frameCount/);
  assert.throws(() => partitionRenderFrameRanges(10, 0), /workerCount/);
});

test('render frame completion reports completed and contiguous progress separately', () => {
  let tracker = createRenderFrameCompletionTracker(6);

  assert.deepEqual(tracker.mark(4), {
    completedFrames: 1,
    contiguousFrames: 0,
    totalFrames: 6,
    progress: 1 / 6,
    contiguousProgress: 0,
  });
  assert.equal(tracker.mark(5).contiguousFrames, 0);
  assert.equal(tracker.mark(0).contiguousFrames, 1);
  assert.equal(tracker.mark(2).contiguousFrames, 1);
  assert.equal(tracker.mark(1).contiguousFrames, 3);
  assert.equal(tracker.mark(3).contiguousFrames, 6);
  assert.throws(() => tracker.mark(3), /already completed/);
  assert.throws(() => tracker.mark(6), /outside/);
});
