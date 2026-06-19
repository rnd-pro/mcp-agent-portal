import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  createInactivityWatchdog,
  isProcessAlive,
  runProcessWithWatchdog,
  runShellWithWatchdog,
} from '../../src/node/ops/process.js';

async function waitForDead(pid, timeoutMs = 1000) {
  let deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!isProcessAlive(pid)) return true;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  return !isProcessAlive(pid);
}

describe('ops process utilities', () => {
  it('treats EPERM pid probes as alive but inaccessible', () => {
    let originalKill = process.kill;
    process.kill = () => {
      let error = new Error('operation not permitted');
      error.code = 'EPERM';
      throw error;
    };
    try {
      assert.equal(isProcessAlive(12345), true);
    } finally {
      process.kill = originalKill;
    }
  });

  it('treats ESRCH pid probes as dead', () => {
    let originalKill = process.kill;
    process.kill = () => {
      let error = new Error('no such process');
      error.code = 'ESRCH';
      throw error;
    };
    try {
      assert.equal(isProcessAlive(12345), false);
    } finally {
      process.kill = originalKill;
    }
  });

  it('runs a process and collects stdout/stderr', async () => {
    let result = await runProcessWithWatchdog(process.execPath, [
      '-e',
      'process.stdout.write("out"); process.stderr.write("err");',
    ], {
      collect: true,
      silent: true,
      timeoutMs: 1000,
      inactivityMs: 1000,
      label: 'collect-test',
    });

    assert.equal(result.code, 0);
    assert.equal(result.stdout, 'out');
    assert.equal(result.stderr, 'err');
    assert.equal(typeof result.pid, 'number');
    assert.equal(isProcessAlive(result.pid), false);
  });

  it('runs a shell command through the watchdog', async () => {
    let result = await runShellWithWatchdog(`${JSON.stringify(process.execPath)} -e "process.stdout.write('shell-ok')"`, {
      collect: true,
      silent: true,
      timeoutMs: 1000,
      inactivityMs: 1000,
      label: 'shell-test',
    });

    assert.equal(result.stdout, 'shell-ok');
  });

  it('rejects non-zero exits with collected output', async () => {
    await assert.rejects(
      runProcessWithWatchdog(process.execPath, ['-e', 'process.stderr.write("bad"); process.exit(7);'], {
        collect: true,
        silent: true,
        timeoutMs: 1000,
        inactivityMs: 1000,
        label: 'exit-test',
      }),
      (error) => {
        assert.equal(error.code, 7);
        assert.equal(error.stderr, 'bad');
        return true;
      },
    );
  });

  it('enforces output buffer limits', async () => {
    await assert.rejects(
      runProcessWithWatchdog(process.execPath, ['-e', 'process.stdout.write("abcdef");'], {
        collect: true,
        silent: true,
        maxBuffer: 3,
        timeoutMs: 1000,
        inactivityMs: 1000,
        label: 'buffer-test',
      }),
      (error) => {
        assert.equal(error.code, 'PROCESS_OUTPUT_LIMIT');
        assert.equal(error.stdout, 'abcdef');
        return true;
      },
    );
  });

  it('enforces hard timeouts without touching unrelated processes', async () => {
    let parentPid;
    await assert.rejects(
      runProcessWithWatchdog(process.execPath, ['-e', 'setTimeout(() => {}, 5000);'], {
        collect: true,
        silent: true,
        timeoutMs: 50,
        inactivityMs: 1000,
        shutdownMs: 50,
        label: 'timeout-test',
      }),
      (error) => {
        assert.equal(error.code, 'PROCESS_TIMEOUT');
        assert.equal(typeof error.pid, 'number');
        parentPid = error.pid;
        return true;
      },
    );
    assert.equal(await waitForDead(parentPid), true);
  });

  it('terminates child process groups after timeout', async () => {
    let parentPid;
    let nestedPid;
    let script = `
      const { spawn } = require('node:child_process');
      const nested = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 5000);'], { stdio: 'ignore' });
      console.log(nested.pid);
      setTimeout(() => {}, 5000);
    `;

    await assert.rejects(
      runProcessWithWatchdog(process.execPath, ['-e', script], {
        collect: true,
        silent: true,
        timeoutMs: 80,
        inactivityMs: 1000,
        shutdownMs: 50,
        label: 'timeout-tree-test',
      }),
      (error) => {
        assert.equal(error.code, 'PROCESS_TIMEOUT');
        parentPid = error.pid;
        nestedPid = Number(error.stdout.trim());
        assert.equal(Number.isInteger(nestedPid), true);
        return true;
      },
    );

    assert.equal(await waitForDead(parentPid), true);
    assert.equal(await waitForDead(nestedPid), true);
  });

  it('enforces inactivity timeouts', async () => {
    await assert.rejects(
      runProcessWithWatchdog(process.execPath, ['-e', 'setTimeout(() => process.stdout.write("late"), 5000);'], {
        collect: true,
        silent: true,
        inactivityMs: 50,
        timeoutMs: 1000,
        shutdownMs: 50,
        label: 'inactivity-test',
      }),
      (error) => {
        assert.equal(error.code, 'PROCESS_INACTIVITY_TIMEOUT');
        return true;
      },
    );
  });

  it('aborts a running process with AbortSignal', async () => {
    let controller = new AbortController();
    let promise = runProcessWithWatchdog(process.execPath, ['-e', 'setTimeout(() => {}, 5000);'], {
      collect: true,
      silent: true,
      signal: controller.signal,
      inactivityMs: 1000,
      timeoutMs: 1000,
      shutdownMs: 50,
      label: 'abort-test',
    });

    controller.abort();

    await assert.rejects(promise, (error) => {
      assert.equal(error.code, 'PROCESS_ABORTED');
      return true;
    });
  });

  it('creates a resettable inactivity watchdog', async () => {
    let count = 0;
    let watchdog = createInactivityWatchdog(() => {
      count += 1;
    }, 20);

    watchdog.kick();
    watchdog.kick();
    await new Promise((resolve) => setTimeout(resolve, 35));
    watchdog.stop();

    assert.equal(count, 1);
  });
});
