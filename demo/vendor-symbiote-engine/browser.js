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
