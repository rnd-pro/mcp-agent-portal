import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildWorkflowBoardProjectionFromContext,
  createWorkflowBoardRenderContext,
  workflowBoardGraphTopologySignature,
  workflowBoardRenderScopeKey,
} from '../../web/panels/WorkflowBoard/workflow-board-render-context.js';

function buildBoard() {
  let alpha = {
    id: 'alpha',
    title: 'Alpha',
    columnId: 'ready',
    entityRefs: { goalId: 'goal-a', chatId: 'chat-a' },
    raw: { lifecycle: 'queued', queue: { position: 1 } },
  };
  let beta = {
    id: 'beta',
    title: 'Beta',
    columnId: 'ready',
    entityRefs: { goalId: 'goal-a', chatId: 'chat-a' },
    dependsOn: [{ cardId: 'alpha' }],
  };
  let hiddenGoal = {
    id: 'hidden-goal',
    title: 'Hidden goal',
    columnId: 'ready',
    entityRefs: { goalId: 'goal-b', chatId: 'chat-a' },
    dependsOn: [{ cardId: 'alpha' }],
  };
  let hiddenChat = {
    id: 'hidden-chat',
    title: 'Hidden chat',
    columnId: 'done',
    entityRefs: { goalId: 'goal-a', chatId: 'chat-b' },
  };
  return {
    id: 'board-1',
    version: 7,
    transitions: [{ from: 'ready', to: 'done', gate: 'audit_pass_or_explicit_waiver' }],
    columns: [
      { id: 'ready', title: 'Ready', cards: [alpha, beta, hiddenGoal] },
      { id: 'done', title: 'Done', cards: [hiddenChat] },
    ],
    cards: [alpha, beta, hiddenGoal, hiddenChat],
  };
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

describe('workflow board render context', () => {
  it('builds one filtered snapshot with visible cards, indexes, columns, and downstream counts', () => {
    let context = createWorkflowBoardRenderContext(buildBoard(), {
      scope: 'project',
      projectId: 'agent-portal',
      goalId: 'goal-a',
      chatId: 'chat-a',
    });

    assert.deepEqual(context.visibleCards.map(card => card.id), ['alpha', 'beta']);
    assert.deepEqual(context.columns.map(column => [column.id, column.cards.map(card => card.id)]), [
      ['ready', ['alpha', 'beta']],
      ['done', []],
    ]);
    assert.equal(context.cardsById.get('hidden-goal').title, 'Hidden goal');
    assert.equal(context.visibleCardById.has('hidden-goal'), false);
    assert.equal(context.columnById.get('ready').title, 'Ready');
    assert.equal(context.downstreamDependencyCounts.get('alpha'), 1);
    assert.equal(context.downstreamDependencyCounts.has('hidden-goal'), false);
  });

  it('projects the same filtered snapshot into the graph adapter shape', () => {
    let context = createWorkflowBoardRenderContext(buildBoard(), { goalId: 'goal-a', chatId: 'chat-a' });
    let projection = buildWorkflowBoardProjectionFromContext(context);

    assert.equal(projection.schema, 'workflow-board-projection/v2');
    assert.equal(projection.version, 7);
    assert.deepEqual(projection.cards.map(card => card.id), ['alpha', 'beta']);
    assert.deepEqual(projection.columns.map(column => [column.id, column.cards.map(card => card.id)]), [
      ['ready', ['alpha', 'beta']],
      ['done', []],
    ]);
    assert.equal(projection.cards.find(card => card.id === 'alpha').lifecycle, 'queued');
    assert.deepEqual(projection.cards.find(card => card.id === 'alpha').queue, { position: 1 });
    assert.deepEqual(projection.board.transitions, [
      { from: 'ready', to: 'done', gate: 'audit_pass_or_explicit_waiver' },
    ]);
  });

  it('uses all scope fields in the render-context cache key', () => {
    assert.notEqual(
      workflowBoardRenderScopeKey({ scope: 'project', projectId: 'a', goalId: 'g1', chatId: 'c1' }),
      workflowBoardRenderScopeKey({ scope: 'project', projectId: 'a', goalId: 'g2', chatId: 'c1' }),
    );
    assert.equal(
      workflowBoardRenderScopeKey({ scope: 'project', projectId: 'a', goalId: 'g1', chatId: 'c1' }),
      workflowBoardRenderScopeKey({ scope: 'project', projectId: 'a', goalId: 'g1', chatId: 'c1' }),
    );
  });

  it('keeps graph topology signatures stable for status-only card refreshes', () => {
    let board = buildBoard();
    let changed = clone(board);
    changed.cards[0] = {
      ...changed.cards[0],
      status: 'running',
      updatedAt: 123,
      ticker: { label: 'Running tests', kind: 'state' },
      raw: {
        ...changed.cards[0].raw,
        status: 'running',
        latestEvent: { id: 'event-1' },
      },
    };
    changed.columns[0].cards[0] = changed.cards[0];

    let scope = { goalId: 'goal-a', chatId: 'chat-a' };
    assert.equal(
      workflowBoardGraphTopologySignature(createWorkflowBoardRenderContext(board, scope)),
      workflowBoardGraphTopologySignature(createWorkflowBoardRenderContext(changed, scope)),
    );
  });

  it('invalidates graph topology signatures for dependency and board-topology changes', () => {
    let base = createWorkflowBoardRenderContext(buildBoard(), { goalId: 'goal-a', chatId: 'chat-a' });
    let baseSignature = workflowBoardGraphTopologySignature(base);

    let dependencyChanged = clone(buildBoard());
    dependencyChanged.cards[1].dependsOn = [{ cardId: 'alpha', releaseWhen: 'audit_passed' }];
    dependencyChanged.columns[0].cards[1] = dependencyChanged.cards[1];
    assert.notEqual(
      workflowBoardGraphTopologySignature(createWorkflowBoardRenderContext(dependencyChanged, { goalId: 'goal-a', chatId: 'chat-a' })),
      baseSignature,
    );

    let columnChanged = clone(buildBoard());
    columnChanged.cards[1].columnId = 'done';
    columnChanged.columns[0].cards = [columnChanged.cards[0]];
    columnChanged.columns[1].cards = [columnChanged.cards[1]];
    assert.notEqual(
      workflowBoardGraphTopologySignature(createWorkflowBoardRenderContext(columnChanged, { goalId: 'goal-a', chatId: 'chat-a' })),
      baseSignature,
    );

    let transitionChanged = clone(buildBoard());
    transitionChanged.transitions = [{ from: 'done', to: 'ready', gate: 'rework_authorized' }];
    assert.notEqual(
      workflowBoardGraphTopologySignature(createWorkflowBoardRenderContext(transitionChanged, { goalId: 'goal-a', chatId: 'chat-a' })),
      baseSignature,
    );
  });
});
