import { acquireCurrentTestFileLock } from './test-lock.js';
await acquireCurrentTestFileLock(import.meta.url);

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createXRFrameTimingTracker } from '../xr/frame-timing.js';

test('createXRFrameTimingTracker records contiguous samples and calculates metrics', () => {
  const tracker = createXRFrameTimingTracker({ nominalFrameRate: 90 });

  // Nominal rate
  assert.equal(tracker.getNominalFrameRate(), 90);

  // Record a sequence of frames at ~90fps (interval ~11.11ms)
  const interval = 11.11;
  let time = 1000;
  tracker.recordFrame(time);
  for (let i = 0; i < 90; i++) {
    time += interval;
    tracker.recordFrame(time);
  }

  const metrics = tracker.getMetrics();
  assert.equal(metrics.version, 'xr-frame-timing-v1');
  assert.equal(metrics.nominalFrameRate, 90);
  assert.equal(metrics.sampleCount, 91);
  assert.ok(Math.abs(metrics.durationMs - 1000) < 10);
  assert.ok(metrics.meanIntervalMs > 11.0 && metrics.meanIntervalMs < 11.2);
  assert.ok(metrics.p95IntervalMs > 11.0 && metrics.p95IntervalMs < 11.2);
  assert.ok(metrics.maxIntervalMs > 11.0 && metrics.maxIntervalMs < 11.2);
  assert.equal(metrics.dropRatio, 0); // No dropped frames
  assert.ok(metrics.effectiveFrameRate > 89 && metrics.effectiveFrameRate < 91);
});

test('tracker resets on hidden or discontinuous frames', () => {
  const tracker = createXRFrameTimingTracker({ nominalFrameRate: 90 });

  let time = 1000;
  tracker.recordFrame(time);
  for (let i = 0; i < 10; i++) {
    time += 11.11;
    tracker.recordFrame(time);
  }

  let metrics = tracker.getMetrics();
  assert.equal(metrics.sampleCount, 11);
  assert.equal(tracker.getResetCount(), 0);

  // Mark as hidden
  tracker.recordFrame(time + 11.11, { visible: false });
  metrics = tracker.getMetrics();
  assert.equal(metrics.sampleCount, 0); // Reset
  assert.equal(tracker.getResetCount(), 1);

  // Record a new contiguous sequence
  time = 2000;
  tracker.recordFrame(time);
  for (let i = 0; i < 5; i++) {
    time += 11.11;
    tracker.recordFrame(time);
  }
  metrics = tracker.getMetrics();
  assert.equal(metrics.sampleCount, 6);

  // Discontinuous input: the stream resets, but the frame itself is a valid
  // timestamp and starts the new run (same as the non-monotonic case).
  tracker.recordFrame(time + 11.11, { discontinuous: true });
  metrics = tracker.getMetrics();
  assert.equal(metrics.sampleCount, 1);
  assert.equal(tracker.getResetCount(), 2);
});

test('tracker computes dropRatio for missed frames', () => {
  const tracker = createXRFrameTimingTracker({ nominalFrameRate: 90 }); // Nominal interval = 11.11ms

  let time = 1000;
  tracker.recordFrame(time);

  // 1 frame normal
  time += 11.11;
  tracker.recordFrame(time);

  // Next frame arrives 33.33ms later (missed 2 frames)
  time += 33.33;
  tracker.recordFrame(time);

  const metrics = tracker.getMetrics();
  // Total actual intervals: 2 (11.11ms and 33.33ms) -> duration 44.44ms.
  // Nominal intervals in 44.44ms: 4 intervals (approx 44.44 / 11.11)
  // Dropped frames = 2.
  // total expected frames: 5 (since 4 intervals)
  // dropRatio = 2 / 4 = 0.5
  assert.equal(metrics.dropRatio, 0.5);
});

test('tracker handles default settings, sanitization, and timestamp monotonicity', () => {
  // 1. Defaults nominal to null
  const tracker = createXRFrameTimingTracker({ supportedFrameRates: [60, NaN, 90, -30, 120, 'invalid'] });
  assert.equal(tracker.getNominalFrameRate(), null);

  // 2. Supported rates sanitized and sorted ascending
  assert.deepEqual(tracker.getSupportedFrameRates(), [60, 90, 120]);

  // 3. Reset count increments when recording a non-increasing timestamp
  tracker.recordFrame(100);
  tracker.recordFrame(105);
  assert.equal(tracker.getResetCount(), 0);

  tracker.recordFrame(104); // going backwards
  assert.equal(tracker.getResetCount(), 1);
  assert.equal(tracker.getMetrics().sampleCount, 1); // contains only 104 now

  tracker.recordFrame(104); // duplicate (not strictly increasing)
  assert.equal(tracker.getResetCount(), 2);
  assert.equal(tracker.getMetrics().sampleCount, 1);
});

test('tracker exposes deeply frozen resets array with explicit reset records', () => {
  const tracker = createXRFrameTimingTracker({ nominalFrameRate: 90 });
  tracker.recordFrame(100);
  tracker.recordFrame(110);

  // Non-monotonic reset
  tracker.recordFrame(105);
  // Hidden reset
  tracker.recordFrame(120, { visible: false });
  // Discontinuous reset
  tracker.recordFrame(130, { discontinuous: true });

  const resets = tracker.resets;
  assert.equal(resets.length, 3);
  assert.ok(Object.isFrozen(resets));
  assert.ok(Object.isFrozen(resets[0]));

  assert.deepEqual(resets[0], {
    sequence: 1,
    reason: 'non-monotonic',
    previousTimestamp: 110,
    timestamp: 105
  });

  assert.deepEqual(resets[1], {
    sequence: 2,
    reason: 'hidden',
    previousTimestamp: 105,
    timestamp: 120
  });

  // 'discontinuity' is the published xr-frame-timing-v1 schema enum value.
  assert.deepEqual(resets[2], {
    sequence: 3,
    reason: 'discontinuity',
    previousTimestamp: null,
    timestamp: 130
  });
});
