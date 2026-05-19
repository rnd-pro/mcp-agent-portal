import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path, { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CLI_PATH = resolve(__dirname, '../../bin/mcp-agent-portal.js');

let tmpDir;
let configPath;
let backendsDir;

function runCli(args) {
  return execFileSync('node', [CLI_PATH, ...args], {
    encoding: 'utf8',
    env: {
      ...process.env,
      HOME: tmpDir,
      PORTAL_CONFIG_PATH: configPath,
    },
  });
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2));
}

describe('hub CLI', () => {
  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hub-cli-test-'));
    configPath = path.join(tmpDir, 'agent-portal.json');
    backendsDir = path.join(tmpDir, '.local-gateway', 'backends');
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('prints direct MCP URL for a live project backend', () => {
    let projectPath = path.join(tmpDir, 'project-a');
    writeJson(path.join(backendsDir, 'portal-a.json'), {
      port: 43210,
      pid: process.pid,
      name: 'project-a',
      project: projectPath,
      mcpDirect: 'http://127.0.0.1:43210/mcp',
      startedAt: Date.now(),
    });

    let out = runCli(['hub', 'mcp-url', '--project', projectPath]);
    assert.equal(out.trim(), 'http://127.0.0.1:43210/mcp');
  });

  it('reports hub status without requiring the backend API', () => {
    let projectPath = path.join(tmpDir, 'project-a');
    writeJson(path.join(backendsDir, 'portal-a.json'), {
      port: 43210,
      pid: process.pid,
      name: 'project-a',
      project: projectPath,
      startedAt: Date.now(),
    });
    writeJson(path.join(tmpDir, '.local-gateway', 'services.json'), {
      'portal.local': {
        routes: {
          '/project-a': {
            port: 43210,
            pid: process.pid,
            projectPath,
            projectName: 'project-a',
          },
        },
      },
    });

    let out = runCli(['hub', 'status', '--project', projectPath]);
    assert.match(out, /Portal Hub/);
    assert.match(out, /Backends:\s+1 live \/ 1 registered/);
    assert.match(out, /Current MCP:\s+http:\/\/127\.0\.0\.1:43210\/mcp/);
    assert.match(out, /\/project-a\s+alive/);
  });

  it('removes dead backend files and stale routes', () => {
    let deadPid = 99999999;
    let deadBackend = path.join(backendsDir, 'portal-dead.json');
    writeJson(deadBackend, {
      port: 43211,
      pid: deadPid,
      name: 'dead-project',
      project: path.join(tmpDir, 'dead-project'),
      startedAt: Date.now(),
    });
    let servicesPath = path.join(tmpDir, '.local-gateway', 'services.json');
    writeJson(servicesPath, {
      'portal.local': {
        routes: {
          '/dead-project': {
            port: 43211,
            pid: deadPid,
            projectPath: path.join(tmpDir, 'dead-project'),
            projectName: 'dead-project',
          },
        },
      },
    });

    let out = runCli(['hub', 'cleanup']);
    assert.match(out, /Removed 1 dead backend file\(s\) and 1 dead route\(s\)\./);
    assert.equal(fs.existsSync(deadBackend), false);
    let services = JSON.parse(fs.readFileSync(servicesPath, 'utf8'));
    assert.deepEqual(services['portal.local'].routes, {});
  });

  it('includes hub commands in help', () => {
    let out = runCli(['--help']);
    assert.match(out, /hub mcp-url/);
    assert.match(out, /hub doctor/);
  });
});
