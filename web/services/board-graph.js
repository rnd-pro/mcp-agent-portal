import { graphModelToCanvasGraphModel } from 'symbiote-ui/graph';

const NODE_COLORS = {
  column: '#5C6BC0',
  card: '#20A4F3',
  cardBlocked: '#D64545',
  cardQueued: '#F9A825',
  cardAdmitting: '#00ACC1',
  cardRunning: '#1AA187',
};

const LIFECYCLE_STATES = new Set(['idle', 'blocked', 'queued', 'admitting', 'running']);
// Recovery gates mirror the frozen board vocabulary (src/iso/workflow-board.js WORKFLOW_RECOVERY_GATES).
// A recovery-gated, rank-decreasing transition is the recovery class; everything else is forward.
const RECOVERY_GATES = new Set(['rework_authorized']);
const LIFECYCLE_ICONS = {
  idle: 'radio_button_unchecked',
  blocked: 'block',
  queued: 'schedule',
  admitting: 'login',
  running: 'play_circle',
};

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeText(value) {
  return String(value ?? '').trim();
}

function normalizeId(value, fallback = 'item') {
  let text = normalizeText(value) || fallback;
  return text.replace(/\s+/g, ' ').slice(0, 180);
}

function compactLabel(value, fallback = '') {
  let text = normalizeText(value);
  if (!text) return fallback;
  if (text.length <= 44) return text;
  return `${text.slice(0, 18)}...${text.slice(-20)}`;
}

function normalizeLifecycle(value) {
  let text = normalizeText(value);
  return LIFECYCLE_STATES.has(text) ? text : 'idle';
}

function gateIds(transition = {}) {
  let gates = asArray(transition.gates).map(normalizeText).filter(Boolean);
  if (gates.length) return gates;
  let single = normalizeText(transition.gate);
  return single ? [single] : [];
}

function addUnique(list, item, seen, key) {
  if (seen.has(key)) return;
  seen.add(key);
  list.push(item);
}

function makeNode({ id, kind, label, type, color, icon = '', width = 156, height = 42, state = {}, params = {}, metadata = {} }) {
  return {
    id,
    kind,
    label,
    state,
    params,
    metadata,
    children: [],
    design: {
      component: 'graph-node',
      variant: type,
      width,
      height,
      color,
      ...(icon ? { icon } : {}),
      canvas: {
        description: metadata.description,
        ...(icon ? { icon } : {}),
      },
    },
  };
}

function makeEdge({ from, to, kind, label, params = {} }) {
  return {
    id: `${from}:out->${to}:in:${kind}:${label || ''}`,
    kind,
    label,
    source: { nodeId: from, port: 'out' },
    target: { nodeId: to, port: 'in' },
    params,
  };
}

function columnNodeId(columnId) {
  return `column:${normalizeId(columnId, 'column')}`;
}

function cardNodeId(cardId) {
  return `card:${normalizeId(cardId, 'card')}`;
}

function lifecycleColor(lifecycle) {
  switch (lifecycle) {
    case 'blocked': return NODE_COLORS.cardBlocked;
    case 'queued': return NODE_COLORS.cardQueued;
    case 'admitting': return NODE_COLORS.cardAdmitting;
    case 'running': return NODE_COLORS.cardRunning;
    default: return NODE_COLORS.card;
  }
}

function cardQueueState(queue = {}) {
  let source = asObject(queue);
  return {
    enqueuedAt: source.enqueuedAt ?? null,
    queueEpoch: source.queueEpoch ?? null,
    admissionId: source.admissionId ?? null,
    priority: source.priority ?? null,
    position: source.position ?? null,
  };
}

function queueBadge(queue = {}) {
  let parts = [];
  if (queue.position != null) parts.push(`#${queue.position}`);
  if (queue.priority != null) parts.push(`p${queue.priority}`);
  return parts.join(' ');
}

// Recovery-class derivation mirrors the frozen classifier (AD-6): a transition is `recovery` when it
// is recovery-gated AND rank-decreasing. Column rank comes from the order columns appear in the
// projection, which is the board's authored forward order. Everything else is `forward`.
function buildColumnRank(columns) {
  let rank = new Map();
  asArray(columns).forEach((column, index) => {
    let id = normalizeText(column?.id);
    if (id && !rank.has(id)) rank.set(id, index);
  });
  return rank;
}

function transitionClass(transition, columnRank) {
  let gates = gateIds(transition);
  let recoveryGated = gates.some(gate => RECOVERY_GATES.has(gate));
  if (!recoveryGated) return 'forward';
  let fromRank = columnRank.has(transition.from) ? columnRank.get(transition.from) : -1;
  let toRank = columnRank.has(transition.to) ? columnRank.get(transition.to) : -1;
  return toRank < fromRank ? 'recovery' : 'forward';
}

/**
 * Pure adapter (AD-12): turn a frozen `workflow-board-projection/v2` into a `graph-model-v1`. Columns
 * and cards become nodes; board transitions and card dependencies become edges. Card lifecycle/queue
 * state is encoded as node `state` + badges so blocked/queued/running cards render distinctly. No DOM,
 * no fetch, deterministic — mirrors web/services/agent-process-graph.js.
 */
export function buildWorkflowBoardGraphModel(projection = {}) {
  let source = asObject(projection);
  let board = asObject(source.board);
  let columns = asArray(source.columns).length ? asArray(source.columns) : asArray(board.columns);
  let cards = asArray(source.cards).length
    ? asArray(source.cards)
    : columns.flatMap(column => asArray(column?.cards));
  let transitions = asArray(board.transitions).length ? asArray(board.transitions) : asArray(source.transitions);
  let columnRank = buildColumnRank(columns);

  let nodes = [];
  let edges = [];
  let seenNodes = new Set();
  let seenEdges = new Set();
  const addNode = (node) => addUnique(nodes, node, seenNodes, node.id);
  const addEdge = (edge) => addUnique(edges, edge, seenEdges, edge.id);

  let columnIds = new Set();
  let cardCountByColumn = new Map();

  for (let column of columns) {
    let id = normalizeText(column?.id);
    if (!id) continue;
    columnIds.add(id);
    let columnCardCount = asArray(column.cards).length;
    cardCountByColumn.set(id, columnCardCount);
    let automation = asObject(column.automation);
    addNode(makeNode({
      id: columnNodeId(id),
      kind: 'workflow.board.column',
      label: compactLabel(column.title || id, id),
      type: 'column',
      color: NODE_COLORS.column,
      icon: 'view_column',
      width: 168,
      height: 44,
      state: { status: normalizeText(automation.mode) || 'manual' },
      params: {
        columnId: id,
        title: column.title || null,
        gate: column.gate || null,
        trigger: automation.trigger || null,
        action: automation.action || null,
        mode: automation.mode || null,
        cardCount: columnCardCount,
      },
      metadata: { description: column.description || column.gate || '' },
    }));
  }

  let cardIds = new Set(cards.map(card => normalizeText(card?.id)).filter(Boolean));

  for (let card of cards) {
    let id = normalizeText(card?.id);
    if (!id) continue;
    let lifecycle = normalizeLifecycle(card.lifecycle);
    let queue = cardQueueState(card.queue);
    let badge = queueBadge(queue);
    let nodeId = cardNodeId(id);
    let columnId = normalizeText(card.columnId);
    addNode(makeNode({
      id: nodeId,
      kind: 'workflow.board.card',
      label: compactLabel(card.title || id, id),
      type: 'card',
      color: lifecycleColor(lifecycle),
      icon: LIFECYCLE_ICONS[lifecycle] || LIFECYCLE_ICONS.idle,
      width: 160,
      height: 40,
      state: { status: lifecycle, ...(badge ? { badge } : {}) },
      params: {
        cardId: id,
        columnId: columnId || null,
        title: card.title || null,
        lifecycle,
        priority: card.priority || null,
        status: card.status || null,
        queue,
        dependencyCount: asArray(card.dependsOn).length,
      },
      metadata: { description: [lifecycle, badge].filter(Boolean).join(' · ') },
    }));

    if (columnId && columnIds.has(columnId)) {
      addEdge(makeEdge({
        from: columnNodeId(columnId),
        to: nodeId,
        kind: 'workflow.board.placement',
        label: lifecycle,
        params: { columnId, lifecycle },
      }));
    }
  }

  for (let transition of transitions) {
    let from = normalizeText(transition?.from);
    let to = normalizeText(transition?.to);
    if (!from || !to || !columnIds.has(from) || !columnIds.has(to)) continue;
    let gates = gateIds(transition);
    let edgeClass = transitionClass(transition, columnRank);
    addEdge(makeEdge({
      from: columnNodeId(from),
      to: columnNodeId(to),
      kind: `workflow.board.transition.${edgeClass}`,
      label: gates[0] || edgeClass,
      params: { from, to, gates, edgeClass },
    }));
  }

  for (let card of cards) {
    let id = normalizeText(card?.id);
    if (!id) continue;
    for (let dependency of asArray(card.dependsOn)) {
      let upstreamId = normalizeText(dependency?.cardId);
      if (!upstreamId || !cardIds.has(upstreamId)) continue;
      let releaseWhen = normalizeText(dependency.releaseWhen) || 'card_done';
      addEdge(makeEdge({
        from: cardNodeId(upstreamId),
        to: cardNodeId(id),
        kind: 'workflow.board.dependency',
        label: releaseWhen,
        params: {
          fromCardId: upstreamId,
          toCardId: id,
          releaseWhen,
          onUpstreamFailure: normalizeText(dependency.onUpstreamFailure) || 'block_and_escalate',
        },
      }));
    }
  }

  let telemetry = asObject(source.telemetry);
  let queueSummary = asObject(source.queue);

  return {
    version: 'graph-model-v1',
    metadata: {
      kind: 'workflow-board-graph',
      boardId: source.boardId || board.id || null,
      schema: source.schema || null,
      projectionVersion: source.version ?? null,
      columnCount: columnIds.size,
      cardCount: cardIds.size,
      transitionCount: edges.filter(edge => edge.kind.startsWith('workflow.board.transition.')).length,
      dependencyCount: edges.filter(edge => edge.kind === 'workflow.board.dependency').length,
      blockedOnDependencyCount: queueSummary.blockedOnDependencyCount
        ?? telemetry.blockedOnDependencyCount
        ?? cards.filter(card => normalizeLifecycle(card.lifecycle) === 'blocked').length,
      queueDepth: telemetry.queueDepth ?? queueSummary.depth ?? 0,
    },
    nodes,
    edges,
    views: {
      canvas: {
        kind: 'canvas-graph',
        roots: nodes.map(node => node.id),
      },
    },
  };
}

export function buildWorkflowBoardCanvasGraphModel(projection = {}) {
  return graphModelToCanvasGraphModel(buildWorkflowBoardGraphModel(projection), { view: 'canvas' });
}

export function summarizeWorkflowBoardGraphModel(model = {}) {
  let nodes = asArray(model.nodes);
  let edges = asArray(model.edges);
  let counts = {};
  for (let node of nodes) {
    let key = String(node.kind || 'unknown');
    counts[key] = (counts[key] || 0) + 1;
  }
  return {
    nodes: nodes.length,
    edges: edges.length,
    counts,
    metadata: asObject(model.metadata),
  };
}
