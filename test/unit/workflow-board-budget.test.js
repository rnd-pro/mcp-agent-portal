import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  evaluateWorkflowBoardBudget,
  normalizeWorkflowBoardAutomation,
} from '../../src/iso/workflow-board.js';
import { StateGraph } from '../../src/node/state-graph.js';
import { createWorkflowBoardService } from '../../src/node/workflow-board-service.js';
import { humanPrincipal } from '../../src/node/server/principal.js';

// Minimal agent-pool ledger stub: grants a slot per admission so an under-budget card actually admits.
// Capacity is irrelevant here (board pre-checks are raised high) — the budget breaker is the gate.
function makeLedgerProxy() {
  let taskSeq = 0;
  let slots = new Map();
  return {
    proxy: {
      requestFromChild: async (server, _method, payload) => {
        if (server === 'project-graph') {
          return { content: [{ type: 'text', text: JSON.stringify({ ok: true, skeleton: {}, files: [] }) }] };
        }
        if (server !== 'agent-pool') return { content: [{ type: 'text', text: 'ok' }] };
        let args = payload?.arguments ?? {};
        let admissionId = args.admission_id;
        if (admissionId && slots.has(admissionId)) {
          return { content: [{ type: 'text', text: `Reusing task ${slots.get(admissionId)}` }] };
        }
        let taskId = `${(++taskSeq).toString().padStart(8, '0')}-0000-4000-8000-000000000000`;
        if (admissionId) slots.set(admissionId, taskId);
        return { content: [{ type: 'text', text: `Started task ${taskId}` }] };
      },
      chatWsServer: { taskChatMap: new Map() },
    },
  };
}

describe('workflow board cost/token budget breaker (Axis E)', () => {
  describe('normalization + pure evaluation (iso)', () => {
    it('whitelists a board budget into automation; an absent budget stays uncapped', () => {
      let withBudget = normalizeWorkflowBoardAutomation({ budget: { tokens: 50000, maxWallClockMs: 600000, runCount: 20 } });
      assert.deepEqual(withBudget.budget, { tokens: 50000, wallClockMs: 600000, runCount: 20 });

      let noBudget = normalizeWorkflowBoardAutomation({});
      assert.equal(noBudget.budget, undefined, 'no budget authored → automation carries none (unbounded)');

      // Non-positive / garbage dimensions are dropped; an all-empty budget normalizes away entirely.
      let partial = normalizeWorkflowBoardAutomation({ budget: { tokens: 100, wallClockMs: 0, runCount: -5 } });
      assert.deepEqual(partial.budget, { tokens: 100 });
      let empty = normalizeWorkflowBoardAutomation({ budget: { tokens: 'nope' } });
      assert.equal(empty.budget, undefined);
    });

    it('treats the limit as a hard ceiling (breach at >=), per dimension', () => {
      let budget = { tokens: 1000, wallClockMs: 5000, runCount: 3 };
      assert.equal(evaluateWorkflowBoardBudget(budget, { tokens: 999, wallClockMs: 4000, runCount: 2 }).ok, true);

      let atTokens = evaluateWorkflowBoardBudget(budget, { tokens: 1000, wallClockMs: 0, runCount: 0 });
      assert.equal(atTokens.ok, false);
      assert.deepEqual(atTokens.breaches, [{ dimension: 'tokens', limit: 1000, spent: 1000 }]);

      let multi = evaluateWorkflowBoardBudget(budget, { tokens: 2000, wallClockMs: 9000, runCount: 1 });
      assert.deepEqual(multi.breaches.map(b => b.dimension), ['tokens', 'wallClockMs']);

      // Unconfigured budget is never a breach.
      let none = evaluateWorkflowBoardBudget(null, { tokens: 10 ** 9 });
      assert.equal(none.ok, true);
      assert.equal(none.configured, false);
    });
  });

  describe('admission breaker (service)', () => {
    let tmpDir;
    let sg;
    let now;
    let idSeq;
    let service;

    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'workflow-budget-'));
      sg = new StateGraph({
        snapshotPath: path.join(tmpDir, 'state.json'),
        walPath: path.join(tmpDir, 'state.wal'),
        chatsDir: path.join(tmpDir, 'chats'),
      });
      now = 1000;
      idSeq = 0;
      service = createWorkflowBoardService({
        stateGraph: sg,
        now: () => now++,
        makeId: (prefix) => `${prefix}-${++idSeq}`,
        projectRoot: tmpDir,
        proxyManager: makeLedgerProxy().proxy,
        defaultPrincipal: humanPrincipal({ transport: { channel: 'loopback' }, label: 'local-human' }),
      });
    });

    afterEach(async () => {
      await sg.flushChatWrites();
      sg.flush();
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    function makeReadyCard() {
      return service.createOrUpdateCard({
        title: `Card ${++idSeq}`,
        body: 'Schedulable work item.',
        columnId: 'ready',
        projectId: 'agent-portal',
        domain: 'backend',
        owner: 'orchestrator',
        assignedAgent: 'backend-engineer',
        resourceGroup: 'impl',
        acceptanceCriteria: ['Admitted by the scheduler'],
        actor: 'test',
      }).card;
    }

    function seedRun(boardId, cardId, tokens, status = 'completed') {
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
        tokens,
        taskIds: [],
      } }], 'test:seed-run');
      return runId;
    }

    function budgetBreakerEvents() {
      return Object.values(sg.get('workflowTransitions') || {})
        .filter(event => (event.sideEffects || []).some(effect => effect.type === 'budget_breaker'));
    }

    it('admits normally while cumulative spend is under budget', async () => {
      let board = service.ensureBoard();
      service.updateWorkflowBoard({ patch: { automation: { budget: { tokens: 100000 } } }, actor: 'test', reason: 'set budget' });
      seedRun(board.id, 'historic', 40000);

      let card = makeReadyCard();
      service.enqueueWorkItem(service.ensureBoard(), service.getCard(card.id), {});
      let drain = await service.drainWorkflowQueue(board.id, {});

      assert.equal(drain.drained, true);
      assert.equal(service.getCard(card.id).lifecycle, 'running', 'under-budget card admits');
      assert.equal(service.ensureBoard().mode, 'armed', 'board stays armed under budget');
      assert.equal(budgetBreakerEvents().length, 0);
    });

    it('on breach: refuses admission for the pass, flips the board to paused, and escalates', async () => {
      let board = service.ensureBoard();
      service.updateWorkflowBoard({ patch: { automation: { budget: { tokens: 50000 } } }, actor: 'test', reason: 'set budget' });
      // Two prior runs already sum past the ceiling.
      seedRun(board.id, 'historic-a', 30000);
      seedRun(board.id, 'historic-b', 25000);

      let card = makeReadyCard();
      service.enqueueWorkItem(service.ensureBoard(), service.getCard(card.id), {});
      let drain = await service.drainWorkflowQueue(board.id, {});

      assert.equal(drain.drained, false, 'pass refused');
      assert.equal(drain.reason, 'board_budget_exhausted');
      assert.equal(service.getCard(card.id).lifecycle, 'queued', 'card not admitted — entry preserved');
      assert.equal(service.ensureBoard().mode, 'paused', 'board flipped to paused');

      let events = budgetBreakerEvents();
      assert.equal(events.length, 1, 'one board-level escalation raised');
      let effect = events[0].sideEffects.find(e => e.type === 'budget_breaker');
      assert.equal(effect.kind, 'needs_decision');
      assert.deepEqual(effect.breaches.map(b => b.dimension), ['tokens']);
      assert.equal(effect.spend.tokens, 55000);

      // The breaker records its tripped state on the board for human re-arming.
      assert.equal(service.ensureBoard().metadata.budgetBreaker.spend.tokens, 55000);

      // Idempotent: a second drain on the already-tripped board refuses without spamming escalations.
      let drain2 = await service.drainWorkflowQueue(board.id, {});
      assert.equal(drain2.drained, false);
      assert.equal(budgetBreakerEvents().length, 1, 'no duplicate escalation while already tripped');
    });

    it('a wide decompose subtree is named in the breach escalation', async () => {
      let board = service.ensureBoard();
      service.updateWorkflowBoard({ patch: { automation: { budget: { tokens: 10000 } } }, actor: 'test', reason: 'set budget' });
      let parent = service.createOrUpdateCard({
        title: 'Decompose parent', body: 'root', columnId: 'in-progress', projectId: 'agent-portal',
        domain: 'backend', owner: 'orchestrator', acceptanceCriteria: ['done'], actor: 'test',
      }).card;
      let child = service.createOrUpdateCard({
        title: 'Decompose child', body: 'child', columnId: 'in-progress', projectId: 'agent-portal',
        domain: 'backend', owner: 'orchestrator', acceptanceCriteria: ['done'], parentCardId: parent.id, actor: 'test',
      }).card;
      seedRun(board.id, parent.id, 4000);
      seedRun(board.id, child.id, 8000);

      let card = makeReadyCard();
      service.enqueueWorkItem(service.ensureBoard(), service.getCard(card.id), {});
      await service.drainWorkflowQueue(board.id, {});

      let effect = budgetBreakerEvents()[0].sideEffects.find(e => e.type === 'budget_breaker');
      assert.equal(effect.topSubtree.rootCardId, parent.id, 'heaviest subtree rolls children under the root parent');
      assert.equal(effect.topSubtree.tokens, 12000);
    });
  });
});
