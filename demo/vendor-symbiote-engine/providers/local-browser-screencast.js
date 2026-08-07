import { execFile as nodeExecFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { promisify } from 'node:util';

import { normalizeRenderArtifact } from '../contracts/render-provider.js';
import {
  createRenderFrameCompletionTracker,
  partitionRenderFrameRanges,
} from '../render-workers.js';

const defaultExecFile = promisify(nodeExecFile);

function abortError(signal) {
  let reason = signal?.reason;
  if (reason instanceof Error) return reason;
  let error = new Error(cleanString(reason, 'operation aborted') || 'operation aborted');
  error.name = 'AbortError';
  error.code = 'ABORT_ERR';
  return error;
}

function assertNotAborted(signal) {
  if (signal?.aborted) throw abortError(signal);
}

function sleep(ms, signal) {
  assertNotAborted(signal);
  return new Promise((resolveSleep, rejectSleep) => {
    let timer = setTimeout(done, Math.max(0, ms));
    function cleanup() {
      clearTimeout(timer);
      signal?.removeEventListener?.('abort', onAbort);
    }
    function done() {
      cleanup();
      resolveSleep();
    }
    function onAbort() {
      cleanup();
      rejectSleep(abortError(signal));
    }
    signal?.addEventListener?.('abort', onAbort, { once: true });
  });
}

function withAbort(promise, signal) {
  assertNotAborted(signal);
  if (!signal) return promise;
  let settled = false;
  let wrapped = Promise.resolve(promise);
  let aborted = new Promise((_, reject) => {
    function onAbort() {
      if (settled) return;
      reject(abortError(signal));
    }
    signal.addEventListener('abort', onAbort, { once: true });
    wrapped.finally(() => {
      settled = true;
      signal.removeEventListener('abort', onAbort);
    }).catch(() => {});
  });
  wrapped.catch(() => {});
  return Promise.race([wrapped, aborted]);
}

function cleanString(value, fallback = '') {
  let text = String(value ?? fallback ?? '').replace(/\s+/g, ' ').trim();
  return text && text !== 'undefined' && text !== 'null' ? text : String(fallback || '').trim();
}

function cleanFrameFormat(value, fallback = 'png') {
  let text = cleanString(value, fallback).toLowerCase();
  if (text === 'jpg') return 'jpeg';
  return ['png', 'jpeg', 'webp'].includes(text) ? text : fallback;
}

function frameFormatExtension(format) {
  return format === 'jpeg' ? 'jpg' : format;
}

function frameFormatMimeType(format) {
  if (format === 'jpeg') return 'image/jpeg';
  if (format === 'webp') return 'image/webp';
  return 'image/png';
}

function positiveNumber(value, fallback, path) {
  let number = Number(value ?? fallback);
  if (!Number.isFinite(number) || number <= 0) {
    throw new Error(`${path}: must be a positive number`);
  }
  return number;
}

function nonNegativeInteger(value, fallback, path, max = Number.MAX_SAFE_INTEGER) {
  let number = Number(value ?? fallback);
  if (!Number.isFinite(number) || number < 0) {
    throw new Error(`${path}: must be a non-negative integer`);
  }
  return Math.min(max, Math.floor(number));
}

function resolvePath(cwd, filePath, pathName) {
  let value = cleanString(filePath, '');
  if (!value) throw new Error(`${pathName}: is required`);
  return resolve(cwd, value);
}

function safeId(value) {
  return cleanString(value, 'screencast').replace(/[^a-zA-Z0-9._-]+/g, '-').slice(0, 80) || 'screencast';
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

async function fileSha256(path) {
  return sha256(await readFile(path));
}

function validateRegexPattern(pattern, path) {
  let source = cleanString(pattern, '');
  if (!source) return;
  try {
    new RegExp(source, 'i');
  } catch (error) {
    throw new Error(`${path}: invalid regular expression: ${error.message}`);
  }
}

function cleanPathParts(path, pathName) {
  let parts = cleanString(path, '')
    .split('.')
    .map((part) => cleanString(part, ''))
    .filter(Boolean);
  if (parts.length === 0) throw new Error(`${pathName}: is required`);
  if (parts.some((part) => !/^[a-zA-Z_$][\w$]*$/.test(part))) {
    throw new Error(`${pathName}: must be a dotted window path`);
  }
  return parts;
}

async function waitForText(page, text, timeoutMs = 10000) {
  await page.waitForFunction(
    (needle) => (document.body?.innerText || '').includes(needle),
    { timeout: timeoutMs },
    text,
  );
}

async function waitForWindowMethod(page, path, timeoutMs = 10000) {
  let parts = cleanPathParts(path, 'windowMethod.path');
  await page.waitForFunction(
    (methodParts) => {
      let value = window;
      for (let part of methodParts) value = value?.[part];
      return typeof value === 'function';
    },
    { timeout: timeoutMs },
    parts,
  );
}

async function waitForWindowPredicate(page, path, timeoutMs = 10000) {
  let parts = cleanPathParts(path, 'windowPredicate.path');
  await page.waitForFunction(
    (predicateParts) => {
      let owner = window;
      for (let i = 0; i < predicateParts.length - 1; i += 1) owner = owner?.[predicateParts[i]];
      let value = owner?.[predicateParts[predicateParts.length - 1]];
      if (typeof value === 'function') {
        try { return Boolean(value.call(owner)); } catch { return false; }
      }
      return Boolean(value);
    },
    { timeout: timeoutMs },
    parts,
  );
}

async function waitForFontsReady(page, timeoutMs = 10000) {
  if (typeof page.evaluate !== 'function') return { supported: false };
  return page.evaluate(async ({ timeoutMs: limitMs }) => {
    if (!document.fonts?.ready) return { supported: false };
    let ready = document.fonts.ready.then(() => ({ supported: true, ready: true }));
    if (!limitMs) return ready;
    let timeout = new Promise((resolve) => {
      setTimeout(() => resolve({ supported: true, ready: false, timedOut: true }), Math.max(0, limitMs));
    });
    let result = await Promise.race([ready, timeout]);
    if (result?.timedOut) throw new Error(`document fonts did not become ready within ${limitMs}ms`);
    return result;
  }, { timeoutMs });
}

async function callWindowMethod(page, action, log) {
  let parts = cleanPathParts(action.path, 'callWindowMethod.path');
  log(`call window method: ${parts.join('.')}`);
  await waitForWindowMethod(page, parts.join('.'), action.timeoutMs || 10000);
  return page.evaluate(async ({ methodParts, args, waitForPromise }) => {
    let owner = window;
    for (let i = 0; i < methodParts.length - 1; i += 1) owner = owner?.[methodParts[i]];
    let method = owner?.[methodParts[methodParts.length - 1]];
    if (typeof method !== 'function') throw new Error(`window method not found: ${methodParts.join('.')}`);
    let result = method.apply(owner, Array.isArray(args) ? args : []);
    if (waitForPromise !== false && result && typeof result.then === 'function') {
      result = await result;
    }
    return result ?? null;
  }, {
    methodParts: parts,
    args: Array.isArray(action.args) ? action.args : [],
    waitForPromise: action.waitForPromise !== false,
  });
}

async function captureWindowState(page, captureState) {
  if (!captureState?.enabled) return null;
  let parts = cleanPathParts(captureState.path, 'captureState.path');
  return page.evaluate(async ({ methodParts }) => {
    let value = window;
    for (let part of methodParts) value = value?.[part];
    if (typeof value === 'function') value = value();
    if (value && typeof value.then === 'function') value = await value;
    return value ?? null;
  }, { methodParts: parts });
}

async function clickText(page, text, { exact = false } = {}) {
  let handles = await page.$$('button,[role="button"],a,input,textarea,[tabindex]');
  for (let handle of handles) {
    let matched = await handle.evaluate((el, { text: needle, exact: exactMatch }) => {
      let style = getComputedStyle(el);
      let rect = el.getBoundingClientRect();
      if (style.display === 'none' || style.visibility === 'hidden' || rect.width <= 0 || rect.height <= 0) return false;
      let clean = String(el.innerText || el.textContent || el.value || '').replace(/\s+/g, ' ').trim();
      return exactMatch ? clean === needle : clean.includes(needle);
    }, { text, exact });
    if (!matched) {
      await handle.dispose();
      continue;
    }
    await handle.click({ delay: 20 });
    for (let other of handles) {
      if (other !== handle) await other.dispose();
    }
    await handle.dispose();
    return;
  }
  throw new Error(`clickText target not found: ${text}`);
}

async function clickRowText(page, action) {
  let rect = await page.evaluate(({ text: needle, selector, excludeTextPattern }) => {
    let excludePattern = excludeTextPattern ? new RegExp(excludeTextPattern, 'i') : null;
    let rows = Array.from(document.querySelectorAll(selector || 'tr,[role="row"]'));
    let target = rows.find((el) => {
      let style = getComputedStyle(el);
      let box = el.getBoundingClientRect();
      if (style.display === 'none' || style.visibility === 'hidden' || box.width <= 0 || box.height <= 0) return false;
      let text = String(el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim();
      if (!text || (excludePattern && excludePattern.test(text))) return false;
      return text.includes(needle);
    });
    if (!target) return null;
    let box = target.getBoundingClientRect();
    return { x: box.left + box.width / 2, y: box.top + box.height / 2 };
  }, action);
  if (!rect) throw new Error(`clickRowText target not found: ${action.text}`);
  await page.mouse.click(rect.x, rect.y, { delay: 20 });
}

async function clickRowIndex(page, action) {
  let rect = await page.evaluate(({ rowIndex, selector, excludeTextPattern }) => {
    let excludePattern = excludeTextPattern ? new RegExp(excludeTextPattern, 'i') : null;
    let rows = Array.from(document.querySelectorAll(selector || 'tr,[role="row"]'))
      .filter((el) => {
        let style = getComputedStyle(el);
        let rect = el.getBoundingClientRect();
        if (style.display === 'none' || style.visibility === 'hidden' || rect.width <= 0 || rect.height <= 0) return false;
        let text = String(el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim();
        return text && (!excludePattern || !excludePattern.test(text));
      });
    let target = rows[rowIndex];
    if (!target) return null;
    let box = target.getBoundingClientRect();
    return { x: box.left + box.width / 2, y: box.top + box.height / 2 };
  }, action);
  if (!rect) throw new Error(`clickRowIndex target not found: ${action.rowIndex}`);
  await page.mouse.click(rect.x, rect.y, { delay: 20 });
}

async function executeAction(page, action, log) {
  if (action.type === 'waitMs') {
    await sleep(action.durationMs);
    return;
  }
  if (action.type === 'waitForText') {
    log(`wait text: ${action.text}`);
    await waitForText(page, action.text, action.timeoutMs || 10000);
    return;
  }
  if (action.type === 'waitForSelector') {
    log(`wait selector: ${action.selector}`);
    await page.waitForSelector(action.selector, {
      timeout: action.timeoutMs || 10000,
      state: selectorWaitState(action.state),
    });
    return;
  }
  if (action.type === 'waitForWindowMethod') {
    log(`wait window method: ${action.path}`);
    await waitForWindowMethod(page, action.path, action.timeoutMs || 10000);
    return;
  }
  if (action.type === 'waitForWindowPredicate') {
    log(`wait window predicate: ${action.path}`);
    await waitForWindowPredicate(page, action.path, action.timeoutMs || 10000);
    return;
  }
  if (action.type === 'callWindowMethod') {
    await callWindowMethod(page, action, log);
    return;
  }
  if (action.type === 'clickText') {
    log(`click text: ${action.text}`);
    await clickText(page, action.text, { exact: action.exact });
    return;
  }
  if (action.type === 'clickSelector') {
    log(`click selector: ${action.selector}`);
    await page.click(action.selector);
    return;
  }
  if (action.type === 'clickRowText') {
    log(`click row: ${action.text}`);
    validateRegexPattern(action.excludeTextPattern, 'clickRowText.excludeTextPattern');
    await clickRowText(page, action);
    return;
  }
  if (action.type === 'clickRowIndex') {
    log(`click row index: ${action.rowIndex}`);
    validateRegexPattern(action.excludeTextPattern, 'clickRowIndex.excludeTextPattern');
    await clickRowIndex(page, action);
    return;
  }
  throw new Error(`Unsupported screencast action: ${action.type}`);
}

async function installCaptionOverlay(page) {
  await page.evaluate(() => {
    if (document.getElementById('sym-screencast-caption-style')) return;
    let style = document.createElement('style');
    style.id = 'sym-screencast-caption-style';
    style.textContent = `
      .sym-screencast-caption {
        position: fixed;
        left: 50%;
        bottom: 18px;
        z-index: 2147483647;
        width: min(760px, calc(100vw - 48px));
        transform: translateX(-50%);
        display: flex;
        align-items: flex-start;
        gap: 10px;
        padding: 10px 14px;
        border: 1px solid rgba(255,255,255,0.22);
        border-radius: 8px;
        background: rgba(8, 12, 18, 0.86);
        color: #f8fafc;
        box-shadow: 0 16px 42px rgba(0,0,0,0.35);
        font: 600 15px/1.35 Inter, system-ui, sans-serif;
        pointer-events: none;
      }
      .sym-screencast-caption[hidden] { display: none !important; }
      .sym-screencast-caption__speaker {
        flex: 0 0 auto;
        color: #8fd3ff;
        font-size: 11px;
        font-weight: 800;
        letter-spacing: .08em;
        text-transform: uppercase;
      }
      .sym-screencast-caption__text { min-width: 0; }
    `;
    document.head.appendChild(style);

    let caption = document.createElement('div');
    caption.id = 'sym-screencast-caption';
    caption.className = 'sym-screencast-caption';
    caption.hidden = true;
    caption.innerHTML = '<span class="sym-screencast-caption__speaker"></span><span class="sym-screencast-caption__text"></span>';
    document.body.appendChild(caption);
  });
}

async function setCaption(page, cue) {
  await page.evaluate((nextCue) => {
    let caption = document.getElementById('sym-screencast-caption');
    if (!caption) return;
    if (!nextCue) {
      caption.hidden = true;
      return;
    }
    caption.hidden = false;
    caption.querySelector('.sym-screencast-caption__speaker').textContent = nextCue.speaker || 'Agent';
    caption.querySelector('.sym-screencast-caption__text').textContent = nextCue.text || '';
  }, cue);
}

function captionAt(captions, elapsedMs) {
  if (!captions?.enabled) return null;
  return captions.cues.find((cue) => elapsedMs >= cue.startMs && elapsedMs < cue.endMs) || null;
}

function normalizeVideo(video = {}) {
  let fps = positiveNumber(video.fps, undefined, 'renderJob.video.fps');
  let durationMs = positiveNumber(video.durationMs, undefined, 'renderJob.video.durationMs');
  return {
    width: Math.round(positiveNumber(video.width, undefined, 'renderJob.video.width')),
    height: Math.round(positiveNumber(video.height, undefined, 'renderJob.video.height')),
    fps,
    durationMs,
    frameCount: Math.round(positiveNumber(video.frameCount, (durationMs / 1000) * fps, 'renderJob.video.frameCount')),
  };
}

function normalizeRenderClock(job, executionOptions, providerOptions, video) {
  let source = job.renderClock && typeof job.renderClock === 'object' ? job.renderClock : null;
  let requestedWorkers = Math.max(1, Math.floor(Number(
    executionOptions.workerCount
      ?? job.execution?.workerCount
      ?? source?.workerCount
      ?? providerOptions.workerCount
      ?? 1,
  ) || 1));
  if (!source) {
    if (requestedWorkers > 1) {
      throw new Error('parallel capture requires renderJob.renderClock');
    }
    return { mode: 'realtime', workerCount: 1 };
  }
  let mode = cleanString(source.mode, 'deterministic');
  if (mode !== 'deterministic') {
    throw new Error('renderJob.renderClock.mode: supported value is "deterministic"');
  }
  let path = cleanPathParts(source.path, 'renderJob.renderClock.path').join('.');
  let timeline = Array.isArray(job.timeline) ? job.timeline : [];
  if (timeline.length) {
    throw new Error('deterministic capture does not support stateful renderJob.timeline actions');
  }
  let workerCount = Math.min(video.frameCount, requestedWorkers);
  let setupStateSource = source.setupState && typeof source.setupState === 'object'
    ? source.setupState
    : null;
  let setupState = setupStateSource ? {
    exportPath: cleanPathParts(setupStateSource.exportPath, 'renderJob.renderClock.setupState.exportPath').join('.'),
    importPath: cleanPathParts(setupStateSource.importPath, 'renderJob.renderClock.setupState.importPath').join('.'),
  } : null;
  if (workerCount > 1 && !setupState) {
    let error = new Error('parallel deterministic capture requires renderJob.renderClock.setupState');
    error.code = 'RENDER_SETUP_STATE_REQUIRED';
    throw error;
  }
  let requestedSeamSsim = Number(source.seamSsim ?? 0.999999);
  let seamSsim = Number.isFinite(requestedSeamSsim)
    ? Math.min(1, Math.max(0.999999, requestedSeamSsim))
    : 0.999999;
  return {
    mode,
    path,
    workerCount,
    settleFrames: nonNegativeInteger(source.settleFrames, 2, 'renderJob.renderClock.settleFrames', 10),
    timeoutMs: Math.round(positiveNumber(source.timeoutMs, 10000, 'renderJob.renderClock.timeoutMs')),
    setupState,
    seamSsim,
    seamProofFrames: nonNegativeInteger(
      source.seamProofFrames,
      3,
      'renderJob.renderClock.seamProofFrames',
      5,
    ) || 1,
  };
}

function createPoolAbortController(signal) {
  let controller = new AbortController();
  let onAbort = () => controller.abort(signal.reason);
  if (signal?.aborted) onAbort();
  else signal?.addEventListener?.('abort', onAbort, { once: true });
  return {
    controller,
    dispose() {
      signal?.removeEventListener?.('abort', onAbort);
    },
  };
}

function withTimeout(promise, timeoutMs, message) {
  let timer;
  let timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

async function callRenderAt(page, renderClock, frameContext, signal) {
  let methodParts = cleanPathParts(renderClock.path, 'renderJob.renderClock.path');
  let result = await withTimeout(withAbort(page.evaluate(async ({ methodParts: parts, frameContext: context }) => {
    let owner = window;
    for (let index = 0; index < parts.length - 1; index += 1) owner = owner?.[parts[index]];
    let method = owner?.[parts[parts.length - 1]];
    if (typeof method !== 'function') throw new Error(`render clock method not found: ${parts.join('.')}`);
    return method.call(owner, context);
  }, { methodParts, frameContext }), signal), renderClock.timeoutMs,
  `render clock ${renderClock.path} timed out at frame ${frameContext.frameIndex}`);
  let presentedTimeMs = Number(result?.presentedTimeMs);
  if (!Number.isFinite(presentedTimeMs) || Math.abs(presentedTimeMs - frameContext.timeMs) > 0.01) {
    throw new Error(`render clock ${renderClock.path} presented invalid time at frame ${frameContext.frameIndex}`);
  }
  let projectionId = cleanString(result?.projectionId, '');
  if (!projectionId) {
    throw new Error(`render clock ${renderClock.path} returned no projectionId at frame ${frameContext.frameIndex}`);
  }
  if (renderClock.settleFrames > 0) {
    await withTimeout(withAbort(page.evaluate(async ({ settleFrames, frameIndex }) => {
      for (let index = 0; index < settleFrames; index += 1) {
        await new Promise((resolveFrame) => requestAnimationFrame(resolveFrame));
      }
      return { settled: true, frameIndex };
    }, {
      settleFrames: renderClock.settleFrames,
      frameIndex: frameContext.frameIndex,
    }), signal), renderClock.timeoutMs,
    `render presentation barrier timed out at frame ${frameContext.frameIndex}`);
  }
  return {
    presentedTimeMs,
    projectionId,
    contentDigest: cleanString(result?.contentDigest, ''),
  };
}

function createFramesDir(root, id) {
  return join(root || join(os.tmpdir(), 'symbiote-engine-render'), `${safeId(id)}-${Date.now()}`);
}

function createBrowserProfileDir(root, id) {
  return join(root || join(os.tmpdir(), 'symbiote-engine-browser'), `${safeId(id)}-${Date.now()}`);
}

function appendCleanupPath(job, key, path) {
  if (!path) return;
  if (!job.cleanup || typeof job.cleanup !== 'object' || Array.isArray(job.cleanup)) job.cleanup = {};
  let list = Array.isArray(job.cleanup[key]) ? job.cleanup[key] : [];
  if (!list.includes(path)) job.cleanup[key] = [...list, path];
}

function actionProgressLabel(action = {}) {
  if (action.type === 'waitForText' || action.type === 'clickText' || action.type === 'clickRowText') {
    return `${action.type}:${cleanString(action.text, '')}`;
  }
  if (action.type === 'waitForSelector' || action.type === 'clickSelector') {
    return `${action.type}:${cleanString(action.selector, '')}`;
  }
  if (action.type === 'waitForWindowMethod' || action.type === 'waitForWindowPredicate' || action.type === 'callWindowMethod') {
    return `${action.type}:${cleanString(action.path, '')}`;
  }
  if (action.type === 'clickRowIndex') return `${action.type}:${action.rowIndex}`;
  if (action.type === 'waitMs') return `${action.type}:${action.durationMs}`;
  return cleanString(action.type, 'action');
}

function selectorWaitState(value) {
  let state = cleanString(value, 'visible');
  return ['attached', 'detached', 'visible', 'hidden'].includes(state) ? state : 'visible';
}

function emitStage(executionOptions, stage, detail = {}) {
  if (typeof executionOptions.onStage !== 'function') return;
  executionOptions.onStage({
    stage,
    ...detail,
  });
}

async function closeBrowserWorker(browser, executionOptions, detail = {}) {
  let timeoutMs = Math.max(100, Math.round(Number(executionOptions.browserCloseTimeoutMs) || 5000));
  emitStage(executionOptions, 'browser:close', detail);
  let timer;
  let close = Promise.resolve()
    .then(() => browser.close())
    .then(() => true, () => true);
  let timedOut = await Promise.race([
    close.then(() => false),
    new Promise((resolveTimeout) => {
      timer = setTimeout(() => resolveTimeout(true), timeoutMs);
    }),
  ]).finally(() => clearTimeout(timer));
  if (timedOut) emitStage(executionOptions, 'browser:close.timeout', { ...detail, timeoutMs });
  emitStage(executionOptions, 'browser:closed', { ...detail, timedOut });
  return { timedOut, timeoutMs };
}

async function closeBrowserLaunchAfterAbort(launchPromise, executionOptions, detail = {}) {
  let timeoutMs = Math.max(100, Math.round(Number(executionOptions.browserCloseTimeoutMs) || 5000));
  let timer;
  let launched = await Promise.race([
    launchPromise.then((browser) => ({ browser }), () => ({ browser: null })),
    new Promise((resolveTimeout) => {
      timer = setTimeout(() => resolveTimeout(null), timeoutMs);
    }),
  ]).finally(() => clearTimeout(timer));
  if (launched?.browser) return closeBrowserWorker(launched.browser, executionOptions, detail);
  if (launched) return { timedOut: false, timeoutMs };
  emitStage(executionOptions, 'browser:launch.cleanup.timeout', { ...detail, timeoutMs });
  launchPromise
    .then((browser) => closeBrowserWorker(browser, executionOptions, detail))
    .catch(() => {});
  return { timedOut: true, timeoutMs };
}

function wantsFrameSequenceArtifact(job, executionOptions = {}) {
  let requestedKind = cleanString(
    executionOptions.artifactKind || job.artifactKind || job.output?.kind,
    '',
  );
  return executionOptions.skipEncode === true || requestedKind === 'frame-sequence';
}

async function settleWorkerPool(tasks, controller) {
  let firstFailure = null;
  let promises = tasks.map((task) => Promise.resolve().then(task).catch((error) => {
    if (!firstFailure) {
      firstFailure = error;
      controller.abort(error);
    }
    throw error;
  }));
  let settled = await Promise.allSettled(promises);
  if (firstFailure) throw firstFailure;
  return settled.map((result) => result.value);
}

async function prepareBrowserWorker({
  puppeteer,
  job,
  video,
  range,
  profileDir,
  renderClock,
  signal,
  log,
  executionOptions,
  setupStateImport = null,
}) {
  let workerStartedAt = Date.now();
  let detail = { workerIndex: range.workerIndex, startFrame: range.startFrame, endFrame: range.endFrame };
  emitStage(executionOptions, 'browser:launch', detail);
  assertNotAborted(signal);
  let launchPromise = Promise.resolve().then(() => puppeteer.launch({
    headless: true,
    userDataDir: profileDir,
    args: [
      `--window-size=${video.width},${video.height}`,
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--force-color-profile=srgb',
      '--hide-scrollbars',
    ],
  }));
  let browser;
  try {
    browser = await withAbort(launchPromise, signal);
  } catch (error) {
    if (signal?.aborted) await closeBrowserLaunchAfterAbort(launchPromise, executionOptions, detail);
    throw error;
  }
  try {
    emitStage(executionOptions, 'browser:page', detail);
    let page = await withAbort(browser.newPage(), signal);
    await withAbort(page.setViewport({
      width: video.width,
      height: video.height,
      deviceScaleFactor: 1,
    }), signal);
    emitStage(executionOptions, 'browser:navigate', { ...detail, url: job.surface.url });
    await withAbort(page.goto(job.surface.url, { waitUntil: 'domcontentloaded', timeout: 30000 }), signal);
    emitStage(executionOptions, 'browser:navigated', { ...detail, url: job.surface.url });

    let setupActions = job.setup || [];
    emitStage(executionOptions, 'setup:start', { ...detail, actions: setupActions.length });
    for (let index = 0; index < setupActions.length; index += 1) {
      let action = setupActions[index];
      emitStage(executionOptions, 'setup-action:start', {
        ...detail,
        index,
        type: action.type,
        label: actionProgressLabel(action),
      });
      try {
        await withAbort(executeAction(page, action, log), signal);
      } catch (error) {
        let wrapped = new Error(`setup action ${index} (${actionProgressLabel(action)}) failed: ${error?.message || error}`);
        wrapped.cause = error;
        throw wrapped;
      }
      emitStage(executionOptions, 'setup-action:done', {
        ...detail,
        index,
        type: action.type,
        label: actionProgressLabel(action),
      });
    }
    emitStage(executionOptions, 'setup:done', { ...detail, actions: setupActions.length });

    if (setupStateImport) {
      emitStage(executionOptions, 'setup-state:import', detail);
      await withAbort(callWindowMethod(page, {
        path: setupStateImport.path,
        args: [setupStateImport.payload],
        waitForPromise: true,
        timeoutMs: renderClock.timeoutMs,
      }, log), signal);
      emitStage(executionOptions, 'setup-state:imported', detail);
    }

    emitStage(executionOptions, 'fonts:wait', detail);
    await withAbort(waitForFontsReady(page, job.readiness?.fontsTimeoutMs || 10000), signal);
    emitStage(executionOptions, 'fonts:ready', detail);

    if (job.captions?.enabled) {
      emitStage(executionOptions, 'captions-overlay:install', detail);
      await withAbort(installCaptionOverlay(page), signal);
      emitStage(executionOptions, 'captions-overlay:ready', detail);
    }
    return {
      browser,
      page,
      range,
      profileDir,
      warmupDurationMs: Date.now() - workerStartedAt,
    };
  } catch (error) {
    await closeBrowserWorker(browser, executionOptions, detail);
    throw error;
  }
}

async function captureSeamProofFrame({
  prepared,
  frame,
  job,
  video,
  renderClock,
  framesDir,
  frameFormat,
  frameExtension,
  signal,
}) {
  let elapsedMs = frame * (1000 / video.fps);
  let clockState = await callRenderAt(prepared.page, renderClock, {
    timeMs: elapsedMs,
    frameIndex: frame,
    fps: video.fps,
    durationMs: video.durationMs,
    workerIndex: prepared.range.workerIndex,
    range: {
      startFrame: prepared.range.startFrame,
      endFrame: prepared.range.endFrame,
    },
    proofOnly: true,
  }, signal);
  await withAbort(setCaption(prepared.page, captionAt(job.captions, elapsedMs)), signal);
  let path = join(
    framesDir,
    `.seam-worker-${prepared.range.workerIndex}-frame-${String(frame).padStart(5, '0')}.${frameExtension}`,
  );
  await withAbort(prepared.page.screenshot({ path, type: frameFormat, fullPage: false }), signal);
  return {
    workerIndex: prepared.range.workerIndex,
    frame,
    elapsedMs: Math.round(elapsedMs),
    path,
    pixelHash: await fileSha256(path),
    contentDigest: clockState.contentDigest,
  };
}

async function verifyWorkerSeams({
  prepared,
  workerResults,
  job,
  video,
  renderClock,
  framesDir,
  frameFormat,
  frameExtension,
  execFile,
  ffmpegPath,
  signal,
  executionOptions,
}) {
  let proofs = [];
  for (let index = 1; index < prepared.length; index += 1) {
    let startFrame = prepared[index].range.startFrame;
    let endFrame = Math.min(
      prepared[index].range.endFrame,
      startFrame + renderClock.seamProofFrames - 1,
    );
    for (let frame = startFrame; frame <= endFrame; frame += 1) {
      let before = await captureSeamProofFrame({
        prepared: prepared[index - 1],
        frame,
        job,
        video,
        renderClock,
        framesDir,
        frameFormat,
        frameExtension,
        signal,
      });
      let actual = workerResults[index].frameFiles.find((frameFile) => frameFile.index === frame);
      if (!actual) throw new Error(`render worker ${index} returned no boundary frame ${frame}`);
      let after = {
        workerIndex: prepared[index].range.workerIndex,
        frame,
        elapsedMs: actual.elapsedMs,
        path: actual.path,
        pixelHash: await fileSha256(actual.path),
        contentDigest: actual.contentDigest,
      };
      let contentMatches = Boolean(before.contentDigest)
        && before.contentDigest === after.contentDigest;
      let exactPixelsMatch = before.pixelHash === after.pixelHash;
      let ssim = exactPixelsMatch ? 1 : 0;
      if (!exactPixelsMatch) {
        let comparison = await execFile(ffmpegPath, [
          '-i', before.path,
          '-i', after.path,
          '-lavfi', 'ssim',
          '-f', 'null',
          '-',
        ]);
        let match = String(comparison?.stderr || '').match(/All:([0-9.]+)/);
        ssim = Number(match?.[1] || 0);
      }
      let pixelsMatch = exactPixelsMatch || ssim >= renderClock.seamSsim;
      let proof = {
        frame,
        elapsedMs: before.elapsedMs,
        workers: [before.workerIndex, after.workerIndex],
        contentDigest: before.contentDigest,
        peerContentDigest: after.contentDigest,
        contentMatches,
        pixelHash: before.pixelHash,
        peerPixelHash: after.pixelHash,
        exactPixelsMatch,
        ssim,
        requiredSsim: renderClock.seamSsim,
        pixelsMatch,
      };
      proofs.push(proof);
      if (!contentMatches || !pixelsMatch) {
        let error = new Error(`render worker seam mismatch at frame ${frame}`);
        error.code = 'RENDER_SEAM_MISMATCH';
        error.proof = { ...proof, paths: [before.path, after.path] };
        throw error;
      }
      await rm(before.path, { force: true });
      emitStage(executionOptions, 'capture:seam-verified', proof);
    }
  }
  return proofs;
}

async function captureBrowserWorker({
  prepared,
  job,
  video,
  renderClock,
  framesDir,
  frameFormat,
  frameExtension,
  frameMimeType,
  captureState,
  signal,
  executionOptions,
  onFrame,
}) {
  let { page, range } = prepared;
  let detail = { workerIndex: range.workerIndex, startFrame: range.startFrame, endFrame: range.endFrame };
  let lastCaptionKey = '';
  let frameIntervalMs = 1000 / video.fps;
  let startedAt = Date.now();
  let stateSamples = [];
  let frameFiles = [];
  emitStage(executionOptions, 'capture-worker:start', detail);
  for (let frame = range.startFrame; frame <= range.endFrame; frame += 1) {
    assertNotAborted(signal);
    let elapsedMs = frame * frameIntervalMs;
    let clockState = await callRenderAt(page, renderClock, {
      timeMs: elapsedMs,
      frameIndex: frame,
      fps: video.fps,
      durationMs: video.durationMs,
      workerIndex: range.workerIndex,
      range: { startFrame: range.startFrame, endFrame: range.endFrame },
    }, signal);

    let caption = captionAt(job.captions, elapsedMs);
    let captionKey = caption ? `${caption.speaker}:${caption.text}` : '';
    if (captionKey !== lastCaptionKey) {
      await withAbort(setCaption(page, caption), signal);
      lastCaptionKey = captionKey;
    }

    if (captureState && frame % captureState.sampleEveryFrames === 0) {
      stateSamples.push({
        frame,
        elapsedMs: Math.round(elapsedMs),
        state: await withAbort(captureWindowState(page, captureState), signal),
        ...(clockState ? { renderClock: clockState } : {}),
      });
    }

    let framePath = join(framesDir, `frame-${String(frame).padStart(5, '0')}.${frameExtension}`);
    await withAbort(page.screenshot({
      path: framePath,
      type: frameFormat,
      fullPage: false,
    }), signal);
    let frameFile = {
      index: frame,
      path: framePath,
      elapsedMs: Math.round(elapsedMs),
      mimeType: frameMimeType,
      contentDigest: clockState.contentDigest,
    };
    frameFiles.push(frameFile);
    onFrame(frameFile, detail);

  }
  let captureDurationMs = Date.now() - startedAt;
  emitStage(executionOptions, 'capture-worker:done', { ...detail, captureDurationMs });
  return {
    frameFiles,
    stateSamples,
    metric: {
      ...detail,
      frameCount: range.frameCount,
      warmupDurationMs: prepared.warmupDurationMs,
      captureDurationMs,
    },
  };
}

async function executeDeterministicCapture({
  puppeteer,
  execFile,
  ffmpegPath,
  cwd,
  providerId,
  job,
  executionOptions,
  video,
  renderClock,
  ranges,
  browserProfileDirs,
  framesDir,
  frameFormat,
  frameExtension,
  framePattern,
  frameMimeType,
  frameSequenceArtifact,
  captureState,
  captureStatePath,
  output,
  log,
  signal,
}) {
  let pool = createPoolAbortController(signal);
  let activeWorkers = [];
  let poolStartedAt = Date.now();
  try {
    let leader = await prepareBrowserWorker({
      puppeteer,
      job,
      video,
      range: ranges[0],
      profileDir: browserProfileDirs[0],
      renderClock,
      signal: pool.controller.signal,
      log,
      executionOptions,
    });
    activeWorkers.push(leader);
    let setupStatePayload = null;
    let setupStateHash = '';
    if (ranges.length > 1) {
      emitStage(executionOptions, 'setup-state:export', { workerIndex: 0 });
      setupStatePayload = await withAbort(callWindowMethod(leader.page, {
        path: renderClock.setupState.exportPath,
        waitForPromise: true,
        timeoutMs: renderClock.timeoutMs,
      }, log), pool.controller.signal);
      if (!setupStatePayload || typeof setupStatePayload !== 'object') {
        let error = new Error('render setup state export returned no object payload');
        error.code = 'RENDER_SETUP_STATE_INVALID';
        throw error;
      }
      setupStateHash = sha256(JSON.stringify(setupStatePayload));
      emitStage(executionOptions, 'setup-state:exported', { workerIndex: 0, setupStateHash });
      emitStage(executionOptions, 'setup-state:canonicalize', { workerIndex: 0 });
      await withAbort(callWindowMethod(leader.page, {
        path: renderClock.setupState.importPath,
        args: [setupStatePayload],
        waitForPromise: true,
        timeoutMs: renderClock.timeoutMs,
      }, log), pool.controller.signal);
      emitStage(executionOptions, 'setup-state:canonicalized', { workerIndex: 0, setupStateHash });
    }
    let peers = await settleWorkerPool(ranges.slice(1).map((range, offset) => async () => {
      let index = offset + 1;
      let worker = await prepareBrowserWorker({
        puppeteer,
        job,
        video,
        range,
        profileDir: browserProfileDirs[index],
        renderClock,
        signal: pool.controller.signal,
        log,
        executionOptions,
        setupStateImport: {
          path: renderClock.setupState.importPath,
          payload: setupStatePayload,
        },
      });
      activeWorkers.push(worker);
      return worker;
    }), pool.controller);
    let prepared = [leader, ...peers];
    let completion = createRenderFrameCompletionTracker(video.frameCount);
    emitStage(executionOptions, 'capture:start', {
      frames: video.frameCount,
      fps: video.fps,
      durationMs: video.durationMs,
      timelineActions: 0,
      workerCount: ranges.length,
      mode: renderClock.mode,
    });
    let workerResults = await settleWorkerPool(prepared.map((worker) => async () => (
      captureBrowserWorker({
        prepared: worker,
        job,
        video,
        renderClock,
        framesDir,
        frameFormat,
        frameExtension,
        frameMimeType,
        captureState,
        signal: pool.controller.signal,
        executionOptions,
        onFrame(frameFile) {
          let snapshot = completion.mark(frameFile.index);
          if (typeof executionOptions.onProgress !== 'function') return;
          executionOptions.onProgress({
            frame: snapshot.contiguousFrames,
            frames: video.frameCount,
            completedFrames: snapshot.completedFrames,
            contiguousFrames: snapshot.contiguousFrames,
            progress: snapshot.progress,
            contiguousProgress: snapshot.contiguousProgress,
            stage: 'capture',
            framesDir,
            framePattern,
            mimeType: frameMimeType,
          });
        },
      })
    )), pool.controller);
    let seamProofs = await verifyWorkerSeams({
      prepared,
      workerResults,
      job,
      video,
      renderClock,
      framesDir,
      frameFormat,
      frameExtension,
      execFile,
      ffmpegPath,
      signal: pool.controller.signal,
      executionOptions,
    });
    let frameFiles = workerResults
      .flatMap((result) => result.frameFiles)
      .sort((a, b) => a.index - b.index);
    let stateSamples = workerResults
      .flatMap((result) => result.stateSamples)
      .sort((a, b) => a.frame - b.frame);
    let durationMs = Date.now() - poolStartedAt;
    let capture = {
      mode: renderClock.mode,
      workerCount: ranges.length,
      durationMs,
      throughputFps: durationMs > 0
        ? Math.round((video.frameCount / (durationMs / 1000)) * 1000) / 1000
        : 0,
      frameTimeSource: 'page-render-clock',
      ...(setupStateHash ? { setupStateHash } : {}),
      seamProofs,
      workerRanges: workerResults
        .map((result) => result.metric)
        .sort((a, b) => a.workerIndex - b.workerIndex),
    };
    let closeResults = [];
    for (let worker of activeWorkers.splice(0)) {
      closeResults.push(await closeBrowserWorker(worker.browser, executionOptions, {
        workerIndex: worker.range.workerIndex,
      }));
    }
    capture.browserCloseTimeouts = closeResults.filter((result) => result.timedOut).length;
    emitStage(executionOptions, 'capture:done', {
      frames: video.frameCount,
      workerCount: ranges.length,
      durationMs,
      throughputFps: capture.throughputFps,
    });

    if (captureStatePath) {
      assertNotAborted(pool.controller.signal);
      emitStage(executionOptions, 'state:write', { samples: stateSamples.length });
      await withAbort(writeFile(captureStatePath, `${JSON.stringify({
        sourceUrl: job.surface.url,
        providerId,
        frames: video.frameCount,
        fps: video.fps,
        durationMs: video.durationMs,
        capture,
        samples: stateSamples,
      }, null, 2)}\n`), pool.controller.signal);
      emitStage(executionOptions, 'state:written', { samples: stateSamples.length });
    }

    if (frameSequenceArtifact) {
      let artifact = normalizeRenderArtifact({
        kind: 'frame-sequence',
        providerId,
        frames: video.frameCount,
        fps: video.fps,
        durationSec: video.durationMs / 1000,
        width: video.width,
        height: video.height,
        framesDir,
        framePattern,
        mimeType: frameMimeType,
        frameFiles,
        source: { url: job.surface.url },
        capture,
        ...(output ? { path: output } : {}),
      });
      emitStage(executionOptions, 'frame-sequence:done', artifact);
      return artifact;
    }

    emitStage(executionOptions, 'encode:start', {
      frames: video.frameCount,
      fps: video.fps,
      output,
    });
    await withAbort(execFile(ffmpegPath, [
      '-y',
      '-framerate', String(video.fps),
      '-i', join(framesDir, framePattern),
      '-c:v', 'libx264',
      '-preset', 'fast',
      '-crf', '18',
      '-pix_fmt', 'yuv420p',
      '-vf', `scale=${video.width}:${video.height}`,
      output,
    ], { cwd }), pool.controller.signal);
    emitStage(executionOptions, 'encode:done', { output });

    if (!executionOptions.keepFrames) {
      emitStage(executionOptions, 'frames:cleanup', { framesDir });
      await rm(framesDir, { recursive: true, force: true });
    } else {
      log(`Frames kept in: ${framesDir}`);
      emitStage(executionOptions, 'frames:kept', { framesDir });
    }

    let artifact = normalizeRenderArtifact({
      path: output,
      kind: 'screencast',
      providerId,
      frames: video.frameCount,
      fps: video.fps,
      durationSec: video.durationMs / 1000,
      width: video.width,
      height: video.height,
      capture,
    });
    emitStage(executionOptions, 'screencast:done', artifact);
    return artifact;
  } finally {
    for (let worker of activeWorkers.splice(0)) {
      await closeBrowserWorker(worker.browser, executionOptions, {
        workerIndex: worker.range.workerIndex,
      });
    }
    pool.dispose();
  }
}

export function createLocalBrowserScreencastProvider(options = {}) {
  let { puppeteer, ffmpegPath = 'ffmpeg', execFile = defaultExecFile, cwd = process.cwd(), framesRoot } = options;
  if (!puppeteer || typeof puppeteer.launch !== 'function') {
    throw new Error('local-browser-screencast requires injected puppeteer.launch');
  }
  if (typeof execFile !== 'function') {
    throw new Error('local-browser-screencast requires execFile function');
  }
  let providerId = cleanString(options.id, 'browser-headless-screencast') || 'browser-headless-screencast';

  return {
    id: providerId,
    kind: 'screencast',
    async execute(job, executionOptions = {}) {
      let signal = executionOptions.signal;
      let log = executionOptions.verbose ? console.log.bind(console) : () => {};
      let frameSequenceArtifact = wantsFrameSequenceArtifact(job, executionOptions);
      assertNotAborted(signal);
      let output = '';
      if (!frameSequenceArtifact || executionOptions.output) {
        output = resolvePath(cwd, executionOptions.output || job.output?.path, 'renderJob.output.path');
        await mkdir(dirname(output), { recursive: true });
      }
      let captureState = job.captureState?.enabled ? {
        ...job.captureState,
        sampleEveryFrames: Math.max(1, Math.round(positiveNumber(job.captureState.sampleEveryFrames, 1, 'renderJob.captureState.sampleEveryFrames'))),
      } : null;
      let captureStateOutput = executionOptions.statePath || captureState?.outputPath || '';
      let captureStatePath = captureStateOutput ? resolve(cwd, captureStateOutput) : '';
      if (captureStatePath) await mkdir(dirname(captureStatePath), { recursive: true });

      let video = normalizeVideo(job.video);
      let renderClock = normalizeRenderClock(job, executionOptions, options, video);
      let ranges = partitionRenderFrameRanges(video.frameCount, renderClock.workerCount);
      let framesDir = executionOptions.framesDir || createFramesDir(framesRoot, job.id);
      let browserProfileBaseDir = executionOptions.browserProfileDir
        || job.execution?.browserProfileDir
        || createBrowserProfileDir(executionOptions.browserProfileRoot || job.execution?.browserProfileRoot, job.id);
      let browserProfileDirs = ranges.map((range) => (
        ranges.length === 1 ? browserProfileBaseDir : join(browserProfileBaseDir, `worker-${range.workerIndex}`)
      ));
      for (let profileDir of browserProfileDirs) appendCleanupPath(job, 'browserProfilePaths', profileDir);
      let frameFormat = cleanFrameFormat(job.frameFormat || executionOptions.frameFormat || options.frameFormat, 'png');
      let frameExtension = frameFormatExtension(frameFormat);
      let framePattern = `frame-%05d.${frameExtension}`;
      let frameMimeType = frameFormatMimeType(frameFormat);
      emitStage(executionOptions, 'frames:prepare', {
        framesDir,
        frames: video.frameCount,
        fps: video.fps,
        width: video.width,
        height: video.height,
        workerCount: ranges.length,
        mode: renderClock.mode,
      });
      await rm(framesDir, { recursive: true, force: true });
      await mkdir(framesDir, { recursive: true });
      await rm(browserProfileBaseDir, { recursive: true, force: true });
      for (let profileDir of browserProfileDirs) await mkdir(profileDir, { recursive: true });

      if (renderClock.mode === 'deterministic') {
        return executeDeterministicCapture({
          puppeteer,
          execFile,
          ffmpegPath,
          cwd,
          providerId,
          job,
          executionOptions,
          video,
          renderClock,
          ranges,
          browserProfileDirs,
          framesDir,
          frameFormat,
          frameExtension,
          framePattern,
          frameMimeType,
          frameSequenceArtifact,
          captureState,
          captureStatePath,
          output,
          log,
          signal,
        });
      }

      let browserProfileDir = browserProfileDirs[0];

      emitStage(executionOptions, 'browser:launch', { providerId });
      assertNotAborted(signal);
      let browser = await puppeteer.launch({
        headless: true,
        userDataDir: browserProfileDir,
        args: [
          `--window-size=${video.width},${video.height}`,
          '--no-sandbox',
          '--disable-setuid-sandbox',
        ],
      });

      try {
        emitStage(executionOptions, 'browser:page');
        let page = await withAbort(browser.newPage(), signal);
        await withAbort(page.setViewport({
          width: video.width,
          height: video.height,
          deviceScaleFactor: 1,
        }), signal);
        emitStage(executionOptions, 'browser:navigate', { url: job.surface.url });
        await withAbort(page.goto(job.surface.url, { waitUntil: 'domcontentloaded', timeout: 30000 }), signal);
        emitStage(executionOptions, 'browser:navigated', { url: job.surface.url });

        let setupActions = job.setup || [];
        emitStage(executionOptions, 'setup:start', { actions: setupActions.length });
        for (let index = 0; index < setupActions.length; index += 1) {
          let action = setupActions[index];
          emitStage(executionOptions, 'setup-action:start', {
            index,
            type: action.type,
            label: actionProgressLabel(action),
          });
          try {
            await withAbort(executeAction(page, action, log), signal);
          } catch (error) {
            let wrapped = new Error(`setup action ${index} (${actionProgressLabel(action)}) failed: ${error?.message || error}`);
            wrapped.cause = error;
            throw wrapped;
          }
          emitStage(executionOptions, 'setup-action:done', {
            index,
            type: action.type,
            label: actionProgressLabel(action),
          });
        }
        emitStage(executionOptions, 'setup:done', { actions: setupActions.length });

        emitStage(executionOptions, 'fonts:wait');
        await withAbort(waitForFontsReady(page, job.readiness?.fontsTimeoutMs || 10000), signal);
        emitStage(executionOptions, 'fonts:ready');

        if (job.captions?.enabled) {
          emitStage(executionOptions, 'captions-overlay:install');
          await installCaptionOverlay(page);
          emitStage(executionOptions, 'captions-overlay:ready');
        }

        let actions = [...(job.timeline || [])].sort((a, b) => a.atMs - b.atMs);
        let nextActionIndex = 0;
        let lastCaptionKey = '';
        let frameIntervalMs = 1000 / video.fps;
        let startedAt = Date.now();
        let stateSamples = [];
        let frameFiles = [];
        let frameFormat = cleanFrameFormat(job.frameFormat || executionOptions.frameFormat || options.frameFormat, 'png');
        let frameExtension = frameFormatExtension(frameFormat);
        let framePattern = `frame-%05d.${frameExtension}`;
        let frameMimeType = frameFormatMimeType(frameFormat);

        emitStage(executionOptions, 'capture:start', {
          frames: video.frameCount,
          fps: video.fps,
          durationMs: video.durationMs,
          timelineActions: actions.length,
        });
        for (let frame = 0; frame < video.frameCount; frame += 1) {
          assertNotAborted(signal);
          let elapsedMs = frame * frameIntervalMs;
          while (nextActionIndex < actions.length && actions[nextActionIndex].atMs <= elapsedMs) {
            let action = actions[nextActionIndex];
            emitStage(executionOptions, 'timeline-action:start', {
              index: nextActionIndex,
              atMs: action.atMs,
              type: action.type,
              label: actionProgressLabel(action),
            });
            await withAbort(executeAction(page, action, log), signal);
            emitStage(executionOptions, 'timeline-action:done', {
              index: nextActionIndex,
              atMs: action.atMs,
              type: action.type,
              label: actionProgressLabel(action),
            });
            nextActionIndex += 1;
          }

          let caption = captionAt(job.captions, elapsedMs);
          let captionKey = caption ? `${caption.speaker}:${caption.text}` : '';
          if (captionKey !== lastCaptionKey) {
            await withAbort(setCaption(page, caption), signal);
            lastCaptionKey = captionKey;
          }

          if (captureState && frame % captureState.sampleEveryFrames === 0) {
            stateSamples.push({
              frame,
              elapsedMs: Math.round(elapsedMs),
              state: await withAbort(captureWindowState(page, captureState), signal),
            });
          }

          let framePath = join(framesDir, `frame-${String(frame).padStart(5, '0')}.${frameExtension}`);
          await withAbort(page.screenshot({
            path: framePath,
            type: frameFormat,
            fullPage: false,
          }), signal);
          frameFiles.push({
            index: frame,
            path: framePath,
            elapsedMs: Math.round(elapsedMs),
            mimeType: frameMimeType,
          });

          if (typeof executionOptions.onProgress === 'function') {
            executionOptions.onProgress({
              frame: frame + 1,
              frames: video.frameCount,
              progress: (frame + 1) / video.frameCount,
              stage: 'capture',
              framesDir,
              framePattern,
              mimeType: frameMimeType,
            });
          }

          await sleep(startedAt + (frame + 1) * frameIntervalMs - Date.now(), signal);
        }
        emitStage(executionOptions, 'capture:done', { frames: video.frameCount });

        if (captureStatePath) {
          assertNotAborted(signal);
          emitStage(executionOptions, 'state:write', { samples: stateSamples.length });
          await withAbort(writeFile(captureStatePath, `${JSON.stringify({
            sourceUrl: job.surface.url,
            providerId,
            frames: video.frameCount,
            fps: video.fps,
            durationMs: video.durationMs,
            samples: stateSamples,
          }, null, 2)}\n`), signal);
          emitStage(executionOptions, 'state:written', { samples: stateSamples.length });
        }

        if (frameSequenceArtifact) {
          assertNotAborted(signal);
          let artifact = normalizeRenderArtifact({
            kind: 'frame-sequence',
            providerId,
            frames: video.frameCount,
            fps: video.fps,
            durationSec: video.durationMs / 1000,
            width: video.width,
            height: video.height,
            framesDir,
            framePattern,
            mimeType: frameMimeType,
            frameFiles,
            source: { url: job.surface.url },
            ...(output ? { path: output } : {}),
          });
          emitStage(executionOptions, 'frame-sequence:done', artifact);
          return artifact;
        }

        assertNotAborted(signal);
        emitStage(executionOptions, 'encode:start', {
          frames: video.frameCount,
          fps: video.fps,
          output,
        });
        await withAbort(execFile(ffmpegPath, [
          '-y',
          '-framerate', String(video.fps),
          '-i', join(framesDir, framePattern),
          '-c:v', 'libx264',
          '-preset', 'fast',
          '-crf', '18',
          '-pix_fmt', 'yuv420p',
          '-vf', `scale=${video.width}:${video.height}`,
          output,
        ], { cwd }), signal);
        emitStage(executionOptions, 'encode:done', { output });

        if (!executionOptions.keepFrames) {
          emitStage(executionOptions, 'frames:cleanup', { framesDir });
          await rm(framesDir, { recursive: true, force: true });
        } else {
          log(`Frames kept in: ${framesDir}`);
          emitStage(executionOptions, 'frames:kept', { framesDir });
        }

        let artifact = normalizeRenderArtifact({
          path: output,
          kind: 'screencast',
          providerId,
          frames: video.frameCount,
          fps: video.fps,
          durationSec: video.durationMs / 1000,
          width: video.width,
          height: video.height,
        });
        emitStage(executionOptions, 'screencast:done', artifact);
        return artifact;
      } finally {
        await closeBrowserWorker(browser, executionOptions);
      }
    },
  };
}
