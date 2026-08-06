/**
 * @file xr/spatial-parity.js
 * @description Pure, Node-safe deterministic parity report between a measured
 * `spatial-snapshot-v1` snapshot and its compiled `native-panel-layout-v1` scene:
 * geometry round-trip edges, text equality, resolved style equality, action/target
 * coverage, and unsupported/unknown diagnostics counts.
 * @module symbiote-ui/xr/spatial-parity
 */

import { normalizeSpatialSnapshot } from './spatial-snapshot.js';

export const SPATIAL_PARITY_VERSION = 'spatial-parity-v1';

export const SPATIAL_PARITY_DEFAULT_TOLERANCE_PX = 2;

function roundMetric(value) {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function indexCompiled(compiled) {
  let panelsByNodeId = new Map();
  let primitivesByNodeId = new Map();
  let hits = [];
  for (let panel of compiled.panels) {
    let nodeId = panel.metadata?.spatialNodeId;
    if (nodeId) panelsByNodeId.set(nodeId, panel);
    for (let primitive of panel.primitives) {
      if (primitive.spatialNodeId && !primitivesByNodeId.has(primitive.spatialNodeId)) {
        primitivesByNodeId.set(primitive.spatialNodeId, []);
      }
      if (primitive.spatialNodeId) primitivesByNodeId.get(primitive.spatialNodeId).push(primitive);
      if (primitive.hit) {
        hits.push({
          nodeId: primitive.spatialNodeId,
          actionId: primitive.hit.actionId,
          targetId: primitive.hit.targetId,
          intent: primitive.hit.intent,
        });
      }
    }
  }
  return { panelsByNodeId, primitivesByNodeId, hits };
}

function nodeEdgesPx(rect) {
  return {
    left: rect.x,
    right: rect.x + rect.width,
    top: rect.y,
    bottom: rect.y + rect.height,
  };
}

function panelEdgesPx(panel, snapshot, scale) {
  let viewport = snapshot.capture.viewport;
  let widthPx = panel.size[0] / scale;
  let heightPx = panel.size[1] / scale;
  let centerXPx = panel.position[0] / scale + viewport.width / 2;
  let centerYPx = viewport.height / 2 - panel.position[1] / scale;
  return {
    left: centerXPx - widthPx / 2,
    right: centerXPx + widthPx / 2,
    top: centerYPx - heightPx / 2,
    bottom: centerYPx + heightPx / 2,
  };
}

function primitiveEdgesPx(primitive, panel, snapshot, scale) {
  let panelEdges = panelEdgesPx(panel, snapshot, scale);
  let panelCenterXPx = (panelEdges.left + panelEdges.right) / 2;
  let panelCenterYPx = (panelEdges.top + panelEdges.bottom) / 2;
  let widthPx = primitive.bounds.width / scale;
  let heightPx = primitive.bounds.height / scale;
  let centerXPx = panelCenterXPx + primitive.bounds.x / scale;
  let centerYPx = panelCenterYPx - primitive.bounds.y / scale;
  return {
    left: centerXPx - widthPx / 2,
    right: centerXPx + widthPx / 2,
    top: centerYPx - heightPx / 2,
    bottom: centerYPx + heightPx / 2,
  };
}

function maxEdgeError(expected, actual) {
  return roundMetric(Math.max(
    Math.abs(expected.left - actual.left),
    Math.abs(expected.right - actual.right),
    Math.abs(expected.top - actual.top),
    Math.abs(expected.bottom - actual.bottom),
  ));
}

function compareGeometry(snapshot, compiledIndex, panels, scale, tolerancePx) {
  let nodes = [];
  let unmatched = [];
  let maxErrorPx = 0;
  let panelStats = { compared: 0, maxErrorPx: 0 };
  let resizerStats = { compared: 0, maxErrorPx: 0 };
  for (let node of snapshot.nodes) {
    let expected = nodeEdgesPx(node.rect);
    let actual = null;
    let panel = compiledIndex.panelsByNodeId.get(node.id);
    if (panel) {
      actual = panelEdgesPx(panel, snapshot, scale);
    } else {
      let owner = null;
      let primitive = null;
      for (let candidate of panels) {
        let found = (candidate.primitives || []).find(
          (entry) => entry.spatialNodeId === node.id && entry.kind !== 'control',
        ) || (candidate.primitives || []).find((entry) => entry.spatialNodeId === node.id);
        if (found) {
          owner = candidate;
          primitive = found;
          break;
        }
      }
      if (primitive) actual = primitiveEdgesPx(primitive, owner, snapshot, scale);
    }
    if (!actual) {
      unmatched.push(node.id);
      continue;
    }
    let error = maxEdgeError(expected, actual);
    maxErrorPx = Math.max(maxErrorPx, error);
    nodes.push({ nodeId: node.id, part: node.part, maxErrorPx: error });
    if (node.part === 'panel') {
      panelStats.compared += 1;
      panelStats.maxErrorPx = Math.max(panelStats.maxErrorPx, error);
    } else if (node.part === 'resizer') {
      resizerStats.compared += 1;
      resizerStats.maxErrorPx = Math.max(resizerStats.maxErrorPx, error);
    }
  }
  let failures = nodes.filter((entry) => entry.maxErrorPx > tolerancePx);
  return {
    compared: nodes.length,
    unmatched,
    maxErrorPx,
    tolerancePx,
    withinTolerance: failures.length === 0 && unmatched.length === 0,
    panels: panelStats,
    resizers: resizerStats,
    nodes,
    failures,
  };
}

function compareText(snapshot, compiledIndex) {
  let compared = 0;
  let mismatches = [];
  for (let node of snapshot.nodes) {
    if (node.part === 'icon') continue;
    if (node.text === undefined) continue;
    compared += 1;
    let primitives = compiledIndex.primitivesByNodeId.get(node.id) || [];
    let label = primitives.find((primitive) => primitive.kind === 'label')
      || primitives.find((primitive) => primitive.text !== undefined);
    let actual = label?.text;
    if (actual !== node.text) {
      mismatches.push({ nodeId: node.id, expected: node.text, actual: actual ?? null });
    }
  }
  return { compared, matched: compared - mismatches.length, mismatches };
}

function compareIcons(snapshot, compiledIndex) {
  let captured = 0;
  let missing = [];
  let mismatched = [];
  for (let node of snapshot.nodes) {
    if (node.part !== 'icon') continue;
    captured += 1;
    let primitives = compiledIndex.primitivesByNodeId.get(node.id) || [];
    let icon = primitives.find((primitive) => primitive.kind === 'icon');
    if (!icon) {
      missing.push({ nodeId: node.id, name: node.icon.name });
      continue;
    }
    if (icon.icon !== node.icon.name) {
      mismatched.push({ nodeId: node.id, expected: node.icon.name, actual: icon.icon ?? null });
    }
  }
  return { captured, compiled: captured - missing.length, missing, mismatched };
}

const STYLE_COMPARISON_KEYS = Object.freeze([
  ['background-color', 'background'],
  ['color', 'color'],
]);

function isTransparentStyleValue(value) {
  if (!value || value === 'transparent') return true;
  let rgba = /^rgba?\(\s*([^()]+?)\s*\)$/i.exec(String(value).trim());
  if (rgba) {
    let parts = rgba[1].split(',').map((part) => Number.parseFloat(part.trim()));
    return parts.length >= 4 && Number.isFinite(parts[3]) && parts[3] <= 0;
  }
  let hex = /^#[0-9a-f]{6}([0-9a-f]{2})$/i.exec(String(value).trim());
  return Boolean(hex && Number.parseInt(hex[1], 16) === 0);
}

function compareStyles(snapshot, compiledIndex) {
  let compared = 0;
  let mismatches = [];
  for (let node of snapshot.nodes) {
    if (!node.style) continue;
    let primitives = (compiledIndex.primitivesByNodeId.get(node.id) || [])
      .filter((primitive) => primitive.kind !== 'frame');
    if (!primitives.length) continue;
    for (let [cssKey, styleKey] of STYLE_COMPARISON_KEYS) {
      let expected = node.style[cssKey];
      if (expected === undefined || isTransparentStyleValue(expected)) continue;
      if (cssKey === 'color' && node.text === undefined && node.part !== 'icon') continue;
      compared += 1;
      let actual = primitives.find((primitive) => primitive.style?.[styleKey] !== undefined)?.style?.[styleKey];
      if (actual !== expected) {
        mismatches.push({ nodeId: node.id, property: cssKey, expected, actual: actual ?? null });
      }
    }
  }
  return { compared, matched: compared - mismatches.length, mismatches };
}

function compareActions(snapshot, compiledIndex) {
  let total = 0;
  let unmapped = [];
  for (let node of snapshot.nodes) {
    for (let action of node.actions || []) {
      total += 1;
      let mapped = compiledIndex.hits.some(
        (hit) => hit.nodeId === node.id && hit.actionId === action.id && hit.targetId === action.targetId,
      );
      if (!mapped) {
        unmapped.push({ nodeId: node.id, actionId: action.id, targetId: action.targetId });
      }
    }
  }
  return { total, mapped: total - unmapped.length, unmapped };
}

/**
 * Builds the deterministic parity report between a measured snapshot and the
 * compiled native scene produced from it.
 *
 * @param {Object} input - Raw or normalized `spatial-snapshot-v1` snapshot.
 * @param {Object} compiled - Scene from `compileSpatialSnapshot`.
 * @param {Object} [options]
 * @param {number} [options.tolerancePx] - Maximum allowed edge error in CSS px.
 * @returns {Object} `spatial-parity-v1` report.
 */
export function createSpatialParityReport(input, compiled, options = {}) {
  let snapshot = normalizeSpatialSnapshot(input);
  if (!compiled || !Array.isArray(compiled.panels) || !compiled.spatialSnapshot) {
    throw new Error(
      'createSpatialParityReport requires a compiled scene with spatialSnapshot provenance ' +
      'from compileSpatialSnapshot().',
    );
  }
  let scale = Number(compiled.spatialSnapshot.scale);
  if (!Number.isFinite(scale) || scale <= 0) {
    throw new Error('createSpatialParityReport requires a positive finite spatialSnapshot.scale.');
  }
  let tolerancePx = Number(options.tolerancePx ?? SPATIAL_PARITY_DEFAULT_TOLERANCE_PX);
  if (!Number.isFinite(tolerancePx) || tolerancePx < 0) {
    throw new Error(
      `createSpatialParityReport requires a non-negative finite tolerancePx, got ${JSON.stringify(options.tolerancePx)}.`,
    );
  }
  let compiledIndex = indexCompiled(compiled);
  let geometry = compareGeometry(snapshot, compiledIndex, compiled.panels, scale, tolerancePx);
  let text = compareText(snapshot, compiledIndex);
  let icons = compareIcons(snapshot, compiledIndex);
  let style = compareStyles(snapshot, compiledIndex);
  let actions = compareActions(snapshot, compiledIndex);
  let unsupported = snapshot.diagnostics.unsupported.map((entry) => entry.feature);
  let unknownVisible = snapshot.diagnostics.unknownVisible.map((entry) => entry.signature);
  let ok = geometry.withinTolerance
    && text.mismatches.length === 0
    && icons.missing.length === 0
    && icons.mismatched.length === 0
    && style.mismatches.length === 0
    && actions.unmapped.length === 0;
  return {
    version: SPATIAL_PARITY_VERSION,
    ok,
    geometry,
    text,
    icons,
    style,
    actions,
    diagnostics: {
      unsupported: { count: unsupported.length, features: unsupported },
      unknownVisible: { count: unknownVisible.length, signatures: unknownVisible },
    },
  };
}
