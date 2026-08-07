/**
 * Executor.js - Topological sort execution engine
 *
 * Executes a directed acyclic graph (DAG) of nodes using
 * Kahn's algorithm. Supports incremental execution,
 * cache, async node processing, dynamic sockets,
 * and compound node sub-graph execution.
 *
 * @module symbiote-engine/Executor
 */

import { getNodeType } from './Registry.js';
import { Graph } from './Graph.js';
import { runLifecycle } from './Lifecycle.js';

/**
 * @typedef {import('./Graph.js').Connection} Connection
 * @typedef {import('./Graph.js').GraphNode & {
 *   process?: (inputs: object, params?: object) => any|Promise<any>,
 *   _cacheHash?: string,
 *   _dynamicSockets?: any[]
 * }} ExecutableNode
 * @typedef {{nodeId: string, time: number, skipped: boolean, branchSkipped?: boolean, cached?: boolean, error?: string|null}} ExecutionLogEntry
 */

export class Executor {
  constructor() {
    /** @type {Map<string, any>} Cached outputs per node ID */
    this._cache = new Map();

    /** @type {Map<string, {key: string, outputs: object}>} Lifecycle cache store */
    this._lifecycleCache = new Map();

    /** @type {Set<string>} Nodes marked dirty (need re-execution) */
    this._dirty = new Set();

    /** @type {string|null} Currently executing node ID */
    this.currentNode = null;

    /** @type {ExecutionLogEntry[]} */
    this.executionLog = [];
  }

  /**
   * Execute a graph
   * @param {import('./Graph.js').Graph} graph
   * @param {object} [options={}]
   * @param {boolean} [options.cache=false] - Use incremental execution (skip unchanged)
   * @param {function} [options.onNodeStart] - Callback(nodeId, node)
   * @param {function} [options.onNodeComplete] - Callback(nodeId, output, timeMs)
   * @param {function} [options.onNodeSkipped] - Callback(nodeId) for cached nodes
   * @param {function} [options.onNodeCached] - Callback(nodeId, cacheHash) for lifecycle-cached
   * @param {AbortSignal} [options.signal] - Optional cancellation signal for lifecycle handlers
   * @param {number} [options.deadline] - Optional absolute deadline timestamp
   * @param {object} [options.context] - Host-provided runtime services for lifecycle handlers
   * @returns {Promise<{outputs: object, executionOrder: string[], log: Array, totalTime: number}>}
   */
  async run(graph, options = {}) {
    let {
      cache = false,
      onNodeStart,
      onNodeComplete,
      onNodeSkipped,
      onNodeCached,
      signal,
      deadline,
      context,
    } = options;
    let nodes = graph.nodes;

    let connections =
      graph.connections instanceof Map ? [...graph.connections.values()] : graph.connections;


    let order = this._topologicalSort(nodes, connections);


    let results = new Map();
    this.executionLog = [];

    for (const nodeId of order) {
      if (signal?.aborted) {
        throw new Error('Execution aborted');
      }
      if (deadline && Date.now() > deadline) {
        throw new Error('Execution deadline exceeded');
      }

      let node = /** @type {ExecutableNode} */ (nodes.get(nodeId));


      if (cache && !this._dirty.has(nodeId) && this._cache.has(nodeId)) {
        results.set(nodeId, this._cache.get(nodeId));
        this.executionLog.push({ nodeId, time: 0, skipped: true });
        if (onNodeSkipped) onNodeSkipped(nodeId);
        continue;
      }

      if (onNodeStart) onNodeStart(nodeId, node);
      this.currentNode = nodeId;
      let startTime = performance.now();


      let inputs = this._resolveInputs(nodeId, connections, results);


      let incomingConns = connections.filter((c) => c.to === nodeId);
      if (incomingConns.length > 0) {
        let allNull = incomingConns.every(
          (c) => inputs[c.in] === null || inputs[c.in] === undefined
        );

        let isMergeType = node.type === 'flow/merge' || node.type === 'flow/wait-all';
        if (allNull && !isMergeType) {
          node._output = null;
          results.set(nodeId, null);
          let elapsed = performance.now() - startTime;
          this.executionLog.push({ nodeId, time: elapsed, skipped: true, branchSkipped: true });
          if (onNodeSkipped) onNodeSkipped(nodeId);
          continue;
        }
      }


      let output;
      let typeDef = getNodeType(node.type);
      let lifecycleHooks = typeDef?.lifecycle;

      if (lifecycleHooks) {

        let cacheState = {
          mode: node.cacheMode || 'auto',
          store: this._lifecycleCache,
          nodeId,
        };

        let lifecycleResult = await runLifecycle(lifecycleHooks, inputs, node.params, cacheState, {
          signal,
          deadline,
          context,
        });

        if (lifecycleResult.error) {
          node._output = { _error: lifecycleResult.error };
          node._cacheHash = lifecycleResult.cacheHash;
          results.set(nodeId, node._output);
          let elapsed = performance.now() - startTime;
          this.executionLog.push({
            nodeId,
            time: elapsed,
            skipped: false,
            cached: false,
            error: lifecycleResult.error,
          });
          if (onNodeComplete) onNodeComplete(nodeId, node._output, elapsed);
          continue;
        }

        output = lifecycleResult.outputs;
        node._cacheHash = lifecycleResult.cacheHash;

        if (lifecycleResult.cached) {
          if (onNodeCached) onNodeCached(nodeId, lifecycleResult.cacheHash);
        }
      } else {


        let processFn = node.process || typeDef?.process;

        if (typeof processFn === 'function') {
          output = await processFn(inputs, { ...node.params, signal, deadline });
        } else {

          output = { ...node.params, ...inputs };
        }
      }


      if (output && output._subGraph) {
        output = await this._executeSubGraph(output._subGraph, inputs, node.params);
      }


      if (output && output.dynamicOutputs && Array.isArray(output.dynamicOutputs)) {
        node._dynamicSockets = output.dynamicOutputs;
      }


      node._output = output;

      results.set(nodeId, output);
      this._cache.set(nodeId, output);
      this._dirty.delete(nodeId);

      let elapsed = performance.now() - startTime;
      this.executionLog.push({ nodeId, time: elapsed, skipped: false });

      if (onNodeComplete) onNodeComplete(nodeId, output, elapsed);
    }

    this.currentNode = null;


    let outputNodeIds = this._findOutputNodes(nodes, connections);
    let outputs = {};
    for (const id of outputNodeIds) {
      outputs[id] = results.get(id);
    }

    return {
      outputs,
      executionOrder: order,
      log: this.executionLog,
      totalTime: this.executionLog.reduce((sum, e) => sum + e.time, 0),
    };
  }

  /**
   * Mark a node as dirty (needs re-execution)
   * Propagates downstream
   * @param {string} nodeId
   * @param {import('./Graph.js').Connection[]} connections
   */
  markDirty(nodeId, connections) {
    if (this._dirty.has(nodeId)) return;
    this._dirty.add(nodeId);
    for (const conn of connections) {
      if (conn.from === nodeId) {
        this.markDirty(conn.to, connections);
      }
    }
  }

  /**
   * Clear all caches
   */
  clearCache() {
    this._cache.clear();
    this._lifecycleCache.clear();
    this._dirty.clear();
  }

  /**
   * Topological sort using Kahn's algorithm
   * @param {Map<string, object>} nodes
   * @param {Array<{from: string, to: string}>} connections
   * @returns {string[]} Node IDs in execution order
   * @private
   */
  _topologicalSort(nodes, connections) {
    let inDegree = new Map();
    let adjacency = new Map();


    let connectedIds = new Set();
    for (const conn of connections) {
      connectedIds.add(conn.from);
      connectedIds.add(conn.to);
    }


    for (const id of nodes.keys()) {
      if (connectedIds.has(id) || !connections.some((c) => c.to === id || c.from === id)) {

      }
    }

    for (const id of connectedIds) {
      if (!nodes.has(id)) continue;
      inDegree.set(id, 0);
      adjacency.set(id, []);
    }


    for (const id of nodes.keys()) {
      if (!connectedIds.has(id)) continue;
      if (!inDegree.has(id)) {
        inDegree.set(id, 0);
        adjacency.set(id, []);
      }
    }

    for (const conn of connections) {
      if (!adjacency.has(conn.from) || !inDegree.has(conn.to)) continue;
      adjacency.get(conn.from).push(conn.to);
      inDegree.set(conn.to, (inDegree.get(conn.to) || 0) + 1);
    }


    let queue = [];
    for (const [id, degree] of inDegree) {
      if (degree === 0) queue.push(id);
    }

    let result = [];
    while (queue.length > 0) {
      let nodeId = queue.shift();
      result.push(nodeId);
      for (const neighbor of adjacency.get(nodeId) || []) {
        let nd = inDegree.get(neighbor) - 1;
        inDegree.set(neighbor, nd);
        if (nd === 0) queue.push(neighbor);
      }
    }


    let connectedCount = inDegree.size;
    if (result.length < connectedCount) {
      let remaining = [...inDegree.keys()].filter((id) => !result.includes(id));
      throw new Error(`Graph contains cycle(s). Nodes involved: ${remaining.join(', ')}`);
    }

    return result;
  }

  /**
   * Resolve inputs for a node from upstream connections
   * @param {string} nodeId
   * @param {Array<{from: string, out: string, to: string, in: string}>} connections
   * @param {Map<string, any>} results
   * @returns {object}
   * @private
   */
  _resolveInputs(nodeId, connections, results) {
    let inputs = {};
    for (const conn of connections) {
      if (conn.to !== nodeId) continue;
      let upstream = results.get(conn.from);
      if (upstream === undefined) continue;

      let value;
      if (upstream && typeof upstream === 'object' && conn.out in upstream) {
        value = upstream[conn.out];
      } else if (upstream && typeof upstream === 'object' && upstream.dynamicOutputs) {

        value = null;
      } else {
        value = upstream;
      }


      if (inputs[conn.in] !== undefined && inputs[conn.in] !== null) continue;
      inputs[conn.in] = value;
    }
    return inputs;
  }

  /**
   * Find output nodes (no outgoing connections)
   * @param {Map<string, object>} nodes
   * @param {Array<{from: string, to: string}>} connections
   * @returns {string[]}
   * @private
   */
  _findOutputNodes(nodes, connections) {
    let hasOutgoing = new Set();
    for (const conn of connections) {
      hasOutgoing.add(conn.from);
    }
    let connected = new Set();
    for (const conn of connections) {
      connected.add(conn.from);
      connected.add(conn.to);
    }
    return [...connected].filter((id) => !hasOutgoing.has(id) && nodes.has(id));
  }

  /**
   * Execute a compound node's sub-graph
   * @param {object} subGraphData - Sub-graph JSON definition
   * @param {object} parentInputs - Inputs from parent graph
   * @param {object} parentParams - Parent node params
   * @returns {Promise<object>} Merged outputs from sub-graph output nodes
   * @private
   */
  async _executeSubGraph(subGraphData, parentInputs, parentParams) {
    let subGraph = new Graph(subGraphData);


    for (const rawNode of subGraph.nodes.values()) {
      let node = /** @type {ExecutableNode} */ (rawNode);
      if (node.type === 'compound/input') {
        let injectedOutput = { ...parentInputs, ...parentParams };
        node._output = injectedOutput;
        node.process = () => injectedOutput;
      }
    }


    let subExecutor = new Executor();
    let result = await subExecutor.run(subGraph);


    let merged = {};
    for (const [id, output] of Object.entries(result.outputs)) {
      let node = subGraph.getNode(id);
      if (node.type === 'compound/output' && output) {
        Object.assign(merged, output);
      }
    }


    if (Object.keys(merged).length > 0) {
      merged.dynamicOutputs = Object.keys(merged);
    }

    return merged;
  }
}
