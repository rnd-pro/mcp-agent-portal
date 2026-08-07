/**
 * Lifecycle.js - Node lifecycle pipeline
 *
 * Every node can define lifecycle hooks: validate, cacheKey, execute, postProcess.
 * The lifecycle runner orchestrates these steps with cache awareness.
 *
 * @module symbiote-engine/Lifecycle
 */

/**
 * @typedef {object} LifecycleHooks
 * @property {function} [validate] - (inputs) => boolean — return false to abort
 * @property {function} [cacheKey] - (inputs, params) => string — custom cache key
 * @property {function} [execute] - (inputs, params) => outputs — main processing (async)
 * @property {function} [postProcess] - (outputs) => outputs — transform before output
 */

/**
 * @typedef {object} CacheState
 * @property {'auto'|'freeze'|'force'} mode - Cache behavior mode
 * @property {Map<string, {key: string, outputs: object}>} store - Cache storage
 * @property {string} nodeId - Current node ID
 */

/**
 * @typedef {object} LifecycleResult
 * @property {object} outputs - Final outputs from the node
 * @property {boolean} cached - Whether result came from cache
 * @property {string|null} error - Error message if validation failed
 * @property {string|null} cacheHash - Cache key used (for UI display)
 */

/**
 * Default cache key: JSON hash of inputs + params
 * @param {object} inputs
 * @param {object} params
 * @returns {string}
 */
function defaultCacheKey(inputs, params) {
  return JSON.stringify({ i: inputs, p: params });
}

/**
 * Run lifecycle pipeline for a node
 *
 * Flow:
 * 1. validate(inputs) → false = abort with error
 * 2. cacheKey(inputs, params) → compute hash
 * 3. Check mode: freeze → return cached; force → skip; auto → check hash
 * 4. execute(inputs, params) → outputs
 * 5. postProcess(outputs) → final outputs
 * 6. Store in cache
 *
 * @param {LifecycleHooks} hooks - Lifecycle hooks from driver
 * @param {object} inputs - Resolved inputs from upstream
 * @param {object} params - Node parameters
 * @param {CacheState} cacheState - Cache state for this node
 * @param {Object} [executionContext]
 * @param {AbortSignal} [executionContext.signal]
 * @param {number} [executionContext.deadline]
 * @param {object} [executionContext.context]
 * @returns {Promise<LifecycleResult>}
 */
export async function runLifecycle(hooks, inputs, params, cacheState, executionContext = {}) {
  let { mode = 'auto', store, nodeId } = cacheState;


  if (hooks.validate) {
    try {
      let valid = hooks.validate(inputs);
      if (valid === false) {
        return { outputs: null, cached: false, error: 'Validation failed', cacheHash: null };
      }
    } catch (err) {
      return {
        outputs: null,
        cached: false,
        error: `Validation error: ${err.message}`,
        cacheHash: null,
      };
    }
  }


  let cacheKeyFn = hooks.cacheKey || defaultCacheKey;
  let cacheHash = cacheKeyFn(inputs, params);


  let cached = store.get(nodeId);

  if (mode === 'freeze' && cached) {
    return { outputs: cached.outputs, cached: true, error: null, cacheHash: cached.key };
  }

  if (mode === 'auto' && cached && cached.key === cacheHash) {
    return { outputs: cached.outputs, cached: true, error: null, cacheHash };
  }


  let executeFn = hooks.execute;
  if (!executeFn) {
    return { outputs: null, cached: false, error: 'No execute hook defined', cacheHash };
  }

  let outputs;
  try {
    outputs = await executeFn(inputs, { ...params, ...executionContext });
  } catch (err) {
    return { outputs: null, cached: false, error: `Execution error: ${err.message}`, cacheHash };
  }


  if (hooks.postProcess) {
    try {
      outputs = hooks.postProcess(outputs);
    } catch (err) {
      return {
        outputs: null,
        cached: false,
        error: `PostProcess error: ${err.message}`,
        cacheHash,
      };
    }
  }


  store.set(nodeId, { key: cacheHash, outputs });

  return { outputs, cached: false, error: null, cacheHash };
}
