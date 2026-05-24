import { Symbiote } from '@symbiotejs/symbiote';
import { sharedUiStyles as cssShared, getRoute, parseQuery } from 'symbiote-node/ui';
import {
  WEBXR_FEATURES,
  WEBXR_MODES,
  createXRHtmlCanvasRenderer,
  createXRPanelHost,
  createXRPanelGeometrySummary,
  createXRSceneController,
  createXRSpatialPreview,
  createXRSpatialScene,
  createXRThemeSnapshot,
  createXRPointerEvent,
  createXRPointerHitFromDomEvent,
  createXRPanelGestureState,
  updateXRPanelGesture,
  createXRLayoutTransactionFromGesture,
  getWebXRSupport,
  hitTestXRPanels,
} from 'symbiote-node/xr';
import { createProjectTransactionEvent } from '../../services/project-transaction-messages.js';
import { getSectionsForScope, panelTypes } from '../../router-registry.js';
import { getPortalRuntimeLayout } from '../../services/portal-runtime.js';
import cssLocal from './SpatialLayout.css.js';
import template from './SpatialLayout.tpl.js';

function readProjectId() {
  let route = getRoute();
  return parseQuery(route.query).project || null;
}

function defaultTargetSection(projectId) {
  return projectId ? 'graph' : 'dashboard';
}

export class SpatialLayout extends Symbiote {
  _projectId = null;
  _targetSection = null;
  _spatialLayout = null;
  _themeSnapshot = null;
  _controller = null;
  _panelHost = null;
  _htmlCanvasRenderer = null;
  _xrState = null;
  _activeHit = null;
  _support = { supported: false, fallback: 'dom-canvas' };
  _htmlCanvasSupport = { supported: false, preferredMode: null };
  _htmlCanvasDiagnostics = null;
  _canvasPreviewResult = null;
  _geometrySummaries = [];
  _activeGeometryPanelId = null;
  _gestureState = null;
  _lastTransactionId = null;
  _refreshHandler = () => this._refresh();

  initCallback() {
    this._controller = createXRSceneController({
      globalThis,
      referenceSpaceType: WEBXR_FEATURES.localFloor,
    });
    this._panelHost = createXRPanelHost({
      document,
      componentResolver: (name, node, panel) => this._resolveComponent(name, node, panel),
      propsResolver: (node, panel) => this._resolveProps(node, panel),
    });
    this._htmlCanvasRenderer = createXRHtmlCanvasRenderer({ globalThis });
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
    this.ref.enterButton.addEventListener('click', () => this._enterXR());
    this.ref.stage.addEventListener('pointerdown', (event) => this._startGesture(event));
    this.ref.stage.addEventListener('pointermove', (event) => this._updatePointer(event));
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
    this._refresh();
    window.addEventListener('hashchange', this._refreshHandler);
    document.addEventListener('agent-portal-project-runtime-updated', this._refreshHandler);
  }

  disconnectedCallback() {
    super.disconnectedCallback && super.disconnectedCallback();
    this._controller?.stop();
    window.removeEventListener('hashchange', this._refreshHandler);
    document.removeEventListener('agent-portal-project-runtime-updated', this._refreshHandler);
  }

  async _loadSupport() {
    this._support = await getWebXRSupport(globalThis);
    this._renderStatus();
  }

  _refresh() {
    let nextProjectId = readProjectId();
    if (nextProjectId !== this._projectId) {
      this._projectId = nextProjectId;
      this._targetSection = defaultTargetSection(this._projectId);
    }
    this._renderSectionOptions();
    this._renderProjection();
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
    this._xrState = this._controller?.setScene(this._spatialLayout, {
      themeSnapshot: this._themeSnapshot,
    }) || null;
    this._panelHost?.setScene(this._xrState?.scene || this._spatialLayout, {
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
    let previewRendered = false;
    this._canvasPreviewResult = null;
    for (let panel of this._xrState?.scene?.panels || this._spatialLayout?.panels || []) {
      let node = this._createPanelNode(panel, { renderCanvasPreview: !previewRendered });
      previewRendered = true;
      let preview = this._positionPanel(node, panel);
      this._geometrySummaries.push(createXRPanelGeometrySummary(panel, preview));
      this.ref.space.append(node);
    }
    this._syncHitState();
    this._renderStatus();
    this._renderGeometryDiagnostics();
  }

  _createPanelNode(panel, options = {}) {
    let node = document.createElement('section');
    node.className = 'psl-panel';
    node.dataset.panelId = panel.id;
    node.dataset.component = panel.component || panel.panelType || 'panel';
    node.dataset.hit = String(this._activePanelId() === panel.id);
    node.dataset.gesture = 'read-only';
    if (panel.material) {
      node.style.setProperty('--psl-panel-bg', panel.material.background);
      node.style.setProperty('--psl-panel-border', panel.material.border);
      node.style.setProperty('--psl-panel-radius', panel.material.radius);
      node.style.setProperty('--psl-panel-shadow', panel.material.shadow);
    }

    let content = document.createElement('div');
    content.className = 'psl-panel-live';
    node.append(content);
    let canvas = document.createElement('canvas');
    canvas.className = 'psl-panel-canvas';
    canvas.width = Math.round(panel.contentViewport?.width || 960);
    canvas.height = Math.round(panel.contentViewport?.height || 540);
    canvas.hidden = true;
    node.append(canvas);
    let useCanvasSubtree = Boolean(this._htmlCanvasSupport.supported);
    if (useCanvasSubtree) {
      canvas.dataset.live = 'true';
      canvas.hidden = false;
      content.hidden = true;
    }
    let liveElement = this._panelHost.mountPanel(panel, useCanvasSubtree ? canvas : content);
    let prepared = this._htmlCanvasRenderer.preparePanel(liveElement, panel, { canvas });
    node.dataset.canvas = prepared.supported ? 'prepared' : 'fallback';
    if (options.renderCanvasPreview) {
      this._canvasPreviewResult = this._htmlCanvasRenderer.renderPanelPreview(panel.id, canvas, {
        width: canvas.width,
        height: canvas.height,
      });
      if (this._canvasPreviewResult.rendered) {
        canvas.hidden = false;
        node.dataset.canvas = 'rendered';
      }
    }
    return node;
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
    this._panelHost?.dispatchPointerEvent(pointerEvent);
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
    let pointerEvent = createXRPointerEvent(this._activeHit, {
      source: 'mouse-fallback',
      primary: true,
      ray: this._rayFromPointer(event),
    }, 'pointerdown');
    this.ref.stage.setPointerCapture?.(event.pointerId);
    this._gestureState = createXRPanelGestureState({
      panel,
      layoutId: this._targetSection,
      mode: event.shiftKey ? 'resize' : 'move',
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
    let rect = this.ref.stage.getBoundingClientRect();
    let x = (event.clientX - rect.left) / rect.width - 0.5;
    let y = 0.5 - (event.clientY - rect.top) / rect.height;
    return {
      origin: [x * 1.4, 1.32 + y * 0.72, 0],
      direction: [-x * 0.28, -y * 0.18, -1],
    };
  }

  _renderStatus() {
    let panels = this._spatialLayout?.panels || [];
    let support = this._support.supported ? 'available' : this._support.fallback;
    let controllerState = this._controller?.getState();
    let rendererState = this._htmlCanvasRenderer?.getState();
    let panelHostState = this._panelHost?.getState();
    let htmlDiagnostics = this._htmlCanvasSupport.diagnostics || this._htmlCanvasDiagnostics || {};
    let tokenCount = Object.values(this._themeSnapshot?.tokens || {}).filter(Boolean).length;
    let mode = controllerState?.renderMode === 'webxr-session'
      ? 'webxr-session'
      : this._htmlCanvasSupport.supported ? 'html-in-canvas' : 'dom-live-fallback';
    let renderer = this._htmlCanvasSupport.preferredMode || 'unsupported';
    let hit = this._activeHit
      ? `${this._activeHit.panelId} ${this._activeHit.point.x.toFixed(2)}, ${this._activeHit.point.y.toFixed(2)}`
      : 'none';
    let gesture = this._gestureState?.status || (this._activeHit ? 'select' : 'read-only');

    this.ref.status.replaceChildren(
      this._statusItem('Source', this._targetSection || '-'),
      this._statusItem('Panels', String(panels.length)),
      this._statusItem('Panels live', `${panelHostState?.mounted || 0}/${panels.length}`),
      this._statusItem('Space', this._spatialLayout?.coordinateSystem || '-'),
      this._statusItem('Mode', mode),
      this._statusItem('Renderer', rendererState?.preferredMode || renderer),
      this._statusItem('HTML Canvas', htmlDiagnostics.supported ? 'supported' : htmlDiagnostics.recommendation || 'unsupported'),
      this._statusItem('Canvas preview', this._canvasPreviewResult?.rendered ? this._canvasPreviewResult.panelId : this._canvasPreviewResult?.reason || '-'),
      this._statusItem('Theme', this._themeSnapshot?.themeScope || '-'),
      this._statusItem('Tokens', `${tokenCount}/${Object.keys(this._themeSnapshot?.tokens || {}).length}`),
      this._statusItem('XR', support),
      this._statusItem('Pointer', hit),
      this._statusItem('Gesture', gesture),
      this._statusItem('Last tx', this._lastTransactionId || '-'),
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
    if (!this._spatialLayout) {
      this._renderProjection();
    }
    let mode = this._support.modes?.immersiveAr
      ? WEBXR_MODES.immersiveAr
      : WEBXR_MODES.immersiveVr;
    let result = await this._controller.start(mode, {
      optionalFeatures: [WEBXR_FEATURES.localFloor, WEBXR_FEATURES.boundedFloor, WEBXR_FEATURES.domOverlay],
      domOverlayRoot: this,
    });
    this._xrState = result.state;
    this._renderStatus();
  }

  _statusItem(label, value) {
    let item = document.createElement('span');
    item.textContent = `${label}: ${value}`;
    return item;
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
      this._htmlCanvasChip('layoutsubtree', diagnostics.apis?.layoutsubtree),
      this._htmlCanvasChip('drawElementImage', diagnostics.apis?.drawElementImage),
      this._htmlCanvasChip('paint', diagnostics.apis?.paintEvent),
      this._htmlCanvasChip('WebGL texture', diagnostics.apis?.webglTextureUpload),
      this._htmlCanvasChip('WebGPU texture', diagnostics.apis?.webgpuTextureCopy),
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
