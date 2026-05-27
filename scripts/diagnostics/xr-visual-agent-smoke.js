#!/usr/bin/env node
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { WebSocket } from 'ws';

const CASES = ['baseline', 'overlap', 'bad-facing', 'too-high', 'low-texture', 'missing-controls'];
const EXPECTED_ISSUES = new Map([
  ['baseline', []],
  ['overlap', ['panel-world-overlap']],
  ['bad-facing', ['viewer-facing']],
  ['too-high', ['pose-comfort']],
  ['low-texture', ['texture-density-readable']],
  ['missing-controls', ['frame-visuals-present', 'controller-rays-visible', 'hit-reticle-visible']],
]);

function parseArgs(argv) {
  let options = {
    baseUrl: 'http://portal.local',
    startServer: true,
    emulate: true,
    chrome: process.env.CHROME_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    port: 9337,
    screenshotDir: null,
    reportPath: null,
    viewportWidth: 1440,
    viewportHeight: 1000,
  };
  for (let index = 0; index < argv.length; index += 1) {
    let arg = argv[index];
    if (arg === '--base-url') options.baseUrl = argv[++index];
    else if (arg === '--no-start-server') options.startServer = false;
    else if (arg === '--emulate') options.emulate = true;
    else if (arg === '--no-emulate') options.emulate = false;
    else if (arg === '--chrome') options.chrome = argv[++index];
    else if (arg === '--port') options.port = Number(argv[++index]);
    else if (arg === '--screenshots') options.screenshotDir = argv[++index] || path.join('tmp', 'xr-visual-agent-smoke');
    else if (arg === '--report') options.reportPath = argv[++index];
    else if (arg === '--viewport') {
      let [width, height] = String(argv[++index] || '').split('x').map(Number);
      if (Number.isFinite(width) && Number.isFinite(height)) {
        options.viewportWidth = width;
        options.viewportHeight = height;
      }
    }
  }
  if (!options.reportPath && options.screenshotDir) {
    options.reportPath = path.join(options.screenshotDir, 'report.json');
  }
  return options;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

async function waitForHttp(url, timeoutMs = 15000) {
  let started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      await requestJson(url);
      return;
    } catch {
      await delay(250);
    }
  }
  throw new Error(`Timed out waiting for ${url}`);
}

async function waitForText(url, timeoutMs = 15000) {
  let started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      await new Promise((resolve, reject) => {
        let request = http.get(url, (response) => {
          response.resume();
          response.statusCode >= 200 && response.statusCode < 400 ? resolve() : reject(new Error(`HTTP ${response.statusCode}`));
        });
        request.on('error', reject);
      });
      return;
    } catch {
      await delay(250);
    }
  }
  throw new Error(`Timed out waiting for ${url}`);
}

function spawnProcess(command, args, options = {}) {
  let child = spawn(command, args, {
    stdio: options.stdio || ['ignore', 'pipe', 'pipe'],
    cwd: options.cwd || process.cwd(),
    env: { ...process.env, ...(options.env || {}) },
  });
  child.stdout?.on('data', (chunk) => {
    if (options.prefix) process.stderr.write(`${options.prefix}${chunk}`);
  });
  child.stderr?.on('data', (chunk) => {
    if (options.prefix) process.stderr.write(`${options.prefix}${chunk}`);
  });
  return child;
}

function stopProcess(child) {
  if (!child || child.killed) return Promise.resolve();
  return new Promise((resolve) => {
    let timeout = setTimeout(() => {
      child.kill('SIGKILL');
      resolve();
    }, 3000);
    child.once('exit', () => {
      clearTimeout(timeout);
      resolve();
    });
    child.kill('SIGTERM');
  });
}

function readPngSize(filePath) {
  let buffer = fs.readFileSync(filePath);
  let signature = buffer.subarray(0, 8).toString('hex');
  if (signature !== '89504e470d0a1a0a') {
    throw new Error(`Screenshot is not a PNG: ${filePath}`);
  }
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  };
}

class CdpClient {
  constructor(wsUrl) {
    this.ws = new WebSocket(wsUrl);
    this.nextId = 1;
    this.pending = new Map();
    this.events = [];
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
        return;
      }
      this.events.push(payload);
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

  close() {
    this.ws.close();
  }
}

async function createPage(port) {
  let target = await requestJson(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' });
  if (!target.webSocketDebuggerUrl) {
    throw new Error('Chrome did not create a page debug target');
  }
  return new CdpClient(target.webSocketDebuggerUrl);
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

async function waitForVisualAuditReport(client, caseName, timeoutMs = 10000) {
  let started = Date.now();
  let lastError = null;
  while (Date.now() - started < timeoutMs) {
    try {
      let report = await evaluate(client, `
        (() => {
          let report = window.__xrVisualAuditReport || null;
          return report && report.case === ${JSON.stringify(caseName)} ? report : null;
        })()
      `, 1000);
      if (report) return report;
    } catch (error) {
      lastError = error;
    }
    await delay(150);
  }
  let suffix = lastError ? ` (${lastError.message})` : '';
  throw new Error(`${caseName}: missing __xrVisualAuditReport${suffix}`);
}

async function inspectCase(client, baseUrl, caseName, options) {
  let url = `${baseUrl.replace(/\/$/, '')}/xr-visual-audit.html?case=${encodeURIComponent(caseName)}${options.emulate ? '&emulate=1' : ''}`;
  await client.send('Page.navigate', { url });
  let report = await waitForVisualAuditReport(client, caseName);

  let expectedIssues = EXPECTED_ISSUES.get(caseName) || [];
  let missingIssues = expectedIssues.filter((issue) => !report.issueIds.includes(issue));
  let unexpectedFailure = caseName === 'baseline'
    ? report.status !== 'pass' || report.failureCount !== 0 || report.warningCount !== 0
    : report.status !== 'warning' || report.failureCount !== 0;
  let visualMissing = report.svg.topPanelShapes <= 0 || report.svg.frontPanelShapes <= 0 ||
    report.outputs.checksBytes <= 0 || report.outputs.panelMapBytes <= 0;
  let pageErrorCount = report.pageErrors.length;
  let readiness = report.readiness || null;
  let readinessInvalid = readiness ? readiness.ready !== true : true;
  let emulationInvalid = options.emulate && report.emulation?.installed !== true;
  let screenshot = null;
  if (options.screenshotDir) {
    fs.mkdirSync(options.screenshotDir, { recursive: true });
    let capture = await client.send('Page.captureScreenshot', {
      format: 'png',
      captureBeyondViewport: false,
    });
    let filename = `${caseName}${options.emulate ? '-emulated' : ''}.png`;
    let filePath = path.resolve(options.screenshotDir, filename);
    fs.writeFileSync(filePath, Buffer.from(capture.data, 'base64'));
    let size = readPngSize(filePath);
    screenshot = {
      path: filePath,
      bytes: fs.statSync(filePath).size,
      width: size.width,
      height: size.height,
    };
  }
  let screenshotInvalid = screenshot
    ? screenshot.bytes <= 0 || screenshot.width !== options.viewportWidth || screenshot.height !== options.viewportHeight
    : false;

  return {
    case: caseName,
    ok: !missingIssues.length && !unexpectedFailure && !visualMissing && pageErrorCount === 0 && !screenshotInvalid && !readinessInvalid && !emulationInvalid,
    status: report.status,
    warningCount: report.warningCount,
    failureCount: report.failureCount,
    issueIds: report.issueIds,
    missingIssues,
    svg: report.svg,
    outputs: report.outputs,
    readiness,
    readinessInvalid,
    emulation: report.emulation || null,
    emulationInvalid,
    support: report.support || null,
    screenshot,
    screenshotInvalid,
    pageErrorCount,
    pageErrors: report.pageErrors,
  };
}

async function main() {
  let options = parseArgs(process.argv.slice(2));
  let server = null;
  let chrome = null;
  let userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'xr-visual-agent-chrome-'));

  try {
    if (options.startServer) {
      server = spawnProcess('npm', ['run', 'dev'], { prefix: '[dev] ' });
      await waitForText(`${options.baseUrl.replace(/\/$/, '')}/xr-visual-audit.html`);
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
    await waitForHttp(`http://127.0.0.1:${options.port}/json/version`);

    let client = await createPage(options.port);
    await client.send('Runtime.enable');
    await client.send('Page.enable');
    await client.send('Emulation.setDeviceMetricsOverride', {
      width: options.viewportWidth,
      height: options.viewportHeight,
      deviceScaleFactor: 1,
      mobile: false,
    });
    let results = [];
    for (let caseName of CASES) {
      results.push(await inspectCase(client, options.baseUrl, caseName, options));
    }
    client.close();

    let ok = results.every((result) => result.ok);
    let output = {
      ok,
      version: 'xr-visual-agent-smoke-v1',
      baseUrl: options.baseUrl,
      emulated: options.emulate,
      screenshotDir: options.screenshotDir ? path.resolve(options.screenshotDir) : null,
      reportPath: options.reportPath ? path.resolve(options.reportPath) : null,
      results,
    };
    if (options.reportPath) {
      let reportPath = path.resolve(options.reportPath);
      fs.mkdirSync(path.dirname(reportPath), { recursive: true });
      fs.writeFileSync(reportPath, `${JSON.stringify(output, null, 2)}\n`);
    }
    process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
    if (!ok) process.exitCode = 1;
  } finally {
    await stopProcess(chrome);
    await stopProcess(server);
    fs.rmSync(userDataDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exitCode = 1;
});
