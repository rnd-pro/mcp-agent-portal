import fs from 'node:fs';
import { createHash } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';

const DEFAULT_RUNTIME_DIR = 'runtime';
const DEFAULT_TMP_NAME = 'mcp-agent-portal';

/**
 * @typedef {Object} RuntimePathOptions
 * @property {string} [projectRoot] Project root used when no runtime env override is set.
 * @property {NodeJS.ProcessEnv} [env] Environment source for runtime path overrides.
 */

/**
 * @typedef {Object} RuntimeStatus
 * @property {string} name Stable service or process name.
 * @property {number} updatedAt Unix epoch timestamp in milliseconds.
 * @property {string} state Human-readable lifecycle state.
 * @property {number} [pid] Process id associated with the status record.
 * @property {Record<string, unknown>} [meta] Extra status details for callers.
 */

/**
 * @param {string} value
 * @returns {string}
 */
function trimPathPart(value) {
  return value.replace(/^[/\\]+|[/\\]+$/g, '');
}

/**
 * @param {Array<string|number|boolean|null|undefined>} parts
 * @returns {string[]}
 */
function normalizePathParts(parts = []) {
  let normalized = [];
  for (let part of parts) {
    if (part === null || part === undefined || part === '') continue;
    let segments = trimPathPart(String(part)).split(/[/\\]+/).filter(Boolean);
    for (let segment of segments) {
      if (segment === '.' || segment === '..') {
        throw new Error(`Unsafe runtime path segment: ${segment}`);
      }
      normalized.push(segment);
    }
  }
  return normalized;
}

/**
 * @param {string} name
 * @returns {string}
 */
function normalizeName(name) {
  let normalized = normalizePathParts([name]).join('-');
  if (!normalized) {
    throw new Error('Runtime name is required');
  }
  return normalized;
}

/**
 * Resolve a checkout root for runtime files.
 * @param {string} [projectRoot]
 * @returns {string}
 */
export function getProjectRoot(projectRoot = process.cwd()) {
  return path.resolve(projectRoot);
}

function getPortalHome(env = process.env) {
  return path.resolve(env.AGENT_PORTAL_CONFIG_DIR || path.join(os.homedir(), '.agent-portal'));
}

function getProjectStateDir(projectRoot = process.cwd(), env = process.env) {
  const root = getProjectRoot(projectRoot);
  const hash = createHash('sha1').update(root).digest('hex').slice(0, 12);
  const name = path.basename(root).replace(/[^a-zA-Z0-9._-]+/g, '-') || 'project';
  return path.join(getPortalHome(env), 'projects', `${name}-${hash}`);
}

/**
 * Resolve the portal runtime directory. AGENT_PORTAL_RUNTIME_DIR can override
 * the default local project state runtime directory.
 * @param {RuntimePathOptions} [options]
 * @returns {string}
 */
export function getRuntimeDir(options = {}) {
  let env = options.env || process.env;
  let configured = env.AGENT_PORTAL_RUNTIME_DIR;
  if (configured) return path.resolve(configured);
  return path.join(getProjectStateDir(options.projectRoot, env), DEFAULT_RUNTIME_DIR);
}

/**
 * Resolve a path inside the portal runtime directory.
 * @param {Array<string|number|boolean|null|undefined>} [parts]
 * @param {RuntimePathOptions} [options]
 * @returns {string}
 */
export function getRuntimePath(parts = [], options = {}) {
  return path.join(getRuntimeDir(options), ...normalizePathParts(parts));
}

/**
 * Resolve a namespaced temporary path for transient ops files.
 * @param {Array<string|number|boolean|null|undefined>} [parts]
 * @param {{ env?: NodeJS.ProcessEnv }} [options]
 * @returns {string}
 */
export function getTempPath(parts = [], options = {}) {
  let env = options.env || process.env;
  let base = env.AGENT_PORTAL_TMP_DIR || path.join(os.tmpdir(), DEFAULT_TMP_NAME);
  return path.join(path.resolve(base), ...normalizePathParts(parts));
}

/**
 * Resolve a service data path under runtime/data.
 * @param {string} service
 * @param {Array<string|number|boolean|null|undefined>} [parts]
 * @param {RuntimePathOptions} [options]
 * @returns {string}
 */
export function getDataPath(service, parts = [], options = {}) {
  return getRuntimePath(['data', normalizeName(service), ...parts], options);
}

/**
 * Resolve a service log path under runtime/logs.
 * @param {string} service
 * @param {Array<string|number|boolean|null|undefined>} [parts]
 * @param {RuntimePathOptions} [options]
 * @returns {string}
 */
export function getLogPath(service, parts = [], options = {}) {
  return getRuntimePath(['logs', normalizeName(service), ...parts], options);
}

/**
 * Resolve a service pid file path under runtime/pids.
 * @param {string} service
 * @param {RuntimePathOptions} [options]
 * @returns {string}
 */
export function getPidPath(service, options = {}) {
  return getRuntimePath(['pids', `${normalizeName(service)}.pid`], options);
}

/**
 * Resolve a service status JSON path under runtime/status.
 * @param {string} name
 * @param {RuntimePathOptions} [options]
 * @returns {string}
 */
export function getStatusPath(name, options = {}) {
  return getRuntimePath(['status', `${normalizeName(name)}.json`], options);
}

/**
 * Ensure a runtime directory exists.
 * @param {Array<string|number|boolean|null|undefined>} [parts]
 * @param {RuntimePathOptions} [options]
 * @returns {string}
 */
export function ensureRuntimeDir(parts = [], options = {}) {
  let dir = getRuntimePath(parts, options);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/**
 * Read JSON from disk, returning null for missing or invalid files.
 * @template T
 * @param {string} filePath
 * @returns {T|null}
 */
export function readJsonFile(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

/**
 * Write JSON atomically enough for local ops status files.
 * @param {string} filePath
 * @param {unknown} data
 * @returns {void}
 */
export function writeJsonFile(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  let tmpPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmpPath, `${JSON.stringify(data, null, 2)}\n`);
  fs.renameSync(tmpPath, filePath);
}

/**
 * Persist a runtime status record for a service or process.
 * @param {string} name
 * @param {Partial<RuntimeStatus>} status
 * @param {RuntimePathOptions} [options]
 * @returns {RuntimeStatus}
 */
export function writeRuntimeStatus(name, status = {}, options = {}) {
  let record = {
    name: normalizeName(name),
    updatedAt: Date.now(),
    state: 'unknown',
    ...status,
  };
  writeJsonFile(getStatusPath(name, options), record);
  return record;
}

/**
 * Read a runtime status record.
 * @param {string} name
 * @param {RuntimePathOptions} [options]
 * @returns {RuntimeStatus|null}
 */
export function readRuntimeStatus(name, options = {}) {
  return readJsonFile(getStatusPath(name, options));
}

/**
 * Remove a runtime status record if it exists.
 * @param {string} name
 * @param {RuntimePathOptions} [options]
 * @returns {boolean}
 */
export function removeRuntimeStatus(name, options = {}) {
  try {
    fs.unlinkSync(getStatusPath(name, options));
    return true;
  } catch {
    return false;
  }
}

/**
 * List all readable runtime status records.
 * @param {RuntimePathOptions} [options]
 * @returns {RuntimeStatus[]}
 */
export function listRuntimeStatuses(options = {}) {
  let statusDir = getRuntimePath(['status'], options);
  try {
    return fs.readdirSync(statusDir)
      .filter((file) => file.endsWith('.json'))
      .map((file) => readJsonFile(path.join(statusDir, file)))
      .filter(Boolean)
      .sort((a, b) => String(a.name).localeCompare(String(b.name)));
  } catch {
    return [];
  }
}
