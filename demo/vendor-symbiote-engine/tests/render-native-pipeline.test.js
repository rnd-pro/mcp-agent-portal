import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  accelerationCandidateProven,
  admitRenderRequest,
  buildRenderSegmentSeamProof,
  buildRenderStreamPtsProof,
  buildSegmentConcatArgs,
  buildSegmentConcatListLine,
  createRenderSegmentCacheKey,
  invalidateRenderSegmentRanges,
  normalizeNativeSegment,
  normalizeNativeSegmentJob,
  normalizeRenderArtifact,
  normalizeRenderJob,
  normalizeSeamBoundary,
  planSegmentConcat,
  selectRenderAcceleration,
} from '../index.js';

const HASH = 'deadbeefdeadbeef';
const VIDEO_EXTRADATA = 'cafebabecafebabe';
const STREAM_LAYOUT = 'abad1deaabad1dea';

// A structurally valid native encoded segment. frameDurationTicks = 1 on a 1/30
// time base, so PTS are measured in whole frames: firstPts = start, lastPts = end.
function segment(overrides = {}) {
  let start = overrides.start ?? 0;
  let frameCount = overrides.frameCount ?? 120;
  let end = start + frameCount - 1;
  return {
    id: overrides.id ?? `seg-${start}`,
    tier: 'sequential-realtime',
    container: 'mp4',
    videoCodec: 'h264',
    audioCodec: overrides.audioCodec ?? null,
    width: overrides.width ?? 1920,
    height: overrides.height ?? 1080,
    dpr: 1,
    pixelFormat: overrides.pixelFormat ?? 'yuv420p',
    colorSpace: overrides.colorSpace ?? 'bt709',
    colorPrimaries: 'bt709',
    colorTransfer: 'bt709',
    colorRange: 'tv',
    chromaLocation: 'left',
    frameRate: { num: 30, den: 1 },
    timeBase: { num: 1, den: 30 },
    frameDurationTicks: 1,
    frameRange: { start, end },
    captureRange: overrides.captureRange ?? { start, end },
    prerollFrames: overrides.prerollFrames ?? 0,
    postrollFrames: overrides.postrollFrames ?? 0,
    frameCount,
    timeRange: { startTicks: start, endTicks: end },
    firstPts: start,
    lastPts: end,
    keyframePts: [start],
    settingsHash: HASH,
    sourceHash: HASH,
    videoExtradataHash: overrides.videoExtradataHash ?? VIDEO_EXTRADATA,
    streamLayoutHash: overrides.streamLayoutHash ?? STREAM_LAYOUT,
    ...(overrides.audioCodec ? {
      audioSampleRate: overrides.audioSampleRate ?? 48000,
      audioChannels: overrides.audioChannels ?? 2,
      audioChannelLayout: overrides.audioChannelLayout ?? 'stereo',
      audioTimeBase: { num: 1, den: 48000 },
      audioExtradataHash: overrides.audioExtradataHash ?? HASH,
    } : {}),
    ...(overrides.boundary ? { boundary: overrides.boundary } : {}),
  };
}

function nativeJob(overrides = {}) {
  return {
    providerId: 'linux-native',
    kind: 'native-segment',
    tier: 'sequential-realtime',
    logicalRange: { start: 0, end: 119 },
    captureRange: { start: 0, end: 119 },
    prerollFrames: 0,
    postrollFrames: 0,
    continuation: { mode: 'continuous' },
    uiClock: { mode: 'wall-clock', rate: 1 },
    viewport: { width: 1920, height: 1080, dpr: 1 },
    frameRate: { num: 30, den: 1 },
    timeBase: { num: 1, den: 30 },
    frameDurationTicks: 1,
    capability: {
      tier: 'sequential-realtime',
      renderer: { requiredBackend: 'radv', allowFallback: false },
      encoder: { requiredBackend: 'nvenc', requiredCodec: 'h264', allowFallback: false },
    },
    container: 'mp4',
    videoCodec: 'h264',
    pixelFormat: 'yuv420p',
    colorSpace: 'bt709',
    colorPrimaries: 'bt709',
    colorTransfer: 'bt709',
    colorRange: 'tv',
    chromaLocation: 'left',
    sourceHash: HASH,
    settingsHash: HASH,
    timeoutMs: 60000,
    cancellationRef: 'cancel:job-1',
    cleanupRef: 'cleanup:job-1',
    ...overrides,
  };
}

function selectionReceipt() {
  return selectRenderAcceleration({
    request: {
      tier: 'sequential-realtime',
      renderer: { requiredBackend: 'radv', allowFallback: false },
      encoder: { requiredBackend: 'nvenc', requiredCodec: 'h264', allowFallback: false },
    },
    rendererCandidates: [
      { id: 'radv', role: 'renderer', backend: 'radv', available: true, evidence: { probe: 'renderer-identity', rendererIdentity: 'AMD RADV' } },
    ],
    encoderCandidates: [
      { id: 'nvenc', role: 'encoder', backend: 'nvenc', codec: 'h264', available: true, evidence: { probe: 'real-encode', encodeOk: true } },
    ],
  });
}

const LIMITS = {
  maxWidth: 3840,
  maxHeight: 2160,
  maxDpr: 2,
  maxFps: 60,
  maxWorkers: 4,
  allowedTiers: ['sequential-realtime', 'replayable-segment', 'checkpointed-deterministic'],
};

test('admission admits a valid sequential-realtime single-worker request', () => {
  let result = admitRenderRequest({
    request: { tier: 'sequential-realtime', width: 1920, height: 1080, dpr: 1, fps: 30, workerCount: 1 },
    limits: LIMITS,
  });
  assert.equal(result.admitted, true);
  assert.equal(result.rejections.length, 0);
});

test('admission rejects sequential-realtime with more than one worker', () => {
  let result = admitRenderRequest({
    request: { tier: 'sequential-realtime', width: 1920, height: 1080, dpr: 1, fps: 30, workerCount: 4 },
    limits: LIMITS,
  });
  assert.equal(result.admitted, false);
  assert.ok(result.rejections.some((r) => r.reason === 'sequential-realtime-single-worker'));
});

test('admission fails closed when request fields or policy limits are missing', () => {
  let missingFields = admitRenderRequest({ request: { tier: 'sequential-realtime' }, limits: LIMITS });
  assert.equal(missingFields.admitted, false);
  assert.ok(missingFields.rejections.some((r) => r.reason === 'width-invalid'));
  assert.ok(missingFields.rejections.some((r) => r.reason === 'workerCount-invalid'));

  let missingLimits = admitRenderRequest({
    request: { tier: 'sequential-realtime', width: 1920, height: 1080, dpr: 1, fps: 30, workerCount: 1 },
    limits: { allowedTiers: ['sequential-realtime'] },
  });
  assert.equal(missingLimits.admitted, false);
  assert.ok(missingLimits.rejections.some((r) => r.reason === 'width-limit-missing'));

  let missingPolicy = admitRenderRequest({
    request: { tier: 'sequential-realtime', width: 1920, height: 1080, dpr: 1, fps: 30, workerCount: 1 },
    limits: { maxWidth: 3840, maxHeight: 2160, maxDpr: 2, maxFps: 60, maxWorkers: 4 },
  });
  assert.equal(missingPolicy.admitted, false);
  assert.ok(missingPolicy.rejections.some((r) => r.reason === 'allowed-tiers-missing'));
});

test('acceleration selection never selects unproven evidence', () => {
  let proven = selectionReceipt();
  assert.equal(proven.ok, true);
  assert.equal(proven.renderer.selected.backend, 'radv');
  assert.equal(proven.encoder.selected.codec, 'h264');

  let encoderNotProven = selectRenderAcceleration({
    request: {
      tier: 'sequential-realtime',
      renderer: { requiredBackend: 'radv', allowFallback: false },
      encoder: { requiredBackend: 'nvenc', allowFallback: false },
    },
    rendererCandidates: [
      { id: 'radv', role: 'renderer', backend: 'radv', available: true, evidence: { probe: 'renderer-identity', rendererIdentity: 'AMD RADV' } },
    ],
    encoderCandidates: [
      { id: 'nvenc', role: 'encoder', backend: 'nvenc', available: true, evidence: { probe: 'real-encode', encodeOk: false } },
    ],
  });
  assert.equal(encoderNotProven.ok, false);
  assert.equal(encoderNotProven.encoder.selected, null);

  let rendererNoIdentity = selectRenderAcceleration({
    request: {
      tier: 'sequential-realtime',
      renderer: { requiredBackend: 'radv', allowFallback: false },
      encoder: { requiredBackend: 'nvenc', requiredCodec: 'h264', allowFallback: false },
    },
    rendererCandidates: [
      { id: 'radv', role: 'renderer', backend: 'radv', available: true, evidence: { probe: 'renderer-identity' } },
    ],
    encoderCandidates: [
      { id: 'nvenc', role: 'encoder', backend: 'nvenc', codec: 'h264', available: true, evidence: { probe: 'real-encode', encodeOk: true } },
    ],
  });
  assert.equal(rendererNoIdentity.ok, false);
  assert.equal(rendererNoIdentity.renderer.selected, null);
});

test('accelerationCandidateProven is the single source of truth for usability', () => {
  assert.equal(accelerationCandidateProven({ role: 'encoder', available: true, evidence: { probe: 'real-encode', encodeOk: true } }), true);
  assert.equal(accelerationCandidateProven({ role: 'encoder', available: true, evidence: { probe: 'real-encode', encodeOk: false } }), false);
  assert.equal(accelerationCandidateProven({ role: 'renderer', available: true, evidence: { probe: 'device-present' } }), false);
});

test('native-segment job requires each contract group', () => {
  assert.doesNotThrow(() => normalizeRenderJob(nativeJob()));

  assert.throws(() => normalizeRenderJob(nativeJob({ continuation: undefined })), /continuation/);
  assert.throws(() => normalizeRenderJob(nativeJob({ uiClock: { mode: 'render-time', rate: 2 } })), /uiClock/);
  assert.throws(() => normalizeRenderJob(nativeJob({ captureRange: { start: 5, end: 119 }, prerollFrames: 0 })), /captureRange\.start/);
  assert.throws(() => normalizeRenderJob(nativeJob({ cancellationRef: () => {} })), /cancellationRef/);
  assert.throws(() => normalizeRenderJob(nativeJob({ timeoutMs: 0 })), /timeoutMs/);

  let checkpointed = normalizeNativeSegmentJob(nativeJob({
    tier: 'checkpointed-deterministic',
    continuation: { mode: 'checkpoint', checkpointRef: 'ckpt:1', checkpointHash: HASH },
    uiClock: { mode: 'render-time', rate: 4, clockEquivalenceProofRef: 'clock:1' },
    capability: {
      tier: 'checkpointed-deterministic',
      renderer: { allowFallback: false },
      encoder: { allowFallback: false },
    },
  }));
  assert.equal(checkpointed.uiClock.clockEquivalenceProofRef, 'clock:1');
});

test('native-segment artifact requires a master media reference and matching tier', () => {
  let base = {
    providerId: 'linux-native',
    kind: 'native-segment',
    ...segment({ start: 0 }),
    frames: 120,
    fps: 30,
    durationSec: 4,
    renderSelectionReceipt: selectionReceipt(),
    continuationEvidence: { mode: 'continuous' },
    clockEvidence: { mode: 'wall-clock', rate: 1 },
    cleanupRef: 'cleanup:seg-0',
    proof: { ok: true },
  };
  let artifact = normalizeRenderArtifact({ ...base, mediaRef: 'media:seg-0' }, { tier: 'sequential-realtime' });
  assert.equal(artifact.mediaRef, 'media:seg-0');
  assert.equal(artifact.kind, 'native-segment');

  assert.throws(() => normalizeRenderArtifact(base, { tier: 'sequential-realtime' }), /mediaRef/);
  assert.throws(
    () => normalizeRenderArtifact({ ...base, mediaRef: 'media:seg-0' }, { tier: 'checkpointed-deterministic' }),
    /tier/,
  );
});

test('stream copy requires positive compatibility evidence and fails closed without it', () => {
  let plan = planSegmentConcat({ segments: [segment({ start: 0 }), segment({ start: 120 })] });
  assert.equal(plan.ok, true);
  assert.equal(plan.mode, 'stream-copy');
  assert.deepEqual(plan.groups, [['seg-0', 'seg-120']]);

  assert.throws(() => planSegmentConcat({ segments: [] }), /segment/i);
  assert.throws(
    () => planSegmentConcat({ segments: [{ ...segment({ start: 0 }), streamLayoutHash: undefined }, segment({ start: 120 })] }),
    /streamLayoutHash/,
  );
});

test('color, stream-layout, and audio-layout mismatches are separately rejected', () => {
  let color = planSegmentConcat({ segments: [segment({ start: 0 }), segment({ start: 120, colorSpace: 'bt2020nc' })] });
  assert.equal(color.ok, false);
  assert.ok(color.incompatibilities.some((i) => i.reason === 'color-mismatch'));

  let layout = planSegmentConcat({ segments: [segment({ start: 0 }), segment({ start: 120, streamLayoutHash: 'ffffffffffffffff' })] });
  assert.equal(layout.ok, false);
  assert.ok(layout.incompatibilities.some((i) => i.reason === 'stream-layout-mismatch'));

  let audio = planSegmentConcat({
    segments: [
      segment({ start: 0, audioCodec: 'aac' }),
      segment({ start: 120, audioCodec: 'aac', audioChannels: 6, audioChannelLayout: '5.1' }),
    ],
  });
  assert.equal(audio.ok, false);
  assert.ok(audio.incompatibilities.some((i) => i.reason === 'audio-layout-mismatch'));
});

test('concat args honor the planned mode without hiding a re-encode', () => {
  let copyArgs = buildSegmentConcatArgs({ concatListPath: '/tmp/list.txt', outputPath: '/tmp/out.mp4', mode: 'stream-copy' });
  assert.ok(copyArgs.includes('-c') && copyArgs.includes('copy'));
  assert.equal(copyArgs.includes('-c:v'), false);

  let reencodeArgs = buildSegmentConcatArgs({ concatListPath: '/tmp/list.txt', outputPath: '/tmp/out.mp4', mode: 're-encode', videoCodec: 'libx264' });
  assert.ok(reencodeArgs.includes('-c:v') && reencodeArgs.includes('libx264'));
  assert.equal(reencodeArgs.includes('copy'), false);

  assert.equal(buildSegmentConcatListLine('/tmp/a.mp4'), "file '/tmp/a.mp4'");
});

test('exact seam and monotonic stream PTS proofs pass for a valid two-segment render', () => {
  let seamProof = buildRenderSegmentSeamProof({
    segments: [
      segment({ start: 0 }),
      segment({ start: 120, boundary: { version: 'render-seam-input/1', overlapOwner: 'trailing', exactPixelsMatch: true } }),
    ],
    policy: { type: 'exact', owner: 'trailing' },
  });
  assert.equal(seamProof.ok, true);
  assert.equal(seamProof.seams.length, 1);

  let ptsProof = buildRenderStreamPtsProof({
    ptsStep: 1,
    frames: [
      { index: 0, pts: 0, identity: 'a', pixelHash: 'h0' },
      { index: 1, pts: 1, identity: 'b', pixelHash: 'h1' },
      { index: 2, pts: 2, identity: 'c', pixelHash: 'h2' },
    ],
  });
  assert.equal(ptsProof.ok, true);
});

test('seam proof rejects a duplicate boundary PTS', () => {
  let proof = buildRenderSegmentSeamProof({
    segments: [
      segment({ start: 0 }),
      // firstPts equal to the previous lastPts (119) is a duplicate boundary PTS.
      segment({ start: 119, boundary: { version: 'render-seam-input/1', overlapOwner: 'trailing', exactPixelsMatch: true } }),
    ],
    policy: { type: 'exact', owner: 'trailing' },
  });
  assert.equal(proof.ok, false);
  assert.ok(proof.seams[0].errors.includes('duplicate-boundary-pts'));
});

test('stream PTS proof rejects missing cadence, missing identity, index gap, and PTS gap', () => {
  let noCadence = buildRenderStreamPtsProof({ frames: [{ index: 0, pts: 0, identity: 'a' }] });
  assert.equal(noCadence.ok, false);
  assert.ok(noCadence.errors.includes('missing-cadence-evidence'));

  let missingIdentity = buildRenderStreamPtsProof({
    ptsStep: 1,
    frames: [{ index: 0, pts: 0, identity: 'a' }, { index: 1, pts: 1 }],
  });
  assert.equal(missingIdentity.ok, false);
  assert.equal(missingIdentity.missingIdentities.length, 1);

  let indexGap = buildRenderStreamPtsProof({
    ptsStep: 1,
    frames: [{ index: 0, pts: 0, identity: 'a' }, { index: 2, pts: 1, identity: 'b' }],
  });
  assert.equal(indexGap.ok, false);
  assert.equal(indexGap.indexGaps.length, 1);

  let ptsGap = buildRenderStreamPtsProof({
    ptsStep: 1,
    frames: [{ index: 0, pts: 0, identity: 'a' }, { index: 1, pts: 5, identity: 'b' }],
  });
  assert.equal(ptsGap.ok, false);
  assert.equal(ptsGap.ptsGaps.length, 1);
});

test('a static scene with repeated pixel hashes but distinct identity/index/PTS stays valid', () => {
  let proof = buildRenderStreamPtsProof({
    ptsStep: 1,
    frames: [
      { index: 0, pts: 0, identity: 'f0', pixelHash: 'static' },
      { index: 1, pts: 1, identity: 'f1', pixelHash: 'static' },
      { index: 2, pts: 2, identity: 'f2', pixelHash: 'static' },
    ],
  });
  assert.equal(proof.ok, true, 'identical pixel hashes must not fail a static scene');
  assert.ok(proof.staticRuns.length >= 1);
});

test('native job rejects a capability tier or encoder codec that disagrees with the job', () => {
  assert.throws(
    () => normalizeRenderJob(nativeJob({
      capability: {
        tier: 'checkpointed-deterministic',
        renderer: { requiredBackend: 'radv', allowFallback: false },
        encoder: { requiredBackend: 'nvenc', requiredCodec: 'h264', allowFallback: false },
      },
    })),
    /capability\.tier/,
  );
  assert.throws(
    () => normalizeRenderJob(nativeJob({
      capability: {
        tier: 'sequential-realtime',
        renderer: { requiredBackend: 'radv', allowFallback: false },
        encoder: { requiredBackend: 'nvenc', requiredCodec: 'vp9', allowFallback: false },
      },
    })),
    /capability\.encoder\.requiredCodec/,
  );
});

test('native segment rejects a frame-duration that is inconsistent with frameRate and timeBase', () => {
  // Self-consistent first/last PTS (lastPts = 0 + 119*2) but frameDurationTicks:2
  // contradicts frameRate 30/1 on timeBase 1/30 (which requires ticks of 1).
  let inconsistent = {
    ...segment({ start: 0 }),
    frameDurationTicks: 2,
    lastPts: 238,
    timeRange: { startTicks: 0, endTicks: 238 },
  };
  assert.throws(() => normalizeNativeSegment(inconsistent, { path: 'seg' }), /frameDurationTicks/);
});

function nativeArtifact(overrides = {}) {
  return {
    providerId: 'linux-native',
    kind: 'native-segment',
    ...segment({ start: 0 }),
    frames: 120,
    fps: 30,
    durationSec: 4,
    mediaRef: 'media:seg-0',
    renderSelectionReceipt: selectionReceipt(),
    continuationEvidence: { mode: 'continuous' },
    clockEvidence: { mode: 'wall-clock', rate: 1 },
    cleanupRef: 'cleanup:seg-0',
    proof: { ok: true },
    ...overrides,
  };
}

test('native artifact rejects a selection receipt whose tier disagrees or is unproven', () => {
  let wrongTier = selectRenderAcceleration({
    request: {
      tier: 'checkpointed-deterministic',
      renderer: { requiredBackend: 'radv', allowFallback: false },
      encoder: { requiredBackend: 'nvenc', requiredCodec: 'h264', allowFallback: false },
    },
    rendererCandidates: [{ id: 'radv', role: 'renderer', backend: 'radv', available: true, evidence: { probe: 'renderer-identity', rendererIdentity: 'AMD RADV' } }],
    encoderCandidates: [{ id: 'nvenc', role: 'encoder', backend: 'nvenc', codec: 'h264', available: true, evidence: { probe: 'real-encode', encodeOk: true } }],
  });
  assert.throws(() => normalizeRenderArtifact(nativeArtifact({ renderSelectionReceipt: wrongTier }), { tier: 'sequential-realtime' }), /renderSelectionReceipt\.tier/);

  let notOk = selectRenderAcceleration({
    request: {
      tier: 'sequential-realtime',
      renderer: { requiredBackend: 'radv', allowFallback: false },
      encoder: { requiredBackend: 'nvenc', allowFallback: false },
    },
    rendererCandidates: [{ id: 'radv', role: 'renderer', backend: 'radv', available: true, evidence: { probe: 'renderer-identity', rendererIdentity: 'AMD RADV' } }],
    encoderCandidates: [{ id: 'nvenc', role: 'encoder', backend: 'nvenc', available: false, evidence: { probe: 'device-present' } }],
  });
  assert.equal(notOk.ok, false);
  assert.throws(() => normalizeRenderArtifact(nativeArtifact({ renderSelectionReceipt: notOk }), { tier: 'sequential-realtime' }), /renderSelectionReceipt/);
});

test('sequential native artifact rejects non-wall-clock evidence but a checkpointed proof-backed clock passes', () => {
  assert.throws(
    () => normalizeRenderArtifact(nativeArtifact({ clockEvidence: { mode: 'render-time', rate: 4 } }), { tier: 'sequential-realtime' }),
    /clockEvidence/,
  );

  let checkpointedSegment = segment({ start: 0 });
  checkpointedSegment.tier = 'checkpointed-deterministic';
  let checkpointedReceipt = selectRenderAcceleration({
    request: {
      tier: 'checkpointed-deterministic',
      renderer: { requiredBackend: 'radv', allowFallback: false },
      encoder: { requiredBackend: 'nvenc', requiredCodec: 'h264', allowFallback: false },
    },
    rendererCandidates: [{ id: 'radv', role: 'renderer', backend: 'radv', available: true, evidence: { probe: 'renderer-identity', rendererIdentity: 'AMD RADV' } }],
    encoderCandidates: [{ id: 'nvenc', role: 'encoder', backend: 'nvenc', codec: 'h264', available: true, evidence: { probe: 'real-encode', encodeOk: true } }],
  });
  let artifact = normalizeRenderArtifact({
    providerId: 'linux-native',
    kind: 'native-segment',
    ...checkpointedSegment,
    frames: 120,
    fps: 30,
    durationSec: 4,
    mediaRef: 'media:ckpt',
    renderSelectionReceipt: checkpointedReceipt,
    continuationEvidence: { mode: 'checkpoint', checkpointRef: 'ckpt:1', checkpointHash: HASH },
    clockEvidence: { mode: 'render-time', rate: 4, clockEquivalenceProofRef: 'clock:1' },
    cleanupRef: 'cleanup:ckpt',
    proof: { ok: true },
  }, { tier: 'checkpointed-deterministic' });
  assert.equal(artifact.clockEvidence.clockEquivalenceProofRef, 'clock:1');
});

test('native artifact rejects object refs, an over-long duration, and a failed proof', () => {
  assert.throws(() => normalizeRenderArtifact(nativeArtifact({ mediaRef: { path: 'x' } }), { tier: 'sequential-realtime' }), /mediaRef/);
  assert.throws(() => normalizeRenderArtifact(nativeArtifact({ cleanupRef: { path: 'x' } }), { tier: 'sequential-realtime' }), /cleanupRef/);
  assert.throws(() => normalizeRenderArtifact(nativeArtifact({ durationSec: 999 }), { tier: 'sequential-realtime' }), /durationSec/);
  assert.throws(() => normalizeRenderArtifact(nativeArtifact({ proof: { ok: false } }), { tier: 'sequential-realtime' }), /proof/);
});

test('native artifact preserves capture/preroll metadata and passes the job cross-check', () => {
  let artifact = normalizeRenderArtifact(
    nativeArtifact({ captureRange: { start: 0, end: 121 }, postrollFrames: 2, frameRange: { start: 0, end: 119 } }),
    { tier: 'sequential-realtime' },
  );
  assert.deepEqual(artifact.captureRange, { start: 0, end: 121 });
  assert.equal(artifact.prerollFrames, 0);
  assert.equal(artifact.postrollFrames, 2);
});

test('seam boundary input without the schema version or owner is rejected', () => {
  assert.throws(() => normalizeSeamBoundary({ overlapOwner: 'trailing' }), /version/);
  assert.throws(() => normalizeSeamBoundary({ version: 'render-seam-input/1' }), /overlapOwner/);
});

test('exact seam proof rejects a boundary that omits the canonical overlap owner', () => {
  assert.throws(
    () => buildRenderSegmentSeamProof({
      segments: [segment({ start: 0 }), segment({ start: 120, boundary: { version: 'render-seam-input/1', exactPixelsMatch: true } })],
      policy: { type: 'exact', owner: 'trailing' },
    }),
    /overlapOwner/,
  );
});

test('re-encode resolves a format-only mismatch but never a frame or PTS continuity defect', () => {
  let formatOnly = planSegmentConcat({
    segments: [segment({ start: 0 }), segment({ start: 120, colorSpace: 'bt2020nc' })],
    allowReencode: true,
  });
  assert.equal(formatOnly.ok, true);
  assert.equal(formatOnly.mode, 're-encode');

  let frameGap = planSegmentConcat({
    segments: [segment({ start: 0, frameCount: 120 }), segment({ start: 130 })],
    allowReencode: true,
  });
  assert.equal(frameGap.ok, false, 're-encode cannot invent missing source frames');

  assert.throws(
    () => planSegmentConcat({ segments: [segment({ start: 0 }), segment({ start: 120, id: 'seg-0' })] }),
    /duplicate/i,
  );
});

test('stream PTS proof fails closed on an empty frame list', () => {
  let proof = buildRenderStreamPtsProof({ ptsStep: 1, frames: [] });
  assert.equal(proof.ok, false);
  assert.ok(proof.errors.includes('empty-frame-stream'));
});

test('segment cache keys are range addressed and invalidation is range scoped', () => {
  let seed = { appBuild: 'build-1', dataHash: 'data-1', output: { width: 1920, height: 1080, fps: 30 } };
  let keyA = createRenderSegmentCacheKey(seed, { start: 0, end: 119 });
  let keyB = createRenderSegmentCacheKey(seed, { start: 120, end: 239 });
  assert.notEqual(keyA, keyB);
  assert.equal(keyA, createRenderSegmentCacheKey(seed, { start: 0, end: 119 }));

  let result = invalidateRenderSegmentRanges(
    [
      { id: 'a', frameRange: { start: 0, end: 119 } },
      { id: 'b', frameRange: { start: 120, end: 239 } },
      { id: 'c', frameRange: { start: 240, end: 359 } },
    ],
    { start: 130, end: 140 },
  );
  assert.deepEqual(result.invalidated, ['b']);
  assert.deepEqual(result.retained, ['a', 'c']);
});
