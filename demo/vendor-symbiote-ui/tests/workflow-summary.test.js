import test from 'node:test';
import assert from 'node:assert/strict';

import {
  summarizeGoalWorkflowBoard,
  formatGoalWorkflowSummary,
} from '../chat/workflow-summary.js';

const SAMPLE_BOARD = {
  columns: [
    { id: 'ready', title: 'Ready' },
    { id: 'in-progress', title: 'In Progress' },
    { id: 'quality-audit', title: 'Quality Audit' },
    { id: 'done', title: 'Done' },
  ],
  cards: [
    {
      id: 'c1',
      columnId: 'in-progress',
      entityRefs: { goalId: 'g1', chatId: 'chat1' },
      updatedAt: '2026-06-01T10:00:00Z',
      flags: [],
    },
    {
      id: 'c2',
      columnId: 'quality-audit',
      entityRefs: { goalId: 'g1', chatId: 'chat1' },
      updatedAt: '2026-06-02T10:00:00Z',
      flags: ['stale'],
    },
    {
      id: 'c3',
      columnId: 'ready',
      entityRefs: { goalId: 'g1', chatId: 'chat1' },
      updatedAt: '2026-06-01T09:00:00Z',
      blocker: 'waiting on review',
    },
    {
      id: 'c4',
      columnId: 'done',
      entityRefs: { goalId: 'g1', chatId: 'chat1' },
      updatedAt: '2026-05-30T10:00:00Z',
    },
    {
      id: 'other',
      columnId: 'in-progress',
      entityRefs: { goalId: 'g2', chatId: 'chat2' },
      updatedAt: '2026-06-05T10:00:00Z',
    },
  ],
};

test('summarizeGoalWorkflowBoard scopes to goal and counts states', () => {
  let summary = summarizeGoalWorkflowBoard(SAMPLE_BOARD, { goalId: 'g1' });
  assert.equal(summary.goalId, 'g1');
  assert.equal(summary.cardCount, 4);
  // ready + in-progress + quality-audit are active (done is not)
  assert.equal(summary.active, 3);
  assert.equal(summary.blocked, 1);
  assert.equal(summary.recovery, 1);
  assert.equal(summary.done, 1);
  // latest non-done card is c2 (2026-06-02) in quality-audit
  assert.equal(summary.stageColumnId, 'quality-audit');
  assert.equal(summary.stageLabel, 'Quality Audit');
  // the g2/chat2 card is excluded
  assert.ok(summary.cards.every((card) => card.id !== 'other'));
});

test('summarizeGoalWorkflowBoard accepts snake_case filters and chat scope', () => {
  let summary = summarizeGoalWorkflowBoard(SAMPLE_BOARD, {
    goal_id: 'g2',
    chat_id: 'chat2',
    project_id: 'p9',
  });
  assert.equal(summary.cardCount, 1);
  assert.equal(summary.chatId, 'chat2');
  assert.equal(summary.projectId, 'p9');
  assert.equal(summary.stageColumnId, 'in-progress');
  assert.equal(summary.stageLabel, 'In Progress');
});

test('summarizeGoalWorkflowBoard returns no cards without goal/chat filter', () => {
  let summary = summarizeGoalWorkflowBoard(SAMPLE_BOARD, {});
  assert.equal(summary.cardCount, 0);
  assert.equal(summary.active, 0);
  assert.equal(summary.stageLabel, '');
});

test('summarizeGoalWorkflowBoard tolerates empty/missing input', () => {
  let summary = summarizeGoalWorkflowBoard(undefined, undefined);
  assert.equal(summary.cardCount, 0);
  assert.deepEqual(summary.cards, []);
  assert.equal(summary.stageColumnId, '');
});

test('summarizeGoalWorkflowBoard falls back to columnId when column missing', () => {
  let summary = summarizeGoalWorkflowBoard(
    {
      columns: [],
      cards: [{ id: 'x', columnId: 'in-progress', entityRefs: { goalId: 'g1' } }],
    },
    { goalId: 'g1' }
  );
  assert.equal(summary.stageLabel, 'in-progress');
});

test('formatGoalWorkflowSummary builds a status line with defaults', () => {
  let summary = summarizeGoalWorkflowBoard(SAMPLE_BOARD, { goalId: 'g1' });
  let line = formatGoalWorkflowSummary(summary);
  assert.equal(line, 'Quality Audit | 4 cards | 3 active | 1 blocked | 1 recovery');
});

test('formatGoalWorkflowSummary uses singular label and custom labels', () => {
  let summary = summarizeGoalWorkflowBoard(
    {
      columns: [{ id: 'ready', title: 'Ready' }],
      cards: [{ id: 'a', columnId: 'ready', entityRefs: { goalId: 'g1' } }],
    },
    { goalId: 'g1' }
  );
  let line = formatGoalWorkflowSummary(summary, {
    cardSingular: 'карточка',
    active: 'активна',
  });
  assert.equal(line, 'Ready | 1 карточка | 1 активна');
});

test('formatGoalWorkflowSummary marks all-done goals', () => {
  let summary = summarizeGoalWorkflowBoard(
    {
      columns: [{ id: 'done', title: 'Done' }],
      cards: [
        { id: 'd1', columnId: 'done', entityRefs: { goalId: 'g1' } },
        { id: 'd2', columnId: 'done', entityRefs: { goalId: 'g1' } },
      ],
    },
    { goalId: 'g1' }
  );
  let line = formatGoalWorkflowSummary(summary);
  assert.equal(line, 'Done | 2 cards | done');
});

test('formatGoalWorkflowSummary returns empty string with no cards', () => {
  assert.equal(formatGoalWorkflowSummary({ cardCount: 0 }), '');
  assert.equal(formatGoalWorkflowSummary({}), '');
  assert.equal(formatGoalWorkflowSummary(), '');
});
