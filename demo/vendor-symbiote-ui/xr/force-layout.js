/**
 * @file xr/force-layout.js
 * @description 3D force-directed layout simulation.
 * Implementation is dependency-free and uses createOctree for Barnes-Hut.
 */

import { createOctree } from './spatial-index.js';

export function createSimulation(nodes = []) {
  let alpha = 1;
  let alphaMin = 0.001;
  let alphaDecay = 1 - Math.pow(alphaMin, 1 / 300);
  let alphaTarget = 0;
  let velocityDecay = 0.6;
  let simNodes = [];
  const forces = new Map();

  function initializeNode(node) {
    if (node.x === undefined || isNaN(node.x)) node.x = (Math.random() - 0.5) * 10;
    if (node.y === undefined || isNaN(node.y)) node.y = (Math.random() - 0.5) * 10;
    if (node.z === undefined || isNaN(node.z)) node.z = (Math.random() - 0.5) * 10;
    if (node.vx === undefined) node.vx = 0;
    if (node.vy === undefined) node.vy = 0;
    if (node.vz === undefined) node.vz = 0;
  }

  function setNodes(newNodes) {
    simNodes = newNodes;
    for (const node of simNodes) {
      initializeNode(node);
    }
    for (const force of forces.values()) {
      if (force.initialize) force.initialize(simNodes);
    }
    return simulation;
  }

  function tick() {
    alpha += (alphaTarget - alpha) * alphaDecay;

    for (const force of forces.values()) {
      force(alpha);
    }

    for (const node of simNodes) {
      if (node.fixed) {
        node.vx = 0;
        node.vy = 0;
        node.vz = 0;
        continue;
      }
      node.vx *= velocityDecay;
      node.vy *= velocityDecay;
      node.vz *= velocityDecay;
      node.x += node.vx;
      node.y += node.vy;
      node.z += node.vz;
    }

    return simulation;
  }

  const simulation = {
    tick,
    nodes: (newNodes) => (newNodes === undefined ? simNodes : setNodes(newNodes)),
    alpha: (val) => (val === undefined ? alpha : (alpha = +val, simulation)),
    alphaMin: (val) => (val === undefined ? alphaMin : (alphaMin = +val, simulation)),
    alphaDecay: (val) => (val === undefined ? alphaDecay : (alphaDecay = +val, simulation)),
    alphaTarget: (val) => (val === undefined ? alphaTarget : (alphaTarget = +val, simulation)),
    velocityDecay: (val) => (val === undefined ? velocityDecay : (velocityDecay = +val, simulation)),
    force: (name, force) => {
      if (force === undefined) return forces.get(name);
      if (force === null) forces.delete(name);
      else {
        forces.set(name, force);
        if (force.initialize) force.initialize(simNodes);
      }
      return simulation;
    }
  };

  if (nodes.length > 0) {
    setNodes(nodes);
  }

  return simulation;
}

/**
 * 3D Centering force.
 */
export function forceCenter3D(x = 0, y = 0, z = 0) {
  let nodes = [];

  function force() {
    let sx = 0, sy = 0, sz = 0;
    const n = nodes.length;
    if (n === 0) return;

    for (const node of nodes) {
      sx += node.x;
      sy += node.y;
      sz += node.z;
    }

    sx = sx / n - x;
    sy = sy / n - y;
    sz = sz / n - z;

    for (const node of nodes) {
      if (node.fixed) continue;
      node.x -= sx;
      node.y -= sy;
      node.z -= sz;
    }
  }

  force.initialize = (newNodes) => {
    nodes = newNodes;
  };

  return force;
}

/**
 * 3D Link spring force.
 */
export function forceLink3D(links = []) {
  let nodes = [];
  let nodeMap = new Map();
  let strengths = [];
  let distances = [];
  let bias = [];

  function initialize(newNodes) {
    nodes = newNodes;
    nodeMap.clear();
    for (const node of nodes) {
      nodeMap.set(node.id, node);
    }

    const n = links.length;
    strengths = new Array(n);
    distances = new Array(n);
    bias = new Array(n);

    // Calculate bias for link points
    const count = new Array(nodes.length).fill(0);
    const nodeIndexMap = new Map(nodes.map((node, i) => [node.id, i]));

    for (let i = 0; i < n; i++) {
      const link = links[i];
      const sourceId = typeof link.source === 'object' ? link.source.id : link.source;
      const targetId = typeof link.target === 'object' ? link.target.id : link.target;

      const sourceIndex = nodeIndexMap.get(sourceId);
      const targetIndex = nodeIndexMap.get(targetId);

      if (sourceIndex !== undefined) count[sourceIndex]++;
      if (targetIndex !== undefined) count[targetIndex]++;
    }

    for (let i = 0; i < n; i++) {
      const link = links[i];
      const sourceId = typeof link.source === 'object' ? link.source.id : link.source;
      const targetId = typeof link.target === 'object' ? link.target.id : link.target;

      const sourceIndex = nodeIndexMap.get(sourceId);
      const targetIndex = nodeIndexMap.get(targetId);

      bias[i] = sourceIndex === undefined || targetIndex === undefined ? 0.5 :
        count[sourceIndex] / (count[sourceIndex] + count[targetIndex]);

      strengths[i] = link.strength ?? (1 / Math.min(count[sourceIndex] || 1, count[targetIndex] || 1));
      distances[i] = link.distance ?? 1.2; // default spring distance in meters
    }
  }

  function force(alpha) {
    for (let i = 0; i < links.length; i++) {
      const link = links[i];
      const sourceId = typeof link.source === 'object' ? link.source.id : link.source;
      const targetId = typeof link.target === 'object' ? link.target.id : link.target;

      const source = nodeMap.get(sourceId);
      const target = nodeMap.get(targetId);

      if (!source || !target) continue;

      let dx = target.x + target.vx - (source.x + source.vx);
      let dy = target.y + target.vy - (source.y + source.vy);
      let dz = target.z + target.vz - (source.z + source.vz);

      let l = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (l === 0) {
        dx = (Math.random() - 0.5) * 1e-6;
        dy = (Math.random() - 0.5) * 1e-6;
        dz = (Math.random() - 0.5) * 1e-6;
        l = Math.sqrt(dx * dx + dy * dy + dz * dz);
      }

      const strength = strengths[i];
      const distance = distances[i];
      const b = bias[i];

      const k = ((l - distance) / l) * alpha * strength;
      const x = dx * k;
      const y = dy * k;
      const z = dz * k;

      if (!target.fixed) {
        target.vx -= x * b;
        target.vy -= y * b;
        target.vz -= z * b;
      }
      if (!source.fixed) {
        source.vx += x * (1 - b);
        source.vy += y * (1 - b);
        source.vz += z * (1 - b);
      }
    }
  }

  force.initialize = initialize;
  return force;
}

/**
 * 3D Many-Body repulsion using Barnes-Hut via Octree.
 */
export function forceManyBody3D() {
  let nodes = [];
  let strength = -3.5; // repulsion strength
  let theta2 = 0.81; // Barnes-Hut threshold theta^2 (0.9^2)
  let distanceMin2 = 0.01;
  let distanceMax2 = Infinity;

  function force(alpha) {
    const n = nodes.length;
    if (n === 0) return;

    // Build Octree
    const tree = createOctree({
      x: (d) => d.x,
      y: (d) => d.y,
      z: (d) => d.z
    });
    tree.insertAll(nodes);

    // Compute center of mass for all nodes (accumulate in internal nodes)
    accumulate(tree.root);

    for (let i = 0; i < n; i++) {
      const node = nodes[i];
      if (node.fixed) continue;

      tree.visit((quad, x0, y0, z0, x1, y1, z1, isLeaf) => {
        if (!quad.value) return true; // Empty node

        let dx = quad.cx - node.x;
        let dy = quad.cy - node.y;
        let dz = quad.cz - node.z;
        let w = x1 - x0;
        let r2 = dx * dx + dy * dy + dz * dz;

        // Use Barnes-Hut approximation if cell is far enough
        if (w * w / theta2 < r2) {
          if (r2 < distanceMax2) {
            if (r2 < distanceMin2) r2 = Math.sqrt(distanceMin2 * r2);
            const k = strength * quad.value * alpha / r2;
            node.vx += dx * k;
            node.vy += dy * k;
            node.vz += dz * k;
          }
          return true; // Skip children
        }

        // Otherwise, if leaf or too close, evaluate directly
        if (isLeaf) {
          let q = quad;
          do {
            if (q.data !== node) {
              let dx2 = q.x - node.x;
              let dy2 = q.y - node.y;
              let dz2 = q.z - node.z;
              let r2_2 = dx2 * dx2 + dy2 * dy2 + dz2 * dz2;

              if (r2_2 < distanceMax2) {
                if (r2_2 < distanceMin2) r2_2 = Math.sqrt(distanceMin2 * r2_2);
                const k = strength * alpha / r2_2;
                node.vx += dx2 * k;
                node.vy += dy2 * k;
                node.vz += dz2 * k;
              }
            }
          } while ((q = q.next));
        }
        return false;
      });
    }
  }

  function accumulate(node) {
    if (!node) return;
    if (Array.isArray(node)) {
      let value = 0;
      let cx = 0, cy = 0, cz = 0;
      for (let i = 0; i < 8; i++) {
        const child = node[i];
        if (child) {
          accumulate(child);
          const weight = child.value || 0;
          value += weight;
          cx += weight * (child.cx || child.x);
          cy += weight * (child.cy || child.y);
          cz += weight * (child.cz || child.z);
        }
      }
      node.value = value;
      node.cx = cx / value;
      node.cy = cy / value;
      node.cz = cz / value;
    } else {
      let value = 1;
      let cx = node.x;
      let cy = node.y;
      let cz = node.z;
      let next = node.next;
      while (next) {
        value++;
        cx += next.x;
        cy += next.y;
        cz += next.z;
        next = next.next;
      }
      node.value = value;
      node.cx = cx / value;
      node.cy = cy / value;
      node.cz = cz / value;
    }
  }

  force.initialize = (newNodes) => {
    nodes = newNodes;
  };

  force.strength = (val) => (val === undefined ? strength : (strength = +val, force));
  force.theta = (val) => (val === undefined ? Math.sqrt(theta2) : (theta2 = val * val, force));

  return force;
}

/**
 * 3D Category / Cluster force.
 * Pulls nodes belonging to the same cluster / category toward their center of gravity.
 */
export function forceCluster3D() {
  let nodes = [];
  let strength = 0.15;
  let categoryAccessor = (d) => d.category ?? d.metadata?.category ?? d.type;

  function force(alpha) {
    const groups = new Map();
    for (const node of nodes) {
      const cat = categoryAccessor(node);
      if (!groups.has(cat)) groups.set(cat, []);
      groups.get(cat).push(node);
    }

    for (const [cat, members] of groups.entries()) {
      let cx = 0, cy = 0, cz = 0;
      const n = members.length;
      if (n === 0) continue;

      for (const node of members) {
        cx += node.x;
        cy += node.y;
        cz += node.z;
      }

      cx /= n;
      cy /= n;
      cz /= n;

      for (const node of members) {
        if (node.fixed) continue;
        node.vx += (cx - node.x) * alpha * strength;
        node.vy += (cy - node.y) * alpha * strength;
        node.vz += (cz - node.z) * alpha * strength;
      }
    }
  }

  force.initialize = (newNodes) => {
    nodes = newNodes;
  };

  force.strength = (val) => (val === undefined ? strength : (strength = +val, force));
  force.category = (accessor) => (accessor === undefined ? categoryAccessor : (categoryAccessor = accessor, force));

  return force;
}
