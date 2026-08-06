export const WEBXR_RENDERER_NAME = 'webxr';

export const WEBXR_MODES = Object.freeze({
  inline: 'inline',
  immersiveVr: 'immersive-vr',
  immersiveAr: 'immersive-ar',
});

export const WEBXR_FEATURES = Object.freeze({
  local: 'local',
  localFloor: 'local-floor',
  boundedFloor: 'bounded-floor',
  viewer: 'viewer',
  domOverlay: 'dom-overlay',
  hitTest: 'hit-test',
  anchors: 'anchors',
  handTracking: 'hand-tracking',
  layers: 'layers',
});

export const WEBXR_RENDERER = Object.freeze({
  name: WEBXR_RENDERER_NAME,
  status: 'experimental',
  specifier: 'symbiote-ui/xr',
  description: 'WebXR capability, session, render-loop, and input adapter primitives for spatial host applications.',
  modes: Object.values(WEBXR_MODES),
  fallback: 'dom-canvas',
  capabilities: [
    'immersive-vr',
    'immersive-ar',
    'inline-xr',
    'xr-layout-projection',
    'xr-spatial-scene',
    'xr-scene-controller',
    'xr-session-controller',
    'xr-session-options-normalization',
    'xr-controller-input-normalization',
    'xr-primary-input-source',
    'xr-theme-bridge',
    'xr-panel-host',
    'xr-panel-frame',
    'xr-panel-window-affordances',
    'xr-dom-panel-workbench',
    'xr-content-viewport',
    'xr-texture-quality-policy',
    'xr-texture-quality-diagnostics',
    'xr-scene-quality-diagnostics',
    'xr-visual-test-summary',
    'xr-pose-comfort-diagnostics',
    'xr-pose-comfort-adjustment',
    'xr-facing-diagnostics',
    'xr-facing-adjustment',
    'xr-html-in-canvas-renderer',
    'xr-html-canvas-ownership-gate',
    'xr-html-canvas-upload-receipt',
    'xr-texture-debug-mode',
    'xr-texture-gate-diagnostics',
    'xr-pointer-normalization',
    'xr-content-pointer-target',
    'xr-panel-gesture',
    'xr-layout-transaction',
    'xr-deep-graph-scene',
    'xr-deep-graph-focus',
    'xr-room-aware-placement-contract',
    'xr-voice-command-contract',
    'xr-scene-diagnostics',
    'xr-readiness-diagnostics',
    'xr-webgl-layer-target',
    'xr-webgl-layer-panel-renderer',
    'xr-three-webxr-adapter',
    'xr-session-runtime-diagnostics',
    'xr-session-options-diagnostics',
    'xr-stable-diagnostic-client-id',
    'xr-diagnostic-url-redaction',
    'xr-webgl-layer-size',
    'xr-launch-gate-diagnostics',
    'xr-emulated-test-runtime',
    'iwer-emulation-runtime',
    'dom-overlay-optional',
    'webgl-layer',
    'feature-detected-fallback',
  ],
  features: Object.values(WEBXR_FEATURES),
});

const DEFAULT_XR_DIAGNOSTIC_STORAGE_KEY = 'symbiote-ui:xr-diagnostic-client-id';
const SENSITIVE_URL_PARAM_PATTERN = /token|secret|password|cookie|authorization|auth|key|session|code/i;

function sanitizeDiagnosticIdPart(value, fallback = 'client') {
  let out = String(value || '').replace(/[^a-zA-Z0-9_.:-]/g, '').slice(0, 80);
  return out || fallback;
}

function createFallbackDiagnosticId(prefix, target) {
  let random = typeof target?.crypto?.randomUUID === 'function'
    ? target.crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return `${sanitizeDiagnosticIdPart(prefix, 'xr')}-${sanitizeDiagnosticIdPart(random, 'client')}`;
}

export function createStableXRDiagnosticClientId(options = {}) {
  let target = options.globalThis || globalThis;
  let prefix = sanitizeDiagnosticIdPart(options.prefix || 'xr');
  let storageKey = String(options.storageKey || `${DEFAULT_XR_DIAGNOSTIC_STORAGE_KEY}:${prefix}`);
  let storage = options.storage || target?.sessionStorage || target?.localStorage || null;
  let existing = options.existingId || null;

  try {
    existing = existing || storage?.getItem?.(storageKey) || null;
  } catch {
    existing = null;
  }

  let id = existing
    ? `${prefix}-${sanitizeDiagnosticIdPart(String(existing).replace(new RegExp(`^${prefix}-`), ''), 'client')}`
    : createFallbackDiagnosticId(prefix, target);

  try {
    storage?.setItem?.(storageKey, id);
  } catch {
    // Storage can be unavailable in strict privacy modes; the returned id still scopes this page lifetime.
  }

  return {
    version: 'xr-diagnostic-client-id-v1',
    id,
    storageKey,
    persisted: Boolean(storage),
  };
}

export function redactXRDiagnosticUrl(value, options = {}) {
  if (!value) return '';
  let base = options.base || 'https://symbiote.invalid/';
  let redactHash = options.redactHash !== false;
  try {
    let url = new URL(String(value), base);
    for (let key of [...url.searchParams.keys()]) {
      if (SENSITIVE_URL_PARAM_PATTERN.test(key)) {
        url.searchParams.set(key, '[redacted]');
      }
    }
    if (redactHash && url.hash) {
      let hash = url.hash.slice(1);
      if (hash.includes('?')) {
        let [route, query] = hash.split('?');
        let params = new URLSearchParams(query);
        for (let key of [...params.keys()]) {
          if (SENSITIVE_URL_PARAM_PATTERN.test(key)) {
            params.set(key, '[redacted]');
          }
        }
        url.hash = `${route}?${params.toString()}`;
      } else if (SENSITIVE_URL_PARAM_PATTERN.test(hash)) {
        url.hash = '#[redacted]';
      }
    }
    let out = url.href;
    return String(value).startsWith('http') ? out : `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return String(value)
      .replace(/([?&][^=]*(?:token|secret|password|cookie|authorization|auth|key|session|code)[^=]*=)[^&#]*/gi, '$1[redacted]')
      .slice(0, 300);
  }
}

function hasFn(source, name) {
  return typeof source?.[name] === 'function';
}

function getXR(target) {
  return target?.navigator?.xr || null;
}

async function sessionSupported(xr, mode) {
  if (!hasFn(xr, 'isSessionSupported')) return false;
  try {
    return Boolean(await xr.isSessionSupported(mode));
  } catch {
    return false;
  }
}

export async function getWebXRSupport(target = globalThis) {
  let xr = getXR(target);
  let secureContext = target?.isSecureContext !== false;
  let modes = {
    inline: await sessionSupported(xr, WEBXR_MODES.inline),
    immersiveVr: await sessionSupported(xr, WEBXR_MODES.immersiveVr),
    immersiveAr: await sessionSupported(xr, WEBXR_MODES.immersiveAr),
  };

  return {
    name: WEBXR_RENDERER_NAME,
    status: 'experimental',
    supported: Boolean(xr) && Object.values(modes).some(Boolean),
    fallback: WEBXR_RENDERER.fallback,
    modes,
    apis: {
      secureContext,
      navigatorXrAvailable: Boolean(xr),
      isSessionSupportedAvailable: hasFn(xr, 'isSessionSupported'),
      requestSessionAvailable: hasFn(xr, 'requestSession'),
      XRWebGLLayerAvailable: typeof target?.XRWebGLLayer === 'function',
      XRReferenceSpaceAvailable: typeof target?.XRReferenceSpace === 'function',
      XRFrameAvailable: typeof target?.XRFrame === 'function',
      XRInputSourceAvailable: typeof target?.XRInputSource === 'function',
    },
    features: WEBXR_RENDERER.features,
  };
}

export function createWebXRLaunchRecommendation(support = {}, options = {}) {
  let preferredMode = options.preferredMode || null;
  let allowInline = options.allowInline === true;
  let modes = support.modes || {};
  let supportsMode = (mode) => {
    if (modes[mode]) return true;
    if (mode === WEBXR_MODES.immersiveAr) return Boolean(modes.immersiveAr);
    if (mode === WEBXR_MODES.immersiveVr) return Boolean(modes.immersiveVr);
    if (mode === WEBXR_MODES.inline) return Boolean(modes.inline);
    return false;
  };
  let mode = null;
  if (preferredMode && supportsMode(preferredMode)) {
    mode = preferredMode;
  } else if (supportsMode(WEBXR_MODES.immersiveAr)) {
    mode = WEBXR_MODES.immersiveAr;
  } else if (supportsMode(WEBXR_MODES.immersiveVr)) {
    mode = WEBXR_MODES.immersiveVr;
  } else if (allowInline && supportsMode(WEBXR_MODES.inline)) {
    mode = WEBXR_MODES.inline;
  }

  let secureContext = support.apis?.secureContext !== false;
  let navigatorXrAvailable = Boolean(support.apis?.navigatorXrAvailable);
  let requestSessionAvailable = Boolean(support.apis?.requestSessionAvailable);
  let canLaunch = Boolean(mode && secureContext && navigatorXrAvailable && requestSessionAvailable);
  let reason = 'ready';
  if (!secureContext) {
    reason = 'insecure-context';
  } else if (!navigatorXrAvailable) {
    reason = 'navigator-xr-unavailable';
  } else if (!requestSessionAvailable) {
    reason = 'request-session-unavailable';
  } else if (!mode) {
    reason = 'no-immersive-mode';
  }

  return {
    version: 'webxr-launch-recommendation-v1',
    canLaunch,
    mode,
    reason,
    secureContext,
    navigatorXrAvailable,
    requestSessionAvailable,
    modes: { ...modes },
  };
}

function normalizeLaunchGateTexture(texture = null) {
  if (!texture || typeof texture !== 'object') {
    return {
      strict: false,
      total: 0,
      ready: 0,
      blocked: false,
      reason: null,
      stage: null,
      requiredApi: [],
    };
  }
  return {
    strict: texture.strict === true,
    total: Number.isFinite(Number(texture.total)) ? Number(texture.total) : 0,
    ready: Number.isFinite(Number(texture.ready)) ? Number(texture.ready) : 0,
    blocked: texture.blocked === true,
    reason: texture.reason || null,
    stage: texture.stage || null,
    requiredApi: Array.isArray(texture.requiredApi) ? [...texture.requiredApi] : [],
  };
}

function normalizeUserActivationState(userActivation = null) {
  if (!userActivation || typeof userActivation !== 'object') {
    return {
      available: false,
      isActive: null,
      hasBeenActive: null,
    };
  }
  return {
    available: true,
    isActive: userActivation.isActive == null ? null : Boolean(userActivation.isActive),
    hasBeenActive: userActivation.hasBeenActive == null ? null : Boolean(userActivation.hasBeenActive),
  };
}

export function createWebXRLaunchGateSummary(support = {}, options = {}) {
  let launch = options.launch || createWebXRLaunchRecommendation(support, options);
  let texture = normalizeLaunchGateTexture(options.texture);
  let userActivation = normalizeUserActivationState(options.userActivation);
  let requireUserActivation = options.requireUserActivation === true;
  let activationOk = !requireUserActivation ||
    userActivation.isActive === true ||
    userActivation.available !== true ||
    userActivation.isActive == null;
  let probeMode = options.probeMode || options.selectedMode || launch.mode || null;
  let canProbeMode = options.allowUnsupportedModeProbe === true &&
    launch.canLaunch !== true &&
    launch.reason === 'no-immersive-mode' &&
    launch.navigatorXrAvailable === true &&
    launch.requestSessionAvailable === true &&
    Boolean(probeMode) &&
    probeMode !== WEBXR_MODES.inline;
  let checks = [
    {
      id: 'webxr-launch',
      ok: launch.canLaunch === true || canProbeMode,
      reason: launch.canLaunch || canProbeMode ? null : launch.reason || 'webxr-launch-blocked',
      probe: canProbeMode,
      probeMode: canProbeMode ? probeMode : null,
    },
    {
      id: 'strict-texture',
      ok: texture.blocked !== true,
      reason: texture.blocked ? texture.reason || 'strict-texture-blocked' : null,
      stage: texture.stage,
      requiredApi: texture.requiredApi,
    },
    {
      id: 'user-activation',
      ok: activationOk,
      reason: activationOk ? null : 'user-activation-required',
      required: requireUserActivation,
      available: userActivation.available,
      isActive: userActivation.isActive,
      hasBeenActive: userActivation.hasBeenActive,
    },
  ];
  let blockingChecks = checks.filter((check) => !check.ok);
  return {
    version: 'webxr-launch-gate-summary-v1',
    canStart: blockingChecks.length === 0,
    blocked: blockingChecks.length > 0,
    reason: blockingChecks[0]?.reason || 'ready',
    mode: launch.mode || probeMode || null,
    canProbeMode,
    checks,
    blockingChecks,
    launch,
    texture,
    userActivation,
  };
}

export function createXRReadinessSummary(input = {}) {
  let launchGate = input.launchGate || null;
  let htmlCanvas = input.htmlCanvas || null;
  let texture = input.texture || null;
  let sceneQuality = input.sceneQuality || null;
  let sessionHealth = input.sessionHealth || input.health || null;
  let checks = [
    {
      id: 'launch',
      ok: launchGate ? launchGate.blocked !== true && launchGate.canStart !== false : false,
      status: launchGate ? launchGate.blocked ? 'blocked' : 'ready' : 'missing',
      reason: launchGate?.reason || (launchGate ? null : 'missing-launch-gate'),
    },
    {
      id: 'html-canvas',
      ok: htmlCanvas ? htmlCanvas.supported === true : false,
      status: htmlCanvas?.availability || 'missing',
      reason: htmlCanvas?.supported ? null : htmlCanvas?.recommendation || 'missing-html-canvas-diagnostics',
    },
    {
      id: 'texture',
      ok: texture ? texture.blocked !== true : false,
      status: texture ? texture.blocked ? 'blocked' : 'ready' : 'missing',
      reason: texture?.reason || (texture ? null : 'missing-texture-gate'),
    },
    {
      id: 'scene-quality',
      ok: sceneQuality ? sceneQuality.status !== 'warning' : false,
      status: sceneQuality?.status || 'missing',
      reason: sceneQuality?.status === 'warning' ? 'scene-quality-warning' : sceneQuality ? null : 'missing-scene-quality',
    },
    {
      id: 'session-health',
      ok: !sessionHealth || sessionHealth.status === 'healthy' || sessionHealth.status === 'waiting',
      status: sessionHealth?.status || 'not-started',
      reason: sessionHealth?.reason || null,
    },
  ];
  let blockingChecks = checks.filter((check) => !check.ok);
  let firstBlocking = blockingChecks[0] || null;
  let running = sessionHealth?.status === 'healthy' || input.sessionActive === true;
  return {
    version: 'xr-readiness-summary-v1',
    ready: blockingChecks.length === 0,
    running,
    status: running ? 'running' : blockingChecks.length ? 'blocked' : 'ready',
    reason: firstBlocking?.reason || 'ready',
    checks,
    blockingChecks,
    mode: launchGate?.mode || input.mode || null,
  };
}

export function normalizeWebXRSessionOptions(options = {}) {
  let requiredFeatures = [...new Set(options.requiredFeatures || [])];
  let optionalFeatures = [...new Set(options.optionalFeatures || [
    WEBXR_FEATURES.localFloor,
    WEBXR_FEATURES.boundedFloor,
    WEBXR_FEATURES.handTracking,
    WEBXR_FEATURES.hitTest,
    WEBXR_FEATURES.domOverlay,
    WEBXR_FEATURES.layers,
  ])];
  let normalized = { requiredFeatures, optionalFeatures };
  if (options.domOverlayRoot) {
    normalized.domOverlay = { root: options.domOverlayRoot };
  }
  return normalized;
}

export async function requestWebXRSession(target = globalThis, mode = WEBXR_MODES.immersiveVr, options = {}) {
  let xr = getXR(target);
  if (!hasFn(xr, 'requestSession')) {
    return { ok: false, reason: 'unsupported', session: null };
  }
  try {
    let session = await xr.requestSession(mode, normalizeWebXRSessionOptions(options));
    return { ok: true, mode, session };
  } catch (error) {
    return {
      ok: false,
      mode,
      reason: error?.name || 'request-failed',
      message: error?.message || '',
      session: null,
    };
  }
}

export async function endWebXRSession(session) {
  if (!hasFn(session, 'end')) return false;
  await session.end();
  return true;
}

export function createWebXRLayer(target = globalThis, session, gl, options = {}) {
  if (typeof target?.XRWebGLLayer !== 'function') {
    return { ok: false, reason: 'unsupported', layer: null };
  }
  if (!session || !gl) {
    return { ok: false, reason: 'missing-session-or-context', layer: null };
  }
  try {
    return { ok: true, layer: new target.XRWebGLLayer(session, gl, options) };
  } catch (error) {
    return {
      ok: false,
      reason: error?.name || 'layer-failed',
      message: error?.message || '',
      layer: null,
    };
  }
}

function createWebGLCanvas(documentRef, options = {}) {
  if (!documentRef?.createElement) return null;
  let size = createXRWebGLLayerSize(options);
  let canvas = documentRef.createElement('canvas');
  canvas.className = options.className || 'sn-xr-layer-canvas';
  canvas.width = size.width;
  canvas.height = size.height;
  canvas.setAttribute?.('aria-hidden', 'true');
  return canvas;
}

export function createXRWebGLLayerSize(options = {}) {
  let panelCount = Number(options.panelCount || options.panels?.length || 0);
  let width = Number(options.width || options.baseWidth || 1280);
  let height = Number(options.height || options.baseHeight || 720);
  let pixelRatio = Number(options.pixelRatio || 1);
  let maxWidth = Number(options.maxWidth || 2048);
  let maxHeight = Number(options.maxHeight || 2048);

  if (!options.width && !options.height && panelCount > 4) {
    let scale = Math.min(1.5, Math.sqrt(panelCount / 4));
    width *= scale;
    height *= scale;
  }

  width = Math.max(1, Math.min(maxWidth, Math.round(width * Math.max(0.5, pixelRatio))));
  height = Math.max(1, Math.min(maxHeight, Math.round(height * Math.max(0.5, pixelRatio))));

  return {
    version: 'xr-webgl-layer-size-v1',
    width,
    height,
    pixelRatio,
    panelCount,
    source: options.width || options.height ? 'explicit' : 'provider-default',
  };
}

function getXRCompatibleWebGLContext(canvas, options = {}) {
  if (!canvas?.getContext) return null;
  let contextOptions = {
    xrCompatible: true,
    alpha: options.alpha !== false,
    antialias: options.antialias !== false,
    preserveDrawingBuffer: options.preserveDrawingBuffer === true,
  };
  let preferred = Array.isArray(options.contextTypes) && options.contextTypes.length
    ? options.contextTypes
    : ['webgl2', 'webgl'];
  for (let contextType of preferred) {
    let gl = canvas.getContext(contextType, contextOptions);
    if (gl) {
      gl.contextType = gl.contextType || contextType;
      return gl;
    }
  }
  return null;
}

export async function createXRWebGLLayerTarget(options = {}) {
  let documentRef = options.document || options.globalThis?.document || globalThis?.document;
  let hostElement = options.hostElement || null;
  let existingCanvas = options.canvas || null;
  let canvas = existingCanvas || createWebGLCanvas(documentRef, options);
  if (!canvas) {
    return {
      ok: false,
      reason: 'missing-document',
      canvas: null,
      gl: null,
      contextType: null,
      reused: false,
    };
  }
  let appendCanvas = () => {
    if (!existingCanvas && hostElement?.append && !canvas.isConnected) {
      hostElement.append(canvas);
    }
  };
  appendCanvas();

  let gl = getXRCompatibleWebGLContext(canvas, options);
  let recreated = false;
  if (!gl && !existingCanvas && documentRef?.createElement) {
    canvas.remove?.();
    canvas = createWebGLCanvas(documentRef, options);
    appendCanvas();
    gl = getXRCompatibleWebGLContext(canvas, options);
    recreated = true;
  }

  if (gl?.makeXRCompatible) {
    await gl.makeXRCompatible();
  }

  return {
    ok: Boolean(gl),
    reason: gl ? null : 'missing-webgl-context',
    canvas,
    gl,
    contextType: gl?.contextType || null,
    reused: Boolean(existingCanvas),
    recreated,
    width: Number(canvas.width || 0),
    height: Number(canvas.height || 0),
  };
}

export function syncWebXRCanvas(canvas, gl, session) {
  let layer = session?.renderState?.baseLayer || null;
  if (!canvas || !layer) return false;
  let width = Number(layer.framebufferWidth || 0);
  let height = Number(layer.framebufferHeight || 0);
  if (!width || !height) return false;
  canvas.width = width;
  canvas.height = height;
  if (hasFn(gl, 'bindFramebuffer')) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, layer.framebuffer);
  }
  return true;
}

export function createWebXRRenderLoop(session, callback) {
  let active = true;
  let handle = null;
  let loop = (time, frame) => {
    if (!active) return;
    callback?.(time, frame, session);
    if (active && hasFn(session, 'requestAnimationFrame')) {
      handle = session.requestAnimationFrame(loop);
    }
  };
  if (hasFn(session, 'requestAnimationFrame')) {
    handle = session.requestAnimationFrame(loop);
  }
  return {
    stop() {
      active = false;
      if (handle != null && hasFn(session, 'cancelAnimationFrame')) {
        session.cancelAnimationFrame(handle);
      }
    },
  };
}

export async function requestWebXRReferenceSpace(session, type = WEBXR_FEATURES.localFloor) {
  if (!hasFn(session, 'requestReferenceSpace')) {
    return { ok: false, reason: 'unsupported', referenceSpace: null };
  }
  try {
    return {
      ok: true,
      type,
      referenceSpace: await session.requestReferenceSpace(type),
    };
  } catch (error) {
    return {
      ok: false,
      type,
      reason: error?.name || 'reference-space-failed',
      message: error?.message || '',
      referenceSpace: null,
    };
  }
}

export function listWebXRInputSources(session) {
  return Array.from(session?.inputSources || []);
}

export function createWebXRAdapter(options = {}) {
  let target = options.globalThis || globalThis;
  let session = null;

  return {
    ...WEBXR_RENDERER,
    async getSupport() {
      return getWebXRSupport(target);
    },
    async isSupported(mode = WEBXR_MODES.immersiveVr) {
      let xr = getXR(target);
      return sessionSupported(xr, mode);
    },
    async requestSession(mode = WEBXR_MODES.immersiveVr, sessionOptions = {}) {
      let result = await requestWebXRSession(target, mode, sessionOptions);
      if (result.ok) session = result.session;
      return result;
    },
    async endSession() {
      let ended = await endWebXRSession(session);
      session = null;
      return ended;
    },
    getSession() {
      return session;
    },
    requestReferenceSpace(type) {
      return requestWebXRReferenceSpace(session, type);
    },
    createLayer(gl, layerOptions) {
      return createWebXRLayer(target, session, gl, layerOptions);
    },
    createRenderLoop(callback) {
      return createWebXRRenderLoop(session, callback);
    },
    getInputSources() {
      return listWebXRInputSources(session);
    },
  };
}
