/**
 * DiamondShape — condition/decision rhombus node
 *
 * Input at top vertex, outputs distributed along bottom edges.
 * Classic if/else, switch/case pattern.
 *
 * @module symbiote-ui/shapes/DiamondShape
 */

import { NodeShape } from './NodeShape.js';

export class DiamondShape extends NodeShape {
  name = 'diamond';

  getSocketPosition(side, index, total, { width, height }) {
    let cx = width / 2;
    let cy = height / 2;

    if (side === 'input') {

      if (total === 1) {
        return { x: cx, y: 0, angle: 270 };
      }

      let t = (index + 1) / (total + 1);
      return {
        x: cx * (1 - t),
        y: cy * t,
        angle: 225 + 90 * (index / (total - 1)),
      };
    }


    if (total === 1) {
      return { x: cx, y: height, angle: 90 };
    }
    if (total === 2) {

      return index === 0
        ? { x: cx * 0.35, y: cy + cy * 0.65, angle: 225 }
        : { x: width - cx * 0.35, y: cy + cy * 0.65, angle: 315 };
    }

    let t = (index + 1) / (total + 1);
    return {
      x: t < 0.5 ? cx * (1 - 2 * t) : cx + cx * (2 * t - 1),
      y: t < 0.5 ? cy + cy * 2 * t : cy + cy * (2 - 2 * t),
      angle: 135 + 90 * (index / (total - 1)),
    };
  }

  /**
   * Get pin position on a specific side of the diamond.
   * Each side maps to two diagonal edges meeting at that cardinal vertex.
   *
   * @param {'top'|'right'|'bottom'|'left'} side
   * @param {number} t - position along the side (0..1)
   * @param {{ width: number, height: number }} size
   * @returns {{ x: number, y: number, angle: number }}
   */
  getSidePosition(side, t, size) {
    let cx = size.width / 2;
    let cy = size.height / 2;
    const NORMALS = { top: -90, right: 0, bottom: 90, left: 180 };
    const MARGIN = 0.2;
    let effectiveT = MARGIN + t * (1 - 2 * MARGIN);


    let vertices = {
      top: [
        { x: 0, y: cy },
        { x: cx, y: 0 },
        { x: size.width, y: cy },
      ],
      right: [
        { x: cx, y: 0 },
        { x: size.width, y: cy },
        { x: cx, y: size.height },
      ],
      bottom: [
        { x: 0, y: cy },
        { x: cx, y: size.height },
        { x: size.width, y: cy },
      ],
      left: [
        { x: cx, y: 0 },
        { x: 0, y: cy },
        { x: cx, y: size.height },
      ],
    };

    let [p0, p1, p2] = vertices[side];


    let x, y;
    if (effectiveT <= 0.5) {
      let segT = effectiveT * 2;
      x = p0.x + (p1.x - p0.x) * segT;
      y = p0.y + (p1.y - p0.y) * segT;
    } else {
      let segT = (effectiveT - 0.5) * 2;
      x = p1.x + (p2.x - p1.x) * segT;
      y = p1.y + (p2.y - p1.y) * segT;
    }

    return { x, y, angle: NORMALS[side] };
  }

  getBorderRadius() {
    return '0';
  }

  getClipPath({ width, height }) {
    let cx = width / 2;
    let cy = height / 2;
    return `polygon(${cx}px 0, ${width}px ${cy}px, ${cx}px ${height}px, 0 ${cy}px)`;
  }

  get hasHeader() {
    return false;
  }

  get hasControls() {
    return false;
  }

  getMinSize() {
    return { minWidth: 100, minHeight: 100 };
  }
}
