import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path, { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CLI_PATH = resolve(__dirname, '../../bin/mcp-agent-portal.js');

let tempDirs = [];

function makeProject() {
  let cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'portal-cli-context-'));
  tempDirs.push(cwd);
  fs.writeFileSync(path.join(cwd, 'package.json'), '{}');
  let agents = path.join(cwd, '.agent-portal', 'agents');
  fs.mkdirSync(agents, { recursive: true });
  fs.writeFileSync(path.join(agents, 'backend-engineer.md'), `---
name: backend-engineer
role: executor
context_tags: [server]
---
Backend engineer`);
  let workspace = path.join(cwd, '.agent-portal', 'workspace', 'demo');
  fs.mkdirSync(workspace, { recursive: true });
  fs.writeFileSync(path.join(workspace, 'context.md'), `---
id: demo
scope: project
activation:
  anyFiles:
    - src/demo.js
---
# Demo`);
  return cwd;
}

describe('CLI context resolve', () => {
  afterEach(() => {
    for (let dir of tempDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
  });

  it('returns resolver JSON and maps repeated --file values without starting backend', () => {
    let cwd = makeProject();
    let output = execFileSync('node', [
      CLI_PATH,
      'context',
      'resolve',
      '--cwd',
      cwd,
      '--task',
      'debug demo server',
      '--agent',
      'backend-engineer',
      '--file',
      'src/demo.js',
      '--file',
      'src/extra.js',
      '--mode',
      'both',
      '--json',
    ], {
      encoding: 'utf8',
      // Success-path test: a generous budget so cold CLI subprocess startup under concurrent
      // suite load can't trip the spawn timeout (the resolve normally finishes in well under a
      // second), matching the ops-process and workspace-registration stabilizations.
      timeout: 15000,
      env: { ...process.env, AGENT_PORTAL_MEMORY_ROOT: path.join(cwd, '.agent-portal') },
    });

    let parsed = JSON.parse(output);

    assert.ok(parsed.contexts.some(context => context.workspace === 'demo'));
    assert.ok(parsed.items.some(item => item.type === 'file-context' && item.args.recentFiles.includes('src/demo.js')));
    assert.ok(parsed.items.some(item => item.type === 'file-context' && item.args.recentFiles.includes('src/extra.js')));
  });

  it('loads context API through package-level import before local fallback', () => {
    let source = fs.readFileSync(CLI_PATH, 'utf8');

    assert.match(source, /import\('agent-pool-mcp\/context\.js'\)/);
    assert.match(source, /packages\/agent-pool-mcp\/context\.js/);
    assert.doesNotMatch(source, /packages\/agent-pool-mcp\/src\/tools\/context-resolver\.js/);
  });
});
