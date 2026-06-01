import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  HTML_IN_CANVAS_ORIGIN_TRIAL_ENV,
  createStaticFileHeaders,
  resolveWebRoot,
  resolveHtmlInCanvasOriginTrialToken,
} from '../../src/node/server/web-server.js';

test('static HTML responses expose HTML-in-Canvas origin trial by header only when configured', () => {
  let env = { [HTML_IN_CANVAS_ORIGIN_TRIAL_ENV]: ' demo-token ' };
  let headers = createStaticFileHeaders('/tmp/xr-three-panels-baseline.html', { env });

  assert.equal(resolveHtmlInCanvasOriginTrialToken(env), 'demo-token');
  assert.equal(headers['Origin-Trial'], 'demo-token');
  assert.equal(headers['X-Agent-Portal-Origin-Trial'], 'html-in-canvas');
  assert.equal(JSON.stringify(headers).includes('AGENT_PORTAL_HTML_IN_CANVAS_ORIGIN_TRIAL_TOKEN'), false);
});

test('static non-HTML responses do not receive origin trial headers', () => {
  let env = { [HTML_IN_CANVAS_ORIGIN_TRIAL_ENV]: 'demo-token' };
  let headers = createStaticFileHeaders('/tmp/xr-three-panels-baseline.js', { env });

  assert.equal(headers['Origin-Trial'], undefined);
  assert.equal(headers['X-Agent-Portal-Origin-Trial'], undefined);
});

test('static HTML responses omit origin trial headers when token is absent', () => {
  let headers = createStaticFileHeaders('/tmp/xr-three-panels-baseline.html', { env: {} });

  assert.equal(headers['Origin-Trial'], undefined);
  assert.equal(headers['X-Agent-Portal-Origin-Trial'], undefined);
});

test('web server serves source web root in explicit dev mode', () => {
  let root = resolveWebRoot({ env: {}, dev: true });

  assert.ok(root.endsWith('/web'));
});

test('web server honors explicit web root override', () => {
  let root = resolveWebRoot({ env: { AGENT_PORTAL_WEB_ROOT: '/tmp/agent-portal-web' } });

  assert.equal(root, '/tmp/agent-portal-web');
});

test('web server prefers built web root when production dist exists', () => {
  let tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-portal-web-root-'));
  let webDir = path.join(tmp, 'web');
  let distWebDir = path.join(tmp, 'dist', 'web');
  fs.mkdirSync(webDir, { recursive: true });
  fs.mkdirSync(distWebDir, { recursive: true });
  fs.writeFileSync(path.join(distWebDir, 'index.html'), '<!doctype html>');

  try {
    let root = resolveWebRoot({ env: {}, webDir, distWebDir });
    assert.equal(root, distWebDir);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
