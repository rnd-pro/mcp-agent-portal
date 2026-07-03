import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  deriveWorkflowWaiting,
  WORKFLOW_WAITING_REASONS,
  WORKFLOW_WAITING_SCHEMA,
  normalizeWorkflowReturnEvent,
} from '../../src/iso/workflow-board.js';

// F2: one derived record folds the five overlapping "is this card waiting" signals (dependency
// block, human escalation, machine backoff, queued return, run-error recovery flags) into a single
// {reason, since, dueAt, owner, wakeOn}. These pin the reason each axis maps to and the precedence.

const HOUR = 3_600_000;

function card(overrides = {}) {
  return { columnId: 'in-progress', lifecycle: 'idle', recoveryFlags: [], metadata: {}, ...overrides };
}

describe('deriveWorkflowWaiting (F2 unified waiting record)', () => {
  it('returns null for a running, fresh, or terminal-settled card', () => {
    assert.equal(deriveWorkflowWaiting(card(), { hasActiveRun: true }), null, 'running card is not waiting');
    assert.equal(deriveWorkflowWaiting(card(), { isTerminal: true }), null, 'terminal card is not waiting');
    assert.equal(deriveWorkflowWaiting(card()), null, 'a fresh idle card with no signal is not waiting');
  });

  it('maps a live needs_human episode to reason=human, owner=human', () => {
    let w = deriveWorkflowWaiting(card({
      metadata: { escalation: { kind: 'needs_human', lastAt: 100, firstAt: 90 } },
    }));
    assert.equal(w.schema, WORKFLOW_WAITING_SCHEMA);
    assert.equal(w.reason, 'human');
    assert.equal(w.owner, 'human');
    assert.equal(w.wakeOn, 'human_reply');
    assert.equal(w.since, 100);
    assert.equal(w.dueAt, null, 'a human wait has no machine due date');
  });

  it('maps any live escalation on a card resting in the human lane to reason=human', () => {
    let w = deriveWorkflowWaiting(
      card({ columnId: 'needs-decision', metadata: { escalation: { kind: 'needs_decision', lastAt: 5 } } }),
      { inHumanLane: true },
    );
    assert.equal(w.reason, 'human');
  });

  it('maps a dependency-blocked card to reason=dependency with a dueAt horizon', () => {
    let w = deriveWorkflowWaiting(
      card({ lifecycle: 'blocked', metadata: { dependencyBlock: { blockedAt: 1000 } } }),
      { maxBlockedAgeMs: 24 * HOUR },
    );
    assert.equal(w.reason, 'dependency');
    assert.equal(w.owner, 'upstream');
    assert.equal(w.wakeOn, 'upstream_release');
    assert.equal(w.since, 1000);
    assert.equal(w.dueAt, 1000 + 24 * HOUR, 'dueAt is the max-blocked-age escalation horizon');
  });

  it('maps a live escalation with a future retry window to reason=backoff with dueAt=nextAttemptAt', () => {
    let w = deriveWorkflowWaiting(
      card({ metadata: { escalation: { kind: 'needs_decision', lastAt: 200, nextAttemptAt: 5000 } } }),
      { now: 1000 },
    );
    assert.equal(w.reason, 'backoff');
    assert.equal(w.owner, 'daemon');
    assert.equal(w.wakeOn, 'timer');
    assert.equal(w.dueAt, 5000);
  });

  it('reports backoff with dueAt=null once the retry window has already elapsed', () => {
    let w = deriveWorkflowWaiting(
      card({ metadata: { escalation: { kind: 'rework', lastAt: 200, nextAttemptAt: 300 } } }),
      { now: 9999 },
    );
    assert.equal(w.reason, 'backoff');
    assert.equal(w.dueAt, null, 'an elapsed window is due now, not in the future');
  });

  it('maps an unconsumed wake-driving return to reason=return, owner=orchestrator', () => {
    let event = normalizeWorkflowReturnEvent({ kind: 'discovered', correlationId: 'c1', detail: 'a finding' }, { now: 42 });
    let w = deriveWorkflowWaiting(card({ metadata: { returns: [event] } }));
    assert.equal(w.reason, 'return');
    assert.equal(w.owner, 'orchestrator');
    assert.equal(w.wakeOn, 'return');
    assert.equal(w.since, 42);
  });

  it('ignores a consumed return (no longer waiting on that axis)', () => {
    let event = normalizeWorkflowReturnEvent({ kind: 'discovered', correlationId: 'c1' }, { now: 42 });
    let w = deriveWorkflowWaiting(card({ metadata: { returns: [{ ...event, consumedAt: 99 }] } }));
    assert.equal(w, null, 'a consumed return does not keep the card waiting');
  });

  it('maps recovery flags alone to reason=run_error', () => {
    let w = deriveWorkflowWaiting(card({ recoveryFlags: ['needs_resume'] }));
    assert.equal(w.reason, 'run_error');
    assert.equal(w.owner, 'daemon');
    assert.equal(w.wakeOn, 'reconcile');
  });

  it('precedence: a person\'s turn outranks a machine backoff on the same card', () => {
    let w = deriveWorkflowWaiting(card({
      metadata: { escalation: { kind: 'needs_human', lastAt: 10, nextAttemptAt: 5000 } },
    }), { now: 1 });
    assert.equal(w.reason, 'human', 'needs_human with a retry window is still the human\'s turn');
  });

  it('every emitted reason is in the closed vocabulary', () => {
    let samples = [
      card({ metadata: { escalation: { kind: 'needs_human' } } }),
      card({ lifecycle: 'blocked', metadata: { dependencyBlock: { blockedAt: 1 } } }),
      card({ metadata: { escalation: { kind: 'needs_decision', nextAttemptAt: 9 } } }),
      card({ recoveryFlags: ['needs_audit'] }),
    ];
    for (let sample of samples) {
      let w = deriveWorkflowWaiting(sample, { now: 0 });
      assert.ok(WORKFLOW_WAITING_REASONS.includes(w.reason), `reason ${w.reason} is known`);
    }
  });
});
