import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { createRuntimeRoutes } from '../../src/node/server/api-routes-runtime.js';
import { writeRuntimeStatus } from '../../src/node/ops/runtime.js';

function makeRes() {
  return {
    status: null,
    headers: null,
    body: '',
    writeHead(status, headers) {
      this.status = status;
      this.headers = headers;
    },
    end(body = '') {
      this.body = body;
    },
    json() {
      return JSON.parse(this.body);
    },
  };
}

describe('api-routes-runtime', () => {
  let tempRoot;
  let runtimeDir;
  let previousRuntimeDir;

  beforeEach(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-portal-api-runtime-'));
    runtimeDir = path.join(tempRoot, 'runtime');
    previousRuntimeDir = process.env.AGENT_PORTAL_RUNTIME_DIR;
    process.env.AGENT_PORTAL_RUNTIME_DIR = runtimeDir;
  });

  afterEach(() => {
    if (previousRuntimeDir === undefined) {
      delete process.env.AGENT_PORTAL_RUNTIME_DIR;
    } else {
      process.env.AGENT_PORTAL_RUNTIME_DIR = previousRuntimeDir;
    }
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  it('GET /api/runtime returns server summary, runtime statuses, health, and instances', () => {
    let devPlaneRoot = path.join(tempRoot, 'symbiote-dev-plane');
    fs.mkdirSync(devPlaneRoot, { recursive: true });
    fs.writeFileSync(path.join(devPlaneRoot, 'package.json'), JSON.stringify({
      name: 'symbiote-dev-plane',
      version: '0.1.0',
      type: 'module',
    }));
    fs.writeFileSync(path.join(devPlaneRoot, 'dev-plane.json'), JSON.stringify({
      name: 'symbiote-dev-plane',
      schemaVersion: 1,
      packages: [
        { id: 'symbiote-ui', group: 'core', packageName: 'symbiote-ui' },
        { id: 'agent-portal', group: 'agent-portal', packageName: 'mcp-agent-portal' },
      ],
    }));
    writeRuntimeStatus('portal', { state: 'running', pid: 1234, meta: { port: 8787 } });
    writeRuntimeStatus('worker', { state: 'starting' });

    let proxyManager = {
      servers: new Map([
        ['project-graph', {}],
        ['agent-pool', {}],
      ]),
      monitors: new Set(['monitor-1']),
      getHealthStatus() {
        return { 'project-graph': { status: 'healthy', failures: 0 } };
      },
      getInstances() {
        return [
          { name: 'project-graph', pid: 2222, connected: true },
        ];
      },
    };
    let routes = createRuntimeRoutes({
      proxyManager,
      projectRoot: tempRoot,
      env: { SYMBIOTE_DEV_PLANE_ROOT: devPlaneRoot },
    });
    let res = makeRes();

    routes['GET /api/runtime']({}, res);

    let body = res.json();
    assert.equal(res.status, 200);
    assert.equal(res.headers['Content-Type'], 'application/json');
    assert.equal(body.ok, true);
    assert.equal(body.server.pid, process.pid);
    assert.equal(body.server.agents, 2);
    assert.equal(body.server.monitors, 1);
    assert.equal(typeof body.server.uptime, 'number');
    assert.deepEqual(body.health, { 'project-graph': { status: 'healthy', failures: 0 } });
    assert.deepEqual(body.runtimeStatuses.map((status) => status.name), ['portal', 'worker']);
    assert.deepEqual(body.instances, [{ name: 'project-graph', pid: 2222, connected: true }]);
    assert.equal(body.devPlane.ok, true);
    assert.equal(body.devPlane.state, 'ready');
    assert.equal(body.devPlane.summary.packageCount, 2);
    assert.equal(JSON.stringify(body.devPlane).includes(tempRoot), false);
  });

  it('GET /api/runtime/health returns ok and compact counts', () => {
    writeRuntimeStatus('portal', { state: 'running' });

    let proxyManager = {
      servers: new Map([['project-graph', {}]]),
      monitors: new Set(['monitor-1', 'monitor-2']),
    };
    let routes = createRuntimeRoutes({ proxyManager, projectRoot: tempRoot });
    let res = makeRes();

    routes['GET /api/runtime/health']({}, res);

    let body = res.json();
    assert.equal(res.status, 200);
    assert.deepEqual(
      Object.keys(body).sort(),
      ['agents', 'monitors', 'ok', 'runtimeStatusCount', 'uptime'].sort(),
    );
    assert.equal(body.ok, true);
    assert.equal(typeof body.uptime, 'number');
    assert.equal(body.agents, 1);
    assert.equal(body.monitors, 2);
    assert.equal(body.runtimeStatusCount, 1);
  });

  it('GET /api/runtime tolerates missing optional proxy manager helpers', () => {
    writeRuntimeStatus('portal', { state: 'running' });

    let routes = createRuntimeRoutes({
      proxyManager: { servers: new Map(), monitors: new Set() },
      projectRoot: tempRoot,
    });
    let res = makeRes();

    routes['GET /api/runtime']({}, res);

    let body = res.json();
    assert.equal(body.ok, true);
    assert.deepEqual(body.health, {});
    assert.deepEqual(body.instances, []);
    assert.equal(body.runtimeStatuses.length, 1);
  });

  it('exposes only non-destructive runtime routes', () => {
    let routes = createRuntimeRoutes({
      proxyManager: { servers: new Map(), monitors: new Set() },
      projectRoot: tempRoot,
    });

    assert.deepEqual(Object.keys(routes).sort(), [
      'GET /api/runtime',
      'GET /api/runtime/health',
    ]);
  });
});
