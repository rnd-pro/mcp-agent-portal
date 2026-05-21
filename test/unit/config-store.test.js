import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fsp from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

/**
 * Unit tests for config-store.js
 * Run: node --test test/unit/config-store.test.js
 */

let testDir;
let originalConfigPath;
let originalChatsDir;

async function importConfigStore() {
  return import(`../../src/node/config-store.js?test=${Date.now()}-${Math.random()}`);
}

describe('config-store', () => {
  beforeEach(async () => {
    testDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'config-store-test-'));
    originalConfigPath = process.env.PORTAL_CONFIG_PATH;
    originalChatsDir = process.env.PORTAL_CHATS_DIR;
    process.env.PORTAL_CONFIG_PATH = path.join(testDir, 'agent-portal.json');
    process.env.PORTAL_CHATS_DIR = path.join(testDir, 'agent-portal-chats');
  });

  afterEach(async () => {
    if (originalConfigPath === undefined) delete process.env.PORTAL_CONFIG_PATH;
    else process.env.PORTAL_CONFIG_PATH = originalConfigPath;
    if (originalChatsDir === undefined) delete process.env.PORTAL_CHATS_DIR;
    else process.env.PORTAL_CHATS_DIR = originalChatsDir;
    await fsp.rm(testDir, { recursive: true, force: true });
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
      teamLibraryRepo: '<private-agent-portal-skills-remote>',
      teamLibraryBranch: 'main',
    });

    assert.deepEqual(getAgentPortalConfig(), {
      openLibraryPath: '/tmp/open-memory',
      teamLibraryRepo: '<private-agent-portal-skills-remote>',
      teamLibraryBranch: 'main',
    });
  });

  it('caches chat writes while persisting them asynchronously', async () => {
    let {
      appendChatMessage,
      createChat,
      flushChatWrites,
      getChat,
      listChats,
      deleteChat,
    } = await importConfigStore();

    let { id } = createChat({ name: 'Async chat' });
    appendChatMessage(id, { role: 'user', text: 'hello' });

    assert.equal(getChat(id).messages[0].text, 'hello');
    assert.equal(listChats()[0].id, id);

    await flushChatWrites();
    let raw = await fsp.readFile(path.join(process.env.PORTAL_CHATS_DIR, `${id}.json`), 'utf8');
    assert.equal(JSON.parse(raw).messages[0].text, 'hello');

    deleteChat(id);
    assert.equal(getChat(id), null);
    await flushChatWrites();
  });
});
