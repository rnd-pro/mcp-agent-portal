/**
 * @file xr/force-layout-adapter.js
 * @description Adapter connecting NodeEditor to 3D Force-Directed Layout.
 */

import {
  createSimulation,
  forceCenter3D,
  forceLink3D,
  forceManyBody3D,
  forceCluster3D
} from './force-layout.js';

/**
 * Creates a 3D force layout simulation adapter for a NodeEditor.
 *
 * @param {import('../core/Editor.js').NodeEditor} editor - NodeEditor instance.
 * @param {Object} [options]
 * @param {number} [options.strength] - ManyBody strength.
 * @param {number} [options.distance] - Link target distance.
 * @param {boolean} [options.useCluster] - Enable category/cluster force.
 * @returns {Object} Adapter instance with simulation control methods.
 */
export function createForceLayoutAdapter(editor, options = {}) {
  const nodes = editor.getNodes().map((node) => {
    // Preserve existing coordinates if available
    const x = typeof node.x === 'number' && !isNaN(node.x) ? node.x : (Math.random() - 0.5) * 5;
    const y = typeof node.y === 'number' && !isNaN(node.y) ? node.y : (Math.random() - 0.5) * 5;
    const z = typeof node.z === 'number' && !isNaN(node.z) ? node.z : (Math.random() - 0.5) * 5;

    return {
      id: node.id,
      x,
      y,
      z,
      vx: 0,
      vy: 0,
      vz: 0,
      fixed: node.fixed || false,
      category: node.category,
      type: node.type,
      node // Reference back to the original Node instance
    };
  });

  const links = Array.from(editor.connections.values()).map((conn) => {
    return {
      id: conn.id,
      source: conn.from,
      target: conn.to,
      strength: 1,
      distance: options.distance ?? 1.2
    };
  });

  const sim = createSimulation(nodes);

  sim.force('center', forceCenter3D(0, 0, 0));
  sim.force('charge', forceManyBody3D().strength(options.strength ?? -3.5));
  sim.force('link', forceLink3D(links));

  if (options.useCluster !== false) {
    sim.force('cluster', forceCluster3D().strength(0.15));
  }

  function tick() {
    sim.tick();
    // Synchronize 3D coordinates back to the original NodeEditor nodes
    for (const simNode of nodes) {
      simNode.node.x = simNode.x;
      simNode.node.y = simNode.y;
      simNode.node.z = simNode.z;
    }
  }

  return {
    simulation: sim,
    tick,
    getNodes: () => nodes,
    getLinks: () => links,
    updatePositions: () => {
      for (const simNode of nodes) {
        simNode.node.x = simNode.x;
        simNode.node.y = simNode.y;
        simNode.node.z = simNode.z;
      }
    }
  };
}
