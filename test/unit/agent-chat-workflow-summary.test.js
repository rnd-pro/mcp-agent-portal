import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildGoalWorkflowBoardHash,
  fetchGoalWorkflowSummary,
  formatGoalWorkflowSummary,
  summarizeGoalWorkflowBoard,
} from '../../web/panels/AgentChat/workflow-summary.js';

test('chat workflow summary counts workflow cards linked by goal and chat refs only', () => {
  let board = {
    columns: [
      { id: 'in-progress', title: 'In Progress' },
      { id: 'quality-audit', title: 'Quality Audit' },
      { id: 'done', title: 'Done' },
    ],
    cards: [
      {
        id: 'card-1',
        title: 'Workflow card',
        columnId: 'in-progress',
        updatedAt: '2026-06-18T10:00:00.000Z',
        entityRefs: { goalId: 'goal-1', chatId: 'chat-1', taskIds: ['task-workflow'] },
        flags: ['blocked', 'needs_resume'],
      },
      {
        id: 'card-2',
        title: 'Goal card in another chat',
        columnId: 'quality-audit',
        entityRefs: { goalId: 'goal-1', chatId: 'chat-2' },
      },
      {
        id: 'chat-message-task',
        title: 'Raw chat task projection',
        columnId: 'in-progress',
        entityRefs: { taskIds: ['task-from-message'] },
      },
    ],
    messages: [{ role: 'user', text: 'not a workflow task' }],
    tasks: [{ id: 'task-from-message', status: 'running', chatId: 'chat-1' }],
    counters: { total: 99, active: 99 },
  };

  let summary = summarizeGoalWorkflowBoard(board, {
    projectId: 'agent-portal',
    goalId: 'goal-1',
    chatId: 'chat-1',
  });

  assert.equal(summary.cardCount, 1);
  assert.equal(summary.active, 1);
  assert.equal(summary.blocked, 1);
  assert.equal(summary.recovery, 1);
  assert.equal(summary.stageLabel, 'In Progress');
  assert.equal(
    formatGoalWorkflowSummary(summary),
    'In Progress | 1 card | 1 active | 1 blocked | 1 recovery',
  );
});

test('chat workflow board hash carries project, goal, and chat filters when known', () => {
  assert.equal(
    buildGoalWorkflowBoardHash({
      projectId: 'agent-portal',
      goalId: 'goal-1',
      chatId: 'chat-1',
    }),
    '#workflow-board?project=agent-portal&goal=goal-1&chat=chat-1',
  );
});

test('chat workflow summary fetch carries workflow ref filters to the board service', async () => {
  let requestedUrl = '';
  let summary = await fetchGoalWorkflowSummary({
    projectId: 'agent-portal',
    goalId: 'goal-1',
    chatId: 'chat-1',
  }, {
    fetchImpl: async (url) => {
      requestedUrl = url;
      return {
        ok: true,
        json: async () => ({
          projection: {
            board: {
              columns: [{ id: 'ready', title: 'Tasks / Ready' }],
              cards: [{
                id: 'card-1',
                title: 'Ready card',
                columnId: 'ready',
                entityRefs: { goalId: 'goal-1', chatId: 'chat-1' },
              }],
            },
          },
        }),
      };
    },
  });

  // fetchWorkflowBoard requests the compact face projection (cardView=face) for every board list read,
  // including the goal summary — the summary only needs card counts and the stage label, both of which
  // the face projection carries.
  assert.equal(
    requestedUrl,
    '/api/workflow-board?projectId=agent-portal&goalId=goal-1&chatId=chat-1&cardView=face',
  );
  assert.equal(summary.cardCount, 1);
  assert.equal(summary.stageLabel, 'Tasks / Ready');
});
