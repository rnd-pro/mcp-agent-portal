/**
 * HandlerLoader.js - File-based node handler loader
 *
 * Scans directories for .handler.js files and registers them
 * as node types. Supports hot reload via fs.watch.
 *
 * Handler file convention:
 *   export default {
 *     type: 'category/name',
 *     category: 'category',
 *     icon: 'icon_name',
 *     driver: { inputs, outputs, params, ... },
 *     lifecycle: { validate, cacheKey, execute, postProcess },
 *   };
 *
 * @module symbiote-engine/HandlerLoader */

import { readdir, stat } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { watch } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { registerNodeType } from './Registry.js';

/**
 * Recursively find all .handler.js files in a directory
 * @param {string} dir - Directory to scan
 * @returns {Promise<string[]>} Absolute file paths
 */
async function findHandlerFiles(dir) {
  let results = [];
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return results;
  }

  for (const entry of entries) {
    let fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      let nested = await findHandlerFiles(fullPath);
      results.push(...nested);
    } else if (entry.name.endsWith('.handler.js')) {
      results.push(fullPath);
    }
  }
  return results;
}

/**
 * Load a single handler file and register it
 * @param {string} filePath - Absolute path to .handler.js file
 * @returns {Promise<string|null>} Registered type name or null on error
 */
async function loadHandler(filePath) {
  let fileUrl = pathToFileURL(filePath).href;

  let url = `${fileUrl}?t=${Date.now()}`;

  let module = await import(url);
  let handler = module.default;

  if (!handler?.type) {
    throw new Error(`Handler file ${filePath} missing 'type' field in default export`);
  }


  let nodeDef = {
    type: handler.type,
    category: handler.category || handler.type.split('/')[0],
    icon: handler.icon,
    driver: handler.driver || {},
  };


  if (handler.lifecycle) {
    nodeDef.lifecycle = handler.lifecycle;
  }


  if (handler.process) {
    nodeDef.process = handler.process;
  }

  registerNodeType(nodeDef);
  return handler.type;
}

/**
 * Scan a directory for .handler.js files and register them
 * @param {string} dir - Directory to scan (e.g., 'nodes/')
 * @returns {Promise<string[]>} List of registered type names
 */
export async function loadHandlers(dir) {
  let files = await findHandlerFiles(dir);
  let registered = [];

  for (const file of files) {
    try {
      let type = await loadHandler(file);
      if (type) registered.push(type);
    } catch (err) {
      console.error(
        `🔴 [symbiote-engine] Failed to load handler ${relative(dir, file)}: ${err.message}`
      );
    }
  }

  return registered;
}

/**
 * Watch a directory for new/changed .handler.js files
 * Auto-registers them on change.
 *
 * @param {string} dir - Directory to watch
 * @param {object} [options={}]
 * @param {function} [options.onRegister] - Callback(type, filePath)
 * @param {function} [options.onError] - Callback(filePath, error)
 * @returns {{close: function}} Watcher handle
 */
export function watchHandlers(dir, options = {}) {
  let { onRegister, onError } = options;

  let watcher = watch(dir, { recursive: true }, async (eventType, filename) => {
    if (!filename?.endsWith('.handler.js')) return;

    let filePath = join(dir, filename);


    try {
      await stat(filePath);
    } catch {
      return;
    }

    try {
      let type = await loadHandler(filePath);
      if (type && onRegister) onRegister(type, filePath);
    } catch (err) {
      if (onError) onError(filePath, err);
      else console.error(`🔴 [symbiote-engine] Watch error for ${filename}: ${err.message}`);
    }
  });

  return {
    close: () => watcher.close(),
  };
}
