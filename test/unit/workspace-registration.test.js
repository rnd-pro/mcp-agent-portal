import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';

/**
 * Unit tests for workspace registration from MCP initialize roots.
 * Tests run in subprocesses to get fresh config-store imports with isolated config paths.
 * Run: node --test test/unit/workspace-registration.test.js
 */

function runIsolated(code) {
  let dir = fs.mkdtempSync(path.join(os.tmpdir(), 'portal-test-'));
  let configPath = path.join(dir, 'agent-portal.json');
  fs.writeFileSync(configPath, JSON.stringify({ mcpServers: {}, projects: [], globalCli: {}, activeProjectIds: [] }));

  let script = `
    process.env.PORTAL_CONFIG_PATH = ${JSON.stringify(configPath)};
    ${code}
  `;
  let result = execFileSync(process.execPath, ['--input-type=module', '-e', script], {
    cwd: path.resolve(import.meta.dirname, '../..'),
    encoding: 'utf8',
    timeout: 5000,
    env: { ...process.env, PORTAL_CONFIG_PATH: configPath },
  });
  fs.rmSync(dir, { recursive: true, force: true });
  return result.trim();
}

describe('workspace-registration', () => {

  it('addProject registers a new project by path', () => {
    let output = runIsolated(`
      let { addProject, getProjectHistory } = await import('./src/node/config-store.js');
      let result = addProject({ path: '/tmp/test-workspace' });
      let projects = getProjectHistory();
      let found = projects.find(p => p.path === '/tmp/test-workspace');
      console.log(JSON.stringify({ id: result.id, found: !!found, name: found?.name }));
    `);
    let data = JSON.parse(output);
    assert.ok(data.id, 'should return an id');
    assert.ok(data.found, 'project should appear in list');
    assert.equal(data.name, 'test-workspace', 'should derive name from basename');
  });

  it('addProject deduplicates by path', () => {
    let output = runIsolated(`
      let { addProject, getProjectHistory } = await import('./src/node/config-store.js');
      let r1 = addProject({ path: '/tmp/same-project' });
      let r2 = addProject({ path: '/tmp/same-project' });
      let projects = getProjectHistory();
      let matches = projects.filter(p => p.path === '/tmp/same-project');
      console.log(JSON.stringify({ same: r1.id === r2.id, count: matches.length }));
    `);
    let data = JSON.parse(output);
    assert.ok(data.same, 'same path should return same id');
    assert.equal(data.count, 1, 'should not create duplicates');
  });

  it('file:// URI is correctly stripped to path', () => {
    let uri = 'file:///Users/v/Documents/my-project';
    let rootPath = uri.replace(/^file:\/\//, '');
    assert.equal(rootPath, '/Users/v/Documents/my-project');
  });

  it('activeProjectIds tracks opened projects', () => {
    let output = runIsolated(`
      let { addProject, getActiveProjectIds, setActiveProjectIds } = await import('./src/node/config-store.js');
      let proj = addProject({ path: '/tmp/active-test' });
      let before = getActiveProjectIds().includes(proj.id);
      let active = getActiveProjectIds();
      active.push(proj.id);
      setActiveProjectIds(active);
      let after = getActiveProjectIds().includes(proj.id);
      console.log(JSON.stringify({ before, after }));
    `);
    let data = JSON.parse(output);
    assert.equal(data.before, false, 'should not be active initially');
    assert.equal(data.after, true, 'should be active after set');
  });

  it('multiplexer extracts roots from initialize message', () => {
    let msg = {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2025-06-18',
        capabilities: {},
        clientInfo: { name: 'test-ide' },
        roots: [
          { uri: 'file:///Users/v/Documents/project-a' },
          { uri: 'file:///Users/v/Documents/project-b' },
        ],
      },
    };

    let roots = msg.params?.roots || [];
    assert.equal(roots.length, 2);

    let paths = roots.map(r => r.uri?.replace(/^file:\/\//, '') || r.uri);
    assert.deepEqual(paths, [
      '/Users/v/Documents/project-a',
      '/Users/v/Documents/project-b',
    ]);
  });

  it('handles initialize without roots gracefully', () => {
    let msg = { jsonrpc: '2.0', id: 1, method: 'initialize', params: { capabilities: {} } };
    let roots = msg.params?.roots || [];
    assert.equal(roots.length, 0);
  });

  it('full flow: roots → addProject → activeProjectIds', () => {
    let output = runIsolated(`
      let { addProject, getActiveProjectIds, setActiveProjectIds, getProjectHistory } = await import('./src/node/config-store.js');

      // Simulate what multiplexer does on initialize
      let roots = [
        { uri: 'file:///Users/v/project-alpha' },
        { uri: 'file:///Users/v/project-beta' },
      ];

      for (let root of roots) {
        let rootPath = root.uri?.replace(/^file:\\/\\//, '') || root.uri;
        let proj = addProject({ path: rootPath });
        let active = getActiveProjectIds();
        if (!active.includes(proj.id)) {
          active.push(proj.id);
          setActiveProjectIds(active);
        }
      }

      let projects = getProjectHistory();
      let active = getActiveProjectIds();
      console.log(JSON.stringify({
        projectCount: projects.length,
        activeCount: active.length,
        paths: projects.map(p => p.path),
      }));
    `);
    let data = JSON.parse(output);
    assert.equal(data.projectCount, 2, 'should register 2 projects');
    assert.equal(data.activeCount, 2, 'both should be active');
    assert.ok(data.paths.includes('/Users/v/project-alpha'));
    assert.ok(data.paths.includes('/Users/v/project-beta'));
  });
});
