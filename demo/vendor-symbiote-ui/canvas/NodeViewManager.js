/* eslint-env browser */
/**
 * NodeViewManager — creates/destroys graph-node elements with group drag
 *
 * Handles DOM creation, drag initialization with snap-to-grid,
 * group drag for multi-selected nodes, and twitch click detection.
 * Extracted from NodeCanvas to reduce complexity (was 27 cyclomatic).
 *
 * @module symbiote-ui/canvas/NodeViewManager
 */

import { Drag } from '../interactions/Drag.js';
import { Selector } from '../interactions/Selector.js';
import { animateOut } from '@symbiotejs/symbiote';
import { getShape } from '../shapes/index.js';
import { ensureMaterialSymbols } from '../icons/MaterialSymbols.js';

let svgMediaClipSeq = 0;
let svgPathBoundsCache = new Map();

function nodeTypeTokenName(type) {
  let segment = String(type || 'default')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `--sn-type-${segment || 'default'}`;
}

function readCssToken(source, token) {
  return getComputedStyle(source).getPropertyValue(token).trim();
}

function getFallbackPathBounds(viewBox) {
  let [x, y, width, height] = viewBox;
  return { x, y, width, height };
}

function measureSvgPathBounds(shape, viewBox) {
  let cacheKey = `${shape.viewBox}|${shape.pathData}`;
  if (svgPathBoundsCache.has(cacheKey)) return svgPathBoundsCache.get(cacheKey);
  if (typeof document === 'undefined' || !document.body) return getFallbackPathBounds(viewBox);

  let svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  let path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  svg.setAttribute('viewBox', shape.viewBox);
  svg.style.position = 'absolute';
  svg.style.inlineSize = '0';
  svg.style.blockSize = '0';
  svg.style.overflow = 'hidden';
  path.setAttribute('d', shape.pathData);
  svg.appendChild(path);
  document.body.appendChild(svg);

  let bounds;
  try {
    let box = path.getBBox();
    bounds = {
      x: box.x,
      y: box.y,
      width: box.width,
      height: box.height,
    };
  } catch {
    bounds = getFallbackPathBounds(viewBox);
  } finally {
    svg.remove();
  }

  if (!Number.isFinite(bounds.width) || !Number.isFinite(bounds.height) || bounds.width <= 0 || bounds.height <= 0) {
    bounds = getFallbackPathBounds(viewBox);
  }
  svgPathBoundsCache.set(cacheKey, bounds);
  return bounds;
}

function percent(value) {
  return `${value * 100}%`;
}

function setSvgMediaClip(el, svg, shape) {
  let [vx, vy, vw, vh] = shape.viewBox.split(' ').map(Number);
  if (!Number.isFinite(vw) || !Number.isFinite(vh) || vw <= 0 || vh <= 0) return;

  let bounds = measureSvgPathBounds(shape, [vx, vy, vw, vh]);
  let clipId = `sn-node-media-clip-${++svgMediaClipSeq}`;
  let defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
  let clipPath = document.createElementNS('http://www.w3.org/2000/svg', 'clipPath');
  let clipShape = document.createElementNS('http://www.w3.org/2000/svg', 'path');

  clipPath.setAttribute('id', clipId);
  clipPath.setAttribute('clipPathUnits', 'objectBoundingBox');
  clipShape.setAttribute('d', shape.pathData);
  clipShape.setAttribute(
    'transform',
    `matrix(${1 / bounds.width} 0 0 ${1 / bounds.height} ${-bounds.x / bounds.width} ${-bounds.y / bounds.height})`
  );

  clipPath.appendChild(clipShape);
  defs.appendChild(clipPath);
  svg.prepend(defs);
  el.style.setProperty('--sn-svg-shape-media-clip', `url(#${clipId})`);
  el.style.setProperty('--sn-svg-shape-media-left', percent((bounds.x - vx) / vw));
  el.style.setProperty('--sn-svg-shape-media-top', percent((bounds.y - vy) / vh));
  el.style.setProperty('--sn-svg-shape-media-width', percent(bounds.width / vw));
  el.style.setProperty('--sn-svg-shape-media-height', percent(bounds.height / vh));
}

export class NodeViewManager {
  /** @type {Map<string, HTMLElement>} */
  #nodeViews;

  /** @type {import('../core/Editor.js').NodeEditor} */
  #editor;

  /** @type {import('../interactions/Selector.js').Selector} */
  #selector;

  /** @type {import('../interactions/SnapGrid.js').SnapGrid} */
  #snapGrid;

  /** @type {function} */
  #getZoom;

  /** @type {function} */
  #setNodePosition;

  /** @type {function} */
  #animateNodeToPosition;

  /** @type {function} */
  #onNodeClick;

  /** @type {function|null} */
  #onNodePointerEnter = null;

  /** @type {function|null} */
  #onNodePointerLeave = null;

  /** @type {function|null} */
  #onNodeDragStart = null;

  /** @type {function|null} */
  #onNodeDragEnd = null;

  /** @type {Object} */
  #canvas;

  /** @type {function|null} */
  #onSvgShapeReady = null;

  /** @type {function|null} */
  #onNodeViewReady = null;

  /** @type {function|null} */
  #onNodeViewRemoved = null;

  /** @type {boolean} */
  #readonly = false;

  /** @type {boolean} */
  #readonlyNodeDragging = false;

  /** @type {boolean} */
  #snapEnabled = false;

  /** @type {HTMLElement} */
  #nodesLayer;

  /** @type {number} Z-index counter: increments on each select/drag */
  #zCounter = 1;

  /**
   * @param {object} config
   * @param {Map<string, HTMLElement>} config.nodeViews - shared Map
   * @param {import('../core/Editor.js').NodeEditor} config.editor
   * @param {import('../interactions/Selector.js').Selector} config.selector
   * @param {import('../interactions/SnapGrid.js').SnapGrid} config.snapGrid
   * @param {function} config.getZoom
   * @param {function} config.setNodePosition
   * @param {function} config.animateNodeToPosition
   * @param {function} config.onNodeClick
   * @param {function} [config.onNodePointerEnter]
   * @param {function} [config.onNodePointerLeave]
   * @param {function} [config.onNodeDragStart]
   * @param {function} [config.onNodeDragEnd]
   * @param {HTMLElement} config.nodesLayer
   * @param {Object} config.canvas - NodeCanvas reference for socket registration
   * @param {function} [config.onNodeViewReady]
   * @param {function} [config.onNodeViewRemoved]
   */
  constructor({
    nodeViews,
    editor,
    selector,
    snapGrid,
    getZoom,
    setNodePosition,
    animateNodeToPosition,
    onNodeClick,
    onNodePointerEnter,
    onNodePointerLeave,
    onNodeDragStart,
    onNodeDragEnd,
    nodesLayer,
    canvas,
    onSvgShapeReady,
    onNodeViewReady,
    onNodeViewRemoved,
  }) {
    this.#nodeViews = nodeViews;
    this.#editor = editor;
    this.#selector = selector;
    this.#snapGrid = snapGrid;
    this.#getZoom = getZoom;
    this.#setNodePosition = setNodePosition;
    this.#animateNodeToPosition = animateNodeToPosition;
    this.#onNodeClick = onNodeClick;
    this.#onNodePointerEnter = onNodePointerEnter || null;
    this.#onNodePointerLeave = onNodePointerLeave || null;
    this.#onNodeDragStart = onNodeDragStart || null;
    this.#onNodeDragEnd = onNodeDragEnd || null;
    this.#nodesLayer = nodesLayer;
    this.#canvas = canvas;
    this.#onSvgShapeReady = onSvgShapeReady || null;
    this.#onNodeViewReady = onNodeViewReady || null;
    this.#onNodeViewRemoved = onNodeViewRemoved || null;
  }

  /** @param {boolean} readonly */
  setReadonly(readonly) {
    this.#readonly = readonly;
    for (const [, el] of this.#nodeViews) {
      el.toggleAttribute('data-readonly', readonly);
    }
  }

  /** @param {boolean} enabled */
  setReadonlyNodeDragging(enabled) {
    this.#readonlyNodeDragging = enabled;
    for (const [, el] of this.#nodeViews) {
      el.toggleAttribute('data-readonly-node-dragging', enabled);
    }
  }

  /** @param {boolean} enabled */
  setSnapEnabled(enabled) {
    this.#snapEnabled = enabled;
  }

  /**
   * Create and append multiple node views in a single DOM batch.
   * This prevents layout thrashing and O(N) mutation overhead during graph inflation.
   * @param {import('../core/Node.js').Node[]} nodes
   */
  addViews(nodes) {
    if (!nodes || nodes.length === 0) return;

    let fragment = document.createDocumentFragment();


    for (const node of nodes) {
      let el = this.#createNodeElement(node);
      fragment.appendChild(el);
      this.#nodeViews.set(node.id, el);
    }


    this.#nodesLayer.appendChild(fragment);


    for (const node of nodes) {
      let el = this.#nodeViews.get(node.id);
      if (el) {
        this.#onNodeViewReady?.(node.id, el);
        this.#postProcessNodeView(node, el);
      }
    }
  }

  /**
   * Create a graph-node element for a Node
   * @param {import('../core/Node.js').Node} node
   */
  addView(node) {
    let el = this.#createNodeElement(node);
    this.#nodesLayer.appendChild(el);
    this.#nodeViews.set(node.id, el);
    this.#onNodeViewReady?.(node.id, el);
    this.#postProcessNodeView(node, el);
  }

  /**
   * Creates the HTMLElement for a node with its drag behavior initialized.
   * Does NOT append to the live DOM layer.
   * @private
   * @param {import('../core/Node.js').Node} node
   * @returns {HTMLElement}
   */
  #createNodeElement(node) {
    let el = document.createElement('graph-node');
    el.style.position = 'absolute';
    el.style.transform = 'translate(0px, 0px)';
    el._position = { x: 0, y: 0 };
    el._nodeData = node;
    el.setAttribute('node-id', node.id);
    el.setAttribute('node-label', node.label);
    el.setAttribute('node-category', node.category);
    el.setAttribute('node-shape', node.shape);
    let nodeType = node.type || 'default';
    el.setAttribute('node-type', nodeType);
    el.style.setProperty('--sn-node-type-accent', `var(${nodeTypeTokenName(nodeType)}, var(--sn-node-category-accent))`);
    el.toggleAttribute('data-readonly', this.#readonly);
    el.toggleAttribute('data-readonly-node-dragging', this.#readonlyNodeDragging);
    el._canvas = this.#canvas;
    el.addEventListener('pointerenter', (event) => {
      this.#onNodePointerEnter?.(node.id, el, event);
    });
    el.addEventListener('pointerleave', (event) => {
      this.#onNodePointerLeave?.(node.id, el, event);
    });

    let drag = new Drag();
    let dragStart = null;
    let dragMoved = false;

    drag.initialize(
      el,
      {
        getPosition: () => el._position,
        getZoom: this.#getZoom,
      },
      {
        shouldStart: (e) => {
          if (this.#readonly && !this.#readonlyNodeDragging) return false;

          let svgPath = el.querySelector('svg > path');
          if (!svgPath) return true;
          let svg = svgPath.ownerSVGElement;
          let rect = svg.getBoundingClientRect();
          let vb = svg.viewBox.baseVal;

          let sx = ((e.clientX - rect.left) / rect.width) * vb.width + vb.x;
          let sy = ((e.clientY - rect.top) / rect.height) * vb.height + vb.y;
          let pt = new DOMPoint(sx, sy);
          return svgPath.isPointInFill(pt);
        },
        onStart: (e) => {
          dragStart = { x: e.pageX, y: e.pageY };
          dragMoved = false;
          this.#autoSelectOnDragStart(node.id, e);
          this.#captureDragStartPositions();
          this.#bringToFront(node.id);
          this.#applyLift(el);
          this.#editor.emit('nodepicked', node);
        },
        onTranslate: (x, y, e) => {
          if (!dragMoved) {
            dragMoved = true;
            this.#onNodeDragStart?.(node.id, el, e);
          }
          this.#handleGroupTranslate(node.id, el, x, y);
        },
        onDrop: (e) => {
          let wasDragging = dragMoved;
          this.#handleDrop(node.id, el, e, dragStart);
          if (wasDragging) this.#onNodeDragEnd?.(node.id, el, e);
          dragStart = null;
          dragMoved = false;
        },
      }
    );
    el._drag = drag;

    return el;
  }

  /**
   * Applies SVG shaping or subgraph previews after the element is in the live DOM.
   * @private
   * @param {import('../core/Node.js').Node} node
   * @param {HTMLElement} el
   */
  #postProcessNodeView(node, el) {


    let shape = getShape(node.shape);
    if (shape && shape.pathData) {


      let vb = shape.viewBox.split(' ').map(Number);
      let vbW = vb[2];
      let vbH = vb[3];
      let params = node.params || {};
      let baseSize = Number(params.size || params.shapeSize) || 120;
      let aspect = vbW / vbH;
      let nodeW = Number(params.width) || (aspect >= 1 ? baseSize : Math.round(baseSize * aspect));
      let nodeH = Number(params.height) || (aspect >= 1 ? Math.round(baseSize / aspect) : baseSize);
      el.style.width = nodeW + 'px';
      el.style.height = nodeH + 'px';
      el.style.minWidth = nodeW + 'px';
      el.style.minHeight = nodeH + 'px';
    }

    requestAnimationFrame(() => {
      if (shape && shape.pathData) {
        let svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.classList.add('sn-node-shape-svg');
        svg.setAttribute('viewBox', shape.viewBox);
        svg.setAttribute('preserveAspectRatio', 'none');
        let path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', shape.pathData);
        path.setAttribute(
          'fill',
          `var(--sn-shape-${shape.name}-fill, var(--sn-shape-fill, var(--sn-sys-surface-raised)))`
        );
        path.setAttribute(
          'stroke',
          `var(--sn-shape-${shape.name}-stroke, var(--sn-shape-stroke, var(--sn-sys-outline)))`
        );
        path.setAttribute('stroke-width', 'var(--sn-shape-stroke-width, 0.4)');
        path.setAttribute('stroke-linejoin', 'round');
        svg.appendChild(path);
        setSvgMediaClip(el, svg, shape);
        el.prepend(svg);
        el.setAttribute('data-svg-shape', shape.name);

        let iconEl = el.querySelector('.sn-node-icon');
        let iconName = iconEl?.textContent?.trim();
        if (iconName) {
          let shapeIcon = document.createElement('span');
          shapeIcon.className = 'sn-node-shape-icon material-symbols-outlined';
          shapeIcon.textContent = iconName;
          ensureMaterialSymbols([iconName]);
          el.appendChild(shapeIcon);
        }

        if (this.#onSvgShapeReady) this.#onSvgShapeReady(node.id);
      } else if (shape) {

        let size = { width: el.offsetWidth || 180, height: el.offsetHeight || 60 };
        let radius = shape.getBorderRadius(size);
        if (radius && radius !== 'var(--sn-node-radius)') {
          el.style.borderRadius = radius;
        }
      }
    });


    if (node._isSubgraph) {
      let body = el.querySelector('.sn-node-body');
      if (body) {
        let canvas = document.createElement('canvas');
        canvas.className = 'sn-subgraph-preview';
        canvas.width = 200;
        canvas.height = 80;
        body.appendChild(canvas);
        el._previewCanvas = canvas;
        requestAnimationFrame(() => {
          this.#initSubgraphPreview(el, node, canvas);
        });
      }
    }
  }

  /**
   * Remove a graph-node element
   * @param {import('../core/Node.js').Node} node
   */
  removeView(node) {
    let el = this.#nodeViews.get(node.id);
    if (!el) return;
    if (el._previewRaf) clearTimeout(el._previewRaf);
    el._previewRaf = null;
    if (el._drag) el._drag.destroy();
    this.#onNodeViewRemoved?.(node.id, el);
    animateOut(el);
    this.#nodeViews.delete(node.id);
    this.#selector.getSelectedNodes().delete(node.id);
  }

  /**
   * Remove a node view instantly (no animation) for virtualization demote.
   * Returns captured position/size for phantom conversion.
   * @param {string} nodeId
   * @returns {{ x: number, y: number, w: number, h: number } | null}
   */
  removeViewInstant(nodeId) {
    let el = this.#nodeViews.get(nodeId);
    if (!el) return null;
    let pos = el._position || { x: 0, y: 0 };
    let w = el._cachedW || el.offsetWidth || 180;
    let h = el._cachedH || el.offsetHeight || 60;
    if (el._previewRaf) clearTimeout(el._previewRaf);
    if (el._drag) el._drag.destroy();
    this.#onNodeViewRemoved?.(nodeId, el);
    el.remove();
    this.#nodeViews.delete(nodeId);
    this.#selector.getSelectedNodes().delete(nodeId);
    return { x: pos.x, y: pos.y, w, h };
  }


  #autoSelectOnDragStart(nodeId, e) {
    if (!this.#selector.isNodeSelected(nodeId)) {
      let accumulate = e.ctrlKey || e.metaKey;
      this.#selector.selectNode(nodeId, accumulate);
    }
    this.#bringToFront(nodeId);
  }

  /**
   * Bring a node to front by setting highest z-index
   * @param {string} nodeId
   */
  #bringToFront(nodeId) {
    let el = this.#nodeViews.get(nodeId);
    if (el) {
      el.style.zIndex = ++this.#zCounter;
    }
  }

  /**
   * Apply lift effect: scale up + shadow + parallax offset
   * @param {HTMLElement} el
   */
  #applyLift(el) {
    el.classList.add('sn-node-lifted');
  }

  /**
   * Remove lift effect on drop
   * @param {HTMLElement} el
   */
  #removeLift(el) {
    el.classList.remove('sn-node-lifted');
  }

  #captureDragStartPositions() {
    let selected = this.#selector.getSelectedNodes();
    for (const id of selected) {
      let nodeEl = this.#nodeViews.get(id);
      if (nodeEl) nodeEl._dragStartPos = { ...nodeEl._position };
    }
  }

  #handleGroupTranslate(nodeId, el, x, y) {
    let finalX = x;
    let finalY = y;

    if (this.#snapEnabled && this.#snapGrid.isDynamic) {
      let snapped = this.#snapGrid.snap(x, y);
      finalX = snapped.x;
      finalY = snapped.y;
    }

    let prev = el._dragStartPos || el._position;
    let dx = finalX - prev.x;
    let dy = finalY - prev.y;

    let selected = this.#selector.getSelectedNodes();
    if (selected.size > 1 && selected.has(nodeId)) {
      for (const id of selected) {
        let nodeEl = this.#nodeViews.get(id);
        if (!nodeEl?._dragStartPos) continue;
        let nx = nodeEl._dragStartPos.x + dx;
        let ny = nodeEl._dragStartPos.y + dy;
        if (this.#snapEnabled && this.#snapGrid.isDynamic) {
          let snapped = this.#snapGrid.snap(nx, ny);
          nx = snapped.x;
          ny = snapped.y;
        }
        this.#setNodePosition(id, nx, ny);
      }
    } else {
      this.#setNodePosition(nodeId, finalX, finalY);
    }

    this.#editor.emit('nodetranslated', { id: nodeId, position: { x: finalX, y: finalY } });
  }

  #handleDrop(nodeId, el, e, dragStart) {

    if (this.#snapEnabled && !this.#snapGrid.isDynamic) {
      let selected = this.#selector.getSelectedNodes();
      let targets = selected.size > 0 && selected.has(nodeId) ? selected : new Set([nodeId]);
      for (const id of targets) {
        let nodeEl = this.#nodeViews.get(id);
        if (!nodeEl) continue;
        let snapped = this.#snapGrid.snap(nodeEl._position.x, nodeEl._position.y);
        this.#animateNodeToPosition(id, snapped.x, snapped.y);
      }
    }


    for (const [, nodeEl] of this.#nodeViews) {
      delete nodeEl._dragStartPos;
    }


    this.#removeLift(el);


    if (dragStart && e && Selector.isTwitch(dragStart, { x: e.pageX, y: e.pageY })) {
      this.#onNodeClick(nodeId, e);
    }

    this.#editor.emit('nodedragged', { id: nodeId });
  }

  /**
   * Initialize subgraph preview canvas inside a graph-node
   * @param {HTMLElement} el - graph-node element
   * @param {import('../core/SubgraphNode.js').SubgraphNode} node
   * @param {HTMLCanvasElement} canvas - pre-created canvas element (already in DOM)
   */
  #initSubgraphPreview(el, node, canvas) {
    let ctx = canvas.getContext('2d');

    let drawPreview = () => {
      if (!el.isConnected) return;

      let w = canvas.width;
      let h = canvas.height;
      ctx.clearRect(0, 0, w, h);
      let previewColors = {
        connection: readCssToken(el, '--sn-subgraph-preview-connection'),
        completedConnection: readCssToken(el, '--sn-subgraph-preview-completed-connection'),
        processingFill: readCssToken(el, '--sn-subgraph-preview-processing-fill'),
        processingStroke: readCssToken(el, '--sn-subgraph-preview-processing-stroke'),
        processingGlow: readCssToken(el, '--sn-subgraph-preview-processing-glow'),
        completedFill: readCssToken(el, '--sn-subgraph-preview-completed-fill'),
        completedStroke: readCssToken(el, '--sn-subgraph-preview-completed-stroke'),
        idleFill: readCssToken(el, '--sn-subgraph-preview-idle-fill'),
        idleStroke: readCssToken(el, '--sn-subgraph-preview-idle-stroke'),
      };

      let innerEditor = node.innerEditor;
      if (!innerEditor) return;

      let nodes = innerEditor.getNodes();
      if (nodes.length === 0) return;


      let positions = node.innerPositions;
      let nodeRects = [];

      for (const n of nodes) {
        let pos = positions[n.id];
        let x = pos ? pos.x : 0;
        let y = pos ? pos.y : 0;
        nodeRects.push({ x, y, w: 160, h: 60, id: n.id });
      }


      let minX = Infinity,
        minY = Infinity,
        maxX = -Infinity,
        maxY = -Infinity;
      for (const r of nodeRects) {
        minX = Math.min(minX, r.x);
        minY = Math.min(minY, r.y);
        maxX = Math.max(maxX, r.x + r.w);
        maxY = Math.max(maxY, r.y + r.h);
      }

      let pad = 30;
      minX -= pad;
      minY -= pad;
      maxX += pad;
      maxY += pad;

      let graphW = maxX - minX;
      let graphH = maxY - minY;
      let scale = Math.min(w / graphW, h / graphH);
      let offsetX = (w - graphW * scale) / 2;
      let offsetY = (h - graphH * scale) / 2;


      let states = el._innerFlowStates || {};


      let conns = innerEditor.getConnections();
      for (const conn of conns) {
        let src = nodeRects.find((r) => r.id === conn.from);
        let tgt = nodeRects.find((r) => r.id === conn.to);
        if (src && tgt) {
          let sx = (src.x + src.w - minX) * scale + offsetX;
          let sy = (src.y + src.h / 2 - minY) * scale + offsetY;
          let tx = (tgt.x - minX) * scale + offsetX;
          let ty = (tgt.y + tgt.h / 2 - minY) * scale + offsetY;


          let srcState = states[conn.from];
          if (srcState === 'completed') {
            ctx.strokeStyle = previewColors.completedConnection;
            ctx.lineWidth = 2;
          } else {
            ctx.strokeStyle = previewColors.connection;
            ctx.lineWidth = 1;
          }

          ctx.beginPath();
          ctx.moveTo(sx, sy);
          ctx.lineTo(tx, ty);
          ctx.stroke();
        }
      }


      for (const r of nodeRects) {
        let rx = (r.x - minX) * scale + offsetX;
        let ry = (r.y - minY) * scale + offsetY;
        let rw = r.w * scale;
        let rh = r.h * scale;
        let state = states[r.id];
        let radius = 4;


        ctx.beginPath();
        ctx.moveTo(rx + radius, ry);
        ctx.lineTo(rx + rw - radius, ry);
        ctx.quadraticCurveTo(rx + rw, ry, rx + rw, ry + radius);
        ctx.lineTo(rx + rw, ry + rh - radius);
        ctx.quadraticCurveTo(rx + rw, ry + rh, rx + rw - radius, ry + rh);
        ctx.lineTo(rx + radius, ry + rh);
        ctx.quadraticCurveTo(rx, ry + rh, rx, ry + rh - radius);
        ctx.lineTo(rx, ry + radius);
        ctx.quadraticCurveTo(rx, ry, rx + radius, ry);
        ctx.closePath();

        if (state === 'processing') {
          ctx.fillStyle = previewColors.processingFill;
          ctx.fill();
          ctx.strokeStyle = previewColors.processingStroke;
          ctx.lineWidth = 1.5;
          ctx.stroke();

          ctx.shadowColor = previewColors.processingGlow;
          ctx.shadowBlur = 8;
          ctx.stroke();
          ctx.shadowBlur = 0;
        } else if (state === 'completed') {
          ctx.fillStyle = previewColors.completedFill;
          ctx.fill();
          ctx.strokeStyle = previewColors.completedStroke;
          ctx.lineWidth = 1;
          ctx.stroke();
        } else {
          ctx.fillStyle = previewColors.idleFill;
          ctx.fill();
          ctx.strokeStyle = previewColors.idleStroke;
          ctx.lineWidth = 0.5;
          ctx.stroke();
        }
      }
    };


    el._redrawPreview = drawPreview;


    drawPreview();
  }
}
