import {
  WEBXR_FEATURES,
  WEBXR_MODES,
  createWebXRLayer,
  createWebXRLaunchRecommendation,
  createWebXRRenderLoop,
  endWebXRSession,
  getWebXRSupport,
  installWebXREmulationRuntime,
  requestWebXRReferenceSpace,
  requestWebXRSession,
  syncWebXRCanvas,
} from 'symbiote-ui/xr';

const enterButton = document.querySelector('#enter');
const emulateButton = document.querySelector('#emulate');
const statusList = document.querySelector('#status');
const canvas = document.querySelector('#canvas');

let support = null;
let recommendation = null;
let session = null;
let loop = null;
let emulator = {
  installed: false,
  runtime: 'native',
  reason: null,
  profile: null,
  devui: false,
};

function getNavigator() {
  return window.navigator || globalThis.navigator || null;
}

function postDiagnostic(event, extra = {}) {
  let payload = {
    event,
    pageUrl: location.href,
    secureContext: window.isSecureContext,
    navigatorXr: Boolean(getNavigator()?.xr),
    modes: support?.modes || null,
    launch: recommendation
      ? {
        canLaunch: recommendation.canLaunch,
        mode: recommendation.mode,
        reason: recommendation.reason,
      }
      : null,
    ...extra,
  };
  fetch('/api/xr-diagnostics/log', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
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
  let apis = support?.apis || {};
  let modes = support?.modes || {};
  let panels = document.querySelectorAll('.panel').length;
  setRows([
    ['URL', location.href],
    ['Secure context', String(window.isSecureContext)],
    ['navigator.xr', String(Boolean(getNavigator()?.xr))],
    ['XRWebGLLayer', String(typeof window.XRWebGLLayer === 'function')],
    ['inline', String(Boolean(modes.inline))],
    ['immersive-vr', String(Boolean(modes.immersiveVr))],
    ['immersive-ar', String(Boolean(modes.immersiveAr))],
    ['requestSession', String(Boolean(apis.requestSessionAvailable))],
    ['Launch', recommendation?.canLaunch ? recommendation.mode : recommendation?.reason],
    ['Emulator', emulator.installed ? `${emulator.profile || 'metaQuest3'}${emulator.devui ? ' + DevUI' : ''}` : emulator.reason || emulator.runtime],
    ['Visible panels', String(panels)],
    ['Session', extra.session || (session ? 'running' : 'stopped')],
    ['Reference space', extra.referenceSpace || '-'],
    ['Layer', extra.layer || '-'],
    ['Last error', extra.error || '-'],
  ]);
}

async function installIwer() {
  emulateButton.disabled = true;
  emulateButton.textContent = 'Installing IWER...';
  postDiagnostic('iwer-install-requested');
  try {
    let [{ XRDevice, metaQuest3 }, { DevUI }] = await Promise.all([
      import('iwer'),
      import('@iwer/devui'),
    ]);
    let result = await installWebXREmulationRuntime({
      globalThis: window,
      preferNative: false,
      module: { XRDevice, metaQuest3 },
      profile: 'metaQuest3',
    });
    emulator = {
      installed: Boolean(result.installed),
      runtime: result.runtime,
      reason: result.reason || null,
      profile: result.profileName || 'metaQuest3',
      devui: false,
    };
    if (result.device) {
      new DevUI(result.device);
      emulator.devui = true;
    }
    postDiagnostic(result.ok ? 'iwer-installed' : 'iwer-install-failed', {
      emulator,
      error: result.ok ? null : result.reason,
    });
    await refreshSupport();
  } catch (error) {
    emulator = {
      installed: false,
      runtime: 'iwer',
      reason: error?.message || String(error),
      profile: 'metaQuest3',
      devui: false,
    };
    postDiagnostic('iwer-install-error', { emulator, error: emulator.reason });
    renderStatus({ error: emulator.reason });
  } finally {
    emulateButton.disabled = false;
    emulateButton.textContent = emulator.installed ? 'IWER installed' : 'Install IWER';
  }
}

function setEnterState() {
  let canLaunch = Boolean(recommendation?.canLaunch);
  enterButton.disabled = !canLaunch;
  enterButton.textContent = canLaunch ? `Enter ${recommendation.mode}` : `XR blocked: ${recommendation?.reason || 'pending'}`;
  enterButton.title = canLaunch ? `Start ${recommendation.mode}` : `XR unavailable: ${recommendation?.reason || 'pending'}`;
}

function getGl() {
  let gl = canvas.getContext('webgl', { xrCompatible: true, alpha: true, antialias: true });
  if (gl?.makeXRCompatible) {
    return gl.makeXRCompatible().then(() => gl);
  }
  return Promise.resolve(gl);
}

function paintFallback(color = [0.05, 0.07, 0.09, 1]) {
  let [r, g, b] = color;
  let gl = canvas.getContext('webgl', { xrCompatible: true, alpha: true, antialias: true });
  if (!gl) return;
  gl.clearColor(r, g, b, 1);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
}

async function refreshSupport() {
  support = await getWebXRSupport(window);
  recommendation = createWebXRLaunchRecommendation(support);
  setEnterState();
  renderStatus();
  postDiagnostic('support-detected');
}

async function startSession() {
  if (!recommendation?.canLaunch) return;
  postDiagnostic('session-start-requested');
  try {
    let gl = await getGl();
    let sessionResult = await requestWebXRSession(window, recommendation.mode || WEBXR_MODES.immersiveVr, {
      optionalFeatures: [
        WEBXR_FEATURES.localFloor,
        WEBXR_FEATURES.boundedFloor,
        WEBXR_FEATURES.domOverlay,
      ],
      domOverlayRoot: document.body,
    });
    if (!sessionResult.ok) {
      postDiagnostic('session-start-failed', {
        session: recommendation.mode,
        error: sessionResult.reason || sessionResult.message || 'request-failed',
      });
      renderStatus({ error: sessionResult.reason || sessionResult.message || 'request-failed' });
      return;
    }
    session = sessionResult.session;
    let layerResult = createWebXRLayer(window, session, gl);
    if (layerResult.ok) {
      await session.updateRenderState?.({ baseLayer: layerResult.layer });
      syncWebXRCanvas(canvas, gl, session);
    }
    let referenceResult = await requestWebXRReferenceSpace(session, WEBXR_FEATURES.localFloor);
    if (!referenceResult.ok) {
      postDiagnostic('reference-space-failed', {
        session: recommendation.mode,
        error: referenceResult.reason || 'reference-space-failed',
      });
      renderStatus({ error: referenceResult.reason || 'reference-space-failed' });
      return;
    }
    loop = createWebXRRenderLoop(session, () => {
      gl.clearColor(0.03, 0.06, 0.1, 1);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    });
    renderStatus({
      session: recommendation.mode,
      referenceSpace: referenceResult.type,
      layer: layerResult.ok ? 'XRWebGLLayer' : layerResult.reason,
    });
    postDiagnostic('session-started', {
      session: recommendation.mode,
      layer: layerResult.ok ? 'XRWebGLLayer' : layerResult.reason,
    });
  } catch (error) {
    postDiagnostic('session-error', { error: error?.message || String(error) });
    renderStatus({ error: error?.message || String(error) });
  }
}

enterButton.addEventListener('click', startSession);
emulateButton.addEventListener('click', installIwer);
window.addEventListener('pagehide', async () => {
  loop?.stop();
  loop = null;
  if (session) {
    await endWebXRSession(session).catch(() => {});
    session = null;
  }
});

paintFallback();
if (new URLSearchParams(location.search).get('emulate') === '1') {
  installIwer();
} else {
  refreshSupport();
}
