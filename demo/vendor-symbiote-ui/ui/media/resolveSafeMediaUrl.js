let FALLBACK_BASE_URL = 'https://localhost.invalid/';
let CONTROL_CHARACTER_PATTERN = /[\u0000-\u001F\u007F]/;
let SAFE_PROTOCOLS = new Set(['http:', 'https:']);

/**
 * Return the first HTTP(S) or safely resolvable relative media URL.
 * @param {...unknown} values
 * @returns {string}
 */
export function resolveSafeMediaUrl(...values) {
  for (let value of values) {
    let candidate = String(value || '').trim();
    if (!candidate || CONTROL_CHARACTER_PATTERN.test(candidate)) continue;

    try {
      let resolved = new URL(candidate, FALLBACK_BASE_URL);
      if (SAFE_PROTOCOLS.has(resolved.protocol)) return candidate;
    } catch {
      continue;
    }
  }

  return '';
}
