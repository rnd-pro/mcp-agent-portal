import { Symbiote } from '@symbiotejs/symbiote';
import { sharedUiStyles as cssShared, getRoute, parseQuery } from 'symbiote-node/ui';
import {
  WEBXR_FEATURES,
  WEBXR_MODES,
  createXRHtmlCanvasRenderer,
  createXRPanelHost,
  createXRSceneController,
  createXRSpatialPreview,
  createXRSpatialScene,
  createXRThemeSnapshot,
  createXRPointerEvent,
  getWebXRSupport,
  hitTestXRPanels,
} from 'symbiote-node/xr';
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
    this._projectId = readProjectId();
    this._targetSection = defaultTargetSection(this._projectId);
    this.ref.sectionSelect.addEventListener('change', () => {
      this._targetSection = this.ref.sectionSelect.value || defaultTargetSection(this._projectId);
      this._renderProjection();
    });
    this.ref.scaleInput.addEventListener('input', () => this._renderProjection());
    this.ref.depthInput.addEventListener('input', () => this._renderProjection());
    this.ref.enterButton.addEventListener('click', () => this._enterXR());
    this.ref.stage.addEventListener('pointermove', (event) => this._updatePointer(event));
    this.ref.stage.addEventListener('pointerleave', () => {
      this._activeHit = null;
      this._syncHitState();
      this._renderStatus();
    });
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

    this.ref.space.replaceChildren();
    for (let panel of this._xrState?.scene?.panels || this._spatialLayout?.panels || []) {
      let node = this._createPanelNode(panel);
      this._positionPanel(node, panel);
      this.ref.space.append(node);
    }
    this._syncHitState();
    this._renderStatus();
  }

  _createPanelNode(panel) {
    let node = document.createElement('section');
    node.className = 'psl-panel';
    node.dataset.panelId = panel.id;
    node.dataset.hit = String(this._activeHit?.panelId === panel.id);
    if (panel.material) {
      node.style.setProperty('--psl-panel-bg', panel.material.background);
      node.style.setProperty('--psl-panel-border', panel.material.border);
      node.style.setProperty('--psl-panel-radius', panel.material.radius);
      node.style.setProperty('--psl-panel-shadow', panel.material.shadow);
    }

    let content = document.createElement('div');
    content.className = 'psl-panel-live';
    node.append(content);
    let liveElement = this._panelHost.mountPanel(panel, content);
    this._htmlCanvasRenderer.preparePanel(liveElement, panel);
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
  }

  _updatePointer(event) {
    if (!this._spatialLayout) return;
    let ray = this._rayFromPointer(event);
    this._activeHit = hitTestXRPanels(ray, this._spatialLayout.panels);
    createXRPointerEvent(this._activeHit, {
      source: 'mouse-fallback',
      primary: event.buttons === 1,
      ray,
    });
    this._syncHitState();
    this._renderStatus();
  }

  _syncHitState() {
    for (let node of this.ref.space.querySelectorAll('.psl-panel')) {
      node.dataset.hit = String(this._activeHit?.panelId === node.dataset.panelId);
    }
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
    let tokenCount = Object.values(this._themeSnapshot?.tokens || {}).filter(Boolean).length;
    let mode = controllerState?.renderMode === 'webxr-session'
      ? 'webxr-session'
      : this._htmlCanvasSupport.supported ? 'html-in-canvas' : 'dom-live-fallback';
    let renderer = this._htmlCanvasSupport.preferredMode || 'unsupported';
    let hit = this._activeHit
      ? `${this._activeHit.panelId} ${this._activeHit.point.x.toFixed(2)}, ${this._activeHit.point.y.toFixed(2)}`
      : 'none';

    this.ref.status.replaceChildren(
      this._statusItem('Source', this._targetSection || '-'),
      this._statusItem('Panels', String(panels.length)),
      this._statusItem('Panels live', `${panelHostState?.mounted || 0}/${panels.length}`),
      this._statusItem('Space', this._spatialLayout?.coordinateSystem || '-'),
      this._statusItem('Mode', mode),
      this._statusItem('Renderer', rendererState?.preferredMode || renderer),
      this._statusItem('Theme', this._themeSnapshot?.themeScope || '-'),
      this._statusItem('Tokens', `${tokenCount}/${Object.keys(this._themeSnapshot?.tokens || {}).length}`),
      this._statusItem('XR', support),
      this._statusItem('Pointer', hit),
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
}

SpatialLayout.template = template;
SpatialLayout.rootStyles = cssShared + cssLocal;
SpatialLayout.reg('pg-spatial-layout');

export default SpatialLayout;
