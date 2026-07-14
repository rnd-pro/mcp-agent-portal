import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  cloneLoadedGroups,
  modelReasoningEfforts,
  modelServiceTiers,
  profileSettingSummary,
  providerModelIds,
  reconcileModelSetting,
} from '../../web/panels/GroupManager/model-settings.js';

let CODEX_MODELS = [
  {
    id: 'gpt-5.6-sol',
    hidden: false,
    isDefault: true,
    supportedReasoningEfforts: [
      { reasoningEffort: 'low' },
      { reasoningEffort: 'high' },
      { reasoningEffort: 'ultra' },
    ],
    serviceTiers: [{ id: 'priority' }],
  },
  {
    id: 'gpt-5.6-luna',
    hidden: false,
    supportedReasoningEfforts: [
      { reasoningEffort: 'low' },
      { reasoningEffort: 'max' },
    ],
    serviceTiers: [],
  },
  {
    id: 'codex-auto-review',
    hidden: true,
    supportedReasoningEfforts: [{ reasoningEffort: 'high' }],
    serviceTiers: [],
  },
];

describe('GroupManager Codex settings', () => {
  it('merges custom and live models without exposing hidden catalog entries', () => {
    let models = providerModelIds({
      provider: 'codex',
      apiDefaults: ['default'],
      fallbackDefaults: ['default'],
      userModels: ['custom-codex'],
      codexModels: CODEX_MODELS,
    });

    assert.deepEqual(models, ['default', 'custom-codex', 'gpt-5.6-sol', 'gpt-5.6-luna']);
  });

  it('uses model-specific choices and resets only unsupported dependent values', () => {
    let solReasoning = modelReasoningEfforts('codex', 'gpt-5.6-sol', CODEX_MODELS);
    let lunaReasoning = modelReasoningEfforts('codex', 'gpt-5.6-luna', CODEX_MODELS);
    let solTiers = modelServiceTiers('codex', 'gpt-5.6-sol', CODEX_MODELS);
    let lunaTiers = modelServiceTiers('codex', 'gpt-5.6-luna', CODEX_MODELS);

    assert.deepEqual(solReasoning, ['default', 'low', 'high', 'ultra']);
    assert.deepEqual(lunaReasoning, ['default', 'low', 'max']);
    assert.deepEqual(solTiers, ['default', 'priority']);
    assert.deepEqual(lunaTiers, ['default']);
    assert.deepEqual(modelReasoningEfforts('codex', 'default', CODEX_MODELS), solReasoning);
    assert.deepEqual(modelServiceTiers('codex', 'default', CODEX_MODELS), solTiers);
    assert.equal(reconcileModelSetting('low', lunaReasoning), 'low');
    assert.equal(reconcileModelSetting('ultra', lunaReasoning), 'default');
    assert.equal(reconcileModelSetting('priority', lunaTiers), 'default');
  });

  it('clones loaded profiles without deleting unknown values and formats card metadata', () => {
    let source = [{
      name: 'preservation-group',
      profiles: [{
        provider: 'codex',
        model: 'custom-codex',
        reasoningEffort: 'future-effort',
        serviceTier: 'future-tier',
      }],
    }];
    let loaded = cloneLoadedGroups(source);

    assert.notEqual(loaded, source);
    assert.notEqual(loaded[0].profiles, source[0].profiles);
    assert.equal(loaded[0].profiles[0].reasoningEffort, 'future-effort');
    assert.equal(loaded[0].profiles[0].serviceTier, 'future-tier');
    assert.equal(profileSettingSummary(loaded[0].profiles[0]), 'effort future-effort · tier future-tier');
  });

  it('serves realistic visible Codex metadata in demo mode', async () => {
    let previousDemoMode = process.env.AGENT_PORTAL_DEMO_MODE;
    process.env.AGENT_PORTAL_DEMO_MODE = '1';
    try {
      let { createServerDemoMode } = await import('../../src/node/server/demo-mode.js');
      let demo = createServerDemoMode({ projectRoot: '.' });
      let route = demo.routes['GET /api/settings/models'];
      let responseData;
      let response = {
        writeHead(status, headers) {
          assert.equal(status, 200);
          assert.equal(headers['Content-Type'], 'application/json');
        },
        end(data) { responseData = JSON.parse(data); },
      };

      await route({}, response);

      let sol = responseData.codexModels.find(model => model.id === 'gpt-5.6-sol');
      assert.ok(sol.supportedReasoningEfforts.some(option => option.reasoningEffort === 'ultra'));
      assert.ok(sol.serviceTiers.some(tier => tier.id === 'priority'));
      assert.equal(responseData.codexModels.some(model => model.hidden), false);
      let adapterResponse;
      let adapterRes = {
        writeHead() {},
        end(data) { adapterResponse = JSON.parse(data); },
      };
      await demo.routes['GET /api/adapter/types']({}, adapterRes);
      assert.ok(adapterResponse.metadata.codex);
      assert.deepEqual(
        adapterResponse.metadata.codex.parameters.find(parameter => parameter.id === 'serviceTier').optionsByModel.default,
        ['default', 'priority'],
      );
    } finally {
      if (previousDemoMode === undefined) delete process.env.AGENT_PORTAL_DEMO_MODE;
      else process.env.AGENT_PORTAL_DEMO_MODE = previousDemoMode;
    }
  });
});
