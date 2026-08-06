import { redactXRDiagnosticUrl } from './webxr.js';
import { createXRPanelFrame } from './panel-frame.js';

function objectOr(value) {
  return value && typeof value === 'object' ? value : {};
}

function arrayOr(value) {
  return Array.isArray(value) ? value : [];
}

function numberOr(value, fallback = 0) {
  let number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function resolveDocument(options = {}) {
  let documentRef = options.document || globalThis.document;
  if (!documentRef?.createElement) {
    return { ok: false, reason: 'document-unavailable', document: null };
  }
  return { ok: true, document: documentRef };
}

function addClass(element, className) {
  if (!element || !className) return;
  if (element.classList?.add) {
    element.classList.add(...String(className).split(/\s+/).filter(Boolean));
    return;
  }
  element.className = [element.className, className].filter(Boolean).join(' ');
}

function setDataset(element, name, value) {
  if (!element?.dataset) return;
  element.dataset[name] = String(value);
}

function setStyleProperty(element, name, value) {
  if (!element?.style || value == null) return;
  if (typeof element.style.setProperty === 'function') {
    element.style.setProperty(name, String(value));
  } else {
    element.style[name] = String(value);
  }
}

function applyPanelMaterialVars(element, panel, options = {}) {
  if (!options.legacyMaterialVars || !panel?.material) return;
  setStyleProperty(element, '--psl-panel-bg', panel.material.background);
  setStyleProperty(element, '--psl-panel-border', panel.material.border);
  setStyleProperty(element, '--psl-panel-radius', panel.material.radius);
  setStyleProperty(element, '--psl-panel-shadow', panel.material.shadow);
}

function appendNode(parent, child) {
  if (!parent || !child) return;
  if (typeof parent.append === 'function') parent.append(child);
  else if (typeof parent.appendChild === 'function') parent.appendChild(child);
}

function replaceChildren(parent, ...children) {
  if (!parent) return;
  if (typeof parent.replaceChildren === 'function') {
    parent.replaceChildren(...children);
    return;
  }
  parent.children = [];
  appendNode(parent, ...children);
}

function panelComponentName(panel = {}) {
  return panel.component || panel.panelType || 'panel';
}

function createSourceCanvas(documentRef, panel, options = {}) {
  let canvas = documentRef.createElement('canvas');
  addClass(canvas, options.className || 'sn-xr-panel-source-canvas');
  canvas.width = Math.round(panel?.contentViewport?.width || options.width || 960);
  canvas.height = Math.round(panel?.contentViewport?.height || options.height || 540);
  setDataset(canvas, 'preview', options.preview || 'source');
  return canvas;
}

function createPanelShell(documentRef, panel, options = {}) {
  let elementName = options.elementName || 'section';
  let node = documentRef.createElement(elementName);
  addClass(node, options.className || 'sn-xr-panel');
  setDataset(node, 'panelId', panel?.id || '');
  setDataset(node, 'component', panelComponentName(panel));
  setDataset(node, 'hit', Boolean(options.activePanelId && options.activePanelId === panel?.id));
  setDataset(node, 'gesture', options.gesture || 'read-only');
  let frame = createXRPanelFrame(panel, options.frame || {});
  setDataset(node, 'frame', frame.version);
  setDataset(node, 'frameState', Object.entries(frame.state)
    .filter(([, enabled]) => enabled)
    .map(([name]) => name)
    .join(' ') || 'idle');
  applyPanelMaterialVars(node, panel, options);
  return node;
}

function createFallbackElement(documentRef, panel, reason, options = {}) {
  let fallback = documentRef.createElement('section');
  addClass(fallback, options.fallbackClassName || 'sn-xr-panel-fallback');
  setDataset(fallback, 'reason', reason || 'panel-build-failed');
  fallback.textContent = options.text || `XR panel fallback: ${reason || 'panel-build-failed'}`;
  if (fallback.setAttribute) fallback.setAttribute('role', 'note');
  return fallback;
}

function summarizeDeepGraph(deepGraph) {
  if (!deepGraph) return null;
  let diagnostics = objectOr(deepGraph.diagnostics);
  let previewSummary = objectOr(deepGraph.previewSummary);
  return {
    nodeCount: numberOr(diagnostics.nodeCount),
    edgeCount: numberOr(diagnostics.edgeCount),
    connectedNodeCount: numberOr(diagnostics.connectedNodeCount),
    edgeTypes: objectOr(diagnostics.edgeTypes),
    focusNodeId: diagnostics.focusNodeId || null,
    focus: diagnostics.focus || null,
    previewStatus: previewSummary.status || null,
    previewNodes: objectOr(previewSummary.nodes),
    previewEdges: objectOr(previewSummary.edges),
    previewFocus: previewSummary.focus || null,
  };
}

function summarizeLayerFrame(layerFrame) {
  let frame = objectOr(layerFrame);
  let textureQuality = arrayOr(frame.textureQuality);
  return {
    rendered: Boolean(frame.rendered),
    reason: frame.reason || null,
    lowQualityCount: arrayOr(frame.lowQualityPanels).length,
    textureTargetCount: textureQuality.filter((item) => item?.status === 'target').length,
    textureTotalCount: textureQuality.length,
  };
}

function summarizeGeometry(geometrySummaries) {
  let summaries = arrayOr(geometrySummaries);
  return {
    count: summaries.length,
    comfortWarnings: summaries.filter((summary) => summary?.poseComfort?.status === 'warning').length,
    adjustedPanels: summaries.filter((summary) => summary?.poseAdjustment?.adjusted).length,
    facingWarnings: summaries.filter((summary) => summary?.facing?.status === 'warning').length,
    rotatedPanels: summaries.filter((summary) => summary?.rotationAdjustment?.adjusted).length,
  };
}

export function createXRSpatialWorkbenchSummary(options = {}) {
  let panels = arrayOr(options.panels);
  let controllerState = objectOr(options.controllerState);
  let rendererState = objectOr(options.rendererState);
  let panelHostState = objectOr(options.panelHostState);
  let threeSessionDiagnostics = objectOr(options.threeSessionDiagnostics);
  let threeDiagnostics = objectOr(options.threeDiagnostics || threeSessionDiagnostics.adapter);
  let htmlCanvasSupport = objectOr(options.htmlCanvasSupport);
  let htmlDiagnostics = objectOr({
    ...objectOr(htmlCanvasSupport.diagnostics),
    ...objectOr(options.htmlCanvasDiagnostics),
  });
  let themeSnapshot = objectOr(options.themeSnapshot);
  let textureGate = objectOr(options.textureGate);
  let sceneQuality = objectOr(options.sceneQuality);
  let readiness = objectOr(options.readiness);
  let launch = objectOr(options.launch);
  let launchGate = objectOr(options.launchGate);
  let support = objectOr(options.support);
  let rayCounters = objectOr(threeDiagnostics.controller?.counters);
  let threeHover = objectOr(threeSessionDiagnostics.hover);
  let threeDrag = objectOr(threeDiagnostics.controller?.diagnostics?.drag || threeSessionDiagnostics.drag);
  let layerFrame = summarizeLayerFrame(options.layerFrame);
  let geometry = summarizeGeometry(options.geometrySummaries);
  let activeHit = objectOr(options.activeHit);
  let tokenValues = Object.values(objectOr(themeSnapshot.tokens));
  let mode = controllerState.renderMode === 'webxr-session'
    ? 'webxr-session'
    : threeSessionDiagnostics.active ? 'webxr-session'
    : htmlCanvasSupport.supported ? 'html-in-canvas' : 'dom-live-fallback';
  let renderer = threeSessionDiagnostics.active
    ? options.threeAdapterName || threeDiagnostics.name || 'three-webxr'
    : rendererState.preferredMode || htmlCanvasSupport.preferredMode || 'unsupported';

  return {
    version: 'xr-spatial-workbench-summary-v1',
    source: options.source || null,
    panels: {
      total: panels.length,
      live: numberOr(panelHostState.mounted),
      errors: arrayOr(options.panelBuildErrors).length,
    },
    deepGraph: summarizeDeepGraph(options.deepGraph),
    space: options.coordinateSystem || options.scene?.coordinateSystem || null,
    mode,
    renderer,
    three: {
      adapter: options.threeAdapterName || threeDiagnostics.name || null,
      panels: numberOr(threeDiagnostics.panelCount),
      renderedPanels: numberOr(threeDiagnostics.renderedPanelCount),
      diagnosticPanels: numberOr(threeDiagnostics.diagnosticPanelCount),
      frames: numberOr(threeSessionDiagnostics.frames),
      hits: numberOr(rayCounters.hits),
      misses: numberOr(rayCounters.misses),
      raySource: threeDiagnostics.controller?.raySource || null,
      dragMisses: numberOr(rayCounters.dragMisses),
      hover: threeHover.panelId
        ? {
          panelId: threeHover.panelId,
          frameTarget: threeHover.frameTarget || null,
        }
        : null,
      drag: threeDrag.panelId || threeDrag.active
        ? {
          active: Boolean(threeDrag.active),
          panelId: threeDrag.panelId || null,
          frameTarget: threeDrag.frameTarget || null,
          size: threeDrag.size || null,
          resize: threeDrag.resize || null,
        }
        : null,
    },
    htmlCanvas: {
      supported: Boolean(htmlDiagnostics.supported),
      recommendation: htmlDiagnostics.recommendation || null,
      availability: htmlDiagnostics.availability || null,
      textureUploadAvailable: Boolean(htmlDiagnostics.textureUploadAvailable),
      threeTexture: htmlDiagnostics.threeTexture || null,
      preferredMode: htmlCanvasSupport.preferredMode || null,
    },
    canvasPreview: options.canvasPreviewResult || null,
    layerFrame,
    texture: {
      ...textureGate,
      quality: {
        target: layerFrame.textureTargetCount,
        total: layerFrame.textureTotalCount,
      },
    },
    sceneQuality,
    readiness,
    geometry,
    theme: {
      scope: themeSnapshot.themeScope || null,
      resolvedTokens: tokenValues.filter(Boolean).length,
      totalTokens: Object.keys(objectOr(themeSnapshot.tokens)).length,
    },
    support: {
      status: support.supported ? 'available' : support.fallback || 'unsupported',
      modes: support.modes || null,
    },
    launch: {
      canLaunch: Boolean(launch.canLaunch),
      mode: launch.mode || null,
      reason: launch.reason || null,
    },
    launchGate,
    error: options.error || null,
    pointer: activeHit.panelId
      ? {
        panelId: activeHit.panelId,
        x: numberOr(activeHit.point?.x),
        y: numberOr(activeHit.point?.y),
      }
      : null,
    gesture: {
      status: options.gestureState?.status || (activeHit.panelId ? 'select' : 'read-only'),
      panelId: options.gestureState?.panelId || null,
    },
    lastTransactionId: options.lastTransactionId || null,
  };
}

export function createXRWorkbenchDiagnosticPayload(options = {}) {
  let launch = objectOr(options.launch);
  let details = objectOr(options.details);
  let htmlCanvas = options.htmlCanvas ?? details.htmlCanvas ?? null;
  let texture = options.texture ?? details.texture ?? null;
  let launchGate = options.launchGate ?? details.launchGate ?? null;
  let sceneQuality = options.sceneQuality ?? details.sceneQuality ?? null;
  let readiness = options.readiness ?? details.readiness ?? null;
  let visual = options.visual ?? details.visual ?? null;
  let visualReadiness = options.visualReadiness ?? details.visualReadiness ?? null;
  let interactionReadiness = options.interactionReadiness ?? details.interactionReadiness ?? null;
  let surface = objectOr(options.surface);

  return {
    version: 'xr-workbench-diagnostic-payload-v1',
    event: options.event || 'xr-diagnostic',
    pageUrl: redactXRDiagnosticUrl(options.pageUrl || ''),
    secureContext: Boolean(options.secureContext),
    navigatorXr: Boolean(options.navigatorXr),
    modes: options.modes || null,
    launch: {
      canLaunch: Boolean(launch.canLaunch),
      mode: launch.mode || null,
      reason: launch.reason || null,
    },
    clientId: options.clientId || null,
    attemptId: options.attemptId || details.attemptId || null,
    surface: {
      surfaceKind: surface.surfaceKind || null,
      entrypoint: surface.entrypoint || null,
      projectId: surface.projectId || null,
      targetSection: surface.targetSection || null,
      panelContentKind: surface.panelContentKind || null,
    },
    session: options.session || null,
    error: options.error || null,
    details: {
      ...details,
      htmlCanvas,
      texture,
      launchGate,
      sceneQuality,
      readiness,
      visual,
      visualReadiness,
      interactionReadiness,
    },
  };
}

export function createXRDomPanelSourceHost(options = {}) {
  let documentState = resolveDocument(options);
  let documentRef = documentState.document;
  let panelHost = options.panelHost || null;
  let sourcePanelHost = options.sourcePanelHost || null;
  let htmlCanvasRenderer = options.htmlCanvasRenderer || options.renderer || null;
  let classNames = {
    panel: 'sn-xr-panel',
    live: 'sn-xr-panel-live',
    canvas: 'sn-xr-panel-source-canvas',
    source: 'sn-xr-panel-source',
    fallback: 'sn-xr-panel-fallback',
    ...(options.classNames || {}),
  };
  let state = {
    scene: null,
    themeSnapshot: options.themeSnapshot || null,
    mounted: 0,
    prepared: 0,
    errors: [],
    panelIds: [],
    lastPreview: null,
  };

  function requireReady() {
    if (!documentState.ok) return { ok: false, reason: documentState.reason };
    if (!panelHost?.mountPanel) return { ok: false, reason: 'panel-host-unavailable' };
    if (!sourcePanelHost?.mountPanel) return { ok: false, reason: 'source-panel-host-unavailable' };
    if (!htmlCanvasRenderer?.preparePanel) return { ok: false, reason: 'html-canvas-renderer-unavailable' };
    return { ok: true };
  }

  function setScene(scene, sceneOptions = {}) {
    state.scene = scene || null;
    state.themeSnapshot = sceneOptions.themeSnapshot || state.themeSnapshot || null;
    state.mounted = 0;
    state.prepared = 0;
    state.errors = [];
    state.panelIds = [];
    panelHost?.setScene?.(state.scene, { themeSnapshot: state.themeSnapshot });
    sourcePanelHost?.setScene?.(state.scene, { themeSnapshot: state.themeSnapshot });
    return getState();
  }

  function mountPreviewPanel(panel, mountOptions = {}) {
    let ready = requireReady();
    if (!ready.ok) {
      return {
        ok: false,
        reason: ready.reason,
        panelId: panel?.id || null,
        node: createErrorPanel(panel, ready.reason),
      };
    }

    try {
      let node = createPanelShell(documentRef, panel, {
        className: classNames.panel,
        activePanelId: mountOptions.activePanelId,
        legacyMaterialVars: options.legacyMaterialVars,
      });
      let live = documentRef.createElement('div');
      addClass(live, classNames.live);
      appendNode(node, live);
      let sourceCanvas = createSourceCanvas(documentRef, panel, {
        className: classNames.canvas,
        preview: mountOptions.renderCanvasPreview ? 'visible' : 'source',
      });
      appendNode(node, sourceCanvas);

      let liveElement = panelHost.mountPanel(panel, live);
      let sourceElement = sourcePanelHost.mountPanel(panel, sourceCanvas);
      let prepared = htmlCanvasRenderer.preparePanel(sourceElement, panel, { canvas: sourceCanvas });
      setDataset(node, 'canvas', prepared.supported ? 'prepared' : 'fallback');

      let previewResult = null;
      if (mountOptions.renderCanvasPreview && typeof htmlCanvasRenderer.renderPanelPreview === 'function') {
        try {
          previewResult = htmlCanvasRenderer.renderPanelPreview(panel.id, sourceCanvas, {
            width: sourceCanvas.width,
            height: sourceCanvas.height,
          });
        } catch (error) {
          previewResult = {
            rendered: false,
            panelId: panel.id,
            mode: 'canvas2d',
            reason: error?.name || 'canvas-preview-failed',
            message: error?.message || '',
          };
        }
        state.lastPreview = previewResult;
        if (previewResult?.rendered) {
          setDataset(sourceCanvas, 'preview', 'visible');
          setDataset(node, 'canvas', 'rendered');
        }
      }

      state.mounted += 1;
      if (prepared.prepared) state.prepared += 1;
      state.panelIds.push(panel.id);
      return {
        ok: true,
        panelId: panel.id,
        node,
        live,
        liveElement,
        sourceCanvas,
        sourceElement,
        prepared,
        previewResult,
      };
    } catch (error) {
      let failure = {
        panelId: panel?.id || null,
        reason: error?.name || 'panel-build-failed',
        message: error?.message || '',
      };
      state.errors.push(failure);
      return {
        ok: false,
        ...failure,
        error,
        node: createErrorPanel(panel, error),
      };
    }
  }

  function createErrorPanel(panel, error) {
    if (!documentRef) return null;
    let reason = typeof error === 'string' ? error : error?.name || 'panel-build-failed';
    let node = createPanelShell(documentRef, panel, {
      className: classNames.panel,
      legacyMaterialVars: options.legacyMaterialVars,
    });
    setDataset(node, 'error', reason);
    let live = documentRef.createElement('div');
    addClass(live, classNames.live);
    let fallback = createFallbackElement(documentRef, panel, reason, {
      fallbackClassName: classNames.fallback,
    });
    appendNode(live, fallback);
    appendNode(node, live);
    return node;
  }

  function prepareLayerSources(sceneOrPanels, canvas, prepareOptions = {}) {
    let ready = requireReady();
    let panels = Array.isArray(sceneOrPanels)
      ? sceneOrPanels
      : arrayOr(sceneOrPanels?.panels || state.scene?.panels);
    if (!ready.ok) return { ok: false, reason: ready.reason, prepared: 0, total: panels.length };
    if (!canvas) return { ok: false, reason: 'canvas-unavailable', prepared: 0, total: panels.length };
    sourcePanelHost?.setScene?.(state.scene, { themeSnapshot: state.themeSnapshot });
    canvas.replaceChildren?.();
    let records = [];
    for (let panel of panels) {
      let sourceContainer = documentRef.createElement('div');
      let sourceElement = sourcePanelHost.mountPanel(panel, sourceContainer);
      addClass(sourceElement, prepareOptions.sourceClassName || classNames.source);
      appendNode(canvas, sourceElement);
      let prepared = htmlCanvasRenderer.preparePanel(sourceElement, panel, { canvas });
      records.push({ panelId: panel.id, prepared });
    }
    return {
      ok: true,
      prepared: records.filter((record) => record.prepared?.prepared).length,
      total: panels.length,
      records,
    };
  }

  function getState() {
    return {
      ...state,
      panelHost: panelHost?.getState?.() || null,
      sourcePanelHost: sourcePanelHost?.getState?.() || null,
      renderer: htmlCanvasRenderer?.getState?.() || null,
    };
  }

  return {
    setScene,
    mountPreviewPanel,
    createErrorPanel,
    prepareLayerSources,
    getState,
  };
}

export const createXRDomPanelWorkbench = createXRDomPanelSourceHost;
