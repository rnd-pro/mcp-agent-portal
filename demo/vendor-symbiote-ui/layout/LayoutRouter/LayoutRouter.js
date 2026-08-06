/**
 * LayoutRouter — universal router for layout system
 *
 * Supports two URL strategies:
 * - **hash** (default): `#panel/subpath?param1=value&param2=value`
 * - **path**: `/basePath/panel/subpath/?param1=value&param2=value`
 *
 * Uses Symbiote PubSub named data context (ROUTER) to provide
 * reactive routing across the application. The PubSub contract
 * is identical in both modes.
 *
 * Two levels of query params:
 * - **Global** (registered via registerGlobalParam): persist across section switches
 * - **Section** (everything else): reset when navigating to a new section
 *
 * Usage in templates: {{ROUTER/panel}}, {{ROUTER/subpath}}, {{ROUTER/query}}
 * Usage in code: this.$['ROUTER/panel'], this.sub('ROUTER/panel', cb)
 * Global params: this.sub('ROUTER/globalParams', cb)
 *
 * @module symbiote-ui/layout/LayoutRouter
 */
import { PubSub } from '@symbiotejs/symbiote/core/PubSub.js';

const CTX = 'ROUTER';

/** @type {Set<string>} Keys that persist across section switches */
const _globalKeys = new Set();

/**
 * Router configuration
 * @type {{ mode: 'hash' | 'path', basePath: string, defaultPanel: string }}
 */
const _config = {
  mode: 'hash',
  basePath: '/',
  defaultPanel: 'default',
};

/** @type {boolean} Whether initial sync has been performed */
let _initialized = false;

/** @type {Function|null} Current URL change listener to allow re-binding */
let _urlChangeListener = null;

const routerCtx = PubSub.registerCtx(
  {
    panel: 'default',
    subpath: '',
    query: '',
    globalParams: {},
  },
  CTX
);

/**
 * Configure router mode. Call once before any navigation.
 *
 * @param {Object} options
 * @param {'hash' | 'path'} [options.mode='hash'] - URL strategy
 * @param {string} [options.basePath] - Base path for path-mode (e.g. '/cv/').
 *   Auto-detected from <base> tag if not provided. Ignored in hash mode.
 * @param {string} [options.defaultPanel='default'] - Default panel when URL has no route
 */
export function configureRouter({ mode = 'hash', basePath, defaultPanel } = {}) {
  _config.mode = mode === 'path' ? 'path' : 'hash';
  _config.defaultPanel = defaultPanel || 'default';

  if (_config.mode === 'path') {
    _config.basePath = _normalizeBasePath(basePath || _detectBasePath());
  } else {
    _config.basePath = '/';
  }

  // Re-bind URL listener for the correct event
  if (typeof window !== 'undefined' && _urlChangeListener) {
    if (_config.mode === 'hash') {
      window.removeEventListener('popstate', _urlChangeListener);
      window.addEventListener('hashchange', _urlChangeListener);
    } else {
      window.removeEventListener('hashchange', _urlChangeListener);
      window.addEventListener('popstate', _urlChangeListener);
    }
  }

  // Re-sync from the current URL
  if (typeof location !== 'undefined') {
    syncFromUrl();
  }
}

/**
 * Get current router base path (for path-mode consumers that need it)
 * @returns {string}
 */
export function getRouterBasePath() {
  return _config.basePath;
}

/**
 * Get current router mode
 * @returns {'hash' | 'path'}
 */
export function getRouterMode() {
  return _config.mode;
}

/**
 * Parse query string into object
 * @param {string} str - Query string (without leading ?)
 * @returns {Object<string, string>}
 */
export function parseQuery(str) {
  if (!str) return {};
  const result = {};
  for (const pair of str.split('&')) {
    const eqIdx = pair.indexOf('=');
    if (eqIdx >= 0) {
      result[decodeURIComponent(pair.substring(0, eqIdx))] = decodeURIComponent(
        pair.substring(eqIdx + 1)
      );
    }
  }
  return result;
}

/**
 * Build query string from key-value object
 * @param {Object<string, string>} params
 * @returns {string}
 */
export function buildQuery(params) {
  const entries = Object.entries(params).filter(([, v]) => v !== '' && v != null);
  if (entries.length === 0) return '';
  return entries.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');
}

/**
 * Build full hash string from parts
 * @param {string} panel
 * @param {string} [subpath]
 * @param {Object} [params]
 * @returns {string}
 */
export function buildHash(panel, subpath, params) {
  let hash = panel;
  if (subpath) hash += '/' + subpath;
  const q = params ? buildQuery(params) : '';
  if (q) hash += '?' + q;
  return hash;
}

/**
 * Build a full URL string for the given route parts.
 * In hash mode returns `pathname#panel/subpath?query`.
 * In path mode returns `basePath/panel/subpath/?query`.
 * @param {string} panel
 * @param {string} [subpath]
 * @param {Object} [mergedParams]
 * @returns {string}
 */
function buildUrl(panel, subpath, mergedParams) {
  if (_config.mode === 'path') {
    let path = _config.basePath + panel;
    if (subpath) path += '/' + subpath;
    // Ensure trailing slash for clean URLs
    if (!path.endsWith('/')) path += '/';
    const q = mergedParams ? buildQuery(mergedParams) : '';
    return q ? path + '?' + q : path;
  }
  // hash mode
  const hash = buildHash(panel, subpath, mergedParams);
  return location.pathname + '#' + hash;
}

/**
 * Navigate to a new route — updates URL and PubSub context.
 * Global params (registered via registerGlobalParam) are automatically
 * carried over unless explicitly overridden or set to null.
 * @param {string} panel - Master panel section ID
 * @param {string} [subpath] - Sub-path (entity ID, etc.)
 * @param {Object} [params] - Query parameters (overrides globals if specified)
 */
export function navigate(panel, subpath = '', params = {}) {
  if (typeof location === 'undefined') return;

  const currentQuery = parseQuery(routerCtx.read('query'));
  const merged = {};
  for (const key of _globalKeys) {
    if (currentQuery[key] && params[key] === undefined) {
      merged[key] = currentQuery[key];
    }
  }

  for (const [k, v] of Object.entries(params)) {
    if (v != null && v !== '') {
      merged[k] = v;
    } else {
      delete merged[k];
    }
  }

  const url = buildUrl(panel, subpath, merged);
  history.pushState(null, '', url);
  syncFromUrl();

  if (typeof window !== 'undefined') {
    const eventName = _config.mode === 'path' ? 'popstate' : 'hashchange';
    window.dispatchEvent(new Event(eventName));
  }
}

/**
 * Update only query params of current route (keeps panel/subpath)
 * Uses replaceState to avoid cluttering browser history
 * @param {Object} params - Params to merge
 */
export function updateParams(params) {
  if (typeof location === 'undefined') return;
  const currentQuery = parseQuery(routerCtx.read('query'));
  const merged = { ...currentQuery };
  for (const [k, v] of Object.entries(params)) {
    if (v === '' || v == null) {
      delete merged[k];
    } else {
      merged[k] = v;
    }
  }

  const url = buildUrl(routerCtx.read('panel'), routerCtx.read('subpath'), merged);
  history.replaceState(null, '', url);

  const query = buildQuery(merged);
  routerCtx.pub('query', query);

  if (typeof window !== 'undefined') {
    const eventName = _config.mode === 'path' ? 'popstate' : 'hashchange';
    window.dispatchEvent(new Event(eventName));
  }
}

/**
 * Sync PubSub context from current URL.
 * In hash mode reads location.hash; in path mode reads location.pathname + search.
 */
function syncFromUrl() {
  if (_config.mode === 'path') {
    _syncFromPath();
  } else {
    _syncFromHash();
  }
}

/**
 * Parse hash URL into PubSub context
 */
function _syncFromHash() {
  const raw = location.hash.replace(/^#/, '') || _config.defaultPanel;

  const qIdx = raw.indexOf('?');
  const pathPart = qIdx >= 0 ? raw.substring(0, qIdx) : raw;
  const queryPart = qIdx >= 0 ? raw.substring(qIdx + 1) : '';

  const slashIdx = pathPart.indexOf('/');
  const panel = slashIdx >= 0 ? pathPart.substring(0, slashIdx) : pathPart;
  const subpath = slashIdx >= 0 ? pathPart.substring(slashIdx + 1) : '';

  _publishRoute(panel, subpath, queryPart);
}

/**
 * Parse path-based URL into PubSub context
 */
function _syncFromPath() {
  const pathname = decodeURIComponent(location.pathname);
  const basePath = _config.basePath;

  // Strip basePath prefix
  let relative = pathname.startsWith(basePath)
    ? pathname.slice(basePath.length)
    : pathname.replace(/^\/+/, '');

  // Remove leading/trailing slashes and /index suffix
  relative = relative
    .replace(/^\/+|\/+$/g, '')
    .replace(/\/index$/, '');

  if (!relative) {
    _publishRoute(_config.defaultPanel, '', location.search.replace(/^\?/, ''));
    return;
  }

  const slashIdx = relative.indexOf('/');
  const panel = slashIdx >= 0 ? relative.substring(0, slashIdx) : relative;
  const subpath = slashIdx >= 0 ? relative.substring(slashIdx + 1).replace(/\/+$/, '') : '';
  const queryPart = location.search.replace(/^\?/, '');

  _publishRoute(panel, subpath, queryPart);
}

/**
 * Publish route parts to PubSub context and sync global params
 * @param {string} panel
 * @param {string} subpath
 * @param {string} queryPart
 */
function _publishRoute(panel, subpath, queryPart) {
  routerCtx.pub('panel', panel);
  routerCtx.pub('subpath', subpath);
  routerCtx.pub('query', queryPart);

  if (_globalKeys.size > 0) {
    const allParams = parseQuery(queryPart);
    const globals = {};
    for (const key of _globalKeys) {
      if (allParams[key]) globals[key] = allParams[key];
    }
    routerCtx.pub('globalParams', globals);
  }
}

/**
 * Get current route state
 * @returns {{ panel: string, subpath: string, query: string }}
 */
export function getRoute() {
  return {
    panel: routerCtx.read('panel'),
    subpath: routerCtx.read('subpath'),
    query: routerCtx.read('query'),
  };
}

/**
 * Set default panel (first section to show if URL has no route)
 * @param {string} panel
 */
export function setDefaultPanel(panel) {
  if (typeof location === 'undefined') return;
  _config.defaultPanel = panel;

  if (_config.mode === 'path') {
    // In path mode, check if we're at the base path
    const pathname = decodeURIComponent(location.pathname);
    const relative = pathname.startsWith(_config.basePath)
      ? pathname.slice(_config.basePath.length).replace(/^\/+|\/+$/g, '')
      : '';
    if (!relative) {
      navigate(panel);
    }
  } else {
    // In hash mode, check if hash is empty
    if (!location.hash || location.hash === '#') {
      navigate(panel);
    }
  }
}

/**
 * Register one or more param keys as global (persistent across section switches).
 * Global params are automatically carried in navigate() and published
 * via ROUTER/globalParams PubSub context.
 * @param {...string} keys - Param names to register as global
 */
export function registerGlobalParam(...keys) {
  keys.forEach((k) => _globalKeys.add(k));

  if (typeof location !== 'undefined') {
    const allParams = parseQuery(routerCtx.read('query'));
    const globals = {};
    for (const key of _globalKeys) {
      if (allParams[key]) globals[key] = allParams[key];
    }
    routerCtx.pub('globalParams', globals);
  }
}

/**
 * Set a single global param value.
 * Shorthand for registerGlobalParam + updateParams.
 * @param {string} key
 * @param {string|null} value - null removes the param
 */
export function setGlobalParam(key, value) {
  _globalKeys.add(key);
  updateParams({ [key]: value });
}

/**
 * Detect base path from <base> tag or fallback to '/'
 * @returns {string}
 */
function _detectBasePath() {
  if (typeof document === 'undefined' || typeof location === 'undefined') return '/';
  let base = document.querySelector('base')?.href;
  if (!base) return '/';
  try {
    return new URL(base, location.href).pathname;
  } catch {
    return '/';
  }
}

/**
 * Normalize base path to always have leading and trailing slashes
 * @param {string} path
 * @returns {string}
 */
function _normalizeBasePath(path) {
  let normalized = String(path || '/');
  if (!normalized.startsWith('/')) normalized = '/' + normalized;
  if (!normalized.endsWith('/')) normalized += '/';
  return normalized;
}

// --- Initial sync ---
if (typeof location !== 'undefined' && typeof window !== 'undefined') {
  _urlChangeListener = () => syncFromUrl();
  syncFromUrl();
  // Default to hash mode listener; configureRouter() will re-bind if needed
  window.addEventListener('hashchange', _urlChangeListener);
}

/**
 * Generic search parameters builder
 */
export function getGraphSearchString(locationObj = typeof window !== 'undefined' ? window.location : {}) {
  if (!locationObj || !locationObj.hash) return ''
  const params = new URLSearchParams(locationObj.search || '')
  const hashQuery = locationObj.hash.includes('?') ? locationObj.hash.split('?')[1] : ''
  const hashParams = new URLSearchParams(hashQuery)
  for (let [key, value] of hashParams) {
    params.set(key, value)
  }
  return params.toString()
}

export function getGraphUrlParams(locationObj = typeof window !== 'undefined' ? window.location : {}) {
  return new URLSearchParams(getGraphSearchString(locationObj))
}

export function parseGraphHash(hash = typeof window !== 'undefined' ? window.location.hash : '') {
  if (!hash) return { path: '', params: new URLSearchParams() }
  const [hashBase, queryStr] = hash.replace('#', '').split('?')
  const hashParams = hashBase.split('/')
  if (hashParams[0] === 'graph') hashParams.shift()
  return {
    path: hashParams.join('/'),
    params: new URLSearchParams(queryStr || ''),
  }
}

export function updateHashParam(key, value, locationObj = typeof window !== 'undefined' ? window.location : {}, historyObj = typeof history !== 'undefined' ? history : {}) {
  if (!locationObj || !locationObj.hash) return
  const [basePath, queryStr] = locationObj.hash.split('?')
  const params = new URLSearchParams(queryStr || '')
  if (value === null || value === undefined) {
    params.delete(key)
  } else {
    params.set(key, value)
  }
  const newQuery = params.toString()
  const newHash = newQuery ? `${basePath}?${newQuery}` : basePath
  if (locationObj.hash === newHash) return
  if (historyObj && typeof historyObj.replaceState === 'function') {
    historyObj.replaceState(null, '', newHash)
  }
}
