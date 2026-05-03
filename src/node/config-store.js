/**
 * Config store — reads/writes ~/.gemini/agent-portal.json.
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
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';

let CONFIG_PATH = process.env.PORTAL_CONFIG_PATH || path.join(os.homedir(), '.agent-portal', 'agent-portal.json');
let CHATS_DIR = process.env.PORTAL_CHATS_DIR || path.join(os.homedir(), '.agent-portal', 'agent-portal-chats');

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
  let chats = [];
  for (let f of files) {
    try {
      let data = JSON.parse(fs.readFileSync(path.join(CHATS_DIR, f), 'utf8'));
      chats.push({
        id: data.id,
        projectId: data.projectId || null,
        parentChatId: data.parentChatId || null,
        name: data.name || 'Untitled',
        adapter: data.adapter || 'pool',
        model: data.model || null,
        lastMessage: data.messages?.length ? data.messages[data.messages.length - 1].text?.slice(0, 80) : '',
        messageCount: data.messages?.length || 0,
        updatedAt: data.updatedAt || 0,
      });
    } catch { /* skip corrupt */ }
  }
  return chats.sort((a, b) => b.updatedAt - a.updatedAt);
}

/**
 * Get full chat data including messages.
 * @param {string} chatId
 * @returns {object|null}
 */
export function getChat(chatId) {
  let file = path.join(CHATS_DIR, `${chatId}.json`);
  if (!fs.existsSync(file)) return null;
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch { return null; }
}

/**
 * Create a new chat.
 * @param {{ projectId?: string, parentChatId?: string, name?: string, adapter?: string, model?: string }} opts
 * @returns {{ id: string }}
 */
export function createChat(opts = {}) {
  ensureChatsDir();
  let id = crypto.randomUUID().slice(0, 12);
  let chat = {
    id,
    projectId: opts.projectId || null,
    parentChatId: opts.parentChatId || null,
    name: opts.name || 'New Chat',
    adapter: opts.adapter || 'pool',
    model: opts.model || null,
    messages: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  fs.writeFileSync(path.join(CHATS_DIR, `${id}.json`), JSON.stringify(chat, null, 2));
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
  fs.writeFileSync(path.join(CHATS_DIR, `${chatId}.json`), JSON.stringify(chat, null, 2));
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
  fs.writeFileSync(path.join(CHATS_DIR, `${chatId}.json`), JSON.stringify(chat, null, 2));
}

/**
 * Delete a chat.
 * @param {string} chatId
 */
export function deleteChat(chatId) {
  let file = path.join(CHATS_DIR, `${chatId}.json`);
  if (fs.existsSync(file)) fs.unlinkSync(file);
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
  let allowedKeys = new Set(['name', 'adapter', 'model', 'provider', 'chatType', 'projectId', 'parentChatId']);

  for (let key of Object.keys(updates)) {
    if (!allowedKeys.has(key)) continue;
    let val = updates[key];
    // Reject template garbage (unresolved Symbiote bindings)
    if (typeof val === 'string' && val.includes('{{')) continue;
    chat[key] = val;
  }

  chat.updatedAt = Date.now();
  fs.writeFileSync(path.join(CHATS_DIR, `${chatId}.json`), JSON.stringify(chat, null, 2));
}

/**
 * Update session ID for a chat (for Gemini CLI session continuity).
 * @param {string} chatId
 * @param {string} sessionId
 */
export function updateChatSession(chatId, sessionId) {
  let chat = getChat(chatId);
  if (!chat) return;
  chat.sessionId = sessionId;
  chat.updatedAt = Date.now();
  fs.writeFileSync(path.join(CHATS_DIR, `${chatId}.json`), JSON.stringify(chat, null, 2));
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
  fs.writeFileSync(path.join(CHATS_DIR, `${chatId}.json`), JSON.stringify(chat, null, 2));
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
