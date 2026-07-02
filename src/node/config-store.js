/**
 * Config store — reads/writes ~/.agent-portal/agent-portal.json.
 *
 * Schema:
 * {
 *   mcpServers: {},
 *   projects: [{ id, name, path, lastOpened, color, cli }],
 *   globalCli: { defaultAdapter, model, timeout },
 *   activeProjectIds: []
 * }
 *
 * @module config-store
 */
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { resolveChatCreationAgent } from '../iso/chat-orchestration.js';

let CONFIG_PATH = process.env.PORTAL_CONFIG_PATH || path.join(os.homedir(), '.agent-portal', 'agent-portal.json');
let CHATS_DIR = process.env.PORTAL_CHATS_DIR || path.join(os.homedir(), '.agent-portal', 'agent-portal-chats');
let chatCache = new Map();
let deletedChats = new Set();
let chatFileQueue = Promise.resolve();

function normalizeChatOrigin(origin) {
  if (origin === 'mcp') return 'mcp';
  if (origin === 'agent') return 'agent';
  return 'portal';
}

function cloneChat(chat) {
  return JSON.parse(JSON.stringify(chat));
}

function queueChatWrite(chatId, chat) {
  deletedChats.delete(chatId);
  chatCache.set(chatId, cloneChat(chat));
  chatFileQueue = chatFileQueue.then(async () => {
    await fsp.mkdir(CHATS_DIR, { recursive: true });
    await fsp.writeFile(path.join(CHATS_DIR, `${chatId}.json`), JSON.stringify(chat, null, 2));
  }).catch((err) => {
    console.warn(`[config-store] Failed to write chat ${chatId}: ${err.message}`);
  });
}

function queueChatDelete(chatId) {
  chatCache.delete(chatId);
  deletedChats.add(chatId);
  chatFileQueue = chatFileQueue.then(async () => {
    await fsp.rm(path.join(CHATS_DIR, `${chatId}.json`), { force: true });
  }).catch((err) => {
    console.warn(`[config-store] Failed to delete chat ${chatId}: ${err.message}`);
  });
}

export async function flushChatWrites() {
  await chatFileQueue;
}

/** @returns {object} */
export function readConfig() {
  if (!fs.existsSync(CONFIG_PATH)) return { mcpServers: {}, projects: [], globalCli: {}, activeProjectIds: [] };
  try { return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')); }
  catch (e) { throw new Error(`[config-store] Failed to parse config at ${CONFIG_PATH}: ${e.message}`); }
}

/** @param {object} config */
export function writeConfig(config) {
  let dir = path.dirname(CONFIG_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
}

// ── Project History ─────────────────────────────────────

/** @returns {Array} */
export function getProjectHistory() {
  let config = readConfig();
  return config.projects || [];
}

/**
 * Add or update a project in history.
 * @param {{ name: string, path: string, color?: string, cli?: object }} proj
 * @returns {{ id: string }}
 */
export function addProject(proj) {
  let config = readConfig();
  if (!config.projects) config.projects = [];

  let existing = config.projects.find(p => p.path === proj.path);
  if (existing) {
    existing.name = proj.name || existing.name;
    existing.lastOpened = Date.now();
    if (proj.color) existing.color = proj.color;
    if (proj.cli) existing.cli = { ...existing.cli, ...proj.cli };
    writeConfig(config);
    return { id: existing.id };
  }

  let id = crypto.randomUUID().slice(0, 8);
  config.projects.push({
    id,
    name: proj.name || path.basename(proj.path),
    path: proj.path,
    lastOpened: Date.now(),
    color: proj.color || null,
    cli: proj.cli || null,
  });
  writeConfig(config);
  return { id };
}

/**
 * Remove a project from history.
 * @param {string} id
 */
export function removeProject(id) {
  let config = readConfig();
  config.projects = (config.projects || []).filter(p => p.id !== id);
  if (config.activeProjectIds) {
    config.activeProjectIds = config.activeProjectIds.filter(i => i !== id);
  }
  writeConfig(config);
}

/**
 * Update a project's fields.
 * @param {string} id
 * @param {object} updates
 */
export function updateProject(id, updates) {
  let config = readConfig();
  let proj = (config.projects || []).find(p => p.id === id);
  if (!proj) return;
  Object.assign(proj, updates);
  writeConfig(config);
}

// ── Global Settings ─────────────────────────────────────

export function getGlobalSettings() {
  let config = readConfig();
  return config.settings || {};
}

export function setGlobalSettings(settings) {
  let config = readConfig();
  config.settings = { ...(config.settings || {}), ...settings };
  writeConfig(config);
}

// ── Anthropic Gateway ───────────────────────────────────

export function getAnthropicGatewayConfig() {
  let config = readConfig();
  return config.anthropicGateway || config.settings?.anthropicGateway || {};
}

/**
 * @param {object} gateway
 * @returns {object}
 */
export function setAnthropicGatewayConfig(gateway) {
  let config = readConfig();
  config.anthropicGateway = gateway || {};
  writeConfig(config);
  return config.anthropicGateway;
}

/**
 * Update the Anthropic gateway config.
 * @param {object|((current: object) => object)} updater
 * @returns {object}
 */
export function updateAnthropicGatewayConfig(updater) {
  let config = readConfig();
  let current = config.anthropicGateway || {};
  let next = typeof updater === 'function'
    ? updater({ ...current })
    : { ...current, ...(updater || {}) };
  config.anthropicGateway = next || {};
  writeConfig(config);
  return config.anthropicGateway;
}

// ── Agent Portal Libraries ─────────────────────────────────────

export function getAgentPortalConfig() {
  let config = readConfig();
  return config.agentPortal || {};
}

/**
 * @param {object} agentPortal
 * @returns {object}
 */
export function setAgentPortalConfig(agentPortal) {
  let config = readConfig();
  config.agentPortal = agentPortal || {};
  writeConfig(config);
  return config.agentPortal;
}

/**
 * Get the configured team-memory content directory, or null when unset.
 * Resolution at runtime also honors the AGENT_PORTAL_MEMORY_ROOT env override
 * (see runtime/paths.js getTeamMemoryRoot); this returns the persisted setting.
 * @returns {string|null}
 */
export function getTeamMemoryRoot() {
  let config = readConfig();
  return config.agentPortal?.teamMemoryRoot || null;
}

/**
 * Persist the team-memory content directory setting.
 * @param {string|null} dir Absolute path to the team-memory clone, or null to clear.
 * @returns {string|null}
 */
export function setTeamMemoryRoot(dir) {
  let config = readConfig();
  if (!config.agentPortal) config.agentPortal = {};
  config.agentPortal.teamMemoryRoot = dir ? String(dir) : null;
  writeConfig(config);
  return config.agentPortal.teamMemoryRoot;
}

/**
 * Get the configured global skills directory, or null when unset.
 * Resolution at runtime also honors AGENT_PORTAL_SKILLS_ROOT and otherwise
 * falls back to `<teamMemoryRoot>/skills`; this returns only the persisted setting.
 * @returns {string|null}
 */
export function getSkillsRoot() {
  let config = readConfig();
  return config.agentPortal?.skillsRoot || null;
}

/**
 * Persist the global skills directory setting.
 * @param {string|null} dir Absolute path to the global skills directory, or null to clear.
 * @returns {string|null}
 */
export function setSkillsRoot(dir) {
  let config = readConfig();
  if (!config.agentPortal) config.agentPortal = {};
  config.agentPortal.skillsRoot = dir ? String(dir) : null;
  writeConfig(config);
  return config.agentPortal.skillsRoot;
}

// ── Open Tabs ───────────────────────────────────────────

/** @returns {string[]} */
export function getActiveProjectIds() {
  let config = readConfig();
  return config.activeProjectIds || [];
}

/** @param {string[]} ids */
export function setActiveProjectIds(ids) {
  let config = readConfig();
  config.activeProjectIds = ids;
  writeConfig(config);
}

// ── Global CLI ──────────────────────────────────────────

/** @returns {object} */
export function getGlobalCli() {
  let config = readConfig();
  return config.globalCli || {};
}

/** @param {object} cli */
export function setGlobalCli(cli) {
  let config = readConfig();
  config.globalCli = cli;
  writeConfig(config);
}

// ── Chat Persistence ────────────────────────────────────

function ensureChatsDir() {
  if (!fs.existsSync(CHATS_DIR)) fs.mkdirSync(CHATS_DIR, { recursive: true });
}

/**
 * List all chats (metadata only).
 * @returns {Array<{ id, projectId, name, adapter, model, lastMessage, updatedAt }>}
 */
export function listChats() {
  ensureChatsDir();
  let files = fs.readdirSync(CHATS_DIR).filter(f => f.endsWith('.json'));
  let chatsById = new Map();
  for (let f of files) {
    try {
      let data = JSON.parse(fs.readFileSync(path.join(CHATS_DIR, f), 'utf8'));
      if (deletedChats.has(data.id)) continue;
      chatsById.set(data.id, {
        id: data.id,
        projectId: data.projectId || null,
        parentChatId: data.parentChatId || null,
        name: data.name || 'Untitled',
        adapter: data.adapter || 'pool',
        origin: normalizeChatOrigin(data.origin),
        model: data.model || null,
        lastMessage: data.messages?.length ? data.messages[data.messages.length - 1].text?.slice(0, 80) : '',
        messageCount: data.messages?.length || 0,
        updatedAt: data.updatedAt || 0,
      });
    } catch { /* skip corrupt */ }
  }
  for (let [id, data] of chatCache) {
    if (deletedChats.has(id)) continue;
    chatsById.set(id, {
      id: data.id,
      projectId: data.projectId || null,
      parentChatId: data.parentChatId || null,
      name: data.name || 'Untitled',
      adapter: data.adapter || 'pool',
      origin: normalizeChatOrigin(data.origin),
      model: data.model || null,
      lastMessage: data.messages?.length ? data.messages[data.messages.length - 1].text?.slice(0, 80) : '',
      messageCount: data.messages?.length || 0,
      updatedAt: data.updatedAt || 0,
    });
  }
  let chats = [...chatsById.values()];
  return chats.sort((a, b) => b.updatedAt - a.updatedAt);
}

/**
 * Get full chat data including messages.
 * @param {string} chatId
 * @returns {object|null}
 */
export function getChat(chatId) {
  if (deletedChats.has(chatId)) return null;
  if (chatCache.has(chatId)) return cloneChat(chatCache.get(chatId));
  let file = path.join(CHATS_DIR, `${chatId}.json`);
  if (!fs.existsSync(file)) return null;
  try {
    let chat = JSON.parse(fs.readFileSync(file, 'utf8'));
    chatCache.set(chatId, cloneChat(chat));
    return chat;
  }
  catch { return null; }
}

/**
 * Create a new chat.
 * @param {Object|{ projectId?: string, parentChatId?: string, name?: string, adapter?: string, model?: string }} opts
 * @returns {{ id: string }}
 */
export function createChat(opts = {}) {
  ensureChatsDir();
  let id = crypto.randomUUID().slice(0, 12);
  let agent = resolveChatCreationAgent(opts);
  let chat = {
    id,
    projectId: opts.projectId || null,
    parentChatId: opts.parentChatId || null,
    name: opts.name || 'New Chat',
    adapter: opts.adapter || 'pool',
    agent,
    provider: opts.provider || null,
    model: opts.model || null,
    approval_mode: opts.approval_mode || null,
    resource_group: opts.resource_group || null,
    chatType: opts.chatType || null,
    origin: normalizeChatOrigin(opts.origin),
    activeGoalId: opts.activeGoalId || null,
    goalIntentActive: Boolean(opts.goalIntentActive),
    goalQueueMode: opts.goalQueueMode || null,
    messages: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  queueChatWrite(id, chat);
  return { id };
}

/**
 * Append a message to a chat.
 * @param {string} chatId
 * @param {{ role: string, text: string }} msg
 */
export function appendChatMessage(chatId, msg) {
  let chat = getChat(chatId);
  if (!chat) return;
  chat.messages.push({ ...msg, ts: Date.now() });
  chat.updatedAt = Date.now();
  queueChatWrite(chatId, chat);
}

/**
 * Replace all messages in a chat.
 * @param {string} chatId
 * @param {Array<object>} messages
 */
export function replaceChatMessages(chatId, messages) {
  let chat = getChat(chatId);
  if (!chat) return;
  chat.messages = messages;
  chat.updatedAt = Date.now();
  queueChatWrite(chatId, chat);
}

/**
 * Delete a chat.
 * @param {string} chatId
 */
export function deleteChat(chatId) {
  queueChatDelete(chatId);
}

/**
 * Update a chat's fields.
 * @param {string} chatId
 * @param {object} updates
 */
export function updateChat(chatId, updates) {
  let chat = getChat(chatId);
  if (!chat) return;

  // Whitelist of keys that can be updated via API
  let allowedKeys = new Set(['name', 'adapter', 'model', 'provider', 'chatType', 'agent', 'approval_mode', 'resource_group', 'projectId', 'parentChatId', 'origin', 'activeGoalId', 'goalIntentActive', 'goalQueueMode']);

  for (let key of Object.keys(updates)) {
    if (!allowedKeys.has(key)) continue;
    let val = updates[key];
    // Reject template garbage (unresolved Symbiote bindings)
    if (typeof val === 'string' && val.includes('{{')) continue;
    if (key === 'origin') val = normalizeChatOrigin(val);
    chat[key] = val;
  }

  if ('agent' in updates || 'adapter' in updates || 'parentChatId' in updates) {
    chat.agent = resolveChatCreationAgent({
      adapter: chat.adapter || 'pool',
      parentChatId: chat.parentChatId || null,
      agent: chat.agent || null,
    });
  }

  chat.updatedAt = Date.now();
  queueChatWrite(chatId, chat);
}

/**
 * Update session ID for a chat (for CLI session continuity).
 * @param {string} chatId
 * @param {string} sessionId
 */
export function updateChatSession(chatId, sessionId) {
  let chat = getChat(chatId);
  if (!chat) return;
  chat.sessionId = sessionId;
  chat.updatedAt = Date.now();
  queueChatWrite(chatId, chat);
}

/**
 * Set or clear the pending task ID for a chat.
 * Allows reconnection to a running agent-pool task after browser reload.
 * @param {string} chatId
 * @param {string|null} taskId
 */
export function updateChatTask(chatId, taskId) {
  let chat = getChat(chatId);
  if (!chat) return;
  if (taskId) {
    chat.pendingTaskId = taskId;
  } else {
    delete chat.pendingTaskId;
  }
  chat.updatedAt = Date.now();
  queueChatWrite(chatId, chat);
}

// ── Provider Models ─────────────────────────────────────

/**
 * Get user-configured models for a provider.
 * @param {string} provider
 * @returns {string[]}
 */
export function getProviderModels(provider) {
  let config = readConfig();
  return config.providerModels?.[provider] || [];
}

/**
 * Get all provider model configs.
 * @returns {Record<string, string[]>}
 */
export function getAllProviderModels() {
  let config = readConfig();
  return config.providerModels || {};
}

/**
 * Set user-configured models for a provider.
 * @param {string} provider
 * @param {string[]} models
 */
export function setProviderModels(provider, models) {
  let config = readConfig();
  if (!config.providerModels) config.providerModels = {};
  config.providerModels[provider] = models;
  writeConfig(config);
}
