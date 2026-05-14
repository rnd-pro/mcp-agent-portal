// @ctx config-injector tests
// Tests for provider config injection (Gemini CLI + OpenCode)
// TDD: write tests first, then implement

import { describe, it, before, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

describe('Provider Config Injector', () => {
  let tmpDirsToCleanup = [];

  afterEach(() => {
    for (let dir of tmpDirsToCleanup) {
      if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
    }
    tmpDirsToCleanup = [];
  });

  // ── T1: createGeminiEnv creates temp config ───────────────────

  it('T1: createGeminiEnv creates isolated config and returns env overrides', async () => {
    let { createGeminiEnv } = await import('../../packages/agent-pool-mcp/src/runner/provider-config.js');
    
    let { tmpDir, envOverrides } = createGeminiEnv('http://portal.local/mcp');
    tmpDirsToCleanup.push(tmpDir);

    assert.ok(tmpDir.includes('gemini-hub-'), 'Should be a gemini-hub temp dir');
    assert.deepEqual(envOverrides, { GEMINI_CLI_HOME: tmpDir }, 'Should return GEMINI_CLI_HOME env var');
    
    let configPath = path.join(tmpDir, '.gemini', 'settings.json');
    assert.ok(fs.existsSync(configPath), 'Should create settings.json');
    
    let config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    assert.ok(config.mcpServers, 'Should have mcpServers');
    assert.ok(config.mcpServers['agent-portal'], 'Should have agent-portal entry');
    assert.equal(config.mcpServers['agent-portal'].url, 'http://portal.local/mcp');
  });

  // ── T2: createOpenCodeEnv creates temp config ─────────────────

  it('T2: createOpenCodeEnv creates isolated config and returns env overrides', async () => {
    let { createOpenCodeEnv } = await import('../../packages/agent-pool-mcp/src/runner/provider-config.js');
    
    let { tmpDir, envOverrides } = createOpenCodeEnv('http://portal.local/mcp');
    tmpDirsToCleanup.push(tmpDir);

    assert.ok(tmpDir.includes('opencode-hub-'), 'Should be an opencode-hub temp dir');
    assert.deepEqual(envOverrides, { OPENCODE_HOME: tmpDir }, 'Should return OPENCODE_HOME env var');
    
    let configPath = path.join(tmpDir, 'config.json');
    assert.ok(fs.existsSync(configPath), 'Should create config.json');
    
    let config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    assert.ok(config.mcp, 'Should have mcp property');
    assert.ok(config.mcp.servers, 'Should have mcp.servers');
    assert.ok(config.mcp.servers['agent-portal'], 'Should have agent-portal entry');
    assert.equal(config.mcp.servers['agent-portal'].url, 'http://portal.local/mcp');
    assert.equal(config.mcp.servers['agent-portal'].type, 'sse');
  });

  // ── T3: cleanupTmpConfig removes dir ──────────────────────────

  it('T3: cleanupTmpConfig removes the temporary directory', async () => {
    let { createGeminiEnv, cleanupTmpConfig } = await import('../../packages/agent-pool-mcp/src/runner/provider-config.js');
    
    let { tmpDir } = createGeminiEnv('http://portal.local/mcp');
    assert.ok(fs.existsSync(tmpDir), 'Temp dir should exist initially');

    cleanupTmpConfig(tmpDir);
    assert.equal(fs.existsSync(tmpDir), false, 'Temp dir should be removed');
  });

  // ── T4: cleanupTmpConfig safety guard ─────────────────────────

  it('T4: cleanupTmpConfig ignores paths without "hub-" safety marker', async () => {
    let { cleanupTmpConfig } = await import('../../packages/agent-pool-mcp/src/runner/provider-config.js');
    
    let safeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'safe-dir-'));
    tmpDirsToCleanup.push(safeDir); // cleanup at the end of test

    cleanupTmpConfig(safeDir);
    assert.ok(fs.existsSync(safeDir), 'Safe dir should NOT be removed due to missing "hub-" marker');
  });

  it('T5: getClaudeGatewayEnv returns Anthropic env when gateway is enabled', async () => {
    let oldConfigPath = process.env.PORTAL_CONFIG_PATH;
    let oldToken = process.env.ANTHROPIC_GATEWAY_AUTH_TOKEN;
    let configPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'portal-config-')), 'agent-portal.json');
    tmpDirsToCleanup.push(path.dirname(configPath));

    process.env.PORTAL_CONFIG_PATH = configPath;
    process.env.ANTHROPIC_GATEWAY_AUTH_TOKEN = 'env-token';
    fs.writeFileSync(configPath, JSON.stringify({ anthropicGateway: { enabled: true } }));

    try {
      let { getClaudeGatewayEnv } = await import('../../packages/agent-pool-mcp/src/runner/provider-config.js');
      let env = getClaudeGatewayEnv('http://localhost:1234/mcp');

      assert.equal(env.ANTHROPIC_BASE_URL, 'http://localhost:1234/anthropic');
      assert.equal(env.ANTHROPIC_AUTH_TOKEN, 'env-token');
      assert.equal(env.CLAUDE_CODE_ENABLE_GATEWAY_MODEL_DISCOVERY, '1');
    } finally {
      if (oldConfigPath === undefined) delete process.env.PORTAL_CONFIG_PATH;
      else process.env.PORTAL_CONFIG_PATH = oldConfigPath;
      if (oldToken === undefined) delete process.env.ANTHROPIC_GATEWAY_AUTH_TOKEN;
      else process.env.ANTHROPIC_GATEWAY_AUTH_TOKEN = oldToken;
    }
  });
});
