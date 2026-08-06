import { spawn } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { acquireTestSuiteLock } from './test-lock.js';

const signalExitCodes = new Map([
  ['SIGHUP', 129],
  ['SIGINT', 130],
  ['SIGTERM', 143],
  ['SIGKILL', 137],
]);
const browserSmokeFile = 'tests/graph-browser-smoke.test.js';
const chromiumSmokeEnv = 'SYMBIOTE_UI_CHROMIUM_SMOKE';
const chromiumSmokeFlags = new Set(['--chromium-smoke', '--run-chromium-smoke']);
const browserSmokeSegments = [
  'cascade lab graph nodes render non-empty with route styles and compact mode in a real browser',
  'design protocol applies recipe themes and policy diagnostics in a real browser',
  'node-canvas flow-scroll drag keeps repeated pan gestures continuous',
  'node-canvas focuses multiple nodes by fitting them into the viewport',
  'canvas-graph semantic force gravity visual groups stay clustered in a real browser',
  'agent workspace demo exposes the public feature showcase groups',
  'showcase chat workspace exercises host event flow through library primitives',
  'three spatial graph adapter renders and drags through the browser module path',
  'cascade lab chat composer keeps voice controls inside the input surface responsively',
  'node-canvas setEditorModel renders the advertised serializable WebMCP model path',
  'node-canvas grid LOD and chat pattern aliases remain independent in computed styles',
  'node-canvas context menu uses viewport coordinates and clamps to visible bounds',
  'node-canvas context menu survives native right-click pointer sequencing',
  'standalone applyCascadeTheme computed style regression without preloading',
];
const managedBrowserCandidates = [
  process.env.CHROME_BIN,
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
  '/Applications/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
].filter(Boolean);
const unsupportedMacBrowserCandidates = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Google Chrome Dev.app/Contents/MacOS/Google Chrome Dev',
  '/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary',
].filter(Boolean);

function parseArgs(argv) {
  let suite = 'all';
  let chromiumSmoke = isTruthy(process.env[chromiumSmokeEnv]);
  let separatorIndex = argv.indexOf('--');
  let optionArgs = separatorIndex === -1 ? argv : argv.slice(0, separatorIndex);
  let commandArgs = separatorIndex === -1 ? [] : argv.slice(separatorIndex + 1);

  for (let index = 0; index < optionArgs.length; index++) {
    if (optionArgs[index] === '--suite') {
      suite = optionArgs[index + 1] || suite;
      index++;
    } else if (chromiumSmokeFlags.has(optionArgs[index])) {
      chromiumSmoke = true;
    }
  }

  return { suite, commandArgs, chromiumSmoke: chromiumSmoke || suite === 'browser' };
}

function isTruthy(value) {
  return ['1', 'true', 'yes', 'on'].includes(String(value || '').toLowerCase());
}

let { suite, commandArgs, chromiumSmoke } = parseArgs(process.argv.slice(2));
if (commandArgs.length === 0) {
  console.error(`Usage: node tests/run-tests.js [--suite name] [--chromium-smoke] -- node --test tests/*.test.js

Set ${chromiumSmokeEnv}=1 as an alternative to --chromium-smoke.`);
  process.exit(2);
}

let child;
let childExit;
let lock;
let terminating = false;

async function releaseLock() {
  await lock?.release?.();
}

function releaseLockSync() {
  if (!lock?.lockDir) return;
  rmSync(lock.lockDir, { recursive: true, force: true });
}

function childIsRunning() {
  return child && child.exitCode === null && child.signalCode === null;
}

function isTestFileArg(arg) {
  return /^tests\/[^/]+\.test\.js$/.test(arg);
}

function isAllTestsArg(arg) {
  return arg === 'tests/*.test.js';
}

function hasTestNamePattern(args) {
  return args.some((arg) => arg === '--test-name-pattern' || arg.startsWith('--test-name-pattern='));
}

function escapeRegExp(value) {
  return String(value).replace(/[\\^$.*+?()[\]{}|]/g, '\\$&');
}

function insertBeforeTestFiles(args, option) {
  let index = args.findIndex((arg) => isAllTestsArg(arg) || isTestFileArg(arg));
  if (index === -1) return [...args, option];
  return [...args.slice(0, index), option, ...args.slice(index)];
}

function browserPreflightStatus() {
  if (process.env.CHROME_BIN && !existsSync(process.env.CHROME_BIN)) {
    return {
      ready: false,
      hardError: true,
      message: `CHROME_BIN does not exist: ${process.env.CHROME_BIN}`,
    };
  }
  if (process.env.SYMBIOTE_UI_ALLOW_SYSTEM_CHROME === '1') return { ready: true };
  if (managedBrowserCandidates.some((candidate) => existsSync(candidate))) return { ready: true };

  let systemBrowser = unsupportedMacBrowserCandidates.find((candidate) => existsSync(candidate));
  let message = [
    'Chromium smoke skipped: no managed Chrome binary was found.',
    'Install Chrome for Testing or Chromium, or set CHROME_BIN to a standalone browser executable.',
  ];
  if (systemBrowser) {
    message.splice(1, 0, `Found unsupported macOS Chrome app launcher: ${systemBrowser}`);
    message.push('To force the unsupported system launcher for local diagnosis only, set SYMBIOTE_UI_ALLOW_SYSTEM_CHROME=1.');
  } else {
    message.splice(1, 0, 'No managed Chrome binary was found.');
  }
  return { ready: false, hardError: false, message: message.join('\n') };
}

function errorBatch(message) {
  return {
    command: process.execPath,
    args: ['--input-type=module', '-e', `console.error(${JSON.stringify(message)}); process.exit(1);`],
  };
}

function skipBatch(message) {
  return {
    command: process.execPath,
    args: ['--input-type=module', '-e', `console.error(${JSON.stringify(message)}); process.exit(0);`],
  };
}

async function listTestFiles() {
  let entries = await readdir('tests');
  return entries
    .filter((entry) => entry.endsWith('.test.js'))
    .map((entry) => `tests/${entry}`)
    .sort();
}

async function resolveTestFileArgs(args) {
  let files = [];
  for (let arg of args) {
    if (isAllTestsArg(arg)) {
      files.push(...await listTestFiles());
    } else if (isTestFileArg(arg)) {
      files.push(arg);
    }
  }
  return [...new Set(files)];
}

function replaceTestFileArgs(args, files) {
  let inserted = false;
  return args.flatMap((arg) => {
    if (!isAllTestsArg(arg) && !isTestFileArg(arg)) return [arg];
    if (inserted) return [];
    inserted = true;
    return files;
  });
}

async function createBatches(commandArgs, options = {}) {
  let [command, ...args] = commandArgs;
  let files = await resolveTestFileArgs(args);
  if (!args.includes('--test') || !files.includes(browserSmokeFile)) {
    return [{ command, args }];
  }

  let batches = [];
  let nonBrowserFiles = files.filter((file) => file !== browserSmokeFile);
  if (nonBrowserFiles.length > 0) {
    batches.push({ command, args: replaceTestFileArgs(args, nonBrowserFiles) });
  }

  if (!options.chromiumSmoke) {
    batches.push(skipBatch(`Chromium smoke skipped: enable with --chromium-smoke or ${chromiumSmokeEnv}=1.`));
    return batches;
  }

  let preflight = browserPreflightStatus();
  if (!preflight.ready) {
    batches.push(preflight.hardError ? errorBatch(preflight.message) : skipBatch(preflight.message));
    return batches;
  }

  let browserArgs = replaceTestFileArgs(args, [browserSmokeFile]);
  if (hasTestNamePattern(args)) {
    batches.push({ command, args: browserArgs });
    return batches;
  }

  for (let segment of browserSmokeSegments) {
    batches.push({
      command,
      args: insertBeforeTestFiles(browserArgs, `--test-name-pattern=^${escapeRegExp(segment)}$`),
    });
  }
  return batches;
}

function terminate(signal) {
  if (terminating) return;
  terminating = true;
  if (childIsRunning()) {
    if (child.pid) {
      try {
        process.kill(-child.pid, signal);
      } catch {
        child.kill(signal);
      }
    } else {
      child.kill(signal);
    }
  }
  let killTimer = setTimeout(() => {
    if (child && child.exitCode === null && child.signalCode === null) {
      if (child.pid) {
        try {
          process.kill(-child.pid, 'SIGKILL');
        } catch {
          child.kill('SIGKILL');
        }
      } else {
        child.kill('SIGKILL');
      }
    }
  }, 3000);
  let waitForChild = childExit || Promise.resolve();
  waitForChild.finally(() => {
    clearTimeout(killTimer);
    releaseLockSync();
    process.exit(signalExitCodes.get(signal));
  });
}

function runChild(command, args) {
  child = spawn(command, args, {
    cwd: process.cwd(),
    detached: true,
    env: {
      ...process.env,
      SYMBIOTE_UI_TEST_SUITE_LOCK_ID: lock?.meta?.key || '',
    },
    stdio: 'inherit',
  });

  childExit = new Promise((resolve) => {
    child.on('exit', (status, signal) => {
      if (signal) {
        resolve(signalExitCodes.get(signal) || 128);
        return;
      }
      resolve(status ?? 1);
    });
  });
  return childExit;
}

for (let signal of ['SIGHUP', 'SIGINT', 'SIGTERM']) {
  process.once(signal, () => terminate(signal));
}

lock = await acquireTestSuiteLock(suite, { signals: false });
let code = 0;
let batches = await createBatches(commandArgs, { chromiumSmoke });
for (let batch of batches) {
  let batchCode = await runChild(batch.command, batch.args);
  if (code === 0 && batchCode !== 0) code = batchCode;
}
await releaseLock();
process.exit(code);
