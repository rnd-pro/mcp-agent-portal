import { IMAGE_MEDIA_ADAPTER, IMAGE_PROVIDER_KEY } from './adapters/image-adapter.js';
import { YOUTUBE_MEDIA_ADAPTER, YOUTUBE_PROVIDER_KEY } from './adapters/youtube-adapter.js';

/**
 * @typedef {object} MediaProviderAdapter
 * @property {(container: Element, descriptor: object) => unknown} mount Mount media into the host stage and return opaque mount state.
 * @property {(container: Element, mountState: unknown) => void} unmount Tear down a previously mounted adapter.
 */

/** @type {Map<string, MediaProviderAdapter>} */
const registry = new Map();

/**
 * @param {unknown} adapter
 * @returns {adapter is MediaProviderAdapter}
 */
function isAdapter(adapter) {
  return Boolean(adapter)
    && typeof adapter === 'object'
    && typeof (/** @type {MediaProviderAdapter} */ (adapter).mount) === 'function'
    && typeof (/** @type {MediaProviderAdapter} */ (adapter).unmount) === 'function';
}

/**
 * Register a media provider adapter under a fixed key. Registration is
 * developer-controlled, so invalid input throws.
 * @param {string} key
 * @param {MediaProviderAdapter} adapter
 * @returns {void}
 */
export function registerMediaProvider(key, adapter) {
  if (typeof key !== 'string' || !key.trim()) {
    throw new TypeError('media provider key must be a non-empty string');
  }
  if (!isAdapter(adapter)) {
    throw new TypeError('media provider adapter must expose callable mount and unmount');
  }
  registry.set(key, adapter);
}

/**
 * Look up a registered adapter. Safe: returns undefined for unknown or invalid
 * keys and never throws.
 * @param {unknown} key
 * @returns {MediaProviderAdapter | undefined}
 */
export function getMediaProvider(key) {
  if (typeof key !== 'string' || !key) return undefined;
  return registry.get(key);
}

/**
 * @param {unknown} key
 * @returns {boolean}
 */
export function hasMediaProvider(key) {
  return typeof key === 'string' && registry.has(key);
}

/**
 * @returns {string[]} Sorted list of registered provider keys.
 */
export function listMediaProviders() {
  return [...registry.keys()].sort();
}

/**
 * Remove a registered adapter. Primarily for test isolation.
 * @param {string} key
 * @returns {boolean} Whether an adapter was removed.
 */
export function unregisterMediaProvider(key) {
  return registry.delete(key);
}

registerMediaProvider(IMAGE_PROVIDER_KEY, IMAGE_MEDIA_ADAPTER);
registerMediaProvider(YOUTUBE_PROVIDER_KEY, YOUTUBE_MEDIA_ADAPTER);
