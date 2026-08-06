/**
 * PillShape — compact horizontal pill node
 *
 * Small node with rounded ends, label centered, 1 input left, 1 output right.
 * No header, no controls. Ideal for simple operations (multiply, add, etc.)
 *
 * @module symbiote-ui/shapes/PillShape
 */

import { NodeShape } from './NodeShape.js';

export class PillShape extends NodeShape {
  name = 'pill';

  getSocketPosition(side, index, total, { width, height }) {
    let r = height / 2;
    if (total <= 1) {
      return {
        x: side === 'input' ? 0 : width,
        y: height / 2,
        angle: side === 'input' ? 180 : 0,
      };
    }


    let arcAngle = Math.PI * 0.6;
    let startAngle = side === 'input' ? Math.PI - arcAngle / 2 : -arcAngle / 2;
    let step = arcAngle / (total - 1);
    let a = startAngle + step * index;

    let cx = side === 'input' ? r : width - r;
    return {
      x: cx + r * Math.cos(a),
      y: height / 2 + r * Math.sin(a),
      angle: (a * 180) / Math.PI,
    };
  }

  /**
   * Get pin position on a specific side of the pill.
   * Left/right follow the rounded semicircle arc.
   * Top/bottom follow the flat straight edge.
   *
   * @param {'top'|'right'|'bottom'|'left'} side
   * @param {number} t - position along the side (0..1)
   * @param {{ width: number, height: number }} size
   * @returns {{ x: number, y: number, angle: number }}
   */
  getSidePosition(side, t, size) {
    const NORMALS = { top: -90, right: 0, bottom: 90, left: 180 };
    const MARGIN = 0.2;
    let effectiveT = MARGIN + t * (1 - 2 * MARGIN);
    let r = size.height / 2;

    if (side === 'top' || side === 'bottom') {

      let x = r + effectiveT * (size.width - 2 * r);
      let y = side === 'top' ? 0 : size.height;
      return { x, y, angle: NORMALS[side] };
    }


    let arcSpan = Math.PI * 0.8;
    let cx = side === 'left' ? r : size.width - r;
    let centerAngle = side === 'left' ? Math.PI : 0;
    let startAngle = centerAngle - arcSpan / 2;
    let a = startAngle + arcSpan * effectiveT;

    return {
      x: cx + r * Math.cos(a),
      y: size.height / 2 + r * Math.sin(a),
      angle: (a * 180) / Math.PI,
    };
  }

  getBorderRadius({ height }) {
    return `${height / 2}px`;
  }

  get hasHeader() {
    return false;
  }

  get hasControls() {
    return false;
  }

  getMinSize() {
    return { minWidth: 100, minHeight: 40 };
  }
}
