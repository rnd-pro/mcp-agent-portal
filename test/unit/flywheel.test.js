import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const TEST_DIR = path.join(os.tmpdir(), `agent-portal-flywheel-test-${Date.now()}`);
const FLYWHEEL_FILE = path.join(TEST_DIR, 'flywheel-dataset.jsonl');

describe('flywheel.js', () => {
  let logTrajectory;

  before(async () => {
    if (!fs.existsSync(TEST_DIR)) fs.mkdirSync(TEST_DIR, { recursive: true });
    
    // Set env var before importing
    process.env.PORTAL_FLYWHEEL_PATH = FLYWHEEL_FILE;
    
    const mod = await import('../../src/node/mlops/flywheel.js');
    logTrajectory = mod.logTrajectory;
  });

  after(() => {
    if (fs.existsSync(TEST_DIR)) {
      fs.rmSync(TEST_DIR, { recursive: true, force: true });
    }
    delete process.env.PORTAL_FLYWHEEL_PATH;
  });

  // Helper to read file after a small delay since appendFile is async without Promise
  const readFlywheel = async () => {
    await new Promise(r => setTimeout(r, 50));
    if (!fs.existsSync(FLYWHEEL_FILE)) return [];
    return fs.readFileSync(FLYWHEEL_FILE, 'utf-8')
      .trim()
      .split('\n')
      .filter(line => line)
      .map(line => JSON.parse(line));
  };

  it('filters out non tools/call methods', async () => {
    logTrajectory('test-server', 'resources/list', {}, { result: true }, 100);
    const lines = await readFlywheel();
    assert.strictEqual(lines.length, 0);
  });

  it('filters out agent-pool server', async () => {
    logTrajectory('agent-pool', 'tools/call', { name: 'test' }, {}, 100);
    const lines = await readFlywheel();
    assert.strictEqual(lines.length, 0);
  });

  it('filters out send_message tool', async () => {
    logTrajectory('test-server', 'tools/call', { name: 'send_message' }, {}, 100);
    const lines = await readFlywheel();
    assert.strictEqual(lines.length, 0);
  });

  it('logs valid tools/call', async () => {
    logTrajectory(
      'project-graph', 
      'tools/call', 
      { name: 'read_file', arguments: { path: 'test.js' } }, 
      { content: [{ text: 'console.log("hello")' }] }, 
      150
    );
    
    const lines = await readFlywheel();
    assert.strictEqual(lines.length, 1);
    
    const entry = lines[0];
    assert.strictEqual(entry.server, 'project-graph');
    assert.strictEqual(entry.tool, 'read_file');
    assert.deepStrictEqual(entry.args, { path: 'test.js' });
    assert.strictEqual(entry.result_summary, 'console.log("hello")');
    assert.strictEqual(entry.duration_ms, 150);
    assert.ok(entry.timestamp);
  });

  it('truncates results over 5000 characters', async () => {
    // Clear previous
    fs.unlinkSync(FLYWHEEL_FILE);
    
    const hugeText = 'A'.repeat(6000);
    logTrajectory(
      'project-graph', 
      'tools/call', 
      { name: 'read_huge_file' }, 
      { content: [{ text: hugeText }] }, 
      200
    );
    
    const lines = await readFlywheel();
    assert.strictEqual(lines.length, 1);
    
    const entry = lines[0];
    assert.ok(entry.result_summary.length < 5100);
    assert.ok(entry.result_summary.endsWith('... [TRUNCATED]'));
    assert.ok(entry.result_summary.startsWith('A'.repeat(5000)));
  });
});
