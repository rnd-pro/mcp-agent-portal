/**
 * Graph.js - Universal graph data model
 *
 * Stores nodes and connections. Provides CRUD operations
 * for AI agents and programmatic graph construction.
 *
 * @module symbiote-engine/Graph */

import { nanoid } from './nanoid.js';
import { getNodeType, registerCustomDrivers } from './Registry.js';
import { areSocketsCompatible } from './SocketTypes.js';

/**
 * @typedef {object} GraphNode
 * @property {string} id - Unique node ID (nd_ prefix)
 * @property {string} type - Node type identifier
 * @property {string} [name] - Human-readable label
 * @property {object} params - Node parameters
 * @property {'auto'|'freeze'|'force'} [cacheMode='auto'] - Cache behavior mode
 * @property {object} [_output] - Cached execution output
 * @property {object} [_meta] - Metadata (variant flags, etc.)
 * @property {object} [driver] - Inline custom driver definition
 * @property {object} [subgraph] - Inline compound sub-graph definition
 */

/**
 * @typedef {object} Connection
 * @property {string} from - Source node ID
 * @property {string} out - Source output socket name
 * @property {string} to - Target node ID
 * @property {string} in - Target input socket name
 * @property {string} [type] - Semantic connection type (for knowledge graphs)
 * @property {string} [label] - Human-readable connection label
 */

export class Graph {
  /**
   * @param {object} [data] - Optional workflow JSON to load
   */
  constructor(data) {
    /** @type {string} */
    this.id = `wf_${nanoid()}`;

    /** @type {string} */
    this.name = 'Untitled';

    /** @type {number} */
    this.version = 1;

    /** @type {object} */
    this.execution = { mode: 'sync', cache: true };

    /** @type {Map<string, GraphNode>} */
    this.nodes = new Map();

    /** @type {Connection[]} */
    this.connections = [];

    /** @type {object} */
    this.ui = { positions: {}, zoom: 1.0, pan: [0, 0] };

    if (data) {
      this.fromJSON(data);
    }
  }

  /**
   * Add a node to the graph
   * @param {string} type - Node type (e.g., 'ai/llm')
   * @param {object} [params={}] - Node parameters
   * @param {object} [options={}] - Additional options
   * @param {string} [options.id] - Custom node ID
   * @param {string} [options.name] - Human-readable name
   * @param {number[]} [options.position] - [x, y] position for UI
   * @param {'auto'|'freeze'|'force'} [options.cacheMode='auto'] - Cache mode
   * @returns {string} Node ID
   */
  addNode(type, params = {}, options = {}) {
    let id = options.id || `nd_${nanoid()}`;

    let typeDef = getNodeType(type);


    let mergedParams = { ...params };
    if (typeDef?.driver?.params) {
      for (const [key, paramDef] of Object.entries(typeDef.driver.params)) {
        if (mergedParams[key] === undefined && paramDef.default !== undefined) {
          mergedParams[key] = paramDef.default;
        }
      }
    }

    /** @type {GraphNode} */
    let node = {
      id,
      type,
      name: options.name || typeDef?.driver?.description?.slice(0, 30) || type,
      params: mergedParams,
      cacheMode: options.cacheMode || 'auto',
    };

    this.nodes.set(id, node);

    if (options.position) {
      this.ui.positions[id] = options.position;
    }

    return id;
  }

  /**
   * Remove a node and all its connections
   * @param {string} id - Node ID
   * @returns {boolean}
   */
  removeNode(id) {
    if (!this.nodes.has(id)) return false;
    this.nodes.delete(id);
    this.connections = this.connections.filter((c) => c.from !== id && c.to !== id);
    delete this.ui.positions[id];
    return true;
  }

  /**
   * Connect two nodes
   * @param {string} fromNode - Source node ID
   * @param {string} fromSocket - Source output socket name
   * @param {string} toNode - Target node ID
   * @param {string} toSocket - Target input socket name
   * @param {object} [options={}]
   * @param {string} [options.type] - Semantic connection type
   * @param {string} [options.label] - Human-readable label
   * @returns {Connection}
   */
  connect(fromNode, fromSocket, toNode, toSocket, options = {}) {
    if (!this.nodes.has(fromNode)) throw new Error(`Source node "${fromNode}" not found`);
    if (!this.nodes.has(toNode)) throw new Error(`Target node "${toNode}" not found`);


    let fromType = getNodeType(this.nodes.get(fromNode).type);
    let toType = getNodeType(this.nodes.get(toNode).type);

    if (fromType?.driver?.outputs && toType?.driver?.inputs) {
      let outDef = fromType.driver.outputs.find((o) => o.name === fromSocket);
      let inDef = toType.driver.inputs.find((i) => i.name === toSocket);

      if (outDef && inDef && !areSocketsCompatible(outDef.type, inDef.type)) {
        throw new Error(
          `Socket type mismatch: ${outDef.type} → ${inDef.type} (${fromNode}.${fromSocket} → ${toNode}.${toSocket})`
        );
      }
    }

    /** @type {Connection} */
    let conn = {
      from: fromNode,
      out: fromSocket,
      to: toNode,
      in: toSocket,
    };

    if (options.type) conn.type = options.type;
    if (options.label) conn.label = options.label;

    this.connections.push(conn);
    return conn;
  }

  /**
   * Disconnect two nodes
   * @param {string} fromNode
   * @param {string} fromSocket
   * @param {string} toNode
   * @param {string} toSocket
   * @returns {boolean}
   */
  disconnect(fromNode, fromSocket, toNode, toSocket) {
    let idx = this.connections.findIndex(
      (c) => c.from === fromNode && c.out === fromSocket && c.to === toNode && c.in === toSocket
    );
    if (idx === -1) return false;
    this.connections.splice(idx, 1);
    return true;
  }

  /**
   * Get a node by ID
   * @param {string} id
   * @returns {GraphNode|undefined}
   */
  getNode(id) {
    return this.nodes.get(id);
  }

  /**
   * Update node parameters
   * @param {string} id
   * @param {object} params - Params to merge
   * @returns {GraphNode}
   */
  updateParams(id, params) {
    let node = this.nodes.get(id);
    if (!node) throw new Error(`Node "${id}" not found`);
    node.params = { ...node.params, ...params };
    return node;
  }

  /**
   * Set cache mode for a node
   * @param {string} id - Node ID
   * @param {'auto'|'freeze'|'force'} mode
   */
  setCacheMode(id, mode) {
    let node = this.nodes.get(id);
    if (!node) throw new Error(`Node "${id}" not found`);
    if (!['auto', 'freeze', 'force'].includes(mode)) {
      throw new Error(`Invalid cache mode: ${mode}. Must be auto, freeze, or force`);
    }
    node.cacheMode = mode;
  }

  /**
   * Get orphan nodes (not connected to anything)
   * @returns {GraphNode[]}
   */
  getOrphans() {
    let connected = new Set();
    for (const c of this.connections) {
      connected.add(c.from);
      connected.add(c.to);
    }
    return [...this.nodes.values()].filter((n) => !connected.has(n.id));
  }

  /**
   * Serialize graph to JSON
   * @returns {object}
   */
  toJSON() {
    return {
      version: this.version,
      id: this.id,
      name: this.name,
      execution: this.execution,
      nodes: [...this.nodes.values()].map((n) => {
        let obj = { id: n.id, type: n.type, name: n.name, params: n.params };
        if (n.cacheMode && n.cacheMode !== 'auto') obj.cacheMode = n.cacheMode;
        if (n._output) obj._output = n._output;
        if (n._meta) obj._meta = n._meta;
        if (n.driver) obj.driver = n.driver;
        if (n.subgraph) obj.subgraph = n.subgraph;
        return obj;
      }),
      connections: this.connections,
      ui: this.ui,
    };
  }

  /**
   * Load graph from JSON
   * @param {object} data - Workflow JSON
   * @returns {Graph} this
   */
  fromJSON(data) {
    this.version = data.version || 1;
    this.id = data.id || this.id;
    this.name = data.name || 'Untitled';
    this.execution = data.execution || { mode: 'sync', cache: true };
    this.ui = data.ui || { positions: {}, zoom: 1.0, pan: [0, 0] };


    if (data.customDrivers) {
      registerCustomDrivers(data.customDrivers);
    }


    this.nodes.clear();
    for (const n of data.nodes || []) {
      let node = {
        id: n.id,
        type: n.type,
        name: n.name,
        params: n.params || {},
        cacheMode: n.cacheMode || 'auto',
      };
      if (n._output) node._output = n._output;
      if (n._meta) node._meta = n._meta;
      if (n.driver) node.driver = n.driver;
      if (n.subgraph) node.subgraph = n.subgraph;
      this.nodes.set(n.id, node);
    }


    this.connections = (data.connections || []).map((c) => {
      let conn = {
        from: c.from,
        out: c.out || c.fromSocket,
        to: c.to,
        in: c.in || c.toSocket,
      };
      if (c.type) conn.type = c.type;
      if (c.label) conn.label = c.label;
      return conn;
    });

    return this;
  }

  /**
   * Get execution statistics
   * @returns {object}
   */
  stats() {
    let types = new Set();
    for (const n of this.nodes.values()) types.add(n.type);
    return {
      totalNodes: this.nodes.size,
      totalConnections: this.connections.length,
      orphans: this.getOrphans().length,
      uniqueTypes: types.size,
    };
  }
}
