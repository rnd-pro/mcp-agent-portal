/**
 * CircleShape — circular hub node
 *
 * Sockets distributed around the perimeter of a circle.
 * Inputs on left semicircle, outputs on right semicircle.
 *
 * @module symbiote-ui/shapes/CircleShape
 */

import { NodeShape } from './NodeShape.js';

export class CircleShape extends NodeShape {
  name = 'circle';

  getSocketPosition(side, index, total, { width, height }) {
    let r = Math.min(width, height) / 2;
    let cx = width / 2;
    let cy = height / 2;


    let arcSpan = Math.PI * 0.8;
    let centerAngle = side === 'input' ? Math.PI : 0;
    let startAngle = centerAngle - arcSpan / 2;
    let step = total > 1 ? arcSpan / (total - 1) : 0;
    let angle = startAngle + step * index;

    return {
      x: cx + r * Math.cos(angle),
      y: cy + r * Math.sin(angle),
      angle: (angle * 180) / Math.PI,
    };
  }

  /**
   * Get pin position on a specific side of the circle.
   * Pins follow an arc in the corresponding quadrant.
   *
   * @param {'top'|'right'|'bottom'|'left'} side
   * @param {number} t - position along the side (0..1)
   * @param {{ width: number, height: number }} size
   * @returns {{ x: number, y: number, angle: number }}
   */
  getSidePosition(side, t, size) {
    let r = Math.min(size.width, size.height) / 2;
    let cx = size.width / 2;
    let cy = size.height / 2;


    const CENTERS = { right: 0, bottom: Math.PI / 2, left: Math.PI, top: -Math.PI / 2 };
    const ARC = Math.PI * 0.8;
    const MARGIN = 0.2;
    let effectiveT = MARGIN + t * (1 - 2 * MARGIN);

    let center = CENTERS[side];
    let a = center - ARC / 2 + ARC * effectiveT;

    return {
      x: cx + r * Math.cos(a),
      y: cy + r * Math.sin(a),
      angle: (a * 180) / Math.PI,
    };
  }

  getBorderRadius() {
    return '50%';
  }

  get hasHeader() {
    return false;
  }

  get hasControls() {
    return false;
  }

  getMinSize() {
    return { minWidth: 80, minHeight: 80 };
  }
}
