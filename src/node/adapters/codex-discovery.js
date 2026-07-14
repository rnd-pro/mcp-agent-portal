import childProcess from 'node:child_process';

let CACHE_TTL_MS = 30000;
let DISCOVERY_TIMEOUT_MS = 5000;

let cachedModels = null;
let lastFetchTime = 0;
let activeRefresh = null;
let discoveryState = { status: 'stale', error: null, timestamp: 0 };

function nonEmptyString(value, field) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`Malformed Codex model: ${field} must be a non-empty string`);
  }
  return value;
}

function stringValue(value, field) {
  if (typeof value !== 'string') {
    throw new Error(`Malformed Codex model: ${field} must be a string`);
  }
  return value;
}

function optionalBoolean(value, field, fallback = false) {
  if (value === undefined) return fallback;
  if (typeof value !== 'boolean') {
    throw new Error(`Malformed Codex model: ${field} must be a boolean`);
  }
  return value;
}

function booleanValue(value, field) {
  if (typeof value !== 'boolean') {
    throw new Error(`Malformed Codex model: ${field} must be a boolean`);
  }
  return value;
}

function normalizeReasoningEfforts(model) {
  if (!Array.isArray(model.supportedReasoningEfforts)) {
    throw new Error(`Malformed Codex model ${model.id}: supportedReasoningEfforts must be an array`);
  }
  return model.supportedReasoningEfforts.map((option, index) => {
    if (!option || typeof option !== 'object') {
      throw new Error(`Malformed Codex model ${model.id}: supportedReasoningEfforts[${index}] must be an object`);
    }
    return {
      reasoningEffort: nonEmptyString(option.reasoningEffort, `${model.id}.supportedReasoningEfforts[${index}].reasoningEffort`),
      description: stringValue(option.description, `${model.id}.supportedReasoningEfforts[${index}].description`),
    };
  });
}

function normalizeServiceTiers(model) {
  if (model.serviceTiers === undefined) return [];
  if (!Array.isArray(model.serviceTiers)) {
    throw new Error(`Malformed Codex model ${model.id}: serviceTiers must be an array`);
  }
  return model.serviceTiers.map((tier, index) => {
    if (!tier || typeof tier !== 'object') {
      throw new Error(`Malformed Codex model ${model.id}: serviceTiers[${index}] must be an object`);
    }
    return {
      id: nonEmptyString(tier.id, `${model.id}.serviceTiers[${index}].id`),
      name: nonEmptyString(tier.name, `${model.id}.serviceTiers[${index}].name`),
      description: stringValue(tier.description, `${model.id}.serviceTiers[${index}].description`),
    };
  });
}

function normalizeModel(model) {
  if (!model || typeof model !== 'object' || Array.isArray(model)) {
    throw new Error('Malformed Codex model: expected an object');
  }

  let id = nonEmptyString(model.id, 'id');
  let defaultServiceTier = model.defaultServiceTier ?? null;
  if (defaultServiceTier !== null) {
    defaultServiceTier = nonEmptyString(defaultServiceTier, `${id}.defaultServiceTier`);
  }

  let inputModalities = model.inputModalities ?? ['text', 'image'];
  if (!Array.isArray(inputModalities) || inputModalities.some(item => !['text', 'image'].includes(item))) {
    throw new Error(`Malformed Codex model ${id}: inputModalities must contain only text or image`);
  }

  return {
    id,
    model: nonEmptyString(model.model, `${id}.model`),
    displayName: nonEmptyString(model.displayName, `${id}.displayName`),
    description: stringValue(model.description, `${id}.description`),
    hidden: booleanValue(model.hidden, `${id}.hidden`),
    isDefault: booleanValue(model.isDefault, `${id}.isDefault`),
    supportedReasoningEfforts: normalizeReasoningEfforts(model),
    defaultReasoningEffort: nonEmptyString(model.defaultReasoningEffort, `${id}.defaultReasoningEffort`),
    serviceTiers: normalizeServiceTiers(model),
    defaultServiceTier,
    inputModalities: [...inputModalities],
    supportsPersonality: optionalBoolean(model.supportsPersonality, `${id}.supportsPersonality`),
  };
}

function cloneModels(models, includeHidden = false) {
  return models
    .filter(model => includeHidden || !model.hidden)
    .map(model => ({
      ...model,
      supportedReasoningEfforts: model.supportedReasoningEfforts.map(option => ({ ...option })),
      serviceTiers: model.serviceTiers.map(tier => ({ ...tier })),
      inputModalities: [...model.inputModalities],
    }));
}

function queryAppServerModels() {
  return new Promise((resolve, reject) => {
    let child;
    let timeoutHandle;
    let settled = false;
    let stderr = '';
    let buffer = '';
    let phase = 'initialize';
    let requestId = 1;
    let models = [];
    let seenCursors = new Set();

    function finish(error, result) {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutHandle);
      child?.stdout?.removeAllListeners();
      child?.stderr?.removeAllListeners();
      child?.removeAllListeners();
      try { child?.stdin?.end(); } catch {}
      try { child?.kill(); } catch {}
      if (error) reject(error);
      else resolve(result);
    }

    function fail(message) {
      finish(new Error(message));
    }

    function write(message) {
      try {
        child.stdin.write(`${JSON.stringify(message)}\n`);
      } catch (error) {
        fail(`Failed to write to Codex app-server: ${error.message}`);
      }
    }

    function requestModels(cursor = null) {
      let params = { includeHidden: true, limit: 100 };
      if (cursor) params.cursor = cursor;
      write({ jsonrpc: '2.0', id: requestId, method: 'model/list', params });
    }

    function handleMessage(message) {
      if (!message || typeof message !== 'object' || Array.isArray(message)) {
        fail('Malformed Codex app-server response: expected a protocol object');
        return;
      }
      // Codex app-server JSONL responses currently omit jsonrpc, while requests use 2.0.
      if (message.jsonrpc !== undefined && message.jsonrpc !== '2.0') {
        fail('Malformed Codex app-server response: unsupported jsonrpc version');
        return;
      }
      if (message.id === undefined) {
        if (typeof message.method === 'string' && message.method) return;
        fail('Malformed Codex app-server response: expected a response or notification');
        return;
      }
      if (message.error) {
        let detail = message.error.message || JSON.stringify(message.error);
        fail(`Codex app-server JSON-RPC error: ${detail}`);
        return;
      }

      if (phase === 'initialize' && message.id === 1) {
        if (!message.result || typeof message.result !== 'object') {
          fail('Malformed Codex app-server initialize response');
          return;
        }
        phase = 'models';
        write({ jsonrpc: '2.0', method: 'initialized' });
        requestId = 2;
        requestModels();
        return;
      }

      if (phase !== 'models' || message.id !== requestId) return;
      if (!message.result || !Array.isArray(message.result.data)) {
        fail('Malformed Codex model/list response: result.data must be an array');
        return;
      }

      let nextCursor = message.result.nextCursor ?? null;
      if (nextCursor !== null && (typeof nextCursor !== 'string' || !nextCursor)) {
        fail('Malformed Codex model/list response: nextCursor must be a non-empty string or null');
        return;
      }

      try {
        models.push(...message.result.data.map(normalizeModel));
      } catch (error) {
        finish(error);
        return;
      }

      if (!nextCursor) {
        finish(null, models);
        return;
      }
      if (seenCursors.has(nextCursor)) {
        fail(`Malformed Codex model/list response: repeated cursor ${nextCursor}`);
        return;
      }
      seenCursors.add(nextCursor);
      requestId += 1;
      requestModels(nextCursor);
    }

    try {
      child = childProcess.spawn('codex', ['app-server', '--stdio'], {
        env: { ...process.env, TERM: 'dumb', CI: '1' },
        stdio: ['pipe', 'pipe', 'pipe'],
      });
    } catch (error) {
      fail(`Failed to start Codex app-server: ${error.message}. Verify that Codex CLI is installed.`);
      return;
    }

    child.on('error', error => {
      fail(`Codex app-server process error: ${error.message}. Verify that Codex CLI is installed and authenticated.`);
    });
    child.on('exit', code => {
      let detail = stderr.trim();
      fail(`Codex app-server exited before model discovery completed (code ${code ?? 'unknown'})${detail ? `: ${detail}` : ''}`);
    });
    child.stderr.on('data', chunk => { stderr += chunk.toString(); });
    child.stdout.on('data', chunk => {
      buffer += chunk.toString();
      let lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (let line of lines) {
        if (!line.trim()) continue;
        let message;
        try {
          message = JSON.parse(line);
        } catch {
          fail(`Malformed JSON from Codex app-server: ${line.trim()}`);
          return;
        }
        handleMessage(message);
        if (settled) return;
      }
    });

    timeoutHandle = setTimeout(() => {
      fail(`Codex model discovery timed out after ${DISCOVERY_TIMEOUT_MS}ms. Retry the refresh or verify Codex CLI availability.`);
    }, DISCOVERY_TIMEOUT_MS);

    write({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: { clientInfo: { name: 'agent-portal', version: '1.0.0' } },
    });
  });
}

function startRefresh() {
  if (activeRefresh) return activeRefresh;
  discoveryState = { status: 'refreshing', error: discoveryState.error, timestamp: discoveryState.timestamp };
  let refresh;
  refresh = queryAppServerModels()
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

export async function discoverCodexModels({ force = false } = {}) {
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

export function getCodexDiscoveryStatus() {
  if (activeRefresh) {
    return { ...discoveryState, status: 'refreshing' };
  }
  if (cachedModels && Date.now() - lastFetchTime >= CACHE_TTL_MS) {
    return { ...discoveryState, status: 'stale' };
  }
  return { ...discoveryState };
}

export function getCachedCodexModels({ includeHidden = false } = {}) {
  return cloneModels(cachedModels || [], includeHidden);
}

export function clearCodexDiscoveryCache() {
  cachedModels = null;
  lastFetchTime = 0;
  activeRefresh = null;
  discoveryState = { status: 'stale', error: null, timestamp: 0 };
}
