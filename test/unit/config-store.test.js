import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

/**
 * Unit tests for config-store.js
 * Run: node --test test/unit/config-store.test.js
 */

let testDir;
let originalConfigPath;

async function importConfigStore() {
  return import(`../../src/node/config-store.js?test=${Date.now()}-${Math.random()}`);
}

describe('config-store', () => {
  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'config-store-test-'));
    originalConfigPath = process.env.PORTAL_CONFIG_PATH;
    process.env.PORTAL_CONFIG_PATH = path.join(testDir, 'agent-portal.json');
  });

  afterEach(() => {
    if (originalConfigPath === undefined) delete process.env.PORTAL_CONFIG_PATH;
    else process.env.PORTAL_CONFIG_PATH = originalConfigPath;
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  it('readConfig returns default when file missing', async () => {
    let { readConfig } = await importConfigStore();
    let config = readConfig();
    assert.ok(config, 'config should be an object');
    assert.deepEqual(config, { mcpServers: {}, projects: [], globalCli: {}, activeProjectIds: [] });
  });

  it('writeConfig + readConfig round-trip', async () => {
    let { readConfig, writeConfig } = await importConfigStore();
    let original = { mcpServers: { test: { command: 'node' } }, projects: [] };

    writeConfig(original);
    let afterWrite = readConfig();

    assert.deepStrictEqual(afterWrite, original, 'round-trip should preserve config');
  });

  it('sets and updates Anthropic gateway config', async () => {
    let {
      getAnthropicGatewayConfig,
      setAnthropicGatewayConfig,
      updateAnthropicGatewayConfig,
      readConfig,
    } = await importConfigStore();

    assert.deepEqual(getAnthropicGatewayConfig(), {});

    setAnthropicGatewayConfig({
      enabled: true,
      authToken: 'local-token',
      providers: {
        deepseek: { type: 'openai-compatible', baseUrl: 'https://api.deepseek.com' },
      },
    });

    let updated = updateAnthropicGatewayConfig((current) => ({
      ...current,
      defaultModel: 'deepseek-v4-flash',
    }));

    assert.equal(updated.enabled, true);
    assert.equal(updated.authToken, 'local-token');
    assert.equal(updated.defaultModel, 'deepseek-v4-flash');
    assert.equal(readConfig().anthropicGateway.defaultModel, 'deepseek-v4-flash');
  });

  it('stores Agent Portal library settings in local config', async () => {
    let { getAgentPortalConfig, setAgentPortalConfig } = await importConfigStore();

    assert.deepEqual(getAgentPortalConfig(), {});

    setAgentPortalConfig({
      openLibraryPath: '/tmp/open-memory',
      teamLibraryRepo: 'git@github.com:org/team-memory.git',
      teamLibraryBranch: 'main',
    });

    assert.deepEqual(getAgentPortalConfig(), {
      openLibraryPath: '/tmp/open-memory',
      teamLibraryRepo: 'git@github.com:org/team-memory.git',
      teamLibraryBranch: 'main',
    });
  });
});
