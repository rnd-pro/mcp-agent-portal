/* eslint-env worker */
/* globals self */
/**
 * ForceWorker — Force-directed layout in a Web Worker.
 *
 * Pure implementation (zero dependencies) of proven graph layout algorithms:
 *
 * 1. Barnes-Hut N-body repulsion — O(n log n) via quadtree
 *    Paper: Barnes & Hut, "A hierarchical O(N log N) force-calculation algorithm", Nature 1986
 *
 * 2. Quadtree collision detection — prevents node overlap
 *    Based on d3-force forceCollide approach: traverse quadtree, push apart overlapping rectangles
 *
 * 3. Hooke's law spring forces — edges pull connected nodes together
 *    F = -k * (distance - restLength)
 *
 * 4. Center gravity — prevents drift
 *    Weak force pulling all nodes toward centroid
 *
 * Protocol:
 *   Main → Worker: { type: 'init', nodes, edges, groups, options }
 *   Worker → Main: { type: 'tick', positions, energy, iteration }
 *   Worker → Main: { type: 'done', positions, iterations }
 *   Main → Worker: { type: 'stop' }
 *
 * Continuous mode (options.mode = 'continuous'):
 *   Main → Worker: { type: 'pause' }           — freeze simulation, keep state
 *   Main → Worker: { type: 'resume' }          — unfreeze with gentle reheat
 *   Main → Worker: { type: 'pin', id, x, y }   — fix node at position (drag)
 *   Main → Worker: { type: 'unpin', id }        — release pinned node
 *   Worker → Main: { type: 'tick', packed: Float32Array } — packed positions
 *
 * @module symbiote-ui/canvas/ForceWorker
 */

function finiteNumber(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

function clampNumber(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function normalizeMass(value) {
  return clampNumber(finiteNumber(value, 1), 0.35, 8);
}

function normalizeParticipation(value) {
  return clampNumber(finiteNumber(value, 1), 0, 1);
}

function normalizeSizeScale(value) {
  return clampNumber(finiteNumber(value, 1), 0.12, 1);
}

function normalizeLayoutAlgorithm(value) {
  return value === 'spring' || value === 'oil-cloud' || value === 'crystal' ? value : 'organic';
}

function normalizePositionOrigin(value) {
  return value === 'center' ? 'center' : 'top-left';
}

function hashUnit(value) {
  let text = String(value || '');
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return ((hash >>> 0) % 10000) / 10000;
}

function getCloudRadiusEasing() {
  return config.layoutAlgorithm === 'oil-cloud' ? 0.025 : 0.08;
}

function getCloudRepulsionScale() {
  return config.layoutAlgorithm === 'oil-cloud' ? 1.35 : 1;
}

function getCloudWellScale() {
  return config.layoutAlgorithm === 'oil-cloud' ? 0.72 : 1;
}

function getParticipation(node) {
  return normalizeParticipation(node?.layoutParticipation);
}

function getLayoutSizeScale(node) {
  return normalizeSizeScale(node?.layoutSizeScale);
}

function getEffectiveMass(node) {
  return Math.max(0.35, normalizeMass(node?.mass) * getLayoutSizeScale(node));
}

function getCollisionParticipation(node) {
  let participation = getParticipation(node);
  if (participation <= 0.001) return 0;
  return clampNumber(0.18 + participation * 0.82, 0, 1);
}

function getMovementScale(node) {
  return getParticipation(node) / Math.max(1, getEffectiveMass(node));
}

function getEffectiveWidth(node) {
  return Math.max(1, finiteNumber(node?.w, 1) * getLayoutSizeScale(node));
}

function getEffectiveHeight(node) {
  return Math.max(1, finiteNumber(node?.h, 1) * getLayoutSizeScale(node));
}

function advanceLayoutParticipation(nodes) {
  for (const node of nodes) {
    if (node.layoutParticipation < 1) {
      let warmupTicks = Math.max(1, finiteNumber(node.layoutWarmupTicks, 36));
      node.layoutParticipation = Math.min(1, node.layoutParticipation + 1 / warmupTicks);
    }
    if (node.layoutSizeScale < 1) {
      let sizeWarmupTicks = Math.max(1, finiteNumber(node.layoutSizeWarmupTicks, 36));
      node.layoutSizeScale = Math.min(1, node.layoutSizeScale + 1 / sizeWarmupTicks);
    }
  }
}

/**
 * Adaptive quadtree supporting both charge computation and collision detection.
 * Each leaf stores a linked list of bodies at same position (handles coincident nodes).
 */


function quadtreeCreate(nodes) {
  let x0 = Infinity,
    y0 = Infinity,
    x1 = -Infinity,
    y1 = -Infinity;
  for (const n of nodes) {
    if (n.x < x0) x0 = n.x;
    if (n.y < y0) y0 = n.y;
    if (n.x > x1) x1 = n.x;
    if (n.y > y1) y1 = n.y;
  }

  let dx = x1 - x0,
    dy = y1 - y0;
  let size = Math.max(dx, dy, 1) + 200;
  let cx = (x0 + x1) / 2,
    cy = (y0 + y1) / 2;

  let tree = {
    x0: cx - size / 2,
    y0: cy - size / 2,
    x1: cx + size / 2,
    y1: cy + size / 2,
    root: null,
  };

  for (const n of nodes) {
    qtInsert(tree, n);
  }
  return tree;
}

function qtInsert(tree, body) {
  let node = tree.root;
  if (!node) {
    tree.root = { data: body, next: null };
    return;
  }

  let x0 = tree.x0,
    y0 = tree.y0,
    x1 = tree.x1,
    y1 = tree.y1;
  let parent, i;


  while (node.length) {

    let mx = (x0 + x1) / 2,
      my = (y0 + y1) / 2;
    i = (body.x >= mx ? 1 : 0) | (body.y >= my ? 2 : 0);
    parent = node;
    if (body.x >= mx) x0 = mx;
    else x1 = mx;
    if (body.y >= my) y0 = my;
    else y1 = my;
    node = node[i];
    if (!node) {
      parent[i] = { data: body, next: null };
      return;
    }
  }


  let existing = node.data;
  if (Math.abs(existing.x - body.x) < 0.01 && Math.abs(existing.y - body.y) < 0.01) {

    body._qtNext = node.data;
    node.data = body;
    return;
  }


  let leaf = node;
  while (true) {
    let mx = (x0 + x1) / 2,
      my = (y0 + y1) / 2;
    let iNew = (body.x >= mx ? 1 : 0) | (body.y >= my ? 2 : 0);
    let iOld = (existing.x >= mx ? 1 : 0) | (existing.y >= my ? 2 : 0);

    let internal = [null, null, null, null];
    internal.length = 4;
    if (parent) parent[i] = internal;
    else tree.root = internal;

    if (iNew !== iOld) {
      internal[iNew] = { data: body, next: null };
      internal[iOld] = leaf;
      return;
    }


    parent = internal;
    i = iNew;
    if (body.x >= mx) x0 = mx;
    else x1 = mx;
    if (body.y >= my) y0 = my;
    else y1 = my;
  }
}

/**
 * Visit each node in the quadtree (post-order for aggregation).
 * callback(node, x0, y0, x1, y1) → return true to skip children.
 */
function qtVisitAfter(tree, callback) {
  let quads = [];
  if (tree.root)
    quads.push({ node: tree.root, x0: tree.x0, y0: tree.y0, x1: tree.x1, y1: tree.y1 });

  let stack = [];
  while (quads.length) {
    let q = quads.pop();
    stack.push(q);
    if (q.node.length) {
      let { x0, y0, x1, y1 } = q;
      let mx = (x0 + x1) / 2,
        my = (y0 + y1) / 2;
      if (q.node[0]) quads.push({ node: q.node[0], x0, y0, x1: mx, y1: my });
      if (q.node[1]) quads.push({ node: q.node[1], x0: mx, y0, x1, y1: my });
      if (q.node[2]) quads.push({ node: q.node[2], x0, y0: my, x1: mx, y1 });
      if (q.node[3]) quads.push({ node: q.node[3], x0: mx, y0: my, x1, y1 });
    }
  }

  while (stack.length) {
    let q = stack.pop();
    callback(q.node, q.x0, q.y0, q.x1, q.y1);
  }
}

function qtVisit(tree, callback) {
  let quads = [];
  if (tree.root)
    quads.push({ node: tree.root, x0: tree.x0, y0: tree.y0, x1: tree.x1, y1: tree.y1 });
  while (quads.length) {
    let q = quads.pop();
    if (callback(q.node, q.x0, q.y0, q.x1, q.y1)) continue;
    if (q.node.length) {
      let { x0, y0, x1, y1 } = q;
      let mx = (x0 + x1) / 2,
        my = (y0 + y1) / 2;
      if (q.node[3]) quads.push({ node: q.node[3], x0: mx, y0: my, x1, y1 });
      if (q.node[2]) quads.push({ node: q.node[2], x0, y0: my, x1: mx, y1 });
      if (q.node[1]) quads.push({ node: q.node[1], x0: mx, y0, x1, y1: my });
      if (q.node[0]) quads.push({ node: q.node[0], x0, y0, x1: mx, y1: my });
    }
  }
}


/**
 * Barnes-Hut charge force (Coulomb-like repulsion).
 * Aggregates mass and center-of-mass up the quadtree.
 * θ (theta) controls accuracy vs speed: region_size/distance < θ → treat as point mass.
 * @param {Array<Object>} nodes
 * @param {number} strength
 * @param {number} theta
 * @returns {void}
 */
function applyChargeForce(nodes, strength, theta) {
  let tree = quadtreeCreate(nodes);


  qtVisitAfter(tree, (node) => {
    if (!node.length) {

      let current = node.data;
      let mass = 0;
      while (current) {
        mass += getEffectiveMass(current) * getParticipation(current);
        current = current._qtNext;
      }
      node.value = strength * mass;
      node.x = node.data.x;
      node.y = node.data.y;
      return;
    }

    let value = 0,
      x = 0,
      y = 0,
      weight = 0;
    for (let i = 0; i < 4; i++) {
      let child = node[i];
      if (!child || !child.value) continue;
      let w = Math.abs(child.value);
      value += child.value;
      x += child.x * w;
      y += child.y * w;
      weight += w;
    }
    node.value = value;
    node.x = weight > 0 ? x / weight : 0;
    node.y = weight > 0 ? y / weight : 0;
  });


  let thetaSq = theta * theta;

  let avgSize = 20;
  if (nodes.length > 0) {
    avgSize = nodes.reduce((s, n) => s + Math.max(n.w, n.h), 0) / nodes.length;
  }
  let distMin2 = Math.max(1, avgSize * avgSize * 0.25);
  for (const body of nodes) {
    let bodyScale = getMovementScale(body);
    if (bodyScale <= 0.001) continue;
    qtVisit(tree, (node, x0, y0, x1) => {
      if (!node.value) return true;

      let dx = node.x - body.x;
      let dy = node.y - body.y;
      let w = x1 - x0;


      if (dx === 0 && dy === 0) {
        dx = (Math.random() - 0.5) * 20;
        dy = (Math.random() - 0.5) * 20;
      }

      let distSq = dx * dx + dy * dy;
      if (distSq < distMin2) distSq = distMin2;


      if ((w * w) / distSq < thetaSq) {
        if (distSq < 1000 * 1000) {

          let force = node.value / distSq;
          body.vx -= dx * force * bodyScale;
          body.vy -= dy * force * bodyScale;
        }
        return true;
      }


      if (!node.length) {
        let current = node.data;
        while (current) {
          if (current !== body) {
            let dxLeaf = current.x - body.x;
            let dyLeaf = current.y - body.y;
            if (dxLeaf === 0 && dyLeaf === 0) {
              dxLeaf = (Math.random() - 0.5) * 20;
              dyLeaf = (Math.random() - 0.5) * 20;
            }
            let distSqLeaf = dxLeaf * dxLeaf + dyLeaf * dyLeaf;
            if (distSqLeaf < distMin2) distSqLeaf = distMin2;
            let force = strength * getEffectiveMass(current) * getParticipation(current) / distSqLeaf;
            body.vx -= dxLeaf * force * bodyScale;
            body.vy -= dyLeaf * force * bodyScale;
          }
          current = current._qtNext;
        }
        return true;
      }

      return false;
    });
  }
}

/**
 * Collision force — prevents node overlap.
 * Uses spatial hash grid for O(n) neighbor detection.
 * Applies POSITIONAL separation (not just velocity) for hard constraints.
 * Multi-pass (3 iterations) to resolve chain collisions.
 * @param {Array<Object>} nodes
 * @param {number} strength
 * @param {number} iterations
 */
function applyCollisionForce(nodes, strength, iterations) {
  let iters = iterations || 3;

  let padX = 8;
  let padY = 4;

  let maxW = 0;
  let maxH = 0;
  for (const n of nodes) {
    if (n.w > maxW) maxW = n.w;
    if (n.h > maxH) maxH = n.h;
  }

  if (maxW < 20) maxW = 20;
  if (maxH < 20) maxH = 20;

  for (let pass = 0; pass < iters; pass++) {

    let cellW = maxW * 1.5;
    let cellH = maxH * 3;
    let grid = new Map();

    for (let i = 0; i < nodes.length; i++) {
      let n = nodes[i];
      let gx = Math.floor(n.x / cellW);
      let gy = Math.floor(n.y / cellH);
      let key = `${gx},${gy}`;
      if (!grid.has(key)) grid.set(key, []);
      grid.get(key).push(i);
    }


    for (let i = 0; i < nodes.length; i++) {
      let n = nodes[i];
      let gx = Math.floor(n.x / cellW);
      let gy = Math.floor(n.y / cellH);
      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          let neighbors = grid.get(`${gx + dx},${gy + dy}`);
          if (!neighbors) continue;
          for (const j of neighbors) {
            if (j <= i) continue;
            resolveOverlap(nodes, i, j, padX, padY, strength);
          }
        }
      }
    }
  }
}

/**
 * Resolve overlap between two nodes
 * @param {Array<Object>} nodes
 * @param {number} i
 * @param {number} j
 * @param {number} padX
 * @param {number} padY
 * @param {number} strength
 */
function resolveOverlap(nodes, i, j, padX, padY, strength) {
  let a = nodes[i],
    b = nodes[j];
  let participation = Math.min(getCollisionParticipation(a), getCollisionParticipation(b));
  if (participation <= 0.05) return;

  let involvesActiveVisualNode = config.activeVisualNodeId && (
    a.id === config.activeVisualNodeId ||
    b.id === config.activeVisualNodeId
  );

  if (a.parentId !== b.parentId && !involvesActiveVisualNode) {
    if (a.id !== config.activeGroupId && b.id !== config.activeGroupId) {
      return;
    }

    if (
      (a.id === config.activeGroupId && b.parentId === a.id) ||
      (b.id === config.activeGroupId && a.parentId === b.id)
    ) {
      return;
    }
  }


  let dx = b.x - a.x;
  let dy = b.y - a.y;

  let massPadA = Math.max(0, getEffectiveMass(a) - 1) * 2.4;
  let massPadB = Math.max(0, getEffectiveMass(b) - 1) * 2.4;
  let hwA = getEffectiveWidth(a) / 2 + padX + massPadA;
  let hhA = getEffectiveHeight(a) / 2 + padY + massPadA;
  let hwB = getEffectiveWidth(b) / 2 + padX + massPadB;
  let hhB = getEffectiveHeight(b) / 2 + padY + massPadB;

  let overlapX = hwA + hwB - Math.abs(dx);
  let overlapY = hhA + hhB - Math.abs(dy);

  if (overlapX > 0 && overlapY > 0) {


    if (overlapX < overlapY) {
      let sign = dx < 0 ? -1 : dx > 0 ? 1 : Math.random() < 0.5 ? -1 : 1;
      let push = overlapX * strength * participation * 0.5;
      let aShare = getEffectiveMass(b) / (getEffectiveMass(a) + getEffectiveMass(b));
      let bShare = 1 - aShare;

      a.x -= sign * push * aShare;
      b.x += sign * push * bShare;


      if (Math.sign(a.vx) === sign) a.vx = 0;
      if (Math.sign(b.vx) === -sign) b.vx = 0;


      let jitter = (Math.random() - 0.5) * 0.5;
      a.y -= jitter;
      b.y += jitter;
    } else {
      let sign = dy < 0 ? -1 : dy > 0 ? 1 : Math.random() < 0.5 ? -1 : 1;
      let push = overlapY * strength * participation * 0.5;
      let aShare = getEffectiveMass(b) / (getEffectiveMass(a) + getEffectiveMass(b));
      let bShare = 1 - aShare;

      a.y -= sign * push * aShare;
      b.y += sign * push * bShare;


      if (Math.sign(a.vy) === sign) a.vy = 0;
      if (Math.sign(b.vy) === -sign) b.vy = 0;


      let jitter = (Math.random() - 0.5) * 0.5;
      a.x -= jitter;
      b.x += jitter;
    }
  }
}

/**
 * Count overlapping node pairs using spatial hash. O(n) average.
 * @param {Array<Object>} nodes
 * @returns {number} Number of overlapping pairs
 */
function countOverlaps(nodes) {
  let maxW = 260,
    maxH = 40;
  for (const n of nodes) {
    if (n.w > maxW) maxW = n.w;
    if (n.h > maxH) maxH = n.h;
  }
  let cellW = maxW * 1.5;
  let cellH = maxH * 3;
  let grid = new Map();

  for (let i = 0; i < nodes.length; i++) {
    let n = nodes[i];
    let key = `${Math.floor(n.x / cellW)},${Math.floor(n.y / cellH)}`;
    if (!grid.has(key)) grid.set(key, []);
    grid.get(key).push(i);
  }

  let count = 0;
  for (let i = 0; i < nodes.length; i++) {
    let n = nodes[i];
    let gx = Math.floor(n.x / cellW);
    let gy = Math.floor(n.y / cellH);
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        let neighbors = grid.get(`${gx + dx},${gy + dy}`);
        if (!neighbors) continue;
        for (const j of neighbors) {
          if (j <= i) continue;
          let b = nodes[j];
          let hwA = n.w / 2,
            hhA = n.h / 2;
          let hwB = b.w / 2,
            hhB = b.h / 2;
          if (Math.abs(n.x - b.x) < hwA + hwB && Math.abs(n.y - b.y) < hhA + hhB) count++;
        }
      }
    }
  }
  return count;
}

/**
 * Jitter only nodes that are actually overlapping. Uses spatial hash for O(n).
 * Small random displacement breaks deadlocks in post-convergence cleanup.
 * @param {Array<Object>} nodes
 */


/**
 * Spring force (Hooke's law) for linked nodes.
 * F = strength * (distance - restLength)
 * @param {Array<Object>} nodes
 * @param {Array<Object>} edges
 * @param {number} alpha
 */
function applyLinkForce(nodes, edges, alpha) {
  for (const e of edges) {
    let s = nodes[e.source];
    let t = nodes[e.target];
    if (!s || !t) continue;
    let participation = Math.min(getParticipation(s), getParticipation(t));
    if (participation <= 0.01) continue;

    let dx = t.x + t.vx - s.x - s.vx;
    let dy = t.y + t.vy - s.y - s.vy;
    if (dx === 0 && dy === 0) {
      dx = (Math.random() - 0.5) * 1e-6;
      dy = dx;
    }

    let dist = Math.sqrt(dx * dx + dy * dy) || 1;
    let layoutScale = isCrystalLayout() ? 0.28 : 1;
    let force = ((dist - e.restLength) / dist) * alpha * e.strength * participation * layoutScale;
    let fx = dx * force;
    let fy = dy * force;


    let bias = e.bias;
    t.vx -= fx * bias / Math.max(1, getEffectiveMass(t));
    t.vy -= fy * bias / Math.max(1, getEffectiveMass(t));
    s.vx += fx * (1 - bias) / Math.max(1, getEffectiveMass(s));
    s.vy += fy * (1 - bias) / Math.max(1, getEffectiveMass(s));
  }
}

/**
 * Center force: pulls all nodes toward centroid or attractors.
 * External nodes → global center (0,0). Internal nodes → parent center (bx,by).
 * @param {Array<Object>} nodes
 * @param {number} strength
 * @param {Object} attractors
 * @param {number} [bx=0]
 * @param {number} [by=0]
 */


/**
 * Boundary force: pushes nodes back if they escape the boundary circle.
 * @param {Array<Object>} nodes
 * @param {number} radius
 * @param {number} strength
 * @param {number} bx
 * @param {number} by
 * @param {string} activeGroupId
 */


let nodes = [];
let edges = [];
let running = false;
let paused = false;
let galacticSuns = [];
let planets = [];
let simMode = 'converge';
let continuousTimer = null;
let degree = [];

let config = {
  chargeStrength: -250,
  theta: 0.7,
  linkDistance: 180,
  linkStrength: 0.15,
  groupDistance: 120,
  groupStrength: 0.05,
  collideStrength: 0.95,
  centerStrength: 0.01,
  velocityDecay: 0.92,
  alphaDecay: 0.015,
  alphaMin: 0.001,
  alphaTarget: 0,
  initialAlpha: 1,
  layoutAlgorithm: 'organic',
  positionOrigin: 'top-left',

  contAlphaFloor: 0.001,
  contAlphaTarget: 0.001,
  brownian: 0.005,
  brownianThresh: 0.005,
  pinReheat: 0.03,
  pinCap: 0.1,
  resumeReheat: 0.05,
  resumeCap: 0.1,


  activeGroupId: null,
  activeVisualNodeId: null,
  boundaryRadius: null,
  boundaryStrength: 0.2,
  attractors: null,

  wellStrength: 0.8,
  centerPull: 0.3,
  wellRepulsion: 5.0,
  crossLinkScale: 0.2,
  crystalStrength: 0.18,
};

function isCrystalLayout() {
  return config.layoutAlgorithm === 'crystal';
}

function applyCrystalTargetsToWorkerNodes(crystalTargets, seedPositions) {
  if (!isCrystalLayout()) {
    for (let node of nodes) {
      delete node.crystalTargetX;
      delete node.crystalTargetY;
      delete node.crystalShell;
      node.mass = node.baseMass;
    }
    return;
  }
  if (!crystalTargets || typeof crystalTargets !== 'object') {
    throw new Error('Crystal force layout requires canonical crystalTargets from ForceLayout.');
  }
  for (const node of nodes) {
    let target = crystalTargets[node.id];
    if (!target || !Number.isFinite(target.x) || !Number.isFinite(target.y)) {
      throw new Error(`Canonical crystal target is missing for node "${node.id}".`);
    }
    node.crystalTargetX = target.x;
    node.crystalTargetY = target.y;
    node.crystalShell = target.shell;
    let index = node.index;
    node.mass = Math.max(
      node.baseMass,
      target.center
        ? Math.min(4.5, (degree[index] || 0) * 0.35 + 2)
        : node.isGroup ? 2.2 : node.baseMass,
    );
    if (seedPositions && !node._hadPos) {
      node.x = target.x;
      node.y = target.y;
      node.layoutFixedX = target.x;
      node.layoutFixedY = target.y;
      node.vx = 0;
      node.vy = 0;
    }
  }
}

function applyCrystalForces(alpha) {
  if (!isCrystalLayout()) return;
  let strength = clampNumber(finiteNumber(config.crystalStrength, 0.18), 0.01, 0.8);
  let sizeScale = clampNumber(26 / Math.max(6, Math.sqrt(nodes.length) * 3.2), 0.5, 1);
  for (const node of nodes) {
    if (!Number.isFinite(node.crystalTargetX) || !Number.isFinite(node.crystalTargetY)) continue;
    let scale = getMovementScale(node);
    if (scale <= 0) continue;
    let dx = node.x - node.crystalTargetX;
    let dy = node.y - node.crystalTargetY;
    let distance = Math.sqrt(dx * dx + dy * dy);
    if (distance < 0.35) continue;
    let shellScale = node.crystalShell === 0 ? 1.35 : 1;
    let pull = clampNumber(strength * alpha * 0.95 * sizeScale * shellScale * scale, 0.006, 0.24);
    node.x -= dx * pull;
    node.y -= dy * pull;
    node.vx -= dx * pull * 0.18;
    node.vy -= dy * pull * 0.18;
  }
}

function initSimulation(data) {
  let { nodes: rawNodes, edges: rawEdges, groups = {}, options = {} } = data;


  Object.assign(config, options);
  config.groups = groups;
  config.layoutAlgorithm = normalizeLayoutAlgorithm(config.layoutAlgorithm);
  config.positionOrigin = normalizePositionOrigin(config.positionOrigin);
  simMode = options.mode || 'converge';


  nodes = rawNodes.map((n, i) => {
    let angle = (2 * Math.PI * i) / rawNodes.length;
    let radius = Math.sqrt(rawNodes.length) * 50;
    let w = n.w || options.nodeWidth || 260;
    let h = n.h || options.nodeHeight || 40;


    let hasPos = n.x !== undefined && n.y !== undefined;
    let x = hasPos ? n.x : Math.cos(angle) * radius + (Math.random() - 0.5) * 100;
    let y = hasPos ? n.y : Math.sin(angle) * radius + (Math.random() - 0.5) * 100;
    let layoutFixedTicks = Math.max(0, finiteNumber(n.layoutFixedTicks, 0));
    return {
      id: n.id,
      x,
      y,
      _hadPos: hasPos,
      vx: 0,
      vy: 0,
      group: n.group || null,
      type: n.type || null,
      parentId: n.parentId || null,
      isGroup: n.isGroup || false,
      children: n.children || [],
      index: i,
      w,
      h,
      mass: normalizeMass(n.mass),
      baseMass: normalizeMass(n.mass),
      layoutParticipation: normalizeParticipation(n.layoutParticipation),
      layoutWarmupTicks: Math.max(0, finiteNumber(n.layoutWarmupTicks, 0)),
      layoutSizeScale: normalizeSizeScale(n.layoutSizeScale),
      layoutSizeWarmupTicks: Math.max(0, finiteNumber(n.layoutSizeWarmupTicks, 0)),
      layoutFixedTicks,
      layoutFixedX: x,
      layoutFixedY: y,
    };
  });


  if (options.activeGroupId && !isCrystalLayout()) {
    let parentNode = nodes.find((n) => n.id === options.activeGroupId);
    if (parentNode) {

      let newChildren = nodes.filter((n) => n.parentId === options.activeGroupId && !n._hadPos);
      for (let i = 0; i < newChildren.length; i++) {
        let n = newChildren[i];

        let angle = (2 * Math.PI * i) / newChildren.length + (Math.random() - 0.5) * 0.5;
        let spread = parentNode.w * 0.3;
        n.x = parentNode.x + Math.cos(angle) * spread;
        n.y = parentNode.y + Math.sin(angle) * spread;

        n.vx = Math.cos(angle) * 15;
        n.vy = Math.sin(angle) * 15;
      }
    }
  }

  let nodeIndex = {};
  nodes.forEach((n, i) => {
    nodeIndex[n.id] = i;
  });


  let rawDegree = new Array(nodes.length).fill(0);
  rawEdges.forEach((e) => {
    let si = nodeIndex[e.from],
      ti = nodeIndex[e.to];
    if (si !== undefined) rawDegree[si]++;
    if (ti !== undefined) rawDegree[ti]++;
  });


  degree = new Array(nodes.length).fill(0);


  edges = rawEdges
    .map((e) => {
      let si = nodeIndex[e.from],
        ti = nodeIndex[e.to];
      if (si === undefined || ti === undefined) return null;
      degree[si]++;
      degree[ti]++;
      return {
        source: si,
        target: ti,
        strength: config.linkStrength,
        restLength: config.linkDistance,
        bias: 0.5,
        group: false,
      };
    })
    .filter(Boolean);


  for (const [, memberIds] of Object.entries(groups)) {
    if (memberIds.length < 2) continue;


    let bestHubId = memberIds[0];
    let maxConnections = -1;
    for (const mId of memberIds) {
      let idx = nodeIndex[mId];
      if (idx !== undefined && rawDegree[idx] > maxConnections) {
        maxConnections = rawDegree[idx];
        bestHubId = mId;
      }
    }

    let hubIdx = nodeIndex[bestHubId];
    if (hubIdx === undefined) continue;


    for (const mId of memberIds) {
      if (mId === bestHubId) continue;
      let ti = nodeIndex[mId];
      if (ti !== undefined) {
        degree[hubIdx]++;
        degree[ti]++;
        edges.push({
          source: hubIdx,
          target: ti,
          strength: config.groupStrength,
          restLength: config.groupDistance,
          bias: 0.5,
          group: true,
        });
      }
    }
  }


  for (const e of edges) {
    let ds = degree[e.source] || 1;
    let dt = degree[e.target] || 1;
    e.bias = ds / (ds + dt);
  }


  applyCrystalTargetsToWorkerNodes(data.crystalTargets, true);
  computeGravityWells(degree);
}

/**
 * Galactic Physics: classify nodes as Suns (hubs) or Planets (leaves).
 * Suns = group nodes OR high-degree nodes (> median * 1.5).
 * Planets are assigned to the nearest connected Sun.
 * Orphans are promoted to micro-suns.
 */
function computeGravityWells(degree) {
  galacticSuns = [];
  planets = [];


  for (const n of nodes) {
    n.isSun = false;
    n.mySun = null;
  }

  if (config.layoutAlgorithm === 'spring' || isCrystalLayout()) return;

  let medianDeg =
    degree.length > 0 ? [...degree].sort((a, b) => a - b)[Math.floor(degree.length / 2)] : 1;
  let hubThreshold = Math.max(3, medianDeg * 1.5);

  for (let i = 0; i < nodes.length; i++) {
    let n = nodes[i];
    let deg = degree[i] || 0;

    if (n.parentId && n.parentId === config.activeGroupId) continue;
    if (n.id === config.activeGroupId) continue;

    if (n.isGroup || deg >= hubThreshold || (!n.parentId && n.children && n.children.length > 0)) {
      n.isSun = true;
      n.mass = Math.max(n.baseMass, deg + 5);
      galacticSuns.push(n);
    } else {
      n.isSun = false;
      n.mass = Math.max(n.baseMass, 1);
    }
  }


  for (const e of edges) {
    let s = nodes[e.source],
      t = nodes[e.target];
    if (s.isSun && !t.isSun && !t.mySun) t.mySun = s;
    else if (t.isSun && !s.isSun && !s.mySun) s.mySun = t;
  }


  for (const n of nodes) {
    if (n.id === config.activeGroupId) continue;
    if (!n.isSun) {
      if (n.mySun) planets.push(n);
      else {

        n.isSun = true;
        n.mass = Math.max(n.baseMass, 2);
        galacticSuns.push(n);
      }
    }
  }


  for (const e of edges) {
    let s = nodes[e.source],
      t = nodes[e.target];
    if (!s || !t) continue;


    if (e._origStrength === undefined) {
      e._origStrength = e.strength;
      e._origRestLength = e.restLength;
    }


    e._isCrossGalactic = false;
    if (s.isSun && t.isSun) e._isCrossGalactic = true;
    else if (s.mySun && t.mySun && s.mySun !== t.mySun) e._isCrossGalactic = true;
    else if (s.mySun && t.isSun && s.mySun !== t) e._isCrossGalactic = true;
    else if (t.mySun && s.isSun && t.mySun !== s) e._isCrossGalactic = true;

    if (e._isCrossGalactic) {
      e.strength = e._origStrength * config.crossLinkScale;

      e.restLength = e._origRestLength * (1 + 0.5 * (1 - config.crossLinkScale));
    } else {
      e.strength = e._origStrength;
      e.restLength = e._origRestLength;
    }
  }
}

function tick(alpha) {

  let chargeScale = isCrystalLayout() ? 0.18 : config.layoutAlgorithm === 'oil-cloud' ? 0.72 : 1;
  applyChargeForce(nodes, config.chargeStrength * alpha * chargeScale, config.theta);


  applyLinkForce(nodes, edges, alpha);


  applyCollisionForce(nodes, config.collideStrength, config.layoutAlgorithm === 'oil-cloud' || isCrystalLayout() ? 8 : 6);

  if (config.layoutAlgorithm === 'spring') {
    for (const n of nodes) {
      let scale = getMovementScale(n);
      n.vx -= n.x * config.centerPull * alpha * 0.02 * scale;
      n.vy -= n.y * config.centerPull * alpha * 0.02 * scale;
    }
  } else if (isCrystalLayout()) {
    applyCrystalForces(alpha);
  }


  for (const sun of galacticSuns) {
    sun.dynamicRadius = (getEffectiveWidth(sun) || 20) * (config.layoutAlgorithm === 'oil-cloud' ? 1.18 : 1);
    sun.smoothRadius = sun.smoothRadius || sun.dynamicRadius;
  }
  for (const p of planets) {
    if (p.mySun) {
      let dx = p.x - p.mySun.x;
      let dy = p.y - p.mySun.y;
      let dist = Math.sqrt(dx * dx + dy * dy);
      let weightedDistance = dist * getParticipation(p);
      if (weightedDistance > p.mySun.dynamicRadius) {
        p.mySun.dynamicRadius = weightedDistance;
      }
    }
  }
  for (const sun of galacticSuns) {
    sun.smoothRadius += (sun.dynamicRadius - sun.smoothRadius) * getCloudRadiusEasing();
  }


  for (const sun of galacticSuns) {
    if (sun.id === config.activeGroupId) continue;
    let scale = getMovementScale(sun);
    sun.vx -= sun.x * config.centerPull * alpha * scale;
    sun.vy -= sun.y * config.centerPull * alpha * scale;
  }


  for (let i = 0; i < galacticSuns.length; i++) {
    for (let j = i + 1; j < galacticSuns.length; j++) {
      let si = galacticSuns[i],
        sj = galacticSuns[j];
      let dx = sj.x - si.x;
      let dy = sj.y - si.y;
      let dist = Math.sqrt(dx * dx + dy * dy) + 1;
      let combinedRadius = si.smoothRadius + sj.smoothRadius;
      let participation = Math.min(getParticipation(si), getParticipation(sj));
      if (dist < combinedRadius) {

        let overlapRatio = (combinedRadius - dist) / combinedRadius;
        let rawForce = overlapRatio * config.wellRepulsion * getCloudRepulsionScale() * alpha * participation;

        let force = Math.min(rawForce, config.layoutAlgorithm === 'oil-cloud' ? 24 : 50);
        let nx = dx / dist,
          ny = dy / dist;
        si.vx -= nx * force / Math.max(1, getEffectiveMass(si));
        si.vy -= ny * force / Math.max(1, getEffectiveMass(si));
        sj.vx += nx * force / Math.max(1, getEffectiveMass(sj));
        sj.vy += ny * force / Math.max(1, getEffectiveMass(sj));
      }
    }
  }


  for (const p of planets) {
    let dx = p.x - p.mySun.x;
    let dy = p.y - p.mySun.y;
    let scale = getMovementScale(p);
    p.vx -= dx * config.wellStrength * getCloudWellScale() * alpha * scale;
    p.vy -= dy * config.wellStrength * getCloudWellScale() * alpha * scale;
  }


  let energy = 0;
  let decay = 1 - config.velocityDecay;
  let vMax = Math.max(200, Math.sqrt(nodes.length) * 10);
  for (const n of nodes) {
    if (n.fx === undefined && n.fy === undefined && n.layoutFixedTicks > 0) {
      n.x = n.layoutFixedX;
      n.y = n.layoutFixedY;
      n.vx = 0;
      n.vy = 0;
      n.layoutFixedTicks -= 1;
      continue;
    }
    if (n.fx !== undefined) {
      n.x = n.fx;
      n.vx = 0;
    } else {
      n.vx *= decay;
      if (n.vx > vMax) n.vx = vMax;
      else if (n.vx < -vMax) n.vx = -vMax;
      n.x += n.vx;
    }
    if (n.fy !== undefined) {
      n.y = n.fy;
      n.vy = 0;
    } else {
      n.vy *= decay;
      if (n.vy > vMax) n.vy = vMax;
      else if (n.vy < -vMax) n.vy = -vMax;
      n.y += n.vy;
    }
    energy += n.vx * n.vx + n.vy * n.vy;
  }

  advanceLayoutParticipation(nodes);
  return energy;
}

function getPositions() {
  let positions = {};
  for (const n of nodes) {
    positions[n.id] = config.positionOrigin === 'center'
      ? { x: Math.round(n.x), y: Math.round(n.y) }
      : { x: Math.round(n.x - n.w / 2), y: Math.round(n.y - n.h / 2) };
  }
  return positions;
}

/**
 * Pack positions into a Float32Array for efficient transfer.
 * Layout: [x0, y0, x1, y1, ...] in node index order.
 * The ID-to-index mapping is stable from initSimulation.
 * @returns {Float32Array}
 */
function getPositionsPacked() {
  let buf = new Float32Array(nodes.length * 2);
  for (let i = 0; i < nodes.length; i++) {
    buf[i * 2] = config.positionOrigin === 'center' ? nodes[i].x : nodes[i].x - nodes[i].w / 2;
    buf[i * 2 + 1] = config.positionOrigin === 'center' ? nodes[i].y : nodes[i].y - nodes[i].h / 2;
  }
  return buf;
}

/**
 * Get ordered node IDs (sent once at init, used to unpack Float32Array).
 * @returns {string[]}
 */
function getNodeIds() {
  return nodes.map((n) => n.id);
}


self.onmessage = function (e) {
  let { type } = e.data;

  if (type === 'init') {
    running = true;
    paused = false;
    initSimulation(e.data);

    if (simMode === 'continuous') {
      startContinuous();
    } else {
      startConverge();
    }
  }

  if (type === 'pause') {
    paused = true;
    if (continuousTimer !== null) {
      clearTimeout(continuousTimer);
      continuousTimer = null;
    }
  }

  if (type === 'resume') {
    if (!running || !paused) return;
    paused = false;

    continuousAlpha = Math.min(continuousAlpha + config.resumeReheat, config.resumeCap);
    startContinuousLoop();
  }

  if (type === 'pin') {
    let { id, x, y } = e.data;
    let node = nodes.find((n) => n.id === id);
    if (node) {

      let originOffsetX = config.positionOrigin === 'center' ? 0 : node.w / 2;
      let originOffsetY = config.positionOrigin === 'center' ? 0 : node.h / 2;
      node.fx = x + originOffsetX;
      node.fy = y + originOffsetY;

      if (simMode === 'continuous') {
        continuousAlpha = Math.min(continuousAlpha + config.pinReheat, config.pinCap);
        if (paused) {
          paused = false;
          startContinuousLoop();
        }
      }
    }
  }

  if (type === 'unpin') {
    let { id } = e.data;
    let node = nodes.find((n) => n.id === id);
    if (node) {
      delete node.fx;
      delete node.fy;
      if (simMode === 'continuous') {
        continuousAlpha = Math.min(continuousAlpha + config.pinReheat, config.pinCap);
        if (paused) {
          paused = false;
          startContinuousLoop();
        }
      }
    }
  }

  if (type === 'updateConfig') {
    let updates = e.data.config;
    if (updates) {
      Object.assign(config, updates);
      config.layoutAlgorithm = normalizeLayoutAlgorithm(config.layoutAlgorithm);
      config.positionOrigin = normalizePositionOrigin(config.positionOrigin);
      simMode = config.mode === 'continuous' ? 'continuous' : 'converge';
      applyCrystalTargetsToWorkerNodes(e.data.crystalTargets, false);

      if (updates.linkDistance !== undefined || updates.linkStrength !== undefined) {
        for (const edge of edges) {
          if (edge.group) continue;
          if (updates.linkDistance !== undefined) edge.restLength = config.linkDistance;
          if (updates.linkStrength !== undefined) edge.strength = config.linkStrength;
        }
      }
      if (updates.groupDistance !== undefined || updates.groupStrength !== undefined) {
        for (const edge of edges) {
          if (!edge.group) continue;
          if (updates.groupDistance !== undefined) edge.restLength = config.groupDistance;
          if (updates.groupStrength !== undefined) edge.strength = config.groupStrength;
        }
      }

      if (updates.crossLinkScale !== undefined) {
        for (const edge of edges) {
          if (edge._isCrossGalactic && edge._origStrength !== undefined) {
            edge.strength = edge._origStrength * config.crossLinkScale;
            edge.restLength = edge._origRestLength * (1 + 0.5 * (1 - config.crossLinkScale));
          }
        }
      }


      if (simMode === 'continuous') {
        continuousAlpha = Math.min(continuousAlpha + config.resumeReheat, config.resumeCap);
        if (!paused && continuousTimer === null) {
          startContinuousLoop();
        }
      }
    }
  }

  if (type === 'stop') {
    running = false;
    paused = false;
    if (continuousTimer !== null) {
      clearTimeout(continuousTimer);
      continuousTimer = null;
    }
    self.postMessage({
      type: 'done',
      positions: getPositions(),
      energy: 0,
      iteration: -1,
    });
  }
};


function startConverge() {
  let totalNodes = nodes.length;
  let adaptiveAlphaDecay = config.alphaDecay;
  let alpha = clampNumber(finiteNumber(config.initialAlpha, 1), config.alphaMin, 1);
  let iteration = 0;
  let maxIter = Math.ceil(Math.log(config.alphaMin) / Math.log(1 - config.alphaDecay)) + 1;
  let batchSize = totalNodes > 1000 ? 8 : 4;

  function runBatch() {
    if (!running) return;

    for (let i = 0; i < batchSize && alpha > config.alphaMin && iteration < maxIter; i++) {
      tick(alpha);
      alpha += (config.alphaTarget - alpha) * adaptiveAlphaDecay;
      iteration++;
    }

    if (iteration % 20 === 0) {
      let overlaps = countOverlaps(nodes);
      if (overlaps > 0 && alpha > 0.05) {
        adaptiveAlphaDecay = Math.max(0.005, adaptiveAlphaDecay * 0.9);
      }
    }

    let isDone = alpha <= config.alphaMin || iteration >= maxIter;

    if (!isDone) {
      self.postMessage({
        type: 'tick',
        positions: getPositions(),
        energy: Math.round(alpha * 1000) / 1000,
        iteration,
        overlaps: countOverlaps(nodes),
      });
      setTimeout(runBatch, 0);
    } else {

      let attempt = 0;
      let maxExpansionAttempts = 2000;
      let expansionBatchSize = totalNodes > 1000 ? 10 : 20;

      function runExpansionBatch() {
        if (!running) return;

        let overlaps = countOverlaps(nodes);
        let bIter = 0;

        while (overlaps > 0 && attempt < maxExpansionAttempts && bIter < expansionBatchSize) {
          applyCollisionForce(nodes, 1.0, 4);

          let maxW = 260,
            maxH = 40;
          for (const n of nodes) {
            if (n.w > maxW) maxW = n.w;
            if (n.h > maxH) maxH = n.h;
          }
          let cellW = maxW * 1.5;
          let cellH = maxH * 3;
          let grid = new Map();
          for (let i = 0; i < nodes.length; i++) {
            let n = nodes[i];
            let key = `${Math.floor(n.x / cellW)},${Math.floor(n.y / cellH)}`;
            if (!grid.has(key)) grid.set(key, []);
            grid.get(key).push(i);
          }

          for (let i = 0; i < nodes.length; i++) {
            let a = nodes[i];
            let gx = Math.floor(a.x / cellW);
            let gy = Math.floor(a.y / cellH);
            for (let dx = -1; dx <= 1; dx++) {
              for (let dy = -1; dy <= 1; dy++) {
                let neighbors = grid.get(`${gx + dx},${gy + dy}`);
                if (!neighbors) continue;
                for (const j of neighbors) {
                  if (j <= i) continue;
                  let b = nodes[j];
                  let ddx = b.x - a.x;
                  let ddy = b.y - a.y;
                  let limitX = (a.w + b.w) / 2;
                  let limitY = (a.h + b.h) / 2;
                  if (Math.abs(ddx) < limitX && Math.abs(ddy) < limitY) {
                    let len = Math.sqrt(ddx * ddx + ddy * ddy);
                    if (len === 0) {
                      ddx = Math.random() - 0.5;
                      ddy = Math.random() - 0.5;
                      len = Math.sqrt(ddx * ddx + ddy * ddy) || 1;
                    }
                    let push = 2 / len;
                    a.vx -= ddx * push;
                    b.vx += ddx * push;
                    a.vy -= ddy * push;
                    b.vy += ddy * push;
                  }
                }
              }
            }
          }

          let decay = 0.8;
          for (const n of nodes) {
            n.vx *= decay;
            n.vy *= decay;
            if (n.vx > 10) n.vx = 10;
            else if (n.vx < -10) n.vx = -10;
            if (n.vy > 10) n.vy = 10;
            else if (n.vy < -10) n.vy = -10;
            n.x += n.vx;
            n.y += n.vy;
          }

          overlaps = countOverlaps(nodes);
          attempt++;
          bIter++;
        }

        if (overlaps > 0 && attempt < maxExpansionAttempts) {
          self.postMessage({
            type: 'tick',
            positions: getPositions(),
            energy: 0,
            iteration: iteration + attempt,
            overlaps,
          });
          setTimeout(runExpansionBatch, 0);
        } else {
          running = false;
          self.postMessage({
            type: 'done',
            positions: getPositions(),
            iterations: iteration + attempt,
          });
        }
      }

      runExpansionBatch();
    }
  }

  runBatch();
}


let continuousAlpha = 1;
let continuousIteration = 0;

function startContinuous() {
  continuousAlpha = clampNumber(finiteNumber(config.initialAlpha, 1), config.contAlphaFloor, 1);
  continuousIteration = 0;
  self._initialDoneSent = false;


  self.postMessage({ type: 'nodeIds', ids: getNodeIds() });

  startContinuousLoop();
}

function startContinuousLoop() {
  if (continuousTimer !== null) return;

  function runTick() {
    if (!running || paused) {
      continuousTimer = null;
      return;
    }


    let energy = tick(continuousAlpha);


    if (config.brownian > 0 && continuousAlpha < config.brownianThresh) {
      let bStr = config.brownian;
      for (const n of nodes) {
        if (n.fx === undefined) n.vx += (Math.random() - 0.5) * bStr;
        if (n.fy === undefined) n.vy += (Math.random() - 0.5) * bStr;
      }
    }


    continuousAlpha += (config.contAlphaTarget - continuousAlpha) * config.alphaDecay;
    if (continuousAlpha < config.contAlphaFloor) continuousAlpha = config.contAlphaFloor;


    if (continuousAlpha < config.contAlphaTarget + 0.001 && config.brownian === 0) {
      for (const n of nodes) {
        n.vx *= 0.5;
        n.vy *= 0.5;
      }
    }

    continuousIteration++;


    let packed = getPositionsPacked();
    self.postMessage(
      {
        type: 'tick',
        packed: packed.buffer,
        alpha: continuousAlpha,
        energy: energy,
        iteration: continuousIteration,
      },
      [packed.buffer],
    );


    if (!self._initialDoneSent && Math.abs(continuousAlpha - config.contAlphaTarget) < 0.05) {
      self._initialDoneSent = true;
      self.postMessage({
        type: 'done',
        positions: getPositions(),
        iterations: continuousIteration,
      });
    }


    if (
      Math.abs(continuousAlpha - config.contAlphaTarget) < 1e-4 &&
      energy < nodes.length * 0.01 &&
      config.brownian === 0
    ) {
      paused = true;
      continuousTimer = null;
      return;
    }

    continuousTimer = setTimeout(runTick, 16);
  }

  runTick();
}
