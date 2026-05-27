import { Symbiote } from '@symbiotejs/symbiote';
import * as THREE from 'three';
import { sharedUiStyles as cssShared, getRoute, parseQuery } from 'symbiote-node/ui';
import {
  WEBXR_FEATURES,
  WEBXR_MODES,
  createStableXRDiagnosticClientId,
  createXRHtmlCanvasRenderer,
  createXRPanelHost,
  createXRPanelGeometrySummary,
  createXRDeepGraphPreviewOverlay,
  createXRSceneQualitySummary,
  createXRSceneController,
  createXRSceneDiagnostics,
  createXRSpatialPreview,
  createXRSpatialScene,
  createXRThemeSnapshot,
  createXRPointerEvent,
  createXRPointerHitFromDomEvent,
  createXRPanelGestureState,
  createXRPointerRayFromDomEvent,
  hitTestXRPanelFrame,
  updateXRPanelGesture,
  createXRLayoutTransactionFromGesture,
  createXRLayoutTransactionFromPanelPose,
  createXRThreeRenderHost,
  createXRThreePanelTextureBridge,
  createXRThreeHtmlCanvasTextureResolver,
  createXRThreeSessionController,
  createXRThreeSessionHealthSummary,
  createXRThreeSessionOptions,
  createXRThreeSessionTelemetrySnapshot,
  createXRThreeInteractionReadinessSummary,
  createXRThreeWebXRAdapter,
  createXRVisualAgentReadinessSummary,
  createXRVisualTestSummary,
  createXRReadinessSummary,
  createXRSpatialWorkbenchSummary,
  createXRDomPanelWorkbench,
  createXRWorkbenchDiagnosticPayload,
  createXRTextureDebugModeSummary,
  createXRTextureGateSummary,
  getWebXRSupport,
  createWebXRLaunchGateSummary,
  createWebXRLaunchRecommendation,
  hitTestXRPanels,
  readXRHtmlCanvasOriginTrialHeaderStatus,
} from 'symbiote-node/xr';
import { createProjectTransactionEvent } from '../../services/project-transaction-messages.js';
import { events, state, skeletonMatchesProject } from '../../app.js';
import { getSectionsForScope, panelTypes } from '../../router-registry.js';
import { getPortalRuntimeLayout } from '../../services/portal-runtime.js';
import { createPortalXRDeepGraphScene } from '../../services/xr-deep-graph-scene.js';
import cssLocal from './SpatialLayout.css.js';
import template from './SpatialLayout.tpl.js';

const HTML_IN_CANVAS_ORIGIN_TRIAL_DIAGNOSTIC_HEADER = 'X-Agent-Portal-Origin-Trial';

function readProjectId() {
  let route = getRoute();
  return parseQuery(route.query).project || null;
}

function defaultTargetSection(projectId) {
  return projectId ? 'graph' : 'dashboard';
}

function readFocusPath() {
  return parseQuery(getRoute().query).focus || null;
}

function readTextureDebugMode() {
  return parseQuery(getRoute().query).texture || null;
}

export class SpatialLayout extends Symbiote {
  _projectId = null;
  _targetSection = null;
  _spatialLayout = null;
  _themeSnapshot = null;
  _controller = null;
  _panelHost = null;
  _htmlCanvasPanelHost = null;
  _domPanelWorkbench = null;
  _htmlCanvasRenderer = null;
  _threeXRAdapter = null;
  _threeXRRenderHost = null;
  _threeXRSessionController = null;
  _threeTextureBridge = null;
  _threeTextureResolver = null;
  _lastThreeXRError = null;
  _xrState = null;
  _activeHit = null;
  _support = { supported: false, fallback: 'dom-canvas' };
  _launchRecommendation = {
    canLaunch: false,
    mode: null,
    reason: 'pending',
    version: 'webxr-launch-recommendation-v1',
  };
  _launchGate = {
    canStart: false,
    blocked: true,
    reason: 'pending',
    blockingChecks: [],
    version: 'webxr-launch-gate-summary-v1',
  };
  _htmlCanvasSupport = { supported: false, preferredMode: null };
  _htmlCanvasDiagnostics = null;
  _originTrialHeaderStatus = {
    checked: false,
    present: false,
    diagnosticHeader: null,
    error: null,
  };
  _canvasPreviewResult = null;
  _geometrySummaries = [];
  _deepGraph = null;
  _textureDebugMode = createXRTextureDebugModeSummary();
  _activeGeometryPanelId = null;
  _gestureState = null;
  _lastTransactionId = null;
  _lastXrDiagnosticAt = 0;
  _panelBuildErrors = [];
  _diagnosticClientId = createStableXRDiagnosticClientId({
    prefix: 'spatial',
    globalThis: window,
  }).id;
  _refreshHandler = () => this._refresh();

  initCallback() {
    this._htmlCanvasRenderer = createXRHtmlCanvasRenderer({ globalThis });
    this._syncTextureDebugMode();
    this._threeXRAdapter = createXRThreeWebXRAdapter({ THREE });
    this._threeTextureResolver = createXRThreeHtmlCanvasTextureResolver({
      THREE,
      document,
      htmlCanvasRenderer: this._htmlCanvasRenderer,
    });
    this._threeTextureBridge = createXRThreePanelTextureBridge({
      htmlCanvasRenderer: this._htmlCanvasRenderer,
      getPanelElement: (panelId) => this._htmlCanvasPanelHost?.getPanelElement(panelId),
      requireTextureUpload: this._textureDebugMode.requireTextureUpload,
      textureResolver: this._threeTextureResolver.resolve,
    });
    this._threeXRRenderHost = createXRThreeRenderHost({
      THREE,
      adapter: this._threeXRAdapter,
      globalThis: window,
      hostElement: this,
      maxPixelRatio: 2,
      className: 'psl-xr-three-canvas',
    });
    this._threeXRSessionController = createXRThreeSessionController({
      globalThis,
      adapter: this._threeXRAdapter,
      onDiagnostic: (event, details) => {
        if (event === 'spatial-three-drag-end') {
          this._applyThreePoseTransaction(details);
        }
        this._postXRDiagnostic(event, {
          details,
          throttleMs: event === 'spatial-three-drag-miss' ? 500 : 0,
          error: details?.error || null,
        });
      },
    });
    this._controller = createXRSceneController({
      globalThis,
      referenceSpaceType: WEBXR_FEATURES.localFloor,
    });
    this._panelHost = createXRPanelHost({
      document,
      componentResolver: (name, node, panel) => this._resolveComponent(name, node, panel),
      propsResolver: (node, panel) => this._resolveProps(node, panel),
    });
    this._htmlCanvasPanelHost = createXRPanelHost({
      document,
      componentResolver: (name, node, panel) => this._resolveComponent(name, node, panel),
      propsResolver: (node, panel) => this._resolveProps(node, panel),
    });
    this._domPanelWorkbench = createXRDomPanelWorkbench({
      document,
      panelHost: this._panelHost,
      sourcePanelHost: this._htmlCanvasPanelHost,
      htmlCanvasRenderer: this._htmlCanvasRenderer,
      legacyMaterialVars: true,
      classNames: {
        panel: 'psl-panel',
        live: 'psl-panel-live',
        canvas: 'psl-panel-canvas',
        source: 'psl-xr-canvas-source',
        fallback: 'sn-xr-panel-fallback',
      },
    });
    this._htmlCanvasSupport = this._htmlCanvasRenderer.getSupport();
    this._htmlCanvasDiagnostics = this._htmlCanvasSupport.diagnostics;
    this._projectId = readProjectId();
    this._targetSection = defaultTargetSection(this._projectId);
    this.ref.sectionSelect.addEventListener('change', () => {
      this._targetSection = this.ref.sectionSelect.value || defaultTargetSection(this._projectId);
      this._renderProjection();
    });
    this.ref.scaleInput.addEventListener('input', () => this._renderProjection());
    this.ref.depthInput.addEventListener('input', () => this._renderProjection());
    this.ref.xrModeSelect.addEventListener('change', () => {
      this._launchRecommendation = this._createLaunchRecommendation();
      this._launchGate = this._createLaunchGate();
      this._renderStatus();
    });
    this.ref.enterButton.addEventListener('click', () => this._enterXR());
    this.ref.stage.addEventListener('pointerdown', (event) => this._startGesture(event));
    this.ref.stage.addEventListener('pointermove', (event) => {
      if (event.xrPanelPointer) return;
      this._updatePointer(event);
    });
    this.ref.stage.addEventListener('pointerup', (event) => this._finishGesture(event));
    this.ref.stage.addEventListener('pointercancel', (event) => this._cancelGesture(event));
    this.ref.stage.addEventListener('pointerleave', () => {
      if (this._gestureState) return;
      this._activeHit = null;
      this._activeGeometryPanelId = null;
      this._syncHitState();
      this._renderStatus();
      this._renderGeometryDiagnostics();
    });
    this.ref.geometry.addEventListener('pointerover', (event) => this._activateGeometryRow(event));
    this.ref.geometry.addEventListener('pointerout', (event) => this._deactivateGeometryRow(event));
    this._loadSupport();
    this._refreshOriginTrialHeaderStatus();
    this._refresh();
    window.addEventListener('hashchange', this._refreshHandler);
    document.addEventListener('agent-portal-project-runtime-updated', this._refreshHandler);
    events.addEventListener('skeleton-loaded', this._refreshHandler);
  }

  disconnectedCallback() {
    super.disconnectedCallback && super.disconnectedCallback();
    this._controller?.stop();
    window.removeEventListener('hashchange', this._refreshHandler);
    document.removeEventListener('agent-portal-project-runtime-updated', this._refreshHandler);
    events.removeEventListener('skeleton-loaded', this._refreshHandler);
  }

  async _loadSupport() {
    this._support = await getWebXRSupport(globalThis);
    this._syncXRModeOptions();
    this._launchRecommendation = this._createLaunchRecommendation();
    this._launchGate = this._createLaunchGate();
    this._postXRDiagnostic('spatial-support-detected');
    this._renderStatus();
  }

  async _refreshOriginTrialHeaderStatus() {
    this._originTrialHeaderStatus = await readXRHtmlCanvasOriginTrialHeaderStatus(location, {
      diagnosticHeader: HTML_IN_CANVAS_ORIGIN_TRIAL_DIAGNOSTIC_HEADER,
    });
    this._renderStatus();
    this._renderGeometryDiagnostics();
  }

  _refresh() {
    this._syncTextureDebugMode();
    let nextProjectId = readProjectId();
    if (nextProjectId !== this._projectId) {
      this._projectId = nextProjectId;
      this._targetSection = defaultTargetSection(this._projectId);
    }
    this._renderSectionOptions();
    this._renderProjection();
  }

  _syncTextureDebugMode() {
    let nextMode = createXRTextureDebugModeSummary({
      texture: readTextureDebugMode(),
    });
    let modeChanged = nextMode.mode !== this._textureDebugMode.mode;
    this._textureDebugMode = nextMode;
    if (modeChanged) this._syncThreeXRScene();
  }

  _renderSectionOptions() {
    let sections = getSectionsForScope(this._projectId)
      .filter((section) => section.id !== 'spatial')
      .filter((section) => Boolean(getPortalRuntimeLayout(section.id, this._projectId)));
    if (!sections.some((section) => section.id === this._targetSection)) {
      this._targetSection = sections[0]?.id || defaultTargetSection(this._projectId);
    }

    this.ref.sectionSelect.replaceChildren(...sections.map((section) => {
      let option = document.createElement('option');
      option.value = section.id;
      option.textContent = section.label || section.id;
      option.selected = section.id === this._targetSection;
      return option;
    }));
  }

  _renderProjection() {
    let root = getPortalRuntimeLayout(this._targetSection, this._projectId);
    this._themeSnapshot = createXRThemeSnapshot(document.documentElement, {
      themeScope: `section.${this._targetSection}`,
    });
    this._spatialLayout = root
      ? createXRSpatialScene(root, {
        themeScope: `section.${this._targetSection}`,
        userSpace: { eyeHeight: 1.62, comfortRadius: 2 },
        preview: { pixelsPerMeter: Number(this.ref.scaleInput.value || 118) },
      })
      : null;
    this._deepGraph = this._createDeepGraphProjection();
    this._xrState = this._controller?.setScene(this._spatialLayout, {
      themeSnapshot: this._themeSnapshot,
    }) || null;
    this._panelHost?.setScene(this._xrState?.scene || this._spatialLayout, {
      themeSnapshot: this._themeSnapshot,
    });
    this._htmlCanvasPanelHost?.setScene(this._xrState?.scene || this._spatialLayout, {
      themeSnapshot: this._themeSnapshot,
    });
    this._domPanelWorkbench?.setScene(this._xrState?.scene || this._spatialLayout, {
      themeSnapshot: this._themeSnapshot,
    });
    this._activeHit = this._activeHit && this._spatialLayout?.panels.some((panel) => panel.id === this._activeHit.panelId)
      ? this._activeHit
      : null;
    this._activeGeometryPanelId = this._activeGeometryPanelId && this._spatialLayout?.panels.some((panel) => panel.id === this._activeGeometryPanelId)
      ? this._activeGeometryPanelId
      : null;
    this._gestureState = null;

    this.ref.space.replaceChildren();
    this._geometrySummaries = [];
    this._panelBuildErrors = [];
    let previewRendered = false;
    this._canvasPreviewResult = null;
    for (let panel of this._xrState?.scene?.panels || this._spatialLayout?.panels || []) {
      let node = null;
      try {
        node = this._createPanelNode(panel, { renderCanvasPreview: !previewRendered });
        previewRendered = true;
      } catch (error) {
        this._panelBuildErrors.push({
          panelId: panel.id,
          component: panel.component || panel.panelType || 'panel',
          reason: error?.name || 'panel-build-failed',
          message: error?.message || '',
        });
        node = this._createPanelErrorNode(panel, error);
      }
      let preview = this._positionPanel(node, panel);
      this._geometrySummaries.push(createXRPanelGeometrySummary(panel, preview, {
        userSpace: this._spatialLayout?.userSpace,
      }));
      this.ref.space.append(node);
    }
    this._syncThreeXRScene();
    this._renderDeepGraphOverlay();
    this._launchGate = this._createLaunchGate();
    this._syncHitState();
    this._renderStatus();
    this._renderGeometryDiagnostics();
    this._postXRDiagnostic('spatial-projection-rendered', { throttleMs: 1200 });
  }

  _createPanelNode(panel, options = {}) {
    let result = this._domPanelWorkbench.mountPreviewPanel(panel, {
      renderCanvasPreview: options.renderCanvasPreview,
      activePanelId: this._activePanelId(),
    });
    if (!result.ok) throw result.error || new Error(result.reason || 'panel-build-failed');
    if (result.previewResult) this._canvasPreviewResult = result.previewResult;
    return result.node;
  }

  _createPanelErrorNode(panel, error) {
    return this._domPanelWorkbench.createErrorPanel(panel, error);
  }

  _renderDeepGraphOverlay() {
    if (!this._deepGraph?.preview || this._targetSection !== 'graph') return;
    let result = createXRDeepGraphPreviewOverlay(this._deepGraph.preview, {
      document,
      focusNodeId: this._deepGraph.diagnostics.focusNodeId,
      legacyCssVars: true,
      classNames: {
        overlay: 'psl-deep-graph',
        edge: 'psl-deep-edge',
        node: 'psl-deep-node',
      },
    });
    if (result.ok) this.ref.space.append(result.overlay);
  }

  _syncThreeXRScene() {
    let scene = this._xrState?.scene || this._spatialLayout;
    return this._threeXRRenderHost?.ensureTarget({
      scene,
      sceneOptions: {
        textureBridge: this._threeTextureBridge,
        textureOptions: { requireTextureUpload: this._textureDebugMode.requireTextureUpload },
        hideStrictTextureFailures: this._textureDebugMode.hideStrictTextureFailures,
      },
      stageElement: this.ref.stage,
      pixelRatio: window.devicePixelRatio,
    });
  }

  _ensureThreeXRRenderer() {
    return this._syncThreeXRScene();
  }

  _positionPanel(element, panel) {
    let scale = Number(this.ref.scaleInput.value || 118);
    let depth = Number(this.ref.depthInput.value || 120) / 120;
    let preview = createXRSpatialPreview(panel, this._spatialLayout, {
      pixelsPerMeter: scale,
      depthScale: depth,
    });

    element.style.setProperty('width', `${preview.width}px`);
    element.style.setProperty('height', `${preview.height}px`);
    element.style.setProperty('opacity', String(preview.opacity));
    element.style.setProperty('transform', preview.transform);
    return preview;
  }

  _updatePointer(event) {
    if (!this._spatialLayout) return;
    if (event?.xrPanelPointer || this._relayingPanelPointer) return;
    let ray = this._rayFromPointer(event);
    this._activeHit = hitTestXRPanels(ray, this._spatialLayout.panels);
    if (!this._activeHit) {
      this._activeHit = this._domFallbackHit(event);
    }
    let pointerEvent = createXRPointerEvent(this._activeHit, {
      source: 'mouse-fallback',
      primary: event.buttons === 1,
      ray,
    });
    this._relayingPanelPointer = true;
    try {
      this._panelHost?.dispatchPointerEvent(pointerEvent);
    } finally {
      this._relayingPanelPointer = false;
    }
    if (this._gestureState && pointerEvent) {
      this._gestureState = updateXRPanelGesture(this._gestureState, pointerEvent, {
        active: event.buttons === 1,
        mode: this._gestureState.mode,
      });
    }
    this._activeGeometryPanelId = null;
    this._syncHitState();
    this._renderStatus();
    this._renderGeometryDiagnostics();
  }

  _domFallbackHit(event) {
    let panelNode = event.target.closest?.('.psl-panel') ||
      (this._gestureState?.panelId
        ? [...this.ref.space.querySelectorAll('.psl-panel')].find((node) => node.dataset.panelId === this._gestureState.panelId)
        : null);
    if (!panelNode) return null;
    let panel = this._spatialLayout.panels.find((item) => item.id === panelNode.dataset.panelId);
    if (!panel) return null;
    return createXRPointerHitFromDomEvent(panel, panelNode, event);
  }

  _startGesture(event) {
    if (!this._spatialLayout) return;
    this._updatePointer(event);
    if (!this._activeHit) return;
    let panel = this._activeHit.panel;
    let frameTarget = hitTestXRPanelFrame(panel, this._activeHit.point, {
      defaultContentOperation: event.shiftKey ? 'resize' : 'move',
    });
    let pointerEvent = createXRPointerEvent(this._activeHit, {
      source: 'mouse-fallback',
      primary: true,
      ray: this._rayFromPointer(event),
    }, 'pointerdown');
    pointerEvent.frameTarget = frameTarget;
    this.ref.stage.setPointerCapture?.(event.pointerId);
    this._gestureState = createXRPanelGestureState({
      panel,
      layoutId: this._targetSection,
      mode: frameTarget.operation === 'resize' ? 'resize' : frameTarget.operation === 'move' ? 'move' : 'read-only',
      frameTarget,
      pointerEvent,
    });
    this._syncHitState();
    this._renderStatus();
    this._renderGeometryDiagnostics();
  }

  _finishGesture(event) {
    if (!this._gestureState) return;
    let transaction = createXRLayoutTransactionFromGesture(this._gestureState, {
      id: `tx:xr-layout:${this._targetSection}:${this._gestureState.nodeId}:${Date.now().toString(36)}`,
      targetProject: `agent-portal:${this._projectId || 'global'}`,
    });
    if (transaction) {
      this._lastTransactionId = transaction.id;
      document.dispatchEvent(createProjectTransactionEvent(this._projectId, transaction));
    }
    this._gestureState = null;
    this._releasePointerCapture(event);
    this._syncHitState();
    this._renderStatus();
    this._renderGeometryDiagnostics();
  }

  _cancelGesture(event) {
    this._gestureState = null;
    this._releasePointerCapture(event);
  }

  _releasePointerCapture(event) {
    if (event?.pointerId != null && this.ref.stage.hasPointerCapture?.(event.pointerId)) {
      this.ref.stage.releasePointerCapture?.(event.pointerId);
    }
  }

  _applyThreePoseTransaction(details = {}) {
    let transaction = createXRLayoutTransactionFromPanelPose(details, {
      id: `tx:xr-pose:${this._targetSection}:${details.panelId || 'panel'}:${Date.now().toString(36)}`,
      layoutId: this._targetSection,
      targetProject: `agent-portal:${this._projectId || 'global'}`,
    });
    if (!transaction) return;
    this._lastTransactionId = transaction.id;
    document.dispatchEvent(createProjectTransactionEvent(this._projectId, transaction));
    this._renderStatus();
    this._renderGeometryDiagnostics();
  }

  _syncHitState() {
    let activePanelId = this._activePanelId();
    for (let node of this.ref.space.querySelectorAll('.psl-panel')) {
      node.dataset.hit = String(activePanelId === node.dataset.panelId);
      node.dataset.gesture = this._gestureState?.panelId === node.dataset.panelId ? this._gestureState.status : 'read-only';
    }
  }

  _activePanelId() {
    return this._activeGeometryPanelId || this._activeHit?.panelId || null;
  }

  _rayFromPointer(event) {
    return createXRPointerRayFromDomEvent(event, this.ref.stage);
  }

  _renderStatus() {
    let panels = this._spatialLayout?.panels || [];
    let support = this._support.supported ? 'available' : this._support.fallback;
    let controllerState = this._controller?.getState();
    let rendererState = this._htmlCanvasRenderer?.getState();
    let panelHostState = this._panelHost?.getState();
    let threeSessionDiagnostics = this._threeXRSessionController?.getDiagnostics?.() || {};
    let threeDiagnostics = threeSessionDiagnostics.adapter ||
      this._threeXRAdapter?.getDiagnostics?.() ||
      this._threeXRAdapter?.getState?.() ||
      {};
    let htmlDiagnostics = this._htmlCanvasSupport.diagnostics || this._htmlCanvasDiagnostics || {};
    let launch = this._launchRecommendation || this._createLaunchRecommendation();
    let launchGate = this._launchGate || this._createLaunchGate();
    let textureGate = this._createTextureGate();
    let sceneQuality = this._createSceneQuality();
    let readiness = this._createReadiness({ launchGate, texture: textureGate, sceneQuality });
    let visualAudit = this._createVisualAudit();
    let visualReadiness = this._createVisualReadiness({ visual: visualAudit });
    let interactionReadiness = this._createInteractionReadiness({ texture: textureGate });
    let layerFrame = null;
    let summary = createXRSpatialWorkbenchSummary({
      source: this._targetSection,
      panels,
      scene: this._spatialLayout,
      coordinateSystem: this._spatialLayout?.coordinateSystem,
      controllerState,
      rendererState,
      panelHostState,
      threeSessionDiagnostics,
      threeDiagnostics,
      threeAdapterName: this._threeXRAdapter?.name,
      htmlCanvasSupport: this._htmlCanvasSupport,
      htmlCanvasDiagnostics: this._htmlCanvasDiagnostics,
      themeSnapshot: this._themeSnapshot,
      support: this._support,
      launch,
      launchGate,
      textureGate,
      sceneQuality,
      readiness,
      layerFrame,
      geometrySummaries: this._geometrySummaries,
      deepGraph: this._deepGraph,
      panelBuildErrors: this._panelBuildErrors,
      canvasPreviewResult: this._canvasPreviewResult,
      activeHit: this._activeHit,
      gestureState: this._gestureState,
      lastTransactionId: this._lastTransactionId,
      error: this._lastThreeXRError,
    });
    let hit = summary.pointer
      ? `${summary.pointer.panelId} ${summary.pointer.x.toFixed(2)}, ${summary.pointer.y.toFixed(2)}`
      : 'none';
    this.ref.enterButton.disabled = !launchGate.canStart;
    this.ref.enterButton.dataset.available = String(Boolean(launchGate.canStart));
    this.ref.enterButton.title = launchGate.canStart
      ? `Start ${launch.mode}`
      : `XR unavailable: ${launchGate.reason}`;

    this.ref.status.replaceChildren(
      this._statusItem('Source', summary.source || '-'),
      this._statusItem('Panels', String(summary.panels.total)),
      this._statusItem('Panels live', `${summary.panels.live}/${summary.panels.total}`),
      this._statusItem('Deep graph', summary.deepGraph
        ? `${summary.deepGraph.nodeCount} nodes / ${summary.deepGraph.edgeCount} edges`
        : '-'),
      this._statusItem('Deep preview', summary.deepGraph?.previewStatus
        ? `${summary.deepGraph.previewStatus} ${summary.deepGraph.previewNodes.visible}/${summary.deepGraph.previewNodes.source} nodes, ${summary.deepGraph.previewEdges.visible}/${summary.deepGraph.previewEdges.source} edges`
        : '-'),
      this._statusItem('Deep connected', summary.deepGraph
        ? `${summary.deepGraph.connectedNodeCount}/${summary.deepGraph.nodeCount}`
        : '-'),
      this._statusItem('Deep edge types', summary.deepGraph
        ? Object.entries(summary.deepGraph.edgeTypes || {}).map(([type, count]) => `${type}:${count}`).join(', ') || '-'
        : '-'),
      this._statusItem('Deep focus', summary.deepGraph?.focusNodeId || '-'),
      this._statusItem('Deep focus degree', summary.deepGraph?.focus
        ? `${summary.deepGraph.focus.incoming} in / ${summary.deepGraph.focus.outgoing} out`
        : '-'),
      this._statusItem('Deep focus preview', summary.deepGraph?.previewFocus
        ? `${summary.deepGraph.previewFocus.visible ? 'visible' : 'hidden'} ${summary.deepGraph.previewFocus.edges.visible}/${summary.deepGraph.previewFocus.edges.source} edges`
        : '-'),
      this._statusItem('Space', summary.space || '-'),
      this._statusItem('Mode', summary.mode),
      this._statusItem('Renderer', summary.renderer),
      this._statusItem('XR scene adapter', summary.three.adapter || '-'),
      this._statusItem('Three panels', String(summary.three.panels)),
      this._statusItem('Three hits', String(summary.three.hits)),
      this._statusItem('Three misses', String(summary.three.misses)),
      this._statusItem('XR ray', summary.three.raySource || '-'),
      this._statusItem('XR drag misses', String(summary.three.dragMisses)),
      this._statusItem('XR hover frame', this._formatFrameTarget(summary.three.hover?.frameTarget)),
      this._statusItem('XR drag frame', this._formatFrameTarget(summary.three.drag?.frameTarget)),
      this._statusItem('XR drag op', summary.three.drag?.resize?.operation || summary.three.drag?.frameTarget?.operation || '-'),
      this._statusItem('XR drag handle', summary.three.drag?.resize?.handle || summary.three.drag?.frameTarget?.handle || '-'),
      this._statusItem('XR drag size', this._formatMeters(summary.three.drag?.size)),
      this._statusItem('XR resize size', this._formatMeters(summary.three.drag?.resize?.size)),
      this._statusItem('HTML Canvas', htmlDiagnostics.supported ? 'supported' : htmlDiagnostics.recommendation || 'unsupported'),
      this._statusItem('HTML Canvas availability', summary.htmlCanvas.availability || '-'),
      this._statusItem('HTML Canvas flag', htmlDiagnostics.originTrial?.flagUrl || '-'),
      this._statusItem('HTML Canvas origin trial header', this._originTrialHeaderStatus.checked
        ? (this._originTrialHeaderStatus.present ? 'present' : this._originTrialHeaderStatus.error || 'missing')
        : 'checking'),
      this._statusItem('HTML Canvas origin trial route', this._originTrialHeaderStatus.diagnosticHeader || '-'),
      this._statusItem('HTML Canvas texture upload', summary.htmlCanvas.textureUploadAvailable ? 'available' : 'missing'),
      this._statusItem('Canvas preview', summary.canvasPreview?.rendered ? summary.canvasPreview.panelId : summary.canvasPreview?.reason || '-'),
      this._statusItem('XR texture mode', textureGate.debugMode?.mode || this._textureDebugMode.mode),
      this._statusItem('XR texture gate', textureGate.blocked ? `blocked:${textureGate.reason}` : 'ready'),
      this._statusItem('XR texture ready', `${textureGate.ready}/${textureGate.total}`),
      this._statusItem('XR texture stage', textureGate.stage || '-'),
      this._statusItem('XR texture API', textureGate.requiredApi?.length ? textureGate.requiredApi.join(', ') : '-'),
      this._statusItem('XR visual readiness', `${visualReadiness.status}:${visualReadiness.reason}`),
      this._statusItem('XR visual checks', visualReadiness.checks.filter((check) => check.status !== 'pass').map((check) => check.id).join(', ') || 'ready'),
      this._statusItem('XR interaction readiness', `${interactionReadiness.status}:${interactionReadiness.reason}`),
      this._statusItem('XR interaction checks', interactionReadiness.issueCodes.length ? interactionReadiness.issueCodes.join(', ') : 'ready'),
      this._statusItem('XR scene quality', sceneQuality.status || '-'),
      this._statusItem('XR readiness', readiness.status === 'blocked' ? `blocked:${readiness.reason}` : readiness.status),
      this._statusItem('XR readiness checks', readiness.blockingChecks?.length ? readiness.blockingChecks.map((check) => check.id).join(', ') : '-'),
      this._statusItem('XR comfort', summary.geometry.comfortWarnings ? `${summary.geometry.comfortWarnings} warnings` : 'comfortable'),
      this._statusItem('XR adjusted', String(summary.geometry.adjustedPanels)),
      this._statusItem('XR facing', summary.geometry.facingWarnings ? `${summary.geometry.facingWarnings} warnings` : 'aligned'),
      this._statusItem('XR rotated', String(summary.geometry.rotatedPanels)),
      this._statusItem('Panel errors', String(summary.panels.errors)),
      this._statusItem('Theme', summary.theme.scope || '-'),
      this._statusItem('Tokens', `${summary.theme.resolvedTokens}/${summary.theme.totalTokens}`),
      this._statusItem('XR', summary.support.status),
      this._statusItem('XR launch', launch.canLaunch ? launch.mode : launch.reason),
      this._statusItem('XR gate', launchGate.blocked ? `blocked:${launchGate.reason}` : 'ready'),
      this._statusItem('XR gate checks', launchGate.blockingChecks?.length ? launchGate.blockingChecks.map((check) => check.id).join(', ') : '-'),
      this._statusItem('XR error', summary.error || '-'),
      this._statusItem('Pointer', hit),
      this._statusItem('Gesture', summary.gesture.status),
      this._statusItem('Last tx', summary.lastTransactionId || '-'),
    );
  }

  _resolveComponent(name, node, panel) {
    let requested = node?.component || panel?.component || name;
    let definition = panelTypes[requested] || panelTypes[panel?.panelType] || panelTypes[node?.panelType];
    return definition?.component || requested;
  }

  _resolveProps(node, panel) {
    return {
      ...(panel?.state || {}),
      ...(node?.panelState || {}),
      ...(node?.props || {}),
    };
  }

  async _enterXR() {
    this._postXRDiagnostic('spatial-enter-clicked', {
      details: {
        launch: this._launchRecommendation,
        launchGate: this._launchGate,
        controller: this._createSceneDiagnostics(),
      },
    });
    try {
      if (!this._spatialLayout) {
        this._renderProjection();
      }
      this._launchRecommendation = this._createLaunchRecommendation();
      this._launchGate = this._createLaunchGate({ requireUserActivation: true });
      if (!this._launchGate.canStart) {
        this._postXRDiagnostic('spatial-session-blocked', {
          details: {
            launchGate: this._launchGate,
          },
          error: this._launchGate.reason,
        });
        this._renderStatus();
        return;
      }
      let mode = this._launchRecommendation.mode || WEBXR_MODES.immersiveVr;
      let threeResult = await this._enterThreeXR(mode);
      this._postXRDiagnostic(threeResult.ok ? 'spatial-three-session-result' : 'spatial-three-session-failed', {
        details: {
          resultOk: Boolean(threeResult.ok),
          handled: Boolean(threeResult.handled),
          reason: threeResult.reason || null,
          controller: this._createSceneDiagnostics(),
        },
        error: threeResult.ok ? null : threeResult.reason || 'three-session-failed',
      });
      if (!threeResult.handled) {
        this._launchRecommendation = {
          ...this._launchRecommendation,
          canLaunch: false,
          reason: threeResult.reason || 'three-webxr-unavailable',
        };
        this._postXRDiagnostic('spatial-production-xr-blocked', {
          details: {
            requestedMode: mode,
            reason: threeResult.reason || 'three-webxr-unavailable',
            controller: this._createSceneDiagnostics(),
          },
          error: threeResult.reason || 'three-webxr-unavailable',
        });
      }
      if (threeResult.ok) {
        window.setTimeout(() => {
          this._postXRDiagnostic('spatial-session-frame-check', {
            details: {
              controller: this._createSceneDiagnostics(),
            },
          });
        }, 1600);
      }
      this._postXRDiagnostic(threeResult.ok ? 'spatial-session-started' : 'spatial-session-failed', {
        details: {
          resultOk: Boolean(threeResult.ok),
          reason: threeResult.reason || null,
          controller: this._createSceneDiagnostics(),
        },
      });
      this._renderStatus();
    } catch (error) {
      this._lastThreeXRError = error?.name || 'spatial-enter-failed';
      this._postXRDiagnostic('spatial-enter-failed', {
        details: {
          controller: this._createSceneDiagnostics(),
          message: error?.message || '',
        },
        error: this._lastThreeXRError,
      });
      this._renderStatus();
    }
  }

  async _enterThreeXR(mode) {
    let target = this._ensureThreeXRRenderer();
    let sessionOptions = createXRThreeSessionOptions(mode, {
      domOverlayRoot: this,
    });
    let result = await this._threeXRSessionController.start(mode, {
      target,
      ...sessionOptions,
    });
    this._lastThreeXRError = result.ok ? null : result.reason || null;
    return result;
  }

  _createSceneDiagnostics(layerTarget = {}) {
    let state = this._controller?.getState?.() || this._xrState || {};
    let diagnostics = this._controller?.getDiagnostics
      ? this._controller.getDiagnostics(layerTarget)
      : createXRSceneDiagnostics(state, layerTarget);
    let panelHostState = this._panelHost?.getState?.() || {};
    let rendererState = this._htmlCanvasRenderer?.getState?.() || {};
    return {
      ...diagnostics,
      panelHost: panelHostState,
      htmlCanvasPanelHost: this._htmlCanvasPanelHost?.getState?.() || {},
      renderer: rendererState,
      threeXR: this._threeXRSessionController?.getDiagnostics?.() ||
        this._threeXRAdapter?.getDiagnostics?.() ||
        this._threeXRAdapter?.getState?.() ||
        null,
      threeTextureBridge: this._threeTextureBridge?.getState?.() || null,
      threeTextureResolver: this._threeTextureResolver?.getState?.() || null,
      threeRenderHost: this._threeXRRenderHost?.getDiagnostics?.() || null,
      htmlCanvas: this._createHtmlCanvasDiagnosticsPayload(),
      panelBuildErrors: this._panelBuildErrors,
      geometryRows: this._geometrySummaries.length,
      deepGraph: this._deepGraph?.diagnostics || null,
      deepGraphPreview: this._deepGraph?.preview
        ? {
          version: this._deepGraph.preview.version,
          nodes: this._deepGraph.preview.nodes.length,
          edges: this._deepGraph.preview.edges.length,
          source: this._deepGraph.preview.source,
          summary: this._deepGraph.previewSummary || null,
        }
        : null,
    };
  }

  _createDeepGraphProjection() {
    if (this._targetSection !== 'graph') return null;
    if (!state.skeleton || !skeletonMatchesProject(state.skeleton, this._projectId)) return null;
    try {
      return createPortalXRDeepGraphScene(state.skeleton, {
        projectId: this._projectId,
        focusPath: readFocusPath(),
        themeScope: 'section.graph',
        pixelsPerMeter: Number(this.ref.scaleInput.value || 118),
        depthScale: Number(this.ref.depthInput.value || 120) / 120,
        eyeHeight: this._spatialLayout?.userSpace?.eyeHeight,
      });
    } catch (error) {
      this._panelBuildErrors.push({
        panelId: 'deep-graph',
        component: 'xr-deep-graph',
        reason: error?.name || 'deep-graph-build-failed',
        message: error?.message || '',
      });
      return null;
    }
  }

  _postXRDiagnostic(event, options = {}) {
    let throttleMs = Number(options.throttleMs || 0);
    let now = Date.now();
    if (throttleMs && now - this._lastXrDiagnosticAt < throttleMs) return;
    this._lastXrDiagnosticAt = now;
    let launch = this._launchRecommendation || this._createLaunchRecommendation();
    let launchGate = this._launchGate || this._createLaunchGate();
    let texture = this._createTextureGate();
    let sceneQuality = this._createSceneQuality();
    let readiness = this._createReadiness({ launchGate, texture, sceneQuality });
    let visual = this._createVisualAudit();
    let visualReadiness = this._createVisualReadiness({ visual });
    let interactionReadiness = this._createInteractionReadiness({ texture });
    let details = options.details || {
      controller: this._createSceneDiagnostics(),
    };
    let payload = createXRWorkbenchDiagnosticPayload({
      event,
      pageUrl: location.href,
      secureContext: window.isSecureContext,
      navigatorXr: Boolean(navigator.xr),
      modes: this._support?.modes || null,
      launch,
      clientId: this._diagnosticClientId,
      session: this._createSessionDiagnosticPayload(),
      error: options.error || null,
      details,
      htmlCanvas: this._createHtmlCanvasDiagnosticsPayload(),
      texture,
      launchGate,
      sceneQuality,
      readiness,
      visual: options.visual || visual,
      visualReadiness: options.visualReadiness || visualReadiness,
      interactionReadiness: options.interactionReadiness || interactionReadiness,
    });
    fetch('/api/xr-diagnostics/log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      keepalive: true,
    }).catch(() => {});
  }

  _statusItem(label, value) {
    let item = document.createElement('span');
    item.textContent = `${label}: ${value}`;
    return item;
  }

  _formatFrameTarget(frameTarget) {
    if (!frameTarget) return '-';
    let operation = frameTarget.operation || 'none';
    let zone = frameTarget.zone || frameTarget.handle || frameTarget.action || '-';
    let panelId = frameTarget.panelId || '-';
    return `${panelId}:${operation}/${zone}`;
  }

  _formatMeters(values) {
    if (!Array.isArray(values) || !values.length) return '-';
    return values
      .filter((value) => Number.isFinite(Number(value)))
      .map((value) => `${Number(value).toFixed(2)}m`)
      .join(' x ') || '-';
  }

  _createLaunchRecommendation() {
    let selectedMode = this.ref.xrModeSelect?.value || 'auto';
    let preferredMode = selectedMode === 'auto' ? null : selectedMode;
    return createWebXRLaunchRecommendation(this._support, {
      preferredMode,
    });
  }

  _createTextureGate() {
    let panels = this._spatialLayout?.panels || [];
    let bridgeState = this._threeTextureBridge?.getState?.() || {};
    let resolverState = this._threeTextureResolver?.getState?.() || null;
    return createXRTextureGateSummary({
      strict: this._textureDebugMode.strict,
      panelCount: panels.length,
      support: this._htmlCanvasSupport || {
        diagnostics: this._htmlCanvasDiagnostics || {},
      },
      debugMode: this._textureDebugMode,
      reason: this._textureDebugMode.reason,
      records: bridgeState.records || [],
      bridgeVersion: bridgeState.version || null,
      resolverState,
    });
  }

  _createSceneQuality() {
    return createXRSceneQualitySummary(this._xrState?.scene || this._spatialLayout || { panels: [] }, {
      eyeHeight: this._spatialLayout?.userSpace?.eyeHeight,
    });
  }

  _createSessionHealth() {
    let threeDiagnostics = this._threeXRSessionController?.getDiagnostics?.() ||
      this._threeXRAdapter?.getDiagnostics?.() ||
      this._threeXRAdapter?.getState?.() ||
      {};
    let telemetry = createXRThreeSessionTelemetrySnapshot(threeDiagnostics);
    return createXRThreeSessionHealthSummary(telemetry);
  }

  _createSessionDiagnosticPayload() {
    let threeDiagnostics = this._threeXRSessionController?.getDiagnostics?.() ||
      this._threeXRAdapter?.getDiagnostics?.() ||
      this._threeXRAdapter?.getState?.() ||
      {};
    let telemetry = createXRThreeSessionTelemetrySnapshot(threeDiagnostics);
    let health = createXRThreeSessionHealthSummary(telemetry);
    let controllerState = this._controller?.getState?.() || {};
    return {
      ...telemetry,
      health,
      controllerRenderMode: controllerState.renderMode || null,
      controllerMode: controllerState.mode || null,
    };
  }

  _createVisualAudit() {
    let scene = this._xrState?.scene || this._spatialLayout || { panels: [] };
    let threeDiagnostics = this._threeXRSessionController?.getDiagnostics?.() ||
      this._threeXRAdapter?.getDiagnostics?.() ||
      this._threeXRAdapter?.getState?.() ||
      {};
    let telemetry = createXRThreeSessionTelemetrySnapshot(threeDiagnostics);
    return createXRVisualTestSummary(scene, {
      eyeHeight: scene.userSpace?.eyeHeight,
      telemetry,
      adapter: this._threeXRAdapter?.getState?.() || threeDiagnostics.adapter || null,
    });
  }

  _createVisualReadiness(options = {}) {
    return createXRVisualAgentReadinessSummary({
      visual: options.visual || this._createVisualAudit(),
      expectedStatus: 'pass',
      pageErrors: this._panelBuildErrors.map((error) => error.reason || 'panel-build-failed'),
      requireBrowserArtifacts: false,
    });
  }

  _createInteractionReadiness(options = {}) {
    let threeDiagnostics = this._threeXRSessionController?.getDiagnostics?.() ||
      this._threeXRAdapter?.getDiagnostics?.() ||
      this._threeXRAdapter?.getState?.() ||
      {};
    let telemetry = createXRThreeSessionTelemetrySnapshot(threeDiagnostics);
    return createXRThreeInteractionReadinessSummary(telemetry, {
      texture: options.texture || this._createTextureGate(),
      expectedPanelCount: this._spatialLayout?.panels?.length || 0,
    });
  }

  _createReadiness(overrides = {}) {
    let launchGate = overrides.launchGate || this._launchGate || this._createLaunchGate();
    let texture = overrides.texture || this._createTextureGate();
    let sceneQuality = overrides.sceneQuality || this._createSceneQuality();
    let sessionHealth = this._createSessionHealth();
    return createXRReadinessSummary({
      launchGate,
      htmlCanvas: this._createHtmlCanvasDiagnosticsPayload(),
      texture,
      sceneQuality,
      sessionHealth,
      sessionActive: this._threeXRSessionController?.getDiagnostics?.().active === true ||
        this._controller?.getState?.().renderMode === 'webxr-session',
      mode: launchGate.mode || this._launchRecommendation?.mode || null,
    });
  }

  _createHtmlCanvasDiagnosticsPayload() {
    let htmlCanvas = this._htmlCanvasSupport?.diagnostics || this._htmlCanvasDiagnostics || null;
    if (!htmlCanvas) return null;
    return {
      ...htmlCanvas,
      responseHeader: {
        checked: this._originTrialHeaderStatus.checked,
        originTrialPresent: this._originTrialHeaderStatus.present,
        diagnosticHeader: this._originTrialHeaderStatus.diagnosticHeader,
        error: this._originTrialHeaderStatus.error,
      },
    };
  }

  _createLaunchGate(options = {}) {
    let launch = this._launchRecommendation || this._createLaunchRecommendation();
    return createWebXRLaunchGateSummary(this._support, {
      preferredMode: this.ref.xrModeSelect?.value === 'auto' ? null : this.ref.xrModeSelect?.value,
      selectedMode: launch.mode,
      launch,
      userActivation: window.navigator?.userActivation || null,
      requireUserActivation: options.requireUserActivation === true,
    });
  }

  _syncXRModeOptions() {
    let select = this.ref.xrModeSelect;
    if (!select) return;
    let modes = this._support?.modes || {};
    for (let option of select.options) {
      if (option.value === 'auto') {
        option.disabled = false;
      } else if (option.value === WEBXR_MODES.immersiveAr) {
        option.disabled = !modes.immersiveAr;
      } else if (option.value === WEBXR_MODES.immersiveVr) {
        option.disabled = !modes.immersiveVr;
      }
    }
    if (select.value !== 'auto' && select.selectedOptions[0]?.disabled) {
      select.value = 'auto';
    }
  }

  _renderGeometryDiagnostics() {
    let activePanelId = this._activePanelId();
    if (!this._geometrySummaries.length) {
      this.ref.geometry.replaceChildren();
      return;
    }

    let header = document.createElement('div');
    header.className = 'psl-geometry-header';
    header.textContent = 'Geometry';

    let htmlCanvas = this._renderHtmlCanvasDiagnostics();

    let rows = this._geometrySummaries.map((summary) => {
      let row = document.createElement('button');
      row.className = 'psl-geometry-row';
      row.type = 'button';
      row.dataset.panelId = summary.panelId;
      row.dataset.active = String(activePanelId === summary.panelId);
      row.dataset.gesture = this._gestureState?.panelId === summary.panelId ? this._gestureState.status : 'read-only';
      row.setAttribute('aria-pressed', String(activePanelId === summary.panelId));
      row.replaceChildren(
        this._geometryCell(summary.component || summary.panelId, 'component'),
        this._geometryCell(summary.sizeSource, 'source'),
        this._geometryCell(this._formatRect(summary.relativeRect), 'relative rect'),
        this._geometryCell(this._formatMeters(summary.meters), 'meters'),
        this._geometryCell(this._formatPixels(summary.previewPixels), 'preview pixels'),
        this._geometryCell(this._formatViewport(summary.contentViewport), 'content viewport'),
        this._geometryCell(this._formatQuality(summary.textureQuality), 'texture quality'),
        this._geometryCell(this._formatComfort(summary.poseComfort), 'pose comfort'),
        this._geometryCell(this._formatAdjustment(summary.poseAdjustment), 'adjustment'),
        this._geometryCell(this._formatFacing(summary.facing), 'facing'),
        this._geometryCell(this._formatAdjustment(summary.rotationAdjustment), 'rotation adjustment'),
      );
      return row;
    });

    this.ref.geometry.replaceChildren(header, htmlCanvas, ...rows);
  }

  _renderHtmlCanvasDiagnostics() {
    let diagnostics = this._htmlCanvasSupport.diagnostics || this._htmlCanvasDiagnostics || {};
    let row = document.createElement('div');
    row.className = 'psl-html-canvas';
    row.replaceChildren(
      this._htmlCanvasChip(diagnostics.availability || diagnostics.recommendation || 'unknown', diagnostics.supported),
      this._htmlCanvasChip('layoutsubtree', diagnostics.apis?.layoutsubtree),
      this._htmlCanvasChip('drawElementImage', diagnostics.apis?.drawElementImage),
      this._htmlCanvasChip('paint', diagnostics.apis?.paintEvent),
      this._htmlCanvasChip('WebGL texture', diagnostics.apis?.webglTextureUpload),
      this._htmlCanvasChip('WebGPU texture', diagnostics.apis?.webgpuTextureCopy),
      this._htmlCanvasChip('Origin-Trial header', this._originTrialHeaderStatus.present),
      this._htmlCanvasChip('Preview', this._canvasPreviewResult?.rendered),
    );
    row.dataset.supported = String(Boolean(diagnostics.supported));
    row.dataset.recommendation = diagnostics.recommendation || 'unknown';
    return row;
  }

  _htmlCanvasChip(label, active) {
    let chip = document.createElement('span');
    chip.dataset.active = String(Boolean(active));
    chip.textContent = `${label}: ${active ? 'yes' : 'no'}`;
    return chip;
  }

  _activateGeometryRow(event) {
    let row = event.target.closest?.('.psl-geometry-row');
    if (!row || row.dataset.panelId === this._activeGeometryPanelId) return;
    this._activeGeometryPanelId = row.dataset.panelId;
    this._syncHitState();
    this._syncGeometryRows();
  }

  _deactivateGeometryRow(event) {
    let row = event.target.closest?.('.psl-geometry-row');
    if (!row || row.contains(event.relatedTarget)) return;
    this._activeGeometryPanelId = null;
    this._syncHitState();
    this._syncGeometryRows();
  }

  _syncGeometryRows() {
    let activePanelId = this._activePanelId();
    for (let row of this.ref.geometry.querySelectorAll('.psl-geometry-row')) {
      let active = activePanelId === row.dataset.panelId;
      row.dataset.active = String(active);
      row.setAttribute('aria-pressed', String(active));
    }
  }

  _geometryCell(value, label) {
    let cell = document.createElement('span');
    cell.dataset.label = label;
    cell.textContent = value || '-';
    return cell;
  }

  _formatRect(rect) {
    if (!rect) return '-';
    return `${this._formatNumber(rect.x)},${this._formatNumber(rect.y)} ${this._formatNumber(rect.width)}x${this._formatNumber(rect.height)}`;
  }

  _formatMeters(meters) {
    if (!meters) return '-';
    return `${this._formatNumber(meters.width)}m x ${this._formatNumber(meters.height)}m`;
  }

  _formatPixels(previewPixels) {
    if (!previewPixels) return '-';
    return `${Math.round(previewPixels.width)}x${Math.round(previewPixels.height)}px`;
  }

  _formatViewport(viewport) {
    if (!viewport) return '-';
    return `${Math.round(viewport.width)}x${Math.round(viewport.height)} @ ${this._formatNumber(viewport.scale)}`;
  }

  _formatQuality(quality) {
    if (!quality) return '-';
    return `${quality.status} ${Math.round(quality.pixelsPerMeter?.min || 0)}px/m`;
  }

  _formatComfort(comfort) {
    if (!comfort) return '-';
    let horizontal = this._formatNumber(comfort.angles?.horizontal);
    let vertical = this._formatNumber(comfort.angles?.vertical);
    return `${comfort.status} ${this._formatNumber(comfort.distance)}m ${horizontal}deg/${vertical}deg`;
  }

  _formatAdjustment(adjustment) {
    if (!adjustment) return '-';
    return adjustment.adjusted ? adjustment.reason || 'adjusted' : 'none';
  }

  _formatFacing(facing) {
    if (!facing) return '-';
    return `${facing.status} ${this._formatNumber(facing.delta?.yaw)}deg`;
  }

  _formatNumber(value) {
    let number = Number(value);
    if (!Number.isFinite(number)) return '-';
    return number.toFixed(2).replace(/\.?0+$/, '');
  }
}

SpatialLayout.template = template;
SpatialLayout.rootStyles = cssShared + cssLocal;
SpatialLayout.reg('pg-spatial-layout');

export default SpatialLayout;
