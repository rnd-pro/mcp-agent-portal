import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  RENDER_FRAME_COMPLETENESS_PROOF_VERSION,
  RENDER_PERFORMANCE_PROOF_VERSION,
  RENDER_SEGMENT_SEAM_PROOF_VERSION,
  RENDER_STREAM_PTS_PROOF_VERSION,
  RENDER_WORKER_CAPACITY_PROOF_VERSION,
  buildRenderAudioLayerProof,
  buildRenderAvSyncProof,
  buildRenderFrameCompletenessProof,
  buildRenderPerformanceProof,
  buildRenderSegmentSeamProof,
  buildRenderStreamPtsProof,
  buildRenderWorkerCapacityProof,
  countClipOverlaps,
  durationDriftMs,
  findProbeStream,
  normalizeProbeStreams,
  renderAuthorityDurationSec,
  streamDurationSec,
} from '../render-proof.js';

function seamSegment(id, start, end, boundary, overrides = {}) {
  let segment = {
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
  if (boundary) {
    segment.boundary = { version: 'render-seam-input/1', overlapOwner: 'trailing', ...boundary };
  }
  return segment;
}

test('frame completeness proof reuses strict completion semantics and reports every defect class', () => {
  let pass = buildRenderFrameCompletenessProof({
    expectedFrameCount: 4,
    frames: [{ index: 0 }, { index: 1 }, { index: 2 }, { index: 3 }],
  });
  let fail = buildRenderFrameCompletenessProof({
    expectedFrameCount: 4,
    frames: [{ index: 0 }, { index: 2 }, { index: 2 }, { index: 1 }, { index: 9 }],
  });

  assert.equal(pass.version, RENDER_FRAME_COMPLETENESS_PROOF_VERSION);
  assert.equal(pass.ok, true);
  assert.equal(pass.contiguousFrameCount, 4);
  assert.equal(fail.ok, false);
  assert.deepEqual(fail.missingFrames, [3]);
  assert.deepEqual(fail.duplicateFrames, [2]);
  assert.deepEqual(fail.outOfRangeFrames, [{ position: 4, index: 9 }]);
  assert.deepEqual(fail.reorderedTransitions, [{ position: 3, previous: 2, index: 1 }]);
});

test('performance proof derives deterministic throughput and resource verdicts from samples', () => {
  let pass = buildRenderPerformanceProof({
    frameCount: 300,
    fps: 30,
    captureDurationMs: 9000,
    encodeDurationMs: 8000,
    resourceSamples: [{ atMs: 0, rssBytes: 1000 }, { atMs: 5000, rssBytes: 1500 }],
    previewSamples: [{ atMs: 0, decodedBytes: 400 }, { atMs: 5000, decodedBytes: 800 }],
    thresholds: {
      minCaptureFps: 30,
      minEncodeFps: 30,
      maxCaptureRealtimeRatio: 1,
      maxPeakRssBytes: 2000,
      maxPreviewWorkingSetBytes: 1000,
    },
  });
  let fail = buildRenderPerformanceProof({
    frameCount: 300,
    fps: 30,
    captureDurationMs: 12000,
    encodeDurationMs: 15000,
    peakRssBytes: 3000,
    peakPreviewWorkingSetBytes: 1200,
    thresholds: {
      minCaptureFps: 30,
      minEncodeFps: 30,
      maxCaptureRealtimeRatio: 1,
      maxPeakRssBytes: 2000,
      maxPreviewWorkingSetBytes: 1000,
    },
  });

  assert.equal(pass.version, RENDER_PERFORMANCE_PROOF_VERSION);
  assert.equal(pass.ok, true);
  assert.equal(pass.captureFps, 33.333);
  assert.equal(pass.encodeFps, 37.5);
  assert.equal(pass.peakRssBytes, 1500);
  assert.equal(pass.peakPreviewWorkingSetBytes, 800);
  assert.equal(fail.ok, false);
  assert.deepEqual(Object.values(fail.checks), [false, false, false, false, false]);
});

test('performance proof fails closed when locked resource samples are absent', () => {
  let proof = buildRenderPerformanceProof({
    frameCount: 300,
    fps: 30,
    captureDurationMs: 9000,
    encodeDurationMs: 8000,
    requireResourceSamples: true,
  });

  assert.equal(proof.ok, false);
  assert.equal(proof.checks.resourceSamplesRecorded, false);
  assert.equal(proof.checks.previewSamplesRecorded, false);
});

test('worker capacity proof admits or rejects measured pools without silent downgrade', () => {
  let base = {
    requestedWorkers: 4,
    totalMemoryBytes: 8_000,
    systemReserveBytes: 2_000,
    fixedOverheadBytes: 500,
    perWorkerPeakRssBytes: 1_000,
    safetyFactor: 1.25,
    maxPerWorkerRssBytes: 3_000,
  };
  let pass = buildRenderWorkerCapacityProof({ ...base, availableMemoryBytes: 6_000 });
  let fail = buildRenderWorkerCapacityProof({ ...base, availableMemoryBytes: 4_000 });

  assert.equal(pass.version, RENDER_WORKER_CAPACITY_PROOF_VERSION);
  assert.equal(pass.ok, true);
  assert.equal(pass.admittedWorkers, 4);
  assert.equal(pass.requiredMemoryBytes, 5_500);
  assert.equal(fail.ok, false);
  assert.equal(fail.admittedWorkers, 2);
  assert.equal(fail.requestedWorkers, 4);
  assert.match(fail.errors.join('\n'), /availableMemoryBytes/);
});

function ffprobe({ videoDuration = '1.000000', audioDuration = '1.000000', videoCodec = 'h264', audioCodec = 'aac' } = {}) {
  let streams = [
    {
      codec_type: 'video',
      codec_name: videoCodec,
      duration: videoDuration,
      width: 1280,
      height: 720,
      nb_frames: '12',
    },
  ];
  if (audioDuration !== null) {
    streams.push({
      codec_type: 'audio',
      codec_name: audioCodec,
      duration: audioDuration,
      sample_rate: '24000',
      channels: 1,
    });
  }
  return {
    streams,
    format: { duration: videoDuration },
  };
}

test('audio layer proof returns null for empty input and uses neutral default speakers', () => {
  assert.equal(buildRenderAudioLayerProof(), null);

  let proof = buildRenderAudioLayerProof({
    items: [{ durationMs: 500, voiceRef: 'voice-a' }],
    cueTimings: [{ startMs: 0, durationMs: 500, requestedStartMs: 0 }],
    thresholdMs: 40,
  });

  assert.equal(proof.ok, true);
  assert.equal(proof.sequenceMode, 'sequential');
  assert.equal(proof.speakerLayers.length, 1);
  assert.equal(proof.speakerLayers[0].persona, 'speaker-0');
  assert.equal(proof.speakerLayers[0].id, 'voice:speaker-0');
  assert.equal(proof.mixDurationMs, 500);
});

test('audio layer proof builds two speaker sequential layers with injected labels', () => {
  let proof = buildRenderAudioLayerProof({
    items: [
      { durationMs: 1000, persona: 'guide', voiceRef: 'voice-guide', artifactId: 'a1', sha256: 's1' },
      { durationMs: 900, persona: 'ops', voiceRef: 'voice-ops', artifactId: 'a2', sha256: 's2' },
    ],
    cueTimings: [
      { startMs: 0, endMs: 1000, durationMs: 1000, requestedStartMs: 0 },
      { startMs: 1000, endMs: 1900, durationMs: 900, requestedStartMs: 1000 },
    ],
    mixDurationMs: 1900,
    thresholdMs: 40,
    fallbackSpeakerForIndex: (index) => index % 2 ? 'ops' : 'guide',
    layerIdForClip: (clip) => `speaker:${clip.persona}`,
    layerLabelForClip: (clip) => `${clip.persona.toUpperCase()} narration`,
  });

  assert.equal(proof.ok, true);
  assert.equal(proof.overlapCount, 0);
  assert.deepEqual(proof.distinctVoiceRefs, ['voice-guide', 'voice-ops']);
  assert.equal(proof.totalClipDurationMs, 1900);
  assert.equal(proof.durationDriftMs, 0);
  assert.deepEqual(proof.speakerLayers.map((layer) => layer.id), ['speaker:guide', 'speaker:ops']);
  assert.deepEqual(proof.speakerLayers.map((layer) => layer.label), ['GUIDE narration', 'OPS narration']);
});

test('audio layer proof validates cue counts, overlap mode, and exact drift threshold', () => {
  let mismatch = buildRenderAudioLayerProof({
    items: [{ durationMs: 500, persona: 'guide', voiceRef: 'voice-guide' }],
    cueTimings: [],
    thresholdMs: 40,
  });
  let noOverlap = buildRenderAudioLayerProof({
    sequenceMode: 'overlap',
    items: [
      { durationMs: 500, persona: 'guide', voiceRef: 'voice-guide' },
      { durationMs: 500, persona: 'ops', voiceRef: 'voice-ops' },
    ],
    cueTimings: [
      { startMs: 0, durationMs: 500 },
      { startMs: 500, durationMs: 500 },
    ],
    mixDurationMs: 1000,
    thresholdMs: 40,
  });
  let exactThreshold = buildRenderAudioLayerProof({
    items: [
      { durationMs: 500, persona: 'guide', voiceRef: 'voice-guide' },
      { durationMs: 500, persona: 'ops', voiceRef: 'voice-ops' },
    ],
    cueTimings: [
      { startMs: 0, durationMs: 500, requestedStartMs: 0 },
      { startMs: 500, durationMs: 500, requestedStartMs: 500 },
    ],
    mixDurationMs: 1040,
    thresholdMs: 40,
  });
  let noRequestedStarts = buildRenderAudioLayerProof({
    items: [
      { durationMs: 500, persona: 'guide', voiceRef: 'voice-guide' },
      { durationMs: 500, persona: 'ops', voiceRef: 'voice-ops' },
    ],
    cueTimings: [
      { startMs: 0, durationMs: 500 },
      { startMs: 500, durationMs: 500 },
    ],
    mixDurationMs: 1000,
    thresholdMs: 40,
  });

  assert.equal(mismatch.ok, false);
  assert.match(mismatch.errors.join('\n'), /matching item and cue timing counts/);
  assert.equal(noOverlap.ok, false);
  assert.match(noOverlap.errors.join('\n'), /overlap audio sequence requires/);
  assert.equal(exactThreshold.ok, true);
  assert.equal(exactThreshold.durationDriftMs, 40);
  assert.equal(noRequestedStarts.ok, true);
});

test('audio layer proof detects overlapping clips and missing distinct voice refs', () => {
  assert.equal(countClipOverlaps([
    { startMs: 0, endMs: 500 },
    { startMs: 470, endMs: 900 },
    { startMs: 900, endMs: 1200 },
  ], 20), 1);

  let proof = buildRenderAudioLayerProof({
    sequenceMode: 'sequential',
    items: [
      { durationMs: 600, persona: 'guide', voiceRef: 'same-voice' },
      { durationMs: 600, persona: 'ops', voiceRef: 'same-voice' },
    ],
    cueTimings: [
      { startMs: 0, durationMs: 600, requestedStartMs: 0 },
      { startMs: 500, durationMs: 600, requestedStartMs: 500 },
    ],
    mixDurationMs: 1200,
    thresholdMs: 40,
  });

  assert.equal(proof.ok, false);
  assert.match(proof.errors.join('\n'), /starts 100ms before the sequential cursor/);
  assert.match(proof.errors.join('\n'), /1 overlapping voice clips/);
  assert.match(proof.errors.join('\n'), /two-speaker render requires/);
});

test('render proof normalizes probe streams and stream durations', () => {
  let probe = ffprobe({ videoDuration: '1.250000' });

  assert.equal(normalizeProbeStreams({}).length, 0);
  assert.equal(findProbeStream(probe, 'video').codec_name, 'h264');
  assert.equal(streamDurationSec({ tags: { DURATION: '2.5' } }, probe), 2.5);
  assert.equal(streamDurationSec({}, { format: { duration: '3.5' } }), 3.5);
  assert.equal(Math.round(durationDriftMs(1.1, 1)), 100);
  assert.equal(durationDriftMs(0, 1), null);
});

test('render proof validates h264/aac streams against audio-authority timing', () => {
  let proof = buildRenderAvSyncProof({
    ffprobe: ffprobe(),
    audio: { mix: { durationMs: 1000 } },
    transcript: { durationSec: 1 },
    fps: 12,
    includeAudio: true,
    thresholdMs: 40,
    frames: [{}, {}],
  });

  assert.equal(proof.ok, true);
  assert.equal(proof.expectedDurationMs, 1000);
  assert.equal(proof.streams.video.codecName, 'h264');
  assert.equal(proof.streams.video.frames, 12);
  assert.equal(proof.streams.audio.codecName, 'aac');
  assert.equal(proof.driftsMs.videoVsAudioMs, 0);
  assert.equal(proof.driftsMs.captionsVsAuthorityMs, 0);
});

test('render proof reports codec, missing stream, and duration drift failures', () => {
  let proof = buildRenderAvSyncProof({
    ffprobe: ffprobe({ videoDuration: '1.100000', audioDuration: null, videoCodec: 'vp9' }),
    frameArtifact: { durationSec: 1 },
    fps: 1,
    includeAudio: true,
    thresholdMs: 40,
  });

  assert.equal(proof.ok, false);
  assert.match(proof.errors.join('\n'), /video stream must be h264, got vp9/);
  assert.match(proof.errors.join('\n'), /missing audio stream/);
  assert.match(proof.errors.join('\n'), /videoVsAuthorityMs 100ms exceeds 40ms/);
});

test('render proof supports no-audio mode without requiring an audio stream', () => {
  let proof = buildRenderAvSyncProof({
    ffprobe: ffprobe({ audioDuration: null }),
    frameArtifact: { durationSec: 1 },
    fps: 24,
    includeAudio: false,
    thresholdMs: 40,
  });

  assert.equal(proof.ok, true);
  assert.equal(proof.streams.audio, null);
  assert.equal(proof.driftsMs.audioVsAuthorityMs, null);
  assert.equal(proof.driftsMs.videoVsAudioMs, null);
});

test('render proof reports caption drift and missing positive authority duration', () => {
  let captionDrift = buildRenderAvSyncProof({
    ffprobe: ffprobe(),
    audio: { mix: { durationMs: 1000 } },
    transcript: { durationSec: 1.1 },
    fps: 12,
    includeAudio: true,
    thresholdMs: 40,
  });
  let missingAuthority = buildRenderAvSyncProof({
    ffprobe: ffprobe({ videoDuration: '1.000000', audioDuration: null }),
    includeAudio: false,
    thresholdMs: 40,
    defaultDurationMs: 0,
  });

  assert.equal(captionDrift.ok, false);
  assert.match(captionDrift.errors.join('\n'), /captionsVsAuthorityMs 100ms exceeds 40ms/);
  assert.equal(missingAuthority.ok, false);
  assert.match(missingAuthority.errors.join('\n'), /missing positive audio-authority duration/);
});

test('render proof falls through authority sources when includeAudio has no audio object', () => {
  assert.equal(renderAuthorityDurationSec({ audio: { mix: { durationMs: 1200 } } }), 1.2);
  assert.equal(renderAuthorityDurationSec({ frameArtifact: { durationSec: 1.5 } }), 1.5);
  assert.equal(renderAuthorityDurationSec({ durationMs: 2000 }), 2);

  let proof = buildRenderAvSyncProof({
    ffprobe: ffprobe({ videoDuration: '1.500000', audioDuration: '1.500000' }),
    frameArtifact: { durationSec: 1.5 },
    fps: 12,
    includeAudio: true,
    thresholdMs: 40,
  });

  assert.equal(proof.ok, true);
  assert.equal(proof.expectedDurationMs, 1500);
});

test('segment seam proof accepts an exact seam with proven boundary pixels and correct ownership', () => {
  let proof = buildRenderSegmentSeamProof({
    segments: [
      seamSegment('a', 0, 2),
      seamSegment('b', 3, 5, { exactPixelsMatch: true, overlapOwner: 'trailing' }),
    ],
    policy: { type: 'exact', owner: 'trailing' },
  });
  assert.equal(proof.version, RENDER_SEGMENT_SEAM_PROOF_VERSION);
  assert.equal(proof.ok, true);
  assert.equal(proof.seams.length, 1);
  assert.equal(proof.seams[0].ok, true);
});

test('segment seam proof rejects overlap, ownership mismatch and unproven exact seams', () => {
  let proof = buildRenderSegmentSeamProof({
    segments: [
      seamSegment('a', 0, 5),
      seamSegment('b', 3, 8, { overlapOwner: 'leading' }),
    ],
    policy: { type: 'exact', owner: 'trailing' },
  });
  assert.equal(proof.ok, false);
  let reasons = proof.seams[0].errors;
  assert.ok(reasons.includes('pts-overlap'));
  assert.ok(reasons.includes('overlap-ownership-mismatch'));
  assert.ok(reasons.includes('exact-seam-unproven'));
});

test('segment seam proof enforces the perceptual ssim threshold', () => {
  let pass = buildRenderSegmentSeamProof({
    segments: [seamSegment('a', 0, 2), seamSegment('b', 3, 5, { ssim: 0.99 })],
    policy: { type: 'perceptual', owner: 'trailing', requiredSsim: 0.98 },
  });
  assert.equal(pass.ok, true);
  let fail = buildRenderSegmentSeamProof({
    segments: [seamSegment('a', 0, 2), seamSegment('b', 3, 5, { ssim: 0.5 })],
    policy: { type: 'perceptual', owner: 'trailing', requiredSsim: 0.98 },
  });
  assert.equal(fail.ok, false);
  assert.ok(fail.seams[0].errors.includes('perceptual-ssim-below-threshold'));
});

test('segment seam proof rejects a duplicate boundary PTS', () => {
  let proof = buildRenderSegmentSeamProof({
    segments: [
      seamSegment('a', 0, 3, { exactPixelsMatch: true, overlapOwner: 'trailing' }),
      seamSegment('b', 4, 7, { exactPixelsMatch: true, overlapOwner: 'trailing' }, {
        firstPts: 3,
        lastPts: 6,
        timeRange: { startTicks: 3, endTicks: 6 },
        keyframePts: [3],
      }),
    ],
    policy: { type: 'exact', owner: 'trailing' },
  });
  assert.equal(proof.ok, false);
  assert.ok(proof.seams[0].errors.includes('duplicate-boundary-pts'));
});

test('segment seam proof rejects a boundary missing its version or owner', () => {
  let next = seamSegment('b', 3, 5, { exactPixelsMatch: true });
  assert.throws(() => buildRenderSegmentSeamProof({
    segments: [seamSegment('a', 0, 2), { ...next, boundary: { overlapOwner: 'trailing', exactPixelsMatch: true } }],
    policy: { type: 'exact', owner: 'trailing' },
  }), /version/);
  assert.throws(() => buildRenderSegmentSeamProof({
    segments: [seamSegment('a', 0, 2), { ...next, boundary: { version: 'render-seam-input/1', exactPixelsMatch: true } }],
    policy: { type: 'exact', owner: 'trailing' },
  }), /overlapOwner/);
});

test('segment seam proof keeps canonical ownership singular across three overlapping capture windows', () => {
  let proof = buildRenderSegmentSeamProof({
    segments: [
      seamSegment('a', 0, 2, null, { captureRange: { start: 0, end: 4 }, prerollFrames: 0, postrollFrames: 2 }),
      seamSegment('b', 3, 5, { exactPixelsMatch: true }, {
        captureRange: { start: 1, end: 7 }, prerollFrames: 2, postrollFrames: 2,
      }),
      seamSegment('c', 6, 8, { exactPixelsMatch: true }, {
        captureRange: { start: 4, end: 10 }, prerollFrames: 2, postrollFrames: 2,
      }),
    ],
    policy: { type: 'exact', owner: 'trailing' },
  });
  assert.equal(proof.ok, true);
  assert.deepEqual(proof.unownedFrames, []);
  assert.deepEqual(proof.doubleOwnedFrames, []);
});

test('segment seam proof rejects a canonical logical frame owned by no segment', () => {
  let proof = buildRenderSegmentSeamProof({
    segments: [
      seamSegment('a', 0, 2),
      seamSegment('b', 5, 7, { exactPixelsMatch: true }, {
        firstPts: 5, lastPts: 7, timeRange: { startTicks: 5, endTicks: 7 }, keyframePts: [5],
      }),
    ],
    policy: { type: 'exact', owner: 'trailing' },
  });
  assert.equal(proof.ok, false);
  assert.ok(proof.errors.includes('logical-frame-unowned'));
  assert.deepEqual(proof.unownedFrames, [3, 4]);
});

test('stream PTS proof fails closed on an empty frame stream', () => {
  let proof = buildRenderStreamPtsProof({ ptsStep: 100, frames: [] });
  assert.equal(proof.ok, false);
  assert.ok(proof.errors.includes('empty-frame-stream'));
});

test('stream PTS proof passes a static scene with unique identity, index and PTS', () => {
  let proof = buildRenderStreamPtsProof({
    ptsStep: 100,
    frames: [
      { index: 0, pts: 0, identity: 'f0', pixelHash: 'static' },
      { index: 1, pts: 100, identity: 'f1', pixelHash: 'static' },
      { index: 2, pts: 200, identity: 'f2', pixelHash: 'static' },
      { index: 3, pts: 300, identity: 'f3', pixelHash: 'moved' },
    ],
  });
  assert.equal(proof.version, RENDER_STREAM_PTS_PROOF_VERSION);
  assert.equal(proof.ok, true);
  assert.deepEqual(proof.errors, []);
  assert.equal(proof.staticRuns.length, 1);
  assert.deepEqual(proof.staticRuns[0].positions, [0, 1, 2]);
});

test('stream PTS proof fails closed when the cadence step is missing', () => {
  let proof = buildRenderStreamPtsProof({
    frames: [{ index: 0, pts: 0, identity: 'f0' }, { index: 1, pts: 100, identity: 'f1' }],
  });
  assert.equal(proof.ok, false);
  assert.ok(proof.errors.includes('missing-cadence-evidence'));
});

test('stream PTS proof rejects a frame that is missing an identity', () => {
  let proof = buildRenderStreamPtsProof({
    ptsStep: 100,
    frames: [
      { index: 0, pts: 0, identity: 'f0' },
      { index: 1, pts: 100, identity: '' },
    ],
  });
  assert.equal(proof.ok, false);
  assert.equal(proof.missingIdentities.length, 1);
});

test('stream PTS proof rejects an index gap in the contiguous cadence', () => {
  let proof = buildRenderStreamPtsProof({
    ptsStep: 100,
    frames: [
      { index: 0, pts: 0, identity: 'f0' },
      { index: 2, pts: 100, identity: 'f1' },
    ],
  });
  assert.equal(proof.ok, false);
  assert.equal(proof.indexGaps.length, 1);
});

test('stream PTS proof rejects a PTS gap against the exact cadence', () => {
  let proof = buildRenderStreamPtsProof({
    ptsStep: 100,
    frames: [
      { index: 0, pts: 0, identity: 'f0' },
      { index: 1, pts: 250, identity: 'f1' },
    ],
  });
  assert.equal(proof.ok, false);
  assert.equal(proof.ptsGaps.length, 1);
});

test('stream PTS proof rejects duplicate PTS, duplicate identity and reordering', () => {
  let proof = buildRenderStreamPtsProof({
    ptsStep: 50,
    frames: [
      { index: 0, pts: 0, identity: 'f0', pixelHash: 'a' },
      { index: 1, pts: 0, identity: 'f0', pixelHash: 'b' },
      { index: 2, pts: 50, identity: 'f2', pixelHash: 'c' },
      { index: 3, pts: 40, identity: 'f3', pixelHash: 'd' },
    ],
  });
  assert.equal(proof.ok, false);
  assert.equal(proof.duplicatePts.length, 1);
  assert.equal(proof.duplicateIdentities.length, 1);
  assert.ok(proof.ptsOverlaps.length >= 1);
});
