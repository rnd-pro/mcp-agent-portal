import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildCardStageEvent,
  diffBoardTransitions,
  eventTypeForColumn,
  indexBoardCards,
  knownColumnIds,
  severityForEventType,
  stageForColumn,
} from '../../web/services/board-notification-source.js';

function board(cards, columns) {
  return {
    boardId: 'agent-workflow-default',
    cards,
    columns: columns || [
      { id: 'ideas', title: 'Ideas / Inbox' },
      { id: 'backlog', title: 'Backlog' },
      { id: 'ready', title: 'Tasks' },
      { id: 'in-progress', title: 'In Progress' },
      { id: 'quality-audit', title: 'Quality Audit' },
      { id: 'commit-publish', title: 'Commit / Publish' },
      { id: 'done', title: 'Done' },
      { id: 'rejected', title: 'Rejected' },
      { id: 'needs-decision', title: 'Needs Decision' },
    ],
  };
}

describe('board notification source — column mapping', () => {
  it('maps columns onto muteable board stages', () => {
    assert.equal(stageForColumn('ideas'), 'intake');
    assert.equal(stageForColumn('backlog'), 'decompose');
    assert.equal(stageForColumn('ready'), 'orchestrate');
    assert.equal(stageForColumn('in-progress'), 'execute');
    assert.equal(stageForColumn('quality-audit'), 'audit');
    assert.equal(stageForColumn('commit-publish'), 'audit');
    assert.equal(stageForColumn('done'), 'terminal');
    assert.equal(stageForColumn('rejected'), 'terminal');
  });

  it('falls back to orchestrate for unknown columns', () => {
    assert.equal(stageForColumn('mystery-column'), 'orchestrate');
    assert.equal(stageForColumn(''), 'orchestrate');
  });

  it('maps columns onto narration event types', () => {
    assert.equal(eventTypeForColumn('ideas'), 'task.created');
    assert.equal(eventTypeForColumn('in-progress'), 'task.started');
    assert.equal(eventTypeForColumn('done'), 'task.completed');
    assert.equal(eventTypeForColumn('rejected'), 'task.failed');
    assert.equal(eventTypeForColumn('needs-decision'), 'approval.required');
    assert.equal(eventTypeForColumn('ready'), 'task.moved');
    assert.equal(eventTypeForColumn('unknown'), 'task.moved');
  });

  it('maps event types onto notification-queue severities', () => {
    assert.equal(severityForEventType('task.completed'), 'success');
    assert.equal(severityForEventType('task.failed'), 'error');
    assert.equal(severityForEventType('approval.required'), 'warning');
    assert.equal(severityForEventType('task.started'), 'info');
  });

  it('exposes the known column ids', () => {
    assert.ok(knownColumnIds().includes('in-progress'));
    assert.ok(knownColumnIds().includes('done'));
  });
});

describe('board notification source — event composition', () => {
  it('builds a card stage event with title + localized stage label params', () => {
    let b = board([{ id: 'c1', title: 'Fix login', columnId: 'in-progress' }]);
    let event = buildCardStageEvent(b, b.cards[0], 'in-progress');
    assert.equal(event.type, 'task.started');
    assert.equal(event.stage, 'execute');
    assert.equal(event.cardId, 'c1');
    assert.equal(event.message, 'Fix login');
    assert.deepEqual(event.params, { title: 'Fix login', stage: 'In Progress' });
  });

  it('derives the stage label from the board column title', () => {
    let b = board([{ id: 'c1', title: 'Ship it', columnId: 'commit-publish' }]);
    let event = buildCardStageEvent(b, b.cards[0], 'commit-publish');
    assert.equal(event.params.stage, 'Commit / Publish');
  });

  it('produces a stable id per (card, column) so resting positions dedup', () => {
    let b = board([{ id: 'c1', title: 'A', columnId: 'ready' }]);
    let first = buildCardStageEvent(b, b.cards[0], 'ready');
    let second = buildCardStageEvent(b, b.cards[0], 'ready');
    assert.equal(first.id, second.id);
  });

  it('builds index keyed by card id', () => {
    let index = indexBoardCards(board([{ id: 'c1', title: 'A', columnId: 'ready', version: 3 }]));
    assert.equal(index.get('c1').columnId, 'ready');
    assert.equal(index.get('c1').version, 3);
  });
});

describe('board notification source — transition diff', () => {
  it('emits nothing on the first observation (no previous snapshot)', () => {
    let current = board([{ id: 'c1', title: 'A', columnId: 'in-progress' }]);
    assert.deepEqual(diffBoardTransitions(null, current), []);
  });

  it('emits a transition event when a card changes column', () => {
    let prev = board([{ id: 'c1', title: 'Fix login', columnId: 'ready' }]);
    let curr = board([{ id: 'c1', title: 'Fix login', columnId: 'in-progress' }]);
    let events = diffBoardTransitions(prev, curr);
    assert.equal(events.length, 1);
    assert.equal(events[0].type, 'task.started');
    assert.equal(events[0].columnId, 'in-progress');
    assert.equal(events[0].params.title, 'Fix login');
  });

  it('does not emit for cards resting in the same column across loads', () => {
    let prev = board([{ id: 'c1', title: 'A', columnId: 'ready' }]);
    let curr = board([{ id: 'c1', title: 'A', columnId: 'ready' }]);
    assert.deepEqual(diffBoardTransitions(prev, curr), []);
  });

  it('emits a created event for a brand new card', () => {
    let prev = board([]);
    let curr = board([{ id: 'c2', title: 'New idea', columnId: 'ideas' }]);
    let events = diffBoardTransitions(prev, curr);
    assert.equal(events.length, 1);
    assert.equal(events[0].cardId, 'c2');
    assert.equal(events[0].type, 'task.created');
  });

  it('emits a completed event when a card reaches done', () => {
    let prev = board([{ id: 'c1', title: 'A', columnId: 'commit-publish' }]);
    let curr = board([{ id: 'c1', title: 'A', columnId: 'done' }]);
    let events = diffBoardTransitions(prev, curr);
    assert.equal(events.length, 1);
    assert.equal(events[0].type, 'task.completed');
    assert.equal(events[0].severity, 'success');
  });

  it('handles multiple simultaneous transitions in one diff', () => {
    let prev = board([
      { id: 'c1', title: 'A', columnId: 'ready' },
      { id: 'c2', title: 'B', columnId: 'in-progress' },
    ]);
    let curr = board([
      { id: 'c1', title: 'A', columnId: 'in-progress' },
      { id: 'c2', title: 'B', columnId: 'quality-audit' },
    ]);
    let events = diffBoardTransitions(prev, curr);
    assert.equal(events.length, 2);
    let byCard = Object.fromEntries(events.map((e) => [e.cardId, e]));
    assert.equal(byCard.c1.columnId, 'in-progress');
    assert.equal(byCard.c2.columnId, 'quality-audit');
  });
});
