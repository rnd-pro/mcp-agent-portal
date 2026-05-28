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
  'Source',
  'Panels',
  'Panels live',
  'Mode',
  'Renderer',
  'Three panels',
  'Three rendered panels',
  'Three diagnostic panels',
  'XR texture mode',
  'XR texture gate',
  'XR texture ready',
  'XR launch',
  'XR gate',
  'XR readiness',
  'Panel errors',
];

function parseArgs(argv) {
  let options = {
    baseUrl: process.env.XR_PRODUCTION_BASE_URL || 'http://portal.local',
    startServer: true,
    chrome: process.env.CHROME_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    port: 9344,
    project: 'agent-portal',
    target: 'graph',
    texture: 'strict',
    waitMs: 12000,
    reportPath: path.join('tmp', 'xr-production-spatial-smoke', 'report.json'),
    viewportWidth: 1440,
    viewportHeight: 1000,
  };
  for (let index = 0; index < argv.length; index += 1) {
    let arg = argv[index];
    if (arg === '--base-url') options.baseUrl = argv[++index];
    else if (arg === '--no-start-server') options.startServer = false;
    else if (arg === '--chrome') options.chrome = argv[++index];
    else if (arg === '--port') options.port = Number(argv[++index]) || options.port;
    else if (arg === '--project') options.project = argv[++index] || options.project;
    else if (arg === '--target') options.target = argv[++index] || options.target;
    else if (arg === '--texture') options.texture = argv[++index] || options.texture;
    else if (arg === '--wait-ms') options.waitMs = Number(argv[++index]) || options.waitMs;
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

function requestText(url, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    let target = new URL(url);
    let transport = target.protocol === 'https:' ? https : http;
    let request = transport.request(target, { method: 'GET', timeout: timeoutMs }, (response) => {
      let chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => {
        if (response.statusCode < 200 || response.statusCode >= 400) {
          reject(new Error(`HTTP ${response.statusCode} ${target.href}`));
          return;
        }
        resolve(Buffer.concat(chunks).toString('utf8'));
      });
    });
    request.on('timeout', () => request.destroy(new Error(`Timeout ${timeoutMs}ms ${target.href}`)));
    request.on('error', reject);
    request.end();
  });
}

function requestJson(url, timeoutMs = 10000, method = 'GET') {
  return new Promise((resolve, reject) => {
    let target = typeof url === 'string' ? new URL(url) : url;
    let transport = target.protocol === 'https:' ? https : http;
    let request = transport.request(target, { method, timeout: timeoutMs, headers: { Accept: 'application/json' } }, (response) => {
      let chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => {
        if (response.statusCode < 200 || response.statusCode >= 300) {
          reject(new Error(`HTTP ${response.statusCode} ${target.href}`));
          return;
        }
        try {
          resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
        } catch (error) {
          reject(error);
        }
      });
    });
    request.on('timeout', () => request.destroy(new Error(`Timeout ${timeoutMs}ms ${target.href}`)));
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

function getLocalSecureOriginArg(baseUrl) {
  let url = new URL(baseUrl);
  if (url.protocol !== 'http:') return null;
  return `--unsafely-treat-insecure-origin-as-secure=${url.origin}`;
}

async function stopProcess(child) {
  if (!child || child.exitCode != null || child.signalCode != null) return;
  child.kill('SIGTERM');
  await delay(800);
  if (child.exitCode == null && child.signalCode == null) child.kill('SIGKILL');
}

async function removeDirectoryWithRetry(dirPath) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      fs.rmSync(dirPath, { recursive: true, force: true });
      return;
    } catch (error) {
      if (attempt === 4) throw error;
      await delay(150);
    }
  }
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
        for (let listener of this.listeners.get(payload.method)) listener(payload.params || {});
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

async function createPage(port) {
  let target = await requestJson(`http://127.0.0.1:${port}/json/new?about:blank`, 10000, 'PUT');
  if (!target.webSocketDebuggerUrl) throw new Error('Chrome did not create a page debug target');
  return new CdpClient(target.webSocketDebuggerUrl);
}

async function evaluate(client, expression, timeoutMs = 3000) {
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

function createProductionUrl(options) {
  let base = options.baseUrl.replace(/\/$/, '');
  let params = new URLSearchParams({
    project: options.project,
    target: options.target,
    texture: options.texture,
  });
  return `${base}/#spatial?${params.toString()}`;
}

function createSummaryUrl(baseUrl) {
  let url = new URL(baseUrl);
  let pathname = url.pathname.endsWith('/') ? url.pathname.slice(0, -1) : url.pathname;
  url.pathname = `${pathname}/api/xr-diagnostics/summary`.replace(/\/+/g, '/');
  url.search = '';
  url.hash = '';
  return url;
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
        text: (params.args || [])
          .map((arg) => arg.value ?? arg.description ?? arg.className ?? arg.type ?? '')
          .filter(Boolean)
          .join(' ')
          .slice(0, 500),
      });
    }
  });
  return pageErrors;
}

async function readSpatialState(client) {
  return evaluate(client, `(() => {
    const roots = [document];
    for (let index = 0; index < roots.length; index += 1) {
      for (const element of roots[index].querySelectorAll('*')) {
        if (element.shadowRoot) roots.push(element.shadowRoot);
      }
    }
    const rows = {};
    let livePanelCount = 0;
    let enterButton = null;
    for (const root of roots) {
      for (const term of root.querySelectorAll('dt')) {
        rows[term.textContent] = term.nextElementSibling?.textContent || '';
      }
      for (const item of root.querySelectorAll('.psl-status span')) {
        let text = item.textContent || '';
        let separator = text.indexOf(':');
        if (separator > 0) {
          rows[text.slice(0, separator).trim()] = text.slice(separator + 1).trim();
        }
      }
      livePanelCount += root.querySelectorAll('.live-panel-source').length;
      enterButton ||= root.querySelector('[data-ref="enterButton"], .psl-enter');
    }
    return {
      rows,
      url: location.href,
      pageTitle: document.title || '',
      bodySnippet: document.body ? document.body.innerText.replace(/\\s+/g, ' ').trim().slice(0, 1200) : '',
      hasSpatialLayout: Boolean(document.querySelector('pg-spatial-layout')),
      livePanelCount,
      enterDisabled: Boolean(enterButton?.disabled),
      enterTitle: enterButton?.title || ''
    };
  })()`);
}

function getMissingRows(rows = {}) {
  return REQUIRED_ROWS.filter((row) => !rows[row] || rows[row] === '-');
}

function parseCount(value) {
  let match = String(value ?? '').match(/^\s*(\d+)\s*$/);
  return match ? Number(match[1]) : null;
}

function parseRatio(value) {
  let match = String(value ?? '').match(/^\s*(\d+)\s*\/\s*(\d+)\s*$/);
  if (!match) return { ready: null, total: null, complete: false };
  let ready = Number(match[1]);
  let total = Number(match[2]);
  return { ready, total, complete: total > 0 && ready === total };
}

function selectProductionClient(summary, options) {
  let clients = Array.isArray(summary?.clients) ? summary.clients : [];
  return clients.find((client) => (
    client?.surface?.surfaceKind === 'production' &&
    client?.surface?.entrypoint === 'spatial-layout' &&
    client?.surface?.projectId === options.project &&
    client?.surface?.targetSection === options.target
  )) || null;
}

function deriveNextAction(failedChecks = [], rows = {}) {
  if (failedChecks.includes('production-client')) return 'open-production-spatial-url';
  if (failedChecks.includes('no-diagnostic-panels')) return 'inspect-production-texture-upload';
  if (failedChecks.includes('three-rendered-panels') &&
    String(rows['XR texture gate'] || '').startsWith('blocked:') &&
    String(rows['HTML Canvas'] || '').includes('enable-CanvasDrawElement')) {
    return 'enable-html-in-canvas-on-headset';
  }
  if (failedChecks.includes('live-panels') || failedChecks.includes('three-rendered-panels')) return 'inspect-production-panel-mount';
  if (failedChecks.includes('launch-texture-gate-separated')) return 'inspect-production-launch-texture-separation';
  return failedChecks.length ? 'inspect-production-spatial-diagnostics' : 'production-spatial-diagnostics-ready';
}

function buildReport({ options, url, inspected, summary, productionClient, pageErrors, error = null }) {
  let rows = inspected?.rows || {};
  let missingRows = getMissingRows(rows);
  let textureGate = rows['XR texture gate'] || null;
  let launchGate = rows['XR gate'] || null;
  let panels = parseCount(rows.Panels);
  let panelsLive = parseRatio(rows['Panels live']);
  let threePanels = parseCount(rows['Three panels']);
  let threeRenderedPanels = parseRatio(rows['Three rendered panels']);
  let threeDiagnosticPanels = parseCount(rows['Three diagnostic panels']);
  let panelErrors = parseCount(rows['Panel errors']);
  let strictTextureBlocked = textureGate?.startsWith('blocked:');
  let launchGateBlocked = launchGate?.startsWith('blocked:');
  let launchTextureSeparated = strictTextureBlocked && !launchGateBlocked;
  let checks = [
    { id: 'spatial-page-loaded', status: inspected?.hasSpatialLayout ? 'pass' : 'fail' },
    { id: 'diagnostics-rows', status: missingRows.length ? 'fail' : 'pass', missingRows },
    { id: 'production-client', status: productionClient ? 'pass' : 'fail' },
    {
      id: 'live-panels',
      status: panelsLive.complete && (panels == null || panelsLive.total === panels) ? 'pass' : 'fail',
      value: rows['Panels live'] || null,
      panels,
    },
    {
      id: 'three-rendered-panels',
      status: threeRenderedPanels.complete && (threePanels == null || threeRenderedPanels.total === threePanels) ? 'pass' : 'fail',
      value: rows['Three rendered panels'] || null,
      threePanels,
    },
    {
      id: 'panel-errors',
      status: panelErrors === 0 ? 'pass' : 'fail',
      value: rows['Panel errors'] || null,
    },
    {
      id: 'no-diagnostic-panels',
      status: threeDiagnosticPanels === 0 ? 'pass' : 'fail',
      value: rows['Three diagnostic panels'] || null,
      reason: threeDiagnosticPanels === 0
        ? 'production-panels-use-live-textures'
        : 'production-is-rendering-provider-diagnostic-materials',
    },
    { id: 'strict-texture-mode', status: rows['XR texture mode'] === 'strict' ? 'pass' : 'fail', value: rows['XR texture mode'] || null },
    {
      id: 'launch-texture-gate-separated',
      status: launchTextureSeparated ? 'pass' : 'fail',
      textureGate,
      launchGate,
      reason: launchTextureSeparated
        ? 'session-launch-can-collect-quest-evidence'
        : 'texture-readiness-is-blocking-session-launch',
    },
    { id: 'page-errors', status: pageErrors.length ? 'fail' : 'pass', count: pageErrors.length },
  ];
  let failedChecks = checks.filter((check) => check.status === 'fail').map((check) => check.id);
  return {
    ok: failedChecks.length === 0,
    version: 'xr-production-spatial-smoke-v1',
    url,
    summaryUrl: createSummaryUrl(options.baseUrl).href,
    stage: failedChecks.length ? 'production-spatial-not-ready' : 'production-spatial-ready',
    nextAction: deriveNextAction(failedChecks, rows),
    pageTitle: inspected?.pageTitle || null,
    bodySnippet: inspected?.bodySnippet || null,
    rows,
    missingRows,
    livePanelCount: inspected?.livePanelCount ?? null,
    enterDisabled: inspected?.enterDisabled ?? null,
    enterTitle: inspected?.enterTitle || null,
    productionClientId: productionClient?.clientId || null,
    summaryClientCount: Number(summary?.clientCount || summary?.clients?.length || 0),
    pageErrorCount: pageErrors.length,
    pageErrors,
    failedChecks,
    checks,
    error: error ? String(error?.message || error) : null,
    reportPath: path.resolve(options.reportPath),
  };
}

async function main() {
  let options = parseArgs(process.argv.slice(2));
  let server = null;
  let chrome = null;
  let client = null;
  let pageErrors = [];
  let userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'xr-production-spatial-chrome-'));
  let url = createProductionUrl(options);

  try {
    if (options.startServer) {
      server = spawnProcess('npm', ['run', 'dev']);
      await waitFor(() => requestText(options.baseUrl), options.waitMs);
    }
    let localSecureOriginArg = getLocalSecureOriginArg(options.baseUrl);
    chrome = spawnProcess(options.chrome, [
      '--headless=new',
      '--disable-gpu',
      '--enable-unsafe-swiftshader',
      '--use-gl=swiftshader',
      '--no-first-run',
      '--no-default-browser-check',
      ...(localSecureOriginArg ? [localSecureOriginArg] : []),
      `--window-size=${options.viewportWidth},${options.viewportHeight}`,
      `--remote-debugging-port=${options.port}`,
      `--user-data-dir=${userDataDir}`,
      'about:blank',
    ]);
    await waitFor(() => requestJson(`http://127.0.0.1:${options.port}/json/version`), options.waitMs);
    client = await createPage(options.port);
    await client.send('Runtime.enable');
    await client.send('Page.enable');
    await client.send('Log.enable');
    pageErrors = collectPageErrors(client);
    await client.send('Emulation.setDeviceMetricsOverride', {
      width: options.viewportWidth,
      height: options.viewportHeight,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await client.send('Page.navigate', { url });

    let inspected = null;
    await waitFor(async () => {
      inspected = await readSpatialState(client);
      if (!inspected.hasSpatialLayout) throw new Error('Spatial layout not mounted');
      if (getMissingRows(inspected.rows).length) throw new Error('Spatial diagnostics not ready');
      return inspected;
    }, options.waitMs);
    await delay(750);
    inspected = await readSpatialState(client);
    let summary = await requestJson(createSummaryUrl(options.baseUrl), options.waitMs);
    let productionClient = selectProductionClient(summary, options);
    let report = buildReport({ options, url, inspected, summary, productionClient, pageErrors });
    fs.mkdirSync(path.dirname(report.reportPath), { recursive: true });
    fs.writeFileSync(report.reportPath, `${JSON.stringify(report, null, 2)}\n`);
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    if (!report.ok) process.exitCode = 1;
  } catch (error) {
    let inspected = null;
    try {
      if (client) inspected = await readSpatialState(client);
    } catch {
      inspected = null;
    }
    let report = buildReport({
      options,
      url,
      inspected,
      summary: null,
      productionClient: null,
      pageErrors,
      error,
    });
    fs.mkdirSync(path.dirname(report.reportPath), { recursive: true });
    fs.writeFileSync(report.reportPath, `${JSON.stringify(report, null, 2)}\n`);
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    process.exitCode = 1;
  } finally {
    client?.close();
    await stopProcess(chrome);
    await stopProcess(server);
    await removeDirectoryWithRetry(userDataDir);
  }
}

main();
