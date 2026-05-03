/**
 * Compacts disconnected graph components by stacking them vertically below the main cluster.
 * @param {import('symbiote-node').NodeEditor} editor 
 * @param {Record<string, {x: number, y: number}>} positions 
 * @returns {Record<string, {x: number, y: number}>} Updated positions
 */
export function compactDisconnectedComponents(editor, positions) {
  const nodes = editor.getNodes();
  const conns = editor.getConnections();
  if (nodes.length < 2) return positions;

  // Build adjacency list (undirected)
  const adj = new Map();
  for (const n of nodes) adj.set(n.id, []);
  for (const c of conns) {
    if (adj.has(c.from)) adj.get(c.from).push(c.to);
    if (adj.has(c.to)) adj.get(c.to).push(c.from);
  }

  // BFS to find connected components
  const visited = new Set();
  const components = [];
  for (const n of nodes) {
    if (visited.has(n.id)) continue;
    const component = [];
    const queue = [n.id];
    visited.add(n.id);
    while (queue.length > 0) {
      const id = queue.shift();
      component.push(id);
      for (const neighbor of (adj.get(id) || [])) {
        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          queue.push(neighbor);
        }
      }
    }
    components.push(component);
  }

  // Only one component — nothing to compact
  if (components.length <= 1) return positions;

  // Sort by size desc — largest is the main cluster
  components.sort((a, b) => b.length - a.length);

  // Compute bounding box for each component
  const GAP = 200; // gap between stacked components
  const bboxes = components.map(comp => {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const id of comp) {
      const p = positions[id];
      if (!p) continue;
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x + 180 > maxX) maxX = p.x + 180; // approx node width
      if (p.y + 60 > maxY) maxY = p.y + 60;   // approx node height
    }
    return { minX, minY, maxX, maxY, w: maxX - minX, h: maxY - minY };
  });

  // Main cluster stays in place. Stack others below it.
  const mainBBox = bboxes[0];
  let cursorY = mainBBox.maxY + GAP;

  for (let i = 1; i < components.length; i++) {
    const comp = components[i];
    const bbox = bboxes[i];
    if (bbox.minX === Infinity) continue; // no positions

    // Offset: shift to align left with main cluster, below current cursor
    const dx = mainBBox.minX - bbox.minX;
    const dy = cursorY - bbox.minY;

    for (const id of comp) {
      if (positions[id]) {
        positions[id] = {
          x: positions[id].x + dx,
          y: positions[id].y + dy,
        };
      }
    }
    cursorY += bbox.h + GAP;
  }

  return positions;
}
