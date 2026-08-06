/**
 * @file xr/spatial-index.js
 * @description Octree spatial index for 3D point data.
 * Supports insert, remove, range query, nearest neighbor, and breadth-first traversal.
 *
 * Algorithm adapted from d3-octree (BSD-3-Clause) by Mike Bostock / Vasco Asturiano.
 * Rewritten as dependency-free vanilla JS for symbiote-ui.
 */

function numberOr(value, fallback) {
  let n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function octantIndex(x, y, z, mx, my, mz) {
  return (z >= mz ? 4 : 0) | (y >= my ? 2 : 0) | (x >= mx ? 1 : 0);
}

function isLeaf(node) {
  return node !== null && typeof node === 'object' && !Array.isArray(node) && 'data' in node;
}

function isInternal(node) {
  return Array.isArray(node);
}

function createInternalNode() {
  return [null, null, null, null, null, null, null, null];
}

function distanceSquared3(ax, ay, az, bx, by, bz) {
  let dx = ax - bx;
  let dy = ay - by;
  let dz = az - bz;
  return dx * dx + dy * dy + dz * dz;
}

function boxContains(x0, y0, z0, x1, y1, z1, px, py, pz) {
  return px >= x0 && px <= x1 && py >= y0 && py <= y1 && pz >= z0 && pz <= z1;
}

function boxIntersects(ax0, ay0, az0, ax1, ay1, az1, bx0, by0, bz0, bx1, by1, bz1) {
  return ax0 <= bx1 && ax1 >= bx0 && ay0 <= by1 && ay1 >= by0 && az0 <= bz1 && az1 >= bz0;
}

function boxDistanceSquared(px, py, pz, bx0, by0, bz0, bx1, by1, bz1) {
  let dx = px < bx0 ? bx0 - px : px > bx1 ? px - bx1 : 0;
  let dy = py < by0 ? by0 - py : py > by1 ? py - by1 : 0;
  let dz = pz < bz0 ? bz0 - pz : pz > bz1 ? pz - bz1 : 0;
  return dx * dx + dy * dy + dz * dz;
}

/**
 * Create an octree spatial index.
 *
 * @param {Object} [options]
 * @param {function} [options.x] - Accessor for x coordinate. Default: `d => d.x ?? d.position?.[0] ?? 0`
 * @param {function} [options.y] - Accessor for y coordinate. Default: `d => d.y ?? d.position?.[1] ?? 0`
 * @param {function} [options.z] - Accessor for z coordinate. Default: `d => d.z ?? d.position?.[2] ?? 0`
 * @returns {Object} Octree instance with insert, remove, query, nearest, visit, and diagnostics methods.
 */
export function createOctree(options = {}) {
  let getX = options.x || ((d) => numberOr(d?.x ?? d?.position?.[0], 0));
  let getY = options.y || ((d) => numberOr(d?.y ?? d?.position?.[1], 0));
  let getZ = options.z || ((d) => numberOr(d?.z ?? d?.position?.[2], 0));

  let root = null;
  let x0 = Infinity;
  let y0 = Infinity;
  let z0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  let z1 = -Infinity;
  let size = 0;

  function cover(x, y, z) {
    if (isNaN(x) || isNaN(y) || isNaN(z)) return;

    if (x0 > x1) {
      // Empty tree — initialize around the point.
      x0 = Math.floor(x);
      y0 = Math.floor(y);
      z0 = Math.floor(z);
      x1 = x0 + 1;
      y1 = y0 + 1;
      z1 = z0 + 1;
    } else {
      // Expand to cover the point.
      let width = x1 - x0;
      let doubled = false;
      while (x < x0 || x >= x1 || y < y0 || y >= y1 || z < z0 || z >= z1) {
        let i = (z < (z0 + z1) / 2 ? 0 : 4) | (y < (y0 + y1) / 2 ? 0 : 2) | (x < (x0 + x1) / 2 ? 0 : 1);
        let parent = createInternalNode();
        parent[i ^ 7] = root; // Place old root in the opposite octant.
        root = parent;
        switch (i ^ 7) {
          case 0: x1 = x0 + width * 2; y1 = y0 + width * 2; z1 = z0 + width * 2; break;
          case 1: x0 = x1 - width * 2; y1 = y0 + width * 2; z1 = z0 + width * 2; break;
          case 2: x1 = x0 + width * 2; y0 = y1 - width * 2; z1 = z0 + width * 2; break;
          case 3: x0 = x1 - width * 2; y0 = y1 - width * 2; z1 = z0 + width * 2; break;
          case 4: x1 = x0 + width * 2; y1 = y0 + width * 2; z0 = z1 - width * 2; break;
          case 5: x0 = x1 - width * 2; y1 = y0 + width * 2; z0 = z1 - width * 2; break;
          case 6: x1 = x0 + width * 2; y0 = y1 - width * 2; z0 = z1 - width * 2; break;
          case 7: x0 = x1 - width * 2; y0 = y1 - width * 2; z0 = z1 - width * 2; break;
        }
        width = x1 - x0;
        doubled = true;
        if (width > 1e12) break; // Safety: prevent infinite expansion.
      }
    }
  }

  function insert(data) {
    let px = +getX(data);
    let py = +getY(data);
    let pz = +getZ(data);
    if (isNaN(px) || isNaN(py) || isNaN(pz)) return false;

    cover(px, py, pz);

    let leaf = { data, x: px, y: py, z: pz };

    if (root === null) {
      root = leaf;
      size++;
      return true;
    }

    // If root is a leaf, wrap it in an internal node.
    if (isLeaf(root)) {
      let existing = root;
      root = createInternalNode();
      let mx = (x0 + x1) / 2;
      let my = (y0 + y1) / 2;
      let mz = (z0 + z1) / 2;
      let oi = octantIndex(existing.x, existing.y, existing.z, mx, my, mz);
      root[oi] = existing;
    }

    // Walk the tree to find the right octant.
    let node = root;
    let lx0 = x0, ly0 = y0, lz0 = z0, lx1 = x1, ly1 = y1, lz1 = z1;
    let depth = 0;
    let maxDepth = 52; // Prevent infinite loops from coincident points.

    while (depth < maxDepth) {
      let mx = (lx0 + lx1) / 2;
      let my = (ly0 + ly1) / 2;
      let mz = (lz0 + lz1) / 2;
      let oi = octantIndex(px, py, pz, mx, my, mz);

      if (oi & 1) lx0 = mx; else lx1 = mx;
      if (oi & 2) ly0 = my; else ly1 = my;
      if (oi & 4) lz0 = mz; else lz1 = mz;

      let child = node[oi];

      if (child === null) {
        node[oi] = leaf;
        size++;
        return true;
      }

      if (isLeaf(child)) {
        // Split: replace leaf with internal node containing both.
        let internal = createInternalNode();
        node[oi] = internal;

        let cmx = (lx0 + lx1) / 2;
        let cmy = (ly0 + ly1) / 2;
        let cmz = (lz0 + lz1) / 2;
        let ci = octantIndex(child.x, child.y, child.z, cmx, cmy, cmz);
        let ni = octantIndex(px, py, pz, cmx, cmy, cmz);

        if (ci === ni) {
          // Same octant — descend further.
          node = internal;
          internal[ci] = createInternalNode();
          node = internal[ci];

          // Continue with narrowed bounds for this octant.
          if (ci & 1) lx0 = cmx; else lx1 = cmx;
          if (ci & 2) ly0 = cmy; else ly1 = cmy;
          if (ci & 4) lz0 = cmz; else lz1 = cmz;

          // Place existing child first, then continue loop to place new leaf.
          let emx = (lx0 + lx1) / 2;
          let emy = (ly0 + ly1) / 2;
          let emz = (lz0 + lz1) / 2;
          let ei = octantIndex(child.x, child.y, child.z, emx, emy, emz);
          node[ei] = child;

          // Now try to place the new leaf.
          let fi = octantIndex(px, py, pz, emx, emy, emz);
          if (fi !== ei) {
            node[fi] = leaf;
            size++;
            return true;
          }
          // Same octant again — continue deeper.
          if (fi & 1) lx0 = emx; else lx1 = emx;
          if (fi & 2) ly0 = emy; else ly1 = emy;
          if (fi & 4) lz0 = emz; else lz1 = emz;

          let deeper = createInternalNode();
          node[fi] = deeper;
          node = deeper;
          depth += 2;
          continue;
        }

        internal[ci] = child;
        internal[ni] = leaf;
        size++;
        return true;
      }

      // Internal node — descend.
      node = child;
      depth++;
    }

    // Coincident points — chain as linked leaves.
    leaf.next = node[0] !== null ? node[0] : null;
    node[0] = leaf;
    size++;
    return true;
  }

  function remove(data) {
    let px = +getX(data);
    let py = +getY(data);
    let pz = +getZ(data);
    if (isNaN(px) || isNaN(py) || isNaN(pz)) return false;

    if (root === null) return false;

    if (isLeaf(root)) {
      if (root.data === data) {
        root = null;
        size--;
        return true;
      }
      return false;
    }

    // Walk to find the leaf.
    let path = [];
    let node = root;
    let lx0 = x0, ly0 = y0, lz0 = z0, lx1 = x1, ly1 = y1, lz1 = z1;

    for (let depth = 0; depth < 52; depth++) {
      let mx = (lx0 + lx1) / 2;
      let my = (ly0 + ly1) / 2;
      let mz = (lz0 + lz1) / 2;
      let oi = octantIndex(px, py, pz, mx, my, mz);

      if (oi & 1) lx0 = mx; else lx1 = mx;
      if (oi & 2) ly0 = my; else ly1 = my;
      if (oi & 4) lz0 = mz; else lz1 = mz;

      let child = node[oi];
      if (child === null) return false;

      if (isLeaf(child)) {
        if (child.data === data) {
          node[oi] = null;
          size--;
          // Collapse empty internal nodes.
          for (let i = path.length - 1; i >= 0; i--) {
            let { parent, index: idx } = path[i];
            let remaining = null;
            let count = 0;
            for (let j = 0; j < 8; j++) {
              if (parent[idx] !== null && j === idx) continue;
              if (parent[j] !== null) {
                remaining = j;
                count++;
              }
            }
            // If parent has no children left, prune from grandparent.
            // Simplified: just leave sparse internal nodes.
          }
          return true;
        }
        return false;
      }

      path.push({ parent: node, index: oi });
      node = child;
    }

    return false;
  }

  /**
   * Breadth-first traversal. Callback receives (node, x0, y0, z0, x1, y1, z1).
   * Return true from callback to skip children of that node.
   */
  function visit(callback) {
    if (root === null) return;

    let stack = [{ node: root, x0, y0, z0, x1, y1, z1 }];

    while (stack.length > 0) {
      let item = stack.pop();
      let node = item.node;

      if (isLeaf(node)) {
        callback(node, item.x0, item.y0, item.z0, item.x1, item.y1, item.z1, true);
        continue;
      }

      if (!isInternal(node)) continue;

      let skip = callback(node, item.x0, item.y0, item.z0, item.x1, item.y1, item.z1, false);
      if (skip) continue;

      let mx = (item.x0 + item.x1) / 2;
      let my = (item.y0 + item.y1) / 2;
      let mz = (item.z0 + item.z1) / 2;

      // Push children in reverse order so that octant 0 is processed first.
      for (let i = 7; i >= 0; i--) {
        if (node[i] === null) continue;
        let cx0 = (i & 1) ? mx : item.x0;
        let cx1 = (i & 1) ? item.x1 : mx;
        let cy0 = (i & 2) ? my : item.y0;
        let cy1 = (i & 2) ? item.y1 : my;
        let cz0 = (i & 4) ? mz : item.z0;
        let cz1 = (i & 4) ? item.z1 : mz;
        stack.push({ node: node[i], x0: cx0, y0: cy0, z0: cz0, x1: cx1, y1: cy1, z1: cz1 });
      }
    }
  }

  /**
   * Post-order traversal. Visits leaves before their parents (bottom-up).
   * Callback receives (node, x0, y0, z0, x1, y1, z1, isLeaf).
   */
  function visitAfter(callback) {
    if (root === null) return;

    let stack = [{ node: root, x0, y0, z0, x1, y1, z1 }];
    let postOrder = [];

    while (stack.length > 0) {
      let item = stack.pop();
      postOrder.push(item);
      let node = item.node;

      if (!isInternal(node)) continue;

      let mx = (item.x0 + item.x1) / 2;
      let my = (item.y0 + item.y1) / 2;
      let mz = (item.z0 + item.z1) / 2;

      for (let i = 0; i < 8; i++) {
        if (node[i] === null) continue;
        let cx0 = (i & 1) ? mx : item.x0;
        let cx1 = (i & 1) ? item.x1 : mx;
        let cy0 = (i & 2) ? my : item.y0;
        let cy1 = (i & 2) ? item.y1 : my;
        let cz0 = (i & 4) ? mz : item.z0;
        let cz1 = (i & 4) ? item.z1 : mz;
        stack.push({ node: node[i], x0: cx0, y0: cy0, z0: cz0, x1: cx1, y1: cy1, z1: cz1 });
      }
    }

    for (let i = postOrder.length - 1; i >= 0; i--) {
      let item = postOrder[i];
      callback(item.node, item.x0, item.y0, item.z0, item.x1, item.y1, item.z1, isLeaf(item.node));
    }
  }

  /**
   * Find all data points within an axis-aligned bounding box.
   * @returns {Array} Array of data objects within the box.
   */
  function queryBox(qx0, qy0, qz0, qx1, qy1, qz1) {
    let results = [];
    if (root === null) return results;

    visit((node, nx0, ny0, nz0, nx1, ny1, nz1, leaf) => {
      if (leaf) {
        if (boxContains(qx0, qy0, qz0, qx1, qy1, qz1, node.x, node.y, node.z)) {
          results.push(node.data);
        }
        return;
      }
      // Skip internal nodes that don't intersect the query box.
      return !boxIntersects(qx0, qy0, qz0, qx1, qy1, qz1, nx0, ny0, nz0, nx1, ny1, nz1);
    });

    return results;
  }

  /**
   * Find the nearest data point to the given coordinates.
   * @returns {{ data: *, distance: number } | null}
   */
  function nearest(px, py, pz, maxDistance = Infinity) {
    if (root === null) return null;

    let bestData = null;
    let bestDist2 = maxDistance * maxDistance;

    // Priority queue: process nearest octants first.
    let stack = [{ node: root, x0, y0, z0, x1, y1, z1 }];

    while (stack.length > 0) {
      let item = stack.pop();
      let node = item.node;

      // Skip if this octant can't contain anything closer.
      let minDist2 = boxDistanceSquared(px, py, pz, item.x0, item.y0, item.z0, item.x1, item.y1, item.z1);
      if (minDist2 > bestDist2) continue;

      if (isLeaf(node)) {
        let d2 = distanceSquared3(px, py, pz, node.x, node.y, node.z);
        if (d2 < bestDist2) {
          bestDist2 = d2;
          bestData = node.data;
        }
        continue;
      }

      if (!isInternal(node)) continue;

      let mx = (item.x0 + item.x1) / 2;
      let my = (item.y0 + item.y1) / 2;
      let mz = (item.z0 + item.z1) / 2;

      // Process children, pushing farther ones first (so nearer ones are popped first).
      let children = [];
      for (let i = 0; i < 8; i++) {
        if (node[i] === null) continue;
        let cx0 = (i & 1) ? mx : item.x0;
        let cx1 = (i & 1) ? item.x1 : mx;
        let cy0 = (i & 2) ? my : item.y0;
        let cy1 = (i & 2) ? item.y1 : my;
        let cz0 = (i & 4) ? mz : item.z0;
        let cz1 = (i & 4) ? item.z1 : mz;
        let cd2 = boxDistanceSquared(px, py, pz, cx0, cy0, cz0, cx1, cy1, cz1);
        children.push({ node: node[i], x0: cx0, y0: cy0, z0: cz0, x1: cx1, y1: cy1, z1: cz1, dist2: cd2 });
      }

      // Sort descending so nearest child is popped from stack first.
      children.sort((a, b) => b.dist2 - a.dist2);
      for (let child of children) {
        if (child.dist2 <= bestDist2) {
          stack.push(child);
        }
      }
    }

    return bestData !== null ? { data: bestData, distance: Math.sqrt(bestDist2) } : null;
  }

  function clear() {
    root = null;
    x0 = Infinity; y0 = Infinity; z0 = Infinity;
    x1 = -Infinity; y1 = -Infinity; z1 = -Infinity;
    size = 0;
  }

  function insertAll(items) {
    for (let item of items) insert(item);
    return tree;
  }

  let tree = {
    insert,
    remove,
    visit,
    visitAfter,
    queryBox,
    nearest,
    clear,
    insertAll,
    get size() { return size; },
    get bounds() {
      return size > 0 ? { x0, y0, z0, x1, y1, z1 } : null;
    },
    get root() { return root; },
  };

  return tree;
}
