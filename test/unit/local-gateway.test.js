import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2));
}

describe('local gateway route reconciliation', () => {
  it('routes portal.local root to agent-portal when multiple project routes are live', async () => {
    let tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'portal-gateway-root-'));
    let originalHome = process.env.HOME;
    process.env.HOME = tmpHome;

    try {
      let gateway = await import(`../../src/node/server/local-gateway.js?test=${Date.now()}`);
      let services = {
        'portal.local': {
          name: 'mcp-agent-portal',
          routes: {
            '/symbiote-workspace': {
              port: 59936,
              pid: process.pid,
              projectPath: path.join(tmpHome, 'symbiote-workspace'),
              projectName: 'symbiote-workspace',
            },
            '/agent-portal': {
              port: 54370,
              pid: process.pid,
              projectPath: path.join(tmpHome, 'agent-portal'),
              projectName: 'agent-portal',
            },
          },
        },
      };

      let rootRoute = gateway.resolveGatewayRoute('portal.local', '/', services);
      assert.equal(rootRoute.prefix, '/agent-portal');
      assert.equal(rootRoute.port, 54370);

      let explicitRoute = gateway.resolveGatewayRoute('portal.local', '/symbiote-workspace/#workflow-board', services);
      assert.equal(explicitRoute.prefix, '/symbiote-workspace');
      assert.equal(explicitRoute.port, 59936);
    } finally {
      process.env.HOME = originalHome;
      fs.rmSync(tmpHome, { recursive: true, force: true });
    }
  });

  it('rekeys old portal routes by project basename and removes dead routes', async () => {
    let tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'portal-gateway-home-'));
    let originalHome = process.env.HOME;
    process.env.HOME = tmpHome;

    try {
      let gateway = await import(`../../src/node/server/local-gateway.js?test=${Date.now()}`);
      let stateDir = path.join(tmpHome, '.local-gateway');
      let projectPath = path.join(tmpHome, 'cv');
      let backendsDir = path.join(stateDir, 'backends');
      let servicesPath = path.join(stateDir, 'services.json');
      writeJson(path.join(backendsDir, 'portal-cv.json'), {
        port: 5001,
        pid: process.pid,
        name: 'mcp-agent-portal',
        project: projectPath,
      });
      writeJson(servicesPath, {
        'portal.local': {
          name: 'mcp-agent-portal',
          routes: {
            '/mcp-agent-portal': {
              port: 5001,
              pid: process.pid,
              projectPath,
              projectName: 'mcp-agent-portal',
            },
            '/dead-project': {
              port: 5002,
              pid: 99999999,
              projectPath: path.join(tmpHome, 'dead-project'),
              projectName: 'dead-project',
            },
            '/manual-live': {
              port: 5003,
              pid: process.pid,
              projectPath: path.join(tmpHome, 'manual-live'),
              projectName: 'manual-live',
            },
          },
        },
      });

      gateway.reconcileBackendRoutes();

      let services = JSON.parse(fs.readFileSync(servicesPath, 'utf8'));
      let routes = services['portal.local'].routes;
      assert.equal(routes['/cv'].projectPath, projectPath);
      assert.equal(routes['/cv'].projectName, 'cv');
      assert.equal('/mcp-agent-portal' in routes, false);
      assert.equal('/dead-project' in routes, false);
      assert.equal(routes['/manual-live'].projectName, 'manual-live');
      assert.equal(fs.existsSync(path.join(backendsDir, 'portal-cv.json')), true);
    } finally {
      process.env.HOME = originalHome;
      fs.rmSync(tmpHome, { recursive: true, force: true });
    }
  });
});
