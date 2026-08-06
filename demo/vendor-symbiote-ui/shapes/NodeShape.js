/**
 * NodeShape — abstract base class for node geometry
 *
 * Defines socket placement strategy and outline path for any node shape.
 * Each shape determines WHERE sockets appear and at WHAT ANGLE
 * connections should exit/enter.
 *
 * @module symbiote-ui/shapes/NodeShape
 */

export class NodeShape {
  /** @type {string} */
  name = 'base';

  /**
   * Get socket position on the shape outline
   * @param {'input'|'output'} _side
   * @param {number} _index - ordinal index of this port
   * @param {number} _total - total ports on this side
   * @param {{ width: number, height: number }} _size - node dimensions
   * @returns {{ x: number, y: number, angle: number }}
   *   x, y are relative to node top-left corner
   *   angle is in degrees: 0 = right, 90 = down, 180 = left, 270 = up
   */
  getSocketPosition(_side, _index, _total, _size) {
    throw new Error('getSocketPosition must be implemented');
  }

  /**
   * Get SVG outline path for the shape
   * @param {{ width: number, height: number }} _size
   * @returns {string} SVG path d attribute
   */
  getOutlinePath(_size) {
    return '';
  }

  /**
   * CSS border-radius value for the shape
   * @param {{ width: number, height: number }} _size
   * @returns {string}
   */
  getBorderRadius(_size) {
    return 'var(--sn-node-radius)';
  }

  /**
   * Whether this shape uses standard header+body layout
   * @returns {boolean}
   */
  get hasHeader() {
    return true;
  }

  /**
   * Whether this shape supports embedded controls
   * @returns {boolean}
   */
  get hasControls() {
    return true;
  }

  /**
   * CSS clip-path for non-rectangular shapes
   * @param {{ width: number, height: number }} _size
   * @returns {string|null} null = no clip
   */
  getClipPath(_size) {
    return null;
  }

  /**
   * Minimum node dimensions for this shape
   * @returns {{ minWidth: number, minHeight: number }}
   */
  getMinSize() {
    return { minWidth: 180, minHeight: 60 };
  }
}
