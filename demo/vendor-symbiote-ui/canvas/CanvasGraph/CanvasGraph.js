import Symbiote from '@symbiotejs/symbiote';
import { ForceLayout } from '../ForceLayout.js';
import { createCanvasGraphStore } from '../graph-model.js';
import {
  findForceNodeGroup,
  getForceLayoutOptions,
  normalizeForceGroups,
} from '../graph-layout.js';
import css from './CanvasGraph.css.js';
import {
  DOT_RADIUS,
  HIT_RADIUS,
  DEFAULT_ACTIVE_NODE_SCALE,
  DEFAULT_INFO_PANEL_SCALE,
  getCanvasNodeScreenHit,
  getGroupOrbitMetrics,
  getLayerTransform,
  getNodeHitRadius,
  getNodeColor,
  getNodeRadius,
  getNodeWeight,
  getRadialMenuHit,
  getRadialMenuLayout,
  normalizeCanvasGraphScale,
  resolveCanvasGraphInfoPanelMetrics,
} from './CanvasGraphGeometry.js';
import { GRAPH_TYPE_COLOR_TOKENS } from '../../graph/theme-contract.js';
import {
  CANVAS_GRAPH_LAYER_TARGETS,
  CANVAS_GRAPH_RENDER_SNAPSHOT_KIND,
  CANVAS_GRAPH_RENDER_SNAPSHOT_VERSION,
  normalizeCanvasGraphRenderSnapshot,
  findActiveTransitionMarker,
  getDepthGroupsFrame,
  getLayerAnimationFrame,
  getNextPulseQueue,
  resolveCanvasGraphFrameContext,
  resolveCanvasGraphFrameEase,
  resolveGroupOrbitRotationFrame,
  resolveCanvasGraphEdgeFocus,
  resolveDeactivationFrame,
  resolveFocusFrame,
  resolveIdleFrame,
  resolveViewportAnimation,
} from './CanvasGraphDrawState.js';
import {
  MAX_CANVAS_GRAPH_ZOOM,
  MIN_CANVAS_GRAPH_ZOOM,
  resolveCanvasGraphCameraArc,
  resolveCanvasGraphMinZoom,
  resolveCanvasGraphTransitionDuration,
  resolveCanvasGraphTransitionProgress,
  resolveCanvasGraphViewportFit,
  resolveFitPadding,
  resolveFrameFitZoom,
  viewportToCameraCenter,
} from './CanvasGraphViewport.js';
import { resolveWheelZoomFactor } from '../../interactions/Zoom.js';
import { renderNow } from '../../core/render-clock.js';
import {
  CanvasGraphMediaImages,
  getCanvasGraphNodeMedia,
  drawCanvasGraphNodeMedia,
} from '../canvas-graph-media.js';

const DEFAULT_EVENT_NAMES = Object.freeze({
  fileSelected: 'file-selected',
  groupSelected: 'group-selected',
  layoutDone: 'layout-done',
  layoutSnapshot: 'layout-snapshot',
  layoutTick: 'layout-tick',
  nodeDeselected: 'node-deselected',
  orientationParallaxStatus: 'orientation-parallax-status',
  pathChanged: 'path-changed',
  toolbarAction: 'toolbar-action',
});

const DEFAULT_MENU_ITEMS = Object.freeze([
  { action: 'drill', label: 'Enter Group', path: 'M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z' },
  { action: 'explore', label: 'Explore', path: 'M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z' },
  { action: 'view-code', label: 'View Code', path: 'M9.4 16.6L4.8 12l4.6-4.6L8 6l-6 6 6 6 1.4-1.4zm5.2 0L19.2 12l-4.6-4.6L16 6l6 6-6 6-1.4-1.4z' },
]);

const INCREMENTAL_LAYOUT_INITIAL_ALPHA = 0.045;
const SEEDED_LAYOUT_INITIAL_ALPHA = 0.22;
const NODE_APPEARANCE_START_SCALE = 0.2;
const ENTERING_LAYOUT_SIZE_SCALE = 0.18;
const ENTERING_LAYOUT_SIZE_WARMUP_TICKS = 72;
const DEFAULT_CANVAS_GRAPH_FOCUS_ZOOM = 1.6;
const MAX_CANVAS_GRAPH_FOCUS_ZOOM = 2.4;

function normalizeFocusNodeIds(nodeIds) {
  let ids = Array.isArray(nodeIds) ? nodeIds : [nodeIds];
  let normalized = [];
  let seen = new Set();
  for (let id of ids) {
    let normalizedId = String(id || '').trim();
    if (!normalizedId || seen.has(normalizedId)) continue;
    seen.add(normalizedId);
    normalized.push(normalizedId);
  }
  return normalized;
}

function stableUnit(value) {
  let text = String(value || '');
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return ((hash >>> 0) % 10000) / 10000;
}

function averageCanvasPoints(points) {
  let valid = points.filter((point) => Number.isFinite(point?.x) && Number.isFinite(point?.y));
  if (valid.length === 0) return null;
  let x = 0;
  let y = 0;
  for (const point of valid) {
    x += point.x;
    y += point.y;
  }
  return { x: x / valid.length, y: y / valid.length };
}

function getEnteringNodeSeedOffset(id, index = 0, count = 1) {
  let angle = stableUnit(`${id}:angle`) * Math.PI * 2;
  let ring = 30 + Math.sqrt(index + 1) * 10 + stableUnit(`${id}:radius`) * 24;
  if (count > 4) ring += Math.min(24, count * 2);
  return {
    x: Math.cos(angle) * ring,
    y: Math.sin(angle) * ring,
  };
}

function getPointerDistance(a, b) {
  return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
}

function getPointerCenter(a, b) {
  return {
    x: (a.clientX + b.clientX) / 2,
    y: (a.clientY + b.clientY) / 2,
  };
}

function toRgba(rgb, alpha = 1) {
  return `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${alpha})`;
}

const CANVAS_GRAPH_ANIMATING_STATUSES = new Set([
  'loading',
  'pending',
  'queued',
  'running',
  'streaming',
  'waiting',
]);

const CANVAS_GRAPH_DONE_STATUSES = new Set([
  'complete',
  'completed',
  'done',
  'ready',
  'success',
]);

const CANVAS_GRAPH_ERROR_STATUSES = new Set([
  'error',
  'failed',
  'failure',
  'fallback',
  'rejected',
]);

function normalizeCanvasGraphStatus(value) {
  return String(value ?? '').trim().toLowerCase();
}

function getCanvasGraphNodeStatus(node) {
  return normalizeCanvasGraphStatus(node?.state?.status ?? node?.params?.status ?? node?.status);
}

function isCanvasGraphAnimatingStatus(status) {
  return CANVAS_GRAPH_ANIMATING_STATUSES.has(normalizeCanvasGraphStatus(status));
}

function normalizeCanvasGraphIcon(value) {
  return String(value ?? '').trim().toLowerCase().replace(/[\s-]+/g, '_');
}

function getCanvasGraphNodeIcon(node) {
  let icon = normalizeCanvasGraphIcon(
    node?.icon
      ?? node?.design?.canvas?.icon
      ?? node?.design?.icon
      ?? node?.params?.icon
      ?? node?.params?.agentIcon
  );
  if (icon) return icon;

  let type = normalizeCanvasGraphIcon(node?.type || node?.kind || '');
  if (type.includes('agent')) return 'smart_toy';
  if (type.includes('goal')) return 'track_changes';
  if (type.includes('tool')) return 'build';
  if (type.includes('file')) return 'description';
  if (type.includes('parallel')) return 'sync';
  if (type.includes('merge')) return 'merge';
  if (type.includes('prompt') || type.includes('response') || type.includes('message')) return 'chat';
  if (type.includes('fallback')) return 'sync_problem';
  return '';
}

function getCanvasGraphReadableIconRgb(rgb) {
  let luminance = (rgb[0] * 0.299) + (rgb[1] * 0.587) + (rgb[2] * 0.114);
  return luminance > 150 ? [20, 24, 32] : [248, 250, 252];
}

function drawCanvasGraphCircle(ctx, x, y, r) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

function strokeCanvasGraphRoundRect(ctx, x, y, w, h, r) {
  let radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.stroke();
}

function drawCanvasGraphHubIcon(ctx, size) {
  let nodes = [
    [0, -0.38],
    [0.36, -0.12],
    [0.22, 0.34],
    [-0.22, 0.34],
    [-0.36, -0.12],
  ];
  ctx.beginPath();
  for (let [x, y] of nodes) {
    ctx.moveTo(0, 0);
    ctx.lineTo(x * size, y * size);
  }
  ctx.stroke();
  drawCanvasGraphCircle(ctx, 0, 0, size * 0.12);
  for (let [x, y] of nodes) drawCanvasGraphCircle(ctx, x * size, y * size, size * 0.09);
}

function drawCanvasGraphBubbleIcon(ctx, size) {
  strokeCanvasGraphRoundRect(ctx, -size * 0.38, -size * 0.28, size * 0.76, size * 0.5, size * 0.12);
  ctx.beginPath();
  ctx.moveTo(-size * 0.08, size * 0.22);
  ctx.lineTo(-size * 0.22, size * 0.38);
  ctx.lineTo(size * 0.08, size * 0.24);
  ctx.stroke();
}

function drawCanvasGraphFileIcon(ctx, size) {
  ctx.beginPath();
  ctx.moveTo(-size * 0.28, -size * 0.42);
  ctx.lineTo(size * 0.12, -size * 0.42);
  ctx.lineTo(size * 0.34, -size * 0.2);
  ctx.lineTo(size * 0.34, size * 0.42);
  ctx.lineTo(-size * 0.28, size * 0.42);
  ctx.closePath();
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(size * 0.12, -size * 0.42);
  ctx.lineTo(size * 0.12, -size * 0.2);
  ctx.lineTo(size * 0.34, -size * 0.2);
  ctx.moveTo(-size * 0.12, size * 0.02);
  ctx.lineTo(size * 0.16, size * 0.02);
  ctx.moveTo(-size * 0.12, size * 0.18);
  ctx.lineTo(size * 0.16, size * 0.18);
  ctx.stroke();
}

function drawCanvasGraphCheckListIcon(ctx, size) {
  for (let index = 0; index < 3; index++) {
    let y = -size * 0.26 + index * size * 0.26;
    ctx.beginPath();
    ctx.moveTo(-size * 0.42, y);
    ctx.lineTo(-size * 0.34, y + size * 0.08);
    ctx.lineTo(-size * 0.2, y - size * 0.08);
    ctx.moveTo(-size * 0.05, y);
    ctx.lineTo(size * 0.4, y);
    ctx.stroke();
  }
}

function drawCanvasGraphToolIcon(ctx, size) {
  ctx.beginPath();
  ctx.moveTo(-size * 0.32, size * 0.34);
  ctx.lineTo(size * 0.18, -size * 0.16);
  ctx.moveTo(size * 0.12, -size * 0.38);
  ctx.lineTo(size * 0.34, -size * 0.16);
  ctx.lineTo(size * 0.16, size * 0.02);
  ctx.lineTo(-size * 0.06, -size * 0.2);
  ctx.stroke();
}

function drawCanvasGraphBugIcon(ctx, size) {
  strokeCanvasGraphRoundRect(ctx, -size * 0.22, -size * 0.24, size * 0.44, size * 0.54, size * 0.18);
  ctx.beginPath();
  ctx.moveTo(-size * 0.22, -size * 0.02);
  ctx.lineTo(-size * 0.42, -size * 0.12);
  ctx.moveTo(-size * 0.22, size * 0.12);
  ctx.lineTo(-size * 0.44, size * 0.16);
  ctx.moveTo(size * 0.22, -size * 0.02);
  ctx.lineTo(size * 0.42, -size * 0.12);
  ctx.moveTo(size * 0.22, size * 0.12);
  ctx.lineTo(size * 0.44, size * 0.16);
  ctx.moveTo(-size * 0.12, -size * 0.24);
  ctx.lineTo(-size * 0.22, -size * 0.42);
  ctx.moveTo(size * 0.12, -size * 0.24);
  ctx.lineTo(size * 0.22, -size * 0.42);
  ctx.stroke();
}

function drawCanvasGraphPaletteIcon(ctx, size) {
  ctx.beginPath();
  ctx.arc(0, 0, size * 0.4, -Math.PI * 0.2, Math.PI * 1.65);
  ctx.quadraticCurveTo(size * 0.12, size * 0.48, size * 0.18, size * 0.18);
  ctx.stroke();
  drawCanvasGraphCircle(ctx, -size * 0.16, -size * 0.14, size * 0.05);
  drawCanvasGraphCircle(ctx, size * 0.04, -size * 0.22, size * 0.05);
  drawCanvasGraphCircle(ctx, size * 0.2, -size * 0.02, size * 0.05);
}

function drawCanvasGraphTerminalIcon(ctx, size) {
  strokeCanvasGraphRoundRect(ctx, -size * 0.42, -size * 0.28, size * 0.84, size * 0.56, size * 0.08);
  ctx.beginPath();
  ctx.moveTo(-size * 0.26, -size * 0.08);
  ctx.lineTo(-size * 0.12, size * 0.02);
  ctx.lineTo(-size * 0.26, size * 0.12);
  ctx.moveTo(-size * 0.02, size * 0.14);
  ctx.lineTo(size * 0.22, size * 0.14);
  ctx.stroke();
}

function drawCanvasGraphTargetIcon(ctx, size) {
  ctx.beginPath();
  ctx.arc(0, 0, size * 0.36, 0, Math.PI * 2);
  ctx.arc(0, 0, size * 0.2, 0, Math.PI * 2);
  ctx.moveTo(size * 0.02, -size * 0.02);
  ctx.lineTo(size * 0.42, -size * 0.42);
  ctx.moveTo(size * 0.42, -size * 0.42);
  ctx.lineTo(size * 0.3, -size * 0.4);
  ctx.moveTo(size * 0.42, -size * 0.42);
  ctx.lineTo(size * 0.4, -size * 0.3);
  ctx.stroke();
}

function drawCanvasGraphSyncIcon(ctx, size) {
  ctx.beginPath();
  ctx.arc(0, 0, size * 0.32, -Math.PI * 0.05, Math.PI * 1.05);
  ctx.arc(0, 0, size * 0.32, Math.PI * 0.95, Math.PI * 2.05);
  ctx.moveTo(size * 0.34, -size * 0.1);
  ctx.lineTo(size * 0.48, -size * 0.02);
  ctx.lineTo(size * 0.36, size * 0.1);
  ctx.moveTo(-size * 0.34, size * 0.1);
  ctx.lineTo(-size * 0.48, size * 0.02);
  ctx.lineTo(-size * 0.36, -size * 0.1);
  ctx.stroke();
}

function drawCanvasGraphMergeIcon(ctx, size) {
  ctx.beginPath();
  ctx.moveTo(-size * 0.38, -size * 0.3);
  ctx.quadraticCurveTo(-size * 0.1, -size * 0.12, size * 0.2, 0);
  ctx.moveTo(-size * 0.38, size * 0.3);
  ctx.quadraticCurveTo(-size * 0.1, size * 0.12, size * 0.2, 0);
  ctx.moveTo(size * 0.2, 0);
  ctx.lineTo(size * 0.42, 0);
  ctx.lineTo(size * 0.32, -size * 0.1);
  ctx.moveTo(size * 0.42, 0);
  ctx.lineTo(size * 0.32, size * 0.1);
  ctx.stroke();
}

function drawCanvasGraphRobotIcon(ctx, size) {
  strokeCanvasGraphRoundRect(ctx, -size * 0.34, -size * 0.24, size * 0.68, size * 0.5, size * 0.12);
  drawCanvasGraphCircle(ctx, -size * 0.14, -size * 0.02, size * 0.04);
  drawCanvasGraphCircle(ctx, size * 0.14, -size * 0.02, size * 0.04);
  ctx.beginPath();
  ctx.moveTo(-size * 0.14, size * 0.14);
  ctx.lineTo(size * 0.14, size * 0.14);
  ctx.moveTo(0, -size * 0.24);
  ctx.lineTo(0, -size * 0.42);
  ctx.stroke();
}

function drawCanvasGraphIcon(ctx, icon, x, y, size, color, alpha = 1) {
  if (!icon || size <= 0 || alpha <= 0) return;
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.translate(x, y);
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = Math.max(1, size * 0.11);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  switch (normalizeCanvasGraphIcon(icon)) {
    case 'account_tree':
    case 'dns':
    case 'hub':
      drawCanvasGraphHubIcon(ctx, size);
      break;
    case 'rate_review':
    case 'chat':
    case 'comment':
    case 'forum':
      drawCanvasGraphBubbleIcon(ctx, size);
      break;
    case 'description':
    case 'file':
    case 'article':
      drawCanvasGraphFileIcon(ctx, size);
      break;
    case 'checklist':
    case 'task_alt':
      drawCanvasGraphCheckListIcon(ctx, size);
      break;
    case 'build':
    case 'construction':
    case 'extension':
      drawCanvasGraphToolIcon(ctx, size);
      break;
    case 'bug_report':
      drawCanvasGraphBugIcon(ctx, size);
      break;
    case 'palette':
      drawCanvasGraphPaletteIcon(ctx, size);
      break;
    case 'terminal':
      drawCanvasGraphTerminalIcon(ctx, size);
      break;
    case 'track_changes':
      drawCanvasGraphTargetIcon(ctx, size);
      break;
    case 'merge':
    case 'call_merge':
      drawCanvasGraphMergeIcon(ctx, size);
      break;
    case 'sync':
    case 'pending':
    case 'hourglass_empty':
      drawCanvasGraphSyncIcon(ctx, size);
      break;
    case 'smart_toy':
      drawCanvasGraphRobotIcon(ctx, size);
      break;
    case 'sync_problem':
    case 'error':
      ctx.beginPath();
      ctx.moveTo(-size * 0.28, -size * 0.28);
      ctx.lineTo(size * 0.28, size * 0.28);
      ctx.moveTo(size * 0.28, -size * 0.28);
      ctx.lineTo(-size * 0.28, size * 0.28);
      ctx.stroke();
      break;
    default:
      drawCanvasGraphCircle(ctx, 0, 0, size * 0.1);
      ctx.beginPath();
      ctx.arc(0, 0, size * 0.34, 0, Math.PI * 2);
      ctx.stroke();
      break;
  }
  ctx.restore();
}

function parseCssRgb(value) {
  let match = String(value || '').match(/rgba?\(([^)]+)\)/i);
  if (!match) return null;
  let parts = match[1].split(',').slice(0, 3).map((part) => Number.parseFloat(part));
  return parts.every(Number.isFinite) ? parts.map((part) => Math.max(0, Math.min(255, Math.round(part)))) : null;
}

function resolveCanvasColor(value, fallback) {
  if (!value || typeof document === 'undefined') return fallback;
  let ctx = resolveCanvasColor.ctx || document.createElement('canvas').getContext('2d');
  resolveCanvasColor.ctx = ctx;
  ctx.fillStyle = 'rgb(1, 2, 3)';
  ctx.fillStyle = value;
  let normalized = ctx.fillStyle;
  if (normalized === 'rgb(1, 2, 3)' || normalized === '#010203') return fallback;
  if (normalized.startsWith('#')) {
    let hex = normalized.slice(1);
    if (hex.length === 3) hex = hex.split('').map((part) => part + part).join('');
    if (/^[0-9a-f]{6}$/i.test(hex)) {
      return [
        Number.parseInt(hex.slice(0, 2), 16),
        Number.parseInt(hex.slice(2, 4), 16),
        Number.parseInt(hex.slice(4, 6), 16),
      ];
    }
  }
  return parseCssRgb(normalized) || fallback;
}

function resolveCssVars(source, value, seen = new Set()) {
  return String(value || '').replace(/var\(\s*(--[\w-]+)\s*\)/g, (_, token) => {
    if (seen.has(token)) return '';
    seen.add(token);
    let nextValue = getComputedStyle(source).getPropertyValue(token).trim();
    return resolveCssVars(source, nextValue, seen);
  });
}

function readThemeRgb(source, token, fallback) {
  let value = resolveCssVars(source, getComputedStyle(source).getPropertyValue(token).trim());
  return resolveCanvasColor(value, fallback);
}

function readThemeRgbAny(source, tokens, fallback) {
  for (let token of tokens) {
    let value = getComputedStyle(source).getPropertyValue(token).trim();
    if (!value) continue;
    let resolved = resolveCanvasColor(resolveCssVars(source, value), null);
    if (resolved) return resolved;
  }
  return fallback;
}

function scheduleFrame(callback) {
  if (typeof globalThis.requestAnimationFrame === 'function') {
    let id = globalThis.requestAnimationFrame(callback);
    return () => globalThis.cancelAnimationFrame?.(id);
  }
  let id = setTimeout(callback, 0);
  return () => clearTimeout(id);
}

const DEFAULT_VIEWPORT_EASE = 0.15;

function normalizeViewportEase(value, fallback = DEFAULT_VIEWPORT_EASE) {
  return Math.max(0.015, Math.min(0.35, Number.isFinite(value) ? value : fallback));
}

function clampTransitionProgress(value) {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}

function getTransitionRouteLength(points = []) {
  let distance = 0;
  for (let index = 1; index < points.length; index++) {
    distance += Math.hypot(
      points[index].x - points[index - 1].x,
      points[index].y - points[index - 1].y
    );
  }
  return distance;
}

function normalizeFitViewArgs(padding, animate) {
  if (padding && typeof padding === 'object') {
    return {
      padding: Number.isFinite(padding.padding) ? padding.padding : 60,
      animate: padding.animate !== false,
      maxZoom: Number.isFinite(padding.maxZoom) ? padding.maxZoom : 2,
      minZoom: Number.isFinite(padding.minZoom) ? padding.minZoom : MIN_CANVAS_GRAPH_ZOOM,
      viewportEase: normalizeViewportEase(padding.viewportEase),
    };
  }
  return {
    padding: Number.isFinite(padding) ? padding : 60,
    animate: animate !== false,
    maxZoom: 2,
    minZoom: MIN_CANVAS_GRAPH_ZOOM,
    viewportEase: DEFAULT_VIEWPORT_EASE,
  };
}

function sanitizeForceLayoutOptions(options = {}) {
  const algorithm = options?.layoutAlgorithm;
  const allowed = new Set([
    'chargeStrength',
    'linkDistance',
    'linkStrength',
    'centerStrength',
    'velocityDecay',
    'collideStrength',
    'alphaDecay',
    'alphaFloor',
    'alphaTarget',
    'brownian',
    'brownianThresh',
    'pinReheat',
    'pinCap',
    'groupDistance',
    'groupStrength',
    'wellStrength',
    'centerPull',
    'wellRepulsion',
    'crossLinkScale',
    'crystalStrength',
    'crystalRingDistance',
    'crystalSpokes',
    'crystalAngleJitter',
  ]);
  let normalized = {};
  if (options?.mode === 'converge' || options?.mode === 'continuous') {
    normalized.mode = options.mode;
  }
  if (algorithm === 'spring' || algorithm === 'organic' || algorithm === 'oil-cloud' || algorithm === 'crystal') {
    normalized.layoutAlgorithm = algorithm;
  }
  for (const [key, value] of Object.entries(options || {})) {
    if (!allowed.has(key) || !Number.isFinite(value)) continue;
    normalized[key] = value;
  }
  return normalized;
}

export class CanvasGraph extends Symbiote {
  static observedAttributes = ['active-node-scale', 'info-panel-scale'];

  init$ = {
    // These defaults will be updated from external controller if needed
    chargeStrength: -150,
    linkDistance: 150,
    linkStrength: 0.25,
    centerStrength: 0,
    velocityDecay: 0.92,
    collideStrength: 1.0,
    alphaDecay: 0.015,
    theta: 0.7,
    alphaFloor: 0.0001,
    alphaTarget: 0.0001,
    brownian: 0,
    brownianThresh: 0.001,
    pinReheat: 0.02,
    pinCap: 0.08,
    groupDistance: 120,
    groupStrength: 0.05,
    wellStrength: 0.8,
    centerPull: 0.3,
    wellRepulsion: 5.0,
    crossLinkScale: 0.2,
    activeNodeScale: DEFAULT_ACTIVE_NODE_SCALE,
    infoPanelScale: DEFAULT_INFO_PANEL_SCALE,
  };

  _bgR = 15;
  _bgG = 23;
  _bgB = 42;
  _bgRgb = [26, 26, 26];
  _edgeRgb = [74, 158, 255];
  _pulseRgb = [76, 139, 245];
  _dangerRgb = [244, 67, 54];
  _textRgb = [240, 240, 240];
  _textDimRgb = [153, 153, 153];
  _panelBgRgb = [34, 34, 34];
  _panelBorderRgb = [74, 158, 255];
  _menuIconRgb = [26, 26, 26];
  _ghostRgb = [51, 51, 51];
  _typeColorRgb = {};
  _ghostColor = 'rgb(51,51,51)';

  attributeChangedCallback(name, oldValue, newValue) {
    if (oldValue === newValue) return;
    if (name === 'active-node-scale' || name === 'info-panel-scale') {
      this.needsDraw = true;
      this._wakeLoop?.();
      return;
    }
    super.attributeChangedCallback?.(name, oldValue, newValue);
  }

  initCallback() {
    this.eventNames = { ...DEFAULT_EVENT_NAMES, ...this.eventNames };
    this.actionItems = Array.isArray(this.actionItems) ? this.actionItems : [...DEFAULT_MENU_ITEMS];
    this.semanticPathPrefix = typeof this.semanticPathPrefix === 'string' ? this.semanticPathPrefix : 'cluster:';

    this.nodes = [];
    this.edges = [];
    this.nodeMap = new Map();
    this.adjMap = new Map();
    this.interactionDepths = new Map();
    this.nodePositions = new Map();

    this.worker = null;
    this.paused = false;
    this.dragNode = null;
    this.activeNode = null;
    this.hoverNode = null;
    this._hoverAction = '';
    this.nextActiveNode = null;
    this.deactivating = false;
    this._transitionMarkers = [];
    this.menuAnim = 0;
    this.dragOffset = { x: 0, y: 0 };
    this.renderMode = 'dots';

    this.focusX = 0;
    this.focusY = 0;
    this.focusActive = false;

    this.panX = 0;
    this.panY = 0;
    this.zoom = 0.5;
    this._targetZoom = 0.5;
    this._targetPanX = null;  // null = no animation target
    this._targetPanY = null;
    this._zoomAnchor = null;  // {mx, my} — screen point to keep stable during zoom
    this._viewportEase = DEFAULT_VIEWPORT_EASE;
    this.isPanning = false;
    this.panStart = { x: 0, y: 0, px: 0, py: 0 };

    this.frameCount = 0;
    this.tickCount = 0;
    this._lastRenderTime = null;
    this.lastFpsTime = performance.now();
    this.lastAlpha = 0;

    this.smoothPositions = new Map();
    this.prevPositions = new Map();
    this.smoothing = 0.99;

    this.graphDB = { nodes: new Map(), edges: [], rootNodes: [] };
    this.currentGroupId = null;
    this._loopRunning = false;  // Whether the rAF draw loop is active
    this._idleFrames = 0;      // Count consecutive frames with no visual change
    this._prevDragDeltaX = 0;  // Previous frame's focus drag delta X
    this._prevDragDeltaY = 0;  // Previous frame's focus drag delta Y
    this._visualDragDeltaX = 0;
    this._visualDragDeltaY = 0;
    this._dragWorldTransform = null;
    this._activePointers = new Map();
    this._pinchGesture = null;
    this._pinchPointerIds = new Set();
    this._focusExitOnDown = false;
    this._orientationParallaxEnabled = false;
    this._orientationParallaxX = 0;
    this._orientationParallaxY = 0;
    this._orientationParallaxTargetX = 0;
    this._orientationParallaxTargetY = 0;
    this._orientationParallaxCleanup = null;
    this._orientationParallaxStatus = { supported: null, enabled: false, reason: 'idle' };
    this._orientationParallaxAutoPending = false;
    this._orientationParallaxAutoSettled = false;
    this._layoutSnapshot = null;
    this._forceLayoutOverrides = {};
    this._nodeAppearances = new Map();
    this._mediaImages = new CanvasGraphMediaImages(() => this._wakeLoop());
    this._layoutWarmupIds = new Set();
    this._layoutPreserveIds = new Set();
    this._workerGeneration = 0;
    this._themeSyncQueued = false;
    this._cancelThemeSync = null;
    this._layoutSuspended = false;
    this._layoutSuspendReason = '';
    this.layoutSettled = false;
    this._inDraw = false;
    this._externalFrameDrive = false;

    // Info panel state (typewriter HUD to the right of active node)
    this._infoPanel = {
      nodeId: null,
      lines: [],
      opacity: 0,
      startTime: 0,
      totalExtent: 0,
      totalExtentY: 0,
      _centeredForNode: null,  // Track which node we've centered for
    };

    this.breadcrumb = document.createElement('graph-breadcrumb');
    this.appendChild(this.breadcrumb);

    this.canvas = document.createElement('canvas');
    this.appendChild(this.canvas);
    this.ctx = this.canvas.getContext('2d');

    this.offscreenCanvases = {};
    for (let i = 1; i <= 4; i++) {
      const oc = document.createElement('canvas');
      this.offscreenCanvases[i] = { canvas: oc, ctx: oc.getContext('2d', { alpha: true }) };
    }

    this.layerAnim = {
      0: { scale: 1, opacity: 1, parallax: 0 },
      1: { scale: 1, opacity: 1, parallax: 0 },
      2: { scale: 1, opacity: 1, parallax: 0 },
      3: { scale: 1, opacity: 1, parallax: 0 },
      4: { scale: 1, opacity: 1, parallax: 0 }
    };

    this.LAYER_TARGETS = CANVAS_GRAPH_LAYER_TARGETS;

    this.depthGroups = {
      0: { edges: [], nodes: [] },
      1: { edges: [], nodes: [] },
      2: { edges: [], nodes: [] },
      3: { edges: [], nodes: [] },
      4: { edges: [], nodes: [] }
    };

    const resizeObserver = new ResizeObserver(() => this.resizeCanvas());
    resizeObserver.observe(this);
    this.resizeCanvas();

    this.bindEvents();
    this._bindThemeSync();

    this._wakeLoop();

    // Bind graph-breadcrumb from symbiote-ui
    if (this.breadcrumb?.onNavigate) {
      this.breadcrumb.onNavigate((levelStr) => {
        // levelStr is the path string we passed into 'level' property
        this.setPath(levelStr || null);
      });
    }

    this._scheduleCanvasThemeSync();
  }

  disconnectedCallback() {
    if (this._layoutSuspendReason === 'layout-move') return;
    this._loopRunning = false;
    if (this._animationFrame) cancelAnimationFrame(this._animationFrame);
    this._cancelThemeSync?.();
    this._cancelThemeSync = null;
    this.ownerDocument?.removeEventListener?.('cascade-theme-change', this._themeChangeHandler);
    this._themeObserver?.disconnect();
    this.disableDeviceOrientationParallax();
    this._mediaImages?.clear();
    if (this.worker) this.worker.stop();
  }

  suspendLayout({ reason = 'layout-suspend' } = {}) {
    this._layoutSuspended = true;
    this._layoutSuspendReason = reason;
    if (reason === 'layout-move') return;
    this._loopRunning = false;
    if (this._animationFrame) cancelAnimationFrame(this._animationFrame);
    if (this.worker) {
      this.worker.stop();
      this.worker = null;
      this._workerGeneration += 1;
    }
  }

  resumeLayout({ reason = 'layout-resume' } = {}) {
    let wasLayoutMove = this._layoutSuspendReason === 'layout-move' || reason === 'layout-move';
    this._layoutSuspended = false;
    this._layoutSuspendReason = '';
    if (!wasLayoutMove && !this.worker && this.nodes?.length > 0) {
      this.startWorker(this._lastWorkerOptions || {
        activeGroupId: this.currentGroupId,
        boundaryRadius: this.currentGroupId ? this.graphDB.nodes.get(this.currentGroupId)?.w / 2 : null,
        attractors: null,
      });
    } else if (!wasLayoutMove) {
      this.worker?.resume?.();
    }
    this.resizeCanvas();
    this._scheduleCanvasThemeSync();
    this._wakeLoop();
  }

  /**
   * Ensure the rAF draw loop is running. Safe to call repeatedly.
   * Called by all state-changing entry points (interaction, worker, resize).
   */
  _wakeLoop() {
    if (this._layoutSuspended) return;
    if (this._externalFrameDrive) return;
    if (this._loopRunning) return;
    this._loopRunning = true;
    this._idleFrames = 0;
    this._animationFrame = requestAnimationFrame(() => this.draw());
  }

  setFrameDriver(mode = 'self') {
    if (mode !== 'self' && mode !== 'external') {
      throw new TypeError('frame driver must be self or external');
    }
    this._externalFrameDrive = mode === 'external';
    if (this._externalFrameDrive) {
      if (this._animationFrame) cancelAnimationFrame(this._animationFrame);
      this._animationFrame = 0;
      this._loopRunning = false;
    } else {
      this._wakeLoop();
    }
    return mode;
  }

  presentFrame() {
    if (this._inDraw) {
      this.needsDraw = true;
      return false;
    }
    if (!this.canvas || this.canvas.width <= 0 || this.canvas.height <= 0) {
      this._animationFrame = 0;
      this._loopRunning = false;
      return false;
    }
    if (this._animationFrame) cancelAnimationFrame(this._animationFrame);
    this._animationFrame = 0;
    this._idleFrames = 0;
    this.needsDraw = true;
    this._loopRunning = true;
    let externalFrameDrive = this._externalFrameDrive;
    this._externalFrameDrive = true;
    try {
      return this.draw();
    } finally {
      if (this._animationFrame) cancelAnimationFrame(this._animationFrame);
      this._animationFrame = 0;
      this._loopRunning = false;
      this._externalFrameDrive = externalFrameDrive;
      if (!externalFrameDrive) this._wakeLoop();
    }
  }

  resizeCanvas() {
    const dpr = window.devicePixelRatio || 1;
    const rect = this.getBoundingClientRect();
    if (rect.width === 0) return;
    const width = Math.max(1, Math.round(rect.width * dpr));
    const height = Math.max(1, Math.round(rect.height * dpr));
    this.canvas.style.width = rect.width + 'px';
    this.canvas.style.height = rect.height + 'px';
    if (this.canvas.width !== width) this.canvas.width = width;
    if (this.canvas.height !== height) this.canvas.height = height;
    this._wakeLoop();
  }

  resetView() {
    this.fitView();
  }

  _getVisibleFocusFrame(nodeId, { fallbackToParent = true, includeInfoPanel = false } = {}) {
    let id = String(nodeId || '').trim();
    if (!id) return null;

    let node = this.nodeMap?.get(id);
    if (!node && fallbackToParent) {
      let graphNode = this.graphDB?.nodes?.get(id);
      let parentId = graphNode?.parentId;
      while (parentId && !node) {
        node = this.nodeMap?.get(parentId);
        if (node) {
          id = parentId;
          break;
        }
        parentId = this.graphDB?.nodes?.get(parentId)?.parentId;
      }
    }
    if (!node) return null;

    let pos = this.getSmooth(id) || this.nodePositions.get(id);
    if (!pos) return null;

    if (this.renderMode === 'dots') {
      let connections = this.adjMap?.get(id)?.size || 0;
      let radius = getNodeRadius(node, connections);
      let frame = {
        id,
        node,
        minX: pos.x - radius,
        minY: pos.y - radius,
        maxX: pos.x + radius,
        maxY: pos.y + radius,
      };
      return includeInfoPanel ? this._extendFocusFrameWithInfoPanel(frame, pos) : frame;
    }

    let width = Number.isFinite(node.w) ? node.w : 160;
    let height = Number.isFinite(node.h) ? node.h : 40;
    let frame = {
      id,
      node,
      minX: pos.x,
      minY: pos.y,
      maxX: pos.x + width,
      maxY: pos.y + height,
    };
    return includeInfoPanel ? this._extendFocusFrameWithInfoPanel(frame, pos) : frame;
  }

  _extendFocusFrameWithInfoPanel(frame, pos) {
    let node = frame?.node;
    if (!node || !pos || !this.ctx) return frame;
    let lines = this._buildInfoLines(node);
    let layout = this._measureInfoPanelLayout(node, pos, lines);
    if (!layout) return frame;
    let { metrics, panelX, panelY, menuExtent } = layout;
    return {
      ...frame,
      minX: Math.min(frame.minX, pos.x - menuExtent),
      minY: Math.min(frame.minY, pos.y - menuExtent, panelY),
      maxX: Math.max(frame.maxX, panelX + metrics.panelW),
      maxY: Math.max(frame.maxY, pos.y + menuExtent, panelY + metrics.panelOuterH),
    };
  }

  _measureInfoPanelLayout(node, pos, lines = []) {
    if (!node || !pos || !this.ctx || !lines.length) return null;
    let textLines = lines.map((line) => typeof line === 'string' ? line : line?.text || '');
    let connections = this.adjMap?.get(node.id)?.size || 0;
    let activeNodeScale = this._resolveActiveNodeScale();
    let dotRadius = getNodeRadius(node, connections, {
      scale: node.aScale || activeNodeScale,
    });
    let menuExtent = dotRadius + 20;
    let initialMetrics = resolveCanvasGraphInfoPanelMetrics({
      scale: this._resolveInfoPanelScale(),
      lineCount: textLines.length,
      menuExtent,
    });
    this.ctx.save();
    this.ctx.font = `600 ${initialMetrics.fontSize}px 'Inter', 'SF Mono', system-ui, sans-serif`;
    let maxTextWidth = initialMetrics.minWidth;
    for (const text of textLines) {
      maxTextWidth = Math.max(maxTextWidth, this.ctx.measureText(text).width);
    }
    this.ctx.restore();
    let metrics = resolveCanvasGraphInfoPanelMetrics({
      scale: initialMetrics.scale,
      lineCount: textLines.length,
      menuExtent,
      maxTextWidth,
    });
    return {
      metrics,
      menuExtent,
      panelX: pos.x + menuExtent + metrics.panelGap,
      panelY: pos.y - metrics.padY,
    };
  }

  _getVisibleGraphFrame() {
    let frames = this.nodes
      .map((node) => this._getVisibleFocusFrame(node.id, { fallbackToParent: false }))
      .filter(Boolean);
    if (frames.length === 0) return null;
    return {
      minX: Math.min(...frames.map((frame) => frame.minX)),
      minY: Math.min(...frames.map((frame) => frame.minY)),
      maxX: Math.max(...frames.map((frame) => frame.maxX)),
      maxY: Math.max(...frames.map((frame) => frame.maxY)),
    };
  }

  _resolveGraphFitZoom(rect = this.canvas?.getBoundingClientRect(), options = {}) {
    let frame = this._getVisibleGraphFrame();
    let padding = resolveFitPadding(Number.isFinite(options.padding) ? options.padding : 0, rect);
    return resolveFrameFitZoom(frame, rect, padding);
  }

  _resolveMinZoom(rect = this.canvas?.getBoundingClientRect()) {
    return resolveCanvasGraphMinZoom({
      frame: this._getVisibleGraphFrame(),
      rect,
      visibleNodeCount: this.nodes?.length || 0,
    });
  }

  _clampZoom(zoom, rect = this.canvas?.getBoundingClientRect()) {
    let minZoom = Math.min(MAX_CANVAS_GRAPH_ZOOM, this._resolveMinZoom(rect));
    return Math.max(minZoom, Math.min(MAX_CANVAS_GRAPH_ZOOM, zoom));
  }

  fitView(padding = 60, animate = true) {
    if (!this.nodePositions.size) return false;
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return false;

    let opts = normalizeFitViewArgs(padding, animate);
    let fit = resolveCanvasGraphViewportFit({
      frame: this._getVisibleGraphFrame(),
      rect,
      padding: opts.padding,
      minZoom: opts.minZoom,
      maxZoom: opts.maxZoom,
    });

    if (opts.animate) {
      this._targetZoom = fit.zoom;
      this._targetPanX = fit.panX;
      this._targetPanY = fit.panY;
      this._zoomAnchor = null;
      this._viewportEase = opts.viewportEase;
    } else {
      this.zoom = fit.zoom;
      this._targetZoom = fit.zoom;
      this.panX = fit.panX;
      this.panY = fit.panY;
      this._targetPanX = null;
      this._targetPanY = null;
      this._viewportEase = DEFAULT_VIEWPORT_EASE;
    }
    this.needsDraw = true;
    this._wakeLoop();
    return true;
  }

  fitNodes(nodeIds, options = {}) {
    let ids = normalizeFocusNodeIds(nodeIds);
    if (ids.length === 0) return false;

    const rect = this.canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return false;

    let selectedId = null;
    if (typeof options.select === 'string') {
      selectedId = options.select;
    } else if (options.select === true) {
      selectedId = ids[0] || null;
    }
    let frames = ids
      .map((id) => this._getVisibleFocusFrame(id, {
        fallbackToParent: options.fallbackToParent !== false,
        includeInfoPanel: options.includeInfoPanel !== false && id === selectedId,
      }))
      .filter(Boolean);
    if (frames.length === 0) return false;

    let frame = {
      minX: Math.min(...frames.map((item) => item.minX)),
      minY: Math.min(...frames.map((item) => item.minY)),
      maxX: Math.max(...frames.map((item) => item.maxX)),
      maxY: Math.max(...frames.map((item) => item.maxY)),
    };
    let fit = resolveCanvasGraphViewportFit({
      frame,
      rect,
      padding: Number.isFinite(options.padding) ? options.padding : 80,
      minZoom: Number.isFinite(options.minZoom) ? options.minZoom : MIN_CANVAS_GRAPH_ZOOM,
      maxZoom: Number.isFinite(options.maxZoom) ? options.maxZoom : MAX_CANVAS_GRAPH_FOCUS_ZOOM,
    });
    let pendingViewport = {
      zoom: fit.zoom,
      panX: fit.panX,
      panY: fit.panY,
      animate: options.animate !== false,
      viewportEase: normalizeViewportEase(options.viewportEase),
    };
    if (selectedId && this._shouldDeferFocusTransition(selectedId, options)) {
      this._cancelViewportGestureTarget();
      this._activateNode(selectedId, {
        ...options,
        transition: true,
        pendingViewport,
      });
      this.needsDraw = true;
      this._wakeLoop();
      return true;
    }

    this._applyViewportTarget(pendingViewport);
    if (selectedId && this.nodeMap?.has(selectedId)) {
      this._activateNode(selectedId, {
        ...options,
        transition: options.transition !== false,
      });
    }

    this.needsDraw = true;
    this._wakeLoop();
    return true;
  }

  flyToNodes(nodeIds, options = {}) {
    return this.fitNodes(nodeIds, options);
  }

  focusNodes(nodeIds, options = {}) {
    let ids = normalizeFocusNodeIds(nodeIds);
    if (ids.length === 0) return false;
    if (!Array.isArray(nodeIds) && ids.length === 1 && options.fit !== true) {
      return this.flyToNode(ids[0], options);
    }
    return this.fitNodes(ids, options);
  }

  pulseNode(nodeId, durationMs = 1500, options = {}) {
    let now = Number.isFinite(options.startTime) ? options.startTime : renderNow();
    let marker = options.deferUntilTransition === false
      ? null
      : findActiveTransitionMarker(this._transitionMarkers, nodeId, now);
    if (marker) {
      marker.pendingPulse = {
        duration: durationMs,
        waves: Number.isFinite(options.waves) ? options.waves : 1,
      };
      this._pulses = (this._pulses || []).filter((pulse) => pulse.id !== nodeId);
      this.needsDraw = true;
      this._wakeLoop();
      return;
    }
    this._queuePulseNow(nodeId, durationMs, options, now);
  }

  clearPulses() {
    let count = this._pulses?.length || 0;
    this._pulses = [];
    for (let marker of this._transitionMarkers || []) {
      if (marker.pendingPulse) count += 1;
      marker.pendingPulse = null;
    }
    this.needsDraw = true;
    this._wakeLoop();
    return count;
  }

  _queuePulseNow(nodeId, durationMs = 1500, options = {}, startTime = renderNow()) {
    this._pulses = getNextPulseQueue({
      pulses: this._pulses || [],
      nodeId,
      startTime,
      duration: durationMs,
      waves: Number.isFinite(options.waves) ? options.waves : 1,
    });
    this.needsDraw = true;
    this._wakeLoop();
  }

  _shouldDeferFocusTransition(nodeId, options = {}) {
    return options.deferFocusUntilTransition !== false
      && options.transition !== false
      && this.activeNode
      && this.activeNode.id !== nodeId
      && !this.dragNode
      && !this.isPanning;
  }

  _applyViewportTarget(viewport = {}) {
    if (!Number.isFinite(viewport.zoom) || !Number.isFinite(viewport.panX) || !Number.isFinite(viewport.panY)) return false;
    this._zoomAnchor = null;
    if (viewport.animate !== false) {
      this._targetZoom = viewport.zoom;
      this._targetPanX = viewport.panX;
      this._targetPanY = viewport.panY;
      this._viewportEase = normalizeViewportEase(viewport.viewportEase);
    } else {
      this.zoom = viewport.zoom;
      this._targetZoom = viewport.zoom;
      this.panX = viewport.panX;
      this.panY = viewport.panY;
      this._targetPanX = null;
      this._targetPanY = null;
      this._viewportEase = DEFAULT_VIEWPORT_EASE;
    }
    return true;
  }

  getViewport() {
    return {
      zoom: this.zoom,
      panX: this.panX,
      panY: this.panY,
    };
  }

  setViewport(viewport = {}) {
    if (!Number.isFinite(viewport.zoom)
      || !Number.isFinite(viewport.panX)
      || !Number.isFinite(viewport.panY)) {
      throw new TypeError('canvas-graph viewport requires finite zoom, panX, and panY');
    }
    let rect = this.canvas?.getBoundingClientRect?.();
    let target = {
      zoom: this._clampZoom(viewport.zoom, rect),
      panX: viewport.panX,
      panY: viewport.panY,
      animate: viewport.animate === true,
      viewportEase: viewport.viewportEase,
    };
    let applied = target.animate
      ? this._applyViewportTarget(target)
      : this._setViewportImmediate(target);
    if (!applied) return false;
    this.needsDraw = true;
    this._wakeLoop();
    return this.getViewport();
  }

  _captureViewportState() {
    return {
      zoom: this.zoom,
      panX: this.panX,
      panY: this.panY,
      animate: false,
    };
  }

  _setViewportImmediate(viewport = {}) {
    if (!Number.isFinite(viewport.zoom) || !Number.isFinite(viewport.panX) || !Number.isFinite(viewport.panY)) return false;
    this._zoomAnchor = null;
    this.zoom = viewport.zoom;
    this.panX = viewport.panX;
    this.panY = viewport.panY;
    this._targetZoom = viewport.zoom;
    this._targetPanX = null;
    this._targetPanY = null;
    this._viewportEase = DEFAULT_VIEWPORT_EASE;
    return true;
  }

  _resolveTransitionRouteViewport(marker, options = {}) {
    let ids = normalizeFocusNodeIds(marker?.path || []);
    if (ids.length < 2) return null;

    const rect = this.canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return null;

    let frames = ids
      .map((id) => this._getVisibleFocusFrame(id, { fallbackToParent: options.fallbackToParent !== false }))
      .filter(Boolean);
    if (frames.length < 2) return null;

    let frame = {
      minX: Math.min(...frames.map((item) => item.minX)),
      minY: Math.min(...frames.map((item) => item.minY)),
      maxX: Math.max(...frames.map((item) => item.maxX)),
      maxY: Math.max(...frames.map((item) => item.maxY)),
    };
    let routePoints = this._resolveTransitionWorldRoutePoints(marker);
    for (let point of routePoints || []) {
      frame.minX = Math.min(frame.minX, point.x);
      frame.minY = Math.min(frame.minY, point.y);
      frame.maxX = Math.max(frame.maxX, point.x);
      frame.maxY = Math.max(frame.maxY, point.y);
    }
    let fit = resolveCanvasGraphViewportFit({
      frame,
      rect,
      padding: Number.isFinite(options.transitionRoutePadding)
        ? options.transitionRoutePadding
        : Number.isFinite(options.padding)
          ? Math.max(options.padding, 120)
          : 120,
      minZoom: Number.isFinite(options.transitionRouteMinZoom) ? options.transitionRouteMinZoom : MIN_CANVAS_GRAPH_ZOOM,
      maxZoom: Number.isFinite(options.transitionRouteMaxZoom) ? options.transitionRouteMaxZoom : 1.35,
    });
    return {
      zoom: fit.zoom,
      panX: fit.panX,
      panY: fit.panY,
      animate: options.animate !== false,
      viewportEase: normalizeViewportEase(options.transitionRouteViewportEase ?? options.viewportEase),
    };
  }

  _prepareTransitionMarkerViewport(marker, options = {}) {
    if (!marker?.pendingViewport) return false;
    let routeViewport = options.routeViewport || this._resolveTransitionRouteViewport(marker, options);
    let rect = this.canvas.getBoundingClientRect();
    if (!routeViewport || rect.width === 0 || rect.height === 0) return false;

    this._prewarmTransitionPath(marker);
    marker.initialViewport = this._captureViewportState();
    marker.routeViewport = routeViewport;
    marker.initialCenter = viewportToCameraCenter(marker.initialViewport, rect);
    marker.routeCenter = viewportToCameraCenter(routeViewport, rect);
    marker.targetCenter = viewportToCameraCenter(marker.pendingViewport, rect);
    let targetNodeCenter = this.nodeCenter(marker.toId);
    marker.targetCenterOffset = targetNodeCenter ? {
      x: marker.targetCenter.x - targetNodeCenter.x,
      y: marker.targetCenter.y - targetNodeCenter.y,
    } : null;
    return true;
  }

  _resolveTransitionMarkerViewport(marker, progress) {
    if (!marker?.initialCenter || !marker.routeCenter || !marker.pendingViewport) return null;
    let rect = this.canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return null;
    let liveNodeCenter = this.nodeCenter(marker.pendingActivation || marker.toId);
    let targetCenter = liveNodeCenter && marker.targetCenterOffset
      ? {
          x: liveNodeCenter.x + marker.targetCenterOffset.x,
          y: liveNodeCenter.y + marker.targetCenterOffset.y,
        }
      : marker.targetCenter;
    if (!targetCenter) return null;
    marker.targetCenter = targetCenter;
    return resolveCanvasGraphCameraArc({
      startCenter: marker.initialCenter,
      routeCenter: marker.routeCenter,
      targetCenter,
      startZoom: marker.initialViewport.zoom,
      routeZoom: marker.routeViewport.zoom,
      targetZoom: marker.pendingViewport.zoom,
      rect,
      progress,
      minZoom: this._resolveMinZoom(rect),
      maxZoom: MAX_CANVAS_GRAPH_ZOOM,
    });
  }

  _updateTransitionMarkerViewport(now = renderNow()) {
    let marker = (this._transitionMarkers || []).find((item) => item?.pendingActivation && item.routeViewport && item.pendingViewport);
    if (!marker) return false;

    let duration = Number.isFinite(marker.duration) ? marker.duration : 850;
    if (duration <= 0) return false;
    let progress = clampTransitionProgress((now - marker.startTime) / duration);
    let viewport = this._resolveTransitionMarkerViewport(marker, progress);
    if (!viewport) return false;
    return this._setViewportImmediate(viewport);
  }

  _cancelViewportGestureTarget() {
    this._zoomAnchor = null;
    this._targetZoom = this.zoom;
    this._targetPanX = null;
    this._targetPanY = null;
    this._viewportEase = DEFAULT_VIEWPORT_EASE;
  }

  _activateNode(nodeOrId, options = {}) {
    let node = typeof nodeOrId === 'string' ? this.nodeMap?.get(nodeOrId) : nodeOrId;
    if (!node) return false;

    let previousNode = this.activeNode;
    let isNewActivation = !previousNode || previousNode.id !== node.id;
    let shouldTransition = options.transition !== false
      && isNewActivation
      && previousNode
      && !this.dragNode
      && !this.isPanning;

    if (shouldTransition) {
      this.nextActiveNode = null;
      this.deactivating = true;
      this.menuAnim = 0;
      let marker = this._queueTransitionMarker(previousNode.id, node.id, options);
      if (marker) {
        this.nextActiveNode = node;
        marker.pendingActivation = node.id;
        marker.pendingViewport = options.pendingViewport || null;
        this._prepareTransitionMarkerViewport(marker, options);
        if (marker.duration <= 0) {
          this._transitionMarkers = this._transitionMarkers.filter((item) => item !== marker);
          this._completeTransitionMarker(marker, marker.startTime);
        }
        this.needsDraw = true;
        this._wakeLoop();
        return true;
      }
    }

    this.activeNode = node;
    this.nextActiveNode = null;
    this.deactivating = false;
    if (isNewActivation) {
      this._setHoverAction('');
      this._resetInfoPanelForActivation();
    }
    if (isNewActivation && previousNode && options.marker !== false) {
      this._queueTransitionMarker(previousNode.id, node.id, options);
    }
    this.updateInteractionDepths();
    if (isNewActivation) {
      this.needsDraw = true;
      this._wakeLoop();
    }
    return true;
  }

  _resetInfoPanelForActivation() {
    this._infoPanel.nodeId = null;
    this._infoPanel.lines = [];
    this._infoPanel.totalExtent = 0;
    this._infoPanel.totalExtentY = 0;
    this._infoPanel._centeredForNode = null;
  }

  _beginFocusExit() {
    if (!this.activeNode || this.deactivating) return false;
    this.deactivating = true;
    this.dragNode = null;
    this.nextActiveNode = null;
    this._setHoverAction('');
    this.menuAnim = 0;
    this.needsDraw = true;
    this._wakeLoop();
    this._emitGraphEvent('nodeDeselected');
    return true;
  }

  _queueTransitionMarker(fromId, toId, options = {}) {
    let from = String(fromId || '').trim();
    let to = String(toId || '').trim();
    if (!from || !to || from === to) return;

    let path = this._findTransitionPath(from, to);
    if (path.length < 2) return;

    let now = renderNow();
    let routePoints = path
      .map((id) => this.nodeCenter(id))
      .filter((point) => Number.isFinite(point?.x) && Number.isFinite(point?.y));
    let styles = typeof getComputedStyle === 'function' ? getComputedStyle(this) : null;
    let motionScale = Number(styles?.getPropertyValue('--sn-theme-motion-scale'));
    let duration = resolveCanvasGraphTransitionDuration({
      transitionMs: options.transitionMs,
      duration: options.duration,
      transitionMarkerMs: options.transitionMarkerMs,
      routeDistance: routePoints.length === path.length ? getTransitionRouteLength(routePoints) : 0,
      distanceScale: Number.isFinite(this.zoom) ? this.zoom : 1,
      speed: options.transitionSpeed,
      minMs: options.transitionMinMs,
      maxMs: options.transitionMaxMs,
      motionScale,
      disabled: options.transition === false
        || options.animate === false
        || styles?.getPropertyValue('--sn-motion-enabled').trim() === '0'
        || globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches === true,
    });
    let marker = { fromId: from, toId: to, path, startTime: now, duration };
    this._transitionMarkers = [
      ...(this._transitionMarkers || []).filter((marker) => marker.toId !== to),
      marker,
    ];
    return marker;
  }

  queueTransitionMarkers(fromId, toIds = [], options = {}) {
    let targets = normalizeFocusNodeIds(toIds);
    let count = 0;
    for (let toId of targets) {
      let before = this._transitionMarkers?.length || 0;
      this._queueTransitionMarker(fromId, toId, options);
      if ((this._transitionMarkers?.length || 0) > before || this._transitionMarkers?.some((marker) => marker.toId === toId)) {
        count += 1;
      }
    }
    if (count > 0) {
      this.needsDraw = true;
      this._wakeLoop();
    }
    return count;
  }

  _findTransitionPath(fromId, toId) {
    if (!this.adjMap?.has(fromId) || !this.adjMap?.has(toId)) return [fromId, toId];
    let queue = [fromId];
    let parent = new Map([[fromId, null]]);
    let visited = 0;

    while (queue.length > 0 && visited < 500) {
      let current = queue.shift();
      visited++;
      if (current === toId) break;
      for (let next of this.adjMap.get(current) || []) {
        if (parent.has(next) || !this.nodeMap?.has(next)) continue;
        parent.set(next, current);
        queue.push(next);
      }
    }

    if (!parent.has(toId)) return [fromId, toId];
    let path = [];
    let current = toId;
    while (current) {
      path.unshift(current);
      current = parent.get(current);
    }
    return path.length > 1 ? path : [fromId, toId];
  }

  _nodeVisualScreenCenter(id) {
    let point = this.nodeCenter(id);
    if (!point) return null;
    let node = this.nodeMap?.get(id);
    let depth = node?.targetDepth ?? 0;
    let transform = this.getVisualLayerTransform(depth);
    return {
      x: transform.A * point.x + transform.E,
      y: transform.A * point.y + transform.F,
    };
  }

  _resolveTransitionWorldRoutePoints(marker) {
    let points = [];
    for (let id of marker?.path || []) {
      let point = this.nodeCenter(id);
      if (!point) return null;
      points.push(point);
    }
    return points.length >= 2 ? points : null;
  }

  _resolveTransitionRoutePoints(marker) {
    let points = [];
    for (let id of marker.path || []) {
      let point = this._nodeVisualScreenCenter(id);
      if (!point) return null;
      points.push(point);
    }
    if (points.length < 2) return null;
    marker.points = points;
    return points;
  }

  _getTransitionRoutePoint(marker, progress) {
    let points = this._resolveTransitionRoutePoints(marker);
    if (!points) return null;
    if (points.length < 2) return null;

    let segments = [];
    let total = 0;
    for (let i = 1; i < points.length; i++) {
      let from = points[i - 1];
      let to = points[i];
      let dx = to.x - from.x;
      let dy = to.y - from.y;
      let length = Math.sqrt(dx * dx + dy * dy);
      if (length <= 0.1) continue;
      segments.push({ from, to, dx, dy, length });
      total += length;
    }
    if (segments.length === 0 || total <= 0.1) return null;

    let distance = Math.max(0, Math.min(1, progress)) * total;
    for (let segment of segments) {
      if (distance > segment.length) {
        distance -= segment.length;
        continue;
      }
      let t = distance / segment.length;
      return {
        x: segment.from.x + segment.dx * t,
        y: segment.from.y + segment.dy * t,
      };
    }

    return segments.at(-1)?.to || null;
  }

  _prewarmTransitionPath(marker) {
    for (let id of marker?.path || []) {
      this._nodeAppearances?.delete?.(id);
    }
  }

  _drawTransitionMarkers(ctx, now = renderNow()) {
    if (!this._transitionMarkers?.length) return false;
    let hasActiveMarkers = false;
    let dpr = globalThis.devicePixelRatio || 1;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    this._transitionMarkers = this._transitionMarkers.filter((marker) => {
      let duration = Number.isFinite(marker.duration) ? marker.duration : 850;
      if (duration <= 0) {
        this._completeTransitionMarker(marker, now);
        return false;
      }
      let elapsed = now - marker.startTime;
      if (elapsed >= duration) {
        this._completeTransitionMarker(marker, now);
        return false;
      }

      let progress = Math.max(0, Math.min(1, elapsed / duration));
      let eased = resolveCanvasGraphTransitionProgress(progress);
      let point = this._getTransitionRoutePoint(marker, eased);
      if (!point) {
        this._completeTransitionMarker(marker, now);
        return false;
      }

      let radius = Math.max(3 * dpr, 7 * dpr);
      let alpha = 0.35 + Math.sin(progress * Math.PI) * 0.65;
      ctx.save();
      ctx.beginPath();
      ctx.arc(point.x, point.y, radius * 1.8, 0, Math.PI * 2);
      ctx.fillStyle = toRgba(this._pulseRgb, 0.18 * alpha);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(point.x, point.y, radius, 0, Math.PI * 2);
      ctx.fillStyle = toRgba(this._pulseRgb, alpha);
      ctx.fill();
      ctx.lineWidth = Math.max(1 * dpr, 1.5 * dpr);
      ctx.strokeStyle = toRgba(this._textRgb, 0.55 * alpha);
      ctx.stroke();
      ctx.restore();
      hasActiveMarkers = true;
      this.needsDraw = true;
      return true;
    });
    ctx.restore();
    return hasActiveMarkers;
  }

  _completeTransitionMarker(marker, now = renderNow()) {
    if (marker?.pendingViewport) {
      let landingViewport = this._resolveTransitionMarkerViewport(marker, 1) || marker.pendingViewport;
      this._setViewportImmediate(landingViewport);
      marker.pendingViewport = null;
    }
    if (marker?.pendingActivation && this.nodeMap?.has(marker.pendingActivation)) {
      let targetId = marker.pendingActivation;
      this._activateNode(targetId, { transition: false, marker: false });
      this._infoPanel._centeredForNode = targetId;
      marker.pendingActivation = null;
    }
    let pulse = marker?.pendingPulse;
    if (pulse) {
      this._queuePulseNow(marker.toId, pulse.duration, { waves: pulse.waves }, now);
      marker.pendingPulse = null;
    }
    this.needsDraw = true;
    this._wakeLoop();
  }

  _hasPendingActivationMarker(nodeId) {
    let id = String(nodeId || '').trim();
    return Boolean(id && this._transitionMarkers?.some((marker) => marker?.pendingActivation === id));
  }

  flyToNode(nodeId, options = {}) {
    const node = this.graphDB?.nodes.get(nodeId);
    if (node && node.parentId) {
      if (node.parentId !== this.currentGroupId) {
        this.loadLevel(node.parentId, { enterSemanticCluster: true });
        setTimeout(() => this.flyToNode(nodeId, options), 500);
        return false;
      }
    }

    const pos = this.getSmooth(nodeId) || this.nodePositions.get(nodeId);
    if (!pos) return false;

    const rect = this.canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return false;

    // Set zoom target: use provided zoom level, or force a readable minimum for focus.
    const targetZoom = Number.isFinite(options.zoom)
      ? options.zoom
      : Math.max(DEFAULT_CANVAS_GRAPH_FOCUS_ZOOM, Math.min(MAX_CANVAS_GRAPH_FOCUS_ZOOM, this.zoom));
    let focusFrame = this._getVisibleFocusFrame(nodeId, {
      fallbackToParent: options.fallbackToParent !== false,
      includeInfoPanel: options.includeInfoPanel !== false,
    });
    let focusFit = focusFrame ? resolveCanvasGraphViewportFit({
      frame: focusFrame,
      rect,
      padding: Number.isFinite(options.padding) ? options.padding : 48,
      minZoom: Number.isFinite(options.minZoom) ? options.minZoom : MIN_CANVAS_GRAPH_ZOOM,
      maxZoom: targetZoom,
    }) : null;
    let pendingViewport = {
      zoom: focusFit?.zoom ?? targetZoom,
      panX: focusFit?.panX ?? rect.width / 2 - pos.x * targetZoom,
      panY: focusFit?.panY ?? rect.height / 2 - pos.y * targetZoom,
      animate: true,
      viewportEase: normalizeViewportEase(options.viewportEase),
    };

    // Activate the node
    const foundNode = this.nodeMap?.get(nodeId);
    if (foundNode) {
      if (this._shouldDeferFocusTransition(nodeId, options)) {
        this._cancelViewportGestureTarget();
        this._activateNode(foundNode, {
          ...options,
          transition: true,
          pendingViewport,
        });
        this.needsDraw = true;
        this._wakeLoop();
        return true;
      }
      this._applyViewportTarget(pendingViewport);
      this._activateNode(foundNode, {
        ...options,
        transition: options.transition !== false,
      });
    } else {
      this._applyViewportTarget(pendingViewport);
    }
    this.needsDraw = true;
    this._wakeLoop();
    return true;
  }

  /**
   * Immediately set the active node without moving or targeting the viewport.
   *
   * @param {string} nodeId - id of the node to activate
   * @param {{ transition?: boolean, marker?: boolean }} [options]
   * @returns {boolean} true for a matching node, false for a missing or unknown id
   */
  activateNode(nodeId, { transition = false, marker = false } = {}) {
    let id = String(nodeId || '').trim();
    if (!id) return false;
    if (!transition) {
      this._cancelViewportGestureTarget();
      this._transitionMarkers = (this._transitionMarkers || []).filter((item) => (
        !item?.pendingActivation && !item?.pendingViewport
      ));
    }
    let activated = this._activateNode(id, { transition, marker });
    if (activated && !transition && this.activeNode?.id === id) {
      this._infoPanel._centeredForNode = id;
    }
    return activated;
  }

  focusSemanticCluster(nodeId) {
    const node = this.graphDB?.nodes.get(nodeId);
    if (!node?.isSemanticCluster) return;
    if (this.currentGroupId) {
      this.loadLevel(null);
    }
    this.pulseNode(nodeId, 1800);
    requestAnimationFrame(() => {
      this.flyToNode(nodeId, { zoom: DEFAULT_CANVAS_GRAPH_FOCUS_ZOOM });
    });
  }

  setLayoutSnapshot(snapshot) {
    if (!snapshot || typeof snapshot !== 'object') {
      this._layoutSnapshot = null;
      return;
    }
    this._layoutSnapshot = {
      positions: snapshot.positions && typeof snapshot.positions === 'object' ? snapshot.positions : {},
      viewport: snapshot.viewport && typeof snapshot.viewport === 'object' ? snapshot.viewport : null,
    };
  }

  resetLayoutState() {
    this._workerGeneration += 1;
    this.nodePositions.clear();
    this.smoothPositions.clear();
    this._layoutSnapshot = null;
    this._layoutWarmupIds = new Set();
    this._layoutPreserveIds = new Set();
    this._transitionMarkers = [];
    this._pulses = [];
    if (this.worker) {
      this.worker.stop();
      this.worker = null;
    }
    this.lastAlpha = 0;
    this.tickCount = 0;
    this.frameCount = 0;
    this._lastRenderTime = null;
    this.needsDraw = true;
    this._wakeLoop();
  }

  getLayoutSnapshot() {
    const positions = {};
    for (const [id, pos] of this.nodePositions.entries()) {
      if (!this.graphDB?.nodes?.has(id)) continue;
      if (!Number.isFinite(pos?.x) || !Number.isFinite(pos?.y)) continue;
      positions[id] = { x: Math.round(pos.x * 100) / 100, y: Math.round(pos.y * 100) / 100 };
    }
    return {
      version: 1,
      groupId: this.currentGroupId || '',
      viewport: {
        panX: Math.round(this.panX * 100) / 100,
        panY: Math.round(this.panY * 100) / 100,
        zoom: Math.round(this.zoom * 1000) / 1000,
      },
      positions,
    };
  }

  _emitLayoutSnapshot() {
    this._emitGraphEvent('layoutSnapshot', this.getLayoutSnapshot());
  }

  /** @returns {{ vcx: number, vcy: number }} */
  _focusCanvasCenter() {
    let width = Number(this.canvas?.width) || 0;
    let height = Number(this.canvas?.height) || 0;
    return { vcx: width / 2, vcy: height / 2 };
  }

  _getRenderSurface() {
    let backingWidth = Math.max(0, Math.floor(Number(this.canvas?.width) || 0));
    let backingHeight = Math.max(0, Math.floor(Number(this.canvas?.height) || 0));
    let dpr = Number(globalThis.devicePixelRatio || globalThis.window?.devicePixelRatio || 1);
    if (!Number.isFinite(dpr) || dpr <= 0) dpr = 1;
    let rect = this.canvas?.getBoundingClientRect?.();
    let cssWidth = Number(rect?.width);
    let cssHeight = Number(rect?.height);
    if (!Number.isFinite(cssWidth) || cssWidth < 0) cssWidth = backingWidth / dpr;
    if (!Number.isFinite(cssHeight) || cssHeight < 0) cssHeight = backingHeight / dpr;
    return { backingWidth, backingHeight, cssWidth, cssHeight, dpr };
  }

  _matchesRenderSurface(surface) {
    let current = this._getRenderSurface();
    let currentInitialized = current.backingWidth > 0 || current.backingHeight > 0
      || current.cssWidth > 0 || current.cssHeight > 0;
    if (!currentInitialized) return true;
    let sameFloat = (left, right) => Math.abs(left - right) <= 0.001;
    return current.backingWidth === surface.backingWidth
      && current.backingHeight === surface.backingHeight
      && sameFloat(current.cssWidth, surface.cssWidth)
      && sameFloat(current.cssHeight, surface.cssHeight)
      && sameFloat(current.dpr, surface.dpr);
  }

  /** @returns {object} */
  getRenderSnapshot() {
    if (!this.layoutSettled) {
      throw new Error('CanvasGraph render snapshot requires a settled layout');
    }
    let nodeIds = this.graphDB?.nodes ? this.graphDB.nodes : new Map();

    let positions = {};
    for (let [id, pos] of this.nodePositions.entries()) {
      if (!nodeIds.has(id)) continue;
      if (!Number.isFinite(pos?.x) || !Number.isFinite(pos?.y)) continue;
      positions[id] = { x: pos.x, y: pos.y };
    }

    let smoothPositions = {};
    for (let [id, pos] of this.smoothPositions.entries()) {
      if (!nodeIds.has(id)) continue;
      if (!Number.isFinite(pos?.x) || !Number.isFinite(pos?.y)) continue;
      smoothPositions[id] = { x: pos.x, y: pos.y };
    }

    let nodeAnim = {};
    for (let node of this.nodes || []) {
      nodeAnim[node.id] = {
        aScale: Number.isFinite(node.aScale) ? node.aScale : 1,
        aGlow: Number.isFinite(node.aGlow) ? node.aGlow : 0,
        aRot: Number.isFinite(node.aRot) ? node.aRot : 0,
        aRotSpeed: Number.isFinite(node.aRotSpeed) ? node.aRotSpeed : 0,
      };
    }

    let edgeAnim = (this.edges || []).map((edge, index) => ({
      index,
      from: edge.from,
      to: edge.to,
      aAlpha: Number.isFinite(edge.aAlpha) ? edge.aAlpha : 0.5,
      aWidth: Number.isFinite(edge.aWidth) ? edge.aWidth : 1.5,
    }));

    let { vcx: focusCenterX, vcy: focusCenterY } = this._focusCanvasCenter();

    let ip = this._infoPanel || {};
    let infoPanel = {
      nodeId: ip.nodeId || null,
      lines: Array.isArray(ip.lines)
        ? ip.lines.map((line) => ({ text: String(line?.text ?? ''), revealed: Number(line?.revealed) || 0 }))
        : [],
      opacity: Number.isFinite(ip.opacity) ? ip.opacity : 0,
      startTime: Number.isFinite(ip.startTime) ? ip.startTime : 0,
      totalExtent: Number.isFinite(ip.totalExtent) ? ip.totalExtent : 0,
      totalExtentY: Number.isFinite(ip.totalExtentY) ? ip.totalExtentY : 0,
      centeredForNode: ip._centeredForNode || null,
    };

    let snapshot = JSON.parse(JSON.stringify({
      kind: CANVAS_GRAPH_RENDER_SNAPSHOT_KIND,
      version: CANVAS_GRAPH_RENDER_SNAPSHOT_VERSION,
      renderMode: this.renderMode,
      surface: this._getRenderSurface(),
      graph: {
        nodeIds: (this.nodes || []).map((node) => node.id).sort(),
        edges: (this.edges || []).map((edge, index) => ({ index, from: edge.from, to: edge.to })),
      },
      viewport: {
        zoom: this.zoom,
        panX: this.panX,
        panY: this.panY,
        targetZoom: this._targetZoom,
        targetPanX: this._targetPanX,
        targetPanY: this._targetPanY,
        zoomAnchor: this._zoomAnchor ? { mx: this._zoomAnchor.mx, my: this._zoomAnchor.my } : null,
        viewportEase: this._viewportEase,
      },
      focus: {
        focusX: this.focusX - focusCenterX,
        focusY: this.focusY - focusCenterY,
        focusActive: !!this.focusActive,
        prevDragDeltaX: this._prevDragDeltaX,
        prevDragDeltaY: this._prevDragDeltaY,
        orientationParallaxEnabled: !!this._orientationParallaxEnabled,
        orientationParallaxX: this._orientationParallaxX,
        orientationParallaxY: this._orientationParallaxY,
        orientationParallaxTargetX: this._orientationParallaxTargetX,
        orientationParallaxTargetY: this._orientationParallaxTargetY,
      },
      layerAnim: this.layerAnim,
      positions,
      smoothPositions,
      nodeAnim,
      edgeAnim,
      interaction: {
        activeNodeId: this.activeNode?.id || null,
        nextActiveNodeId: this.nextActiveNode?.id || null,
        hoverNodeId: this.hoverNode?.id || null,
        dragNodeId: this.dragNode?.id || null,
        currentGroupId: this.currentGroupId || null,
        deactivating: !!this.deactivating,
        menuAnim: this.menuAnim,
        hoverAction: this._hoverAction || '',
      },
      transitionMarkers: (this._transitionMarkers || []).map((marker) => this._serializeTransitionMarker(marker)),
      pulses: (this._pulses || []).map((pulse) => ({
        id: pulse.id,
        startTime: pulse.startTime,
        duration: pulse.duration,
        waves: pulse.waves,
      })),
      nodeAppearances: [...(this._nodeAppearances?.entries?.() || [])].map(([id, marker]) => ({
        id,
        startTime: marker.startTime,
        duration: marker.duration,
      })),
      infoPanel,
      meta: {
        idleFrames: this._idleFrames,
        lastAlpha: this.lastAlpha,
        frameCount: this.frameCount,
        tickCount: this.tickCount,
        layoutSettled: !!this.layoutSettled,
        lastRenderTime: Number.isFinite(this._lastRenderTime) ? this._lastRenderTime : null,
      },
    }));
    if (!normalizeCanvasGraphRenderSnapshot(snapshot)) {
      throw new Error('CanvasGraph render state is not serializable');
    }
    return snapshot;
  }

  _serializeTransitionMarker(marker) {
    let out = {
      fromId: marker.fromId,
      toId: marker.toId,
      path: Array.isArray(marker.path) ? [...marker.path] : [],
      startTime: marker.startTime,
      duration: marker.duration,
    };
    if (marker.pendingActivation) out.pendingActivation = marker.pendingActivation;
    for (let key of ['pendingViewport', 'initialViewport', 'routeViewport']) {
      let vp = marker[key];
      if (vp && Number.isFinite(vp.zoom)) {
        out[key] = { zoom: vp.zoom, panX: vp.panX, panY: vp.panY };
        if (Number.isFinite(vp.viewportEase)) out[key].viewportEase = vp.viewportEase;
      }
    }
    for (let key of ['initialCenter', 'routeCenter', 'targetCenter', 'targetCenterOffset']) {
      let vec = marker[key];
      if (vec && Number.isFinite(vec.x) && Number.isFinite(vec.y)) out[key] = { x: vec.x, y: vec.y };
    }
    if (marker.pendingPulse) {
      out.pendingPulse = { duration: marker.pendingPulse.duration, waves: marker.pendingPulse.waves };
    }
    return out;
  }

  /**
   * @param {object} snapshot
   * @returns {boolean}
   */
  setRenderSnapshot(snapshot) {
    let normalized = normalizeCanvasGraphRenderSnapshot(snapshot);
    if (!normalized) return false;
    if (!normalized.meta.layoutSettled || !this._matchesRenderSurface(normalized.surface)) return false;

    let nodeMap = this.nodeMap instanceof Map ? this.nodeMap : new Map();
    let graphNodeIds = this.graphDB?.nodes instanceof Map ? this.graphDB.nodes : new Map();
    let currentNodeIds = (this.nodes || []).map((node) => node.id).sort();
    let allNodeIds = [...graphNodeIds.keys()].sort();
    if (normalized.renderMode !== this.renderMode
      || JSON.stringify(normalized.graph.nodeIds) !== JSON.stringify(currentNodeIds)
      || normalized.graph.edges.length !== (this.edges || []).length
      || normalized.graph.edges.some((entry, index) => (
        entry.index !== index
        || entry.from !== this.edges[index]?.from
        || entry.to !== this.edges[index]?.to
      ))) return false;

    let resolveIdentity = (id) => {
      if (!id) return { ok: true, node: null };
      let node = nodeMap.get(id);
      return node ? { ok: true, node } : { ok: false, node: null };
    };
    let activeResolve = resolveIdentity(normalized.interaction.activeNodeId);
    let nextResolve = resolveIdentity(normalized.interaction.nextActiveNodeId);
    let hoverResolve = resolveIdentity(normalized.interaction.hoverNodeId);
    let dragResolve = resolveIdentity(normalized.interaction.dragNodeId);
    if (!activeResolve.ok || !nextResolve.ok || !hoverResolve.ok || !dragResolve.ok) return false;

    let groupId = normalized.interaction.currentGroupId;
    if (groupId && !graphNodeIds.has(groupId)) return false;

    let referencedNodeIds = [
      ...normalized.positions.map(([id]) => id),
      ...normalized.smoothPositions.map(([id]) => id),
      ...normalized.nodeAnim.map(([id]) => id),
      ...normalized.pulses.map((entry) => entry.id),
      ...normalized.nodeAppearances.map((entry) => entry.id),
      normalized.infoPanel.nodeId,
      normalized.infoPanel.centeredForNode,
      ...normalized.transitionMarkers.flatMap((marker) => [
        marker.fromId,
        marker.toId,
        marker.pendingActivation,
        ...marker.path,
      ]),
    ].filter(Boolean);
    if (referencedNodeIds.some((id) => !graphNodeIds.has(id))) return false;
    let snapshotNodeAnimIds = normalized.nodeAnim.map(([id]) => id).sort();
    if (JSON.stringify(snapshotNodeAnimIds) !== JSON.stringify(currentNodeIds)) return false;
    if (normalized.meta.layoutSettled) {
      let positionIds = normalized.positions.map(([id]) => id).sort();
      let smoothPositionIds = normalized.smoothPositions.map(([id]) => id).sort();
      if (JSON.stringify(positionIds) !== JSON.stringify(allNodeIds)
        || JSON.stringify(smoothPositionIds) !== JSON.stringify(allNodeIds)) return false;
    }
    if (normalized.edgeAnim.length !== (this.edges || []).length
      || normalized.edgeAnim.some((entry, index) => (
        entry.index !== index
        || entry.from !== this.edges[index]?.from
        || entry.to !== this.edges[index]?.to
      ))) return false;

    let stagedPositions = new Map();
    for (let [id, vec] of normalized.positions) {
      stagedPositions.set(id, { x: vec.x, y: vec.y });
    }
    let stagedSmooth = new Map();
    for (let [id, vec] of normalized.smoothPositions) {
      stagedSmooth.set(id, { x: vec.x, y: vec.y });
    }
    let stagedNodeAnim = new Map(normalized.nodeAnim);
    let stagedPulses = normalized.pulses.map((pulse) => ({ ...pulse }));
    let stagedAppearances = new Map();
    for (let appearance of normalized.nodeAppearances) {
      stagedAppearances.set(appearance.id, { startTime: appearance.startTime, duration: appearance.duration });
    }
    let stagedMarkers = normalized.transitionMarkers.map((marker) => this._serializeTransitionMarker(marker));

    if (this.worker) {
      try {
        this.worker.stop();
      } catch {
        return false;
      }
    }
    this._workerGeneration = (this._workerGeneration || 0) + 1;
    this.worker = null;
    this.zoom = normalized.viewport.zoom;
    this.panX = normalized.viewport.panX;
    this.panY = normalized.viewport.panY;
    this._targetZoom = normalized.viewport.targetZoom;
    this._targetPanX = normalized.viewport.targetPanX;
    this._targetPanY = normalized.viewport.targetPanY;
    this._viewportEase = normalized.viewport.viewportEase;
    this._zoomAnchor = normalized.viewport.zoomAnchor
      ? { mx: normalized.viewport.zoomAnchor.mx, my: normalized.viewport.zoomAnchor.my }
      : null;

    let { vcx: focusCenterX, vcy: focusCenterY } = this._focusCanvasCenter();
    this.focusX = normalized.focus.focusX + focusCenterX;
    this.focusY = normalized.focus.focusY + focusCenterY;
    this.focusActive = normalized.focus.focusActive;
    this._prevDragDeltaX = normalized.focus.prevDragDeltaX;
    this._prevDragDeltaY = normalized.focus.prevDragDeltaY;
    this._orientationParallaxEnabled = normalized.focus.orientationParallaxEnabled;
    this._orientationParallaxX = normalized.focus.orientationParallaxX;
    this._orientationParallaxY = normalized.focus.orientationParallaxY;
    this._orientationParallaxTargetX = normalized.focus.orientationParallaxTargetX;
    this._orientationParallaxTargetY = normalized.focus.orientationParallaxTargetY;

    this.layerAnim = {};
    for (let d = 0; d <= 4; d++) {
      this.layerAnim[d] = { ...normalized.layerAnim[d] };
    }

    this.nodePositions = stagedPositions;
    this.smoothPositions = stagedSmooth;

    for (let node of this.nodes || []) {
      let anim = stagedNodeAnim.get(node.id);
      if (anim) {
        node.aScale = anim.aScale;
        node.aGlow = anim.aGlow;
        node.aRot = anim.aRot;
        node.aRotSpeed = anim.aRotSpeed;
      } else {
        delete node.aScale;
        delete node.aGlow;
        delete node.aRot;
        delete node.aRotSpeed;
      }
    }

    for (let [index, edge] of (this.edges || []).entries()) {
      edge.aAlpha = normalized.edgeAnim[index].aAlpha;
      edge.aWidth = normalized.edgeAnim[index].aWidth;
    }

    this.activeNode = activeResolve.node;
    this.nextActiveNode = nextResolve.node;
    this.hoverNode = hoverResolve.node;
    this.dragNode = dragResolve.node;
    this.currentGroupId = groupId;
    this.deactivating = normalized.interaction.deactivating;
    this.menuAnim = normalized.interaction.menuAnim;
    this._hoverAction = normalized.interaction.hoverAction;

    this._transitionMarkers = stagedMarkers;
    this._pulses = stagedPulses;
    this._nodeAppearances = stagedAppearances;

    this._infoPanel = {
      nodeId: normalized.infoPanel.nodeId,
      lines: normalized.infoPanel.lines.map((line) => ({ text: line.text, revealed: line.revealed })),
      opacity: normalized.infoPanel.opacity,
      startTime: normalized.infoPanel.startTime,
      totalExtent: normalized.infoPanel.totalExtent,
      totalExtentY: normalized.infoPanel.totalExtentY,
      _centeredForNode: normalized.infoPanel.centeredForNode,
    };

    this._idleFrames = normalized.meta.idleFrames;
    this.lastAlpha = normalized.meta.lastAlpha;
    this.frameCount = normalized.meta.frameCount;
    this.tickCount = normalized.meta.tickCount;
    this.layoutSettled = normalized.meta.layoutSettled;
    this._lastRenderTime = normalized.meta.lastRenderTime;

    this.updateInteractionDepths();

    this.needsDraw = true;
    this._wakeLoop?.();
    return true;
  }

  setEventNames(eventNames = {}) {
    this.eventNames = { ...DEFAULT_EVENT_NAMES, ...eventNames };
  }

  setActionItems(items) {
    this.actionItems = Array.isArray(items) ? [...items] : [...DEFAULT_MENU_ITEMS];
  }

  getActionItems() {
    return this.actionItems || [...DEFAULT_MENU_ITEMS];
  }

  getDeviceOrientationParallaxStatus() {
    return { ...this._orientationParallaxStatus };
  }

  _resolveDeviceOrientationParallaxOptions(options = {}) {
    let strengthAttr = Number.parseFloat(this.getAttribute('device-orientation-parallax-strength') || '');
    let maxTiltAttr = Number.parseFloat(this.getAttribute('device-orientation-parallax-max-tilt') || '');
    return {
      ...options,
      strength: Number.isFinite(options.strength)
        ? options.strength
        : Number.isFinite(strengthAttr)
          ? strengthAttr
          : undefined,
      maxTilt: Number.isFinite(options.maxTilt)
        ? options.maxTilt
        : Number.isFinite(maxTiltAttr)
          ? maxTiltAttr
          : undefined,
      absolute: options.absolute ?? this.hasAttribute('device-orientation-parallax-absolute'),
    };
  }

  _setDeviceOrientationParallaxStatus(status) {
    let detail = {
      supported: status.supported ?? null,
      enabled: status.enabled === true,
      permission: status.permission || '',
      reason: status.reason || '',
      errorName: status.errorName || '',
    };
    this._orientationParallaxStatus = detail;
    this.setAttribute('data-orientation-parallax', detail.enabled ? 'enabled' : detail.reason || detail.permission || 'disabled');
    this._emitGraphEvent('orientationParallaxStatus', detail, {
      bubbles: true,
      composed: true,
    });
    return detail;
  }

  _requestDeviceOrientationParallaxFromGesture() {
    if (!this.hasAttribute('device-orientation-parallax')) return;
    if (this._orientationParallaxEnabled || this._orientationParallaxAutoPending || this._orientationParallaxAutoSettled) return;
    this._orientationParallaxAutoPending = true;
    this.enableDeviceOrientationParallax(this._resolveDeviceOrientationParallaxOptions())
      .then((result) => {
        this._orientationParallaxAutoSettled = result.enabled === true
          || result.reason === 'no-window'
          || result.reason === 'no-device-orientation'
          || result.reason === 'insecure-context'
          || result.permission === 'denied';
      })
      .catch((error) => {
        this._setDeviceOrientationParallaxStatus({
          supported: true,
          enabled: false,
          reason: 'permission-error',
          errorName: error?.name || 'Error',
        });
      })
      .finally(() => {
        this._orientationParallaxAutoPending = false;
      });
  }

  async enableDeviceOrientationParallax(options = {}) {
    if (typeof globalThis.window === 'undefined' || typeof globalThis.window.addEventListener !== 'function') {
      return this._setDeviceOrientationParallaxStatus({ supported: false, enabled: false, reason: 'no-window' });
    }
    if (typeof globalThis.DeviceOrientationEvent === 'undefined') {
      return this._setDeviceOrientationParallaxStatus({ supported: false, enabled: false, reason: 'no-device-orientation' });
    }
    if (globalThis.isSecureContext === false) {
      return this._setDeviceOrientationParallaxStatus({ supported: false, enabled: false, reason: 'insecure-context' });
    }

    let requestPermission = globalThis.DeviceOrientationEvent.requestPermission;
    if (typeof requestPermission === 'function' && options.requestPermission !== false) {
      let permission;
      try {
        permission = await requestPermission.call(globalThis.DeviceOrientationEvent, Boolean(options.absolute));
      } catch (error) {
        return this._setDeviceOrientationParallaxStatus({
          supported: true,
          enabled: false,
          reason: 'permission-error',
          errorName: error?.name || 'Error',
        });
      }
      if (permission !== 'granted') {
        return this._setDeviceOrientationParallaxStatus({ supported: true, enabled: false, permission });
      }
    }

    this.disableDeviceOrientationParallax();
    let strength = Number.isFinite(options.strength) ? options.strength : 32;
    let maxTilt = Number.isFinite(options.maxTilt) ? Math.max(1, options.maxTilt) : 32;
    let handleOrientation = (event) => {
      let gamma = Number(event.gamma);
      let beta = Number(event.beta);
      if (!Number.isFinite(gamma) && !Number.isFinite(beta)) return;
      this._orientationParallaxTargetX = Math.max(-1, Math.min(1, (Number.isFinite(gamma) ? gamma : 0) / maxTilt)) * strength;
      this._orientationParallaxTargetY = Math.max(-1, Math.min(1, (Number.isFinite(beta) ? beta : 0) / maxTilt)) * strength;
      this.needsDraw = true;
      this._wakeLoop();
    };
    globalThis.window.addEventListener('deviceorientation', handleOrientation, { passive: true });
    this._orientationParallaxCleanup = () => {
      globalThis.window.removeEventListener('deviceorientation', handleOrientation);
    };
    this._orientationParallaxEnabled = true;
    return this._setDeviceOrientationParallaxStatus({ supported: true, enabled: true, permission: 'granted' });
  }

  disableDeviceOrientationParallax() {
    this._orientationParallaxCleanup?.();
    this._orientationParallaxCleanup = null;
    this._orientationParallaxEnabled = false;
    this._orientationParallaxTargetX = 0;
    this._orientationParallaxTargetY = 0;
    this._orientationParallaxX = 0;
    this._orientationParallaxY = 0;
    this._orientationParallaxAutoPending = false;
    this._orientationParallaxAutoSettled = false;
    this._setDeviceOrientationParallaxStatus({ supported: null, enabled: false, reason: 'disabled' });
  }

  setSemanticPathPrefix(prefix) {
    this.semanticPathPrefix = typeof prefix === 'string' ? prefix : 'cluster:';
  }

  _isSemanticPath(path) {
    return Boolean(this.semanticPathPrefix && typeof path === 'string' && path.startsWith(this.semanticPathPrefix));
  }

  _emitGraphEvent(name, detail = {}, options = {}) {
    const type = this.eventNames?.[name] || DEFAULT_EVENT_NAMES[name] || name;
    return this.dispatchEvent(new CustomEvent(type, { detail, ...options }));
  }

  setPath(pathStr) {
    if (!pathStr) {
      if (this.currentGroupId) this.loadLevel(null);
      return;
    }

    if (this._isSemanticPath(pathStr)) {
      this.focusSemanticCluster(pathStr);
      return;
    }

    if (pathStr !== this.currentGroupId) {
      this.loadLevel(pathStr);
    }
  }

  setGraphModel(model) {
    let previousIds = new Set(this.graphDB?.nodes?.keys?.() || []);
    this.graphDB = createCanvasGraphStore(model);
    let nextIds = [...this.graphDB.nodes.keys()];
    let nextIdSet = new Set(nextIds);
    this._pruneGraphState(nextIdSet);
    let useCrystalLayout = this._usesCrystalForceLayout();
    let initialLayoutSeeded = previousIds.size === 0 && !useCrystalLayout && this._seedInitialNodePositions(nextIds);
    let enteringIds = previousIds.size === 0
      ? nextIds
      : nextIds.filter((id) => !previousIds.has(id));
    let retainedIds = nextIds.filter((id) => previousIds.has(id));
    this._layoutWarmupIds = previousIds.size === 0 ? new Set() : new Set(enteringIds);
    if (!useCrystalLayout) this._seedEnteringNodePositions(enteringIds);
    this._queueNodeAppearances(enteringIds);
    let retainedPositionIds = retainedIds.filter((id) => this._getPositionForNode(id));
    let retainedPositionCount = retainedPositionIds.length;
    let incrementalLayout = retainedPositionCount > 0;
    this._layoutPreserveIds = incrementalLayout ? new Set(retainedPositionIds) : new Set();

    // Center the first model before the worker starts; incremental graph growth
    // must preserve the camera so live event replay does not snap to origin.
    const rect = this.canvas.getBoundingClientRect();
    if (previousIds.size === 0 && rect.width > 0) {
      this.panX = rect.width / 2;
      this.panY = rect.height / 2;
    }

    this.loadLevel(null, { incrementalLayout, initialLayoutSeeded });
  }

  _getPositionForNode(id) {
    return this.smoothPositions.get(id)
      || this.nodePositions.get(id)
      || this._layoutSnapshot?.positions?.[id]
      || null;
  }

  _resolveEnteringNodeSeedPosition(id, index, count) {
    let linkedPositions = [];
    for (const edge of this.graphDB?.edges || []) {
      let linkedId = null;
      if (edge.from === id) linkedId = edge.to;
      else if (edge.to === id) linkedId = edge.from;
      if (!linkedId) continue;
      let position = this._getPositionForNode(linkedId);
      if (position) linkedPositions.push(position);
    }
    let base = averageCanvasPoints(linkedPositions);
    if (!base) {
      base = averageCanvasPoints([...this.nodePositions.values(), ...this.smoothPositions.values()]);
    }
    if (!base) return null;
    let offset = getEnteringNodeSeedOffset(id, index, count);
    return {
      x: base.x + offset.x,
      y: base.y + offset.y,
    };
  }

  _seedEnteringNodePositions(enteringIds) {
    let ids = normalizeFocusNodeIds(enteringIds);
    if (ids.length === 0 || this.nodePositions.size === 0) return;
    for (let index = 0; index < ids.length; index++) {
      let id = ids[index];
      if (this.nodePositions.has(id)) continue;
      let position = this._resolveEnteringNodeSeedPosition(id, index, ids.length);
      if (!position) continue;
      this.nodePositions.set(id, position);
      this.smoothPositions.set(id, { ...position });
    }
  }

  _seedInitialNodePositions(nodeIds) {
    let ids = normalizeFocusNodeIds(nodeIds);
    if (ids.length === 0 || this.nodePositions.size > 0) return false;

    let idSet = new Set(ids);
    let groups = normalizeForceGroups(this.graphDB?.groups || {}, idSet);
    let groupEntries = Object.entries(groups)
      .map(([groupId, members]) => [groupId, members.filter((id) => idSet.has(id))])
      .filter(([, members]) => members.length > 0);
    let groupedIds = new Set(groupEntries.flatMap(([, members]) => members));
    let ungrouped = ids.filter((id) => !groupedIds.has(id));
    if (ungrouped.length > 0) groupEntries.push(['__ungrouped__', ungrouped]);
    if (groupEntries.length === 0) groupEntries.push(['__all__', ids]);

    let groupCount = groupEntries.length;
    let groupRadius = groupCount <= 1 ? 0 : Math.max(150, Math.sqrt(ids.length) * 54);
    for (let groupIndex = 0; groupIndex < groupCount; groupIndex++) {
      let [groupId, members] = groupEntries[groupIndex];
      let groupAngle = groupCount <= 1
        ? 0
        : -Math.PI / 2 + (Math.PI * 2 * groupIndex) / groupCount;
      let center = {
        x: Math.cos(groupAngle) * groupRadius,
        y: Math.sin(groupAngle) * groupRadius,
      };
      let localRadius = Math.max(42, Math.sqrt(members.length) * (groupCount <= 1 ? 40 : 30));
      let angleOffset = stableUnit(`${groupId}:seed-angle`) * Math.PI * 2;
      for (let memberIndex = 0; memberIndex < members.length; memberIndex++) {
        let id = members[memberIndex];
        if (this.nodePositions.has(id)) continue;
        let node = this.graphDB?.nodes?.get(id);
        let isGroupCenter = node?.isGroup && id === groupId;
        let angle = angleOffset + (Math.PI * 2 * memberIndex) / Math.max(1, members.length);
        let radius = isGroupCenter ? 0 : localRadius + stableUnit(`${id}:seed-radius`) * 18;
        let position = {
          x: center.x + Math.cos(angle) * radius,
          y: center.y + Math.sin(angle) * radius,
        };
        this.nodePositions.set(id, position);
        this.smoothPositions.set(id, { ...position });
      }
    }
    return this.nodePositions.size > 0;
  }

  _pruneGraphState(nodeIds) {
    for (const id of this.nodePositions.keys()) {
      if (!nodeIds.has(id)) this.nodePositions.delete(id);
    }
    for (const id of this.smoothPositions.keys()) {
      if (!nodeIds.has(id)) this.smoothPositions.delete(id);
    }
    for (const id of this._nodeAppearances.keys()) {
      if (!nodeIds.has(id)) this._nodeAppearances.delete(id);
    }
    for (const id of this._layoutWarmupIds || []) {
      if (!nodeIds.has(id)) this._layoutWarmupIds.delete(id);
    }
    for (const id of this._layoutPreserveIds || []) {
      if (!nodeIds.has(id)) this._layoutPreserveIds.delete(id);
    }
    this._transitionMarkers = (this._transitionMarkers || [])
      .filter((marker) => nodeIds.has(marker.fromId) && nodeIds.has(marker.toId));
  }

  setForceLayoutOptions(options = {}, { restart = false } = {}) {
    this._forceLayoutOverrides = sanitizeForceLayoutOptions(options);
    if (this.worker) {
      this.worker.updateConfig?.(this._forceLayoutOverrides);
      if (restart) {
        this.startWorker({
          activeGroupId: this.currentGroupId,
          boundaryRadius: this.currentGroupId ? this.graphDB.nodes.get(this.currentGroupId)?.w / 2 : null,
          attractors: null,
        });
      }
    }
    this.needsDraw = true;
    this._wakeLoop();
  }

  _usesCrystalForceLayout() {
    return this._forceLayoutOverrides?.layoutAlgorithm === 'crystal';
  }

  _resolveVisualScale(stateKey, attributeName, fallback, options = {}) {
    let attributeValue = this.getAttribute?.(attributeName);
    let value = attributeValue !== null && attributeValue !== undefined
      ? attributeValue
      : this.$?.[stateKey];
    return normalizeCanvasGraphScale(value, fallback, options);
  }

  _resolveActiveNodeScale() {
    return this._resolveVisualScale('activeNodeScale', 'active-node-scale', DEFAULT_ACTIVE_NODE_SCALE, {
      min: 0.1,
      max: 6,
    });
  }

  _resolveInfoPanelScale() {
    return this._resolveVisualScale('infoPanelScale', 'info-panel-scale', DEFAULT_INFO_PANEL_SCALE, {
      min: 0.1,
      max: 4,
    });
  }

  setVisualOptions(options = {}) {
    options ||= {};
    if (Object.hasOwn(options, 'activeNodeScale')) {
      this.$.activeNodeScale = normalizeCanvasGraphScale(options.activeNodeScale, DEFAULT_ACTIVE_NODE_SCALE, {
        min: 0.1,
        max: 6,
      });
    }
    if (Object.hasOwn(options, 'infoPanelScale')) {
      this.$.infoPanelScale = normalizeCanvasGraphScale(options.infoPanelScale, DEFAULT_INFO_PANEL_SCALE, {
        min: 0.1,
        max: 4,
      });
    }
    this.needsDraw = true;
    this._wakeLoop();
  }

  _getWorkerNodeDimensions(node) {
    let width = node?.w;
    let height = node?.h;
    if (this.renderMode === 'dots') {
      const conns = this.adjMap.get(node.id)?.size || 0;
      const radius = getNodeRadius(node, conns, { scale: 1 });
      width = radius * 2;
      height = radius * 2;
    }
    return { width, height };
  }

  _queueNodeAppearances(nodeIds, options = {}) {
    if (!Array.isArray(nodeIds) || nodeIds.length === 0) return;
    let now = renderNow();
    let duration = Number.isFinite(options.durationMs) ? options.durationMs : 700;
    let stagger = Number.isFinite(options.staggerMs) ? options.staggerMs : 12;
    for (let index = 0; index < nodeIds.length; index++) {
      let id = String(nodeIds[index] || '').trim();
      if (!id) continue;
      this._nodeAppearances.set(id, {
        startTime: now + index * stagger,
        duration,
      });
    }
    this.needsDraw = true;
    this._wakeLoop();
  }

  animateNodeAppearance(nodeIds = null, options = {}) {
    let ids = nodeIds === null || nodeIds === undefined
      ? this.nodes.map((node) => node.id)
      : normalizeFocusNodeIds(nodeIds);
    this._queueNodeAppearances(ids, options);
    return ids.length;
  }

  _resolveNodeAppearance(nodeId, now = renderNow()) {
    let marker = this._nodeAppearances?.get(nodeId);
    if (!marker) return { alpha: 1, scale: 1 };
    let elapsed = now - marker.startTime;
    if (elapsed >= marker.duration) {
      return { alpha: 1, scale: 1 };
    }
    let progress = Math.max(0, Math.min(1, elapsed / Math.max(1, marker.duration)));
    let eased = progress < 0.5
      ? 4 * progress * progress * progress
      : 1 - Math.pow(-2 * progress + 2, 3) / 2;
    this.needsDraw = true;
    return {
      alpha: eased,
      scale: NODE_APPEARANCE_START_SCALE + (1 - NODE_APPEARANCE_START_SCALE) * eased,
    };
  }

  _hasActiveNodeAppearances(now = renderNow()) {
    for (let marker of this._nodeAppearances?.values() || []) {
      if (now < marker.startTime + marker.duration) return true;
    }
    return false;
  }

  _hasAnimatingNodeStatuses() {
    for (let node of this.nodes || []) {
      if (isCanvasGraphAnimatingStatus(getCanvasGraphNodeStatus(node))) return true;
    }
    return false;
  }

  _drawNodeIcon(ctx, node, pos, radius, typeRgb, layerOpacity) {
    let icon = getCanvasGraphNodeIcon(node);
    if (!icon || radius <= 0) return;

    let screenRadius = radius * this.zoom;
    let isActive = this.activeNode && this.activeNode.id === node.id;
    let status = getCanvasGraphNodeStatus(node);
    if (screenRadius < 8 && !isActive && !isCanvasGraphAnimatingStatus(status)) return;

    let iconRgb = getCanvasGraphReadableIconRgb(typeRgb);
    let iconSize = Math.max(radius * 0.5, Math.min(radius * 0.95, 14 / Math.max(0.45, this.zoom)));
    drawCanvasGraphIcon(ctx, icon, pos.x, pos.y, iconSize, toRgba(iconRgb, 0.9 * layerOpacity), layerOpacity);
  }

  /**
   * Draw the reusable poster for a node carrying a
   * normalized `params.media` descriptor. Returns true when a poster was drawn
   * so the caller can skip the fallback icon. Never mounts a player/iframe.
   * @returns {boolean}
   */
  _drawNodeMedia(ctx, node, pos, radius, typeRgb, layerOpacity) {
    let descriptor = getCanvasGraphNodeMedia(node);
    if (!descriptor || radius <= 0) return false;

    let drewPoster = drawCanvasGraphNodeMedia(ctx, {
      descriptor,
      x: pos.x,
      y: pos.y,
      radius,
      images: this._mediaImages,
      layerOpacity,
    });
    return drewPoster;
  }

  _drawStatusBadge(ctx, pos, radius, typeRgb, status, layerOpacity) {
    let badgeRadius = Math.max(radius * 0.22, 4 / Math.max(0.45, this.zoom));
    let x = pos.x + radius * 0.62;
    let y = pos.y + radius * 0.62;
    ctx.save();
    ctx.fillStyle = toRgba(this._bgRgb, 0.88 * layerOpacity);
    ctx.strokeStyle = toRgba(typeRgb, 0.9 * layerOpacity);
    ctx.lineWidth = Math.max(1, badgeRadius * 0.16);
    ctx.beginPath();
    ctx.arc(x, y, badgeRadius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = toRgba(typeRgb, layerOpacity);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = Math.max(1.1, badgeRadius * 0.22);
    ctx.beginPath();
    if (CANVAS_GRAPH_ERROR_STATUSES.has(status)) {
      ctx.moveTo(x - badgeRadius * 0.32, y - badgeRadius * 0.32);
      ctx.lineTo(x + badgeRadius * 0.32, y + badgeRadius * 0.32);
      ctx.moveTo(x + badgeRadius * 0.32, y - badgeRadius * 0.32);
      ctx.lineTo(x - badgeRadius * 0.32, y + badgeRadius * 0.32);
    } else {
      ctx.moveTo(x - badgeRadius * 0.36, y);
      ctx.lineTo(x - badgeRadius * 0.08, y + badgeRadius * 0.28);
      ctx.lineTo(x + badgeRadius * 0.4, y - badgeRadius * 0.34);
    }
    ctx.stroke();
    ctx.restore();
  }

  _drawNodeStatusIndicator(ctx, node, pos, radius, typeRgb, layerOpacity, now) {
    let status = getCanvasGraphNodeStatus(node);
    if (!status || radius <= 0) return;

    let screenRadius = radius * this.zoom;
    let isActive = this.activeNode && this.activeNode.id === node.id;
    if (screenRadius < 6 && !isActive && !isCanvasGraphAnimatingStatus(status)) return;

    if (isCanvasGraphAnimatingStatus(status)) {
      let ringRadius = radius + Math.max(radius * 0.16, 3 / Math.max(0.45, this.zoom));
      let angle = (now / 620) % (Math.PI * 2);
      let arc = status === 'queued' ? Math.PI * 0.8 : Math.PI * 1.35;
      ctx.save();
      ctx.strokeStyle = toRgba(typeRgb, 0.28 * layerOpacity);
      ctx.lineWidth = Math.max(1, ringRadius * 0.06);
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, ringRadius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = toRgba(typeRgb, 0.95 * layerOpacity);
      ctx.lineWidth = Math.max(1.2, ringRadius * 0.08);
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, ringRadius, angle, angle + arc);
      ctx.stroke();
      ctx.restore();
      this.needsDraw = true;
      return;
    }

    if ((CANVAS_GRAPH_DONE_STATUSES.has(status) || CANVAS_GRAPH_ERROR_STATUSES.has(status)) && (screenRadius >= 12 || isActive)) {
      this._drawStatusBadge(ctx, pos, radius, typeRgb, status, layerOpacity);
    }
  }

  rebuildNodeMap() { this.nodeMap = new Map(this.nodes.map(n => [n.id, n])); }

  rebuildAdjMap() {
    this.adjMap.clear();
    for (const n of this.nodes) this.adjMap.set(n.id, new Set());
    for (const e of this.edges) {
      if (this.adjMap.has(e.from)) this.adjMap.get(e.from).add(e.to);
      if (this.adjMap.has(e.to)) this.adjMap.get(e.to).add(e.from);
    }
  }

  updateInteractionDepths() {
    this.interactionDepths.clear();
    const activeGroupId = this.currentGroupId;
    const focusNode = this.activeNode || this.dragNode;

    // Establish baseline target depths for all nodes
    for (const node of this.nodes) {
      if (activeGroupId) {
        if (node.parentId === activeGroupId) node.targetDepth = focusNode ? 3 : 0;
        else if (node.id === activeGroupId) node.targetDepth = 4; // Hide the container group itself
        else node.targetDepth = 4; // Other nodes hidden when inside a group
      } else {
        node.targetDepth = focusNode ? 3 : 0; // Dim to 3 if focused, 0 otherwise
      }
    }

    for (const edge of this.edges) { edge.targetDepth = 4; edge.minTargetDepth = 4; }

    if (!focusNode) {
      for (const edge of this.edges) {
        const d1 = this.nodeMap.get(edge.from)?.targetDepth ?? 4;
        const d2 = this.nodeMap.get(edge.to)?.targetDepth ?? 4;
        edge.targetDepth = Math.max(d1, d2);
        edge.minTargetDepth = Math.min(d1, d2);
      }
      return;
    }

    // BFS from focusNode
    const queue = [[focusNode.id, 0]];
    const visited = new Set([focusNode.id]);
    this.interactionDepths.set(focusNode.id, 0);

    while (queue.length > 0) {
      const [curr, depth] = queue.shift();
      const currNode = this.nodeMap.get(curr);
      if (currNode) currNode.targetDepth = depth;

      if (depth >= 3) continue;
      const neighbors = this.adjMap.get(curr) || new Set();
      for (const n of neighbors) {
        if (!visited.has(n)) {
          visited.add(n);
          this.interactionDepths.set(n, depth + 1);
          queue.push([n, depth + 1]);
        }
      }
    }

    for (const edge of this.edges) {
      const d1 = this.interactionDepths.has(edge.from) ? this.interactionDepths.get(edge.from) : 4;
      const d2 = this.interactionDepths.has(edge.to) ? this.interactionDepths.get(edge.to) : 4;
      edge.targetDepth = Math.max(d1, d2);
      edge.minTargetDepth = Math.min(d1, d2);
    }
  }

  loadLevel(groupId = null, levelOptions = {}) {
    const requestedGroup = groupId ? this.graphDB.nodes.get(groupId) : null;
    if (requestedGroup?.isSemanticCluster && !levelOptions.enterSemanticCluster) {
      this.focusSemanticCluster(groupId);
      return;
    }

    this._wakeLoop();  // View changed — resume rendering
    this.activeNode = null;
    this.dragNode = null;
    this.hoverNode = null;
    this.menuAnim = 0;
    this.deactivating = false;

    for (const node of this.graphDB.nodes.values()) {
      if (node.isGroup) {
        const groupR = getNodeRadius(node, 0);
        node.w = groupR * 2;
        node.h = groupR * 2;
      }
    }

    let activeIds = [...this.graphDB.rootNodes];

    if (!groupId) {
      this.currentGroupId = null;
      if (this.breadcrumb?.setPath) this.breadcrumb.setPath([]);
    } else {
      const group = this.graphDB.nodes.get(groupId);
      if (group) {
        this.currentGroupId = groupId;
        if (!activeIds.includes(groupId)) activeIds.push(groupId);
        activeIds.push(...group.children);

        const childR = DOT_RADIUS * 1.5;
        const dynamicSize = Math.sqrt(group.children.length) * childR * 3 + childR * 4;
        group.w = dynamicSize;
        group.h = dynamicSize;

        // Render existing symbiote-ui breadcrumbs
        if (this.breadcrumb?.setPath) {
          const parts = groupId.split('/');
          const pathArr = [{ label: 'Root', level: '' }];
          let acc = '';
          for (let i = 0; i < parts.length; i++) {
            if (!parts[i]) continue;
            acc += (acc ? '/' : '') + parts[i];
            pathArr.push({ label: parts[i], level: acc });
          }
          this.breadcrumb.setPath(pathArr);
        }

      } else {
        // Fallback to root if group not found
        this.currentGroupId = null;
        if (this.breadcrumb?.setPath) this.breadcrumb.setPath([]);
      }
    }

    this.nodes = activeIds.map(id => this.graphDB.nodes.get(id)).filter(Boolean);

    for (const n of this.nodes) {
      if (n.parentId && n.parentId === groupId) {
        n.w = this.renderMode === 'dots' ? DOT_RADIUS * 1.5 : 160 * 0.6;
        n.h = this.renderMode === 'dots' ? DOT_RADIUS * 1.5 : 40 * 0.6;
      }
    }

    const activeSet = new Set(activeIds);
    this.edges = this.graphDB.edges.filter(e => activeSet.has(e.from) || activeSet.has(e.to));

    this.rebuildNodeMap();
    this.rebuildAdjMap();
    this.updateInteractionDepths();

    let workerOptions = {
      activeGroupId: this.currentGroupId,
      boundaryRadius: this.currentGroupId ? this.graphDB.nodes.get(this.currentGroupId).w / 2 : null,
      attractors: null,
    };
    if (levelOptions.incrementalLayout) {
      workerOptions.initialAlpha = INCREMENTAL_LAYOUT_INITIAL_ALPHA;
    } else if (levelOptions.initialLayoutSeeded) {
      workerOptions.initialAlpha = SEEDED_LAYOUT_INITIAL_ALPHA;
    }
    this.startWorker(workerOptions);

    this._emitGraphEvent('pathChanged', { path: this.currentGroupId || '' });
  }

  getVisibleForceGroups() {
    return normalizeForceGroups(
      this.graphDB.groups || {},
      new Set(this.nodes.map((node) => node.id))
    );
  }

  getWorkerOptions(customOptions = null, forceGroups = {}) {
    const autoOptions = getForceLayoutOptions(this.nodes.length, {
      continuous: true,
      groups: forceGroups,
      edges: this.edges,
    });
    return {
      linkStrength: this.$.linkStrength,
      centerStrength: this.$.centerStrength,
      velocityDecay: this.$.velocityDecay,
      collideStrength: this.$.collideStrength,
      alphaDecay: this.$.alphaDecay,
      theta: this.$.theta,
      groupDistance: this.$.groupDistance,
      groupStrength: this.$.groupStrength,
      wellStrength: this.$.wellStrength,
      centerPull: this.$.centerPull,
      wellRepulsion: this.$.wellRepulsion,
      crossLinkScale: this.$.crossLinkScale,
      contAlphaFloor: this.$.alphaFloor,
      contAlphaTarget: this.$.alphaTarget,
      brownian: this.$.brownian,
      brownianThresh: this.$.brownianThresh,
      pinReheat: this.$.pinReheat,
      pinCap: this.$.pinCap,
      nodeWidth: this.renderMode === 'dots' ? DOT_RADIUS * 2 : 160,
      nodeHeight: this.renderMode === 'dots' ? DOT_RADIUS * 2 : 40,
      mode: 'continuous',
      positionOrigin: this.renderMode === 'dots' ? 'center' : 'top-left',
      activeVisualNodeId: null,
      ...autoOptions,
      ...this._forceLayoutOverrides,
      ...(customOptions || {}),
    };
  }

  startWorker(customOptions = null) {
    this._lastWorkerOptions = customOptions;
    if (this.worker) this.worker.stop();
    this._workerGeneration += 1;
    this.worker = null;
    if (this._layoutSuspended) return;
    const workerGeneration = this._workerGeneration;
    this.layoutSettled = false;
    this.worker = new ForceLayout(ForceLayout.defaultWorkerUrl());

    this.worker.onTick = (positions, meta = {}) => {
      if (workerGeneration !== this._workerGeneration) return;
      const draggedId = this.dragNode ? this.dragNode.id : null;
      for (const [id, p] of Object.entries(positions || {})) {
        if (!this.graphDB.nodes.has(id)) continue;
        if (id === draggedId) continue;
        const pos = this.nodePositions.get(id);
        if (pos) {
          pos.x = p.x;
          pos.y = p.y;
        } else {
          this.nodePositions.set(id, p);
        }
      }
      this.lastAlpha = meta.alpha || 0;
      this.tickCount++;
      this.frameCount++;
      this._wakeLoop();
      this._emitGraphEvent('layoutTick', { alpha: this.lastAlpha });
    };

    this.worker.onDone = (positions) => {
      if (workerGeneration !== this._workerGeneration) return;
      if (positions) {
        for (const [id, pos] of Object.entries(positions)) {
          if (this.graphDB.nodes.has(id)) this.nodePositions.set(id, pos);
        }
      }
      this._pruneGraphState(new Set(this.graphDB.nodes.keys()));
      this.layoutSettled = true;
      this._emitGraphEvent('layoutDone');
      this._emitLayoutSnapshot();
    };

    const forceGroups = this.getVisibleForceGroups();
    const options = this.getWorkerOptions(customOptions, forceGroups);
    const reseedCrystalLayout = options.layoutAlgorithm === 'crystal' && customOptions?.crystalReseed === true;

    this.worker.start({
      nodes: this.nodes.map(n => {
        const restoredPos = this._layoutSnapshot?.positions?.[n.id];
        const pos = reseedCrystalLayout
          ? null
          : this.smoothPositions.get(n.id) || this.nodePositions.get(n.id) || restoredPos;
        if (!reseedCrystalLayout && restoredPos && !this.nodePositions.has(n.id)) {
          this.nodePositions.set(n.id, { x: restoredPos.x, y: restoredPos.y });
        }
        const dimensions = this._getWorkerNodeDimensions(n);
        let finalW = dimensions.width, finalH = dimensions.height;
        const isEntering = this._layoutWarmupIds?.has(n.id);
        const isPreserved = this._layoutPreserveIds?.has(n.id);
        const usesCenterPosition = this.renderMode === 'dots';
        const workerX = pos ? pos.x + (usesCenterPosition ? 0 : finalW / 2) : undefined;
        const workerY = pos ? pos.y + (usesCenterPosition ? 0 : finalH / 2) : undefined;
        return {
          id: n.id, type: n.type, parentId: n.parentId, isGroup: !!n.isGroup,
          children: n.children || [], group: findForceNodeGroup(forceGroups, n.id),
          x: workerX, y: workerY, w: finalW, h: finalH,
          mass: getNodeWeight(n),
          layoutParticipation: isEntering ? 0.02 : isPreserved ? 0.06 : 1,
          layoutWarmupTicks: isEntering ? 72 : isPreserved ? 120 : 0,
          layoutSizeScale: isEntering ? ENTERING_LAYOUT_SIZE_SCALE : 1,
          layoutSizeWarmupTicks: isEntering ? ENTERING_LAYOUT_SIZE_WARMUP_TICKS : 0,
          layoutFixedTicks: isPreserved ? 42 : 0,
        };
      }),
      edges: this.edges.filter(e => this.nodeMap.has(e.from) && this.nodeMap.has(e.to)),
      groups: forceGroups,
      options,
    });

    this.smoothPositions.clear();
    const viewport = this._layoutSnapshot?.viewport;
    if (viewport && Number.isFinite(viewport.panX) && Number.isFinite(viewport.panY) && Number.isFinite(viewport.zoom)) {
      this.panX = viewport.panX;
      this.panY = viewport.panY;
      this.zoom = viewport.zoom;
      this._targetPanX = null;
      this._targetPanY = null;
      this._targetZoom = viewport.zoom;
    }
    this.paused = false;
  }

  getSmooth(id) { return this.smoothPositions.get(id) || this.nodePositions.get(id); }

  nodeCenter(id) {
    const pos = this.getSmooth(id);
    if (!pos) return null;
    if (this.renderMode === 'dots') return { x: pos.x, y: pos.y };
    const node = this.nodeMap.get(id);
    if (!node) return { x: pos.x, y: pos.y };
    return { x: pos.x + node.w / 2, y: pos.y + node.h / 2 };
  }

  resizeOffscreenCanvases() {
    const dpr = window.devicePixelRatio || 1;
    for (let i = 1; i <= 4; i++) {
      const oc = this.offscreenCanvases[i].canvas;
      if (oc.width !== this.canvas.width || oc.height !== this.canvas.height) {
        oc.width = this.canvas.width;
        oc.height = this.canvas.height;
      }
    }
  }

  blendBg(r, g, b, alpha) {
    const br = this._bgR, bg = this._bgG, bb = this._bgB;
    const rr = (r * alpha + br * (1 - alpha)) | 0;
    const gg = (g * alpha + bg * (1 - alpha)) | 0;
    const bbb = (b * alpha + bb * (1 - alpha)) | 0;
    return `rgb(${rr},${gg},${bbb})`;
  }

  _bindThemeSync() {
    this._themeChangeHandler = () => this._scheduleCanvasThemeSync();
    this.ownerDocument?.addEventListener?.('cascade-theme-change', this._themeChangeHandler);

    if (typeof globalThis.MutationObserver !== 'function') return;
    this._themeObserver = new MutationObserver(() => this._scheduleCanvasThemeSync());
    let themeSources = [
      this.ownerDocument?.documentElement,
      this.ownerDocument?.body,
      this.parentElement,
      this,
    ].filter(Boolean);
    let seen = new Set();
    for (let source of themeSources) {
      if (seen.has(source)) continue;
      seen.add(source);
      this._themeObserver.observe(source, { attributes: true, attributeFilter: ['class', 'style'] });
    }
  }

  _scheduleCanvasThemeSync() {
    if (this._themeSyncQueued) return;
    this._themeSyncQueued = true;
    this._cancelThemeSync = scheduleFrame(() => {
      this._themeSyncQueued = false;
      this._cancelThemeSync = null;
      this.syncCanvasTheme();
      this.needsDraw = true;
      this._wakeLoop();
    });
  }

  syncCanvasTheme() {
    this._bgRgb = readThemeRgbAny(this, ['--sn-canvas-graph-bg', '--sn-sys-surface'], this._bgRgb);
    this._edgeRgb = readThemeRgbAny(this, ['--sn-canvas-graph-edge', '--sn-conn-color', '--sn-sys-accent'], this._edgeRgb);
    this._pulseRgb = readThemeRgbAny(this, ['--sn-canvas-graph-pulse', '--sn-sys-accent'], this._pulseRgb);
    this._dangerRgb = readThemeRgbAny(this, ['--sn-canvas-graph-danger', '--sn-sys-danger'], this._dangerRgb);
    this._textRgb = readThemeRgbAny(this, ['--sn-canvas-graph-text', '--sn-sys-on-surface'], this._textRgb);
    this._textDimRgb = readThemeRgbAny(this, ['--sn-canvas-graph-text-dim', '--sn-sys-on-surface-dim'], this._textDimRgb);
    this._panelBgRgb = readThemeRgbAny(
      this,
      ['--sn-canvas-graph-panel-bg', '--sn-canvas-graph-bg', '--sn-sys-surface'],
      this._bgRgb
    );
    this._panelBorderRgb = readThemeRgbAny(this, ['--sn-canvas-graph-panel-border', '--sn-sys-outline'], this._panelBorderRgb);
    this._menuIconRgb = readThemeRgbAny(this, ['--sn-canvas-graph-radial-icon', '--sn-sys-surface-panel'], this._menuIconRgb);
    this._ghostRgb = readThemeRgbAny(this, ['--sn-canvas-graph-ghost', '--sn-sys-on-surface-dim'], this._ghostRgb);
    for (let [type, token] of Object.entries(GRAPH_TYPE_COLOR_TOKENS)) {
      this._typeColorRgb[type] = readThemeRgb(this, token, this._typeColorRgb[type] || this._edgeRgb);
    }

    [this._bgR, this._bgG, this._bgB] = this._bgRgb;
    this._ghostColor = toRgba(this._ghostRgb, 1);
  }

  draw() {
    if (this._inDraw) {
      this.needsDraw = true;
      return false;
    }
    if (!this.canvas) {
      this._animationFrame = 0;
      this._loopRunning = false;
      return false;
    }
    this._inDraw = true;
    try {
      return this._drawFrame();
    } finally {
      this._inDraw = false;
    }
  }

  _drawFrame() {
    const dpr = window.devicePixelRatio || 1;
    let frameContext = resolveCanvasGraphFrameContext(renderNow(), this._lastRenderTime);
    let { now, frameStep } = frameContext;
    this._lastRenderTime = now;

    this._updateTransitionMarkerViewport(now);
    let viewport = resolveViewportAnimation({
      zoom: this.zoom,
      targetZoom: this._targetZoom,
      panX: this.panX,
      panY: this.panY,
      targetPanX: this._targetPanX,
      targetPanY: this._targetPanY,
      zoomAnchor: this._zoomAnchor,
      viewportEase: this._viewportEase,
      frameStep,
    });
    this.zoom = viewport.zoom;
    this.panX = viewport.panX;
    this.panY = viewport.panY;
    this._targetPanX = viewport.targetPanX;
    this._targetPanY = viewport.targetPanY;
    if (this._targetPanX === null && Math.abs(this._targetZoom - this.zoom) <= 0.0001) {
      this._viewportEase = DEFAULT_VIEWPORT_EASE;
    }

    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    this.resizeOffscreenCanvases();
    const mainCtx = this.ctx;
    const isIdle = (!this.activeNode && !this.currentGroupId) || this.deactivating;
    const hasPendingActivation = this._hasPendingActivationMarker(this.nextActiveNode?.id);

    let deactivation = hasPendingActivation ? {
      activeNode: this.activeNode,
      nextActiveNode: this.nextActiveNode,
      deactivating: this.deactivating,
      deselected: false,
      interactionDepthsChanged: false,
    } : resolveDeactivationFrame({
      deactivating: this.deactivating,
      activeNode: this.activeNode,
      nextActiveNode: this.nextActiveNode,
      layerAnim: this.layerAnim,
    });
    this.activeNode = deactivation.activeNode;
    this.nextActiveNode = deactivation.nextActiveNode;
    this.deactivating = deactivation.deactivating;
    if (deactivation.deselected) {
      this._emitGraphEvent('nodeDeselected');
    }
    if (deactivation.interactionDepthsChanged) {
      this.updateInteractionDepths();
    }

    const inGroupMode = !!this.currentGroupId;
    this.layerAnim = getLayerAnimationFrame({
      layerAnim: this.layerAnim,
      layerTargets: this.LAYER_TARGETS,
      isIdle,
      inGroupMode,
      frameStep,
    });

    const vcx = this.canvas.width / 2;
    const vcy = this.canvas.height / 2;
    let dragDeltaX = 0, dragDeltaY = 0;

    let activePosition = this.activeNode ? this.nodePositions.get(this.activeNode.id) : null;
    const viewportTargetActive = this._targetPanX !== null
      || this._targetPanY !== null
      || Math.abs(this._targetZoom - this.zoom) > 0.001;
    let shouldCenterFocus = this.activeNode
      && !this.deactivating
      && !viewportTargetActive
      && this._infoPanel._centeredForNode !== this.activeNode.id
      && this._infoPanel.totalExtent > 0;
    let focus = resolveFocusFrame({
      activeNode: this.activeNode,
      deactivating: this.deactivating,
      activePosition,
      infoPanel: this._infoPanel,
      canvasRect: shouldCenterFocus ? this.canvas.getBoundingClientRect() : null,
      dpr,
      zoom: this.zoom,
      panX: this.panX,
      panY: this.panY,
      focusX: this.focusX,
      focusY: this.focusY,
      focusActive: this.focusActive,
      vcx,
      vcy,
      frameStep,
    });
    this.focusX = focus.focusX;
    this.focusY = focus.focusY;
    this.focusActive = focus.focusActive;
    dragDeltaX = focus.dragDeltaX;
    dragDeltaY = focus.dragDeltaY;
    if (this._orientationParallaxEnabled) {
      let orientationEase = resolveCanvasGraphFrameEase(0.12, frameStep);
      this._orientationParallaxX += (this._orientationParallaxTargetX - this._orientationParallaxX) * orientationEase;
      this._orientationParallaxY += (this._orientationParallaxTargetY - this._orientationParallaxY) * orientationEase;
      if (
        Math.abs(this._orientationParallaxTargetX - this._orientationParallaxX) > 0.05
        || Math.abs(this._orientationParallaxTargetY - this._orientationParallaxY) > 0.05
      ) {
        this.needsDraw = true;
      }
    }
    const visualDragDeltaX = dragDeltaX + this._orientationParallaxX;
    const visualDragDeltaY = dragDeltaY + this._orientationParallaxY;
    this._visualDragDeltaX = visualDragDeltaX;
    this._visualDragDeltaY = visualDragDeltaY;
    this._infoPanel._centeredForNode = focus.centeredForNode;
    if (focus.targetPanX !== null) {
      this._targetPanX = focus.targetPanX;
      this._targetPanY = focus.targetPanY;
    }

    for (let i = 1; i <= 4; i++) {
      const octx = this.offscreenCanvases[i].ctx;
      const la = this.layerAnim[i];
      const s = la.scale;
      const pOffX = -la.parallax * visualDragDeltaX;
      const pOffY = -la.parallax * visualDragDeltaY;

      octx.setTransform(1, 0, 0, 1, 0, 0);
      octx.clearRect(0, 0, this.canvas.width, this.canvas.height);
      octx.setTransform(s * dpr * this.zoom, 0, 0, s * dpr * this.zoom,
                        s * dpr * this.panX + vcx * (1 - s) + pOffX,
                        s * dpr * this.panY + vcy * (1 - s) + pOffY);
    }

    const t = resolveCanvasGraphFrameEase(1 - this.smoothing, frameStep);
    for (const [id, raw] of this.nodePositions) {
      const prev = this.smoothPositions.get(id);
      if (!prev) {
        this.smoothPositions.set(id, { x: raw.x, y: raw.y });
      } else {
        if (this.dragNode && this.dragNode.id === id) {
          prev.x = raw.x; prev.y = raw.y;
        } else {
          prev.x += (raw.x - prev.x) * t;
          prev.y += (raw.y - prev.y) * t;
        }
      }
    }

    this.depthGroups = getDepthGroupsFrame({
      edges: this.edges,
      nodes: this.nodes,
      activeNode: this.activeNode,
      dragNode: this.dragNode,
      hoverNode: this.hoverNode,
    });

    const resolveLayerTransform = (d) => {
      return getLayerTransform({
        depth: d,
        layerAnim: this.layerAnim,
        dpr,
        zoom: this.zoom,
        panX: this.panX,
        panY: this.panY,
        vcx,
        vcy,
        focusActive: this.focusActive,
        focusX: this.focusX,
        focusY: this.focusY,
        dragDeltaX,
        dragDeltaY,
      });
    };

    const drawDepth = (d, currentCtx) => {
      const la = this.layerAnim[d];
      const layerOpacity = la.opacity;
      const isGhost = inGroupMode && d >= 3;
      const GHOST_COLOR = this._ghostColor;
      const tCurrent = resolveLayerTransform(d);

      const mapPosToEdgeLayer = (pos, nodeDepth) => {
        if (!pos || nodeDepth === d) return pos;
        const tNode = resolveLayerTransform(nodeDepth);
        const screenX = tNode.A * pos.x + tNode.E;
        const screenY = tNode.A * pos.y + tNode.F;
        return { x: (screenX - tCurrent.E) / tCurrent.A, y: (screenY - tCurrent.F) / tCurrent.A };
      };

      const nodeAppearanceNow = now;
      const focusNodeId = this.dragNode?.id || this.activeNode?.id || null;

      currentCtx.strokeStyle = toRgba(this._edgeRgb, 0.25);
      currentCtx.lineWidth = 1.5;

      // Edges
      for (const edge of this.depthGroups[d].edges) {
        let from = this.nodeCenter(edge.from);
        let to = this.nodeCenter(edge.to);

        if ((!from || !to) && this.currentGroupId) {
          const activeId = this.currentGroupId;
          const activePos = this.smoothPositions.get(activeId);
          const activeNode = this.graphDB.nodes.get(activeId);
          if (activePos && activeNode) {
            const radius = activeNode.w / 2;
            if (!from && to) {
              const angle = parseInt(edge.from.slice(-1), 16) || 0;
              from = { x: activePos.x + Math.cos(angle) * radius, y: activePos.y + Math.sin(angle) * radius };
            } else if (from && !to) {
              const angle = parseInt(edge.to.slice(-1), 16) || 0;
              to = { x: activePos.x + Math.cos(angle) * radius, y: activePos.y + Math.sin(angle) * radius };
            }
          }
        }

        if (!from || !to) continue;

        let tAlpha = 0.5, tWidth = 1.5;
        if (this.dragNode) {
          const minD = edge.minTargetDepth;
          if (minD === 0) { tAlpha = 1; tWidth = 3.0; }
          else if (minD === 1) { tAlpha = 0.8; tWidth = 2.0; }
          else if (minD === 2) { tAlpha = 0.4; tWidth = 1.5; }
          else { tAlpha = 0.05; tWidth = 1.0; }
        }

        let edgeFocus = resolveCanvasGraphEdgeFocus({
          edge,
          focusNodeId,
          alpha: tAlpha,
          width: tWidth,
        });
        tAlpha = edgeFocus.alpha;
        tWidth = edgeFocus.width;

        const edgeOpacity = tAlpha * layerOpacity;
        edge.aAlpha = edge.aAlpha !== undefined ? edge.aAlpha : 0.5;
        edge.aWidth = edge.aWidth || 1.5;
        let edgeEase = resolveCanvasGraphFrameEase(0.1, frameStep);
        edge.aAlpha += (edgeOpacity - edge.aAlpha) * edgeEase;
        edge.aWidth += (tWidth - edge.aWidth) * edgeEase;

        const nodeFrom = this.nodeMap ? this.nodeMap.get(edge.from) : null;
        const nodeTo = this.nodeMap ? this.nodeMap.get(edge.to) : null;
        const fromDepth = nodeFrom?.targetDepth ?? 4;
        const toDepth = nodeTo?.targetDepth ?? 4;

        from = mapPosToEdgeLayer(from, fromDepth);
        to = mapPosToEdgeLayer(to, toDepth);

        const zoomFactor = this.zoom * (this.layerAnim[d]?.scale || 1);
        const wFrom = (edge.aWidth * 2.0) / zoomFactor, wTo = wFrom;
        const dx = to.x - from.x, dy = to.y - from.y;
        const len = Math.sqrt(dx * dx + dy * dy);
        if (len < 0.1) continue;

        const nx = -dy / len, ny = dx / len;

        let fillStyle;
        if (isGhost) {
          fillStyle = GHOST_COLOR;
        } else if (focusNodeId && !edgeFocus.active) {
          fillStyle = this.blendBg(
            this._ghostRgb[0],
            this._ghostRgb[1],
            this._ghostRgb[2],
            0.28
          );
        } else if (this.dragNode || this.activeNode) {
          const fromOpacity = this.layerAnim[fromDepth].opacity;
          const toOpacity = this.layerAnim[toDepth].opacity;
          const fromTC = getNodeColor(nodeFrom || {}, this._typeColorRgb);
          const toTC = getNodeColor(nodeTo || {}, this._typeColorRgb);
          const grad = currentCtx.createLinearGradient(from.x, from.y, to.x, to.y);
          grad.addColorStop(0, this.blendBg(fromTC[0], fromTC[1], fromTC[2], fromOpacity * 0.7));
          grad.addColorStop(1, this.blendBg(toTC[0], toTC[1], toTC[2], toOpacity * 0.7));
          fillStyle = grad;
        } else {
          const fromTC = getNodeColor(nodeFrom || {}, this._typeColorRgb);
          fillStyle = this.blendBg(fromTC[0], fromTC[1], fromTC[2], 0.35);
        }

        currentCtx.save();
        currentCtx.globalAlpha *= edge.aAlpha;
        currentCtx.fillStyle = fillStyle;
        currentCtx.beginPath();
        const midX = from.x + dx * 0.5, midY = from.y + dy * 0.5;
        const pinchRatio = Math.max(0.001, Math.pow(20 / Math.max(20, len), 2.8));
        const pinchW = Math.min(wFrom, wTo) * pinchRatio;
        const ang = Math.atan2(dy, dx);

        currentCtx.moveTo(from.x + nx * wFrom, from.y + ny * wFrom);
        currentCtx.quadraticCurveTo(midX + nx * pinchW, midY + ny * pinchW, to.x + nx * wTo, to.y + ny * wTo);
        currentCtx.arc(to.x, to.y, wTo, ang + Math.PI/2, ang - Math.PI/2, true);
        currentCtx.quadraticCurveTo(midX - nx * pinchW, midY - ny * pinchW, from.x - nx * wFrom, from.y - ny * wFrom);
        currentCtx.arc(from.x, from.y, wFrom, ang - Math.PI/2, ang - Math.PI * 1.5, true);
        currentCtx.closePath();
        currentCtx.fill();
        currentCtx.restore();
      }

      // Nodes
      const activeNodeScale = this._resolveActiveNodeScale();
      for (const node of this.depthGroups[d].nodes) {
        if (this.currentGroupId && node.id === this.currentGroupId) continue;
        const pos = this.getSmooth(node.id);
        if (!pos) continue;
        const isActive = this.activeNode && this.activeNode.id === node.id;
        const tc = getNodeColor(node, this._typeColorRgb);
        const conns = this.adjMap.get(node.id)?.size || 0;

        const targetScale = isActive ? activeNodeScale : 1;
        node.aScale = node.aScale !== undefined ? node.aScale : 1;
        node.aScale += (targetScale - node.aScale) * resolveCanvasGraphFrameEase(0.12, frameStep);

        node.aGlow = node.aGlow !== undefined ? node.aGlow : 0;
        node.aGlow += ((isActive ? 1 : 0) - node.aGlow) * resolveCanvasGraphFrameEase(0.1, frameStep);

        const appearance = this._resolveNodeAppearance(node.id, nodeAppearanceNow);
        currentCtx.save();
        currentCtx.globalAlpha *= appearance.alpha;
        if (Math.abs(appearance.scale - 1) > 0.001) {
          currentCtx.translate(pos.x, pos.y);
          currentCtx.scale(appearance.scale, appearance.scale);
          currentCtx.translate(-pos.x, -pos.y);
        }

        let drawnRadius = 0;
        if (this.renderMode === 'dots') {
          let r = getNodeRadius(node, conns, { scale: node.aScale });
          drawnRadius = r;

          if (isGhost) {
            currentCtx.beginPath();
            currentCtx.arc(pos.x, pos.y, r * 0.7, 0, Math.PI * 2);
            currentCtx.fillStyle = GHOST_COLOR;
            currentCtx.fill();
          } else if (node.isGroup) {
            const ringW = r * 0.12;
            currentCtx.beginPath();
            currentCtx.arc(pos.x, pos.y, r, 0, Math.PI * 2);
            currentCtx.fillStyle = toRgba(this._bgRgb, layerOpacity);
            currentCtx.fill();

            currentCtx.beginPath();
            currentCtx.arc(pos.x, pos.y, r, 0, Math.PI * 2);
            currentCtx.arc(pos.x, pos.y, r - ringW, 0, Math.PI * 2, true);
            currentCtx.fillStyle = this.blendBg(tc[0], tc[1], tc[2], layerOpacity);
            currentCtx.fill();

            const { childCount, innerR, orbitR } = getGroupOrbitMetrics(node, conns, {
              scale: node.aScale || 1,
            });
            const isHovered = this.hoverNode && this.hoverNode.id === node.id;
            const isDragged = this.dragNode && this.dragNode.id === node.id;
            node.aRotSpeed = node.aRotSpeed || 0;
            const rotation = resolveGroupOrbitRotationFrame({
              rotation: node.aRot || 0,
              rotationSpeed: node.aRotSpeed,
              hovered: isHovered,
              dragged: isDragged,
              frameStep,
            });
            node.aRotSpeed = rotation.rotationSpeed;
            node.aRot = rotation.rotation;

            for (let k = 0; k < childCount; k++) {
              const angle = (k * Math.PI * 2 / childCount) - Math.PI / 2 + node.aRot;
              const cx = pos.x + Math.cos(angle) * orbitR;
              const cy = pos.y + Math.sin(angle) * orbitR;
              currentCtx.beginPath();
              currentCtx.arc(cx, cy, innerR, 0, Math.PI * 2);
              currentCtx.fillStyle = this.blendBg(tc[0], tc[1], tc[2], layerOpacity * 0.7);
              currentCtx.fill();
            }
            if (node.aGlow > 0.01) {
              currentCtx.strokeStyle = `rgba(${tc[0]},${tc[1]},${tc[2]},${layerOpacity * 0.6 * node.aGlow})`;
              currentCtx.lineWidth = 2 * node.aGlow;
              currentCtx.beginPath();
              currentCtx.arc(pos.x, pos.y, r + 4 * node.aGlow, 0, Math.PI * 2);
              currentCtx.stroke();
            }
          } else {
            currentCtx.beginPath();
            currentCtx.arc(pos.x, pos.y, r, 0, Math.PI * 2);
            currentCtx.fillStyle = this.blendBg(tc[0], tc[1], tc[2], layerOpacity);
            currentCtx.fill();
            if (node.aGlow > 0.01) {
              currentCtx.strokeStyle = `rgba(${tc[0]},${tc[1]},${tc[2]},${layerOpacity * 0.6 * node.aGlow})`;
              currentCtx.lineWidth = 2 * node.aGlow;
              currentCtx.beginPath();
              currentCtx.arc(pos.x, pos.y, r + 4 * node.aGlow, 0, Math.PI * 2);
              currentCtx.stroke();
            }
          }
        }
        if (!isGhost && drawnRadius > 0) {
          this._drawNodeStatusIndicator(currentCtx, node, pos, drawnRadius, tc, layerOpacity, nodeAppearanceNow);
          let drewMedia = !node.isGroup && this._drawNodeMedia(currentCtx, node, pos, drawnRadius, tc, layerOpacity);
          if (!drewMedia) {
            this._drawNodeIcon(currentCtx, node, pos, drawnRadius, tc, layerOpacity);
          }
        }
        currentCtx.restore();
      }
    };

    for (let d = 4; d >= 1; d--) drawDepth(d, this.offscreenCanvases[d].ctx);

    mainCtx.setTransform(1, 0, 0, 1, 0, 0);
    for (let d = 4; d >= 1; d--) {
      const blurPx = this.LAYER_TARGETS.blur[d];
      const blurIntensity = Math.abs(1 - this.layerAnim[d].scale) * blurPx * 8;
      mainCtx.filter = blurIntensity > 0.3 ? `blur(${blurIntensity.toFixed(1)}px)` : 'none';
      mainCtx.drawImage(this.offscreenCanvases[d].canvas, 0, 0);
    }
    mainCtx.filter = 'none';

    {
      const s = this.layerAnim[0].scale;
      if (this.focusActive && Math.abs(s - 1) > 0.001) {
        mainCtx.setTransform(s * dpr * this.zoom, 0, 0, s * dpr * this.zoom, this.focusX * (1 - s) + s * dpr * this.panX, this.focusY * (1 - s) + s * dpr * this.panY);
      } else {
        mainCtx.setTransform(dpr * this.zoom, 0, 0, dpr * this.zoom, dpr * this.panX, dpr * this.panY);
      }
      drawDepth(0, mainCtx);

      if (this._pulses && this._pulses.length > 0) {
        this._pulses = this._pulses.filter(p => {
          const elapsed = now - p.startTime;
          if (elapsed > p.duration) return false;
          const pos = this.getSmooth(p.id) || this.nodePositions.get(p.id);
          if (!pos) return false;
          const progress = elapsed / p.duration;
          const waves = Number.isFinite(p.waves) ? Math.max(1, p.waves) : 1;
          const pulsePhase = (progress * waves) % 1;
          const r = 20 + (pulsePhase * 80);
          const opacity = 1 - pulsePhase;
          mainCtx.beginPath();
          mainCtx.arc(pos.x, pos.y, r, 0, Math.PI * 2);
          mainCtx.lineWidth = Math.max(1.5, 3 / Math.max(0.1, this.zoom));
          mainCtx.strokeStyle = toRgba(this._pulseRgb, opacity * 0.7);
          mainCtx.stroke();
          this.needsDraw = true;
          return true;
        });
      }
      this._drawTransitionMarkers(mainCtx, now);
      if (this._pulses?.length) this.needsDraw = true;
    }

    const showMenu = this.activeNode && !this.dragNode && !this.deactivating;
    if (showMenu) {
      this.menuAnim = Math.min(1, this.menuAnim + 0.08 * frameStep);
    } else {
      this.menuAnim = Math.max(0, this.menuAnim - 0.15 * frameStep);
    }

    if (this.menuAnim > 0.01 && this.activeNode) {
      const apos = this.getSmooth(this.activeNode.id);
      if (apos) {
        const conns = this.adjMap.get(this.activeNode.id)?.size || 0;
        const menuLayout = getRadialMenuLayout({
          activeNode: this.activeNode,
          activePosition: apos,
          connectionCount: conns,
          menuItems: this.getActionItems(),
          menuAnim: this.menuAnim,
        });
        const easeOut = menuLayout.easeOut;
        const ir = menuLayout.itemRadius;

        const s = this.layerAnim[0].scale;
        if (this.focusActive && Math.abs(s - 1) > 0.001) {
          mainCtx.setTransform(s * dpr * this.zoom, 0, 0, s * dpr * this.zoom, this.focusX * (1 - s) + s * dpr * this.panX, this.focusY * (1 - s) + s * dpr * this.panY);
        } else {
          mainCtx.setTransform(dpr * this.zoom, 0, 0, dpr * this.zoom, dpr * this.panX, dpr * this.panY);
        }

        const tc = getNodeColor(this.activeNode, this._typeColorRgb);
        for (const entry of menuLayout.items) {
          const item = entry.item;
          const isHovered = this._hoverAction === item.action;
          const itemRadius = isHovered ? ir * 1.36 : ir;
          const fillAlpha = isHovered ? 1 : 0.9;
          const iconAlpha = isHovered ? 1 : easeOut;

          mainCtx.beginPath();
          mainCtx.arc(entry.x, entry.y, itemRadius, 0, Math.PI * 2);
          mainCtx.fillStyle = item.danger
            ? toRgba(this._dangerRgb, (isHovered ? 0.48 : 0.25) * easeOut)
            : toRgba(tc, fillAlpha * easeOut);
          mainCtx.fill();

          mainCtx.save();
          const iconScale = (itemRadius * (isHovered ? 1.16 : 1.2)) / 24;
          if (iconScale > 0) {
            mainCtx.translate(entry.x - 12 * iconScale, entry.y - 12 * iconScale);
            mainCtx.scale(iconScale, iconScale);
            const p = new Path2D(item.path);
            mainCtx.fillStyle = item.danger
              ? toRgba(this._dangerRgb, iconAlpha)
              : toRgba(this._menuIconRgb, iconAlpha);
            mainCtx.fill(p);
          }
          mainCtx.restore();
        }
      }
    }

    // Info panel — typewriter HUD to the right of active node
    this._drawInfoPanel(mainCtx, dpr, dragDeltaX, dragDeltaY, vcx, vcy, now, frameStep);

    let idle = resolveIdleFrame({
      targetZoom: this._targetZoom,
      zoom: this.zoom,
      dragDeltaX,
      dragDeltaY,
      prevDragDeltaX: this._prevDragDeltaX || 0,
      prevDragDeltaY: this._prevDragDeltaY || 0,
      layerAnim: this.layerAnim,
      isIdle,
      layerTargets: this.LAYER_TARGETS,
      lastAlpha: this.lastAlpha,
      dragNode: this.dragNode,
      isPanning: this.isPanning,
      deactivating: this.deactivating,
      targetPanX: this._targetPanX,
      infoPanel: this._infoPanel,
      nodeAppearancesActive: this._hasActiveNodeAppearances(),
      pulsesActive: this._pulses?.length > 0,
      statusAnimationsActive: this._hasAnimatingNodeStatuses(),
      idleFrames: this._idleFrames,
      frameStep,
    });
    this._prevDragDeltaX = idle.prevDragDeltaX;
    this._prevDragDeltaY = idle.prevDragDeltaY;
    this._idleFrames = idle.idleFrames;
    if (idle.shouldStop && this._transitionMarkers?.length > 0) {
      idle.shouldStop = false;
      this.needsDraw = true;
    }

    // Allow 3 extra frames after convergence to flush final sub-pixel lerps
    if (idle.shouldStop) {
      this._loopRunning = false;
      this._animationFrame = 0;
      return true;
    }

    if (this._externalFrameDrive) {
      this._loopRunning = false;
      this._animationFrame = 0;
      return true;
    }
    this._animationFrame = requestAnimationFrame(() => this.draw());
    return true;
  }

  /**
   * Build metadata lines for the info panel from skeleton + node data
   * @param {object} node - graph node
   * @returns {string[]}
   */
  _buildInfoLines(node) {
    const lines = [];
    lines.push(node.label);
    if (node.id !== node.label) lines.push(node.id);
    lines.push('');

    const typeLabels = {
      data: 'Data',
      action: 'Action',
      output: 'Output',
      config: 'Config',
      external: 'External',
      style: 'Style',
      docs: 'Docs',
      asset: 'Asset',
      group: 'Directory'
    };
    lines.push(`Type: ${typeLabels[node.type] || node.type}`);

    const conns = this.adjMap.get(node.id)?.size || 0;
    if (conns > 0) lines.push(`Connections: ${conns}`);

    if (node.children?.length > 0) {
      lines.push(`Children: ${node.children.length}`);
    }

    if (Array.isArray(node.exports) && node.exports.length > 0) {
      lines.push('');
      lines.push('Exports:');
      for (const exp of node.exports.slice(0, 8)) {
        lines.push(`  ${exp}`);
      }
      if (node.exports.length > 8) lines.push(`  ... +${node.exports.length - 8}`);
    }

    if (node.lines) lines.push(`Lines: ${node.lines}`);

    return lines;
  }

  /**
   * Draw info panel HUD to the right of the active node
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} dpr
   * @param {number} dragDeltaX
   * @param {number} dragDeltaY
   * @param {number} vcx
   * @param {number} vcy
   */
  _drawInfoPanel(ctx, dpr, dragDeltaX, dragDeltaY, vcx, vcy, now = renderNow(), frameStep = 1) {
    const ip = this._infoPanel;
    const showPanel = this.activeNode && !this.dragNode && !this.deactivating;

    if (showPanel && this.activeNode) {
      if (ip.nodeId !== this.activeNode.id) {
        ip.nodeId = this.activeNode.id;
        ip.lines = this._buildInfoLines(this.activeNode).map(text => ({ text, revealed: 0 }));
        ip.startTime = now;
        ip.opacity = 0;
      }
      ip.opacity = Math.min(1, ip.opacity + 0.06 * frameStep);
    } else {
      ip.opacity = Math.max(0, ip.opacity - 0.12 * frameStep);
      if (ip.opacity <= 0) { ip.nodeId = null; ip.lines = []; ip.totalExtent = 0; ip.totalExtentY = 0; ip._centeredForNode = null; }
    }

    if (ip.opacity <= 0.01 || ip.lines.length === 0) return;

    const elapsed = now - ip.startTime;
    const CHAR_SPEED = 18;
    const LINE_DELAY = 60;
    let charBudget = Math.floor(elapsed / CHAR_SPEED);
    for (let i = 0; i < ip.lines.length; i++) {
      const line = ip.lines[i];
      const available = Math.max(0, charBudget - i * LINE_DELAY / CHAR_SPEED);
      line.revealed = Math.min(line.text.length, Math.floor(available));
    }

    const apos = this.activeNode ? this.getSmooth(this.activeNode.id) : null;
    if (!apos) return;

    // Apply depth-0 transform — panel lives in world-space, scales with nodes
    const s = this.layerAnim[0].scale;
    if (this.focusActive && Math.abs(s - 1) > 0.001) {
      ctx.setTransform(s * dpr * this.zoom, 0, 0, s * dpr * this.zoom,
        this.focusX * (1 - s) + s * dpr * this.panX,
        this.focusY * (1 - s) + s * dpr * this.panY);
    } else {
      ctx.setTransform(dpr * this.zoom, 0, 0, dpr * this.zoom, dpr * this.panX, dpr * this.panY);
    }

    const panelLayout = this._measureInfoPanelLayout(this.activeNode, apos, ip.lines);
    if (!panelLayout) return;
    const {
      metrics: panelMetrics,
      panelX,
      panelY,
    } = panelLayout;

    // Store total extent for focus centering
    ip.totalExtent = panelMetrics.totalExtent;
    // Vertical: panel extends from panelY to panelY + panelOuterH
    // The offset from node center to the vertical midpoint of the panel
    ip.totalExtentY = panelMetrics.totalExtentY;

    const tc = getNodeColor(this.activeNode || {}, this._typeColorRgb);

    ctx.save();
    ctx.globalAlpha = ip.opacity;

    // Blurred backdrop
    ctx.filter = `blur(${panelMetrics.blurRadius}px)`;
    ctx.beginPath();
    ctx.roundRect(panelX, panelY, panelMetrics.panelW, panelMetrics.panelOuterH, panelMetrics.cornerR);
    ctx.fillStyle = toRgba(this._panelBgRgb, 0.85 * ip.opacity);
    ctx.fill();
    ctx.filter = 'none';

    // Border
    ctx.beginPath();
    ctx.roundRect(panelX, panelY, panelMetrics.panelW, panelMetrics.panelOuterH, panelMetrics.cornerR);
    ctx.strokeStyle = toRgba(this._panelBorderRgb, 0.5 * ip.opacity);
    ctx.lineWidth = panelMetrics.borderWidth;
    ctx.stroke();

    // Left accent
    ctx.beginPath();
    ctx.moveTo(panelX, panelY + panelMetrics.cornerR);
    ctx.lineTo(panelX, panelY + panelMetrics.panelOuterH - panelMetrics.cornerR);
    ctx.strokeStyle = `rgba(${tc[0]}, ${tc[1]}, ${tc[2]}, ${0.5 * ip.opacity})`;
    ctx.lineWidth = panelMetrics.accentWidth;
    ctx.stroke();

    // Text lines
    let textY = panelY + panelMetrics.padY + panelMetrics.fontSize;
    for (let i = 0; i < ip.lines.length; i++) {
      const line = ip.lines[i];
      const text = line.text.substring(0, line.revealed);
      if (!text) { textY += panelMetrics.lineHeight; continue; }

      if (i === 0) {
        ctx.font = `700 ${panelMetrics.fontSize}px 'Inter', 'SF Mono', system-ui, sans-serif`;
        ctx.fillStyle = `rgba(${tc[0]}, ${tc[1]}, ${tc[2]}, ${ip.opacity})`;
      } else if (i === 1 && this.activeNode?.id !== this.activeNode?.label) {
        ctx.font = `400 ${panelMetrics.smallFontSize}px 'SF Mono', 'JetBrains Mono', monospace`;
        ctx.fillStyle = toRgba(this._textDimRgb, 0.35 * ip.opacity);
      } else if (line.text.startsWith('  ')) {
        ctx.font = `400 ${panelMetrics.smallFontSize}px 'SF Mono', 'JetBrains Mono', monospace`;
        ctx.fillStyle = `rgba(${tc[0]}, ${tc[1]}, ${tc[2]}, ${0.6 * ip.opacity})`;
      } else if (line.text.includes(':')) {
        ctx.font = `500 ${panelMetrics.smallFontSize}px 'Inter', system-ui, sans-serif`;
        ctx.fillStyle = toRgba(this._textRgb, 0.5 * ip.opacity);
      } else {
        ctx.font = `500 ${panelMetrics.smallFontSize}px 'Inter', system-ui, sans-serif`;
        ctx.fillStyle = toRgba(this._textRgb, 0.6 * ip.opacity);
      }

      ctx.fillText(text, panelX + panelMetrics.padX, textY);

      if (line.revealed < line.text.length && line.revealed > 0) {
        const cursorX = panelX + panelMetrics.padX + ctx.measureText(text).width + panelMetrics.cursorGap;
        if (Math.floor(now / 400) % 2 === 0) {
          ctx.fillStyle = `rgba(${tc[0]}, ${tc[1]}, ${tc[2]}, ${0.8 * ip.opacity})`;
          ctx.fillRect(
            cursorX,
            textY - panelMetrics.fontSize + panelMetrics.cursorYOffset,
            panelMetrics.cursorWidth,
            panelMetrics.fontSize
          );
        }
      }
      textY += panelMetrics.lineHeight;
    }

    ctx.restore();
  }

  getVisualLayerTransform(depth = 0) {
    let dpr = window.devicePixelRatio || 1;
    return getLayerTransform({
      depth,
      layerAnim: this.layerAnim,
      dpr,
      zoom: this.zoom,
      panX: this.panX,
      panY: this.panY,
      vcx: this.canvas.width / 2,
      vcy: this.canvas.height / 2,
      focusActive: this.focusActive,
      focusX: this.focusX,
      focusY: this.focusY,
      dragDeltaX: this._visualDragDeltaX || 0,
      dragDeltaY: this._visualDragDeltaY || 0,
    });
  }

  screenToWorld(sx, sy, depth = 0, transform = null) {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    transform ||= this.getVisualLayerTransform(depth);
    return {
      x: ((sx - rect.left) * dpr - transform.E) / transform.A,
      y: ((sy - rect.top) * dpr - transform.F) / transform.A,
    };
  }

  _resolveNodeHitRadius(node) {
    let hitRadius = getNodeHitRadius(node, HIT_RADIUS);
    if (!node || this.renderMode !== 'dots' || this.activeNode?.id !== node.id) return hitRadius;

    let conns = this.adjMap.get(node.id)?.size || 0;
    let visualRadius = getNodeRadius(node, conns, {
      scale: node.aScale || this._resolveActiveNodeScale(),
    });
    return Math.max(hitRadius, visualRadius);
  }

  hitTest(wx, wy) {
    const inGroup = !!this.currentGroupId;
    const activeGroupId = this.currentGroupId;
    for (let i = this.nodes.length - 1; i >= 0; i--) {
      const node = this.nodes[i];
      if (inGroup && node.parentId !== activeGroupId && node.id !== activeGroupId) continue;
      const pos = this.getSmooth(node.id);
      if (!pos) continue;

      if (this.renderMode === 'dots') {
        const dx = wx - pos.x, dy = wy - pos.y;
        const hitR = this._resolveNodeHitRadius(node);
        if (dx * dx + dy * dy <= hitR * hitR) return node;
      }
    }
    return null;
  }

  hitTestScreen(sx, sy) {
    const inGroup = !!this.currentGroupId;
    const activeGroupId = this.currentGroupId;
    const rect = this.canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;

    for (let i = this.nodes.length - 1; i >= 0; i--) {
      const node = this.nodes[i];
      if (inGroup && node.parentId !== activeGroupId && node.id !== activeGroupId) continue;
      const pos = this.getSmooth(node.id);
      if (!pos) continue;

      if (this.renderMode === 'dots') {
        const depth = node.targetDepth ?? 0;
        const hit = getCanvasNodeScreenHit({
          clientX: sx,
          clientY: sy,
          canvasRect: rect,
          node,
          position: pos,
          transform: this.getVisualLayerTransform(depth),
          dpr,
          hitRadius: this._resolveNodeHitRadius(node),
        });
        if (hit?.hit) return node;
      }
    }
    return null;
  }

  _rememberPointer(e) {
    this._activePointers.set(e.pointerId, e);
  }

  _forgetPointer(e) {
    this._activePointers.delete(e.pointerId);
  }

  _getPinchPointers() {
    return [...this._activePointers.values()].slice(0, 2);
  }

  _cancelPointerDragForPinch() {
    if (this.dragNode) {
      this.worker?.unpin(this.dragNode.id);
      this.dragNode = null;
    }
    this._dragWorldTransform = null;
    this.isPanning = false;
    this.canvas.style.cursor = 'default';
  }

  _startPinchGesture() {
    let [first, second] = this._getPinchPointers();
    if (!first || !second) return false;
    let distance = getPointerDistance(first, second);
    if (distance <= 0) return false;
    let center = getPointerCenter(first, second);
    let rect = this.canvas.getBoundingClientRect();
    let mx = center.x - rect.left;
    let my = center.y - rect.top;
    this._cancelPointerDragForPinch();
    this._pinchPointerIds = new Set([first.pointerId, second.pointerId]);
    this._pinchGesture = {
      distance,
      zoom: this.zoom,
      worldX: (mx - this.panX) / Math.max(this.zoom, 0.001),
      worldY: (my - this.panY) / Math.max(this.zoom, 0.001),
    };
    return true;
  }

  _applyPinchGesture() {
    if (!this._pinchGesture && !this._startPinchGesture()) return false;
    let [first, second] = this._getPinchPointers();
    if (!first || !second) return false;
    let distance = getPointerDistance(first, second);
    if (distance <= 0 || this._pinchGesture.distance <= 0) return false;
    let center = getPointerCenter(first, second);
    let rect = this.canvas.getBoundingClientRect();
    let mx = center.x - rect.left;
    let my = center.y - rect.top;
    let nextZoom = this._clampZoom(this._pinchGesture.zoom * (distance / this._pinchGesture.distance), rect);
    this.zoom = nextZoom;
    this._targetZoom = nextZoom;
    this.panX = mx - this._pinchGesture.worldX * nextZoom;
    this.panY = my - this._pinchGesture.worldY * nextZoom;
    this._targetPanX = null;
    this._targetPanY = null;
    this._zoomAnchor = null;
    this.hoverNode = null;
    this.needsDraw = true;
    this._wakeLoop();
    return true;
  }

  _endPinchPointer(e) {
    let wasPinchPointer = this._pinchPointerIds?.has(e.pointerId);
    this._pinchPointerIds?.delete(e.pointerId);
    this._forgetPointer(e);
    if (this._activePointers.size < 2) {
      this._pinchGesture = null;
    } else {
      this._startPinchGesture();
    }
    return wasPinchPointer;
  }

  _setHoverAction(action = '') {
    let nextAction = String(action || '');
    if (this._hoverAction === nextAction) return false;
    this._hoverAction = nextAction;
    this.needsDraw = true;
    this._wakeLoop();
    return true;
  }

  _updateHoverState(e) {
    let hitItem = null;
    if (this.activeNode && !this.dragNode && this.menuAnim > 0.5) {
      let apos = this.getSmooth(this.activeNode.id);
      if (apos) {
        hitItem = getRadialMenuHit({
          world: this.screenToWorld(e.clientX, e.clientY, 0),
          activeNode: this.activeNode,
          activePosition: apos,
          connectionCount: this.adjMap.get(this.activeNode.id)?.size || 0,
          menuItems: this.getActionItems(),
        });
      }
    }
    this._setHoverAction(hitItem?.action || '');
    this.hoverNode = hitItem ? null : this.hitTestScreen(e.clientX, e.clientY);
    this.canvas.style.cursor = hitItem ? 'pointer' : 'default';
  }

  /**
   * @param {{ clientX: number, clientY: number, deltaY: number, deltaMode?: number, ctrlKey?: boolean }} event
   * @returns {boolean}
   */
  applyWheelZoom(event) {
    if (!this.canvas || !Number.isFinite(event?.clientX) || !Number.isFinite(event?.clientY)) {
      return false;
    }
    let factor = resolveWheelZoomFactor(event);
    let targetZoom = Number.isFinite(this._targetZoom) ? this._targetZoom : this.zoom;
    if (!Number.isFinite(factor) || factor <= 0 || !Number.isFinite(targetZoom)) return false;
    let rect = this.canvas.getBoundingClientRect();
    let mx = event.clientX - rect.left;
    let my = event.clientY - rect.top;
    this._targetZoom = this._clampZoom(targetZoom * factor, rect);
    this._zoomAnchor = { mx, my };
    this._wakeLoop();
    return true;
  }

  bindEvents() {
    this.canvas.addEventListener('pointerdown', (e) => {
      this._requestDeviceOrientationParallaxFromGesture();
      this._rememberPointer(e);
      if (this._activePointers.size >= 2) {
        this.canvas.setPointerCapture(e.pointerId);
        this._startPinchGesture();
        e.preventDefault();
        return;
      }
      this._wakeLoop();  // User interaction — resume rendering
      const world = this.screenToWorld(e.clientX, e.clientY, 0);

      if (this.activeNode && !this.dragNode && this.menuAnim > 0.5) {
        const apos = this.getSmooth(this.activeNode.id);
        if (apos) {
          const conns = this.adjMap.get(this.activeNode.id)?.size || 0;
          const menuItems = this.getActionItems();
          const hitItem = getRadialMenuHit({
            world,
            activeNode: this.activeNode,
            activePosition: apos,
            connectionCount: conns,
            menuItems,
          });
          if (hitItem) {
            const action = hitItem.action;
            if (action === 'drill') {
              if (this.activeNode.isGroup && !this.activeNode.isSemanticCluster) {
                this.loadLevel(this.activeNode.id);
              }
            } else {
              this._emitGraphEvent('toolbarAction', { action, nodeId: this.activeNode.id }, {
                bubbles: true,
                composed: true,
              });
            }
            e.preventDefault();
            return;
          }
        }
      }

      const hit = this.hitTestScreen(e.clientX, e.clientY);
      if (hit) {
        if (this.activeNode && this.activeNode.id !== hit.id && !this.deactivating) {
          this._focusExitOnDown = this._beginFocusExit();
          this._dragStartX = e.clientX;
          this._dragStartY = e.clientY;
          this.canvas.setPointerCapture(e.pointerId);
          e.preventDefault();
          return;
        }

        const vis = this.getSmooth(hit.id);
        const sim = this.nodePositions.get(hit.id);
        if (vis && sim) { sim.x = vis.x; sim.y = vis.y; }

        let isNewActivation = !this.activeNode || this.activeNode.id !== hit.id;
        this._activateNode(hit, { transition: false, marker: false });
        this.dragNode = hit;
        if (isNewActivation) this.menuAnim = 0;
        this._nodeActivatedOnDown = isNewActivation;
        const pos = this.nodePositions.get(hit.id);
        const hitDepth = hit.targetDepth ?? 0;
        this._dragWorldTransform = this.getVisualLayerTransform(hitDepth);
        const dragWorld = this.screenToWorld(e.clientX, e.clientY, 0, this._dragWorldTransform);
        this.dragOffset.x = dragWorld.x - pos.x;
        this.dragOffset.y = dragWorld.y - pos.y;
        this._dragStartX = e.clientX;
        this._dragStartY = e.clientY;
        this.canvas.style.cursor = 'grabbing';
        this.canvas.setPointerCapture(e.pointerId);
        this.worker?.pin(hit.id, pos.x, pos.y);
        e.preventDefault();
      } else {
        // Start panning — cancel any fitView/flyToNode animation
        this._targetPanX = null;
        this._targetPanY = null;
        this.isPanning = true;
        this._dragStartX = e.clientX;
        this._dragStartY = e.clientY;
        this.panStart = { x: this.panX, y: this.panY, px: e.clientX, py: e.clientY };
        this.canvas.style.cursor = 'grabbing';
        this.canvas.setPointerCapture(e.pointerId);
      }
    });

    this.canvas.addEventListener('pointermove', (e) => {
      if (this._activePointers.has(e.pointerId)) {
        this._rememberPointer(e);
      }
      if (this._activePointers.size >= 2 || this._pinchGesture) {
        if (this._applyPinchGesture()) {
          e.preventDefault();
          return;
        }
      }
      if (this.dragNode) {
        this._wakeLoop();  // Dragging node — resume rendering
        const world = this.screenToWorld(e.clientX, e.clientY, 0, this._dragWorldTransform);
        const newX = world.x - this.dragOffset.x;
        const newY = world.y - this.dragOffset.y;
        this.nodePositions.set(this.dragNode.id, { x: newX, y: newY });
        this.worker?.pin(this.dragNode.id, newX, newY);
        this.hoverNode = null;
        this._setHoverAction('');
      } else if (this.isPanning) {
        this._wakeLoop();  // Panning — resume rendering
        this.panX = this.panStart.x + (e.clientX - this.panStart.px);
        this.panY = this.panStart.y + (e.clientY - this.panStart.py);
        this.hoverNode = null;
        this._setHoverAction('');
      } else {
        this._updateHoverState(e);
      }
    });

    this.canvas.addEventListener('pointerleave', () => {
      this.hoverNode = null;
      this._setHoverAction('');
      this.canvas.style.cursor = 'default';
    });

    this.canvas.addEventListener('pointerup', (e) => {
      if (this._pinchGesture || this._pinchPointerIds?.has(e.pointerId)) {
        this._endPinchPointer(e);
        e.preventDefault();
        return;
      }
      this._forgetPointer(e);
      const draggedNode = this.dragNode;
      if (this.dragNode) {
        this.worker?.unpin(this.dragNode.id);
        this.dragNode = null;
      }
      this._dragWorldTransform = null;
      this.isPanning = false;
      this.canvas.style.cursor = 'default';

      // Detect click vs drag: if pointer moved less than 5px, it's a click
      const dx = e.clientX - (this._dragStartX || 0);
      const dy = e.clientY - (this._dragStartY || 0);
      const wasClick = (dx * dx + dy * dy) < 25;

      if (this._focusExitOnDown) {
        this._focusExitOnDown = false;
        this._nodeActivatedOnDown = false;
        this._dragStartX = 0;
        this._dragStartY = 0;
        e.preventDefault();
        return;
      }

      if (wasClick) {
        const node = draggedNode || this.hitTestScreen(e.clientX, e.clientY);
        if (node) {
          if (node.isGroup) {
            const now = Date.now();
            if (now - this.lastClickTime < 300 && this.lastClickNode === node.id) {
              // Double click on group
              if (node.isSemanticCluster) {
                this.focusSemanticCluster(node.id);
              } else {
                this.loadLevel(node.id);
              }
            } else {
              // Single click on group
              this._emitGraphEvent('groupSelected', { path: node.id });
            }
            this.lastClickTime = now;
            this.lastClickNode = node.id;
          } else {
            // File node click
            this._emitGraphEvent('fileSelected', { path: node.id });
          }
        } else {
          // Click on empty space → deselect active node
          if (this.activeNode && !this.deactivating) {
            this.deactivating = true;
            this.dragNode = null;
            this._emitGraphEvent('nodeDeselected');
          }
        }
      } else if (draggedNode && this._nodeActivatedOnDown) {
        // We dragged a node that was just activated on pointerdown.
        // Emit selection event so URL and UI synchronize.
        if (draggedNode.isGroup) {
          this._emitGraphEvent('groupSelected', { path: draggedNode.id });
        } else {
          this._emitGraphEvent('fileSelected', { path: draggedNode.id });
        }
      }
      if (draggedNode) this._emitLayoutSnapshot();
      this._nodeActivatedOnDown = false;
      this._dragStartX = 0;
      this._dragStartY = 0;
    });

    this.canvas.addEventListener('pointercancel', (e) => {
      if (this._pinchGesture || this._pinchPointerIds?.has(e.pointerId)) {
        this._endPinchPointer(e);
        e.preventDefault();
        return;
      }
      this._forgetPointer(e);
      if (this.dragNode) {
        this.worker?.unpin(this.dragNode.id);
        this.dragNode = null;
      }
      this._dragWorldTransform = null;
      this.isPanning = false;
      this.canvas.style.cursor = 'default';
    });

    this.canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.applyWheelZoom(e);
    }, { passive: false });

    this.canvas.addEventListener('dblclick', (e) => {
      // Check if we didn't hit a node
      if (!this.hitTestScreen(e.clientX, e.clientY)) {
        if (!this.nodePositions.size) return;
        let sx = 0, sy = 0, count = 0;
        for (const pos of this.nodePositions.values()) { sx += pos.x; sy += pos.y; count++; }
        const cx = sx / count, cy = sy / count;
        const rect = this.canvas.getBoundingClientRect();
        this.panX = rect.width / 2 - cx * this.zoom;
        this.panY = rect.height / 2 - cy * this.zoom;
        this._wakeLoop();  // Double-click recenter — resume rendering
      }
    });
  }
}

CanvasGraph.rootStyles = css;
CanvasGraph.reg('canvas-graph');
