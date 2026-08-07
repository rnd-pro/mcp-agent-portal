const RENDER_PROVIDER_KINDS = new Set(['screencast']);
const RENDER_ARTIFACT_KINDS = new Set(['screencast', 'frame-sequence']);
const AUDIO_PROVIDER_KINDS = new Set(['browser-tts', 'local-tts', 'local-transcribe']);

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

function normalizeKind(value, supported, fallback, path) {
  let kind = cleanString(value, fallback);
  if (!supported.has(kind)) {
    fail(path, `unsupported kind "${kind}". Supported: ${[...supported].join(', ')}`);
  }
  return kind;
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
    return {
      workerIndex: optionalNonNegativeInteger(range.workerIndex, `renderArtifact.capture.workerRanges[${index}].workerIndex`) ?? index,
      startFrame: optionalNonNegativeInteger(range.startFrame, `renderArtifact.capture.workerRanges[${index}].startFrame`) ?? 0,
      endFrame: optionalNonNegativeInteger(range.endFrame, `renderArtifact.capture.workerRanges[${index}].endFrame`) ?? 0,
      frameCount: positiveInteger(range.frameCount, undefined, `renderArtifact.capture.workerRanges[${index}].frameCount`),
      warmupDurationMs: optionalNonNegativeNumber(range.warmupDurationMs, `renderArtifact.capture.workerRanges[${index}].warmupDurationMs`) ?? 0,
      captureDurationMs: optionalNonNegativeNumber(range.captureDurationMs, `renderArtifact.capture.workerRanges[${index}].captureDurationMs`) ?? 0,
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
    setupStateHash: cleanString(capture.setupStateHash, ''),
    seamProofs,
    workerRanges,
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
  return {
    ...job,
    id: cleanString(job.id, 'render-job') || 'render-job',
    kind,
    providerId,
  };
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
      let result = await provider.execute(normalizedJob, options);
      return normalizeRenderArtifact(result, {
        providerId: provider.id,
        kind: provider.kind,
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
