import {
  WEBXR_FEATURES,
  createWebXRLaunchGateSummary,
  createXRReadinessSummary,
  redactXRDiagnosticUrl,
  requestWebXRSession,
} from './webxr.js';
import {
  createXRHtmlCanvasRenderer,
  createXRPanelTextureSourceSummary,
} from './html-canvas-renderer.js';
import { createXRPanelFrame, hitTestXRPanelFrame } from './panel-frame.js';
import { createMetaWindowChromeTexture } from './meta-window-chrome.js';
import { XR_DEFAULT_DESIGN_TOKENS, xrDesignTokenColorNumber } from './chrome-theme.js';
import {
  createXRPanelTextureQualitySummary,
  createXRTextureQualityPolicy,
} from './layout-projection.js';
import {
  resolveXRHitMap,
  selectPrimaryXRInputSource,
} from './pointer.js';
import {
  createXRSceneRootTransform,
  createXRViewerPoseSnapshot,
} from './spatial-scene.js';
import { createXRPortablePanelStore } from './portable-panel-state.js';
import { createXRFrameTimingTracker } from './frame-timing.js';
import { createXRScaleFadeTween } from './transitions.js';
import { XR_SPATIAL_VERSIONS, freezeSpatialValue } from './spatial-contract.js';
import {
  isFiniteMatrix4,
  makeTransform,
  multiplyMatrices,
  normalizeQuaternion,
  poseFromMatrix,
  relativeMatrix,
} from './spatial-math.js';
import { validateTarget } from './spatial-evidence.js';

// Chrome colors default to the provider design tokens (xr/chrome-theme.js):
// accent carries grab/pointer affordances, neutral on-surface carries window
// controls, success marks pinned, surface-panel paints the material fallback.
// The legacy literals remain only as resolution-failure fallbacks; explicit
// options always win over both.
const XR_TOKEN_CHROME_COLORS = XR_DEFAULT_DESIGN_TOKENS.colors;
const XR_CHROME_ACCENT_COLOR = xrDesignTokenColorNumber(XR_TOKEN_CHROME_COLORS.accent) ?? 0x7fd6ff;
const XR_CHROME_ON_SURFACE_COLOR = xrDesignTokenColorNumber(XR_TOKEN_CHROME_COLORS.onSurface) ?? 0xffffff;
const XR_CHROME_PINNED_COLOR = xrDesignTokenColorNumber(XR_TOKEN_CHROME_COLORS.success) ?? 0x9fffd8;
const XR_PANEL_SURFACE_COLOR = xrDesignTokenColorNumber(XR_TOKEN_CHROME_COLORS.surfacePanel) ?? 0x243244;

export const XR_THREE_WEBXR_ADAPTER = Object.freeze({
  name: 'three-webxr',
  status: 'optional-adapter',
  specifier: 'symbiote-ui/xr',
  description: 'Optional Three.js WebXR adapter for Symbiote XR scenes. The host supplies the THREE module.',
  modes: ['immersive-vr', 'immersive-ar'],
  fallback: 'dom-canvas',
  dependency: {
    name: 'three',
    injection: 'host-supplied',
    required: false,
  },
  capabilities: [
    'three-webxr-manager',
    'three-scene-panels',
    'three-controller-rays',
    'three-controller-ray-visuals',
    'three-panel-hit-reticle',
    'three-panel-frame-hit-target',
    'three-panel-frame-visuals',
    'three-frame-target-drag-gate',
    'three-frame-target-resize-persistence',
    'three-interaction-state-diagnostics',
    'three-session-telemetry-snapshot',
    'three-session-runtime-diagnostics',
    'three-session-options-diagnostics',
    'three-session-options-builder',
    'three-session-health-summary',
    'three-session-watchdog',
    'three-diagnostic-payload',
    'three-diagnostic-timeline',
    'three-diagnostic-server-summary',
    'three-troubleshooting-summary',
    'three-raycaster-controller',
    'three-ray-plane-panel-drag',
    'three-drag-response-filter',
    'three-session-controller',
    'three-render-host',
    'three-render-host-diagnostics',
    'three-render-loop',
    'three-dom-texture-material-bridge',
    'three-html-canvas-texture-resolver',
    'three-texture-quality-policy',
    'three-dirty-texture-redraw',
    'three-strict-texture-fail-fast',
    'three-scene-decoration',
    'three-camera-resize',
    'three-controller-select-events',
    'three-primary-input-source',
    'three-animation-loop',
    'three-panel-material-state',
    'three-session-diagnostics',
    'three-world-locked-root-commit',
    'three-trusted-select-receipts',
    'three-spatial-audit-v1',
    'three-portable-panel-controls',
    'three-portable-panel-receipts',
    'three-portable-panel-close',
    'three-panel-fullscreen-intent',
    'three-frame-timing',
    'three-final-session-snapshot',
    'symbiote-xr-scene-adapter',
    'host-supplied-three',
  ],
});

function hasFn(source, name) {
  return typeof source?.[name] === 'function';
}

function assertThree(THREE) {
  let missing = [
    'Scene',
    'PerspectiveCamera',
    'WebGLRenderer',
    'PlaneGeometry',
    'Mesh',
    'MeshStandardMaterial',
    'Raycaster',
  ].filter((name) => typeof THREE?.[name] !== 'function');
  if (missing.length) {
    return {
      ok: false,
      reason: 'missing-three-api',
      missing,
    };
  }
  return { ok: true, missing: [] };
}

function callSetter(target, method, values = []) {
  if (hasFn(target, method)) {
    target[method](...values);
    return true;
  }
  return false;
}

function normalizeStringList(value) {
  if (!value) return [];
  try {
    return [...value].map((item) => String(item)).filter(Boolean);
  } catch {
    return [];
  }
}

function normalizeInputSources(inputSources) {
  if (!inputSources) return [];
  try {
    return [...inputSources].map((source) => ({
      handedness: source?.handedness || '',
      targetRayMode: source?.targetRayMode || '',
      profiles: normalizeStringList(source?.profiles),
    }));
  } catch {
    return [];
  }
}

function summarizeTextureSourceQuality(textureSources = []) {
  let sources = Array.isArray(textureSources) ? textureSources : [];
  let statuses = new Map();
  let warnings = [];
  let recommendations = [];
  for (let source of sources) {
    let status = source?.textureQuality?.status || source?.qualityStatus || null;
    if (status) {
      statuses.set(status, (statuses.get(status) || 0) + 1);
    }
    let sourceWarnings = source?.textureQuality?.warnings || source?.qualityWarnings || [];
    for (let warning of sourceWarnings) {
      warnings.push({
        panelId: source?.panelId || null,
        code: String(warning),
      });
    }
    let sourceRecommendations = source?.textureQuality?.recommendations || source?.qualityRecommendations || [];
    for (let recommendation of sourceRecommendations) {
      recommendations.push({
        panelId: source?.panelId || null,
        code: String(recommendation),
      });
    }
  }
  let priority = new Map([
    ['provide-texture-size', 0],
    ['increase-texture-resolution', 1],
    ['increase-texture-density-to-target', 2],
    ['increase-texture-pixel-ratio', 3],
    ['increase-max-texture-size', 4],
  ]);
  let actionMap = new Map();
  for (let recommendation of recommendations) {
    let code = recommendation.code || 'recommendation';
    let action = actionMap.get(code) || {
      code,
      count: 0,
      panelIds: [],
      priority: priority.get(code) ?? 99,
    };
    action.count += 1;
    if (recommendation.panelId && !action.panelIds.includes(recommendation.panelId)) {
      action.panelIds.push(recommendation.panelId);
    }
    actionMap.set(code, action);
  }
  let actions = [...actionMap.values()]
    .sort((first, second) => first.priority - second.priority || second.count - first.count || first.code.localeCompare(second.code))
    .map(({ priority: _priority, ...action }) => action);
  return {
    total: sources.length,
    target: Number(statuses.get('target') || 0),
    readable: Number(statuses.get('readable') || 0),
    low: Number(statuses.get('low') || 0),
    blocked: Number(statuses.get('blocked') || 0),
    warningCount: warnings.length,
    warnings,
    recommendationCount: recommendations.length,
    recommendations,
    primaryRecommendation: actions[0]?.code || null,
    actions,
  };
}

function applyVector(target, values = []) {
  if (!target) return;
  if (!callSetter(target, 'fromArray', [values])) {
    callSetter(target, 'set', values);
  }
}

function applyRotation(target, values = []) {
  if (!target) return;
  if (hasFn(target, 'set')) {
    // The provider Euler contract is Rz*Ry*Rx; without an explicit order the
    // Three Euler stays 'XYZ' and composed rotations diverge from
    // eulerToQuaternion and every schema consumer.
    let radians = [0, 1, 2].map((index) => Number(values[index] || 0) * Math.PI / 180);
    target.set(radians[0], radians[1], radians[2], 'ZYX');
  }
}

function readBounds(source, fallback = {}) {
  let rect = source?.getBoundingClientRect?.() || source || {};
  let width = Number(rect.width || fallback.width || 1280);
  let height = Number(rect.height || fallback.height || 720);
  return {
    width: Math.max(1, Math.round(width)),
    height: Math.max(1, Math.round(height)),
  };
}

function clampPixelRatio(value, max = 2) {
  let ratio = Number(value || 1);
  if (!Number.isFinite(ratio) || ratio <= 0) return 1;
  return Math.min(ratio, Number(max || 2));
}

function nowMs(options = {}) {
  if (typeof options.now === 'function') {
    return Number(options.now());
  }
  let value = Number(options.now);
  return Number.isFinite(value) ? value : Date.now();
}

function normalizeRayVisualOptions(options = {}) {
  let length = Number(options.rayLength ?? options.length ?? 3);
  let color = options.rayColor ?? options.color ?? XR_CHROME_ACCENT_COLOR;
  let opacity = Number(options.rayOpacity ?? options.opacity ?? 0.84);
  return {
    enabled: options.enabled !== false,
    length: Number.isFinite(length) ? Math.max(0.2, Math.min(8, length)) : 3,
    color,
    opacity: Number.isFinite(opacity) ? Math.max(0.05, Math.min(1, opacity)) : 0.84,
  };
}

function buildControllerRayVisual(THREE, options = {}) {
  let visual = normalizeRayVisualOptions(options);
  if (!visual.enabled) {
    return { ok: false, reason: 'disabled' };
  }
  let missing = ['BufferGeometry', 'Float32BufferAttribute', 'LineBasicMaterial', 'Line']
    .filter((name) => typeof THREE?.[name] !== 'function');
  if (missing.length) {
    return { ok: false, reason: 'missing-three-ray-visual-api', missing };
  }
  let geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([
    0, 0, 0,
    0, 0, -visual.length,
  ], 3));
  let material = new THREE.LineBasicMaterial({
    color: visual.color,
    transparent: true,
    opacity: visual.opacity,
    depthTest: false,
  });
  let line = new THREE.Line(geometry, material);
  line.name = 'sn-xr-controller-ray';
  line.userData ||= {};
  line.userData.snControllerRay = true;
  line.renderOrder = Number(options.renderOrder ?? 20);
  return {
    ok: true,
    object: line,
    type: 'controller-ray',
    length: visual.length,
    color: visual.color,
    opacity: visual.opacity,
  };
}

function normalizeHitReticleOptions(options = {}) {
  let innerRadius = Number(options.innerRadius ?? 0.018);
  let outerRadius = Number(options.outerRadius ?? 0.032);
  let color = options.color ?? XR_CHROME_ACCENT_COLOR;
  let opacity = Number(options.opacity ?? 0.92);
  return {
    enabled: options.enabled !== false,
    innerRadius: Number.isFinite(innerRadius) ? Math.max(0.004, Math.min(0.08, innerRadius)) : 0.018,
    outerRadius: Number.isFinite(outerRadius) ? Math.max(0.006, Math.min(0.12, outerRadius)) : 0.032,
    color,
    opacity: Number.isFinite(opacity) ? Math.max(0.05, Math.min(1, opacity)) : 0.92,
  };
}

function buildPanelHitReticleVisual(THREE, options = {}) {
  let visual = normalizeHitReticleOptions(options);
  if (!visual.enabled) {
    return { ok: false, reason: 'disabled' };
  }
  let missing = ['RingGeometry', 'MeshBasicMaterial', 'Mesh']
    .filter((name) => typeof THREE?.[name] !== 'function');
  if (missing.length) {
    return { ok: false, reason: 'missing-three-hit-reticle-api', missing };
  }
  let geometry = new THREE.RingGeometry(visual.innerRadius, visual.outerRadius, Number(options.segments || 32));
  let material = new THREE.MeshBasicMaterial({
    color: visual.color,
    transparent: true,
    opacity: visual.opacity,
    depthTest: false,
    side: THREE.DoubleSide,
  });
  let reticle = new THREE.Mesh(geometry, material);
  reticle.name = 'sn-xr-panel-hit-reticle';
  reticle.visible = false;
  reticle.renderOrder = Number(options.renderOrder ?? 30);
  reticle.userData ||= {};
  reticle.userData.snPanelHitReticle = true;
  return {
    ok: true,
    object: reticle,
    type: 'panel-hit-reticle',
    innerRadius: visual.innerRadius,
    outerRadius: visual.outerRadius,
    color: visual.color,
    opacity: visual.opacity,
  };
}

function updatePanelHitReticleVisual(reticle, hit) {
  let object = reticle?.object || reticle;
  if (!object) return { ok: false, reason: 'missing-hit-reticle' };
  if (!hit?.point || !hit?.object) {
    object.visible = false;
    object.userData ||= {};
    object.userData.panelId = null;
    return { ok: true, visible: false, panelId: null };
  }
  object.visible = true;
  object.userData ||= {};
  object.userData.panelId = hit.object.userData?.panelId || null;
  if (object.position?.copy) object.position.copy(hit.point);
  else applyVector(object.position, [hit.point.x, hit.point.y, hit.point.z]);
  // The reticle lives at scene level while panels sit under the placed root:
  // the panel's local quaternion misses the root yaw and lays the ring
  // sideways on committed scenes — orient by world rotation instead.
  if (object.quaternion?.copy) {
    if (typeof hit.object.getWorldQuaternion === 'function') {
      hit.object.getWorldQuaternion(object.quaternion);
    } else if (hit.object.quaternion) {
      object.quaternion.copy(hit.object.quaternion);
    }
  }
  return {
    ok: true,
    visible: true,
    panelId: object.userData.panelId,
    point: vectorData(hit.point),
    distance: Number(hit.distance || 0),
  };
}

function normalizePanelFrameVisualOptions(options = {}) {
  let headerColor = options.headerColor ?? options.color ?? XR_CHROME_ON_SURFACE_COLOR;
  let handleColor = options.handleColor ?? options.color ?? XR_CHROME_ON_SURFACE_COLOR;
  let actionColor = options.actionColor ?? options.color ?? XR_CHROME_ON_SURFACE_COLOR;
  let foregroundColor = options.foregroundColor ?? XR_PANEL_SURFACE_COLOR;
  let pinnedColor = options.pinnedColor ?? XR_CHROME_PINNED_COLOR;
  let opacity = Number(options.opacity ?? 0.34);
  let handleOpacity = Number(options.handleOpacity ?? 0.62);
  let handleRestOpacity = Number(options.handleRestOpacity ?? 0);
  let hoverOpacity = Number(options.hoverOpacity ?? 0.95);
  return {
    enabled: options.enabled !== false,
    headerColor,
    handleColor,
    actionColor,
    foregroundColor,
    pinnedColor,
    opacity: Number.isFinite(opacity) ? Math.max(0.04, Math.min(1, opacity)) : 0.34,
    handleOpacity: Number.isFinite(handleOpacity) ? Math.max(0.04, Math.min(1, handleOpacity)) : 0.62,
    handleRestOpacity: Number.isFinite(handleRestOpacity) ? Math.max(0, Math.min(1, handleRestOpacity)) : 0,
    hoverOpacity: Number.isFinite(hoverOpacity) ? Math.max(0.04, Math.min(1, hoverOpacity)) : 0.95,
    zOffset: Number(options.zOffset ?? 0.006),
    renderOrder: Number(options.renderOrder ?? 28),
  };
}

function panelChromeCssColor(value, fallback) {
  if (typeof value === 'string') return value;
  if (Number.isFinite(value)) return `#${Math.max(0, Math.min(0xffffff, value)).toString(16).padStart(6, '0')}`;
  return fallback;
}

function frameZoneToPanelRect(zone = {}, size = [0.8, 0.45]) {
  let width = Math.max(0.001, Number(size[0] || 0.8));
  let height = Math.max(0.001, Number(size[1] || 0.45));
  let zoneWidth = Math.max(0.001, Number(zone.width || 0) * width);
  let zoneHeight = Math.max(0.001, Number(zone.height || 0) * height);
  return {
    width: zoneWidth,
    height: zoneHeight,
    x: -width / 2 + Number(zone.x || 0) * width + zoneWidth / 2,
    y: height / 2 - Number(zone.y || 0) * height - zoneHeight / 2,
  };
}

function removePanelFrameVisuals(mesh) {
  let objects = mesh?.userData?.panelFrameVisuals?.objects || [];
  for (let object of objects) {
    if (typeof mesh?.remove === 'function') {
      mesh.remove(object);
    } else if (Array.isArray(mesh?.children)) {
      let index = mesh.children.indexOf(object);
      if (index >= 0) mesh.children.splice(index, 1);
    }
    if (typeof object?.geometry?.dispose === 'function') {
      object.geometry.dispose();
    }
    if (typeof object?.material?.map?.dispose === 'function') {
      object.material.map.dispose();
    }
    if (object?.userData?.expandedTexture &&
        object.userData.expandedTexture !== object.material?.map &&
        typeof object.userData.expandedTexture.dispose === 'function') {
      object.userData.expandedTexture.dispose();
    }
    if (typeof object?.material?.dispose === 'function') {
      object.material.dispose();
    }
  }
}

function addPanelFrameVisualObject(mesh, object) {
  if (typeof mesh?.add === 'function') {
    mesh.add(object);
    return true;
  }
  if (Array.isArray(mesh?.children)) {
    mesh.children.push(object);
    return true;
  }
  return false;
}

function buildPanelFrameZoneVisual(THREE, zoneName, zone, size, visual, metadata = {}) {
  let rect = frameZoneToPanelRect(zone, size);
  let visualWidth = rect.width;
  let visualHeight = rect.height;
  if (metadata.square) {
    let side = Math.min(visualWidth, visualHeight) * (metadata.visualScale ?? 1);
    visualWidth = side;
    visualHeight = side;
  } else if (metadata.visualScale) {
    visualWidth *= metadata.visualScale;
    visualHeight *= metadata.visualScale;
  }
  let geometry = new THREE.PlaneGeometry(visualWidth, visualHeight);
  let material = new THREE.MeshBasicMaterial({
    color: metadata.color ?? visual.handleColor,
    transparent: true,
    opacity: metadata.opacity ?? visual.handleOpacity,
    depthTest: false,
    side: THREE.DoubleSide,
  });
  if (metadata.texture) {
    material.map = metadata.texture;
  }
  let object = new THREE.Mesh(geometry, material);
  object.name = `sn-xr-panel-frame-${zoneName}`;
  object.renderOrder = visual.renderOrder;
  object.userData ||= {};
  object.userData.snPanelFrameVisual = true;
  object.userData.zone = metadata.zone || zoneName;
  object.userData.operation = metadata.operation || 'focus';
  object.userData.handle = metadata.handle || null;
  object.userData.action = metadata.action || null;
  object.userData.baseColor = metadata.color ?? visual.handleColor;
  object.userData.baseOpacity = metadata.opacity ?? visual.handleOpacity;
  object.userData.hoverOpacity = metadata.hoverOpacity ?? object.userData.baseOpacity;
  object.userData.zoneCenter = {
    x: Number(zone.x || 0) + Number(zone.width || 0) / 2,
    y: Number(zone.y || 0) + Number(zone.height || 0) / 2,
  };
  object.userData.zoneBounds = { ...zone };
  if (object.position?.set) {
    object.position.set(rect.x, rect.y, visual.zOffset);
  } else {
    object.position = { x: rect.x, y: rect.y, z: visual.zOffset };
  }
  return object;
}

function buildPanelFrameVisuals(THREE, panel, mesh, options = {}) {
  let visual = normalizePanelFrameVisualOptions(options);
  if (!visual.enabled) {
    return { ok: false, reason: 'disabled', objects: [] };
  }
  let missing = ['PlaneGeometry', 'MeshBasicMaterial', 'Mesh']
    .filter((name) => typeof THREE?.[name] !== 'function');
  if (missing.length) {
    return { ok: false, reason: 'missing-three-panel-frame-visual-api', missing, objects: [] };
  }
  if (!mesh) {
    return { ok: false, reason: 'missing-panel-mesh', objects: [] };
  }

  removePanelFrameVisuals(mesh);
  let size = readPanelSize(mesh);
  // Live size wins over any pinned panelSizeMeters so resize rebuilds
  // re-derive meter chrome for the CURRENT panel size.
  let frameOptions = { pinned: Boolean(panel?.pinned), ...(options.frame || {}), panelSizeMeters: size };
  let frame = createXRPanelFrame(panel || {}, frameOptions);
  let objects = [];
  let zones = [];

  let actionNames = Object.keys(frame.zones.actions || {});
  let expandedTexture = createMetaWindowChromeTexture(THREE, 'control-bar', {
    title: panel?.title || panel?.label || panel?.component || panel?.panelType || panel?.id || 'Window',
    actions: actionNames,
    activeAction: frame.state.pinned ? 'pin' : null,
    background: panelChromeCssColor(visual.headerColor, '#fafafa'),
    foreground: panelChromeCssColor(visual.foregroundColor, '#272727'),
  });
  let collapsedTexture = createMetaWindowChromeTexture(THREE, 'grab-strip', {
    color: panelChromeCssColor(visual.headerColor, '#fafafa'),
  });
  let controlBar = buildPanelFrameZoneVisual(THREE, 'control-bar', frame.zones.controlBar, size, visual, {
    zone: 'move',
    operation: 'move',
    color: visual.headerColor,
    opacity: visual.hoverOpacity,
    hoverOpacity: visual.hoverOpacity,
    texture: collapsedTexture,
  });
  controlBar.userData.collapsedTexture = collapsedTexture;
  controlBar.userData.expandedTexture = expandedTexture;
  controlBar.userData.panelId = frame.panelId;
  if (addPanelFrameVisualObject(mesh, controlBar)) {
    objects.push(controlBar);
    zones.push('control-bar');
  }

  for (let [handle, zone] of Object.entries(frame.zones.resize || {})) {
    let object = buildPanelFrameZoneVisual(THREE, `resize-${handle}`, zone, size, visual, {
      zone: 'resize',
      operation: 'resize',
      handle,
      opacity: visual.handleRestOpacity,
      hoverOpacity: visual.hoverOpacity,
      square: true,
      texture: createMetaWindowChromeTexture(THREE, 'corner', {
        handle,
        color: panelChromeCssColor(visual.handleColor, '#fafafa'),
      }),
    });
    object.userData.panelId = frame.panelId;
    if (addPanelFrameVisualObject(mesh, object)) {
      objects.push(object);
      zones.push(`resize:${handle}`);
    }
  }

  for (let [handle, zone] of Object.entries(frame.zones.edges || {})) {
    let object = buildPanelFrameZoneVisual(THREE, `edge-${handle}`, zone, size, visual, {
      zone: 'edge',
      operation: 'move',
      handle,
      opacity: visual.handleRestOpacity,
      hoverOpacity: visual.hoverOpacity,
      texture: createMetaWindowChromeTexture(THREE, 'edge', {
        edge: handle,
        color: panelChromeCssColor(visual.handleColor, '#fafafa'),
      }),
    });
    object.userData.panelId = frame.panelId;
    if (addPanelFrameVisualObject(mesh, object)) {
      objects.push(object);
      zones.push(`edge:${handle}`);
    }
  }

  for (let [action, zone] of Object.entries(frame.zones.actions || {})) {
    let object = buildPanelFrameZoneVisual(THREE, `action-${action}`, zone, size, visual, {
      zone: 'action',
      operation: 'action',
      action,
      color: action === 'pin' && frame.state.pinned ? visual.pinnedColor : visual.actionColor,
      opacity: 0,
      hoverOpacity: 0,
    });
    object.material.depthWrite = false;
    object.userData.panelId = frame.panelId;
    if (addPanelFrameVisualObject(mesh, object)) {
      objects.push(object);
      zones.push(`action:${action}`);
    }
  }

  let summary = {
    ok: true,
    type: 'panel-frame-visuals',
    panelId: frame.panelId,
    objectCount: objects.length,
    zones,
    footer: true,
    resizeHandles: Object.keys(frame.zones.resize || {}).length,
    edgeHandles: Object.keys(frame.zones.edges || {}).length,
    actionSlots: Object.keys(frame.zones.actions || {}).length,
    objects,
  };
  mesh.userData ||= {};
  mesh.userData.panelFrameVisuals = summary;
  mesh.userData.updatePanelFrameVisuals = () => buildPanelFrameVisuals(THREE, mesh.userData.panel || panel, mesh, options);
  return summary;
}

function updatePanelFrameHoverVisuals(mesh, hovered, framePoint = null, smoothing = 0.25, options = {}) {
  let objects = mesh?.userData?.panelFrameVisuals?.objects || [];
  // Corner grips reveal by pointer proximity (Horizon-style), compared in
  // meters so the reveal distance is independent of panel size.
  let revealRadiusMeters = Number(options.revealRadiusMeters ?? 0.12);
  if (!Number.isFinite(revealRadiusMeters) || revealRadiusMeters <= 0) revealRadiusMeters = 0.12;
  let size = readPanelSize(mesh);
  for (let object of objects) {
    let material = object?.material;
    if (!material) continue;
    let base = Number(object.userData?.baseOpacity ?? 0);
    let peak = Number(object.userData?.hoverOpacity ?? base);
    let reveal = hovered;
    if (reveal && (object.userData?.zone === 'resize' || object.userData?.zone === 'edge')) {
      let center = object.userData.zoneCenter;
      reveal = Boolean(framePoint && center &&
        Math.abs((framePoint.x - center.x) * size[0]) < revealRadiusMeters &&
        Math.abs((framePoint.y - center.y) * size[1]) < revealRadiusMeters);
    }
    let target = reveal ? peak : base;
    let current = Number(material.opacity);
    if (!Number.isFinite(current)) current = base;
    let next = current + (target - current) * smoothing;
    material.opacity = Math.abs(next - target) < 0.004 ? target : next;
    if (object.userData?.expandedTexture) {
      let bounds = object.userData.zoneBounds;
      let expanded = Boolean(framePoint && bounds &&
        framePoint.x >= bounds.x && framePoint.x <= bounds.x + bounds.width &&
        framePoint.y >= bounds.y && framePoint.y <= bounds.y + bounds.height);
      material.map = expanded
        ? object.userData.expandedTexture
        : object.userData.collapsedTexture;
    }
  }
}

function createMaterial(THREE, panel, options = {}) {
  let material = panel.material || {};
  let color = options.colorResolver?.(panel) ||
    material.threeColor ||
    material.backgroundColor ||
    panel.color ||
    XR_PANEL_SURFACE_COLOR;
  if (typeof THREE.MeshBasicMaterial === 'function') {
    return new THREE.MeshBasicMaterial({
      color,
      side: THREE.DoubleSide,
      transparent: false,
      opacity: Number(options.opacity ?? 1),
    });
  }
  return new THREE.MeshStandardMaterial({
    color,
    roughness: Number(options.roughness ?? 0.72),
    metalness: Number(options.metalness ?? 0.04),
    side: THREE.DoubleSide,
    transparent: false,
    opacity: Number(options.opacity ?? 1),
  });
}

function applyStrictTextureDiagnosticMaterial(mesh, textureRecord, options = {}) {
  if (!mesh) return;
  mesh.visible = false;
  mesh.userData ||= {};
  mesh.userData.strictTextureHidden = true;
  mesh.userData.strictTextureDiagnostic = false;
  mesh.userData.strictTextureDiagnosticReason = textureRecord?.reason || textureRecord?.stage || 'texture-unavailable';
  let material = mesh.material;
  if (!material) return;
  material.map = null;
  material.transparent = false;
  material.opacity = Number(options.strictTextureDiagnosticOpacity ?? 1);
  if (material.color?.setHex) {
    material.color.setHex(Number(options.strictTextureDiagnosticColor ?? 0x5b6572));
  } else {
    material.color = Number(options.strictTextureDiagnosticColor ?? 0x5b6572);
  }
  if (material.emissive?.setHex) {
    material.emissive.setHex(Number(options.strictTextureDiagnosticEmissive ?? 0x15191f));
  }
  markMaterialUpdated(material);
}

function resolvePanelElement(panel, options = {}) {
  if (typeof options.getPanelElement === 'function') {
    return options.getPanelElement(panel.id, panel);
  }
  if (options.panelElements?.get) {
    return options.panelElements.get(panel.id) || null;
  }
  if (options.panelElements && typeof options.panelElements === 'object') {
    return options.panelElements[panel.id] || null;
  }
  return null;
}

function markMaterialUpdated(material) {
  if (!material) return;
  material.needsUpdate = true;
}

function applyMaterialColor(material, color) {
  if (!material?.color || color == null) return false;
  if (typeof color === 'number' && hasFn(material.color, 'setHex')) {
    material.color.setHex(color);
    markMaterialUpdated(material);
    return true;
  }
  if (typeof color === 'string' && hasFn(material.color, 'setStyle')) {
    material.color.setStyle(color);
    markMaterialUpdated(material);
    return true;
  }
  if (hasFn(material.color, 'set')) {
    material.color.set(color);
    markMaterialUpdated(material);
    return true;
  }
  return false;
}

function colorSummary(color) {
  if (color == null) return null;
  if (typeof color === 'number' || typeof color === 'string') return color;
  if (typeof color.getHexString === 'function') return `#${color.getHexString()}`;
  if (typeof color.getHex === 'function') return color.getHex();
  return null;
}

function textureSummary(texture) {
  if (!texture) return null;
  let image = texture.image || null;
  return {
    name: texture.name || null,
    isTexture: texture.isTexture === true,
    kind: texture.isHTMLTexture ? 'html-texture' : texture.isCanvasTexture ? 'canvas-texture' : texture.isTexture ? 'texture' : 'host-texture',
    width: Number.isFinite(Number(image?.width)) ? Number(image.width) : null,
    height: Number.isFinite(Number(image?.height)) ? Number(image.height) : null,
    colorSpace: texture.colorSpace || texture.encoding || null,
    premultiplyAlpha: texture.premultiplyAlpha == null ? null : Boolean(texture.premultiplyAlpha),
    flipY: texture.flipY == null ? null : Boolean(texture.flipY),
    generateMipmaps: texture.generateMipmaps == null ? null : Boolean(texture.generateMipmaps),
    needsUpdate: texture.needsUpdate == null ? null : Boolean(texture.needsUpdate),
  };
}

function materialSummary(mesh) {
  let material = mesh?.material || null;
  return {
    panelId: mesh?.userData?.panelId || null,
    visible: mesh?.visible !== false,
    transparent: material?.transparent === true,
    opacity: Number.isFinite(Number(material?.opacity)) ? Number(material.opacity) : null,
    mapApplied: Boolean(material?.map),
    mapName: material?.map?.name || null,
    texture: textureSummary(material?.map),
    color: colorSummary(material?.color),
    emissive: colorSummary(material?.emissive),
    side: material?.side == null ? null : String(material.side),
    depthTest: material?.depthTest == null ? null : Boolean(material.depthTest),
    depthWrite: material?.depthWrite == null ? null : Boolean(material.depthWrite),
    renderOrder: Number.isFinite(Number(mesh?.renderOrder)) ? Number(mesh.renderOrder) : 0,
    strictDiagnostic: mesh?.userData?.strictTextureDiagnostic === true,
    strictDiagnosticReason: mesh?.userData?.strictTextureDiagnosticReason || null,
  };
}

function summarizePanelMaterials(meshes = []) {
  let panels = meshes.map(materialSummary);
  return {
    version: 'xr-three-panel-material-diagnostics-v1',
    total: panels.length,
    transparentCount: panels.filter((panel) => panel.transparent).length,
    mappedCount: panels.filter((panel) => panel.mapApplied).length,
    strictDiagnosticCount: panels.filter((panel) => panel.strictDiagnostic).length,
    strictDiagnosticPanelIds: panels.filter((panel) => panel.strictDiagnostic).map((panel) => panel.panelId).filter(Boolean),
    panels,
  };
}

function applyPanelFrameVisualState(mesh, resolved = {}) {
  let objects = mesh?.userData?.panelFrameVisuals?.objects || [];
  let state = resolved.state || 'default';
  let updated = 0;
  let active = state !== 'default';
  for (let object of objects) {
    let material = object?.material || null;
    let color = active ? resolved.color : object?.userData?.baseColor;
    let colorApplied = applyMaterialColor(material, color);
    let opacityApplied = false;
    if (material && 'opacity' in material) {
      let baseOpacity = Number(object?.userData?.baseOpacity ?? material.opacity ?? 0.34);
      material.opacity = active ? Math.min(1, baseOpacity + 0.22) : baseOpacity;
      markMaterialUpdated(material);
      opacityApplied = true;
    }
    object.userData ||= {};
    object.userData.state = state;
    if (colorApplied || opacityApplied) updated += 1;
  }
  return {
    count: objects.length,
    updated,
    state,
  };
}

function resolvePanelStateColor(mesh, state = {}, themeSnapshot = {}) {
  let panelId = mesh?.userData?.panelId || null;
  let material = themeSnapshot.material || {};
  let baseColor = mesh?.userData?.baseColor ||
    mesh?.userData?.panel?.material?.backgroundColor ||
    material.backgroundColor ||
    material.background ||
    null;
  if (panelId && (panelId === state.draggingPanelId || panelId === state.selectedPanelId)) {
    return {
      state: panelId === state.draggingPanelId ? 'dragging' : 'selected',
      color: material.pointerColor || material.pointer || baseColor,
    };
  }
  if (panelId && panelId === state.hoverPanelId) {
    return {
      state: 'hover',
      color: material.borderColor || material.border || baseColor,
    };
  }
  return {
    state: 'default',
    color: baseColor,
  };
}

export function updateXRThreePanelMaterialStates(options = {}) {
  let adapter = options.adapter || null;
  let meshes = options.meshes || adapter?.listPanelMeshes?.() || [];
  let sessionState = options.sessionState || {};
  let themeSnapshot = options.themeSnapshot || {};
  let state = {
    hoverPanelId: sessionState.hover?.panelId || sessionState.hoverPanelId || null,
    selectedPanelId: sessionState.selectedPanelId || null,
    draggingPanelId: sessionState.draggingPanelId || null,
  };
  let panels = [];

  for (let mesh of meshes) {
    let panelId = mesh?.userData?.panelId || null;
    let resolved = resolvePanelStateColor(mesh, state, themeSnapshot);
    let applied = applyMaterialColor(mesh?.material, resolved.color);
    let frameVisuals = applyPanelFrameVisualState(mesh, resolved);
    panels.push({
      panelId,
      state: resolved.state,
      applied,
      frameVisuals,
      colorType: resolved.color == null ? null : typeof resolved.color,
    });
  }

  return {
    version: 'xr-three-panel-material-state-v1',
    panelCount: panels.length,
    hoverPanelId: state.hoverPanelId,
    selectedPanelId: state.selectedPanelId,
    draggingPanelId: state.draggingPanelId,
    panels,
  };
}

function classifyTextureBridgeStage(summary, texture, textureReason) {
  if (!summary) return 'texture-source-missing';
  if (texture) return 'three-material-applied';
  if (summary.source !== 'html-in-canvas') return 'html-in-canvas-support';
  if (textureReason === 'texture-resolver-missing') return 'three-texture-resolver';
  if (textureReason === 'texture-resolver-empty') return 'three-texture-upload';
  return 'three-material-pending';
}

function resolveTextureDocument(options = {}) {
  return options.document || options.globalThis?.document || globalThis?.document || null;
}

function createTextureCanvas(documentRef, panel, options = {}) {
  let canvas = options.canvasFactory?.(panel) || documentRef?.createElement?.('canvas') || null;
  if (!canvas) return null;
  resizeTextureCanvas(canvas, panel, options);
  return canvas;
}

function resizeTextureCanvas(canvas, panel, options = {}) {
  let policy = options.qualityPolicy || createXRTextureQualityPolicy(panel, options);
  let width = Number(options.width || policy.texturePixels?.width || panel.previewPixels?.width || 1024);
  let height = Number(options.height || policy.texturePixels?.height || panel.previewPixels?.height || 576);
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  return canvas;
}

function applyTextureQualityOptions(THREE, texture, options = {}) {
  if (!texture) return null;
  let applied = {
    minFilter: null,
    magFilter: null,
    colorSpace: null,
    mipmaps: null,
    anisotropy: null,
  };
  let minFilter = options.minFilter || THREE?.LinearFilter || null;
  let magFilter = options.magFilter || THREE?.LinearFilter || null;
  if (minFilter != null) {
    texture.minFilter = minFilter;
    applied.minFilter = 'linear';
  }
  if (magFilter != null) {
    texture.magFilter = magFilter;
    applied.magFilter = 'linear';
  }
  if (options.generateMipmaps != null || 'generateMipmaps' in texture) {
    texture.generateMipmaps = options.generateMipmaps === true;
    applied.mipmaps = texture.generateMipmaps;
  }
  let colorSpace = options.colorSpace || THREE?.SRGBColorSpace || null;
  if (colorSpace != null && 'colorSpace' in texture) {
    texture.colorSpace = colorSpace;
    applied.colorSpace = 'srgb';
  } else if (THREE?.sRGBEncoding && 'encoding' in texture) {
    texture.encoding = THREE.sRGBEncoding;
    applied.colorSpace = 'srgb-encoding';
  }
  let anisotropy = Number(options.anisotropy || 0);
  if (Number.isFinite(anisotropy) && anisotropy > 0 && 'anisotropy' in texture) {
    texture.anisotropy = anisotropy;
    applied.anisotropy = anisotropy;
  }
  texture.needsUpdate = true;
  return applied;
}

function createThreeCanvasTexture(THREE, canvas, options = {}) {
  if (!THREE || !canvas) return null;
  let texture = null;
  if (typeof THREE.CanvasTexture === 'function') {
    texture = new THREE.CanvasTexture(canvas);
  } else if (typeof THREE.Texture === 'function') {
    texture = new THREE.Texture(canvas);
  }
  if (!texture) return null;
  texture.name = options.name || 'sn-xr-html-canvas-texture';
  applyTextureQualityOptions(THREE, texture, options);
  if ('isTexture' in texture) texture.isTexture = true;
  return texture;
}

function createThreeHtmlElementTexture(THREE, element, options = {}) {
  if (!THREE || !element || typeof THREE.HTMLTexture !== 'function') return null;
  let texture;
  try {
    texture = new THREE.HTMLTexture(element);
  } catch {
    return null;
  }
  texture.name = options.name || 'sn-xr-html-element-texture';
  applyTextureQualityOptions(THREE, texture, options);
  if ('isTexture' in texture) texture.isTexture = true;
  return texture;
}

function requiresThreeHtmlTexture(input = {}) {
  let support = input.support || {};
  let diagnostics = support.diagnostics || {};
  return diagnostics.textureUploadAvailable === true ||
    support.modes?.webgl === true ||
    support.modes?.webgpu === true;
}

function canUseThreeHtmlTexture(THREE, input = {}) {
  return typeof THREE?.HTMLTexture === 'function' && input.element && requiresThreeHtmlTexture(input);
}

export function createXRThreeTextureCapabilitySummary(THREE, support = {}) {
  let diagnostics = support.diagnostics || {};
  let modes = support.modes || {};
  let textureUploadAvailable = diagnostics.textureUploadAvailable === true ||
    modes.webgl === true ||
    modes.webgpu === true;
  let htmlTextureAvailable = typeof THREE?.HTMLTexture === 'function';
  let htmlTextureUsable = Boolean(htmlTextureAvailable && textureUploadAvailable);
  let threeRevision = THREE?.REVISION == null ? null : String(THREE.REVISION);
  let htmlTextureRequired = textureUploadAvailable;
  let reason = !textureUploadAvailable
    ? 'html-in-canvas-texture-upload-missing'
    : htmlTextureRequired && !htmlTextureAvailable
    ? 'three-html-texture-api-missing'
    : null;
  return {
    version: 'xr-three-texture-capability-v1',
    renderer: 'three',
    threeRevision,
    htmlTextureAvailable,
    htmlTextureUsable,
    htmlTextureRequired,
    textureUploadAvailable,
    modes: {
      webgl: modes.webgl === true,
      webgpu: modes.webgpu === true,
      canvas2d: modes.canvas2d === true,
    },
    ready: htmlTextureUsable,
    reason,
  };
}

function resolveCanvasSource(input = {}) {
  let explicitCanvas = input.canvas || input.prepareResult?.canvas || null;
  if (explicitCanvas) return explicitCanvas;
  let parent = input.element?.parentElement || input.element?.parentNode || null;
  let tagName = String(parent?.tagName || parent?.nodeName || '').toLowerCase();
  return tagName === 'canvas' ? parent : null;
}

export function createXRThreeHtmlCanvasTextureResolver(options = {}) {
  let THREE = options.THREE;
  let documentRef = resolveTextureDocument(options);
  let htmlCanvasRenderer = options.htmlCanvasRenderer || createXRHtmlCanvasRenderer({
    globalThis: options.globalThis,
    mode: options.mode,
  });
  let records = new Map();
  let textures = new Map();

  function textureDirtyKey(input = {}, canvas, policy) {
    let panel = input.panel || {};
    return String(input.dirtyKey ||
      panel.textureKey ||
      input.element?.dataset?.textureKey ||
      input.element?.dataset?.updatedAt ||
      `${canvas?.width || 0}x${canvas?.height || 0}:${policy.texturePixelRatio}:${policy.redrawMode}`);
  }

  function resolveTexture(input = {}) {
    let panel = input.panel || {};
    let panelId = panel.id || null;
    if (!panelId) {
      return null;
    }
    if (input.summary?.source !== 'html-in-canvas') {
      records.set(panelId, {
        ok: false,
        panelId,
        reason: input.summary?.reason || 'html-in-canvas-unavailable',
        stage: 'html-in-canvas-support',
        textureApplied: false,
        width: null,
        height: null,
      });
      return null;
    }
    let policy = createXRTextureQualityPolicy(panel, {
      ...options,
      ...(input.textureQuality || {}),
      preferTargetDensity: input.textureQuality?.preferTargetDensity ?? options.preferTargetDensity ?? true,
    });
    if (requiresThreeHtmlTexture(input) && typeof THREE?.HTMLTexture !== 'function') {
      records.set(panelId, {
        ok: false,
        panelId,
        reason: 'three-html-texture-api-missing',
        stage: 'three-html-texture-api',
        textureApplied: false,
        width: panel.contentViewport?.width || panel.texturePixels?.width || null,
        height: panel.contentViewport?.height || panel.texturePixels?.height || null,
        render: null,
        quality: createXRPanelTextureQualitySummary(panel, {
          ...options,
          textureWidth: panel.contentViewport?.width || panel.texturePixels?.width || 0,
          textureHeight: panel.contentViewport?.height || panel.texturePixels?.height || 0,
          texturePixelRatio: policy.texturePixelRatio,
        }),
        redraw: false,
        renderCount: 0,
        redrawCount: 0,
        lastUploadMs: null,
      });
      return null;
    }
    let htmlTextureSupported = canUseThreeHtmlTexture(THREE, input);
    let canvas = resolveCanvasSource(input) || textures.get(panelId)?.canvas || (!htmlTextureSupported ? createTextureCanvas(documentRef, panel, {
      ...options,
      qualityPolicy: policy,
    }) : null);
    if (!canvas && !htmlTextureSupported) {
      records.set(panelId, {
        ok: false,
        panelId,
        reason: 'canvas-target-missing',
        stage: 'canvas-target',
        textureApplied: false,
        width: null,
        height: null,
      });
      return null;
    }
    if (canvas) resizeTextureCanvas(canvas, panel, { ...options, qualityPolicy: policy });
    let dirtyKey = textureDirtyKey(input, canvas, policy);
    let entry = textures.get(panelId);
    let redrawMode = input.redrawMode || policy.redrawMode || options.redrawMode || 'dirty';
    let textureWidth = canvas?.width || panel.contentViewport?.width || panel.texturePixels?.width || 0;
    let textureHeight = canvas?.height || panel.contentViewport?.height || panel.texturePixels?.height || 0;
    let quality = createXRPanelTextureQualitySummary(panel, {
      ...options,
      textureWidth,
      textureHeight,
      texturePixelRatio: policy.texturePixelRatio,
    });
    if (entry?.texture && entry.dirtyKey === dirtyKey && redrawMode !== 'always') {
      records.set(panelId, {
        ok: true,
        panelId,
        reason: null,
        stage: entry.stage === 'three-html-texture-ready'
          ? 'three-html-texture-reused'
          : 'three-canvas-texture-reused',
        textureApplied: true,
        width: textureWidth,
        height: textureHeight,
        render: entry.render || null,
        quality,
        redraw: false,
        renderCount: entry.renderCount || 1,
        redrawCount: entry.redrawCount || 1,
        lastUploadMs: entry.lastUploadMs ?? null,
      });
      return entry.texture;
    }
    let startedAt = nowMs(options);
    if (htmlTextureSupported) {
      let texture = entry?.texture || createThreeHtmlElementTexture(THREE, input.element, {
        name: `sn-xr-panel-${panelId}-html-texture`,
        ...(options.texture || {}),
      });
      let finishedAt = nowMs(options);
      if (!texture) {
        records.set(panelId, {
          ok: false,
          panelId,
          reason: 'three-html-texture-api-missing',
          stage: 'three-html-texture-api',
          textureApplied: false,
          width: textureWidth || null,
          height: textureHeight || null,
          render: null,
          quality,
          redraw: true,
          renderCount: entry?.renderCount || 0,
          redrawCount: entry?.redrawCount || 0,
          lastUploadMs: null,
        });
        return null;
      }
      let textureOptions = applyTextureQualityOptions(THREE, texture, options.texture || {});
      let renderCount = (entry?.renderCount || 0) + 1;
      let redrawCount = (entry?.redrawCount || 0) + 1;
      let lastUploadMs = Math.max(0, finishedAt - startedAt);
      textures.set(panelId, {
        canvas,
        texture,
        dirtyKey,
        render: { rendered: true, mode: 'three-html-texture' },
        renderCount,
        redrawCount,
        lastUploadMs,
        textureOptions,
        stage: 'three-html-texture-ready',
      });
      records.set(panelId, {
        ok: true,
        panelId,
        reason: null,
        stage: 'three-html-texture-ready',
        textureApplied: true,
        width: textureWidth || null,
        height: textureHeight || null,
        render: { rendered: true, mode: 'three-html-texture' },
        quality,
        redraw: true,
        renderCount,
        redrawCount,
        lastUploadMs,
        textureOptions,
      });
      return texture;
    }
    let renderResult = htmlCanvasRenderer.renderPanelPreview(panelId, canvas, {
      width: canvas.width,
      height: canvas.height,
      ...(options.renderOptions || {}),
    });
    let finishedAt = nowMs(options);
    if (!renderResult?.rendered) {
      records.set(panelId, {
        ok: false,
        panelId,
        reason: renderResult?.reason || 'html-canvas-preview-render-failed',
        stage: 'html-canvas-preview',
        textureApplied: false,
        width: canvas.width,
        height: canvas.height,
        render: renderResult || null,
        quality,
        redraw: true,
        renderCount: entry?.renderCount || 0,
        redrawCount: entry?.redrawCount || 0,
        lastUploadMs: null,
      });
      return null;
    }
    let texture = entry?.texture || createThreeCanvasTexture(THREE, canvas, {
      name: `sn-xr-panel-${panelId}-texture`,
      ...(options.texture || {}),
    });
    if (!texture) {
      records.set(panelId, {
        ok: false,
        panelId,
        reason: 'three-texture-api-missing',
        stage: 'three-texture-api',
        textureApplied: false,
        width: canvas.width,
        height: canvas.height,
        render: renderResult,
        quality,
        redraw: true,
        renderCount: entry?.renderCount || 0,
        redrawCount: entry?.redrawCount || 0,
        lastUploadMs: null,
      });
      return null;
    }
    let textureOptions = applyTextureQualityOptions(THREE, texture, options.texture || {});
    let renderCount = (entry?.renderCount || 0) + 1;
    let redrawCount = (entry?.redrawCount || 0) + 1;
    let lastUploadMs = Math.max(0, finishedAt - startedAt);
    textures.set(panelId, {
      canvas,
      texture,
      dirtyKey,
      render: renderResult,
      renderCount,
      redrawCount,
      lastUploadMs,
      textureOptions,
    });
    records.set(panelId, {
      ok: true,
      panelId,
      reason: null,
      stage: 'three-canvas-texture-ready',
      textureApplied: true,
      width: canvas.width,
      height: canvas.height,
      render: renderResult,
      quality,
      redraw: true,
      renderCount,
      redrawCount,
      lastUploadMs,
      textureOptions,
    });
    return texture;
  }

  return {
    resolve: resolveTexture,
    getState() {
      return {
        version: 'xr-three-html-canvas-texture-resolver-v1',
        panelCount: records.size,
        textureCount: textures.size,
        panelIds: [...records.keys()],
        records: [...records.values()].map((record) => ({
          ok: record.ok,
          panelId: record.panelId,
          reason: record.reason,
          stage: record.stage,
          textureApplied: record.textureApplied,
          width: record.width,
          height: record.height,
          mode: record.render?.mode || null,
          qualityStatus: record.quality?.status || null,
          qualityWarnings: record.quality?.warnings || [],
          qualityRecommendations: record.quality?.recommendations || [],
          texturePixels: record.quality?.texturePixels || (
            record.width && record.height ? { width: record.width, height: record.height } : null
          ),
          requiredPixels: record.quality?.requiredPixels || null,
          thresholds: record.quality?.thresholds || null,
          texturePixelRatio: record.quality?.policy?.texturePixelRatio ?? null,
          redrawMode: record.quality?.policy?.redrawMode || null,
          pixelsPerMeter: record.quality?.pixelsPerMeter?.min || null,
          redraw: record.redraw === true,
          renderCount: record.renderCount || 0,
          redrawCount: record.redrawCount || 0,
          lastUploadMs: record.lastUploadMs ?? null,
        })),
      };
    },
    dispose() {
      for (let entry of textures.values()) {
        if (typeof entry?.texture?.dispose === 'function') {
          entry.texture.dispose();
        }
      }
      records.clear();
      textures.clear();
    },
  };
}

function summarizeTextureBridgeSupport(support = {}) {
  let diagnostics = support.diagnostics || {};
  return {
    supported: Boolean(support.supported || diagnostics.supported),
    preferredMode: support.preferredMode || diagnostics.mode || null,
    recommendation: diagnostics.recommendation || null,
    missing: Array.isArray(diagnostics.missing) ? [...diagnostics.missing] : [],
    blockingMissing: Array.isArray(diagnostics.blockingMissing) ? [...diagnostics.blockingMissing] : [],
  };
}

export function createXRThreePanelTextureBridge(options = {}) {
  let htmlCanvasRenderer = options.htmlCanvasRenderer || createXRHtmlCanvasRenderer({
    globalThis: options.globalThis,
    mode: options.mode,
  });
  let records = new Map();

  function getSupport() {
    return htmlCanvasRenderer.getSupport();
  }

  function applyPanelTexture(mesh, panel, applyOptions = {}) {
    let element = applyOptions.element || resolvePanelElement(panel, { ...options, ...applyOptions });
    if (!mesh || !panel?.id) {
      return { ok: false, reason: 'missing-panel-mesh', panelId: panel?.id || null };
    }
    if (!element) {
      let support = getSupport();
      let supportSummary = summarizeTextureBridgeSupport(support);
      let summary = createXRPanelTextureSourceSummary(panel, {
        prepared: false,
        panelId: panel.id,
        mode: support.preferredMode || 'unsupported',
        supported: false,
        reason: 'panel-element-missing',
      }, support, {
        allowMaterialFallback: !(applyOptions.requireTextureUpload ?? options.requireTextureUpload),
      });
      let record = {
        ok: false,
        panelId: panel.id,
        reason: 'panel-element-missing',
        stage: 'panel-element',
        strictRequired: Boolean(applyOptions.requireTextureUpload ?? options.requireTextureUpload),
        textureApplied: false,
        textureKind: null,
        support: supportSummary,
        summary,
      };
      records.set(panel.id, record);
      mesh.userData ||= {};
      mesh.userData.textureSource = summary;
      mesh.userData.textureBridge = {
        ok: record.ok,
        stage: record.stage,
        strictRequired: record.strictRequired,
        textureApplied: record.textureApplied,
        reason: record.reason,
      };
      return record;
    }

    let canvas = applyOptions.canvas || options.canvas || resolveCanvasSource({ element });
    let prepareResult = htmlCanvasRenderer.preparePanel(element, panel, {
      mode: applyOptions.mode || options.mode,
      canvas,
    });
    let support = getSupport();
    let supportSummary = summarizeTextureBridgeSupport(support);
    let strictRequired = Boolean(applyOptions.requireTextureUpload ?? options.requireTextureUpload);
    let summary = createXRPanelTextureSourceSummary(panel, prepareResult, support, {
      allowMaterialFallback: !strictRequired,
    });
    let textureQuality = createXRPanelTextureQualitySummary(panel, applyOptions.textureQuality || options.textureQuality || {});
    let texture = null;
    let textureReason = null;
    if (summary.source === 'html-in-canvas' && typeof options.textureResolver === 'function') {
      texture = options.textureResolver({
        mesh,
        panel,
        element,
        prepareResult,
        canvas: prepareResult.canvas || canvas,
        textureQuality: applyOptions.textureQuality || options.textureQuality || null,
        support,
        summary,
      }) || null;
      if (!texture) textureReason = 'texture-resolver-empty';
    } else if (summary.source === 'html-in-canvas') {
      textureReason = 'texture-resolver-missing';
    }

    if (texture && mesh.material) {
      mesh.material.map = texture;
      if ('color' in mesh.material && typeof mesh.material.color?.setHex === 'function') {
        mesh.material.color.setHex(0xffffff);
      }
      markMaterialUpdated(mesh.material);
    }

    let stage = classifyTextureBridgeStage(summary, texture, textureReason);
    let record = {
      ok: summary.source === 'html-in-canvas' && (!strictRequired || Boolean(texture)),
      panelId: panel.id,
      reason: textureReason || summary.reason,
      stage,
      strictRequired,
      textureApplied: Boolean(texture),
      textureKind: texture?.isTexture ? 'three-texture' : texture ? 'host-texture' : null,
      support: supportSummary,
      textureQuality,
      summary,
    };
    records.set(panel.id, record);
    mesh.userData ||= {};
    mesh.userData.textureSource = summary;
    mesh.userData.textureBridge = {
      ok: record.ok,
      stage: record.stage,
      strictRequired: record.strictRequired,
      textureApplied: record.textureApplied,
      reason: record.reason,
    };
    return record;
  }

  return {
    applyPanelTexture,
    getSupport,
    dispose() {
      records.clear();
      options.textureResolverDispose?.();
    },
    getState() {
      return {
        version: 'xr-three-panel-texture-bridge-v1',
        panelCount: records.size,
        panelIds: [...records.keys()],
        records: [...records.values()].map((record) => ({
          ok: record.ok,
          panelId: record.panelId,
          reason: record.reason,
          stage: record.stage,
          strictRequired: record.strictRequired,
          textureApplied: record.textureApplied,
          source: record.summary?.source || null,
          mode: record.summary?.mode || null,
          support: record.support || null,
          textureQuality: record.textureQuality || null,
        })),
      };
    },
  };
}

function createPanelMesh(THREE, panel, options = {}) {
  let size = Array.isArray(panel.size) ? panel.size : [0.8, 0.45];
  let geometry = new THREE.PlaneGeometry(Number(size[0] || 0.8), Number(size[1] || 0.45));
  let mesh = new THREE.Mesh(geometry, createMaterial(THREE, panel, options));
  applyVector(mesh.position, Array.isArray(panel.position) ? panel.position : [0, 1.35, -1.8]);
  applyRotation(mesh.rotation, Array.isArray(panel.rotation) ? panel.rotation : [0, 0, 0]);
  mesh.userData.panelId = panel.id || null;
  mesh.userData.panel = panel;
  mesh.userData.THREE = THREE;
  mesh.userData.baseSize = [Number(size[0] || 0.8), Number(size[1] || 0.45)];
  mesh.userData.xrSize = [...mesh.userData.baseSize];
  // Hit-test zones must match the visible chrome, so the frame build shares
  // the visuals' frame options; panelFrame wins on explicit conflict. Stored
  // for the stale-frame rebuild in applyPanelSize (meter-derived zones go
  // stale on resize otherwise).
  let frameOptions = { ...(options.panelFrameVisuals?.frame || {}), ...(options.panelFrame || {}) };
  mesh.userData.panelFrameOptions = frameOptions;
  mesh.userData.panelFrame = createXRPanelFrame(panel, frameOptions);
  mesh.userData.panelFrameVisuals = buildPanelFrameVisuals(THREE, panel, mesh, options.panelFrameVisuals || {});
  mesh.userData.baseColor = options.colorResolver?.(panel) ||
    panel.material?.threeColor ||
    panel.material?.backgroundColor ||
    panel.color ||
    null;
  attachChromeHitSurface(THREE, mesh);
  return mesh;
}

function chromeSurfaceExtents(mesh) {
  let [width, height] = mesh?.userData?.xrSize || [0.8, 0.45];
  // Legacy fractional floor keeps pre-meter-chrome behavior intact.
  let extendX = Math.max(0.06, width * 0.08);
  let extendY = Math.max(0.1, height * 0.18);
  // Grow (never shrink) the surface from the actual frame chrome: the footer
  // band below the window and the grips straddling the edges must stay
  // hittable. The plane is centered, so one extent covers both sides.
  let margin = 0.02;
  let zones = mesh?.userData?.panelFrame?.zones || {};
  if (zones.move) {
    extendY = Math.max(extendY, (zones.move.y + zones.move.height - 1) * height + margin);
  }
  let grip = zones.resize?.northWest;
  if (grip) {
    extendY = Math.max(extendY, -grip.y * height + margin);
    extendX = Math.max(extendX, -grip.x * width + margin);
  }
  return { extendX, extendY };
}

function attachChromeHitSurface(THREE, mesh) {
  // An invisible, slightly recessed plane larger than the window lets the
  // controller ray reach the Horizon-style chrome that floats OUTSIDE the
  // window (footer bar, straddling corner grips). Rays inside the window
  // still hit the panel first (it is closer), so content behavior is
  // untouched.
  if (typeof THREE?.PlaneGeometry !== 'function' || typeof THREE?.MeshBasicMaterial !== 'function') return;
  let [width, height] = mesh.userData.xrSize || [0.8, 0.45];
  let { extendX, extendY } = chromeSurfaceExtents(mesh);
  let surface = new THREE.Mesh(
    new THREE.PlaneGeometry(width + extendX * 2, height + extendY * 2),
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }),
  );
  surface.name = 'sn-xr-panel-chrome-surface';
  surface.userData ||= {};
  surface.userData.snChromeSurface = true;
  surface.userData.panelMesh = mesh;
  surface.userData.extend = { x: extendX, y: extendY };
  if (surface.position?.set) surface.position.set(0, 0, -0.002);
  mesh.add?.(surface);
  mesh.userData.chromeSurface = surface;
}

function remapChromeSurfaceHit(hit) {
  let surface = hit?.object;
  let panelMesh = surface?.userData?.panelMesh;
  if (!panelMesh || !hit?.uv) return null;
  let [width, height] = panelMesh.userData?.xrSize || [0.8, 0.45];
  let extend = surface.userData.extend || { x: 0, y: 0 };
  let chromeWidth = width + extend.x * 2;
  let chromeHeight = height + extend.y * 2;
  hit.object = panelMesh;
  hit.framePoint = {
    x: (Number(hit.uv.x || 0) * chromeWidth - extend.x) / width,
    y: 0.5 - ((Number(hit.uv.y || 0) - 0.5) * chromeHeight) / height,
  };
  // The chrome UV is not panel-content UV; content hit maps must never
  // consume it.
  hit.uv = null;
  return hit;
}

function createRootGroup(THREE, scene, transform) {
  if (typeof THREE?.Group !== 'function') return null;
  let group = new THREE.Group();
  group.name = 'sn-xr-scene-root';
  group.userData ||= {};
  group.userData.xrSceneRoot = true;
  group.userData.xrSceneRootTransform = transform;
  applyVector(group.position, transform.position);
  applyRotation(group.rotation, transform.rotation);
  scene.add?.(group);
  return group;
}

export function createXRThreePanelSceneAdapter(options = {}) {
  let THREE = options.THREE;
  let check = assertThree(THREE);
  let scene = check.ok ? new THREE.Scene() : null;
  let panels = new Map();
  let textureBridge = options.textureBridge || null;
  let activeTextureBridge = null;
  let textureRecords = new Map();
  let rootGroup = null;
  let rootTransform = null;
  let activeXRScene = null;
  let activeSetOptions = {};

  function applyRootTransform(transform) {
    rootTransform = transform;
    if (rootGroup) {
      rootGroup.userData ||= {};
      rootGroup.userData.xrSceneRootTransform = transform;
      applyVector(rootGroup.position, transform.position);
      applyRotation(rootGroup.rotation, transform.rotation);
    }
    return rootTransform;
  }

  function setScene(xrScene, setOptions = {}) {
    if (!check.ok) {
      return { ok: false, reason: check.reason, missing: check.missing, panelCount: 0 };
    }
    if (rootGroup) {
      scene.remove?.(rootGroup);
    } else {
      for (let mesh of panels.values()) {
        scene.remove?.(mesh);
      }
    }
    panels.clear();
    textureRecords.clear();
    activeXRScene = xrScene || null;
    activeSetOptions = { ...setOptions };
    activeTextureBridge = setOptions.textureBridge || textureBridge || null;
    rootTransform = createXRSceneRootTransform(xrScene, {
      mode: setOptions.mode,
      referenceSpaceType: setOptions.referenceSpaceType,
      viewerPose: setOptions.viewerPose,
      policy: setOptions.placementPolicy || options.placementPolicy,
    });
    rootGroup = createRootGroup(THREE, scene, rootTransform);
    let sceneTarget = rootGroup || scene;
    let diagnosticPanelIds = [];
    let hiddenPanelIds = [];
    let bridge = setOptions.textureBridge || textureBridge;
    bridge?.dispose?.();
    for (let panel of xrScene?.panels || []) {
      let mesh = createPanelMesh(THREE, panel, { ...options, ...setOptions });
      if (bridge?.applyPanelTexture) {
        let texture = bridge.applyPanelTexture(mesh, panel, setOptions.textureOptions || {});
        textureRecords.set(panel.id, texture);
        let diagnoseStrictFailure = Boolean(setOptions.hideStrictTextureFailures ?? options.hideStrictTextureFailures);
        if (diagnoseStrictFailure && texture?.strictRequired && !texture.ok) {
          applyStrictTextureDiagnosticMaterial(mesh, texture, { ...options, ...setOptions });
          diagnosticPanelIds.push(panel.id);
          hiddenPanelIds.push(panel.id);
        }
      }
      sceneTarget.add?.(mesh);
      panels.set(panel.id, mesh);
    }
    return {
      ok: true,
      scene,
      rootGroup,
      rootTransform,
      panelCount: panels.size,
      renderedPanelCount: [...panels.values()].filter((mesh) => mesh.visible !== false).length,
      hiddenPanelCount: hiddenPanelIds.length,
      hiddenPanelIds,
      diagnosticPanelCount: diagnosticPanelIds.length,
      diagnosticPanelIds,
      panelIds: [...panels.keys()],
      textureSources: [...textureRecords.values()],
    };
  }

  return {
    setScene,
    applyViewerPose(viewerPose, poseOptions = {}) {
      if (!check.ok) return { ok: false, reason: check.reason, missing: check.missing };
      let snapshot = createXRViewerPoseSnapshot(viewerPose, poseOptions);
      if (!snapshot.position && !snapshot.rotation) {
        return { ok: false, reason: 'missing-viewer-pose', snapshot };
      }
      let transform = createXRSceneRootTransform(activeXRScene || {}, {
        ...activeSetOptions,
        ...poseOptions,
        viewerPose: snapshot,
      });
      applyRootTransform(transform);
      return {
        ok: true,
        version: 'xr-three-viewer-pose-root-transform-v1',
        snapshot,
        rootTransform,
      };
    },
    getScene() {
      return scene;
    },
    getRootObject() {
      return rootGroup;
    },
    getPanelMesh(panelId) {
      return panels.get(panelId) || null;
    },
    listPanelMeshes() {
      return [...panels.values()];
    },
    updatePanelTextureQuality(panelId, qualityOptions = {}) {
      let mesh = panels.get(panelId);
      let panel = mesh?.userData?.panel;
      if (mesh && panel && activeTextureBridge?.applyPanelTexture) {
        let record = activeTextureBridge.applyPanelTexture(mesh, panel, {
          ...activeSetOptions.textureOptions,
          textureQuality: {
            ...activeSetOptions.textureOptions?.textureQuality,
            ...qualityOptions,
          }
        });
        textureRecords.set(panelId, record);
        return { ok: true, record };
      }
      return { ok: false, reason: 'bridge-or-panel-missing' };
    },
    getState() {
      let meshList = [...panels.values()];
      let materialDiagnostics = summarizePanelMaterials(meshList);
      return {
        ok: check.ok,
        reason: check.ok ? null : check.reason,
        missing: check.missing,
        panelCount: panels.size,
        rootTransform,
        renderedPanelCount: meshList.filter((mesh) => mesh.visible !== false).length,
        hiddenPanelCount: meshList.filter((mesh) => mesh.visible === false).length,
        hiddenPanelIds: meshList
          .filter((mesh) => mesh.visible === false)
          .map((mesh) => mesh.userData?.panelId)
          .filter(Boolean),
        diagnosticPanelCount: materialDiagnostics.strictDiagnosticCount,
        diagnosticPanelIds: materialDiagnostics.strictDiagnosticPanelIds,
        materialDiagnostics,
        panelIds: [...panels.keys()],
        panelFrameVisualCount: meshList.reduce((count, mesh) => (
          count + Number(mesh.userData?.panelFrameVisuals?.objectCount || 0)
        ), 0),
        panelFrameVisuals: [...panels.values()].map((mesh) => ({
          ok: Boolean(mesh.userData?.panelFrameVisuals?.ok),
          panelId: mesh.userData?.panelId || null,
          reason: mesh.userData?.panelFrameVisuals?.reason || null,
          objectCount: Number(mesh.userData?.panelFrameVisuals?.objectCount || 0),
          zones: mesh.userData?.panelFrameVisuals?.zones || [],
        })),
        textureSources: [...textureRecords.values()].map((record) => ({
          panelId: record.panelId,
          ok: record.ok,
          reason: record.reason,
          stage: record.stage,
          strictRequired: record.strictRequired,
        textureApplied: record.textureApplied,
        source: record.summary?.source || null,
        mode: record.summary?.mode || null,
        textureQuality: record.textureQuality || null,
        qualityStatus: record.textureQuality?.status || null,
        qualityWarnings: record.textureQuality?.warnings || [],
        qualityRecommendations: record.textureQuality?.recommendations || [],
        texturePixels: record.textureQuality?.texturePixels || null,
        requiredPixels: record.textureQuality?.requiredPixels || null,
        pixelsPerMeter: record.textureQuality?.pixelsPerMeter?.min || null,
        hidden: panels.get(record.panelId)?.visible === false ||
          panels.get(record.panelId)?.userData?.strictTextureHidden === true,
        diagnostic: Boolean(panels.get(record.panelId)?.userData?.strictTextureDiagnostic),
        diagnosticReason: panels.get(record.panelId)?.userData?.strictTextureDiagnosticReason || null,
        support: record.support || null,
      })),
    };
  },
  };
}

function setRayFromController(THREE, raycaster, controller) {
  if (hasFn(raycaster, 'setFromXRController')) {
    raycaster.setFromXRController(controller);
    return { ok: true, source: 'setFromXRController' };
  }
  if (!hasFn(controller, 'getWorldPosition') || !hasFn(controller, 'getWorldQuaternion')) {
    return { ok: false, reason: 'missing-controller-transform' };
  }
  let origin = controller.getWorldPosition(new THREE.Vector3());
  let direction = new THREE.Vector3(0, 0, -1).applyQuaternion(controller.getWorldQuaternion(new THREE.Quaternion()));
  raycaster.set(origin, direction);
  return { ok: true, source: 'world-transform' };
}

function vectorData(vector) {
  if (!vector) return null;
  return {
    x: Number(vector.x || 0),
    y: Number(vector.y || 0),
    z: Number(vector.z || 0),
  };
}

function framePointFromHit(hit) {
  // Chrome-surface hits carry an already-remapped frame point that may lie
  // outside the window UV square.
  if (hit?.framePoint) {
    return {
      x: Number(hit.framePoint.x || 0),
      y: Number(hit.framePoint.y || 0),
    };
  }
  if (hit?.uv) {
    return {
      x: Number(hit.uv.x || 0),
      y: 1 - Number(hit.uv.y || 0),
    };
  }
  return { x: 0.5, y: 0.5 };
}

function resolveHitFrameTarget(hit, options = {}) {
  let mesh = hit?.object || hit;
  let frame = mesh?.userData?.panelFrame;
  if (!frame) return null;
  return hitTestXRPanelFrame(frame, framePointFromHit(hit), options);
}

function isXRFrameDragTarget(frameTarget) {
  return frameTarget?.operation === 'move' || frameTarget?.operation === 'resize';
}

function distanceBetween(a, b) {
  if (!a || !b) return 0;
  let dx = Number(a.x || 0) - Number(b.x || 0);
  let dy = Number(a.y || 0) - Number(b.y || 0);
  let dz = Number(a.z || 0) - Number(b.z || 0);
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

function vectorBetween(a, b) {
  return {
    x: Number(a?.x || 0) - Number(b?.x || 0),
    y: Number(a?.y || 0) - Number(b?.y || 0),
    z: Number(a?.z || 0) - Number(b?.z || 0),
  };
}

function vectorLength(vector) {
  return Math.sqrt(
    Number(vector?.x || 0) ** 2 +
    Number(vector?.y || 0) ** 2 +
    Number(vector?.z || 0) ** 2
  );
}

function vectorDot(a, b) {
  return Number(a?.x || 0) * Number(b?.x || 0) +
    Number(a?.y || 0) * Number(b?.y || 0) +
    Number(a?.z || 0) * Number(b?.z || 0);
}

function axisVector(THREE, mesh, values) {
  let vector = THREE?.Vector3 ? new THREE.Vector3(...values) : { x: values[0], y: values[1], z: values[2] };
  let quaternion = hasFn(mesh, 'getWorldQuaternion') && THREE?.Quaternion
    ? mesh.getWorldQuaternion(new THREE.Quaternion())
    : mesh?.quaternion || null;
  if (quaternion && typeof vector.applyQuaternion === 'function') {
    vector.applyQuaternion(quaternion);
  }
  if (typeof vector.normalize === 'function') {
    vector.normalize();
  }
  return vector;
}

function meshWorldPositionOf(THREE, mesh) {
  if (hasFn(mesh, 'getWorldPosition') && THREE?.Vector3) {
    return mesh.getWorldPosition(new THREE.Vector3());
  }
  return mesh?.position?.clone?.() || mesh?.position || null;
}

function worldToPanelParentLocal(mesh, worldPosition) {
  let parent = mesh?.parent;
  if (parent && hasFn(parent, 'worldToLocal') && typeof worldPosition?.clone === 'function') {
    parent.updateWorldMatrix?.(true, false);
    return parent.worldToLocal(worldPosition.clone());
  }
  return worldPosition;
}

function readPanelSize(mesh, ignoreScale = false) {
  let explicit = mesh?.userData?.xrSize || mesh?.userData?.panel?.size;
  if (Array.isArray(explicit)) {
    return [
      Math.max(0.05, Number(explicit[0] || 0.8)),
      Math.max(0.05, Number(explicit[1] || 0.45)),
    ];
  }
  let parameters = mesh?.geometry?.parameters || {};
  // ignoreScale is for settle reads while a panel transition tween owns
  // mesh.scale: the mid-ease value is transient animation, not panel size.
  let scaleX = ignoreScale ? 1 : Number(mesh?.scale?.x || 1);
  let scaleY = ignoreScale ? 1 : Number(mesh?.scale?.y || 1);
  return [
    Math.max(0.05, Number(parameters.width || 0.8) * scaleX),
    Math.max(0.05, Number(parameters.height || 0.45) * scaleY),
  ];
}

function applyPanelSize(mesh, size, THREE) {
  if (!mesh || !Array.isArray(size)) return;
  let next = [
    Math.max(0.05, Number(size[0] || 0.8)),
    Math.max(0.05, Number(size[1] || 0.45)),
  ];
  mesh.userData ||= {};
  mesh.userData.xrSize = next;
  if (mesh.userData.panel) {
    mesh.userData.panel = { ...mesh.userData.panel, size: next };
  }
  let THREE_INST = THREE || mesh.userData.THREE;
  if (mesh.geometry) {
    let GeomConstructor = mesh.geometry.constructor || THREE_INST?.PlaneGeometry;
    if (GeomConstructor) {
      mesh.geometry.dispose?.();
      mesh.geometry = new GeomConstructor(next[0], next[1]);
    }
  }
  if (mesh.scale) {
    if (typeof mesh.scale.set === 'function') {
      mesh.scale.set(1, 1, 1);
    } else {
      mesh.scale.x = 1;
      mesh.scale.y = 1;
      mesh.scale.z = 1;
    }
  }
  // Meter-derived zones go stale on resize: rebuild the hit-test frame for the
  // new size before refreshing visuals and the chrome hit surface. Only meshes
  // that already carry a frame (created via createPanelMesh) — foreign meshes
  // without one must keep their resolveHitFrameTarget-null behavior.
  if (mesh.userData.panelFrame) {
    mesh.userData.panelFrame = createXRPanelFrame(
      mesh.userData.panel || {},
      { ...(mesh.userData.panelFrameOptions || {}), panelSizeMeters: next },
    );
  }
  mesh.userData.updatePanelFrameVisuals?.();
  refreshChromeHitSurface(mesh);
}

function refreshChromeHitSurface(mesh) {
  let surface = mesh?.userData?.chromeSurface;
  let THREE = mesh?.userData?.THREE;
  if (!surface || typeof THREE?.PlaneGeometry !== 'function') return;
  let [width, height] = mesh.userData.xrSize || [0.8, 0.45];
  let { extendX, extendY } = chromeSurfaceExtents(mesh);
  surface.geometry?.dispose?.();
  surface.geometry = new THREE.PlaneGeometry(width + extendX * 2, height + extendY * 2);
  surface.userData.extend = { x: extendX, y: extendY };
}

function resizePanelFromDrag(THREE, dragState, point, options = {}) {
  let frameTarget = dragState?.frameTarget || {};
  if (frameTarget.operation !== 'resize') {
    return null;
  }
  let handle = String(frameTarget.handle || '');
  let minWidth = Number(options.minWidth ?? options.minPanelWidth ?? 0.24);
  let minHeight = Number(options.minHeight ?? options.minPanelHeight ?? 0.16);
  let maxWidth = Number(options.maxWidth ?? options.maxPanelWidth ?? 3.2);
  let maxHeight = Number(options.maxHeight ?? options.maxPanelHeight ?? 2.4);
  let startSize = Array.isArray(dragState.startSize) ? dragState.startSize : readPanelSize(dragState.mesh);
  let delta = vectorBetween(point, dragState.startIntersection || point);
  let xAxis = axisVector(THREE, dragState.mesh, [1, 0, 0]);
  let yAxis = axisVector(THREE, dragState.mesh, [0, 1, 0]);
  let xDelta = vectorDot(delta, xAxis);
  let yDelta = vectorDot(delta, yAxis);
  let nextWidth = startSize[0];
  let nextHeight = startSize[1];
  let east = /east/i.test(handle);
  let west = /west/i.test(handle);
  let north = /north/i.test(handle);
  let south = /south/i.test(handle);

  // Horizon corner resizing expands symmetrically from the window center.
  if (east) nextWidth += xDelta * 2;
  if (west) nextWidth -= xDelta * 2;
  if (north) nextHeight += yDelta * 2;
  if (south) nextHeight -= yDelta * 2;

  nextWidth = Math.max(minWidth, Math.min(maxWidth, nextWidth));
  nextHeight = Math.max(minHeight, Math.min(maxHeight, nextHeight));
  let size = [nextWidth, nextHeight];
  applyPanelSize(dragState.mesh, size, THREE);
  if (dragState.startPosition?.clone && dragState.mesh?.position?.copy) {
    dragState.mesh.position.copy(dragState.startPosition.clone());
  }
  return {
    operation: 'resize',
    handle,
    size,
    delta: { x: xDelta, y: yDelta },
    centerShift: { x: 0, y: 0, z: 0 },
  };
}

function normalizeDragResponse(options = {}) {
  let smoothing = Number(options.dragSmoothing ?? options.smoothing ?? 0.72);
  let deadzone = Number(options.dragDeadzone ?? options.deadzone ?? 0.0015);
  let maxStep = Number(options.maxDragStep ?? options.maxStep ?? 0.18);
  return {
    smoothing: Number.isFinite(smoothing) ? Math.max(0.05, Math.min(1, smoothing)) : 0.72,
    deadzone: Number.isFinite(deadzone) ? Math.max(0, deadzone) : 0.0015,
    maxStep: Number.isFinite(maxStep) ? Math.max(0.01, maxStep) : 0.18,
  };
}

function filteredDragPosition(previousPosition, rawPosition, response) {
  let rawDelta = vectorBetween(rawPosition, previousPosition);
  let rawDistance = vectorLength(rawDelta);
  let next = previousPosition.clone?.() || { ...previousPosition };
  let clamped = false;
  let settled = rawDistance <= response.deadzone;

  if (!settled) {
    let appliedDelta = {
      x: rawDelta.x * response.smoothing,
      y: rawDelta.y * response.smoothing,
      z: rawDelta.z * response.smoothing,
    };
    let appliedDistance = vectorLength(appliedDelta);
    if (appliedDistance > response.maxStep) {
      let scale = response.maxStep / appliedDistance;
      appliedDelta.x *= scale;
      appliedDelta.y *= scale;
      appliedDelta.z *= scale;
      clamped = true;
    }
    next.x = Number(previousPosition.x || 0) + appliedDelta.x;
    next.y = Number(previousPosition.y || 0) + appliedDelta.y;
    next.z = Number(previousPosition.z || 0) + appliedDelta.z;
  }

  return {
    position: next,
    diagnostics: {
      smoothing: response.smoothing,
      deadzone: response.deadzone,
      maxStep: response.maxStep,
      rawDelta,
      rawDistance,
      appliedDelta: vectorBetween(next, previousPosition),
      appliedDistance: distanceBetween(next, previousPosition),
      clamped,
      settled,
    },
  };
}

export function createXRThreeControllerRayAdapter(options = {}) {
  let THREE = options.THREE;
  let raycaster = options.raycaster || (THREE?.Raycaster ? new THREE.Raycaster() : null);
  let dragResponse = normalizeDragResponse(options.dragResponse || options);
  let dragPlane = THREE?.Plane ? new THREE.Plane() : null;
  let intersection = THREE?.Vector3 ? new THREE.Vector3() : null;
  let normal = THREE?.Vector3 ? new THREE.Vector3() : null;
  let cameraPosition = THREE?.Vector3 ? new THREE.Vector3() : null;
  let dragging = null;
  let counters = {
    hits: 0,
    misses: 0,
    dragStarts: 0,
    dragUpdates: 0,
    dragMisses: 0,
  };
  let diagnostics = {
    version: 'xr-three-controller-diagnostics-v1',
    raySource: null,
    lastHit: null,
    lastMissReason: null,
    drag: null,
  };

  function getHits(controller, meshes = []) {
    if (!THREE || !raycaster) return [];
    let ray = setRayFromController(THREE, raycaster, controller);
    diagnostics.raySource = ray.source || null;
    if (!ray.ok) {
      counters.misses += 1;
      diagnostics.lastMissReason = ray.reason || 'ray-unavailable';
      diagnostics.lastHit = null;
      return [];
    }
    // Recursive: panels carry an invisible oversized chrome hit surface for
    // the Horizon-style outside-window controls. Frame-visual planes are
    // filtered out; chrome hits are remapped onto their panel with an
    // out-of-window frame point.
    let hits = raycaster.intersectObjects(meshes, true)
      .filter((hit) => !hit.object?.userData?.snPanelFrameVisual && !hit.object?.userData?.snPanelHitReticle)
      .map((hit) => (hit.object?.userData?.snChromeSurface ? remapChromeSurfaceHit(hit) : hit))
      .filter(Boolean)
      .map((hit) => {
        let frameTarget = resolveHitFrameTarget(hit, options.panelFrameHitTest || {});
        if (frameTarget) {
          hit.frameTarget = frameTarget;
          hit.object.userData ||= {};
          hit.object.userData.lastFrameTarget = frameTarget;
        }
        return hit;
      });
    if (hits.length) {
      counters.hits += 1;
      diagnostics.lastMissReason = null;
      diagnostics.lastHit = {
        panelId: hits[0]?.object?.userData?.panelId || null,
        distance: Number(hits[0]?.distance || 0),
        point: vectorData(hits[0]?.point),
        frameTarget: hits[0]?.frameTarget || null,
      };
    } else {
      counters.misses += 1;
      diagnostics.lastMissReason = 'no-panel-hit';
      diagnostics.lastHit = null;
    }
    return hits;
  }

  function beginDrag(controller, meshOrHit, camera) {
    let hit = meshOrHit?.object ? meshOrHit : null;
    let mesh = hit?.object || meshOrHit;
    if (!THREE || !raycaster || !dragPlane || !intersection || !normal || !mesh) {
      return { ok: false, reason: 'missing-drag-dependency' };
    }
    let ray = setRayFromController(THREE, raycaster, controller);
    diagnostics.raySource = ray.source || null;
    if (!ray.ok) {
      counters.dragMisses += 1;
      diagnostics.lastMissReason = ray.reason || 'ray-unavailable';
      return ray;
    }
    camera?.getWorldPosition?.(cameraPosition);
    // The controller ray lives in world space, so the drag plane must anchor in
    // world space too; mesh.position is parent-local after root placement and
    // would misplace the plane. The plane sits at the grab point facing back
    // along the pointing ray: a camera-facing plane through the panel center
    // degenerates for close-range or grazing rays (nearly parallel, or behind
    // the ray origin), while the ray-facing grab plane keeps every subsequent
    // intersection well-conditioned and moves the panel across the view.
    let meshWorldPosition = meshWorldPositionOf(THREE, mesh);
    let grabPoint = hit?.point?.clone?.() || meshWorldPosition;
    normal.copy(raycaster.ray.direction);
    normal.x = -normal.x;
    normal.y = -normal.y;
    normal.z = -normal.z;
    normal.normalize();
    dragPlane.setFromNormalAndCoplanarPoint(normal, grabPoint);
    if (!raycaster.ray.intersectPlane(dragPlane, intersection)) {
      counters.dragMisses += 1;
      diagnostics.lastMissReason = 'ray-plane-miss';
      return { ok: false, reason: 'ray-plane-miss' };
    }
    // Horizon-style carry (opt-in dragModel 'controller-carry'): the window
    // rides the ray at the grab distance and rotates with the controller, so
    // the operator can place and angle it freely. Requires world-quaternion
    // support from the runtime; otherwise the ray-plane model stays in force.
    let carry = null;
    if (options.dragModel === 'controller-carry' &&
      typeof controller?.getWorldQuaternion === 'function' &&
      typeof THREE.Quaternion === 'function') {
      let controllerQuaternion = controller.getWorldQuaternion(new THREE.Quaternion());
      let panelWorldQuaternion = typeof mesh.getWorldQuaternion === 'function'
        ? mesh.getWorldQuaternion(new THREE.Quaternion())
        : mesh.quaternion?.clone?.();
      if (controllerQuaternion?.invert && panelWorldQuaternion) {
        carry = {
          grabDistance: grabPoint.distanceTo(raycaster.ray.origin),
          controllerQuaternionInverse: controllerQuaternion.clone().invert(),
          panelWorldQuaternion,
          grabOffset: meshWorldPosition.clone().sub(grabPoint),
        };
      }
    }
    dragging = {
      mesh,
      controller,
      carry,
      frameTarget: hit?.frameTarget || mesh.userData?.lastFrameTarget || null,
      plane: dragPlane.clone(),
      offset: meshWorldPosition.clone().sub(intersection),
      rotation: mesh.quaternion?.clone?.() || null,
      startIntersection: intersection.clone?.() || null,
      startPosition: mesh.position.clone?.() || null,
      startSize: readPanelSize(mesh),
      lastPosition: meshWorldPosition.clone?.() || null,
      lastRawPosition: intersection.clone?.() || meshWorldPosition.clone?.() || null,
    };
    counters.dragStarts += 1;
    diagnostics.lastMissReason = null;
    diagnostics.drag = {
      active: true,
      panelId: mesh.userData?.panelId || null,
      frameTarget: hit?.frameTarget || mesh.userData?.lastFrameTarget || null,
      model: 'controller-ray-plane',
      position: vectorData(mesh.position),
      rotation: vectorData(mesh.rotation),
      size: readPanelSize(mesh),
      planeNormal: vectorData(normal),
      planePoint: vectorData(grabPoint),
      intersection: vectorData(intersection),
      delta: { x: 0, y: 0, z: 0, distance: 0 },
      response: {
        smoothing: dragResponse.smoothing,
        deadzone: dragResponse.deadzone,
        maxStep: dragResponse.maxStep,
      },
    };
    return {
      ok: true,
      panelId: mesh.userData?.panelId || null,
      frameTarget: hit?.frameTarget || mesh.userData?.lastFrameTarget || null,
      dragModel: 'controller-ray-plane',
    };
  }

  function updateDrag(controller = dragging?.controller) {
    if (!dragging || !controller || !raycaster || !intersection) return { ok: false, reason: 'not-dragging' };
    let ray = setRayFromController(THREE, raycaster, controller);
    diagnostics.raySource = ray.source || null;
    if (!ray.ok) {
      counters.dragMisses += 1;
      diagnostics.lastMissReason = ray.reason || 'ray-unavailable';
      return ray;
    }
    let carryResize = Boolean(dragging.frameTarget?.operation === 'resize' || dragging.frameTarget?.handle);
    if (dragging.carry && !carryResize) {
      return updateCarryDrag(controller);
    }
    if (!raycaster.ray.intersectPlane(dragging.plane, intersection)) {
      counters.dragMisses += 1;
      diagnostics.lastMissReason = 'ray-plane-miss';
      return { ok: false, reason: 'ray-plane-miss' };
    }
    let previousPosition = meshWorldPositionOf(THREE, dragging.mesh) || dragging.lastPosition;
    let rawPosition = intersection.clone?.() || new THREE.Vector3(intersection.x, intersection.y, intersection.z);
    if (dragging.lastRawPosition && typeof THREE.Vector3.prototype.lerp === 'function') {
      let smoothed = new THREE.Vector3().copy(dragging.lastRawPosition).lerp(rawPosition, dragResponse.smoothing);
      rawPosition.copy(smoothed);
    }
    if (dragging.lastRawPosition && typeof dragging.lastRawPosition.copy === 'function') {
      dragging.lastRawPosition.copy(rawPosition);
    }
    let resize = resizePanelFromDrag(THREE, dragging, rawPosition, options.resize || options);
    let filtered = null;
    if (!resize) {
      rawPosition.add(dragging.offset);
      filtered = filteredDragPosition(previousPosition, rawPosition, dragResponse);
      dragging.mesh.position.copy(worldToPanelParentLocal(dragging.mesh, filtered.position));
    }
    if (dragging.rotation && dragging.mesh.quaternion?.copy) {
      dragging.mesh.quaternion.copy(dragging.rotation);
    }
    counters.dragUpdates += 1;
    diagnostics.lastMissReason = null;
    diagnostics.drag = {
      active: true,
      panelId: dragging.mesh.userData?.panelId || null,
      frameTarget: dragging.frameTarget || null,
      model: 'controller-ray-plane',
      position: vectorData(dragging.mesh.position),
      rotation: vectorData(dragging.mesh.rotation),
      size: readPanelSize(dragging.mesh),
      resize,
      planeNormal: vectorData(dragging.plane.normal),
      planePoint: vectorData(dragging.plane.point),
      intersection: vectorData(intersection),
      delta: (() => {
        let settledWorldPosition = meshWorldPositionOf(THREE, dragging.mesh) || dragging.mesh.position;
        return {
          x: Number(settledWorldPosition.x || 0) - Number(previousPosition?.x || 0),
          y: Number(settledWorldPosition.y || 0) - Number(previousPosition?.y || 0),
          z: Number(settledWorldPosition.z || 0) - Number(previousPosition?.z || 0),
          distance: distanceBetween(settledWorldPosition, previousPosition),
        };
      })(),
      rawPosition: vectorData(rawPosition),
      response: resize ? {
        operation: 'resize',
        handle: resize.handle,
        delta: resize.delta,
        size: resize.size,
      } : filtered.diagnostics,
    };
    dragging.lastPosition = meshWorldPositionOf(THREE, dragging.mesh) || dragging.lastPosition;
    dragging.lastRawPosition = rawPosition.clone?.() || null;
    return {
      ok: true,
      panelId: dragging.mesh.userData?.panelId || null,
      frameTarget: dragging.frameTarget || null,
      dragModel: 'controller-ray-plane',
    };
  }

  function updateCarryDrag(controller) {
    let carry = dragging.carry;
    let controllerQuaternion = controller.getWorldQuaternion(new THREE.Quaternion());
    let deltaQuaternion = controllerQuaternion.clone().multiply(carry.controllerQuaternionInverse);
    let carryPoint = raycaster.ray.origin.clone()
      .add(raycaster.ray.direction.clone().multiplyScalar(carry.grabDistance));
    let worldPosition = carryPoint.clone().add(carry.grabOffset.clone().applyQuaternion(deltaQuaternion));
    let previousPosition = meshWorldPositionOf(THREE, dragging.mesh) || dragging.lastPosition;
    let filtered = filteredDragPosition(previousPosition, worldPosition, dragResponse);
    dragging.mesh.position.copy(worldToPanelParentLocal(dragging.mesh, filtered.position));
    let worldQuaternion = deltaQuaternion.clone().multiply(carry.panelWorldQuaternion);
    let parentQuaternion = dragging.mesh.parent?.getWorldQuaternion?.(new THREE.Quaternion()) || null;
    if (dragging.mesh.quaternion?.copy) {
      dragging.mesh.quaternion.copy(
        parentQuaternion?.invert ? parentQuaternion.invert().multiply(worldQuaternion) : worldQuaternion,
      );
    }
    counters.dragUpdates += 1;
    diagnostics.lastMissReason = null;
    diagnostics.drag = {
      active: true,
      panelId: dragging.mesh.userData?.panelId || null,
      frameTarget: dragging.frameTarget || null,
      model: 'controller-carry',
      position: vectorData(dragging.mesh.position),
      rotation: vectorData(dragging.mesh.rotation),
      size: readPanelSize(dragging.mesh),
      planeNormal: vectorData(dragging.plane.normal),
      planePoint: vectorData(dragging.plane.point),
      intersection: vectorData(carryPoint),
      delta: (() => {
        let settledWorldPosition = meshWorldPositionOf(THREE, dragging.mesh) || dragging.mesh.position;
        return {
          x: Number(settledWorldPosition.x || 0) - Number(previousPosition?.x || 0),
          y: Number(settledWorldPosition.y || 0) - Number(previousPosition?.y || 0),
          z: Number(settledWorldPosition.z || 0) - Number(previousPosition?.z || 0),
          distance: distanceBetween(settledWorldPosition, previousPosition),
        };
      })(),
      rawPosition: vectorData(worldPosition),
      response: filtered.diagnostics,
    };
    dragging.lastPosition = meshWorldPositionOf(THREE, dragging.mesh) || dragging.lastPosition;
    dragging.lastRawPosition = worldPosition.clone?.() || null;
    return {
      ok: true,
      panelId: dragging.mesh.userData?.panelId || null,
      frameTarget: dragging.frameTarget || null,
      dragModel: 'controller-carry',
    };
  }

  function endDrag() {
    let panelId = dragging?.mesh?.userData?.panelId || null;
    let pose = diagnostics.drag
      ? {
        position: diagnostics.drag.position || null,
        rotation: diagnostics.drag.rotation || null,
        size: diagnostics.drag.size || null,
      }
      : null;
    dragging = null;
    if (diagnostics.drag) diagnostics.drag = { ...diagnostics.drag, active: false };
    return { ok: true, panelId, frameTarget: diagnostics.drag?.frameTarget || null, pose };
  }

  return {
    getHits,
    beginDrag,
    updateDrag,
    endDrag,
    getState() {
      return {
        dragging: Boolean(dragging),
        panelId: dragging?.mesh?.userData?.panelId || null,
        dragModel: 'controller-ray-plane',
        diagnostics: this.getDiagnostics(),
      };
    },
    getDiagnostics() {
      return {
        ...diagnostics,
        counters: { ...counters },
      };
    },
  };
}

export function createXRThreeWebXRAdapter(options = {}) {
  let THREE = options.THREE;
  let check = assertThree(THREE);
  let sceneAdapter = createXRThreePanelSceneAdapter(options);
  let rayAdapter = createXRThreeControllerRayAdapter(options);
  let state = {
    renderer: null,
    camera: null,
    scene: sceneAdapter.getScene(),
    panelCount: 0,
    session: null,
  };

  function createRenderer(rendererOptions = {}) {
    if (!check.ok) return { ok: false, reason: check.reason, missing: check.missing };
    let renderer;
    try {
      renderer = rendererOptions.renderer || new THREE.WebGLRenderer({
        antialias: true,
        alpha: true,
        ...(rendererOptions.webgl || {}),
      });
    } catch (error) {
      return {
        ok: false,
        reason: 'webgl-renderer-create-failed',
        error: error?.name || 'Error',
        message: error?.message || '',
      };
    }
    if (renderer.xr) renderer.xr.enabled = true;
    state.renderer = renderer;
    return { ok: true, renderer };
  }

  function createCamera(cameraOptions = {}) {
    if (!check.ok) return { ok: false, reason: check.reason, missing: check.missing };
    let camera = cameraOptions.camera || new THREE.PerspectiveCamera(
      Number(cameraOptions.fov || 70),
      Number(cameraOptions.aspect || 1),
      Number(cameraOptions.near || 0.01),
      Number(cameraOptions.far || 100),
    );
    applyVector(camera.position, cameraOptions.position || [0, 1.6, 2]);
    state.camera = camera;
    return { ok: true, camera };
  }

  function setScene(xrScene, setOptions = {}) {
    let result = sceneAdapter.setScene(xrScene, setOptions);
    state.scene = sceneAdapter.getScene();
    state.panelCount = result.panelCount || 0;
    return result;
  }

  async function setSession(session, sessionOptions = {}) {
    if (!state.renderer?.xr?.setSession) {
      return { ok: false, reason: 'missing-three-webxr-manager' };
    }
    if (sessionOptions.referenceSpaceType && hasFn(state.renderer.xr, 'setReferenceSpaceType')) {
      state.renderer.xr.setReferenceSpaceType(sessionOptions.referenceSpaceType);
    }
    await state.renderer.xr.setSession(session);
    state.session = session;
    let referenceSpace = state.renderer.xr.getReferenceSpace?.() || sessionOptions.referenceSpace || null;
    return { ok: true, session, referenceSpace };
  }

  return {
    ...XR_THREE_WEBXR_ADAPTER,
    THREE,
    createRenderer,
    createCamera,
    setScene,
    setSession,
    applyViewerPose: sceneAdapter.applyViewerPose,
    getSceneRoot: sceneAdapter.getRootObject,
    getPanelMesh: sceneAdapter.getPanelMesh,
    listPanelMeshes: sceneAdapter.listPanelMeshes,
    updatePanelTextureQuality: sceneAdapter.updatePanelTextureQuality,
    createControllerRayVisual(controller, visualOptions = {}) {
      let visual = buildControllerRayVisual(THREE, visualOptions);
      if (visual.ok && controller?.add) {
        controller.add(visual.object);
      }
      return visual;
    },
    createPanelHitReticleVisual(scene, visualOptions = {}) {
      let visual = buildPanelHitReticleVisual(THREE, visualOptions);
      if (visual.ok && scene?.add) {
        scene.add(visual.object);
      }
      return visual;
    },
    updatePanelHitReticleVisual,
    controllerRays: rayAdapter,
    getState() {
      let sceneState = sceneAdapter.getState();
      return {
        ...sceneState,
        renderer: Boolean(state.renderer),
        camera: Boolean(state.camera),
        scene: Boolean(state.scene),
        panelCount: state.panelCount || sceneState.panelCount,
        session: Boolean(state.session),
        controller: rayAdapter.getState(),
      };
    },
    getDiagnostics() {
      return {
        ...this.getState(),
        controller: rayAdapter.getDiagnostics(),
      };
    },
  };
}

function summarizeThreeRenderer(renderer = null) {
  let canvas = renderer?.domElement || null;
  let gl = renderer?.getContext?.() || null;
  let contextAttributes = gl?.getContextAttributes?.() || null;
  return {
    version: 'xr-three-renderer-diagnostics-v1',
    present: Boolean(renderer),
    xrEnabled: renderer?.xr?.enabled === true,
    outputColorSpace: renderer?.outputColorSpace || renderer?.outputEncoding || null,
    canvas: canvas ? {
      width: Number.isFinite(Number(canvas.width)) ? Number(canvas.width) : null,
      height: Number.isFinite(Number(canvas.height)) ? Number(canvas.height) : null,
      clientWidth: Number.isFinite(Number(canvas.clientWidth)) ? Number(canvas.clientWidth) : null,
      clientHeight: Number.isFinite(Number(canvas.clientHeight)) ? Number(canvas.clientHeight) : null,
    } : null,
    contextAttributes: contextAttributes ? {
      alpha: contextAttributes.alpha == null ? null : Boolean(contextAttributes.alpha),
      premultipliedAlpha: contextAttributes.premultipliedAlpha == null ? null : Boolean(contextAttributes.premultipliedAlpha),
      preserveDrawingBuffer: contextAttributes.preserveDrawingBuffer == null ? null : Boolean(contextAttributes.preserveDrawingBuffer),
      antialias: contextAttributes.antialias == null ? null : Boolean(contextAttributes.antialias),
      depth: contextAttributes.depth == null ? null : Boolean(contextAttributes.depth),
      stencil: contextAttributes.stencil == null ? null : Boolean(contextAttributes.stencil),
    } : null,
  };
}

export function createXRThreeRenderHost(options = {}) {
  let THREE = options.THREE;
  let adapter = options.adapter || createXRThreeWebXRAdapter(options);
  let renderer = options.renderer || null;
  let camera = options.camera || null;
  let scene = null;
  let diagnostics = {
    version: 'xr-three-render-host-v1',
    renderer: false,
    camera: false,
    scene: false,
    decorated: false,
    loopRunning: false,
    frames: 0,
    width: 0,
    height: 0,
    aspect: 1,
    pixelRatio: 1,
    lastError: null,
  };

  function decorateScene(targetScene, decorateOptions = {}) {
    if (!targetScene || targetScene.userData?.snSpatialDecorated) return false;
    targetScene.userData ||= {};
    targetScene.userData.snSpatialDecorated = true;
    if (THREE?.Color) {
      if (decorateOptions.mode === 'immersive-ar') {
        targetScene.background = null;
      } else {
        targetScene.background = new THREE.Color(decorateOptions.background ?? 0x11151d);
      }
    }
    if (THREE?.HemisphereLight && hasFn(targetScene, 'add')) {
      targetScene.add(new THREE.HemisphereLight(
        decorateOptions.skyColor ?? 0xffffff,
        decorateOptions.groundColor ?? 0x182030,
        Number(decorateOptions.intensity ?? 1.2),
      ));
    }
    diagnostics.decorated = true;
    return true;
  }

  function ensureRenderer(hostOptions = {}) {
    if (renderer) return { ok: true, renderer };
    let result = adapter.createRenderer({
      webgl: {
        antialias: true,
        alpha: true,
        ...(hostOptions.webgl || options.webgl || {}),
      },
      renderer: hostOptions.renderer,
    });
    if (!result.ok) {
      diagnostics.lastError = result.reason || 'renderer-create-failed';
      return result;
    }
    renderer = result.renderer;
    diagnostics.renderer = true;
    let className = hostOptions.className || options.className || null;
    if (className && renderer.domElement) renderer.domElement.className = className;
    let parent = hostOptions.hostElement || options.hostElement;
    if (parent && renderer.domElement && renderer.domElement.parentNode !== parent) {
      parent.append?.(renderer.domElement);
    }
    return { ok: true, renderer };
  }

  function ensureCamera(hostOptions = {}, bounds = {}) {
    let aspect = Math.max(0.1, Number(bounds.width || 1280) / Math.max(1, Number(bounds.height || 720)));
    if (!camera) {
      let result = adapter.createCamera({
        aspect,
        position: hostOptions.cameraPosition || options.cameraPosition || [0, 1.6, 2],
        ...(hostOptions.camera || options.camera || {}),
      });
      if (!result.ok) {
        diagnostics.lastError = result.reason || 'camera-create-failed';
        return result;
      }
      camera = result.camera;
    } else {
      camera.aspect = aspect;
      camera.updateProjectionMatrix?.();
    }
    diagnostics.camera = true;
    diagnostics.aspect = aspect;
    return { ok: true, camera };
  }

  function ensureTarget(hostOptions = {}) {
    let rendererResult = ensureRenderer(hostOptions);
    if (!rendererResult.ok) return rendererResult;

    let bounds = readBounds(hostOptions.bounds || hostOptions.stageElement || options.stageElement, hostOptions.fallbackBounds);
    let pixelRatio = clampPixelRatio(hostOptions.pixelRatio ?? options.pixelRatio ?? options.globalThis?.devicePixelRatio ?? 1, hostOptions.maxPixelRatio ?? options.maxPixelRatio);
    rendererResult.renderer.setPixelRatio?.(pixelRatio);
    rendererResult.renderer.setSize?.(bounds.width, bounds.height, false);

    let cameraResult = ensureCamera(hostOptions, bounds);
    if (!cameraResult.ok) return cameraResult;

    let sceneResult = adapter.setScene(hostOptions.scene || options.scene || null, hostOptions.sceneOptions || {});
    if (!sceneResult.ok) {
      diagnostics.lastError = sceneResult.reason || 'scene-create-failed';
      return sceneResult;
    }
    scene = sceneResult.scene;
    decorateScene(scene, {
      mode: hostOptions.mode || options.mode || null,
      ...(hostOptions.decoration || options.decoration || {})
    });
    diagnostics = {
      ...diagnostics,
      renderer: true,
      camera: true,
      scene: Boolean(scene),
      width: bounds.width,
      height: bounds.height,
      aspect: Math.max(0.1, bounds.width / Math.max(1, bounds.height)),
      pixelRatio,
      lastError: null,
    };
    return {
      ok: true,
      renderer: rendererResult.renderer,
      camera: cameraResult.camera,
      scene,
      width: bounds.width,
      height: bounds.height,
      pixelRatio,
    };
  }

  function getDiagnostics() {
    return {
      ...diagnostics,
      rendererDiagnostics: summarizeThreeRenderer(renderer),
    };
  }

  function startLoop(loopOptions = {}) {
    let target = loopOptions.target || {
      ok: Boolean(renderer && camera && scene),
      renderer,
      camera,
      scene,
    };
    if (!target.ok || !target.renderer?.setAnimationLoop) {
      diagnostics.lastError = target.reason || 'missing-three-animation-loop';
      return { ok: false, reason: diagnostics.lastError };
    }
    target.renderer.setAnimationLoop((time, frame) => {
      loopOptions.onFrame?.({
        time,
        frame,
        target,
        renderer: target.renderer,
        scene: target.scene,
        camera: target.camera,
      });
      if (loopOptions.renderFrame !== false) {
        target.renderer.render?.(target.scene, target.camera);
      }
      diagnostics.frames += 1;
    });
    diagnostics.loopRunning = true;
    diagnostics.lastError = null;
    return {
      ok: true,
      version: 'xr-three-render-loop-v1',
      renderFrame: loopOptions.renderFrame !== false,
    };
  }

  function stopLoop(loopOptions = {}) {
    let targetRenderer = loopOptions.renderer || renderer;
    if (!targetRenderer?.setAnimationLoop) {
      diagnostics.lastError = 'missing-three-animation-loop';
      return { ok: false, reason: diagnostics.lastError };
    }
    targetRenderer.setAnimationLoop(null);
    diagnostics.loopRunning = false;
    return { ok: true, version: 'xr-three-render-loop-v1' };
  }

  return {
    ensureTarget,
    resize: ensureTarget,
    startLoop,
    stopLoop,
    getDiagnostics,
    getState: getDiagnostics,
  };
}

function summarizeXRRenderState(session = null) {
  let renderState = session?.renderState || null;
  let baseLayer = renderState?.baseLayer || null;
  let layers = Array.isArray(renderState?.layers) ? renderState.layers : [];
  return {
    version: 'xr-render-state-diagnostics-v1',
    baseLayer: baseLayer ? {
      present: true,
      framebufferWidth: Number.isFinite(Number(baseLayer.framebufferWidth)) ? Number(baseLayer.framebufferWidth) : null,
      framebufferHeight: Number.isFinite(Number(baseLayer.framebufferHeight)) ? Number(baseLayer.framebufferHeight) : null,
      fixedFoveation: Number.isFinite(Number(baseLayer.fixedFoveation)) ? Number(baseLayer.fixedFoveation) : null,
    } : { present: false },
    layers: {
      count: layers.length,
      present: layers.length > 0,
    },
    depthNear: Number.isFinite(Number(renderState?.depthNear)) ? Number(renderState.depthNear) : null,
    depthFar: Number.isFinite(Number(renderState?.depthFar)) ? Number(renderState.depthFar) : null,
    inlineVerticalFieldOfView: Number.isFinite(Number(renderState?.inlineVerticalFieldOfView)) ? Number(renderState.inlineVerticalFieldOfView) : null,
  };
}

function summarizeXRFrameViewports(frame = null, referenceSpace = null, session = null, options = {}) {
  let baseLayer = session?.renderState?.baseLayer || null;
  let viewerPoseProvided = Object.hasOwn(options, 'viewerPose');
  let pose = viewerPoseProvided ? options.viewerPose : null;
  if (!baseLayer) {
    return {
      version: 'xr-frame-viewport-diagnostics-v1',
      viewCount: 0,
      views: [],
      reason: 'xr-base-layer-missing',
    };
  }
  if (!viewerPoseProvided && !pose && frame?.getViewerPose && referenceSpace) {
    pose = frame.getViewerPose(referenceSpace);
  }
  let views = Array.isArray(pose?.views) ? pose.views : [];
  return {
    version: 'xr-frame-viewport-diagnostics-v1',
    viewCount: views.length,
    views: views.slice(0, 4).map((view) => {
      let viewport = null;
      try {
        viewport = baseLayer?.getViewport?.(view) || null;
      } catch {
        viewport = null;
      }
      return {
        eye: view.eye || null,
        viewport: viewport ? {
          x: Number.isFinite(Number(viewport.x)) ? Number(viewport.x) : null,
          y: Number.isFinite(Number(viewport.y)) ? Number(viewport.y) : null,
          width: Number.isFinite(Number(viewport.width)) ? Number(viewport.width) : null,
          height: Number.isFinite(Number(viewport.height)) ? Number(viewport.height) : null,
        } : null,
        projectionMatrix: Boolean(view.projectionMatrix),
        transform: Boolean(view.transform),
      };
    }),
  };
}

function parsePanelTransitionsOption(value) {
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('panelTransitions must be an object with a positive finite durationMs.');
  }
  if (typeof value.durationMs !== 'number' || !Number.isFinite(value.durationMs) || value.durationMs <= 0) {
    throw new TypeError('panelTransitions.durationMs must be a positive finite number.');
  }
  return { durationMs: value.durationMs };
}

export function createXRThreeSessionController(options = {}) {
  let target = options.globalThis || globalThis;
  let adapter = options.adapter || createXRThreeWebXRAdapter(options);
  let THREE = options.THREE || adapter.THREE;
  let activeSession = null;
  let activeTarget = null;
  let controllers = [];
  let selectStartListeners = [];
  let selectEndListeners = [];
  let activeReferenceSpace = null;
  let referenceSpaceResetEpoch = 0;
  let activeViewerPose = null;
  let activeCaptureConfig = null;
  let activeRootMatrix = null;
  let activeRootObject = null;
  let activeFrameRecord = null;
  let activeGrabState = { active: false, sourceId: null, objectId: null };
  let activeInteractionHandler = null;
  let interactionStarts = new Map();
  let interactionSequence = 0;

  let frameInteractionStarts = new Map();
  let timingTracker = null;
  let panelStore = null;
  let receiptsList = [];
  let restoreChips = new Map();
  let panelTransitions = null;
  let transitionTweens = new Map();
  let restoreChipOrder = [];
  let lastRecordedResetEpoch = 0;
  let instanceFinalSessionSnapshot = null;
  let controllerInstance = null;
  let endEventObserved = false;
  let pendingTeardownReason = null;

  const RESTORE_CHIP_SIZE = [0.12, 0.05];
  const RESTORE_CHIP_STACK_OFFSET = 0.06;
  const PANEL_TRANSITION_HIDDEN_SCALE = 0.92;

  function cancelTransitionTween(key) {
    let entry = transitionTweens.get(key);
    if (!entry) return;
    transitionTweens.delete(key);
    entry.tween.cancel();
  }

  function startTransitionTween(key, object, kind, phase, tweenOptions) {
    cancelTransitionTween(key);
    let tween = createXRScaleFadeTween({
      object,
      durationMs: panelTransitions.durationMs,
      from: tweenOptions.from,
      to: tweenOptions.to,
      onDone: () => {
        transitionTweens.delete(key);
        tweenOptions.onDone?.();
      },
    });
    transitionTweens.set(key, { tween, object, kind, phase });
  }

  function tickTransitionTweens(time) {
    for (let entry of [...transitionTweens.values()]) {
      entry.tween.tick(time);
    }
  }

  function buildRestoreChip(panelId) {
    if (typeof THREE?.PlaneGeometry !== 'function' ||
        typeof THREE?.MeshBasicMaterial !== 'function' ||
        typeof THREE?.Mesh !== 'function') {
      return null;
    }
    // Chips parent to the scene root, never the panel mesh: Three propagates
    // visible=false to children, which would hide the chip with the panel.
    let parent = adapter.getSceneRoot?.() || adapter.getScene?.() || null;
    if (!parent) return null;
    let material = new THREE.MeshBasicMaterial({
      transparent: true,
      depthTest: false,
      side: THREE.DoubleSide,
    });
    let texture = createMetaWindowChromeTexture(THREE, 'control-bar', {
      title: 'Restore',
      actions: [],
      background: panelChromeCssColor(XR_CHROME_ON_SURFACE_COLOR, '#fafafa'),
      foreground: panelChromeCssColor(XR_PANEL_SURFACE_COLOR, '#272727'),
    });
    if (texture) material.map = texture;
    let chip = new THREE.Mesh(
      new THREE.PlaneGeometry(RESTORE_CHIP_SIZE[0], RESTORE_CHIP_SIZE[1]),
      material,
    );
    chip.name = `sn-xr-panel-restore-chip-${panelId}`;
    chip.userData ||= {};
    chip.userData.snPanelRestoreChip = true;
    chip.userData.panelId = panelId;
    // The restore zone spans the full UV so hitTestXRPanelFrame resolves it
    // from the actions loop before touching the absent move/resize/content
    // zones (it reads those unguarded).
    chip.userData.panelFrame = {
      version: 'xr-panel-frame-v1',
      panelId,
      zones: { actions: { restore: { x: 0, y: 0, width: 1, height: 1 } } },
      state: {},
    };
    parent.add?.(chip);
    return chip;
  }

  function disposeRestoreChip(panelId) {
    let chip = restoreChips.get(panelId);
    if (!chip) return;
    restoreChips.delete(panelId);
    restoreChipOrder = restoreChipOrder.filter((id) => id !== panelId);
    chip.parent?.remove?.(chip);
    chip.geometry?.dispose?.();
    chip.material?.map?.dispose?.();
    chip.material?.dispose?.();
  }

  function syncRestoreChip(storePanel) {
    let chip = restoreChips.get(storePanel.id) || null;
    if (storePanel.hidden === true) {
      if (!chip) {
        chip = buildRestoreChip(storePanel.id);
        if (!chip) return;
        restoreChips.set(storePanel.id, chip);
        restoreChipOrder.push(storePanel.id);
        if (panelTransitions) {
          startTransitionTween(`chip:${storePanel.id}`, chip, 'chip', 'fade-in', {
            from: { opacity: 0 },
            to: { opacity: 1 },
          });
        }
      } else if (panelTransitions && transitionTweens.get(`chip:${storePanel.id}`)?.phase === 'fade-out') {
        startTransitionTween(`chip:${storePanel.id}`, chip, 'chip', 'fade-in', {
          from: { opacity: chip.material.opacity },
          to: { opacity: 1 },
        });
      }
      // Root-parented, so the chip rides root re-placement in the same local
      // space the panel mesh occupied; hidden panels stack with a small
      // vertical offset so simultaneous chips do not overlap.
      let stackIndex = Math.max(0, restoreChipOrder.indexOf(storePanel.id));
      chip.position.set(
        storePanel.current.position[0],
        storePanel.current.position[1] + stackIndex * RESTORE_CHIP_STACK_OFFSET,
        storePanel.current.position[2],
      );
      chip.quaternion.set(
        storePanel.current.quaternion[0],
        storePanel.current.quaternion[1],
        storePanel.current.quaternion[2],
        storePanel.current.quaternion[3],
      );
    } else if (chip) {
      if (panelTransitions) {
        let key = `chip:${storePanel.id}`;
        if (transitionTweens.get(key)?.phase !== 'fade-out') {
          startTransitionTween(key, chip, 'chip', 'fade-out', {
            from: { opacity: chip.material.opacity },
            to: { opacity: 0 },
            onDone: () => disposeRestoreChip(storePanel.id),
          });
        }
      } else {
        disposeRestoreChip(storePanel.id);
      }
    }
  }

  function listInteractionMeshes() {
    // Three's raycaster ignores `visible`, so store-hidden panels must be
    // excluded from hit candidates explicitly; restore chips are scene-level
    // and must be included instead. A chip in its fade-out tween is excluded:
    // its panel is already restored, so hits on it could only form duplicate
    // restore receipts in the fade window.
    let meshes = typeof adapter.listPanelMeshes === 'function' ? adapter.listPanelMeshes() : [];
    return [
      ...meshes.filter((mesh) => mesh.visible !== false),
      ...[...restoreChips.values()].filter((chip) =>
        transitionTweens.get(`chip:${chip.userData?.panelId}`)?.phase !== 'fade-out'),
    ];
  }

  function syncPanelVisibilityWithTransition(mesh, storePanel, prevHidden) {
    let panelId = storePanel.id;
    let entry = transitionTweens.get(panelId) || null;
    if (storePanel.hidden === true) {
      // A hide tween keeps the mesh ray-visible while it runs; its final tick
      // hides the mesh and restores an exact unit scale.
      if (entry?.phase === 'hide') {
        entry.tween.reapply();
        return;
      }
      if (prevHidden === false || entry?.phase === 'show') {
        startTransitionTween(panelId, mesh, 'panel', 'hide', {
          from: { scale: 1 },
          to: { scale: PANEL_TRANSITION_HIDDEN_SCALE },
          onDone: () => {
            mesh.visible = false;
            mesh.scale?.set?.(1, 1, 1);
          },
        });
        return;
      }
      mesh.visible = false;
      return;
    }
    if (mesh.userData.strictTextureHidden === true) return;
    mesh.visible = true;
    if (entry?.phase === 'show') {
      entry.tween.reapply();
      return;
    }
    if (prevHidden === true || entry?.phase === 'hide') {
      startTransitionTween(panelId, mesh, 'panel', 'show', {
        from: { scale: PANEL_TRANSITION_HIDDEN_SCALE },
        to: { scale: 1 },
      });
    }
  }

  function syncMeshWithStore(mesh, storePanel) {
    if (!mesh || !storePanel) return;
    let prevHidden = mesh.userData?.panel?.hidden === true;
    mesh.position.set(storePanel.current.position[0], storePanel.current.position[1], storePanel.current.position[2]);
    mesh.quaternion.set(storePanel.current.quaternion[0], storePanel.current.quaternion[1], storePanel.current.quaternion[2], storePanel.current.quaternion[3]);
    mesh.userData.xrSize = [...storePanel.current.size];
    mesh.userData.panel = {
      portable: storePanel.portable,
      pinned: storePanel.pinned,
      focused: storePanel.focused,
      hidden: storePanel.hidden === true,
      closable: mesh.userData.panel?.closable,
      revision: storePanel.revision,
      sourceMetadata: structuredClone(storePanel.sourceMetadata),
      size: [...storePanel.current.size],
    };
    // Strict-texture diagnostic hiding owns mesh.visible independently of the
    // store; only the store's hidden flag may change it here.
    if (!panelTransitions) {
      if (storePanel.hidden === true) {
        mesh.visible = false;
      } else if (mesh.userData.strictTextureHidden !== true) {
        mesh.visible = true;
      }
    }
    applyPanelSize(mesh, storePanel.current.size, THREE || mesh.userData.THREE);
    // applyPanelSize rewrites mesh.scale to unit on every sync, so eased
    // visibility runs after it and re-asserts in-flight tween values.
    if (panelTransitions) {
      syncPanelVisibilityWithTransition(mesh, storePanel, prevHidden);
    }
    mesh.userData.updatePanelFrameVisuals?.();
    syncRestoreChip(storePanel);
  }

  function syncAllMeshesWithStore() {
    if (!panelStore) return;
    let state = panelStore.serialize();
    for (let storePanel of state.panels) {
      let mesh = adapter.getPanelMesh(storePanel.id);
      if (mesh) {
        syncMeshWithStore(mesh, storePanel);
      }
    }
  }
  const onSessionEnd = () => {
    endEventObserved = true;
    cleanupSession();
  };

  const onReferenceSpaceReset = () => {
    referenceSpaceResetEpoch += 1;
    diagnostics.lastObservation = null;
    activeGrabState = { active: false, sourceId: null, objectId: null };
    interactionStarts.clear();
    frameInteractionStarts.clear();
    activeFrameRecord = null;
    options.onSpatialReset?.({ resetEpoch: referenceSpaceResetEpoch });
  };

  let hitReticle = null;
  let lastHoverPanelId = null;
  let lastHoverState = {
    panelId: null,
    point: null,
    uv: null,
  };
  const HOVER_SMOOTHING = 0.35;
  let originalBackground = null;
  let diagnostics = {
    version: 'xr-three-session-controller-v1',
    status: 'idle',
    mode: null,
    lastError: null,
    controllers: 0,
    controllerRayVisuals: 0,
    hitReticleVisuals: 0,
    selectedPanelId: null,
    draggingPanelId: null,
    hover: null,
    interactionEvents: 0,
    frames: 0,
    visibilityState: null,
    environmentBlendMode: null,
    interactionMode: null,
    enabledFeatures: [],
    inputSources: [],
    primaryInputSource: null,
    requestedReferenceSpaceType: null,
    requestedOptionalFeatures: [],
    requestedRequiredFeatures: [],
    requestedDomOverlay: false,
    renderState: null,
    viewports: null,
    viewerPoseCaptured: false,
    viewerPoseCaptureReason: null,
    viewerPoseRootTransform: null,
    frameErrors: 0,
    lastFrameStage: null,
    lastEvent: null,
    sessionId: null,
    targetHash: null,
    buildHash: null,
    lastObservation: null,
  };

  function emit(event, details = {}) {
    diagnostics.lastEvent = event;
    options.onDiagnostic?.(event, {
      ...details,
      session: getDiagnostics(),
      adapter: adapter.getDiagnostics?.() || adapter.getState?.() || null,
    });
  }

  function sessionOptionsFor(mode, startOptions = {}) {
    return createXRThreeSessionOptions(mode, startOptions);
  }

  function matrixData(value) {
    try {
      let source = value?.elements || value;
      if (typeof value?.toArray === 'function') source = value.toArray();
      if (!Array.isArray(source) && !ArrayBuffer.isView(source)) return null;
      let matrix = Array.from(source, Number);
      return isFiniteMatrix4(matrix) ? matrix : null;
    } catch {
      return null;
    }
  }

  function sourceIdFor(inputSource, index) {
    try {
      let resolved = inputSource?.id || activeCaptureConfig?.resolveInputSourceId?.(inputSource, index) || null;
      return typeof resolved === 'string' && resolved.trim() ? resolved : null;
    } catch {
      return null;
    }
  }

  function inputKind(inputSource) {
    if (inputSource?.hand) return 'hand';
    if (inputSource?.targetRayMode === 'gaze') return 'gaze';
    if (inputSource?.targetRayMode === 'screen') return 'screen';
    return 'controller';
  }

  function resolveCaptureConfig(config) {
    if (!config?.spatialTarget) return { ok: false, reason: 'spatial-target-required' };
    let targetValidation = validateTarget(config.spatialTarget);
    let provenance = config.provenance;
    let rootPolicy = config.rootPolicy;
    let requiredStrings = [
      config.sessionId,
      config.referenceSpaceId,
      provenance?.runtimeId,
      provenance?.runtimeVersion,
      provenance?.appId,
      provenance?.buildHash,
      provenance?.deviceId,
      rootPolicy?.id,
      rootPolicy?.commitId,
    ];
    let provenanceValid = (
      ['headset', 'desktop', 'emulator'].includes(provenance?.deviceKind) &&
      ['native', 'iwer', 'none'].includes(provenance?.emulation)
    );
    if (
      !targetValidation.valid ||
      requiredStrings.some((value) => typeof value !== 'string' || !value.trim()) ||
      !provenanceValid ||
      rootPolicy?.mode !== 'world-locked' ||
      !Array.isArray(config.spatialObjects)
    ) {
      return { ok: false, reason: 'invalid-spatial-evidence-config' };
    }
    let objectIds = config.spatialObjects.map((entry) => entry?.id).sort();
    let targetObjectIds = config.spatialTarget.objects.map((entry) => entry.id).sort();
    if (
      objectIds.some((id) => typeof id !== 'string' || !id.trim()) ||
      new Set(objectIds).size !== objectIds.length ||
      objectIds.length !== targetObjectIds.length ||
      objectIds.some((id, index) => id !== targetObjectIds[index])
    ) {
      return { ok: false, reason: 'invalid-spatial-object-sources' };
    }
    return {
      ok: true,
      value: {
        target: config.spatialTarget,
        provenance,
        sessionId: config.sessionId,
        referenceSpaceId: config.referenceSpaceId,
        rootPolicy,
        spatialObjects: config.spatialObjects,
        resolveInputSourceId: config.resolveInputSourceId,
        resolvePanelInteraction: config.resolvePanelInteraction,
      },
    };
  }

  function commitSpatialRoot(config) {
    if (!config) return null;
    let rootObj = config.rootPolicy.object || adapter.getSceneRoot?.() || null;
    try {
      rootObj?.updateMatrixWorld?.(true);
    } catch {
      return null;
    }
    let worldMatrix;
    try {
      worldMatrix = matrixData(config.rootPolicy.matrix || rootObj?.matrixWorld);
    } catch {
      return null;
    }
    let pose = worldMatrix ? poseFromMatrix(worldMatrix) : null;
    return pose ? makeTransform(pose.position, pose.quaternion) : null;
  }

  function commitSpatialEvidence(config) {
    if (!activeSession) return { ok: false, reason: 'session-not-active' };
    let resolved = resolveCaptureConfig(config);
    if (!resolved.ok) return resolved;
    if (activeCaptureConfig && activeCaptureConfig.sessionId !== resolved.value.sessionId) {
      return { ok: false, reason: 'session-id-recommit-mismatch' };
    }
    let rootMatrix = commitSpatialRoot(resolved.value);
    if (!rootMatrix) return { ok: false, reason: 'world-locked-root-unavailable' };
    activeRootObject = resolved.value.rootPolicy.object || adapter.getSceneRoot?.() || null;
    if (activeRootObject) {
      activeRootObject.visible = true;
    }
    activeCaptureConfig = {
      ...resolved.value,
      target: freezeSpatialValue(resolved.value.target),
      provenance: freezeSpatialValue(resolved.value.provenance),
      rootPolicy: freezeSpatialValue({
        mode: resolved.value.rootPolicy.mode,
        id: resolved.value.rootPolicy.id,
        commitId: resolved.value.rootPolicy.commitId,
      }),
    };
    activeRootMatrix = freezeSpatialValue(rootMatrix);
    referenceSpaceResetEpoch += 1;
    activeInteractionHandler = config.onInteraction || options.onInteraction || null;
    activeGrabState = { active: false, sourceId: null, objectId: null };
    interactionStarts.clear();
    activeFrameRecord = null;
    diagnostics.sessionId = activeCaptureConfig.sessionId;
    diagnostics.targetHash = activeCaptureConfig.target.contentHash;
    diagnostics.buildHash = activeCaptureConfig.provenance.buildHash;
    diagnostics.lastObservation = null;
    let committed = freezeSpatialValue({
      version: XR_SPATIAL_VERSIONS.rootCommit,
      sessionId: activeCaptureConfig.sessionId,
      rootId: activeCaptureConfig.rootPolicy.id,
      rootCommitId: activeCaptureConfig.rootPolicy.commitId,
      targetHash: activeCaptureConfig.target.contentHash,
      resetEpoch: referenceSpaceResetEpoch,
      matrix: activeRootMatrix,
    });
    options.onSpatialCommit?.(committed);
    return { ok: true, committed };
  }

  function resolveInteractionHit(hit) {
    let panelId = hit?.object?.userData?.panelId || null;
    let uv = hit?.uv && Number.isFinite(hit.uv.x) && Number.isFinite(hit.uv.y)
      ? { x: hit.uv.x, y: 1 - hit.uv.y }
      : null;
    if (!panelId || !uv || !activeCaptureConfig || !activeFrameRecord?.id) return null;
    let descriptor = null;
    try {
      descriptor = activeCaptureConfig.resolvePanelInteraction?.(panelId, hit.object) ||
        hit.object?.userData?.xrPanelInteraction || null;
    } catch {
      descriptor = null;
    }
    if (!descriptor?.hitMap) return null;
    let resolved = resolveXRHitMap(uv, descriptor.hitMap, {
      panelId,
      contentHash: descriptor.contentHash,
      revision: descriptor.revision,
      sessionId: activeCaptureConfig.sessionId,
      frame: activeFrameRecord,
      maximumFrameAge: descriptor.maximumFrameAge,
      maximumAgeMs: descriptor.maximumAgeMs,
      pointSpace: 'normalized',
    });
    if (!resolved.ok) return null;
    return { panelId, uv, descriptor, resolved };
  }

  function emitInteractionReceipt(phase, inputSource, hit) {
    if (!activeCaptureConfig || !activeFrameRecord?.id || !['selectstart', 'selectend'].includes(phase)) return null;
    let sources = activeSession?.inputSources ? Array.from(activeSession.inputSources) : [];
    let index = sources.indexOf(inputSource);
    let inputSourceId = sourceIdFor(inputSource, index);
    let interaction = resolveInteractionHit(hit);
    if (!inputSourceId || !interaction) return null;
    let target = interaction.resolved.target;
    let contentHash = interaction.descriptor.contentHash;
    let revision = interaction.descriptor.revision;
    let start = interactionStarts.get(inputSourceId) || null;
    if (phase === 'selectend') {
      interactionStarts.delete(inputSourceId);
      if (
        !start ||
        start.sessionId !== activeCaptureConfig.sessionId ||
        start.inputSourceId !== inputSourceId ||
        start.panelId !== interaction.panelId ||
        start.targetId !== target.id ||
        start.contentHash !== contentHash ||
        start.revision !== revision
      ) return null;
    }
    interactionSequence += 1;
    let receipt = freezeSpatialValue({
      version: XR_SPATIAL_VERSIONS.interactionPhase,
      eventId: `${activeCaptureConfig.sessionId}:${activeFrameRecord.id}:${inputSourceId}:${interactionSequence}`,
      phase,
      sessionId: activeCaptureConfig.sessionId,
      frameId: activeFrameRecord.id,
      frameSequence: activeFrameRecord.sequence,
      timestamp: activeFrameRecord.time,
      inputSourceId,
      inputKind: inputKind(inputSource),
      handedness: ['left', 'right'].includes(inputSource?.handedness) ? inputSource.handedness : 'none',
      profiles: normalizeStringList(inputSource?.profiles),
      uv: interaction.uv,
      contentPoint: interaction.resolved.contentPoint,
      panelId: interaction.panelId,
      targetId: target.id,
      action: target.action,
      contentHash,
      revision,
      startEventId: phase === 'selectend' ? start.eventId : null,
      spatialTargetHash: activeCaptureConfig.target.contentHash,
      rootCommitId: activeCaptureConfig.rootPolicy.commitId,
    });
    if (phase === 'selectstart') interactionStarts.set(inputSourceId, receipt);
    activeInteractionHandler?.(receipt);
    return receipt;
  }

  function setupControllers(scene, renderer, camera, startOptions = {}) {
    if (!scene || !renderer?.xr?.getController || controllers.length) return;
    for (let index = 0; index < 2; index += 1) {
      let controller = renderer.xr.getController(index);

      let selectStartListener = (event) => {
        let inputSource = event?.data;
        if (!inputSource) {
          let sources = activeSession?.inputSources ? Array.from(activeSession.inputSources) : [];
          inputSource = sources[index] || controller.inputSource;
        }
        if (!inputSource) {
          return;
        }
        let sources = activeSession?.inputSources ? Array.from(activeSession.inputSources) : [];
        let srcIndex = sources.indexOf(inputSource);
        let inputSourceId = sourceIdFor(inputSource, srcIndex);

        let hit = adapter.controllerRays.getHits(
          controller,
          listInteractionMeshes(),
        )[0];
        if (hit) {
          // While a close tween runs the mesh stays ray-visible; reject
          // gestures whose store panel is already hidden before any receipt
          // can form. Restore chips are exempt: they exist to un-hide.
          if (panelTransitions && panelStore && hit.object?.userData?.snPanelRestoreChip !== true) {
            let hitPanelId = hit.object?.userData?.panelId || null;
            let hitStorePanel = hitPanelId
              ? panelStore.serialize().panels.find((panel) => panel.id === hitPanelId)
              : null;
            if (hitStorePanel?.hidden === true) {
              return;
            }
          }
          diagnostics.selectedPanelId = hit.object?.userData?.panelId || null;
          diagnostics.interactionEvents += 1;

          let uv = hit.uv ? { x: hit.uv.x, y: hit.uv.y } : null;
          let receipt = emitInteractionReceipt('selectstart', inputSource, hit);

          let panelId = hit.object?.userData?.panelId;
          let panelObj = hit.object?.userData?.panel || {};
          let isPortable = panelObj.portable !== false;
          let isPinned = panelObj.pinned === true;

          if (inputSourceId && hit.frameTarget && activeFrameRecord && activeCaptureConfig) {
            frameInteractionStarts.set(inputSourceId, {
              sessionId: activeCaptureConfig.sessionId,
              startFrameId: activeFrameRecord.id,
              panelId,
              frameTarget: hit.frameTarget,
              inputSource,
            });
          }

          if (isXRFrameDragTarget(hit.frameTarget)) {
            if (isPortable && !isPinned) {
              let drag = adapter.controllerRays.beginDrag(controller, hit, camera);
              if (drag?.ok !== false) {
                diagnostics.draggingPanelId = diagnostics.selectedPanelId;
                activeGrabState = {
                  active: true,
                  sourceId: inputSourceId,
                  objectId: diagnostics.draggingPanelId,
                };
                emit('spatial-three-drag-start', {
                  panelId: diagnostics.draggingPanelId,
                  frameTarget: hit.frameTarget || null,
                  uv,
                  receipt,
                });
                return;
              }
            }
          }
          emit('spatial-three-select', {
            panelId: diagnostics.selectedPanelId,
            frameTarget: hit.frameTarget || null,
            uv,
            receipt,
          });
        }
      };

      let selectEndListener = (event) => {
        let inputSource = event?.data;
        if (!inputSource) {
          let sources = activeSession?.inputSources ? Array.from(activeSession.inputSources) : [];
          inputSource = sources[index] || controller.inputSource;
        }
        if (!inputSource) {
          return;
        }
        let sources = activeSession?.inputSources ? Array.from(activeSession.inputSources) : [];
        let srcIndex = sources.indexOf(inputSource);
        let inputSourceId = sourceIdFor(inputSource, srcIndex);

        let wasDragging = adapter.controllerRays.getState?.().dragging === true;
        let draggingPanelId = adapter.controllerRays.getState?.().panelId;
        let draggingMesh = draggingPanelId ? adapter.getPanelMesh(draggingPanelId) : null;
        let startRecord = inputSourceId ? frameInteractionStarts.get(inputSourceId) : null;
        if (inputSourceId) {
          frameInteractionStarts.delete(inputSourceId);
        }

        let result = wasDragging ? adapter.controllerRays.endDrag() : null;
        diagnostics.draggingPanelId = null;
        diagnostics.interactionEvents += 1;

        let hit = adapter.controllerRays.getHits(
          controller,
          listInteractionMeshes(),
        )[0] || null;
        let uv = hit?.uv ? { x: hit.uv.x, y: hit.uv.y } : null;
        let panelId = draggingPanelId || hit?.object?.userData?.panelId || diagnostics.selectedPanelId;
        let receipt = emitInteractionReceipt('selectend', inputSource, hit);
        activeGrabState = { active: false, sourceId: null, objectId: null };

        let context = null;
        if (inputSourceId && startRecord && activeFrameRecord && activeCaptureConfig) {
          context = {
            sessionId: activeCaptureConfig.sessionId,
            startFrameId: startRecord.startFrameId,
            endFrameId: activeFrameRecord.id,
            inputSourceId,
            inputKind: inputKind(inputSource),
            handedness: ['left', 'right'].includes(inputSource?.handedness) ? inputSource.handedness : 'none',
            profiles: normalizeStringList(inputSource?.profiles),
            timestamp: activeFrameRecord.time,
          };
        }

        let portablePanelReceipt = null;
        if (wasDragging && draggingMesh && startRecord && panelStore) {
          let op = startRecord.frameTarget.operation;
          if (op === 'move') {
            let localPos = [draggingMesh.position.x, draggingMesh.position.y, draggingMesh.position.z];
            let localQuat = draggingMesh.quaternion ? [draggingMesh.quaternion.x, draggingMesh.quaternion.y, draggingMesh.quaternion.z, draggingMesh.quaternion.w] : [0, 0, 0, 1];
            portablePanelReceipt = panelStore.settleMove(draggingPanelId, localPos, localQuat, context);
            if (portablePanelReceipt) {
              receiptsList.push(portablePanelReceipt);
              if (!portablePanelReceipt.accepted) {
                let storePanel = panelStore.serialize().panels.find(p => p.id === draggingPanelId);
                if (storePanel) {
                  draggingMesh.position.set(storePanel.current.position[0], storePanel.current.position[1], storePanel.current.position[2]);
                  draggingMesh.quaternion.set(storePanel.current.quaternion[0], storePanel.current.quaternion[1], storePanel.current.quaternion[2], storePanel.current.quaternion[3]);
                }
              }
            }
          } else if (op === 'resize') {
            // A panel transition tween owns mesh.scale while it runs; a
            // scale-derived size read would fold the mid-ease value into the
            // store, so settle from scale-free size sources instead.
            let finalSize = readPanelSize(draggingMesh, transitionTweens.has(draggingPanelId));
            portablePanelReceipt = panelStore.settleResize(draggingPanelId, finalSize, context);
            if (portablePanelReceipt) {
              receiptsList.push(portablePanelReceipt);
              if (!portablePanelReceipt.accepted) {
                let storePanel = panelStore.serialize().panels.find(p => p.id === draggingPanelId);
                if (storePanel) {
                  applyPanelSize(draggingMesh, storePanel.current.size, THREE || draggingMesh.userData.THREE);
                }
              }
            }
          }
        } else if (startRecord && panelStore && (startRecord.frameTarget.operation === 'move' || startRecord.frameTarget.operation === 'resize')) {
          let op = startRecord.frameTarget.operation;
          let targetPanelId = startRecord.panelId;
          let storePanel = panelStore.serialize().panels.find(p => p.id === targetPanelId);
          if (storePanel) {
            if (op === 'move') {
              portablePanelReceipt = panelStore.settleMove(targetPanelId, storePanel.current.position, storePanel.current.quaternion, context);
            } else if (op === 'resize') {
              portablePanelReceipt = panelStore.settleResize(targetPanelId, storePanel.current.size, context);
            }
            if (portablePanelReceipt) {
              receiptsList.push(portablePanelReceipt);
              syncAllMeshesWithStore();
            }
          }
        } else if (!wasDragging && hit && startRecord && panelStore) {
          let frameTarget = hit.frameTarget || resolveHitFrameTarget(hit);
          if (frameTarget && startRecord.frameTarget.operation === frameTarget.operation && startRecord.panelId === panelId) {
            let op = frameTarget.operation;
            if (op === 'focus') {
              portablePanelReceipt = panelStore.focus(panelId, context);
              if (portablePanelReceipt) {
                receiptsList.push(portablePanelReceipt);
                if (portablePanelReceipt.accepted && options.panelHost && typeof options.panelHost.focusPanel === 'function') {
                  options.panelHost.focusPanel(panelId);
                }
              }
            } else if (op === 'action') {
              if (startRecord.frameTarget.action === frameTarget.action) {
                let action = frameTarget.action;
                if (action === 'pin') {
                  portablePanelReceipt = panelStore.togglePin(panelId, context);
                  if (portablePanelReceipt) {
                    receiptsList.push(portablePanelReceipt);
                    if (portablePanelReceipt.accepted) {
                      let updated = panelStore.serialize().panels.find(p => p.id === panelId);
                      if (updated) {
                        let panelObj = hit.object.userData.panel || {};
                        panelObj.pinned = updated.pinned;
                        hit.object.userData.panel = { ...panelObj };
                        hit.object.userData.updatePanelFrameVisuals?.();
                      }
                    }
                  }
                } else if (action === 'reset') {
                  portablePanelReceipt = panelStore.reset(panelId, context);
                  if (portablePanelReceipt) {
                    receiptsList.push(portablePanelReceipt);
                    if (portablePanelReceipt.accepted) {
                      let updated = panelStore.serialize().panels.find(p => p.id === panelId);
                      if (updated) {
                        if (hit.object.position?.set) {
                          hit.object.position.set(updated.current.position[0], updated.current.position[1], updated.current.position[2]);
                        } else {
                          hit.object.position = { x: updated.current.position[0], y: updated.current.position[1], z: updated.current.position[2] };
                        }
                        if (hit.object.quaternion?.set) {
                          hit.object.quaternion.set(updated.current.quaternion[0], updated.current.quaternion[1], updated.current.quaternion[2], updated.current.quaternion[3]);
                        } else if (hit.object.quaternion) {
                          hit.object.quaternion.x = updated.current.quaternion[0];
                          hit.object.quaternion.y = updated.current.quaternion[1];
                          hit.object.quaternion.z = updated.current.quaternion[2];
                          hit.object.quaternion.w = updated.current.quaternion[3];
                        }
                        applyPanelSize(hit.object, updated.current.size, THREE || hit.object.userData.THREE);
                      }
                    }
                  }
                } else if (action === 'close') {
                  // The policy gate runs BEFORE any store call: every receipt
                  // consumes a store sequence number, so a blocked close must
                  // emit none (an interleaved receipt deadlocks the demo
                  // prelude gate permanently).
                  let closeAllowed = typeof options.panelClosePolicy === 'function'
                    ? options.panelClosePolicy(panelId) !== false
                    : true;
                  if (closeAllowed) {
                    portablePanelReceipt = panelStore.setVisibility(panelId, true, context);
                    if (portablePanelReceipt) {
                      receiptsList.push(portablePanelReceipt);
                    }
                  } else {
                    emit('spatial-three-close-blocked', { panelId });
                  }
                } else if (action === 'restore') {
                  portablePanelReceipt = panelStore.setVisibility(panelId, false, context);
                  if (portablePanelReceipt) {
                    receiptsList.push(portablePanelReceipt);
                  }
                } else if (action === 'fullscreen') {
                  options.onPanelFullscreen?.({
                    version: 'xr-panel-fullscreen-intent-v1',
                    panelId,
                    intent: 'panel-fullscreen',
                    context,
                  });
                  emit('spatial-three-panel-fullscreen', { panelId });
                }
              }
            }
            if (portablePanelReceipt) {
              syncAllMeshesWithStore();
            }
          }
        }
      };

      controller.addEventListener?.('selectstart', selectStartListener);
      controller.addEventListener?.('selectend', selectEndListener);

      selectStartListeners.push({ controller, listener: selectStartListener });
      selectEndListeners.push({ controller, listener: selectEndListener });

      if (startOptions.controllerRayVisuals !== false) {
        let visual = adapter.createControllerRayVisual?.(controller, {
          ...(options.controllerRayVisuals || {}),
          ...(startOptions.controllerRayVisuals || {}),
        });
        if (visual?.ok) diagnostics.controllerRayVisuals += 1;
      }
      scene.add?.(controller);
      controllers.push(controller);
    }
    diagnostics.controllers = controllers.length;
    if (startOptions.panelHitReticle !== false && !hitReticle) {
      hitReticle = adapter.createPanelHitReticleVisual?.(scene, {
        ...(options.panelHitReticle || {}),
        ...(startOptions.panelHitReticle || {}),
      });
      if (hitReticle?.ok) diagnostics.hitReticleVisuals = 1;
    }
  }

  function updateHover() {
    if (!controllers.length) return;
    let hit = null;
    for (let controller of controllers) {
      hit = adapter.controllerRays.getHits(controller, listInteractionMeshes())[0] || null;
      if (hit) break;
    }
    if (hit && hit.point) {
      let panelId = hit.object?.userData?.panelId || null;
      if (lastHoverState.panelId !== panelId) {
        lastHoverState.panelId = panelId;
        lastHoverState.point = hit.point.clone();
        if (hit.uv) lastHoverState.uv = { x: hit.uv.x, y: hit.uv.y };
      } else {
        if (lastHoverState.point && typeof lastHoverState.point.lerp === 'function') {
          lastHoverState.point.lerp(hit.point, HOVER_SMOOTHING);
          hit.point.copy(lastHoverState.point);
        }
        if (lastHoverState.uv && hit.uv) {
          lastHoverState.uv.x = lastHoverState.uv.x + HOVER_SMOOTHING * (hit.uv.x - lastHoverState.uv.x);
          lastHoverState.uv.y = lastHoverState.uv.y + HOVER_SMOOTHING * (hit.uv.y - lastHoverState.uv.y);
          hit.uv.x = lastHoverState.uv.x;
          hit.uv.y = lastHoverState.uv.y;
        }
      }
      let frameTarget = resolveHitFrameTarget(hit, options.panelFrameHitTest || {});
      if (frameTarget) {
        hit.frameTarget = frameTarget;
        hit.object.userData ||= {};
        hit.object.userData.lastFrameTarget = frameTarget;
      }
    } else {
      lastHoverState.panelId = null;
      lastHoverState.point = null;
      lastHoverState.uv = null;
    }
    let reticle = adapter.updatePanelHitReticleVisual?.(hitReticle, hit) || null;
    let panelId = hit?.object?.userData?.panelId || null;
    diagnostics.hover = {
      panelId,
      point: vectorData(hit?.point),
      distance: Number(hit?.distance || 0),
      reticleVisible: Boolean(reticle?.visible),
      frameTarget: hit?.frameTarget || null,
      uv: hit?.uv ? { x: hit.uv.x, y: hit.uv.y } : null,
    };
    let hoverFramePoint = hit?.frameTarget?.point || null;
    for (let panelMesh of adapter.listPanelMeshes() || []) {
      updatePanelFrameHoverVisuals(
        panelMesh,
        Boolean(panelId) && panelMesh?.userData?.panelId === panelId,
        hoverFramePoint,
      );
    }
    if (panelId !== lastHoverPanelId) {
      lastHoverPanelId = panelId;
      emit('spatial-three-hover-change', { hover: diagnostics.hover });
    }
  }

  function updateDrag() {
    if (!adapter.controllerRays.getState().dragging) return;
    let result = adapter.controllerRays.updateDrag();
    diagnostics.draggingPanelId = adapter.controllerRays.getState().panelId || diagnostics.draggingPanelId;
    if (!result.ok) {
      emit('spatial-three-drag-miss', {
        error: result.reason || 'drag-update-failed',
      });
    }
  }

  function captureViewerPose(viewerPose, sessionOptions = {}) {
    activeViewerPose = viewerPose || null;
    if (!viewerPose) {
      diagnostics.viewerPoseCaptureReason = 'viewer-pose-unavailable';
      return null;
    }
    if (activeCaptureConfig?.rootPolicy.mode === 'world-locked') {
      diagnostics.viewerPoseCaptured = true;
      diagnostics.viewerPoseCaptureReason = null;
      diagnostics.viewerPoseRootTransform = null;
      return { ok: true, viewerPose, worldLocked: true };
    }
    if (diagnostics.viewerPoseCaptured) return { ok: true, viewerPose };
    if (!adapter.applyViewerPose) return { ok: false, viewerPose, reason: 'viewer-pose-apply-unavailable' };
    let result = adapter.applyViewerPose(viewerPose, {
      mode: diagnostics.mode,
      referenceSpaceType: sessionOptions.referenceSpaceType || diagnostics.requestedReferenceSpaceType,
    });
    let captured = result && typeof result === 'object' ? { ...result, viewerPose } : { ok: false, viewerPose };
    diagnostics.viewerPoseCaptured = result?.ok === true;
    diagnostics.viewerPoseCaptureReason = result?.ok ? null : result?.reason || 'viewer-pose-apply-failed';
    diagnostics.viewerPoseRootTransform = result?.rootTransform || null;
    emit(result?.ok ? 'spatial-three-viewer-pose-captured' : 'spatial-three-viewer-pose-failed', {
      result,
      reason: diagnostics.viewerPoseCaptureReason,
    });
    return captured;
  }

  function cleanupSession() {
    if (instanceFinalSessionSnapshot) return;

    let rootObj = activeRootObject || null;
    if (rootObj) {
      rootObj.visible = false;
    }

    let loopOwner = activeTarget?.renderer?.xr?.setAnimationLoop
      ? activeTarget.renderer.xr
      : activeTarget?.renderer;
    loopOwner?.setAnimationLoop?.(null);

    if (activeTarget?.scene) {
      activeTarget.scene.background = originalBackground;
    }
    originalBackground = null;
    if (activeSession) {
      activeSession.removeEventListener?.('end', onSessionEnd);
    }
    activeSession = null;
    if (adapter.controllerRays.getState?.().dragging === true) {
      adapter.controllerRays.endDrag();
    }

    if (activeReferenceSpace) {
      activeReferenceSpace.removeEventListener?.('reset', onReferenceSpaceReset);
      activeReferenceSpace = null;
    }
    referenceSpaceResetEpoch = 0;
    activeViewerPose = null;
    activeCaptureConfig = null;
    activeRootObject = null;
    activeRootMatrix = null;
    activeFrameRecord = null;
    activeGrabState = { active: false, sourceId: null, objectId: null };
    activeInteractionHandler = null;
    interactionStarts.clear();
    frameInteractionStarts.clear();
    interactionSequence = 0;
    lastHoverPanelId = null;
    lastHoverState = {
      panelId: null,
      point: null,
      uv: null,
    };

    for (let { controller, listener } of selectStartListeners) {
      controller.removeEventListener?.('selectstart', listener);
    }
    for (let { controller, listener } of selectEndListeners) {
      controller.removeEventListener?.('selectend', listener);
    }
    selectStartListeners = [];
    selectEndListeners = [];

    let controllersToCleanup = [...controllers];
    for (let controller of controllersToCleanup) {
      if (controller.children) {
        let children = [...controller.children];
        for (let child of children) {
          if (child.userData?.snControllerRay) {
            controller.remove?.(child);
            if (child.geometry?.dispose) child.geometry.dispose();
            if (child.material?.dispose) child.material.dispose();
          }
        }
      }
      if (activeTarget?.scene) {
        activeTarget.scene.remove?.(controller);
      }
    }
    controllers = [];
    diagnostics.controllers = 0;
    diagnostics.controllerRayVisuals = 0;

    if (hitReticle) {
      if (activeTarget?.scene && hitReticle.object) {
        activeTarget.scene.remove?.(hitReticle.object);
        if (hitReticle.object.geometry?.dispose) hitReticle.object.geometry.dispose();
        if (hitReticle.object.material?.dispose) hitReticle.object.material.dispose();
      }
      hitReticle = null;
      diagnostics.hitReticleVisuals = 0;
    }

    if (panelTransitions) {
      // Interrupted tweens must not strand eased values: restore the instant
      // end-state (unit scale, store-driven visibility, at-rest chip opacity).
      for (let entry of transitionTweens.values()) {
        entry.tween.cancel();
        if (entry.kind === 'chip') {
          if (entry.object?.material) entry.object.material.opacity = 1;
        } else {
          entry.object?.scale?.set?.(1, 1, 1);
          if (entry.phase === 'hide') entry.object.visible = false;
        }
      }
      transitionTweens.clear();
      panelTransitions = null;
    }

    for (let panelId of [...restoreChips.keys()]) {
      disposeRestoreChip(panelId);
    }

    let timingMetrics = timingTracker ? timingTracker.getMetrics() : null;
    let finalPanelState = panelStore ? panelStore.serialize() : { version: 'xr-portable-panel-state-v1', layoutRevision: 0, focusedPanelId: null, panels: [] };

    let rootHidden = rootObj ? (rootObj.visible === false) : false;

    let controllersDestroyed = true;
    if (activeTarget?.scene) {
      for (let controller of controllersToCleanup) {
        if (activeTarget.scene.children?.includes(controller)) {
          controllersDestroyed = false;
        }
      }
    }

    let captureStopped = (loopOwner !== undefined && loopOwner !== null && typeof loopOwner.setAnimationLoop === 'function');
    diagnostics.status = 'idle';

    let factEndEventObserved = endEventObserved;
    let factProviderIdle = (diagnostics.status === 'idle');
    let factActiveSessionCleared = (activeSession === null);
    let factRootHidden = rootHidden;
    let factControllersDestroyed = controllersDestroyed;
    let factCaptureStopped = captureStopped;

    instanceFinalSessionSnapshot = freezeSpatialValue({
      version: 'xr-final-session-snapshot-v1',
      panelState: finalPanelState,
      receipts: receiptsList ? [...receiptsList] : [],
      frameTiming: timingMetrics,
      facts: {
        endEventObserved: factEndEventObserved,
        providerIdle: factProviderIdle,
        activeSessionCleared: factActiveSessionCleared,
        rootHidden: factRootHidden,
        controllersDestroyed: factControllersDestroyed,
        captureStopped: factCaptureStopped,
        teardownReason: pendingTeardownReason || (factEndEventObserved ? 'end-event' : 'start-failed'),
      }
    });
    pendingTeardownReason = null;

    diagnostics.selectedPanelId = null;
    diagnostics.draggingPanelId = null;
    diagnostics.hover = null;
    diagnostics.frames = 0;
    diagnostics.visibilityState = null;
    diagnostics.environmentBlendMode = null;
    diagnostics.interactionMode = null;
    diagnostics.enabledFeatures = [];
    diagnostics.inputSources = [];
    diagnostics.primaryInputSource = null;
    diagnostics.viewports = null;
    diagnostics.viewerPoseCaptured = false;
    diagnostics.viewerPoseCaptureReason = null;
    diagnostics.viewerPoseRootTransform = null;

    diagnostics.sessionId = null;
    diagnostics.targetHash = null;
    diagnostics.buildHash = null;
    diagnostics.lastObservation = null;

    diagnostics.status = 'idle';
    emit('spatial-three-session-ended');
  }

  function updateSessionRuntimeDiagnostics() {
    if (!activeSession) {
      diagnostics.visibilityState = null;
      diagnostics.environmentBlendMode = null;
      diagnostics.interactionMode = null;
      diagnostics.enabledFeatures = [];
      diagnostics.inputSources = [];
      diagnostics.renderState = null;
      diagnostics.viewports = null;
      return;
    }
    diagnostics.visibilityState = activeSession.visibilityState || null;
    diagnostics.environmentBlendMode = activeSession.environmentBlendMode || null;
    diagnostics.interactionMode = activeSession.interactionMode || null;
    diagnostics.enabledFeatures = normalizeStringList(activeSession.enabledFeatures);
    diagnostics.inputSources = normalizeInputSources(activeSession.inputSources);
    diagnostics.primaryInputSource = selectPrimaryXRInputSource(activeSession.inputSources || [], options.inputSource || {}).selected;
    diagnostics.renderState = summarizeXRRenderState(activeSession);
  }

  function captureFrameStage(stage, fn, context = {}) {
    diagnostics.lastFrameStage = stage;
    try {
      return fn();
    } catch (error) {
      diagnostics.frameErrors += 1;
      diagnostics.lastError = error?.name || `${stage}-failed`;
      emit('spatial-three-frame-error', {
        ...context,
        failureStage: stage,
        error: diagnostics.lastError,
        message: error?.message || '',
      });
      return null;
    }
  }

  function normalizedRelativeTransform(worldMatrix) {
    if (!activeRootMatrix || !worldMatrix) return { matrix: null, pose: null };
    let relative = relativeMatrix(activeRootMatrix, worldMatrix);
    let pose = relative ? poseFromMatrix(relative) : null;
    if (!pose) return { matrix: null, pose: null };
    let quaternion = normalizeQuaternion(pose.quaternion);
    if (!quaternion) return { matrix: null, pose: null };
    let normalizedPose = { position: pose.position, quaternion };
    return {
      matrix: makeTransform(normalizedPose.position, normalizedPose.quaternion),
      pose: normalizedPose,
    };
  }

  function captureSpatialViews(frameId, viewerPose, session) {
    let runtimeViews = Array.isArray(viewerPose?.views) ? viewerPose.views : [];
    let baseLayer = session?.renderState?.baseLayer || null;
    return ['left', 'right'].map((eye) => {
      let view = runtimeViews.find((candidate) => candidate.eye === eye) || null;
      let referenceViewMatrix = matrixData(view?.transform?.inverse?.matrix);
      let viewMatrix = referenceViewMatrix && activeRootMatrix
        ? multiplyMatrices(referenceViewMatrix, activeRootMatrix)
        : null;
      let projectionMatrix = matrixData(view?.projectionMatrix);
      let viewport = null;
      try {
        let current = view && baseLayer?.getViewport?.(view);
        if (
          current &&
          [current.x, current.y, current.width, current.height].every((value) => Number.isFinite(Number(value))) &&
          Number(current.width) > 0 && Number(current.height) > 0
        ) {
          viewport = {
            x: Number(current.x),
            y: Number(current.y),
            width: Number(current.width),
            height: Number(current.height),
          };
        }
      } catch {
        viewport = null;
      }
      return { frameId, eye, viewMatrix, projectionMatrix, viewport };
    });
  }

  function captureSpatialObjects(frameId) {
    let sources = new Map((activeCaptureConfig?.spatialObjects || []).map((source) => [source.id, source]));
    return (activeCaptureConfig?.target.objects || []).map((targetObject) => {
      let source = sources.get(targetObject.id) || null;
      try {
        source?.object?.updateMatrixWorld?.(true);
      } catch {}
      let worldMatrix = null;
      try {
        worldMatrix = matrixData(source?.getWorldMatrix?.() || source?.worldMatrix || source?.object?.matrixWorld);
      } catch {}
      let transform = normalizedRelativeTransform(worldMatrix);

      function isValidSize(val) {
        return Array.isArray(val) &&
               val.length === 3 &&
               val.every((v) => typeof v === 'number' && Number.isFinite(v) && v > 0);
      }

      function isValidLiveSize(val) {
        return Array.isArray(val) &&
               (val.length === 2 || val.length === 3) &&
               val.every((v) => typeof v === 'number' && Number.isFinite(v) && v > 0);
      }

      let size = null;
      let w = null;
      let h = null;
      let d = null;

      let sizeCandidate1 = null;
      if (source && typeof source.getSize === 'function') {
        try {
          sizeCandidate1 = source.getSize();
        } catch {}
      }
      if (isValidSize(sizeCandidate1)) {
        w = sizeCandidate1[0];
        h = sizeCandidate1[1];
        d = sizeCandidate1[2];
      }

      let obj = source?.object;
      if (w === null && obj) {
        let xrSize = obj.userData?.xrSize;
        if (isValidLiveSize(xrSize)) {
          w = xrSize[0];
          h = xrSize[1];
          d = xrSize[2] ?? null;
        }
      }

      if (w === null && obj) {
        let panelSize = obj.userData?.panel?.size;
        if (isValidLiveSize(panelSize)) {
          w = panelSize[0];
          h = panelSize[1];
          d = panelSize[2] ?? null;
        }
      }

      if (w === null && obj?.geometry) {
        let params = obj.geometry.parameters || {};
        let scale = obj.scale || { x: 1, y: 1, z: 1 };
        let gw = (typeof params.width === 'number' && Number.isFinite(params.width) && params.width > 0) ? params.width * (scale.x ?? 1) : null;
        let gh = (typeof params.height === 'number' && Number.isFinite(params.height) && params.height > 0) ? params.height * (scale.y ?? 1) : null;
        let gd = (typeof params.depth === 'number' && Number.isFinite(params.depth) && params.depth > 0) ? params.depth * (scale.z ?? 1) : null;
        if (gw !== null && gh !== null) {
          w = gw;
          h = gh;
          d = gd;
        }
      }

      let staticSize = Array.isArray(source?.size) && source.size.length === 3 ? source.size : null;
      if (staticSize) {
        if (w === null) w = staticSize[0];
        if (h === null) h = staticSize[1];
        if (d === null) d = staticSize[2];
      }

      let sizeCandidate2 = [w, h, d];
      if (isValidSize(sizeCandidate2)) {
        size = sizeCandidate2;
      }

      if (!size) {
        let sizeCandidate3 = Array.isArray(source?.size) && source.size.length === 3 ? source.size.map(Number) : null;
        if (isValidSize(sizeCandidate3)) {
          size = sizeCandidate3;
        }
      }
      let state = null;
      try {
        state = typeof source?.getState === 'function' ? source.getState() : source?.state ?? null;
      } catch {}
      let visible = false;
      try {
        visible = typeof source?.visible === 'boolean'
          ? source.visible
          : typeof source?.object?.visible === 'boolean' ? source.object.visible : false;
      } catch {}
      return {
        frameId,
        id: targetObject.id,
        matrix: transform.matrix,
        pose: transform.pose,
        size,
        visible,
        state: typeof state === 'string' ? state : null,
      };
    });
  }

  function captureInputTransform(frame, space) {
    if (!frame?.getPose || !space || !activeReferenceSpace) return { matrix: null, pose: null };
    try {
      let pose = frame.getPose(space, activeReferenceSpace);
      return normalizedRelativeTransform(matrixData(pose?.transform?.matrix));
    } catch {
      return { matrix: null, pose: null };
    }
  }

  function captureSpatialInputs(frameId, frame, session) {
    let sources = session?.inputSources ? Array.from(session.inputSources) : [];
    return sources.map((inputSource, index) => {
      let ray = captureInputTransform(frame, inputSource.targetRaySpace);
      let grip = captureInputTransform(frame, inputSource.gripSpace);
      let direction = ray.matrix
        ? [-ray.matrix[8], -ray.matrix[9], -ray.matrix[10]]
        : null;
      let length = direction ? Math.hypot(...direction) : 0;
      if (direction && length > 0) direction = direction.map((value) => value / length);
      else direction = null;
      return {
        frameId,
        sourceId: sourceIdFor(inputSource, index),
        kind: inputKind(inputSource),
        handedness: ['left', 'right'].includes(inputSource?.handedness) ? inputSource.handedness : 'none',
        profiles: normalizeStringList(inputSource?.profiles),
        targetRay: ray.matrix && direction ? {
          matrix: ray.matrix,
          origin: [...ray.pose.position],
          direction,
        } : null,
        grip: grip.matrix ? { matrix: grip.matrix } : null,
      };
    });
  }

  function captureObservation(time, frame, viewerPose = activeViewerPose) {
    let session = activeSession;
    if (!session || !activeCaptureConfig) return null;
    let sequence = Number(diagnostics.frames);
    let frameTime = Number(time);
    let predictedDisplayTime = Number(frame?.predictedDisplayTime ?? time);
    let frameId = `${activeCaptureConfig.sessionId}:${referenceSpaceResetEpoch}:${sequence}`;
    let viewerWorldMatrix = matrixData(viewerPose?.transform?.matrix);
    let viewer = normalizedRelativeTransform(viewerWorldMatrix);
    let views = captureSpatialViews(frameId, viewerPose, session);
    let objects = captureSpatialObjects(frameId);
    let inputs = captureSpatialInputs(frameId, frame, session);
    let rootPose = activeRootMatrix ? poseFromMatrix(activeRootMatrix) : null;
    let observation = {
      version: XR_SPATIAL_VERSIONS.observation,
      observationId: `${frameId}:observation`,
      targetHash: activeCaptureConfig.target.contentHash,
      provenance: activeCaptureConfig.provenance,
      session: {
        id: activeCaptureConfig.sessionId,
        mode: diagnostics.mode,
        visibility: ['visible', 'visible-blurred', 'hidden'].includes(session.visibilityState)
          ? session.visibilityState
          : 'hidden',
      },
      frame: {
        id: frameId,
        sequence,
        time: frameTime,
        predictedDisplayTime,
        captureTime: frameTime,
      },
      referenceSpace: {
        id: activeCaptureConfig.referenceSpaceId,
        type: diagnostics.requestedReferenceSpaceType,
        resetEpoch: referenceSpaceResetEpoch,
      },
      root: {
        id: activeCaptureConfig.rootPolicy.id,
        commitId: activeCaptureConfig.rootPolicy.commitId,
        matrix: activeRootMatrix,
        pose: rootPose,
      },
      posePhase: 'committed',
      viewerPose: viewer,
      activeGrab: activeGrabState,
      views,
      objects,
      inputs,
    };
    return freezeSpatialValue(observation);
  }

  async function start(mode = 'immersive-vr', startOptions = {}) {
    if (activeSession || diagnostics.status === 'starting' || diagnostics.status === 'running') {
      return { handled: true, ok: false, reason: 'session-already-active', failureStage: 'active-session' };
    }
    panelTransitions = parsePanelTransitionsOption(startOptions.panelTransitions);
    activeTarget = startOptions.target || activeTarget;
    if (!activeTarget?.ok) {
      diagnostics.lastError = activeTarget?.reason || 'three-webxr-unavailable';
      emit('spatial-three-session-failed', {
        attemptId: startOptions.attemptId || null,
        failureStage: 'target-unavailable',
        error: diagnostics.lastError,
        requestedMode: mode,
      });
      return { handled: false, ok: false, reason: diagnostics.lastError, failureStage: 'target-unavailable' };
    }
    if (!target?.navigator?.xr?.requestSession) {
      diagnostics.lastError = 'request-session-unavailable';
      emit('spatial-three-session-failed', {
        attemptId: startOptions.attemptId || null,
        failureStage: 'request-session-unavailable',
        error: diagnostics.lastError,
        requestedMode: mode,
      });
      return { handled: false, ok: false, reason: diagnostics.lastError, failureStage: 'request-session-unavailable' };
    }

    diagnostics.status = 'starting';
    diagnostics.mode = mode;
    diagnostics.lastError = null;

    diagnostics.sessionId = activeCaptureConfig?.sessionId || null;
    diagnostics.targetHash = activeCaptureConfig?.target.contentHash || null;
    diagnostics.buildHash = activeCaptureConfig?.provenance.buildHash || null;

    let xrOptions = sessionOptionsFor(mode, startOptions);
    diagnostics.requestedReferenceSpaceType = xrOptions.referenceSpaceType || null;
    diagnostics.requestedOptionalFeatures = normalizeStringList(xrOptions.optionalFeatures);
    diagnostics.requestedRequiredFeatures = normalizeStringList(xrOptions.requiredFeatures);
    diagnostics.requestedDomOverlay = Boolean(xrOptions.domOverlayRoot);
    diagnostics.viewerPoseCaptured = false;
    diagnostics.viewerPoseCaptureReason = null;
    diagnostics.viewerPoseRootTransform = null;
    diagnostics.frameErrors = 0;
    diagnostics.lastFrameStage = null;
    diagnostics.frames = 0;
    diagnostics.lastObservation = null;
    activeFrameRecord = null;
    activeGrabState = { active: false, sourceId: null, objectId: null };
    emit('spatial-three-session-start-requested', {
      attemptId: startOptions.attemptId || null,
      requestedMode: mode,
      sessionOptions: {
        referenceSpaceType: diagnostics.requestedReferenceSpaceType,
        optionalFeatures: diagnostics.requestedOptionalFeatures,
        requiredFeatures: diagnostics.requestedRequiredFeatures,
        domOverlay: diagnostics.requestedDomOverlay,
      },
    });

    let acquiredSession = null;
    try {
      let adapterOptions = {
        referenceSpaceType: xrOptions.referenceSpaceType,
        optionalFeatures: xrOptions.optionalFeatures,
      };
      let sessionResult = await requestWebXRSession(target, mode, xrOptions);
      if (!sessionResult.ok) {
        activeCaptureConfig = null;
        activeRootMatrix = null;
        activeInteractionHandler = null;
        diagnostics.status = 'failed';
        diagnostics.lastError = sessionResult.reason || 'three-session-failed';
        emit('spatial-three-session-failed', {
          attemptId: startOptions.attemptId || null,
          failureStage: 'request-session',
          error: diagnostics.lastError,
          requestedMode: mode,
        });
        return { handled: true, ok: false, reason: diagnostics.lastError, failureStage: 'request-session' };
      }
      acquiredSession = sessionResult.session;
      let setSession = await adapter.setSession(sessionResult.session, adapterOptions);
      if (!setSession.ok) {
        await sessionResult.session.end?.();
        acquiredSession = null;
        activeCaptureConfig = null;
        activeRootMatrix = null;
        activeInteractionHandler = null;
        diagnostics.status = 'failed';
        diagnostics.lastError = setSession.reason || 'three-session-failed';
        emit('spatial-three-session-failed', {
          attemptId: startOptions.attemptId || null,
          failureStage: 'set-session',
          error: diagnostics.lastError,
          requestedMode: mode,
        });
        return { handled: true, ok: false, reason: diagnostics.lastError, failureStage: 'set-session' };
      }
      activeSession = sessionResult.session;
      instanceFinalSessionSnapshot = null;
      endEventObserved = false;
      pendingTeardownReason = null;

      lastRecordedResetEpoch = 0;
      timingTracker = createXRFrameTimingTracker({
        nominalFrameRate: activeSession?.frameRate || null,
        supportedFrameRates: activeSession?.supportedFrameRates ? Array.from(activeSession.supportedFrameRates) : undefined,
      });
      receiptsList = [];

      let initialPanels = [];
      let meshes = adapter.listPanelMeshes?.() || [];
      let closableByPanelId = new Map();
      initialPanels = meshes.map(mesh => {
        let p = mesh.userData?.panel || {};
        closableByPanelId.set(mesh.userData.panelId, p.closable !== false);
        return {
          id: mesh.userData.panelId,
          canonical: {
            position: [mesh.position.x, mesh.position.y, mesh.position.z],
            quaternion: mesh.quaternion ? [mesh.quaternion.x, mesh.quaternion.y, mesh.quaternion.z, mesh.quaternion.w] : [0, 0, 0, 1],
            size: readPanelSize(mesh) || [0.8, 0.45],
          },
          current: {
            position: [mesh.position.x, mesh.position.y, mesh.position.z],
            quaternion: mesh.quaternion ? [mesh.quaternion.x, mesh.quaternion.y, mesh.quaternion.z, mesh.quaternion.w] : [0, 0, 0, 1],
            size: readPanelSize(mesh) || [0.8, 0.45],
          },
          portable: p.portable !== false,
          pinned: p.pinned === true,
          focused: p.focused === true,
          hidden: p.hidden === true,
          revision: p.revision || 0,
          sourceMetadata: p.sourceMetadata || {}
        };
      });
      panelStore = createXRPortablePanelStore(initialPanels, {
        isPanelClosable: (panelId) => closableByPanelId.get(panelId) !== false,
        onReceipt: (receipt) => {
          if (typeof options.onPortablePanelReceipt === 'function') {
            options.onPortablePanelReceipt(receipt);
          }
          if (typeof controllerInstance?.onPortablePanelReceipt === 'function') {
            controllerInstance.onPortablePanelReceipt(receipt);
          }
        }
      });
      if (adapter.controllerRays) {
        adapter.controllerRays.panelStore = panelStore;
        adapter.controllerRays.receiptsList = receiptsList;
      }

      if (activeReferenceSpace) {
        activeReferenceSpace.removeEventListener?.('reset', onReferenceSpaceReset);
      }
      activeReferenceSpace = setSession.referenceSpace;
      referenceSpaceResetEpoch = 0;
      if (activeReferenceSpace) {
        activeReferenceSpace.addEventListener?.('reset', onReferenceSpaceReset);
      }

      originalBackground = activeTarget.scene?.background || null;
      if (mode === 'immersive-ar' && activeTarget.scene) {
        activeTarget.scene.background = null;
      }
      diagnostics.status = 'running';
      updateSessionRuntimeDiagnostics();
      setupControllers(activeTarget.scene, activeTarget.renderer, activeTarget.camera, startOptions);
      // Register the session loop on the WebXR manager: driving it through the
      // window-level renderer loop restarts window RAF and interleaves
      // frameless ticks with the XR timeline.
      let loopOwner = activeTarget.renderer.xr?.setAnimationLoop ? activeTarget.renderer.xr : activeTarget.renderer;
      loopOwner?.setAnimationLoop?.((time, frame) => {
        // A window-RAF tick can interleave with the XR session loop and carries
        // no XRFrame; letting it through pollutes frames, timing, and
        // observations with a second non-monotonic timeline.
        if (activeSession && !frame) return;
        if (timingTracker) {
          let discontinuous = false;
          if (referenceSpaceResetEpoch !== lastRecordedResetEpoch) {
            discontinuous = true;
            lastRecordedResetEpoch = referenceSpaceResetEpoch;
          }
          let visible = activeSession ? (activeSession.visibilityState === 'visible') : true;
          timingTracker.recordFrame(time, { visible, discontinuous });
        }
        activeViewerPose = null;
        diagnostics.frames += 1;
        activeFrameRecord = {
          id: activeCaptureConfig
            ? `${activeCaptureConfig.sessionId}:${referenceSpaceResetEpoch}:${diagnostics.frames}`
            : null,
          sequence: diagnostics.frames,
          time: Number(time),
        };
        let frameContext = {
          attemptId: startOptions.attemptId || null,
          frameNumber: diagnostics.frames,
          mode,
        };
        captureFrameStage('runtime-diagnostics', () => updateSessionRuntimeDiagnostics(), frameContext);
        let viewerPose = captureFrameStage(
          'viewer-pose-read',
          () => frame?.getViewerPose?.(setSession.referenceSpace) || null,
          frameContext,
        );
        captureFrameStage(
          'viewer-pose',
          () => captureViewerPose(viewerPose, xrOptions),
          frameContext,
        );
        captureFrameStage('frame-viewports', () => {
          diagnostics.viewports = summarizeXRFrameViewports(frame, setSession.referenceSpace, activeSession, {
            viewerPose,
          });
        }, frameContext);
        captureFrameStage('hover', () => updateHover(), frameContext);
        captureFrameStage('drag', () => updateDrag(), frameContext);
        if (panelTransitions) {
          captureFrameStage('transitions', () => tickTransitionTweens(Number(time)), frameContext);
        }

        let observation = null;
        captureFrameStage('observation', () => {
          observation = captureObservation(time, frame, viewerPose);
          diagnostics.lastObservation = observation;
          if (observation) (startOptions.onObservation || options.onObservation)?.(observation);
        }, frameContext);

        if (diagnostics.frames % 45 === 0 && activeTarget.camera && activeTarget.scene) {
          let tempCameraPosition = activeTarget.camera.position.clone();
          let tempPanelPosition = activeTarget.camera.position.clone();
          activeTarget.camera.getWorldPosition?.(tempCameraPosition);
          let meshes = adapter.listPanelMeshes?.() || [];
          let updatedThisInterval = false;
          for (let mesh of meshes) {
            if (!mesh?.userData?.panelId) continue;
            mesh.getWorldPosition?.(tempPanelPosition);
            let distance = tempCameraPosition.distanceTo(tempPanelPosition);
            let currentLod = mesh.userData.lodState || 'high';
            let nextLod = currentLod;
            if (currentLod === 'high' && distance > 2.4) {
              nextLod = 'low';
            } else if (currentLod === 'low' && distance < 2.0) {
              nextLod = 'high';
            }
            if (nextLod !== currentLod) {
              mesh.userData.lodState = nextLod;
              if (!updatedThisInterval && typeof adapter.updatePanelTextureQuality === 'function') {
                let ratio = nextLod === 'high' ? 1.0 : 0.5;
                adapter.updatePanelTextureQuality(mesh.userData.panelId, { texturePixelRatio: ratio });
                updatedThisInterval = true;
              }
            }
          }
        }

        captureFrameStage('frame-callback', () => {
          options.onFrame?.({ time, frame, target: activeTarget, session: activeSession, observation });
        }, frameContext);
        if (startOptions.renderFrame !== false) {
          captureFrameStage('render', () => {
            activeTarget.renderer.render?.(activeTarget.scene, activeTarget.camera);
          }, frameContext);
        }
      });
      activeSession.addEventListener?.('end', onSessionEnd);
      emit('spatial-three-session-started', {
        attemptId: startOptions.attemptId || null,
        mode,
      });
      return { handled: true, ok: true, session: activeSession, diagnostics: getDiagnostics() };
    } catch (error) {
      try {
        await acquiredSession?.end?.();
      } catch {}
      if (activeSession) cleanupSession();
      else {
        activeCaptureConfig = null;
        activeRootMatrix = null;
        activeInteractionHandler = null;
      }
      diagnostics.status = 'failed';
      diagnostics.lastError = error?.name || 'three-session-failed';
      emit('spatial-three-session-failed', {
        attemptId: startOptions.attemptId || null,
        failureStage: 'exception',
        error: diagnostics.lastError,
        message: error?.message || '',
        requestedMode: mode,
      });
      return { handled: true, ok: false, reason: diagnostics.lastError, failureStage: 'exception', message: error?.message || '' };
    }
  }

  async function stop(reason) {
    pendingTeardownReason = 'stop-called';
    let session = activeSession;
    if (!session) {
      cleanupSession();
      return false;
    }
    if (!session.end) {
      cleanupSession();
      return false;
    }
    try {
      await session.end();
    } catch (error) {
      cleanupSession();
      throw error;
    }
    return true;
  }

  function getDiagnostics() {
    updateSessionRuntimeDiagnostics();
    return {
      ...diagnostics,
      active: Boolean(activeSession),
      adapter: adapter.getDiagnostics?.() || adapter.getState?.() || null,
    };
  }

  controllerInstance = {
    start,
    stop,
    commitSpatialEvidence,
    getDiagnostics,
    getState: getDiagnostics,
    captureObservation,
    getFinalSessionSnapshot: () => instanceFinalSessionSnapshot,
    getPortablePanelState() {
      if (activeSession && panelStore) {
        return panelStore.getSnapshot();
      }
      return instanceFinalSessionSnapshot?.panelState || { version: 'xr-portable-panel-state-v1', layoutRevision: 0, focusedPanelId: null, panels: [] };
    },
    getPortablePanelReceipts() {
      if (activeSession && panelStore) {
        return panelStore.getReceipts();
      }
      return instanceFinalSessionSnapshot?.receipts || [];
    },
    onPortablePanelReceipt: null
  };
  return controllerInstance;
}

export function createXRThreeSessionTelemetrySnapshot(diagnostics = {}, options = {}) {
  let adapter = diagnostics.adapter || {};
  let controller = adapter.controller || {};
  let drag = controller.diagnostics?.drag || {};
  let response = drag.response || null;
  let hover = diagnostics.hover || null;
  let textureQuality = summarizeTextureSourceQuality(adapter.textureSources);
  let now = Number(options.now ?? Date.now());
  return {
    version: 'xr-three-session-telemetry-v1',
    timestamp: Number.isFinite(now) ? now : null,
    status: diagnostics.status || 'unknown',
    mode: diagnostics.mode || null,
    active: Boolean(diagnostics.active),
    visibilityState: diagnostics.visibilityState || null,
    environmentBlendMode: diagnostics.environmentBlendMode || null,
    interactionMode: diagnostics.interactionMode || null,
    enabledFeatures: normalizeStringList(diagnostics.enabledFeatures),
    inputSources: normalizeInputSources(diagnostics.inputSources),
    primaryInputSource: diagnostics.primaryInputSource || null,
    sessionOptions: {
      referenceSpaceType: diagnostics.requestedReferenceSpaceType || null,
      optionalFeatures: normalizeStringList(diagnostics.requestedOptionalFeatures),
      requiredFeatures: normalizeStringList(diagnostics.requestedRequiredFeatures),
      domOverlay: Boolean(diagnostics.requestedDomOverlay),
    },
    renderState: diagnostics.renderState || null,
    viewports: diagnostics.viewports || null,
    frames: Number(diagnostics.frames || 0),
    frameErrors: Number(diagnostics.frameErrors || 0),
    lastFrameStage: diagnostics.lastFrameStage || null,
    controllers: Number(diagnostics.controllers || 0),
    controllerRayVisuals: Number(diagnostics.controllerRayVisuals || 0),
    hitReticleVisuals: Number(diagnostics.hitReticleVisuals || 0),
    selectedPanelId: diagnostics.selectedPanelId || null,
    draggingPanelId: diagnostics.draggingPanelId || null,
    hover: hover ? {
      panelId: hover.panelId || null,
      point: hover.point || null,
      distance: Number(hover.distance || 0),
      reticleVisible: Boolean(hover.reticleVisible),
      frameTarget: hover.frameTarget || null,
    } : null,
    interactionEvents: Number(diagnostics.interactionEvents || 0),
    lastEvent: diagnostics.lastEvent || null,
    lastError: diagnostics.lastError || null,
    panelCount: Number(adapter.panelCount || 0),
    panelFrameVisuals: Number(adapter.panelFrameVisualCount || 0),
    materialDiagnostics: adapter.materialDiagnostics || null,
    textureQuality,
    drag: {
      active: Boolean(drag.active),
      panelId: drag.panelId || null,
      frameTarget: drag.frameTarget || null,
      position: drag.position || null,
      rotation: drag.rotation || null,
      size: drag.size || null,
      resize: drag.resize || null,
      appliedDistance: response?.appliedDistance == null ? null : Number(response.appliedDistance),
      rawDistance: response?.rawDistance == null ? null : Number(response.rawDistance),
      smoothing: response?.smoothing == null ? null : Number(response.smoothing),
      maxStep: response?.maxStep == null ? null : Number(response.maxStep),
      deadzone: response?.deadzone == null ? null : Number(response.deadzone),
      clamped: Boolean(response?.clamped),
      settled: Boolean(response?.settled),
    },
  };
}

export function createXRThreeSessionHealthSummary(input = {}, options = {}) {
  let telemetry = input?.version === 'xr-three-session-telemetry-v1'
    ? input
    : createXRThreeSessionTelemetrySnapshot(input, options);
  let minFrames = Number(options.minFrames ?? 1);
  let minControllers = Number(options.minControllers ?? 1);
  let minFps = Number(options.minFps ?? 45);
  let fps = options.fps == null ? null : Number(options.fps);
  let issues = [];

  if (telemetry.lastError) {
    issues.push({ severity: 'blocked', code: 'session-error', value: telemetry.lastError });
  }
  if (telemetry.status === 'failed') {
    issues.push({ severity: 'blocked', code: 'session-failed' });
  }
  if (telemetry.status !== 'running') {
    issues.push({ severity: 'waiting', code: 'session-not-running', value: telemetry.status });
  }
  if (telemetry.active && telemetry.frames < minFrames) {
    issues.push({ severity: 'warning', code: 'no-xr-frames', value: telemetry.frames });
  }
  if (telemetry.active && telemetry.panelCount <= 0) {
    issues.push({ severity: 'blocked', code: 'no-panels' });
  }
  if (telemetry.active && telemetry.panelCount > 0 && telemetry.panelFrameVisuals <= 0) {
    issues.push({ severity: 'warning', code: 'no-panel-frame-visuals' });
  }
  if (telemetry.active && telemetry.renderState?.baseLayer?.present === false) {
    issues.push({ severity: 'blocked', code: 'xr-base-layer-missing' });
  }
  if (telemetry.active && telemetry.viewports && Number(telemetry.viewports.viewCount || 0) <= 0) {
    issues.push({ severity: 'blocked', code: 'xr-viewports-missing' });
  }
  if (telemetry.active && Number(telemetry.materialDiagnostics?.strictDiagnosticCount || 0) > 0) {
    issues.push({
      severity: 'blocked',
      code: 'strict-texture-diagnostic-material',
      value: telemetry.materialDiagnostics.strictDiagnosticCount,
    });
  }
  if (telemetry.active && Number(telemetry.materialDiagnostics?.transparentCount || 0) > 0) {
    issues.push({
      severity: 'warning',
      code: 'panel-material-transparent',
      value: telemetry.materialDiagnostics.transparentCount,
    });
  }
  if (telemetry.active && telemetry.textureQuality?.blocked > 0) {
    issues.push({
      severity: 'blocked',
      code: 'texture-quality-blocked',
      value: telemetry.textureQuality.blocked,
    });
  }
  if (telemetry.active && telemetry.textureQuality?.low > 0) {
    issues.push({
      severity: 'warning',
      code: 'texture-quality-low',
      value: telemetry.textureQuality.low,
    });
  }
  if (telemetry.active && telemetry.textureQuality?.warningCount > 0) {
    issues.push({
      severity: 'warning',
      code: 'texture-quality-warnings',
      value: telemetry.textureQuality.warningCount,
    });
  }
  if (telemetry.active && telemetry.controllers < minControllers) {
    issues.push({ severity: 'warning', code: 'no-input-controllers', value: telemetry.controllers });
  }
  if (telemetry.active && telemetry.controllerRayVisuals <= 0) {
    issues.push({ severity: 'warning', code: 'no-controller-ray-visuals' });
  }
  if (telemetry.active && telemetry.hitReticleVisuals <= 0) {
    issues.push({ severity: 'warning', code: 'no-hit-reticle-visual' });
  }
  if (telemetry.active && fps != null && Number.isFinite(fps) && fps > 0 && fps < minFps) {
    issues.push({ severity: 'warning', code: 'low-fps', value: fps });
  }
  if (telemetry.active && !telemetry.hover?.panelId) {
    issues.push({ severity: 'info', code: 'no-panel-hit-yet' });
  }

  let blocking = issues.filter((issue) => issue.severity === 'blocked');
  let warnings = issues.filter((issue) => issue.severity === 'warning');
  let waiting = issues.filter((issue) => issue.severity === 'waiting');
  let status = 'healthy';
  if (blocking.length) status = 'blocked';
  else if (waiting.length) status = 'waiting';
  else if (warnings.length) status = 'warning';

  return {
    version: 'xr-three-session-health-v1',
    status,
    reason: issues[0]?.code || 'ok',
    checks: {
      running: telemetry.status === 'running',
      active: telemetry.active === true,
      frames: telemetry.frames,
      panelCount: telemetry.panelCount,
      panelFrameVisuals: telemetry.panelFrameVisuals,
      controllers: telemetry.controllers,
      controllerRayVisuals: telemetry.controllerRayVisuals,
      hitReticleVisuals: telemetry.hitReticleVisuals,
      hoverPanelId: telemetry.hover?.panelId || null,
      textureQuality: telemetry.textureQuality || null,
      fps: Number.isFinite(fps) ? fps : null,
    },
    issues,
  };
}

export function createXRThreeInteractionReadinessSummary(input = {}, options = {}) {
  let telemetry = input?.version === 'xr-three-session-telemetry-v1'
    ? input
    : createXRThreeSessionTelemetrySnapshot(input, options);
  let texture = options.texture || null;
  let expectedPanelCount = Number(options.expectedPanelCount ?? telemetry.panelCount ?? 0);
  let expectedFrameVisuals = Number(options.expectedFrameVisuals ?? expectedPanelCount);
  let requireInteractionEvent = options.requireInteractionEvent === true;
  let checks = [];

  function add(id, status, details = {}) {
    checks.push({ id, status, ...details });
  }

  add('session-active', telemetry.active ? 'ready' : 'waiting', {
    status: telemetry.status,
    mode: telemetry.mode,
  });
  add('panels-present', telemetry.panelCount > 0 ? 'ready' : telemetry.active ? 'blocked' : 'waiting', {
    count: telemetry.panelCount,
  });
  add('panel-frame-visuals', telemetry.panelFrameVisuals >= expectedFrameVisuals ? 'ready' : telemetry.active ? 'warning' : 'waiting', {
    count: telemetry.panelFrameVisuals,
    expected: expectedFrameVisuals,
  });
  let hasLiveInputSource = Array.isArray(telemetry.inputSources) && telemetry.inputSources.length > 0;
  let hasTrustedReceipt = false;
  let resolvedActiveId = null;
  if (typeof options.expectedSessionId === 'string' && options.expectedSessionId.trim() !== '') {
    resolvedActiveId = options.expectedSessionId;
  } else if (typeof telemetry?.sessionId === 'string' && telemetry.sessionId.trim() !== '') {
    resolvedActiveId = telemetry.sessionId;
  }

  if (resolvedActiveId && typeof options.verifyReceipt === 'function') {
    let receiptsList = options.retainedReceipts || options.trustedReceipts || options.receipts || telemetry.receipts || [];
    if (!Array.isArray(receiptsList)) {
      receiptsList = [receiptsList];
    }
    let singleReceipt = options.retainedReceipt || options.trustedReceipt || options.receipt;
    if (singleReceipt) {
      receiptsList = [...receiptsList, singleReceipt];
    }
    for (let r of receiptsList) {
      if (r && typeof r === 'object') {
        let verification = options.verifyReceipt(r);
        if (verification && typeof verification === 'object' && !Array.isArray(verification) && verification.ok === true) {
          let receiptSessionId = r.sessionId;
          if (typeof receiptSessionId === 'string' && receiptSessionId.trim() !== '' && receiptSessionId === resolvedActiveId) {
            hasTrustedReceipt = true;
            break;
          }
        }
      }
    }
  }

  let inputSourcesReady = hasLiveInputSource || hasTrustedReceipt;
  add('input-sources-present', inputSourcesReady ? 'ready' : telemetry.active ? 'warning' : 'waiting', {
    controllers: telemetry.controllers,
    inputSources: telemetry.inputSources ? telemetry.inputSources.length : 0,
    hasTrustedReceipt,
  });
  add('controller-rays-visible', telemetry.controllerRayVisuals > 0 ? 'ready' : telemetry.active ? 'warning' : 'waiting', {
    count: telemetry.controllerRayVisuals,
  });
  add('hit-reticle-visible', telemetry.hitReticleVisuals > 0 ? 'ready' : telemetry.active ? 'warning' : 'waiting', {
    count: telemetry.hitReticleVisuals,
  });
  add('panel-hit-state', telemetry.hover?.panelId ? 'ready' : telemetry.active ? 'info' : 'waiting', {
    panelId: telemetry.hover?.panelId || null,
    frameTarget: telemetry.hover?.frameTarget || null,
  });
  add('interaction-events', telemetry.interactionEvents > 0 || !requireInteractionEvent ? 'ready' : telemetry.active ? 'warning' : 'waiting', {
    count: telemetry.interactionEvents,
    required: requireInteractionEvent,
  });
  add('drag-resize-state', telemetry.drag.active || telemetry.drag.resize || telemetry.drag.frameTarget ? 'ready' : 'waiting', {
    active: telemetry.drag.active,
    panelId: telemetry.drag.panelId,
    frameTarget: telemetry.drag.frameTarget,
    resize: telemetry.drag.resize,
  });
  if (texture) {
    add('texture-upload-ready', texture.blocked ? 'blocked' : Number(texture.ready || 0) >= Number(texture.total || 0) ? 'ready' : 'warning', {
      ready: Number(texture.ready || 0),
      total: Number(texture.total || 0),
      reason: texture.reason || null,
      stage: texture.stage || null,
    });
  }

  let blocked = checks.filter((check) => check.status === 'blocked');
  let warnings = checks.filter((check) => check.status === 'warning');
  let waiting = checks.filter((check) => check.status === 'waiting');
  let status = blocked.length ? 'blocked' : warnings.length ? 'warning' : waiting.length ? 'waiting' : 'ready';

  return {
    version: 'xr-three-interaction-readiness-v1',
    ready: status === 'ready',
    status,
    reason: blocked[0]?.id || warnings[0]?.id || waiting[0]?.id || 'ready',
    checks,
    issueCodes: checks.filter((check) => check.status !== 'ready').map((check) => check.id),
    frameTarget: telemetry.hover?.frameTarget || telemetry.drag.frameTarget || null,
    dragging: telemetry.drag.active ? {
      panelId: telemetry.drag.panelId,
      frameTarget: telemetry.drag.frameTarget,
      resize: telemetry.drag.resize,
      appliedDistance: telemetry.drag.appliedDistance,
      clamped: telemetry.drag.clamped,
      settled: telemetry.drag.settled,
    } : null,
  };
}

export function createXRThreeSessionWatchdogSummary(input = {}, options = {}) {
  let telemetry = input?.version === 'xr-three-session-telemetry-v1'
    ? input
    : createXRThreeSessionTelemetrySnapshot(input, options);
  let frames = Number(telemetry.frames || 0);
  let thresholdMs = Number(options.thresholdMs ?? 6000);
  let elapsedMs = options.elapsedMs == null ? null : Number(options.elapsedMs);
  let eventPrefix = options.eventPrefix || 'xr-three-session';
  let status = 'ok';
  let event = null;
  let reason = 'ok';

  if (telemetry.status === 'starting') {
    status = 'waiting';
    event = `${eventPrefix}-still-starting`;
    reason = 'session-still-starting';
  } else if (telemetry.status === 'running' && frames <= 0) {
    status = 'warning';
    event = `${eventPrefix}-no-frames`;
    reason = 'session-no-frames';
  }

  return {
    version: 'xr-three-session-watchdog-v1',
    status,
    event,
    reason,
    thresholdMs: Number.isFinite(thresholdMs) ? thresholdMs : 6000,
    elapsedMs: Number.isFinite(elapsedMs) ? elapsedMs : null,
    eventPrefix,
    sessionStatus: telemetry.status,
    active: telemetry.active,
    frames,
    mode: telemetry.mode,
  };
}

export function createXRThreeDiagnosticPayload(options = {}) {
  let extra = options.extra || options.details || {};
  let sessionDiagnostics = options.sessionDiagnostics || {};
  let telemetry = options.telemetry?.version === 'xr-three-session-telemetry-v1'
    ? options.telemetry
    : createXRThreeSessionTelemetrySnapshot(sessionDiagnostics, options);
  let health = options.health?.version === 'xr-three-session-health-v1'
    ? options.health
    : createXRThreeSessionHealthSummary(telemetry, { fps: options.fps });
  let support = options.support || {};
  let htmlCanvas = options.htmlCanvas || null;
  let texture = options.texture || null;
  let sceneQuality = options.sceneQuality || null;
  let visual = options.visual || null;
  let visualReadiness = options.visualReadiness || null;
  let interactionReadiness = options.interactionReadiness || null;
  let launchGate = options.launchGate || createWebXRLaunchGateSummary(support, {
    preferredMode: options.preferredMode || null,
    selectedMode: options.mode || telemetry.mode || null,
    launch: options.launch || null,
    texture,
    userActivation: options.userActivation || null,
    requireUserActivation: options.requireUserActivation === true,
  });
  let readiness = options.readiness || createXRReadinessSummary({
    launchGate,
    htmlCanvas,
    texture,
    sceneQuality,
    sessionHealth: health,
    sessionActive: telemetry.active,
    mode: options.mode || telemetry.mode || null,
  });

  return {
    version: 'xr-three-diagnostic-payload-v1',
    clientId: options.clientId || null,
    event: options.event || null,
    surface: options.surface || extra.surface || null,
    surfaceKind: options.surfaceKind || options.surface?.surfaceKind || extra.surfaceKind || extra.surface?.surfaceKind || null,
    entrypoint: options.entrypoint || options.surface?.entrypoint || extra.entrypoint || extra.surface?.entrypoint || null,
    projectId: options.projectId || options.surface?.projectId || extra.projectId || extra.surface?.projectId || null,
    targetSection: options.targetSection || options.surface?.targetSection || extra.targetSection || extra.surface?.targetSection || null,
    panelContentKind: options.panelContentKind || options.surface?.panelContentKind || extra.panelContentKind || extra.surface?.panelContentKind || null,
    pageUrl: redactXRDiagnosticUrl(options.pageUrl || ''),
    secureContext: options.secureContext === true,
    navigatorXr: options.navigatorXr === true,
    modes: options.modes || support.modes || {},
    launch: options.launch || null,
    mode: options.mode || telemetry.mode || null,
    selectedPanel: sessionDiagnostics.selectedPanelId || telemetry.selectedPanelId || null,
    hoveredPanel: sessionDiagnostics.hover?.panelId || telemetry.hover?.panelId || null,
    session: { ...telemetry, health },
    error: options.error || extra.error || null,
    details: { ...extra, htmlCanvas, sceneQuality, texture, visual, visualReadiness, interactionReadiness, launchGate, readiness },
  };
}

function normalizeTimelineValue(value) {
  if (value == null || value === '') return null;
  return String(value).replace(/\s+/g, '-').slice(0, 120);
}

function createXRThreeDiagnosticTimelineItem(event = {}) {
  let fields = [
    ['status', event.status],
    ['health', event.health],
    ['mode', event.mode],
    ['html', event.htmlCanvasAvailability],
    ['scene', event.sceneQualityStatus],
    ['ready', event.readinessStatus],
    ['visual', event.visualReadinessStatus],
    ['interaction', event.interactionReadinessStatus],
    ['textureMode', event.textureMode],
    ['texture', event.textureStage],
    ['resolver', event.textureResolverStage],
    ['gate', event.launchGateReason],
    ['stage', event.failureStage],
    ['error', event.error],
  ]
    .map(([key, value]) => [key, normalizeTimelineValue(value)])
    .filter(([, value]) => value);
  let eventName = normalizeTimelineValue(event.event) || 'event';

  return {
    event: eventName,
    receivedAt: event.receivedAt || null,
    fields: Object.fromEntries(fields),
    text: [
      eventName,
      ...fields.map(([key, value]) => `${key}:${value}`),
    ].join(' '),
  };
}

export function createXRThreeSessionOptions(mode = 'immersive-vr', startOptions = {}) {
  let defaultOptionalFeatures = [
    ...(startOptions.includeLocalFeature ? [WEBXR_FEATURES.local] : []),
    WEBXR_FEATURES.localFloor,
    WEBXR_FEATURES.boundedFloor,
    WEBXR_FEATURES.domOverlay,
  ];
  let explicitOptionalFeatures = normalizeStringList(startOptions.optionalFeatures);
  let requiredFeatures = [...new Set(normalizeStringList(startOptions.requiredFeatures))];
  let optionalFeatures = [...new Set(explicitOptionalFeatures.length ? explicitOptionalFeatures : defaultOptionalFeatures)];
  let referenceSpaceType = startOptions.referenceSpaceType || WEBXR_FEATURES.localFloor;
  let result = {
    requiredFeatures,
    optionalFeatures,
    referenceSpaceType,
  };
  if (startOptions.domOverlayRoot) {
    result.domOverlayRoot = startOptions.domOverlayRoot;
  }
  return result;
}

export function createXRThreeDiagnosticTimelineSummary(events = [], options = {}) {
  let limit = Math.max(0, Number(options.limit ?? 12));
  let list = Array.isArray(events) ? events.slice(limit ? -limit : 0) : [];
  let items = list.map(createXRThreeDiagnosticTimelineItem);
  return {
    version: 'xr-three-diagnostic-timeline-v1',
    count: items.length,
    latest: items.at(-1) || null,
    items,
    text: items.length ? items.map((item) => item.text).join(' -> ') : null,
  };
}

function findDiagnosticClient(summary = {}, clientId = null) {
  let clients = Array.isArray(summary.clients) ? summary.clients : [];
  return clients.find((client) => client.clientId === clientId) || null;
}

function inputSourcesText(inputSources = []) {
  return Array.isArray(inputSources) && inputSources.length
    ? inputSources.map((source) => source.targetRayMode || source.handedness || 'input').join(', ')
    : null;
}

export function createXRThreeDiagnosticServerSummary(summary = null, options = {}) {
  let currentClient = summary ? findDiagnosticClient(summary, options.clientId) : null;
  let latestClient = summary?.latestClient || null;
  let latestImmersiveClient = summary?.latestImmersiveClient || null;
  let currentSession = currentClient?.session || null;
  let currentChecks = currentSession?.health?.checks || {};
  let currentHtmlCanvas = currentClient?.htmlCanvas || summary?.htmlCanvas || null;
  let currentSceneQuality = currentClient?.sceneQuality || summary?.sceneQuality || null;
  let currentReadiness = currentClient?.readiness || summary?.readiness || null;
  let currentVisualReadiness = currentClient?.visualReadiness || summary?.visualReadiness || null;
  let currentInteractionReadiness = currentClient?.interactionReadiness || summary?.interactionReadiness || null;
  let currentTexture = currentClient?.texture || null;
  let currentTextureResolver = currentTexture?.resolverStages?.[0] || null;
  let currentLaunchGate = currentClient?.launchGate || null;
  let currentDeepGraph = currentClient?.deepGraph || summary?.deepGraph || null;
  let currentDeepGraphPreview = currentClient?.deepGraphPreview || summary?.deepGraphPreview || null;
  let recentEvents = Array.isArray(currentClient?.recentEvents) ? currentClient.recentEvents : [];
  let currentLastEvent = recentEvents.at(-1) || null;

  return {
    version: 'xr-three-diagnostic-server-summary-v1',
    available: Boolean(summary),
    summaryVersion: summary?.version || null,
    clientCount: Number(summary?.clientCount || 0),
    immersiveClientCount: Number(summary?.immersiveClientCount || 0),
    currentClient,
    latestClient,
    latestImmersiveClient,
    currentSession,
    currentChecks,
    currentHtmlCanvas,
    currentSceneQuality,
    currentReadiness,
    currentVisualReadiness,
    currentInteractionReadiness,
    currentTexture,
    currentTextureResolver,
    currentLaunchGate,
    currentDeepGraph,
    currentDeepGraphPreview,
    currentRunning: Boolean(currentSession?.active || currentSession?.status === 'running'),
    currentTimeline: createXRThreeDiagnosticTimelineSummary(recentEvents, options.timeline || {}),
    currentLastEvent,
    currentLastEventTimeline: createXRThreeDiagnosticTimelineSummary(currentLastEvent ? [currentLastEvent] : []),
    inputSourcesText: inputSourcesText(currentSession?.inputSources),
    latestImmersiveHealth: latestImmersiveClient?.session?.health?.status || null,
  };
}

function issue(code, severity, source, detail = null) {
  return {
    code,
    severity,
    source,
    detail,
  };
}

export function createXRThreeTroubleshootingSummary(diagnostics = null, options = {}) {
  let server = diagnostics?.version === 'xr-three-diagnostic-server-summary-v1'
    ? diagnostics
    : createXRThreeDiagnosticServerSummary(diagnostics, options);
  let issues = [];
  let client = server.currentClient || null;
  let session = server.currentSession || {};
  let checks = server.currentChecks || {};
  let texture = server.currentTexture || null;
  let htmlCanvas = server.currentHtmlCanvas || null;
  let launchGate = server.currentLaunchGate || null;
  let readiness = server.currentReadiness || null;
  let visualReadiness = server.currentVisualReadiness || null;
  let interactionReadiness = server.currentInteractionReadiness || null;
  let sceneQuality = server.currentSceneQuality || null;

  if (!server.available) {
    issues.push(issue('server-diagnostics-unavailable', 'waiting', 'server'));
  }
  if (server.available && !client) {
    issues.push(issue('client-diagnostics-missing', 'waiting', 'server'));
  }
  if (client?.stale) {
    issues.push(issue('client-diagnostics-stale', 'warning', 'server', { ageMs: client.ageMs }));
  }
  if (client?.lastError) {
    issues.push(issue('client-error', 'blocked', 'session', client.lastError));
  }
  if (launchGate?.blocked) {
    issues.push(issue('launch-gate-blocked', 'blocked', 'launch', launchGate.reason || null));
  }
  if (readiness?.status === 'blocked') {
    issues.push(issue('readiness-blocked', 'blocked', 'readiness', readiness.reason || null));
  }
  if (visualReadiness && visualReadiness.ready === false) {
    issues.push(issue('visual-readiness-blocked', visualReadiness.status === 'fail' ? 'blocked' : 'warning', 'visual', visualReadiness.reason || null));
  }
  if (interactionReadiness && interactionReadiness.ready === false) {
    issues.push(issue('interaction-readiness-blocked', interactionReadiness.status === 'blocked' ? 'blocked' : 'warning', 'interaction', interactionReadiness.reason || null));
  }
  if (server.currentRunning && Number(session.frames || checks.frames || 0) <= 0) {
    issues.push(issue('no-xr-frames', 'blocked', 'session'));
  }
  if (server.currentRunning && Number(session.panelCount || checks.panelCount || 0) <= 0) {
    issues.push(issue('no-panels', 'blocked', 'scene'));
  }
  if (
    server.currentRunning &&
    Number(session.panelCount || checks.panelCount || 0) > 0 &&
    Number(session.panelFrameVisuals || checks.panelFrameVisuals || 0) <= 0
  ) {
    issues.push(issue('panel-frame-visuals-missing', 'warning', 'scene'));
  }
  if (server.currentRunning && session.renderState?.baseLayer?.present === false) {
    issues.push(issue('xr-base-layer-missing', 'blocked', 'renderer'));
  }
  if (server.currentRunning && session.viewports && Number(session.viewports.viewCount || 0) <= 0) {
    issues.push(issue('xr-viewports-missing', 'blocked', 'renderer'));
  }
  if (server.currentRunning && Number(session.materialDiagnostics?.strictDiagnosticCount || 0) > 0) {
    issues.push(issue('strict-texture-diagnostic-material', 'blocked', 'material', {
      count: Number(session.materialDiagnostics.strictDiagnosticCount || 0),
      panelIds: session.materialDiagnostics.strictDiagnosticPanelIds || [],
    }));
  }
  if (server.currentRunning && Number(session.materialDiagnostics?.transparentCount || 0) > 0) {
    issues.push(issue('panel-material-transparent', 'warning', 'material', {
      count: Number(session.materialDiagnostics.transparentCount || 0),
    }));
  }
  if (texture?.blocked) {
    issues.push(issue('texture-gate-blocked', 'blocked', 'texture', texture.reason || texture.stage || null));
  } else if (texture && Number(texture.ready || 0) < Number(texture.total || 0)) {
    issues.push(issue('texture-not-ready', 'blocked', 'texture', {
      ready: Number(texture.ready || 0),
      total: Number(texture.total || 0),
      stage: texture.stage || null,
    }));
  }
  if (htmlCanvas && htmlCanvas.textureUploadAvailable === false) {
    issues.push(issue('html-canvas-texture-upload-missing', 'warning', 'html-canvas', htmlCanvas.availability || null));
  }
  if (sceneQuality?.status === 'low') {
    issues.push(issue('scene-quality-low', 'warning', 'scene', {
      lowQualityCount: Number(sceneQuality.lowQualityCount || 0),
      total: Number(sceneQuality.total || 0),
    }));
  }
  if (server.currentRunning && Number(session.controllers || checks.controllers || 0) <= 0) {
    issues.push(issue('input-controllers-missing', 'warning', 'input'));
  }
  if (server.currentRunning && Number(session.controllerRayVisuals || checks.controllerRayVisuals || 0) <= 0) {
    issues.push(issue('controller-rays-missing', 'warning', 'input'));
  }
  if (server.currentRunning && Number(session.hitReticleVisuals || checks.hitReticleVisuals || 0) <= 0) {
    issues.push(issue('hit-reticle-missing', 'warning', 'input'));
  }
  if (server.currentRunning && Number(session.interactionEvents || 0) <= 0) {
    issues.push(issue('interaction-events-missing', 'waiting', 'input'));
  }

  let status = 'ready';
  if (issues.some((item) => item.severity === 'blocked')) {
    status = 'blocked';
  } else if (issues.some((item) => item.severity === 'warning')) {
    status = 'warning';
  } else if (issues.some((item) => item.severity === 'waiting')) {
    status = 'waiting';
  } else if (server.currentRunning) {
    status = 'running';
  }
  let primaryIssue = issues[0] || null;

  return {
    version: 'xr-three-troubleshooting-summary-v1',
    status,
    primaryIssue,
    issues,
    issueCodes: issues.map((item) => item.code),
    issueCount: issues.length,
    serverAvailable: server.available,
    clientId: client?.clientId || null,
    currentRunning: server.currentRunning,
    frameCount: Number(session.frames || checks.frames || 0),
    panelCount: Number(session.panelCount || checks.panelCount || 0),
    textureReady: texture ? Number(texture.ready || 0) : null,
    textureTotal: texture ? Number(texture.total || 0) : null,
    timelineText: server.currentTimeline?.text || null,
  };
}
