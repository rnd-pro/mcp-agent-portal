import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const TEST_CWD = path.join(os.tmpdir(), `agent-pool-context-test-${Date.now()}`);

describe('context.js', () => {
  let trackFiles, untrackFiles, getActiveContext;

  before(async () => {
    const mod = await import('../../packages/context-x-mcp/src/file-tracker.js');
    trackFiles = mod.trackFiles;
    untrackFiles = mod.untrackFiles;
    getActiveContext = mod.getActiveContext;

    if (!fs.existsSync(TEST_CWD)) {
      fs.mkdirSync(TEST_CWD, { recursive: true });
    }
  });

  after(() => {
    if (fs.existsSync(TEST_CWD)) {
      fs.rmSync(TEST_CWD, { recursive: true, force: true });
    }
  });

  it('getActiveContext on nonexistent context returns empty array', () => {
    const ctx = getActiveContext(TEST_CWD);
    assert.deepStrictEqual(ctx, []);
  });

  it('trackFiles adds files to context and deduplicates', () => {
    const res1 = trackFiles(TEST_CWD, ['src/index.js']);
    assert.deepStrictEqual(res1, ['src/index.js']);

    const res2 = trackFiles(TEST_CWD, ['src/index.js', 'src/utils.js']);
    assert.deepStrictEqual(res2, ['src/index.js', 'src/utils.js']);
    
    // Check persistence
    const loaded = getActiveContext(TEST_CWD);
    assert.deepStrictEqual(loaded, ['src/index.js', 'src/utils.js']);
  });

  it('untrackFiles removes specific files', () => {
    const res = untrackFiles(TEST_CWD, ['src/index.js']);
    assert.deepStrictEqual(res, ['src/utils.js']);
  });

  it('untrackFiles with empty array clears all files', () => {
    const res = untrackFiles(TEST_CWD, []);
    assert.deepStrictEqual(res, []);
    
    const loaded = getActiveContext(TEST_CWD);
    assert.deepStrictEqual(loaded, []);
  });
});
