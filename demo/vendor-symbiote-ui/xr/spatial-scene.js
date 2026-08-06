import {
  adjustXRPanelPoseForComfort,
  adjustXRPanelRotationForViewer,
  createXRPanelContentViewport,
  projectLayoutToXR,
} from './layout-projection.js';

export const XR_SPATIAL_SCENE_VERSION = 'xr-spatial-scene-v1';

export const XR_SPATIAL_SPACE = Object.freeze({
  localFloor: 'webxr-local-floor',
  viewer: 'webxr-viewer',
});

export const XR_SCENE_ROOT_TRANSFORM_VERSION = 'xr-scene-root-transform-v1';

const DEFAULT_USER_SPACE = Object.freeze({
  eyeHeight: 1.6,
  comfortRadius: 1.8,
  near: 0.35,
  far: 3.6,
});

const DEFAULT_PREVIEW = Object.freeze({
  renderer: 'dom-perspective-preview',
  pixelsPerMeter: 118,
  origin: [0.5, 0.5],
});

function numberOr(value, fallback) {
  let number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function vectorOr(value, fallback) {
  if (!Array.isArray(value)) return [...fallback];
  return fallback.map((item, index) => numberOr(value[index], item));
}

function vectorLikeOr(value, fallback) {
  if (Array.isArray(value)) return vectorOr(value, fallback);
  if (!value || typeof value !== 'object') return [...fallback];
  return fallback.map((item, index) => {
    let key = index === 0 ? 'x' : index === 1 ? 'y' : 'z';
    return numberOr(value[key], item);
  });
}

function firstVector(...values) {
  for (let value of values) {
    if (Array.isArray(value)) return value;
    if (value && typeof value === 'object' && ['x', 'y', 'z'].some((key) => key in value)) return value;
  }
  return null;
}

function yawDegreesFromQuaternion(value) {
  if (!value || typeof value !== 'object') return null;
  let x = numberOr(value.x, 0);
  let y = numberOr(value.y, 0);
  let z = numberOr(value.z, 0);
  let w = numberOr(value.w, 1);
  let siny = 2 * (w * y + x * z);
  let cosy = 1 - 2 * (y * y + x * x);
  return Math.atan2(siny, cosy) * 180 / Math.PI;
}

function normalizeViewerPose(input = {}) {
  let transform = input.transform || {};
  let position = firstVector(input.position, transform.position, input.translation);
  let rotation = firstVector(input.rotation, transform.rotation);
  let yaw = input.yawDegrees ?? input.yaw ?? transform.yawDegrees ?? transform.yaw ?? yawDegreesFromQuaternion(input.orientation || transform.orientation);
  if (!rotation && yaw != null) {
    rotation = [0, numberOr(yaw, 0), 0];
  }
  return {
    position: position ? vectorLikeOr(position, [0, 0, 0]) : null,
    rotation: rotation ? vectorLikeOr(rotation, [0, 0, 0]) : null,
  };
}

export function createXRViewerPoseSnapshot(viewerPose = {}, options = {}) {
  let normalized = normalizeViewerPose(viewerPose);
  let hasPose = Boolean(normalized.position || normalized.rotation);
  return {
    version: 'xr-viewer-pose-snapshot-v1',
    source: hasPose ? options.source || 'xr-frame-viewer-pose' : 'missing-viewer-pose',
    position: normalized.position,
    rotation: normalized.rotation,
  };
}

export function createXRSceneRootTransform(scene = {}, options = {}) {
  let viewerPose = normalizeViewerPose(options.viewerPose || {});
  let origin = scene.origin || {};
  let hasViewerPose = Boolean(viewerPose.position || viewerPose.rotation);
  let lockFloorY = options.lockFloorY !== false;
  let position = viewerPose.position ||
    vectorOr(options.position || origin.position, [0, 0, 0]);
  let rotation = viewerPose.rotation ||
    vectorOr(options.rotation || origin.rotation, [0, 0, 0]);

  if (lockFloorY) {
    position = [position[0], 0, position[2]];
    rotation = [0, rotation[1], 0];
  }

  return {
    version: XR_SCENE_ROOT_TRANSFORM_VERSION,
    policy: options.policy || 'body-space-front',
    mode: options.mode || scene.mode || null,
    referenceSpaceType: options.referenceSpaceType || options.referenceSpace || scene.referenceSpaceType || null,
    originSource: hasViewerPose ? 'viewer-pose' : origin.type ? `scene-origin:${origin.type}` : 'provider-default',
    lockFloorY,
    position,
    rotation,
  };
}

function normalizeUserSpace(input = {}) {
  return {
    eyeHeight: numberOr(input.eyeHeight, DEFAULT_USER_SPACE.eyeHeight),
    comfortRadius: numberOr(input.comfortRadius, DEFAULT_USER_SPACE.comfortRadius),
    near: numberOr(input.near, DEFAULT_USER_SPACE.near),
    far: numberOr(input.far, DEFAULT_USER_SPACE.far),
  };
}

function normalizePreview(input = {}) {
  return {
    renderer: input.renderer || DEFAULT_PREVIEW.renderer,
    pixelsPerMeter: numberOr(input.pixelsPerMeter, DEFAULT_PREVIEW.pixelsPerMeter),
    origin: vectorOr(input.origin, DEFAULT_PREVIEW.origin),
  };
}

export function createXRSpatialScene(root, options = {}) {
  let layout = projectLayoutToXR(root, options);
  let userSpace = normalizeUserSpace(options.userSpace);
  let preview = normalizePreview(options.preview);

  return {
    version: XR_SPATIAL_SCENE_VERSION,
    unit: 'meter',
    coordinateSystem: options.coordinateSystem || XR_SPATIAL_SPACE.localFloor,
    origin: {
      type: 'viewer',
      position: vectorOr(options.origin?.position, [0, 0, 0]),
      rotation: vectorOr(options.origin?.rotation, [0, 0, 0]),
    },
    userSpace,
    preview,
    layout,
    panels: layout.panels.map((sourcePanel) => {
      let panel = options.adjustComfort === false
        ? sourcePanel
        : adjustXRPanelPoseForComfort(sourcePanel, { userSpace });
      panel = options.adjustFacing === false
        ? panel
        : adjustXRPanelRotationForViewer(panel, { userSpace });
      let previewPixels = {
        width: panel.size[0] * preview.pixelsPerMeter,
        height: panel.size[1] * preview.pixelsPerMeter,
      };
      return {
        ...panel,
        contentViewport: createXRPanelContentViewport(panel, { previewPixels }),
        spatialRole: panel.anchor === 'front' ? 'primary-surface' : 'support-surface',
        distanceFromUser: Math.abs(panel.position[2] || 0),
      };
    }),
    interaction: {
      pointerModel: 'ray-to-panel-normalized',
      eventSpace: 'panel-normalized-0-1',
      supportsMouseFallback: true,
    },
    placement: createXRSceneRootTransform({
      origin: options.origin,
      referenceSpaceType: options.referenceSpaceType,
    }, {
      mode: options.mode,
      referenceSpaceType: options.referenceSpaceType,
      viewerPose: options.viewerPose,
    }),
    themeScope: options.themeScope || layout.themeScope,
  };
}

export function createXRSpatialPreview(panel, scene, options = {}) {
  let pixelsPerMeter = numberOr(options.pixelsPerMeter, scene?.preview?.pixelsPerMeter || DEFAULT_PREVIEW.pixelsPerMeter);
  let depthScale = numberOr(options.depthScale, 1);
  let eyeHeight = numberOr(scene?.userSpace?.eyeHeight, DEFAULT_USER_SPACE.eyeHeight);
  let left = panel.position[0] * pixelsPerMeter;
  let top = (eyeHeight - panel.position[1]) * pixelsPerMeter;
  let depth = panel.position[2] * pixelsPerMeter * depthScale;

  return {
    panelId: panel.id,
    left,
    top,
    depth,
    width: panel.size[0] * pixelsPerMeter,
    height: panel.size[1] * pixelsPerMeter,
    opacity: panel.opacity,
    transform: [
      `translate3d(calc(-50% + ${left}px), calc(-50% + ${top}px), ${depth}px)`,
      `rotateX(${panel.rotation[0]}deg)`,
      `rotateY(${panel.rotation[1]}deg)`,
      `rotateZ(${panel.rotation[2]}deg)`,
    ].join(' '),
  };
}
