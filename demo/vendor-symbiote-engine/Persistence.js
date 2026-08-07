/**
 * Persistence.js - File-based graph save/load
 *
 * Serializes Graph to .workflow.json and loads it back.
 * Works in Node.js (fs) and browser (Blob/FileReader).
 *
 * @module symbiote-engine/Persistence
 */

import { Graph } from './Graph.js';

/**
 * Save graph to JSON string
 * @param {Graph} graph
 * @param {object} [options={}]
 * @param {boolean} [options.pretty=true] - Pretty-print JSON
 * @param {boolean} [options.includeOutput=false] - Include _output cache in export
 * @returns {string} JSON string
 */
export function serialize(graph, options = {}) {
  let { pretty = true, includeOutput = false } = options;
  let data = graph.toJSON();


  if (!includeOutput) {
    data.nodes = data.nodes.map((n) => {
      let rest = { ...n };
      delete rest._output;
      return rest;
    });
  }

  return JSON.stringify(data, null, pretty ? 2 : 0);
}

/**
 * Load graph from JSON string
 * @param {string} json
 * @returns {Graph}
 */
export function deserialize(json) {
  let data = JSON.parse(json);
  return new Graph(data);
}

/**
 * Save graph to file (Node.js)
 * @param {Graph} graph
 * @param {string} filePath
 * @param {object} [options]
 * @returns {Promise<void>}
 */
export async function saveToFile(graph, filePath, options) {
  let json = serialize(graph, options);
  let { writeFile } = await import('node:fs/promises');
  await writeFile(filePath, json, 'utf-8');
}

/**
 * Load graph from file (Node.js)
 * @param {string} filePath
 * @returns {Promise<Graph>}
 */
export async function loadFromFile(filePath) {
  let { readFile } = await import('node:fs/promises');
  let json = await readFile(filePath, 'utf-8');
  return deserialize(json);
}

/**
 * Download graph as file (Browser)
 * @param {Graph} graph
 * @param {string} [filename='graph.workflow.json']
 * @param {object} [options]
 */
export function downloadGraph(graph, filename = 'graph.workflow.json', options) {
  let json = serialize(graph, options);
  let blob = new Blob([json], { type: 'application/json' });
  let url = URL.createObjectURL(blob);
  let a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
