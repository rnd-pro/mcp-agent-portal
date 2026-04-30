import { createGeminiAdapter } from './gemini.js';
import { createClaudeAdapter } from './claude.js';
import { getAllProviderModels } from '../config-store.js';
import { execFile } from 'node:child_process';

let ADAPTERS = {
  gemini: createGeminiAdapter,
  claude: createClaudeAdapter,
};

/**
 * Resolve an adapter factory by name.
 * @param {string} type - 'gemini' | 'claude'
 * @returns {Function}
 * @throws {Error} if type is unknown
 */
export function resolveAdapter(type) {
  let factory = ADAPTERS[type];
  if (!factory) {
    throw new Error(`Unknown adapter type "${type}". Valid types: ${Object.keys(ADAPTERS).join(', ')}`);
  }
  return factory;
}

/** Default (fallback) models per provider — used only if no CLI / user config */
const DEFAULT_MODELS = {
  gemini: ['default', 'gemini-3.1-pro', 'gemini-3.1-flash', 'gemini-2.5-pro', 'gemini-2.5-flash'],
  claude: ['default', 'claude-3-7-sonnet', 'claude-3-5-sonnet', 'claude-3-5-haiku'],
  opencode: ['default'],
};

/** Cached CLI-discovered models (populated by discoverOpenCodeModels) */
let _cliModels = [];
let _openRouterMetadata = new Map();
let _lastMetadataFetch = 0;

async function fetchOpenRouterMetadata() {
  if (Date.now() - _lastMetadataFetch < 3600000 && _openRouterMetadata.size > 0) return;
  try {
    const res = await fetch('https://openrouter.ai/api/v1/models');
    const json = await res.json();
    for (const m of json.data) {
      const promptCost = parseFloat(m.pricing?.prompt || '0') * 1000000;
      const completionCost = parseFloat(m.pricing?.completion || '0') * 1000000;
      _openRouterMetadata.set(m.id, {
        name: m.name,
        context: m.context_length,
        maxOutput: m.top_provider?.max_completion_tokens || 0,
        isVision: m.architecture?.input_modalities?.includes('image') || false,
        isTools: m.supported_parameters?.includes('tools') || false,
        pricePrompt: promptCost.toFixed(2),
        priceCompletion: completionCost.toFixed(2),
        rawPrompt: promptCost,
        rawCompletion: completionCost,
        created: m.created || 0,
        isFree: promptCost === 0 && completionCost === 0
      });
    }
    _lastMetadataFetch = Date.now();
  } catch (err) {
    console.warn('[adapters] OpenRouter fetch failed:', err.message);
  }
}

/**
 * Discover models from OpenCode CLI (`opencode models`) and enrich with OpenRouter pricing.
 * Caches result.
 * @returns {Promise<Array<{id: string, name: string, context?: number, pricePrompt?: string, priceCompletion?: string, isFree?: boolean}>>}
 */
export async function discoverOpenCodeModels() {
  await fetchOpenRouterMetadata();
  return new Promise((resolve) => {
    execFile('opencode', ['models'], { timeout: 10000 }, (err, stdout) => {
      if (err) {
        console.warn('[adapters] opencode models discovery failed:', err.message);
        resolve([]);
        return;
      }
      let models = stdout.split('\n')
        .map(l => l.trim())
        .filter(l => l && !l.startsWith('INFO') && !l.startsWith('WARN'));
        
      let richModels = models.map(id => {
        // Many OpenRouter models in opencode CLI start with openrouter/...
        let lookupId = id.startsWith('openrouter/') ? id.replace('openrouter/', '') : id;
        let meta = _openRouterMetadata.get(lookupId);
        if (meta) {
          return { id, ...meta };
        }
        return { id, name: id, isFree: id.includes('free') };
      });
      
      _cliModels = richModels;
      console.log(`[adapters] Discovered ${richModels.length} OpenCode models`);
      resolve(richModels);
    });
  });
}

/**
 * Get the cached CLI models (from last discovery).
 * @returns {string[]}
 */
export function getCLIModels() {
  return _cliModels;
}

/**
 * Build the effective model list for a provider.
 * Priority: user-configured → CLI-discovered → defaults.
 * @param {string} provider
 * @returns {string[]}
 */
function getEffectiveModels(provider) {
  let userModels = getAllProviderModels();
  let models = [];
  
  if (userModels[provider]?.length > 0) {
    models = userModels[provider];
  } else if (provider === 'opencode' && _cliModels.length > 0) {
    models = _cliModels.map(m => m.id);
  } else {
    models = DEFAULT_MODELS[provider] || ['default'];
  }
  
  return models.map(id => {
    let text = id;
    let lookupId = id.replace('openrouter/', '');
    if (_openRouterMetadata.has(lookupId)) {
      text = _openRouterMetadata.get(lookupId).name || id;
    }
    return { val: id, text };
  });
}

/**
 * Adapter metadata — describes providers and their parameters.
 * Pool-specific params (chatType) are separate from provider params (model).
 * The UI uses this to build dynamic cascading selects:
 *   pool → Provider (from keys of providers) → Model (from selected provider) → ChatType
 */
function buildAdapterMetadata() {
  return {
    pool: {
      name: 'Agent Pool',
      parameters: [
        { id: 'chatType', label: 'Chat Type', type: 'select', options: ['standard', 'planning', 'review'] }
      ]
    },
    gemini: {
      name: 'Gemini CLI',
      parameters: [
        { id: 'model', label: 'Model', type: 'select', options: getEffectiveModels('gemini') }
      ]
    },
    claude: {
      name: 'Claude CLI',
      parameters: [
        { id: 'model', label: 'Model', type: 'select', options: getEffectiveModels('claude') }
      ]
    },
    opencode: {
      name: 'OpenCode',
      parameters: [
        { id: 'model', label: 'Model', type: 'select', options: getEffectiveModels('opencode') }
      ]
    }
  };
}

export function listAdapterTypes() {
  let metadata = buildAdapterMetadata();
  let types = Object.keys(metadata);
  return { types, metadata };
}

// Pre-warm the cache on module load so that getEffectiveModels has metadata available 
// immediately for the initial /api/adapter/types request when a chat opens.
discoverOpenCodeModels().catch(err => {
  console.warn('[adapters] Failed to pre-warm OpenCode models:', err.message);
});
