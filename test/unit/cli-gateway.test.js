import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path, { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CLI_PATH = resolve(__dirname, '../../bin/mcp-agent-portal.js');

let tmpDir;
let configPath;

function runCli(args, extraEnv = {}) {
  return execFileSync('node', [CLI_PATH, ...args], {
    encoding: 'utf8',
    env: {
      ...process.env,
      HOME: tmpDir,
      PORTAL_CONFIG_PATH: configPath,
      ...extraEnv,
    },
  });
}

describe('gateway CLI', () => {
  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gateway-cli-test-'));
    configPath = path.join(tmpDir, 'agent-portal.json');
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('enables DeepSeek defaults without storing or printing API keys', () => {
    fs.writeFileSync(configPath, JSON.stringify({
      anthropicGateway: {
        providers: {
          deepseek: {
            apiKey: 'old-inline-key',
          },
        },
      },
    }));

    let out = runCli(['gateway', 'enable', '--provider', 'deepseek'], {
      DEEPSEEK_API_KEY: 'secret-api-key',
    });
    let config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

    assert.equal(config.anthropicGateway.enabled, true);
    assert.match(config.anthropicGateway.authToken, /^portal-/);
    assert.equal(config.anthropicGateway.defaultModel, 'deepseek-v4-flash');
    assert.equal(config.anthropicGateway.plannerModel, 'deepseek-v4-pro');
    assert.deepEqual(config.anthropicGateway.providers.deepseek, {
      type: 'anthropic-compatible',
      baseUrl: 'https://api.deepseek.com/anthropic',
      apiKeyEnv: 'DEEPSEEK_API_KEY',
      models: ['deepseek-v4-flash', 'deepseek-v4-pro'],
    });
    assert.equal(JSON.stringify(config).includes('secret-api-key'), false);
    assert.equal(JSON.stringify(config).includes('old-inline-key'), false);
    assert.equal(out.includes('secret-api-key'), false);
    assert.equal(out.includes('old-inline-key'), false);
    assert.match(out, /DEEPSEEK_API_KEY \(env present\)/);
  });

  it('prints status and disables gateway without exposing tokens', () => {
    fs.writeFileSync(configPath, JSON.stringify({
      anthropicGateway: {
        enabled: true,
        authToken: 'do-not-print',
        defaultModel: 'deepseek-v4-flash',
        plannerModel: 'deepseek-v4-pro',
        providers: { deepseek: {
          type: 'openai-compatible',
          baseUrl: 'https://api.deepseek.com',
          apiKeyEnv: 'DEEPSEEK_API_KEY',
          models: ['deepseek-v4-flash'],
        } },
      },
    }));

    let status = runCli(['gateway', 'status']);
    assert.match(status, /Enabled:\s+yes/);
    assert.match(status, /Auth token:\s+configured/);
    assert.equal(status.includes('do-not-print'), false);

    let disabled = runCli(['gateway', 'disable']);
    let config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    assert.equal(config.anthropicGateway.enabled, false);
    assert.match(disabled, /Enabled:\s+no/);
  });

  it('falls back to config validation when backend is not running', () => {
    fs.writeFileSync(configPath, JSON.stringify({
      anthropicGateway: {
        enabled: true,
        authToken: 'local-token',
        defaultModel: 'deepseek-v4-flash',
        plannerModel: 'deepseek-v4-pro',
        providers: {
          deepseek: {
            type: 'openai-compatible',
            baseUrl: 'https://api.deepseek.com',
            apiKeyEnv: 'DEEPSEEK_API_KEY',
            models: ['deepseek-v4-flash', 'deepseek-v4-pro'],
          },
        },
      },
    }));

    let out = runCli(['gateway', 'test'], { DEEPSEEK_API_KEY: 'secret-api-key' });
    assert.match(out, /Backend not running; checked config and environment only/);
    assert.match(out, /Config looks valid/);
    assert.equal(out.includes('secret-api-key'), false);
  });

  it('includes gateway commands in help', () => {
    let out = runCli(['--help']);
    assert.match(out, /gateway enable --provider deepseek/);
    assert.match(out, /gateway test/);
  });
});
