/**
 * SocketTypes.js - Universal typed socket system
 *
 * Defines socket types for node connections with color coding
 * and compatibility rules. Domain packs register additional types.
 *
 * @module symbiote-engine/SocketTypes
 */

/**
 * @typedef {object} SocketTypeDef
 * @property {string} color - Hex color for UI rendering
 * @property {string} label - Human-readable label
 * @property {string[]} compatible - Types this socket can connect to
 */

/** @type {Map<string, SocketTypeDef>} */
let _types = new Map();

/**
 * Register a socket type
 * @param {string} name
 * @param {SocketTypeDef} def
 */
export function registerSocketType(name, def) {
  _types.set(name, { ...def, compatible: def.compatible || [name] });
}

/**
 * Register multiple socket types at once
 * @param {Record<string, SocketTypeDef>} types
 */
export function registerSocketTypes(types) {
  for (const [name, def] of Object.entries(types)) {
    registerSocketType(name, def);
  }
}

/**
 * Get socket type definition
 * @param {string} name
 * @returns {SocketTypeDef|undefined}
 */
export function getSocketType(name) {
  return _types.get(name);
}

/**
 * Get all registered socket types
 * @returns {Map<string, SocketTypeDef>}
 */
export function getAllSocketTypes() {
  return new Map(_types);
}

/**
 * Check if two socket types are compatible
 * @param {string} from - Source socket type
 * @param {string} to - Target socket type
 * @returns {boolean}
 */
export function areSocketsCompatible(from, to) {
  if (from === 'any' || to === 'any') return true;
  if (from === to) return true;
  let fromDef = _types.get(from);
  if (!fromDef) return false;
  return fromDef.compatible.includes(to);
}


registerSocketTypes({
  any: { color: '#FFFFFF', label: 'Any', compatible: [] },
  float: { color: '#A1A1A1', label: 'Float', compatible: ['float', 'int'] },
  int: { color: '#598C5C', label: 'Integer', compatible: ['int', 'float'] },
  string: { color: '#70B2FF', label: 'String', compatible: ['string'] },
  boolean: { color: '#CCA6D6', label: 'Boolean', compatible: ['boolean'] },
  object: { color: '#E09050', label: 'Object', compatible: ['object'] },
  array: { color: '#50C878', label: 'Array', compatible: ['array'] },
});
