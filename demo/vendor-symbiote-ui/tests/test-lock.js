import { createHash } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { rmSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const defaultLockRoot = process.env.SYMBIOTE_UI_TEST_LOCK_ROOT
  ? resolve(process.env.SYMBIOTE_UI_TEST_LOCK_ROOT)
  : resolve(repoRoot, 'tmp', 'test-locks');
const defaultStaleMs = Number.parseInt(process.env.SYMBIOTE_UI_TEST_LOCK_STALE_MS || '', 10) || 30 * 60 * 1000;
const suiteLockEnv = 'SYMBIOTE_UI_TEST_SUITE_LOCK_ID';
const heldLocks = new Map();
const signalExitCodes = new Map([
  ['SIGHUP', 129],
  ['SIGINT', 130],
  ['SIGTERM', 143],
]);
let exitCleanupHookInstalled = false;
let signalCleanupHooksInstalled = false;

function normalizeId(id) {
  return String(id || '')
    .replaceAll('\\', '/')
    .replaceAll(/[^a-zA-Z0-9._/:@-]+/g, '-')
    .slice(0, 180);
}

function lockKey(scope, id) {
  return createHash('sha256')
    .update(`${scope}:${id}`)
    .digest('hex')
    .slice(0, 16);
}

function isPidAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return err?.code === 'EPERM';
  }
}

async function readLockMeta(lockDir) {
  try {
    return JSON.parse(await readFile(join(lockDir, 'meta.json'), 'utf8'));
  } catch {
    return {};
  }
}

function formatDuplicateMessage({ scope, id, lockDir, meta }) {
  let since = meta.startedAt ? new Date(meta.startedAt).toISOString() : 'unknown time';
  let command = Array.isArray(meta.argv) ? meta.argv.join(' ') : 'unknown command';
  return [
    `[symbiote-ui test lock] Duplicate ${scope} test run blocked.`,
    `Requested: ${id}`,
    `Existing: pid ${meta.pid || 'unknown'}, started ${since}`,
    `Command: ${command}`,
    `Lock: ${lockDir}`,
    'Stop the existing run or wait for it to finish before starting this test again.',
  ].join('\n');
}

function removeLockSync(lockDir) {
  try {
    rmSync(lockDir, { recursive: true, force: true });
  } catch {
    // Best-effort cleanup during process exit.
  }
}

function cleanupHeldLocksSync() {
  for (let lockDir of heldLocks.keys()) {
    removeLockSync(lockDir);
  }
  heldLocks.clear();
}

function installCleanupHooks({ signals = true } = {}) {
  if (!exitCleanupHookInstalled) {
    exitCleanupHookInstalled = true;
    process.once('exit', cleanupHeldLocksSync);
  }
  if (!signals || signalCleanupHooksInstalled) return;
  signalCleanupHooksInstalled = true;
  for (let signal of signalExitCodes.keys()) {
    process.once(signal, () => {
      cleanupHeldLocksSync();
      process.exit(signalExitCodes.get(signal));
    });
  }
}

export async function acquireTestLock({
  scope = 'file',
  id,
  root = defaultLockRoot,
  staleMs = defaultStaleMs,
  reentrant = true,
  signals = true,
} = {}) {
  if (process.env.SYMBIOTE_UI_TEST_LOCKS === 'off') {
    return { lockDir: null, meta: null, release: async () => {} };
  }
  if (!id) throw new TypeError('Test lock id is required');

  let normalizedId = normalizeId(id);
  let key = lockKey(scope, normalizedId);
  let lockDir = join(root, `${scope}-${key}.lock`);
  let held = heldLocks.get(lockDir);
  if (held && reentrant) return held;

  await mkdir(root, { recursive: true });
  installCleanupHooks({ signals });

  for (;;) {
    try {
      await mkdir(lockDir);
      break;
    } catch (err) {
      if (err?.code !== 'EEXIST') throw err;
      let meta = await readLockMeta(lockDir);
      let alive = isPidAlive(Number(meta.pid));
      let age = Date.now() - Number(meta.startedAt || 0);
      if (!alive || age > staleMs) {
        await rm(lockDir, { recursive: true, force: true });
        continue;
      }
      let duplicate = new Error(formatDuplicateMessage({
        scope,
        id: normalizedId,
        lockDir,
        meta,
      }));
      duplicate.code = 'ERR_SYMBIOTE_UI_TEST_LOCKED';
      throw duplicate;
    }
  }

  let meta = {
    scope,
    id: normalizedId,
    key,
    pid: process.pid,
    ppid: process.ppid,
    cwd: process.cwd(),
    argv: process.argv,
    startedAt: Date.now(),
  };
  await writeFile(join(lockDir, 'meta.json'), `${JSON.stringify(meta, null, 2)}\n`);

  let released = false;
  let release = async () => {
    if (released) return;
    released = true;
    try {
      await rm(lockDir, { recursive: true, force: true });
      heldLocks.delete(lockDir);
    } catch (err) {
      released = false;
      throw err;
    }
  };
  let lock = { lockDir, meta, release };
  heldLocks.set(lockDir, lock);
  return lock;
}

export async function acquireCurrentTestFileLock(testFileUrl, options = {}) {
  let filePath = fileURLToPath(testFileUrl);
  let id = relative(repoRoot, filePath) || filePath;
  return acquireTestLock({
    scope: 'file',
    id,
    ...options,
  });
}

export async function acquireTestSuiteLock(suite = 'all', options = {}) {
  if (process.env[suiteLockEnv]) return null;
  let lock = await acquireTestLock({
    scope: 'suite',
    id: suite,
    ...options,
  });
  if (lock) {
    process.env[suiteLockEnv] = lock.meta?.key || 'off';
  }
  return lock;
}
