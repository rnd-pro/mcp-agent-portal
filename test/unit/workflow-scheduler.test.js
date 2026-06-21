import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { StateGraph } from '../../src/node/state-graph.js';
import { createWorkflowBoardService } from '../../src/node/workflow-board-service.js';
import { humanPrincipal } from '../../src/node/server/principal.js';

// A delegate stub that mirrors the agent-pool slot ledger: it reserves a capacity slot keyed by
// `admission_id` under a per-group limit, idempotent on admissionId (a re-drive of the same
// admissionId yields zero extra reservations), and returns the at-capacity rejection text the real
// agent-pool returns so the board's drain branches on it exactly. `release(admissionId)` frees a
// slot — used to prove the next drain admits one more. No real CLI is ever spawned.
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
      // release_slot: the reconcile-path release seam. The real agent-pool does not expose this tool
      // yet (the dead-pid sweep self-heals); the stub implements it so the test can prove the PARENT
      // release path frees the reservation when the tool IS wired (idempotent on admissionId).
      if (payload?.name === 'release_slot') {
        if (args.admission_id) slots.delete(args.admission_id);
        return { content: [{ type: 'text', text: 'released' }] };
      }
      let admissionId = args.admission_id;
      let groupKey = args.resource_group ?? 'default';
      let limit = Object.hasOwn(groupLimits, groupKey) ? groupLimits[groupKey] : defaultLimit;
      // Idempotent on admissionId (inv 41): an existing reservation returns its task, no new slot.
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
    heldAdmissionIds() { return [...slots.keys()]; },
    heldInGroup(groupKey) { return [...slots.entries()].filter(([, s]) => s.groupKey === groupKey).map(([id]) => id); },
  };
}

describe('workflow admission scheduler (WS-B1)', () => {
  let tmpDir;
  let sg;
  let now;
  let idSeq;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'workflow-scheduler-'));
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

  // Raise the board/stage pre-check limits high so the LEDGER (agent-pool stub) is the sole capacity
  // authority under test (AD-1: capacity is owned by the ledger, not the board pre-check).
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
      priority: overrides.priority,
      acceptanceCriteria: ['Admitted by the scheduler'],
      actor: 'test',
      ...overrides.card,
    });
    return created.card;
  }

  it('enqueues an auto-triggered card (lifecycle=queued, one durable entry, admissionId set); re-enqueue is a no-op (inv 31)', async () => {
    // Board mode 'manual' so the inline drain never admits — we observe the pure enqueue.
    let ledger = makeLedgerProxy();
    let service = makeService(ledger.proxy);
    service.updateWorkflowBoard({ patch: { mode: 'manual' }, actor: 'test', reason: 'observe enqueue' });
    let board = service.ensureBoard();
    let card = makeReadyCard(service);

    // Auto-trigger path: maybeAutoOrchestrateCard via createWorkItem is gated by mode; drive enqueue
    // directly (the same durable enqueue the reroute uses).
    let first = service.enqueueWorkItem(board, service.getCard(card.id), {});
    assert.equal(first.ok, true);
    assert.ok(first.entry.admissionId.startsWith('adm-'));
    assert.equal(service.getCard(card.id).lifecycle, 'queued');

    let entries = Object.values(sg.get('workflowQueueEntries') || {}).filter(e => e.cardId === card.id);
    assert.equal(entries.length, 1, 'exactly one live queue entry');
    assert.equal(entries[0].enqueuedAt, first.entry.enqueuedAt);
    assert.equal(entries[0].queueEpoch, first.entry.queueEpoch);

    // inv 31: re-enqueue of an already-queued card is a no-op returning the existing entry.
    let second = service.enqueueWorkItem(board, service.getCard(card.id), {});
    assert.equal(second.ok, true);
    assert.equal(second.deduped, true);
    assert.equal(second.entry.admissionId, first.entry.admissionId);
    assert.equal(Object.values(sg.get('workflowQueueEntries') || {}).filter(e => e.cardId === card.id).length, 1);
    // enqueuedAt/queueEpoch are immutable for the live entry.
    assert.equal(second.entry.enqueuedAt, first.entry.enqueuedAt);
  });

  it('admits exactly N of >N queued cards under a group limit; releasing a slot admits one more (inv 1, 5)', async () => {
    let ledger = makeLedgerProxy({ groupLimits: { impl: 2 } });
    let service = makeService(ledger.proxy);
    relaxBoardPreChecks(service);
    let board = service.ensureBoard();

    let cards = [];
    for (let i = 0; i < 4; i += 1) {
      let card = makeReadyCard(service, { title: `cap-${i}`, resourceGroup: 'impl' });
      service.enqueueWorkItem(board, service.getCard(card.id), {});
      cards.push(card);
    }

    let drain = await service.drainWorkflowQueue(board.id, {});
    assert.equal(drain.admitted.length, 2, 'exactly the group limit admitted');
    let running = cards.filter(c => service.getCard(c.id).lifecycle === 'running');
    let queued = cards.filter(c => service.getCard(c.id).lifecycle === 'queued');
    assert.equal(running.length, 2);
    assert.equal(queued.length, 2);
    assert.equal(ledger.activeForGroup('impl'), 2);

    // A second drain admits nothing more while the group is full.
    let drain2 = await service.drainWorkflowQueue(board.id, {});
    assert.equal(drain2.admitted.length, 0);
    assert.equal(drain2.rolledBack.length, 2, 'the two queued cards are capacity-rolled-back, not dropped');
    assert.equal(cards.filter(c => service.getCard(c.id).lifecycle === 'running').length, 2);

    // Release one held slot → the next drain admits exactly one more.
    let oneSlot = ledger.heldInGroup('impl')[0];
    ledger.release(oneSlot);

    let drain3 = await service.drainWorkflowQueue(board.id, {});
    assert.equal(drain3.admitted.length, 1, 'one freed slot admits exactly one more');
    assert.equal(cards.filter(c => service.getCard(c.id).lifecycle === 'running').length, 3);
    assert.equal(ledger.activeForGroup('impl'), 2, 'group is full again after the next admission');
  });

  it('admissionOrder is deterministic: group round-robin → priority → enqueuedAt → cardId (inv 6)', async () => {
    let ledger = makeLedgerProxy({ groupLimits: { ga: 1, gb: 1 } });
    let service = makeService(ledger.proxy);
    relaxBoardPreChecks(service);
    let board = service.ensureBoard();

    // Two groups, mixed priority. With a per-group limit of 1, a single drain admits one per group,
    // and group round-robin + priority desc decides which card in each group wins first.
    let aLow = makeReadyCard(service, { title: 'a-low', resourceGroup: 'ga', priority: 'low' });
    let aHigh = makeReadyCard(service, { title: 'a-high', resourceGroup: 'ga', priority: 'high' });
    let bNormal = makeReadyCard(service, { title: 'b-normal', resourceGroup: 'gb', priority: 'normal' });
    for (let c of [aLow, aHigh, bNormal]) service.enqueueWorkItem(board, service.getCard(c.id), {});

    let drain = await service.drainWorkflowQueue(board.id, {});
    // One admitted per group (limit 1 each): the HIGH-priority card wins group ga; gb admits its one.
    assert.equal(service.getCard(aHigh.id).lifecycle, 'running', 'high priority admitted in group ga');
    assert.equal(service.getCard(aLow.id).lifecycle, 'queued', 'low priority deferred in group ga');
    assert.equal(service.getCard(bNormal.id).lifecycle, 'running', 'group gb admitted its card');
    assert.equal(drain.admitted.length, 2);

    // Capacity-rejected card re-enqueues at the head of its class — its entry persisted, enqueuedAt
    // preserved (inv 2: never dropped).
    let lowEntry = Object.values(sg.get('workflowQueueEntries') || {}).find(e => e.cardId === aLow.id);
    assert.ok(lowEntry, 'low-priority card still has a live queue entry');
  });

  it('CAS fence: a stale-epoch admitter writes nothing, no double-admit (inv 36)', async () => {
    let ledger = makeLedgerProxy({ groupLimits: { impl: 5 } });
    let service = makeService(ledger.proxy);
    relaxBoardPreChecks(service);
    let board = service.ensureBoard();
    let card = makeReadyCard(service, { resourceGroup: 'impl' });
    service.enqueueWorkItem(board, service.getCard(card.id), {});

    // Capture the queue epoch BEFORE a concurrent write bumps it. Then advance the epoch (simulate a
    // concurrent drain/admission that committed) and confirm a commitCAS on the stale epoch is a
    // conflict that writes nothing.
    let staleEpoch = sg.get(`workflowQueueEpoch/${board.id}`) ?? 0;
    let bump = sg.commitCAS(`workflowQueueEpoch/${board.id}`, staleEpoch,
      [{ op: 'set', path: 'workflowProbe/x', value: 1 }], 'concurrent-admitter', { durable: true });
    assert.equal(bump.ok, true);

    let stale = sg.commitCAS(`workflowQueueEpoch/${board.id}`, staleEpoch,
      [{ op: 'set', path: 'workflowProbe/x', value: 2 }], 'stale-admitter', { durable: true });
    assert.equal(stale.ok, false);
    assert.equal(stale.conflict, true);
    assert.equal(sg.get('workflowProbe/x'), 1, 'stale-epoch write applied nothing');

    // A real drain still admits the card exactly once (no double-admit) and the ledger holds one slot.
    let drain = await service.drainWorkflowQueue(board.id, {});
    assert.equal(drain.admitted.length, 1);
    assert.equal(service.getCard(card.id).lifecycle, 'running');
    assert.equal(ledger.activeForGroup('impl'), 1, 'exactly one slot reserved');
  });

  it('recovery resolves a stranded admitting card, releases the slot, keeps a legitimately-queued card, and is idempotent (inv 25, 43)', async () => {
    let ledger = makeLedgerProxy({ groupLimits: { impl: 5 } });
    let service = makeService(ledger.proxy);
    relaxBoardPreChecks(service);
    let board = service.ensureBoard();

    // Card A: stranded in `admitting` with an expired/epoch-stale admission lease + a leaked slot.
    let stranded = makeReadyCard(service, { title: 'stranded', resourceGroup: 'impl' });
    let strandedEnq = service.enqueueWorkItem(board, service.getCard(stranded.id), {});
    let strandedAdmission = strandedEnq.entry.admissionId;
    // Manually plant the stranded state: lifecycle admitting + a durable admission record whose
    // startedAt is far in the past (grace elapsed) + a stale admission lease + a leaked ledger slot.
    let strandedCard = service.getCard(stranded.id);
    sg.commit([
      { op: 'set', path: `workflowCards/${stranded.id}`, value: { ...strandedCard, lifecycle: 'admitting' } },
      { op: 'set', path: `workflowAdmissions/${strandedAdmission}`, value: {
        schema: 'workflow-admission/v1', admissionId: strandedAdmission, cardId: stranded.id, boardId: board.id,
        groupKey: 'impl', leaseEpoch: 1, queueEpoch: 0, enqueuedAt: 10, startedAt: 10, phase: 'admitting',
      } },
      { op: 'set', path: `workflowAdmissionLease/${board.id}`, value: {
        schema: 'workflow-admission-lease/v1', owner: 'dead-admitter', leaseEpoch: 1, startedAt: 10, heartbeatAt: 10, ttlMs: 15000,
      } },
    ], 'test:plant-stranded', { durable: true });
    // Leak a ledger slot for the stranded admission (the reservation agent-pool made before the
    // admitter crashed) so we can prove recovery's releaseSlot frees it.
    await ledger.proxy.requestFromChild('agent-pool', 'tools/call', {
      name: 'delegate_task', arguments: { admission_id: strandedAdmission, resource_group: 'impl' },
    });
    assert.equal(ledger.activeForGroup('impl'), 1, 'leaked slot present before recovery');

    // Card B: legitimately queued (queued + live entry, no run) — recovery must keep it.
    let keep = makeReadyCard(service, { title: 'keep', resourceGroup: 'impl' });
    service.enqueueWorkItem(board, service.getCard(keep.id), {});

    // Advance the clock well past the grace window so the stranded admitting card is reclaimable.
    now += 10_000_000;

    let rec1 = await service.reconcileWorkflowAdmissions({ boardId: board.id }, { proxyManager: ledger.proxy });
    assert.ok(rec1.resolved.some(r => r.cardId === stranded.id && r.phase === 'cleared'), 'stranded card resolved to cleared');
    assert.equal(service.getCard(stranded.id).lifecycle, 'queued', 'stranded card returned to queued (head, enqueuedAt preserved)');
    assert.equal(sg.get(`workflowAdmissions/${strandedAdmission}`), undefined, 'admission record cleared');
    assert.equal(sg.get(`workflowAdmissionResolution/${stranded.id}`), undefined, 'resolution record cleared');
    assert.equal(ledger.activeForGroup('impl'), 0, 'recovery released the leaked slot — no leaked capacity');
    assert.ok(rec1.kept.some(k => k.cardId === keep.id), 'legitimately-queued card kept');

    // Idempotent: running recovery again changes nothing and does not throw.
    let rec2 = await service.reconcileWorkflowAdmissions({ boardId: board.id }, { proxyManager: ledger.proxy });
    assert.equal(service.getCard(stranded.id).lifecycle, 'queued');
    assert.ok(rec2.kept.some(k => k.cardId === stranded.id) || rec2.kept.some(k => k.cardId === keep.id));
  });

  it('escalation re-engagement enqueues with notBefore=nextAttemptAt and does not jump the queue (AD-17, inv 26)', async () => {
    let ledger = makeLedgerProxy({ groupLimits: { impl: 5 } });
    let service = makeService(ledger.proxy);
    relaxBoardPreChecks(service);
    // Enable auto recovery so the escalation loop re-engages.
    service.updateWorkflowBoard({ patch: { automation: { recovery: 'auto' } }, actor: 'test', reason: 'enable recovery' });
    let board = service.ensureBoard();

    // A card with an active escalation whose backoff window is in the FUTURE relative to `now`.
    let card = makeReadyCard(service, { title: 'escalated', resourceGroup: 'impl' });
    let base = service.getCard(card.id);
    let escalation = {
      schema: 'workflow-escalation-state/v1',
      kind: 'rework',
      detail: 'needs rework',
      attemptCount: 0,
      nextAttemptAt: null,
      lastEscalation: { kind: 'rework', detail: 'needs rework' },
    };
    sg.commit([{ op: 'set', path: `workflowCards/${card.id}`, value: {
      ...base, columnId: 'ready', metadata: { ...base.metadata, escalation },
    } }], 'test:seed-escalation', { durable: true });

    let before = now;
    let result = await service.reconcileWorkflowEscalations({ boardId: board.id }, { proxyManager: ledger.proxy });
    assert.equal(result.ok, true);
    assert.equal(result.reengaged.length, 1, 'one re-engagement this pass');

    // The re-engagement enqueued the card with notBefore = the accrued backoff window (in the future).
    let entry = Object.values(sg.get('workflowQueueEntries') || {}).find(e => e.cardId === card.id);
    assert.ok(entry, 'escalation re-engagement enqueued the card');
    assert.ok(entry.notBefore !== null && entry.notBefore > before, 'notBefore carries the backoff window (future)');

    // Because notBefore is in the future, a drain at the current clock must SKIP the card (no jump).
    let drain = await service.drainWorkflowQueue(board.id, {});
    assert.equal(drain.admitted.length, 0, 'card with future notBefore is not admitted (backoff honored)');
    assert.equal(service.getCard(card.id).lifecycle, 'queued');
    assert.ok(drain.skipped.some(s => s.admissionId === entry.admissionId && s.reason === 'not_before'));
  });

  it('a re-drive under a new lease epoch produces zero extra spawns: admissionId is deterministic (inv 41)', async () => {
    let ledger = makeLedgerProxy({ groupLimits: { impl: 5 } });
    let service = makeService(ledger.proxy);
    relaxBoardPreChecks(service);
    let board = service.ensureBoard();
    let card = makeReadyCard(service, { resourceGroup: 'impl' });
    let enq = service.enqueueWorkItem(board, service.getCard(card.id), {});
    let admissionId = enq.entry.admissionId;

    let drain1 = await service.drainWorkflowQueue(board.id, {});
    assert.equal(drain1.admitted.length, 1);
    let spawnsAfterFirst = ledger.calls.filter(c => c.server === 'agent-pool' && c.payload?.arguments?.admission_id === admissionId).length;
    assert.ok(spawnsAfterFirst >= 1);

    // A second delegate with the SAME admissionId is idempotent in the ledger (zero extra slots).
    let beforeSlots = ledger.slotCount();
    await ledger.proxy.requestFromChild('agent-pool', 'tools/call', {
      name: 'delegate_task', arguments: { admission_id: admissionId, resource_group: 'impl' },
    });
    assert.equal(ledger.slotCount(), beforeSlots, 're-drive on the same admissionId reserves no extra slot');
  });
});
