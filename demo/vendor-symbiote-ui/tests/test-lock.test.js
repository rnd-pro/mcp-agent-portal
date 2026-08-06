import { acquireCurrentTestFileLock } from './test-lock.js';
await acquireCurrentTestFileLock(import.meta.url);

import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdir, mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { acquireTestLock } from './test-lock.js';

function waitForOutput(child, pattern, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    let output = '';
    let timer = setTimeout(() => {
      cleanup();
      reject(new Error(`Timed out waiting for ${pattern}. Output:\n${output}`));
    }, timeoutMs);
    let onData = (chunk) => {
      output += chunk.toString();
      if (output.includes(pattern)) {
        cleanup();
        resolve(output);
      }
    };
    let cleanup = () => {
      clearTimeout(timer);
      child.stdout.off('data', onData);
      child.stderr.off('data', onData);
    };
    child.stdout.on('data', onData);
    child.stderr.on('data', onData);
  });
}

function stopProcess(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  child.kill('SIGKILL');
}

test('test lock rejects a duplicate live lock for the same scope and id', async () => {
  let root = await mkdtemp(join(tmpdir(), 'symbiote-ui-test-lock-'));
  let lock = await acquireTestLock({
    scope: 'file',
    id: 'tests/example.test.js',
    root,
  });

  try {
    await assert.rejects(
      () => acquireTestLock({
        scope: 'file',
        id: 'tests/example.test.js',
        root,
        reentrant: false,
      }),
      /Duplicate file test run blocked/
    );
  } finally {
    await lock.release();
  }
});

test('suite runner releases lock after SIGTERM once child exits', { timeout: 10000 }, async () => {
  let root = await mkdtemp(join(tmpdir(), 'symbiote-ui-suite-lock-'));
  let child = spawn(process.execPath, [
    'tests/run-tests.js',
    '--suite',
    'signal-smoke',
    '--',
    process.execPath,
    '--input-type=module',
    '-e',
    "console.log('suite-held'); setInterval(() => {}, 1000)",
  ], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      SYMBIOTE_UI_TEST_LOCK_ROOT: root,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  try {
    await waitForOutput(child, 'suite-held');
    child.kill('SIGTERM');
    let [code, signal] = await once(child, 'exit');
    assert.equal(signal, null);
    assert.equal(code, 143);
    let entries = await readdir(root).catch((error) => {
      if (error?.code === 'ENOENT') return [];
      throw error;
    });
    assert.deepEqual(entries.filter((entry) => entry.endsWith('.lock')), []);
  } finally {
    stopProcess(child);
  }
});

test('test lock replaces stale lock directories whose owner pid is gone', async () => {
  let root = await mkdtemp(join(tmpdir(), 'symbiote-ui-test-lock-'));
  let stale = await acquireTestLock({
    scope: 'file',
    id: 'tests/stale.test.js',
    root,
  });
  await stale.release();

  await mkdir(stale.lockDir, { recursive: true });
  await writeFile(join(stale.lockDir, 'meta.json'), JSON.stringify({
    scope: 'file',
    id: 'tests/stale.test.js',
    pid: 99999999,
    startedAt: Date.now(),
    argv: ['stale'],
  }));

  let lock = await acquireTestLock({
    scope: 'file',
    id: 'tests/stale.test.js',
    root,
    reentrant: false,
  });
  try {
    let meta = JSON.parse(await readFile(join(lock.lockDir, 'meta.json'), 'utf8'));
    assert.equal(meta.pid, process.pid);
  } finally {
    await lock.release();
  }
});
