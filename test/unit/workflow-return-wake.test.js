import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { DEFAULT_WORKFLOW_BOARD_ID } from '../../src/iso/workflow-board.js';
import { StateGraph } from '../../src/node/state-graph.js';
import { createWorkflowBoardService } from '../../src/node/workflow-board-service.js';
import { humanPrincipal } from '../../src/node/server/principal.js';

// Orchestrator return WAKE (S9–S10): a queued actionable return drives the orchestrator through the
// SAME escalation re-engagement driver as an active escalation. The driver candidate filter is
// generalized (hasActiveEscalation || hasQueuedActionableReturn); the successful re-engagement stamps
// `consumedAt` on every actionable return in the same durable commit (consumed ⟺ delivered → idempotent
// wake); a hard-interrupt return wakes regardless of board `recovery`; and the re-engagement reason
// carries a compact batch of the queued returns. We reuse the scheduler/escalation harness: a ledger
// stub reserves a capacity slot per `admission_id` (no real spawn) and `reconcileWorkflowEscalations`
// is driven directly with planted `metadata.returns` / `metadata.escalation`.
function makeLedgerProxy({ groupLimits = {}, defaultLimit = Infinity } = {}) {
  let slots = new Map(); // admissionId -> { groupKey, taskId }
  let taskSeq = 0;
  let calls = [];
  function activeForGroup(groupKey) {
    let count = 0;
    for (let slot of slots.values()) if (slot.groupKey === groupKey) count += 1;
    return count;
  }
  let proxy = {
    requestFromChild: async (server, _method, payload) => {
      calls.push({ server, payload });
      if (server === 'project-graph') {
        return { content: [{ type: 'text', text: JSON.stringify({ ok: true, skeleton: {}, files: [] }) }] };
      }
      if (server !== 'agent-pool') {
        return { content: [{ type: 'text', text: 'ok' }] };
      }
      let args = payload?.arguments ?? {};
      if (payload?.name === 'release_slot') {
        if (args.admission_id) slots.delete(args.admission_id);
        return { content: [{ type: 'text', text: 'released' }] };
      }
      let admissionId = args.admission_id;
      let groupKey = args.resource_group ?? 'default';
      let limit = Object.hasOwn(groupLimits, groupKey) ? groupLimits[groupKey] : defaultLimit;
      if (admissionId && slots.has(admissionId)) {
        return { content: [{ type: 'text', text: `Reusing task ${slots.get(admissionId).taskId}` }] };
      }
      if (activeForGroup(groupKey) >= limit) {
        return {
          isError: true,
          content: [{ type: 'text', text: `⚠️ Resource group \`${groupKey}\` is at capacity (${activeForGroup(groupKey)}/${limit} active tasks).` }],
        };
      }
      let taskId = `${(++taskSeq).toString().padStart(8, '0')}-0000-4000-8000-000000000000`;
      if (admissionId) slots.set(admissionId, { groupKey, taskId });
      return { content: [{ type: 'text', text: `Started task ${taskId}` }] };
    },
    chatWsServer: { taskChatMap: new Map() },
  };
  return {
    proxy,
    calls,
    release(admissionId) { slots.delete(admissionId); },
    activeForGroup,
    slotCount() { return slots.size; },
  };
}

describe('workflow escalation driver — return wake (S9–S10)', () => {
  let tmpDir;
  let sg;
  let now;
  let idSeq;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'workflow-return-wake-'));
    sg = new StateGraph({
      snapshotPath: path.join(tmpDir, 'state.json'),
      walPath: path.join(tmpDir, 'state.wal'),
      chatsDir: path.join(tmpDir, 'chats'),
    });
    now = 1000;
    idSeq = 0;
  });

  afterEach(async () => {
    await sg.flushChatWrites();
    sg.flush();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function makeService(proxyManager) {
    return createWorkflowBoardService({
      stateGraph: sg,
      now: () => now++,
      makeId: (prefix) => `${prefix}-${++idSeq}`,
      projectRoot: tmpDir,
      proxyManager,
      defaultPrincipal: humanPrincipal({ transport: { channel: 'loopback' }, label: 'local-human' }),
    });
  }

  function relaxBoardPreChecks(service) {
    service.updateWorkflowBoard({
      patch: { automation: { globalParallelLimit: 999 } },
      actor: 'test',
      reason: 'test: ledger is the capacity authority',
    });
    service.updateWorkflowColumn({
      columnId: 'ready',
      patch: { automation: { parallelLimit: 999 } },
      actor: 'test',
      reason: 'test: ledger is the capacity authority',
    });
  }

  function makeReadyCard(service, overrides = {}) {
    let created = service.createOrUpdateCard({
      title: overrides.title ?? `Card ${++idSeq}`,
      body: 'Schedulable work item.',
      columnId: 'ready',
      projectId: 'agent-portal',
      domain: 'backend',
      owner: 'orchestrator',
      assignedAgent: 'backend-engineer',
      resourceGroup: overrides.resourceGroup ?? 'impl',
      acceptanceCriteria: ['Re-engaged by the return wake'],
      actor: 'test',
    });
    return created.card;
  }

  // Plant a normalized return event on the card's inbox. The shape mirrors normalizeWorkflowReturnEvent
  // output (denormalized flags) so the driver's candidate filter reads it exactly as the mint writes it.
  function returnEvent({ kind, detail = null, correlationId, terminal = false, actionable = true, hardInterrupt = false, routed = false }) {
    return {
      schema: 'workflow-return/v1',
      eventId: `ret-${kind}-${correlationId}${routed ? '-routed' : ''}`,
      kind,
      terminal,
      actionable,
      hardInterrupt,
      routed,
      needsResponse: hardInterrupt,
      correlationId,
      escalationKind: hardInterrupt ? 'needs_decision' : null,
      seq: null,
      detail,
      payload: null,
      supersedes: null,
      runId: `run-${correlationId}`,
      taskId: `task-${correlationId}`,
      raisedBy: 'escalation-channel',
      raisedAt: 900,
    };
  }

  function seedReturns(card, returns) {
    let base = sg.get(`workflowCards/${card.id}`);
    sg.commit([{ op: 'set', path: `workflowCards/${card.id}`, value: {
      ...base, columnId: 'ready', metadata: { ...base.metadata, returns },
    } }], 'test:seed-returns', { durable: true });
  }

  function seedHardInterrupt(card, returns, escalation) {
    let base = sg.get(`workflowCards/${card.id}`);
    sg.commit([{ op: 'set', path: `workflowCards/${card.id}`, value: {
      ...base, columnId: 'ready', metadata: { ...base.metadata, returns, escalation },
    } }], 'test:seed-hard-interrupt', { durable: true });
  }

  it('an unconsumed hard-interrupt wakes a dependency-blocked card instead of re-parking it in dependency wait', async () => {
    // The card's own upstream edge is unsatisfied, but a blocked CHILD is asking this card a question
    // (hard interrupt). Deferring the answer until the unrelated upstream finishes would starve the
    // waiting child — the dependency-wait restore must yield to the hard interrupt.
    let ledger = makeLedgerProxy({ groupLimits: { impl: 5 } });
    let service = makeService(ledger.proxy);
    relaxBoardPreChecks(service);
    service.updateWorkflowBoard({ patch: { automation: { recovery: 'auto' } }, actor: 'test', reason: 'enable recovery' });
    let board = service.ensureBoard();

    let upstream = makeReadyCard(service, { title: 'slow-upstream', resourceGroup: 'impl' });
    let parent = service.createOrUpdateCard({
      title: 'blocked-parent',
      body: 'Waits on upstream, but its child needs an answer.',
      columnId: 'ready',
      projectId: 'agent-portal',
      domain: 'backend',
      owner: 'orchestrator',
      assignedAgent: 'backend-engineer',
      resourceGroup: 'impl',
      acceptanceCriteria: ['Answer the child'],
      dependsOn: [{ cardId: upstream.id, releaseWhen: 'card_done', onUpstreamFailure: 'block_and_escalate' }],
      actor: 'test',
    }).card;
    seedHardInterrupt(
      parent,
      [returnEvent({ kind: 'blocked', detail: 'child needs a decision', correlationId: parent.id, hardInterrupt: true })],
      undefined,
    );

    let result = await service.reconcileWorkflowEscalations({ boardId: board.id }, { proxyManager: ledger.proxy });

    assert.ok(
      !result.terminated.some(item => item.cardId === parent.id && item.kind === 'dependency_wait_restored'),
      'the hard interrupt is not silently re-parked as dependency wait',
    );
    assert.ok(
      result.reengaged.some(item => item.cardId === parent.id),
      'the card is re-engaged so the orchestrator can answer its child',
    );
  });

  it('a queued discovered return re-engages once on an auto board and stamps consumedAt (idempotent)', async () => {
    let ledger = makeLedgerProxy({ groupLimits: { impl: 5 } });
    let service = makeService(ledger.proxy);
    relaxBoardPreChecks(service);
    service.updateWorkflowBoard({ patch: { automation: { recovery: 'auto' } }, actor: 'test', reason: 'enable recovery' });
    let board = service.ensureBoard();

    let card = makeReadyCard(service, { title: 'discovered', resourceGroup: 'impl' });
    seedReturns(card, [returnEvent({ kind: 'discovered', detail: 'found a config to migrate', correlationId: card.id })]);

    let first = await service.reconcileWorkflowEscalations({ boardId: board.id }, { proxyManager: ledger.proxy });
    assert.equal(first.ok, true);
    assert.equal(first.reengaged.length, 1, 'the queued discovered return re-engaged the card once');
    assert.equal(first.reengaged[0].cardId, card.id);

    // The return is now consumedAt-stamped (delivered ⟺ consumed) — not deleted (history survives).
    let after = service.getCard(card.id);
    assert.equal(after.metadata.returns.length, 1, 'the return is marked, not deleted');
    assert.ok(after.metadata.returns[0].consumedAt, 'the actionable return is consumedAt-stamped');

    // A second drive must NOT re-engage — the consumed return no longer wakes the loop.
    let second = await service.reconcileWorkflowEscalations({ boardId: board.id }, { proxyManager: ledger.proxy });
    assert.equal(second.reengaged.length, 0, 'a consumed return does not re-engage again (idempotent wake)');
  });

  it('a self-completion terminal return does NOT re-engage its own card; a routed one does', async () => {
    let ledger = makeLedgerProxy({ groupLimits: { impl: 5 } });
    let service = makeService(ledger.proxy);
    relaxBoardPreChecks(service);
    service.updateWorkflowBoard({ patch: { automation: { recovery: 'auto' } }, actor: 'test', reason: 'enable recovery' });
    let board = service.ensureBoard();

    // A finished leaf carries its own `completed` terminal return — it must NOT re-orchestrate itself
    // (this is what stops a card cycling through the audit stage from churning on its own returns).
    let selfDone = makeReadyCard(service, { title: 'self-done', resourceGroup: 'impl' });
    seedReturns(selfDone, [returnEvent({ kind: 'completed', correlationId: selfDone.id, terminal: true })]);
    let r1 = await service.reconcileWorkflowEscalations({ boardId: board.id }, { proxyManager: ledger.proxy });
    assert.equal(r1.reengaged.length, 0, 'a bare self-completion terminal return is not a wake candidate');
    assert.ok(!service.getCard(selfDone.id).metadata.returns[0].consumedAt, 'and it is not consumed');

    // A routed completion (a join result delivered to the owner) MUST re-engage the owner.
    let owner = makeReadyCard(service, { title: 'join-owner', resourceGroup: 'impl' });
    seedReturns(owner, [returnEvent({ kind: 'completed', correlationId: owner.id, terminal: true, routed: true })]);
    let r2 = await service.reconcileWorkflowEscalations({ boardId: board.id }, { proxyManager: ledger.proxy });
    assert.equal(r2.reengaged.length, 1, 'a routed completion re-engages the owner');
    assert.equal(r2.reengaged[0].cardId, owner.id);
    assert.ok(service.getCard(owner.id).metadata.returns[0].consumedAt, 'the routed return is consumed once');
  });

  it('a dormant orchestrator resting in quality-audit is re-engaged out of it (governed rework)', async () => {
    let ledger = makeLedgerProxy({ groupLimits: { impl: 5 } });
    let service = makeService(ledger.proxy);
    relaxBoardPreChecks(service);
    service.updateWorkflowBoard({ patch: { automation: { recovery: 'auto' } }, actor: 'test', reason: 'enable recovery' });
    let board = service.ensureBoard();

    // A finished orchestrator rests in quality-audit (idle) carrying a routed join return to deliver, but
    // NO escalation and NO failed audit — the rework-to-ready edge would block without the daemon's
    // re-engagement authorization. The driver must still move it out of quality-audit to re-orchestrate.
    let owner = makeReadyCard(service, { title: 'dormant-owner', resourceGroup: 'impl' });
    let base = sg.get(`workflowCards/${owner.id}`);
    sg.commit([{ op: 'set', path: `workflowCards/${owner.id}`, value: {
      ...base, columnId: 'quality-audit', lifecycle: 'idle',
      metadata: { ...base.metadata, returns: [returnEvent({ kind: 'completed', correlationId: owner.id, terminal: true, routed: true })] },
    } }], 'test:seed-dormant', { durable: true });

    let r = await service.reconcileWorkflowEscalations({ boardId: board.id }, { proxyManager: ledger.proxy });
    assert.equal(r.reengaged.length, 1, 'the dormant orchestrator is re-engaged');
    assert.notEqual(service.getCard(owner.id).columnId, 'quality-audit', 'the governed rework moved it out of quality-audit to re-orchestrate');
  });

  it('a human/agent transition cannot self-authorize the rework edge (daemon-only flag)', () => {
    let ledger = makeLedgerProxy({ groupLimits: { impl: 5 } });
    let service = makeService(ledger.proxy);
    relaxBoardPreChecks(service);
    let card = makeReadyCard(service, { title: 'no-self-rework', resourceGroup: 'impl' });
    let base = sg.get(`workflowCards/${card.id}`);
    sg.commit([{ op: 'set', path: `workflowCards/${card.id}`, value: { ...base, columnId: 'quality-audit' } }], 'test:to-audit', { durable: true });

    // A caller-supplied reworkAuthorized from a non-daemon principal must be IGNORED — the service only
    // honors the flag for the daemon board-self-drive, so the backward rework stays governed and the
    // card does not move (blocked at the rework gate, or earlier at the transition capability).
    let res = service.requestWorkflowTransition({ cardId: card.id, toColumnId: 'ready', reason: 'try rework', reworkAuthorized: true });
    assert.notEqual(res.status, 'accepted', 'a non-daemon rework is never accepted');
    assert.equal(service.getCard(card.id).columnId, 'quality-audit', 'the card did not move');
  });

  it('a hard-interrupt return wakes regardless; a soft-only return is gated on returnWake', async () => {
    let ledger = makeLedgerProxy({ groupLimits: { impl: 5 } });
    let service = makeService(ledger.proxy);
    relaxBoardPreChecks(service);
    // Hold BOTH gates manual: the hard-interrupt must still wake (D4), the soft return must stay gated.
    service.updateWorkflowBoard({ patch: { automation: { recovery: 'manual', returnWake: 'manual' } }, actor: 'test', reason: 'manual gates' });
    let board = service.ensureBoard();
    assert.notEqual(board.automation?.returnWake, 'auto', 'precondition: returnWake is not auto');

    // A blocked child folds onto metadata.escalation (the mint does this), so hasActiveEscalation is
    // true AND the inbox carries an unconsumed hard-interrupt entry.
    let hard = makeReadyCard(service, { title: 'blocked-child', resourceGroup: 'impl' });
    seedHardInterrupt(
      hard,
      [returnEvent({ kind: 'blocked', detail: 'upstream API down', correlationId: hard.id, hardInterrupt: true })],
      {
        schema: 'workflow-escalation-state/v1',
        kind: 'needs_decision',
        detail: 'upstream API down',
        attemptCount: 0,
        nextAttemptAt: null,
        lastEscalation: { kind: 'needs_decision', detail: 'upstream API down' },
      },
    );

    // A soft-only return (discovered) — actionable but NOT a hard-interrupt — must stay returnWake-gated.
    let soft = makeReadyCard(service, { title: 'soft-discovered', resourceGroup: 'impl' });
    seedReturns(soft, [returnEvent({ kind: 'discovered', detail: 'noticed a TODO', correlationId: soft.id })]);

    let result = await service.reconcileWorkflowEscalations({ boardId: board.id }, { proxyManager: ledger.proxy });
    let reengagedIds = result.reengaged.map(item => item.cardId);
    assert.ok(reengagedIds.includes(hard.id), 'the hard-interrupt card wakes regardless of the gates');
    assert.ok(!reengagedIds.includes(soft.id), 'the soft-only return stays gated while returnWake is manual');

    // The soft card's return is left unconsumed (it was never delivered) — it retries when returnWake flips.
    assert.ok(!service.getCard(soft.id).metadata.returns[0].consumedAt, 'an undelivered soft return stays unconsumed');
    assert.ok(service.getCard(hard.id).metadata.returns[0].consumedAt, 'the delivered hard-interrupt return is consumed');
  });

  it('a soft return wakes the orchestrator with recovery held manual (returnWake is independent)', async () => {
    let ledger = makeLedgerProxy({ groupLimits: { impl: 5 } });
    let service = makeService(ledger.proxy);
    relaxBoardPreChecks(service);
    // Operator-held recovery (explicit manual on the autonomous board): the return loop must STILL
    // wake a dormant orchestrator out of the box — returnWake is independent of recovery.
    service.updateWorkflowBoard({ patch: { automation: { recovery: 'manual' } }, actor: 'test', reason: 'hold recovery' });
    let board = service.ensureBoard();
    assert.equal(board.automation?.recovery, 'manual', 'precondition: recovery held manual');
    assert.equal(board.automation?.returnWake, 'auto', 'precondition: default returnWake is auto');

    let owner = makeReadyCard(service, { title: 'returnwake-owner', resourceGroup: 'impl' });
    seedReturns(owner, [returnEvent({ kind: 'discovered', detail: 'a finding to route', correlationId: owner.id })]);
    let r = await service.reconcileWorkflowEscalations({ boardId: board.id }, { proxyManager: ledger.proxy });
    assert.equal(r.reengaged.length, 1, 'a soft return wakes via returnWake=auto without recovery=auto');
    assert.equal(r.reengaged[0].cardId, owner.id);
    assert.ok(service.getCard(owner.id).metadata.returns[0].consumedAt, 'the soft return is consumed on delivery');
  });

  it('a progress-only card (no actionable return) is never a driver candidate', async () => {
    let ledger = makeLedgerProxy({ groupLimits: { impl: 5 } });
    let service = makeService(ledger.proxy);
    relaxBoardPreChecks(service);
    service.updateWorkflowBoard({ patch: { automation: { recovery: 'auto' } }, actor: 'test', reason: 'enable recovery' });
    let board = service.ensureBoard();

    let card = makeReadyCard(service, { title: 'progress', resourceGroup: 'impl' });
    seedReturns(card, [returnEvent({ kind: 'progress', detail: 'halfway', correlationId: card.id, actionable: false })]);

    let result = await service.reconcileWorkflowEscalations({ boardId: board.id }, { proxyManager: ledger.proxy });
    assert.equal(result.reengaged.length, 0, 'a coalesce-only progress return never wakes the loop');
    assert.ok(!service.getCard(card.id).metadata.returns[0].consumedAt, 'a non-actionable return is never consumed');
  });

  it('the re-engagement reason carries a compact batch of the queued returns (newest first)', async () => {
    let ledger = makeLedgerProxy({ groupLimits: { impl: 5 } });
    let service = makeService(ledger.proxy);
    relaxBoardPreChecks(service);
    service.updateWorkflowBoard({ patch: { automation: { recovery: 'auto' } }, actor: 'test', reason: 'enable recovery' });
    let board = service.ensureBoard();

    // Capture the reason the driver hands to the orchestrator: the delegate stub records every
    // agent-pool call payload, and prepareDelegateTaskCall threads the re-engagement reason into it.
    let card = makeReadyCard(service, { title: 'batch', resourceGroup: 'impl' });
    seedReturns(card, [
      returnEvent({ kind: 'discovered', detail: 'first finding', correlationId: card.id }),
      returnEvent({ kind: 'needs_context', detail: 'which schema version?', correlationId: card.id }),
    ]);

    let result = await service.reconcileWorkflowEscalations({ boardId: board.id }, { proxyManager: ledger.proxy });
    assert.equal(result.reengaged.length, 1, 'the card with queued returns re-engaged');

    let delegateCall = ledger.calls.find(call => call.server === 'agent-pool' && call.payload?.name === 'delegate_task');
    assert.ok(delegateCall, 'the re-engagement reached the agent-pool delegate');
    let promptText = JSON.stringify(delegateCall.payload.arguments ?? {});
    assert.match(promptText, /Queued returns/, 'the delegate payload carries the queued-return batch summary');
    assert.match(promptText, /needs_context: which schema version\?/, 'the newest return appears first in the batch');
    assert.match(promptText, /discovered: first finding/, 'the older return is also summarized');
  });

  it('single-flight: a card with an active run is not re-engaged, and backoff is respected', async () => {
    let ledger = makeLedgerProxy({ groupLimits: { impl: 5 } });
    let service = makeService(ledger.proxy);
    relaxBoardPreChecks(service);
    service.updateWorkflowBoard({ patch: { automation: { recovery: 'auto' } }, actor: 'test', reason: 'enable recovery' });
    let board = service.ensureBoard();

    // activeRunForCard guard: a card with a live (requested) run is not re-engaged even with a return.
    let busy = makeReadyCard(service, { title: 'busy', resourceGroup: 'impl' });
    sg.commit([{ op: 'set', path: 'workflowRuns/run-busy', value: {
      schema: 'workflow-run/v1', id: 'run-busy', boardId: board.id, cardId: busy.id,
      status: 'requested', taskIds: [], startedAt: 900, updatedAt: 901,
    } }], 'test:seed-active-run', { durable: true });
    seedReturns(busy, [returnEvent({ kind: 'discovered', detail: 'noticed', correlationId: busy.id })]);

    // nextAttemptAt backoff guard: an escalation whose backoff window is in the future is skipped, and
    // its co-located return stays unconsumed (consumed ⟺ delivered).
    let backoff = makeReadyCard(service, { title: 'backoff', resourceGroup: 'impl' });
    seedHardInterrupt(
      backoff,
      [returnEvent({ kind: 'discovered', detail: 'later', correlationId: backoff.id })],
      {
        schema: 'workflow-escalation-state/v1',
        kind: 'rework',
        detail: 'needs rework',
        attemptCount: 1,
        nextAttemptAt: now + 1_000_000, // far in the future relative to the service clock
        lastEscalation: { kind: 'rework', detail: 'needs rework' },
      },
    );

    let result = await service.reconcileWorkflowEscalations({ boardId: board.id }, { proxyManager: ledger.proxy });
    let reengagedIds = result.reengaged.map(item => item.cardId);
    assert.ok(!reengagedIds.includes(busy.id), 'a card with an active run is not re-engaged (single-flight)');
    assert.ok(!reengagedIds.includes(backoff.id), 'a card in backoff is not re-engaged (backoff respected)');
    assert.ok(!service.getCard(busy.id).metadata.returns[0].consumedAt, 'the active-run card return stays unconsumed');
    assert.ok(!service.getCard(backoff.id).metadata.returns[0].consumedAt, 'the backoff card return stays unconsumed');
  });

  it('a concurrent human reply on a later card survives a still-in-flight earlier re-engagement', async () => {
    // The driver `await`s a re-engagement dispatch per candidate card, one at a time. While card A's
    // dispatch is in flight, a human can reply to card B (independently changing B's escalation/comments).
    // The driver must pick up B fresh when its turn comes — not the pre-loop snapshot — or it would
    // silently clobber the human's reply with stale data (A11).
    let gateReleased = null;
    let gate = new Promise((resolve) => { gateReleased = resolve; });
    let sawFirstDelegate = false;
    let ledger = makeLedgerProxy({ groupLimits: { impl: 5 } });
    let baseProxy = ledger.proxy;
    let proxy = {
      ...baseProxy,
      requestFromChild: async (server, method, payload) => {
        if (server === 'agent-pool' && payload?.name === 'delegate_task' && !sawFirstDelegate) {
          sawFirstDelegate = true;
          await gate; // pause the FIRST card's dispatch until the test resolves it below
        }
        return baseProxy.requestFromChild(server, method, payload);
      },
    };
    let service = makeService(proxy);
    relaxBoardPreChecks(service);
    service.updateWorkflowBoard({ patch: { automation: { recovery: 'auto' } }, actor: 'test', reason: 'enable recovery' });
    let board = service.ensureBoard();

    let cardA = makeReadyCard(service, { title: 'card-a', resourceGroup: 'impl' });
    seedReturns(cardA, [returnEvent({ kind: 'discovered', detail: 'a', correlationId: cardA.id })]);
    let cardB = makeReadyCard(service, { title: 'card-b', resourceGroup: 'impl' });
    seedReturns(cardB, [returnEvent({ kind: 'discovered', detail: 'b', correlationId: cardB.id })]);

    let driven = service.reconcileWorkflowEscalations({ boardId: board.id }, { proxyManager: proxy });

    // Card A's dispatch is now parked on the gate. While it is in flight, a human comments on card B —
    // simulating a concurrent write landing on a card still waiting in this pass's candidate list.
    while (!sawFirstDelegate) await new Promise((resolve) => setImmediate(resolve));
    let humanComment = service.addCardComment({ cardId: cardB.id, body: 'Please hold off, I am checking this.' });
    assert.equal(humanComment.ok, true);
    let bVersionAfterComment = service.getCard(cardB.id).version;

    gateReleased();
    let result = await driven;
    assert.equal(result.ok, true);
    assert.equal(result.reengaged.length, 2, 'both cards were re-engaged');

    // Card B's re-engagement commit must have been derived from the POST-comment version, not the
    // pre-loop snapshot — so the human's comment is still on the card afterward.
    let finalB = service.getCard(cardB.id);
    assert.ok(finalB.version > bVersionAfterComment, 'card B advanced past the comment (accrual commit landed after it)');
    assert.equal(finalB.metadata.comments?.at(-1)?.body, 'Please hold off, I am checking this.', 'the concurrent human comment was not clobbered');
  });

  it('AU06: a non-resolving human reply wakes the orchestrator once, without accruing an escalation attempt', async () => {
    let ledger = makeLedgerProxy({ groupLimits: { impl: 5 } });
    let service = makeService(ledger.proxy);
    relaxBoardPreChecks(service);
    service.updateWorkflowBoard({ patch: { automation: { recovery: 'auto', returnWake: 'auto' } }, actor: 'test', reason: 'auto' });
    let board = service.ensureBoard();
    let card = makeReadyCard(service, { title: 'ask-a-human', resourceGroup: 'impl' });
    let base = sg.get(`workflowCards/${card.id}`);
    sg.commit([{ op: 'set', path: `workflowCards/${card.id}`, value: {
      ...base, metadata: { ...base.metadata, escalation: {
        schema: 'workflow-escalation-state/v1', kind: 'needs_human', detail: 'Which provider?', attemptCount: 0,
      } },
    } }], 'seed-needs-human', { durable: true });

    // A parked needs_human card is not auto re-engaged on its own.
    let idle = await service.reconcileWorkflowEscalations({ boardId: board.id }, { proxyManager: ledger.proxy });
    assert.equal(idle.reengaged.some(r => r.cardId === card.id), false, 'the board does not auto re-engage a needs_human park');

    // The person replies WITHOUT closing the decision — this must still wake the orchestrator once.
    let reply = service.replyToCard({ cardId: card.id, body: 'Here is the extra context you asked for.', resolve: false });
    assert.equal(reply.ok, true);
    assert.equal(reply.resolved, false);

    let woke = await service.reconcileWorkflowEscalations({ boardId: board.id }, { proxyManager: ledger.proxy });
    assert.equal(woke.reengaged.some(r => r.cardId === card.id), true, 'the human reply wakes the orchestrator');
    let after = service.getCard(card.id);
    assert.ok(after.metadata.escalation, 'the escalation survives a non-resolving reply');
    assert.equal(after.metadata.escalation.attemptCount ?? 0, 0, 'a human reply does not accrue an escalation attempt');

    // Idempotent: the consumed reply does not re-wake on the next pass.
    let again = await service.reconcileWorkflowEscalations({ boardId: board.id }, { proxyManager: ledger.proxy });
    assert.equal(again.reengaged.some(r => r.cardId === card.id), false, 'a consumed human reply does not re-wake');
  });

  it('AU05: a card parked in the decision lane is neither auto-yanked nor auto-rejected', async () => {
    let ledger = makeLedgerProxy({ groupLimits: { impl: 5 } });
    let service = makeService(ledger.proxy);
    relaxBoardPreChecks(service);
    service.updateWorkflowBoard({ patch: { automation: { recovery: 'auto' } }, actor: 'test', reason: 'auto' });
    let board = service.ensureBoard();
    let card = makeReadyCard(service, { title: 'parked-conflict', resourceGroup: 'impl' });
    let base = sg.get(`workflowCards/${card.id}`);
    // Board-parked in the decision lane (e.g. a merge conflict) with an attempt count already past the
    // reject ceiling — before the fix the driver would yank it back to ready and then reject it.
    sg.commit([{ op: 'set', path: `workflowCards/${card.id}`, value: {
      ...base, columnId: 'needs-decision', lifecycle: 'idle', metadata: { ...base.metadata, escalation: {
        schema: 'workflow-escalation-state/v1', kind: 'needs_decision', detail: 'Merge conflict — human to resolve.',
        attemptCount: 6, nextAttemptAt: 0,
      } },
    } }], 'seed-parked', { durable: true });

    let res = await service.reconcileWorkflowEscalations({ boardId: board.id }, { proxyManager: ledger.proxy });
    let after = service.getCard(card.id);
    assert.equal(after.columnId, 'needs-decision', 'the parked card stays in the decision lane');
    assert.equal(res.reengaged.some(r => r.cardId === card.id), false, 'it is not yanked back to ready');
    assert.equal((res.terminated ?? []).some(r => r.cardId === card.id), false, 'it is not auto-rejected at the attempt ceiling');
    assert.notEqual(after.columnId, 'rejected');
  });

  it('AU03: a routed return on a decomposition-closed (done) parent is not churned nor consumed-and-dropped', async () => {
    let ledger = makeLedgerProxy({ groupLimits: { impl: 5 } });
    let service = makeService(ledger.proxy);
    relaxBoardPreChecks(service);
    service.updateWorkflowBoard({ patch: { automation: { recovery: 'auto' } }, actor: 'test', reason: 'auto' });
    let board = service.ensureBoard();
    let parent = makeReadyCard(service, { title: 'closed-parent', resourceGroup: 'impl' });
    let base = sg.get(`workflowCards/${parent.id}`);
    sg.commit([{ op: 'set', path: `workflowCards/${parent.id}`, value: {
      ...base, columnId: 'done', lifecycle: 'idle',
      metadata: { ...base.metadata, returns: [returnEvent({ kind: 'completed', correlationId: parent.id, terminal: true, routed: true })] },
    } }], 'seed-done-parent', { durable: true });

    let res = await service.reconcileWorkflowEscalations({ boardId: board.id }, { proxyManager: ledger.proxy });
    assert.equal(res.reengaged.some(r => r.cardId === parent.id), false, 'a done parent is not a re-engagement candidate');
    let after = service.getCard(parent.id);
    assert.equal(after.columnId, 'done', 'the parent stays done (its children carry the work)');
    assert.ok(!after.metadata.returns[0].consumedAt, 'the routed return is not consumed-and-dropped — it survives in history');
  });

  it('AU10: a paused board neither accrues escalation attempts nor auto-rejects', async () => {
    let ledger = makeLedgerProxy({ groupLimits: { impl: 5 } });
    let service = makeService(ledger.proxy);
    relaxBoardPreChecks(service);
    let board = service.ensureBoard();
    let card = makeReadyCard(service, { title: 'paused-escalated', resourceGroup: 'impl' });
    let base = sg.get(`workflowCards/${card.id}`);
    // An escalated card one accrual short of the reject ceiling.
    sg.commit([{ op: 'set', path: `workflowCards/${card.id}`, value: {
      ...base, metadata: { ...base.metadata, escalation: {
        schema: 'workflow-escalation-state/v1', kind: 'rework', detail: 'needs rework', attemptCount: 5, nextAttemptAt: 0,
      } },
    } }], 'seed-escalated', { durable: true });
    // Pause the board (e.g. a budget-breaker trip).
    service.updateWorkflowBoard({ patch: { mode: 'paused' }, actor: 'test', reason: 'breaker' });

    let res = await service.reconcileWorkflowEscalations({ boardId: board.id }, { proxyManager: ledger.proxy });
    assert.equal(res.skipped, true, 'the driver is a no-op on a paused board');
    let after = service.getCard(card.id);
    assert.equal(after.metadata.escalation.attemptCount, 5, 'no attempt accrued while paused');
    assert.notEqual(after.columnId, 'rejected', 'the escalated card is NOT auto-rejected while paused');
  });

  it('AU04: a return-only wake whose dispatch is blocked keeps its return unconsumed (retries, not lost)', async () => {
    let ledger = makeLedgerProxy({ groupLimits: { impl: 5 } });
    let service = makeService(ledger.proxy);
    relaxBoardPreChecks(service);
    service.updateWorkflowBoard({ patch: { automation: { recovery: 'auto', returnWake: 'auto' } }, actor: 'test', reason: 'auto' });
    let board = service.ensureBoard();
    // A card parked in commit-publish (there is no commit-publish -> ready edge), carrying a queued
    // wake-driving return. The driver tries to route it to `ready`, the transition is blocked, so the
    // dispatch does not deliver — the return must NOT be consumed-and-dropped.
    let card = makeReadyCard(service, { title: 'blocked-dispatch', resourceGroup: 'impl' });
    let base = sg.get(`workflowCards/${card.id}`);
    sg.commit([{ op: 'set', path: `workflowCards/${card.id}`, value: {
      ...base, columnId: 'commit-publish', lifecycle: 'idle',
      metadata: { ...base.metadata, returns: [returnEvent({ kind: 'discovered', detail: 'found work', correlationId: card.id })] },
    } }], 'seed-blocked-dispatch', { durable: true });

    let res = await service.reconcileWorkflowEscalations({ boardId: board.id }, { proxyManager: ledger.proxy });
    let entry = res.reengaged.find(r => r.cardId === card.id);
    assert.ok(entry && entry.ok === false, 'the dispatch was attempted but the transition was blocked');
    let after = service.getCard(card.id);
    assert.ok(!after.metadata.returns[0].consumedAt, 'consumed==delivered: an undelivered wake stays unconsumed to retry');
  });
});
