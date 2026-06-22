import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  WORKFLOW_RETURN_KINDS,
  WORKFLOW_RETURN_SCHEMA,
  WORKFLOW_SUBSCRIPTION_SCHEMA,
  normalizeWorkflowReturnEvent,
  normalizeWorkflowSubscription,
  isActionableReturn,
  isHardInterrupt,
  isTerminalReturn,
  returnEventSupersedes,
  coalesceReturnEvents,
} from '../../src/iso/workflow-board.js';

// S1/S2/S3 — frozen iso contracts for the orchestrator return/subscription control loop.

describe('return-event normalizer (S1)', () => {
  it('freezes the kind vocabulary and order', () => {
    assert.deepEqual(WORKFLOW_RETURN_KINDS, [
      'completed', 'failed',
      'needs_decision', 'needs_context', 'needs_permission',
      'blocked',
      'partial', 'discovered', 'progress',
    ]);
  });

  it('drops an unknown kind and a missing correlationId', () => {
    assert.equal(normalizeWorkflowReturnEvent({ kind: 'nope', correlationId: 'c1' }), null);
    assert.equal(normalizeWorkflowReturnEvent({ kind: 'completed' }), null);
  });

  it('denormalizes terminal/actionable/hardInterrupt flags per kind', () => {
    let table = {
      completed: { terminal: true, actionable: true, hardInterrupt: false },
      failed: { terminal: true, actionable: true, hardInterrupt: false },
      needs_decision: { terminal: false, actionable: true, hardInterrupt: true },
      needs_context: { terminal: false, actionable: true, hardInterrupt: false },
      needs_permission: { terminal: false, actionable: true, hardInterrupt: true },
      blocked: { terminal: false, actionable: true, hardInterrupt: true },
      partial: { terminal: false, actionable: false, hardInterrupt: false },
      discovered: { terminal: false, actionable: true, hardInterrupt: false },
      progress: { terminal: false, actionable: false, hardInterrupt: false },
    };
    for (let [kind, flags] of Object.entries(table)) {
      let ev = normalizeWorkflowReturnEvent({ kind, correlationId: 'card-1' });
      assert.equal(ev.schema, WORKFLOW_RETURN_SCHEMA);
      assert.equal(ev.terminal, flags.terminal, `${kind}.terminal`);
      assert.equal(ev.actionable, flags.actionable, `${kind}.actionable`);
      assert.equal(ev.hardInterrupt, flags.hardInterrupt, `${kind}.hardInterrupt`);
    }
  });

  it('forces needsResponse false for coalesce-only kinds even if the input asks for true', () => {
    assert.equal(normalizeWorkflowReturnEvent({ kind: 'progress', correlationId: 'c', needsResponse: true }).needsResponse, false);
    assert.equal(normalizeWorkflowReturnEvent({ kind: 'partial', correlationId: 'c', needs_response: true }).needsResponse, false);
    // hard-interrupts are two-way by kind
    assert.equal(normalizeWorkflowReturnEvent({ kind: 'needs_decision', correlationId: 'c' }).needsResponse, true);
    assert.equal(normalizeWorkflowReturnEvent({ kind: 'blocked', correlationId: 'c' }).needsResponse, true);
    assert.equal(normalizeWorkflowReturnEvent({ kind: 'needs_context', correlationId: 'c' }).needsResponse, true);
    // a soft actionable kind is one-way unless asked
    assert.equal(normalizeWorkflowReturnEvent({ kind: 'discovered', correlationId: 'c' }).needsResponse, false);
    assert.equal(normalizeWorkflowReturnEvent({ kind: 'discovered', correlationId: 'c', needsResponse: true }).needsResponse, true);
  });

  it('maps hard/two-way kinds onto the escalation vocabulary; payload is null when absent', () => {
    assert.equal(normalizeWorkflowReturnEvent({ kind: 'needs_context', correlationId: 'c' }).escalationKind, 'insufficient_context');
    assert.equal(normalizeWorkflowReturnEvent({ kind: 'needs_permission', correlationId: 'c' }).escalationKind, 'insufficient_permission');
    assert.equal(normalizeWorkflowReturnEvent({ kind: 'blocked', correlationId: 'c' }).escalationKind, 'needs_decision');
    assert.equal(normalizeWorkflowReturnEvent({ kind: 'completed', correlationId: 'c' }).escalationKind, null);
    assert.equal(normalizeWorkflowReturnEvent({ kind: 'partial', correlationId: 'c' }).payload, null);
    assert.deepEqual(normalizeWorkflowReturnEvent({ kind: 'partial', correlationId: 'c', payload: { found: 3 } }).payload, { found: 3 });
  });

  it('accepts snake_case + opts provenance', () => {
    let ev = normalizeWorkflowReturnEvent(
      { kind: 'completed', correlation_id: 'card-9', run_id: 'run-1', seq: 4 },
      { now: 1000, taskId: 't-1' },
    );
    assert.equal(ev.correlationId, 'card-9');
    assert.equal(ev.runId, 'run-1');
    assert.equal(ev.taskId, 't-1');
    assert.equal(ev.seq, 4);
    assert.equal(ev.raisedAt, 1000);
  });
});

describe('return classifiers + supersede/coalesce (S2)', () => {
  it('classifiers agree with the vocabulary', () => {
    assert.equal(isTerminalReturn('completed'), true);
    assert.equal(isActionableReturn('progress'), false);
    assert.equal(isActionableReturn('discovered'), true);
    assert.equal(isHardInterrupt('blocked'), true);
    assert.equal(isHardInterrupt('discovered'), false);
  });

  let mk = (kind, over = {}) => normalizeWorkflowReturnEvent({ kind, correlationId: 'c', ...over });

  it('a coalesce-only prior is superseded by an actionable/terminal incoming', () => {
    assert.equal(returnEventSupersedes(mk('completed', { eventId: 'b' }), mk('progress', { eventId: 'a' })), true);
    assert.equal(returnEventSupersedes(mk('discovered', { eventId: 'b' }), mk('partial', { eventId: 'a' })), true);
  });

  it('a terminal or two-way prior is never auto-superseded', () => {
    assert.equal(returnEventSupersedes(mk('progress', { eventId: 'b' }), mk('completed', { eventId: 'a' })), false);
    assert.equal(returnEventSupersedes(mk('discovered', { eventId: 'b' }), mk('needs_decision', { eventId: 'a' })), false);
  });

  it('never supersedes across correlationIds', () => {
    let a = normalizeWorkflowReturnEvent({ kind: 'progress', correlationId: 'c1', eventId: 'a' });
    let b = normalizeWorkflowReturnEvent({ kind: 'completed', correlationId: 'c2', eventId: 'b' });
    assert.equal(returnEventSupersedes(b, a), false);
  });

  it('an out-of-order lower-seq incoming does not supersede', () => {
    let prior = mk('partial', { eventId: 'a', seq: 5 });
    let older = mk('discovered', { eventId: 'b', seq: 3 });
    assert.equal(returnEventSupersedes(older, prior), false);
  });

  it('explicit supersedes pointer wins', () => {
    let prior = mk('needs_decision', { eventId: 'q1' });
    let answer = mk('discovered', { eventId: 'b', supersedes: 'q1' });
    assert.equal(returnEventSupersedes(answer, prior), true);
  });

  it('coalesce folds progress then drops it after a terminal; caps the inbox', () => {
    let inbox = [];
    inbox = coalesceReturnEvents(inbox, mk('progress', { eventId: 'p1' }));
    inbox = coalesceReturnEvents(inbox, mk('completed', { eventId: 'done' }));
    assert.deepEqual(inbox.map(e => e.kind), ['completed']);
    // a late progress after terminal is dropped
    inbox = coalesceReturnEvents(inbox, mk('progress', { eventId: 'p2' }));
    assert.deepEqual(inbox.map(e => e.kind), ['completed']);

    let big = [];
    for (let i = 0; i < 20; i += 1) {
      big = coalesceReturnEvents(big, normalizeWorkflowReturnEvent({ kind: 'discovered', correlationId: `c${i}`, eventId: `e${i}` }));
    }
    assert.equal(big.length, 12);
  });

  it('coalesce is idempotent by eventId (re-minting a stable marker is a no-op)', () => {
    let inbox = coalesceReturnEvents([], normalizeWorkflowReturnEvent({ kind: 'discovered', correlationId: 'c', eventId: 'ret-abc' }));
    assert.equal(inbox.length, 1);
    inbox = coalesceReturnEvents(inbox, normalizeWorkflowReturnEvent({ kind: 'discovered', correlationId: 'c', eventId: 'ret-abc' }));
    assert.equal(inbox.length, 1, 'same eventId+correlationId deduped');
    inbox = coalesceReturnEvents(inbox, normalizeWorkflowReturnEvent({ kind: 'discovered', correlationId: 'c', eventId: 'ret-def' }));
    assert.equal(inbox.length, 2, 'a distinct eventId still lands');
  });
});

describe('subscription normalizer (S3)', () => {
  it('defaults to final mode and fail_fast', () => {
    let s = normalizeWorkflowSubscription({});
    assert.equal(s.schema, WORKFLOW_SUBSCRIPTION_SCHEMA);
    assert.equal(s.mode, 'final');
    assert.equal(s.onFailure, 'fail_fast');
    assert.equal(normalizeWorkflowSubscription({ mode: 'bogus' }).mode, 'final');
  });

  it('a join with no members is not a join', () => {
    assert.equal(normalizeWorkflowSubscription({ mode: 'join' }), null);
    assert.equal(normalizeWorkflowSubscription({ mode: 'join', members: [] }), null);
  });

  it('dedups members and accepts {cardId}/{id}/string forms', () => {
    let s = normalizeWorkflowSubscription({ mode: 'join', members: ['a', 'a', { cardId: 'b' }, { id: 'c' }] });
    assert.deepEqual(s.members, ['a', 'b', 'c']);
    assert.equal(s.joinPolicy.type, 'all');
  });

  it('quorum out of range collapses to all (never under-wait); valid quorum kept', () => {
    let bad = normalizeWorkflowSubscription({ mode: 'join', members: ['a', 'b'], joinPolicy: { type: 'quorum', k: 9 } });
    assert.equal(bad.joinPolicy.type, 'all');
    assert.equal(bad.joinPolicy.k, undefined);
    let ok = normalizeWorkflowSubscription({ mode: 'join', members: ['a', 'b', 'c'], joinPolicy: { type: 'quorum', k: 2 } });
    assert.equal(ok.joinPolicy.type, 'quorum');
    assert.equal(ok.joinPolicy.k, 2);
  });

  it('carries all/any/all_settled policies and onFailure', () => {
    let s = normalizeWorkflowSubscription({ mode: 'join', members: ['a', 'b'], joinPolicy: { type: 'any' }, onFailure: 'all_settled' });
    assert.equal(s.joinPolicy.type, 'any');
    assert.equal(s.onFailure, 'all_settled');
  });
});
