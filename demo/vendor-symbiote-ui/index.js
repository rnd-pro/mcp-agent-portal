/**
 * symbiote-ui — Node-safe provider UI API.
 *
 * Browser components live in the explicit `symbiote-ui/ui` entrypoint.
 */

export * from './core/index.js';
export * from './graph/index.js';
export * from './locale/index.js';
export * from './runtime/index.js';
export {
  buildResourceTreeFromEntries,
  createMemoryPersistenceAdapter,
  createPersistenceAdapter,
  createSourceDocument,
  normalizeResourceTree,
  normalizeResourceTreeItem,
  normalizeSourceDocument,
} from 'symbiote-engine/contracts';

export {
  NodeShape,
  RectShape,
  PillShape,
  CircleShape,
  DiamondShape,
  CommentShape,
  getShape,
  registerShape,
  SVGShape,
  createSVGShape,
  SVG_PRESETS,
} from './shapes/index.js';

export {
  applyCascadeTheme,
  applyCascadeThemeBundle,
  applyCascadeThemeScope,
  applyCascadeThemeScopes,
  applyCascadeGeometryRegister,
  CASCADE_THEME_DEFAULTS,
  CASCADE_THEME_DESCRIPTOR,
  CASCADE_THEME_REGISTER_STORAGE_SUFFIX,
  CASCADE_THEME_TAB_SHAPES,
  CASCADE_THEME_TOKEN_TARGETS,
  CASCADE_THEME_VARIANTS,
  CASCADE_THEME_VARIANT_PRESETS,
  clearCascadeGeometryRegister,
  clearCascadeThemeInlineTokens,
  createCascadeTheme,
  DEFAULT_PROVIDER_THEME,
  DEFAULT_THEME,
  getCascadeThemeRecipe,
  getCascadeThemeRecipeDescriptor,
  getCascadeThemeRelation,
  getCascadeThemeControls,
  getCascadeThemeVariantPreset,
  getReadableTextForHsl,
  isBoundedThemeOverride,
  isCascadeThemeBundle,
  listCascadeThemeRecipes,
  listCascadeThemeRelations,
  normalizeCascadeGeometryRegister,
  normalizeCascadeTabShape,
  normalizeCascadeThemeOptions,
  normalizeCascadeThemeVariant,
  normalizeThemeOverrides,
  persistCascadeThemeScopeRegister,
  persistCascadeThemeScopeState,
  readCascadeThemeScopeState,
  removeCascadeThemeScopeState,
  resetCascadeThemeScopes,
  resolveCascadeThemeRecipe,
  resolveCascadeThemeScopeTarget,
  resolveCascadeThemeVariantState,
  seedCascadeThemeScopeState,
  serializeCascadeThemeBundle,
  THEME_RECIPE_CATALOG,
  THEME_RECIPE_NAMES,
  THEME_RELATION_DEFINITIONS,
  applyMotion,
  ScopedAnimationScope,
  animateSpring,
  stagger,
  makeDraggable,
  applyTailwindBridge,
  hasTailwind,
  applyThemePresets,
  resolveThemePresets,
  resolveThemePresetsForTask,
  STATUS_HUE_OFFSETS,
  systemCascadeCss,
  ensureSystemCascade,
  undeclaredSystemRoles,
} from './themes/Theme.js';
export {
  encodeCascadeThemeShare,
  decodeCascadeThemeShare,
  CascadeThemeShareError,
} from './themes/cascade-theme-share.js';
export {
  insertCascadeThemeUserPreset,
  listCascadeThemeUserPresets,
  getCascadeThemeUserPreset,
  CascadeThemePresetError,
} from './themes/cascade-theme-presets.js';

export {
  DEFAULT_PROVIDER_PALETTE,
  DEFAULT_PALETTE,
} from './themes/Palette.js';

export { MODERN_SKIN, COMPACT_SKIN, ROUNDED_SKIN } from './themes/Skin.js';
export { CARBON, CARBON_PALETTE } from './themes/carbon.js';
export { PCB_DARK } from './themes/pcb.js';
export { EBOOK, EBOOK_PALETTE } from './themes/ebook.js';
export { NEON_PALETTE } from './themes/neon.js';
export { Readonly } from './plugins/Readonly.js';
export { History } from './plugins/History.js';
export { computeAutoLayout, computeTreeLayout } from './canvas/AutoLayout.js';
export {
  addNodesToGroup,
  createCanvasGraphStore,
  groupNodes,
  normalizeCanvasGraphGroups,
  normalizeCanvasGraphModel,
  removeNodesFromGroup,
  ungroupNodes,
} from './canvas/graph-model.js';
export {
  computeInitialGraphPositions,
  createForceLayoutPayload,
  findForceNodeGroup,
  getDrillableFiles,
  getForceLayoutOptions,
  getGraphCacheKey,
  getOrBuildGraph,
  normalizeForceGroups,
} from './canvas/graph-layout.js';
export {
  MAX_CANVAS_GRAPH_ZOOM,
  MIN_CANVAS_GRAPH_ZOOM,
  resolveCanvasGraphMinZoom,
  resolveCanvasGraphTransitionDuration,
  resolveCanvasGraphViewportFit,
  resolveFitPadding,
  resolveFrameFitZoom,
} from './canvas/CanvasGraph/CanvasGraphViewport.js';
export {
  GRAPH_DIRECTORY_FRAME_COLORS,
  GRAPH_PATH_STYLE_MENU_GROUP,
  GRAPH_PATH_STYLE_MENU_ITEMS,
  GRAPH_PATH_STYLES,
  GRAPH_VIEW_MODES,
  addGraphDirectoryFrames,
  applyGraphExplorerViewMode,
  buildFlatPathHash,
  createGraphPathStyleMenuActions,
  createGraphExplorerViewController,
  createGraphViewModeController,
  getFileSelectionNodeId,
  getFlatFocusRestoreKey,
  getGraphHashNavigationState,
  getGraphPathStyleDisplay,
  getNextGraphPathStyle,
  normalizeGraphExplorerViewMode,
  normalizeGraphViewMode,
  resolveGraphPathStyleAction,
  resolveFlatHashChange,
  resolveInitialGraphViewMode,
  shouldClearFocusOnSelection,
  shouldFitForceLayoutInitialTick,
  shouldRestoreFlatFocus,
} from './canvas/graph-explorer.js';
export { resolveSymbolFile, findConnectionPath } from './graph/graph-algorithms.js';
export {
  HTML_IN_CANVAS_APIS,
  HTML_IN_CANVAS_RENDERER,
  HTML_IN_CANVAS_RENDERER_NAME,
  captureHtmlElementImage,
  closeHtmlElementImage,
  copyHtmlElementToWebGPUTexture,
  createHtmlInCanvasAdapter,
  drawHtmlElement2d,
  getHtmlInCanvasChangedElements,
  getHtmlElementCanvasTransform,
  getHtmlInCanvasSupport,
  requestHtmlInCanvasPaint,
  setupHtmlInCanvas,
  uploadHtmlElementToWebGLTexture,
} from './canvas/html-in-canvas.js';
export * from './xr/index.js';
export { buildFileGraph, buildStructuredGraph } from './canvas/project-graph-builder.js';
export { buildGraphModelFromSkeleton, buildCanvasGraphModelFromSkeleton } from './canvas/project-graph-model.js';
export { collectQuickOpenFilesFromSkeleton, fuzzyScore, searchQuickOpenItems } from './navigation/quick-open-utils.js';
export { normalizeOutputList, normalizePreviewGraph } from './display/output-preview.js';
export { createNetworkApprovalPageStyles, renderNetworkApprovalPage } from './display/network-approval-page.js';
export {
  CHAT_TITLE_MAX_LENGTH,
  CHAT_TITLE_MAX_WORDS,
  extractChatTitleFromAgentText,
  sanitizeChatTitle,
} from './chat/chat-title.js';

export {
  buildChatNavTree,
  cleanChatName,
  normalizeChatNavItem,
} from './chat/ChatWorkspace/chat-nav-tree.js';

export {
  DEFAULT_VOICE_ACTION_COMMANDS,
  DEFAULT_VOICE_SEND_COMMANDS,
  DEFAULT_VOICE_WAKE_COMMAND,
  DEFAULT_VOICE_WAKE_COMMANDS,
  LEGACY_VOICE_WAKE_COMMANDS,
  defaultSendCommandPhrases,
  defaultVoiceActionCommandPhrases,
  defaultWakeCommandPhrases,
  formatVoiceCommandList,
  matchVoiceCommandAtEnd,
  matchVoiceCommandInText,
  normalizeWakeCommandPhrase,
  parseVoiceCommandList,
  wakeCommandCandidates,
} from './chat/voice-input-defaults.js';

export { sanitizeVoiceResponseText } from './chat/voice-response-sanitizer.js';

export {
  DEFAULT_VOICE_SETTINGS,
  loadVoiceSettings,
  saveVoiceSettings,
  mergeServerVoiceSettings,
  normalizeVoiceCommandSettings,
  normalizeVoiceLanguageMode,
} from './chat/voice-settings.js';

export {
  SEVERITY_RANK,
  severityRank,
  normalizeNotificationItem,
  notificationKey,
  createNotificationQueue,
  createNotificationDebouncer,
} from './notifications/notification-queue.js';

export {
  DEFAULT_TONE_SHAPE,
  NOTIFICATION_SOUND_WAVEFORMS,
  NOTIFICATION_TONE_PRESETS,
  buildTonePlan,
  createSoundEngine,
  getPresetDuration,
  listTonePresetKeys,
  normalizeToneShape,
  resolveTonePreset,
  resolveTonePresetKey,
} from './notifications/sound-engine.js';

export {
  NOTIFICATION_BOARD_STAGES,
  NOTIFICATION_CONFIG_DEFAULTS,
  NOTIFICATION_PRESET_KEYS,
  isStageNarrationEnabled,
  listAllPresetKeys,
  listEventPresetOptions,
  normalizeNotificationConfig,
  parseNotificationConfig,
  resolveEventPreset,
  resolvePhraseVariants,
  resolveToneShape,
  serializeNotificationConfig,
  setPhraseVariants,
} from './notifications/notification-config.js';

export {
  DEFAULT_VOICE_ARBITRATION_PRIORITIES,
  VOICE_ARBITRATION_ROLES,
  VoiceArbitrationChannel,
  getDefaultVoiceArbitrationChannel,
  resetDefaultVoiceArbitrationChannel,
} from './chat/voice-arbitration.js';

export {
  DEFAULT_NARRATION_DEPTH,
  DEFAULT_NARRATION_EVENT,
  NARRATION_DEPTHS,
  NOTIFICATION_EVENT_TYPES,
  composeNarration,
  listNarrationVariants,
  selectNarrationPhrase,
} from './chat/notification-phrases.js';

export { NotificationNarrator } from './chat/notification-narrator.js';
export { createDialogueStage } from './chat/dialogue-stage.js';
export { playDialogueTimeline, buildAlternatingTimeline } from './chat/dialogue-timeline.js';
export { createDialoguePlayer } from './chat/dialogue-player.js';
export {
  PRESENTER_ANNOTATION_COLLISION_ALLOWANCE_PX,
  PRESENTER_ANNOTATION_TARGET_INSET_PX,
  PRESENTER_CURSOR_SIZE_PX,
  analyzePresenterAnnotationSafety,
  createPresenterCursor,
  playCursorScenario,
} from './chat/presenter-cursor.js';
