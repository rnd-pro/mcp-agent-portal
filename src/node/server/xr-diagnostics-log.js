import fs from 'node:fs';
import path from 'node:path';
import { createXRThreeTroubleshootingSummary } from 'symbiote-node/xr';

const XR_DIAGNOSTIC_LOG_LIMIT = 80;
const XR_DIAGNOSTIC_CLIENT_STALE_MS = 15000;

function sanitizeXrDiagnosticId(value, fallback = 'unknown') {
  let id = String(value || '').replace(/[^a-zA-Z0-9_.:-]/g, '').slice(0, 80);
  return id || fallback;
}

function sanitizeXrDiagnosticUrl(value) {
  if (!value) return '';
  try {
    let url = new URL(String(value), 'https://agent-portal.invalid/');
    for (let key of [...url.searchParams.keys()]) {
      if (/token|secret|password|cookie|authorization|auth|key|session|code/i.test(key)) {
        url.searchParams.set(key, '[redacted]');
      }
    }
    if (url.hash?.includes('?')) {
      let [route, query] = url.hash.slice(1).split('?');
      let params = new URLSearchParams(query);
      for (let key of [...params.keys()]) {
        if (/token|secret|password|cookie|authorization|auth|key|session|code/i.test(key)) {
          params.set(key, '[redacted]');
        }
      }
      url.hash = `${route}?${params.toString()}`;
    }
    return (String(value).startsWith('http') ? url.href : `${url.pathname}${url.search}${url.hash}`).slice(0, 300);
  } catch {
    return String(value)
      .replace(/([?&][^=]*(?:token|secret|password|cookie|authorization|auth|key|session|code)[^=]*=)[^&#]*/gi, '$1[redacted]')
      .slice(0, 300);
  }
}

function sanitizeXrDiagnosticDetails(value, depth = 0) {
  if (depth > 8) return '[max-depth]';
  if (value == null) return null;
  if (typeof value === 'string') return value.slice(0, 500);
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (Array.isArray(value)) return value.slice(0, 40).map((item) => sanitizeXrDiagnosticDetails(item, depth + 1));
  if (typeof value !== 'object') return String(value).slice(0, 120);
  let out = {};
  for (let [key, item] of Object.entries(value).slice(0, 80)) {
    if (/token|secret|password|cookie|authorization/i.test(key)) continue;
    out[key.slice(0, 80)] = sanitizeXrDiagnosticDetails(item, depth + 1);
  }
  return out;
}

function normalizeXrDiagnosticLog(req, body = {}, options = {}) {
  let surface = body.surface && typeof body.surface === 'object' ? body.surface : {};
  return {
    id: `${Date.now().toString(36)}-${options.count.toString(36)}`,
    receivedAt: new Date().toISOString(),
    address: req.socket?.remoteAddress || '',
    host: String(req.headers.host || '').slice(0, 160),
    userAgent: String(req.headers['user-agent'] || '').slice(0, 240),
    clientId: sanitizeXrDiagnosticId(body.clientId, 'anonymous-client'),
    event: String(body.event || 'diagnostic').slice(0, 80),
    surface: {
      surfaceKind: String(body.surfaceKind || surface.surfaceKind || '').slice(0, 80) || null,
      entrypoint: String(body.entrypoint || surface.entrypoint || '').slice(0, 120) || null,
      projectId: String(body.projectId || surface.projectId || '').slice(0, 120) || null,
      targetSection: String(body.targetSection || surface.targetSection || '').slice(0, 120) || null,
      panelContentKind: String(body.panelContentKind || surface.panelContentKind || '').slice(0, 120) || null,
    },
    pageUrl: sanitizeXrDiagnosticUrl(body.pageUrl),
    secureContext: body.secureContext === true,
    navigatorXr: body.navigatorXr === true,
    modes: body.modes && typeof body.modes === 'object'
      ? {
        inline: Boolean(body.modes.inline),
        immersiveVr: Boolean(body.modes.immersiveVr),
        immersiveAr: Boolean(body.modes.immersiveAr),
      }
      : null,
    launch: body.launch && typeof body.launch === 'object'
      ? {
        canLaunch: Boolean(body.launch.canLaunch),
        mode: body.launch.mode || null,
        reason: body.launch.reason || null,
      }
      : null,
    session: normalizeXrDiagnosticSessionSummary(body.session),
    error: body.error ? String(body.error).slice(0, 300) : null,
    details: sanitizeXrDiagnosticDetails(body.details),
    demoMode: options.demoMode === true,
  };
}

function isImmersiveXrClient(client = {}) {
  return Boolean(
    client.session?.active ||
    client.session?.status === 'running' ||
    client.session?.mode?.startsWith?.('immersive-') ||
    Number(client.session?.frames || 0) > 0
  );
}

function addClientFreshness(client, nowMs) {
  let lastSeenMs = Date.parse(client.lastSeenAt || '');
  let ageMs = Number.isFinite(lastSeenMs) ? Math.max(0, nowMs - lastSeenMs) : null;
  return {
    ...client,
    ageMs,
    stale: ageMs == null ? true : ageMs > XR_DIAGNOSTIC_CLIENT_STALE_MS,
    staleAfterMs: XR_DIAGNOSTIC_CLIENT_STALE_MS,
  };
}

function createTimelineEntry(entry) {
  return {
    receivedAt: entry.receivedAt,
    event: entry.event,
    mode: entry.session?.mode || entry.launch?.mode || null,
    status: entry.session?.status || null,
    health: entry.session?.health?.status || null,
    htmlCanvasAvailability: entry.details?.htmlCanvas?.availability || null,
    htmlCanvasRecommendation: entry.details?.htmlCanvas?.recommendation || null,
    sceneQualityStatus: entry.details?.sceneQuality?.status || null,
    sceneQualityLowPanels: entry.details?.sceneQuality?.lowQualityCount ?? null,
    readinessStatus: entry.details?.readiness?.status || null,
    readinessReason: entry.details?.readiness?.reason || null,
    visualReadinessStatus: entry.details?.visualReadiness?.status || null,
    visualReadinessReason: entry.details?.visualReadiness?.reason || null,
    interactionReadinessStatus: entry.details?.interactionReadiness?.status || null,
    interactionReadinessReason: entry.details?.interactionReadiness?.reason || null,
    textureMode: entry.details?.texture?.debugMode?.mode || null,
    textureStage: entry.details?.texture?.stage || null,
    textureReason: entry.details?.texture?.reason || null,
    textureResolverStage: entry.details?.texture?.resolverStages?.[0]?.stage || null,
    textureResolverReason: entry.details?.texture?.resolverStages?.[0]?.reason || null,
    launchGateReason: entry.details?.launchGate?.reason || null,
    deepGraphNodes: Number.isFinite(Number(entry.details?.deepGraph?.nodeCount))
      ? Number(entry.details.deepGraph.nodeCount)
      : null,
    deepGraphEdges: Number.isFinite(Number(entry.details?.deepGraph?.edgeCount))
      ? Number(entry.details.deepGraph.edgeCount)
      : null,
    deepGraphFocus: entry.details?.deepGraph?.focus?.nodeId || entry.details?.deepGraph?.focusNodeId || null,
    deepGraphPreviewStatus: entry.details?.deepGraphPreview?.summary?.status || null,
    deepGraphFocusVisible: entry.details?.deepGraphPreview?.summary?.focus?.visible ?? null,
    error: entry.error || entry.session?.lastError || null,
  };
}

function sanitizeStringList(value, limit = 16) {
  return Array.isArray(value)
    ? value.slice(0, limit).map((item) => String(item).slice(0, 120))
    : [];
}

function normalizeHtmlCanvasDiagnosticSummary(htmlCanvas = null) {
  if (!htmlCanvas || typeof htmlCanvas !== 'object') return null;
  return {
    supported: htmlCanvas.supported === true,
    availability: htmlCanvas.availability ? String(htmlCanvas.availability).slice(0, 120) : null,
    recommendation: htmlCanvas.recommendation ? String(htmlCanvas.recommendation).slice(0, 160) : null,
    requiredFlag: htmlCanvas.requiredFlag ? String(htmlCanvas.requiredFlag).slice(0, 120) : null,
    renderTargetAvailable: htmlCanvas.renderTargetAvailable === true,
    textureUploadAvailable: htmlCanvas.textureUploadAvailable === true,
    missing: sanitizeStringList(htmlCanvas.missing),
    blockingMissing: sanitizeStringList(htmlCanvas.blockingMissing),
    missingCore: sanitizeStringList(htmlCanvas.missingCore),
    missingTexture: sanitizeStringList(htmlCanvas.missingTexture),
    threeTexture: htmlCanvas.threeTexture && typeof htmlCanvas.threeTexture === 'object'
      ? {
        version: htmlCanvas.threeTexture.version ? String(htmlCanvas.threeTexture.version).slice(0, 120) : null,
        renderer: htmlCanvas.threeTexture.renderer ? String(htmlCanvas.threeTexture.renderer).slice(0, 80) : null,
        threeRevision: htmlCanvas.threeTexture.threeRevision ? String(htmlCanvas.threeTexture.threeRevision).slice(0, 40) : null,
        htmlTextureAvailable: htmlCanvas.threeTexture.htmlTextureAvailable === true,
        htmlTextureRequired: htmlCanvas.threeTexture.htmlTextureRequired === true,
        textureUploadAvailable: htmlCanvas.threeTexture.textureUploadAvailable === true,
        ready: htmlCanvas.threeTexture.ready === true,
        reason: htmlCanvas.threeTexture.reason ? String(htmlCanvas.threeTexture.reason).slice(0, 160) : null,
      }
      : null,
    originTrial: htmlCanvas.originTrial && typeof htmlCanvas.originTrial === 'object'
      ? {
        status: htmlCanvas.originTrial.status ? String(htmlCanvas.originTrial.status).slice(0, 80) : null,
        chromeMilestoneRange: htmlCanvas.originTrial.chromeMilestoneRange ? String(htmlCanvas.originTrial.chromeMilestoneRange).slice(0, 80) : null,
        localTestBrowser: htmlCanvas.originTrial.localTestBrowser ? String(htmlCanvas.originTrial.localTestBrowser).slice(0, 120) : null,
        flagUrl: htmlCanvas.originTrial.flagUrl ? String(htmlCanvas.originTrial.flagUrl).slice(0, 160) : null,
        source: htmlCanvas.originTrial.source ? String(htmlCanvas.originTrial.source).slice(0, 200) : null,
      }
      : null,
    enablement: htmlCanvas.enablement && typeof htmlCanvas.enablement === 'object'
      ? {
        version: htmlCanvas.enablement.version ? String(htmlCanvas.enablement.version).slice(0, 120) : null,
        secureContext: htmlCanvas.enablement.secureContext !== false,
        originTrialMetaPresent: htmlCanvas.enablement.originTrialMetaPresent === true,
        originTrialMetaCount: Number.isFinite(Number(htmlCanvas.enablement.originTrialMetaCount))
          ? Number(htmlCanvas.enablement.originTrialMetaCount)
          : 0,
        originTrialConfigured: htmlCanvas.enablement.originTrialConfigured === true,
        requiredFlag: htmlCanvas.enablement.requiredFlag ? String(htmlCanvas.enablement.requiredFlag).slice(0, 120) : null,
        flagUrl: htmlCanvas.enablement.flagUrl ? String(htmlCanvas.enablement.flagUrl).slice(0, 160) : null,
        source: htmlCanvas.enablement.source ? String(htmlCanvas.enablement.source).slice(0, 200) : null,
      }
      : null,
    responseHeader: htmlCanvas.responseHeader && typeof htmlCanvas.responseHeader === 'object'
      ? {
        checked: htmlCanvas.responseHeader.checked === true,
        originTrialPresent: htmlCanvas.responseHeader.originTrialPresent === true,
        diagnosticHeader: htmlCanvas.responseHeader.diagnosticHeader
          ? String(htmlCanvas.responseHeader.diagnosticHeader).slice(0, 120)
          : null,
        error: htmlCanvas.responseHeader.error ? String(htmlCanvas.responseHeader.error).slice(0, 160) : null,
      }
      : null,
  };
}

function normalizeTextureDiagnosticSummary(texture = null) {
  if (!texture || typeof texture !== 'object') return null;
  return {
    strict: texture.strict === true,
    debugMode: texture.debugMode && typeof texture.debugMode === 'object'
      ? {
        version: texture.debugMode.version ? String(texture.debugMode.version).slice(0, 120) : null,
        mode: texture.debugMode.mode ? String(texture.debugMode.mode).slice(0, 80) : null,
        strict: texture.debugMode.strict === true,
        requireTextureUpload: texture.debugMode.requireTextureUpload === true,
        hideStrictTextureFailures: texture.debugMode.hideStrictTextureFailures === true,
        allowMaterialFallback: texture.debugMode.allowMaterialFallback === true,
        reason: texture.debugMode.reason ? String(texture.debugMode.reason).slice(0, 160) : null,
      }
      : null,
    total: Number.isFinite(Number(texture.total)) ? Number(texture.total) : 0,
    ready: Number.isFinite(Number(texture.ready)) ? Number(texture.ready) : 0,
    blocked: texture.blocked === true,
    reason: texture.reason ? String(texture.reason).slice(0, 160) : null,
    stage: texture.stage ? String(texture.stage).slice(0, 120) : null,
    requiredApi: Array.isArray(texture.requiredApi)
      ? texture.requiredApi.slice(0, 16).map((item) => String(item).slice(0, 120))
      : [],
    bridgeVersion: texture.bridgeVersion ? String(texture.bridgeVersion).slice(0, 120) : null,
    bridgeStages: Array.isArray(texture.bridgeStages)
      ? texture.bridgeStages.slice(0, 16).map((item) => ({
        panelId: sanitizeXrDiagnosticId(item?.panelId, 'panel'),
        stage: item?.stage ? String(item.stage).slice(0, 120) : null,
        source: item?.source ? String(item.source).slice(0, 80) : null,
        mode: item?.mode ? String(item.mode).slice(0, 80) : null,
        ok: item?.ok === true,
        reason: item?.reason ? String(item.reason).slice(0, 160) : null,
        textureApplied: item?.textureApplied === true,
      }))
      : [],
    resolverVersion: texture.resolverVersion ? String(texture.resolverVersion).slice(0, 120) : null,
    resolverTextures: Number.isFinite(Number(texture.resolverTextures)) ? Number(texture.resolverTextures) : 0,
    resolverStages: Array.isArray(texture.resolverStages)
      ? texture.resolverStages.slice(0, 16).map((item) => ({
        panelId: sanitizeXrDiagnosticId(item?.panelId, 'panel'),
        stage: item?.stage ? String(item.stage).slice(0, 120) : null,
        ok: item?.ok === true,
        reason: item?.reason ? String(item.reason).slice(0, 160) : null,
        textureApplied: item?.textureApplied === true,
        width: Number.isFinite(Number(item?.width)) ? Number(item.width) : null,
        height: Number.isFinite(Number(item?.height)) ? Number(item.height) : null,
        mode: item?.mode ? String(item.mode).slice(0, 80) : null,
      }))
      : [],
  };
}

function normalizeSceneQualityDiagnosticSummary(sceneQuality = null) {
  if (!sceneQuality || typeof sceneQuality !== 'object') return null;
  let panels = Array.isArray(sceneQuality.panels)
    ? sceneQuality.panels.slice(0, 16).map((panel) => ({
      panelId: sanitizeXrDiagnosticId(panel?.panelId, 'panel'),
      textureStatus: panel?.textureStatus ? String(panel.textureStatus).slice(0, 80) : null,
      comfortStatus: panel?.comfortStatus ? String(panel.comfortStatus).slice(0, 80) : null,
      facingStatus: panel?.facingStatus ? String(panel.facingStatus).slice(0, 80) : null,
      pixelsPerMeter: Number.isFinite(Number(panel?.pixelsPerMeter)) ? Number(panel.pixelsPerMeter) : null,
      distance: Number.isFinite(Number(panel?.distance)) ? Number(panel.distance) : null,
      position: sanitizeStringList(panel?.position, 3),
      rotation: sanitizeStringList(panel?.rotation, 3),
    }))
    : [];
  return {
    version: sceneQuality.version ? String(sceneQuality.version).slice(0, 120) : null,
    status: sceneQuality.status ? String(sceneQuality.status).slice(0, 80) : null,
    total: Number.isFinite(Number(sceneQuality.total)) ? Number(sceneQuality.total) : panels.length,
    lowQualityCount: Number.isFinite(Number(sceneQuality.lowQualityCount)) ? Number(sceneQuality.lowQualityCount) : 0,
    comfortWarningCount: Number.isFinite(Number(sceneQuality.comfortWarningCount)) ? Number(sceneQuality.comfortWarningCount) : 0,
    facingWarningCount: Number.isFinite(Number(sceneQuality.facingWarningCount)) ? Number(sceneQuality.facingWarningCount) : 0,
    panels,
  };
}

function normalizeReadinessDiagnosticSummary(readiness = null) {
  if (!readiness || typeof readiness !== 'object') return null;
  return {
    version: readiness.version ? String(readiness.version).slice(0, 120) : null,
    ready: readiness.ready === true,
    running: readiness.running === true,
    status: readiness.status ? String(readiness.status).slice(0, 80) : null,
    reason: readiness.reason ? String(readiness.reason).slice(0, 160) : null,
    mode: readiness.mode ? String(readiness.mode).slice(0, 80) : null,
    blockingChecks: Array.isArray(readiness.blockingChecks)
      ? readiness.blockingChecks.slice(0, 16).map((check) => ({
        id: check?.id ? String(check.id).slice(0, 120) : 'check',
        status: check?.status ? String(check.status).slice(0, 80) : null,
        reason: check?.reason ? String(check.reason).slice(0, 160) : null,
      }))
      : [],
  };
}

function normalizeReadinessCheckList(value, limit = 24) {
  return Array.isArray(value)
    ? value.slice(0, limit).map((check) => ({
      id: check?.id ? String(check.id).slice(0, 120) : 'check',
      status: check?.status ? String(check.status).slice(0, 80) : null,
      reason: check?.reason ? String(check.reason).slice(0, 160) : null,
    }))
    : [];
}

function normalizeVisualReadinessDiagnosticSummary(readiness = null) {
  if (!readiness || typeof readiness !== 'object') return null;
  return {
    version: readiness.version ? String(readiness.version).slice(0, 120) : null,
    ready: readiness.ready === true,
    status: readiness.status ? String(readiness.status).slice(0, 80) : null,
    reason: readiness.reason ? String(readiness.reason).slice(0, 160) : null,
    expectedStatus: readiness.expectedStatus ? String(readiness.expectedStatus).slice(0, 80) : null,
    issueIds: sanitizeStringList(readiness.issueIds, 24),
    expectedIssueIds: sanitizeStringList(readiness.expectedIssueIds, 24),
    missingIssueIds: sanitizeStringList(readiness.missingIssueIds, 24),
    unexpectedIssueIds: sanitizeStringList(readiness.unexpectedIssueIds, 24),
    failCount: Number.isFinite(Number(readiness.failCount)) ? Number(readiness.failCount) : 0,
    warnCount: Number.isFinite(Number(readiness.warnCount)) ? Number(readiness.warnCount) : 0,
    checks: normalizeReadinessCheckList(readiness.checks),
  };
}

function normalizeInteractionReadinessDiagnosticSummary(readiness = null) {
  if (!readiness || typeof readiness !== 'object') return null;
  return {
    version: readiness.version ? String(readiness.version).slice(0, 120) : null,
    ready: readiness.ready === true,
    status: readiness.status ? String(readiness.status).slice(0, 80) : null,
    reason: readiness.reason ? String(readiness.reason).slice(0, 160) : null,
    issueCodes: sanitizeStringList(readiness.issueCodes, 24),
    checks: normalizeReadinessCheckList(readiness.checks),
    frameTarget: normalizeFrameTargetSummary(readiness.frameTarget),
    dragging: readiness.dragging && typeof readiness.dragging === 'object'
      ? {
        panelId: readiness.dragging.panelId ? sanitizeXrDiagnosticId(readiness.dragging.panelId, null) : null,
        frameTarget: normalizeFrameTargetSummary(readiness.dragging.frameTarget),
        appliedDistance: Number.isFinite(Number(readiness.dragging.appliedDistance))
          ? Number(readiness.dragging.appliedDistance)
          : null,
        clamped: readiness.dragging.clamped === true,
        settled: readiness.dragging.settled === true,
      }
      : null,
  };
}

function normalizeLaunchGateDiagnosticSummary(launchGate = null) {
  if (!launchGate || typeof launchGate !== 'object') return null;
  return {
    version: launchGate.version ? String(launchGate.version).slice(0, 120) : null,
    canStart: launchGate.canStart === true,
    blocked: launchGate.blocked === true,
    reason: launchGate.reason ? String(launchGate.reason).slice(0, 160) : null,
    mode: launchGate.mode ? String(launchGate.mode).slice(0, 80) : null,
    blockingChecks: Array.isArray(launchGate.blockingChecks)
      ? launchGate.blockingChecks.slice(0, 16).map((check) => ({
        id: check?.id ? String(check.id).slice(0, 120) : 'check',
        reason: check?.reason ? String(check.reason).slice(0, 160) : null,
      }))
      : [],
  };
}

function normalizeDeepGraphDiagnosticSummary(deepGraph = null) {
  if (!deepGraph || typeof deepGraph !== 'object') return null;
  return {
    version: deepGraph.version ? String(deepGraph.version).slice(0, 120) : null,
    sceneVersion: deepGraph.sceneVersion ? String(deepGraph.sceneVersion).slice(0, 120) : null,
    nodeCount: Number.isFinite(Number(deepGraph.nodeCount)) ? Number(deepGraph.nodeCount) : 0,
    edgeCount: Number.isFinite(Number(deepGraph.edgeCount)) ? Number(deepGraph.edgeCount) : 0,
    connectedNodeCount: Number.isFinite(Number(deepGraph.connectedNodeCount)) ? Number(deepGraph.connectedNodeCount) : 0,
    orphanNodeCount: Number.isFinite(Number(deepGraph.orphanNodeCount)) ? Number(deepGraph.orphanNodeCount) : 0,
    maxDepth: Number.isFinite(Number(deepGraph.maxDepth)) ? Number(deepGraph.maxDepth) : 0,
    focusNodeId: deepGraph.focusNodeId ? String(deepGraph.focusNodeId).slice(0, 240) : null,
    focus: deepGraph.focus && typeof deepGraph.focus === 'object'
      ? {
        nodeId: deepGraph.focus.nodeId ? String(deepGraph.focus.nodeId).slice(0, 240) : null,
        found: deepGraph.focus.found === true,
        depth: Number.isFinite(Number(deepGraph.focus.depth)) ? Number(deepGraph.focus.depth) : null,
        incoming: Number.isFinite(Number(deepGraph.focus.incoming)) ? Number(deepGraph.focus.incoming) : 0,
        outgoing: Number.isFinite(Number(deepGraph.focus.outgoing)) ? Number(deepGraph.focus.outgoing) : 0,
      }
      : null,
    edgeTypes: deepGraph.edgeTypes && typeof deepGraph.edgeTypes === 'object'
      ? Object.fromEntries(Object.entries(deepGraph.edgeTypes).slice(0, 24).map(([type, count]) => [
        String(type).slice(0, 120),
        Number.isFinite(Number(count)) ? Number(count) : 0,
      ]))
      : {},
  };
}

function normalizeDeepGraphPreviewDiagnosticSummary(deepGraphPreview = null) {
  if (!deepGraphPreview || typeof deepGraphPreview !== 'object') return null;
  let summary = deepGraphPreview.summary && typeof deepGraphPreview.summary === 'object'
    ? deepGraphPreview.summary
    : {};
  return {
    version: deepGraphPreview.version ? String(deepGraphPreview.version).slice(0, 120) : null,
    nodeCount: Number.isFinite(Number(deepGraphPreview.nodes)) ? Number(deepGraphPreview.nodes) : 0,
    edgeCount: Number.isFinite(Number(deepGraphPreview.edges)) ? Number(deepGraphPreview.edges) : 0,
    source: deepGraphPreview.source && typeof deepGraphPreview.source === 'object'
      ? {
        nodeCount: Number.isFinite(Number(deepGraphPreview.source.nodeCount)) ? Number(deepGraphPreview.source.nodeCount) : 0,
        edgeCount: Number.isFinite(Number(deepGraphPreview.source.edgeCount)) ? Number(deepGraphPreview.source.edgeCount) : 0,
      }
      : null,
    summary: {
      version: summary.version ? String(summary.version).slice(0, 120) : null,
      status: summary.status ? String(summary.status).slice(0, 80) : null,
      nodes: summary.nodes && typeof summary.nodes === 'object'
        ? {
          visible: Number.isFinite(Number(summary.nodes.visible)) ? Number(summary.nodes.visible) : 0,
          source: Number.isFinite(Number(summary.nodes.source)) ? Number(summary.nodes.source) : 0,
          hidden: Number.isFinite(Number(summary.nodes.hidden)) ? Number(summary.nodes.hidden) : 0,
          coverage: Number.isFinite(Number(summary.nodes.coverage)) ? Number(summary.nodes.coverage) : 0,
          limit: Number.isFinite(Number(summary.nodes.limit)) ? Number(summary.nodes.limit) : 0,
        }
        : null,
      edges: summary.edges && typeof summary.edges === 'object'
        ? {
          visible: Number.isFinite(Number(summary.edges.visible)) ? Number(summary.edges.visible) : 0,
          source: Number.isFinite(Number(summary.edges.source)) ? Number(summary.edges.source) : 0,
          hidden: Number.isFinite(Number(summary.edges.hidden)) ? Number(summary.edges.hidden) : 0,
          coverage: Number.isFinite(Number(summary.edges.coverage)) ? Number(summary.edges.coverage) : 0,
          limit: Number.isFinite(Number(summary.edges.limit)) ? Number(summary.edges.limit) : 0,
        }
        : null,
      focus: summary.focus && typeof summary.focus === 'object'
        ? {
          nodeId: summary.focus.nodeId ? String(summary.focus.nodeId).slice(0, 240) : null,
          visible: summary.focus.visible === true,
          edges: summary.focus.edges && typeof summary.focus.edges === 'object'
            ? {
              visible: Number.isFinite(Number(summary.focus.edges.visible)) ? Number(summary.focus.edges.visible) : 0,
              source: Number.isFinite(Number(summary.focus.edges.source)) ? Number(summary.focus.edges.source) : 0,
            }
            : { visible: 0, source: 0 },
        }
        : null,
    },
  };
}

function normalizeSessionHealthSummary(health = null) {
  if (!health || typeof health !== 'object') return null;
  return {
    version: health.version ? String(health.version).slice(0, 120) : null,
    status: health.status ? String(health.status).slice(0, 80) : null,
    reason: health.reason ? String(health.reason).slice(0, 160) : null,
    checks: health.checks && typeof health.checks === 'object'
      ? {
        running: health.checks.running === true,
        active: health.checks.active === true,
        frames: Number.isFinite(Number(health.checks.frames)) ? Number(health.checks.frames) : 0,
        panelCount: Number.isFinite(Number(health.checks.panelCount)) ? Number(health.checks.panelCount) : 0,
        controllers: Number.isFinite(Number(health.checks.controllers)) ? Number(health.checks.controllers) : 0,
        controllerRayVisuals: Number.isFinite(Number(health.checks.controllerRayVisuals)) ? Number(health.checks.controllerRayVisuals) : 0,
        hitReticleVisuals: Number.isFinite(Number(health.checks.hitReticleVisuals)) ? Number(health.checks.hitReticleVisuals) : 0,
        hoverPanelId: health.checks.hoverPanelId ? sanitizeXrDiagnosticId(health.checks.hoverPanelId, null) : null,
        fps: Number.isFinite(Number(health.checks.fps)) ? Number(health.checks.fps) : null,
      }
      : {},
    issues: Array.isArray(health.issues)
      ? health.issues.slice(0, 16).map((issue) => ({
        severity: issue?.severity ? String(issue.severity).slice(0, 80) : null,
        code: issue?.code ? String(issue.code).slice(0, 120) : null,
        value: issue?.value == null ? null : String(issue.value).slice(0, 160),
      }))
      : [],
  };
}

function normalizeInputSourceSummary(value) {
  return Array.isArray(value)
    ? value.slice(0, 8).map((source) => ({
      handedness: source?.handedness ? String(source.handedness).slice(0, 40) : null,
      targetRayMode: source?.targetRayMode ? String(source.targetRayMode).slice(0, 80) : null,
      profiles: sanitizeStringList(source?.profiles, 8),
    }))
    : [];
}

function normalizeSessionOptionsSummary(value) {
  return value && typeof value === 'object'
    ? {
      referenceSpaceType: value.referenceSpaceType ? String(value.referenceSpaceType).slice(0, 80) : null,
      optionalFeatures: sanitizeStringList(value.optionalFeatures, 16),
      requiredFeatures: sanitizeStringList(value.requiredFeatures, 16),
      domOverlay: value.domOverlay === true,
    }
    : {
      referenceSpaceType: null,
      optionalFeatures: [],
      requiredFeatures: [],
      domOverlay: false,
    };
}

function normalizePanelPoint(value) {
  return value && typeof value === 'object'
    ? {
      x: Number.isFinite(Number(value.x)) ? Number(value.x) : null,
      y: Number.isFinite(Number(value.y)) ? Number(value.y) : null,
    }
    : null;
}

function normalizeVectorSummary(value, limit = 3) {
  if (Array.isArray(value)) {
    return value.slice(0, limit).map((item) => Number.isFinite(Number(item)) ? Number(item) : null);
  }
  if (value && typeof value === 'object') {
    return ['x', 'y', 'z'].slice(0, limit).map((key) => Number.isFinite(Number(value[key])) ? Number(value[key]) : null);
  }
  return null;
}

function normalizeRenderStateSummary(value = null) {
  if (!value || typeof value !== 'object') return null;
  return {
    version: value.version ? String(value.version).slice(0, 120) : null,
    baseLayer: value.baseLayer && typeof value.baseLayer === 'object'
      ? {
        present: value.baseLayer.present === true,
        framebufferWidth: Number.isFinite(Number(value.baseLayer.framebufferWidth)) ? Number(value.baseLayer.framebufferWidth) : null,
        framebufferHeight: Number.isFinite(Number(value.baseLayer.framebufferHeight)) ? Number(value.baseLayer.framebufferHeight) : null,
        fixedFoveation: Number.isFinite(Number(value.baseLayer.fixedFoveation)) ? Number(value.baseLayer.fixedFoveation) : null,
      }
      : null,
    layers: value.layers && typeof value.layers === 'object'
      ? {
        count: Number.isFinite(Number(value.layers.count)) ? Number(value.layers.count) : 0,
        present: value.layers.present === true,
      }
      : null,
    depthNear: Number.isFinite(Number(value.depthNear)) ? Number(value.depthNear) : null,
    depthFar: Number.isFinite(Number(value.depthFar)) ? Number(value.depthFar) : null,
  };
}

function normalizeViewportSummary(value = null) {
  if (!value || typeof value !== 'object') return null;
  return {
    version: value.version ? String(value.version).slice(0, 120) : null,
    viewCount: Number.isFinite(Number(value.viewCount)) ? Number(value.viewCount) : 0,
    views: Array.isArray(value.views)
      ? value.views.slice(0, 4).map((view) => ({
        eye: view?.eye ? String(view.eye).slice(0, 40) : null,
        viewport: view?.viewport && typeof view.viewport === 'object'
          ? {
            x: Number.isFinite(Number(view.viewport.x)) ? Number(view.viewport.x) : null,
            y: Number.isFinite(Number(view.viewport.y)) ? Number(view.viewport.y) : null,
            width: Number.isFinite(Number(view.viewport.width)) ? Number(view.viewport.width) : null,
            height: Number.isFinite(Number(view.viewport.height)) ? Number(view.viewport.height) : null,
          }
          : null,
        projectionMatrix: view?.projectionMatrix === true,
        transform: view?.transform === true,
      }))
      : [],
  };
}

function normalizeMaterialDiagnosticsSummary(value = null) {
  if (!value || typeof value !== 'object') return null;
  return {
    version: value.version ? String(value.version).slice(0, 120) : null,
    total: Number.isFinite(Number(value.total)) ? Number(value.total) : 0,
    transparentCount: Number.isFinite(Number(value.transparentCount)) ? Number(value.transparentCount) : 0,
    mappedCount: Number.isFinite(Number(value.mappedCount)) ? Number(value.mappedCount) : 0,
    strictDiagnosticCount: Number.isFinite(Number(value.strictDiagnosticCount)) ? Number(value.strictDiagnosticCount) : 0,
    strictDiagnosticPanelIds: sanitizeStringList(value.strictDiagnosticPanelIds, 16),
    panels: Array.isArray(value.panels)
      ? value.panels.slice(0, 16).map((panel) => ({
        panelId: panel?.panelId ? sanitizeXrDiagnosticId(panel.panelId, 'panel') : null,
        visible: panel?.visible !== false,
        transparent: panel?.transparent === true,
        opacity: Number.isFinite(Number(panel?.opacity)) ? Number(panel.opacity) : null,
        mapApplied: panel?.mapApplied === true,
        textureKind: panel?.texture?.kind ? String(panel.texture.kind).slice(0, 80) : null,
        textureWidth: Number.isFinite(Number(panel?.texture?.width)) ? Number(panel.texture.width) : null,
        textureHeight: Number.isFinite(Number(panel?.texture?.height)) ? Number(panel.texture.height) : null,
        strictDiagnostic: panel?.strictDiagnostic === true,
        strictDiagnosticReason: panel?.strictDiagnosticReason ? String(panel.strictDiagnosticReason).slice(0, 160) : null,
      }))
      : [],
  };
}

function normalizeFrameTargetSummary(value) {
  if (!value || typeof value !== 'object') return null;
  return {
    panelId: value.panelId ? sanitizeXrDiagnosticId(value.panelId, null) : null,
    operation: value.operation ? String(value.operation).slice(0, 80) : null,
    zone: value.zone ? String(value.zone).slice(0, 80) : null,
    handle: value.handle ? String(value.handle).slice(0, 80) : null,
    action: value.action ? String(value.action).slice(0, 80) : null,
  };
}

function normalizeXrDiagnosticSessionSummary(session = null) {
  if (!session || typeof session !== 'object') return null;
  return {
    version: session.version ? String(session.version).slice(0, 120) : null,
    timestamp: Number.isFinite(Number(session.timestamp)) ? Number(session.timestamp) : null,
    status: session.status ? String(session.status).slice(0, 80) : null,
    mode: session.mode ? String(session.mode).slice(0, 80) : null,
    active: session.active === true,
    visibilityState: session.visibilityState ? String(session.visibilityState).slice(0, 80) : null,
    environmentBlendMode: session.environmentBlendMode ? String(session.environmentBlendMode).slice(0, 80) : null,
    interactionMode: session.interactionMode ? String(session.interactionMode).slice(0, 80) : null,
    enabledFeatures: sanitizeStringList(session.enabledFeatures, 16),
    inputSources: normalizeInputSourceSummary(session.inputSources),
    sessionOptions: normalizeSessionOptionsSummary(session.sessionOptions),
    renderState: normalizeRenderStateSummary(session.renderState),
    viewports: normalizeViewportSummary(session.viewports),
    frames: Number.isFinite(Number(session.frames)) ? Number(session.frames) : 0,
    controllers: Number.isFinite(Number(session.controllers)) ? Number(session.controllers) : 0,
    controllerRayVisuals: Number.isFinite(Number(session.controllerRayVisuals)) ? Number(session.controllerRayVisuals) : 0,
    hitReticleVisuals: Number.isFinite(Number(session.hitReticleVisuals)) ? Number(session.hitReticleVisuals) : 0,
    selectedPanelId: session.selectedPanelId ? sanitizeXrDiagnosticId(session.selectedPanelId, null) : null,
    draggingPanelId: session.draggingPanelId ? sanitizeXrDiagnosticId(session.draggingPanelId, null) : null,
    hover: session.hover && typeof session.hover === 'object'
      ? {
        panelId: session.hover.panelId ? sanitizeXrDiagnosticId(session.hover.panelId, null) : null,
        point: normalizePanelPoint(session.hover.point),
        distance: Number.isFinite(Number(session.hover.distance)) ? Number(session.hover.distance) : 0,
        reticleVisible: session.hover.reticleVisible === true,
        frameTarget: normalizeFrameTargetSummary(session.hover.frameTarget),
      }
      : null,
    interactionEvents: Number.isFinite(Number(session.interactionEvents)) ? Number(session.interactionEvents) : 0,
    lastEvent: session.lastEvent ? String(session.lastEvent).slice(0, 160) : null,
    lastError: session.lastError ? String(session.lastError).slice(0, 300) : null,
    panelCount: Number.isFinite(Number(session.panelCount)) ? Number(session.panelCount) : 0,
    materialDiagnostics: normalizeMaterialDiagnosticsSummary(session.materialDiagnostics),
    drag: session.drag && typeof session.drag === 'object'
      ? {
        active: session.drag.active === true,
        panelId: session.drag.panelId ? sanitizeXrDiagnosticId(session.drag.panelId, null) : null,
        appliedDistance: Number.isFinite(Number(session.drag.appliedDistance)) ? Number(session.drag.appliedDistance) : null,
        rawDistance: Number.isFinite(Number(session.drag.rawDistance)) ? Number(session.drag.rawDistance) : null,
        smoothing: Number.isFinite(Number(session.drag.smoothing)) ? Number(session.drag.smoothing) : null,
        maxStep: Number.isFinite(Number(session.drag.maxStep)) ? Number(session.drag.maxStep) : null,
        deadzone: Number.isFinite(Number(session.drag.deadzone)) ? Number(session.drag.deadzone) : null,
        clamped: session.drag.clamped === true,
        settled: session.drag.settled === true,
        frameTarget: normalizeFrameTargetSummary(session.drag.frameTarget),
        position: normalizeVectorSummary(session.drag.position),
        rotation: normalizeVectorSummary(session.drag.rotation),
        size: normalizeVectorSummary(session.drag.size, 2),
        resize: session.drag.resize && typeof session.drag.resize === 'object'
          ? {
            operation: session.drag.resize.operation ? String(session.drag.resize.operation).slice(0, 80) : null,
            handle: session.drag.resize.handle ? String(session.drag.resize.handle).slice(0, 80) : null,
            size: normalizeVectorSummary(session.drag.resize.size, 2),
            delta: normalizePanelPoint(session.drag.resize.delta),
          }
          : null,
      }
      : null,
    health: normalizeSessionHealthSummary(session.health),
  };
}

function findLastEventValue(events, predicate) {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    if (predicate(events[index])) return events[index];
  }
  return null;
}

function resolveClientPhase(client = {}) {
  let events = Array.isArray(client.recentEvents) ? client.recentEvents : [];
  let latestEvent = events.at(-1)?.event || client.latestEvent || '';
  let sessionStatus = client.session?.status || findLastEventValue(events, (event) => event.status)?.status || null;
  let health = client.session?.health?.status || findLastEventValue(events, (event) => event.health)?.health || null;

  if (client.lastError || latestEvent.includes('error') || latestEvent.includes('failed')) return 'failed';
  if (latestEvent === 'spatial-three-session-ended') return 'ended';
  if (latestEvent === 'spatial-session-frame-check' && Number(client.session?.frames || 0) <= 0) return 'no-frames';
  if (latestEvent === 'three-panels-session-no-frames') return 'no-frames';
  if (latestEvent === 'spatial-three-session-start-requested') return 'starting';
  if (latestEvent === 'three-panels-session-still-starting') return 'starting';
  if (sessionStatus === 'running' || latestEvent === 'spatial-three-frame' || latestEvent === 'spatial-three-session-started' || latestEvent === 'three-panels-session-telemetry') return 'running';
  if (sessionStatus === 'starting' || latestEvent === 'three-panels-session-start-requested') return 'starting';
  if (client.launch?.canLaunch) return 'ready';
  if (health === 'blocked' || client.launch?.reason) return 'blocked';
  return 'preflight';
}

function createXrDiagnosticSummary(logs = []) {
  let generatedAt = new Date();
  let generatedAtMs = generatedAt.getTime();
  let eventCounts = {};
  let clientsById = new Map();
  let lastSession = null;
  let lastLaunch = null;
  let lastModes = null;
  let lastHtmlCanvas = null;
  let lastSceneQuality = null;
  let lastReadiness = null;
  let lastVisualReadiness = null;
  let lastInteractionReadiness = null;
  let lastTexture = null;
  let lastLaunchGate = null;
  let lastDeepGraph = null;
  let lastDeepGraphPreview = null;
  let lastError = null;
  for (let entry of logs) {
    eventCounts[entry.event] = (eventCounts[entry.event] || 0) + 1;
    let client = clientsById.get(entry.clientId) || {
      clientId: entry.clientId,
      firstSeenAt: entry.receivedAt,
      lastSeenAt: entry.receivedAt,
      eventCount: 0,
      latestEvent: null,
      surface: null,
      pageUrl: '',
      userAgent: '',
      modes: null,
      launch: null,
      session: null,
      htmlCanvas: null,
      sceneQuality: null,
      readiness: null,
      visualReadiness: null,
      interactionReadiness: null,
      texture: null,
      launchGate: null,
      deepGraph: null,
      deepGraphPreview: null,
      lastError: null,
      recentEvents: [],
    };
    client.lastSeenAt = entry.receivedAt;
    client.eventCount += 1;
    client.latestEvent = entry.event;
    client.surface = entry.surface;
    client.pageUrl = entry.pageUrl;
    client.userAgent = entry.userAgent;
    if (entry.modes) client.modes = entry.modes;
    if (entry.launch) client.launch = entry.launch;
    if (entry.session) client.session = entry.session;
    if (entry.details?.htmlCanvas) {
      client.htmlCanvas = normalizeHtmlCanvasDiagnosticSummary(entry.details.htmlCanvas);
      lastHtmlCanvas = client.htmlCanvas;
    }
    if (entry.details?.sceneQuality) {
      client.sceneQuality = normalizeSceneQualityDiagnosticSummary(entry.details.sceneQuality);
      lastSceneQuality = client.sceneQuality;
    }
    if (entry.details?.readiness) {
      client.readiness = normalizeReadinessDiagnosticSummary(entry.details.readiness);
      lastReadiness = client.readiness;
    }
    if (entry.details?.visualReadiness) {
      client.visualReadiness = normalizeVisualReadinessDiagnosticSummary(entry.details.visualReadiness);
      lastVisualReadiness = client.visualReadiness;
    }
    if (entry.details?.interactionReadiness) {
      client.interactionReadiness = normalizeInteractionReadinessDiagnosticSummary(entry.details.interactionReadiness);
      lastInteractionReadiness = client.interactionReadiness;
    }
    if (entry.details?.texture) {
      client.texture = normalizeTextureDiagnosticSummary(entry.details.texture);
      lastTexture = client.texture;
    }
    if (entry.details?.launchGate) {
      client.launchGate = normalizeLaunchGateDiagnosticSummary(entry.details.launchGate);
      lastLaunchGate = client.launchGate;
    }
    if (entry.details?.deepGraph) {
      client.deepGraph = normalizeDeepGraphDiagnosticSummary(entry.details.deepGraph);
      lastDeepGraph = client.deepGraph;
    }
    if (entry.details?.deepGraphPreview) {
      client.deepGraphPreview = normalizeDeepGraphPreviewDiagnosticSummary(entry.details.deepGraphPreview);
      lastDeepGraphPreview = client.deepGraphPreview;
    }
    if (entry.error) client.lastError = entry.error;
    client.recentEvents = [...client.recentEvents, createTimelineEntry(entry)].slice(-8);
    client.phase = resolveClientPhase(client);
    clientsById.set(entry.clientId, client);
    if (entry.session) lastSession = entry.session;
    if (entry.launch) lastLaunch = entry.launch;
    if (entry.modes) lastModes = entry.modes;
    if (entry.error) lastError = entry.error;
  }
  let latest = logs.at(-1) || null;
  let clients = [...clientsById.values()]
    .map((client) => addClientFreshness(client, generatedAtMs))
    .sort((a, b) => a.lastSeenAt < b.lastSeenAt ? 1 : -1);
  let immersiveClients = clients.filter(isImmersiveXrClient);
  let summary = {
    version: 'xr-diagnostics-summary-v1',
    generatedAt: generatedAt.toISOString(),
    staleAfterMs: XR_DIAGNOSTIC_CLIENT_STALE_MS,
    count: logs.length,
    latest: latest ? {
      id: latest.id,
      clientId: latest.clientId,
      receivedAt: latest.receivedAt,
      event: latest.event,
      surface: latest.surface,
      pageUrl: latest.pageUrl,
      secureContext: latest.secureContext,
      navigatorXr: latest.navigatorXr,
      demoMode: latest.demoMode,
    } : null,
    modes: lastModes,
    launch: lastLaunch,
    session: lastSession,
    htmlCanvas: lastHtmlCanvas,
    sceneQuality: lastSceneQuality,
    readiness: lastReadiness,
    visualReadiness: lastVisualReadiness,
    interactionReadiness: lastInteractionReadiness,
    texture: lastTexture,
    launchGate: lastLaunchGate,
    deepGraph: lastDeepGraph,
    deepGraphPreview: lastDeepGraphPreview,
    lastError,
    eventCounts,
    clientCount: clients.length,
    latestClient: clients[0] || null,
    latestImmersiveClient: immersiveClients[0] || null,
    immersiveClientCount: immersiveClients.length,
    clients,
  };
  return {
    ...summary,
    troubleshooting: createXRThreeTroubleshootingSummary(summary, { clientId: clients[0]?.clientId }),
  };
}

export function createXrDiagnosticLogStore(options = {}) {
  let logs = [];

  function push(req, body = {}) {
    let entry = normalizeXrDiagnosticLog(req, body, {
      count: logs.length,
      demoMode: options.demoMode,
    });
    logs.push(entry);
    if (logs.length > XR_DIAGNOSTIC_LOG_LIMIT) {
      logs = logs.slice(-XR_DIAGNOSTIC_LOG_LIMIT);
    }
    if (options.logFile) {
      fs.mkdirSync(path.dirname(options.logFile), { recursive: true });
      fs.appendFileSync(options.logFile, `${JSON.stringify(entry)}\n`);
    }
    return entry;
  }

  return {
    list() {
      return logs;
    },
    summary() {
      return createXrDiagnosticSummary(logs);
    },
    push,
  };
}
