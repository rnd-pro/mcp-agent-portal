import * as THREE from 'three';
import {
  applyXRThemeToPanel,
  createStableXRDiagnosticClientId,
  createXRHtmlCanvasRenderer,
  createXRPanelHost,
  createXRSceneGeometrySummary,
  createXRSceneQualitySummary,
  createXRSpatialScene,
  createXRThemeSnapshot,
  createXRVisualAgentReadinessSummary,
  createXRVisualTestSummary,
  createXRThreePanelTextureBridge,
  createXRThreeHtmlCanvasTextureResolver,
  createXRThreeRenderHost,
  createXRThreeDiagnosticPayload,
  createXRThreeDiagnosticServerSummary,
  createXRThreeInteractionReadinessSummary,
  createXRThreeSessionController,
  createXRThreeSessionHealthSummary,
  createXRThreeSessionOptions,
  createXRThreeSessionTelemetrySnapshot,
  createXRThreeSessionWatchdogSummary,
  createXRThreeTroubleshootingSummary,
  createXRThreeWebXRAdapter,
  createXRReadinessSummary,
  createXRTextureDebugModeSummary,
  createXRTextureGateSummary,
  updateXRThreePanelMaterialStates,
  createWebXRLaunchGateSummary,
  createWebXRLaunchRecommendation,
  getWebXRSupport,
  readXRHtmlCanvasOriginTrialHeaderStatus,
} from 'symbiote-node/xr';

const HTML_IN_CANVAS_ORIGIN_TRIAL_DIAGNOSTIC_HEADER = 'X-Agent-Portal-Origin-Trial';

const enterButton = document.querySelector('#enter');
const modeSelect = document.querySelector('#mode');
const strictTextureInput = document.querySelector('#strict-texture');
const statusList = document.querySelector('#status');
const main = document.querySelector('main');
const livePanelRoot = document.querySelector('#live-panels');
const DRAG_MODEL = 'controller-ray-plane';
const diagnosticClientId = createStableXRDiagnosticClientId({
  prefix: 'xr-three',
  globalThis: window,
}).id;
let textureDebugMode = createXRTextureDebugModeSummary({
  texture: new URLSearchParams(location.search).get('texture'),
});
let strictTextureMode = textureDebugMode.strict;
const themeSnapshot = createXRThemeSnapshot(document.documentElement, {
  themeScope: 'xr-three-baseline',
});

class XRBaselineLivePanel extends HTMLElement {
  set heading(value) {
    this._heading = value;
    this.render();
  }

  set body(value) {
    this._body = value;
    this.render();
  }

  set metric(value) {
    this._metric = value;
    this.render();
  }

  set items(value) {
    this._items = Array.isArray(value) ? value : [];
    this.render();
  }

  connectedCallback() {
    this.render();
  }

  render() {
    let heading = this._heading || this.getAttribute('heading') || 'XR panel';
    let body = this._body || this.getAttribute('body') || '';
    let metric = this._metric || this.getAttribute('metric') || '';
    let items = this._items || [];
    this.replaceChildren();
    let title = document.createElement('h3');
    title.textContent = heading;
    let paragraph = document.createElement('p');
    paragraph.textContent = body;
    let metricNode = document.createElement('p');
    metricNode.textContent = metric;
    let list = document.createElement('ul');
    for (let item of items) {
      let row = document.createElement('li');
      row.textContent = item;
      list.append(row);
    }
    this.append(title, paragraph, metricNode, list);
  }
}

const livePanelComponent = {
  tagName: 'xr-baseline-live-panel',
  ComponentClass: XRBaselineLivePanel,
};

function createLiveLayoutNode(component, props) {
  return {
    component,
    props,
    themeScope: 'xr-three-baseline',
  };
}

const layoutRoot = {
  id: 'xr-three-baseline-root',
  component: 'panel-layout',
  layout: { direction: 'horizontal' },
  themeScope: 'xr-three-baseline',
  children: [
    {
      id: 'front',
      layout: { area: 'main', weight: 2 },
      xr: { anchor: 'front', position: [0, 1.42, -1.75], rotation: [0, 0, 0], size: [0.92, 0.54] },
      ...createLiveLayoutNode('xr-baseline-live-panel', {
        heading: 'Project graph',
        body: 'Runtime panel source mounted through Symbiote XRPanelHost.',
        metric: 'World surface: front',
        items: ['layout node', 'provider theme', 'DOM component'],
      }),
    },
    {
      id: 'left',
      layout: { area: 'left', weight: 1 },
      xr: { anchor: 'left', position: [-0.82, 1.34, -1.55], rotation: [0, 18, 0], size: [0.58, 0.46] },
      ...createLiveLayoutNode('xr-baseline-live-panel', {
        heading: 'Agent chat',
        body: 'Live DOM source prepared for HTML-in-Canvas rendering.',
        metric: 'World surface: left',
        items: ['messages', 'subagents', 'status'],
      }),
    },
    {
      id: 'right',
      layout: { area: 'right', weight: 1 },
      xr: { anchor: 'right', position: [0.82, 1.34, -1.55], rotation: [0, -18, 0], size: [0.58, 0.46] },
      ...createLiveLayoutNode('xr-baseline-live-panel', {
        heading: 'Runtime',
        body: 'Panel diagnostics stay data-only and provider-owned.',
        metric: 'World surface: right',
        items: ['session', 'input', 'texture'],
      }),
    },
    {
      id: 'lower',
      layout: { area: 'bottom', weight: 1 },
      xr: { anchor: 'lower', position: [0, 0.98, -1.42], rotation: [-7, 0, 0], size: [0.76, 0.34] },
      ...createLiveLayoutNode('xr-baseline-live-panel', {
        heading: 'Timeline',
        body: 'Server-confirmed events make headset runs debuggable.',
        metric: 'World surface: lower',
        items: ['event', 'status', 'health'],
      }),
    },
  ],
};

const spatialScene = createXRSpatialScene(layoutRoot, {
  themeScope: 'xr-three-baseline',
  userSpace: { eyeHeight: 1.55 },
});

const scene = {
  ...spatialScene,
  panels: spatialScene.panels.map((panel) => applyXRThemeToPanel(panel, themeSnapshot)),
};

let support = {
  apis: {
    secureContext: window.isSecureContext,
    navigatorXrAvailable: Boolean(window.navigator?.xr),
  },
  modes: {
    immersiveVr: false,
    immersiveAr: false,
  },
};
let launchRecommendation = createWebXRLaunchRecommendation(support);
let mode = null;
let frameCount = 0;
let lastFpsTime = 0;
let lastTelemetryTime = 0;
let fps = 0;
let serverSummary = null;
let serverSummaryError = null;
let heartbeatTimer = null;
let sessionWatchdogTimer = null;
let livePanelPrepareSummary = null;
let textureSourceSummaries = [];
let textureBridgeRecords = [];
let originTrialHeaderStatus = {
  checked: false,
  present: false,
  diagnosticHeader: null,
  error: null,
};

strictTextureInput.checked = strictTextureMode;

const livePanelHost = createXRPanelHost({
  document,
  componentResolver(name) {
    return name === livePanelComponent.tagName ? livePanelComponent : name;
  },
});
const htmlCanvasRenderer = createXRHtmlCanvasRenderer({ globalThis: window });
let threeTextureBridge = null;
let threeTextureResolver = createXRThreeHtmlCanvasTextureResolver({
  THREE,
  document,
  htmlCanvasRenderer,
});

const adapter = createXRThreeWebXRAdapter({ THREE });
const renderHost = createXRThreeRenderHost({
  THREE,
  adapter,
  globalThis: window,
  hostElement: main,
  stageElement: main,
  maxPixelRatio: 2,
});
const target = renderHost.ensureTarget({ scene, pixelRatio: window.devicePixelRatio });
const renderer = target.renderer;
const camera = target.camera;
const xrScene = target.scene;
const sessionController = createXRThreeSessionController({
  globalThis: window,
  adapter,
  onDiagnostic(event, details) {
    postDiagnostic(event, details);
  },
  onFrame({ time }) {
    updatePanelMaterials();
    updateFrameStats(time);
  },
});

function postDiagnostic(event, extra = {}) {
  let state = sessionController.getDiagnostics();
  let texture = getTextureDiagnosticsPayload();
  let telemetry = createXRThreeSessionTelemetrySnapshot(state);
  let interactionReadiness = createXRThreeInteractionReadinessSummary(telemetry, {
    texture,
    expectedPanelCount: scene.panels.length,
  });
  let visual = createXRVisualTestSummary(scene, {
    eyeHeight: scene.userSpace?.eyeHeight,
    telemetry,
    adapter: adapter.getState(),
  });
  let visualReadiness = createXRVisualAgentReadinessSummary({
    visual,
    expectedStatus: 'pass',
    pageErrors: [],
    requireBrowserArtifacts: false,
  });
  let payload = createXRThreeDiagnosticPayload({
    clientId: diagnosticClientId,
    event,
    pageUrl: location.href,
    secureContext: window.isSecureContext,
    navigatorXr: Boolean(window.navigator?.xr),
    support,
    modes: support.modes,
    launch: launchRecommendation,
    mode,
    preferredMode: modeSelect.value || null,
    sessionDiagnostics: state,
    fps,
    htmlCanvas: getHtmlCanvasDiagnosticsPayload(),
    sceneQuality: getSceneQualityDiagnosticsPayload(),
    texture,
    interactionReadiness,
    visual,
    visualReadiness,
    launchGate: getLaunchGateSummary({ texture }),
    userActivation: window.navigator?.userActivation || null,
    extra,
  });
  fetch('/api/xr-diagnostics/log', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    keepalive: true,
  }).catch(() => {});
}

function getHtmlCanvasDiagnosticsPayload() {
  let htmlCanvas = (livePanelPrepareSummary?.support || htmlCanvasRenderer.getSupport()).diagnostics || null;
  if (!htmlCanvas) return null;
  return {
    ...htmlCanvas,
    responseHeader: {
      checked: originTrialHeaderStatus.checked,
      originTrialPresent: originTrialHeaderStatus.present,
      diagnosticHeader: originTrialHeaderStatus.diagnosticHeader,
      error: originTrialHeaderStatus.error,
    },
  };
}

async function refreshOriginTrialHeaderStatus() {
  originTrialHeaderStatus = await readXRHtmlCanvasOriginTrialHeaderStatus(location, {
    diagnosticHeader: HTML_IN_CANVAS_ORIGIN_TRIAL_DIAGNOSTIC_HEADER,
  });
  renderStatus();
}

function postHeartbeat() {
  postDiagnostic('three-panels-client-heartbeat', {
    heartbeat: true,
  });
}

function mountLivePanels() {
  livePanelHost.setScene(scene, { themeSnapshot });
  livePanelRoot.replaceChildren();
  for (let panel of scene.panels) {
    let container = document.createElement('section');
    container.className = 'live-panel-source';
    container.dataset.panelId = panel.id;
    livePanelRoot.append(container);
    livePanelHost.mountPanel(panel, container);
  }
  threeTextureBridge = createXRThreePanelTextureBridge({
    htmlCanvasRenderer,
    getPanelElement: (panelId) => livePanelHost.getPanelElement(panelId),
    requireTextureUpload: textureDebugMode.requireTextureUpload,
    textureResolver: threeTextureResolver.resolve,
  });
  let sceneResult = adapter.setScene(scene, {
    textureBridge: threeTextureBridge,
    textureOptions: { requireTextureUpload: textureDebugMode.requireTextureUpload },
    hideStrictTextureFailures: textureDebugMode.hideStrictTextureFailures,
  });
  textureBridgeRecords = sceneResult.textureSources || [];
  textureSourceSummaries = textureBridgeRecords.map((record) => record.summary).filter(Boolean);
  livePanelPrepareSummary = {
    host: livePanelHost.getState(),
    scene: sceneResult,
    textureBridge: threeTextureBridge.getState(),
    textureResolver: threeTextureResolver.getState(),
    renderer: htmlCanvasRenderer.getState(),
    support: htmlCanvasRenderer.getSupport(),
    prepared: textureSourceSummaries,
  };
  livePanelPrepareSummary.textureSources = textureSourceSummaries;
  postDiagnostic('three-panels-live-sources-mounted', {
    livePanels: {
      mounted: livePanelPrepareSummary.host.mounted,
      prepared: textureSourceSummaries.filter((item) => item.prepared).length,
      rendererMode: livePanelPrepareSummary.renderer.preferredMode || 'unsupported',
      support: livePanelPrepareSummary.support.diagnostics,
      strictTexture: textureDebugMode.strict,
      textureDebugMode,
      textureBridge: livePanelPrepareSummary.textureBridge,
      textureResolver: livePanelPrepareSummary.textureResolver,
      textureSources: textureSourceSummaries,
    },
  });
}

function getTextureReadiness() {
  let records = textureBridgeRecords.length
    ? textureBridgeRecords
    : textureSourceSummaries.map((summary) => ({
      ok: summary.source === 'html-in-canvas',
      reason: summary.reason,
      stage: summary.source === 'html-in-canvas' ? 'three-material-pending' : 'html-in-canvas-support',
      summary,
    }));
  let gate = createXRTextureGateSummary({
    strict: textureDebugMode.strict,
    records,
    debugMode: textureDebugMode,
    support: livePanelPrepareSummary?.support || htmlCanvasRenderer.getSupport(),
    panelCount: textureSourceSummaries.length,
    bridgeVersion: threeTextureBridge?.getState?.().version || null,
    resolverState: threeTextureResolver?.getState?.() || null,
  });
  return {
    ...gate,
    htmlInCanvas: gate.bridgeStages.filter((item) => item.source === 'html-in-canvas').length,
    supportRecommendation: gate.requiredApi?.[0] || null,
    blockingMissing: gate.requiredApi || [],
  };
}

function getTextureDiagnosticsPayload() {
  return getTextureReadiness();
}

function getSceneQualityDiagnosticsPayload() {
  return createXRSceneQualitySummary(scene, {
    eyeHeight: scene.userSpace?.eyeHeight,
  });
}

function getLaunchGateSummary(options = {}) {
  return createWebXRLaunchGateSummary(support, {
    preferredMode: modeSelect.value || null,
    selectedMode: mode,
    launch: launchRecommendation,
    texture: options.texture || getTextureDiagnosticsPayload(),
    userActivation: window.navigator?.userActivation || null,
    requireUserActivation: options.requireUserActivation === true,
  });
}

function scheduleSessionWatchdog() {
  let thresholdMs = 6000;
  if (sessionWatchdogTimer) window.clearTimeout(sessionWatchdogTimer);
  sessionWatchdogTimer = window.setTimeout(() => {
    let watchdog = createXRThreeSessionWatchdogSummary(sessionController.getDiagnostics(), {
      thresholdMs,
      elapsedMs: thresholdMs,
      eventPrefix: 'three-panels-session',
    });
    if (watchdog.event) {
      postDiagnostic(watchdog.event, { watchdog });
    }
  }, thresholdMs);
}

function formatFrameTarget(frameTarget) {
  if (!frameTarget) return '-';
  let operation = frameTarget.operation || 'none';
  let zone = frameTarget.zone || frameTarget.handle || frameTarget.action || '-';
  let panelId = frameTarget.panelId || '-';
  return `${panelId}:${operation}/${zone}`;
}

function formatMeters(values) {
  if (!Array.isArray(values) || !values.length) return '-';
  let text = values
    .filter((value) => Number.isFinite(Number(value)))
    .map((value) => `${Number(value).toFixed(2)}m`)
    .join(' x ');
  return text || '-';
}

function formatTextureQualityCounts(textureQuality) {
  if (!textureQuality || typeof textureQuality !== 'object') return '-';
  return [
    `total:${Number(textureQuality.total || 0)}`,
    `target:${Number(textureQuality.target || 0)}`,
    `readable:${Number(textureQuality.readable || 0)}`,
    `low:${Number(textureQuality.low || 0)}`,
    `blocked:${Number(textureQuality.blocked || 0)}`,
    `warnings:${Number(textureQuality.warningCount || 0)}`,
  ].join(' ');
}

function formatTextureQualityWarnings(textureQuality) {
  let warnings = Array.isArray(textureQuality?.warnings) ? textureQuality.warnings : [];
  if (!warnings.length) return '-';
  return warnings.map((warning) => `${warning.panelId || '-'}:${warning.code || 'warning'}`).join(', ');
}

function formatTextureQualityRecommendations(textureQuality) {
  let recommendations = Array.isArray(textureQuality?.recommendations) ? textureQuality.recommendations : [];
  if (!recommendations.length) return '-';
  return recommendations.map((item) => `${item.panelId || '-'}:${item.code || 'recommendation'}`).join(', ');
}

function formatTextureQualityActions(textureQuality) {
  let actions = Array.isArray(textureQuality?.actions) ? textureQuality.actions : [];
  if (!actions.length) return textureQuality?.primaryRecommendation || '-';
  return actions.map((item) => {
    let panels = Array.isArray(item.panelIds) && item.panelIds.length ? `(${item.panelIds.join('|')})` : '';
    return `${item.code || 'action'}:${Number(item.count || 0)}${panels}`;
  }).join(', ');
}

function formatVisualIssues(summary) {
  let issues = Array.isArray(summary?.issues) ? summary.issues : [];
  if (!issues.length) return '-';
  return issues.slice(0, 6).map((issue) => `${issue.id}:${issue.severity || 'warning'}`).join(', ');
}

function formatVisualPanelMap(summary) {
  let panels = Array.isArray(summary?.panelMap) ? summary.panelMap : [];
  if (!panels.length) return '-';
  return panels.map((panel) => {
    let position = Array.isArray(panel.position) ? panel.position.map((value) => Number(value).toFixed(2)).join('/') : '-';
    let size = panel.meters ? `${Number(panel.meters.width || 0).toFixed(2)}x${Number(panel.meters.height || 0).toFixed(2)}m` : '-';
    return `${panel.panelId}:${panel.anchor || '-'} ${position} ${size}`;
  }).join(', ');
}

function setRows(rows) {
  statusList.replaceChildren(...rows.flatMap(([label, value]) => {
    let term = document.createElement('dt');
    let detail = document.createElement('dd');
    term.textContent = label;
    detail.textContent = value == null || value === '' ? '-' : String(value);
    return [term, detail];
  }));
}

async function refreshServerSummary() {
  try {
    let response = await fetch('/api/xr-diagnostics/summary', {
      headers: { Accept: 'application/json' },
      cache: 'no-store',
    });
    if (!response.ok) throw new Error(`summary-${response.status}`);
    serverSummary = await response.json();
    serverSummaryError = null;
  } catch (error) {
    serverSummaryError = error?.message || 'summary-fetch-failed';
  }
  renderStatus();
}

function renderStatus(extra = {}) {
  let adapterState = adapter.getState();
  let sessionState = sessionController.getDiagnostics();
  let telemetry = createXRThreeSessionTelemetrySnapshot(sessionState);
  let health = createXRThreeSessionHealthSummary(telemetry, { fps });
  let visualAudit = createXRVisualTestSummary(scene, {
    eyeHeight: scene.userSpace?.eyeHeight,
    telemetry,
    adapter: adapterState,
  });
  let visualReadiness = createXRVisualAgentReadinessSummary({
    visual: visualAudit,
    expectedStatus: 'pass',
    pageErrors: [],
    requireBrowserArtifacts: false,
  });
  let sceneGeometry = createXRSceneGeometrySummary(scene, {
    eyeHeight: scene.userSpace?.eyeHeight,
  });
  let lowQualityCount = sceneGeometry.lowQualityCount;
  let minPixelsPerMeter = sceneGeometry.minPixelsPerMeter;
  let firstViewport = sceneGeometry.firstPanel?.contentViewport;
  let comfortWarnings = sceneGeometry.comfortWarningCount;
  let adjustedCount = sceneGeometry.poseAdjustedCount;
  let facingWarnings = sceneGeometry.facingWarningCount;
  let rotatedCount = sceneGeometry.rotationAdjustedCount;
  let dragResponse = adapterState.controller.diagnostics?.drag?.response || null;
  let hover = sessionState.hover || null;
  let drag = telemetry.drag || null;
  let draggingPanelId = sessionState.draggingPanelId || adapterState.controller.panelId || null;
  let firstComfort = sceneGeometry.firstPanel?.poseComfort;
  let firstFacing = sceneGeometry.firstPanel?.facing;
  let serverDiagnostics = createXRThreeDiagnosticServerSummary(serverSummary, { clientId: diagnosticClientId });
  let troubleshooting = createXRThreeTroubleshootingSummary(serverDiagnostics);
  let currentServerClient = serverDiagnostics.currentClient;
  let latestServerClient = serverDiagnostics.latestClient;
  let latestImmersiveClient = serverDiagnostics.latestImmersiveClient;
  let currentServerSession = serverDiagnostics.currentSession;
  let currentServerChecks = serverDiagnostics.currentChecks;
  let currentServerHtmlCanvas = serverDiagnostics.currentHtmlCanvas;
  let currentServerSceneQuality = serverDiagnostics.currentSceneQuality;
  let currentServerReadiness = serverDiagnostics.currentReadiness;
  let currentServerVisualReadiness = serverDiagnostics.currentVisualReadiness;
  let currentServerInteractionReadiness = serverDiagnostics.currentInteractionReadiness;
  let currentServerTexture = serverDiagnostics.currentTexture;
  let currentServerLaunchGate = serverDiagnostics.currentLaunchGate;
  let currentServerDeepGraph = serverDiagnostics.currentDeepGraph;
  let currentServerDeepGraphPreview = serverDiagnostics.currentDeepGraphPreview;
  let sessionOptions = telemetry.sessionOptions || {};
  let serverSessionOptions = currentServerSession?.sessionOptions || {};
  let inputSourceSummary = telemetry.inputSources?.length
    ? telemetry.inputSources.map((source) => source.targetRayMode || source.handedness || 'input').join(', ')
    : '-';
  let serverInputSourceSummary = serverDiagnostics.inputSourcesText || '-';
  let htmlCanvasSupport = livePanelPrepareSummary?.support || htmlCanvasRenderer.getSupport();
  let htmlCanvasDiagnostics = getHtmlCanvasDiagnosticsPayload() || htmlCanvasSupport.diagnostics || {};
  let liveHostState = livePanelPrepareSummary?.host || livePanelHost.getState();
  let liveRendererState = livePanelPrepareSummary?.renderer || htmlCanvasRenderer.getState();
  let livePrepared = livePanelPrepareSummary?.prepared || [];
  let textureSources = livePanelPrepareSummary?.textureSources || textureSourceSummaries;
  let textureBridgeState = livePanelPrepareSummary?.textureBridge || threeTextureBridge?.getState?.() || null;
  let textureResolverState = livePanelPrepareSummary?.textureResolver || threeTextureResolver?.getState?.() || null;
  let textureReadiness = getTextureReadiness();
  let interactionReadiness = createXRThreeInteractionReadinessSummary(telemetry, {
    texture: textureReadiness,
    expectedPanelCount: scene.panels.length,
  });
  let launchGate = getLaunchGateSummary();
  let readiness = createXRReadinessSummary({
    launchGate,
    htmlCanvas: htmlCanvasDiagnostics,
    texture: textureReadiness,
    sceneQuality: getSceneQualityDiagnosticsPayload(),
    sessionHealth: health,
    sessionActive: telemetry.active,
    mode,
  });
  let textureSourceSummary = textureSources.length
    ? textureSources.map((item) => `${item.panelId}:${item.source}/${item.mode}`).join(', ')
    : '-';
  let textureFallbackSummary = textureSources.filter((item) => item.fallback).length
    ? textureSources.filter((item) => item.fallback).map((item) => `${item.panelId}:${item.reason}`).join(', ')
    : '-';
  let textureStageSummary = textureBridgeRecords.length
    ? textureBridgeRecords.map((item) => `${item.panelId}:${item.stage || 'unknown'}`).join(', ')
    : '-';
  let textureResolverStageSummary = textureResolverState?.records?.length
    ? textureResolverState.records.map((item) => `${item.panelId}:${item.stage || 'unknown'}`).join(', ')
    : '-';
  let textureResolverQualitySummary = textureResolverState?.records?.length
    ? textureResolverState.records.map((item) => {
      let pixels = item.texturePixels ? `${item.texturePixels.width}x${item.texturePixels.height}` : '-';
      let ppm = item.pixelsPerMeter == null ? '-' : Math.round(item.pixelsPerMeter);
      return `${item.panelId}:${item.qualityStatus || 'unknown'} ${pixels} ${ppm}ppm`;
    }).join(', ')
    : '-';
  let textureResolverUploadSummary = textureResolverState?.records?.length
    ? textureResolverState.records.map((item) => `${item.panelId}:${item.redrawMode || 'unknown'} redraw:${item.redrawCount || 0} ${item.lastUploadMs == null ? '-' : `${item.lastUploadMs}ms`}`).join(', ')
    : '-';
  let textureResolverWarningSummary = textureResolverState?.records?.some((item) => item.qualityWarnings?.length)
    ? textureResolverState.records
      .filter((item) => item.qualityWarnings?.length)
      .map((item) => `${item.panelId}:${item.qualityWarnings.join(',')}`)
      .join(', ')
    : '-';
  let textureResolverRecommendationSummary = textureResolverState?.records?.some((item) => item.qualityRecommendations?.length)
    ? textureResolverState.records
      .filter((item) => item.qualityRecommendations?.length)
      .map((item) => `${item.panelId}:${item.qualityRecommendations.join(',')}`)
      .join(', ')
    : '-';
  setRows([
    ['URL', location.href],
    ['Client id', diagnosticClientId],
    ['Secure context', String(window.isSecureContext)],
    ['navigator.xr', String(Boolean(window.navigator?.xr))],
    ['requestSession', String(Boolean(support.apis?.requestSessionAvailable))],
    ['XRWebGLLayer', String(Boolean(support.apis?.XRWebGLLayerAvailable))],
    ['XRReferenceSpace', String(Boolean(support.apis?.XRReferenceSpaceAvailable))],
    ['XR features', Array.isArray(support.features) ? support.features.join(', ') : '-'],
    ['Renderer', 'three-webxr'],
    ['Provider adapter', 'symbiote-node/xr'],
    ['Drag model', adapterState.controller.dragModel || DRAG_MODEL],
    ['Render host', renderHost.getDiagnostics().version],
    ['Session controller', sessionState.version],
    ['Session status', sessionState.status],
    ['XR troubleshooting', troubleshooting.primaryIssue ? `${troubleshooting.status}:${troubleshooting.primaryIssue.code}` : troubleshooting.status],
    ['XR troubleshooting issues', troubleshooting.issueCodes.length ? troubleshooting.issueCodes.join(', ') : '-'],
    ['Visual audit', `${visualAudit.status}:${visualAudit.passCount}/${visualAudit.checkCount} pass`],
    ['Visual audit issues', formatVisualIssues(visualAudit)],
    ['XR visual readiness', `${visualReadiness.status}:${visualReadiness.reason}`],
    ['XR visual readiness checks', visualReadiness.checks.filter((check) => check.status !== 'pass').map((check) => check.id).join(', ') || 'ready'],
    ['XR interaction readiness', `${interactionReadiness.status}:${interactionReadiness.reason}`],
    ['XR interaction checks', interactionReadiness.issueCodes.length ? interactionReadiness.issueCodes.join(', ') : 'ready'],
    ['Visual panel map', formatVisualPanelMap(visualAudit)],
    ['Ray visuals', String(sessionState.controllerRayVisuals || 0)],
    ['Frame visuals', String(telemetry.panelFrameVisuals || adapterState.panelFrameVisualCount || 0)],
    ['XR readiness', `${readiness.status}:${readiness.reason}`],
    ['XR readiness checks', readiness.blockingChecks.length ? readiness.blockingChecks.map((check) => check.id).join(', ') : 'ready'],
    ['Launch reason', launchRecommendation.reason || '-'],
    ['Launch gate', launchGate.blocked ? `blocked:${launchGate.reason}` : 'ready'],
    ['Launch gate checks', launchGate.blockingChecks.length ? launchGate.blockingChecks.map((check) => check.id).join(', ') : '-'],
    ['Preferred mode', modeSelect.value || 'auto'],
    ['immersive-vr', String(Boolean(support.modes?.immersiveVr))],
    ['immersive-ar', String(Boolean(support.modes?.immersiveAr))],
    ['Mode', mode || '-'],
    ['Panels', String(adapterState.panelCount)],
    ['Live panels mounted', `${liveHostState.mounted || 0}/${scene.panels.length}`],
    ['Live panels prepared', `${livePrepared.filter((item) => item.prepared).length}/${scene.panels.length}`],
    ['HTML canvas mode', liveRendererState.preferredMode || htmlCanvasSupport.preferredMode || 'unsupported'],
    ['HTML canvas support', htmlCanvasDiagnostics.supported ? 'supported' : htmlCanvasDiagnostics.recommendation || 'unsupported'],
    ['HTML canvas availability', htmlCanvasDiagnostics.availability || '-'],
    ['HTML canvas origin trial', htmlCanvasDiagnostics.originTrial?.chromeMilestoneRange || '-'],
    ['HTML canvas origin trial meta', htmlCanvasDiagnostics.enablement?.originTrialMetaPresent ? `${htmlCanvasDiagnostics.enablement.originTrialMetaCount || 0} present` : 'missing'],
    ['HTML canvas origin trial configured', htmlCanvasDiagnostics.enablement?.originTrialConfigured ? 'yes' : 'no'],
    ['HTML canvas origin trial header', originTrialHeaderStatus.checked ? (originTrialHeaderStatus.present ? 'present' : originTrialHeaderStatus.error || 'missing') : 'checking'],
    ['HTML canvas origin trial route', originTrialHeaderStatus.diagnosticHeader || '-'],
    ['HTML canvas flag', htmlCanvasDiagnostics.originTrial?.flagUrl || '-'],
    ['HTML canvas render target', htmlCanvasDiagnostics.renderTargetAvailable ? 'available' : 'missing'],
    ['HTML canvas texture upload', htmlCanvasDiagnostics.textureUploadAvailable ? 'available' : 'missing'],
    ['HTML canvas missing', htmlCanvasDiagnostics.missing?.length ? htmlCanvasDiagnostics.missing.join(', ') : '-'],
    ['Three texture bridge', textureBridgeState?.version || '-'],
    ['Three texture resolver', textureResolverState?.version || '-'],
    ['Three resolver textures', textureResolverState ? `${textureResolverState.textureCount}/${scene.panels.length}` : '-'],
    ['Three texture applied', textureBridgeRecords.length ? `${textureBridgeRecords.filter((item) => item.textureApplied).length}/${textureBridgeRecords.length}` : '-'],
    ['Strict rendered panels', adapterState.hiddenPanelCount ? `${adapterState.renderedPanelCount}/${adapterState.panelCount}` : `${adapterState.panelCount}/${adapterState.panelCount}`],
    ['Strict hidden panels', adapterState.hiddenPanelCount ? `${adapterState.hiddenPanelCount}: ${adapterState.hiddenPanelIds.join(', ')}` : '-'],
    ['Texture strict', strictTextureMode ? 'required' : 'fallback allowed'],
    ['Texture ready', textureReadiness.total ? `${textureReadiness.ready}/${textureReadiness.total}` : '-'],
    ['Texture block reason', textureReadiness.reason || '-'],
    ['Texture failure stage', textureReadiness.stage || '-'],
    ['Texture required API', textureReadiness.blockingMissing?.length ? textureReadiness.blockingMissing.join(', ') : textureReadiness.supportRecommendation || '-'],
    ['Texture bridge stages', textureStageSummary],
    ['Texture resolver stages', textureResolverStageSummary],
    ['Texture resolver quality', textureResolverQualitySummary],
    ['Texture resolver upload', textureResolverUploadSummary],
    ['Texture resolver warnings', textureResolverWarningSummary],
    ['Texture resolver recommendations', textureResolverRecommendationSummary],
    ['Texture source path', textureSourceSummary],
    ['Texture fallback reason', textureFallbackSummary],
    ['Texture debug mode', `${textureDebugMode.mode}:${textureDebugMode.reason}`],
    ['Hit target', hover?.panelId || '-'],
    ['Frame target', formatFrameTarget(hover?.frameTarget)],
    ['Hit reticle', hover?.reticleVisible ? 'visible' : '-'],
    ['Hover', hover?.panelId || '-'],
    ['Selected', sessionState.selectedPanelId || '-'],
    ['Dragging', draggingPanelId || '-'],
    ['Drag frame target', formatFrameTarget(drag?.frameTarget)],
    ['Drag operation', drag?.resize?.operation || drag?.frameTarget?.operation || '-'],
    ['Drag resize handle', drag?.resize?.handle || drag?.frameTarget?.handle || '-'],
    ['Drag panel size', formatMeters(drag?.size)],
    ['Drag resize size', formatMeters(drag?.resize?.size)],
    ['Interaction events', String(sessionState.interactionEvents || 0)],
    ['Telemetry', telemetry.version],
    ['Session health', health.status],
    ['Health reason', health.reason],
    ['Health issues', health.issues.length ? health.issues.map((issue) => issue.code).join(', ') : '-'],
    ['Telemetry texture quality', formatTextureQualityCounts(telemetry.textureQuality)],
    ['Telemetry texture warnings', formatTextureQualityWarnings(telemetry.textureQuality)],
    ['Telemetry texture recommendations', formatTextureQualityRecommendations(telemetry.textureQuality)],
    ['Telemetry texture actions', formatTextureQualityActions(telemetry.textureQuality)],
    ['Session visibility', telemetry.visibilityState || '-'],
    ['Session blend', telemetry.environmentBlendMode || '-'],
    ['Session interaction', telemetry.interactionMode || '-'],
    ['Session features', telemetry.enabledFeatures?.length ? telemetry.enabledFeatures.join(', ') : '-'],
    ['Session input sources', inputSourceSummary],
    ['Session requested space', sessionOptions.referenceSpaceType || '-'],
    ['Session optional features', sessionOptions.optionalFeatures?.length ? sessionOptions.optionalFeatures.join(', ') : '-'],
    ['Session required features', sessionOptions.requiredFeatures?.length ? sessionOptions.requiredFeatures.join(', ') : '-'],
    ['Session dom overlay', sessionOptions.domOverlay == null ? '-' : String(Boolean(sessionOptions.domOverlay))],
    ['Server summary', serverSummary?.version || serverSummaryError || '-'],
    ['Server clients', serverSummary ? `${serverSummary.clientCount || 0}/${serverSummary.immersiveClientCount || 0} immersive` : '-'],
    ['Server current client', currentServerClient ? `${currentServerClient.eventCount} events` : '-'],
    ['Server current age', currentServerClient?.ageMs == null ? '-' : `${Math.round(currentServerClient.ageMs / 1000)}s`],
    ['Server current stale', currentServerClient ? String(Boolean(currentServerClient.stale)) : '-'],
    ['Server current phase', currentServerClient?.phase || '-'],
    ['Server launch gate', currentServerLaunchGate ? `${currentServerLaunchGate.blocked ? 'blocked' : 'ready'}:${currentServerLaunchGate.reason || 'ready'}` : '-'],
    ['Server launch gate checks', currentServerLaunchGate?.blockingChecks?.length ? currentServerLaunchGate.blockingChecks.map((check) => check.id).join(', ') : '-'],
    ['Server current mode', currentServerClient?.session?.mode || currentServerClient?.launch?.mode || '-'],
    ['Server current status', currentServerClient?.session?.status || '-'],
    ['Server current health', currentServerClient?.session?.health?.status || '-'],
    ['Server current texture quality', formatTextureQualityCounts(currentServerSession?.textureQuality)],
    ['Server current texture warnings', formatTextureQualityWarnings(currentServerSession?.textureQuality)],
    ['Server current texture recommendations', formatTextureQualityRecommendations(currentServerSession?.textureQuality)],
    ['Server current texture actions', formatTextureQualityActions(currentServerSession?.textureQuality)],
    ['Server current error', currentServerClient?.lastError || '-'],
    ['Server current visibility', currentServerSession?.visibilityState || '-'],
    ['Server current blend', currentServerSession?.environmentBlendMode || '-'],
    ['Server current interaction', currentServerSession?.interactionMode || '-'],
    ['Server current features', currentServerSession?.enabledFeatures?.length ? currentServerSession.enabledFeatures.join(', ') : '-'],
    ['Server current input sources', serverInputSourceSummary],
    ['Server hover frame target', formatFrameTarget(currentServerSession?.hover?.frameTarget)],
    ['Server drag frame target', formatFrameTarget(currentServerSession?.drag?.frameTarget)],
    ['Server drag operation', currentServerSession?.drag?.resize?.operation || currentServerSession?.drag?.frameTarget?.operation || '-'],
    ['Server drag resize handle', currentServerSession?.drag?.resize?.handle || currentServerSession?.drag?.frameTarget?.handle || '-'],
    ['Server drag panel size', formatMeters(currentServerSession?.drag?.size)],
    ['Server drag resize size', formatMeters(currentServerSession?.drag?.resize?.size)],
    ['Server current requested space', serverSessionOptions.referenceSpaceType || '-'],
    ['Server current optional features', serverSessionOptions.optionalFeatures?.length ? serverSessionOptions.optionalFeatures.join(', ') : '-'],
    ['Server current required features', serverSessionOptions.requiredFeatures?.length ? serverSessionOptions.requiredFeatures.join(', ') : '-'],
    ['Server current dom overlay', serverSessionOptions.domOverlay == null ? '-' : String(Boolean(serverSessionOptions.domOverlay))],
    ['Server current frames', currentServerSession?.frames == null ? '-' : String(currentServerSession.frames)],
    ['Server current panels', currentServerSession?.panelCount == null ? '-' : String(currentServerSession.panelCount)],
    ['Server current frame visuals', currentServerSession?.panelFrameVisuals == null ? '-' : String(currentServerSession.panelFrameVisuals)],
    ['Server current controllers', currentServerSession?.controllers == null ? '-' : String(currentServerSession.controllers)],
    ['Server current rays', currentServerSession?.controllerRayVisuals == null ? '-' : String(currentServerSession.controllerRayVisuals)],
    ['Server current reticle', currentServerSession?.hitReticleVisuals == null ? '-' : String(currentServerSession.hitReticleVisuals)],
    ['Server current fps', serverDiagnostics.currentRunning && currentServerChecks.fps != null ? String(currentServerChecks.fps) : '-'],
    ['Server HTML canvas availability', currentServerHtmlCanvas?.availability || '-'],
    ['Server HTML canvas origin trial meta', currentServerHtmlCanvas?.enablement?.originTrialMetaPresent ? `${currentServerHtmlCanvas.enablement.originTrialMetaCount || 0} present` : currentServerHtmlCanvas ? 'missing' : '-'],
    ['Server HTML canvas origin trial configured', currentServerHtmlCanvas?.enablement ? (currentServerHtmlCanvas.enablement.originTrialConfigured ? 'yes' : 'no') : '-'],
    ['Server HTML canvas origin trial header', currentServerHtmlCanvas?.responseHeader ? (currentServerHtmlCanvas.responseHeader.originTrialPresent ? 'present' : currentServerHtmlCanvas.responseHeader.error || 'missing') : '-'],
    ['Server HTML canvas origin trial route', currentServerHtmlCanvas?.responseHeader?.diagnosticHeader || '-'],
    ['Server HTML canvas flag', currentServerHtmlCanvas?.originTrial?.flagUrl || '-'],
    ['Server HTML canvas texture upload', currentServerHtmlCanvas ? (currentServerHtmlCanvas.textureUploadAvailable ? 'available' : 'missing') : '-'],
    ['Server scene quality', currentServerSceneQuality ? `${currentServerSceneQuality.status}:${currentServerSceneQuality.lowQualityCount}/${currentServerSceneQuality.total} low` : '-'],
    ['Server scene warnings', currentServerSceneQuality ? `comfort:${currentServerSceneQuality.comfortWarningCount} facing:${currentServerSceneQuality.facingWarningCount}` : '-'],
    ['Server XR readiness', currentServerReadiness ? `${currentServerReadiness.status}:${currentServerReadiness.reason}` : '-'],
    ['Server XR readiness checks', currentServerReadiness?.blockingChecks?.length ? currentServerReadiness.blockingChecks.map((check) => check.id).join(', ') : currentServerReadiness ? 'ready' : '-'],
    ['Server visual readiness', currentServerVisualReadiness ? `${currentServerVisualReadiness.status}:${currentServerVisualReadiness.reason}` : '-'],
    ['Server visual checks', currentServerVisualReadiness?.checks?.length
      ? (currentServerVisualReadiness.checks.filter((check) => check.status !== 'pass').map((check) => check.id).join(', ') || 'ready')
      : '-'],
    ['Server interaction readiness', currentServerInteractionReadiness ? `${currentServerInteractionReadiness.status}:${currentServerInteractionReadiness.reason}` : '-'],
    ['Server interaction checks', currentServerInteractionReadiness?.issueCodes?.length ? currentServerInteractionReadiness.issueCodes.join(', ') : currentServerInteractionReadiness ? 'ready' : '-'],
    ['Server texture stage', currentServerTexture?.stage || '-'],
    ['Server texture mode', currentServerTexture?.debugMode?.mode || '-'],
    ['Server texture ready', currentServerTexture ? `${currentServerTexture.ready}/${currentServerTexture.total}` : '-'],
    ['Server texture resolver', currentServerTexture?.resolverVersion || '-'],
    ['Server resolver textures', currentServerTexture ? `${currentServerTexture.resolverTextures || 0}/${currentServerTexture.total || 0}` : '-'],
    ['Server resolver stages', currentServerTexture?.resolverStages?.length ? currentServerTexture.resolverStages.map((item) => `${item.panelId}:${item.stage || 'unknown'}`).join(', ') : '-'],
    ['Server texture required API', currentServerTexture?.requiredApi?.length ? currentServerTexture.requiredApi.join(', ') : '-'],
    ['Server deep graph', currentServerDeepGraph ? `${currentServerDeepGraph.nodeCount} nodes / ${currentServerDeepGraph.edgeCount} edges` : '-'],
    ['Server deep focus', currentServerDeepGraph?.focusNodeId || currentServerDeepGraph?.focus?.nodeId || '-'],
    ['Server deep preview', currentServerDeepGraphPreview?.summary
      ? `${currentServerDeepGraphPreview.summary.status} ${currentServerDeepGraphPreview.summary.nodes?.visible || 0}/${currentServerDeepGraphPreview.summary.nodes?.source || 0} nodes`
      : '-'],
    ['Server deep focus preview', currentServerDeepGraphPreview?.summary?.focus
      ? `${currentServerDeepGraphPreview.summary.focus.visible ? 'visible' : 'hidden'} ${currentServerDeepGraphPreview.summary.focus.edges?.visible || 0}/${currentServerDeepGraphPreview.summary.focus.edges?.source || 0} edges`
      : '-'],
    ['Server current last event', serverDiagnostics.currentLastEventTimeline.text || '-'],
    ['Server current events', serverDiagnostics.currentTimeline.text || '-'],
    ['Server latest client', latestServerClient?.clientId || '-'],
    ['Server immersive client', latestImmersiveClient?.clientId || '-'],
    ['Server immersive health', serverDiagnostics.latestImmersiveHealth || '-'],
    ['Drag response', dragResponse ? `${dragResponse.smoothing}/${dragResponse.maxStep}m` : '-'],
    ['Drag applied', dragResponse?.appliedDistance == null ? '-' : `${dragResponse.appliedDistance.toFixed(3)}m`],
    ['Texture quality', lowQualityCount ? `${lowQualityCount} low` : 'readable'],
    ['Texture px/m', Number.isFinite(minPixelsPerMeter) ? Math.round(minPixelsPerMeter) : '-'],
    ['Panel viewport', firstViewport ? `${firstViewport.width}x${firstViewport.height}` : '-'],
    ['Pose comfort', comfortWarnings ? `${comfortWarnings} warnings` : 'comfortable'],
    ['Pose adjusted', adjustedCount ? String(adjustedCount) : '0'],
    ['Facing', facingWarnings ? `${facingWarnings} warnings` : 'aligned'],
    ['Rotation adjusted', rotatedCount ? String(rotatedCount) : '0'],
    ['Panel distance', firstComfort ? `${firstComfort.distance}m` : '-'],
    ['Panel angle', firstComfort ? `${firstComfort.angles.horizontal}deg/${firstComfort.angles.vertical}deg` : '-'],
    ['Panel yaw', firstFacing ? `${firstFacing.rotation[1]}deg -> ${firstFacing.targetRotation[1]}deg` : '-'],
    ['FPS', fps ? String(fps) : '-'],
    ['Last frame', extra.frame || '-'],
    ['Last error', extra.error || '-'],
  ]);
}

function updatePanelMaterials() {
  return updateXRThreePanelMaterialStates({
    adapter,
    sessionState: sessionController.getDiagnostics(),
    themeSnapshot,
  });
}

function onResize() {
  renderHost.resize({
    scene,
    stageElement: main,
    pixelRatio: window.devicePixelRatio,
  });
}

async function refreshSupport() {
  support = await getWebXRSupport(window);
  modeSelect.querySelector('option[value="immersive-ar"]').disabled = !support.modes.immersiveAr;
  modeSelect.querySelector('option[value="immersive-vr"]').disabled = !support.modes.immersiveVr;
  launchRecommendation = createWebXRLaunchRecommendation(support, {
    preferredMode: modeSelect.value || null,
  });
  mode = launchRecommendation.mode;
  let launchGate = getLaunchGateSummary();
  enterButton.disabled = !launchGate.canStart;
  enterButton.textContent = launchGate.blocked
    ? `XR blocked: ${launchGate.reason}`
    : launchRecommendation.canLaunch
    ? `Enter ${mode}`
    : `XR blocked: ${launchRecommendation.reason}`;
  renderStatus();
  postDiagnostic('three-panels-support-detected', { support, launchRecommendation, launchGate });
}

async function startSession() {
  if (!mode) return;
  let launchGate = getLaunchGateSummary({ requireUserActivation: true });
  if (!launchGate.canStart) {
    postDiagnostic('three-panels-session-blocked', { launchGate, error: launchGate.reason });
    renderStatus({ error: launchGate.reason });
    return;
  }
  enterButton.disabled = true;
  postDiagnostic('three-panels-session-start-requested', { mode });
  scheduleSessionWatchdog();
  let sessionOptions = createXRThreeSessionOptions(mode, {
    domOverlayRoot: document.body,
    includeLocalFeature: true,
  });
  let result = await sessionController.start(mode, {
    target: { ok: true, renderer, scene: xrScene, camera },
    ...sessionOptions,
  });
  if (result.ok) {
    postDiagnostic('three-panels-session-started', { mode });
    renderStatus();
    return;
  }
  enterButton.disabled = !mode;
  postDiagnostic('three-panels-session-error', { error: result.reason || 'session-failed' });
  renderStatus({ error: result.reason || 'session-failed' });
}

function updateFrameStats(time) {
  frameCount++;
  if (sessionWatchdogTimer) {
    window.clearTimeout(sessionWatchdogTimer);
    sessionWatchdogTimer = null;
  }
  if (time - lastFpsTime >= 1000) {
    fps = frameCount;
    frameCount = 0;
    lastFpsTime = time;
    renderStatus({ frame: Math.round(time) });
  }
  let sessionState = sessionController.getDiagnostics();
  if (sessionState.status === 'running' && time - lastTelemetryTime >= 2000) {
    lastTelemetryTime = time;
    let telemetry = createXRThreeSessionTelemetrySnapshot(sessionState, {
      now: Date.now(),
    });
    let health = createXRThreeSessionHealthSummary(telemetry, { fps });
    postDiagnostic('three-panels-session-telemetry', {
      fps,
      telemetry: { ...telemetry, health },
    });
  }
}

renderHost.startLoop({
  target: { ok: true, renderer, scene: xrScene, camera },
  onFrame({ time }) {
    updateFrameStats(time);
    updatePanelMaterials();
  },
});

enterButton.addEventListener('click', startSession);
modeSelect.addEventListener('change', refreshSupport);
strictTextureInput.addEventListener('change', () => {
  textureDebugMode = createXRTextureDebugModeSummary({
    texture: strictTextureInput.checked ? 'strict' : 'fallback',
  });
  strictTextureMode = textureDebugMode.strict;
  let url = new URL(location.href);
  url.searchParams.set('texture', textureDebugMode.queryValue);
  history.replaceState(null, '', url);
  mountLivePanels();
  refreshSupport();
});
window.addEventListener('resize', onResize);
window.addEventListener('pagehide', () => {
  renderHost.stopLoop({ renderer });
  if (heartbeatTimer) window.clearInterval(heartbeatTimer);
  if (sessionWatchdogTimer) window.clearTimeout(sessionWatchdogTimer);
});

onResize();
mountLivePanels();
refreshOriginTrialHeaderStatus();
refreshSupport();
refreshServerSummary();
window.setInterval(refreshServerSummary, 3000);
heartbeatTimer = window.setInterval(postHeartbeat, 10000);
