/**
 * Frame — visual grouping rectangle for nodes
 *
 * Pure data class (like Node). Stores position, size, color, label.
 * Frame does not own nodes — containment is determined by spatial overlap.
 *
 * @module symbiote-ui/core/Frame
 */

import { uid } from './Socket.js';

export class Frame {
  /**
   * @param {string} label - Display label
   * @param {object} [options]
   * @param {string} [options.color='#4a9eff'] - Border/header color
   * @param {number} [options.x=0] - X position
   * @param {number} [options.y=0] - Y position
   * @param {number} [options.width=400] - Width
   * @param {number} [options.height=300] - Height
   */
  constructor(label, options = {}) {
    this.id = options.id || uid();
    this.label = label;
    this.color = options.color || '#4a9eff';
    this.x = options.x || 0;
    this.y = options.y || 0;
    this.width = options.width || 400;
    this.height = options.height || 300;
  }
}

export { Frame as default };
