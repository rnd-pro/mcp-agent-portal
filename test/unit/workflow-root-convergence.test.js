import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_ROOT_MAX_DEPTH,
  DEFAULT_ROOT_MAX_FANOUT,
  DEFAULT_ROOT_MAX_RUNS,
  evaluateRootConvergence,
  summarizeRealizationByRoot,
  normalizeWorkflowBoardAutomation,
  normalizeWorkflowSubscription,
  WORKFLOW_SUBSCRIPTION_SCHEMA,
} from '../../src/iso/workflow-board.js';

// Step 1/11 — the iso primitives for iterative re-decomposition: the realization rollup, the always-on
// per-root convergence cap, its optional board override, and the per-wave join subscription ordinal.

describe('per-root convergence cap (iso)', () => {
  it('is always-on: defaults apply with no override, no configured:false escape', () => {
    let under = evaluateRootConvergence({ depth: 1, fanout: 1, runCount: 1 });
    assert.equal(under.ok, true);
    assert.deepEqual(under.breaches, []);
    assert.deepEqual(under.limits, {
      depth: DEFAULT_ROOT_MAX_DEPTH, fanout: DEFAULT_ROOT_MAX_FANOUT, runCount: DEFAULT_ROOT_MAX_RUNS,
    });

    // A genuinely unauthored call (no spend) is still bounded by the defaults — never "uncapped".
    let empty = evaluateRootConvergence();
    assert.equal(empty.ok, true);
    assert.deepEqual(empty.limits, under.limits);
  });

  it('breaches each dimension at >= its limit (hard ceiling), mirroring the budget evaluator', () => {
    let atDepth = evaluateRootConvergence({ depth: DEFAULT_ROOT_MAX_DEPTH, fanout: 0, runCount: 0 });
    assert.equal(atDepth.ok, false);
    assert.deepEqual(atDepth.breaches, [{ dimension: 'depth', limit: DEFAULT_ROOT_MAX_DEPTH, spent: DEFAULT_ROOT_MAX_DEPTH }]);

    // Just under the ceiling stays admissible.
    assert.equal(evaluateRootConvergence({ depth: DEFAULT_ROOT_MAX_DEPTH - 1, fanout: 0, runCount: 0 }).ok, true);

    let multi = evaluateRootConvergence({
      depth: DEFAULT_ROOT_MAX_DEPTH + 5, fanout: DEFAULT_ROOT_MAX_FANOUT + 1, runCount: 0,
    });
    assert.deepEqual(multi.breaches.map(b => b.dimension), ['depth', 'fanout']);
  });

  it('honors a board override per dimension; missing dimensions fall back to the default', () => {
    let tight = evaluateRootConvergence({ depth: 3, fanout: 0, runCount: 0 }, { depth: 3 });
    assert.equal(tight.ok, false, 'a lowered depth limit breaches at the override value');
    assert.equal(tight.limits.depth, 3);
    assert.equal(tight.limits.fanout, DEFAULT_ROOT_MAX_FANOUT, 'unspecified fanout keeps the default');
    assert.equal(tight.limits.runCount, DEFAULT_ROOT_MAX_RUNS);

    // Non-positive / garbage override values fall back to the default — never disable the cap.
    let garbage = evaluateRootConvergence({ runCount: 0 }, { runCount: 0 });
    assert.equal(garbage.limits.runCount, DEFAULT_ROOT_MAX_RUNS);
  });
});

describe('rootConvergence normalization into board automation', () => {
  it('is always present via the defaults on an unauthored board (no opt-in gate)', () => {
    let automation = normalizeWorkflowBoardAutomation({});
    assert.deepEqual(automation.rootConvergence, {
      depth: DEFAULT_ROOT_MAX_DEPTH, fanout: DEFAULT_ROOT_MAX_FANOUT, runCount: DEFAULT_ROOT_MAX_RUNS,
    });
    // Independent of the optional budget, which stays absent (uncapped) when unauthored.
    assert.equal(automation.budget, undefined);
  });

  it('merges a board override (snake/camel) and fills missing dimensions from the default', () => {
    let automation = normalizeWorkflowBoardAutomation({ rootConvergence: { max_depth: 2, fanout: 10 } });
    assert.deepEqual(automation.rootConvergence, { depth: 2, fanout: 10, runCount: DEFAULT_ROOT_MAX_RUNS });
  });
});

describe('summarizeRealizationByRoot (iso)', () => {
  // closeKind-aware terminal-action map the caller derives from board.columns.
  let terminalActions = {
    done: { action: 'close', closeKind: 'success' },
    rejected: { action: 'close', closeKind: 'rejected' },
  };
  let cards = [
    { id: 'root', columnId: 'in-progress', metadata: {} },                                  // active, root-as-self
    { id: 'a', columnId: 'done', metadata: { rootCardId: 'root' } },                         // done
    { id: 'b', columnId: 'rejected', metadata: { rootCardId: 'root' } },                     // rejected
    { id: 'c', columnId: 'ready', lifecycle: 'blocked', metadata: { rootCardId: 'root' } },  // blocked
    { id: 'd', columnId: 'quality-audit', metadata: { rootCardId: 'root' } },                // active
    { id: 'other', columnId: 'done', metadata: { rootCardId: 'other-root' } },               // different root
  ];

  it('counts the root plus its descendants, bucketed by terminal status', () => {
    let summary = summarizeRealizationByRoot(cards, 'root', { terminalActions });
    assert.deepEqual(summary, { root: 'root', total: 5, done: 1, rejected: 1, active: 2, blocked: 1 });
  });

  it('falls back to root-as-self for an unstamped card and skips foreign roots', () => {
    let summary = summarizeRealizationByRoot(cards, 'other-root', { terminalActions });
    assert.deepEqual(summary, { root: 'other-root', total: 1, done: 1, rejected: 0, active: 0, blocked: 0 });
  });

  it('accepts a Map terminal-action source and stays board-agnostic without one', () => {
    let asMap = new Map(Object.entries(terminalActions));
    assert.deepEqual(
      summarizeRealizationByRoot(cards, 'root', { terminalActions: asMap }),
      summarizeRealizationByRoot(cards, 'root', { terminalActions }),
    );
    // With no action map, nothing is a terminal close — a resting card counts as active, not done.
    let blind = summarizeRealizationByRoot(cards, 'root', {});
    assert.equal(blind.total, 5);
    assert.equal(blind.done, 0);
    assert.equal(blind.rejected, 0);
    assert.equal(blind.blocked, 1, 'lifecycle blocked is column-independent');
    assert.equal(blind.active, 4);
  });
});

describe('per-wave join subscription ordinal', () => {
  it('carries an optional integer wave (>=1) for join mode', () => {
    let sub = normalizeWorkflowSubscription({ mode: 'join', members: ['c1', 'c2'], wave: 3 });
    assert.equal(sub.schema, WORKFLOW_SUBSCRIPTION_SCHEMA);
    assert.equal(sub.mode, 'join');
    assert.equal(sub.wave, 3);
    assert.deepEqual(sub.members, ['c1', 'c2']);
  });

  it('drops a non-positive/absent wave, and ignores wave for non-join modes', () => {
    assert.equal(normalizeWorkflowSubscription({ mode: 'join', members: ['c1'], wave: 0 }).wave, undefined);
    assert.equal('wave' in normalizeWorkflowSubscription({ mode: 'join', members: ['c1'] }), false);
    // Non-join modes never carry a wave even when supplied.
    assert.equal('wave' in normalizeWorkflowSubscription({ mode: 'final', wave: 2 }), false);
  });

  it('keeps a memberless join null even with a wave', () => {
    assert.equal(normalizeWorkflowSubscription({ mode: 'join', members: [], wave: 2 }), null);
  });
});
