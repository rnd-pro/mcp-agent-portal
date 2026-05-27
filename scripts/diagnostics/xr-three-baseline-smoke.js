#!/usr/bin/env node
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { WebSocket } from 'ws';

const REQUIRED_ROWS = [
  'XR visual readiness',
  'XR visual readiness checks',
  'XR interaction readiness',
  'XR interaction checks',
  'Server visual readiness',
  'Server interaction readiness',
  'Texture strict',
  'Texture ready',
  'Texture block reason',
  'Three texture applied',
  'Strict diagnostic panels',
];

function parseArgs(argv) {
  let options = {
    baseUrl: 'http://portal.local',
    startServer: true,
    chrome: process.env.CHROME_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    port: 9343,
    texture: 'strict',
    reportPath: path.join('tmp', 'xr-three-baseline-smoke', 'report.json'),
    viewportWidth: 1440,
    viewportHeight: 1000,
  };
  for (let index = 0; index < argv.length; index += 1) {
    let arg = argv[index];
    if (arg === '--base-url') options.baseUrl = argv[++index];
    else if (arg === '--no-start-server') options.startServer = false;
    else if (arg === '--chrome') options.chrome = argv[++index];
    else if (arg === '--port') options.port = Number(argv[++index]);
    else if (arg === '--texture') options.texture = argv[++index] || 'strict';
    else if (arg === '--report') options.reportPath = argv[++index];
    else if (arg === '--viewport') {
      let [width, height] = String(argv[++index] || '').split('x').map(Number);
      if (Number.isFinite(width) && Number.isFinite(height)) {
        options.viewportWidth = width;
        options.viewportHeight = height;
      }
    }
  }
  return options;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function requestText(url) {
  return new Promise((resolve, reject) => {
    let target = new URL(url);
    let transport = target.protocol === 'https:' ? https : http;
    let request = transport.get(target, (response) => {
      let chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => {
        if (response.statusCode < 200 || response.statusCode >= 400) {
          reject(new Error(`HTTP ${response.statusCode} ${url}`));
          return;
        }
        resolve(Buffer.concat(chunks).toString('utf8'));
      });
    });
    request.on('error', reject);
  });
}

function requestJson(url, options = {}) {
  return new Promise((resolve, reject) => {
    let request = http.request(url, { method: options.method || 'GET' }, (response) => {
      let chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => {
        if (response.statusCode < 200 || response.statusCode >= 300) {
          reject(new Error(`HTTP ${response.statusCode} ${url}`));
          return;
        }
        try {
          resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
        } catch (error) {
          reject(error);
        }
      });
    });
    request.on('error', reject);
    request.end();
  });
}

async function waitFor(fn, timeoutMs = 15000) {
  let started = Date.now();
  let lastError = null;
  while (Date.now() - started < timeoutMs) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      await delay(250);
    }
  }
  throw lastError || new Error('Timed out');
}

function spawnProcess(command, args, options = {}) {
  return spawn(command, args, {
    stdio: options.stdio || ['ignore', 'pipe', 'pipe'],
    cwd: options.cwd || process.cwd(),
    env: { ...process.env, ...(options.env || {}) },
  });
}

async function stopProcess(child) {
  if (!child || child.killed) return;
  child.kill('SIGTERM');
  await delay(800);
  if (!child.killed) child.kill('SIGKILL');
}

class CdpClient {
  constructor(wsUrl) {
    this.ws = new WebSocket(wsUrl);
    this.nextId = 1;
    this.pending = new Map();
    this.listeners = new Map();
    this.ready = new Promise((resolve, reject) => {
      this.ws.once('open', resolve);
      this.ws.once('error', reject);
    });
    this.ws.on('message', (message) => {
      let payload = JSON.parse(message.toString());
      if (payload.id && this.pending.has(payload.id)) {
        let { resolve, reject } = this.pending.get(payload.id);
        this.pending.delete(payload.id);
        payload.error ? reject(new Error(payload.error.message)) : resolve(payload.result || {});
      } else if (payload.method && this.listeners.has(payload.method)) {
        for (let listener of this.listeners.get(payload.method)) {
          listener(payload.params || {});
        }
      }
    });
  }

  async send(method, params = {}) {
    await this.ready;
    let id = this.nextId++;
    let promise = new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
    });
    this.ws.send(JSON.stringify({ id, method, params }));
    return promise;
  }

  on(method, listener) {
    let listeners = this.listeners.get(method) || [];
    listeners.push(listener);
    this.listeners.set(method, listeners);
  }

  close() {
    this.ws.close();
  }
}

async function evaluate(client, expression, timeoutMs = 10000) {
  let result = await client.send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
    timeout: timeoutMs,
  });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.text || 'Runtime.evaluate failed');
  }
  return result.result?.value;
}

async function createPage(port) {
  let target = await requestJson(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' });
  if (!target.webSocketDebuggerUrl) throw new Error('Chrome did not create a page debug target');
  return new CdpClient(target.webSocketDebuggerUrl);
}

function getMissingRows(rows = {}) {
  return REQUIRED_ROWS.filter((row) => !rows[row] || rows[row] === '-');
}

function normalizeBodySnippet(text) {
  return String(text || '').replace(/\s+/g, ' ').trim().slice(0, 1200);
}

async function readPageState(client) {
  return evaluate(client, `(() => {
    const rows = {};
    for (const term of document.querySelectorAll('dt')) {
      rows[term.textContent] = term.nextElementSibling?.textContent || '';
    }
    return {
      rows,
      url: location.href,
      pageTitle: document.title || '',
      bodySnippet: document.body ? document.body.innerText.replace(/\\s+/g, ' ').trim().slice(0, 1200) : '',
      hasCanvas: Boolean(document.querySelector('canvas')),
      livePanelCount: document.querySelectorAll('.live-panel-source').length
    };
  })()`, 1000);
}

async function inspectBaseline(client, url) {
  await client.send('Page.navigate', { url });
  let started = Date.now();
  let lastState = null;
  while (Date.now() - started < 12000) {
    lastState = await readPageState(client);
    if (!getMissingRows(lastState.rows).length) {
      return {
        ...lastState,
        ready: true,
        stage: 'diagnostics-ready',
        missingRows: [],
        nextAction: 'inspect-three-baseline-readiness',
      };
    }
    await delay(250);
  }
  lastState ||= await readPageState(client);
  return {
    ...lastState,
    ready: false,
    stage: 'missing-diagnostics-rows',
    missingRows: getMissingRows(lastState.rows),
    bodySnippet: normalizeBodySnippet(lastState.bodySnippet),
    nextAction: 'deploy-current-xr-baseline',
  };
}

function formatRuntimeArgs(args = []) {
  return args
    .map((arg) => arg.value ?? arg.description ?? arg.className ?? arg.type ?? '')
    .filter(Boolean)
    .join(' ')
    .slice(0, 500);
}

function collectPageErrors(client) {
  let pageErrors = [];
  client.on('Runtime.exceptionThrown', (params) => {
    pageErrors.push({
      source: 'runtime',
      text: params.exceptionDetails?.text || params.exceptionDetails?.exception?.description || 'Runtime exception',
    });
  });
  client.on('Runtime.consoleAPICalled', (params) => {
    if (params.type === 'error') {
      pageErrors.push({
        source: 'console',
        text: formatRuntimeArgs(params.args),
      });
    }
  });
  client.on('Log.entryAdded', (params) => {
    let entry = params.entry || {};
    if (entry.level === 'error') {
      pageErrors.push({
        source: entry.source || 'log',
        text: String(entry.text || 'Log error').slice(0, 500),
      });
    }
  });
  return pageErrors;
}

async function main() {
  let options = parseArgs(process.argv.slice(2));
  let server = null;
  let chrome = null;
  let client = null;
  let userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'xr-three-baseline-chrome-'));

  try {
    if (options.startServer) {
      server = spawnProcess('npm', ['run', 'dev']);
      await waitFor(() => requestText(`${options.baseUrl.replace(/\/$/, '')}/xr-three-panels-baseline.html`));
    }
    chrome = spawnProcess(options.chrome, [
      '--headless=new',
      '--disable-gpu',
      '--enable-unsafe-swiftshader',
      '--use-gl=swiftshader',
      '--no-first-run',
      '--no-default-browser-check',
      `--window-size=${options.viewportWidth},${options.viewportHeight}`,
      `--remote-debugging-port=${options.port}`,
      `--user-data-dir=${userDataDir}`,
      'about:blank',
    ]);
    await waitFor(() => requestJson(`http://127.0.0.1:${options.port}/json/version`));
    client = await createPage(options.port);
    await client.send('Runtime.enable');
    await client.send('Page.enable');
    await client.send('Log.enable');
    let pageErrors = collectPageErrors(client);
    await client.send('Emulation.setDeviceMetricsOverride', {
      width: options.viewportWidth,
      height: options.viewportHeight,
      deviceScaleFactor: 1,
      mobile: false,
    });
    let url = `${options.baseUrl.replace(/\/$/, '')}/xr-three-panels-baseline.html?texture=${encodeURIComponent(options.texture)}`;
    let inspected = await inspectBaseline(client, url);
    if (!inspected.ready) {
      let output = {
        ok: false,
        version: 'xr-three-baseline-smoke-v1',
        url,
        texture: options.texture,
        stage: inspected.stage,
        missingRows: inspected.missingRows,
        nextAction: inspected.nextAction,
        pageTitle: inspected.pageTitle,
        bodySnippet: inspected.bodySnippet,
        pageErrorCount: pageErrors.length,
        pageErrors,
        hasCanvas: inspected.hasCanvas,
        livePanelCount: inspected.livePanelCount,
        rows: inspected.rows,
        reportPath: path.resolve(options.reportPath),
      };
      fs.mkdirSync(path.dirname(output.reportPath), { recursive: true });
      fs.writeFileSync(output.reportPath, `${JSON.stringify(output, null, 2)}\n`);
      process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
      process.exitCode = 1;
      return;
    }
    let readiness = inspected.rows['XR visual readiness'];
    let checks = inspected.rows['XR visual readiness checks'];
    let interactionReadiness = inspected.rows['XR interaction readiness'];
    let interactionChecks = inspected.rows['XR interaction checks'];
    let serverVisualReadiness = inspected.rows['Server visual readiness'];
    let serverInteractionReadiness = inspected.rows['Server interaction readiness'];
    let textureStrict = inspected.rows['Texture strict'];
    let textureReady = inspected.rows['Texture ready'];
    let textureBlockReason = inspected.rows['Texture block reason'];
    let textureApplied = inspected.rows['Three texture applied'];
    let strictDiagnosticPanels = inspected.rows['Strict diagnostic panels'];
    let ok = (
      readiness === 'pass:ready' &&
      checks === 'ready' &&
      interactionReadiness === 'ready:ready' &&
      serverVisualReadiness === 'pass:ready' &&
      serverInteractionReadiness === 'ready:ready' &&
      textureStrict === 'required' &&
      textureReady === '4/4' &&
      textureBlockReason === '-' &&
      textureApplied === '4/4' &&
      strictDiagnosticPanels === '-' &&
      inspected.hasCanvas &&
      inspected.livePanelCount === 4 &&
      pageErrors.length === 0
    );
    let output = {
      ok,
      version: 'xr-three-baseline-smoke-v1',
      url,
      texture: options.texture,
      stage: inspected.stage,
      missingRows: inspected.missingRows,
      nextAction: ok ? 'three-baseline-ready' : 'inspect-three-baseline-readiness',
      readiness,
      checks,
      interactionReadiness,
      interactionChecks,
      serverVisualReadiness,
      serverInteractionReadiness,
      textureStrict,
      textureReady,
      textureBlockReason,
      textureApplied,
      strictDiagnosticPanels,
      pageErrorCount: pageErrors.length,
      pageErrors,
      hasCanvas: inspected.hasCanvas,
      livePanelCount: inspected.livePanelCount,
      rows: inspected.rows,
      reportPath: path.resolve(options.reportPath),
    };
    fs.mkdirSync(path.dirname(output.reportPath), { recursive: true });
    fs.writeFileSync(output.reportPath, `${JSON.stringify(output, null, 2)}\n`);
    process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
    if (!ok) process.exitCode = 1;
  } finally {
    client?.close();
    await stopProcess(chrome);
    await stopProcess(server);
    fs.rmSync(userDataDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exitCode = 1;
});
