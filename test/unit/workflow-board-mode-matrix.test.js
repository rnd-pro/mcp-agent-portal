import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { StateGraph } from '../../src/node/state-graph.js';
import { createWorkflowBoardService } from '../../src/node/workflow-board-service.js';
import { humanPrincipal } from '../../src/node/server/principal.js';

// Same ledger-backed agent-pool stub the WS-B1 scheduler test uses: it reserves one capacity slot
// per `admission_id` under a per-group limit and returns the at-capacity rejection text the real
// agent-pool returns. No CLI is ever spawned.
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
    activeForGroup,
    slotCount() { return slots.size; },
  };
}

// The board mode matrix the scheduler enforces (AD-16): the drain re-reads `board.mode` per card and
// SKIPS admission for the no-admit modes; only `armed` / `autonomous` admit a queued card when there
// is capacity. A queued card under a no-admit mode stays `queued` (no run started, no ledger slot).
const NO_ADMIT_MODES = ['paused', 'draining', 'stopped', 'maintenance', 'recovery_only'];
const ADMIT_MODES = ['armed', 'autonomous'];

describe('workflow board-mode × scheduler matrix (inv 30)', () => {
  let tmpDir;
  let sg;
  let now;
  let idSeq;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'workflow-mode-matrix-'));
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

  // Raise the board/stage pre-check limits high so capacity is never the reason a card is held: the
  // board mode is the sole admission gate under test.
  function relaxBoardPreChecks(service) {
    service.updateWorkflowBoard({
      patch: { automation: { globalParallelLimit: 999 } },
      actor: 'test',
      reason: 'test: board mode is the admission gate',
    });
    service.updateWorkflowColumn({
      columnId: 'ready',
      patch: { automation: { parallelLimit: 999 } },
      actor: 'test',
      reason: 'test: board mode is the admission gate',
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
      acceptanceCriteria: ['Admitted by the scheduler'],
      actor: 'test',
    });
    return created.card;
  }

  function setBoardMode(service, mode) {
    service.updateWorkflowBoard({ patch: { mode }, actor: 'test', reason: `test: set board mode ${mode}` });
  }

  for (let mode of NO_ADMIT_MODES) {
    it(`mode "${mode}" does NOT admit a queued card (lifecycle stays queued, no run, no slot)`, async () => {
      let ledger = makeLedgerProxy({ groupLimits: { impl: 5 } });
      let service = makeService(ledger.proxy);
      relaxBoardPreChecks(service);
      let board = service.ensureBoard();

      let card = makeReadyCard(service, { resourceGroup: 'impl' });
      service.enqueueWorkItem(board, service.getCard(card.id), {});
      assert.equal(service.getCard(card.id).lifecycle, 'queued', 'card is queued before drain');

      // Flip the board into the no-admit mode via the board-update path, then drain.
      setBoardMode(service, mode);
      let drain = await service.drainWorkflowQueue(board.id, {});

      assert.equal(drain.admitted.length, 0, `mode ${mode} admits nothing`);
      assert.equal(service.getCard(card.id).lifecycle, 'queued', `mode ${mode}: card stays queued`);
      assert.equal(ledger.activeForGroup('impl'), 0, `mode ${mode}: no ledger slot reserved`);
      assert.ok(
        drain.skipped.some(s => s.reason === `board_mode_${mode}`),
        `mode ${mode}: drain records a board_mode skip`,
      );
    });
  }

  for (let mode of ADMIT_MODES) {
    it(`mode "${mode}" admits a queued card when capacity allows (lifecycle → running)`, async () => {
      let ledger = makeLedgerProxy({ groupLimits: { impl: 5 } });
      let service = makeService(ledger.proxy);
      relaxBoardPreChecks(service);
      let board = service.ensureBoard();

      let card = makeReadyCard(service, { resourceGroup: 'impl' });
      service.enqueueWorkItem(board, service.getCard(card.id), {});
      assert.equal(service.getCard(card.id).lifecycle, 'queued', 'card is queued before drain');

      setBoardMode(service, mode);
      let drain = await service.drainWorkflowQueue(board.id, {});

      assert.equal(drain.admitted.length, 1, `mode ${mode} admits the queued card`);
      assert.equal(service.getCard(card.id).lifecycle, 'running', `mode ${mode}: card is running`);
      assert.equal(ledger.activeForGroup('impl'), 1, `mode ${mode}: exactly one slot reserved`);
    });
  }
});
