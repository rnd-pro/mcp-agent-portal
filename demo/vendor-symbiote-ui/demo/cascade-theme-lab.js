import Symbiote, { html } from '@symbiotejs/symbiote';
import { Connection, Input, Node, NodeEditor, Output, Socket } from '../core/index.js';
import * as LayoutTree from '../layout/LayoutTree.js';
import {
  DEFAULT_PROVIDER_THEME,
  applyTheme,
} from '../themes/Theme.js?v=cascade-pattern-control-1';
import {
  CASCADE_THEME_DEFAULTS,
  applyCascadeTheme,
  normalizeCascadeThemeOptions,
} from '../themes/cascade-theme.js?v=cascade-pattern-control-1';
import { createProductContextAgentView } from '../runtime/product-context.js';
import { createProductContextToolDescriptors } from '../webmcp.js';
import { configureMaterialSymbols } from '../icons/MaterialSymbols.js';
import '../layout/LayoutShellMenu/LayoutShellMenu.js';
import '../layout/LayoutSidebar/LayoutSidebar.js';
import '../layout/Layout/Layout.js';
import '../layout/LayoutNode/LayoutNode.js';
import '../layout/ProjectTabs/ProjectTabs.js';
import '../canvas/NodeCanvas/NodeCanvas.js';
import '../canvas/GraphExplorerShell/GraphExplorerShell.js';
import '../node/GraphNode/GraphNode.js?v=cascade-demo-node-1';
import '../control/Button/Button.js';
import '../display/Banner/Banner.js';
import '../display/Badge/Badge.js';
import '../display/DataTable/DataTable.js';
import '../display/EmptyState/EmptyState.js';
import '../display/EventFeed/EventFeed.js';
import '../display/LoadingOverlay/LoadingOverlay.js';
import '../display/SourceViewer/SourceViewer.js';
import '../display/SourceEditor/SourceEditor.js';
import '../display/StatusRibbon/StatusRibbon.js';
import '../list/ListDetailShell/ListDetailShell.js';
import '../surface/Card/Card.js';
import '../tree/TreePanel/TreePanel.js';
import '../canvas/CanvasGraph/CanvasGraph.js';
import '../board/KanbanBoard/KanbanBoard.js';
import '../chat/ChatComposer/ChatComposer.js?v=voice-command-rule-icon';
import '../chat/ChatSidebarItem/ChatSidebarItem.js?v=voice-controls-final-8';
import '../chat/ChatSidebar/ChatSidebar.js?v=voice-controls-final-8';
import '../chat/ChatWorkspace/ChatWorkspace.js?v=scroll-bottom-placement-1';
import { VoiceRuntime } from '../chat/voice-runtime.js';
import { createDialogueStage } from '../chat/dialogue-stage.js';
import { buildAlternatingTimeline, playDialogueTimeline } from '../chat/dialogue-timeline.js';
import { createDialoguePlayer } from '../chat/dialogue-player.js';
import { createPresenterCursor, playCursorScenario } from '../chat/presenter-cursor.js';
import {
  defaultSendCommandPhrases,
  defaultVoiceActionCommandPhrases,
  defaultWakeCommandPhrases,
  matchVoiceCommandAtEnd,
  wakeCommandCandidates,
} from '../chat/voice-input-defaults.js';
import '../display/CodeBlock/CodeBlock.js';
import '../themes/CascadeThemeEditor/CascadeThemeEditor.js';
import '../themes/CascadeThemeWidget/CascadeThemeWidget.js';
import '../timeline/TimelineEditor/TimelineEditor.js';
import '../viewport/CanvasViewport/CanvasViewport.js';

configureMaterialSymbols();

await Promise.all([
  customElements.whenDefined('layout-shell-menu'),
  customElements.whenDefined('layout-sidebar'),
  customElements.whenDefined('panel-layout'),
  customElements.whenDefined('layout-node'),
  customElements.whenDefined('project-tabs'),
  customElements.whenDefined('graph-explorer-shell'),
  customElements.whenDefined('sn-data-table'),
  customElements.whenDefined('sn-empty-state'),
  customElements.whenDefined('sn-event-feed'),
  customElements.whenDefined('sn-list-detail-shell'),
  customElements.whenDefined('sn-loading-overlay'),
  customElements.whenDefined('source-viewer'),
  customElements.whenDefined('source-editor'),
  customElements.whenDefined('sn-status-ribbon'),
  customElements.whenDefined('canvas-graph'),
  customElements.whenDefined('sn-kanban-board'),
  customElements.whenDefined('chat-workspace'),
  customElements.whenDefined('cascade-theme-widget'),
]);

const CASCADE_THEME_STORAGE_KEY = 'symbiote-ui:cascade-theme-lab';
const VIDEO_STUDIO_THEME_STORAGE_KEY = 'symbiote-ui:video-editor:studio:theme:v1:workspace-windows';
const CASCADE_CHAT_VOICE_STORAGE_KEY = 'symbiote-ui:cascade-theme-lab:voice';
const VIDEO_STUDIO_CASCADE_THEME = {
  mode: 'dark',
  brightness: 1,
  contrast: 84,
  chroma: 62,
  hue: 83,
  bgLightness: -1,
  surfaceLightness: -1,
  accentLightness: -1,
  accentChroma: -1,
  pattern: 60,
  outline: 43,
  type: 105,
  heading: 104,
  density: 114,
  radius: 0,
  frameRadius: 55,
  frameGap: 0,
  motion: 100,
  register: '',
};
const CASCADE_THEME_QUERY_KEYS = [
  'mode',
  'brightness',
  'contrast',
  'chroma',
  'hue',
  'pattern',
  'outline',
  'type',
  'heading',
  'density',
];
const urlParams = new URLSearchParams(location.search);

function readHashProjectId(hash = location.hash) {
  let raw = String(hash || '').replace(/^#\/?/, '').split(/[?#]/)[0];
  return raw.split('/')[0] || '';
}

function cascadeThemeScopeForProject(projectId = readHashProjectId()) {
  if (projectId === 'video-editor') {
    return {
      id: 'video-studio',
      label: 'Video studio windows',
      icon: 'movie',
      storageKey: VIDEO_STUDIO_THEME_STORAGE_KEY,
      defaultState: VIDEO_STUDIO_CASCADE_THEME,
    };
  }
  return {
    id: 'showcase',
    label: 'Showcase',
    icon: 'hub',
    storageKey: CASCADE_THEME_STORAGE_KEY,
    defaultState: CASCADE_THEME_DEFAULTS,
  };
}

function cascadeThemeStatesMatch(left, right) {
  let a = normalizeCascadeThemeOptions(left);
  let b = normalizeCascadeThemeOptions(right);
  let keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (let key of keys) {
    if (a[key] !== b[key]) return false;
  }
  return true;
}

function readStoredCascadeTheme(projectId = readHashProjectId()) {
  let scope = cascadeThemeScopeForProject(projectId);
  let fallbackState = normalizeCascadeThemeOptions(scope.defaultState);
  if (typeof localStorage === 'undefined') return fallbackState;
  try {
    let stored = JSON.parse(localStorage.getItem(scope.storageKey) || 'null');
    if (!stored || typeof stored !== 'object') {
      localStorage.setItem(scope.storageKey, JSON.stringify(fallbackState));
      return fallbackState;
    }
    if (projectId === 'video-editor' && cascadeThemeStatesMatch(stored, CASCADE_THEME_DEFAULTS)) {
      localStorage.setItem(scope.storageKey, JSON.stringify(fallbackState));
      return fallbackState;
    }
    return normalizeCascadeThemeOptions(stored);
  } catch (error) {
    void error;
    return fallbackState;
  }
}

function readUrlCascadeTheme() {
  let options = {};
  let hasOverride = false;
  for (let key of CASCADE_THEME_QUERY_KEYS) {
    if (!urlParams.has(key)) continue;
    hasOverride = true;
    options[key] = key === 'mode' ? urlParams.get(key) : Number(urlParams.get(key));
  }
  return hasOverride ? normalizeCascadeThemeOptions(options) : null;
}

function readInitialCascadeTheme() {
  return readUrlCascadeTheme() || readStoredCascadeTheme();
}

function configureCascadeThemeElement(element, projectId = readHashProjectId()) {
  if (!element) return;
  let scope = cascadeThemeScopeForProject(projectId);
  let defaultState = normalizeCascadeThemeOptions(scope.defaultState);
  let defaultStateJson = JSON.stringify(defaultState);
  element.setAttribute('target-selector', ':root');
  element.setAttribute('storage-key', scope.storageKey);
  element.setAttribute('default-state', defaultStateJson);
  if (element.matches?.('cascade-theme-widget')) {
    element.setAttribute('overlay-theme-selector', ':root');
    element.scopes = [{
      id: scope.id,
      label: scope.label,
      icon: scope.icon,
      selector: ':root',
      storageKey: scope.storageKey,
      defaultState,
    }];
  }
  if (element.matches?.('cascade-theme-editor')) {
    element.targets = [{
      id: scope.id,
      label: scope.label,
      icon: scope.icon,
      selector: ':root',
      storageKey: scope.storageKey,
      defaultState,
    }];
  }
}

function syncCascadeThemeSurface(projectId = readHashProjectId(), source = 'cascade-lab-scope-sync') {
  let state = readUrlCascadeTheme() || readStoredCascadeTheme(projectId);
  configureCascadeThemeElement(document.querySelector('cascade-theme-widget'), projectId);
  document.querySelectorAll('cascade-theme-editor').forEach((editor) => {
    configureCascadeThemeElement(editor, projectId);
  });
  applyCascadeTheme(document.documentElement, state, {
    source,
    targetSelector: ':root',
  });
}

function readStoredChatVoiceSettings() {
  let defaults = { languageMode: 'ru', voiceResponseEnabled: true };
  if (typeof localStorage === 'undefined') return defaults;
  try {
    let stored = JSON.parse(localStorage.getItem(CASCADE_CHAT_VOICE_STORAGE_KEY) || 'null');
    let languageMode = ['ru', 'es', 'en'].includes(stored?.languageMode)
      ? stored.languageMode
      : defaults.languageMode;
    return {
      languageMode,
      voiceResponseEnabled: stored?.voiceResponseEnabled !== false,
    };
  } catch (error) {
    void error;
    return defaults;
  }
}

function writeStoredChatVoiceSettings(settings = {}) {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(CASCADE_CHAT_VOICE_STORAGE_KEY, JSON.stringify({
      languageMode: ['ru', 'es', 'en'].includes(settings.languageMode) ? settings.languageMode : 'ru',
      voiceResponseEnabled: settings.voiceResponseEnabled !== false,
    }));
  } catch (error) {
    void error;
  }
}

applyTheme(document.documentElement, DEFAULT_PROVIDER_THEME);
applyCascadeTheme(document.documentElement, readInitialCascadeTheme(), {
  source: 'cascade-lab-init',
  targetSelector: ':root',
});
syncCascadeThemeSurface(readHashProjectId(), 'cascade-lab-init-scope');

const chatSmokeWidth = Number(urlParams.get('chatSmokeWidth') || 0);

const CIRCLE_SAMPLE_IMAGE = [
  'data:image/svg+xml;utf8,',
  encodeURIComponent(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120">
      <defs>
        <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#8bd3ff"/>
          <stop offset="0.48" stop-color="#72f0bd"/>
          <stop offset="1" stop-color="#f8c96a"/>
        </linearGradient>
      </defs>
      <rect width="120" height="120" fill="#161816"/>
      <circle cx="60" cy="60" r="47" fill="url(#g)"/>
      <path d="M36 66 55 41l29 42H43z" fill="#121512" opacity=".82"/>
      <circle cx="82" cy="38" r="9" fill="#fff" opacity=".72"/>
    </svg>
  `),
].join('');

const SVG_NODE_SAMPLE_IMAGE = [
  'data:image/svg+xml;utf8,',
  encodeURIComponent(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120">
      <defs>
        <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#8bd3ff"/>
          <stop offset="0.55" stop-color="#79e6c4"/>
          <stop offset="1" stop-color="#d6b5ff"/>
        </linearGradient>
      </defs>
      <rect width="120" height="120" fill="none"/>
      <path d="M60 10 103 35v50L60 110 17 85V35Z" fill="url(#g)" opacity=".92"/>
      <path d="M39 44h42M39 60h42M39 76h42" stroke="#101417" stroke-width="8" stroke-linecap="round"/>
      <circle cx="39" cy="44" r="7" fill="#101417"/>
      <circle cx="81" cy="60" r="7" fill="#101417"/>
      <circle cx="39" cy="76" r="7" fill="#101417"/>
    </svg>
  `),
].join('');

class CascadeOverviewPanel extends Symbiote {
  renderCallback() {
    this.$.projects = showcaseProjects.map((project) => ({
      icon: project.icon,
      name: project.name,
      summary: project.overview || project.sidebarLabel,
    }));
  }
}

CascadeOverviewPanel.template = html`
  <section class="showcase-overview">
    <header class="showcase-overview-hero">
      <span class="material-symbols-outlined">hub</span>
      <div>
        <p>symbiote-ui</p>
        <h1>Agent UI construction library</h1>
        <span>
          Components, layouts, theme cascade, graph surfaces, chat, and WebMCP
          metadata are packaged as reusable building blocks for runtime UI
          construction.
        </span>
      </div>
    </header>

    <div class="showcase-overview-grid">
      <article>
        <span class="material-symbols-outlined">view_quilt</span>
        <strong>Layout first</strong>
        <p>Top tabs switch project-type layout groups. The left sidebar belongs only to the active project type.</p>
      </article>
      <article>
        <span class="material-symbols-outlined">smart_toy</span>
        <strong>One page agent</strong>
        <p>The right agent chat is one standard collapsed layout panel, shared across every view.</p>
      </article>
      <article>
        <span class="material-symbols-outlined">settings_suggest</span>
        <strong>Engine boundary</strong>
        <p>symbiote-ui owns UI composition. symbiote-engine owns execution, workflows, persistence, and server runtime.</p>
      </article>
      <article>
        <span class="material-symbols-outlined">api</span>
        <strong>Agent-readable</strong>
        <p>WebMCP descriptors explain what components do and which inputs, state, and actions agents can use.</p>
      </article>
    </div>

    <section class="showcase-project-map" aria-label="Project type tabs">
      <div class="showcase-project-map-header">
        <span class="material-symbols-outlined">folder_open</span>
        <strong>Project types shown by the demo</strong>
      </div>
      <div class="showcase-project-list" itemize="projects">
        <template>
          <div class="showcase-project-pill">
            <span class="material-symbols-outlined">{{icon}}</span>
            <strong>{{name}}</strong>
            <small>{{summary}}</small>
          </div>
        </template>
      </div>
    </section>
  </section>
`;

CascadeOverviewPanel.rootStyles = `
  cascade-overview-panel {
    display: block;
    width: 100%;
    height: 100%;
    min-height: 0;
    background: var(--sn-sys-surface-panel);
    color: var(--sn-sys-on-surface);
  }

  cascade-overview-panel .showcase-overview {
    display: grid;
    grid-template-rows: auto auto minmax(0, 1fr);
    gap: var(--sn-lab-panel-gap, 14px);
    height: 100%;
    min-height: 0;
    padding: var(--sn-lab-panel-padding, 16px);
    overflow: auto;
    scrollbar-color: var(--sn-scrollbar-thumb) var(--sn-scrollbar-track);
  }

  cascade-overview-panel .showcase-overview-hero {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    gap: 14px;
    align-items: center;
    padding: clamp(14px, 2vw, 24px);
    border: var(--sn-node-border-width, 1px) solid var(--sn-sys-outline);
    border-radius: var(--sn-node-radius);
    background:
      radial-gradient(circle at 10% 0%, color-mix(in oklab, var(--sn-sys-accent) 24%, transparent), transparent 38%),
      color-mix(in oklab, var(--sn-sys-surface-raised) 90%, var(--sn-sys-surface));
  }

  cascade-overview-panel .showcase-overview-hero > .material-symbols-outlined {
    display: grid;
    place-items: center;
    width: calc(58px * var(--sn-theme-density, 1));
    aspect-ratio: 1;
    border-radius: 50%;
    background: var(--sn-sys-surface-raised);
    color: var(--sn-sys-accent);
    font-size: calc(30px * var(--sn-theme-icon-scale, 1));
  }

  cascade-overview-panel .showcase-overview-hero p,
  cascade-overview-panel .showcase-overview-hero h1,
  cascade-overview-panel .showcase-overview-hero span {
    margin: 0;
  }

  cascade-overview-panel .showcase-overview-hero p {
    color: var(--sn-sys-accent);
    font-size: calc(12px * var(--sn-theme-type-scale, 1));
    font-weight: 700;
    text-transform: uppercase;
  }

  cascade-overview-panel .showcase-overview-hero h1 {
    margin-top: 4px;
    color: var(--sn-sys-on-surface);
    font-size: calc(26px * var(--sn-theme-heading-scale, 1));
    line-height: 1.08;
  }

  cascade-overview-panel .showcase-overview-hero span {
    display: block;
    margin-top: 8px;
    max-width: 760px;
    color: var(--sn-sys-on-surface-dim);
    font-size: calc(14px * var(--sn-theme-type-scale, 1));
    line-height: 1.45;
  }

  cascade-overview-panel .showcase-overview-grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: var(--sn-lab-panel-gap, 10px);
  }

  cascade-overview-panel .showcase-overview-grid article,
  cascade-overview-panel .showcase-project-map {
    min-width: 0;
    padding: var(--sn-lab-panel-padding, 12px);
    border: var(--sn-node-border-width, 1px) solid var(--sn-sys-outline);
    border-radius: var(--sn-node-radius);
    background: var(--sn-sys-surface-raised);
  }

  cascade-overview-panel article .material-symbols-outlined {
    color: var(--sn-sys-accent);
    font-size: calc(21px * var(--sn-theme-icon-scale, 1));
  }

  cascade-overview-panel article strong {
    display: block;
    margin-top: 8px;
    font-size: calc(14px * var(--sn-theme-type-scale, 1));
  }

  cascade-overview-panel article p {
    margin: 6px 0 0;
    color: var(--sn-sys-on-surface-dim);
    font-size: calc(12px * var(--sn-theme-type-scale, 1));
    line-height: 1.4;
  }

  cascade-overview-panel .showcase-project-map {
    display: grid;
    gap: 10px;
  }

  cascade-overview-panel .showcase-project-map-header {
    display: flex;
    align-items: center;
    gap: 8px;
    color: var(--sn-sys-on-surface);
  }

  cascade-overview-panel .showcase-project-list {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 8px;
  }

  cascade-overview-panel .showcase-project-pill {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    gap: 3px 8px;
    align-items: center;
    min-width: 0;
    padding: 9px 10px;
    border: 1px solid color-mix(in oklab, var(--sn-sys-outline) 72%, transparent);
    border-radius: var(--sn-node-radius);
    background: color-mix(in oklab, var(--sn-sys-surface) 72%, var(--sn-sys-surface-raised));
  }

  cascade-overview-panel .showcase-project-pill .material-symbols-outlined {
    grid-row: span 2;
    color: var(--sn-sys-accent);
    font-size: calc(18px * var(--sn-theme-icon-scale, 1));
  }

  cascade-overview-panel .showcase-project-pill strong,
  cascade-overview-panel .showcase-project-pill small {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  cascade-overview-panel .showcase-project-pill strong {
    font-size: calc(12px * var(--sn-theme-type-scale, 1));
  }

  cascade-overview-panel .showcase-project-pill small {
    color: var(--sn-sys-on-surface-dim);
    font-size: calc(11px * var(--sn-theme-type-scale, 1));
  }

  @media (max-width: 900px) {
    cascade-overview-panel .showcase-overview-grid,
    cascade-overview-panel .showcase-project-list {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  @media (max-width: 620px) {
    cascade-overview-panel .showcase-overview-hero,
    cascade-overview-panel .showcase-overview-grid,
    cascade-overview-panel .showcase-project-list {
      grid-template-columns: minmax(0, 1fr);
    }
  }
`;

CascadeOverviewPanel.reg('cascade-overview-panel');

class CascadeGraphPanel extends Symbiote {
  initCallback() {
    this._pathStyle = 'pcb';
    this.addEventListener('panel-menu-action', (event) => {
      if (event.detail?.actionId?.startsWith('path:')) {
        this._pathStyle = event.detail.actionId.slice(5);
        this.ref.canvas?.setPathStyle(this._pathStyle);
        this._syncGraphShell();
        this.dispatchEvent(new CustomEvent('panel-menu-actions', {
          bubbles: true,
          composed: true,
          detail: { actions: this._panelActions() },
        }));
        return;
      }
      if (event.detail?.actionId?.startsWith('graph:')) {
        this._handleGraphShellAction(event.detail.actionId.slice(6));
      }
    });
    this.addEventListener('graph-shell-path-style-change', (event) => {
      this._pathStyle = event.detail?.style || 'pcb';
      this.ref.canvas?.setPathStyle(this._pathStyle);
      this._syncGraphShell();
      this.dispatchEvent(new CustomEvent('panel-menu-actions', {
        bubbles: true,
        composed: true,
        detail: { actions: this._panelActions() },
      }));
    });
    this.addEventListener('graph-shell-action', (event) => {
      this._handleGraphShellAction(event.detail?.action);
    });
  }

  renderCallback() {
    if (this._ready) return;
    this._ready = true;
    const canvas = this.ref.canvas;
    const socket = new Socket('flow', {
      color: 'var(--sn-sys-accent)',
    });
    const editor = new NodeEditor();
    this._editor = editor;
    this._socket = socket;
    this._generatedNodeCount = 0;

    let source = new Node('Theme source', {
      id: 'theme-source',
      type: 'source',
      category: 'server',
      shape: 'disc',
      icon: 'tune',
    });
    source.params = {
      summary: ':root owns source tokens. Components only inherit.',
      size: 112,
    };
    source.addOutput('tokens', new Output(socket, 'tokens'));
    editor.addNode(source);

    let canvasNode = new Node('Node canvas', {
      id: 'node-canvas-sample',
      type: 'canvas',
      category: 'module',
      shape: 'rect',
      icon: 'hub',
    });
    canvasNode.params = {
      summary: 'Connection colors, sockets, node surfaces, and scrollbars update from the same cascade.',
    };
    canvasNode.addInput('in', new Input(socket, 'in'));
    canvasNode.addOutput('next', new Output(socket, 'next'));
    editor.addNode(canvasNode);

    let layoutNode = new Node('Layout shell', {
      id: 'layout-shell-sample',
      type: 'layout',
      category: 'data',
      shape: 'rect',
      icon: 'view_quilt',
    });
    layoutNode.params = {
      summary: 'Panel headers, borders, hover states, and bridge traces consume the same provider tokens.',
    };
    layoutNode.addInput('in', new Input(socket, 'in'));
    layoutNode.addOutput('next', new Output(socket, 'next'));
    editor.addNode(layoutNode);

    let controlsNode = new Node('Controls', {
      id: 'controls-sample',
      type: 'controls',
      category: 'control',
      shape: 'rect',
      icon: 'tune',
    });
    controlsNode.params = {
      summary: 'Buttons, banners, cards, and tree rows follow brightness, contrast, and accent chroma.',
    };
    controlsNode.addInput('in', new Input(socket, 'in'));
    controlsNode.addOutput('next', new Output(socket, 'next'));
    editor.addNode(controlsNode);

    let circleIconNode = new Node('Circle icon', {
      id: 'circle-icon-sample',
      type: 'agent',
      category: 'control',
      shape: 'circle',
      icon: 'schema',
    });
    circleIconNode.addInput('in', new Input(socket, 'in'));
    circleIconNode.addOutput('next', new Output(socket, 'next'));
    editor.addNode(circleIconNode);

    let circleImageNode = new Node('Circle image', {
      id: 'circle-image-sample',
      type: 'media',
      category: 'data',
      shape: 'circle',
      icon: 'image',
    });
    circleImageNode.params = {
      image: CIRCLE_SAMPLE_IMAGE,
      imageAlt: 'Circular media sample',
    };
    circleImageNode.addInput('in', new Input(socket, 'in'));
    circleImageNode.addOutput('next', new Output(socket, 'next'));
    editor.addNode(circleImageNode);

    let pillNode = new Node('Pill route', {
      id: 'pill-sample',
      type: 'route',
      category: 'instance',
      shape: 'pill',
      icon: 'route',
    });
    pillNode.addInput('in', new Input(socket, 'in'));
    pillNode.addOutput('next', new Output(socket, 'next'));
    editor.addNode(pillNode);

    let svgNode = new Node('SVG shape', {
      id: 'svg-shape-sample',
      type: 'svg',
      category: 'function',
      shape: 'hexagon',
      icon: 'schema',
    });
    svgNode.params = {
      media: SVG_NODE_SAMPLE_IMAGE,
      mediaAlt: 'Hexagonal SVG node sample',
      size: 118,
    };
    svgNode.addInput('in', new Input(socket, 'in'));
    svgNode.addOutput('next', new Output(socket, 'next'));
    editor.addNode(svgNode);

    let commentNode = new Node('Comment', {
      id: 'comment-sample',
      type: 'note',
      category: 'default',
      shape: 'comment',
      icon: 'sticky_note_2',
    });
    commentNode.params = {
      summary: 'Comment surfaces follow the same text, spacing, and outline cascade.',
    };
    commentNode.addInput('in', new Input(socket, 'in'));
    commentNode.addOutput('next', new Output(socket, 'next'));
    editor.addNode(commentNode);

    editor.addConnection(new Connection(source, 'tokens', canvasNode, 'in'));
    editor.addConnection(new Connection(canvasNode, 'next', layoutNode, 'in'));
    editor.addConnection(new Connection(layoutNode, 'next', controlsNode, 'in'));
    editor.addConnection(new Connection(controlsNode, 'next', circleIconNode, 'in'));
    editor.addConnection(new Connection(circleIconNode, 'next', circleImageNode, 'in'));
    editor.addConnection(new Connection(circleImageNode, 'next', pillNode, 'in'));
    editor.addConnection(new Connection(pillNode, 'next', svgNode, 'in'));
    editor.addConnection(new Connection(svgNode, 'next', commentNode, 'in'));

    canvas.setEditor(editor);
    canvas.setReadonly(true);
    canvas.setReadonlyNodeDragging(true);
    canvas.setPanels(false);
    canvas.setViewportLocked(false);
    canvas.setPathStyle(this._pathStyle);
    this._syncGraphShell();
    canvas.$.zoom = 1;
    canvas.$.panX = 0;
    canvas.$.panY = 0;

    this._flowNodeIds = [
      source.id,
      canvasNode.id,
      layoutNode.id,
      controlsNode.id,
      circleIconNode.id,
      circleImageNode.id,
      pillNode.id,
      svgNode.id,
      commentNode.id,
    ];
    this._lastFlowNode = commentNode;

    const place = () => this._applyGraphFlowLayout();

    place();
    this._resizeObserver = new ResizeObserver(place);
    this._resizeObserver.observe(canvas);
  }

  _pathActions() {
    return [
      { id: 'path:pcb', label: 'PCB', icon: 'conversion_path', active: this._pathStyle === 'pcb', group: 'path', groupLabel: 'Links' },
      { id: 'path:bezier', label: 'Bezier', icon: 'gesture', active: this._pathStyle === 'bezier', group: 'path', groupLabel: 'Links' },
      { id: 'path:straight', label: 'Straight', icon: 'horizontal_rule', active: this._pathStyle === 'straight', group: 'path', groupLabel: 'Links' },
    ];
  }

  _graphActions() {
    return [
      { id: 'graph:insert-node', label: 'Add node', icon: 'add_circle', group: 'graph', groupLabel: 'Graph' },
      { id: 'graph:insert-edge', label: 'Add edge', icon: 'add_link', group: 'graph', groupLabel: 'Graph' },
      { id: 'graph:fit-view', label: 'Fit', icon: 'fit_screen', group: 'graph', groupLabel: 'Graph' },
      { id: 'graph:reset-view', label: 'Reset view', icon: 'center_focus_strong', group: 'graph', groupLabel: 'Graph' },
    ];
  }

  _panelActions() {
    return [...this._pathActions(), ...this._graphActions()];
  }

  _syncGraphShell() {
    this.ref.shell?.setPathStyle?.(this._pathStyle);
    this.ref.shell?.setStats?.([
      { value: this._flowNodeIds?.length || 0, label: 'nodes' },
      { value: this._editor?.connections?.size || 0, label: 'links' },
      { value: this._pathStyle.toUpperCase(), label: 'routes' },
    ]);
  }

  _handleGraphShellAction(action) {
    if (action === 'insert-node') {
      this._insertDemoNode();
    } else if (action === 'insert-edge') {
      this._insertDemoEdge();
    } else if (action === 'fit-view') {
      this.ref.canvas?.fitView?.();
    } else if (action === 'reset-view') {
      this.ref.canvas.$.zoom = 1;
      this.ref.canvas.$.panX = 0;
      this.ref.canvas.$.panY = 0;
      this._applyGraphFlowLayout();
    }
  }

  _applyGraphFlowLayout() {
    const canvas = this.ref.canvas;
    if (!canvas || !this._flowNodeIds?.length) return;
    requestAnimationFrame(() => {
      canvas.setFlowLayout({
        nodeIds: this._flowNodeIds,
        direction: 'vertical',
        gap: 76,
        padding: { top: 42, right: 28, bottom: 42, left: 28 },
        align: 'center',
        scroll: false,
      });
      canvas.fitView?.();
      this._syncGraphShell();
    });
  }

  _insertDemoNode() {
    if (!this._editor || !this._socket) return;
    this._generatedNodeCount += 1;
    const node = new Node(`Generated ${this._generatedNodeCount}`, {
      id: `generated-node-${this._generatedNodeCount}`,
      type: 'agent',
      category: 'function',
      shape: this._generatedNodeCount % 2 === 0 ? 'pill' : 'rect',
      icon: 'auto_awesome',
    });
    node.params = {
      summary: 'Inserted at runtime by the graph explorer shell action.',
    };
    node.addInput('in', new Input(this._socket, 'in'));
    node.addOutput('next', new Output(this._socket, 'next'));
    this._editor.addNode(node);
    if (this._lastFlowNode?.outputs?.next) {
      this._editor.addConnection(new Connection(this._lastFlowNode, 'next', node, 'in'));
    }
    this._lastFlowNode = node;
    this._flowNodeIds.push(node.id);
    this._applyGraphFlowLayout();
  }

  _insertDemoEdge() {
    if (!this._editor || this._flowNodeIds.length < 2) return;
    const source = this._editor.getNode(this._flowNodeIds.at(-2));
    const target = this._editor.getNode(this._flowNodeIds.at(-1));
    if (!source || !target || !source.outputs?.next || !target.inputs?.in) return;
    const exists = this._editor.getConnections().some((connection) => (
      connection.from === source.id
      && connection.to === target.id
      && connection.out === 'next'
      && connection.in === 'in'
    ));
    if (!exists) {
      this._editor.addConnection(new Connection(source, 'next', target, 'in'));
    }
    this._applyGraphFlowLayout();
  }

  disconnectedCallback() {
    this._resizeObserver?.disconnect();
    super.disconnectedCallback?.();
  }
}

CascadeGraphPanel.template = html`
  <graph-explorer-shell class="lab-graph-explorer" ${{ ref: 'shell' }}>
    <node-canvas class="lab-canvas" slot="canvas" ${{ ref: 'canvas' }}></node-canvas>
    <div class="graph-explorer-stats lab-graph-stats" slot="stats"></div>
  </graph-explorer-shell>
`;

CascadeGraphPanel.rootStyles = `
  cascade-graph-panel {
    display: block;
    width: 100%;
    height: 100%;
  }

  cascade-graph-panel .lab-graph-explorer {
    width: 100%;
    height: 100%;
  }

  cascade-graph-panel .lab-graph-stats {
    color: var(--sn-text-muted, var(--sn-sys-on-surface-dim));
    font-size: var(--sn-small-size, 0.78rem);
    white-space: nowrap;
  }
`;

CascadeGraphPanel.reg('cascade-graph-panel');

class CascadeUiPanel extends Symbiote {
  renderCallback() {
    if (this._ready) return;
    this._ready = true;
    const grid = this.ref.grid;
    const tree = this.ref.tree;
    const tokenNames = [
      '--sn-sys-surface',
      '--sn-sys-surface-panel',
      '--sn-sys-surface-raised',
      '--sn-sys-outline',
      '--sn-sys-accent',
      '--sn-cat-server',
      '--sn-cat-control',
      '--sn-cat-data',
      '--sn-type-source',
      '--sn-type-canvas',
      '--sn-type-layout',
      '--sn-type-controls',
      '--sn-type-action',
      '--sn-tab-accent-0',
      '--sn-tab-accent-1',
      '--sn-tab-accent-2',
      '--sn-sys-on-surface',
      '--sn-sys-on-surface-dim',
      '--sn-scrollbar-thumb',
      '--sn-theme-outline-strength',
      '--sn-theme-type-scale',
      '--sn-theme-heading-scale',
      '--sn-theme-density',
      '--sn-shape-stroke',
      '--sn-shape-stroke-width',
      '--sn-node-label-size',
      '--sn-markdown-h1-size',
      '--sn-chat-markdown-h1-size',
      '--sn-chat-bg',
      '--sn-chat-user-message-bg',
      '--sn-composer-bg',
      '--sn-chat-list-header-padding',
      '--sn-chat-list-item-padding',
      '--sn-chat-sidebar-header-padding',
      '--sn-chat-sidebar-row-padding',
      '--sn-syntax-keyword',
      '--sn-cell-dot',
      '--sn-theme-pattern-brightness',
      '--sn-cell-base-alpha',
      '--sn-cell-alpha-span',
      '--sn-cell-noise',
      '--sn-node-icon-size',
      '--sn-node-pill-body-padding',
      '--sn-node-circle-body-padding',
      '--sn-node-comment-body-padding',
      '--sn-shape-icon-size',
      '--sn-port-label-size',
      '--sn-layout-header-icon-size',
    ];
    const renderTokens = () => {
      const computed = getComputedStyle(document.documentElement);
      grid.innerHTML = tokenNames.map((name) => `
        <div class="token-chip">
          <strong>${name}</strong>
          <span>${computed.getPropertyValue(name).trim()}</span>
        </div>
      `).join('');
    };

    tree.setItems([
      { id: 'theme', label: 'Theme', icon: 'palette', children: [
        { id: 'source', label: 'Source tokens', icon: 'tune' },
        { id: 'cascade', label: 'Cascade output', icon: 'waterfall_chart' },
      ] },
      { id: 'components', label: 'Components', icon: 'widgets', children: [
        { id: 'layout', label: 'Layout', icon: 'view_quilt' },
        { id: 'graph', label: 'Graph canvas', icon: 'hub' },
        { id: 'chat', label: 'Chat', icon: 'forum' },
        { id: 'controls', label: 'Controls', icon: 'smart_button' },
      ] },
    ]);
    tree.showTree?.();
    tree.selectedId = 'cascade';
    this.ref.loading.setProgress(64, 'Composing UI', 'Hydrating reusable surfaces');
    this.ref.status.$.fadeTimeout = 60000;
    this.ref.status.$.statusText = 'Constructor surfaces ready';
    this.ref.status.$.visible = true;
    this.ref.events.setEvents([
      {
        direction: 'call',
        tool: 'component.describe',
        args: { tagName: 'sn-data-table' },
        timeText: 'now',
      },
      {
        direction: 'result',
        tool: 'component.describe',
        success: true,
        durationText: '24ms',
        preview: {
          type: 'list',
          title: 'Descriptor fields',
          value: ['componentDescription', 'contract.webmcp', 'contract.ssr'],
        },
      },
      {
        direction: 'result',
        tool: 'component.render',
        success: true,
        durationText: '41ms',
        preview: {
          type: 'code',
          lang: 'js',
          value: 'layout.openPanel("source", { uiInvoked: true });',
        },
      },
    ]);
    this.ref.table.setData({
      columns: [
        { key: 'component', label: 'Component' },
        { key: 'role', label: 'Role' },
        { key: 'state', label: 'State', align: 'center' },
      ],
      rows: [
        {
          id: 'table',
          component: 'sn-data-table',
          role: 'tabular data',
          cells: { state: { badge: { label: 'ready', variant: 'success' } } },
        },
        {
          id: 'feed',
          component: 'sn-event-feed',
          role: 'tool trace',
          cells: { state: { badge: { label: 'live', variant: 'info' } } },
        },
        {
          id: 'source',
          component: 'source-viewer',
          role: 'source panel',
          cells: { state: { badge: { label: 'agent', variant: 'warning' } } },
        },
      ],
      emptyText: 'No constructor surfaces',
    });
    this.ref.source.showFile({
      path: 'agent-ui/constructor.js',
      lang: 'js',
      raw: [
        'let descriptor = catalog.find((item) => item.tagName === "sn-event-feed");',
        'layout.openPanel("events", { uiInvoked: true, source: "agent" });',
        'events.setEvents(toolTrace);',
      ].join('\n'),
      statsText: '3 agent-visible steps',
    });
    this._renderTokens = renderTokens;
    renderTokens();
    document.addEventListener('cascade-theme-change', renderTokens);
  }

  disconnectedCallback() {
    if (this._renderTokens) {
      document.removeEventListener('cascade-theme-change', this._renderTokens);
    }
    super.disconnectedCallback?.();
  }
}

CascadeUiPanel.template = html`
      <section class="sample-panel">
        <sn-banner variant="info">Cascade tokens update this banner without component-local theme calls.</sn-banner>
        <div class="sample-row">
          <sn-button variant="primary">primary</sn-button>
          <sn-button>default</sn-button>
          <sn-button variant="icon" title="Icon button"><span class="material-symbols-outlined">bolt</span></sn-button>
          <sn-badge>agent</sn-badge>
          <sn-badge variant="success">live</sn-badge>
        </div>
        <div class="sample-scroll">
          <div class="sample-stack">
            <sn-card>
              <strong>Provider surface</strong>
              <p>Cards, controls, graph nodes, and scrollbars read the same inherited variables.</p>
            </sn-card>
            <div class="constructor-surface-grid">
              <div class="constructor-overlay-sample">
                <sn-loading-overlay ${{ ref: 'loading' }}></sn-loading-overlay>
              </div>
              <sn-status-ribbon ${{ ref: 'status' }}></sn-status-ribbon>
              <sn-empty-state>
                <strong>No host data</strong>
                <span>Agents can mount an empty state while a host-owned query resolves.</span>
              </sn-empty-state>
              <sn-event-feed ${{ ref: 'events' }}></sn-event-feed>
              <sn-list-detail-shell
                has-detail
                sidebar-title="Surfaces"
                sidebar-icon="view_sidebar"
                detail-title="Source viewer"
                detail-icon="code"
                detail-description="Host-owned file data"
              >
                <div slot="list" class="constructor-list">
                  <button type="button" class="constructor-list-item" data-active>source-viewer</button>
                  <button type="button" class="constructor-list-item">sn-data-table</button>
                  <button type="button" class="constructor-list-item">sn-event-feed</button>
                </div>
                <source-viewer slot="detail" ${{ ref: 'source' }}></source-viewer>
              </sn-list-detail-shell>
              <sn-data-table ${{ ref: 'table' }}></sn-data-table>
            </div>
            <div class="token-grid" data-token-grid ${{ ref: 'grid' }}></div>
            <sn-tree-panel title="Cascade tree" title-icon="account_tree" ${{ ref: 'tree' }}></sn-tree-panel>
          </div>
        </div>
      </section>
`;

CascadeUiPanel.rootStyles = `
  cascade-ui-panel {
    display: block;
    width: 100%;
    height: 100%;
  }

  cascade-ui-panel .constructor-surface-grid {
    display: grid;
    grid-template-columns: minmax(0, 0.86fr) minmax(0, 1.14fr);
    gap: calc(var(--sn-space, 1rem) * 0.7);
    min-width: 0;
  }

  cascade-ui-panel .constructor-overlay-sample,
  cascade-ui-panel sn-status-ribbon,
  cascade-ui-panel sn-empty-state {
    min-height: 84px;
    border: var(--sn-node-border-width, 1px) solid var(--sn-sys-outline);
    border-radius: var(--sn-node-radius, 8px);
    background: var(--sn-sys-surface-panel);
  }

  cascade-ui-panel .constructor-overlay-sample {
    position: relative;
    overflow: hidden;
  }

  cascade-ui-panel sn-status-ribbon {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: calc(var(--sn-space, 1rem) * 0.55);
  }

  cascade-ui-panel sn-empty-state {
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: calc(var(--sn-space, 1rem) * 0.28);
    padding: calc(var(--sn-space, 1rem) * 0.65);
    color: var(--sn-sys-on-surface-dim);
  }

  cascade-ui-panel sn-empty-state strong {
    color: var(--sn-sys-on-surface);
  }

  cascade-ui-panel sn-event-feed,
  cascade-ui-panel sn-list-detail-shell,
  cascade-ui-panel sn-data-table {
    min-height: 180px;
    min-width: 0;
  }

  cascade-ui-panel sn-list-detail-shell,
  cascade-ui-panel sn-data-table {
    grid-column: 1 / -1;
  }

  cascade-ui-panel source-viewer {
    min-height: 220px;
    min-width: 0;
  }

  cascade-ui-panel .constructor-list {
    display: grid;
    gap: calc(var(--sn-space, 1rem) * 0.35);
    padding: calc(var(--sn-space, 1rem) * 0.45);
  }

  cascade-ui-panel .constructor-list-item {
    min-width: 0;
    min-height: calc(var(--sn-control-height, 2rem) * 0.9);
    border: var(--sn-node-border-width, 1px) solid var(--sn-sys-outline);
    border-radius: var(--sn-control-radius, 0.45rem);
    background: var(--sn-control-bg, var(--sn-sys-surface-raised));
    color: var(--sn-control-fg, var(--sn-sys-on-surface));
    font: inherit;
    text-align: left;
    padding: 0 calc(var(--sn-space, 1rem) * 0.55);
  }

  cascade-ui-panel .constructor-list-item[data-active] {
    border-color: var(--sn-sys-accent);
    background: var(--sn-node-selected-bg, var(--sn-accent-bg-subtle));
  }

  @media (max-width: 760px) {
    cascade-ui-panel .constructor-surface-grid {
      grid-template-columns: minmax(0, 1fr);
    }
  }
`;

CascadeUiPanel.reg('cascade-ui-panel');

const PROJECT_TREE_ITEMS = [
  {
    id: 'src',
    label: 'src',
    icon: 'folder',
    children: [
      {
        id: 'src/components',
        label: 'components',
        icon: 'folder',
        children: [
          { id: 'src/components/chat-composer.js', label: 'chat-composer.js', icon: 'forum', badges: ['voice'] },
          { id: 'src/components/node-canvas.js', label: 'node-canvas.js', icon: 'hub', badges: ['graph'] },
          { id: 'src/components/source-viewer.js', label: 'source-viewer.js', icon: 'article', badges: ['md'] },
        ],
      },
      {
        id: 'src/runtime',
        label: 'runtime',
        icon: 'folder',
        children: [
          { id: 'src/runtime/intent-router.js', label: 'intent-router.js', icon: 'alt_route', badges: ['WebMCP'] },
          { id: 'src/runtime/layout-state.js', label: 'layout-state.js', icon: 'view_quilt', badges: ['SSR'] },
        ],
      },
    ],
  },
  {
    id: 'docs',
    label: 'docs',
    icon: 'folder',
    children: [
      { id: 'docs/agent-workspace.md', label: 'agent-workspace.md', icon: 'description', badges: ['rendered'] },
      { id: 'docs/webmcp.md', label: 'webmcp.md', icon: 'api', badges: ['agent'] },
    ],
  },
  {
    id: 'layouts',
    label: 'layouts',
    icon: 'folder',
    children: [
      { id: 'layouts/default.layout.json', label: 'default.layout.json', icon: 'data_object', badges: ['live'] },
      { id: 'layouts/chat.layout.json', label: 'chat.layout.json', icon: 'forum', badges: ['chat'] },
    ],
  },
];

const PROJECT_GRAPH_MODEL = {
  nodes: [
    { id: 'src', label: 'src', type: 'data', isGroup: true, children: ['chat', 'canvas', 'viewer', 'runtime'] },
    { id: 'docs', label: 'docs', type: 'docs', isGroup: true, children: ['readme', 'webmcp'] },
    { id: 'layouts', label: 'layouts', type: 'config', isGroup: true, children: ['layout-default', 'layout-chat'] },
    { id: 'chat', label: 'chat-composer.js', type: 'action', parentId: 'src' },
    { id: 'canvas', label: 'node-canvas.js', type: 'output', parentId: 'src' },
    { id: 'viewer', label: 'source-viewer.js', type: 'docs', parentId: 'src' },
    { id: 'runtime', label: 'intent-router.js', type: 'action', parentId: 'src' },
    { id: 'readme', label: 'agent-workspace.md', type: 'docs', parentId: 'docs' },
    { id: 'webmcp', label: 'webmcp.md', type: 'docs', parentId: 'docs' },
    { id: 'layout-default', label: 'default.layout.json', type: 'config', parentId: 'layouts' },
    { id: 'layout-chat', label: 'chat.layout.json', type: 'config', parentId: 'layouts' },
  ],
  edges: [
    { from: 'runtime', to: 'chat' },
    { from: 'runtime', to: 'canvas' },
    { from: 'viewer', to: 'readme' },
    { from: 'webmcp', to: 'runtime' },
    { from: 'layout-default', to: 'canvas' },
    { from: 'layout-chat', to: 'chat' },
  ],
  rootNodes: ['src', 'docs', 'layouts'],
};

class CascadeProjectPanel extends Symbiote {
  initCallback() {
    this.addEventListener('sn-tree-select', (event) => {
      this._selectProjectFile(event.detail?.item);
    });
  }

  renderCallback() {
    if (this._ready) return;
    this._ready = true;
    this.ref.tree.setItems(PROJECT_TREE_ITEMS);
    this.ref.tree.showTree?.();
    this.ref.tree.defaultExpandedIds = ['src', 'src/components', 'src/runtime', 'docs', 'layouts'];
    this.ref.tree.selectedId = 'docs/agent-workspace.md';
  }

  _selectProjectFile(item) {
    if (!item || Array.isArray(item.children)) return;
    this.ref.tree.selectedId = item.id;
    this.dispatchEvent(new CustomEvent('cascade-project-file-select', {
      detail: { item },
      bubbles: true,
      composed: true,
    }));
  }
}

CascadeProjectPanel.template = html`
  <section class="project-files-panel">
    <sn-tree-panel
      class="project-file-tree"
      title="Project files"
      title-icon="account_tree"
      filter-placeholder="Filter project files"
      ${{ ref: 'tree' }}
    ></sn-tree-panel>
    <footer class="project-files-contract">
      <span class="material-symbols-outlined" aria-hidden="true">sync_alt</span>
      <span>Tree selection emits file intent. Source, docs, and graph render in separate layout panels.</span>
    </footer>
  </section>
`;

const PROJECT_SOURCE_SAMPLE = [
  'import { createRuntimeUiController } from "symbiote-ui/runtime";',
  '',
  'const controller = createRuntimeUiController({ root, layout });',
  '',
  'controller.create({',
  '  id: "chat-surface",',
  '  tagName: "chat-composer",',
  '  state: {',
  '    methods: {',
  '      setVoiceControls: [{ input: { visible: true }, wakeListen: { visible: true } }]',
  '    }',
  '  }',
  '});',
  '',
  'layout.openPanel("chat", { uiInvoked: true, source: "agent" });',
].join('\n');

const PROJECT_MARKDOWN_SAMPLE = [
  '# Agent workspace',
  '',
  'The same library renders project navigation, source editing, markdown previews, chat controls, graph construction, and live layout panels.',
  '',
  '- `sn-tree-panel` owns project/file navigation.',
  '- `source-editor` edits host-owned source text.',
  '- `source-viewer` renders code, markdown, images, and diagnostics.',
  '- `canvas-graph` shows a project overview graph distinct from editable `node-canvas`.',
].join('\n');

class CascadeSourcePanel extends Symbiote {
  renderCallback() {
    if (this._ready) return;
    this._ready = true;
    this.ref.editor.setLanguage('js');
    this.ref.editor.setContent(PROJECT_SOURCE_SAMPLE);
  }
}

CascadeSourcePanel.template = html`
  <section class="project-source-panel">
    <header class="project-panel-intro">
      <span class="material-symbols-outlined" aria-hidden="true">code</span>
      <div>
        <strong>Source editor</strong>
        <span>One focused panel for agent-authored code and runtime intents.</span>
      </div>
    </header>
    <source-editor
      class="project-source-editor"
      aria-label="Agent-authored source editor"
      ${{ ref: 'editor' }}
    ></source-editor>
  </section>
`;

class CascadeDocsPanel extends Symbiote {
  renderCallback() {
    if (this._ready) return;
    this._ready = true;
    this.ref.viewer.showFile({
      path: 'docs/agent-workspace.md',
      lang: 'md',
      raw: PROJECT_MARKDOWN_SAMPLE,
      statsText: 'rendered markdown',
    });
  }
}

CascadeDocsPanel.template = html`
  <section class="project-docs-panel">
    <source-viewer class="project-markdown-viewer" ${{ ref: 'viewer' }}></source-viewer>
  </section>
`;

class CascadeProjectMapPanel extends Symbiote {
  renderCallback() {
    if (this._ready) return;
    this._ready = true;
    this.ref.graph.setGraphModel(PROJECT_GRAPH_MODEL);
    setTimeout(() => {
      this.ref.graph.fitView?.(46, false);
      this.ref.graph.pulseNode?.('runtime', 1800);
    }, 120);
  }
}

CascadeProjectMapPanel.template = html`
  <graph-explorer-shell class="project-canvas-graph-shell">
    <canvas-graph slot="canvas" ${{ ref: 'graph' }}></canvas-graph>
    <div class="graph-explorer-stats project-graph-stats" slot="stats">
      <span>canvas-graph</span><span>project overview</span>
    </div>
  </graph-explorer-shell>
`;

const PROJECT_WORKSPACE_STYLES = `
  cascade-project-panel,
  cascade-source-panel,
  cascade-docs-panel,
  cascade-project-map-panel {
    display: block;
    width: 100%;
    height: 100%;
    min-height: 0;
  }

  cascade-project-panel .project-files-panel,
  cascade-source-panel .project-source-panel,
  cascade-docs-panel .project-docs-panel {
    display: flex;
    flex-direction: column;
    gap: var(--sn-lab-panel-gap, 12px);
    height: 100%;
    min-height: 0;
    padding: var(--sn-lab-panel-padding, 12px);
    overflow: hidden;
    background: var(--sn-sys-surface-panel);
    color: var(--sn-sys-on-surface);
  }

  cascade-project-panel .project-file-tree {
    flex: 1 1 auto;
    min-width: 0;
    min-height: 0;
    border: var(--sn-node-border-width, 1px) solid var(--sn-sys-outline);
    border-radius: var(--sn-node-radius);
    background: var(--sn-sys-surface);
  }

  cascade-project-panel .project-files-contract,
  cascade-source-panel .project-panel-intro {
    display: flex;
    align-items: center;
    gap: var(--sn-lab-panel-gap, 12px);
    min-height: calc(var(--sn-layout-header-height, 32px) * 1.4);
    padding: 8px 10px;
    border: var(--sn-node-border-width, 1px) solid var(--sn-sys-outline);
    border-radius: var(--sn-node-radius);
    background: var(--sn-sys-surface-raised);
    color: var(--sn-sys-on-surface-dim);
    font-size: var(--sn-small-size, 0.78rem);
    line-height: 1.35;
  }

  cascade-source-panel .project-panel-intro strong {
    display: block;
    color: var(--sn-sys-on-surface);
    font-size: calc(var(--sn-body-size, 1rem) * 0.96);
  }

  cascade-source-panel .project-panel-intro span:not(.material-symbols-outlined) {
    display: block;
  }

  cascade-project-panel .project-files-contract .material-symbols-outlined,
  cascade-source-panel .project-panel-intro .material-symbols-outlined {
    color: var(--sn-primary);
    font-size: calc(20px * var(--sn-theme-type-scale, 1));
  }

  cascade-source-panel .project-source-editor,
  cascade-docs-panel .project-markdown-viewer,
  cascade-project-map-panel .project-canvas-graph-shell {
    flex: 1 1 auto;
    min-width: 0;
    min-height: 0;
    border: var(--sn-node-border-width, 1px) solid var(--sn-sys-outline);
    border-radius: var(--sn-node-radius);
    background: var(--sn-sys-surface);
    overflow: hidden;
  }

  cascade-project-map-panel .project-canvas-graph-shell {
    width: 100%;
    height: 100%;
  }

  cascade-project-map-panel canvas-graph {
    width: 100%;
    height: 100%;
  }

  cascade-project-map-panel .project-graph-stats {
    display: inline-flex;
    gap: 8px;
    color: var(--sn-sys-on-surface-dim);
    font-size: var(--sn-small-size, 0.78rem);
  }

  @media (max-width: 900px) {
    cascade-project-panel .project-files-panel,
    cascade-source-panel .project-source-panel,
    cascade-docs-panel .project-docs-panel {
      padding: 10px;
    }
  }
`;

CascadeProjectPanel.rootStyles = PROJECT_WORKSPACE_STYLES;
CascadeProjectPanel.reg('cascade-project-panel');
CascadeSourcePanel.rootStyles = PROJECT_WORKSPACE_STYLES;
CascadeSourcePanel.reg('cascade-source-panel');
CascadeDocsPanel.rootStyles = PROJECT_WORKSPACE_STYLES;
CascadeDocsPanel.reg('cascade-docs-panel');
CascadeProjectMapPanel.rootStyles = PROJECT_WORKSPACE_STYLES;
CascadeProjectMapPanel.reg('cascade-project-map-panel');

class CascadeChatPanel extends Symbiote {
  initCallback() {
    this._activeChatId = 'project-graph';
    this._footerState = {
      provider: 'gemini',
      model: 'gemini-2.5-pro',
      agent: 'neurology',
      task: 'dns',
    };
    this._hostEventCount = 0;
    this._hostFlowStep = 'ready';
    this._isStreaming = false;
    this._streamTimers = [];
    this._voiceDemoMode = 'idle';
    this._voiceDemoState = 'idle';
    this._voiceDemoWakeMatched = false;
    this._speakingVoiceResponse = false;
    this._voiceResponseLastText = '';

    this._ensureMockThreads();

    let voiceSettings = readStoredChatVoiceSettings();
    this._voiceLanguageMode = voiceSettings.languageMode;
    this._voiceResponseEnabled = voiceSettings.voiceResponseEnabled;
    this._voiceCommandMode = true;
    this._voiceCommandPhrases = defaultSendCommandPhrases();
    this._voiceActionCommandPhrases = {
      send: {
        en: [this._voiceCommandPhrases.en],
        ru: [this._voiceCommandPhrases.ru],
        es: [this._voiceCommandPhrases.es],
      },
      ...defaultVoiceActionCommandPhrases(),
    };
    this._wakeCommandPhrases = defaultWakeCommandPhrases();

    this.addEventListener('chat-workspace-input', (event) => {
      this._triggerBg(1600);
      this._handleVoiceCommandText(event.detail?.value || '');
    });
    this.addEventListener('chat-workspace-submit', (event) => this._handleWorkspaceSend(event));
    this.addEventListener('chat-workspace-send', (event) => this._handleWorkspaceSend(event));
    this.addEventListener('chat-workspace-stop', () => this._stopMockStream('manual-stop'));
    this.addEventListener('chat-workspace-chat-select', (event) => this._selectMockChat(event.detail?.chatId));
    this.addEventListener('chat-workspace-footer-intent', (event) => this._handleWorkspaceFooterIntent(event));
    this.addEventListener('chat-workspace-context-intent', (event) => this._handleWorkspaceContextIntent(event));
    this.addEventListener('chat-workspace-voice-intent', (event) => this._handleWorkspaceVoiceIntent(event));
    queueMicrotask(() => this._setupWorkspace());
  }

  _getWorkspace() {
    return this.ref?.workspace || this.querySelector('chat-workspace');
  }

  _getComposer() {
    return this._getWorkspace()?.getComposer?.();
  }

  _getSidebar() {
    return this._getWorkspace()?.getSidebar?.();
  }

  _ensureMockThreads() {
    if (this._mockMessagesByChat) return;
    this._mockMessagesByChat = new Map([
      ['project-graph', this._initialProjectGraphMessages()],
      ['architecture-audit', [
        {
          role: 'user',
          text: 'Show the architecture audit handoff as reusable chat UI.',
        },
        {
          role: 'agent',
          text: 'The host selects a child chat, but `chat-workspace` still renders the transcript, composer, voice controls, and background through the same public component contract.',
        },
        {
          role: 'thinking',
          done: true,
          elapsed: 4,
          meta: { mode: 'auto_edit', exitCode: 0, tools: 1, tokens: 1180, cost: 0.0032, sessionId: 'demo-architecture-audit' },
        },
      ]],
      ['browser-smoke', [
        {
          role: 'user',
          text: 'Run the browser smoke path for the showcase.',
        },
        {
          role: 'tool',
          name: 'browser_smoke/cascade-theme-lab',
          input: { route: '#chat/conversation' },
          result: { workspace: 'ok', composer: 'ok', background: 'ok' },
          done: true,
        },
        {
          role: 'agent',
          text: 'The smoke route verifies one chat workspace, library voice controls, and a full-height animated background.',
        },
      ]],
      ['codex', [
        {
          role: 'agent',
          text: 'Codex owns the host adapter in this demo: it changes footer params, streams responses, and stops background activity without taking over component internals.',
        },
      ]],
      ['webmcp', [
        {
          role: 'tool',
          name: 'webmcp.describe_component',
          input: { component: 'chat-workspace', descriptor: 'component-descriptor-v2' },
          result: { tools: ['chat_workspace_set_state', 'chat_workspace_send'], visibility: 'agent-readable' },
          done: true,
        },
        {
          role: 'board',
          streaming: true,
          cardItems: [
            { id: 'descriptor', title: 'Descriptor', icon: 'data_object', status: 'done', statusText: 'Schema ready' },
            { id: 'permissions', title: 'Permissions', icon: 'verified_user', status: 'running', statusText: 'Checking hints' },
          ],
        },
        {
          role: 'agent',
          text: [
            'WebMCP metadata describes the same methods and events agents use to construct chat workspaces: state, select chat, send, voice intents, and background lifecycle.',
            '',
            '| Field | Purpose |',
            '| --- | --- |',
            '| `inputSchema` | agent-visible component contract |',
            '| `annotations` | read/write and permission hints |',
            '',
            '```json',
            '{ "name": "chat_workspace_send", "visibility": "agent-readable" }',
            '```',
          ].join('\n'),
        },
        {
          role: 'thinking',
          done: true,
          elapsed: 4,
          meta: { mode: 'plan', exitCode: 0, tools: 1, tokens: 740, cost: 0.0018, sessionId: 'demo-webmcp-contract' },
        },
      ]],
    ]);
  }

  _initialProjectGraphMessages() {
    return [
      {
        role: 'user',
        text: 'Describe the project-graph-mcp package — AST analysis, tools, and how it provides codebase context.',
      },
      {
        role: 'system',
        text: 'Public showcase mode uses safe mock data. No private workspace, token, or local path is exposed.',
      },
      {
        role: 'thinking',
        done: false,
        elapsed: 2,
        status: 'Reading project graph, chat surface, voice command, and WebMCP contracts',
      },
      {
        role: 'tool',
        name: 'get_skeleton/workspace/agent-portal/packages/project-graph-mcp',
        input: { path: '/workspace/agent-portal/packages/project-graph-mcp' },
        result: {
          project: 'project-graph-mcp',
          stats: { files: 28, functions: 76, lines: 3800 },
          dirs: ['src/analysis/', 'src/tools/', 'src/rules/'],
        },
        done: true,
      },
      {
        role: 'board',
        streaming: true,
        cardItems: [
          {
            id: 'context-graph',
            title: 'Context graph',
            icon: 'account_tree',
            status: 'done',
            statusText: '28 files and 76 functions mapped',
            linkId: 'project-graph',
          },
          {
            id: 'browser-smoke',
            title: 'Browser smoke',
            icon: 'smart_display',
            status: 'running',
            statusText: 'Checking chat workspace and background lifecycle',
            linkId: 'browser-smoke',
          },
          {
            id: 'webmcp-metadata',
            title: 'WebMCP metadata',
            icon: 'hub',
            status: 'queued',
            statusText: 'Descriptors available for agents',
            linkId: 'webmcp',
          },
        ],
      },
      {
        role: 'agent',
        text: [
          '## Agent workspace',
          '',
          'Agent Portal is running here in public demo mode. This instance shows the current application UI against safe mock data, so clients can inspect the product without touching private agents, workspaces, or secrets.',
          '',
          'Project Graph MCP provides codebase context through AST analysis, skeleton extraction, dependency views, and tool-facing summaries. In `symbiote-ui`, the same chat primitives render the transcript, tool calls, voice controls, sidebar state, and animated background as reusable components.',
          '',
          '| Chat data | Rendered by library | Agent-facing use |',
          '| --- | --- | --- |',
          '| markdown | headings, tables, code, links | explain work and decisions |',
          '| tool | input/result cards | expose structured tool calls |',
          '| board | status cards | show parallel agent work |',
          '| thinking | live and completed work summaries | audit execution state |',
          '',
          '```js',
          'workspace.setWorkspaceState({',
          '  messages,',
          '  composer: { voiceControls, footerControls },',
          '  background: { state: "streaming", active: true },',
          '});',
          '```',
          '',
          'Useful links:',
          '- Main site: https://rnd-pro.com/',
          '- Playground: https://playground.rnd-pro.com/',
        ].join('\n'),
      },
      {
        role: 'thinking',
        done: true,
        elapsed: 5,
        meta: { mode: 'auto_edit', exitCode: 0, tools: 2, tokens: 3600, cost: 0.0108, sessionId: 'demo-project-graph-chat-contract' },
      },
      {
        role: 'tool',
        name: 'component_descriptor/chat-workspace',
        input: { component: 'chat-workspace', contract: 'webmcp', visibility: 'agent-readable' },
        result: {
          events: ['chat-workspace-send', 'chat-workspace-voice-intent', 'status-card-open'],
          methods: ['setWorkspaceState', 'setMessages', 'setVoiceControls', 'triggerBackground'],
          renderers: ['markdown', 'tool', 'board', 'thinking-summary', 'voice-preview'],
        },
        done: true,
      },
      {
        role: 'agent',
        text: [
          'The chat demo intentionally keeps rendering logic in `symbiote-ui`: the host supplies message data, and the library owns markdown, code highlighting tokens, tool details, status cards, completed work summaries, voice preview, language toggle, and animated background state.',
          '',
          '> Relative shade differences come from cascade tokens, not local per-message colors.',
        ].join('\n'),
      },
      {
        role: 'thinking',
        done: true,
        elapsed: 3,
        meta: { mode: 'plan', exitCode: 0, tools: 1, tokens: 910, cost: 0.0021, sessionId: 'demo-chat-display-types' },
      },
    ];
  }

  _mockChatCatalog() {
    return [
      {
        id: 'project-graph',
        name: 'What is Project Graph?',
        cleanName: 'What is Project Graph?',
        icon: 'chat',
        isActive: this._activeChatId === 'project-graph',
        isExpanded: true,
        subChats: [
          {
            id: 'architecture-audit',
            name: 'Architecture audit',
            cleanName: 'Architecture audit',
            icon: 'account_tree',
            metaLabel: 'Agent',
            statusKind: 'done',
            statusIcon: 'check_circle',
            statusTitle: 'Completed',
            composerDisabled: true,
          },
          {
            id: 'browser-smoke',
            name: 'Browser smoke',
            cleanName: 'Browser smoke',
            icon: 'smart_display',
            metaLabel: 'Agent',
            statusKind: 'done',
            statusIcon: 'check_circle',
            statusTitle: 'Completed',
            composerDisabled: true,
          },
        ],
      },
      {
        id: 'codex',
        name: 'Codex handoff',
        cleanName: 'Codex handoff',
        icon: 'terminal',
        metaLabel: 'codex',
        isActive: this._activeChatId === 'codex',
      },
      {
        id: 'webmcp',
        name: 'WebMCP contract',
        cleanName: 'WebMCP contract',
        icon: 'hub',
        metaLabel: 'webmcp',
        isActive: this._activeChatId === 'webmcp',
      },
    ];
  }

  _getActiveMessages() {
    this._ensureMockThreads();
    if (!this._mockMessagesByChat.has(this._activeChatId)) {
      this._mockMessagesByChat.set(this._activeChatId, []);
    }
    return this._mockMessagesByChat.get(this._activeChatId);
  }

  _setActiveMessages(messages) {
    this._ensureMockThreads();
    this._mockMessagesByChat.set(this._activeChatId, Array.isArray(messages) ? messages : []);
  }

  _activeChatDescriptor() {
    let stack = [...this._mockChatCatalog()];
    while (stack.length) {
      let item = stack.shift();
      if (item.id === this._activeChatId) return item;
      if (Array.isArray(item.subChats)) stack.push(...item.subChats);
    }
    return null;
  }

  _isActiveChatHumanInputDisabled() {
    return Boolean(this._activeChatDescriptor()?.composerDisabled);
  }

  _appendActiveMessage(message) {
    let messages = [...this._getActiveMessages(), message];
    this._setActiveMessages(messages);
    this._getWorkspace()?.setMessages?.(messages, { smooth: true });
  }

  _buildFooterControls() {
    return [
      {
        id: 'provider',
        kind: 'select',
        label: 'provider',
        icon: 'cloud',
        value: this._footerState.provider,
        priority: 1,
        options: [
          { value: 'codex', label: 'codex' },
          { value: 'gemini', label: 'gemini' },
          { value: 'opencode', label: 'opencode' },
        ],
      },
      {
        id: 'model',
        kind: 'select',
        label: 'model',
        icon: 'memory',
        value: this._footerState.model,
        priority: 2,
        options: [
          { value: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
          { value: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
          { value: 'gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash-Lite' },
        ],
      },
      {
        id: 'agent',
        kind: 'button',
        label: 'agent',
        value: this._footerState.agent,
        icon: 'psychology',
        priority: 3,
      },
      {
        id: 'task',
        kind: 'button',
        label: 'task',
        value: this._footerState.task,
        icon: 'task_alt',
        priority: 4,
      },
      {
        id: 'settings',
        kind: 'intent',
        label: 'settings',
        icon: 'tune',
        priority: 5,
      },
    ];
  }

  _syncWorkspaceState({ scrollToBottom = true, preserveComposerValue = true } = {}) {
    let workspace = this._getWorkspace();
    if (!workspace) return;
    let composer = this._getComposer();
    let composerDisabled = this._isActiveChatHumanInputDisabled();
    workspace.setWorkspaceState({
      chats: this._mockChatCatalog(),
      activeChatId: this._activeChatId,
      messages: this._getActiveMessages(),
      messagesOptions: { scrollToBottom, smooth: false },
      empty: false,
      composer: {
        disabled: composerDisabled,
        placeholder: composerDisabled
          ? 'This sub-agent chat is controlled by the orchestrator.'
          : 'Ask the agent to inspect a package, run a smoke test, or build a layout...',
        value: composerDisabled
          ? ''
          : preserveComposerValue
            ? (composer?.$.value || '')
            : '',
        attachedContext: [
          { key: 'theme', name: 'cascade-theme', title: 'Cascade theme contract', icon: 'palette' },
          { key: 'chat', name: 'chat-surface', title: 'Chat components', icon: 'forum' },
        ],
        footerControls: this._buildFooterControls(),
        sending: this._isStreaming,
        voiceControls: this._buildVoiceControlsConfig(),
      },
    });
  }

  _buildVoiceControlsConfig(state = this._voiceDemoState || 'idle') {
    let normalized = ['idle', 'listening', 'transcribing', 'speaking', 'disabled'].includes(state)
      ? state
      : 'idle';
    let voiceAvailable = normalized !== 'disabled';
    let activeMode = voiceAvailable ? (this._voiceDemoMode || 'idle') : 'idle';
    let isManualVoice = activeMode === 'manual' && ['listening', 'transcribing'].includes(normalized);
    let isWakeVoice = activeMode === 'wake' && ['listening', 'transcribing', 'speaking'].includes(normalized);
    let isWakeDictation = isWakeVoice && this._voiceDemoWakeMatched;
    let voiceModeActive = isManualVoice || isWakeVoice;
    return {
      input: {
        visible: voiceAvailable,
        state: isManualVoice ? normalized : isWakeDictation ? normalized : 'idle',
        enabled: voiceAvailable,
      },
      wakeListen: {
        visible: voiceAvailable,
        enabled: voiceAvailable,
        active: isWakeVoice,
        commandText: isWakeVoice ? this._getWakeCommandPhrase() : '',
      },
      response: {
        visible: isWakeVoice,
        enabled: isWakeVoice && voiceAvailable,
        active: this._voiceResponseEnabled,
        speaking: this._speakingVoiceResponse || normalized === 'speaking',
      },
      command: { visible: voiceModeActive, enabled: voiceModeActive, active: this._voiceCommandMode, text: 'Commands' },
      language: {
        visible: voiceModeActive,
        enabled: voiceModeActive,
        mode: this._voiceLanguageMode,
        options: this._voiceLanguageOptions(),
      },
    };
  }

  _recordHostEvent(type, detail = {}) {
    this._hostEventCount += 1;
    this._hostFlowStep = type;
    this.dataset.hostEventCount = String(this._hostEventCount);
    this.dataset.hostFlowStep = type;
    this.dataset.activeChatId = this._activeChatId;
    if (detail.id) this.dataset.lastFooterIntent = detail.id;
    this.dispatchEvent(new CustomEvent('cascade-chat-host-flow', {
      bubbles: true,
      composed: true,
      detail: {
        type,
        activeChatId: this._activeChatId,
        footerState: { ...this._footerState },
        ...detail,
      },
    }));
  }

  _selectMockChat(chatId = '') {
    if (!chatId) return;
    this._activeChatId = String(chatId);
    this._clearStreamTimers();
    this._isStreaming = false;
    this._recordHostEvent('select-chat', { chatId: this._activeChatId });
    this._syncWorkspaceState({ scrollToBottom: false, preserveComposerValue: true });
    this._triggerBg(2400);
  }

  _handleWorkspaceFooterIntent(event) {
    let detail = event.detail || {};
    let id = String(detail.id || '');
    if (!id) return;
    if (id === 'provider' || id === 'model') {
      this._footerState[id] = detail.value || this._footerState[id];
    }
    if (id === 'agent') this._footerState.agent = this._footerState.agent === 'neurology' ? 'orchestrator' : 'neurology';
    if (id === 'task') this._footerState.task = this._footerState.task === 'dns' ? 'layout' : 'dns';
    if (id === 'settings') {
      this._getComposer()?.setVoicePreview?.({
        mode: 'result',
        status: 'footer intent',
        text: `Host settings opened for ${this._footerState.provider}/${this._footerState.model}.`,
      });
    }
    this._syncWorkspaceState({ scrollToBottom: false, preserveComposerValue: true });
    this._recordHostEvent('footer-intent', { id, value: detail.value || this._footerState[id] || '' });
    this._triggerBg(1800);
  }

  _handleWorkspaceContextIntent(event) {
    let detail = event.detail || {};
    this._recordHostEvent('context-intent', { id: detail.key || detail.path || 'context' });
    this._triggerBg(1600);
  }

  _handleWorkspaceSend(event) {
    event.preventDefault?.();
    if (this._isActiveChatHumanInputDisabled()) {
      this._triggerBg(1200);
      return;
    }
    if (this._isStreaming) {
      this._stopMockStream('manual-stop');
      return;
    }
    let value = String(event.detail?.value || this._getComposer()?.$.value || '').trim();
    if (!value) {
      this._triggerBg(1200);
      return;
    }
    this._startMockStream(value);
  }

  _startMockStream(value) {
    this._clearStreamTimers();
    this._isStreaming = true;
    this._recordHostEvent('stream-start', { value });
    let messages = [
      ...this._getActiveMessages(),
      { role: 'user', text: value },
      {
        role: 'thinking',
        done: false,
        elapsedText: '0s',
        metaHtml: '<span>mock host adapter</span><span>streaming</span>',
      },
    ];
    this._setActiveMessages(messages);
    this._getWorkspace()?.setWorkspaceState({
      messages,
      messagesOptions: { smooth: true },
      composer: {
        value: '',
        sending: true,
        footerControls: this._buildFooterControls(),
        voiceControls: this._buildVoiceControlsConfig(),
      },
      liveStatus: { phase: 'thinking', thinkingStatus: 'Planning mock host response...' },
      background: { state: 'streaming', active: true },
    });
    this._streamTimers.push(
      setTimeout(() => this._mockStreamToolStep(value), 500),
      setTimeout(() => this._mockStreamRespondingStep(), 1000),
      setTimeout(() => this._finishMockStream(value), 1500),
    );
  }

  _mockStreamToolStep(value) {
    if (!this._isStreaming) return;
    this._recordHostEvent('stream-tool', { value });
    this._appendActiveMessage({
      role: 'tool',
      name: 'mock_host_adapter.route_intent',
      input: {
        activeChatId: this._activeChatId,
        prompt: value,
        provider: this._footerState.provider,
        model: this._footerState.model,
      },
      result: {
        route: 'chat-workspace',
        events: ['select', 'footer', 'send', 'stream', 'stop', 'background'],
      },
      done: true,
    });
    this._getWorkspace()?.setLiveStatus?.({ phase: 'tool', lastToolName: 'mock_host_adapter.route_intent' });
  }

  _mockStreamRespondingStep() {
    if (!this._isStreaming) return;
    this._recordHostEvent('stream-responding');
    this._getWorkspace()?.setLiveStatus?.({ phase: 'responding' });
  }

  _finishMockStream(value) {
    if (!this._isStreaming) return;
    this._clearStreamTimers();
    this._isStreaming = false;
    this._recordHostEvent('stream-complete', { value });
    let responseText = [
      `Mock host adapter handled "${value}" through ${this._footerState.provider}/${this._footerState.model}.`,
      '',
      'The library provided the visible chat workspace, while the host owned selection, footer params, streaming state, and background lifecycle.',
    ].join('\n');
    this._appendActiveMessage({
      role: 'agent',
      text: responseText,
    });
    this._getWorkspace()?.setWorkspaceState({
      composer: {
        sending: false,
        footerControls: this._buildFooterControls(),
        voiceControls: this._buildVoiceControlsConfig(),
      },
      liveStatus: null,
      background: { state: 'done', active: false },
    });
    this._speakVoiceResponseText(responseText);
  }

  _stopMockStream(reason = 'stopped') {
    if (!this._isStreaming) return;
    this._clearStreamTimers();
    this._isStreaming = false;
    this._recordHostEvent('stream-stop', { reason });
    this._appendActiveMessage({
      role: 'agent',
      text: 'Mock stream stopped by the host adapter. The composer returned to send mode and the background entered smooth stop.',
    });
    this._getWorkspace()?.setWorkspaceState({
      composer: {
        sending: false,
        footerControls: this._buildFooterControls(),
        voiceControls: this._buildVoiceControlsConfig(),
      },
      liveStatus: null,
      background: { state: 'stop', active: false },
    });
  }

  _clearStreamTimers() {
    for (let timer of this._streamTimers || []) clearTimeout(timer);
    this._streamTimers = [];
  }

  _handleWorkspaceVoiceIntent(event) {
    let sourceEvent = event.detail?.sourceEvent;
    let useDefaultRuntime = typeof VoiceRuntime !== 'undefined' && VoiceRuntime.isAvailable;
    if (!useDefaultRuntime) event.preventDefault?.();

    if (sourceEvent === 'chat-composer-voice-input' || sourceEvent === 'chat-composer-wake-listen') {
      let action = event.detail?.action || 'start';
      if (sourceEvent === 'chat-composer-voice-input') {
        let wakeMode = this._voiceDemoMode === 'wake';
        this._recordHostEvent('voice-input', { action });
        this._setVoiceDemoState(action === 'stop' ? 'transcribing' : 'listening', this._voiceDemoMode === 'wake' ? 'wake' : 'manual', {
          wakeMatched: wakeMode,
          showPreview: !useDefaultRuntime,
        });
      } else {
        this._recordHostEvent('wake-listen', { action });
        this._setVoiceDemoState(action === 'stop' ? 'idle' : 'listening', action === 'stop' ? 'idle' : 'wake', {
          wakeMatched: false,
          showPreview: false,
        });
      }
      return;
    }
    if (sourceEvent === 'chat-composer-voice-response-toggle') {
      this._voiceResponseEnabled = !this._voiceResponseEnabled;
      if (!this._voiceResponseEnabled) this._cancelVoiceResponseSpeech();
      this._saveVoiceDemoSettings();
      this._syncVoiceControls();
      this._recordHostEvent('voice-response-toggle', { active: this._voiceResponseEnabled });
      return;
    }
    if (sourceEvent === 'chat-composer-voice-command-toggle') {
      this._voiceCommandMode = !this._voiceCommandMode;
      this._syncVoiceControls();
      this._triggerBg(3600);
      this._recordHostEvent('voice-command-toggle', { active: this._voiceCommandMode });
      return;
    }
    if (sourceEvent === 'chat-composer-voice-language-change') {
      let mode = event.detail?.mode || this._voiceLanguageMode;
      this._voiceLanguageMode = ['ru', 'es', 'en'].includes(mode) ? mode : this._voiceLanguageMode;
      this._saveVoiceDemoSettings();
      this._syncVoiceControls();
      this._triggerBg(2600);
      this._recordHostEvent('voice-language-change', { mode: this._voiceLanguageMode });
      return;
    }
    if (sourceEvent === 'chat-composer-voice-approve') {
      this._recordHostEvent('voice-approve');
      if (!useDefaultRuntime) {
        let text = this._getVoiceSubmissionText(event.detail);
        this._getComposer()?.clearVoicePreview?.();
        this._setVoiceDemoState('idle', 'idle', { showPreview: false });
        this._startMockStream(text);
      }
      return;
    }
    if (sourceEvent === 'chat-composer-voice-cancel') {
      this._recordHostEvent('voice-cancel');
      this._setVoiceDemoState(this._voiceDemoMode === 'wake' ? 'listening' : 'idle', this._voiceDemoMode === 'wake' ? 'wake' : 'idle', {
        wakeMatched: false,
        showPreview: false,
      });
      return;
    }
    if (sourceEvent === 'chat-composer-voice-send') {
      let text = this._getVoiceSubmissionText(event.detail);
      this._recordHostEvent('voice-send', { text });
      if (!useDefaultRuntime) {
        this._getComposer()?.clearVoicePreview?.();
        this._startMockStream(text);
      }
    }
  }

  _getVoiceSubmissionText(detail = {}) {
    let previewText = String(detail?.text || this._getComposer()?.getVoicePreviewText?.() || '').trim();
    let draftText = String(this._getComposer()?.$.value || '').trim();
    if (draftText) return draftText;
    if (previewText && !/^Recording voice input\b|^Listening for\b|^Host transcription\b/i.test(previewText)) {
      return previewText;
    }
    return 'Render this response inside the current layout';
  }

  _voiceCommandLocale() {
    return ['ru', 'es', 'en'].includes(this._voiceLanguageMode) ? this._voiceLanguageMode : 'en';
  }

  _voiceLanguageOptions() {
    return [
      { mode: 'ru', label: 'RU' },
      { mode: 'es', label: 'ES' },
      { mode: 'en', label: 'EN' },
    ];
  }

  _saveVoiceDemoSettings() {
    writeStoredChatVoiceSettings({
      languageMode: this._voiceLanguageMode,
      voiceResponseEnabled: this._voiceResponseEnabled,
    });
  }

  _voiceSpeechLocale() {
    return {
      ru: 'ru-RU',
      es: 'es-ES',
      en: 'en-US',
    }[this._voiceCommandLocale()] || 'en-US';
  }

  _cancelVoiceResponseSpeech() {
    if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel();
    this._speakingVoiceResponse = false;
    this._syncVoiceControls();
  }

  _cleanVoiceResponseText(text = '') {
    return String(text || '')
      .replace(/```[\s\S]*?```/g, ' ')
      .replace(/`([^`]+)`/g, '$1')
      .replace(/\[[^\]]+\]\(([^)]+)\)/g, '$1')
      .replace(/[#*_>~|]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  _speakVoiceResponseText(text = '') {
    if (!this._voiceResponseEnabled || this._voiceDemoMode !== 'wake') return;
    if (typeof speechSynthesis === 'undefined' || typeof SpeechSynthesisUtterance === 'undefined') return;
    let cleanText = this._cleanVoiceResponseText(text);
    if (!cleanText || cleanText === this._voiceResponseLastText) return;
    this._voiceResponseLastText = cleanText;

    let utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.lang = this._voiceSpeechLocale();
    utterance.onend = () => {
      this._speakingVoiceResponse = false;
      this._syncVoiceControls();
    };
    utterance.onerror = utterance.onend;
    this._speakingVoiceResponse = true;
    this._syncVoiceControls();
    speechSynthesis.cancel();
    speechSynthesis.speak(utterance);
  }

  _getVoiceActionPhrases(action) {
    let locale = this._voiceCommandLocale();
    let phrases = this._voiceActionCommandPhrases || {};
    return phrases[action]?.[locale] || phrases[action]?.en || [];
  }

  _getWakeCommandPhrase() {
    return wakeCommandCandidates(this._wakeCommandPhrases || defaultWakeCommandPhrases(), this._voiceCommandLocale())[0] || 'Okay Agent';
  }

  _voiceCommandHints() {
    let list = (action) => this._getVoiceActionPhrases(action).join(', ');
    return [
      `send: ${list('send')}`,
      `cancel: ${list('cancel')}`,
      `delete: ${list('delete')}`,
      `off: ${list('off')}`,
    ];
  }

  _extractVoiceCommandAction(text = '') {
    let value = String(text || '').trim();
    if (!value) return { matched: false, action: '', text: '' };
    let candidates = ['send', 'cancel', 'delete', 'off'].flatMap((action) => (
      this._getVoiceActionPhrases(action).map((phrase) => ({ action, phrase }))
    ));
    let command = matchVoiceCommandAtEnd(value, candidates);
    if (!command.matched) return { matched: false, action: '', text: value };
    if (command.action === 'send' && !command.text) return { matched: false, action: '', text: value };
    return command;
  }

  _handleVoiceCommandText(text = '') {
    if (!this._voiceCommandMode) return;
    let command = this._extractVoiceCommandAction(text);
    if (!command.matched) return;

    if (command.action === 'send') {
      this._getComposer()?.setValue?.(command.text);
      this._getComposer()?.setVoicePreview?.({
        mode: 'result',
        status: 'command matched',
        text: `Matched "${command.phrase}". The host would send: ${command.text}`,
      });
      this._triggerBg(4200);
      this._queueBgStop(4600);
      return;
    }

    if (command.action === 'delete') {
      this._getComposer()?.setValue?.('');
      this._getComposer()?.setVoicePreview?.({
        mode: 'result',
        status: 'command matched',
        text: `Matched "${command.phrase}". Draft text cleared.`,
      });
      return;
    }

    if (command.action === 'cancel') {
      this._setVoiceDemoState('idle');
      return;
    }

    if (command.action === 'off') {
      this._voiceCommandMode = false;
      this._setVoiceDemoState('idle');
    }
  }

  _triggerBg(duration = 3000) {
    if (this._bgStopTimer) clearTimeout(this._bgStopTimer);
    this._bgStopTimer = null;
    this._getWorkspace()?.triggerBackground?.(duration);
  }

  _startBg() {
    if (this._bgStopTimer) clearTimeout(this._bgStopTimer);
    this._bgStopTimer = null;
    this._getWorkspace()?.startBackground?.();
  }

  _stopBg() {
    if (this._bgStopTimer) clearTimeout(this._bgStopTimer);
    this._bgStopTimer = null;
    this._getWorkspace()?.stopBackground?.();
  }

  _queueBgStop(delay = 3600) {
    if (this._bgStopTimer) clearTimeout(this._bgStopTimer);
    this._bgStopTimer = setTimeout(() => {
      this._bgStopTimer = null;
      this._getWorkspace()?.stopBackground?.();
    }, delay);
  }

  _setVoiceDemoState(state = 'idle', mode = this._voiceDemoMode || 'idle', options = {}) {
    let normalized = ['idle', 'listening', 'transcribing', 'speaking', 'disabled'].includes(state)
      ? state
      : 'idle';
    let showPreview = options.showPreview !== false;
    this._voiceDemoMode = ['manual', 'wake'].includes(mode) && !['idle', 'disabled'].includes(normalized)
      ? mode
      : 'idle';
    this._voiceDemoWakeMatched = this._voiceDemoMode === 'wake' && Boolean(options.wakeMatched);
    this._voiceDemoState = normalized;
    this._syncVoiceControls(normalized);

    if (normalized === 'listening') {
      let waitingForWake = this._voiceDemoMode === 'wake' && !this._voiceDemoWakeMatched;
      if (showPreview && !waitingForWake) {
        this._getComposer()?.setVoicePreview?.({
          mode: 'recording',
          status: 'listening',
          text: this._voiceDemoMode === 'wake'
            ? 'Wake phrase matched. Recording voice input until send/cancel command or mic stop.'
            : 'Recording voice input. Press the mic again to stop and transcribe.',
          elapsed: true,
          commandHints: this._voiceCommandMode ? this._voiceCommandHints() : [],
        });
      } else if (!showPreview || waitingForWake) {
        this._getComposer()?.clearVoicePreview?.();
      }
      this._startBg();
    } else if (normalized === 'transcribing') {
      this._getComposer()?.setVoicePreview?.({
        mode: 'processing',
        status: 'transcribing',
        text: 'Host transcription resolves into editable text.',
        commandHints: this._voiceCommandMode ? this._voiceCommandHints() : [],
      });
      this._triggerBg(6200);
      this._queueBgStop(6600);
    } else if (normalized === 'speaking') {
      this._getComposer()?.setVoicePreview?.({
        mode: 'result',
        status: 'speaking',
        text: 'The host speech output keeps the ambient activity running.',
      });
      this._startBg();
    } else {
      this._getComposer()?.clearVoicePreview?.();
      this._stopBg();
    }
  }

  _syncVoiceControls(state = this._voiceDemoState || 'idle') {
    let normalized = ['idle', 'listening', 'transcribing', 'speaking', 'disabled'].includes(state)
      ? state
      : 'idle';
    this._getComposer()?.setVoiceInputState?.(
      normalized === 'speaking' ? 'idle' : normalized,
      { enabled: normalized !== 'disabled' }
    );
    this._getComposer()?.setVoiceControls?.(this._buildVoiceControlsConfig(normalized));
  }

  renderCallback() {
    this._setupWorkspace();
  }

  _setupWorkspace() {
    if (this._ready) return;

    let workspace = this._getWorkspace();
    if (!workspace) {
      queueMicrotask(() => this._setupWorkspace());
      return;
    }
    this._ready = true;

    if (Number.isFinite(chatSmokeWidth) && chatSmokeWidth >= 220) {
      this.toggleAttribute('data-chat-smoke', true);
      this.style.setProperty('--stage7-chat-smoke-width', `${chatSmokeWidth}px`);
    }

    let syncSidebar = () => {
      let sidebar = this._getSidebar();
      if (!sidebar) return;
      sidebar.setAutoCollapse?.(false);
      sidebar.setCollapsed(true);
      workspace.setChats(this._mockChatCatalog(), { activeId: this._activeChatId });
    };
    let raf = globalThis.requestAnimationFrame || ((callback) => setTimeout(callback, 0));
    raf(syncSidebar);
    workspace.setMessages(this._getActiveMessages(), { smooth: false });
    workspace.setComposerState({
      placeholder: 'Ask the agent to inspect a package, run a smoke test, or build a layout...',
      value: '',
      attachedContext: [
        { key: 'theme', name: 'cascade-theme', title: 'Cascade theme contract', icon: 'palette' },
        { key: 'chat', name: 'chat-surface', title: 'Chat components', icon: 'forum' },
      ],
      voiceControls: this._buildVoiceControlsConfig('idle'),
      footerControls: this._buildFooterControls(),
    });
    this._setVoiceDemoState('idle');
    this._triggerBg(9000);
  }

  disconnectedCallback() {
    if (this._bgStopTimer) clearTimeout(this._bgStopTimer);
    this._bgStopTimer = null;
    this._clearStreamTimers();
    super.disconnectedCallback?.();
  }
}

CascadeChatPanel.template = html`
  <section class="chat-shell chat-lab-panel">
    <chat-workspace class="chat-lab-workspace" ${{ ref: 'workspace' }}></chat-workspace>
  </section>
`;

CascadeChatPanel.rootStyles = `
  cascade-chat-panel {
    display: block;
    width: 100%;
    height: 100%;
    min-height: 0;
  }

  cascade-chat-panel .chat-lab-panel {
    position: relative;
    display: flex;
    height: 100%;
    min-height: 0;
    overflow: hidden;
    background: var(--sn-chat-bg, transparent);
  }

  cascade-chat-panel .chat-lab-workspace {
    flex: 1 1 auto;
    min-width: 0;
    min-height: 0;
  }

  cascade-chat-panel[data-chat-smoke] .chat-lab-workspace {
    align-self: flex-start;
    inline-size: min(100%, var(--stage7-chat-smoke-width));
    max-inline-size: min(100%, var(--stage7-chat-smoke-width));
  }
`;

CascadeChatPanel.reg('cascade-chat-panel');

const DIALOGUE_TOUR_PERSONAS = ['guide', 'ops'];

const DIALOGUE_TOUR_PROFILES = {
  guide: { pitch: 1.15, rate: 1, lang: 'en-US' },
  ops: { pitch: 0.78, rate: 1.02, lang: 'en-US' },
};

const DIALOGUE_TOUR_SCRIPT = [
  { persona: 'guide', cue: 'overview', text: 'Welcome to the multi-voice tour. I am the guide, and I narrate what each panel does.' },
  { persona: 'ops', cue: 'stage', text: 'And I am ops. Each persona speaks through its own hidden iframe, so two voices can talk in parallel.' },
  { persona: 'guide', cue: 'timeline', text: 'The timeline is just an ordered list of turns. buildAlternatingTimeline assigns personas round-robin.' },
  { persona: 'ops', cue: 'player', text: 'createDialoguePlayer wraps the stage with transport controls — play, pause, previous, next, and stop.' },
  { persona: 'guide', cue: 'cue', text: 'On each cue the host highlights the turn the voice is narrating, like the row glowing right now.' },
  { persona: 'ops', cue: 'theme', text: 'Everything is themed with the shared cascade tokens, so it matches the rest of the playground.' },
];

class CascadeDialogueTourPanel extends Symbiote {
  init$ = {
    turns: [],
    activeIndex: -1,
    cueIndex: -1,
    statusLabel: 'Idle',
    statusIcon: 'graphic_eq',
    positionLabel: '0 / 0',
    supportNote: '',

    onPlay: () => this._player?.play(),
    onPause: () => this._player?.pause(),
    onPrev: () => this._player?.prev(),
    onNext: () => this._player?.next(),
    onStop: () => this._stopAll(),
    onCrossTalk: () => this._runCrossTalk(),
    onSelectTurn: (event) => {
      let index = Number(event.currentTarget?.dataset?.index);
      if (Number.isFinite(index)) this._player?.seek(index);
    },
  };

  initCallback() {
    this._cueTimer = null;
    this._crossTalkAbort = null;
    this._stage = createDialogueStage({ locale: 'en' });
    this._timeline = buildAlternatingTimeline(DIALOGUE_TOUR_PERSONAS, DIALOGUE_TOUR_SCRIPT);
    // Same script, but with overlap so the scheduler cross-talks the channels.
    this._crossTalkTimeline = buildAlternatingTimeline(DIALOGUE_TOUR_PERSONAS, DIALOGUE_TOUR_SCRIPT, 600);
    for (let [id, profile] of Object.entries(DIALOGUE_TOUR_PROFILES)) {
      this._stage.persona(id, profile);
    }

    this._player = createDialoguePlayer(this._stage, this._timeline, {
      defaultGapMs: 220,
      onIndexChange: (index) => {
        this.$.activeIndex = index;
        this._syncTurns();
        this._syncPosition();
      },
      onStateChange: (state) => this._applyState(state),
      onCue: (cue, turn, index) => this._flashCue(index),
    });

    this.$.turns = this._timeline.turns.map((turn, index) => this._toRow(turn, index));
    this._detachGesture = this._stage.installGestureUnlock(
      typeof window !== 'undefined' ? window : null,
    );
    this.$.supportNote = this._stage.isSupported()
      ? 'Two persona voices play through independent speech channels.'
      : 'Speech is unavailable here; the transport still walks the timeline turn by turn.';
    this._syncPosition();
  }

  destroyCallback() {
    if (this._cueTimer) {
      clearTimeout(this._cueTimer);
      this._cueTimer = null;
    }
    this._crossTalkAbort?.abort();
    this._player?.stop();
    this._detachGesture?.();
    this._stage?.dispose();
  }

  // Stop both the transport player and any in-flight scheduler run.
  _stopAll() {
    this._crossTalkAbort?.abort();
    this._crossTalkAbort = null;
    this._player?.stop();
  }

  // Fire-and-forget cross-talk via the timeline scheduler: overlapping turns let
  // the two persona channels speak in parallel, distinct from the stepwise player.
  _runCrossTalk() {
    if (this._crossTalkAbort) return;
    this._player?.stop();
    let controller = new AbortController();
    this._crossTalkAbort = controller;
    this.$.statusLabel = 'Cross-talk';
    this.$.statusIcon = 'forum';
    playDialogueTimeline(this._stage, this._crossTalkTimeline, {
      signal: controller.signal,
      onCue: (cue, turn, index) => {
        this.$.activeIndex = index;
        this._syncTurns();
        this._syncPosition();
        this._flashCue(index);
      },
    }).then(() => {
      if (this._crossTalkAbort === controller) {
        this._crossTalkAbort = null;
        this._applyState('finished');
      }
    });
  }

  _toRow(turn, index) {
    let personaLabel = turn.persona === 'ops' ? 'Ops' : 'Guide';
    return {
      index,
      persona: turn.persona,
      personaLabel,
      personaIcon: turn.persona === 'ops' ? 'terminal' : 'record_voice_over',
      text: turn.text,
      rowClass: 'dialogue-turn',
    };
  }

  _syncTurns() {
    let active = this.$.activeIndex;
    let cue = this.$.cueIndex;
    this.$.turns = this._timeline.turns.map((turn, index) => {
      let row = this._toRow(turn, index);
      let classes = ['dialogue-turn'];
      if (index === active) classes.push('is-active');
      if (index === cue) classes.push('is-cued');
      row.rowClass = classes.join(' ');
      return row;
    });
  }

  _syncPosition() {
    let total = this._player?.total || 0;
    let current = this.$.activeIndex >= 0 ? this.$.activeIndex + 1 : 0;
    this.$.positionLabel = `${current} / ${total}`;
  }

  _applyState(state) {
    let map = {
      playing: { label: 'Playing', icon: 'graphic_eq' },
      paused: { label: 'Paused', icon: 'pause' },
      stopped: { label: 'Stopped', icon: 'stop' },
      finished: { label: 'Finished', icon: 'check_circle' },
    };
    let next = map[state] || { label: 'Idle', icon: 'graphic_eq' };
    this.$.statusLabel = next.label;
    this.$.statusIcon = next.icon;
    if (state === 'stopped' || state === 'finished') {
      this.$.activeIndex = state === 'stopped' ? -1 : this.$.activeIndex;
      this._syncTurns();
      this._syncPosition();
    }
  }

  _flashCue(index) {
    this.$.cueIndex = index;
    this._syncTurns();
    if (this._cueTimer) clearTimeout(this._cueTimer);
    this._cueTimer = setTimeout(() => {
      this._cueTimer = null;
      this.$.cueIndex = -1;
      this._syncTurns();
    }, 900);
  }
}

CascadeDialogueTourPanel.template = html`
  <section class="dialogue-tour-panel">
    <header class="dialogue-tour-head">
      <span class="material-symbols-outlined">record_voice_over</span>
      <div>
        <strong>Multi-voice dialogue tour</strong>
        <p>
          Two personas narrate the playground through independent speech
          channels. The transport drives a shared timeline; each cue highlights
          the turn being spoken.
        </p>
      </div>
    </header>

    <div class="dialogue-tour-transport">
      <button type="button" class="dialogue-btn" title="Play" ${{ onclick: 'onPlay' }}>
        <span class="material-symbols-outlined">play_arrow</span>
      </button>
      <button type="button" class="dialogue-btn" title="Pause" ${{ onclick: 'onPause' }}>
        <span class="material-symbols-outlined">pause</span>
      </button>
      <button type="button" class="dialogue-btn" title="Previous" ${{ onclick: 'onPrev' }}>
        <span class="material-symbols-outlined">skip_previous</span>
      </button>
      <button type="button" class="dialogue-btn" title="Next" ${{ onclick: 'onNext' }}>
        <span class="material-symbols-outlined">skip_next</span>
      </button>
      <button type="button" class="dialogue-btn" title="Stop" ${{ onclick: 'onStop' }}>
        <span class="material-symbols-outlined">stop</span>
      </button>
      <button type="button" class="dialogue-btn" title="Cross-talk (overlapping voices)" ${{ onclick: 'onCrossTalk' }}>
        <span class="material-symbols-outlined">forum</span>
      </button>
      <span class="dialogue-status">
        <span class="material-symbols-outlined">{{statusIcon}}</span>
        <span>{{statusLabel}}</span>
        <em>{{positionLabel}}</em>
      </span>
    </div>

    <div class="dialogue-tour-turns" itemize="turns">
      <template>
        <button type="button" ${{ '@class': 'rowClass', '@data-index': 'index', onclick: 'onSelectTurn' }}>
          <span class="dialogue-turn-persona dialogue-turn-{{persona}}">
            <span class="material-symbols-outlined">{{personaIcon}}</span>
            {{personaLabel}}
          </span>
          <span class="dialogue-turn-text">{{text}}</span>
        </button>
      </template>
    </div>

    <footer class="dialogue-tour-foot">
      <span class="material-symbols-outlined">info</span>
      <span>{{supportNote}}</span>
    </footer>
  </section>
`;

CascadeDialogueTourPanel.rootStyles = `
  cascade-dialogue-tour-panel {
    display: block;
    width: 100%;
    height: 100%;
    min-height: 0;
    background: var(--sn-sys-surface-panel);
    color: var(--sn-sys-on-surface);
  }

  cascade-dialogue-tour-panel .dialogue-tour-panel {
    display: grid;
    grid-template-rows: auto auto minmax(0, 1fr) auto;
    gap: var(--sn-lab-panel-gap, 14px);
    height: 100%;
    min-height: 0;
    padding: var(--sn-lab-panel-padding, 16px);
    overflow: hidden;
  }

  cascade-dialogue-tour-panel .dialogue-tour-head {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    gap: 12px;
    align-items: center;
    padding: clamp(12px, 1.8vw, 18px);
    border: var(--sn-node-border-width, 1px) solid var(--sn-sys-outline);
    border-radius: var(--sn-node-radius);
    background: color-mix(in oklab, var(--sn-sys-surface-raised) 90%, var(--sn-sys-surface));
  }

  cascade-dialogue-tour-panel .dialogue-tour-head > .material-symbols-outlined {
    display: grid;
    place-items: center;
    width: calc(44px * var(--sn-theme-density, 1));
    aspect-ratio: 1;
    border-radius: 50%;
    background: var(--sn-sys-surface-raised);
    color: var(--sn-sys-accent);
    font-size: calc(24px * var(--sn-theme-icon-scale, 1));
  }

  cascade-dialogue-tour-panel .dialogue-tour-head strong {
    display: block;
    color: var(--sn-sys-on-surface);
    font-size: calc(16px * var(--sn-theme-heading-scale, 1));
  }

  cascade-dialogue-tour-panel .dialogue-tour-head p {
    margin: 4px 0 0;
    color: var(--sn-sys-on-surface-dim);
    font-size: var(--sn-small-size, 0.82rem);
    line-height: 1.4;
  }

  cascade-dialogue-tour-panel .dialogue-tour-transport {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
    padding: 8px;
    border: var(--sn-node-border-width, 1px) solid var(--sn-sys-outline);
    border-radius: var(--sn-node-radius);
    background: var(--sn-sys-surface-raised);
  }

  cascade-dialogue-tour-panel .dialogue-btn {
    display: grid;
    place-items: center;
    width: calc(36px * var(--sn-theme-density, 1));
    aspect-ratio: 1;
    border: var(--sn-node-border-width, 1px) solid var(--sn-sys-outline);
    border-radius: var(--sn-node-radius);
    background: var(--sn-sys-surface-panel);
    color: var(--sn-sys-on-surface);
    cursor: pointer;
    transition: background 0.16s ease, color 0.16s ease;
  }

  cascade-dialogue-tour-panel .dialogue-btn:hover {
    background: var(--sn-sys-accent);
    color: var(--sn-sys-surface-raised);
  }

  cascade-dialogue-tour-panel .dialogue-btn .material-symbols-outlined {
    font-size: calc(20px * var(--sn-theme-icon-scale, 1));
  }

  cascade-dialogue-tour-panel .dialogue-status {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    margin-left: auto;
    padding: 4px 10px;
    border-radius: var(--sn-node-radius);
    color: var(--sn-sys-on-surface-dim);
    font-size: var(--sn-small-size, 0.82rem);
  }

  cascade-dialogue-tour-panel .dialogue-status .material-symbols-outlined {
    font-size: calc(18px * var(--sn-theme-icon-scale, 1));
    color: var(--sn-sys-accent);
  }

  cascade-dialogue-tour-panel .dialogue-status em {
    font-style: normal;
    color: var(--sn-sys-on-surface);
  }

  cascade-dialogue-tour-panel .dialogue-tour-turns {
    display: flex;
    flex-direction: column;
    gap: 8px;
    min-height: 0;
    overflow: auto;
    padding-right: 4px;
    scrollbar-color: var(--sn-scrollbar-thumb) var(--sn-scrollbar-track);
  }

  cascade-dialogue-tour-panel .dialogue-turn {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    gap: 12px;
    align-items: start;
    width: 100%;
    text-align: left;
    padding: 10px 12px;
    border: var(--sn-node-border-width, 1px) solid var(--sn-sys-outline);
    border-radius: var(--sn-node-radius);
    background: var(--sn-sys-surface-raised);
    color: var(--sn-sys-on-surface);
    cursor: pointer;
    transition: border-color 0.18s ease, background 0.18s ease, transform 0.18s ease;
  }

  cascade-dialogue-tour-panel .dialogue-turn:hover {
    border-color: var(--sn-sys-accent);
  }

  cascade-dialogue-tour-panel .dialogue-turn.is-active {
    border-color: var(--sn-sys-accent);
    background: color-mix(in oklab, var(--sn-sys-accent) 18%, var(--sn-sys-surface-raised));
  }

  cascade-dialogue-tour-panel .dialogue-turn.is-cued {
    transform: translateX(2px);
    box-shadow: 0 0 0 2px color-mix(in oklab, var(--sn-sys-accent) 60%, transparent);
  }

  cascade-dialogue-tour-panel .dialogue-turn-persona {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 2px 8px;
    border-radius: 999px;
    font-size: var(--sn-small-size, 0.78rem);
    font-weight: 600;
    white-space: nowrap;
  }

  cascade-dialogue-tour-panel .dialogue-turn-persona .material-symbols-outlined {
    font-size: calc(16px * var(--sn-theme-icon-scale, 1));
  }

  cascade-dialogue-tour-panel .dialogue-turn-guide {
    color: var(--sn-sys-accent);
    background: color-mix(in oklab, var(--sn-sys-accent) 16%, transparent);
  }

  cascade-dialogue-tour-panel .dialogue-turn-ops {
    color: var(--sn-sys-on-surface);
    background: color-mix(in oklab, var(--sn-sys-on-surface) 12%, transparent);
  }

  cascade-dialogue-tour-panel .dialogue-turn-text {
    line-height: 1.45;
    font-size: calc(13px * var(--sn-theme-type-scale, 1));
  }

  cascade-dialogue-tour-panel .dialogue-tour-foot {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    color: var(--sn-sys-on-surface-dim);
    font-size: var(--sn-small-size, 0.78rem);
  }

  cascade-dialogue-tour-panel .dialogue-tour-foot .material-symbols-outlined {
    font-size: calc(16px * var(--sn-theme-icon-scale, 1));
  }
`;

CascadeDialogueTourPanel.reg('cascade-dialogue-tour-panel');

const PRESENTER_CURSOR_TARGETS = [
  { id: 'context', label: 'Context graph', icon: 'account_tree', text: '28 files and 76 functions mapped for the active workspace.' },
  { id: 'review', label: 'Code review', icon: 'rate_review', text: 'Adversarial review pass over the pending diff.' },
  { id: 'smoke', label: 'Browser smoke', icon: 'smart_display', text: 'Verify the chat workspace and animated background lifecycle.' },
  { id: 'publish', label: 'Publish', icon: 'rocket_launch', text: 'Tag, push, and announce the showcase build.' },
];

const PRESENTER_CURSOR_SCENARIO = {
  steps: [
    { target: 'context', label: 'Mapping the codebase', holdMs: 1100 },
    { target: 'review', label: 'Reviewing the diff', gesture: 'circle', holdMs: 1100 },
    { target: 'smoke', label: 'Running browser smoke', holdMs: 1100 },
    { target: 'publish', label: 'Shipping the build', gesture: 'underline', holdMs: 1300 },
  ],
};

class CascadeCursorPanel extends Symbiote {
  init$ = {
    targets: [],
    statusLabel: 'Idle',
    statusIcon: 'ads_click',
    playLabel: 'Play tour',
    playIcon: 'play_arrow',
    supportNote: '',

    onPlay: () => this._togglePlay(),
  };

  initCallback() {
    this._cursor = createPresenterCursor();
    this._abort = null;
    this.$.targets = PRESENTER_CURSOR_TARGETS.map((target) => ({
      ...target,
      cardClass: 'cursor-target',
    }));
    this.$.supportNote = this._cursor.isSupported()
      ? 'The marching-ants cursor drag-selects each target along a curved travel path.'
      : 'Cursor rendering is unavailable here; the scenario still walks each target step by step.';
  }

  destroyCallback() {
    this._abort?.abort();
    this._abort = null;
    this._cursor?.dispose();
    this._cursor = null;
  }

  // Map an agent-authored step target id to one of the rendered sample cards.
  _resolveTarget(targetId) {
    if (!targetId) return null;
    return this.querySelector(`.cursor-target[data-target-id="${targetId}"]`);
  }

  _togglePlay() {
    if (this._abort) {
      this._abort.abort();
      this._abort = null;
      return;
    }
    this._runScenario();
  }

  _runScenario() {
    let controller = new AbortController();
    this._abort = controller;
    this.$.playLabel = 'Stop tour';
    this.$.playIcon = 'stop';
    this._setActive(-1);
    playCursorScenario(this._cursor, PRESENTER_CURSOR_SCENARIO, {
      signal: controller.signal,
      resolveTarget: (target) => this._resolveTarget(target),
      onStep: (step, index) => {
        this._setActive(index);
        let target = PRESENTER_CURSOR_TARGETS[index];
        this.$.statusIcon = target?.icon || 'ads_click';
        this.$.statusLabel = step.label || target?.label || 'Touring';
      },
    }).then(() => {
      if (this._abort === controller) {
        this._abort = null;
        this._setActive(-1);
        this.$.statusLabel = 'Finished';
        this.$.statusIcon = 'check_circle';
        this.$.playLabel = 'Play tour';
        this.$.playIcon = 'play_arrow';
      }
    });
  }

  _setActive(activeIndex) {
    this.$.targets = PRESENTER_CURSOR_TARGETS.map((target, index) => ({
      ...target,
      cardClass: index === activeIndex ? 'cursor-target is-active' : 'cursor-target',
    }));
  }
}

CascadeCursorPanel.template = html`
  <section class="cursor-panel">
    <header class="cursor-head">
      <span class="material-symbols-outlined">ads_click</span>
      <div>
        <strong>Presenter cursor tour</strong>
        <p>
          An animated pointer drag-selects each labelled target in turn, so an
          agent-authored scenario can walk a viewer across any set of on-screen
          elements.
        </p>
      </div>
    </header>

    <div class="cursor-transport">
      <button type="button" class="cursor-btn" ${{ onclick: 'onPlay' }}>
        <span class="material-symbols-outlined">{{playIcon}}</span>
        <span>{{playLabel}}</span>
      </button>
      <span class="cursor-status">
        <span class="material-symbols-outlined">{{statusIcon}}</span>
        <span>{{statusLabel}}</span>
      </span>
    </div>

    <div class="cursor-targets" itemize="targets">
      <template>
        <article ${{ '@class': 'cardClass', '@data-target-id': 'id' }}>
          <span class="cursor-target-icon material-symbols-outlined">{{icon}}</span>
          <div class="cursor-target-body">
            <strong>{{label}}</strong>
            <span>{{text}}</span>
          </div>
        </article>
      </template>
    </div>

    <footer class="cursor-foot">
      <span class="material-symbols-outlined">info</span>
      <span>{{supportNote}}</span>
    </footer>
  </section>
`;

CascadeCursorPanel.rootStyles = `
  cascade-cursor-panel {
    display: block;
    width: 100%;
    height: 100%;
    min-height: 0;
    background: var(--sn-sys-surface-panel);
    color: var(--sn-sys-on-surface);
  }

  cascade-cursor-panel .cursor-panel {
    display: grid;
    grid-template-rows: auto auto minmax(0, 1fr) auto;
    gap: var(--sn-lab-panel-gap, 14px);
    height: 100%;
    min-height: 0;
    padding: var(--sn-lab-panel-padding, 16px);
    overflow: hidden;
  }

  cascade-cursor-panel .cursor-head {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    gap: 12px;
    align-items: center;
    padding: clamp(12px, 1.8vw, 18px);
    border: var(--sn-node-border-width, 1px) solid var(--sn-sys-outline);
    border-radius: var(--sn-node-radius);
    background: color-mix(in oklab, var(--sn-sys-surface-raised) 90%, var(--sn-sys-surface));
  }

  cascade-cursor-panel .cursor-head > .material-symbols-outlined {
    display: grid;
    place-items: center;
    width: calc(44px * var(--sn-theme-density, 1));
    aspect-ratio: 1;
    border-radius: 50%;
    background: var(--sn-sys-surface-raised);
    color: var(--sn-sys-accent);
    font-size: calc(24px * var(--sn-theme-icon-scale, 1));
  }

  cascade-cursor-panel .cursor-head strong {
    display: block;
    color: var(--sn-sys-on-surface);
    font-size: calc(16px * var(--sn-theme-heading-scale, 1));
  }

  cascade-cursor-panel .cursor-head p {
    margin: 4px 0 0;
    color: var(--sn-sys-on-surface-dim);
    font-size: var(--sn-small-size, 0.82rem);
    line-height: 1.4;
  }

  cascade-cursor-panel .cursor-transport {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 10px;
    padding: 8px;
    border: var(--sn-node-border-width, 1px) solid var(--sn-sys-outline);
    border-radius: var(--sn-node-radius);
    background: var(--sn-sys-surface-raised);
  }

  cascade-cursor-panel .cursor-btn {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 6px 14px;
    border: var(--sn-node-border-width, 1px) solid var(--sn-sys-outline);
    border-radius: var(--sn-node-radius);
    background: var(--sn-sys-surface-panel);
    color: var(--sn-sys-on-surface);
    cursor: pointer;
    font: inherit;
    transition: background 0.16s ease, color 0.16s ease;
  }

  cascade-cursor-panel .cursor-btn:hover {
    background: var(--sn-sys-accent);
    color: var(--sn-sys-surface-raised);
  }

  cascade-cursor-panel .cursor-btn .material-symbols-outlined {
    font-size: calc(20px * var(--sn-theme-icon-scale, 1));
  }

  cascade-cursor-panel .cursor-status {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    margin-left: auto;
    padding: 4px 10px;
    border-radius: var(--sn-node-radius);
    color: var(--sn-sys-on-surface-dim);
    font-size: var(--sn-small-size, 0.82rem);
  }

  cascade-cursor-panel .cursor-status .material-symbols-outlined {
    font-size: calc(18px * var(--sn-theme-icon-scale, 1));
    color: var(--sn-sys-accent);
  }

  cascade-cursor-panel .cursor-targets {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    gap: 12px;
    align-content: start;
    min-height: 0;
    overflow: auto;
    padding-right: 4px;
    scrollbar-color: var(--sn-scrollbar-thumb) var(--sn-scrollbar-track);
  }

  cascade-cursor-panel .cursor-target {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    gap: 12px;
    align-items: start;
    padding: 14px;
    border: var(--sn-node-border-width, 1px) solid var(--sn-sys-outline);
    border-radius: var(--sn-node-radius);
    background: var(--sn-sys-surface-raised);
    transition: border-color 0.18s ease, background 0.18s ease;
  }

  cascade-cursor-panel .cursor-target.is-active {
    border-color: var(--sn-sys-accent);
    background: color-mix(in oklab, var(--sn-sys-accent) 18%, var(--sn-sys-surface-raised));
  }

  cascade-cursor-panel .cursor-target-icon {
    display: grid;
    place-items: center;
    width: calc(38px * var(--sn-theme-density, 1));
    aspect-ratio: 1;
    border-radius: var(--sn-node-radius);
    background: var(--sn-sys-surface-panel);
    color: var(--sn-sys-accent);
    font-size: calc(22px * var(--sn-theme-icon-scale, 1));
  }

  cascade-cursor-panel .cursor-target-body strong {
    display: block;
    color: var(--sn-sys-on-surface);
    font-size: calc(14px * var(--sn-theme-type-scale, 1));
  }

  cascade-cursor-panel .cursor-target-body span {
    display: block;
    margin-top: 4px;
    color: var(--sn-sys-on-surface-dim);
    font-size: var(--sn-small-size, 0.78rem);
    line-height: 1.4;
  }

  cascade-cursor-panel .cursor-foot {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    color: var(--sn-sys-on-surface-dim);
    font-size: var(--sn-small-size, 0.78rem);
  }

  cascade-cursor-panel .cursor-foot .material-symbols-outlined {
    font-size: calc(16px * var(--sn-theme-icon-scale, 1));
  }
`;

CascadeCursorPanel.reg('cascade-cursor-panel');

class CascadeChatPartsPanel extends Symbiote {
  initCallback() {
    this._embedFilled = new WeakSet();
    this.dataset.lastAction = '';

    this.addEventListener('chat-workspace-action', (event) => this._handleAction(event));
    this.addEventListener('chat-workspace-embeds-ready', (event) => this._handleEmbedsReady(event));
    queueMicrotask(() => this._setupWorkspace());
  }

  _getWorkspace() {
    return this.ref?.workspace || this.querySelector('chat-workspace');
  }

  _seedMessages() {
    return [
      {
        role: 'user',
        text: 'Show how a message can carry interactive actions and a live embed.',
      },
      {
        role: 'agent',
        parts: [
          {
            type: 'text',
            text: 'Pick how the host should respond. These buttons are an "actions" message part rendered by the library.',
          },
          {
            type: 'actions',
            id: 'respond-actions',
            actions: [
              { id: 'approve', label: 'Approve plan', icon: 'check_circle', variant: 'primary' },
              { id: 'revise', label: 'Request changes', icon: 'edit', variant: 'ghost' },
            ],
          },
        ],
      },
      {
        role: 'agent',
        parts: [
          {
            type: 'text',
            text: 'And here is an "embed" part — the host fills its slot with a live widget once the transcript reports the slots are ready.',
          },
          { type: 'embed', key: 'counter-widget' },
        ],
      },
    ];
  }

  _setupWorkspace() {
    let workspace = this._getWorkspace();
    if (!workspace) return;
    workspace.setWorkspaceState({
      messages: this._seedMessages(),
      messagesOptions: { scrollToBottom: false, smooth: false },
      empty: false,
      composer: {
        placeholder: 'Custom message parts are host-driven in this showcase.',
        value: '',
      },
    });
  }

  _handleAction(event) {
    let { id, actionId } = event.detail || {};
    this.dataset.lastAction = `${id || ''}:${actionId || ''}`;
    let target = this._embedHost;
    if (target) {
      let note = actionId === 'approve' ? 'Plan approved' : 'Changes requested';
      target.dataset.lastAction = note;
      let label = target.querySelector('.embed-note');
      if (label) label.textContent = note;
    }
  }

  _handleEmbedsReady(event) {
    let embeds = event.detail?.embeds || [];
    for (let { key, slot } of embeds) {
      if (key !== 'counter-widget' || !slot || this._embedFilled.has(slot)) continue;
      this._embedFilled.add(slot);
      slot.replaceChildren(this._buildCounterWidget());
    }
  }

  // A small live host widget that owns its own state inside the embed slot.
  _buildCounterWidget() {
    let host = document.createElement('div');
    host.className = 'parts-embed-widget';

    let title = document.createElement('div');
    title.className = 'embed-title';
    title.innerHTML = '<span class="material-symbols-outlined">tune</span><span>Live host widget</span>';

    let count = 0;
    let value = document.createElement('strong');
    value.className = 'embed-value';
    value.textContent = String(count);

    let controls = document.createElement('div');
    controls.className = 'embed-controls';
    let dec = document.createElement('button');
    dec.type = 'button';
    dec.className = 'embed-btn';
    dec.innerHTML = '<span class="material-symbols-outlined">remove</span>';
    let inc = document.createElement('button');
    inc.type = 'button';
    inc.className = 'embed-btn';
    inc.innerHTML = '<span class="material-symbols-outlined">add</span>';
    dec.addEventListener('click', () => {
      count -= 1;
      value.textContent = String(count);
    });
    inc.addEventListener('click', () => {
      count += 1;
      value.textContent = String(count);
    });
    controls.append(dec, value, inc);

    let note = document.createElement('div');
    note.className = 'embed-note';
    note.textContent = 'Click an action button above to update me.';

    host.append(title, controls, note);
    this._embedHost = host;
    return host;
  }
}

CascadeChatPartsPanel.template = html`
  <section class="chat-parts-panel">
    <chat-workspace class="chat-parts-workspace" ${{ ref: 'workspace' }}></chat-workspace>
  </section>
`;

CascadeChatPartsPanel.rootStyles = `
  cascade-chat-parts-panel {
    display: block;
    width: 100%;
    height: 100%;
    min-height: 0;
  }

  cascade-chat-parts-panel .chat-parts-panel {
    position: relative;
    display: flex;
    height: 100%;
    min-height: 0;
    overflow: hidden;
    background: var(--sn-chat-bg, transparent);
  }

  cascade-chat-parts-panel .chat-parts-workspace {
    flex: 1 1 auto;
    min-width: 0;
    min-height: 0;
  }

  cascade-chat-parts-panel .parts-embed-widget {
    display: grid;
    gap: 10px;
    padding: 14px;
    border: var(--sn-node-border-width, 1px) solid var(--sn-sys-outline);
    border-radius: var(--sn-node-radius);
    background: var(--sn-sys-surface-raised);
    color: var(--sn-sys-on-surface);
  }

  cascade-chat-parts-panel .parts-embed-widget .embed-title {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    color: var(--sn-sys-on-surface-dim);
    font-size: var(--sn-small-size, 0.78rem);
  }

  cascade-chat-parts-panel .parts-embed-widget .embed-title .material-symbols-outlined {
    font-size: calc(18px * var(--sn-theme-icon-scale, 1));
    color: var(--sn-sys-accent);
  }

  cascade-chat-parts-panel .parts-embed-widget .embed-controls {
    display: inline-flex;
    align-items: center;
    gap: 12px;
  }

  cascade-chat-parts-panel .parts-embed-widget .embed-value {
    min-width: 2ch;
    text-align: center;
    font-size: calc(22px * var(--sn-theme-heading-scale, 1));
    color: var(--sn-sys-on-surface);
  }

  cascade-chat-parts-panel .parts-embed-widget .embed-btn {
    display: grid;
    place-items: center;
    width: calc(34px * var(--sn-theme-density, 1));
    aspect-ratio: 1;
    border: var(--sn-node-border-width, 1px) solid var(--sn-sys-outline);
    border-radius: var(--sn-node-radius);
    background: var(--sn-sys-surface-panel);
    color: var(--sn-sys-on-surface);
    cursor: pointer;
    transition: background 0.16s ease, color 0.16s ease;
  }

  cascade-chat-parts-panel .parts-embed-widget .embed-btn:hover {
    background: var(--sn-sys-accent);
    color: var(--sn-sys-surface-raised);
  }

  cascade-chat-parts-panel .parts-embed-widget .embed-note {
    color: var(--sn-sys-on-surface-dim);
    font-size: var(--sn-small-size, 0.78rem);
  }
`;

CascadeChatPartsPanel.reg('cascade-chat-parts-panel');

class CascadeRuntimePanel extends Symbiote {
  renderCallback() {
    if (this._ready) return;
    this._ready = true;
    this.ref.code?.setContent?.([
      'const controller = createRuntimeUiController({ root, layout });',
      '',
      'controller.create({',
      '  id: "agent-panel",',
      '  tagName: "sn-data-table",',
      '  state: { method: "setData", args: [rows] },',
      '  intents: { rowSelect: "inspect-project-node" }',
      '});',
      '',
      'layout.openPanel("agent-panel", {',
      '  uiInvoked: true,',
      '  source: "agent-constructor"',
      '});',
    ].join('\n'), 'js');
    this.ref.events?.setEvents?.([
      { id: 'runtime-create', title: 'ui:create', status: 'done', detail: 'Component mounted with host-owned data.' },
      { id: 'runtime-update', title: 'ui:update', status: 'done', detail: 'State applied through public methods.' },
      { id: 'runtime-layout', title: 'layout:open-panel', status: 'running', detail: 'Panel insertion stays reversible.' },
    ]);
  }
}

CascadeRuntimePanel.template = html`
  <section class="workspace-showcase-panel runtime-panel">
    <sn-banner variant="info">Agents can construct components, update state, route intents, and open layout panels without a server reload.</sn-banner>
    <div class="workspace-showcase-grid">
      <article class="workspace-feature-card">
        <span class="material-symbols-outlined">memory</span>
        <strong>runtime-ui-v1</strong>
        <p>Node-safe construction helpers create, update, and tear down host-approved UI.</p>
      </article>
      <article class="workspace-feature-card">
        <span class="material-symbols-outlined">extension</span>
        <strong>WebMCP descriptors</strong>
        <p>Agents discover component capabilities, schemas, actions, and permission hints.</p>
      </article>
      <article class="workspace-feature-card">
        <span class="material-symbols-outlined">view_quilt</span>
        <strong>layout actions</strong>
        <p>Open, close, split, duplicate, and remove UI-invoked panels through reusable layout APIs.</p>
      </article>
      <article class="workspace-feature-card">
        <span class="material-symbols-outlined">verified</span>
        <strong>SSR-safe core</strong>
        <p>Root, core, runtime, manifest, and WebMCP entrypoints import without browser globals.</p>
      </article>
    </div>
    <div class="runtime-workbench">
      <code-block ${{ ref: 'code' }}></code-block>
      <sn-event-feed ${{ ref: 'events' }}></sn-event-feed>
    </div>
  </section>
`;

CascadeRuntimePanel.rootStyles = `
  cascade-runtime-panel {
    display: block;
    width: 100%;
    height: 100%;
    min-height: 0;
  }

  .workspace-showcase-panel {
    display: grid;
    grid-template-rows: auto auto minmax(0, 1fr);
    gap: var(--sn-lab-panel-gap, 12px);
    height: 100%;
    min-height: 0;
    padding: var(--sn-lab-panel-padding, 12px);
    overflow: auto;
    background: var(--sn-sys-surface-panel);
    color: var(--sn-sys-on-surface);
    scrollbar-color: var(--sn-scrollbar-thumb) var(--sn-scrollbar-track);
    scrollbar-width: var(--sn-scrollbar-width, thin);
  }

  .workspace-showcase-grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: var(--sn-lab-panel-gap, 12px);
  }

  .workspace-feature-card {
    min-width: 0;
    padding: calc(12px * var(--sn-theme-density, 1));
    border: var(--sn-node-border-width, 1px) solid var(--sn-sys-outline);
    border-radius: var(--sn-node-radius);
    background: var(--sn-sys-surface-raised);
  }

  .workspace-feature-card .material-symbols-outlined {
    color: var(--sn-sys-accent);
    font-size: calc(24px * var(--sn-theme-icon-scale, 1));
  }

  .workspace-feature-card strong {
    display: block;
    margin-top: 8px;
    color: var(--sn-sys-on-surface);
    font-size: calc(14px * var(--sn-theme-heading-scale, 1));
  }

  .workspace-feature-card p {
    margin: 6px 0 0;
    color: var(--sn-sys-on-surface-dim);
    font-size: calc(12px * var(--sn-theme-type-scale, 1));
    line-height: 1.45;
  }

  .runtime-workbench {
    display: grid;
    grid-template-columns: minmax(0, 1.2fr) minmax(220px, 0.8fr);
    gap: var(--sn-lab-panel-gap, 12px);
    min-height: 0;
  }

  .runtime-workbench code-block,
  .runtime-workbench sn-event-feed {
    min-height: 0;
    overflow: auto;
  }

  @media (max-width: 860px) {
    .workspace-showcase-grid,
    .runtime-workbench {
      grid-template-columns: 1fr;
    }
  }
`;

CascadeRuntimePanel.reg('cascade-runtime-panel');

const KANBAN_BOARD_MODEL = {
  id: 'release-flow',
  title: 'Agent release flow',
  columns: [
    {
      id: 'intake',
      title: 'Intake',
      description: 'Host-owned work queue',
      cards: [
        {
          id: 'scope-demo',
          title: 'Scope public demo update',
          summary: 'Expose the board surface through the Automation workspace.',
          meta: ['demo'],
          footer: [{ label: 'planned', kind: 'status' }],
          actions: [{ id: 'open-source', icon: 'code', title: 'Open source panel' }],
        },
        {
          id: 'classify-pages',
          title: 'Classify Pages publish target',
          summary: 'Keep source imports and static dependencies available under /demo.',
          meta: ['pages'],
          footer: [{ label: 'public', kind: 'warning' }],
          actions: [{ id: 'inspect', icon: 'page_info', title: 'Inspect metadata' }],
        },
      ],
    },
    {
      id: 'build',
      title: 'Build',
      description: 'Reusable component composition',
      cards: [
        {
          id: 'render-kanban-board',
          title: 'Render sn-kanban-board',
          summary: 'Columns and cards are host data; the component emits selection and move intents.',
          meta: ['component', 'themeable'],
          footer: [{ label: 'live', kind: 'status' }],
          actions: [{ id: 'select-card', icon: 'touch_app', title: 'Select card' }],
        },
      ],
    },
    {
      id: 'verify',
      title: 'Verify',
      description: 'Tests and smoke checks',
      cards: [
        {
          id: 'run-contract-tests',
          title: 'Run contract tests',
          summary: 'Package exports, manifest metadata, and component behavior stay in sync.',
          meta: ['node --test'],
          footer: [{ label: 'queued', kind: 'warning' }],
          actions: [{ id: 'show-events', icon: 'receipt_long', title: 'Show events' }],
        },
        {
          id: 'browser-smoke',
          title: 'Browser smoke',
          summary: 'Open the demo, route to Automation / Kanban board, and verify rendering.',
          meta: ['browser'],
          footer: [{ label: 'manual', kind: 'warning' }],
          actions: [{ id: 'fit-board', icon: 'fit_screen', title: 'Fit board' }],
        },
      ],
    },
    {
      id: 'ship',
      title: 'Ship',
      description: 'Public Pages release',
      cards: [
        {
          id: 'publish-pages',
          title: 'Publish GitHub Pages',
          summary: 'Deploy a static branch with no private context or local scratch artifacts.',
          meta: ['gh-pages'],
          footer: [{ label: 'ready', kind: 'status' }],
          actions: [{ id: 'copy-url', icon: 'link', title: 'Copy public URL' }],
        },
      ],
    },
  ],
};

const AUTOMATION_PRODUCT_CONTEXT = {
  product: {
    id: 'automation-release-demo',
    name: 'Automation release flow',
    category: 'automation',
    description: 'Public demo product for release workflow planning and GitHub Pages publish gates.',
    url: 'https://rnd-pro.github.io/symbiote-ui/demo/cascade-theme-lab.html#automation/kanban-board',
  },
  agent: {
    summary: 'Automation release flow presents the host product above reusable symbiote-ui components.',
    usage: 'Inspect the release board, map domain tasks to component refs, and emit host-owned product intents.',
    audience: 'agent',
    constraints: [
      'Component contracts are reusable library metadata.',
      'Product actions are host-owned intents.',
      'Publishing policy stays outside reusable components.',
    ],
  },
  views: [
    {
      id: 'kanban-board',
      label: 'Kanban board',
      route: '#automation/kanban-board',
      description: 'Workflow board with host-owned release tasks rendered by sn-kanban-board.',
      componentRefs: ['release-board'],
      entityRefs: ['scope-demo', 'run-contract-tests', 'publish-pages'],
      actionRefs: ['select-release-card', 'request-release-move'],
      active: true,
    },
    {
      id: 'product-context',
      label: 'Product context',
      route: '#automation/product-context',
      description: 'Agent-readable product inspector for views, entities, actions, tools, and event state.',
      componentRefs: ['agent-context-inspector'],
      entityRefs: ['release-context'],
      actionRefs: ['inspect-component-contract'],
    },
  ],
  componentRefs: [
    {
      id: 'release-board',
      component: 'sn-kanban-board',
      componentId: 'release-flow',
      selector: 'cascade-board-panel sn-kanban-board',
      viewId: 'kanban-board',
      role: 'workflow board',
      description: 'Reusable board component rendering release-flow columns and cards.',
      entityRefs: ['scope-demo', 'run-contract-tests', 'publish-pages'],
      actionRefs: ['select-release-card', 'request-release-move'],
    },
    {
      id: 'agent-context-inspector',
      component: 'cascade-product-context-panel',
      selector: 'cascade-product-context-panel',
      viewId: 'product-context',
      role: 'agent-readable product inspector',
      description: 'Host demo panel exposing product semantics, component refs, WebMCP descriptors, and live events.',
      entityRefs: ['release-context'],
      actionRefs: ['inspect-component-contract'],
    },
  ],
  entities: [
    {
      id: 'scope-demo',
      type: 'release-task',
      label: 'Scope public demo update',
      status: 'planned',
      componentRefs: ['release-board'],
      actionRefs: ['select-release-card'],
    },
    {
      id: 'run-contract-tests',
      type: 'release-task',
      label: 'Run contract tests',
      status: 'queued',
      componentRefs: ['release-board'],
      actionRefs: ['select-release-card', 'request-release-move'],
    },
    {
      id: 'publish-pages',
      type: 'release-task',
      label: 'Publish GitHub Pages',
      status: 'ready',
      componentRefs: ['release-board'],
      actionRefs: ['select-release-card', 'request-release-move'],
    },
    {
      id: 'release-context',
      type: 'agent-context',
      label: 'Automation product context',
      status: 'live',
      componentRefs: ['agent-context-inspector'],
      actionRefs: ['inspect-component-contract'],
    },
  ],
  actions: [
    {
      id: 'select-release-card',
      name: 'release_flow_select_card',
      title: 'Select release card',
      description: 'Selects a visible release task and updates the product inspector event stream.',
      type: 'intent',
      eventName: 'sn-board-card-select',
      componentRefs: ['release-board'],
      entityRefs: ['scope-demo', 'run-contract-tests', 'publish-pages'],
      viewRefs: ['kanban-board'],
      inputSchema: {
        type: 'object',
        required: ['cardId'],
        properties: {
          cardId: { type: 'string' },
        },
      },
    },
    {
      id: 'request-release-move',
      name: 'release_flow_request_move',
      title: 'Request release move',
      description: 'Emits a host-owned move intent; reusable board code does not mutate release policy.',
      type: 'intent',
      eventName: 'sn-board-card-drop',
      componentRefs: ['release-board'],
      entityRefs: ['run-contract-tests', 'publish-pages'],
      viewRefs: ['kanban-board'],
      permission: 'release.move.request',
      inputSchema: {
        type: 'object',
        required: ['cardId', 'toColumnId'],
        properties: {
          cardId: { type: 'string' },
          toColumnId: { type: 'string' },
        },
      },
    },
    {
      id: 'inspect-component-contract',
      name: 'release_flow_inspect_component_contract',
      title: 'Inspect component contract',
      description: 'Returns the componentRef and neutral component tag that back a product view.',
      type: 'read',
      componentRefs: ['agent-context-inspector'],
      entityRefs: ['release-context'],
      viewRefs: ['product-context'],
      inputSchema: {
        type: 'object',
        required: ['componentRefId'],
        properties: {
          componentRefId: { type: 'string' },
        },
      },
    },
  ],
  eventLog: [
    {
      id: 'product-context-ready',
      type: 'agent-view',
      title: 'Product context ready',
      detail: 'Agent view includes product, views, componentRefs, entities, actions, WebMCP descriptors, and event log.',
      status: 'done',
      viewId: 'product-context',
      componentRefId: 'agent-context-inspector',
      entityId: 'release-context',
    },
    {
      id: 'release-board-linked',
      type: 'component-ref',
      title: 'release-board linked',
      detail: 'sn-kanban-board is referenced by product actions without owning release policy.',
      status: 'done',
      viewId: 'kanban-board',
      componentRefId: 'release-board',
      entityId: 'publish-pages',
    },
  ],
  webmcp: {
    references: [
      'https://rnd-pro.github.io/symbiote-ui/demo/cascade-theme-lab.html#automation/product-context',
      'https://rnd-pro.github.io/symbiote-ui/schemas/product-context-v1.json',
    ],
  },
};

const KANBAN_SOURCE_SAMPLE = [
  'import { KanbanBoard } from "symbiote-ui/board";',
  '',
  'let board = document.querySelector("sn-kanban-board");',
  '',
  'board.setBoard({',
  '  columns: workflowColumns,',
  '});',
  '',
  'board.addEventListener("sn-board-card-select", ({ detail }) => {',
  '  inspector.showCard(detail.card);',
  '});',
  '',
  'board.addEventListener("sn-board-card-drop", ({ detail }) => {',
  '  workflow.requestMove(detail.card.id, detail.toColumnId);',
  '});',
].join('\n');

class CascadeBoardPanel extends Symbiote {
  initCallback() {
    this._events = [];
    this.addEventListener('sn-board-card-select', (event) => this._recordBoardIntent('select', event));
    this.addEventListener('sn-board-card-action', (event) => this._recordBoardIntent('action', event));
    this.addEventListener('sn-board-card-drop', (event) => this._recordBoardIntent('drop', event));
  }

  renderCallback() {
    if (this._ready) return;
    this._ready = true;
    this.ref.board.setBoard(KANBAN_BOARD_MODEL);
    this.ref.board.selectCard('render-kanban-board');
    this.ref.code.setContent(KANBAN_SOURCE_SAMPLE, 'js');
    this._setBoardEvents([
      {
        id: 'board-ready',
        title: 'sn-kanban-board ready',
        status: 'done',
        detail: 'Host-owned columns rendered through the reusable board component.',
      },
      {
        id: 'board-intents',
        title: 'intent listeners attached',
        status: 'running',
        detail: 'Select a card or action menu item to update this event feed.',
      },
    ]);
  }

  _recordBoardIntent(kind, event) {
    let detail = event.detail || {};
    let card = detail.card;
    let title = kind === 'drop'
      ? `move ${card?.id || 'card'}`
      : `${kind} ${card?.id || 'card'}`;
    let eventDetail = kind === 'drop'
      ? `${detail.fromColumnId} -> ${detail.toColumnId}`
      : detail.actionId || card?.title || 'board intent';
    this._setBoardEvents([
      {
        id: `${kind}-${Date.now()}`,
        title,
        status: kind === 'drop' ? 'running' : 'done',
        detail: eventDetail,
      },
      ...this._events,
    ].slice(0, 6));
  }

  _setBoardEvents(events) {
    this._events = events;
    this.ref.events?.setEvents?.(events);
  }
}

CascadeBoardPanel.template = html`
  <section class="board-panel">
    <sn-banner variant="info">
      A host supplies workflow columns and cards. The board handles rendering,
      selection, action menus, drag targets, and emits product-neutral intents.
    </sn-banner>
    <div class="board-workbench">
      <section class="board-preview" aria-label="Kanban board workflow preview">
        <header class="board-preview-header">
          <span class="material-symbols-outlined" aria-hidden="true">view_kanban</span>
          <div>
            <strong>Automation workflow board</strong>
            <span>Reusable surface for planning, approvals, verification, and release gates.</span>
          </div>
        </header>
        <sn-kanban-board
          label="Agent release workflow board"
          empty-text="No workflow lanes"
          ${{ ref: 'board' }}
        ></sn-kanban-board>
      </section>
      <aside class="board-side" aria-label="Kanban board source and events">
        <code-block ${{ ref: 'code' }}></code-block>
        <sn-event-feed ${{ ref: 'events' }}></sn-event-feed>
      </aside>
    </div>
  </section>
`;

CascadeBoardPanel.rootStyles = `
  cascade-board-panel {
    display: block;
    width: 100%;
    height: 100%;
    min-height: 0;
  }

  cascade-board-panel .board-panel {
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    gap: var(--sn-lab-panel-gap, 12px);
    height: 100%;
    min-height: 0;
    padding: var(--sn-lab-panel-padding, 12px);
    overflow: hidden;
    background: var(--sn-sys-surface-panel);
    color: var(--sn-sys-on-surface);
  }

  cascade-board-panel .board-workbench {
    display: grid;
    grid-template-columns: minmax(420px, 1.15fr) minmax(280px, 0.85fr);
    gap: var(--sn-lab-panel-gap, 12px);
    min-width: 0;
    min-height: 0;
  }

  cascade-board-panel .board-preview,
  cascade-board-panel .board-side {
    min-width: 0;
    min-height: 0;
  }

  cascade-board-panel .board-preview {
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    gap: 10px;
    padding: 10px;
    border: var(--sn-node-border-width, 1px) solid var(--sn-sys-outline);
    border-radius: var(--sn-node-radius);
    background: var(--sn-sys-surface);
    overflow: hidden;
  }

  cascade-board-panel .board-preview-header {
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
    min-height: 48px;
    padding: 8px 10px;
    border: var(--sn-node-border-width, 1px) solid var(--sn-sys-outline);
    border-radius: var(--sn-control-radius, 6px);
    background: var(--sn-sys-surface-raised);
  }

  cascade-board-panel .board-preview-header .material-symbols-outlined {
    color: var(--sn-sys-accent);
    font-size: calc(24px * var(--sn-theme-icon-scale, 1));
  }

  cascade-board-panel .board-preview-header strong,
  cascade-board-panel .board-preview-header span:not(.material-symbols-outlined) {
    display: block;
    min-width: 0;
    overflow-wrap: anywhere;
  }

  cascade-board-panel .board-preview-header strong {
    color: var(--sn-sys-on-surface);
    font-size: calc(14px * var(--sn-theme-heading-scale, 1));
  }

  cascade-board-panel .board-preview-header span:not(.material-symbols-outlined) {
    margin-top: 3px;
    color: var(--sn-sys-on-surface-dim);
    font-size: calc(11px * var(--sn-theme-type-scale, 1));
    line-height: 1.35;
  }

  cascade-board-panel sn-kanban-board {
    min-width: 0;
    min-height: 0;
    --sn-kanban-columns-height: 100%;
    --sn-kanban-column-height: 100%;
    --sn-kanban-column-min-height: 260px;
    --sn-kanban-card-list-overflow: auto;
  }

  cascade-board-panel .board-side {
    display: grid;
    grid-template-rows: minmax(0, 1fr) minmax(190px, 0.8fr);
    gap: var(--sn-lab-panel-gap, 12px);
  }

  cascade-board-panel code-block,
  cascade-board-panel sn-event-feed {
    min-width: 0;
    min-height: 0;
    border: var(--sn-node-border-width, 1px) solid var(--sn-sys-outline);
    border-radius: var(--sn-node-radius);
    background: var(--sn-sys-surface);
    overflow: auto;
  }

  @media (max-width: 980px) {
    cascade-board-panel .board-panel {
      overflow: auto;
    }

    cascade-board-panel .board-workbench {
      grid-template-columns: minmax(0, 1fr);
      min-height: 760px;
    }
  }
`;

CascadeBoardPanel.reg('cascade-board-panel');

class CascadeProductContextPanel extends Symbiote {
  renderCallback() {
    if (this._ready) return;
    this._ready = true;
    let agentView = createProductContextAgentView(AUTOMATION_PRODUCT_CONTEXT);
    let descriptors = createProductContextToolDescriptors(AUTOMATION_PRODUCT_CONTEXT);
    this.$.productName = agentView.product.name;
    this.$.productCategory = agentView.product.category;
    this.$.summary = agentView.summary;
    this.$.metrics = [
      { label: 'Views', value: String(agentView.views.length) },
      { label: 'Component refs', value: String(agentView.componentRefs.length) },
      { label: 'Entities', value: String(agentView.entities.length) },
      { label: 'Tools', value: String(descriptors.length) },
    ];
    this.$.tools = descriptors.map((descriptor) => ({
      name: descriptor.name,
      action: descriptor.annotations.actionId,
      refs: descriptor.annotations.componentRefs.join(', '),
    }));
    this.ref.agentView?.setContent?.(JSON.stringify(agentView, null, 2), 'json');
    this.ref.toolsJson?.setContent?.(JSON.stringify(descriptors, null, 2), 'json');
    this.ref.events?.setEvents?.(agentView.eventLog.map((item) => ({
      id: item.id,
      title: item.title,
      status: item.status || item.type,
      detail: item.detail || `${item.componentRefId || item.viewId || item.entityId}`,
    })));
  }
}

CascadeProductContextPanel.template = html`
  <section class="product-context-panel">
    <header class="product-context-header">
      <span class="material-symbols-outlined" aria-hidden="true">productivity</span>
      <div>
        <p>{{productCategory}}</p>
        <h2>{{productName}}</h2>
        <span>{{summary}}</span>
      </div>
    </header>

    <div class="product-context-grid">
      <section class="product-context-main" aria-label="Agent-readable product context">
        <div class="product-context-metrics" itemize="metrics">
          <template>
            <article>
              <strong>{{value}}</strong>
              <span>{{label}}</span>
            </article>
          </template>
        </div>
        <code-block ${{ ref: 'agentView' }}></code-block>
      </section>

      <aside class="product-context-side" aria-label="Product WebMCP descriptors">
        <section class="product-context-tools">
          <header>
            <span class="material-symbols-outlined" aria-hidden="true">api</span>
            <strong>WebMCP product actions</strong>
          </header>
          <div itemize="tools">
            <template>
              <article>
                <strong>{{name}}</strong>
                <span>{{action}}</span>
                <small>{{refs}}</small>
              </article>
            </template>
          </div>
        </section>
        <sn-event-feed ${{ ref: 'events' }}></sn-event-feed>
        <code-block ${{ ref: 'toolsJson' }}></code-block>
      </aside>
    </div>
  </section>
`;

CascadeProductContextPanel.rootStyles = `
  cascade-product-context-panel {
    display: block;
    width: 100%;
    height: 100%;
    min-height: 0;
    background: var(--sn-sys-surface-panel);
    color: var(--sn-sys-on-surface);
  }

  cascade-product-context-panel .product-context-panel {
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    gap: var(--sn-lab-panel-gap, 12px);
    height: 100%;
    min-height: 0;
    padding: var(--sn-lab-panel-padding, 12px);
    overflow: hidden;
  }

  cascade-product-context-panel .product-context-header {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    align-items: center;
    gap: 12px;
    min-width: 0;
    padding: 12px;
    border: var(--sn-node-border-width, 1px) solid var(--sn-sys-outline);
    border-radius: var(--sn-node-radius);
    background: var(--sn-sys-surface-raised);
  }

  cascade-product-context-panel .product-context-header > .material-symbols-outlined {
    color: var(--sn-sys-accent);
    font-size: calc(28px * var(--sn-theme-icon-scale, 1));
  }

  cascade-product-context-panel .product-context-header p,
  cascade-product-context-panel .product-context-header h2,
  cascade-product-context-panel .product-context-header span {
    display: block;
    margin: 0;
    min-width: 0;
    overflow-wrap: anywhere;
  }

  cascade-product-context-panel .product-context-header p {
    color: var(--sn-sys-accent);
    font-size: calc(11px * var(--sn-theme-type-scale, 1));
    font-weight: 700;
    text-transform: uppercase;
  }

  cascade-product-context-panel .product-context-header h2 {
    margin-top: 3px;
    color: var(--sn-sys-on-surface);
    font-size: calc(18px * var(--sn-theme-heading-scale, 1));
    line-height: 1.15;
  }

  cascade-product-context-panel .product-context-header span {
    margin-top: 5px;
    color: var(--sn-sys-on-surface-dim);
    font-size: calc(12px * var(--sn-theme-type-scale, 1));
    line-height: 1.4;
  }

  cascade-product-context-panel .product-context-grid {
    display: grid;
    grid-template-columns: minmax(420px, 1.1fr) minmax(320px, 0.9fr);
    gap: var(--sn-lab-panel-gap, 12px);
    min-width: 0;
    min-height: 0;
  }

  cascade-product-context-panel .product-context-main,
  cascade-product-context-panel .product-context-side {
    display: grid;
    gap: var(--sn-lab-panel-gap, 12px);
    min-width: 0;
    min-height: 0;
  }

  cascade-product-context-panel .product-context-main {
    grid-template-rows: auto minmax(0, 1fr);
  }

  cascade-product-context-panel .product-context-side {
    grid-template-rows: auto minmax(170px, 0.5fr) minmax(0, 1fr);
  }

  cascade-product-context-panel .product-context-metrics {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 8px;
  }

  cascade-product-context-panel .product-context-metrics article,
  cascade-product-context-panel .product-context-tools {
    min-width: 0;
    padding: 10px;
    border: var(--sn-node-border-width, 1px) solid var(--sn-sys-outline);
    border-radius: var(--sn-node-radius);
    background: var(--sn-sys-surface-raised);
  }

  cascade-product-context-panel .product-context-metrics strong,
  cascade-product-context-panel .product-context-metrics span {
    display: block;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  cascade-product-context-panel .product-context-metrics strong {
    color: var(--sn-sys-on-surface);
    font-size: calc(18px * var(--sn-theme-heading-scale, 1));
  }

  cascade-product-context-panel .product-context-metrics span {
    margin-top: 3px;
    color: var(--sn-sys-on-surface-dim);
    font-size: calc(11px * var(--sn-theme-type-scale, 1));
  }

  cascade-product-context-panel .product-context-tools {
    display: grid;
    gap: 8px;
  }

  cascade-product-context-panel .product-context-tools header {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
  }

  cascade-product-context-panel .product-context-tools header .material-symbols-outlined {
    color: var(--sn-sys-accent);
    font-size: calc(18px * var(--sn-theme-icon-scale, 1));
  }

  cascade-product-context-panel .product-context-tools header strong {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: calc(13px * var(--sn-theme-type-scale, 1));
  }

  cascade-product-context-panel .product-context-tools article {
    display: grid;
    gap: 3px;
    min-width: 0;
    padding: 7px 8px;
    border: 1px solid color-mix(in oklab, var(--sn-sys-outline) 72%, transparent);
    border-radius: var(--sn-control-radius, 6px);
    background: var(--sn-sys-surface);
  }

  cascade-product-context-panel .product-context-tools article strong,
  cascade-product-context-panel .product-context-tools article span,
  cascade-product-context-panel .product-context-tools article small {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  cascade-product-context-panel .product-context-tools article strong {
    color: var(--sn-sys-on-surface);
    font-size: calc(12px * var(--sn-theme-type-scale, 1));
  }

  cascade-product-context-panel .product-context-tools article span,
  cascade-product-context-panel .product-context-tools article small {
    color: var(--sn-sys-on-surface-dim);
    font-size: calc(11px * var(--sn-theme-type-scale, 1));
  }

  cascade-product-context-panel code-block,
  cascade-product-context-panel sn-event-feed {
    min-width: 0;
    min-height: 0;
    border: var(--sn-node-border-width, 1px) solid var(--sn-sys-outline);
    border-radius: var(--sn-node-radius);
    background: var(--sn-sys-surface);
    overflow: auto;
  }

  @media (max-width: 980px) {
    cascade-product-context-panel .product-context-panel {
      overflow: auto;
    }

    cascade-product-context-panel .product-context-grid,
    cascade-product-context-panel .product-context-metrics {
      grid-template-columns: minmax(0, 1fr);
    }

    cascade-product-context-panel .product-context-grid {
      min-height: 920px;
    }
  }
`;

CascadeProductContextPanel.reg('cascade-product-context-panel');

class CascadeSpatialPanel extends Symbiote {
  initCallback() {
    this._drag = null;
    this.addEventListener('pointerdown', (event) => {
      let node = event.target.closest?.('.spatial-node');
      if (!node) return;
      event.preventDefault();
      node.setPointerCapture?.(event.pointerId);
      this._drag = {
        node,
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        x: Number(node.style.getPropertyValue('--x') || 0),
        y: Number(node.style.getPropertyValue('--y') || 0),
      };
      this._selectNode(node);
    });
    this.addEventListener('pointermove', (event) => {
      if (!this._drag || event.pointerId !== this._drag.pointerId) return;
      let nextX = this._drag.x + event.clientX - this._drag.startX;
      let nextY = this._drag.y + event.clientY - this._drag.startY;
      this._setNodePosition(this._drag.node, nextX, nextY);
    });
    this.addEventListener('pointerup', (event) => this._endDrag(event));
    this.addEventListener('pointercancel', (event) => this._endDrag(event));
  }

  renderCallback() {
    if (this._ready) return;
    this._ready = true;
    [
      ['project', 0, -132, 28],
      ['runtime', 170, -46, -12],
      ['ui', 104, 116, 18],
      ['voice', -112, 118, -24],
      ['xr', -174, -40, 36],
    ].forEach(([id, x, y, z]) => {
      let node = this.querySelector(`[data-node="${id}"]`);
      if (node) {
        node.style.setProperty('--x', x);
        node.style.setProperty('--y', y);
        node.style.setProperty('--z', z);
        node.style.setProperty('--scale', Math.max(0.72, 1 + z / 220).toFixed(3));
      }
    });
    this._selectNode(this.querySelector('[data-node="project"]'));
  }

  _setNodePosition(node, x, y) {
    let stage = this.ref.stage?.getBoundingClientRect?.();
    let maxX = Math.max(120, (stage?.width || 640) / 2 - 58);
    let maxY = Math.max(100, (stage?.height || 420) / 2 - 58);
    let nextX = Math.max(-maxX, Math.min(maxX, x));
    let nextY = Math.max(-maxY, Math.min(maxY, y));
    node.style.setProperty('--x', nextX.toFixed(1));
    node.style.setProperty('--y', nextY.toFixed(1));
    this.ref.position.textContent = `${node.dataset.node}: [${nextX.toFixed(0)}, ${nextY.toFixed(0)}, ${node.style.getPropertyValue('--z') || 0}]`;
  }

  _selectNode(node) {
    if (!node) return;
    this.querySelectorAll('.spatial-node').forEach((item) => item.toggleAttribute('data-active', item === node));
    this.ref.position.textContent = `${node.dataset.node}: [${Number(node.style.getPropertyValue('--x') || 0).toFixed(0)}, ${Number(node.style.getPropertyValue('--y') || 0).toFixed(0)}, ${node.style.getPropertyValue('--z') || 0}]`;
  }

  _endDrag(event) {
    if (!this._drag || event.pointerId !== this._drag.pointerId) return;
    this._drag.node.releasePointerCapture?.(event.pointerId);
    this._drag = null;
  }
}

CascadeSpatialPanel.template = html`
  <section class="spatial-panel">
    <div class="spatial-copy">
      <sn-banner variant="info">Desktop 3D preview: spherical nodes, shared graph data, draggable positions, and XR-ready meter-space contracts.</sn-banner>
      <div class="spatial-contracts">
        <span><span class="material-symbols-outlined">view_in_ar</span> spatial-graph-v1</span>
        <span><span class="material-symbols-outlined">touch_app</span> drag controller</span>
        <span><span class="material-symbols-outlined">account_tree</span> project structure</span>
        <span><span class="material-symbols-outlined">pan_tool_alt</span> grab nodes</span>
      </div>
    </div>
    <div class="spatial-stage" ${{ ref: 'stage' }} aria-label="Draggable spherical project graph preview">
      <div class="spatial-orbit"></div>
      <div class="spatial-link a"></div>
      <div class="spatial-link b"></div>
      <div class="spatial-link c"></div>
      <button class="spatial-node project" type="button" data-node="project">
        <span class="material-symbols-outlined">account_tree</span><strong>Project</strong>
      </button>
      <button class="spatial-node runtime" type="button" data-node="runtime">
        <span class="material-symbols-outlined">memory</span><strong>Runtime</strong>
      </button>
      <button class="spatial-node ui" type="button" data-node="ui">
        <span class="material-symbols-outlined">widgets</span><strong>UI</strong>
      </button>
      <button class="spatial-node voice" type="button" data-node="voice">
        <span class="material-symbols-outlined">record_voice_over</span><strong>Voice</strong>
      </button>
      <button class="spatial-node xr" type="button" data-node="xr">
        <span class="material-symbols-outlined">deployed_code</span><strong>XR</strong>
      </button>
      <output class="spatial-position" ${{ ref: 'position' }}>project: [0, 0, 0]</output>
    </div>
  </section>
`;

CascadeSpatialPanel.rootStyles = `
  cascade-spatial-panel {
    display: block;
    width: 100%;
    height: 100%;
    min-height: 0;
  }

  cascade-spatial-panel .spatial-panel {
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    gap: var(--sn-lab-panel-gap, 12px);
    height: 100%;
    min-height: 0;
    padding: var(--sn-lab-panel-padding, 12px);
    overflow: hidden;
    background:
      radial-gradient(circle at 50% 42%, color-mix(in oklab, var(--sn-sys-accent) 14%, transparent), transparent 44%),
      var(--sn-sys-surface-panel);
    color: var(--sn-sys-on-surface);
  }

  cascade-spatial-panel .spatial-copy {
    display: grid;
    gap: 8px;
  }

  cascade-spatial-panel .spatial-contracts {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  cascade-spatial-panel .spatial-contracts span {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 4px 8px;
    border: var(--sn-node-border-width, 1px) solid var(--sn-sys-outline);
    border-radius: 999px;
    background: var(--sn-sys-surface-raised);
    color: var(--sn-sys-on-surface-dim);
    font-size: calc(11px * var(--sn-theme-type-scale, 1));
  }

  cascade-spatial-panel .spatial-contracts .material-symbols-outlined {
    color: var(--sn-sys-accent);
    font-size: calc(16px * var(--sn-theme-icon-scale, 1));
  }

  cascade-spatial-panel .spatial-stage {
    position: relative;
    min-height: 360px;
    overflow: hidden;
    border: var(--sn-node-border-width, 1px) solid var(--sn-sys-outline);
    border-radius: var(--sn-node-radius);
    background:
      linear-gradient(color-mix(in oklab, var(--sn-sys-on-surface) 5%, transparent) 1px, transparent 1px),
      linear-gradient(90deg, color-mix(in oklab, var(--sn-sys-on-surface) 5%, transparent) 1px, transparent 1px),
      color-mix(in oklab, var(--sn-sys-surface) 86%, var(--sn-sys-accent) 6%);
    background-size: 32px 32px;
    perspective: 900px;
    touch-action: none;
  }

  cascade-spatial-panel .spatial-orbit {
    position: absolute;
    inset: 12%;
    border: 1px solid color-mix(in oklab, var(--sn-sys-accent) 36%, transparent);
    border-radius: 50%;
    transform: rotateX(68deg);
    opacity: 0.72;
  }

  cascade-spatial-panel .spatial-link {
    position: absolute;
    left: 50%;
    top: 50%;
    width: 38%;
    height: 2px;
    border-radius: 999px;
    background: linear-gradient(90deg, transparent, var(--sn-sys-accent), transparent);
    transform-origin: 0 50%;
    opacity: 0.62;
  }

  cascade-spatial-panel .spatial-link.a { transform: rotate(21deg) translateX(-12%); }
  cascade-spatial-panel .spatial-link.b { transform: rotate(122deg) translateX(-16%); }
  cascade-spatial-panel .spatial-link.c { transform: rotate(-45deg) translateX(-18%); }

  cascade-spatial-panel .spatial-node {
    --x: 0;
    --y: 0;
    --z: 0;
    --scale: 1;
    position: absolute;
    left: 50%;
    top: 50%;
    display: grid;
    place-items: center;
    width: calc(82px * var(--sn-theme-density, 1));
    aspect-ratio: 1;
    min-width: 58px;
    border: var(--sn-node-border-width, 1px) solid color-mix(in oklab, var(--node-color, var(--sn-sys-accent)) 56%, var(--sn-sys-outline));
    border-radius: 50%;
    background:
      radial-gradient(circle at 32% 26%, color-mix(in oklab, white 42%, var(--node-color, var(--sn-sys-accent))), transparent 0 12%, transparent 13%),
      radial-gradient(circle at 40% 32%, color-mix(in oklab, var(--node-color, var(--sn-sys-accent)) 64%, white), var(--node-color, var(--sn-sys-accent)) 50%, color-mix(in oklab, var(--sn-sys-surface) 72%, black) 100%);
    color: var(--sn-sys-surface);
    box-shadow: 0 18px 42px color-mix(in oklab, var(--node-color, var(--sn-sys-accent)) 24%, transparent);
    transform:
      translate3d(calc(var(--x) * 1px), calc(var(--y) * 1px), calc(var(--z) * 1px))
      translate(-50%, -50%)
      scale(var(--scale));
    cursor: grab;
    user-select: none;
  }

  cascade-spatial-panel .spatial-node:active {
    cursor: grabbing;
  }

  cascade-spatial-panel .spatial-node[data-active] {
    outline: max(2px, calc(2px * var(--sn-theme-outline-strength, 1))) solid var(--sn-focus-ring);
    outline-offset: 4px;
  }

  cascade-spatial-panel .spatial-node.project { --node-color: var(--sn-tab-accent-0); }
  cascade-spatial-panel .spatial-node.runtime { --node-color: var(--sn-tab-accent-1); }
  cascade-spatial-panel .spatial-node.ui { --node-color: var(--sn-tab-accent-2); }
  cascade-spatial-panel .spatial-node.voice { --node-color: var(--sn-tab-accent-3); }
  cascade-spatial-panel .spatial-node.xr { --node-color: var(--sn-tab-accent-4); }

  cascade-spatial-panel .spatial-node .material-symbols-outlined {
    font-size: calc(26px * var(--sn-theme-icon-scale, 1));
  }

  cascade-spatial-panel .spatial-node strong {
    font-size: calc(10px * var(--sn-theme-type-scale, 1));
    line-height: 1;
  }

  cascade-spatial-panel .spatial-position {
    position: absolute;
    left: 10px;
    bottom: 10px;
    max-width: calc(100% - 20px);
    padding: 5px 8px;
    border-radius: 999px;
    background: color-mix(in oklab, var(--sn-sys-surface) 82%, transparent);
    color: var(--sn-sys-on-surface-dim);
    font-size: calc(11px * var(--sn-theme-type-scale, 1));
  }
`;

CascadeSpatialPanel.reg('cascade-spatial-panel');

const shellMenu = document.querySelector('layout-shell-menu');
const sidebar = document.querySelector('#lab-sidebar');
const layout = document.querySelector('.lab-layout');
layout.setLayoutBehavior({
  minInlineSize: 240,
  minBlockSize: 180,
  responsiveMode: 'stack',
  responsiveBreakpoint: 760,
  overflow: 'collapse',
});
layout.registerPanelType('graph', {
  title: 'Graph',
  icon: 'hub',
  component: 'cascade-graph-panel',
  behavior: {
    importance: 95,
    minInlineSize: 360,
    minBlockSize: 260,
    collapse: 'auto',
  },
  menuActions: [
    { id: 'path:pcb', label: 'PCB', icon: 'conversion_path', active: true, group: 'path', groupLabel: 'Links' },
    { id: 'path:bezier', label: 'Bezier', icon: 'gesture', group: 'path', groupLabel: 'Links' },
    { id: 'path:straight', label: 'Straight', icon: 'horizontal_rule', group: 'path', groupLabel: 'Links' },
    { id: 'graph:insert-node', label: 'Add node', icon: 'add_circle', group: 'graph', groupLabel: 'Graph' },
    { id: 'graph:insert-edge', label: 'Add edge', icon: 'add_link', group: 'graph', groupLabel: 'Graph' },
    { id: 'graph:fit-view', label: 'Fit', icon: 'fit_screen', group: 'graph', groupLabel: 'Graph' },
    { id: 'graph:reset-view', label: 'Reset view', icon: 'center_focus_strong', group: 'graph', groupLabel: 'Graph' },
  ],
});
layout.registerPanelType('overview', {
  title: 'Overview',
  icon: 'hub',
  component: 'cascade-overview-panel',
  behavior: {
    importance: 100,
    minInlineSize: 480,
    minBlockSize: 320,
    collapse: 'never',
  },
});
layout.registerPanelType('ui', {
  title: 'UI',
  icon: 'widgets',
  component: 'cascade-ui-panel',
  behavior: {
    importance: 55,
    minInlineSize: 300,
    minBlockSize: 220,
    collapse: 'auto',
  },
});
layout.registerPanelType('project', {
  title: 'Project files',
  icon: 'account_tree',
  component: 'cascade-project-panel',
  behavior: {
    importance: 98,
    minInlineSize: 440,
    minBlockSize: 320,
    collapse: 'auto',
  },
});
layout.registerPanelType('source', {
  title: 'Source',
  icon: 'code',
  component: 'cascade-source-panel',
  behavior: {
    importance: 92,
    minInlineSize: 420,
    minBlockSize: 320,
    collapse: 'auto',
  },
});
layout.registerPanelType('docs', {
  title: 'Documentation',
  icon: 'description',
  component: 'cascade-docs-panel',
  behavior: {
    importance: 70,
    minInlineSize: 340,
    minBlockSize: 280,
    collapse: 'auto',
  },
});
layout.registerPanelType('project-map', {
  title: 'Project map',
  icon: 'schema',
  component: 'cascade-project-map-panel',
  behavior: {
    importance: 82,
    minInlineSize: 420,
    minBlockSize: 300,
    collapse: 'auto',
  },
});
layout.registerPanelType('chat', {
  title: 'Chats',
  icon: 'forum',
  component: 'cascade-chat-panel',
  behavior: {
    importance: 100,
    minInlineSize: 520,
    minBlockSize: 360,
    collapse: 'never',
  },
});
layout.registerPanelType('agent-chat', {
  title: 'Agent Chat',
  icon: 'smart_toy',
  component: 'cascade-chat-panel',
  behavior: {
    importance: 20,
    minInlineSize: 420,
    minBlockSize: 320,
    collapse: 'manual',
  },
});
layout.registerPanelType('theme', {
  title: 'Theme',
  icon: 'palette',
  component: 'cascade-theme-editor',
  behavior: {
    importance: 80,
    minInlineSize: 280,
    minBlockSize: 240,
    collapse: 'manual',
  },
  attributes: {
    'storage-key': CASCADE_THEME_STORAGE_KEY,
  },
});
layout.registerPanelType('runtime', {
  title: 'Runtime',
  icon: 'memory',
  component: 'cascade-runtime-panel',
  behavior: {
    importance: 70,
    minInlineSize: 320,
    minBlockSize: 260,
    collapse: 'auto',
  },
});
layout.registerPanelType('board', {
  title: 'Kanban board',
  icon: 'view_kanban',
  component: 'cascade-board-panel',
  behavior: {
    importance: 100,
    minInlineSize: 560,
    minBlockSize: 360,
    collapse: 'never',
    overflow: 'scroll-inline',
  },
});
layout.registerPanelType('product-context', {
  title: 'Product context',
  icon: 'api',
  component: 'cascade-product-context-panel',
  behavior: {
    importance: 96,
    minInlineSize: 560,
    minBlockSize: 380,
    collapse: 'never',
    overflow: 'scroll-inline',
  },
});
layout.registerPanelType('spatial', {
  title: 'Spatial',
  icon: 'view_in_ar',
  component: 'cascade-spatial-panel',
  behavior: {
    importance: 100,
    minInlineSize: 420,
    minBlockSize: 320,
    collapse: 'never',
  },
});
layout.registerPanelType('viewport', {
  title: 'Viewport',
  icon: 'smart_display',
  component: 'sn-canvas-viewport',
  behavior: {
    importance: 100,
    minInlineSize: 420,
    minBlockSize: 280,
    collapse: 'never',
  },
});
layout.registerPanelType('timeline', {
  title: 'Timeline',
  icon: 'view_timeline',
  component: 'sn-timeline-editor',
  behavior: {
    importance: 95,
    minInlineSize: 480,
    minBlockSize: 180,
    collapse: 'auto',
  },
});
layout.registerPanelType('dialogue-tour', {
  title: 'Dialogue tour',
  icon: 'record_voice_over',
  component: 'cascade-dialogue-tour-panel',
  behavior: {
    importance: 100,
    minInlineSize: 520,
    minBlockSize: 360,
    collapse: 'never',
  },
});
layout.registerPanelType('presenter-cursor', {
  title: 'Presenter cursor',
  icon: 'ads_click',
  component: 'cascade-cursor-panel',
  behavior: {
    importance: 100,
    minInlineSize: 480,
    minBlockSize: 360,
    collapse: 'never',
  },
});
layout.registerPanelType('chat-parts', {
  title: 'Custom parts',
  icon: 'smart_button',
  component: 'cascade-chat-parts-panel',
  behavior: {
    importance: 100,
    minInlineSize: 520,
    minBlockSize: 360,
    collapse: 'never',
  },
});
layout.$.panelChrome = true;
const createPanel = (panelType, behavior) => LayoutTree.createPanel(panelType, {}, behavior);

const createCollapsedAgentChatPanel = () => {
  let panel = createPanel('agent-chat', {
    importance: 20,
    minInlineSize: 420,
    minBlockSize: 320,
    collapse: 'manual',
  });
  panel.collapsed = true;
  panel.panelState = {
    singleton: 'page-agent-chat',
    role: 'agent',
  };
  return panel;
};

const createShowcaseLayout = (mainLayout) => LayoutTree.createSplit(
  'horizontal',
  mainLayout,
  createCollapsedAgentChatPanel(),
  0.65,
  {
    responsiveMode: 'preserve',
    overflow: 'collapse',
  }
);

const createOverviewLayout = () => createPanel('overview', {
  importance: 100,
  minInlineSize: 520,
  minBlockSize: 360,
  collapse: 'never',
});

const createProjectLayout = () => LayoutTree.createSplit(
  'horizontal',
  createPanel('project', { importance: 100, minInlineSize: 560, minBlockSize: 380 }),
  createPanel('runtime', { importance: 54, minInlineSize: 340, minBlockSize: 260 }),
  0.64
);

const createProjectSourceLayout = () => LayoutTree.createSplit(
  'horizontal',
  createPanel('project', { importance: 92, minInlineSize: 280, minBlockSize: 320 }),
  createPanel('source', { importance: 100, minInlineSize: 480, minBlockSize: 340 }),
  0.32
);

const createProjectDocsLayout = () => LayoutTree.createSplit(
  'horizontal',
  createPanel('project', { importance: 82, minInlineSize: 280, minBlockSize: 320 }),
  createPanel('docs', { importance: 100, minInlineSize: 420, minBlockSize: 320 }),
  0.32
);

const createProjectMapLayout = () => LayoutTree.createSplit(
  'horizontal',
  createPanel('project-map', { importance: 100, minInlineSize: 520, minBlockSize: 340 }),
  createPanel('runtime', { importance: 52, minInlineSize: 320, minBlockSize: 260 }),
  0.64
);

const createGraphLayout = () => LayoutTree.createSplit(
  'horizontal',
  createPanel('graph', { importance: 100, minInlineSize: 520, minBlockSize: 360 }),
  createPanel('ui', { importance: 45 }),
  0.62
);

const createComponentsLayout = () => LayoutTree.createSplit(
  'horizontal',
  createPanel('ui', { importance: 100, minInlineSize: 420, minBlockSize: 320 }),
  createPanel('runtime', { importance: 62, minInlineSize: 340, minBlockSize: 280 }),
  0.56
);

const createChatLayout = () => createPanel('chat', {
  importance: 100,
  minInlineSize: 560,
  minBlockSize: 380,
  collapse: 'never',
});

const createDialogueTourLayout = () => createPanel('dialogue-tour', {
  importance: 100,
  minInlineSize: 520,
  minBlockSize: 360,
  collapse: 'never',
});

const createPresenterCursorLayout = () => createPanel('presenter-cursor', {
  importance: 100,
  minInlineSize: 480,
  minBlockSize: 360,
  collapse: 'never',
});

const createChatPartsLayout = () => createPanel('chat-parts', {
  importance: 100,
  minInlineSize: 520,
  minBlockSize: 360,
  collapse: 'never',
});

const createResponsiveLayout = () => LayoutTree.createSplit(
  'horizontal',
  createPanel('graph', {
    importance: 100,
    minInlineSize: 620,
    minBlockSize: 360,
    collapse: 'never',
    overflow: 'scroll-inline',
  }),
  createPanel('ui', {
    importance: 45,
    minInlineSize: 360,
    minBlockSize: 260,
    collapse: 'auto',
  }),
  0.64
);

const createThemeLayout = () => LayoutTree.createSplit(
  'horizontal',
  createPanel('theme', { importance: 100, collapse: 'manual', minInlineSize: 320, minBlockSize: 280 }),
  createPanel('ui', { importance: 48 }),
  0.42
);

const createRuntimeLayout = () => LayoutTree.createSplit(
  'horizontal',
  createPanel('runtime', { importance: 100, minInlineSize: 420, minBlockSize: 320 }),
  createPanel('ui', { importance: 48, minInlineSize: 320, minBlockSize: 260 }),
  0.58
);

const createBoardLayout = () => createPanel('board', {
  importance: 100,
  minInlineSize: 620,
  minBlockSize: 420,
  collapse: 'never',
  overflow: 'scroll-inline',
});

const createProductContextLayout = () => createPanel('product-context', {
  importance: 100,
  minInlineSize: 620,
  minBlockSize: 420,
  collapse: 'never',
  overflow: 'scroll-inline',
});

const createSpatialLayout = () => LayoutTree.createSplit(
  'horizontal',
  createPanel('spatial', {
    importance: 100,
    minInlineSize: 520,
    minBlockSize: 360,
    collapse: 'never',
    overflow: 'scroll-inline',
  }),
  createPanel('graph', { importance: 70, minInlineSize: 420, minBlockSize: 320 }),
  0.58
);

const createVideoStudioLayout = () => LayoutTree.createSplit(
  'vertical',
  LayoutTree.createSplit(
    'horizontal',
    createPanel('viewport', { importance: 100, minInlineSize: 420, minBlockSize: 280, collapse: 'never' }),
    createPanel('graph', { importance: 60, minInlineSize: 320, minBlockSize: 260 }),
    0.55
  ),
  createPanel('timeline', { importance: 95, minInlineSize: 480, minBlockSize: 180 }),
  0.62
);

const createVideoPreviewLayout = () => LayoutTree.createSplit(
  'vertical',
  createPanel('viewport', { importance: 100, minInlineSize: 520, minBlockSize: 320, collapse: 'never' }),
  createPanel('timeline', { importance: 88, minInlineSize: 480, minBlockSize: 160 }),
  0.65
);

const createVideoEffectsLayout = () => LayoutTree.createSplit(
  'horizontal',
  LayoutTree.createSplit(
    'vertical',
    createPanel('viewport', { importance: 100, minInlineSize: 420, minBlockSize: 260 }),
    createPanel('timeline', { importance: 90, minInlineSize: 400, minBlockSize: 160 }),
    0.6
  ),
  createPanel('theme', { importance: 60, minInlineSize: 300, minBlockSize: 260 }),
  0.68
);

const view = (id, label, icon, layoutFactory, options = {}) => ({
  id,
  label,
  icon,
  layoutFactory,
  ...options,
});

const showcaseProjects = [
  {
    id: 'symbiote-ui',
    name: 'Symbiote UI',
    icon: 'hub',
    sidebarLabel: 'Symbiote UI',
    sidebarIcon: 'hub',
    color: 'var(--sn-tab-accent-0)',
    closeable: false,
    behavior: { responsiveMode: 'stack', responsiveBreakpoint: 820, overflow: 'collapse' },
    views: [
      view('overview', 'Overview', 'map', createOverviewLayout),
      view('component-roles', 'Component roles', 'category', createComponentsLayout),
      view('layout-groups', 'Layout groups', 'view_quilt', createProjectSourceLayout),
      view('cascade-theme', 'Cascade theme', 'palette', createThemeLayout),
      view('manifest-webmcp', 'Manifest & WebMCP', 'api', createComponentsLayout),
      view('runtime-ui', 'Runtime UI', 'memory', createRuntimeLayout),
      view('engine', 'Engine link', 'settings_suggest', createRuntimeLayout),
      view('ssr-registration', 'SSR / browser', 'deployed_code', createProjectDocsLayout),
      view('spatial-bridge', 'Spatial bridge', 'view_in_ar', createSpatialLayout),
      view('presenter-cursor', 'Presenter cursor', 'ads_click', createPresenterCursorLayout),
    ],
  },
  {
    id: 'chat',
    name: 'Chat',
    icon: 'forum',
    sidebarLabel: 'Chat',
    sidebarIcon: 'forum',
    color: 'var(--sn-tab-accent-2)',
    closeable: false,
    behavior: { responsiveMode: 'stack', responsiveBreakpoint: 780, overflow: 'collapse' },
    views: [
      view('conversation', 'Conversation', 'forum', createChatLayout),
      view('voice-controls', 'Voice controls', 'record_voice_over', createChatLayout),
      view('dialogue-tour', 'Dialogue tour', 'record_voice_over', createDialogueTourLayout),
      view('markdown-code', 'Markdown & code', 'code_blocks', createChatLayout),
      view('runtime-panels', 'Runtime panels', 'view_quilt', createChatLayout),
      view('tool-calls', 'Tool calls', 'terminal', createChatLayout),
      view('history', 'Chat history', 'manage_history', createChatLayout),
      view('theme-response', 'Theme response', 'palette', createChatLayout),
      view('chat-parts', 'Custom buttons & embeds', 'smart_button', createChatPartsLayout),
    ],
  },
  {
    id: 'multi-agent-dev',
    name: 'Multi-Agent Dev',
    icon: 'account_tree',
    sidebarLabel: 'Development',
    sidebarIcon: 'account_tree',
    color: 'var(--sn-tab-accent-1)',
    closeable: false,
    behavior: { responsiveMode: 'stack', responsiveBreakpoint: 860, overflow: 'collapse' },
    views: [
      view('project-overview', 'Project overview', 'dashboard', createProjectLayout),
      view('file-tree', 'File tree', 'folder_open', createProjectLayout),
      view('source-editor', 'Source editor', 'edit_note', createProjectSourceLayout),
      view('markdown-docs', 'Markdown/docs', 'description', createProjectDocsLayout),
      view('dependency-graph', 'Dependency graph', 'hub', createProjectMapLayout),
      view('tests-status', 'Tests & status', 'fact_check', createRuntimeLayout),
      view('review-handoffs', 'Reviews', 'rate_review', createRuntimeLayout),
      view('runtime-actions', 'Runtime actions', 'memory', createRuntimeLayout),
    ],
  },
  {
    id: 'automation',
    name: 'Automation',
    icon: 'automation',
    sidebarLabel: 'Automation',
    sidebarIcon: 'automation',
    color: 'var(--sn-tab-accent-3)',
    closeable: false,
    behavior: { responsiveMode: 'scroll-inline', responsiveBreakpoint: 900, overflow: 'collapse' },
    views: [
      view('workflow-graph', 'Workflow graph', 'schema', createGraphLayout),
      view('kanban-board', 'Kanban board', 'view_kanban', createBoardLayout),
      view('product-context', 'Product context', 'api', createProductContextLayout),
      view('form-controls', 'Form controls', 'smart_button', createComponentsLayout),
      view('approvals', 'Approvals', 'approval', createRuntimeLayout),
      view('schedule', 'Schedule', 'calendar_month', createRuntimeLayout),
      view('execution-logs', 'Execution logs', 'receipt_long', createRuntimeLayout),
      view('engine-state', 'Engine state', 'settings_suggest', createRuntimeLayout),
      view('recovery', 'Recovery actions', 'restart_alt', createRuntimeLayout),
    ],
  },
  {
    id: 'media-generation',
    name: 'Media Generation',
    icon: 'auto_awesome',
    sidebarLabel: 'Media',
    sidebarIcon: 'auto_awesome',
    color: 'var(--sn-tab-accent-4)',
    closeable: false,
    behavior: { responsiveMode: 'stack', responsiveBreakpoint: 840, overflow: 'collapse' },
    views: [
      view('prompt-builder', 'Prompt builder', 'edit_note', createProjectSourceLayout),
      view('parameters', 'Parameters', 'tune', createThemeLayout),
      view('variants', 'Variants', 'grid_view', createComponentsLayout),
      view('preview', 'Preview', 'preview', createComponentsLayout),
      view('provenance', 'Provenance', 'history_edu', createProjectDocsLayout),
      view('export', 'Export', 'ios_share', createRuntimeLayout),
    ],
  },
  {
    id: 'video-editor',
    name: 'Video Editor',
    icon: 'movie',
    sidebarLabel: 'Video',
    sidebarIcon: 'movie',
    color: 'var(--sn-tab-accent-5)',
    closeable: false,
    behavior: { responsiveMode: 'scroll-inline', responsiveBreakpoint: 960, overflow: 'collapse' },
    views: [
      view('studio', 'Studio', 'movie', createVideoStudioLayout),
      view('preview-monitor', 'Preview', 'smart_display', createVideoPreviewLayout),
      view('effects', 'Effects', 'video_settings', createVideoEffectsLayout),
      view('clip-bin', 'Clip bin', 'video_library', createComponentsLayout),
      view('transcript', 'Transcript', 'subtitles', createProjectDocsLayout),
      view('render-queue', 'Render queue', 'hourglass_top', createRuntimeLayout),
      view('automation-graph', 'Automation graph', 'schema', createGraphLayout),
    ],
  },
  {
    id: 'data-research',
    name: 'Data / Research',
    icon: 'query_stats',
    sidebarLabel: 'Research',
    sidebarIcon: 'query_stats',
    color: 'var(--sn-tab-accent-6)',
    closeable: false,
    behavior: { responsiveMode: 'stack', responsiveBreakpoint: 860, overflow: 'collapse' },
    views: [
      view('query', 'Query', 'manage_search', createProjectSourceLayout),
      view('table', 'Table', 'table_chart', createComponentsLayout),
      view('chart', 'Chart', 'insert_chart', createComponentsLayout),
      view('sources', 'Sources', 'source', createProjectLayout),
      view('citations', 'Citations', 'format_quote', createProjectDocsLayout),
      view('report', 'Report', 'article', createProjectDocsLayout),
      view('graph', 'Evidence graph', 'hub', createGraphLayout),
    ],
  },
  {
    id: 'node-studio',
    name: 'Node Studio',
    icon: 'developer_board',
    sidebarLabel: 'Node Studio',
    sidebarIcon: 'developer_board',
    color: 'var(--sn-tab-accent-1)',
    closeable: false,
    behavior: { responsiveMode: 'scroll-inline', responsiveBreakpoint: 920, overflow: 'scroll-inline' },
    views: [
      view('editable-canvas', 'Editable canvas', 'hub', createGraphLayout),
      view('pcb-routing', 'PCB routing', 'conversion_path', createResponsiveLayout),
      view('node-variants', 'Node variants', 'category', createGraphLayout),
      view('inspector', 'Inspector', 'page_info', createGraphLayout),
      view('simulation', 'Simulation', 'play_circle', createRuntimeLayout),
      view('generated-code', 'Generated code', 'code', createProjectSourceLayout),
      view('overview-graph', 'Overview graph', 'account_tree', createGraphLayout),
    ],
  },
  {
    id: 'spatial-xr',
    name: 'Spatial / XR',
    icon: 'view_in_ar',
    sidebarLabel: 'Spatial',
    sidebarIcon: 'view_in_ar',
    color: 'var(--sn-tab-accent-4)',
    closeable: false,
    behavior: { responsiveMode: 'scroll-inline', responsiveBreakpoint: 920, overflow: 'scroll-inline' },
    views: [
      view('3d-graph', '3D graph', 'deployed_code', createSpatialLayout),
      view('spatial-panels', 'Spatial panels', 'view_in_ar', createSpatialLayout),
      view('pointer-drag', 'Pointer & drag', 'open_with', createSpatialLayout),
      view('voice-controls', 'Voice controls', 'record_voice_over', createRuntimeLayout),
      view('theme-bridge', 'Theme bridge', 'palette', createSpatialLayout),
      view('2d-fallback', '2D fallback', 'view_quilt', createProjectSourceLayout),
    ],
  },
];

const showcaseProjectGroups = showcaseProjects.map((project) => ({
  id: project.id,
  name: project.name,
  icon: project.icon,
  sidebarLabel: project.sidebarLabel,
  sidebarIcon: project.sidebarIcon,
  color: project.color,
  closeable: project.closeable,
  behavior: project.behavior,
}));

const defaultProjectId = 'symbiote-ui';
let activeProjectId = defaultProjectId;
const activeViewByProject = new Map(showcaseProjects.map((project) => [project.id, project.views[0]?.id || 'overview']));

function getProject(id = activeProjectId) {
  return showcaseProjects.find((project) => project.id === id) || showcaseProjects[0];
}

function getProjectView(project, viewId) {
  return project.views.find((item) => item.id === viewId) || project.views[0];
}

function viewSectionId(projectId, viewId) {
  return `${projectId}:${viewId}`;
}

function parseViewSectionId(sectionId) {
  let [projectId, ...rest] = String(sectionId || '').split(':');
  return {
    projectId,
    viewId: rest.join(':'),
  };
}

function syncProjectSidebar(project, activeViewId) {
  if (!sidebar) return;
  sidebar.routerSync = false;
  sidebar.setSections?.(project.views.map((item) => ({
    id: viewSectionId(project.id, item.id),
    icon: item.icon,
    label: item.label,
    disabled: item.disabled,
  })));
  sidebar.setActiveSection?.(viewSectionId(project.id, activeViewId));
  sidebar.$.collapsed = true;
}

function syncShellHomeTab() {
  let tabs = shellMenu?.ref?.tabs;
  if (!tabs?.$) return;
  tabs.$.homeIcon = 'hub';
  tabs.$.homeLabel = 'Symbiote UI';
}

function readHashState() {
  let raw = String(location.hash || '').replace(/^#\/?/, '').split(/[?#]/)[0];
  if (!raw) return {};
  let [projectId, viewId] = raw.split('/');
  if (!viewId && showcaseProjects.some((project) => project.id === projectId)) {
    return { projectId };
  }
  let legacyProject = showcaseProjects.find((project) => project.views.some((item) => item.id === projectId));
  if (!viewId && legacyProject) {
    return { projectId: legacyProject.id, viewId: projectId };
  }
  return { projectId, viewId };
}

function writeHashState(projectId, viewId) {
  let nextHash = `#${projectId}/${viewId}`;
  if (location.hash === nextHash) return;
  history.replaceState(null, '', nextHash);
}

function applyShowcaseView(projectId = activeProjectId, viewId = activeViewByProject.get(projectId), options = {}) {
  let project = getProject(projectId);
  let viewConfig = getProjectView(project, viewId);
  activeProjectId = project.id;
  activeViewByProject.set(project.id, viewConfig.id);
  layout.setLayoutBehavior({
    minInlineSize: 240,
    minBlockSize: 180,
    ...project.behavior,
    ...viewConfig.behavior,
  });
  let viewLayout = viewConfig.layoutFactory();
  layout.setLayout(project.id === 'chat' ? viewLayout : createShowcaseLayout(viewLayout));
  shellMenu?.setActiveGroup?.(project.id);
  syncShellHomeTab();
  syncProjectSidebar(project, viewConfig.id);
  document.documentElement.dataset.showcaseProject = project.id;
  document.documentElement.dataset.showcaseView = viewConfig.id;
  syncCascadeThemeSurface(project.id, `cascade-lab-${project.id}-scope`);
  if (project.id === 'video-editor') scheduleVideoPanelInit();
  if (options.writeHash !== false) writeHashState(project.id, viewConfig.id);
}

let initialState = readHashState();
activeProjectId = getProject(initialState.projectId || defaultProjectId).id;
if (initialState.viewId) {
  activeViewByProject.set(activeProjectId, getProjectView(getProject(activeProjectId), initialState.viewId).id);
}
shellMenu?.setGroups?.(showcaseProjectGroups, activeProjectId);
syncShellHomeTab();
if (sidebar) sidebar.$.collapsed = true;
shellMenu?.addEventListener('layout-group-change', (event) => {
  let project = getProject(event.detail?.id);
  applyShowcaseView(project.id, activeViewByProject.get(project.id));
});
shellMenu?.addEventListener('layout-group-add', () => applyShowcaseView('node-studio', 'editable-canvas'));
sidebar?.addEventListener('sidebar-section-select', (event) => {
  let { projectId, viewId } = parseViewSectionId(event.detail?.id || event.detail?.sectionId);
  if (projectId !== activeProjectId) return;
  event.preventDefault?.();
  applyShowcaseView(projectId, viewId);
});
shellMenu?.addEventListener('cascade-theme-open-full', (event) => {
  let scope = cascadeThemeScopeForProject(activeProjectId);
  layout.openPanel('theme', {
    behavior: {
      importance: 100,
      minInlineSize: 320,
      minBlockSize: 280,
      collapse: 'manual',
    },
    direction: 'horizontal',
    panelState: {
      storageKey: event.detail?.storageKey || scope.storageKey,
    },
    ratio: 0.66,
    source: 'theme-widget',
    uiInvoked: true,
  });
  queueMicrotask(() => {
    document.querySelectorAll('cascade-theme-editor').forEach((editor) => {
      configureCascadeThemeElement(editor, activeProjectId);
    });
  });
});
window.addEventListener('hashchange', () => {
  let state = readHashState();
  if (state.projectId) applyShowcaseView(state.projectId, state.viewId, { writeHash: false });
});
shellMenu?.addEventListener('click', (event) => {
  let commandButton = event.target.closest('[data-layout-command]');
  if (!commandButton) return;
  if (commandButton.dataset.layoutCommand === 'reset') {
    applyShowcaseView(activeProjectId, activeViewByProject.get(activeProjectId));
  }
});

// ── Video panel mock data auto-loader ──
const VIDEO_MOCK_TIMELINE = {
  fps: 30,
  duration: 900,
  tracks: [
    { id: 'v1', type: 'video', label: 'Video 1', clips: [
      { id: 'intro', start: 0, end: 90, label: 'Intro' },
      { id: 'scene-1', start: 100, end: 350, label: 'Scene 1' },
      { id: 'scene-2', start: 360, end: 600, label: 'Scene 2' },
      { id: 'outro', start: 750, end: 900, label: 'Outro' },
    ] },
    { id: 'v2', type: 'video', label: 'Video 2 (B-roll)', clips: [
      { id: 'broll-1', start: 120, end: 280, label: 'B-roll' },
      { id: 'broll-2', start: 400, end: 520, label: 'Interview' },
    ] },
    { id: 'a1', type: 'audio', label: 'Music', clips: [
      { id: 'bgm', start: 0, end: 900, label: 'Background Music' },
    ] },
    { id: 'a2', type: 'audio', label: 'Voice', clips: [
      { id: 'vo-1', start: 30, end: 340, label: 'Narration' },
      { id: 'vo-2', start: 380, end: 580, label: 'Dialog' },
    ] },
    { id: 't1', type: 'text', label: 'Titles', clips: [
      { id: 'title', start: 10, end: 80, label: 'Main Title' },
      { id: 'lower-3rd', start: 130, end: 200, label: 'Lower Third' },
      { id: 'credits', start: 800, end: 890, label: 'Credits' },
    ] },
    { id: 'fx', type: 'effect', label: 'Effects', clips: [
      { id: 'trans-1', start: 88, end: 102, label: 'Cross Dissolve' },
      { id: 'trans-2', start: 348, end: 362, label: 'Fade' },
      { id: 'color', start: 100, end: 600, label: 'Color Grade' },
    ] },
  ],
  markers: [
    { frame: 90, label: 'Act I' },
    { frame: 350, label: 'Act II' },
    { frame: 750, label: 'Act III' },
  ],
};

const VIDEO_MOCK_COMPOSITION = {
  width: 1920,
  height: 1080,
  fps: 30,
  duration: 900,
  background: 'hsl(230 25% 12%)',
  layers: [
    { type: 'gradient', x: 0, y: 0, width: 1920, height: 1080, stops: [[0, 'hsl(220 35% 18%)'], [0.6, 'hsl(260 30% 14%)'], [1, 'hsl(200 25% 10%)']], opacity: 1 },
    { type: 'rect', x: 160, y: 180, width: 1600, height: 720, color: 'hsl(220 20% 16%)', opacity: 0.85 },
    { type: 'circle', x: 960, y: 400, radius: 180, color: 'hsl(210 55% 42%)', opacity: 0.3 },
    { type: 'circle', x: 700, y: 500, radius: 120, color: 'hsl(280 50% 45%)', opacity: 0.2 },
    { type: 'text', x: 480, y: 340, text: 'symbiote-video', fontSize: 72, fontFamily: 'Inter, sans-serif', color: 'hsl(0 0% 94%)' },
    { type: 'text', x: 480, y: 430, text: 'Programmatic video framework', fontSize: 28, fontFamily: 'Inter, sans-serif', color: 'hsl(0 0% 60%)' },
    { type: 'rect', x: 480, y: 500, width: 200, height: 4, color: 'hsl(210 55% 42%)', opacity: 0.6 },
    { type: 'text', x: 480, y: 540, text: '00:00:00 / 00:30:00  •  1920×1080  •  30 fps', fontSize: 16, fontFamily: 'monospace', color: 'hsl(0 0% 40%)' },
  ],
};

function initVideoPanel(el) {
  if (el.matches('sn-timeline-editor') && !el._demoInit) {
    el._demoInit = true;
    el.loadTimeline(VIDEO_MOCK_TIMELINE);
  }
  if (el.matches('sn-canvas-viewport') && !el._demoInit) {
    el._demoInit = true;
    el.loadComposition(VIDEO_MOCK_COMPOSITION);
  }
}

function initVideoPanels(root = layout) {
  if (!root) return;
  initVideoPanel(root);
  root.querySelectorAll?.('sn-timeline-editor, sn-canvas-viewport').forEach(initVideoPanel);
}

function scheduleVideoPanelInit() {
  queueMicrotask(() => {
    initVideoPanels(layout);
    requestAnimationFrame(() => initVideoPanels(layout));
  });
}

// Sync playhead between timeline and viewport
layout.addEventListener('playhead-change', (e) => {
  let frame = e.detail?.frame;
  if (frame == null) return;
  layout.querySelectorAll('sn-canvas-viewport').forEach((vp) => {
    if (!vp._demoInit) return;
    vp.setFrame(frame);
  });
});

// Auto-init video panels when they appear in the layout
let videoObserver = new MutationObserver((mutations) => {
  for (let m of mutations) {
    for (let node of m.addedNodes) {
      if (node.nodeType !== 1) continue;
      initVideoPanels(node);
    }
  }
});
videoObserver.observe(layout, { childList: true, subtree: true });

applyShowcaseView(activeProjectId, activeViewByProject.get(activeProjectId));
