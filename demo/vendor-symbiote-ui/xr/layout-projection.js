import { collectPanels } from '../layout/LayoutTree.js';

export const XR_LAYOUT_PRESETS = Object.freeze({
  front: Object.freeze({ position: [0, 1.35, -1.8], rotation: [0, 0, 0], size: [0.9, 0.62] }),
  left: Object.freeze({ position: [-0.86, 1.32, -1.62], rotation: [0, 24, 0], size: [0.58, 0.78] }),
  right: Object.freeze({ position: [0.86, 1.32, -1.62], rotation: [0, -24, 0], size: [0.58, 0.78] }),
  lower: Object.freeze({ position: [0, 0.86, -1.35], rotation: [-14, 0, 0], size: [0.98, 0.28] }),
  upperRight: Object.freeze({ position: [0.58, 1.74, -1.42], rotation: [8, -18, 0], size: [0.42, 0.24] }),
});

const AREA_PRESET = Object.freeze({
  left: 'left',
  sidebar: 'left',
  nav: 'left',
  menu: 'left',
  right: 'right',
  inspector: 'right',
  details: 'right',
  bottom: 'lower',
  lower: 'lower',
  tray: 'lower',
  status: 'upperRight',
  toast: 'upperRight',
  center: 'front',
  main: 'front',
});

const DEFAULT_RELATIVE_SIZE = Object.freeze({
  width: 1.22,
  height: 0.82,
  minWidth: 0.32,
  minHeight: 0.22,
  maxWidth: 1.28,
  maxHeight: 0.92,
});

const DEFAULT_CONTENT_VIEWPORT = Object.freeze({
  minWidth: 1280,
  minHeight: 720,
  maxWidth: 2048,
  maxHeight: 1536,
});

const DEFAULT_TEXTURE_QUALITY = Object.freeze({
  minPixelsPerMeter: 900,
  targetPixelsPerMeter: 1200,
  texturePixelRatio: 1,
  maxTexturePixelRatio: 2,
  maxTextureSize: 4096,
  redrawMode: 'dirty',
});

const DEFAULT_POSE_COMFORT = Object.freeze({
  eyeHeight: 1.55,
  minDistance: 1,
  targetDistance: 1.45,
  maxDistance: 2.2,
  maxHorizontalAngle: 42,
  minVerticalAngle: -28,
  maxVerticalAngle: 16,
});

const DEFAULT_FACING = Object.freeze({
  maxYawError: 6,
});

function numberOr(value, fallback) {
  let number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function roundMetric(value) {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function asVector(value, fallback) {
  if (!Array.isArray(value)) return [...fallback];
  return fallback.map((item, index) => numberOr(value[index], item));
}

function inferPreset(panel, index, total) {
  let area = panel?.xr?.anchor || panel?.layout?.area || panel?.area || panel?.panelState?.area || '';
  if (AREA_PRESET[area]) return AREA_PRESET[area];
  if (total === 1) return 'front';
  if (index === 0) return 'front';
  if (index % 4 === 1) return 'left';
  if (index % 4 === 2) return 'right';
  if (index % 4 === 3) return 'lower';
  return 'upperRight';
}

function isRuntimeUiNode(node) {
  return !!node && typeof node === 'object' && typeof node.component === 'string';
}

function collectRuntimePanels(root) {
  let panels = [];

  function walk(node) {
    if (!node) return;
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    if (!isRuntimeUiNode(node)) return;
    if (node.component === 'panel-layout' && Array.isArray(node.children) && node.children.length) {
      node.children.forEach(walk);
      return;
    }
    panels.push(node);
  }

  walk(root);
  return panels;
}

function normalizeRect(rect) {
  if (!rect) return null;
  return {
    x: clamp(numberOr(rect.x, 0), 0, 1),
    y: clamp(numberOr(rect.y, 0), 0, 1),
    width: clamp(numberOr(rect.width, 1), 0, 1),
    height: clamp(numberOr(rect.height, 1), 0, 1),
  };
}

function collectLayoutRects(root) {
  let rects = new Map();

  function walk(node, rect) {
    if (!node) return;
    if (node.type === 'panel') {
      rects.set(node, normalizeRect(node.layout?.rect || rect));
      return;
    }
    if (node.type !== 'split') return;
    let ratio = clamp(numberOr(node.ratio, 0.5), 0, 1);
    if (node.direction === 'vertical') {
      walk(node.first, { ...rect, height: rect.height * ratio });
      walk(node.second, {
        x: rect.x,
        y: rect.y + rect.height * ratio,
        width: rect.width,
        height: rect.height * (1 - ratio),
      });
      return;
    }
    walk(node.first, { ...rect, width: rect.width * ratio });
    walk(node.second, {
      x: rect.x + rect.width * ratio,
      y: rect.y,
      width: rect.width * (1 - ratio),
      height: rect.height,
    });
  }

  walk(root, { x: 0, y: 0, width: 1, height: 1 });
  return rects;
}

function runtimeLayoutDirection(node) {
  return node.layout?.direction || node.props?.layoutDirection || 'horizontal';
}

function runtimeLayoutWeight(node) {
  return Math.max(0, numberOr(node.layout?.weight ?? node.props?.layoutWeight, 1));
}

function collectRuntimeRects(root) {
  let rects = new Map();

  function walk(node, rect) {
    if (!isRuntimeUiNode(node)) return;
    let normalizedRect = normalizeRect(node.layout?.rect || rect);
    if (node.component !== 'panel-layout' || !Array.isArray(node.children) || !node.children.length) {
      rects.set(node, normalizedRect);
      return;
    }

    let direction = runtimeLayoutDirection(node);
    let weights = node.children.map(runtimeLayoutWeight);
    let total = weights.reduce((sum, weight) => sum + weight, 0) || node.children.length || 1;
    let cursor = direction === 'vertical' ? normalizedRect.y : normalizedRect.x;

    node.children.forEach((child, index) => {
      let ratio = (weights[index] || 1) / total;
      let childRect = direction === 'vertical'
        ? {
          x: normalizedRect.x,
          y: cursor,
          width: normalizedRect.width,
          height: normalizedRect.height * ratio,
        }
        : {
          x: cursor,
          y: normalizedRect.y,
          width: normalizedRect.width * ratio,
          height: normalizedRect.height,
        };
      cursor += direction === 'vertical' ? childRect.height : childRect.width;
      walk(child, child.layout?.rect || childRect);
    });
  }

  walk(root, { x: 0, y: 0, width: 1, height: 1 });
  return rects;
}

function createRelativeSize(rect, preset, options = {}) {
  if (!rect) {
    return {
      size: [...preset.size],
      source: 'preset',
      relativeRect: null,
    };
  }
  let size = options.relativeSize || DEFAULT_RELATIVE_SIZE;
  return {
    size: [
      roundMetric(clamp(
        rect.width * numberOr(size.width, DEFAULT_RELATIVE_SIZE.width),
        numberOr(size.minWidth, DEFAULT_RELATIVE_SIZE.minWidth),
        numberOr(size.maxWidth, DEFAULT_RELATIVE_SIZE.maxWidth)
      )),
      roundMetric(clamp(
        rect.height * numberOr(size.height, DEFAULT_RELATIVE_SIZE.height),
        numberOr(size.minHeight, DEFAULT_RELATIVE_SIZE.minHeight),
        numberOr(size.maxHeight, DEFAULT_RELATIVE_SIZE.maxHeight)
      )),
    ],
    source: 'relative-layout',
    relativeRect: rect,
  };
}

export function normalizeXRPanel(panel = {}, options = {}) {
  let xr = panel.xr || panel.props?.xr || {};
  let presetName = xr.preset ||
    (XR_LAYOUT_PRESETS[xr.anchor] ? xr.anchor : inferPreset({ ...panel, xr }, options.index || 0, options.total || 1));
  let preset = XR_LAYOUT_PRESETS[presetName] || XR_LAYOUT_PRESETS.front;
  let relative = createRelativeSize(normalizeRect(options.relativeRect), preset, options);
  let explicitSize = Array.isArray(xr.size);

  return {
    id: String(panel.id || `xr-panel-${options.index || 0}`),
    panelType: panel.panelType || panel.component || 'panel',
    component: panel.component || panel.panelState?.component || panel.panelType || 'panel',
    layoutNode: panel,
    anchor: xr.anchor || presetName,
    position: asVector(xr.position, preset.position),
    rotation: asVector(xr.rotation, preset.rotation),
    size: explicitSize ? asVector(xr.size, preset.size) : relative.size,
    sizeSource: explicitSize ? 'explicit' : relative.source,
    relativeRect: relative.relativeRect,
    curve: numberOr(xr.curve, options.curve ?? 0),
    opacity: numberOr(xr.opacity, options.opacity ?? 1),
    priority: numberOr(xr.priority ?? panel.priority, options.index || 0),
    state: panel.panelState || {},
  };
}

export function projectLayoutToXR(root, options = {}) {
  let panels = Array.isArray(root?.panels)
    ? root.panels
    : collectPanels(root, { includeGlobal: options.includeGlobal !== false });
  let rects = Array.isArray(root?.panels) ? new Map() : collectLayoutRects(root);
  if (!panels.length && isRuntimeUiNode(root)) {
    panels = collectRuntimePanels(root);
    rects = collectRuntimeRects(root);
  }
  let projectedPanels = panels
    .map((panel, index) => normalizeXRPanel(panel, {
      ...options,
      index,
      total: panels.length,
      relativeRect: rects.get(panel),
    }))
    .sort((a, b) => a.priority - b.priority || a.id.localeCompare(b.id));

  return {
    version: 'xr-layout-v1',
    unit: 'meter',
    coordinateSystem: 'webxr-local-floor',
    panels: projectedPanels,
    focusPanelId: options.focusPanelId || projectedPanels[0]?.id || null,
    themeScope: options.themeScope || 'xr',
  };
}

export function createXRPanelPose(panel, frame = null, referenceSpace = null) {
  return {
    panelId: panel.id,
    position: [...panel.position],
    rotation: [...panel.rotation],
    size: [...panel.size],
    frame,
    referenceSpace,
  };
}

function rectSummary(rect) {
  if (!rect) return null;
  return {
    x: roundMetric(numberOr(rect.x, 0)),
    y: roundMetric(numberOr(rect.y, 0)),
    width: roundMetric(numberOr(rect.width, 0)),
    height: roundMetric(numberOr(rect.height, 0)),
  };
}

function previewSummary(preview) {
  if (!preview) return null;
  return {
    left: roundMetric(numberOr(preview.left, 0)),
    top: roundMetric(numberOr(preview.top, 0)),
    width: roundMetric(numberOr(preview.width, 0)),
    height: roundMetric(numberOr(preview.height, 0)),
    depth: roundMetric(numberOr(preview.depth, 0)),
  };
}

function panelWorldRect(panel) {
  let position = asVector(panel.position, [0, 0, 0]);
  let size = asVector(panel.size, [0, 0]);
  return {
    panelId: String(panel.id || ''),
    left: roundMetric(position[0] - size[0] / 2),
    right: roundMetric(position[0] + size[0] / 2),
    bottom: roundMetric(position[1] - size[1] / 2),
    top: roundMetric(position[1] + size[1] / 2),
    z: roundMetric(position[2]),
  };
}

function rectOverlap(first, second) {
  let width = Math.max(0, Math.min(first.right, second.right) - Math.max(first.left, second.left));
  let height = Math.max(0, Math.min(first.top, second.top) - Math.max(first.bottom, second.bottom));
  return roundMetric(width * height);
}

function normalizeVisualTelemetry(input = {}) {
  let telemetry = input.telemetry || input.session || {};
  let adapter = input.adapter || input.adapterState || {};
  return {
    active: Boolean(telemetry.active ?? input.active),
    panelFrameVisuals: Number(telemetry.panelFrameVisuals ?? adapter.panelFrameVisualCount ?? 0),
    controllerRayVisuals: Number(telemetry.controllerRayVisuals ?? input.controllerRayVisuals ?? 0),
    hitReticleVisuals: Number(telemetry.hitReticleVisuals ?? input.hitReticleVisuals ?? 0),
    interactionEvents: Number(telemetry.interactionEvents ?? input.interactionEvents ?? 0),
    hoverPanelId: telemetry.hover?.panelId || input.hover?.panelId || null,
    selectedPanelId: telemetry.selectedPanelId || input.selectedPanelId || null,
  };
}

function visualCheck(id, status, details = {}) {
  return {
    id,
    status,
    ...details,
  };
}

function roundPixel(value) {
  return Math.round(numberOr(value, 0));
}

function normalizeDegrees(value) {
  let normalized = ((numberOr(value, 0) + 180) % 360 + 360) % 360 - 180;
  return roundMetric(normalized);
}

function yawToViewer(position) {
  return normalizeDegrees(Math.atan2(-position[0], Math.max(Math.abs(position[2]), 0.000001)) * 180 / Math.PI);
}

function normalizeViewportOptions(options = {}) {
  return {
    minWidth: numberOr(options.minWidth, DEFAULT_CONTENT_VIEWPORT.minWidth),
    minHeight: numberOr(options.minHeight, DEFAULT_CONTENT_VIEWPORT.minHeight),
    maxWidth: numberOr(options.maxWidth, DEFAULT_CONTENT_VIEWPORT.maxWidth),
    maxHeight: numberOr(options.maxHeight, DEFAULT_CONTENT_VIEWPORT.maxHeight),
  };
}

function fitViewportToAspect(aspectRatio, options) {
  let width = Math.max(options.minWidth, options.minHeight * aspectRatio);
  let height = width / aspectRatio;
  if (height < options.minHeight) {
    height = options.minHeight;
    width = height * aspectRatio;
  }
  if (width > options.maxWidth) {
    width = options.maxWidth;
    height = width / aspectRatio;
  }
  if (height > options.maxHeight) {
    height = options.maxHeight;
    width = height * aspectRatio;
  }
  if (width < options.minWidth) {
    width = options.minWidth;
  }
  if (height < options.minHeight) {
    height = options.minHeight;
  }
  return {
    width: roundPixel(width),
    height: roundPixel(height),
  };
}

function scaleForPreview(viewport, preview) {
  if (!preview) return 1;
  let widthScale = numberOr(preview.width, 0) / viewport.width;
  let heightScale = numberOr(preview.height, 0) / viewport.height;
  let scale = Math.min(widthScale, heightScale);
  return roundMetric(scale > 0 ? scale : 1);
}

export function createXRPanelContentViewport(panel = {}, options = {}) {
  let size = asVector(panel.size, [1, 0.5625]);
  let aspectRatio = roundMetric(clamp(size[0] / Math.max(size[1], 0.000001), 0.35, 2.4));
  let viewport = fitViewportToAspect(aspectRatio, normalizeViewportOptions(options));
  let preview = options.previewPixels || options.preview || null;
  let scale = scaleForPreview(viewport, preview);
  return {
    width: viewport.width,
    height: viewport.height,
    aspectRatio,
    scale,
    density: roundMetric(clamp(scale * 6, 0.72, 1)),
    source: preview ? 'preview-fit' : 'panel-aspect',
  };
}

export function createXRPanelTextureQualitySummary(panel = {}, options = {}) {
  let policy = createXRTextureQualityPolicy(panel, options);
  let size = asVector(panel.size, [1, 0.5625]);
  let pixelsPerMeterX = roundMetric(policy.texturePixels.width / Math.max(size[0], 0.000001));
  let pixelsPerMeterY = roundMetric(policy.texturePixels.height / Math.max(size[1], 0.000001));
  let minAxisPixelsPerMeter = roundMetric(Math.min(pixelsPerMeterX, pixelsPerMeterY));
  let requiredPixels = {
    min: {
      width: roundPixel(size[0] * policy.thresholds.minPixelsPerMeter),
      height: roundPixel(size[1] * policy.thresholds.minPixelsPerMeter),
    },
    target: {
      width: roundPixel(size[0] * policy.thresholds.targetPixelsPerMeter),
      height: roundPixel(size[1] * policy.thresholds.targetPixelsPerMeter),
    },
  };
  let status = minAxisPixelsPerMeter >= policy.thresholds.targetPixelsPerMeter
    ? 'target'
    : minAxisPixelsPerMeter >= policy.thresholds.minPixelsPerMeter ? 'readable' : 'low';
  let warnings = [];
  if (status === 'low') warnings.push('texture-density-low');
  if (!policy.texturePixels.width || !policy.texturePixels.height) warnings.push('missing-texture-size');
  if (policy.capped) warnings.push('texture-size-capped');
  let recommendations = [];
  if (warnings.includes('missing-texture-size')) {
    recommendations.push('provide-texture-size');
  }
  if (status === 'low') {
    recommendations.push('increase-texture-resolution');
  }
  if (status !== 'target') {
    recommendations.push('increase-texture-density-to-target');
  }
  if (status !== 'target' && policy.texturePixelRatio < policy.maxTexturePixelRatio) {
    recommendations.push('increase-texture-pixel-ratio');
  }
  if (policy.capped || requiredPixels.target.width > policy.maxTextureSize || requiredPixels.target.height > policy.maxTextureSize) {
    recommendations.push('increase-max-texture-size');
  }
  return {
    panelId: String(panel.id || ''),
    status,
    texturePixels: policy.texturePixels,
    requiredPixels,
    meters: {
      width: roundMetric(size[0]),
      height: roundMetric(size[1]),
    },
    pixelsPerMeter: {
      x: pixelsPerMeterX,
      y: pixelsPerMeterY,
      min: minAxisPixelsPerMeter,
    },
    contentViewport: {
      width: policy.contentViewport.width,
      height: policy.contentViewport.height,
      scale: policy.contentViewport.scale,
      density: policy.contentViewport.density,
    },
    thresholds: policy.thresholds,
    policy,
    warnings,
    recommendations: [...new Set(recommendations)],
  };
}

export function createXRTextureQualityPolicy(panel = {}, options = {}) {
  let size = asVector(panel.size, [1, 0.5625]);
  let viewport = panel.contentViewport || createXRPanelContentViewport(panel, {
    previewPixels: options.previewPixels || options.preview || null,
  });
  let maxTexturePixelRatio = numberOr(options.maxTexturePixelRatio, DEFAULT_TEXTURE_QUALITY.maxTexturePixelRatio);
  let texturePixelRatio = clamp(
    numberOr(options.texturePixelRatio ?? options.pixelRatio, DEFAULT_TEXTURE_QUALITY.texturePixelRatio),
    0.5,
    maxTexturePixelRatio
  );
  let maxTextureSize = Math.max(256, numberOr(options.maxTextureSize, DEFAULT_TEXTURE_QUALITY.maxTextureSize));
  let minPixelsPerMeter = numberOr(options.minPixelsPerMeter, DEFAULT_TEXTURE_QUALITY.minPixelsPerMeter);
  let targetPixelsPerMeter = numberOr(options.targetPixelsPerMeter, DEFAULT_TEXTURE_QUALITY.targetPixelsPerMeter);
  let desiredWidth = Math.max(viewport.width * texturePixelRatio, size[0] * minPixelsPerMeter);
  let desiredHeight = Math.max(viewport.height * texturePixelRatio, size[1] * minPixelsPerMeter);
  if (options.preferTargetDensity) {
    desiredWidth = Math.max(desiredWidth, size[0] * targetPixelsPerMeter);
    desiredHeight = Math.max(desiredHeight, size[1] * targetPixelsPerMeter);
  }
  let textureWidth = roundPixel(options.textureWidth ?? Math.min(desiredWidth, maxTextureSize));
  let textureHeight = roundPixel(options.textureHeight ?? Math.min(desiredHeight, maxTextureSize));
  return {
    version: 'xr-texture-quality-policy-v1',
    panelId: String(panel.id || ''),
    redrawMode: options.redrawMode || DEFAULT_TEXTURE_QUALITY.redrawMode,
    texturePixelRatio,
    maxTexturePixelRatio,
    maxTextureSize,
    texturePixels: { width: textureWidth, height: textureHeight },
    contentViewport: {
      width: viewport.width,
      height: viewport.height,
      scale: viewport.scale,
      density: viewport.density,
    },
    thresholds: {
      minPixelsPerMeter,
      targetPixelsPerMeter,
    },
    capped: textureWidth >= maxTextureSize || textureHeight >= maxTextureSize,
  };
}

export function createXRPanelPoseComfortSummary(panel = {}, options = {}) {
  let position = asVector(panel.position, [0, DEFAULT_POSE_COMFORT.eyeHeight, -DEFAULT_POSE_COMFORT.targetDistance]);
  let size = asVector(panel.size, [1, 0.5625]);
  let eyeHeight = numberOr(options.eyeHeight ?? options.userSpace?.eyeHeight, DEFAULT_POSE_COMFORT.eyeHeight);
  let minDistance = numberOr(options.minDistance, DEFAULT_POSE_COMFORT.minDistance);
  let targetDistance = numberOr(options.targetDistance, DEFAULT_POSE_COMFORT.targetDistance);
  let maxDistance = numberOr(options.maxDistance, DEFAULT_POSE_COMFORT.maxDistance);
  let maxHorizontalAngle = numberOr(options.maxHorizontalAngle, DEFAULT_POSE_COMFORT.maxHorizontalAngle);
  let minVerticalAngle = numberOr(options.minVerticalAngle, DEFAULT_POSE_COMFORT.minVerticalAngle);
  let maxVerticalAngle = numberOr(options.maxVerticalAngle, DEFAULT_POSE_COMFORT.maxVerticalAngle);
  let horizontalDistance = Math.sqrt((position[0] ** 2) + (position[2] ** 2));
  let distance = Math.sqrt((position[0] ** 2) + ((position[1] - eyeHeight) ** 2) + (position[2] ** 2));
  let horizontalAngle = Math.atan2(position[0], Math.max(Math.abs(position[2]), 0.000001)) * 180 / Math.PI;
  let verticalAngle = Math.atan2(position[1] - eyeHeight, Math.max(horizontalDistance, 0.000001)) * 180 / Math.PI;
  let warnings = [];

  if (distance < minDistance) warnings.push('panel-too-close');
  if (distance > maxDistance) warnings.push('panel-too-far');
  if (Math.abs(horizontalAngle) > maxHorizontalAngle) warnings.push('panel-horizontal-angle-high');
  if (verticalAngle < minVerticalAngle) warnings.push('panel-too-low');
  if (verticalAngle > maxVerticalAngle) warnings.push('panel-too-high');

  return {
    panelId: String(panel.id || ''),
    status: warnings.length ? 'warning' : 'comfortable',
    distance: roundMetric(distance),
    targetDistance: roundMetric(targetDistance),
    eyeHeight: roundMetric(eyeHeight),
    heightOffset: roundMetric(position[1] - eyeHeight),
    angles: {
      horizontal: roundMetric(horizontalAngle),
      vertical: roundMetric(verticalAngle),
    },
    position: position.map(roundMetric),
    size: {
      width: roundMetric(size[0]),
      height: roundMetric(size[1]),
    },
    thresholds: {
      minDistance,
      maxDistance,
      maxHorizontalAngle,
      minVerticalAngle,
      maxVerticalAngle,
    },
    warnings,
  };
}

export function adjustXRPanelPoseForComfort(panel = {}, options = {}) {
  let summary = createXRPanelPoseComfortSummary(panel, options);
  if (summary.status === 'comfortable') {
    return { ...panel };
  }

  let position = asVector(panel.position, [0, summary.eyeHeight, -summary.targetDistance]);
  let adjustedPosition = [...position];
  let horizontalDistance = Math.sqrt((position[0] ** 2) + (position[2] ** 2));
  let changed = false;
  let reasons = [];

  if (summary.warnings.includes('panel-too-low')) {
    adjustedPosition[1] = summary.eyeHeight + Math.tan((summary.thresholds.minVerticalAngle + 2) * Math.PI / 180) * horizontalDistance;
    reasons.push('vertical-angle-raised');
    changed = true;
  }
  if (summary.warnings.includes('panel-too-high')) {
    adjustedPosition[1] = summary.eyeHeight + Math.tan((summary.thresholds.maxVerticalAngle - 2) * Math.PI / 180) * horizontalDistance;
    reasons.push('vertical-angle-lowered');
    changed = true;
  }
  if (summary.warnings.includes('panel-too-close')) {
    let zSign = adjustedPosition[2] <= 0 ? -1 : 1;
    adjustedPosition[2] = zSign * Math.max(Math.abs(adjustedPosition[2]), summary.thresholds.minDistance);
    reasons.push('distance-pushed');
    changed = true;
  }
  if (summary.warnings.includes('panel-too-far')) {
    let zSign = adjustedPosition[2] <= 0 ? -1 : 1;
    adjustedPosition[2] = zSign * Math.min(Math.abs(adjustedPosition[2]), summary.thresholds.maxDistance);
    reasons.push('distance-pulled');
    changed = true;
  }

  let adjustedPanel = {
    ...panel,
    position: adjustedPosition.map(roundMetric),
  };
  let after = createXRPanelPoseComfortSummary(adjustedPanel, options);
  return {
    ...adjustedPanel,
    poseAdjustment: {
      adjusted: changed,
      reason: reasons.join(',') || null,
      before: summary,
      after,
    },
  };
}

export function createXRPanelFacingSummary(panel = {}, options = {}) {
  let position = asVector(panel.position, [0, DEFAULT_POSE_COMFORT.eyeHeight, -DEFAULT_POSE_COMFORT.targetDistance]);
  let rotation = asVector(panel.rotation, [0, 0, 0]);
  let maxYawError = numberOr(options.maxYawError, DEFAULT_FACING.maxYawError);
  let targetYaw = yawToViewer(position);
  let yawDelta = normalizeDegrees(rotation[1] - targetYaw);
  let warnings = [];

  if (Math.abs(yawDelta) > maxYawError) warnings.push('panel-yaw-off-axis');

  return {
    panelId: String(panel.id || ''),
    status: warnings.length ? 'warning' : 'aligned',
    rotation: rotation.map(roundMetric),
    targetRotation: [roundMetric(rotation[0]), targetYaw, roundMetric(rotation[2])],
    delta: {
      yaw: yawDelta,
    },
    thresholds: {
      maxYawError,
    },
    warnings,
  };
}

export function adjustXRPanelRotationForViewer(panel = {}, options = {}) {
  let summary = createXRPanelFacingSummary(panel, options);
  if (summary.status === 'aligned') {
    return { ...panel };
  }

  let rotation = asVector(panel.rotation, [0, 0, 0]);
  let adjustedPanel = {
    ...panel,
    rotation: [roundMetric(rotation[0]), summary.targetRotation[1], roundMetric(rotation[2])],
  };
  let after = createXRPanelFacingSummary(adjustedPanel, options);

  return {
    ...adjustedPanel,
    rotationAdjustment: {
      adjusted: true,
      reason: summary.warnings.join(',') || null,
      before: summary,
      after,
    },
  };
}

export function createXRPanelGeometrySummary(panel = {}, preview = null, options = {}) {
  let size = asVector(panel.size, [0, 0]);
  let contentViewport = panel.contentViewport || createXRPanelContentViewport(panel, {
    previewPixels: previewSummary(preview),
  });
  return {
    panelId: String(panel.id || ''),
    component: panel.component || panel.panelType || 'panel',
    anchor: panel.anchor || '',
    sizeSource: panel.sizeSource || 'preset',
    relativeRect: rectSummary(panel.relativeRect),
    meters: {
      width: roundMetric(size[0]),
      height: roundMetric(size[1]),
    },
    previewPixels: previewSummary(preview),
    contentViewport,
    textureQuality: createXRPanelTextureQualitySummary(panel, {
      ...options,
      previewPixels: previewSummary(preview),
    }),
    poseComfort: createXRPanelPoseComfortSummary(panel, options),
    poseAdjustment: panel.poseAdjustment || null,
    facing: createXRPanelFacingSummary(panel, options),
    rotationAdjustment: panel.rotationAdjustment || null,
    position: asVector(panel.position, [0, 0, 0]).map(roundMetric),
    rotation: asVector(panel.rotation, [0, 0, 0]).map(roundMetric),
  };
}

export function createXRSceneQualitySummary(sceneOrPanels = {}, options = {}) {
  let panels = Array.isArray(sceneOrPanels)
    ? sceneOrPanels
    : Array.isArray(sceneOrPanels.panels) ? sceneOrPanels.panels : [];
  let panelSummaries = panels.map((panel) => {
    let textureQuality = createXRPanelTextureQualitySummary(panel, options);
    let poseComfort = createXRPanelPoseComfortSummary(panel, options);
    let facing = createXRPanelFacingSummary(panel, options);
    return {
      panelId: String(panel.id || ''),
      textureStatus: textureQuality.status,
      comfortStatus: poseComfort.status,
      facingStatus: facing.status,
      pixelsPerMeter: textureQuality.pixelsPerMeter.min,
      distance: poseComfort.distance,
      position: asVector(panel.position, [0, 0, 0]).map(roundMetric),
      rotation: asVector(panel.rotation, [0, 0, 0]).map(roundMetric),
      warnings: [
        ...textureQuality.warnings,
        ...poseComfort.warnings,
        ...facing.warnings,
      ],
    };
  });
  let lowQualityCount = panelSummaries.filter((panel) => panel.textureStatus === 'low').length;
  let comfortWarningCount = panelSummaries.filter((panel) => panel.comfortStatus === 'warning').length;
  let facingWarningCount = panelSummaries.filter((panel) => panel.facingStatus === 'warning').length;
  return {
    version: 'xr-scene-quality-summary-v1',
    status: lowQualityCount || comfortWarningCount || facingWarningCount ? 'warning' : 'ok',
    total: panelSummaries.length,
    lowQualityCount,
    comfortWarningCount,
    facingWarningCount,
    panels: panelSummaries,
  };
}

export function createXRSceneGeometrySummary(sceneOrPanels = {}, options = {}) {
  let panels = Array.isArray(sceneOrPanels)
    ? sceneOrPanels
    : Array.isArray(sceneOrPanels.panels) ? sceneOrPanels.panels : [];
  let panelSummaries = panels.map((panel) => createXRPanelGeometrySummary(
    panel,
    options.previewByPanel?.[panel.id] || options.preview || null,
    options
  ));
  let pixelsPerMeter = panelSummaries
    .map((panel) => panel.textureQuality?.pixelsPerMeter?.min)
    .filter((value) => Number.isFinite(value));
  let lowQualityCount = panelSummaries
    .filter((panel) => panel.textureQuality?.status === 'low').length;
  let comfortWarningCount = panelSummaries
    .filter((panel) => panel.poseComfort?.status === 'warning').length;
  let poseAdjustedCount = panelSummaries
    .filter((panel) => panel.poseAdjustment?.adjusted).length;
  let facingWarningCount = panelSummaries
    .filter((panel) => panel.facing?.status === 'warning').length;
  let rotationAdjustedCount = panelSummaries
    .filter((panel) => panel.rotationAdjustment?.adjusted).length;

  return {
    version: 'xr-scene-geometry-summary-v1',
    total: panelSummaries.length,
    status: lowQualityCount || comfortWarningCount || facingWarningCount ? 'warning' : 'ok',
    lowQualityCount,
    comfortWarningCount,
    poseAdjustedCount,
    facingWarningCount,
    rotationAdjustedCount,
    minPixelsPerMeter: pixelsPerMeter.length ? roundMetric(Math.min(...pixelsPerMeter)) : null,
    firstPanel: panelSummaries[0] || null,
    panels: panelSummaries,
  };
}

export function createXRVisualTestSummary(sceneOrPanels = {}, options = {}) {
  let panels = Array.isArray(sceneOrPanels)
    ? sceneOrPanels
    : Array.isArray(sceneOrPanels.panels) ? sceneOrPanels.panels : [];
  let geometry = options.geometry || createXRSceneGeometrySummary(sceneOrPanels, options);
  let telemetry = normalizeVisualTelemetry(options);
  let checks = [];
  let issues = [];
  let panelIds = panels.map((panel) => String(panel.id || ''));
  let uniquePanelIds = new Set(panelIds.filter(Boolean));
  let panelMap = geometry.panels.map((panel) => {
    let rect = panelWorldRect(panels.find((item) => String(item.id || '') === panel.panelId) || panel);
    return {
      panelId: panel.panelId,
      component: panel.component,
      anchor: panel.anchor,
      relativeRect: panel.relativeRect,
      position: panel.position,
      rotation: panel.rotation,
      meters: panel.meters,
      contentViewport: panel.contentViewport,
      pixelsPerMeter: panel.textureQuality?.pixelsPerMeter?.min ?? null,
      distance: panel.poseComfort?.distance ?? null,
      facingStatus: panel.facing?.status || null,
      comfortStatus: panel.poseComfort?.status || null,
      worldRect: rect,
    };
  });

  function addCheck(id, status, details = {}) {
    let check = visualCheck(id, status, details);
    checks.push(check);
    if (status !== 'pass') {
      issues.push({
        id,
        severity: status === 'fail' ? 'error' : 'warning',
        ...details,
      });
    }
  }

  addCheck('panels-present', panels.length ? 'pass' : 'fail', {
    count: panels.length,
  });
  addCheck('panel-ids-unique', uniquePanelIds.size === panelIds.length ? 'pass' : 'fail', {
    count: panelIds.length,
    unique: uniquePanelIds.size,
  });

  let invalidTransforms = panelMap.filter((panel) => (
    !panel.position.every((value) => Number.isFinite(value)) ||
    !panel.rotation.every((value) => Number.isFinite(value)) ||
    !Number.isFinite(panel.meters.width) ||
    !Number.isFinite(panel.meters.height) ||
    panel.meters.width <= 0 ||
    panel.meters.height <= 0
  ));
  addCheck('panel-transforms-finite', invalidTransforms.length ? 'fail' : 'pass', {
    panelIds: invalidTransforms.map((panel) => panel.panelId),
  });

  let viewportMinWidth = numberOr(options.minContentViewportWidth, DEFAULT_CONTENT_VIEWPORT.minWidth);
  let viewportMinHeight = numberOr(options.minContentViewportHeight, DEFAULT_CONTENT_VIEWPORT.minHeight);
  let smallViewports = panelMap.filter((panel) => (
    Number(panel.contentViewport?.width || 0) < viewportMinWidth ||
    Number(panel.contentViewport?.height || 0) < viewportMinHeight
  ));
  addCheck('content-viewports-usable', smallViewports.length ? 'warn' : 'pass', {
    minWidth: viewportMinWidth,
    minHeight: viewportMinHeight,
    panelIds: smallViewports.map((panel) => panel.panelId),
  });

  addCheck('texture-density-readable', geometry.lowQualityCount ? 'warn' : 'pass', {
    lowQualityCount: geometry.lowQualityCount,
    minPixelsPerMeter: geometry.minPixelsPerMeter,
  });
  addCheck('pose-comfort', geometry.comfortWarningCount ? 'warn' : 'pass', {
    warningCount: geometry.comfortWarningCount,
  });
  addCheck('viewer-facing', geometry.facingWarningCount ? 'warn' : 'pass', {
    warningCount: geometry.facingWarningCount,
  });

  let maxDepthDelta = numberOr(options.maxOverlapDepthDelta, 0.35);
  let maxOverlapArea = numberOr(options.maxOverlapArea, 0.02);
  let overlaps = [];
  for (let index = 0; index < panelMap.length; index += 1) {
    for (let next = index + 1; next < panelMap.length; next += 1) {
      let first = panelMap[index].worldRect;
      let second = panelMap[next].worldRect;
      let depthDelta = Math.abs(first.z - second.z);
      let area = rectOverlap(first, second);
      if (depthDelta <= maxDepthDelta && area > maxOverlapArea) {
        overlaps.push({
          panelIds: [first.panelId, second.panelId],
          area,
          depthDelta: roundMetric(depthDelta),
        });
      }
    }
  }
  addCheck('panel-world-overlap', overlaps.length ? 'warn' : 'pass', {
    overlaps,
  });

  let expectedFrameVisuals = Number(options.expectedFrameVisuals ?? panels.length);
  if (options.expectInteraction !== false && (telemetry.active || options.expectInteraction === true)) {
    addCheck('frame-visuals-present', telemetry.panelFrameVisuals >= expectedFrameVisuals ? 'pass' : 'warn', {
      count: telemetry.panelFrameVisuals,
      expected: expectedFrameVisuals,
    });
    addCheck('controller-rays-visible', telemetry.controllerRayVisuals > 0 ? 'pass' : 'warn', {
      count: telemetry.controllerRayVisuals,
    });
    addCheck('hit-reticle-visible', telemetry.hitReticleVisuals > 0 ? 'pass' : 'warn', {
      count: telemetry.hitReticleVisuals,
    });
  }

  let failCount = checks.filter((check) => check.status === 'fail').length;
  let warnCount = checks.filter((check) => check.status === 'warn').length;
  return {
    version: 'xr-visual-test-summary-v1',
    status: failCount ? 'fail' : warnCount ? 'warning' : 'pass',
    panelCount: panels.length,
    checkCount: checks.length,
    failCount,
    warnCount,
    passCount: checks.filter((check) => check.status === 'pass').length,
    panelMap,
    checks,
    issues,
  };
}

function idsFromVisualSummary(visual = {}) {
  let ids = new Set();
  for (let issue of Array.isArray(visual.issues) ? visual.issues : []) {
    if (issue?.id) ids.add(String(issue.id));
  }
  for (let issueId of Array.isArray(visual.issueIds) ? visual.issueIds : []) {
    if (issueId) ids.add(String(issueId));
  }
  return [...ids];
}

function countOr(value) {
  let count = Number(value);
  return Number.isFinite(count) ? count : 0;
}

export function createXRVisualAgentReadinessSummary(input = {}) {
  let visual = input.visual || input.summary || {};
  let expectedIssueIds = [...new Set(Array.isArray(input.expectedIssueIds) ? input.expectedIssueIds.map(String) : [])];
  let actualIssueIds = idsFromVisualSummary(visual);
  let actualIssueSet = new Set(actualIssueIds);
  let expectedIssueSet = new Set(expectedIssueIds);
  let expectedStatus = input.expectedStatus || (expectedIssueIds.length ? 'warning' : 'pass');
  let panelCount = countOr(visual.panelCount ?? input.panelCount);
  let svg = input.svg || input.visualMaps || {};
  let outputs = input.outputs || {};
  let screenshots = Array.isArray(input.screenshots)
    ? input.screenshots
    : input.screenshot ? [input.screenshot] : [];
  let pageErrors = Array.isArray(input.pageErrors) ? input.pageErrors : [];
  let requireBrowserArtifacts = input.requireBrowserArtifacts !== false;
  let missingIssues = expectedIssueIds.filter((id) => !actualIssueSet.has(id));
  let unexpectedIssues = input.allowUnexpectedIssues
    ? []
    : actualIssueIds.filter((id) => !expectedIssueSet.has(id));
  let mapCounts = {
    topPanelShapes: countOr(svg.topPanelShapes),
    frontPanelShapes: countOr(svg.frontPanelShapes),
    topLabels: countOr(svg.topLabels),
    frontLabels: countOr(svg.frontLabels),
  };
  let outputSizes = {
    statusRows: countOr(outputs.statusRows),
    checksBytes: countOr(outputs.checksBytes),
    panelMapBytes: countOr(outputs.panelMapBytes),
  };
  let invalidScreenshots = screenshots.filter((screenshot) => (
    !screenshot ||
    countOr(screenshot.bytes) <= 0 ||
    countOr(screenshot.width) <= 0 ||
    countOr(screenshot.height) <= 0 ||
    screenshot.invalid === true ||
    screenshot.screenshotInvalid === true
  ));
  let checks = [
    visualCheck('visual-status', visual.status === expectedStatus ? 'pass' : 'fail', {
      expected: expectedStatus,
      actual: visual.status || null,
    }),
    visualCheck('expected-issues', missingIssues.length ? 'fail' : 'pass', {
      expectedIssueIds,
      missingIssueIds: missingIssues,
    }),
    visualCheck('unexpected-issues', unexpectedIssues.length ? 'warn' : 'pass', {
      issueIds: unexpectedIssues,
    }),
    visualCheck('visual-maps-present', !requireBrowserArtifacts || (
      mapCounts.topPanelShapes >= panelCount &&
      mapCounts.frontPanelShapes >= panelCount &&
      mapCounts.topLabels >= panelCount &&
      mapCounts.frontLabels >= panelCount
    ) ? 'pass' : 'fail', {
      panelCount,
      ...mapCounts,
    }),
    visualCheck('agent-output-sizes', !requireBrowserArtifacts || (
      outputSizes.statusRows > 0 &&
      outputSizes.checksBytes > 0 &&
      outputSizes.panelMapBytes > 0
    ) ? 'pass' : 'fail', outputSizes),
    visualCheck('page-errors-empty', pageErrors.length ? 'fail' : 'pass', {
      count: pageErrors.length,
    }),
    visualCheck('screenshots-valid', invalidScreenshots.length ? 'fail' : 'pass', {
      total: screenshots.length,
      invalid: invalidScreenshots.length,
    }),
  ];
  let failCount = checks.filter((check) => check.status === 'fail').length;
  let warnCount = checks.filter((check) => check.status === 'warn').length;

  return {
    version: 'xr-visual-agent-readiness-v1',
    ready: failCount === 0,
    status: failCount ? 'fail' : warnCount ? 'warning' : 'pass',
    reason: checks.find((check) => check.status === 'fail')?.id || checks.find((check) => check.status === 'warn')?.id || 'ready',
    expectedStatus,
    issueIds: actualIssueIds,
    expectedIssueIds,
    missingIssueIds: missingIssues,
    unexpectedIssueIds: unexpectedIssues,
    failCount,
    warnCount,
    checks,
  };
}

/**
 * Automatically tiles panels in XR space.
 *
 * @param {Array} panels - Array of panel configurations.
 * @param {Object} [options]
 * @param {string} [options.layout] - 'arc' | 'grid' | 'sphere'. Default: 'arc'
 * @param {number} [options.radius] - Radial distance in meters. Default: 1.6
 * @param {number} [options.fov] - FOV arc for 'arc' mode in degrees. Default: 120
 * @param {number} [options.eyeHeight] - Eye level height in meters. Default: 1.55
 * @param {Array<number>} [options.center] - Custom center [x, y, z]. Default: [0, eyeHeight, 0]
 * @returns {Array} List of normalized projected panels.
 */
export function autoTileXRPanels(panels, options = {}) {
  let layout = options.layout || 'arc';
  let radius = options.radius || 1.6;
  let fov = options.fov || 120;
  let eyeHeight = options.eyeHeight || 1.55;
  let center = options.center || [0, eyeHeight, 0];
  let gap = numberOr(options.gap, 0.12);
  let panelSizes = panels.map((panel) => panel.layout?.size || panel.preferredSize || [0.8, 0.6]);
  let maxPanelWidth = Math.max(0.8, ...panelSizes.map((size) => numberOr(size?.[0], 0.8)));
  let maxPanelHeight = Math.max(0.6, ...panelSizes.map((size) => numberOr(size?.[1], 0.6)));

  return panels.map((panel, index) => {
    let position = [0, eyeHeight, -radius];
    let rotation = [0, 0, 0];

    if (layout === 'arc') {
      let angle = panels.length <= 1 ? 0 : -fov/2 + (index / (panels.length - 1)) * fov;
      let rad = angle * Math.PI / 180;
      position = [
        center[0] + Math.sin(rad) * radius,
        center[1],
        center[2] - Math.cos(rad) * radius
      ];
      rotation = [0, -angle, 0];
    } else if (layout === 'grid') {
      let cols = Math.ceil(Math.sqrt(panels.length));
      let rows = Math.ceil(panels.length / cols);
      let col = index % cols;
      let row = Math.floor(index / cols);

      let cellW = maxPanelWidth + gap;
      let cellH = maxPanelHeight + gap;
      let startX = -((cols - 1) * cellW) / 2;
      let startY = center[1] + ((rows - 1) * cellH) / 2;

      position = [
        center[0] + startX + col * cellW,
        startY - row * cellH,
        center[2] - radius
      ];
      rotation = [0, 0, 0];
    } else if (layout === 'sphere') {
      let n = panels.length;
      let phi = Math.acos(1 - 2 * (index + 0.5) / n);
      let theta = Math.PI * (1 + Math.sqrt(5)) * index;

      position = [
        center[0] + Math.cos(theta) * Math.sin(phi) * radius,
        center[1] + Math.sin(theta) * Math.sin(phi) * radius,
        center[2] + Math.cos(phi) * radius
      ];

      let dx = position[0] - center[0];
      let dz = position[2] - center[2];
      let yaw = Math.atan2(dx, dz) * 180 / Math.PI;
      rotation = [0, yaw, 0];
    }

    return {
      ...panel,
      id: panel.id || `panel-${index}`,
      component: panel.component,
      importance: panel.importance ?? panel.priority,
      priority: panel.priority ?? panel.importance,
      minSize: panel.minSize || panel.layout?.minSize || panel.preferredSize || panel.layout?.size || [0.8, 0.6],
      preferredSize: panel.preferredSize || panel.layout?.preferredSize || panel.layout?.size || [0.8, 0.6],
      collapsed: Boolean(panel.collapsed ?? panel.layout?.collapsed),
      open: panel.open !== undefined ? Boolean(panel.open) : !Boolean(panel.collapsed ?? panel.layout?.collapsed),
      themeScope: panel.themeScope || panel.layout?.themeScope || options.themeScope || 'xr',
      layout: {
        ...(panel.layout || {}),
        position,
        rotation,
        size: panel.layout?.size || panel.preferredSize || [0.8, 0.6],
        minSize: panel.layout?.minSize || panel.minSize || panel.preferredSize,
        collapsed: Boolean(panel.collapsed ?? panel.layout?.collapsed),
        themeScope: panel.layout?.themeScope || panel.themeScope || options.themeScope || 'xr',
      },
      poseComfort: createXRPanelPoseComfortSummary({
        id: panel.id || `panel-${index}`,
        position,
        size: panel.layout?.size || panel.preferredSize || [0.8, 0.6],
      }, options),
      metadata: { ...(panel.metadata || {}) },
    };
  });
}
