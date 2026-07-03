import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  DEFAULT_WORKFLOW_BOARD_ID,
  normalizeWorkflowAutomation,
  normalizeWorkflowCardInput,
  normalizeWorkflowReturnEvent,
} from '../../src/iso/workflow-board.js';
import { StateGraph } from '../../src/node/state-graph.js';
import { createWorkflowBoardService } from '../../src/node/workflow-board-service.js';
import { humanPrincipal } from '../../src/node/server/principal.js';

// Occupancy WIP limits + stale/aging escalation (Axis C). parallelLimit caps concurrent RUNNING
// agents; the only age clock (MAX_BLOCKED_AGE_MS) is dependency-only. A card that finished its run but
// was never advanced ages silently. These cover the three pieces: the per-card enteredColumnAt stamp,
// the occupancy cap, and the stale escalation on the typed-escalation channel.
describe('workflow board occupancy + stale aging (Axis C)', () => {
  describe('enteredColumnAt stamp (iso normalizer — single source of truth)', () => {
    it('stamps the entry clock on create, preserves it across a same-column edit, restamps on a move', () => {
      let created = normalizeWorkflowCardInput(
        { id: 'c1', title: 'Card', columnId: 'ready' },
        { now: 1000 },
      );
      assert.equal(created.metadata.enteredColumn, 'ready');
      assert.equal(created.metadata.enteredColumnAt, 1000, 'fresh card stamps now');

      // A metadata-only edit (same column, later clock) must NOT reset the occupancy clock.
      let edited = normalizeWorkflowCardInput(
        { ...created, body: 'edited' },
        { now: 5000 },
      );
      assert.equal(edited.metadata.enteredColumnAt, 1000, 'same-column edit preserves the stamp');

      // A column change restamps to the move's timestamp.
      let moved = normalizeWorkflowCardInput(
        { ...created, columnId: 'in-progress' },
        { now: 8000 },
      );
      assert.equal(moved.metadata.enteredColumn, 'in-progress');
      assert.equal(moved.metadata.enteredColumnAt, 8000, 'a move restamps the clock');
    });
  });

  describe('occupancy cap normalization (iso)', () => {
    it('whitelists occupancyLimit and staleAgeMs onto column automation', () => {
      let withCaps = normalizeWorkflowAutomation({ occupancyLimit: 3, staleAgeMs: 60000 });
      assert.equal(withCaps.occupancyLimit, 3);
      assert.equal(withCaps.staleAgeMs, 60000);

      // occupancyLimit floors at 1 (mirroring parallelLimit); garbage is dropped — omit it to uncap.
      assert.equal(normalizeWorkflowAutomation({ occupancyLimit: 0 }).occupancyLimit, 1);
      assert.equal(normalizeWorkflowAutomation({ occupancyLimit: 'nope' }).occupancyLimit, undefined);
      assert.equal(normalizeWorkflowAutomation({}).occupancyLimit, undefined);

      // staleAgeMs keeps an explicit 0 and clamps a negative to 0 (both disable aging); garbage and
      // an absent value are dropped, so the service falls back to the module default.
      assert.equal(normalizeWorkflowAutomation({ staleAgeMs: 0 }).staleAgeMs, 0);
      assert.equal(normalizeWorkflowAutomation({ staleAgeMs: -5 }).staleAgeMs, 0);
      assert.equal(normalizeWorkflowAutomation({ staleAgeMs: 'nope' }).staleAgeMs, undefined);
      assert.equal(normalizeWorkflowAutomation({}).staleAgeMs, undefined);
    });
  });

  describe('service behaviour', () => {
    let tmpDir;
    let sg;
    let now;
    let idSeq;
    let service;

    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'workflow-occupancy-'));
      sg = new StateGraph({
        snapshotPath: path.join(tmpDir, 'state.json'),
        walPath: path.join(tmpDir, 'state.wal'),
        chatsDir: path.join(tmpDir, 'chats'),
      });
      now = 1000;
      idSeq = 0;
      service = createWorkflowBoardService({
        stateGraph: sg,
        now: () => now,
        makeId: (prefix) => `${prefix}-${++idSeq}`,
        projectRoot: tmpDir,
        defaultPrincipal: humanPrincipal({ transport: { channel: 'loopback' }, label: 'local-human' }),
      });
    });

    afterEach(async () => {
      await sg.flushChatWrites();
      sg.flush();
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    function makeCard(overrides = {}) {
      return service.createOrUpdateCard({
        id: `card-${++idSeq}`,
        title: `Card ${idSeq}`,
        body: 'Durable work item.',
        columnId: overrides.columnId ?? 'in-progress',
        projectId: 'agent-portal',
        domain: 'backend',
        owner: 'orchestrator',
        assignedAgent: 'backend-engineer',
        acceptanceCriteria: ['Done'],
        actor: 'test',
        ...overrides,
      }).card;
    }

    function seedRun(boardId, cardId, status = 'completed') {
      let runId = `seed-run-${++idSeq}`;
      sg.commit([{ op: 'set', path: `workflowRuns/${runId}`, value: {
        schema: 'workflow-run/v1',
        id: runId,
        boardId,
        cardId,
        status,
        startedAt: 1,
        updatedAt: 2,
        completedAt: status === 'completed' ? 2 : null,
        taskIds: [],
      } }], 'test:seed-run');
      return runId;
    }

    it('createOrUpdateCard stamps the entry clock onto card metadata', () => {
      let card = makeCard();
      assert.equal(card.metadata.enteredColumn, 'in-progress');
      assert.equal(card.metadata.enteredColumnAt, 1000);
    });

    it('columnOccupancyAvailable counts every card in the column, not just running runs', () => {
      let board = service.ensureBoard();
      let a = makeCard({ columnId: 'in-progress' });
      makeCard({ columnId: 'in-progress' });
      makeCard({ columnId: 'in-progress' }); // three cards occupy in-progress, all with no live run

      // No configured cap → always available.
      assert.equal(columnAvail(board, a, {}).ok, true);

      // Cap of 2 with three cards present → over the cap, regardless of run state.
      let gate = columnAvail(board, a, { occupancyLimit: 2 });
      assert.equal(gate.ok, false);
      assert.equal(gate.occupancy, 3);
      assert.match(gate.reason, /occupancy cap 2/);

      // Cap of 3 with exactly three present → at the cap, still admissible.
      assert.equal(columnAvail(board, a, { occupancyLimit: 3 }).ok, true);
    });

    function columnAvail(board, card, automation) {
      return service.columnOccupancyAvailable(board, service.getCard(card.id), automation);
    }

    it('orchestrate refuses to start new work when the column is over its occupancy cap', async () => {
      let board = service.ensureBoard();
      // Configure a WIP cap of 2 on the in-progress column (plumbed through normalizeWorkflowAutomation).
      service.updateWorkflowColumn({ columnId: 'in-progress', automation: { occupancyLimit: 2 }, actor: 'test' });

      makeCard({ columnId: 'in-progress' });
      makeCard({ columnId: 'in-progress' });
      let third = makeCard({ columnId: 'in-progress' }); // pushes the column to 3 > cap 2

      await assert.rejects(
        () => service.orchestrateWorkItem({ cardId: third.id }),
        /occupancy cap 2/,
        'over-cap column refuses new orchestration',
      );

      // force overrides the soft cap.
      let forced = await service.orchestrateWorkItem({ cardId: third.id, force: true });
      assert.equal(forced.ok, true, 'force bypasses the occupancy cap');
    });

    it('escalates a worked-but-unadvanced card once it ages past the stale budget (typed needs_decision)', () => {
      let board = service.ensureBoard();
      let card = makeCard({ columnId: 'in-progress' });
      seedRun(board.id, card.id, 'completed'); // it ran and finished, but was never advanced

      // Before the budget: no escalation.
      now = 1000 + 30 * 60 * 1000;
      let early = service.escalateStaleCards(DEFAULT_WORKFLOW_BOARD_ID);
      assert.equal(early.escalated.length, 0, 'under the 1h budget → no escalation');
      assert.equal(service.getCard(card.id).metadata?.escalation, undefined);

      // Past the budget: a typed needs_decision on the typed-escalation channel.
      now = 1000 + 2 * 60 * 60 * 1000;
      let tick = service.escalateStaleCards(DEFAULT_WORKFLOW_BOARD_ID);
      assert.equal(tick.escalated.length, 1, 'stalled card escalates');
      assert.equal(tick.escalated[0].cardId, card.id);

      let stalled = service.getCard(card.id);
      assert.equal(stalled.metadata.escalation.kind, 'needs_decision');
      assert.equal(stalled.metadata.escalation.lastEscalation.kind, 'needs_decision');
      let events = service.listWorkflowEvents({ boardId: board.id }).events;
      assert.ok(
        events.some(event => event.eventType === 'escalation' && event.cardId === card.id),
        'an escalation event is recorded on the board',
      );

      // Idempotent: a second tick does not re-escalate the already-escalated card.
      now += 60 * 60 * 1000;
      assert.equal(service.escalateStaleCards(DEFAULT_WORKFLOW_BOARD_ID).escalated.length, 0);
    });

    it('does not stale-escalate a worked card that is already waiting on a queued return', () => {
      let board = service.ensureBoard();
      let card = makeCard({ columnId: 'in-progress' });
      seedRun(board.id, card.id, 'completed');
      let event = normalizeWorkflowReturnEvent({
        kind: 'discovered',
        correlationId: card.id,
        detail: 'child returned new routing evidence',
      }, { now: 1001 });
      let base = sg.get(`workflowCards/${card.id}`);
      sg.commit([{ op: 'set', path: `workflowCards/${card.id}`, value: {
        ...base,
        metadata: { ...base.metadata, returns: [event] },
      } }], 'test:seed-return-wait');

      now = 1000 + 2 * 60 * 60 * 1000;
      let liveness = service.auditBoardLiveness(DEFAULT_WORKFLOW_BOARD_ID);
      assert.ok(
        liveness.waiting.some(wait => wait.cardId === card.id && wait.reason === 'return'),
        'precondition: the card is already waiting on the return wake',
      );

      let tick = service.escalateStaleCards(DEFAULT_WORKFLOW_BOARD_ID);
      assert.equal(tick.escalated.length, 0, 'a named return wait is not stale occupancy');
      assert.equal(service.getCard(card.id).metadata?.escalation, undefined);
    });

    it('does not flag a card that never ran, is still running, or sits in a terminal column', () => {
      let board = service.ensureBoard();
      now = 1000;
      let neverRan = makeCard({ columnId: 'in-progress' }); // no run seeded
      let running = makeCard({ columnId: 'in-progress' });
      seedRun(board.id, running.id, 'running'); // live run = progress
      let done = makeCard({ columnId: 'done' }); // terminal column
      seedRun(board.id, done.id, 'completed');

      now = 1000 + 48 * 60 * 60 * 1000; // well past the budget
      let tick = service.escalateStaleCards(DEFAULT_WORKFLOW_BOARD_ID);

      assert.equal(tick.escalated.length, 0, 'none of the exempt cards escalate');
      assert.equal(service.getCard(neverRan.id).metadata?.escalation, undefined);
      assert.equal(service.getCard(running.id).metadata?.escalation, undefined);
      assert.equal(service.getCard(done.id).metadata?.escalation, undefined);
    });

    it('honours a per-column staleAgeMs override and disables aging at 0', () => {
      let board = service.ensureBoard();
      // Tight 1h budget on in-progress; a separate disabled column at 0.
      service.updateWorkflowColumn({ columnId: 'in-progress', automation: { staleAgeMs: 60 * 60 * 1000 }, actor: 'test' });
      service.updateWorkflowColumn({ columnId: 'quality-audit', automation: { staleAgeMs: 0 }, actor: 'test' });

      now = 1000;
      let tight = makeCard({ columnId: 'in-progress' });
      seedRun(board.id, tight.id, 'completed');
      let disabled = makeCard({ columnId: 'quality-audit' });
      seedRun(board.id, disabled.id, 'completed');

      now = 1000 + 2 * 60 * 60 * 1000; // 2h: past the 1h budget, but aging is off on quality-audit
      let tick = service.escalateStaleCards(DEFAULT_WORKFLOW_BOARD_ID);

      assert.deepEqual(tick.escalated.map(e => e.cardId), [tight.id], 'only the tight-budget column escalates');
      assert.equal(service.getCard(disabled.id).metadata?.escalation, undefined, 'staleAgeMs:0 disables aging');
    });
  });
});
