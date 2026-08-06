/**
 * @file xr/spherical-layout.js
 * @description Deterministic 3D spherical layout generator.
 * Supports sphere, shell, and clustered-shell distribution modes.
 */

/**
 * Distributes points on a sphere of radius r using Fibonacci spiral.
 *
 * @param {number} i - Point index.
 * @param {number} n - Total points.
 * @param {number} r - Radius.
 * @param {Array<number>} [center] - Center point.
 * @returns {Array<number>} [x, y, z] coordinate.
 */
function fibonacciSpherePoint(i, n, r, center = [0, 0, 0]) {
  if (n <= 1) return [...center];
  const phi = Math.acos(1 - 2 * (i + 0.5) / n);
  const theta = Math.PI * (1 + Math.sqrt(5)) * i;
  return [
    center[0] + Math.cos(theta) * Math.sin(phi) * r,
    center[1] + Math.sin(theta) * Math.sin(phi) * r,
    center[2] + Math.cos(phi) * r
  ];
}

/**
 * Generates a spherical 3D layout for a set of nodes and links.
 *
 * @param {Array} nodes - Array of nodes.
 * @param {Array} [links] - Array of links.
 * @param {Object} [options]
 * @param {string} [options.mode] - 'sphere' | 'shell' | 'clustered-shell'. Default: 'sphere'
 * @param {number} [options.radius] - Main sphere radius in meters. Default: 1.6
 * @param {Array<number>} [options.center] - Origin of the layout. Default: [0, 1.5, 0] (eye level)
 * @param {function} [options.category] - Accessor for grouping nodes in clustered mode.
 * @returns {Object} Layout output containing nodes, links, bounds, and diagnostics.
 */
export function createSphericalGraphLayout(nodes, links = [], options = {}) {
  const mode = options.mode || 'sphere';
  const radius = options.radius ?? 1.6;
  const center = options.center || [0, 1.55, 0]; // 1.55m is typical VR eye level
  const getCategory = options.category || ((d) => d.category ?? d.metadata?.category ?? d.type ?? 'default');

  const layoutNodes = nodes.map((node) => ({ ...node }));

  if (mode === 'sphere') {
    const nonFixed = layoutNodes.filter((n) => !n.fixed);
    const n = nonFixed.length;
    let nonFixedIndex = 0;

    for (let i = 0; i < layoutNodes.length; i++) {
      const node = layoutNodes[i];
      if (node.fixed) {
        if (!node.position) node.position = [0, 0, 0];
        continue;
      }
      node.position = fibonacciSpherePoint(nonFixedIndex++, n, radius, center);
    }
  } else if (mode === 'shell') {
    // Distribute nodes across 3 concentric shells based on index
    const nonFixed = layoutNodes.filter((n) => !n.fixed);
    const n = nonFixed.length;
    let nonFixedIndex = 0;

    for (let i = 0; i < layoutNodes.length; i++) {
      const node = layoutNodes[i];
      if (node.fixed) {
        if (!node.position) node.position = [0, 0, 0];
        continue;
      }

      // Determine shell layer
      const shellLayer = nonFixedIndex % 3; // 0 (inner), 1 (middle), 2 (outer)
      const shellRadius = radius * (1 + (shellLayer - 1) * 0.25); // e.g. 0.75r, 1r, 1.25r
      node.position = fibonacciSpherePoint(nonFixedIndex++, n, shellRadius, center);
    }
  } else if (mode === 'clustered-shell') {
    // Group nodes by category
    const nonFixed = layoutNodes.filter((n) => !n.fixed);
    const groups = new Map();
    for (const node of nonFixed) {
      const cat = getCategory(node);
      if (!groups.has(cat)) groups.set(cat, []);
      groups.get(cat).push(node);
    }

    // Distribute cluster centers on a sphere
    const categories = Array.from(groups.keys()).sort();
    const numClusters = categories.length;
    const clusterCenters = new Map();

    categories.forEach((cat, index) => {
      clusterCenters.set(cat, fibonacciSpherePoint(index, numClusters, radius, center));
    });

    // Distribute nodes in each cluster around its center
    for (let i = 0; i < layoutNodes.length; i++) {
      const node = layoutNodes[i];
      if (node.fixed) {
        if (!node.position) node.position = [0, 0, 0];
        continue;
      }

      const cat = getCategory(node);
      const cCenter = clusterCenters.get(cat);
      const members = groups.get(cat);
      const mIndex = members.indexOf(node);

      // Distribute on a small sphere around the cluster center
      const clusterRadius = radius * 0.25; // cluster spread
      node.position = fibonacciSpherePoint(mIndex, members.length, clusterRadius, cCenter);
    }
  }

  // Calculate bounding box
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

  for (const node of layoutNodes) {
    const [x, y, z] = node.position || [0, 0, 0];
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (z < minZ) minZ = z;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
    if (z > maxZ) maxZ = z;
  }

  return {
    nodes: layoutNodes,
    links,
    bounds: layoutNodes.length > 0 ? {
      min: [minX, minY, minZ],
      max: [maxX, maxY, maxZ]
    } : null,
    diagnostics: {
      mode,
      nodeCount: nodes.length,
      linkCount: links.length
    }
  };
}
