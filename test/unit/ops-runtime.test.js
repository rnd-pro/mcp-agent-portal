import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  ensureRuntimeDir,
  getDataPath,
  getLogPath,
  getPidPath,
  getRuntimeDir,
  getRuntimePath,
  getStatusPath,
  getTempPath,
  listRuntimeStatuses,
  readRuntimeStatus,
  removeRuntimeStatus,
  writeRuntimeStatus,
} from '../../src/node/ops/runtime.js';

describe('ops runtime utilities', () => {
  let tempRoot;
  let options;

  beforeEach(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-portal-ops-runtime-'));
    options = { projectRoot: tempRoot, env: {} };
  });

  afterEach(() => {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  it('resolves project-local runtime paths and normalizes path parts', () => {
    assert.equal(getRuntimeDir(options), path.join(tempRoot, '.agent-portal/runtime'));
    assert.equal(
      getRuntimePath(['/logs/', '', 'portal'], options),
      path.join(tempRoot, '.agent-portal/runtime/logs/portal'),
    );
    assert.equal(getDataPath('/api/', ['cache.json'], options), path.join(tempRoot, '.agent-portal/runtime/data/api/cache.json'));
    assert.equal(getLogPath('api', ['server.log'], options), path.join(tempRoot, '.agent-portal/runtime/logs/api/server.log'));
    assert.equal(getPidPath('api', options), path.join(tempRoot, '.agent-portal/runtime/pids/api.pid'));
    assert.equal(getStatusPath('api', options), path.join(tempRoot, '.agent-portal/runtime/status/api.json'));
  });

  it('rejects parent-directory path segments', () => {
    assert.throws(() => getRuntimePath(['../../outside'], options), /Unsafe runtime path segment/);
    assert.throws(() => getStatusPath('../outside', options), /Unsafe runtime path segment/);
    assert.throws(() => getTempPath(['ops', '..'], { env: {} }), /Unsafe runtime path segment/);
  });

  it('honors runtime and temp directory environment overrides', () => {
    let runtimeOverride = path.join(tempRoot, 'runtime-override');
    let tempOverride = path.join(tempRoot, 'tmp-override');
    let env = {
      AGENT_PORTAL_RUNTIME_DIR: runtimeOverride,
      AGENT_PORTAL_TMP_DIR: tempOverride,
    };

    assert.equal(getRuntimePath(['status'], { projectRoot: '/ignored', env }), path.join(runtimeOverride, 'status'));
    assert.equal(getTempPath(['ops', 'probe'], { env }), path.join(tempOverride, 'ops/probe'));
  });

  it('creates runtime directories on demand', () => {
    let dir = ensureRuntimeDir(['logs', 'portal'], options);
    assert.equal(dir, path.join(tempRoot, '.agent-portal/runtime/logs/portal'));
    assert.equal(fs.statSync(dir).isDirectory(), true);
  });

  it('writes, reads, lists, and removes status records', () => {
    let status = writeRuntimeStatus('portal', { state: 'running', pid: 1234, meta: { port: 8787 } }, options);

    assert.equal(status.name, 'portal');
    assert.equal(status.state, 'running');
    assert.equal(readRuntimeStatus('portal', options).meta.port, 8787);
    assert.deepEqual(listRuntimeStatuses(options).map((item) => item.name), ['portal']);
    assert.equal(removeRuntimeStatus('portal', options), true);
    assert.equal(readRuntimeStatus('portal', options), null);
    assert.deepEqual(listRuntimeStatuses(options), []);
  });
});
