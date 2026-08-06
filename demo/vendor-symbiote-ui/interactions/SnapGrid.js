/**
 * SnapGrid — grid snapping for node positions
 *
 * Rounds coordinates to nearest grid cell.
 * Supports dynamic (during drag) and static (on drop) modes.
 *
 * Adapted from Rete.js snap grid (62 LOC).
 * @module symbiote-ui/interactions/SnapGrid
 */

export class SnapGrid {
  /** @type {number} */
  #size;

  /** @type {boolean} */
  #dynamic;

  /**
   * @param {object} config
   * @param {number} [config.size=16] - Grid cell size in pixels
   * @param {boolean} [config.dynamic=true] - Snap during drag (true) or only on drop (false)
   */
  constructor(config = {}) {
    this.#size = config.size || 16;
    this.#dynamic = config.dynamic !== false;
  }

  /**
   * Snap coordinates to nearest grid cell
   * @param {number} x
   * @param {number} y
   * @returns {{ x: number, y: number }}
   */
  snap(x, y) {
    return {
      x: Math.round(x / this.#size) * this.#size,
      y: Math.round(y / this.#size) * this.#size,
    };
  }

  /**
   * Whether to snap during drag or only on drop
   * @returns {boolean}
   */
  get isDynamic() {
    return this.#dynamic;
  }

  /**
   * Get grid size
   * @returns {number}
   */
  get size() {
    return this.#size;
  }

  /**
   * Update grid size
   * @param {number} size
   */
  setSize(size) {
    this.#size = size;
  }
}

export { SnapGrid as default };
