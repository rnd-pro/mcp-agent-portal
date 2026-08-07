/**
 * symbiote-engine - Universal node-based execution engine *
 * AI-first, domain-agnostic graph runtime.
 * Zero dependencies, pure ESM.
 *
 * @module symbiote-engine */


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


export { serialize, deserialize, saveToFile, loadFromFile } from './Persistence.js';


export { runLifecycle } from './Lifecycle.js';


export { loadHandlers, watchHandlers } from './HandlerLoader.js';


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

export { RENDER_SELECTION_VERSION, selectRenderAcceleration } from './render-selection.js';
export { planSegmentConcat } from './render-segments.js';
export { RENDER_ADMISSION_VERSION, admitRenderRequest } from './render-admission.js';

export { createLocalBrowserScreencastProvider } from './providers/local-browser-screencast.js';
export {
  createRenderFrameCompletionTracker,
  partitionRenderFrameRanges,
} from './render-workers.js';
export { createFileArtifactStore } from './artifacts.js';
export { createAudioProviderJobQueue } from './provider-jobs.js';
export {
  RENDER_CACHE_PROJECTION_VERSION,
  buildRenderCleanupProofPatch,
  createMemoryFrameCacheStore,
  createRenderFrameCacheKey,
  createRenderOutputCacheKey,
  createRenderSeedProjection,
  createRenderSegmentCacheKey,
  createRenderRetentionCleanup,
  didCleanupRemovePaths,
  invalidateRenderSegmentRanges,
  normalizeRenderSeed,
} from './render-cache.js';
export { createRenderJobCacheKey, createRenderProviderJobQueue } from './render-jobs.js';
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
export {
  RENDER_PROOF_MANIFEST_STATE_FIELDS,
  buildAudioConcatArgs,
  buildAudioConcatListLine,
  buildAudioMuxArgs,
  buildAudioOverlapMixArgs,
  buildFrameSequenceEncodeArgs,
  buildRenderProofManifestProjection,
  buildSegmentConcatArgs,
  buildSegmentConcatListLine,
  parseFfprobeJson,
  projectRenderProofManifestState,
} from './render-finalize.js';
export {
  buildRenderQueueSnapshot,
  buildTerminalRenderJobPatch,
  classifyRenderError,
  createRenderCanceledError,
  createRenderTimeoutError,
  isRenderTimeout,
  isTerminalRenderStatus,
  mapRenderEventToProgress,
  reconcileTerminalRenderStatus,
} from './render-lifecycle.js';
export {
  RENDER_FRAME_COMPLETENESS_PROOF_VERSION,
  RENDER_PERFORMANCE_PROOF_VERSION,
  RENDER_SEGMENT_SEAM_PROOF_VERSION,
  RENDER_STREAM_PTS_PROOF_VERSION,
  RENDER_WORKER_CAPACITY_PROOF_VERSION,
  buildRenderAudioLayerProof,
  buildRenderAvSyncProof,
  buildRenderFrameCompletenessProof,
  buildRenderPerformanceProof,
  buildRenderSegmentSeamProof,
  buildRenderStreamPtsProof,
  buildRenderWorkerCapacityProof,
  countClipOverlaps,
  durationDriftMs,
  findProbeStream,
  normalizeProbeStreams,
  renderAuthorityDurationSec,
  streamDurationSec,
} from './render-proof.js';
export { createStageProgressTracker } from './render-progress.js';
export {
  createAudioArtifactHash,
  createAudioSynthesisReceiptHmac,
  createAudioSynthesisRequestHash,
  createLocalAudioTtsProvider,
  parseAudioSynthesisReceipt,
  verifyAudioSynthesisReceipt,
} from './providers/local-audio-tts.js';
export { createLocalAudioTranscribeProvider } from './providers/local-audio-transcribe.js';
