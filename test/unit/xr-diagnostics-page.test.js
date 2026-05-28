import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

test('XR diagnostics page is a standalone public-provider harness', () => {
  let html = fs.readFileSync(path.join(ROOT, 'web/xr-diagnostics.html'), 'utf8');
  let script = fs.readFileSync(path.join(ROOT, 'web/xr-diagnostics.js'), 'utf8');

  assert.ok(html.includes('symbiote-node/xr'), 'diagnostic page must import XR through a public provider specifier');
  assert.ok(html.includes('"iwer": "/vendor/iwer/build/iwer.module.js?v=iwer-2-2-1"'), 'diagnostic page must expose the reviewed IWER browser bundle');
  assert.ok(html.includes('"@iwer/devui": "/vendor/iwer-devui/build/iwer-devui.module.js?v=devui-1-1-2"'), 'diagnostic page must expose the reviewed IWER DevUI browser bundle');
  assert.ok(html.includes('/packages/symbiote-node/themes/default-provider.css'), 'diagnostic page must use the provider theme');
  assert.ok(html.includes('class="panel"'), 'diagnostic page must include visible DOM panel probes');
  assert.ok(html.includes('id="emulate"'), 'diagnostic page must provide an explicit IWER install action');
  assert.ok(script.includes("from 'symbiote-node/xr'"), 'diagnostic script must consume public provider exports');
  assert.ok(script.includes("import('iwer')"), 'diagnostic script must use the reviewed IWER import map specifier');
  assert.ok(script.includes("import('@iwer/devui')"), 'diagnostic script must use the reviewed DevUI import map specifier');
  assert.ok(script.includes('createWebXRLaunchRecommendation'), 'diagnostic script must use provider launch diagnostics');
  assert.ok(script.includes('installWebXREmulationRuntime'), 'diagnostic script must install IWER through the provider emulation adapter');
  assert.ok(script.includes('requestWebXRSession'), 'diagnostic script must request sessions through the provider adapter');
  assert.ok(script.includes('createWebXRLayer'), 'diagnostic script must test the WebGL XR layer path');
  assert.equal(script.includes('packages/symbiote-node'), false, 'diagnostic script must not deep-import provider files');
  assert.equal(script.includes('navigator.userAgent'), false, 'diagnostic script must not sniff browser versions');
});

test('XR empty panels baseline starts from world-space panels before live UI', () => {
  let html = fs.readFileSync(path.join(ROOT, 'web/xr-panels-baseline.html'), 'utf8');
  let script = fs.readFileSync(path.join(ROOT, 'web/xr-panels-baseline.js'), 'utf8');

  assert.ok(html.includes('symbiote-node/xr'), 'empty panel baseline must import XR through a public provider specifier');
  assert.ok(html.includes('/packages/symbiote-node/themes/default-provider.css'), 'empty panel baseline must use the provider theme');
  assert.ok(html.includes('XR Empty Panels Baseline'), 'page must be clearly scoped to empty panels');
  assert.ok(html.includes('src="xr-panels-baseline.js"'), 'empty panel baseline script must load inside the public demo route prefix');
  assert.ok(script.includes("from 'symbiote-node/xr'"), 'empty panel baseline must consume public provider exports');
  assert.ok(script.includes('createXRWebGLLayerPanelRenderer'), 'empty panel baseline must render XRWebGLLayer panels through the provider renderer');
  assert.ok(script.includes('empty-panels-session-started'), 'empty panel baseline must log server diagnostics');
  assert.ok(script.includes("surfaceKind: 'harness'"), 'empty panel baseline diagnostics must be classified as a non-production harness');
  assert.ok(script.includes("entrypoint: 'xr-panels-baseline'"), 'empty panel baseline diagnostics must expose a stable harness entrypoint');
  assert.ok(script.includes("panelContentKind: 'empty-frame-baseline'"), 'empty panel baseline must not look like live production panel content');
  assert.ok(script.includes("['Production', 'no']"), 'empty panel baseline must visibly mark itself as non-production');
  assert.ok(script.includes('XRWebGLLayer'), 'empty panel baseline must test the XRWebGLLayer path');
  assert.ok(script.includes('panels = ['), 'empty panel baseline must define provider-neutral panels');
  assert.ok(script.includes('WEBXR_MODES.immersiveAr'), 'empty panel baseline must prefer AR when supported');
  assert.equal(script.includes('createXRDeepGraphScene'), false, 'empty panel baseline must not depend on deep graph mode');
  for (let helper of [
    'function compileShader',
    'function createProgram',
    'function multiply',
    'function modelMatrix',
    'function setupRenderer',
    'function renderPanel',
    'function renderFrame',
  ]) {
    assert.equal(script.includes(helper), false, `empty panel baseline must not own raw renderer helper ${helper}`);
  }
  assert.equal(script.includes('packages/symbiote-node'), false, 'empty panel script must not deep-import provider files');
  assert.equal(script.includes('navigator.userAgent'), false, 'empty panel baseline must not sniff browser versions');
});

test('XR visual audit page exposes agent-readable emulation checks', () => {
  let html = fs.readFileSync(path.join(ROOT, 'web/xr-visual-audit.html'), 'utf8');
  let script = fs.readFileSync(path.join(ROOT, 'web/xr-visual-audit.js'), 'utf8');

  assert.ok(html.includes('XR Visual Audit'), 'visual audit page must be clearly scoped');
  assert.ok(html.includes('"symbiote-node/xr": "/packages/symbiote-node/xr/index.js"'), 'visual audit must import XR through the public provider entrypoint');
  assert.ok(html.includes('"iwer": "/vendor/iwer/build/iwer.module.js?v=iwer-2-2-1"'), 'visual audit must expose the reviewed IWER browser bundle');
  assert.ok(html.includes('"@iwer/devui": "/vendor/iwer-devui/build/iwer-devui.module.js?v=devui-1-1-2"'), 'visual audit must expose the reviewed IWER DevUI bundle');
  assert.ok(html.includes('/packages/symbiote-node/themes/default-provider.css'), 'visual audit must inherit the provider theme');
  assert.ok(html.includes('id="top-view"'), 'visual audit must expose a top-view spatial projection');
  assert.ok(html.includes('id="front-view"'), 'visual audit must expose a front-view spatial projection');
  assert.ok(html.includes('id="panel-map"'), 'visual audit must expose machine-readable panel maps');
  assert.ok(html.includes('id="checks"'), 'visual audit must expose machine-readable checks');
  assert.ok(html.includes('id="agent-report"'), 'visual audit must expose an agent-readable report');
  assert.ok(script.includes("from 'symbiote-node/xr'"), 'visual audit script must consume public provider exports');
  assert.ok(script.includes('createXRVisualTestSummary'), 'visual audit must use provider-owned visual summaries');
  assert.ok(script.includes('createXRVisualAgentReadinessSummary'), 'visual audit must use provider-owned agent readiness summaries');
  assert.ok(script.includes('createXRSpatialScene'), 'visual audit must project runtime layout through provider spatial scene data');
  assert.ok(script.includes('createWebXREmulationAdapter'), 'visual audit must install IWER through the provider emulation adapter');
  assert.ok(script.includes('window.__xrVisualAuditReport'), 'visual audit must expose a stable browser-readable report object');
  assert.ok(script.includes('document.body.dataset.visualAuditStatus'), 'visual audit must expose status through body data attributes');
  assert.ok(script.includes('topPanelShapes'), 'visual audit report must include non-empty top-view shape counts');
  assert.ok(script.includes('frontPanelShapes'), 'visual audit report must include non-empty front-view shape counts');
  assert.ok(script.includes("window.addEventListener('error'"), 'visual audit must collect page errors for agent inspection');
  assert.ok(script.includes("window.addEventListener('unhandledrejection'"), 'visual audit must collect rejected promises for agent inspection');
  assert.ok(script.includes('pageErrors'), 'visual audit report must expose page errors');
  assert.ok(script.includes('EXPECTED_CASE_ISSUES'), 'visual audit must verify stable expected issue ids per case');
  assert.ok(script.includes('report.readiness'), 'visual audit agent report must include provider readiness verdict');
  assert.ok(script.includes("import('iwer')"), 'visual audit must use the reviewed IWER import map specifier');
  assert.ok(script.includes("import('@iwer/devui')"), 'visual audit must use the reviewed DevUI import map specifier');
  for (let auditCase of ['baseline', 'overlap', 'bad-facing', 'too-high', 'low-texture', 'missing-controls']) {
    assert.ok(html.includes(`value="${auditCase}"`) || script.includes(`'${auditCase}'`), `visual audit must include ${auditCase} case`);
  }
  assert.ok(script.includes('/api/xr-diagnostics/log'), 'visual audit must post sanitized server diagnostics when available');
  assert.equal(script.includes('packages/symbiote-node'), false, 'visual audit script must not deep-import provider files');
  assert.equal(script.includes('navigator.userAgent'), false, 'visual audit must not sniff browser versions');
});

test('XR visual smoke script captures live browser reports without new dependencies', () => {
  let script = fs.readFileSync(path.join(ROOT, 'scripts/diagnostics/xr-visual-agent-smoke.js'), 'utf8');
  let pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));

  assert.equal(pkg.scripts['xr:visual-smoke'], 'node scripts/diagnostics/xr-visual-agent-smoke.js');
  assert.ok(script.includes('emulate: true'), 'visual smoke must use explicit local XR emulation by default');
  assert.ok(script.includes('--no-emulate'), 'visual smoke must expose explicit opt-out for non-emulated checks');
  assert.ok(script.includes('report.emulation?.installed !== true'), 'visual smoke must verify requested emulation was installed');
  assert.ok(script.includes('window.__xrVisualAuditReport'), 'smoke must read the live browser report');
  assert.ok(script.includes('Page.captureScreenshot'), 'smoke must support optional screenshot artifacts');
  assert.ok(script.includes('--screenshots'), 'smoke must expose screenshot capture as an explicit option');
  assert.ok(script.includes('--report'), 'smoke must expose a report path for persisted agent artifacts');
  assert.ok(script.includes('report.json'), 'smoke must write a default JSON report next to screenshots');
  assert.ok(script.includes('readPngSize'), 'smoke must validate screenshot PNG dimensions');
  assert.ok(script.includes('reportPath'), 'smoke output must include the persisted report path');
  assert.ok(script.includes('fs.writeFileSync(reportPath'), 'smoke must persist the final JSON report');
  assert.ok(script.includes('screenshotInvalid'), 'smoke must fail invalid screenshot artifacts');
  assert.ok(script.includes('--enable-unsafe-swiftshader'), 'smoke must support headless IWER WebGL checks');
  assert.ok(script.includes('--use-gl=swiftshader'), 'smoke must provide a software WebGL context in headless Chrome');
  assert.ok(script.includes('topPanelShapes'), 'smoke must verify top-view visual map shape counts');
  assert.ok(script.includes('frontPanelShapes'), 'smoke must verify front-view visual map shape counts');
  assert.ok(script.includes('pageErrorCount === 0'), 'smoke must fail on page errors');
  assert.ok(script.includes('readinessInvalid'), 'smoke must fail when provider agent readiness is not ready');
  assert.ok(script.includes('emulationInvalid'), 'smoke must fail when requested emulation is not active');
  assert.equal(script.includes('playwright'), false, 'smoke must not add Playwright as a hidden dependency');
  assert.equal(script.includes('puppeteer'), false, 'smoke must not add Puppeteer as a hidden dependency');
});

test('XR Three baseline smoke verifies runtime visual readiness without new dependencies', () => {
  let script = fs.readFileSync(path.join(ROOT, 'scripts/diagnostics/xr-three-baseline-smoke.js'), 'utf8');
  let pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));

  assert.equal(pkg.scripts['xr:three-smoke'], 'node scripts/diagnostics/xr-three-baseline-smoke.js');
  assert.ok(script.includes('xr-three-panels-baseline.html'), 'smoke must load the Three runtime baseline page');
  assert.ok(script.includes('XR visual readiness'), 'smoke must verify provider visual readiness row');
  assert.ok(script.includes('XR visual readiness checks'), 'smoke must verify provider visual readiness checks row');
  assert.ok(script.includes('XR interaction readiness'), 'smoke must verify provider interaction readiness row');
  assert.ok(script.includes('XR interaction checks'), 'smoke must verify provider interaction readiness checks row');
  assert.ok(script.includes('Server visual readiness'), 'smoke must wait for server-confirmed visual readiness row');
  assert.ok(script.includes('Server interaction readiness'), 'smoke must wait for server-confirmed interaction readiness row');
  assert.ok(script.includes('Texture strict'), 'smoke must require strict texture diagnostics');
  assert.ok(script.includes("textureStrict === 'required'"), 'smoke must fail when strict texture mode is not active');
  assert.ok(script.includes("textureReady === '4/4'"), 'smoke must fail unless all live textures are ready');
  assert.ok(script.includes("textureBlockReason === '-'"), 'smoke must fail when texture readiness reports a block reason');
  assert.ok(script.includes("textureApplied === '4/4'"), 'smoke must fail unless all Three textures are applied');
  assert.ok(script.includes("strictDiagnosticPanels === '-'"), 'smoke must fail when strict mode rendered provider diagnostic panels');
  assert.ok(script.includes("interactionReadiness === 'ready:ready'"), 'smoke must fail when local interaction readiness is blocked');
  assert.ok(script.includes("serverInteractionReadiness === 'ready:ready'"), 'smoke must fail when server interaction readiness is blocked');
  assert.ok(script.includes('REQUIRED_ROWS'), 'smoke must keep local and public diagnostics row gates aligned');
  assert.ok(script.includes('missingRows'), 'smoke must report missing diagnostics rows instead of only throwing');
  assert.ok(script.includes('missing-diagnostics-rows'), 'smoke must classify stale public pages with a stable stage');
  assert.ok(script.includes('deploy-current-xr-baseline'), 'smoke must tell agents when the public baseline is stale');
  assert.ok(script.includes('pageTitle'), 'smoke report must include page title for stale public pages');
  assert.ok(script.includes('bodySnippet'), 'smoke report must include a redacted page body snippet for stale public pages');
  assert.ok(script.includes('Runtime.exceptionThrown'), 'smoke must fail on runtime exceptions');
  assert.ok(script.includes('Runtime.consoleAPICalled'), 'smoke must fail on console errors');
  assert.ok(script.includes('Log.entryAdded'), 'smoke must fail on browser log errors');
  assert.ok(script.includes('pageErrorCount'), 'smoke report must include page error count');
  assert.ok(script.includes('pass:ready'), 'smoke must require a ready provider verdict');
  assert.ok(script.includes('livePanelCount === 4'), 'smoke must verify the live panel source count');
  assert.ok(script.includes('--enable-unsafe-swiftshader'), 'smoke must support headless WebGL checks');
  assert.ok(script.includes('report.json'), 'smoke must persist an ignored JSON report by default');
  assert.equal(script.includes('playwright'), false, 'Three smoke must not add Playwright as a hidden dependency');
  assert.equal(script.includes('puppeteer'), false, 'Three smoke must not add Puppeteer as a hidden dependency');
});

test('XR production spatial smoke verifies the production route instead of a harness page', () => {
  let script = fs.readFileSync(path.join(ROOT, 'scripts/diagnostics/xr-production-spatial-smoke.js'), 'utf8');
  let pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));

  assert.equal(pkg.scripts['xr:production-smoke'], 'node scripts/diagnostics/xr-production-spatial-smoke.js');
  assert.ok(script.includes('#spatial?'), 'production smoke must open the SpatialLayout route');
  assert.ok(script.includes("project: 'agent-portal'"), 'production smoke must default to the public Agent Portal project');
  assert.ok(script.includes("target: 'graph'"), 'production smoke must default to graph as the projected section');
  assert.ok(script.includes("texture: 'strict'"), 'production smoke must verify strict production texture mode');
  assert.ok(script.includes("surfaceKind === 'production'"), 'production smoke must require production diagnostics');
  assert.ok(script.includes("entrypoint === 'spatial-layout'"), 'production smoke must reject baseline harness diagnostics');
  assert.ok(script.includes('live-panels'), 'production smoke must fail when live runtime panels are not mounted');
  assert.ok(script.includes('three-rendered-panels'), 'production smoke must fail when Three panels are not rendered');
  assert.ok(script.includes('no-diagnostic-panels'), 'production smoke must fail when strict diagnostic panels replace live textures');
  assert.ok(script.includes('inspect-production-texture-upload'), 'production smoke must route diagnostic panel failures to texture upload work');
  assert.ok(script.includes('launch-texture-gate-separated'), 'production smoke must ensure WebXR launch is not blocked by live texture readiness');
  assert.ok(script.includes('inspect-production-launch-texture-separation'), 'production smoke must report launch/texture coupling regressions explicitly');
  assert.ok(script.includes('missingRows'), 'production smoke must report stale or incomplete public pages with missing rows');
  assert.equal(script.includes('xr-three-panels-baseline.html'), false, 'production smoke must not target the Three harness page');
  assert.equal(script.includes('xr-panels-baseline.html'), false, 'production smoke must not target the empty-panel harness page');
  assert.equal(script.includes('playwright'), false, 'production smoke must not add Playwright as a hidden dependency');
  assert.equal(script.includes('puppeteer'), false, 'production smoke must not add Puppeteer as a hidden dependency');
});

test('XR headset summary smoke verifies server-confirmed headset diagnostics', () => {
  let script = fs.readFileSync(path.join(ROOT, 'scripts/diagnostics/xr-headset-summary-smoke.js'), 'utf8');
  let pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  let tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'xr-headset-summary-test-'));
  let fixturePath = path.join(tempDir, 'summary.json');
  let reportPath = path.join(tempDir, 'report.json');

  fs.writeFileSync(fixturePath, JSON.stringify({
    version: 'xr-diagnostics-summary-v1',
    clientCount: 1,
    immersiveClientCount: 1,
    latestClient: { clientId: 'quest-client' },
    latestImmersiveClient: { clientId: 'quest-client' },
    clients: [
      {
        clientId: 'quest-client',
        stale: false,
        ageMs: 200,
        phase: 'running',
        modes: { immersiveVr: true },
        session: {
          active: true,
          status: 'running',
          mode: 'immersive-vr',
          frames: 42,
          panelCount: 4,
          renderState: { baseLayer: { present: true, framebufferWidth: 1832, framebufferHeight: 1920 } },
          viewports: { viewCount: 2 },
          materialDiagnostics: {
            total: 4,
            mappedCount: 4,
            transparentCount: 0,
            strictDiagnosticCount: 0,
            strictDiagnosticPanelIds: [],
          },
          health: { checks: { frames: 42, panelCount: 4 } },
        },
        surface: {
          surfaceKind: 'production',
          entrypoint: 'spatial-layout',
          projectId: 'agent-portal',
          targetSection: 'graph',
          panelContentKind: 'portal-runtime-layout',
        },
        visualReadiness: { status: 'pass', reason: 'ready', checks: [{ id: 'visual-status', status: 'pass' }] },
        interactionReadiness: { ready: false, status: 'blocked', reason: 'texture-upload-ready', issueCodes: ['texture-upload-ready'] },
        texture: { ready: 4, total: 4, reason: null },
        htmlCanvas: {
          availability: 'origin-trial-or-flag-required',
          threeTexture: { htmlTextureAvailable: true, ready: true, threeRevision: '184' },
        },
        recentEvents: [
          { event: 'spatial-enter-clicked', receivedAt: '2026-05-27T10:00:00.000Z', mode: 'immersive-vr' },
          { event: 'spatial-three-session-start-requested', receivedAt: '2026-05-27T10:00:01.000Z', mode: 'immersive-vr' },
          { event: 'spatial-three-session-started', receivedAt: '2026-05-27T10:00:02.000Z', mode: 'immersive-vr', status: 'running' },
          { event: 'spatial-three-frame', receivedAt: '2026-05-27T10:00:03.000Z', mode: 'immersive-vr', status: 'running' },
        ],
      },
    ],
    eventCounts: {
      'spatial-enter-clicked': 1,
      'spatial-three-session-start-requested': 1,
      'spatial-three-session-started': 1,
      'spatial-three-frame': 1,
    },
  }));

  assert.equal(pkg.scripts['xr:headset-summary'], 'node scripts/diagnostics/xr-headset-summary-smoke.js');
  assert.equal(
    pkg.scripts['xr:headset-wait'],
    'node scripts/diagnostics/xr-headset-summary-smoke.js --wait-ms 120000 --interval-ms 2000'
  );
  assert.ok(script.includes('/api/xr-diagnostics/summary'), 'headset smoke must read the sanitized server summary API');
  assert.ok(script.includes('createXRThreeDiagnosticServerSummary'), 'headset smoke must use provider server summary normalization');
  assert.ok(script.includes('createXRThreeTroubleshootingSummary'), 'headset smoke must use provider troubleshooting classification');
  assert.ok(script.includes('requireImmersive'), 'headset smoke must gate headset clients by immersive state');
  assert.ok(script.includes('requireFrames'), 'headset smoke must gate headset clients by frame production');
  assert.ok(script.includes('requireVisualReady'), 'headset smoke must gate headset clients by visual readiness');
  assert.ok(script.includes('--wait-ms'), 'headset smoke must support waiting for a fresh headset client');
  assert.ok(script.includes('--interval-ms'), 'headset smoke must expose polling interval control');
  assert.ok(script.includes('while (Date.now() - startedAt < options.waitMs)'), 'headset smoke must poll until timeout or pass');
  assert.ok(script.includes('attempts'), 'headset smoke report must expose polling attempts');
  assert.ok(script.includes('timedOut'), 'headset smoke report must expose wait timeout state');
  assert.ok(script.includes('deadlineMs'), 'headset smoke report must expose wait deadline');
  assert.ok(script.includes('wait-timeout'), 'headset smoke must classify wait timeout as a failed check');
  assert.ok(script.includes('deriveNextAction'), 'headset smoke must expose a machine-readable next action');
  assert.ok(script.includes('summaryClientCount'), 'headset smoke must expose server client counts');
  assert.ok(script.includes('summaryImmersiveClientCount'), 'headset smoke must expose immersive client counts');
  assert.ok(script.includes('requestSessionTrail'), 'headset smoke must expose the Quest launch event trail');
  assert.ok(script.includes('spatial-three-session-start-requested'), 'headset smoke must distinguish requestSession attempts');
  assert.ok(script.includes('inspect-request-session-error'), 'headset smoke must guide agents to requestSession failures');
  assert.ok(script.includes('open-xr-demo-page'), 'headset smoke must direct agents to open the XR page when no diagnostic client exists');
  assert.ok(script.includes('check-requested-diagnostic-client'), 'headset smoke must distinguish missing explicit client ids');
  assert.ok(script.includes('production-surface'), 'headset smoke must require production SpatialLayout diagnostics by default');
  assert.ok(script.includes('--allow-harness'), 'headset smoke must allow explicit harness diagnostics when requested');
  assert.ok(script.includes('open-production-spatial-url'), 'headset smoke must guide agents to the production spatial URL when harness data is selected');
  assert.ok(script.includes('sanitizeErrorMessage'), 'headset smoke must sanitize fetch errors before writing reports');
  assert.ok(script.includes('lastErrorName'), 'headset smoke report must expose sanitized error metadata');
  assert.equal(script.includes('playwright'), false, 'headset smoke must not add Playwright as a hidden dependency');
  assert.equal(script.includes('puppeteer'), false, 'headset smoke must not add Puppeteer as a hidden dependency');

  let output = execFileSync(process.execPath, [
    path.join(ROOT, 'scripts/diagnostics/xr-headset-summary-smoke.js'),
    '--fixture',
    fixturePath,
    '--report',
    reportPath,
  ], { cwd: ROOT, encoding: 'utf8' });
  let report = JSON.parse(output);

  assert.equal(report.ok, true);
  assert.equal(report.version, 'xr-headset-summary-smoke-v1');
  assert.equal(report.summaryClientCount, 1);
  assert.equal(report.summaryImmersiveClientCount, 1);
  assert.equal(report.selectedClientId, 'quest-client');
  assert.equal(report.latestEvent, 'spatial-three-frame');
  assert.equal(report.recentEvents.length, 4);
  assert.equal(report.requestSessionTrail.enterClicked, true);
  assert.equal(report.requestSessionTrail.sessionStartRequested, true);
  assert.equal(report.requestSessionTrail.sessionStarted, true);
  assert.equal(report.requestSessionTrail.framesSeen, true);
  assert.equal(report.eventCounts['spatial-three-session-start-requested'], 1);
  assert.match(report.recentEventTrailText, /spatial-three-session-start-requested/);
  assert.equal(report.frames, 42);
  assert.equal(report.panels, 4);
  assert.equal(report.surfaceKind, 'production');
  assert.equal(report.entrypoint, 'spatial-layout');
  assert.equal(report.projectId, 'agent-portal');
  assert.equal(report.targetSection, 'graph');
  assert.equal(report.visualReadiness, 'pass:ready');
  assert.equal(report.interactionReadiness, 'blocked:texture-upload-ready');
  assert.equal(report.threeHtmlTexture, 'available:184');
  assert.equal(report.baseLayer, 'present:1832x1920');
  assert.equal(report.viewports, '2');
  assert.equal(report.materialMaps, '4/4');
  assert.equal(report.diagnosticMaterials, '0:-');
  assert.equal(report.failedChecks.length, 0);
  assert.equal(report.waitMs, 0);
  assert.equal(report.deadlineMs, 0);
  assert.equal(report.timedOut, false);
  assert.equal(typeof report.elapsedMs, 'number');
  assert.equal(report.attempts, 1);
  assert.equal(report.lastError, null);
  assert.equal(report.lastErrorName, null);
  assert.equal(report.nextAction, 'inspect-interaction-readiness');
  assert.equal(report.checks.find((check) => check.id === 'interaction-readiness').status, 'pass');
  assert.equal(report.checks.find((check) => check.id === 'interaction-readiness').readinessStatus, 'blocked');
  assert.equal(JSON.parse(fs.readFileSync(reportPath, 'utf8')).ok, true);

  let failedSessionFixturePath = path.join(tempDir, 'failed-session-summary.json');
  let failedSessionReportPath = path.join(tempDir, 'failed-session-report.json');
  fs.writeFileSync(failedSessionFixturePath, JSON.stringify({
    version: 'xr-diagnostics-summary-v1',
    clientCount: 1,
    immersiveClientCount: 0,
    latestClient: { clientId: 'quest-failed-client' },
    latestImmersiveClient: null,
    clients: [
      {
        clientId: 'quest-failed-client',
        stale: false,
        ageMs: 150,
        phase: 'failed',
        surface: {
          surfaceKind: 'production',
          entrypoint: 'spatial-layout',
          projectId: 'agent-portal',
          targetSection: 'graph',
        },
        session: { status: 'failed', mode: null, frames: 0, panelCount: 0 },
        recentEvents: [
          { event: 'spatial-enter-clicked', receivedAt: '2026-05-27T10:01:00.000Z', mode: 'immersive-vr' },
          { event: 'spatial-three-session-start-requested', receivedAt: '2026-05-27T10:01:01.000Z', mode: 'immersive-vr' },
          { event: 'spatial-three-session-failed', receivedAt: '2026-05-27T10:01:02.000Z', mode: 'immersive-vr', error: 'NotAllowedError' },
        ],
      },
    ],
  }));
  let failedSessionRun = spawnSync(process.execPath, [
    path.join(ROOT, 'scripts/diagnostics/xr-headset-summary-smoke.js'),
    '--fixture',
    failedSessionFixturePath,
    '--report',
    failedSessionReportPath,
  ], { cwd: ROOT, encoding: 'utf8' });
  assert.notEqual(failedSessionRun.status, 0, 'failed requestSession path should fail the headset summary gate');
  let failedSessionReport = JSON.parse(failedSessionRun.stdout);
  assert.equal(failedSessionReport.requestSessionTrail.enterClicked, true);
  assert.equal(failedSessionReport.requestSessionTrail.sessionStartRequested, true);
  assert.equal(failedSessionReport.requestSessionTrail.sessionFailed, true);
  assert.equal(failedSessionReport.requestSessionTrail.lastFailureEvent, 'spatial-three-session-failed');
  assert.equal(failedSessionReport.nextAction, 'inspect-request-session-error');

  let harnessFixturePath = path.join(tempDir, 'harness-summary.json');
  let harnessReportPath = path.join(tempDir, 'harness-report.json');
  fs.writeFileSync(harnessFixturePath, JSON.stringify({
    version: 'xr-diagnostics-summary-v1',
    clientCount: 1,
    immersiveClientCount: 1,
    latestClient: { clientId: 'harness-client' },
    latestImmersiveClient: { clientId: 'harness-client' },
    clients: [
      {
        clientId: 'harness-client',
        stale: false,
        ageMs: 100,
        phase: 'running',
        modes: { immersiveVr: true },
        surface: {
          surfaceKind: 'harness',
          entrypoint: 'xr-three-panels-baseline',
          projectId: null,
          targetSection: 'xr-three-baseline',
        },
        session: {
          active: true,
          status: 'running',
          mode: 'immersive-vr',
          frames: 12,
          panelCount: 4,
          renderState: { baseLayer: { present: true, framebufferWidth: 1024, framebufferHeight: 1024 } },
          viewports: { viewCount: 2 },
          materialDiagnostics: { total: 4, mappedCount: 4, transparentCount: 0, strictDiagnosticCount: 0, strictDiagnosticPanelIds: [] },
        },
        visualReadiness: { status: 'pass', reason: 'ready' },
        interactionReadiness: { ready: true, status: 'ready', reason: 'ready' },
        texture: { ready: 4, total: 4 },
        htmlCanvas: { threeTexture: { htmlTextureAvailable: true, ready: true, threeRevision: '184' } },
      },
    ],
  }));
  let harnessRun = spawnSync(process.execPath, [
    path.join(ROOT, 'scripts/diagnostics/xr-headset-summary-smoke.js'),
    '--fixture',
    harnessFixturePath,
    '--report',
    harnessReportPath,
  ], { cwd: ROOT, encoding: 'utf8' });
  assert.notEqual(harnessRun.status, 0, 'harness diagnostics must fail the production headset gate by default');
  let harnessReport = JSON.parse(harnessRun.stdout);
  assert.equal(harnessReport.failedChecks.includes('production-surface'), true);
  assert.equal(harnessReport.nextAction, 'open-production-spatial-url');
  let allowedHarnessRun = spawnSync(process.execPath, [
    path.join(ROOT, 'scripts/diagnostics/xr-headset-summary-smoke.js'),
    '--fixture',
    harnessFixturePath,
    '--report',
    path.join(tempDir, 'allowed-harness-report.json'),
    '--allow-harness',
  ], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(allowedHarnessRun.status, 0, 'explicit harness checks must remain available');

  let emptyFixturePath = path.join(tempDir, 'empty-summary.json');
  let emptyReportPath = path.join(tempDir, 'empty-report.json');
  fs.writeFileSync(emptyFixturePath, JSON.stringify({
    version: 'xr-diagnostics-summary-v1',
    clientCount: 0,
    immersiveClientCount: 0,
    latestClient: null,
    latestImmersiveClient: null,
    clients: [],
  }));
  let emptyRun = spawnSync(process.execPath, [
    path.join(ROOT, 'scripts/diagnostics/xr-headset-summary-smoke.js'),
    '--fixture',
    emptyFixturePath,
    '--report',
    emptyReportPath,
    '--allow-stale',
    '--no-require-immersive',
    '--no-require-frames',
    '--no-require-panels',
    '--no-require-visual-ready',
  ], { cwd: ROOT, encoding: 'utf8' });
  assert.notEqual(emptyRun.status, 0, 'empty summary should fail until a browser client posts diagnostics');
  let emptyReport = JSON.parse(emptyRun.stdout);
  assert.equal(emptyReport.summaryClientCount, 0);
  assert.equal(emptyReport.summaryImmersiveClientCount, 0);
  assert.equal(emptyReport.failedChecks.includes('client-selected'), true);
  assert.equal(emptyReport.nextAction, 'open-xr-demo-page');
  assert.equal(JSON.parse(fs.readFileSync(emptyReportPath, 'utf8')).nextAction, 'open-xr-demo-page');

  let timeoutReportPath = path.join(tempDir, 'timeout-report.json');
  let timeoutRun = spawnSync(process.execPath, [
    path.join(ROOT, 'scripts/diagnostics/xr-headset-summary-smoke.js'),
    '--base-url',
    'http://127.0.0.1:9/demos/agent-portal-vr?token=secret#debug',
    '--report',
    timeoutReportPath,
    '--wait-ms',
    '1',
    '--interval-ms',
    '1',
    '--timeout-ms',
    '1',
  ], { cwd: ROOT, encoding: 'utf8' });
  assert.notEqual(timeoutRun.status, 0, 'timeout smoke should fail when no summary can be fetched');
  let timeoutReport = JSON.parse(timeoutRun.stdout);
  assert.equal(timeoutReport.ok, false);
  assert.equal(timeoutReport.timedOut, true);
  assert.equal(timeoutReport.deadlineMs, 1);
  assert.equal(timeoutReport.failedChecks.includes('summary-fetch'), true);
  assert.equal(timeoutReport.failedChecks.includes('wait-timeout'), true);
  assert.equal(timeoutReport.checks.find((check) => check.id === 'wait-timeout').status, 'fail');
  assert.equal(timeoutReport.nextAction, 'check-summary-endpoint');
  assert.equal(timeoutReport.summaryUrl.includes('token=secret'), false);
  assert.equal(timeoutReport.summaryUrl.includes('#debug'), false);
  assert.equal(timeoutReport.lastError?.includes('token=secret'), false);
  assert.equal(timeoutReport.lastError?.includes('#debug'), false);
  assert.equal(JSON.parse(fs.readFileSync(timeoutReportPath, 'utf8')).timedOut, true);
});

test('XR Three panels baseline follows the Meta sample renderer pattern', () => {
  let html = fs.readFileSync(path.join(ROOT, 'web/xr-three-panels-baseline.html'), 'utf8');
  let script = fs.readFileSync(path.join(ROOT, 'web/xr-three-panels-baseline.js'), 'utf8');

  assert.ok(html.includes('"three": "/vendor/three/build/three.module.js?v=0-184-0"'), 'Three baseline must use the reviewed local Three bundle with HTMLTexture support');
  assert.ok(html.includes('"symbiote-node/xr": "/packages/symbiote-node/xr/index.js"'), 'Three baseline must import XR through the public provider entrypoint');
  assert.ok(html.includes('XR Three Panels Baseline'), 'Three baseline must be clearly scoped');
  assert.ok(html.includes('rel="icon" href="data:,"'), 'Three baseline must not create favicon 404 noise in browser-agent smoke');
  assert.ok(html.includes('id="mode"'), 'Three baseline must expose explicit XR mode selection');
  assert.ok(html.includes('id="strict-texture"'), 'Three baseline must expose strict HTML-in-Canvas texture diagnostics');
  assert.ok(html.includes('value="immersive-ar"'), 'Three baseline must expose AR mode when supported');
  assert.ok(html.includes('value="immersive-vr"'), 'Three baseline must expose VR mode when supported');
  assert.ok(html.includes('src="xr-three-panels-baseline.js"'), 'Three baseline script must load inside the public demo route prefix');
  assert.ok(script.includes("import * as THREE from 'three'"), 'Three baseline must use the public import-map specifier');
  assert.ok(script.includes("from 'symbiote-node/xr'"), 'Three baseline must consume public provider exports');
  assert.ok(script.includes('getWebXRSupport'), 'Three baseline must use provider support detection');
  assert.ok(script.includes('createWebXRLaunchRecommendation'), 'Three baseline must use provider launch mode selection');
  assert.ok(script.includes('createWebXRLaunchGateSummary'), 'Three baseline must use provider launch gate diagnostics');
  assert.equal(script.includes('texture: options.texture || getTextureDiagnosticsPayload()'), false, 'Three baseline must keep session launch separate from texture readiness diagnostics');
  assert.ok(script.includes('createXRTextureGateSummary'), 'Three baseline must use provider texture gate diagnostics');
  assert.ok(script.includes('createXRSpatialScene'), 'Three baseline must build panel placement through the provider spatial scene contract');
  assert.ok(script.includes('layoutRoot'), 'Three baseline must feed runtime layout data into the provider spatial scene contract');
  assert.ok(script.includes('createXRThemeSnapshot'), 'Three baseline must read XR material data through the provider theme bridge');
  assert.ok(script.includes('applyXRThemeToPanel'), 'Three baseline must apply provider theme materials before rendering panels');
  assert.ok(script.includes('createXRThreeWebXRAdapter'), 'Three baseline must use the provider-owned Three WebXR adapter');
  assert.ok(script.includes('createXRPanelHost'), 'Three baseline must mount live DOM panel sources through the provider XR panel host');
  assert.ok(script.includes('sourcePanelHost'), 'Three baseline must keep a provider-owned source host for HTML-in-Canvas textures');
  assert.ok(script.includes('live-panel-canvas-source'), 'Three baseline texture source must be a direct canvas child, not the visible preview card');
  assert.ok(script.includes('getPanelElement: (panelId) => sourcePanelHost.getPanelElement(panelId)'), 'Three baseline texture bridge must resolve source-host elements');
  assert.ok(script.includes('createXRHtmlCanvasRenderer'), 'Three baseline must prepare live DOM panels through the provider HTML-in-Canvas renderer');
  assert.ok(script.includes('createXRThreePanelTextureBridge'), 'Three baseline must route live DOM texture preparation through the provider Three bridge');
  assert.ok(script.includes('createXRThreeHtmlCanvasTextureResolver'), 'Three baseline must resolve HTML-in-Canvas sources into Three textures through the provider');
  assert.ok(script.includes('textureResolver: threeTextureResolver.resolve'), 'Three baseline must not own product-local Three texture resolver glue');
  assert.ok(script.includes('createXRTextureDebugModeSummary'), 'Three baseline must normalize texture debug mode through the provider');
  assert.ok(script.includes('requireTextureUpload: textureDebugMode.requireTextureUpload'), 'Three baseline must let the provider Three bridge enforce strict/no-fallback texture mode');
  assert.ok(script.includes('createXRThreeDiagnosticPayload'), 'Three baseline must build server log payloads through the provider');
  assert.ok(script.includes('createXRThreeDiagnosticServerSummary'), 'Three baseline must normalize server diagnostics through the provider');
  assert.ok(script.includes('createXRThreeInteractionReadinessSummary'), 'Three baseline must summarize XR interaction readiness through the provider');
  assert.ok(script.includes('createXRThreeTroubleshootingSummary'), 'Three baseline must classify headset troubleshooting through the provider');
  assert.ok(script.includes('serverDiagnostics.currentTimeline.text'), 'Three baseline must format server timelines through provider server diagnostics');
  assert.ok(script.includes('createXRThreeRenderHost'), 'Three baseline must use the provider-owned Three render host');
  assert.ok(script.includes('createXRThreeSessionController'), 'Three baseline must use the provider-owned Three WebXR session controller');
  assert.ok(script.includes('createXRThreeSessionHealthSummary'), 'Three baseline must use provider-owned session health summaries');
  assert.ok(script.includes('createXRThreeSessionOptions'), 'Three baseline must build VR/AR session options through the provider');
  assert.ok(script.includes('createXRThreeSessionTelemetrySnapshot'), 'Three baseline must use provider-owned session telemetry snapshots');
  assert.ok(script.includes('createXRThreeSessionWatchdogSummary'), 'Three baseline must classify session watchdog states through the provider');
  assert.ok(script.includes('updateXRThreePanelMaterialStates'), 'Three baseline must update panel material states through the provider');
  assert.ok(script.includes('createXRSceneQualitySummary'), 'Three baseline must summarize scene quality through the provider');
  assert.ok(script.includes('createXRReadinessSummary'), 'Three baseline must summarize XR readiness through the provider');
  assert.ok(script.includes('diagnosticClientId'), 'Three baseline must tag diagnostics by browser client');
  assert.ok(script.includes('createStableXRDiagnosticClientId'), 'Three baseline must use provider-owned stable XR diagnostic client ids');
  assert.ok(!script.includes('redactXRDiagnosticUrl(location.href)'), 'Three baseline must not assemble diagnostic URL redaction locally');
  assert.ok(script.includes('/api/xr-diagnostics/summary'), 'Three baseline must poll the sanitized server summary');
  assert.ok(script.includes('body: JSON.stringify(payload)'), 'Three baseline must send the provider-built diagnostic payload');
  assert.ok(script.includes('createXRSceneGeometrySummary'), 'Three baseline must display provider-owned scene geometry diagnostics');
  assert.ok(script.includes('createXRVisualTestSummary'), 'Three baseline must build provider-owned visual test summaries');
  assert.ok(script.includes('createXRVisualAgentReadinessSummary'), 'Three baseline must build provider-owned visual readiness summaries');
  assert.ok(script.includes('Visual audit'), 'Three baseline must display provider-owned visual audit status');
  assert.ok(script.includes('Visual panel map'), 'Three baseline must display provider-owned spatial panel map');
  assert.ok(script.includes('XR visual readiness'), 'Three baseline must display provider-owned visual readiness status');
  assert.ok(script.includes('XR visual readiness checks'), 'Three baseline must display provider-owned visual readiness checks');
  assert.ok(script.includes('visualReadiness'), 'Three baseline must send provider-owned visual readiness diagnostics to the server');
  assert.ok(script.includes('XR interaction readiness'), 'Three baseline must display provider-owned interaction readiness status');
  assert.ok(script.includes('XR interaction checks'), 'Three baseline must display provider-owned interaction readiness checks');
  assert.ok(script.includes('interactionReadiness'), 'Three baseline must send provider-owned interaction readiness diagnostics to the server');
  assert.ok(script.includes('Server visual readiness'), 'Three baseline must display server-confirmed visual readiness');
  assert.ok(script.includes('Server interaction readiness'), 'Three baseline must display server-confirmed interaction readiness');
  assert.ok(script.includes('Ray visuals'), 'Three baseline must display provider-owned controller ray visual diagnostics');
  assert.ok(script.includes('Frame visuals'), 'Three baseline must display provider-owned panel frame visual diagnostics');
  assert.ok(script.includes('Hit reticle'), 'Three baseline must display provider-owned hit reticle diagnostics');
  assert.ok(script.includes('Frame target'), 'Three baseline must display provider frame target diagnostics');
  assert.ok(script.includes('Server hover frame target'), 'Three baseline must display server-confirmed frame target diagnostics');
  assert.ok(script.includes('Interaction events'), 'Three baseline must display provider-owned interaction state diagnostics');
  assert.ok(script.includes('Live panels mounted'), 'Three baseline must display mounted live DOM panel count');
  assert.ok(script.includes('Live panels prepared'), 'Three baseline must display prepared live DOM panel count');
  assert.ok(script.includes('HTML canvas support'), 'Three baseline must display HTML-in-Canvas support diagnostics');
  assert.ok(script.includes('createXRThreeTextureCapabilitySummary'), 'Three baseline must use provider-owned Three texture capability diagnostics');
  assert.ok(script.includes('Three HTMLTexture'), 'Three baseline must display Three HTMLTexture capability diagnostics');
  assert.ok(script.includes('Three texture capability'), 'Three baseline must display Three texture readiness diagnostics');
  assert.ok(script.includes('Surface'), 'Three baseline must classify itself as a diagnostic surface');
  assert.ok(script.includes('Production'), 'Three baseline must make non-production status visible');
  assert.ok(script.includes('HTML canvas origin trial meta'), 'Three baseline must display origin-trial meta presence without exposing token content');
  assert.ok(script.includes('HTML canvas origin trial configured'), 'Three baseline must display origin-trial configured state without exposing token content');
  assert.ok(script.includes('HTML canvas origin trial header'), 'Three baseline must display origin-trial response header presence without exposing token content');
  assert.ok(script.includes('readXRHtmlCanvasOriginTrialHeaderStatus'), 'Three baseline must use provider origin-trial header diagnostics');
  assert.ok(script.includes('X-Agent-Portal-Origin-Trial'), 'Three baseline may pass the product diagnostic header name as provider options');
  assert.equal(script.includes('AGENT_PORTAL_HTML_IN_CANVAS_ORIGIN_TRIAL_TOKEN'), false, 'Origin-trial diagnostics must not expose env key names to browser code');
  assert.ok(script.includes('Three texture bridge'), 'Three baseline must display provider Three texture bridge diagnostics');
  assert.ok(script.includes('Three texture resolver'), 'Three baseline must display provider Three texture resolver diagnostics');
  assert.ok(script.includes('Three texture applied'), 'Three baseline must display provider-applied Three texture counts');
  assert.ok(script.includes('Texture strict'), 'Three baseline must display strict texture mode');
  assert.ok(script.includes('hideStrictTextureFailures: textureDebugMode.hideStrictTextureFailures'), 'Three baseline must request provider-classified strict texture diagnostics instead of product fallback panels');
  assert.ok(script.includes('Strict diagnostic panels'), 'Three baseline must display strict texture diagnostic panels');
  assert.ok(script.includes('Texture debug mode'), 'Three baseline must display provider-normalized texture debug mode');
  assert.ok(script.includes('Texture ready'), 'Three baseline must display HTML-in-Canvas texture readiness');
  assert.ok(script.includes('Texture block reason'), 'Three baseline must display strict texture block reasons');
  assert.ok(script.includes('Texture failure stage'), 'Three baseline must display provider-classified strict texture failure stage');
  assert.ok(script.includes('Texture required API'), 'Three baseline must display missing HTML-in-Canvas API diagnostics');
  assert.ok(script.includes('Texture bridge stages'), 'Three baseline must display per-panel provider bridge stages');
  assert.ok(script.includes('Texture resolver stages'), 'Three baseline must display per-panel provider resolver stages');
  assert.ok(script.includes('Texture resolver quality'), 'Three baseline must display provider texture quality diagnostics from the Three resolver');
  assert.ok(script.includes('Texture resolver upload'), 'Three baseline must display provider texture upload diagnostics from the Three resolver');
  assert.ok(script.includes('Texture resolver warnings'), 'Three baseline must display provider texture quality warnings from the Three resolver');
  assert.ok(script.includes('Texture resolver recommendations'), 'Three baseline must display provider texture quality recommendations from the Three resolver');
  assert.ok(script.includes('Texture source path'), 'Three baseline must display provider-classified texture source paths');
  assert.ok(script.includes('Texture fallback reason'), 'Three baseline must display provider-classified texture fallback reasons');
  assert.ok(script.includes('getTextureDiagnosticsPayload'), 'Three baseline must post compact texture diagnostics to the server');
  assert.ok(script.includes('Server HTML canvas availability'), 'Three baseline must display server-confirmed HTML-in-Canvas availability');
  assert.ok(script.includes('Server HTML canvas origin trial meta'), 'Three baseline must display server-confirmed origin-trial meta presence');
  assert.ok(script.includes('Server HTML canvas origin trial configured'), 'Three baseline must display server-confirmed origin-trial configured state');
  assert.ok(script.includes('Server HTML canvas origin trial header'), 'Three baseline must display server-confirmed origin-trial response header presence');
  assert.ok(script.includes('Server HTML canvas flag'), 'Three baseline must display server-confirmed HTML-in-Canvas flag guidance');
  assert.ok(script.includes('Server HTML canvas texture upload'), 'Three baseline must display server-confirmed HTML-in-Canvas texture readiness');
  assert.ok(script.includes('Server Three HTMLTexture'), 'Three baseline must display server-confirmed Three HTMLTexture capability');
  assert.ok(script.includes('Server Three texture capability'), 'Three baseline must display server-confirmed Three texture readiness');
  assert.ok(script.includes('Session base layer'), 'Three baseline must display WebXR base layer diagnostics');
  assert.ok(script.includes('Session viewports'), 'Three baseline must display WebXR per-view viewport diagnostics');
  assert.ok(script.includes('Panel material opacity'), 'Three baseline must display material transparency diagnostics');
  assert.ok(script.includes('Panel material maps'), 'Three baseline must display texture map application diagnostics');
  assert.ok(script.includes('Panel diagnostic materials'), 'Three baseline must display strict diagnostic material usage');
  assert.ok(script.includes('Server surface'), 'Three baseline must display server-confirmed surface identity');
  assert.ok(script.includes('Server base layer'), 'Three baseline must display server-confirmed base layer diagnostics');
  assert.ok(script.includes('Server viewports'), 'Three baseline must display server-confirmed viewport diagnostics');
  assert.ok(script.includes('Server material opacity'), 'Three baseline must display server-confirmed material transparency diagnostics');
  assert.ok(script.includes('Server material maps'), 'Three baseline must display server-confirmed texture map diagnostics');
  assert.ok(script.includes('Server diagnostic materials'), 'Three baseline must display server-confirmed diagnostic material usage');
  assert.ok(script.includes('Server scene quality'), 'Three baseline must display server-confirmed scene quality');
  assert.ok(script.includes('Server scene warnings'), 'Three baseline must display server-confirmed scene warning counts');
  assert.ok(script.includes('Server XR readiness'), 'Three baseline must display server-confirmed XR readiness');
  assert.ok(script.includes('Server XR readiness checks'), 'Three baseline must display server-confirmed XR readiness checks');
  assert.ok(script.includes('Server texture stage'), 'Three baseline must display server-confirmed texture stage');
  assert.ok(script.includes('Server texture mode'), 'Three baseline must display server-confirmed texture debug mode');
  assert.ok(script.includes('Server texture resolver'), 'Three baseline must display server-confirmed resolver version');
  assert.ok(script.includes('XR troubleshooting'), 'Three baseline must display provider-classified troubleshooting state');
  assert.ok(script.includes('Server resolver stages'), 'Three baseline must display server-confirmed resolver stages');
  assert.ok(script.includes('Server texture required API'), 'Three baseline must display server-confirmed missing texture APIs');
  assert.ok(script.includes('Server deep graph'), 'Three baseline must display server-confirmed deep graph diagnostics');
  assert.ok(script.includes('Server deep focus'), 'Three baseline must display server-confirmed deep graph focus');
  assert.ok(script.includes('Server deep preview'), 'Three baseline must display server-confirmed deep graph preview bounds');
  assert.ok(script.includes('Server deep focus preview'), 'Three baseline must display server-confirmed focus preview coverage');
  assert.ok(script.includes('serverDiagnostics.currentDeepGraph'), 'Three baseline must read deep graph diagnostics through provider server summaries');
  assert.ok(script.includes('serverDiagnostics.currentDeepGraphPreview'), 'Three baseline must read deep graph preview diagnostics through provider server summaries');
  assert.ok(script.includes('Server launch gate'), 'Three baseline must display server-confirmed launch gate');
  assert.ok(script.includes('Launch gate'), 'Three baseline must display provider launch gate status');
  assert.ok(script.includes('three-panels-session-blocked'), 'Three baseline must log provider launch gate blocks before requestSession');
  assert.ok(script.includes('Telemetry'), 'Three baseline must display provider-owned telemetry diagnostics');
  assert.ok(script.includes('Session health'), 'Three baseline must display provider-owned session health diagnostics');
  assert.ok(script.includes('Telemetry texture quality'), 'Three baseline must display provider-owned telemetry texture quality counts');
  assert.ok(script.includes('Telemetry texture warnings'), 'Three baseline must display provider-owned telemetry texture warnings');
  assert.ok(script.includes('Telemetry texture recommendations'), 'Three baseline must display provider-owned telemetry texture recommendations');
  assert.ok(script.includes('Telemetry texture actions'), 'Three baseline must display provider-prioritized texture quality actions');
  assert.ok(script.includes('Session visibility'), 'Three baseline must display WebXR session visibility state');
  assert.ok(script.includes('Session blend'), 'Three baseline must display WebXR environment blend mode');
  assert.ok(script.includes('Session interaction'), 'Three baseline must display WebXR interaction mode');
  assert.ok(script.includes('Session input sources'), 'Three baseline must display WebXR input source diagnostics');
  assert.ok(script.includes('Session requested space'), 'Three baseline must display requested WebXR reference space');
  assert.ok(script.includes('Session optional features'), 'Three baseline must display requested optional WebXR features');
  assert.ok(script.includes('Session dom overlay'), 'Three baseline must display requested DOM overlay state');
  assert.ok(script.includes('Server current client'), 'Three baseline must show whether the server received the current client diagnostics');
  assert.ok(script.includes('Server current stale'), 'Three baseline must show stale state for the current server client');
  assert.ok(script.includes('Server current phase'), 'Three baseline must show the server-classified phase for the current client');
  assert.ok(script.includes('Server current status'), 'Three baseline must show server session status for the current client');
  assert.ok(script.includes('Server current health'), 'Three baseline must show server health for the current client');
  assert.ok(script.includes('Server current texture quality'), 'Three baseline must show server-confirmed texture quality counts');
  assert.ok(script.includes('Server current texture warnings'), 'Three baseline must show server-confirmed texture quality warnings');
  assert.ok(script.includes('Server current texture recommendations'), 'Three baseline must show server-confirmed texture quality recommendations');
  assert.ok(script.includes('Server current texture actions'), 'Three baseline must show server-confirmed prioritized texture quality actions');
  assert.ok(script.includes('Server current error'), 'Three baseline must show sanitized server errors for the current client');
  assert.ok(script.includes('Server current visibility'), 'Three baseline must show server-confirmed session visibility');
  assert.ok(script.includes('Server current blend'), 'Three baseline must show server-confirmed environment blend mode');
  assert.ok(script.includes('Server current interaction'), 'Three baseline must show server-confirmed interaction mode');
  assert.ok(script.includes('Server current input sources'), 'Three baseline must show server-confirmed input sources');
  assert.ok(script.includes('Server current requested space'), 'Three baseline must show server-confirmed requested reference space');
  assert.ok(script.includes('Server current optional features'), 'Three baseline must show server-confirmed optional WebXR features');
  assert.ok(script.includes('Server current dom overlay'), 'Three baseline must show server-confirmed DOM overlay request state');
  assert.ok(script.includes('Server current frames'), 'Three baseline must show server-confirmed XR frame count');
  assert.ok(script.includes('Server current panels'), 'Three baseline must show server-confirmed panel count');
  assert.ok(script.includes('Server current controllers'), 'Three baseline must show server-confirmed controller count');
  assert.ok(script.includes('Server current rays'), 'Three baseline must show server-confirmed controller ray visuals');
  assert.ok(script.includes('Server current reticle'), 'Three baseline must show server-confirmed hit reticle visuals');
  assert.ok(script.includes('Server current fps'), 'Three baseline must show server-confirmed FPS health data');
  assert.ok(script.includes('Server current frame visuals'), 'Three baseline must show server-confirmed panel frame visual diagnostics');
  assert.ok(script.includes('Server current last event'), 'Three baseline must show the latest server event with status fields');
  assert.ok(script.includes('Server current events'), 'Three baseline must show a compact server event timeline for the current client');
  assert.ok(!script.includes('function formatServerTimeline'), 'Three baseline must not own reusable server timeline formatting');
  assert.ok(script.includes('Server immersive client'), 'Three baseline must show the latest immersive-capable client');
  assert.ok(script.includes('requestSession'), 'Three baseline must display requestSession availability');
  assert.ok(script.includes('XRWebGLLayer'), 'Three baseline must display XRWebGLLayer availability');
  assert.ok(script.includes('XRReferenceSpace'), 'Three baseline must display XRReferenceSpace availability');
  assert.ok(script.includes('three-panels-client-heartbeat'), 'Three baseline must keep the current client visible in server diagnostics');
  assert.ok(script.includes('postDiagnostic(watchdog.event'), 'Three baseline must report provider-classified watchdog events');
  assert.ok(!script.includes("state.status === 'starting'"), 'Three baseline must not hardcode starting-state watchdog rules');
  assert.ok(!script.includes("state.status === 'running' && !state.frames"), 'Three baseline must not hardcode no-frame watchdog rules');
  assert.ok(script.includes('three-panels-session-telemetry'), 'Three baseline must post throttled session telemetry');
  assert.ok(script.includes('three-panels-live-sources-mounted'), 'Three baseline must log live panel source readiness');
  assert.ok(script.includes('Drag response'), 'Three baseline must display provider-owned drag response diagnostics');
  assert.ok(script.includes('Drag resize handle'), 'Three baseline must display provider-owned resize handle diagnostics');
  assert.ok(script.includes('Server drag resize size'), 'Three baseline must display server-confirmed resize size diagnostics');
  assert.ok(script.includes('renderHost.resize'), 'Three baseline must resize through the provider render host');
  assert.ok(script.includes('renderHost.startLoop'), 'Three baseline must start the desktop render loop through the provider render host');
  assert.ok(script.includes('renderHost.stopLoop'), 'Three baseline must stop the desktop render loop through the provider render host');
  assert.ok(script.includes('sessionController.start'), 'Three baseline must start XR through the provider session controller');
  assert.ok(script.includes('sessionController.getDiagnostics'), 'Three baseline must display provider session diagnostics');
  assert.equal(script.includes('new THREE.Color'), false, 'Three baseline must not decorate scenes directly');
  assert.equal(script.includes('new THREE.HemisphereLight'), false, 'Three baseline must not add scene lights directly');
  assert.equal(script.includes('renderer.setPixelRatio'), false, 'Three baseline must not size renderer pixel ratio directly');
  assert.equal(script.includes('renderer.setSize'), false, 'Three baseline must not size renderers directly');
  assert.equal(script.includes('renderer.setAnimationLoop'), false, 'Three baseline must not own the Three render loop directly');
  assert.equal(script.includes('setHex('), false, 'Three baseline must not mutate Three material colors directly');
  assert.equal(script.includes('setStyle('), false, 'Three baseline must not mutate Three material styles directly');
  assert.equal(script.includes('updateProjectionMatrix'), false, 'Three baseline must not update camera projection directly');
  assert.equal(script.includes('navigator.xr.requestSession'), false, 'Three baseline must not request XR sessions directly');
  assert.equal(script.includes('renderer.xr.getController'), false, 'Three baseline must not wire Three controllers directly');
  assert.equal(script.includes('adapter.controllerRays.getHits'), false, 'Three baseline must not run controller hit tests directly');
  assert.equal(script.includes('adapter.controllerRays.beginDrag'), false, 'Three baseline must not start ray-plane drag directly');
  assert.equal(/color:\\s*0x/i.test(script), false, 'Three baseline must not hardcode panel material colors');
  assert.ok(script.includes('controller-ray-plane'), 'Three baseline must expose the direct drag model in diagnostics');
  assert.ok(script.includes('three-panels-session-started'), 'Three baseline must log server diagnostics');
  assert.equal(script.includes('createXRDeepGraphScene'), false, 'Three baseline must not depend on deep graph mode');
  assert.equal(script.includes('packages/symbiote-node'), false, 'Three baseline script must not deep-import provider files');
  assert.equal(script.includes('navigator.userAgent'), false, 'Three baseline must not sniff browser versions');
});
