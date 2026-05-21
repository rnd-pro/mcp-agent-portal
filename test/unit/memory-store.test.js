import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fsp from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

const TEST_DIR = path.join(os.tmpdir(), `agent-portal-memory-test-${Date.now()}`);
const MEMORY_FILE = path.join(TEST_DIR, 'global-memory.json');

describe('memory-store.js', () => {
  let remember, recall, readMemory, writeMemory, flushMemoryWrites;

  before(async () => {
    await fsp.mkdir(TEST_DIR, { recursive: true });
    
    // Set env var before importing
    process.env.PORTAL_MEMORY_PATH = MEMORY_FILE;
    
    const mod = await import('../../src/node/memory-store.js');
    remember = mod.remember;
    recall = mod.recall;
    readMemory = mod.readMemory;
    writeMemory = mod.writeMemory;
    flushMemoryWrites = mod.flushMemoryWrites;
  });

  after(async () => {
    await flushMemoryWrites();
    await fsp.rm(TEST_DIR, { recursive: true, force: true });
    delete process.env.PORTAL_MEMORY_PATH;
  });

  it('readMemory returns empty object if file does not exist', () => {
    assert.deepStrictEqual(readMemory(), {});
  });

  it('writeMemory writes JSON to disk, handling nonexistent directories', async () => {
    const mem = { testKey: { value: 42, updatedAt: Date.now() } };
    writeMemory(mem);
    await flushMemoryWrites();
    
    await fsp.access(MEMORY_FILE);
    const loaded = JSON.parse(await fsp.readFile(MEMORY_FILE, 'utf-8'));
    assert.deepStrictEqual(loaded, mem);
  });

  it('remember saves value and returns confirmation string', () => {
    const res = remember('user_preference', { theme: 'dark' });
    assert.strictEqual(res, 'Successfully remembered key "user_preference".');
    
    const mem = readMemory();
    assert.ok(mem['user_preference']);
    assert.deepStrictEqual(mem['user_preference'].value, { theme: 'dark' });
  });

  it('recall fetches value by exact key match', () => {
    const res = recall('user_preference');
    assert.deepStrictEqual(res, { user_preference: { theme: 'dark' } });
  });

  it('recall fetches value by fuzzy match (substring)', () => {
    remember('arch_rules', 'No circular dependencies');
    const res = recall('arch');
    assert.ok(res['arch_rules']);
    assert.strictEqual(res['arch_rules'], 'No circular dependencies');
  });

  it('recall returns "No memories found..." when no match', () => {
    const res = recall('nonexistent');
    assert.strictEqual(res, 'No memories found matching "nonexistent".');
  });
});
