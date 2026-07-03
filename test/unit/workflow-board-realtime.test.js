import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { decideWorkflowBoardRealtimeRefresh } from '../../web/panels/WorkflowBoard/workflow-board-realtime.js';

function board() {
  return {
    id: 'agent-workflow-default',
    boardId: 'agent-workflow-default',
    projectId: 'agent-portal',
    cards: [
      { id: 'visible-card', projectId: 'agent-portal', entityRefs: { goalId: 'goal-1', chatId: 'chat-1' } },
      { id: 'other-chat-card', projectId: 'agent-portal', entityRefs: { goalId: 'goal-1', chatId: 'chat-2' } },
    ],
  };
}

let scope = {
  scope: 'project',
  projectId: 'agent-portal',
  goalId: 'goal-1',
  chatId: 'chat-1',
};

describe('workflow board realtime refresh decisions', () => {
  it('skips unrelated task patches instead of forcing a full board reload', () => {
    assert.equal(
      decideWorkflowBoardRealtimeRefresh({
        key: 'tasks',
        value: {
          unrelated: {
            id: 'unrelated',
            kind: 'workflow-runtime-task',
            projectId: 'other-project',
            workflowBoardId: 'agent-workflow-default',
            workflowCardId: 'visible-card',
          },
        },
        board: board(),
        scope,
      }),
      'skip',
    );
  });

  it('uses a status refresh for visible-card runtime task progress', () => {
    assert.equal(
      decideWorkflowBoardRealtimeRefresh({
        key: 'tasks',
        value: {
          task1: {
            id: 'task1',
            kind: 'workflow-runtime-task',
            projectId: 'agent-portal',
            workflowBoardId: 'agent-workflow-default',
            workflowCardId: 'visible-card',
            status: 'running',
          },
        },
        board: board(),
        scope,
      }),
      'status',
    );
  });

  it('uses a full reload when a runtime task introduces a board-visible orphan card', () => {
    assert.equal(
      decideWorkflowBoardRealtimeRefresh({
        key: 'tasks',
        value: {
          task1: {
            id: 'task1',
            kind: 'workflow-runtime-task',
            projectId: 'agent-portal',
            workflowBoardId: 'agent-workflow-default',
            workflowCardId: 'new-runtime-card',
            status: 'running',
          },
        },
        board: board(),
        scope,
      }),
      'full',
    );
  });

  it('full-reloads board collections only when the current board scope is affected', () => {
    assert.equal(
      decideWorkflowBoardRealtimeRefresh({
        key: 'workflowRuns',
        value: { run1: { id: 'run1', boardId: 'other-board', cardId: 'visible-card' } },
        board: board(),
        scope,
      }),
      'skip',
    );
    assert.equal(
      decideWorkflowBoardRealtimeRefresh({
        key: 'workflowRuns',
        value: { run1: { id: 'run1', boardId: 'agent-workflow-default', cardId: 'visible-card' } },
        board: board(),
        scope,
      }),
      'full',
    );
  });

  it('full-reloads when a visible card disappears from the workflowCards collection', () => {
    assert.equal(
      decideWorkflowBoardRealtimeRefresh({
        key: 'workflowCards',
        value: {
          'other-chat-card': {
            id: 'other-chat-card',
            projectId: 'agent-portal',
            entityRefs: { goalId: 'goal-1', chatId: 'chat-2' },
          },
        },
        board: board(),
        scope,
      }),
      'full',
    );
  });
});
