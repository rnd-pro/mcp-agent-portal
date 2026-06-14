import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

function makeReq(method, url, body) {
  let req = new EventEmitter();
  req.method = method;
  req.url = url;
  req.destroy = (err) => req.emit('error', err);
  process.nextTick(() => {
    if (body !== undefined) req.emit('data', JSON.stringify(body));
    req.emit('end');
  });
  return req;
}

function makeRes() {
  let res = {
    status: null,
    headers: null,
    body: '',
    writeHead(status, headers) {
      this.status = status;
      this.headers = headers;
    },
    end(body = '') {
      this.body = body;
    },
    json() {
      return JSON.parse(this.body);
    },
  };
  return res;
}

function makeRoutes(projectRoot = '/tmp') {
  return {
    proxyManager: { servers: new Map(), config: {}, getStatus() { return []; } },
    projectRoot,
    env: {
      AGENT_PORTAL_RUNTIME_DIR: path.join(os.tmpdir(), 'agent-portal-api-routes-test-runtime'),
    },
  };
}

describe('api-routes', () => {
  it('createRoutes returns a route map', async () => {
    let { createRoutes } = await import('../../src/node/server/api-routes.js');
    
    // Mock proxyManager with minimal interface
    let mockProxyManager = {
      servers: new Map(),
      config: {},
      getStatus() { return []; },
    };
    
    let routes = createRoutes({ proxyManager: mockProxyManager, projectRoot: '/tmp' });
    assert.ok(routes, 'should return routes object');
    assert.ok(typeof routes === 'object', 'routes should be an object');
  });

  it('dispatch returns false for unknown routes', async () => {
    let { createRoutes, dispatch } = await import('../../src/node/server/api-routes.js');
    
    let mockProxyManager = {
      servers: new Map(),
      config: {},
      getStatus() { return []; },
    };
    
    let routes = createRoutes({ proxyManager: mockProxyManager, projectRoot: '/tmp' });
    
    // Mock req/res
    let req = { method: 'GET', url: '/api/nonexistent' };
    let res = { writeHead() {}, end() {} };
    
    let handled = dispatch(routes, req, res);
    assert.equal(handled, false, 'unknown route should not be handled');
  });

  it('GET /api/project-info exposes effective network access status', async () => {
    let { createRoutes } = await import('../../src/node/server/api-routes.js');
    let routes = createRoutes({
      ...makeRoutes('/tmp/project'),
      getNetworkAccessStatus: () => ({
        lanEnabled: true,
        bindHost: '0.0.0.0',
        localUrl: 'http://127.0.0.1:57580/',
        lanUrls: ['http://192.168.1.10:57580/'],
      }),
    });

    let res = makeRes();
    routes['GET /api/project-info'](makeReq('GET', '/api/project-info'), res);

    assert.equal(res.status, 200);
    assert.equal(res.json().networkAccess.lanEnabled, true);
    assert.equal(res.json().networkAccess.lanUrls[0], 'http://192.168.1.10:57580/');
  });

  it('updates agent resource group frontmatter and refreshes the agent catalog', async () => {
    let tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'agent-resource-group-route-'));
    let agentsDir = path.join(tmpDir, '.agent-portal', 'agents');
    await fs.mkdir(agentsDir, { recursive: true });
    await fs.writeFile(path.join(agentsDir, 'orchestrator.md'), `---
name: orchestrator
description: Routes work
role: orchestrator
resource_group: reasoning-heavy
---

Body
`);

    try {
      let { createRoutes } = await import('../../src/node/server/api-routes.js');
      let routes = createRoutes(makeRoutes(tmpDir));

      let assignRes = makeRes();
      await routes['POST /api/agents/resource-group'](
        makeReq('POST', '/api/agents/resource-group', {
          agent: 'orchestrator',
          resourceGroup: 'implementation',
        }),
        assignRes,
      );

      assert.equal(assignRes.status, 200);
      assert.equal(assignRes.json().agent.resourceGroup, 'implementation');
      let assigned = await fs.readFile(path.join(agentsDir, 'orchestrator.md'), 'utf8');
      assert.match(assigned, /^resource_group: implementation$/m);
      assert.doesNotMatch(assigned, /^resource_group: reasoning-heavy$/m);

      let catalogRes = makeRes();
      routes['GET /api/agents'](makeReq('GET', '/api/agents'), catalogRes);
      let catalogAgent = catalogRes.json().agents.find(agent => agent.slug === 'orchestrator');
      assert.equal(catalogAgent.resourceGroup, 'implementation');

      let clearRes = makeRes();
      await routes['POST /api/agents/resource-group'](
        makeReq('POST', '/api/agents/resource-group', {
          agent: 'orchestrator',
          resourceGroup: 'none',
        }),
        clearRes,
      );

      assert.equal(clearRes.status, 200);
      assert.equal(clearRes.json().agent.resourceGroup, null);
      let cleared = await fs.readFile(path.join(agentsDir, 'orchestrator.md'), 'utf8');
      assert.doesNotMatch(cleared, /^resource_group:/m);
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });

  it('POST /api/chats/messages/page returns bounded chat message pages', async () => {
    let tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'agent-chat-page-route-'));
    let { StateGraph } = await import('../../src/node/state-graph.js');
    let { createProjectRoutes } = await import('../../src/node/server/api-routes-projects.js');
    let sg = new StateGraph({
      snapshotPath: path.join(tmpDir, 'state.json'),
      walPath: path.join(tmpDir, 'state.wal'),
      chatsDir: path.join(tmpDir, 'chats'),
      chatCacheLimit: 1,
    });

    try {
      let routes = createProjectRoutes({ ...makeRoutes(tmpDir), stateGraph: sg });
      let { id } = sg.createChat({ name: 'Paged route chat' }, 'test');
      for (let i = 0; i < 6; i++) {
        sg.appendChatMessage(id, { role: i % 2 ? 'assistant' : 'user', text: `route-message-${i}` });
      }

      let res = makeRes();
      await routes['POST /api/chats/messages/page'](
        makeReq('POST', '/api/chats/messages/page', { chatId: id, limit: 2 }),
        res,
      );

      assert.equal(res.status, 200);
      assert.deepEqual(res.json().messages.map((msg) => msg.text), ['route-message-4', 'route-message-5']);
      assert.equal(res.json().total, 6);
      assert.equal(res.json().start, 4);
      assert.equal(res.json().end, 6);
      assert.equal(res.json().hasBefore, true);
      assert.equal(res.json().hasAfter, false);

      let olderRes = makeRes();
      await routes['POST /api/chats/messages/page'](
        makeReq('POST', '/api/chats/messages/page', { id, before: 4, limit: 3 }),
        olderRes,
      );

      assert.equal(olderRes.status, 200);
      assert.deepEqual(olderRes.json().messages.map((msg) => msg.text), [
        'route-message-1',
        'route-message-2',
        'route-message-3',
      ]);

      let missingRes = makeRes();
      await routes['POST /api/chats/messages/page'](
        makeReq('POST', '/api/chats/messages/page', { chatId: 'missing-chat', limit: 2 }),
        missingRes,
      );
      assert.equal(missingRes.status, 404);

      let invalidRes = makeRes();
      await routes['POST /api/chats/messages/page'](
        makeReq('POST', '/api/chats/messages/page', { chatId: id, offset: -1, limit: 2 }),
        invalidRes,
      );
      assert.equal(invalidRes.status, 400);
      assert.match(invalidRes.json().error, /offset/);
    } finally {
      await sg.flushChatWrites();
      sg.flush();
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });

  it('POST /api/chats/get can return chat metadata without messages', async () => {
    let tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'agent-chat-meta-route-'));
    let { StateGraph } = await import('../../src/node/state-graph.js');
    let { createProjectRoutes } = await import('../../src/node/server/api-routes-projects.js');
    let sg = new StateGraph({
      snapshotPath: path.join(tmpDir, 'state.json'),
      walPath: path.join(tmpDir, 'state.wal'),
      chatsDir: path.join(tmpDir, 'chats'),
      chatCacheLimit: 1,
    });

    try {
      let routes = createProjectRoutes({ ...makeRoutes(tmpDir), stateGraph: sg });
      let { id } = sg.createChat({ name: 'Metadata chat', adapter: 'pool' }, 'test');
      sg.appendChatMessage(id, { role: 'user', text: 'first' });
      sg.appendChatMessage(id, { role: 'agent', text: 'second' });

      let metaRes = makeRes();
      await routes['POST /api/chats/get'](
        makeReq('POST', '/api/chats/get', { id, includeMessages: false }),
        metaRes,
      );

      assert.equal(metaRes.status, 200);
      assert.equal(metaRes.json().id, id);
      assert.equal(metaRes.json().messageCount, 2);
      assert.equal('messages' in metaRes.json(), false);

      let fullRes = makeRes();
      await routes['POST /api/chats/get'](
        makeReq('POST', '/api/chats/get', { id }),
        fullRes,
      );

      assert.equal(fullRes.status, 200);
      assert.deepEqual(fullRes.json().messages.map((msg) => msg.text), ['first', 'second']);
    } finally {
      await sg.flushChatWrites();
      sg.flush();
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });

  it('records XR diagnostics posted by browser clients', async () => {
    let { createRoutes } = await import('../../src/node/server/api-routes.js');
    let routes = createRoutes(makeRoutes('/tmp/project'));

    let req = makeReq('POST', '/api/xr-diagnostics/log', {
      clientId: 'quest-client-1',
      event: 'support-detected',
      pageUrl: 'http://192.168.1.20:51615/xr-diagnostics.html?token=must-not-leak#graph?authorization=must-not-leak',
      secureContext: false,
      navigatorXr: true,
      modes: { inline: true, immersiveVr: false, immersiveAr: false },
      launch: { canLaunch: false, reason: 'insecure-context' },
      surface: {
        surfaceKind: 'production',
        entrypoint: 'spatial-layout',
        projectId: 'agent-portal',
        targetSection: 'graph',
        panelContentKind: 'portal-runtime-layout',
      },
      session: {
        version: 'xr-three-session-telemetry-v1',
        status: 'running',
        mode: 'immersive-vr',
        active: false,
        visibilityState: 'visible',
        environmentBlendMode: 'opaque',
        interactionMode: 'world-space',
        enabledFeatures: ['local-floor', 'dom-overlay'],
        inputSources: [{ handedness: 'right', targetRayMode: 'tracked-pointer', profiles: ['oculus-touch'] }],
        sessionOptions: {
          referenceSpaceType: 'local-floor',
          optionalFeatures: ['local-floor', 'bounded-floor', 'dom-overlay'],
          requiredFeatures: [],
          domOverlay: true,
        },
        frames: 12,
        controllers: 1,
        controllerRayVisuals: 1,
        hitReticleVisuals: 1,
        renderState: { baseLayer: { present: true, framebufferWidth: 1832, framebufferHeight: 1920 } },
        viewports: { viewCount: 2 },
        materialDiagnostics: {
          total: 4,
          transparentCount: 0,
          mappedCount: 4,
          strictDiagnosticCount: 0,
          strictDiagnosticPanelIds: [],
        },
        selectedPanelId: 'front',
        hover: { panelId: 'front', point: { x: 0.4, y: 0.6 }, distance: 1.7, reticleVisible: true },
        drag: {
          active: false,
          panelId: 'front',
          frameTarget: { panelId: 'front', operation: 'resize', zone: 'resize', handle: 'east' },
          size: [1.4, 0.72],
          resize: { operation: 'resize', handle: 'east', size: [1.4, 0.72], delta: { x: 0.2, y: 0 } },
        },
        panelCount: 4,
        health: {
          version: 'xr-three-session-health-v1',
          status: 'warning',
          reason: 'low-fps',
          checks: { running: true, active: true, frames: 12, panelCount: 4, controllers: 1, fps: 38 },
          issues: [{ severity: 'warning', code: 'low-fps', value: 38 }],
        },
        token: 'must-not-leak',
      },
      details: {
        controller: { status: 'fallback', scene: { panelCount: 4 } },
        htmlCanvas: {
          supported: false,
          availability: 'origin-trial-or-flag-required',
          recommendation: 'enable-CanvasDrawElement',
          requiredFlag: 'CanvasDrawElement',
          renderTargetAvailable: false,
          textureUploadAvailable: false,
          missing: ['layoutsubtree', 'render-target-api'],
          blockingMissing: ['layoutsubtree', 'render-target-api'],
          missingCore: ['layoutsubtree', 'render-target-api'],
          missingTexture: ['texElementImage2D', 'copyElementImageToTexture'],
          threeTexture: {
            version: 'xr-three-texture-capability-v1',
            htmlTextureAvailable: false,
            htmlTextureUsable: false,
            textureUploadAvailable: false,
            ready: false,
            reason: 'html-in-canvas-texture-upload-missing',
            threeRevision: '184',
          },
          originTrial: {
            status: 'origin-trial',
            chromeMilestoneRange: '148-150',
            localTestBrowser: 'Chrome Canary 149+',
            flagUrl: 'chrome://flags/#canvas-draw-element',
            source: 'https://developer.chrome.com/blog/html-in-canvas-origin-trial',
          },
          enablement: {
            version: 'xr-html-in-canvas-enablement-v1',
            secureContext: true,
            originTrialMetaPresent: true,
            originTrialMetaCount: 1,
            originTrialTokenPresent: true,
            originTrialConfigured: true,
            requiredFlag: 'CanvasDrawElement',
            flagUrl: 'chrome://flags/#canvas-draw-element',
            source: 'https://developer.chrome.com/blog/html-in-canvas-origin-trial',
          },
          responseHeader: {
            checked: true,
            originTrialPresent: true,
            diagnosticHeader: 'html-in-canvas',
            token: 'must-not-leak',
          },
        },
        sceneQuality: {
          version: 'xr-scene-quality-summary-v1',
          status: 'warning',
          total: 4,
          lowQualityCount: 1,
          comfortWarningCount: 0,
          facingWarningCount: 1,
          panels: [
            {
              panelId: 'front',
              textureStatus: 'low',
              comfortStatus: 'ok',
              facingStatus: 'warning',
              pixelsPerMeter: 720,
              distance: 1.75,
              position: [0, 1.42, -1.75],
              rotation: [0, 0, 0],
            },
          ],
        },
        readiness: {
          version: 'xr-readiness-summary-v1',
          ready: false,
          running: false,
          status: 'blocked',
          reason: 'html-in-canvas-unsupported',
          mode: 'immersive-vr',
          blockingChecks: [
            { id: 'launch', status: 'blocked', reason: 'html-in-canvas-unsupported' },
            { id: 'html-canvas', status: 'origin-trial-or-flag-required', reason: 'enable-CanvasDrawElement' },
            { id: 'texture', status: 'blocked', reason: 'html-in-canvas-unsupported' },
          ],
        },
        visualReadiness: {
          version: 'xr-visual-agent-readiness-v1',
          ready: true,
          status: 'pass',
          reason: 'ready',
          expectedStatus: 'pass',
          issueIds: [],
          checks: [
            { id: 'visual-status', status: 'pass' },
            { id: 'visual-maps-present', status: 'pass' },
          ],
        },
        interactionReadiness: {
          version: 'xr-three-interaction-readiness-v1',
          ready: false,
          status: 'blocked',
          reason: 'texture-upload-ready',
          issueCodes: ['texture-upload-ready'],
          checks: [
            { id: 'texture-upload-ready', status: 'blocked', reason: 'html-in-canvas-unsupported' },
          ],
          frameTarget: { panelId: 'front', operation: 'resize', zone: 'resize', handle: 'east' },
        },
        texture: {
          strict: true,
          debugMode: {
            version: 'xr-texture-debug-mode-v1',
            mode: 'strict',
            strict: true,
            requireTextureUpload: true,
            hideStrictTextureFailures: true,
            allowMaterialFallback: false,
            reason: 'validate-live-html-textures',
          },
          total: 4,
          ready: 0,
          blocked: true,
          reason: 'html-in-canvas-unsupported',
          stage: 'html-in-canvas-support',
          requiredApi: ['layoutsubtree', 'render-target-api'],
          bridgeVersion: 'xr-three-panel-texture-bridge-v1',
          bridgeStages: [
            {
              panelId: 'front',
              stage: 'html-in-canvas-support',
              source: 'unsupported',
              mode: 'unsupported',
              ok: false,
              reason: 'html-in-canvas-unsupported',
              textureApplied: false,
            },
          ],
          resolverVersion: 'xr-three-html-canvas-texture-resolver-v1',
          resolverTextures: 0,
          resolverStages: [
            {
              panelId: 'front',
              stage: 'html-canvas-preview',
              ok: false,
              reason: 'html-in-canvas-unsupported',
              textureApplied: false,
              width: 1280,
              height: 720,
              mode: 'canvas2d',
            },
          ],
        },
        launchGate: {
          version: 'webxr-launch-gate-summary-v1',
          canStart: false,
          blocked: true,
          reason: 'html-in-canvas-unsupported',
          mode: 'immersive-vr',
          blockingChecks: [
            { id: 'strict-texture', reason: 'html-in-canvas-unsupported' },
          ],
        },
        deepGraph: {
          version: 'xr-deep-graph-diagnostics-v1',
          sceneVersion: 'xr-deep-graph-v1',
          nodeCount: 379,
          edgeCount: 304,
          connectedNodeCount: 320,
          orphanNodeCount: 59,
          maxDepth: 5,
          focusNodeId: 'src/node/server/demo-mode.js',
          focus: {
            nodeId: 'src/node/server/demo-mode.js',
            found: true,
            depth: 3,
            incoming: 2,
            outgoing: 3,
          },
          edgeTypes: {
            'project.import': 220,
            'project.export': 84,
          },
        },
        deepGraphPreview: {
          version: 'xr-deep-graph-preview-v1',
          nodes: 20,
          edges: 24,
          source: {
            nodeCount: 379,
            edgeCount: 304,
          },
          summary: {
            version: 'xr-deep-graph-preview-summary-v1',
            status: 'limited',
            nodes: {
              visible: 20,
              source: 379,
              hidden: 359,
              coverage: 0.0528,
              limit: 20,
            },
            edges: {
              visible: 24,
              source: 304,
              hidden: 280,
              coverage: 0.0789,
              limit: 60,
            },
            focus: {
              nodeId: 'src/node/server/demo-mode.js',
              visible: true,
              edges: {
                visible: 3,
                source: 5,
              },
            },
          },
        },
        token: 'must-not-leak',
      },
    });
    req.headers = {
      host: '192.168.1.20:51615',
      'user-agent': 'Quest Browser',
    };
    req.socket = { remoteAddress: '192.168.1.55' };
    let postRes = makeRes();
    await routes['POST /api/xr-diagnostics/log'](req, postRes);

    let getRes = makeRes();
    routes['GET /api/xr-diagnostics/logs'](makeReq('GET', '/api/xr-diagnostics/logs'), getRes);
    let summaryRes = makeRes();
    routes['GET /api/xr-diagnostics/summary'](makeReq('GET', '/api/xr-diagnostics/summary'), summaryRes);

    assert.equal(postRes.status, 200);
    assert.equal(postRes.json().entry.address, '192.168.1.55');
    assert.equal(postRes.json().entry.clientId, 'quest-client-1');
    assert.equal(getRes.status, 200);
    assert.equal(getRes.json().logs.at(-1).event, 'support-detected');
    assert.equal(getRes.json().logs.at(-1).launch.reason, 'insecure-context');
    assert.equal(getRes.json().logs.at(-1).session.status, 'running');
    assert.deepEqual(getRes.json().logs.at(-1).session.drag.size, [1.4, 0.72]);
    assert.equal(getRes.json().logs.at(-1).session.drag.resize.handle, 'east');
    assert.equal('token' in getRes.json().logs.at(-1).session, false);
    assert.equal(getRes.json().logs.at(-1).details.controller.scene.panelCount, 4);
    assert.equal('token' in getRes.json().logs.at(-1).details, false);
    assert.equal(summaryRes.status, 200);
    assert.equal(summaryRes.json().version, 'xr-diagnostics-summary-v1');
    assert.equal(summaryRes.json().count, 1);
    assert.equal(summaryRes.json().clientCount, 1);
    assert.equal(summaryRes.json().latest.clientId, 'quest-client-1');
    assert.equal(summaryRes.json().latest.pageUrl.includes('must-not-leak'), false);
    assert.equal(summaryRes.json().latest.pageUrl.includes('token=%5Bredacted%5D'), true);
    assert.equal(summaryRes.json().latest.pageUrl.includes('authorization=%5Bredacted%5D'), true);
    assert.equal(summaryRes.json().latestClient.clientId, 'quest-client-1');
    assert.equal(summaryRes.json().latestClient.eventCount, 1);
    assert.deepEqual(summaryRes.json().latestClient.attempts, {});
    assert.equal(summaryRes.json().latestClient.latestAttempt, null);
    assert.equal(typeof summaryRes.json().generatedAt, 'string');
    assert.equal(summaryRes.json().staleAfterMs, 15000);
    assert.equal(typeof summaryRes.json().latestClient.ageMs, 'number');
    assert.equal(summaryRes.json().latestClient.stale, false);
    assert.equal(summaryRes.json().latestClient.staleAfterMs, 15000);
    assert.equal(summaryRes.json().latestClient.phase, 'running');
    assert.equal(summaryRes.json().visualReadiness.status, 'pass');
    assert.equal(summaryRes.json().interactionReadiness.status, 'blocked');
    assert.equal(summaryRes.json().latestClient.visualReadiness.checks[0].id, 'visual-status');
    assert.equal(summaryRes.json().latestClient.interactionReadiness.issueCodes[0], 'texture-upload-ready');
    assert.equal(summaryRes.json().latestClient.interactionReadiness.frameTarget.handle, 'east');
    assert.equal(summaryRes.json().latestClient.session.status, 'running');
    assert.equal(summaryRes.json().latestClient.session.mode, 'immersive-vr');
    assert.equal(summaryRes.json().latestClient.session.frames, 12);
    assert.equal(summaryRes.json().latestClient.session.inputSources[0].targetRayMode, 'tracked-pointer');
    assert.equal(summaryRes.json().latestClient.session.sessionOptions.referenceSpaceType, 'local-floor');
    assert.equal(summaryRes.json().latestClient.session.hover.panelId, 'front');
    assert.equal(summaryRes.json().latestClient.session.health.status, 'warning');
    assert.equal(summaryRes.json().latestClient.session.health.issues[0].code, 'low-fps');
    assert.equal(summaryRes.json().latestClient.surface.surfaceKind, 'production');
    assert.equal(summaryRes.json().latestClient.surface.entrypoint, 'spatial-layout');
    assert.equal(summaryRes.json().latestClient.surface.projectId, 'agent-portal');
    assert.equal(summaryRes.json().latestClient.surface.targetSection, 'graph');
    assert.equal(summaryRes.json().latestClient.surface.panelContentKind, 'portal-runtime-layout');
    assert.equal(summaryRes.json().latest.surface.surfaceKind, 'production');
    assert.equal(summaryRes.json().latestClient.session.renderState.baseLayer.present, true);
    assert.equal(summaryRes.json().latestClient.session.viewports.viewCount, 2);
    assert.equal(summaryRes.json().latestClient.session.materialDiagnostics.mappedCount, 4);
    assert.equal(summaryRes.json().latestClient.session.materialDiagnostics.strictDiagnosticCount, 0);
    assert.equal('token' in summaryRes.json().latestClient.session, false);
    assert.equal(summaryRes.json().latestClient.htmlCanvas.availability, 'origin-trial-or-flag-required');
    assert.equal(summaryRes.json().latestClient.htmlCanvas.originTrial.flagUrl, 'chrome://flags/#canvas-draw-element');
    assert.equal(summaryRes.json().latestClient.htmlCanvas.enablement.originTrialMetaPresent, true);
    assert.equal(summaryRes.json().latestClient.htmlCanvas.enablement.originTrialMetaCount, 1);
    assert.equal(summaryRes.json().latestClient.htmlCanvas.enablement.originTrialConfigured, true);
    assert.equal('originTrialTokenPresent' in summaryRes.json().latestClient.htmlCanvas.enablement, false);
    assert.equal(summaryRes.json().latestClient.htmlCanvas.responseHeader.checked, true);
    assert.equal(summaryRes.json().latestClient.htmlCanvas.responseHeader.originTrialPresent, true);
    assert.equal(summaryRes.json().latestClient.htmlCanvas.responseHeader.diagnosticHeader, 'html-in-canvas');
    assert.equal('token' in summaryRes.json().latestClient.htmlCanvas.responseHeader, false);
    assert.equal(summaryRes.json().latestClient.htmlCanvas.textureUploadAvailable, false);
    assert.deepEqual(summaryRes.json().latestClient.htmlCanvas.missingCore, ['layoutsubtree', 'render-target-api']);
    assert.deepEqual(summaryRes.json().latestClient.htmlCanvas.missingTexture, ['texElementImage2D', 'copyElementImageToTexture']);
    assert.equal(summaryRes.json().latestClient.htmlCanvas.threeTexture.htmlTextureAvailable, false);
    assert.equal(summaryRes.json().latestClient.htmlCanvas.threeTexture.htmlTextureUsable, false);
    assert.equal(summaryRes.json().latestClient.htmlCanvas.threeTexture.reason, 'html-in-canvas-texture-upload-missing');
    assert.equal(summaryRes.json().htmlCanvas.availability, 'origin-trial-or-flag-required');
    assert.equal(summaryRes.json().latestClient.sceneQuality.status, 'warning');
    assert.equal(summaryRes.json().latestClient.sceneQuality.lowQualityCount, 1);
    assert.equal(summaryRes.json().latestClient.sceneQuality.facingWarningCount, 1);
    assert.equal(summaryRes.json().latestClient.sceneQuality.panels[0].panelId, 'front');
    assert.equal(summaryRes.json().sceneQuality.status, 'warning');
    assert.equal(summaryRes.json().latestClient.readiness.status, 'blocked');
    assert.equal(summaryRes.json().latestClient.readiness.reason, 'html-in-canvas-unsupported');
    assert.equal(summaryRes.json().latestClient.readiness.blockingChecks[1].id, 'html-canvas');
    assert.equal(summaryRes.json().readiness.status, 'blocked');
    assert.equal(summaryRes.json().latestClient.texture.stage, 'html-in-canvas-support');
    assert.equal(summaryRes.json().latestClient.texture.debugMode.mode, 'strict');
    assert.equal(summaryRes.json().latestClient.texture.debugMode.requireTextureUpload, true);
    assert.equal(summaryRes.json().latestClient.texture.ready, 0);
    assert.equal(summaryRes.json().latestClient.texture.total, 4);
    assert.deepEqual(summaryRes.json().latestClient.texture.requiredApi, ['layoutsubtree', 'render-target-api']);
    assert.equal(summaryRes.json().latestClient.texture.bridgeStages[0].panelId, 'front');
    assert.equal(summaryRes.json().latestClient.texture.resolverVersion, 'xr-three-html-canvas-texture-resolver-v1');
    assert.equal(summaryRes.json().latestClient.texture.resolverTextures, 0);
    assert.equal(summaryRes.json().latestClient.texture.resolverStages[0].stage, 'html-canvas-preview');
    assert.equal(summaryRes.json().latestClient.texture.resolverStages[0].width, 1280);
    assert.equal(summaryRes.json().texture.stage, 'html-in-canvas-support');
    assert.equal(summaryRes.json().latestClient.launchGate.reason, 'html-in-canvas-unsupported');
    assert.equal(summaryRes.json().latestClient.launchGate.blockingChecks[0].id, 'strict-texture');
    assert.equal(summaryRes.json().launchGate.reason, 'html-in-canvas-unsupported');
    assert.equal(summaryRes.json().latestClient.deepGraph.nodeCount, 379);
    assert.equal(summaryRes.json().latestClient.deepGraph.edgeCount, 304);
    assert.equal(summaryRes.json().latestClient.deepGraph.focus.nodeId, 'src/node/server/demo-mode.js');
    assert.equal(summaryRes.json().latestClient.deepGraph.focus.incoming, 2);
    assert.equal(summaryRes.json().latestClient.deepGraph.edgeTypes['project.import'], 220);
    assert.equal(summaryRes.json().deepGraph.focusNodeId, 'src/node/server/demo-mode.js');
    assert.equal(summaryRes.json().latestClient.deepGraphPreview.summary.status, 'limited');
    assert.equal(summaryRes.json().latestClient.deepGraphPreview.summary.focus.visible, true);
    assert.equal(summaryRes.json().latestClient.deepGraphPreview.summary.focus.edges.visible, 3);
    assert.equal(summaryRes.json().deepGraphPreview.summary.focus.nodeId, 'src/node/server/demo-mode.js');
    assert.equal(summaryRes.json().troubleshooting.version, 'xr-three-troubleshooting-summary-v1');
    assert.equal(summaryRes.json().troubleshooting.status, 'blocked');
    assert.equal(summaryRes.json().troubleshooting.primaryIssue.code, 'launch-gate-blocked');
    assert.ok(summaryRes.json().troubleshooting.issueCodes.includes('texture-gate-blocked'));
    assert.equal(summaryRes.json().troubleshooting.textureReady, 0);
    assert.equal(summaryRes.json().troubleshooting.textureTotal, 4);
    assert.deepEqual(summaryRes.json().latestClient.recentEvents.map((item) => item.event), ['support-detected']);
    assert.equal(summaryRes.json().latestClient.recentEvents[0].mode, 'immersive-vr');
    assert.equal(summaryRes.json().latestClient.recentEvents[0].htmlCanvasAvailability, 'origin-trial-or-flag-required');
    assert.equal(summaryRes.json().latestClient.recentEvents[0].htmlCanvasRecommendation, 'enable-CanvasDrawElement');
    assert.equal(summaryRes.json().latestClient.recentEvents[0].sceneQualityStatus, 'warning');
    assert.equal(summaryRes.json().latestClient.recentEvents[0].sceneQualityLowPanels, 1);
    assert.equal(summaryRes.json().latestClient.recentEvents[0].readinessStatus, 'blocked');
    assert.equal(summaryRes.json().latestClient.recentEvents[0].readinessReason, 'html-in-canvas-unsupported');
    assert.equal(summaryRes.json().latestClient.recentEvents[0].textureStage, 'html-in-canvas-support');
    assert.equal(summaryRes.json().latestClient.recentEvents[0].textureResolverStage, 'html-canvas-preview');
    assert.equal(summaryRes.json().latestClient.recentEvents[0].textureResolverReason, 'html-in-canvas-unsupported');
    assert.equal(summaryRes.json().latestClient.recentEvents[0].textureMode, 'strict');
    assert.equal(summaryRes.json().latestClient.recentEvents[0].launchGateReason, 'html-in-canvas-unsupported');
    assert.equal(summaryRes.json().latestClient.recentEvents[0].deepGraphNodes, 379);
    assert.equal(summaryRes.json().latestClient.recentEvents[0].deepGraphEdges, 304);
    assert.equal(summaryRes.json().latestClient.recentEvents[0].deepGraphFocus, 'src/node/server/demo-mode.js');
    assert.equal(summaryRes.json().latestClient.recentEvents[0].deepGraphPreviewStatus, 'limited');
    assert.equal(summaryRes.json().latestClient.recentEvents[0].deepGraphFocusVisible, true);
    assert.equal(summaryRes.json().immersiveClientCount, 1);
    assert.equal(summaryRes.json().latestImmersiveClient.clientId, 'quest-client-1');
    assert.equal(summaryRes.json().latest.event, 'support-detected');
    assert.equal(summaryRes.json().launch.reason, 'insecure-context');
    assert.equal(summaryRes.json().eventCounts['support-detected'], 1);
  });

  it('does not classify XR capability preflight as an immersive client', async () => {
    let { createRoutes } = await import('../../src/node/server/api-routes.js');
    let routes = createRoutes(makeRoutes('/tmp/project-preflight'));

    let req = makeReq('POST', '/api/xr-diagnostics/log', {
      clientId: 'quest-preflight-client',
      event: 'support-detected',
      pageUrl: 'https://playground.rnd-pro.com/demos/agent-portal-vr/#spatial?project=agent-portal&target=graph',
      secureContext: true,
      navigatorXr: true,
      modes: { inline: true, immersiveVr: true, immersiveAr: false },
      launch: { canLaunch: true, mode: 'immersive-vr', reason: 'ready' },
      surface: {
        surfaceKind: 'production',
        entrypoint: 'spatial-layout',
        projectId: 'agent-portal',
        targetSection: 'graph',
        panelContentKind: 'portal-runtime-layout',
      },
      session: {
        version: 'xr-three-session-telemetry-v1',
        status: 'preflight',
        mode: null,
        active: false,
        frames: 0,
      },
    });
    req.headers = {
      host: 'playground.rnd-pro.com',
      'user-agent': 'Quest Browser',
    };
    req.socket = { remoteAddress: '192.168.1.56' };

    let postRes = makeRes();
    await routes['POST /api/xr-diagnostics/log'](req, postRes);
    let summaryRes = makeRes();
    routes['GET /api/xr-diagnostics/summary'](makeReq('GET', '/api/xr-diagnostics/summary'), summaryRes);

    assert.equal(postRes.status, 200);
    assert.equal(summaryRes.status, 200);
    assert.equal(summaryRes.json().clientCount, 1);
    assert.equal(summaryRes.json().immersiveClientCount, 0);
    assert.equal(summaryRes.json().latestImmersiveClient, null);
    assert.equal(summaryRes.json().latestClient.session.status, 'preflight');
    assert.equal(summaryRes.json().latestClient.launch.mode, 'immersive-vr');
  });

  it('keeps XR render error messages in the sanitized timeline and attempt summary', async () => {
    let { createRoutes } = await import('../../src/node/server/api-routes.js');
    let routes = createRoutes(makeRoutes('/tmp/project-xr-render-error'));

    let req = makeReq('POST', '/api/xr-diagnostics/log', {
      clientId: 'quest-render-error-client',
      event: 'spatial-three-frame-error',
      pageUrl: 'https://playground.rnd-pro.com/demos/agent-portal-vr/#spatial?project=agent-portal',
      secureContext: true,
      navigatorXr: true,
      modes: { inline: true, immersiveVr: true, immersiveAr: false },
      surface: {
        surfaceKind: 'production',
        entrypoint: 'spatial-layout',
        projectId: 'agent-portal',
        targetSection: 'graph',
        panelContentKind: 'portal-runtime-layout',
      },
      session: {
        version: 'xr-three-session-telemetry-v1',
        status: 'running',
        mode: 'immersive-vr',
        active: true,
        frames: 24,
      },
      error: 'TypeError',
      details: {
        attemptId: 'spatial-client:render-error',
        failureStage: 'render',
        message: 'changed.includes is not a function',
        token: 'must-not-leak',
      },
    });
    req.headers = {
      host: 'playground.rnd-pro.com',
      'user-agent': 'Quest Browser',
    };
    req.socket = { remoteAddress: '192.168.1.57' };

    let postRes = makeRes();
    await routes['POST /api/xr-diagnostics/log'](req, postRes);
    let summaryRes = makeRes();
    routes['GET /api/xr-diagnostics/summary'](makeReq('GET', '/api/xr-diagnostics/summary'), summaryRes);

    let summary = summaryRes.json();
    assert.equal(postRes.status, 200);
    assert.equal(summary.latestClient.recentEvents[0].event, 'spatial-three-frame-error');
    assert.equal(summary.latestClient.recentEvents[0].failureStage, 'render');
    assert.equal(summary.latestClient.recentEvents[0].error, 'TypeError');
    assert.equal(summary.latestClient.recentEvents[0].errorMessage, 'changed.includes is not a function');
    assert.equal(summary.latestClient.latestAttempt.failureStage, 'render');
    assert.equal(summary.latestClient.latestAttempt.lastError, 'TypeError');
    assert.equal(summary.latestClient.latestAttempt.lastErrorMessage, 'changed.includes is not a function');
    assert.equal(JSON.stringify(summary).includes('must-not-leak'), false);
  });

  it('classifies production XR session startup and no-frame phases from spatial events', async () => {
    let { createRoutes } = await import('../../src/node/server/api-routes.js');
    let routes = createRoutes(makeRoutes('/tmp/project-production-xr-phase'));

    let base = {
      clientId: 'quest-starting-client',
      pageUrl: 'https://playground.rnd-pro.com/demos/agent-portal-vr/#spatial?project=agent-portal&target=graph',
      secureContext: true,
      navigatorXr: true,
      surface: {
        surfaceKind: 'production',
        entrypoint: 'spatial-layout',
        projectId: 'agent-portal',
        targetSection: 'graph',
        panelContentKind: 'portal-runtime-layout',
      },
    };
    let post = async (body) => {
      let req = makeReq('POST', '/api/xr-diagnostics/log', { ...base, ...body });
      req.headers = { host: 'playground.rnd-pro.com', 'user-agent': 'Quest Browser' };
      req.socket = { remoteAddress: '192.168.1.56' };
      let res = makeRes();
      await routes['POST /api/xr-diagnostics/log'](req, res);
      assert.equal(res.status, 200);
    };

    await post({
      event: 'spatial-enter-clicked',
      attemptId: 'quest-starting-client:1',
      session: { status: 'preflight', mode: 'immersive-vr', active: false, frames: 0 },
    });
    await post({
      event: 'spatial-three-session-start-intent',
      attemptId: 'quest-starting-client:1',
      session: { status: 'preflight', mode: 'immersive-vr', active: false, frames: 0 },
    });
    await post({
      event: 'spatial-three-session-start-requested',
      attemptId: 'quest-starting-client:1',
      session: { status: 'starting', mode: 'immersive-vr', active: false, frames: 0 },
    });
    let startingSummary = makeRes();
    routes['GET /api/xr-diagnostics/summary'](makeReq('GET', '/api/xr-diagnostics/summary'), startingSummary);
    assert.equal(startingSummary.json().latestClient.phase, 'starting');
    assert.equal(startingSummary.json().latestClient.recentEvents.at(-1).attemptId, 'quest-starting-client:1');
    assert.equal(startingSummary.json().latestClient.latestAttempt.attemptId, 'quest-starting-client:1');
    assert.deepEqual(startingSummary.json().latestClient.latestAttempt.events, [
      'spatial-enter-clicked',
      'spatial-three-session-start-intent',
      'spatial-three-session-start-requested',
    ]);
    assert.ok(startingSummary.json().latestClient.latestAttempt.stages.includes('spatial-three-session-start-intent'));

    await post({
      event: 'spatial-three-session-started',
      attemptId: 'quest-starting-client:1',
      session: { status: 'running', mode: 'immersive-vr', active: true, frames: 0 },
    });
    let runningSummary = makeRes();
    routes['GET /api/xr-diagnostics/summary'](makeReq('GET', '/api/xr-diagnostics/summary'), runningSummary);
    assert.equal(runningSummary.json().latestClient.phase, 'running');
    assert.equal(runningSummary.json().immersiveClientCount, 1);

    await post({
      event: 'spatial-session-frame-check',
      session: { status: 'running', mode: 'immersive-vr', active: true, frames: 0 },
    });
    let noFramesSummary = makeRes();
    routes['GET /api/xr-diagnostics/summary'](makeReq('GET', '/api/xr-diagnostics/summary'), noFramesSummary);
    assert.equal(noFramesSummary.json().latestClient.phase, 'no-frames');
  });

  it('POST /api/ui rejects non-UI state paths', async () => {
    let { createRoutes } = await import('../../src/node/server/api-routes.js');

    let routes = createRoutes(makeRoutes());

    let req = {
      on(event, cb) {
        if (event === 'data') cb(JSON.stringify({ path: 'settings/mcpServers', value: {} }));
        if (event === 'end') cb();
      },
    };
    let status;
    let payload;
    let res = {
      writeHead(code) { status = code; },
      end(body) { payload = JSON.parse(body); },
    };

    await routes['POST /api/ui'](req, res);

    assert.equal(status, 400);
    assert.match(payload.error, /Invalid UI state path/);
  });

  it('POST /api/agent-portal/file only writes editable public markdown or JSON content', async () => {
    let { createRoutes } = await import('../../src/node/server/api-routes.js');
    let tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'portal-agent-tree-'));
    let routes = createRoutes(makeRoutes(tmpDir));

    let okReq = makeReq('POST', '/api/agent-portal/file', {
      path: 'skills/code/example.md',
      content: '# Example\n',
    });
    let okRes = makeRes();
    await routes['POST /api/agent-portal/file'](okReq, okRes);

    assert.equal(okRes.status, 200);
    assert.equal(await fs.readFile(path.join(tmpDir, '.agent-portal/skills/code/example.md'), 'utf8'), '# Example\n');

    let workspaceReq = makeReq('POST', '/api/agent-portal/file', {
      path: 'workspace/demo/context.md',
      content: '# Demo\n',
    });
    let workspaceRes = makeRes();
    await routes['POST /api/agent-portal/file'](workspaceReq, workspaceRes);

    assert.equal(workspaceRes.status, 200);
    assert.equal(await fs.readFile(path.join(tmpDir, '.agent-portal/workspace/demo/context.md'), 'utf8'), '# Demo\n');

    let deniedReq = makeReq('POST', '/api/agent-portal/file', {
      path: 'runtime/state.json',
      content: '{}',
    });
    let deniedRes = makeRes();
    await routes['POST /api/agent-portal/file'](deniedReq, deniedRes);

    assert.equal(deniedRes.status, 400);
    assert.match(deniedRes.json().error, /not editable public|local portal state/);

    let unsafeReq = makeReq('POST', '/api/agent-portal/file', {
      path: 'skills/code/unsafe.md',
      content: `# Unsafe\n\n${['Bearer', 'abcdefghijklmnopqrstuvwxyz123456'].join(' ')}\n`,
    });
    let unsafeRes = makeRes();
    await routes['POST /api/agent-portal/file'](unsafeReq, unsafeRes);

    assert.equal(unsafeRes.status, 400);
    assert.match(unsafeRes.json().error, /bearer token|secrets or local paths/);
  });

  it('rejects .agent-portal file symlinks that escape the project portal root', async () => {
    let { createRoutes } = await import('../../src/node/server/api-routes.js');
    let tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'portal-agent-symlink-'));
    let outsideDir = await fs.mkdtemp(path.join(os.tmpdir(), 'portal-agent-outside-'));
    let skillDir = path.join(tmpDir, '.agent-portal/skills/code');
    await fs.mkdir(skillDir, { recursive: true });
    await fs.writeFile(path.join(outsideDir, 'secret.md'), '# secret\n');
    await fs.symlink(path.join(outsideDir, 'secret.md'), path.join(skillDir, 'leak.md'));

    let routes = createRoutes(makeRoutes(tmpDir));
    let readReq = makeReq('GET', '/api/agent-portal/file?path=skills%2Fcode%2Fleak.md');
    let readRes = makeRes();
    await routes['GET /api/agent-portal/file'](readReq, readRes);

    assert.equal(readRes.status, 400);
    assert.match(readRes.json().error, /must stay inside configured root/);

    let writeReq = makeReq('POST', '/api/agent-portal/file', {
      path: 'skills/code/leak.md',
      content: '# overwritten\n',
    });
    let writeRes = makeRes();
    await routes['POST /api/agent-portal/file'](writeReq, writeRes);

    assert.equal(writeRes.status, 400);
    assert.match(writeRes.json().error, /symbolic link/);
    assert.equal(await fs.readFile(path.join(outsideDir, 'secret.md'), 'utf8'), '# secret\n');
  });

  it('POST /api/agent-portal/open-library/install rejects non-public targets', async () => {
    let oldOpenLibrary = process.env.AGENT_PORTAL_OPEN_LIBRARY_DIR;
    let { createRoutes } = await import('../../src/node/server/api-routes.js');
    let tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'portal-agent-install-'));
    let libDir = await fs.mkdtemp(path.join(os.tmpdir(), 'portal-open-library-'));
    process.env.AGENT_PORTAL_OPEN_LIBRARY_DIR = libDir;
    await fs.mkdir(path.join(libDir, 'skills/code'), { recursive: true });
    await fs.writeFile(path.join(libDir, 'skills/code/example.md'), '# Example\n');
    let unsafeLocalPath = ['# Unsafe', '', ['', 'Users', 'alice', 'private'].join('/')].join('\n');
    await fs.writeFile(path.join(libDir, 'skills/code/unsafe.md'), `${unsafeLocalPath}\n`);

    try {
      let routes = createRoutes(makeRoutes(tmpDir));
      let req = makeReq('POST', '/api/agent-portal/open-library/install', {
        sourcePath: 'skills/code/example.md',
        targetPath: 'messages/example.md',
      });
      let res = makeRes();
      await routes['POST /api/agent-portal/open-library/install'](req, res);

      assert.equal(res.status, 400);
      assert.match(res.json().error, /not editable public|local portal state/);

      let unsafeReq = makeReq('POST', '/api/agent-portal/open-library/install', {
        sourcePath: 'skills/code/unsafe.md',
      });
      let unsafeRes = makeRes();
      await routes['POST /api/agent-portal/open-library/install'](unsafeReq, unsafeRes);

      assert.equal(unsafeRes.status, 400);
      assert.match(unsafeRes.json().error, /local home path|secrets or local paths/);
    } finally {
      if (oldOpenLibrary === undefined) delete process.env.AGENT_PORTAL_OPEN_LIBRARY_DIR;
      else process.env.AGENT_PORTAL_OPEN_LIBRARY_DIR = oldOpenLibrary;
    }
  });

  it('POST /api/agent-portal/open-library/install rejects source symlinks that escape the library root', async () => {
    let oldOpenLibrary = process.env.AGENT_PORTAL_OPEN_LIBRARY_DIR;
    let { createRoutes } = await import('../../src/node/server/api-routes.js');
    let tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'portal-agent-install-symlink-'));
    let libDir = await fs.mkdtemp(path.join(os.tmpdir(), 'portal-open-library-symlink-'));
    let outsideDir = await fs.mkdtemp(path.join(os.tmpdir(), 'portal-open-library-outside-'));
    process.env.AGENT_PORTAL_OPEN_LIBRARY_DIR = libDir;
    await fs.mkdir(path.join(libDir, 'skills/code'), { recursive: true });
    await fs.writeFile(path.join(outsideDir, 'secret.md'), '# secret\n');
    await fs.symlink(path.join(outsideDir, 'secret.md'), path.join(libDir, 'skills/code/leak.md'));

    try {
      let routes = createRoutes(makeRoutes(tmpDir));
      let req = makeReq('POST', '/api/agent-portal/open-library/install', {
        sourcePath: 'skills/code/leak.md',
      });
      let res = makeRes();
      await routes['POST /api/agent-portal/open-library/install'](req, res);

      assert.equal(res.status, 400);
      assert.match(res.json().error, /must stay inside configured root/);
    } finally {
      if (oldOpenLibrary === undefined) delete process.env.AGENT_PORTAL_OPEN_LIBRARY_DIR;
      else process.env.AGENT_PORTAL_OPEN_LIBRARY_DIR = oldOpenLibrary;
    }
  });

  it('GET /api/project-graph-metadata returns missing sidecar metadata', async () => {
    let { createRoutes } = await import('../../src/node/server/api-routes.js');
    let tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'portal-graph-metadata-'));
    let routes = createRoutes(makeRoutes(tmpDir));
    let req = makeReq('GET', '/api/project-graph-metadata');
    let res = makeRes();

    await routes['GET /api/project-graph-metadata'](req, res);

    assert.equal(res.status, 200);
    assert.deepEqual(res.json(), {
      ok: true,
      found: false,
      path: path.join(tmpDir, '.portal', 'project-graph.json'),
      metadata: { version: 1 },
    });
  });

  it('POST /api/project-graph-metadata validates and writes normalized metadata', async () => {
    let { createRoutes } = await import('../../src/node/server/api-routes.js');
    let tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'portal-graph-metadata-'));
    let routes = createRoutes(makeRoutes(tmpDir));
    let metadata = {
      version: 1,
      clusters: [
        { label: 'Web UI', color: '#7cc7ff', paths: ['web/'] },
      ],
    };
    let postReq = makeReq('POST', '/api/project-graph-metadata', { metadata });
    let postRes = makeRes();

    await routes['POST /api/project-graph-metadata'](postReq, postRes);

    assert.equal(postRes.status, 200);
    assert.equal(postRes.json().metadata.clusters[0].id, 'web-ui');

    let written = JSON.parse(await fs.readFile(path.join(tmpDir, '.portal', 'project-graph.json'), 'utf8'));
    assert.equal(written.clusters[0].id, 'web-ui');

    let getReq = makeReq('GET', '/api/project-graph-metadata');
    let getRes = makeRes();
    await routes['GET /api/project-graph-metadata'](getReq, getRes);
    assert.equal(getRes.json().found, true);
    assert.equal(getRes.json().metadata.clusters[0].label, 'Web UI');
  });

  it('POST /api/project-graph-metadata accepts MCP-compatible singular match fields', async () => {
    let { createRoutes } = await import('../../src/node/server/api-routes.js');
    let tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'portal-graph-metadata-'));
    let routes = createRoutes(makeRoutes(tmpDir));
    let req = makeReq('POST', '/api/project-graph-metadata', {
      metadata: { clusters: [{ label: 'Web UI', path: 'web/' }] },
    });
    let res = makeRes();

    await routes['POST /api/project-graph-metadata'](req, res);

    assert.equal(res.status, 200);
    assert.deepEqual(res.json().metadata.clusters[0].paths, ['web/']);
  });

  it('POST /api/project-graph-metadata writes normalized stories', async () => {
    let { createRoutes } = await import('../../src/node/server/api-routes.js');
    let tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'portal-graph-metadata-'));
    let routes = createRoutes(makeRoutes(tmpDir));
    let req = makeReq('POST', '/api/project-graph-metadata', {
      metadata: {
        stories: [
          {
            title: 'Compact Flow',
            beats: [
              {
                title: 'UI Request',
                description: 'Browser requests compact context.',
                cluster: 'web-dashboard',
                path: 'web/app.js',
                nodes: ['web/app.js'],
              },
            ],
          },
        ],
      },
    });
    let res = makeRes();

    await routes['POST /api/project-graph-metadata'](req, res);

    assert.equal(res.status, 200);
    assert.deepEqual(res.json().metadata.stories[0].beats[0], {
      id: 'ui-request',
      label: 'UI Request',
      narrative: 'Browser requests compact context.',
      nodes: ['web/app.js'],
      edges: [],
      clusterId: 'web-dashboard',
      focusPath: 'web/app.js',
    });
  });

  it('POST /api/project-graph-metadata rejects invalid story beats', async () => {
    let { createRoutes } = await import('../../src/node/server/api-routes.js');
    let tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'portal-graph-metadata-'));
    let routes = createRoutes(makeRoutes(tmpDir));
    let req = makeReq('POST', '/api/project-graph-metadata', {
      metadata: {
        stories: [
          {
            label: 'Bad Flow',
            beats: [{ label: 'Bad Beat', nodes: [42] }],
          },
        ],
      },
    });
    let res = makeRes();

    await routes['POST /api/project-graph-metadata'](req, res);

    assert.equal(res.status, 400);
    assert.match(res.json().error, /beats\[0\]\.nodes must be an array/);
  });

  it('POST /api/project-graph-metadata rejects invalid cluster definitions', async () => {
    let { createRoutes } = await import('../../src/node/server/api-routes.js');
    let tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'portal-graph-metadata-'));
    let routes = createRoutes(makeRoutes(tmpDir));
    let req = makeReq('POST', '/api/project-graph-metadata', {
      metadata: { clusters: [{ label: 'Missing Paths' }] },
    });
    let res = makeRes();

    await routes['POST /api/project-graph-metadata'](req, res);

    assert.equal(res.status, 400);
    assert.match(res.json().error, /must define at least one path/);
  });

  it('POST /api/project-graph-metadata rejects non-root project paths', async () => {
    let { createRoutes } = await import('../../src/node/server/api-routes.js');
    let tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'portal-graph-metadata-'));
    let nestedDir = path.join(tmpDir, 'packages', 'project-graph-mcp');
    let routes = createRoutes(makeRoutes(tmpDir));
    let req = makeReq('POST', '/api/project-graph-metadata', {
      projectPath: nestedDir,
      metadata: { clusters: [{ label: 'Nested', paths: ['src/'] }] },
    });
    let res = makeRes();

    await routes['POST /api/project-graph-metadata'](req, res);

    assert.equal(res.status, 400);
    assert.match(res.json().error, /projectPath must match/);
    await assert.rejects(
      fs.readFile(path.join(nestedDir, '.portal', 'project-graph.json'), 'utf8'),
      /ENOENT/,
    );
  });

  it('GET /api/project-graph-metadata rejects non-root projectPath query', async () => {
    let { createRoutes } = await import('../../src/node/server/api-routes.js');
    let tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'portal-graph-metadata-'));
    let nestedDir = path.join(tmpDir, 'packages', 'project-graph-mcp');
    let routes = createRoutes(makeRoutes(tmpDir));
    let req = makeReq(
      'GET',
      `/api/project-graph-metadata?projectPath=${encodeURIComponent(nestedDir)}`,
    );
    let res = makeRes();

    await routes['GET /api/project-graph-metadata'](req, res);

    assert.equal(res.status, 400);
    assert.match(res.json().error, /projectPath must match/);
  });

  it('GET /api/project-graph-metadata accepts root path query with trailing slash', async () => {
    let { createRoutes } = await import('../../src/node/server/api-routes.js');
    let tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'portal-graph-metadata-'));
    let routes = createRoutes(makeRoutes(tmpDir));
    let req = makeReq(
      'GET',
      `/api/project-graph-metadata?path=${encodeURIComponent(`${tmpDir}/`)}`,
    );
    let res = makeRes();

    await routes['GET /api/project-graph-metadata'](req, res);

    assert.equal(res.status, 200);
    assert.equal(res.json().path, path.join(tmpDir, '.portal', 'project-graph.json'));
  });
});
