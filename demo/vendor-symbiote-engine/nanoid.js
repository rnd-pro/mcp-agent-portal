/**
 * nanoid.js - Minimal ID generator
 *
 * Generates short unique IDs (8 chars) for nodes, workflows, etc.
 * No dependencies. Crypto-based when available, Math.random fallback.
 *
 * @module symbiote-engine/nanoid
 */

const ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyz';
const ID_LENGTH = 8;

/**
 * Generate a short unique ID
 * @param {number} [length=8] - ID length
 * @returns {string}
 */
export function nanoid(length = ID_LENGTH) {
  let id = '';
  let bytes =
    typeof globalThis.crypto?.getRandomValues === 'function'
      ? globalThis.crypto.getRandomValues(new Uint8Array(length))
      : Array.from({ length }, () => Math.floor(Math.random() * 256));

  for (let i = 0; i < length; i++) {
    id += ALPHABET[bytes[i] % ALPHABET.length];
  }
  return id;
}
