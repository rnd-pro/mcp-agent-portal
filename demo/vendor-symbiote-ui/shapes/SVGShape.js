/**
 * SVGShape — universal shape from any SVG path
 *
 * Uses SVGPathElement.getPointAtLength() for dynamic connector placement.
 * Any SVG icon path can become a node shape — the outer contour defines
 * the visual fill and connector positions are computed along the perimeter.
 *
 * Port placement strategy:
 *   - Inputs placed on left portion of path perimeter
 *   - Outputs placed on right portion of path perimeter
 *   - Connector angle = normal from center → edge point
 *   - Aspect ratio of original SVG is preserved (xMidYMid meet)
 *
 * @module symbiote-ui/shapes/SVGShape
 */

import { NodeShape } from './NodeShape.js';

/**
 * Offscreen SVG namespace for path computation
 * @type {SVGSVGElement|null}
 */
let _offscreenSVG = null;

/**
 * Get or create an offscreen SVG element for path calculations
 * @returns {SVGSVGElement}
 */
function getOffscreenSVG() {
  if (_offscreenSVG) return _offscreenSVG;
  if (typeof document === 'undefined') return null;
  _offscreenSVG = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  _offscreenSVG.style.position = 'absolute';
  _offscreenSVG.style.width = '0';
  _offscreenSVG.style.height = '0';
  _offscreenSVG.style.overflow = 'hidden';
  document.body.appendChild(_offscreenSVG);
  return _offscreenSVG;
}

/**
 * Compute scaling params for viewBox → element mapping
 * Preserves aspect ratio (equivalent to SVG preserveAspectRatio="xMidYMid meet")
 *
 * @param {number[]} vb - [x, y, w, h] viewBox
 * @param {{ width: number, height: number }} size - element size
 * @returns {{ scale: number, offsetX: number, offsetY: number }}
 */
function computeMapping(vb, size) {
  let [vx, vy, vw, vh] = vb;
  let scale = Math.min(size.width / vw, size.height / vh);
  let renderedW = vw * scale;
  let renderedH = vh * scale;
  return {
    scale,
    offsetX: (size.width - renderedW) / 2 - vx * scale,
    offsetY: (size.height - renderedH) / 2 - vy * scale,
  };
}

export class SVGShape extends NodeShape {
  /** @type {string} */
  name;

  /** @type {string} - SVG path d attribute */
  pathData;

  /** @type {string} - viewBox of original SVG */
  viewBox;

  /** @type {number[]} - parsed viewBox [x, y, w, h] */
  #vb;

  /** @type {boolean} - whether shape has standard header */
  #header;

  /** @type {{ minWidth: number, minHeight: number }} */
  #minSize;

  /** @type {Map<string, {x:number,y:number,angle:number}>} - position cache */
  #posCache = new Map();

  /**
   * @param {string} name - Shape identifier
   * @param {object} options
   * @param {string} options.pathData - SVG path d attribute
   * @param {string} [options.viewBox='0 0 24 24'] - Original SVG viewBox
   * @param {boolean} [options.header=false] - Show header/controls
   * @param {{ minWidth?: number, minHeight?: number }} [options.minSize]
   */
  constructor(name, { pathData, viewBox = '0 0 24 24', header = false, minSize = {} }) {
    super();
    this.name = name;
    this.pathData = pathData;
    this.viewBox = viewBox;
    this.#vb = viewBox.split(' ').map(Number);
    this.#header = header;
    this.#minSize = {
      minWidth: minSize.minWidth || 100,
      minHeight: minSize.minHeight || 100,
    };
  }

  /**
   * Scale a point from viewBox coordinates to element pixel coordinates
   * Uses aspect-ratio-preserving mapping (xMidYMid meet)
   *
   * @param {number} px - x in viewBox
   * @param {number} py - y in viewBox
   * @param {{ width: number, height: number }} size - element size
   * @returns {{ x: number, y: number }}
   */
  #scalePoint(px, py, size) {
    let { scale, offsetX, offsetY } = computeMapping(this.#vb, size);
    return {
      x: px * scale + offsetX,
      y: py * scale + offsetY,
    };
  }

  /**
   * Get center of SVG shape in viewBox coordinates
   * @returns {{ x: number, y: number }}
   */
  #getCenter() {
    let [vx, vy, vw, vh] = this.#vb;
    return { x: vx + vw / 2, y: vy + vh / 2 };
  }

  /**
   * Get a path element for computations (uses offscreen SVG)
   * @returns {SVGPathElement|null}
   */
  #getPathElement() {
    let svg = getOffscreenSVG();
    if (!svg) return null;
    let pathEl = svg.querySelector(`[data-shape="${this.name}"]`);
    if (!pathEl) {
      pathEl = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      pathEl.setAttribute('d', this.pathData);
      pathEl.setAttribute('data-shape', this.name);
      svg.appendChild(pathEl);
    }
    return pathEl;
  }

  /**
   * Find the point on the SVG path that a ray from center at a given angle hits.
   * Uses dense sampling along the path perimeter and finds the point
   * whose angle from center best matches the target angle.
   *
   * @param {number} targetAngle - angle in radians from center
   * @param {SVGPathElement} pathEl
   * @returns {{ x: number, y: number }} - point in viewBox coordinates
   */
  #findPointAtAngle(targetAngle, pathEl) {
    let totalLen = pathEl.getTotalLength();
    let center = this.#getCenter();


    let bestDist = Infinity;
    let bestLen = 0;
    const COARSE = 128;

    for (let i = 0; i <= COARSE; i++) {
      let len = (totalLen * i) / COARSE;
      let pt = pathEl.getPointAtLength(len);
      let angle = Math.atan2(pt.y - center.y, pt.x - center.x);
      let diff = Math.abs(angle - targetAngle);
      if (diff > Math.PI) diff = 2 * Math.PI - diff;
      if (diff < bestDist) {
        bestDist = diff;
        bestLen = len;
      }
    }


    let searchRadius = totalLen / COARSE;
    const FINE = 32;
    let startLen = Math.max(0, bestLen - searchRadius);
    let endLen = Math.min(totalLen, bestLen + searchRadius);

    for (let i = 0; i <= FINE; i++) {
      let len = startLen + ((endLen - startLen) * i) / FINE;
      let pt = pathEl.getPointAtLength(len);
      let angle = Math.atan2(pt.y - center.y, pt.x - center.x);
      let diff = Math.abs(angle - targetAngle);
      if (diff > Math.PI) diff = 2 * Math.PI - diff;
      if (diff < bestDist) {
        bestDist = diff;
        bestLen = len;
      }
    }

    return pathEl.getPointAtLength(bestLen);
  }

  /**
   * Get socket position on the shape outline.
   * Results are cached — same params always return same position.
   *
   * @param {'input'|'output'} side
   * @param {number} index - ordinal index of this port
   * @param {number} total - total ports on this side
   * @param {{ width: number, height: number }} size - node dimensions
   * @returns {{ x: number, y: number, angle: number }}
   */
  getSocketPosition(side, index, total, size) {

    let key = `${side}|${index}|${total}|${size.width}|${size.height}`;
    if (this.#posCache.has(key)) return this.#posCache.get(key);

    let pathEl = this.#getPathElement();

    if (!pathEl) {
      let y = (size.height * (index + 1)) / (total + 1);
      let result = side === 'input' ? { x: 0, y, angle: 180 } : { x: size.width, y, angle: 0 };
      this.#posCache.set(key, result);
      return result;
    }


    let centerAngle = side === 'input' ? Math.PI : 0;
    let arcSpan = Math.PI * 0.6;
    let targetAngle;

    if (total === 1) {
      targetAngle = centerAngle;
    } else {
      let startAngle = centerAngle - arcSpan / 2;
      let step = arcSpan / (total - 1);
      targetAngle = startAngle + step * index;
    }

    let pt = this.#findPointAtAngle(targetAngle, pathEl);
    let scaled = this.#scalePoint(pt.x, pt.y, size);


    let totalLen = pathEl.getTotalLength();
    let center = this.#getCenter();
    let bestLen = 0,
      bestDist = Infinity;
    const SCAN = 128;
    for (let i = 0; i <= SCAN; i++) {
      let len = (totalLen * i) / SCAN;
      let p = pathEl.getPointAtLength(len);
      let dist = (p.x - pt.x) ** 2 + (p.y - pt.y) ** 2;
      if (dist < bestDist) {
        bestDist = dist;
        bestLen = len;
      }
    }
    let delta = 0.5;
    let prevPt = pathEl.getPointAtLength(Math.max(0, bestLen - delta));
    let nextPt = pathEl.getPointAtLength(Math.min(totalLen, bestLen + delta));
    let tx = nextPt.x - prevPt.x,
      ty = nextPt.y - prevPt.y;
    let nx = -ty,
      ny = tx;
    let radX = pt.x - center.x,
      radY = pt.y - center.y;
    if (nx * radX + ny * radY < 0) {
      nx = ty;
      ny = -tx;
    }
    let angleDeg = (Math.atan2(ny, nx) * 180) / Math.PI;

    let result = { x: scaled.x, y: scaled.y, angle: angleDeg };
    this.#posCache.set(key, result);
    return result;
  }

  /**
   * Get edge point at a specific angle (direction toward target node).
   * Used for dynamic connectors that slide along the perimeter.
   *
   * @param {number} angle - angle in radians from center to target
   * @param {{ width: number, height: number }} size - element dimensions
   * @returns {{ x: number, y: number, angle: number }}
   */
  getEdgePoint(angle, size) {

    let rounded = Math.round(angle * 1000) / 1000;
    let key = `edge|${rounded}|${size.width}|${size.height}`;
    if (this.#posCache.has(key)) return this.#posCache.get(key);

    let pathEl = this.#getPathElement();
    if (!pathEl) {
      let cx = size.width / 2;
      let cy = size.height / 2;
      return {
        x: cx + Math.cos(angle) * cx,
        y: cy + Math.sin(angle) * cy,
        angle: (angle * 180) / Math.PI,
      };
    }

    let pt = this.#findPointAtAngle(angle, pathEl);
    let scaled = this.#scalePoint(pt.x, pt.y, size);


    let totalLen = pathEl.getTotalLength();
    let center = this.#getCenter();


    let bestLen = 0,
      bestDist = Infinity;
    const SCAN = 128;
    for (let i = 0; i <= SCAN; i++) {
      let len = (totalLen * i) / SCAN;
      let p = pathEl.getPointAtLength(len);
      let dist = (p.x - pt.x) ** 2 + (p.y - pt.y) ** 2;
      if (dist < bestDist) {
        bestDist = dist;
        bestLen = len;
      }
    }


    let delta = 0.5;
    let prevLen = Math.max(0, bestLen - delta);
    let nextLen = Math.min(totalLen, bestLen + delta);
    let prevPt = pathEl.getPointAtLength(prevLen);
    let nextPt = pathEl.getPointAtLength(nextLen);


    let tx = nextPt.x - prevPt.x;
    let ty = nextPt.y - prevPt.y;


    let nx = -ty,
      ny = tx;
    let radX = pt.x - center.x;
    let radY = pt.y - center.y;

    if (nx * radX + ny * radY < 0) {
      nx = ty;
      ny = -tx;
    }

    let angleDeg = (Math.atan2(ny, nx) * 180) / Math.PI;

    let result = { x: scaled.x, y: scaled.y, angle: angleDeg };


    if (this.#posCache.size > 360) {
      let first = this.#posCache.keys().next().value;
      this.#posCache.delete(first);
    }
    this.#posCache.set(key, result);
    return result;
  }

  /**
   * Get a pin position on a specific side of the shape.
   *
   * Side-based placement: pins are placed along a side edge (top/right/bottom/left).
   * The position within the side is controlled by t (0 = start, 1 = end).
   *
   * @param {'top'|'right'|'bottom'|'left'} side - which side to place pin on
   * @param {number} t - position along the side (0..1), 0.5 = center
   * @param {{ width: number, height: number }} size - element dimensions
   * @returns {{ x: number, y: number, angle: number }} - angle is outward normal in degrees
   */
  getSidePosition(side, t, size) {
    let key = `side|${side}|${(t * 100) | 0}|${size.width}|${size.height}`;
    if (this.#posCache.has(key)) return this.#posCache.get(key);


    const NORMALS = { top: -90, right: 0, bottom: 90, left: 180 };
    let angleDeg = NORMALS[side];


    let pathEl = this.#getPathElement();
    if (pathEl) {


      const RANGES = {
        right: { from: -Math.PI / 4, to: Math.PI / 4 },
        bottom: { from: Math.PI / 4, to: (3 * Math.PI) / 4 },
        left: { from: (3 * Math.PI) / 4, to: (5 * Math.PI) / 4 },
        top: { from: (-3 * Math.PI) / 4, to: -Math.PI / 4 },
      };

      let range = RANGES[side];

      let sideKey = `sidepts|${side}|${size.width}|${size.height}`;
      let sidePoints;

      if (this.#posCache.has(sideKey)) {
        sidePoints = this.#posCache.get(sideKey);
      } else {
        sidePoints = [];
        const SAMPLES = 16;
        for (let i = 0; i <= SAMPLES; i++) {
          let a = range.from + (range.to - range.from) * (i / SAMPLES);
          let pt = this.#findPointAtAngle(a, pathEl);
          let sp = this.#scalePoint(pt.x, pt.y, size);
          sidePoints.push(sp);
        }
        this.#posCache.set(sideKey, sidePoints);
      }


      const MARGIN = 0.2;
      let effectiveT = MARGIN + t * (1 - 2 * MARGIN);
      let idx = effectiveT * (sidePoints.length - 1);
      let lo = Math.floor(idx);
      let hi = Math.min(lo + 1, sidePoints.length - 1);
      let frac = idx - lo;

      let x = sidePoints[lo].x + (sidePoints[hi].x - sidePoints[lo].x) * frac;
      let y = sidePoints[lo].y + (sidePoints[hi].y - sidePoints[lo].y) * frac;

      let result = { x, y, angle: angleDeg };
      this.#posCache.set(key, result);
      return result;
    }


    let x, y;
    switch (side) {
      case 'top':
        x = size.width * (0.2 + t * 0.6);
        y = 0;
        break;
      case 'right':
        x = size.width;
        y = size.height * (0.2 + t * 0.6);
        break;
      case 'bottom':
        x = size.width * (0.2 + t * 0.6);
        y = size.height;
        break;
      case 'left':
        x = 0;
        y = size.height * (0.2 + t * 0.6);
        break;
    }

    let result = { x, y, angle: angleDeg };
    this.#posCache.set(key, result);
    return result;
  }

  getClipPath(_size) {
    return null;
  }

  getOutlinePath(_size) {
    return this.pathData;
  }

  getBorderRadius() {
    return '0';
  }

  get hasHeader() {
    return this.#header;
  }

  get hasControls() {
    return this.#header;
  }

  getMinSize() {
    return this.#minSize;
  }
}


/**
 * Register an SVG shape from a path string
 * @param {string} name
 * @param {string} pathData - SVG d attribute
 * @param {object} [options]
 * @returns {SVGShape}
 */
export function createSVGShape(name, pathData, options = {}) {
  return new SVGShape(name, { pathData, ...options });
}


export let SVG_PRESETS = {
  disc: 'M12 2A10 10 0 1 1 12 22A10 10 0 1 1 12 2Z',


  hexagon: 'M12 2L22 8.5V15.5L12 22L2 15.5V8.5Z',


  pentagon: 'M12 2L22 9.27L18.18 21H5.82L2 9.27Z',


  star: 'M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26Z',


  cloud:
    'M19.35 10.04A7.49 7.49 0 0012 4C9.11 4 6.6 5.64 5.35 8.04A5.994 5.994 0 000 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96z',


  shield: 'M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4z',


  octagon: 'M7.86 2H16.14L22 7.86V16.14L16.14 22H7.86L2 16.14V7.86Z',


  parallelogram: 'M6 2H22L18 22H2Z',


  trapezoid: 'M4 22H20L23 2H1Z',


  cylinder: 'M4 6C4 4 8 2 12 2S20 4 20 6V18C20 20 16 22 12 22S4 20 4 18Z',


  database:
    'M12 3C7.58 3 4 4.79 4 7V17C4 19.21 7.59 21 12 21S20 19.21 20 17V7C20 4.79 16.42 3 12 3Z',


  bolt: 'M7 2V13H10V22L17 10H13L17 2Z',


  heart:
    'M12 21.35L10.55 20.03C5.4 15.36 2 12.28 2 8.5C2 5.42 4.42 3 7.5 3C9.24 3 10.91 3.81 12 5.09C13.09 3.81 14.76 3 16.5 3C19.58 3 22 5.42 22 8.5C22 12.28 18.6 15.36 13.45 20.04L12 21.35Z',
};
