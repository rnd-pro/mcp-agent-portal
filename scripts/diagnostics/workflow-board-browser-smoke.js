#!/usr/bin/env node
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { WebSocket } from 'ws';
import * as esbuild from 'esbuild';

function parseArgs(argv) {
  let options = {
    cards: 1000,
    chrome: process.env.CHROME_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    chromePort: 9355,
    waitMs: 15000,
    reportPath: path.join('tmp', 'workflow-board-browser-smoke', 'report.json'),
    viewportWidth: 1440,
    viewportHeight: 1000,
  };
  for (let index = 0; index < argv.length; index += 1) {
    let arg = argv[index];
    if (arg === '--cards') options.cards = Math.max(1, Number(argv[++index]) || options.cards);
    else if (arg === '--chrome') options.chrome = argv[++index] || options.chrome;
    else if (arg === '--chrome-port') options.chromePort = Number(argv[++index]) || options.chromePort;
    else if (arg === '--wait-ms') options.waitMs = Number(argv[++index]) || options.waitMs;
    else if (arg === '--report') options.reportPath = argv[++index] || options.reportPath;
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
  return new Promise(resolve => setTimeout(resolve, ms));
}

function requestJson(url, timeoutMs = 10000, method = 'GET') {
  return new Promise((resolve, reject) => {
    let target = new URL(url);
    let request = http.request(target, { method, timeout: timeoutMs, headers: { Accept: 'application/json' } }, (response) => {
      let chunks = [];
      response.on('data', chunk => chunks.push(chunk));
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
    stdio: ['ignore', 'pipe', 'pipe'],
    cwd: options.cwd || process.cwd(),
    env: { ...process.env, ...(options.env || {}) },
  });
}

async function stopProcess(child) {
  if (!child || child.exitCode != null || child.signalCode != null) return;
  child.kill('SIGTERM');
  await delay(800);
  if (child.exitCode == null && child.signalCode == null) child.kill('SIGKILL');
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

async function evaluate(client, expression, timeoutMs = 5000) {
  let result = await client.send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
    timeout: timeoutMs,
  });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.text || result.exceptionDetails.exception?.description || 'Runtime.evaluate failed');
  }
  return result.result?.value;
}

function createHarnessSource(cardCount) {
  return `
import 'symbiote-ui/board';

const columns = [
  ['ideas', 'Ideas / Inbox'],
  ['backlog', 'Backlog'],
  ['ready', 'Tasks'],
  ['in-progress', 'In Progress'],
  ['quality-audit', 'Quality Audit'],
  ['commit-publish', 'Commit / Publish'],
  ['needs-decision', 'Needs Decision'],
  ['done', 'Done'],
];

function makeCards(count) {
  return Array.from({ length: count }, (_, index) => ({
    id: 'card-' + String(index).padStart(4, '0'),
    columnId: columns[index % columns.length][0],
    title: 'Workflow card ' + index,
    ticker: { label: index % 7 === 0 ? 'Running tests' : 'Queued', icon: index % 7 === 0 ? 'autorenew' : 'schedule', kind: index % 7 === 0 ? 'state' : '' },
    meta: [{ label: 'agent-portal', kind: '' }, { label: index % 5 === 0 ? 'audit' : 'implementation', kind: '' }],
    footer: [{ label: 'agent-' + (index % 12), icon: 'smart_toy', kind: 'agent', accent: '#357ABD' }],
    raw: { version: 1 },
  }));
}

function rectOf(node) {
  let rect = node.getBoundingClientRect();
  return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height };
}

function overlaps(a, b, tolerance = 1) {
  return a.left < b.right - tolerance && a.right > b.left + tolerance
    && a.top < b.bottom - tolerance && a.bottom > b.top + tolerance;
}

function inspectLayout(board) {
  let columnsNodes = [...board.querySelectorAll('.sn-kanban-column')];
  let headers = [...board.querySelectorAll('.sn-kanban-column-header')];
  let cards = [...board.querySelectorAll('.sn-kanban-card')];
  let headerRects = headers.map(rectOf);
  let columnRects = columnsNodes.map(rectOf);
  let cardRects = cards.slice(0, 160).map(rectOf).filter(rect => rect.width > 0 && rect.height > 0);
  let overlappingColumns = 0;
  for (let i = 0; i < columnRects.length; i += 1) {
    for (let j = i + 1; j < columnRects.length; j += 1) {
      if (overlaps(columnRects[i], columnRects[j], 2)) overlappingColumns += 1;
    }
  }
  let overlappingCards = 0;
  for (let i = 0; i < cardRects.length; i += 1) {
    for (let j = i + 1; j < cardRects.length; j += 1) {
      if (overlaps(cardRects[i], cardRects[j], 2)) overlappingCards += 1;
    }
  }
  let headerHeights = headerRects.map(rect => rect.height).filter(height => height > 0);
  let headerHeightSpread = headerHeights.length
    ? Math.max(...headerHeights) - Math.min(...headerHeights)
    : null;
  return {
    columnCount: columnsNodes.length,
    headerCount: headers.length,
    cardCount: cards.length,
    nodeCount: board.querySelectorAll('*').length,
    textLength: board.textContent.trim().length,
    firstCardTitle: board.querySelector('.sn-kanban-card-title-text')?.textContent || '',
    headerHeightSpread,
    overlappingColumns,
    overlappingCards,
  };
}

const board = document.createElement('sn-kanban-board');
board.style.width = '1280px';
board.style.height = '820px';
document.body.style.margin = '0';
document.body.append(board);
board.setBoard({
  id: 'workflow-smoke',
  title: 'Workflow Smoke',
  columns: columns.map(([id, title]) => ({ id, title, cards: [] })),
  cards: makeCards(${cardCount}),
});
await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
const layout = inspectLayout(board);
window.__workflowBoardSmokeReport = {
  version: 'workflow-board-browser-smoke-v1',
  cardTarget: ${cardCount},
  layout,
  checks: {
    nonblank: layout.textLength > 0 && layout.firstCardTitle.startsWith('Workflow card'),
    allCardsRendered: layout.cardCount === ${cardCount},
    headersAligned: layout.headerHeightSpread !== null && layout.headerHeightSpread <= 2,
    noColumnOverlap: layout.overlappingColumns === 0,
    noSampledCardOverlap: layout.overlappingCards === 0,
  },
};
`;
}

async function createHarnessServer(options, dirPath) {
  let entryPath = path.join(dirPath, 'workflow-board-smoke-entry.js');
  let bundlePath = path.join(dirPath, 'workflow-board-smoke-bundle.js');
  fs.writeFileSync(entryPath, createHarnessSource(options.cards));
  await esbuild.build({
    entryPoints: [entryPath],
    outfile: bundlePath,
    absWorkingDir: process.cwd(),
    nodePaths: [path.join(process.cwd(), 'node_modules')],
    bundle: true,
    format: 'esm',
    target: ['chrome120'],
    logLevel: 'silent',
  });
  let html = '<!doctype html><html><head><meta charset="utf-8"><title>Workflow Board Smoke</title></head><body><script type="module" src="/workflow-board-smoke-bundle.js"></script></body></html>';
  let server = http.createServer((req, res) => {
    if (req.url === '/' || req.url === '/index.html') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(html);
      return;
    }
    if (req.url === '/workflow-board-smoke-bundle.js') {
      res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8' });
      fs.createReadStream(bundlePath).pipe(res);
      return;
    }
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not found');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return server;
}

async function main() {
  let options = parseArgs(process.argv.slice(2));
  let tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'workflow-board-browser-smoke-'));
  let userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'workflow-board-smoke-chrome-'));
  let server = null;
  let chrome = null;
  let page = null;
  try {
    server = await createHarnessServer(options, tempDir);
    let serverPort = server.address().port;
    chrome = spawnProcess(options.chrome, [
      `--remote-debugging-port=${options.chromePort}`,
      `--user-data-dir=${userDataDir}`,
      '--headless=new',
      '--disable-gpu',
      '--no-first-run',
      '--no-default-browser-check',
      'about:blank',
    ]);
    await waitFor(() => requestJson(`http://127.0.0.1:${options.chromePort}/json/version`), options.waitMs);
    page = await createPage(options.chromePort);
    let errors = [];
    page.on('Runtime.exceptionThrown', (params) => {
      errors.push(params.exceptionDetails?.text || params.exceptionDetails?.exception?.description || 'Runtime exception');
    });
    page.on('Runtime.consoleAPICalled', (params) => {
      if (params.type === 'error') {
        errors.push((params.args || []).map(arg => arg.value ?? arg.description ?? '').filter(Boolean).join(' '));
      }
    });
    await page.send('Runtime.enable');
    await page.send('Page.enable');
    await page.send('Emulation.setDeviceMetricsOverride', {
      width: options.viewportWidth,
      height: options.viewportHeight,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await page.send('Page.navigate', { url: `http://127.0.0.1:${serverPort}/` });
    let report = await waitFor(async () => {
      let value = await evaluate(page, 'window.__workflowBoardSmokeReport || null', 5000);
      if (!value) throw new Error('Workflow board smoke report not ready');
      return value;
    }, options.waitMs);
    report.pageErrors = errors;
    report.url = `http://127.0.0.1:${serverPort}/`;
    fs.mkdirSync(path.dirname(options.reportPath), { recursive: true });
    fs.writeFileSync(options.reportPath, `${JSON.stringify(report, null, 2)}\n`);
    console.log(JSON.stringify({ report: options.reportPath, ...report }, null, 2));
    let failed = Object.entries(report.checks).filter(([, passed]) => !passed);
    if (failed.length || errors.length) {
      throw new Error(`Workflow board browser smoke failed: ${failed.map(([id]) => id).join(', ') || errors.join('; ')}`);
    }
  } finally {
    page?.close();
    if (server) await new Promise(resolve => server.close(resolve));
    await stopProcess(chrome);
    fs.rmSync(tempDir, { recursive: true, force: true });
    fs.rmSync(userDataDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error?.stack || error?.message || String(error));
  process.exitCode = 1;
});
