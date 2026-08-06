/**
 * @file demo/native-panels-webgl-lab.js
 * @description Standalone experimental lab for native 3D panels. Shows the fixed-size
 * same-origin Symbiote reference layout beside the native Three render, measures the
 * live DOM into a `spatial-snapshot-v1`, compiles it to native primitives, relays
 * native activation back to the live DOM, and reports parity diagnostics. The
 * `mock-families` source keeps the original hand-authored family path working.
 */

import * as THREE from 'three';
import {
  DEFAULT_PROVIDER_THEME,
  applyTheme,
} from '../themes/Theme.js';
import {
  CASCADE_THEME_DEFAULTS,
  applyCascadeTheme,
} from '../themes/cascade-theme.js';
import * as LayoutTree from '../layout/LayoutTree.js';
import { projectLayoutToXR } from '../xr/layout-projection.js';
import {
  NATIVE_PANEL_LAYERS,
  compileNativePanelPrimitives,
  projectXRPanelsToPlane,
  replaceNativePanelScenePanel,
  resizeNativePanelScene,
  resolveNativePanelHit,
} from '../xr/native-panel-layout.js';
import { createThreeNativePanelRenderer } from '../xr/three-native-panel-renderer.js';
import { createNativePanelThemeSnapshot } from '../xr/theme-bridge.js';
import {
  SPATIAL_HEADER_CONTROLS,
  SPATIAL_TREE_CONTROLS,
  captureSpatialSnapshot,
  captureSpatialWindowSnapshot,
  createCanvasColorNormalizer,
  resolveHeaderControlSelector,
} from '../xr/dom-spatial-capture.js';
import { compileSpatialSnapshot } from '../xr/spatial-snapshot-compile.js';
import { createSpatialParityReport } from '../xr/spatial-parity.js';
import { createSpatialVisualParityReport } from '../xr/spatial-visual-parity.js';
import { createSpatialDragController } from '../xr/spatial-drag-controller.js';
import {
  captureResponsivePanelComponentState,
  captureResponsivePanelSnapshot,
  createResponsivePanelResizeContext,
  isResponsivePanelResizeContextStale,
  prepareResponsivePanelCaptureHost,
  updateResponsivePanelResizeTarget,
} from '../xr/responsive-panel-capture.js';
import { createNativePanelLabData } from './native-panels-webgl-lab-data.js';
import { resolveNativePanelPresentationPosition } from './native-panels-webgl-lab-layout.js';

const PINNED_THREE_REVISION = '0.180.0';
const ICON_FONT_SPEC = '16px "Material Symbols Outlined"';
const ICON_FONT_SAMPLE = 'expand_more';
const SPATIAL_ROOT_POSITION = [0, 1.35, -1.4];
const FRONT_CAMERA_PADDING = 0.04;
const FRONT_CAMERA_DISTANCE = 2;
const DEFAULT_WINDOW_GAP = 0.06;
const COLLAPSED_WINDOW_GRAB_MAX_RATIO = 0.04;
const REAL_ROUTE = 'multi-agent-dev/source-editor';
const REAL_SURFACE_SELECTORS = Object.freeze([
  '.project-files-panel',
  '.project-source-panel',
  '.project-panel-intro',
  '.project-files-contract',
]);
const REFERENCE_TAGS = Object.freeze([
  'panel-layout',
  'layout-node',
  'sn-tree-panel',
  'source-editor',
]);

const THEME_STATES = Object.freeze({
  dark: Object.freeze({ ...CASCADE_THEME_DEFAULTS, mode: 'dark' }),
  light: Object.freeze({ ...CASCADE_THEME_DEFAULTS, mode: 'light' }),
});

function roundMetric(value) {
  return Math.round(value * 1_000_000) / 1_000_000;
}

/**
 * Strips the alpha channel from a computed CSS rgb()/rgba() color so assigning it
 * to THREE.Color never hits Three's "alpha will be ignored" warning path.
 *
 * @param {*} value - Theme role color.
 * @returns {*} Opaque rgb() string, or the original value when not rgb()/rgba().
 */
function toOpaqueRgb(value) {
  if (typeof value !== 'string') return value;
  let match = /^\s*rgba?\(\s*([^,()]+)\s*,\s*([^,()]+)\s*,\s*([^,()]+?)(?:\s*,[^()]*)?\)\s*$/i.exec(value);
  return match ? `rgb(${match[1].trim()}, ${match[2].trim()}, ${match[3].trim()})` : value;
}

let colorNormalizers = new WeakMap();

function colorNormalizerFor(doc) {
  let normalizer = colorNormalizers.get(doc);
  if (!normalizer) {
    normalizer = createCanvasColorNormalizer(doc);
    colorNormalizers.set(doc, normalizer);
  }
  return normalizer;
}

/**
 * Explicitly awaits the provider icon font in the outer document, which owns the
 * raster canvases. Returns a readiness label for diagnostics; missing fonts stay
 * visible as data instead of silently drawing literal ligature words.
 *
 * @returns {Promise<string>} `ready`, `ready-late`, `missing`, or `unavailable`.
 */
async function resolveIconFontReadiness() {
  let fonts = document.fonts;
  if (typeof fonts?.check !== 'function') return 'unavailable';
  if (fonts.check(ICON_FONT_SPEC)) return 'ready';
  try {
    await fonts.load(ICON_FONT_SPEC, ICON_FONT_SAMPLE);
  } catch {
    return 'unavailable';
  }
  return fonts.check(ICON_FONT_SPEC) ? 'ready-late' : 'missing';
}

/**
 * Normalizes every browser-resolved theme role to rgb()/rgba() through the capture
 * seam canvas normalizer before the roles reach Three. Roles the browser cannot
 * convert are dropped and reported instead of being forwarded to THREE.Color.
 *
 * @param {Object} theme - `native-panel-theme-v1` snapshot (mutated in place).
 * @param {Document} doc - Document whose cascade produced the roles.
 * @returns {Array<Object>} Unconvertible role diagnostics.
 */
function normalizeThemeRoles(theme, doc) {
  let normalize = colorNormalizerFor(doc);
  let unconvertible = [];
  for (let [role, value] of Object.entries(theme.roles)) {
    if (typeof value !== 'string') continue;
    let normalized = normalize(value);
    if (normalized === null) {
      unconvertible.push({ role, value, themeScope: theme.themeScope });
      delete theme.roles[role];
    } else {
      theme.roles[role] = normalized;
    }
  }
  return unconvertible;
}

function presentationWindows() {
  let panels = compiled?.panels || [];
  let windows = panels.filter((panel) => panel.role === 'window');
  return windows.length
    ? windows
    : panels.filter((panel) => panel.role !== 'layout-control');
}

function basePresentationPosition(panel) {
  return resolveNativePanelPresentationPosition(panel, presentationWindows(), lab.windowGap);
}

function presentationPosition(panel) {
  return resolveNativePanelPresentationPosition(
    panel,
    presentationWindows(),
    lab.windowGap,
    windowDragOffsets.get(panel.id),
  );
}

function windowDiagnostics() {
  let measuredById = new Map((measuredCompiled?.panels || []).map((panel) => [panel.id, panel]));
  return (compiled?.panels || [])
    .filter((panel) => panel.role === 'window')
    .map((panel) => ({
      id: panel.id,
      panelType: panel.panelType,
      size: [...panel.size],
      measuredSize: [...(measuredById.get(panel.id)?.size || panel.size)],
      measuredPosition: [...panel.position],
      presentationPosition: presentationPosition(panel),
      offset: [...(windowDragOffsets.get(panel.id) || [0, 0, 0])],
      sizeOverride: windowSizeOverrides.has(panel.id)
        ? [...windowSizeOverrides.get(panel.id)]
        : null,
      actions: [...new Set(
        panel.primitives
          .map((primitive) => primitive.hit?.intent)
          .filter(Boolean),
      )].sort(),
    }));
}

function applyWindowPresentation() {
  if (!compiled || !panelRenderer) return;
  for (let group of panelRenderer.group.children) {
    let panel = compiledById.get(group.userData?.panelId);
    if (!panel) continue;
    group.position.set(...presentationPosition(panel));
    group.userData.pinned = pinnedWindows.has(panel.id);
    group.visible = !closedWindows.has(panel.id);
    if (group.userData.pinned) panelRenderer.refreshPanelChrome(panel.id);
  }
}

/**
 * Computes the front orthographic frustum from the compiled panel bounds plus a
 * deterministic padding, so every panel border and action stays visible at any
 * canvas aspect ratio. Scene objects and panel projection stay untouched.
 *
 * @returns {{centerX: number, centerY: number, halfWidth: number, halfHeight: number}}
 */
function computeFrontCameraBounds() {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (let panel of compiled?.panels || []) {
    let [x, y] = presentationPosition(panel);
    let preview = resizeState?.panelId === panel.id ? resizeState.previewSize : null;
    let width = preview?.[0] || panel.size[0];
    let height = preview?.[1] || panel.size[1];
    minX = Math.min(minX, x - width / 2);
    maxX = Math.max(maxX, x + width / 2);
    minY = Math.min(minY, y - height / 2);
    maxY = Math.max(maxY, y + height / 2);
  }
  if (!Number.isFinite(minX)) {
    return { centerX: 0, centerY: 0, halfWidth: 1, halfHeight: 0.68 };
  }
  return {
    centerX: (minX + maxX) / 2,
    centerY: (minY + maxY) / 2,
    halfWidth: (maxX - minX) / 2 + FRONT_CAMERA_PADDING,
    halfHeight: (maxY - minY) / 2 + FRONT_CAMERA_PADDING,
  };
}

function createStableLayoutTree() {
  let activity = LayoutTree.createPanel('list-panel');
  activity.id = 'activity';
  let pipeline = LayoutTree.createPanel('graph-panel');
  pipeline.id = 'pipeline';
  let inspector = LayoutTree.createPanel('detail-panel');
  inspector.id = 'inspector';
  return LayoutTree.createSplit(
    'horizontal',
    activity,
    LayoutTree.createSplit('horizontal', pipeline, inspector, 0.58),
    0.38,
  );
}

function nextReferenceFrame(win) {
  return new Promise((resolve) => win.requestAnimationFrame(() => resolve()));
}

async function settleReference(win) {
  await nextReferenceFrame(win);
  await nextReferenceFrame(win);
}

let canvas = document.getElementById('gl');
let diagnosticsEl = document.getElementById('diagnostics');
let referencePane = document.getElementById('reference');
let referenceFrame = document.getElementById('reference-frame');
let sourceSelect = document.getElementById('source');
let cameraSelect = document.getElementById('camera');
let themeSelect = document.getElementById('theme');
let explodeInput = document.getElementById('explode');
let explodeValue = document.getElementById('explode-value');
let windowGapInput = document.getElementById('window-gap');
let windowGapValue = document.getElementById('window-gap-value');
let resetWindowsButton = document.getElementById('reset-windows');

let lab = {
  ready: false,
  status: 'boot',
  source: 'real-layout',
  cameraMode: 'front',
  windowGap: DEFAULT_WINDOW_GAP,
  themeRevision: 0,
  dataRevision: 0,
  threeRevision: PINNED_THREE_REVISION,
  counts: null,
  hovered: null,
  selected: null,
  lastAction: null,
  lastNormalizedHit: null,
  lastRelay: null,
  rendererInfo: null,
  deterministic: null,
  parity: null,
  unsupportedColors: [],
  fontReadiness: null,
  appearanceRefresh: null,
  responsiveCapture: null,
  identity: {
    builds: 0,
    themeUpdates: 0,
    lastThemeUpdatePreservedScene: null,
  },
  errors: [],
  getReport,
  setSource,
  setCamera,
  setTheme,
  setLayerExplode,
  setWindowGap,
  resetWindowPositions,
};
window.__nativePanelLab = lab;

let renderer = null;
let scene = null;
let panelRenderer = null;
let compiled = null;
let measuredCompiled = null;
let compiledById = new Map();
let panelSurfaceIds = new Map();
let snapshot = null;
let parityReport = null;
let visualParityReport = null;
let responsiveSnapshots = new Map();
let responsiveParityByPanel = new Map();
let cameras = {};
let raycaster = new THREE.Raycaster();
let pointerNdc = new THREE.Vector2();
let spatialDragController = createSpatialDragController();
let dragState = null;
let resizeState = null;
let windowDragOffsets = new Map();
let windowSizeOverrides = new Map();
let pinnedWindows = new Set();
let closedWindows = new Set();
let resizerRelay = null;
let diagnosticsTimer = null;
let captureToken = 0;
let responsiveCommitToken = 0;
let referenceThemeReady = false;
let lateFontRedrawUsed = false;
let themeSyncing = false;
let referenceMutationObserver = null;
let referenceMutationTimer = null;
let referenceMutationPending = false;

function boot() {
  applyTheme(document.documentElement, DEFAULT_PROVIDER_THEME);
  applyCascadeTheme(document.documentElement, THEME_STATES.dark, {
    source: 'native-panel-lab-init',
    targetSelector: ':root',
  });

  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  } catch (error) {
    lab.status = 'error';
    lab.errors.push(`WebGL renderer creation failed: ${error.message}`);
    renderDiagnostics();
    throw error;
  }
  renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio || 1, 2));

  scene = new THREE.Scene();
  panelRenderer = createThreeNativePanelRenderer(THREE, {
    threeRevision: PINNED_THREE_REVISION,
    anisotropy: renderer.capabilities?.getMaxAnisotropy?.() ?? 1,
  });
  scene.add(panelRenderer.group);

  cameras = {
    front: new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 20),
    perspective: new THREE.PerspectiveCamera(45, 1, 0.01, 50),
    spatial: new THREE.PerspectiveCamera(60, 1, 0.01, 50),
  };
  cameras.front.position.set(0, 0, 2);
  cameras.front.lookAt(0, 0, 0);
  cameras.perspective.position.set(0.55, 0.42, 1.75);
  cameras.perspective.lookAt(0, 0, 0);
  cameras.spatial.position.set(0, 1.62, 0.28);
  cameras.spatial.lookAt(...SPATIAL_ROOT_POSITION);

  bindControls();
  bindPointer();
  resize();
  globalThis.addEventListener('resize', resize);
  document.addEventListener('cascade-theme-change', onCascadeThemeChange);
  globalThis.addEventListener('pagehide', cleanup);
  globalThis.addEventListener('error', (event) => {
    lab.errors.push(String(event.message || 'unknown error'));
    lab.status = 'error';
    renderDiagnostics();
  });

  renderer.setAnimationLoop(renderFrame);
  diagnosticsTimer = setInterval(renderDiagnostics, 700);

  buildMockScene();
  initReference();
}

function initReference() {
  referenceFrame.addEventListener('load', () => {
    prepareReference().catch((error) => {
      lab.errors.push(`reference capture failed: ${error.message}`);
      lab.status = 'error';
      renderDiagnostics();
    });
  });
  if (referenceFrame.contentDocument?.readyState === 'complete') {
    prepareReference().catch((error) => {
      lab.errors.push(`reference capture failed: ${error.message}`);
      lab.status = 'error';
      renderDiagnostics();
    });
  }
}

async function prepareReference() {
  let win = referenceFrame.contentWindow;
  let doc = referenceFrame.contentDocument;
  if (!win || !doc) throw new Error('reference frame is not same-origin readable');
  await Promise.all([...REFERENCE_TAGS].map((tag) => win.customElements.whenDefined(tag)));
  await doc.fonts?.ready;
  await settleReference(win);
  applyCascadeTheme(doc.documentElement, THEME_STATES[themeSelect.value] || THEME_STATES.dark, {
    source: 'native-panel-lab-theme-control',
    targetSelector: ':root',
  });
  doc.addEventListener('cascade-theme-change', onCascadeThemeChange);
  doc.addEventListener('input', markReferenceDataChanged, true);
  doc.addEventListener('change', markReferenceDataChanged, true);
  referenceMutationObserver?.disconnect();
  referenceMutationObserver = new MutationObserver(markReferenceDataChanged);
  referenceMutationObserver.observe(doc.querySelector('panel-layout'), {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
  });
  await settleReference(win);
  lab.fontReadiness = await resolveIconFontReadiness();
  referenceThemeReady = true;
  if (lab.source === 'real-layout') {
    scheduleCapture();
  }
  lab.status = 'ready';
  lab.ready = true;
  renderDiagnostics();
}

function markReferenceDataChanged() {
  lab.dataRevision += 1;
  clearTimeout(referenceMutationTimer);
  referenceMutationTimer = setTimeout(() => {
    referenceMutationTimer = null;
    if (resizeState) {
      referenceMutationPending = true;
      return;
    }
    if (lab.source === 'real-layout') scheduleCapture();
  }, 24);
}

function responsiveCaptureOptions() {
  return {
    route: REAL_ROUTE,
    surfaceSelectors: REAL_SURFACE_SELECTORS,
  };
}

function replaceSnapshotWindow(baseSnapshot, panelId, windowSnapshot) {
  let nodeId = baseSnapshot.nodes.some((node) => node.id === panelId)
    ? panelId
    : panelId.startsWith('panel:') ? panelId.slice('panel:'.length) : panelId;
  let removed = new Set([nodeId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (let node of baseSnapshot.nodes) {
      if (!removed.has(node.id) && removed.has(node.parentId)) {
        removed.add(node.id);
        changed = true;
      }
    }
  }
  return {
    ...baseSnapshot,
    nodes: [
      ...baseSnapshot.nodes.filter((node) => !removed.has(node.id)),
      ...windowSnapshot.nodes,
    ],
    diagnostics: {
      unsupported: [
        ...baseSnapshot.diagnostics.unsupported,
        ...windowSnapshot.diagnostics.unsupported,
      ],
      unknownVisible: [
        ...baseSnapshot.diagnostics.unknownVisible,
        ...windowSnapshot.diagnostics.unknownVisible,
      ],
    },
  };
}

function updateParityDiagnostics() {
  let paritySnapshot = snapshot;
  for (let [panelId, panelSnapshot] of responsiveSnapshots) {
    paritySnapshot = replaceSnapshotWindow(paritySnapshot, panelId, panelSnapshot);
  }
  visualParityReport = createSpatialVisualParityReport(
    paritySnapshot,
    panelRenderer.getAppearanceReport(),
  );
  lab.parity = {
    ...summarizeParity(parityReport, visualParityReport),
    responsive: [...responsiveParityByPanel].map(([panelId, report]) => ({
      panelId,
      ok: report.ok,
      maxEdgeErrorPx: report.geometry.maxErrorPx,
      tolerancePx: report.geometry.tolerancePx,
    })),
  };
}

function currentResponsiveRevisions() {
  return {
    themeRevision: lab.themeRevision,
    dataRevision: lab.dataRevision,
  };
}

function createResponsiveResizeRecord(
  panelId,
  targetSize,
  measurementScene = measuredCompiled,
  revisions = currentResponsiveRevisions(),
) {
  let doc = referenceFrame.contentDocument;
  let sourcePanel = doc && findReferencePanelNode(doc, panelId);
  let measuredPanel = measurementScene?.panels?.find((panel) => panel.id === panelId);
  let metersPerCssPixel = measurementScene?.spatialSnapshot?.scale;
  if (!sourcePanel || !measuredPanel || !metersPerCssPixel) {
    throw new Error(`Responsive capture could not resolve measured source panel "${panelId}".`);
  }
  let rect = sourcePanel.getBoundingClientRect();
  let componentState = captureResponsivePanelComponentState(sourcePanel);
  let context = createResponsivePanelResizeContext({
    panelId,
    layoutId: sourcePanel.getAttribute('data-panel-id') || panelId,
    sourceSnapshot: captureSpatialWindowSnapshot(sourcePanel, responsiveCaptureOptions()),
    sourceCssSize: [rect.width, rect.height],
    sourceSizeMeters: measuredPanel.size,
    metersPerCssPixel,
    themeRevision: revisions.themeRevision,
    dataRevision: revisions.dataRevision,
    componentState,
  });
  context = updateResponsivePanelResizeTarget(context, targetSize);
  let hostPromise = prepareResponsivePanelCaptureHost(sourcePanel, {
    ...responsiveCaptureOptions(),
    componentState,
  });
  hostPromise.catch(() => {});
  return {
    context,
    hostPromise,
  };
}

function disposeResponsiveResizeRecord(record) {
  record?.hostPromise?.then((host) => host.dispose()).catch(() => {});
}

async function resolveResponsiveResizeRecord(
  record,
  panelId,
  targetSize,
  measurementScene = measuredCompiled,
  revisions = currentResponsiveRevisions(),
) {
  let stale = !record || isResponsivePanelResizeContextStale(record.context, {
    themeRevision: revisions.themeRevision,
    dataRevision: revisions.dataRevision,
  });
  if (stale) {
    disposeResponsiveResizeRecord(record);
    return createResponsiveResizeRecord(panelId, targetSize, measurementScene, revisions);
  }
  return {
    ...record,
    context: updateResponsivePanelResizeTarget(record.context, targetSize),
  };
}

async function recaptureResponsivePanel(
  sceneState,
  panelId,
  targetSize,
  record = null,
  measurementScene = measuredCompiled,
  revisions = currentResponsiveRevisions(),
) {
  let resolved = await resolveResponsiveResizeRecord(
    record,
    panelId,
    targetSize,
    measurementScene,
    revisions,
  );
  let host = await resolved.hostPromise;
  try {
    let captured = await captureResponsivePanelSnapshot(
      host,
      resolved.context.targetCssSize,
      responsiveCaptureOptions(),
    );
    let onePanelScene = compileSpatialSnapshot(captured.snapshot, {
      planeWidth: resolved.context.targetSizeMeters[0],
    });
    let replacement = onePanelScene.panels.find((panel) => panel.id === panelId);
    let previous = sceneState.panels.find((panel) => panel.id === panelId);
    if (!replacement || !previous || onePanelScene.panels.length !== 1) {
      throw new Error(
        `Responsive capture for "${panelId}" must compile to exactly one matching window.`,
      );
    }
    replacement = {
      ...replacement,
      position: [...previous.position],
      rotation: [...previous.rotation],
      relativeRect: { ...previous.relativeRect },
      metadata: {
        ...previous.metadata,
        ...replacement.metadata,
        responsiveCapture: {
          version: captured.version,
          sourceCssSize: captured.sourceCssSize,
          targetCssSize: captured.targetCssSize,
          actualCssSize: captured.actualCssSize,
          themeRevision: resolved.context.themeRevision,
          dataRevision: resolved.context.dataRevision,
          stylesheets: captured.stylesheets,
        },
      },
    };
    return {
      scene: replaceNativePanelScenePanel(sceneState, panelId, replacement),
      context: resolved.context,
      parity: createSpatialParityReport(captured.snapshot, onePanelScene),
      snapshot: captured.snapshot,
      actualCssSize: captured.actualCssSize,
      stylesheets: captured.stylesheets,
    };
  } finally {
    host.dispose();
  }
}

function responsiveCaptureDiagnostics(panelId, responsive) {
  return {
    panelId,
    sourceCssSize: [...responsive.context.sourceCssSize],
    targetCssSize: [...responsive.context.targetCssSize],
    actualCssSize: [...responsive.actualCssSize],
    targetSizeMeters: [...responsive.context.targetSizeMeters],
    themeRevision: responsive.context.themeRevision,
    dataRevision: responsive.context.dataRevision,
    parity: {
      ok: responsive.parity.ok,
      maxEdgeErrorPx: responsive.parity.geometry.maxErrorPx,
      tolerancePx: responsive.parity.geometry.tolerancePx,
    },
    stylesheets: responsive.stylesheets,
  };
}

async function captureAndMount(token, revisions) {
  let doc = referenceFrame.contentDocument;
  let root = doc?.querySelector('panel-layout');
  if (!root) throw new Error('reference frame has no <panel-layout> subtree');
  let options = responsiveCaptureOptions();
  let first = captureSpatialSnapshot(root, options);
  let second = captureSpatialSnapshot(root, options);
  let nextDeterministic = JSON.stringify(first) === JSON.stringify(second);
  let nextSnapshot = first;
  let nextMeasuredCompiled = compileSpatialSnapshot(nextSnapshot);
  let nextCompiled = nextMeasuredCompiled;
  let nextResponsiveSnapshots = new Map();
  let nextResponsiveParityByPanel = new Map();
  let nextResponsiveCapture = null;
  for (let [panelId, size] of windowSizeOverrides) {
    if (!nextCompiled.panels.some((panel) => panel.id === panelId)) continue;
    let responsive = await recaptureResponsivePanel(
      nextCompiled,
      panelId,
      size,
      null,
      nextMeasuredCompiled,
      revisions,
    );
    nextCompiled = responsive.scene;
    nextResponsiveSnapshots.set(panelId, responsive.snapshot);
    nextResponsiveParityByPanel.set(panelId, responsive.parity);
    nextResponsiveCapture = responsiveCaptureDiagnostics(panelId, responsive);
  }
  let theme = createNativePanelThemeSnapshot(doc, { revision: revisions.themeRevision });
  if (token !== captureToken
    || lab.source !== 'real-layout'
    || revisions.themeRevision !== lab.themeRevision
    || revisions.dataRevision !== lab.dataRevision) {
    return false;
  }
  lab.deterministic = nextDeterministic;
  snapshot = nextSnapshot;
  measuredCompiled = nextMeasuredCompiled;
  compiled = nextCompiled;
  responsiveSnapshots = nextResponsiveSnapshots;
  responsiveParityByPanel = nextResponsiveParityByPanel;
  lab.responsiveCapture = nextResponsiveCapture;
  rebuildCompiledMaps();
  lab.unsupportedColors = normalizeThemeRoles(theme, doc);
  let refresh = panelRenderer.refreshAppearance(compiled, { theme });
  lab.appearanceRefresh = {
    ok: refresh.ok,
    reason: refresh.reason ?? null,
    changed: refresh.changed?.length ?? 0,
  };
  if (!refresh.ok) {
    if (refresh.reason !== 'geometry-invalidated') {
      lab.errors.push(`appearance refresh rejected: ${refresh.reason ?? 'unknown'}`);
    }
    panelRenderer.mount(compiled, { theme });
  }
  applyWindowPresentation();
  scene.background = new THREE.Color(toOpaqueRgb(theme.roles['surface-sunken']));
  parityReport = createSpatialParityReport(snapshot, measuredCompiled);
  updateParityDiagnostics();
  lab.counts = {
    panels: compiled.counts.panels,
    windows: compiled.counts.windows,
    layoutControls: compiled.counts.layoutControls,
    layers: NATIVE_PANEL_LAYERS.length,
    primitives: compiled.counts.primitives,
    interactive: compiled.counts.hitTargets,
  };
  resize();
  scheduleLateFontRedraw();
  renderDiagnostics();
  return true;
}

function scheduleLateFontRedraw() {
  let fonts = document.fonts;
  if (lateFontRedrawUsed || typeof fonts?.check !== 'function' || fonts.check(ICON_FONT_SPEC)) return;
  lateFontRedrawUsed = true;
  fonts.ready.then(() => {
    if (!fonts.check(ICON_FONT_SPEC)) return;
    panelRenderer.refreshTextures();
    renderDiagnostics();
  });
}

function summarizeVisualParity(report) {
  return {
    ok: report.ok,
    issues: report.issues,
    coverage: report.coverage,
    compared: report.compared,
    unknownVisible: report.unknownVisible,
    informational: report.informational,
  };
}

function summarizeParity(ir, visual) {
  return {
    ok: ir.ok && visual.ok,
    ir: {
      ok: ir.ok,
      maxEdgeErrorPx: ir.geometry.maxErrorPx,
      tolerancePx: ir.geometry.tolerancePx,
      panels: ir.geometry.panels,
      resizers: ir.geometry.resizers,
      unmatchedNodes: ir.geometry.unmatched.length,
      text: { compared: ir.text.compared, mismatches: ir.text.mismatches },
      icons: ir.icons,
      style: { compared: ir.style.compared, mismatches: ir.style.mismatches },
      actions: { total: ir.actions.total, mapped: ir.actions.mapped, unmapped: ir.actions.unmapped },
      unsupported: ir.diagnostics.unsupported,
      unknownVisible: ir.diagnostics.unknownVisible,
    },
    visual: summarizeVisualParity(visual),
  };
}

async function scheduleCapture() {
  let token = ++captureToken;
  let win = referenceFrame.contentWindow;
  if (!win) return;
  await settleReference(win);
  if (token !== captureToken || lab.source !== 'real-layout') return;
  let revisions = currentResponsiveRevisions();
  try {
    let mounted = await captureAndMount(token, revisions);
    if (!mounted && token === captureToken && lab.source === 'real-layout') {
      scheduleCapture();
    }
  } catch (error) {
    lab.errors.push(`capture failed: ${error.message}`);
    renderDiagnostics();
  }
}

function buildMockScene() {
  let xrScene = projectLayoutToXR(createStableLayoutTree());
  let projected = projectXRPanelsToPlane(xrScene.panels, {
    planeWidth: 1.9,
    planeHeight: 0.95,
    gap: 0.03,
    z: 0,
  });
  measuredCompiled = compileNativePanelPrimitives(projected.panels, createNativePanelLabData());
  compiled = applyWindowSizeOverrides(measuredCompiled);
  rebuildCompiledMaps();
  snapshot = null;
  parityReport = null;
  visualParityReport = null;
  responsiveSnapshots = new Map();
  responsiveParityByPanel = new Map();
  lab.parity = null;
  lab.deterministic = null;
  panelRenderer.mount(compiled, { theme: panelRendererTheme() });
  applyWindowPresentation();
  scene.background = new THREE.Color(toOpaqueRgb(panelRendererTheme().roles['surface-sunken']));
  lab.counts = {
    panels: compiled.counts.panels,
    layers: NATIVE_PANEL_LAYERS.length,
    primitives: compiled.counts.primitives,
    interactive: compiled.counts.hitTargets,
  };
  lab.status = 'ready';
  lab.ready = true;
  resize();
  renderDiagnostics();
}

function applyWindowSizeOverrides(scene) {
  let next = scene;
  for (let [panelId, size] of windowSizeOverrides) {
    if (next.panels.some((panel) => panel.id === panelId)) {
      next = resizeNativePanelScene(next, panelId, size);
    }
  }
  return next;
}

function remountCommittedWindows() {
  if (lab.source === 'real-layout') {
    scheduleCapture();
    return;
  }
  compiled = applyWindowSizeOverrides(measuredCompiled);
  rebuildCompiledMaps();
  panelRenderer.mount(compiled, { theme: panelRendererTheme() });
  applyWindowPresentation();
  resize();
}

async function commitResponsiveWindowSize(panelId, size, record = null) {
  let measured = measuredCompiled?.panels?.find((panel) => panel.id === panelId);
  if (!measured) return false;
  let next = size.map((value) => roundMetric(value));
  let resetToMeasured = next[0] === measured.size[0] && next[1] === measured.size[1];
  let token = ++responsiveCommitToken;
  lab.status = 'responsive-capture';
  let responsive = null;
  let activeRecord = record;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    responsive = await recaptureResponsivePanel(compiled, panelId, next, activeRecord);
    activeRecord = null;
    if (token !== responsiveCommitToken || lab.source !== 'real-layout') return false;
    if (!isResponsivePanelResizeContextStale(
      responsive.context,
      currentResponsiveRevisions(),
    )) {
      break;
    }
    responsive = null;
  }
  if (!responsive) {
    throw new Error(
      `Responsive capture for "${panelId}" stayed stale while theme or data changed.`,
    );
  }
  if (resetToMeasured) {
    windowSizeOverrides.delete(panelId);
  } else {
    windowSizeOverrides.set(panelId, next);
  }
  compiled = responsive.scene;
  rebuildCompiledMaps();
  panelRenderer.replacePanel(compiled, panelId);
  applyWindowPresentation();
  responsiveSnapshots.set(panelId, responsive.snapshot);
  responsiveParityByPanel.set(panelId, responsive.parity);
  updateParityDiagnostics();
  lab.responsiveCapture = responsiveCaptureDiagnostics(panelId, responsive);
  lab.counts = {
    panels: compiled.counts.panels,
    windows: compiled.counts.windows,
    layoutControls: compiled.counts.layoutControls,
    layers: NATIVE_PANEL_LAYERS.length,
    primitives: compiled.counts.primitives,
    interactive: compiled.counts.hitTargets,
  };
  lab.status = 'ready';
  resize();
  renderDiagnostics();
  return true;
}

async function commitWindowSize(panelId, size, record = null) {
  if (lab.source === 'real-layout') {
    try {
      return await commitResponsiveWindowSize(panelId, size, record);
    } catch (error) {
      panelRenderer.cancelPanelSizePreview(panelId);
      lab.status = 'error';
      lab.errors.push(`responsive capture failed: ${error.message}`);
      renderDiagnostics();
      return false;
    }
  }
  let measured = measuredCompiled?.panels?.find((panel) => panel.id === panelId);
  if (!measured) return false;
  let next = size.map((value) => roundMetric(value));
  if (next[0] === measured.size[0] && next[1] === measured.size[1]) {
    windowSizeOverrides.delete(panelId);
  } else {
    windowSizeOverrides.set(panelId, next);
  }
  remountCommittedWindows();
  return true;
}

function rebuildCompiledMaps() {
  compiledById = new Map(compiled.panels.map((panel) => [panel.id, panel]));
  for (let panelId of windowDragOffsets.keys()) {
    if (!compiledById.has(panelId)) windowDragOffsets.delete(panelId);
  }
  for (let panelId of windowSizeOverrides.keys()) {
    if (!compiledById.has(panelId)) windowSizeOverrides.delete(panelId);
  }
  for (let panelId of pinnedWindows) {
    if (!compiledById.has(panelId)) pinnedWindows.delete(panelId);
  }
  for (let panelId of closedWindows) {
    if (!compiledById.has(panelId)) closedWindows.delete(panelId);
  }
  panelSurfaceIds = new Map();
  for (let panel of compiled.panels) {
    let surface = panel.primitives.find((primitive) => primitive.kind === 'surface'
      && primitive.layer === 'surface'
      && primitive.bounds.x === 0
      && primitive.bounds.y === 0
      && primitive.bounds.width === panel.size[0]
      && primitive.bounds.height === panel.size[1]);
    if (surface) panelSurfaceIds.set(panel.id, surface.id);
  }
}

function setSource(source) {
  if (!['real-layout', 'mock-families'].includes(source)) {
    throw new Error(`Unknown source "${source}". Supported: real-layout, mock-families.`);
  }
  lab.source = source;
  if (resizeState?.responsiveRecord) {
    disposeResponsiveResizeRecord(resizeState.responsiveRecord);
  }
  resizeState = null;
  responsiveCommitToken += 1;
  sourceSelect.value = source;
  referencePane.hidden = source !== 'real-layout';
  lab.hovered = null;
  lab.selected = null;
  lab.lastAction = null;
  panelRenderer.setHovered(null);
  panelRenderer.setSelected(null);
  if (source === 'real-layout') {
    if (referenceThemeReady) {
      scheduleCapture();
    }
  } else {
    captureToken += 1;
    buildMockScene();
  }
  renderDiagnostics();
}

function panelRendererTheme() {
  let theme = createNativePanelThemeSnapshot(document, { revision: lab.themeRevision });
  lab.unsupportedColors = normalizeThemeRoles(theme, document);
  return theme;
}

function activeCamera() {
  return cameras[lab.cameraMode] || cameras.front;
}

function renderFrame() {
  let info = renderer.info.render;
  renderer.render(scene, activeCamera());
  lab.rendererInfo = {
    calls: info.calls,
    triangles: info.triangles,
  };
}

function resize() {
  let width = canvas.clientWidth || 1;
  let height = canvas.clientHeight || 1;
  renderer.setSize(width, height, false);
  let aspect = width / height;
  let bounds = computeFrontCameraBounds();
  let halfHeight = Math.max(bounds.halfHeight, bounds.halfWidth / aspect);
  cameras.front.left = -halfHeight * aspect;
  cameras.front.right = halfHeight * aspect;
  cameras.front.top = halfHeight;
  cameras.front.bottom = -halfHeight;
  cameras.front.position.set(bounds.centerX, bounds.centerY, FRONT_CAMERA_DISTANCE);
  cameras.front.lookAt(bounds.centerX, bounds.centerY, 0);
  cameras.front.updateProjectionMatrix();
  cameras.perspective.aspect = aspect;
  cameras.perspective.updateProjectionMatrix();
  cameras.spatial.aspect = aspect;
  cameras.spatial.updateProjectionMatrix();
}

function setCamera(mode) {
  if (!cameras[mode]) {
    throw new Error(`Unknown camera mode "${mode}". Supported: ${Object.keys(cameras).join(', ')}.`);
  }
  lab.cameraMode = mode;
  if (mode === 'spatial') {
    panelRenderer.group.position.set(...SPATIAL_ROOT_POSITION);
  } else {
    panelRenderer.group.position.set(0, 0, 0);
  }
  cameraSelect.value = mode;
  renderDiagnostics();
}

function setTheme(name) {
  let state = THEME_STATES[name];
  if (!state) {
    throw new Error(`Unknown theme state "${name}". Supported: ${Object.keys(THEME_STATES).join(', ')}.`);
  }
  themeSelect.value = name;
  applyCascadeTheme(document.documentElement, state, {
    source: 'native-panel-lab-theme-control',
    targetSelector: ':root',
  });
}

function setLayerExplode(value) {
  let amount = Number(value);
  panelRenderer.setLayerExplode(amount);
  explodeInput.value = String(amount);
  explodeValue.textContent = `${amount.toFixed(2)} m`;
  renderDiagnostics();
}

function setWindowGap(value) {
  let amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0) {
    throw new Error(`Window gap must be a non-negative finite number, got ${JSON.stringify(value)}.`);
  }
  lab.windowGap = amount;
  windowGapInput.value = String(amount);
  windowGapValue.textContent = `${amount.toFixed(2)} m`;
  applyWindowPresentation();
  resize();
  renderDiagnostics();
}

function resetWindowPositions() {
  windowDragOffsets.clear();
  windowSizeOverrides.clear();
  responsiveSnapshots.clear();
  responsiveParityByPanel.clear();
  lab.responsiveCapture = null;
  remountCommittedWindows();
  lab.lastAction = { actionId: 'reset-window-positions' };
  renderDiagnostics();
}

function onCascadeThemeChange(event) {
  if (themeSyncing || (event.detail?.targetSelector && event.detail.targetSelector !== ':root')) return;
  let state = event.detail?.state;
  let sourceDoc = event.target?.ownerDocument || null;
  let referenceDoc = referenceFrame.contentDocument;
  if (state) {
    themeSyncing = true;
    try {
      if (sourceDoc !== document) {
        applyCascadeTheme(document.documentElement, state, {
          notify: false,
          source: 'native-panel-lab-theme-mirror',
          targetSelector: ':root',
        });
      }
      if (referenceThemeReady && referenceDoc && sourceDoc !== referenceDoc) {
        applyCascadeTheme(referenceDoc.documentElement, state, {
          notify: false,
          source: 'native-panel-lab-theme-mirror',
          targetSelector: ':root',
        });
      }
      if (THEME_STATES[state.mode]) themeSelect.value = state.mode;
    } finally {
      themeSyncing = false;
    }
  }
  lab.themeRevision += 1;
  if (lab.source === 'real-layout') {
    if (referenceThemeReady) {
      if (resizeState) {
        referenceMutationPending = true;
      } else {
        scheduleCapture();
      }
    }
    return;
  }
  let buildsBefore = panelRenderer.getDiagnostics().builds;
  let themeSnapshot = panelRendererTheme();
  panelRenderer.updateTheme(themeSnapshot);
  scene.background = new THREE.Color(toOpaqueRgb(themeSnapshot.roles['surface-sunken']));
  let diagnostics = panelRenderer.getDiagnostics();
  lab.identity.builds = diagnostics.builds;
  lab.identity.themeUpdates = diagnostics.themeUpdates;
  lab.identity.lastThemeUpdatePreservedScene = diagnostics.builds === buildsBefore;
  renderDiagnostics();
}

function updatePointerNdc(event) {
  let rect = canvas.getBoundingClientRect();
  pointerNdc.set(
    ((event.clientX - rect.left) / Math.max(rect.width, 1)) * 2 - 1,
    -(((event.clientY - rect.top) / Math.max(rect.height, 1)) * 2 - 1),
  );
  raycaster.setFromCamera(pointerNdc, activeCamera());
}

function currentPointerRay(event) {
  updatePointerNdc(event);
  return {
    kind: 'mouse',
    origin: raycaster.ray.origin.toArray(),
    direction: raycaster.ray.direction.toArray(),
  };
}

function pickPanelHit(event) {
  updatePointerNdc(event);
  panelRenderer.group.updateWorldMatrix(true, true);
  let hits = raycaster.intersectObject(panelRenderer.group, true);
  let primary = null;
  for (let hit of hits) {
    let resolved = panelRenderer.resolveIntersection(hit);
    if (resolved?.actionId) {
      primary = resolved;
      break;
    }
  }
  let panelId = primary?.panelId || null;
  if (!panelId) {
    for (let hit of hits) {
      let resolved = panelRenderer.resolveIntersection(hit);
      if (resolved?.panelId) {
        panelId = resolved.panelId;
        break;
      }
    }
  }
  if (!panelId) return null;
  if (primary?.kind === 'window-chrome') {
    return { panelId, point: primary.point || null, hit: primary };
  }
  let point = null;
  let surfaceId = panelSurfaceIds.get(panelId);
  for (let hit of hits) {
    if (hit.object?.userData?.primitiveId === surfaceId && hit.uv) {
      point = { x: roundMetric(hit.uv.x), y: roundMetric(1 - hit.uv.y) };
      break;
    }
  }
  if (!point && primary?.point) point = primary.point;
  if (!point) {
    return { panelId, point: null, hit: null };
  }
  let resolvedHit = resolveNativePanelHit(compiledById.get(panelId), point);
  return { panelId, point, hit: resolvedHit };
}

function canStartWindowDrag(hit) {
  if (hit?.actionId === 'drag-panel') return true;
  let panel = compiledById.get(hit?.panelId);
  return Boolean(hit?.actionId)
    && panel?.role === 'window'
    && panel.relativeRect?.width <= COLLAPSED_WINDOW_GRAB_MAX_RATIO;
}

function emitIntent(detail) {
  document.dispatchEvent(new CustomEvent('native-panel-intent', {
    bubbles: true,
    composed: true,
    detail,
  }));
}

function findHitPrimitive(hit) {
  return compiledById.get(hit?.panelId)?.primitives
    .find((primitive) => primitive.id === hit.primitiveId) || null;
}

function findReferencePanelNode(doc, panelTargetId) {
  let key = panelTargetId.startsWith('panel:') ? panelTargetId.slice('panel:'.length) : panelTargetId;
  let component = doc.querySelector(`[data-panel-id="${CSS.escape(key)}"]`);
  return component?.closest('layout-node') || null;
}

function findResizerElement(doc, targetId) {
  let match = /^split:(horizontal|vertical)\/resizer:(\d+)$/.exec(targetId);
  if (!match) return null;
  let [, direction, sequence] = match;
  let index = 0;
  for (let split of doc.querySelectorAll('layout-node[node-type="split"]')) {
    if ((split.getAttribute('direction') || 'horizontal') !== direction) continue;
    index += 1;
    if (index === Number(sequence)) {
      return split.querySelector(':scope > .split-view > .split-resizer');
    }
  }
  return null;
}

function relayRealAction(hit) {
  let doc = referenceFrame.contentDocument;
  if (!doc) return false;
  let intent = findHitPrimitive(hit)?.hit?.intent || null;
  let targetId = hit.targetId;
  let relayed = false;
  if (intent === 'sn-tree-select') {
    let row = doc.querySelector(`.sn-tree-row[data-tree-id="${CSS.escape(targetId)}"]`);
    if (row) {
      row.click();
      relayed = true;
    }
  } else if (intent === 'sn-tree-toggle') {
    let row = doc.querySelector(`.sn-tree-row[data-tree-id="${CSS.escape(targetId)}"]`);
    let toggle = row?.querySelector('.sn-tree-toggle');
    if (toggle) {
      toggle.click();
      relayed = true;
    }
  } else if (SPATIAL_HEADER_CONTROLS.some((control) => control.intent === intent)) {
    let selector = resolveHeaderControlSelector(intent);
    let button = findReferencePanelNode(doc, targetId)?.querySelector(selector);
    if (button) {
      button.click();
      relayed = true;
    }
  } else if (SPATIAL_TREE_CONTROLS.some((control) => control.intent === intent)) {
    let selector = SPATIAL_TREE_CONTROLS.find((control) => control.intent === intent).selector;
    let button = findReferencePanelNode(doc, targetId)?.querySelector(selector);
    if (button) {
      button.click();
      relayed = true;
    }
  }
  lab.lastRelay = { intent, targetId, relayed };
  if (relayed) {
    markReferenceDataChanged();
  }
  return relayed;
}

function dispatchReferencePointer(win, target, type, clientX, clientY) {
  target.dispatchEvent(new win.PointerEvent(type, {
    bubbles: true,
    composed: true,
    cancelable: true,
    pointerId: 1,
    pointerType: 'mouse',
    isPrimary: true,
    button: 0,
    buttons: type === 'pointerup' ? 0 : 1,
    clientX,
    clientY,
  }));
}

function startResizerRelay(event, hit) {
  let win = referenceFrame.contentWindow;
  let doc = referenceFrame.contentDocument;
  let element = doc && findResizerElement(doc, hit.targetId);
  if (!win || !element) return false;
  let rect = element.getBoundingClientRect();
  resizerRelay = {
    targetId: hit.targetId,
    element,
    originClientX: rect.left + rect.width / 2,
    originClientY: rect.top + rect.height / 2,
    startLabX: event.clientX,
    startLabY: event.clientY,
    lastClientX: rect.left + rect.width / 2,
    lastClientY: rect.top + rect.height / 2,
  };
  dispatchReferencePointer(win, element, 'pointerdown', resizerRelay.lastClientX, resizerRelay.lastClientY);
  return true;
}

function moveResizerRelay(event) {
  let win = referenceFrame.contentWindow;
  let doc = referenceFrame.contentDocument;
  if (!win || !doc || !resizerRelay) return;
  let frameRect = referenceFrame.getBoundingClientRect();
  let canvasRect = canvas.getBoundingClientRect();
  let factorX = frameRect.width / Math.max(canvasRect.width, 1);
  let factorY = frameRect.height / Math.max(canvasRect.height, 1);
  let deltaX = (event.clientX - resizerRelay.startLabX) * factorX;
  let deltaY = (event.clientY - resizerRelay.startLabY) * factorY;
  resizerRelay.lastClientX = resizerRelay.originClientX + deltaX;
  resizerRelay.lastClientY = resizerRelay.originClientY + deltaY;
  dispatchReferencePointer(win, doc, 'pointermove', resizerRelay.lastClientX, resizerRelay.lastClientY);
}

function endResizerRelay() {
  let win = referenceFrame.contentWindow;
  let doc = referenceFrame.contentDocument;
  if (win && doc && resizerRelay) {
    dispatchReferencePointer(win, doc, 'pointerup', resizerRelay.lastClientX, resizerRelay.lastClientY);
    lab.lastRelay = { intent: 'layout-resize', targetId: resizerRelay.targetId, relayed: true };
    resizerRelay = null;
    markReferenceDataChanged();
    return;
  }
  resizerRelay = null;
}

function onPointerMove(event) {
  if (resizerRelay) {
    moveResizerRelay(event);
    return;
  }
  if (dragState) {
    if (event.pointerId !== dragState.pointerId) return;
    let record = spatialDragController.moveDrag(currentPointerRay(event));
    let panelGroup = panelRenderer.getPanelObject(dragState.panelId);
    if (!record || !panelGroup) return;
    let localPosition = new THREE.Vector3(...record.position);
    panelRenderer.group.worldToLocal(localPosition);
    panelGroup.position.set(
      roundMetric(localPosition.x),
      roundMetric(localPosition.y),
      roundMetric(localPosition.z),
    );
    dragState.moved = true;
    return;
  }
  if (resizeState) {
    if (event.pointerId !== resizeState.pointerId) return;
    let handle = resizeState.handle;
    let dx = (event.clientX - resizeState.startClientX) / Math.max(canvas.clientWidth * 0.28, 1);
    let dy = (event.clientY - resizeState.startClientY) / Math.max(canvas.clientHeight * 0.28, 1);
    let nextX = resizeState.startSize[0] * (1 + (/east/i.test(handle) ? dx : -dx));
    let nextY = resizeState.startSize[1] * (1 + (/south/i.test(handle) ? dy : -dy));
    let next = [
      Math.max(resizeState.measuredSize[0] * 0.5, Math.min(resizeState.measuredSize[0] * 2.5, nextX)),
      Math.max(resizeState.measuredSize[1] * 0.5, Math.min(resizeState.measuredSize[1] * 2.5, nextY)),
    ];
    resizeState.previewSize = next;
    if (resizeState.responsiveRecord) {
      resizeState.responsiveRecord = {
        ...resizeState.responsiveRecord,
        context: updateResponsivePanelResizeTarget(
          resizeState.responsiveRecord.context,
          next,
        ),
      };
    }
    panelRenderer.previewPanelSize(resizeState.panelId, next);
    resizeState.moved = true;
    resize();
    return;
  }
  let picked = pickPanelHit(event);
  let hit = picked?.hit || null;
  lab.hovered = hit
    ? { panelId: hit.panelId, primitiveId: hit.primitiveId, actionId: hit.actionId, targetId: hit.targetId }
    : null;
  lab.lastNormalizedHit = picked?.point
    ? { panelId: picked.panelId, point: picked.point }
    : lab.lastNormalizedHit;
  panelRenderer.setHovered(hit?.primitiveId || null);
  canvas.style.cursor = hit
    ? (hit.actionId === 'resize-window'
        ? (/northEast|southWest/i.test(hit.handle) ? 'nesw-resize' : 'nwse-resize')
        : canStartWindowDrag(hit) ? 'grab' : hit.actionId === 'drag-resizer' ? 'col-resize' : 'pointer')
    : 'default';
  renderDiagnostics();
}

function onPointerDown(event) {
  let picked = pickPanelHit(event);
  if (picked?.hit?.actionId === 'drag-resizer' && lab.source === 'real-layout') {
    if (startResizerRelay(event, picked.hit)) {
      canvas.style.cursor = 'col-resize';
    }
    return;
  }
  if (picked?.hit?.actionId === 'resize-window') {
    let panel = compiledById.get(picked.panelId);
    let measuredPanel = measuredCompiled?.panels?.find((candidate) => candidate.id === picked.panelId);
    if (!panel || !measuredPanel) return;
    let responsiveRecord = lab.source === 'real-layout'
      ? createResponsiveResizeRecord(picked.panelId, panel.size)
      : null;
    resizeState = {
      panelId: picked.panelId,
      pointerId: event.pointerId,
      handle: picked.hit.handle,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startSize: [...panel.size],
      measuredSize: [...measuredPanel.size],
      previewSize: [...panel.size],
      responsiveRecord,
      moved: false,
    };
    canvas.setPointerCapture(event.pointerId);
    return;
  }
  if (canStartWindowDrag(picked?.hit)) {
    let panelGroup = panelRenderer.getPanelObject(picked.panelId);
    if (!panelGroup) return;
    panelGroup.updateWorldMatrix(true, false);
    let worldPosition = new THREE.Vector3();
    panelGroup.getWorldPosition(worldPosition);
    let record = spatialDragController.startDrag({
      id: picked.panelId,
      position: worldPosition.toArray(),
    }, currentPointerRay(event));
    if (!record) return;
    dragState = {
      panelId: picked.panelId,
      pointerId: event.pointerId,
      startPosition: panelGroup.position.toArray(),
      moved: false,
    };
    canvas.setPointerCapture(event.pointerId);
    canvas.style.cursor = 'grabbing';
  }
}

async function onPointerUp(event) {
  if (resizerRelay) {
    endResizerRelay();
    renderDiagnostics();
    return;
  }
  if (dragState && event.pointerId !== dragState.pointerId) return;
  if (resizeState) {
    if (event.pointerId !== resizeState.pointerId) return;
    let finished = resizeState;
    resizeState = null;
    if (canvas.hasPointerCapture(finished.pointerId)) {
      canvas.releasePointerCapture(finished.pointerId);
    }
    if (finished.moved) {
      await commitWindowSize(
        finished.panelId,
        finished.previewSize,
        finished.responsiveRecord,
      );
    } else {
      disposeResponsiveResizeRecord(finished.responsiveRecord);
      panelRenderer.cancelPanelSizePreview(finished.panelId);
    }
    lab.lastAction = {
      actionId: 'resize-window',
      panelId: finished.panelId,
      handle: finished.handle,
      size: [...(compiledById.get(finished.panelId)?.size || finished.previewSize)],
    };
    emitIntent({ type: 'panel-resize', ...lab.lastAction });
    if (referenceMutationPending) {
      referenceMutationPending = false;
      scheduleCapture();
    }
    renderDiagnostics();
    return;
  }
  let wasDragging = dragState;
  let endRecord = spatialDragController.endDrag();
  dragState = null;
  if (wasDragging && canvas.hasPointerCapture(wasDragging.pointerId)) {
    canvas.releasePointerCapture(wasDragging.pointerId);
  }
  canvas.style.cursor = 'default';
  if (wasDragging?.moved) {
    let panel = compiledById.get(wasDragging.panelId);
    let panelGroup = panelRenderer.getPanelObject(wasDragging.panelId);
    let base = panel && basePresentationPosition(panel);
    let offset = panelGroup && base
      ? [
          roundMetric(panelGroup.position.x - base[0]),
          roundMetric(panelGroup.position.y - base[1]),
          roundMetric(panelGroup.position.z - base[2]),
        ]
      : [0, 0, 0];
    windowDragOffsets.set(wasDragging.panelId, offset);
    emitIntent({ type: 'panel-drag', panelId: wasDragging.panelId });
    lab.lastAction = {
      actionId: 'drag-panel',
      panelId: wasDragging.panelId,
      targetId: wasDragging.panelId,
      position: endRecord?.position || null,
      offset,
    };
    renderDiagnostics();
    return;
  }
  let picked = pickPanelHit(event);
  let hit = picked?.hit || null;
  if (!hit) return;
  if (hit.actionId?.startsWith('window-')) {
    let action = hit.actionId.slice('window-'.length);
    let group = panelRenderer.getPanelObject(hit.panelId);
    if (action === 'reset') {
      windowDragOffsets.delete(hit.panelId);
      windowSizeOverrides.delete(hit.panelId);
      remountCommittedWindows();
    } else if (action === 'fullscreen') {
      let measured = measuredCompiled.panels.find((panel) => panel.id === hit.panelId);
      let current = compiledById.get(hit.panelId);
      let expanded = current.size[0] > measured.size[0] * 1.4;
      let next = expanded
        ? [...measured.size]
        : measured.size.map((value) => roundMetric(value * 1.65));
      await commitWindowSize(hit.panelId, next);
    } else if (action === 'pin' && group) {
      group.userData.pinned = !group.userData.pinned;
      if (group.userData.pinned) {
        pinnedWindows.add(hit.panelId);
      } else {
        pinnedWindows.delete(hit.panelId);
      }
      panelRenderer.refreshPanelChrome(hit.panelId);
    } else if (action === 'close' && group) {
      closedWindows.add(hit.panelId);
      group.visible = false;
    }
    lab.lastAction = { actionId: hit.actionId, panelId: hit.panelId };
    emitIntent({ type: 'window-action', ...lab.lastAction });
    renderDiagnostics();
    return;
  }
  if (hit.actionId === 'drag-resizer') return;
  if (hit.actionId === 'select-row' || hit.actionId === 'select-node' || hit.actionId === 'toggle-row') {
    lab.selected = {
      panelId: hit.panelId,
      primitiveId: hit.primitiveId,
      actionId: hit.actionId,
      targetId: hit.targetId,
    };
    panelRenderer.setSelected(hit.primitiveId);
    emitIntent({ type: 'select', ...lab.selected, point: hit.point });
  } else if (hit.actionId !== 'drag-panel') {
    lab.lastAction = {
      actionId: hit.actionId,
      panelId: hit.panelId,
      targetId: hit.targetId,
      point: hit.point,
    };
    emitIntent({ type: 'action', ...lab.lastAction });
  }
  if (lab.source === 'real-layout') {
    relayRealAction(hit);
  }
  renderDiagnostics();
}

function cancelPointerDrag(event) {
  if (resizeState && (event.pointerId === undefined || event.pointerId === resizeState.pointerId)) {
    let cancelledResize = resizeState;
    resizeState = null;
    disposeResponsiveResizeRecord(cancelledResize.responsiveRecord);
    panelRenderer.cancelPanelSizePreview(cancelledResize.panelId);
    if (canvas.hasPointerCapture(cancelledResize.pointerId)) {
      canvas.releasePointerCapture(cancelledResize.pointerId);
    }
    if (referenceMutationPending) {
      referenceMutationPending = false;
      scheduleCapture();
    }
    return;
  }
  if (!dragState || (event.pointerId !== undefined && event.pointerId !== dragState.pointerId)) return;
  let cancelled = dragState;
  let panelGroup = panelRenderer.getPanelObject(cancelled.panelId);
  if (panelGroup) panelGroup.position.set(...cancelled.startPosition);
  spatialDragController.cancelDrag();
  dragState = null;
  if (canvas.hasPointerCapture(cancelled.pointerId)) {
    canvas.releasePointerCapture(cancelled.pointerId);
  }
  canvas.style.cursor = 'default';
  lab.lastAction = { actionId: 'cancel-panel-drag', panelId: cancelled.panelId };
  renderDiagnostics();
}

function bindPointer() {
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointercancel', cancelPointerDrag);
  canvas.addEventListener('lostpointercapture', cancelPointerDrag);
  canvas.addEventListener('pointerleave', () => {
    if (dragState || resizeState || resizerRelay) return;
    lab.hovered = null;
    panelRenderer.setHovered(null);
    renderDiagnostics();
  });
}

function bindControls() {
  sourceSelect.addEventListener('change', () => setSource(sourceSelect.value));
  cameraSelect.addEventListener('change', () => setCamera(cameraSelect.value));
  themeSelect.addEventListener('change', () => setTheme(themeSelect.value));
  explodeInput.addEventListener('input', () => setLayerExplode(Number(explodeInput.value)));
  windowGapInput.addEventListener('input', () => setWindowGap(Number(windowGapInput.value)));
  resetWindowsButton.addEventListener('click', resetWindowPositions);
}

function getReport() {
  let rendererDiagnostics = panelRenderer ? panelRenderer.getDiagnostics() : null;
  return {
    ready: lab.ready,
    status: lab.status,
    source: lab.source,
    cameraMode: lab.cameraMode,
    windowGap: lab.windowGap,
    windowOffsets: Object.fromEntries(
      [...windowDragOffsets].map(([panelId, offset]) => [panelId, [...offset]]),
    ),
    windowSizes: Object.fromEntries(
      [...windowSizeOverrides].map(([panelId, size]) => [panelId, [...size]]),
    ),
    windows: windowDiagnostics(),
    themeRevision: lab.themeRevision,
    dataRevision: lab.dataRevision,
    responsiveCapture: lab.responsiveCapture,
    threeRevision: lab.threeRevision,
    threeRuntimeRevision: THREE.REVISION || null,
    counts: lab.counts,
    deterministic: lab.deterministic,
    parity: lab.parity,
    hovered: lab.hovered,
    selected: lab.selected,
    lastAction: lab.lastAction,
    lastRelay: lab.lastRelay,
    lastNormalizedHit: lab.lastNormalizedHit,
    rendererInfo: lab.rendererInfo,
    unsupportedColors: [...lab.unsupportedColors],
    fontReadiness: lab.fontReadiness,
    appearanceRefresh: lab.appearanceRefresh,
    textQuality: panelRenderer ? panelRenderer.getTextQualityReport() : null,
    identity: {
      ...lab.identity,
      builds: rendererDiagnostics?.builds ?? lab.identity.builds,
      themeUpdates: rendererDiagnostics?.themeUpdates ?? lab.identity.themeUpdates,
    },
    renderer: rendererDiagnostics,
    errors: [...lab.errors],
  };
}

function renderDiagnostics() {
  diagnosticsEl.textContent = JSON.stringify(getReport(), null, 2);
}

function cleanup() {
  disposeResponsiveResizeRecord(resizeState?.responsiveRecord);
  responsiveCommitToken += 1;
  referenceMutationObserver?.disconnect();
  clearTimeout(referenceMutationTimer);
  renderer.setAnimationLoop(null);
  clearInterval(diagnosticsTimer);
  panelRenderer.dispose();
  renderer.dispose();
}

boot();
