/**
 * state-sync.js — WebSocket client for StateGraph versioned sync.
 *
 * Connects to ws/state, receives snapshots + delta patches,
 * maintains a local mirror and emits fine-grained events.
 *
 * Usage:
 *   import { stateSync } from './state-sync.js';
 *   stateSync.on('tasks', (tasks) => { ... });
 *   stateSync.on('chats', (chats) => { ... });
 *   stateSync.connect();
 */

/** @type {WebSocket|null} */
let _ws = null;
/** @type {number|null} */
let _reconnectTimer = null;
/** @type {number} last known version */
let _version = 0;
/** @type {object} local state mirror */
let _state = {};
/** @type {Map<string, Set<Function>>} */
const _listeners = new Map();

/**
 * Subscribe to changes on a specific path prefix.
 * Callback fires with the value at that path.
 *
 * @param {string} key - top-level key (e.g. 'tasks', 'chats', 'ui')
 * @param {(value: any, key: string) => void} cb
 * @returns {() => void} unsubscribe
 */
function on(key, cb) {
  if (!_listeners.has(key)) _listeners.set(key, new Set());
  _listeners.get(key).add(cb);
  // Deliver current value immediately if available
  if (_state[key] !== undefined) {
    try { cb(_state[key], key); } catch {}
  }
  return () => _listeners.get(key)?.delete(cb);
}

/**
 * Get current value at path.
 * @param {string} path - dot-separated path
 * @returns {any}
 */
function get(path) {
  let parts = path.split('/');
  let obj = _state;
  for (let p of parts) {
    if (obj == null) return undefined;
    obj = obj[p];
  }
  return obj;
}

/**
 * Send a commit to the server.
 * @param {Array<{op: string, path: string, value?: any}>} ops
 * @param {string} [source='browser']
 */
function commit(ops, source = 'browser') {
  if (!_ws || _ws.readyState !== WebSocket.OPEN) return;
  _ws.send(JSON.stringify({
    method: 'commit',
    params: { ops, source },
  }));
}

/** Fire listeners for affected paths. */
function _notify(affectedPaths) {
  let notified = new Set();
  for (let path of affectedPaths) {
    // Notify the top-level key
    let topKey = path.split('/')[0];
    if (!notified.has(topKey) && _listeners.has(topKey)) {
      notified.add(topKey);
      let val = _state[topKey];
      for (let cb of _listeners.get(topKey)) {
        try { cb(val, topKey); } catch (e) { console.error('[stateSync] listener error:', e); }
      }
    }
  }
  // Always notify '*' wildcard
  if (_listeners.has('*')) {
    for (let cb of _listeners.get('*')) {
      try { cb(_state, '*'); } catch {}
    }
  }
}

/** Apply a snapshot (full state replace). */
function _applySnapshot(params) {
  _state = params.state || {};
  _version = params.v || 0;
  // Notify all known keys
  let keys = new Set([...Object.keys(_state), ..._listeners.keys()]);
  _notify([...keys]);
}

/** Apply a delta patch. */
function _applyPatch(params) {
  let { v, ops } = params;
  if (!ops) return;
  _version = v;
  let affected = [];
  for (let op of ops) {
    let path = op.path;
    affected.push(path);
    let parts = path.split('/');
    if (op.op === 'del') {
      // Delete
      let obj = _state;
      for (let i = 0; i < parts.length - 1; i++) {
        if (obj == null) break;
        obj = obj[parts[i]];
      }
      if (obj) delete obj[parts[parts.length - 1]];
    } else {
      // Set
      let obj = _state;
      for (let i = 0; i < parts.length - 1; i++) {
        if (obj[parts[i]] == null) obj[parts[i]] = {};
        obj = obj[parts[i]];
      }
      obj[parts[parts.length - 1]] = op.value;
    }
  }
  _notify(affected);
}

function connect() {
  if (_ws) return;
  let proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  let url = `${proto}//${location.host}/ws/state`;
  if (_version > 0) url += `?since=${_version}`;

  _ws = new WebSocket(url);

  _ws.onopen = () => {
    console.log('[stateSync] connected');
    if (_reconnectTimer) {
      clearTimeout(_reconnectTimer);
      _reconnectTimer = null;
    }
  };

  _ws.onmessage = ({ data }) => {
    try {
      let msg = JSON.parse(data);
      if (msg.method === 'snapshot') _applySnapshot(msg.params);
      else if (msg.method === 'patch') _applyPatch(msg.params);
    } catch (e) {
      console.error('[stateSync] parse error:', e);
    }
  };

  _ws.onclose = () => {
    _ws = null;
    _reconnectTimer = setTimeout(connect, 2000);
  };

  _ws.onerror = () => {};
}

function disconnect() {
  if (_reconnectTimer) {
    clearTimeout(_reconnectTimer);
    _reconnectTimer = null;
  }
  if (_ws) {
    _ws.close();
    _ws = null;
  }
}

export const stateSync = { on, get, commit, connect, disconnect };
export default stateSync;
