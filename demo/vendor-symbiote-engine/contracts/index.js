export {
  buildResourceTreeFromEntries,
  normalizeResourceTree,
  normalizeResourceTreeItem,
} from './resource-tree.js';

export {
  createSourceDocument,
  normalizeSourceDocument,
} from './source-document.js';

export {
  createMemoryPersistenceAdapter,
  createPersistenceAdapter,
} from './persistence-adapter.js';

export {
  createRenderProviderRegistry,
  normalizeAudioProviderDescriptor,
  normalizeRenderArtifact,
  normalizeRenderJob,
  normalizeRenderProvider,
} from './render-provider.js';

export {
  RENDER_ACCELERATION_PROBES,
  RENDER_ACCELERATION_ROLES,
  RENDER_CAPABILITY_CONTRACT_VERSION,
  RENDER_DIAGNOSTIC_SURFACES,
  RENDER_EXECUTION_TIERS,
  accelerationCandidateProven,
  normalizeAccelerationCandidate,
  normalizeAccelerationSelection,
  normalizeCapabilityRequest,
  normalizeExecutionTier,
} from './render-capability.js';

export {
  NATIVE_SEGMENT_ARTIFACT_VERSION,
  NATIVE_SEGMENT_JOB_VERSION,
  RENDER_SEAM_INPUT_VERSION,
  RENDER_SEAM_OWNERSHIP,
  RENDER_SEAM_POLICIES,
  UI_CLOCK_MODES,
  normalizeNativeSegment,
  normalizeNativeSegmentJob,
  normalizeRational,
  normalizeSeamBoundary,
  normalizeSeamPolicy,
  segmentCompatibilityKey,
} from './render-segment.js';

export {
  BROWSER_CODEC_SUPPORT_VERSION,
  normalizeBrowserCodecSupport,
} from './browser-codec.js';

export {
  AUDIO_SYNTHESIS_RECEIPT_HEADER,
  AUDIO_SYNTHESIS_RECEIPT_VERSION,
  canonicalAudioSynthesisJson,
  createAudioProviderNotReadyError,
  createAudioCacheKey,
  createAudioProviderRegistry,
  isAudioProviderNotReadyError,
  normalizeAudioArtifact,
  normalizeAudioJob,
  normalizeAudioProvider,
  normalizeAudioProviderReadiness,
  normalizeAudioSynthesisReceipt,
  normalizeVoiceReference,
} from './audio-provider.js';
