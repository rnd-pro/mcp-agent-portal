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

  // F-SCH-1 regression: an idempotent existing ACTIVE run (orchestrateWorkItem returns
  // { ok:true, idempotent:true, run } when activeRunForCard finds a `requested`/`recovering`/`running`
  // run) must be treated as GRANTED. Pre-fix, a `requested` run gave granted=false + slotRejected=false
  // → the hard-failure branch deleted the entry+record and stranded the card in `admitting` forever
  // (recovery could not see it). Post-fix the card promotes to `running` via the idempotent grant.
  it('promotes (not strands) a card whose orchestrate returns an idempotent existing requested run (F-SCH-1)', async () => {
    let ledger = makeLedgerProxy({ groupLimits: { impl: 5 } });
    let service = makeService(ledger.proxy);
    relaxBoardPreChecks(service);
    let board = service.ensureBoard();
    let card = makeReadyCard(service, { resourceGroup: 'impl' });

    // Seed a pre-existing ACTIVE (requested) run so activeRunForCard short-circuits orchestrate into
    // the idempotent path with a non-`running` run.
    sg.commit([{ op: 'set', path: 'workflowRuns/run-pre', value: {
      schema: 'workflow-run/v1', id: 'run-pre', boardId: board.id, cardId: card.id,
      status: 'requested', taskIds: [], startedAt: 900, updatedAt: 901,
    } }], 'test:seed-requested', { durable: true });

    service.enqueueWorkItem(board, service.getCard(card.id), {});
    let drain = await service.drainWorkflowQueue(board.id, {});

    assert.notEqual(service.getCard(card.id).lifecycle, 'admitting', 'card is not stranded in admitting');
    assert.equal(service.getCard(card.id).lifecycle, 'running', 'idempotent active run is granted → running');
    assert.ok(drain.admitted.some(item => item.cardId === card.id), 'the idempotent grant counts as admitted');
    // The queue entry + admission record are dropped now that running is durable.
    assert.equal(Object.values(sg.get('workflowQueueEntries') || {}).filter(e => e.cardId === card.id).length, 0);
  });

  // F-SCH-2 regression: a hard (non-capacity) delegation failure must RELEASE the reserved ledger slot
  // before deleting the admission record. Pre-fix the record was deleted without releasing the slot,
  // orphaning capacity that recovery could no longer see (record gone).
  it('releases the reserved slot on a hard delegation failure (F-SCH-2)', async () => {
    // A ledger that ACCEPTS the delegate (reserves a slot) but whose run never reaches `running`: we
    // force a hard failure by making orchestrate's delegate path fail AFTER reservation. Simplest: a
    // proxy that reserves on delegate_task but returns a non-capacity hard error so the run fails,
    // while honoring release_slot. We drive the hard-failure branch directly via a controllable stub.
    let reserved = new Set();
    let released = new Set();
    let proxy = {
      requestFromChild: async (server, _method, payload) => {
        if (server === 'project-graph') {
          return { content: [{ type: 'text', text: JSON.stringify({ ok: true, skeleton: {}, files: [] }) }] };
        }
        if (server !== 'agent-pool') return { content: [{ type: 'text', text: 'ok' }] };
        let args = payload?.arguments ?? {};
        if (payload?.name === 'release_slot') {
          if (args.admission_id) { released.add(args.admission_id); reserved.delete(args.admission_id); }
          return { content: [{ type: 'text', text: 'released' }] };
        }
        // delegate_task: reserve the slot, then return a NON-capacity hard error (run fails).
        if (args.admission_id) reserved.add(args.admission_id);
        return { isError: true, content: [{ type: 'text', text: 'Resource group `impl` not found.' }] };
      },
      chatWsServer: { taskChatMap: new Map() },
    };
    let service = makeService(proxy);
    relaxBoardPreChecks(service);
    let board = service.ensureBoard();
    let card = makeReadyCard(service, { resourceGroup: 'impl' });
    let enq = service.enqueueWorkItem(board, service.getCard(card.id), {});
    let admissionId = enq.entry.admissionId;

    let drain = await service.drainWorkflowQueue(board.id, {});
    assert.ok(drain.admitted.length === 0, 'a hard failure does not admit');
    // The reserved slot was released (idempotent) — no orphaned capacity.
    assert.ok(released.has(admissionId), 'the hard-failure branch released the reserved slot');
    assert.equal(reserved.size, 0, 'no slot remains reserved after the hard failure');
    // F-SCH-1 defense: the card is left in a recoverable lifecycle (idle), never stranded in admitting.
    assert.equal(service.getCard(card.id).lifecycle, 'idle', 'hard-failure card is recoverable (idle), not admitting');
    assert.equal(service.getCard(card.id).recoveryFlags.includes('needs_audit'), true, 'failed run keeps needs_audit');
  });

  // F-SCH-3 regression: the admission lease can be reclaimed mid-orchestrate (15s TTL ≪ 600s delegate
  // budget, no heartbeat during the await). A displaced admitter (a newer lease epoch took over) must
  // write NOTHING after the orchestrate await — the new holder / recovery owns the outcome.
  it('a displaced admitter (lease epoch bumped mid-orchestrate) writes nothing and does not strand (F-SCH-3)', async () => {
    let board;
    let cardId;
    // A proxy whose delegate_task BUMPS the admission lease epoch mid-await, simulating a second
    // admitter reclaiming the lease while THIS pass is blocked inside orchestrate.
    let proxy = {
      requestFromChild: async (server, _method, payload) => {
        if (server === 'project-graph') {
          return { content: [{ type: 'text', text: JSON.stringify({ ok: true, skeleton: {}, files: [] }) }] };
        }
        if (server !== 'agent-pool') return { content: [{ type: 'text', text: 'ok' }] };
        if (payload?.name === 'delegate_task' && board) {
          // Displace the current lease: install a fresh lease under a higher epoch and a new owner.
          let lease = sg.get(`workflowAdmissionLease/${board.id}`);
          if (lease) {
            sg.commit([{ op: 'set', path: `workflowAdmissionLease/${board.id}`, value: {
              ...lease, owner: 'other-admitter', leaseEpoch: Number(lease.leaseEpoch) + 1, heartbeatAt: now,
            } }], 'test:displace', { durable: true });
          }
        }
        let taskId = '00000001-0000-4000-8000-000000000000';
        return { content: [{ type: 'text', text: `Started task ${taskId}` }] };
      },
      chatWsServer: { taskChatMap: new Map() },
    };
    let service = makeService(proxy);
    relaxBoardPreChecks(service);
    board = service.ensureBoard();
    let card = makeReadyCard(service, { resourceGroup: 'impl' });
    cardId = card.id;
    service.enqueueWorkItem(board, service.getCard(card.id), {});

    let drain = await service.drainWorkflowQueue(board.id, {});
    // The displaced admitter must NOT promote the card to running (it lost the lease mid-orchestrate).
    assert.equal(drain.admitted.length, 0, 'a displaced admitter admits nothing');
    assert.notEqual(service.getCard(cardId).lifecycle, 'running', 'displaced admitter did not promote the card');
    assert.ok(
      drain.skipped.some(s => s.displaced || s.reason === 'admission_lease_displaced')
      || !drain.admitted.length,
      'the displaced pass returns a benign result',
    );
  });

  // F-SCH-4 regression: the admissionOrder cardId tiebreak must be a deterministic code-unit compare,
  // not locale-sensitive localeCompare (restart-instability across hosts). Same group/priority/
  // enqueuedAt → strict code-unit ordering on cardId.
  it('admissionOrder cardId tiebreak is a deterministic code-unit compare (F-SCH-4)', async () => {
    let ledger = makeLedgerProxy({ groupLimits: { impl: 1 } });
    let service = makeService(ledger.proxy);
    relaxBoardPreChecks(service);
    let board = service.ensureBoard();

    // Two cards, same group, same priority. Force identical enqueuedAt so ONLY the cardId tiebreak
    // decides order. Code-unit order: 'card-AA' < 'card-aa' (uppercase 'A'=65 < lowercase 'a'=97),
    // the opposite of many locale collations which sort case-insensitively or place lowercase first.
    let cardLower = makeReadyCard(service, { resourceGroup: 'impl', card: { id: 'card-aa' } });
    let cardUpper = makeReadyCard(service, { resourceGroup: 'impl', card: { id: 'card-AA' } });
    let e1 = service.enqueueWorkItem(board, service.getCard(cardLower.id), {});
    let e2 = service.enqueueWorkItem(board, service.getCard(cardUpper.id), {});
    // Normalize enqueuedAt to be identical so the cardId tiebreak is the sole discriminator.
    let entries = sg.get('workflowQueueEntries');
    sg.commit([
      { op: 'set', path: `workflowQueueEntries/${e1.entry.admissionId}`, value: { ...entries[e1.entry.admissionId], enqueuedAt: 500 } },
      { op: 'set', path: `workflowQueueEntries/${e2.entry.admissionId}`, value: { ...entries[e2.entry.admissionId], enqueuedAt: 500 } },
    ], 'test:equal-enqueuedAt', { durable: true });

    // Group limit 1 → exactly one admitted; code-unit order admits 'card-AA' (uppercase sorts first).
    let drain = await service.drainWorkflowQueue(board.id, {});
    assert.equal(drain.admitted.length, 1);
    assert.equal(service.getCard('card-AA').lifecycle, 'running', 'code-unit tiebreak admits the uppercase id first');
    assert.equal(service.getCard('card-aa').lifecycle, 'queued');
  });

  // F-SCH-5 regression: when the last-admitted (cursor) group has drained and is absent from the
  // current groups, the round-robin cursor must continue from the NEXT group after the cursor
  // position, not reset to group 0 (which re-starves whatever was already served).
  it('round-robin cursor continues past a drained cursor group instead of resetting to group 0 (F-SCH-5)', async () => {
    let ledger = makeLedgerProxy({ groupLimits: { ga: 5, gb: 5, gc: 5 } });
    let service = makeService(ledger.proxy);
    relaxBoardPreChecks(service);
    let board = service.ensureBoard();

    // Persist a cursor naming group 'gb' as last-admitted, but 'gb' has since fully drained: only
    // 'ga' and 'gc' have queued entries now. Resetting to index 0 would re-serve 'ga' first;
    // continuing past 'gb' must serve 'gc' first (the group sorted after the drained cursor).
    sg.commit([{ op: 'set', path: `workflowQueueCursor/${board.id}`, value: { groupKey: 'gb' } }], 'test:cursor', { durable: true });
    let cardGa = makeReadyCard(service, { resourceGroup: 'ga', card: { id: 'card-ga' } });
    let cardGc = makeReadyCard(service, { resourceGroup: 'gc', card: { id: 'card-gc' } });
    let eGa = service.enqueueWorkItem(board, service.getCard(cardGa.id), {});
    let eGc = service.enqueueWorkItem(board, service.getCard(cardGc.id), {});
    // Equal enqueuedAt so group round-robin is the sole discriminator.
    let entries = sg.get('workflowQueueEntries');
    sg.commit([
      { op: 'set', path: `workflowQueueEntries/${eGa.entry.admissionId}`, value: { ...entries[eGa.entry.admissionId], enqueuedAt: 500 } },
      { op: 'set', path: `workflowQueueEntries/${eGc.entry.admissionId}`, value: { ...entries[eGc.entry.admissionId], enqueuedAt: 500 } },
    ], 'test:equal-enqueuedAt', { durable: true });

    let ordered = service.admissionOrder(board.id, service.listQueueEntries(board.id));
    // groups sorted: ['ga','gc']; cursor 'gb' would insert between them → continue at 'gc'.
    assert.equal(ordered[0].groupKey, 'gc', 'cursor continues past the drained group, not reset to ga');
    assert.equal(ordered[1].groupKey, 'ga');
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

  // inv 22: a card whose dependency closure is cyclic must not be silently stranded. The link path
  // rejects cycles, but a malformed import can plant a pre-existing cyclic dependsOn. The admission
  // cycle guard must ESCALATE — drop the entry AND move the card to a human-visible recoverable state
  // with a typed needs_decision escalation — not leave it queued/idle with no entry and no trigger
  // (which the pre-fix drop-only branch did: a permanent silent block).
  it('admission cycle guard escalates a cyclic card instead of silently stranding it (inv 22)', async () => {
    let ledger = makeLedgerProxy({ groupLimits: { impl: 5 } });
    let service = makeService(ledger.proxy);
    relaxBoardPreChecks(service);
    let board = service.ensureBoard();

    // Plant a card with a self-referential dependsOn (a 1-cycle) directly — the link path would reject
    // this, so write the cyclic closure raw, exactly as a malformed import would.
    let card = makeReadyCard(service, { resourceGroup: 'impl', card: { id: 'cyc' } });
    let live = service.getCard(card.id);
    let enqueuedAt = now;
    sg.commit([
      { op: 'set', path: `workflowCards/${card.id}`, value: {
        ...live, lifecycle: 'queued', dependsOn: [{ cardId: card.id, releaseWhen: 'card_done', onUpstreamFailure: 'block_and_escalate' }],
      } },
      { op: 'set', path: 'workflowQueueEntries/adm-cyc', value: {
        schema: 'workflow-queue-entry/v1', admissionId: 'adm-cyc', cardId: card.id, boardId: board.id,
        columnId: live.columnId, groupKey: 'impl', priority: 1, basePriority: 1, priorityLabel: 'normal',
        enqueuedAt, queueEpoch: sg.get(`workflowQueueEpoch/${board.id}`) ?? 0, notBefore: null,
      } },
    ], 'test:plant-cycle', { durable: true });

    let drain = await service.drainWorkflowQueue(board.id, {});
    assert.equal(drain.admitted.length, 0, 'the cyclic card is never admitted/run');

    // The queue entry is gone (dropped under the epoch fence)…
    assert.equal(sg.get('workflowQueueEntries/adm-cyc'), undefined, 'the cyclic queue entry is dropped');
    let after = service.getCard(card.id);
    // …and the card is NOT silently left queued/idle-without-escalation: it carries the same typed
    // needs_decision escalation the release path uses, in a recoverable (non-running) lifecycle.
    assert.notEqual(after.lifecycle, 'running');
    assert.notEqual(after.lifecycle, 'queued', 'not silently re-queued (would never re-trigger)');
    assert.equal(after.lifecycle, 'idle', 'escalated to the recoverable idle state (mirrors the hard-failure path)');
    assert.equal(after.metadata?.escalation?.kind, 'needs_decision', 'a typed escalation a human can act on');
    assert.match(after.metadata.escalation.lastEscalation.detail, /cyclic/, 'escalation names the dependency cycle');

    // An escalation transition event is emitted for board visibility.
    let events = service.listEvents({ boardId: board.id }).filter(e => e.cardId === card.id && e.eventType === 'escalation');
    assert.equal(events.length, 1, 'one escalation event for the stuck card');
  });

  // inv 24 (live priority inheritance, MINOR-3): an upstream's admission priority must reflect a
  // high-priority dependent linked AFTER the upstream was enqueued. The frozen entry.priority is
  // captured low at enqueue; admissionOrder must recompute the transitive-max live at order time so the
  // upstream is not starved behind unrelated work. Pre-fix, admissionOrder sorted on the frozen low
  // value and the upstream would lose its slot — that assertion (commented) is what this locks.
  it('admissionOrder recomputes priority inheritance live for a dependent linked after enqueue (inv 24)', async () => {
    let ledger = makeLedgerProxy({ groupLimits: { impl: 1 } });
    let service = makeService(ledger.proxy);
    relaxBoardPreChecks(service);
    let board = service.ensureBoard();

    // Upstream enqueued LOW — its entry.priority freezes at low (0). An unrelated NORMAL card in the
    // SAME group is enqueued so admission order (priority desc) is observable: pre-fix, NORMAL (frozen
    // 1) outranks the upstream's frozen low (0); post-fix, the upstream inherits HIGH (2) live.
    let upstream = makeReadyCard(service, { resourceGroup: 'impl', priority: 'low', card: { id: 'up-low' } });
    let unrelated = makeReadyCard(service, { resourceGroup: 'impl', priority: 'normal', card: { id: 'unrelated' } });
    let eUp = service.enqueueWorkItem(board, service.getCard(upstream.id), {});
    let eOther = service.enqueueWorkItem(board, service.getCard(unrelated.id), {});
    assert.equal(eUp.entry.priority, 0, 'upstream entry.priority frozen LOW at enqueue');

    // Equal enqueuedAt so the priority comparison is the sole discriminator (not enqueuedAt/cardId).
    let entries = sg.get('workflowQueueEntries');
    sg.commit([
      { op: 'set', path: `workflowQueueEntries/${eUp.entry.admissionId}`, value: { ...entries[eUp.entry.admissionId], enqueuedAt: 500 } },
      { op: 'set', path: `workflowQueueEntries/${eOther.entry.admissionId}`, value: { ...entries[eOther.entry.admissionId], enqueuedAt: 500 } },
    ], 'test:equal-enqueuedAt', { durable: true });

    // AFTER enqueue, link a HIGH dependent onto the upstream. The dependent waits (blocked, outside the
    // queue); the upstream gains a high-priority downstream waiter and must inherit its priority.
    makeReadyCard(service, { resourceGroup: 'impl', priority: 'high', card: { id: 'hi-dep' } });
    service.linkDependency({ cardId: 'hi-dep', dependsOn: ['up-low'] });
    assert.equal(service.getCard('hi-dep').lifecycle, 'blocked', 'the high dependent waits on the upstream');

    // Live recompute: the upstream now sorts AHEAD of the unrelated normal card. The frozen entry.priority
    // (low) would have placed it LAST — pre-fix this assertion fails.
    let ordered = service.admissionOrder(board.id, service.listQueueEntries(board.id));
    assert.equal(ordered[0].cardId, 'up-low', 'upstream inherits HIGH live and sorts first, not behind normal');
    assert.equal(ordered[0].priority, 0, 'the frozen record is unchanged (low); only the comparison is overridden');

    // And a drain (group limit 1) admits the upstream first, proving the live order is what runs.
    let drain = await service.drainWorkflowQueue(board.id, {});
    assert.equal(drain.admitted.length, 1);
    assert.equal(service.getCard('up-low').lifecycle, 'running', 'the inheriting upstream is admitted first');
    assert.equal(service.getCard('unrelated').lifecycle, 'queued', 'the unrelated normal card waits');
  });
});
