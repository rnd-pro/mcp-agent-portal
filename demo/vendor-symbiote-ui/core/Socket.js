/**
 * Socket — typed port connector
 *
 * Defines the type and visual identity of a connection endpoint.
 * Compatible with symbiote-ui SocketTypes system.
 *
 * @module symbiote-ui/core/Socket
 */

let _uid = 0;

/**
 * Generate unique ID with prefix
 * @param {string} prefix
 * @returns {string}
 */
export function uid(prefix = 'id') {
  return `${prefix}_${(++_uid).toString(36)}_${Date.now().toString(36)}`;
}

/**
 * Socket type — defines connection endpoint type
 */
export class Socket {
  /**
   * @param {string} name - Socket type name (e.g. 'number', 'string', 'any')
   * @param {object} [options]
   * @param {string} [options.color] - CSS color for visual
   */
  constructor(name, options = {}) {
    /** @type {string} */
    this.name = name;

    /** @type {string} */
    this.color = options.color || 'var(--clr-3)';
  }

  /**
   * Check if this socket is compatible with another
   * @param {Socket} other
   * @returns {boolean}
   */
  isCompatibleWith(other) {
    if (this.name === 'any' || other.name === 'any') return true;
    return this.name === other.name;
  }
}

/**
 * Port — represents an input or output endpoint on a node
 */
export class Port {
  /**
   * @param {Socket} socket - Socket type
   * @param {string} [label] - Display label
   * @param {boolean} [multipleConnections=false] - Allow multiple connections
   */
  constructor(socket, label, multipleConnections = false) {
    /** @type {string} */
    this.id = uid('port');

    /** @type {Socket} */
    this.socket = socket;

    /** @type {string|undefined} */
    this.label = label;

    /** @type {boolean} */
    this.multipleConnections = multipleConnections;

    /** @type {number} */
    this.index = 0;
  }
}

/**
 * Input port — accepts incoming connections
 */
export class Input extends Port {
  /**
   * @param {Socket} socket
   * @param {string} [label]
   * @param {boolean} [multipleConnections=false]
   */
  constructor(socket, label, multipleConnections = false) {
    super(socket, label, multipleConnections);

    /** @type {Control|null} */
    this.control = null;

    /** @type {boolean} */
    this.showControl = true;
  }

  /**
   * Add embedded control to this input
   * @param {Control} control
   */
  addControl(control) {
    if (this.control) throw new Error('control already added for this input');
    this.control = control;
  }

  /**
   * Remove embedded control
   */
  removeControl() {
    this.control = null;
  }
}

/**
 * Output port — provides outgoing connections
 */
export class Output extends Port {
  /**
   * @param {Socket} socket
   * @param {string} [label]
   * @param {boolean} [multipleConnections=true]
   */
  constructor(socket, label, multipleConnections = true) {
    super(socket, label, multipleConnections);
  }
}

/**
 * Control — embeddable UI widget inside a node
 */
export class Control {
  constructor() {
    /** @type {string} */
    this.id = uid('ctrl');

    /** @type {number} */
    this.index = 0;

    /** @type {function|undefined} */
    this._onChange = undefined;
  }
}

/**
 * InputControl — text or number input widget
 */
export class InputControl extends Control {
  /**
   * @param {'text'|'number'|'textarea'|'select'|'boolean'} type
   * @param {object} [options]
   * @param {boolean} [options.readonly=false]
   * @param {string|number|boolean} [options.initial]
   * @param {string} [options.label] - Display label
   * @param {string[]} [options.options] - Options for select type
   * @param {function} [options.change] - Callback on value change
   */
  constructor(type, options = {}) {
    super();

    /** @type {'text'|'number'|'textarea'|'select'|'boolean'} */
    this.type = type;

    /** @type {boolean} */
    this.readonly = options.readonly || false;

    /** @type {string|number|boolean|undefined} */
    this.value = options.initial;

    /** @type {string} */
    this.label = options.label || '';

    /** @type {string[]} */
    this.options = options.options || [];

    /** @type {function|undefined} */
    this._onChange = options.change;
  }

  /**
   * Set control value
   * @param {string|number|boolean} value
   */
  setValue(value) {
    this.value = value;
    if (this._onChange) this._onChange(value);
  }
}

export { Socket as default };
