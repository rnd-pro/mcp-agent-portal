/**
 * Selector — multi-select manager for nodes and connections
 *
 * Handles single select, Ctrl/Meta+click accumulation,
 * canvas deselect, and group translate of selected nodes.
 *
 * Adapted from Rete.js selectable extension (208 LOC).
 * @module symbiote-ui/interactions/Selector
 */

/** @type {number} Minimum pointer movement to consider a drag (pixels) */
const TWITCH_THRESHOLD = 4;

export class Selector {
  /** @type {Set<string>} */
  #selectedNodes = new Set();

  /** @type {Set<string>} */
  #selectedConnections = new Set();

  /** @type {function|null} */
  #onChange = null;

  /**
   * @param {object} config
   * @param {function} config.onChange - Called when selection changes: (nodes: Set, connections: Set)
   */
  constructor(config = {}) {
    this.#onChange = config.onChange || null;
  }

  /**
   * Select a node (single or accumulate with Ctrl/Meta)
   * @param {string} nodeId
   * @param {boolean} accumulate - Ctrl/Meta held
   */
  selectNode(nodeId, accumulate = false) {
    if (!accumulate) {
      this.#selectedNodes.clear();
      this.#selectedConnections.clear();
    }

    if (this.#selectedNodes.has(nodeId) && accumulate) {
      this.#selectedNodes.delete(nodeId);
    } else {
      this.#selectedNodes.add(nodeId);
    }

    this.#notify();
  }

  /**
   * Select multiple nodes
   * @param {string[]|Set<string>} nodeIds
   * @param {boolean} accumulate
   */
  selectNodes(nodeIds, accumulate = false) {
    if (!accumulate) {
      this.#selectedNodes.clear();
      this.#selectedConnections.clear();
    }
    for (const id of nodeIds) {
      this.#selectedNodes.add(id);
    }
    this.#notify();
  }

  /**
   * Toggle node selection state
   * @param {string} nodeId
   */
  toggleNode(nodeId) {
    if (this.#selectedNodes.has(nodeId)) {
      this.#selectedNodes.delete(nodeId);
    } else {
      this.#selectedNodes.add(nodeId);
    }
    this.#notify();
  }

  /**
   * Select a connection
   * @param {string} connId
   * @param {boolean} accumulate
   */
  selectConnection(connId, accumulate = false) {
    if (!accumulate) {
      this.#selectedNodes.clear();
      this.#selectedConnections.clear();
    }

    if (this.#selectedConnections.has(connId) && accumulate) {
      this.#selectedConnections.delete(connId);
    } else {
      this.#selectedConnections.add(connId);
    }

    this.#notify();
  }

  /**
   * Select multiple connections
   * @param {string[]|Set<string>} connIds
   * @param {boolean} accumulate
   */
  selectConnections(connIds, accumulate = false) {
    if (!accumulate) {
      this.#selectedNodes.clear();
      this.#selectedConnections.clear();
    }
    for (const id of connIds) {
      this.#selectedConnections.add(id);
    }
    this.#notify();
  }

  /**
   * Toggle connection selection state
   * @param {string} connId
   */
  toggleConnection(connId) {
    if (this.#selectedConnections.has(connId)) {
      this.#selectedConnections.delete(connId);
    } else {
      this.#selectedConnections.add(connId);
    }
    this.#notify();
  }

  deselectConnection(connId) {
    if (!this.#selectedConnections.delete(connId)) return;
    this.#notify();
  }

  /**
   * Deselect everything
   */
  unselectAll() {
    if (this.#selectedNodes.size === 0 && this.#selectedConnections.size === 0) return;
    this.#selectedNodes.clear();
    this.#selectedConnections.clear();
    this.#notify();
  }

  /**
   * @param {string} nodeId
   * @returns {boolean}
   */
  isNodeSelected(nodeId) {
    return this.#selectedNodes.has(nodeId);
  }

  /**
   * @param {string} connId
   * @returns {boolean}
   */
  isConnectionSelected(connId) {
    return this.#selectedConnections.has(connId);
  }

  /**
   * Get all selected node IDs
   * @returns {Set<string>}
   */
  getSelectedNodes() {
    return new Set(this.#selectedNodes);
  }

  /**
   * Get all selected connection IDs
   * @returns {Set<string>}
   */
  getSelectedConnections() {
    return new Set(this.#selectedConnections);
  }

  /**
   * Check if pointer was a twitch (< 4px movement)
   * @param {{ x: number, y: number }} start
   * @param {{ x: number, y: number }} end
   * @returns {boolean}
   */
  static isTwitch(start, end) {
    let dx = Math.abs(end.x - start.x);
    let dy = Math.abs(end.y - start.y);
    return dx < TWITCH_THRESHOLD && dy < TWITCH_THRESHOLD;
  }

  #notify() {
    if (this.#onChange) {
      this.#onChange(this.#selectedNodes, this.#selectedConnections);
    }
  }
}

export { Selector as default };
