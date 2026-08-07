/**
 * Registry.js - Node type and driver registry
 *
 * Central registry for node types, drivers, and domain packs.
 * AI agents use this to discover, compose, and validate nodes.
 *
 * @module symbiote-engine/Registry
 */

import { areSocketsCompatible, registerSocketTypes } from './SocketTypes.js';

/**
 * @typedef {object} SocketDef
 * @property {string} name - Socket name
 * @property {string} type - Socket type (must be registered in SocketTypes)
 * @property {string} [label] - Human-readable socket label
 * @property {boolean} [required] - Whether this input is required
 * @property {string} [description] - Human-readable description for AI
 */

/**
 * @typedef {object} ParamDef
 * @property {string} type - Parameter type (string, int, float, boolean, object, array)
 * @property {*} [default] - Default value
 * @property {number} [min] - Min value (for numeric types)
 * @property {number} [max] - Max value (for numeric types)
 * @property {Array} [enum] - Allowed values
 * @property {boolean} [required] - Whether this param is required
 * @property {string} [description] - Human-readable description
 */

/**
 * @typedef {object} Driver
 * @property {string} description - What this node type does (for AI discovery)
 * @property {string[]} [capabilities] - Tags for AI search
 * @property {SocketDef[]} inputs - Input socket definitions
 * @property {SocketDef[]} outputs - Output socket definitions
 * @property {Record<string, ParamDef>} [params] - Parameter definitions
 * @property {object} [dynamicOutputs] - Dynamic socket pattern definition
 * @property {object} [testData] - Test payload defaults for dry-run/event simulation
 * @property {object} [constraints] - Requirements (secrets, SSH, etc.)
 */

/**
 * @typedef {object} NodeTypeDef
 * @property {string} type - Unique node type identifier (e.g., 'ai/llm')
 * @property {Driver} driver - Self-describing driver manifest
 * @property {function} [process] - Execution function: (inputs, params) => outputs
 * @property {object} [lifecycle] - Lifecycle hooks for execution
 * @property {string} [icon] - Material icon name for UI
 * @property {string} [category] - Category for UI grouping
 * @property {string} [shape] - Shape name for UI rendering
 */

/**
 * @typedef {object} DriverListEntry
 * @property {string} type - Unique node type identifier
 * @property {Driver} driver - Self-describing driver manifest
 * @property {string} [icon] - Material icon name for UI
 * @property {string} [category] - Category for UI grouping
 */

/** @type {Map<string, NodeTypeDef>} */
let _nodeTypes = new Map();

/** @type {Map<string, object>} */
let _packs = new Map();

/**
 * Register a single node type
 * @param {NodeTypeDef} def
 */
export function registerNodeType(def) {
  if (!def.type) throw new Error('Node type definition must have a "type" field');
  if (!def.driver) throw new Error(`Node type "${def.type}" must have a "driver" field`);
  _nodeTypes.set(def.type, def);
}

/**
 * Register a domain pack (batch registration of node types + socket types)
 * @param {object} pack
 * @param {string} pack.name - Pack name
 * @param {Record<string, import('./SocketTypes.js').SocketTypeDef>} [pack.socketTypes]
 * @param {NodeTypeDef[]} pack.nodes - Array of node type definitions
 */
export function registerPack(pack) {
  if (!pack.name) throw new Error('Pack must have a "name" field');

  if (pack.socketTypes) {
    registerSocketTypes(pack.socketTypes);
  }

  for (const nodeDef of pack.nodes) {
    registerNodeType(nodeDef);
  }

  _packs.set(pack.name, pack);
}

/**
 * Get a node type definition
 * @param {string} type
 * @returns {NodeTypeDef|undefined}
 */
export function getNodeType(type) {
  return _nodeTypes.get(type);
}

/**
 * List all registered node types
 * @returns {DriverListEntry[]}
 */
export function listDrivers() {
  return [..._nodeTypes.values()].map((def) => ({
    type: def.type,
    driver: def.driver,
    icon: def.icon,
    category: def.category,
  }));
}

/**
 * Find node types compatible with a given output type
 * @param {string} outputType - Socket type to match against inputs
 * @returns {Array<{type: string, inputSocket: string, driver: Driver}>}
 */
export function findCompatible(outputType) {
  let results = [];
  for (const [type, def] of _nodeTypes) {
    for (const input of def.driver.inputs) {
      if (areSocketsCompatible(outputType, input.type)) {
        results.push({ type, inputSocket: input.name, driver: def.driver });
      }
    }
  }
  return results;
}

/**
 * Find node types by capability tag
 * @param {string} capability
 * @returns {Array<{type: string, driver: Driver}>}
 */
export function findByCapability(capability) {
  return [..._nodeTypes.values()]
    .filter((def) => def.driver.capabilities?.includes(capability))
    .map((def) => ({ type: def.type, driver: def.driver }));
}

/**
 * Get node menu grouped by category (for UI context menus)
 * @returns {Array<{category: string, nodes: Array<{type: string, icon: string, description: string}>}>}
 */
export function getNodeMenu() {
  let grouped = {};
  for (const [type, def] of _nodeTypes) {
    let cat = def.category || type.split('/')[0];
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push({
      type,
      icon: def.icon,
      description: def.driver.description,
    });
  }
  return Object.entries(grouped).map(([category, nodes]) => ({ category, nodes }));
}

/**
 * Register custom drivers from workflow JSON (AI-generated nodes)
 * @param {Array<{type: string, driver: Driver, process: string}>} customDrivers
 */
export function registerCustomDrivers(customDrivers) {
  for (const cd of customDrivers) {
    registerNodeType({
      type: cd.type,
      driver: cd.driver,
      category: cd.type.split('/')[0],

      process: cd.process ? new Function('inputs', 'params', cd.process) : null,
    });
  }
}

/**
 * Validate node params against driver schema
 * @param {string} type - Node type
 * @param {object} params - Params to validate
 * @returns {{valid: boolean, errors: string[]}}
 */
export function validateParams(type, params) {
  let def = _nodeTypes.get(type);
  if (!def) return { valid: false, errors: [`Unknown node type: ${type}`] };

  let validationErrors = [];
  let schema = def.driver.params || {};

  for (const [key, paramDef] of Object.entries(schema)) {
    let val = params[key];

    if (paramDef.required && (val === undefined || val === null)) {
      validationErrors.push(`Missing required param: ${key}`);
      continue;
    }

    if (val === undefined) continue;

    if (paramDef.enum && !paramDef.enum.includes(val)) {
      validationErrors.push(
        `Param "${key}" must be one of: ${paramDef.enum.join(', ')}. Got: ${val}`
      );
    }

    if (paramDef.min !== undefined && val < paramDef.min) {
      validationErrors.push(`Param "${key}" must be >= ${paramDef.min}. Got: ${val}`);
    }

    if (paramDef.max !== undefined && val > paramDef.max) {
      validationErrors.push(`Param "${key}" must be <= ${paramDef.max}. Got: ${val}`);
    }
  }

  return { valid: validationErrors.length === 0, errors: validationErrors };
}

/**
 * Get all registered packs
 * @returns {string[]}
 */
export function listPacks() {
  return [..._packs.keys()];
}

/**
 * Clear all registrations (for testing)
 */
export function clearRegistry() {
  _nodeTypes.clear();
  _packs.clear();

  _registerBuiltins();
}

/**
 * Register built-in node types (compound infrastructure)
 * @private
 */
function _registerBuiltins() {
  _nodeTypes.set('compound/input', {
    type: 'compound/input',
    category: 'compound',
    icon: 'input',
    driver: {
      description: 'Input bridge for compound nodes — receives data from parent graph',
      capabilities: ['compound'],
      inputs: [],
      outputs: [{ name: 'data', type: 'any' }],
      params: {},
    },
    process: (_inputs, params) => ({ ...params }),
  });

  _nodeTypes.set('compound/output', {
    type: 'compound/output',
    category: 'compound',
    icon: 'output',
    driver: {
      description: 'Output bridge for compound nodes — sends data to parent graph',
      capabilities: ['compound'],
      inputs: [{ name: 'data', type: 'any' }],
      outputs: [{ name: 'data', type: 'any' }],
      params: {},
    },
    process: (inputs) => ({ ...inputs }),
  });
}


_registerBuiltins();
