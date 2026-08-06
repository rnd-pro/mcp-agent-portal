/**
 * ConnectFlow — interactive socket-to-socket connection creation
 *
 * Simplified version of Rete.js ClassicFlow.
 * Handles: pointerdown on socket → drag pseudo-line → pointerup on target socket → create connection.
 *
 * @module symbiote-ui/interactions/ConnectFlow
 */

import { Connection } from '../core/Connection.js';

/**
 * @typedef {object} SocketData
 * @property {string} nodeId - Node ID
 * @property {string} key - Port key
 * @property {'input'|'output'} side - Port side
 * @property {HTMLElement} element - Socket DOM element
 */

export class ConnectFlow {
  /** @type {SocketData|null} */
  #picked = null;

  /** @type {import('../core/Editor.js').NodeEditor} */
  #editor;

  /** @type {function} */
  #getNodePosition;

  /** @type {function} */
  #getNodeSize;

  /** @type {function} */
  #getTransform;

  /** @type {function|null} */
  #onPseudoStart = null;

  /** @type {function|null} */
  #onPseudoMove = null;

  /** @type {function|null} */
  #onPseudoEnd = null;

  /** @type {function|null} */
  #onDropEmpty = null;

  /** @type {function|null} - called during drag with world XY + picked socket */
  #onCompatibleMove = null;

  /** @type {function|null} - find nearest SVG dot as drop target */
  #findNearestDot = null;

  /** @type {number} - last time compatible move was emitted (ms) */
  #lastMoveTime = 0;

  /** @type {{ x: number, y: number }|null} - cached start position from pick */
  #pickedStartPos = null;

  /** @type {Set<SocketData>} */
  #sockets = new Set();

  /**
   * @param {import('../core/Editor.js').NodeEditor} editor
   * @param {object} callbacks
   * @param {function} callbacks.getNodePosition
   * @param {function} callbacks.getNodeSize
   * @param {function} callbacks.getTransform - Returns { x, y, k, rect }
   * @param {function} callbacks.onPseudoStart
   * @param {function} callbacks.onPseudoMove
   * @param {function} callbacks.onPseudoEnd
   * @param {function} [callbacks.onDropEmpty] - Called when connection dropped in empty space
   */
  constructor(editor, callbacks) {
    this.#editor = editor;
    this.#getNodePosition = callbacks.getNodePosition;
    this.#getNodeSize = callbacks.getNodeSize;
    this.#getTransform = callbacks.getTransform;
    this.#onPseudoStart = callbacks.onPseudoStart;
    this.#onPseudoMove = callbacks.onPseudoMove;
    this.#onPseudoEnd = callbacks.onPseudoEnd;
    this.#onDropEmpty = callbacks.onDropEmpty || null;
    this.#onCompatibleMove = callbacks.onCompatibleMove || null;
    this.#findNearestDot = callbacks.findNearestDot || null;

    window.addEventListener('pointermove', this.#onMove);
    window.addEventListener('pointerup', this.#onUp);
  }

  /**
   * Register a socket element for connection interaction
   * @param {HTMLElement} socketEl
   * @param {SocketData} data
   */
  registerSocket(socketEl, data) {
    this.#sockets.add(data);
    socketEl.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      e.preventDefault();

      if (data.side === 'input') {
        let existingConns = this.#editor.getConnections().filter(
          (c) => c.to === data.nodeId && c.in === data.key
        );
        if (existingConns.length > 0) {
          let conn = existingConns[0];
          let canvasEl = socketEl.closest('node-canvas');
          if (canvasEl) {
            let event = new CustomEvent('sn-connection-reconnect', {
              detail: {
                connectionId: conn.id,
                connection: conn,
                draggedSide: 'input',
                nodeId: data.nodeId,
                key: data.key,
              },
              cancelable: true,
              bubbles: true,
            });
            canvasEl.dispatchEvent(event);
            if (event.defaultPrevented) return;

            this.#editor.removeConnection(conn.id);

            // Reconnect: start picking from the source (output) socket
            let sourceNode = this.#editor.getNode(conn.from);
            if (sourceNode) {
              let sourceEl = canvasEl.getNodeView ? canvasEl.getNodeView(conn.from) : null;
              let sourceSocketEl = sourceEl?.querySelector(`.sn-socket[data-key="${conn.out}"]`);
              this.#pick({
                nodeId: conn.from,
                key: conn.out,
                side: 'output',
                element: sourceSocketEl,
              });
            }
            return;
          }
        }
      }

      this.#pick(data);
    });
  }

  /**
   * Whether a connection drag is in progress
   * @returns {boolean}
   */
  isPicking() {
    return this.#picked !== null;
  }

  /**
   * Get the currently picked socket data (during drag)
   * @returns {SocketData|null}
   */
  getPickedSocket() {
    return this.#picked;
  }

  /**
   * Externally initiate a connection drag from socket data
   * @param {SocketData} data
   */
  pickSocket(data) {

    if (!this.#sockets.has(data)) {
      this.#sockets.add(data);
    }
    this.#pick(data);
  }

  #pick(data) {
    this.#picked = data;
    let pos = this.#getSocketWorldPosition(data);
    if (this.#onPseudoStart) this.#onPseudoStart(pos.x, pos.y, data);
  }

  #onMove = (e) => {
    if (!this.#picked) return;
    e.preventDefault();

    let startPos = this.#getSocketWorldPosition(this.#picked);
    let t = this.#getTransform();

    let endX = (e.clientX - t.rect.left - t.x) / t.k;
    let endY = (e.clientY - t.rect.top - t.y) / t.k;

    if (this.#onPseudoMove) this.#onPseudoMove(startPos.x, startPos.y, endX, endY);


    let now = performance.now();
    if (this.#onCompatibleMove && now - this.#lastMoveTime > 16) {
      this.#lastMoveTime = now;
      this.#onCompatibleMove(endX, endY, this.#picked);
    }
  };

  #onUp = (e) => {
    if (!this.#picked) return;


    let t = this.#getTransform();
    let pointerX = (e.clientX - t.rect.left - t.x) / t.k;
    let pointerY = (e.clientY - t.rect.top - t.y) / t.k;
    let target = this.#findNearestSocket(pointerX, pointerY);

    if (target && this.#canConnect(this.#picked, target)) {
      this.#makeConnection(this.#picked, target);
    } else if (this.#findNearestDot) {

      let dotTarget = this.#findNearestDot(pointerX, pointerY);
      if (dotTarget) {
        let dotSocket = { nodeId: dotTarget.nodeId, key: dotTarget.key, side: dotTarget.side };
        if (this.#canConnect(this.#picked, dotSocket)) {
          this.#makeConnection(this.#picked, dotSocket);
        } else if (this.#onDropEmpty) {
          this.#onDropEmpty(pointerX, pointerY, this.#picked);
        }
      } else if (this.#onDropEmpty) {
        this.#onDropEmpty(pointerX, pointerY, this.#picked);
      }
    } else if (this.#onDropEmpty) {

      this.#onDropEmpty(pointerX, pointerY, this.#picked);
    }

    this.#picked = null;
    if (this.#onPseudoEnd) this.#onPseudoEnd();
  };
  /**
   * Get socket position in graph coordinate space
   * Uses getBoundingClientRect with zoom compensation
   * @param {SocketData} data
   * @returns {{ x: number, y: number }}
   */
  #getSocketWorldPosition(data) {

    if (data.worldX !== undefined && data.worldY !== undefined) {
      return { x: data.worldX, y: data.worldY };
    }

    let pos = this.#getNodePosition(data.nodeId);
    if (!pos) return { x: 0, y: 0 };

    if (data.element) {
      let graphNode = data.element.closest('graph-node');
      if (graphNode) {
        let t = this.#getTransform();
        let nodeRect = graphNode.getBoundingClientRect();
        let socketRect = data.element.getBoundingClientRect();

        let offsetX = (socketRect.left - nodeRect.left + socketRect.width / 2) / t.k;
        let offsetY = (socketRect.top - nodeRect.top + socketRect.height / 2) / t.k;
        return { x: pos.x + offsetX, y: pos.y + offsetY };
      }
    }


    let size = this.#getNodeSize(data.nodeId);
    if (!size) return { x: 0, y: 0 };
    return {
      x: data.side === 'output' ? pos.x + size.width : pos.x,
      y: pos.y + size.height / 2,
    };
  }

  /**
   * Find nearest registered socket within snap distance
   * Uses registered socket collection instead of DOM hit-testing
   * @param {number} worldX - Pointer X in graph coordinates
   * @param {number} worldY - Pointer Y in graph coordinates
   * @returns {SocketData|null}
   */
  #findNearestSocket(worldX, worldY) {
    const SNAP_DISTANCE = 30;
    let nearest = null;
    let nearestDist = SNAP_DISTANCE;

    for (const socket of this.#sockets) {

      if (socket === this.#picked) continue;

      let pos = this.#getSocketWorldPosition(socket);
      let dx = worldX - pos.x;
      let dy = worldY - pos.y;
      let dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < nearestDist) {
        nearestDist = dist;
        nearest = socket;
      }
    }

    return nearest;
  }

  /**
   * Check if two sockets can be connected
   * @param {SocketData} from
   * @param {SocketData} to
   * @returns {boolean}
   */
  #canConnect(from, to) {
    if (from.side === to.side) return false;
    if (from.nodeId === to.nodeId) return false;

    let fromNode = this.#editor.getNode(from.nodeId);
    let toNode = this.#editor.getNode(to.nodeId);
    if (!fromNode || !toNode) return false;

    let isFromOutput = from.side === 'output';
    let output = isFromOutput ? fromNode.outputs[from.key] : toNode.outputs[to.key];
    let input = isFromOutput ? toNode.inputs[to.key] : fromNode.inputs[from.key];

    if (!output || !input) return false;

    return output.socket.isCompatibleWith(input.socket);
  }

  /**
   * Create the connection
   * @param {SocketData} from
   * @param {SocketData} to
   */
  #makeConnection(from, to) {
    let sourceData = from.side === 'output' ? from : to;
    let targetData = from.side === 'input' ? from : to;

    let sourceNode = this.#editor.getNode(sourceData.nodeId);
    let targetNode = this.#editor.getNode(targetData.nodeId);
    if (!sourceNode || !targetNode) return;

    let conn = new Connection(sourceNode, sourceData.key, targetNode, targetData.key);
    this.#editor.addConnection(conn);
  }

  /** Cleanup */
  destroy() {
    window.removeEventListener('pointermove', this.#onMove);
    window.removeEventListener('pointerup', this.#onUp);
  }
}

export { ConnectFlow as default };
