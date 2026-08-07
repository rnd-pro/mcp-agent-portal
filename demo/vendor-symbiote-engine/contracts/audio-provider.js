const AUDIO_PROVIDER_KINDS = new Set(['browser-tts', 'local-tts', 'local-transcribe']);
const AUDIO_JOB_KINDS = new Set(['tts', 'transcribe']);
const AUDIO_PRIORITIES = new Set(['interactive', 'batch']);
const AUDIO_ARTIFACT_MIME_TYPES = new Set(['audio/wav', 'audio/x-wav', 'audio/mpeg', 'audio/mp3', 'audio/ogg']);
const PROVIDER_JOB_KIND = Object.freeze({
  'browser-tts': 'tts',
  'local-tts': 'tts',
  'local-transcribe': 'transcribe',
});
const SHA256_ARTIFACT_RE = /^sha256:[a-f0-9]{64}$/;
const SHA256_DIGEST_RE = /^[a-f0-9]{64}$/;
const SAFE_TOKEN_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

export const AUDIO_SYNTHESIS_RECEIPT_VERSION = 'symbiote-audio-synthesis-receipt-v2';
export const AUDIO_SYNTHESIS_RECEIPT_HEADER = 'X-Audio-Receipt';

function fail(path, message) {
  throw new Error(`${path}: ${message}`);
}

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function cloneJson(value) {
  if (value === undefined) return undefined;
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (isObject(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function stableHash(value) {
  let text = stableJson(value);
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

function cleanString(value, fallback = '') {
  let text = String(value ?? fallback ?? '').replace(/\s+/g, ' ').trim();
  return text && text !== 'undefined' && text !== 'null' ? text : String(fallback || '').trim();
}

function requireObject(value, path) {
  if (!isObject(value)) fail(path, 'must be an object');
  return value;
}

function normalizeKind(value, supported, fallback, path) {
  let kind = cleanString(value, fallback);
  if (!supported.has(kind)) {
    fail(path, `unsupported kind "${kind}". Supported: ${[...supported].join(', ')}`);
  }
  return kind;
}

function positiveNumber(value, fallback, path) {
  let number = Number(value ?? fallback);
  if (!Number.isFinite(number) || number <= 0) fail(path, 'must be a positive number');
  return number;
}

function nonNegativeNumber(value, fallback, path) {
  let number = Number(value ?? fallback);
  if (!Number.isFinite(number) || number < 0) fail(path, 'must be a non-negative number');
  return number;
}

function positiveInteger(value, fallback, path) {
  return Math.round(positiveNumber(value, fallback, path));
}

function strictPositiveInteger(value, path) {
  let number = Number(value);
  if (!Number.isInteger(number) || number <= 0) fail(path, 'must be a positive integer');
  return number;
}

function requireExactKeys(value, keys, path) {
  let actual = Object.keys(value).sort();
  let expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    fail(path, `must contain exactly: ${expected.join(', ')}`);
  }
}

function requireDigest(value, path) {
  let digest = cleanString(value, '');
  if (!SHA256_DIGEST_RE.test(digest)) fail(path, 'must be a lowercase 64-character hex digest');
  return digest;
}

function requireString(value, path) {
  let text = cleanString(value, '');
  if (!text) fail(path, 'is required');
  return text;
}

function requireSafeToken(value, path) {
  let token = requireString(value, path);
  if (!SAFE_TOKEN_RE.test(token)) fail(path, 'must be a safe token');
  return token;
}

function requireBoolean(value, path) {
  if (typeof value !== 'boolean') fail(path, 'must be a boolean');
  return value;
}

function requireFiniteNumberInRange(value, min, max, path, inclusive = true) {
  if (typeof value !== 'number' || !Number.isFinite(value)) fail(path, 'must be a finite number');
  let inRange = inclusive ? value >= min && value <= max : value > min && value < max;
  if (!inRange) {
    fail(path, `must be ${inclusive ? 'between' : 'strictly between'} ${min} and ${max}`);
  }
  return value;
}

function assertPortableId(value, path) {
  let id = cleanString(value, '');
  if (!id) fail(path, 'is required');
  if (/^[a-z]+:\/\//i.test(id) || id.startsWith('file:')) fail(path, 'must not be a URL');
  if (id.startsWith('/') || id.startsWith('~/') || id.startsWith('./') || id.startsWith('../') || /^[A-Za-z]:[\\/]/.test(id)) {
    fail(path, 'must not be a path');
  }
  return id;
}

function normalizeArtifactId(value, path = 'audioArtifact.artifactId') {
  let id = cleanString(value, '');
  if (!SHA256_ARTIFACT_RE.test(id)) fail(path, 'must be sha256:<64 hex>');
  return id;
}

export function normalizeVoiceReference(reference = {}) {
  if (typeof reference === 'string') {
    return { id: assertPortableId(reference, 'voiceReference.id') };
  }
  requireObject(reference, 'voiceReference');
  return {
    ...cloneJson(reference),
    id: assertPortableId(reference.id, 'voiceReference.id'),
  };
}

export function canonicalAudioSynthesisJson(value) {
  return stableJson(value);
}

export function normalizeAudioSynthesisReceipt(receipt = {}) {
  requireObject(receipt, 'synthesisReceipt');
  requireExactKeys(receipt, [
    'receiptVersion',
    'requestHash',
    'requestedVoiceRef',
    'resolvedVoiceRef',
    'speakerAttestation',
    'speakerProbe',
    'normalization',
    'model',
    'language',
    'sampleRate',
    'durationMs',
    'artifactHash',
    'receiptHmac',
  ], 'synthesisReceipt');
  if (receipt.receiptVersion !== AUDIO_SYNTHESIS_RECEIPT_VERSION) {
    fail('synthesisReceipt.receiptVersion', `must be "${AUDIO_SYNTHESIS_RECEIPT_VERSION}"`);
  }
  let model = requireObject(receipt.model, 'synthesisReceipt.model');
  requireExactKeys(model, ['family', 'versionToken'], 'synthesisReceipt.model');
  let speakerProbe = requireObject(receipt.speakerProbe, 'synthesisReceipt.speakerProbe');
  requireExactKeys(speakerProbe, [
    'probeFamily',
    'probeVersionToken',
    'enrollmentRevision',
    'segmentationRevision',
    'segmentCount',
    'enrolledVoiceMatch',
    'segmentsConsistent',
    'maxEnrolledDistance',
    'minOtherVoiceMargin',
    'maxSegmentDistance',
    'thresholds',
  ], 'synthesisReceipt.speakerProbe');
  let thresholds = requireObject(speakerProbe.thresholds, 'synthesisReceipt.speakerProbe.thresholds');
  requireExactKeys(thresholds, [
    'enrolledDistanceMax',
    'otherVoiceMarginMin',
    'segmentDistanceMax',
  ], 'synthesisReceipt.speakerProbe.thresholds');
  let normalization = requireObject(receipt.normalization, 'synthesisReceipt.normalization');
  requireExactKeys(normalization, [
    'version',
    'applied',
    'targetLufs',
    'truePeakLimitDbfs',
  ], 'synthesisReceipt.normalization');
  let speakerAttestation = requireDigest(receipt.speakerAttestation, 'synthesisReceipt.speakerAttestation');
  return {
    receiptVersion: AUDIO_SYNTHESIS_RECEIPT_VERSION,
    requestHash: requireDigest(receipt.requestHash, 'synthesisReceipt.requestHash'),
    requestedVoiceRef: assertPortableId(receipt.requestedVoiceRef, 'synthesisReceipt.requestedVoiceRef'),
    resolvedVoiceRef: assertPortableId(receipt.resolvedVoiceRef, 'synthesisReceipt.resolvedVoiceRef'),
    speakerAttestation,
    speakerProbe: {
      probeFamily: requireSafeToken(speakerProbe.probeFamily, 'synthesisReceipt.speakerProbe.probeFamily'),
      probeVersionToken: requireDigest(speakerProbe.probeVersionToken, 'synthesisReceipt.speakerProbe.probeVersionToken'),
      enrollmentRevision: requireDigest(speakerProbe.enrollmentRevision, 'synthesisReceipt.speakerProbe.enrollmentRevision'),
      segmentationRevision: requireSafeToken(speakerProbe.segmentationRevision, 'synthesisReceipt.speakerProbe.segmentationRevision'),
      segmentCount: strictPositiveInteger(speakerProbe.segmentCount, 'synthesisReceipt.speakerProbe.segmentCount'),
      enrolledVoiceMatch: requireBoolean(speakerProbe.enrolledVoiceMatch, 'synthesisReceipt.speakerProbe.enrolledVoiceMatch'),
      segmentsConsistent: requireBoolean(speakerProbe.segmentsConsistent, 'synthesisReceipt.speakerProbe.segmentsConsistent'),
      maxEnrolledDistance: requireFiniteNumberInRange(speakerProbe.maxEnrolledDistance, 0, 2, 'synthesisReceipt.speakerProbe.maxEnrolledDistance'),
      minOtherVoiceMargin: requireFiniteNumberInRange(speakerProbe.minOtherVoiceMargin, -2, 2, 'synthesisReceipt.speakerProbe.minOtherVoiceMargin'),
      maxSegmentDistance: requireFiniteNumberInRange(speakerProbe.maxSegmentDistance, 0, 2, 'synthesisReceipt.speakerProbe.maxSegmentDistance'),
      thresholds: {
        enrolledDistanceMax: requireFiniteNumberInRange(thresholds.enrolledDistanceMax, 0, 2, 'synthesisReceipt.speakerProbe.thresholds.enrolledDistanceMax'),
        otherVoiceMarginMin: requireFiniteNumberInRange(thresholds.otherVoiceMarginMin, -2, 2, 'synthesisReceipt.speakerProbe.thresholds.otherVoiceMarginMin'),
        segmentDistanceMax: requireFiniteNumberInRange(thresholds.segmentDistanceMax, 0, 2, 'synthesisReceipt.speakerProbe.thresholds.segmentDistanceMax'),
      },
    },
    normalization: {
      version: requireSafeToken(normalization.version, 'synthesisReceipt.normalization.version'),
      applied: requireBoolean(normalization.applied, 'synthesisReceipt.normalization.applied'),
      targetLufs: requireFiniteNumberInRange(normalization.targetLufs, -40, -5, 'synthesisReceipt.normalization.targetLufs', false),
      truePeakLimitDbfs: requireFiniteNumberInRange(normalization.truePeakLimitDbfs, -12, 0, 'synthesisReceipt.normalization.truePeakLimitDbfs', false),
    },
    model: {
      family: requireString(model.family, 'synthesisReceipt.model.family'),
      versionToken: requireDigest(model.versionToken, 'synthesisReceipt.model.versionToken'),
    },
    language: requireString(receipt.language, 'synthesisReceipt.language'),
    sampleRate: strictPositiveInteger(receipt.sampleRate, 'synthesisReceipt.sampleRate'),
    durationMs: strictPositiveInteger(receipt.durationMs, 'synthesisReceipt.durationMs'),
    artifactHash: requireDigest(receipt.artifactHash, 'synthesisReceipt.artifactHash'),
    receiptHmac: requireDigest(receipt.receiptHmac, 'synthesisReceipt.receiptHmac'),
  };
}

export function normalizeAudioProviderReadiness(readiness = true) {
  if (readiness === true || readiness == null) return { ready: true };
  if (readiness === false) return { ready: false, reason: 'not-ready' };
  requireObject(readiness, 'audioProvider.readiness');
  let ready = readiness.ready === true || readiness.status === 'ready' || readiness.status === 'ok';
  return {
    ready,
    ...(readiness.status !== undefined ? { status: cleanString(readiness.status, '') } : {}),
    ...(readiness.reason !== undefined ? { reason: cleanString(readiness.reason, '') } : {}),
    ...(readiness.code !== undefined ? { code: cleanString(readiness.code, '') } : {}),
    ...(readiness.model !== undefined ? { model: cleanString(readiness.model, '') } : {}),
    ...(readiness.modelVersion !== undefined ? { modelVersion: cleanString(readiness.modelVersion, '') } : {}),
    ...(readiness.accelerator !== undefined ? { accelerator: cleanString(readiness.accelerator, '') } : {}),
    ...(readiness.warmupMs !== undefined ? { warmupMs: nonNegativeNumber(readiness.warmupMs, 0, 'audioProvider.readiness.warmupMs') } : {}),
  };
}

export function createAudioProviderNotReadyError(reason = 'audio provider is not ready', details = {}) {
  let err = new Error(cleanString(reason, 'audio provider is not ready'));
  err.code = 'NOT_READY';
  err.retryable = true;
  err.readiness = normalizeAudioProviderReadiness({
    ready: false,
    reason: err.message,
    ...details,
  });
  return err;
}

export function isAudioProviderNotReadyError(err) {
  return err?.code === 'NOT_READY' || err?.retryable === true && /not.ready|warming|loading/i.test(err?.message || '');
}

export function normalizeAudioProvider(provider = {}) {
  requireObject(provider, 'audioProvider');
  let id = cleanString(provider.id, '');
  if (!id) fail('audioProvider.id', 'is required');
  let kind = normalizeKind(provider.kind, AUDIO_PROVIDER_KINDS, 'local-tts', 'audioProvider.kind');
  if (kind === 'browser-tts') {
    fail('audioProvider.kind', 'browser-tts is live-only and cannot produce cacheable audio artifacts');
  }
  if (typeof provider.execute !== 'function') fail('audioProvider.execute', 'is required');
  let checkReady = provider.checkReady;
  if (checkReady !== undefined && typeof checkReady !== 'function') fail('audioProvider.checkReady', 'must be a function');
  return {
    id,
    kind,
    profile: cleanString(provider.profile, id),
    modelClass: cleanString(provider.modelClass, provider.profile || id),
    modelVersion: cleanString(provider.modelVersion, ''),
    execute: provider.execute,
    ...(checkReady ? { checkReady } : {}),
  };
}

export function normalizeAudioJob(job = {}) {
  requireObject(job, 'audioJob');
  let kind = normalizeKind(job.kind, AUDIO_JOB_KINDS, 'tts', 'audioJob.kind');
  let providerId = cleanString(job.providerId, job.audioProvider?.id);
  if (!providerId) fail('audioJob.providerId', 'is required');
  let input = requireObject(job.input || {}, 'audioJob.input');
  let providerSettings = job.providerSettings === undefined ? {} : requireObject(job.providerSettings, 'audioJob.providerSettings');
  if (input.voiceRef) normalizeVoiceReference(input.voiceRef);
  if (input.voiceReference) normalizeVoiceReference(input.voiceReference);
  if (input.audioRef) normalizeArtifactId(input.audioRef, 'audioJob.input.audioRef');
  let priority = normalizeKind(job.priority, AUDIO_PRIORITIES, 'batch', 'audioJob.priority');
  return {
    id: cleanString(job.id, 'audio-job') || 'audio-job',
    kind,
    providerId,
    ...(job.profile ? { profile: cleanString(job.profile, '') } : {}),
    ...(job.modelClass ? { modelClass: cleanString(job.modelClass, '') } : {}),
    ...(job.modelVersion ? { modelVersion: cleanString(job.modelVersion, '') } : {}),
    providerSettings: cloneJson(providerSettings),
    priority,
    input: cloneJson(input),
  };
}

export function normalizeAudioArtifact(result = {}) {
  requireObject(result, 'audioArtifact');
  let artifactId = normalizeArtifactId(result.artifactId || result.audioRef || result.src, 'audioArtifact.artifactId');
  let mimeType = cleanString(result.mimeType, 'audio/wav');
  let output = {
    artifactId,
    mimeType,
  };
  if (result.durationSec !== undefined || result.duration !== undefined || AUDIO_ARTIFACT_MIME_TYPES.has(mimeType)) {
    let durationFn = AUDIO_ARTIFACT_MIME_TYPES.has(mimeType) ? positiveNumber : nonNegativeNumber;
    output.durationSec = durationFn(result.durationSec, result.duration, 'audioArtifact.durationSec');
  }
  if (AUDIO_ARTIFACT_MIME_TYPES.has(mimeType) || result.sampleRate !== undefined || result.sample_rate !== undefined) {
    output.sampleRate = positiveInteger(result.sampleRate, result.sample_rate, 'audioArtifact.sampleRate');
  }
  if (result.text !== undefined) output.text = cleanString(result.text, '');
  if (Array.isArray(result.words)) output.words = cloneJson(result.words);
  if (result.synthesisReceipt !== undefined) {
    output.synthesisReceipt = normalizeAudioSynthesisReceipt(result.synthesisReceipt);
  }
  return output;
}

export function createAudioCacheKey({
  synthesisReceiptVersion = AUDIO_SYNTHESIS_RECEIPT_VERSION,
  kind = 'tts',
  providerId = '',
  profile = '',
  modelVersion = '',
  providerSettings = {},
  input = {},
} = {}) {
  let normalizedKind = normalizeKind(kind, AUDIO_JOB_KINDS, 'tts', 'audioCache.kind');
  if (normalizedKind === 'tts' && synthesisReceiptVersion !== AUDIO_SYNTHESIS_RECEIPT_VERSION) {
    fail('audioCache.synthesisReceiptVersion', `must be "${AUDIO_SYNTHESIS_RECEIPT_VERSION}"`);
  }
  let normalizedInput = cloneJson(input);
  if (normalizedInput?.voiceRef) {
    normalizedInput.voiceRef = normalizeVoiceReference(normalizedInput.voiceRef).id;
  }
  if (normalizedInput?.voiceReference) {
    normalizedInput.voiceReference = normalizeVoiceReference(normalizedInput.voiceReference).id;
  }
  let identity = {
    kind: normalizedKind,
    providerId: cleanString(providerId, ''),
    profile: cleanString(profile, ''),
    modelVersion: cleanString(modelVersion, ''),
    providerSettings: cloneJson(isObject(providerSettings) ? providerSettings : {}),
    input: normalizedInput,
  };
  if (normalizedKind === 'tts') identity.synthesisReceiptVersion = synthesisReceiptVersion;
  return `audio:${stableHash(identity)}`;
}

export function createAudioProviderRegistry(providers = []) {
  let registry = new Map();

  function register(provider) {
    let normalized = normalizeAudioProvider(provider);
    if (registry.has(normalized.id)) fail('audioProvider.id', `duplicate provider "${normalized.id}"`);
    registry.set(normalized.id, normalized);
    return normalized;
  }

  for (let provider of providers) register(provider);

  return {
    register,
    get(id) {
      return registry.get(cleanString(id, ''));
    },
    list() {
      return [...registry.values()].map(({ id, kind, profile, modelClass, modelVersion }) => ({
        id,
        kind,
        profile,
        modelClass,
        ...(modelVersion ? { modelVersion } : {}),
      }));
    },
    async checkReady(job, options) {
      let normalizedJob = normalizeAudioJob(job);
      let provider = registry.get(normalizedJob.providerId);
      if (!provider) fail('audioJob.providerId', `unknown provider "${normalizedJob.providerId}"`);
      let expectedKind = PROVIDER_JOB_KIND[provider.kind];
      if (expectedKind !== normalizedJob.kind) {
        fail('audioJob.kind', `provider "${provider.id}" handles "${expectedKind}", got "${normalizedJob.kind}"`);
      }
      if (typeof provider.checkReady !== 'function') {
        return {
          ready: true,
          providerId: provider.id,
          profile: provider.profile,
          modelClass: provider.modelClass,
          ...(provider.modelVersion ? { modelVersion: provider.modelVersion } : {}),
        };
      }
      return {
        ...normalizeAudioProviderReadiness(await provider.checkReady(normalizedJob, options)),
        providerId: provider.id,
        profile: provider.profile,
        modelClass: provider.modelClass,
      };
    },
    async execute(job, options) {
      let normalizedJob = normalizeAudioJob(job);
      let provider = registry.get(normalizedJob.providerId);
      if (!provider) fail('audioJob.providerId', `unknown provider "${normalizedJob.providerId}"`);
      let expectedKind = PROVIDER_JOB_KIND[provider.kind];
      if (expectedKind !== normalizedJob.kind) {
        fail('audioJob.kind', `provider "${provider.id}" handles "${expectedKind}", got "${normalizedJob.kind}"`);
      }
      let result = await provider.execute(normalizedJob, options);
      return normalizeAudioArtifact(result);
    },
  };
}
