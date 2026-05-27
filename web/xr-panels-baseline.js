import {
  WEBXR_FEATURES,
  WEBXR_MODES,
  createXRWebGLLayerPanelRenderer,
  createWebXRLayer,
  createWebXRLaunchRecommendation,
  createWebXRRenderLoop,
  endWebXRSession,
  getWebXRSupport,
  requestWebXRReferenceSpace,
  requestWebXRSession,
  syncWebXRCanvas,
} from 'symbiote-node/xr';

const enterButton = document.querySelector('#enter');
const statusList = document.querySelector('#status');
const canvas = document.querySelector('#canvas');

const panels = [
  { id: 'front', position: [0, 1.34, -1.75], rotation: [0, 0, 0], size: [0.84, 0.52] },
  { id: 'left', position: [-0.86, 1.28, -1.58], rotation: [0, 24, 0], size: [0.62, 0.48] },
  { id: 'right', position: [0.86, 1.28, -1.58], rotation: [0, -24, 0], size: [0.62, 0.48] },
  { id: 'lower', position: [0, 0.86, -1.36], rotation: [0, 0, 0], size: [0.78, 0.34] },
];

let support = null;
let recommendation = null;
let session = null;
let loop = null;
let gl = null;
let layerRenderer = createXRWebGLLayerPanelRenderer();
let frameCount = 0;
let lastFrameTime = 0;
let fps = 0;

function postDiagnostic(event, extra = {}) {
  fetch('/api/xr-diagnostics/log', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      event,
      pageUrl: location.href,
      secureContext: window.isSecureContext,
      navigatorXr: Boolean(window.navigator?.xr),
      panels: panels.map((panel) => ({
        id: panel.id,
        position: panel.position,
        rotation: panel.rotation,
        size: panel.size,
      })),
      ...extra,
    }),
    keepalive: true,
  }).catch(() => {});
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

function renderStatus(extra = {}) {
  setRows([
    ['URL', location.href],
    ['Secure context', String(window.isSecureContext)],
    ['navigator.xr', String(Boolean(window.navigator?.xr))],
    ['XRWebGLLayer', String(typeof window.XRWebGLLayer === 'function')],
    ['immersive-vr', String(Boolean(support?.modes?.immersiveVr))],
    ['immersive-ar', String(Boolean(support?.modes?.immersiveAr))],
    ['Launch', recommendation?.canLaunch ? recommendation.mode : recommendation?.reason],
    ['Session', session ? 'running' : 'stopped'],
    ['Reference space', extra.referenceSpace || '-'],
    ['Panels', String(panels.length)],
    ['Views', extra.views || '-'],
    ['FPS', fps ? String(fps) : '-'],
    ['Last frame', extra.frame || '-'],
    ['Last error', extra.error || '-'],
  ]);
}

function renderProviderFrame(time, frame, referenceSpace, layer) {
  frameCount++;
  let result = layerRenderer.renderFrame({
    gl,
    layer,
    frame,
    referenceSpace,
    scene: { panels },
  });
  if (time - lastFrameTime >= 1000) {
    fps = frameCount;
    frameCount = 0;
    lastFrameTime = time;
    renderStatus({
      views: result.viewCount || '-',
      frame: Math.round(time),
      error: result.rendered ? null : result.reason,
    });
  }
}

async function refreshSupport() {
  support = await getWebXRSupport(window);
  recommendation = createWebXRLaunchRecommendation(support, {
    preferredMode: support?.modes?.immersiveAr ? WEBXR_MODES.immersiveAr : WEBXR_MODES.immersiveVr,
  });
  enterButton.disabled = !recommendation.canLaunch;
  enterButton.textContent = recommendation.canLaunch ? `Enter ${recommendation.mode}` : `XR blocked: ${recommendation.reason}`;
  renderStatus();
  postDiagnostic('empty-panels-support-detected', {
    modes: support?.modes,
    launch: recommendation,
  });
}

async function startSession() {
  if (!recommendation?.canLaunch) return;
  enterButton.disabled = true;
  postDiagnostic('empty-panels-session-start-requested', { mode: recommendation.mode });
  try {
    gl = canvas.getContext('webgl', { xrCompatible: true, alpha: true, antialias: true });
    if (!gl) throw new Error('webgl-unavailable');
    if (gl.makeXRCompatible) await gl.makeXRCompatible();

    let sessionResult = await requestWebXRSession(window, recommendation.mode, {
      optionalFeatures: [
        WEBXR_FEATURES.local,
        WEBXR_FEATURES.localFloor,
        WEBXR_FEATURES.boundedFloor,
      ],
    });
    if (!sessionResult.ok) throw new Error(sessionResult.reason || sessionResult.message || 'session-request-failed');
    session = sessionResult.session;
    let layerResult = createWebXRLayer(window, session, gl);
    if (!layerResult.ok) throw new Error(layerResult.reason || 'xr-layer-failed');
    await session.updateRenderState?.({ baseLayer: layerResult.layer });
    syncWebXRCanvas(canvas, gl, session);

    let referenceType = recommendation.mode === WEBXR_MODES.immersiveAr ? WEBXR_FEATURES.local : WEBXR_FEATURES.localFloor;
    let referenceResult = await requestWebXRReferenceSpace(session, referenceType);
    if (!referenceResult.ok && referenceType !== WEBXR_FEATURES.local) {
      referenceResult = await requestWebXRReferenceSpace(session, WEBXR_FEATURES.local);
    }
    if (!referenceResult.ok) throw new Error(referenceResult.reason || 'reference-space-failed');

    loop = createWebXRRenderLoop(session, (time, frame) => {
      renderProviderFrame(time, frame, referenceResult.referenceSpace, layerResult.layer);
    });
    renderStatus({ referenceSpace: referenceResult.type });
    postDiagnostic('empty-panels-session-started', {
      mode: recommendation.mode,
      referenceSpace: referenceResult.type,
      layer: 'XRWebGLLayer',
    });
  } catch (error) {
    postDiagnostic('empty-panels-session-error', { error: error?.message || String(error) });
    renderStatus({ error: error?.message || String(error) });
    enterButton.disabled = !recommendation?.canLaunch;
  }
}

enterButton.addEventListener('click', startSession);
window.addEventListener('pagehide', async () => {
  loop?.stop();
  loop = null;
  if (session) {
    await endWebXRSession(session).catch(() => {});
    session = null;
  }
});

refreshSupport();
