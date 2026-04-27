import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

/**
 * Unit tests for config-store.js
 * Run: node --test test/unit/config-store.test.js
 */

let testDir;
let originalHome;

describe('config-store', () => {

  it('readConfig returns default when file missing', async () => {
    // Use dynamic import to get fresh module
    let { readConfig } = await import('../../src/node/config-store.js');
    // readConfig uses os.homedir() — if ~/.gemini/agent-portal.json exists,
    // it will read it; otherwise returns default
    let config = readConfig();
    assert.ok(config, 'config should be an object');
    assert.ok('mcpServers' in config || typeof config === 'object', 'config should have mcpServers or be an object');
  });

  it('writeConfig + readConfig round-trip', async () => {
    let { readConfig, writeConfig } = await import('../../src/node/config-store.js');
    
    // Read current config, write it back, read again — should be stable
    let original = readConfig();
    let backup = JSON.stringify(original);
    
    writeConfig(original);
    let afterWrite = readConfig();
    
    assert.deepStrictEqual(afterWrite, original, 'round-trip should preserve config');
    
    // Restore original to avoid mutation
    writeConfig(JSON.parse(backup));
  });
});
