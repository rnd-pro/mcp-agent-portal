import childProcess from 'node:child_process';

let CACHE_TTL_MS = 30000;
let DISCOVERY_TIMEOUT_MS = 5000;

let cachedModels = null;
let lastFetchTime = 0;
let activeRefresh = null;
let discoveryState = { status: 'stale', error: null, timestamp: 0 };

function nonEmptyString(value, field) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`Malformed Kimi model: ${field} must be a non-empty string`);
  }
  return value;
}

function booleanValue(value, field) {
  if (typeof value !== 'boolean') {
    throw new Error(`Malformed Kimi model: ${field} must be a boolean`);
  }
  return value;
}

function normalizeModel(model) {
  if (!model || typeof model !== 'object' || Array.isArray(model)) {
    throw new Error('Malformed Kimi model: expected an object');
  }

  let id = nonEmptyString(model.id ?? model.model, 'id');

  return {
    id,
    model: nonEmptyString(model.model ?? model.id, `${id}.model`),
    displayName: nonEmptyString(model.displayName ?? model.name ?? model.id, `${id}.displayName`),
    description: typeof model.description === 'string' ? model.description : '',
    hidden: model.hidden === undefined ? false : booleanValue(model.hidden, `${id}.hidden`),
    isDefault: model.isDefault === undefined ? false : booleanValue(model.isDefault, `${id}.isDefault`),
  };
}

function extractModelList(payload) {
  if (Array.isArray(payload)) return payload;
  if (payload && typeof payload === 'object') {
    if (Array.isArray(payload.models)) return payload.models;
    if (Array.isArray(payload.data)) return payload.data;
  }
  throw new Error('Malformed Kimi catalog response: expected an array of models');
}

function cloneModels(models, includeHidden = false) {
  return models
    .filter(model => includeHidden || !model.hidden)
    .map(model => ({ ...model }));
}

function queryCatalogModels() {
  return new Promise((resolve, reject) => {
    let settled = false;

    function finish(error, result) {
      if (settled) return;
      settled = true;
      if (error) reject(error);
      else resolve(result);
    }

    childProcess.execFile(
      'kimi',
      ['provider', 'catalog', 'list', '--json'],
      {
        env: { ...process.env, TERM: 'dumb', CI: '1' },
        timeout: DISCOVERY_TIMEOUT_MS,
        maxBuffer: 4 * 1024 * 1024,
      },
      (error, stdout, stderr) => {
        if (error) {
          let detail = typeof stderr === 'string' && stderr.trim() ? `: ${stderr.trim()}` : '';
          finish(new Error(`Kimi model discovery failed${detail || `: ${error.message}`}. Verify that Kimi Code CLI is installed and authenticated.`));
          return;
        }
        let payload;
        try {
          payload = JSON.parse(stdout);
        } catch {
          finish(new Error('Malformed JSON from `kimi provider catalog list --json`'));
          return;
        }
        try {
          finish(null, extractModelList(payload).map(normalizeModel));
        } catch (normalizeError) {
          finish(normalizeError);
        }
      }
    );
  });
}

function startRefresh() {
  if (activeRefresh) return activeRefresh;
  discoveryState = { status: 'refreshing', error: discoveryState.error, timestamp: discoveryState.timestamp };
  let refresh;
  refresh = queryCatalogModels()
    .then(models => {
      cachedModels = models;
      lastFetchTime = Date.now();
      discoveryState = { status: 'ready', error: null, timestamp: lastFetchTime };
      return models;
    })
    .catch(error => {
      discoveryState = {
        status: cachedModels ? 'stale' : 'error',
        error: error.message,
        timestamp: Date.now(),
      };
      throw error;
    })
    .finally(() => {
      if (activeRefresh === refresh) activeRefresh = null;
    });
  activeRefresh = refresh;
  return refresh;
}

export async function discoverKimiModels({ force = false } = {}) {
  let age = Date.now() - lastFetchTime;
  if (!force && cachedModels && age < CACHE_TTL_MS) {
    return cloneModels(cachedModels);
  }

  if (activeRefresh) {
    if (!force && cachedModels) return cloneModels(cachedModels);
    await activeRefresh;
    return cloneModels(cachedModels || []);
  }

  if (!force && cachedModels) {
    startRefresh().catch(() => {});
    return cloneModels(cachedModels);
  }

  await startRefresh();
  return cloneModels(cachedModels || []);
}

export function getKimiDiscoveryStatus() {
  if (activeRefresh) {
    return { ...discoveryState, status: 'refreshing' };
  }
  if (cachedModels && Date.now() - lastFetchTime >= CACHE_TTL_MS) {
    return { ...discoveryState, status: 'stale' };
  }
  return { ...discoveryState };
}

export function getCachedKimiModels({ includeHidden = false } = {}) {
  return cloneModels(cachedModels || [], includeHidden);
}

export function clearKimiDiscoveryCache() {
  cachedModels = null;
  lastFetchTime = 0;
  activeRefresh = null;
  discoveryState = { status: 'stale', error: null, timestamp: 0 };
}
