/* global requestAnimationFrame, cancelAnimationFrame, getComputedStyle */
/**
 * CanvasViewport.js
 *
 * Manages viewport transformations (pan/zoom), Level of Detail (LOD),
 * and node virtualization (phantom data) to optimize rendering of large graphs.
 *
 * @module symbiote-ui/canvas/CanvasViewport
 */

import {
  createFocusTransitionClock,
  resolveCanvasGraphCameraArc,
  resolveCanvasGraphTransitionProgress,
} from './CanvasGraph/CanvasGraphViewport.js';

const NODE_CANVAS_MIN_FIT_ZOOM = 0.08;
const NODE_CANVAS_MIN_FIT_VIEWPORT_SIZE = 48;
const MANUAL_INTERACTION_CULLING_SETTLE_MS = 180;

export function resolveGridLOD(zoom) {
  let normalized = Number(zoom);
  if (!Number.isFinite(normalized) || normalized <= 0 || normalized >= 0.5) return 1;
  return 2 ** Math.ceil(Math.log2(0.5 / normalized));
}

function finiteNumber(value) {
  let number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function resolveFitPadding(padding, viewport) {
  let minSide = Math.min(viewport.width, viewport.height);
  if (minSide < NODE_CANVAS_MIN_FIT_VIEWPORT_SIZE) return null;
  let requested = Math.max(0, Number(padding) || 0);
  let maxPadding = Math.max(0, (minSide - NODE_CANVAS_MIN_FIT_VIEWPORT_SIZE) / 2);
  return Math.min(requested, maxPadding);
}

export class CanvasViewport {
  /** @type {import('./NodeCanvas/NodeCanvas.js').NodeCanvas} */
  #canvas;
  /** @type {Map<string, HTMLElement>} */
  #nodeViews;
  /** @type {import('./NodeViewManager.js').NodeViewManager} */
  #viewManager;
  /** @type {function(): import('./ConnectionRenderer.js').ConnectionRenderer} */
  #getConnRenderer;


  /** All node data objects from editor — the full set regardless of DOM state */
  #allNodes = new Map();
  /** Position + size cache for nodes without DOM (phantom rendering on Canvas) */
  #phantomData = new Map();
  /** Degree (connection count) per node — for dot sizing */
  #nodeDegrees = new Map();
  /** Debounce timer for promote/demote batch */
  #virtTimer = null;
  /** Dirty flag — phantom positions changed, needs re-sync to renderer */
  #phantomDirty = false;

  /** @type {number|null} */
  #panAnimFrame = null;

  /**
   * @param {object} config
   * @param {import('./NodeCanvas/NodeCanvas.js').NodeCanvas} config.canvas
   * @param {Map<string, HTMLElement>} config.nodeViews
   * @param {import('./NodeViewManager.js').NodeViewManager} config.viewManager
   * @param {function(): import('./ConnectionRenderer.js').ConnectionRenderer} config.getConnRenderer
   */
  constructor({ canvas, nodeViews, viewManager, getConnRenderer }) {
    this.#canvas = canvas;
    this.#nodeViews = nodeViews;
    this.#viewManager = viewManager;
    this.#getConnRenderer = getConnRenderer;
  }

  /**
   * Reset and initialize virtualization data from a new editor
   * @param {import('../core/Editor.js').NodeEditor} editor
   */
  initializeData(editor) {
    this.#allNodes.clear();
    this.#phantomData.clear();
    this.#nodeDegrees.clear();

    for (const node of editor.getNodes()) {
      this.#allNodes.set(node.id, node);
      this.#nodeDegrees.set(node.id, 0);
    }

    let allConns = editor.getConnections();
    for (const conn of allConns) {
      this.#nodeDegrees.set(conn.from, (this.#nodeDegrees.get(conn.from) || 0) + 1);
      this.#nodeDegrees.set(conn.to, (this.#nodeDegrees.get(conn.to) || 0) + 1);
    }

    const VIRT_THRESHOLD = 200;
    if (this.#allNodes.size <= VIRT_THRESHOLD) {

      this.#viewManager.addViews(editor.getNodes());
    } else {

      let defaultW = 180,
        defaultH = 60;
      for (const [id, node] of this.#allNodes) {
        this.#phantomData.set(id, {
          id,
          x: 0,
          y: 0,
          w: defaultW,
          h: defaultH,
          degree: this.#nodeDegrees.get(id) || 0,
          color: null,
          label: node.label || id,
        });
      }
    }
  }

  /**
   * Clear all virtualization data
   */
  clear() {
    this.#allNodes.clear();
    this.#phantomData.clear();
    this.#nodeDegrees.clear();
    if (this.#virtTimer) {
      clearTimeout(this.#virtTimer);
      this.#virtTimer = null;
    }
    if (this.#panAnimFrame) {
      cancelAnimationFrame(this.#panAnimFrame);
      this.#panAnimFrame = null;
    }
    this.#canvas._viewportProtectedNodeIds = null;
    this.#canvas._viewportResizeSettleSuppressUntil = 0;
    this.#canvas._viewportAnimating = false;
    this.#canvas.toggleAttribute?.('data-viewport-animating', false);
    this.#canvas._clearSuppressedNodeResizeUpdates?.();
    this.#getConnRenderer()?.resumeProgressiveRendering?.('viewport-motion');
  }

  cancelAnimation() {
    let active = Boolean(this.#panAnimFrame || this.#canvas._viewportAnimating);
    if (this.#panAnimFrame) cancelAnimationFrame(this.#panAnimFrame);
    this.#panAnimFrame = null;
    this.#canvas._viewportProtectedNodeIds = null;
    this.#canvas._viewportResizeSettleSuppressUntil = 0;
    this.#canvas._viewportAnimating = false;
    this.#canvas.toggleAttribute?.('data-viewport-animating', false);
    this.#canvas._flushSuppressedNodeResizeUpdates?.();
    this.#getConnRenderer()?.resumeProgressiveRendering?.('viewport-motion');
    return active;
  }

  /**
   * Handle node creation event
   * @param {import('../../core/Node.js').Node} node
   */
  handleNodeCreated(node) {
    this.#allNodes.set(node.id, node);
    if (this.#phantomData.size > 0) {
      this.#phantomData.set(node.id, {
        id: node.id,
        x: 0,
        y: 0,
        w: 180,
        h: 60,
        degree: 0,
        color: null,
        label: node.label || node.id,
      });
    } else {
      this.#viewManager.addView(node);
    }
  }

  /**
   * Update phantom node position cache
   * @param {string} nodeId
   * @param {number} x
   * @param {number} y
   */
  updatePhantomPosition(nodeId, x, y) {
    let pd = this.#phantomData.get(nodeId);
    if (pd) {
      pd.x = x;
      pd.y = y;
      this.#phantomDirty = true;
    }
  }

  /**
   * Update viewport transform and schedule culling
   */
  updateTransform(options = {}) {

    let zoom = finiteNumber(this.#canvas.$.zoom);
    if (zoom === null || zoom <= 0) zoom = 1;
    let scaleFactor = resolveGridLOD(zoom);
    let scale = scaleFactor * zoom;
    this.#canvas.style.backgroundSize = `calc(var(--sn-grid-size) * ${scale}) calc(var(--sn-grid-size) * ${scale})`;
    this.#canvas.style.backgroundPosition = `${this.#canvas.$.panX}px ${this.#canvas.$.panY}px`;


    let toolbar = this.#canvas.ref.quickToolbar;
    if (toolbar) {
      toolbar._transform = { zoom, panX: this.#canvas.$.panX, panY: this.#canvas.$.panY };
      if (toolbar._nodeEl) toolbar.updatePosition(toolbar._nodeEl);
    }

    this.#getConnRenderer()?.refreshViewportTransform?.();
    this.#canvas._refreshFocusTransitionMarker?.();

    if (options.deferCulling) return;

    if (!this.#canvas._cullingScheduled) {
      this.#canvas._cullingScheduled = true;
      requestAnimationFrame(() => {
        this.#canvas._cullingScheduled = false;
        this.#applyCullingAndLOD();
      });
    }
  }

  #resolveViewportTransitionDuration(options = {}, fallback = 520) {
    if (options.transition === false || options.animate === false) return 0;
    if (globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches === true) return 0;

    let explicitDuration = finiteNumber(options.transitionMs) ?? finiteNumber(options.duration);
    let duration = explicitDuration ?? fallback;

    let styles = getComputedStyle(this.#canvas);
    if (styles.getPropertyValue('--sn-motion-enabled').trim() === '0') return 0;

    if (explicitDuration === null) {
      let motionScale = finiteNumber(styles.getPropertyValue('--sn-theme-motion-scale'));
      if (motionScale !== null) duration *= motionScale;
    }

    return Math.max(0, duration);
  }

  #setViewportTransform({ zoom, panX, panY }, options = {}) {
    this.#canvas.$.zoom = zoom;
    this.#canvas.$.panX = panX;
    this.#canvas.$.panY = panY;
    this.updateTransform(options);
  }

  #viewportGraphCenter(start, routeCenter) {
    let zoom = Math.max(0.0001, start.zoom);
    return {
      x: (routeCenter.x - start.panX) / zoom,
      y: (routeCenter.y - start.panY) / zoom,
    };
  }

  #resolveFitTarget(bounds, {
    padding = 80,
    minZoom = NODE_CANVAS_MIN_FIT_ZOOM,
    maxZoom = 1.5,
  } = {}) {
    if (!bounds) return null;
    let viewport = this.#getVisibleViewportSize();
    let safePadding = resolveFitPadding(padding, viewport);
    if (safePadding === null) return null;
    let graphW = Math.max(1, bounds.maxX - bounds.minX);
    let graphH = Math.max(1, bounds.maxY - bounds.minY);
    let availableW = Math.max(1, viewport.width - safePadding * 2);
    let availableH = Math.max(1, viewport.height - safePadding * 2);
    let scaleX = availableW / graphW;
    let scaleY = availableH / graphH;
    let min = Math.max(NODE_CANVAS_MIN_FIT_ZOOM, Number(minZoom) || NODE_CANVAS_MIN_FIT_ZOOM);
    let max = Math.max(min, Number(maxZoom) || 1.5);
    let zoom = Math.max(min, Math.min(scaleX, scaleY, max));
    let center = {
      x: (bounds.minX + bounds.maxX) / 2,
      y: (bounds.minY + bounds.maxY) / 2,
    };

    return {
      zoom,
      center,
      panX: viewport.width / 2 - center.x * zoom,
      panY: viewport.height / 2 - center.y * zoom,
      viewport,
    };
  }

  #animateViewportTo(target, options = {}) {
    let connRenderer = this.#getConnRenderer();
    connRenderer?.resumeProgressiveRendering?.('viewport-motion');
    this.#canvas._flushSuppressedNodeResizeUpdates?.();
    this.#canvas._viewportProtectedNodeIds = null;
    this.#canvas._viewportResizeSettleSuppressUntil = 0;
    this.#canvas._viewportAnimating = false;
    this.#canvas.toggleAttribute?.('data-viewport-animating', false);
    if (this.#panAnimFrame) {
      cancelAnimationFrame(this.#panAnimFrame);
      this.#panAnimFrame = null;
    }

    let start = {
      zoom: this.#canvas.$.zoom,
      panX: this.#canvas.$.panX,
      panY: this.#canvas.$.panY,
    };
    let dz = Math.abs(start.zoom - target.zoom);
    let dx = Math.abs(start.panX - target.panX);
    let dy = Math.abs(start.panY - target.panY);
    if (dz < 0.01 && dx < 2 && dy < 2) {
      this.#setViewportTransform(target);
      return;
    }

    let duration = this.#resolveViewportTransitionDuration(options);
    if (!duration || typeof requestAnimationFrame !== 'function') {
      this.#setViewportTransform(target);
      return;
    }

    connRenderer?.suspendProgressiveRendering?.('viewport-motion');
    let protectedNodeIds = Array.isArray(options.viewportProtectedNodeIds)
      ? options.viewportProtectedNodeIds.map(String).filter(Boolean)
      : [];
    this.#canvas._viewportProtectedNodeIds = protectedNodeIds.length ? new Set(protectedNodeIds) : null;
    this.#canvas._viewportResizeSettleSuppressUntil = Number.POSITIVE_INFINITY;
    this.#canvas._viewportAnimating = true;
    this.#canvas.toggleAttribute?.('data-viewport-animating', true);

    let clock = options.transitionClock || createFocusTransitionClock(options.transitionStartTime);

    let routeCenter = options.viewportRouteCenter || null;
    let startCenter = routeCenter ? this.#viewportGraphCenter(start, routeCenter) : null;
    let frozenTargetCenter = routeCenter ? {
      x: (routeCenter.x - target.panX) / Math.max(0.0001, target.zoom),
      y: (routeCenter.y - target.panY) / Math.max(0.0001, target.zoom),
    } : null;
    let lastViewport = target;

    let step = (now) => {
      let elapsed = now - clock.resolveStart(now);
      let t = Math.min(elapsed / duration, 1);
      let fitTarget = options.viewportRouteFitBounds
        ? this.#resolveFitTarget(options.viewportRouteFitBounds, {
            padding: options.viewportRouteFitPadding ?? options.padding ?? 128,
            minZoom: options.viewportRouteFitMinZoom ?? NODE_CANVAS_MIN_FIT_ZOOM,
            maxZoom: options.viewportRouteFitMaxZoom ?? Math.min(target.zoom, options.maxZoom ?? 1.5),
          })
        : null;

      if (startCenter && fitTarget) {
        let liveTargetCenter = this.#canvas._getNodeGraphCenter?.(options.viewportTargetNodeId)
          || frozenTargetCenter;
        let viewport = fitTarget.viewport;
        lastViewport = resolveCanvasGraphCameraArc({
          startCenter,
          routeCenter: fitTarget.center,
          targetCenter: liveTargetCenter,
          startZoom: start.zoom,
          routeZoom: fitTarget.zoom,
          targetZoom: target.zoom,
          rect: viewport,
          progress: t,
          minZoom: NODE_CANVAS_MIN_FIT_ZOOM,
          maxZoom: Math.max(start.zoom, target.zoom, fitTarget.zoom, options.maxZoom ?? 1.5),
        });
        this.#setViewportTransform(lastViewport, {
          deferCulling: t < 1,
        });
      } else {
        let ease = resolveCanvasGraphTransitionProgress(t);
        lastViewport = {
          zoom: start.zoom + (target.zoom - start.zoom) * ease,
          panX: start.panX + (target.panX - start.panX) * ease,
          panY: start.panY + (target.panY - start.panY) * ease,
        };
        this.#setViewportTransform({
          ...lastViewport,
        }, {
          deferCulling: t < 1,
        });
      }

      if (t < 1) {
        this.#panAnimFrame = requestAnimationFrame(step);
        return;
      }

      this.#panAnimFrame = null;
      this.#setViewportTransform(lastViewport);
      this.#canvas._viewportAnimating = false;
      this.#canvas._viewportProtectedNodeIds = null;
      this.#canvas._viewportResizeSettleSuppressUntil = now + 320;
      this.#canvas.toggleAttribute?.('data-viewport-animating', false);
      connRenderer?.resumeProgressiveRendering?.('viewport-motion');
      this.#canvas._flushSuppressedNodeResizeUpdates?.();
    };

    this.#panAnimFrame = requestAnimationFrame(step);
  }

  /**
   * Apply culling and level of detail logic based on zoom/pan
   * @private
   */
  #applyCullingAndLOD() {
    if (!this.#canvas.ref.canvasContainer) return;
    if (this.#nodeViews.size === 0 && this.#phantomData.size === 0) return;
    if (this.#canvas.hasAttribute?.('data-interacting')) {
      this.#deferCullingUntilInteractionSettles();
      return;
    }
    let protectedNodeIds = this.#canvas._viewportProtectedNodeIds;
    let promotedProtectedNode = false;
    if (protectedNodeIds?.size) {
      for (const nodeId of protectedNodeIds) {
        if (!this.#phantomData.has(nodeId)) continue;
        this.#promoteNode(nodeId);
        promotedProtectedNode = true;
      }
    }
    if (promotedProtectedNode) this.#syncPhantomToRenderer();

    let cw = this.#canvas.ref.canvasContainer.clientWidth;
    let ch = this.#canvas.ref.canvasContainer.clientHeight;
    let zoom = this.#canvas.$.zoom;
    let panX = this.#canvas.$.panX;
    let panY = this.#canvas.$.panY;
    let margin = 300;

    let lod = zoom < 0.5 ? 'medium' : 'full';
    this.#canvas._currentLod = lod;

    if (this.#canvas.ref.connections) {
      let isDimmed = this.#canvas.ref.connections.hasAttribute('data-lod-dimmed');
      if (lod !== 'full') {
        if (!isDimmed) this.#canvas.ref.connections.setAttribute('data-lod-dimmed', '');
      } else {
        if (isDimmed) this.#canvas.ref.connections.removeAttribute('data-lod-dimmed');
      }
    }

    let isVirtualized = this.#phantomData.size > 0 || this.#allNodes.size > 200;
    const FAR_ZOOM = zoom < 0.25;
    let toPromote = [];
    let toDemote = [];

    for (const [id, el] of this.#nodeViews) {
      let pos = el._position;
      if (!pos) continue;
      if (protectedNodeIds?.has(id)) {
        if (el.style.visibility !== '') el.style.visibility = '';
        if (el.getAttribute('data-lod') !== lod) el.setAttribute('data-lod', lod);
        continue;
      }

      let screenX = pos.x * zoom + panX;
      let screenY = pos.y * zoom + panY;
      if (!el._cachedW) {
        el._cachedW = el.offsetWidth || 180;
        el._cachedH = el.offsetHeight || 60;
      }
      let w = el._cachedW * zoom;
      let h = el._cachedH * zoom;

      let visible =
        screenX + w > -margin &&
        screenX < cw + margin &&
        screenY + h > -margin &&
        screenY < ch + margin;

      if (isVirtualized && FAR_ZOOM) {
        toDemote.push(id);
      } else if (visible) {
        if (el.style.visibility !== '') el.style.visibility = '';
        if (el.getAttribute('data-lod') !== lod) el.setAttribute('data-lod', lod);
      } else if (isVirtualized) {
        toDemote.push(id);
      } else {
        if (el.style.visibility !== 'hidden') el.style.visibility = 'hidden';
      }
    }

    if (isVirtualized && !FAR_ZOOM) {
      for (const [id, pd] of this.#phantomData) {
        let screenX = pd.x * zoom + panX;
        let screenY = pd.y * zoom + panY;
        let w = (pd.w || 180) * zoom;
        let h = (pd.h || 60) * zoom;

        let visible =
          screenX + w > -margin &&
          screenX < cw + margin &&
          screenY + h > -margin &&
          screenY < ch + margin;

        if (visible) toPromote.push(id);
      }
    }

    if (FAR_ZOOM && toDemote.length > 0) {
      if (this.#virtTimer) {
        clearTimeout(this.#virtTimer);
        this.#virtTimer = null;
      }
      for (const id of toDemote) this.#demoteNode(id);
      this.#syncPhantomToRenderer();
    } else if (toPromote.length > 0 || toDemote.length > 0) {
      if (this.#virtTimer) clearTimeout(this.#virtTimer);
      this.#virtTimer = setTimeout(() => {
        this.#virtTimer = null;
        for (const id of toDemote) this.#demoteNode(id);
        for (const id of toPromote) this.#promoteNode(id);
        this.#syncPhantomToRenderer();
      }, 100);
    } else if (this.#phantomDirty) {
      this.#phantomDirty = false;
      this.#syncPhantomToRenderer();
    }
  }

  #deferCullingUntilInteractionSettles() {
    if (this.#virtTimer) clearTimeout(this.#virtTimer);
    this.#virtTimer = setTimeout(() => {
      this.#virtTimer = null;
      this.#applyCullingAndLOD();
    }, MANUAL_INTERACTION_CULLING_SETTLE_MS);
  }

  /**
   * Promote a phantom node to a full DOM node
   * @param {string} nodeId
   * @private
   */
  #promoteNode(nodeId) {
    if (this.#nodeViews.has(nodeId)) return;
    let node = this.#allNodes.get(nodeId);
    if (!node) return;

    let pd = this.#phantomData.get(nodeId);
    this.#viewManager.addView(node);
    let el = this.#nodeViews.get(nodeId);
    if (el && pd) {
      el._position = { x: pd.x, y: pd.y };
      el._cachedW = pd.w;
      el._cachedH = pd.h;
      el.style.transform = `translate(${pd.x}px, ${pd.y}px)`;
    }
    this.#phantomData.delete(nodeId);
  }

  /**
   * Demote a DOM node to a phantom node
   * @param {string} nodeId
   * @private
   */
  #demoteNode(nodeId) {
    if (!this.#nodeViews.has(nodeId)) return;
    let el = this.#nodeViews.get(nodeId);
    let color = null;
    if (el) {
      color = el._cachedBgColor || el.style.backgroundColor || null;
    }
    let dims = this.#viewManager.removeViewInstant(nodeId);
    if (dims) {
      let node = this.#allNodes.get(nodeId);
      this.#phantomData.set(nodeId, {
        id: nodeId,
        x: dims.x,
        y: dims.y,
        w: dims.w,
        h: dims.h,
        degree: this.#nodeDegrees.get(nodeId) || 0,
        color,
        label: node?.label || nodeId,
      });
    }
  }

  /**
   * Sync phantom node data to the connection renderer
   * @private
   */
  #syncPhantomToRenderer() {
    let connRenderer = this.#getConnRenderer();
    if (connRenderer && typeof connRenderer.setPhantomNodes === 'function') {
      connRenderer.setPhantomNodes([...this.#phantomData.values()]);
    }
  }

  /**
   * Trigger a manual sync of phantom nodes
   */
  syncPhantom() {
    this.#phantomDirty = false;
    this.#syncPhantomToRenderer();
  }

  ensureNodeView(nodeId) {
    let id = String(nodeId || '');
    if (!id) return null;
    if (this.#phantomData.has(id)) {
      this.#promoteNode(id);
      this.#syncPhantomToRenderer();
    }
    return this.#nodeViews.get(id) || null;
  }

  prewarmFocusNodes({ nodeIds = [] } = {}) {
    let protectedIds = new Set(Array.isArray(nodeIds) ? nodeIds.map(String).filter(Boolean) : []);
    let promoted = false;
    for (const id of protectedIds) {
      if (this.#phantomData.has(id)) {
        this.#promoteNode(id);
        promoted = true;
      }
      let el = this.#nodeViews.get(id);
      if (!el) continue;
      if (el.style.visibility !== '') el.style.visibility = '';
      el.getBoundingClientRect?.();
    }
    if (promoted) this.#syncPhantomToRenderer();
    let ids = [...protectedIds];
    this.#getConnRenderer()?.prewarmNodes?.(ids);
    return ids;
  }

  #getVisibleViewportSize() {
    let canvasRect = this.#canvas.ref.canvasContainer.getBoundingClientRect();
    let visibleWidth = canvasRect.width;
    let inspector = this.#canvas.ref.inspector || this.#canvas.querySelector('inspector-panel');
    if (inspector && !inspector.hasAttribute('hidden') && inspector.offsetWidth > 20) {
      visibleWidth -= inspector.offsetWidth;
    }
    return {
      width: visibleWidth,
      height: canvasRect.height,
    };
  }

  #getNodeBounds(nodeId) {
    let el = this.#nodeViews.get(nodeId);
    if (el?._position) {
      return {
        id: nodeId,
        x: el._position.x,
        y: el._position.y,
        w: el.offsetWidth || el._cachedW || 150,
        h: el.offsetHeight || el._cachedH || 40,
      };
    }

    let pd = this.#phantomData.get(nodeId);
    if (!pd) return null;
    return {
      id: nodeId,
      x: pd.x,
      y: pd.y,
      w: pd.w || 150,
      h: pd.h || 40,
    };
  }

  #getBoundsForNodeIds(nodeIds) {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    let ids = [];

    for (let nodeId of nodeIds) {
      let id = String(nodeId || '');
      if (!id || ids.includes(id)) continue;
      let bounds = this.#getNodeBounds(id);
      if (!bounds) continue;
      ids.push(id);
      minX = Math.min(minX, bounds.x);
      minY = Math.min(minY, bounds.y);
      maxX = Math.max(maxX, bounds.x + bounds.w);
      maxY = Math.max(maxY, bounds.y + bounds.h);
    }

    if (minX === Infinity) return null;
    return { ids, minX, minY, maxX, maxY };
  }

  #fitBounds(bounds, {
    padding = 80,
    minZoom = NODE_CANVAS_MIN_FIT_ZOOM,
    maxZoom = 1.5,
    ...options
  } = {}) {
    let target = this.#resolveFitTarget(bounds, { padding, minZoom, maxZoom });
    if (!target) return false;

    this.#animateViewportTo({
      zoom: target.zoom,
      panX: target.panX,
      panY: target.panY,
    }, {
      ...options,
      viewportRouteCenter: { x: target.viewport.width / 2, y: target.viewport.height / 2 },
    });
    return true;
  }

  /**
   * Fit all nodes (phantom and DOM) within the viewport
   */
  fitView() {
    if (this.#nodeViews.size === 0 && this.#phantomData.size === 0) return;

    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;

    for (const [, el] of this.#nodeViews) {
      if (!el._position) continue;
      let x = el._position.x;
      let y = el._position.y;
      let w = el.offsetWidth || el._cachedW || 150;
      let h = el.offsetHeight || el._cachedH || 40;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x + w > maxX) maxX = x + w;
      if (y + h > maxY) maxY = y + h;
    }

    for (const [, pd] of this.#phantomData) {
      if (pd.x < minX) minX = pd.x;
      if (pd.y < minY) minY = pd.y;
      if (pd.x + pd.w > maxX) maxX = pd.x + pd.w;
      if (pd.y + pd.h > maxY) maxY = pd.y + pd.h;
    }

    if (minX === Infinity) return;

    let graphW = maxX - minX;
    let graphH = maxY - minY;
    let viewport = this.#getVisibleViewportSize();
    let safePadding = resolveFitPadding(80, viewport);
    if (safePadding === null) return;
    let scaleX = (viewport.width - safePadding * 2) / graphW;
    let scaleY = (viewport.height - safePadding * 2) / graphH;
    let scale = Math.max(NODE_CANVAS_MIN_FIT_ZOOM, Math.min(scaleX, scaleY, 1.5));

    let centerX = (minX + maxX) / 2;
    let centerY = (minY + maxY) / 2;

    this.#animateViewportTo({
      zoom: scale,
      panX: viewport.width / 2 - centerX * scale,
      panY: viewport.height / 2 - centerY * scale,
    }, {
      viewportRouteCenter: { x: viewport.width / 2, y: viewport.height / 2 },
    });
  }

  /**
   * Fit multiple nodes into the visible viewport.
   * @param {string[]} nodeIds
   * @param {Object} [options]
   * @param {number} [options.padding=80]
   * @param {number} [options.minZoom=0.08]
   * @param {number} [options.maxZoom=1.5]
   * @param {string|boolean} [options.select=false]
   * @returns {boolean}
   */
  flyToNodes(nodeIds, options = {}) {
    let ids = Array.isArray(nodeIds) ? nodeIds : [nodeIds];
    let protectedNodeIds = this.prewarmFocusNodes({ nodeIds: ids });
    let bounds = this.#getBoundsForNodeIds(ids);
    if (!bounds) return false;

    let result = this.#fitBounds(bounds, {
      ...options,
      viewportProtectedNodeIds: options.viewportProtectedNodeIds || protectedNodeIds,
    });
    let select = options.select;
    if (select === true) select = bounds.ids[0];
    if (typeof select === 'string' && select) {
      this.#canvas.selectNode(select);
    }
    return result;
  }

  /**
   * Fly camera to a specific node, zooming in
   * @param {string|string[]} nodeId
   * @param {Object} [options]
   * @param {number} [options.zoom=0.8]
   * @param {string|boolean} [options.select=true]
   * @returns {boolean} True if successful
   */
  flyToNode(nodeId, options = {}) {
    if (Array.isArray(nodeId)) {
      return this.flyToNodes(nodeId, {
        ...options,
        maxZoom: options.maxZoom ?? options.zoom ?? 1.5,
      });
    }

    let { zoom = 0.8 } = options;
    let el = this.#nodeViews.get(nodeId);

    if (!el && this.#phantomData.has(nodeId)) {
      this.#promoteNode(nodeId);
      el = this.#nodeViews.get(nodeId);
    }
    if (!el) return false;

    let pos =
      el._position ||
      (() => {
        let pd = this.#phantomData.get(nodeId);
        return pd ? { x: pd.x, y: pd.y } : { x: 0, y: 0 };
      })();

    let canvasRect = this.#canvas.ref.canvasContainer.getBoundingClientRect();
    let visibleWidth = canvasRect.width;

    let inspector = this.#canvas.ref.inspector || this.#canvas.querySelector('inspector-panel');
    if (inspector && !inspector.hasAttribute('hidden') && inspector.offsetWidth > 20) {
      visibleWidth -= inspector.offsetWidth;
    }

    let elWidth = el.offsetWidth || el._cachedW || 150;
    let elHeight = el.offsetHeight || el._cachedH || 40;

    let nodeX = pos.x + elWidth / 2;
    let nodeY = pos.y + elHeight / 2;

    let newPanX = visibleWidth / 2 - nodeX * zoom;
    let newPanY = canvasRect.height / 2 - nodeY * zoom;

    let dz = Math.abs(this.#canvas.$.zoom - zoom);
    let dx = Math.abs(this.#canvas.$.panX - newPanX);
    let dy = Math.abs(this.#canvas.$.panY - newPanY);
    let select = options.select;
    let shouldSelect = select !== false;
    let selectId = typeof select === 'string' && select ? select : nodeId;

    if (dz < 0.01 && dx < 2 && dy < 2) {
      if (shouldSelect) this.#canvas.selectNode(selectId);
      if (!this.#canvas._cullingScheduled) {
        this.#canvas._cullingScheduled = true;
        requestAnimationFrame(() => {
          this.#canvas._cullingScheduled = false;
          this.#applyCullingAndLOD();
        });
      }
      return true;
    }

    if (shouldSelect) this.#canvas.selectNode(selectId);
    this.#animateViewportTo({
      zoom,
      panX: newPanX,
      panY: newPanY,
    }, {
      ...options,
      viewportRouteCenter: { x: visibleWidth / 2, y: canvasRect.height / 2 },
    });
    return true;
  }

  /**
   * Pan smoothly to a specific node
   * @param {string} nodeId
   * @param {number} [duration=400]
   */
  panToNode(nodeId, duration = 400) {
    let el = this.#nodeViews.get(nodeId);
    if (!el?._position) return;
    let container = this.#canvas.ref.canvasContainer;
    if (!container) return;

    let cx = container.clientWidth / 2;
    let cy = container.clientHeight / 2;
    let nodeW = (el.offsetWidth || 180) / 2;
    let nodeH = (el.offsetHeight || 60) / 2;
    let targetX = -(el._position.x + nodeW) * this.#canvas.$.zoom + cx;
    let targetY = -(el._position.y + nodeH) * this.#canvas.$.zoom + cy;

    this.animatePan(targetX, targetY, duration);
  }

  /**
   * Animate pan to a target coordinate
   * @param {number} targetX
   * @param {number} targetY
   * @param {number} duration
   */
  animatePan(targetX, targetY, duration) {
    if (this.#panAnimFrame) {
      cancelAnimationFrame(this.#panAnimFrame);
      this.#panAnimFrame = null;
    }

    this.#animateViewportTo({
      zoom: this.#canvas.$.zoom,
      panX: targetX,
      panY: targetY,
    }, { transitionMs: duration });
  }

  getPositions() {
    let positions = {};
    for (const [id, el] of this.#nodeViews) {
      if (el._position) {
        positions[id] = [el._position.x, el._position.y];
      }
    }
    for (const [id, pd] of this.#phantomData) {
      if (!positions[id]) {
        positions[id] = [pd.x, pd.y];
      }
    }
    return positions;
  }

  hasNode(nodeId) {
    return this.#nodeViews.has(nodeId) || this.#phantomData.has(nodeId);
  }
}

export { CanvasViewport as default };
