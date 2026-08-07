import {
  accelerationCandidateProven,
  normalizeAccelerationSelection,
  normalizeExecutionTier,
} from './render-capability.js';
import { normalizeNativeSegment, normalizeNativeSegmentJob } from './render-segment.js';

const ARTIFACT_HASH_RE = /^(sha256:)?[A-Fa-f0-9]{8,}$/;
const CLOCK_MODES = new Set(['wall-clock', 'render-time']);

const RENDER_PROVIDER_KINDS = new Set(['screencast', 'native-segment']);
const RENDER_ARTIFACT_KINDS = new Set(['screencast', 'frame-sequence', 'native-segment']);
const AUDIO_PROVIDER_KINDS = new Set(['browser-tts', 'local-tts', 'local-transcribe']);
const RENDER_CAPTURE_TRANSPORTS = new Set(['screenshot', 'attributed-compositor']);

export const ATTRIBUTED_COMPOSITOR_POLICY_VERSION = 'attributed-compositor/1';

function fail(path, message) {
  throw new Error(`${path}: ${message}`);
}

function cleanString(value, fallback = '') {
  let text = String(value ?? fallback ?? '').replace(/\s+/g, ' ').trim();
  return text && text !== 'undefined' && text !== 'null' ? text : String(fallback || '').trim();
}

function requireObject(value, path) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail(path, 'must be an object');
  }
  return value;
}

function portableRef(value, path) {
  if (typeof value === 'function') {
    fail(path, 'must be a portable string token, not a function');
  }
  if (value !== null && typeof value === 'object') {
    fail(path, 'must be a portable string token, not an object');
  }
  let text = cleanString(value, '');
  if (!text) fail(path, 'is required');
  return text;
}

function positiveNumber(value, fallback, path) {
  let number = Number(value ?? fallback);
  if (!Number.isFinite(number) || number <= 0) fail(path, 'must be a positive number');
  return number;
}

function positiveInteger(value, fallback, path) {
  return Math.round(positiveNumber(value, fallback, path));
}

function optionalNonNegativeNumber(value, path) {
  if (value === undefined || value === null || value === '') return undefined;
  let number = Number(value);
  if (!Number.isFinite(number) || number < 0) fail(path, 'must be a non-negative number');
  return number;
}

function optionalNonNegativeInteger(value, path) {
  let number = optionalNonNegativeNumber(value, path);
  return number === undefined ? undefined : Math.round(number);
}

function optionalBoolean(value, path) {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'boolean') fail(path, 'must be a boolean');
  return value;
}

function normalizeKind(value, supported, fallback, path) {
  let kind = cleanString(value, fallback);
  if (!supported.has(kind)) {
    fail(path, `unsupported kind "${kind}". Supported: ${[...supported].join(', ')}`);
  }
  return kind;
}

export function normalizeCaptureTransportKind(value, fallback = 'screenshot') {
  let transport = cleanString(value, fallback) || fallback;
  if (!RENDER_CAPTURE_TRANSPORTS.has(transport)) {
    let error = new Error(
      `renderClock.transport: unsupported transport "${transport}". `
      + `Supported: ${[...RENDER_CAPTURE_TRANSPORTS].join(', ')}`,
    );
    error.code = 'RENDER_TRANSPORT_UNSUPPORTED';
    throw error;
  }
  return transport;
}

function normalizeFrameData(value, path) {
  if (typeof value === 'string') {
    let text = value.trim();
    if (!text) fail(path, 'must be non-empty base64 data');
    return { encoding: 'base64', data: text };
  }
  if (value instanceof ArrayBuffer || ArrayBuffer.isView(value)) {
    if (value.byteLength <= 0) fail(path, 'must be a non-empty byte buffer');
    return { encoding: 'bytes', data: value };
  }
  fail(path, 'must be a base64 string or byte buffer');
}

export function normalizeCompositorFrameEvent(event, expected = {}) {
  requireObject(event, 'compositorFrameEvent');
  let sessionId = cleanString(event.sessionId, '');
  if (!sessionId) fail('compositorFrameEvent.sessionId', 'is required');
  let timestamp = Number(event.timestamp);
  if (!Number.isFinite(timestamp) || timestamp < 0) {
    fail('compositorFrameEvent.timestamp', 'must be a non-negative epoch-millisecond number');
  }
  let width = positiveInteger(event.width, undefined, 'compositorFrameEvent.width');
  let height = positiveInteger(event.height, undefined, 'compositorFrameEvent.height');
  let devicePixelRatio = positiveNumber(
    event.devicePixelRatio ?? event.dpr,
    undefined,
    'compositorFrameEvent.devicePixelRatio',
  );
  let { encoding, data } = normalizeFrameData(event.data ?? event.dataBase64, 'compositorFrameEvent.data');
  if (expected.width != null && width !== expected.width) {
    fail('compositorFrameEvent.width', `must equal fixed capture width ${expected.width}`);
  }
  if (expected.height != null && height !== expected.height) {
    fail('compositorFrameEvent.height', `must equal fixed capture height ${expected.height}`);
  }
  if (expected.devicePixelRatio != null && devicePixelRatio !== expected.devicePixelRatio) {
    fail('compositorFrameEvent.devicePixelRatio', `must equal fixed capture dpr ${expected.devicePixelRatio}`);
  }
  if (expected.sessionId != null && sessionId !== expected.sessionId) {
    fail('compositorFrameEvent.sessionId', `must equal session "${expected.sessionId}"`);
  }
  return { sessionId, timestamp, width, height, devicePixelRatio, encoding, data };
}

function normalizeLatencyStat(value, path) {
  let stat = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  return {
    meanMs: optionalNonNegativeNumber(stat.meanMs, `${path}.meanMs`) ?? 0,
    maxMs: optionalNonNegativeNumber(stat.maxMs, `${path}.maxMs`) ?? 0,
  };
}

function normalizeCaptureTransport(value) {
  if (value === undefined || value === null) return undefined;
  let transport = requireObject(value, 'renderArtifact.capture.transport');
  let name = normalizeCaptureTransportKind(transport.name, 'attributed-compositor');
  let policyVersion = cleanString(transport.policyVersion, '');
  if (!policyVersion) fail('renderArtifact.capture.transport.policyVersion', 'is required');
  if (name === 'attributed-compositor' && policyVersion !== ATTRIBUTED_COMPOSITOR_POLICY_VERSION) {
    fail(
      'renderArtifact.capture.transport.policyVersion',
      `must equal "${ATTRIBUTED_COMPOSITOR_POLICY_VERSION}"`,
    );
  }
  return {
    name,
    policyVersion,
    acceptedFrames: optionalNonNegativeInteger(
      transport.acceptedFrames,
      'renderArtifact.capture.transport.acceptedFrames',
    ) ?? 0,
    discardedFrames: optionalNonNegativeInteger(
      transport.discardedFrames,
      'renderArtifact.capture.transport.discardedFrames',
    ) ?? 0,
    attributionLatencyMs: normalizeLatencyStat(
      transport.attributionLatencyMs,
      'renderArtifact.capture.transport.attributionLatencyMs',
    ),
    presentationGapMs: normalizeLatencyStat(
      transport.presentationGapMs,
      'renderArtifact.capture.transport.presentationGapMs',
    ),
    width: positiveInteger(transport.width, undefined, 'renderArtifact.capture.transport.width'),
    height: positiveInteger(transport.height, undefined, 'renderArtifact.capture.transport.height'),
    devicePixelRatio: positiveNumber(
      transport.devicePixelRatio,
      undefined,
      'renderArtifact.capture.transport.devicePixelRatio',
    ),
    sessionsStopped: optionalNonNegativeInteger(
      transport.sessionsStopped,
      'renderArtifact.capture.transport.sessionsStopped',
    ) ?? 0,
    sessionStopTimeouts: optionalNonNegativeInteger(
      transport.sessionStopTimeouts,
      'renderArtifact.capture.transport.sessionStopTimeouts',
    ) ?? 0,
    sessionStopErrors: optionalNonNegativeInteger(
      transport.sessionStopErrors,
      'renderArtifact.capture.transport.sessionStopErrors',
    ) ?? 0,
  };
}

function normalizeRenderCapture(value) {
  if (value === undefined || value === null) return undefined;
  let capture = requireObject(value, 'renderArtifact.capture');
  let mode = cleanString(capture.mode, 'realtime');
  if (!['realtime', 'deterministic'].includes(mode)) {
    fail('renderArtifact.capture.mode', 'must be "realtime" or "deterministic"');
  }
  let workerRanges = (Array.isArray(capture.workerRanges) ? capture.workerRanges : []).map((range, index) => {
    requireObject(range, `renderArtifact.capture.workerRanges[${index}]`);
    let phaseDurationMs = requireObject(range.phaseDurationMs || {}, `renderArtifact.capture.workerRanges[${index}].phaseDurationMs`);
    return {
      workerIndex: optionalNonNegativeInteger(range.workerIndex, `renderArtifact.capture.workerRanges[${index}].workerIndex`) ?? index,
      startFrame: optionalNonNegativeInteger(range.startFrame, `renderArtifact.capture.workerRanges[${index}].startFrame`) ?? 0,
      endFrame: optionalNonNegativeInteger(range.endFrame, `renderArtifact.capture.workerRanges[${index}].endFrame`) ?? 0,
      frameCount: positiveInteger(range.frameCount, undefined, `renderArtifact.capture.workerRanges[${index}].frameCount`),
      warmupDurationMs: optionalNonNegativeNumber(range.warmupDurationMs, `renderArtifact.capture.workerRanges[${index}].warmupDurationMs`) ?? 0,
      captureDurationMs: optionalNonNegativeNumber(range.captureDurationMs, `renderArtifact.capture.workerRanges[${index}].captureDurationMs`) ?? 0,
      phaseDurationMs: {
        render: optionalNonNegativeNumber(phaseDurationMs.render, `renderArtifact.capture.workerRanges[${index}].phaseDurationMs.render`) ?? 0,
        settle: optionalNonNegativeNumber(phaseDurationMs.settle, `renderArtifact.capture.workerRanges[${index}].phaseDurationMs.settle`) ?? 0,
        caption: optionalNonNegativeNumber(phaseDurationMs.caption, `renderArtifact.capture.workerRanges[${index}].phaseDurationMs.caption`) ?? 0,
        stateSample: optionalNonNegativeNumber(phaseDurationMs.stateSample, `renderArtifact.capture.workerRanges[${index}].phaseDurationMs.stateSample`) ?? 0,
        screenshot: optionalNonNegativeNumber(phaseDurationMs.screenshot, `renderArtifact.capture.workerRanges[${index}].phaseDurationMs.screenshot`) ?? 0,
      },
    };
  });
  let seamProofs = (Array.isArray(capture.seamProofs) ? capture.seamProofs : []).map((proof, index) => {
    requireObject(proof, `renderArtifact.capture.seamProofs[${index}]`);
    return {
      frame: optionalNonNegativeInteger(proof.frame, `renderArtifact.capture.seamProofs[${index}].frame`) ?? 0,
      elapsedMs: optionalNonNegativeNumber(proof.elapsedMs, `renderArtifact.capture.seamProofs[${index}].elapsedMs`) ?? 0,
      workers: (Array.isArray(proof.workers) ? proof.workers : []).map((worker, workerIndex) => (
        optionalNonNegativeInteger(worker, `renderArtifact.capture.seamProofs[${index}].workers[${workerIndex}]`) ?? 0
      )),
      contentDigest: cleanString(proof.contentDigest, ''),
      peerContentDigest: cleanString(proof.peerContentDigest, ''),
      contentMatches: proof.contentMatches === true,
      pixelHash: cleanString(proof.pixelHash, ''),
      peerPixelHash: cleanString(proof.peerPixelHash, ''),
      exactPixelsMatch: proof.exactPixelsMatch === true,
      ssim: optionalNonNegativeNumber(proof.ssim, `renderArtifact.capture.seamProofs[${index}].ssim`) ?? 0,
      requiredSsim: optionalNonNegativeNumber(
        proof.requiredSsim,
        `renderArtifact.capture.seamProofs[${index}].requiredSsim`,
      ) ?? 0,
      pixelsMatch: proof.pixelsMatch === true,
    };
  });
  let resourceSamples = (Array.isArray(capture.resourceSamples) ? capture.resourceSamples : []).map((sample, index) => {
    requireObject(sample, `renderArtifact.capture.resourceSamples[${index}]`);
    return {
      atMs: optionalNonNegativeNumber(sample.atMs, `renderArtifact.capture.resourceSamples[${index}].atMs`) ?? 0,
      rssBytes: optionalNonNegativeNumber(sample.rssBytes, `renderArtifact.capture.resourceSamples[${index}].rssBytes`) ?? 0,
      processCount: optionalNonNegativeInteger(sample.processCount, `renderArtifact.capture.resourceSamples[${index}].processCount`) ?? 0,
      workers: (Array.isArray(sample.workers) ? sample.workers : []).map((worker, workerIndex) => ({
        workerIndex: optionalNonNegativeInteger(worker.workerIndex, `renderArtifact.capture.resourceSamples[${index}].workers[${workerIndex}].workerIndex`) ?? workerIndex,
        pid: optionalNonNegativeInteger(worker.pid, `renderArtifact.capture.resourceSamples[${index}].workers[${workerIndex}].pid`) ?? 0,
        processCount: optionalNonNegativeInteger(worker.processCount, `renderArtifact.capture.resourceSamples[${index}].workers[${workerIndex}].processCount`) ?? 0,
        rssBytes: optionalNonNegativeNumber(worker.rssBytes, `renderArtifact.capture.resourceSamples[${index}].workers[${workerIndex}].rssBytes`) ?? 0,
      })),
    };
  });
  let workerPeakRssBytes = Object.fromEntries(Object.entries(capture.workerPeakRssBytes || {}).map(([workerIndex, rssBytes]) => [
    String(optionalNonNegativeInteger(workerIndex, `renderArtifact.capture.workerPeakRssBytes.${workerIndex}`) ?? 0),
    optionalNonNegativeNumber(rssBytes, `renderArtifact.capture.workerPeakRssBytes.${workerIndex}`) ?? 0,
  ]));
  let continuationPrepass;
  if (capture.continuationPrepass !== undefined) {
    let prepass = requireObject(capture.continuationPrepass, 'renderArtifact.capture.continuationPrepass');
    continuationPrepass = {
      durationMs: optionalNonNegativeNumber(
        prepass.durationMs,
        'renderArtifact.capture.continuationPrepass.durationMs',
      ) ?? 0,
      projectedFrames: optionalNonNegativeInteger(
        prepass.projectedFrames,
        'renderArtifact.capture.continuationPrepass.projectedFrames',
      ) ?? 0,
      continuationHashes: (Array.isArray(prepass.continuationHashes) ? prepass.continuationHashes : [])
        .map((entry, index) => {
          requireObject(entry, `renderArtifact.capture.continuationPrepass.continuationHashes[${index}]`);
          let continuationHash = cleanString(entry.continuationHash, '');
          if (!/^[a-f0-9]{64}$/.test(continuationHash)) {
            fail(`renderArtifact.capture.continuationPrepass.continuationHashes[${index}].continuationHash`, 'must be a sha256 hash');
          }
          return {
            workerIndex: optionalNonNegativeInteger(
              entry.workerIndex,
              `renderArtifact.capture.continuationPrepass.continuationHashes[${index}].workerIndex`,
            ) ?? index,
            startFrame: optionalNonNegativeInteger(
              entry.startFrame,
              `renderArtifact.capture.continuationPrepass.continuationHashes[${index}].startFrame`,
            ) ?? 0,
            continuationHash,
          };
        }),
    };
  }
  let transport = normalizeCaptureTransport(capture.transport);
  let cleanupOk = optionalBoolean(capture.cleanupOk, 'renderArtifact.capture.cleanupOk');
  let cleanupErrors;
  if (capture.cleanupErrors !== undefined) {
    if (!Array.isArray(capture.cleanupErrors)) {
      fail('renderArtifact.capture.cleanupErrors', 'must be an array');
    }
    cleanupErrors = capture.cleanupErrors.map((error, index) => {
      let message = cleanString(error, '');
      if (!message) fail(`renderArtifact.capture.cleanupErrors[${index}]`, 'must be a non-empty string');
      return message;
    });
  }
  return {
    mode,
    workerCount: positiveInteger(capture.workerCount, 1, 'renderArtifact.capture.workerCount'),
    durationMs: optionalNonNegativeNumber(capture.durationMs, 'renderArtifact.capture.durationMs') ?? 0,
    throughputFps: optionalNonNegativeNumber(capture.throughputFps, 'renderArtifact.capture.throughputFps') ?? 0,
    browserCloseTimeouts: optionalNonNegativeInteger(
      capture.browserCloseTimeouts,
      'renderArtifact.capture.browserCloseTimeouts',
    ) ?? 0,
    frameTimeSource: cleanString(capture.frameTimeSource, mode === 'deterministic' ? 'page-render-clock' : 'wall-clock'),
    frameCaptureType: cleanString(capture.frameCaptureType, 'screenshot'),
    setupStateHash: cleanString(capture.setupStateHash, ''),
    seamProofs,
    workerRanges,
    ...(transport ? { transport } : {}),
    ...(continuationPrepass ? { continuationPrepass } : {}),
    ...(resourceSamples.length ? { resourceSamples } : {}),
    ...(capture.peakRssBytes !== undefined ? {
      peakRssBytes: optionalNonNegativeNumber(capture.peakRssBytes, 'renderArtifact.capture.peakRssBytes') ?? 0,
    } : {}),
    ...(Object.keys(workerPeakRssBytes).length ? { workerPeakRssBytes } : {}),
    ...(cleanString(capture.resourceSamplingError, '') ? {
      resourceSamplingError: cleanString(capture.resourceSamplingError, ''),
    } : {}),
    ...(cleanupOk !== undefined ? { cleanupOk } : {}),
    ...(cleanupErrors !== undefined ? { cleanupErrors } : {}),
  };
}

export function normalizeRenderProvider(provider = {}) {
  requireObject(provider, 'renderProvider');
  let id = cleanString(provider.id, '');
  if (!id) fail('renderProvider.id', 'is required');
  let kind = normalizeKind(provider.kind, RENDER_PROVIDER_KINDS, 'screencast', 'renderProvider.kind');
  if (typeof provider.execute !== 'function') {
    fail('renderProvider.execute', 'is required');
  }
  return {
    id,
    kind,
    execute: provider.execute,
    ...(provider.tier != null ? { tier: normalizeExecutionTier(provider.tier, 'renderProvider.tier') } : {}),
  };
}

export function normalizeRenderJob(job = {}) {
  requireObject(job, 'renderJob');
  let providerId = cleanString(job.providerId, job.renderProvider?.id);
  if (!providerId) fail('renderJob.providerId', 'is required');
  let kind = normalizeKind(
    job.kind,
    RENDER_PROVIDER_KINDS,
    job.renderProvider?.kind || 'screencast',
    'renderJob.kind',
  );
  let id = cleanString(job.id, 'render-job') || 'render-job';
  if (kind === 'native-segment') {
    let nativeJob = normalizeNativeSegmentJob(job, { path: 'renderJob' });
    return { ...nativeJob, id, kind, providerId, tier: nativeJob.tier };
  }
  return {
    ...job,
    id,
    kind,
    providerId,
    ...(job.tier != null ? { tier: normalizeExecutionTier(job.tier, 'renderJob.tier') } : {}),
  };
}

function artifactHash(value, path) {
  let text = cleanString(value, '');
  if (!text) fail(path, 'is required');
  if (!ARTIFACT_HASH_RE.test(text)) fail(path, 'must be a hex digest or sha256: reference');
  return text;
}

function normalizeArtifactContinuation(value, tier, path) {
  requireObject(value, path);
  let mode = cleanString(value.mode, '');
  if (tier === 'sequential-realtime') {
    if (mode !== 'continuous') fail(`${path}.mode`, 'must be "continuous" for sequential-realtime');
    if (value.replayRef != null || value.checkpointRef != null) {
      fail(path, 'must not carry replay or checkpoint refs for sequential-realtime');
    }
    return { mode: 'continuous' };
  }
  if (tier === 'replayable-segment') {
    if (mode !== 'replay') fail(`${path}.mode`, 'must be "replay" for replayable-segment');
    if (value.checkpointRef != null) fail(path, 'must not carry checkpoint refs for replayable-segment');
    return {
      mode: 'replay',
      replayRef: portableRef(value.replayRef, `${path}.replayRef`),
      replayEvidenceHash: artifactHash(value.replayEvidenceHash, `${path}.replayEvidenceHash`),
    };
  }
  if (mode !== 'checkpoint') fail(`${path}.mode`, 'must be "checkpoint" for checkpointed-deterministic');
  if (value.replayRef != null) fail(path, 'must not carry replay refs for checkpointed-deterministic');
  return {
    mode: 'checkpoint',
    checkpointRef: portableRef(value.checkpointRef, `${path}.checkpointRef`),
    checkpointHash: artifactHash(value.checkpointHash, `${path}.checkpointHash`),
  };
}

function normalizeClockEvidence(value, tier, path) {
  requireObject(value, path);
  let mode = cleanString(value.mode, '');
  if (!CLOCK_MODES.has(mode)) fail(`${path}.mode`, `must be one of ${[...CLOCK_MODES].join(', ')}`);
  let rate = Number(value.rate);
  if (!Number.isFinite(rate) || rate <= 0) fail(`${path}.rate`, 'must be a positive number');
  if (tier === 'sequential-realtime' || tier === 'replayable-segment') {
    if (mode !== 'wall-clock' || rate !== 1) {
      fail(path, `must be wall-clock at rate 1 for ${tier}`);
    }
    return { mode, rate };
  }
  let normalized = { mode, rate };
  if (mode === 'render-time' || rate !== 1) {
    normalized.clockEquivalenceProofRef = portableRef(
      value.clockEquivalenceProofRef,
      `${path}.clockEquivalenceProofRef`,
    );
  } else if (value.clockEquivalenceProofRef != null && value.clockEquivalenceProofRef !== '') {
    normalized.clockEquivalenceProofRef = portableRef(
      value.clockEquivalenceProofRef,
      `${path}.clockEquivalenceProofRef`,
    );
  }
  return normalized;
}

function crossCheckSelectionReceipt(receipt, segment, path) {
  if (receipt.tier !== segment.tier) {
    fail(`${path}.tier`, `must equal segment tier "${segment.tier}"`);
  }
  if (receipt.ok !== true) {
    fail(`${path}.ok`, 'must be true for a successful native segment artifact');
  }
  for (let role of ['renderer', 'encoder']) {
    let entry = receipt[role];
    if (!entry.selected) {
      fail(`${path}.${role}.selected`, 'is required and must be a proven candidate');
    }
    if (!accelerationCandidateProven(entry.selected)) {
      fail(`${path}.${role}.selected`, 'must be a semantically proven acceleration candidate');
    }
    let requiredBackend = cleanString(entry.requested.requiredBackend, '');
    let requiredCodec = role === 'encoder' ? cleanString(entry.requested.requiredCodec, '') : '';
    let selectedCodec = role === 'encoder' ? cleanString(entry.selected.codec, '') : '';
    if (role === 'encoder' && !selectedCodec) {
      fail(`${path}.encoder.selected.codec`, 'is required for an encoded segment artifact');
    }
    let selectionUsesFallback = Boolean(
      requiredBackend && entry.selected.backend !== requiredBackend
      || requiredCodec && selectedCodec !== requiredCodec,
    );
    if (selectionUsesFallback) {
      if (entry.requested.allowFallback !== true) {
        fail(`${path}.${role}.selected`, 'does not satisfy the requested backend or codec and fallback is disabled');
      }
      if (entry.fallbackUsed !== true) {
        fail(`${path}.${role}.fallbackUsed`, 'must be true when the selected candidate does not satisfy the request');
      }
    } else if (entry.fallbackUsed === true) {
      fail(`${path}.${role}.fallbackUsed`, 'must be false when the selected candidate satisfies the request');
    }
  }
  let videoCodec = segment.videoCodec;
  if (videoCodec) {
    let selectedCodec = cleanString(receipt.encoder.selected.codec, '');
    if (selectedCodec !== videoCodec) {
      fail(`${path}.encoder.selected.codec`, `must equal artifact videoCodec "${videoCodec}"`);
    }
  }
  let selectedContainer = cleanString(receipt.encoder.selected.container, '');
  if (selectedContainer && selectedContainer !== segment.container) {
    fail(`${path}.encoder.selected.container`, `must equal artifact container "${segment.container}"`);
  }
  let selectedPixelFormat = cleanString(receipt.encoder.selected.pixelFormat, '');
  if (selectedPixelFormat && selectedPixelFormat !== segment.pixelFormat) {
    fail(`${path}.encoder.selected.pixelFormat`, `must equal artifact pixelFormat "${segment.pixelFormat}"`);
  }
}

function rationalEqual(a, b) {
  return Boolean(a) && Boolean(b) && a.num === b.num && a.den === b.den;
}

function roleRequestEqual(actual, expected, role) {
  if (actual.allowFallback !== expected.allowFallback) return false;
  if (cleanString(actual.requiredBackend, '') !== cleanString(expected.requiredBackend, '')) return false;
  if (role === 'encoder'
    && cleanString(actual.requiredCodec, '') !== cleanString(expected.requiredCodec, '')) return false;
  return true;
}

function valueEqual(actual, expected) {
  return (actual ?? null) === (expected ?? null);
}

function crossCheckArtifactJob(artifact, job, segment) {
  let p = 'renderArtifact';
  if (segment.tier !== job.tier) fail(`${p}.tier`, `must equal job tier "${job.tier}"`);
  if (segment.frameRange.start !== job.logicalRange.start || segment.frameRange.end !== job.logicalRange.end) {
    fail(`${p}.frameRange`, 'must equal job logicalRange');
  }
  if (segment.captureRange.start !== job.captureRange.start || segment.captureRange.end !== job.captureRange.end) {
    fail(`${p}.captureRange`, 'must equal job captureRange');
  }
  if (segment.prerollFrames !== job.prerollFrames) {
    fail(`${p}.prerollFrames`, `must equal job prerollFrames ${job.prerollFrames}`);
  }
  if (segment.postrollFrames !== job.postrollFrames) {
    fail(`${p}.postrollFrames`, `must equal job postrollFrames ${job.postrollFrames}`);
  }
  if (artifact.continuationEvidence.mode !== job.continuation.mode) {
    fail(`${p}.continuationEvidence.mode`, `must equal job continuation mode "${job.continuation.mode}"`);
  }
  if ((artifact.continuationEvidence.replayRef ?? null) !== (job.continuation.replayRef ?? null)
    || (artifact.continuationEvidence.replayEvidenceHash ?? null) !== (job.continuation.replayEvidenceHash ?? null)
    || (artifact.continuationEvidence.checkpointRef ?? null) !== (job.continuation.checkpointRef ?? null)
    || (artifact.continuationEvidence.checkpointHash ?? null) !== (job.continuation.checkpointHash ?? null)) {
    fail(`${p}.continuationEvidence`, 'refs and hashes must match the job continuation');
  }
  if (artifact.clockEvidence.mode !== job.uiClock.mode
    || artifact.clockEvidence.rate !== job.uiClock.rate
    || (artifact.clockEvidence.clockEquivalenceProofRef ?? null)
      !== (job.uiClock.clockEquivalenceProofRef ?? null)) {
    fail(`${p}.clockEvidence`, 'must match the complete job uiClock evidence');
  }
  if (artifact.width !== job.viewport.width
    || artifact.height !== job.viewport.height
    || segment.dpr !== job.viewport.dpr) {
    fail(`${p}.viewport`, 'width/height/dpr must match the job viewport');
  }
  if (!rationalEqual(segment.frameRate, job.frameRate)) fail(`${p}.frameRate`, 'must equal job frameRate');
  if (!rationalEqual(segment.timeBase, job.timeBase)) fail(`${p}.timeBase`, 'must equal job timeBase');
  if (segment.frameDurationTicks !== job.frameDurationTicks) {
    fail(`${p}.frameDurationTicks`, `must equal job frameDurationTicks ${job.frameDurationTicks}`);
  }
  if (segment.sourceHash !== job.sourceHash) fail(`${p}.sourceHash`, 'must equal job sourceHash');
  if (segment.settingsHash !== job.settingsHash) fail(`${p}.settingsHash`, 'must equal job settingsHash');
  for (let field of [
    'container',
    'videoCodec',
    'audioCodec',
    'pixelFormat',
    'colorSpace',
    'colorPrimaries',
    'colorTransfer',
    'colorRange',
    'chromaLocation',
    'audioSampleRate',
    'audioChannels',
    'audioChannelLayout',
  ]) {
    if (!valueEqual(segment[field], job[field])) fail(`${p}.${field}`, `must equal job ${field}`);
  }
  if (!rationalEqual(segment.audioTimeBase, job.audioTimeBase)) {
    if (segment.audioTimeBase !== null || job.audioTimeBase !== null) {
      fail(`${p}.audioTimeBase`, 'must equal job audioTimeBase');
    }
  }
  if (artifact.renderSelectionReceipt.tier !== job.capability.tier) {
    fail(`${p}.renderSelectionReceipt.tier`, `must equal job capability tier "${job.capability.tier}"`);
  }
  for (let role of ['renderer', 'encoder']) {
    if (!roleRequestEqual(
      artifact.renderSelectionReceipt[role].requested,
      job.capability[role],
      role,
    )) {
      fail(`${p}.renderSelectionReceipt.${role}.requested`, 'must equal the job capability request');
    }
  }
  if (artifact.cleanupRef !== job.cleanupRef) fail(`${p}.cleanupRef`, 'must equal job cleanupRef');
}

export function normalizeRenderArtifact(result = {}, context = {}) {
  requireObject(result, 'renderArtifact');
  let providerId = cleanString(result.providerId, context.providerId);
  if (!providerId) fail('renderArtifact.providerId', 'is required');
  let kind = normalizeKind(
    result.kind,
    RENDER_ARTIFACT_KINDS,
    context.kind || 'screencast',
    'renderArtifact.kind',
  );
  if (kind === 'native-segment') {
    // Reject fractional dims/frames before the rounding positiveInteger helper can
    // let a value like frames:9.6 round up and spuriously satisfy the frameCount check.
    for (let field of ['frames', 'width', 'height']) {
      let raw = Number(result[field]);
      if (!Number.isInteger(raw) || raw <= 0) fail(`renderArtifact.${field}`, 'must be a positive integer');
    }
    let rawFps = Number(result.fps);
    if (!Number.isFinite(rawFps) || rawFps <= 0) fail('renderArtifact.fps', 'must be a positive number');
  }
  let common = {
    kind,
    providerId,
    frames: positiveInteger(result.frames, undefined, 'renderArtifact.frames'),
    fps: positiveNumber(result.fps, undefined, 'renderArtifact.fps'),
    durationSec: positiveNumber(result.durationSec, undefined, 'renderArtifact.durationSec'),
    width: positiveInteger(result.width, undefined, 'renderArtifact.width'),
    height: positiveInteger(result.height, undefined, 'renderArtifact.height'),
  };
  let capture = normalizeRenderCapture(result.capture);
  if (capture) common.capture = capture;

  if (kind === 'screencast') {
    let path = cleanString(result.path, '');
    if (!path) fail('renderArtifact.path', 'is required');
    return {
      path,
      ...common,
    };
  }

  if (kind === 'native-segment') {
    let segment = normalizeNativeSegment(result, { path: 'renderArtifact.segment' });
    if (context.tier != null) {
      let contextTier = normalizeExecutionTier(context.tier, 'renderArtifact.context.tier');
      if (segment.tier !== contextTier) {
        fail('renderArtifact.tier', `must equal provider/job tier "${contextTier}"`);
      }
    }
    if (common.frames !== segment.frameCount) {
      fail('renderArtifact.frames', `must equal segment frameCount ${segment.frameCount}`);
    }
    if (common.width !== segment.width) {
      fail('renderArtifact.width', `must equal segment width ${segment.width}`);
    }
    if (common.height !== segment.height) {
      fail('renderArtifact.height', `must equal segment height ${segment.height}`);
    }
    let cadenceFps = segment.frameRate.num / segment.frameRate.den;
    let fpsTolerance = 1e-6 * cadenceFps + 1e-9;
    if (Math.abs(common.fps - cadenceFps) > fpsTolerance) {
      fail(
        'renderArtifact.fps',
        `must match frameRate cadence ${segment.frameRate.num}/${segment.frameRate.den}`,
      );
    }
    let expectedLastPts = segment.firstPts + (segment.frameCount - 1) * segment.frameDurationTicks;
    if (segment.lastPts !== expectedLastPts) {
      fail('renderArtifact.lastPts', `must equal firstPts + (frameCount - 1) * frameDurationTicks (${expectedLastPts})`);
    }
    let expectedSec = segment.frameCount * segment.frameDurationTicks * segment.timeBase.num / segment.timeBase.den;
    let durationTolerance = Math.max(1e-6, Math.abs(expectedSec) * 1e-9);
    if (Math.abs(common.durationSec - expectedSec) > durationTolerance) {
      fail('renderArtifact.durationSec', `must equal frameCount*frameDurationTicks*timeBase (${expectedSec})`);
    }
    let mediaRef = portableRef(result.mediaRef, 'renderArtifact.mediaRef');
    let renderSelectionReceipt = normalizeAccelerationSelection(
      requireObject(result.renderSelectionReceipt, 'renderArtifact.renderSelectionReceipt'),
    );
    crossCheckSelectionReceipt(renderSelectionReceipt, segment, 'renderArtifact.renderSelectionReceipt');
    let continuationEvidence = normalizeArtifactContinuation(
      result.continuationEvidence,
      segment.tier,
      'renderArtifact.continuationEvidence',
    );
    let clockEvidence = normalizeClockEvidence(result.clockEvidence, segment.tier, 'renderArtifact.clockEvidence');
    let cleanupRef = portableRef(result.cleanupRef, 'renderArtifact.cleanupRef');
    let proof = requireObject(result.proof, 'renderArtifact.proof');
    if (proof.ok !== true) {
      fail('renderArtifact.proof.ok', 'must be true for a successful native segment artifact');
    }
    let artifact = {
      ...segment,
      ...common,
      mediaRef,
      renderSelectionReceipt,
      continuationEvidence,
      clockEvidence,
      cleanupRef,
      proof,
    };
    if (context.job != null) {
      crossCheckArtifactJob(artifact, context.job, segment);
    }
    return artifact;
  }

  let framesDir = cleanString(result.framesDir, '');
  if (!framesDir) fail('renderArtifact.framesDir', 'is required');
  let framePattern = cleanString(result.framePattern, 'frame-%05d.png') || 'frame-%05d.png';
  let mimeType = cleanString(result.mimeType, 'image/png') || 'image/png';
  let frameFiles = (Array.isArray(result.frameFiles) ? result.frameFiles : []).map((frameFile, index) => {
    requireObject(frameFile, `renderArtifact.frameFiles[${index}]`);
    let path = cleanString(frameFile.path, '');
    if (!path) fail(`renderArtifact.frameFiles[${index}].path`, 'is required');
    return {
      index: optionalNonNegativeInteger(frameFile.index, `renderArtifact.frameFiles[${index}].index`) ?? index,
      path,
      elapsedMs: optionalNonNegativeNumber(frameFile.elapsedMs, `renderArtifact.frameFiles[${index}].elapsedMs`) ?? 0,
      mimeType: cleanString(frameFile.mimeType, mimeType) || mimeType,
    };
  });
  if (frameFiles.length !== common.frames) {
    fail('renderArtifact.frameFiles', `must include ${common.frames} frame records`);
  }
  let path = cleanString(result.path, '');
  let sourceUrl = cleanString(result.source?.url || result.sourceUrl, '');
  if (!sourceUrl) fail('renderArtifact.source.url', 'is required');
  return {
    ...common,
    framesDir,
    framePattern,
    mimeType,
    frameFiles,
    ...(sourceUrl ? { source: { url: sourceUrl } } : {}),
    ...(path ? { path } : {}),
  };
}

export function createRenderProviderRegistry(providers = []) {
  let registry = new Map();

  function register(provider) {
    let normalized = normalizeRenderProvider(provider);
    if (registry.has(normalized.id)) {
      fail('renderProvider.id', `duplicate provider "${normalized.id}"`);
    }
    registry.set(normalized.id, normalized);
    return normalized;
  }

  for (let provider of providers) {
    register(provider);
  }

  return {
    register,
    get(id) {
      return registry.get(cleanString(id, ''));
    },
    list() {
      return [...registry.values()].map(({ id, kind }) => ({ id, kind }));
    },
    async execute(job, options) {
      let normalizedJob = normalizeRenderJob(job);
      let provider = registry.get(normalizedJob.providerId);
      if (!provider) {
        fail('renderJob.providerId', `unknown provider "${normalizedJob.providerId}"`);
      }
      if (provider.kind !== normalizedJob.kind) {
        fail(
          'renderJob.kind',
          `provider "${provider.id}" handles "${provider.kind}", got "${normalizedJob.kind}"`,
        );
      }
      if (provider.tier != null && normalizedJob.tier != null && provider.tier !== normalizedJob.tier) {
        fail(
          'renderJob.tier',
          `provider "${provider.id}" runs "${provider.tier}", got "${normalizedJob.tier}"`,
        );
      }
      let result = await provider.execute(normalizedJob, options);
      return normalizeRenderArtifact(result, {
        providerId: provider.id,
        kind: provider.kind,
        tier: normalizedJob.tier ?? provider.tier,
        ...(normalizedJob.kind === 'native-segment' ? { job: normalizedJob } : {}),
      });
    },
  };
}

export function normalizeAudioProviderDescriptor(provider = {}) {
  requireObject(provider, 'audioProvider');
  let id = cleanString(provider.id, '');
  if (!id) fail('audioProvider.id', 'is required');
  return {
    id,
    kind: normalizeKind(provider.kind, AUDIO_PROVIDER_KINDS, 'browser-tts', 'audioProvider.kind'),
  };
}
