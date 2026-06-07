import * as THREE from 'three';
import {
  createStableXRDiagnosticClientId,
  createXRThreeDiagnosticPayload,
  createXRThreeSessionOptions,
  createXRThreeTextureCapabilitySummary,
  getWebXRSupport,
  readXRHtmlCanvasOriginTrialHeaderStatus,
} from 'symbiote-ui/xr';

const HTML_IN_CANVAS_ORIGIN_TRIAL_DIAGNOSTIC_HEADER = 'X-Agent-Portal-Origin-Trial';

const canvas = document.querySelector('#xr-canvas');
const source = document.querySelector('#html-source');
const enterButton = document.querySelector('#enter');
const modeSelect = document.querySelector('#mode');
const statusList = document.querySelector('#status');
const diagnosticClientId = createStableXRDiagnosticClientId({
  prefix: 'xr-htmltexture',
  globalThis: window,
}).id;

let support = {
  apis: {
    secureContext: window.isSecureContext,
    navigatorXrAvailable: Boolean(navigator.xr),
  },
  modes: {
    inline: false,
    immersiveVr: false,
    immersiveAr: false,
  },
};
let originTrialHeaderStatus = {
  checked: false,
  present: false,
  diagnosticHeader: null,
  error: null,
};
let activeMode = null;
let activeSession = null;
let frames = 0;
let frameErrors = 0;
let lastFrameAt = 0;
let fps = 0;
let lastFpsAt = 0;
let lastError = null;
let lastPaint = null;
let lastPostAt = 0;

canvas.setAttribute('layoutsubtree', '');
source.dataset.textureKey = `minimal:${Date.now().toString(36)}`;

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  alpha: true,
});
renderer.xr.enabled = true;
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;

const camera = new THREE.PerspectiveCamera(55, 1, 0.05, 20);
camera.position.set(0, 1.52, 1.6);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x10141d);
scene.add(new THREE.HemisphereLight(0xffffff, 0x1b2330, 1.4));

const texture = new THREE.HTMLTexture(source);
texture.colorSpace = THREE.SRGBColorSpace;
texture.magFilter = THREE.LinearFilter;
texture.minFilter = THREE.LinearFilter;
texture.generateMipmaps = false;
texture.needsUpdate = true;

const material = new THREE.MeshBasicMaterial({
  map: texture,
  side: THREE.DoubleSide,
  toneMapped: false,
});
const panel = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.675), material);
panel.position.set(0, 1.45, -1.8);
scene.add(panel);

if (typeof canvas.addEventListener === 'function') {
  canvas.addEventListener('paint', (event) => {
    let changedElements = event?.changedElements;
    lastPaint = {
      at: new Date().toISOString(),
      changedElementCount: Array.isArray(changedElements) ? changedElements.length : null,
      changedElementsPresent: Array.isArray(changedElements),
      sourceChanged: Array.isArray(changedElements) ? changedElements.includes(source) : null,
    };
  });
}

window.addEventListener('error', (event) => {
  recordError(event.error || event.message, 'window-error');
});
window.addEventListener('unhandledrejection', (event) => {
  recordError(event.reason, 'unhandledrejection');
});

function recordError(error, stage) {
  frameErrors += 1;
  lastError = {
    stage,
    name: error?.name || 'Error',
    message: error?.message || String(error || 'unknown-error'),
    stack: error?.stack ? String(error.stack).slice(0, 1200) : null,
  };
  postDiagnostic(`${stage}`, { error: lastError.name, message: lastError.message });
  renderStatus();
}

function resize() {
  let width = Math.max(1, canvas.clientWidth || window.innerWidth || 1280);
  let height = Math.max(1, canvas.clientHeight || window.innerHeight || 720);
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}

function render(time = performance.now()) {
  try {
    renderer.render(scene, camera);
    frames += 1;
    lastFrameAt = time;
    if (time - lastFpsAt >= 1000) {
      fps = frames;
      frames = 0;
      lastFpsAt = time;
      renderStatus();
      if (time - lastPostAt >= 2500) {
        lastPostAt = time;
        postDiagnostic('htmltexture-minimal-frame');
      }
    }
  } catch (error) {
    recordError(error, 'htmltexture-minimal-render-error');
  }
}

function readGlSupport() {
  let gl = renderer.getContext?.();
  return {
    texElementImage2D: typeof gl?.texElementImage2D === 'function',
    contextType: gl?.constructor?.name || null,
    canvasIsRendererCanvas: renderer.domElement === canvas,
  };
}

function readElementMetrics() {
  let rect = source.getBoundingClientRect?.() || {};
  return {
    parentIsRendererCanvas: source.parentNode === canvas,
    parentTag: source.parentNode?.tagName || source.parentNode?.nodeName || null,
    offsetWidth: source.offsetWidth || 0,
    offsetHeight: source.offsetHeight || 0,
    clientWidth: source.clientWidth || 0,
    clientHeight: source.clientHeight || 0,
    rectWidth: Number(rect.width || 0),
    rectHeight: Number(rect.height || 0),
  };
}

function getHtmlCanvasDiagnostics() {
  let glSupport = readGlSupport();
  let element = readElementMetrics();
  return {
    version: 'xr-htmltexture-minimal-html-canvas-v1',
    supported: canvas.hasAttribute('layoutsubtree') && glSupport.texElementImage2D && typeof THREE.HTMLTexture === 'function',
    availability: glSupport.texElementImage2D && typeof THREE.HTMLTexture === 'function' ? 'texture-ready' : 'html-in-canvas-unsupported',
    recommendation: glSupport.texElementImage2D ? 'use-html-in-canvas' : 'enable-CanvasDrawElement',
    renderTargetAvailable: glSupport.texElementImage2D,
    textureUploadAvailable: glSupport.texElementImage2D,
    apis: {
      layoutsubtree: canvas.hasAttribute('layoutsubtree'),
      requestPaint: typeof canvas.requestPaint === 'function',
      paintEvent: 'onpaint' in canvas,
      texElementImage2D: glSupport.texElementImage2D,
      getElementTransform: typeof canvas.getElementTransform === 'function',
    },
    missingCore: [
      !canvas.hasAttribute('layoutsubtree') ? 'layoutsubtree' : null,
      !glSupport.texElementImage2D ? 'texElementImage2D' : null,
      typeof THREE.HTMLTexture !== 'function' ? 'three-html-texture' : null,
    ].filter(Boolean),
    threeTexture: createXRThreeTextureCapabilitySummary(THREE, {
      diagnostics: { textureUploadAvailable: glSupport.texElementImage2D },
      modes: { webgl: glSupport.texElementImage2D },
    }),
    responseHeader: {
      checked: originTrialHeaderStatus.checked,
      originTrialPresent: originTrialHeaderStatus.present,
      diagnosticHeader: originTrialHeaderStatus.diagnosticHeader,
      error: originTrialHeaderStatus.error,
    },
    element,
    rendererCanvas: {
      width: canvas.width || 0,
      height: canvas.height || 0,
      clientWidth: canvas.clientWidth || 0,
      clientHeight: canvas.clientHeight || 0,
      layoutsubtree: canvas.hasAttribute('layoutsubtree'),
    },
    lastPaint,
  };
}

function getTextureDiagnostics() {
  let element = readElementMetrics();
  let glSupport = readGlSupport();
  let ready = Boolean(material.map === texture && texture.isHTMLTexture && element.parentIsRendererCanvas && glSupport.texElementImage2D && !lastError);
  return {
    version: 'xr-htmltexture-minimal-texture-v1',
    strict: true,
    total: 1,
    ready: ready ? 1 : 0,
    blocked: !ready,
    reason: ready ? null : lastError?.message || (!glSupport.texElementImage2D ? 'texElementImage2D-missing' : !element.parentIsRendererCanvas ? 'source-not-renderer-canvas-child' : 'waiting-for-first-render'),
    stage: ready ? 'three-html-texture-rendered' : lastError?.stage || 'three-html-texture-preflight',
    bridgeStages: [{
      panelId: 'minimal-panel',
      stage: ready ? 'three-html-texture-rendered' : lastError?.stage || 'three-html-texture-preflight',
      source: 'html-in-canvas',
      mode: 'webgl',
      ok: ready,
      reason: ready ? null : lastError?.message || null,
      textureApplied: material.map === texture,
    }],
    resolverStages: [{
      panelId: 'minimal-panel',
      stage: ready ? 'three-html-texture-rendered' : lastError?.stage || 'three-html-texture-preflight',
      ok: ready,
      reason: ready ? null : lastError?.message || null,
      textureApplied: material.map === texture,
      width: element.offsetWidth,
      height: element.offsetHeight,
      textureKind: texture.isHTMLTexture ? 'html-texture' : 'unknown',
      textureVersion: texture.version || 0,
      needsUpdate: texture.needsUpdate === true,
    }],
  };
}

function createSessionDiagnostics() {
  return {
    version: 'xr-three-session-telemetry-v1',
    status: activeSession ? 'running' : 'preflight',
    mode: activeMode,
    active: Boolean(activeSession),
    frames,
    frameErrors,
    lastError: lastError?.name || null,
    health: {
      version: 'xr-three-session-health-v1',
      status: lastError ? 'blocked' : activeSession ? 'ok' : 'idle',
      reason: lastError?.message || (activeSession ? 'running' : 'not-started'),
      checks: {
        running: Boolean(activeSession),
        active: Boolean(activeSession),
        frames,
        panelCount: 1,
        fps,
      },
      issues: lastError ? [{ severity: 'error', code: lastError.stage, value: lastError.message }] : [],
    },
  };
}

function postDiagnostic(event, extra = {}) {
  let htmlCanvas = getHtmlCanvasDiagnostics();
  let texturePayload = getTextureDiagnostics();
  let payload = createXRThreeDiagnosticPayload({
    clientId: diagnosticClientId,
    event,
    pageUrl: location.href,
    surface: {
      surfaceKind: 'harness',
      entrypoint: 'xr-htmltexture-minimal',
      projectId: null,
      targetSection: 'htmltexture-minimal',
      panelContentKind: 'single-htmltexture-canvas-child',
    },
    secureContext: window.isSecureContext,
    navigatorXr: Boolean(navigator.xr),
    support,
    modes: support.modes,
    launch: {
      canLaunch: Boolean(support.modes.immersiveVr || support.modes.immersiveAr),
      mode: activeMode || modeSelect.value || null,
      reason: support.modes.immersiveVr || support.modes.immersiveAr ? 'ready' : 'webxr-session-mode-unsupported',
    },
    mode: activeMode,
    sessionDiagnostics: createSessionDiagnostics(),
    htmlCanvas,
    texture: texturePayload,
    extra: {
      ...extra,
      message: extra.message || lastError?.message || null,
      failureStage: extra.failureStage || lastError?.stage || null,
      sourceMetrics: htmlCanvas.element,
      rendererCanvas: htmlCanvas.rendererCanvas,
      texture: texturePayload,
    },
    error: extra.error || lastError?.name || null,
  });
  fetch('/api/xr-diagnostics/log', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    keepalive: true,
  }).catch(() => {});
}

function row(label, value) {
  let term = document.createElement('dt');
  let detail = document.createElement('dd');
  term.textContent = label;
  detail.textContent = value == null || value === '' ? '-' : String(value);
  return [term, detail];
}

function renderStatus() {
  let htmlCanvas = getHtmlCanvasDiagnostics();
  let textureStatus = getTextureDiagnostics();
  statusList.replaceChildren(...[
    row('Client', diagnosticClientId),
    row('Secure context', window.isSecureContext ? 'yes' : 'no'),
    row('XR modes', `vr:${support.modes.immersiveVr ? 'yes' : 'no'} ar:${support.modes.immersiveAr ? 'yes' : 'no'}`),
    row('layoutsubtree', htmlCanvas.apis.layoutsubtree ? 'yes' : 'no'),
    row('requestPaint', htmlCanvas.apis.requestPaint ? 'yes' : 'no'),
    row('texElementImage2D', htmlCanvas.apis.texElementImage2D ? 'yes' : 'no'),
    row('Three HTMLTexture', typeof THREE.HTMLTexture === 'function' ? `available:${THREE.REVISION || 'unknown'}` : 'missing'),
    row('Source parent', htmlCanvas.element.parentIsRendererCanvas ? 'renderer canvas' : htmlCanvas.element.parentTag || 'missing'),
    row('Source size', `${htmlCanvas.element.offsetWidth}x${htmlCanvas.element.offsetHeight}`),
    row('Canvas size', `${htmlCanvas.rendererCanvas.width}x${htmlCanvas.rendererCanvas.height}`),
    row('Texture ready', `${textureStatus.ready}/${textureStatus.total}`),
    row('Texture stage', textureStatus.stage),
    row('Texture reason', textureStatus.reason),
    row('Session', activeSession ? `running:${activeMode}` : 'not started'),
    row('FPS', fps),
    row('Frame errors', frameErrors),
    row('Last error', lastError ? `${lastError.stage}: ${lastError.message}` : '-'),
    row('Origin-Trial header', originTrialHeaderStatus.present ? 'present' : originTrialHeaderStatus.checked ? 'absent' : 'pending'),
  ].flat());
}

async function refreshSupport() {
  support = await getWebXRSupport(window);
  let preferred = modeSelect.value;
  let canStart = preferred === 'immersive-ar' ? support.modes.immersiveAr : support.modes.immersiveVr;
  enterButton.disabled = !canStart;
  enterButton.textContent = canStart ? `Enter ${preferred}` : `XR unavailable: ${preferred}`;
  renderStatus();
  postDiagnostic('htmltexture-minimal-support-detected');
}

async function refreshOriginTrialHeaderStatus() {
  originTrialHeaderStatus = await readXRHtmlCanvasOriginTrialHeaderStatus(location, {
    diagnosticHeader: HTML_IN_CANVAS_ORIGIN_TRIAL_DIAGNOSTIC_HEADER,
  });
  renderStatus();
}

async function startSession() {
  activeMode = modeSelect.value || 'immersive-vr';
  enterButton.disabled = true;
  postDiagnostic('htmltexture-minimal-session-start-requested');
  try {
    let sessionOptions = createXRThreeSessionOptions(activeMode, {
      domOverlayRoot: document.body,
      includeLocalFeature: true,
    });
    let session = await navigator.xr.requestSession(activeMode, {
      requiredFeatures: sessionOptions.requiredFeatures,
      optionalFeatures: sessionOptions.optionalFeatures,
      domOverlay: sessionOptions.domOverlayRoot ? { root: sessionOptions.domOverlayRoot } : undefined,
    });
    activeSession = session;
    renderer.xr.setReferenceSpaceType?.(sessionOptions.referenceSpaceType);
    await renderer.xr.setSession(session);
    session.addEventListener('end', () => {
      activeSession = null;
      postDiagnostic('htmltexture-minimal-session-ended');
      refreshSupport();
    });
    postDiagnostic('htmltexture-minimal-session-started');
    renderStatus();
  } catch (error) {
    activeSession = null;
    recordError(error, 'htmltexture-minimal-session-error');
    await refreshSupport();
  }
}

function init() {
  resize();
  renderStatus();
  renderer.setAnimationLoop(render);
  if (typeof canvas.requestPaint === 'function') {
    canvas.requestPaint();
  }
  refreshOriginTrialHeaderStatus();
  refreshSupport();
}

window.addEventListener('resize', () => {
  resize();
  renderStatus();
});
window.addEventListener('pagehide', () => {
  renderer.setAnimationLoop(null);
});
modeSelect.addEventListener('change', refreshSupport);
enterButton.addEventListener('click', startSession);

init();
