import { createAntigravityAdapter } from './antigravity.js';
import { createClaudeAdapter } from './claude.js';
import { createCodexAdapter } from './codex.js';
import { getStateGraph } from '../state-graph.js';
import { listGroups } from '../../../packages/agent-pool-mcp/src/tools/groups.js';
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadAgents, getAgentCatalog } from '../agents/agent-parser.js';

let ADAPTERS = {
  antigravity: createAntigravityAdapter,
  claude: createClaudeAdapter,
  codex: createCodexAdapter,
};

/**
 * Resolve an adapter factory by name.
 * @param {string} type - 'antigravity' | 'claude'
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

const CLAUDE_CODE_MODEL_CATALOG = Object.freeze([
  { id: 'default', name: 'Default', description: 'Claude Code tier default' },
  { id: 'fable', name: 'Fable alias', description: 'Claude Code alias for Claude Fable' },
  { id: 'opus', name: 'Opus alias', description: 'Claude Code alias for Claude Opus' },
  { id: 'sonnet', name: 'Sonnet alias', description: 'Claude Code alias for Claude Sonnet' },
  { id: 'haiku', name: 'Haiku alias', description: 'Claude Code alias for Claude Haiku' },
  { id: 'claude-fable-5', name: 'Claude Fable 5', description: 'Most capable widely released Claude model' },
  { id: 'claude-opus-4-8', name: 'Claude Opus 4.8', description: 'Opus-tier model for complex reasoning and agentic coding' },
  { id: 'claude-sonnet-4-6', name: 'Claude Sonnet 4.6', description: 'Balanced model for coding, agents, and enterprise workflows' },
  { id: 'claude-haiku-4-5', name: 'Claude Haiku 4.5', description: 'Fastest current Claude model' },
]);

// Default (fallback) models per provider — used only if no CLI / user config
const DEFAULT_MODELS = {
  antigravity: ['default', 'Gemini 3.5 Flash (Medium)', 'Gemini 3.5 Flash (High)', 'Gemini 3.1 Pro (Low)', 'Gemini 3.1 Pro (High)', 'Claude Sonnet 4.6 (Thinking)', 'Claude Opus 4.6 (Thinking)', 'GPT-OSS 120B (Medium)'],
  claude: CLAUDE_CODE_MODEL_CATALOG.map(model => model.id),
  codex: ['default', 'gpt-5.5', 'gpt-5.4-mini', 'gpt-5.3-codex-spark'],
  opencode: ['default', 'deepseek/deepseek-v4-pro', 'deepseek/deepseek-v4-flash'],
};
const CLAUDE_CODE_MODEL_NAMES = new Map(CLAUDE_CODE_MODEL_CATALOG.map(model => [model.id, model.name]));

// Cached CLI-discovered models (populated by discoverOpenCodeModels)
/** @type {any[]} */
let _cliModels = [];
let _openRouterMetadata = new Map();
let _lastMetadataFetch = 0;

// Cached Antigravity CLI-discovered models (populated by discoverAntigravityModels)
/** @type {string[]} */
let _antigravityModels = [];

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
  } catch {}
}

// Discover models from OpenCode CLI (`opencode models`) and enrich with OpenRouter pricing.
// Caches result.
/**
 * @returns {Promise<Array<{id: string, name: string, context?: number, pricePrompt?: string, priceCompletion?: string, isFree?: boolean}>>}
 */
export async function discoverOpenCodeModels() {
  await fetchOpenRouterMetadata();
  return new Promise((resolve) => {
    execFile('opencode', ['models'], { timeout: 10000 }, (err, stdout) => {
      if (err) {
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
      resolve(richModels);
    });
  });
}

/**
 * Discover Antigravity models via `agy models`.
 * @returns {Promise<string[]>}
 */
export async function discoverAntigravityModels() {
  return new Promise((resolve) => {
    execFile('agy', ['models'], { timeout: 10000 }, (err, stdout) => {
      if (err) {
        resolve(_antigravityModels);
        return;
      }
      let models = stdout.split('\n')
        .map(l => l.trim())
        .filter(l => l && !l.startsWith('INFO') && !l.startsWith('WARN'));
      _antigravityModels = models;
      resolve(models);
    });
  });
}

/** Get cached Antigravity models. */
export function getAntigravityModels() {
  return _antigravityModels;
}

// Get the cached CLI models (from last discovery).
/**
 * @returns {any[]}
 */
export function getCLIModels() {
  return _cliModels;
}

export function getDefaultProviderModels() {
  return {
    claude: CLAUDE_CODE_MODEL_CATALOG.map(model => ({ ...model })),
  };
}

// Build the effective model list for a provider.
// Priority: user-configured → CLI-discovered → defaults.
/**
 * @param {string} provider
 * @returns {Array<{val: string, text: string}>}
 */
function getEffectiveModels(provider) {
  let userModels = {};
  try { userModels = getStateGraph().getAllProviderModels(); } catch {}
  let models = [];
  
  if (provider === 'claude') {
    models = [
      ...DEFAULT_MODELS.claude,
      ...(userModels.claude || []),
    ];
  } else if (userModels[provider]?.length > 0) {
    models = userModels[provider];
  } else if (provider === 'opencode' && _cliModels.length > 0) {
    models = _cliModels.map(m => m.id);
  } else if (provider === 'antigravity' && _antigravityModels.length > 0) {
    models = ['default', ..._antigravityModels];
  } else {
    models = DEFAULT_MODELS[provider] || ['default'];
  }
  
  models = [...new Set(models)];

  return models.map(id => {
    let text = id;
    let lookupId = id.replace('openrouter/', '');
    if (provider === 'claude' && CLAUDE_CODE_MODEL_NAMES.has(id)) {
      text = CLAUDE_CODE_MODEL_NAMES.get(id);
    } else if (_openRouterMetadata.has(lookupId)) {
      text = _openRouterMetadata.get(lookupId).name || id;
    }
    return { val: id, text };
  });
}

// ── Agent catalog ─────────────────────────────────────────
// Cached agent list from .agent-portal/agents/*.md (refreshes every 5s).
let _agentCache = null;
let _agentCacheTime = 0;
let _portalRoot = null;
let _agentCacheKey = '';
const MODULE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

function getAgentRootCandidates() {
  let candidates = [
    process.env.AGENT_PORTAL_MEMORY_ROOT,
    process.env.AGENT_PORTAL_AGENTS_ROOT,
    _portalRoot,
    process.cwd(),
    MODULE_ROOT,
  ].filter(Boolean).map(root => resolve(root));
  return [...new Set(candidates)];
}

function resolveAgentRoot() {
  for (let root of getAgentRootCandidates()) {
    if (existsSync(join(root, '.agent-portal', 'agents'))) return root;
  }
  return _portalRoot || process.cwd();
}

/** Set the portal root so agent-parser can find .agent-portal/ */
export function setPortalRoot(root) {
  _portalRoot = root;
  _agentCache = null;
  _agentCacheTime = 0;
  _agentCacheKey = '';
}

/**
 * Get agent catalog (slug, icon, color, description, role). Cached 5s.
 * @returns {Array<object>}
 */
export function getAgentList() {
  let root = resolveAgentRoot();
  if (_agentCache && _agentCacheKey === root && (Date.now() - _agentCacheTime < 5000)) return _agentCache;
  let agentsDir = join(root, '.agent-portal', 'agents');
  let skillsDir = join(root, '.agent-portal', 'skills');
  let agents = loadAgents(agentsDir, skillsDir);
  _agentCache = getAgentCatalog(agents);
  _agentCacheTime = Date.now();
  _agentCacheKey = root;
  return _agentCache;
}

export function invalidateAgentList() {
  _agentCache = null;
  _agentCacheTime = 0;
  _agentCacheKey = '';
}

// Adapter metadata — describes providers and their parameters.
// The UI uses this to build dynamic cascading selects:
//   pool → Agent (from .agent-portal/agents/) → Provider → Model → ChatType

/**
 * Read resource-groups.json and extract preferred models per provider + full group list.
 * @returns {{ byProvider: Object<string, string[]>, defaultModel: string|null, groups: object[] }}
 */
function loadResourceGroupPreferences() {
  let result = { byProvider: {}, defaultModel: null, groups: [] };
  try {
    let groups = listGroups(resolveAgentRoot());
    let seen = new Set();
    for (let group of groups) {
      let { name, ...config } = group;
      let provider = config.provider || 'codex';
      // Full group entry for frontend
      result.groups.push({
        name,
        provider,
        model: config.model || null,
        profiles: Array.isArray(config.profiles) ? config.profiles : [],
        rotation_mode: config.rotation_mode || 'error_fallback',
        approval_mode: config.approval_mode || config.approvalMode || null,
        policy: config.policy || null,
        max_agents: config.max_agents || null,
        timeout: config.timeout || null,
      });
      // Preferred models by provider
      if (config.model && !seen.has(`${provider}:${config.model}`)) {
        if (!result.byProvider[provider]) result.byProvider[provider] = [];
        result.byProvider[provider].push(config.model);
        seen.add(`${provider}:${config.model}`);
        if (!result.defaultModel) result.defaultModel = config.model;
      }
      if (Array.isArray(config.profiles)) {
        for (let p of config.profiles) {
          let pProvider = p.provider || provider;
          if (p.model && !seen.has(`${pProvider}:${p.model}`)) {
            if (!result.byProvider[pProvider]) result.byProvider[pProvider] = [];
            result.byProvider[pProvider].push(p.model);
            seen.add(`${pProvider}:${p.model}`);
          }
        }
      }
    }
  } catch { /* resource groups may not exist */ }
  return result;
}

function buildAdapterMetadata() {
  let agentOptions = getAgentList().map(a => {
    let acronyms = new Set(['qa', 'ui', 'api', 'db', 'ci', 'cd', 'ml', 'ai', 'devops', 'sre']);
    let name = a.slug.split('-').map(w => acronyms.has(w) ? w.toUpperCase() : w[0].toUpperCase() + w.slice(1)).join(' ');
    return { val: a.slug, text: name, resourceGroup: a.resourceGroup || null };
  });
  let rgPrefs = loadResourceGroupPreferences();

  // Build resource_group selector options
  let groupOptions = [{ val: 'none', text: 'Manual (provider + model)' }];
  for (let g of rgPrefs.groups) {
    let profileCount = g.profiles.length;
    let subtitle = `${g.provider}${g.model ? ' / ' + g.model.split('/').pop() : ''}`;
    if (profileCount > 1) subtitle += ` · ${profileCount} profiles`;
    if (g.rotation_mode === 'round_robin') subtitle += ' · round-robin';
    groupOptions.push({ val: g.name, text: g.name, subtitle });
  }

  return {
    pool: {
      name: 'Agent Pool',
      parameters: [
        { id: 'agent', label: 'Agent', type: 'select', options: agentOptions },
        { id: 'resource_group', label: 'Resource Group', type: 'select', options: groupOptions },
        { id: 'chatType', label: 'Chat Type', type: 'select', options: ['standard', 'planning', 'review'] },
        {
          id: 'approval_mode',
          label: 'Access',
          type: 'select',
          options: [
            { val: 'yolo', text: 'Full access' },
            { val: 'auto_edit', text: 'Edit only' },
            { val: 'plan', text: 'Read only' },
          ],
        },
      ]
    },
    antigravity: {
      name: 'Antigravity CLI',
      supportsAudio: false,
      parameters: [
        { id: 'model', label: 'Model', type: 'select', options: getEffectiveModels('antigravity'), preferred: rgPrefs.byProvider['antigravity'] || [] }
      ]
    },
    claude: {
      name: 'Claude CLI',
      supportsAudio: false,
      parameters: [
        { id: 'model', label: 'Model', type: 'select', options: getEffectiveModels('claude'), preferred: rgPrefs.byProvider['claude'] || [] }
      ]
    },
    codex: {
      name: 'Codex CLI',
      supportsAudio: false,
      parameters: [
        { id: 'model', label: 'Model', type: 'select', options: getEffectiveModels('codex'), preferred: rgPrefs.byProvider['codex'] || [] }
      ]
    },
    opencode: {
      name: 'OpenCode',
      supportsAudio: true,
      parameters: [
        { id: 'model', label: 'Model', type: 'select', options: getEffectiveModels('opencode'), preferred: rgPrefs.byProvider['opencode'] || [] }
      ]
    },
    _resourceGroupDefaults: {
      defaultModel: rgPrefs.defaultModel,
      byProvider: rgPrefs.byProvider,
      groups: rgPrefs.groups,
      configUrl: '/#resource-groups',
    },
  };
}

/** @returns {string[]} Available adapter type names. */
export function listAdapterTypes() {
  let metadata = buildAdapterMetadata();
  let types = Object.keys(metadata).filter(k => !k.startsWith('_'));
  return { types, metadata };
}

// Pre-warm the cache on module load so that getEffectiveModels has metadata available 
// immediately for the initial /api/adapter/types request when a chat opens.
discoverOpenCodeModels().catch(() => {});
discoverAntigravityModels().catch(() => {});
