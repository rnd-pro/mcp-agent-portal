/**
 * StateGraph — Event-sourced state engine for Agent Portal.
 *
 * Architecture:
 * - In-memory graph (RAM) — single source of truth at runtime
 * - WAL (Write-Ahead Log) — async group commit for crash recovery
 * - Monotonic versioning — every commit gets a global sequence number
 * - Ring buffer — last N patches cached for delta sync on reconnect
 * - Snapshot compaction — periodic full dump, WAL truncation
 *
 * Designed for 10+ concurrent agent streams.
 * Node.js single-threaded event loop provides natural serialization.
 *
 * @module state-graph
 */
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { EventEmitter } from 'node:events';

// ── Paths ────────────────────────────────────────────────
const STATE_DIR = path.join(os.homedir(), '.agent-portal');
const SNAPSHOT_PATH = path.join(STATE_DIR, 'agent-portal-state.json');
const WAL_PATH = path.join(STATE_DIR, 'agent-portal.wal');
const OLD_CONFIG_PATH = path.join(STATE_DIR, 'agent-portal.json');
const CHATS_DIR = path.join(STATE_DIR, 'agent-portal-chats');


// ── Tuning ───────────────────────────────────────────────
const RING_BUFFER_SIZE = 2000;        // patches kept in memory for delta sync
const SNAPSHOT_INTERVAL = 5000;       // compact WAL every N commits
const GROUP_COMMIT_MS = 50;           // async WAL flush interval (ms)
const MAX_WS_QUEUE = 500;             // backpressure: disconnect slow clients

/**
 * Default state shape — guaranteed on first boot.
 * @returns {object}
 */
function defaultState() {
  return {
    _v: 0,
    _ts: 0,
    ui: {
      activeProjectId: null,
      activeChatId: null,
      activeSection: 'dashboard',
      sidebar: { collapsed: true, width: 220, sectionConfig: null },
      preferences: { graphStyle: 'pcb', chatNavCollapsed: false },
    },
    projects: {},
    chats: {},
    tasks: {},
    layouts: {},
    settings: {
      mcpServers: {},
      globalCli: {},
      providerModels: {},
      adapters: {},
    },
  };
}

// ── Op Helpers ───────────────────────────────────────────

/**
 * Traverse path, creating intermediate objects as needed.
 * @param {object} root
 * @param {string[]} parts
 * @returns {[object, string]} parent node and final key
 */
function _traverse(root, parts) {
  let node = root;
  for (let i = 0; i < parts.length - 1; i++) {
    let key = parts[i];
    if (node[key] == null || typeof node[key] !== 'object') {
      node[key] = {};
    }
    node = node[key];
  }
  return [node, parts[parts.length - 1]];
}

/**
 * Get value at slash-delimited path.
 * @param {object} root
 * @param {string} p
 * @returns {any}
 */
function _getPath(root, p) {
  if (!p) return root;
  let parts = p.split('/');
  let node = root;
  for (let part of parts) {
    if (node == null || typeof node !== 'object') return undefined;
    node = node[part];
  }
  return node;
}

/**
 * Apply a single op to state.
 * @param {object} state
 * @param {{ op: string, path: string, value?: any }} op
 */
function _applyOp(state, op) {
  let parts = op.path.split('/');
  switch (op.op) {
    case 'set': {
      let [parent, key] = _traverse(state, parts);
      parent[key] = op.value;
      break;
    }
    case 'merge': {
      let [parent, key] = _traverse(state, parts);
      let current = parent[key];
      if (current && typeof current === 'object' && !Array.isArray(current)) {
        parent[key] = { ...current, ...op.value };
      } else {
        parent[key] = op.value;
      }
      break;
    }
    case 'delete': {
      let [parent, key] = _traverse(state, parts);
      delete parent[key];
      break;
    }
    case 'push': {
      let [parent, key] = _traverse(state, parts);
      if (!Array.isArray(parent[key])) parent[key] = [];
      parent[key].push(op.value);
      break;
    }
    default:
      console.warn(`[StateGraph] Unknown op: ${op.op}`);
  }
}


// ═════════════════════════════════════════════════════════
//  StateGraph Engine
// ═════════════════════════════════════════════════════════

export class StateGraph extends EventEmitter {
  /**
   * @param {object} [opts]
   * @param {string} [opts.snapshotPath]
   * @param {string} [opts.walPath]
   */
  constructor(opts = {}) {
    super();
    this._snapshotPath = opts.snapshotPath || SNAPSHOT_PATH;
    this._walPath = opts.walPath || WAL_PATH;
    this._state = defaultState();
    this._version = 0;

    // ── Ring Buffer for delta sync ──
    /** @type {Array<{ v: number, ts: number, source: string, ops: object[] }>} */
    this._ring = [];
    this._ringStart = 0; // oldest version in ring

    // ── Async WAL Group Commit ──
    // lines pending disk write
    /** @type {Array<string>} */
    this._walQueue = [];
    this._walTimer = null;
    this._walFlushing = false;

    // ── Snapshot compaction tracking ──
    this._commitsSinceSnapshot = 0;
    this._snapshotVersion = 0;
  }

  // ── Public Read API ────────────────────────────────────

  // Current monotonic version.
  get version() { return this._version; }

  /**
   * Read value at path.
   * @param {string} p — slash-delimited, e.g. 'ui/activeProjectId'
   * @returns {any}
   */
  get(p) {
    return _getPath(this._state, p);
  }

  /**
   * Full state snapshot (deep clone) with version.
   * @returns {{ state: object, v: number }}
   */
  getSnapshot() {
    return {
      state: JSON.parse(JSON.stringify(this._state)),
      v: this._version,
    };
  }

  /**
   * Get patches since version N for delta sync.
   * Returns null if version is too old (caller should request full snapshot).
   * @param {number} sinceVersion
   * @returns {Array<{ v: number, ops: object[] }> | null}
   */
  getPatches(sinceVersion) {
    if (sinceVersion >= this._version) return [];
    if (this._ring.length === 0) return null;

    let oldest = this._ring[0].v;
    if (sinceVersion < oldest - 1) return null; // too old, need full snapshot

    let patches = [];
    for (let entry of this._ring) {
      if (entry.v > sinceVersion) {
        patches.push({ v: entry.v, ops: entry.ops });
      }
    }
    return patches;
  }

  // ── Public Write API ───────────────────────────────────

  /**
   * Commit a batch of operations atomically.
   * This is the ONLY way to mutate state.
   *
   * @param {Array<{ op: string, path: string, value?: any }>} ops
   * @param {string} [source='unknown'] — who made this mutation (for audit)
   * @returns {number} assigned version number
   */
  commit(ops, source = 'unknown') {
    if (!Array.isArray(ops) || ops.length === 0) return this._version;

    // Validate ops
    for (let op of ops) {
      if (!op.path || typeof op.path !== 'string') {
        throw new Error(`Invalid op: missing path`);
      }
      if (!op.op || typeof op.op !== 'string') {
        throw new Error(`Invalid op: missing op type`);
      }
      // Block mutations to internal fields
      if (op.path === '_v' || op.path === '_ts') {
        throw new Error(`Cannot mutate internal field: ${op.path}`);
      }
    }

    // 1. Increment version
    this._version++;
    let ts = Date.now();

    // 2. Apply to in-memory state (atomic — all ops or none)
    for (let op of ops) {
      _applyOp(this._state, op);
    }
    this._state._v = this._version;
    this._state._ts = ts;

    // 3. Create WAL entry
    let entry = { v: this._version, ts, source, ops };

    // 4. Push to ring buffer (delta sync cache)
    this._ring.push(entry);
    while (this._ring.length > RING_BUFFER_SIZE) {
      this._ring.shift();
    }

    // 5. Queue for async WAL write
    this._walQueue.push(JSON.stringify(entry));
    this._scheduleWalFlush();

    // 6. Track for snapshot compaction
    this._commitsSinceSnapshot++;
    if (this._commitsSinceSnapshot >= SNAPSHOT_INTERVAL) {
      this._writeSnapshot();
    }

    // 7. Emit for WS broadcast (synchronous — UI gets update instantly)
    this.emit('commit', { v: this._version, ops, source });

    return this._version;
  }

  // ── Convenience write helpers ──────────────────────────

  /**
   * Shorthand for single set operation.
   * @param {string} p
   * @param {any} value
   * @param {string} [source]
   * @returns {number}
   */
  set(p, value, source) {
    return this.commit([{ op: 'set', path: p, value }], source);
  }

  /**
   * Shorthand for single merge operation.
   * @param {string} p
   * @param {object} value
   * @param {string} [source]
   * @returns {number}
   */
  merge(p, value, source) {
    return this.commit([{ op: 'merge', path: p, value }], source);
  }

  /**
   * Shorthand for single delete operation.
   * @param {string} p
   * @param {string} [source]
   * @returns {number}
   */
  del(p, source) {
    return this.commit([{ op: 'delete', path: p }], source);
  }

  // ── Persistence: Load ──────────────────────────────────

   // Load state from snapshot + replay WAL.
   // Call once on startup.
  load() {
    let dir = path.dirname(this._snapshotPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    let snapshotLoaded = false;



    // 1. Try loading snapshot
    if (fs.existsSync(this._snapshotPath)) {
      try {
        let raw = fs.readFileSync(this._snapshotPath, 'utf8');
        let data = JSON.parse(raw);
        this._state = this._deepMerge(defaultState(), data);
        this._version = data._v || 0;
        this._snapshotVersion = this._version;
        snapshotLoaded = true;
      } catch (err) {
        console.error('[StateGraph] Snapshot load failed:', err.message);
      }
    }

    // 2. Replay WAL entries
    if (fs.existsSync(this._walPath)) {
      try {
        let lines = fs.readFileSync(this._walPath, 'utf8').split('\n').filter(Boolean);
        let replayed = 0;
        for (let line of lines) {
          try {
            let entry = JSON.parse(line);
            if (entry.v > this._version) {
              for (let op of entry.ops) _applyOp(this._state, op);
              this._version = entry.v;
              this._state._v = entry.v;
              this._state._ts = entry.ts;
              // Also populate ring buffer for immediate delta sync
              this._ring.push(entry);
              replayed++;
            }
          } catch { /* skip corrupt line */ }
        }
        if (replayed > 0) {
          console.log(`[StateGraph] Replayed ${replayed} WAL entries → v${this._version}`);
        }
      } catch (err) {
        console.error('[StateGraph] WAL replay failed:', err.message);
      }
    }

    // 3. Migrate from old config if no snapshot exists
    if (!snapshotLoaded && this._version === 0 && fs.existsSync(OLD_CONFIG_PATH)) {
      console.log('[StateGraph] Migrating from agent-portal.json...');
      this._migrateFromOldConfig();
      this._writeSnapshotSync();
    }

    // Trim ring buffer
    while (this._ring.length > RING_BUFFER_SIZE) this._ring.shift();

    // 4. Cleanup stale tasks — running tasks from a previous server lifecycle
    //    Their processes are dead after restart. Mark as 'lost'.
    let tasks = this._state.tasks || {};
    let cleaned = 0;
    for (let [id, task] of Object.entries(tasks)) {
      if (task && task.status === 'running') {
        tasks[id] = { ...task, status: 'lost', error: 'Server restarted', completedAt: Date.now() };
        cleaned++;
      }
    }
    if (cleaned > 0) {
      this._version++;
      this._state._v = this._version;
      console.log(`[StateGraph] Cleaned ${cleaned} stale running task(s)`);
    }

    console.log(`[StateGraph] Ready — v${this._version}, ${Object.keys(this._state.projects || {}).length} projects, ${Object.keys(this._state.chats || {}).length} chats`);
  }

  // ── Persistence: WAL (Async Group Commit) ──────────────

  // Schedule async WAL flush (group commit).
  _scheduleWalFlush() {
    if (this._walTimer || this._walFlushing) return;
    this._walTimer = setTimeout(() => this._flushWal(), GROUP_COMMIT_MS);
    this._walTimer.unref(); // Don't keep process alive for WAL flush
  }

  // Flush pending WAL entries to disk (async).
  async _flushWal() {
    this._walTimer = null;
    if (this._walQueue.length === 0 || this._walFlushing) return;

    this._walFlushing = true;
    let batch = this._walQueue.splice(0);

    try {
      let dir = path.dirname(this._walPath);
      await fsp.mkdir(dir, { recursive: true }).catch(() => {});
      await fsp.appendFile(this._walPath, batch.join('\n') + '\n');
    } catch (err) {
      console.error('[StateGraph] WAL write failed:', err.message);
      // Re-queue failed entries
      this._walQueue.unshift(...batch);
    } finally {
      this._walFlushing = false;
      // If more entries arrived during flush, schedule again
      if (this._walQueue.length > 0) this._scheduleWalFlush();
    }
  }

  // ── Persistence: Snapshot Compaction ────────────────────

  // Async snapshot write + WAL truncation.
  async _writeSnapshot() {
    this._commitsSinceSnapshot = 0;
    let snap = JSON.stringify(this._state, null, 2);
    let v = this._version;

    try {
      // Flush pending WAL first
      if (this._walQueue.length > 0) {
        let batch = this._walQueue.splice(0);
        await fsp.appendFile(this._walPath, batch.join('\n') + '\n');
      }

      // Write snapshot atomically (write to tmp, then rename)
      let tmpPath = this._snapshotPath + '.tmp';
      await fsp.writeFile(tmpPath, snap);
      await fsp.rename(tmpPath, this._snapshotPath);

      // Truncate WAL (all entries are now in snapshot)
      await fsp.writeFile(this._walPath, '');

      this._snapshotVersion = v;
      console.log(`[StateGraph] Snapshot v${v} written, WAL truncated`);
    } catch (err) {
      console.error('[StateGraph] Snapshot write failed:', err.message);
    }
  }

  // Synchronous snapshot write (for process exit).
  _writeSnapshotSync() {
    try {
      // Flush pending WAL synchronously
      if (this._walQueue.length > 0) {
        fs.appendFileSync(this._walPath, this._walQueue.join('\n') + '\n');
        this._walQueue = [];
      }

      let tmpPath = this._snapshotPath + '.tmp';
      fs.writeFileSync(tmpPath, JSON.stringify(this._state, null, 2));
      fs.renameSync(tmpPath, this._snapshotPath);
      fs.writeFileSync(this._walPath, '');
      this._snapshotVersion = this._version;
      this._commitsSinceSnapshot = 0;
    } catch (err) {
      console.error('[StateGraph] Sync snapshot failed:', err.message);
    }
  }

   // Flush all pending writes and snapshot. Call on process exit.
  flush() {
    if (this._walTimer) {
      clearTimeout(this._walTimer);
      this._walTimer = null;
    }
    this._writeSnapshotSync();
  }

  // ── Migration ──────────────────────────────────────────

  // Migrate from old config-store format.
  _migrateFromOldConfig() {
    try {
      let old = JSON.parse(fs.readFileSync(OLD_CONFIG_PATH, 'utf8'));
      let ops = [];

      // Settings
      if (old.mcpServers) ops.push({ op: 'set', path: 'settings/mcpServers', value: old.mcpServers });
      if (old.globalCli) ops.push({ op: 'set', path: 'settings/globalCli', value: old.globalCli });
      if (old.providerModels) ops.push({ op: 'set', path: 'settings/providerModels', value: old.providerModels });
      if (old.adapters) ops.push({ op: 'set', path: 'settings/adapters', value: old.adapters });

      // Projects
      let projects = old.projects || [];
      let activeIds = old.activeProjectIds || [];
      for (let proj of projects) {
        ops.push({ op: 'set', path: `projects/${proj.id}`, value: {
          name: proj.name,
          path: proj.path,
          color: proj.color || null,
          lastOpened: proj.lastOpened || Date.now(),
          open: activeIds.includes(proj.id),
          cli: proj.cli || null,
        }});
      }

      // UI
      if (activeIds[0]) {
        ops.push({ op: 'set', path: 'ui/activeProjectId', value: activeIds[0] });
      }

      // Chats (metadata only)
      if (fs.existsSync(CHATS_DIR)) {
        let files = fs.readdirSync(CHATS_DIR).filter(f => f.endsWith('.json'));
        for (let f of files) {
          try {
            let data = JSON.parse(fs.readFileSync(path.join(CHATS_DIR, f), 'utf8'));
            ops.push({ op: 'set', path: `chats/${data.id}`, value: {
              name: data.name || 'Untitled',
              projectId: data.projectId || null,
              adapter: data.adapter || 'pool',
              model: data.model || null,
              messageCount: data.messages?.length || 0,
              lastMessage: data.messages?.length ? (data.messages[data.messages.length - 1].text || '').slice(0, 80) : '',
              updatedAt: data.updatedAt || 0,
              createdAt: data.createdAt || 0,
            }});
          } catch { /* skip */ }
        }
      }

      if (ops.length > 0) {
        this.commit(ops, 'migration');
        console.log(`[StateGraph] Migrated: ${projects.length} projects, ${Object.keys(this._state.chats || {}).length} chats`);
      }
    } catch (err) {
      console.error('[StateGraph] Migration failed:', err.message);
    }
  }

  // ── Helpers ────────────────────────────────────────────

  // Deep merge (target shape preserved, source values applied).
  _deepMerge(target, source) {
    let result = { ...target };
    for (let [key, val] of Object.entries(source)) {
      if (val && typeof val === 'object' && !Array.isArray(val) &&
          result[key] && typeof result[key] === 'object' && !Array.isArray(result[key])) {
        result[key] = this._deepMerge(result[key], val);
      } else {
        result[key] = val;
      }
    }
    return result;
  }

  // ── Project Helpers ────────────────────────────────────

  /**
   * Add or update a project.
   * @param {{ name?: string, path: string, color?: string, cli?: object }} proj
   * @param {string} [source]
   * @returns {{ id: string }}
   */
  addProject(proj, source = 'system') {
    // Find existing by path
    let projects = this._state.projects || {};
    for (let [id, p] of Object.entries(projects)) {
      if (p.path === proj.path) {
        this.commit([{ op: 'merge', path: `projects/${id}`, value: {
          name: proj.name || p.name,
          lastOpened: Date.now(),
          ...(proj.color ? { color: proj.color } : {}),
          ...(proj.cli ? { cli: { ...p.cli, ...proj.cli } } : {}),
        }}], source);
        return { id };
      }
    }

    let id = crypto.randomUUID().slice(0, 8);
    this.commit([{ op: 'set', path: `projects/${id}`, value: {
      name: proj.name || path.basename(proj.path),
      path: proj.path,
      color: proj.color || `hsl(${Math.floor(Math.random() * 360)}, 65%, 55%)`,
      lastOpened: Date.now(),
      open: false,
      cli: proj.cli || null,
    }}], source);
    return { id };
  }

  // Get sorted project history list.
  getProjectHistory() {
    return Object.entries(this._state.projects || {}).map(([id, p]) => ({ id, ...p }))
      .sort((a, b) => (b.lastOpened || 0) - (a.lastOpened || 0));
  }

  // Get IDs of open project tabs.
  getActiveProjectIds() {
    return Object.entries(this._state.projects || {})
      .filter(([, p]) => p.open)
      .map(([id]) => id);
  }

  // ── Chat Helpers ───────────────────────────────────────
  // Chat messages stay in individual files (can be large).
  // Graph stores metadata only.

  // List chat metadata (sorted by updatedAt).
  listChats() {
    return Object.entries(this._state.chats || {}).map(([id, c]) => ({ id, ...c }))
      .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  }

  /**
   * Create a new chat.
   * @param {{ projectId?: string, name?: string, adapter?: string, model?: string }} opts
   * @param {string} [source]
   * @returns {{ id: string }}
   */
  createChat(opts = {}, source = 'system') {
    let id = crypto.randomUUID().slice(0, 12);
    let now = Date.now();

    // Metadata in graph
    this.commit([{ op: 'set', path: `chats/${id}`, value: {
      name: opts.name || 'New Chat',
      projectId: opts.projectId || null,
      adapter: opts.adapter || 'pool',
      model: opts.model || null,
      messageCount: 0,
      lastMessage: '',
      updatedAt: now,
      createdAt: now,
    }}], source);

    // Full chat data in file
    let chatData = {
      id,
      projectId: opts.projectId || null,
      name: opts.name || 'New Chat',
      adapter: opts.adapter || 'pool',
      model: opts.model || null,
      messages: [],
      createdAt: now,
      updatedAt: now,
    };
    if (!fs.existsSync(CHATS_DIR)) fs.mkdirSync(CHATS_DIR, { recursive: true });
    fs.writeFileSync(path.join(CHATS_DIR, `${id}.json`), JSON.stringify(chatData, null, 2));

    return { id };
  }

  // Get full chat data (with messages) from file.
  getChat(chatId) {
    let file = path.join(CHATS_DIR, `${chatId}.json`);
    if (!fs.existsSync(file)) return null;
    try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
    catch { return null; }
  }

  // Append message + update metadata.
  appendChatMessage(chatId, msg) {
    let chat = this.getChat(chatId);
    if (!chat) return;
    chat.messages.push({ ...msg, ts: Date.now() });
    chat.updatedAt = Date.now();
    fs.writeFileSync(path.join(CHATS_DIR, `${chatId}.json`), JSON.stringify(chat, null, 2));

    this.commit([{ op: 'merge', path: `chats/${chatId}`, value: {
      messageCount: chat.messages.length,
      lastMessage: (msg.text || '').slice(0, 80),
      updatedAt: chat.updatedAt,
    }}], 'chat');
  }

  // Replace all messages in a chat.
  replaceChatMessages(chatId, messages) {
    let chat = this.getChat(chatId);
    if (!chat) return;
    chat.messages = messages;
    chat.updatedAt = Date.now();
    fs.writeFileSync(path.join(CHATS_DIR, `${chatId}.json`), JSON.stringify(chat, null, 2));

    this.commit([{ op: 'merge', path: `chats/${chatId}`, value: {
      messageCount: messages.length,
      lastMessage: messages.length ? (messages[messages.length - 1].text || '').slice(0, 80) : '',
      updatedAt: chat.updatedAt,
    }}], 'chat');
  }

  // Delete a chat (graph + file).
  deleteChat(chatId, source = 'system') {
    this.commit([{ op: 'delete', path: `chats/${chatId}` }], source);
    let file = path.join(CHATS_DIR, `${chatId}.json`);
    if (fs.existsSync(file)) fs.unlinkSync(file);
  }

  // Update chat metadata fields.
  updateChat(chatId, updates, source = 'system') {
    let allowed = new Set(['name', 'adapter', 'model', 'provider', 'chatType', 'projectId']);
    let filtered = {};
    for (let [k, v] of Object.entries(updates)) {
      if (!allowed.has(k)) continue;
      if (typeof v === 'string' && v.includes('{{')) continue;
      filtered[k] = v;
    }
    if (Object.keys(filtered).length === 0) return;
    filtered.updatedAt = Date.now();
    this.commit([{ op: 'merge', path: `chats/${chatId}`, value: filtered }], source);

    // Also update file
    let chat = this.getChat(chatId);
    if (chat) {
      Object.assign(chat, filtered);
      fs.writeFileSync(path.join(CHATS_DIR, `${chatId}.json`), JSON.stringify(chat, null, 2));
    }
  }

  // Update session ID for a chat.
  updateChatSession(chatId, sessionId) {
    let chat = this.getChat(chatId);
    if (!chat) return;
    chat.sessionId = sessionId;
    chat.updatedAt = Date.now();
    fs.writeFileSync(path.join(CHATS_DIR, `${chatId}.json`), JSON.stringify(chat, null, 2));
  }

  // Set or clear pending task ID.
  updateChatTask(chatId, taskId) {
    let chat = this.getChat(chatId);
    if (!chat) return;
    if (taskId) chat.pendingTaskId = taskId;
    else delete chat.pendingTaskId;
    chat.updatedAt = Date.now();
    fs.writeFileSync(path.join(CHATS_DIR, `${chatId}.json`), JSON.stringify(chat, null, 2));
  }

  // ── Project Mutation Helpers ───────────────────────────

  // Remove a project from the graph.
  removeProject(id, source = 'system') {
    this.del(`projects/${id}`, source);
  }

  // Update project fields (merge).
  updateProject(id, updates, source = 'system') {
    if (Object.keys(updates).length === 0) return;
    updates.updatedAt = Date.now();
    this.merge(`projects/${id}`, updates, source);
  }

  // Toggle project open/close tab.
  setProjectOpen(id, open, source = 'system') {
    this.merge(`projects/${id}`, { open }, source);
  }

  // ── Settings Helpers ───────────────────────────────────

  // Read all settings.
  getSettings() {
    return this._state.settings || {};
  }

  // Merge settings (shallow).
  setSettings(updates, source = 'system') {
    this.merge('settings', updates, source);
  }

  // Get provider models for a specific provider.
  getProviderModels(provider) {
    return this._state.settings?.providerModels?.[provider] || [];
  }

  // Get all provider model configs.
  getAllProviderModels() {
    return this._state.settings?.providerModels || {};
  }

  // Set models for a provider.
  setProviderModels(provider, models, source = 'system') {
    let pm = { ...(this._state.settings?.providerModels || {}), [provider]: models };
    this.merge('settings', { providerModels: pm }, source);
  }

  // Read global CLI config.
  getGlobalCli() {
    return this._state.settings?.globalCli || {};
  }

  // Set global CLI config.
  setGlobalCli(cli, source = 'system') {
    this.merge('settings', { globalCli: cli }, source);
  }
}


// ═════════════════════════════════════════════════════════
//  Singleton + Backpressure Constants Export
// ═════════════════════════════════════════════════════════

/** @type {StateGraph|null} */
let _instance = null;

/**
 * Get or create the global StateGraph instance.
 * @returns {StateGraph}
 */
export function getStateGraph() {
  if (!_instance) {
    _instance = new StateGraph();
    _instance.load();

    process.on('beforeExit', () => _instance.flush());
    process.on('SIGINT', () => { _instance.flush(); process.exit(0); });
    process.on('SIGTERM', () => { _instance.flush(); process.exit(0); });
  }
  return _instance;
}

// Max WS queue size before disconnecting slow client.
export { MAX_WS_QUEUE };
