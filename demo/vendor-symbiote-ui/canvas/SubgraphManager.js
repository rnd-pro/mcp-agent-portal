/**
 * SubgraphManager — Navigation stack for subgraph drill-down
 *
 * Manages a stack of editor contexts. When drilling into a subgraph,
 * the current state is saved and the inner editor is loaded.
 * Breadcrumb navigation allows jumping back to any level.
 *
 * @module symbiote-ui/canvas/SubgraphManager
 */

/**
 * @typedef {Object} NavEntry
 * @property {import('../core/Editor.js').NodeEditor} editor
 * @property {Object<string, { x: number, y: number }>} positions
 * @property {{ panX: number, panY: number, zoom: number }} transform
 * @property {string} label - Display label for breadcrumb
 * @property {string|null} subgraphNodeId - SubgraphNode ID in parent (null for root)
 */

export class SubgraphManager {
  /** @type {NavEntry[]} */
  #stack = [];

  /** @type {import('./NodeCanvas.js').NodeCanvas|null} */
  #canvas = null;

  /** @type {function|null} */
  #onNavigate = null;

  /**
   * Initialize with canvas and root editor
   * @param {*} canvas - NodeCanvas element
   * @param {import('../core/Editor.js').NodeEditor} rootEditor
   */
  initialize(canvas, rootEditor) {
    this.#canvas = canvas;
    this.#stack = [
      {
        editor: rootEditor,
        positions: {},
        transform: { panX: 0, panY: 0, zoom: 1 },
        label: 'Root',
        subgraphNodeId: null,
      },
    ];
  }

  /**
   * Set navigation callback (for breadcrumb updates)
   * @param {function} callback - (path: string[]) => void
   */
  onNavigate(callback) {
    this.#onNavigate = callback;
  }

  /**
   * Drill down into a SubgraphNode
   * @param {import('../core/SubgraphNode.js').SubgraphNode} subgraphNode
   */
  drillDown(subgraphNode) {
    if (!subgraphNode?._isSubgraph || !this.#canvas) return;


    let current = this.#stack[this.#stack.length - 1];
    current.positions = this.#capturePositions(current.editor, current.positions);
    current.transform = this.#captureTransform();


    this.#stack.push({
      editor: subgraphNode.getInnerEditor(),
      positions: subgraphNode.innerPositions,
      transform: subgraphNode.innerTransform,
      label: subgraphNode.label,
      subgraphNodeId: subgraphNode.id,
    });


    this.#applyLevel(this.#stack.length - 1);
    this.#notifyNavigate();
  }

  /**
   * Navigate up to a specific level
   * @param {number} level - 0 = root
   */
  drillUp(level) {
    if (level === undefined) level = this.#stack.length - 2;
    if (level < 0 || level >= this.#stack.length || !this.#canvas) return;


    for (let i = this.#stack.length - 1; i > level; i--) {
      let entry = this.#stack[i];
      let parentEntry = this.#stack[i - 1];
      if (entry.subgraphNodeId) {
        let subNode = parentEntry.editor.getNode(entry.subgraphNodeId);
        if (subNode?._isSubgraph) {
          subNode.setInnerPositions(this.#capturePositions(entry.editor, entry.positions));
          subNode.setInnerTransform(entry.transform);
        }
      }
    }


    let currentEntry = this.#stack[this.#stack.length - 1];
    currentEntry.positions = this.#capturePositions(currentEntry.editor, currentEntry.positions);
    currentEntry.transform = this.#captureTransform();


    this.#stack.length = level + 1;


    this.#applyLevel(level);
    this.#notifyNavigate();
  }

  /**
   * Get current breadcrumb path
   * @returns {Array<{ label: string, level: number }>}
   */
  getPath() {
    return this.#stack.map((entry, i) => ({
      label: entry.label,
      level: i,
    }));
  }

  /**
   * Get current depth (0 = root)
   * @returns {number}
   */
  get depth() {
    return this.#stack.length - 1;
  }

  /**
   * Get current editor
   * @returns {import('../core/Editor.js').NodeEditor}
   */
  get currentEditor() {
    return this.#stack[this.#stack.length - 1].editor;
  }

  /**
   * Apply a stack level to the canvas
   * @param {number} level
   */
  #applyLevel(level) {
    let entry = this.#stack[level];
    if (!entry || !this.#canvas) return;


    this.#canvas.setEditor(entry.editor);


    for (const [nodeId, pos] of Object.entries(entry.positions)) {
      this.#canvas.setNodePosition(nodeId, pos.x, pos.y);
    }


    this.#canvas.$.panX = entry.transform.panX;
    this.#canvas.$.panY = entry.transform.panY;
    this.#canvas.$.zoom = entry.transform.zoom;
  }

  /**
   * Capture current node positions from editor.
   * Falls back to existing entry positions when DOM elements
   * have already been cleared (e.g. during setEditor transitions).
   * @param {import('../core/Editor.js').NodeEditor} editor
   * @param {Object<string, { x: number, y: number }>} [fallback={}]
   * @returns {Object<string, { x: number, y: number }>}
   */
  #capturePositions(editor, fallback = {}) {
    let positions = { ...fallback };
    if (!this.#canvas) return positions;
    for (const node of editor.getNodes()) {
      let el = this.#canvas.getNodeView?.(node.id);
      if (el?._position) {
        positions[node.id] = { ...el._position };
      }
    }
    return positions;
  }

  /**
   * Capture current viewport transform
   * @returns {{ panX: number, panY: number, zoom: number }}
   */
  #captureTransform() {
    if (!this.#canvas) return { panX: 0, panY: 0, zoom: 1 };
    return {
      panX: this.#canvas.$.panX ?? 0,
      panY: this.#canvas.$.panY ?? 0,
      zoom: this.#canvas.$.zoom ?? 1,
    };
  }

  #notifyNavigate() {
    if (this.#onNavigate) {
      this.#onNavigate(this.getPath());
    }
  }
}
