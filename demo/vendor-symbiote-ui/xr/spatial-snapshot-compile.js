/**
 * @file xr/spatial-snapshot-compile.js
 * @description Pure, Node-safe compiler from `spatial-snapshot-v1` measured snapshots
 * to the existing `native-panel-layout-v1` native scene. Meter-space output keeps
 * primitive/component/part/target/action provenance via `spatialNodeId`.
 * No DOM, no Three.js.
 * @module symbiote-ui/xr/spatial-snapshot-compile
 */

import {
  NATIVE_PANEL_LAYERS,
  NATIVE_PANEL_LAYOUT_VERSION,
  assignNativePanelLayerDepths,
} from './native-panel-layout.js';
import {
  normalizeSpatialSnapshot,
} from './spatial-snapshot.js';

export const SPATIAL_SNAPSHOT_FAMILY = 'spatial-snapshot';

export const SPATIAL_SNAPSHOT_COMPILE_DEFAULTS = Object.freeze({
  planeWidth: 1.9,
  z: 0,
});

const SPATIAL_SNAPSHOT_PARTS = Object.freeze([
  'panel',
  'header',
  'title',
  'text',
  'row',
  'row-label',
  'editor',
  'control',
  'resizer',
  'icon',
  'badge',
  'field',
  'surface',
]);

const LABEL_PARTS = new Set(['title', 'text', 'row-label']);

const ICON_OWNER_Z_STEP = 0.0002;

function roundMetric(value) {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function requirePositiveFinite(value, name, owner) {
  let number = Number(value);
  if (!Number.isFinite(number) || number <= 0) {
    throw new Error(`${owner} requires ${name} to be a positive finite number, got ${JSON.stringify(value)}.`);
  }
  return number;
}

/**
 * Resolves the meters-per-CSS-pixel scale that maps the captured viewport onto the
 * native plane.
 *
 * @param {Object} snapshot - Normalized `spatial-snapshot-v1` snapshot.
 * @param {Object} [options]
 * @param {number} [options.planeWidth] - Target plane width in meters.
 * @returns {number} Meters per CSS pixel.
 */
export function resolveSpatialSnapshotScale(snapshot, options = {}) {
  let viewport = snapshot?.capture?.viewport;
  if (!viewport || !(Number(viewport.width) > 0)) {
    throw new Error('resolveSpatialSnapshotScale requires a snapshot with a positive capture viewport.');
  }
  let planeWidth = requirePositiveFinite(
    options.planeWidth ?? SPATIAL_SNAPSHOT_COMPILE_DEFAULTS.planeWidth,
    'planeWidth',
    'resolveSpatialSnapshotScale',
  );
  return roundMetric(planeWidth / viewport.width);
}

function extractTextStyle(node) {
  let style = node.style || {};
  let font = {};
  if (style['font-size']) {
    font.size = style['font-size'];
    let sizePx = Number.parseFloat(style['font-size']);
    if (Number.isFinite(sizePx) && sizePx > 0 && node.rect.height > 0) {
      font.sizeRatio = roundMetric(sizePx / node.rect.height);
    }
  }
  if (style['font-family']) font.family = style['font-family'];
  if (style['font-weight']) font.weight = style['font-weight'];
  if (style['font-style']) font.style = style['font-style'];
  if (style['line-height']) font.lineHeight = style['line-height'];
  if (style['letter-spacing']) font.letterSpacing = style['letter-spacing'];
  let resolved = {};
  if (style.color) resolved.color = style.color;
  if (Object.keys(font).length) resolved.font = font;
  if (style.direction) resolved.direction = style.direction;
  if (style['white-space']) resolved.whiteSpace = style['white-space'];
  if (style.overflow) resolved.overflow = style.overflow;
  if (style['text-overflow']) resolved.textOverflow = style['text-overflow'];
  return Object.keys(resolved).length ? resolved : undefined;
}

function extractTextAlign(node) {
  let align = node.style?.['text-align'];
  if (align === 'center') return 'center';
  if (align === 'right' || align === 'end') return 'end';
  return 'start';
}

function sourcePixelsOf(node) {
  return { width: node.rect.width, height: node.rect.height };
}

function isTransparentColor(value) {
  if (!value || value === 'transparent') return true;
  let rgba = /^rgba?\(\s*([^()]+?)\s*\)$/i.exec(String(value).trim());
  if (rgba) {
    let parts = rgba[1].split(',').map((part) => Number.parseFloat(part.trim()));
    return parts.length >= 4 && Number.isFinite(parts[3]) && parts[3] <= 0;
  }
  let hex = /^#[0-9a-f]{6}([0-9a-f]{2})$/i.exec(String(value).trim());
  return Boolean(hex && Number.parseInt(hex[1], 16) === 0);
}

function extractSurfaceStyle(node) {
  let background = node.style?.['background-color'];
  if (isTransparentColor(background)) return undefined;
  return { background };
}

function hasBorderEvidence(node) {
  let style = node?.style || {};
  return style['border-style'] === 'solid'
    && Number.parseFloat(style['border-width']) > 0
    && !isTransparentColor(style['border-color']);
}

/**
 * Single predicate deciding whether a captured control carries visible chrome
 * (background or uniform solid border). Chromeless controls compile to transparent
 * hit regions; controls with visible chrome stay visible buttons.
 *
 * @param {Object} node - Normalized `spatial-snapshot-v1` control node.
 * @returns {boolean} True when the control has visible background or border evidence.
 */
export function hasVisibleControlChrome(node) {
  return Boolean(extractSurfaceStyle(node)) || hasBorderEvidence(node);
}

function extractBorderStyle(node, scale) {
  if (!hasBorderEvidence(node)) return undefined;
  return {
    border: {
      width: roundMetric(Number.parseFloat(node.style['border-width']) * scale),
      color: node.style['border-color'],
    },
  };
}

function toLocalBounds(node, panelNode, scale) {
  let nodeCenterX = node.rect.x + node.rect.width / 2;
  let nodeCenterY = node.rect.y + node.rect.height / 2;
  let panelCenterX = panelNode.rect.x + panelNode.rect.width / 2;
  let panelCenterY = panelNode.rect.y + panelNode.rect.height / 2;
  return {
    x: roundMetric((nodeCenterX - panelCenterX) * scale),
    y: roundMetric((panelCenterY - nodeCenterY) * scale),
    width: roundMetric(node.rect.width * scale),
    height: roundMetric(node.rect.height * scale),
  };
}

function withStyle(primitive, style) {
  if (style !== undefined) primitive.style = style;
  return primitive;
}

function compileLabelPrimitive(node, panelNode, scale, extra = {}) {
  let primitive = {
    id: `${panelNode.id}/content/${node.id}`,
    kind: 'label',
    layer: 'content',
    themeRole: 'text',
    text: node.text ?? '',
    align: extractTextAlign(node),
    bounds: toLocalBounds(node, panelNode, scale),
    sourcePixels: sourcePixelsOf(node),
    spatialNodeId: node.id,
    ...extra,
  };
  return withStyle(primitive, extractTextStyle(node));
}

function compileIconPrimitive(node, panelNode, scale) {
  let primitive = {
    id: `${panelNode.id}/content/${node.id}`,
    kind: 'icon',
    layer: 'content',
    themeRole: 'text',
    icon: node.icon.name,
    align: 'center',
    bounds: toLocalBounds(node, panelNode, scale),
    sourcePixels: sourcePixelsOf(node),
    spatialNodeId: node.id,
  };
  return withStyle(primitive, extractTextStyle(node));
}

function compileSurfacePrimitive(node, panelNode, scale, layer, themeRole, idSuffix = '') {
  let surfaceStyle = extractSurfaceStyle(node);
  let style = {
    ...surfaceStyle,
    ...extractBorderStyle(node, scale),
  };
  let primitive = {
    id: `${panelNode.id}/${layer}/${node.id}${idSuffix}`,
    kind: 'surface',
    layer,
    themeRole,
    bounds: toLocalBounds(node, panelNode, scale),
    spatialNodeId: node.id,
  };
  if (!surfaceStyle) primitive.transparent = true;
  return withStyle(primitive, Object.keys(style).length ? style : undefined);
}

function compileTransparentSurfacePrimitive(node, panelNode, scale) {
  return {
    id: `${panelNode.id}/content/${node.id}`,
    kind: 'surface',
    layer: 'content',
    themeRole: 'surface',
    transparent: true,
    bounds: toLocalBounds(node, panelNode, scale),
    spatialNodeId: node.id,
  };
}

function compileHitPrimitives(node, panelNode, scale) {
  return (node.actions || []).map((action) => ({
    id: `${panelNode.id}/controls/${node.id}#${action.id}`,
    kind: 'control',
    control: 'hit',
    layer: 'controls',
    themeRole: 'accent',
    bounds: toLocalBounds(node, panelNode, scale),
    hit: {
      id: `${node.id}/hit/${action.id}`,
      actionId: action.id,
      targetId: action.targetId,
      intent: action.intent,
    },
    spatialNodeId: node.id,
  }));
}

function compileControlPrimitive(node, panelNode, scale) {
  let primitive = {
    id: `${panelNode.id}/controls/${node.id}`,
    kind: 'control',
    control: 'button',
    layer: 'controls',
    themeRole: 'accent',
    bounds: toLocalBounds(node, panelNode, scale),
    spatialNodeId: node.id,
  };
  if (node.text !== undefined) {
    primitive.text = node.text;
    primitive.align = 'center';
    primitive.sourcePixels = sourcePixelsOf(node);
  }
  let style = {
    ...extractSurfaceStyle(node),
    ...extractTextStyle(node),
    ...extractBorderStyle(node, scale),
  };
  return withStyle(primitive, Object.keys(style).length ? style : undefined);
}

function compileChromelessControlPrimitives(node, panelNode, scale) {
  let hits = compileHitPrimitives(node, panelNode, scale);
  if (hits.length) return hits;
  return [{
    id: `${panelNode.id}/controls/${node.id}`,
    kind: 'control',
    control: 'hit',
    layer: 'controls',
    themeRole: 'accent',
    bounds: toLocalBounds(node, panelNode, scale),
    spatialNodeId: node.id,
  }];
}

function compileHeaderPrimitive(node, panelNode, scale) {
  let primitive = compileSurfacePrimitive(node, panelNode, scale, 'surface', 'surface-raised');
  primitive.hit = {
    id: `${node.id}/hit/drag-panel`,
    actionId: 'drag-panel',
    targetId: panelNode.id,
    intent: 'panel-drag',
  };
  return primitive;
}

function compileNodePrimitives(node, panelNode, scale) {
  switch (node.part) {
    case 'panel':
      return [compileSurfacePrimitive(node, panelNode, scale, 'surface', 'surface')];
    case 'header':
      return [compileHeaderPrimitive(node, panelNode, scale)];
    case 'title':
    case 'text':
    case 'row-label':
      return [compileLabelPrimitive(node, panelNode, scale)];
    case 'icon':
      return [compileIconPrimitive(node, panelNode, scale)];
    case 'editor': {
      let primitives = [];
      if (extractSurfaceStyle(node)) {
        primitives.push(compileSurfacePrimitive(node, panelNode, scale, 'content', 'surface-sunken', '/surface'));
      }
      primitives.push(compileLabelPrimitive(node, panelNode, scale, { multiline: true }));
      return primitives;
    }
    case 'row': {
      let primitives = [];
      let style = extractSurfaceStyle(node);
      if (style) primitives.push(compileSurfacePrimitive(node, panelNode, scale, 'content', 'surface-raised'));
      primitives.push(...compileHitPrimitives(node, panelNode, scale));
      return primitives;
    }
    case 'control': {
      if (!hasVisibleControlChrome(node)) {
        return compileChromelessControlPrimitives(node, panelNode, scale);
      }
      let primitives = [compileControlPrimitive(node, panelNode, scale)];
      if (node.actions?.length) {
        let [first, ...rest] = compileHitPrimitives(node, panelNode, scale);
        primitives[0].hit = first.hit;
        primitives.push(...rest);
      }
      return primitives;
    }
    case 'badge': {
      let primitives = [];
      let style = {
        ...extractSurfaceStyle(node),
        ...extractBorderStyle(node, scale),
      };
      if (Object.keys(style).length) {
        primitives.push(compileSurfacePrimitive(node, panelNode, scale, 'content', 'surface-raised', '/surface'));
      }
      if (node.text !== undefined) primitives.push(compileLabelPrimitive(node, panelNode, scale));
      return primitives;
    }
    case 'field': {
      let primitives = [
        compileSurfacePrimitive(node, panelNode, scale, 'content', 'surface-sunken', '/surface'),
      ];
      if (node.text) primitives.push(compileLabelPrimitive(node, panelNode, scale));
      return primitives;
    }
    case 'surface': {
      let style = {
        ...extractSurfaceStyle(node),
        ...extractBorderStyle(node, scale),
      };
      if (!Object.keys(style).length) {
        return [compileTransparentSurfacePrimitive(node, panelNode, scale)];
      }
      return [compileSurfacePrimitive(node, panelNode, scale, 'content', 'surface')];
    }
    case 'resizer': {
      let primitives = [compileSurfacePrimitive(node, panelNode, scale, 'surface', 'outline')];
      primitives.push(...compileHitPrimitives(node, panelNode, scale));
      return primitives;
    }
    default:
      throw new Error(
        `Unknown spatial snapshot part "${node.part}". Supported: ${SPATIAL_SNAPSHOT_PARTS.join(', ')}.`,
      );
  }
}

function collectDescendants(snapshot, rootId, structuralIds) {
  let byParent = new Map();
  for (let node of snapshot.nodes) {
    if (node.parentId === null) continue;
    if (!byParent.has(node.parentId)) byParent.set(node.parentId, []);
    byParent.get(node.parentId).push(node);
  }
  let descendants = [];
  let stack = [...(byParent.get(rootId) || [])];
  while (stack.length) {
    let node = stack.shift();
    if (structuralIds.has(node.id)) continue;
    descendants.push(node);
    stack.push(...(byParent.get(node.id) || []));
  }
  return descendants;
}

function raiseIconDepths(primitives, snapshot) {
  let parentByNodeId = new Map(snapshot.nodes.map((node) => [node.id, node.parentId]));
  let bySpatialNodeId = new Map();
  for (let primitive of primitives) {
    if (!primitive.spatialNodeId) continue;
    if (!bySpatialNodeId.has(primitive.spatialNodeId)) bySpatialNodeId.set(primitive.spatialNodeId, []);
    bySpatialNodeId.get(primitive.spatialNodeId).push(primitive);
  }
  let iconsByOwner = new Map();
  for (let primitive of primitives) {
    if (primitive.kind !== 'icon') continue;
    let owners = bySpatialNodeId.get(parentByNodeId.get(primitive.spatialNodeId)) || [];
    let owner = owners.find((candidate) => candidate.kind === 'control' && candidate.control === 'button')
      || owners.find((candidate) => candidate.kind !== 'control')
      || owners[0];
    if (!owner) continue;
    if (!iconsByOwner.has(owner.id)) iconsByOwner.set(owner.id, { owner, icons: [] });
    iconsByOwner.get(owner.id).icons.push(primitive);
  }
  for (let { owner, icons } of iconsByOwner.values()) {
    icons.forEach((icon, index) => {
      icon.z = roundMetric(owner.z + ((index + 1) * ICON_OWNER_Z_STEP) / (icons.length + 1));
    });
  }
}

function compileSpatialPanel(node, children, snapshot, scale, z) {
  let viewport = snapshot.capture.viewport;
  let position = [
    roundMetric((node.rect.x + node.rect.width / 2 - viewport.width / 2) * scale),
    roundMetric((viewport.height / 2 - node.rect.y - node.rect.height / 2) * scale),
    roundMetric(z),
  ];
  let size = [roundMetric(node.rect.width * scale), roundMetric(node.rect.height * scale)];
  let isResizer = node.part === 'resizer';
  let primitives = [];
  for (let child of [node, ...children]) {
    primitives.push(...compileNodePrimitives(child, node, scale));
  }
  if (isResizer && !node.actions?.length) {
    throw new Error(
      `Spatial snapshot resizer "${node.id}" requires a drag-resizer action to stay interactive.`,
    );
  }
  primitives.push({
    id: `${node.id}/focus/frame`,
    kind: 'frame',
    layer: 'focus',
    themeRole: 'accent',
    thickness: 0.002,
    bounds: { x: 0, y: 0, width: size[0], height: size[1] },
    spatialNodeId: node.id,
  });
  let layered = assignNativePanelLayerDepths(primitives);
  raiseIconDepths(layered, snapshot);
  return {
    id: node.id,
    family: SPATIAL_SNAPSHOT_FAMILY,
    role: isResizer ? 'layout-control' : 'window',
    panelType: isResizer ? 'split-resizer' : node.component,
    position,
    rotation: [0, 0, 0],
    size,
    relativeRect: {
      x: roundMetric(node.rect.x / viewport.width),
      y: roundMetric(node.rect.y / viewport.height),
      width: roundMetric(node.rect.width / viewport.width),
      height: roundMetric(node.rect.height / viewport.height),
    },
    metadata: { spatialNodeId: node.id },
    primitives: layered,
  };
}

/**
 * Compiles a measured `spatial-snapshot-v1` snapshot into the existing
 * `native-panel-layout-v1` scene consumed by native panel renderers. Panel and
 * resizer geometry derives from measured boxes only, never from declared ratios.
 * Each leaf panel node compiles to exactly one independently renderable `window`
 * group; resizer nodes compile to `layout-control` groups that only arrange those
 * windows. `counts` keeps both roles distinct (`windows` vs `layoutControls`)
 * while `panels` stays the total transport-group count.
 *
 * @param {Object} input - Raw or normalized `spatial-snapshot-v1` snapshot.
 * @param {Object} [options]
 * @param {number} [options.planeWidth] - Target plane width in meters.
 * @param {number} [options.z] - Plane Z position in meters.
 * @returns {Object} `native-panel-layout-v1` scene with `spatialSnapshot` provenance.
 */
export function compileSpatialSnapshot(input, options = {}) {
  let snapshot = normalizeSpatialSnapshot(input);
  let scale = resolveSpatialSnapshotScale(snapshot, options);
  let z = Number(options.z ?? SPATIAL_SNAPSHOT_COMPILE_DEFAULTS.z);
  if (!Number.isFinite(z)) {
    throw new Error(`compileSpatialSnapshot requires z to be a finite number, got ${JSON.stringify(options.z)}.`);
  }
  let structural = snapshot.nodes.filter((node) => node.part === 'panel' || node.part === 'resizer');
  if (!structural.length) {
    throw new Error('compileSpatialSnapshot requires at least one panel or resizer node in the snapshot.');
  }
  let structuralIds = new Set(structural.map((node) => node.id));
  let compiledPanels = structural.map((node) => {
    let children = collectDescendants(snapshot, node.id, structuralIds);
    return compileSpatialPanel(node, children, snapshot, scale, z);
  });

  let byLayer = Object.fromEntries(NATIVE_PANEL_LAYERS.map((layer) => [layer, 0]));
  let byKind = {};
  let primitives = 0;
  let hitTargets = 0;
  for (let panel of compiledPanels) {
    for (let primitive of panel.primitives) {
      primitives += 1;
      byLayer[primitive.layer] += 1;
      byKind[primitive.kind] = (byKind[primitive.kind] || 0) + 1;
      if (primitive.hit) hitTargets += 1;
    }
  }

  return {
    version: NATIVE_PANEL_LAYOUT_VERSION,
    layers: [...NATIVE_PANEL_LAYERS],
    panels: compiledPanels,
    counts: {
      panels: compiledPanels.length,
      windows: compiledPanels.filter((panel) => panel.role === 'window').length,
      layoutControls: compiledPanels.filter((panel) => panel.role === 'layout-control').length,
      primitives,
      hitTargets,
      byLayer,
      byKind,
    },
    spatialSnapshot: {
      scale,
      viewport: { ...snapshot.capture.viewport },
      planeHeight: roundMetric(snapshot.capture.viewport.height * scale),
      ...(snapshot.capture.route !== undefined ? { route: snapshot.capture.route } : {}),
      ...(snapshot.capture.themeScope !== undefined ? { themeScope: snapshot.capture.themeScope } : {}),
    },
  };
}
