import {
  getAgentPortalConfig,
  getAnthropicGatewayConfig,
  setAgentPortalConfig,
  setAnthropicGatewayConfig,
} from '../../config-store.js';
import { getStateGraph } from '../../state-graph.js';
import { discoverOpenCodeModels, getCLIModels } from '../../adapters/index.js';
import { json, parseBody } from './http.js';

export function createSettingsRoutes() {
  return {
    'GET /api/settings': (_req, res) => {
      let sg = getStateGraph();
      json(res, {
        ...sg.getSettings(),
        agentPortal: getAgentPortalConfig(),
        anthropicGateway: getAnthropicGatewayConfig(),
      });
    },

    'GET /api/ui': (_req, res) => {
      let sg = getStateGraph();
      json(res, sg.get('ui') || {});
    },

    'POST /api/ui': async (req, res) => {
      try {
        let { path, value } = await parseBody(req);
        if (!path || (!path.startsWith('ui/') && !path.startsWith('layouts/'))) {
          throw new Error('Invalid UI state path');
        }
        let sg = getStateGraph();
        sg.set(path, value, 'http');
        json(res, { ok: true });
      } catch (err) {
        json(res, { error: err.message }, 400);
      }
    },

    'POST /api/settings': async (req, res) => {
      try {
        let settings = await parseBody(req);
        let sg = getStateGraph();
        sg.setSettings(settings, 'http');
        if (Object.prototype.hasOwnProperty.call(settings, 'anthropicGateway')) {
          setAnthropicGatewayConfig(settings.anthropicGateway);
        }
        if (Object.prototype.hasOwnProperty.call(settings, 'agentPortal')) {
          setAgentPortalConfig(settings.agentPortal);
        }
        json(res, { ok: true });
      } catch (err) {
        json(res, { error: err.message }, 400);
      }
    },

    'GET /api/settings/models': (_req, res) => {
      let sg = getStateGraph();
      let userModels = sg.getAllProviderModels();
      let cliModels = getCLIModels();
      json(res, { userModels, cliModels });
    },

    'POST /api/settings/models': async (req, res) => {
      try {
        let { provider, models } = await parseBody(req);
        if (!provider || !Array.isArray(models)) {
          json(res, { error: 'Missing provider or models array' }, 400);
          return;
        }
        let sg = getStateGraph();
        sg.setProviderModels(provider, models, 'http');
        json(res, { ok: true });
      } catch (err) {
        json(res, { error: err.message }, 400);
      }
    },

    'POST /api/settings/models/refresh': async (_req, res) => {
      try {
        let models = await discoverOpenCodeModels();
        json(res, { ok: true, count: models.length, models });
      } catch (err) {
        json(res, { error: err.message }, 500);
      }
    },
  };
}
