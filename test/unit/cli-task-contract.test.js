import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path, { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CLI_PATH = resolve(__dirname, '../../bin/mcp-agent-portal.js');

function readCliSource() {
  return fs.readFileSync(CLI_PATH, 'utf8');
}

describe('CLI task lifecycle contract', () => {
  it('uses MCP snake_case task_id arguments for task lifecycle tools', () => {
    let source = readCliSource();

    assert.match(source, /mcpCall\('get_task_result', \{ task_id: taskId \}\)/);
    assert.match(source, /mcpCall\('cancel_task', \{ task_id: taskId \}\)/);
    assert.match(source, /mcpCall\('get_task_result', \{ task_id: currentTask \}\)/);
    assert.doesNotMatch(source, /mcpCall\('get_task_result', \{ taskId/);
    assert.doesNotMatch(source, /mcpCall\('cancel_task', \{ taskId/);
  });

  it('exposes a finish command wired to finish_task cleanup', () => {
    let source = readCliSource();

    assert.match(source, /finish:\s*\{/);
    assert.match(source, /mcpCall\('finish_task', \{/);
    assert.match(source, /task_id: taskId/);
    assert.match(source, /remove_from_memory: flags\.remove === true/);
    assert.match(source, /npx mcp-agent-portal finish <taskId>/);
  });
});
