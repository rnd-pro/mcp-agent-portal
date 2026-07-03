import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildWorkflowBoardProjectionFromContext,
  createWorkflowBoardRenderContext,
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
});
