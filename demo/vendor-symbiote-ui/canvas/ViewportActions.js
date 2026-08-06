import { translate } from '../locale/index.js';
import { alignNodes, distributeNodes } from '../interactions/SelectionGeometry.js';

/**
 * ViewportActions — context menu, keyboard shortcuts, viewport utilities
 *
 * Handles right-click menus (canvas/node/connection),
 * keyboard shortcuts (Delete, Ctrl+A, Escape),
 * fitView, selectAll, deleteSelected, and socket highlighting.
 * Extracted from NodeCanvas to reduce complexity.
 *
 * @module symbiote-ui/canvas/ViewportActions
 */

export class ViewportActions {
  /** @type {import('../core/Editor.js').NodeEditor} */
  #editor;

  /** @type {import('../interactions/Selector.js').Selector} */
  #selector;

  /** @type {Map<string, HTMLElement>} */
  #nodeViews;

  /** @type {boolean} */
  #readonly = false;

  /** @type {Array|null} - clipboard for copy/paste */
  #clipboard = null;

  /** @type {import('./NodeCanvas/NodeCanvas.js').NodeCanvas} */
  #canvas;

  /**
   * @param {object} config
   * @param {import('../core/Editor.js').NodeEditor} config.editor
   * @param {import('../interactions/Selector.js').Selector} config.selector
   * @param {Map<string, HTMLElement>} config.nodeViews
   * @param {import('./NodeCanvas/NodeCanvas.js').NodeCanvas} config.canvas
   */
  constructor({ editor, selector, nodeViews, canvas }) {
    this.#editor = editor;
    this.#selector = selector;
    this.#nodeViews = nodeViews;
    this.#canvas = canvas;
  }

  /** @param {boolean} readonly */
  setReadonly(readonly) {
    this.#readonly = readonly;
  }

  /**
   * Keyboard handler — bind to container
   * @param {KeyboardEvent} e
   */
  #dispatchIntent(eventName, detail) {
    if (!this.#canvas) return true;
    let event = new CustomEvent(eventName, {
      detail,
      cancelable: true,
      bubbles: true,
    });
    this.#canvas.dispatchEvent(event);
    return !event.defaultPrevented;
  }

  /**
   * Keyboard handler — bind to container
   * @param {KeyboardEvent} e
   */
  handleKeydown = (e) => {
    if (this.#readonly) return;

    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      this.deleteSelected();
    }

    if (e.key === 'a' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      this.selectAll();
    }

    if (e.key === 'Escape') {
      this.#selector.unselectAll();
    }


    if (e.key === 'c' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      let selectedNodeIds = Array.from(this.#selector.getSelectedNodes());
      if (selectedNodeIds.length > 0) {
        let defaultData = selectedNodeIds.map(id => {
          let node = this.#editor.getNode(id);
          let el = this.#nodeViews.get(id);
          return node ? {
            node,
            position: el?._position ? { ...el._position } : { x: 0, y: 0 }
          } : null;
        }).filter(Boolean);
        if (this.#dispatchIntent('sn-clipboard-copy', { nodeIds: selectedNodeIds, defaultData })) {
          this.#copySelected();
        }
      }
    }


    if (e.key === 'x' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      let selectedNodeIds = Array.from(this.#selector.getSelectedNodes());
      if (selectedNodeIds.length > 0) {
        let defaultData = selectedNodeIds.map(id => {
          let node = this.#editor.getNode(id);
          let el = this.#nodeViews.get(id);
          return node ? {
            node,
            position: el?._position ? { ...el._position } : { x: 0, y: 0 }
          } : null;
        }).filter(Boolean);
        if (this.#dispatchIntent('sn-clipboard-cut', { nodeIds: selectedNodeIds, defaultData })) {
          this.#copySelected();
          this.deleteSelected();
        }
      }
    }


    if (e.key === 'v' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      if (this.#dispatchIntent('sn-clipboard-paste', { clipboard: this.#clipboard })) {
        this.#pasteNodes();
      }
    }

    if (e.key === 'z' && (e.ctrlKey || e.metaKey) && !e.shiftKey) {
      e.preventDefault();
      this.#dispatchIntent('sn-undo', {});
    }

    if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
      e.preventDefault();
      this.#dispatchIntent('sn-redo', {});
    }


    if (e.key === 'h' && (e.ctrlKey || e.metaKey) && e.shiftKey) {
      e.preventDefault();
      this.alignSelectedHorizontal();
    }


    if (e.key === 'j' && (e.ctrlKey || e.metaKey) && e.shiftKey) {
      e.preventDefault();
      this.alignSelectedVertical();
    }
  };

  /** Select all nodes */
  selectAll() {
    for (const [id] of this.#nodeViews) {
      this.#selector.selectNode(id, true);
    }
  }

  /** Delete all selected nodes and connections */
  deleteSelected() {
    if (!this.#editor || this.#readonly) return;

    for (const connId of this.#selector.getSelectedConnections()) {
      this.#editor.removeConnection(connId);
    }

    for (const nodeId of this.#selector.getSelectedNodes()) {
      this.#editor.removeNode(nodeId);
    }

    this.#selector.unselectAll();
  }

  /** Delete a single node */
  deleteNode(nodeId) {
    if (!this.#editor || this.#readonly) return;
    this.#editor.removeNode(nodeId);
  }

  /** Emit clone event for a node */
  cloneNode(nodeId) {
    if (!this.#editor || this.#readonly) return;
    this.#editor.emit('contextclone', { nodeId });
  }

  /**
   * Generic toggle: flip a boolean on node, sync DOM attribute, emit event
   * @param {string} nodeId
   * @param {string} prop - node property name (e.g. 'collapsed', 'muted')
   * @param {string} attr - DOM attribute name (e.g. 'data-collapsed', 'data-muted')
   * @param {string} eventName - editor event (e.g. 'nodecollapse', 'nodemute')
   */
  #toggleNodeState(nodeId, prop, attr, eventName) {
    if (!this.#editor) return;
    let node = this.#editor.getNode(nodeId);
    if (!node) return;
    node[prop] = !node[prop];
    let el = this.#nodeViews.get(nodeId);
    if (el) {
      node[prop] ? el.setAttribute(attr, '') : el.removeAttribute(attr);
    }
    this.#editor.emit(eventName, { nodeId, [prop]: node[prop] });
  }

  /** @param {string} nodeId */
  collapseNode(nodeId) {
    this.#toggleNodeState(nodeId, 'collapsed', 'data-collapsed', 'nodecollapse');
  }

  /** @param {string} nodeId */
  muteNode(nodeId) {
    this.#toggleNodeState(nodeId, 'muted', 'data-muted', 'nodemute');
  }

  /** Delete a single connection */
  deleteConnection(connId) {
    if (!this.#editor || this.#readonly) return;
    this.#editor.removeConnection(connId);
  }

  /**
   * Show context menu based on click target
   * @param {MouseEvent} e
   * @param {HTMLElement} contextMenuEl - context-menu component
   * @param {HTMLElement} container - canvas container for coordinate calc
   * @param {{ panX: number, panY: number, zoom: number }} transform
   */
  showContextMenu(e, contextMenuEl, container, transform) {
    if (this.#readonly) return;
    e.preventDefault();

    let target = e.target.closest('graph-node');
    let connTarget = e.target.closest('.sn-conn-path');
    if (!contextMenuEl) return;

    let rect = container.getBoundingClientRect();
    let menuX = e.clientX;
    let menuY = e.clientY;

    if (target) {
      let nodeId = target.getAttribute('node-id');
      contextMenuEl.show(menuX, menuY, [
        { label: translate('context.deleteNode'), icon: 'delete', action: () => this.deleteNode(nodeId) },
        { label: translate('context.cloneNode'), icon: 'content_copy', action: () => this.cloneNode(nodeId) },
        { label: translate('context.selectAll'), icon: 'select_all', action: () => this.selectAll() },
      ], e.target, e);
    } else if (connTarget) {
      let connId = connTarget.getAttribute('data-conn-id');
      contextMenuEl.show(menuX, menuY, [
        {
          label: translate('context.deleteConnection'),
          icon: 'link_off',
          action: () => this.deleteConnection(connId),
        },
      ], e.target, e);
    } else {
      let graphX = (e.clientX - rect.left - transform.panX) / transform.zoom;
      let graphY = (e.clientY - rect.top - transform.panY) / transform.zoom;
      contextMenuEl.show(menuX, menuY, [
        {
          label: translate('context.addNode'),
          icon: 'add_box',
          action: () => this.#editor?.emit('contextadd', { x: graphX, y: graphY }),
        },
        {
          label: translate('context.addComment'),
          icon: 'sticky_note_2',
          action: () => this.#editor?.emit('contextaddcomment', { x: graphX, y: graphY }),
        },
        {
          label: translate('context.addFrame'),
          icon: 'dashboard',
          action: () => this.#editor?.emit('contextaddframe', { x: graphX, y: graphY }),
        },
        { label: translate('context.paste'), icon: 'content_paste', action: () => this.#pasteNodes(graphX, graphY) },
        { label: translate('context.selectAll'), icon: 'select_all', action: () => this.selectAll() },
        { label: translate('context.fitView'), icon: 'fit_screen', action: () => this.#canvas?.fitView() },
        {
          label: translate('context.autoLayout'),
          icon: 'auto_fix_high',
          action: () => this.#editor?.emit('autolayout'),
        },
      ], e.target, e);
    }
  }

  /**
   * Highlight sockets compatible with picked socket
   * @param {object} socketData
   */
  highlightCompatibleSockets(socketData) {
    let node = this.#editor.getNode(socketData.nodeId);
    if (!node) return;

    let isOutput = socketData.side === 'output';
    let pickedPort = isOutput ? node.outputs[socketData.key] : node.inputs[socketData.key];
    if (!pickedPort) return;

    let pickedSocket = pickedPort.socket;

    for (const [nodeId, el] of this.#nodeViews) {
      if (nodeId === socketData.nodeId) continue;
      let targetNode = this.#editor.getNode(nodeId);
      if (!targetNode) continue;

      let ports = isOutput ? targetNode.inputs : targetNode.outputs;
      for (const [key, port] of Object.entries(ports)) {
        let sockets = el.querySelectorAll(`.sn-socket[data-key="${key}"]`);
        for (const sock of sockets) {
          if (pickedSocket.isCompatibleWith(port.socket)) {
            sock.setAttribute('data-compatible', '');
          } else {
            sock.setAttribute('data-incompatible', '');
          }
        }
      }

      let sameSidePorts = isOutput ? targetNode.outputs : targetNode.inputs;
      for (const [key] of Object.entries(sameSidePorts)) {
        let sockets = el.querySelectorAll(`.sn-socket[data-key="${key}"]`);
        for (const sock of sockets) {
          sock.setAttribute('data-incompatible', '');
        }
      }
    }
  }

  /**
   * Clear all socket highlights
   * @param {HTMLElement} nodesLayer
   */
  clearSocketHighlights(nodesLayer) {
    let all = nodesLayer.querySelectorAll(
      '.sn-socket[data-compatible], .sn-socket[data-incompatible]'
    );
    for (const sock of all) {
      sock.removeAttribute('data-compatible');
      sock.removeAttribute('data-incompatible');
    }
  }

  /**
   * Show port hints: highlight compatible ports on nearest side
   * @param {number} worldX - Cursor X in graph coordinates
   * @param {number} worldY - Cursor Y in graph coordinates
   * @param {object} socketData - Picked socket data
   * @returns {Set<string>}
   */
  updatePortHints(worldX, worldY, socketData) {
    let compatibleIds = this.getCompatibleNodeIds(socketData);

    for (const [nodeId, el] of this.#nodeViews) {
      if (compatibleIds.has(nodeId)) {
        let nodePos = el._position;
        let nodeW = el.offsetWidth || 180;
        let nodeCenterX = nodePos ? nodePos.x + nodeW / 2 : 0;
        el.setAttribute('data-port-hint', worldX < nodeCenterX ? 'left' : 'right');
      } else {
        el.removeAttribute('data-port-hint');
      }
    }

    return compatibleIds;
  }

  /**
   * Get set of node IDs with compatible ports (no teleportation)
   * @param {object} socketData - Picked socket data
   * @returns {Set<string>}
   */
  getCompatibleNodeIds(socketData) {
    let pickedNode = this.#editor.getNode(socketData.nodeId);
    if (!pickedNode) return new Set();

    let isOutput = socketData.side === 'output';
    let pickedPort = isOutput
      ? pickedNode.outputs[socketData.key]
      : pickedNode.inputs[socketData.key];
    if (!pickedPort) return new Set();

    let pickedSocket = pickedPort.socket;
    let compatibleIds = new Set();

    for (const [nodeId] of this.#nodeViews) {
      if (nodeId === socketData.nodeId) continue;
      let targetNode = this.#editor.getNode(nodeId);
      if (!targetNode) continue;

      let ports = isOutput ? targetNode.inputs : targetNode.outputs;
      for (const [, port] of Object.entries(ports)) {
        if (pickedSocket.isCompatibleWith(port.socket)) {
          compatibleIds.add(nodeId);
          break;
        }
      }
    }

    return compatibleIds;
  }

  /**
   * Clear all port hints
   */
  clearPortHints() {
    for (const [, el] of this.#nodeViews) {
      el.removeAttribute('data-port-hint');
    }
  }

  /**
   * Handle connection dropped in empty space
   * @param {number} x
   * @param {number} y
   * @param {object} socketData
   */
  handleDropEmpty(x, y, socketData) {
    let node = this.#editor.getNode(socketData.nodeId);
    if (!node) return;

    let isOutput = socketData.side === 'output';
    let port = isOutput ? node.outputs[socketData.key] : node.inputs[socketData.key];
    let socketType = port?.socket?.type || 'any';

    this.#editor.emit('dropinempty', {
      x,
      y,
      sourceNodeId: socketData.nodeId,
      sourceKey: socketData.key,
      sourceSide: socketData.side,
      socketType,
    });
  }


  #copySelected() {
    let selected = Array.from(this.#selector.getSelectedNodes());
    if (selected.length === 0) return;

    this.#clipboard = selected
      .map((nodeId) => {
        let node = this.#editor.getNode(nodeId);
        let el = this.#nodeViews.get(nodeId);
        if (!node) return null;
        return {
          label: node.label,
          type: node.type,
          category: node.category,
          shape: node.shape,
          params: { ...node.params },
          position: el?._position ? { ...el._position } : { x: 0, y: 0 },
        };
      })
      .filter(Boolean);
  }

  /**
   * Paste copied nodes at optional position
   * @param {number} [x]
   * @param {number} [y]
   */
  #pasteNodes(x, y) {
    if (!this.#clipboard || this.#clipboard.length === 0) return;

    let offset = 30;
    for (const data of this.#clipboard) {
      let posX = x != null ? x : data.position.x + offset;
      let posY = y != null ? y : data.position.y + offset;
      this.#editor.emit('contextclone', {
        label: data.label,
        type: data.type,
        category: data.category,
        shape: data.shape,
        x: posX,
        y: posY,
      });
    }
  }


  /** Align selected nodes horizontally (same Y) */
  alignSelectedHorizontal() {
    let selected = Array.from(this.#selector.getSelectedNodes());
    if (selected.length < 2) return;

    let totalY = 0;
    for (const nodeId of selected) {
      let el = this.#nodeViews.get(nodeId);
      totalY += el?._position?.y || 0;
    }
    let avgY = totalY / selected.length;

    for (const nodeId of selected) {
      let el = this.#nodeViews.get(nodeId);
      if (el?._position) {
        this.#editor.emit('nodemovetopos', {
          nodeId,
          x: el._position.x,
          y: avgY,
        });
      }
    }
  }

  /** Align selected nodes vertically (same X) */
  alignSelectedVertical() {
    let selected = Array.from(this.#selector.getSelectedNodes());
    if (selected.length < 2) return;

    let totalX = 0;
    for (const nodeId of selected) {
      let el = this.#nodeViews.get(nodeId);
      totalX += el?._position?.x || 0;
    }
    let avgX = totalX / selected.length;

    for (const nodeId of selected) {
      let el = this.#nodeViews.get(nodeId);
      if (el?._position) {
        this.#editor.emit('nodemovetopos', {
          nodeId,
          x: avgX,
          y: el._position.y,
        });
      }
    }
  }

  /** Align selected nodes by their left edge */
  alignSelectedLeft() {
    let selected = Array.from(this.#selector.getSelectedNodes());
    if (selected.length < 2) return;
    let nodePositions = {};
    let nodeSizes = {};
    for (const id of selected) {
      let el = this.#nodeViews.get(id);
      if (el) {
        nodePositions[id] = el._position || { x: 0, y: 0 };
        nodeSizes[id] = { width: el.offsetWidth || 180, height: el.offsetHeight || 60 };
      }
    }
    let newPositions = alignNodes(nodePositions, nodeSizes, selected, 'left');
    for (const [id, pos] of Object.entries(newPositions)) {
      this.#editor.emit('nodemovetopos', { nodeId: id, x: pos.x, y: pos.y });
    }
  }

  /** Align selected nodes by their right edge */
  alignSelectedRight() {
    let selected = Array.from(this.#selector.getSelectedNodes());
    if (selected.length < 2) return;
    let nodePositions = {};
    let nodeSizes = {};
    for (const id of selected) {
      let el = this.#nodeViews.get(id);
      if (el) {
        nodePositions[id] = el._position || { x: 0, y: 0 };
        nodeSizes[id] = { width: el.offsetWidth || 180, height: el.offsetHeight || 60 };
      }
    }
    let newPositions = alignNodes(nodePositions, nodeSizes, selected, 'right');
    for (const [id, pos] of Object.entries(newPositions)) {
      this.#editor.emit('nodemovetopos', { nodeId: id, x: pos.x, y: pos.y });
    }
  }

  /** Align selected nodes by their top edge */
  alignSelectedTop() {
    let selected = Array.from(this.#selector.getSelectedNodes());
    if (selected.length < 2) return;
    let nodePositions = {};
    let nodeSizes = {};
    for (const id of selected) {
      let el = this.#nodeViews.get(id);
      if (el) {
        nodePositions[id] = el._position || { x: 0, y: 0 };
        nodeSizes[id] = { width: el.offsetWidth || 180, height: el.offsetHeight || 60 };
      }
    }
    let newPositions = alignNodes(nodePositions, nodeSizes, selected, 'top');
    for (const [id, pos] of Object.entries(newPositions)) {
      this.#editor.emit('nodemovetopos', { nodeId: id, x: pos.x, y: pos.y });
    }
  }

  /** Align selected nodes by their bottom edge */
  alignSelectedBottom() {
    let selected = Array.from(this.#selector.getSelectedNodes());
    if (selected.length < 2) return;
    let nodePositions = {};
    let nodeSizes = {};
    for (const id of selected) {
      let el = this.#nodeViews.get(id);
      if (el) {
        nodePositions[id] = el._position || { x: 0, y: 0 };
        nodeSizes[id] = { width: el.offsetWidth || 180, height: el.offsetHeight || 60 };
      }
    }
    let newPositions = alignNodes(nodePositions, nodeSizes, selected, 'bottom');
    for (const [id, pos] of Object.entries(newPositions)) {
      this.#editor.emit('nodemovetopos', { nodeId: id, x: pos.x, y: pos.y });
    }
  }

  /** Distributes selected nodes horizontally */
  distributeSelectedHorizontal() {
    let selected = Array.from(this.#selector.getSelectedNodes());
    if (selected.length < 3) return;
    let nodePositions = {};
    let nodeSizes = {};
    for (const id of selected) {
      let el = this.#nodeViews.get(id);
      if (el) {
        nodePositions[id] = el._position || { x: 0, y: 0 };
        nodeSizes[id] = { width: el.offsetWidth || 180, height: el.offsetHeight || 60 };
      }
    }
    let newPositions = distributeNodes(nodePositions, nodeSizes, selected, 'horizontal');
    for (const [id, pos] of Object.entries(newPositions)) {
      this.#editor.emit('nodemovetopos', { nodeId: id, x: pos.x, y: pos.y });
    }
  }

  /** Distributes selected nodes vertically */
  distributeSelectedVertical() {
    let selected = Array.from(this.#selector.getSelectedNodes());
    if (selected.length < 3) return;
    let nodePositions = {};
    let nodeSizes = {};
    for (const id of selected) {
      let el = this.#nodeViews.get(id);
      if (el) {
        nodePositions[id] = el._position || { x: 0, y: 0 };
        nodeSizes[id] = { width: el.offsetWidth || 180, height: el.offsetHeight || 60 };
      }
    }
    let newPositions = distributeNodes(nodePositions, nodeSizes, selected, 'vertical');
    for (const [id, pos] of Object.entries(newPositions)) {
      this.#editor.emit('nodemovetopos', { nodeId: id, x: pos.x, y: pos.y });
    }
  }
}
