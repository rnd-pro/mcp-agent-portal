/**
 * History — undo/redo action stack for NodeEditor
 *
 * Records editor actions (addNode, removeNode, move, connect, disconnect)
 * and provides undo()/redo() with Ctrl+Z / Ctrl+Shift+Z keyboard bindings.
 * Plugin pattern: attach to editor via history.listen(editor).
 *
 * @module symbiote-ui/plugins/History
 */

/**
 * @typedef {object} HistoryAction
 * @property {'addNode'|'removeNode'|'moveNode'|'addConnection'|'removeConnection'|'addFrame'|'removeFrame'} type
 * @property {object} data - Serialized action data for undo/redo
 */

const MAX_STACK = 200;

export class History {
  /** @type {HistoryAction[]} */
  #undoStack = [];

  /** @type {HistoryAction[]} */
  #redoStack = [];

  /** @type {import('../core/Editor.js').NodeEditor|null} */
  #editor = null;

  /** @type {function|null} */
  #getCanvas = null;

  /** @type {boolean} - prevent recording actions triggered by undo/redo itself */
  #isApplying = false;

  /** @type {function[]} - unsubscribe functions */
  #unsubs = [];

  /** @type {object} - injected class constructors */
  #classes = {};

  /**
   * Attach history tracking to an editor
   * @param {import('../core/Editor.js').NodeEditor} editor
   * @param {object} [options]
   * @param {function} [options.getCanvas] - returns canvas element for position tracking
   * @param {object} [options.classes] - class constructors: { Node, Connection, Frame, Socket, Input, Output, InputControl }
   */
  listen(editor, options = {}) {
    this.#editor = editor;
    this.#getCanvas = options.getCanvas || null;
    this.#classes = options.classes || {};


    this.#unsubs.push(
      editor.on('nodecreated', (node) => {
        if (this.#isApplying) return;
        let canvas = this.#getCanvas?.();
        let pos = canvas ? this.#getNodePosition(canvas, node.id) : [0, 0];
        this.#push({
          type: 'addNode',
          data: { node: this.#serializeNode(node), position: pos },
        });
      })
    );


    this.#unsubs.push(
      editor.on('noderemove', (node) => {
        if (this.#isApplying) return;
        let canvas = this.#getCanvas?.();
        let pos = canvas ? this.#getNodePosition(canvas, node.id) : [0, 0];

        let conns = editor.getNodeConnections(node.id).map((c) => this.#serializeConnection(c));
        this.#push({
          type: 'removeNode',
          data: { node: this.#serializeNode(node), position: pos, connections: conns },
        });
      })
    );


    this.#unsubs.push(
      editor.on('nodepicked', (node) => {
        if (this.#isApplying) return;
        let canvas = this.#getCanvas?.();
        if (!canvas) return;
        let pos = this.#getNodePosition(canvas, node.id);
        node._historyStartPos = pos;
      })
    );

    this.#unsubs.push(
      editor.on('nodedragged', ({ id }) => {
        if (this.#isApplying) return;
        let node = editor.getNode(id);
        if (!node?._historyStartPos) return;
        let canvas = this.#getCanvas?.();
        let endPos = canvas ? this.#getNodePosition(canvas, id) : [0, 0];
        let startPos = node._historyStartPos;

        if (startPos[0] !== endPos[0] || startPos[1] !== endPos[1]) {
          this.#push({
            type: 'moveNode',
            data: { nodeId: id, from: startPos, to: endPos },
          });
        }
        delete node._historyStartPos;
      })
    );


    this.#unsubs.push(
      editor.on('connectioncreated', (conn) => {
        if (this.#isApplying) return;
        this.#push({
          type: 'addConnection',
          data: { connection: this.#serializeConnection(conn) },
        });
      })
    );

    this.#unsubs.push(
      editor.on('connectionremove', (conn) => {
        if (this.#isApplying) return;
        this.#push({
          type: 'removeConnection',
          data: { connection: this.#serializeConnection(conn) },
        });
      })
    );


    this.#unsubs.push(
      editor.on('framecreated', (frame) => {
        if (this.#isApplying) return;
        this.#push({
          type: 'addFrame',
          data: { frame: { ...frame } },
        });
      })
    );

    this.#unsubs.push(
      editor.on('frameremove', (frame) => {
        if (this.#isApplying) return;
        this.#push({
          type: 'removeFrame',
          data: { frame: { ...frame } },
        });
      })
    );
  }

  bindKeyboard(target) {
    let handler = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        e.preventDefault();
        if (e.shiftKey) this.redo();
        else this.undo();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
        e.preventDefault();
        this.redo();
      }
    };
    target.addEventListener('keydown', handler);
    this.#unsubs.push(() => target.removeEventListener('keydown', handler));
  }

  /** Undo last action */
  undo() {
    let action = this.#undoStack.pop();
    if (!action) return;
    this.#isApplying = true;
    try {
      this.#applyReverse(action);
      this.#redoStack.push(action);
    } finally {
      this.#isApplying = false;
    }
  }

  /** Redo last undone action */
  redo() {
    let action = this.#redoStack.pop();
    if (!action) return;
    this.#isApplying = true;
    try {
      this.#applyForward(action);
      this.#undoStack.push(action);
    } finally {
      this.#isApplying = false;
    }
  }

  /** @returns {number} */
  get undoCount() {
    return this.#undoStack.length;
  }

  /** @returns {number} */
  get redoCount() {
    return this.#redoStack.length;
  }

  /** Clear all history */
  clear() {
    this.#undoStack = [];
    this.#redoStack = [];
  }

  /** Destroy and unsubscribe */
  destroy() {
    for (const unsub of this.#unsubs) {
      if (typeof unsub === 'function') unsub();
    }
    this.#unsubs = [];
    this.clear();
    this.#editor = null;
  }


  #push(action) {
    this.#undoStack.push(action);
    if (this.#undoStack.length > MAX_STACK) this.#undoStack.shift();
    this.#redoStack = [];
  }

  #applyReverse(action) {
    let editor = this.#editor;
    let canvas = this.#getCanvas?.();
    if (!editor) return;

    let reverseMap = {
      addNode: () => editor.removeNode(action.data.node.id),
      removeNode: () => {
        let { node: nodeData, position, connections } = action.data;
        let restoredNode = this.#deserializeNode(nodeData);
        editor.addNode(restoredNode);
        if (canvas && position) canvas.setNodePosition(restoredNode.id, position[0], position[1]);
        for (let connData of connections) {
          let conn = new this.#classes.Connection(
            connData.from,
            connData.out,
            connData.to,
            connData.in
          );
          conn.id = connData.id;
          try {
            editor.addConnection(conn);
          } catch {

          }
        }
      },
      moveNode: () =>
        canvas?.setNodePosition(action.data.nodeId, action.data.from[0], action.data.from[1]),
      addConnection: () => editor.removeConnection(action.data.connection.id),
      removeConnection: () => {
        let connData = action.data.connection;
        let conn = new this.#classes.Connection(
          connData.from,
          connData.out,
          connData.to,
          connData.in
        );
        conn.id = connData.id;
        try {
          editor.addConnection(conn);
        } catch {

        }
      },
      addFrame: () => editor.removeFrame(action.data.frame.id),
      removeFrame: () => {
        let frame = new this.#classes.Frame(action.data.frame.label, action.data.frame);
        frame.id = action.data.frame.id;
        editor.addFrame(frame);
      },
    };

    reverseMap[action.type]?.();
  }

  #applyForward(action) {
    let editor = this.#editor;
    let canvas = this.#getCanvas?.();
    if (!editor) return;

    let forwardMap = {
      addNode: () => {
        let restoredNode = this.#deserializeNode(action.data.node);
        editor.addNode(restoredNode);
        if (canvas && action.data.position)
          canvas.setNodePosition(restoredNode.id, action.data.position[0], action.data.position[1]);
      },
      removeNode: () => editor.removeNode(action.data.node.id),
      moveNode: () =>
        canvas?.setNodePosition(action.data.nodeId, action.data.to[0], action.data.to[1]),
      addConnection: () => {
        let connData = action.data.connection;
        let conn = new this.#classes.Connection(
          connData.from,
          connData.out,
          connData.to,
          connData.in
        );
        conn.id = connData.id;
        try {
          editor.addConnection(conn);
        } catch {

        }
      },
      removeConnection: () => editor.removeConnection(action.data.connection.id),
      addFrame: () => {
        let frame = new this.#classes.Frame(action.data.frame.label, action.data.frame);
        frame.id = action.data.frame.id;
        editor.addFrame(frame);
      },
      removeFrame: () => editor.removeFrame(action.data.frame.id),
    };

    forwardMap[action.type]?.();
  }

  #serializeNode(node) {
    return {
      id: node.id,
      label: node.label,
      type: node.type,
      category: node.category,
      shape: node.shape,
      params: { ...node.params },
      inputs: Object.fromEntries(
        Object.entries(node.inputs).map(([k, v]) => [
          k,
          {
            socket: v.socket ? { type: v.socket.type, color: v.socket.color } : null,
            label: v.label,
          },
        ])
      ),
      outputs: Object.fromEntries(
        Object.entries(node.outputs).map(([k, v]) => [
          k,
          {
            socket: v.socket ? { type: v.socket.type, color: v.socket.color } : null,
            label: v.label,
          },
        ])
      ),
      controls: Object.fromEntries(
        Object.entries(node.controls).map(([k, v]) => [
          k,
          {
            label: v.label,
            value: v.value,
            type: v.type,
          },
        ])
      ),
    };
  }

  #serializeConnection(conn) {
    return { id: conn.id, from: conn.from, out: conn.out, to: conn.to, in: conn.in };
  }

  #deserializeNode(data) {
    let { Node, Socket, Input, Output, InputControl } = this.#classes;
    let node = new Node(data.label, {
      type: data.type,
      category: data.category,
      shape: data.shape,
    });
    node.id = data.id;
    node.params = { ...data.params };

    for (const [key, inp] of Object.entries(data.inputs)) {
      let socket = inp.socket
        ? new Socket(inp.socket.type, { color: inp.socket.color })
        : new Socket('any');
      node.addInput(key, new Input(socket, inp.label));
    }
    for (const [key, out] of Object.entries(data.outputs)) {
      let socket = out.socket
        ? new Socket(out.socket.type, { color: out.socket.color })
        : new Socket('any');
      node.addOutput(key, new Output(socket, out.label));
    }
    for (const [key, ctrl] of Object.entries(data.controls)) {
      node.addControl(
        key,
        new InputControl(ctrl.type || 'text', { label: ctrl.label, initial: ctrl.value })
      );
    }

    return node;
  }

  #getNodePosition(canvas, nodeId) {
    let positions = canvas.getPositions();
    return positions[nodeId] || [0, 0];
  }
}

export { History as default };
