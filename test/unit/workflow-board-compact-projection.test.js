import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { DEFAULT_WORKFLOW_BOARD_ID } from '../../src/iso/workflow-board.js';
import { StateGraph } from '../../src/node/state-graph.js';
import { createWorkflowBoardService } from '../../src/node/workflow-board-service.js';
import { humanPrincipal } from '../../src/node/server/principal.js';

describe('workflow board compact projection', () => {
  let tmpDir;
  let sg;
  let now;
  let service;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'workflow-compact-projection-'));
    sg = new StateGraph({
      snapshotPath: path.join(tmpDir, 'state.json'),
      walPath: path.join(tmpDir, 'state.wal'),
      chatsDir: path.join(tmpDir, 'chats'),
    });
    now = 1000;
    service = createWorkflowBoardService({
      stateGraph: sg,
      now: () => now++,
      makeId: prefix => `${prefix}-${now++}`,
      projectRoot: tmpDir,
      defaultPrincipal: humanPrincipal({ transport: { channel: 'loopback' }, label: 'local-human' }),
    });
    service.ensureBoard(DEFAULT_WORKFLOW_BOARD_ID);
  });

  afterEach(async () => {
    await sg.flushChatWrites();
    sg.flush();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function seedBusyBoard(cardCount = 80) {
    let ops = [];
    let columns = ['ready', 'in-progress', 'quality-audit', 'commit-publish', 'done'];
    for (let index = 0; index < cardCount; index += 1) {
      let id = `large-card-${index}`;
      let columnId = columns[index % columns.length];
      let blocked = index % 11 === 0;
      let recovery = index % 7 === 0;
      ops.push({
        op: 'set',
        path: `workflowCards/${id}`,
        value: {
          schema: 'workflow-card/v2',
          id,
          boardId: DEFAULT_WORKFLOW_BOARD_ID,
          title: `Large card ${index}`,
          body: `Heavy card body ${index} ${'x'.repeat(2400)}`,
          columnId,
          projectId: 'project-large',
          domain: 'backend',
          owner: 'orchestrator',
          assignedAgent: 'backend-engineer',
          acceptanceCriteria: ['Keep compact refreshes bounded'],
          entityRefs: { goalId: 'goal-large', chatId: 'chat-large', taskIds: [] },
          dependsOn: index > 0 ? [{ cardId: `large-card-${index - 1}`, mode: 'requires' }] : [],
          blockers: blocked ? ['dependency'] : [],
          recoveryFlags: recovery ? ['needs_audit'] : [],
          checks: {},
          lifecycle: blocked ? 'blocked' : (columnId === 'in-progress' ? 'running' : 'idle'),
          metadata: { index, fixture: 'compact-projection' },
          createdAt: 1000 + index,
          updatedAt: 2000 + index,
          updatedBy: 'test',
          version: 1,
        },
      });
      for (let runIndex = 0; runIndex < 3; runIndex += 1) {
        let runId = `run-${index}-${runIndex}`;
        ops.push({
          op: 'set',
          path: `workflowRuns/${runId}`,
          value: {
            schema: 'workflow-run/v1',
            id: runId,
            boardId: DEFAULT_WORKFLOW_BOARD_ID,
            cardId: id,
            status: runIndex === 2 && columnId === 'in-progress' ? 'running' : 'completed',
            taskIds: [],
            startedAt: 3000 + index * 10 + runIndex,
            updatedAt: 4000 + index * 10 + runIndex,
            completedAt: runIndex === 2 && columnId === 'in-progress' ? null : 5000 + index * 10 + runIndex,
            tokens: 100 + index,
          },
        });
      }
      if (columnId === 'in-progress') {
        ops.push({
          op: 'set',
          path: `workflowLeases/${id}`,
          value: {
            cardId: id,
            boardId: DEFAULT_WORKFLOW_BOARD_ID,
            leaseOwner: 'test',
            leaseExpiresAt: 9000 + index,
          },
        });
      }
      ops.push({
        op: 'set',
        path: `workflowTransitions/event-${index}`,
        value: {
          schema: 'workflow-transition/v1',
          id: `event-${index}`,
          boardId: DEFAULT_WORKFLOW_BOARD_ID,
          cardId: id,
          eventType: 'transition',
          fromColumnId: 'ready',
          toColumnId: columnId,
          actor: 'test',
          status: 'accepted',
          reason: `Large board transition ${index} ${'y'.repeat(800)}`,
          sideEffects: [{ type: 'fixture', index }],
          createdAt: 6000 + index,
        },
      });
    }
    sg.commit(ops, 'test:seed-large-board');
  }

  it('builds cardless status projections without per-card run/event projection work', async () => {
    seedBusyBoard();
    let fullProjection = service.getBoardProjection({
      projectId: 'project-large',
      goalId: 'goal-large',
      chatId: 'chat-large',
      includeCards: true,
      includeEvents: true,
      eventLimit: 80,
    });
    let fullBytes = JSON.stringify(fullProjection).length;
    let getCounts = new Map();
    let originalGet = sg.get;
    sg.get = function countedGet(key) {
      getCounts.set(key, (getCounts.get(key) || 0) + 1);
      return originalGet.call(this, key);
    };
    let compact;
    try {
      compact = await service.getBoardProjectionWithRuntime({
        projectId: 'project-large',
        goalId: 'goal-large',
        chatId: 'chat-large',
        view: 'status',
        compact: true,
        includeCards: false,
        includeEvents: false,
        includeRuntime: true,
        eventLimit: 1,
      });
    } finally {
      sg.get = originalGet;
    }

    assert.equal(compact.schema, 'workflow-board-compact-projection/v1');
    assert.deepEqual(compact.cards, []);
    assert.deepEqual(compact.events, []);
    assert.equal(compact.counts['in-progress'], 16);
    assert.equal(compact.columns.find(column => column.id === 'in-progress').count, 16);
    assert.equal(compact.columns.find(column => column.id === 'quality-audit').recoveryCount, 3);
    assert.equal(compact.load.activeRunCount, 16);
    assert.equal(compact.load.activeLeaseCount, 16);
    assert.equal(compact.load.blockedCardCount, 8);
    assert.ok(compact.activity.latestEventAt >= 4000);
    assert.equal(getCounts.get('workflowRuns'), 1, 'runs are read once for summary, not once per card');
    assert.equal(getCounts.get('workflowTransitions'), undefined, 'includeEvents=false skips event collection reads');
    assert.ok(JSON.stringify(compact).length < fullBytes * 0.05, 'cardless status payload stays far below full projection size');
    assert.equal(JSON.stringify(compact).includes('Heavy card body'), false);
  });
});
