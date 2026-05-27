import test from 'node:test';
import assert from 'node:assert/strict';
import {
  HTML_IN_CANVAS_ORIGIN_TRIAL_ENV,
  createStaticFileHeaders,
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
