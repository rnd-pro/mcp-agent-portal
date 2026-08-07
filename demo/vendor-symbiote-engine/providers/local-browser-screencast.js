import { execFile as nodeExecFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { promisify } from 'node:util';

import {
  ATTRIBUTED_COMPOSITOR_POLICY_VERSION,
  normalizeCaptureTransportKind,
  normalizeCompositorFrameEvent,
  normalizeRenderArtifact,
} from '../contracts/render-provider.js';
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

function browserProcessId(browser) {
  let pid = Number(browser?.process?.()?.pid);
  return Number.isInteger(pid) && pid > 0 ? pid : null;
}

async function resolveBrowserProcessId(browser) {
  let direct = browserProcessId(browser);
  if (direct) return direct;
  let reported = Number(await browser?.processId?.());
  return Number.isInteger(reported) && reported > 0 ? reported : null;
}

export async function sampleProcessTreeRss({ execFile = defaultExecFile, roots = [], atMs = Date.now() } = {}) {
  let normalizedRoots = roots
    .map((root) => ({ workerIndex: Number(root?.workerIndex), pid: Number(root?.pid) }))
    .filter((root) => Number.isInteger(root.workerIndex) && Number.isInteger(root.pid) && root.pid > 0);
  if (normalizedRoots.length === 0) throw new Error('process RSS sampling requires browser process roots');
  let result = await execFile('ps', ['-axo', 'pid=,ppid=,rss=']);
  let processes = String(result?.stdout || '')
    .split(/\r?\n/u)
    .map((line) => line.trim().match(/^(\d+)\s+(\d+)\s+(\d+)$/u))
    .filter(Boolean)
    .map((match) => ({ pid: Number(match[1]), parentPid: Number(match[2]), rssBytes: Number(match[3]) * 1024 }));
  let children = new Map();
  for (let process of processes) {
    let list = children.get(process.parentPid) || [];
    list.push(process.pid);
    children.set(process.parentPid, list);
  }
  let byPid = new Map(processes.map((process) => [process.pid, process]));
  let claimed = new Set();
  let workers = normalizedRoots.map((root) => {
    let pending = [root.pid];
    let pids = [];
    let rssBytes = 0;
    while (pending.length) {
      let pid = pending.pop();
      if (claimed.has(pid)) continue;
      claimed.add(pid);
      pids.push(pid);
      rssBytes += byPid.get(pid)?.rssBytes || 0;
      pending.push(...(children.get(pid) || []));
    }
    return { workerIndex: root.workerIndex, pid: root.pid, processCount: pids.length, rssBytes };
  });
  return {
    atMs: Math.max(0, Math.round(Number(atMs) || 0)),
    rssBytes: workers.reduce((total, worker) => total + worker.rssBytes, 0),
    processCount: claimed.size,
    workers,
  };
}

async function startProcessTreeRssSampling({ execFile, prepared, intervalMs, required }) {
  let roots = (await Promise.all(prepared.map(async (worker) => ({
    workerIndex: worker.range.workerIndex,
    pid: await resolveBrowserProcessId(worker.browser),
  })))).filter((root) => root.pid);
  let samples = [];
  let samplingError = null;
  let pending = null;
  let startedAt = Date.now();
  async function takeSample() {
    if (pending) return pending;
    pending = sampleProcessTreeRss({ execFile, roots, atMs: Date.now() - startedAt })
      .then((sample) => samples.push(sample))
      .catch((error) => { samplingError = samplingError || error; })
      .finally(() => { pending = null; });
    return pending;
  }
  void takeSample();
  let timer = setInterval(() => { void takeSample(); }, intervalMs);
  timer.unref?.();
  return {
    async stop() {
      clearInterval(timer);
      if (pending) await pending;
      await takeSample();
      if (required && samplingError) throw samplingError;
      if (required && samples.length === 0) throw new Error('required process RSS sampling produced no samples');
      let workerPeakRssBytes = Object.fromEntries(prepared.map((worker) => [worker.range.workerIndex, 0]));
      for (let sample of samples) {
        for (let worker of sample.workers) {
          workerPeakRssBytes[worker.workerIndex] = Math.max(workerPeakRssBytes[worker.workerIndex] || 0, worker.rssBytes);
        }
      }
      return {
        samples,
        peakRssBytes: samples.reduce((peak, sample) => Math.max(peak, sample.rssBytes), 0),
        workerPeakRssBytes,
        ...(samplingError ? { error: samplingError.message } : {}),
      };
    },
  };
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

const LOCKED_SEAM_SSIM_MINIMUM = 0.999999;

function normalizeSeamSsim(value) {
  if (value === undefined) {
    return LOCKED_SEAM_SSIM_MINIMUM;
  }
  let requested = Number(value);
  if (!Number.isFinite(requested) || requested > 1 || requested < LOCKED_SEAM_SSIM_MINIMUM) {
    let error = new Error(
      `renderJob.renderClock.seamSsim: must be a number between ${LOCKED_SEAM_SSIM_MINIMUM} and 1 `
        + '(locked exact-browser-pixel seam requirement)',
    );
    error.code = 'RENDER_SEAM_THRESHOLD_INVALID';
    throw error;
  }
  return requested;
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
  let seamSsim = normalizeSeamSsim(source.seamSsim);
  let transport = normalizeCaptureTransportKind(source.transport, 'screenshot');
  return {
    mode,
    path,
    workerCount,
    transport,
    settleFrames: nonNegativeInteger(source.settleFrames, 2, 'renderJob.renderClock.settleFrames', 10),
    warmupPresentations: nonNegativeInteger(
      source.warmupPresentations,
      1,
      'renderJob.renderClock.warmupPresentations',
      30,
    ),
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
  let renderStartedAt = Date.now();
  let result = await withTimeout(withAbort(page.evaluate(async ({
    methodParts: parts,
    frameContext: context,
    capturePresentationMarker,
  }) => {
    let owner = window;
    for (let index = 0; index < parts.length - 1; index += 1) owner = owner?.[parts[index]];
    let method = owner?.[parts[parts.length - 1]];
    if (typeof method !== 'function') throw new Error(`render clock method not found: ${parts.join('.')}`);
    let clockState = await method.call(owner, context);
    if (!capturePresentationMarker) return clockState;
    let presentationMarker = await new Promise((resolveFrame) => {
      requestAnimationFrame(() => resolveFrame(performance.timeOrigin + performance.now()));
    });
    return { ...clockState, presentationMarker };
  }, {
    methodParts,
    frameContext,
    capturePresentationMarker: renderClock.transport === 'attributed-compositor',
  }), signal), renderClock.timeoutMs,
  `render clock ${renderClock.path} timed out at frame ${frameContext.frameIndex}`);
  let renderDurationMs = Date.now() - renderStartedAt;
  let presentedTimeMs = Number(result?.presentedTimeMs);
  if (!Number.isFinite(presentedTimeMs) || Math.abs(presentedTimeMs - frameContext.timeMs) > 0.01) {
    throw new Error(`render clock ${renderClock.path} presented invalid time at frame ${frameContext.frameIndex}`);
  }
  let projectionId = cleanString(result?.projectionId, '');
  if (!projectionId) {
    throw new Error(`render clock ${renderClock.path} returned no projectionId at frame ${frameContext.frameIndex}`);
  }
  let presentationMarker = Number(result?.presentationMarker);
  if (renderClock.transport === 'attributed-compositor' && !Number.isFinite(presentationMarker)) {
    let error = new Error(
      `render clock ${renderClock.path} returned no presentation marker at frame ${frameContext.frameIndex}`,
    );
    error.code = 'RENDER_COMPOSITOR_MARKER_INVALID';
    throw error;
  }
  let settleDurationMs = 0;
  if (renderClock.settleFrames > 0) {
    let settleStartedAt = Date.now();
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
    settleDurationMs = Date.now() - settleStartedAt;
  }
  return {
    presentedTimeMs,
    projectionId,
    contentDigest: cleanString(result?.contentDigest, ''),
    contentEvidence: result?.contentEvidence && typeof result.contentEvidence === 'object'
      ? structuredClone(result.contentEvidence)
      : null,
    ...(renderClock.transport === 'attributed-compositor' ? { presentationMarker } : {}),
    timing: { renderDurationMs, settleDurationMs },
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
  if (firstFailure) {
    Object.defineProperty(firstFailure, 'workerResults', {
      value: settled.filter((result) => result.status === 'fulfilled').map((result) => result.value),
    });
    throw firstFailure;
  }
  return settled.map((result) => result.value);
}

function assertValidCompositorSession(session, workerIndex) {
  let valid = session
    && typeof session.next === 'function'
    && typeof session.ack === 'function'
    && typeof session.stop === 'function'
    && cleanString(session.sessionId, '');
  if (!valid) {
    let error = new Error(
      `compositor session for worker ${workerIndex} must expose sessionId and next/ack/stop`,
    );
    error.code = 'RENDER_COMPOSITOR_SESSION_INVALID';
    throw error;
  }
}

async function closeCompositorSession(session, executionOptions, detail = {}) {
  let timeoutMs = Math.max(100, Math.round(
    Number(executionOptions.compositorStopTimeoutMs ?? executionOptions.browserCloseTimeoutMs) || 5000,
  ));
  emitStage(executionOptions, 'compositor:stop', detail);
  let timer;
  let stop = Promise.resolve().then(() => session.stop()).then(
    () => ({ stopped: true, error: false }),
    () => ({ stopped: false, error: true }),
  );
  let result = await Promise.race([
    stop,
    new Promise((resolveTimeout) => {
      timer = setTimeout(() => resolveTimeout({ stopped: false, error: false, timedOut: true }), timeoutMs);
    }),
  ]).finally(() => clearTimeout(timer));
  let outcome = { timedOut: result.timedOut === true, error: result.error === true, timeoutMs };
  emitStage(executionOptions, 'compositor:stopped', { ...detail, ...outcome });
  return outcome;
}

function frameEventBytes(event) {
  let bytes;
  if (event.encoding === 'base64') {
    let normalized = event.data.replace(/\s+/g, '');
    if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(normalized)) {
      let error = new Error('compositor frame contains invalid base64 data');
      error.code = 'RENDER_COMPOSITOR_FRAME_FORMAT_INVALID';
      throw error;
    }
    bytes = Buffer.from(normalized, 'base64');
  } else {
    let view = event.data;
    if (view instanceof ArrayBuffer) bytes = Buffer.from(view);
    else bytes = Buffer.from(view.buffer, view.byteOffset, view.byteLength);
  }
  let pngSignature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (bytes.length < pngSignature.length
    || pngSignature.some((byte, index) => bytes[index] !== byte)) {
    let error = new Error('compositor frame is not a lossless PNG');
    error.code = 'RENDER_COMPOSITOR_FRAME_FORMAT_INVALID';
    throw error;
  }
  return bytes;
}

function compositorTimeoutError(stage, frameIndex) {
  let error = new Error(`compositor ${stage} timed out at frame ${frameIndex}`);
  error.code = 'RENDER_COMPOSITOR_ATTRIBUTION_TIMEOUT';
  return error;
}

async function raceCompositorDeadline(promise, timeoutMs, error, signal) {
  let timer;
  let timeout = new Promise((_, reject) => { timer = setTimeout(() => reject(error), Math.max(0, timeoutMs)); });
  try {
    return await Promise.race([withAbort(Promise.resolve(promise), signal), timeout]);
  } finally {
    clearTimeout(timer);
  }
}

// Timestamp-attributed compositor capture: the render clock returns a marker
// from its first presentation rAF, then
// consume ordered compositor events, acknowledging and discarding every event
// stamped before the marker and accepting the first event at or after it. The
// caller never advances to the next frame until this attribution succeeds.
async function captureAttributedFrame({
  prepared,
  renderClock,
  video,
  framePath,
  frameIndex,
  presentationMarker,
  signal,
}) {
  let session = prepared.session;
  let expected = {
    width: video.width,
    height: video.height,
    devicePixelRatio: 1,
    sessionId: session.sessionId,
  };
  let waitStartedAt = Date.now();
  let deadline = waitStartedAt + renderClock.timeoutMs;
  let marker = Number(presentationMarker);
  if (!Number.isFinite(marker)) {
    throw new Error(`compositor session returned an invalid presentation marker at frame ${frameIndex}`);
  }
  let discardedFrames = 0;
  for (;;) {
    assertNotAborted(signal);
    let remainingMs = deadline - Date.now();
    if (remainingMs <= 0) throw compositorTimeoutError('frame attribution', frameIndex);
    let raw = await raceCompositorDeadline(
      session.next({ signal }),
      remainingMs,
      compositorTimeoutError('frame attribution', frameIndex),
      signal,
    );
    if (raw === null || raw === undefined) {
      let error = new Error(`compositor stream ended before frame ${frameIndex} was attributed`);
      error.code = 'RENDER_COMPOSITOR_STREAM_ENDED';
      throw error;
    }
    let event = normalizeCompositorFrameEvent(raw, expected);
    await withAbort(Promise.resolve(session.ack(raw)), signal);
    if (event.timestamp >= marker) {
      await withAbort(writeFile(framePath, frameEventBytes(event)), signal);
      return {
        workerIndex: prepared.range.workerIndex,
        frame: frameIndex,
        discardedFrames,
        presentationGapMs: event.timestamp - marker,
        attributionLatencyMs: Date.now() - waitStartedAt,
        devicePixelRatio: event.devicePixelRatio,
        width: event.width,
        height: event.height,
      };
    }
    discardedFrames += 1;
  }
}

function summarizeMs(values) {
  if (values.length === 0) return { meanMs: 0, maxMs: 0 };
  let sum = values.reduce((total, value) => total + value, 0);
  return {
    meanMs: Math.round((sum / values.length) * 1000) / 1000,
    maxMs: Math.max(...values),
  };
}

function buildTransportEvidence(samples, video) {
  return {
    name: 'attributed-compositor',
    policyVersion: ATTRIBUTED_COMPOSITOR_POLICY_VERSION,
    acceptedFrames: samples.length,
    discardedFrames: samples.reduce((total, sample) => total + sample.discardedFrames, 0),
    attributionLatencyMs: summarizeMs(samples.map((sample) => sample.attributionLatencyMs)),
    presentationGapMs: summarizeMs(samples.map((sample) => sample.presentationGapMs)),
    width: video.width,
    height: video.height,
    devicePixelRatio: samples[0]?.devicePixelRatio ?? 1,
    sessionsStopped: 0,
    sessionStopTimeouts: 0,
    sessionStopErrors: 0,
  };
}

async function prepareBrowserWorker({
  puppeteer,
  compositorCapture,
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
      '--disable-gpu',
      '--disable-gpu-compositing',
      '--disable-lcd-text',
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
  let session = null;
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
      if (!setupStateImport.payload
        || typeof setupStateImport.payload !== 'object'
        || Array.isArray(setupStateImport.payload)) {
        let error = new Error(
          `render continuation state import for worker ${range.workerIndex} requires an object payload`,
        );
        error.code = 'RENDER_CONTINUATION_PAYLOAD_INVALID';
        throw error;
      }
      let importDetail = { ...detail, boundaryFrame: range.startFrame };
      emitStage(executionOptions, 'setup-state:import', importDetail);
      await withAbort(callWindowMethod(page, {
        path: setupStateImport.path,
        args: [setupStateImport.payload],
        waitForPromise: true,
        timeoutMs: renderClock.timeoutMs,
      }, log), signal);
      emitStage(executionOptions, 'setup-state:imported', importDetail);
    }

    emitStage(executionOptions, 'fonts:wait', detail);
    await withAbort(waitForFontsReady(page, job.readiness?.fontsTimeoutMs || 10000), signal);
    emitStage(executionOptions, 'fonts:ready', detail);

    if (job.captions?.enabled) {
      emitStage(executionOptions, 'captions-overlay:install', detail);
      await withAbort(installCaptionOverlay(page), signal);
      emitStage(executionOptions, 'captions-overlay:ready', detail);
    }

    if (renderClock.transport === 'attributed-compositor') {
      emitStage(executionOptions, 'compositor:open', detail);
      session = await withAbort(Promise.resolve(compositorCapture.openSession({
        page,
        sessionId: `worker-${range.workerIndex}`,
        width: video.width,
        height: video.height,
        devicePixelRatio: 1,
        timeoutMs: renderClock.timeoutMs,
        signal,
      })), signal);
      assertValidCompositorSession(session, range.workerIndex);
      emitStage(executionOptions, 'compositor:ready', { ...detail, sessionId: session.sessionId });
    }
    return {
      browser,
      page,
      range,
      profileDir,
      session,
      warmupDurationMs: Date.now() - workerStartedAt,
    };
  } catch (error) {
    if (session) await closeCompositorSession(session, executionOptions, detail).catch(() => {});
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
  await withAbort(prepared.page.screenshot({
    path,
    type: frameFormat,
    fullPage: false,
  }), signal);
  return {
    workerIndex: prepared.range.workerIndex,
    frame,
    elapsedMs: Math.round(elapsedMs),
    path,
    pixelHash: await fileSha256(path),
    contentDigest: clockState.contentDigest,
    contentEvidence: clockState.contentEvidence || null,
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
        contentEvidence: actual.contentEvidence || null,
      };
      let contentMatches = Boolean(before.contentDigest)
        && before.contentDigest === after.contentDigest;
      let exactPixelsMatch = Boolean(before.pixelHash)
        && before.pixelHash === after.pixelHash;
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
        let measured = Number(match?.[1]);
        ssim = Number.isFinite(measured) ? measured : 0;
      }
      let pixelsMatch = exactPixelsMatch
        || (Number.isFinite(ssim) && ssim >= renderClock.seamSsim);
      let proof = {
        frame,
        elapsedMs: before.elapsedMs,
        workers: [before.workerIndex, after.workerIndex],
        contentDigest: before.contentDigest,
        peerContentDigest: after.contentDigest,
        contentEvidence: before.contentEvidence,
        peerContentEvidence: after.contentEvidence,
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
        let diagnosticFiles = [];
        let seamFailureDir = executionOptions.seamFailureDir || job.execution?.seamFailureDir;
        if (seamFailureDir) {
          await mkdir(seamFailureDir, { recursive: true });
          for (let [proofIndex, source] of [before.path, after.path].entries()) {
            let name = `frame-${String(frame).padStart(5, '0')}-worker-${proof.workers[proofIndex]}.${frameExtension}`;
            await copyFile(source, join(seamFailureDir, name));
            diagnosticFiles.push(name);
          }
        }
        let error = new Error(`render worker seam mismatch at frame ${frame}`);
        error.code = 'RENDER_SEAM_MISMATCH';
        error.proof = {
          ...proof,
          ...(diagnosticFiles.length ? { diagnosticFiles } : {}),
          paths: [before.path, after.path],
        };
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
  let transportSamples = [];
  let phaseDurationMs = {
    render: 0,
    settle: 0,
    caption: 0,
    stateSample: 0,
    screenshot: 0,
  };
  let workerMetric = () => ({
    ...detail,
    frameCount: range.frameCount,
    warmupDurationMs: prepared.warmupDurationMs,
    captureDurationMs: Date.now() - startedAt,
    phaseDurationMs,
  });
  try {
    emitStage(executionOptions, 'capture-worker:start', detail);
    let warmupFrame = Math.max(0, range.startFrame - 1);
    let warmupElapsedMs = warmupFrame * frameIntervalMs;
    // Range 0 renders its warmup presentations from the canonical initial state.
    // Ranges that start mid-video import an exact continuation payload for the
    // state after frame startFrame-1, so they must not re-render that frame; they
    // only prime the caption overlay for the boundary without mutating render
    // state, keeping the parallel capture's draw history identical to sequential.
    let continued = range.startFrame > 0;
    let warmupPresentations = continued ? 0 : renderClock.warmupPresentations;
    for (let presentation = 0; presentation < warmupPresentations; presentation += 1) {
      await callRenderAt(page, renderClock, {
        timeMs: warmupElapsedMs,
        frameIndex: warmupFrame,
        fps: video.fps,
        durationMs: video.durationMs,
        workerIndex: range.workerIndex,
        range: { startFrame: range.startFrame, endFrame: range.endFrame },
        warmup: true,
        warmupPresentation: presentation,
      }, signal);
    }
    let warmupCaption = captionAt(job.captions, warmupElapsedMs);
    await withAbort(setCaption(page, warmupCaption), signal);
    lastCaptionKey = warmupCaption ? `${warmupCaption.speaker}:${warmupCaption.text}` : '';
    emitStage(executionOptions, 'capture-worker:warmed', {
      ...detail,
      frame: warmupFrame,
      warmupFrame,
      boundaryFrame: range.startFrame,
      elapsedMs: Math.round(warmupElapsedMs),
      presentations: warmupPresentations,
      continued,
    });
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
      let { timing: renderTiming, ...clockEvidence } = clockState;
      phaseDurationMs.render += renderTiming.renderDurationMs;
      phaseDurationMs.settle += renderTiming.settleDurationMs;

      let caption = captionAt(job.captions, elapsedMs);
      let captionKey = caption ? `${caption.speaker}:${caption.text}` : '';
      if (captionKey !== lastCaptionKey) {
        let captionStartedAt = Date.now();
        await withAbort(setCaption(page, caption), signal);
        phaseDurationMs.caption += Date.now() - captionStartedAt;
        lastCaptionKey = captionKey;
      }

      if (captureState && frame % captureState.sampleEveryFrames === 0) {
        let stateSampleStartedAt = Date.now();
        stateSamples.push({
          frame,
          elapsedMs: Math.round(elapsedMs),
          state: await withAbort(captureWindowState(page, captureState), signal),
          renderClock: clockEvidence,
        });
        phaseDurationMs.stateSample += Date.now() - stateSampleStartedAt;
      }

      let framePath = join(framesDir, `frame-${String(frame).padStart(5, '0')}.${frameExtension}`);
      let screenshotStartedAt = Date.now();
      if (prepared.session) {
        transportSamples.push(await captureAttributedFrame({
          prepared,
          renderClock,
          video,
          framePath,
          frameIndex: frame,
          presentationMarker: clockState.presentationMarker,
          signal,
        }));
      } else {
        await withAbort(page.screenshot({
          path: framePath,
          type: frameFormat,
          fullPage: false,
        }), signal);
      }
      phaseDurationMs.screenshot += Date.now() - screenshotStartedAt;
      let frameFile = {
        index: frame,
        path: framePath,
        elapsedMs: Math.round(elapsedMs),
        mimeType: frameMimeType,
        contentDigest: clockState.contentDigest,
        contentEvidence: clockState.contentEvidence || null,
      };
      frameFiles.push(frameFile);
      onFrame(frameFile, detail);

    }
    let captureDurationMs = Date.now() - startedAt;
    emitStage(executionOptions, 'capture-worker:done', { ...detail, captureDurationMs });
    return {
      frameFiles,
      stateSamples,
      transportSamples,
      metric: workerMetric(),
    };
  } catch (error) {
    error.proof = { ...(error.proof || {}), workerRange: workerMetric() };
    throw error;
  }
}

function rangeForFrame(ranges, frame) {
  for (let range of ranges) {
    if (frame >= range.startFrame && frame <= range.endFrame) return range;
  }
  return ranges[ranges.length - 1];
}

async function exportContinuationState(page, renderClock, log, signal) {
  let payload = await withAbort(callWindowMethod(page, {
    path: renderClock.setupState.exportPath,
    waitForPromise: true,
    timeoutMs: renderClock.timeoutMs,
  }, log), signal);
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    let error = new Error('render setup state export returned no object payload');
    error.code = 'RENDER_SETUP_STATE_INVALID';
    throw error;
  }
  return payload;
}

async function importContinuationState(page, renderClock, payload, log, signal) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    let error = new Error('render continuation state import requires an object payload');
    error.code = 'RENDER_CONTINUATION_PAYLOAD_INVALID';
    throw error;
  }
  await withAbort(callWindowMethod(page, {
    path: renderClock.setupState.importPath,
    args: [payload],
    waitForPromise: true,
    timeoutMs: renderClock.timeoutMs,
  }, log), signal);
}

// Leader-only, no-raster pass that reproduces the sequential draw history and
// exports one opaque continuation payload immediately before each range start.
// Every capturing worker then imports the exact state that follows the previous
// frame of its range instead of re-rendering the boundary frame, so parallel
// ranges keep the exact draw history a single sequential renderer would produce.
async function runContinuationPrepass({
  leaderPage,
  ranges,
  renderClock,
  video,
  initialPayload,
  initialHash,
  signal,
  executionOptions,
  log,
}) {
  let startedAt = Date.now();
  let frameIntervalMs = 1000 / video.fps;
  let lastBoundaryFrame = ranges[ranges.length - 1].startFrame;
  let payloads = new Array(ranges.length).fill(null);
  let hashes = new Array(ranges.length).fill('');
  payloads[0] = initialPayload;
  hashes[0] = initialHash;
  emitStage(executionOptions, 'continuation-prepass:start', {
    ranges: ranges.length,
    projectedFrames: lastBoundaryFrame,
    boundaries: ranges.slice(1).map((range) => range.startFrame),
  });
  for (let presentation = 0; presentation < renderClock.warmupPresentations; presentation += 1) {
    await callRenderAt(leaderPage, renderClock, {
      timeMs: 0,
      frameIndex: 0,
      fps: video.fps,
      durationMs: video.durationMs,
      workerIndex: ranges[0].workerIndex,
      range: { startFrame: ranges[0].startFrame, endFrame: ranges[0].endFrame },
      warmup: true,
      warmupPresentation: presentation,
    }, signal);
  }
  let nextRangeIndex = 1;
  let projectedFrames = 0;
  for (let frame = 0; frame < lastBoundaryFrame; frame += 1) {
    assertNotAborted(signal);
    let owningRange = rangeForFrame(ranges, frame);
    await callRenderAt(leaderPage, renderClock, {
      timeMs: frame * frameIntervalMs,
      frameIndex: frame,
      fps: video.fps,
      durationMs: video.durationMs,
      workerIndex: owningRange.workerIndex,
      range: { startFrame: owningRange.startFrame, endFrame: owningRange.endFrame },
    }, signal);
    projectedFrames += 1;
    if (nextRangeIndex < ranges.length && frame === ranges[nextRangeIndex].startFrame - 1) {
      let boundaryFrame = ranges[nextRangeIndex].startFrame;
      let boundaryWorkerIndex = ranges[nextRangeIndex].workerIndex;
      emitStage(executionOptions, 'continuation-prepass:export', {
        range: nextRangeIndex,
        workerIndex: boundaryWorkerIndex,
        boundaryFrame,
      });
      let payload = await exportContinuationState(leaderPage, renderClock, log, signal);
      let continuationHash = sha256(JSON.stringify(payload));
      payloads[nextRangeIndex] = payload;
      hashes[nextRangeIndex] = continuationHash;
      emitStage(executionOptions, 'continuation-prepass:exported', {
        range: nextRangeIndex,
        workerIndex: boundaryWorkerIndex,
        boundaryFrame,
        continuationHash,
      });
      nextRangeIndex += 1;
    }
  }
  if (nextRangeIndex !== ranges.length) {
    let error = new Error(
      `render continuation prepass exported ${nextRangeIndex - 1} of ${ranges.length - 1} boundary payloads`,
    );
    error.code = 'RENDER_CONTINUATION_INCOMPLETE';
    throw error;
  }
  let durationMs = Date.now() - startedAt;
  let continuationHashes = ranges.map((range, index) => ({
    workerIndex: range.workerIndex,
    startFrame: range.startFrame,
    continuationHash: hashes[index],
  }));
  emitStage(executionOptions, 'continuation-prepass:done', {
    ranges: ranges.length,
    projectedFrames,
    durationMs,
    continuationHashes,
  });
  return {
    payloads,
    evidence: {
      durationMs,
      projectedFrames,
      continuationHashes,
    },
  };
}

async function executeDeterministicCapture({
  puppeteer,
  compositorCapture,
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
      compositorCapture,
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
    let setupStateHash = '';
    let continuationPayloads = null;
    let continuationPrepass = null;
    if (ranges.length > 1) {
      emitStage(executionOptions, 'setup-state:export', { workerIndex: 0 });
      let initialPayload = await exportContinuationState(
        leader.page,
        renderClock,
        log,
        pool.controller.signal,
      );
      setupStateHash = sha256(JSON.stringify(initialPayload));
      emitStage(executionOptions, 'setup-state:exported', { workerIndex: 0, setupStateHash });
      emitStage(executionOptions, 'setup-state:canonicalize', { workerIndex: 0 });
      await importContinuationState(leader.page, renderClock, initialPayload, log, pool.controller.signal);
      emitStage(executionOptions, 'setup-state:canonicalized', { workerIndex: 0, setupStateHash });
      let prepass = await runContinuationPrepass({
        leaderPage: leader.page,
        ranges,
        renderClock,
        video,
        initialPayload,
        initialHash: setupStateHash,
        signal: pool.controller.signal,
        executionOptions,
        log,
      });
      continuationPayloads = prepass.payloads;
      continuationPrepass = prepass.evidence;
      // The leader drew every projected frame during the prepass, so reset it to
      // the canonical initial state before it captures range 0 for real.
      emitStage(executionOptions, 'setup-state:restore', { workerIndex: 0, setupStateHash });
      await importContinuationState(leader.page, renderClock, initialPayload, log, pool.controller.signal);
      emitStage(executionOptions, 'setup-state:restored', { workerIndex: 0, setupStateHash });
    }
    let peers = await settleWorkerPool(ranges.slice(1).map((range, offset) => async () => {
      let index = offset + 1;
      let worker = await prepareBrowserWorker({
        puppeteer,
        compositorCapture,
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
          payload: continuationPayloads[index],
        },
      });
      activeWorkers.push(worker);
      return worker;
    }), pool.controller);
    let prepared = [leader, ...peers];
    let resourceSamplingOptions = executionOptions.resourceSampling || job.execution?.resourceSampling || {};
    let resourceSampler = resourceSamplingOptions.enabled === true
      ? await startProcessTreeRssSampling({
        execFile,
        prepared,
        intervalMs: Math.max(100, Math.round(Number(resourceSamplingOptions.intervalMs) || 500)),
        required: resourceSamplingOptions.required === true,
      })
      : null;
    let completion = createRenderFrameCompletionTracker(video.frameCount);
    emitStage(executionOptions, 'capture:start', {
      frames: video.frameCount,
      fps: video.fps,
      durationMs: video.durationMs,
      timelineActions: 0,
      workerCount: ranges.length,
      mode: renderClock.mode,
    });
    let workerResults;
    let resourceMeasurement = null;
    let workerFailure = null;
    try {
      workerResults = await settleWorkerPool(prepared.map((worker) => async () => (
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
    } catch (error) {
      workerFailure = error;
    } finally {
      if (resourceSampler) {
        try {
          resourceMeasurement = await resourceSampler.stop();
        } catch (error) {
          workerFailure ||= error;
        }
      }
    }
    if (workerFailure) {
      let workerRanges = [
        ...(workerFailure.workerResults || []).map((result) => result.metric),
        workerFailure.proof?.workerRange,
      ].filter(Boolean).sort((a, b) => a.workerIndex - b.workerIndex);
      workerFailure.proof = {
        ...(workerFailure.proof || {}),
        ...(resourceMeasurement ? {
          resourceMeasurement: {
            sampleCount: resourceMeasurement.samples.length,
            peakRssBytes: resourceMeasurement.peakRssBytes,
            workerPeakRssBytes: resourceMeasurement.workerPeakRssBytes,
          },
        } : {}),
        workerRanges,
      };
      throw workerFailure;
    }
    let seamProofs;
    try {
      seamProofs = await verifyWorkerSeams({
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
    } catch (error) {
      if (resourceMeasurement) {
        error.proof = {
          ...(error.proof || {}),
          resourceMeasurement: {
            sampleCount: resourceMeasurement.samples.length,
            peakRssBytes: resourceMeasurement.peakRssBytes,
            workerPeakRssBytes: resourceMeasurement.workerPeakRssBytes,
          },
          workerRanges: workerResults.map((result) => result.metric),
        };
      }
      throw error;
    }
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
      frameCaptureType: renderClock.transport === 'attributed-compositor' ? 'attributed-compositor' : 'screenshot',
      ...(setupStateHash ? { setupStateHash } : {}),
      ...(continuationPrepass ? { continuationPrepass } : {}),
      seamProofs,
      workerRanges: workerResults
        .map((result) => result.metric)
        .sort((a, b) => a.workerIndex - b.workerIndex),
      ...(resourceMeasurement ? {
        resourceSamples: resourceMeasurement.samples,
        peakRssBytes: resourceMeasurement.peakRssBytes,
        workerPeakRssBytes: resourceMeasurement.workerPeakRssBytes,
        ...(resourceMeasurement.error ? { resourceSamplingError: resourceMeasurement.error } : {}),
      } : {}),
    };
    if (renderClock.transport === 'attributed-compositor') {
      capture.transport = buildTransportEvidence(
        workerResults.flatMap((result) => result.transportSamples || []),
        video,
      );
    }
    let closeResults = [];
    let sessionStopResults = [];
    for (let worker of activeWorkers.splice(0)) {
      if (worker.session) {
        sessionStopResults.push(await closeCompositorSession(worker.session, executionOptions, {
          workerIndex: worker.range.workerIndex,
        }));
      }
      closeResults.push(await closeBrowserWorker(worker.browser, executionOptions, {
        workerIndex: worker.range.workerIndex,
      }));
    }
    capture.browserCloseTimeouts = closeResults.filter((result) => result.timedOut).length;
    if (capture.transport) {
      capture.transport.sessionsStopped = sessionStopResults.filter(
        (result) => !result.timedOut && !result.error,
      ).length;
      capture.transport.sessionStopTimeouts = sessionStopResults.filter((result) => result.timedOut).length;
      capture.transport.sessionStopErrors = sessionStopResults.filter((result) => result.error).length;
    }
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
      if (worker.session) {
        await closeCompositorSession(worker.session, executionOptions, {
          workerIndex: worker.range.workerIndex,
        }).catch(() => {});
      }
      await closeBrowserWorker(worker.browser, executionOptions, {
        workerIndex: worker.range.workerIndex,
      });
    }
    pool.dispose();
  }
}

export function createLocalBrowserScreencastProvider(options = {}) {
  let {
    puppeteer,
    compositorCapture = null,
    ffmpegPath = 'ffmpeg',
    execFile = defaultExecFile,
    cwd = process.cwd(),
    framesRoot,
  } = options;
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
      if (renderClock.transport === 'attributed-compositor') {
        if (frameFormat !== 'png') {
          let error = new Error(
            `attributed-compositor transport captures lossless png only; got "${frameFormat}"`,
          );
          error.code = 'RENDER_TRANSPORT_FORMAT_UNSUPPORTED';
          throw error;
        }
        if (!compositorCapture || typeof compositorCapture.openSession !== 'function') {
          let error = new Error(
            'attributed-compositor transport requires an injected compositorCapture.openSession adapter',
          );
          error.code = 'RENDER_COMPOSITOR_ADAPTER_REQUIRED';
          throw error;
        }
      }
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
          compositorCapture,
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
