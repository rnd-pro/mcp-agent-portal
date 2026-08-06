/**
 * Browser/UI API for symbiote-ui.
 *
 * Import this entrypoint in applications that need Web Components, layout
 * widgets, router helpers, panels, and browser canvas modules.
 */

export * from '../core/index.js';
export * from '../graph/index.js';
export * from '../locale/index.js';
export * from '../runtime/index.js';
export { configureBrowserLocalization, detectBrowserLocale } from './locale.js';

import { getComponent, listComponents } from '../manifest/component-registry.js';
import { configureBrowserLocalization } from './locale.js';

export { Drag } from '../interactions/Drag.js';
export { Zoom } from '../interactions/Zoom.js';
export { Selector } from '../interactions/Selector.js';
export { SnapGrid } from '../interactions/SnapGrid.js';
export { ConnectFlow } from '../interactions/ConnectFlow.js';
export {
  isPointInRect,
  isRectIntersecting,
  isRectContaining,
  computeSelectionBounds,
  isNodeInMarquee,
  areEdgeEndpointsInSelection,
  isEdgeIntersectingRect,
  alignNodes,
  distributeNodes,
} from '../interactions/SelectionGeometry.js';

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
} from '../shapes/index.js';

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
  applyTheme,
  createCascadeTheme,
  extractTheme,
  DEFAULT_PROVIDER_THEME,
  DEFAULT_THEME,
  getCascadeThemeControls,
  getCascadeThemeVariantPreset,
  getReadableTextForHsl,
  isCascadeThemeBundle,
  normalizeCascadeGeometryRegister,
  normalizeCascadeTabShape,
  normalizeCascadeThemeOptions,
  normalizeCascadeThemeVariant,
  persistCascadeThemeScopeRegister,
  persistCascadeThemeScopeState,
  readCascadeThemeScopeState,
  removeCascadeThemeScopeState,
  resetCascadeThemeScopes,
  resolveCascadeThemeScopeTarget,
  resolveCascadeThemeVariantState,
  seedCascadeThemeScopeState,
  serializeCascadeThemeBundle,
} from '../themes/Theme.js';
export {
  encodeCascadeThemeShare,
  decodeCascadeThemeShare,
  CascadeThemeShareError,
} from '../themes/cascade-theme-share.js';
export {
  insertCascadeThemeUserPreset,
  listCascadeThemeUserPresets,
  getCascadeThemeUserPreset,
  CascadeThemePresetError,
} from '../themes/cascade-theme-presets.js';

export {
  applyPalette,
  DEFAULT_PROVIDER_PALETTE,
  DEFAULT_PALETTE,
} from '../themes/Palette.js';

export { applySkin, MODERN_SKIN, COMPACT_SKIN, ROUNDED_SKIN } from '../themes/Skin.js';
export { CARBON, CARBON_PALETTE } from '../themes/carbon.js';
export { PCB_DARK } from '../themes/pcb.js';
export { EBOOK, EBOOK_PALETTE } from '../themes/ebook.js';
export { NEON_PALETTE } from '../themes/neon.js';
export { configureMaterialSymbols, ensureMaterialSymbols } from '../icons/MaterialSymbols.js';

export { FocusController } from 'symbiote-engine/FocusController.js';
export { Readonly } from '../plugins/Readonly.js';
export { History } from '../plugins/History.js';

export { FlowSimulator } from '../canvas/FlowSimulator.js';
export * as LayoutTree from '../layout/LayoutTree.js';
export {
  hasLayoutBehaviorMetadata,
  layoutHasBehaviorMetadata,
  resolveMobileDrawerLayout,
  matchesSection,
} from '../layout/LayoutTree.js';
export {
  SECTION_SCOPES,
  SectionRegistry,
  createSectionRegistry,
  normalizeSectionScope,
  sectionMatchesScope,
  withGlobalPanel,
  registerSection,
  getSection,
  getSections,
  getHomeSections,
  getProjectSections,
  getSectionsForScope,
  getLayout,
  hasSection,
  clearSections,
} from '../layout/LayoutRouter/SectionRegistry.js';
export {
  updateHashParam,
  getGraphSearchString,
  getGraphUrlParams,
  parseGraphHash,
} from '../layout/LayoutRouter/LayoutRouter.js';
export { computeAutoLayout, computeTreeLayout } from '../canvas/AutoLayout.js';
export { SubgraphManager } from '../canvas/SubgraphManager.js';
export { SubgraphRouter } from '../canvas/SubgraphRouter.js';
export { LODManager } from '../canvas/LODManager.js';
export { PinExpansion } from '../canvas/PinExpansion.js';
export { ForceLayout } from '../canvas/ForceLayout.js';
export {
  addNodesToGroup,
  createCanvasGraphStore,
  groupNodes,
  normalizeCanvasGraphGroups,
  normalizeCanvasGraphModel,
  removeNodesFromGroup,
  ungroupNodes,
} from '../canvas/graph-model.js';
export {
  computeInitialGraphPositions,
  createForceLayoutPayload,
  findForceNodeGroup,
  getDrillableFiles,
  getForceLayoutOptions,
  getGraphCacheKey,
  normalizeForceGroups,
  getOrBuildGraph,
} from '../canvas/graph-layout.js';
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
  renderGraphPathStyleButton,
  renderGraphViewModeButton,
  resolveGraphPathStyleAction,
  resolveFlatHashChange,
  resolveInitialGraphViewMode,
  selectGraphLabelMode,
  setGraphLayerVisible,
  shouldClearFocusOnSelection,
  shouldFitForceLayoutInitialTick,
  shouldRestoreFlatFocus,
  toggleGraphLayerButtonState,
  resolveGraphNodeClick,
  resolveToolbarAction,
  renderClusterPanel,
  renderGraphStats,
} from '../canvas/graph-explorer.js';
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
} from '../canvas/html-in-canvas.js';
export * from '../xr/index.js';

export let NodeCanvas;
export let CanvasGraph;
export let KanbanBoard;
export let GraphExplorerShell;
export let ContextMenu;
export let GraphNode;
export let NodeCallout;
export let GraphFrame;
export let NodeSocket;
export let QuickToolbar;
export let InspectorPanel;
export let Minimap;
export let NodeSearch;
export let Layout;
export let LayoutNode;
export let LayoutSidebar;
export let LayoutShellMenu;
export let CrossLayoutPortalBridge;
export let ProjectTabs;
export let CodeBlock;
export let SourceViewer;
export let SourceEditor;
export let SourceDiff;
export let LoadingOverlay;
export let StatusBadge;
export let StatusBanner;
export let EmptyState;
export let MetricItem;
export let DataTable;
export let EventFeed;
export let getSourceLanguage;
export let isDirectoryLikePath;
export let buildDirectoryInfo;
export let QuickOpen;
export let navigate;
export let updateParams;
export let parseQuery;
export let buildHash;
export let buildQuery;
export let configureRouter;
export let getRoute;
export let getRouterBasePath;
export let getRouterMode;
export let setDefaultPanel;
export let registerGlobalParam;
export let setGlobalParam;
export let syncWithRouter;
export let setupPanelRouting;
export let PaletteBrowser;
export let GraphTabs;
export let Breadcrumb;
export let CellBg;
export let ChatMessageItem;
export let ChatTranscript;
export let ChatComposer;
export let ChatWorkspace;
export let ChatList;
export let ChatListItem;
export let ChatSidebarShell;
export let ChatSidebarItem;
export let ChatSidebarSubItem;
export let ListItem;
export let ListDetailShell;
export let TreeView;
export let TreePanel;
export let ActionButton;
export let FormField;
export let CheckboxControl;
export let RadioControl;
export let SwitchControl;
export let SurfaceCard;
export let SliderControl;
export let RatingControl;
export let SegmentedControl;
export let Transport;
export let Tooltip;
export let OutputListPreview;
export let OutputGraphPreview;
export let StatusRibbon;
export let CascadeThemeEditor;
export let CascadeThemeWidget;
export let CascadeThemeImportDialog;
export let NotificationWidget;
export let NotificationEditor;
export let Dialog;
export let Select;
export let Toast;
export let ToastRegion;
export let Listbox;
export let Popover;
export let Combobox;
export let Drawer;
export let Menu;
export let MenuItem;
export let MenuSeparator;
export let MenuGroup;
export let Dropdown;
export let Toolbar;
export let SnBreadcrumb;
export let SnBreadcrumbItem;
export let Accordion;
export let AccordionItem;
export let Pagination;
export let Stepper;
export let NavList;
export let NavItem;
export let ProgressBar;
export let ProgressRing;
export let Spinner;
export let Skeleton;
export let StatusLight;
export let PackCard;
export let PackDetail;
export let DescriptionList;
export let DescriptionItem;
export let Timeline;
export let TimelineItem;
export let TimelineEditor;
export let Avatar;
export let Tag;
export let DatePicker;
export let ColorPicker;
export let FileUpload;
export let Transfer;
export let Mentions;
export let TagsInput;
export let PinInput;
export let SplitPanel;
export let ScrollArea;
export let FloatingPanel;
export let AspectRatio;
export let Chart;
export let RichTextEditor;
export let Tour;
export let Carousel;
export let QrCode;
export let VideoPlayer;
export let MediaHost;
export let stringifyBlock;
export let truncateResult;
export {
  registerMediaProvider,
  getMediaProvider,
  hasMediaProvider,
  listMediaProviders,
  unregisterMediaProvider,
} from './media/provider-registry.js';
export { IMAGE_MEDIA_ADAPTER, IMAGE_PROVIDER_KEY } from './media/adapters/image-adapter.js';
export { YOUTUBE_MEDIA_ADAPTER, YOUTUBE_PROVIDER_KEY } from './media/adapters/youtube-adapter.js';
export {
  CANVAS_MEDIA_IMAGE_STATUS,
  CanvasGraphMediaImages,
  getCanvasGraphNodeMedia,
  drawCanvasGraphImageFit,
  drawCanvasGraphNodeMedia,
  drawCanvasGraphMediaBadge,
} from '../canvas/canvas-graph-media.js';
export { sharedUiStyles } from './shared-styles.js';
export {
  bringOverlayToFront,
  clearOverlayStack,
  layoutOverlayStack,
  measureOverlayStackReserve,
  nextOverlayZIndex,
  resetOverlayStack,
} from './overlay-stack.js';
export {
  DEFAULT_SCREENCAST_HOTKEY,
  DEFAULT_SCREENCAST_MIME_TYPES,
  ScreencastRecorder,
  createScreencastRecorder,
  installScreencastHotkeys,
  matchesScreencastHotkey,
} from './screencast-recorder.js';
export {
  DEFAULT_TOUR_MEDIA_MIME_TYPES,
  TourMediaRenderError,
  createTourCaptionTrack,
  createTourMediaRenderPlan,
  downloadTourVideoBlob,
  drawTourCaptionOverlay,
  drawTourMediaFrame,
  getTourMediaSupport,
  normalizeTourMediaTimeline,
  renderTourVideo,
} from './tour-media-renderer.js';
export {
  MEDIA_FRAME_SOURCE_PROVIDER_METADATA,
  MEDIA_PREVIEW_STATES,
  MEDIA_STUDIO_CSS_PARTS,
  MEDIA_STUDIO_FRAME_SOURCE_TYPES,
  MEDIA_STUDIO_PANEL_TYPES,
  MEDIA_STUDIO_PREVIEW_MODES,
  MEDIA_STUDIO_SURFACE_STYLES,
  MEDIA_STUDIO_STYLE_TOKENS,
  MEDIA_STUDIO_SURFACE_CONTRACT,
  createMediaStudioLayout,
  createMediaStudioPanelTypes,
  ensureMediaStudioSurfaceStyles,
  getMediaFrameSourceProvider,
  getMediaFrameSourceSupport,
  getMediaStudioTopology,
  hasMediaStudioTopology,
  hydrateMediaStudioTimelinePanel,
  hydrateMediaStudioPreviewPanel,
  listMediaFrameSourceProviders,
  createMediaStudioSequenceFrameWindow,
  createMediaStudioVirtualSequence,
  mediaStudioFrameIndexForTime,
  normalizeMediaFrameSource,
  normalizeMediaStudioTimelineData,
  normalizeMediaStudioSequencePlaybackState,
  normalizeMediaStudioRenderSettings,
  normalizeMediaStudioCaptionOverlayState,
  normalizeMediaStudioVoiceProviderState,
  normalizeMediaPreviewState,
  renderMediaStudioCaptionOverlayMarkup,
  renderMediaStudioCaptionLineMarkup,
  renderMediaStudioPreviewPanelMarkup,
  renderMediaStudioInspectorPanelMarkup,
  renderMediaStudioProgressPanelMarkup,
  renderMediaStudioTimelinePanelMarkup,
} from './media-studio-surface.js';
export { createVideoFrameClock } from './video-frame-clock.js';
export {
  WORKSPACE_VIRTUAL_SEQUENCE_SCHEMA,
  createVirtualSequenceProjection,
} from './virtual-sequence.js';
export {
  PrecisionVideoDecodeError,
  createPrecisionVideoDecoder,
  getPrecisionVideoDecodeSupport,
} from './precision-video-decoder.js';
export { recordTourScreencast } from './tour-screencast.js';
export {
  TOUR_AUDIO_PROVIDER_BROWSER_ID,
  TOUR_AUDIO_PROVIDER_SYNTHETIC_CUES_ID,
  TourAudioProviderError,
  createBrowserTourAudioProvider,
  createTourAudioProvider,
  createTourCueAudioPlan,
  createTourCueAudioProvider,
  getTourAudioProviderSupport,
  listTourAudioProviders,
  resolveTourAudioProvider,
} from './tour-audio-provider.js';
export { escapeHtml } from '../display/markdown-formatter.js';
export {
  buildResourceTreeFromEntries,
  createMemoryPersistenceAdapter,
  createPersistenceAdapter,
  createSourceDocument,
  normalizeResourceTree,
  normalizeResourceTreeItem,
  normalizeSourceDocument,
} from 'symbiote-engine/contracts';
export { normalizeOutputList, normalizePreviewGraph } from '../display/output-preview.js';
export { createNetworkApprovalPageStyles, renderNetworkApprovalPage } from '../display/network-approval-page.js';
export {
  CHAT_TITLE_MAX_LENGTH,
  CHAT_TITLE_MAX_WORDS,
  extractChatTitleFromAgentText,
  sanitizeChatTitle,
} from '../chat/chat-title.js';
export { uiAlert, uiConfirm, uiPrompt } from './dialogs.js';
export {
  bindListItemSelect,
  collapseTree,
  highlightTreePath,
  setTreeItems,
  setupTreePanel,
  showTree,
  showTreePlaceholder,
  syncListItem,
  syncTreeFilter,
} from './host-adapters.js';
export {
  buildChatMessageItems,
  buildSessionMetaHtml,
  buildWorkMetaHtml,
  buildWorkSummaryHtml,
  findPreviousAgentText,
  toChatMessageItem,
} from '../chat/message-model.js';
export { VoiceRuntime, blobToBase64 } from '../chat/voice-runtime.js';
export {
  TERMINAL_WAKE_ERRORS,
  VOICE_MICROPHONE_DENIED_MESSAGE,
  VOICE_WAKE_UNSUPPORTED_MESSAGE,
  VoiceController,
  isTerminalWakeError,
  voiceMicrophoneDeniedMessage,
  voiceStartErrorMessage,
  voiceWakeStartErrorMessage,
} from '../chat/voice-controller.js';
export {
  DEFAULT_LAYOUT_LIFECYCLE_SELECTOR,
  resumeLayoutSubtree,
  suspendLayoutSubtree,
} from '../layout/lifecycle.js';
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
} from '../chat/voice-input-defaults.js';

export { sanitizeVoiceResponseText } from '../chat/voice-response-sanitizer.js';

export { createDialogueStage } from '../chat/dialogue-stage.js';
export { playDialogueTimeline, buildAlternatingTimeline } from '../chat/dialogue-timeline.js';
export { createDialoguePlayer } from '../chat/dialogue-player.js';
export {
  PRESENTER_ANNOTATION_COLLISION_ALLOWANCE_PX,
  PRESENTER_ANNOTATION_TARGET_INSET_PX,
  PRESENTER_CURSOR_SIZE_PX,
  analyzePresenterAnnotationSafety,
  createPresenterCursor,
  playCursorScenario,
} from '../chat/presenter-cursor.js';

export {
  DEFAULT_VOICE_SETTINGS,
  loadVoiceSettings,
  saveVoiceSettings,
  mergeServerVoiceSettings,
  normalizeVoiceCommandSettings,
  normalizeVoiceLanguageMode,
} from '../chat/voice-settings.js';

export {
  resolveDefaultVoiceLocale,
  localeToSpeechLang,
  VOICE_LOCALE_LANGS,
} from '../chat/voice-locale.js';

export { collectQuickOpenFilesFromSkeleton, fuzzyScore, searchQuickOpenItems } from '../navigation/quick-open-utils.js';

const runtimeModules = new Map();
const runtimeModuleAliases = new Map();

const hasDOMGlobals =
  typeof window !== 'undefined' &&
  typeof document !== 'undefined' &&
  typeof HTMLElement !== 'undefined' &&
  typeof customElements !== 'undefined';

function normalizeModuleName(name) {
  return String(name || '').trim();
}

function canUseCustomElements() {
  return typeof customElements !== 'undefined' && typeof customElements.get === 'function';
}

function findCatalogComponent(name) {
  let normalized = normalizeModuleName(name);
  if (!normalized) return null;
  let byTag = getComponent(normalized);
  if (byTag) return byTag;
  return listComponents({ includeInternal: true, includeExperimental: true }).find((component) => {
    return component.exportName === normalized || component.className === normalized;
  }) || null;
}

function resolveModuleRecord(name) {
  let normalized = normalizeModuleName(name);
  if (!normalized) return null;
  let tagName = runtimeModuleAliases.get(normalized) || normalized;
  return runtimeModules.get(tagName) || null;
}

function toModuleDescriptor(record, component = null) {
  let tagName = record?.tagName || component?.tagName;
  let ComponentClass = record?.ComponentClass;
  let defined = Boolean(tagName && canUseCustomElements() && customElements.get(tagName));
  return {
    name: tagName,
    tagName,
    exportName: record?.exportName ?? component?.exportName ?? null,
    className: record?.className ?? component?.className ?? ComponentClass?.name ?? null,
    category: record?.category ?? component?.category ?? null,
    visibility: record?.visibility ?? component?.visibility ?? 'public',
    internal: Boolean(record?.internal ?? component?.internal),
    experimental: (record?.visibility ?? component?.visibility) === 'experimental',
    specifier: record?.specifier ?? component?.specifier ?? 'symbiote-ui/ui',
    module: record?.module ?? component?.module ?? null,
    defined,
    registered: Boolean(record?.ComponentClass),
  };
}

function registerModuleAlias(alias, tagName) {
  if (alias) runtimeModuleAliases.set(alias, tagName);
}

function moduleVisible(record, options = {}) {
  let visibility = record?.visibility ?? 'public';
  let internal = Boolean(record?.internal ?? visibility === 'internal');
  let experimental = Boolean(record?.experimental ?? visibility === 'experimental');
  if (internal && !options.includeInternal) return false;
  if (experimental && !options.includeExperimental) return false;
  return true;
}

export function registerModule(name, ComponentClass, options = {}) {
  let normalized = normalizeModuleName(name);
  if (!normalized) {
    throw new TypeError('registerModule(name, ComponentClass) requires a module name.');
  }
  if (typeof ComponentClass !== 'function') {
    throw new TypeError(`registerModule("${normalized}") requires a component class.`);
  }

  let component = findCatalogComponent(normalized);
  let tagName = normalizeModuleName(options.tagName || component?.tagName || normalized);
  let exportName = options.exportName ?? component?.exportName ?? ComponentClass.name ?? null;
  let visibility = options.visibility ?? component?.visibility ?? 'public';
  let record = {
    tagName,
    exportName,
    className: options.className ?? component?.className ?? ComponentClass.name ?? null,
    category: options.category ?? component?.category ?? null,
    visibility,
    internal: Boolean(options.internal ?? component?.internal ?? visibility === 'internal'),
    specifier: options.specifier ?? component?.specifier ?? 'symbiote-ui/ui',
    module: options.module ?? component?.module ?? null,
    ComponentClass,
  };

  runtimeModules.set(tagName, record);
  registerModuleAlias(normalized, tagName);
  registerModuleAlias(tagName, tagName);
  registerModuleAlias(exportName, tagName);
  registerModuleAlias(record.className, tagName);
  return toModuleDescriptor(record, component);
}

export function getModule(name, options = {}) {
  let record = resolveModuleRecord(name);
  if (record?.ComponentClass) {
    return moduleVisible(record, options) ? record.ComponentClass : undefined;
  }

  let component = findCatalogComponent(name);
  if (!moduleVisible(component, options)) return undefined;
  if (component?.tagName && canUseCustomElements()) {
    return customElements.get(component.tagName);
  }
  return undefined;
}

export function listModules(options = {}) {
  let { includeInternal = false, includeExperimental = false } = options;
  let descriptors = [];
  let seen = new Set();

  for (let component of listComponents({ includeInternal: true, includeExperimental: true })) {
    if (!includeInternal && component.internal) continue;
    if (!includeExperimental && component.visibility === 'experimental') continue;
    let record = runtimeModules.get(component.tagName);
    descriptors.push(toModuleDescriptor(record, component));
    seen.add(component.tagName);
  }

  for (let record of runtimeModules.values()) {
    if (seen.has(record.tagName)) continue;
    if (!includeInternal && record.internal) continue;
    if (!includeExperimental && record.visibility === 'experimental') continue;
    descriptors.push(toModuleDescriptor(record));
    seen.add(record.tagName);
  }

  return descriptors;
}

export function defineModule(name, options = {}) {
  if (!canUseCustomElements()) return undefined;

  let component = findCatalogComponent(name);
  let record = resolveModuleRecord(name);
  let visibility = options.visibility ?? record?.visibility ?? component?.visibility ?? 'public';
  let internal = Boolean(record?.internal ?? component?.internal ?? visibility === 'internal');
  let experimental = visibility === 'experimental';
  let tagName = normalizeModuleName(options.tagName || record?.tagName || component?.tagName || name);

  if (internal && !options.includeInternal) {
    throw new Error(`UI module "${tagName}" is internal. Pass includeInternal: true to define it.`);
  }
  if (experimental && !options.includeExperimental) {
    throw new Error(`UI module "${tagName}" is experimental. Pass includeExperimental: true to define it.`);
  }

  let existing = customElements.get(tagName);
  if (existing) return existing;

  let ComponentClass = record?.ComponentClass || getModule(name, options);
  if (!ComponentClass) {
    throw new Error(`UI module "${tagName}" is not registered.`);
  }

  customElements.define(tagName, ComponentClass, options.defineOptions);
  return customElements.get(tagName) || ComponentClass;
}

function registerCatalogModules(exportsByName) {
  for (let component of listComponents({ includeInternal: true, includeExperimental: true })) {
    if (!component.exportName) continue;
    let ComponentClass = exportsByName[component.exportName];
    if (!ComponentClass) continue;
    registerModule(component.tagName, ComponentClass, {
      tagName: component.tagName,
      exportName: component.exportName,
      className: component.className,
      category: component.category,
      visibility: component.visibility,
      internal: component.internal,
      specifier: component.specifier,
      module: component.module,
    });
  }
}

if (hasDOMGlobals) {
  configureBrowserLocalization();

  const [
    nodeCanvas,
    canvasGraph,
    kanbanBoard,
    graphExplorerShell,
    contextMenu,
    graphNode,
    nodeCallout,
    graphFrame,
    nodeSocket,
    quickToolbar,
    inspectorPanel,
    minimap,
    nodeSearch,
    layout,
    layoutNode,
    layoutSidebar,
    layoutShellMenu,
    crossLayoutPortalBridge,
    projectTabs,
    codeBlock,
    sourceViewer,
    sourceEditor,
    sourceDiff,
    loadingOverlay,
    statusBadge,
    statusBanner,
    emptyState,
    metricItem,
    dataTable,
    eventFeed,
    quickOpen,
    layoutRouter,
    routerSync,
    paletteBrowser,
    graphTabs,
    breadcrumb,
    cellBg,
    chatMessageItem,
    chatTranscript,
    chatComposer,
    chatWorkspace,
    chatList,
    chatListItem,
    chatSidebar,
    chatSidebarItem,
    listItem,
    listDetailShell,
    treeView,
    treePanel,
    actionButton,
    formField,
    selectionControl,
    surfaceCard,
    outputListPreview,
    outputGraphPreview,
    statusRibbon,
    cascadeThemeEditor,
    cascadeThemeWidget,
    cascadeThemeImportDialog,
    notificationWidget,
    notificationEditor,
    sliderControl,
    ratingControl,
    segmentedControl,
    transport,
    tooltip,
    dialog,
    select,
    toast,
    listbox,
    popover,
    combobox,
    drawer,
    menu,
    toolbar,
    breadcrumbNav,
    accordion,
    pagination,
    stepper,
    navList,
    progress,
    skeleton,
    statusLight,
    packCard,
    packDetail,
    descriptionList,
    timeline,
    avatar,
    tag,
    datePicker,
    colorPicker,
    fileUpload,
    transfer,
    mentions,
    tagsInput,
    pinInput,
    splitPanel,
    scrollArea,
    floatingPanel,
    aspectRatio,
    chart,
    richTextEditor,
    tour,
    carousel,
    qrCode,
    videoPlayer,
    timelineEditor,
    mediaHost,
  ] = await Promise.all([
    import('../canvas/NodeCanvas/NodeCanvas.js'),
    import('../canvas/CanvasGraph/CanvasGraph.js'),
    import('../board/KanbanBoard/KanbanBoard.js'),
    import('../canvas/GraphExplorerShell/GraphExplorerShell.js'),
    import('../menu/ContextMenu/ContextMenu.js'),
    import('../node/GraphNode/GraphNode.js'),
    import('../node/NodeCallout/NodeCallout.js'),
    import('../node/GraphFrame/GraphFrame.js'),
    import('../node/NodeSocket/NodeSocket.js'),
    import('../toolbar/QuickToolbar/QuickToolbar.js'),
    import('../inspector/InspectorPanel/InspectorPanel.js'),
    import('../canvas/Minimap/Minimap.js'),
    import('../canvas/NodeSearch/NodeSearch.js'),
    import('../layout/Layout/Layout.js'),
    import('../layout/LayoutNode/LayoutNode.js'),
    import('../layout/LayoutSidebar/LayoutSidebar.js'),
    import('../layout/LayoutShellMenu/LayoutShellMenu.js'),
    import('../layout/CrossLayoutPortalBridge/CrossLayoutPortalBridge.js'),
    import('../layout/ProjectTabs/ProjectTabs.js'),
    import('../display/CodeBlock/CodeBlock.js'),
    import('../display/SourceViewer/SourceViewer.js'),
    import('../display/SourceEditor/SourceEditor.js'),
    import('../display/SourceDiff/SourceDiff.js'),
    import('../display/LoadingOverlay/LoadingOverlay.js'),
    import('../display/Badge/Badge.js'),
    import('../display/Banner/Banner.js'),
    import('../display/EmptyState/EmptyState.js'),
    import('../display/Metric/Metric.js'),
    import('../display/DataTable/DataTable.js'),
    import('../display/EventFeed/EventFeed.js'),
    import('../navigation/QuickOpen/QuickOpen.js'),
    import('../layout/LayoutRouter/LayoutRouter.js'),
    import('../layout/LayoutRouter/routerSync.js'),
    import('../palette/PaletteBrowser/PaletteBrowser.js'),
    import('../canvas/GraphTabs/GraphTabs.js'),
    import('../canvas/Breadcrumb/Breadcrumb.js'),
    import('../effects/CellBg/CellBg.js'),
    import('../chat/ChatMessageItem/ChatMessageItem.js'),
    import('../chat/ChatTranscript/ChatTranscript.js'),
    import('../chat/ChatComposer/ChatComposer.js'),
    import('../chat/ChatWorkspace/ChatWorkspace.js'),
    import('../chat/ChatList/ChatList.js'),
    import('../chat/ChatListItem/ChatListItem.js'),
    import('../chat/ChatSidebar/ChatSidebar.js'),
    import('../chat/ChatSidebarItem/ChatSidebarItem.js'),
    import('../list/ListItem/ListItem.js'),
    import('../list/ListDetailShell/ListDetailShell.js'),
    import('../tree/TreeView/TreeView.js'),
    import('../tree/TreePanel/TreePanel.js'),
    import('../control/Button/Button.js'),
    import('../control/Field/Field.js'),
    import('../control/SelectionControl/SelectionControl.js'),
    import('../surface/Card/Card.js'),
    import('../display/OutputListPreview/OutputListPreview.js'),
    import('../display/OutputGraphPreview/OutputGraphPreview.js'),
    import('../display/StatusRibbon/StatusRibbon.js'),
    import('../themes/CascadeThemeEditor/CascadeThemeEditor.js'),
    import('../themes/CascadeThemeWidget/CascadeThemeWidget.js'),
    import('../themes/CascadeThemeImportDialog/CascadeThemeImportDialog.js'),
    import('../notifications/NotificationWidget/NotificationWidget.js'),
    import('../notifications/NotificationEditor/NotificationEditor.js'),
    import('../control/Slider/Slider.js'),
    import('../control/Rating/Rating.js'),
    import('../control/SegmentedControl/SegmentedControl.js'),
    import('../control/Transport/Transport.js'),
    import('../display/Tooltip/Tooltip.js'),
    import('../surface/Dialog/Dialog.js'),
    import('../control/Select/Select.js'),
    import('../display/Toast/Toast.js'),
    import('../list/Listbox/Listbox.js'),
    import('../surface/Popover/Popover.js'),
    import('../control/Combobox/Combobox.js'),
    import('../surface/Drawer/Drawer.js'),
    import('../menu/Menu/Menu.js'),
    import('../toolbar/Toolbar/Toolbar.js'),
    import('../navigation/Breadcrumb/Breadcrumb.js'),
    import('../surface/Accordion/Accordion.js'),
    import('../control/Pagination/Pagination.js'),
    import('../control/Stepper/Stepper.js'),
    import('../navigation/NavList/NavList.js'),
    import('../display/Progress/Progress.js'),
    import('../display/Skeleton/Skeleton.js'),
    import('../display/StatusLight/StatusLight.js'),
    import('../marketplace/PackCard/PackCard.js'),
    import('../marketplace/PackDetail/PackDetail.js'),
    import('../display/DescriptionList/DescriptionList.js'),
    import('../display/Timeline/Timeline.js'),
    import('../display/Avatar/Avatar.js'),
    import('../display/Tag/Tag.js'),
    import('../control/DatePicker/DatePicker.js'),
    import('../control/ColorPicker/ColorPicker.js'),
    import('../control/FileUpload/FileUpload.js'),
    import('../control/Transfer/Transfer.js'),
    import('../control/Mentions/Mentions.js'),
    import('../control/TagsInput/TagsInput.js'),
    import('../control/PinInput/PinInput.js'),
    import('../layout/SplitPanel/SplitPanel.js'),
    import('../layout/ScrollArea/ScrollArea.js'),
    import('../layout/FloatingPanel/FloatingPanel.js'),
    import('../layout/AspectRatio/AspectRatio.js'),
    import('../display/Chart/Chart.js'),
    import('../control/RichTextEditor/RichTextEditor.js'),
    import('../display/Tour/Tour.js'),
    import('../display/Carousel/Carousel.js'),
    import('../display/QrCode/QrCode.js'),
    import('../display/VideoPlayer/VideoPlayer.js'),
    import('../timeline/TimelineEditor/TimelineEditor.js'),
    import('./media/MediaHost/MediaHost.js'),
  ]);

  ({ NodeCanvas } = nodeCanvas);
  ({ CanvasGraph } = canvasGraph);
  ({ KanbanBoard } = kanbanBoard);
  ({ GraphExplorerShell } = graphExplorerShell);
  ({ ContextMenu } = contextMenu);
  ({ GraphNode } = graphNode);
  ({ NodeCallout } = nodeCallout);
  ({ GraphFrame } = graphFrame);
  ({ NodeSocket } = nodeSocket);
  ({ QuickToolbar } = quickToolbar);
  ({ InspectorPanel } = inspectorPanel);
  ({ Minimap } = minimap);
  ({ NodeSearch } = nodeSearch);
  ({ Layout } = layout);
  ({ LayoutNode } = layoutNode);
  ({ LayoutSidebar } = layoutSidebar);
  ({ LayoutShellMenu } = layoutShellMenu);
  ({ CrossLayoutPortalBridge } = crossLayoutPortalBridge);
  ({ ProjectTabs } = projectTabs);
  ({ CodeBlock } = codeBlock);
  ({ SourceViewer, getSourceLanguage, isDirectoryLikePath, buildDirectoryInfo } = sourceViewer);
  ({ SourceEditor } = sourceEditor);
  ({ SourceDiff } = sourceDiff);
  ({ LoadingOverlay } = loadingOverlay);
  ({ StatusBadge } = statusBadge);
  ({ StatusBanner } = statusBanner);
  ({ EmptyState } = emptyState);
  ({ MetricItem } = metricItem);
  ({ DataTable } = dataTable);
  ({ EventFeed } = eventFeed);
  ({ QuickOpen } = quickOpen);
  ({
    navigate,
    updateParams,
    parseQuery,
    buildHash,
    buildQuery,
    configureRouter,
    getRoute,
    getRouterBasePath,
    getRouterMode,
    setDefaultPanel,
    registerGlobalParam,
    setGlobalParam,
  } = layoutRouter);
  ({ syncWithRouter, setupPanelRouting } = routerSync);
  ({ PaletteBrowser } = paletteBrowser);
  ({ GraphTabs } = graphTabs);
  ({ Breadcrumb } = breadcrumb);
  ({ CellBg } = cellBg);
  ({ ChatMessageItem, stringifyBlock, truncateResult } = chatMessageItem);
  ({ ChatTranscript } = chatTranscript);
  ({ ChatComposer } = chatComposer);
  ({ ChatWorkspace } = chatWorkspace);
  ({ ChatList } = chatList);
  ({ ChatListItem } = chatListItem);
  ({ ChatSidebarShell } = chatSidebar);
  ({ ChatSidebarItem, ChatSidebarSubItem } = chatSidebarItem);
  ({ ListItem } = listItem);
  ({ ListDetailShell } = listDetailShell);
  ({ TreeView } = treeView);
  ({ TreePanel } = treePanel);
  ({ ActionButton } = actionButton);
  ({ FormField } = formField);
  ({ CheckboxControl, RadioControl, SwitchControl } = selectionControl);
  ({ SurfaceCard } = surfaceCard);
  ({ OutputListPreview } = outputListPreview);
  ({ OutputGraphPreview } = outputGraphPreview);
  ({ StatusRibbon } = statusRibbon);
  ({ CascadeThemeEditor } = cascadeThemeEditor);
  ({ CascadeThemeWidget } = cascadeThemeWidget);
  ({ CascadeThemeImportDialog } = cascadeThemeImportDialog);
  ({ NotificationWidget } = notificationWidget);
  ({ NotificationEditor } = notificationEditor);
  ({ SliderControl } = sliderControl);
  ({ RatingControl } = ratingControl);
  ({ SegmentedControl } = segmentedControl);
  ({ Transport } = transport);
  ({ Tooltip } = tooltip);
  ({ Dialog } = dialog);
  ({ Select } = select);
  ({ Toast, ToastRegion } = toast);
  ({ Listbox } = listbox);
  ({ Popover } = popover);
  ({ Combobox } = combobox);
  ({ Drawer } = drawer);
  ({ Menu, MenuItem, MenuSeparator, MenuGroup, Dropdown } = menu);
  ({ Toolbar } = toolbar);
  ({ SnBreadcrumb, SnBreadcrumbItem } = breadcrumbNav);
  ({ Accordion, AccordionItem } = accordion);
  ({ Pagination } = pagination);
  ({ Stepper } = stepper);
  ({ NavList, NavItem } = navList);
  ({ ProgressBar, ProgressRing, Spinner } = progress);
  ({ Skeleton } = skeleton);
  ({ StatusLight } = statusLight);
  ({ PackCard } = packCard);
  ({ PackDetail } = packDetail);
  ({ DescriptionList, DescriptionItem } = descriptionList);
  ({ Timeline, TimelineItem } = timeline);
  ({ default: TimelineEditor } = timelineEditor);
  ({ Avatar } = avatar);
  ({ Tag } = tag);
  ({ default: DatePicker } = datePicker);
  ({ default: ColorPicker } = colorPicker);
  ({ default: FileUpload } = fileUpload);
  ({ default: Transfer } = transfer);
  ({ default: Mentions } = mentions);
  ({ default: TagsInput } = tagsInput);
  ({ default: PinInput } = pinInput);
  ({ default: SplitPanel } = splitPanel);
  ({ default: ScrollArea } = scrollArea);
  ({ default: FloatingPanel } = floatingPanel);
  ({ default: AspectRatio } = aspectRatio);
  ({ default: Chart } = chart);
  ({ default: RichTextEditor } = richTextEditor);
  ({ default: Tour } = tour);
  ({ default: Carousel } = carousel);
  ({ default: QrCode } = qrCode);
  ({ default: VideoPlayer } = videoPlayer);
  ({ default: MediaHost } = mediaHost);

  registerCatalogModules({
    NodeCanvas,
    CanvasGraph,
    KanbanBoard,
    GraphExplorerShell,
    ContextMenu,
    GraphNode,
    NodeCallout,
    GraphFrame,
    NodeSocket,
    QuickToolbar,
    InspectorPanel,
    Minimap,
    NodeSearch,
    Layout,
    LayoutNode,
    LayoutSidebar,
    LayoutShellMenu,
    CrossLayoutPortalBridge,
    ProjectTabs,
    CodeBlock,
    SourceViewer,
    SourceEditor,
    SourceDiff,
    LoadingOverlay,
    StatusBadge,
    StatusBanner,
    EmptyState,
    MetricItem,
    DataTable,
    EventFeed,
    QuickOpen,
    PaletteBrowser,
    GraphTabs,
    Breadcrumb,
    CellBg,
    ChatMessageItem,
    ChatTranscript,
    ChatComposer,
    ChatWorkspace,
    ChatList,
    ChatListItem,
    ChatSidebarShell,
    ChatSidebarItem,
    ChatSidebarSubItem,
    ListItem,
    ListDetailShell,
    TreeView,
    TreePanel,
    ActionButton,
    FormField,
    CheckboxControl,
    RadioControl,
    SwitchControl,
    SurfaceCard,
    OutputListPreview,
    OutputGraphPreview,
    StatusRibbon,
    CascadeThemeEditor,
    CascadeThemeWidget,
    CascadeThemeImportDialog,
    NotificationWidget,
    NotificationEditor,
    SliderControl,
    RatingControl,
    SegmentedControl,
    Transport,
    Tooltip,
    Dialog,
    Select,
    Toast,
    ToastRegion,
    Listbox,
    Popover,
    Combobox,
    Drawer,
    Menu,
    MenuItem,
    MenuSeparator,
    MenuGroup,
    Dropdown,
    Toolbar,
    SnBreadcrumb,
    SnBreadcrumbItem,
    Accordion,
    AccordionItem,
    Pagination,
    Stepper,
    NavList,
    NavItem,
    ProgressBar,
    ProgressRing,
    Spinner,
    Skeleton,
    StatusLight,
    PackCard,
    PackDetail,
    DescriptionList,
    DescriptionItem,
    Timeline,
    TimelineItem,
    TimelineEditor,
    Avatar,
    Tag,
    DatePicker,
    ColorPicker,
    FileUpload,
    Transfer,
    Mentions,
    TagsInput,
    PinInput,
    SplitPanel,
    ScrollArea,
    FloatingPanel,
    AspectRatio,
    Chart,
    RichTextEditor,
    Tour,
    Carousel,
    QrCode,
    VideoPlayer,
    MediaHost,
  });
}

export {
  DEFAULT_NAV_WIDTH,
  MIN_NAV_WIDTH,
  MAX_NAV_WIDTH,
  COLLAPSED_NAV_WIDTH,
  COLLAPSE_DRAG_THRESHOLD,
  AUTO_COLLAPSE_WIDTH,
  AUTO_UNCOLLAPSE_WIDTH,
  clampChatSidebarWidth,
} from '../chat/ChatSidebar/constants.js';

export { registerDismissableLayer } from './dismissable-layer.js';
export { FocusTrap, getFocusableElements } from './focus-trap.js';
export { positionOverlay } from './overlay-positioner.js';
export {
  createLiveCaptionTrack,
  inspectLiveCaptionOverflow,
  LiveCaptionController,
} from './live-captions.js';
export { Collection } from './collection.js';
export { setupRovingFocus } from './roving-focus.js';
export { Typeahead } from './typeahead.js';
