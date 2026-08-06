/**
 * SelectionGeometry — pure geometric helpers for visual graph authoring surfaces
 *
 * Handles point-in-rect check, rectangle intersections, marquee node/edge checks,
 * and alignment/distribution math.
 *
 * @module symbiote-ui/interactions/SelectionGeometry
 */

/**
 * Checks if a point is inside a rectangle
 * @param {number} px
 * @param {number} py
 * @param {number} rx
 * @param {number} ry
 * @param {number} rw
 * @param {number} rh
 * @returns {boolean}
 */
export function isPointInRect(px, py, rx, ry, rw, rh) {
  return px >= rx && px <= rx + rw && py >= ry && py <= ry + rh;
}

/**
 * Checks if two rectangles intersect
 * @param {{x: number, y: number, width: number, height: number}} r1
 * @param {{x: number, y: number, width: number, height: number}} r2
 * @returns {boolean}
 */
export function isRectIntersecting(r1, r2) {
  return (
    r1.x < r2.x + r2.width &&
    r1.x + r1.width > r2.x &&
    r1.y < r2.y + r2.height &&
    r1.y + r1.height > r2.y
  );
}

/**
 * Checks if parent rectangle fully contains child rectangle
 * @param {{x: number, y: number, width: number, height: number}} parent
 * @param {{x: number, y: number, width: number, height: number}} child
 * @returns {boolean}
 */
export function isRectContaining(parent, child) {
  return (
    child.x >= parent.x &&
    child.x + child.width <= parent.x + parent.width &&
    child.y >= parent.y &&
    child.y + child.height <= parent.y + parent.height
  );
}

/**
 * Computes bounding box of selected nodes
 * @param {Map<string, {x: number, y: number}>|Record<string, {x: number, y: number}>} nodePositions
 * @param {Map<string, {width: number, height: number}>|Record<string, {width: number, height: number}>} nodeSizes
 * @param {string[]|Set<string>} selectedNodeIds
 * @returns {{x: number, y: number, width: number, height: number}|null}
 */
export function computeSelectionBounds(nodePositions, nodeSizes, selectedNodeIds) {
  let ids = Array.from(selectedNodeIds);
  if (ids.length === 0) return null;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  let getVal = (obj, key) => {
    if (!obj) return null;
    return typeof obj.get === 'function' ? obj.get(key) : obj[key];
  };

  for (const id of ids) {
    let pos = getVal(nodePositions, id) || { x: 0, y: 0 };
    let size = getVal(nodeSizes, id) || { width: 180, height: 60 };
    minX = Math.min(minX, pos.x);
    minY = Math.min(minY, pos.y);
    maxX = Math.max(maxX, pos.x + size.width);
    maxY = Math.max(maxY, pos.y + size.height);
  }

  if (minX === Infinity) return null;

  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
  };
}

/**
 * Checks if a node rect is inside marquee rect
 * @param {{x: number, y: number, width: number, height: number}} nodeRect
 * @param {{x: number, y: number, width: number, height: number}} marqueeRect
 * @param {object} [options]
 * @param {'intersect'|'contain'} [options.containment='intersect']
 * @returns {boolean}
 */
export function isNodeInMarquee(nodeRect, marqueeRect, options = {}) {
  let containment = options.containment || 'intersect';
  if (containment === 'contain') {
    return isRectContaining(marqueeRect, nodeRect);
  }
  return isRectIntersecting(nodeRect, marqueeRect);
}

function lineSegmentsIntersect(p0x, p0y, p1x, p1y, p2x, p2y, p3x, p3y) {
  let s1x = p1x - p0x;
  let s1y = p1y - p0y;
  let s2x = p3x - p2x;
  let s2y = p3y - p2y;

  let denom = -s2x * s1y + s1x * s2y;
  if (denom === 0) return false;

  let s = (-s1y * (p0x - p2x) + s1x * (p0y - p2y)) / denom;
  let t = (s2x * (p0y - p2y) - s2y * (p0x - p2x)) / denom;

  return s >= 0 && s <= 1 && t >= 0 && t <= 1;
}

/**
 * Checks if a line segment intersects a rectangle
 * @param {{x: number, y: number}} p1
 * @param {{x: number, y: number}} p2
 * @param {{x: number, y: number, width: number, height: number}} rect
 * @returns {boolean}
 */
export function isEdgeIntersectingRect(p1, p2, rect) {
  // If either endpoint is inside the rect, they intersect
  if (isPointInRect(p1.x, p1.y, rect.x, rect.y, rect.width, rect.height)) return true;
  if (isPointInRect(p2.x, p2.y, rect.x, rect.y, rect.width, rect.height)) return true;

  // Otherwise check intersections with the 4 sides of the rectangle
  let rx = rect.x;
  let ry = rect.y;
  let rw = rect.width;
  let rh = rect.height;

  return (
    lineSegmentsIntersect(p1.x, p1.y, p2.x, p2.y, rx, ry, rx + rw, ry) || // Top
    lineSegmentsIntersect(p1.x, p1.y, p2.x, p2.y, rx + rw, ry, rx + rw, ry + rh) || // Right
    lineSegmentsIntersect(p1.x, p1.y, p2.x, p2.y, rx, ry + rh, rx + rw, ry + rh) || // Bottom
    lineSegmentsIntersect(p1.x, p1.y, p2.x, p2.y, rx, ry, rx, ry + rh) // Left
  );
}

/**
 * Checks if both endpoints of an edge are selected
 * @param {object} edge
 * @param {string[]|Set<string>} selectedNodeIds
 * @returns {boolean}
 */
export function areEdgeEndpointsInSelection(edge, selectedNodeIds) {
  let set = selectedNodeIds instanceof Set ? selectedNodeIds : new Set(selectedNodeIds);
  return set.has(edge.from) && set.has(edge.to);
}

/**
 * Aligns a set of nodes
 * @param {Map<string, {x: number, y: number}>|Record<string, {x: number, y: number}>} nodePositions
 * @param {Map<string, {width: number, height: number}>|Record<string, {width: number, height: number}>} nodeSizes
 * @param {string[]} nodeIds
 * @param {'left'|'right'|'horizontal'|'top'|'bottom'|'vertical'} alignmentType
 * @returns {Record<string, {x: number, y: number}>} New positions for aligned nodes
 */
export function alignNodes(nodePositions, nodeSizes, nodeIds, alignmentType) {
  let result = {};
  if (nodeIds.length < 2) return result;

  let getVal = (obj, key) => {
    if (!obj) return null;
    return typeof obj.get === 'function' ? obj.get(key) : obj[key];
  };

  let boundsList = nodeIds.map(id => {
    let pos = getVal(nodePositions, id) || { x: 0, y: 0 };
    let size = getVal(nodeSizes, id) || { width: 180, height: 60 };
    return {
      id,
      x: pos.x,
      y: pos.y,
      width: size.width,
      height: size.height,
    };
  });

  if (alignmentType === 'left') {
    let minX = Math.min(...boundsList.map(b => b.x));
    for (const b of boundsList) {
      result[b.id] = { x: minX, y: b.y };
    }
  } else if (alignmentType === 'right') {
    let maxX = Math.max(...boundsList.map(b => b.x + b.width));
    for (const b of boundsList) {
      result[b.id] = { x: maxX - b.width, y: b.y };
    }
  } else if (alignmentType === 'horizontal') {
    // Center alignment along Y-axis (avg Y center)
    let totalCenterY = 0;
    for (const b of boundsList) {
      totalCenterY += b.y + b.height / 2;
    }
    let avgCenterY = totalCenterY / boundsList.length;
    for (const b of boundsList) {
      result[b.id] = { x: b.x, y: avgCenterY - b.height / 2 };
    }
  } else if (alignmentType === 'top') {
    let minY = Math.min(...boundsList.map(b => b.y));
    for (const b of boundsList) {
      result[b.id] = { x: b.x, y: minY };
    }
  } else if (alignmentType === 'bottom') {
    let maxY = Math.max(...boundsList.map(b => b.y + b.height));
    for (const b of boundsList) {
      result[b.id] = { x: b.x, y: maxY - b.height };
    }
  } else if (alignmentType === 'vertical') {
    // Center alignment along X-axis (avg X center)
    let totalCenterX = 0;
    for (const b of boundsList) {
      totalCenterX += b.x + b.width / 2;
    }
    let avgCenterX = totalCenterX / boundsList.length;
    for (const b of boundsList) {
      result[b.id] = { x: avgCenterX - b.width / 2, y: b.y };
    }
  }

  return result;
}

/**
 * Distributes nodes evenly
 * @param {Map<string, {x: number, y: number}>|Record<string, {x: number, y: number}>} nodePositions
 * @param {Map<string, {width: number, height: number}>|Record<string, {width: number, height: number}>} nodeSizes
 * @param {string[]} nodeIds
 * @param {'horizontal'|'vertical'} distributionType
 * @returns {Record<string, {x: number, y: number}>} New positions for distributed nodes
 */
export function distributeNodes(nodePositions, nodeSizes, nodeIds, distributionType) {
  let result = {};
  if (nodeIds.length < 3) return result;

  let getVal = (obj, key) => {
    if (!obj) return null;
    return typeof obj.get === 'function' ? obj.get(key) : obj[key];
  };

  let boundsList = nodeIds.map(id => {
    let pos = getVal(nodePositions, id) || { x: 0, y: 0 };
    let size = getVal(nodeSizes, id) || { width: 180, height: 60 };
    return {
      id,
      x: pos.x,
      y: pos.y,
      width: size.width,
      height: size.height,
    };
  });

  if (distributionType === 'horizontal') {
    // Sort by X coordinate
    boundsList.sort((a, b) => a.x - b.x);
    let first = boundsList[0];
    let last = boundsList[boundsList.length - 1];

    let totalWidthOfItems = boundsList.reduce((sum, item) => sum + item.width, 0);
    let totalSpan = last.x + last.width - first.x;
    let totalGap = totalSpan - totalWidthOfItems;

    let gap = totalGap / (boundsList.length - 1);
    let cursor = first.x;

    for (let i = 0; i < boundsList.length; i++) {
      let item = boundsList[i];
      result[item.id] = { x: cursor, y: item.y };
      cursor += item.width + gap;
    }
  } else if (distributionType === 'vertical') {
    // Sort by Y coordinate
    boundsList.sort((a, b) => a.y - b.y);
    let first = boundsList[0];
    let last = boundsList[boundsList.length - 1];

    let totalHeightOfItems = boundsList.reduce((sum, item) => sum + item.height, 0);
    let totalSpan = last.y + last.height - first.y;
    let totalGap = totalSpan - totalHeightOfItems;

    let gap = totalGap / (boundsList.length - 1);
    let cursor = first.y;

    for (let i = 0; i < boundsList.length; i++) {
      let item = boundsList[i];
      result[item.id] = { x: item.x, y: cursor };
      cursor += item.height + gap;
    }
  }

  return result;
}
