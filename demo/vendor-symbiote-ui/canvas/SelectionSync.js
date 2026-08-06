/**
 * SelectionSync.js
 *
 * Synchronizes the canvas DOM state (nodes, connections, inspector, toolbar)
 * with the internal Selector state.
 *
 * @module symbiote-ui/canvas/SelectionSync
 */

export class SelectionSync {
  /** @type {import('./NodeCanvas/NodeCanvas.js').NodeCanvas} */
  #canvas;
  /** @type {function(): import('../core/Editor.js').NodeEditor} */
  #getEditor;
  /** @type {Map<string, HTMLElement>} */
  #nodeViews;
  /** @type {function(): import('./ConnectionRenderer.js').ConnectionRenderer} */
  #getConnRenderer;

  #zCounter = 0;
  #connPathCache = new Map();

  /**
   * @param {object} options
   * @param {import('./NodeCanvas/NodeCanvas.js').NodeCanvas} options.canvas
   * @param {function(): import('../core/Editor.js').NodeEditor} options.getEditor
   * @param {Map<string, HTMLElement>} options.nodeViews
   * @param {function(): import('./ConnectionRenderer.js').ConnectionRenderer} options.getConnRenderer
   */
  constructor({ canvas, getEditor, nodeViews, getConnRenderer }) {
    this.#canvas = canvas;
    this.#getEditor = getEditor;
    this.#nodeViews = nodeViews;
    this.#getConnRenderer = getConnRenderer;
  }

  #toggleAttribute(el, attr, value) {
    if (!el) return;
    if (value !== el.hasAttribute(attr)) {
      value ? el.setAttribute(attr, '') : el.removeAttribute(attr);
    }
  }

  #findConnectionPart(root, attr, value) {
    if (!root) return null;
    return root.querySelector(`[${attr}="${value}"]`);
  }

  #connectionParts(id, path) {
    let connSvg = this.#canvas.ref.connections;
    let dotSvg = this.#canvas.ref.pseudoSvg || connSvg;
    return [
      path,
      this.#findConnectionPart(connSvg, 'data-conn-marker', id),
      this.#findConnectionPart(dotSvg, 'data-conn-dot', `${id}-start`),
      this.#findConnectionPart(dotSvg, 'data-conn-dot', `${id}-end`),
    ].filter(Boolean);
  }

  /**
   * Synchronize DOM when selection changes
   * @param {Set<string>} selectedNodes
   * @param {Set<string>} selectedConnections
   */
  sync(selectedNodes, selectedConnections) {
    this.#zCounter++;
    let editor = this.#getEditor();
    let nextSingleNodeId = selectedNodes.size === 1 ? [...selectedNodes][0] : '';
    let previousSingleNodeId = '';

    if (nextSingleNodeId) {
      for (const [id, el] of this.#nodeViews) {
        if (el.hasAttribute('data-selected')) {
          previousSingleNodeId = id;
          break;
        }
      }
    }

    let transitionOptions = this.#canvas._activeFocusTransitionOptions || {};
    let selectionTransition = previousSingleNodeId
      ? this.#canvas._prepareFocusTransitionFromIds?.(
          previousSingleNodeId,
          nextSingleNodeId,
          transitionOptions
        )
      : null;


    let neighbors = new Set();
    if (editor && selectedNodes.size > 0) {
      for (const conn of editor.getConnections()) {
        if (selectedNodes.has(conn.from)) neighbors.add(conn.to);
        if (selectedNodes.has(conn.to)) neighbors.add(conn.from);
      }
    }


    for (const [id, el] of this.#nodeViews) {
      let shouldSelect = selectedNodes.has(id);
      let isSelected = el.hasAttribute('data-selected');
      if (shouldSelect && !isSelected) {
        el.setAttribute('data-selected', '');
        el.style.zIndex = this.#zCounter;
      } else if (!shouldSelect && isSelected) {
        el.removeAttribute('data-selected');
      }

      let shouldNeighbor = neighbors.has(id) && !shouldSelect;
      let isNeighbor = el.hasAttribute('data-neighbor-focused');
      if (shouldNeighbor && !isNeighbor) {
        el.setAttribute('data-neighbor-focused', '');
      } else if (!shouldNeighbor && isNeighbor) {
        el.removeAttribute('data-neighbor-focused');
      }
    }

    if (nextSingleNodeId) {
      this.#canvas._runFocusTransition?.(nextSingleNodeId, selectionTransition, transitionOptions);
    }


    let activeConnIds = new Set();
    if (editor && selectedNodes.size > 0) {
      for (const conn of editor.getConnections()) {
        if (selectedNodes.has(conn.from) || selectedNodes.has(conn.to)) {
          activeConnIds.add(conn.id);
        }
      }
    }


    let connSvg = this.#canvas.ref.connections;
    let connRenderer = this.#getConnRenderer();
    if (!this.#connPathCache) this.#connPathCache = new Map();
    for (const [id] of connRenderer?.data || []) {
      let path = this.#connPathCache.get(id);
      if (!path || !path.isConnected) {
        path = connSvg.querySelector(`[data-conn-id="${id}"]`);
        if (path) this.#connPathCache.set(id, path);
      }
      if (!path) continue;


      let parts = this.#connectionParts(id, path);
      let shouldSelectConn = selectedConnections.has(id);
      for (const el of parts) {
        this.#toggleAttribute(el, 'data-selected', shouldSelectConn);
      }


      let isActive = activeConnIds.has(id);
      for (const el of parts) {
        this.#toggleAttribute(el, 'data-active-conn', isActive);
      }


      let shouldDim = !isActive && selectedNodes.size > 0;
      for (const el of parts) {
        this.#toggleAttribute(el, 'data-dimmed', shouldDim);
      }
    }

    // Reconcile selected/active/dimmed states on derived containment junctions
    const junctionEls = Array.from(connSvg.querySelectorAll('g[data-conn-marker^="junction::"]'));
    for (const el of junctionEls) {
      const connectionIds = el.getAttribute('data-connection-ids')?.split(',') || [];
      const isJunctionSelected = connectionIds.some(cid => selectedConnections.has(cid));
      const isJunctionActive = connectionIds.some(cid => activeConnIds.has(cid));
      const isJunctionDimmed = !isJunctionActive && selectedNodes.size > 0;

      this.#toggleAttribute(el, 'data-selected', isJunctionSelected);
      this.#toggleAttribute(el, 'data-active-conn', isJunctionActive);
      this.#toggleAttribute(el, 'data-dimmed', isJunctionDimmed);
    }


    if (connRenderer && typeof connRenderer.setSelectionState === 'function') {
      const allSelectedConnIds = new Set([...activeConnIds, ...selectedConnections]);
      connRenderer.setSelectionState(selectedNodes.size > 0 || selectedConnections.size > 0, allSelectedConnIds, selectedConnections);
    }


    let toolbar = this.#canvas.ref.quickToolbar;
    if (toolbar) {
      if (selectedNodes.size === 1) {
        let nodeId = [...selectedNodes][0];
        let nodeEl = this.#nodeViews.get(nodeId);
        if (nodeEl) toolbar.show(nodeId, nodeEl, { sticky: true });
      } else {
        toolbar.hide();
      }
    }


    let inspector = this.#canvas.ref.inspector;
    if (inspector) {
      inspector._canvas = this.#canvas;
      if (selectedNodes.size === 1) {
        let nodeId = [...selectedNodes][0];
        let node = editor?.getNode(nodeId);
        if (node) {
          inspector.inspect(node);
          inspector.hidden = false;
        }
      } else {
        inspector.clear();
        inspector.hidden = true;
      }
    }


    this.#canvas.dispatchEvent(
      new CustomEvent('selection-changed', {
        detail: { nodes: [...selectedNodes], connections: [...selectedConnections] },
      })
    );
  }
}

export { SelectionSync as default };
