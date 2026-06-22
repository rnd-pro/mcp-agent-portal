import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  latestRun,
  agentName,
  formatDuration,
  formatTokens,
  relativeTime,
} from '../../web/panels/WorkflowBoard/workflow-card-telemetry.js';

// Pure card telemetry derivations shared by the board card chips and the card inspector.
describe('workflow card telemetry helpers', () => {
  it('formats a completed run duration as compact units', () => {
    assert.equal(formatDuration({ startedAt: '2020-01-01T00:00:00.000Z', completedAt: '2020-01-01T00:00:45.000Z' }), '45s');
    assert.equal(formatDuration({ startedAt: '2020-01-01T00:00:00.000Z', completedAt: '2020-01-01T00:01:30.000Z' }), '1m 30s');
    assert.equal(formatDuration({ startedAt: '2020-01-01T00:00:00.000Z', completedAt: '2020-01-01T01:01:00.000Z' }), '1h 1m');
  });

  it('returns a live duration for a started-but-unfinished run and empty for no start', () => {
    assert.ok(formatDuration({ startedAt: '2020-01-01T00:00:00.000Z' }).length > 0);
    assert.equal(formatDuration({}), '');
    assert.equal(formatDuration(null), '');
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
});
