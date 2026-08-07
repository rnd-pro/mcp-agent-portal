import { spawn } from 'child_process';

/**
 * @typedef {Object} CommandWatchdogOptions
 * @property {number} [inactivityMs] - Maximum time without stdout/stderr before aborting.
 * @property {number} [timeoutMs] - Hard execution timeout.
 * @property {number} [shutdownMs] - Grace period between SIGTERM and SIGKILL.
 * @property {number} [maxBuffer] - Maximum combined output buffer in bytes.
 * @property {BufferEncoding} [encoding] - Output encoding.
 * @property {string} [cwd] - Working directory.
 * @property {Record<string, string|undefined>} [env] - Process environment.
 * @property {AbortSignal} [signal] - Parent cancellation signal.
 */

/**
 * Runs a shell command with inactivity, hard timeout, output limit, and abort handling.
 * @param {string} command - Shell command to run.
 * @param {object} [options]
 * @returns {Promise<string>} stdout text.
 * @throws {Error} When the command fails, stalls, exceeds limits, or is aborted.
 */
export function runCommandWithWatchdog(command, options = {}) {
  let {
    inactivityMs = 120000,
    timeoutMs,
    shutdownMs = 5000,
    maxBuffer = 50 * 1024 * 1024,
    encoding = 'utf-8',
    cwd,
    env,
    signal,
  } = options;

  return new Promise((resolve, reject) => {
    let child = spawn(command, {
      shell: true,
      cwd,
      env,
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = [];
    let stderr = [];
    let stdoutSize = 0;
    let stderrSize = 0;
    let settled = false;
    let shutdownTimer = null;
    let deadlineTimer = null;

    let killProcessTree = (killSignal) => {
      try {
        process.kill(-child.pid, killSignal);
      } catch {
        child.kill(killSignal);
      }
    };

    let fail = (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      clearTimeout(deadlineTimer);
      signal?.removeEventListener('abort', onAbort);
      killProcessTree('SIGTERM');
      shutdownTimer = setTimeout(() => {
        killProcessTree('SIGKILL');
      }, shutdownMs);
      reject(error);
    };

    let timer = setTimeout(() => {
      fail(new Error(`Command stalled after ${inactivityMs}ms without output: ${command}`));
    }, inactivityMs);

    let kick = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        fail(new Error(`Command stalled after ${inactivityMs}ms without output: ${command}`));
      }, inactivityMs);
    };

    let onAbort = () => fail(new Error(`Command aborted: ${command}`));

    if (signal) {
      if (signal.aborted) {
        onAbort();
      } else {
        signal.addEventListener('abort', onAbort, { once: true });
      }
    }

    if (timeoutMs) {
      deadlineTimer = setTimeout(() => {
        fail(new Error(`Command exceeded hard timeout ${timeoutMs}ms: ${command}`));
      }, timeoutMs);
    }

    let appendChunk = (chunks, chunk, currentSize, streamName) => {
      let nextSize = currentSize + chunk.length;
      if (nextSize > maxBuffer) {
        fail(new Error(`Command ${streamName} exceeded maxBuffer ${maxBuffer}: ${command}`));
        return currentSize;
      }
      chunks.push(chunk);
      kick();
      return nextSize;
    };

    child.stdout.on('data', (chunk) => {
      stdoutSize = appendChunk(stdout, chunk, stdoutSize, 'stdout');
    });

    child.stderr.on('data', (chunk) => {
      stderrSize = appendChunk(stderr, chunk, stderrSize, 'stderr');
    });

    child.on('error', fail);

    child.on('close', (code, closeSignal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      clearTimeout(deadlineTimer);
      clearTimeout(shutdownTimer);
      signal?.removeEventListener('abort', onAbort);

      let stdoutText = Buffer.concat(stdout).toString(encoding);
      let stderrText = Buffer.concat(stderr).toString(encoding);

      if (code === 0) {
        resolve(stdoutText);
        return;
      }

      reject(
        new Error(
          `Command failed with ${closeSignal ? `signal ${closeSignal}` : `exit code ${code}`}: ${stderrText || command}`,
        ),
      );
    });
  });
}
