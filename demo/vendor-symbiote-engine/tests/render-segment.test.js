import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  NATIVE_SEGMENT_ARTIFACT_VERSION,
  NATIVE_SEGMENT_JOB_VERSION,
  RENDER_SEAM_INPUT_VERSION,
  RENDER_SEAM_OWNERSHIP,
  RENDER_SEAM_POLICIES,
  normalizeNativeSegment,
  normalizeNativeSegmentJob,
  normalizeRational,
  normalizeSeamBoundary,
  normalizeSeamPolicy,
  segmentCompatibilityKey,
} from '../contracts/render-segment.js';

function validSegment(overrides = {}) {
  return {
    id: 'seg-0',
    tier: 'replayable-segment',
    container: 'mp4',
    videoCodec: 'h264',
    audioCodec: 'aac',
    width: 1920,
    height: 1080,
    dpr: 2,
    pixelFormat: 'yuv420p',
    colorSpace: 'bt709',
    colorPrimaries: 'bt709',
    colorTransfer: 'bt709',
    colorRange: 'tv',
    chromaLocation: 'left',
    frameRate: '30000/1001',
    timeBase: { num: 1, den: 30000 },
    frameDurationTicks: 1001,
    frameRange: { start: 0, end: 59 },
    captureRange: { start: 0, end: 59 },
    prerollFrames: 0,
    postrollFrames: 0,
    frameCount: 60,
    timeRange: { startTicks: 0, endTicks: 59059 },
    firstPts: 0,
    lastPts: 59059,
    keyframePts: [0, 30030],
    indexRef: 'seg-0.index',
    settingsHash: 'a'.repeat(64),
    sourceHash: `sha256:${'b'.repeat(64)}`,
    videoExtradataHash: 'c'.repeat(16),
    streamLayoutHash: 'd'.repeat(16),
    audioSampleRate: 48000,
    audioChannels: 2,
    audioChannelLayout: 'stereo',
    audioTimeBase: { num: 1, den: 48000 },
    audioExtradataHash: 'e'.repeat(16),
    ...overrides,
  };
}

function validJob(overrides = {}) {
  return {
    tier: 'replayable-segment',
    logicalRange: { start: 30, end: 89 },
    captureRange: { start: 0, end: 100 },
    prerollFrames: 30,
    postrollFrames: 11,
    continuation: { mode: 'replay', replayRef: 'replay-0', replayEvidenceHash: 'a'.repeat(16) },
    uiClock: { mode: 'wall-clock', rate: 1 },
    viewport: { width: 1920, height: 1080, dpr: 2 },
    frameRate: '30000/1001',
    timeBase: { num: 1, den: 30000 },
    frameDurationTicks: 1001,
    capability: {
      tier: 'replayable-segment',
      renderer: { requiredBackend: 'vaapi', allowFallback: false },
      encoder: { requiredBackend: 'vaapi', requiredCodec: 'h264', allowFallback: false },
    },
    container: 'mp4',
    videoCodec: 'h264',
    pixelFormat: 'yuv420p',
    colorSpace: 'bt709',
    colorPrimaries: 'bt709',
    colorTransfer: 'bt709',
    colorRange: 'tv',
    chromaLocation: 'left',
    audioCodec: null,
    sourceHash: 'a'.repeat(64),
    settingsHash: 'b'.repeat(64),
    timeoutMs: 60000,
    cancellationRef: 'cancel-token-0',
    cleanupRef: 'cleanup-token-0',
    ...overrides,
  };
}

test('rational accepts string, integer, and object forms', () => {
  assert.deepEqual(normalizeRational('30000/1001'), { num: 30000, den: 1001 });
  assert.deepEqual(normalizeRational(30), { num: 30, den: 1 });
  assert.deepEqual(normalizeRational({ num: 24, den: 1 }), { num: 24, den: 1 });
  assert.throws(() => normalizeRational('30/0'), /den: must be a positive integer/);
  assert.throws(() => normalizeRational(29.97), /num: must be a positive integer/);
});

test('seam policy validates type, ownership, and perceptual ssim requirement', () => {
  assert.deepEqual(RENDER_SEAM_POLICIES, ['exact', 'perceptual']);
  assert.deepEqual(RENDER_SEAM_OWNERSHIP, ['leading', 'trailing']);
  assert.deepEqual(normalizeSeamPolicy('exact'), { type: 'exact', owner: 'trailing' });
  assert.deepEqual(
    normalizeSeamPolicy({ type: 'perceptual', owner: 'leading', requiredSsim: 0.999 }),
    { type: 'perceptual', owner: 'leading', requiredSsim: 0.999 },
  );
  assert.throws(() => normalizeSeamPolicy({ type: 'fuzzy' }), /type: must be one of/);
  assert.throws(() => normalizeSeamPolicy({ type: 'exact', owner: 'middle' }), /owner: must be one of/);
  assert.throws(() => normalizeSeamPolicy({ type: 'perceptual' }), /requiredSsim: must be a number/);
  assert.throws(() => normalizeSeamPolicy({ type: 'perceptual', requiredSsim: 1.5 }), /requiredSsim: must be a number/);
});

test('native segment normalizes into the canonical encoded-artifact shape', () => {
  let segment = normalizeNativeSegment(validSegment());
  assert.equal(segment.version, NATIVE_SEGMENT_ARTIFACT_VERSION);
  assert.equal(segment.tier, 'replayable-segment');
  assert.deepEqual(segment.frameRate, { num: 30000, den: 1001 });
  assert.equal(segment.frameDurationTicks, 1001);
  assert.deepEqual(segment.frameRange, { start: 0, end: 59 });
  assert.deepEqual(segment.captureRange, { start: 0, end: 59 });
  assert.equal(segment.prerollFrames, 0);
  assert.equal(segment.postrollFrames, 0);
  assert.equal(segment.frameCount, 60);
  assert.deepEqual(segment.timeRange, { startTicks: 0, endTicks: 59059 });
  assert.deepEqual(segment.keyframePts, [0, 30030]);
  assert.equal(segment.independentlyDecodable, true);
  assert.equal(segment.audioCodec, 'aac');
  assert.equal(segment.audioSampleRate, 48000);
  assert.equal(segment.audioChannels, 2);
  assert.equal(segment.audioChannelLayout, 'stereo');
  assert.deepEqual(segment.audioTimeBase, { num: 1, den: 48000 });
  assert.equal(segment.audioExtradataHash, 'e'.repeat(16));
  assert.equal(segment.colorSpace, 'bt709');
  assert.equal(segment.chromaLocation, 'left');
  assert.equal(segment.indexRef, 'seg-0.index');
  assert.equal(segment.videoExtradataHash, 'c'.repeat(16));
  assert.equal(segment.streamLayoutHash, 'd'.repeat(16));
});

test('native segment nulls the whole audio group when audioCodec is absent and drops absent refs', () => {
  let segment = normalizeNativeSegment(validSegment({
    audioCodec: null,
    audioSampleRate: undefined,
    audioChannels: undefined,
    audioChannelLayout: undefined,
    audioTimeBase: undefined,
    audioExtradataHash: undefined,
    indexRef: undefined,
  }));
  assert.equal(segment.audioCodec, null);
  assert.equal(segment.audioSampleRate, null);
  assert.equal(segment.audioChannels, null);
  assert.equal(segment.audioChannelLayout, null);
  assert.equal(segment.audioTimeBase, null);
  assert.equal(segment.audioExtradataHash, null);
  assert.equal('indexRef' in segment, false);
});

test('native segment requires the full color group and stream compatibility hashes', () => {
  assert.throws(() => normalizeNativeSegment(validSegment({ pixelFormat: undefined })), /pixelFormat: is required/);
  assert.throws(() => normalizeNativeSegment(validSegment({ colorSpace: '' })), /colorSpace: is required/);
  assert.throws(() => normalizeNativeSegment(validSegment({ colorPrimaries: undefined })), /colorPrimaries: is required/);
  assert.throws(() => normalizeNativeSegment(validSegment({ colorTransfer: undefined })), /colorTransfer: is required/);
  assert.throws(() => normalizeNativeSegment(validSegment({ colorRange: undefined })), /colorRange: is required/);
  assert.throws(() => normalizeNativeSegment(validSegment({ chromaLocation: undefined })), /chromaLocation: is required/);
  assert.throws(() => normalizeNativeSegment(validSegment({ videoExtradataHash: undefined })), /videoExtradataHash: is required/);
  assert.throws(() => normalizeNativeSegment(validSegment({ streamLayoutHash: 'nope!' })), /streamLayoutHash: must be a hex digest/);
});

test('native segment requires the whole audio group when audioCodec is present and forbids it otherwise', () => {
  assert.throws(
    () => normalizeNativeSegment(validSegment({ audioSampleRate: undefined })),
    /audioSampleRate: must be a positive integer/,
  );
  assert.throws(
    () => normalizeNativeSegment(validSegment({ audioTimeBase: undefined })),
    /audioTimeBase\.num: must be a positive integer/,
  );
  assert.throws(
    () => normalizeNativeSegment(validSegment({
      audioCodec: null,
      audioChannels: undefined,
      audioChannelLayout: undefined,
      audioTimeBase: undefined,
      audioExtradataHash: undefined,
    })),
    /audioSampleRate: must be absent when audioCodec is absent/,
  );
});

test('native segment enforces the exact integer PTS cadence via frameDurationTicks', () => {
  assert.throws(
    () => normalizeNativeSegment(validSegment({ frameDurationTicks: undefined })),
    /frameDurationTicks: must be a positive integer/,
  );
  assert.throws(
    () => normalizeNativeSegment(validSegment({ lastPts: 59060 })),
    /lastPts: must equal firstPts \+ \(frameCount - 1\) \* frameDurationTicks \(59059\)/,
  );
  assert.throws(
    () => normalizeNativeSegment(validSegment({ timeRange: { startTicks: 1, endTicks: 59059 } })),
    /timeRange\.startTicks: must equal firstPts \(0\)/,
  );
  assert.throws(
    () => normalizeNativeSegment(validSegment({ timeRange: { startTicks: 0, endTicks: 60000 } })),
    /timeRange\.endTicks: must equal lastPts \(59059\)/,
  );
});

test('native segment rejects a frameCount that disagrees with the frame range', () => {
  assert.throws(
    () => normalizeNativeSegment(validSegment({ frameCount: 61 })),
    /frameCount: must equal 60/,
  );
  assert.throws(
    () => normalizeNativeSegment(validSegment({ frameRange: { start: 10, end: 5 } })),
    /frameRange\.end: must be >= frameRange\.start/,
  );
});

test('native segment rejects duplicate, non-monotonic, and out-of-range keyframe PTS', () => {
  assert.throws(
    () => normalizeNativeSegment(validSegment({ keyframePts: [0, 30030, 30030] })),
    /keyframePts\[2\]: must be strictly ascending and unique/,
  );
  assert.throws(
    () => normalizeNativeSegment(validSegment({ keyframePts: [0, 60000] })),
    /keyframePts\[1\]: must be within \[0, 59059\]/,
  );
  assert.throws(
    () => normalizeNativeSegment(validSegment({ keyframePts: [0, 30030.5] })),
    /keyframePts\[1\]: must be an integer PTS/,
  );
});

test('native segment enforces a leading keyframe only when independently decodable', () => {
  assert.throws(
    () => normalizeNativeSegment(validSegment({ keyframePts: [30030] })),
    /keyframePts: independently decodable segment must begin with a keyframe at firstPts/,
  );
  assert.throws(
    () => normalizeNativeSegment(validSegment({ keyframePts: [] })),
    /keyframePts: independently decodable segment must begin with a keyframe at firstPts/,
  );
  let dependent = normalizeNativeSegment(validSegment({ independentlyDecodable: false, keyframePts: [] }));
  assert.deepEqual(dependent.keyframePts, []);
  assert.equal(dependent.independentlyDecodable, false);
});

test('native segment rejects non-monotonic PTS and time ranges', () => {
  assert.throws(
    () => normalizeNativeSegment(validSegment({ lastPts: -1 })),
    /lastPts: must be a non-negative integer/,
  );
  assert.throws(
    () => normalizeNativeSegment(validSegment({ firstPts: 100, lastPts: 50, keyframePts: [100] })),
    /lastPts: must be >= firstPts/,
  );
  assert.throws(
    () => normalizeNativeSegment(validSegment({ timeRange: { startTicks: 100, endTicks: 50 } })),
    /timeRange\.endTicks: must be >= timeRange\.startTicks/,
  );
});

test('native segment requires settings and source hashes', () => {
  assert.throws(
    () => normalizeNativeSegment(validSegment({ settingsHash: '' })),
    /settingsHash: is required/,
  );
  assert.throws(
    () => normalizeNativeSegment(validSegment({ sourceHash: 'not a hash!' })),
    /sourceHash: must be a hex digest or sha256: reference/,
  );
  assert.throws(
    () => normalizeNativeSegment(validSegment({ tier: 'parallel' })),
    /tier: must be one of/,
  );
});

test('segment compatibility key exposes the full stream-copy contract', () => {
  assert.deepEqual(segmentCompatibilityKey(validSegment()), {
    container: 'mp4',
    videoCodec: 'h264',
    width: 1920,
    height: 1080,
    frameRate: '30000/1001',
    timeBase: '1/30000',
    pixelFormat: 'yuv420p',
    colorSpace: 'bt709',
    colorPrimaries: 'bt709',
    colorTransfer: 'bt709',
    colorRange: 'tv',
    chromaLocation: 'left',
    videoExtradataHash: 'c'.repeat(16),
    streamLayoutHash: 'd'.repeat(16),
    audioCodec: 'aac',
    audioSampleRate: 48000,
    audioChannels: 2,
    audioChannelLayout: 'stereo',
    audioTimeBase: '1/48000',
    audioExtradataHash: 'e'.repeat(16),
  });
  let silent = segmentCompatibilityKey(validSegment({
    audioCodec: null,
    audioSampleRate: undefined,
    audioChannels: undefined,
    audioChannelLayout: undefined,
    audioTimeBase: undefined,
    audioExtradataHash: undefined,
  }));
  assert.equal(silent.audioCodec, null);
  assert.equal(silent.audioSampleRate, null);
  assert.equal(silent.audioTimeBase, null);
  assert.equal(silent.audioExtradataHash, null);
});

test('native segment job normalizes a replayable segment with enclosing capture and continuation', () => {
  let job = normalizeNativeSegmentJob(validJob());
  assert.equal(job.version, NATIVE_SEGMENT_JOB_VERSION);
  assert.equal(job.tier, 'replayable-segment');
  assert.deepEqual(job.logicalRange, { start: 30, end: 89 });
  assert.deepEqual(job.captureRange, { start: 0, end: 100 });
  assert.equal(job.prerollFrames, 30);
  assert.equal(job.postrollFrames, 11);
  assert.deepEqual(job.continuation, { mode: 'replay', replayRef: 'replay-0', replayEvidenceHash: 'a'.repeat(16) });
  assert.deepEqual(job.uiClock, { mode: 'wall-clock', rate: 1 });
  assert.deepEqual(job.viewport, { width: 1920, height: 1080, dpr: 2 });
  assert.equal(job.frameDurationTicks, 1001);
  assert.equal(job.capability.tier, 'replayable-segment');
  assert.equal(job.capability.renderer.allowFallback, false);
  assert.equal(job.audioCodec, null);
  assert.equal(job.audioSampleRate, null);
  assert.equal(job.timeoutMs, 60000);
  assert.equal(job.cancellationRef, 'cancel-token-0');
  assert.equal(job.cleanupRef, 'cleanup-token-0');
});

test('native segment job requires the capture window to enclose the logical range with consistent roll frames', () => {
  assert.throws(
    () => normalizeNativeSegmentJob(validJob({ captureRange: { start: 40, end: 100 } })),
    /captureRange\.start: must be <= logicalRange\.start/,
  );
  assert.throws(
    () => normalizeNativeSegmentJob(validJob({ captureRange: { start: 0, end: 80 } })),
    /captureRange\.end: must be >= logicalRange\.end/,
  );
  assert.throws(
    () => normalizeNativeSegmentJob(validJob({ prerollFrames: 5 })),
    /prerollFrames: must equal logicalRange\.start - captureRange\.start \(30\)/,
  );
  assert.throws(
    () => normalizeNativeSegmentJob(validJob({ postrollFrames: 0 })),
    /postrollFrames: must equal captureRange\.end - logicalRange\.end \(11\)/,
  );
});

test('native segment job binds continuation and ui clock to the execution tier', () => {
  assert.throws(
    () => normalizeNativeSegmentJob(validJob({ continuation: { mode: 'continuous' } })),
    /continuation\.mode: must be "replay" for replayable-segment/,
  );
  assert.throws(
    () => normalizeNativeSegmentJob(validJob({ continuation: { mode: 'replay', replayRef: 'r' } })),
    /continuation\.replayEvidenceHash: is required/,
  );
  assert.throws(
    () => normalizeNativeSegmentJob(validJob({ uiClock: { mode: 'render-time', rate: 1 } })),
    /uiClock: must be wall-clock at rate 1 for replayable-segment/,
  );
  assert.throws(
    () => normalizeNativeSegmentJob(validJob({ uiClock: { mode: 'wall-clock', rate: 2 } })),
    /uiClock: must be wall-clock at rate 1 for replayable-segment/,
  );
});

test('native segment job allows render-time only for a checkpointed tier with an equivalence proof', () => {
  let job = normalizeNativeSegmentJob(validJob({
    tier: 'checkpointed-deterministic',
    continuation: { mode: 'checkpoint', checkpointRef: 'ckpt-0', checkpointHash: 'f'.repeat(16) },
    uiClock: { mode: 'render-time', rate: 2, clockEquivalenceProofRef: 'clock-proof-0' },
    capability: {
      tier: 'checkpointed-deterministic',
      renderer: { allowFallback: false },
      encoder: { allowFallback: false },
    },
  }));
  assert.equal(job.tier, 'checkpointed-deterministic');
  assert.deepEqual(job.continuation, { mode: 'checkpoint', checkpointRef: 'ckpt-0', checkpointHash: 'f'.repeat(16) });
  assert.deepEqual(job.uiClock, { mode: 'render-time', rate: 2, clockEquivalenceProofRef: 'clock-proof-0' });

  assert.throws(
    () => normalizeNativeSegmentJob(validJob({
      tier: 'checkpointed-deterministic',
      continuation: { mode: 'checkpoint', checkpointRef: 'ckpt-0', checkpointHash: 'f'.repeat(16) },
      uiClock: { mode: 'render-time', rate: 2 },
      capability: {
        tier: 'checkpointed-deterministic',
        renderer: { allowFallback: false },
        encoder: { allowFallback: false },
      },
    })),
    /uiClock\.clockEquivalenceProofRef: is required/,
  );
});

test('native segment job rejects non-portable cancellation and cleanup refs', () => {
  assert.throws(
    () => normalizeNativeSegmentJob(validJob({ cancellationRef: () => {} })),
    /cancellationRef: must be a portable string token, not a function/,
  );
  assert.throws(
    () => normalizeNativeSegmentJob(validJob({ cancellationRef: new AbortController().signal })),
    /cancellationRef: must be a portable string token, not an object/,
  );
  assert.throws(
    () => normalizeNativeSegmentJob(validJob({ cleanupRef: '' })),
    /cleanupRef: is required/,
  );
});

test('native segment job rejects an inconsistent cadence and non-positive timeout', () => {
  assert.throws(
    () => normalizeNativeSegmentJob(validJob({ frameDurationTicks: 1000 })),
    /frameDurationTicks: must be consistent with frameRate and timeBase/,
  );
  assert.throws(
    () => normalizeNativeSegmentJob(validJob({ timeoutMs: 0 })),
    /timeoutMs: must be a positive integer/,
  );
});

test('native segment enforces the exact cadence cross-multiplication (repro #2)', () => {
  // 30/1 fps + 1/30 timeBase self-consistent PTS but frameDurationTicks:2 is not a
  // single frame; must fail closed.
  assert.throws(
    () => normalizeNativeSegment(validSegment({
      frameRate: '30/1',
      timeBase: { num: 1, den: 30 },
      frameDurationTicks: 2,
      lastPts: 118,
      timeRange: { startTicks: 0, endTicks: 118 },
      keyframePts: [0, 60],
    })),
    /frameDurationTicks: must be consistent with frameRate and timeBase/,
  );
  let ok = normalizeNativeSegment(validSegment({
    frameRate: '30/1',
    timeBase: { num: 1, den: 30 },
    frameDurationTicks: 1,
    lastPts: 59,
    timeRange: { startTicks: 0, endTicks: 59 },
    keyframePts: [0, 30],
  }));
  assert.equal(ok.frameDurationTicks, 1);
});

test('native segment requires a capture range that encloses the logical range with consistent roll frames', () => {
  assert.throws(
    () => normalizeNativeSegment(validSegment({ captureRange: undefined })),
    /captureRange: must be an object/,
  );
  assert.throws(
    () => normalizeNativeSegment(validSegment({ captureRange: { start: 5, end: 59 }, prerollFrames: 0 })),
    /captureRange\.start: must be <= frameRange\.start/,
  );
  assert.throws(
    () => normalizeNativeSegment(validSegment({ captureRange: { start: 0, end: 40 }, postrollFrames: 0 })),
    /captureRange\.end: must be >= frameRange\.end/,
  );
  assert.throws(
    () => normalizeNativeSegment(validSegment({ captureRange: { start: 0, end: 69 }, prerollFrames: 0, postrollFrames: 5 })),
    /postrollFrames: must equal captureRange\.end - frameRange\.end \(10\)/,
  );
  let widened = normalizeNativeSegment(validSegment({
    frameRange: { start: 5, end: 64 },
    captureRange: { start: 0, end: 70 },
    prerollFrames: 5,
    postrollFrames: 6,
    firstPts: 5005,
    lastPts: 64064,
    timeRange: { startTicks: 5005, endTicks: 64064 },
    keyframePts: [5005, 35035],
  }));
  assert.deepEqual(widened.captureRange, { start: 0, end: 70 });
  assert.equal(widened.prerollFrames, 5);
  assert.equal(widened.postrollFrames, 6);
});

test('native segment job requires the capability tier and encoder codec to agree with the job', () => {
  assert.throws(
    () => normalizeNativeSegmentJob(validJob({
      capability: {
        tier: 'checkpointed-deterministic',
        renderer: { requiredBackend: 'vaapi', allowFallback: false },
        encoder: { requiredBackend: 'vaapi', requiredCodec: 'h264', allowFallback: false },
      },
    })),
    /capability\.tier: must equal job tier "replayable-segment"/,
  );
  assert.throws(
    () => normalizeNativeSegmentJob(validJob({
      capability: {
        tier: 'replayable-segment',
        renderer: { requiredBackend: 'vaapi', allowFallback: false },
        encoder: { requiredBackend: 'vaapi', requiredCodec: 'hevc', allowFallback: false },
      },
    })),
    /capability\.encoder\.requiredCodec: must equal job videoCodec "h264"/,
  );
});

test('seam boundary schema requires version and overlap owner and validates optional evidence', () => {
  assert.deepEqual(
    normalizeSeamBoundary({
      version: RENDER_SEAM_INPUT_VERSION,
      overlapOwner: 'trailing',
      exactPixelsMatch: true,
      boundaryIdentity: 'b-1',
      prevBoundaryIdentity: 'b-0',
      ssim: 0.9999995,
    }),
    {
      version: RENDER_SEAM_INPUT_VERSION,
      overlapOwner: 'trailing',
      exactPixelsMatch: true,
      boundaryIdentity: 'b-1',
      prevBoundaryIdentity: 'b-0',
      ssim: 0.9999995,
    },
  );
  assert.deepEqual(
    normalizeSeamBoundary({ version: RENDER_SEAM_INPUT_VERSION, overlapOwner: 'leading' }),
    { version: RENDER_SEAM_INPUT_VERSION, overlapOwner: 'leading' },
  );
  // repro #9 (input side): a seam boundary without version or overlap owner fails closed.
  assert.throws(() => normalizeSeamBoundary({}), /version: must equal "render-seam-input\/1"/);
  assert.throws(
    () => normalizeSeamBoundary({ version: 'render-seam-input/9', overlapOwner: 'trailing' }),
    /version: must equal "render-seam-input\/1"/,
  );
  assert.throws(
    () => normalizeSeamBoundary({ version: RENDER_SEAM_INPUT_VERSION, exactPixelsMatch: true }),
    /overlapOwner: must be one of/,
  );
  assert.throws(
    () => normalizeSeamBoundary({ version: RENDER_SEAM_INPUT_VERSION, overlapOwner: 'middle' }),
    /overlapOwner: must be one of/,
  );
  assert.throws(
    () => normalizeSeamBoundary({ version: RENDER_SEAM_INPUT_VERSION, overlapOwner: 'trailing', exactPixelsMatch: 'yes' }),
    /exactPixelsMatch: must be a boolean/,
  );
  assert.throws(
    () => normalizeSeamBoundary({ version: RENDER_SEAM_INPUT_VERSION, overlapOwner: 'trailing', ssim: 1.5 }),
    /ssim: must be a number in \[0, 1\]/,
  );
  assert.throws(() => normalizeSeamBoundary(null), /seamBoundary: must be an object/);
});
