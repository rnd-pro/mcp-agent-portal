import { applyTheme } from '../themes/Theme.js';
import { PCB_DARK } from '../themes/pcb.js';
import { routePcbTrace } from '../canvas/PcbRouter.js';
import { analyzePcbRouteSet, summarizePcbRouteQuality } from '../canvas/PcbRouteDiagnostics.js';

applyTheme(document.body, PCB_DARK);

const stage = document.getElementById('stage');
const routeLayer = document.getElementById('routes');
const nodeLayer = document.getElementById('nodes');
const statsEl = document.getElementById('stats');
const metricsEl = document.getElementById('metrics');
const logEl = document.getElementById('log');
const toggleBtn = document.getElementById('toggle');
const resetBtn = document.getElementById('reset');
const oneOrbitBtn = document.getElementById('oneOrbit');
const modeSelect = document.getElementById('modeSelect');
const speedInput = document.getElementById('speed');
const routeSelect = document.getElementById('routeSelect');
const orbitStatsEl = document.getElementById('orbitStats');
const keyframesEl = document.getElementById('keyframes');
const svgNs = 'http://www.w3.org/2000/svg';
const fullTurn = Math.PI * 2;
const orbitHistoryLimit = 6;
const keyframeLimit = 12;
const agentStateElementId = 'pcb-stress-agent-state';
const agentCommandElementId = 'pcb-stress-agent-command';
const agentResultElementId = 'pcb-stress-agent-result';
const agentSampleCount = 120;
let agentSampleCacheKey = '';
let agentSampleCache = null;

const nodeKinds = {
  ingress: { label: 'Ingress', accent: 'var(--sn-cat-server, #c87533)' },
  auth: { label: 'Auth gate', accent: 'var(--sn-sys-success)' },
  planner: { label: 'Planner', accent: 'var(--sn-cat-control, #d4a04a)' },
  compute: { label: 'Orbiting node', accent: 'var(--sn-cat-function, #4ade80)' },
  hub: { label: 'Router hub', accent: 'var(--sn-sys-accent)' },
  monitor: { label: 'Monitor', accent: 'var(--sn-cat-data, #5c8dbf)' },
  storage: { label: 'Storage', accent: 'var(--sn-cat-asset, #8b8b8b)' },
  control: { label: 'Control', accent: 'var(--sn-cat-control, #d4a04a)' },
  trace: { label: 'Trace probe', accent: 'var(--sn-sys-warning)' },
  archive: { label: 'Archive', accent: 'var(--sn-cat-asset, #8b8b8b)' },
  webhook: { label: 'Webhook', accent: 'var(--sn-cat-server, #c87533)' },
  audit: { label: 'Audit', accent: 'var(--sn-sys-danger)' },
};

const connectionDefs = [
  { id: 'rotor-hub', from: 'rotor', to: 'hub', label: 'rotor -> hub' },
  { id: 'ingress-rotor', from: 'ingress', to: 'rotor', label: 'ingress -> rotor' },
  { id: 'rotor-auth', from: 'rotor', to: 'auth', label: 'rotor -> auth' },
  { id: 'rotor-planner', from: 'rotor', to: 'planner', label: 'rotor -> planner' },
  { id: 'control-rotor', from: 'control', to: 'rotor', label: 'control -> rotor' },
  { id: 'rotor-storage', from: 'rotor', to: 'storage', label: 'rotor -> storage' },
  { id: 'rotor-monitor', from: 'rotor', to: 'monitor', label: 'rotor -> monitor' },
  { id: 'rotor-trace', from: 'rotor', to: 'trace', label: 'rotor -> trace' },
  { id: 'webhook-rotor', from: 'webhook', to: 'rotor', label: 'webhook -> rotor' },
  { id: 'rotor-archive', from: 'rotor', to: 'archive', label: 'rotor -> archive' },
  { id: 'audit-rotor', from: 'audit', to: 'rotor', label: 'audit -> rotor' },
];

const modeLabels = {
  raw: 'Raw geometry',
  snapped: 'Grid snapped',
};

const diagnosticsOptions = {
  grid: 10,
  pad: 2,
  maxDiagonal: 12,
  straightLineAllowance: 120,
  maxLengthRatio: 2.8,
  maxSharedMiddleSegment: 6,
};

function createAggregate() {
  return {
    frames: 0,
    badFrames: 0,
    totalViolations: 0,
    maxCurrentViolations: 0,
    byRule: {},
    byStrategy: {},
  };
}

function resetAggregate(aggregate) {
  aggregate.frames = 0;
  aggregate.badFrames = 0;
  aggregate.totalViolations = 0;
  aggregate.maxCurrentViolations = 0;
  aggregate.byRule = {};
  aggregate.byStrategy = {};
}

function cloneAggregate(aggregate) {
  return {
    frames: aggregate.frames,
    badFrames: aggregate.badFrames,
    totalViolations: aggregate.totalViolations,
    maxCurrentViolations: aggregate.maxCurrentViolations,
    byRule: { ...aggregate.byRule },
    byStrategy: { ...aggregate.byStrategy },
    quality: summarizePcbRouteQuality({
      total: aggregate.totalViolations,
      byRule: aggregate.byRule,
    }),
  };
}

function resetAggregatePair(pair) {
  resetAggregate(pair.raw);
  resetAggregate(pair.snapped);
}

const state = {
  running: true,
  speed: 1,
  frames: 0,
  timeOrigin: performance.now(),
  replayPhase: null,
  orbitIndex: 1,
  lastPhase: null,
  stopAfterOrbit: false,
  mode: 'raw',
  aggregates: {
    raw: createAggregate(),
    snapped: createAggregate(),
  },
  currentOrbit: {
    raw: createAggregate(),
    snapped: createAggregate(),
  },
  orbitHistory: [],
  keyframes: [],
  keyframeIndex: 1,
  lastKeyframeSignature: '',
  lastKeyframeFrame: -100,
  lastLogFrame: -100,
  lastLogSignature: '',
  selectedRouteId: connectionDefs[0].id,
};

for (const connection of connectionDefs) {
  const option = document.createElement('option');
  option.value = connection.id;
  option.textContent = connection.label;
  routeSelect.append(option);
}

function rect(id, kind, x, y, w, h) {
  return { id, kind, x, y, w, h };
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function center(rectValue) {
  return {
    x: rectValue.x + rectValue.w / 2,
    y: rectValue.y + rectValue.h / 2,
  };
}

function angleBetween(fromRect, toRect) {
  const fromCenter = center(fromRect);
  const toCenter = center(toRect);
  return Math.atan2(toCenter.y - fromCenter.y, toCenter.x - fromCenter.x) * 180 / Math.PI;
}

function pointOnRect(rectValue, angleDeg) {
  const c = center(rectValue);
  const angle = angleDeg * Math.PI / 180;
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  const tx = Math.abs(dx) < 0.0001 ? Number.POSITIVE_INFINITY : (rectValue.w / 2) / Math.abs(dx);
  const ty = Math.abs(dy) < 0.0001 ? Number.POSITIVE_INFINITY : (rectValue.h / 2) / Math.abs(dy);
  const distance = Math.min(tx, ty);
  return {
    x: c.x + dx * distance,
    y: c.y + dy * distance,
  };
}

function buildLayoutByPhase(phase) {
  const width = stage.clientWidth || 900;
  const height = stage.clientHeight || 620;
  const centerX = width / 2;
  const centerY = height / 2 + 8;
  const fixedW = clamp(width * 0.12, 90, 124);
  const fixedH = 58;
  const hubW = clamp(width * 0.12, 96, 132);
  const hubH = 66;
  const rotorW = clamp(width * 0.105, 86, 116);
  const rotorH = 58;
  const orbitX = clamp(width * 0.16, 128, 180);
  const orbitY = clamp(height * 0.2, 88, 136);
  const nodes = new Map();

  const anchors = [
    ['ingress', 'ingress', 0.08, 0.18],
    ['auth', 'auth', 0.29, 0.12],
    ['planner', 'planner', 0.58, 0.12],
    ['monitor', 'monitor', 0.80, 0.23],
    ['storage', 'storage', 0.82, 0.54],
    ['archive', 'archive', 0.64, 0.72],
    ['trace', 'trace', 0.47, 0.78],
    ['audit', 'audit', 0.26, 0.72],
    ['control', 'control', 0.08, 0.54],
    ['webhook', 'webhook', 0.08, 0.36],
  ];

  for (const [id, kind, xRatio, yRatio] of anchors) {
    const x = clamp(width * xRatio, 24, width - fixedW - 24);
    const y = clamp(height * yRatio, 24, height - fixedH - 24);
    nodes.set(id, rect(id, kind, x, y, fixedW, fixedH));
  }

  nodes.set('hub', rect('hub', 'hub', centerX - hubW / 2, centerY - hubH / 2, hubW, hubH));
  nodes.set('rotor', rect(
    'rotor',
    'compute',
    centerX + Math.cos(phase) * orbitX - rotorW / 2,
    centerY + Math.sin(phase) * orbitY - rotorH / 2,
    rotorW,
    rotorH
  ));

  return { nodes, phase };
}

function buildLayout(time) {
  const elapsed = Math.max(0, time - state.timeOrigin) * 0.001 * state.speed;
  const phase = state.replayPhase ?? (((elapsed % fullTurn) + fullTurn) % fullTurn);
  return buildLayoutByPhase(phase);
}

function routeConnection(connection, rects, snapToGrid) {
  const fromRect = rects.get(connection.from);
  const toRect = rects.get(connection.to);
  const fromAngle = angleBetween(fromRect, toRect);
  const toAngle = fromAngle + 180;
  const start = pointOnRect(fromRect, fromAngle);
  const end = pointOnRect(toRect, toAngle);
  const routed = routePcbTrace({
    start,
    end,
    fromRect,
    toRect,
    fromAngle,
    toAngle,
    rects: [...rects.values()],
    connections: connectionDefs,
    conn: connection,
    grid: 10,
    stub: 28,
    clearance: 34,
    chamfer: 8,
    snapToGrid,
  });

  return {
    ...connection,
    ...routed,
    start,
    end,
    fromRect,
    toRect,
    rects: [...rects.values()],
  };
}

function renderNodes(rects) {
  const liveIds = new Set(rects.keys());
  for (const element of [...nodeLayer.querySelectorAll('.node')]) {
    if (!liveIds.has(element.dataset.nodeId)) element.remove();
  }

  for (const nodeRect of rects.values()) {
    let element = nodeLayer.querySelector(`[data-node-id="${nodeRect.id}"]`);
    const kind = nodeKinds[nodeRect.kind];
    if (!element) {
      element = document.createElement('article');
      element.className = 'node';
      element.dataset.nodeId = nodeRect.id;
      element.innerHTML = `
        <header class="node-head">
          <span class="node-icon"></span>
          <span class="node-title"></span>
        </header>
        <div class="node-body">
          <span class="node-line"></span>
          <span class="node-line"></span>
          <span class="node-line"></span>
        </div>
      `;
      nodeLayer.append(element);
    }
    element.dataset.moving = String(nodeRect.id === 'rotor');
    element.style.setProperty('--x', `${nodeRect.x}px`);
    element.style.setProperty('--y', `${nodeRect.y}px`);
    element.style.width = `${nodeRect.w}px`;
    element.style.height = `${nodeRect.h}px`;
    element.style.setProperty('--accent', kind.accent);
    element.querySelector('.node-title').textContent = kind.label;
  }
}

function svgElement(tagName, selector, parent) {
  let element = parent.querySelector(selector);
  if (!element) {
    element = document.createElementNS(svgNs, tagName);
    parent.append(element);
  }
  return element;
}

function renderRoutes(routes, diagnostics) {
  const liveIds = new Set(routes.map((route) => route.id));
  for (const element of [...routeLayer.querySelectorAll('[data-route-id]')]) {
    if (!liveIds.has(element.dataset.routeId)) element.remove();
  }

  const violationsByRoute = new Map();
  for (const routeResult of diagnostics.routes) {
    violationsByRoute.set(routeResult.id, routeResult.summary.total);
  }
  for (const shared of diagnostics.sharedViolations) {
    for (const routeId of shared.routeIds) {
      violationsByRoute.set(routeId, (violationsByRoute.get(routeId) || 0) + 1);
    }
  }

  for (const route of routes) {
    const path = svgElement('path', `path[data-route-id="${route.id}"]`, routeLayer);
    path.dataset.routeId = route.id;
    path.setAttribute('class', 'route');
    path.setAttribute('d', route.path);
    path.dataset.violating = String((violationsByRoute.get(route.id) || 0) > 0);

    for (const end of ['start', 'end']) {
      const dot = svgElement('circle', `circle[data-route-id="${route.id}"][data-end="${end}"]`, routeLayer);
      const point = route[end];
      dot.dataset.routeId = route.id;
      dot.dataset.end = end;
      dot.setAttribute('class', 'route-dot');
      dot.setAttribute('r', '6');
      dot.setAttribute('cx', point.x);
      dot.setAttribute('cy', point.y);
      dot.dataset.violating = path.dataset.violating;
    }
  }
}

function analyzeRoutes(routes, rects) {
  return analyzePcbRouteSet(routes, {
    ...diagnosticsOptions,
    rects: [...rects.values()],
  });
}

function buildModeResult(rects, mode) {
  const routes = connectionDefs.map((connection) => routeConnection(connection, rects, mode === 'snapped'));
  const diagnostics = analyzeRoutes(routes, rects);
  return { mode, routes, diagnostics };
}

function buildResults(rects) {
  return {
    raw: buildModeResult(rects, 'raw'),
    snapped: buildModeResult(rects, 'snapped'),
  };
}

function addResultToAggregate(aggregate, result) {
  const { diagnostics, routes } = result;
  aggregate.frames += 1;
  aggregate.maxCurrentViolations = Math.max(aggregate.maxCurrentViolations, diagnostics.summary.total);
  for (const route of routes) {
    const strategy = route.strategy || 'unknown';
    aggregate.byStrategy[strategy] = (aggregate.byStrategy[strategy] || 0) + 1;
  }
  if (diagnostics.summary.total === 0) return;

  aggregate.badFrames += 1;
  aggregate.totalViolations += diagnostics.summary.total;
  for (const [rule, count] of Object.entries(diagnostics.summary.byRule)) {
    if (!count) continue;
    aggregate.byRule[rule] = (aggregate.byRule[rule] || 0) + count;
  }
}

function accumulateResults(results) {
  state.frames += 1;
  addResultToAggregate(state.aggregates.raw, results.raw);
  addResultToAggregate(state.aggregates.snapped, results.snapped);
  addResultToAggregate(state.currentOrbit.raw, results.raw);
  addResultToAggregate(state.currentOrbit.snapped, results.snapped);
}

function finalizeCurrentOrbit() {
  if (!state.currentOrbit.raw.frames && !state.currentOrbit.snapped.frames) return;

  state.orbitHistory.unshift({
    index: state.orbitIndex,
    raw: cloneAggregate(state.currentOrbit.raw),
    snapped: cloneAggregate(state.currentOrbit.snapped),
  });

  state.orbitHistory = state.orbitHistory.slice(0, orbitHistoryLimit);
  state.orbitIndex += 1;
  resetAggregatePair(state.currentOrbit);
}

function maybeFinalizeOrbit(phase) {
  if (state.lastPhase === null) {
    state.lastPhase = phase;
    return false;
  }

  const completed = phase < state.lastPhase && state.lastPhase - phase > Math.PI;
  state.lastPhase = phase;
  if (completed) finalizeCurrentOrbit();
  return completed;
}

function formatDelta(value) {
  if (value > 0) return `+${value}`;
  return String(value);
}

function compactStrategyCount(aggregate) {
  return (aggregate.byStrategy['compact-elbow'] || 0) + (aggregate.byStrategy['compact-direct'] || 0);
}

function phaseDegrees(phase) {
  return Math.round(phase * 180 / Math.PI);
}

function currentRouteDiagnostics(results, routeId) {
  const rawRoute = results.raw.routes.find((route) => route.id === routeId) || results.raw.routes[0];
  const snappedRoute = results.snapped.routes.find((route) => route.id === routeId) || results.snapped.routes[0];
  return {
    rawStrategy: rawRoute?.strategy || 'unknown',
    snappedStrategy: snappedRoute?.strategy || 'unknown',
    rawRules: routeRules(routeId, results.raw.diagnostics),
    snappedRules: routeRules(routeId, results.snapped.diagnostics),
  };
}

function routeViolationCounts(diagnostics) {
  const counts = new Map();
  for (const routeResult of diagnostics.routes) {
    counts.set(routeResult.id, routeResult.summary.total);
  }
  for (const shared of diagnostics.sharedViolations) {
    for (const routeId of shared.routeIds) {
      counts.set(routeId, (counts.get(routeId) || 0) + 1);
    }
  }
  return counts;
}

function routeViolationDetails(results, routeId) {
  const raw = results.raw.diagnostics.routes.find((route) => route.id === routeId);
  const snapped = results.snapped.diagnostics.routes.find((route) => route.id === routeId);
  const rawShared = results.raw.diagnostics.sharedViolations.filter((violation) => violation.routeIds.includes(routeId));
  const snappedShared = results.snapped.diagnostics.sharedViolations.filter((violation) => violation.routeIds.includes(routeId));
  return {
    raw: {
      summary: raw?.summary,
      violations: raw?.violations || [],
      sharedViolations: rawShared,
    },
    snapped: {
      summary: snapped?.summary,
      violations: snapped?.violations || [],
      sharedViolations: snappedShared,
    },
  };
}

function findWorstRouteId(results) {
  const rawCounts = routeViolationCounts(results.raw.diagnostics);
  const snappedCounts = routeViolationCounts(results.snapped.diagnostics);
  let best = null;
  for (const connection of connectionDefs) {
    const score = (rawCounts.get(connection.id) || 0) + (snappedCounts.get(connection.id) || 0);
    if (!best || score > best.score) {
      best = { id: connection.id, score };
    }
  }
  return best?.score > 0 ? best.id : state.selectedRouteId;
}

function serializeRoute(route, diagnostics) {
  const result = diagnostics.routes.find((item) => item.id === route.id);
  const sharedViolations = diagnostics.sharedViolations.filter((violation) => violation.routeIds.includes(route.id));
  const summary = result?.summary || null;
  return {
    id: route.id,
    from: route.from,
    to: route.to,
    strategy: route.strategy || 'unknown',
    alternateDirections: Boolean(route.alternateDirections),
    path: route.path,
    points: route.points,
    start: route.start,
    end: route.end,
    metrics: result?.metrics || null,
    summary,
    quality: summary ? summarizePcbRouteQuality(summary) : null,
    violations: result?.violations || [],
    sharedViolations,
  };
}

function serializeResult(result) {
  const quality = summarizePcbRouteQuality(result.diagnostics.summary);
  return {
    mode: result.mode,
    summary: {
      ...result.diagnostics.summary,
      quality,
    },
    quality,
    sharedViolations: result.diagnostics.sharedViolations,
    routes: result.routes.map((route) => serializeRoute(route, result.diagnostics)),
  };
}

function serializeRect(rectValue) {
  return {
    id: rectValue.id,
    kind: rectValue.kind,
    x: rectValue.x,
    y: rectValue.y,
    w: rectValue.w,
    h: rectValue.h,
  };
}

function createAgentSnapshot(layout, rects, results) {
  const worstRouteId = findWorstRouteId(results);
  return {
    schema: 'symbiote-ui.pcb-stress.v1',
    frame: state.frames,
    orbit: state.orbitIndex,
    phase: layout.phase,
    phaseDeg: phaseDegrees(layout.phase),
    visibleMode: state.mode,
    selectedRouteId: state.selectedRouteId,
    worstRouteId,
    nodes: [...rects.values()].map(serializeRect),
    results: {
      raw: serializeResult(results.raw),
      snapped: serializeResult(results.snapped),
    },
    selectedRoute: routeViolationDetails(results, state.selectedRouteId),
    worstRoute: routeViolationDetails(results, worstRouteId),
    aggregates: {
      raw: cloneAggregate(state.aggregates.raw),
      snapped: cloneAggregate(state.aggregates.snapped),
    },
    currentOrbit: {
      raw: cloneAggregate(state.currentOrbit.raw),
      snapped: cloneAggregate(state.currentOrbit.snapped),
    },
    orbitHistory: state.orbitHistory,
    keyframes: state.keyframes,
  };
}

function ensureJsonScript(id) {
  let element = document.getElementById(id);
  if (!element) {
    element = document.createElement('script');
    element.id = id;
    element.type = 'application/json';
    document.body.append(element);
  }
  return element;
}

function writeAgentJson(id, payload) {
  ensureJsonScript(id).textContent = JSON.stringify(payload);
}

function currentAgentSampleCacheKey() {
  return [
    stage.clientWidth || 900,
    stage.clientHeight || 620,
    diagnosticsOptions.grid,
    diagnosticsOptions.pad,
    diagnosticsOptions.maxSharedMiddleSegment,
  ].join(':');
}

function getCachedAgentSamples() {
  const key = currentAgentSampleCacheKey();
  if (agentSampleCache && agentSampleCacheKey === key) return agentSampleCache;
  agentSampleCacheKey = key;
  agentSampleCache = null;
  return {
    schema: 'symbiote-ui.pcb-orbit-samples.v1',
    status: 'pending',
    samples: 0,
    requestedSamples: agentSampleCount,
    diagnosticsOptions,
    aggregate: null,
    worstFrames: [],
    frames: [],
  };
}

function captureSnapshotAtPhase(phase) {
  const layout = buildLayoutByPhase(phase);
  const rects = layout.nodes;
  const results = buildResults(rects);
  return createAgentSnapshot(layout, rects, results);
}

function createRunAggregate() {
  return {
    frames: 0,
    badFrames: 0,
    totalViolations: 0,
    maxFrameViolations: 0,
    byRule: {},
    byStrategy: {},
  };
}

function serializeRunAggregate(aggregate) {
  return {
    ...aggregate,
    byRule: { ...aggregate.byRule },
    byStrategy: { ...aggregate.byStrategy },
    quality: summarizePcbRouteQuality({
      total: aggregate.totalViolations,
      byRule: aggregate.byRule,
    }),
  };
}

function addSerializedResultToAggregate(aggregate, result) {
  aggregate.frames += 1;
  aggregate.totalViolations += result.summary.total;
  aggregate.maxFrameViolations = Math.max(aggregate.maxFrameViolations, result.summary.total);
  if (result.summary.total > 0) aggregate.badFrames += 1;

  for (const [rule, count] of Object.entries(result.summary.byRule)) {
    if (!count) continue;
    aggregate.byRule[rule] = (aggregate.byRule[rule] || 0) + count;
  }

  for (const route of result.routes) {
    aggregate.byStrategy[route.strategy] = (aggregate.byStrategy[route.strategy] || 0) + 1;
  }
}

function routeFrameScore(route) {
  return (route.summary?.total || 0) + (route.sharedViolations?.length || 0);
}

function topRouteGeometries(result, limit = 12) {
  return [...result.routes]
    .filter((route) => routeFrameScore(route) > 0)
    .sort((a, b) => routeFrameScore(b) - routeFrameScore(a))
    .slice(0, limit);
}

function summarizeAgentFrame(snapshot) {
  const rawWorstRoute = snapshot.results.raw.routes.find((route) => route.id === snapshot.worstRouteId);
  const snappedWorstRoute = snapshot.results.snapped.routes.find((route) => route.id === snapshot.worstRouteId);
  return {
    phase: snapshot.phase,
    phaseDeg: snapshot.phaseDeg,
    worstRouteId: snapshot.worstRouteId,
    nodes: snapshot.nodes,
    raw: snapshot.results.raw.summary,
    snapped: snapshot.results.snapped.summary,
    worstRoute: snapshot.worstRoute,
    worstRouteGeometry: {
      raw: rawWorstRoute || null,
      snapped: snappedWorstRoute || null,
    },
    topRoutes: {
      raw: topRouteGeometries(snapshot.results.raw),
      snapped: topRouteGeometries(snapshot.results.snapped),
    },
  };
}

function frameModeTotal(frame, mode) {
  return frame.results?.[mode]?.summary?.total ?? frame[mode]?.total ?? 0;
}

function runOrbitSamples({ samples = 120, includeRoutes = false } = {}) {
  const sampleCount = Math.max(1, Math.min(720, Number(samples) || 120));
  const frames = [];
  const raw = createRunAggregate();
  const snapped = createRunAggregate();

  for (let index = 0; index < sampleCount; index += 1) {
    const phase = index / sampleCount * fullTurn;
    const snapshot = captureSnapshotAtPhase(phase);
    addSerializedResultToAggregate(raw, snapshot.results.raw);
    addSerializedResultToAggregate(snapped, snapshot.results.snapped);
    frames.push(includeRoutes ? snapshot : summarizeAgentFrame(snapshot));
  }

  const worstFrames = [...frames]
    .sort((a, b) => (
      frameModeTotal(b, 'raw') +
      frameModeTotal(b, 'snapped')
    ) - (
      frameModeTotal(a, 'raw') +
      frameModeTotal(a, 'snapped')
    ))
    .slice(0, 12);

  return {
    schema: 'symbiote-ui.pcb-orbit-samples.v1',
    samples: sampleCount,
    diagnosticsOptions,
    aggregate: {
      raw: serializeRunAggregate(raw),
      snapped: serializeRunAggregate(snapped),
    },
    worstFrames,
    frames,
  };
}

function replayKeyframeById(id) {
  const keyframe = state.keyframes.find((item) => item.id === Number(id));
  if (!keyframe) return null;

  state.running = false;
  state.stopAfterOrbit = false;
  state.replayPhase = keyframe.phase;
  state.mode = keyframe.mode;
  state.selectedRouteId = keyframe.routeId;
  modeSelect.value = state.mode;
  routeSelect.value = state.selectedRouteId;
  toggleBtn.textContent = 'Play';
  renderFrame(performance.now(), false);
  return keyframe;
}

function publishAgentDiagnostics(snapshot) {
  ensureJsonScript(agentCommandElementId);
  ensureJsonScript(agentResultElementId);
  const envelope = {
    schema: 'symbiote-ui.pcb-stress-agent-state.v1',
    capabilities: {
      commandEvent: 'pcb-stress-agent-command',
      commandElementId: agentCommandElementId,
      resultElementId: agentResultElementId,
      commands: ['runOrbitSamples', 'snapshotAtPhase', 'replayKeyframe', 'resetCounters'],
    },
    snapshot,
    sampleRun: getCachedAgentSamples(),
  };

  window.__pcbStressDiagnostics = {
    schema: 'symbiote-ui.pcb-stress-api.v1',
    snapshot,
    keyframes: state.keyframes,
    getSnapshot: () => snapshot,
    snapshotAtPhase: captureSnapshotAtPhase,
    runOrbitSamples,
    replayKeyframe: replayKeyframeById,
    resetCounters,
  };
  writeAgentJson(agentStateElementId, envelope);
}

function readAgentCommand() {
  const content = ensureJsonScript(agentCommandElementId).textContent.trim();
  if (!content) return {};
  return JSON.parse(content);
}

function writeAgentResult(command, payload, error = null) {
  writeAgentJson(agentResultElementId, {
    schema: 'symbiote-ui.pcb-stress-agent-result.v1',
    requestId: command.requestId ?? null,
    command: command.type ?? null,
    ok: !error,
    error,
    payload,
  });
}

function handleAgentCommand() {
  let command;
  try {
    command = readAgentCommand();
  } catch (error) {
    writeAgentResult({}, null, {
      name: error.name,
      message: error.message,
    });
    return;
  }

  try {
    if (command.type === 'runOrbitSamples') {
      writeAgentResult(command, runOrbitSamples({
        samples: command.samples,
        includeRoutes: Boolean(command.includeRoutes),
      }));
      return;
    }

    if (command.type === 'snapshotAtPhase') {
      writeAgentResult(command, captureSnapshotAtPhase(Number(command.phase) || 0));
      return;
    }

    if (command.type === 'replayKeyframe') {
      writeAgentResult(command, replayKeyframeById(command.id));
      return;
    }

    if (command.type === 'resetCounters') {
      resetCounters();
      renderFrame(performance.now(), false);
      writeAgentResult(command, { reset: true });
      return;
    }

    writeAgentResult(command, null, {
      name: 'UnknownAgentCommand',
      message: `Unsupported command: ${command.type}`,
    });
  } catch (error) {
    writeAgentResult(command, null, {
      name: error.name,
      message: error.message,
    });
  }
}

function maybeCaptureKeyframe(layout, rects, results) {
  const rawTotal = results.raw.diagnostics.summary.total;
  const snappedTotal = results.snapped.diagnostics.summary.total;
  if (rawTotal === 0 && snappedTotal === 0) return;

  const phaseBucket = Math.round(phaseDegrees(layout.phase) / 6) * 6;
  const signature = [
    phaseBucket,
    summarizeRules(results.raw.diagnostics.summary),
    summarizeRules(results.snapped.diagnostics.summary),
  ].join(':');
  if (signature === state.lastKeyframeSignature && state.frames - state.lastKeyframeFrame < 18) return;

  const rotor = rects.get('rotor');
  const routeId = findWorstRouteId(results);
  const route = results[state.mode].routes.find((item) => item.id === routeId) || results[state.mode].routes[0];
  const selected = currentRouteDiagnostics(results, route.id);
  state.keyframes.unshift({
    schema: 'symbiote-ui.pcb-keyframe.v1',
    id: state.keyframeIndex,
    frame: state.frames,
    orbit: state.orbitIndex,
    phase: layout.phase,
    mode: state.mode,
    routeId: route.id,
    rotor: {
      x: rotor.x,
      y: rotor.y,
      w: rotor.w,
      h: rotor.h,
    },
    rawTotal,
    snappedTotal,
    rawSummary: results.raw.diagnostics.summary,
    snappedSummary: results.snapped.diagnostics.summary,
    rawRules: summarizeRules(results.raw.diagnostics.summary),
    snappedRules: summarizeRules(results.snapped.diagnostics.summary),
    rawStrategy: selected.rawStrategy,
    snappedStrategy: selected.snappedStrategy,
    selectedRawRules: selected.rawRules,
    selectedSnappedRules: selected.snappedRules,
    routeDiagnostics: routeViolationDetails(results, route.id),
  });
  state.keyframeIndex += 1;
  state.keyframes = state.keyframes.slice(0, keyframeLimit);
  state.lastKeyframeSignature = signature;
  state.lastKeyframeFrame = state.frames;
}

function renderKeyframes() {
  if (!state.keyframes.length) {
    keyframesEl.innerHTML = '<span class="keyframe-empty">No problem keyframes yet</span>';
    return;
  }

  keyframesEl.innerHTML = state.keyframes.map((keyframe) => `
    <button class="keyframe" type="button" data-keyframe-id="${keyframe.id}">
      <strong>#${keyframe.id} orbit ${keyframe.orbit}, ${phaseDegrees(keyframe.phase)}deg</strong>
      <span>raw ${keyframe.rawTotal}: ${keyframe.rawRules}</span>
      <span>grid ${keyframe.snappedTotal}: ${keyframe.snappedRules}</span>
      <span>${keyframe.routeId} ${keyframe.rawStrategy}/${keyframe.snappedStrategy}</span>
    </button>
  `).join('');
}

function renderStats(results) {
  const rawNow = results.raw.diagnostics.summary.total;
  const snappedNow = results.snapped.diagnostics.summary.total;
  const raw = state.aggregates.raw;
  const snapped = state.aggregates.snapped;
  const entries = [
    ['mode', modeLabels[state.mode]],
    ['orbit', state.orbitIndex],
    ['frames', state.frames],
    ['raw current', rawNow],
    ['grid current', snappedNow],
    ['delta now', formatDelta(snappedNow - rawNow)],
    ['delta total', formatDelta(snapped.totalViolations - raw.totalViolations)],
    ['raw bad frames', raw.badFrames],
    ['grid bad frames', snapped.badFrames],
    ['raw node hits', raw.byRule.nodeIntersection || 0],
    ['grid node hits', snapped.byRule.nodeIntersection || 0],
    ['raw shared', raw.byRule.sharedChannel || 0],
    ['grid shared', snapped.byRule.sharedChannel || 0],
    ['raw compact', compactStrategyCount(raw)],
    ['grid compact', compactStrategyCount(snapped)],
    ['raw max', raw.maxCurrentViolations],
    ['grid max', snapped.maxCurrentViolations],
  ];
  statsEl.innerHTML = entries.map(([label, value]) => `
    <div class="stat">
      <strong>${value}</strong>
      <span>${label}</span>
    </div>
  `).join('');
}

function renderOrbitHistory() {
  const current = {
    index: state.orbitIndex,
    raw: state.currentOrbit.raw,
    snapped: state.currentOrbit.snapped,
    active: true,
  };
  const items = [current, ...state.orbitHistory];
  orbitStatsEl.innerHTML = items.map((item) => {
    const delta = item.snapped.totalViolations - item.raw.totalViolations;
    return `
      <div class="orbit-card" data-active="${item.active ? 'true' : 'false'}">
        <strong>${item.active ? 'orbit' : 'done'} ${item.index}</strong>
        <span>raw total ${item.raw.totalViolations}</span>
        <span>grid total ${item.snapped.totalViolations}</span>
        <span>delta ${formatDelta(delta)}</span>
        <span>bad ${item.raw.badFrames}/${item.snapped.badFrames}</span>
        <span>hits ${item.raw.byRule.nodeIntersection || 0}/${item.snapped.byRule.nodeIntersection || 0}</span>
        <span>shared ${item.raw.byRule.sharedChannel || 0}/${item.snapped.byRule.sharedChannel || 0}</span>
        <span>compact ${compactStrategyCount(item.raw)}/${compactStrategyCount(item.snapped)}</span>
      </div>
    `;
  }).join('');
}

function routeRules(routeId, diagnostics) {
  const result = diagnostics.routes.find((item) => item.id === routeId);
  if (!result) return [];
  const shared = diagnostics.sharedViolations.filter((item) => item.routeIds.includes(routeId));
  return [
    ...result.violations.map((violation) => violation.rule),
    ...shared.map((violation) => `${violation.rule}:${violation.length.toFixed(0)}px`),
  ];
}

function renderMetrics(results) {
  const active = results[state.mode];
  const activeRoute = active.routes.find((item) => item.id === state.selectedRouteId) || active.routes[0];
  const rawRoute = results.raw.routes.find((item) => item.id === activeRoute.id) || results.raw.routes[0];
  const snappedRoute = results.snapped.routes.find((item) => item.id === activeRoute.id) || results.snapped.routes[0];
  const rawResult = results.raw.diagnostics.routes.find((item) => item.id === activeRoute.id);
  const snappedResult = results.snapped.diagnostics.routes.find((item) => item.id === activeRoute.id);
  const activeResult = state.mode === 'snapped' ? snappedResult : rawResult;
  const rules = routeRules(activeRoute.id, active.diagnostics);

  metricsEl.innerHTML = `
    <span>id</span><b>${activeRoute.id}</b>
    <span>visible mode</span><b>${modeLabels[state.mode]}</b>
    <span>raw length</span><b>${rawResult.metrics.length.toFixed(0)}px</b>
    <span>grid length</span><b>${snappedResult.metrics.length.toFixed(0)}px</b>
    <span>length delta</span><b>${formatDelta(Math.round(snappedResult.metrics.length - rawResult.metrics.length))}px</b>
    <span>raw strategy</span><b>${rawRoute.strategy || 'unknown'}</b>
    <span>grid strategy</span><b>${snappedRoute.strategy || 'unknown'}</b>
    <span>bends</span><b>${activeResult.metrics.bends}</b>
    <span>reversals</span><b>${activeResult.metrics.reversals}</b>
    <span>raw violations</span><b>${routeRules(activeRoute.id, results.raw.diagnostics).length}</b>
    <span>grid violations</span><b>${routeRules(activeRoute.id, results.snapped.diagnostics).length}</b>
    <span>visible rules</span><b>${rules.length ? rules.join(', ') : 'none'}</b>
    <span>raw points</span><b>${rawRoute.points.length}</b>
    <span>grid points</span><b>${snappedRoute.points.length}</b>
  `;
}

function summarizeRules(summary) {
  return Object.entries(summary.byRule)
    .filter(([, count]) => count)
    .map(([rule, count]) => `${rule}:${count}`)
    .join(' ') || 'none';
}

function logDiagnostics(rects, results) {
  const rawSummary = results.raw.diagnostics.summary;
  const snappedSummary = results.snapped.diagnostics.summary;
  if (rawSummary.total === 0 && snappedSummary.total === 0) return;

  const rotor = rects.get('rotor');
  const signature = [
    state.mode,
    summarizeRules(rawSummary),
    summarizeRules(snappedSummary),
    Math.round(rotor.x / 10),
    Math.round(rotor.y / 10),
  ].join(':');
  if (signature === state.lastLogSignature && state.frames - state.lastLogFrame < 30) return;
  state.lastLogSignature = signature;
  state.lastLogFrame = state.frames;

  const selected = results[state.mode].routes.find((route) => route.id === state.selectedRouteId) || results[state.mode].routes[0];
  const entry = document.createElement('div');
  entry.className = 'log-entry';
  entry.textContent = [
    `frame=${state.frames} orbit=${state.orbitIndex} mode=${modeLabels[state.mode]} rotor=(${rotor.x.toFixed(1)}, ${rotor.y.toFixed(1)})`,
    `raw=${rawSummary.total} ${summarizeRules(rawSummary)}`,
    `grid=${snappedSummary.total} ${summarizeRules(snappedSummary)}`,
    `selected=${selected.id} points=${selected.points.length || 0}`,
    selected.path,
  ].join('\n');
  logEl.prepend(entry);

  while (logEl.children.length > 80) {
    logEl.lastElementChild.remove();
  }
}

function renderFrame(time = 0, countFrame = true) {
  const layout = buildLayout(time);
  const rects = layout.nodes;
  const results = buildResults(rects);
  const active = results[state.mode];

  renderNodes(rects);
  renderRoutes(active.routes, active.diagnostics);
  const completedOrbit = countFrame ? maybeFinalizeOrbit(layout.phase) : false;
  if (countFrame && !(completedOrbit && state.stopAfterOrbit)) accumulateResults(results);
  if (countFrame && !(completedOrbit && state.stopAfterOrbit)) maybeCaptureKeyframe(layout, rects, results);
  if (completedOrbit && state.stopAfterOrbit) {
    state.running = false;
    state.stopAfterOrbit = false;
    toggleBtn.textContent = 'Play';
  }
  renderStats(results);
  renderOrbitHistory();
  renderKeyframes();
  renderMetrics(results);
  publishAgentDiagnostics(createAgentSnapshot(layout, rects, results));
  if (countFrame) logDiagnostics(rects, results);
}

function tick(time = 0) {
  renderFrame(time, true);

  if (state.running) requestAnimationFrame(tick);
}

toggleBtn.addEventListener('click', () => {
  state.running = !state.running;
  if (state.running) state.replayPhase = null;
  toggleBtn.textContent = state.running ? 'Pause' : 'Play';
  if (state.running) requestAnimationFrame(tick);
});

resetBtn.addEventListener('click', () => {
  resetCounters();
  renderFrame(performance.now(), false);
});

oneOrbitBtn.addEventListener('click', () => {
  const wasRunning = state.running;
  resetCounters();
  state.stopAfterOrbit = true;
  state.running = true;
  toggleBtn.textContent = 'Pause';
  renderFrame(performance.now(), false);
  if (!wasRunning) requestAnimationFrame(tick);
});

modeSelect.addEventListener('change', () => {
  state.mode = modeSelect.value;
  renderFrame(performance.now(), false);
});

speedInput.addEventListener('input', () => {
  state.speed = Number(speedInput.value) || 1;
});

routeSelect.addEventListener('change', () => {
  state.selectedRouteId = routeSelect.value;
});

keyframesEl.addEventListener('click', (event) => {
  const button = event.target.closest('[data-keyframe-id]');
  if (!button) return;
  replayKeyframeById(button.dataset.keyframeId);
});

document.addEventListener('pcb-stress-agent-command', handleAgentCommand);

function resetCounters() {
  state.frames = 0;
  state.timeOrigin = performance.now();
  state.replayPhase = null;
  state.orbitIndex = 1;
  state.lastPhase = null;
  state.stopAfterOrbit = false;
  resetAggregatePair(state.aggregates);
  resetAggregatePair(state.currentOrbit);
  state.orbitHistory = [];
  state.keyframes = [];
  state.keyframeIndex = 1;
  state.lastKeyframeSignature = '';
  state.lastKeyframeFrame = -100;
  state.lastLogFrame = -100;
  state.lastLogSignature = '';
  logEl.replaceChildren();
}

requestAnimationFrame(tick);
