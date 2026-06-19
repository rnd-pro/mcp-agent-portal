import { spawn } from 'node:child_process';

const DEFAULT_INACTIVITY_MS = 10 * 60 * 1000;
const DEFAULT_SHUTDOWN_MS = 5 * 1000;
const DEFAULT_MAX_BUFFER = 50 * 1024 * 1024;

/**
 * @typedef {Error & {
 *   code?: string|number|null,
 *   stdout?: string,
 *   stderr?: string,
 *   signal?: NodeJS.Signals|string|null,
 *   pid?: number,
 * }} ProcessError
 */

/**
 * @typedef {Object} ProcessResult
 * @property {string} stdout Captured stdout when collect is true.
 * @property {string} stderr Captured stderr when collect is true.
 * @property {number} code Exit code.
 * @property {NodeJS.Signals|string|null} signal Exit signal.
 * @property {number|undefined} pid Spawned child pid.
 * @property {number} durationMs Process runtime in milliseconds.
 */

/**
 * @typedef {Object} WatchedProcessOptions
 * @property {string} [cwd]
 * @property {NodeJS.ProcessEnv} [env]
 * @property {boolean} [shell]
 * @property {boolean} [silent]
 * @property {boolean} [collect]
 * @property {'ignore'|'inherit'|'pipe'} [stdin]
 * @property {AbortSignal} [signal]
 * @property {string} [label]
 * @property {number} [inactivityMs]
 * @property {number} [timeoutMs]
 * @property {number} [shutdownMs]
 * @property {number} [maxBuffer]
 * @property {(event: ProcessEvent) => void} [onEvent]
 */

/**
 * @typedef {Object} ProcessEvent
 * @property {'start'|'stdout'|'stderr'|'exit'|'timeout'|'inactivity-timeout'|'abort'|'output-limit'} type
 * @property {string} label
 * @property {number|undefined} pid
 * @property {number} timestamp
 * @property {string} [text]
 * @property {number|string|null} [code]
 * @property {NodeJS.Signals|string|null} [signal]
 */

/**
 * Creates a resettable inactivity timer used to terminate stalled processes.
 * @param {() => void} onTimeout Callback invoked when no output arrives in time.
 * @param {number} inactivityMs Maximum idle time in milliseconds.
 * @returns {{ kick: () => void, stop: () => void }}
 */
export function createInactivityWatchdog(onTimeout, inactivityMs = DEFAULT_INACTIVITY_MS) {
  let timer = null;
  return {
    kick() {
      clearTimeout(timer);
      timer = setTimeout(onTimeout, inactivityMs);
      timer.unref?.();
    },
    stop() {
      clearTimeout(timer);
      timer = null;
    },
  };
}

/**
 * Test whether a pid is alive without signaling it to terminate.
 * @param {number|undefined|null} pid
 * @returns {boolean}
 */
export function isProcessAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code === 'EPERM';
  }
}

/**
 * Sends a signal to a detached child process group, falling back to the child.
 * @param {import('node:child_process').ChildProcess|number} childOrPid
 * @param {string|NodeJS.Signals} [signal]
 * @returns {boolean}
 */
export function killProcessTree(childOrPid, signal = 'SIGTERM') {
  let pid = typeof childOrPid === 'number' ? childOrPid : childOrPid?.pid;
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(-pid, signal);
    return true;
  } catch {
    try {
      if (typeof childOrPid !== 'number' && childOrPid?.kill) {
        return childOrPid.kill(signal);
      }
      process.kill(pid, signal);
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * Run a process with hard timeout, inactivity timeout, abort, and output limits.
 * The child is detached so failures can terminate its process group instead of
 * leaving nested subprocesses behind.
 * @param {string} command
 * @param {string[]} [args]
 * @param {Object|WatchedProcessOptions} [options]
 * @returns {Promise<ProcessResult>}
 * @throws {ProcessError} PROCESS_TIMEOUT, PROCESS_INACTIVITY_TIMEOUT, PROCESS_ABORTED, PROCESS_OUTPUT_LIMIT, or exit code.
 */
export function runProcessWithWatchdog(command, args = [], options = {}) {
  let {
    cwd,
    env,
    shell = false,
    silent = false,
    collect = false,
    stdin = 'ignore',
    signal,
    label = [command, ...args].join(' '),
    inactivityMs = DEFAULT_INACTIVITY_MS,
    timeoutMs,
    shutdownMs = DEFAULT_SHUTDOWN_MS,
    maxBuffer = DEFAULT_MAX_BUFFER,
    onEvent,
  } = options;

  return new Promise((resolve, reject) => {
    let stdout = '';
    let stderr = '';
    let outputBytes = 0;
    let settled = false;
    let shutdownTimer = null;
    let deadlineTimer = null;
    let startedAt = Date.now();
    let child;

    /**
     * @param {ProcessEvent} event
     */
    function emit(event) {
      onEvent?.({ label, timestamp: Date.now(), pid: child?.pid, ...event });
    }

    /**
     * @returns {void}
     */
    function cleanupTimers() {
      watchdog.stop();
      signal?.removeEventListener('abort', abortProcess);
      clearTimeout(deadlineTimer);
    }

    /**
     * @param {string} message
     * @param {string} code
     * @param {ProcessEvent['type']} type
     * @returns {void}
     */
    function rejectAndKill(message, code, type) {
      if (settled) return;
      settled = true;
      cleanupTimers();
      emit({ type });
      let error = /** @type {ProcessError} */ (new Error(message));
      error.code = code;
      error.stdout = stdout;
      error.stderr = stderr;
      error.pid = child?.pid;
      killProcessTree(child, 'SIGTERM');
      shutdownTimer = setTimeout(() => {
        killProcessTree(child, 'SIGKILL');
      }, shutdownMs);
      shutdownTimer.unref?.();
      reject(error);
    }

    /**
     * @returns {void}
     */
    function abortProcess() {
      rejectAndKill(`${label} aborted`, 'PROCESS_ABORTED', 'abort');
    }

    let watchdog = createInactivityWatchdog(() => {
      rejectAndKill(`${label} stalled: no output for ${inactivityMs}ms`, 'PROCESS_INACTIVITY_TIMEOUT', 'inactivity-timeout');
    }, inactivityMs);

    try {
      child = spawn(command, args, {
        cwd,
        env,
        shell,
        detached: true,
        stdio: [stdin, 'pipe', 'pipe'],
      });
    } catch (error) {
      reject(error);
      return;
    }

    emit({ type: 'start' });

    /**
     * @param {'stdout'|'stderr'} streamName
     * @param {Buffer|string} chunk
     * @returns {void}
     */
    function handleChunk(streamName, chunk) {
      watchdog.kick();
      let buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk));
      let text = buffer.toString();
      if (collect) {
        outputBytes += buffer.length;
        if (streamName === 'stdout') stdout += text;
        else stderr += text;
        if (outputBytes > maxBuffer) {
          rejectAndKill(`${label} exceeded output buffer limit of ${maxBuffer} bytes`, 'PROCESS_OUTPUT_LIMIT', 'output-limit');
          return;
        }
      }
      emit({ type: streamName, text });
      if (!silent) {
        (streamName === 'stdout' ? process.stdout : process.stderr).write(buffer);
      }
    }

    child.stdout?.on('data', (chunk) => handleChunk('stdout', chunk));
    child.stderr?.on('data', (chunk) => handleChunk('stderr', chunk));

    if (signal) {
      if (signal.aborted) abortProcess();
      else signal.addEventListener('abort', abortProcess, { once: true });
    }

    if (timeoutMs) {
      deadlineTimer = setTimeout(() => {
        rejectAndKill(`${label} exceeded hard timeout of ${timeoutMs}ms`, 'PROCESS_TIMEOUT', 'timeout');
      }, timeoutMs);
      deadlineTimer.unref?.();
    }

    child.on('error', (error) => {
      if (settled) return;
      settled = true;
      cleanupTimers();
      clearTimeout(shutdownTimer);
      reject(error);
    });

    child.on('close', (code, exitSignal) => {
      clearTimeout(shutdownTimer);
      if (settled) return;
      settled = true;
      cleanupTimers();
      emit({ type: 'exit', code, signal: exitSignal });
      let durationMs = Date.now() - startedAt;
      if (code === 0) {
        resolve({ stdout, stderr, code, signal: exitSignal, pid: child.pid, durationMs });
        return;
      }
      let error = /** @type {ProcessError} */ (
        new Error(`${label} exited with ${exitSignal ? `signal ${exitSignal}` : `code ${code}`}${stderr ? `: ${stderr.trim()}` : ''}`)
      );
      error.code = code;
      error.signal = exitSignal;
      error.stdout = stdout;
      error.stderr = stderr;
      error.pid = child.pid;
      reject(error);
    });

    watchdog.kick();
  });
}

/**
 * Run a shell command with the same watchdog behavior as process execution.
 * @param {string} command
 * @param {Object|WatchedProcessOptions} [options]
 * @returns {Promise<ProcessResult>}
 */
export function runShellWithWatchdog(command, options = {}) {
  return runProcessWithWatchdog(command, [], {
    ...options,
    shell: true,
    label: options.label || command,
  });
}

/**
 * Start a detached background process and return its pid.
 * @param {string} command
 * @param {string[]} [args]
 * @param {Object|Pick<WatchedProcessOptions, 'cwd'|'env'|'label'>} [options]
 * @returns {number|undefined}
 */
export function startDetachedProcess(command, args = [], options = {}) {
  let child = spawn(command, args, {
    cwd: options.cwd,
    env: options.env,
    detached: true,
    stdio: 'ignore',
  });
  child.unref();
  return child.pid;
}
