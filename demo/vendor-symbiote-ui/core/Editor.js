/**
 * NodeEditor — central graph manager with event system
 *
 * Provides CRUD operations for nodes and connections with
 * pre/post event hooks via callback-based event emitter.
 * Replaces Rete.js Scope/Signal with simpler emit pattern.
 *
 * @module symbiote-ui/core/Editor
 */

import { Connection } from './Connection.js';
import { Node } from './Node.js';
import { Socket, Input, Output, InputControl } from './Socket.js';
import { Frame } from './Frame.js';

/**
 * @typedef {'nodecreate'|'nodecreated'|'noderemove'|'noderemoved'|
 *           'connectioncreate'|'connectioncreated'|'connectionremove'|'connectionremoved'|
 *           'framecreate'|'framecreated'|'frameremove'|'frameremoved'|
 *           'clear'|'cleared'|'nodeselect'|'nodedeselect'} EditorEvent
 */

export class NodeEditor {
  constructor() {
    /** @type {Map<string, import('./Node.js').Node>} */
    this.nodes = new Map();

    /** @type {Map<string, Connection>} */
    this.connections = new Map();

    /** @type {Map<string, import('./Frame.js').Frame>} */
    this.frames = new Map();

    /** @type {Object<string, Set<function>>} */
    this._listeners = {};
  }


  /**
   * Subscribe to editor event
   * @param {EditorEvent} event
   * @param {function} handler
   * @returns {function} Unsubscribe function
   */
  on(event, handler) {
    if (!this._listeners[event]) {
      this._listeners[event] = new Set();
    }
    this._listeners[event].add(handler);
    return () => this._listeners[event].delete(handler);
  }

  /**
   * Emit event to all listeners
   * @param {EditorEvent} event
   * @param {*} data
   * @returns {boolean} - false if any listener returned false (cancel)
   */
  emit(event, data) {
    let handlers = this._listeners[event];
    if (!handlers) return true;
    for (const handler of handlers) {
      if (handler(data) === false) return false;
    }
    return true;
  }

  /**
   * Remove all event listeners (for clean teardown)
   */
  removeAllListeners() {
    this._listeners = {};
  }


  /**
   * Get node by ID
   * @param {string} id
   * @returns {import('./Node.js').Node|undefined}
   */
  getNode(id) {
    return this.nodes.get(id);
  }

  /**
   * Get all nodes
   * @returns {import('./Node.js').Node[]}
   */
  getNodes() {
    return [...this.nodes.values()];
  }

  /**
   * Add node to editor
   * @param {import('./Node.js').Node} node
   * @returns {boolean}
   */
  addNode(node) {
    if (this.nodes.has(node.id)) throw new Error('node already added');
    if (!this.emit('nodecreate', node)) return false;
    this.nodes.set(node.id, node);
    this.emit('nodecreated', node);
    return true;
  }

  /**
   * Remove node and all its connections
   * @param {string} id
   * @returns {boolean}
   */
  removeNode(id) {
    let node = this.nodes.get(id);
    if (!node) throw new Error('node not found');
    if (!this.emit('noderemove', node)) return false;


    for (const [connId, conn] of this.connections) {
      if (conn.from === id || conn.to === id) {
        this.removeConnection(connId);
      }
    }

    this.nodes.delete(id);
    this.emit('noderemoved', node);
    return true;
  }


  /**
   * Get connection by ID
   * @param {string} id
   * @returns {Connection|undefined}
   */
  getConnection(id) {
    return this.connections.get(id);
  }

  /**
   * Get all connections
   * @returns {Connection[]}
   */
  getConnections() {
    return [...this.connections.values()];
  }

  /**
   * Get connections for a specific node
   * @param {string} nodeId
   * @returns {Connection[]}
   */
  getNodeConnections(nodeId) {
    return this.getConnections().filter((c) => c.from === nodeId || c.to === nodeId);
  }

  /**
   * Add connection
   * @param {Connection} connection
   * @returns {boolean}
   */
  addConnection(connection) {
    if (this.connections.has(connection.id)) throw new Error('connection already added');
    if (!this.emit('connectioncreate', connection)) return false;
    this.connections.set(connection.id, connection);
    this.emit('connectioncreated', connection);
    return true;
  }

  /**
   * Remove connection
   * @param {string} id
   * @returns {boolean}
   */
  removeConnection(id) {
    let conn = this.connections.get(id);
    if (!conn) return false;
    if (!this.emit('connectionremove', conn)) return false;
    this.connections.delete(id);
    this.emit('connectionremoved', conn);
    return true;
  }


  /**
   * Clear all nodes and connections
   * @returns {boolean}
   */
  clear() {
    if (!this.emit('clear', null)) return false;
    for (const id of [...this.connections.keys()]) {
      this.removeConnection(id);
    }
    for (const id of [...this.nodes.keys()]) {
      this.removeNode(id);
    }
    this.emit('cleared', null);
    return true;
  }


  /**
   * Get frame by ID
   * @param {string} id
   * @returns {import('./Frame.js').Frame|undefined}
   */
  getFrame(id) {
    return this.frames.get(id);
  }

  /**
   * Get all frames
   * @returns {import('./Frame.js').Frame[]}
   */
  getFrames() {
    return [...this.frames.values()];
  }

  /**
   * Add frame
   * @param {import('./Frame.js').Frame} frame
   * @returns {boolean}
   */
  addFrame(frame) {
    if (this.frames.has(frame.id)) throw new Error('frame already added');
    if (!this.emit('framecreate', frame)) return false;
    this.frames.set(frame.id, frame);
    this.emit('framecreated', frame);
    return true;
  }

  /**
   * Remove frame
   * @param {string} id
   * @returns {boolean}
   */
  removeFrame(id) {
    let frame = this.frames.get(id);
    if (!frame) return false;
    if (!this.emit('frameremove', frame)) return false;
    this.frames.delete(id);
    this.emit('frameremoved', frame);
    return true;
  }


  /**
   * Serialize editor state to symbiote-ui workflow JSON format.
   * Output is directly compatible with engine/Graph.fromJSON().
   * @param {Object<string, number[]>} [positions] - Node positions {nodeId: [x, y]}
   * @returns {object} Workflow JSON
   */
  toJSON(positions = {}) {
    return {
      version: 1,
      nodes: this.getNodes().map((n) => {
        let obj = {
          id: n.id,
          type: n.type,
          name: n.label,
          params: { ...n.params },
        };
        if (n.category && n.category !== 'default') obj.category = n.category;
        if (n.shape && n.shape !== 'rect') obj.shape = n.shape;
        if (n.icon) obj.icon = n.icon;
        if (n.cacheMode && n.cacheMode !== 'auto') obj.cacheMode = n.cacheMode;


        let inputs = Object.entries(n.inputs);
        if (inputs.length > 0) {
          obj.inputs = inputs.map(([key, inp]) => ({
            name: key,
            type: inp.socket?.name || 'any',
            label: inp.label || '',
          }));
        }
        let outputs = Object.entries(n.outputs);
        if (outputs.length > 0) {
          obj.outputs = outputs.map(([key, out]) => ({
            name: key,
            type: out.socket?.name || 'any',
            label: out.label || '',
          }));
        }
        return obj;
      }),
      connections: this.getConnections().map((c) => {
        let obj = {
          id: c.id,
          from: c.from,
          out: c.out,
          to: c.to,
          in: c.in,
        };
        if (c.kind !== undefined) obj.kind = c.kind;
        if (c.direction !== undefined) obj.direction = c.direction;
        if (c.design !== undefined) obj.design = c.design;
        return obj;
      }),
      frames: this.getFrames().map((f) => ({
        id: f.id,
        label: f.label,
        x: f.x,
        y: f.y,
        width: f.width,
        height: f.height,
        color: f.color,
      })),
      ui: {
        positions: { ...positions },
      },
    };
  }

  /**
   * Reconstruct editor state from symbiote-ui workflow JSON.
   * Enables round-trip: Editor → toJSON → fromJSON → Editor.
   * Also accepts output from engine/Graph.toJSON().
   * @param {object} data - Workflow JSON
   * @param {Object<string, number[]>} [positionsOut] - Optional object to populate with positions
   * @returns {NodeEditor} this
   */
  fromJSON(data, positionsOut) {

    this.nodes.clear();
    this.connections.clear();
    this.frames.clear();


    for (const nd of data.nodes || []) {
      let node = new Node(nd.name || nd.type, {
        id: nd.id,
        type: nd.type,
        category: nd.category || 'default',
        shape: nd.shape || 'rect',
        icon: nd.icon || '',
      });
      node.params = { ...nd.params };
      if (nd.cacheMode) node.cacheMode = nd.cacheMode;


      let driverParams = nd.driver?.params;
      if (driverParams && !nd.params) nd.params = {};
      if (driverParams) {
        for (const [key, def] of Object.entries(driverParams)) {
          if (!(key in nd.params) && def.default !== undefined) {
            nd.params[key] = def.default;
          }
        }
      }

      if (nd.params) {
        for (const [key, value] of Object.entries(nd.params)) {
          /** @type {'text'|'number'|'textarea'|'select'|'boolean'} */
          let controlType = 'text';
          let displayValue = value;
          let controlOptions = [];


          let paramMeta = driverParams?.[key];
          if (paramMeta?.type === 'boolean' || typeof value === 'boolean') {
            controlType = 'boolean';
          } else if (paramMeta?.type === 'number' || typeof value === 'number') {
            controlType = 'number';
          } else if (typeof value === 'string' && value.includes('\n')) {
            controlType = 'textarea';
          } else if (typeof value === 'object') {
            controlType = 'textarea';
            displayValue = JSON.stringify(value, null, 2);
          }


          if (paramMeta?.options) {
            controlType = 'select';
            controlOptions = paramMeta.options;
          }

          node.addControl(
            key,
            new InputControl(controlType, {
              initial: displayValue,
              label: paramMeta?.description || key,
              options: controlOptions,
            })
          );
        }
      }


      if (nd.inputs) {
        for (const inp of nd.inputs) {
          node.addInput(inp.name, new Input(new Socket(inp.type || 'any'), inp.label || ''));
        }
      }
      if (nd.outputs) {
        for (const out of nd.outputs) {
          node.addOutput(out.name, new Output(new Socket(out.type || 'any'), out.label || ''));
        }
      }

      this.nodes.set(node.id, node);
    }


    for (const cd of data.connections || []) {
      let srcNode = this.nodes.get(cd.from);
      let tgtNode = this.nodes.get(cd.to);
      if (!srcNode || !tgtNode) continue;


      if (!srcNode.outputs[cd.out]) {
        srcNode.addOutput(cd.out, new Output(new Socket('any'), cd.out));
      }
      if (!tgtNode.inputs[cd.in]) {
        tgtNode.addInput(cd.in, new Input(new Socket('any'), cd.in));
      }

      let conn = new Connection(srcNode, cd.out, tgtNode, cd.in);
      if (cd.id) conn.id = cd.id;
      if (cd.kind !== undefined) conn.kind = cd.kind;
      if (cd.direction !== undefined) conn.direction = cd.direction;
      if (cd.design !== undefined) conn.design = cd.design;
      this.connections.set(conn.id, conn);
    }


    for (const fd of data.frames || []) {
      let frame = new Frame(fd.label, {
        id: fd.id,
        x: fd.x,
        y: fd.y,
        width: fd.width,
        height: fd.height,
        color: fd.color,
      });
      this.frames.set(frame.id, frame);
    }


    if (positionsOut && data.ui?.positions) {
      Object.assign(positionsOut, data.ui.positions);
    }

    return this;
  }

  /**
   * Convert editor state to an engine Graph instance for server-side execution.
   * The Graph can be passed directly to Executor.run().
   * @param {Object<string, number[]>} [positions] - Node positions
   * @returns {Promise<import('symbiote-engine/Graph.js').Graph>}
   */
  async toGraph(positions = {}) {
    let { Graph } = await import('symbiote-engine/Graph.js');
    let json = this.toJSON(positions);
    return new Graph(json);
  }
}

export { NodeEditor as default };
