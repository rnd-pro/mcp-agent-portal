import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { resetLocalization } from 'symbiote-ui/locale';

import { configurePortalLocalization } from '../../web/common/localization.js';
import {
  deriveCardTicker,
  effectiveColumnAutomation,
  statusChipKind,
} from '../../web/panels/WorkflowBoard/workflow-card-presentation.js';

describe('workflow card presentation helpers', () => {
  beforeEach(() => {
    resetLocalization();
    configurePortalLocalization({
      settings: { localization: { mode: 'en' } },
      document: { documentElement: { dataset: {}, lang: '', dir: '' } },
    });
  });

  it('keeps execution state, outcome, attention, and quiet metadata in separate chip families', () => {
    assert.equal(statusChipKind('running'), 'state');
    assert.equal(statusChipKind('queued'), 'state');
    assert.equal(statusChipKind('completed'), 'status');
    assert.equal(statusChipKind('failed'), 'error');
    assert.equal(statusChipKind('needs_audit'), 'warning');
    assert.equal(statusChipKind('custom-stage'), '');
  });

  it('summarizes the effective column mode from board mode and column automation', () => {
    assert.deepEqual(
      pickMode(effectiveColumnAutomation('autonomous', { mode: 'auto', trigger: 'on_enter', agents: ['orchestrator'] })),
      { effective: 'auto', label: 'Auto', kind: 'state', icon: 'bolt' },
    );
    assert.deepEqual(
      pickMode(effectiveColumnAutomation('autonomous', { mode: 'gated', trigger: 'on_enter' })),
      { effective: 'gated', label: 'Auto + gates', kind: 'status', icon: 'checklist' },
    );
    // quality-audit shape: mode 'manual' but an on_enter trigger with agents auto-runs the audit,
    // so under an autonomous board it reads 'Auto', not hand-driven.
    assert.deepEqual(
      pickMode(effectiveColumnAutomation('autonomous', { mode: 'manual', trigger: 'on_enter', agents: ['qa-engineer', 'code-reviewer'] })),
      { effective: 'auto', label: 'Auto', kind: 'state', icon: 'bolt' },
    );
    // A genuinely hand-driven column (trigger 'manual', no agents) stays Manual even when autonomous.
    assert.deepEqual(
      pickMode(effectiveColumnAutomation('autonomous', { mode: 'manual', trigger: 'manual', agents: [] })),
      { effective: 'manual', label: 'Manual', kind: '', icon: 'pan_tool' },
    );
    // manual mode + automated trigger but NO agents: nothing runs → still Manual.
    assert.deepEqual(
      pickMode(effectiveColumnAutomation('autonomous', { mode: 'manual', trigger: 'on_enter', agents: [] })),
      { effective: 'manual', label: 'Manual', kind: '', icon: 'pan_tool' },
    );
    let idle = effectiveColumnAutomation('manual', { mode: 'auto', trigger: 'on_enter' });
    assert.deepEqual(pickMode(idle), {
      effective: 'manual',
      label: 'Manual',
      kind: '',
      icon: 'pan_tool',
    });
    assert.match(idle.title, /Board is Manual/);
    assert.match(idle.title, /configured as Auto/);
    assert.match(idle.title, /trigger: On Enter/);
  });

  it('derives a compact latest-action ticker from run, event, return, and lease data', () => {
    let now = Date.parse('2026-07-03T12:00:00.000Z');
    let running = deriveCardTicker({
      runs: [{
        status: 'running',
        leaseOwner: 'ui-engineer',
        updatedAt: '2026-07-03T11:59:55.000Z',
      }],
    }, { now });
    assert.equal(running.kind, 'state');
    assert.equal(running.icon, 'autorenew');
    assert.equal(running.label, 'ui-engineer · Running · 5s ago');

    let event = deriveCardTicker({
      runs: [{
        status: 'completed',
        leaseOwner: 'backend-engineer',
        updatedAt: '2026-07-03T11:58:00.000Z',
      }],
      events: [{
        actor: 'qa-engineer',
        note: 'Validated card layout',
        status: 'completed',
        timestamp: '2026-07-03T11:59:00.000Z',
      }],
    }, { now });
    assert.equal(event.kind, '');
    assert.equal(event.icon, 'history');
    assert.equal(event.label, 'qa-engineer · Validated card layout · 1m ago');

    let returned = deriveCardTicker({
      metadata: {
        returns: [{
          kind: 'blocked',
          raisedBy: 'tooling-engineer',
          detail: 'Needs reviewer input',
          raisedAt: '2026-07-03T11:59:30.000Z',
        }],
      },
    }, { now });
    assert.equal(returned.kind, 'error');
    assert.equal(returned.icon, 'error');
    assert.equal(returned.label, 'tooling-engineer · Needs reviewer input · 30s ago');

    let leased = deriveCardTicker({
      lease: {
        leaseOwner: 'orchestrator',
        updatedAt: '2026-07-03T11:59:45.000Z',
        leaseExpiresAt: '2026-07-03T12:01:00.000Z',
      },
    }, { now });
    assert.equal(leased.kind, 'state');
    assert.equal(leased.label, 'orchestrator · Working · 15s ago');
  });
});

function pickMode(value) {
  return {
    effective: value.effective,
    label: value.label,
    kind: value.kind,
    icon: value.icon,
  };
}
