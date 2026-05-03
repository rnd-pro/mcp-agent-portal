import { test, describe, before, after } from 'node:test';
import assert from 'node:assert';
import { spawn, execFileSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CLI_PATH = resolve(__dirname, '../../bin/mcp-agent-portal.js');

describe('Agent Portal CLI E2E', () => {
  let backendProcess;

  before(async () => {
    // Start the portal backend
    console.log('Starting backend...');
    backendProcess = spawn('node', [CLI_PATH], {
      stdio: 'inherit', // We don't want to pollute test output
      env: { ...process.env, PORTAL_E2E_TEST: '1' }
    });

    // Wait until it's ready by polling the `status` command
    let isReady = false;
    for (let i = 0; i < 20; i++) {
      try {
        execFileSync('node', [CLI_PATH, 'status'], { encoding: 'utf-8', stdio: 'pipe' });
        isReady = true;
        break;
      } catch {
        await new Promise(r => setTimeout(r, 500));
      }
    }

    if (!isReady) {
      backendProcess.kill();
      throw new Error('Backend failed to start in time');
    }
  });

  after(() => {
    if (backendProcess) {
      console.log('Shutting down backend...');
      backendProcess.kill('SIGINT');
    }
  });

  test('status command', () => {
    const out = execFileSync('node', [CLI_PATH, 'status'], { encoding: 'utf-8' });
    assert.match(out, /mcp-agent-portal v/);
    assert.match(out, /Uptime:/);
  });

  test('tools command (discover)', () => {
    const out = execFileSync('node', [CLI_PATH, 'tools'], { encoding: 'utf-8' });
    // Expect some JSON or formatted text containing tools
    assert.ok(out.includes('discover_tools') || out.includes('name'));
  });

  test('tasks command', () => {
    const out = execFileSync('node', [CLI_PATH, 'tasks'], { encoding: 'utf-8' });
    assert.ok(out.length > 0);
  });

  test('run command (mock provider, sync)', () => {
    // We use the mock provider so it doesn't call a real LLM
    const out = execFileSync('node', [CLI_PATH, 'run', 'test prompt', '--provider', 'mock', '--sync'], { encoding: 'utf-8' });
    
    // Check for streaming task start
    assert.match(out, /\[Task Started:/);
    // Check for output
    assert.ok(out.length > 20);
    // Check for task completion
    assert.match(out, /\[Task Completed:/);
  });

  test('run command missing prompt', () => {
    try {
      execFileSync('node', [CLI_PATH, 'run'], { encoding: 'utf-8' });
      assert.fail('Should have exited with code 1');
    } catch (err) {
      assert.strictEqual(err.status, 1);
      assert.match(err.stderr || err.stdout, /Usage: mcp-agent-portal run "prompt text"/);
    }
  });

  test('call command (memory get)', () => {
    const out = execFileSync('node', [CLI_PATH, 'memory', 'set', 'test_key', 'test_val'], { encoding: 'utf-8' });
    assert.ok(out.length > 0);
    
    const out2 = execFileSync('node', [CLI_PATH, 'memory', 'get', 'test_key'], { encoding: 'utf-8' });
    assert.ok(out2.includes('test_val'));
  });

  test('run command (real agent orchestration with deepseek-v3.2)', () => {
    // We use opencode provider and deepseek-v3.2 model for a simple task
    const out = execFileSync('node', [
      CLI_PATH, 
      'run', 
      'Output exactly the word "SUCCESS" and nothing else.', 
      '--provider', 'opencode', 
      '--model', 'openrouter/deepseek/deepseek-v3.2', 
      '--sync'
    ], { encoding: 'utf-8' });
    
    assert.match(out, /\[Task Started:/);
    // Ensure the output contains SUCCESS
    assert.match(out, /SUCCESS/);
    assert.match(out, /\[Task Completed:/);
  });
});
