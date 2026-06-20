import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

let testStateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'adapters-registry-state-'));
process.env.PORTAL_STATE_DIR = testStateDir;
process.env.PORTAL_STATE_PATH = path.join(testStateDir, 'agent-portal-state.json');
process.env.PORTAL_WAL_PATH = path.join(testStateDir, 'agent-portal.wal');
process.env.PORTAL_CONFIG_PATH = path.join(testStateDir, 'agent-portal.json');
process.env.PORTAL_CHATS_DIR = path.join(testStateDir, 'agent-portal-chats');

after(() => {
  fs.rmSync(testStateDir, { recursive: true, force: true });
});

describe('adapters-registry', () => {
  it('resolveAdapter returns factory for known types', async () => {
    let { resolveAdapter } = await import('../../src/node/adapters/index.js');
    
    let antigravity = resolveAdapter('antigravity');
    assert.equal(typeof antigravity, 'function', 'antigravity should resolve to factory function');
    
    let claude = resolveAdapter('claude');
    assert.equal(typeof claude, 'function', 'claude should resolve to factory function');

    let codex = resolveAdapter('codex');
    assert.equal(typeof codex, 'function', 'codex should resolve to factory function');
  });

  it('resolveAdapter throws for unknown type with valid options', async () => {
    let { resolveAdapter } = await import('../../src/node/adapters/index.js');
    
    assert.throws(
      () => resolveAdapter('unknown-adapter'),
      (err) => {
        assert.ok(err.message.includes('Unknown adapter type'), 'should mention unknown type');
        assert.ok(err.message.includes('antigravity'), 'should list antigravity as valid');
        assert.ok(err.message.includes('claude'), 'should list claude as valid');
        return true;
      }
    );
  });

  it('listAdapterTypes returns all registered types', async () => {
    let { listAdapterTypes } = await import('../../src/node/adapters/index.js');
    
    let { types, metadata } = listAdapterTypes();
    assert.ok(Array.isArray(types), 'should return array of types');
    assert.ok(types.includes('antigravity'), 'should include antigravity');
    assert.ok(types.includes('claude'), 'should include claude');
    assert.ok(types.includes('codex'), 'should include codex');
    assert.ok(types.includes('opencode'), 'should include opencode (metadata only)');
    assert.ok(types.includes('pool'), 'should include pool');
    assert.ok(metadata, 'should return metadata');
    assert.equal(types.length, 5, 'should have exactly 5 adapter types in metadata');
  });

  it('exposes DeepSeek models for OpenCode provider selection only', async () => {
    let { listAdapterTypes } = await import('../../src/node/adapters/index.js');

    let { metadata } = listAdapterTypes();
    let openCodeOptions = metadata.opencode.parameters.find(param => param.id === 'model').options;
    let openCodeValues = openCodeOptions.map(option => option.val);
    let claudeOptions = metadata.claude.parameters.find(param => param.id === 'model').options;
    let claudeValues = claudeOptions.map(option => option.val);

    assert.ok(openCodeValues.includes('deepseek/deepseek-v4-flash'));
    assert.ok(openCodeValues.includes('deepseek/deepseek-v4-pro'));
    assert.equal(claudeValues.includes('deepseek/deepseek-v4-flash'), false);
    assert.equal(claudeValues.includes('deepseek/deepseek-v4-pro'), false);
  });

  it('exposes current Claude Code aliases and pinned model IDs', async () => {
    let { listAdapterTypes } = await import('../../src/node/adapters/index.js');

    let { metadata } = listAdapterTypes();
    let claudeOptions = metadata.claude.parameters.find(param => param.id === 'model').options;
    let claudeValues = claudeOptions.map(option => option.val);
    let claudeLabels = new Map(claudeOptions.map(option => [option.val, option.text]));

    for (let id of ['default', 'fable', 'opus', 'sonnet', 'haiku', 'claude-fable-5', 'claude-opus-4-8', 'claude-sonnet-4-6', 'claude-haiku-4-5']) {
      assert.ok(claudeValues.includes(id), `${id} should be selectable for Claude Code`);
    }
    assert.equal(claudeLabels.get('claude-sonnet-4-6'), 'Claude Sonnet 4.6');
  });

  it('exposes agent resource groups without agent-owned runtime policy', async () => {
    let { setPortalRoot, listAdapterTypes } = await import('../../src/node/adapters/index.js');
    setPortalRoot(process.cwd());

    let { metadata } = listAdapterTypes();
    let agentOptions = metadata.pool.parameters.find(param => param.id === 'agent').options;
    let reviewer = agentOptions.find(option => option.val === 'code-reviewer');
    let backend = agentOptions.find(option => option.val === 'backend-engineer');
    let orchestrator = agentOptions.find(option => option.val === 'orchestrator');

    assert.equal(reviewer.resourceGroup, 'review');
    assert.equal(backend.resourceGroup, 'implementation');
    assert.equal(orchestrator.resourceGroup, 'reasoning-heavy');
    assert.equal('approvalMode' in reviewer, false);
    assert.equal('approvalMode' in backend, false);
    assert.equal('approvalMode' in orchestrator, false);
  });

  it('builds resource group metadata from the agent-pool config directory', async () => {
    let oldConfigDir = process.env.AGENT_PORTAL_CONFIG_DIR;
    let tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'adapter-groups-'));
    fs.writeFileSync(path.join(tmpDir, 'resource-groups.json'), JSON.stringify({
      'isolated-review': {
        provider: 'codex',
        model: 'gpt-test',
        profiles: [{ provider: 'codex', model: 'gpt-test' }],
        policy: 'read-only',
        approval_mode: 'plan',
        max_agents: 2,
        timeout: 120,
        rotation_mode: 'round_robin',
      },
    }, null, 2));

    try {
      process.env.AGENT_PORTAL_CONFIG_DIR = tmpDir;
      let { setPortalRoot, listAdapterTypes } = await import('../../src/node/adapters/index.js');
      setPortalRoot(process.cwd());

      let { metadata } = listAdapterTypes();
      let group = metadata._resourceGroupDefaults.groups.find(item => item.name === 'isolated-review');

      assert.equal(group.provider, 'codex');
      assert.equal(group.model, 'gpt-test');
      assert.equal(group.approval_mode, 'plan');
      assert.equal(group.max_agents, 2);
      assert.equal(group.timeout, 120);
      assert.deepEqual(metadata._resourceGroupDefaults.byProvider.codex, ['gpt-test']);
    } finally {
      if (oldConfigDir == null) delete process.env.AGENT_PORTAL_CONFIG_DIR;
      else process.env.AGENT_PORTAL_CONFIG_DIR = oldConfigDir;
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
