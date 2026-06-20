import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawn } from 'node:child_process';
import {
  getAgentPortalConfig,
  getAnthropicGatewayConfig,
  setAgentPortalConfig,
  setAnthropicGatewayConfig,
} from '../../config-store.js';
import { getStateGraph } from '../../state-graph.js';
import { discoverOpenCodeModels, getCLIModels, getDefaultProviderModels } from '../../adapters/index.js';
import { json, parseBody } from './http.js';
import { createClaudeDirectEnv } from '../../../../packages/agent-pool-mcp/src/runner/provider-config.js';

const PROVIDER_ID_RE = /^[a-z0-9][a-z0-9._-]*$/i;
const CLAUDE_DIRECT_IGNORED_ENV_KEYS = [
  'ANTHROPIC_BASE_URL',
  'ANTHROPIC_AUTH_TOKEN',
  'ANTHROPIC_API_KEY',
  'ANTHROPIC_CUSTOM_HEADERS',
  'ANTHROPIC_VERTEX_BASE_URL',
  'ANTHROPIC_BEDROCK_BASE_URL',
  'CLAUDE_CODE_USE_BEDROCK',
  'CLAUDE_CODE_USE_VERTEX',
  'CLAUDE_CODE_USE_FOUNDRY',
  'CLAUDE_CODE_ENABLE_GATEWAY_MODEL_DISCOVERY',
];

function readCommandVersion(command, args = ['--version']) {
  try {
    return execFileSync(command, args, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 1500,
    }).trim().split(/\r?\n/).find(Boolean) || null;
  } catch {
    return null;
  }
}

function createCommandEnv(env = process.env) {
  let commandEnv = { ...process.env, ...env };
  for (let [key, value] of Object.entries(commandEnv)) {
    if (value === undefined || value === null) delete commandEnv[key];
  }
  return commandEnv;
}

function createClaudeCommandEnv(env = process.env) {
  let commandEnv = createClaudeDirectEnv({ ...process.env, ...env });
  for (let key of CLAUDE_DIRECT_IGNORED_ENV_KEYS) {
    commandEnv[key] = undefined;
  }
  return commandEnv;
}

function readCommandJson(command, args = [], env = process.env) {
  let stdout = '';
  try {
    stdout = execFileSync(command, args, {
      encoding: 'utf8',
      env: createCommandEnv(env),
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 5000,
    });
  } catch (error) {
    stdout = String(error.stdout || '');
  }
  try {
    return JSON.parse(stdout);
  } catch {
    return null;
  }
}

function readOpenCodeCredentialProviders(homeDir) {
  let authPath = path.join(homeDir, '.local', 'share', 'opencode', 'auth.json');
  if (!fs.existsSync(authPath)) return { credentialStorePresent: false, credentialProviders: [] };
  try {
    let auth = JSON.parse(fs.readFileSync(authPath, 'utf8'));
    let credentialProviders = auth && typeof auth === 'object' && !Array.isArray(auth)
      ? Object.keys(auth).filter((key) => PROVIDER_ID_RE.test(key)).sort()
      : [];
    return { credentialStorePresent: true, credentialProviders };
  } catch {
    return { credentialStorePresent: true, credentialProviders: [], credentialStoreUnreadable: true };
  }
}

/**
 * Start Claude Code's browser auth flow without returning credentials.
 * @param {{ cwd?: string, env?: object, spawnFn?: Function }} [options]
 * @returns {{ pid: number | null }}
 */
export function startClaudeAuthLogin(options = {}) {
  let spawnFn = options.spawnFn || spawn;
  let child = spawnFn('claude', ['auth', 'login', '--claudeai'], {
    cwd: options.cwd || os.homedir(),
    env: createClaudeDirectEnv({
      ...process.env,
      ...(options.env || {}),
    }),
    stdio: 'ignore',
    detached: true,
  });
  if (typeof child?.unref === 'function') child.unref();
  return { pid: Number.isInteger(child?.pid) ? child.pid : null };
}

/**
 * Returns provider auth diagnostics without returning tokens or credential file paths.
 * @param {{ env?: object, homeDir?: string, commandVersion?: Function, commandJson?: Function }} [options]
 * @returns {object}
 */
export function getProviderAuthStatus(options = {}) {
  let env = options.env || process.env;
  let homeDir = options.homeDir || os.homedir();
  let versionReader = options.commandVersion || readCommandVersion;
  let jsonReader = options.commandJson || readCommandJson;

  let openCodeVersion = versionReader('opencode');
  let openCodeCredentials = readOpenCodeCredentialProviders(homeDir);
  let openCodeEnvProviders = [];
  if (env.DEEPSEEK_API_KEY) openCodeEnvProviders.push('deepseek');
  if (env.OPENROUTER_API_KEY) openCodeEnvProviders.push('openrouter');

  let claudeVersion = versionReader('claude');
  let shouldReadClaudeAuthStatus = Boolean(claudeVersion) && (!options.commandVersion || options.commandJson);
  let claudeAuthStatus = shouldReadClaudeAuthStatus
    ? jsonReader('claude', ['auth', 'status'], createClaudeCommandEnv(env))
    : null;
  let claudeAuthStatusAvailable = Boolean(claudeAuthStatus && typeof claudeAuthStatus === 'object');
  let claudeLoggedIn = claudeAuthStatusAvailable ? claudeAuthStatus.loggedIn === true : null;
  let claudeAuthMethod = typeof claudeAuthStatus?.authMethod === 'string'
    ? claudeAuthStatus.authMethod
    : null;
  let claudeApiProvider = typeof claudeAuthStatus?.apiProvider === 'string'
    ? claudeAuthStatus.apiProvider
    : null;
  let claudeLocalCredentialsPresent = [
    path.join(homeDir, '.claude', '.credentials.json'),
    path.join(homeDir, '.claude.json'),
  ].some((candidate) => fs.existsSync(candidate));
  let ignoredEnvKeys = CLAUDE_DIRECT_IGNORED_ENV_KEYS.filter((key) => Boolean(env[key]));
  let claudeAuthenticated = Boolean(env.CLAUDE_CODE_OAUTH_TOKEN)
    || claudeLoggedIn === true;

  return {
    providers: {
      opencode: {
        installed: Boolean(openCodeVersion),
        version: openCodeVersion,
        authenticated: openCodeCredentials.credentialProviders.length > 0 || openCodeEnvProviders.length > 0,
        credentialStorePresent: openCodeCredentials.credentialStorePresent,
        credentialStoreUnreadable: Boolean(openCodeCredentials.credentialStoreUnreadable),
        credentialProviders: openCodeCredentials.credentialProviders,
        environmentProviders: openCodeEnvProviders,
        deepseekConfigured: openCodeCredentials.credentialProviders.includes('deepseek')
          || openCodeEnvProviders.includes('deepseek'),
      },
      claude: {
        installed: Boolean(claudeVersion),
        version: claudeVersion,
        authenticated: claudeAuthenticated,
        authSource: env.CLAUDE_CODE_OAUTH_TOKEN
          ? 'oauth-env'
          : claudeLoggedIn === true
            ? (claudeAuthMethod || 'claude-auth')
            : null,
        authStatusAvailable: claudeAuthStatusAvailable,
        loggedIn: claudeLoggedIn,
        authMethod: claudeAuthMethod,
        apiProvider: claudeApiProvider,
        localCredentialsPresent: claudeLocalCredentialsPresent,
        ignoredProxyEnvPresent: ignoredEnvKeys.length > 0,
        ignoredEnvKeys,
      },
    },
  };
}

export function createSettingsRoutes(ctx = {}) {
  let providerAuthStatusReader = ctx.getProviderAuthStatus || getProviderAuthStatus;
  let claudeAuthLoginStarter = ctx.startClaudeAuthLogin || startClaudeAuthLogin;

  return {
    'GET /api/settings': (_req, res) => {
      let sg = getStateGraph();
      json(res, {
        ...sg.getSettings(),
        agentPortal: getAgentPortalConfig(),
        anthropicGateway: getAnthropicGatewayConfig(),
      });
    },

    'GET /api/ui': (_req, res) => {
      let sg = getStateGraph();
      json(res, sg.get('ui') || {});
    },

    'POST /api/ui': async (req, res) => {
      try {
        let { path, value } = await parseBody(req);
        if (!path || (!path.startsWith('ui/') && !path.startsWith('layouts/'))) {
          throw new Error('Invalid UI state path');
        }
        let sg = getStateGraph();
        sg.set(path, value, 'http');
        json(res, { ok: true });
      } catch (err) {
        json(res, { error: err.message }, 400);
      }
    },

    'POST /api/settings': async (req, res) => {
      try {
        let settings = await parseBody(req);
        let sg = getStateGraph();
        sg.setSettings(settings, 'http');
        if (Object.prototype.hasOwnProperty.call(settings, 'anthropicGateway')) {
          setAnthropicGatewayConfig(settings.anthropicGateway);
        }
        if (Object.prototype.hasOwnProperty.call(settings, 'agentPortal')) {
          setAgentPortalConfig(settings.agentPortal);
        }
        json(res, { ok: true });
      } catch (err) {
        json(res, { error: err.message }, 400);
      }
    },

    'GET /api/settings/models': (_req, res) => {
      let sg = getStateGraph();
      let userModels = sg.getAllProviderModels();
      let cliModels = getCLIModels();
      json(res, {
        userModels,
        cliModels,
        defaultModels: getDefaultProviderModels(),
        providerAuth: providerAuthStatusReader(),
      });
    },

    'GET /api/settings/provider-auth': (_req, res) => {
      json(res, {
        providerAuth: providerAuthStatusReader(),
      });
    },

    'POST /api/settings/provider-auth/claude/login': (_req, res) => {
      try {
        let providerAuth = providerAuthStatusReader();
        let claude = providerAuth?.providers?.claude || {};
        if (!claude.installed) {
          json(res, { error: 'Claude Code CLI is not installed' }, 404);
          return;
        }
        let result = claudeAuthLoginStarter({
          cwd: ctx.projectRoot || process.cwd(),
          env: process.env,
        });
        json(res, {
          ok: true,
          provider: 'claude',
          authFlow: 'claudeai',
          pid: result.pid,
        });
      } catch (err) {
        json(res, { error: err.message }, 500);
      }
    },

    'POST /api/settings/models': async (req, res) => {
      try {
        let { provider, models } = await parseBody(req);
        if (!provider || !Array.isArray(models)) {
          json(res, { error: 'Missing provider or models array' }, 400);
          return;
        }
        let sg = getStateGraph();
        sg.setProviderModels(provider, models, 'http');
        json(res, { ok: true });
      } catch (err) {
        json(res, { error: err.message }, 400);
      }
    },

    'POST /api/settings/models/refresh': async (_req, res) => {
      try {
        let models = await discoverOpenCodeModels();
        json(res, {
          ok: true,
          count: models.length,
          models,
          defaultModels: getDefaultProviderModels(),
          providerAuth: providerAuthStatusReader(),
        });
      } catch (err) {
        json(res, { error: err.message }, 500);
      }
    },
  };
}
