import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const MEMORY_PATH = process.env.PORTAL_MEMORY_PATH || path.join(os.homedir(), '.agent-portal', 'global-memory.json');

/**
 * Reads the entire memory store.
 * @returns {Record<string, any>}
 */
export function readMemory() {
  if (!fs.existsSync(MEMORY_PATH)) return {};
  try {
    return JSON.parse(fs.readFileSync(MEMORY_PATH, 'utf8'));
  } catch {
    return {};
  }
}

/**
 * Writes the entire memory store.
 * @param {Record<string, any>} memory 
 */
export function writeMemory(memory) {
  try {
    const dir = path.dirname(MEMORY_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(MEMORY_PATH, JSON.stringify(memory, null, 2), 'utf8');
  } catch (err) {
    console.error('[MemoryStore] Failed to write memory:', err.message);
  }
}

/**
 * Remembers a specific key-value pair in global memory.
 * @param {string} key 
 * @param {any} value 
 */
export function remember(key, value) {
  const mem = readMemory();
  mem[key] = { value, updatedAt: Date.now() };
  writeMemory(mem);
  return `Successfully remembered key "${key}".`;
}

/**
 * Recalls a value from global memory by a query string.
 * Basic implementation checks if the query is a substring of the key.
 * @param {string} query 
 * @returns {any}
 */
export function recall(query) {
  const mem = readMemory();
  const results = {};
  for (const [k, v] of Object.entries(mem)) {
    if (k.toLowerCase().includes(query.toLowerCase())) {
      results[k] = v.value;
    }
  }
  return Object.keys(results).length > 0 ? results : `No memories found matching "${query}".`;
}
