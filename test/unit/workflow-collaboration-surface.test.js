import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  DEFAULT_WORKFLOW_BOARD_ID,
  isWakeDrivingReturn,
  normalizeWorkflowComment,
  appendCardComment,
} from '../../src/iso/workflow-board.js';
import { StateGraph } from '../../src/node/state-graph.js';
import { createWorkflowBoardService } from '../../src/node/workflow-board-service.js';
import { humanPrincipal } from '../../src/node/server/principal.js';

// Axis C — human-agent collaboration surface. Three capabilities, none of which existed before:
//   1. an auditable per-card comment/note stream (cache + one durable board event per post);
//   2. a human reply that feeds the return inbox so a `needs_decision` is closed by a person, not only
//      by another agent run (the inbox was previously an agent→orchestrator-only channel);
//   3. a notification emitted when a card is escalated to a human (`humanEscalated` previously only
//      moved the card into the decision lane with no watchable signal).
describe('workflow collaboration surface (Axis C)', () => {
  let tmpDir;
  let sg;
  let now;
  let idSeq;
  let service;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'workflow-collab-'));
    sg = new StateGraph({
      snapshotPath: path.join(tmpDir, 'state.json'),
      walPath: path.join(tmpDir, 'state.wal'),
      chatsDir: path.join(tmpDir, 'chats'),
    });
    now = 1000;
    idSeq = 0;
    service = createWorkflowBoardService({
      stateGraph: sg,
      now: () => now++,
      makeId: (prefix) => `${prefix}-${++idSeq}`,
      projectRoot: tmpDir,
      defaultPrincipal: humanPrincipal({ transport: { channel: 'loopback' }, label: 'local-human' }),
    });
  });

  afterEach(async () => {
    await sg.flushChatWrites();
    sg.flush();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function makeCard(id, overrides = {}) {
    let created = service.createOrUpdateCard({
      id,
      title: overrides.title ?? `Card ${id}`,
      body: 'Durable body.',
      columnId: overrides.columnId ?? 'backlog',
      owner: overrides.owner ?? 'alice',
      metadata: overrides.metadata,
    });
    assert.equal(created.ok, true, `card ${id} created`);
    return service.getCard(id);
  }

  // ── iso pure helpers ────────────────────────────────────────────────────────────────────────
  it('normalizeWorkflowComment drops empty notes but keeps a body or a chosen option', () => {
    assert.equal(normalizeWorkflowComment({ body: '   ' }), null);
    assert.equal(normalizeWorkflowComment({}), null);
    let comment = normalizeWorkflowComment(
      { body: 'looks good', kind: 'note' },
      { now: 42, id: 'comment-x', author: 'bob', authorRole: 'human' },
    );
    assert.equal(comment.body, 'looks good');
    assert.equal(comment.kind, 'note');
    assert.equal(comment.author, 'bob');
    assert.equal(comment.authorRole, 'human');
    assert.equal(comment.at, 42);
    // An unknown kind folds back to the default; an option-only comment is still recorded.
    assert.equal(normalizeWorkflowComment({ kind: 'bogus', body: 'x' }).kind, 'comment');
    assert.equal(normalizeWorkflowComment({ optionId: 'retry' }).optionId, 'retry');
  });

  it('appendCardComment is a bounded, append-only tail window', () => {
    let list = [];
    for (let i = 0; i < 60; i++) list = appendCardComment(list, { id: `c${i}`, body: `n${i}` });
    assert.equal(list.length, 50);
    assert.equal(list[0].id, 'c10');
    assert.equal(list.at(-1).id, 'c59');
    // A null comment is a no-op that still bounds the window.
    assert.equal(appendCardComment(list, null).length, 50);
  });

  // ── 1. auditable per-card comment/note stream ─────────────────────────────────────────────────
  it('records an auditable comment to both the card cache and the durable event log', () => {
    makeCard('card-1');
    let result = service.addCardComment({ cardId: 'card-1', body: 'Please double-check the migration.' });
    assert.equal(result.ok, true);
    assert.equal(result.comment.author, 'local-human');
    assert.equal(result.comment.authorRole, 'human');

    let listed = service.listCardComments({ cardId: 'card-1' });
    assert.equal(listed.comments.length, 1);
    assert.equal(listed.comments[0].body, 'Please double-check the migration.');

    let events = service.listWorkflowEvents({ cardId: 'card-1', eventTypes: ['comment'] });
    assert.equal(events.events.length, 1);
    let side = events.events[0].sideEffects.find(item => item.type === 'comment');
    assert.equal(side.author, 'local-human');
    assert.equal(side.body, 'Please double-check the migration.');
  });

  it('rejects an empty comment and an unknown card', () => {
    makeCard('card-2');
    assert.equal(service.addCardComment({ cardId: 'card-2', body: '   ' }).error, 'empty_comment');
    assert.equal(service.addCardComment({ cardId: 'missing', body: 'hi' }).error, 'card_not_found');
  });

  // ── 2. a human reply feeds the return-inbox so needs_decision is closed by a person ───────────
  it('a human reply on a needs_decision card feeds the return inbox and closes the episode', () => {
    makeCard('card-3', {
      columnId: 'ready',
      metadata: { escalation: { kind: 'needs_decision', detail: 'Which provider?' } },
    });
    let result = service.replyToCard({ cardId: 'card-3', body: 'Use provider A.' });
    assert.equal(result.ok, true);
    assert.equal(result.resolved, true);

    let card = service.getCard('card-3');
    // The reply is an auditable comment of kind `reply`.
    assert.equal(card.metadata.comments.at(-1).kind, 'reply');
    // It fed the return inbox attributed to the HUMAN, and the return is wake-driving.
    let inbox = card.metadata.returns;
    assert.equal(Array.isArray(inbox) && inbox.length, 1);
    assert.equal(inbox[0].raisedBy, 'local-human');
    assert.equal(isWakeDrivingReturn(inbox[0]), true);
    assert.equal(inbox[0].payload.answer, 'Use provider A.');
    // The person closed the decision: the live escalation episode is cleared.
    assert.equal(card.metadata.escalation, undefined);
    assert.equal(card.metadata.humanAnswer.by, 'local-human');
  });

  it('a non-resolving reply still wakes the loop without clearing the escalation', () => {
    makeCard('card-4', {
      columnId: 'ready',
      metadata: { escalation: { kind: 'needs_decision', detail: 'Which provider?' } },
    });
    let result = service.replyToCard({ cardId: 'card-4', body: 'Need more time.', resolve: false });
    assert.equal(result.resolved, false);
    let card = service.getCard('card-4');
    assert.equal(isWakeDrivingReturn(card.metadata.returns[0]), true);
    // Not resolved → the escalation episode survives for the orchestrator to act on.
    assert.ok(card.metadata.escalation);
  });

  // ── 3. notification on humanEscalated ─────────────────────────────────────────────────────────
  it('emits a human_escalated notification when a needs_human card is parked', async () => {
    makeCard('card-5', {
      columnId: 'ready',
      owner: 'carol',
      metadata: {
        watchers: ['dave'],
        escalation: { kind: 'needs_human', detail: 'Approve the risky migration?' },
      },
    });
    let result = await service.reconcileWorkflowRuntimeTasks(
      { boardId: DEFAULT_WORKFLOW_BOARD_ID }, new Map(), { drive: true },
    );
    assert.equal(result.ok, true);

    // The card is parked in the decision lane…
    assert.equal(service.getCard('card-5').columnId, 'needs-decision');
    // …and a single durable notification was emitted, addressed to the card's watchers.
    let events = service.listWorkflowEvents({ cardId: 'card-5', eventTypes: ['notification'] });
    assert.equal(events.events.length, 1);
    let side = events.events[0].sideEffects.find(item => item.type === 'notification');
    assert.equal(side.channel, 'human_escalated');
    assert.equal(side.escalationKind, 'needs_human');
    assert.deepEqual(side.watchers.sort(), ['carol', 'dave']);

    // Idempotent: a second drive pass (card already in the lane) does not re-notify.
    await service.reconcileWorkflowRuntimeTasks(
      { boardId: DEFAULT_WORKFLOW_BOARD_ID }, new Map(), { drive: true },
    );
    let after = service.listWorkflowEvents({ cardId: 'card-5', eventTypes: ['notification'] });
    assert.equal(after.events.length, 1);
  });
});
