import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  INSPECTOR_HISTORY_LIMIT,
  INSPECTOR_RUN_LIMIT,
  createInspectorHistoryModel,
  createInspectorRunsModel,
} from '../../web/panels/WorkflowBoard/workflow-card-inspector-model.js';

function iso(minute) {
  return `2026-07-03T12:${String(minute).padStart(2, '0')}:00.000Z`;
}

describe('workflow card inspector model helpers', () => {
  it('keeps run rows bounded and signatures stable for hidden old-run edits', () => {
    let card = {
      runs: Array.from({ length: 30 }, (_, index) => ({
        id: `run-${index}`,
        leaseOwner: `agent-${index}`,
        status: index === 29 ? 'running' : 'completed',
        startedAt: iso(index),
        updatedAt: iso(index),
        completedAt: index === 29 ? '' : iso(index),
        tokens: index,
        chatId: `chat-${index}`,
      })),
    };

    let model = createInspectorRunsModel(card);
    assert.equal(model.totalCount, 30);
    assert.equal(model.runs.length, INSPECTOR_RUN_LIMIT);
    assert.deepEqual(model.runs.map(run => run.id), [
      'run-22', 'run-23', 'run-24', 'run-25', 'run-26', 'run-27', 'run-28', 'run-29',
    ]);

    let hiddenChanged = {
      runs: card.runs.map(run => run.id === 'run-0' ? { ...run, status: 'failed', tokens: 999 } : run),
    };
    assert.equal(createInspectorRunsModel(hiddenChanged).signature, model.signature);

    let visibleChanged = {
      runs: card.runs.map(run => run.id === 'run-29' ? { ...run, status: 'completed' } : run),
    };
    assert.notEqual(createInspectorRunsModel(visibleChanged).signature, model.signature);
  });

  it('keeps history rows bounded and signatures stable for hidden old-event edits', () => {
    let card = {
      events: Array.from({ length: 40 }, (_, index) => ({
        id: `event-${index}`,
        label: `Event ${index}`,
        eventType: 'transition',
        status: index === 39 ? 'accepted' : 'completed',
        actor: `actor-${index}`,
        timestamp: iso(index),
        note: `note-${index}`,
        fromColumnId: 'ready',
        toColumnId: 'done',
      })),
    };

    let model = createInspectorHistoryModel(card);
    assert.equal(model.totalCount, 40);
    assert.equal(model.events.length, INSPECTOR_HISTORY_LIMIT);
    assert.deepEqual(model.events.map(event => event.id), [
      'event-39', 'event-38', 'event-37', 'event-36', 'event-35', 'event-34', 'event-33', 'event-32',
    ]);

    let hiddenChanged = {
      events: card.events.map(event => event.id === 'event-0' ? { ...event, note: 'hidden edit' } : event),
    };
    assert.equal(createInspectorHistoryModel(hiddenChanged).signature, model.signature);

    let visibleChanged = {
      events: card.events.map(event => event.id === 'event-39' ? { ...event, status: 'blocked' } : event),
    };
    assert.notEqual(createInspectorHistoryModel(visibleChanged).signature, model.signature);
  });

  it('sorts only bounded inspector rows after scanning large inputs', () => {
    let originalSort = Array.prototype.sort;
    let sortedLengths = [];
    Array.prototype.sort = function trackedSort(...args) {
      sortedLengths.push(this.length);
      return originalSort.apply(this, args);
    };
    try {
      createInspectorRunsModel({
        runs: Array.from({ length: 100 }, (_, index) => ({ id: `run-${index}`, startedAt: iso(index % 60), updatedAt: iso(index % 60) })),
      });
      createInspectorHistoryModel({
        events: Array.from({ length: 100 }, (_, index) => ({ id: `event-${index}`, timestamp: iso(index % 60) })),
      });
    } finally {
      Array.prototype.sort = originalSort;
    }
    assert.ok(sortedLengths.length > 0);
    assert.ok(sortedLengths.every(length => length <= INSPECTOR_RUN_LIMIT));
  });
});
