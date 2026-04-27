// @ctx adapters-registry.ctx
import { createGeminiAdapter } from './gemini.js';
import { createClaudeAdapter, createOpencodeAdapter } from './stubs.js';

const ADAPTERS = {
  gemini: createGeminiAdapter,
  claude: createClaudeAdapter,
  opencode: createOpencodeAdapter,
};

/**
 * Resolve an adapter factory by name.
 * @param {string} type - 'gemini' | 'claude' | 'opencode'
 * @returns {Function|null}
 */
export function resolveAdapter(type) {
  return ADAPTERS[type] || null;
}

export function listAdapterTypes() {
  return Object.keys(ADAPTERS);
}
