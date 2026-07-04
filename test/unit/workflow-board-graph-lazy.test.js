import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import {
  buildWorkflowBoardProjectionFromContext,
  createWorkflowBoardRenderContext,
  workflowBoardGraphTopologySignature,
} from '../../web/panels/WorkflowBoard/workflow-board-render-context.js';
import {
  buildWorkflowBoardCanvasGraphModel,
  buildWorkflowBoardGraphModel,
} from '../../web/services/board-graph.js?graph-lazy-test';

const WORKFLOW_BOARD_SOURCE = new URL(
  '../../web/panels/WorkflowBoard/WorkflowBoard.js',
  import.meta.url,
);

function buildBoard(cardOverrides = {}) {
  return {
    id: 'board-1',
    boardId: 'board-1',
    mode: 'autonomous',
    columns: [
      { id: 'ready', title: 'Ready', automation: { action: 'orchestrate' }, cards: [] },
      { id: 'in-progress', title: 'In Progress', automation: { action: 'execute' }, cards: [] },
    ],
    transitions: [{ from: 'ready', to: 'in-progress', gate: 'has_owner_and_acceptance' }],
    cards: [
      { id: 'alpha', title: 'Alpha', columnId: 'ready', raw: { lifecycle: 'queued' }, ...cardOverrides },
    ],
  };
}

// Minimal reimplementation of the WorkflowBoard graph-model lifecycle: the component builds the
// graph/canvas models lazily inside #renderGraph (graph view only), keyed on the same cheap topology
// signature, and reuses the cache otherwise. This harness exercises that exact contract without a DOM.
class GraphModelHarness {
  activeView = 'kanban';
  buildCount = 0;
  #cache = null;

  #contextFor(board) {
    let context = createWorkflowBoardRenderContext(board, { scope: 'home' });
    context.columns = context.columns.map(column => ({
      ...column,
      cards: board.cards.filter(card => card.columnId === column.id),
    }));
    return context;
  }

  #ensureGraphModel(context) {
    let signature = workflowBoardGraphTopologySignature(context);
    if (this.#cache && this.#cache.signature === signature) return false;
    let projection = buildWorkflowBoardProjectionFromContext(context);
    this.#cache = {
      signature,
      graphModel: buildWorkflowBoardGraphModel(projection),
      canvasModel: buildWorkflowBoardCanvasGraphModel(projection),
    };
    this.buildCount += 1;
    return true;
  }

  // Mirror of #render: only touches the graph builders when the graph view is active.
  render(board) {
    let context = this.#contextFor(board);
    if (this.activeView === 'graph') this.#ensureGraphModel(context);
  }

  // Mirror of setView('graph'): renders the graph on switch.
  setView(view, board) {
    if (view === this.activeView) return;
    this.activeView = view;
    if (view === 'graph') this.#ensureGraphModel(this.#contextFor(board));
  }
}

describe('WorkflowBoard graph-model laziness', () => {
  it('never invokes the graph builders while the kanban view is active', () => {
    let harness = new GraphModelHarness();
    let board = buildBoard();
    for (let i = 0; i < 5; i += 1) harness.render(board);
    assert.equal(harness.buildCount, 0, 'kanban-view renders must not build the graph model');
  });

  it('builds once on the first switch to graph and reuses the cache on repeat renders', () => {
    let harness = new GraphModelHarness();
    let board = buildBoard();
    harness.render(board);
    harness.setView('graph', board);
    assert.equal(harness.buildCount, 1, 'switching to graph builds the model once');
    harness.render(board);
    harness.render(board);
    assert.equal(harness.buildCount, 1, 'unchanged-topology graph renders reuse the cached model');
  });

  it('reuses the cached model when switching kanban -> graph without a data change', () => {
    let harness = new GraphModelHarness();
    let board = buildBoard();
    harness.setView('graph', board);
    harness.setView('kanban', board);
    harness.setView('graph', board);
    assert.equal(harness.buildCount, 1, 'switching back to graph without a change reuses the cache');
  });

  it('rebuilds only when the board topology materially changes', () => {
    let harness = new GraphModelHarness();
    harness.setView('graph', buildBoard());
    assert.equal(harness.buildCount, 1);
    // A material change (card moved to another column) invalidates the signature.
    harness.render(buildBoard({ columnId: 'in-progress' }));
    assert.equal(harness.buildCount, 2, 'a topology change rebuilds the model');
  });
});

describe('WorkflowBoard graph builder call-site guard', () => {
  it('invokes the graph/canvas builders only from the graph render path', async () => {
    let source = await readFile(fileURLToPath(WORKFLOW_BOARD_SOURCE), 'utf8');
    // The only call sites for the expensive builders live in #ensureGraphModel, which is reached
    // solely through #renderGraph (guarded by #activeView === 'graph'). Guard against a regression
    // that calls a builder from the general #render / kanban path.
    for (let builder of ['buildWorkflowBoardGraphModel', 'buildWorkflowBoardCanvasGraphModel']) {
      let callCount = source.split(`${builder}(`).length - 1;
      assert.equal(callCount, 1, `${builder} should have exactly one call site`);
    }
    let ensureStart = source.indexOf('#ensureGraphModel(context) {');
    let ensureBody = source.slice(ensureStart, source.indexOf('\n  #renderGraph(context', ensureStart));
    assert.match(ensureBody, /buildWorkflowBoardGraphModel\(/);
    assert.match(ensureBody, /buildWorkflowBoardCanvasGraphModel\(/);
  });
});
