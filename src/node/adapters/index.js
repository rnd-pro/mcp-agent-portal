// @ctx index.ctx
import { createGeminiAdapter } from './gemini.js';
import { createClaudeAdapter } from './claude.js';
import { createOpencodeAdapter } from './opencode.js';

let ADAPTERS = {
  gemini: createGeminiAdapter,
  claude: createClaudeAdapter,
  opencode: createOpencodeAdapter,
};

/**
 * Resolve an adapter factory by name.
 * @param {string} type - 'gemini' | 'claude' | 'opencode'
 * @returns {Function}
 * @throws {Error} if type is unknown
 */
export function resolveAdapter(type) {
  let factory = ADAPTERS[type];
  if (!factory) {
    throw new Error(`Unknown adapter type "${type}". Valid types: ${Object.keys(ADAPTERS).join(', ')}`);
  }
  return factory;
}

export function listAdapterTypes() {
  return Object.keys(ADAPTERS);
}
