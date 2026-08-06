/**
 * @file xr/native-panel-layout.js
 * @description Pure, Node-safe compiler that projects normalized layout panels onto a
 * direct meter-space plane and compiles generic panel families into deterministic
 * panel-local primitives for native 3D panel renderers. No DOM, no Three.js.
 * @module symbiote-ui/xr/native-panel-layout
 */

export const NATIVE_PANEL_LAYOUT_VERSION = 'native-panel-layout-v1';

/** Finite Z layer list, back to front. */
export const NATIVE_PANEL_LAYERS = Object.freeze(['surface', 'content', 'controls', 'focus']);

/** Generic panel families the compiler supports. */
export const NATIVE_PANEL_FAMILY_IDS = Object.freeze(['detail-actions', 'list-table', 'workflow-graph']);

/** Semantic theme roles primitives reference; resolved to tokens by xr/theme-bridge.js. */
export const NATIVE_PANEL_THEME_ROLES = Object.freeze([
  'surface',
  'surface-raised',
  'surface-sunken',
  'text',
  'text-dim',
  'outline',
  'accent',
  'success',
  'warning',
  'danger',
]);

const NATIVE_PANEL_TONES = Object.freeze(['accent', 'success', 'warning', 'danger']);

const LAYER_Z = Object.freeze({
  surface: 0,
  content: 0.004,
  controls: 0.008,
  focus: 0.012,
});

const LAYER_Z_STEP = 0.0002;

const CHROME = Object.freeze({
  pad: 0.012,
  headerHeight: 0.04,
  rowHeight: 0.052,
  fieldHeight: 0.036,
  ruleThickness: 0.0016,
  badgeHeight: 0.022,
  badgeDot: 0.012,
  controlHeight: 0.034,
  frameThickness: 0.002,
});

function numberOr(value, fallback) {
  let number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

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

function normalizeRelativeRect(rect, panelId, index) {
  let valid = rect &&
    Number.isFinite(Number(rect.x)) &&
    Number.isFinite(Number(rect.y)) &&
    Number(rect.width) > 0 &&
    Number(rect.height) > 0;
  if (!valid) {
    throw new Error(
      `projectXRPanelsToPlane requires panels with a normalized relativeRect ({ x, y, width, height } in 0..1); ` +
      `panel at index ${index} (id "${panelId ?? '?'}") is missing a valid relativeRect. ` +
      'Run projectLayoutToXR() on a layout tree first.',
    );
  }
  return {
    x: clamp01(numberOr(rect.x, 0)),
    y: clamp01(numberOr(rect.y, 0)),
    width: clamp01(numberOr(rect.width, 1)),
    height: clamp01(numberOr(rect.height, 1)),
  };
}

/**
 * Projects normalized XR panels (with `relativeRect` from `projectLayoutToXR`) onto a
 * shared, centered meter-space plane.
 *
 * @param {Array<Object>} panels - Normalized panels carrying stable `id` and `relativeRect`.
 * @param {Object} [options]
 * @param {number} [options.planeWidth] - Total plane width in meters.
 * @param {number} [options.planeHeight] - Total plane height in meters.
 * @param {number} [options.gap] - Uniform gap subtracted from each panel size, in meters.
 * @param {number} [options.z] - Plane Z position in meters.
 * @returns {Object} `native-panel-layout-v1` projection with meter positions/sizes.
 */
export function projectXRPanelsToPlane(panels, options = {}) {
  if (!Array.isArray(panels) || !panels.length) {
    throw new Error(
      `projectXRPanelsToPlane requires a non-empty array of normalized panels, got ${JSON.stringify(panels)}.`,
    );
  }
  let planeWidth = requirePositiveFinite(options.planeWidth ?? 1.6, 'planeWidth', 'projectXRPanelsToPlane');
  let planeHeight = requirePositiveFinite(options.planeHeight ?? 0.9, 'planeHeight', 'projectXRPanelsToPlane');
  let gap = numberOr(options.gap, 0.02);
  if (!Number.isFinite(gap) || gap < 0) {
    throw new Error(`projectXRPanelsToPlane requires gap to be a non-negative finite number, got ${JSON.stringify(options.gap)}.`);
  }
  let z = numberOr(options.z, 0);
  if (!Number.isFinite(z)) {
    throw new Error(`projectXRPanelsToPlane requires z to be a finite number, got ${JSON.stringify(options.z)}.`);
  }

  let seen = new Set();
  let projectedPanels = panels.map((panel, index) => {
    let id = String(panel?.id ?? '');
    if (!id) {
      throw new Error(`projectXRPanelsToPlane requires a stable string id on every panel; panel at index ${index} has none.`);
    }
    if (seen.has(id)) {
      throw new Error(`Duplicate panel id "${id}" in projectXRPanelsToPlane input; panel ids must be unique and stable.`);
    }
    seen.add(id);
    let rect = normalizeRelativeRect(panel.relativeRect, id, index);
    let width = Math.max(rect.width * planeWidth - gap, 0.001);
    let height = Math.max(rect.height * planeHeight - gap, 0.001);
    let projected = {
      id,
      role: panel.role || 'window',
      panelType: panel.panelType || panel.component || 'panel',
      relativeRect: rect,
      position: [
        roundMetric((rect.x + rect.width / 2 - 0.5) * planeWidth),
        roundMetric((0.5 - (rect.y + rect.height / 2)) * planeHeight),
        roundMetric(z),
      ],
      rotation: [0, 0, 0],
      size: [roundMetric(width), roundMetric(height)],
    };
    if (panel.metadata !== undefined) projected.metadata = panel.metadata;
    if (panel.priority !== undefined) projected.priority = panel.priority;
    if (panel.themeScope !== undefined) projected.themeScope = panel.themeScope;
    return projected;
  });

  return {
    version: NATIVE_PANEL_LAYOUT_VERSION,
    unit: 'meter',
    coordinateSpace: 'centered-panel-plane',
    plane: { width: planeWidth, height: planeHeight, gap, z: roundMetric(z) },
    panels: projectedPanels,
  };
}

function resolveTone(tone, owner) {
  if (tone === undefined || tone === null || tone === '') return 'accent';
  if (!NATIVE_PANEL_TONES.includes(tone)) {
    throw new Error(`Unknown tone "${tone}" in ${owner}. Supported: ${NATIVE_PANEL_TONES.join(', ')}.`);
  }
  return tone;
}

function createContentArea(size) {
  let [width, height] = size;
  return {
    width,
    height,
    top: height / 2 - CHROME.headerHeight,
    bottom: -height / 2 + CHROME.pad,
    left: -width / 2 + CHROME.pad,
    right: width / 2 - CHROME.pad,
  };
}

function compileChrome(panel, data) {
  let [width, height] = panel.size;
  let id = panel.id;
  let headerBounds = { x: 0, y: height / 2 - CHROME.headerHeight / 2, width, height: CHROME.headerHeight };
  let titleInset = CHROME.pad;
  return {
    surfaces: [
      {
        id: `${id}/surface/panel`,
        kind: 'surface',
        layer: 'surface',
        themeRole: 'surface',
        bounds: { x: 0, y: 0, width, height },
      },
      {
        id: `${id}/surface/header`,
        kind: 'surface',
        layer: 'surface',
        themeRole: 'surface-raised',
        bounds: headerBounds,
      },
    ],
    content: [
      {
        id: `${id}/content/title`,
        kind: 'label',
        layer: 'content',
        themeRole: 'text',
        text: String(data.title || id),
        align: 'start',
        bounds: {
          x: -width / 2 + titleInset + (width - titleInset * 2) / 2,
          y: headerBounds.y,
          width: width - titleInset * 2,
          height: CHROME.headerHeight - CHROME.pad / 2,
        },
      },
    ],
    controls: [
      {
        id: `${id}/controls/drag`,
        kind: 'control',
        control: 'drag',
        layer: 'controls',
        themeRole: 'outline',
        bounds: headerBounds,
        hit: { id: `${id}/hit/drag-panel`, actionId: 'drag-panel', targetId: id },
      },
    ],
    focus: [
      {
        id: `${id}/focus/frame`,
        kind: 'frame',
        layer: 'focus',
        themeRole: 'accent',
        thickness: CHROME.frameThickness,
        bounds: { x: 0, y: 0, width, height },
      },
    ],
  };
}

function compileListTable(panel, data) {
  let rows = Array.isArray(data.rows) ? data.rows : [];
  let area = createContentArea(panel.size);
  let contentWidth = area.right - area.left;
  let content = [];
  let controls = [];
  rows.forEach((row, index) => {
    let rowId = String(row.id ?? `row-${index}`);
    let centerY = area.top - CHROME.rowHeight / 2 - index * CHROME.rowHeight;
    let rowBounds = { x: 0, y: centerY, width: area.width, height: CHROME.rowHeight };
    let textWidth = contentWidth * 0.62;
    let textLeft = area.left + textWidth / 2;
    content.push({
      id: `${panel.id}/content/row-surface-${rowId}`,
      kind: 'surface',
      layer: 'content',
      themeRole: index % 2 ? 'surface' : 'surface-raised',
      bounds: rowBounds,
    });
    content.push({
      id: `${panel.id}/content/row-title-${rowId}`,
      kind: 'label',
      layer: 'content',
      themeRole: 'text',
      text: String(row.title ?? rowId),
      align: 'start',
      bounds: {
        x: textLeft,
        y: centerY + CHROME.rowHeight / 4,
        width: textWidth,
        height: CHROME.rowHeight / 2 - 0.004,
      },
    });
    content.push({
      id: `${panel.id}/content/row-detail-${rowId}`,
      kind: 'label',
      layer: 'content',
      themeRole: 'text-dim',
      text: String(row.detail ?? ''),
      align: 'start',
      bounds: {
        x: textLeft,
        y: centerY - CHROME.rowHeight / 4,
        width: textWidth,
        height: CHROME.rowHeight / 2 - 0.004,
      },
    });
    if (row.tone !== undefined || row.badge !== undefined) {
      let badgeText = typeof row.badge === 'string' ? row.badge : row.badge?.text;
      let badgeWidth = badgeText
        ? Math.min(0.02 + String(badgeText).length * 0.007, contentWidth * 0.4)
        : CHROME.badgeDot;
      content.push({
        id: `${panel.id}/content/row-badge-${rowId}`,
        kind: 'badge',
        layer: 'content',
        themeRole: resolveTone(row.badge?.tone ?? row.tone, `row "${rowId}" badge`),
        text: badgeText ? String(badgeText) : null,
        align: 'center',
        bounds: {
          x: area.right - badgeWidth / 2,
          y: centerY,
          width: badgeWidth,
          height: badgeText ? CHROME.badgeHeight : CHROME.badgeDot,
        },
      });
    }
    content.push({
      id: `${panel.id}/content/row-rule-${rowId}`,
      kind: 'rule',
      layer: 'content',
      themeRole: 'outline',
      bounds: {
        x: 0,
        y: area.top - (index + 1) * CHROME.rowHeight,
        width: contentWidth,
        height: CHROME.ruleThickness,
      },
    });
    controls.push({
      id: `${panel.id}/controls/row-${rowId}`,
      kind: 'control',
      control: 'hit',
      layer: 'controls',
      themeRole: 'accent',
      bounds: rowBounds,
      hit: { id: `${panel.id}/hit/row-${rowId}`, actionId: 'select-row', targetId: rowId },
    });
  });
  return { content, controls };
}

function resolveNodeColumns(nodes, edges) {
  let depth = new Map(nodes.map((node) => [node.id, 0]));
  for (let pass = 0; pass < nodes.length; pass += 1) {
    for (let edge of edges) {
      let source = depth.get(edge.source);
      let target = depth.get(edge.target);
      if (source === undefined || target === undefined) continue;
      if (source + 1 > target) depth.set(edge.target, source + 1);
    }
  }
  return nodes.map((node) => node.column ?? depth.get(node.id) ?? 0);
}

function compileWorkflowGraph(panel, data) {
  let nodes = Array.isArray(data.nodes) ? data.nodes : [];
  let edges = Array.isArray(data.edges) ? data.edges : [];
  let nodeIds = new Set(nodes.map((node) => String(node.id)));
  for (let edge of edges) {
    if (!nodeIds.has(String(edge.source)) || !nodeIds.has(String(edge.target))) {
      throw new Error(
        `workflow-graph edge "${edge.source}" -> "${edge.target}" in panel "${panel.id}" references an unknown node. ` +
        `Known nodes: ${[...nodeIds].join(', ')}.`,
      );
    }
  }
  let area = createContentArea(panel.size);
  let contentWidth = area.right - area.left;
  let contentHeight = area.top - area.bottom;
  let normalizedNodes = nodes.map((node, index) => ({
    id: String(node.id ?? `node-${index}`),
    label: String(node.label ?? node.id ?? `node-${index}`),
    tone: node.tone === undefined ? null : resolveTone(node.tone, `node "${node.id}"`),
    column: Number.isFinite(Number(node.column)) ? Number(node.column) : null,
  }));
  let columns = resolveNodeColumns(
    normalizedNodes.map((node) => ({ id: node.id, column: node.column ?? undefined })),
    edges.map((edge) => ({ source: String(edge.source), target: String(edge.target) })),
  );
  let columnCount = Math.max(...columns, 0) + 1;
  let nodesByColumn = new Map();
  normalizedNodes.forEach((node, index) => {
    let column = columns[index];
    if (!nodesByColumn.has(column)) nodesByColumn.set(column, []);
    nodesByColumn.get(column).push(node);
  });
  let maxRows = Math.max(...[...nodesByColumn.values()].map((list) => list.length), 1);
  let nodeWidth = Math.min(0.12, (contentWidth / columnCount) * 0.72);
  let nodeHeight = Math.min(0.05, (contentHeight / maxRows) * 0.6);
  let centers = new Map();
  let content = [];
  let controls = [];
  for (let [column, columnNodes] of [...nodesByColumn.entries()].sort((a, b) => a[0] - b[0])) {
    columnNodes.forEach((node, rowIndex) => {
      let center = {
        x: area.left + (column + 0.5) * (contentWidth / columnCount),
        y: area.top - (rowIndex + 0.5) * (contentHeight / columnNodes.length),
      };
      centers.set(node.id, center);
    });
  }
  edges.forEach((edge, index) => {
    let source = centers.get(String(edge.source));
    let target = centers.get(String(edge.target));
    let dx = target.x - source.x;
    let dy = target.y - source.y;
    content.push({
      id: `${panel.id}/content/edge-${edge.source}-${edge.target}-${index}`,
      kind: 'edge',
      layer: 'content',
      themeRole: 'outline',
      angle: roundMetric(Math.atan2(dy, dx)),
      bounds: {
        x: roundMetric((source.x + target.x) / 2),
        y: roundMetric((source.y + target.y) / 2),
        width: roundMetric(Math.hypot(dx, dy)),
        height: CHROME.ruleThickness,
      },
    });
  });
  for (let node of normalizedNodes) {
    let center = centers.get(node.id);
    let nodeBounds = { x: roundMetric(center.x), y: roundMetric(center.y), width: nodeWidth, height: nodeHeight };
    content.push({
      id: `${panel.id}/content/node-${node.id}`,
      kind: 'node',
      layer: 'content',
      themeRole: node.tone || 'surface-raised',
      bounds: nodeBounds,
    });
    content.push({
      id: `${panel.id}/content/node-label-${node.id}`,
      kind: 'label',
      layer: 'content',
      themeRole: 'text',
      text: node.label,
      align: 'center',
      bounds: nodeBounds,
    });
    controls.push({
      id: `${panel.id}/controls/node-${node.id}`,
      kind: 'control',
      control: 'hit',
      layer: 'controls',
      themeRole: 'accent',
      bounds: nodeBounds,
      hit: { id: `${panel.id}/hit/node-${node.id}`, actionId: 'select-node', targetId: node.id },
    });
  }
  return { content, controls };
}

function compileDetailActions(panel, data) {
  let fields = Array.isArray(data.fields) ? data.fields : [];
  let actions = Array.isArray(data.actions) ? data.actions : [];
  let area = createContentArea(panel.size);
  let contentWidth = area.right - area.left;
  let content = [];
  let controls = [];
  fields.forEach((field, index) => {
    let fieldId = String(field.id ?? `field-${index}`);
    let centerY = area.top - CHROME.fieldHeight / 2 - index * CHROME.fieldHeight;
    let labelWidth = contentWidth * 0.38;
    content.push({
      id: `${panel.id}/content/field-label-${fieldId}`,
      kind: 'label',
      layer: 'content',
      themeRole: 'text-dim',
      text: String(field.label ?? fieldId),
      align: 'start',
      bounds: {
        x: area.left + labelWidth / 2,
        y: centerY,
        width: labelWidth,
        height: CHROME.fieldHeight - 0.008,
      },
    });
    content.push({
      id: `${panel.id}/content/field-value-${fieldId}`,
      kind: 'label',
      layer: 'content',
      themeRole: 'text',
      text: String(field.value ?? ''),
      align: 'start',
      bounds: {
        x: area.left + labelWidth + (contentWidth - labelWidth) / 2,
        y: centerY,
        width: contentWidth - labelWidth,
        height: CHROME.fieldHeight - 0.008,
      },
    });
    content.push({
      id: `${panel.id}/content/field-rule-${fieldId}`,
      kind: 'rule',
      layer: 'content',
      themeRole: 'outline',
      bounds: {
        x: 0,
        y: area.top - (index + 1) * CHROME.fieldHeight,
        width: contentWidth,
        height: CHROME.ruleThickness,
      },
    });
  });
  let actionWidth = (contentWidth - CHROME.pad * Math.max(actions.length - 1, 0)) / Math.max(actions.length, 1);
  actions.forEach((action, index) => {
    let actionId = String(action.id ?? `action-${index}`);
    let centerX = area.left + actionWidth / 2 + index * (actionWidth + CHROME.pad);
    let actionBounds = {
      x: roundMetric(centerX),
      y: area.bottom + CHROME.controlHeight / 2,
      width: roundMetric(actionWidth),
      height: CHROME.controlHeight,
    };
    controls.push({
      id: `${panel.id}/controls/action-${actionId}`,
      kind: 'control',
      control: 'button',
      layer: 'controls',
      themeRole: resolveTone(action.tone, `action "${actionId}"`),
      text: String(action.label ?? actionId),
      align: 'center',
      bounds: actionBounds,
      hit: { id: `${panel.id}/hit/action-${actionId}`, actionId, targetId: actionId },
    });
  });
  return { content, controls };
}

const FAMILY_COMPILERS = Object.freeze({
  'list-table': compileListTable,
  'workflow-graph': compileWorkflowGraph,
  'detail-actions': compileDetailActions,
});

/**
 * Assigns deterministic per-primitive Z depths inside each finite layer.
 *
 * @param {Array<Object>} primitives - Primitives with a `layer` id and `bounds`.
 * @returns {Array<Object>} The same primitives with `z` and rounded `bounds`.
 */
export function assignNativePanelLayerDepths(primitives) {
  let counters = new Map();
  for (let primitive of primitives) {
    let index = counters.get(primitive.layer) || 0;
    counters.set(primitive.layer, index + 1);
    primitive.z = roundMetric(LAYER_Z[primitive.layer] + index * LAYER_Z_STEP);
    primitive.bounds = {
      x: roundMetric(primitive.bounds.x),
      y: roundMetric(primitive.bounds.y),
      width: roundMetric(primitive.bounds.width),
      height: roundMetric(primitive.bounds.height),
    };
  }
  return primitives;
}

/**
 * Compiles projected panels plus generic per-panel family data into deterministic
 * panel-local primitives with stable IDs, semantic theme roles, explicit Z layers,
 * and hit targets.
 *
 * @param {Array<Object>} panels - Panels from `projectXRPanelsToPlane`.
 * @param {Object<string, Object>} familyData - Family descriptors keyed by panel id.
 * @returns {Object} `native-panel-layout-v1` compiled scene with counts.
 */
export function compileNativePanelPrimitives(panels, familyData = {}) {
  if (!Array.isArray(panels) || !panels.length) {
    throw new Error('compileNativePanelPrimitives requires a non-empty array of projected panels.');
  }
  let compiledPanels = panels.map((panel, panelIndex) => {
    let id = String(panel?.id ?? '');
    let size = Array.isArray(panel?.size) ? panel.size : null;
    if (!id || !size || !(Number(size[0]) > 0) || !(Number(size[1]) > 0)) {
      throw new Error(
        `compileNativePanelPrimitives requires projected panels with id and positive size [width, height]; ` +
        `panel at index ${panelIndex} (id "${id || '?'}") is invalid. Run projectXRPanelsToPlane() first.`,
      );
    }
    let data = familyData[id];
    if (!data || typeof data !== 'object') {
      throw new Error(
        `compileNativePanelPrimitives requires family data for every panel; panel "${id}" has no family data entry. ` +
        `Provide family data keyed by panel id with one of: ${NATIVE_PANEL_FAMILY_IDS.join(', ')}.`,
      );
    }
    let compiler = FAMILY_COMPILERS[data.family];
    if (!compiler) {
      throw new Error(`Unknown native panel family "${data.family}". Supported: ${NATIVE_PANEL_FAMILY_IDS.join(', ')}.`);
    }
    let chrome = compileChrome(panel, data);
    let body = compiler(panel, data);
    let compiled = {
      id,
      family: data.family,
      role: panel.role || 'window',
      panelType: panel.panelType || 'panel',
      position: [...(panel.position || [0, 0, 0])],
      rotation: [...(panel.rotation || [0, 0, 0])],
      size: [Number(size[0]), Number(size[1])],
      relativeRect: panel.relativeRect || null,
      primitives: assignNativePanelLayerDepths([
        ...chrome.surfaces,
        ...chrome.content,
        ...body.content,
        ...chrome.controls,
        ...body.controls,
        ...chrome.focus,
      ]),
    };
    if (panel.metadata !== undefined) compiled.metadata = panel.metadata;
    return compiled;
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
      primitives,
      hitTargets,
      byLayer,
      byKind,
    },
  };
}

function reflowAxis(center, length, sourceSize, targetSize) {
  let negativeGap = center - length / 2 + sourceSize / 2;
  let positiveGap = sourceSize / 2 - center - length / 2;
  let tolerance = Math.max(0.006, sourceSize * 0.04);
  let spansAxis = negativeGap <= tolerance && positiveGap <= tolerance;
  if (spansAxis) {
    let nextLength = Math.max(0.001, targetSize - negativeGap - positiveGap);
    return {
      center: roundMetric((negativeGap - positiveGap) / 2),
      length: roundMetric(nextLength),
    };
  }
  if (negativeGap <= tolerance || negativeGap < positiveGap * 0.45) {
    return {
      center: roundMetric(-targetSize / 2 + negativeGap + length / 2),
      length: roundMetric(length),
    };
  }
  if (positiveGap <= tolerance || positiveGap < negativeGap * 0.45) {
    return {
      center: roundMetric(targetSize / 2 - positiveGap - length / 2),
      length: roundMetric(length),
    };
  }
  return {
    center: roundMetric(center),
    length: roundMetric(length),
  };
}

function clipAxis(center, length, targetSize) {
  let start = center - length / 2;
  let end = center + length / 2;
  let minimum = -targetSize / 2;
  let maximum = targetSize / 2;
  let clippedStart = Math.max(start, minimum);
  let clippedEnd = Math.min(end, maximum);
  if (clippedEnd - clippedStart < 0.001) {
    return { visible: false, center, length };
  }
  return {
    visible: true,
    center: roundMetric((clippedStart + clippedEnd) / 2),
    length: roundMetric(clippedEnd - clippedStart),
    clipped: clippedStart !== start || clippedEnd !== end,
  };
}

function reflowPrimitive(primitive, sourceSize, targetSize) {
  let sourceBounds = primitive.bounds;
  let horizontal = reflowAxis(
    sourceBounds.x,
    sourceBounds.width,
    sourceSize[0],
    targetSize[0],
  );
  let vertical = reflowAxis(
    sourceBounds.y,
    sourceBounds.height,
    sourceSize[1],
    targetSize[1],
  );
  let horizontalClip = clipAxis(horizontal.center, horizontal.length, targetSize[0]);
  let verticalClip = clipAxis(vertical.center, vertical.length, targetSize[1]);
  let canCrop = primitive.kind !== 'icon' && primitive.kind !== 'edge';
  let visible = horizontalClip.visible
    && verticalClip.visible
    && (canCrop || (!horizontalClip.clipped && !verticalClip.clipped));
  let bounds = {
    x: canCrop && visible ? horizontalClip.center : horizontal.center,
    y: canCrop && visible ? verticalClip.center : vertical.center,
    width: canCrop && visible ? horizontalClip.length : horizontal.length,
    height: canCrop && visible ? verticalClip.length : vertical.length,
  };
  let next = {
    ...primitive,
    bounds,
  };
  if (!visible) {
    next.visible = false;
  } else if (primitive.visible === false) {
    delete next.visible;
  }
  if (visible
    && primitive.sourcePixels?.width > 0
    && primitive.sourcePixels?.height > 0
    && sourceBounds.width > 0
    && sourceBounds.height > 0) {
    next.sourcePixels = {
      ...primitive.sourcePixels,
      width: roundMetric(primitive.sourcePixels.width * bounds.width / sourceBounds.width),
      height: roundMetric(primitive.sourcePixels.height * bounds.height / sourceBounds.height),
    };
  }
  return next;
}

/**
 * Reflows one compiled native panel to an absolute meter size without applying a
 * transform scale. Edge-anchored primitives preserve their physical insets,
 * full-span primitives fill the new shell, and raster source dimensions track
 * changed bounds so text and icons retain their pixels-per-meter density.
 *
 * @param {Object} panel - Compiled panel from a native panel scene.
 * @param {Array<number>} size - Target `[width, height]` in meters.
 * @returns {Object} New compiled panel.
 */
export function resizeNativePanel(panel, size) {
  if (!panel || !Array.isArray(panel.size) || !Array.isArray(panel.primitives)) {
    throw new Error('resizeNativePanel requires a compiled panel.');
  }
  if (!Array.isArray(size) || size.length !== 2) {
    throw new Error(`resizeNativePanel requires size [width, height], got ${JSON.stringify(size)}.`);
  }
  let targetSize = [
    requirePositiveFinite(size[0], 'width', 'resizeNativePanel'),
    requirePositiveFinite(size[1], 'height', 'resizeNativePanel'),
  ].map(roundMetric);
  let sourceSize = panel.size.map(Number);
  return {
    ...panel,
    size: targetSize,
    primitives: panel.primitives.map((primitive) => reflowPrimitive(
      primitive,
      sourceSize,
      targetSize,
    )),
  };
}

/**
 * Reflows one panel inside a compiled native scene while preserving the scene
 * contract and all other panel identities.
 *
 * @param {Object} scene - `native-panel-layout-v1` compiled scene.
 * @param {string} panelId - Stable panel id.
 * @param {Array<number>} size - Target `[width, height]` in meters.
 * @returns {Object} New compiled scene.
 */
export function resizeNativePanelScene(scene, panelId, size) {
  if (scene?.version !== NATIVE_PANEL_LAYOUT_VERSION || !Array.isArray(scene.panels)) {
    throw new Error(`resizeNativePanelScene requires a ${NATIVE_PANEL_LAYOUT_VERSION} scene.`);
  }
  let found = false;
  let panels = scene.panels.map((panel) => {
    if (panel.id !== panelId) return panel;
    found = true;
    return resizeNativePanel(panel, size);
  });
  if (!found) {
    throw new Error(`Unknown panel "${panelId}" in resizeNativePanelScene.`);
  }
  let hitTargets = panels.reduce((count, panel) => count + panel.primitives
    .filter((primitive) => primitive.visible !== false && primitive.hit).length, 0);
  return {
    ...scene,
    panels,
    counts: {
      ...scene.counts,
      hitTargets,
    },
  };
}

function countNativePanelScene(panels, previous = {}) {
  let byLayer = Object.fromEntries(NATIVE_PANEL_LAYERS.map((layer) => [layer, 0]));
  let byKind = {};
  let primitives = 0;
  let hitTargets = 0;
  for (let panel of panels) {
    for (let primitive of panel.primitives || []) {
      primitives += 1;
      byLayer[primitive.layer] += 1;
      byKind[primitive.kind] = (byKind[primitive.kind] || 0) + 1;
      if (primitive.visible !== false && primitive.hit) hitTargets += 1;
    }
  }
  return {
    ...previous,
    panels: panels.length,
    windows: panels.filter((panel) => panel.role === 'window').length,
    layoutControls: panels.filter((panel) => panel.role === 'layout-control').length,
    primitives,
    hitTargets,
    byLayer,
    byKind,
  };
}

/**
 * Replaces exactly one panel in a compiled scene while preserving sibling
 * object identity and recomputing scene counts.
 *
 * @param {Object} scene
 * @param {string} panelId
 * @param {Object} replacement
 * @returns {Object}
 */
export function replaceNativePanelScenePanel(scene, panelId, replacement) {
  if (scene?.version !== NATIVE_PANEL_LAYOUT_VERSION || !Array.isArray(scene.panels)) {
    throw new Error(`replaceNativePanelScenePanel requires a ${NATIVE_PANEL_LAYOUT_VERSION} scene.`);
  }
  if (!scene.panels.some((panel) => panel.id === panelId)) {
    throw new Error(`Unknown panel "${panelId}" in replaceNativePanelScenePanel.`);
  }
  if (!replacement || replacement.id !== panelId || !Array.isArray(replacement.primitives)) {
    throw new Error(`replaceNativePanelScenePanel requires replacement panel "${panelId}".`);
  }
  let panels = scene.panels.map((panel) => {
    if (panel.id !== panelId) return panel;
    return replacement;
  });
  return {
    ...scene,
    panels,
    counts: countNativePanelScene(panels, scene.counts),
  };
}

/**
 * Resolves the zero-based index of a native panel layer.
 *
 * @param {string} layer - Layer id from `NATIVE_PANEL_LAYERS`.
 * @returns {number} Layer index.
 */
export function resolveNativePanelLayerIndex(layer) {
  let index = NATIVE_PANEL_LAYERS.indexOf(layer);
  if (index < 0) {
    throw new Error(`Unknown native panel layer "${layer}". Supported: ${NATIVE_PANEL_LAYERS.join(', ')}.`);
  }
  return index;
}

/**
 * Creates per-layer Z explode offsets in meters.
 *
 * @param {number} explode - Z separation between adjacent layers in meters.
 * @returns {Object<string, number>} Offsets keyed by layer id.
 */
export function createNativePanelLayerOffsets(explode = 0) {
  let amount = numberOr(explode, 0);
  if (!Number.isFinite(amount) || amount < 0) {
    throw new Error(`createNativePanelLayerOffsets requires a non-negative finite explode value, got ${JSON.stringify(explode)}.`);
  }
  return Object.fromEntries(NATIVE_PANEL_LAYERS.map((layer, index) => [layer, roundMetric(index * amount)]));
}

/**
 * Resolves a normalized panel point (0..1, y down) to the topmost hit target.
 *
 * @param {Object} panel - Compiled panel from `compileNativePanelPrimitives`.
 * @param {Object} point - Normalized `{ x, y }` in 0..1.
 * @returns {Object|null} Hit summary with stable IDs, or null when nothing hittable is under the point.
 */
export function resolveNativePanelHit(panel, point = {}) {
  if (!panel || !Array.isArray(panel.primitives) || !Array.isArray(panel.size)) {
    throw new Error('resolveNativePanelHit requires a compiled panel from compileNativePanelPrimitives.');
  }
  let x = Number(point.x);
  let y = Number(point.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    throw new Error(`resolveNativePanelHit requires a finite normalized point { x, y }, got ${JSON.stringify(point)}.`);
  }
  if (x < 0 || x > 1 || y < 0 || y > 1) return null;
  let localX = (x - 0.5) * panel.size[0];
  let localY = (0.5 - y) * panel.size[1];
  let layers = [...NATIVE_PANEL_LAYERS].reverse();
  for (let layer of layers) {
    let candidates = panel.primitives.filter((primitive) => (
      primitive.layer === layer
      && primitive.visible !== false
      && primitive.hit
    ));
    for (let index = candidates.length - 1; index >= 0; index -= 1) {
      let primitive = candidates[index];
      let bounds = primitive.bounds;
      if (
        Math.abs(localX - bounds.x) <= bounds.width / 2 &&
        Math.abs(localY - bounds.y) <= bounds.height / 2
      ) {
        return {
          panelId: panel.id,
          point: { x: roundMetric(x), y: roundMetric(y) },
          local: { x: roundMetric(localX), y: roundMetric(localY) },
          primitiveId: primitive.id,
          hitId: primitive.hit.id,
          actionId: primitive.hit.actionId,
          targetId: primitive.hit.targetId,
          layer: primitive.layer,
          kind: primitive.kind,
        };
      }
    }
  }
  return null;
}
