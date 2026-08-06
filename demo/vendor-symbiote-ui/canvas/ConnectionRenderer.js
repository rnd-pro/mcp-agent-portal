/* global document */
/**
 * ConnectionRenderer — SVG connection path manager
 *
 * Handles rendering Bézier curves between sockets,
 * gradient coloring, flow animation, socket offset calculation.
 * Extracted from NodeCanvas to reduce complexity.
 *
 * @module symbiote-ui/canvas/ConnectionRenderer
 */

import { getShape } from '../shapes/index.js';
import { CONNECTION_MARKER_METRICS } from '../tokens/scale.js';
import { routePcbTrace } from './PcbRouter.js';
import { alignSampledRouteEndpoints } from './CanvasGraph/CanvasGraphViewport.js';
import {
  projectConnectionMarkerGeometry,
  resolveConnectionMarker,
  resolveContainmentJunctions,
  isConnectionMarkerOccluded,
} from './ConnectionMarker.js';

function getSvgRouteHalfWidth(path) {
  try {
    const view = path?.ownerDocument?.defaultView;
    const strokeWidth = Number.parseFloat(view?.getComputedStyle?.(path)?.strokeWidth || '');
    if (Number.isFinite(strokeWidth) && strokeWidth > 0) return strokeWidth / 2;
  } catch {}
  return CONNECTION_MARKER_METRICS.protectedRouteHalfWidth;
}

function sampleBezier(startX, startY, cp1x, cp1y, cp2x, cp2y, endX, endY, count = 20) {
  const points = [];
  for (let i = 0; i <= count; i++) {
    const t = i / count;
    const mt = 1 - t;
    const x = mt*mt*mt*startX + 3*mt*mt*t*cp1x + 3*mt*t*t*cp2x + t*t*t*endX;
    const y = mt*mt*mt*startY + 3*mt*mt*t*cp1y + 3*mt*t*t*cp2y + t*t*t*endY;
    points.push({ x, y });
  }
  return points;
}

function svgPathIdForConnection(connId) {
  let encoded = Array.from(String(connId), (char) => char.codePointAt(0).toString(16)).join('-');
  return `sn-conn-path-${encoded || 'unknown'}`;
}

function compactPathPoints(points) {
  let compact = [];
  for (let point of points) {
    let prev = compact.at(-1);
    if (!prev || Math.abs(prev.x - point.x) > 0.5 || Math.abs(prev.y - point.y) > 0.5) {
      compact.push(point);
    }
  }
  return compact;
}

function parsePathPoints(d) {
  let tokens = String(d || '').match(/[MLHVCSQTAZ]|-?\d*\.?\d+(?:e[-+]?\d+)?/gi) || [];
  let points = [];
  let index = 0;
  let command = '';
  let x = 0;
  let y = 0;
  let readNumber = () => Number(tokens[index++]);

  while (index < tokens.length) {
    let token = tokens[index++];
    if (/^[a-z]$/i.test(token)) {
      command = token.toUpperCase();
    } else {
      index -= 1;
    }

    if (command === 'M' || command === 'L') {
      x = readNumber();
      y = readNumber();
      if (Number.isFinite(x) && Number.isFinite(y)) points.push({ x, y });
    } else if (command === 'H') {
      x = readNumber();
      if (Number.isFinite(x) && Number.isFinite(y)) points.push({ x, y });
    } else if (command === 'V') {
      y = readNumber();
      if (Number.isFinite(x) && Number.isFinite(y)) points.push({ x, y });
    } else if (command === 'C') {
      index += 4;
      x = readNumber();
      y = readNumber();
      if (Number.isFinite(x) && Number.isFinite(y)) points.push({ x, y });
    } else {
      break;
    }
  }

  return compactPathPoints(points);
}

function sampleSvgPathPoints(path, sampleCount = 36) {
  if (!path?.getTotalLength || !path?.getPointAtLength) return [];
  let total = path.getTotalLength();
  if (!Number.isFinite(total) || total <= 0) return parsePathPoints(path.getAttribute('d') || '');
  let count = Math.max(2, Math.round(sampleCount));
  let points = [];
  for (let i = 0; i < count; i++) {
    let point = path.getPointAtLength((total * i) / (count - 1));
    points.push({ x: point.x, y: point.y });
  }
  return compactPathPoints(points);
}

function appendRouteSegment(route, points) {
  for (let point of points) {
    let previous = route.at(-1);
    if (!previous || Math.abs(previous.x - point.x) > 0.5 || Math.abs(previous.y - point.y) > 0.5) {
      route.push(point);
    }
  }
}

function applySvgJunctionState(junctionEl, pathById) {
  const connectionIds = junctionEl.getAttribute('data-connection-ids')?.split(',') || [];
  const paths = connectionIds.map((id) => pathById.get(id)).filter(Boolean);
  const isSelected = paths.some((path) => path.hasAttribute('data-selected'));
  const isActive = paths.some((path) => path.hasAttribute('data-active-conn'));
  const isDimmed = !isActive && paths.some((path) => path.hasAttribute('data-dimmed'));
  junctionEl.toggleAttribute('data-selected', isSelected);
  junctionEl.toggleAttribute('data-active-conn', isActive);
  junctionEl.toggleAttribute('data-dimmed', isDimmed);
}

export function reconcileSvgJunctionMarkers(svgLayer, connections, connectionPoints, editor) {
  const junctions = resolveContainmentJunctions(connections, connectionPoints);
  const activeKeys = new Set(junctions.map((junction) => junction.key));
  const connectionById = new Map(connections.map((connection) => [String(connection.id), connection]));
  const pathById = new Map(
    Array.from(svgLayer.querySelectorAll('[data-conn-id]'), (path) => [
      path.getAttribute('data-conn-id'),
      path,
    ])
  );

  for (const element of svgLayer.querySelectorAll('g[data-conn-marker^="junction::"]')) {
    if (!activeKeys.has(element.getAttribute('data-conn-marker'))) element.remove();
  }

  for (const junction of junctions) {
    const owner = connectionById.get(junction.ownerId);
    const source = owner ? editor?.getNode(owner.from || owner.source?.nodeId) : null;
    const color = source?.outputs?.[owner?.out]?.socket?.color || '';
    updateSvgMarker(junction.key, junction, svgLayer, color);
    const element = svgLayer.querySelector(`[data-conn-marker="${junction.key}"]`);
    element.setAttribute('data-connection-ids', junction.connectionIds.join(','));
    applySvgJunctionState(element, pathById);
  }

  return junctions;
}

export function renderConnectionBatch(connections, renderConnection, reconcileMarkers) {
  let rendered = 0;
  try {
    for (const connection of connections) {
      renderConnection(connection);
      rendered++;
    }
  } finally {
    reconcileMarkers();
  }
  return rendered;
}

export class ConnectionRenderer {
  /** @type {Map<string, import('../core/Connection.js').Connection>} */
  #connectionData = new Map();

  /** @type {Map<string, Array<{x: number, y: number}>>} */
  #connectionPoints = new Map();

  #markerModels = new Map();
  #activeConnIds = new Set();
  #selectedConnIds = new Set();

  /** @type {SVGElement} */
  #svgLayer;

  /** @type {SVGElement} - overlay layer for dots (z-index above nodes) */
  #dotLayer;

  /** @type {Map<string, HTMLElement>} */
  #nodeViews;

  /** @type {import('../core/Editor.js').NodeEditor} */
  #editor;

  /** @type {function} */
  #onConnectionClick;

  /** @type {function} */
  #getZoom;

  /** @type {function|null} - callback when dot is dragged: (socketData) => void */
  #onDotDrag = null;

  /** @type {'bezier'|'orthogonal'|'straight'|'pcb'} */
  #pathStyle = 'bezier';

  /** @type {''|'bezier'|'orthogonal'|'straight'|'pcb'|'pcb-drag-proxy'} */
  #transientPathStyle = '';

  /** @type {Map<string, { style: 'bezier'|'orthogonal'|'straight'|'pcb'|'pcb-drag-proxy', connectionIds: Set<string>|null, draggedNodeId?: string, frozenPaths?: Map<string, Array<{x:number,y:number}>>, suspendProgressivePcb?: boolean }>} */
  #transientPathStyleRequests = new Map();

  #progressivePcbQueue = new Set();
  #progressivePcbFrame = 0;
  #progressivePcbBatchSize = 4;
  #processingProgressivePcb = false;

  #batchMode = false;
  #junctionsDirty = false;

  #pcbPathSignature(conn, pathStyle, geometry) {
    let rounded = [
      geometry.startX,
      geometry.startY,
      geometry.endX,
      geometry.endY,
      geometry.fromPos.x,
      geometry.fromPos.y,
      geometry.toPos.x,
      geometry.toPos.y,
      geometry.fromW,
      geometry.fromH,
      geometry.toW,
      geometry.toH,
      geometry.fromAngle ?? 0,
      geometry.toAngle ?? 180,
    ].map((value) => Math.round(Number(value || 0) * 10) / 10);
    return [
      pathStyle,
      conn.from,
      conn.out,
      conn.to,
      conn.in,
      conn.kind || '',
      conn.direction || '',
      conn.design?.marker?.role || '',
      ...rounded,
    ].join(':');
  }

  /**
   * @param {object} config
   * @param {SVGElement} config.svgLayer
   * @param {SVGElement} [config.dotLayer]
   * @param {Map<string, HTMLElement>} config.nodeViews
   * @param {import('../core/Editor.js').NodeEditor} config.editor
   * @param {function} config.onConnectionClick - (connId, event)
   * @param {function} config.getZoom - Returns current zoom level
   * @param {function} [config.onDotDrag] - Callback for dot dragging
   */
  constructor({ svgLayer, dotLayer, nodeViews, editor, onConnectionClick, getZoom, onDotDrag }) {
    this.#svgLayer = svgLayer;
    this.#dotLayer = dotLayer || svgLayer;
    this.#nodeViews = nodeViews;
    this.#editor = editor;
    this.#onConnectionClick = onConnectionClick;
    this.#getZoom = getZoom || (() => 1);
    this.#onDotDrag = onDotDrag || null;
  }

  /** @returns {Map<string, import('../core/Connection.js').Connection>} */
  get data() {
    return this.#connectionData;
  }

  getConnectionPathPoints(connId) {
    let path = this.#svgLayer.querySelector(`[data-conn-id="${connId}"]`);
    return sampleSvgPathPoints(path);
  }

  #connectionsForRouting() {
    let connections = [...this.#connectionData.values()];
    if (connections.length) return connections;
    return this.#editor?.getConnections?.() || [];
  }

  #connectionForId(connId) {
    let key = String(connId);
    return this.#connectionsForRouting().find((conn) => String(conn.id) === key) || null;
  }

  getConnectionEndpoints(connId) {
    let conn = this.#connectionForId(connId);
    if (!conn) return null;
    let fromEl = this.#nodeViews.get(conn.from);
    let toEl = this.#nodeViews.get(conn.to);
    if (!fromEl?._position || !toEl?._position) return null;
    let fromPos = fromEl._position;
    let toPos = toEl._position;
    let fromSize = this.#getNodeSize(fromEl, 180, 100);
    let toSize = this.#getNodeSize(toEl, 180, 100);
    let fromCenter = { x: fromPos.x + fromSize.width / 2, y: fromPos.y + fromSize.height / 2 };
    let toCenter = { x: toPos.x + toSize.width / 2, y: toPos.y + toSize.height / 2 };
    let fromOffset = this.getSocketOffset(fromEl, conn.out, 'output', toCenter);
    let toOffset = this.getSocketOffset(toEl, conn.in, 'input', fromCenter);
    return {
      start: { x: fromPos.x + fromOffset.x, y: fromPos.y + fromOffset.y },
      end: { x: toPos.x + toOffset.x, y: toPos.y + toOffset.y },
    };
  }

  getRouteBetweenNodes(fromNodeId, toNodeId, { maxDepth = 8 } = {}) {
    let fromId = String(fromNodeId || '');
    let toId = String(toNodeId || '');
    if (!fromId || !toId || fromId === toId) return null;

    let adjacency = new Map();
    let ensure = (id) => {
      if (!adjacency.has(id)) adjacency.set(id, []);
      return adjacency.get(id);
    };
    for (const conn of this.#connectionsForRouting()) {
      ensure(conn.from).push({ nodeId: conn.to, connId: conn.id, reverse: false });
      ensure(conn.to).push({ nodeId: conn.from, connId: conn.id, reverse: true });
    }

    let queue = [{ nodeId: fromId, segments: [] }];
    let visited = new Set([fromId]);
    while (queue.length) {
      let current = queue.shift();
      if (!current || current.segments.length >= maxDepth) continue;
      for (let edge of adjacency.get(current.nodeId) || []) {
        if (visited.has(edge.nodeId)) continue;
        let nextSegments = [...current.segments, edge];
        if (edge.nodeId === toId) {
          let route = [];
          for (let segment of nextSegments) {
            let endpoints = this.getConnectionEndpoints(segment.connId);
            let sampled = this.getConnectionPathPoints(segment.connId);
            if (segment.reverse) sampled = [...sampled].reverse();
            let points;
            if (endpoints) {
              let start = segment.reverse ? endpoints.end : endpoints.start;
              let end = segment.reverse ? endpoints.start : endpoints.end;
              points = sampled.length >= 2
                ? alignSampledRouteEndpoints(sampled, start, end)
                : [start, end];
            } else {
              points = sampled;
            }
            appendRouteSegment(route, points);
          }
          return {
            points: route.length >= 2 ? route : [],
            nodeIds: [fromId, ...nextSegments.map((segment) => segment.nodeId)],
            connectionIds: nextSegments.map((segment) => segment.connId),
          };
        }
        visited.add(edge.nodeId);
        queue.push({ nodeId: edge.nodeId, segments: nextSegments });
      }
    }

    return null;
  }

  /** Defer derived-junction reconciliation during NodeCanvas batch initialization. */
  setBatchMode(on) {
    const wasBatching = this.#batchMode;
    this.#batchMode = Boolean(on);
    if (wasBatching && !this.#batchMode && this.#junctionsDirty) {
      this.#junctionsDirty = false;
      this.#reconcileJunctions();
    }
  }

  /**
   * Read the current rendered node size. SVG nodes can resize after creation
   * through params, so offset dimensions must take precedence over stale cache.
   * @param {HTMLElement} nodeEl
   * @param {number} fallbackWidth
   * @param {number} fallbackHeight
   * @returns {{ width: number, height: number }}
   */
  #getNodeSize(nodeEl, fallbackWidth, fallbackHeight) {
    return {
      width: nodeEl.offsetWidth || nodeEl._cachedW || fallbackWidth,
      height: nodeEl.offsetHeight || nodeEl._cachedH || fallbackHeight,
    };
  }

  #getLocalElementCenter(nodeEl, childEl) {
    let nodeRect = nodeEl.getBoundingClientRect();
    let childRect = childEl.getBoundingClientRect();
    let localWidth = nodeEl.offsetWidth || nodeEl._cachedW || nodeRect.width;
    let localHeight = nodeEl.offsetHeight || nodeEl._cachedH || nodeRect.height;
    let scaleX = nodeRect.width && localWidth ? nodeRect.width / localWidth : this.#getZoom();
    let scaleY = nodeRect.height && localHeight ? nodeRect.height / localHeight : this.#getZoom();
    if (!Number.isFinite(scaleX) || scaleX === 0) scaleX = 1;
    if (!Number.isFinite(scaleY) || scaleY === 0) scaleY = scaleX;
    return {
      x: (childRect.left - nodeRect.left + childRect.width / 2) / scaleX,
      y: (childRect.top - nodeRect.top + childRect.height / 2) / scaleY,
    };
  }

  #buildNodeRectCache() {
    const rects = new Map();
    for (const [nid, el] of this.#nodeViews) {
      if (!el) continue;
      const size = this.#getNodeSize(el, 180, 100);
      rects.set(nid, {
        id: nid,
        x: el._position?.x || 0,
        y: el._position?.y || 0,
        w: size.width,
        h: size.height,
      });
    }
    return rects;
  }

  #nodeRectsForRouting() {
    return [...(this._nodeRectCache || this.#buildNodeRectCache()).values()];
  }

  /**
   * Add a connection and render its SVG path
   * @param {import('../core/Connection.js').Connection} conn
   */
  add(conn) {
    this.#connectionData.set(conn.id, conn);

    this.removeFreeDot(conn.from, conn.out, 'output');
    this.removeFreeDot(conn.to, conn.in, 'input');

    this.#fullRerenderForNodes(new Set([conn.from, conn.to]));
  }

  /**
   * Bulk add connections and render them in a single batch.
   * Greatly improves performance when inflating large graphs.
   * @param {import('../core/Connection.js').Connection[]} conns
   */
  addBatch(conns) {
    if (!conns || conns.length === 0) return;
    for (const conn of conns) {
      this.#connectionData.set(conn.id, conn);
    }
    this.refreshAll();
  }

  /**
   * Clear slot registries and caches for all known nodes
   */
  #clearAllSlots() {
    for (const [, el] of this.#nodeViews) {
      el._usedCoords = [];
      el._slotCache = new Map();
    }
  }

  #nodeRects() {
    const rects = [];
    for (const [nid, el] of this.#nodeViews) {
      if (!el?._position) continue;
      rects.push({
        id: nid,
        x: el._position.x,
        y: el._position.y,
        w: el.offsetWidth || el._cachedW || 180,
        h: el.offsetHeight || el._cachedH || 100,
      });
    }
    return rects;
  }

  /**
   * Full re-render: clear all slots for affected nodes, recalculate everything
   * @param {Set<string>} nodeIds
   */
  #fullRerenderForNodes(nodeIds) {
    let allNodes = new Set(nodeIds);
    let conns = [];
    for (const [, conn] of this.#connectionData) {
      if (nodeIds.has(conn.from) || nodeIds.has(conn.to)) {
        allNodes.add(conn.from);
        allNodes.add(conn.to);
        conns.push(conn);
      }
    }
    for (const nid of allNodes) {
      let el = this.#nodeViews.get(nid);
      if (el) {
        el._usedCoords = [];
        el._slotCache = new Map();
      }
    }
    const previousRectCache = this._nodeRectCache;
    this._nodeRectCache = this.#buildNodeRectCache();
    try {
      renderConnectionBatch(
        conns,
        (conn) => this.#render(conn),
        () => this.#reconcileJunctions(),
      );
    } finally {
      this._nodeRectCache = previousRectCache || null;
    }
  }

  /**
   * Remove a connection path
   * @param {import('../core/Connection.js').Connection} conn
   */
  remove(conn) {
    let fromId = conn.from;
    let toId = conn.to;
    this.#connectionData.delete(conn.id);
    this.#progressivePcbQueue.delete(conn.id);
    this.#connectionPoints.delete(conn.id);
    this.#markerModels.delete(conn.id);
    let path = this.#svgLayer.querySelector(`[data-conn-id="${conn.id}"]`);
    if (path) {

      path.style.opacity = '0';
      path.addEventListener('transitionend', () => path.remove(), { once: true });

      setTimeout(() => {
        if (path.parentNode) path.remove();
      }, 200);
    }

    for (const end of ['start', 'end']) {
      let dot = this.#dotLayer.querySelector(`[data-conn-dot="${conn.id}-${end}"]`);
      if (dot) dot.remove();
    }
    let markerEl = this.#svgLayer.querySelector(`[data-conn-marker="${conn.id}"]`);
    if (markerEl) markerEl.remove();

    let textEl = this.#getConnectionText(conn.id);
    if (textEl) textEl.remove();

    this.renderFreeDots(fromId);
    this.renderFreeDots(toId);
    this.#reconcileJunctions();
  }

  #getConnectionText(connId) {
    return Array.from(this.#svgLayer.querySelectorAll('[data-conn-text]'))
      .find((el) => el.getAttribute('data-conn-text') === String(connId)) || null;
  }

  /**
   * Highlight overlay dots belonging to compatible nodes during drag
   * @param {Set<string>} compatibleNodeIds - set of node IDs that have compatible ports
   */
  highlightDotsForNodes(compatibleNodeIds) {

    let connDots = this.#dotLayer.querySelectorAll('.sn-conn-dot');
    for (const dot of connDots) {
      let dotId = dot.getAttribute('data-conn-dot') || '';
      let connId = dotId.replace(/-(?:start|end)$/, '');
      let conn = this.#connectionData.get(connId);
      if (!conn) continue;
      let end = dotId.endsWith('-start') ? 'start' : 'end';
      let nodeId = end === 'start' ? conn.from : conn.to;
      if (compatibleNodeIds.has(nodeId)) {
        dot.classList.add('sn-dot-hint');
      } else {
        dot.classList.remove('sn-dot-hint');
      }
    }


    let freeDots = this.#dotLayer.querySelectorAll('.sn-free-dot');
    for (const dot of freeDots) {
      let nodeId = dot.getAttribute('data-node-id');
      if (compatibleNodeIds.has(nodeId)) {
        dot.classList.add('sn-dot-hint');
      } else {
        dot.classList.remove('sn-dot-hint');
      }
    }
  }

  /**
   * Clear all dot highlights
   */
  clearDotHighlights() {
    let dots = this.#dotLayer.querySelectorAll('.sn-dot-hint');
    for (const dot of dots) {
      dot.classList.remove('sn-dot-hint');
    }
  }

  /**
   * Update all connections touching a node
   * @param {string} nodeId
   */
  updateForNode(nodeId) {


    let draggedEl = this.#nodeViews.get(nodeId);
    if (draggedEl) {
      draggedEl._usedCoords = [];
      draggedEl._slotCache = new Map();
    }


    let touchedConns = [];
    for (const [, conn] of this.#connectionData) {
      if (conn.from === nodeId || conn.to === nodeId) {
        touchedConns.push(conn);
      }
    }

    const previousRectCache = this._nodeRectCache;
    this._nodeRectCache = this.#buildNodeRectCache();
    try {
      renderConnectionBatch(
        touchedConns,
        (conn) => this.#render(conn, nodeId),
        () => this.#reconcileJunctions(),
      );
    } finally {
      this._nodeRectCache = previousRectCache || null;
    }
  }

  prewarmNodes(nodeIds = []) {
    let ids = [...new Set((nodeIds || []).map(String).filter(Boolean))];
    for (let nodeId of ids) {
      if (!this.#nodeViews.has(nodeId)) continue;
      this.updateForNode(nodeId);
      this.refreshFreeDots(nodeId);
    }
    return ids;
  }

  /**
   * Clear all caches and re-render every connection + free dots.
   * Call after initial node positioning to let SVG connectors settle.
   */
  refreshAll() {
    this.#cancelProgressivePcb();
    this.#clearAllSlots();


    let staleDots = this.#dotLayer.querySelectorAll('.sn-free-dot');
    for (const dot of staleDots) dot.remove();


    let originalSvgDisplay = this.#svgLayer.style.display;
    let originalDotDisplay = this.#dotLayer.style.display;
    this.#svgLayer.style.display = 'none';
    this.#dotLayer.style.display = 'none';


    this._nodeRectCache = new Map();
    for (const [nid, el] of this.#nodeViews) {
      if (el) {
        this._nodeRectCache.set(nid, {
          id: nid,
          x: el._position?.x || 0,
          y: el._position?.y || 0,
          w: el.offsetWidth || el._cachedW || 180,
          h: el.offsetHeight || el._cachedH || 100,
        });
      }
    }


    let conns = Array.from(this.#connectionData.values());


    /** @type {Map<string, Array<{portKey: string, portSide: string, targetPos: {x:number, y:number}}>>} */
    let nodeJobs = new Map();

    for (const conn of conns) {
      let fromEl = this.#nodeViews.get(conn.from);
      let toEl = this.#nodeViews.get(conn.to);
      if (!fromEl || !toEl) continue;

      let fromPos = fromEl._position;
      let toPos = toEl._position;
      if (!fromPos || !toPos) continue;
      const toSize = this.#getNodeSize(toEl, 180, 100);
      const fromSize = this.#getNodeSize(fromEl, 180, 100);

      let toCenter = {
        x: toPos.x + toSize.width / 2,
        y: toPos.y + toSize.height / 2,
      };
      let fromCenter = {
        x: fromPos.x + fromSize.width / 2,
        y: fromPos.y + fromSize.height / 2,
      };

      if (!nodeJobs.has(conn.from)) nodeJobs.set(conn.from, []);
      nodeJobs.get(conn.from).push({ portKey: conn.out, portSide: 'output', targetPos: toCenter });

      if (!nodeJobs.has(conn.to)) nodeJobs.set(conn.to, []);
      nodeJobs.get(conn.to).push({ portKey: conn.in, portSide: 'input', targetPos: fromCenter });
    }


    for (const [nodeId, jobs] of nodeJobs) {
      let el = this.#nodeViews.get(nodeId);
      if (!el?._position) continue;

      let shape = getShape(el.getAttribute('node-shape'));
      if (shape?.pathData && shape.getEdgePoint) continue;
      if (!shape?.getSidePosition) continue;

      let size = this.#getNodeSize(el, 180, 100);
      let cx = el._position.x + size.width / 2;
      let cy = el._position.y + size.height / 2;

      if (!el._slotCache) el._slotCache = new Map();


      /** @type {Map<string, Array<{portKey: string, portSide: string, angle: number}>>} */
      let sideBuckets = new Map();
      for (const job of jobs) {
        let dx = job.targetPos.x - cx;
        let dy = job.targetPos.y - cy;
        let angle = Math.atan2(dy, dx);


        let nodeSide;
        if (Math.abs(dx) > Math.abs(dy)) {
          nodeSide = dx > 0 ? 'right' : 'left';
        } else {
          nodeSide = dy > 0 ? 'bottom' : 'top';
        }

        if (!sideBuckets.has(nodeSide)) sideBuckets.set(nodeSide, []);
        sideBuckets.get(nodeSide).push({ portKey: job.portKey, portSide: job.portSide, angle });
      }


      for (const [nodeSide, bucket] of sideBuckets) {


        if (nodeSide === 'left' || nodeSide === 'right') {
          bucket.sort((a, b) => Math.sin(a.angle) - Math.sin(b.angle));
        } else {
          bucket.sort((a, b) => Math.cos(a.angle) - Math.cos(b.angle));
        }


        let total = bucket.length;
        bucket.forEach((item, index) => {
          let t = total === 1 ? 0.5 : index / (total - 1);
          let pos = shape.getSidePosition(nodeSide, t, size);
          let cacheKey = `${item.portKey}:${item.portSide}`;
          el._slotCache.set(cacheKey, { x: pos.x, y: pos.y, angle: pos.angle });
        });
      }
    }


    renderConnectionBatch(
      conns,
      (conn) => this.#render(conn),
      () => this.#reconcileJunctions(),
    );


    for (const [nodeId, el] of this.#nodeViews) {
      if (el.getAttribute('data-svg-shape')) {
        this.renderFreeDots(nodeId);
      }
    }

    this._allSegments = null;
    this._nodeRectCache = null;


    this.#svgLayer.style.display = originalSvgDisplay;
    this.#dotLayer.style.display = originalDotDisplay;

  }

  /**
   * SVG connections live inside the transformed content layer, so viewport
   * pan/zoom does not require path geometry recalculation.
   */
  refreshViewportTransform() {}

  /**
   * Set data flow animation on a connection
   * @param {string} connId
   * @param {boolean} active
   */
  setFlowing(connId, active) {
    let path = this.#svgLayer.querySelector(`[data-conn-id="${connId}"]`);
    if (!path) return;
    if (active) {
      path.setAttribute('data-flowing', '');
    } else {
      path.removeAttribute('data-flowing');
    }
  }

  /**
   * Set data flow animation on all connections
   * @param {boolean} active
   */
  setAllFlowing(active) {
    for (const [connId] of this.#connectionData) {
      this.setFlowing(connId, active);
    }
  }

  /**
   * Set connection path style
   * @param {'bezier'|'orthogonal'|'straight'|'pcb'} style
   */
  setPathStyle(style) {
    this.#pathStyle = style;
    this.#rerenderAllConnections();
  }

  /**
   * Temporarily override visible path styles without changing the user-selected style.
   * @param {''|'bezier'|'orthogonal'|'straight'|'pcb'|'pcb-drag-proxy'} style
   * @param {{ source?: string, connectionIds?: Iterable<string>, draggedNodeId?: string }} [options]
   */
  setTransientPathStyle(style = '', options = {}) {
    let nextStyle = style || '';
    let source = options.source || 'default';
    let previousScope = this.#transientPathScope();
    let previousRequest = this.#transientPathStyleRequests.get(source);
    let wasProgressiveSuspended = this.#progressivePcbSuspended();

    if (nextStyle) {
      let connectionIds = options.connectionIds
        ? new Set(Array.from(options.connectionIds, String))
        : null;
      if (!connectionIds) this.#cancelProgressivePcb();
      let frozenPaths =
        options.reuseFrozenPaths === true && previousRequest?.style === nextStyle
          ? previousRequest.frozenPaths
          : null;
      if (nextStyle === 'pcb-drag-proxy' && !frozenPaths) {
        frozenPaths = this.#captureConnectionPathPoints(connectionIds);
      }
      this.#transientPathStyleRequests.delete(source);
      this.#transientPathStyleRequests.set(source, {
        style: nextStyle,
        connectionIds,
        draggedNodeId: options.draggedNodeId,
        frozenPaths,
        suspendProgressivePcb: options.suspendProgressivePcb === true,
      });
    } else {
      this.#transientPathStyleRequests.delete(source);
    }

    let isProgressiveSuspended = this.#progressivePcbSuspended();
    if (!wasProgressiveSuspended && isProgressiveSuspended) {
      this.#cancelProgressivePcbFrame();
    }

    let nextRequest = this.#transientPathStyleRequests.get(source);
    if (previousRequest?.style === 'pcb-drag-proxy') {
      this.#removeDragProxyPaths(
        previousRequest.connectionIds,
        nextRequest?.style === 'pcb-drag-proxy' ? nextRequest.connectionIds : null
      );
    }

    this.#transientPathStyle = this.#globalTransientPathStyle();
    let nextScope = this.#transientPathScope();
    if (previousScope.global || nextScope.global) {
      this.#rerenderAllConnections();
      return;
    }
    let affected = this.#changedTransientConnections(previousScope.connectionIds, nextScope.connectionIds);
    if (affected.size) this.#rerenderConnections(affected);
    if (wasProgressiveSuspended && !isProgressiveSuspended) {
      this.#requestProgressivePcbFrame();
    }
  }

  #rerenderAllConnections() {
    this.#cancelProgressivePcb();
    this.#clearAllSlots();
    renderConnectionBatch(
      this.#connectionData.values(),
      (conn) => this.#render(conn),
      () => this.#reconcileJunctions(),
    );
  }

  #rerenderConnections(connIds) {
    for (const connId of connIds) this.#progressivePcbQueue.delete(connId);
    const connections = Array.from(connIds, (connId) => this.#connectionData.get(connId)).filter(Boolean);
    renderConnectionBatch(
      connections,
      (conn) => this.#render(conn),
      () => this.#reconcileJunctions(),
    );
  }

  #cancelProgressivePcb() {
    this.#cancelProgressivePcbFrame();
    this.#processingProgressivePcb = false;
    this.#progressivePcbQueue.clear();
  }

  #cancelProgressivePcbFrame() {
    if (this.#progressivePcbFrame && typeof cancelAnimationFrame === 'function') {
      cancelAnimationFrame(this.#progressivePcbFrame);
    }
    this.#progressivePcbFrame = 0;
  }

  #progressivePcbSuspended() {
    for (const request of this.#transientPathStyleRequests.values()) {
      if (request.suspendProgressivePcb) return true;
    }
    return false;
  }

  #requestProgressivePcbFrame() {
    if (
      this.#processingProgressivePcb ||
      this.#progressivePcbFrame ||
      this.#progressivePcbSuspended() ||
      !this.#progressivePcbQueue.size ||
      typeof requestAnimationFrame !== 'function'
    ) {
      return;
    }
    this.#progressivePcbFrame = requestAnimationFrame(() => {
      this.#progressivePcbFrame = 0;
      this.#processProgressivePcb();
    });
  }

  suspendProgressiveRendering(source = 'viewport-motion') {
    this.#transientPathStyleRequests.set(source, {
      style: this.#pathStyle,
      connectionIds: new Set(),
      suspendProgressivePcb: true,
    });
    this.#cancelProgressivePcbFrame();
  }

  resumeProgressiveRendering(source = 'viewport-motion') {
    let changed = this.#transientPathStyleRequests.delete(source);
    if (changed) this.#requestProgressivePcbFrame();
  }

  #connectionHasTransientRequest(connId) {
    for (const request of this.#transientPathStyleRequests.values()) {
      if (!request.connectionIds || request.connectionIds.has(connId)) return true;
    }
    return false;
  }

  #scheduleProgressivePcb(connId) {
    if (this.#connectionHasTransientRequest(connId)) return;
    this.#progressivePcbQueue.add(connId);
    this.#requestProgressivePcbFrame();
  }

  #processProgressivePcb() {
    if (!this.#progressivePcbQueue.size) return;
    if (this.#progressivePcbSuspended()) return;
    let batch = [...this.#progressivePcbQueue]
      .filter((connId) => !this.#connectionHasTransientRequest(connId))
      .slice(0, this.#progressivePcbBatchSize);
    if (!batch.length) {
      this.#progressivePcbFrame = 0;
      return;
    }
    let previousRectCache = this._nodeRectCache;
    this._nodeRectCache = this.#buildNodeRectCache();
    this.#processingProgressivePcb = true;
    try {
      renderConnectionBatch(
        batch,
        (connId) => {
          this.#progressivePcbQueue.delete(connId);
          let conn = this.#connectionData.get(connId);
          if (conn) this.#render(conn, '', { fullPcb: true });
        },
        () => this.#reconcileJunctions(),
      );
    } finally {
      this.#processingProgressivePcb = false;
      this._nodeRectCache = previousRectCache || null;
    }
    this.#requestProgressivePcbFrame();
  }

  #captureConnectionPathPoints(connectionIds) {
    let frozenPaths = new Map();
    if (!connectionIds) return frozenPaths;
    for (let connId of connectionIds) {
      let path = this.#svgLayer.querySelector(`[data-conn-id="${connId}"]`);
      let points = parsePathPoints(path?.getAttribute('d') || '');
      if (points.length >= 2) frozenPaths.set(connId, points);
    }
    return frozenPaths;
  }

  #renderDragProxy(connId, d) {
    let proxy = this.#svgLayer.querySelector(`[data-conn-proxy-id="${connId}"]`);
    if (!proxy) {
      proxy = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      proxy.setAttribute('class', 'sn-conn-drag-proxy');
      proxy.setAttribute('data-conn-proxy-id', connId);
      proxy.setAttribute('fill', 'none');
      proxy.setAttribute('pointer-events', 'none');
      this.#svgLayer.appendChild(proxy);
    }
    proxy.setAttribute('d', d);
  }

  #removeDragProxyPaths(connectionIds = null, keepIds = null) {
    let keep = keepIds ? new Set(keepIds) : null;
    let proxies = connectionIds
      ? Array.from(connectionIds, (connId) =>
          this.#svgLayer.querySelector(`[data-conn-proxy-id="${connId}"]`)
        ).filter(Boolean)
      : Array.from(this.#svgLayer.querySelectorAll('[data-conn-proxy-id]'));

    for (const proxy of proxies) {
      let connId = proxy.getAttribute('data-conn-proxy-id') || '';
      if (!keep || !keep.has(connId)) proxy.remove();
    }
  }

  #reconcileJunctions() {
    if (this.#batchMode) {
      this.#junctionsDirty = true;
      return [];
    }
    this.#junctionsDirty = false;
    const junctions = reconcileSvgJunctionMarkers(
      this.#svgLayer,
      [...this.#connectionData.values()],
      this.#connectionPoints,
      this.#editor
    );
    for (const key of this.#markerModels.keys()) {
      if (typeof key === 'string' && key.startsWith('junction::')) {
        this.#markerModels.delete(key);
      }
    }
    for (const j of junctions) {
      this.#markerModels.set(j.key, j);
    }
    this.updateSvgMarkerCollisions();
    return junctions;
  }

  #globalTransientPathStyle() {
    let pathStyle = '';
    for (const request of this.#transientPathStyleRequests.values()) {
      if (!request.connectionIds) pathStyle = request.style;
    }
    return pathStyle;
  }

  #transientPathScope() {
    let connectionIds = new Set();
    for (const request of this.#transientPathStyleRequests.values()) {
      if (!request.connectionIds) {
        return { global: true, connectionIds };
      }
      for (const connId of request.connectionIds) connectionIds.add(connId);
    }
    return { global: false, connectionIds };
  }

  #changedTransientConnections(previousIds, nextIds) {
    let changed = new Set();
    for (const connId of previousIds) {
      if (!nextIds.has(connId)) changed.add(connId);
    }
    for (const connId of nextIds) {
      if (!previousIds.has(connId)) changed.add(connId);
    }
    return changed;
  }

  #pathStyleForConnection(conn) {
    return this.#transientRequestForConnection(conn)?.style || this.#pathStyle;
  }

  #transientRequestForConnection(conn) {
    let pathStyle = this.#pathStyle;
    let matched = null;
    for (const request of this.#transientPathStyleRequests.values()) {
      if (!request.connectionIds || request.connectionIds.has(conn.id)) {
        pathStyle = request.style;
        matched = request;
      }
    }
    return matched ? { ...matched, style: pathStyle } : null;
  }

  /** @returns {'bezier'|'orthogonal'|'straight'} */
  get pathStyle() {
    return this.#pathStyle;
  }

  /** @returns {''|'bezier'|'orthogonal'|'straight'|'pcb'|'pcb-drag-proxy'} */
  get transientPathStyle() {
    return this.#transientPathStyle;
  }

  /**
   * Get socket offset relative to graph-node.
   * For SVG shapes with a target position, computes dynamic edge point
   * in the direction of the connected node (connector slides along perimeter).
   *
   * @param {HTMLElement} nodeEl
   * @param {string} portKey
   * @param {'input'|'output'} side
   * @param {{ x: number, y: number }} [targetPos] - center of the connected node (for dynamic edge)
   * @returns {{ x: number, y: number }}
   */
  getSocketOffset(nodeEl, portKey, side, targetPos) {

    let shape = getShape(nodeEl.getAttribute('node-shape'));
    let nodeData = nodeEl._nodeData;
    if (shape && shape.pathData && nodeData) {
      let size = this.#getNodeSize(nodeEl, 180, 100);


      if (targetPos && shape.getEdgePoint) {
        let ports = side === 'output' ? nodeData.outputs : nodeData.inputs;
        let keys = ports ? Object.keys(ports) : [portKey];
        let index = keys.indexOf(portKey);
        let total = keys.length;

        let nodePos = nodeEl._position;
        let cx = nodePos.x + size.width / 2;
        let cy = nodePos.y + size.height / 2;
        let baseAngle = Math.atan2(targetPos.y - cy, targetPos.x - cx);


        let dy = targetPos.y - cy;
        let shouldReverse = side === 'output' ? dy < 0 : dy > 0;
        let effectiveIndex = shouldReverse ? total - 1 - index : index;


        let angle = baseAngle;
        if (total > 1) {
          let sideGap = Math.PI / 6;
          let adjustedBase = baseAngle + (side === 'output' ? -sideGap : sideGap);
          let segment = (2 * Math.PI) / (total * 2);
          let offset = (effectiveIndex - (total - 1) / 2) * segment;
          angle = adjustedBase + offset;
        }


        let step = Math.PI / 12;
        angle = Math.round(angle / step) * step;


        if (!nodeEl._slotCache) nodeEl._slotCache = new Map();
        let cacheKey = `${portKey}:${side}:${Math.round(angle * 1000)}`;
        if (nodeEl._slotCache.has(cacheKey)) {
          return nodeEl._slotCache.get(cacheKey);
        }


        if (!nodeEl._usedCoords) nodeEl._usedCoords = [];
        const MIN_PIX = 5;
        let nudged = angle;
        let attempts = 0;
        while (attempts < 24) {
          let testPos = shape.getEdgePoint(nudged, size);
          let tooClose = nodeEl._usedCoords.some(
            (c) => Math.abs(testPos.x - c.x) < MIN_PIX && Math.abs(testPos.y - c.y) < MIN_PIX
          );
          if (!tooClose) break;
          nudged += step;
          attempts++;
        }

        let pos = shape.getEdgePoint(nudged, size);
        nodeEl._usedCoords.push({ x: pos.x, y: pos.y });
        let result = { x: pos.x, y: pos.y, angle: pos.angle };
        nodeEl._slotCache.set(cacheKey, result);
        return result;
      }


      if (targetPos && shape.getSidePosition) {

        if (!nodeEl._slotCache) nodeEl._slotCache = new Map();
        let cacheKey = `${portKey}:${side}`;
        if (nodeEl._slotCache.has(cacheKey)) {
          return nodeEl._slotCache.get(cacheKey);
        }


        let nodePos = nodeEl._position;
        let cx = nodePos.x + size.width / 2;
        let cy = nodePos.y + size.height / 2;
        let dx = targetPos.x - cx;
        let dy = targetPos.y - cy;


        let nodeSide =
          Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'bottom' : 'top';

        let pos = shape.getSidePosition(nodeSide, 0.5, size);
        let result = { x: pos.x, y: pos.y, angle: pos.angle };
        nodeEl._slotCache.set(cacheKey, result);
        return result;
      }

      let ports = side === 'output' ? nodeData.outputs : nodeData.inputs;
      if (ports) {
        let keys = Object.keys(ports);
        let index = keys.indexOf(portKey);
        let total = keys.length;
        if (index >= 0) {
          let pos = shape.getSocketPosition(side, index, total, size);
          return { x: pos.x, y: pos.y };
        }
      }
    }


    if (nodeEl.style.contentVisibility === 'hidden') {
      return {
        x: side === 'output' ? nodeEl._cachedW || 180 : 0,
        y: (nodeEl._cachedH || 100) / 2,
      };
    }


    let container =
      side === 'output' ? nodeEl.querySelector('.outputs') : nodeEl.querySelector('.inputs');

    if (container) {
      let portItems = container.querySelectorAll('port-item');
      for (const portItem of portItems) {
        if (portItem.$.key === portKey) {
          let socket = portItem.querySelector('.sn-socket');
          if (socket) {
            return this.#getLocalElementCenter(nodeEl, socket);
          }
        }
      }
    }

    return {
      x: side === 'output' ? nodeEl._cachedW || nodeEl.offsetWidth || 180 : 0,
      y: (nodeEl._cachedH || nodeEl.offsetHeight || 100) / 2,
    };
  }

  /**
   * Render a single connection SVG path with tangent-aware Bézier and gradient coloring
   * @param {import('../core/Connection.js').Connection} conn
   * @returns {void}
   */
  #render(conn, _changedNodeId = '', options = {}) {
    let fromEl = this.#nodeViews.get(conn.from);
    let toEl = this.#nodeViews.get(conn.to);
    if (!fromEl || !toEl) return;

    let fromPos = fromEl._position;
    let toPos = toEl._position;


    let fromSizeMeasured = this.#getNodeSize(fromEl, 180, 100);
    let toSizeMeasured = this.#getNodeSize(toEl, 180, 100);
    let fromW = fromSizeMeasured.width;
    let fromH = fromSizeMeasured.height;
    let toW = toSizeMeasured.width;
    let toH = toSizeMeasured.height;
    let fromCenter = {
      x: fromPos.x + fromW / 2,
      y: fromPos.y + fromH / 2,
    };
    let toCenter = {
      x: toPos.x + toW / 2,
      y: toPos.y + toH / 2,
    };


    let fromOffset = this.getSocketOffset(fromEl, conn.out, 'output', toCenter);
    let toOffset = this.getSocketOffset(toEl, conn.in, 'input', fromCenter);

    let startX = fromPos.x + fromOffset.x;
    let startY = fromPos.y + fromOffset.y;
    let endX = toPos.x + toOffset.x;
    let endY = toPos.y + toOffset.y;


    let fromNode = this.#editor.getNode(conn.from);
    let toNode = this.#editor.getNode(conn.to);
    let fromShape = getShape(fromNode?.shape);
    let toShape = getShape(toNode?.shape);

    let fromSize = { width: fromW, height: fromH };
    let toSize = { width: toW, height: toH };


    let transientRequest = this.#transientRequestForConnection(conn);
    let pathStyle = transientRequest?.style || this.#pathStyle;
    let path = this.#svgLayer.querySelector(`[data-conn-id="${conn.id}"]`);
    let renderFullPcb = options.fullPcb === true || this.#progressivePcbSuspended();
    let pcbSignature = '';
    if (pathStyle === 'pcb') {
      pcbSignature = this.#pcbPathSignature(conn, pathStyle, {
        startX,
        startY,
        endX,
        endY,
        fromPos,
        toPos,
        fromW,
        fromH,
        toW,
        toH,
        fromAngle: fromOffset.angle ?? 0,
        toAngle: toOffset.angle ?? 180,
      });
      if (
        !renderFullPcb &&
        path?.getAttribute('data-pcb-quality') === 'full' &&
        path.getAttribute('data-pcb-signature') === pcbSignature
      ) {
        return;
      }
    }

    let d;
    let points = [];
    if (pathStyle === 'straight') {
      d = `M ${startX} ${startY} L ${endX} ${endY}`;
      points = [{ x: startX, y: startY }, { x: endX, y: endY }];
    } else if (pathStyle === 'orthogonal') {
      let connKeys = Array.from(this.#connectionData.keys());
      let connIndex = connKeys.indexOf(conn.id);
      let traceOffset = (connIndex > -1 ? connIndex % 10 : 0) * 4;

      let fromAngle = fromOffset.angle !== undefined ? fromOffset.angle : 0;
      let toAngle = toOffset.angle !== undefined ? toOffset.angle : 180;

      let stubLen = 20;
      let getDxDy = (deg) => ({
        dx: Math.round(Math.cos((deg * Math.PI) / 180)),
        dy: Math.round(Math.sin((deg * Math.PI) / 180)),
      });

      let fDir = getDxDy(fromAngle);
      let tDir = getDxDy(toAngle);

      let p1x = startX + fDir.dx * stubLen;
      let p1y = startY + fDir.dy * stubLen;
      let p2x = endX + tDir.dx * stubLen;
      let p2y = endY + tDir.dy * stubLen;

      let fromH = fromEl._cachedH || 60;
      let toH = toEl._cachedH || 60;

      let pts = [
        { x: startX, y: startY },
        { x: p1x, y: p1y },
      ];

      if (endX < startX) {
        let bottomY = Math.max(fromPos.y + fromH, toPos.y + toH) + 30 + traceOffset;
        pts.push({ x: p1x, y: bottomY });
        pts.push({ x: p2x, y: bottomY });
      } else {
        let maxH = Math.max(fromH, toH);
        if (Math.abs(p1y - p2y) < maxH) {
          let nodeBetween = false;
          for (const [, node] of this.#nodeViews) {
            if (!node._position) continue;
            let nx = node._position.x;
            let ny = node._position.y;
            let nw = node._cachedW || 180;
            let nh = node._cachedH || 60;
            if (nx > p1x && nx + nw < p2x) {
              if (Math.min(p1y, p2y) <= ny + nh && Math.max(p1y, p2y) >= ny) {
                nodeBetween = true;
                break;
              }
            }
          }

          if (nodeBetween) {
            let detourY = Math.min(fromPos.y, toPos.y) - 30 - traceOffset;
            pts.push({ x: p1x, y: detourY });
            pts.push({ x: p2x, y: detourY });
          } else {
            let midX = (p1x + p2x) / 2 + traceOffset;
            pts.push({ x: midX, y: p1y });
            pts.push({ x: midX, y: p2y });
          }
        } else {
          let midX = (p1x + p2x) / 2 + traceOffset;
          let obstacleNode = null;
          let minY = Math.min(p1y, p2y);
          let maxY = Math.max(p1y, p2y);

          for (const [, node] of this.#nodeViews) {
            if (!node._position) continue;
            let nx = node._position.x;
            let ny = node._position.y;
            let nw = node._cachedW || 180;
            let nh = node._cachedH || 60;
            if (midX >= nx && midX <= nx + nw) {
              if (ny <= maxY && ny + nh >= minY) {
                obstacleNode = { x: nx, w: nw };
                break;
              }
            }
          }

          if (obstacleNode) {
            let leftDist = Math.abs(midX - obstacleNode.x);
            let rightDist = Math.abs(midX - (obstacleNode.x + obstacleNode.w));
            if (leftDist < rightDist) {
              midX = obstacleNode.x - 30 - traceOffset;
            } else {
              midX = obstacleNode.x + obstacleNode.w + 30 + traceOffset;
            }
          }

          pts.push({ x: midX, y: p1y });
          pts.push({ x: midX, y: p2y });
        }
      }

      pts.push({ x: p2x, y: p2y });
      pts.push({ x: endX, y: endY });

      let path = `M ${pts[0].x} ${pts[0].y}`;
      for (let i = 1; i < pts.length; i++) {
        let prev = pts[i - 1];
        let curr = pts[i];
        if (curr.x === prev.x && curr.y === prev.y) continue;
        if (curr.x !== prev.x && curr.y !== prev.y) {
          path += ` H ${curr.x} V ${curr.y}`;
        } else if (curr.x !== prev.x) {
          path += ` H ${curr.x}`;
        } else if (curr.y !== prev.y) {
          path += ` V ${curr.y}`;
        }
      }
      d = path;
      points = pts;
    } else if (pathStyle === 'pcb-drag-proxy') {
      d = this.#buildPcbDragProxyPath(conn, transientRequest, {
        start: { x: startX, y: startY },
        end: { x: endX, y: endY },
        fromAngle: fromOffset.angle ?? 0,
        toAngle: toOffset.angle ?? 180,
      }) || `M ${startX} ${startY} L ${endX} ${endY}`;
      points = [{ x: startX, y: startY }, { x: endX, y: endY }];
      this.#connectionPoints.set(conn.id, points);
      this.#renderDragProxy(conn.id, d);
      return;
    } else if (pathStyle === 'pcb') {
      let routed = routePcbTrace({
        start: { x: startX, y: startY },
        end: { x: endX, y: endY },
        fromRect: { id: conn.from, x: fromPos.x, y: fromPos.y, w: fromW, h: fromH },
        toRect: { id: conn.to, x: toPos.x, y: toPos.y, w: toW, h: toH },
        fromAngle: fromOffset.angle ?? 0,
        toAngle: toOffset.angle ?? 180,
        rects: this._nodeRectCache ? [...this._nodeRectCache.values()] : this.#nodeRects(),
        connections: [...this.#connectionData.values()],
        conn,
        quality: renderFullPcb ? 'full' : 'draft',
      });
      d = routed.path;
      points = routed.renderPoints || routed.points || [];
      if (!renderFullPcb) {
        this.#scheduleProgressivePcb(conn.id);
      }
    } else {
      let fromAngleDeg, toAngleDeg;

      if (fromOffset.angle !== undefined) {
        fromAngleDeg = fromOffset.angle;
      } else {
        let fromPortIndex = fromNode ? Object.keys(fromNode.outputs).indexOf(conn.out) : 0;
        let fromPortTotal = fromNode ? Object.keys(fromNode.outputs).length : 1;
        let pos = fromShape?.getSocketPosition?.('output', fromPortIndex, fromPortTotal, fromSize);
        fromAngleDeg = pos?.angle ?? 0;
      }

      if (toOffset.angle !== undefined) {
        toAngleDeg = toOffset.angle;
      } else {
        let toPortIndex = toNode ? Object.keys(toNode.inputs).indexOf(conn.in) : 0;
        let toPortTotal = toNode ? Object.keys(toNode.inputs).length : 1;
        let pos = toShape?.getSocketPosition?.('input', toPortIndex, toPortTotal, toSize);
        toAngleDeg = pos?.angle ?? 180;
      }

      let dist = Math.sqrt((endX - startX) ** 2 + (endY - startY) ** 2);
      let cpLen = Math.max(50, dist * 0.4);
      let fromRad = (fromAngleDeg * Math.PI) / 180;
      let toRad = (toAngleDeg * Math.PI) / 180;

      let cp1x = startX + Math.cos(fromRad) * cpLen;
      let cp1y = startY + Math.sin(fromRad) * cpLen;
      let cp2x = endX + Math.cos(toRad) * cpLen;
      let cp2y = endY + Math.sin(toRad) * cpLen;

      d = `M ${startX} ${startY} C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${endX} ${endY}`;
      points = sampleBezier(startX, startY, cp1x, cp1y, cp2x, cp2y, endX, endY);
    }
    this.#connectionPoints.set(conn.id, points);

    if (!path) {
      path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('class', 'sn-conn-path');
      path.setAttribute('data-conn-id', conn.id);
      path.addEventListener('click', (e) => {
        e.stopPropagation();
        this.#onConnectionClick(conn.id, e);
      });
      this.#svgLayer.appendChild(path);
    }
    let pathId = svgPathIdForConnection(conn.id);
    path.setAttribute('id', pathId);
    path.setAttribute('d', d);
    if (pathStyle === 'pcb') {
      path.setAttribute('data-pcb-quality', renderFullPcb ? 'full' : 'draft');
      path.setAttribute('data-pcb-signature', pcbSignature);
    } else {
      path.removeAttribute('data-pcb-quality');
      path.removeAttribute('data-pcb-signature');
    }


    let fromSocketName = fromNode?.outputs[conn.out]?.socket?.name || 'data';
    if (
      fromSocketName === 'exec' ||
      fromSocketName === 'execution' ||
      fromSocketName === 'trigger'
    ) {
      path.setAttribute('data-wire-type', 'exec');
      path.style.strokeWidth = '3';
      path.style.strokeDasharray = '8 4';
    } else if (
      fromSocketName === 'array' ||
      fromSocketName === 'object' ||
      fromSocketName === 'json'
    ) {
      path.setAttribute('data-wire-type', 'data-heavy');
      path.style.strokeWidth = '2.5';
      path.style.strokeDasharray = '';
    } else {
      path.removeAttribute('data-wire-type');
      path.style.strokeWidth = '';
      path.style.strokeDasharray = '';
    }


    this.#applyGradient(path, conn, fromNode, toNode, startX, startY, endX, endY);


    let outSocketName = fromNode?.outputs?.[conn.out]?.socket?.name || 'data';
    let inSocketName = toNode?.inputs?.[conn.in]?.socket?.name || outSocketName;


    this.#updateDot(conn.id, 'start', startX, startY, 'output', outSocketName);
    this.#updateDot(conn.id, 'end', endX, endY, 'input', inSocketName);


    const marker = resolveConnectionMarker(points, conn, {
      connections: [...this.#connectionData.values()],
      connectionPoints: this.#connectionPoints,
    });
    if (marker && marker.type !== 'none') {
      this.#markerModels.set(conn.id, marker);
    } else {
      this.#markerModels.delete(conn.id);
    }
    let fromColor = fromNode?.outputs?.[conn.out]?.socket?.color;
    updateSvgMarker(conn.id, marker, this.#svgLayer, fromColor);

    let labelText = conn.label || conn.metadata?.label || '';
    let textEl = this.#getConnectionText(conn.id);
    if (labelText) {
      if (!textEl) {
        textEl = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        textEl.setAttribute('data-conn-text', String(conn.id));
        textEl.setAttribute('class', 'sn-conn-label');
        textEl.setAttribute('text-anchor', 'middle');
        textEl.setAttribute('dy', '-6');
        this.#svgLayer.appendChild(textEl);
      }
      textEl.replaceChildren();
      let textPath = document.createElementNS('http://www.w3.org/2000/svg', 'textPath');
      textPath.setAttribute('href', `#${pathId}`);
      textPath.setAttribute('startOffset', '50%');
      textPath.textContent = labelText;
      textEl.appendChild(textPath);
    } else {
      if (textEl) textEl.remove();
    }
  }

  #buildPcbDragProxyPath(conn, request, { start, end }) {
    let frozen = request?.frozenPaths?.get?.(conn.id);
    if (!frozen || frozen.length < 2) return '';
    let draggedNodeId = request?.draggedNodeId;
    let movingFrom = draggedNodeId === conn.from;
    let movingTo = draggedNodeId === conn.to;
    if (!movingFrom && !movingTo) return '';

    if (movingFrom) {
      let anchor = frozen[0];
      return `M ${anchor.x} ${anchor.y} L ${start.x} ${start.y}`;
    }

    let anchor = frozen.at(-1);
    return `M ${anchor.x} ${anchor.y} L ${end.x} ${end.y}`;
  }

  /**
   * Create or update a small circle dot at a connector endpoint
   * @param {string} connId
   * @param {'start'|'end'} end
   * @param {number} x
   * @param {number} y
   * @param {'input'|'output'} side
   * @param {string} socketType
   */
  #updateDot(connId, end, x, y, side = 'output', socketType = 'data') {
    let dotId = `${connId}-${end}`;
    let dot = this.#dotLayer.querySelector(`[data-conn-dot="${dotId}"]`);
    if (!dot) {
      dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      dot.setAttribute('data-conn-dot', dotId);
      dot.setAttribute('r', '7');
      this.#dotLayer.appendChild(dot);
    }
    dot.setAttribute('cx', x);
    dot.setAttribute('cy', y);


    if (!dot.hasAttribute('data-svg-wired')) {
      let conn = this.#connectionData.get(connId);
      if (conn) {
        let nodeId = end === 'start' ? conn.from : conn.to;
        let nodeEl = this.#nodeViews.get(nodeId);
        if (nodeEl?.hasAttribute('data-svg-shape')) {
          dot.setAttribute('data-svg-wired', '');
          dot.style.display = '';
          if (this.#onDotDrag) {
            dot.style.pointerEvents = 'auto';
            dot.style.cursor = 'crosshair';
            dot.addEventListener('pointerdown', (e) => {
              e.stopPropagation();
              e.preventDefault();
              let dotX = parseFloat(dot.getAttribute('cx')) || 0;
              let dotY = parseFloat(dot.getAttribute('cy')) || 0;
              let socketData =
                end === 'start'
                  ? { nodeId: conn.from, key: conn.out, side: 'output', worldX: dotX, worldY: dotY }
                  : { nodeId: conn.to, key: conn.in, side: 'input', worldX: dotX, worldY: dotY };
              this.#onDotDrag(socketData);
            });
          }
        }
      }
    }


    let typeClass = 'sn-dot-data';
    if (socketType === 'exec' || socketType === 'execution' || socketType === 'trigger') {
      typeClass = 'sn-dot-exec';
    } else if (socketType === 'ctrl' || socketType === 'control' || socketType === 'signal') {
      typeClass = 'sn-dot-ctrl';
    }
    let sideClass = side === 'input' ? 'sn-dot-input' : 'sn-dot-output';
    dot.setAttribute('class', `sn-conn-dot ${sideClass} ${typeClass}`);
  }



  /**
   * Apply socket-color gradient to connection path
   * @param {SVGPathElement} path
   * @param {import('../core/Connection.js').Connection} conn
   * @param {import('../core/Node.js').Node|undefined} fromNode
   * @param {import('../core/Node.js').Node|undefined} toNode
   * @param {number} startX
   * @param {number} startY
   * @param {number} endX
   * @param {number} endY
   */
  #applyGradient(path, conn, fromNode, toNode, startX, startY, endX, endY) {
    let fromColor = fromNode?.outputs[conn.out]?.socket?.color;
    let toColor = toNode?.inputs[conn.in]?.socket?.color;

    if (fromColor && toColor && fromColor !== toColor) {
      let gradId = `grad-${conn.id}`;
      let defs = this.#svgLayer.querySelector('defs');
      if (!defs) {
        defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
        this.#svgLayer.prepend(defs);
      }
      let grad = defs.querySelector(`#${gradId}`);
      if (!grad) {
        grad = document.createElementNS('http://www.w3.org/2000/svg', 'linearGradient');
        grad.setAttribute('id', gradId);
        let stop1 = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
        stop1.setAttribute('offset', '0%');
        let stop2 = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
        stop2.setAttribute('offset', '100%');
        grad.appendChild(stop1);
        grad.appendChild(stop2);
        defs.appendChild(grad);
      }
      grad.setAttribute('gradientUnits', 'userSpaceOnUse');
      grad.setAttribute('x1', String(startX));
      grad.setAttribute('y1', String(startY));
      grad.setAttribute('x2', String(endX));
      grad.setAttribute('y2', String(endY));
      grad.children[0].setAttribute('stop-color', fromColor);
      grad.children[1].setAttribute('stop-color', toColor);
      path.setAttribute('stroke', `url(#${gradId})`);
    } else if (fromColor) {
      path.setAttribute('stroke', fromColor);
    }
  }
  /**
   * Render persistent free dots for all ports of an SVG node.
   * Called after SVG shape setup. Free dots are interactive drag sources.
   * @param {string} nodeId
   */
  renderFreeDots(nodeId) {
    let nodeEl = this.#nodeViews.get(nodeId);
    let node = this.#editor.getNode(nodeId);
    if (!nodeEl || !node) return;

    let shapeName = nodeEl.getAttribute('data-svg-shape') || nodeEl.getAttribute('node-shape');
    let shape = getShape(shapeName);
    if (!shape?.pathData || !shape.getEdgePoint) return;

    let size = this.#getNodeSize(nodeEl, 100, 100);
    let pos = nodeEl._position;
    if (!pos) return;


    let connectedPorts = new Set();
    for (const [, conn] of this.#connectionData) {
      if (conn.from === nodeId) connectedPorts.add(`output:${conn.out}`);
      if (conn.to === nodeId) connectedPorts.add(`input:${conn.in}`);
    }


    if (!nodeEl._usedCoords) nodeEl._usedCoords = [];
    const MIN_PIX = 12;
    let step = Math.PI / 12;


    let placeDot = (key, side, baseAngle, portData) => {

      let angle = Math.round(baseAngle / step) * step;
      let nudged = angle;
      let attempts = 0;

      while (attempts < 24) {
        let testPos = shape.getEdgePoint(nudged, size);
        let tooClose = nodeEl._usedCoords.some(
          (c) => Math.abs(testPos.x - c.x) < MIN_PIX && Math.abs(testPos.y - c.y) < MIN_PIX
        );
        if (!tooClose) break;
        attempts++;
        let offset = Math.ceil(attempts / 2) * step;
        let dir = attempts % 2 === 1 ? 1 : -1;
        nudged = angle + dir * offset;
      }

      let ep = shape.getEdgePoint(nudged, size);
      nodeEl._usedCoords.push({ x: ep.x, y: ep.y });

      this.#createFreeDot(nodeId, key, side, pos.x + ep.x, pos.y + ep.y, portData);
    };


    let inputKeys = Object.keys(node.inputs);
    inputKeys.forEach((key, i) => {
      if (connectedPorts.has(`input:${key}`)) return;
      let spread = Math.PI * 0.4;
      let baseAngle =
        Math.PI + (inputKeys.length > 1 ? (i / (inputKeys.length - 1) - 0.5) * spread : 0);
      placeDot(key, 'input', baseAngle, node.inputs[key]);
    });


    let outputKeys = Object.keys(node.outputs);
    outputKeys.forEach((key, i) => {
      if (connectedPorts.has(`output:${key}`)) return;
      let spread = Math.PI * 0.4;
      let baseAngle =
        0 + (outputKeys.length > 1 ? (i / (outputKeys.length - 1) - 0.5) * spread : 0);
      placeDot(key, 'output', baseAngle, node.outputs[key]);
    });
  }

  /**
   * Create a single free dot element
   * @param {string} nodeId
   * @param {string} key
   * @param {'input'|'output'} side
   * @param {number} wx - world X
   * @param {number} wy - world Y
   * @param {object} portData - Input/Output instance
   */
  #createFreeDot(nodeId, key, side, wx, wy, portData) {
    let dotId = `free-${nodeId}-${side}-${key}`;

    if (this.#dotLayer.querySelector(`[data-free-dot="${dotId}"]`)) return;

    let dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    dot.setAttribute('data-free-dot', dotId);
    dot.setAttribute('data-node-id', nodeId);
    dot.setAttribute('data-port-key', key);
    dot.setAttribute('data-port-side', side);
    dot.setAttribute('r', '7');
    dot.setAttribute('cx', wx);
    dot.setAttribute('cy', wy);
    dot.style.pointerEvents = 'auto';
    dot.style.cursor = 'crosshair';

    let socketName = portData?.socket?.name || 'data';
    let typeClass = 'sn-dot-data';
    if (socketName === 'exec' || socketName === 'execution' || socketName === 'trigger') {
      typeClass = 'sn-dot-exec';
    } else if (socketName === 'ctrl' || socketName === 'control' || socketName === 'signal') {
      typeClass = 'sn-dot-ctrl';
    }
    let sideClass = side === 'input' ? 'sn-dot-input' : 'sn-dot-output';
    dot.setAttribute('class', `sn-free-dot ${sideClass} ${typeClass}`);

    if (this.#onDotDrag) {
      dot.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        e.preventDefault();
        this.#onDotDrag({
          nodeId,
          key,
          side,
          worldX: parseFloat(dot.getAttribute('cx')) || 0,
          worldY: parseFloat(dot.getAttribute('cy')) || 0,
        });
      });
    }

    this.#dotLayer.appendChild(dot);
  }

  /**
   * Remove free dot when a connection fills this port
   * @param {string} nodeId
   * @param {string} key
   * @param {'input'|'output'} side
   */
  removeFreeDot(nodeId, key, side) {
    let dotId = `free-${nodeId}-${side}-${key}`;
    let dot = this.#dotLayer.querySelector(`[data-free-dot="${dotId}"]`);
    if (dot) dot.remove();
  }

  /**
   * Refresh free dot positions after node move (updates coords without recreating)
   * @param {string} nodeId
   */
  refreshFreeDots(nodeId) {
    let dots = this.#dotLayer.querySelectorAll(`[data-node-id="${nodeId}"][data-free-dot]`);
    if (!dots.length) {

      this.renderFreeDots(nodeId);
      return;
    }

    let nodeEl = this.#nodeViews.get(nodeId);
    let node = this.#editor.getNode(nodeId);
    if (!nodeEl || !node) return;

    let shapeName = nodeEl.getAttribute('data-svg-shape') || nodeEl.getAttribute('node-shape');
    let shape = getShape(shapeName);
    if (!shape?.pathData) return;

    let size = { width: nodeEl.offsetWidth || 100, height: nodeEl.offsetHeight || 100 };
    let pos = nodeEl._position;
    if (!pos) return;

    for (const dot of dots) {
      let key = dot.getAttribute('data-port-key');
      let side = dot.getAttribute('data-port-side');
      let ports = side === 'output' ? node.outputs : node.inputs;
      let keys = Object.keys(ports);
      let index = keys.indexOf(key);
      if (index < 0) continue;
      let sp = shape.getSocketPosition(side, index, keys.length, size);
      dot.setAttribute('cx', pos.x + sp.x);
      dot.setAttribute('cy', pos.y + sp.y);
    }
  }

  /**
   * Find nearest SVG dot (free or connected) to world position within radius.
   * Used as drop target for connections.
   * @param {number} wx - world X
   * @param {number} wy - world Y
   * @param {number} [radius=20] - search radius in world units
   * @returns {{ nodeId: string, key: string, side: string }|null}
   */
  findNearestDot(wx, wy, radius = 20) {
    let bestDist = radius;
    let best = null;


    let freeDots = this.#dotLayer.querySelectorAll('[data-free-dot]');
    for (const dot of freeDots) {
      let cx = parseFloat(dot.getAttribute('cx')) || 0;
      let cy = parseFloat(dot.getAttribute('cy')) || 0;
      let dist = Math.hypot(cx - wx, cy - wy);
      if (dist < bestDist) {
        bestDist = dist;
        best = {
          nodeId: dot.getAttribute('data-node-id'),
          key: dot.getAttribute('data-port-key'),
          side: dot.getAttribute('data-port-side'),
        };
      }
    }


    let wiredDots = this.#dotLayer.querySelectorAll('[data-svg-wired=""]');
    for (const dot of wiredDots) {
      let cx = parseFloat(dot.getAttribute('cx')) || 0;
      let cy = parseFloat(dot.getAttribute('cy')) || 0;
      let dist = Math.hypot(cx - wx, cy - wy);
      if (dist < bestDist) {
        bestDist = dist;
        let connDotId = dot.getAttribute('data-conn-dot');

        let isStart = connDotId.endsWith('-start');
        let connId = connDotId.replace(/-(?:start|end)$/, '');
        let conn = this.#connectionData.get(connId);
        if (conn) {
          best = {
            nodeId: isStart ? conn.from : conn.to,
            key: isStart ? conn.out : conn.in,
            side: isStart ? 'output' : 'input',
          };
        }
      }
    }

    return best;
  }

  setSelectionState(_hasSelection, activeConnIds, selectedConnections) {
    this.#activeConnIds = new Set(activeConnIds || []);
    this.#selectedConnIds = new Set(selectedConnections || []);
    this.updateSvgMarkerCollisions();
  }

  updateSvgMarkerCollisions() {
    const protectedRoutes = [];
    for (const [id, conn] of this.#connectionData) {
      const points = this.#connectionPoints.get(id);
      if (!points || points.length < 2) continue;

      const path = this.#svgLayer.querySelector(`[data-conn-id="${id}"]`);
      if (!path) continue;

      const isSelected = this.#selectedConnIds.has(id);
      const isActive = this.#activeConnIds.has(id);
      const priority = isSelected ? 2 : (isActive ? 1 : 0);
      if (priority === 0) continue;

      const halfWidth = getSvgRouteHalfWidth(path);

      protectedRoutes.push({
        id,
        points,
        priority,
        halfWidth,
      });
    }

    for (const [key, marker] of this.#markerModels) {
      const markerEl = this.#svgLayer.querySelector(`[data-conn-marker="${key}"]`);
      if (!markerEl) continue;

      let ownerIds;
      let markerPriority = 0;

      if (marker.type === 'junction') {
        ownerIds = marker.connectionIds;
        for (const ownerId of ownerIds) {
          const isSelected = this.#selectedConnIds.has(ownerId);
          const isActive = this.#activeConnIds.has(ownerId);
          const priority = isSelected ? 2 : (isActive ? 1 : 0);
          if (priority > markerPriority) {
            markerPriority = priority;
          }
        }
      } else {
        ownerIds = [key];
        const isSelected = this.#selectedConnIds.has(key);
        const isActive = this.#activeConnIds.has(key);
        markerPriority = isSelected ? 2 : (isActive ? 1 : 0);
      }

      const isOccluded = isConnectionMarkerOccluded(marker, ownerIds, markerPriority, protectedRoutes);
      markerEl.toggleAttribute('data-collision-hidden', isOccluded);
    }
  }
}

/** @type {boolean} Set to true to enable debug logging for pin placement and routing */
ConnectionRenderer.debug = false;

/**
 * Updates/renders the SVG marker.
 * @param {string} connId - Connection ID
 * @param {object} marker - Draw model
 * @param {SVGElement} svgLayer - SVG layer to append to
 * @param {string} traceColor - Trace color
 */
export function updateSvgMarker(connId, marker, svgLayer, traceColor) {
  let markerEl = svgLayer.querySelector(`[data-conn-marker="${connId}"]`);

  if (!marker || marker.type === 'none') {
    if (markerEl) markerEl.remove();
    return;
  }

  if (!markerEl) {
    markerEl = svgLayer.ownerDocument.createElementNS('http://www.w3.org/2000/svg', 'g');
    markerEl.setAttribute('data-conn-marker', connId);
    svgLayer.appendChild(markerEl);
  }

  markerEl.innerHTML = '';
  markerEl.setAttribute('transform', `translate(${marker.x},${marker.y}) rotate(${(marker.angle * 180) / Math.PI})`);
  markerEl.setAttribute('class', 'sn-conn-marker');
  markerEl.setAttribute('data-type', marker.type);
  const connectionPath = svgLayer.querySelector(`[data-conn-id="${connId}"]`);
  for (const attribute of ['data-selected', 'data-active-conn', 'data-dimmed']) {
    markerEl.toggleAttribute(attribute, connectionPath?.hasAttribute(attribute) || false);
  }
  if (traceColor) {
    markerEl.style.setProperty('--sn-conn-marker-color', traceColor);
  } else {
    markerEl.style.removeProperty('--sn-conn-marker-color');
  }

  const backgroundFill = 'var(--sn-canvas-graph-bg, var(--sn-sys-surface))';
  for (const primitive of projectConnectionMarkerGeometry(marker)) {
    let element;
    if (primitive.type === 'rect') {
      element = svgLayer.ownerDocument.createElementNS('http://www.w3.org/2000/svg', 'rect');
      element.setAttribute('x', String(primitive.x));
      element.setAttribute('y', String(primitive.y));
      element.setAttribute('width', String(primitive.width));
      element.setAttribute('height', String(primitive.height));
    } else if (primitive.type === 'circle') {
      element = svgLayer.ownerDocument.createElementNS('http://www.w3.org/2000/svg', 'circle');
      element.setAttribute('cx', String(primitive.x));
      element.setAttribute('cy', String(primitive.y));
      element.setAttribute('r', String(primitive.radius));
    } else if (primitive.type === 'polygon') {
      element = svgLayer.ownerDocument.createElementNS('http://www.w3.org/2000/svg', 'polygon');
      element.setAttribute('points', primitive.points.map((point) => point.join(',')).join(' '));
    }
    if (!element) continue;
    element.setAttribute('fill', primitive.fill === 'background' ? backgroundFill : 'currentColor');
    markerEl.appendChild(element);
  }
}
