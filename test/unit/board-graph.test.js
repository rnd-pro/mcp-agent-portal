import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const {
  buildWorkflowBoardCanvasGraphModel,
  buildWorkflowBoardGraphModel,
  summarizeWorkflowBoardGraphModel,
} = await import('../../web/services/board-graph.js?board-graph-test');

function nodeByKind(model, kind) {
  return model.nodes.filter(node => node.kind === kind);
}

function buildProjection() {
  return {
    schema: 'workflow-board-projection/v2',
    boardId: 'wf-board',
    board: {
      id: 'wf-board',
      columns: [
        { id: 'ready', title: 'Ready', automation: { action: 'orchestrate', mode: 'gated' } },
        { id: 'in-progress', title: 'In Progress', automation: { action: 'execute' } },
        { id: 'quality-audit', title: 'Quality Audit', automation: { action: 'audit' } },
      ],
      transitions: [
        { from: 'ready', to: 'in-progress', gate: 'has_owner_and_acceptance' },
        { from: 'in-progress', to: 'quality-audit', gate: 'no_active_blocker' },
        { from: 'quality-audit', to: 'ready', gate: 'rework_authorized' },
      ],
    },
    columns: [
      { id: 'ready', title: 'Ready', cards: [{ id: 'card-a' }] },
      { id: 'in-progress', title: 'In Progress', cards: [{ id: 'card-b' }, { id: 'card-c' }] },
      { id: 'quality-audit', title: 'Quality Audit', cards: [{ id: 'card-d' }] },
    ],
    cards: [
      { id: 'card-a', columnId: 'ready', title: 'Scope work', lifecycle: 'idle', dependsOn: [], queue: {} },
      {
        id: 'card-b',
        columnId: 'in-progress',
        title: 'Implement adapter',
        lifecycle: 'running',
        dependsOn: [{ cardId: 'card-a', releaseWhen: 'card_done', onUpstreamFailure: 'block_and_escalate' }],
        queue: { enqueuedAt: 10, queueEpoch: 1, admissionId: 'adm-1', priority: 5, position: 0 },
      },
      {
        id: 'card-c',
        columnId: 'in-progress',
        title: 'Blocked work',
        lifecycle: 'blocked',
        dependsOn: [{ cardId: 'card-b', releaseWhen: 'audit_passed' }],
        queue: {},
      },
      {
        id: 'card-d',
        columnId: 'quality-audit',
        title: 'Queued audit',
        lifecycle: 'queued',
        dependsOn: [],
        queue: { priority: 2, position: 3 },
      },
    ],
    queue: { depth: 0, blockedOnDependencyCount: 1 },
    telemetry: { queueDepth: 0, blockedOnDependencyCount: 1 },
    version: 42,
  };
}

describe('workflow board graph model', () => {
  it('maps columns and cards to nodes', () => {
    let model = buildWorkflowBoardGraphModel(buildProjection());
    let columnNodes = nodeByKind(model, 'workflow.board.column');
    let cardNodes = nodeByKind(model, 'workflow.board.card');

    assert.equal(model.version, 'graph-model-v1');
    assert.equal(columnNodes.length, 3);
    assert.equal(cardNodes.length, 4);
    assert.ok(columnNodes.some(node => node.id === 'column:ready' && node.params.columnId === 'ready'));
    assert.ok(cardNodes.some(node => node.id === 'card:card-a' && node.params.columnId === 'ready'));
    assert.deepEqual(model.views.canvas.roots, model.nodes.map(node => node.id));
  });

  it('maps transitions to forward and recovery edges and card dependencies to dependency edges', () => {
    let model = buildWorkflowBoardGraphModel(buildProjection());
    let forward = model.edges.filter(edge => edge.kind === 'workflow.board.transition.forward');
    let recovery = model.edges.filter(edge => edge.kind === 'workflow.board.transition.recovery');
    let dependencies = model.edges.filter(edge => edge.kind === 'workflow.board.dependency');
    let placements = model.edges.filter(edge => edge.kind === 'workflow.board.placement');

    assert.equal(forward.length, 2);
    assert.equal(recovery.length, 1);
    assert.equal(recovery[0].source.nodeId, 'column:quality-audit');
    assert.equal(recovery[0].target.nodeId, 'column:ready');
    assert.equal(recovery[0].params.gates[0], 'rework_authorized');

    assert.equal(dependencies.length, 2);
    let depBtoC = dependencies.find(edge => edge.source.nodeId === 'card:card-b' && edge.target.nodeId === 'card:card-c');
    assert.equal(depBtoC.label, 'audit_passed');
    let depAtoB = dependencies.find(edge => edge.source.nodeId === 'card:card-a' && edge.target.nodeId === 'card:card-b');
    assert.equal(depAtoB.params.releaseWhen, 'card_done');
    assert.equal(depAtoB.params.onUpstreamFailure, 'block_and_escalate');

    // every card is placed under its column
    assert.equal(placements.length, 4);
  });

  it('encodes lifecycle and queue state on card nodes', () => {
    let model = buildWorkflowBoardGraphModel(buildProjection());
    let running = model.nodes.find(node => node.id === 'card:card-b');
    let blocked = model.nodes.find(node => node.id === 'card:card-c');
    let queued = model.nodes.find(node => node.id === 'card:card-d');
    let idle = model.nodes.find(node => node.id === 'card:card-a');

    assert.equal(running.state.status, 'running');
    assert.equal(running.params.lifecycle, 'running');
    assert.equal(running.params.queue.admissionId, 'adm-1');
    assert.equal(running.params.queue.position, 0);
    assert.equal(running.state.badge, '#0 p5');

    assert.equal(blocked.state.status, 'blocked');
    assert.notEqual(blocked.design.color, idle.design.color);

    assert.equal(queued.state.status, 'queued');
    assert.equal(queued.state.badge, '#3 p2');

    assert.equal(idle.state.status, 'idle');
    assert.equal('badge' in idle.state, false);
  });

  it('summarizes counts and carries projection metadata', () => {
    let model = buildWorkflowBoardGraphModel(buildProjection());
    let summary = summarizeWorkflowBoardGraphModel(model);

    assert.equal(summary.metadata.kind, 'workflow-board-graph');
    assert.equal(summary.metadata.boardId, 'wf-board');
    assert.equal(summary.metadata.schema, 'workflow-board-projection/v2');
    assert.equal(summary.metadata.projectionVersion, 42);
    assert.equal(summary.metadata.columnCount, 3);
    assert.equal(summary.metadata.cardCount, 4);
    assert.equal(summary.metadata.transitionCount, 3);
    assert.equal(summary.metadata.dependencyCount, 2);
    assert.equal(summary.metadata.blockedOnDependencyCount, 1);
    assert.equal(summary.counts['workflow.board.column'], 3);
    assert.equal(summary.counts['workflow.board.card'], 4);
  });

  it('is deterministic for the same projection', () => {
    let projection = buildProjection();
    assert.deepEqual(
      buildWorkflowBoardGraphModel(projection),
      buildWorkflowBoardGraphModel(buildProjection()),
    );
  });

  it('returns a canvas graph model consumable by symbiote-ui canvas-graph', () => {
    let canvasModel = buildWorkflowBoardCanvasGraphModel(buildProjection());

    assert.ok(Array.isArray(canvasModel.nodes));
    assert.ok(Array.isArray(canvasModel.edges));
    assert.ok(Array.isArray(canvasModel.rootNodes));
    assert.ok(canvasModel.nodes.some(node => node.id === 'column:ready'));
    assert.ok(canvasModel.nodes.some(node => node.id === 'card:card-b'));
    assert.ok(canvasModel.edges.some(edge => edge.from === 'card:card-a' && edge.to === 'card:card-b'));
    assert.ok(canvasModel.rootNodes.includes('column:ready'));
  });

  it('reads columns and cards from a board-only projection without a top-level cards list', () => {
    let model = buildWorkflowBoardGraphModel({
      schema: 'workflow-board-projection/v2',
      board: {
        id: 'b1',
        columns: [{ id: 'backlog', title: 'Backlog', cards: [{ id: 'c1', columnId: 'backlog', lifecycle: 'idle' }] }],
        transitions: [],
      },
    });

    assert.ok(model.nodes.some(node => node.id === 'column:backlog'));
    assert.ok(model.nodes.some(node => node.id === 'card:c1'));
  });

  it('tolerates an empty projection', () => {
    let model = buildWorkflowBoardGraphModel({});
    assert.equal(model.nodes.length, 0);
    assert.equal(model.edges.length, 0);
    assert.equal(model.metadata.columnCount, 0);
    assert.equal(model.metadata.cardCount, 0);
  });
});
