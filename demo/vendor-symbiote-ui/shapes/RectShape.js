/**
 * RectShape — standard rectangular node card
 *
 * Sockets arranged vertically on left (inputs) and right (outputs).
 * Default shape for most nodes.
 *
 * @module symbiote-ui/shapes/RectShape
 */

import { NodeShape } from './NodeShape.js';

export class RectShape extends NodeShape {
  name = 'rect';

  /** @type {number} */
  #headerHeight;

  /**
   * @param {object} [config]
   * @param {number} [config.headerHeight=36] - Height of header area
   */
  constructor(config = {}) {
    super();
    this.#headerHeight = config.headerHeight || 36;
  }

  getSocketPosition(side, index, total, { width, height }) {
    let bodyHeight = height - this.#headerHeight;
    let spacing = bodyHeight / (total + 1);
    let y = this.#headerHeight + spacing * (index + 1);

    return {
      x: side === 'input' ? 0 : width,
      y,
      angle: side === 'input' ? 180 : 0,
    };
  }

  /**
   * Get pin position on a specific side of the rectangle.
   * Required for PCB path style — without this, ConnectionRenderer
   * skips rect nodes entirely.
   *
   * @param {'top'|'right'|'bottom'|'left'} side
   * @param {number} t - position along the side (0..1), 0.5 = center
   * @param {{ width: number, height: number }} size
   * @returns {{ x: number, y: number, angle: number }}
   */
  getSidePosition(side, t, size) {
    const NORMALS = { top: -90, right: 0, bottom: 90, left: 180 };
    const MARGIN = 0.2;
    let effectiveT = MARGIN + t * (1 - 2 * MARGIN);

    let x, y;
    switch (side) {
      case 'top':
        x = size.width * effectiveT;
        y = 0;
        break;
      case 'right':
        x = size.width;
        y = size.height * effectiveT;
        break;
      case 'bottom':
        x = size.width * effectiveT;
        y = size.height;
        break;
      case 'left':
        x = 0;
        y = size.height * effectiveT;
        break;
    }

    return { x, y, angle: NORMALS[side] };
  }

  getBorderRadius() {
    return 'var(--sn-node-radius)';
  }

  getMinSize() {
    return { minWidth: 180, minHeight: 60 };
  }
}
