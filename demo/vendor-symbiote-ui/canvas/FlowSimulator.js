/**
 * FlowSimulator — sequential data flow animation
 *
 * Performs topological traversal of the node graph and animates
 * nodes and connections step-by-step (like n8n execution).
 *
 * @module symbiote-ui/canvas/FlowSimulator
 */

/**
 * @typedef {Object} FlowSimulatorConfig
 * @property {import('../core/Editor.js').NodeEditor} editor
 * @property {Object} canvas - NodeCanvas instance (for setFlowing, node views)
 */

export class FlowSimulator {
  /** @type {import('../core/Editor.js').NodeEditor} */
  #editor;

  /** @type {Object} */
  #canvas;

  /** @type {boolean} */
  #running = false;

  /** @type {AbortController|null} */
  #abort = null;

  /** @type {number} ms per node step */
  speed = 800;

  /** @type {boolean} follow active node with camera */
  followActive = false;

  /** @type {boolean} temporarily paused by manual interaction */
  #followPaused = false;

  /** @type {number|null} */
  #followResumeTimer = null;

  /** @type {number} ms before follow resumes after manual interaction */
  followResumDelay = 3000;

  /** Bound handler for manualviewport event */
  #handleManualViewport = () => {
    if (!this.followActive || !this.#running) return;
    this.#followPaused = true;
    if (this.#followResumeTimer) clearTimeout(this.#followResumeTimer);
    this.#followResumeTimer = setTimeout(() => {
      this.#followPaused = false;
      this.#followResumeTimer = null;
    }, this.followResumDelay);
  };

  /**
   * @param {import('../core/Editor.js').NodeEditor} editor
   * @param {Object} canvas - NodeCanvas instance
   */
  constructor(editor, canvas) {
    this.#editor = editor;
    this.#canvas = canvas;
  }

  /** @returns {boolean} */
  get running() {
    return this.#running;
  }

  /**
   * Run sequential flow animation
   * @returns {Promise<void>}
   */
  async run() {
    if (this.#running) return;
    this.#running = true;
    this.#abort = new AbortController();
    this.#followPaused = false;
    this.#canvas.addEventListener('manualviewport', this.#handleManualViewport);

    let order = this.#topologicalSort();
    let connections = this.#editor.getConnections();
    this.#editor.emit('flowstart', { nodes: order });

    try {
      for (const nodeId of order) {
        if (this.#abort.signal.aborted) break;


        this.#setNodeState(nodeId, 'processing');
        this.#editor.emit('nodeprocessing', { nodeId });


        if (this.followActive && !this.#followPaused) {
          this.#canvas.panToNode?.(nodeId);
        }


        let node = this.#editor.getNode(nodeId);
        if (node?._isSubgraph && node.innerEditor) {
          await this.#runInnerFlow(nodeId, node);
        } else {
          await this.#wait(this.speed);
        }
        if (this.#abort.signal.aborted) break;


        this.#setNodeState(nodeId, 'completed');
        this.#editor.emit('nodecompleted', { nodeId });


        let outgoing = connections.filter((c) => c.from === nodeId);
        for (const conn of outgoing) {
          this.#canvas.setFlowing(conn.id, true);
        }

        await this.#wait(this.speed * 0.5);
        if (this.#abort.signal.aborted) break;


        for (const conn of outgoing) {
          this.#canvas.setFlowing(conn.id, false);
        }
      }


      if (!this.#abort.signal.aborted) {
        this.#editor.emit('flowcomplete', {});
      }
    } finally {
      this.#running = false;
      this.#abort = null;
      this.#canvas.removeEventListener('manualviewport', this.#handleManualViewport);
    }
  }

  /** Stop animation and clear all states */
  stop() {
    if (this.#abort) this.#abort.abort();
    this.#running = false;
    this.#canvas.removeEventListener('manualviewport', this.#handleManualViewport);
    if (this.#followResumeTimer) {
      clearTimeout(this.#followResumeTimer);
      this.#followResumeTimer = null;
    }
    this.#followPaused = false;


    for (const node of this.#editor.getNodes()) {
      this.#clearNodeState(node.id);
    }


    this.#canvas.setAllFlowing(false);
  }

  /**
   * Topological sort — Kahn's algorithm
   * Returns node IDs ordered from sources to sinks
   * @returns {string[]}
   */
  #topologicalSort() {
    let nodes = this.#editor.getNodes();
    let connections = this.#editor.getConnections();


    /** @type {Set<string>} */
    let connectedIds = new Set();
    for (const conn of connections) {
      connectedIds.add(conn.from);
      connectedIds.add(conn.to);
    }


    /** @type {Map<string, string[]>} */
    let adj = new Map();
    /** @type {Map<string, number>} */
    let inDeg = new Map();

    for (const node of nodes) {
      if (!connectedIds.has(node.id)) continue;
      adj.set(node.id, []);
      inDeg.set(node.id, 0);
    }

    for (const conn of connections) {
      adj.get(conn.from)?.push(conn.to);
      inDeg.set(conn.to, (inDeg.get(conn.to) || 0) + 1);
    }


    /** @type {string[]} */
    let queue = [];
    for (const [id, deg] of inDeg) {
      if (deg === 0) queue.push(id);
    }

    /** @type {string[]} */
    let result = [];
    while (queue.length > 0) {
      let id = queue.shift();
      result.push(id);
      for (const next of adj.get(id) || []) {
        let newDeg = (inDeg.get(next) || 1) - 1;
        inDeg.set(next, newDeg);
        if (newDeg === 0) queue.push(next);
      }
    }

    return result;
  }

  /**
   * Animate inner nodes of a subgraph sequentially in its preview canvas
   * @param {string} nodeId - Parent subgraph node ID
   * @param {import('../core/SubgraphNode.js').SubgraphNode} node
   */
  async #runInnerFlow(nodeId, node) {
    let el = this.#canvas._getNodeView?.(nodeId);
    if (!el) {
      await this.#wait(this.speed);
      return;
    }

    let innerEditor = node.innerEditor;
    let innerNodes = innerEditor.getNodes();
    let innerConns = innerEditor.getConnections();

    if (innerNodes.length === 0) {
      await this.#wait(this.speed);
      return;
    }


    let adj = new Map();
    let inDeg = new Map();
    for (const n of innerNodes) {
      adj.set(n.id, []);
      inDeg.set(n.id, 0);
    }
    for (const conn of innerConns) {
      adj.get(conn.from)?.push(conn.to);
      inDeg.set(conn.to, (inDeg.get(conn.to) || 0) + 1);
    }
    let queue = [];
    for (const [id, deg] of inDeg) {
      if (deg === 0) queue.push(id);
    }
    let innerOrder = [];
    while (queue.length > 0) {
      let id = queue.shift();
      innerOrder.push(id);
      for (const next of adj.get(id) || []) {
        let newDeg = (inDeg.get(next) || 1) - 1;
        inDeg.set(next, newDeg);
        if (newDeg === 0) queue.push(next);
      }
    }


    let stepTime = this.speed / Math.max(innerOrder.length, 1);
    el._innerFlowStates = {};

    for (const innerId of innerOrder) {
      if (this.#abort.signal.aborted) break;

      el._innerFlowStates[innerId] = 'processing';
      el._redrawPreview?.();

      await this.#wait(stepTime * 0.6);
      if (this.#abort.signal.aborted) break;

      el._innerFlowStates[innerId] = 'completed';
      el._redrawPreview?.();

      await this.#wait(stepTime * 0.4);
    }
  }

  /**
   * Set visual state on a node element
   * @param {string} nodeId
   * @param {'processing'|'completed'} state
   */
  #setNodeState(nodeId, state) {
    let el = this.#canvas._getNodeView?.(nodeId);
    if (!el) return;
    el.removeAttribute('data-processing');
    el.removeAttribute('data-completed');
    el.setAttribute(`data-${state}`, '');
  }

  /**
   * Clear visual state from a node element
   * @param {string} nodeId
   */
  #clearNodeState(nodeId) {
    let el = this.#canvas._getNodeView?.(nodeId);
    if (!el) return;
    el.removeAttribute('data-processing');
    el.removeAttribute('data-completed');

    if (el._innerFlowStates) {
      el._innerFlowStates = {};
      el._redrawPreview?.();
    }
  }

  /**
   * Cancellable delay
   * @param {number} ms
   * @returns {Promise<void>}
   */
  #wait(ms) {
    return new Promise((resolve) => {
      let timer = setTimeout(resolve, ms);
      this.#abort?.signal.addEventListener(
        'abort',
        () => {
          clearTimeout(timer);
          resolve();
        },
        { once: true }
      );
    });
  }
}
