#!/usr/bin/env node
import fs from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import path from 'node:path';
import process from 'node:process';
import {
  createXRThreeDiagnosticServerSummary,
  createXRThreeTroubleshootingSummary,
} from 'symbiote-ui/xr';

function parseArgs(argv) {
  let options = {
    baseUrl: process.env.XR_HEADSET_BASE_URL || 'https://playground.rnd-pro.com/demos/agent-portal-vr',
    clientId: process.env.XR_HEADSET_CLIENT_ID || null,
    fixturePath: null,
    reportPath: path.join('tmp', 'xr-headset-summary-smoke', 'report.json'),
    requireImmersive: true,
    requireFrames: true,
    requirePanels: true,
    requireVisualReady: true,
    requireInteractionReady: false,
    requireProduction: true,
    expectedSurfaceKind: 'production',
    expectedEntrypoint: 'spatial-layout',
    expectedProjectId: 'agent-portal',
    expectedTargetSection: 'graph',
    allowStale: false,
    timeoutMs: 15000,
    waitMs: 0,
    intervalMs: 2000,
  };
  for (let index = 0; index < argv.length; index += 1) {
    let arg = argv[index];
    if (arg === '--base-url') options.baseUrl = argv[++index];
    else if (arg === '--client-id') options.clientId = argv[++index];
    else if (arg === '--fixture') options.fixturePath = argv[++index];
    else if (arg === '--report') options.reportPath = argv[++index];
    else if (arg === '--timeout-ms') options.timeoutMs = Number(argv[++index]) || options.timeoutMs;
    else if (arg === '--wait-ms') options.waitMs = Number(argv[++index]) || 0;
    else if (arg === '--interval-ms') options.intervalMs = Number(argv[++index]) || options.intervalMs;
    else if (arg === '--allow-stale') options.allowStale = true;
    else if (arg === '--no-require-immersive') options.requireImmersive = false;
    else if (arg === '--no-require-frames') options.requireFrames = false;
    else if (arg === '--no-require-panels') options.requirePanels = false;
    else if (arg === '--no-require-visual-ready') options.requireVisualReady = false;
    else if (arg === '--require-interaction-ready') options.requireInteractionReady = true;
    else if (arg === '--allow-harness') options.requireProduction = false;
    else if (arg === '--no-require-production') options.requireProduction = false;
    else if (arg === '--expected-project') options.expectedProjectId = argv[++index];
    else if (arg === '--expected-target') options.expectedTargetSection = argv[++index];
  }
  return options;
}

function createSummaryUrl(baseUrl) {
  let base = new URL(baseUrl);
  let pathname = base.pathname.endsWith('/') ? base.pathname.slice(0, -1) : base.pathname;
  base.pathname = `${pathname}/api/xr-diagnostics/summary`.replace(/\/+/g, '/');
  base.search = '';
  base.hash = '';
  return base;
}

function requestJson(url, timeoutMs) {
  return new Promise((resolve, reject) => {
    let transport = url.protocol === 'https:' ? https : http;
    let request = transport.request(url, { method: 'GET', timeout: timeoutMs, headers: { Accept: 'application/json' } }, (response) => {
      let chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => {
        if (response.statusCode < 200 || response.statusCode >= 300) {
          reject(new Error(`HTTP ${response.statusCode} ${url.href}`));
          return;
        }
        try {
          resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
        } catch (error) {
          reject(error);
        }
      });
    });
    request.on('timeout', () => {
      request.destroy(new Error(`Timeout ${timeoutMs}ms ${url.href}`));
    });
    request.on('error', reject);
    request.end();
  });
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function sanitizeErrorMessage(error) {
  let message = String(error?.message || error || 'unknown-error');
  return message.replace(/https?:\/\/[^\s?#]+(?:\?[^\s#]*)?(?:#[^\s]*)?/g, (value) => {
    try {
      let url = new URL(value);
      url.search = '';
      url.hash = '';
      return url.href;
    } catch {
      return '[url-redacted]';
    }
  });
}

function loadFixture(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function surfaceMatches(client, options = {}) {
  let surface = client?.surface || {};
  return (
    surface.surfaceKind === options.expectedSurfaceKind &&
    surface.entrypoint === options.expectedEntrypoint &&
    surface.projectId === options.expectedProjectId &&
    surface.targetSection === options.expectedTargetSection
  );
}

function resolveClientId(summary, explicitClientId, options = {}) {
  if (explicitClientId) return explicitClientId;
  if (options.requireProduction) {
    let clients = Array.isArray(summary?.clients) ? summary.clients : [];
    let productionImmersive = clients.find((client) => isImmersiveClient(client) && surfaceMatches(client, options));
    if (productionImmersive) return productionImmersive.clientId;
    let productionClient = clients.find((client) => surfaceMatches(client, options));
    if (productionClient) return productionClient.clientId;
  }
  return summary?.latestImmersiveClient?.clientId || summary?.latestClient?.clientId || null;
}

function isImmersiveClient(client) {
  return Boolean(
    client?.session?.active ||
    client?.session?.status === 'running' ||
    client?.session?.mode?.startsWith?.('immersive-') ||
    Number(client?.session?.frames || 0) > 0
  );
}

function addCheck(checks, id, pass, details = {}) {
  checks.push({ id, ...details, status: pass ? 'pass' : 'fail' });
}

function compactRecentEvent(event = {}) {
  return {
    receivedAt: event.receivedAt || null,
    event: event.event || null,
    attemptId: event.attemptId || null,
    failureStage: event.failureStage || null,
    mode: event.mode || null,
    status: event.status || null,
    health: event.health || null,
    htmlCanvasAvailability: event.htmlCanvasAvailability || null,
    readinessStatus: event.readinessStatus || null,
    readinessReason: event.readinessReason || null,
    visualReadinessStatus: event.visualReadinessStatus || null,
    visualReadinessReason: event.visualReadinessReason || null,
    interactionReadinessStatus: event.interactionReadinessStatus || null,
    interactionReadinessReason: event.interactionReadinessReason || null,
    textureMode: event.textureMode || null,
    textureStage: event.textureStage || null,
    textureReason: event.textureReason || null,
    textureResolverStage: event.textureResolverStage || null,
    textureResolverReason: event.textureResolverReason || null,
    launchGateReason: event.launchGateReason || null,
    error: event.error || null,
  };
}

function createRequestSessionTrail(events = [], session = {}, attemptSummary = null) {
  let allEvents = Array.isArray(events) ? events : [];
  let attemptId = attemptSummary?.attemptId ||
    [...allEvents].reverse().find((event) => event?.attemptId)?.attemptId ||
    null;
  let attemptEvents = attemptId
    ? allEvents.filter((event) => event?.attemptId === attemptId)
    : allEvents;
  let eventNames = (attemptSummary?.events?.length ? attemptSummary.events : attemptEvents
    .map((event) => event?.event)
    .filter(Boolean));
  let allEventNames = allEvents
    .map((event) => event?.event)
    .filter(Boolean);
  let hasEvent = (name) => eventNames.includes(name);
  let sessionFailed = hasEvent('spatial-three-session-failed') || hasEvent('spatial-session-failed');
  let sessionStarted = (
    hasEvent('spatial-three-session-started') ||
    hasEvent('spatial-session-started') ||
    session?.status === 'running' ||
    session?.active === true
  );
  let framesSeen = Number(session?.frames || 0) > 0 || hasEvent('spatial-three-frame');
  let lastFailure = [...attemptEvents].reverse().find((event) => event?.event?.includes?.('failed') || event?.error) || null;

  return {
    attemptId,
    enterClicked: hasEvent('spatial-enter-clicked'),
    launchGateBlocked: hasEvent('spatial-session-blocked'),
    strictTexturePreflightBlocked: hasEvent('spatial-strict-texture-preflight-blocked'),
    sessionStartRequested: hasEvent('spatial-three-session-start-requested'),
    sessionStarted,
    sessionFailed,
    framesSeen,
    lastFailureEvent: lastFailure?.event || null,
    lastFailureError: lastFailure?.error || null,
    lastFailureStage: lastFailure?.failureStage || null,
    persistentEventCount: Number(attemptSummary?.eventCount || 0),
    persistentStages: attemptSummary?.stages || [],
    eventNames,
    allEventNames,
  };
}

function deriveNextAction(report) {
  let failed = Array.isArray(report?.failedChecks) ? report.failedChecks : [];
  if (failed.includes('summary-available') || failed.includes('summary-fetch')) return 'check-summary-endpoint';
  if (failed.includes('client-selected') && Number(report?.summaryClientCount || 0) <= 0) return 'open-xr-demo-page';
  if (failed.includes('client-selected') && report?.clientId) return 'check-requested-diagnostic-client';
  if (failed.includes('client-selected')) return 'check-diagnostic-client';
  if (failed.includes('client-fresh')) return 'refresh-headset-client';
  if ((failed.includes('texture-readiness') || failed.includes('material-textures')) &&
    Array.isArray(report?.htmlCanvasMissingCore) &&
    report.htmlCanvasMissingCore.length) {
    return 'enable-html-in-canvas-on-headset';
  }
  if (failed.includes('immersive-client') || failed.includes('wait-timeout')) {
    let trail = report?.requestSessionTrail || {};
    if (trail.enterClicked && !trail.sessionStartRequested) return 'inspect-launch-gate-at-click';
    if (trail.sessionStartRequested && trail.sessionFailed) return 'inspect-request-session-error';
    if (trail.sessionStarted && !trail.framesSeen) return 'inspect-xr-frame-loop';
    if (!trail.enterClicked) return 'press-enter-xr-in-headset';
    return 'enter-xr-in-headset';
  }
  if (failed.includes('production-surface')) return 'open-production-spatial-url';
  if (failed.includes('xr-frames')) return 'inspect-xr-render-loop';
  if (failed.includes('xr-panels')) return 'inspect-panel-scene-mount';
  if (failed.includes('visual-readiness')) return 'inspect-visual-readiness';
  if (failed.includes('texture-readiness') || failed.includes('material-textures')) return 'inspect-xr-texture-path';
  if (failed.includes('interaction-readiness')) return 'inspect-interaction-readiness';
  if (typeof report?.interactionReadiness === 'string' && report.interactionReadiness.startsWith('blocked:')) {
    return 'inspect-interaction-readiness';
  }
  return report?.ok ? 'headset-summary-ready' : 'inspect-headset-summary';
}

function createHeadsetSummaryReport(summary, options = {}) {
  let clientId = resolveClientId(summary, options.clientId, options);
  let diagnostics = createXRThreeDiagnosticServerSummary(summary, { clientId });
  let troubleshooting = createXRThreeTroubleshootingSummary(diagnostics);
  let client = diagnostics.currentClient || null;
  let session = diagnostics.currentSession || {};
  let checks = [];
  let frames = Number(session.frames || diagnostics.currentChecks?.frames || 0);
  let panels = Number(session.panelCount || diagnostics.currentChecks?.panelCount || 0);
  let visualReadiness = diagnostics.currentVisualReadiness || null;
  let interactionReadiness = diagnostics.currentInteractionReadiness || null;
  let surface = client?.surface || {};
  let materialDiagnostics = session.materialDiagnostics || {};
  let recentEvents = Array.isArray(client?.recentEvents) ? client.recentEvents : [];
  let compactEvents = recentEvents.map(compactRecentEvent);
  let requestSessionTrail = createRequestSessionTrail(recentEvents, session, client?.latestAttempt || null);
  let latestEvent = compactEvents.at(-1) || null;

  addCheck(checks, 'summary-available', Boolean(summary?.version), { version: summary?.version || null });
  addCheck(checks, 'client-selected', Boolean(client), { clientId });
  addCheck(checks, 'client-fresh', options.allowStale || client?.stale === false, {
    stale: client?.stale ?? null,
    ageMs: client?.ageMs ?? null,
  });
  addCheck(checks, 'immersive-client', !options.requireImmersive || isImmersiveClient(client), {
    required: options.requireImmersive,
    mode: session.mode || client?.launch?.mode || null,
  });
  addCheck(checks, 'production-surface', !options.requireProduction || (
    surface.surfaceKind === options.expectedSurfaceKind &&
    surface.entrypoint === options.expectedEntrypoint &&
    surface.projectId === options.expectedProjectId &&
    surface.targetSection === options.expectedTargetSection
  ), {
    required: options.requireProduction,
    surfaceKind: surface.surfaceKind || null,
    entrypoint: surface.entrypoint || null,
    projectId: surface.projectId || null,
    targetSection: surface.targetSection || null,
    expectedSurfaceKind: options.expectedSurfaceKind,
    expectedEntrypoint: options.expectedEntrypoint,
    expectedProjectId: options.expectedProjectId,
    expectedTargetSection: options.expectedTargetSection,
  });
  addCheck(checks, 'xr-frames', !options.requireFrames || frames > 0, { required: options.requireFrames, frames });
  addCheck(checks, 'xr-panels', !options.requirePanels || panels > 0, { required: options.requirePanels, panels });
  addCheck(checks, 'visual-readiness', !options.requireVisualReady || visualReadiness?.status === 'pass', {
    required: options.requireVisualReady,
    readinessStatus: visualReadiness?.status || null,
    reason: visualReadiness?.reason || null,
  });
  addCheck(checks, 'interaction-readiness', !options.requireInteractionReady || interactionReadiness?.ready === true, {
    required: options.requireInteractionReady,
    readinessStatus: interactionReadiness?.status || null,
    reason: interactionReadiness?.reason || null,
    issueCodes: interactionReadiness?.issueCodes || [],
  });
  let textureReady = Number(diagnostics.currentTexture?.ready || 0);
  let textureTotal = Number(diagnostics.currentTexture?.total || 0);
  let strictDiagnosticCount = Number(materialDiagnostics.strictDiagnosticCount || 0);
  let materialMapCount = Number(materialDiagnostics.mappedCount ?? materialDiagnostics.mapAppliedCount ?? 0);
  let materialTotal = Number(materialDiagnostics.total || 0);
  addCheck(checks, 'texture-readiness', !options.requireProduction || (
    textureTotal > 0 &&
    textureReady === textureTotal &&
    diagnostics.currentHtmlCanvas?.threeTexture?.ready !== false
  ), {
    required: options.requireProduction,
    textureReady,
    textureTotal,
    threeTextureReady: diagnostics.currentHtmlCanvas?.threeTexture?.ready ?? null,
    reason: diagnostics.currentTexture?.reason || diagnostics.currentTexture?.stage || null,
  });
  addCheck(checks, 'material-textures', !options.requireProduction || (
    materialTotal > 0 &&
    materialMapCount === materialTotal &&
    strictDiagnosticCount === 0
  ), {
    required: options.requireProduction,
    materialMapCount,
    materialTotal,
    strictDiagnosticCount,
  });

  let failed = checks.filter((check) => check.status === 'fail');
  return {
    ok: failed.length === 0,
    version: 'xr-headset-summary-smoke-v1',
    clientId,
    summaryClientCount: Number(summary?.clientCount || summary?.clients?.length || 0),
    summaryImmersiveClientCount: Number(summary?.immersiveClientCount || 0),
    selectedClientId: client?.clientId || null,
    latestClientId: summary?.latestClient?.clientId || null,
    latestImmersiveClientId: summary?.latestImmersiveClient?.clientId || null,
    latestEvent: latestEvent?.event || summary?.latest?.event || null,
    latestEventDetails: latestEvent,
    recentEvents: compactEvents,
    recentEventTrailText: diagnostics.currentTimeline?.text || null,
    requestSessionTrail,
    latestAttempt: client?.latestAttempt || null,
    eventCounts: summary?.eventCounts || {},
    phase: client?.phase || null,
    stale: client?.stale ?? null,
    ageMs: client?.ageMs ?? null,
    sessionStatus: session.status || null,
    mode: session.mode || client?.launch?.mode || null,
    surfaceKind: surface.surfaceKind || null,
    entrypoint: surface.entrypoint || null,
    projectId: surface.projectId || null,
    targetSection: surface.targetSection || null,
    frames,
    panels,
    visualReadiness: visualReadiness ? `${visualReadiness.status}:${visualReadiness.reason}` : null,
    interactionReadiness: interactionReadiness ? `${interactionReadiness.status}:${interactionReadiness.reason}` : null,
    texture: diagnostics.currentTexture
      ? `${diagnostics.currentTexture.ready}/${diagnostics.currentTexture.total}:${diagnostics.currentTexture.reason || diagnostics.currentTexture.stage || 'ready'}`
      : null,
    htmlCanvasAvailability: diagnostics.currentHtmlCanvas?.availability || null,
    htmlCanvasRecommendation: diagnostics.currentHtmlCanvas?.recommendation || null,
    htmlCanvasRequiredFlag: diagnostics.currentHtmlCanvas?.requiredFlag || null,
    htmlCanvasFlagUrl: diagnostics.currentHtmlCanvas?.originTrial?.flagUrl ||
      diagnostics.currentHtmlCanvas?.enablement?.flagUrl ||
      null,
    htmlCanvasLocalTestBrowser: diagnostics.currentHtmlCanvas?.originTrial?.localTestBrowser || null,
    htmlCanvasOriginTrialConfigured: diagnostics.currentHtmlCanvas?.enablement?.originTrialConfigured ?? null,
    htmlCanvasOriginTrialMetaPresent: diagnostics.currentHtmlCanvas?.enablement?.originTrialMetaPresent ?? null,
    htmlCanvasOriginTrialHeader: diagnostics.currentHtmlCanvas?.responseHeader
      ? (diagnostics.currentHtmlCanvas.responseHeader.originTrialPresent ? 'present' : diagnostics.currentHtmlCanvas.responseHeader.error || 'missing')
      : null,
    htmlCanvasMissingCore: diagnostics.currentHtmlCanvas?.missingCore || [],
    htmlCanvasMissingTexture: diagnostics.currentHtmlCanvas?.missingTexture || [],
    threeHtmlTexture: diagnostics.currentHtmlCanvas?.threeTexture
      ? `${diagnostics.currentHtmlCanvas.threeTexture.htmlTextureAvailable ? 'available' : 'missing'}:${diagnostics.currentHtmlCanvas.threeTexture.reason || diagnostics.currentHtmlCanvas.threeTexture.threeRevision || '-'}`
      : null,
    baseLayer: session.renderState?.baseLayer
      ? `${session.renderState.baseLayer.present ? 'present' : 'missing'}:${session.renderState.baseLayer.framebufferWidth || '-'}x${session.renderState.baseLayer.framebufferHeight || '-'}`
      : null,
    viewports: session.viewports ? `${session.viewports.viewCount}` : null,
    materialOpacity: session.materialDiagnostics ? `${materialDiagnostics.transparentCount}/${materialDiagnostics.total}` : null,
    materialMaps: session.materialDiagnostics ? `${materialMapCount}/${materialDiagnostics.total}` : null,
    diagnosticMaterials: session.materialDiagnostics ? `${materialDiagnostics.strictDiagnosticCount}:${materialDiagnostics.strictDiagnosticPanelIds?.join(',') || '-'}` : null,
    troubleshootingStatus: troubleshooting.status,
    troubleshootingIssueCodes: troubleshooting.issueCodes,
    failedChecks: failed.map((check) => check.id),
    checks,
  };
}

async function main() {
  let options = parseArgs(process.argv.slice(2));
  let summaryUrl = options.fixturePath ? null : createSummaryUrl(options.baseUrl);
  let startedAt = Date.now();
  let lastReport = null;
  let lastError = null;
  let attempts = 0;

  do {
    attempts += 1;
    try {
      let summary = options.fixturePath
        ? loadFixture(options.fixturePath)
        : await requestJson(summaryUrl, options.timeoutMs);
      lastReport = createHeadsetSummaryReport(summary, options);
      lastError = null;
      if (lastReport.ok || !options.waitMs || options.fixturePath) break;
    } catch (error) {
      lastError = error;
      if (!options.waitMs || options.fixturePath) throw error;
    }
    let remainingMs = options.waitMs - (Date.now() - startedAt);
    if (!options.waitMs || remainingMs <= 0 || options.fixturePath) break;
    await delay(Math.min(options.intervalMs, remainingMs));
  } while (Date.now() - startedAt < options.waitMs);

  if (!lastReport && lastError && (!options.waitMs || options.fixturePath)) throw lastError;
  let report = lastReport || {
    ok: false,
    version: 'xr-headset-summary-smoke-v1',
    failedChecks: ['summary-fetch'],
    error: 'summary-fetch-failed',
  };
  let elapsedMs = Date.now() - startedAt;
  report.waitMs = options.waitMs;
  report.deadlineMs = options.waitMs;
  report.elapsedMs = elapsedMs;
  report.timedOut = Boolean(options.waitMs && !report.ok && elapsedMs >= options.waitMs);
  if (report.timedOut && !report.failedChecks.includes('wait-timeout')) {
    report.failedChecks.push('wait-timeout');
    report.checks = Array.isArray(report.checks) ? report.checks : [];
    addCheck(report.checks, 'wait-timeout', false, {
      waitMs: options.waitMs,
      elapsedMs,
      attempts,
    });
  }
  report.attempts = attempts;
  report.lastError = lastError ? sanitizeErrorMessage(lastError) : null;
  report.lastErrorName = lastError?.name || null;
  report.summaryUrl = options.fixturePath ? null : createSummaryUrl(options.baseUrl).href;
  report.nextAction = deriveNextAction(report);
  report.reportPath = path.resolve(options.reportPath);
  fs.mkdirSync(path.dirname(report.reportPath), { recursive: true });
  fs.writeFileSync(report.reportPath, `${JSON.stringify(report, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (!report.ok) process.exitCode = 1;
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exitCode = 1;
});
