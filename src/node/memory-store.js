import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

const MEMORY_PATH = process.env.PORTAL_MEMORY_PATH || path.join(os.homedir(), '.agent-portal', 'global-memory.json');
let memoryCache = null;
let writeQueue = Promise.resolve();

function cloneMemory(memory) {
  return JSON.parse(JSON.stringify(memory));
}

function queueMemoryWrite(memory) {
  let pending = cloneMemory(memory);
  writeQueue = writeQueue.then(async () => {
    let dir = path.dirname(MEMORY_PATH);
    await fsp.mkdir(dir, { recursive: true });
    await fsp.writeFile(MEMORY_PATH, JSON.stringify(pending, null, 2), 'utf8');
  }).catch((err) => {
    console.error('[MemoryStore] Failed to write memory:', err.message);
  });
}

export async function flushMemoryWrites() {
  await writeQueue;
}

/**
 * Reads the entire memory store.
 * @returns {Record<string, any>}
 */
export function readMemory() {
  if (memoryCache) return cloneMemory(memoryCache);
  if (!fs.existsSync(MEMORY_PATH)) return {};
  try {
    memoryCache = JSON.parse(fs.readFileSync(MEMORY_PATH, 'utf8'));
    return cloneMemory(memoryCache);
  } catch {
    return {};
  }
}

/**
 * Writes the entire memory store.
 * @param {Record<string, any>} memory 
 */
export function writeMemory(memory) {
  memoryCache = cloneMemory(memory);
  queueMemoryWrite(memoryCache);
}

/**
 * Remembers a specific key-value pair in global memory.
 * @param {string} key 
 * @param {any} value 
 * @returns {string}
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
