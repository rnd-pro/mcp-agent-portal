/**
 * @file xr/spatial-snapshot.js
 * @description Pure, Node-safe `spatial-snapshot-v1` contract: normalization and
 * validation for browser-measured, root-relative CSS-pixel spatial UI snapshots.
 * No DOM, no Three.js; capture lives in xr/dom-spatial-capture.js.
 * @module symbiote-ui/xr/spatial-snapshot
 */

export const SPATIAL_SNAPSHOT_VERSION = 'spatial-snapshot-v1';

export const SPATIAL_SNAPSHOT_UNIT = 'css-pixel';

export const SPATIAL_SNAPSHOT_COORDINATE_SPACE = 'capture-root-relative';

export const SPATIAL_ICON_NAME_PATTERN = /^[a-z0-9_]+$/;

const ROUNDING_PRECISION = 1_000_000;

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function roundMetric(value) {
  return Math.round(value * ROUNDING_PRECISION) / ROUNDING_PRECISION;
}

function normalizeRect(rect, owner, errors) {
  if (!isPlainObject(rect)) {
    errors.push(`${owner} requires a rect object { x, y, width, height }.`);
    return null;
  }
  let x = Number(rect.x);
  let y = Number(rect.y);
  let width = Number(rect.width);
  let height = Number(rect.height);
  if (![x, y, width, height].every(Number.isFinite)) {
    errors.push(`${owner} requires finite rect numbers, got ${JSON.stringify(rect)}.`);
    return null;
  }
  if (!(width > 0) || !(height > 0)) {
    errors.push(`${owner} requires a positive rect width/height, got ${JSON.stringify(rect)}.`);
    return null;
  }
  return {
    x: roundMetric(x),
    y: roundMetric(y),
    width: roundMetric(width),
    height: roundMetric(height),
  };
}

function normalizeStyle(style, owner, errors) {
  if (style === undefined) return undefined;
  if (!isPlainObject(style)) {
    errors.push(`${owner} requires style to be an object of resolved CSS values.`);
    return undefined;
  }
  let normalized = {};
  for (let key of Object.keys(style).sort()) {
    let value = style[key];
    if (typeof value !== 'string' || !value) {
      errors.push(`${owner} requires style "${key}" to be a non-empty resolved string.`);
      continue;
    }
    normalized[key] = value;
  }
  return normalized;
}

function normalizeState(state, owner, errors) {
  if (state === undefined) return undefined;
  if (!isPlainObject(state)) {
    errors.push(`${owner} requires state to be a plain object.`);
    return undefined;
  }
  let normalized = {};
  for (let key of Object.keys(state).sort()) {
    let value = state[key];
    if (typeof value !== 'boolean' && typeof value !== 'string' && typeof value !== 'number') {
      errors.push(`${owner} requires state "${key}" to be a boolean, string, or number.`);
      continue;
    }
    normalized[key] = value;
  }
  return normalized;
}

function normalizeActions(actions, owner, errors) {
  if (actions === undefined) return undefined;
  if (!Array.isArray(actions)) {
    errors.push(`${owner} requires actions to be an array.`);
    return undefined;
  }
  let normalized = [];
  let seen = new Set();
  for (let action of actions) {
    if (!isPlainObject(action) || typeof action.id !== 'string' || !action.id) {
      errors.push(`${owner} requires every action to carry a non-empty string id.`);
      continue;
    }
    if (typeof action.targetId !== 'string' || !action.targetId) {
      errors.push(`${owner} action "${action.id}" requires a non-empty string targetId.`);
      continue;
    }
    if (typeof action.intent !== 'string' || !action.intent) {
      errors.push(`${owner} action "${action.id}" requires a non-empty string intent.`);
      continue;
    }
    if (seen.has(action.id)) {
      errors.push(`${owner} declares duplicate action id "${action.id}".`);
      continue;
    }
    seen.add(action.id);
    normalized.push({ id: action.id, targetId: action.targetId, intent: action.intent });
  }
  normalized.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return normalized.length ? normalized : undefined;
}

function normalizeIcon(icon, owner, errors) {
  if (!isPlainObject(icon) || typeof icon.name !== 'string' || !SPATIAL_ICON_NAME_PATTERN.test(icon.name)) {
    errors.push(
      `${owner} requires icon.name to be a Material Symbols ligature name (${SPATIAL_ICON_NAME_PATTERN}).`,
    );
    return undefined;
  }
  return { name: icon.name };
}

function normalizeNode(node, index, errors) {
  let owner = `Spatial snapshot node at index ${index} (id "${node?.id ?? '?'}")`;
  if (!isPlainObject(node)) {
    errors.push(`${owner} must be a plain object.`);
    return null;
  }
  if (typeof node.id !== 'string' || !node.id) {
    errors.push(`${owner} requires a non-empty string id.`);
    return null;
  }
  if (node.parentId !== undefined && node.parentId !== null && typeof node.parentId !== 'string') {
    errors.push(`${owner} requires parentId to be a string or null.`);
    return null;
  }
  if (typeof node.component !== 'string' || !node.component) {
    errors.push(`${owner} requires a non-empty string component (adapter id).`);
    return null;
  }
  if (typeof node.part !== 'string' || !node.part) {
    errors.push(`${owner} requires a non-empty string part.`);
    return null;
  }
  let rect = normalizeRect(node.rect, owner, errors);
  if (!rect) return null;
  if (node.text !== undefined && typeof node.text !== 'string') {
    errors.push(`${owner} requires text to be a string when present.`);
    return null;
  }
  let hasIcon = node.icon !== undefined;
  if (node.part === 'icon' && !hasIcon) {
    errors.push(`${owner} requires an icon { name } descriptor.`);
    return null;
  }
  if (hasIcon && node.part !== 'icon') {
    errors.push(`${owner} carries an icon descriptor; icon descriptor requires part "icon".`);
    return null;
  }
  if (hasIcon && node.text !== undefined) {
    errors.push(`${owner} must not carry both icon and text.`);
    return null;
  }
  let normalized = {
    id: node.id,
    parentId: node.parentId ?? null,
    component: node.component,
    part: node.part,
    rect,
  };
  let style = normalizeStyle(node.style, owner, errors);
  if (style !== undefined) normalized.style = style;
  if (node.text !== undefined) normalized.text = node.text;
  if (hasIcon) {
    let icon = normalizeIcon(node.icon, owner, errors);
    if (icon !== undefined) normalized.icon = icon;
  }
  let state = normalizeState(node.state, owner, errors);
  if (state !== undefined) normalized.state = state;
  let actions = normalizeActions(node.actions, owner, errors);
  if (actions !== undefined) normalized.actions = actions;
  return normalized;
}

function normalizeDiagnosticEntry(entry, index, kind, errors) {
  let owner = `Spatial snapshot ${kind} diagnostic at index ${index}`;
  if (!isPlainObject(entry)) {
    errors.push(`${owner} must be a plain object.`);
    return null;
  }
  let key = kind === 'unsupported' ? 'feature' : 'signature';
  if (typeof entry[key] !== 'string' || !entry[key]) {
    errors.push(`${owner} requires a non-empty string ${key}.`);
    return null;
  }
  let normalized = { [key]: entry[key] };
  if (entry.nodeId !== undefined) {
    if (typeof entry.nodeId !== 'string') {
      errors.push(`${owner} requires nodeId to be a string when present.`);
      return null;
    }
    normalized.nodeId = entry.nodeId;
  }
  if (entry.detail !== undefined) {
    if (typeof entry.detail !== 'string') {
      errors.push(`${owner} requires detail to be a string when present.`);
      return null;
    }
    normalized.detail = entry.detail;
  }
  return normalized;
}

function diagnosticSortValue(entry) {
  return `${entry.feature ?? entry.signature}|${entry.nodeId ?? ''}|${entry.detail ?? ''}`;
}

function normalizeDiagnostics(diagnostics, errors) {
  let source = diagnostics === undefined ? {} : diagnostics;
  if (!isPlainObject(source)) {
    errors.push('Spatial snapshot diagnostics must be a plain object when present.');
    return { unsupported: [], unknownVisible: [] };
  }
  let unsupported = [];
  let unknownVisible = [];
  for (let [kind, list] of [['unsupported', unsupported], ['unknownVisible', unknownVisible]]) {
    let entries = source[kind] === undefined ? [] : source[kind];
    if (!Array.isArray(entries)) {
      errors.push(`Spatial snapshot diagnostics.${kind} must be an array.`);
      continue;
    }
    entries.forEach((entry, index) => {
      let normalized = normalizeDiagnosticEntry(entry, index, kind, errors);
      if (normalized) list.push(normalized);
    });
    list.sort((a, b) => {
      let av = diagnosticSortValue(a);
      let bv = diagnosticSortValue(b);
      return av < bv ? -1 : av > bv ? 1 : 0;
    });
  }
  return { unsupported, unknownVisible };
}

function normalizeCapture(capture, errors) {
  if (!isPlainObject(capture) || !isPlainObject(capture.viewport)) {
    errors.push('Spatial snapshot requires capture.viewport { width, height }.');
    return null;
  }
  let width = Number(capture.viewport.width);
  let height = Number(capture.viewport.height);
  if (!Number.isFinite(width) || !(width > 0) || !Number.isFinite(height) || !(height > 0)) {
    errors.push(`Spatial snapshot requires a positive finite capture viewport, got ${JSON.stringify(capture.viewport)}.`);
    return null;
  }
  let normalized = {
    viewport: { width: roundMetric(width), height: roundMetric(height) },
  };
  if (capture.route !== undefined) {
    if (typeof capture.route !== 'string') {
      errors.push('Spatial snapshot capture.route must be a string when present.');
      return null;
    }
    normalized.route = capture.route;
  }
  if (capture.themeScope !== undefined) {
    if (typeof capture.themeScope !== 'string') {
      errors.push('Spatial snapshot capture.themeScope must be a string when present.');
      return null;
    }
    normalized.themeScope = capture.themeScope;
  }
  return normalized;
}

/**
 * Validates a candidate `spatial-snapshot-v1` object without throwing.
 *
 * @param {Object} snapshot - Candidate snapshot.
 * @returns {{valid: boolean, errors: Array<string>}} Validation report.
 */
export function validateSpatialSnapshot(snapshot) {
  let errors = [];
  if (!isPlainObject(snapshot)) {
    return { valid: false, errors: ['Spatial snapshot must be a plain object.'] };
  }
  if (snapshot.version !== SPATIAL_SNAPSHOT_VERSION) {
    errors.push(
      `Spatial snapshot requires version "${SPATIAL_SNAPSHOT_VERSION}", got ${JSON.stringify(snapshot.version)}.`,
    );
  }
  if (snapshot.unit !== SPATIAL_SNAPSHOT_UNIT) {
    errors.push(`Spatial snapshot requires unit "${SPATIAL_SNAPSHOT_UNIT}", got ${JSON.stringify(snapshot.unit)}.`);
  }
  if (snapshot.coordinateSpace !== SPATIAL_SNAPSHOT_COORDINATE_SPACE) {
    errors.push(
      `Spatial snapshot requires coordinateSpace "${SPATIAL_SNAPSHOT_COORDINATE_SPACE}", ` +
      `got ${JSON.stringify(snapshot.coordinateSpace)}.`,
    );
  }
  normalizeCapture(snapshot.capture, errors);
  if (!Array.isArray(snapshot.nodes) || !snapshot.nodes.length) {
    errors.push('Spatial snapshot requires a non-empty nodes array.');
  } else {
    let seen = new Set();
    snapshot.nodes.forEach((node, index) => {
      let normalized = normalizeNode(node, index, errors);
      if (!normalized) return;
      if (seen.has(normalized.id)) {
        errors.push(`Duplicate spatial snapshot node id "${normalized.id}".`);
        return;
      }
      seen.add(normalized.id);
    });
    snapshot.nodes.forEach((node, index) => {
      let parentId = node?.parentId;
      if (parentId !== undefined && parentId !== null && !seen.has(node.parentId)) {
        errors.push(`Spatial snapshot node "${node?.id ?? index}" references unknown parent "${parentId}".`);
      }
    });
  }
  normalizeDiagnostics(snapshot.diagnostics, errors);
  return { valid: errors.length === 0, errors };
}

/**
 * Normalizes a candidate snapshot into the canonical, deterministically ordered
 * `spatial-snapshot-v1` shape. Throws the collected validation errors on failure.
 *
 * @param {Object} snapshot - Candidate snapshot (capture output or parsed JSON).
 * @returns {Object} Canonical serializable snapshot.
 */
export function normalizeSpatialSnapshot(snapshot) {
  let report = validateSpatialSnapshot(snapshot);
  if (!report.valid) {
    throw new Error(`Invalid spatial snapshot:\n- ${report.errors.join('\n- ')}`);
  }
  let nodes = snapshot.nodes.map((node, index) => normalizeNode(node, index, []));
  return {
    version: SPATIAL_SNAPSHOT_VERSION,
    unit: SPATIAL_SNAPSHOT_UNIT,
    coordinateSpace: SPATIAL_SNAPSHOT_COORDINATE_SPACE,
    capture: normalizeCapture(snapshot.capture, []),
    nodes,
    diagnostics: normalizeDiagnostics(snapshot.diagnostics, []),
  };
}
