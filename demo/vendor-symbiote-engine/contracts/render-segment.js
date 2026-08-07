import { normalizeCapabilityRequest, normalizeExecutionTier } from './render-capability.js';

export const NATIVE_SEGMENT_ARTIFACT_VERSION = 'native-segment/1';
export const NATIVE_SEGMENT_JOB_VERSION = 'native-segment-job/1';
export const RENDER_SEAM_INPUT_VERSION = 'render-seam-input/1';
export const RENDER_SEAM_POLICIES = Object.freeze(['exact', 'perceptual']);
export const RENDER_SEAM_OWNERSHIP = Object.freeze(['leading', 'trailing']);
export const UI_CLOCK_MODES = Object.freeze(['wall-clock', 'render-time']);

const AUDIO_GROUP_FIELDS = Object.freeze([
  'audioSampleRate',
  'audioChannels',
  'audioChannelLayout',
  'audioTimeBase',
  'audioExtradataHash',
]);

const HASH_RE = /^(sha256:)?[A-Fa-f0-9]{8,}$/;
const OPTIONAL_REFS = Object.freeze([
  'indexRef',
  'audioRef',
  'playbackProxyRef',
  'scrubProxyRef',
  'spriteRef',
  'waveformRef',
]);

function fail(path, message) {
  throw new Error(`${path}: ${message}`);
}

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function cleanString(value, fallback = '') {
  let text = String(value ?? fallback ?? '').replace(/\s+/g, ' ').trim();
  return text && text !== 'undefined' && text !== 'null' ? text : String(fallback || '').trim();
}

function requireObject(value, path) {
  if (!isObject(value)) fail(path, 'must be an object');
  return value;
}

function requiredString(value, path) {
  let text = cleanString(value, '');
  if (!text) fail(path, 'is required');
  return text;
}

function positiveInteger(value, path) {
  let number = Number(value);
  if (!Number.isInteger(number) || number <= 0) fail(path, 'must be a positive integer');
  return number;
}

function nonNegativeInteger(value, path) {
  let number = Number(value);
  if (!Number.isInteger(number) || number < 0) fail(path, 'must be a non-negative integer');
  return number;
}

function positiveNumber(value, path) {
  let number = Number(value);
  if (!Number.isFinite(number) || number <= 0) fail(path, 'must be a positive number');
  return number;
}

function normalizeHash(value, path) {
  let text = requiredString(value, path);
  if (!HASH_RE.test(text)) fail(path, 'must be a hex digest or sha256: reference');
  return text;
}

function resolveExactVersion(value, expected, path) {
  if (value === undefined || value === null || value === '') return expected;
  let version = cleanString(value, '');
  if (version !== expected) fail(path, `must equal "${expected}"`);
  return version;
}

function resolveVersion(value, path) {
  return resolveExactVersion(value, NATIVE_SEGMENT_ARTIFACT_VERSION, path);
}

function normalizePortableRef(value, path) {
  if (typeof value === 'function') fail(path, 'must be a portable string token, not a function');
  if (value !== null && typeof value === 'object') fail(path, 'must be a portable string token, not an object');
  return requiredString(value, path);
}

function normalizeColorGroup(source, path) {
  return {
    pixelFormat: requiredString(source.pixelFormat, `${path}.pixelFormat`),
    colorSpace: requiredString(source.colorSpace, `${path}.colorSpace`),
    colorPrimaries: requiredString(source.colorPrimaries, `${path}.colorPrimaries`),
    colorTransfer: requiredString(source.colorTransfer, `${path}.colorTransfer`),
    colorRange: requiredString(source.colorRange, `${path}.colorRange`),
    chromaLocation: requiredString(source.chromaLocation, `${path}.chromaLocation`),
  };
}

function normalizeAudioGroup(source, audioCodec, path) {
  if (!audioCodec) {
    let present = AUDIO_GROUP_FIELDS.find((field) => (
      source[field] !== undefined && source[field] !== null && source[field] !== ''
    ));
    if (present) fail(`${path}.${present}`, 'must be absent when audioCodec is absent');
    return {
      audioSampleRate: null,
      audioChannels: null,
      audioChannelLayout: null,
      audioTimeBase: null,
      audioExtradataHash: null,
    };
  }
  return {
    audioSampleRate: positiveInteger(source.audioSampleRate, `${path}.audioSampleRate`),
    audioChannels: positiveInteger(source.audioChannels, `${path}.audioChannels`),
    audioChannelLayout: requiredString(source.audioChannelLayout, `${path}.audioChannelLayout`),
    audioTimeBase: normalizeRational(source.audioTimeBase, `${path}.audioTimeBase`),
    audioExtradataHash: normalizeHash(source.audioExtradataHash, `${path}.audioExtradataHash`),
  };
}

function rationalKey(rational) {
  return rational ? `${rational.num}/${rational.den}` : null;
}

export function normalizeRational(value, path = 'rational') {
  let num;
  let den;
  if (typeof value === 'string') {
    let text = value.trim();
    let match = text.match(/^(\d+)\s*\/\s*(\d+)$/);
    if (match) {
      num = Number(match[1]);
      den = Number(match[2]);
    } else {
      num = Number(text);
      den = 1;
    }
  } else if (isObject(value)) {
    num = Number(value.num);
    den = Number(value.den);
  } else {
    num = Number(value);
    den = 1;
  }
  if (!Number.isInteger(num) || num <= 0) fail(`${path}.num`, 'must be a positive integer');
  if (!Number.isInteger(den) || den <= 0) fail(`${path}.den`, 'must be a positive integer');
  return { num, den };
}

export function normalizeSeamPolicy(policy = {}, path = 'seamPolicy') {
  let source = typeof policy === 'string' ? { type: policy } : requireObject(policy, path);
  let type = cleanString(source.type, '');
  if (!RENDER_SEAM_POLICIES.includes(type)) {
    fail(`${path}.type`, `must be one of ${RENDER_SEAM_POLICIES.join(', ')}`);
  }
  let owner = cleanString(source.owner, 'trailing');
  if (!RENDER_SEAM_OWNERSHIP.includes(owner)) {
    fail(`${path}.owner`, `must be one of ${RENDER_SEAM_OWNERSHIP.join(', ')}`);
  }
  let normalized = { type, owner };
  if (type === 'perceptual') {
    let requiredSsim = Number(source.requiredSsim);
    if (!Number.isFinite(requiredSsim) || requiredSsim <= 0 || requiredSsim > 1) {
      fail(`${path}.requiredSsim`, 'must be a number in (0, 1]');
    }
    normalized.requiredSsim = requiredSsim;
  }
  return normalized;
}

function normalizeKeyframePts(value, firstPts, lastPts, independentlyDecodable, path) {
  let list = Array.isArray(value) ? value : [];
  let keyframes = list.map((pts, index) => {
    let number = Number(pts);
    if (!Number.isInteger(number)) fail(`${path}[${index}]`, 'must be an integer PTS');
    return number;
  });
  for (let index = 0; index < keyframes.length; index += 1) {
    let pts = keyframes[index];
    if (pts < firstPts || pts > lastPts) {
      fail(`${path}[${index}]`, `must be within [${firstPts}, ${lastPts}]`);
    }
    if (index > 0 && pts <= keyframes[index - 1]) {
      fail(`${path}[${index}]`, 'must be strictly ascending and unique');
    }
  }
  if (independentlyDecodable && (keyframes.length === 0 || keyframes[0] !== firstPts)) {
    fail(path, 'independently decodable segment must begin with a keyframe at firstPts');
  }
  return keyframes;
}

export function normalizeNativeSegment(segment = {}, context = {}) {
  let path = cleanString(context.path, 'nativeSegment') || 'nativeSegment';
  requireObject(segment, path);

  let independentlyDecodable = segment.independentlyDecodable ?? context.independentlyDecodable ?? true;
  if (typeof independentlyDecodable !== 'boolean') {
    fail(`${path}.independentlyDecodable`, 'must be a boolean');
  }

  let frameRange = requireObject(segment.frameRange, `${path}.frameRange`);
  let start = nonNegativeInteger(frameRange.start, `${path}.frameRange.start`);
  let end = nonNegativeInteger(frameRange.end, `${path}.frameRange.end`);
  if (end < start) fail(`${path}.frameRange.end`, 'must be >= frameRange.start');
  let expectedFrameCount = end - start + 1;
  let frameCount = positiveInteger(segment.frameCount, `${path}.frameCount`);
  if (frameCount !== expectedFrameCount) {
    fail(`${path}.frameCount`, `must equal ${expectedFrameCount} (frameRange.end - frameRange.start + 1)`);
  }

  let captureRange = normalizeInclusiveFrameRange(segment.captureRange, `${path}.captureRange`);
  if (captureRange.start > start) fail(`${path}.captureRange.start`, 'must be <= frameRange.start');
  if (captureRange.end < end) fail(`${path}.captureRange.end`, 'must be >= frameRange.end');
  let prerollFrames = nonNegativeInteger(segment.prerollFrames, `${path}.prerollFrames`);
  let postrollFrames = nonNegativeInteger(segment.postrollFrames, `${path}.postrollFrames`);
  let expectedPreroll = start - captureRange.start;
  let expectedPostroll = captureRange.end - end;
  if (prerollFrames !== expectedPreroll) {
    fail(`${path}.prerollFrames`, `must equal frameRange.start - captureRange.start (${expectedPreroll})`);
  }
  if (postrollFrames !== expectedPostroll) {
    fail(`${path}.postrollFrames`, `must equal captureRange.end - frameRange.end (${expectedPostroll})`);
  }

  let timeRange = requireObject(segment.timeRange, `${path}.timeRange`);
  let startTicks = nonNegativeInteger(timeRange.startTicks, `${path}.timeRange.startTicks`);
  let endTicks = nonNegativeInteger(timeRange.endTicks, `${path}.timeRange.endTicks`);
  if (endTicks < startTicks) fail(`${path}.timeRange.endTicks`, 'must be >= timeRange.startTicks');

  let firstPts = nonNegativeInteger(segment.firstPts, `${path}.firstPts`);
  let lastPts = nonNegativeInteger(segment.lastPts, `${path}.lastPts`);
  if (lastPts < firstPts) fail(`${path}.lastPts`, 'must be >= firstPts');

  let frameDurationTicks = positiveInteger(segment.frameDurationTicks, `${path}.frameDurationTicks`);
  let frameRate = normalizeRational(segment.frameRate, `${path}.frameRate`);
  let timeBase = normalizeRational(segment.timeBase, `${path}.timeBase`);
  if (frameDurationTicks * frameRate.num * timeBase.num !== frameRate.den * timeBase.den) {
    fail(`${path}.frameDurationTicks`, 'must be consistent with frameRate and timeBase');
  }
  let expectedLastPts = firstPts + (frameCount - 1) * frameDurationTicks;
  if (lastPts !== expectedLastPts) {
    fail(`${path}.lastPts`, `must equal firstPts + (frameCount - 1) * frameDurationTicks (${expectedLastPts})`);
  }
  if (startTicks !== firstPts) fail(`${path}.timeRange.startTicks`, `must equal firstPts (${firstPts})`);
  if (endTicks !== lastPts) fail(`${path}.timeRange.endTicks`, `must equal lastPts (${lastPts})`);

  let keyframePts = normalizeKeyframePts(
    segment.keyframePts,
    firstPts,
    lastPts,
    independentlyDecodable,
    `${path}.keyframePts`,
  );

  let audioCodec = cleanString(segment.audioCodec, '') || null;
  let color = normalizeColorGroup(segment, path);
  let audio = normalizeAudioGroup(segment, audioCodec, path);

  let normalized = {
    version: resolveVersion(segment.version, `${path}.version`),
    id: requiredString(segment.id, `${path}.id`),
    tier: normalizeExecutionTier(segment.tier, `${path}.tier`),
    container: requiredString(segment.container, `${path}.container`),
    videoCodec: requiredString(segment.videoCodec, `${path}.videoCodec`),
    audioCodec,
    width: positiveInteger(segment.width, `${path}.width`),
    height: positiveInteger(segment.height, `${path}.height`),
    dpr: positiveNumber(segment.dpr, `${path}.dpr`),
    ...color,
    frameRate,
    timeBase,
    frameDurationTicks,
    frameRange: { start, end },
    captureRange,
    prerollFrames,
    postrollFrames,
    frameCount,
    timeRange: { startTicks, endTicks },
    firstPts,
    lastPts,
    keyframePts,
    independentlyDecodable,
    settingsHash: normalizeHash(segment.settingsHash, `${path}.settingsHash`),
    sourceHash: normalizeHash(segment.sourceHash, `${path}.sourceHash`),
    videoExtradataHash: normalizeHash(segment.videoExtradataHash, `${path}.videoExtradataHash`),
    streamLayoutHash: normalizeHash(segment.streamLayoutHash, `${path}.streamLayoutHash`),
    ...audio,
  };

  for (let ref of OPTIONAL_REFS) {
    let value = cleanString(segment[ref], '');
    if (value) normalized[ref] = value;
  }
  if (segment.proof !== undefined && segment.proof !== null) {
    normalized.proof = requireObject(segment.proof, `${path}.proof`);
  }

  return normalized;
}

export function segmentCompatibilityKey(segment = {}) {
  let n = normalizeNativeSegment(segment);
  return {
    container: n.container,
    videoCodec: n.videoCodec,
    width: n.width,
    height: n.height,
    frameRate: rationalKey(n.frameRate),
    timeBase: rationalKey(n.timeBase),
    pixelFormat: n.pixelFormat,
    colorSpace: n.colorSpace,
    colorPrimaries: n.colorPrimaries,
    colorTransfer: n.colorTransfer,
    colorRange: n.colorRange,
    chromaLocation: n.chromaLocation,
    videoExtradataHash: n.videoExtradataHash,
    streamLayoutHash: n.streamLayoutHash,
    audioCodec: n.audioCodec,
    audioSampleRate: n.audioSampleRate,
    audioChannels: n.audioChannels,
    audioChannelLayout: n.audioChannelLayout,
    audioTimeBase: rationalKey(n.audioTimeBase),
    audioExtradataHash: n.audioExtradataHash,
  };
}

function normalizeInclusiveFrameRange(value, path) {
  requireObject(value, path);
  let start = nonNegativeInteger(value.start, `${path}.start`);
  let end = nonNegativeInteger(value.end, `${path}.end`);
  if (end < start) fail(`${path}.end`, 'must be >= start');
  return { start, end };
}

function normalizeJobContinuation(value, tier, path) {
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
    return {
      mode: 'replay',
      replayRef: requiredString(value.replayRef, `${path}.replayRef`),
      replayEvidenceHash: normalizeHash(value.replayEvidenceHash, `${path}.replayEvidenceHash`),
    };
  }
  if (mode !== 'checkpoint') fail(`${path}.mode`, 'must be "checkpoint" for checkpointed-deterministic');
  return {
    mode: 'checkpoint',
    checkpointRef: requiredString(value.checkpointRef, `${path}.checkpointRef`),
    checkpointHash: normalizeHash(value.checkpointHash, `${path}.checkpointHash`),
  };
}

function normalizeJobUiClock(value, tier, path) {
  requireObject(value, path);
  let mode = cleanString(value.mode, '');
  if (!UI_CLOCK_MODES.includes(mode)) {
    fail(`${path}.mode`, `must be one of ${UI_CLOCK_MODES.join(', ')}`);
  }
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
    normalized.clockEquivalenceProofRef = requiredString(
      value.clockEquivalenceProofRef,
      `${path}.clockEquivalenceProofRef`,
    );
  }
  return normalized;
}

function normalizeViewport(value, path) {
  requireObject(value, path);
  return {
    width: positiveInteger(value.width, `${path}.width`),
    height: positiveInteger(value.height, `${path}.height`),
    dpr: positiveNumber(value.dpr, `${path}.dpr`),
  };
}

export function normalizeNativeSegmentJob(job = {}, context = {}) {
  let path = cleanString(context.path, 'nativeSegmentJob') || 'nativeSegmentJob';
  requireObject(job, path);

  let tier = normalizeExecutionTier(job.tier, `${path}.tier`);

  let logicalRange = normalizeInclusiveFrameRange(job.logicalRange, `${path}.logicalRange`);
  let captureRange = normalizeInclusiveFrameRange(job.captureRange, `${path}.captureRange`);
  if (captureRange.start > logicalRange.start) {
    fail(`${path}.captureRange.start`, 'must be <= logicalRange.start');
  }
  if (captureRange.end < logicalRange.end) {
    fail(`${path}.captureRange.end`, 'must be >= logicalRange.end');
  }

  let prerollFrames = nonNegativeInteger(job.prerollFrames, `${path}.prerollFrames`);
  let postrollFrames = nonNegativeInteger(job.postrollFrames, `${path}.postrollFrames`);
  let expectedPreroll = logicalRange.start - captureRange.start;
  let expectedPostroll = captureRange.end - logicalRange.end;
  if (prerollFrames !== expectedPreroll) {
    fail(`${path}.prerollFrames`, `must equal logicalRange.start - captureRange.start (${expectedPreroll})`);
  }
  if (postrollFrames !== expectedPostroll) {
    fail(`${path}.postrollFrames`, `must equal captureRange.end - logicalRange.end (${expectedPostroll})`);
  }

  let continuation = normalizeJobContinuation(job.continuation, tier, `${path}.continuation`);
  let uiClock = normalizeJobUiClock(job.uiClock, tier, `${path}.uiClock`);
  let viewport = normalizeViewport(job.viewport, `${path}.viewport`);

  let frameRate = normalizeRational(job.frameRate, `${path}.frameRate`);
  let timeBase = normalizeRational(job.timeBase, `${path}.timeBase`);
  let frameDurationTicks = positiveInteger(job.frameDurationTicks, `${path}.frameDurationTicks`);
  if (frameDurationTicks * timeBase.num * frameRate.num !== timeBase.den * frameRate.den) {
    fail(`${path}.frameDurationTicks`, 'must be consistent with frameRate and timeBase');
  }

  let container = requiredString(job.container, `${path}.container`);
  let videoCodec = requiredString(job.videoCodec, `${path}.videoCodec`);

  let capability = normalizeCapabilityRequest(job.capability);
  if (capability.tier !== tier) {
    fail(`${path}.capability.tier`, `must equal job tier "${tier}"`);
  }
  if (capability.encoder.requiredCodec && capability.encoder.requiredCodec !== videoCodec) {
    fail(
      `${path}.capability.encoder.requiredCodec`,
      `must equal job videoCodec "${videoCodec}"`,
    );
  }

  let color = normalizeColorGroup(job, path);
  let audioCodec = cleanString(job.audioCodec, '') || null;
  let audio = normalizeAudioGroup(job, audioCodec, path);

  let normalized = {
    version: resolveExactVersion(job.version, NATIVE_SEGMENT_JOB_VERSION, `${path}.version`),
    tier,
    logicalRange,
    captureRange,
    prerollFrames,
    postrollFrames,
    continuation,
    uiClock,
    viewport,
    frameRate,
    timeBase,
    frameDurationTicks,
    capability,
    container,
    videoCodec,
    ...color,
    audioCodec,
    ...audio,
    sourceHash: normalizeHash(job.sourceHash, `${path}.sourceHash`),
    settingsHash: normalizeHash(job.settingsHash, `${path}.settingsHash`),
    timeoutMs: positiveInteger(job.timeoutMs, `${path}.timeoutMs`),
    cancellationRef: normalizePortableRef(job.cancellationRef, `${path}.cancellationRef`),
    cleanupRef: normalizePortableRef(job.cleanupRef, `${path}.cleanupRef`),
  };

  return normalized;
}

export function normalizeSeamBoundary(boundary = {}, path = 'seamBoundary') {
  requireObject(boundary, path);
  let version = cleanString(boundary.version, '');
  if (version !== RENDER_SEAM_INPUT_VERSION) {
    fail(`${path}.version`, `must equal "${RENDER_SEAM_INPUT_VERSION}"`);
  }
  let owner = cleanString(boundary.overlapOwner, '');
  if (!RENDER_SEAM_OWNERSHIP.includes(owner)) {
    fail(`${path}.overlapOwner`, `must be one of ${RENDER_SEAM_OWNERSHIP.join(', ')}`);
  }
  let normalized = { version: RENDER_SEAM_INPUT_VERSION, overlapOwner: owner };
  if (boundary.exactPixelsMatch !== undefined && boundary.exactPixelsMatch !== null) {
    if (typeof boundary.exactPixelsMatch !== 'boolean') {
      fail(`${path}.exactPixelsMatch`, 'must be a boolean');
    }
    normalized.exactPixelsMatch = boundary.exactPixelsMatch;
  }
  let boundaryIdentity = cleanString(boundary.boundaryIdentity, '');
  if (boundaryIdentity) normalized.boundaryIdentity = boundaryIdentity;
  let prevBoundaryIdentity = cleanString(boundary.prevBoundaryIdentity, '');
  if (prevBoundaryIdentity) normalized.prevBoundaryIdentity = prevBoundaryIdentity;
  if (boundary.ssim !== undefined && boundary.ssim !== null && boundary.ssim !== '') {
    let ssim = Number(boundary.ssim);
    if (!Number.isFinite(ssim) || ssim < 0 || ssim > 1) {
      fail(`${path}.ssim`, 'must be a number in [0, 1]');
    }
    normalized.ssim = ssim;
  }
  return normalized;
}
