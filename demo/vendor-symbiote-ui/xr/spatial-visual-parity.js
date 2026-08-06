/**
 * @file xr/spatial-visual-parity.js
 * @description Pure, Node-safe deterministic visual parity report between a measured
 * `spatial-snapshot-v1` snapshot and a renderer-neutral `native-panel-appearance-v1`
 * sample: expected-transparent controls, surface/style equality, text/icon color
 * equality, renderer coverage, and unknown visible capture boxes. Unsupported
 * interactions stay informational and never fail visual parity.
 * @module symbiote-ui/xr/spatial-visual-parity
 */

import { normalizeSpatialSnapshot } from './spatial-snapshot.js';
import { hasVisibleControlChrome } from './spatial-snapshot-compile.js';
import { NATIVE_PANEL_APPEARANCE_VERSION } from './three-native-panel-renderer.js';

export const SPATIAL_VISUAL_PARITY_VERSION = 'spatial-visual-parity-v1';

export const SPATIAL_VISUAL_PARITY_ISSUES = Object.freeze({
  EXPECTED_TRANSPARENT_OPAQUE: 'expected-transparent-opaque',
  SURFACE_STYLE_MISMATCH: 'surface-style-mismatch',
  TEXT_COLOR_MISMATCH: 'text-color-mismatch',
  ICON_COLOR_MISMATCH: 'icon-color-mismatch',
  MISSING_RENDERER_COVERAGE: 'missing-renderer-coverage',
  UNKNOWN_VISIBLE_BOX: 'unknown-visible-box',
});

const ALPHA_TOLERANCE = 0.02;
const TRANSPARENT_VALUES = Object.freeze(['transparent', 'rgba(0, 0, 0, 0)']);
const SURFACE_ENTRY_KINDS = Object.freeze(['surface', 'control']);
const TEXT_ENTRY_KINDS = Object.freeze(['label']);
const ICON_ENTRY_KINDS = Object.freeze(['icon']);

function isTransparentValue(value) {
  if (!value || TRANSPARENT_VALUES.includes(value)) return true;
  let parsed = parseColor(value);
  return Boolean(parsed && parsed.a <= ALPHA_TOLERANCE);
}

function parseColor(value) {
  if (typeof value !== 'string') return null;
  let trimmed = value.trim();
  let match = /^rgba?\(\s*([^()]+?)\s*\)$/i.exec(trimmed);
  if (match) {
    let parts = match[1].split(',').map((part) => Number.parseFloat(part.trim()));
    if (parts.length < 3 || parts.slice(0, 3).some((channel) => !Number.isFinite(channel))) return null;
    let alpha = parts.length >= 4 && Number.isFinite(parts[3]) ? parts[3] : 1;
    return { r: parts[0], g: parts[1], b: parts[2], a: alpha };
  }
  let hex = /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(trimmed);
  if (hex) {
    let raw = hex[1];
    if (raw.length === 3) raw = raw.split('').map((char) => char + char).join('');
    let channels = [];
    for (let index = 0; index < raw.length; index += 2) {
      channels.push(Number.parseInt(raw.slice(index, index + 2), 16));
    }
    return {
      r: channels[0],
      g: channels[1],
      b: channels[2],
      a: channels.length === 4 ? channels[3] / 255 : 1,
    };
  }
  return null;
}

function colorMatches(expectedValue, actualColor, actualOpacity) {
  let expected = parseColor(expectedValue);
  let actual = parseColor(actualColor);
  if (!expected || !actual) return false;
  if (expected.r !== actual.r || expected.g !== actual.g || expected.b !== actual.b) return false;
  let effectiveAlpha = actual.a * (actualOpacity ?? 1);
  return Math.abs(expected.a - effectiveAlpha) <= ALPHA_TOLERANCE;
}

function indexAppearance(appearance) {
  let bySpatialNodeId = new Map();
  for (let entry of appearance.primitives || []) {
    if (!entry || typeof entry.spatialNodeId !== 'string') continue;
    if (!bySpatialNodeId.has(entry.spatialNodeId)) bySpatialNodeId.set(entry.spatialNodeId, []);
    bySpatialNodeId.get(entry.spatialNodeId).push(entry);
  }
  return bySpatialNodeId;
}

function findEntry(entries, kinds, predicate = () => true) {
  return entries.find((entry) => kinds.includes(entry.kind) && predicate(entry));
}

function compareTransparentControl(node, entries, issues, compared) {
  if (node.part !== 'control' || hasVisibleControlChrome(node)) return;
  compared.controls += 1;
  for (let entry of entries.filter((candidate) => candidate.kind === 'control')) {
    if (entry.visible) {
      issues.push({
        id: SPATIAL_VISUAL_PARITY_ISSUES.EXPECTED_TRANSPARENT_OPAQUE,
        nodeId: node.id,
        primitiveId: entry.id,
        expected: 'transparent',
        actual: { color: entry.color ?? null, opacity: entry.opacity ?? null },
      });
    }
  }
}

function compareSurfaceStyle(node, entries, issues, compared) {
  let expected = node.style?.['background-color'];
  if (isTransparentValue(expected)) return;
  compared.surfaces += 1;
  let entry = findEntry(entries, SURFACE_ENTRY_KINDS, (candidate) => candidate.control !== 'hit');
  if (!entry || !entry.visible || !colorMatches(expected, entry.color, entry.opacity)) {
    issues.push({
      id: SPATIAL_VISUAL_PARITY_ISSUES.SURFACE_STYLE_MISMATCH,
      nodeId: node.id,
      ...(entry ? { primitiveId: entry.id } : {}),
      expected,
      actual: entry ? { color: entry.color ?? null, opacity: entry.opacity ?? null } : null,
    });
  }
}

function compareBorderStyle(node, entries, issues, scale) {
  let style = node.style || {};
  let width = Number.parseFloat(style['border-width']);
  if (style['border-style'] !== 'solid'
    || !(width > 0)
    || isTransparentValue(style['border-color'])) return;
  let entry = findEntry(entries, SURFACE_ENTRY_KINDS, (candidate) => candidate.border);
  let actualWidth = entry?.border && Number.isFinite(scale) && scale > 0
    ? entry.border.width / scale
    : entry?.border?.width;
  if (!entry?.border
    || !colorMatches(style['border-color'], entry.border.color, entry.border.opacity)
    || actualWidth !== width) {
    issues.push({
      id: SPATIAL_VISUAL_PARITY_ISSUES.SURFACE_STYLE_MISMATCH,
      nodeId: node.id,
      ...(entry ? { primitiveId: entry.id } : {}),
      expected: { color: style['border-color'], width },
      actual: entry?.border
        ? { color: entry.border.color ?? null, width: actualWidth ?? null }
        : null,
    });
  }
}

function compareTextColor(node, entries, issues, compared) {
  if (node.text === undefined || isTransparentValue(node.style?.color)) return;
  compared.text += 1;
  let entry = findEntry(entries, TEXT_ENTRY_KINDS);
  if (!entry || !colorMatches(node.style.color, entry.color, entry.opacity)) {
    issues.push({
      id: SPATIAL_VISUAL_PARITY_ISSUES.TEXT_COLOR_MISMATCH,
      nodeId: node.id,
      ...(entry ? { primitiveId: entry.id } : {}),
      expected: node.style.color,
      actual: entry ? { color: entry.color ?? null } : null,
    });
  }
}

function compareIconColor(node, entries, issues, compared) {
  if (node.part !== 'icon' || isTransparentValue(node.style?.color)) return;
  compared.icons += 1;
  let entry = findEntry(entries, ICON_ENTRY_KINDS);
  if (!entry || !colorMatches(node.style.color, entry.color, entry.opacity)) {
    issues.push({
      id: SPATIAL_VISUAL_PARITY_ISSUES.ICON_COLOR_MISMATCH,
      nodeId: node.id,
      ...(entry ? { primitiveId: entry.id } : {}),
      expected: node.style.color,
      actual: entry ? { color: entry.color ?? null } : null,
    });
  }
}

function sortIssues(issues) {
  return [...issues].sort((a, b) => {
    let av = `${a.id}|${a.nodeId ?? ''}|${a.primitiveId ?? ''}|${a.signature ?? ''}`;
    let bv = `${b.id}|${b.nodeId ?? ''}|${b.primitiveId ?? ''}|${b.signature ?? ''}`;
    return av < bv ? -1 : av > bv ? 1 : 0;
  });
}

/**
 * Builds the deterministic visual parity report between a measured snapshot and a
 * renderer-neutral appearance sample produced by the mounted native panel renderer.
 *
 * @param {Object} input - Raw or normalized `spatial-snapshot-v1` snapshot.
 * @param {Object} appearance - `native-panel-appearance-v1` report (neutral-state sample).
 * @returns {Object} `spatial-visual-parity-v1` report.
 */
export function createSpatialVisualParityReport(input, appearance) {
  let snapshot = normalizeSpatialSnapshot(input);
  if (appearance?.version !== NATIVE_PANEL_APPEARANCE_VERSION || !Array.isArray(appearance.primitives)) {
    throw new Error(
      `createSpatialVisualParityReport requires a ${NATIVE_PANEL_APPEARANCE_VERSION} report ` +
      'from the renderer getAppearanceReport().',
    );
  }
  let appearanceIndex = indexAppearance(appearance);
  let issues = [];
  let missing = [];
  let compared = { controls: 0, surfaces: 0, text: 0, icons: 0 };
  for (let node of snapshot.nodes) {
    let entries = appearanceIndex.get(node.id) || [];
    if (!entries.length) {
      missing.push(node.id);
      issues.push({
        id: SPATIAL_VISUAL_PARITY_ISSUES.MISSING_RENDERER_COVERAGE,
        nodeId: node.id,
        part: node.part,
      });
      continue;
    }
    compareTransparentControl(node, entries, issues, compared);
    compareSurfaceStyle(node, entries, issues, compared);
    compareBorderStyle(node, entries, issues, appearance.scale);
    compareTextColor(node, entries, issues, compared);
    compareIconColor(node, entries, issues, compared);
  }
  for (let box of snapshot.diagnostics.unknownVisible) {
    issues.push({
      id: SPATIAL_VISUAL_PARITY_ISSUES.UNKNOWN_VISIBLE_BOX,
      signature: box.signature,
      ...(box.detail ? { detail: box.detail } : {}),
    });
  }
  let unsupported = snapshot.diagnostics.unsupported.map((entry) => entry.feature);
  let sortedIssues = sortIssues(issues);
  return {
    version: SPATIAL_VISUAL_PARITY_VERSION,
    ok: sortedIssues.length === 0,
    issues: sortedIssues,
    coverage: {
      nodes: snapshot.nodes.length,
      covered: snapshot.nodes.length - missing.length,
      missing,
    },
    compared,
    unknownVisible: {
      count: snapshot.diagnostics.unknownVisible.length,
      signatures: snapshot.diagnostics.unknownVisible.map((entry) => entry.signature),
    },
    informational: {
      unsupported: { count: unsupported.length, features: unsupported },
    },
  };
}
