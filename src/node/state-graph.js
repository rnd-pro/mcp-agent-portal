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
import {
  normalizeChatGoalInput,
  normalizeChatGoalQueueDelivery,
  normalizeChatGoalQueueMessage,
  normalizeChatGoalQueueStatus,
  normalizeChatGoalStatus,
} from '../iso/chat-goals.js';
import { resolveChatCreationAgent } from '../iso/chat-orchestration.js';

// ── Paths ────────────────────────────────────────────────
const STATE_DIR = process.env.PORTAL_STATE_DIR || path.join(os.homedir(), '.agent-portal');
const SNAPSHOT_PATH = process.env.PORTAL_STATE_PATH || path.join(STATE_DIR, 'agent-portal-state.json');
const WAL_PATH = process.env.PORTAL_WAL_PATH || path.join(STATE_DIR, 'agent-portal.wal');
const OLD_CONFIG_PATH = process.env.PORTAL_CONFIG_PATH || path.join(STATE_DIR, 'agent-portal.json');
const CHATS_DIR = process.env.PORTAL_CHATS_DIR || path.join(STATE_DIR, 'agent-portal-chats');


// ── Tuning ───────────────────────────────────────────────
const RING_BUFFER_SIZE = 2000;        // patches kept in memory for delta sync
const SNAPSHOT_INTERVAL = 5000;       // compact WAL every N commits
const GROUP_COMMIT_MS = 50;           // async WAL flush interval (ms)
const MAX_WS_QUEUE = 500;             // backpressure: disconnect slow clients
const CHAT_CACHE_LIMIT = 50;          // full chat files kept hot in memory
const CHAT_MESSAGE_PAGE_LIMIT = 100;
const CHAT_MESSAGE_PAGE_LIMIT_MAX = 500;

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
    goals: {},
    tasks: {},
    workflowBoards: {},
    workflowCards: {},
    workflowTransitions: {},
    workflowChecks: {},
    workflowRuns: {},
    workflowLeases: {},
    layouts: {},
    settings: {
      mcpServers: {},
      globalCli: {},
      providerModels: {},
      adapters: {},
    },
  };
}

function normalizeChatOrigin(origin) {
  if (origin === 'mcp') return 'mcp';
  if (origin === 'agent') return 'agent';
  return 'portal';
}

function metadataValue(value, fallback, defaultValue = null) {
  if (value !== undefined) return value;
  if (fallback !== undefined) return fallback;
  return defaultValue;
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

/** Versioned state graph with JSON Patch commit log and snapshot support. */
export class StateGraph extends EventEmitter {
  /**
   * @param {object} [opts]
   * @param {string} [opts.snapshotPath]
   * @param {string} [opts.walPath]
   * @param {string} [opts.chatsDir]
   * @param {number} [opts.chatCacheLimit]
   */
  constructor(opts = {}) {
    super();
    this._snapshotPath = opts.snapshotPath || SNAPSHOT_PATH;
    this._walPath = opts.walPath || WAL_PATH;
    this._chatsDir = opts.chatsDir || CHATS_DIR;
    this._oldConfigPath = opts.oldConfigPath || OLD_CONFIG_PATH;
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
    this._chatCache = new Map();
    this._chatCacheLimit = Number.isFinite(opts.chatCacheLimit) ? Math.max(0, Math.floor(opts.chatCacheLimit)) : CHAT_CACHE_LIMIT;
    this._chatFileQueue = Promise.resolve();
    this._dirtyChats = new Set();
    this._deletedChats = new Set();
    this._chatWriteSeq = new Map();

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
   * @param {{ durable?: boolean }} [opts] — when `durable`, the WAL entry is
   *        written synchronously with an fsync barrier before this call
   *        returns (durable-before-side-effect; e.g. admission before a spawn).
   *        Throws if the durable write fails, so the caller never proceeds on
   *        a commit that is not on stable storage.
   * @returns {number} assigned version number
   */
  commit(ops, source = 'unknown', opts = {}) {
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

    // 5. Persist the WAL entry — async group-commit by default, or a
    //    synchronous fsync barrier when the caller needs durability before a
    //    side effect (admission must be on stable storage before delegating).
    this._walQueue.push(JSON.stringify(entry));
    if (opts.durable) {
      this._flushWalDurable();
    } else {
      this._scheduleWalFlush();
    }

    // 6. Track for snapshot compaction
    this._commitsSinceSnapshot++;
    if (this._commitsSinceSnapshot >= SNAPSHOT_INTERVAL) {
      this._writeSnapshot();
    }

    // 7. Emit for WS broadcast (synchronous — UI gets update instantly)
    this.emit('commit', { v: this._version, ops, source });

    return this._version;
  }

  /**
   * Compare-and-set commit. Reads the monotonic epoch at `epochPath`; if it
   * equals `expectedEpoch`, applies `ops` AND bumps the epoch by one in the
   * SAME synchronous frame — Node's single thread makes the read→check→apply
   * atomic, there is no await between them. On mismatch nothing is written.
   *
   * With `{ durable: true }` the CAS and the fsync barrier fuse into one
   * indivisible step: the epoch bump and the durable WAL write land in a single
   * commit, never two. This is the epoch-fence for admission writes
   * (workflow scheduler v5 AD-2/AD-14): a stale-epoch holder writes nothing.
   *
   * @param {string} epochPath — slash path to the monotonic epoch counter
   * @param {number} expectedEpoch — the epoch the caller observed
   * @param {Array<{ op: string, path: string, value?: any }>} [ops]
   * @param {string} [source]
   * @param {{ durable?: boolean }} [opts]
   * @returns {{ ok: boolean, conflict: boolean, currentEpoch: number, version: number, epoch?: number }}
   */
  commitCAS(epochPath, expectedEpoch, ops = [], source = 'unknown', opts = {}) {
    if (!epochPath || typeof epochPath !== 'string') {
      throw new Error('commitCAS: missing epochPath');
    }
    let raw = _getPath(this._state, epochPath);
    let currentEpoch = (raw === undefined || raw === null) ? 0 : raw;
    if (currentEpoch !== expectedEpoch) {
      return { ok: false, conflict: true, currentEpoch, version: this._version };
    }
    let nextEpoch = currentEpoch + 1;
    let allOps = [...ops, { op: 'set', path: epochPath, value: nextEpoch }];
    let version = this.commit(allOps, source, opts);
    return { ok: true, conflict: false, currentEpoch, epoch: nextEpoch, version };
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

    // 2. Replay WAL entries — version-sorted, so replay is order-independent.
    //    Durable synchronous writes and async group-commits append to the same
    //    WAL and can interleave on disk; sorting by version keeps recovery
    //    correct regardless of physical order.
    if (fs.existsSync(this._walPath)) {
      try {
        let lines = fs.readFileSync(this._walPath, 'utf8').split('\n').filter(Boolean);
        let entries = [];
        for (let line of lines) {
          try { entries.push(JSON.parse(line)); }
          catch { /* skip corrupt line */ }
        }
        entries.sort((a, b) => (a.v || 0) - (b.v || 0));
        for (let entry of entries) {
          if (entry.v > this._version) {
            for (let op of entry.ops) _applyOp(this._state, op);
            this._version = entry.v;
            this._state._v = entry.v;
            this._state._ts = entry.ts;
            // Also populate ring buffer for immediate delta sync
            this._ring.push(entry);
          }
        }
      } catch (err) {
        console.error('[StateGraph] WAL replay failed:', err.message);
      }
    }

    // 3. Migrate from old config if no snapshot exists
    if (!snapshotLoaded && this._version === 0 && fs.existsSync(this._oldConfigPath)) {
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

        // Clear the pending task from its chat
        let chats = this._state.chats || {};
        for (let [chatId, chat] of Object.entries(chats)) {
          if (chat.pendingTaskId === id) {
            chat.pendingTaskId = null;
            chat.lastTaskStatus = 'error';
            // Update the FULL chat file (not just metadata — that would erase messages)
            let chatFile = path.join(this._chatsDir, `${chatId}.json`);
            if (fs.existsSync(chatFile)) {
              try {
                let fullChat = JSON.parse(fs.readFileSync(chatFile, 'utf8'));
                fullChat.pendingTaskId = null;
                fullChat.lastTaskStatus = 'error';
                this._queueChatWrite(chatId, fullChat);
              } catch (e) { console.warn(`[StateGraph] Failed to update chat file ${chatId}:`, e.message); }
            }
          }
        }
      }
    }
    if (cleaned > 0) {
      this._version++;
      this._state._v = this._version;
    }
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

  // Synchronously flush pending WAL entries with an fsync barrier.
  // writeSync + fsyncSync forces the bytes to stable storage, not just the OS
  // page cache, so a hard crash cannot lose a durable commit. Replay is
  // version-sorted, so this may interleave on disk with the async group-commit
  // without breaking recovery.
  _flushWalDurable() {
    if (this._walTimer) {
      clearTimeout(this._walTimer);
      this._walTimer = null;
    }
    if (this._walQueue.length === 0) return;
    let batch = this._walQueue.splice(0);
    let dir = path.dirname(this._walPath);
    try {
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      let existedBefore = fs.existsSync(this._walPath);
      let fd = fs.openSync(this._walPath, 'a');
      try {
        fs.writeSync(fd, batch.join('\n') + '\n');
        fs.fsyncSync(fd);
      } finally {
        fs.closeSync(fd);
      }
      // On first creation the WAL's directory entry must also be durable, or a
      // crash can lose the whole file (fsync(fd) persists data + inode, not the
      // parent-directory link).
      if (!existedBefore) this._fsyncDir(dir);
    } catch (err) {
      // Re-queue and surface: a durable commit must never report success when
      // the bytes are not on disk.
      this._walQueue.unshift(...batch);
      throw new Error(`Durable WAL write failed: ${err.message}`);
    }
  }

  // Best-effort fsync of a directory entry (local filesystems only; directory
  // fsync is unsupported on some platforms/filesystems).
  _fsyncDir(dir) {
    let dfd;
    try {
      dfd = fs.openSync(dir, 'r');
      fs.fsyncSync(dfd);
    } catch { /* best-effort: not all platforms allow directory fsync */ }
    finally {
      if (dfd !== undefined) { try { fs.closeSync(dfd); } catch { /* ignore */ } }
    }
  }

  // ── Persistence: Snapshot Compaction ────────────────────

  // Async snapshot write + WAL truncation.
  async _writeSnapshot() {
    this._commitsSinceSnapshot = 0;
    let snap = JSON.stringify(this._state, null, 2);
    let v = this._version;

    try {
      let dir = path.dirname(this._snapshotPath);
      await fsp.mkdir(dir, { recursive: true }).catch(() => {});
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
    } catch (err) {
      console.error('[StateGraph] Snapshot write failed:', err.message);
    }
  }

  // Synchronous snapshot write (for process exit) with fsync barriers.
  _writeSnapshotSync() {
    try {
      let snapDir = path.dirname(this._snapshotPath);
      fs.mkdirSync(snapDir, { recursive: true });
      fs.mkdirSync(path.dirname(this._walPath), { recursive: true });
      // Flush pending WAL synchronously with an fsync barrier.
      if (this._walQueue.length > 0) {
        let wfd = fs.openSync(this._walPath, 'a');
        try {
          fs.writeSync(wfd, this._walQueue.join('\n') + '\n');
          fs.fsyncSync(wfd);
        } finally { fs.closeSync(wfd); }
        this._walQueue = [];
      }

      // Write the snapshot durably: tmp + fsync, atomic rename, fsync dir.
      let tmpPath = this._snapshotPath + '.tmp';
      let sfd = fs.openSync(tmpPath, 'w');
      try {
        fs.writeSync(sfd, JSON.stringify(this._state, null, 2));
        fs.fsyncSync(sfd);
      } finally { fs.closeSync(sfd); }
      fs.renameSync(tmpPath, this._snapshotPath);
      this._fsyncDir(snapDir);
      // WAL is now compacted into the snapshot.
      fs.writeFileSync(this._walPath, '');
      this._snapshotVersion = this._version;
      this._commitsSinceSnapshot = 0;
      this._flushChatFilesSync();
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

  async flushChatWrites() {
    await this._chatFileQueue;
  }

  // ── Migration ──────────────────────────────────────────

  // Migrate from old config-store format.
  _migrateFromOldConfig() {
    try {
      let old = JSON.parse(fs.readFileSync(this._oldConfigPath, 'utf8'));
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
      if (fs.existsSync(this._chatsDir)) {
        let files = fs.readdirSync(this._chatsDir).filter(f => f.endsWith('.json'));
        for (let f of files) {
          try {
            let data = JSON.parse(fs.readFileSync(path.join(this._chatsDir, f), 'utf8'));
            ops.push({ op: 'set', path: `chats/${data.id}`, value: {
              name: data.name || 'Untitled',
              projectId: data.projectId || null,
              parentChatId: data.parentChatId || null,
              adapter: data.adapter || 'pool',
              agent: data.agent || data.agent_slug || null,
              provider: data.provider || null,
              model: data.model || null,
              approval_mode: data.approval_mode || null,
              resource_group: data.resource_group || null,
              chatType: data.chatType || null,
              agentIcon: data.agentIcon || null,
              agentColor: data.agentColor || null,
              origin: normalizeChatOrigin(data.origin),
              messageCount: data.messages?.length || 0,
              lastMessage: data.messages?.length ? (data.messages[data.messages.length - 1].text || '').slice(0, 80) : '',
              updatedAt: data.updatedAt || 0,
              createdAt: data.createdAt || 0,
              pendingTaskId: data.pendingTaskId || null,
              activeGoalId: data.activeGoalId || null,
              goalIntentActive: Boolean(data.goalIntentActive),
              goalQueueMode: data.goalQueueMode || null,
            }});
          } catch { /* skip */ }
        }
      }

      if (ops.length > 0) {
        this.commit(ops, 'migration');
      }
    } catch (err) {
      console.error('[StateGraph] Migration failed:', err.message);
    }
  }

  // ── Helpers ────────────────────────────────────────────

  _cloneChat(chat) {
    return JSON.parse(JSON.stringify(chat));
  }

  _chatMetadata(chat = {}, fallback = {}) {
    let messages = Array.isArray(chat.messages) ? chat.messages : [];
    let lastMessage = messages.length
      ? String(messages[messages.length - 1].text || '').slice(0, 80)
      : fallback.lastMessage || '';
    return {
      name: chat.name ?? fallback.name ?? 'Untitled',
      projectId: metadataValue(chat.projectId, fallback.projectId),
      parentChatId: metadataValue(chat.parentChatId, fallback.parentChatId),
      adapter: metadataValue(chat.adapter, fallback.adapter, 'pool'),
      agent: chat.agent || chat.agent_slug || fallback.agent || null,
      provider: metadataValue(chat.provider, fallback.provider),
      model: metadataValue(chat.model, fallback.model),
      approval_mode: metadataValue(chat.approval_mode, fallback.approval_mode),
      resource_group: metadataValue(chat.resource_group, fallback.resource_group),
      chatType: metadataValue(chat.chatType, fallback.chatType),
      agentIcon: metadataValue(chat.agentIcon, fallback.agentIcon),
      agentColor: metadataValue(chat.agentColor, fallback.agentColor),
      origin: normalizeChatOrigin(chat.origin ?? fallback.origin),
      messageCount: messages.length || fallback.messageCount || 0,
      lastMessage,
      updatedAt: chat.updatedAt ?? fallback.updatedAt ?? 0,
      createdAt: chat.createdAt ?? fallback.createdAt ?? 0,
      pendingTaskId: metadataValue(chat.pendingTaskId, fallback.pendingTaskId),
      activeGoalId: metadataValue(chat.activeGoalId, fallback.activeGoalId),
      goalIntentActive: Boolean(metadataValue(chat.goalIntentActive, fallback.goalIntentActive, false)),
      goalQueueMode: metadataValue(chat.goalQueueMode, fallback.goalQueueMode),
      sessionId: metadataValue(chat.sessionId, fallback.sessionId),
    };
  }

  _completeChatMetadata(id, metadata = {}) {
    if (
      metadata.name
      && Object.prototype.hasOwnProperty.call(metadata, 'parentChatId')
      && Object.prototype.hasOwnProperty.call(metadata, 'agent')
      && Object.prototype.hasOwnProperty.call(metadata, 'origin')
    ) {
      return metadata;
    }
    let chat = this.getChat(id);
    return chat ? this._chatMetadata(chat, metadata) : metadata;
  }

  _rememberChat(chatId, chat) {
    if (this._chatCache.has(chatId)) this._chatCache.delete(chatId);
    this._chatCache.set(chatId, this._cloneChat(chat));
    this._trimChatCache();
  }

  _trimChatCache() {
    while (this._chatCache.size > this._chatCacheLimit) {
      let evicted = false;
      for (let chatId of this._chatCache.keys()) {
        if (this._dirtyChats.has(chatId)) continue;
        this._chatCache.delete(chatId);
        evicted = true;
        break;
      }
      if (!evicted) break;
    }
  }

  _queueChatWrite(chatId, chat) {
    this._deletedChats.delete(chatId);
    this._dirtyChats.add(chatId);
    let writeSeq = (this._chatWriteSeq.get(chatId) || 0) + 1;
    this._chatWriteSeq.set(chatId, writeSeq);
    this._rememberChat(chatId, chat);
    this._chatFileQueue = this._chatFileQueue.then(async () => {
      await fsp.mkdir(this._chatsDir, { recursive: true });
      let filePath = path.join(this._chatsDir, `${chatId}.json`);
      let tmpPath = path.join(this._chatsDir, `.${chatId}.${process.pid}.${Date.now()}.tmp`);
      await fsp.writeFile(tmpPath, JSON.stringify(chat, null, 2));
      await fsp.rename(tmpPath, filePath);
      if (this._chatWriteSeq.get(chatId) === writeSeq) {
        this._dirtyChats.delete(chatId);
        this._trimChatCache();
      }
    }).catch((err) => {
      console.warn(`[StateGraph] Failed to write chat file ${chatId}:`, err.message);
    });
  }

  _queueChatDelete(chatId) {
    this._chatCache.delete(chatId);
    this._dirtyChats.delete(chatId);
    this._deletedChats.add(chatId);
    this._chatFileQueue = this._chatFileQueue.then(async () => {
      await fsp.rm(path.join(this._chatsDir, `${chatId}.json`), { force: true });
    }).catch((err) => {
      console.warn(`[StateGraph] Failed to delete chat file ${chatId}:`, err.message);
    });
  }

  _flushChatFilesSync() {
    try {
      if (!fs.existsSync(this._chatsDir)) fs.mkdirSync(this._chatsDir, { recursive: true });
      for (let chatId of this._dirtyChats) {
        let chat = this._chatCache.get(chatId);
        if (!chat) continue;
        fs.writeFileSync(path.join(this._chatsDir, `${chatId}.json`), JSON.stringify(chat, null, 2));
      }
      for (let chatId of this._deletedChats) {
        let file = path.join(this._chatsDir, `${chatId}.json`);
        if (fs.existsSync(file)) fs.unlinkSync(file);
      }
      this._dirtyChats.clear();
      this._chatWriteSeq.clear();
      this._trimChatCache();
      this._deletedChats.clear();
    } catch (err) {
      console.warn('[StateGraph] Failed to flush chat files:', err.message);
    }
  }

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
    return Object.entries(this._state.chats || {})
      .map(([id, c]) => ({ id, ...this._completeChatMetadata(id, c) }))
      .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  }

  /**
   * Create a new chat.
   * @param {Object|{ projectId?: string, name?: string, adapter?: string, model?: string, provider?: string, agent?: string, agent_slug?: string, approval_mode?: string, resource_group?: string, chatType?: string }} opts
   * @param {string} [source]
   * @returns {{ id: string }}
   */
  createChat(opts = {}, source = 'system') {
    let id = crypto.randomUUID().slice(0, 12);
    let now = Date.now();
    let origin = normalizeChatOrigin(opts.origin || source);
    let agent = resolveChatCreationAgent(opts);

    // Metadata in graph
    this.commit([{ op: 'set', path: `chats/${id}`, value: {
      name: opts.name || 'New Chat',
      projectId: opts.projectId || null,
      parentChatId: opts.parentChatId || null,
      adapter: opts.adapter || 'pool',
      agent,
      provider: opts.provider || null,
      model: opts.model || (opts.adapter === 'antigravity' ? 'default' : opts.adapter === 'opencode' ? 'deepseek/deepseek-v4-pro' : null),
      approval_mode: opts.approval_mode || null,
      resource_group: opts.resource_group || null,
      chatType: opts.chatType || null,
      agentIcon: opts.agentIcon || null,
      agentColor: opts.agentColor || null,
      origin,
      messageCount: 0,
      lastMessage: '',
      updatedAt: now,
      createdAt: now,
      pendingTaskId: null,
      activeGoalId: opts.activeGoalId || null,
      goalIntentActive: Boolean(opts.goalIntentActive),
      goalQueueMode: opts.goalQueueMode || null,
    }}], source);

    // Full chat data in file
    let chatData = {
      id,
      projectId: opts.projectId || null,
      parentChatId: opts.parentChatId || null,
      name: opts.name || 'New Chat',
      adapter: opts.adapter || 'pool',
      agent,
      provider: opts.provider || null,
      model: opts.model || (opts.adapter === 'antigravity' ? 'default' : opts.adapter === 'opencode' ? 'deepseek/deepseek-v4-pro' : null),
      approval_mode: opts.approval_mode || null,
      resource_group: opts.resource_group || null,
      chatType: opts.chatType || null,
      agentIcon: opts.agentIcon || null,
      agentColor: opts.agentColor || null,
      origin,
      messages: [],
      createdAt: now,
      updatedAt: now,
      activeGoalId: opts.activeGoalId || null,
      goalIntentActive: Boolean(opts.goalIntentActive),
      goalQueueMode: opts.goalQueueMode || null,
    };
    this._queueChatWrite(id, chatData);

    return { id };
  }

  // Get full chat data (with messages) from file.
  getChat(chatId) {
    if (this._deletedChats.has(chatId)) return null;
    if (this._chatCache.has(chatId)) {
      let chat = this._chatCache.get(chatId);
      this._chatCache.delete(chatId);
      this._chatCache.set(chatId, chat);
      return this._cloneChat(chat);
    }
    let file = path.join(this._chatsDir, `${chatId}.json`);
    if (!fs.existsSync(file)) return null;
    try {
      let chat = JSON.parse(fs.readFileSync(file, 'utf8'));
      this._rememberChat(chatId, chat);
      return this._cloneChat(chat);
    }
    catch { return null; }
  }

  getChatMessagePage(chatId, opts = {}) {
    if (this._deletedChats.has(chatId)) return null;
    let chat = this._chatCache.get(chatId);
    if (!chat) {
      let file = path.join(this._chatsDir, `${chatId}.json`);
      if (!fs.existsSync(file)) return null;
      try {
        chat = JSON.parse(fs.readFileSync(file, 'utf8'));
      } catch {
        return null;
      }
    }
    let messages = Array.isArray(chat.messages) ? chat.messages : [];
    let total = messages.length;
    let rawLimit = Number(opts.limit);
    let limit = Number.isFinite(rawLimit) && rawLimit > 0
      ? Math.min(CHAT_MESSAGE_PAGE_LIMIT_MAX, Math.floor(rawLimit))
      : CHAT_MESSAGE_PAGE_LIMIT;
    let start = Math.max(0, total - limit);
    let end = total;

    let before = Number(opts.before);
    let offset = Number(opts.offset);
    if (Number.isFinite(before)) {
      end = Math.max(0, Math.min(total, Math.floor(before)));
      start = Math.max(0, end - limit);
    } else if (Number.isFinite(offset)) {
      start = Math.max(0, Math.min(total, Math.floor(offset)));
      end = Math.max(start, Math.min(total, start + limit));
    }

    return {
      chatId,
      total,
      start,
      end,
      limit,
      hasBefore: start > 0,
      hasAfter: end < total,
      messages: JSON.parse(JSON.stringify(messages.slice(start, end))),
    };
  }

  // Append message + update metadata.
  appendChatMessage(chatId, msg) {
    let chat = this.getChat(chatId);
    if (!chat) return;
    chat.messages.push({ ...msg, ts: Date.now() });
    chat.updatedAt = Date.now();
    this._queueChatWrite(chatId, chat);

    this.commit([{
      op: 'merge',
      path: `chats/${chatId}`,
      value: this._chatMetadata(chat, this.get(`chats/${chatId}`) || {}),
    }], 'chat');
  }

  // Replace all messages in a chat.
  replaceChatMessages(chatId, messages) {
    let chat = this.getChat(chatId);
    if (!chat) return;
    chat.messages = messages;
    chat.updatedAt = Date.now();
    this._queueChatWrite(chatId, chat);

    this.commit([{
      op: 'merge',
      path: `chats/${chatId}`,
      value: this._chatMetadata(chat, this.get(`chats/${chatId}`) || {}),
    }], 'chat');
  }

  appendChatProjectTransactions(chatId, transactions) {
    let chat = this.getChat(chatId);
    if (!chat || !Array.isArray(transactions) || transactions.length === 0) return [];

    let existing = Array.isArray(chat.projectTransactions) ? chat.projectTransactions : [];
    let seen = new Set(existing.map((transaction) => `${transaction.targetProject || ''}:${transaction.id}`));
    let nextTransactions = [];

    for (let transaction of transactions) {
      let key = `${transaction.targetProject || ''}:${transaction.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      nextTransactions.push(transaction);
    }

    if (nextTransactions.length === 0) return [];

    chat.projectTransactions = [...existing, ...nextTransactions];
    chat.updatedAt = Date.now();
    this._queueChatWrite(chatId, chat);

    this.commit([{ op: 'merge', path: `chats/${chatId}`, value: {
      projectTransactionCount: chat.projectTransactions.length,
      updatedAt: chat.updatedAt,
    }}], 'chat');

    return nextTransactions;
  }

  _mergeChatFile(chatId, updates = {}) {
    let chat = this.getChat(chatId);
    if (!chat) return null;
    Object.assign(chat, updates, { updatedAt: Date.now() });
    this._queueChatWrite(chatId, chat);
    return chat;
  }

  getChatGoal(goalId) {
    let goal = this.get(`goals/${goalId}`);
    return goal ? JSON.parse(JSON.stringify({ id: goalId, ...goal })) : null;
  }

  _normalizeGoalQueue(queue = []) {
    if (!Array.isArray(queue)) return [];
    return queue
      .map(normalizeChatGoalQueueMessage)
      .filter((item) => item.id && item.text);
  }

  _setChatGoalQueue(goalId, current, queue, source, now = Date.now()) {
    let next = {
      ...current,
      queue: this._normalizeGoalQueue(queue),
      updatedAt: now,
      updatedBy: source,
    };
    this.commit([{ op: 'set', path: `goals/${goalId}`, value: next }], source);
    this.flush();
    return { id: goalId, ...next };
  }

  _appendGoalScopeChange(current, item, source, now = Date.now()) {
    let existing = Array.isArray(current.scopeChangelog) ? current.scopeChangelog : [];
    let text = String(item?.text || '').replace(/\s+/g, ' ').trim();
    let entry = {
      id: crypto.randomUUID().slice(0, 12),
      messageId: item?.id || null,
      delivery: item?.delivery || null,
      status: item?.status || null,
      textPreview: text.length > 240 ? `${text.slice(0, 237)}...` : text,
      appliedAt: item?.appliedAt || now,
      appliedBy: item?.updatedBy || source,
      createdAt: now,
    };
    return [...existing, entry].slice(-50);
  }

  listChatGoals({ chatId = null, projectId = null, status = null } = {}) {
    let statusFilter = status ? normalizeChatGoalStatus(status) : null;
    return Object.entries(this._state.goals || {})
      .map(([id, goal]) => ({ id, ...goal }))
      .filter((goal) => !chatId || goal.chatId === chatId)
      .filter((goal) => !projectId || goal.projectId === projectId)
      .filter((goal) => !statusFilter || normalizeChatGoalStatus(goal.status) === statusFilter)
      .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  }

  createChatGoal(opts = {}, source = 'system') {
    let normalized = normalizeChatGoalInput(opts);
    let id = opts.id || crypto.randomUUID().slice(0, 12);
    let now = Date.now();
    let chatId = opts.chatId || opts.chat_id || null;
    let projectId = opts.projectId || opts.project_id || null;
    if (chatId && !projectId) {
      let chatMeta = this.get(`chats/${chatId}`);
      let chatFile = this.getChat(chatId);
      projectId = chatMeta?.projectId || chatFile?.projectId || null;
    }
    let goal = {
      title: normalized.title,
      description: normalized.description,
      status: normalized.status,
      chatId,
      projectId,
      context: normalized.context,
      scenarios: normalized.scenarios,
      queue: this._normalizeGoalQueue(opts.queue),
      scopeChangelog: Array.isArray(opts.scopeChangelog) ? opts.scopeChangelog.slice(-50) : [],
      createdBy: opts.createdBy || opts.created_by || source,
      updatedBy: opts.updatedBy || opts.updated_by || source,
      createdAt: now,
      updatedAt: now,
    };

    let ops = [{ op: 'set', path: `goals/${id}`, value: goal }];
    if (chatId && normalized.status === 'active') {
      ops.push({ op: 'merge', path: `chats/${chatId}`, value: { activeGoalId: id, updatedAt: now } });
    }
    this.commit(ops, source);
    if (chatId && normalized.status === 'active') this._mergeChatFile(chatId, { activeGoalId: id });
    this.flush();
    return { id, ...goal };
  }

  enqueueChatGoalMessage(goalId, message = {}, source = 'system') {
    let current = this.get(`goals/${goalId}`);
    if (!current) return null;
    let now = Date.now();
    let item = normalizeChatGoalQueueMessage({
      ...message,
      id: message.id || crypto.randomUUID().slice(0, 12),
      status: message.status || 'queued',
      createdAt: message.createdAt || now,
      updatedAt: now,
      appliedAt: message.status === 'applied' ? (message.appliedAt || now) : message.appliedAt,
      discardedAt: message.status === 'discarded' ? (message.discardedAt || now) : message.discardedAt,
      createdBy: message.createdBy || message.created_by || source,
      updatedBy: message.updatedBy || message.updated_by || source,
    });
    if (!item.text) return null;
    let queue = [...this._normalizeGoalQueue(current.queue), item];
    let nextCurrent = item.status === 'applied'
      ? { ...current, scopeChangelog: this._appendGoalScopeChange(current, item, source, now) }
      : current;
    let goal = this._setChatGoalQueue(goalId, nextCurrent, queue, source, now);
    return { goal, item };
  }

  listChatGoalQueue(goalId, { delivery = null, status = 'queued' } = {}) {
    let goal = this.get(`goals/${goalId}`);
    if (!goal) return null;
    let deliveryFilter = delivery ? normalizeChatGoalQueueDelivery(delivery) : null;
    let statusFilter = status ? normalizeChatGoalQueueStatus(status) : null;
    return this._normalizeGoalQueue(goal.queue)
      .filter((item) => !deliveryFilter || item.delivery === deliveryFilter)
      .filter((item) => !statusFilter || item.status === statusFilter);
  }

  updateChatGoalQueueMessage(goalId, messageId, updates = {}, source = 'system') {
    let current = this.get(`goals/${goalId}`);
    if (!current) return null;
    let now = Date.now();
    let found = null;
    let shouldAppendScopeChange = false;
    let queue = this._normalizeGoalQueue(current.queue).map((item) => {
      if (item.id !== messageId) return item;
      let status = updates.status ? normalizeChatGoalQueueStatus(updates.status) : item.status;
      let next = normalizeChatGoalQueueMessage({
        ...item,
        ...updates,
        status,
        updatedAt: now,
        updatedBy: updates.updatedBy || updates.updated_by || source,
      });
      if (status === 'applied' && !next.appliedAt) next.appliedAt = now;
      if (status === 'discarded' && !next.discardedAt) next.discardedAt = now;
      shouldAppendScopeChange = status === 'applied' && item.status !== 'applied';
      found = next;
      return next;
    });
    if (!found) return null;
    let nextCurrent = shouldAppendScopeChange
      ? { ...current, scopeChangelog: this._appendGoalScopeChange(current, found, source, now) }
      : current;
    let goal = this._setChatGoalQueue(goalId, nextCurrent, queue, source, now);
    return { goal, item: found };
  }

  clearChatGoalQueue(goalId, { status = 'queued' } = {}, source = 'system') {
    let current = this.get(`goals/${goalId}`);
    if (!current) return null;
    let statusFilter = status ? normalizeChatGoalQueueStatus(status) : null;
    let queue = this._normalizeGoalQueue(current.queue);
    let remaining = queue.filter((item) => statusFilter && item.status !== statusFilter);
    let cleared = queue.filter((item) => !statusFilter || item.status === statusFilter);
    let goal = this._setChatGoalQueue(goalId, current, remaining, source);
    return { goal, cleared };
  }

  updateChatGoal(goalId, updates = {}, source = 'system') {
    let current = this.get(`goals/${goalId}`);
    if (!current) return null;
    let now = Date.now();
    let status = updates.status ? normalizeChatGoalStatus(updates.status) : current.status;
    let next = {
      ...current,
      ...normalizeChatGoalInput({ ...current, ...updates, status }),
      status,
      queue: this._normalizeGoalQueue(updates.queue || current.queue),
      scopeChangelog: Array.isArray(updates.scopeChangelog)
        ? updates.scopeChangelog.slice(-50)
        : (Array.isArray(current.scopeChangelog) ? current.scopeChangelog : []),
      updatedBy: updates.updatedBy || updates.updated_by || source,
      updatedAt: now,
    };

    let reason = updates.reason || updates.blockedReason || updates.completedReason || '';
    if (status === 'blocked') {
      next.blockedAt = updates.blockedAt || current.blockedAt || now;
      next.blockedReason = String(reason || current.blockedReason || '').trim();
    }
    if (status === 'paused') {
      next.pausedAt = updates.pausedAt || current.pausedAt || now;
      next.pausedReason = String(reason || current.pausedReason || '').trim();
    }
    if (status === 'completed') {
      next.completedAt = updates.completedAt || current.completedAt || now;
      next.completedReason = String(reason || current.completedReason || '').trim();
    }
    if (status === 'active') {
      delete next.pausedAt;
      delete next.pausedReason;
      delete next.completedAt;
      delete next.completedReason;
      delete next.blockedAt;
      delete next.blockedReason;
    }

    let ops = [{ op: 'set', path: `goals/${goalId}`, value: next }];
    if (next.chatId && status === 'active') {
      ops.push({ op: 'merge', path: `chats/${next.chatId}`, value: { activeGoalId: goalId, updatedAt: now } });
    }
    if (next.chatId && ['blocked', 'completed'].includes(status)) {
      let chatMeta = this.get(`chats/${next.chatId}`);
      if (chatMeta?.activeGoalId === goalId) {
        ops.push({ op: 'merge', path: `chats/${next.chatId}`, value: { activeGoalId: null, updatedAt: now } });
      }
    }
    this.commit(ops, source);
    if (next.chatId && status === 'active') {
      this._mergeChatFile(next.chatId, { activeGoalId: goalId });
    }
    if (next.chatId && ['blocked', 'completed'].includes(status)) {
      let chat = this.getChat(next.chatId);
      if (chat?.activeGoalId === goalId) this._mergeChatFile(next.chatId, { activeGoalId: null });
    }
    this.flush();
    return { id: goalId, ...next };
  }

  deleteChatGoal(goalId, source = 'system') {
    let current = this.get(`goals/${goalId}`);
    if (!current) return null;
    let now = Date.now();
    let ops = [{ op: 'delete', path: `goals/${goalId}` }];
    if (current.chatId) {
      let chatMeta = this.get(`chats/${current.chatId}`);
      if (chatMeta?.activeGoalId === goalId) {
        ops.push({ op: 'merge', path: `chats/${current.chatId}`, value: { activeGoalId: null, updatedAt: now } });
      }
    }
    this.commit(ops, source);
    if (current.chatId) {
      let chat = this.getChat(current.chatId);
      if (chat?.activeGoalId === goalId) this._mergeChatFile(current.chatId, { activeGoalId: null });
    }
    this.flush();
    return { id: goalId, ...current, status: 'deleted', deletedAt: now, updatedAt: now, updatedBy: source };
  }

  selectChatGoal(chatId, goalId = null, source = 'system') {
    if (!chatId) throw new Error('Missing chatId');
    let now = Date.now();
    let goal = goalId ? this.get(`goals/${goalId}`) : null;
    if (goalId && !goal) throw new Error(`Goal not found: ${goalId}`);
    let ops = [{ op: 'merge', path: `chats/${chatId}`, value: { activeGoalId: goalId || null, updatedAt: now } }];
    if (goalId) {
      let chatMeta = this.get(`chats/${chatId}`) || {};
      ops.push({
        op: 'merge',
        path: `goals/${goalId}`,
        value: {
          chatId,
          projectId: goal.projectId || chatMeta.projectId || null,
          updatedAt: now,
          updatedBy: source,
        },
      });
    }
    this.commit(ops, source);
    this._mergeChatFile(chatId, { activeGoalId: goalId || null });
    this.flush();
    return goalId ? this.getChatGoal(goalId) : null;
  }

  // Delete a chat (graph + file).
  deleteChat(chatId, source = 'system') {
    this.commit([{ op: 'delete', path: `chats/${chatId}` }], source);
    this._queueChatDelete(chatId);
  }

  // Update chat metadata fields.
  updateChat(chatId, updates, source = 'system') {
    let allowed = new Set(['name', 'adapter', 'model', 'provider', 'chatType', 'agent', 'approval_mode', 'resource_group', 'projectId', 'parentChatId', 'origin', 'lastTaskStatus', 'activeGoalId', 'goalIntentActive', 'goalQueueMode']);
    let filtered = {};
    let current = this.get(`chats/${chatId}`) || {};
    for (let [k, v] of Object.entries(updates)) {
      if (!allowed.has(k)) continue;
      if (typeof v === 'string' && v.includes('{{')) continue;
      filtered[k] = k === 'origin' ? normalizeChatOrigin(v) : v;
    }
    if ('agent' in filtered || 'adapter' in filtered || 'parentChatId' in filtered) {
      filtered.agent = resolveChatCreationAgent({
        adapter: filtered.adapter ?? current.adapter ?? 'pool',
        parentChatId: filtered.parentChatId ?? current.parentChatId ?? null,
        agent: filtered.agent ?? current.agent ?? null,
      });
    }
    if (Object.keys(filtered).length === 0) return;
    filtered.updatedAt = Date.now();
    this.commit([{ op: 'merge', path: `chats/${chatId}`, value: filtered }], source);

    // Also update file
    let chat = this.getChat(chatId);
    if (chat) {
      Object.assign(chat, filtered);
      this._queueChatWrite(chatId, chat);
    }
  }

  // Update session ID for a chat.
  updateChatSession(chatId, sessionId) {
    let chat = this.getChat(chatId);
    if (!chat) return;
    chat.sessionId = sessionId;
    chat.updatedAt = Date.now();
    this._queueChatWrite(chatId, chat);
    this.commit([{
      op: 'merge',
      path: `chats/${chatId}`,
      value: this._chatMetadata(chat, this.get(`chats/${chatId}`) || {}),
    }], 'chat');
  }

  // Set or clear pending task ID.
  updateChatTask(chatId, taskId, { expectedTaskId = null } = {}) {
    let chat = this.getChat(chatId);
    if (!chat) return;
    if (!taskId && expectedTaskId && chat.pendingTaskId && chat.pendingTaskId !== expectedTaskId) {
      return;
    }
    if (taskId) chat.pendingTaskId = taskId;
    else delete chat.pendingTaskId;
    chat.updatedAt = Date.now();
    this._queueChatWrite(chatId, chat);

    let current = this.get(`chats/${chatId}`) || {};
    let fallback = taskId ? current : { ...current, pendingTaskId: null };
    this.commit([{
      op: 'merge',
      path: `chats/${chatId}`,
      value: this._chatMetadata(chat, fallback),
    }], 'chat');
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
