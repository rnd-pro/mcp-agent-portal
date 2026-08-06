import '../canvas/CanvasGraph/CanvasGraph.js?v=gravity-lab-layout-algorithms-v1';

const graph = document.getElementById('graph');
const controls = document.getElementById('controls');
const diagnostics = document.getElementById('diagnostics');

const forceControls = [
  ['chargeStrength', -360, -30, -120, 1],
  ['linkDistance', 50, 240, 112, 1],
  ['linkStrength', 0.02, 0.8, 0.25, 0.01],
  ['groupDistance', 60, 280, 118, 1],
  ['groupStrength', 0.01, 0.3, 0.12, 0.01],
  ['wellStrength', 0.1, 2.2, 1.15, 0.01],
  ['centerPull', 0, 0.5, 0.14, 0.01],
  ['wellRepulsion', 0, 24, 9.8, 0.1],
  ['crossLinkScale', 0.02, 0.7, 0.22, 0.01],
];

const viewControls = [
  ['fitPadding', 0, 160, 72, 1],
  ['focusMaxZoom', 0.4, 2.5, 1.35, 0.01],
  ['cameraEase', 0.015, 0.2, 0.032, 0.001],
  ['appearanceMs', 200, 2400, 1080, 10],
  ['staggerMs', 0, 80, 12, 1],
  ['eventDelayMs', 120, 1400, 520, 10],
  ['coordinateJumpThreshold', 1, 120, 18, 1],
];

const layoutAlgorithms = Object.freeze([
  { id: 'organic', label: 'organic force' },
  { id: 'oil-cloud', label: 'oil-cloud bodies' },
  { id: 'crystal', label: 'crystal growth' },
  { id: 'spring', label: 'spring baseline' },
]);

let state = Object.fromEntries([...forceControls, ...viewControls].map(([key, , , value]) => [key, value]));
state.scenario = 'process';
state.layoutAlgorithm = 'organic';
let currentModel = null;
let replayTimers = [];
let replayFinalFocusTimer = null;
let replayCameraTimer = null;
let replayCameraInterestIds = [];
let replayCameraFrame = null;
let replayStep = 0;
let syncFocusId = null;
let activityNodeIds = [];
let replayPositionSnapshot = null;
let replayPositionStep = null;
let replayFrameMoves = [];
let coordinateJumpSnapshot = null;
let coordinateJumpTick = 0;
let coordinateJumpEvents = [];

const waitingStatuses = new Set(['loading', 'pending', 'queued', 'running', 'streaming', 'waiting']);
const REPLAY_CAMERA_TRACK_MS = 140;
const FINAL_REPLAY_FOCUS_IDLE_MS = 1000;
const REPLAY_CAMERA_INTEREST_LIMIT = 16;
const COORDINATE_JUMP_EVENT_LIMIT = 32;
const COORDINATE_JUMP_NODE_LIMIT = 6;

const agentPalette = {
  orchestrator: { label: 'Orchestrator', color: '#1565C0', icon: 'hub' },
  codeReviewer: { label: 'code-reviewer', color: '#F9A825', icon: 'rate_review' },
  uiEngineer: { label: 'ui-engineer', color: '#6A1B9A', icon: 'palette' },
  qaEngineer: { label: 'qa-engineer', color: '#E65100', icon: 'bug_report' },
};

function makeProcessModel() {
  const groups = [
    { id: 'orchestrator', label: 'Orchestrator', type: 'data', color: '#4c8bf5' },
    { id: 'delegation', label: 'Delegation', type: 'action', color: '#34a853' },
    { id: 'tools', label: 'Tools', type: 'config', color: '#ff6d01' },
    { id: 'files', label: 'Files', type: 'docs', color: '#fbbc04' },
  ];
  const nodes = [];
  const edges = [];
  const groupModels = [];
  for (const group of groups) {
    const ids = [];
    const count = group.id === 'orchestrator' ? 5 : 9;
    for (let index = 0; index < count; index += 1) {
      const id = `${group.id}-${index}`;
      ids.push(id);
      nodes.push({
        id,
        label: `${group.label} ${index}`,
        type: group.type,
        color: group.color,
        group: group.id,
      });
      if (index > 0) edges.push({ from: `${group.id}-0`, to: id });
      if (index > 1) edges.push({ from: `${group.id}-${index - 1}`, to: id });
    }
    groupModels.push({ id: group.id, label: group.label, nodeIds: ids });
  }
  edges.push(
    { from: 'orchestrator-0', to: 'delegation-0' },
    { from: 'orchestrator-1', to: 'tools-0' },
    { from: 'delegation-2', to: 'files-0' },
    { from: 'tools-3', to: 'files-3' },
    { from: 'files-4', to: 'orchestrator-2' }
  );
  return { nodes, edges, groups: groupModels, rootNodes: nodes.map((node) => node.id) };
}

function makeDenseModel() {
  const model = makeProcessModel();
  for (let index = 0; index < model.nodes.length - 4; index += 3) {
    model.edges.push({ from: model.nodes[index].id, to: model.nodes[index + 4].id });
  }
  return model;
}

function makeSingleModel() {
  return {
    nodes: [{
      id: 'orchestrator',
      label: 'Orchestrator',
      type: 'data',
      color: agentPalette.orchestrator.color,
      icon: agentPalette.orchestrator.icon,
    }],
    edges: [],
    groups: [],
    rootNodes: ['orchestrator'],
  };
}

function makeStarModel() {
  const nodes = [{ id: 'hub', label: 'Hub', type: 'data', color: '#4c8bf5', icon: 'hub' }];
  const edges = [];
  for (let index = 0; index < 18; index += 1) {
    const id = `leaf-${index}`;
    nodes.push({ id, label: `Leaf ${index}`, type: index % 2 ? 'docs' : 'action' });
    edges.push({ from: 'hub', to: id });
  }
  return {
    nodes,
    edges,
    groups: [{ id: 'star', label: 'Star', nodeIds: nodes.map((node) => node.id) }],
    rootNodes: nodes.map((node) => node.id),
  };
}

function makeOrchestrationSeedModel() {
  return {
    nodes: [{
      id: 'agent:orchestrator',
      label: agentPalette.orchestrator.label,
      type: 'agent',
      color: agentPalette.orchestrator.color,
      icon: agentPalette.orchestrator.icon,
      weight: 2.8,
      params: { role: 'orchestrator' },
    }],
    edges: [],
    groups: [
      { id: 'agents', label: 'Agents', nodeIds: ['agent:orchestrator'] },
      { id: 'work', label: 'Work events', nodeIds: [] },
    ],
    rootNodes: ['agent:orchestrator'],
  };
}

const orchestrationEvents = [
  {
    label: 'goal intent',
    delaySlot: 1,
    nodes: [{
      id: 'goal:process-graph',
      label: 'Goal: process graph',
      type: 'goal',
      color: '#7E57C2',
      icon: 'track_changes',
      weight: 1.6,
      state: { status: 'active' },
    }],
    edges: [{ from: 'agent:orchestrator', to: 'goal:process-graph', type: 'goal', label: 'goal' }],
    focus: 'goal:process-graph',
  },
  {
    label: 'user prompt',
    delaySlot: 2,
    nodes: [{
      id: 'message:user:0',
      label: 'Add live process graph',
      type: 'prompt',
      color: '#5C6BC0',
      icon: 'chat',
      weight: 1.2,
      state: { status: 'prompt' },
    }],
    edges: [{ from: 'agent:orchestrator', to: 'message:user:0', type: 'prompt', label: 'prompt' }],
    focus: 'message:user:0',
  },
  {
    label: 'parallel fan-out',
    delaySlot: 3,
    nodes: [
      {
        id: 'parallel:subagents',
        label: 'Parallel sub-agents',
        type: 'parallel',
        color: '#00ACC1',
        icon: 'sync',
        weight: 2.4,
        state: { status: 'running' },
      },
      {
        id: 'agent:code-reviewer',
        label: agentPalette.codeReviewer.label,
        type: 'agent',
        color: agentPalette.codeReviewer.color,
        icon: agentPalette.codeReviewer.icon,
        weight: 1.75,
        state: { status: 'running' },
        params: { role: 'reviewer' },
      },
      {
        id: 'agent:ui-engineer',
        label: agentPalette.uiEngineer.label,
        type: 'agent',
        color: agentPalette.uiEngineer.color,
        icon: agentPalette.uiEngineer.icon,
        weight: 1.75,
        state: { status: 'running' },
        params: { role: 'executor' },
      },
      {
        id: 'agent:qa-engineer',
        label: agentPalette.qaEngineer.label,
        type: 'agent',
        color: agentPalette.qaEngineer.color,
        icon: agentPalette.qaEngineer.icon,
        weight: 1.75,
        state: { status: 'running' },
        params: { role: 'executor' },
      },
    ],
    edges: [
      { from: 'agent:orchestrator', to: 'parallel:subagents', type: 'parallelStart', label: 'parallel' },
      { from: 'parallel:subagents', to: 'agent:code-reviewer', type: 'delegate', label: 'review' },
      { from: 'parallel:subagents', to: 'agent:ui-engineer', type: 'delegate', label: 'ui' },
      { from: 'parallel:subagents', to: 'agent:qa-engineer', type: 'delegate', label: 'qa' },
    ],
    focus: 'parallel:subagents',
    focusNodes: ['agent:orchestrator', 'parallel:subagents', 'agent:code-reviewer', 'agent:ui-engineer', 'agent:qa-engineer'],
    activityNodes: ['agent:code-reviewer', 'agent:ui-engineer', 'agent:qa-engineer'],
    fanOut: {
      from: 'parallel:subagents',
      to: ['agent:code-reviewer', 'agent:ui-engineer', 'agent:qa-engineer'],
    },
  },
  {
    label: 'review branch',
    delaySlot: 4,
    nodes: [{
      id: 'tool:get-skeleton',
      label: 'get_skeleton',
      type: 'tool',
      color: '#F9A825',
      icon: 'account_tree',
      weight: 0.9,
      state: { status: 'running' },
    }, {
      id: 'file:agent-process-graph',
      label: 'agent-process-graph.js',
      type: 'file',
      color: '#8EA4B8',
      icon: 'description',
      weight: 0.7,
      state: { status: 'waiting' },
    }],
    edges: [
      { from: 'agent:code-reviewer', to: 'tool:get-skeleton', type: 'toolCall', label: 'tool' },
      { from: 'tool:get-skeleton', to: 'file:agent-process-graph', type: 'read', label: 'read' },
    ],
    focus: 'file:agent-process-graph',
    syncFocus: 'parallel:subagents',
    focusNodes: ['parallel:subagents', 'agent:code-reviewer', 'tool:get-skeleton', 'file:agent-process-graph'],
    activityNodes: ['tool:get-skeleton', 'file:agent-process-graph'],
    fanOut: {
      from: 'parallel:subagents',
      to: ['tool:get-skeleton', 'file:agent-process-graph'],
    },
  },
  {
    label: 'ui branch',
    delaySlot: 4,
    nodes: [{
      id: 'tool:apply-patch',
      label: 'apply_patch',
      type: 'tool',
      color: '#F9A825',
      icon: 'build',
      weight: 0.9,
      state: { status: 'running' },
    }, {
      id: 'file:agent-process-panel',
      label: 'AgentProcessGraph.js',
      type: 'file',
      color: '#8EA4B8',
      icon: 'description',
      weight: 0.7,
      state: { status: 'waiting' },
    }],
    edges: [
      { from: 'agent:ui-engineer', to: 'tool:apply-patch', type: 'toolCall', label: 'tool' },
      { from: 'tool:apply-patch', to: 'file:agent-process-panel', type: 'write', label: 'write' },
    ],
    focus: 'tool:apply-patch',
    syncFocus: 'parallel:subagents',
    focusNodes: ['parallel:subagents', 'agent:ui-engineer', 'tool:apply-patch', 'file:agent-process-panel'],
    activityNodes: ['tool:apply-patch', 'file:agent-process-panel'],
    fanOut: {
      from: 'parallel:subagents',
      to: ['tool:apply-patch', 'file:agent-process-panel'],
    },
  },
  {
    label: 'qa branch',
    delaySlot: 4,
    nodes: [{
      id: 'tool:node-test',
      label: 'node --test',
      type: 'tool',
      color: '#F9A825',
      icon: 'checklist',
      weight: 0.9,
      state: { status: 'running' },
    }, {
      id: 'file:agent-process-test',
      label: 'agent-process-graph.test.js',
      type: 'file',
      color: '#8EA4B8',
      icon: 'description',
      weight: 0.7,
      state: { status: 'waiting' },
    }],
    edges: [
      { from: 'agent:qa-engineer', to: 'tool:node-test', type: 'toolCall', label: 'test' },
      { from: 'tool:node-test', to: 'file:agent-process-test', type: 'read', label: 'read' },
    ],
    focus: 'tool:node-test',
    syncFocus: 'parallel:subagents',
    focusNodes: ['parallel:subagents', 'agent:qa-engineer', 'tool:node-test', 'file:agent-process-test'],
    activityNodes: ['tool:node-test', 'file:agent-process-test'],
    fanOut: {
      from: 'parallel:subagents',
      to: ['tool:node-test', 'file:agent-process-test'],
    },
  },
  {
    label: 'parallel tool calls complete',
    delaySlot: 5,
    updates: [
      { id: 'tool:get-skeleton', state: { status: 'done' } },
      { id: 'tool:apply-patch', state: { status: 'done' } },
      { id: 'tool:node-test', state: { status: 'done' } },
      { id: 'file:agent-process-graph', state: { status: 'done' } },
      { id: 'file:agent-process-panel', state: { status: 'done' } },
      { id: 'file:agent-process-test', state: { status: 'done' } },
      { id: 'agent:code-reviewer', state: { status: 'done' } },
      { id: 'agent:ui-engineer', state: { status: 'done' } },
      { id: 'agent:qa-engineer', state: { status: 'done' } },
      { id: 'parallel:subagents', state: { status: 'waiting' } },
    ],
    edges: [],
    syncFocus: 'parallel:subagents',
    focusNodes: [
      'parallel:subagents',
      'tool:get-skeleton',
      'tool:apply-patch',
      'tool:node-test',
      'file:agent-process-graph',
      'file:agent-process-panel',
      'file:agent-process-test',
    ],
    activityNodes: ['parallel:subagents'],
  },
  {
    label: 'parallel merge',
    delaySlot: 6,
    nodes: [
      {
        id: 'parallel:merge',
        label: 'Merge sub-agent results',
        type: 'merge',
        color: '#26A69A',
        icon: 'merge',
        weight: 2,
        state: { status: 'running' },
      },
      {
        id: 'message:agent:result',
        label: 'Orchestration complete',
        type: 'response',
        color: '#26A69A',
        icon: 'chat',
        weight: 1.35,
        state: { status: 'waiting' },
      },
    ],
    edges: [
      { from: 'agent:code-reviewer', to: 'parallel:merge', type: 'result', label: 'review' },
      { from: 'agent:ui-engineer', to: 'parallel:merge', type: 'result', label: 'ui' },
      { from: 'agent:qa-engineer', to: 'parallel:merge', type: 'result', label: 'qa' },
      { from: 'parallel:merge', to: 'message:agent:result', type: 'merge', label: 'merge' },
      { from: 'message:agent:result', to: 'agent:orchestrator', type: 'response', label: 'merge' },
    ],
    focus: 'parallel:merge',
    focusNodes: ['parallel:subagents', 'agent:code-reviewer', 'agent:ui-engineer', 'agent:qa-engineer', 'parallel:merge', 'message:agent:result'],
    activityNodes: ['parallel:merge', 'message:agent:result'],
    fanOut: {
      from: 'parallel:subagents',
      to: ['parallel:merge', 'message:agent:result'],
    },
  },
  {
    label: 'orchestrator response',
    delaySlot: 7,
    updates: [
      { id: 'parallel:subagents', state: { status: 'done' } },
      { id: 'parallel:merge', state: { status: 'done' } },
      { id: 'message:agent:result', state: { status: 'done' } },
    ],
    edges: [],
    focus: 'message:agent:result',
    focusNodes: ['parallel:merge', 'message:agent:result', 'agent:orchestrator'],
    activityNodes: [],
  },
];

function buildModel() {
  if (state.scenario === 'single') return makeSingleModel();
  if (state.scenario === 'dense') return makeDenseModel();
  if (state.scenario === 'star') return makeStarModel();
  if (state.scenario === 'orchestration') return makeOrchestrationSeedModel();
  return makeProcessModel();
}

function readForceOptions() {
  return {
    ...Object.fromEntries(forceControls.map(([key]) => [key, Number(state[key])])),
    layoutAlgorithm: state.layoutAlgorithm,
  };
}

function resetReplayMovementDiagnostics() {
  replayPositionSnapshot = null;
  replayPositionStep = null;
  replayFrameMoves = [];
}

function resetCoordinateJumpDiagnostics() {
  coordinateJumpSnapshot = null;
  coordinateJumpTick = 0;
  coordinateJumpEvents = [];
}

function getPositionSnapshot() {
  const modelIds = new Set((currentModel?.nodes || []).map((node) => node.id));
  const snapshot = {};
  for (const [id, pos] of graph.nodePositions || []) {
    if (!modelIds.has(id)) continue;
    snapshot[id] = { x: pos.x, y: pos.y };
  }
  return snapshot;
}

function updateReplayMovementDiagnostics(snapshot = getPositionSnapshot()) {
  if (state.scenario !== 'orchestration') {
    resetReplayMovementDiagnostics();
    return;
  }
  if (replayPositionSnapshot && replayPositionStep !== replayStep) {
    let maxCommonMove = 0;
    let movedId = null;
    let commonCount = 0;
    for (const [id, previous] of Object.entries(replayPositionSnapshot)) {
      const next = snapshot[id];
      if (!next) continue;
      commonCount += 1;
      const move = Math.hypot(next.x - previous.x, next.y - previous.y);
      if (move > maxCommonMove) {
        maxCommonMove = move;
        movedId = id;
      }
    }
    replayFrameMoves.push({
      from: replayPositionStep,
      to: replayStep,
      commonCount,
      maxCommonMove: Number(maxCommonMove.toFixed(2)),
      movedId,
    });
  }
  replayPositionSnapshot = snapshot;
  replayPositionStep = replayStep;
}

function updateCoordinateJumpDiagnostics(snapshot = getPositionSnapshot()) {
  coordinateJumpTick += 1;
  const threshold = Math.max(0, Number(state.coordinateJumpThreshold) || 0);
  if (coordinateJumpSnapshot) {
    let maxMove = 0;
    let movedId = null;
    let jumps = [];
    for (const [id, previous] of Object.entries(coordinateJumpSnapshot)) {
      const next = snapshot[id];
      if (!next) continue;
      const dx = next.x - previous.x;
      const dy = next.y - previous.y;
      const move = Math.hypot(dx, dy);
      if (move > maxMove) {
        maxMove = move;
        movedId = id;
      }
      if (move >= threshold) {
        jumps.push({
          id,
          delta: Number(move.toFixed(2)),
          dx: Number(dx.toFixed(2)),
          dy: Number(dy.toFixed(2)),
          from: {
            x: Number(previous.x.toFixed(1)),
            y: Number(previous.y.toFixed(1)),
          },
          to: {
            x: Number(next.x.toFixed(1)),
            y: Number(next.y.toFixed(1)),
          },
        });
      }
    }
    if (jumps.length > 0) {
      jumps.sort((a, b) => b.delta - a.delta);
      coordinateJumpEvents.push({
        tick: coordinateJumpTick,
        replayStep,
        threshold,
        maxMove: Number(maxMove.toFixed(2)),
        movedId,
        jumps: jumps.slice(0, COORDINATE_JUMP_NODE_LIMIT),
      });
      coordinateJumpEvents = coordinateJumpEvents.slice(-COORDINATE_JUMP_EVENT_LIMIT);
    }
  }
  coordinateJumpSnapshot = snapshot;
}

function applyModel() {
  clearReplayTimers();
  replayStep = 0;
  syncFocusId = null;
  activityNodeIds = [];
  resetReplayMovementDiagnostics();
  resetCoordinateJumpDiagnostics();
  currentModel = buildModel();
  graph.setForceLayoutOptions(readForceOptions());
  graph.setLayoutSnapshot(null);
  graph.setGraphModel(currentModel);
  graph.setForceLayoutOptions(readForceOptions(), { restart: true });
  replayAppearance();
  setTimeout(() => fitView(false), 120);
  if (state.scenario === 'orchestration') {
    replayTimers.push(setTimeout(() => startOrchestrationReplay({ reset: false }), 320));
  }
  updateDiagnostics();
}

function fitView(animate = true) {
  graph.fitView({
    padding: Number(state.fitPadding),
    maxZoom: Number(state.focusMaxZoom),
    viewportEase: Number(state.cameraEase),
    animate,
  });
  updateDiagnostics();
}

function focusRoot() {
  const id = currentModel?.nodes?.[0]?.id;
  if (!id) return;
  graph.fitNodes([id], {
    padding: Number(state.fitPadding),
    maxZoom: Number(state.focusMaxZoom),
    select: id,
    viewportEase: Number(state.cameraEase),
    animate: true,
  });
  graph.pulseNode(id, 1200, { waves: 2 });
  updateDiagnostics();
}

function replayAppearance() {
  graph.animateNodeAppearance(null, {
    durationMs: Number(state.appearanceMs),
    staggerMs: Number(state.staggerMs),
  });
}

function clearReplayTimers() {
  for (const timer of replayTimers) clearTimeout(timer);
  replayTimers = [];
  if (replayCameraTimer) {
    clearTimeout(replayCameraTimer);
    replayCameraTimer = null;
  }
  if (replayFinalFocusTimer) {
    clearTimeout(replayFinalFocusTimer);
    replayFinalFocusTimer = null;
  }
  replayCameraInterestIds = [];
  replayCameraFrame = null;
}

function cloneModel(model) {
  return {
    nodes: (model?.nodes || []).map((node) => ({ ...node, state: { ...(node.state || {}) }, params: { ...(node.params || {}) } })),
    edges: [...(model?.edges || [])],
    groups: (model?.groups || []).map((group) => ({ ...group, nodeIds: [...(group.nodeIds || [])] })),
    rootNodes: [...(model?.rootNodes || [])],
  };
}

function appendToGroup(model, groupId, nodeIds) {
  const group = model.groups.find((item) => item.id === groupId);
  if (!group) return;
  for (const id of nodeIds) {
    if (!group.nodeIds.includes(id)) group.nodeIds.push(id);
  }
}

function mergeNodeUpdate(node, update) {
  return {
    ...node,
    ...update,
    state: { ...(node.state || {}), ...(update.state || {}) },
    params: { ...(node.params || {}), ...(update.params || {}) },
  };
}

function pushReplayCameraInterest(ids) {
  for (const id of ids || []) {
    if (!id || replayCameraInterestIds.includes(id)) continue;
    replayCameraInterestIds.push(id);
  }
  if (replayCameraInterestIds.length > REPLAY_CAMERA_INTEREST_LIMIT) {
    replayCameraInterestIds = replayCameraInterestIds.slice(-REPLAY_CAMERA_INTEREST_LIMIT);
  }
}

function getReplayFrameCameraNodes(frame, { includeActivity = true } = {}) {
  let ids = [
    ...(frame.focusNodes || []),
    frame.syncFocus,
    frame.focus,
    frame.primaryFocus,
    ...((frame.fanOut || []).flatMap((item) => [item.from, ...(Array.isArray(item.to) ? item.to : [item.to])])),
  ];
  if (includeActivity) ids.push(...(frame.activityNodes || []));
  return [...new Set(ids.filter(Boolean))];
}

function trackReplayCamera(frame, { select = false, attempt = 0 } = {}) {
  const frameNodes = getReplayFrameCameraNodes(frame, { includeActivity: false });
  if (frameNodes.length === 0 && replayCameraInterestIds.length === 0) return;
  pushReplayCameraInterest(frameNodes);
  const primaryFocus = frame.primaryFocus || frame.syncFocus || frame.focus || frame.focusNodes?.[0] || frame.activityNodes?.[0] || replayCameraInterestIds.at(-1);
  const didFocus = graph.fitNodes(replayCameraInterestIds, {
    padding: Number(state.fitPadding),
    maxZoom: Number(state.focusMaxZoom),
    select: select ? primaryFocus : false,
    transition: false,
    marker: false,
    viewportEase: Number(state.cameraEase),
    animate: true,
  });
  if (didFocus) {
    updateDiagnostics();
    return;
  }
  if (attempt < 12) {
    replayTimers.push(setTimeout(() => trackReplayCamera(frame, { select, attempt: attempt + 1 }), 80));
  }
}

function scheduleReplayCameraTrack(frame) {
  replayCameraFrame = frame;
  pushReplayCameraInterest(getReplayFrameCameraNodes(frame, { includeActivity: false }));
  if (replayCameraTimer) clearTimeout(replayCameraTimer);
  replayCameraTimer = setTimeout(() => {
    replayCameraTimer = null;
    if (replayCameraFrame) trackReplayCamera(replayCameraFrame, { select: false });
  }, REPLAY_CAMERA_TRACK_MS);
}

function focusReplayFrame(frame, attempt = 0) {
  const focusNodes = frame.focusNodes?.length ? frame.focusNodes : [frame.syncFocus || frame.focus].filter(Boolean);
  pushReplayCameraInterest(getReplayFrameCameraNodes(frame, { includeActivity: true }));
  const primaryFocus = frame.primaryFocus || frame.syncFocus || frame.focus || focusNodes[0] || replayCameraInterestIds.at(-1);
  if (focusNodes.length === 0) return;

  const didFocus = graph.fitNodes(replayCameraInterestIds.length ? replayCameraInterestIds : focusNodes, {
    padding: Number(state.fitPadding),
    maxZoom: Number(state.focusMaxZoom),
    select: primaryFocus,
    transition: false,
    marker: false,
    viewportEase: Number(state.cameraEase),
    animate: true,
  });
  if (didFocus) {
    updateDiagnostics();
    return;
  }
  if (attempt < 12) {
    replayTimers.push(setTimeout(() => focusReplayFrame(frame, attempt + 1), 80));
  }
}

function scheduleFinalReplayFocus(frame) {
  if (!frame.focusNodes?.length && !frame.syncFocus && !frame.focus) return;
  if (replayFinalFocusTimer) clearTimeout(replayFinalFocusTimer);
  replayFinalFocusTimer = setTimeout(() => {
    replayFinalFocusTimer = null;
    focusReplayFrame(frame);
  }, FINAL_REPLAY_FOCUS_IDLE_MS);
}

function getReplayFramePulseNode(frame) {
  return frame.primaryFocus
    || frame.syncFocus
    || frame.focus
    || frame.fanOut?.[0]?.from
    || frame.focusNodes?.[0]
    || frame.activityNodes?.[0]
    || '';
}

function scheduleReplayPulse(frame) {
  const id = getReplayFramePulseNode(frame);
  if (!id) return;
  const duration = Math.max(900, Number(state.eventDelayMs) * 1.7);
  graph.pulseNode(id, duration, { waves: 1 });
}

function mergeReplayFrame(events) {
  let frame = {
    labels: [],
    nodes: [],
    edges: [],
    updates: [],
    focusNodes: [],
    activityNodes: [],
    fanOut: [],
    focus: '',
    syncFocus: '',
    primaryFocus: '',
  };
  let seenFocus = new Set();
  let seenActivity = new Set();
  for (const event of events) {
    frame.labels.push(event.label);
    frame.nodes.push(...(event.nodes || []));
    frame.edges.push(...(event.edges || []));
    frame.updates.push(...(event.updates || []));
    if (event.focus) frame.focus = event.focus;
    if (event.syncFocus) frame.syncFocus = event.syncFocus;
    if (event.primaryFocus) frame.primaryFocus = event.primaryFocus;
    for (const id of event.focusNodes || []) {
      if (!seenFocus.has(id)) {
        seenFocus.add(id);
        frame.focusNodes.push(id);
      }
    }
    for (const id of event.activityNodes || []) {
      if (!seenActivity.has(id)) {
        seenActivity.add(id);
        frame.activityNodes.push(id);
      }
    }
    if (event.fanOut) frame.fanOut.push(event.fanOut);
  }
  return frame;
}

function applyOrchestrationFrame(frame) {
  if (!currentModel || state.scenario !== 'orchestration') return;
  const next = cloneModel(currentModel);
  const existing = new Set(next.nodes.map((node) => node.id));
  const newNodes = (frame.nodes || []).filter((node) => !existing.has(node.id));
  for (const update of frame.updates || []) {
    const index = next.nodes.findIndex((node) => node.id === update.id);
    if (index >= 0) next.nodes[index] = mergeNodeUpdate(next.nodes[index], update);
  }
  next.nodes.push(...newNodes);
  next.edges.push(...(frame.edges || []));
  next.rootNodes = next.nodes.map((node) => node.id);
  appendToGroup(next, 'agents', newNodes.filter((node) => node.type === 'agent').map((node) => node.id));
  appendToGroup(next, 'work', newNodes.filter((node) => node.type !== 'agent').map((node) => node.id));
  currentModel = next;
  replayStep += 1;
  graph.setGraphModel(currentModel);
  graph.animateNodeAppearance(newNodes.map((node) => node.id), {
    durationMs: Number(state.appearanceMs),
    staggerMs: Number(state.staggerMs),
  });
  syncFocusId = frame.syncFocus || null;
  activityNodeIds = [...(frame.activityNodes || [])];
  for (const fanOut of frame.fanOut || []) {
    graph.queueTransitionMarkers?.(fanOut.from, fanOut.to, {
      transitionMarkerMs: Math.max(800, Number(state.eventDelayMs) * 1.8),
    });
  }
  scheduleReplayPulse(frame);
  scheduleReplayCameraTrack(frame);
  scheduleFinalReplayFocus(frame);
  updateDiagnostics();
}

function groupOrchestrationEventsByDelaySlot() {
  let groups = new Map();
  orchestrationEvents.forEach((event, index) => {
    let delaySlot = Number.isFinite(event.delaySlot) ? event.delaySlot : index + 1;
    if (!groups.has(delaySlot)) groups.set(delaySlot, []);
    groups.get(delaySlot).push(event);
  });
  return [...groups.entries()].sort(([a], [b]) => a - b);
}

function startOrchestrationReplay({ reset = true } = {}) {
  clearReplayTimers();
  if (reset) {
    state.scenario = 'orchestration';
    currentModel = makeOrchestrationSeedModel();
    replayStep = 0;
    syncFocusId = null;
    activityNodeIds = [];
    resetReplayMovementDiagnostics();
    resetCoordinateJumpDiagnostics();
    replayCameraInterestIds = ['agent:orchestrator'];
    replayCameraFrame = null;
    graph.resetLayoutState();
    graph.setLayoutSnapshot(null);
    graph.setGraphModel(currentModel);
    graph.setForceLayoutOptions(readForceOptions(), { restart: true });
    graph.animateNodeAppearance(['agent:orchestrator'], {
      durationMs: Number(state.appearanceMs),
      staggerMs: Number(state.staggerMs),
    });
    graph.fitNodes(['agent:orchestrator'], {
      padding: Number(state.fitPadding),
      maxZoom: Number(state.focusMaxZoom),
      select: 'agent:orchestrator',
      viewportEase: Number(state.cameraEase),
      animate: true,
    });
  }

  for (const [delaySlot, events] of groupOrchestrationEventsByDelaySlot()) {
    replayTimers.push(setTimeout(() => applyOrchestrationFrame(mergeReplayFrame(events)), Number(state.eventDelayMs) * delaySlot));
  }
  updateDiagnostics();
}

function updateForce() {
  graph.setForceLayoutOptions(readForceOptions());
  updateDiagnostics();
}

function makeSlider([key, min, max, , step]) {
  const field = document.createElement('label');
  field.className = 'field';
  field.innerHTML = `
    <span class="field-row"><strong>${key}</strong><span data-value>${state[key]}</span></span>
    <input type="range" min="${min}" max="${max}" step="${step}" value="${state[key]}">
  `;
  const input = field.querySelector('input');
  const value = field.querySelector('[data-value]');
  input.addEventListener('input', () => {
    state[key] = Number(input.value);
    value.textContent = input.value;
    if (forceControls.some(([controlKey]) => controlKey === key)) updateForce();
  });
  input.addEventListener('change', () => {
    if (forceControls.some(([controlKey]) => controlKey === key)) graph.setForceLayoutOptions(readForceOptions(), { restart: true });
  });
  return field;
}

function renderControls() {
  const algorithm = document.createElement('label');
  algorithm.className = 'field';
  algorithm.innerHTML = `
    <span class="field-row"><strong>layoutAlgorithm</strong></span>
    <select>
      ${layoutAlgorithms.map((item) => `<option value="${item.id}">${item.label}</option>`).join('')}
    </select>
  `;
  const algorithmSelect = algorithm.querySelector('select');
  algorithmSelect.value = state.layoutAlgorithm;
  algorithmSelect.addEventListener('change', () => {
    state.layoutAlgorithm = algorithmSelect.value;
    graph.setForceLayoutOptions(readForceOptions(), { restart: true });
    resetCoordinateJumpDiagnostics();
    updateDiagnostics();
  });

  const scenario = document.createElement('label');
  scenario.className = 'field';
  scenario.innerHTML = `
    <span class="field-row"><strong>scenario</strong></span>
    <select>
      <option value="process">process groups</option>
      <option value="dense">dense cross-links</option>
      <option value="single">single node</option>
      <option value="star">star hub</option>
      <option value="orchestration">orchestration replay</option>
    </select>
  `;
  const select = scenario.querySelector('select');
  select.value = state.scenario;
  select.addEventListener('change', () => {
    state.scenario = select.value;
    applyModel();
  });

  const actionGrid = document.createElement('div');
  actionGrid.className = 'button-grid';
  const actions = [
    ['Restart layout', applyModel],
    ['Fit view', () => fitView(true)],
    ['Focus root', focusRoot],
    ['Replay appearance', replayAppearance],
    ['Replay orchestration', () => startOrchestrationReplay({ reset: true })],
  ];
  for (const [label, action] of actions) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    button.addEventListener('click', action);
    actionGrid.append(button);
  }

  controls.replaceChildren(
    algorithm,
    scenario,
    actionGrid,
    ...forceControls.map(makeSlider),
    ...viewControls.map(makeSlider)
  );
}

function updateDiagnostics() {
  const modelIds = new Set((currentModel?.nodes || []).map((node) => node.id));
  const allPositions = graph.nodePositions ? [...graph.nodePositions.entries()] : [];
  const positionSnapshot = getPositionSnapshot();
  updateReplayMovementDiagnostics(positionSnapshot);
  updateCoordinateJumpDiagnostics(positionSnapshot);
  const positions = Object.values(positionSnapshot);
  const stalePositions = allPositions.filter(([id]) => !modelIds.has(id)).length;
  const xs = positions.map((pos) => pos.x);
  const ys = positions.map((pos) => pos.y);
  const data = {
    scenario: state.scenario,
    layoutAlgorithm: state.layoutAlgorithm,
    nodes: currentModel?.nodes?.length || 0,
    edges: currentModel?.edges?.length || 0,
    positions: positions.length,
    stalePositions,
    replayStep,
    replayTotal: state.scenario === 'orchestration' ? groupOrchestrationEventsByDelaySlot().length : 0,
    parallelBranches: state.scenario === 'orchestration' ? 3 : 0,
    waitingNodes: state.scenario === 'orchestration'
      ? (currentModel?.nodes || []).filter((node) => waitingStatuses.has(String(node.state?.status || '').toLowerCase())).length
      : 0,
    syncFocus: syncFocusId,
    activityNodes: activityNodeIds,
    lastFrameMove: replayFrameMoves[replayFrameMoves.length - 1] || null,
    maxFrameMove: replayFrameMoves.length
      ? Math.max(...replayFrameMoves.map((frame) => frame.maxCommonMove))
      : 0,
    frameMoves: replayFrameMoves.slice(-8),
    coordinateJumpThreshold: Number(state.coordinateJumpThreshold),
    coordinateJumpCount: coordinateJumpEvents.length,
    lastCoordinateJump: coordinateJumpEvents[coordinateJumpEvents.length - 1] || null,
    maxCoordinateJump: coordinateJumpEvents.length
      ? Math.max(...coordinateJumpEvents.map((event) => event.maxMove))
      : 0,
    coordinateJumps: coordinateJumpEvents.slice(-8),
    cameraEase: state.cameraEase,
    zoom: Number(graph.zoom?.toFixed?.(3) || graph.zoom || 0),
    targetZoom: Number(graph._targetZoom?.toFixed?.(3) || graph._targetZoom || 0),
    pan: {
      x: Number(graph.panX?.toFixed?.(1) || graph.panX || 0),
      y: Number(graph.panY?.toFixed?.(1) || graph.panY || 0),
    },
    extents: positions.length
      ? {
          w: Number((Math.max(...xs) - Math.min(...xs)).toFixed(1)),
          h: Number((Math.max(...ys) - Math.min(...ys)).toFixed(1)),
        }
      : null,
    activeNode: graph.activeNode?.id || null,
  };
  diagnostics.textContent = JSON.stringify(data, null, 2);
}

graph.addEventListener('layout-tick', updateDiagnostics);
graph.addEventListener('layout-done', updateDiagnostics);
graph.addEventListener('node-deselected', updateDiagnostics);
window.addEventListener('resize', () => fitView(false));
window.addEventListener('beforeunload', clearReplayTimers);

renderControls();
applyModel();
