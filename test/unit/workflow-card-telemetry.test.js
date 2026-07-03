import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  latestRun,
  agentName,
  formatDuration,
  formatTokens,
  relativeTime,
  effectiveStatus,
  isCardActive,
  formatStatusLabel,
  ACTIVE_RUN_STATUSES,
} from '../../web/panels/WorkflowBoard/workflow-card-telemetry.js';

// Pure card telemetry derivations shared by the board card chips and the card inspector.
describe('workflow card telemetry helpers', () => {
  it('formats a completed run duration as compact units', () => {
    assert.equal(formatDuration({ startedAt: '2020-01-01T00:00:00.000Z', completedAt: '2020-01-01T00:00:45.000Z' }), '45s');
    assert.equal(formatDuration({ startedAt: '2020-01-01T00:00:00.000Z', completedAt: '2020-01-01T00:01:30.000Z' }), '1m 30s');
    assert.equal(formatDuration({ startedAt: '2020-01-01T00:00:00.000Z', completedAt: '2020-01-01T01:01:00.000Z' }), '1h 1m');
  });

  it('returns a live duration for a started-but-unfinished run and empty for no start', () => {
    assert.ok(formatDuration({ startedAt: '2020-01-01T00:00:00.000Z', status: 'running' }).length > 0);
    assert.equal(formatDuration({}), '');
    assert.equal(formatDuration(null), '');
  });

  it('does not fabricate elapsed time for a started run with no active status and no completion (U03)', () => {
    // A run that has a startedAt but neither an end time nor a live/active status is dead or stale —
    // showing "now minus startedAt" would report absurd durations on long-dead runs.
    assert.equal(formatDuration({ startedAt: '2020-01-01T00:00:00.000Z' }), '');
    assert.equal(formatDuration({ startedAt: '2020-01-01T00:00:00.000Z', status: 'paused' }), '');
  });

  it('formats token totals with k/M suffixes and rejects invalid values', () => {
    assert.equal(formatTokens(0), '0');
    assert.equal(formatTokens(999), '999');
    assert.equal(formatTokens(1500), '1.5k');
    assert.equal(formatTokens(15_000), '15k');
    assert.equal(formatTokens(2_000_000), '2.0M');
    assert.equal(formatTokens(null), '');
    assert.equal(formatTokens(-5), '');
    assert.equal(formatTokens('nope'), '');
  });

  it('picks the newest run and falls back to the runs list', () => {
    let card = {
      run: { id: 'r2', status: 'completed', updatedAt: '2020-01-01T00:05:00.000Z' },
      runs: [
        { id: 'r1', updatedAt: '2020-01-01T00:01:00.000Z' },
        { id: 'r2', updatedAt: '2020-01-01T00:05:00.000Z' },
      ],
    };
    assert.equal(latestRun(card).id, 'r2');
    assert.equal(latestRun({ runs: [{ id: 'a', updatedAt: '2020-01-01T00:01:00.000Z' }, { id: 'b', updatedAt: '2020-01-01T00:09:00.000Z' }] }).id, 'b');
    assert.equal(latestRun({}), null);
  });

  it('returns the newest run even when card.run holds an older one (recency over array order)', () => {
    // Regression: the normalizer fills card.run from runs[0] (array order), so an old run there must not
    // shadow a newer run in the list. Mirrors a card whose latest status is recovery_detected, not paused.
    let card = {
      run: { id: 'old', status: 'paused', updatedAt: '2020-01-01T00:01:00.000Z' },
      runs: [
        { id: 'old', status: 'paused', updatedAt: '2020-01-01T00:01:00.000Z' },
        { id: 'mid', status: 'error', updatedAt: '2020-01-01T00:02:00.000Z' },
        { id: 'new', status: 'recovery_detected', updatedAt: '2020-01-01T00:03:00.000Z' },
      ],
    };
    assert.equal(latestRun(card).id, 'new');
    assert.equal(latestRun(card).status, 'recovery_detected');
  });

  it('resolves the agent name by precedence', () => {
    assert.equal(agentName({ assignedAgent: 'backend-engineer', owner: 'orchestrator' }), 'backend-engineer');
    assert.equal(agentName({ owner: 'orchestrator' }), 'orchestrator');
    assert.equal(agentName({}, { leaseOwner: 'worker-1' }), 'worker-1');
    assert.equal(agentName({ lease: { leaseOwner: 'lease-holder' } }), 'lease-holder');
    assert.equal(agentName({}, {}), '');
  });

  it('formats relative time compactly and tolerates bad input', () => {
    assert.equal(relativeTime(''), '');
    assert.equal(relativeTime('not-a-date'), '');
    assert.match(relativeTime(new Date(Date.now() - 5000).toISOString()), /^\d+s$/);
  });

  it('shows only running/queued — the column conveys the stage, never the historical run status', () => {
    // Active card → "running" (with a spinner). The column says which stage; the chip says it is working.
    assert.equal(effectiveStatus({ runs: [{ status: 'running', updatedAt: '2020-01-01T00:01:00.000Z' }] }), 'running');
    assert.equal(effectiveStatus({ lifecycle: 'admitting' }), 'running');
    // Queued and waiting to start.
    assert.equal(effectiveStatus({ lifecycle: 'queued' }), 'queued');
    assert.equal(effectiveStatus({ raw: { lifecycle: 'queued' } }), 'queued');
    // The contradiction the user hit: a completed run sitting in Ready must NOT read "Completed" — the
    // column already shows the stage, so an idle card with history shows no status chip at all.
    assert.equal(effectiveStatus({ runs: [{ status: 'completed', updatedAt: '2020-01-01T00:01:00.000Z' }], lifecycle: 'idle' }), '');
    // A kicked-back card re-queued in Ready reads "queued", not its last run's "completed".
    assert.equal(effectiveStatus({ runs: [{ status: 'completed', updatedAt: '2020-01-01T00:01:00.000Z' }], lifecycle: 'queued' }), 'queued');
    assert.equal(effectiveStatus({ lifecycle: 'idle' }), '');
    assert.equal(effectiveStatus({}), '');
  });

  it('marks a card active for every working run status, live lease, or mid-execution lifecycle', () => {
    for (let status of ['requested', 'running', 'recovering', 'started', 'active', 'streaming']) {
      assert.equal(isCardActive({ runs: [{ status, updatedAt: '2020-01-01T00:01:00.000Z' }] }), true, status);
    }
    // A live (unexpired) lease means a run is in flight regardless of the latest status token — this is
    // what makes an actively-recovering card spin even while its run status is still recovery_detected.
    assert.equal(isCardActive({ runs: [{ status: 'recovery_detected' }], lease: { leaseExpiresAt: new Date(Date.now() + 60_000).toISOString() } }), true);
    assert.equal(isCardActive({ lease: { leaseExpiresAt: new Date(Date.now() + 60_000).toISOString() } }), true);
    // Mid-execution lifecycles count even before a run row exists.
    assert.equal(isCardActive({ lifecycle: 'admitting' }), true);
    assert.equal(isCardActive({ lifecycle: 'running' }), true);
  });

  it('does not spin a stale recovery_detected card whose lease has expired', () => {
    // recovery_detected is a detection marker, not live work; without a live lease it must not spin
    // (a stuck card sat in this state for hours). Its status label still shows, just no spinner.
    assert.ok(!ACTIVE_RUN_STATUSES.has('recovery_detected'));
    let stale = { runs: [{ status: 'recovery_detected', updatedAt: '2020-01-01T00:01:00.000Z' }], lease: { leaseExpiresAt: '2020-01-01T00:30:00.000Z' }, lifecycle: 'idle' };
    assert.equal(isCardActive(stale), false);
    // No spinner and no status chip — the column carries the stage; nothing contradicts it.
    assert.equal(effectiveStatus(stale), '');
  });

  it('does not mark idle, queued, completed, or expired-lease cards active', () => {
    assert.equal(isCardActive({ runs: [{ status: 'completed' }] }), false);
    assert.equal(isCardActive({ runs: [{ status: 'clear' }] }), false);
    // Queued is waiting in line, not working: status label only, no spinner.
    assert.equal(isCardActive({ lifecycle: 'queued' }), false);
    assert.equal(isCardActive({ lifecycle: 'idle' }), false);
    assert.equal(isCardActive({ lease: { leaseExpiresAt: new Date(Date.now() - 60_000).toISOString() } }), false);
    assert.equal(isCardActive({}), false);
  });

  it('formats a status key into a readable label', () => {
    assert.equal(formatStatusLabel('recovery_detected'), 'Recovery Detected');
    assert.equal(formatStatusLabel('running'), 'Running');
    assert.equal(formatStatusLabel(''), '');
    assert.equal(formatStatusLabel(null), '');
  });
});
