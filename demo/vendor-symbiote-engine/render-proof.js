import { captionTranscriptDurationSec } from './render-captions.js';
import { cleanString, finiteNonNegativeNumber, finitePositiveNumber } from './render-utils.js';
import { createRenderFrameCompletionTracker } from './render-workers.js';
import {
  normalizeNativeSegment,
  normalizeSeamBoundary,
  normalizeSeamPolicy,
} from './contracts/render-segment.js';

export const RENDER_FRAME_COMPLETENESS_PROOF_VERSION = 'render-frame-completeness-v1';
export const RENDER_PERFORMANCE_PROOF_VERSION = 'render-performance-v1';
export const RENDER_WORKER_CAPACITY_PROOF_VERSION = 'render-worker-capacity-v1';
export const RENDER_SEGMENT_SEAM_PROOF_VERSION = 'render-segment-seam-v1';
export const RENDER_STREAM_PTS_PROOF_VERSION = 'render-stream-pts-v1';

function positiveInteger(value, path) {
  let number = Number(value);
  if (!Number.isInteger(number) || number <= 0) throw new TypeError(`${path} must be a positive integer`);
  return number;
}

function frameIndex(value) {
  return Number(typeof value === 'object' && value !== null ? value.index : value);
}

export function buildRenderFrameCompletenessProof(options = {}) {
  let expectedFrameCount = positiveInteger(options.expectedFrameCount, 'expectedFrameCount');
  let frames = Array.isArray(options.frames) ? options.frames : [];
  let tracker = createRenderFrameCompletionTracker(expectedFrameCount);
  let seen = new Set();
  let duplicateFrames = [];
  let outOfRangeFrames = [];
  let reorderedTransitions = [];
  let previous = -1;
  for (let [position, item] of frames.entries()) {
    let index = frameIndex(item);
    if (!Number.isInteger(index) || index < 0 || index >= expectedFrameCount) {
      outOfRangeFrames.push({ position, index: Number.isFinite(index) ? index : null });
      continue;
    }
    if (index < previous) reorderedTransitions.push({ position, previous, index });
    previous = index;
    if (seen.has(index)) {
      duplicateFrames.push(index);
      continue;
    }
    seen.add(index);
    tracker.mark(index);
  }
  let missingFrames = [];
  for (let index = 0; index < expectedFrameCount; index += 1) {
    if (!seen.has(index)) missingFrames.push(index);
  }
  let errors = [];
  if (missingFrames.length) errors.push(`${missingFrames.length} frame indices are missing`);
  if (duplicateFrames.length) errors.push(`${duplicateFrames.length} frame indices are duplicated`);
  if (outOfRangeFrames.length) errors.push(`${outOfRangeFrames.length} frame indices are outside the expected range`);
  if (reorderedTransitions.length) errors.push(`${reorderedTransitions.length} frame transitions are reordered`);
  return {
    version: RENDER_FRAME_COMPLETENESS_PROOF_VERSION,
    ok: errors.length === 0,
    errors,
    expectedFrameCount,
    observedFrameCount: frames.length,
    uniqueFrameCount: seen.size,
    contiguousFrameCount: tracker.contiguousFrames,
    missingFrames,
    duplicateFrames,
    outOfRangeFrames,
    reorderedTransitions,
  };
}

function peakSample(samples, field) {
  return (Array.isArray(samples) ? samples : []).reduce((peak, sample) => {
    let value = finiteNonNegativeNumber(sample?.[field], 0);
    return Math.max(peak, value);
  }, 0);
}

export function buildRenderPerformanceProof(options = {}) {
  let frameCount = positiveInteger(options.frameCount, 'frameCount');
  let fps = finitePositiveNumber(options.fps, 0);
  let captureDurationMs = finitePositiveNumber(options.captureDurationMs, 0);
  let encodeDurationMs = finitePositiveNumber(options.encodeDurationMs, 0);
  if (!fps) throw new TypeError('fps must be positive');
  if (!captureDurationMs) throw new TypeError('captureDurationMs must be positive');
  if (!encodeDurationMs) throw new TypeError('encodeDurationMs must be positive');
  let thresholds = {
    minCaptureFps: finitePositiveNumber(options.thresholds?.minCaptureFps, fps),
    minEncodeFps: finitePositiveNumber(options.thresholds?.minEncodeFps, fps),
    maxCaptureRealtimeRatio: finitePositiveNumber(options.thresholds?.maxCaptureRealtimeRatio, 1),
    maxPeakRssBytes: finitePositiveNumber(options.thresholds?.maxPeakRssBytes, Number.MAX_SAFE_INTEGER),
    maxPreviewWorkingSetBytes: finitePositiveNumber(options.thresholds?.maxPreviewWorkingSetBytes, Number.MAX_SAFE_INTEGER),
  };
  let peakRssBytes = Math.max(
    finiteNonNegativeNumber(options.peakRssBytes, 0),
    peakSample(options.resourceSamples, 'rssBytes'),
  );
  let peakPreviewWorkingSetBytes = Math.max(
    finiteNonNegativeNumber(options.peakPreviewWorkingSetBytes, 0),
    peakSample(options.previewSamples, 'decodedBytes'),
  );
  let resourceSamplesRecorded = peakRssBytes > 0;
  let previewSamplesRecorded = peakPreviewWorkingSetBytes > 0;
  let mediaDurationMs = frameCount / fps * 1000;
  let captureFps = frameCount / (captureDurationMs / 1000);
  let encodeFps = frameCount / (encodeDurationMs / 1000);
  let captureRealtimeRatio = captureDurationMs / mediaDurationMs;
  let checks = {
    captureFps: captureFps >= thresholds.minCaptureFps,
    encodeFps: encodeFps >= thresholds.minEncodeFps,
    captureRealtimeRatio: captureRealtimeRatio <= thresholds.maxCaptureRealtimeRatio,
    peakRssBytes: peakRssBytes <= thresholds.maxPeakRssBytes,
    peakPreviewWorkingSetBytes: peakPreviewWorkingSetBytes <= thresholds.maxPreviewWorkingSetBytes,
    ...(options.requireResourceSamples === true ? {
      resourceSamplesRecorded,
      previewSamplesRecorded,
    } : {}),
  };
  let errors = Object.entries(checks)
    .filter(([, passed]) => !passed)
    .map(([name]) => `${name} exceeds its locked threshold`);
  return {
    version: RENDER_PERFORMANCE_PROOF_VERSION,
    ok: errors.length === 0,
    errors,
    frameCount,
    fps,
    mediaDurationMs: Math.round(mediaDurationMs),
    captureDurationMs: Math.round(captureDurationMs),
    encodeDurationMs: Math.round(encodeDurationMs),
    captureFps: Math.round(captureFps * 1000) / 1000,
    encodeFps: Math.round(encodeFps * 1000) / 1000,
    captureRealtimeRatio: Math.round(captureRealtimeRatio * 1000) / 1000,
    peakRssBytes,
    peakPreviewWorkingSetBytes,
    resourceSamplesRecorded,
    previewSamplesRecorded,
    thresholds,
    checks,
  };
}

export function buildRenderWorkerCapacityProof(options = {}) {
  let requestedWorkers = positiveInteger(options.requestedWorkers, 'requestedWorkers');
  let totalMemoryBytes = finitePositiveNumber(options.totalMemoryBytes, 0);
  let availableMemoryBytes = finitePositiveNumber(options.availableMemoryBytes, 0);
  let systemReserveBytes = finiteNonNegativeNumber(options.systemReserveBytes, 0);
  let fixedOverheadBytes = finiteNonNegativeNumber(options.fixedOverheadBytes, 0);
  let perWorkerPeakRssBytes = finitePositiveNumber(options.perWorkerPeakRssBytes, 0);
  let safetyFactor = finitePositiveNumber(options.safetyFactor, 1.25);
  let maxPerWorkerRssBytes = finitePositiveNumber(options.maxPerWorkerRssBytes, Number.MAX_SAFE_INTEGER);
  if (!totalMemoryBytes) throw new TypeError('totalMemoryBytes must be positive');
  if (!availableMemoryBytes) throw new TypeError('availableMemoryBytes must be positive');
  if (!perWorkerPeakRssBytes) throw new TypeError('perWorkerPeakRssBytes must be positive');
  if (safetyFactor < 1) throw new TypeError('safetyFactor must be at least 1');
  let usableMemoryBytes = Math.max(0, Math.min(
    availableMemoryBytes,
    totalMemoryBytes - systemReserveBytes,
  ));
  let guardedPerWorkerBytes = Math.ceil(perWorkerPeakRssBytes * safetyFactor);
  let requiredMemoryBytes = fixedOverheadBytes + guardedPerWorkerBytes * requestedWorkers;
  let maxAdmittedWorkers = Math.max(0, Math.floor(
    (usableMemoryBytes - fixedOverheadBytes) / guardedPerWorkerBytes,
  ));
  let checks = {
    perWorkerPeakRssBytes: perWorkerPeakRssBytes <= maxPerWorkerRssBytes,
    availableMemoryBytes: requiredMemoryBytes <= usableMemoryBytes,
  };
  let errors = Object.entries(checks)
    .filter(([, passed]) => !passed)
    .map(([name]) => `${name} exceeds its locked threshold`);
  return {
    version: RENDER_WORKER_CAPACITY_PROOF_VERSION,
    ok: errors.length === 0,
    errors,
    requestedWorkers,
    admittedWorkers: Math.min(requestedWorkers, maxAdmittedWorkers),
    maxAdmittedWorkers,
    totalMemoryBytes,
    availableMemoryBytes,
    systemReserveBytes,
    usableMemoryBytes,
    fixedOverheadBytes,
    perWorkerPeakRssBytes,
    safetyFactor,
    guardedPerWorkerBytes,
    requiredMemoryBytes,
    maxPerWorkerRssBytes,
    checks,
  };
}

export function normalizeProbeStreams(ffprobe = {}) {
  return Array.isArray(ffprobe?.streams) ? ffprobe.streams : [];
}

export function findProbeStream(ffprobe = {}, codecType = '') {
  return normalizeProbeStreams(ffprobe).find((stream) => stream?.codec_type === codecType) || null;
}

export function streamDurationSec(stream = {}, ffprobe = {}) {
  let safeStream = stream || {};
  return finitePositiveNumber(
    safeStream.duration,
    finitePositiveNumber(safeStream.tags?.DURATION, finitePositiveNumber(ffprobe?.format?.duration, 0)),
  );
}

export function renderAuthorityDurationSec({
  audio = {},
  frameArtifact = {},
  durationMs = 0,
  defaultDurationMs = 0,
} = {}) {
  let audioDuration = finitePositiveNumber(audio?.mix?.durationMs, 0) / 1000;
  if (audioDuration > 0) return audioDuration;
  let frameDuration = finitePositiveNumber(frameArtifact?.durationSec, 0);
  if (frameDuration > 0) return frameDuration;
  return finitePositiveNumber(durationMs, defaultDurationMs) / 1000;
}

export function durationDriftMs(actualSec, expectedSec) {
  if (!Number.isFinite(actualSec) || actualSec <= 0 || !Number.isFinite(expectedSec) || expectedSec <= 0) return null;
  return Math.abs(actualSec - expectedSec) * 1000;
}

export function countClipOverlaps(clips = [], thresholdMs = 0) {
  let sorted = (Array.isArray(clips) ? clips : []).slice().sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs);
  let overlaps = 0;
  let previousEndMs = -Infinity;
  for (let clip of sorted) {
    if (clip.startMs < previousEndMs - Math.max(0, Number(thresholdMs) || 0)) overlaps += 1;
    previousEndMs = Math.max(previousEndMs, clip.endMs);
  }
  return overlaps;
}

function defaultSpeakerForIndex(index) {
  return `speaker-${index}`;
}

function defaultLayerIdForClip(clip) {
  return `voice:${clip.persona}`;
}

function defaultLayerLabelForClip(clip) {
  return `${clip.persona} voice`;
}

function optionalNonNegativeNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  return finiteNonNegativeNumber(value, null);
}

function normalizeCueTiming(value = {}) {
  return {
    startMs: finiteNonNegativeNumber(value.startMs, 0) || 0,
    endMs: optionalNonNegativeNumber(value.endMs),
    durationMs: optionalNonNegativeNumber(value.durationMs),
    requestedStartMs: optionalNonNegativeNumber(value.requestedStartMs),
    speaker: cleanString(value.speaker, ''),
  };
}

function clipDurationMs(item = {}, timing = {}, estimatedTurnMs = 0) {
  return Math.max(
    1,
    finitePositiveNumber(
      item.durationMs,
      finitePositiveNumber(timing.durationMs, finitePositiveNumber(estimatedTurnMs, 1)),
    ),
  );
}

export function buildRenderAudioLayerProof(options = {}) {
  let {
    items = [],
    cueTimings = [],
    sequenceMode = 'sequential',
    mixDurationMs = null,
    estimatedTurnMs = 0,
    thresholdMs = 0,
    fallbackSpeakerForIndex = defaultSpeakerForIndex,
    layerIdForClip = defaultLayerIdForClip,
    layerLabelForClip = defaultLayerLabelForClip,
    layerType = 'voice',
  } = options || {};
  let safeItems = Array.isArray(items) ? items : [];
  if (!safeItems.length) return null;
  let safeCueTimings = Array.isArray(cueTimings) ? cueTimings.map(normalizeCueTiming) : [];
  let safeThresholdMs = Math.max(0, Number(thresholdMs) || 0);
  let safeSequenceMode = cleanString(sequenceMode, 'sequential') || 'sequential';
  let errors = [];
  if (safeCueTimings.length !== safeItems.length) {
    errors.push('audio layer proof requires matching item and cue timing counts');
  }

  let cursorMs = 0;
  for (let index = 0; index < safeItems.length; index += 1) {
    let item = safeItems[index] || {};
    let timing = safeCueTimings[index] || normalizeCueTiming({});
    let durationMs = clipDurationMs(item, timing, estimatedTurnMs);
    if (safeSequenceMode === 'sequential' && timing.requestedStartMs !== null) {
      let driftMs = timing.requestedStartMs - cursorMs;
      if (driftMs < -safeThresholdMs) {
        errors.push(`overlap audio timing is not supported by this render path: turn ${index + 1} starts ${Math.round(Math.abs(driftMs))}ms before the sequential cursor`);
      }
      if (driftMs > safeThresholdMs) {
        errors.push(`gapped audio timing is not supported by this render path: turn ${index + 1} starts ${Math.round(driftMs)}ms after the sequential cursor`);
      }
    }
    cursorMs += durationMs;
  }

  let clips = safeItems.map((item = {}, index) => {
    let timing = safeCueTimings[index] || normalizeCueTiming({});
    let fallbackSpeaker = cleanString(fallbackSpeakerForIndex(index, item, timing), defaultSpeakerForIndex(index));
    let persona = cleanString(item.persona || timing.speaker, fallbackSpeaker) || fallbackSpeaker;
    let startMs = timing.startMs;
    let durationMs = clipDurationMs(item, timing, estimatedTurnMs);
    let endMs = Math.max(startMs + durationMs, finiteNonNegativeNumber(timing.endMs, startMs + durationMs));
    return {
      id: `voice-clip-${index}`,
      index,
      cueIndex: index,
      itemIndex: index,
      persona,
      speaker: persona,
      voiceRef: item.voiceRef,
      artifactId: item.artifactId,
      sha256: item.sha256,
      cacheHit: item.cacheHit === true,
      startMs,
      endMs,
      durationMs,
      text: item.text,
    };
  });
  let overlapCount = countClipOverlaps(clips, safeThresholdMs);
  if (safeSequenceMode === 'sequential' && overlapCount > 0) {
    errors.push(`overlap audio timing is not supported by this render path: ${overlapCount} overlapping voice clips`);
  }
  if (safeSequenceMode === 'overlap' && clips.length > 1 && overlapCount <= 0) {
    errors.push('overlap audio sequence requires at least one overlapping voice clip');
  }
  let totalClipDurationMs = clips.reduce((sum, clip) => sum + clip.durationMs, 0);
  let expectedMixDurationMs = safeSequenceMode === 'overlap'
    ? Math.max(...clips.map((clip) => clip.endMs))
    : totalClipDurationMs;
  let resolvedMixDurationMs = Math.max(1, finitePositiveNumber(mixDurationMs, totalClipDurationMs));
  let audioLayerDurationDriftMs = Math.abs(expectedMixDurationMs - resolvedMixDurationMs);
  if (audioLayerDurationDriftMs > safeThresholdMs) {
    errors.push(`speaker layer duration drift ${Math.round(audioLayerDurationDriftMs)}ms exceeds ${Math.round(safeThresholdMs)}ms`);
  }
  let distinctPersonas = [...new Set(clips.map((clip) => clip.persona).filter(Boolean))];
  let distinctVoiceRefs = [...new Set(clips.map((clip) => clip.voiceRef).filter(Boolean))];
  if (distinctPersonas.length > 1 && distinctVoiceRefs.length < 2) {
    errors.push('two-speaker render requires at least two distinct voice refs');
  }
  let layerMap = new Map();
  for (let clip of clips) {
    let key = `${clip.persona}:${clip.voiceRef}`;
    if (!layerMap.has(key)) {
      layerMap.set(key, {
        id: cleanString(layerIdForClip(clip), defaultLayerIdForClip(clip)) || defaultLayerIdForClip(clip),
        type: cleanString(layerType, 'voice') || 'voice',
        label: cleanString(layerLabelForClip(clip), defaultLayerLabelForClip(clip)) || defaultLayerLabelForClip(clip),
        persona: clip.persona,
        speaker: clip.speaker,
        voiceRef: clip.voiceRef,
        clipCount: 0,
        durationMs: 0,
        clips: [],
      });
    }
    let layer = layerMap.get(key);
    layer.clipCount += 1;
    layer.durationMs += clip.durationMs;
    layer.clips.push(clip);
  }
  return {
    ok: errors.length === 0,
    errors,
    sequenceMode: safeSequenceMode,
    overlapCount,
    distinctVoiceRefs,
    totalClipDurationMs,
    mixDurationMs: resolvedMixDurationMs,
    durationDriftMs: Math.round(audioLayerDurationDriftMs),
    speakerLayers: [...layerMap.values()],
  };
}

function sameTimeBase(prev, next) {
  return prev.timeBase.num === next.timeBase.num && prev.timeBase.den === next.timeBase.den;
}

export function buildRenderSegmentSeamProof({ segments = [], policy } = {}) {
  let normalizedPolicy = normalizeSeamPolicy(policy, 'seamPolicy');
  let list = Array.isArray(segments) ? segments : [];
  let normalized = list.map((segment, index) =>
    normalizeNativeSegment(segment, { path: `segments[${index}]` }));
  let seams = [];
  let errors = [];

  for (let index = 0; index < normalized.length - 1; index += 1) {
    let prev = normalized[index];
    let next = normalized[index + 1];
    let rawNext = list[index + 1] || {};
    let boundary = normalizeSeamBoundary(rawNext.boundary ?? {}, `segments[${index + 1}].boundary`);
    let from = prev.id;
    let to = next.id;
    let seamErrors = [];

    if (!sameTimeBase(prev, next)) {
      seamErrors.push('timebase-mismatch');
    } else if (next.firstPts === prev.lastPts) {
      seamErrors.push('duplicate-boundary-pts');
    } else {
      let expectedPts = prev.lastPts + prev.frameDurationTicks;
      if (next.firstPts < expectedPts) seamErrors.push('pts-overlap');
      else if (next.firstPts > expectedPts) seamErrors.push('pts-gap');
    }

    let expectedStart = prev.frameRange.end + 1;
    if (next.frameRange.start < expectedStart) seamErrors.push('frame-overlap');
    else if (next.frameRange.start > expectedStart) seamErrors.push('frame-gap');

    if (boundary.overlapOwner !== normalizedPolicy.owner) {
      seamErrors.push('overlap-ownership-mismatch');
    }

    if (normalizedPolicy.type === 'exact') {
      let identityMatch = Boolean(boundary.boundaryIdentity)
        && boundary.boundaryIdentity === boundary.prevBoundaryIdentity;
      if (boundary.exactPixelsMatch !== true && !identityMatch) {
        seamErrors.push('exact-seam-unproven');
      }
    } else {
      let ssim = boundary.ssim;
      if (!(Number.isFinite(ssim) && ssim >= normalizedPolicy.requiredSsim)) {
        seamErrors.push('perceptual-ssim-below-threshold');
      }
    }

    seams.push({ index, from, to, ok: seamErrors.length === 0, errors: seamErrors });
    for (let seamError of seamErrors) errors.push(`seam ${from}->${to}: ${seamError}`);
  }

  let ownership = evaluateLogicalFrameOwnership(normalized);
  if (ownership) {
    if (ownership.unownedFrames.length) errors.push('logical-frame-unowned');
    if (ownership.doubleOwnedFrames.length) errors.push('logical-frame-double-owned');
  }

  return {
    version: RENDER_SEGMENT_SEAM_PROOF_VERSION,
    ok: errors.length === 0,
    errors,
    policy: normalizedPolicy,
    seams,
    logicalRange: ownership ? ownership.logicalRange : null,
    unownedFrames: ownership ? ownership.unownedFrames : [],
    doubleOwnedFrames: ownership ? ownership.doubleOwnedFrames : [],
  };
}

function evaluateLogicalFrameOwnership(normalized) {
  if (!normalized.length) return null;
  let start = normalized[0].frameRange.start;
  let end = normalized[normalized.length - 1].frameRange.end;
  let unownedFrames = [];
  let doubleOwnedFrames = [];
  for (let frame = start; frame <= end; frame += 1) {
    let owners = 0;
    for (let segment of normalized) {
      if (segment.frameRange.start <= frame && frame <= segment.frameRange.end) owners += 1;
    }
    if (owners === 0) unownedFrames.push(frame);
    else if (owners > 1) doubleOwnedFrames.push(frame);
  }
  return { logicalRange: { start, end }, unownedFrames, doubleOwnedFrames };
}

export function buildRenderStreamPtsProof({ frames = [], ptsStep } = {}) {
  let errors = [];
  let step = Number(ptsStep);
  let validStep = Number.isInteger(step) && step > 0;
  if (!validStep) errors.push('missing-cadence-evidence');

  let list = Array.isArray(frames) ? frames : [];
  if (!list.length) errors.push('empty-frame-stream');
  let ptsSeen = new Set();
  let identitySeen = new Set();
  let indexSeen = new Set();
  let missingIdentities = [];
  let duplicateIdentities = [];
  let invalidIndexes = [];
  let indexGaps = [];
  let invalidPts = [];
  let duplicatePts = [];
  let ptsGaps = [];
  let ptsOverlaps = [];
  let staticRuns = [];
  let previousPts = null;
  let previousIndex = null;
  let previousFrame = null;
  let currentRun = null;

  for (let [position, frame] of list.entries()) {
    let identity = cleanString(frame?.identity ?? frame?.contentDigest, '');
    if (!identity) missingIdentities.push({ position });
    else if (identitySeen.has(identity)) duplicateIdentities.push({ position, identity });
    else identitySeen.add(identity);

    let rawIndex = frame?.index;
    let index = Number(rawIndex);
    let validIndex = Number.isInteger(index) && index >= 0;
    if (!validIndex) {
      invalidIndexes.push({ position, index: Number.isFinite(index) ? index : null });
    } else {
      if (indexSeen.has(index)) indexGaps.push({ position, previous: previousIndex, index, expected: previousIndex === null ? null : previousIndex + 1 });
      else indexSeen.add(index);
      if (previousIndex !== null && index !== previousIndex + 1) {
        indexGaps.push({ position, previous: previousIndex, index, expected: previousIndex + 1 });
      }
      previousIndex = index;
    }

    let rawPts = frame?.pts;
    let pts = Number(rawPts);
    let validPts = Number.isInteger(pts);
    let pixelHash = cleanString(frame?.pixelHash, '');
    if (!validPts) {
      invalidPts.push({ position, pts: Number.isFinite(pts) ? pts : null });
    } else {
      if (ptsSeen.has(pts)) duplicatePts.push({ position, pts });
      else ptsSeen.add(pts);
      if (previousPts !== null && validStep) {
        let expectedPts = previousPts + step;
        if (pts < expectedPts) ptsOverlaps.push({ position, previous: previousPts, pts, expected: expectedPts });
        else if (pts > expectedPts) ptsGaps.push({ position, previous: previousPts, pts, expected: expectedPts });
      }
      previousPts = pts;
    }

    let sharesStatic = previousFrame
      && pixelHash
      && pixelHash === previousFrame.pixelHash;
    if (sharesStatic) {
      if (currentRun && currentRun.pixelHash === pixelHash) {
        currentRun.positions.push(position);
      } else {
        if (currentRun) staticRuns.push(currentRun);
        currentRun = { pixelHash, positions: [previousFrame.position, position] };
      }
    } else if (currentRun) {
      staticRuns.push(currentRun);
      currentRun = null;
    }

    previousFrame = { position, pixelHash };
  }
  if (currentRun) staticRuns.push(currentRun);

  if (missingIdentities.length) errors.push(`${missingIdentities.length} frames are missing an identity`);
  if (duplicateIdentities.length) errors.push(`${duplicateIdentities.length} frames share a duplicate identity`);
  if (invalidIndexes.length) errors.push(`${invalidIndexes.length} frames have an invalid index`);
  if (indexGaps.length) errors.push(`${indexGaps.length} frame indices break the contiguous cadence`);
  if (invalidPts.length) errors.push(`${invalidPts.length} frames have a non-integer PTS`);
  if (duplicatePts.length) errors.push(`${duplicatePts.length} frames share a duplicate PTS`);
  if (ptsGaps.length) errors.push(`${ptsGaps.length} PTS transitions exceed the exact cadence`);
  if (ptsOverlaps.length) errors.push(`${ptsOverlaps.length} PTS transitions fall short of the exact cadence`);

  return {
    version: RENDER_STREAM_PTS_PROOF_VERSION,
    ok: errors.length === 0,
    errors,
    ptsStep: validStep ? step : null,
    frameCount: list.length,
    uniquePtsCount: ptsSeen.size,
    missingIdentities,
    duplicateIdentities,
    invalidIndexes,
    indexGaps,
    invalidPts,
    duplicatePts,
    ptsGaps,
    ptsOverlaps,
    staticRuns: staticRuns.map((run) => ({ pixelHash: run.pixelHash, positions: run.positions, length: run.positions.length })),
  };
}

export function buildRenderAvSyncProof(options = {}) {
  let {
    ffprobe = {},
    audio = {},
    frameArtifact = {},
    transcript = {},
    fps = 1,
    durationMs = 0,
    includeAudio = false,
    frames = [],
    thresholdMs,
    defaultDurationMs = 0,
    expectedVideoCodec = 'h264',
    expectedAudioCodec = 'aac',
  } = options || {};
  let safeFps = Math.max(1, Number(fps) || 1);
  let frameDurationMs = 1000 / safeFps;
  let safeThresholdMs = finitePositiveNumber(thresholdMs, frameDurationMs);
  let videoStream = findProbeStream(ffprobe, 'video');
  let audioStream = findProbeStream(ffprobe, 'audio');
  let expectedDurationSec = renderAuthorityDurationSec({
    audio,
    frameArtifact,
    durationMs,
    defaultDurationMs,
  });
  let videoDurationSec = streamDurationSec(videoStream, ffprobe);
  let audioDurationSec = streamDurationSec(audioStream, ffprobe);
  let captionDurationSec = captionTranscriptDurationSec(transcript);
  let drifts = {
    videoVsAuthorityMs: durationDriftMs(videoDurationSec, expectedDurationSec),
    audioVsAuthorityMs: includeAudio ? durationDriftMs(audioDurationSec, expectedDurationSec) : null,
    videoVsAudioMs: includeAudio ? durationDriftMs(videoDurationSec, audioDurationSec) : null,
    captionsVsAuthorityMs: includeAudio && captionDurationSec > 0
      ? durationDriftMs(captionDurationSec, expectedDurationSec)
      : null,
  };
  let errors = [];
  if (!videoStream) errors.push('missing video stream');
  if (videoStream && expectedVideoCodec && videoStream.codec_name !== expectedVideoCodec) {
    errors.push(`video stream must be ${expectedVideoCodec}, got ${videoStream.codec_name || 'unknown'}`);
  }
  if (includeAudio && !audioStream) errors.push('missing audio stream');
  if (includeAudio && audioStream && expectedAudioCodec && audioStream.codec_name !== expectedAudioCodec) {
    errors.push(`audio stream must be ${expectedAudioCodec}, got ${audioStream.codec_name || 'unknown'}`);
  }
  if (expectedDurationSec <= 0) errors.push('missing positive audio-authority duration');
  for (let [name, value] of Object.entries(drifts)) {
    if (value !== null && value > safeThresholdMs) errors.push(`${name} ${Math.round(value)}ms exceeds ${Math.round(safeThresholdMs)}ms`);
  }
  return {
    ok: errors.length === 0,
    errors,
    expectedDurationMs: Math.round(expectedDurationSec * 1000),
    thresholdMs: Math.round(safeThresholdMs),
    frameDurationMs: Math.round(frameDurationMs * 1000) / 1000,
    fps,
    streams: {
      video: videoStream ? {
        codecName: videoStream.codec_name || '',
        durationMs: Math.round(videoDurationSec * 1000),
        width: Number(videoStream.width || 0),
        height: Number(videoStream.height || 0),
        frames: Number(videoStream.nb_frames || (Array.isArray(frames) ? frames.length : 0) || 0),
      } : null,
      audio: audioStream ? {
        codecName: audioStream.codec_name || '',
        durationMs: Math.round(audioDurationSec * 1000),
        sampleRate: Number(audioStream.sample_rate || 0),
        channels: Number(audioStream.channels || 0),
      } : null,
    },
    driftsMs: Object.fromEntries(Object.entries(drifts).map(([key, value]) => [
      key,
      value === null ? null : Math.round(value),
    ])),
  };
}
