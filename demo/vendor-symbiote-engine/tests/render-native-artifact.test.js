import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  normalizeRenderArtifact,
  normalizeRenderJob,
  normalizeRenderProvider,
} from '../contracts/render-provider.js';

function renderSelectionReceipt(overrides = {}) {
  return {
    ok: true,
    tier: 'replayable-segment',
    renderer: {
      requested: { allowFallback: false },
      selected: { id: 'vaapi', backend: 'vaapi', available: true, evidence: { probe: 'renderer-identity', rendererIdentity: 'Mesa' } },
      fallbackUsed: false,
    },
    encoder: {
      requested: { allowFallback: false },
      selected: { id: 'vaapi-h264', backend: 'vaapi', codec: 'h264', available: true, evidence: { probe: 'real-encode', encodeOk: true } },
      fallbackUsed: false,
    },
    ...overrides,
  };
}

function nativeSegmentArtifact(overrides = {}) {
  return {
    kind: 'native-segment',
    providerId: 'linux-native-render',
    frames: 60,
    fps: 30,
    durationSec: 2,
    width: 1920,
    height: 1080,
    id: 'seg-0',
    tier: 'replayable-segment',
    container: 'mp4',
    videoCodec: 'h264',
    audioCodec: null,
    dpr: 2,
    pixelFormat: 'yuv420p',
    colorSpace: 'bt709',
    colorPrimaries: 'bt709',
    colorTransfer: 'bt709',
    colorRange: 'tv',
    chromaLocation: 'left',
    frameRate: { num: 30, den: 1 },
    timeBase: { num: 1, den: 30 },
    frameDurationTicks: 1,
    frameRange: { start: 0, end: 59 },
    captureRange: { start: 0, end: 59 },
    prerollFrames: 0,
    postrollFrames: 0,
    frameCount: 60,
    timeRange: { startTicks: 0, endTicks: 59 },
    firstPts: 0,
    lastPts: 59,
    keyframePts: [0, 30],
    settingsHash: 'a'.repeat(64),
    sourceHash: `sha256:${'b'.repeat(64)}`,
    videoExtradataHash: 'c'.repeat(16),
    streamLayoutHash: 'd'.repeat(16),
    mediaRef: 'media://seg-0',
    renderSelectionReceipt: renderSelectionReceipt(),
    continuationEvidence: { mode: 'replay', replayRef: 'replay-0', replayEvidenceHash: 'a'.repeat(16) },
    clockEvidence: { mode: 'wall-clock', rate: 1 },
    cleanupRef: 'cleanup-0',
    proof: { ok: true },
    ...overrides,
  };
}

function validNativeJob(overrides = {}) {
  return {
    id: 'job-1',
    kind: 'native-segment',
    providerId: 'linux-native-render',
    tier: 'replayable-segment',
    logicalRange: { start: 0, end: 59 },
    captureRange: { start: 0, end: 59 },
    prerollFrames: 0,
    postrollFrames: 0,
    continuation: { mode: 'replay', replayRef: 'replay-0', replayEvidenceHash: 'a'.repeat(16) },
    uiClock: { mode: 'wall-clock', rate: 1 },
    viewport: { width: 1920, height: 1080, dpr: 2 },
    frameRate: { num: 30, den: 1 },
    timeBase: { num: 1, den: 30 },
    frameDurationTicks: 1,
    capability: {
      tier: 'replayable-segment',
      renderer: { allowFallback: false },
      encoder: { allowFallback: false },
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
    timeoutMs: 1000,
    cancellationRef: 'cancel-0',
    cleanupRef: 'cleanup-0',
    ...overrides,
  };
}

test('render artifact contract normalizes a native encoded segment with receipts and evidence', () => {
  let artifact = normalizeRenderArtifact(nativeSegmentArtifact());

  assert.equal(artifact.kind, 'native-segment');
  assert.equal(artifact.providerId, 'linux-native-render');
  assert.equal(artifact.frames, 60);
  assert.equal(artifact.fps, 30);
  assert.equal(artifact.durationSec, 2);
  assert.equal(artifact.width, 1920);
  assert.equal(artifact.height, 1080);
  assert.equal(artifact.version, 'native-segment/1');
  assert.equal(artifact.tier, 'replayable-segment');
  assert.equal(artifact.frameDurationTicks, 1);
  assert.equal(artifact.mediaRef, 'media://seg-0');
  assert.equal(artifact.renderSelectionReceipt.ok, true);
  assert.equal(artifact.renderSelectionReceipt.renderer.selected.backend, 'vaapi');
  assert.deepEqual(artifact.continuationEvidence, { mode: 'replay', replayRef: 'replay-0', replayEvidenceHash: 'a'.repeat(16) });
  assert.deepEqual(artifact.clockEvidence, { mode: 'wall-clock', rate: 1 });
  assert.equal(artifact.cleanupRef, 'cleanup-0');
  assert.equal(artifact.videoExtradataHash, 'c'.repeat(16));
  assert.equal(artifact.streamLayoutHash, 'd'.repeat(16));
  // The logical, capture, and roll windows survive onto the artifact.
  assert.deepEqual(artifact.frameRange, { start: 0, end: 59 });
  assert.deepEqual(artifact.captureRange, { start: 0, end: 59 });
  assert.equal(artifact.prerollFrames, 0);
  assert.equal(artifact.postrollFrames, 0);
});

test('native segment artifact cross-checks the common frame count against the segment', () => {
  assert.throws(
    () => normalizeRenderArtifact(nativeSegmentArtifact({ frames: 59 })),
    /renderArtifact\.frames: must equal segment frameCount 60/,
  );
});

test('native segment artifact rejects fractional frames/dims before the rounded cross-check can hide them', () => {
  // 9.6 would Math.round to 10 and spuriously satisfy frames === frameCount 10.
  assert.throws(
    () => normalizeRenderArtifact(nativeSegmentArtifact({
      frames: 9.6,
      frameCount: 10,
      frameRange: { start: 0, end: 9 },
      lastPts: 9,
      timeRange: { startTicks: 0, endTicks: 9 },
      keyframePts: [0],
    })),
    /renderArtifact\.frames: must be a positive integer/,
  );
  assert.throws(
    () => normalizeRenderArtifact(nativeSegmentArtifact({ width: 1919.4 })),
    /renderArtifact\.width: must be a positive integer/,
  );
  assert.throws(
    () => normalizeRenderArtifact(nativeSegmentArtifact({ height: 1079.5 })),
    /renderArtifact\.height: must be a positive integer/,
  );
  assert.throws(
    () => normalizeRenderArtifact(nativeSegmentArtifact({ fps: Number.NaN })),
    /renderArtifact\.fps: must be a positive number/,
  );
});

test('native segment artifact rejects fps that drifts from the frameRate cadence but accepts NTSC 30000/1001', () => {
  assert.throws(
    () => normalizeRenderArtifact(nativeSegmentArtifact({ fps: 29 })),
    /renderArtifact\.fps: must match frameRate cadence 30\/1/,
  );
  // 30000/1001 (~29.97) fps must be accepted, not rejected by brittle exact math.
  let ntsc = normalizeRenderArtifact(nativeSegmentArtifact({
    fps: 30000 / 1001,
    frameRate: { num: 30000, den: 1001 },
    timeBase: { num: 1, den: 30000 },
    frameDurationTicks: 1001,
    durationSec: 60 * 1001 / 30000,
    lastPts: 59 * 1001,
    timeRange: { startTicks: 0, endTicks: 59 * 1001 },
    keyframePts: [0, 30 * 1001],
  }));
  assert.deepEqual(ntsc.frameRate, { num: 30000, den: 1001 });
});

test('native segment artifact requires an opaque master media reference', () => {
  assert.throws(
    () => normalizeRenderArtifact(nativeSegmentArtifact({ mediaRef: '' })),
    /renderArtifact\.mediaRef: is required/,
  );
});

test('native segment artifact requires the selection receipt, continuation, clock, cleanup, and proof', () => {
  assert.throws(
    () => normalizeRenderArtifact(nativeSegmentArtifact({ renderSelectionReceipt: undefined })),
    /renderArtifact\.renderSelectionReceipt: must be an object/,
  );
  assert.throws(
    () => normalizeRenderArtifact(nativeSegmentArtifact({ continuationEvidence: { mode: 'checkpoint' } })),
    /renderArtifact\.continuationEvidence\.mode: must be "replay" for replayable-segment/,
  );
  assert.throws(
    () => normalizeRenderArtifact(nativeSegmentArtifact({ clockEvidence: { mode: 'wall-clock', rate: 0 } })),
    /renderArtifact\.clockEvidence\.rate: must be a positive number/,
  );
  assert.throws(
    () => normalizeRenderArtifact(nativeSegmentArtifact({ cleanupRef: '' })),
    /renderArtifact\.cleanupRef: is required/,
  );
  assert.throws(
    () => normalizeRenderArtifact(nativeSegmentArtifact({ proof: undefined })),
    /renderArtifact\.proof: must be an object/,
  );
});

test('native segment artifact rejects a tier that disagrees with the provider/job context tier', () => {
  assert.throws(
    () => normalizeRenderArtifact(nativeSegmentArtifact(), { tier: 'checkpointed-deterministic' }),
    /renderArtifact\.tier: must equal provider\/job tier "checkpointed-deterministic"/,
  );
  let ok = normalizeRenderArtifact(nativeSegmentArtifact(), { tier: 'replayable-segment' });
  assert.equal(ok.tier, 'replayable-segment');
});

test('native segment artifact still enforces segment-level PTS validation', () => {
  assert.throws(
    () => normalizeRenderArtifact(nativeSegmentArtifact({ keyframePts: [0, 30, 30] })),
    /renderArtifact\.segment\.keyframePts\[2\]: must be strictly ascending and unique/,
  );
});

test('native segment artifact rejects a selection receipt whose tier disagrees with the segment (repro #3)', () => {
  assert.throws(
    () => normalizeRenderArtifact(nativeSegmentArtifact({
      renderSelectionReceipt: renderSelectionReceipt({ tier: 'checkpointed-deterministic' }),
    })),
    /renderArtifact\.renderSelectionReceipt\.tier: must equal segment tier "replayable-segment"/,
  );
});

test('native segment artifact rejects an un-ok receipt and unproven or missing selected candidates (repro #4)', () => {
  assert.throws(
    () => normalizeRenderArtifact(nativeSegmentArtifact({
      renderSelectionReceipt: renderSelectionReceipt({ ok: false }),
    })),
    /renderArtifact\.renderSelectionReceipt\.ok: must be true/,
  );
  assert.throws(
    () => normalizeRenderArtifact(nativeSegmentArtifact({
      renderSelectionReceipt: renderSelectionReceipt({
        encoder: { requested: { allowFallback: false }, selected: null, fallbackUsed: false },
      }),
    })),
    /renderArtifact\.renderSelectionReceipt\.encoder\.selected: is required/,
  );
  assert.throws(
    () => normalizeRenderArtifact(nativeSegmentArtifact({
      renderSelectionReceipt: renderSelectionReceipt({
        renderer: {
          requested: { allowFallback: false },
          selected: { id: 'idle', backend: 'vaapi', available: true, evidence: { probe: 'device-present' } },
          fallbackUsed: false,
        },
      }),
    })),
    /renderArtifact\.renderSelectionReceipt\.renderer\.selected: must be a semantically proven/,
  );
});

test('native segment artifact rejects a receipt encoder codec that disagrees with the video codec', () => {
  assert.throws(
    () => normalizeRenderArtifact(nativeSegmentArtifact({
      renderSelectionReceipt: renderSelectionReceipt({
        encoder: {
          requested: { allowFallback: false },
          selected: { id: 'vaapi-hevc', backend: 'vaapi', codec: 'hevc', available: true, evidence: { probe: 'real-encode', encodeOk: true } },
          fallbackUsed: false,
        },
      }),
    })),
    /renderArtifact\.renderSelectionReceipt\.encoder\.selected\.codec: must equal artifact videoCodec "h264"/,
  );
});

test('native segment artifact enforces requested backend and explicit fallback semantics', () => {
  let receipt = renderSelectionReceipt();
  receipt.renderer.requested = { requiredBackend: 'vaapi', allowFallback: false };
  receipt.renderer.selected = {
    id: 'software',
    backend: 'software',
    available: true,
    evidence: { probe: 'renderer-identity', rendererIdentity: 'llvmpipe' },
  };
  assert.throws(
    () => normalizeRenderArtifact(nativeSegmentArtifact({ renderSelectionReceipt: receipt })),
    /renderArtifact\.renderSelectionReceipt\.renderer\.selected: does not satisfy the requested backend/,
  );

  let explicitFallback = renderSelectionReceipt();
  explicitFallback.renderer.requested = { requiredBackend: 'vaapi', allowFallback: true };
  explicitFallback.renderer.selected = {
    id: 'software',
    backend: 'software',
    available: true,
    evidence: { probe: 'renderer-identity', rendererIdentity: 'llvmpipe' },
  };
  explicitFallback.renderer.fallbackUsed = true;
  assert.doesNotThrow(
    () => normalizeRenderArtifact(nativeSegmentArtifact({ renderSelectionReceipt: explicitFallback })),
  );
});

test('native segment artifact requires the proven encoder receipt to name its codec', () => {
  let receipt = renderSelectionReceipt();
  delete receipt.encoder.selected.codec;
  assert.throws(
    () => normalizeRenderArtifact(nativeSegmentArtifact({ renderSelectionReceipt: receipt })),
    /renderArtifact\.renderSelectionReceipt\.encoder\.selected\.codec: is required/,
  );
});

test('native segment artifact rejects a fallbackUsed that contradicts a no-fallback role', () => {
  assert.throws(
    () => normalizeRenderArtifact(nativeSegmentArtifact({
      renderSelectionReceipt: renderSelectionReceipt({
        encoder: {
          requested: { allowFallback: false },
          selected: { id: 'vaapi-h264', backend: 'vaapi', codec: 'h264', available: true, evidence: { probe: 'real-encode', encodeOk: true } },
          fallbackUsed: true,
        },
      }),
    })),
    /renderArtifact\.renderSelectionReceipt\.encoder\.fallbackUsed: must be false when the selected candidate satisfies the request/,
  );
});

test('native segment artifact binds clock evidence to the tier and rejects sped-up wall clocks (repro #5)', () => {
  assert.throws(
    () => normalizeRenderArtifact(nativeSegmentArtifact({
      clockEvidence: { mode: 'render-time', rate: 4 },
    })),
    /renderArtifact\.clockEvidence: must be wall-clock at rate 1 for replayable-segment/,
  );
  // A checkpointed non-1x render clock needs an equivalence proof ref.
  let checkpointed = nativeSegmentArtifact({
    tier: 'checkpointed-deterministic',
    continuationEvidence: { mode: 'checkpoint', checkpointRef: 'ckpt-0', checkpointHash: 'f'.repeat(16) },
    clockEvidence: { mode: 'render-time', rate: 2, clockEquivalenceProofRef: 'clock-proof-0' },
    renderSelectionReceipt: renderSelectionReceipt({ tier: 'checkpointed-deterministic' }),
  });
  let ok = normalizeRenderArtifact(checkpointed);
  assert.deepEqual(ok.clockEvidence, { mode: 'render-time', rate: 2, clockEquivalenceProofRef: 'clock-proof-0' });
  assert.throws(
    () => normalizeRenderArtifact(nativeSegmentArtifact({
      tier: 'checkpointed-deterministic',
      continuationEvidence: { mode: 'checkpoint', checkpointRef: 'ckpt-0', checkpointHash: 'f'.repeat(16) },
      clockEvidence: { mode: 'render-time', rate: 2 },
      renderSelectionReceipt: renderSelectionReceipt({ tier: 'checkpointed-deterministic' }),
    })),
    /renderArtifact\.clockEvidence\.clockEquivalenceProofRef: is required/,
  );
  // A checkpointed wall-clock@1x artifact keeps clockEquivalenceProofRef optional but still strict when present.
  assert.throws(
    () => normalizeRenderArtifact(nativeSegmentArtifact({
      tier: 'checkpointed-deterministic',
      continuationEvidence: { mode: 'checkpoint', checkpointRef: 'ckpt-0', checkpointHash: 'f'.repeat(16) },
      clockEvidence: { mode: 'wall-clock', rate: 1, clockEquivalenceProofRef: { ref: 'x' } },
      renderSelectionReceipt: renderSelectionReceipt({ tier: 'checkpointed-deterministic' }),
    })),
    /renderArtifact\.clockEvidence\.clockEquivalenceProofRef: must be a portable string token, not an object/,
  );
});

test('native segment artifact rejects object/function refs instead of coercing them (repro #6)', () => {
  assert.throws(
    () => normalizeRenderArtifact(nativeSegmentArtifact({ mediaRef: { url: 'x' } })),
    /renderArtifact\.mediaRef: must be a portable string token, not an object/,
  );
  assert.throws(
    () => normalizeRenderArtifact(nativeSegmentArtifact({ cleanupRef: () => {} })),
    /renderArtifact\.cleanupRef: must be a portable string token, not a function/,
  );
  assert.throws(
    () => normalizeRenderArtifact(nativeSegmentArtifact({
      continuationEvidence: { mode: 'replay', replayRef: { id: 'r' }, replayEvidenceHash: 'a'.repeat(16) },
    })),
    /renderArtifact\.continuationEvidence\.replayRef: must be a portable string token, not an object/,
  );
});

test('native segment artifact rejects a duration that disagrees with the frame cadence (repro #7)', () => {
  assert.throws(
    () => normalizeRenderArtifact(nativeSegmentArtifact({
      frames: 2,
      frameCount: 2,
      frameRange: { start: 0, end: 1 },
      captureRange: { start: 0, end: 1 },
      lastPts: 1,
      timeRange: { startTicks: 0, endTicks: 1 },
      keyframePts: [0],
      durationSec: 999,
    })),
    /renderArtifact\.durationSec: must equal frameCount\*frameDurationTicks\*timeBase/,
  );
  assert.throws(
    () => normalizeRenderArtifact(nativeSegmentArtifact({ durationSec: 2.02 })),
    /renderArtifact\.durationSec: must equal frameCount\*frameDurationTicks\*timeBase/,
  );
});

test('native segment artifact rejects a failed proof (repro: proof.ok:false)', () => {
  assert.throws(
    () => normalizeRenderArtifact(nativeSegmentArtifact({ proof: { ok: false, errors: ['x'] } })),
    /renderArtifact\.proof\.ok: must be true/,
  );
});

test('native segment artifact rejects a continuation that carries wrong-tier refs', () => {
  assert.throws(
    () => normalizeRenderArtifact(nativeSegmentArtifact({
      continuationEvidence: {
        mode: 'replay',
        replayRef: 'replay-0',
        replayEvidenceHash: 'a'.repeat(16),
        checkpointRef: 'ckpt-x',
      },
    })),
    /renderArtifact\.continuationEvidence: must not carry checkpoint refs for replayable-segment/,
  );
});

test('native segment artifact cross-checks against the originating job and rejects a mismatch', () => {
  let job = normalizeRenderJob(validNativeJob({
    sourceHash: `sha256:${'b'.repeat(64)}`,
    settingsHash: 'a'.repeat(64),
  }));
  let ok = normalizeRenderArtifact(nativeSegmentArtifact(), { job });
  assert.equal(ok.tier, 'replayable-segment');
  assert.deepEqual(ok.captureRange, { start: 0, end: 59 });

  assert.throws(
    () => normalizeRenderArtifact(nativeSegmentArtifact({ cleanupRef: 'other-cleanup' }), { job }),
    /renderArtifact\.cleanupRef: must equal job cleanupRef/,
  );
  let widerJob = normalizeRenderJob(validNativeJob({
    logicalRange: { start: 0, end: 59 },
    captureRange: { start: 0, end: 70 },
    prerollFrames: 0,
    postrollFrames: 11,
    sourceHash: `sha256:${'b'.repeat(64)}`,
    settingsHash: 'a'.repeat(64),
  }));
  assert.throws(
    () => normalizeRenderArtifact(nativeSegmentArtifact(), { job: widerJob }),
    /renderArtifact\.captureRange: must equal job captureRange/,
  );

  let policyJob = normalizeRenderJob(validNativeJob({
    capability: {
      tier: 'replayable-segment',
      renderer: { requiredBackend: 'vaapi', allowFallback: false },
      encoder: { requiredBackend: 'vaapi', requiredCodec: 'h264', allowFallback: false },
    },
    sourceHash: `sha256:${'b'.repeat(64)}`,
    settingsHash: 'a'.repeat(64),
  }));
  assert.throws(
    () => normalizeRenderArtifact(nativeSegmentArtifact(), { job: policyJob }),
    /renderArtifact\.renderSelectionReceipt\.renderer\.requested: must equal the job capability request/,
  );

  assert.throws(
    () => normalizeRenderArtifact(nativeSegmentArtifact({
      continuationEvidence: {
        mode: 'replay',
        replayRef: 'replay-0',
        replayEvidenceHash: 'f'.repeat(16),
      },
    }), { job }),
    /renderArtifact\.continuationEvidence: refs and hashes must match the job continuation/,
  );
});

test('checkpointed artifact clock proof must match the originating job proof', () => {
  let checkpointJob = normalizeRenderJob(validNativeJob({
    tier: 'checkpointed-deterministic',
    continuation: { mode: 'checkpoint', checkpointRef: 'ckpt-0', checkpointHash: 'e'.repeat(16) },
    uiClock: { mode: 'render-time', rate: 2, clockEquivalenceProofRef: 'clock-proof-a' },
    capability: {
      tier: 'checkpointed-deterministic',
      renderer: { allowFallback: false },
      encoder: { allowFallback: false },
    },
    sourceHash: `sha256:${'b'.repeat(64)}`,
    settingsHash: 'a'.repeat(64),
  }));
  let checkpointArtifact = nativeSegmentArtifact({
    tier: 'checkpointed-deterministic',
    continuationEvidence: { mode: 'checkpoint', checkpointRef: 'ckpt-0', checkpointHash: 'e'.repeat(16) },
    clockEvidence: { mode: 'render-time', rate: 2, clockEquivalenceProofRef: 'clock-proof-b' },
    renderSelectionReceipt: renderSelectionReceipt({ tier: 'checkpointed-deterministic' }),
  });
  assert.throws(
    () => normalizeRenderArtifact(checkpointArtifact, { job: checkpointJob }),
    /renderArtifact\.clockEvidence: must match the complete job uiClock evidence/,
  );
});

test('native segment render job delegates to the strict job normalizer and preserves identity', () => {
  let job = normalizeRenderJob(validNativeJob());
  assert.equal(job.id, 'job-1');
  assert.equal(job.kind, 'native-segment');
  assert.equal(job.providerId, 'linux-native-render');
  assert.equal(job.tier, 'replayable-segment');
  assert.deepEqual(job.logicalRange, { start: 0, end: 59 });
  assert.deepEqual(job.continuation, { mode: 'replay', replayRef: 'replay-0', replayEvidenceHash: 'a'.repeat(16) });
  assert.equal(job.cancellationRef, 'cancel-0');
});

test('native segment render job fails closed when a required contract group is missing', () => {
  assert.throws(
    () => normalizeRenderJob({ id: 'job-1', kind: 'native-segment', providerId: 'linux-native-render', tier: 'replayable-segment' }),
    /renderJob\.logicalRange: must be an object/,
  );
  assert.throws(
    () => normalizeRenderJob(validNativeJob({ captureRange: { start: 5, end: 59 } })),
    /renderJob\.captureRange\.start: must be <= logicalRange\.start/,
  );
});

test('provider and job carry an optional validated execution tier', () => {
  let provider = normalizeRenderProvider({
    id: 'linux-native-render',
    kind: 'native-segment',
    tier: 'checkpointed-deterministic',
    execute: async () => ({}),
  });
  assert.equal(provider.kind, 'native-segment');
  assert.equal(provider.tier, 'checkpointed-deterministic');

  let untiered = normalizeRenderProvider({ id: 'p', kind: 'screencast', execute: async () => ({}) });
  assert.equal('tier' in untiered, false);
  assert.throws(
    () => normalizeRenderProvider({ id: 'p', kind: 'screencast', tier: 'parallel', execute: async () => ({}) }),
    /renderProvider\.tier: must be one of/,
  );
});
