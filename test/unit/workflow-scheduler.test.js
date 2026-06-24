import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { DEFAULT_WORKFLOW_BOARD_ID, checkPassed } from '../../src/iso/workflow-board.js';
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

// Runtime-reconcile auto-advance: when a card's run terminates, reconcileWorkflowRuntimeTasks moves
// the card forward (in-progress→quality-audit) and must (1) normalize the now-dead lifecycle off
// `running`, and (2) under drive, fire the destination column's on_enter automation so an audit
// actually starts — not leave the card needs_audit forever. The READ path (drive off) stays
// side-effect-light: no agent spawns.
describe('workflow runtime reconcile auto-advance + on_enter drive', () => {
  let tmpDir;
  let sg;
  let now;
  let idSeq;
  let ledger;
  let service;
  let gitRepos;
  // Stubbed release-gate test verdict (injected so the suite never spawns a real `npm` subprocess).
  // Default available:false → the gate is a no-op, preserving every pre-gate test's behavior; the
  // gate-specific tests below override it to assert pass/hold.
  let releaseTestVerdict;

  beforeEach(() => {
    gitRepos = [];
    releaseTestVerdict = { available: false };
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'workflow-runtime-reconcile-'));
    sg = new StateGraph({
      snapshotPath: path.join(tmpDir, 'state.json'),
      walPath: path.join(tmpDir, 'state.wal'),
      chatsDir: path.join(tmpDir, 'chats'),
    });
    now = 1000;
    idSeq = 0;
    ledger = makeLedgerProxy();
    service = createWorkflowBoardService({
      stateGraph: sg,
      now: () => now++,
      makeId: (prefix) => `${prefix}-${++idSeq}`,
      projectRoot: tmpDir,
      proxyManager: ledger.proxy,
      defaultPrincipal: humanPrincipal({ transport: { channel: 'loopback' }, label: 'local-human' }),
      probeReleaseTests: async () => releaseTestVerdict,
    });
  });

  afterEach(async () => {
    await sg.flushChatWrites();
    sg.flush();
    fs.rmSync(tmpDir, { recursive: true, force: true });
    for (let repo of gitRepos) fs.rmSync(repo, { recursive: true, force: true });
  });

  // Plant a card in `in-progress` (lifecycle running) with a live run linked to a runtime task and a
  // lease, mirroring a card the scheduler already admitted. Returns { cardId, runId, taskId }.
  function plantRunningCard(id = 'wip', { cwd = null } = {}) {
    let created = service.createOrUpdateCard({
      id,
      title: `Card ${id}`,
      body: 'Runtime-linked work item.',
      columnId: 'in-progress',
      projectId: 'agent-portal',
      domain: 'backend',
      owner: 'orchestrator',
      assignedAgent: 'backend-engineer',
      resourceGroup: 'impl',
      acceptanceCriteria: ['Done when audited'],
      cwd,
      actor: 'test',
    });
    let card = created.card;
    let runId = `run-${id}`;
    let taskId = `task-${id}`;
    sg.commit([
      { op: 'set', path: `workflowCards/${id}`, value: { ...card, columnId: 'in-progress', lifecycle: 'running' } },
      { op: 'set', path: `workflowRuns/${runId}`, value: {
        schema: 'workflow-run/v1', id: runId, boardId: DEFAULT_WORKFLOW_BOARD_ID, cardId: id,
        status: 'running', taskIds: [taskId], startedAt: 900, updatedAt: 901,
      } },
      { op: 'set', path: `workflowLeases/${id}`, value: {
        schema: 'workflow-lease/v1', boardId: DEFAULT_WORKFLOW_BOARD_ID, cardId: id, runId,
        leaseOwner: 'orchestrator', leaseExpiresAt: 99999, updatedAt: 901,
      } },
    ], 'test:plant-running');
    return { cardId: id, runId, taskId };
  }

  it('drive off: auto-advances to quality-audit, normalizes lifecycle running→idle, writes a runtime event, and spawns NOTHING', async () => {
    let { cardId, runId, taskId } = plantRunningCard();
    assert.equal(service.getCard(cardId).columnId, 'in-progress');
    assert.equal(service.getCard(cardId).lifecycle, 'running');

    // The runtime task is now completed; the reconcile must terminalize the run and advance the card.
    let runtimeTasks = new Map([[taskId, { id: taskId, status: 'completed', completedAt: 1500 }]]);
    let result = await service.reconcileWorkflowRuntimeTasks({ boardId: DEFAULT_WORKFLOW_BOARD_ID }, runtimeTasks);

    let card = service.getCard(cardId);
    assert.equal(card.columnId, 'quality-audit', 'completed run auto-advances the card to quality-audit');
    assert.equal(card.lifecycle, 'idle', 'a terminated run normalizes the stale running lifecycle to idle');
    assert.equal(sg.get(`workflowRuns/${runId}`).status, 'completed', 'the run is terminalized');

    // The auto-advance is surfaced; no drive means no driven outcomes are computed.
    assert.ok(result.advanced.some(item => item.cardId === cardId && item.toColumnId === 'quality-audit'));
    assert.equal(result.driven, undefined, 'drive off omits the driven report');

    // A runtime transition event is recorded for the advance.
    let events = service.listEvents({ cardId });
    assert.ok(events.some(event => event.eventType === 'runtime' && event.toColumnId === 'quality-audit'),
      'a runtime event captures the advance');

    // Side-effect-light: the READ path must not spawn an audit. No agent-pool delegate, no new run.
    assert.equal(ledger.calls.filter(call => call.server === 'agent-pool').length, 0, 'no agent-pool delegation');
    assert.equal(ledger.slotCount(), 0, 'no ledger slot reserved');
    assert.equal(Object.values(sg.get('workflowRuns') || {}).filter(run => run.cardId === cardId).length, 1,
      'no second (audit) run was created');
  });

  it('resume: a lost/orphaned run re-queues the card for resume (orchestrate stage + needs_resume), not audit', async () => {
    let { cardId, runId, taskId } = plantRunningCard('resume-wip');
    assert.equal(service.getCard(cardId).columnId, 'in-progress');

    // The worker was orphaned by a backend restart: its task ends `lost` (heartbeat timeout). That is a
    // RESUMABLE interruption — workflowRunStatusFromRuntime surfaces it as run status `error`, but it must
    // NOT be treated as finished-but-failed.
    let runtimeTasks = new Map([[taskId, { id: taskId, status: 'lost', updatedAt: 1500 }]]);
    let result = await service.reconcileWorkflowRuntimeTasks({ boardId: DEFAULT_WORKFLOW_BOARD_ID }, runtimeTasks);

    let card = service.getCard(cardId);
    assert.equal(card.columnId, 'ready', 'a resumable interruption returns the card to the orchestrate stage, not quality-audit');
    assert.equal(card.recoveryFlags.includes('needs_resume'), true, 'it is flagged for resume');
    assert.equal(card.recoveryFlags.includes('needs_audit'), false, 'a resumable interruption is not finished-but-failed');
    assert.equal(card.lifecycle, 'idle', 'the orphaned run lifecycle normalizes to idle');
    assert.equal(Boolean(card.metadata?.escalation), false, 'no needs_decision/failed escalation is minted for a resumable interruption');
    assert.equal(sg.get(`workflowRuns/${runId}`).status, 'error', 'the orphaned run is terminalized so a fresh attempt can spawn');
    // The prior errored run + needs_resume make this card resume-eligible; the orchestrate re-pickup
    // carries the resume preamble (buildWorkItemPrompt isResume), so the worker continues prior work.
  });

  it('liveness watchdog: an active run whose runtime task is gone + stale self-heals (resumable re-queue)', async () => {
    let { cardId, runId } = plantRunningCard('phantom-wip');
    assert.equal(service.getCard(cardId).columnId, 'in-progress');

    // The worker died (e.g. killed externally) and its runtime task is gone (empty map); advance the
    // clock past the staleness window. The run is still marked "running" — a phantom that would
    // otherwise wedge the card forever.
    now = 901 + 16 * 60 * 1000;
    let result = await service.reconcileWorkflowRuntimeTasks({ boardId: DEFAULT_WORKFLOW_BOARD_ID }, new Map());

    let card = service.getCard(cardId);
    assert.equal(card.columnId, 'ready', 'the dead/phantom run re-queues the card to the orchestrate stage');
    assert.equal(card.recoveryFlags.includes('needs_resume'), true, 'it is flagged for resume');
    assert.equal(sg.get(`workflowRuns/${runId}`).status, 'error', 'the phantom run is terminalized so re-engagement can proceed');
    assert.equal(result.propagated?.some?.(p => p.cardId === cardId) ?? false, false, 'a resumable interruption is not a terminal failure to dependents');
  });

  it('drive on: fires the quality-audit on_enter automation for the advanced card (a real audit delegation)', async () => {
    let { cardId, taskId } = plantRunningCard('wip-drive');
    let runtimeTasks = new Map([[taskId, { id: taskId, status: 'completed', completedAt: 1500 }]]);

    let result = await service.reconcileWorkflowRuntimeTasks(
      { boardId: DEFAULT_WORKFLOW_BOARD_ID }, runtimeTasks, { drive: true },
    );

    // The card advanced AND the drive attempted its on_enter audit.
    assert.ok(result.advanced.some(item => item.cardId === cardId && item.toColumnId === 'quality-audit'));
    assert.ok(Array.isArray(result.driven), 'drive on reports driven outcomes');
    let drivenEntry = result.driven.find(item => item.cardId === cardId);
    assert.ok(drivenEntry, 'the advanced card is driven');
    assert.equal(drivenEntry.ok, true, 'the on_enter audit orchestration succeeded');

    // The drive went through the real admission/delegation path: the agent-pool stub was called and a
    // slot reserved for the audit. The card is no longer stuck needs_audit with nothing running.
    assert.ok(ledger.calls.some(call => call.server === 'agent-pool'), 'the audit reached the agent-pool delegate');
    assert.equal(ledger.slotCount(), 1, 'exactly one audit slot reserved for the advanced card');
    let card = service.getCard(cardId);
    assert.equal(card.columnId, 'quality-audit');
    assert.equal(card.lifecycle, 'running', 'the freshly-admitted audit run puts the card back to running');
  });

  it('without drive the card stays out of audit: lifecycle is idle, needs_audit is NOT set, and no audit runs (locks the bug)', async () => {
    // A `completed` run advances the card but does NOT stamp needs_audit (only non-completed terminals
    // do). Pre-fix, the card sat lifecycle=running with no audit ever firing — this locks the lifecycle
    // normalization and the absence of any spawned audit on the read path.
    let { cardId, taskId } = plantRunningCard('wip-locked');
    let runtimeTasks = new Map([[taskId, { id: taskId, status: 'completed', completedAt: 1500 }]]);
    await service.reconcileWorkflowRuntimeTasks({ boardId: DEFAULT_WORKFLOW_BOARD_ID }, runtimeTasks);

    let card = service.getCard(cardId);
    assert.notEqual(card.lifecycle, 'running', 'lifecycle must not stay running after the run terminated');
    assert.equal(card.lifecycle, 'idle');
    assert.equal(ledger.slotCount(), 0, 'the read reconcile never starts an audit run');
  });

  it('execute proof-contract: a `completed` run that produced NO diff is flagged needs_audit on advance', async () => {
    // A clean repo: the execute run exited cleanly but changed nothing — a no-op masquerading as done.
    let { cardId, taskId } = plantRunningCard('wip-nodiff', { cwd: makeGitRepo('nodiff', { dirtyPaths: [] }) });
    let runtimeTasks = new Map([[taskId, { id: taskId, status: 'completed', completedAt: 1500 }]]);

    await service.reconcileWorkflowRuntimeTasks({ boardId: DEFAULT_WORKFLOW_BOARD_ID }, runtimeTasks);

    let card = service.getCard(cardId);
    assert.equal(card.columnId, 'quality-audit', 'the card still advances to audit (audit is the safety net)');
    assert.equal(card.recoveryFlags.includes('needs_audit'), true,
      'a no-diff completion is surfaced for scrutiny, not presented as finished work');
  });

  it('execute proof-contract: a `completed` run WITH a real diff advances clean (no needs_audit)', async () => {
    let { cardId, taskId } = plantRunningCard('wip-realdiff', { cwd: makeGitRepo('realdiff') });
    let runtimeTasks = new Map([[taskId, { id: taskId, status: 'completed', completedAt: 1500 }]]);

    await service.reconcileWorkflowRuntimeTasks({ boardId: DEFAULT_WORKFLOW_BOARD_ID }, runtimeTasks);

    let card = service.getCard(cardId);
    assert.equal(card.columnId, 'quality-audit');
    assert.equal(card.recoveryFlags.includes('needs_audit'), false,
      'a real, non-trivial diff is not flagged as a no-op');
  });

  // A real git work tree the release-tail probe can read. `dirtyPaths` are written and left
  // uncommitted so the probe sees a non-empty working-tree diff; pass junk paths to exercise the
  // hygiene-offender branch. Returns the repo path for use as a card cwd.
  function makeGitRepo(name, { dirtyPaths = ['src/feature.js'] } = {}) {
    let repo = fs.mkdtempSync(path.join(os.tmpdir(), `wf-repo-${name}-`));
    let git = (args) => execFileSync('git', args, { cwd: repo, stdio: ['ignore', 'ignore', 'ignore'] });
    git(['init']);
    git(['config', 'user.email', 'test@example.com']);
    git(['config', 'user.name', 'test']);
    fs.writeFileSync(path.join(repo, 'README.md'), '# base\n');
    git(['add', '.']);
    git(['commit', '-m', 'base']);
    for (let rel of dirtyPaths) {
      let abs = path.join(repo, rel);
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.writeFileSync(abs, `// work for ${rel}\n`);
    }
    gitRepos.push(repo);
    return repo;
  }

  // Plant a card parked in quality-audit whose audit run has already terminated with `runStatus`,
  // mirroring a card the core reconcile advanced and whose on_enter audit then finished.
  function plantAuditedCard(id, runStatus = 'completed', { cwd = null, executedBy = [] } = {}) {
    let created = service.createOrUpdateCard({
      id,
      title: `Card ${id}`,
      body: 'Audited work item.',
      columnId: 'in-progress',
      projectId: 'agent-portal',
      domain: 'backend',
      owner: 'orchestrator',
      assignedAgent: 'backend-engineer',
      acceptanceCriteria: ['Done when audited'],
      cwd,
      actor: 'test',
    });
    let card = created.card;
    // executedBy records who ran the card (the run path stamps principal.id). A card the daemon
    // executed in autonomous mode carries 'daemon' here — the separated-duty constraint the release
    // tail must honour when deciding whether the daemon may sign its own audit floor.
    let metadata = executedBy.length ? { ...card.metadata, executedBy } : card.metadata;
    sg.commit([
      { op: 'set', path: `workflowCards/${id}`, value: { ...card, metadata, columnId: 'quality-audit', lifecycle: 'idle' } },
      { op: 'set', path: `workflowRuns/run-${id}`, value: {
        schema: 'workflow-run/v1', id: `run-${id}`, boardId: DEFAULT_WORKFLOW_BOARD_ID, cardId: id,
        status: runStatus, taskIds: [`task-${id}`], startedAt: 900, updatedAt: 1500, completedAt: 1500,
      } },
    ], 'test:plant-audited');
    return id;
  }

  // Proof-contract: a finished audit run must carry an explicit PASS verdict to advance. This map mirrors
  // the auditor's final output (read via workerFinalAnswerText) carrying a COMPLETION_PROOF marker.
  function verdictTasks(cardId, text) {
    return new Map([[`task-${cardId}`, { id: `task-${cardId}`, status: 'completed', completedAt: 1500, events: [{ text }] }]]);
  }

  it('autonomous tail: a PASS verdict signs the audit floor check and advances to commit-publish', async () => {
    service.updateWorkflowBoard({ mode: 'autonomous' }, { gatedBy: 'board.control' });
    let cardId = plantAuditedCard('aud-pass');

    let result = await service.reconcileWorkflowRuntimeTasks(
      { boardId: DEFAULT_WORKFLOW_BOARD_ID }, verdictTasks(cardId, 'Audit complete. COMPLETION_PROOF: PASS'), { drive: true },
    );

    let card = service.getCard(cardId);
    assert.equal(card.columnId, 'commit-publish', 'a PASS verdict advances the card past quality-audit');
    let checks = sg.get(`workflowChecks/${cardId}`)?.checks ?? {};
    assert.equal(checkPassed(checks.audit), true, 'the daemon signed the audit floor check on a real verdict');
    assert.equal(checks.audit.signedBy, 'daemon', 'the signature records the daemon as the signer');
    assert.ok(result.releaseTail.advanced.some(item => item.cardId === cardId && item.toColumnId === 'commit-publish'));
    assert.equal(result.releaseTail.closed.includes(cardId), false, 'manual publishMode does not auto-close');
  });

  it('separated-duty: the daemon may NOT self-sign+advance a card it executed without a waiver', async () => {
    service.updateWorkflowBoard({ mode: 'autonomous' }, { gatedBy: 'board.control' });
    // The daemon both ran AND reconciles this card (autonomous mode): 'daemon' is in executedBy.
    let cardId = plantAuditedCard('aud-selfsign', 'completed', { executedBy: ['daemon'] });

    let result = await service.reconcileWorkflowRuntimeTasks(
      { boardId: DEFAULT_WORKFLOW_BOARD_ID }, verdictTasks(cardId, 'Audit complete. COMPLETION_PROOF: PASS'), { drive: true },
    );

    let card = service.getCard(cardId);
    assert.equal(card.columnId, 'quality-audit', 'an executor-daemon cannot auto-pass its own card');
    assert.equal(card.recoveryFlags.includes('needs_audit'), true, 'it is held for an independent sign-off');
    assert.equal(checkPassed(sg.get(`workflowChecks/${cardId}`)?.checks?.audit), false, 'no self-signed audit pass is written');
    assert.equal(result.releaseTail.advanced.some(i => i.cardId === cardId), false);
  });

  it('separated-duty: an INDEPENDENT audit sign-off lets the daemon advance the card it executed', async () => {
    service.updateWorkflowBoard({ mode: 'autonomous' }, { gatedBy: 'board.control' });
    let cardId = plantAuditedCard('aud-indep', 'completed', { executedBy: ['daemon'] });
    // A reviewer who did NOT execute the card signs the audit floor (the update_item AUDIT path).
    let reviewer = humanPrincipal({ id: 'code-reviewer', label: 'code-reviewer' });
    let signed = service.createOrUpdateCard({ cardId, checks: { audit: 'passed' } }, reviewer);
    assert.equal(signed.ok, true, 'an independent principal can sign the floor');

    let result = await service.reconcileWorkflowRuntimeTasks(
      { boardId: DEFAULT_WORKFLOW_BOARD_ID }, new Map(), { drive: true },
    );

    let card = service.getCard(cardId);
    assert.equal(card.columnId, 'commit-publish', 'an independent sign-off advances the card');
    assert.ok(result.releaseTail.advanced.some(i => i.cardId === cardId && i.toColumnId === 'commit-publish'));
  });

  it('separated-duty: an explicit per-board waiver lets the daemon self-sign, recording the approver', async () => {
    service.updateWorkflowBoard(
      { mode: 'autonomous', automation: { daemonFloorSignWaiver: { approver: 'local-human', reason: 'small board, accepted risk' } } },
      { gatedBy: 'board.control' },
    );
    let cardId = plantAuditedCard('aud-waived', 'completed', { executedBy: ['daemon'] });

    let result = await service.reconcileWorkflowRuntimeTasks(
      { boardId: DEFAULT_WORKFLOW_BOARD_ID }, verdictTasks(cardId, 'Audit complete. COMPLETION_PROOF: PASS'), { drive: true },
    );

    let card = service.getCard(cardId);
    assert.equal(card.columnId, 'commit-publish', 'the waiver authorizes the daemon self-sign+advance');
    let audit = sg.get(`workflowChecks/${cardId}`)?.checks?.audit;
    assert.equal(checkPassed(audit), true, 'the audit floor is signed under the waiver');
    assert.equal(audit.signedBy, 'daemon', 'the daemon is recorded as the signer');
    assert.equal(audit.waiver.approver, 'local-human', 'the waiver approver is recorded for attribution');
    assert.ok(result.releaseTail.advanced.some(i => i.cardId === cardId && i.toColumnId === 'commit-publish'));
  });

  it('release gate: a PASS verdict still runs the unit suite — a failing run holds the card, never ships', async () => {
    service.updateWorkflowBoard({ mode: 'autonomous' }, { gatedBy: 'board.control' });
    let cardId = plantAuditedCard('aud-testfail');
    releaseTestVerdict = { available: true, passed: false, failing: 1, reason: 'unit tests failed (1 failing)' };

    let result = await service.reconcileWorkflowRuntimeTasks(
      { boardId: DEFAULT_WORKFLOW_BOARD_ID }, verdictTasks(cardId, 'Audit complete. COMPLETION_PROOF: PASS'), { drive: true },
    );

    let card = service.getCard(cardId);
    assert.equal(card.columnId, 'quality-audit', 'failing unit tests hold the card despite a self-reported PASS');
    assert.equal(card.recoveryFlags.includes('needs_audit'), true, 'it is held for rework');
    assert.equal(result.releaseTail.advanced.some(i => i.cardId === cardId), false, 'broken work never advances to commit');
  });

  it('release gate: a PASS verdict with a green unit suite advances to commit-publish', async () => {
    service.updateWorkflowBoard({ mode: 'autonomous' }, { gatedBy: 'board.control' });
    let cardId = plantAuditedCard('aud-testpass');
    releaseTestVerdict = { available: true, passed: true, passing: 869, reason: 'unit tests passed (869)' };

    let result = await service.reconcileWorkflowRuntimeTasks(
      { boardId: DEFAULT_WORKFLOW_BOARD_ID }, verdictTasks(cardId, 'Audit complete. COMPLETION_PROOF: PASS'), { drive: true },
    );

    let card = service.getCard(cardId);
    assert.equal(card.columnId, 'commit-publish', 'a green suite plus a PASS verdict advances the card');
    assert.ok(result.releaseTail.advanced.some(i => i.cardId === cardId && i.toColumnId === 'commit-publish'));
  });

  it('proof-contract: a completed audit run with NO verdict is held as needs_audit, never auto-passed', async () => {
    service.updateWorkflowBoard(
      { mode: 'autonomous', automation: { publishMode: 'after_audit' } }, { gatedBy: 'board.control' },
    );
    let cardId = plantAuditedCard('aud-noverdict');

    // Empty runtimeTasks → the run completed cleanly but emitted no PASS/FAIL verdict.
    let result = await service.reconcileWorkflowRuntimeTasks(
      { boardId: DEFAULT_WORKFLOW_BOARD_ID }, new Map(), { drive: true },
    );

    let card = service.getCard(cardId);
    assert.equal(card.columnId, 'quality-audit', 'completed != approved: no verdict means no advance');
    assert.equal(card.recoveryFlags.includes('needs_audit'), true, 'the card is surfaced as needs_audit, not silently parked');
    assert.equal(checkPassed(sg.get(`workflowChecks/${cardId}`)?.checks?.audit), false, 'no pass is fabricated');
    assert.equal(result.releaseTail.advanced.some(i => i.cardId === cardId), false);
  });

  it('autonomous tail + publishMode after_audit: walks a verdict-passed card all the way to done', async () => {
    service.updateWorkflowBoard(
      { mode: 'autonomous', automation: { publishMode: 'after_audit' } }, { gatedBy: 'board.control' },
    );
    // A real working tree with a non-empty, junk-free diff so the release-tail probe (not a daemon
    // rubber-stamp) signs the clean-diff/hygiene floor.
    let cardId = plantAuditedCard('aud-close', 'completed', { cwd: makeGitRepo('close') });

    let result = await service.reconcileWorkflowRuntimeTasks(
      { boardId: DEFAULT_WORKFLOW_BOARD_ID }, verdictTasks(cardId, 'WORKFLOW_RESULT: pass'), { drive: true },
    );

    let card = service.getCard(cardId);
    assert.equal(card.columnId, 'done', 'after_audit publishMode closes the card autonomously');
    let checks = sg.get(`workflowChecks/${cardId}`)?.checks ?? {};
    assert.equal(checkPassed(checks.audit), true, 'audit floor check signed');
    assert.equal(checkPassed(checks.cleanDiff), true, 'clean-diff floor check signed');
    assert.equal(checkPassed(checks.hygiene), true, 'hygiene floor check signed');
    // The clean-diff/hygiene pass is backed by a real probe, not a bare daemon signature.
    assert.equal(checks.cleanDiff.signedBy, 'daemon-probe', 'clean-diff signed off a real probe');
    assert.equal(checks.hygiene.signedBy, 'daemon-probe', 'hygiene signed off a real probe');
    assert.ok(checks.cleanDiff.evidence.changedFiles >= 1, 'probe evidence records the real changeset');
    assert.ok(result.releaseTail.closed.includes(cardId), 'the card is reported closed');
    // A runtime transition event captures each leg of the autonomous walk.
    let events = service.listEvents({ cardId });
    assert.ok(events.some(e => e.toColumnId === 'commit-publish'), 'quality-audit → commit-publish recorded');
    assert.ok(events.some(e => e.toColumnId === 'done'), 'commit-publish → done recorded');
  });

  it('proof-contract: an empty working tree at publish is HELD as needs_audit, never auto-closed', async () => {
    service.updateWorkflowBoard(
      { mode: 'autonomous', automation: { publishMode: 'after_audit' } }, { gatedBy: 'board.control' },
    );
    // A clean repo (no uncommitted diff): the publish probe finds nothing to ship.
    let cardId = plantAuditedCard('aud-empty', 'completed', { cwd: makeGitRepo('empty', { dirtyPaths: [] }) });

    let result = await service.reconcileWorkflowRuntimeTasks(
      { boardId: DEFAULT_WORKFLOW_BOARD_ID }, verdictTasks(cardId, 'WORKFLOW_RESULT: pass'), { drive: true },
    );

    let card = service.getCard(cardId);
    assert.equal(card.columnId, 'commit-publish', 'no diff to ship: the card never auto-closes');
    assert.equal(card.recoveryFlags.includes('needs_audit'), true, 'held for re-audit, not silently closed');
    let checks = sg.get(`workflowChecks/${cardId}`)?.checks ?? {};
    assert.equal(checkPassed(checks.cleanDiff), false, 'no clean-diff pass is fabricated without a diff');
    assert.equal(result.releaseTail.closed.includes(cardId), false, 'the card is not reported closed');
  });

  it('proof-contract: a hygiene offender in the worktree at publish HOLDS the card, never auto-closes', async () => {
    service.updateWorkflowBoard(
      { mode: 'autonomous', automation: { publishMode: 'after_audit' } }, { gatedBy: 'board.control' },
    );
    // A real diff that includes a scratch/secret-bearing path the hygiene probe must reject.
    let cardId = plantAuditedCard('aud-junk', 'completed', {
      cwd: makeGitRepo('junk', { dirtyPaths: ['src/feature.js', '.env.local'] }),
    });

    let result = await service.reconcileWorkflowRuntimeTasks(
      { boardId: DEFAULT_WORKFLOW_BOARD_ID }, verdictTasks(cardId, 'WORKFLOW_RESULT: pass'), { drive: true },
    );

    let card = service.getCard(cardId);
    assert.equal(card.columnId, 'commit-publish', 'a hygiene offender blocks the auto-close');
    assert.equal(card.recoveryFlags.includes('needs_audit'), true, 'held for re-audit on a hygiene violation');
    assert.equal(checkPassed(sg.get(`workflowChecks/${cardId}`)?.checks?.hygiene), false, 'no hygiene pass fabricated');
    assert.equal(result.releaseTail.closed.includes(cardId), false);
  });

  it('autonomous tail: a failed audit run is NOT auto-passed — it is left in quality-audit for recovery', async () => {
    service.updateWorkflowBoard(
      { mode: 'autonomous', automation: { publishMode: 'after_audit' } }, { gatedBy: 'board.control' },
    );
    let cardId = plantAuditedCard('aud-fail', 'error');

    await service.reconcileWorkflowRuntimeTasks({ boardId: DEFAULT_WORKFLOW_BOARD_ID }, new Map(), { drive: true });

    let card = service.getCard(cardId);
    assert.equal(card.columnId, 'quality-audit', 'a terminal-failed audit run never auto-advances');
    let checks = sg.get(`workflowChecks/${cardId}`)?.checks ?? {};
    assert.equal(checkPassed(checks.audit), false, 'no audit pass is fabricated for a failed run');
  });

  it('armed mode (default): the autonomous tail stays off — a finished audit card waits for a human', async () => {
    let cardId = plantAuditedCard('aud-armed');

    let result = await service.reconcileWorkflowRuntimeTasks(
      { boardId: DEFAULT_WORKFLOW_BOARD_ID }, new Map(), { drive: true },
    );

    let card = service.getCard(cardId);
    assert.equal(card.columnId, 'quality-audit', 'armed mode keeps the independent human/agent sign-off');
    assert.equal(result.releaseTail, null, 'no release tail runs outside autonomous mode');
    assert.equal(result.backlog, null, 'no backlog self-start runs outside autonomous mode');
  });

  // Plant a card parked in backlog with or without an execution contract, without firing creation-time
  // automation (created in in-progress, which is lease-gated, then moved to backlog).
  function plantBacklogCard(id, { contract = true } = {}) {
    let created = service.createOrUpdateCard({
      id, title: `Card ${id}`, body: 'Backlog item.', columnId: 'in-progress',
      projectId: 'agent-portal', domain: 'backend',
      owner: contract ? 'orchestrator' : null,
      acceptanceCriteria: contract ? ['Done when shipped'] : [],
      actor: 'test',
    });
    sg.commit([{ op: 'set', path: `workflowCards/${id}`, value: { ...created.card, columnId: 'backlog', lifecycle: 'idle' } }], 'test:plant-backlog');
    return id;
  }

  it('autonomous backlog: a scoped card auto-promotes to the orchestrate column (then orchestration fires)', async () => {
    service.updateWorkflowBoard({ mode: 'autonomous' }, { gatedBy: 'board.control' });
    let cardId = plantBacklogCard('bl-scoped', { contract: true });

    let result = await service.reconcileWorkflowRuntimeTasks(
      { boardId: DEFAULT_WORKFLOW_BOARD_ID }, new Map(), { drive: true },
    );

    assert.ok(result.backlog.promoted.some(p => p.cardId === cardId && p.toColumnId === 'ready'),
      'a scoped backlog card is promoted to the orchestrate column');
    assert.notEqual(service.getCard(cardId).columnId, 'backlog', 'the card has left the backlog');
  });

  it('autonomous backlog: a raw card with no contract is surfaced for one-shot scope, not promoted', async () => {
    service.updateWorkflowBoard({ mode: 'autonomous' }, { gatedBy: 'board.control' });
    let cardId = plantBacklogCard('bl-raw', { contract: false });

    let result = await service.reconcileWorkflowRuntimeTasks(
      { boardId: DEFAULT_WORKFLOW_BOARD_ID }, new Map(), { drive: true },
    );

    assert.ok(result.backlog.scopeNeeded.includes(cardId), 'a raw backlog card is surfaced for scope');
    assert.equal(result.backlog.promoted.some(p => p.cardId === cardId), false, 'a card with no contract is not promoted');
  });
});
