/**
 * Readonly — toggle readonly mode for node editor
 *
 * When enabled, blocks node creation, deletion, connection
 * creation/removal, and node dragging.
 *
 * Adapted from Rete.js readonly plugin (63 LOC).
 * @module symbiote-ui/plugins/Readonly
 */

export class Readonly {
  /** @type {boolean} */
  #enabled = false;

  /** @type {import('../core/Editor.js').NodeEditor|null} */
  #editor = null;

  /**
   * @param {import('../core/Editor.js').NodeEditor} editor
   */
  constructor(editor) {
    this.#editor = editor;
  }

  /** Enable readonly mode */
  enable() {
    this.#enabled = true;
    this.#editor.emit('readonlychanged', true);
  }

  /** Disable readonly mode */
  disable() {
    this.#enabled = false;
    this.#editor.emit('readonlychanged', false);
  }

  /** Toggle readonly mode */
  toggle() {
    this.#enabled ? this.disable() : this.enable();
  }

  /**
   * Whether readonly is currently enabled
   * @returns {boolean}
   */
  get isEnabled() {
    return this.#enabled;
  }

  /**
   * Guard check — throws if readonly
   * Use before mutation operations
   * @returns {boolean} true if operation should be blocked
   */
  shouldBlock() {
    return this.#enabled;
  }
}

export { Readonly as default };
