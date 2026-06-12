import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { createDevPlaneStatus } from '../../src/node/dev-plane/status.js';

let tempRoots = [];

function makeTempRoot() {
  let root = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-portal-dev-plane-'));
  tempRoots.push(root);
  return root;
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function writeDevPlane(root, manifest) {
  writeJson(path.join(root, 'package.json'), {
    name: 'symbiote-dev-plane',
    version: '0.1.0',
    type: 'module',
  });
  writeJson(path.join(root, 'dev-plane.json'), manifest);
}

describe('dev-plane status', () => {
  afterEach(() => {
    for (let root of tempRoots.splice(0)) {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('summarizes a sibling dev plane without leaking local paths', () => {
    let workspaceRoot = makeTempRoot();
    let projectRoot = path.join(workspaceRoot, 'agent-portal');
    let devPlaneRoot = path.join(workspaceRoot, 'symbiote-dev-plane');
    fs.mkdirSync(projectRoot, { recursive: true });
    writeDevPlane(devPlaneRoot, {
      name: 'symbiote-dev-plane',
      schemaVersion: 1,
      localPolicy: { dirtyWorktree: 'warn' },
      packages: [
        {
          id: 'symbiote-ui',
          group: 'core',
          packageName: 'symbiote-ui',
          expectedVersion: '0.3.0-alpha.44',
          browserImports: { 'symbiote-ui': './index.js' },
        },
        {
          id: 'agent-portal',
          group: 'agent-portal',
          packageName: 'mcp-agent-portal',
          expectedVersion: '1.0.0-alpha.4',
        },
        {
          id: 'cv',
          group: 'consumer',
          packageName: 'cv',
          expectedVersion: '0.1.2',
        },
      ],
      alternateSources: [
        { id: 'agent-portal-agent-pool-mcp', packageName: 'agent-pool-mcp' },
      ],
    });

    let status = createDevPlaneStatus({ projectRoot, env: {} });

    assert.equal(status.ok, true);
    assert.equal(status.state, 'ready');
    assert.equal(status.configured, true);
    assert.deepEqual(status.root, { source: 'sibling', name: 'symbiote-dev-plane' });
    assert.deepEqual(status.manifest, {
      name: 'symbiote-dev-plane',
      schemaVersion: 1,
      dirtyPolicy: 'warn',
    });
    assert.deepEqual(status.summary.groups, {
      'agent-portal': 1,
      consumer: 1,
      core: 1,
    });
    assert.equal(status.summary.packageCount, 3);
    assert.equal(status.summary.alternateSourceCount, 1);
    assert.equal(status.summary.browserImportCount, 1);
    assert.deepEqual(status.summary.packageIds, ['agent-portal', 'cv', 'symbiote-ui']);
    assert.equal(JSON.stringify(status).includes(workspaceRoot), false);
  });

  it('reports a missing implicit dev plane as an inactive diagnostic', () => {
    let workspaceRoot = makeTempRoot();
    let projectRoot = path.join(workspaceRoot, 'agent-portal');
    fs.mkdirSync(projectRoot, { recursive: true });

    let status = createDevPlaneStatus({ projectRoot, env: {} });

    assert.equal(status.ok, false);
    assert.equal(status.state, 'missing');
    assert.equal(status.configured, false);
    assert.equal(status.root.source, 'missing');
    assert.equal(status.issues[0].code, 'dev-plane-not-found');
    assert.equal(JSON.stringify(status).includes(workspaceRoot), false);
  });

  it('honors an explicit environment root before sibling discovery', () => {
    let workspaceRoot = makeTempRoot();
    let projectRoot = path.join(workspaceRoot, 'agent-portal');
    let explicitRoot = path.join(workspaceRoot, 'custom-dev-plane');
    fs.mkdirSync(projectRoot, { recursive: true });
    writeDevPlane(explicitRoot, {
      name: 'symbiote-dev-plane',
      schemaVersion: 1,
      packages: [],
    });

    let status = createDevPlaneStatus({
      projectRoot,
      env: { SYMBIOTE_DEV_PLANE_ROOT: explicitRoot },
    });

    assert.equal(status.ok, true);
    assert.equal(status.root.source, 'env');
    assert.equal(status.summary.packageCount, 0);
    assert.equal(JSON.stringify(status).includes(explicitRoot), false);
  });

  it('reports invalid explicit roots without falling back silently', () => {
    let workspaceRoot = makeTempRoot();
    let projectRoot = path.join(workspaceRoot, 'agent-portal');
    let explicitRoot = path.join(workspaceRoot, 'missing-dev-plane');
    fs.mkdirSync(projectRoot, { recursive: true });

    let status = createDevPlaneStatus({
      projectRoot,
      env: { SYMBIOTE_DEV_PLANE_ROOT: explicitRoot },
    });

    assert.equal(status.ok, false);
    assert.equal(status.state, 'error');
    assert.equal(status.configured, true);
    assert.equal(status.root.source, 'env');
    assert.equal(status.issues[0].code, 'dev-plane-root-unavailable');
    assert.equal(JSON.stringify(status).includes(explicitRoot), false);
  });
});
