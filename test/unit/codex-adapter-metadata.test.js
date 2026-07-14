import { after, describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import childProcess from 'node:child_process';
import EventEmitter from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

let stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-adapter-metadata-'));
process.env.PORTAL_STATE_DIR = stateDir;
process.env.PORTAL_STATE_PATH = path.join(stateDir, 'state.json');
process.env.PORTAL_WAL_PATH = path.join(stateDir, 'state.wal');
process.env.PORTAL_CONFIG_PATH = path.join(stateDir, 'config.json');
process.env.PORTAL_CHATS_DIR = path.join(stateDir, 'chats');

function model(id, efforts, tiers = []) {
  return {
    id,
    model: id,
    displayName: id,
    description: `${id} description`,
    hidden: false,
    isDefault: id === 'gpt-5.6-sol',
    supportedReasoningEfforts: efforts.map(reasoningEffort => ({ reasoningEffort, description: reasoningEffort })),
    defaultReasoningEffort: efforts[0],
    serviceTiers: tiers.map(id => ({ id, name: id, description: id })),
    defaultServiceTier: null,
    inputModalities: ['text'],
    supportsPersonality: false,
  };
}

function installDiscoveryMock() {
  mock.method(childProcess, 'spawn', () => {
    let processHandle = new EventEmitter();
    processHandle.stdin = new EventEmitter();
    processHandle.stdout = new EventEmitter();
    processHandle.stderr = new EventEmitter();
    processHandle.stdin.end = mock.fn();
    processHandle.kill = mock.fn();
    processHandle.stdin.write = mock.fn(chunk => {
      let request = JSON.parse(chunk.toString());
      if (request.method === 'initialize') {
        process.nextTick(() => processHandle.stdout.emit('data', `${JSON.stringify({ jsonrpc: '2.0', id: 1, result: {} })}\n`));
      } else if (request.method === 'model/list') {
        let response = {
          jsonrpc: '2.0',
          id: request.id,
          result: {
            data: [
              model('gpt-5.6-sol', ['low', 'high', 'ultra'], ['priority']),
              model('gpt-5.6-luna', ['low', 'max']),
            ],
          },
        };
        process.nextTick(() => processHandle.stdout.emit('data', `${JSON.stringify(response)}\n`));
      }
    });
    return processHandle;
  });
}

after(() => {
  mock.restoreAll();
  fs.rmSync(stateDir, { recursive: true, force: true });
});

describe('Codex adapter metadata', () => {
  it('unions custom and discovered models and exposes per-model settings', async () => {
    installDiscoveryMock();
    let adapters = await import('../../src/node/adapters/index.js');
    await adapters.discoverCodexModels({ force: true });
    let { getStateGraph } = await import('../../src/node/state-graph.js');
    getStateGraph().setProviderModels('codex', ['custom-codex'], 'test');

    let { metadata } = adapters.listAdapterTypes();
    let modelParameter = metadata.codex.parameters.find(parameter => parameter.id === 'model');
    let reasoningParameter = metadata.codex.parameters.find(parameter => parameter.id === 'reasoningEffort');
    let serviceTierParameter = metadata.codex.parameters.find(parameter => parameter.id === 'serviceTier');
    let modelIds = modelParameter.options.map(option => option.val);

    assert.deepEqual(modelIds, ['default', 'custom-codex', 'gpt-5.6-sol', 'gpt-5.6-luna']);
    assert.deepEqual(reasoningParameter.optionsByModel['gpt-5.6-sol'], ['default', 'low', 'high', 'ultra']);
    assert.deepEqual(reasoningParameter.optionsByModel['gpt-5.6-luna'], ['default', 'low', 'max']);
    assert.deepEqual(reasoningParameter.optionsByModel.default, ['default', 'low', 'high', 'ultra']);
    assert.deepEqual(serviceTierParameter.optionsByModel['gpt-5.6-sol'], ['default', 'priority']);
    assert.deepEqual(serviceTierParameter.optionsByModel.default, ['default', 'priority']);
    assert.equal(metadata.codex.discovery.status, 'ready');
  });
});
