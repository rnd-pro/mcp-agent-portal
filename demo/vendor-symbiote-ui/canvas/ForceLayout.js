/**
 * ForceLayout — Main-thread wrapper for the ForceWorker.
 *
 * Manages Web Worker lifecycle and streams position updates
 * to the canvas via requestAnimationFrame batching.
 *
 * Usage:
 *   const force = new ForceLayout(canvas);
 *   force.start({ nodes, edges, groups, options });
 *   force.onTick = (positions) => { ... };
 *   force.stop();
 *
 * @module symbiote-ui/canvas/ForceLayout
 */

import { normalizeForceGroups } from './graph-layout.js';
import { computeCrystalTargets } from './CrystalLayout.js';

const FALLBACK_DEFAULT_OPTIONS = Object.freeze({
  chargeStrength: -150,
  linkDistance: 150,
  linkStrength: 0.25,
  groupDistance: 120,
  groupStrength: 0.05,
  centerStrength: 0,
  centerPull: 0.3,
  velocityDecay: 0.92,
  collideStrength: 1,
  collisionPadding: 18,
  alphaDecay: 0.015,
  alphaMin: 0.001,
  alphaTarget: 0,
  initialAlpha: 1,
  layoutAlgorithm: 'organic',
  positionOrigin: 'center',
  contAlphaFloor: 0.001,
  contAlphaTarget: 0.001,
  brownian: 0,
  brownianThresh: 0.001,
  pinReheat: 0.03,
  pinCap: 0.1,
  resumeReheat: 0.05,
  resumeCap: 0.1,
  crystalStrength: 0.18,
});

function finiteNumber(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function normalizeMass(value) {
  return clamp(finiteNumber(value, 1), 0.35, 8);
}

function normalizeParticipation(value) {
  return clamp(finiteNumber(value, 1), 0, 1);
}

function normalizeSizeScale(value) {
  return clamp(finiteNumber(value, 1), 0.12, 1);
}

function normalizeLayoutAlgorithm(value) {
  return value === 'spring' || value === 'oil-cloud' || value === 'crystal' ? value : 'organic';
}

function normalizePositionOrigin(value) {
  return value === 'center' ? 'center' : 'top-left';
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
  return clamp(0.18 + participation * 0.82, 0, 1);
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

function hashUnit(value) {
  let text = String(value || '');
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return ((hash >>> 0) % 10000) / 10000;
}

function fallbackJitter(id, axis) {
  return (hashUnit(`${id}:${axis}`) - 0.5) * 0.01;
}

function retainLayoutData(data = {}) {
  return {
    ...data,
    nodes: Array.isArray(data.nodes) ? data.nodes : [],
    edges: Array.isArray(data.edges) ? data.edges : [],
    groups: data.groups || {},
    options: { ...(data.options || {}) },
  };
}

function applyFallbackCrystalForces(nodes, options, alpha) {
  if (options.layoutAlgorithm !== 'crystal') return;
  let strength = clamp(finiteNumber(options.crystalStrength, FALLBACK_DEFAULT_OPTIONS.crystalStrength), 0.01, 0.8);
  let sizeScale = clamp(26 / Math.max(6, Math.sqrt(nodes.length) * 3.2), 0.5, 1);
  for (const node of nodes) {
    if (!Number.isFinite(node.crystalTargetX) || !Number.isFinite(node.crystalTargetY)) continue;
    let scale = getMovementScale(node);
    if (scale <= 0) continue;
    let dx = node.x - node.crystalTargetX;
    let dy = node.y - node.crystalTargetY;
    let distance = Math.sqrt(dx * dx + dy * dy);
    if (distance < 0.35) continue;
    let shellScale = node.crystalShell === 0 ? 1.35 : 1;
    let pull = clamp(strength * alpha * 0.95 * sizeScale * shellScale * scale, 0.006, 0.24);
    node.x -= dx * pull;
    node.y -= dy * pull;
    node.vx -= dx * pull * 0.18;
    node.vy -= dy * pull * 0.18;
  }
}

function getFallbackClouds(nodeById, groups, options) {
  let clouds = [];
  if (options.layoutAlgorithm !== 'oil-cloud') return clouds;
  for (const [groupId, memberIds] of Object.entries(groups || {})) {
    let members = memberIds.map((id) => nodeById.get(id)).filter(Boolean);
    if (members.length < 2) continue;
    let cx = 0;
    let cy = 0;
    let totalMass = 0;
    for (const member of members) {
      let mass = getEffectiveMass(member);
      cx += member.x * mass;
      cy += member.y * mass;
      totalMass += mass;
    }
    cx /= Math.max(1, totalMass);
    cy /= Math.max(1, totalMass);
    let radius = 0;
    for (const member of members) {
      let nodeRadius = Math.max(getEffectiveWidth(member), getEffectiveHeight(member)) / 2;
      radius = Math.max(radius, Math.hypot(member.x - cx, member.y - cy) + nodeRadius);
    }
    clouds.push({ id: groupId, members, x: cx, y: cy, radius: radius * 1.12 });
  }
  return clouds;
}

function applyFallbackCloudForces(nodeById, groups, options, alpha) {
  let clouds = getFallbackClouds(nodeById, groups, options);
  if (clouds.length === 0) return;

  for (const cloud of clouds) {
    for (const node of cloud.members) {
      let scale = getMovementScale(node);
      node.vx -= (node.x - cloud.x) * options.wellStrength * alpha * 0.16 * scale;
      node.vy -= (node.y - cloud.y) * options.wellStrength * alpha * 0.16 * scale;
    }
  }

  for (let i = 0; i < clouds.length; i++) {
    for (let j = i + 1; j < clouds.length; j++) {
      let a = clouds[i];
      let b = clouds[j];
      let dx = b.x - a.x;
      let dy = b.y - a.y;
      let distance = Math.sqrt(dx * dx + dy * dy) || 1;
      let minDistance = a.radius + b.radius + options.groupDistance * 0.2;
      if (distance >= minDistance) continue;
      let push = ((minDistance - distance) / distance) * options.wellRepulsion * alpha * 0.04;
      let px = dx * push;
      let py = dy * push;
      for (const node of a.members) {
        node.vx -= px / Math.max(1, getEffectiveMass(node));
        node.vy -= py / Math.max(1, getEffectiveMass(node));
      }
      for (const node of b.members) {
        node.vx += px / Math.max(1, getEffectiveMass(node));
        node.vy += py / Math.max(1, getEffectiveMass(node));
      }
    }
  }
}

function resolveFallbackOptions(options = {}) {
  let resolved = { ...FALLBACK_DEFAULT_OPTIONS, ...(options || {}) };
  resolved.alphaMin = finiteNumber(
    options.alphaMin,
    finiteNumber(options.alphaFloor, FALLBACK_DEFAULT_OPTIONS.alphaMin)
  );
  resolved.contAlphaFloor = finiteNumber(
    options.contAlphaFloor,
    finiteNumber(options.alphaFloor, FALLBACK_DEFAULT_OPTIONS.contAlphaFloor)
  );
  resolved.contAlphaTarget = finiteNumber(
    options.contAlphaTarget,
    finiteNumber(options.alphaTarget, FALLBACK_DEFAULT_OPTIONS.contAlphaTarget)
  );
  resolved.initialAlpha = clamp(
    finiteNumber(options.initialAlpha, FALLBACK_DEFAULT_OPTIONS.initialAlpha),
    resolved.contAlphaFloor,
    1
  );
  resolved.layoutAlgorithm = normalizeLayoutAlgorithm(options.layoutAlgorithm);
  resolved.positionOrigin = normalizePositionOrigin(options.positionOrigin ?? resolved.positionOrigin);
  resolved.mode = options.mode === 'continuous' ? 'continuous' : 'converge';
  return resolved;
}

export class ForceLayout {
  /** @type {Worker|null} */
  #worker = null;

  /** @type {boolean} */
  #running = false;

  /** @type {object|null} */
  #retainedData = null;

  /** @type {boolean} */
  #paused = false;

  /** @type {object|null} */
  #latestPositions = null;

  /** @type {object|null} */
  #latestMeta = null;

  /** @type {number|null} */
  #rafId = null;

  /** @type {string[]|null} Node ID order for unpacking Float32Array */
  #nodeIds = null;

  /** @type {{id: ReturnType<typeof setTimeout>|number, type: 'raf'|'timeout'}|null} */
  #fallbackTimer = null;

  /** @type {object|null} */
  #fallbackState = null;

  /** @type {Function|null} */
  onTick = null;

  /** @type {Function|null} */
  onDone = null;

  /**
   * Resolve an absolute URL to the ForceWorker script.
   * Uses import.meta.url to anchor the resolution, making it
   * safe across import maps, bundlers, and static serving.
   * @returns {string}
   */
  static defaultWorkerUrl() {
    return new URL('./ForceWorker.js', import.meta.url).href;
  }

  /**
   * @param {string} workerUrl - URL to ForceWorker.js
   */
  constructor(workerUrl) {
    this._workerUrl = workerUrl;
  }

  static createFallbackPositions(data = {}) {
    let nodes = Array.isArray(data.nodes) ? data.nodes : [];
    let positions = {};
    if (nodes.length === 0) return positions;

    let options = resolveFallbackOptions(data.options || {});
    if (options.layoutAlgorithm === 'crystal') {
      let targets = computeCrystalTargets(nodes, data.edges || [], data.groups || {}, options);
      for (const node of nodes) {
        if (!node?.id) continue;
        if (Number.isFinite(node.x) && Number.isFinite(node.y)) {
          positions[node.id] = { x: node.x, y: node.y };
          continue;
        }
        let target = targets[node.id] || { x: fallbackJitter(node.id, 'x') * 100, y: fallbackJitter(node.id, 'y') * 100 };
        positions[node.id] = { x: target.x, y: target.y };
      }
      return positions;
    }

    let radius = Math.max(120, Math.sqrt(nodes.length) * 95);
    let goldenAngle = Math.PI * (3 - Math.sqrt(5));
    for (let index = 0; index < nodes.length; index++) {
      let node = nodes[index];
      if (!node?.id) continue;
      if (Number.isFinite(node.x) && Number.isFinite(node.y)) {
        positions[node.id] = { x: node.x, y: node.y };
        continue;
      }
      let ring = Math.sqrt((index + 1) / nodes.length) * radius;
      let angle = index * goldenAngle;
      positions[node.id] = {
        x: Math.cos(angle) * ring,
        y: Math.sin(angle) * ring,
      };
    }
    return positions;
  }

  /**
   * Start force simulation.
   * @param {object} data
   * @param {Array<{id: string, x?: number, y?: number, mass?: number, group?: string}>} data.nodes
   * @param {Array<{from: string, to: string, strength?: number}>} data.edges
   * @param {Object<string, string[]>} [data.groups] - { groupId: [nodeId, ...] }
   * @param {object} [data.options] - Override simulation parameters (mode: 'converge'|'continuous')
   */
  start(data) {
    this.stop();
    let retainedData = retainLayoutData(data);

    try {
      let WorkerCtor = globalThis.Worker;
      if (typeof WorkerCtor !== 'function') {
        throw new Error('Worker API is unavailable');
      }
      this.#worker = new WorkerCtor(this._workerUrl);
    } catch (err) {
      this.#startMainThreadFallback(retainedData, err);
      return;
    }
    this.#running = true;
    this.#paused = false;
    this.#nodeIds = null;

    this.#worker.onmessage = (e) => {
      let msg = e.data;


      if (msg.type === 'nodeIds') {
        this.#nodeIds = msg.ids;
        return;
      }

      if (msg.type === 'tick') {

        if (msg.packed && this.#nodeIds) {
          let buf = new Float32Array(msg.packed);
          let positions = {};
          for (let i = 0; i < this.#nodeIds.length; i++) {
            positions[this.#nodeIds[i]] = {
              x: buf[i * 2],
              y: buf[i * 2 + 1],
            };
          }
          this.#latestPositions = positions;
        } else {

          this.#latestPositions = msg.positions;
        }
        this.#latestMeta = {
          alpha: msg.alpha,
          energy: msg.energy,
          iteration: msg.iteration,
        };
        this.#scheduleRender();
      }

      if (msg.type === 'done') {
        this.#latestPositions = msg.positions;
        this.#latestMeta = {
          alpha: msg.alpha,
          energy: msg.energy,
          iteration: msg.iteration ?? msg.iterations,
        };
        this.#flushRender();


        this.onDone?.(msg.positions, msg.iteration);
      }
    };

    this.#worker.onerror = (err) => {
      this.#startMainThreadFallback(retainedData, err);
    };

    this.#retainedData = retainedData;
    let options = resolveFallbackOptions(retainedData.options);
    let crystalTargets = options.layoutAlgorithm === 'crystal'
      ? computeCrystalTargets(
        retainedData.nodes,
        retainedData.edges,
        retainedData.groups,
        options,
      )
      : null;

    this.#worker.postMessage({ type: 'init', ...retainedData, crystalTargets });
  }

  /** Stop simulation and terminate Worker. */
  stop() {
    if (this.#worker) {
      this.#worker.postMessage({ type: 'stop' });
    }
    this.#cleanup();
  }

  /** Pause simulation (continuous mode). Worker stays alive. */
  pause() {
    if (!this.#running || this.#paused) return;
    this.#paused = true;
    if (this.#worker) {
      this.#worker.postMessage({ type: 'pause' });
    } else {
      this.#cancelFallbackFrame();
    }
  }

  /** Resume simulation (continuous mode). Gentle reheat. */
  resume() {
    if (!this.#running || !this.#paused) return;
    this.#paused = false;
    if (this.#worker) {
      this.#worker.postMessage({ type: 'resume' });
    } else if (this.#fallbackState) {
      this.#reheatMainThreadFallback(
        this.#fallbackState.options.resumeReheat,
        this.#fallbackState.options.resumeCap
      );
      this.#scheduleMainThreadFallback();
    }
  }

  /**
   * Pin a node at a fixed position (for drag interactions).
   * In continuous mode, triggers local reheat.
   * @param {string} id
   * @param {number} x
   * @param {number} y
   */
  pin(id, x, y) {
    if (!this.#running) return;
    if (this.#worker) {
      this.#worker.postMessage({ type: 'pin', id, x, y });
      return;
    }
    let node = this.#fallbackState?.nodeById.get(id);
    if (!node) return;
    let originOffsetX = this.#fallbackState.options.positionOrigin === 'center' ? 0 : node.w / 2;
    let originOffsetY = this.#fallbackState.options.positionOrigin === 'center' ? 0 : node.h / 2;
    node.fx = finiteNumber(x, node.x) + originOffsetX;
    node.fy = finiteNumber(y, node.y) + originOffsetY;
    node.x = node.fx;
    node.y = node.fy;
    node.vx = 0;
    node.vy = 0;
    this.#paused = false;
    this.#reheatMainThreadFallback(
      this.#fallbackState.options.pinReheat,
      this.#fallbackState.options.pinCap
    );
    this.#scheduleMainThreadFallback();
  }

  /**
   * Release a pinned node.
   * @param {string} id
   */
  unpin(id) {
    if (!this.#running) return;
    if (this.#worker) {
      this.#worker.postMessage({ type: 'unpin', id });
      return;
    }
    let node = this.#fallbackState?.nodeById.get(id);
    if (!node) return;
    delete node.fx;
    delete node.fy;
    this.#paused = false;
    this.#reheatMainThreadFallback(
      this.#fallbackState.options.pinReheat,
      this.#fallbackState.options.pinCap
    );
    this.#scheduleMainThreadFallback();
  }

  /**
   * Update simulation configuration without restarting the worker.
   * @param {object} config
   */
  updateConfig(config) {
    if (!this.#running || !config || typeof config !== 'object') return;
    let retainedData = this.#retainedData || retainLayoutData({});
    let mergedConfig = { ...retainedData.options, ...config };
    retainedData.options = mergedConfig;
    this.#retainedData = retainedData;
    let nextOptions = resolveFallbackOptions(mergedConfig);
    let crystalTargets = nextOptions.layoutAlgorithm === 'crystal'
      ? computeCrystalTargets(
        retainedData.nodes,
        retainedData.edges,
        retainedData.groups,
        nextOptions,
      )
      : null;
    if (this.#worker) {
      this.#worker.postMessage({ type: 'updateConfig', config: mergedConfig, crystalTargets });
      return;
    }
    if (!this.#fallbackState) return;
    let previous = this.#fallbackState.options;
    let next = resolveFallbackOptions({ ...previous, ...mergedConfig });
    this.#fallbackState.options = next;
    this.#fallbackState.mode = next.mode;
    for (let node of this.#fallbackState.nodes) {
      let target = crystalTargets?.[node.id];
      node.crystalTargetX = target?.x;
      node.crystalTargetY = target?.y;
      node.crystalShell = target?.shell;
    }
    if (config.linkDistance !== undefined || config.linkStrength !== undefined) {
      for (const edge of this.#fallbackState.edges) {
        if (edge.group) continue;
        if (config.linkDistance !== undefined) edge.restLength = next.linkDistance;
        if (config.linkStrength !== undefined) edge.strength = next.linkStrength;
      }
    }
    if (config.groupDistance !== undefined || config.groupStrength !== undefined) {
      for (const edge of this.#fallbackState.edges) {
        if (!edge.group) continue;
        if (config.groupDistance !== undefined) edge.restLength = next.groupDistance;
        if (config.groupStrength !== undefined) edge.strength = next.groupStrength;
      }
    }
    this.#reheatMainThreadFallback(next.resumeReheat, next.resumeCap);
    this.#scheduleMainThreadFallback();
  }

  /** @returns {boolean} */
  get running() {
    return this.#running;
  }

  /** @returns {boolean} */
  get paused() {
    return this.#paused;
  }

  #scheduleRender() {
    if (this.#rafId !== null) return;
    this.#rafId = requestAnimationFrame(() => {
      this.#rafId = null;
      this.#flushRender();
    });
  }

  #flushRender() {
    if (this.#latestPositions) {
      this.onTick?.(this.#latestPositions, this.#latestMeta || {});
      this.#latestPositions = null;
      this.#latestMeta = null;
    }
  }

  #startMainThreadFallback(data, err) {
    this.#cleanup();
    if (err) {
      console.warn('[ForceLayout] Worker unavailable; using main-thread fallback.', err);
    }
    let retainedData = retainLayoutData(data);
    this.#retainedData = retainedData;
    this.#fallbackState = this.#createMainThreadFallbackState(retainedData);
    this.#running = true;
    this.#paused = false;
    this.#scheduleMainThreadFallback();
  }

  #cleanup() {
    if (this.#rafId !== null) {
      cancelAnimationFrame(this.#rafId);
      this.#rafId = null;
    }
    this.#cancelFallbackFrame();
    if (this.#worker) {
      this.#worker.terminate();
      this.#worker = null;
    }
    this.#running = false;
    this.#paused = false;
    this.#nodeIds = null;
    this.#latestMeta = null;
    this.#latestPositions = null;
    this.#fallbackState = null;
    this.#retainedData = null;
  }

  #createMainThreadFallbackState(data = {}) {
    let rawNodes = Array.isArray(data.nodes) ? data.nodes : [];
    let rawEdges = Array.isArray(data.edges) ? data.edges : [];
    let options = resolveFallbackOptions(data.options || {});
    let crystalTargets = options.layoutAlgorithm === 'crystal'
      ? computeCrystalTargets(rawNodes, rawEdges, data.groups || {}, options)
      : {};
    let fallbackPositions = ForceLayout.createFallbackPositions(data);
    let nodes = [];
    let nodeById = new Map();

    for (let index = 0; index < rawNodes.length; index++) {
      let rawNode = rawNodes[index];
      if (!rawNode?.id) continue;
      let position = fallbackPositions[rawNode.id] || {};
      let crystalTarget = crystalTargets[rawNode.id] || {};
      let crystalSeed = options.layoutAlgorithm === 'crystal'
        && !Number.isFinite(rawNode.x)
        && !Number.isFinite(rawNode.y)
        && Number.isFinite(crystalTarget.seedX)
        && Number.isFinite(crystalTarget.seedY)
        ? { x: crystalTarget.seedX, y: crystalTarget.seedY }
        : null;
      let node = {
        id: rawNode.id,
        x: finiteNumber(rawNode.x, finiteNumber(crystalSeed?.x, finiteNumber(position.x, fallbackJitter(rawNode.id, 'x') * 100))),
        y: finiteNumber(rawNode.y, finiteNumber(crystalSeed?.y, finiteNumber(position.y, fallbackJitter(rawNode.id, 'y') * 100))),
        vx: 0,
        vy: 0,
        w: Math.max(1, finiteNumber(rawNode.w, options.nodeWidth || 80)),
        h: Math.max(1, finiteNumber(rawNode.h, options.nodeHeight || 40)),
        mass: normalizeMass(rawNode.mass),
        layoutParticipation: normalizeParticipation(rawNode.layoutParticipation),
        layoutWarmupTicks: Math.max(0, finiteNumber(rawNode.layoutWarmupTicks, 0)),
        layoutSizeScale: normalizeSizeScale(rawNode.layoutSizeScale),
        layoutSizeWarmupTicks: Math.max(0, finiteNumber(rawNode.layoutSizeWarmupTicks, 0)),
        layoutFixedTicks: Math.max(0, finiteNumber(rawNode.layoutFixedTicks, 0)),
        crystalTargetX: crystalTarget.x,
        crystalTargetY: crystalTarget.y,
        crystalShell: crystalTarget.shell,
      };
      node.layoutFixedX = node.x;
      node.layoutFixedY = node.y;
      nodes.push(node);
      nodeById.set(node.id, node);
    }

    let edges = [];
    let edgeKeys = new Set();
    let rawDegree = new Map(nodes.map((node) => [node.id, 0]));
    for (const rawEdge of rawEdges) {
      let sourceId = rawEdge?.from ?? rawEdge?.source;
      let targetId = rawEdge?.to ?? rawEdge?.target;
      if (!nodeById.has(sourceId) || !nodeById.has(targetId)) continue;
      let edgeKey = [sourceId, targetId].sort().join('\0');
      edgeKeys.add(edgeKey);
      rawDegree.set(sourceId, (rawDegree.get(sourceId) || 0) + 1);
      rawDegree.set(targetId, (rawDegree.get(targetId) || 0) + 1);
      edges.push({
        sourceId,
        targetId,
        restLength: finiteNumber(rawEdge.restLength, finiteNumber(rawEdge.distance, options.linkDistance)),
        strength: finiteNumber(rawEdge.strength, options.linkStrength),
        group: false,
      });
    }

    let groups = normalizeForceGroups(data.groups || {}, new Set(nodeById.keys()));
    for (const memberIds of Object.values(groups)) {
      if (memberIds.length < 2) continue;
      let hubId = memberIds[0];
      let maxDegree = -1;
      for (const memberId of memberIds) {
        let degree = rawDegree.get(memberId) ?? 0;
        if (degree > maxDegree) {
          maxDegree = degree;
          hubId = memberId;
        }
      }
      for (const memberId of memberIds) {
        if (memberId === hubId) continue;
        let edgeKey = [hubId, memberId].sort().join('\0');
        if (edgeKeys.has(edgeKey)) continue;
        edgeKeys.add(edgeKey);
        edges.push({
          sourceId: hubId,
          targetId: memberId,
          restLength: finiteNumber(options.groupDistance, FALLBACK_DEFAULT_OPTIONS.groupDistance),
          strength: finiteNumber(options.groupStrength, FALLBACK_DEFAULT_OPTIONS.groupStrength),
          group: true,
        });
      }
    }

    return {
      nodes,
      edges,
      nodeById,
      groups,
      options,
      mode: options.mode,
      alpha: options.initialAlpha,
      iteration: 0,
      initialDoneSent: false,
      maxIterations: Math.max(1, Math.ceil(Math.log(options.alphaMin) / Math.log(1 - options.alphaDecay)) + 1),
    };
  }

  #scheduleMainThreadFallback() {
    if (!this.#fallbackState || !this.#running || this.#paused || this.#fallbackTimer) return;
    let callback = () => {
      this.#fallbackTimer = null;
      this.#stepMainThreadFallback();
    };
    if (typeof globalThis.requestAnimationFrame === 'function') {
      this.#fallbackTimer = { id: globalThis.requestAnimationFrame(callback), type: 'raf' };
    } else {
      this.#fallbackTimer = { id: setTimeout(callback, 16), type: 'timeout' };
    }
  }

  #cancelFallbackFrame() {
    if (!this.#fallbackTimer) return;
    if (this.#fallbackTimer.type === 'raf' && typeof globalThis.cancelAnimationFrame === 'function') {
      globalThis.cancelAnimationFrame(this.#fallbackTimer.id);
    } else {
      clearTimeout(this.#fallbackTimer.id);
    }
    this.#fallbackTimer = null;
  }

  #stepMainThreadFallback() {
    let state = this.#fallbackState;
    if (!state || !this.#running || this.#paused) return;

    let energy = this.#tickMainThreadFallback(state);
    state.iteration++;
    let options = state.options;
    let target = state.mode === 'continuous' ? options.contAlphaTarget : options.alphaTarget;
    state.alpha += (target - state.alpha) * clamp(options.alphaDecay, 0.001, 0.9);
    if (state.mode === 'continuous' && state.alpha < options.contAlphaFloor) {
      state.alpha = options.contAlphaFloor;
    }

    let positions = this.#getFallbackPositions(state);
    this.onTick?.(positions, {
      alpha: state.alpha,
      energy,
      iteration: state.iteration,
      fallback: true,
    });

    if (state.mode === 'continuous') {
      if (!state.initialDoneSent && Math.abs(state.alpha - options.contAlphaTarget) < 0.05) {
        state.initialDoneSent = true;
        this.onDone?.(positions, state.iteration);
      }
      if (
        Math.abs(state.alpha - options.contAlphaTarget) < 1e-4 &&
        energy < Math.max(1, state.nodes.length) * 0.01 &&
        options.brownian === 0
      ) {
        this.#paused = true;
        return;
      }
      this.#scheduleMainThreadFallback();
      return;
    }

    if (state.alpha <= options.alphaMin || state.iteration >= state.maxIterations) {
      this.#running = false;
      this.onDone?.(positions, state.iteration);
      return;
    }
    this.#scheduleMainThreadFallback();
  }

  #tickMainThreadFallback(state) {
    let { nodes, edges, options } = state;
    if (nodes.length === 0) return 0;
    let alpha = state.alpha;

    for (const edge of edges) {
      let source = state.nodeById.get(edge.sourceId);
      let target = state.nodeById.get(edge.targetId);
      if (!source || !target) continue;
      let participation = Math.min(getParticipation(source), getParticipation(target));
      if (participation <= 0.01) continue;
      let dx = target.x - source.x;
      let dy = target.y - source.y;
      if (Math.abs(dx) < 1e-6 && Math.abs(dy) < 1e-6) {
        dx = fallbackJitter(`${source.id}:${target.id}`, 'link-x');
        dy = fallbackJitter(`${source.id}:${target.id}`, 'link-y');
      }
      let distance = Math.sqrt(dx * dx + dy * dy) || 1;
      let linkScale = options.layoutAlgorithm === 'crystal' ? 0.28 : 1;
      let force = ((distance - edge.restLength) / distance) * edge.strength * alpha * participation * linkScale;
      let fx = dx * force;
      let fy = dy * force;
      source.vx += fx / Math.max(1, getEffectiveMass(source));
      source.vy += fy / Math.max(1, getEffectiveMass(source));
      target.vx -= fx / Math.max(1, getEffectiveMass(target));
      target.vy -= fy / Math.max(1, getEffectiveMass(target));
    }

    let chargeScale = options.layoutAlgorithm === 'crystal' ? 0.18 : 1;
    let charge = Math.abs(finiteNumber(options.chargeStrength, FALLBACK_DEFAULT_OPTIONS.chargeStrength)) * alpha * chargeScale;
    for (let i = 0; i < nodes.length; i++) {
      let a = nodes[i];
      for (let j = i + 1; j < nodes.length; j++) {
        let b = nodes[j];
        let dx = b.x - a.x;
        let dy = b.y - a.y;
        if (Math.abs(dx) < 1e-6 && Math.abs(dy) < 1e-6) {
          dx = fallbackJitter(`${a.id}:${b.id}`, 'charge-x');
          dy = fallbackJitter(`${a.id}:${b.id}`, 'charge-y');
        }
        let distanceSq = Math.max(dx * dx + dy * dy, 25);
        let forceParticipation = Math.min(getParticipation(a), getParticipation(b));
        let force = charge * getEffectiveMass(a) * getEffectiveMass(b) * forceParticipation / distanceSq;
        a.vx -= dx * force / Math.max(1, getEffectiveMass(a));
        a.vy -= dy * force / Math.max(1, getEffectiveMass(a));
        b.vx += dx * force / Math.max(1, getEffectiveMass(b));
        b.vy += dy * force / Math.max(1, getEffectiveMass(b));

        let distance = Math.sqrt(distanceSq) || 1;
        let massPad = Math.max(0, getEffectiveMass(a) - 1) * 2.4
          + Math.max(0, getEffectiveMass(b) - 1) * 2.4;
        let minDistance = (
          Math.max(getEffectiveWidth(a), getEffectiveHeight(a))
          + Math.max(getEffectiveWidth(b), getEffectiveHeight(b))
        ) / 2 + options.collisionPadding + massPad;
        let collisionParticipation = Math.min(getCollisionParticipation(a), getCollisionParticipation(b));
        if (distance < minDistance && collisionParticipation > 0.05) {
          let push = ((minDistance - distance) / distance) * options.collideStrength * collisionParticipation * 0.5;
          let px = dx * push;
          let py = dy * push;
          a.vx -= px / Math.max(1, getEffectiveMass(a));
          a.vy -= py / Math.max(1, getEffectiveMass(a));
          b.vx += px / Math.max(1, getEffectiveMass(b));
          b.vy += py / Math.max(1, getEffectiveMass(b));
        }
      }
    }

    applyFallbackCloudForces(state.nodeById, state.groups, options, alpha);
    applyFallbackCrystalForces(nodes, options, alpha);

    if (options.layoutAlgorithm !== 'crystal') {
      let centerStrength = finiteNumber(options.centerStrength, 0);
      if (centerStrength <= 0) {
        centerStrength = finiteNumber(options.centerPull, FALLBACK_DEFAULT_OPTIONS.centerPull) * 0.02;
      }
      for (const node of nodes) {
        let scale = getMovementScale(node);
        node.vx -= node.x * centerStrength * alpha * scale;
        node.vy -= node.y * centerStrength * alpha * scale;
        if (options.brownian > 0 && alpha < options.brownianThresh && node.fx === undefined) {
          node.vx += fallbackJitter(`${node.id}:${state.iteration}`, 'brownian-x') * options.brownian;
          node.vy += fallbackJitter(`${node.id}:${state.iteration}`, 'brownian-y') * options.brownian;
        }
      }
    } else if (options.brownian > 0 && alpha < options.brownianThresh) {
      for (const node of nodes) {
        if (node.fx === undefined) node.vx += fallbackJitter(`${node.id}:${state.iteration}`, 'brownian-x') * options.brownian;
        if (node.fy === undefined) node.vy += fallbackJitter(`${node.id}:${state.iteration}`, 'brownian-y') * options.brownian;
      }
    }

    let energy = 0;
    let decay = clamp(1 - finiteNumber(options.velocityDecay, FALLBACK_DEFAULT_OPTIONS.velocityDecay), 0.02, 0.98);
    let maxVelocity = Math.max(80, Math.sqrt(nodes.length) * 40);
    for (const node of nodes) {
      if (node.fx === undefined && node.fy === undefined && node.layoutFixedTicks > 0) {
        node.x = node.layoutFixedX;
        node.y = node.layoutFixedY;
        node.vx = 0;
        node.vy = 0;
        node.layoutFixedTicks -= 1;
      } else if (node.fx !== undefined) {
        node.x = node.fx;
        node.y = node.fy;
        node.vx = 0;
        node.vy = 0;
      } else {
        node.vx = clamp(node.vx * decay, -maxVelocity, maxVelocity);
        node.vy = clamp(node.vy * decay, -maxVelocity, maxVelocity);
        node.x += node.vx;
        node.y += node.vy;
      }
      energy += node.vx * node.vx + node.vy * node.vy;
    }
    advanceLayoutParticipation(nodes);
    return energy;
  }

  #getFallbackPositions(state) {
    let positions = {};
    for (const node of state.nodes) {
      positions[node.id] = state.options.positionOrigin === 'center'
        ? { x: node.x, y: node.y }
        : { x: node.x - node.w / 2, y: node.y - node.h / 2 };
    }
    return positions;
  }

  #reheatMainThreadFallback(amount, cap) {
    if (!this.#fallbackState) return;
    this.#fallbackState.alpha = Math.min(
      this.#fallbackState.alpha + finiteNumber(amount, 0.03),
      finiteNumber(cap, 0.1)
    );
  }
}
