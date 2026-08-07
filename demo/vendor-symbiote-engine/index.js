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
  buildResourceTreeFromEntries,
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
  normalizeResourceTree,
  normalizeResourceTreeItem,
  normalizeAudioProviderDescriptor,
  normalizeRenderArtifact,
  normalizeRenderJob,
  normalizeRenderProvider,
  normalizeSourceDocument,
  normalizeVoiceReference,
} from './contracts/index.js';

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
  createRenderRetentionCleanup,
  didCleanupRemovePaths,
  normalizeRenderSeed,
} from './render-cache.js';
export { createRenderJobCacheKey, createRenderProviderJobQueue } from './render-jobs.js';
export {
  buildCaptionCues,
  captionAttributionForRange,
  captionCueHasWordTimings,
  captionCuesFromClipTranscripts,
  captionCuesFromTranscript,
  captionTranscriptDurationSec,
  captionWordTimeSeconds,
  overlapMs,
  renderAss,
  renderVtt,
  resolveCaptionStyle,
} from './render-captions.js';
export {
  RENDER_PROOF_MANIFEST_STATE_FIELDS,
  buildAudioConcatArgs,
  buildAudioConcatListLine,
  buildAudioMuxArgs,
  buildAudioOverlapMixArgs,
  buildFrameSequenceEncodeArgs,
  buildRenderProofManifestProjection,
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
} from './render-lifecycle.js';
export {
  buildRenderAudioLayerProof,
  buildRenderAvSyncProof,
  countClipOverlaps,
  durationDriftMs,
  findProbeStream,
  normalizeProbeStreams,
  renderAuthorityDurationSec,
  streamDurationSec,
} from './render-proof.js';
export { createStageProgressTracker } from './render-progress.js';
export { createLocalAudioTtsProvider } from './providers/local-audio-tts.js';
export { createLocalAudioTranscribeProvider } from './providers/local-audio-transcribe.js';
