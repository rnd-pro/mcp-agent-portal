/**
 * @file demo/native-panels-webgl-lab-layout.js
 * @description Pure presentation math for visually separating independently
 * rendered native windows without changing their measured spatial snapshot.
 */

const POSITION_EPSILON = 0.000001;

function roundMetric(value) {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function requirePosition(panel, owner) {
  let position = panel?.position;
  if (!Array.isArray(position) || position.length < 3 || position.some((value) => !Number.isFinite(Number(value)))) {
    throw new Error(`${owner} requires a finite [x, y, z] panel position.`);
  }
  return position.map(Number);
}

function resolveAxisOffset(value, anchors, axis, gap) {
  let before = 0;
  let after = 0;
  for (let panel of anchors) {
    let candidate = requirePosition(panel, 'resolveNativePanelPresentationOffset')[axis];
    if (candidate < value - POSITION_EPSILON) before += 1;
    if (candidate > value + POSITION_EPSILON) after += 1;
  }
  return roundMetric((before - after) * gap / 2);
}

/**
 * Computes an additive scene-space offset that opens a uniform gap between
 * measured window groups. Layout controls receive half offsets at boundaries,
 * while panel sizes, primitive bounds, and parity provenance stay unchanged.
 *
 * @param {Object} panel - Window or layout-control group to position.
 * @param {Array<Object>} windows - Independently rendered window groups.
 * @param {number} gap - Desired gap between neighboring windows, in meters.
 * @returns {[number, number, number]} Additive scene-space offset.
 */
export function resolveNativePanelPresentationOffset(panel, windows, gap) {
  let amount = Number(gap);
  if (!Number.isFinite(amount) || amount < 0) {
    throw new Error('resolveNativePanelPresentationOffset requires a non-negative finite gap.');
  }
  let position = requirePosition(panel, 'resolveNativePanelPresentationOffset');
  let anchors = Array.isArray(windows) ? windows : [];
  if (!anchors.length || amount === 0) return [0, 0, 0];
  return [
    resolveAxisOffset(position[0], anchors, 0, amount),
    resolveAxisOffset(position[1], anchors, 1, amount),
    0,
  ];
}

/**
 * Resolves the final scene position from immutable measured geometry, the shared
 * presentation gap, and a user-owned per-window drag offset.
 *
 * @param {Object} panel - Measured compiled window or layout control.
 * @param {Array<Object>} windows - Independently rendered window groups.
 * @param {number} gap - Desired gap between neighboring windows, in meters.
 * @param {Array<number>} [dragOffset] - Persistent additive user offset.
 * @returns {[number, number, number]} Scene-space presentation position.
 */
export function resolveNativePanelPresentationPosition(panel, windows, gap, dragOffset = [0, 0, 0]) {
  let measured = requirePosition(panel, 'resolveNativePanelPresentationPosition');
  let separated = resolveNativePanelPresentationOffset(panel, windows, gap);
  let dragged = requirePosition({ position: dragOffset }, 'resolveNativePanelPresentationPosition');
  return measured.map((value, index) => roundMetric(value + separated[index] + dragged[index]));
}
