/**
 * History.js - Snapshot-based undo/redo for graphs
 *
 * Stores deep-cloned snapshots of nodes and connections.
 * Framework-agnostic — works with any graph data.
 *
 * @module symbiote-engine/History
 */

const MAX_HISTORY = 50;

export class GraphHistory {
  /** @type {Array<{nodes: object[], connections: object[]}>} */
  _states = [];

  /** @type {number} */
  _index = -1;

  /**
   * Push a new state snapshot
   * @param {object[]} nodes
   * @param {object[]} connections
   */
  push(nodes, connections) {
    this._states.length = this._index + 1;
    this._states.push({
      nodes: JSON.parse(JSON.stringify(nodes)),
      connections: JSON.parse(JSON.stringify(connections)),
    });
    if (this._states.length > MAX_HISTORY) {
      this._states.shift();
    }
    this._index = this._states.length - 1;
  }

  /**
   * Undo — return previous state
   * @returns {{nodes: object[], connections: object[]}|null}
   */
  undo() {
    if (!this.canUndo) return null;
    this._index--;
    return this._clone(this._states[this._index]);
  }

  /**
   * Redo — return next state
   * @returns {{nodes: object[], connections: object[]}|null}
   */
  redo() {
    if (!this.canRedo) return null;
    this._index++;
    return this._clone(this._states[this._index]);
  }

  /** @returns {boolean} */
  get canUndo() {
    return this._index > 0;
  }

  /** @returns {boolean} */
  get canRedo() {
    return this._index < this._states.length - 1;
  }

  /** @returns {number} */
  get depth() {
    return this._states.length;
  }

  /** @returns {number} */
  get index() {
    return this._index;
  }

  /** Clear all history */
  clear() {
    this._states = [];
    this._index = -1;
  }

  /**
   * @param {{nodes: object[], connections: object[]}} state
   * @returns {{nodes: object[], connections: object[]}}
   * @private
   */
  _clone(state) {
    return JSON.parse(JSON.stringify(state));
  }
}
