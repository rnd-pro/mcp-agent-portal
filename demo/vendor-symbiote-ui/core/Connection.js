/**
 * Connection — link between two node ports
 *
 * Uses symbiote-ui naming: from/out/to/in
 * Adds connection ID for selection/history support.
 *
 * @module symbiote-ui/core/Connection
 */

import { uid } from './Socket.js';

export class Connection {
  /**
   * @param {import('./Node.js').Node} sourceNode - Source node
   * @param {string} sourceOutput - Output port key
   * @param {import('./Node.js').Node} targetNode - Target node
   * @param {string} targetInput - Input port key
   */
  constructor(sourceNode, sourceOutput, targetNode, targetInput) {
    if (!sourceNode.outputs[sourceOutput]) {
      throw new Error(`source node doesn't have output '${sourceOutput}'`);
    }
    if (!targetNode.inputs[targetInput]) {
      throw new Error(`target node doesn't have input '${targetInput}'`);
    }

    /** @type {string} */
    this.id = uid('conn');

    /** @type {string} - Source node ID (symbiote-ui: 'from') */
    this.from = sourceNode.id;

    /** @type {string} - Source output key (symbiote-ui: 'out') */
    this.out = sourceOutput;

    /** @type {string} - Target node ID (symbiote-ui: 'to') */
    this.to = targetNode.id;

    /** @type {string} - Target input key (symbiote-ui: 'in') */
    this.in = targetInput;

    /** @type {boolean} */
    this.selected = false;

    /** @type {string|undefined} */
    this.kind = undefined;

    /** @type {'none'|'forward'|'reverse'|'both'|undefined} */
    this.direction = undefined;

    /** @type {object|undefined} */
    this.design = undefined;
  }
}

export { Connection as default };
