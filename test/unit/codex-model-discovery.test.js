import { afterEach, beforeEach, describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import childProcess from 'node:child_process';
import EventEmitter from 'node:events';

function modelFixture(id, overrides = {}) {
  return {
    id,
    model: id,
    displayName: id.toUpperCase(),
    description: `${id} description`,
    hidden: false,
    isDefault: false,
    supportedReasoningEfforts: [
      { reasoningEffort: 'low', description: 'Low reasoning' },
      { reasoningEffort: 'high', description: 'High reasoning' },
    ],
    defaultReasoningEffort: 'low',
    serviceTiers: [{ id: 'priority', name: 'Fast', description: 'Priority lane' }],
    defaultServiceTier: null,
    inputModalities: ['text', 'image'],
    supportsPersonality: false,
    ...overrides,
  };
}

function mockProcess(onWrite = () => {}) {
  let processHandle = new EventEmitter();
  processHandle.stdin = new EventEmitter();
  processHandle.stdin.write = mock.fn(chunk => onWrite(JSON.parse(chunk.toString()), processHandle));
  processHandle.stdin.end = mock.fn();
  processHandle.stdout = new EventEmitter();
  processHandle.stderr = new EventEmitter();
  processHandle.kill = mock.fn();
  return processHandle;
}

function emitJson(processHandle, value) {
  process.nextTick(() => processHandle.stdout.emit('data', `${JSON.stringify(value)}\n`));
}

function installCatalogSpawn({ generation = 1, writes = [] } = {}) {
  return mock.method(childProcess, 'spawn', () => mockProcess((request, processHandle) => {
    writes.push(request);
    if (request.method === 'initialize') {
      emitJson(processHandle, { id: request.id, result: { userAgent: 'Codex' } });
      emitJson(processHandle, { method: 'remoteControl/status/changed', params: { status: 'disconnected' } });
      return;
    }
    if (request.method !== 'model/list') return;
    let firstPage = !request.params.cursor;
    emitJson(processHandle, {
      id: request.id,
      result: {
        data: firstPage
          ? [modelFixture(`gpt-sol-${generation}`, { isDefault: true })]
          : [
              modelFixture(`gpt-luna-${generation}`, { serviceTiers: [] }),
              modelFixture('codex-auto-review', { hidden: true, serviceTiers: [] }),
            ],
        nextCursor: firstPage ? 'page-2' : null,
      },
    });
  }));
}

describe('Codex model discovery', () => {
  beforeEach(() => {
    installCatalogSpawn();
  });

  afterEach(() => {
    mock.restoreAll();
  });

  it('performs the handshake, follows pagination, filters hidden models, and caches normalized data', async () => {
    let writes = [];
    mock.restoreAll();
    installCatalogSpawn({ writes });
    let discovery = await import('../../src/node/adapters/codex-discovery.js');
    discovery.clearCodexDiscoveryCache();

    let models = await discovery.discoverCodexModels();

    assert.deepEqual(models.map(model => model.id), ['gpt-sol-1', 'gpt-luna-1']);
    assert.deepEqual(
      discovery.getCachedCodexModels({ includeHidden: true }).map(model => model.id),
      ['gpt-sol-1', 'gpt-luna-1', 'codex-auto-review'],
    );
    assert.equal(discovery.getCodexDiscoveryStatus().status, 'ready');
    assert.deepEqual(writes[1], { jsonrpc: '2.0', method: 'initialized' });
    assert.equal(writes[2].params.limit, 100);
    assert.equal(writes[3].params.cursor, 'page-2');

    await discovery.discoverCodexModels();
    assert.equal(writes.filter(request => request.method === 'initialize').length, 1);
  });

  it('surfaces process exit detail without losing discovery status', async () => {
    mock.restoreAll();
    mock.method(childProcess, 'spawn', () => {
      let processHandle = mockProcess();
      process.nextTick(() => {
        processHandle.stderr.emit('data', 'authentication required');
        processHandle.emit('exit', 1);
      });
      return processHandle;
    });
    let discovery = await import('../../src/node/adapters/codex-discovery.js');
    discovery.clearCodexDiscoveryCache();

    await assert.rejects(() => discovery.discoverCodexModels(), /authentication required/);
    assert.equal(discovery.getCodexDiscoveryStatus().status, 'error');
    assert.match(discovery.getCodexDiscoveryStatus().error, /exited before model discovery/);
  });

  it('times out and cleans up the child process and listeners', async t => {
    mock.restoreAll();
    t.mock.timers.enable({ apis: ['setTimeout'] });
    let processHandle = mockProcess();
    mock.method(childProcess, 'spawn', () => processHandle);
    let discovery = await import('../../src/node/adapters/codex-discovery.js');
    discovery.clearCodexDiscoveryCache();

    let pending = discovery.discoverCodexModels();
    t.mock.timers.tick(5000);

    await assert.rejects(pending, /timed out after 5000ms/);
    assert.equal(processHandle.stdin.end.mock.callCount(), 1);
    assert.equal(processHandle.kill.mock.callCount(), 1);
    assert.equal(processHandle.stdout.listenerCount('data'), 0);
    assert.equal(processHandle.listenerCount('exit'), 0);
  });

  it('rejects malformed JSON and malformed result structures', async () => {
    mock.restoreAll();
    let processHandle = mockProcess((request, activeProcess) => {
      if (request.method === 'initialize') {
        emitJson(activeProcess, { jsonrpc: '2.0', id: 1, result: {} });
      } else if (request.method === 'model/list') {
        emitJson(activeProcess, { jsonrpc: '2.0', id: request.id, result: { data: 'invalid' } });
      }
    });
    mock.method(childProcess, 'spawn', () => processHandle);
    let discovery = await import('../../src/node/adapters/codex-discovery.js');
    discovery.clearCodexDiscoveryCache();

    await assert.rejects(() => discovery.discoverCodexModels(), /result.data must be an array/);

    mock.restoreAll();
    processHandle = mockProcess();
    mock.method(childProcess, 'spawn', () => {
      process.nextTick(() => processHandle.stdout.emit('data', 'not-json\n'));
      return processHandle;
    });
    discovery.clearCodexDiscoveryCache();
    await assert.rejects(() => discovery.discoverCodexModels(), /Malformed JSON/);
  });

  it('rejects schema-invalid model fields instead of coercing them', async () => {
    mock.restoreAll();
    mock.method(childProcess, 'spawn', () => mockProcess((request, processHandle) => {
      if (request.method === 'initialize') {
        emitJson(processHandle, { jsonrpc: '2.0', id: 1, result: {} });
      } else if (request.method === 'model/list') {
        emitJson(processHandle, {
          jsonrpc: '2.0',
          id: request.id,
          result: { data: [modelFixture('invalid-model', { hidden: 'false' })] },
        });
      }
    }));
    let discovery = await import('../../src/node/adapters/codex-discovery.js');
    discovery.clearCodexDiscoveryCache();

    await assert.rejects(() => discovery.discoverCodexModels(), /hidden must be a boolean/);
  });

  it('requires schema booleans and known input modalities', async () => {
    let invalidModels = [
      modelFixture('missing-default-flag', { isDefault: undefined }),
      modelFixture('invalid-modality', { inputModalities: ['audio'] }),
    ];
    let discovery = await import('../../src/node/adapters/codex-discovery.js');

    for (let invalidModel of invalidModels) {
      mock.restoreAll();
      mock.method(childProcess, 'spawn', () => mockProcess((request, processHandle) => {
        if (request.method === 'initialize') emitJson(processHandle, { id: 1, result: {} });
        if (request.method === 'model/list') {
          emitJson(processHandle, { id: request.id, result: { data: [invalidModel] } });
        }
      }));
      discovery.clearCodexDiscoveryCache();
      await assert.rejects(() => discovery.discoverCodexModels(), /isDefault must be a boolean|inputModalities must contain only/);
    }
  });

  it('returns stale data during background refresh and records a failed refresh', async t => {
    mock.restoreAll();
    t.mock.timers.enable({ apis: ['Date'] });
    let spawnCount = 0;
    mock.method(childProcess, 'spawn', () => {
      spawnCount += 1;
      if (spawnCount === 1) {
        return mockProcess((request, processHandle) => {
          if (request.method === 'initialize') emitJson(processHandle, { jsonrpc: '2.0', id: 1, result: {} });
          if (request.method === 'model/list') {
            emitJson(processHandle, { jsonrpc: '2.0', id: request.id, result: { data: [modelFixture('cached-model')] } });
          }
        });
      }
      let processHandle = mockProcess();
      process.nextTick(() => processHandle.emit('error', new Error('refresh failed')));
      return processHandle;
    });
    let discovery = await import('../../src/node/adapters/codex-discovery.js');
    discovery.clearCodexDiscoveryCache();
    await discovery.discoverCodexModels();
    t.mock.timers.tick(31000);

    let stale = await discovery.discoverCodexModels();
    assert.equal(stale[0].id, 'cached-model');
    assert.equal(discovery.getCodexDiscoveryStatus().status, 'refreshing');
    for (let attempt = 0; attempt < 5 && discovery.getCodexDiscoveryStatus().status === 'refreshing'; attempt += 1) {
      await new Promise(resolve => setImmediate(resolve));
    }
    assert.equal(discovery.getCodexDiscoveryStatus().status, 'stale');
    assert.match(discovery.getCodexDiscoveryStatus().error, /refresh failed/);
  });

  it('forces and awaits a fresh query even while the cache is fresh', async () => {
    mock.restoreAll();
    let generation = 0;
    mock.method(childProcess, 'spawn', () => {
      generation += 1;
      return mockProcess((request, processHandle) => {
        if (request.method === 'initialize') emitJson(processHandle, { jsonrpc: '2.0', id: 1, result: {} });
        if (request.method === 'model/list') {
          emitJson(processHandle, { jsonrpc: '2.0', id: request.id, result: { data: [modelFixture(`model-${generation}`)] } });
        }
      });
    });
    let discovery = await import('../../src/node/adapters/codex-discovery.js');
    discovery.clearCodexDiscoveryCache();

    assert.equal((await discovery.discoverCodexModels())[0].id, 'model-1');
    assert.equal((await discovery.discoverCodexModels({ force: true }))[0].id, 'model-2');
    assert.equal(generation, 2);
  });

  it('returns a shared settings response with visible models and discovery state', async () => {
    let discovery = await import('../../src/node/adapters/codex-discovery.js');
    discovery.clearCodexDiscoveryCache();
    await discovery.discoverCodexModels();
    let { createSettingsRoutes } = await import('../../src/node/server/routes/settings-routes.js');
    let routes = createSettingsRoutes({
      getProviderAuthStatus: () => ({ providers: {} }),
    });
    let status;
    let payload;
    let response = {
      writeHead(code) { status = code; },
      end(body) { payload = JSON.parse(body); },
    };

    await routes['GET /api/settings/models']({}, response);

    assert.equal(status, 200);
    assert.equal(payload.codexModels.some(model => model.hidden), false);
    assert.equal(payload.codexDiscovery.status, 'ready');
    assert.ok(payload.userModels);
    assert.ok(payload.defaultModels);
  });

  it('awaits cold Codex discovery before returning adapter metadata', async () => {
    mock.restoreAll();
    mock.method(childProcess, 'spawn', () => mockProcess((request, processHandle) => {
      if (request.method === 'initialize') {
        setTimeout(() => processHandle.stdout.emit('data', `${JSON.stringify({ id: 1, result: {} })}\n`), 10);
      }
      if (request.method === 'model/list') {
        setTimeout(() => processHandle.stdout.emit('data', `${JSON.stringify({
          id: request.id,
          result: { data: [modelFixture('cold-model', { isDefault: true })] },
        })}\n`), 10);
      }
    }));
    let discovery = await import('../../src/node/adapters/codex-discovery.js');
    discovery.clearCodexDiscoveryCache();
    let { createCoreRoutes } = await import('../../src/node/server/routes/core-routes.js');
    let routes = createCoreRoutes({
      projectRoot: process.cwd(),
      proxyManager: { servers: new Map(), monitors: new Map(), getHealthStatus: () => ({}) },
    });
    let payload;
    let response = {
      writeHead() {},
      end(body) { payload = JSON.parse(body); },
    };

    await routes['GET /api/adapter/types']({}, response);

    let models = payload.metadata.codex.parameters.find(parameter => parameter.id === 'model').options;
    assert.ok(models.some(option => option.val === 'cold-model'));
    assert.deepEqual(
      payload.metadata.codex.parameters.find(parameter => parameter.id === 'reasoningEffort').optionsByModel.default,
      ['default', 'low', 'high'],
    );
  });
});

describe('Codex direct adapter settings', () => {
  afterEach(() => mock.restoreAll());

  it('rejects malformed settings and trims default sentinels', async () => {
    let { createCodexAdapter } = await import('../../src/node/adapters/codex.js');
    let adapter = createCodexAdapter();
    await assert.rejects(() => adapter.run({ prompt: 'test', reasoningEffort: 123 }), /must be a string/);
    await assert.rejects(() => adapter.run({ prompt: 'test', serviceTier: '   ' }), /non-empty string/);
  });

  it('places normalized settings before the final prompt argument', async () => {
    let capturedArgs;
    mock.method(childProcess, 'spawn', (_command, args) => {
      capturedArgs = args;
      let processHandle = mockProcess();
      process.nextTick(() => {
        processHandle.stdout.emit('data', `${JSON.stringify({ type: 'turn.completed', usage: {} })}\n`);
        processHandle.emit('close', 0);
      });
      return processHandle;
    });
    let { createCodexAdapter } = await import('../../src/node/adapters/codex.js');
    let adapter = createCodexAdapter();

    await adapter.run({
      prompt: 'Write tests',
      model: 'gpt-5.6-sol',
      reasoningEffort: ' high ',
      serviceTier: ' priority ',
    });

    assert.equal(capturedArgs.at(-1).includes('Write tests'), true);
    assert.deepEqual(capturedArgs.slice(-5, -1), [
      '-c',
      'model_reasoning_effort=high',
      '-c',
      'service_tier=priority',
    ]);
  });

  it('does not forward a trimmed default model sentinel', async () => {
    let capturedArgs;
    mock.method(childProcess, 'spawn', (_command, args) => {
      capturedArgs = args;
      let processHandle = mockProcess();
      process.nextTick(() => {
        processHandle.stdout.emit('data', `${JSON.stringify({ type: 'turn.completed', usage: {} })}\n`);
        processHandle.emit('close', 0);
      });
      return processHandle;
    });
    let { createCodexAdapter } = await import('../../src/node/adapters/codex.js');

    await createCodexAdapter().run({ prompt: 'Use the default', model: ' default ' });

    assert.equal(capturedArgs.includes('--model'), false);
  });
});
