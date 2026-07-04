import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { DEFAULT_WORKFLOW_BOARD_ID } from '../../src/iso/workflow-board.js';
import { StateGraph } from '../../src/node/state-graph.js';
import { createWorkflowBoardService } from '../../src/node/workflow-board-service.js';
import { humanPrincipal } from '../../src/node/server/principal.js';
import {
  normalizeWorkflowBoardPayload,
  buildWorkflowBoardUrl,
} from '../../web/services/workflow-board.js';
import { deriveCardTicker } from '../../web/panels/WorkflowBoard/workflow-card-presentation.js';

describe('workflow board face projection (web list slimming)', () => {
  let tmpDir;
  let sg;
  let now;
  let service;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'workflow-face-projection-'));
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

  function seedBusyBoard(cardCount = 60) {
    let ops = [];
    let columns = ['ready', 'in-progress', 'quality-audit', 'commit-publish', 'done'];
    for (let index = 0; index < cardCount; index += 1) {
      let id = `card-${index}`;
      let columnId = columns[index % columns.length];
      ops.push({
        op: 'set',
        path: `workflowCards/${id}`,
        value: {
          schema: 'workflow-card/v2',
          id,
          boardId: DEFAULT_WORKFLOW_BOARD_ID,
          title: `Card ${index}`,
          body: `Heavy card body ${index} ${'x'.repeat(2400)}`,
          context: [`context blob ${'z'.repeat(1200)}`],
          columnId,
          projectId: 'project-face',
          domain: 'backend',
          owner: 'orchestrator',
          assignedAgent: 'backend-engineer',
          acceptanceCriteria: ['A criterion long enough to matter'.repeat(20)],
          priority: 'high',
          kind: 'work-item',
          entityRefs: { goalId: 'goal-face', chatId: 'chat-face', taskIds: [] },
          dependsOn: index > 0 ? [{ cardId: `card-${index - 1}`, mode: 'requires' }] : [],
          blockers: [],
          recoveryFlags: [],
          checks: {},
          lifecycle: columnId === 'in-progress' ? 'running' : 'idle',
          metadata: {
            index,
            fixture: 'face-projection',
            rootCardId: id,
            returns: [
              { kind: 'progress', detail: `old return ${index}`, raisedBy: 'agent', raisedAt: 3000 + index },
              { kind: 'progress', detail: `new return ${index}`, raisedBy: 'agent', raisedAt: 5000 + index },
            ],
          },
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
            status: runIndex === 2 ? 'completed' : 'completed',
            taskIds: [],
            startedAt: 3000 + index * 10 + runIndex,
            updatedAt: 4000 + index * 10 + runIndex,
            completedAt: 5000 + index * 10 + runIndex,
            tokens: 100 + index,
            leaseOwner: 'backend-engineer',
          },
        });
      }
      for (let evtIndex = 0; evtIndex < 4; evtIndex += 1) {
        ops.push({
          op: 'set',
          path: `workflowTransitions/event-${index}-${evtIndex}`,
          value: {
            schema: 'workflow-transition/v1',
            id: `event-${index}-${evtIndex}`,
            boardId: DEFAULT_WORKFLOW_BOARD_ID,
            cardId: id,
            eventType: 'transition',
            fromColumnId: 'ready',
            toColumnId: columnId,
            actor: 'test',
            status: 'accepted',
            reason: `transition ${index}-${evtIndex} ${'y'.repeat(600)}`,
            sideEffects: [{ type: 'fixture', index }],
            createdAt: 6000 + index * 10 + evtIndex,
          },
        });
      }
    }
    sg.commit(ops, 'test:seed-face-board');
  }

  function scope() {
    return { projectId: 'project-face', goalId: 'goal-face', chatId: 'chat-face' };
  }

  it('adds cardView=face to the web board url', () => {
    assert.equal(
      buildWorkflowBoardUrl({ projectId: 'agent-portal', cardView: 'face' }),
      '/api/workflow-board?projectId=agent-portal&cardView=face',
    );
  });

  it('truncates each list card to its face and drops the top-level cards array', () => {
    seedBusyBoard();
    let face = service.getBoardProjection({ ...scope(), includeCards: true, includeEvents: true, cardView: 'face' });

    assert.equal(face.schema, 'workflow-board-face-projection/v2');
    assert.deepEqual(face.cards, [], 'top-level cards array is dropped for the web list');
    let column = face.columns.find(c => c.id === 'in-progress');
    assert.ok(column.cards.length > 0, 'cards still ride under columns[].cards');
    for (let card of face.columns.flatMap(c => c.cards)) {
      assert.ok(card.runs.length <= 1, 'runs truncated to the latest');
      assert.ok(card.events.length <= 1, 'events truncated to the newest');
      assert.equal(card.body, undefined, 'body dropped');
      assert.equal(card.context, undefined, 'context dropped');
      assert.equal(card.acceptanceCriteria, undefined, 'acceptanceCriteria dropped');
      // metadata pruned to face keys only
      assert.equal(card.metadata.index, undefined, 'non-face metadata pruned');
      assert.equal(card.metadata.fixture, undefined, 'non-face metadata pruned');
      assert.equal(card.metadata.rootCardId, undefined, 'non-face metadata pruned');
      if (card.metadata.returns) {
        assert.equal(card.metadata.returns.length, 1, 'returns truncated to the newest entry');
        assert.equal(card.metadata.returns[0].detail.startsWith('new return'), true);
      }
      // face inputs preserved
      assert.equal(card.priority, 'high');
      assert.ok('dependsOn' in card);
      assert.ok('lifecycle' in card);
    }

    let faceBytes = JSON.stringify(face).length;
    let full = service.getBoardProjection({ ...scope(), includeCards: true, includeEvents: true });
    let fullBytes = JSON.stringify(full).length;
    assert.ok(faceBytes < fullBytes * 0.5, `face payload (${faceBytes}) far below full (${fullBytes})`);
    assert.equal(JSON.stringify(face).includes('Heavy card body'), false);
  });

  it('leaves the canonical (MCP/test) projection unchanged when cardView is not set', () => {
    seedBusyBoard();
    let full = service.getBoardProjection({ ...scope(), includeCards: true, includeEvents: true });
    assert.equal(full.schema, 'workflow-board-projection/v2');
    assert.ok(full.cards.length > 0, 'canonical projection still ships top-level cards');
    let sample = full.cards[0];
    assert.equal(typeof sample.body, 'string');
    assert.ok(sample.runs.length >= 1);
    assert.equal(JSON.stringify(full).includes('Heavy card body'), true);
  });

  it('returns the FULL card via getWorkflowCardDetail', () => {
    seedBusyBoard();
    let detail = service.getWorkflowCardDetail({ ...scope(), cardId: 'card-1' });
    assert.ok(detail.card, 'detail card resolved');
    assert.equal(detail.card.id, 'card-1');
    assert.equal(typeof detail.card.body, 'string');
    assert.ok(detail.card.body.includes('Heavy card body'));
    assert.equal(detail.card.runs.length, 3, 'full runs restored');
    assert.equal(detail.card.events.length, 4, 'full events restored');
    assert.equal(detail.card.metadata.fixture, 'face-projection', 'full metadata restored');

    let missing = service.getWorkflowCardDetail({ ...scope(), cardId: 'nope' });
    assert.equal(missing.card, null);
  });

  it('normalizes a face payload without double-counting and stamps a face render signature', () => {
    seedBusyBoard(6);
    let face = service.getBoardProjection({ ...scope(), includeCards: true, includeEvents: true, cardView: 'face' });
    let board = normalizeWorkflowBoardPayload({ projection: face }, { cardView: 'face' });

    // Six cards seeded, each appears exactly once (no columns+top-level double count).
    assert.equal(board.cards.length, 6);
    let ids = board.cards.map(c => c.id);
    assert.equal(new Set(ids).size, ids.length, 'no duplicate cards');

    for (let card of board.cards) {
      assert.equal(typeof card.raw.renderSignature, 'string');
      let sig = JSON.parse(card.raw.renderSignature);
      assert.equal(sig[0], card.id, 'signature carries the card id');
      // The signature must NOT embed heavy fields.
      assert.equal(card.raw.renderSignature.includes('Heavy card body'), false);
    }
  });

  it('deriveCardTicker produces the same ticker from a length-1 events array as from the full history', () => {
    seedBusyBoard(3);
    let full = service.getBoardProjection({ ...scope(), includeCards: true, includeEvents: true });
    let face = service.getBoardProjection({ ...scope(), includeCards: true, includeEvents: true, cardView: 'face' });

    let fullBoard = normalizeWorkflowBoardPayload({ projection: full }, {});
    let faceBoard = normalizeWorkflowBoardPayload({ projection: face }, { cardView: 'face' });

    for (let faceCard of faceBoard.cards) {
      let fullCard = fullBoard.cards.find(c => c.id === faceCard.id);
      let at = 10_000_000;
      assert.deepEqual(
        deriveCardTicker(faceCard, { now: at }),
        deriveCardTicker(fullCard, { now: at }),
        `ticker parity for ${faceCard.id}`,
      );
    }
  });
});
