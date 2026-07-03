import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { createInspectorDecisionModel } from '../../web/panels/WorkflowBoard/workflow-card-inspector-decision.js';

function decisionCard(overrides = {}) {
  return {
    id: 'card-1',
    title: 'Pick provider',
    columnId: 'needs-decision',
    status: 'blocked',
    lifecycle: 'idle',
    body: 'Original body',
    runs: [{ id: 'run-1', status: 'error', updatedAt: '2026-07-03T10:00:00.000Z' }],
    events: [{ id: 'event-1', timestamp: '2026-07-03T10:01:00.000Z', status: 'blocked' }],
    metadata: {
      escalation: {
        kind: 'needs_human',
        detail: 'Which provider should handle this task?',
        lastEscalation: {
          detail: 'Which provider should handle this task?',
          options: [
            { id: 'claude', label: 'Claude' },
            { id: 'openrouter', label: 'OpenRouter' },
          ],
        },
      },
    },
    ...overrides,
  };
}

describe('workflow card inspector decision model', () => {
  it('keeps the decision signature stable across unrelated same-card refresh data', () => {
    let model = createInspectorDecisionModel(decisionCard());
    let refreshed = createInspectorDecisionModel(decisionCard({
      status: 'running',
      lifecycle: 'running',
      body: 'Updated markdown body',
      runs: [
        { id: 'run-1', status: 'error', updatedAt: '2026-07-03T10:00:00.000Z' },
        { id: 'run-2', status: 'running', updatedAt: '2026-07-03T10:02:00.000Z' },
      ],
      events: [
        { id: 'event-2', timestamp: '2026-07-03T10:03:00.000Z', status: 'running' },
      ],
    }));

    assert.equal(refreshed.visible, true);
    assert.equal(refreshed.signature, model.signature);
  });

  it('changes the decision signature only when the question or options change', () => {
    let model = createInspectorDecisionModel(decisionCard());

    assert.notEqual(
      createInspectorDecisionModel(decisionCard({
        metadata: {
          escalation: {
            kind: 'needs_human',
            detail: 'Which region should this run target?',
            lastEscalation: { detail: 'Which region should this run target?', options: [] },
          },
        },
      })).signature,
      model.signature,
    );

    assert.notEqual(
      createInspectorDecisionModel(decisionCard({
        metadata: {
          escalation: {
            kind: 'needs_human',
            detail: 'Which provider should handle this task?',
            lastEscalation: {
              detail: 'Which provider should handle this task?',
              options: [{ id: 'claude', label: 'Claude Sonnet' }],
            },
          },
        },
      })).signature,
      model.signature,
    );
  });

  it('shows the decision panel for a human lane card even before a live needs_human episode exists', () => {
    let model = createInspectorDecisionModel({
      id: 'manual-card',
      columnId: 'needs-decision',
      metadata: { escalation: { kind: 'needs_decision', detail: 'Resolve merge conflict.' } },
    });

    assert.equal(model.visible, true);
    assert.equal(model.inLane, true);
    assert.equal(model.question, '');
    assert.deepEqual(model.options, []);
  });

  it('hides completed human escalations outside the decision lane', () => {
    assert.equal(createInspectorDecisionModel(decisionCard({
      columnId: 'in-progress',
      metadata: {
        escalation: {
          kind: 'needs_human',
          humanEscalated: true,
          detail: 'Already answered.',
        },
      },
    })).visible, false);
  });
});
