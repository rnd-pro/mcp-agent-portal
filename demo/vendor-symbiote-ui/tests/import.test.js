import { acquireCurrentTestFileLock } from './test-lock.js';
await acquireCurrentTestFileLock(import.meta.url);

import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

test('root and metadata entrypoints import in Node', async () => {
  let root = await import('../index.js');
  let layout = await import('../layout/index.js');
  let runtime = await import('../runtime/index.js');
  let productContext = await import('../runtime/product-context.js');
  let manifest = await import('../manifest/index.js');
  let webmcp = await import('../webmcp.js');
  let xr = await import('../xr/index.js');

  assert.equal(typeof root.NodeEditor, 'function');
  assert.equal(typeof root.createCascadeTheme, 'function');
  assert.equal(typeof root.clearCascadeThemeInlineTokens, 'function');
  assert.equal(typeof root.getReadableTextForHsl, 'function');
  assert.equal(typeof root.createRuntimeUiInstance, 'function');
  assert.equal(root.PRODUCT_CONTEXT_VERSION, 'product-context-v1');
  assert.equal(typeof root.normalizeProductContext, 'function');
  assert.equal(typeof root.buildChatNavTree, 'function');
  assert.equal(typeof root.normalizeResourceTreeItem, 'function');
  assert.equal(typeof root.normalizeSourceDocument, 'function');
  assert.equal(typeof root.normalizeCanvasGraphGroups, 'function');
  assert.equal(typeof root.installRenderClock, 'function');
  assert.equal(typeof root.renderNow, 'function');
  assert.equal(typeof root.normalizeForceGroups, 'function');
  assert.equal(typeof root.resolveCanvasGraphViewportFit, 'function');
  assert.equal(typeof root.resolveCanvasGraphTransitionDuration, 'function');
  assert.equal(typeof root.resolveCanvasGraphMinZoom, 'function');
  assert.equal(typeof root.createGraphViewModeController, 'function');
  assert.equal(typeof root.configureAutoLocalization, 'function');
  assert.equal(typeof root.getNavigatorLocalePreferences, 'function');
  assert.equal(typeof root.matchVoiceCommandAtEnd, 'function');
  assert.equal(root.defaultSendCommandPhrases().ru, 'отправить');
  assert.equal(typeof runtime.createRuntimeUiController, 'function');
  assert.equal(runtime.RUNTIME_UI_CONTRACT.version, 'runtime-ui-v1');
  assert.equal(runtime.PRODUCT_CONTEXT_SCHEMA_ID, 'https://rnd-pro.github.io/symbiote-ui/schemas/product-context-v1.json');
  assert.equal(typeof runtime.normalizeRuntimeSafeAction, 'function');
  assert.equal(typeof runtime.normalizeRuntimeEnrichment, 'function');
  assert.equal(typeof runtime.normalizeRuntimeHook, 'function');
  assert.equal(productContext.PRODUCT_CONTEXT_VERSION, 'product-context-v1');
  assert.equal(typeof manifest.listComponents, 'function');
  assert.equal(typeof manifest.listAgentComponentDescriptions, 'function');
  assert.equal(typeof manifest.listThemeRuntimeDescriptors, 'function');
  assert.ok(manifest.listUiSchemaVersions().includes('product-context-v1'));
  assert.equal(manifest.getUiSchema('product-context-v1').title, 'Symbiote UI Product Context');
  assert.equal(typeof webmcp.createToolDescriptor, 'function');
  assert.equal(typeof webmcp.createComponentToolDescriptor, 'function');
  assert.equal(typeof webmcp.createProductWebMcpBundle, 'function');
  assert.equal(typeof webmcp.createWebMcpPresentationActionPack, 'function');
  assert.equal(typeof webmcp.createWebMcpWindowRuntimeActions, 'function');
  assert.equal(typeof webmcp.createWebMcpWindowRuntimeActionPack, 'function');
  assert.equal(webmcp.WEBMCP_WINDOW_LAYOUT_ACTION_ID, 'set_window_layout');
  assert.equal(webmcp.WEBMCP_WINDOW_ADD_PANEL_ACTION_ID, 'add_window_panel');
  assert.equal(webmcp.WEBMCP_WINDOW_REMOVE_PANEL_ACTION_ID, 'remove_window_panel');
  assert.equal(webmcp.WEBMCP_PANEL_BEHAVIOR_ACTION_ID, 'set_panel_behavior');
  assert.equal(typeof webmcp.createWebMcpPresentationController, 'function');
  assert.equal(typeof webmcp.getWebMcpPresentationActionPhase, 'function');
  assert.equal(typeof webmcp.createWebMcpTourTurnActionPlan, 'function');
  assert.equal(typeof webmcp.collectWebMcpComponentTargets, 'function');
  assert.equal(typeof webmcp.createWebMcpHookActionPlan, 'function');
  assert.equal(typeof webmcp.runWebMcpHookAction, 'function');
  assert.equal(typeof webmcp.describeWebMcpPresentationActions, 'function');
  assert.equal(typeof webmcp.buildWebMcpTourPrompt, 'function');
  assert.equal(typeof webmcp.coerceWebMcpTourTimelinePayload, 'function');
  assert.equal(typeof webmcp.validateWebMcpPresentationCommand, 'function');
  assert.equal(typeof webmcp.coerceWebMcpPresentationCommand, 'function');
  assert.equal(typeof webmcp.matchesWebMcpHookTrigger, 'function');
  assert.equal(typeof webmcp.normalizeWebMcpTargetText, 'function');
  assert.equal(typeof webmcp.formatWebMcpTargetLine, 'function');
  assert.equal(typeof webmcp.resolveWebMcpRuntimeTarget, 'function');
  assert.equal(typeof webmcp.createWebMcpHooks, 'function');
  assert.equal(typeof webmcp.createWebMcpObserver, 'function');
  assert.equal(typeof webmcp.createProductContextToolDescriptors, 'function');
  assert.equal(typeof layout.resolveLayoutMinSize, 'function');
  assert.equal(typeof layout.resolveResponsiveLayoutState, 'function');

  assert.equal(typeof xr.createOctree, 'function');
  assert.equal(typeof xr.createSpatialGraphModel, 'function');
  assert.equal(typeof xr.createSphericalGraphLayout, 'function');
  assert.equal(typeof xr.createSpatialDragController, 'function');
  assert.equal(typeof xr.createSimulation, 'function');
  assert.equal(typeof xr.createForceLayoutAdapter, 'function');
  assert.equal(typeof xr.createDualViewController, 'function');
});

test('ui browser entrypoint wires catalog module exports once', async () => {
  let source = await readFile(new URL('../ui/index.js', import.meta.url), 'utf8');
  let { listComponents } = await import('../manifest/index.js');
  let match = source.match(/registerCatalogModules\(\{([\s\S]*?)\n  \}\);/);

  assert.ok(match, 'registerCatalogModules object is present');

  let registeredKeys = [...match[1].matchAll(/^\s*([A-Za-z_$][\w$]*),\s*$/gm)]
    .map((entry) => entry[1]);
  let keyCounts = new Map();
  for (let key of registeredKeys) {
    keyCounts.set(key, (keyCounts.get(key) || 0) + 1);
  }
  let duplicateKeys = [...keyCounts]
    .filter(([, count]) => count > 1)
    .map(([key]) => key);
  let expectedExportNames = listComponents({ includeInternal: true, includeExperimental: true })
    .map((component) => component.exportName)
    .filter(Boolean);
  let missingExportNames = expectedExportNames
    .filter((exportName) => !registeredKeys.includes(exportName));

  assert.deepEqual(duplicateKeys, []);
  assert.deepEqual(missingExportNames, []);
  for (let lateCatalogExport of ['QrCode', 'VideoPlayer', 'TimelineEditor']) {
    assert.ok(registeredKeys.includes(lateCatalogExport), lateCatalogExport);
  }
});

test('locale auto mode resolves browser preferences from the library contract', async () => {
  let {
    applyLocalizationToDocument,
    configureAutoLocalization,
    configureLocalization,
    getLocalization,
    getNavigatorLocalePreferences,
    resetLocalization,
    translate,
  } = await import('../locale/index.js');

  resetLocalization();
  configureLocalization({ mode: 'auto', preferences: ['ru-RU', 'en-US'] });
  assert.equal(getLocalization().locale, 'ru');
  assert.equal(translate('dialog.cancel'), 'Отмена');

  resetLocalization();
  let localization = configureAutoLocalization({
    navigator: { languages: ['es-AR', 'en-US'] },
    document: false,
  });
  assert.equal(localization.locale, 'es');
  assert.equal(translate('dialog.confirm'), 'Confirmar');
  assert.deepEqual(getNavigatorLocalePreferences({ language: 'ru-RU' }), ['ru-RU']);

  let doc = { documentElement: { dataset: {} } };
  applyLocalizationToDocument(localization, { document: doc });
  assert.equal(doc.documentElement.lang, 'es');
  assert.equal(doc.documentElement.dataset.localeMode, 'auto');
  resetLocalization();
});

test('chat nav tree helper builds product-neutral nested sidebar descriptors', async () => {
  let { buildChatNavTree } = await import('../chat/ChatWorkspace/chat-nav-tree.js');
  let tree = buildChatNavTree({
    chats: [
      { id: 'root', projectId: 'project-graph', name: '💬 What is Project Graph?' },
      { id: 'child', projectId: 'project-graph', parentChatId: 'root', name: 'Architecture audit', lastTaskStatus: 'done' },
      { id: 'mcp', projectId: 'project-graph', name: 'WebMCP contract', origin: 'mcp' },
    ],
    projectId: 'project-graph',
    activeChatId: 'child',
  });

  assert.equal(tree.length, 2);
  assert.equal(tree[0].id, 'root');
  assert.equal(tree[0].cleanName, 'What is Project Graph?');
  assert.equal(tree[0].isExpanded, true);
  assert.equal(tree[0].subChats[0].id, 'child');
  assert.equal(tree[0].subChats[0].isActive, true);
  assert.equal(tree[0].subChats[0].statusKind, 'done');
  assert.equal(tree[0].subChats[0].statusIcon, 'check_circle');
  assert.equal(tree[0].subChats[0].metaLabel, 'Agent');
  assert.equal(tree[1].metaLabel, 'MCP');
});

test('chat message model normalizes assistant role and attaches work summaries', async () => {
  let { buildChatMessageItems, normalizeChatMessageRole } = await import('../chat/message-model.js');
  let { items } = buildChatMessageItems([
    { role: 'assistant', text: 'Rendered as an agent answer.' },
    {
      role: 'thinking',
      done: true,
      elapsed: 5,
      meta: { mode: 'auto_edit', exitCode: 0, tools: 1, tokens: 240, cost: 0.001 },
    },
  ]);

  assert.equal(normalizeChatMessageRole('assistant'), 'agent');
  assert.equal(items.length, 1);
  assert.equal(items[0].role, 'agent');
  assert.match(items[0].workSummaryHtml, /work-summary-wrap/);
  assert.match(items[0].workSummaryHtml, /content_copy/);
});

test('voice command helpers are importable without browser component registration', async () => {
  let helpers = await import('../chat/voice-input-defaults.js');
  let runtime = await import('../chat/voice-runtime.js');
  let ui = await import('../ui/index.js');

  assert.equal(helpers.DEFAULT_VOICE_WAKE_COMMANDS.en, 'Okay Agent');
  assert.equal(helpers.matchVoiceCommandAtEnd('draft send', [{ action: 'send', phrase: 'send' }]).text, 'draft');
  assert.equal(helpers.matchVoiceCommandInText("О'кей Агент", helpers.wakeCommandCandidates(
    helpers.defaultWakeCommandPhrases(),
    'ru'
  )).matched, true);
  assert.equal(typeof runtime.VoiceRuntime, 'function');
  assert.equal(typeof runtime.blobToBase64, 'function');
  assert.equal(typeof ui.VoiceRuntime, 'function');
  assert.equal(typeof ui.voiceMicrophoneDeniedMessage, 'function');
  assert.equal(typeof ui.voiceWakeStartErrorMessage, 'function');
  assert.equal(ui.voiceWakeStartErrorMessage('not-allowed'), 'Microphone access denied. Check browser microphone permissions.');
  assert.equal(typeof ui.blobToBase64, 'function');
  assert.equal(typeof ui.buildResourceTreeFromEntries, 'function');
  assert.equal(typeof ui.createSourceDocument, 'function');
  assert.equal(typeof ui.clearCascadeThemeInlineTokens, 'function');
  assert.equal(typeof ui.createGraphViewModeController, 'function');
  assert.equal(typeof ui.layoutOverlayStack, 'function');
  assert.equal(typeof ui.measureOverlayStackReserve, 'function');
  assert.equal(typeof ui.installScreencastHotkeys, 'function');
  assert.equal(typeof ui.recordTourScreencast, 'function');
  assert.equal(ui.TOUR_AUDIO_PROVIDER_BROWSER_ID, 'browser');
  assert.equal(typeof ui.createTourAudioProvider, 'function');
  assert.equal(typeof ui.listTourAudioProviders, 'function');
  assert.equal(typeof ui.createTourCueAudioProvider, 'function');
  assert.equal(typeof ui.createTourCueAudioPlan, 'function');
  assert.equal(typeof ui.renderTourVideo, 'function');
  assert.equal(typeof ui.createTourMediaRenderPlan, 'function');
  assert.equal(typeof ui.groupNodes, 'function');
  assert.equal(typeof ui.ungroupNodes, 'function');
  assert.equal(ui.DEFAULT_VOICE_WAKE_COMMANDS.en, 'Okay Agent');
  assert.equal(ui.matchVoiceCommandAtEnd('draft send', [{ action: 'send', phrase: 'send' }]).text, 'draft');
  assert.equal(ui.matchVoiceCommandInText("О'кей Агент", ui.wakeCommandCandidates(
    ui.defaultWakeCommandPhrases(),
    'ru'
  )).matched, true);
});

test('canvas public entrypoint exposes graph and routing helpers', async () => {
  let canvas = await import('../canvas/index.js');
  assert.equal(typeof canvas.computeAutoLayout, 'function');
  assert.equal(typeof canvas.SubgraphRouter, 'function');
  assert.equal(typeof canvas.PinExpansion, 'function');
  assert.equal(typeof canvas.routePcbTrace, 'function');
  assert.equal(typeof canvas.analyzePcbRoute, 'function');
  assert.equal(typeof canvas.groupNodes, 'function');
  assert.equal(typeof canvas.ungroupNodes, 'function');
  assert.equal(typeof canvas.createGraphExplorerViewController, 'function');
  assert.equal(typeof canvas.createGraphViewModeController, 'function');
  assert.equal(typeof canvas.applyGraphExplorerViewMode, 'function');
  assert.equal(typeof canvas.resolveCanvasGraphViewportFit, 'function');
  assert.equal(typeof canvas.resolveCanvasGraphTransitionDuration, 'function');
  assert.equal(typeof canvas.resolveCanvasGraphMinZoom, 'function');
  assert.deepEqual(canvas.GRAPH_VIEW_MODES, ['structured', 'flat']);
  assert.equal(canvas.normalizeGraphExplorerViewMode('flat'), 'flat');
  assert.equal(canvas.normalizeGraphViewMode('flat'), 'flat');
  assert.equal(canvas.normalizeGraphExplorerViewMode('unknown'), 'structured');
});

test('graph explorer view controller coordinates structured and flat renderers', async () => {
  let {
    applyGraphExplorerViewMode,
    createGraphExplorerViewController,
    createGraphViewModeController,
  } = await import('../canvas/graph-explorer.js');
  let calls = [];
  let makeElement = (name) => ({
    hidden: false,
    attrs: {},
    setAttribute(key, value) {
      this.attrs[key] = value;
      calls.push(`${name}:attr:${key}:${value}`);
    },
  });
  let shell = {
    ...makeElement('shell'),
    setMode(mode) {
      this.mode = mode;
      calls.push(`shell:mode:${mode}`);
    },
    setPathStyle(style) {
      this.pathStyle = style;
      calls.push(`shell:path:${style}`);
    },
  };
  let structuredCanvas = {
    ...makeElement('structured'),
    setEditor(editor) {
      this.editor = editor;
      calls.push(`structured:editor:${editor.id}`);
    },
    setEditorModel(model) {
      this.model = model;
      calls.push(`structured:model:${model.nodes.length}`);
    },
    setPathStyle(style) {
      this.pathStyle = style;
      calls.push(`structured:path:${style}`);
    },
    refreshConnections() {
      calls.push('structured:refresh');
    },
    fitView(...args) {
      calls.push(`structured:fit:${args.join(',')}`);
    },
    focusNodes(nodeIds, options) {
      calls.push(`structured:focus:${nodeIds.join(',')}:${options.select}`);
    },
    suspendLayout(context) {
      calls.push(`structured:suspend:${context.reason}`);
    },
    resumeLayout(context) {
      calls.push(`structured:resume:${context.reason}`);
    },
  };
  let flatGraph = {
    ...makeElement('flat'),
    setGraphModel(model) {
      this.model = model;
      calls.push(`flat:model:${model.nodes.length}`);
    },
    setPath(path) {
      this.path = path;
      calls.push(`flat:path:${path || ''}`);
    },
    resizeCanvas() {
      calls.push('flat:resize');
    },
    fitView(...args) {
      calls.push(`flat:fit:${args.join(',')}`);
    },
    focusNodes(nodeIds, options) {
      calls.push(`flat:focus:${nodeIds.join(',')}:${options.select || ''}:${options.fit}`);
      return true;
    },
    flyToNode(nodeId, options) {
      calls.push(`flat:fly:${nodeId}:${options.zoom}`);
    },
    pulseNode(nodeId, duration) {
      calls.push(`flat:pulse:${nodeId}:${duration}`);
    },
    suspendLayout(context) {
      calls.push(`flat:suspend:${context.reason}`);
    },
    resumeLayout(context) {
      calls.push(`flat:resume:${context.reason}`);
    },
  };

  let result = applyGraphExplorerViewMode({
    mode: 'flat',
    shell,
    structuredCanvas,
    flatGraph,
    refresh: false,
  });
  assert.equal(result.mode, 'flat');
  assert.equal(structuredCanvas.hidden, true);
  assert.equal(flatGraph.hidden, false);
  assert.equal(shell.attrs['data-mode'], 'flat');
  assert.ok(calls.includes('structured:suspend:view-mode-hidden'));
  assert.ok(calls.includes('flat:resume:view-mode-active'));

  let controller = createGraphExplorerViewController({
    shell,
    structuredCanvas,
    flatGraph,
    mode: 'flat',
    pathStyle: 'orthogonal',
    structuredEditor: { id: 'editor' },
    flatModel: { nodes: [{ id: 'a' }], edges: [] },
    flatPath: 'group/a',
  });

  assert.equal(controller.mode, 'flat');
  assert.equal(createGraphViewModeController, createGraphExplorerViewController);
  assert.equal(structuredCanvas.editor.id, 'editor');
  assert.equal(flatGraph.model.nodes.length, 1);
  assert.equal(controller.getState().pathStyle, 'orthogonal');
  let eventNames = [];
  let unsubscribe = controller.subscribe((state, event) => {
    eventNames.push(`${event}:${state.mode}`);
  });
  controller.setModels({
    structuredModel: { nodes: [], connections: [], positions: {} },
    flat: { nodes: [{ id: 'b' }, { id: 'c' }], edges: [] },
    path: 'group/b',
  });
  controller.fitView({ flatArgs: [42] });
  controller.focusNode({ nodeId: 'a' });
  controller.focusNode({
    nodeId: 'a',
    flatNodeIds: ['a', 'b'],
    flatOptions: { select: 'a', padding: 64 },
  });
  controller.setMode('structured', { refresh: false });
  controller.fitView({ structuredArgs: [56, false] });
  controller.focusNode({
    nodeId: 'a',
    structuredNodeIds: ['a', 'b'],
    structuredOptions: { select: 'a' },
  });

  assert.equal(structuredCanvas.hidden, false);
  assert.equal(flatGraph.hidden, true);
  assert.ok(calls.includes('structured:resume:view-mode-active'));
  assert.ok(calls.includes('flat:suspend:view-mode-hidden'));
  assert.ok(calls.includes('flat:model:1'));
  assert.ok(calls.includes('flat:model:2'));
  assert.ok(calls.includes('structured:model:0'));
  assert.ok(calls.includes('flat:path:group/a'));
  assert.ok(calls.includes('flat:path:group/b'));
  assert.ok(calls.includes('flat:fit:42'));
  assert.ok(calls.includes('flat:fly:a:1.1'));
  assert.ok(calls.includes('flat:focus:a,b:a:true'));
  assert.ok(calls.includes('structured:fit:56,false'));
  assert.ok(calls.includes('structured:focus:a,b:a'));
  assert.ok(eventNames.includes('flat-model:flat'));
  assert.ok(eventNames.includes('flat-path:flat'));
  assert.ok(eventNames.includes('mode:structured'));
  unsubscribe();
  controller.setMode('flat', { refresh: false });
  assert.equal(eventNames.filter((item) => item === 'mode:flat').length, 0);
  controller.destroy();
  assert.equal(controller.getState().shell, null);
});

test('graph explorer does not defer successful multi-node flat focus', async () => {
  let { createGraphExplorerViewController } = await import('../canvas/graph-explorer.js');
  let listeners = new Map();
  let calls = [];
  let flatGraph = {
    hidden: false,
    setGraphModel() {},
    setPath() {},
    resizeCanvas() {},
    focusNodes(nodeIds, options) {
      calls.push(`focus:${nodeIds.join(',')}:${options.pulse === false ? 'quiet' : 'pulse'}`);
      return true;
    },
    pulseNode(nodeId) {
      calls.push(`pulse:${nodeId}`);
    },
    addEventListener(type, callback) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(callback);
    },
    removeEventListener(type, callback) {
      listeners.get(type)?.delete(callback);
    },
  };
  let emit = (type) => {
    for (const callback of [...(listeners.get(type) || [])]) callback({ type });
  };
  let controller = createGraphExplorerViewController({
    flatGraph,
    mode: 'flat',
  });

  controller.focusNode({
    nodeId: 'a',
    flatNodeIds: ['a', 'b'],
    flatOptions: { select: 'a' },
  });
  emit('layout-tick');
  emit('layout-tick');
  emit('layout-done');
  emit('layout-tick');

  assert.deepEqual(calls, [
    'focus:a,b:pulse',
    'pulse:a',
  ]);
  assert.equal(listeners.get('layout-tick')?.size || 0, 0);
  assert.equal(listeners.get('layout-done')?.size || 0, 0);
});

test('graph explorer timeout clears deferred flat focus without refocusing', async () => {
  let { createGraphExplorerViewController } = await import('../canvas/graph-explorer.js');
  let listeners = new Map();
  let calls = [];
  let timeoutCallback = null;
  let originalSetTimeout = globalThis.setTimeout;
  let originalClearTimeout = globalThis.clearTimeout;
  globalThis.setTimeout = (callback) => {
    timeoutCallback = callback;
    return 1;
  };
  globalThis.clearTimeout = () => {};
  try {
    let flatGraph = {
      hidden: false,
      setGraphModel() {},
      setPath() {},
      resizeCanvas() {},
      focusNodes(nodeIds) {
        calls.push(`focus:${nodeIds.join(',')}`);
        return false;
      },
      addEventListener(type, callback) {
        if (!listeners.has(type)) listeners.set(type, new Set());
        listeners.get(type).add(callback);
      },
      removeEventListener(type, callback) {
        listeners.get(type)?.delete(callback);
      },
    };
    let controller = createGraphExplorerViewController({
      flatGraph,
      mode: 'flat',
    });

    controller.focusNode({
      nodeId: 'a',
      flatNodeIds: ['a', 'b'],
      flatOptions: { select: 'a' },
    });
    timeoutCallback?.();

    assert.deepEqual(calls, ['focus:a,b']);
    assert.equal(listeners.get('layout-tick')?.size || 0, 0);
    assert.equal(listeners.get('layout-done')?.size || 0, 0);
  } finally {
    globalThis.setTimeout = originalSetTimeout;
    globalThis.clearTimeout = originalClearTimeout;
  }
});

test('graph explorer retries single-node flat focus until the layout has positions', async () => {
  let { createGraphExplorerViewController } = await import('../canvas/graph-explorer.js');
  let listeners = new Map();
  let calls = [];
  let ready = false;
  let flatGraph = {
    hidden: false,
    setGraphModel() {},
    setPath() {},
    resizeCanvas() {},
    flyToNode(nodeId, options) {
      calls.push(`fly:${nodeId}:${options.pulse === false ? 'quiet' : 'pulse'}`);
      return ready;
    },
    pulseNode(nodeId) {
      calls.push(`pulse:${nodeId}`);
    },
    addEventListener(type, callback) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(callback);
    },
    removeEventListener(type, callback) {
      listeners.get(type)?.delete(callback);
    },
  };
  let emit = (type) => {
    for (const callback of [...(listeners.get(type) || [])]) callback({ type });
  };
  let controller = createGraphExplorerViewController({
    flatGraph,
    mode: 'flat',
  });

  controller.focusNode({ nodeId: 'a' });
  ready = true;
  emit('layout-tick');

  assert.deepEqual(calls, [
    'fly:a:pulse',
    'fly:a:pulse',
    'pulse:a',
  ]);
  assert.equal(listeners.get('layout-tick')?.size || 0, 0);
  assert.equal(listeners.get('layout-done')?.size || 0, 0);
});

test('canvas graph pulse queue defaults to a single visual wave', async () => {
  let { findActiveTransitionMarker, getNextPulseQueue } = await import('../canvas/CanvasGraph/CanvasGraphDrawState.js');
  let [pulse] = getNextPulseQueue({
    nodeId: 'a',
    startTime: 10,
    duration: 900,
  });
  let queue = getNextPulseQueue({
    pulses: [pulse],
    nodeId: 'b',
    startTime: 20,
    duration: 1200,
    waves: 2,
  });
  let customPulse = queue.find((item) => item.id === 'b');

  assert.equal(pulse.waves, 1);
  assert.equal(customPulse.waves, 2);

  let marker = { toId: 'b', startTime: 100, duration: 400 };
  assert.equal(findActiveTransitionMarker([marker], 'b', 250), marker);
  assert.equal(findActiveTransitionMarker([marker], 'b', 500), null);
  assert.equal(findActiveTransitionMarker([marker], 'a', 250), null);
});

test('canvas graph viewport animation accepts custom camera ease', async () => {
  let { resolveViewportAnimation } = await import('../canvas/CanvasGraph/CanvasGraphDrawState.js');
  let slow = resolveViewportAnimation({
    zoom: 1,
    targetZoom: 2,
    panX: 0,
    panY: 0,
    targetPanX: 100,
    targetPanY: 0,
    zoomAnchor: null,
    viewportEase: 0.05,
  });
  let normal = resolveViewportAnimation({
    zoom: 1,
    targetZoom: 2,
    panX: 0,
    panY: 0,
    targetPanX: 100,
    targetPanY: 0,
    zoomAnchor: null,
  });

  assert.ok(slow.zoom > 1);
  assert.ok(slow.zoom < normal.zoom);
  assert.ok(slow.panX > 0);
  assert.ok(slow.panX < normal.panX);
});

test('canvas graph moves a marker dot along formed links before starting node pulse', async () => {
  let source = await readFile(new URL('../canvas/CanvasGraph/CanvasGraph.js', import.meta.url), 'utf8');

  assert.match(source, /findActiveTransitionMarker\(this\._transitionMarkers, nodeId, now\)/);
  assert.match(source, /queueTransitionMarkers\(fromId, toIds = \[\], options = \{\}\)/);
  assert.match(source, /_resolveTransitionRoutePoints\(marker\)/);
  assert.match(source, /_nodeVisualScreenCenter\(id\)/);
  assert.match(source, /this\.getVisualLayerTransform\(depth\)/);
  assert.match(source, /ctx\.setTransform\(1, 0, 0, 1, 0, 0\)/);
  assert.match(source, /marker\.points = points;/);
  assert.doesNotMatch(source, /_drawTransitionRouteTrail/);
  assert.doesNotMatch(source, /createLinearGradient\(from\.x, from\.y, point\.x, point\.y\)/);
  assert.doesNotMatch(source, /ctx\.lineTo\(point\.x, point\.y\)/);
  assert.match(source, /marker\.pendingPulse = \{/);
  assert.match(source, /this\._pulses = \(this\._pulses \|\| \[\]\)\.filter\(\(pulse\) => pulse\.id !== nodeId\)/);
  assert.match(source, /this\._completeTransitionMarker\(marker, now\);/);
  assert.match(source, /if \(!point\) \{\s+this\._completeTransitionMarker\(marker, now\);\s+return false;\s+\}/);
  assert.doesNotMatch(source, /marker\.startTime = now/);
  assert.match(source, /_resolveTransitionRouteViewport\(marker, options = \{\}\) \{/);
  assert.match(source, /let ids = normalizeFocusNodeIds\(marker\?\.path \|\| \[\]\);/);
  assert.match(source, /options\.transitionRoutePadding/);
  assert.match(source, /options\.transitionRouteMaxZoom\) \? options\.transitionRouteMaxZoom : 1\.35/);
  assert.match(source, /_prepareTransitionMarkerViewport\(marker, options\)/);
  assert.match(source, /marker\.initialViewport = this\._captureViewportState\(\);/);
  assert.match(source, /marker\.routeViewport = routeViewport;/);
  assert.match(source, /marker\.initialCenter = viewportToCameraCenter\(marker\.initialViewport, rect\);/);
  assert.match(source, /marker\.routeCenter = viewportToCameraCenter\(routeViewport, rect\);/);
  assert.match(source, /marker\.targetCenter = viewportToCameraCenter\(marker\.pendingViewport, rect\);/);
  assert.match(source, /marker\.targetCenterOffset = targetNodeCenter \? \{/);
  assert.match(source, /_resolveTransitionWorldRoutePoints\(marker\) \{/);
  assert.match(source, /this\._prewarmTransitionPath\(marker\);/);
  assert.match(source, /this\._nodeAppearances\?\.delete\?\.\(id\);/);
  assert.match(source, /_resolveTransitionMarkerViewport\(marker, progress\) \{/);
  assert.match(source, /let liveNodeCenter = this\.nodeCenter\(marker\.pendingActivation \|\| marker\.toId\);/);
  assert.match(source, /liveNodeCenter\.x \+ marker\.targetCenterOffset\.x/);
  assert.match(source, /_extendFocusFrameWithInfoPanel\(frame, pos\) \{/);
  assert.match(source, /_measureInfoPanelLayout\(node, pos, lines = \[\]\) \{/);
  assert.match(source, /const panelLayout = this\._measureInfoPanelLayout\(this\.activeNode, apos, ip\.lines\);/);
  assert.match(source, /includeInfoPanel: options\.includeInfoPanel !== false/);
  assert.match(source, /let focusFit = focusFrame \? resolveCanvasGraphViewportFit\(\{/);
  assert.match(source, /return resolveCanvasGraphCameraArc\(\{/);
  assert.match(source, /_updateTransitionMarkerViewport\(now = renderNow\(\)\) \{/);
  assert.match(source, /return this\._setViewportImmediate\(viewport\);/);
  assert.match(source, /marker\.pendingActivation = node\.id;/);
  assert.match(source, /marker\.pendingViewport = options\.pendingViewport \|\| null;/);
  assert.match(source, /this\._prepareTransitionMarkerViewport\(marker, options\);/);
  assert.match(source, /this\._updateTransitionMarkerViewport\(now\);/);
  assert.match(source, /let landingViewport = this\._resolveTransitionMarkerViewport\(marker, 1\)/);
  assert.match(source, /this\._infoPanel\._centeredForNode = targetId;/);
  assert.match(source, /let eased = resolveCanvasGraphTransitionProgress\(progress\);/);
  assert.match(source, /resolveCanvasGraphTransitionDuration\(\{/);
  assert.match(source, /transitionMs: options\.transitionMs,[\s\S]*?duration: options\.duration,[\s\S]*?transitionMarkerMs: options\.transitionMarkerMs/);
  assert.match(source, /distanceScale: Number\.isFinite\(this\.zoom\) \? this\.zoom : 1/);
  assert.match(source, /globalThis\.matchMedia\?\.\('\(prefers-reduced-motion: reduce\)'\)\?\.matches === true/);
  assert.match(source, /if \(marker\.duration <= 0\) \{[\s\S]*?this\._completeTransitionMarker\(marker, marker\.startTime\);/);
  assert.match(source, /let duration = Number\.isFinite\(marker\.duration\) \? marker\.duration : 850;/);
  assert.doesNotMatch(source, /marker\.duration \|\| 850/);
  assert.match(source, /this\._activateNode\(selectedId, \{\s+\.\.\.options,\s+transition: true,\s+pendingViewport,/);
  assert.match(source, /this\._activateNode\(foundNode, \{\s+\.\.\.options,\s+transition: true,\s+pendingViewport,/);
  assert.match(source, /this\._queuePulseNow\(marker\.toId, pulse\.duration, \{ waves: pulse\.waves \}, now\)/);
  assert.ok(
    source.indexOf('this._updateTransitionMarkerViewport(now);') <
      source.indexOf('let viewport = resolveViewportAnimation({')
  );
  assert.ok(source.indexOf('this._infoPanel._centeredForNode = targetId;') <
    source.indexOf('this._queuePulseNow(marker.toId, pulse.duration, { waves: pulse.waves }, now)'));
});

test('canvas graph radial action buttons respond to pointer hover', async () => {
  let source = await readFile(new URL('../canvas/CanvasGraph/CanvasGraph.js', import.meta.url), 'utf8');

  assert.match(source, /this\._hoverAction = '';/);
  assert.match(source, /_setHoverAction\(action = ''\) \{/);
  assert.match(source, /_updateHoverState\(e\) \{/);
  assert.match(source, /hitItem = getRadialMenuHit\(\{/);
  assert.match(source, /this\.canvas\.style\.cursor = hitItem \? 'pointer' : 'default';/);
  assert.match(source, /const isHovered = this\._hoverAction === item\.action;/);
  assert.match(source, /const itemRadius = isHovered \? ir \* 1\.36 : ir;/);
  assert.doesNotMatch(source, /if \(isHovered\) \{\s+mainCtx\.lineWidth[\s\S]*?mainCtx\.stroke\(\);/);
  assert.match(source, /this\.canvas\.addEventListener\('pointerleave'/);
});

test('canvas graph waits for complete transition routes before moving marker dots', async () => {
  let source = await readFile(new URL('../canvas/CanvasGraph/CanvasGraph.js', import.meta.url), 'utf8');

  assert.match(source, /for \(let id of marker\.path \|\| \[\]\)/);
  assert.match(source, /if \(!point\) return null;/);
  assert.match(source, /marker\.points = points;/);
  assert.match(source, /if \(!point\) \{\s+this\._completeTransitionMarker\(marker, now\);\s+return false;\s+\}/);
  assert.doesNotMatch(source, /marker\.startTime = now/);
});

test('canvas graph dot radius follows semantic node weight', async () => {
  let {
    DEFAULT_ACTIVE_NODE_SCALE,
    DEFAULT_INFO_PANEL_SCALE,
    getNodeRadius,
    getNodeWeightScale,
    normalizeCanvasGraphScale,
    resolveCanvasGraphInfoPanelMetrics,
  } = await import('../canvas/CanvasGraph/CanvasGraphGeometry.js');
  let normalRadius = getNodeRadius({ id: 'normal', weight: 1 }, 0);
  let heavyRadius = getNodeRadius({ id: 'heavy', weight: 4 }, 0);
  let lightRadius = getNodeRadius({ id: 'light', weight: 0.35 }, 0);
  let normalPanel = resolveCanvasGraphInfoPanelMetrics({ scale: 1, lineCount: 4, menuExtent: 20, maxTextWidth: 120 });
  let halfPanel = resolveCanvasGraphInfoPanelMetrics({ scale: 0.5, lineCount: 4, menuExtent: 20, maxTextWidth: 60 });

  assert.ok(heavyRadius > normalRadius * 1.7);
  assert.ok(lightRadius < normalRadius);
  assert.equal(getNodeWeightScale({ weight: 100 }), 1.9);
  assert.equal(DEFAULT_ACTIVE_NODE_SCALE, 1.5);
  assert.equal(DEFAULT_INFO_PANEL_SCALE, 1);
  assert.equal(normalizeCanvasGraphScale(0, DEFAULT_ACTIVE_NODE_SCALE), DEFAULT_ACTIVE_NODE_SCALE);
  assert.equal(normalizeCanvasGraphScale(-1, DEFAULT_ACTIVE_NODE_SCALE), DEFAULT_ACTIVE_NODE_SCALE);
  assert.equal(normalizeCanvasGraphScale(Number.NaN, DEFAULT_INFO_PANEL_SCALE), DEFAULT_INFO_PANEL_SCALE);
  assert.equal(normalizeCanvasGraphScale(Number.POSITIVE_INFINITY, DEFAULT_INFO_PANEL_SCALE), DEFAULT_INFO_PANEL_SCALE);
  assert.equal(normalizeCanvasGraphScale(12, DEFAULT_INFO_PANEL_SCALE, { min: 0.1, max: 4 }), 4);
  assert.equal(halfPanel.fontSize, normalPanel.fontSize * 0.5);
  assert.equal(halfPanel.padX, normalPanel.padX * 0.5);
  assert.equal(halfPanel.panelGap, normalPanel.panelGap * 0.5);
  assert.equal(halfPanel.panelW, normalPanel.panelW * 0.5);
  assert.equal(halfPanel.totalExtent, 20 + halfPanel.panelGap + halfPanel.panelW);
  assert.equal(halfPanel.totalExtentY, halfPanel.panelOuterH / 2 - halfPanel.padY);
});

test('canvas graph visual scale options stay in the library contract', async () => {
  let source = await readFile(new URL('../canvas/CanvasGraph/CanvasGraph.js', import.meta.url), 'utf8');

  assert.match(source, /static observedAttributes = \['active-node-scale', 'info-panel-scale'\]/);
  assert.match(source, /activeNodeScale: DEFAULT_ACTIVE_NODE_SCALE/);
  assert.match(source, /infoPanelScale: DEFAULT_INFO_PANEL_SCALE/);
  assert.match(source, /setVisualOptions\(options = \{\}\) {/);
  assert.match(source, /_getWorkerNodeDimensions\(node\) {/);
  assert.match(source, /const radius = getNodeRadius\(node, conns, \{ scale: 1 \}\);/);
  assert.doesNotMatch(source, /isActiveLayoutNode/);
  assert.doesNotMatch(source, /_restartWorkerForVisualFocus/);
  assert.doesNotMatch(source, /VISUAL_FOCUS_LAYOUT/);
  assert.doesNotMatch(source, /CRYSTAL_FOCUS_LAYOUT/);
  assert.match(source, /positionOrigin: this\.renderMode === 'dots' \? 'center' : 'top-left'/);
  assert.match(source, /activeVisualNodeId: null/);
  assert.doesNotMatch(source, /activeVisualNodeId: this\.renderMode === 'dots'/);
  assert.match(source, /this\.updateInteractionDepths\(\);\s+if \(isNewActivation\) \{\s+this\.needsDraw = true;\s+this\._wakeLoop\(\);\s+\}/);
  assert.match(source, /const usesCenterPosition = this\.renderMode === 'dots';/);
  assert.match(source, /const workerX = pos \? pos\.x \+ \(usesCenterPosition \? 0 : finalW \/ 2\) : undefined/);
  assert.match(source, /const dimensions = this\._getWorkerNodeDimensions\(n\);/);
  assert.match(source, /const targetScale = isActive \? activeNodeScale : 1;/);
  assert.match(source, /scale: node\.aScale \|\| activeNodeScale/);
  assert.match(source, /resolveCanvasGraphInfoPanelMetrics\(\{/);
  assert.match(source, /this\._resolveNodeHitRadius\(node\)/);
  assert.doesNotMatch(source, /isActive \? 1\.5 : 1/);
  assert.doesNotMatch(source, /this\.activeNode\.aScale \|\| 1\.5/);
});

test('canvas graph focus transition uses queued activation before depth recalculation', async () => {
  let { resolveDeactivationFrame } = await import('../canvas/CanvasGraph/CanvasGraphDrawState.js');
  let source = await readFile(new URL('../canvas/CanvasGraph/CanvasGraph.js', import.meta.url), 'utf8');
  let activeNode = { id: 'current' };
  let nextActiveNode = { id: 'next' };
  let frame = resolveDeactivationFrame({
    deactivating: true,
    activeNode,
    nextActiveNode,
    layerAnim: {
      0: { scale: 1 },
      4: { scale: 1 },
    },
  });

  assert.equal(frame.activeNode, nextActiveNode);
  assert.equal(frame.nextActiveNode, null);
  assert.equal(frame.deactivating, false);
  assert.equal(frame.interactionDepthsChanged, true);
  assert.match(source, /_activateNode\(selectedId/);
  assert.match(source, /this\.nextActiveNode = null;/);
  assert.match(source, /if \(selectedId && this\._shouldDeferFocusTransition\(selectedId, options\)\)/);
  assert.match(source, /pendingViewport,/);
  assert.match(source, /this\.nextActiveNode = node;/);
  assert.match(source, /marker\.pendingActivation = node\.id;/);
  assert.match(source, /_cancelViewportGestureTarget\(\) \{/);
  assert.match(source, /this\._cancelViewportGestureTarget\(\);\s+this\._activateNode\(selectedId,/);
  assert.match(source, /this\._cancelViewportGestureTarget\(\);\s+this\._activateNode\(foundNode,/);
  assert.match(source, /_hasPendingActivationMarker\(nodeId\) \{/);
  assert.match(source, /const hasPendingActivation = this\._hasPendingActivationMarker\(this\.nextActiveNode\?\.id\);/);
  assert.match(source, /_resetInfoPanelForActivation\(\) \{/);
  assert.match(source, /this\._infoPanel\.totalExtent = 0;/);
  assert.match(source, /const viewportTargetActive = this\._targetPanX !== null/);
  assert.match(source, /&& !viewportTargetActive\s+&& this\._infoPanel\._centeredForNode !== this\.activeNode\.id/);
  assert.match(source, /_queueTransitionMarker\(previousNode\.id, node\.id, options\)/);
  assert.match(source, /_drawTransitionMarkers\(mainCtx, now\)/);
});

test('canvas graph edge focus keeps only one-hop selected-node links active', async () => {
  let { resolveCanvasGraphEdgeFocus } = await import('../canvas/CanvasGraph/CanvasGraphDrawState.js');

  assert.deepEqual(
    resolveCanvasGraphEdgeFocus({
      edge: { from: 'selected-node', to: 'neighbor-node' },
      focusNodeId: 'selected-node',
      alpha: 0.5,
      width: 1.5,
    }),
    { active: true, alpha: 0.95, width: 2.4 }
  );
  assert.deepEqual(
    resolveCanvasGraphEdgeFocus({
      edge: { from: 'neighbor-node', to: 'second-hop-node' },
      focusNodeId: 'selected-node',
      alpha: 0.5,
      width: 1.5,
    }),
    { active: false, alpha: 0.16, width: 1 }
  );
  assert.deepEqual(
    resolveCanvasGraphEdgeFocus({
      edge: { from: 'neighbor-node', to: 'second-hop-node' },
      focusNodeId: null,
      alpha: 0.5,
      width: 1.5,
    }),
    { active: false, alpha: 0.5, width: 1.5 }
  );
});

test('canvas graph exits active focus before accepting a different node click', async () => {
  let source = await readFile(new URL('../canvas/CanvasGraph/CanvasGraph.js', import.meta.url), 'utf8');

  assert.match(source, /this\._focusExitOnDown = false/);
  assert.match(source, /_beginFocusExit\(\)/);
  assert.match(source, /this\.activeNode && this\.activeNode\.id !== hit\.id && !this\.deactivating/);
  assert.match(source, /this\._focusExitOnDown = this\._beginFocusExit\(\)/);
  assert.match(source, /if \(this\._focusExitOnDown\) \{/);
  assert.match(source, /this\._focusExitOnDown = false;/);
  assert.ok(
    source.indexOf('this._focusExitOnDown = this._beginFocusExit();') <
      source.indexOf('this._activateNode(hit, { transition: false, marker: false });')
  );
});

test('canvas graph prunes stale state when replacing the graph model', async () => {
  let source = await readFile(new URL('../canvas/CanvasGraph/CanvasGraph.js', import.meta.url), 'utf8');

  assert.match(source, /this\._pruneGraphState\(nextIdSet\)/);
  assert.match(source, /let useCrystalLayout = this\._usesCrystalForceLayout\(\);/);
  assert.match(source, /let initialLayoutSeeded = previousIds\.size === 0 && !useCrystalLayout && this\._seedInitialNodePositions\(nextIds\);/);
  assert.match(source, /this\.loadLevel\(null, \{ incrementalLayout, initialLayoutSeeded \}\)/);
  assert.match(source, /if \(!useCrystalLayout\) this\._seedEnteringNodePositions\(enteringIds\);/);
  assert.match(source, /for \(const id of this\.nodePositions\.keys\(\)\)/);
  assert.match(source, /for \(const id of this\.smoothPositions\.keys\(\)\)/);
  assert.match(source, /for \(const id of this\._nodeAppearances\.keys\(\)\)/);
  assert.match(source, /filter\(\(marker\) => nodeIds\.has\(marker\.fromId\) && nodeIds\.has\(marker\.toId\)\)/);
  assert.match(source, /if \(previousIds\.size === 0 && rect\.width > 0\)/);
  assert.match(source, /if \(!this\.graphDB\.nodes\.has\(id\)\) continue;/);
  assert.match(source, /if \(this\.graphDB\.nodes\.has\(id\)\) this\.nodePositions\.set\(id, pos\);/);
});

test('canvas graph exposes layout state reset for deterministic replay restarts', async () => {
  let source = await readFile(new URL('../canvas/CanvasGraph/CanvasGraph.js', import.meta.url), 'utf8');

  assert.match(source, /resetLayoutState\(\) \{/);
  assert.match(source, /this\.nodePositions\.clear\(\)/);
  assert.match(source, /this\.smoothPositions\.clear\(\)/);
  assert.match(source, /this\._layoutSnapshot = null/);
  assert.match(source, /this\._transitionMarkers = \[\]/);
  assert.match(source, /this\._pulses = \[\]/);
  assert.match(source, /this\.worker\.stop\(\)/);
});

test('canvas graph seeds entering node positions and eases appearance', async () => {
  let source = await readFile(new URL('../canvas/CanvasGraph/CanvasGraph.js', import.meta.url), 'utf8');

  assert.match(source, /function stableUnit\(value\)/);
  assert.match(source, /function averageCanvasPoints\(points\)/);
  assert.match(source, /function getEnteringNodeSeedOffset\(id, index = 0, count = 1\)/);
  assert.match(source, /INCREMENTAL_LAYOUT_INITIAL_ALPHA = 0\.045/);
  assert.match(source, /SEEDED_LAYOUT_INITIAL_ALPHA = 0\.22/);
  assert.match(source, /NODE_APPEARANCE_START_SCALE = 0\.2/);
  assert.match(source, /ENTERING_LAYOUT_SIZE_SCALE = 0\.18/);
  assert.match(source, /ENTERING_LAYOUT_SIZE_WARMUP_TICKS = 72/);
  assert.match(source, /_seedInitialNodePositions\(nodeIds\) \{/);
  assert.match(source, /_usesCrystalForceLayout\(\) \{/);
  assert.match(source, /return this\._forceLayoutOverrides\?\.layoutAlgorithm === 'crystal';/);
  assert.match(source, /let groups = normalizeForceGroups\(this\.graphDB\?\.groups \|\| \{\}, idSet\);/);
  assert.match(source, /workerOptions\.initialAlpha = SEEDED_LAYOUT_INITIAL_ALPHA;/);
  assert.match(source, /const algorithm = options\?\.layoutAlgorithm/);
  assert.match(source, /algorithm === 'spring' \|\| algorithm === 'organic' \|\| algorithm === 'oil-cloud' \|\| algorithm === 'crystal'/);
  assert.match(source, /normalized\.layoutAlgorithm = algorithm/);
  assert.match(source, /'crystalStrength'/);
  assert.match(source, /'crystalRingDistance'/);
  assert.match(source, /'crystalSpokes'/);
  assert.match(source, /'crystalAngleJitter'/);
  assert.match(source, /let retainedPositionCount = retainedPositionIds\.length/);
  assert.match(source, /let incrementalLayout = retainedPositionCount > 0/);
  assert.match(source, /this\._layoutPreserveIds = incrementalLayout \? new Set\(retainedPositionIds\) : new Set\(\)/);
  assert.match(source, /this\._workerGeneration \+= 1/);
  assert.match(source, /const workerGeneration = this\._workerGeneration/);
  assert.match(source, /if \(workerGeneration !== this\._workerGeneration\) return/);
  assert.match(source, /if \(!useCrystalLayout\) this\._seedEnteringNodePositions\(enteringIds\);/);
  assert.match(source, /_resolveEnteringNodeSeedPosition\(id, index, count\)/);
  assert.match(source, /for \(const edge of this\.graphDB\?\.edges \|\| \[\]\)/);
  assert.match(source, /this\.nodePositions\.set\(id, position\)/);
  assert.match(source, /this\.smoothPositions\.set\(id, \{ \.\.\.position \}\)/);
  assert.match(source, /const isPreserved = this\._layoutPreserveIds\?\.has\(n\.id\)/);
  assert.match(source, /layoutParticipation: isEntering \? 0\.02 : isPreserved \? 0\.06 : 1/);
  assert.match(source, /layoutWarmupTicks: isEntering \? 72 : isPreserved \? 120 : 0/);
  assert.match(source, /layoutSizeScale: isEntering \? ENTERING_LAYOUT_SIZE_SCALE : 1/);
  assert.match(source, /layoutSizeWarmupTicks: isEntering \? ENTERING_LAYOUT_SIZE_WARMUP_TICKS : 0/);
  assert.match(source, /layoutFixedTicks: isPreserved \? 42 : 0/);
  assert.match(source, /const usesCenterPosition = this\.renderMode === 'dots';/);
  assert.doesNotMatch(source, /crystalReseed: this\._usesCrystalForceLayout\(\)/);
  assert.match(source, /const reseedCrystalLayout = options\.layoutAlgorithm === 'crystal' && customOptions\?\.crystalReseed === true;/);
  assert.match(source, /const pos = reseedCrystalLayout\s*\? null\s*: this\.smoothPositions\.get\(n\.id\) \|\| this\.nodePositions\.get\(n\.id\) \|\| restoredPos;/);
  assert.match(source, /const workerX = pos \? pos\.x \+ \(usesCenterPosition \? 0 : finalW \/ 2\) : undefined/);
  assert.match(source, /x: workerX, y: workerY, w: finalW, h: finalH/);
  assert.match(source, /workerOptions\.initialAlpha = INCREMENTAL_LAYOUT_INITIAL_ALPHA/);
  assert.match(source, /contAlphaFloor: this\.\$\.alphaFloor/);
  assert.match(source, /contAlphaTarget: this\.\$\.alphaTarget/);
  assert.doesNotMatch(source, /this\.worker\.updateConfig\(\{\n      contAlphaFloor: this\.\$\.alphaFloor/);
  assert.match(source, /progress < 0\.5/);
  assert.match(source, /scale: NODE_APPEARANCE_START_SCALE \+ \(1 - NODE_APPEARANCE_START_SCALE\) \* eased/);
  assert.doesNotMatch(source, /1 - Math\.pow\(1 - progress, 3\)/);
  assert.doesNotMatch(source, /scale: 0\.5 \+ 0\.5 \* eased/);
  let fallback = await readFile(new URL('../canvas/ForceLayout.js', import.meta.url), 'utf8');
  let worker = await readFile(new URL('../canvas/ForceWorker.js', import.meta.url), 'utf8');
  assert.match(fallback, /function normalizeSizeScale\(value\)/);
  assert.match(fallback, /function normalizeLayoutAlgorithm\(value\)/);
  assert.match(fallback, /function normalizePositionOrigin\(value\)/);
  assert.match(fallback, /value === 'spring' \|\| value === 'oil-cloud' \|\| value === 'crystal'/);
  assert.match(fallback, /function getEffectiveMass\(node\)/);
  assert.match(fallback, /function getEffectiveWidth\(node\)/);
  assert.match(fallback, /layoutAlgorithm: 'organic'/);
  assert.match(fallback, /crystalStrength: 0\.18/);
  assert.match(fallback, /positionOrigin: 'center'/);
  assert.match(fallback, /resolved\.layoutAlgorithm = normalizeLayoutAlgorithm\(options\.layoutAlgorithm\)/);
  assert.match(fallback, /resolved\.positionOrigin = normalizePositionOrigin\(options\.positionOrigin \?\? resolved\.positionOrigin\)/);
  assert.match(fallback, /import \{ computeCrystalTargets \} from '\.\/CrystalLayout\.js';/);
  assert.doesNotMatch(fallback, /function computeCrystalTargets\(/);
  assert.doesNotMatch(fallback, /function getCrystalBranchStep\(|function getCrystalClusterRadius\(/);
  assert.match(fallback, /function applyFallbackCrystalForces\(nodes, options, alpha\)/);
  assert.match(fallback, /options\.layoutAlgorithm === 'crystal'/);
  assert.match(fallback, /let linkScale = options\.layoutAlgorithm === 'crystal' \? 0\.28 : 1/);
  assert.match(fallback, /let chargeScale = options\.layoutAlgorithm === 'crystal' \? 0\.18 : 1/);
  assert.match(fallback, /function getFallbackClouds\(nodeById, groups, options\)/);
  assert.match(fallback, /function applyFallbackCloudForces\(nodeById, groups, options, alpha\)/);
  assert.match(fallback, /options\.layoutAlgorithm !== 'oil-cloud'/);
  assert.match(fallback, /applyFallbackCrystalForces\(nodes, options, alpha\)/);
  assert.match(fallback, /options\.layoutAlgorithm !== 'crystal'/);
  assert.match(fallback, /applyFallbackCloudForces\(state\.nodeById, state\.groups, options, alpha\)/);
  assert.match(fallback, /layoutSizeScale: normalizeSizeScale\(rawNode\.layoutSizeScale\)/);
  assert.match(fallback, /node\.layoutSizeScale = Math\.min\(1, node\.layoutSizeScale \+ 1 \/ sizeWarmupTicks\)/);
  assert.match(fallback, /Math\.max\(getEffectiveWidth\(a\), getEffectiveHeight\(a\)\)/);
  assert.match(fallback, /0\.18 \+ participation \* 0\.82/);
  assert.match(fallback, /initialAlpha: 1/);
  assert.match(fallback, /alpha: options\.initialAlpha/);
  assert.match(fallback, /state\.options\.positionOrigin === 'center'/);
  assert.match(fallback, /let originOffsetX = this\.\#fallbackState\.options\.positionOrigin === 'center' \? 0 : node\.w \/ 2/);
  assert.match(fallback, /node\.fx = finiteNumber\(x, node\.x\) \+ originOffsetX/);
  assert.match(fallback, /layoutFixedTicks: Math\.max\(0, finiteNumber\(rawNode\.layoutFixedTicks, 0\)\)/);
  assert.match(fallback, /node\.layoutFixedTicks -= 1/);
  assert.match(worker, /function normalizeSizeScale\(value\)/);
  assert.match(worker, /function normalizeLayoutAlgorithm\(value\)/);
  assert.match(worker, /function normalizePositionOrigin\(value\)/);
  assert.match(worker, /value === 'spring' \|\| value === 'oil-cloud' \|\| value === 'crystal'/);
  assert.match(worker, /function getEffectiveMass\(node\)/);
  assert.match(worker, /function getEffectiveWidth\(node\)/);
  assert.match(worker, /layoutAlgorithm: 'organic'/);
  assert.match(worker, /crystalStrength: 0\.18/);
  assert.match(worker, /positionOrigin: 'top-left'/);
  assert.match(worker, /config\.layoutAlgorithm = normalizeLayoutAlgorithm\(config\.layoutAlgorithm\)/);
  assert.match(worker, /config\.positionOrigin = normalizePositionOrigin\(config\.positionOrigin\)/);
  assert.match(worker, /function isCrystalLayout\(\)/);
  assert.match(worker, /function applyCrystalTargetsToWorkerNodes\(crystalTargets, seedPositions\)/);
  assert.match(worker, /applyCrystalTargetsToWorkerNodes\(data\.crystalTargets, true\)/);
  assert.doesNotMatch(worker, /assignCrystalTargets|getCrystalBranchStep|getCrystalClusterRadius/);
  assert.match(worker, /function applyCrystalForces\(alpha\)/);
  assert.match(worker, /config\.groups = groups/);
  assert.match(worker, /let layoutScale = isCrystalLayout\(\) \? 0\.28 : 1/);
  assert.match(worker, /let chargeScale = isCrystalLayout\(\) \? 0\.18 : config\.layoutAlgorithm === 'oil-cloud' \? 0\.72 : 1/);
  assert.match(worker, /if \(config\.layoutAlgorithm === 'spring' \|\| isCrystalLayout\(\)\) return/);
  assert.match(worker, /config\.layoutAlgorithm === 'oil-cloud' \? 0\.025 : 0\.08/);
  assert.match(worker, /config\.layoutAlgorithm === 'oil-cloud' \? 1\.35 : 1/);
  assert.match(worker, /layoutSizeScale: normalizeSizeScale\(n\.layoutSizeScale\)/);
  assert.match(worker, /node\.layoutSizeScale = Math\.min\(1, node\.layoutSizeScale \+ 1 \/ sizeWarmupTicks\)/);
  assert.match(worker, /let hwA = getEffectiveWidth\(a\) \/ 2 \+ padX \+ massPadA/);
  assert.match(worker, /activeVisualNodeId: null/);
  assert.match(worker, /let involvesActiveVisualNode = config\.activeVisualNodeId && \(/);
  assert.match(worker, /if \(a\.parentId !== b\.parentId && !involvesActiveVisualNode\) {/);
  assert.match(worker, /config\.positionOrigin === 'center'/);
  assert.match(worker, /let originOffsetX = config\.positionOrigin === 'center' \? 0 : node\.w \/ 2/);
  assert.match(worker, /node\.fx = x \+ originOffsetX/);
  assert.match(worker, /0\.18 \+ participation \* 0\.82/);
  assert.match(worker, /initialAlpha: 1/);
  assert.match(worker, /continuousAlpha = clampNumber\(finiteNumber\(config\.initialAlpha, 1\), config\.contAlphaFloor, 1\)/);
  assert.match(worker, /let layoutFixedTicks = Math\.max\(0, finiteNumber\(n\.layoutFixedTicks, 0\)\)/);
  assert.match(worker, /n\.layoutFixedTicks -= 1/);
});

test('canvas graph gravity lab simulates orchestration event replay', async () => {
  let source = await readFile(new URL('../demo/canvas-graph-gravity-lab.js', import.meta.url), 'utf8');
  let html = await readFile(new URL('../demo/canvas-graph-gravity-lab.html', import.meta.url), 'utf8');

  assert.match(html, /gravity-lab-layout-algorithms-v1/);
  assert.match(source, /gravity-lab-layout-algorithms-v1/);
  assert.match(source, /waitingStatuses\s*=\s*new Set/);
  assert.match(source, /layoutAlgorithms\s*=\s*Object\.freeze/);
  assert.match(source, /id:\s*'organic', label:\s*'organic force'/);
  assert.match(source, /id:\s*'oil-cloud', label:\s*'oil-cloud bodies'/);
  assert.match(source, /id:\s*'crystal', label:\s*'crystal growth'/);
  assert.match(source, /id:\s*'spring', label:\s*'spring baseline'/);
  assert.match(source, /state\.layoutAlgorithm = 'organic'/);
  assert.match(source, /layoutAlgorithm: state\.layoutAlgorithm/);
  assert.match(source, /agentPalette\s*=\s*\{/);
  assert.match(source, /color:\s*'#1565C0'/);
  assert.match(source, /color:\s*'#F9A825'/);
  assert.match(source, /color:\s*'#6A1B9A'/);
  assert.match(source, /color:\s*'#E65100'/);
  assert.match(source, /orchestrationEvents\s*=\s*\[/);
  assert.match(source, /label:\s*'parallel fan-out'/);
  assert.match(source, /weight:\s*2\.4/);
  assert.match(source, /weight:\s*0\.7/);
  assert.match(source, /id:\s*'parallel:subagents'/);
  assert.match(source, /type:\s*'parallel'/);
  assert.match(source, /icon:\s*'sync'/);
  assert.match(source, /focusNodes:\s*\['agent:orchestrator', 'parallel:subagents'/);
  assert.match(source, /activityNodes:\s*\['agent:code-reviewer', 'agent:ui-engineer', 'agent:qa-engineer'\]/);
  assert.match(source, /fanOut:\s*\{/);
  assert.match(source, /state:\s*\{ status:\s*'running' \}/);
  assert.match(source, /label:\s*'review branch'/);
  assert.match(source, /label:\s*'ui branch'/);
  assert.match(source, /label:\s*'qa branch'/);
  assert.match(source, /label:\s*'parallel tool calls complete'/);
  assert.match(source, /updates:\s*\[/);
  assert.match(source, /id:\s*'tool:apply-patch', state:\s*\{ status:\s*'done' \}/);
  assert.match(source, /label:\s*'parallel merge'/);
  assert.match(source, /id:\s*'parallel:merge'/);
  assert.match(source, /icon:\s*'merge'/);
  assert.match(source, /delaySlot:\s*4/);
  assert.match(source, /function focusReplayFrame\(frame, attempt = 0\)/);
  assert.match(source, /REPLAY_CAMERA_TRACK_MS = 140/);
  assert.match(source, /REPLAY_CAMERA_INTEREST_LIMIT = 16/);
  assert.match(source, /\['cameraEase', 0\.015, 0\.2, 0\.032, 0\.001\]/);
  assert.match(source, /\['appearanceMs', 200, 2400, 1080, 10\]/);
  assert.match(source, /\['coordinateJumpThreshold', 1, 120, 18, 1\]/);
  assert.match(source, /function trackReplayCamera\(frame, \{ select = false, attempt = 0 \} = \{\}\)/);
  assert.match(source, /function scheduleReplayCameraTrack\(frame\)/);
  assert.match(source, /getReplayFrameCameraNodes\(frame, \{ includeActivity: false \}\)/);
  assert.match(source, /function getReplayFramePulseNode\(frame\)/);
  assert.match(source, /function scheduleReplayPulse\(frame\)/);
  assert.match(source, /FINAL_REPLAY_FOCUS_IDLE_MS = 1000/);
  assert.match(source, /function scheduleFinalReplayFocus\(frame\)/);
  assert.match(source, /function mergeReplayFrame\(events\)/);
  assert.match(source, /function groupOrchestrationEventsByDelaySlot\(\)/);
  assert.match(source, /function mergeNodeUpdate\(node, update\)/);
  assert.match(source, /function resetReplayMovementDiagnostics\(\)/);
  assert.match(source, /function getPositionSnapshot\(\)/);
  assert.match(source, /function updateReplayMovementDiagnostics\(snapshot = getPositionSnapshot\(\)\)/);
  assert.match(source, /function resetCoordinateJumpDiagnostics\(\)/);
  assert.match(source, /function updateCoordinateJumpDiagnostics\(snapshot = getPositionSnapshot\(\)\)/);
  assert.match(source, /COORDINATE_JUMP_EVENT_LIMIT = 32/);
  assert.match(source, /COORDINATE_JUMP_NODE_LIMIT = 6/);
  assert.match(source, /const threshold = Math\.max\(0, Number\(state\.coordinateJumpThreshold\) \|\| 0\)/);
  assert.match(source, /if \(move >= threshold\)/);
  assert.match(source, /coordinateJumpEvents\.push\(\{/);
  assert.match(source, /replayFrameMoves\.push\(\{/);
  assert.match(source, /maxCommonMove: Number\(maxCommonMove\.toFixed\(2\)\)/);
  assert.match(source, /graph\.resetLayoutState\(\)/);
  assert.match(source, /graph\.setGraphModel\(currentModel\);\n  graph\.animateNodeAppearance/);
  assert.doesNotMatch(source, /graph\.setGraphModel\(currentModel\);\n  graph\.setForceLayoutOptions\(readForceOptions\(\), \{ restart: true \}\);\n  graph\.animateNodeAppearance\(newNodes/);
  assert.match(source, /syncFocusId = frame\.syncFocus \|\| null/);
  assert.match(source, /activityNodeIds = \[\.\.\.\(frame\.activityNodes \|\| \[\]\)\]/);
  assert.match(source, /graph\.queueTransitionMarkers\?\.\(fanOut\.from, fanOut\.to/);
  assert.match(source, /graph\.fitNodes\(replayCameraInterestIds/);
  assert.match(source, /scheduleReplayPulse\(frame\)/);
  assert.match(source, /scheduleReplayCameraTrack\(frame\)/);
  assert.match(source, /transition:\s*false/);
  assert.match(source, /viewportEase:\s*Number\(state\.cameraEase\)/);
  assert.match(source, /replayFinalFocusTimer = setTimeout\(\(\) => \{/);
  assert.match(source, /scheduleFinalReplayFocus\(frame\)/);
  assert.match(source, /setTimeout\(\(\) => trackReplayCamera\(frame, \{ select, attempt: attempt \+ 1 \}\), 80\)/);
  assert.match(source, /setTimeout\(\(\) => focusReplayFrame\(frame, attempt \+ 1\), 80\)/);
  assert.match(source, /applyOrchestrationFrame\(mergeReplayFrame\(events\)\)/);
  assert.match(source, /graph\.animateNodeAppearance\(newNodes\.map\(\(node\) => node\.id\)/);
  assert.match(source, /const duration = Math\.max\(900, Number\(state\.eventDelayMs\) \* 1\.7\)/);
  assert.match(source, /frame\.primaryFocus\s*\|\|\s*frame\.syncFocus\s*\|\|\s*frame\.focus/);
  assert.match(source, /frame\.fanOut\?\.\[0\]\?\.from/);
  assert.doesNotMatch(source, /ids\.forEach\(\(id, index\)/);
  assert.match(source, /parallelBranches:\s*state\.scenario === 'orchestration' \? 3 : 0/);
  assert.match(source, /waitingNodes:\s*state\.scenario === 'orchestration'/);
  assert.match(source, /syncFocus:\s*syncFocusId/);
  assert.match(source, /activityNodes:\s*activityNodeIds/);
  assert.match(source, /lastFrameMove:\s*replayFrameMoves\[replayFrameMoves\.length - 1\] \|\| null/);
  assert.match(source, /maxFrameMove:\s*replayFrameMoves\.length/);
  assert.match(source, /frameMoves:\s*replayFrameMoves\.slice\(-8\)/);
  assert.match(source, /coordinateJumpThreshold:\s*Number\(state\.coordinateJumpThreshold\)/);
  assert.match(source, /coordinateJumpCount:\s*coordinateJumpEvents\.length/);
  assert.match(source, /lastCoordinateJump:\s*coordinateJumpEvents\[coordinateJumpEvents\.length - 1\] \|\| null/);
  assert.match(source, /maxCoordinateJump:\s*coordinateJumpEvents\.length/);
  assert.match(source, /coordinateJumps:\s*coordinateJumpEvents\.slice\(-8\)/);
  assert.match(source, /layoutAlgorithm:\s*state\.layoutAlgorithm/);
  assert.match(source, /Replay orchestration/);
});

test('canvas graph exposes device-orientation parallax as progressive enhancement', async () => {
  let source = await readFile(new URL('../canvas/CanvasGraph/CanvasGraph.js', import.meta.url), 'utf8');

  assert.match(source, /enableDeviceOrientationParallax\(options = \{\}\)/);
  assert.match(source, /device-orientation-parallax/);
  assert.match(source, /orientationParallaxStatus: 'orientation-parallax-status'/);
  assert.match(source, /getDeviceOrientationParallaxStatus\(\)/);
  assert.match(source, /_requestDeviceOrientationParallaxFromGesture\(\)/);
  assert.match(source, /typeof globalThis\.DeviceOrientationEvent === 'undefined'/);
  assert.match(source, /globalThis\.isSecureContext === false/);
  assert.match(source, /DeviceOrientationEvent\.requestPermission/);
  assert.match(source, /requestPermission\.call\(globalThis\.DeviceOrientationEvent, Boolean\(options\.absolute\)\)/);
  assert.match(source, /reason: 'permission-error'/);
  assert.match(source, /this\._setDeviceOrientationParallaxStatus/);
  assert.ok(
    source.indexOf('this._requestDeviceOrientationParallaxFromGesture();') <
      source.indexOf('this._rememberPointer(e);')
  );
  assert.match(source, /window\.addEventListener\('deviceorientation', handleOrientation, \{ passive: true \}\)/);
  assert.match(source, /disableDeviceOrientationParallax\(\)/);
  assert.match(source, /const visualDragDeltaX = dragDeltaX \+ this\._orientationParallaxX/);
  assert.match(source, /const pOffX = -la\.parallax \* visualDragDeltaX/);
});

test('canvas graph focus layer targets separate selected hubs from surrounding layers', async () => {
  let {
    CANVAS_GRAPH_LAYER_TARGETS,
    getLayerAnimationFrame,
    resolveIdleFrame,
  } = await import('../canvas/CanvasGraph/CanvasGraphDrawState.js');
  let layerAnim = {
    0: { scale: 1, opacity: 1, parallax: 0 },
    1: { scale: 1, opacity: 1, parallax: 0 },
    2: { scale: 1, opacity: 1, parallax: 0 },
    3: { scale: 1, opacity: 1, parallax: 0 },
    4: { scale: 1, opacity: 1, parallax: 0 },
  };
  let frame = getLayerAnimationFrame({
    layerAnim,
    layerTargets: CANVAS_GRAPH_LAYER_TARGETS,
    isIdle: false,
    inGroupMode: false,
  });

  assert.equal(CANVAS_GRAPH_LAYER_TARGETS.opacity[0], 1);
  assert.ok(CANVAS_GRAPH_LAYER_TARGETS.opacity[1] <= 0.6);
  assert.ok(CANVAS_GRAPH_LAYER_TARGETS.opacity[2] <= CANVAS_GRAPH_LAYER_TARGETS.opacity[1] * 0.5);
  assert.ok(CANVAS_GRAPH_LAYER_TARGETS.opacity[4] <= 0.03);
  assert.ok(CANVAS_GRAPH_LAYER_TARGETS.scale[1] < CANVAS_GRAPH_LAYER_TARGETS.scale[0]);
  assert.ok(CANVAS_GRAPH_LAYER_TARGETS.blur[2] > CANVAS_GRAPH_LAYER_TARGETS.blur[1]);
  assert.ok(CANVAS_GRAPH_LAYER_TARGETS.parallax[4] > CANVAS_GRAPH_LAYER_TARGETS.parallax[2]);
  assert.ok(frame[1].opacity < 1);
  assert.ok(frame[2].opacity < frame[1].opacity);
  assert.ok(frame[2].scale < frame[1].scale);

  let idle = resolveIdleFrame({
    targetZoom: 1,
    zoom: 1,
    dragDeltaX: 0,
    dragDeltaY: 0,
    prevDragDeltaX: 0,
    prevDragDeltaY: 0,
    layerAnim: { 0: { scale: 1 } },
    isIdle: true,
    layerTargets: { scale: [1] },
    lastAlpha: 0,
    dragNode: null,
    isPanning: false,
    deactivating: false,
    targetPanX: null,
    infoPanel: { opacity: 0, lines: [] },
    nodeAppearancesActive: true,
    idleFrames: 8,
  });
  assert.equal(idle.shouldStop, false);
  assert.equal(idle.idleFrames, 0);

  idle = resolveIdleFrame({
    targetZoom: 1,
    zoom: 1,
    dragDeltaX: 0,
    dragDeltaY: 0,
    prevDragDeltaX: 0,
    prevDragDeltaY: 0,
    layerAnim: { 0: { scale: 1 } },
    isIdle: true,
    layerTargets: { scale: [1] },
    lastAlpha: 0,
    dragNode: null,
    isPanning: false,
    deactivating: false,
    targetPanX: null,
    infoPanel: { opacity: 0, lines: [] },
    pulsesActive: true,
    idleFrames: 8,
  });
  assert.equal(idle.shouldStop, false);
  assert.equal(idle.idleFrames, 0);

  idle = resolveIdleFrame({
    targetZoom: 1,
    zoom: 1,
    dragDeltaX: 0,
    dragDeltaY: 0,
    prevDragDeltaX: 0,
    prevDragDeltaY: 0,
    layerAnim: { 0: { scale: 1 } },
    isIdle: true,
    layerTargets: { scale: [1] },
    lastAlpha: 0,
    dragNode: null,
    isPanning: false,
    deactivating: false,
    targetPanX: null,
    infoPanel: { opacity: 0, lines: [] },
    statusAnimationsActive: true,
    idleFrames: 8,
  });
  assert.equal(idle.shouldStop, false);
  assert.equal(idle.idleFrames, 0);

  let source = await readFile(new URL('../canvas/CanvasGraph/CanvasGraph.js', import.meta.url), 'utf8');
  assert.match(source, /function drawCanvasGraphIcon\(ctx, icon, x, y, size, color, alpha = 1\)/);
  assert.match(source, /getCanvasGraphNodeIcon\(node\)/);
  assert.match(source, /_drawNodeStatusIndicator\(currentCtx, node, pos, drawnRadius, tc, layerOpacity, nodeAppearanceNow\)/);
  assert.match(source, /_drawNodeIcon\(currentCtx, node, pos, drawnRadius, tc, layerOpacity\)/);
  assert.match(source, /statusAnimationsActive: this\._hasAnimatingNodeStatuses\(\)/);
  assert.match(source, /pulsesActive: this\._pulses\?\.length > 0/);
});

test('canvas graph passes normalized semantic groups into the force layout', async () => {
  let source = await readFile(new URL('../canvas/CanvasGraph/CanvasGraph.js', import.meta.url), 'utf8');

  assert.match(source, /getVisibleForceGroups\(\)/);
  assert.match(source, /groups:\s*forceGroups/);
  assert.match(source, /group:\s*findForceNodeGroup\(forceGroups,\s*n\.id\)/);
  assert.doesNotMatch(source, /groups:\s*\{\}/);
});

test('force layout fallback preserves continuous drag dynamics without a browser worker', async () => {
  let NativeWorker = globalThis.Worker;
  let nativeRaf = globalThis.requestAnimationFrame;
  let nativeCancelRaf = globalThis.cancelAnimationFrame;
  let nativeWarn = console.warn;
  globalThis.requestAnimationFrame = (callback) => setTimeout(() => callback(Date.now()), 0);
  globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
  console.warn = () => {};

  try {
    delete globalThis.Worker;
    let { ForceLayout } = await import('../canvas/ForceLayout.js');
    let force = new ForceLayout('/missing-force-worker.js');
    let ticks = [];
    let nextTick = () => new Promise((resolve, reject) => {
      let timer = setTimeout(() => reject(new Error('force layout fallback did not tick')), 200);
      let previous = force.onTick;
      force.onTick = (positions, meta) => {
        previous?.(positions, meta);
        ticks.push({ positions, meta });
        clearTimeout(timer);
        resolve({ positions, meta });
      };
    });

    let firstTick = nextTick();
    force.start({
      nodes: [{ id: 'a', x: 0, y: 0 }, { id: 'b', x: 140, y: 0 }],
      edges: [{ from: 'a', to: 'b' }],
      options: { mode: 'continuous', alphaDecay: 0.5, brownian: 0 },
    });
    let first = await firstTick;
    assert.equal(first.meta.fallback, true);
    assert.ok(Number.isFinite(first.positions.a.x));

    force.pin('a', 320, 180);
    let pinned = await nextTick();
    assert.deepEqual(
      {
        x: Math.round(pinned.positions.a.x),
        y: Math.round(pinned.positions.a.y),
      },
      { x: 320, y: 180 }
    );

    force.unpin('a');
    let released = await nextTick();
    assert.equal(released.meta.fallback, true);
    assert.ok(ticks.length >= 3);
    force.stop();
  } finally {
    console.warn = nativeWarn;
    if (NativeWorker) {
      globalThis.Worker = NativeWorker;
    } else {
      delete globalThis.Worker;
    }
    if (nativeRaf) {
      globalThis.requestAnimationFrame = nativeRaf;
    } else {
      delete globalThis.requestAnimationFrame;
    }
    if (nativeCancelRaf) {
      globalThis.cancelAnimationFrame = nativeCancelRaf;
    } else {
      delete globalThis.cancelAnimationFrame;
    }
  }
});

test('force layout fallback supports explicit position origin output', async () => {
  let NativeWorker = globalThis.Worker;
  let nativeRaf = globalThis.requestAnimationFrame;
  let nativeCancelRaf = globalThis.cancelAnimationFrame;
  let nativeWarn = console.warn;
  globalThis.requestAnimationFrame = (callback) => setTimeout(() => callback(Date.now()), 0);
  globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
  console.warn = () => {};

  try {
    delete globalThis.Worker;
    let { ForceLayout } = await import('../canvas/ForceLayout.js');
    let readFirstTick = (options = {}) => new Promise((resolve, reject) => {
      let force = new ForceLayout('/missing-force-worker.js');
      let timer = setTimeout(() => {
        force.stop();
        reject(new Error('force layout fallback origin test did not tick'));
      }, 200);
      force.onTick = (positions, meta) => {
        clearTimeout(timer);
        force.stop();
        resolve({ positions, meta });
      };
      force.start({
        nodes: [{ id: 'box', x: 50, y: 60, w: 80, h: 40, layoutFixedTicks: 2 }],
        edges: [],
        options: {
          mode: 'continuous',
          alphaDecay: 0.5,
          brownian: 0,
          chargeStrength: 0,
          centerStrength: 0,
          centerPull: 0,
          collideStrength: 0,
          ...options,
        },
      });
    });

    let center = await readFirstTick();
    assert.equal(center.meta.fallback, true);
    assert.deepEqual(center.positions.box, { x: 50, y: 60 });

    let topLeft = await readFirstTick({ positionOrigin: 'top-left' });
    assert.equal(topLeft.meta.fallback, true);
    assert.deepEqual(topLeft.positions.box, { x: 10, y: 40 });
  } finally {
    console.warn = nativeWarn;
    if (NativeWorker) {
      globalThis.Worker = NativeWorker;
    } else {
      delete globalThis.Worker;
    }
    if (nativeRaf) {
      globalThis.requestAnimationFrame = nativeRaf;
    } else {
      delete globalThis.requestAnimationFrame;
    }
    if (nativeCancelRaf) {
      globalThis.cancelAnimationFrame = nativeCancelRaf;
    } else {
      delete globalThis.cancelAnimationFrame;
    }
  }
});

test('force layout fallback applies semantic group links without a browser worker', async () => {
  let NativeWorker = globalThis.Worker;
  let nativeRaf = globalThis.requestAnimationFrame;
  let nativeCancelRaf = globalThis.cancelAnimationFrame;
  let nativeWarn = console.warn;
  globalThis.requestAnimationFrame = (callback) => setTimeout(() => callback(Date.now()), 0);
  globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
  console.warn = () => {};

  try {
    delete globalThis.Worker;
    let { ForceLayout } = await import('../canvas/ForceLayout.js');
    let force = new ForceLayout('/missing-force-worker.js');
    let firstTick = new Promise((resolve, reject) => {
      let timer = setTimeout(() => reject(new Error('semantic group fallback did not tick')), 200);
      force.onTick = (positions, meta) => {
        clearTimeout(timer);
        resolve({ positions, meta });
      };
    });

    force.start({
      nodes: [{ id: 'a', x: 0, y: 0 }, { id: 'b', x: 100, y: 0 }],
      edges: [],
      groups: { pair: ['a', 'b'] },
      options: {
        mode: 'continuous',
        alphaDecay: 0.5,
        brownian: 0,
        chargeStrength: 0,
        centerStrength: 0,
        centerPull: 0,
        collideStrength: 0,
        groupDistance: 10,
        groupStrength: 1,
      },
    });

    let first = await firstTick;
    assert.equal(first.meta.fallback, true);
    assert.ok(first.positions.a.x > 0);
    assert.ok(first.positions.b.x < 100);
    force.stop();
  } finally {
    console.warn = nativeWarn;
    if (NativeWorker) {
      globalThis.Worker = NativeWorker;
    } else {
      delete globalThis.Worker;
    }
    if (nativeRaf) {
      globalThis.requestAnimationFrame = nativeRaf;
    } else {
      delete globalThis.requestAnimationFrame;
    }
    if (nativeCancelRaf) {
      globalThis.cancelAnimationFrame = nativeCancelRaf;
    } else {
      delete globalThis.cancelAnimationFrame;
    }
  }
});

test('force layout fallback warms appearing nodes into layout participation', async () => {
  let NativeWorker = globalThis.Worker;
  let nativeRaf = globalThis.requestAnimationFrame;
  let nativeCancelRaf = globalThis.cancelAnimationFrame;
  let nativeWarn = console.warn;
  globalThis.requestAnimationFrame = (callback) => setTimeout(() => callback(Date.now()), 0);
  globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
  console.warn = () => {};

  try {
    delete globalThis.Worker;
    let { ForceLayout } = await import('../canvas/ForceLayout.js');
    let force = new ForceLayout('/missing-force-worker.js');
    let ticks = [];
    let nextTick = () => new Promise((resolve, reject) => {
      let timer = setTimeout(() => reject(new Error('layout participation fallback did not tick')), 200);
      force.onTick = (positions, meta) => {
        ticks.push({ positions, meta });
        clearTimeout(timer);
        resolve({ positions, meta });
      };
    });

    let firstTick = nextTick();
    force.start({
      nodes: [
        { id: 'source', x: 0, y: 0, mass: 4 },
        { id: 'appearing', x: 100, y: 0, layoutParticipation: 0, layoutWarmupTicks: 2 },
      ],
      edges: [{ from: 'source', to: 'appearing' }],
      options: {
        mode: 'continuous',
        alphaDecay: 0.5,
        brownian: 0,
        chargeStrength: 0,
        centerStrength: 0,
        centerPull: 0,
        collideStrength: 0,
        linkDistance: 10,
        linkStrength: 1,
      },
    });

    let first = await firstTick;
    assert.equal(Math.round(first.positions.appearing.x), 100);

    let second = await nextTick();
    assert.ok(second.positions.appearing.x < 100);
    assert.ok(Math.abs(second.positions.source.x) < Math.abs(second.positions.appearing.x - 100));
    force.stop();
  } finally {
    console.warn = nativeWarn;
    if (NativeWorker) {
      globalThis.Worker = NativeWorker;
    } else {
      delete globalThis.Worker;
    }
    if (nativeRaf) {
      globalThis.requestAnimationFrame = nativeRaf;
    } else {
      delete globalThis.requestAnimationFrame;
    }
    if (nativeCancelRaf) {
      globalThis.cancelAnimationFrame = nativeCancelRaf;
    } else {
      delete globalThis.cancelAnimationFrame;
    }
  }
});

test('force layout fallback reserves collision space for warming nodes', async () => {
  let NativeWorker = globalThis.Worker;
  let nativeRaf = globalThis.requestAnimationFrame;
  let nativeCancelRaf = globalThis.cancelAnimationFrame;
  let nativeWarn = console.warn;
  globalThis.requestAnimationFrame = (callback) => setTimeout(() => callback(Date.now()), 0);
  globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
  console.warn = () => {};

  try {
    delete globalThis.Worker;
    let { ForceLayout } = await import('../canvas/ForceLayout.js');
    let force = new ForceLayout('/missing-force-worker.js');
    let tick = new Promise((resolve, reject) => {
      let timer = setTimeout(() => reject(new Error('collision warmup fallback did not tick')), 200);
      force.onTick = (positions, meta) => {
        clearTimeout(timer);
        resolve({ positions, meta });
      };
    });

    force.start({
      nodes: [
        { id: 'a', x: 0, y: 0, w: 24, h: 24, mass: 2 },
        { id: 'b', x: 2, y: 0, w: 24, h: 24, mass: 1, layoutParticipation: 0.04, layoutWarmupTicks: 20 },
      ],
      edges: [],
      options: {
        mode: 'continuous',
        alphaDecay: 0.5,
        brownian: 0,
        chargeStrength: 0,
        centerStrength: 0,
        centerPull: 0,
        collideStrength: 1,
        collisionPadding: 20,
        velocityDecay: 0.2,
      },
    });

    let first = await tick;
    assert.equal(first.meta.fallback, true);
    assert.ok(first.positions.a.x < 0);
    assert.ok(first.positions.b.x > 2);
    force.stop();
  } finally {
    console.warn = nativeWarn;
    if (NativeWorker) {
      globalThis.Worker = NativeWorker;
    } else {
      delete globalThis.Worker;
    }
    if (nativeRaf) {
      globalThis.requestAnimationFrame = nativeRaf;
    } else {
      delete globalThis.requestAnimationFrame;
    }
    if (nativeCancelRaf) {
      globalThis.cancelAnimationFrame = nativeCancelRaf;
    } else {
      delete globalThis.cancelAnimationFrame;
    }
  }
});

test('material symbols loader reuses a host-provided package stylesheet', async () => {
  let NativeDocument = globalThis.document;
  let NativeWindow = globalThis.window;
  let appended = [];
  let links = [{
    rel: 'stylesheet',
    href: 'http://127.0.0.1:4213/packages/symbiote-ui/icons/material-symbols.css',
    dataset: {},
  }];
  globalThis.document = {
    nodeType: 9,
    head: {
      append(link) {
        appended.push(link);
        links.push(link);
      },
    },
    createElement(tagName) {
      return {
        tagName,
        rel: '',
        href: '',
        dataset: {},
      };
    },
    querySelector(selector) {
      if (selector === 'link[data-sn-material-symbols="managed"]') {
        return links.find((link) => link.dataset.snMaterialSymbols === 'managed') || null;
      }
      if (selector.includes('material-symbols.css')) {
        return links.find((link) => (
          link.rel.split(/\s+/).includes('stylesheet') &&
          (
            link.href.endsWith('/packages/symbiote-ui/icons/material-symbols.css') ||
            link.href.endsWith('/icons/material-symbols.css')
          )
        )) || null;
      }
      return null;
    },
  };
  globalThis.window = {};

  try {
    let materialSymbols = await import(`../icons/MaterialSymbols.js?host-stylesheet=${Date.now()}`);
    materialSymbols.configureMaterialSymbols({ autoload: true, hrefBuilder: null });
    materialSymbols.ensureMaterialSymbols(['hub', 'folder_open']);

    assert.equal(appended.length, 0);
    assert.equal(links.length, 1);
    assert.equal(links[0].href, 'http://127.0.0.1:4213/packages/symbiote-ui/icons/material-symbols.css');
    assert.equal(links[0].dataset.snMaterialSymbols, 'managed');
    assert.equal(links[0].dataset.snMaterialSymbolsIcons, 'folder_open,hub');
  } finally {
    if (NativeDocument) {
      globalThis.document = NativeDocument;
    } else {
      delete globalThis.document;
    }
    if (NativeWindow) {
      globalThis.window = NativeWindow;
    } else {
      delete globalThis.window;
    }
  }
});

test('provider schemas use symbiote-ui public schema ids', async () => {
  let manifest = await import('../manifest/index.js');
  let schemaFiles = [
    'component-descriptor-v1.json',
    'component-descriptor-v2.json',
    'agent-intent-v1.json',
    'graph-v1.json',
    'graph-model-v1.json',
    'project-package-v1.json',
    'project-transaction-v1.json',
    'runtime-ui-v1.json',
    'theme-rule-block-v1.json',
    'message-part-v1.json',
    'data-grid-v1.json',
    'chart-spec-v1.json',
    'source-diff-v1.json',
  ];
  let schemas = [
    ...Object.values(manifest.UI_SCHEMAS),
    ...Object.values(manifest.GRAPH_SCHEMAS),
    ...Object.values(manifest.PROJECT_SCHEMAS),
    ...await Promise.all(schemaFiles.map(async (file) => (
      JSON.parse(await readFile(new URL(`../schemas/${file}`, import.meta.url), 'utf8'))
    ))),
  ];

  for (const schema of schemas) {
    assert.match(schema.$id, /^https:\/\/rnd-pro\.github\.io\/symbiote-ui\/schemas\//);
    assert.doesNotMatch(schema.$id, /symbiote-node/);
  }
});

test('discover exposes the standalone package contract', async () => {
  let { cmdDiscover } = await import('../discover.js');
  let data = await cmdDiscover({});
  let entrypoints = new Map(data.exports.entrypoints.map((entry) => [entry.specifier, entry]));

  assert.equal(data.package.name, 'symbiote-ui');
  assert.equal(entrypoints.get('symbiote-ui')?.kind, 'node-safe');
  assert.equal(entrypoints.get('symbiote-ui/board')?.kind, 'browser-component');
  assert.equal(entrypoints.get('symbiote-ui/ui/screencast-recorder.js')?.kind, 'browser');
  assert.equal(entrypoints.get('symbiote-ui/ui/tour-screencast.js')?.kind, 'browser');
  assert.equal(entrypoints.get('symbiote-ui/ui/tour-audio-provider.js')?.kind, 'browser');
  assert.equal(entrypoints.get('symbiote-ui/ui/tour-media-renderer.js')?.kind, 'browser');
  assert.equal(entrypoints.get('symbiote-ui/layout')?.kind, 'ssr-entry-safe');
  assert.equal(entrypoints.get('symbiote-ui/runtime')?.kind, 'ssr-entry-safe');
  assert.equal(entrypoints.get('symbiote-ui/webmcp')?.kind, 'ssr-entry-safe');
  assert.equal(entrypoints.get('symbiote-ui/display/source-viewer')?.kind, 'browser-component');
  assert.equal(entrypoints.get('symbiote-ui/display/source-editor')?.kind, 'browser-component');
  assert.equal(entrypoints.get('symbiote-ui/display/code-block')?.kind, 'browser-component');
  assert.equal(entrypoints.get('symbiote-ui/tree/TreeView')?.kind, 'browser-component');
  assert.equal(entrypoints.get('symbiote-ui/tree/TreePanel')?.kind, 'browser-component');
  let layoutEntrypoint = await import('../layout/index.js');
  assert.equal(typeof layoutEntrypoint.suspendLayoutSubtree, 'function');
  assert.equal(typeof layoutEntrypoint.resumeLayoutSubtree, 'function');
  let component = data.manifest.components.find((item) => item.tagName === 'cascade-theme-editor');
  let agentCatalogItem = data.manifest.componentAgentCatalog.find((item) => item.tagName === 'cascade-theme-editor');
  let shellMenu = data.manifest.components.find((item) => item.tagName === 'layout-shell-menu');
  let shellMenuAgentItem = data.manifest.componentAgentCatalog.find((item) => item.tagName === 'layout-shell-menu');
  let layout = data.manifest.components.find((item) => item.tagName === 'panel-layout');
  let sidebar = data.manifest.components.find((item) => item.tagName === 'layout-sidebar');
  let layoutAgentItem = data.manifest.componentAgentCatalog.find((item) => item.tagName === 'panel-layout');
  let sidebarAgentItem = data.manifest.componentAgentCatalog.find((item) => item.tagName === 'layout-sidebar');
  let chatComposer = data.manifest.components.find((item) => item.tagName === 'chat-composer');
  let chatComposerAgentItem = data.manifest.componentAgentCatalog.find((item) => item.tagName === 'chat-composer');
  let chatSidebarAgentItem = data.manifest.componentAgentCatalog.find((item) => item.tagName === 'chat-sidebar-shell');
  let chatWorkspaceAgentItem = data.manifest.componentAgentCatalog.find((item) => item.tagName === 'chat-workspace');
  let kanbanBoard = data.manifest.components.find((item) => item.tagName === 'sn-kanban-board');
  let kanbanBoardAgentItem = data.manifest.componentAgentCatalog.find((item) => item.tagName === 'sn-kanban-board');
  let nodeCanvas = data.manifest.components.find((item) => item.tagName === 'node-canvas');
  let nodeCanvasAgentItem = data.manifest.componentAgentCatalog.find((item) => item.tagName === 'node-canvas');
  let canvasGraphAgentItem = data.manifest.componentAgentCatalog.find((item) => item.tagName === 'canvas-graph');
  let graphExplorerAgentItem = data.manifest.componentAgentCatalog.find((item) => item.tagName === 'graph-explorer-shell');
  let cellBgAgentItem = data.manifest.componentAgentCatalog.find((item) => item.tagName === 'cell-bg');
  let codeBlock = data.manifest.components.find((item) => item.tagName === 'code-block');
  let codeBlockAgentItem = data.manifest.componentAgentCatalog.find((item) => item.tagName === 'code-block');
  let sourceViewerAgentItem = data.manifest.componentAgentCatalog.find((item) => item.tagName === 'source-viewer');
  let sourceEditorAgentItem = data.manifest.componentAgentCatalog.find((item) => item.tagName === 'source-editor');
  assert.ok(component.componentDescription.includes('cascade theme editor'));
  assert.equal(component.agent.webmcp.mode, 'explicit-descriptor');
  assert.ok(component.agent.webmcp.references.includes('https://rnd-pro.com/pulse/symbiote-webmcp-support/'));
  assert.ok(agentCatalogItem.componentDescription.includes('WebMCP tools: cascade_theme_editor_apply'));
  assert.equal(agentCatalogItem.webmcp.toolNames[0], 'cascade_theme_editor_apply');
  assert.ok(shellMenu.componentDescription.includes('project tabs'));
  assert.ok(shellMenu.componentDescription.includes('layout-group-controller'));
  assert.equal(shellMenu.agent.webmcp.mode, 'explicit-descriptor');
  assert.ok(shellMenu.contract.capabilities.includes('sidebar-slot'));
  assert.ok(shellMenu.contract.methods.some((method) => method.name === 'setGroups'));
  assert.ok(shellMenu.contract.slots.some((slot) => slot.name === 'sidebar'));
  assert.equal(shellMenuAgentItem.webmcp.toolNames[0], 'layout_shell_menu_select');
  assert.equal(shellMenuAgentItem.webmcp.toolNames[1], 'layout_shell_menu_set_groups');
  assert.equal(layout.contract.schemaVersion, 'component-descriptor-v2');
  assert.equal(sidebar.contract.schemaVersion, 'component-descriptor-v2');
  assert.ok(layoutAgentItem.webmcp.toolNames.includes('panel_layout_set_behavior'));
  assert.ok(layout.componentDescription.includes('min-size-fit'));
  assert.ok(layout.contract.capabilities.includes('mobile-stack'));
  assert.ok(layout.contract.attributes.some((attribute) => attribute.name === 'scroll-inline-active'));
  assert.ok(layout.contract.attributes.some((attribute) => attribute.name === 'scroll-block-active'));
  assert.ok(layout.contract.properties.find((property) => (
    property.name === 'layoutBehavior' &&
    property.description.includes('not persisted')
  )));
  assert.ok(layoutAgentItem.webmcp.toolNames.includes('panel_layout_register_panel_type'));
  assert.ok(layoutAgentItem.webmcp.toolNames.includes('panel_layout_set_panel_menu_actions'));
  assert.ok(layoutAgentItem.webmcp.toolNames.includes('panel_layout_open_panel'));
  assert.ok(layoutAgentItem.webmcp.toolNames.includes('panel_layout_close_ui_panel'));
  assert.ok(sidebarAgentItem.webmcp.toolNames.includes('layout_sidebar_set_sections'));
  assert.ok(sidebarAgentItem.webmcp.toolNames.includes('layout_sidebar_set_active_section'));
  assert.ok(chatComposerAgentItem.webmcp.toolNames.includes('chat_composer_voice_control'));
  assert.ok(chatComposerAgentItem.webmcp.toolNames.includes('chat_composer_voice_flow'));
  assert.ok(chatComposerAgentItem.webmcp.toolNames.includes('chat_composer_leading_control'));
  assert.ok(chatComposer.contract.webmcp.tools
    .find((tool) => tool.name === 'chat_composer_voice_control')
    .description.includes('VoiceController'));
  assert.ok(chatComposer.contract.webmcp.tools
    .find((tool) => tool.name === 'chat_composer_voice_flow')
    .description.includes('VoiceRuntime'));
  assert.ok(chatSidebarAgentItem.webmcp.toolNames.includes('chat_sidebar_set_chats'));
  assert.ok(chatSidebarAgentItem.webmcp.toolNames.includes('chat_sidebar_select'));
  assert.ok(chatSidebarAgentItem.webmcp.toolNames.includes('chat_sidebar_set_collapsed'));
  assert.ok(chatWorkspaceAgentItem.webmcp.toolNames.includes('chat_workspace_set_state'));
  assert.ok(chatWorkspaceAgentItem.webmcp.toolNames.includes('chat_workspace_background'));
  assert.ok(chatWorkspaceAgentItem.webmcp.toolNames.includes('chat_workspace_select_chat'));
  assert.ok(chatWorkspaceAgentItem.webmcp.toolNames.includes('chat_workspace_send'));
  assert.ok(chatWorkspaceAgentItem.componentDescription.includes('chat workspace'));
  assert.ok(chatWorkspaceAgentItem.componentDescription.includes('leading-control-intent-router'));
  assert.ok(chatWorkspaceAgentItem.componentDescription.includes('host-owned-transport'));
  assert.ok(chatWorkspaceAgentItem.componentDescription.includes('layout-lifecycle'));
  assert.ok(chatWorkspaceAgentItem.componentDescription.includes('overlay-stack-reserve'));
  assert.equal(kanbanBoard.contract.schemaVersion, 'component-descriptor-v2');
  assert.ok(kanbanBoard.contract.capabilities.includes('kanban-board'));
  assert.ok(kanbanBoard.contract.events.some((event) => event.name === 'sn-board-card-drop'));
  assert.ok(kanbanBoardAgentItem.componentDescription.includes('kanban board'));
  assert.ok(nodeCanvasAgentItem.webmcp.toolNames.includes('node_canvas_set_editor_model'));
  assert.ok(nodeCanvasAgentItem.webmcp.toolNames.includes('node_canvas_set_path_style'));
  assert.ok(nodeCanvasAgentItem.webmcp.toolNames.includes('node_canvas_set_flow_layout'));
  assert.ok(nodeCanvasAgentItem.webmcp.toolNames.includes('node_canvas_apply_layout'));
  assert.ok(nodeCanvasAgentItem.webmcp.toolNames.includes('node_canvas_focus_nodes'));
  assert.ok(nodeCanvasAgentItem.componentDescription.includes('node-editor-canvas'));
  assert.ok(nodeCanvasAgentItem.componentDescription.includes('graph-layout'));
  let discoveredLayoutTool = nodeCanvas.contract.webmcp.tools
    .find((tool) => tool.name === 'node_canvas_apply_layout');
  assert.deepEqual(discoveredLayoutTool.inputSchema.properties.groups, {
    oneOf: [
      {
        type: 'object',
        additionalProperties: {
          oneOf: [
            { type: 'array', items: { type: 'string' } },
            {
              type: 'object',
              additionalProperties: false,
              properties: {
                nodeIds: { type: 'array', items: { type: 'string' } },
                nodes: { type: 'array', items: { type: 'string' } },
                children: { type: 'array', items: { type: 'string' } },
                members: { type: 'array', items: { type: 'string' } },
              },
            },
          ],
        },
      },
      {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            id: { type: 'string', minLength: 1 },
            nodeIds: { type: 'array', items: { type: 'string' } },
            nodes: { type: 'array', items: { type: 'string' } },
            children: { type: 'array', items: { type: 'string' } },
            members: { type: 'array', items: { type: 'string' } },
          },
          required: ['id'],
        },
      },
    ],
  });
  assert.ok(canvasGraphAgentItem.webmcp.toolNames.includes('canvas_graph_set_model'));
  assert.ok(canvasGraphAgentItem.webmcp.toolNames.includes('canvas_graph_focus_node'));
  assert.ok(canvasGraphAgentItem.webmcp.toolNames.includes('canvas_graph_set_path'));
  assert.ok(canvasGraphAgentItem.componentDescription.includes('overview-read-renderer'));
  assert.ok(data.manifest.components
    .find((item) => item.tagName === 'canvas-graph')
    .contract.attributes
    .some((attribute) => attribute.name === 'active-node-scale'));
  assert.ok(data.manifest.components
    .find((item) => item.tagName === 'canvas-graph')
    .contract.attributes
    .some((attribute) => attribute.name === 'info-panel-scale'));
  assert.ok(data.manifest.components
    .find((item) => item.tagName === 'canvas-graph')
    .contract.properties
    .some((property) => property.name === 'activeNodeScale'));
  assert.ok(data.manifest.components
    .find((item) => item.tagName === 'canvas-graph')
    .contract.properties
    .some((property) => property.name === 'infoPanelScale'));
  assert.ok(data.manifest.components
    .find((item) => item.tagName === 'canvas-graph')
    .contract.methods
    .some((method) => method.name === 'suspendLayout'));
  assert.ok(data.manifest.components
    .find((item) => item.tagName === 'canvas-graph')
    .contract.methods
    .some((method) => method.name === 'resumeLayout'));
  assert.ok(data.manifest.components
    .find((item) => item.tagName === 'canvas-graph')
    .contract.methods
    .some((method) => method.name === 'setVisualOptions'));
  assert.ok(data.manifest.components
    .find((item) => item.tagName === 'canvas-graph')
    .contract.methods
    .some((method) => method.name === 'setForceLayoutOptions'));
  assert.ok(data.manifest.components
    .find((item) => item.tagName === 'canvas-graph')
    .contract.methods
    .find((method) => method.name === 'setForceLayoutOptions')
    .description.includes('layoutAlgorithm'));
  assert.ok(data.manifest.components
    .find((item) => item.tagName === 'canvas-graph')
    .contract.methods
    .some((method) => method.name === 'animateNodeAppearance'));
  assert.ok(data.manifest.components
    .find((item) => item.tagName === 'canvas-graph')
    .contract.methods
    .some((method) => method.name === 'queueTransitionMarkers'));
  assert.ok(data.manifest.components
    .find((item) => item.tagName === 'canvas-graph')
    .contract.methods
    .some((method) => method.name === 'resetLayoutState'));
  assert.equal(
    data.manifest.components
      .find((item) => item.tagName === 'canvas-graph')
      .contract.attributes
      .some((attribute) => attribute.name === 'auto-trigger'),
    false
  );
  assert.ok(graphExplorerAgentItem.webmcp.toolNames.includes('graph_explorer_shell_set_view'));
  assert.ok(graphExplorerAgentItem.webmcp.toolNames.includes('graph_explorer_shell_set_stats'));
  assert.ok(graphExplorerAgentItem.webmcp.toolNames.includes('graph_explorer_shell_request_action'));
  assert.ok(cellBgAgentItem.componentDescription.includes('WebMCP tools: cell_bg_trigger'));
  assert.ok(cellBgAgentItem.webmcp.toolNames.includes('cell_bg_trigger'));
  assert.ok(cellBgAgentItem.webmcp.toolNames.includes('cell_bg_start'));
  assert.ok(cellBgAgentItem.webmcp.toolNames.includes('cell_bg_stop'));
  assert.ok(codeBlock.contract.themeAliases.includes('--sn-code-gutter-bg'));
  assert.ok(codeBlock.contract.themeAliases.includes('--sn-code-gutter-color'));
  assert.ok(codeBlockAgentItem.componentDescription.includes('markdown document'));
  assert.ok(codeBlockAgentItem.webmcp.toolNames.includes('code_block_set_content'));
  assert.ok(sourceViewerAgentItem.componentDescription.includes('markdown-document-viewer'));
  assert.ok(sourceViewerAgentItem.webmcp.toolNames.includes('source_viewer_set_document'));
  assert.ok(sourceViewerAgentItem.webmcp.toolNames.includes('source_viewer_action'));
  assert.ok(sourceEditorAgentItem.componentDescription.includes('markdown-editing'));
  assert.ok(sourceEditorAgentItem.webmcp.toolNames.includes('source_editor_content'));
  assert.ok(sourceEditorAgentItem.webmcp.toolNames.includes('source_editor_save'));
  let sourceViewer = data.manifest.components.find((item) => item.tagName === 'source-viewer');
  let sourceEditor = data.manifest.components.find((item) => item.tagName === 'source-editor');
  let timelineEditor = data.manifest.components.find((item) => item.tagName === 'sn-timeline-editor');
  let checkbox = data.manifest.components.find((item) => item.tagName === 'sn-checkbox');
  let radio = data.manifest.components.find((item) => item.tagName === 'sn-radio');
  let sw = data.manifest.components.find((item) => item.tagName === 'sn-switch');
  assert.ok(sourceViewer.contract.capabilities.includes('directory-summary'));
  assert.ok(sourceEditor.contract.capabilities.includes('markdown-editing'));
  assert.ok(timelineEditor);
  assert.ok(timelineEditor.contract.capabilities.includes('nle-timeline'));
  assert.ok(timelineEditor.contract.methods.some((method) => method.name === 'loadTimeline'));
  assert.ok(checkbox.contract.capabilities.includes('mixed-state'));
  assert.ok(checkbox.contract.attributes.some((attribute) => attribute.name === 'indeterminate'));
  assert.ok(checkbox.contract.events.some((event) => event.name === 'sn-checkbox-change'));
  assert.ok(radio.contract.capabilities.includes('single-selection'));
  assert.ok(sw.contract.capabilities.includes('switch'));
  let customElements = JSON.parse(await readFile(new URL('../custom-elements.json', import.meta.url), 'utf8'));
  let codeBlockDeclaration = customElements.modules
    .flatMap((module) => module.declarations || [])
    .find((declaration) => declaration.tagName === 'code-block');
  let sourceEditorDeclaration = customElements.modules
    .flatMap((module) => module.declarations || [])
    .find((declaration) => declaration.tagName === 'source-editor');
  let checkboxDeclaration = customElements.modules
    .flatMap((module) => module.declarations || [])
    .find((declaration) => declaration.tagName === 'sn-checkbox');
  let timelineEditorDeclaration = customElements.modules
    .flatMap((module) => module.declarations || [])
    .find((declaration) => declaration.tagName === 'sn-timeline-editor');
  assert.ok(sourceEditorDeclaration.componentDescription.includes('markdown-editing'));
  assert.ok(codeBlockDeclaration.metadata.contract.themeAliases.includes('--sn-code-gutter-bg'));
  assert.ok(codeBlockDeclaration.metadata.contract.themeAliases.includes('--sn-code-gutter-color'));
  assert.ok(sourceEditorDeclaration.agent.webmcp.toolNames.includes('source_editor_save'));
  assert.ok(timelineEditorDeclaration);
  assert.ok(timelineEditorDeclaration.componentDescription.includes('multi-track timeline editor'));
  assert.ok(timelineEditorDeclaration.metadata.contract.methods.some((method) => method.name === 'loadTimeline'));
  assert.ok(checkboxDeclaration.componentDescription.includes('mixed state'));
  assert.ok(checkboxDeclaration.metadata.contract.themeAliases.includes('--sn-selection-checked-bg'));
  let cascadeDescriptor = data.manifest.themeRuntimeDescriptors.find((descriptor) => descriptor.name === 'cascade-theme');
  assert.ok(cascadeDescriptor);
  assert.equal(cascadeDescriptor.webmcp?.name, 'symbiote-ui.createCascadeTheme');
  assert.ok(cascadeDescriptor.exports.includes('getReadableTextForHsl'));
  let cascadeControlNames = data.manifest.themeControls['cascade-theme'].map((control) => control.name);
  for (const name of ['mode', 'brightness', 'contrast', 'chroma', 'hue', 'pattern', 'outline', 'type', 'heading', 'density', 'radius', 'tabRadius', 'composerRadius']) {
    assert.ok(cascadeControlNames.includes(name), `expected cascade theme control ${name}`);
  }

  assert.ok(data.manifest.themePresets);
  assert.deepEqual(data.manifest.themePresets.colors, ['carbon', 'neon', 'pcb', 'ebook', 'dark', 'light']);
  assert.deepEqual(data.manifest.themePresets.skins, ['modern', 'compact', 'rounded']);
  assert.deepEqual(data.manifest.themePresets.panels.chat, { color: 'dark', skin: 'modern', motion: 'smooth' });
});

test('CLI discover works when launched through an npm bin symlink', async () => {
  let tmpDir = await mkdtemp(join(tmpdir(), 'symbiote-ui-cli-'));
  let binPath = join(tmpDir, 'symbiote-ui');

  try {
    await symlink(fileURLToPath(new URL('../cli.js', import.meta.url)), binPath);
    let { stdout } = await execFileAsync(process.execPath, [binPath, 'discover'], {
      cwd: fileURLToPath(new URL('..', import.meta.url)),
      maxBuffer: 10 * 1024 * 1024,
    });
    let data = JSON.parse(stdout);

    assert.equal(data.command, 'discover');
    assert.equal(data.package.name, 'symbiote-ui');
    assert.ok(data.manifest.components.some((component) => component.tagName === 'cascade-theme-widget'));
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }
});

test('webmcp helpers append component context to explicit tool descriptors', async () => {
  let { createComponentToolDescriptor } = await import('../webmcp.js');
  let descriptor = createComponentToolDescriptor(
    {
      tagName: 'sample-panel',
      className: 'SamplePanel',
      componentDescription: 'Sample panel explains the visible data.',
      agent: { semanticRole: 'sample surface' },
    },
    {
      name: 'sample_action',
      description: 'Run the visible action.',
      inputSchema: { type: 'object', additionalProperties: false },
      annotations: { readOnlyHint: false },
    }
  );

  assert.equal(descriptor.name, 'sample_action');
  assert.match(descriptor.description, /Sample panel explains/);
  assert.match(descriptor.description, /Run the visible action/);
  assert.equal(descriptor.annotations.componentTag, 'sample-panel');
  assert.equal(descriptor.annotations.semanticRole, 'sample surface');
  assert.equal(descriptor.annotations.readOnlyHint, false);
});

test('discover provides agent component defaults for drivers without explicit metadata', async () => {
  let { cmdDiscover } = await import('../discover.js');
  let data = await cmdDiscover({});

  assert.ok(data.registry.drivers.length > 0);
  for (const driver of data.registry.drivers) {
    assert.ok(Array.isArray(driver.agent?.suggestedComponents), `${driver.type} suggestedComponents`);
    if (driver.agent.suggestedComponentsSource) {
      assert.equal(driver.agent.suggestedComponentsSource, 'symbiote-ui-defaults', `${driver.type} suggestedComponentsSource`);
      assert.ok(driver.agent.suggestedComponents.includes('graph-node'), `${driver.type} graph-node suggestion`);
    } else {
      assert.ok(driver.agent.suggestedComponents.length > 0, `${driver.type} explicit suggestedComponents`);
    }
  }
});

test('component registry follows the agent-facing WebMCP documentation standard', async () => {
  let { listComponents } = await import('../manifest/index.js');

  for (const component of listComponents()) {
    assert.match(component.componentDescription, /Use this/);
    assert.ok(component.agent?.semanticRole, `${component.tagName} semantic role`);
    assert.ok(component.agent?.usage, `${component.tagName} usage`);
    assert.ok(component.agent?.dataOwnership, `${component.tagName} data ownership`);
    let toolCount = component.contract?.webmcp?.tools?.length || 0;
    assert.equal(
      component.agent?.webmcp?.mode,
      toolCount ? 'explicit-descriptor' : 'described-only'
    );
    assert.ok(
      component.agent?.webmcp?.globalToolMode.includes('Do not enable global Symbiote.mcpToolMode'),
      `${component.tagName} explicit-first WebMCP guidance`
    );
    assert.ok(component.visibility, `${component.tagName} visibility`);
    assert.equal(component.contract?.schemaVersion, 'component-descriptor-v2');
    assert.ok(component.contract?.ssr?.mode, `${component.tagName} SSR mode`);
    assert.ok(Array.isArray(component.contract?.properties), `${component.tagName} properties contract`);
    assert.ok(Array.isArray(component.contract?.events), `${component.tagName} events contract`);
    assert.ok(Array.isArray(component.contract?.slots), `${component.tagName} slots contract`);
  }
});

test('explicit WebMCP tools map to public component methods or intent events', async () => {
  let { listComponents } = await import('../manifest/index.js');

  for (const component of listComponents()) {
    let tools = component.contract?.webmcp?.tools || [];
    let methods = new Set((component.contract?.methods || []).map((method) => method.name));
    let events = new Set((component.contract?.events || []).map((event) => event.name));
    for (const tool of tools) {
      let annotations = tool.annotations || {};
      let runtimeMethods = [
        annotations.runtimeMethod,
        ...(annotations.runtimeMethods || []),
      ].filter(Boolean);
      let intentEvents = [
        annotations.intentEvent,
        ...(annotations.intentEvents || []),
      ].filter(Boolean);
      assert.ok(
        runtimeMethods.length || intentEvents.length,
        `${component.tagName}:${tool.name} must declare runtimeMethod/runtimeMethods or intentEvent/intentEvents`
      );
      for (const method of runtimeMethods) {
        assert.ok(methods.has(method), `${component.tagName}:${tool.name} references missing public method ${method}`);
      }
      for (const event of intentEvents) {
        assert.ok(events.has(event), `${component.tagName}:${tool.name} references missing public event ${event}`);
      }
    }
  }
});

test('node-canvas exposes the agent-facing serializable model adapter promised by WebMCP', async () => {
  let source = await readFile(new URL('../canvas/NodeCanvas/NodeCanvas.js', import.meta.url), 'utf8');
  let { getComponent } = await import('../manifest/index.js');
  let component = getComponent('node-canvas');
  let tool = component.contract.webmcp.tools.find((item) => item.name === 'node_canvas_set_editor_model');

  assert.match(source, /setEditorModel\(model = \{\}\)/);
  assert.equal(tool.annotations.runtimeMethod, 'setEditorModel');
  assert.ok(component.contract.methods.some((method) => method.name === 'setEditorModel'));
  assert.ok(tool.inputSchema.properties.nodes);
  assert.ok(tool.inputSchema.properties.connections);
  assert.ok(tool.inputSchema.properties.positions);
  let focusTool = component.contract.webmcp.tools.find((item) => item.name === 'node_canvas_focus_nodes');
  let layoutTool = component.contract.webmcp.tools.find((item) => item.name === 'node_canvas_apply_layout');
  assert.equal(layoutTool.annotations.runtimeMethod, 'applyLayout');
  assert.ok(component.contract.methods.some((method) => method.name === 'applyLayout'));
  assert.ok(component.contract.methods.some((method) => method.name === 'autoLayout'));
  assert.deepEqual(layoutTool.inputSchema.properties.algorithm.enum, ['auto', 'tree', 'flow', 'crystal']);
  assert.deepEqual(layoutTool.inputSchema.properties.groups, {
    oneOf: [
      {
        type: 'object',
        additionalProperties: {
          oneOf: [
            { type: 'array', items: { type: 'string' } },
            {
              type: 'object',
              additionalProperties: false,
              properties: {
                nodeIds: { type: 'array', items: { type: 'string' } },
                nodes: { type: 'array', items: { type: 'string' } },
                children: { type: 'array', items: { type: 'string' } },
                members: { type: 'array', items: { type: 'string' } },
              },
            },
          ],
        },
      },
      {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            id: { type: 'string', minLength: 1 },
            nodeIds: { type: 'array', items: { type: 'string' } },
            nodes: { type: 'array', items: { type: 'string' } },
            children: { type: 'array', items: { type: 'string' } },
            members: { type: 'array', items: { type: 'string' } },
          },
          required: ['id'],
        },
      },
    ],
  });
  assert.deepEqual(layoutTool.inputSchema.properties.rootNodeId, { type: 'string', minLength: 1 });
  assert.deepEqual(layoutTool.inputSchema.properties.crystalRingDistance, {
    type: 'number',
    exclusiveMinimum: 0,
  });
  assert.deepEqual(layoutTool.inputSchema.properties.crystalSpokes, {
    type: 'integer',
    minimum: 3,
    maximum: 12,
  });
  assert.deepEqual(layoutTool.inputSchema.properties.crystalAngleJitter, {
    type: 'number',
    minimum: 0,
    maximum: 0.22,
  });
  let canvas = await import('../canvas/index.js');
  assert.equal(typeof canvas.computeCrystalLayout, 'function');
  assert.equal(typeof canvas.computeCrystalTargets, 'function');
  assert.equal(focusTool.annotations.runtimeMethod, 'focusNodes');
  assert.ok(component.contract.methods.some((method) => method.name === 'focusNodes'));
  assert.ok(component.contract.methods.some((method) => method.name === 'flyToNodes'));
  assert.ok(focusTool.inputSchema.properties.nodeIds);
});

test('node shape registry exposes disc as a supported SVG node preset', async () => {
  let [shapeModule, nodeSource] = await Promise.all([
    import(new URL('../shapes/index.js', import.meta.url).href),
    readFile(new URL('../core/Node.js', import.meta.url), 'utf8'),
  ]);
  let disc = shapeModule.getShape('disc');
  let { getComponent } = await import('../manifest/index.js');
  let graphNode = getComponent('graph-node');

  assert.equal(disc.name, 'disc');
  assert.ok(disc.pathData);
  assert.equal(disc.viewBox, '0 0 24 24');
  assert.match(nodeSource, /rect\/pill\/circle\/disc\/diamond\/comment/);
  assert.ok(graphNode.contract.capabilities.includes('shape-variant'));
  assert.ok(graphNode.contract.capabilities.includes('media-avatar'));
  assert.ok(
    graphNode.contract.attributes.some((attribute) =>
      attribute.name === 'node-shape' && attribute.description.includes('disc')
    )
  );
});

test('graph node exposes media fit strategy for transparent and cropped media', async () => {
  let [nodeSource, nodeStyles] = await Promise.all([
    readFile(new URL('../node/GraphNode/GraphNode.js', import.meta.url), 'utf8'),
    readFile(new URL('../node/GraphNode/GraphNode.css.js', import.meta.url), 'utf8'),
  ]);
  let { getComponent } = await import('../manifest/index.js');
  let graphNode = getComponent('graph-node');

  assert.match(nodeSource, /function normalizeMediaFit\(value\) {/);
  assert.match(nodeSource, /fit === 'fit'\) return 'contain';/);
  assert.match(nodeSource, /fit === 'crop'\) return 'cover';/);
  assert.match(
    nodeSource,
    /'data-media-fit',\s*media\?\.fit \|\| normalizeMediaFit\(params\.mediaFit \|\| params\.imageFit \|\| params\.avatarFit\)/
  );
  assert.match(nodeStyles, /\& \.sn-node-media {[\s\S]*?inline-size: 100%;\s*aspect-ratio: 16 \/ 9;/);
  assert.match(nodeStyles, /\& \.sn-node-media-img {\s*display: block;\s*inline-size: 100%;\s*block-size: 100%;/);
  assert.match(nodeStyles, /\&\[data-media-fit='contain'\] \.sn-node-media-img {\s*object-fit: contain;/);
  assert.match(nodeStyles, /\&\[data-media-fit='cover'\] \.sn-node-media-img {\s*object-fit: cover;/);
  assert.ok(graphNode.contract.capabilities.includes('media-fit'));
  assert.ok(
    graphNode.contract.attributes.some((attribute) =>
      attribute.name === 'data-media-fit' && attribute.description.includes('contain')
    )
  );
});

test('source component registry does not keep legacy descriptor-v1 contracts', async () => {
  let source = await readFile(new URL('../manifest/component-registry.js', import.meta.url), 'utf8');

  assert.doesNotMatch(source, /component-descriptor-v1/);
});

test('canvas and ui entrypoints no longer export the html-in-canvas plaque contract', async () => {
  let canvas = await import('../canvas/index.js');
  let ui = await import('../ui/index.js');

  for (let entrypoint of [canvas, ui]) {
    assert.equal(typeof entrypoint.createCanvasHtmlPlaqueController, 'undefined');
    assert.equal(typeof entrypoint.resolveCanvasHtmlPlaqueEligibility, 'undefined');
    assert.equal(entrypoint.CANVAS_HTML_PLAQUE_MODE, undefined);
    assert.equal(entrypoint.BUILTIN_MEDIA_PLAQUE_CAPABILITIES, undefined);
    assert.equal(typeof entrypoint.createHtmlInCanvasAdapter, 'function');
  }
});

test('canvas graph source no longer exposes the plaque anchor or post-scene seam', async () => {
  let source = await readFile(new URL('../canvas/CanvasGraph/CanvasGraph.js', import.meta.url), 'utf8');

  assert.doesNotMatch(source, /measureNodePlaqueAnchor/);
  assert.doesNotMatch(source, /addPostSceneRenderer/);
  assert.doesNotMatch(source, /removePostSceneRenderer/);
  assert.doesNotMatch(source, /_postSceneRenderers/);
  assert.doesNotMatch(source, /projectCanvasRectFromWorld/);
});

test('disk JSON schemas exactly match inline manifest schemas', async () => {
  const manifest = await import('../manifest/index.js');

  const graphV1Disk = JSON.parse(await readFile(new URL('../schemas/graph-v1.json', import.meta.url), 'utf8'));
  const graphModelV1Disk = JSON.parse(await readFile(new URL('../schemas/graph-model-v1.json', import.meta.url), 'utf8'));

  const graphV1Inline = manifest.GRAPH_SCHEMAS['v1'];
  const graphModelV1Inline = manifest.GRAPH_SCHEMAS['graph-model-v1'];

  assert.ok(graphV1Inline);
  assert.ok(graphModelV1Inline);

  assert.deepEqual(graphV1Disk, graphV1Inline);
  assert.deepEqual(graphModelV1Disk, graphModelV1Inline);
});
