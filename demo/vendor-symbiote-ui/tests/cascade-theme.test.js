import { acquireCurrentTestFileLock } from './test-lock.js';
await acquireCurrentTestFileLock(import.meta.url);

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const scrollbarSource = new URL('../themes/scrollbar-styles.js', import.meta.url);
const scrollFadeSource = new URL('../themes/scroll-fade-styles.js', import.meta.url);
const cascadeThemeSource = new URL('../themes/cascade-theme.js', import.meta.url);
const defaultProviderThemeSource = new URL('../themes/default-provider.js', import.meta.url);
const cascadeThemeEditorSource = new URL('../themes/CascadeThemeEditor/CascadeThemeEditor.js', import.meta.url);
const cascadeThemeWidgetSource = new URL('../themes/CascadeThemeWidget/CascadeThemeWidget.js', import.meta.url);
const cascadeDemoSource = new URL('../demo/cascade-theme-lab.js', import.meta.url);
const cascadeDemoHtml = new URL('../demo/cascade-theme-lab.html', import.meta.url);
const readmeSource = new URL('../README.md', import.meta.url);
const entryPointsGuideSource = new URL('../docs/entry-points.md', import.meta.url);
const agentUiPrinciplesSource = new URL('../docs/agent-ui-principles.md', import.meta.url);
const runtimeUiConstructionGuideSource = new URL('../docs/runtime-ui-construction.md', import.meta.url);
const cascadeThemeGuideSource = new URL('../docs/cascade-theme.md', import.meta.url);
const layoutAndSpatialGuideSource = new URL('../docs/layout-and-spatial.md', import.meta.url);
const integrationContractsGuideSource = new URL('../docs/integration-contracts.md', import.meta.url);
const graphNodeStyles = new URL('../node/GraphNode/GraphNode.css.js', import.meta.url);
const nodeViewManagerSource = new URL('../canvas/NodeViewManager.js', import.meta.url);
const portItemStyles = new URL('../node/PortItem/PortItem.css.js', import.meta.url);
const ctrlItemStyles = new URL('../node/CtrlItem/CtrlItem.css.js', import.meta.url);
const nodeSocketStyles = new URL('../node/NodeSocket/NodeSocket.css.js', import.meta.url);
const nodeCanvasSource = new URL('../canvas/NodeCanvas/NodeCanvas.js', import.meta.url);
const nodeCanvasStyles = new URL('../canvas/NodeCanvas/NodeCanvas.css.js', import.meta.url);
const connectionRendererSource = new URL('../canvas/ConnectionRenderer.js', import.meta.url);
const canvasConnectionRendererSource = new URL('../canvas/CanvasConnectionRenderer.js', import.meta.url);
const layoutStyles = new URL('../layout/Layout/Layout.css.js', import.meta.url);
const layoutSource = new URL('../layout/Layout/Layout.js', import.meta.url);
const layoutNodeSource = new URL('../layout/LayoutNode/LayoutNode.js', import.meta.url);
const layoutNodeTemplate = new URL('../layout/LayoutNode/LayoutNode.tpl.js', import.meta.url);
const layoutNodeStyles = new URL('../layout/LayoutNode/LayoutNode.css.js', import.meta.url);
const layoutShellMenuSource = new URL('../layout/LayoutShellMenu/LayoutShellMenu.js', import.meta.url);
const layoutShellMenuTemplate = new URL('../layout/LayoutShellMenu/LayoutShellMenu.tpl.js', import.meta.url);
const layoutShellMenuStyles = new URL('../layout/LayoutShellMenu/LayoutShellMenu.css.js', import.meta.url);
const layoutSidebarSource = new URL('../layout/LayoutSidebar/LayoutSidebar.js', import.meta.url);
const layoutSidebarStyles = new URL('../layout/LayoutSidebar/LayoutSidebar.css.js', import.meta.url);
const projectTabsSource = new URL('../layout/ProjectTabs/ProjectTabs.js', import.meta.url);
const projectTabsStyles = new URL('../layout/ProjectTabs/ProjectTabs.css.js', import.meta.url);
const panelMenuStyles = new URL('../layout/PanelMenu/PanelMenu.css.js', import.meta.url);
const treeViewStyles = new URL('../tree/TreeView/TreeView.css.js', import.meta.url);
const listDetailShellStyles = new URL('../list/ListDetailShell/ListDetailShell.css.js', import.meta.url);
const dataTableStyles = new URL('../display/DataTable/DataTable.css.js', import.meta.url);
const sourceViewerStyles = new URL('../display/SourceViewer/SourceViewer.css.js', import.meta.url);
const eventFeedStyles = new URL('../display/EventFeed/EventFeed.css.js', import.meta.url);
const emptyStateStyles = new URL('../display/EmptyState/EmptyState.css.js', import.meta.url);
const statusRibbonStyles = new URL('../display/StatusRibbon/StatusRibbon.css.js', import.meta.url);
const codeBlockStyles = new URL('../display/CodeBlock/CodeBlock.css.js', import.meta.url);
const chatMessageItemStyles = new URL('../chat/ChatMessageItem/ChatMessageItem.css.js', import.meta.url);
const chatTranscriptStyles = new URL('../chat/ChatTranscript/ChatTranscript.css.js', import.meta.url);
const chatComposerSource = new URL('../chat/ChatComposer/ChatComposer.js', import.meta.url);
const chatComposerStyles = new URL('../chat/ChatComposer/ChatComposer.css.js', import.meta.url);
const voiceInputDefaultsSource = new URL('../chat/voice-input-defaults.js', import.meta.url);
const chatListStyles = new URL('../chat/ChatList/ChatList.css.js', import.meta.url);
const chatListItemStyles = new URL('../chat/ChatListItem/ChatListItem.css.js', import.meta.url);
const chatSidebarSource = new URL('../chat/ChatSidebar/ChatSidebar.js', import.meta.url);
const chatSidebarStyles = new URL('../chat/ChatSidebar/ChatSidebar.css.js', import.meta.url);
const chatSidebarConstants = new URL('../chat/ChatSidebar/constants.js', import.meta.url);
const chatWorkspaceSource = new URL('../chat/ChatWorkspace/ChatWorkspace.js', import.meta.url);
const chatNavTreeSource = new URL('../chat/ChatWorkspace/chat-nav-tree.js', import.meta.url);
const chatWorkspaceTemplate = new URL('../chat/ChatWorkspace/ChatWorkspace.tpl.js', import.meta.url);
const chatWorkspaceStyles = new URL('../chat/ChatWorkspace/ChatWorkspace.css.js', import.meta.url);
const chatSidebarItemSource = new URL('../chat/ChatSidebarItem/ChatSidebarItem.js', import.meta.url);
const chatSidebarItemStyles = new URL('../chat/ChatSidebarItem/ChatSidebarItem.css.js', import.meta.url);
const graphThemeContractSource = new URL('../graph/theme-contract.js', import.meta.url);
const graphExplorerShellSource = new URL('../canvas/GraphExplorerShell/GraphExplorerShell.js', import.meta.url);
const canvasGraphSource = new URL('../canvas/CanvasGraph/CanvasGraph.js', import.meta.url);
const graphExplorerShellStyles = new URL('../canvas/GraphExplorerShell/GraphExplorerShell.css.js', import.meta.url);
const cellBgSource = new URL('../effects/CellBg/CellBg.js', import.meta.url);
const cellBgStyles = new URL('../effects/CellBg/CellBg.css.js', import.meta.url);
const cellBgThemeSource = new URL('../effects/CellBg/cell-bg-theme.js', import.meta.url);
const cascadeThemeEditorStyles = new URL('../themes/CascadeThemeEditor/CascadeThemeEditor.css.js', import.meta.url);
const uiIndexSource = new URL('../ui/index.js', import.meta.url);
const componentRegistrySource = new URL('../manifest/component-registry.js', import.meta.url);
const themeCatalogSource = new URL('../manifest/theme-catalog.js', import.meta.url);
const customElementsSource = new URL('../custom-elements.json', import.meta.url);
const defaultProviderTokensSource = new URL('../tokens/themes/default-provider.json', import.meta.url);
const defaultDarkTokensSource = new URL('../tokens/themes/default-dark.json', import.meta.url);
const componentDescriptorV2Source = new URL('../schemas/component-descriptor-v2.json', import.meta.url);
const cascadeThemeVisualFixtureSource = new URL('./fixtures/cascade-theme-visual-states.js', import.meta.url);

function parseRgbToken(_source, value) {
  let match = value.match(/rgba?\(([^)]+)\)/);
  assert.ok(match, `expected rgb token, got ${value}`);
  return match[1]
    .replaceAll(',', ' ')
    .split(/[ /\t]+/)
    .filter(Boolean)
    .slice(0, 3)
    .map(Number);
}

function flattenTokenTargets(tokenTargets = {}) {
  return new Set(Object.values(tokenTargets).flat());
}

function createMemoryStorage(initialEntries = []) {
  let store = new Map(initialEntries);
  let calls = [];
  return {
    calls,
    get length() {
      return store.size;
    },
    key(index) {
      return Array.from(store.keys())[index] ?? null;
    },
    getItem(key) {
      return store.has(key) ? store.get(key) : null;
    },
    setItem(key, value) {
      calls.push(['setItem', key, value]);
      store.set(key, String(value));
    },
    removeItem(key) {
      calls.push(['removeItem', key]);
      store.delete(key);
    },
    clear() {
      calls.push(['clear']);
      store.clear();
    },
    entries() {
      return Array.from(store.entries());
    },
  };
}

function createStyleStub() {
  let values = new Map();
  return {
    setProperty(name, value) {
      values.set(name, value);
    },
    removeProperty(name) {
      values.delete(name);
    },
    getPropertyValue(name) {
      return values.get(name) || '';
    },
    [Symbol.iterator]() {
      return values.keys();
    },
  };
}

test('theme scroll chrome helpers use cascade tokens', async () => {
  const [source, scrollFade] = await Promise.all([
    readFile(scrollbarSource, 'utf8'),
    readFile(scrollFadeSource, 'utf8'),
  ]);

  assert.match(
    source,
    /const SCROLLBAR_COLOR = 'var\(--sn-scrollbar-thumb, currentColor\) var\(--sn-scrollbar-track, transparent\)'/
  );
  assert.match(scrollFade, /const SCROLL_SHADOW_SIZE = 'var\(--sn-scroll-shadow-size, 14px\)'/);
  assert.match(scrollFade, /const SCROLL_FADE_MASK_PROPERTY = '--sn-scroll-fade-mask'/);
  assert.match(scrollFade, /const SCROLL_FADE_THRESHOLD = 1/);
  assert.match(scrollFade, /\$\{SCROLL_FADE_AXIS_PROPERTY\}: \$\{axis\};/);
  assert.match(scrollFade, /\$\{SCROLL_FADE_ACTIVE_MASK_PROPERTY\}: \$\{mask\};/);
  assert.match(scrollFade, /-webkit-mask-image: var\(\$\{SCROLL_FADE_MASK_PROPERTY\}\);/);
  assert.match(scrollFade, /mask-image: var\(\$\{SCROLL_FADE_MASK_PROPERTY\}\);/);
  assert.match(scrollFade, /maskSize\.includes\('100% 100%'\)/);
  assert.match(scrollFade, /maskRepeat\.includes\('no-repeat'\)/);
  assert.match(scrollFade, /inlineOverflow && !blockOverflow/);
  assert.match(scrollFade, /blockOverflow && !inlineOverflow/);
  assert.match(scrollFade, /updateScrollFadeAncestors/);
  assert.match(scrollFade, /ResizeObserver/);
});

test('cascade theme lab mutates root tokens instead of applying local component themes', async () => {
  const [source, html, graphExplorerShell] = await Promise.all([
    readFile(cascadeDemoSource, 'utf8'),
    readFile(cascadeDemoHtml, 'utf8'),
    readFile(graphExplorerShellSource, 'utf8'),
  ]);

  assert.match(source, /import Symbiote, \{ html \} from '@symbiotejs\/symbiote'/);
  assert.match(source, /'cascade-theme-editor'/);
  assert.match(source, /'cascade-theme-widget'/);
  assert.match(source, /'project-tabs'/);
  assert.match(source, /component: 'cascade-theme-editor'/);
  assert.match(source, /'storage-key': CASCADE_THEME_STORAGE_KEY/);
  assert.match(source, /class CascadeGraphPanel extends Symbiote/);
  assert.match(source, /class CascadeUiPanel extends Symbiote/);
  assert.match(source, /class CascadeChatPanel extends Symbiote/);
  assert.match(source, /applyTheme\(document\.documentElement, DEFAULT_PROVIDER_THEME\)/);
  assert.match(source, /--sn-theme-outline-strength/);
  assert.match(source, /--sn-theme-type-scale/);
  assert.match(source, /--sn-theme-heading-scale/);
  assert.match(source, /--sn-theme-pattern-brightness/);
  assert.match(source, /--sn-shape-stroke/);
  assert.match(source, /--sn-shape-stroke-width/);
  assert.match(source, /--sn-node-label-size/);
  assert.match(source, /--sn-type-source/);
  assert.match(source, /--sn-type-action/);
  assert.match(source, /--sn-cat-control/);
  assert.match(source, /--sn-cat-data/);
  assert.match(source, /--sn-tab-accent-1/);
  assert.match(source, /--sn-markdown-h1-size/);
  assert.match(source, /--sn-chat-markdown-h1-size/);
  assert.match(source, /--sn-chat-user-message-bg/);
  assert.match(source, /--sn-composer-bg/);
  assert.match(source, /--sn-chat-list-header-padding/);
  assert.match(source, /--sn-chat-list-item-padding/);
  assert.match(source, /--sn-chat-sidebar-header-padding/);
  assert.match(source, /--sn-chat-sidebar-row-padding/);
  assert.match(source, /--sn-syntax-keyword/);
  assert.match(source, /--sn-cell-dot/);
  assert.match(source, /--sn-cell-base-alpha/);
  assert.match(source, /--sn-cell-alpha-span/);
  assert.match(source, /--sn-cell-noise/);
  assert.match(source, /--sn-node-icon-size/);
  assert.match(source, /--sn-node-pill-body-padding/);
  assert.match(source, /--sn-node-circle-body-padding/);
  assert.match(source, /CIRCLE_SAMPLE_IMAGE/);
  assert.match(source, /SVG_NODE_SAMPLE_IMAGE/);
  assert.match(source, /id: 'circle-icon-sample'/);
  assert.match(source, /id: 'circle-image-sample'/);
  assert.match(source, /id: 'pill-sample'/);
  assert.match(source, /id: 'svg-shape-sample'/);
  assert.match(source, /id: 'comment-sample'/);
  assert.match(source, /shape: 'circle'/);
  assert.match(source, /shape: 'disc'/);
  assert.match(source, /shape: 'pill'/);
  assert.match(source, /shape: 'hexagon'/);
  assert.match(source, /shape: 'comment'/);
  assert.match(source, /image: CIRCLE_SAMPLE_IMAGE/);
  assert.match(source, /media: SVG_NODE_SAMPLE_IMAGE/);
  assert.match(source, /--sn-node-comment-body-padding/);
  assert.match(source, /--sn-port-label-size/);
  assert.match(source, /--sn-layout-header-icon-size/);
  assert.match(source, /display\/LoadingOverlay\/LoadingOverlay\.js/);
  assert.match(source, /display\/EmptyState\/EmptyState\.js/);
  assert.match(source, /display\/StatusRibbon\/StatusRibbon\.js/);
  assert.match(source, /display\/EventFeed\/EventFeed\.js/);
  assert.match(source, /display\/DataTable\/DataTable\.js/);
  assert.match(source, /display\/SourceViewer\/SourceViewer\.js/);
  assert.match(source, /list\/ListDetailShell\/ListDetailShell\.js/);
  assert.match(source, /board\/KanbanBoard\/KanbanBoard\.js/);
  assert.match(source, /runtime\/product-context\.js/);
  assert.match(source, /webmcp\.js/);
  assert.match(source, /customElements\.whenDefined\('sn-loading-overlay'\)/);
  assert.match(source, /customElements\.whenDefined\('sn-empty-state'\)/);
  assert.match(source, /customElements\.whenDefined\('sn-status-ribbon'\)/);
  assert.match(source, /customElements\.whenDefined\('sn-event-feed'\)/);
  assert.match(source, /customElements\.whenDefined\('sn-data-table'\)/);
  assert.match(source, /customElements\.whenDefined\('source-viewer'\)/);
  assert.match(source, /customElements\.whenDefined\('sn-list-detail-shell'\)/);
  assert.match(source, /customElements\.whenDefined\('sn-kanban-board'\)/);
  assert.match(source, /<sn-loading-overlay/);
  assert.match(source, /constructor-overlay-sample/);
  assert.match(source, /<sn-empty-state/);
  assert.match(source, /<sn-status-ribbon/);
  assert.match(source, /<sn-event-feed/);
  assert.match(source, /<sn-data-table/);
  assert.match(source, /<source-viewer slot="detail"/);
  assert.match(source, /<sn-list-detail-shell/);
  assert.match(source, /class CascadeBoardPanel extends Symbiote/);
  assert.match(source, /<sn-kanban-board/);
  assert.match(source, /view\('kanban-board', 'Kanban board', 'view_kanban', createBoardLayout\)/);
  assert.match(source, /component: 'cascade-board-panel'/);
  assert.match(source, /const AUTOMATION_PRODUCT_CONTEXT = \{/);
  assert.match(source, /class CascadeProductContextPanel extends Symbiote/);
  assert.match(source, /createProductContextAgentView\(AUTOMATION_PRODUCT_CONTEXT\)/);
  assert.match(source, /createProductContextToolDescriptors\(AUTOMATION_PRODUCT_CONTEXT\)/);
  assert.match(source, /component: 'cascade-product-context-panel'/);
  assert.match(source, /view\('product-context', 'Product context', 'api', createProductContextLayout\)/);
  assert.match(source, /release_flow_request_move/);
  assert.match(source, /componentRefs: \['release-board'\]/);
  assert.match(source, /setProgress\(64, 'Composing UI'/);
  assert.match(source, /setEvents\(\[/);
  assert.match(source, /setData\(\{/);
  assert.match(source, /showFile\(\{/);
  assert.match(source, /canvas\/GraphExplorerShell\/GraphExplorerShell\.js/);
  assert.match(source, /node\/GraphNode\/GraphNode\.js/);
  assert.match(source, /customElements\.whenDefined\('graph-explorer-shell'\)/);
  assert.match(source, /<graph-explorer-shell/);
  assert.doesNotMatch(source, /graph-explorer-toolbar lab-graph-toolbar/);
  assert.doesNotMatch(source, /graph-explorer-btn lab-graph-tool/);
  assert.match(source, /<node-canvas class="lab-canvas" slot="canvas"/);
  assert.match(source, /graph-shell-path-style-change/);
  assert.match(source, /graph-shell-action/);
  assert.match(source, /id: 'graph:insert-node'/);
  assert.match(source, /id: 'graph:insert-edge'/);
  assert.match(source, /id: 'graph:fit-view'/);
  assert.match(source, /id: 'graph:reset-view'/);
  assert.match(source, /event\.detail\?\.actionId\?\.startsWith\('graph:'\)/);
  assert.match(source, /setStats\?\.\(\[/);
  assert.match(source, /_handleGraphShellAction\(action\)/);
  assert.match(graphExplorerShell, /event\.composedPath\?\.\(\)\.find/);
  assert.match(graphExplorerShell, /event\.stopPropagation\?\.\(\)/);
  assert.match(source, /_insertDemoNode\(\)/);
  assert.match(source, /_insertDemoEdge\(\)/);
  assert.match(source, /this\._editor\.addNode\(node\)/);
  assert.match(source, /this\._editor\.addConnection\(new Connection/);
  assert.match(source, /this\._flowNodeIds\.push\(node\.id\)/);
  assert.match(source, /chat\/ChatWorkspace\/ChatWorkspace\.js/);
  assert.match(source, /<chat-workspace/);
  assert.match(source, /getSidebar\?\.\(\)/);
  assert.match(source, /setAutoCollapse\?\.\(false\)/);
  assert.doesNotMatch(source, /data-bg-action="trigger"/);
  assert.doesNotMatch(source, /data-bg-action="start"/);
  assert.doesNotMatch(source, /data-bg-action="stop"/);
  assert.match(source, /_triggerBg\(9000\)/);
  assert.match(source, /triggerBackground\?\.\(duration\)/);
  assert.match(source, /startBackground\?\.\(\)/);
  assert.match(source, /stopBackground\?\.\(\)/);
  assert.match(source, /chat-workspace-input/);
  assert.match(source, /chat-workspace-submit/);
  assert.match(source, /chat-workspace-send/);
  assert.match(source, /chat-workspace-chat-select/);
  assert.match(source, /chat-workspace-footer-intent/);
  assert.match(source, /chat-workspace-context-intent/);
  assert.match(source, /chat-workspace-voice-intent/);
  assert.match(source, /sourceEvent === 'chat-composer-voice-input'/);
  assert.match(source, /sourceEvent === 'chat-composer-voice-response-toggle'/);
  assert.match(source, /CASCADE_CHAT_VOICE_STORAGE_KEY/);
  assert.match(source, /readStoredChatVoiceSettings/);
  assert.match(source, /writeStoredChatVoiceSettings/);
  assert.match(source, /voiceResponseEnabled: true/);
  assert.match(source, /_setVoiceDemoState\(action === 'stop' \? 'idle' : 'listening', action === 'stop' \? 'idle' : 'wake'/);
  assert.match(source, /sourceEvent === 'chat-composer-voice-approve'[\s\S]*_startMockStream\(text\)/);
  assert.match(source, /role: 'agent'/);
  assert.match(source, /role: 'board'/);
  assert.match(source, /role: 'tool'/);
  assert.match(source, /role: 'thinking'[\s\S]*done: false/);
  assert.match(source, /role: 'thinking'[\s\S]*done: true/);
  assert.match(source, /\| Chat data \| Rendered by library \| Agent-facing use \|/);
  assert.doesNotMatch(source, /role: 'assistant'/);
  assert.match(source, /_ensureMockThreads\(\)/);
  assert.match(source, /_mockChatCatalog\(\)/);
  assert.match(source, /_selectMockChat\(chatId = ''\)/);
  assert.match(source, /_handleWorkspaceFooterIntent\(event\)/);
  assert.match(source, /_handleWorkspaceContextIntent\(event\)/);
  assert.match(source, /_handleWorkspaceSend\(event\)/);
  assert.match(source, /_startMockStream\(value\)/);
  assert.match(source, /_stopMockStream\(reason = 'stopped'\)/);
  assert.match(source, /_recordHostEvent\(type, detail = \{\}\)/);
  assert.match(source, /cascade-chat-host-flow/);
  assert.match(source, /dataset\.hostEventCount/);
  assert.match(source, /dataset\.hostFlowStep/);
  assert.match(source, /setLiveStatus\?\.\(\{ phase: 'tool'/);
  assert.match(source, /setLiveStatus\?\.\(\{ phase: 'responding'/);
  assert.match(source, /background: \{ state: 'streaming'/);
  assert.match(source, /background: \{ state: 'done'/);
  assert.match(source, /background: \{ state: 'stop'/);
  assert.match(source, /_queueBgStop\(4600\)/);
  assert.match(source, /_queueBgStop\(6600\)/);
  assert.doesNotMatch(source, /data-bg-action/);
  assert.doesNotMatch(source, /data-voice-state/);
  assert.match(source, /component: 'cascade-chat-panel'/);
  assert.match(source, /CASCADE_THEME_STORAGE_KEY/);
  assert.match(source, /readStoredCascadeTheme/);
  assert.match(source, /CASCADE_THEME_QUERY_KEYS/);
  assert.match(source, /function readUrlCascadeTheme\(\)/);
  assert.match(source, /normalizeCascadeThemeOptions\(options\)/);
  assert.match(source, /function readInitialCascadeTheme\(\)/);
  assert.match(source, /applyCascadeTheme\(document\.documentElement, readInitialCascadeTheme\(\)/);
  assert.match(source, /'chroma'/);
  assert.match(source, /'pattern'/);
  assert.match(source, /'heading'/);
  assert.match(source, /setMessages\(/);
  assert.match(source, /setChats\(/);
  assert.match(source, /setContent\(/);
  assert.match(source, /setComposerState\(\{/);
  assert.match(source, /voiceControls: this\._buildVoiceControlsConfig\(/);
  assert.match(source, /let voiceAvailable = normalized !== 'disabled'/);
  assert.match(source, /let isManualVoice = activeMode === 'manual'/);
  assert.match(source, /let isWakeVoice = activeMode === 'wake'/);
  assert.match(source, /let isWakeDictation = isWakeVoice && this\._voiceDemoWakeMatched/);
  assert.match(source, /visible: voiceAvailable/);
  assert.match(source, /visible: voiceModeActive/);
  assert.match(source, /active: this\._voiceResponseEnabled/);
  assert.match(source, /speaking: this\._speakingVoiceResponse/);
  assert.match(source, /wakeMatched: false/);
  assert.match(source, /showPreview: false/);
  assert.match(source, /_speakVoiceResponseText\(responseText\)/);
  assert.match(source, /footerControls: this\._buildFooterControls\(\)/);
  assert.match(source, /id: 'provider'/);
  assert.match(source, /id: 'model'/);
  assert.match(source, /id: 'agent'/);
  assert.match(source, /id: 'task'/);
  assert.match(source, /id: 'settings'/);
  assert.doesNotMatch(source, /data-voice-state="idle"/);
  assert.doesNotMatch(source, /data-voice-state="listening"/);
  assert.doesNotMatch(source, /data-voice-state="transcribing"/);
  assert.doesNotMatch(source, /data-voice-state="speaking"/);
  assert.doesNotMatch(source, /data-voice-state="disabled"/);
  assert.match(source, /menuActions/);
  assert.match(source, /path:pcb/);
  assert.match(source, /panel-menu-actions/);
  assert.match(source, /setLayoutBehavior/);
  assert.match(source, /responsiveMode: 'stack'/);
  assert.match(source, /importance: 95/);
  assert.match(source, /const showcaseProjects = \[/);
  assert.match(source, /const showcaseProjectGroups = showcaseProjects\.map/);
  assert.match(source, /id: 'symbiote-ui'/);
  assert.match(source, /name: 'Symbiote UI'/);
  assert.match(source, /id: 'multi-agent-dev'/);
  assert.match(source, /id: 'automation'/);
  assert.match(source, /id: 'media-generation'/);
  assert.match(source, /id: 'video-editor'/);
  assert.match(source, /id: 'data-research'/);
  assert.match(source, /id: 'node-studio'/);
  assert.match(source, /id: 'spatial-xr'/);
  assert.match(source, /class CascadeProjectPanel/);
  assert.match(source, /class CascadeSourcePanel/);
  assert.match(source, /class CascadeDocsPanel/);
  assert.match(source, /class CascadeProjectMapPanel/);
  assert.match(source, /<source-editor/);
  assert.match(source, /<source-viewer/);
  assert.match(source, /<sn-tree-panel/);
  assert.match(source, /<canvas-graph/);
  assert.doesNotMatch(source, /project-showcase-panel/);
  assert.match(source, /Project files/);
  assert.match(source, /docs\/agent-workspace\.md/);
  assert.match(source, /createProjectLayout/);
  assert.match(source, /createProjectSourceLayout/);
  assert.match(source, /createProjectDocsLayout/);
  assert.match(source, /createProjectMapLayout/);
  assert.match(source, /createGraphLayout/);
  assert.match(source, /class CascadeRuntimePanel/);
  assert.match(source, /class CascadeSpatialPanel/);
  assert.match(source, /spatial-graph-v1/);
  assert.match(source, /data-node="project"/);
  assert.match(source, /createRuntimeLayout/);
  assert.match(source, /createSpatialLayout/);
  assert.match(source, /view\('runtime-ui', 'Runtime UI', 'memory', createRuntimeLayout\)/);
  assert.match(source, /view\('3d-graph', '3D graph', 'deployed_code', createSpatialLayout\)/);
  assert.match(source, /view\('layout-groups', 'Layout groups', 'view_quilt', createProjectSourceLayout\)/);
  assert.match(source, /view\('project-overview', 'Project overview', 'dashboard', createProjectLayout\)/);
  assert.match(source, /view\('source-editor', 'Source editor', 'edit_note', createProjectSourceLayout\)/);
  assert.match(source, /view\('markdown-docs', 'Markdown\/docs', 'description', createProjectDocsLayout\)/);
  assert.match(source, /view\('dependency-graph', 'Dependency graph', 'hub', createProjectMapLayout\)/);
  assert.match(source, /view\('component-roles', 'Component roles', 'category', createComponentsLayout\)/);
  assert.doesNotMatch(source, /createLayout:/);
  assert.match(source, /setGroups\?\.\(showcaseProjectGroups, activeProjectId\)/);
  assert.match(source, /syncProjectSidebar/);
  assert.match(source, /sidebar\.setSections\?\./);
  assert.match(source, /sidebar\.setActiveSection\?\./);
  assert.match(source, /viewSectionId/);
  assert.match(source, /applyShowcaseView/);
  assert.match(source, /layout-group-change/);
  assert.match(source, /sidebar-section-select/);
  assert.doesNotMatch(source, /project-tabs-select/);
  assert.match(source, /'layout-shell-menu'/);
  assert.doesNotMatch(source, /setShellTabs/);
  assert.match(source, /cascade-theme-open-full/);
  assert.match(source, /layout\.openPanel\('theme'/);
  assert.match(source, /uiInvoked: true/);
  assert.match(source, /source: 'theme-widget'/);
  assert.doesNotMatch(source, /selectGroup\?\.\('theme', 'theme-widget'\)/);
  assert.match(source, /createThemeLayout/);
  assert.doesNotMatch(source, /FORCED_SCROLL_INLINE_SIZE/);
  assert.match(source, /readHashState/);
  assert.match(source, /data-layout-command/);
  assert.match(source, /overflow: 'scroll-inline'/);
  assert.match(source, /voice-input-defaults/);
  assert.match(source, /matchVoiceCommandAtEnd/);
  assert.match(source, /Commands/);
  assert.match(html, /project-type workspaces/);
  assert.match(html, /<layout-shell-menu/);
  assert.match(html, /<cascade-theme-widget/);
  assert.match(html, /target-selector=":root"/);
  assert.match(html, /data-layout-command="reset"/);
  assert.doesNotMatch(html, /data-layout-command="scroll"/);
  assert.match(html, /class="lab-shell"/);
  assert.match(html, /100dvh/);
  assert.doesNotMatch(html, /100vh/);
  assert.doesNotMatch(html, /--sn-tabs-bg/);
  assert.match(html, /project-path="project-type workspaces \/ agent constructor"/);
  assert.match(source, /route: '#automation\/product-context'/);
  assert.match(html, /<layout-sidebar id="lab-sidebar" slot="sidebar"/);
  assert.doesNotMatch(html, /agent-chat-rail/);
  assert.match(source, /createCollapsedAgentChatPanel/);
  assert.match(source, /layout\.registerPanelType\('agent-chat'/);
  assert.match(source, /panel\.collapsed = true/);
  assert.match(source, /singleton: 'page-agent-chat'/);
  assert.match(source, /createShowcaseLayout/);
  assert.match(source, /project\.id === 'chat' \? viewLayout : createShowcaseLayout\(viewLayout\)/);
  assert.match(source, /component: 'cascade-overview-panel'/);
  assert.match(source, /component: 'cascade-chat-panel'/);
  assert.match(html, /slot="actions" type="button" data-layout-command="reset"/);
  assert.doesNotMatch(html, /slot="actions" type="button" data-layout-command="scroll"/);
  assert.doesNotMatch(source, /const layoutGroups = \[/);
  assert.doesNotMatch(source, /const layoutFactories = new Map/);
  assert.match(source, /sidebar\.\$\.collapsed = true/);
  assert.match(source, /sidebarLabel: 'Symbiote UI'/);
  assert.match(source, /sidebarLabel: 'Development'/);
  assert.match(source, /sidebarLabel: 'Spatial'/);
  assert.doesNotMatch(source, /disabled: true/);
  assert.doesNotMatch(html, /class="lab-toolbar"/);
  assert.doesNotMatch(html, /lab-main-menu/);
  assert.doesNotMatch(html, /<project-tabs/);
  assert.doesNotMatch(html, /menu-open/);
  assert.doesNotMatch(html, /slot="menu-actions"/);
  assert.doesNotMatch(html, /data-layout-group=/);
  assert.doesNotMatch(source, /extends HTMLElement/);
  assert.doesNotMatch(source, /\.setTheme\(/);
  assert.doesNotMatch(source, /10 \+ brightness \* 0\.18/);
  assert.doesNotMatch(source, /setToken\(/);
  assert.doesNotMatch(source, /querySelector\('\[data-control/);
  assert.doesNotMatch(html, /data-control=/);
});

test('layout shell menu mirrors the Agent Portal topbar, tabs, sidebar, and workspace shell', async () => {
  const [source, template, styles] = await Promise.all([
    readFile(layoutShellMenuSource, 'utf8'),
    readFile(layoutShellMenuTemplate, 'utf8'),
    readFile(layoutShellMenuStyles, 'utf8'),
  ]);

  assert.match(source, /setTabs\(tabs = \[\], activeId = this\.\$\.activeId\)/);
  assert.match(source, /title: 'Workspace'/);
  assert.doesNotMatch(source, /title: 'Agent Portal'/);
  assert.match(template, /class="app-topbar"/);
  assert.match(template, /class="shell-tabs-row"/);
  assert.match(template, /<project-tabs class="shell-tabs"/);
  assert.match(template, /slot name="sidebar"/);
  assert.match(template, /class="app-workspace-content"/);
  assert.match(styles, /background-image: linear-gradient\(to bottom, var\(--sn-sys-surface-raised\), var\(--sn-sys-surface\)\)/);
  assert.match(styles, /background-size: 100% var\(--sn-shell-top-gradient-size, 78px\)/);
  assert.match(styles, /height: var\(--sn-app-topbar-height, 40px\)/);
  assert.match(styles, /\.shell-tabs-row/);
  assert.match(styles, /\.shell-tabs-row \{[\s\S]*?background: transparent;/);
  assert.match(styles, /--sn-tabs-bg: var\(--sn-shell-tabs-bg, transparent\)/);
  assert.match(styles, /::slotted\(\[slot='sidebar'\]\)/);
  assert.match(styles, /letter-spacing: var\(--sn-app-title-letter-spacing, 0\.5px\)/);
  assert.doesNotMatch(source, /sideMenuItems/);
  assert.doesNotMatch(source, /layout-shell-menu-item/);
  assert.doesNotMatch(template, /shell-menu-drawer/);
  assert.doesNotMatch(template, /slot name="menu-actions"/);
});

test('cascade theme is a reusable library contract with WebMCP metadata', async () => {
  const source = await readFile(cascadeThemeSource, 'utf8');
  const themeModule = await import(cascadeThemeSource.href);
  const defaultTheme = themeModule.createCascadeTheme();
  const theme = themeModule.createCascadeTheme({
    themeVariant: 'modern',
    mode: 'dark',
    brightness: 0,
    contrast: 58,
    chroma: 89,
    hue: 218,
    outline: 38,
    type: 100,
    density: 100,
  });
  const motionScaleTheme = themeModule.createCascadeTheme({ motion: 60 });
  const disabledMotionTheme = themeModule.createCascadeTheme({ motion: 0 });
  const noOutlineTheme = themeModule.createCascadeTheme({ outline: 0 });
  const fullOutlineTheme = themeModule.createCascadeTheme({ outline: 100 });
  const balancedHeadingTheme = themeModule.createCascadeTheme({ type: 100, heading: 120 });
  const noPatternTheme = themeModule.createCascadeTheme({ pattern: 0 });
  const fullPatternTheme = themeModule.createCascadeTheme({ pattern: 100 });
  const classicTheme = themeModule.createCascadeTheme({ themeVariant: 'classic' });
  const classicBrightTheme = themeModule.createCascadeTheme({ themeVariant: 'classic', brightness: 50 });
  const classicLowChromaTheme = themeModule.createCascadeTheme({ themeVariant: 'classic', chroma: 0 });
  const earTheme = themeModule.createCascadeTheme({ themeVariant: 'modern', tabShape: 'ear' });
  const flatUiRadiusTheme = themeModule.createCascadeTheme({ themeVariant: 'modern', radius: 0 });
  const flatTabRadiusTheme = themeModule.createCascadeTheme({ themeVariant: 'modern', tabRadius: 0 });
  const flatCellRadiusTheme = themeModule.createCascadeTheme({ themeVariant: 'modern', cellRadius: 0 });
  const flatComposerRadiusTheme = themeModule.createCascadeTheme({ themeVariant: 'modern', composerRadius: 0 });
  const noScrollShadowTheme = themeModule.createCascadeTheme({ themeVariant: 'modern', scrollShadow: 0 });
  const largerScrollShadowTheme = themeModule.createCascadeTheme({ themeVariant: 'modern', scrollShadow: 22 });
  const cappedScrollShadowTheme = themeModule.createCascadeTheme({ themeVariant: 'modern', scrollShadow: 99 });

  assert.equal(defaultTheme.state.themeVariant, 'classic');
  assert.equal(defaultTheme.state.tabShape, 'classic-ear');
  assert.equal(defaultTheme.state.contrast, 100);
  assert.equal(defaultTheme.state.chroma, 89);
  assert.equal(defaultTheme.state.hue, 218);
  assert.equal(defaultTheme.state.pattern, 100);
  assert.equal(defaultTheme.state.outline, 0);
  assert.equal(defaultTheme.state.radius, 0);
  assert.equal(defaultTheme.state.composerRadius, 100);
  assert.equal(defaultTheme.state.scrollShadow, 14);
  assert.equal(defaultTheme.state.frameRadius, 0);
  assert.equal(defaultTheme.tokens['--sn-theme-variant'], 'classic');
  assert.equal(defaultTheme.tokens['--sn-tabs-shape'], 'classic-ear');
  assert.equal(defaultTheme.tokens['--sn-tabs-active-border'], 'transparent');
  assert.equal(theme.name, 'cascade-theme');
  assert.equal(theme.state.mode, 'dark');
  assert.equal(theme.state.themeVariant, 'modern');
  assert.equal(theme.state.tabShape, 'frame');
  assert.equal(theme.state.tabRadius, 17);
  assert.equal(theme.tokens['--sn-theme-name'], 'cascade-theme');
  assert.equal(theme.tokens['--sn-theme-variant'], 'modern');
  assert.equal(theme.tokens['--sn-tabs-shape'], 'frame');
  assert.equal(theme.tokens['--sn-theme-bg-lightness'], '10.0%');
  assert.equal(theme.tokens['--sn-theme-text-lightness'], '94.0%');
  assert.equal(theme.tokens['--sn-theme-heading-scale'], '1.11');
  assert.equal(balancedHeadingTheme.tokens['--sn-theme-heading-scale'], '1.20');
  assert.equal(theme.state.pattern, 100);
  assert.equal(theme.tokens['--sn-theme-pattern-brightness'], '1.00');
  assert.equal(defaultTheme.tokens['--sn-theme-pattern-brightness'], '1.00');
  assert.equal(theme.state.motion, 100);
  assert.equal(theme.tokens['--sn-theme-motion-scale'], '1.00');
  assert.equal(theme.tokens['--sn-motion-enabled'], '1');
  assert.equal(theme.tokens['--sn-animation-play-state'], 'running');
  assert.equal(theme.tokens['--sn-animation-duration-scale'], '1.00');
  assert.equal(theme.tokens['--sn-animation-duration-fast'], '600ms');
  assert.equal(theme.tokens['--sn-animation-duration-normal'], '1000ms');
  assert.equal(theme.tokens['--sn-animation-duration-slow'], '1500ms');
  assert.equal(theme.tokens['--sn-animation-duration-slower'], '2000ms');
  assert.equal(theme.tokens['--sn-transition-easing'], 'ease');
  assert.equal(theme.tokens['--sn-transition-fast'], '120ms');
  assert.equal(theme.tokens['--sn-transition-normal'], '240ms');
  assert.equal(theme.tokens['--sn-transition-slow'], '400ms');
  assert.equal(theme.tokens['--sn-theme-tab-radius-scale'], '1.00');
  assert.equal(theme.tokens['--sn-theme-cell-radius-scale'], '1.00');
  assert.equal(theme.tokens['--sn-theme-composer-radius-scale'], '1.00');
  assert.equal(theme.tokens['--sn-composer-radius'], 'calc(20px * var(--sn-theme-composer-radius-scale, 1))');
  assert.equal(theme.tokens['--sn-tabs-corner-radius'], 'calc(8px * var(--sn-theme-density, 1) * 1.000)');
  assert.equal(theme.tokens['--sn-tabs-radius'], theme.tokens['--sn-tabs-corner-radius']);
  assert.equal(theme.tokens['--sn-tabs-active-border'], 'color-mix(in oklab, var(--tab-accent, var(--sn-tabs-accent)) 44%, transparent)');
  assert.equal(flatUiRadiusTheme.tokens['--sn-theme-radius-scale'], '0.00');
  assert.equal(flatUiRadiusTheme.tokens['--sn-tabs-radius'], theme.tokens['--sn-tabs-radius']);
  assert.equal(flatUiRadiusTheme.tokens['--sn-theme-cell-radius-scale'], '1.00');
  assert.equal(flatUiRadiusTheme.tokens['--sn-theme-composer-radius-scale'], '1.00');
  assert.equal(flatUiRadiusTheme.tokens['--sn-composer-radius'], theme.tokens['--sn-composer-radius']);
  assert.equal(flatUiRadiusTheme.tokens['--sn-cell-min-radius'], theme.tokens['--sn-cell-min-radius']);
  assert.equal(flatUiRadiusTheme.tokens['--sn-cell-max-radius'], theme.tokens['--sn-cell-max-radius']);
  assert.equal(flatTabRadiusTheme.tokens['--sn-theme-radius-scale'], '1.00');
  assert.equal(flatTabRadiusTheme.tokens['--sn-theme-tab-radius-scale'], '0.00');
  assert.match(flatTabRadiusTheme.tokens['--sn-tabs-radius'], /\* 0\.000\)/);
  assert.equal(flatCellRadiusTheme.tokens['--sn-theme-radius-scale'], '1.00');
  assert.equal(flatCellRadiusTheme.tokens['--sn-theme-cell-radius-scale'], '0.00');
  assert.equal(flatCellRadiusTheme.tokens['--sn-cell-min-radius'], 'calc(2px * var(--sn-theme-cell-radius-scale, 1))');
  assert.equal(flatCellRadiusTheme.tokens['--sn-cell-max-radius'], 'calc(5px * var(--sn-theme-cell-radius-scale, 1))');
  assert.equal(flatComposerRadiusTheme.tokens['--sn-theme-radius-scale'], '1.00');
  assert.equal(flatComposerRadiusTheme.tokens['--sn-theme-composer-radius-scale'], '0.00');
  assert.equal(flatComposerRadiusTheme.tokens['--sn-composer-radius'], theme.tokens['--sn-composer-radius']);
  assert.equal(theme.tokens['--sn-scroll-shadow-size'], '14.0px');
  assert.equal(noScrollShadowTheme.tokens['--sn-scroll-shadow-size'], '0.0px');
  assert.equal(largerScrollShadowTheme.tokens['--sn-scroll-shadow-size'], '22.0px');
  assert.equal(cappedScrollShadowTheme.tokens['--sn-scroll-shadow-size'], '48.0px');
  assert.equal(theme.tokens['--sn-tabs-active-corner-display'], 'none');
  assert.equal('--sn-tabs-strip-line-display' in theme.tokens, false);
  assert.equal(earTheme.state.tabShape, 'ear');
  assert.match(earTheme.tokens['--sn-tabs-radius'], /0 0$/);
  assert.equal(earTheme.tokens['--sn-tabs-active-corner-display'], 'none');
  assert.equal(classicTheme.state.themeVariant, 'classic');
  assert.equal(classicTheme.state.tabShape, 'classic-ear');
  assert.equal(classicTheme.state.tabRadius, 17);
  assert.equal(classicTheme.state.bgLightness, -1);
  assert.equal(classicTheme.state.surfaceLightness, -1);
  assert.equal(classicTheme.state.accentLightness, -1);
  assert.equal(classicTheme.state.accentChroma, -1);
  assert.equal(classicTheme.state.pattern, 100);
  assert.equal(classicTheme.state.outline, 0);
  assert.equal(classicTheme.state.radius, 0);
  assert.equal(classicTheme.state.frameRadius, 0);
  assert.equal(classicTheme.state.cellRadius, 17);
  assert.equal(classicTheme.state.composerRadius, 100);
  assert.equal(classicTheme.tokens['--sn-theme-variant'], 'classic');
  assert.equal(classicTheme.tokens['--sn-tabs-shape'], 'classic-ear');
  assert.equal(classicTheme.tokens['--sn-theme-bg-lightness'], '10.0%');
  assert.equal(classicTheme.tokens['--sn-theme-surface-lightness'], '15.1%');
  assert.equal(classicTheme.tokens['--sn-theme-outline-strength'], '0.00');
  assert.equal(classicTheme.tokens['--sn-theme-radius-scale'], '0.00');
  assert.equal(classicTheme.tokens['--sn-theme-cell-radius-scale'], '1.00');
  assert.equal(classicTheme.tokens['--sn-theme-composer-radius-scale'], '1.00');
  assert.equal(classicTheme.tokens['--sn-composer-radius'], theme.tokens['--sn-composer-radius']);
  assert.equal(classicTheme.tokens['--sn-cell-min-radius'], theme.tokens['--sn-cell-min-radius']);
  assert.equal(classicTheme.tokens['--sn-cell-max-radius'], theme.tokens['--sn-cell-max-radius']);
  assert.equal(classicTheme.tokens['--sn-theme-frame-radius-scale'], '0.00');
  assert.equal(classicTheme.tokens['--sn-sys-outline'], 'hsl(0 0% 62.0% / 0.000)');
  assert.equal(classicTheme.tokens['--sn-sys-accent'], 'hsl(218 89% 68.04%)');
  assert.equal(classicTheme.tokens['--sn-tabs-active-border'], 'transparent');
  assert.equal(classicTheme.tokens['--sn-tabs-active-corner-display'], 'block');
  assert.equal(classicTheme.tokens['--sn-tabs-corner-cut'], '11.5px');
  assert.equal(classicBrightTheme.tokens['--sn-theme-bg-lightness'], '19.0%');
  assert.equal(classicBrightTheme.tokens['--sn-theme-surface-lightness'], '24.1%');
  assert.equal(classicLowChromaTheme.tokens['--sn-theme-chroma'], '0%');
  assert.equal(classicLowChromaTheme.tokens['--sn-sys-accent'], 'hsl(218 0% 68.04%)');
  assert.equal(motionScaleTheme.state.motion, 60);
  assert.equal(motionScaleTheme.tokens['--sn-theme-motion-scale'], '0.60');
  assert.equal(motionScaleTheme.tokens['--sn-transition-fast'], '72ms');
  assert.equal(disabledMotionTheme.tokens['--sn-theme-motion-scale'], '0.00');
  assert.equal(disabledMotionTheme.tokens['--sn-motion-enabled'], '0');
  assert.equal(disabledMotionTheme.tokens['--sn-animation-play-state'], 'paused');
  assert.equal(disabledMotionTheme.tokens['--sn-animation-duration-slow'], '0ms');
  assert.equal(disabledMotionTheme.tokens['--sn-transition-fast'], '0ms');
  assert.equal(disabledMotionTheme.tokens['--sn-transition-easing'], 'linear');
  assert.equal(theme.descriptor.controls.find((control) => control.name === 'brightness')?.icon, 'brightness_6');
  assert.equal(theme.descriptor.controls.find((control) => control.name === 'pattern')?.icon, 'grain');
  assert.equal(theme.descriptor.controls.find((control) => control.name === 'heading')?.icon, 'title');
  assert.equal(theme.descriptor.controls.find((control) => control.name === 'scrollShadow')?.icon, 'gradient');
  assert.equal(theme.tokens['--sn-sys-surface'], 'hsl(0 0% 10.0%)');
  assert.equal(theme.tokens['--sn-sys-on-surface'], 'hsl(0 0% 94.0%)');
  assert.equal(theme.tokens['--sn-sys-surface-raised'], 'var(--sn-sys-surface-panel)');
  assert.equal(theme.tokens['--sn-field-control-bg'], 'var(--sn-sys-surface)');
  assert.equal(theme.tokens['--sn-chat-user-message-bg'], 'color-mix(in oklab, var(--sn-sys-surface-panel) 88%, var(--sn-sys-accent) 12%)');
  assert.equal(theme.tokens['--sn-composer-bg'], 'color-mix(in oklab, var(--sn-sys-surface-panel) 90%, var(--sn-sys-on-surface) 4%)');
  assert.equal(theme.tokens['--sn-grid-dot'], 'hsl(0 0% 94.0% / 0.088)');
  assert.equal(noPatternTheme.tokens['--sn-grid-dot'], 'hsl(0 0% 98.0% / 0.018)');
  assert.equal(fullPatternTheme.tokens['--sn-grid-dot'], 'hsl(0 0% 98.0% / 0.088)');
  assert.equal(theme.tokens['--sn-cell-dot'], 'hsl(0 0% 60.0%)');
  assert.equal(theme.tokens['--sn-cell-base-alpha'], '0.047');
  assert.equal(theme.tokens['--sn-cell-alpha-span'], '0.175');
  assert.equal(theme.tokens['--sn-hue-accent'], '218');
  assert.equal(theme.tokens['--sn-hue-warning'], '36');
  assert.equal(theme.tokens['--sn-hue-data'], '188');
  assert.equal(theme.tokens['--sn-hue-danger'], '4');
  assert.equal(theme.tokens['--sn-sys-danger'], 'hsl(4 89% 58%)');
  assert.equal(theme.tokens['--sn-sys-success'], 'hsl(122 89% 57%)');
  assert.equal(theme.tokens['--sn-sys-warning'], 'hsl(36 89% 58%)');
  assert.equal(theme.tokens['--sn-cat-control'], 'hsl(36 89% 58%)');
  assert.equal(theme.tokens['--sn-cat-data'], 'hsl(188 89% 42.0%)');
  assert.equal(theme.tokens['--sn-type-action'], 'hsl(4 89% 78.0%)');
  assert.equal(theme.tokens['--sn-type-data'], 'hsl(218 89% 74.0%)');
  assert.equal(theme.tokens['--sn-type-source'], 'var(--sn-cat-server)');
  assert.equal(theme.tokens['--sn-type-canvas'], 'var(--sn-cat-module)');
  assert.equal(theme.tokens['--sn-type-layout'], 'var(--sn-cat-data)');
  assert.equal(theme.tokens['--sn-type-controls'], 'var(--sn-cat-control)');
  assert.equal(theme.tokens['--sn-graph-type-action'], 'var(--sn-type-action)');
  assert.equal(theme.tokens['--sn-graph-type-data'], 'var(--sn-type-data)');
  assert.equal(theme.tokens['--sn-tab-accent-0'], 'var(--sn-cat-server)');
  assert.equal(theme.tokens['--sn-tab-accent-1'], 'var(--sn-cat-data)');
  assert.equal(theme.tokens['--sn-tab-accent-2'], 'var(--sn-cat-control)');
  assert.equal(theme.tokens['--sn-tab-accent-4'], 'var(--sn-type-action)');
  assert.equal(theme.tokens['--sn-button-primary-bg'], 'var(--sn-sys-accent)');
  assert.equal(theme.tokens['--sn-button-primary-color'], 'hsl(0 0% 7.5%)');
  assert.equal(theme.tokens['--sn-button-success-color'], 'hsl(0 0% 7.5%)');
  assert.equal(theme.tokens['--sn-button-danger-hover-color'], 'hsl(0 0% 7.5%)');
  assert.equal(theme.tokens['--sn-shape-stroke-width'], '0.72');
  assert.equal(theme.tokens['--sn-shape-port-hint-stroke-width'], '0.90');
  assert.equal(noOutlineTheme.tokens['--sn-shape-stroke-width'], '0.00');
  assert.equal(noOutlineTheme.tokens['--sn-shape-port-hint-stroke-width'], '0.00');
  assert.equal(fullOutlineTheme.tokens['--sn-shape-stroke-width'], '1.90');
  assert.equal(fullOutlineTheme.tokens['--sn-shape-port-hint-stroke-width'], '2.38');
  assert.equal(theme.tokens['--sn-node-label-size'], 'calc(13px * var(--sn-theme-type-scale) * var(--sn-theme-heading-scale))');
  assert.equal(theme.tokens['--sn-markdown-h1-size'], 'calc(24px * var(--sn-theme-type-scale) * var(--sn-theme-heading-scale))');
  assert.equal(theme.tokens['--sn-chat-markdown-h2-size'], 'calc(18px * var(--sn-theme-type-scale) * var(--sn-theme-heading-scale))');
  assert.equal(theme.tokens['--sn-chat-message-font-size'], 'calc(13px * var(--sn-theme-type-scale))');
  assert.equal(theme.tokens['--sn-composer-input-size'], 'calc(13px * var(--sn-theme-type-scale))');
  assert.equal(theme.tokens['--sn-composer-input-min-inline-size'], 'calc(160px * var(--sn-theme-density))');
  assert.equal(theme.tokens['--sn-composer-input-padding'], 'calc(4px * var(--sn-theme-density)) max(0px, calc(var(--sn-composer-radius) * 0.45))');
  assert.equal(theme.tokens['--sn-code-font-size'], 'calc(12px * var(--sn-theme-type-scale))');
  assert.equal(theme.tokens['--sn-composer-send-size'], 'calc(32px * var(--sn-theme-density))');
  assert.equal(theme.tokens['--sn-grid-size'], '20px');
  assert.equal(theme.tokens['--sn-cell-size'], 'calc(14px * var(--sn-theme-density))');
  assert.equal(theme.tokens['--sn-cell-min-radius'], 'calc(2px * var(--sn-theme-cell-radius-scale, 1))');
  assert.equal(theme.tokens['--sn-cell-max-radius'], 'calc(5px * var(--sn-theme-cell-radius-scale, 1))');
  assert.equal(theme.tokens['--sn-tabs-item-font-size'], 'calc(12px * var(--sn-theme-type-scale))');
  assert.equal(theme.tokens['--sn-tabs-icon-size'], 'calc(15px * var(--sn-theme-type-scale))');
  assert.equal(theme.tokens['--sn-data-table-cell-size'], 'calc(12px * var(--sn-theme-type-scale))');
  assert.equal(theme.tokens['--sn-empty-state-icon-size'], 'calc(32px * var(--sn-theme-type-scale))');
  assert.equal(theme.tokens['--sn-event-feed-font-size'], 'calc(12px * var(--sn-theme-type-scale))');
  assert.equal(theme.tokens['--sn-graph-explorer-button-size'], 'calc(10px * var(--sn-theme-type-scale))');
  assert.equal(theme.tokens['--sn-source-header-size'], 'calc(11px * var(--sn-theme-type-scale))');
  assert.equal(theme.tokens['--sn-status-ribbon-icon-size'], 'calc(16px * var(--sn-theme-type-scale))');
  assert.equal(theme.tokens['--sn-data-table-cell-padding'], 'calc(6px * var(--sn-theme-density)) calc(10px * var(--sn-theme-density))');
  assert.equal(theme.tokens['--sn-list-detail-sidebar-width'], 'calc(180px * var(--sn-theme-density))');
  assert.equal(theme.tokens['--sn-graph-explorer-button-min-height'], 'calc(28px * var(--sn-theme-density))');
  assert.equal(theme.tokens['--sn-scrollbar-width'], 'thin');
  assert.equal(theme.tokens['--sn-scrollbar-size'], '10px');
  assert.equal(theme.tokens['--sn-scrollbar-radius'], '999px');
  assert.equal(theme.tokens['--sn-scrollbar-thumb-border'], '3px solid transparent');
  assert.equal(theme.tokens['--sn-scrollbar-thumb-min-size'], '36px');
  assert.equal(theme.tokens['--sn-scroll-shadow-size'], '14.0px');
  let tokenTargets = flattenTokenTargets(theme.descriptor.tokenTargets);
  let missingTargets = Object.keys(theme.tokens).filter((token) => !tokenTargets.has(token));
  assert.deepEqual(missingTargets, []);
  assert.match(source, /CASCADE_THEME_DESCRIPTOR/);
  assert.match(source, /svgStrokeToken/);
  assert.match(source, /headingToken/);
  assert.match(source, /hueRotate/);
  assert.match(source, /getReadableTextForHsl/);
  for (let exportedName of [
    'serializeCascadeThemeBundle',
    'applyCascadeThemeBundle',
    'isCascadeThemeBundle',
    'resetCascadeThemeScopes',
    'readCascadeThemeScopeState',
    'persistCascadeThemeScopeState',
    'persistCascadeThemeScopeRegister',
    'seedCascadeThemeScopeState',
    'removeCascadeThemeScopeState',
    'resolveCascadeThemeScopeTarget',
    'applyCascadeThemeScope',
    'applyCascadeThemeScopes',
    'clearCascadeGeometryRegister',
    'applyCascadeGeometryRegister',
    'normalizeCascadeGeometryRegister',
  ]) {
    assert.ok(theme.descriptor.exports.includes(exportedName), `${exportedName} missing`);
  }
  assert.match(source, /symbiote-ui\.createCascadeTheme/);
  assert.match(source, /theme:compose/);
  assert.match(source, /--sn-shape-stroke/);
  assert.match(source, /--sn-sys-surface/);
  assert.match(source, /--sn-sys-on-surface-dim/);
  assert.match(source, /--sn-field-control-bg/);
  assert.match(source, /--sn-chat-user-message-bg/);
  assert.match(source, /--sn-composer-bg/);
  assert.match(source, /--sn-syntax-keyword/);
  assert.match(source, /--sn-cell-dot/);
  assert.match(source, /--sn-cell-size/);
  assert.match(source, /--sn-chat-message-font-size/);
  assert.match(source, /--sn-composer-input-size/);
  assert.match(source, /--sn-code-font-size/);
  assert.match(source, /--sn-layout-header-icon-size/);
  assert.match(source, /--sn-layout-menu-action-size/);
  assert.match(source, /--sn-layout-overflow-inline-size/);
  assert.match(source, /--sn-layout-scroll-inline-extra/);
  assert.match(source, /--sn-layout-responsive-panel-min-block-size/);
  assert.match(source, /--sn-node-summary-size/);
  assert.match(source, /--sn-node-pill-body-padding/);
  assert.match(source, /--sn-node-circle-body-padding/);
  assert.match(source, /--sn-control-input-size/);
  assert.match(source, /--sn-panel-menu-icon-size/);
  assert.match(source, /--sn-shape-icon-size/);
});

test('applyCascadeTheme notifies subtree targets by default', async () => {
  const themeModule = await import(cascadeThemeSource.href);
  const NativeCustomEvent = globalThis.CustomEvent;
  const events = [];
  const styles = new Map();
  const target = new EventTarget();
  target.style = {
    setProperty(name, value) {
      styles.set(name, value);
    },
  };
  target.addEventListener('cascade-theme-change', (event) => events.push(event));

  globalThis.CustomEvent = class CustomEvent extends Event {
    constructor(type, init = {}) {
      super(type, init);
      this.detail = init.detail;
    }
  };
  try {
    const theme = themeModule.applyCascadeTheme(target, { mode: 'light' }, {
      source: 'unit-test',
      targetSelector: '#panel',
    });
    themeModule.applyCascadeTheme(target, { mode: 'dark' }, { notify: false });

    assert.equal(styles.get('--sn-sys-surface'), 'hsl(0 0% 10.0%)');
    assert.equal(events.length, 1);
    assert.equal(events[0].type, 'cascade-theme-change');
    assert.equal(events[0].bubbles, true);
    assert.equal(events[0].composed, true);
    assert.equal(events[0].detail.source, 'unit-test');
    assert.equal(events[0].detail.targetSelector, '#panel');
    assert.equal(events[0].detail.theme.name, 'cascade-theme');
    assert.equal(events[0].detail.state.mode, 'light');
    assert.equal(theme.state.mode, 'light');
  } finally {
    if (NativeCustomEvent) {
      globalThis.CustomEvent = NativeCustomEvent;
    } else {
      delete globalThis.CustomEvent;
    }
  }
});

test('applyCascadeTheme emits selected state layer tokens for component selection', async () => {
  const { applyCascadeTheme } = await import(cascadeThemeSource.href);
  let target = { style: createStyleStub() };

  applyCascadeTheme(target, { mode: 'dark' }, { notify: false });

  assert.equal(target.style.getPropertyValue('--sn-sys-state-hover-mix'), '18%');
  assert.equal(target.style.getPropertyValue('--sn-sys-state-selected-mix'), '26%');
  assert.equal(
    target.style.getPropertyValue('--sn-tree-row-selected-bg'),
    'color-mix(in oklch, var(--sn-sys-accent) var(--sn-sys-state-selected-mix), var(--sn-sys-surface-panel))'
  );
});

test('canvas graph refreshes cached flat renderer colors from cascade theme changes', async () => {
  const [source, graphThemeContract, registrySource, customElements] = await Promise.all([
    readFile(canvasGraphSource, 'utf8'),
    readFile(graphThemeContractSource, 'utf8'),
    readFile(componentRegistrySource, 'utf8'),
    readFile(customElementsSource, 'utf8').then((value) => JSON.parse(value)),
  ]);

  assert.match(source, /ownerDocument\?\.addEventListener\?\.\('cascade-theme-change', this\._themeChangeHandler\)/);
  assert.match(source, /new MutationObserver\(\(\) => this\._scheduleCanvasThemeSync\(\)\)/);
  assert.match(source, /this\._themeObserver\.observe\(source, \{ attributes: true, attributeFilter: \['class', 'style'\] \}\)/);
  assert.match(source, /this\.syncCanvasTheme\(\);\n\s+this\.needsDraw = true;\n\s+this\._wakeLoop\(\);/);
  assert.match(source, /this\._edgeRgb = readThemeRgbAny\(this, \['--sn-canvas-graph-edge', '--sn-conn-color', '--sn-sys-accent'\], this\._edgeRgb\)/);
  assert.match(source, /this\._panelBgRgb = readThemeRgbAny\(\s*this,\s*\['--sn-canvas-graph-panel-bg', '--sn-canvas-graph-bg', '--sn-sys-surface'\],\s*this\._bgRgb\s*\)/);
  assert.match(source, /this\._panelBorderRgb = readThemeRgbAny\(this, \['--sn-canvas-graph-panel-border', '--sn-sys-outline'\], this\._panelBorderRgb\)/);
  assert.match(source, /this\._menuIconRgb = readThemeRgbAny\(this, \['--sn-canvas-graph-radial-icon', '--sn-sys-surface-panel'\], this\._menuIconRgb\)/);
  assert.match(source, /this\._ghostRgb = readThemeRgbAny\(this, \['--sn-canvas-graph-ghost', '--sn-sys-on-surface-dim'\], this\._ghostRgb\)/);
  assert.match(source, /this\._typeColorRgb\[type\] = readThemeRgb\(this, token, this\._typeColorRgb\[type\] \|\| this\._edgeRgb\)/);
  assert.doesNotMatch(source, /let boost = 25/);
  assert.match(source, /currentCtx\.globalAlpha \*= edge\.aAlpha/);
  assert.match(graphThemeContract, /'profile-photo': '--sn-graph-type-profile-photo'/);
  assert.match(graphThemeContract, /pulse: '--sn-graph-type-pulse'/);
  assert.match(graphThemeContract, /skill: '--sn-graph-type-skill'/);
  assert.match(registrySource, /'--sn-canvas-graph-panel-bg'/);
  assert.match(registrySource, /'--sn-graph-type-project'/);

  let canvasGraph = customElements.modules
    .flatMap((moduleRecord) => moduleRecord.declarations || [])
    .find((declaration) => declaration.tagName === 'canvas-graph');
  assert.ok(canvasGraph.cssProperties.some((property) => property.name === '--sn-canvas-graph-panel-bg'));
  assert.ok(canvasGraph.metadata.contract.themeAliases.includes('--sn-canvas-graph-ghost'));
});

test('node graph focus zoom and connectors settle after DOM size changes', async () => {
  const [canvasGraph, nodeCanvas, nodeViewManager] = await Promise.all([
    readFile(canvasGraphSource, 'utf8'),
    readFile(nodeCanvasSource, 'utf8'),
    readFile(nodeViewManagerSource, 'utf8'),
  ]);

  assert.match(canvasGraph, /DEFAULT_CANVAS_GRAPH_FOCUS_ZOOM = 1\.6/);
  assert.match(canvasGraph, /MAX_CANVAS_GRAPH_FOCUS_ZOOM = 2\.4/);
  assert.match(canvasGraph, /this\.flyToNode\(nodeId, \{ zoom: DEFAULT_CANVAS_GRAPH_FOCUS_ZOOM \}\)/);
  assert.match(nodeCanvas, /_nodeResizeObserver = null/);
  assert.match(nodeCanvas, /new ResizeObserver\(\(entries\) => this\._handleNodeResizeEntries\(entries\)\)/);
  assert.match(nodeCanvas, /this\._scheduleConnectionUpdate\(nodeId\)/);
  assert.match(nodeCanvas, /this\._scheduleConnectionSettleRefresh\(2\)/);
  assert.match(nodeViewManager, /#onNodeViewReady/);
  assert.match(nodeViewManager, /#onNodeViewRemoved/);
  assert.match(nodeViewManager, /this\.#onNodeViewReady\?\.\(node\.id, el\)/);
  assert.match(nodeViewManager, /this\.#onNodeViewRemoved\?\.\(nodeId, el\)/);
});

test('node type color tokens are canonical across themes and graph aliases', async () => {
  const [cascadeSource, defaultProviderTheme] = await Promise.all([
    readFile(cascadeThemeSource, 'utf8'),
    import(defaultProviderThemeSource.href),
  ]);
  const themeModule = await import(cascadeThemeSource.href);
  const theme = themeModule.createCascadeTheme();

  assert.match(cascadeSource, /'--sn-type-action': typeAction/);
  assert.match(cascadeSource, /'--sn-graph-type-action': 'var\(--sn-type-action\)'/);
  assert.match(cascadeSource, /'--sn-graph-type-project': 'var\(--sn-type-project\)'/);
  assert.match(cascadeSource, /'--sn-canvas-graph-panel-bg': 'var\(--sn-canvas-graph-bg\)'/);
  assert.match(cascadeSource, /'--sn-type-source': 'var\(--sn-cat-server\)'/);
  assert.equal(theme.tokens['--sn-type-output'].startsWith('hsl('), true);
  assert.equal(theme.tokens['--sn-type-config'].startsWith('hsl('), true);
  assert.equal(theme.tokens['--sn-graph-type-output'], 'var(--sn-type-output)');
  assert.equal(theme.tokens['--sn-graph-type-profile-photo'], 'var(--sn-type-profile-photo)');
  assert.equal(theme.tokens['--sn-graph-type-bio'], 'var(--sn-type-bio)');
  assert.equal(theme.tokens['--sn-graph-type-pulse'], 'var(--sn-type-pulse)');
  assert.equal(theme.tokens['--sn-conn-color'], 'var(--sn-sys-accent)');
  assert.equal(theme.tokens['--sn-conn-selected'], 'var(--sn-sys-danger)');
  assert.equal(theme.tokens['--sn-conn-dot-fill'], 'var(--sn-conn-color)');
  assert.equal(theme.tokens['--sn-canvas-graph-panel-bg'], 'var(--sn-canvas-graph-bg)');
  assert.equal(theme.tokens['--sn-canvas-graph-edge'], 'var(--sn-conn-color)');
  assert.equal(theme.tokens['--sn-toolbar-bg'], 'color-mix(in oklab, var(--sn-sys-surface-panel) 94%, transparent)');
  assert.equal(theme.tokens['--sn-toolbar-border'], theme.tokens['--sn-outline-color']);
  assert.equal(theme.tokens['--sn-toolbar-color'], 'var(--sn-sys-on-surface-dim)');
  assert.equal(theme.tokens['--sn-toolbar-active'], 'var(--sn-sys-on-surface)');
  assert.equal(theme.tokens['--sn-toolbar-danger-color'], 'var(--sn-sys-danger)');
  assert.equal(theme.tokens['--sn-toolbar-title-color'], 'var(--sn-sys-on-surface)');
  assert.equal(defaultProviderTheme.DEFAULT_PROVIDER_THEME.tokens['--sn-graph-type-action'], 'var(--sn-type-action)');
  assert.equal(defaultProviderTheme.DEFAULT_PROVIDER_THEME.tokens['--sn-graph-type-project'], 'var(--sn-type-project)');
  assert.equal(defaultProviderTheme.DEFAULT_PROVIDER_THEME.tokens['--sn-canvas-graph-panel-bg'], 'var(--sn-canvas-graph-bg)');
  assert.equal(defaultProviderTheme.DEFAULT_PROVIDER_THEME.tokens['--sn-canvas-graph-ghost'], 'var(--sn-sys-on-surface-dim)');
  assert.equal(defaultProviderTheme.DEFAULT_PROVIDER_THEME.tokens['--sn-type-action'], 'hsl(var(--sn-hue-danger) var(--sn-sat-vivid) 82.0%)');
  assert.equal(defaultProviderTheme.DEFAULT_PROVIDER_THEME.tokens['--sn-type-source'], 'var(--sn-cat-server)');
  assert.equal(defaultProviderTheme.DEFAULT_PROVIDER_THEME.tokens['--sn-type-profile-photo'], 'var(--sn-type-profile)');
  assert.equal(defaultProviderTheme.DEFAULT_PROVIDER_THEME.tokens['--sn-type-skill'], 'var(--sn-cat-control)');
});

test('svg shape nodes keep visual icons without internal labels or watermarks', async () => {
  const [graphNode, nodeViewManager] = await Promise.all([
    readFile(graphNodeStyles, 'utf8'),
    readFile(nodeViewManagerSource, 'utf8'),
  ]);

  assert.match(graphNode, /& \.sn-node-header,\n      & \.sn-node-body \{\n        display: none;/);
  assert.match(graphNode, /& \.sn-node-shape-icon \{/);
  assert.match(graphNode, /font-size: var\(--sn-shape-icon-size, 40px\)/);
  assert.match(graphNode, /& \.sn-node-shape-icon \{\n          display: none;/);
  assert.doesNotMatch(graphNode, /sn-shape-watermark/);
  assert.doesNotMatch(graphNode, /--sn-shape-watermark-size/);
  assert.match(nodeViewManager, /sn-node-shape-icon material-symbols-outlined/);
  assert.doesNotMatch(nodeViewManager, /sn-shape-watermark/);
  assert.doesNotMatch(nodeViewManager, /ensureMaterialSymbols\(\[iconEl\.textContent\]\)/);
});

test('cascade theme editor is a reusable browser module', async () => {
  const [editor, widget, editorTemplate, widgetTemplate, sharedTemplate, widgetStyles, styles, uiIndex, registry, customElements, layoutNode, cascadeGuide, cascadeTheme] = await Promise.all([
    readFile(cascadeThemeEditorSource, 'utf8'),
    readFile(cascadeThemeWidgetSource, 'utf8'),
    readFile(new URL('../themes/CascadeThemeEditor/CascadeThemeEditor.tpl.js', import.meta.url), 'utf8'),
    readFile(new URL('../themes/CascadeThemeWidget/CascadeThemeWidget.tpl.js', import.meta.url), 'utf8'),
    readFile(new URL('../themes/CascadeThemeControls.tpl.js', import.meta.url), 'utf8'),
    readFile(new URL('../themes/CascadeThemeWidget/CascadeThemeWidget.css.js', import.meta.url), 'utf8'),
    readFile(new URL('../themes/CascadeThemeEditor/CascadeThemeEditor.css.js', import.meta.url), 'utf8'),
    readFile(uiIndexSource, 'utf8'),
    readFile(componentRegistrySource, 'utf8'),
    readFile(customElementsSource, 'utf8'),
    readFile(layoutNodeSource, 'utf8'),
    readFile(cascadeThemeGuideSource, 'utf8'),
    readFile(cascadeThemeSource, 'utf8'),
  ]);

  assert.match(editor, /class CascadeThemeEditor extends Symbiote/);
  assert.match(editor, /applyCascadeTheme\(this\.\#resolveTarget\(\), this\.\#state, \{ notify: false \}\)/);
  assert.match(editor, /CASCADE_THEME_DEFAULTS/);
  assert.match(editor, /getCascadeThemeControls\(\)/);
  assert.match(editor, /CONTROL_ICONS/);
  assert.match(editor, /control\.icon/);
  assert.match(editor, /controlsList/);
  assert.match(editor, /readCascadeThemeScopeState/);
  assert.match(editor, /persistCascadeThemeScopeState/);
  assert.match(editor, /persistCascadeThemeScopeRegister/);
  assert.match(editor, /removeCascadeThemeScopeState/);
  assert.match(editor, /clearCascadeThemeInlineTokens/);
  assert.match(editor, /clearCascadeGeometryRegister/);
  assert.match(editor, /this\.\#geometryRegister = applyCascadeGeometryRegister\(target, this\.\#geometryRegister\);[\s\S]*if \(!this\.\#geometryRegister\) \{[\s\S]*applyCascadeTheme\(target, this\.\#state, \{ notify: false \}\)/);
  assert.match(editor, /copyParameters\(\)/);
  assert.match(editor, /reset\(\)/);
  assert.match(editor, /removeTarget\(id, options = \{\}\)/);
  assert.match(editor, /cascade-theme-target-remove/);
  assert.match(editor, /removeHidden: !this\.\#isRemovableTarget\(entry\)/);
  assert.doesNotMatch(editor, /removeHidden: String\(!this\.\#isRemovableTarget\(entry\)\)/);
  assert.match(editor, /#dispatchTargetRemove\(target, 'reset'\)/);
  assert.match(editor, /isNamedScope: \(target\) => this\.\#isRemovableTarget\(target\)/);
  assert.match(editor, /applyToAllTargets\(/);
  assert.match(editor, /resetCascadeThemeScopes\(scopes, \{/);
  assert.match(editor, /normalizeLocale/);
  assert.match(editor, /cascade-theme-locale-change/);
  assert.match(editor, /cascade-theme-apply-all/);
  assert.match(editor, /#seedPickedTarget\(/);
  assert.match(cascadeTheme, /if \(options\.clearStorage === true && storage\) \{[\s\S]*storage\.clear\(\);/);
  assert.match(editor, /rangeProgress/);
  assert.match(editor, /--cte-range-progress/);
  assert.match(editor, /#queueControlDomSync\(\)/);
  assert.match(editor, /#syncControlDom\(\)/);
  assert.match(editor, /#bindControlEvents\(\)/);
  assert.match(editor, /addEventListener\?\.\('input', this\.\#controlInputHandler\)/);
  assert.match(editor, /event\.__cascadeThemeHandled = true/);
  assert.match(editor, /input\.value = text/);
  assert.match(editor, /output\.textContent = text/);
  assert.match(editor, /new CustomEvent\('cascade-theme-change'/);
  assert.match(editor, /CascadeThemeEditor\.reg\('cascade-theme-editor'\)/);
  // reactive scope/window picker: itemize-driven targets list built on the existing
  // target-selector + storage-key capability (selecting one re-points the editor)
  assert.match(sharedTemplate, /export function cascadeThemeTargetControls/);
  assert.match(sharedTemplate, /export function cascadeThemeLocaleControls/);
  assert.match(sharedTemplate, /itemize="targets"/);
  assert.match(sharedTemplate, /data-target-id/);
  assert.match(sharedTemplate, /targetItemClassName/);
  assert.match(sharedTemplate, /includeRemove/);
  assert.match(sharedTemplate, /onTargetRemove/);
  assert.match(sharedTemplate, /removeLabel/);
  assert.match(sharedTemplate, />delete<\/span>/);
  assert.match(sharedTemplate, /data-locale="en"/);
  assert.match(sharedTemplate, /data-locale="ru"/);
  assert.match(sharedTemplate, /data-locale="es"/);
  assert.match(sharedTemplate, /select_all/);
  assert.match(editorTemplate, /cascadeThemeTargetControls\(\{/);
  assert.match(editorTemplate, /className: 'cte-targets'/);
  assert.match(editorTemplate, /includePick: true/);
  assert.match(editorTemplate, /includeApplyAll: true/);
  assert.match(editorTemplate, /includeRemove: true/);
  assert.match(editorTemplate, /targetItemClassName: 'cte-target-item'/);
  assert.match(editorTemplate, /removeClassName: 'cte-target-remove'/);
  assert.match(editorTemplate, /cascadeThemeLocaleControls\(\{/);
  assert.match(editorTemplate, /cascadeThemeRegisterControls\(\{/);
  assert.match(styles, /\.cte-target-item/);
  assert.match(styles, /\.cte-target-remove/);
  assert.match(styles, /\.cte-target-remove\[hidden\]/);
  assert.match(editor, /set targets\(/);
  assert.match(editor, /#pickTarget\(/);
  assert.match(editor, /cascade-theme-target-change/);
  assert.match(widget, /class CascadeThemeWidget extends Symbiote/);
  assert.match(widget, /COMPACT_CONTROLS = \['brightness', 'contrast', 'chroma', 'hue', 'pattern'\]/);
  assert.match(widget, /syncOverlayTheme/);
  assert.match(widget, /let target = this\.\#resolveTarget\(\)/);
  assert.match(widget, /applyCascadeTheme\(target, this\.\#state, \{ notify: false \}\)/);
  assert.match(widget, /this\.\#syncPopoverTheme\(target\)/);
  assert.match(widget, /this\.\#geometryRegister = applyCascadeGeometryRegister\(target, this\.\#geometryRegister\);[\s\S]*if \(!this\.\#geometryRegister\) \{[\s\S]*applyCascadeTheme\(target, this\.\#state, \{ notify: false \}\)/);
  assert.match(widget, /controlsList/);
  assert.match(widget, /#queueControlDomSync\(\)/);
  assert.match(widget, /#syncControlDom\(\)/);
  assert.match(widget, /#bindControlEvents\(\)/);
  assert.match(widget, /addEventListener\?\.\('input', this\.\#controlInputHandler\)/);
  assert.match(widget, /event\.__cascadeThemeHandled = true/);
  assert.match(widget, /this\.ref\.popover \|\| this/);
  assert.match(widget, /input\.value = text/);
  assert.match(widget, /output\.textContent = text/);
  assert.match(widget, /modeDarkActive/);
  assert.match(widget, /onControlInput/);
  assert.match(widget, /onModePick/);
  assert.match(widget, /onTargetPick/);
  assert.match(widget, /#pickScope\(id\)/);
  assert.match(widget, /#renderTargets\(\)/);
  assert.match(widget, /resetCascadeThemeScopes\(scopes, \{/);
  assert.match(widget, /this\.\#syncRegisterButtons\(\);/);
  assert.match(widget, /cascade-theme-open-full/);
  assert.match(widget, /mountOverlayToDocument\(popover, this\.\#resolveOverlayThemeTarget\(this\.\#resolveTarget\(\)\)\)/);
  assert.match(widget, /bringOverlayToFront\(popover\)/);
  assert.match(widget, /restoreOverlayHome\(popover\)/);
  assert.match(widget, /positionOverlay\(trigger, popover, 'bottom-end'/);
  assert.match(widget, /#eventTargetsWidget\(event\)/);
  assert.match(widget, /CascadeThemeWidget\.reg\('cascade-theme-widget'\)/);
  assert.match(widgetTemplate, /ref="trigger"/);
  assert.match(widgetTemplate, /ref="popover"/);
  assert.match(widgetTemplate, /cascadeThemeTargetControls\(\{/);
  assert.match(widgetTemplate, /className: 'ctw-targets'/);
  assert.match(widgetStyles, /cascade-theme-widget/);
  assert.match(widgetStyles, /cascade-theme-widget \.ctw-trigger \{/);
  assert.match(widgetStyles, /min-height: var\(--sn-shell-menu-action-height/);
  assert.match(widgetStyles, /border: 1px solid transparent/);
  assert.match(widgetStyles, /border-radius: var\(--sn-layout-header-button-radius/);
  assert.match(widgetStyles, /background: transparent/);
  assert.match(widgetStyles, /color: var\(--sn-sys-on-surface-dim\)/);
  assert.match(widgetStyles, /font: inherit/);
  assert.match(widgetStyles, /font-size: var\(--sn-shell-menu-action-size/);
  assert.match(widgetStyles, /cascade-theme-widget \.ctw-trigger:hover/);
  assert.match(widgetStyles, /background: color-mix\(in oklch, var\(--sn-sys-accent\) var\(--sn-sys-state-hover-mix\), transparent\)/);
  assert.match(widgetStyles, /cascade-theme-widget \.ctw-targets/);
  assert.match(widgetStyles, /\.ctw-popover\[data-overlay-portal\] \.ctw-targets/);
  assert.match(widgetStyles, /cascade-theme-widget \.ctw-target\[aria-pressed="true"\]/);
  assert.match(widgetStyles, /\.ctw-popover\[data-overlay-portal\]/);
  assert.match(widgetStyles, /--sn-overlay-z-base, 20000/);
  assert.doesNotMatch(widgetStyles, /--sn-ctw-z, 80/);
  assert.match(widgetStyles, /--sn-ctw-width/);
  assert.match(widgetStyles, /@media \(max-width: 820px\) \{[\s\S]*?\.ctw-popover\[data-overlay-portal\] \{[\s\S]*?position: fixed;/);
  assert.match(widgetStyles, /right: max\(var\(--sn-ctw-mobile-inset, 8px\), env\(safe-area-inset-right\)\);/);
  assert.match(widgetStyles, /left: max\(var\(--sn-ctw-mobile-inset, 8px\), env\(safe-area-inset-left\)\);/);
  assert.match(widgetStyles, /max-height: calc\([\s\S]*?100dvh[\s\S]*?env\(safe-area-inset-bottom\)[\s\S]*?\);/);
  assert.match(widgetStyles, /overflow: auto;/);
  assert.match(styles, /cascade-theme-editor/);
  assert.match(styles, /--sn-scrollbar-thumb/);
  assert.match(styles, /input\[type="range"\]/);
  assert.match(styles, /appearance: none/);
  assert.match(styles, /--sn-theme-outline-strength/);
  assert.match(styles, /cte-control-icon/);
  assert.match(styles, /--sn-theme-editor-control-icon-size/);
  assert.match(styles, /::-webkit-slider-thumb/);
  assert.match(styles, /\.cte-shell \{[\s\S]*?display: flex;[\s\S]*?flex-direction: column;[\s\S]*?min-height: 100%;/);
  assert.match(styles, /\.cte-controls \{[\s\S]*?flex: 0 0 auto;/);
  assert.match(styles, /\.cte-targets \{[\s\S]*?position: sticky;/);
  assert.match(styles, /\.cte-register \{[\s\S]*?repeat\(4, minmax\(0, 1fr\)\)/);
  assert.match(styles, /\.cte-apply-all/);
  assert.match(styles, /\.cte-target \{/);
  assert.match(styles, /container: cascade-theme-editor \/ inline-size/);
  assert.match(styles, /@container cascade-theme-editor \(max-width: 360px\) \{[\s\S]*?\.cte-status \{[\s\S]*?display: none;/);
  assert.match(styles, /@container cascade-theme-editor \(max-width: 360px\) \{[\s\S]*?\.cte-control \{[\s\S]*?grid-template-columns: minmax\(0, 1fr\) minmax\(92px, 1fr\) minmax\(28px, auto\);/);
  assert.match(uiIndex, /CascadeThemeEditor/);
  assert.match(uiIndex, /CascadeThemeWidget/);
  assert.match(uiIndex, /themes\/CascadeThemeEditor\/CascadeThemeEditor\.js/);
  assert.match(uiIndex, /themes\/CascadeThemeWidget\/CascadeThemeWidget\.js/);
  assert.match(registry, /tagName: 'cascade-theme-editor'/);
  assert.match(registry, /tagName: 'cascade-theme-widget'/);
  assert.match(registry, /componentDescription/);
  assert.match(registry, /WEBMCP_SUPPORT_REFERENCE/);
  assert.match(registry, /cascade_theme_editor_apply/);
  assert.match(registry, /cascade-geometry-register-change/);
  assert.match(registry, /cascade-theme-target-change/);
  assert.match(registry, /cascade-theme-locale-change/);
  assert.match(registry, /cascade-theme-apply-all/);
  assert.match(registry, /cascade_theme_widget_open_full/);
  assert.match(registry, /cascade_theme_widget_apply_quick/);
  assert.match(registry, /pattern: \{ type: 'number', minimum: 0, maximum: 100 \}/);
  assert.match(registry, /tabRadius: \{ type: 'number', minimum: 0, maximum: 100 \}/);
  assert.match(registry, /composerRadius: \{ type: 'number', minimum: 0, maximum: 100 \}/);
  assert.match(registry, /reset removes cascade-owned storage keys after applying defaults/);
  assert.match(registry, /panel_layout_open_panel/);
  assert.match(registry, /panel_layout_close_ui_panel/);
  assert.match(registry, /ui-invoked-panels/);
  assert.match(customElements, /"tagName": "cascade-theme-editor"/);
  assert.match(customElements, /"tagName": "cascade-theme-widget"/);
  assert.match(customElements, /"tabRadius": \{\s*"type": "number",\s*"minimum": 0,\s*"maximum": 100\s*\}/);
  assert.match(customElements, /"composerRadius": \{\s*"type": "number",\s*"minimum": 0,\s*"maximum": 100\s*\}/);
  assert.match(customElements, /"scrollShadow": \{\s*"type": "number",\s*"minimum": 0,\s*"maximum": 48\s*\}/);
  assert.match(customElements, /"name": "cascade-geometry-register-change"/);
  assert.match(customElements, /"name": "cascade-theme-target-change"/);
  assert.match(customElements, /"name": "cascade-theme-locale-change"/);
  assert.match(customElements, /"name": "cascade-theme-apply-all"/);
  assert.match(customElements, /Restores cascade theme defaults and removes cascade-owned storage keys/);
  assert.match(customElements, /"pattern": \{\s*"type": "number",\s*"minimum": 0,\s*"maximum": 100\s*\}/);
  assert.match(customElements, /"componentDescription"/);
  assert.match(cascadeGuide, /removing only cascade-owned\s+`localStorage` keys/);
  assert.match(layoutNode, /_applyPanelComponentConfig/);
  assert.match(layoutNode, /config\.attributes/);
  assert.match(layoutNode, /config\.properties/);
});

test('cascade theme reset only removes cascade-owned storage keys by default', async () => {
  let { resetCascadeThemeScopes } = await import(cascadeThemeSource.href);
  let storage = createMemoryStorage([
    ['theme:main', JSON.stringify({ hue: 44 })],
    ['theme:main::geometry-register', 'tool'],
    ['theme:main::win::Inspector', JSON.stringify({ hue: 220 })],
    ['theme:main::win::Inspector::geometry-register', 'spacious'],
    ['voice-settings', JSON.stringify({ enabled: true })],
  ]);
  let root = { style: createStyleStub(), dataset: {} };

  resetCascadeThemeScopes(
    [{ id: 'main', storageKey: 'theme:main', defaultState: { hue: 205 } }],
    {
      storage,
      resolveScopeTarget: () => root,
      document: {
        querySelectorAll: () => [{
          style: root.style,
          dataset: { themeKey: 'theme:main::win::Inspector' },
        }],
      },
    }
  );

  assert.equal(storage.calls.some(([method]) => method === 'clear'), false);
  assert.deepEqual(storage.entries(), [['voice-settings', JSON.stringify({ enabled: true })]]);
});

test('cascade theme scope helpers persist, restore, and apply geometry registers', async () => {
  let {
    applyCascadeGeometryRegister,
    applyCascadeTheme,
    applyCascadeThemeBundle,
    applyCascadeThemeScope,
    clearCascadeGeometryRegister,
    normalizeCascadeGeometryRegister,
    persistCascadeThemeScopeRegister,
    persistCascadeThemeScopeState,
    readCascadeThemeScopeState,
    seedCascadeThemeScopeState,
  } = await import(cascadeThemeSource.href);
  let storage = createMemoryStorage();
  let scope = {
    id: 'main',
    selector: '#main',
    storageKey: 'theme:main',
    defaultState: { hue: 42, register: 'tool' },
  };
  let target = { style: createStyleStub(), dataset: {} };

  let seeded = seedCascadeThemeScopeState(scope, { storage });
  assert.equal(seeded.hue, 42);
  assert.equal(seeded.register, 'tool');
  assert.equal(JSON.parse(storage.getItem('theme:main')).hue, 42);
  assert.equal(storage.getItem('theme:main::geometry-register'), 'tool');

  let applied = applyCascadeThemeScope(scope, { storage, target, source: 'test' });
  assert.equal(applied.register, 'tool');
  assert.equal(target.style.getPropertyValue('--sn-theme-density'), '0.75');

  persistCascadeThemeScopeState(scope, { hue: 88, register: 'spacious' }, { storage });
  let restored = readCascadeThemeScopeState(scope, { storage });
  assert.equal(restored.hue, 88);
  assert.equal(restored.register, 'spacious');
  assert.equal(storage.getItem('theme:main::geometry-register'), 'spacious');

  persistCascadeThemeScopeRegister(scope, 'default', { storage });
  assert.equal(readCascadeThemeScopeState(scope, { storage }).register, '');
  assert.equal(normalizeCascadeGeometryRegister('default'), '');

  applyCascadeGeometryRegister(target, 'product');
  assert.equal(target.style.getPropertyValue('--sn-theme-density'), '1');
  clearCascadeGeometryRegister(target);
  assert.equal(target.style.getPropertyValue('--sn-theme-density'), '');

  applyCascadeThemeBundle(
    { version: 1, scopes: { main: { hue: 120, register: 'spacious' } }, named: {} },
    [scope],
    {
      storage,
      resolveScopeTarget: () => target,
      applyState: (element, state) => applyCascadeTheme(element, state, { notify: false }),
    }
  );
  assert.equal(storage.getItem('theme:main::geometry-register'), 'spacious');
  assert.equal(target.style.getPropertyValue('--sn-theme-density'), '1.25');
});

test('cascade theme normalizes invalid numeric params without NaN tokens', async () => {
  let themeModule = await import(cascadeThemeSource.href);
  let theme = themeModule.createCascadeTheme({
    hue: 'blue',
    chroma: 'bad',
    density: 'wide',
    contrast: 'max',
    bgLightness: 'none',
  });
  let serializedTokens = JSON.stringify(theme.tokens);

  assert.equal(theme.state.hue, themeModule.CASCADE_THEME_DEFAULTS.hue);
  assert.equal(theme.state.chroma, themeModule.CASCADE_THEME_DEFAULTS.chroma);
  assert.equal(theme.state.density, themeModule.CASCADE_THEME_DEFAULTS.density);
  assert.equal(theme.state.contrast, themeModule.CASCADE_THEME_DEFAULTS.contrast);
  assert.equal(serializedTokens.includes('NaN'), false);
  assert.match(themeModule.getReadableTextForHsl(218, 89, 63), /^hsl\(0 0% (7\.5|98\.0)%\)$/);
});

test('cascade theme keeps quantized editor button contrast above its safety target', async () => {
  let themeModule = await import(cascadeThemeSource.href);
  let theme = themeModule.createCascadeTheme({
    recipe: 'editor-pro',
    params: { contrast: 74, hue: 230 },
  });
  let quantizedForeground = [16, 16, 16];
  let quantizedBackground = [86, 113, 245];
  let luminance = (rgb) => rgb.map((channel) => {
    let value = channel / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  }).reduce((sum, channel, index) => sum + channel * [0.2126, 0.7152, 0.0722][index], 0);
  let foregroundLuminance = luminance(quantizedForeground);
  let backgroundLuminance = luminance(quantizedBackground);
  let contrast = (backgroundLuminance + 0.05) / (foregroundLuminance + 0.05);

  assert.equal(theme.tokens['--sn-sys-accent'], 'hsl(230 89% 64.92%)');
  assert.equal(theme.tokens['--sn-button-primary-color'], 'hsl(0 0% 6.4%)');
  assert.ok(contrast >= 4.55, `expected quantized contrast >= 4.55, got ${contrast}`);
});

test('component descriptor v2 includes agent-facing WebMCP context', async () => {
  const schema = await readFile(componentDescriptorV2Source, 'utf8');

  assert.match(schema, /"componentDescription"/);
  assert.match(schema, /"agentContext"/);
  assert.match(schema, /"webMcpAgentContext"/);
  assert.match(schema, /"globalToolMode"/);
});

test('README follows the public package presentation contract', async () => {
  const readme = await readFile(readmeSource, 'utf8');

  assert.ok(readme.length < 12000, 'README should stay concise and link deep guides');
  assert.match(readme, /^\[!\[npm version\]/);
  assert.match(readme, /\*\*symbiote-ui turns provider metadata into agent-ready Web Components,\s+layouts, themes, and UI contracts\. Fast\.\*\*/);
  assert.match(readme, /## Why symbiote-ui\?/);
  assert.match(readme, /\*\*One catalog for agent-built UI\*\* —/);
  assert.match(readme, /> \*\*Learn more\*\*: \[Agent UI Construction Principles\]/);
  assert.match(readme, /## Documentation/);
  assert.match(readme, /\.\/docs\/runtime-ui-construction\.md/);
  assert.match(readme, /\.\/docs\/cascade-theme\.md/);
  assert.match(readme, /\.\/docs\/layout-and-spatial\.md/);
  assert.match(readme, /\.\/docs\/integration-contracts\.md/);
  assert.match(readme, /project-type top tabs/);
  assert.match(readme, /per-tab sidebar menus/);
  assert.match(readme, /right collapsed page-agent chat layout panel/);
  assert.match(readme, /## License/);
  assert.match(readme, /## Related Projects/);
  assert.match(readme, /Made with ❤️ by the RND-PRO team/);
  assert.doesNotMatch(readme, /## Entry Points/);
  assert.doesNotMatch(readme, /## Spatial Algorithms/);
});

test('documentation guides preserve public agent UI constructor contracts', async () => {
  const entryPointsGuide = await readFile(entryPointsGuideSource, 'utf8');
  const runtimeGuide = await readFile(runtimeUiConstructionGuideSource, 'utf8');
  const cascadeGuide = await readFile(cascadeThemeGuideSource, 'utf8');
  const layoutGuide = await readFile(layoutAndSpatialGuideSource, 'utf8');
  const integrationGuide = await readFile(integrationContractsGuideSource, 'utf8');

  assert.match(entryPointsGuide, /symbiote-ui\/chat\/voice-input-defaults\.js/);
  assert.match(entryPointsGuide, /symbiote-ui\/custom-elements\.json/);
  assert.match(runtimeGuide, /## Agent UI Construction/);
  assert.match(runtimeGuide, /listAgentComponentDescriptions/);
  assert.match(runtimeGuide, /defineModule\('node-canvas'\)/);
  assert.match(runtimeGuide, /defineModule\('graph-node'\)/);
  assert.match(runtimeGuide, /must also register `graph-node`/);
  assert.match(runtimeGuide, /`canvas-graph` is not the primary node\/edge constructor surface/);
  assert.match(runtimeGuide, /read\/overview graph renderer/);
  assert.match(runtimeGuide, /Use `node-canvas` when the agent is actively\s+constructing editable nodes/);
  assert.match(runtimeGuide, /symbiote-ui\/core/);
  assert.match(runtimeGuide, /symbiote-ui\/ui/);
  assert.match(runtimeGuide, /not unexported package file paths/);
  assert.match(runtimeGuide, /layout.openPanel\('chat'/);
  assert.match(runtimeGuide, /defineModule\('cascade-theme-widget'\)/);
  assert.match(runtimeGuide, /defineModule\('cascade-theme-editor'\)/);
  assert.match(runtimeGuide, /cascade-theme-open-full/);
  assert.match(runtimeGuide, /layout\.openPanel\('theme-editor'/);
  assert.match(runtimeGuide, /source: 'cascade-theme-widget'/);
  assert.match(runtimeGuide, /symbiote-ui\/runtime/);
  assert.match(runtimeGuide, /createRuntimeUiController/);
  assert.match(runtimeGuide, /applyRuntimeLayoutAction/);
  assert.match(runtimeGuide, /events: [{]\s*'row-open': 'metrics.open'/);
  assert.ok(runtimeGuide.includes('`destroy()` tears down listeners'));
  assert.match(runtimeGuide, /chat-sidebar-shell/);
  assert.match(runtimeGuide, /chat-composer/);
  assert.match(runtimeGuide, /chat-composer-permission-intent/);
  assert.match(runtimeGuide, /chat-composer-recorder-intent/);
  assert.match(runtimeGuide, /chat-composer-transcription-intent/);
  assert.match(runtimeGuide, /chat-workspace/);
  assert.match(cascadeGuide, /heading: 100/);
  assert.match(cascadeGuide, /motion: 100/);
  assert.match(cascadeGuide, /--sn-theme-heading-scale/);
  assert.match(cascadeGuide, /--sn-motion-enabled/);
  assert.match(cascadeGuide, /data-engine-state="idle"/);
  assert.match(cascadeGuide, /"running"/);
  assert.match(cascadeGuide, /resolveThemePresetsForTask/);
  assert.match(cascadeGuide, /applyThemePresets/);
  assert.match(layoutGuide, /## Spatial Algorithms/);
  assert.match(layoutGuide, /symbiote-ui\/xr\/three-spatial-graph/);
  assert.match(integrationGuide, /component-descriptor-v2/);
  assert.match(integrationGuide, /## JSDA SSR/);
  assert.match(integrationGuide, /## Package Boundary/);
});

test('agent UI principles document construction scenarios and workspace UX rules', async () => {
  const [readme, principles] = await Promise.all([
    readFile(readmeSource, 'utf8'),
    readFile(agentUiPrinciplesSource, 'utf8'),
  ]);

  assert.match(readme, /Agent UI Construction Principles/);
  assert.match(principles, /## Intended Construction Scenarios/);
  assert.match(principles, /## Related Runtime Project/);
  assert.match(principles, /`symbiote-engine` is the related execution project/);
  assert.match(principles, /workflow results/);
  assert.match(principles, /without importing engine\s+internals into reusable browser components/);
  assert.match(principles, /Automation and workflow operations/);
  assert.match(principles, /Agentic software development/);
  assert.match(principles, /Media generation/);
  assert.match(principles, /Video editing/);
  assert.match(principles, /Data analysis and research/);
  assert.match(principles, /Graph and node automation design/);
  assert.match(principles, /Spatial and XR workspaces/);
  assert.match(principles, /Model the task before choosing widgets/);
  assert.match(principles, /Separate source, preview, graph, controls, and status/);
  assert.match(principles, /Component Metadata Requirements/);
});

test('static custom elements catalog mirrors agent-facing WebMCP metadata', async () => {
  const [customElements, registry] = await Promise.all([
    readFile(customElementsSource, 'utf8').then((source) => JSON.parse(source)),
    import(componentRegistrySource.href),
  ]);
  const declarations = new Map(
    customElements.modules
      .flatMap((module) => module.declarations || [])
      .filter((declaration) => declaration.tagName)
      .map((declaration) => [declaration.tagName, declaration])
  );

  for (let component of registry.listComponents()) {
    let declaration = declarations.get(component.tagName);
    assert.ok(declaration, `missing static declaration for ${component.tagName}`);
    assert.equal(declaration.componentDescription, component.componentDescription);
    assert.deepEqual(declaration.agent, component.agent);
    assert.equal(declaration.agent.webmcp.globalToolMode.includes('Do not enable global Symbiote.mcpToolMode'), true);
    assert.equal(declaration.agent.webmcp.references.includes(registry.WEBMCP_SUPPORT_REFERENCE), true);
    assert.equal(declaration.agent.webmcp.references.includes(registry.WEBMCP_FEATURE_REFERENCE), true);
  }

  const expectedTools = new Map([
    ['chat-workspace', ['chat_workspace_set_state', 'chat_workspace_background', 'chat_workspace_select_chat', 'chat_workspace_send']],
    ['chat-sidebar-shell', ['chat_sidebar_set_chats', 'chat_sidebar_select', 'chat_sidebar_set_collapsed']],
    ['node-canvas', ['node_canvas_set_editor_model', 'node_canvas_set_path_style', 'node_canvas_set_flow_layout', 'node_canvas_apply_layout', 'node_canvas_focus_nodes']],
    ['canvas-graph', ['canvas_graph_set_model', 'canvas_graph_focus_node', 'canvas_graph_focus_nodes', 'canvas_graph_set_path']],
    ['graph-explorer-shell', ['graph_explorer_shell_set_view', 'graph_explorer_shell_set_stats', 'graph_explorer_shell_request_action']],
  ]);

  for (const [tagName, toolNames] of expectedTools) {
    let declaration = declarations.get(tagName);
    let mirroredToolNames = declaration.metadata.contract.webmcp.tools.map((tool) => tool.name);
    assert.deepEqual(mirroredToolNames, toolNames);
    assert.deepEqual(declaration.agent.webmcp.toolNames, toolNames);
    assert.equal(declaration.agent.webmcp.mode, 'explicit-descriptor');
  }

  let canvasGraph = declarations.get('canvas-graph');
  assert.ok(canvasGraph.componentDescription.includes('overview-read-renderer'));
  assert.equal(
    canvasGraph.metadata.contract.attributes.some((attribute) => attribute.name === 'auto-trigger'),
    false
  );
  assert.ok(canvasGraph.metadata.contract.capabilities.includes('overview-read-renderer'));
  assert.ok(canvasGraph.metadata.contract.attributes.some((attribute) => attribute.name === 'active-node-scale'));
  assert.ok(canvasGraph.metadata.contract.attributes.some((attribute) => attribute.name === 'info-panel-scale'));
  assert.ok(canvasGraph.metadata.contract.properties.some((property) => property.name === 'activeNodeScale'));
  assert.ok(canvasGraph.metadata.contract.properties.some((property) => property.name === 'infoPanelScale'));
  assert.ok(canvasGraph.metadata.contract.methods.some((method) => method.name === 'setVisualOptions'));
  assert.ok(canvasGraph.metadata.contract.methods.some((method) => method.name === 'suspendLayout'));
  assert.ok(canvasGraph.metadata.contract.methods.some((method) => method.name === 'resumeLayout'));
  assert.ok(canvasGraph.metadata.contract.methods.some((method) => method.name === 'queueTransitionMarkers'));
  assert.ok(canvasGraph.metadata.contract.themeAliases.includes('--sn-canvas-graph-panel-bg'));
  assert.ok(canvasGraph.metadata.contract.themeAliases.includes('--sn-graph-type-project'));
});

test('cascade theme derives distinct dark and light branches', async () => {
  const themeModule = await import(cascadeThemeSource.href);
  const darkTheme = themeModule.createCascadeTheme({ mode: 'dark' });
  const lightTheme = themeModule.createCascadeTheme({ mode: 'light' });

  assert.equal(darkTheme.state.mode, 'dark');
  assert.equal(lightTheme.state.mode, 'light');
  assert.equal(darkTheme.tokens['color-scheme'], 'dark');
  assert.equal(lightTheme.tokens['color-scheme'], 'light');
  assert.equal(darkTheme.tokens['--sn-sys-surface'], 'hsl(0 0% 10.0%)');
  assert.equal(lightTheme.tokens['--sn-sys-surface'], 'hsl(0 0% 98.0%)');
  assert.equal(darkTheme.tokens['--sn-sys-on-surface'], 'hsl(0 0% 98.0%)');
  assert.equal(lightTheme.tokens['--sn-sys-on-surface'], 'hsl(0 0% 8.0%)');
  assert.equal(darkTheme.tokens['--sn-theme-outline-strength'], lightTheme.tokens['--sn-theme-outline-strength']);
  assert.equal(darkTheme.tokens['--sn-field-control-bg'], 'var(--sn-sys-surface)');
  assert.equal(lightTheme.tokens['--sn-field-control-bg'], 'var(--sn-sys-surface)');
  assert.equal(lightTheme.tokens['--sn-button-primary-color'], 'hsl(0 0% 98.0%)');
  assert.equal(lightTheme.tokens['--sn-button-success-color'], 'hsl(0 0% 7.5%)');
  assert.equal(themeModule.getReadableTextForHsl(218, 89, 63, 94), 'hsl(0 0% 7.5%)');
  assert.equal(themeModule.getReadableTextForHsl(218, 89, 56.2, 18.9), 'hsl(0 0% 5.2%)');
});

test('cascade theme visual smoke fixtures cover luminance and chroma states', async () => {
  const [themeModule, fixtureModule] = await Promise.all([
    import(cascadeThemeSource.href),
    import(cascadeThemeVisualFixtureSource.href),
  ]);
  const { CASCADE_THEME_VISUAL_SMOKE_STATES, CASCADE_THEME_VISUAL_SMOKE_TOKEN_GROUPS } = fixtureModule;
  const allFixtureTokens = Object.values(CASCADE_THEME_VISUAL_SMOKE_TOKEN_GROUPS).flat();

  assert.deepEqual(CASCADE_THEME_VISUAL_SMOKE_STATES.map((fixture) => fixture.id), [
    'dark-default',
    'light-default',
    'dark-low-chroma',
    'dark-high-chroma',
  ]);
  assert.ok(CASCADE_THEME_VISUAL_SMOKE_STATES.some((fixture) => fixture.state.mode === 'dark'));
  assert.ok(CASCADE_THEME_VISUAL_SMOKE_STATES.some((fixture) => fixture.state.mode === 'light'));
  assert.ok(CASCADE_THEME_VISUAL_SMOKE_STATES.some((fixture) => fixture.state.chroma === 0));
  assert.ok(CASCADE_THEME_VISUAL_SMOKE_STATES.some((fixture) => fixture.state.chroma === 100));
  assert.ok(CASCADE_THEME_VISUAL_SMOKE_STATES.some((fixture) => fixture.state.pattern === 88));
  assert.ok(CASCADE_THEME_VISUAL_SMOKE_TOKEN_GROUPS.chat.includes('--sn-syntax-keyword'));
  assert.ok(CASCADE_THEME_VISUAL_SMOKE_TOKEN_GROUPS.chat.includes('--sn-theme-composer-radius-scale'));
  assert.ok(CASCADE_THEME_VISUAL_SMOKE_TOKEN_GROUPS.animatedCanvas.includes('--sn-cell-bg'));
  assert.ok(CASCADE_THEME_VISUAL_SMOKE_TOKEN_GROUPS.animatedCanvas.includes('--sn-theme-pattern-brightness'));
  assert.ok(CASCADE_THEME_VISUAL_SMOKE_TOKEN_GROUPS.animatedCanvas.includes('--sn-theme-cell-radius-scale'));
  assert.ok(CASCADE_THEME_VISUAL_SMOKE_TOKEN_GROUPS.graph.includes('--sn-node-circle-media-size'));
  assert.ok(CASCADE_THEME_VISUAL_SMOKE_TOKEN_GROUPS.layoutAndTabs.includes('--sn-tab-accent-5'));
  assert.ok(CASCADE_THEME_VISUAL_SMOKE_TOKEN_GROUPS.controls.includes('--sn-button-primary-color'));

  let themes = new Map();
  for (let fixture of CASCADE_THEME_VISUAL_SMOKE_STATES) {
    let theme = themeModule.createCascadeTheme(fixture.state);
    themes.set(fixture.id, theme);
    assert.equal(theme.state.mode, fixture.state.mode);
    assert.equal(theme.state.chroma, fixture.state.chroma);
    assert.equal(theme.state.pattern, fixture.state.pattern);
    for (let token of allFixtureTokens) {
      assert.ok(
        Object.hasOwn(theme.tokens, token),
        `${fixture.id} missing ${token}`
      );
      assert.notEqual(theme.tokens[token], '');
    }
  }

  let dark = themes.get('dark-default');
  let light = themes.get('light-default');
  let lowChroma = themes.get('dark-low-chroma');
  let highChroma = themes.get('dark-high-chroma');

  assert.notEqual(dark.tokens['--sn-sys-surface'], light.tokens['--sn-sys-surface']);
  assert.notEqual(dark.tokens['--sn-sys-on-surface'], light.tokens['--sn-sys-on-surface']);
  assert.equal(lowChroma.tokens['--sn-theme-chroma'], '0%');
  assert.equal(highChroma.tokens['--sn-theme-chroma'], '100%');
  assert.match(lowChroma.tokens['--sn-sys-accent'], / 0% /);
  assert.match(highChroma.tokens['--sn-sys-accent'], / 100% /);
  assert.notEqual(lowChroma.tokens['--sn-sys-accent'], highChroma.tokens['--sn-sys-accent']);
  assert.match(highChroma.tokens['--sn-button-primary-color'], /^hsl\(0 0% /);
  assert.notEqual(highChroma.tokens['--sn-theme-type-scale'], dark.tokens['--sn-theme-type-scale']);
  assert.notEqual(highChroma.tokens['--sn-theme-heading-scale'], dark.tokens['--sn-theme-heading-scale']);
  assert.notEqual(highChroma.tokens['--sn-theme-density'], dark.tokens['--sn-theme-density']);
  assert.notEqual(highChroma.tokens['--sn-theme-outline-strength'], dark.tokens['--sn-theme-outline-strength']);
  assert.notEqual(highChroma.tokens['--sn-theme-pattern-brightness'], dark.tokens['--sn-theme-pattern-brightness']);

  let patternOff = themeModule.createCascadeTheme({ mode: 'dark', pattern: 0 });
  let patternOn = themeModule.createCascadeTheme({ mode: 'dark', pattern: 100 });
  assert.notEqual(patternOff.tokens['--sn-cell-base-alpha'], patternOn.tokens['--sn-cell-base-alpha']);
  assert.notEqual(patternOff.tokens['--sn-cell-alpha-span'], patternOn.tokens['--sn-cell-alpha-span']);
  assert.equal(patternOff.tokens['--sn-cell-dot'], patternOn.tokens['--sn-cell-dot']);
  assert.equal(patternOff.tokens['--sn-cell-glare'], patternOn.tokens['--sn-cell-glare']);
  assert.equal(patternOff.tokens['--sn-cell-vignette-mid'], patternOn.tokens['--sn-cell-vignette-mid']);
  assert.equal(patternOff.tokens['--sn-cell-vignette-edge'], patternOn.tokens['--sn-cell-vignette-edge']);
  assert.equal(patternOff.tokens['--sn-cell-noise'], patternOn.tokens['--sn-cell-noise']);
});

test('cell background derives runtime palette and metrics from cascade tokens', async () => {
  const [{ readCellBgTheme }, componentSource] = await Promise.all([
    import(cellBgThemeSource.href),
    readFile(cellBgSource, 'utf8'),
  ]);
  const makeReaders = (tokens, numbers = {}) => ({
    readToken: (_source, token) => tokens[token] || '',
    readNumber: (_source, token, fallback) => numbers[token] ?? fallback,
    normalizeColor: (_source, value) => value || null,
    parseRgb: parseRgbToken,
  });
  const darkTokens = {
    '--sn-cell-bg': 'rgb(0 0 0)',
    '--sn-cell-dot': 'rgb(255 255 255)',
    '--sn-cell-base-alpha': '0.10',
    '--sn-cell-alpha-span': '0.50',
  };
  const lightTokens = {
    '--sn-cell-bg': 'rgb(250 250 250)',
    '--sn-cell-dot': 'rgb(30 30 30)',
    '--sn-cell-base-alpha': '0.05',
    '--sn-cell-alpha-span': '0.40',
  };
  const metrics = {
    '--sn-cell-size': 18,
    '--sn-cell-min-radius': 3,
    '--sn-cell-max-radius': 7,
    '--sn-cell-step-ms': 60,
    '--sn-cell-fade-rate': 0.08,
  };

  const darkState = readCellBgTheme(null, makeReaders(darkTokens, metrics));
  const lightState = readCellBgTheme(null, makeReaders(lightTokens, {
    ...metrics,
    '--sn-cell-size': 22,
  }));

  assert.equal(darkState.cellSize, 18);
  assert.equal(darkState.minRadius, 3);
  assert.equal(darkState.maxRadius, 7);
  assert.equal(darkState.stepMs, 60);
  assert.equal(darkState.fadeRate, 0.08);
  assert.equal(darkState.bgFill, 'rgb(0 0 0)');
  assert.equal(darkState.palette[0], '#1a1a1a');
  assert.equal(darkState.palette.at(-1), '#999999');
  assert.equal(lightState.cellSize, 22);
  assert.equal(lightState.bgFill, 'rgb(250 250 250)');
  assert.notEqual(lightState.palette[0], darkState.palette[0]);
  assert.match(componentSource, /readCellBgTheme/);
  assert.match(componentSource, /_applyThemeState/);
});

test('cascade theme controls reach canvas objects and layout chrome', async () => {
  const [
    graphNode,
    portItem,
    ctrlItem,
    nodeSocket,
    nodeCanvas,
    layout,
    layoutSourceText,
    layoutNodeSourceText,
    layoutNode,
    layoutNodeTpl,
    layoutSidebarSourceText,
    layoutSidebar,
    projectTabs,
    projectTabsCss,
    graphExplorerShellCss,
    panelMenu,
    treeView,
    eventFeed,
    emptyState,
    dataTable,
    sourceViewer,
    statusRibbon,
    listDetailShell,
    codeBlock,
    chatMessage,
    chatTranscript,
    chatComposer,
    chatList,
    chatListItem,
    chatSidebarSourceText,
    chatSidebarConstantsText,
    chatSidebar,
    chatSidebarItemSourceText,
    chatSidebarItem,
    cellBgComponent,
    cellBg,
    cellBgTheme,
    cascadeTheme,
    registry,
    customElements,
  ] = await Promise.all([
    readFile(graphNodeStyles, 'utf8'),
    readFile(portItemStyles, 'utf8'),
    readFile(ctrlItemStyles, 'utf8'),
    readFile(nodeSocketStyles, 'utf8'),
    readFile(nodeCanvasStyles, 'utf8'),
    readFile(layoutStyles, 'utf8'),
    readFile(layoutSource, 'utf8'),
    readFile(layoutNodeSource, 'utf8'),
    readFile(layoutNodeStyles, 'utf8'),
    readFile(layoutNodeTemplate, 'utf8'),
    readFile(layoutSidebarSource, 'utf8'),
    readFile(layoutSidebarStyles, 'utf8'),
    readFile(projectTabsSource, 'utf8'),
    readFile(projectTabsStyles, 'utf8'),
    readFile(graphExplorerShellStyles, 'utf8'),
    readFile(panelMenuStyles, 'utf8'),
    readFile(treeViewStyles, 'utf8'),
    readFile(eventFeedStyles, 'utf8'),
    readFile(emptyStateStyles, 'utf8'),
    readFile(dataTableStyles, 'utf8'),
    readFile(sourceViewerStyles, 'utf8'),
    readFile(statusRibbonStyles, 'utf8'),
    readFile(listDetailShellStyles, 'utf8'),
    readFile(codeBlockStyles, 'utf8'),
    readFile(chatMessageItemStyles, 'utf8'),
    readFile(chatTranscriptStyles, 'utf8'),
    readFile(chatComposerStyles, 'utf8'),
    readFile(chatListStyles, 'utf8'),
    readFile(chatListItemStyles, 'utf8'),
    readFile(chatSidebarSource, 'utf8'),
    readFile(chatSidebarConstants, 'utf8'),
    readFile(chatSidebarStyles, 'utf8'),
    readFile(chatSidebarItemSource, 'utf8'),
    readFile(chatSidebarItemStyles, 'utf8'),
    readFile(cellBgSource, 'utf8'),
    readFile(cellBgStyles, 'utf8'),
    readFile(cellBgThemeSource, 'utf8'),
    readFile(cascadeThemeSource, 'utf8'),
    readFile(componentRegistrySource, 'utf8'),
    readFile(customElementsSource, 'utf8'),
  ]);

  assert.match(graphNode, /--sn-node-label-size/);
  assert.match(graphNode, /--sn-node-summary-size/);
  assert.match(graphNode, /--sn-node-icon-size/);
  assert.match(graphNode, /--sn-shape-icon-size/);
  assert.match(graphNode, /--sn-node-pill-body-padding/);
  assert.match(graphNode, /--sn-node-circle-body-padding/);
  assert.match(graphNode, /--sn-node-circle-icon-size/);
  assert.match(graphNode, /--sn-node-circle-media-size/);
  assert.match(graphNode, /--sn-node-circle-port-offset/);
  assert.match(graphNode, /--sn-node-port-socket-offset/);
  assert.match(graphNode, /--sn-node-pill-port-socket-offset/);
  assert.doesNotMatch(graphNode, /margin-left:\s*var\(--sn-step-0,\s*-18px\)/);
  assert.doesNotMatch(graphNode, /margin-right:\s*var\(--sn-step-0,\s*-18px\)/);
  assert.doesNotMatch(graphNode, /margin-left:\s*var\(--sn-step-0,\s*-26px\)/);
  assert.doesNotMatch(graphNode, /margin-right:\s*var\(--sn-step-0,\s*-26px\)/);
  assert.match(graphNode, /&\[data-has-media\] .sn-node-media/);
  assert.match(graphNode, /clip-path: circle\(50% at 50% 50%\)/);
  assert.match(graphNode, /object-fit: var\(--sn-node-circle-media-fit, cover\)/);
  assert.match(graphNode, /--sn-node-comment-body-padding/);
  assert.match(graphNode, /stroke: var\(--sn-shape-stroke/);
  assert.match(graphNode, /stroke-width: var\(--sn-shape-stroke-width/);
  assert.match(graphNode, /--sn-shape-port-hint-stroke-width/);
  assert.match(portItem, /--sn-port-label-size/);
  assert.match(portItem, /--sn-port-item-socket-offset/);
  assert.doesNotMatch(portItem, /margin-left:\s*var\(--sn-step-0,\s*-22px\)/);
  assert.doesNotMatch(portItem, /margin-right:\s*var\(--sn-step-0,\s*-22px\)/);
  assert.match(ctrlItem, /--sn-control-input-size/);
  assert.match(nodeSocket, /--sn-socket-hit-size/);
  assert.match(nodeCanvas, /--sn-conn-hover-width/);
  assert.match(nodeCanvas, /--sn-pseudo-conn-width/);
  assert.match(nodeCanvas, /--sn-plus-indicator-stroke-width/);
  assert.match(layout, /--sn-fullscreen-tab-icon-size/);
  assert.match(layout, /scroll-inline-active/);
  assert.match(layout, /scroll-block-active/);
  assert.match(layout, /responsive-active/);
  assert.match(layout, /responsive-mode='stack'/);
  assert.match(layout, /--sn-layout-responsive-panel-min-block-size/);
  assert.match(layoutSourceText, /ResizeObserver/);
  assert.match(layoutSourceText, /setLayoutBehavior/);
  assert.match(layoutSourceText, /setNodeBehavior/);
  assert.match(layoutSourceText, /autoCollapsed/);
  assert.match(layoutSourceText, /setPanelMenuActions/);
  assert.match(layoutSourceText, /openPanel\(panelType, options = \{\}\)/);
  assert.match(layoutSourceText, /closeUiPanel\(panelType\)/);
  assert.match(layoutSourceText, /removeUiPanel\(panelType\)/);
  assert.match(layoutSourceText, /layout-ui-panel-open/);
  assert.match(layoutSourceText, /layout-ui-panel-close/);
  assert.match(layoutSourceText, /layout-ui-panel-remove/);
  assert.match(layoutSourceText, /Array\.from\(this\.ref\.root\.children\)/);
  assert.match(layoutSourceText, /this\._restoreAutoCollapsedPanels\(tree\)[\s\S]*?this\._scheduleResponsiveLayout\(\);[\s\S]*?return;/);
  assert.match(layoutSourceText, /duplicatePanel/);
  assert.match(layoutSourceText, /panel-close/);
  assert.match(layoutSourceText, /_onPanelClose/);
  assert.match(layoutSourceText, /#setPanelVisible\(panelNode, true\)/);
  assert.match(layoutSourceText, /layout:split-horizontal/);
  assert.match(layoutSourceText, /layout:split-vertical/);
  assert.match(layoutSourceText, /layout:duplicate/);
  assert.match(layoutNodeSourceText, /layout:collapse-toggle/);
  assert.match(layoutNodeSourceText, /getLayoutPanelViewActions/);
  assert.match(layoutSourceText, /layout:close-ui-panel/);
  assert.match(layoutSourceText, /layout:remove-ui-panel/);
  assert.match(layoutSourceText, /layout:remove/);
  assert.match(layoutSourceText, /panelState\?\.removable === true[\s\S]*?this\.joinPanels\(panelId\)/);
  assert.match(layoutSourceText, /_onPanelClose\(e\)[\s\S]*?panelState\.uiInvoked[\s\S]*?this\.closeUiPanel\(panelType\)[\s\S]*?panelState\.removable === true[\s\S]*?this\.joinPanels\(panelId\)/);
  assert.doesNotMatch(layoutSourceText, /_getActionZonesEnabled/);
  assert.doesNotMatch(layoutSourceText, /action-zone-/);
  assert.doesNotMatch(layoutSourceText, /LayoutPreview|layout-preview/);
  assert.match(layoutNodeSourceText, /layoutCollapsePolicy/);
  assert.match(layoutNodeSourceText, /collapse-policy/);
  assert.match(layoutNodeSourceText, /setPanelMenuActions/);
  assert.match(layoutNodeSourceText, /panel-menu-actions/);
  assert.match(layoutNodeSourceText, /panel-menu-action/);
  assert.match(layoutNodeSourceText, /PANEL_MENU_GROUPS/);
  assert.match(layoutNodeSourceText, /groupPanelMenuActions/);
  assert.match(layoutNodeSourceText, /panelMenuRows/);
  assert.match(layoutNodeSourceText, /groupLabel/);
  assert.match(layoutNodeSourceText, /rowSpan/);
  assert.match(layoutNodeSourceText, /LAYOUT_PANEL_MENU_ACTIONS/);
  assert.match(layoutNodeSourceText, /_onPanelMenuClick/);
  assert.ok(layoutNodeSourceText.includes("closest('.panel-menu-action[data-menu-action-id]')"));
  assert.match(layoutNodeSourceText, /button\.closest\('layout-node'\) !== this/);
  assert.match(layoutNodeSourceText, /event\.stopPropagation\(\)/);
  assert.match(layoutNodeSourceText, /_syncPanelMenuActionState/);
  assert.match(layoutNodeSourceText, /button\.toggleAttribute\('disabled', disabled\)/);
  assert.match(layoutNodeSourceText, /button\.disabled = disabled/);
  assert.match(layoutNodeSourceText, /this\.ref\.panelContent\) this\.ref\.panelContent\.replaceChildren\(\)/);
  assert.match(layoutNodeSourceText, /Array\.from\(container\.children\)/);
  assert.match(layoutNodeSourceText, /querySelector\(':scope > layout-node'\)/);
  assert.match(layoutNodeSourceText, /LAYOUT_UI_PANEL_MENU_ACTIONS/);
  assert.match(layoutNodeSourceText, /LAYOUT_REMOVABLE_PANEL_MENU_ACTIONS/);
  assert.match(layoutNodeSourceText, /getLayoutPanelMenuActions/);
  assert.match(layoutNodeSourceText, /panelState\?\.uiInvoked/);
  assert.match(layoutNodeSourceText, /panelState\?\.removable === true/);
  assert.match(layoutNodeSourceText, /this\._toggleCollapse\(\)/);
  assert.match(layoutNodeSourceText, /layout:duplicate/);
  assert.match(layoutNodeSourceText, /layout:close-ui-panel/);
  assert.match(layoutNodeSourceText, /layout:remove-ui-panel/);
  assert.match(layoutNodeSourceText, /layout:remove/);
  assert.doesNotMatch(layoutNodeSourceText, /onPanelMenuAction:/);
  assert.doesNotMatch(layoutNodeSourceText, /showActionZones/);
  assert.doesNotMatch(layoutNodeSourceText, /layoutActionZones/);
  assert.doesNotMatch(layoutNodeSourceText, /corner/i);
  assert.match(layoutSidebarSourceText, /isDisabled: Boolean\(item\.disabled\)/);
  assert.match(layoutSidebarSourceText, /'@storage-key': ''/);
  assert.match(layoutSidebarSourceText, /#storageKey\(kind\)/);
  assert.match(layoutSidebarSourceText, /this\.#storageKey\('collapsed'\)/);
  assert.match(layoutSidebarSourceText, /this\.#storageKey\('config'\)/);
  assert.match(layoutSidebarSourceText, /this\.#storageKey\('width'\)/);
  assert.match(layoutSidebarSourceText, /layout-sidebar-reset/);
  assert.match(layoutSidebarSourceText, /activeSection/);
  assert.doesNotMatch(layoutSidebarSourceText, /pg-layout-v2-/);
  assert.doesNotMatch(layoutSidebarSourceText, /window\.location\.reload/);
  assert.match(layoutSidebar, /--sn-layout-header-gap/);
  assert.match(layoutSidebar, /--sn-layout-header-padding/);
  assert.match(layoutSidebar, /--sn-layout-header-min-height/);
  assert.match(layoutSidebar, /--sn-layout-header-block-size/);
  assert.match(layoutSidebar, /--sn-layout-header-button-size/);
  assert.match(layoutSidebar, /--sn-layout-header-icon-size/);
  assert.match(layoutSidebar, /--sn-layout-header-button-gap/);
  assert.match(layoutSidebar, /--sn-layout-header-button-padding/);
  assert.match(layoutSidebar, /--sn-layout-header-button-radius/);
  assert.match(layoutSidebar, /--sn-layout-sidebar-header-bg/);
  assert.match(layoutSidebar, /border-top: 1px solid var\(--sn-layout-border\)/);
  assert.match(layoutSidebar, /box-sizing: border-box/);
  assert.match(layoutSidebar, /min-inline-size: var\(--sn-layout-header-button-min-inline-size, 24px\)/);
  assert.match(layoutSidebar, /block-size: var\(--sn-layout-header-button-block-size, var\(--sn-layout-header-button-min-block-size, 24px\)\)/);
  assert.match(layoutSidebar, /line-height: 1/);
  assert.doesNotMatch(layoutSidebar, /\.sb-header \{[\s\S]*?border-right:/);
  assert.match(layoutSidebar, /border-bottom: 1px solid var\(--sn-layout-sidebar-header-border, var\(--sn-layout-border\)\)/);
  assert.match(layoutSidebar, /--sn-layout-sidebar-item-block-size/);
  assert.match(layoutSidebar, /--sn-layout-sidebar-item-padding/);
  assert.match(layoutSidebar, /--sn-layout-sidebar-header-button-hover-bg/);
  assert.match(layoutSidebar, /--sn-layout-sidebar-header-button-active-bg/);
  assert.match(layoutNode, /--sn-layout-menu-action-size/);
  assert.match(layoutNode, /--sn-layout-menu-action-height/);
  assert.match(layoutNode, /--sn-layout-menu-icon-size/);
  assert.match(layoutNode, /--sn-layout-header-gap/);
  assert.match(layoutNode, /--sn-layout-header-padding/);
  assert.match(layoutNode, /--sn-layout-header-min-height/);
  assert.match(layoutNode, /--sn-layout-header-block-size/);
  assert.match(layoutNode, /--sn-layout-header-title-size/);
  assert.match(layoutNode, /--sn-layout-header-title-line-height/);
  assert.match(layoutNode, /--sn-layout-header-button-size/);
  assert.match(layoutNode, /--sn-layout-header-icon-size/);
  assert.match(layoutNode, /--sn-layout-header-button-gap/);
  assert.match(layoutNode, /--sn-layout-header-button-padding/);
  assert.match(layoutNode, /--sn-layout-header-button-radius/);
  assert.match(layoutNode, /--sn-layout-header-button-min-inline-size/);
  assert.match(layoutNode, /--sn-layout-header-button-min-block-size/);
  assert.match(layoutNode, /--sn-layout-header-button-block-size/);
  assert.match(layoutNode, /--sn-layout-panel-card-bg/);
  assert.match(layoutNode, /--sn-layout-panel-card-border/);
  assert.match(layoutNode, /--sn-layout-panel-card-radius/);
  assert.match(layoutNode, /--sn-layout-panel-card-inline-size/);
  assert.match(layoutNode, /--sn-layout-panel-card-min-block-size/);
  assert.match(layoutNode, /--sn-layout-menu-row-span/);
  assert.match(layoutNode, /--sn-layout-menu-row-height/);
  assert.match(layoutNode, /calc\(var\(--sn-layout-menu-row-height, var\(--sn-layout-header-block-size, calc\(var\(--sn-layout-header-min-height, 28px\) \+ 3px\)\)\) \* var\(--sn-layout-menu-row-span\)\)/);
  assert.match(layoutNode, /panel-menu-row-label/);
  assert.match(layoutNodeTpl, /panel-menu-drawer/);
  assert.match(layoutNodeTpl, /panelMenuRows/);
  assert.match(layoutNodeTpl, /panel-menu-actions/);
  assert.match(layoutNodeTpl, /data-menu-group/);
  assert.match(layoutNodeTpl, /panel-menu-row-label/);
  assert.doesNotMatch(layoutNodeTpl, /onPanelMenuAction/);
  assert.doesNotMatch(layoutNodeTpl, /'@disabled': 'disabled'/);
  assert.doesNotMatch(layoutNodeTpl, /'@active': 'active'/);
  assert.doesNotMatch(layoutNodeTpl, /<action-zone/);
  assert.doesNotMatch(layoutNodeTpl, /showActionZones/);
  assert.doesNotMatch(layoutNodeTpl, /corner/i);
  assert.match(layoutNode, /--sn-layout-header-icon-size/);
  assert.match(layoutNode, /--sn-layout-resizer-thickness/);
  assert.doesNotMatch(layoutNode, /corner/i);
  assert.match(projectTabs, /--sn-tab-accent-\$\{index % 6\}/);
  assert.match(projectTabsCss, /--tab-accent, var\(--sn-tabs-accent/);
  assert.match(projectTabsCss, /border-color: var\(--sn-tabs-active-border, color-mix\(in oklab, var\(--tab-accent/);
  assert.match(projectTabsCss, /--sn-tabs-item-font-size/);
  assert.match(projectTabsCss, /--sn-tabs-icon-size/);
  assert.match(projectTabsCss, /--sn-tabs-item-padding/);
  assert.match(graphExplorerShellCss, /--sn-graph-explorer-button-size/);
  assert.match(graphExplorerShellCss, /--sn-graph-explorer-button-icon-size/);
  assert.match(graphExplorerShellCss, /--sn-graph-explorer-button-padding/);
  assert.match(graphExplorerShellCss, /--sn-graph-explorer-stats-padding/);
  assert.match(panelMenu, /--sn-panel-menu-item-size/);
  assert.match(treeView, /--sn-tree-badge-padding/);
  assert.match(eventFeed, /--sn-event-feed-font-size/);
  assert.match(eventFeed, /--sn-event-feed-header-padding/);
  assert.match(eventFeed, /--sn-event-feed-item-padding/);
  assert.match(eventFeed, /--sn-event-feed-raw-max-height/);
  assert.match(emptyState, /--sn-empty-state-font-size/);
  assert.match(emptyState, /--sn-empty-state-icon-size/);
  assert.match(emptyState, /--sn-empty-state-padding/);
  assert.match(dataTable, /--sn-data-table-cell-size/);
  assert.match(dataTable, /--sn-data-table-cell-padding/);
  assert.match(dataTable, /--sn-data-table-header-border/);
  assert.match(sourceViewer, /--sn-source-header-size/);
  assert.match(sourceViewer, /--sn-source-header-padding/);
  assert.match(sourceViewer, /--sn-source-action-size/);
  assert.match(statusRibbon, /--sn-status-ribbon-size/);
  assert.match(statusRibbon, /--sn-status-ribbon-icon-size/);
  assert.match(statusRibbon, /--sn-status-ribbon-padding/);
  assert.match(listDetailShell, /--sn-list-detail-title-size/);
  assert.match(listDetailShell, /--sn-list-detail-main-padding/);
  assert.match(listDetailShell, /--sn-list-detail-compact-main-padding/);
  assert.match(codeBlock, /--sn-markdown-h1-size/);
  assert.match(codeBlock, /--sn-markdown-h4-size/);
  assert.match(codeBlock, /--sn-code-font-size/);
  assert.match(codeBlock, /--sn-code-padding/);
  assert.match(codeBlock, /--sn-code-table-row-hover-bg, color-mix\(in oklch, var\(--sn-sys-accent\) var\(--sn-sys-state-hover-mix\), var\(--sn-sys-surface\)\)/);
  assert.doesNotMatch(codeBlock, /md-table tr:hover td \{\s*background: var\(--sn-bg-overlay\);/);
  assert.match(chatMessage, /--sn-chat-markdown-h1-size/);
  assert.match(chatMessage, /--sn-chat-markdown-h4-size/);
  assert.match(chatMessage, /--sn-chat-message-font-size/);
  assert.match(chatMessage, /--sn-chat-message-padding/);
  assert.match(chatMessage, /--sn-chat-status-card-size/);
  assert.match(chatMessage, /--sn-chat-user-message-bg/);
  assert.match(chatMessage, /--sn-chat-agent-message-bg/);
  assert.match(chatMessage, /\.message\.system \{[\s\S]*min-width: 0/);
  assert.match(chatMessage, /\.message\.system \.msg-content \{[\s\S]*display: flex[\s\S]*overflow-wrap: anywhere/);
  assert.match(chatMessage, /--sn-syntax-keyword/);
  assert.match(chatTranscript, /--sn-chat-bg/);
  assert.match(chatTranscript, /--sn-chat-transcript-padding/);
  assert.match(chatTranscript, /\.chat-background/);
  assert.match(chatTranscript, /::slotted\(\*\)/);
  assert.match(chatTranscript, /chat-transcript > \[slot="background"\]/);
  assert.match(chatComposer, /--sn-composer-bg/);
  assert.match(chatComposer, /--sn-composer-send-size/);
  assert.match(chatComposer, /--sn-composer-input-size/);
  assert.match(chatComposer, /--sn-composer-input-min-inline-size/);
  assert.match(chatComposer, /--sn-composer-input-padding/);
  assert.match(chatComposer, /box-sizing: border-box/);
  assert.match(chatComposer, /textarea::placeholder \{[\s\S]*color: color-mix\(in oklab, var\(--sn-sys-on-surface-dim\) 72%, transparent\)/);
  assert.match(chatComposer, /grid-template-columns: auto minmax\(0, 1fr\) auto auto auto/);
  assert.match(chatComposer, /grid-template-rows: minmax\(var\(--sn-composer-input-min-height\), auto\) auto/);
  assert.match(chatComposer, /min-block-size: calc\(var\(--sn-composer-send-size\) \* 2\.75\)/);
  assert.match(chatComposer, /container: chat-composer \/ inline-size/);
  assert.match(chatComposer, /@container chat-composer \(width <= 480px\)/);
  assert.doesNotMatch(chatComposer, /grid-template-rows:[^;]*auto auto auto/);
  assert.match(chatComposer, /\.composer-actions/);
  assert.match(chatComposer, /--sn-composer-footer-size/);
  assert.match(chatComposer, /--sn-composer-voice-label-size/);
  assert.match(chatComposer, /--sn-composer-collapsed-control-width/);
  assert.match(chatComposer, /--sn-composer-collapsed-control-padding/);
  assert.match(chatList, /--sn-chat-list-header-padding/);
  assert.match(chatList, /--sn-chat-list-filter-button-size/);
  assert.match(chatListItem, /--sn-chat-list-item-padding/);
  assert.match(chatListItem, /--sn-chat-list-badge-size/);
  assert.match(chatListItem, /--sn-chat-list-delete-size/);
  assert.match(chatSidebarSourceText, /--sn-chat-sidebar-width/);
  assert.match(chatSidebarSourceText, /--sn-chat-sidebar-collapsed-width/);
  assert.match(chatSidebarSourceText, /COLLAPSED_NAV_WIDTH_TOKEN/);
  assert.match(chatSidebarConstantsText, /COLLAPSED_NAV_WIDTH = 31/);
  assert.match(chatSidebarSourceText, /navWidth = nav\.getBoundingClientRect\(\)\.width/);
  assert.match(chatSidebarSourceText, /navWidth > 0 \? navWidth : readCssPixelValue\(this, '--sn-chat-sidebar-collapsed-width', COLLAPSED_NAV_WIDTH\)/);
  assert.match(chatSidebarSourceText, /observedAttributes/);
  assert.match(chatSidebarSourceText, /'auto-collapse'/);
  assert.match(chatSidebarSourceText, /setAutoCollapse/);
  assert.match(chatSidebarSourceText, /_hasExplicitNavWidth/);
  assert.match(chatSidebar, /\.chat-nav\[collapsed\]\s*\{[\s\S]*?width: var\(--chat-nav-width, var\(--sn-chat-sidebar-collapsed-width, var\(--sn-layout-header-block-size, calc\(var\(--sn-layout-header-min-height, 28px\) \+ 3px\)\)\)\);[\s\S]*?min-width: var\(--chat-nav-width, var\(--sn-chat-sidebar-collapsed-width, var\(--sn-layout-header-block-size, calc\(var\(--sn-layout-header-min-height, 28px\) \+ 3px\)\)\)\);/);
  assert.match(chatSidebar, /--sn-chat-sidebar-header-padding/);
  assert.match(chatSidebar, /--sn-chat-sidebar-button-icon-size/);
  assert.match(cascadeTheme, /'--sn-chat-sidebar-collapsed-width': 'var\(--sn-layout-header-block-size, calc\(var\(--sn-layout-header-min-height, 28px\) \+ 3px\)\)'/);
  assert.match(chatSidebarItemSourceText, /--sn-chat-sidebar-title-size/);
  assert.match(chatSidebarItemSourceText, /--sn-chat-sidebar-compact-label-extra/);
  assert.match(chatSidebarItem, /--sn-chat-sidebar-row-padding/);
  assert.match(chatSidebarItem, /--sn-chat-sidebar-child-padding/);
  assert.match(chatSidebarItem, /--sn-chat-sidebar-delete-box-size/);
  assert.match(chatSidebarItem, /--sn-chat-sidebar-compact-label-inset/);
  assert.match(cellBgComponent, /refreshTheme/);
  assert.match(cellBgComponent, /_scheduleThemeRefresh/);
  assert.match(cellBgComponent, /cascade-theme-change/);
  assert.match(cellBgComponent, /MutationObserver/);
  assert.match(cellBgComponent, /prefers-reduced-motion: reduce/);
  assert.match(cellBgComponent, /_prefersReducedMotion/);
  assert.match(cellBgComponent, /readCellBgTheme/);
  assert.match(cellBgComponent, /observedAttributes\(\)/);
  assert.match(cellBgComponent, /'auto-trigger'/);
  assert.match(cellBgComponent, /'pulse-duration'/);
  assert.match(cellBgComponent, /_triggerIfEnabled/);
  assert.match(cellBgComponent, /_normalizePulseDuration/);
  assert.match(cellBgComponent, /if \(state && this\._pulseTimer\)/);
  assert.match(cellBgComponent, /start\(\)/);
  assert.match(cellBgComponent, /stop\(\)/);
  assert.match(cellBgComponent, /suspendLayout/);
  assert.match(cellBgComponent, /resumeLayout/);
  assert.match(cellBgComponent, /setFrameDriver\(mode = 'self'\)/);
  assert.match(cellBgComponent, /presentFrame\(\)/);
  assert.match(cellBgComponent, /getFramePresentation\(\)/);
  assert.match(cellBgComponent, /cellBgRenderHash/);
  assert.match(cellBgComponent, /if \(this\._externalFrameDrive\) \{\s*this\.presentFrame\(\);\s*return;/);
  assert.match(cellBgComponent, /_recordExternalPersistent/);
  assert.match(cellBgComponent, /trigger\(duration = 10000\)/);
  assert.match(cellBgComponent, /cell-bg-animation-trigger/);
  assert.match(cellBgComponent, /cell-bg-animation-start/);
  assert.match(cellBgComponent, /cell-bg-animation-stop/);
  assert.match(cellBgComponent, /cell-bg-animation-idle/);
  assert.match(cellBgTheme, /--sn-cell-size/);
  assert.match(cellBgTheme, /--sn-cell-dot/);
  assert.match(cellBgTheme, /function start\(\)/);
  assert.match(cellBgTheme, /toggled: false/);
  assert.match(cellBgTheme, /state\.toggled = true/);
  assert.match(cellBgTheme, /if \(state\.toggled\) return/);
  assert.match(cellBgTheme, /if \(!state\.toggled\) stop\('pulse'\)/);
  assert.match(cellBgTheme, /canvas\.__cellBg/);
  assert.match(cellBgTheme, /trigger,\n        pulse/);
  assert.match(cellBgTheme, /cell-bg-animation-trigger/);
  assert.match(cellBgTheme, /cell-bg-animation-start/);
  assert.match(cellBgTheme, /cell-bg-animation-stop/);
  assert.match(cellBgTheme, /cell-bg-animation-idle/);
  assert.match(cellBg, /--sn-cell-bg/);
  assert.match(cellBg, /radial-gradient\(circle at 50% -10%, var\(--sn-cell-glare\)/);
  assert.match(cellBg, /radial-gradient\(circle at 50% 50%, transparent 20%, var\(--sn-cell-vignette-mid\)/);
  assert.doesNotMatch(cellBg, /radial-gradient\(ellipse/);
  assert.match(cellBg, /--sn-cell-glare/);
  assert.match(cellBg, /--sn-cell-noise/);
  assert.match(registry, /panel-menu-actions/);
  assert.match(registry, /fold-down-panel-actions/);
  assert.match(registry, /responsive-behavior/);
  assert.match(registry, /min-size-fit/);
  assert.match(registry, /mobile-stack/);
  assert.match(registry, /deterministic-render/);
  assert.match(registry, /not persisted into saved layout trees/);
  assert.match(registry, /ui-invoked-panels/);
  assert.match(registry, /setLayoutBehavior/);
  assert.match(registry, /setNodeBehavior/);
  assert.match(registry, /openPanel/);
  assert.match(registry, /closeUiPanel/);
  assert.match(registry, /removeUiPanel/);
  assert.match(registry, /minimizing temporary UI-invoked panels from Remove/);
  assert.match(registry, /layout-ui-panel-open/);
  assert.match(registry, /layout-ui-panel-close/);
  assert.match(registry, /layout-ui-panel-remove/);
  assert.doesNotMatch(registry, /action-zone/);
  assert.doesNotMatch(registry, /layout-preview/);
  assert.match(registry, /--sn-layout-menu-action-height/);
  assert.match(registry, /--sn-layout-overflow-inline-size/);
  assert.match(layoutSourceText, /resolveResponsiveLayoutState/);
  assert.match(layoutSourceText, /resolveLayoutMinSize/);
  assert.match(layoutSourceText, /scroll-inline-active/);
  assert.match(layoutSourceText, /scroll-block-active/);
  assert.match(layoutSourceText, /setStylePropertyIfChanged/);
  assert.match(layout, /\[scroll-inline-active\]/);
  assert.match(layout, /\[scroll-block-active\]/);
  assert.match(layout, /\[scroll-inline-active\]\[scroll-block-active\]/);
  assert.doesNotMatch(layout, /\[responsive-active\]\[responsive-mode='stack'\]\s*\{\s*overflow-x: hidden;/);
  assert.match(registry, /preview-approve/);
  assert.match(registry, /sidebar-disabled/);
  assert.match(registry, /layout-sidebar-reset/);
  assert.match(registry, /Active sidebar section id reflected by setActiveSection/);
  assert.match(registry, /--sn-cell-noise/);
  assert.match(registry, /animated-background-slot/);
  assert.match(registry, /Optional background layer for effects such as cell-bg/);
  assert.match(registry, /activity-trigger/);
  assert.match(registry, /smooth-start/);
  assert.match(registry, /smooth-stop/);
  assert.match(registry, /autoTrigger/);
  assert.match(registry, /pulseDuration/);
  assert.match(registry, /cell_bg_trigger/);
  assert.match(registry, /cell_bg_start/);
  assert.match(registry, /cell_bg_stop/);
  assert.match(registry, /cell-bg-animation-trigger/);
  assert.match(registry, /Starts persistent animation with smooth acceleration/);
  assert.match(registry, /Stops persistent or timed animation with smooth deceleration/);
  assert.match(registry, /Triggers a timed animation pulse/);
  assert.match(registry, /--sn-composer-collapsed-control-width/);
  assert.match(registry, /--sn-composer-input-min-inline-size/);
  assert.match(registry, /auto-collapse/);
  assert.match(registry, /setAutoCollapse/);
  assert.match(registry, /--sn-chat-list-header-padding/);
  assert.match(registry, /--sn-chat-list-item-padding/);
  assert.match(registry, /--sn-chat-list-delete-size/);
  assert.match(registry, /--sn-chat-sidebar-header-padding/);
  assert.match(registry, /--sn-layout-header-gap/);
  assert.match(registry, /--sn-layout-header-padding/);
  assert.match(registry, /--sn-layout-header-min-height/);
  assert.match(registry, /--sn-layout-header-block-size/);
  assert.match(registry, /--sn-layout-header-title-size/);
  assert.match(registry, /--sn-layout-header-title-line-height/);
  assert.match(registry, /--sn-layout-header-button-size/);
  assert.match(registry, /--sn-layout-header-icon-size/);
  assert.match(registry, /--sn-layout-header-button-gap/);
  assert.match(registry, /--sn-layout-header-button-padding/);
  assert.match(registry, /--sn-layout-header-button-radius/);
  assert.match(registry, /--sn-layout-header-button-min-inline-size/);
  assert.match(registry, /--sn-layout-header-button-min-block-size/);
  assert.match(registry, /--sn-layout-header-button-block-size/);
  assert.match(registry, /--sn-layout-panel-card-bg/);
  assert.match(registry, /--sn-layout-panel-card-border/);
  assert.match(registry, /--sn-layout-panel-card-radius/);
  assert.match(registry, /--sn-layout-panel-card-inline-size/);
  assert.match(registry, /--sn-layout-panel-card-min-block-size/);
  assert.match(registry, /--sn-layout-sidebar-header-bg/);
  assert.match(registry, /--sn-layout-sidebar-header-border/);
  assert.match(registry, /--sn-layout-sidebar-header-button-hover-bg/);
  assert.match(registry, /--sn-layout-sidebar-header-button-active-bg/);
  assert.match(registry, /--sn-layout-sidebar-item-block-size/);
  assert.match(registry, /--sn-layout-sidebar-item-padding/);
  assert.match(registry, /--sn-chat-sidebar-row-padding/);
  assert.match(registry, /--sn-chat-sidebar-delete-box-size/);
  assert.match(registry, /--sn-node-pill-body-padding/);
  assert.match(registry, /--sn-node-circle-body-padding/);
  assert.match(registry, /--sn-node-circle-icon-size/);
  assert.match(registry, /--sn-node-circle-media-size/);
  assert.match(registry, /--sn-shape-icon-size/);
  assert.match(registry, /--sn-shape-stroke-width/);
  assert.match(registry, /--sn-shape-port-hint-stroke-width/);
  assert.match(registry, /--sn-node-comment-body-padding/);
  assert.match(registry, /--sn-tabs-accent/);
  assert.match(registry, /--sn-tab-accent-5/);
  assert.match(customElements, /"name": "setPanelMenuActions"/);
  assert.match(customElements, /"name": "openPanel"/);
  assert.match(customElements, /"name": "closeUiPanel"/);
  assert.match(customElements, /"name": "removeUiPanel"/);
  assert.match(customElements, /"name": "setLayoutBehavior"/);
  assert.match(customElements, /"name": "setNodeBehavior"/);
  assert.match(customElements, /"min-size-fit"/);
  assert.match(customElements, /"mobile-stack"/);
  assert.match(customElements, /not persisted into saved layout trees/);
  assert.match(customElements, /"name": "scroll-inline-active"/);
  assert.match(customElements, /"name": "scroll-block-active"/);
  assert.match(customElements, /"name": "panel-menu-action"/);
  assert.match(customElements, /"name": "layout-ui-panel-open"/);
  assert.match(customElements, /"name": "layout-ui-panel-close"/);
  assert.match(customElements, /"name": "layout-ui-panel-remove"/);
  assert.match(customElements, /"name": "sidebar-disabled"/);
  assert.match(customElements, /"name": "layout-sidebar-reset"/);
  assert.match(customElements, /Active sidebar section id reflected by setActiveSection/);
  assert.doesNotMatch(customElements, /action-zone/);
  assert.doesNotMatch(customElements, /layout-preview/);
  assert.match(customElements, /"name": "--sn-theme-pattern-brightness"/);
  assert.match(customElements, /"name": "--sn-scroll-shadow-size"/);
  assert.match(customElements, /"name": "--sn-cell-noise"/);
  assert.match(customElements, /"name": "background"/);
  assert.match(customElements, /"animated-background-slot"/);
  assert.match(customElements, /"name": "auto-trigger"/);
  assert.match(customElements, /"name": "pulse-duration"/);
  assert.match(customElements, /"name": "cell-bg-animation-trigger"/);
  assert.match(customElements, /"name": "duration"/);
  assert.match(customElements, /"name": "cell_bg_trigger"/);
  assert.match(customElements, /"name": "cell_bg_start"/);
  assert.match(customElements, /"name": "cell_bg_stop"/);
  assert.match(customElements, /"name": "--sn-composer-collapsed-control-width"/);
  assert.match(customElements, /"name": "--sn-composer-input-min-inline-size"/);
  assert.match(customElements, /"name": "auto-collapse"/);
  assert.match(customElements, /"name": "setAutoCollapse"/);
  assert.match(customElements, /"name": "--sn-chat-list-header-padding"/);
  assert.match(customElements, /"name": "--sn-chat-list-item-padding"/);
  assert.match(customElements, /"name": "--sn-chat-list-delete-size"/);
  assert.match(customElements, /"name": "--sn-chat-sidebar-header-padding"/);
  assert.match(customElements, /"name": "--sn-layout-header-gap"/);
  assert.match(customElements, /"name": "--sn-layout-header-padding"/);
  assert.match(customElements, /"name": "--sn-layout-header-min-height"/);
  assert.match(customElements, /"name": "--sn-layout-header-block-size"/);
  assert.match(customElements, /"name": "--sn-layout-header-title-size"/);
  assert.match(customElements, /"name": "--sn-layout-header-title-line-height"/);
  assert.match(customElements, /"name": "--sn-layout-header-button-size"/);
  assert.match(customElements, /"name": "--sn-layout-header-icon-size"/);
  assert.match(customElements, /"name": "--sn-layout-header-button-gap"/);
  assert.match(customElements, /"name": "--sn-layout-header-button-padding"/);
  assert.match(customElements, /"name": "--sn-layout-header-button-radius"/);
  assert.match(customElements, /"name": "--sn-layout-header-button-min-inline-size"/);
  assert.match(customElements, /"name": "--sn-layout-header-button-min-block-size"/);
  assert.match(customElements, /"name": "--sn-layout-header-button-block-size"/);
  assert.match(customElements, /"name": "--sn-layout-panel-card-bg"/);
  assert.match(customElements, /"name": "--sn-layout-panel-card-border"/);
  assert.match(customElements, /"name": "--sn-layout-panel-card-radius"/);
  assert.match(customElements, /"name": "--sn-layout-panel-card-inline-size"/);
  assert.match(customElements, /"name": "--sn-layout-panel-card-min-block-size"/);
  assert.match(customElements, /"name": "--sn-layout-sidebar-header-bg"/);
  assert.match(customElements, /"name": "--sn-layout-sidebar-header-border"/);
  assert.match(customElements, /"name": "--sn-layout-sidebar-header-button-hover-bg"/);
  assert.match(customElements, /"name": "--sn-layout-sidebar-header-button-active-bg"/);
  assert.match(customElements, /"name": "--sn-layout-sidebar-item-block-size"/);
  assert.match(customElements, /"name": "--sn-layout-sidebar-item-padding"/);
  assert.match(customElements, /"name": "--sn-chat-sidebar-row-padding"/);
  assert.match(customElements, /"name": "--sn-chat-sidebar-delete-box-size"/);
  assert.match(customElements, /"name": "--sn-node-pill-body-padding"/);
  assert.match(customElements, /"name": "--sn-node-circle-body-padding"/);
  assert.match(customElements, /"name": "--sn-node-circle-icon-size"/);
  assert.match(customElements, /"name": "--sn-node-circle-media-size"/);
  assert.match(customElements, /"name": "--sn-shape-icon-size"/);
  assert.match(customElements, /"name": "--sn-shape-stroke-width"/);
  assert.match(customElements, /"name": "--sn-shape-port-hint-stroke-width"/);
  assert.match(customElements, /"name": "--sn-node-comment-body-padding"/);
  assert.match(customElements, /Control variant: default, primary, success, danger, or icon\./);
  assert.match(customElements, /"name": "--sn-tabs-accent"/);
  assert.match(customElements, /"name": "--sn-tab-accent-5"/);
});

test('layout chrome exposes canvas motion controls and selectable tab shapes', async () => {
  const [layoutNodeSourceText, nodeCanvasSourceText, connectionRendererSourceText, canvasConnectionRendererSourceText, projectTabsCss] = await Promise.all([
    readFile(layoutNodeSource, 'utf8'),
    readFile(nodeCanvasSource, 'utf8'),
    readFile(connectionRendererSource, 'utf8'),
    readFile(canvasConnectionRendererSource, 'utf8'),
    readFile(projectTabsStyles, 'utf8'),
  ]);

  assert.match(layoutNodeSourceText, /motion: \{ id: 'motion', label: 'Motion', order: 15 \}/);
  assert.match(nodeCanvasSourceText, /group: 'motion'/);
  assert.match(nodeCanvasSourceText, /id: 'flow:run'/);
  assert.match(nodeCanvasSourceText, /id: 'flow:stop'/);
  assert.match(nodeCanvasSourceText, /id: 'flow:toggle'/);
  assert.match(nodeCanvasSourceText, /new FlowSimulator/);
  assert.match(nodeCanvasSourceText, /_scheduleConnectionSettleRefresh\(3\)/);
  assert.match(connectionRendererSourceText, /#getLocalElementCenter/);
  assert.match(connectionRendererSourceText, /nodeRect\.width && localWidth \? nodeRect\.width \/ localWidth/);
  assert.match(canvasConnectionRendererSourceText, /#getLocalElementCenter/);
  assert.match(canvasConnectionRendererSourceText, /nodeRect\.width && localWidth \? nodeRect\.width \/ localWidth/);
  assert.match(canvasConnectionRendererSourceText, /#getNodeSize/);
  assert.match(projectTabsCss, /border: 1px solid var\(--sn-tabs-item-border, transparent\)/);
  assert.match(projectTabsCss, /border-bottom: var\(--sn-tabs-item-border-bottom/);
  assert.match(projectTabsCss, /border-color: var\(--sn-tabs-active-border/);
  assert.doesNotMatch(projectTabsCss, /--sn-tabs-strip-line-display/);
  assert.doesNotMatch(projectTabsCss, /project-tabs::after/);
  assert.match(projectTabsCss, /--sn-tabs-ear-radius: var\(--sn-tabs-corner-radius/);
  assert.match(projectTabsCss, /--sn-tabs-active-corner-display: block/);
  assert.match(projectTabsCss, /--sn-tabs-active-color/);
  assert.match(projectTabsCss, /radial-gradient\(circle at 0 0/);
  assert.match(projectTabsCss, /radial-gradient\(circle at 100% 0/);
});

test('default provider exposes cascade control and scrollbar parity tokens', async () => {
  let [themeModule, css] = await Promise.all([
    import(defaultProviderThemeSource.href),
    readFile(new URL('../themes/default-provider.css', import.meta.url), 'utf8'),
  ]);
  let tokens = themeModule.DEFAULT_PROVIDER_THEME.tokens;
  let parityTokens = {
    '--sn-theme-surface-lightness': '15.1%',
    '--sn-theme-text-lightness': '98.0%',
    '--sn-lit-hover': '31.2%',
    '--sn-lit-text-dim': '67.6%',
    '--sn-lit-accent': '68.0%',
    '--sn-cat-data': 'hsl(var(--sn-hue-data) var(--sn-sat-vivid) 47.0%)',
    '--sn-type-action': 'hsl(var(--sn-hue-danger) var(--sn-sat-vivid) 82.0%)',
    '--sn-type-data': 'hsl(var(--sn-hue-accent) var(--sn-sat-vivid) 79.0%)',
    '--sn-type-docs': 'hsl(var(--sn-hue-base) var(--sn-sat-muted) 85.0%)',
    '--sn-syntax-keyword': 'hsl(var(--sn-hue-danger) var(--sn-sat-vivid) 86.0%)',
    '--sn-syntax-string': 'hsl(var(--sn-hue-warning) var(--sn-sat-vivid) 70.0%)',
  };

  for (let [name, value] of Object.entries(parityTokens)) {
    assert.equal(tokens[name], value);
    assert.ok(css.includes(`  ${name}: ${value};`), `expected ${name} in default-provider.css`);
  }

  assert.equal(tokens['--sn-theme-outline-strength'], '0');
  assert.equal(tokens['--sn-theme-variant'], 'classic');
  assert.equal(tokens['--sn-theme-type-scale'], '1');
  assert.equal(tokens['--sn-theme-heading-scale'], '1');
  assert.equal(tokens['--sn-theme-spacing-scale'], 'var(--sn-theme-density)');
  assert.equal(tokens['--sn-theme-radius-scale'], '0');
  assert.equal(tokens['--sn-theme-tab-radius-scale'], '1');
  assert.equal(tokens['--sn-theme-cell-radius-scale'], '1');
  assert.equal(tokens['--sn-theme-composer-radius-scale'], '1');
  assert.equal(tokens['--sn-theme-pattern-brightness'], '1.00');
  assert.equal(tokens['--sn-composer-radius'], 'calc(20px * var(--sn-theme-composer-radius-scale, 1))');
  assert.equal(tokens['--sn-composer-input-padding'], 'calc(4px * var(--sn-theme-density)) max(0px, calc(var(--sn-composer-radius) * 0.45))');
  assert.equal(tokens['--sn-cell-min-radius'], 'calc(2px * var(--sn-theme-cell-radius-scale, 1))');
  assert.equal(tokens['--sn-cell-max-radius'], 'calc(5px * var(--sn-theme-cell-radius-scale, 1))');
  assert.equal(tokens['--sn-motion-enabled'], '1');
  assert.equal(tokens['--sn-animation-play-state'], 'running');
  assert.equal(tokens['--sn-animation-duration-scale'], '1');
  assert.equal(tokens['--sn-animation-duration-fast'], 'calc(600ms * var(--sn-animation-duration-scale))');
  assert.equal(tokens['--sn-animation-duration-slow'], 'calc(1500ms * var(--sn-animation-duration-scale))');
  assert.equal(tokens['--sn-transition-easing'], 'ease');
  assert.equal(tokens['--sn-engine-state-color'], 'var(--sn-engine-idle-color)');
  assert.equal(tokens['--sn-engine-state-bg'], 'var(--sn-sys-surface-raised)');
  assert.equal(tokens['--sn-engine-state-border'], 'var(--sn-sys-outline)');
  assert.equal(tokens['--sn-button-primary-color'], 'hsl(0 0% 8%)');
  assert.equal(tokens['--sn-button-success-color'], 'hsl(0 0% 8%)');
  assert.equal(tokens['--sn-button-danger-hover-color'], 'hsl(0 0% 8%)');
  assert.equal(tokens['--sn-tab-accent-0'], 'var(--sn-cat-server)');
  assert.equal(tokens['--sn-tab-accent-1'], 'var(--sn-cat-data)');
  assert.equal(tokens['--sn-tab-accent-2'], 'var(--sn-cat-control)');
  assert.equal(tokens['--sn-tab-accent-3'], 'var(--sn-cat-instance)');
  assert.equal(tokens['--sn-tab-accent-4'], 'var(--sn-type-action)');
  assert.equal(tokens['--sn-tab-accent-5'], 'var(--sn-cat-class)');
  assert.equal(tokens['--sn-tabs-shape'], 'classic-ear');
  assert.equal(tokens['--sn-tabs-active-color'], 'var(--sn-sys-on-surface)');
  assert.equal(tokens['--sn-tabs-active-border'], 'transparent');
  assert.equal(tokens['--sn-tabs-corner-radius'], 'calc(8px * var(--sn-theme-density, 1) * var(--sn-theme-tab-radius-scale, 1))');
  assert.equal(tokens['--sn-tabs-radius'], 'var(--sn-tabs-corner-radius)');
  assert.equal(tokens['--sn-layout-menu-row-height'], 'calc(30px * var(--sn-theme-density))');
  assert.equal(tokens['--sn-layout-menu-row-label-width'], 'calc(66px * var(--sn-theme-density))');
  assert.equal(tokens['--sn-layout-menu-action-height'], 'calc(28px * var(--sn-theme-density))');
  assert.equal(tokens['--sn-layout-menu-action-size'], 'calc(12px * var(--sn-theme-type-scale))');
  assert.equal(tokens['--sn-layout-menu-icon-size'], 'calc(16px * var(--sn-theme-type-scale))');
  assert.equal(tokens['--sn-panel-radius'], 'var(--sn-node-radius)');
  assert.equal(tokens['--sn-panel-shadow'], 'var(--sn-shadow-md)');
  assert.equal(tokens['--sn-scrollbar-width'], 'thin');
  assert.equal(tokens['--sn-scrollbar-size'], '10px');
  assert.equal(tokens['--sn-scrollbar-radius'], '999px');
  assert.equal(tokens['--sn-scrollbar-thumb-border'], '3px solid transparent');
  assert.equal(tokens['--sn-scrollbar-thumb-min-size'], '36px');
  assert.equal(tokens['--sn-scroll-shadow-size'], '14px');
  assert.equal(tokens['--sn-transition-fast'], 'calc(120ms * var(--sn-theme-motion-scale))');
  assert.equal(tokens['--sn-transition-normal'], 'calc(240ms * var(--sn-theme-motion-scale))');
  assert.equal(tokens['--sn-transition-slow'], 'calc(400ms * var(--sn-theme-motion-scale))');
  assert.equal(tokens['--sn-effect-hover-transition'], 'background-color var(--sn-transition-fast) var(--sn-transition-easing), border-color var(--sn-transition-fast) var(--sn-transition-easing), color var(--sn-transition-fast) var(--sn-transition-easing)');
  assert.match(css, /--sn-theme-outline-strength: 0;/);
  assert.match(css, /--sn-theme-type-scale: 1;/);
  assert.match(css, /--sn-theme-heading-scale: 1;/);
  assert.match(css, /--sn-theme-spacing-scale: var\(--sn-theme-density\);/);
  assert.match(css, /--sn-theme-radius-scale: 0;/);
  assert.match(css, /--sn-theme-cell-radius-scale: 1;/);
  assert.match(css, /--sn-theme-composer-radius-scale: 1;/);
  assert.match(css, /--sn-theme-pattern-brightness: 1\.00;/);
  assert.match(css, /--sn-composer-radius: calc\(20px \* var\(--sn-theme-composer-radius-scale, 1\)\);/);
  assert.match(css, /--sn-composer-input-padding: calc\(4px \* var\(--sn-theme-density\)\) max\(0px, calc\(var\(--sn-composer-radius\) \* 0\.45\)\);/);
  assert.match(css, /--sn-cell-min-radius: calc\(2px \* var\(--sn-theme-cell-radius-scale, 1\)\);/);
  assert.match(css, /--sn-cell-max-radius: calc\(5px \* var\(--sn-theme-cell-radius-scale, 1\)\);/);
  assert.match(css, /--sn-button-primary-color: hsl\(0 0% 8%\);/);
  assert.match(css, /--sn-button-success-color: hsl\(0 0% 8%\);/);
  assert.match(css, /--sn-button-danger-hover-color: hsl\(0 0% 8%\);/);
  assert.match(css, /--sn-tab-accent-0: var\(--sn-cat-server\);/);
  assert.match(css, /--sn-tab-accent-5: var\(--sn-cat-class\);/);
  assert.match(css, /--sn-layout-menu-row-height: calc\(30px \* var\(--sn-theme-density\)\);/);
  assert.match(css, /--sn-layout-menu-action-height: calc\(28px \* var\(--sn-theme-density\)\);/);
  assert.match(css, /--sn-layout-menu-icon-size: calc\(16px \* var\(--sn-theme-type-scale\)\);/);
  assert.match(css, /--sn-panel-shadow: var\(--sn-shadow-md\);/);
  assert.match(css, /--sn-scroll-shadow-size: 14px;/);
  assert.match(css, /--sn-transition-fast: calc\(120ms \* var\(--sn-theme-motion-scale\)\);/);
  assert.match(css, /--sn-transition-normal: calc\(240ms \* var\(--sn-theme-motion-scale\)\);/);
  assert.match(css, /--sn-transition-slow: calc\(400ms \* var\(--sn-theme-motion-scale\)\);/);
  assert.match(css, /--sn-motion-enabled: 1;/);
  assert.match(css, /--sn-animation-play-state: running;/);
  assert.match(css, /--sn-animation-duration-fast: calc\(600ms \* var\(--sn-animation-duration-scale\)\);/);
  assert.match(css, /--sn-animation-duration-slow: calc\(1500ms \* var\(--sn-animation-duration-scale\)\);/);
  assert.match(css, /--sn-transition-easing: ease;/);
  assert.match(css, /\[data-engine-state="idle"\]/);
  assert.match(css, /\[data-engine-state="running"\]/);
  assert.match(css, /animation-play-state: var\(--sn-animation-play-state, running\);/);
  assert.match(css, /\[data-engine-state="success"\]/);
  assert.match(css, /\[data-engine-state="error"\]/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
});

test('motion preset layer has default, smooth, fast, and disabled configurations', async () => {
  const themeModule = await import(new URL('../themes/Theme.js', import.meta.url).href);

  assert.equal(themeModule.DEFAULT_MOTION.name, 'default');
  assert.equal(themeModule.DEFAULT_MOTION.motion['--sn-theme-motion-scale'], '1.00');
  assert.equal(themeModule.DEFAULT_MOTION.motion['--sn-motion-enabled'], '1');
  assert.equal(themeModule.DEFAULT_MOTION.motion['--sn-animation-play-state'], 'running');
  assert.equal(themeModule.DEFAULT_MOTION.motion['--sn-animation-duration-slow'], '1500ms');
  assert.equal(themeModule.DEFAULT_MOTION.motion['--sn-transition-fast'], '120ms');

  assert.equal(themeModule.SMOOTH_MOTION.name, 'smooth');
  assert.equal(themeModule.SMOOTH_MOTION.motion['--sn-theme-motion-scale'], '1.20');
  assert.equal(themeModule.SMOOTH_MOTION.motion['--sn-transition-easing'], 'cubic-bezier(0.25, 1, 0.5, 1)');

  assert.equal(themeModule.FAST_MOTION.name, 'fast');
  assert.equal(themeModule.FAST_MOTION.motion['--sn-theme-motion-scale'], '0.60');

  assert.equal(themeModule.DISABLED_MOTION.name, 'disabled');
  assert.equal(themeModule.DISABLED_MOTION.motion['--sn-theme-motion-scale'], '0.00');
  assert.equal(themeModule.DISABLED_MOTION.motion['--sn-motion-enabled'], '0');
  assert.equal(themeModule.DISABLED_MOTION.motion['--sn-animation-play-state'], 'paused');
  assert.equal(themeModule.DISABLED_MOTION.motion['--sn-animation-duration-scale'], '0.00');
  assert.equal(themeModule.DISABLED_MOTION.motion['--sn-animation-duration-slow'], '0ms');
  assert.equal(themeModule.DISABLED_MOTION.motion['--sn-transition-fast'], '0ms');

  const element = {
    styles: new Map(),
    style: {
      setProperty(name, value) {
        element.styles.set(name, value);
      }
    }
  };
  themeModule.applyMotion(element, themeModule.SMOOTH_MOTION);
  assert.equal(element.styles.get('--sn-theme-motion-scale'), '1.20');
  assert.equal(element.styles.get('--sn-transition-easing'), 'cubic-bezier(0.25, 1, 0.5, 1)');
});

test('theme metadata exposes provider-neutral motion and engine state contracts', async () => {
  const [source, catalog] = await Promise.all([
    readFile(themeCatalogSource, 'utf8'),
    import(themeCatalogSource.href),
  ]);

  let metadata = catalog.THEME_METADATA['default-provider'];
  assert.equal(metadata.description.includes('Agent Portal'), false);
  assert.equal(metadata.origin.includes('Symbiote Node'), false);
  assert.deepEqual(metadata.engineStates, ['idle', 'running', 'success', 'error']);
  assert.ok(metadata.controlTokens.includes('--sn-motion-enabled'));
  assert.ok(metadata.controlTokens.includes('--sn-theme-cell-radius-scale'));
  assert.ok(metadata.controlTokens.includes('--sn-theme-composer-radius-scale'));
  assert.ok(metadata.controlTokens.includes('--sn-scroll-shadow-size'));
  assert.ok(metadata.controlTokens.includes('--sn-animation-play-state'));
  assert.ok(metadata.controlTokens.includes('--sn-animation-duration-slow'));
  assert.ok(catalog.THEME_ELEMENT_GROUPS.some((group) => group.name === 'engine-state'));
  assert.ok(catalog.THEME_RULE_BLOCKS.some((block) => block.name === 'default-provider-engine-state-cascade'));
  assert.match(source, /"symbioteUi"/);
  assert.doesNotMatch(source, /Agent Portal shell values/);
  assert.doesNotMatch(source, /Symbiote Node tokens/);
});

test('side-scroll contracts are explicit across reusable surfaces', async () => {
  let [
    layout,
    layoutSourceText,
    nodeCanvas,
    graphNode,
    chatComposer,
    chatTranscript,
    chatMessage,
    treeView,
    listDetailShell,
    dataTable,
    sourceViewer,
    codeBlock,
    themeEditor,
  ] = await Promise.all([
    readFile(layoutStyles, 'utf8'),
    readFile(layoutSource, 'utf8'),
    readFile(nodeCanvasStyles, 'utf8'),
    readFile(graphNodeStyles, 'utf8'),
    readFile(chatComposerStyles, 'utf8'),
    readFile(chatTranscriptStyles, 'utf8'),
    readFile(chatMessageItemStyles, 'utf8'),
    readFile(treeViewStyles, 'utf8'),
    readFile(listDetailShellStyles, 'utf8'),
    readFile(dataTableStyles, 'utf8'),
    readFile(sourceViewerStyles, 'utf8'),
    readFile(codeBlockStyles, 'utf8'),
    readFile(cascadeThemeEditorStyles, 'utf8'),
  ]);

  assert.match(layoutSourceText, /scroll-inline-active/);
  assert.match(layoutSourceText, /scroll-block-active/);
  assert.match(layoutSourceText, /setStylePropertyIfChanged/);
  assert.match(layout, /\[scroll-inline-active\]/);
  assert.match(layout, /\[scroll-block-active\]/);
  assert.match(layout, /\[scroll-inline-active\]\[scroll-block-active\]/);
  assert.doesNotMatch(layout, /\[responsive-active\]\[responsive-mode='stack'\]\s*\{\s*overflow-x: hidden;/);
  assert.match(nodeCanvas, /contain: size layout paint/);
  assert.match(nodeCanvas, /\[data-flow-scroll='horizontal'\][\s\S]*overflow-x: auto/);
  assert.doesNotMatch(nodeCanvas, /themedScrollFade(Block|Inline)Styles/);
  assert.match(graphNode, /min-width: var\(--sn-node-min-width/);
  assert.match(graphNode, /overflow-y: auto/);
  assert.match(chatComposer, /container: composer-body \/ inline-size/);
  assert.match(chatComposer, /flex-wrap: wrap/);
  assert.match(chatComposer, /max-width: min\(var\(--sn-composer-voice-command-max/);
  assert.match(chatTranscript, /overflow-y: auto/);
  assert.match(chatMessage, /max-width: 100%/);
  assert.match(chatMessage, /overflow-x: auto/);
  assert.match(treeView, /grid-template-columns: var\(--sn-tree-toggle-width\) var\(--sn-tree-icon-width\) minmax\(0, 1fr\)/);
  assert.match(treeView, /text-overflow: ellipsis/);
  assert.match(listDetailShell, /grid-template-columns: var\(--sn-list-detail-sidebar-width\) minmax\(0, 1fr\)/);
  assert.match(listDetailShell, /overflow: auto/);
  assert.match(dataTable, /\.sn-data-table-scroll[\s\S]*overflow: auto/);
  assert.match(dataTable, /min-width: var\(--sn-data-table-min-width\)/);
  assert.match(sourceViewer, /overflow: hidden/);
  assert.match(sourceViewer, /text-overflow: ellipsis/);
  assert.match(codeBlock, /\.cb-scroll[\s\S]*overflow: auto/);
  assert.match(codeBlock, /\.md-code-block[\s\S]*overflow-x: auto/);
  assert.match(themeEditor, /\.cte-controls[\s\S]*overflow: auto/);
  assert.match(themeEditor, /\.cte-params[\s\S]*overflow: auto/);
  assert.match(themeEditor, /\.cte-controls::-webkit-scrollbar/);
});

test('scroll edge fade is available on reusable scroll hosts', async () => {
  let scrollFade = await readFile(scrollFadeSource, 'utf8');
  assert.match(scrollFade, /--sn-scroll-shadow-size/);
  assert.match(scrollFade, /themedScrollFadeBlockStyles/);
  assert.match(scrollFade, /themedScrollFadeInlineStyles/);
  assert.match(scrollFade, /data-sn-scroll-fade-active/);
  assert.match(scrollFade, /scrollHeight > element\.clientHeight/);
  assert.match(scrollFade, /scrollWidth > element\.clientWidth/);

  let scrollFadeHosts = [
    '../board/KanbanBoard/KanbanBoard.css.js',
    '../canvas/GraphExplorerShell/GraphExplorerShell.css.js',
    '../canvas/GraphTabs/GraphTabs.css.js',
    '../canvas/NodeSearch/NodeSearch.css.js',
    '../site/catalog/css/index.css.js',
    '../chat/ChatComposer/ChatComposer.css.js',
    '../chat/ChatList/ChatList.css.js',
    '../chat/ChatMessageItem/ChatMessageItem.css.js',
    '../chat/ChatSidebar/ChatSidebar.css.js',
    '../chat/ChatTranscript/ChatTranscript.css.js',
    '../control/Combobox/Combobox.css.js',
    '../control/Mentions/Mentions.css.js',
    '../control/RichTextEditor/RichTextEditor.css.js',
    '../control/SegmentedControl/SegmentedControl.css.js',
    '../control/Select/Select.css.js',
    '../control/Transfer/Transfer.css.js',
    '../display/Carousel/Carousel.css.js',
    '../display/CodeBlock/CodeBlock.css.js',
    '../display/DataTable/DataTable.css.js',
    '../display/EventFeed/EventFeed.css.js',
    '../display/SourceDiff/SourceDiff.css.js',
    '../inspector/InspectorPanel/InspectorPanel.css.js',
    '../layout/FloatingPanel/FloatingPanel.css.js',
    '../layout/Layout/Layout.css.js',
    '../layout/LayoutNode/LayoutNode.css.js',
    '../layout/LayoutSidebar/LayoutSidebar.css.js',
    '../layout/ProjectTabs/ProjectTabs.css.js',
    '../layout/SplitPanel/SplitPanel.css.js',
    '../list/ListDetailShell/ListDetailShell.css.js',
    '../list/Listbox/Listbox.css.js',
    '../navigation/QuickOpen/QuickOpen.css.js',
    '../node/GraphNode/GraphNode.css.js',
    '../notifications/NotificationEditor/NotificationEditor.css.js',
    '../notifications/NotificationWidget/NotificationWidget.css.js',
    '../palette/PaletteBrowser/PaletteBrowser.css.js',
    '../surface/Dialog/Dialog.css.js',
    '../surface/Drawer/Drawer.css.js',
    '../themes/CascadeThemeEditor/CascadeThemeEditor.css.js',
    '../themes/CascadeThemeWidget/CascadeThemeWidget.css.js',
    '../tree/TreePanel/TreePanel.css.js',
  ];
  let hostSources = await Promise.all(scrollFadeHosts.map((path) => readFile(new URL(path, import.meta.url), 'utf8')));
  for (let index = 0; index < scrollFadeHosts.length; index += 1) {
    assert.match(hostSources[index], /themedScrollFade(Block|Inline)Styles/, scrollFadeHosts[index]);
  }

  let timelineEditor = await readFile(new URL('../timeline/TimelineEditor/TimelineEditor.css.js', import.meta.url), 'utf8');
  assert.doesNotMatch(timelineEditor, /themedScrollFade(Block|Inline)Styles/);

  let scrollArea = await readFile(new URL('../layout/ScrollArea/ScrollArea.css.js', import.meta.url), 'utf8');
  assert.match(scrollArea, /sn-scroll-area:not\(:has\(> \.sn-scroll-container\)\) \{[\s\S]*?themedScrollFadeBlockStyles/);
  assert.doesNotMatch(scrollArea, /\.sn-scroll-viewport \{[\s\S]*?themedScrollFadeBlockStyles/);
});

test('chat composer exposes reusable voice controls and agent-facing metadata', async () => {
  const [composer, styles, registry, customElements, registryModule] = await Promise.all([
    readFile(chatComposerSource, 'utf8'),
    readFile(chatComposerStyles, 'utf8'),
    readFile(componentRegistrySource, 'utf8'),
    readFile(customElementsSource, 'utf8'),
    import(componentRegistrySource.href),
  ]);

  assert.match(composer, /setVoiceControls\(config = \{\}\)/);
  assert.match(composer, /setFooterControls\(controls = \[\]\)/);
  assert.match(composer, /setLeadingControls\(controls = \[\]\)/);
  assert.match(composer, /function normalizeFooterDetails\(details = null\)/);
  assert.match(composer, /function normalizeDetailSegments\(segments = \[\]\)/);
  assert.match(composer, /hasOwnProperty\.call\(control \|\| \{\}, 'label'\) \? control\.label : id/);
  assert.match(composer, /suffixText = String\(item\.suffix \|\| item\.meta \|\| ''\)/);
  assert.match(composer, /hasSuffix: Boolean\(suffixText\)/);
  assert.match(composer, /let hasMeter = Boolean\(item\.meter \|\| details\)/);
  assert.match(composer, /toggleFooterDetails\(id\)/);
  assert.match(composer, /closeFooterDetails\(\)/);
  assert.match(composer, /onFooterDetailsRowsToggle/);
  assert.match(composer, /onFooterDetailsUsageToggle/);
  assert.match(composer, /chat-composer-footer-details-toggle/);
  assert.match(composer, /_bindFooterDetailsDismiss\(\)/);
  assert.match(composer, /setVoiceInputState/);
  assert.match(composer, /setWakeListenState/);
  assert.match(composer, /setVoiceResponseState/);
  assert.match(composer, /setVoiceCommandState/);
  assert.match(composer, /setVoiceLanguageState/);
  assert.match(composer, /getVoicePreviewText/);
  assert.match(composer, /getVoiceControlElements/);
  assert.match(composer, /chat-composer-permission-intent/);
  assert.match(composer, /chat-composer-recorder-intent/);
  assert.match(composer, /chat-composer-transcription-intent/);
  assert.match(composer, /chat-composer-voice-input/);
  assert.match(composer, /chat-composer-wake-listen/);
  assert.match(composer, /chat-composer-voice-response-toggle/);
  assert.match(composer, /chat-composer-voice-command-toggle/);
  assert.match(composer, /chat-composer-voice-language-change/);
  assert.match(composer, /chat-composer-footer-control/);
  assert.match(composer, /chat-composer-leading-control/);
  assert.match(composer, /chat-composer-footer-control-change/);
  assert.match(composer, /chat-composer-stop/);
  assert.match(composer, /if \(this\.\$\.isSending\) \{[\s\S]*emit\(this, 'chat-composer-stop'/);
  assert.match(composer, /<div class="context-chip" \$\{\{ '@title': 'title' \}\}>/);
  assert.match(composer, /if \(action === 'start'\) \{\n\s+this\._voiceCommandMode = true;\n\s+this\._localVoiceActiveMode = 'wake'/);
  assert.match(composer, /_handleDefaultVoiceApprove/);
  assert.match(composer, /_showLocalRecordingPreview\(''\)/);
  assert.match(composer, /_showLocalWakePreview\(\)/);
  assert.match(composer, /Listening for "\$\{this\._getWakeCommandPhrase\(\)\}"/);
  assert.match(composer, /wake matched/);
  assert.match(composer, /restartSpeechRecognition/);
  assert.match(composer, /_formatVoiceElapsed/);
  assert.match(composer, /_localVoiceControlsManaged/);
  assert.match(composer, /emit\(this, 'chat-composer-submit'\)/);
  assert.match(composer, /_syncVoiceCommand\(\{ visible = false, enabled = true/);
  assert.match(composer, /_syncVoiceLanguage\(\{ visible = false, enabled = true/);
  assert.match(composer, /btn\.disabled = Boolean\(this\.\$\.disabled\) \|\| !enabled/);
  assert.match(composer, /data-footer-control-id/);
  assert.match(composer, /data-footer-details-id/);
  assert.match(composer, /data-leading-control-id/);
  assert.match(composer, /footerControlId/);
  assert.match(composer, /aria-controls="composer-footer-details-popover"/);
  assert.match(composer, /@aria-expanded': 'detailsExpanded'/);
  assert.match(composer, /normalizedState === 'listening'/);
  assert.match(composer, /normalizedState === 'transcribing'/);
  assert.match(composer, /normalizedState === 'disabled'/);
  assert.match(composer, /class="btn-mic"/);
  assert.match(composer, /class="btn-wake-listen"/);
  assert.match(composer, /class="btn-voice-response"/);
  assert.match(composer, /class="btn-voice-command"/);
  assert.match(composer, /class="btn-voice-language"/);
  assert.match(composer, /class="composer-actions"/);
  assert.match(composer, /class="composer-leading-controls"/);
  assert.match(composer, /class="composer-footer-suffix"/);
  assert.match(composer, /class="composer-footer-meter"/);
  assert.match(composer, /class="composer-footer-details-popover"/);
  assert.match(composer, /class="composer-footer-details-head"/);
  assert.match(composer, /composer-footer-details-toggle/);
  assert.match(composer, /footerDetailsRowsCollapsed/);
  assert.match(composer, /footerDetailsUsageCollapsed/);
  assert.match(composer, /footerDetailsHasUsageToggle/);
  assert.match(composer, /footerDetailsRowsToggleIcon/);
  assert.match(composer, /footerDetailsUsageToggleIcon/);
  assert.match(composer, /ref="footerDetails"/);
  assert.match(composer, /<textarea[\s\S]*<\/textarea>\s*<div class="composer-footer"/);
  assert.match(composer, /<div class="composer-footer"[\s\S]*<section id="composer-footer-details-popover"[\s\S]*<div class="composer-actions"/);
  assert.match(composer, /labelText \? 'has-label' : 'icon-only'/);
  assert.match(composer, /item\.compact \? 'composer-leading-collapsed' : ''/);
  assert.match(composer, /<\/div>\s*<button class="btn-mic"[\s\S]*<sn-button class="btn-send"/);
  assert.match(styles, /\.btn-mic\[hidden\]/);
  assert.match(styles, /\.btn-wake-listen\[hidden\]/);
  assert.match(styles, /\.btn-voice-command\[disabled\]/);
  assert.match(styles, /\.btn-voice-language\[disabled\]/);
  assert.match(styles, /\.btn-mic[\s\S]*order: 60/);
  assert.match(styles, /\.btn-wake-listen[\s\S]*order: 20/);
  assert.match(styles, /\.btn-voice-response[\s\S]*order: 30/);
  assert.match(styles, /\.btn-voice-command[\s\S]*order: 40/);
  assert.match(styles, /\.btn-voice-language[\s\S]*order: 50/);
  assert.match(styles, /\.composer-footer-btn\.active/);
  assert.match(styles, /\.composer-footer-item/);
  assert.match(styles, /\.composer-footer-meter/);
  assert.match(styles, /--sn-composer-context-meter-thickness/);
  assert.match(styles, /conic-gradient\(var\(--sn-sys-accent\) var\(--composer-meter-progress\)/);
  assert.match(styles, /\.composer-footer-details-popover/);
  assert.match(styles, /\.composer-footer-details-head/);
  assert.match(styles, /\.composer-footer-details-track/);
  assert.match(styles, /\.composer-footer-details-toggle/);
  assert.match(styles, /\.composer-footer-details-rows\[hidden\]/);
  assert.match(styles, /\.composer-footer-detail-row/);
  assert.match(styles, /\.composer-footer-usage-row/);
  assert.match(styles, /\.composer-footer-divider-before/);
  assert.match(styles, /\.composer-footer-optional/);
  assert.match(styles, /\.composer-param-model\.composer-compact-value/);
  assert.match(styles, /\.composer-param-model\.composer-long-value/);
  assert.match(styles, /\.composer-leading-btn\.active/);
  assert.match(styles, /\.composer-footer-value/);
  assert.match(styles, /\.composer-footer-suffix/);
  assert.match(styles, /\.composer-footer-checkbox/);
  assert.match(styles, /container: composer-body \/ inline-size/);
  assert.match(styles, /grid-template-rows: minmax\(var\(--sn-composer-input-min-height\), auto\) auto/);
  assert.match(styles, /grid-template-columns: auto minmax\(0, 1fr\) auto auto auto/);
  assert.match(styles, /min-block-size: calc\(var\(--sn-composer-send-size\) \* 2\.75\)/);
  assert.match(styles, /\[leading-controls\][\s\S]*padding-inline-start: var\(--sn-composer-body-leading-padding-inline-start, 8px\)/);
  assert.match(styles, /\.composer-leading-controls[\s\S]*display: none/);
  assert.match(styles, /\[leading-controls\][\s\S]*\.composer-leading-controls[\s\S]*display: flex/);
  assert.match(styles, /\.composer-actions[\s\S]*justify-self: flex-end/);
  assert.match(styles, /\.composer-actions[\s\S]*align-self: end/);
  assert.match(styles, /\.composer-actions[\s\S]*flex-wrap: nowrap/);
  assert.match(styles, /\.composer-actions[\s\S]*max-width: min\(54cqi/);
  assert.match(styles, /\.composer-body textarea \{[\s\S]*grid-column: 1 \/ -1;[\s\S]*grid-row: 1/);
  assert.match(styles, /\.composer-leading-controls \{[\s\S]*grid-column: 1;[\s\S]*grid-row: 2/);
  assert.match(styles, /\.composer-footer \{[\s\S]*grid-column: 2;[\s\S]*grid-row: 2/);
  assert.match(styles, /\.composer-footer \{[\s\S]*flex-wrap: nowrap/);
  assert.match(styles, /\.composer-actions \{[\s\S]*grid-column: 3;[\s\S]*grid-row: 2/);
  assert.match(styles, /\.btn-mic \{[\s\S]*grid-column: 4;[\s\S]*grid-row: 2/);
  assert.match(styles, /\.composer-body > sn-button\.btn-send[\s\S]*grid-column: 5/);
  assert.match(styles, /\.composer-body > sn-button\.btn-send[\s\S]*grid-row: 2/);
  assert.match(styles, /\.composer-leading-btn\.icon-only/);
  assert.match(styles, /\.composer-leading-btn\.composer-leading-collapsed/);
  assert.match(styles, /@container composer-body \(width <= 960px\)/);
  assert.match(styles, /container: chat-composer \/ inline-size/);
  assert.match(styles, /@container chat-composer \(width <= 480px\)/);
  assert.doesNotMatch(styles, /grid-template-rows:[^;]*auto auto auto/);
  assert.doesNotMatch(styles, /grid-row: 3/);
  assert.match(styles, /@container style\(--sn-is-collapsed: 1\)/);
  assert.match(styles, /\.composer-footer-select \{[\s\S]*position: absolute;[\s\S]*inset: 0;[\s\S]*opacity: 0/);
  assert.match(composer, /<select class="composer-footer-select"[^>]*'@aria-label': 'accessibleName'/);
  assert.match(composer, /<input class="composer-footer-checkbox"[^>]*'@aria-label': 'accessibleName'/);
  assert.match(styles, /@container composer-body \(width <= 340px\)/);
  assert.match(styles, /36cqi/);
  assert.match(styles, /38cqi/);
  assert.match(styles, /--sn-composer-input-min-inline-size/);
  assert.match(styles, /box-sizing: border-box/);
  assert.match(styles, /--sn-composer-wake-command-max/);
  assert.doesNotMatch(styles, /28vw/);
  assert.match(registry, /component-descriptor-v2/);
  for (const tagName of [
    'chat-workspace',
    'chat-message-item',
    'chat-transcript',
    'chat-composer',
    'chat-list',
    'chat-list-item',
    'chat-sidebar-shell',
    'chat-sidebar-item',
    'cell-bg',
  ]) {
    assert.match(
      registry,
      new RegExp(`\\{\\s*tagName: '${tagName}'[\\s\\S]*?schemaVersion: 'component-descriptor-v2'`)
    );
  }
  assert.match(registry, /voice-controls/);
  assert.match(registry, /permission-intents/);
  assert.match(registry, /recorder-intents/);
  assert.match(registry, /transcription-intents/);
  assert.match(registry, /footer-control-intents/);
  assert.match(registry, /leading-control-intents/);
  assert.match(registry, /leading-control-intent-router/);
  assert.match(registry, /setLeadingControls/);
  assert.match(registry, /chat_composer_leading_control/);
  assert.match(registry, /setFooterControls/);
  assert.match(registry, /chat_composer_voice_control/);
  assert.match(registry, /chat_composer_voice_flow/);
  assert.match(registry, /chat_composer_footer_control/);
  assert.match(registry, /chat-composer-permission-intent/);
  assert.match(registry, /chat-composer-recorder-intent/);
  assert.match(registry, /chat-composer-transcription-intent/);
  assert.match(registry, /chat-composer-footer-control-change/);
  assert.match(registry, /chat-composer-leading-control/);
  assert.match(registry, /chat-composer-stop/);
  assert.match(registry, /chat-workspace-stop/);
  assert.match(registry, /anchorRect/);
  assert.match(registry, /listening/);
  assert.match(registry, /transcribing/);
  assert.match(registry, /preview-approve/);
  assert.match(registry, /preview-cancel/);
  assert.match(registry, /preview-send/);
  assert.match(registry, /chat-composer-voice-language-change/);
  assert.match(customElements, /"name": "setVoiceControls"/);
  assert.match(customElements, /"name": "setLeadingControls"/);
  assert.match(customElements, /"name": "setFooterControls"/);
  assert.match(customElements, /"name": "getVoicePreviewText"/);
  assert.match(customElements, /"name": "chat-composer-voice-input"/);
  assert.match(customElements, /"name": "chat-composer-permission-intent"/);
  assert.match(customElements, /"name": "chat-composer-recorder-intent"/);
  assert.match(customElements, /"name": "chat-composer-transcription-intent"/);
  assert.match(customElements, /"name": "chat-composer-footer-control"/);
  assert.match(customElements, /"name": "chat-composer-leading-control"/);
  assert.match(customElements, /"name": "chat-composer-stop"/);
  assert.match(customElements, /"name": "chat-workspace-stop"/);
  assert.match(customElements, /"name": "anchorRect"/);
  assert.match(customElements, /"name": "chat_composer_voice_flow"/);
  assert.match(customElements, /"name": "chat_composer_leading_control"/);
  assert.match(customElements, /"name": "chat_composer_footer_control"/);
  assert.match(customElements, /"name": "--sn-composer-send-icon-size"/);
  assert.match(customElements, /"name": "--sn-composer-collapsed-control-padding"/);
  assert.match(customElements, /"name": "--sn-composer-wake-command-max"/);

  let component = registryModule.getComponent('chat-composer');
  let eventByName = new Map(component.contract.events.map((event) => [event.name, event]));
  assert.deepEqual(
    eventByName.get('chat-composer-permission-intent').detail.map((item) => item.name),
    ['action', 'permission', 'reason', 'source']
  );
  assert.deepEqual(
    eventByName.get('chat-composer-recorder-intent').detail.map((item) => item.name),
    ['action', 'currentState', 'mode', 'permission', 'source']
  );
  assert.deepEqual(
    eventByName.get('chat-composer-transcription-intent').detail.map((item) => item.name),
    ['action', 'source', 'mode', 'text']
  );
  assert.deepEqual(
    eventByName.get('chat-composer-audio-captured').detail.map((item) => item.name),
    ['blob', 'mimeType']
  );
  assert.deepEqual(
    eventByName.get('chat-composer-leading-control').detail.map((item) => item.name),
    ['id', 'kind', 'value', 'anchorRect']
  );
  let voiceFlowTool = component.contract.webmcp.tools.find((tool) => tool.name === 'chat_composer_voice_flow');
  assert.ok(voiceFlowTool);
  assert.match(voiceFlowTool.description, /VoiceRuntime/);
  assert.doesNotMatch(voiceFlowTool.description, /component emits intents only/);
  assert.deepEqual(voiceFlowTool.inputSchema.properties.flow.enum, ['permission', 'recorder', 'transcription']);
  assert.deepEqual(voiceFlowTool.inputSchema.properties.permission.enum, ['microphone']);
  let customCatalog = JSON.parse(customElements);
  let customComposer = customCatalog.modules
    .flatMap((moduleRecord) => moduleRecord.declarations || [])
    .find((declaration) => declaration.tagName === 'chat-composer');
  assert.deepEqual(
    customComposer.metadata.contract.webmcp.tools.map((tool) => tool.name),
    ['chat_composer_submit', 'chat_composer_voice_control', 'chat_composer_voice_flow', 'chat_composer_footer_control', 'chat_composer_leading_control']
  );
  assert.deepEqual(
    customComposer.events.find((event) => event.name === 'chat-composer-recorder-intent').detail.map((item) => item.name),
    ['action', 'currentState', 'mode', 'permission', 'source']
  );
  assert.ok(customComposer.events.some((event) => event.name === 'chat-composer-audio-captured'));
  let customVoiceFlowTool = customComposer.metadata.contract.webmcp.tools
    .find((tool) => tool.name === 'chat_composer_voice_flow');
  assert.match(customVoiceFlowTool.description, /VoiceRuntime/);
  assert.doesNotMatch(customVoiceFlowTool.description, /component emits intents only/);
});

test('chat workspace composes reusable chat surfaces and exposes host intent contract', async () => {
  const [workspace, navTree, template, styles, transcriptStyles, registry, customElements, registryModule] = await Promise.all([
    readFile(chatWorkspaceSource, 'utf8'),
    readFile(chatNavTreeSource, 'utf8'),
    readFile(chatWorkspaceTemplate, 'utf8'),
    readFile(chatWorkspaceStyles, 'utf8'),
    readFile(chatTranscriptStyles, 'utf8'),
    readFile(componentRegistrySource, 'utf8'),
    readFile(customElementsSource, 'utf8'),
    import(componentRegistrySource.href),
  ]);

  assert.match(workspace, /ChatSidebar\/ChatSidebar\.js/);
  assert.match(workspace, /ChatTranscript\/ChatTranscript\.js/);
  assert.match(workspace, /ChatComposer\/ChatComposer\.js/);
  assert.match(workspace, /effects\/CellBg\/CellBg\.js/);
  assert.match(workspace, /normalizeChatNavItem/);
  assert.match(navTree, /export function buildChatNavTree/);
  assert.match(navTree, /statusMeta/);
  assert.match(navTree, /labels/);
  assert.match(template, /<chat-sidebar-shell/);
  assert.match(template, /<chat-transcript/);
  assert.match(template, /<cell-bg[\s\S]*class="chat-workspace-bg"/);
  assert.doesNotMatch(template, /auto-trigger="false"/);
  assert.match(template, /<chat-composer/);
  assert.match(styles, /container: chat-workspace \/ inline-size/);
  assert.match(styles, /background: var\(--sn-chat-bg\)/);
  assert.match(styles, /\.chat-workspace-bg/);
  assert.match(styles, /--sn-chat-bg: transparent/);
  assert.match(styles, /--sn-chat-sidebar-width/);
  assert.match(styles, /--sn-chat-empty-composer-max-width/);

  for (const method of [
    'setWorkspaceState',
    'setChats',
    'setActiveChatId',
    'setEmpty',
    'setMessages',
    'replaceMessageWindow',
    'prependMessages',
    'getMessageWindow',
    'setComposerState',
    'setVoiceControls',
    'setVoicePreview',
    'clearVoicePreview',
    'setLiveStatus',
    'setBackgroundState',
    'triggerBackground',
    'startBackground',
    'stopBackground',
    'getSidebar',
    'getTranscript',
    'getComposer',
    'getBackground',
  ]) {
    assert.match(workspace, new RegExp(`${method}\\(`));
  }
  assert.match(workspace, /chatId: event\.detail\?\.chatId \|\| event\.detail\?\.id/);
  assert.match(workspace, /chat-workspace-input/);
  assert.match(workspace, /chat-workspace-key/);
  assert.match(workspace, /chat-workspace-chat-select/);
  assert.match(workspace, /chat-workspace-voice-intent/);
  assert.match(workspace, /chat-workspace-footer-intent/);
  assert.match(workspace, /chat-workspace-context-intent/);
  assert.match(workspace, /chat-workspace-load-older/);
  assert.match(workspace, /chat-workspace-background-change/);
  assert.match(workspace, /chat-workspace-background-event/);
  assert.match(workspace, /BACKGROUND_PULSE_STATES/);
  assert.match(workspace, /BACKGROUND_STOP_STATES/);
  assert.match(workspace, /background\.trigger/);
  assert.match(workspace, /background\.start/);
  assert.match(workspace, /background\.stop/);
  assert.match(workspace, /suspendLayout/);
  assert.match(workspace, /resumeLayout/);

  assert.match(registry, /\{[\s\S]*tagName: 'chat-workspace'[\s\S]*schemaVersion: 'component-descriptor-v2'/);
  assert.match(registry, /chat_workspace_set_state/);
  assert.match(registry, /chat_workspace_background/);
  assert.match(registry, /chat_workspace_select_chat/);
  assert.match(registry, /chat_workspace_send/);
  assert.match(registry, /host-owned-transport/);
  assert.match(registry, /animated-background-lifecycle/);
  assert.match(registry, /chat-nav-tree-helper/);
  assert.match(registry, /overlay-stack-reserve/);
  assert.match(registry, /message-windowing/);
  assert.match(registry, /buildChatNavTree\(\)/);
  assert.match(registry, /chat-workspace-load-older/);
  assert.match(registry, /--sn-theme-pattern-brightness/);
  assert.match(registry, /--sn-chat-transcript-top-sentinel-height/);
  assert.match(workspace, /setOverlayStackReserve/);
  assert.match(styles, /--sn-chat-overlay-stack-reserve/);
  assert.match(transcriptStyles, /scroll-padding-block-end: var\(--sn-chat-overlay-stack-reserve/);

  let component = registryModule.getComponent('chat-workspace');
  assert.ok(component);
  assert.deepEqual(
    component.contract.webmcp.tools.map((tool) => tool.name),
    ['chat_workspace_set_state', 'chat_workspace_background', 'chat_workspace_select_chat', 'chat_workspace_send']
  );
  assert.ok(component.contract.methods.some((method) => method.name === 'setWorkspaceState'));
  assert.ok(component.contract.methods.some((method) => method.name === 'setEmpty'));
  assert.ok(component.contract.methods.some((method) => method.name === 'setOverlayStackReserve'));
  assert.ok(component.contract.methods.some((method) => method.name === 'replaceMessageWindow'));
  assert.ok(component.contract.methods.some((method) => method.name === 'prependMessages'));
  assert.ok(component.contract.methods.some((method) => method.name === 'getMessageWindow'));
  assert.ok(component.contract.methods.some((method) => method.name === 'suspendLayout'));
  assert.ok(component.contract.methods.some((method) => method.name === 'resumeLayout'));
  assert.ok(component.contract.capabilities.includes('chat-nav-tree-helper'));
  assert.ok(component.contract.capabilities.includes('overlay-stack-reserve'));
  assert.ok(component.contract.capabilities.includes('message-windowing'));
  assert.ok(component.contract.capabilities.includes('layout-lifecycle'));
  assert.ok(component.contract.events.some((event) => event.name === 'chat-workspace-input'));
  assert.ok(component.contract.events.some((event) => event.name === 'chat-workspace-key'));
  assert.ok(component.contract.events.some((event) => event.name === 'chat-workspace-voice-intent'));
  assert.ok(component.componentDescription.includes('chat workspace'));

  let catalog = JSON.parse(customElements);
  let customWorkspace = catalog.modules
    .flatMap((moduleRecord) => moduleRecord.declarations || [])
    .find((declaration) => declaration.tagName === 'chat-workspace');
  let customTranscript = catalog.modules
    .flatMap((moduleRecord) => moduleRecord.declarations || [])
    .find((declaration) => declaration.tagName === 'chat-transcript');
  assert.ok(customWorkspace);
  assert.ok(customTranscript);
  assert.match(customWorkspace.componentDescription, /chat-nav-tree-helper/);
  assert.match(customWorkspace.componentDescription, /overlay-stack-reserve/);
  assert.ok(customWorkspace.metadata.contract.methods.some((method) => method.name === 'setOverlayStackReserve'));
  assert.ok(customWorkspace.metadata.contract.methods.some((method) => method.name === 'replaceMessageWindow'));
  assert.ok(customWorkspace.metadata.contract.events.some((event) => event.name === 'chat-workspace-load-older'));
  assert.ok(customWorkspace.metadata.contract.themeAliases.includes('--sn-chat-transcript-top-sentinel-height'));
  assert.ok(customWorkspace.metadata.contract.themeAliases.includes('--sn-chat-cell-base-alpha'));
  assert.ok(customWorkspace.metadata.contract.themeAliases.includes('--sn-chat-cell-alpha-span'));
  assert.equal(customWorkspace.metadata.contract.themeAliases.includes('--sn-theme-pattern-brightness'), false);
  assert.ok(customTranscript.metadata.contract.capabilities.includes('message-windowing'));
  assert.ok(customTranscript.metadata.contract.methods.some((method) => method.name === 'replaceMessageWindow'));
  assert.ok(customTranscript.metadata.contract.methods.some((method) => method.name === 'prependMessageItems'));
  assert.ok(customTranscript.metadata.contract.methods.some((method) => method.name === 'getMessageWindow'));
  assert.ok(customTranscript.metadata.contract.events.some((event) => event.name === 'chat-transcript-load-older'));
  assert.ok(customTranscript.metadata.contract.themeAliases.includes('--sn-chat-transcript-top-sentinel-height'));
  assert.ok(customTranscript.metadata.contract.themeAliases.includes('--sn-chat-cell-base-alpha'));
  assert.ok(customTranscript.metadata.contract.themeAliases.includes('--sn-chat-cell-alpha-span'));
  assert.match(customElements, /buildChatNavTree\(\)/);
  assert.deepEqual(
    customWorkspace.metadata.contract.webmcp.tools.map((tool) => tool.name),
    ['chat_workspace_set_state', 'chat_workspace_background', 'chat_workspace_select_chat', 'chat_workspace_send']
  );
  assert.ok(customWorkspace.agent.webmcp.toolNames.includes('chat_workspace_background'));
});

test('voice input command helpers match the Agent Portal command contract', async () => {
  const [source, helpers] = await Promise.all([
    readFile(voiceInputDefaultsSource, 'utf8'),
    import(voiceInputDefaultsSource.href),
  ]);

  assert.match(source, /DEFAULT_VOICE_WAKE_COMMANDS/);
  assert.match(source, /DEFAULT_VOICE_SEND_COMMANDS/);
  assert.match(source, /matchVoiceCommandAtEnd/);
  assert.match(source, /wakeCommandCandidates/);
  assert.equal(helpers.defaultWakeCommandPhrases().ru, "О'кей Агент");
  assert.equal(helpers.defaultSendCommandPhrases().ru, 'отправить');
  assert.deepEqual(helpers.defaultVoiceActionCommandPhrases().cancel.ru, ['отмена', 'стоп']);
  assert.deepEqual(helpers.wakeCommandCandidates(helpers.defaultWakeCommandPhrases(), 'en'), ['Okay Agent']);

  let command = helpers.matchVoiceCommandAtEnd('Построй интерфейс отправить', [
    { action: 'send', phrase: helpers.defaultSendCommandPhrases().ru },
  ]);
  assert.equal(command.matched, true);
  assert.equal(command.action, 'send');
  assert.equal(command.text, 'Построй интерфейс');

  let wake = helpers.matchVoiceCommandInText("Скажи О'кей Агент и начни запись", helpers.wakeCommandCandidates(
    helpers.defaultWakeCommandPhrases(),
    'ru'
  ));
  assert.equal(wake.matched, true);
  assert.equal(helpers.normalizeWakeCommandPhrase('голосовой ввод', 'ru'), "О'кей Агент");
});

test('cascade demo voice fallback confirms dictation directly into chat stream', async () => {
  const demoSource = await readFile(cascadeDemoSource, 'utf8');

  assert.match(demoSource, /_getVoiceSubmissionText/);
  assert.match(demoSource, /let useDefaultRuntime = typeof VoiceRuntime !== 'undefined' && VoiceRuntime\.isAvailable/);
  assert.match(demoSource, /if \(!useDefaultRuntime\) event\.preventDefault\?\.\(\)/);
  assert.match(demoSource, /sourceEvent === 'chat-composer-voice-approve'[\s\S]*_startMockStream\(text\)/);
  assert.doesNotMatch(demoSource, /sourceEvent === 'chat-composer-voice-approve'[\s\S]{0,180}_setVoiceDemoState\('transcribing'/);
  assert.doesNotMatch(demoSource, /value: 'Render this response inside the current layout отправить'/);
});

test('static custom elements catalog carries agent-facing descriptions for chat surfaces', async () => {
  const catalog = JSON.parse(await readFile(customElementsSource, 'utf8'));
  const descriptions = new Map();
  for (const moduleRecord of catalog.modules) {
    for (const declaration of moduleRecord.declarations || []) {
      if (declaration.tagName) descriptions.set(declaration.tagName, declaration.componentDescription || '');
    }
  }

  for (const tagName of [
    'chat-workspace',
    'chat-composer',
    'chat-list',
    'chat-list-item',
    'chat-sidebar-shell',
    'chat-sidebar-item',
    'cell-bg',
  ]) {
    assert.match(descriptions.get(tagName) || '', /Use this/);
  }
});

test('chat sidebar metadata matches rendered reusable fields without product task policy', async () => {
  const [sidebarItem, registry, customElementsSourceText, demoSource] = await Promise.all([
    readFile(new URL('../chat/ChatSidebarItem/ChatSidebarItem.js', import.meta.url), 'utf8'),
    readFile(componentRegistrySource, 'utf8'),
    readFile(customElementsSource, 'utf8'),
    readFile(cascadeDemoSource, 'utf8'),
  ]);
  const catalog = JSON.parse(customElementsSourceText);
  const declarations = new Map(
    catalog.modules
      .flatMap((moduleRecord) => moduleRecord.declarations || [])
      .filter((declaration) => declaration.tagName)
      .map((declaration) => [declaration.tagName, declaration])
  );
  const subItemDeclaration = declarations.get('chat-sidebar-sub-item');
  const subItemMemberNames = new Set((subItemDeclaration?.members || []).map((member) => member.name));

  assert.doesNotMatch(sidebarItem, /pendingTaskId/);
  assert.match(sidebarItem, /isRunning/);
  assert.doesNotMatch(sidebarItem, /isLocked|chat-sidebar-locked-select|chat-lock-icon|lockedTitle/);
  assert.match(sidebarItem, /statusKind === 'running'/);

  for (const propName of ['time', 'icon', 'metaLabel', 'hasChildren', 'isGroup', 'isRunning', 'subChats']) {
    assert.match(registry, new RegExp(`name: '${propName}'`));
    assert.match(customElementsSourceText, new RegExp(`"name": "${propName}"`));
  }
  assert.doesNotMatch(registry, /isLocked|chat-sidebar-locked-select/);
  assert.doesNotMatch(customElementsSourceText, /"name": "isLocked"|"name": "chat-sidebar-locked-select"/);
  assert.match(demoSource, /composerDisabled: true/);
  assert.match(demoSource, /disabled: composerDisabled/);

  assert.match(
    registry,
    /\{\s*tagName: 'chat-sidebar-sub-item'[\s\S]*?schemaVersion: 'component-descriptor-v2'/
  );
  assert.doesNotMatch(registry, /agentType/);
  assert.equal(subItemDeclaration?.contract?.schemaVersion, 'component-descriptor-v2');
  assert.equal(subItemMemberNames.has('agentType'), false);
  assert.equal(subItemMemberNames.has('metaLabel'), true);
  assert.equal(subItemMemberNames.has('isLocked'), false);
  assert.equal(subItemMemberNames.has('isRunning'), true);
  assert.equal(subItemMemberNames.has('subChats'), true);
});

test('cascade theme lab declares browser import map for bare package imports', async () => {
  const source = await readFile(cascadeDemoHtml, 'utf8');

  assert.match(source, /<script type="importmap">/);
  assert.match(source, /"@symbiotejs\/symbiote": "\.\.\/node_modules\/@symbiotejs\/symbiote\/core\/index\.js"/);
  assert.match(source, /"symbiote-engine\/": "\.\.\/node_modules\/symbiote-engine\/"/);
});

test('cascade theme lab exposes constrained chat smoke width for browser responsive verification', async () => {
  const source = await readFile(cascadeDemoSource, 'utf8');

  assert.match(source, /new URLSearchParams\(location\.search\)/);
  assert.match(source, /urlParams\.get\('chatSmokeWidth'\)/);
  assert.match(source, /chatSmokeWidth >= 220/);
  assert.match(source, /data-chat-smoke/);
  assert.match(source, /--stage7-chat-smoke-width/);
});

test('ThemeFactory resolves presets, resolves task mapping, and applies to elements', async () => {
  let source = await readFile(new URL('../themes/ThemeFactory.js', import.meta.url), 'utf8');
  let {
    resolveThemePresets,
    resolveThemePresetsForTask,
    applyThemePresets,
  } = await import('../themes/Theme.js');

  let resolved = resolveThemePresets({ color: 'carbon', skin: 'compact', motion: 'fast' });
  assert.equal(resolved.mode, 'dark');
  assert.equal(resolved.hue, 218);
  assert.equal(resolved.chroma, 0);
  assert.equal(resolved.density, 80);
  assert.equal(resolved.motion, 60);
  assert.match(source, /MOTION_PRESET_DEFINITIONS/);
  assert.match(source, /getMotionPresetOptions/);

  assert.deepEqual(resolveThemePresetsForTask('editor'), { color: 'carbon', skin: 'compact', motion: 'fast' });
  assert.deepEqual(resolveThemePresetsForTask('monitor'), { color: 'pcb', skin: 'compact', motion: 'fast' });
  assert.deepEqual(resolveThemePresetsForTask('terminal'), { color: 'carbon', skin: 'compact', motion: 'disabled' });
  assert.deepEqual(resolveThemePresetsForTask('unknown'), { color: 'dark', skin: 'modern', motion: 'smooth' });

  let styles = new Map();
  let element = {
    style: {
      setProperty(key, val) {
        styles.set(key, val);
      }
    }
  };

  applyThemePresets(element, { color: 'carbon', skin: 'compact', motion: 'fast' });
  assert.equal(styles.get('--sn-theme-hue'), '218');
  assert.equal(styles.get('--sn-theme-motion-scale'), '0.60');
  assert.equal(styles.get('--sn-transition-fast'), '72ms');
  styles.clear();
  applyThemePresets(element, { color: 'carbon', skin: 'compact', motion: 'disabled' });
  assert.equal(styles.get('--sn-motion-enabled'), '0');
  assert.equal(styles.get('--sn-animation-play-state'), 'paused');
});

test('cascade Classic defaults and chat cell-alpha aliases stay synchronized', async () => {
  const { createCascadeTheme, CASCADE_THEME_DEFAULTS, CASCADE_THEME_VARIANT_PRESETS } = await import('../themes/Theme.js');
  assert.equal(CASCADE_THEME_DEFAULTS.contrast, 100);
  assert.equal(CASCADE_THEME_VARIANT_PRESETS.classic.contrast, 100);
  assert.equal(CASCADE_THEME_VARIANT_PRESETS.modern.contrast, 100);
  assert.equal(CASCADE_THEME_DEFAULTS.pattern, 100);
  assert.equal(CASCADE_THEME_VARIANT_PRESETS.modern.pattern, 100);
  assert.equal(CASCADE_THEME_VARIANT_PRESETS.classic.pattern, 100);

  const defaultTheme = createCascadeTheme();
  assert.equal(defaultTheme.state.contrast, 100);
  assert.equal(defaultTheme.state.pattern, 100);
  assert.equal(defaultTheme.tokens['--sn-theme-pattern-brightness'], '1.00');

  const classicTheme = createCascadeTheme({ themeVariant: 'classic' });
  assert.equal(classicTheme.state.contrast, 100);
  assert.equal(classicTheme.state.pattern, 100);

  const modernTheme = createCascadeTheme({ themeVariant: 'modern' });
  assert.equal(modernTheme.state.contrast, 100);
  assert.equal(modernTheme.state.pattern, 100);

  const explicitLegacyContrast = createCascadeTheme({ themeVariant: 'classic', contrast: 58 });
  assert.equal(explicitLegacyContrast.state.contrast, 58);

  const explicitZeroDark = createCascadeTheme({ mode: 'dark', pattern: 0 });
  assert.equal(explicitZeroDark.tokens['--sn-cell-base-alpha'], '0.012');
  assert.equal(explicitZeroDark.tokens['--sn-cell-alpha-span'], '0.070');
  assert.equal(explicitZeroDark.tokens['--sn-grid-dot'], 'hsl(0 0% 98.0% / 0.018)');

  const explicitZeroLight = createCascadeTheme({ mode: 'light', pattern: 0 });
  assert.equal(explicitZeroLight.tokens['--sn-cell-base-alpha'], '0.010');
  assert.equal(explicitZeroLight.tokens['--sn-cell-alpha-span'], '0.050');

  const explicitHundredDark = createCascadeTheme({ mode: 'dark', pattern: 100 });
  assert.equal(explicitHundredDark.tokens['--sn-grid-dot'], 'hsl(0 0% 98.0% / 0.088)');
  assert.equal(explicitHundredDark.tokens['--sn-cell-base-alpha'], '0.047');
  assert.equal(explicitHundredDark.tokens['--sn-cell-alpha-span'], '0.175');
  assert.equal(explicitHundredDark.tokens['--sn-chat-cell-base-alpha'], '0.012');
  assert.equal(explicitHundredDark.tokens['--sn-chat-cell-alpha-span'], '0.070');
  assert.equal(explicitZeroDark.tokens['--sn-chat-cell-base-alpha'], '0.012');
  assert.equal(explicitZeroDark.tokens['--sn-chat-cell-alpha-span'], '0.070');

  const explicitHundredLight = createCascadeTheme({ mode: 'light', pattern: 100 });
  assert.equal(explicitHundredLight.tokens['--sn-chat-cell-base-alpha'], '0.010');
  assert.equal(explicitHundredLight.tokens['--sn-chat-cell-alpha-span'], '0.050');
  assert.equal(explicitZeroLight.tokens['--sn-chat-cell-base-alpha'], '0.010');
  assert.equal(explicitZeroLight.tokens['--sn-chat-cell-alpha-span'], '0.050');

  const [{ DEFAULT_PROVIDER_THEME }, { DEFAULT_DARK }, themeCatalog, dtcgSource, darkDtcgSource] = await Promise.all([
    import('../themes/default-provider.js'),
    import('../themes/default-dark.js'),
    import(themeCatalogSource.href),
    readFile(defaultProviderTokensSource, 'utf8'),
    readFile(defaultDarkTokensSource, 'utf8'),
  ]);
  const dtcg = JSON.parse(dtcgSource);
  const darkDtcg = JSON.parse(darkDtcgSource);
  assert.equal(DEFAULT_PROVIDER_THEME.tokens['--sn-theme-pattern-brightness'], explicitHundredDark.tokens['--sn-theme-pattern-brightness']);
  assert.equal(DEFAULT_PROVIDER_THEME.tokens['--sn-theme-surface-lightness'], defaultTheme.tokens['--sn-theme-surface-lightness']);
  assert.equal(DEFAULT_PROVIDER_THEME.tokens['--sn-theme-text-lightness'], defaultTheme.tokens['--sn-theme-text-lightness']);
  assert.equal(DEFAULT_PROVIDER_THEME.tokens['--sn-lit-hover'], defaultTheme.tokens['--sn-lit-hover']);
  assert.equal(DEFAULT_PROVIDER_THEME.tokens['--sn-lit-text-dim'], defaultTheme.tokens['--sn-lit-text-dim']);
  assert.equal(DEFAULT_PROVIDER_THEME.tokens['--sn-lit-accent'], defaultTheme.tokens['--sn-lit-accent']);
  assert.match(DEFAULT_PROVIDER_THEME.tokens['--sn-grid-dot'], /\/ 0\.088\)$/);
  assert.equal(DEFAULT_PROVIDER_THEME.tokens['--sn-cell-base-alpha'], explicitHundredDark.tokens['--sn-cell-base-alpha']);
  assert.equal(DEFAULT_PROVIDER_THEME.tokens['--sn-cell-alpha-span'], explicitHundredDark.tokens['--sn-cell-alpha-span']);
  assert.equal(DEFAULT_PROVIDER_THEME.tokens['--sn-chat-cell-base-alpha'], '0.012');
  assert.equal(DEFAULT_PROVIDER_THEME.tokens['--sn-chat-cell-alpha-span'], '0.070');
  assert.equal(DEFAULT_DARK.tokens['--sn-theme-pattern-brightness'], explicitHundredDark.tokens['--sn-theme-pattern-brightness']);
  assert.equal(DEFAULT_DARK.tokens['--sn-theme-surface-lightness'], defaultTheme.tokens['--sn-theme-surface-lightness']);
  assert.equal(DEFAULT_DARK.tokens['--sn-theme-text-lightness'], defaultTheme.tokens['--sn-theme-text-lightness']);
  assert.equal(DEFAULT_DARK.tokens['--sn-lit-hover'], defaultTheme.tokens['--sn-lit-hover']);
  assert.equal(DEFAULT_DARK.tokens['--sn-lit-text-dim'], defaultTheme.tokens['--sn-lit-text-dim']);
  assert.equal(DEFAULT_DARK.tokens['--sn-lit-accent'], defaultTheme.tokens['--sn-lit-accent']);
  assert.match(DEFAULT_DARK.tokens['--sn-grid-dot'], /\/ 0\.088\)$/);
  assert.equal(DEFAULT_DARK.tokens['--sn-cell-base-alpha'], explicitHundredDark.tokens['--sn-cell-base-alpha']);
  assert.equal(DEFAULT_DARK.tokens['--sn-cell-alpha-span'], explicitHundredDark.tokens['--sn-cell-alpha-span']);
  assert.equal(DEFAULT_DARK.tokens['--sn-chat-cell-base-alpha'], '0.012');
  assert.equal(DEFAULT_DARK.tokens['--sn-chat-cell-alpha-span'], '0.070');

  let runtimeTokenExpectations = {
    '--sn-cat-data': 'hsl(188 89% 47.0%)',
    '--sn-type-action': 'hsl(4 89% 82.0%)',
    '--sn-type-data': 'hsl(218 89% 79.0%)',
    '--sn-type-docs': 'hsl(0 0% 85.0%)',
    '--sn-syntax-keyword': 'hsl(4 89% 86.0%)',
    '--sn-syntax-string': 'hsl(36 89% 70.0%)',
  };
  for (let [name, value] of Object.entries(runtimeTokenExpectations)) {
    assert.equal(DEFAULT_DARK.tokens[name], DEFAULT_PROVIDER_THEME.tokens[name]);
    assert.equal(defaultTheme.tokens[name], value);
  }

  const { COLOR_PRESETS } = await import('../themes/ThemeFactory.js');
  assert.equal(COLOR_PRESETS.dark.contrast, 100);
  assert.equal(COLOR_PRESETS.light.contrast, 100);
  assert.equal(dtcg.control.pattern.$value, '1.00');
  assert.equal(dtcg.control.surfaceLightness.$value, '15.1%');
  assert.equal(dtcg.control.textLightness.$value, '98.0%');
  assert.equal(dtcg.effect.cellBaseAlpha.$value, '0.047');
  assert.equal(dtcg.effect.cellAlphaSpan.$value, '0.175');
  assert.equal(dtcg.effect.chatCellBaseAlpha.$value, '0.012');
  assert.equal(dtcg.effect.chatCellAlphaSpan.$value, '0.070');
  assert.equal(darkDtcg.control.pattern.$value, '1.00');
  assert.equal(darkDtcg.control.surfaceLightness.$value, '15.1%');
  assert.equal(darkDtcg.control.textLightness.$value, '98.0%');
  assert.equal(darkDtcg.effect.cellBaseAlpha.$value, '0.047');
  assert.equal(darkDtcg.effect.cellAlphaSpan.$value, '0.175');
  assert.equal(darkDtcg.effect.chatCellBaseAlpha.$value, '0.012');
  assert.equal(darkDtcg.effect.chatCellAlphaSpan.$value, '0.070');
  assert.equal(themeCatalog.THEME_TOKENS['default-provider'].control.pattern.$value, '1.00');
  assert.equal(themeCatalog.THEME_TOKENS['default-provider'].control.surfaceLightness.$value, '15.1%');
  assert.equal(themeCatalog.THEME_TOKENS['default-provider'].control.textLightness.$value, '98.0%');
  assert.equal(themeCatalog.THEME_TOKENS['default-provider'].effect.cellBaseAlpha.$value, '0.047');
  assert.equal(themeCatalog.THEME_TOKENS['default-provider'].effect.cellAlphaSpan.$value, '0.175');
  assert.equal(themeCatalog.THEME_TOKENS['default-provider'].effect.chatCellBaseAlpha.$value, '0.012');
  assert.equal(themeCatalog.THEME_TOKENS['default-provider'].effect.chatCellAlphaSpan.$value, '0.070');
  assert.equal(themeCatalog.getThemeControls('default-provider').find((control) => control.name === 'pattern').default, '1.00');
  assert.equal(themeCatalog.getThemeControls('default-provider').find((control) => control.name === 'surfaceLightness').default, '15.1%');
  assert.equal(themeCatalog.getThemeControls('default-provider').find((control) => control.name === 'textLightness').default, '98.0%');
  assert.equal(themeCatalog.getThemeControls('cascade-theme').find((control) => control.name === 'contrast').default, 100);

  let serializedTokenExpectations = [
    ['geometry', 'graphTypeAction', 'typeAction', 'hsl(var(--sn-hue-danger) var(--sn-sat-vivid) 82%)'],
    ['geometry', 'graphTypeData', 'typeData', 'hsl(var(--sn-hue-accent) var(--sn-sat-vivid) 79%)'],
    ['geometry', 'graphTypeDocs', 'typeDocs', 'hsl(var(--sn-hue-base) var(--sn-sat-muted) 85%)'],
    ['syntax', 'keyword', null, 'hsl(var(--sn-hue-danger) var(--sn-sat-vivid) 86%)'],
    ['syntax', 'string', null, 'hsl(var(--sn-hue-warning) var(--sn-sat-vivid) 70%)'],
  ];
  for (let [group, name, alias, value] of serializedTokenExpectations) {
    assert.equal(dtcg[group][name].$value, value);
    assert.equal(darkDtcg[group][name].$value, value);
    assert.equal(themeCatalog.THEME_TOKENS['default-provider'][group][name].$value, value);
    if (alias) {
      assert.equal(themeCatalog.THEME_TOKENS['default-provider'].alias[alias].$value, value);
    }
  }

  const storage = createMemoryStorage([['theme:main', JSON.stringify({ pattern: 0 })]]);
  const { readCascadeThemeScopeState } = await import(cascadeThemeSource.href);
  assert.equal(readCascadeThemeScopeState({ storageKey: 'theme:main' }, { storage }).pattern, 0);
});
