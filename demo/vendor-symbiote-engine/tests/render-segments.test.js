import assert from 'node:assert/strict';
import { test } from 'node:test';

import { planSegmentConcat } from '../render-segments.js';

function segment(id, start, end, overrides = {}) {
  return {
    id,
    tier: 'replayable-segment',
    container: 'mp4',
    videoCodec: 'h264',
    audioCodec: null,
    width: 1920,
    height: 1080,
    dpr: 1,
    pixelFormat: 'yuv420p',
    colorSpace: 'bt709',
    colorPrimaries: 'bt709',
    colorTransfer: 'bt709',
    colorRange: 'tv',
    chromaLocation: 'left',
    frameRate: '30/1',
    timeBase: '1/30',
    frameDurationTicks: 1,
    frameRange: { start, end },
    captureRange: { start, end },
    prerollFrames: 0,
    postrollFrames: 0,
    frameCount: end - start + 1,
    timeRange: { startTicks: start, endTicks: end },
    firstPts: start,
    lastPts: end,
    keyframePts: [start],
    settingsHash: `sha256:${'a'.repeat(16)}`,
    sourceHash: 'b'.repeat(16),
    videoExtradataHash: 'c'.repeat(16),
    streamLayoutHash: 'd'.repeat(16),
    ...overrides,
  };
}

function audioSegment(id, start, end, overrides = {}) {
  return segment(id, start, end, {
    audioCodec: 'aac',
    audioSampleRate: 48000,
    audioChannels: 2,
    audioChannelLayout: 'stereo',
    audioTimeBase: '1/48000',
    audioExtradataHash: 'e'.repeat(16),
    ...overrides,
  });
}

function reasonsAt(plan, index) {
  return plan.incompatibilities.filter((entry) => entry.index === index).map((entry) => entry.reason);
}

test('segment plan stream-copies contiguous compatible segments as one group', () => {
  let plan = planSegmentConcat({ segments: [segment('a', 0, 2), segment('b', 3, 5), segment('c', 6, 8)] });
  assert.equal(plan.ok, true);
  assert.equal(plan.mode, 'stream-copy');
  assert.deepEqual(plan.groups, [['a', 'b', 'c']]);
  assert.deepEqual(plan.incompatibilities, []);
});

test('segment plan refuses to hide a re-encode when the video codec differs', () => {
  let segments = [segment('a', 0, 2), segment('b', 3, 5, { videoCodec: 'vp9' })];
  let strict = planSegmentConcat({ segments });
  assert.equal(strict.ok, false);
  assert.equal(strict.mode, 'stream-copy');
  assert.deepEqual(strict.groups, [['a'], ['b']]);
  assert.ok(reasonsAt(strict, 1).includes('codec-mismatch'));

  let allowed = planSegmentConcat({ segments, allowReencode: true });
  assert.equal(allowed.ok, true);
  assert.equal(allowed.mode, 're-encode');
});

test('segment plan reports a color mismatch separately from other groups', () => {
  let plan = planSegmentConcat({ segments: [segment('a', 0, 2), segment('b', 3, 5, { colorSpace: 'bt2020' })] });
  assert.equal(plan.ok, false);
  assert.deepEqual(reasonsAt(plan, 1), ['color-mismatch']);
});

test('segment plan reports an audio layout mismatch separately', () => {
  let plan = planSegmentConcat({
    segments: [audioSegment('a', 0, 2), audioSegment('b', 3, 5, { audioSampleRate: 44100 })],
  });
  assert.equal(plan.ok, false);
  assert.deepEqual(reasonsAt(plan, 1), ['audio-layout-mismatch']);
});

test('segment plan reports a stream layout mismatch separately', () => {
  let plan = planSegmentConcat({ segments: [segment('a', 0, 2), segment('b', 3, 5, { streamLayoutHash: 'f'.repeat(16) })] });
  assert.equal(plan.ok, false);
  assert.deepEqual(reasonsAt(plan, 1), ['stream-layout-mismatch']);
});

test('segment plan reports geometry, extradata and timebase mismatches separately', () => {
  let geometry = planSegmentConcat({ segments: [segment('a', 0, 2), segment('b', 3, 5, { width: 1280, height: 720 })] });
  assert.deepEqual(reasonsAt(geometry, 1), ['geometry-mismatch']);

  let extradata = planSegmentConcat({ segments: [segment('a', 0, 2), segment('b', 3, 5, { videoExtradataHash: '9'.repeat(16) })] });
  assert.deepEqual(reasonsAt(extradata, 1), ['extradata-mismatch']);

  let timebase = planSegmentConcat({
    segments: [
      segment('a', 0, 2),
      segment('b', 3, 5, {
        timeBase: '1/60',
        frameDurationTicks: 2,
        firstPts: 3,
        lastPts: 7,
        timeRange: { startTicks: 3, endTicks: 7 },
        keyframePts: [3],
      }),
    ],
  });
  assert.deepEqual(reasonsAt(timebase, 1), ['timebase-mismatch']);
});

test('segment plan flags an exact PTS overlap without float tolerance', () => {
  let plan = planSegmentConcat({
    segments: [
      segment('a', 0, 2),
      segment('b', 3, 5, { firstPts: 2, lastPts: 4, timeRange: { startTicks: 2, endTicks: 4 }, keyframePts: [2] }),
    ],
  });
  assert.equal(plan.ok, false);
  assert.deepEqual(reasonsAt(plan, 1), ['pts-overlap']);
});

test('segment plan flags an exact PTS gap without float tolerance', () => {
  let plan = planSegmentConcat({
    segments: [
      segment('a', 0, 2),
      segment('b', 3, 5, { firstPts: 5, lastPts: 7, timeRange: { startTicks: 5, endTicks: 7 }, keyframePts: [5] }),
    ],
  });
  assert.equal(plan.ok, false);
  assert.deepEqual(reasonsAt(plan, 1), ['pts-gap']);
});

test('segment plan flags frame-range gaps and overlaps', () => {
  let gap = planSegmentConcat({
    segments: [
      segment('a', 0, 2),
      segment('b', 5, 7, { firstPts: 3, lastPts: 5, timeRange: { startTicks: 3, endTicks: 5 }, keyframePts: [3] }),
    ],
  });
  assert.deepEqual(reasonsAt(gap, 1), ['frame-range-gap']);

  let overlap = planSegmentConcat({
    segments: [
      segment('a', 0, 4),
      segment('b', 3, 5, { firstPts: 5, lastPts: 7, timeRange: { startTicks: 5, endTicks: 7 }, keyframePts: [5] }),
    ],
  });
  assert.deepEqual(reasonsAt(overlap, 1), ['frame-range-overlap']);
});

test('segment plan keeps a logical frame gap fatal even when re-encode is allowed', () => {
  let segments = [
    segment('a', 0, 2),
    segment('b', 5, 7, { firstPts: 3, lastPts: 5, timeRange: { startTicks: 3, endTicks: 5 }, keyframePts: [3] }),
  ];
  let plan = planSegmentConcat({ segments, allowReencode: true });
  assert.equal(plan.ok, false);
  assert.equal(plan.mode, 'stream-copy');
  assert.deepEqual(reasonsAt(plan, 1), ['frame-range-gap']);
  assert.ok(plan.incompatibilities.every((entry) => entry.reason !== 'frame-range-gap' || entry.fatal));
});

test('segment plan keeps a PTS gap fatal even when re-encode is allowed', () => {
  let segments = [
    segment('a', 0, 2),
    segment('b', 3, 5, { firstPts: 5, lastPts: 7, timeRange: { startTicks: 5, endTicks: 7 }, keyframePts: [5] }),
  ];
  let plan = planSegmentConcat({ segments, allowReencode: true });
  assert.equal(plan.ok, false);
  assert.deepEqual(reasonsAt(plan, 1), ['pts-gap']);
});

test('segment plan re-encodes a pure format-only mismatch and splits its groups', () => {
  let segments = [
    segment('a', 0, 2),
    segment('b', 3, 5, { colorSpace: 'bt2020' }),
    segment('c', 6, 8, { colorSpace: 'bt2020' }),
  ];
  let strict = planSegmentConcat({ segments });
  assert.equal(strict.ok, false);
  assert.deepEqual(strict.groups, [['a'], ['b', 'c']]);

  let allowed = planSegmentConcat({ segments, allowReencode: true });
  assert.equal(allowed.ok, true);
  assert.equal(allowed.mode, 're-encode');
  assert.deepEqual(allowed.groups, [['a'], ['b', 'c']]);
});

test('segment plan splits concat groups at every incompatible boundary', () => {
  let plan = planSegmentConcat({
    segments: [
      segment('a', 0, 2),
      segment('b', 3, 5, { videoCodec: 'vp9' }),
      segment('c', 6, 8, { videoCodec: 'vp9' }),
    ],
  });
  assert.deepEqual(plan.groups, [['a'], ['b', 'c']]);
});

test('segment plan rejects duplicate segment ids', () => {
  assert.throws(
    () => planSegmentConcat({ segments: [segment('a', 0, 2), segment('a', 3, 5)] }),
    /duplicate segment id "a"/,
  );
});

test('segment plan rejects a stream copy when compat evidence is incomplete', () => {
  assert.throws(() => planSegmentConcat({
    segments: [segment('a', 0, 2), segment('b', 3, 5, { streamLayoutHash: undefined })],
  }), /streamLayoutHash/);
});

test('segment plan throws on an empty list and a non-boolean allowReencode', () => {
  assert.throws(() => planSegmentConcat({ segments: [] }), /non-empty array/);
  assert.throws(() => planSegmentConcat({ segments: [segment('a', 0, 2)], allowReencode: 'yes' }), /must be a boolean/);
});

test('segment plan stream-copies a single valid segment', () => {
  let plan = planSegmentConcat({ segments: [segment('solo', 0, 4)] });
  assert.equal(plan.ok, true);
  assert.equal(plan.mode, 'stream-copy');
  assert.deepEqual(plan.groups, [['solo']]);
  assert.deepEqual(plan.incompatibilities, []);
});
