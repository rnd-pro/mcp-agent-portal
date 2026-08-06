import { routePcbTrace } from '../../canvas/PcbRouter.js';

const SIDE_ANGLE = {
  right: 0,
  bottom: 90,
  left: 180,
  top: 270,
  center: 0,
};

function routeRect(rect, id) {
  return {
    id,
    x: rect.left,
    y: rect.top,
    w: rect.width,
    h: rect.height,
  };
}

function bezierPath(start, end) {
  const dx = Math.max(48, Math.abs(end.x - start.x) * 0.45);
  const c1 = { x: start.x + dx, y: start.y };
  const c2 = { x: end.x - dx, y: end.y };
  return `M ${start.x} ${start.y} C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${end.x} ${end.y}`;
}

/**
 * @param {object} options
 * @param {{x: number, y: number}} options.start
 * @param {{x: number, y: number}} options.end
 * @param {DOMRect | {left: number, top: number, width: number, height: number}} options.sourceRect
 * @param {DOMRect | {left: number, top: number, width: number, height: number}} options.targetRect
 * @param {string} [options.sourceSide]
 * @param {string} [options.targetSide]
 * @param {string} [options.style]
 * @param {number} [options.grid]
 * @param {number} [options.stub]
 * @param {number} [options.clearance]
 * @param {number} [options.chamfer]
 * @param {Array<{id: string, x: number, y: number, w: number, h: number}>} [options.obstacles]
 * @returns {string}
 */
export function routePortalBridgePath({
  start,
  end,
  sourceRect,
  targetRect,
  sourceSide = 'right',
  targetSide = 'left',
  style = 'bezier',
  grid = 20,
  stub = 36,
  clearance = 28,
  chamfer = 8,
  obstacles = [],
}) {
  if (style !== 'pcb') return bezierPath(start, end);

  const fromRect = routeRect(sourceRect, 'portal-source');
  const toRect = routeRect(targetRect, 'portal-target');
  const conn = {
    id: 'portal-bridge',
    from: fromRect.id,
    out: 'portal',
    to: toRect.id,
    in: 'portal',
  };
  const routed = routePcbTrace({
    start,
    end,
    fromRect,
    toRect,
    fromAngle: SIDE_ANGLE[sourceSide] ?? SIDE_ANGLE.right,
    toAngle: SIDE_ANGLE[targetSide] ?? SIDE_ANGLE.left,
    rects: [fromRect, toRect, ...obstacles],
    connections: [conn],
    conn,
    grid,
    stub,
    clearance,
    chamfer,
  });

  return routed.path;
}
