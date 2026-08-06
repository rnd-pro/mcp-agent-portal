/**
 * Node — graph node with typed ports and controls
 *
 * Compatible with symbiote-ui GraphNode structure.
 * Ports are explicit objects (unlike symbiote-ui where they're implicit).
 *
 * @module symbiote-ui/core/Node
 */

import { uid } from './Socket.js';

export class Node {
  /**
   * @param {string} label - Display name
   * @param {object} [options]
   * @param {string} [options.id] - Custom ID (default: auto-generated)
   * @param {string} [options.type] - Node type identifier (e.g. 'ai/llm')
   * @param {string} [options.category] - Category for styling (server/instance/control)
   * @param {string} [options.shape] - Shape name (rect/pill/circle/disc/diamond/comment or registered SVG preset)
   * @param {string} [options.icon] - Material icon name for visual rendering
   */
  constructor(label, options = {}) {
    /** @type {string} */
    this.id = options.id || uid('nd');

    /** @type {string} */
    this.label = label;

    /** @type {string} */
    this.type = options.type || 'default';

    /** @type {string} */
    this.category = options.category || 'default';

    /** @type {string} */
    this.shape = options.shape || 'rect';

    /** @type {string} */
    this.icon = options.icon || '';

    /** @type {Object<string, Input>} */
    this.inputs = {};

    /** @type {Object<string, Output>} */
    this.outputs = {};

    /** @type {Object<string, import('./Socket.js').Control>} */
    this.controls = {};

    /** @type {Object<string, *>} */
    this.params = {};

    /** @type {boolean} */
    this.selected = false;

    /** @type {boolean} */
    this.collapsed = false;

    /** @type {boolean} */
    this.muted = false;
  }

  /**
   * Check if input exists
   * @param {string} key
   * @returns {boolean}
   */
  hasInput(key) {
    return key in this.inputs;
  }

  /**
   * Add input port
   * @param {string} key - Port key
   * @param {Input} input - Input instance
   */
  addInput(key, input) {
    if (this.hasInput(key)) throw new Error(`input '${key}' already exists`);
    this.inputs[key] = input;
  }

  /**
   * Remove input port
   * @param {string} key
   */
  removeInput(key) {
    delete this.inputs[key];
  }

  /**
   * Check if output exists
   * @param {string} key
   * @returns {boolean}
   */
  hasOutput(key) {
    return key in this.outputs;
  }

  /**
   * Add output port
   * @param {string} key - Port key
   * @param {Output} output - Output instance
   */
  addOutput(key, output) {
    if (this.hasOutput(key)) throw new Error(`output '${key}' already exists`);
    this.outputs[key] = output;
  }

  /**
   * Remove output port
   * @param {string} key
   */
  removeOutput(key) {
    delete this.outputs[key];
  }

  /**
   * Check if control exists
   * @param {string} key
   * @returns {boolean}
   */
  hasControl(key) {
    return key in this.controls;
  }

  /**
   * Add control widget
   * @param {string} key
   * @param {import('./Socket.js').Control} control
   */
  addControl(key, control) {
    if (this.hasControl(key)) throw new Error(`control '${key}' already exists`);
    this.controls[key] = control;
  }

  /**
   * Remove control widget
   * @param {string} key
   */
  removeControl(key) {
    delete this.controls[key];
  }
}

export { Node as default };
