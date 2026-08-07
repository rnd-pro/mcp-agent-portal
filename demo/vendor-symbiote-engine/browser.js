/**
 * Browser-safe symbiote-engine runtime API.
 *
 * This entrypoint excludes Node-only server, CLI, handler loading, and
 * file-watch helpers so UI packages can import engine primitives in browsers
 * without pulling node:* modules into the client runtime.
 *
 * @module symbiote-engine/browser
 */

export { Graph } from './Graph.js';
export { Executor } from './Executor.js';
export { GraphHistory } from './History.js';
export { nanoid } from './nanoid.js';

export {
  registerNodeType,
  registerPack,
  getNodeType,
  listDrivers,
  findCompatible,
  findByCapability,
  getNodeMenu,
  registerCustomDrivers,
  validateParams,
  listPacks,
  clearRegistry,
} from './Registry.js';

export {
  registerSocketType,
  registerSocketTypes,
  getSocketType,
  getAllSocketTypes,
  areSocketsCompatible,
} from './SocketTypes.js';

export { serialize, deserialize, downloadGraph } from './Persistence.js';
export { runLifecycle } from './Lifecycle.js';
export * as AgentUI from './AgentUICommands.js';
export { FocusController } from './FocusController.js';

export {
  AUDIO_SYNTHESIS_RECEIPT_HEADER,
  AUDIO_SYNTHESIS_RECEIPT_VERSION,
  buildResourceTreeFromEntries,
  canonicalAudioSynthesisJson,
  createAudioProviderNotReadyError,
  createMemoryPersistenceAdapter,
  createAudioCacheKey,
  createAudioProviderRegistry,
  createPersistenceAdapter,
  createSourceDocument,
  createRenderProviderRegistry,
  isAudioProviderNotReadyError,
  normalizeAudioArtifact,
  normalizeAudioJob,
  normalizeAudioProvider,
  normalizeAudioProviderReadiness,
  normalizeAudioSynthesisReceipt,
  normalizeResourceTree,
  normalizeResourceTreeItem,
  normalizeAudioProviderDescriptor,
  normalizeRenderArtifact,
  normalizeRenderJob,
  normalizeRenderProvider,
  normalizeSourceDocument,
  normalizeVoiceReference,
} from './contracts/index.js';

export {
  BROWSER_CODEC_SUPPORT_VERSION,
  NATIVE_SEGMENT_ARTIFACT_VERSION,
  NATIVE_SEGMENT_JOB_VERSION,
  RENDER_ACCELERATION_PROBES,
  RENDER_ACCELERATION_ROLES,
  RENDER_CAPABILITY_CONTRACT_VERSION,
  RENDER_DIAGNOSTIC_SURFACES,
  RENDER_EXECUTION_TIERS,
  RENDER_SEAM_INPUT_VERSION,
  RENDER_SEAM_OWNERSHIP,
  RENDER_SEAM_POLICIES,
  UI_CLOCK_MODES,
  accelerationCandidateProven,
  normalizeAccelerationCandidate,
  normalizeAccelerationSelection,
  normalizeBrowserCodecSupport,
  normalizeCapabilityRequest,
  normalizeExecutionTier,
  normalizeNativeSegment,
  normalizeNativeSegmentJob,
  normalizeRational,
  normalizeSeamBoundary,
  normalizeSeamPolicy,
  segmentCompatibilityKey,
} from './contracts/index.js';

export {
  CAPTION_PRESENTATION_TRACK_VERSION,
  buildCaptionCues,
  captionAttributionForRange,
  captionCueHasWordTimings,
  captionCuesFromClipTranscripts,
  captionCuesFromTimedWords,
  captionCuesFromTranscript,
  captionTranscriptDurationSec,
  captionWordTimeSeconds,
  overlapMs,
  assertCaptionPlacementTrack,
  buildCaptionPlacementTrack,
  renderAss,
  renderVtt,
  resolveCaptionProfile,
  parseAss,
  joinCaptionArtifacts,
} from './render-captions.js';
