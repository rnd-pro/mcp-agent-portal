import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createStageProgressTracker } from '../render-progress.js';

function update(tracker, job, stage, progress, patch = {}, at = 0) {
  job.stage = stage;
  job.progress = progress;
  job.updatedAt = at;
  tracker.recordStageEvidence(job, patch);
}

test('stage progress tracker records stage order, durations, coalesced timeline, and cache counters', () => {
  let tracker = createStageProgressTracker({
    metadataKeys: ['item', 'cacheHit', 'renderJobId', 'ignored'],
  });
  let job = { stage: 'queued', progress: 0, updatedAt: 10 };

  update(tracker, job, 'queued', 0, { cacheHit: false, ignored: '', hidden: 'x' }, 10);
  update(tracker, job, 'queued', 0.1, { item: 1, cacheHit: true, ignored: null }, 20);
  update(tracker, job, 'capture:frame', 0.5, { renderJobId: 'render-1', cacheHit: false }, 40);
  update(tracker, job, 'done', 1, {}, 70);
  job.finishedAt = 90;

  assert.deepEqual(job.stageOrder, ['queued', 'capture:frame', 'done']);
  assert.equal(job.progressTimeline.length, 3);
  assert.equal(job.progressTimeline[0].eventCount, 2);
  assert.equal(job.progressTimeline[0].progress, 0.1);
  assert.equal(job.progressTimeline[0].item, 1);
  assert.equal(job.progressTimeline[0].hidden, undefined);

  let durations = tracker.buildStageDurations(job);
  assert.deepEqual(durations.map((entry) => entry.stage), ['queued', 'capture:frame', 'done']);
  assert.deepEqual(durations.map((entry) => entry.durationMs), [30, 30, 20]);
  assert.equal(durations[0].cacheHits, 1);
  assert.equal(durations[0].cacheMisses, 1);
  assert.equal(durations[0].item, 1);
  assert.equal(durations[1].renderJobId, 'render-1');
  assert.equal(durations[1].cacheMisses, 1);
  assert.equal(durations[1].hidden, undefined);
});

test('stage progress tracker normalizes timeline output and filters invalid entries', () => {
  let tracker = createStageProgressTracker({ metadataKeys: ['frame', 'previewUpdated'] });
  let result = tracker.buildProgressTimeline({
    progressTimeline: [
      { stage: '', at: 100, progress: 0.1 },
      { stage: 'zero', at: 0, progress: 0.1 },
      { stage: 'capture:frame', at: 10, lastAt: 12, progress: 2, eventCount: '3', frame: 4, extra: true },
      { stage: 'preview', at: 20, progress: -1, previewUpdated: false },
    ],
  });

  assert.deepEqual(result, [
    {
      stage: 'running',
      at: 100,
      lastAt: 100,
      progress: 0.1,
      eventCount: 0,
    },
    {
      stage: 'capture:frame',
      at: 10,
      lastAt: 12,
      progress: 2,
      eventCount: 3,
      frame: 4,
    },
    {
      stage: 'preview',
      at: 20,
      lastAt: 20,
      progress: 0,
      eventCount: 0,
      previewUpdated: false,
    },
  ]);
});

test('stage progress tracker keeps metadata whitelist injected by the consumer', () => {
  let jobA = { stage: 'audio:synthesize', progress: 0.2, updatedAt: 10 };
  let jobB = { stage: 'audio:synthesize', progress: 0.2, updatedAt: 10 };
  let patch = { audioJobId: 'audio-1', renderJobId: 'render-1' };

  let audioTracker = createStageProgressTracker({ metadataKeys: ['audioJobId'] });
  let renderTracker = createStageProgressTracker({ metadataKeys: ['renderJobId'] });
  audioTracker.recordStageEvidence(jobA, patch);
  renderTracker.recordStageEvidence(jobB, patch);

  assert.equal(audioTracker.buildProgressTimeline(jobA)[0].audioJobId, 'audio-1');
  assert.equal(audioTracker.buildProgressTimeline(jobA)[0].renderJobId, undefined);
  assert.equal(renderTracker.buildProgressTimeline(jobB)[0].audioJobId, undefined);
  assert.equal(renderTracker.buildProgressTimeline(jobB)[0].renderJobId, 'render-1');
});

test('stage progress tracker caps raw transition history by timelineLimit', () => {
  let tracker = createStageProgressTracker({ metadataKeys: ['frame'], timelineLimit: 3 });
  let job = {};

  for (let index = 0; index < 5; index += 1) {
    update(tracker, job, `stage-${index}`, index / 10, { frame: index }, index + 1);
  }

  assert.deepEqual(job.progressTimeline.map((entry) => entry.stage), ['stage-2', 'stage-3', 'stage-4']);
  assert.deepEqual(tracker.buildProgressTimeline(job).map((entry) => entry.frame), [2, 3, 4]);
});

test('stage progress tracker tolerates invalid options', () => {
  let tracker = createStageProgressTracker(null);
  let job = {};

  update(tracker, job, 'queued', 0.1, { frame: 1 }, 10);

  assert.equal(job.progressTimeline.length, 1);
  assert.equal(tracker.buildProgressTimeline(job)[0].frame, undefined);
});
