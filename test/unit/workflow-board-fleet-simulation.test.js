import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { DEFAULT_WORKFLOW_BOARD_ID } from '../../src/iso/workflow-board.js';
import { StateGraph } from '../../src/node/state-graph.js';
import { createWorkflowBoardService } from '../../src/node/workflow-board-service.js';
import { humanPrincipal } from '../../src/node/server/principal.js';

// Fleet simulation: extends the single-card chain simulator to MULTIPLE cards driven through the same
// real reconcile tick — the product's actual use case (autonomous parallel work: many cards, many
// agents, decomposed task groups). Each running agent-pool task is mapped back to its card (via the
// task record's workflowCardId the service stamps) so per-card outcome scripts drive independently.
// The fleet-level liveness property: EVERY card ends terminal or parked, none frozen, and the board's
// runtime liveness audit reports zero frozen cards.

const MAX_ITERATIONS = 120;
const MAX_IDLE_JUMPS = 8;
const HOUR_MS = 3_600_000;

const OUTCOMES = {
  exec_ok: { status: 'completed', text: 'Work complete.\nWORKFLOW_RESULT: completed' },
  audit_pass: { status: 'completed', text: 'Reviewed.\nCOMPLETION_PROOF: PASS' },
  audit_fail: { status: 'completed', text: 'Criterion unmet.\nCOMPLETION_PROOF: FAIL' },
  ok_pass: { status: 'completed', text: 'Done.\nCOMPLETION_PROOF: PASS' },
};

// Stubbed release probe (see the chain simulator): reports a shippable changeset so the autonomous
// publish path drives without real git, keeping the fleet fast and contention-free.
const SIM_RELEASE_GATE = () => ({
  available: true, hasDiff: true, hygiene: true, changedFiles: 1, changedPaths: ['docs/sim.md'], offenders: [],
  reason: 'sim: shippable changeset',
});

describe('workflow board fleet simulation (multi-card liveness)', () => {
  let cleanups = [];

  afterEach(async () => {
    for (let fn of cleanups.splice(0)) await fn();
  });

  function makeFleet() {
    let tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'workflow-fleet-sim-'));
    fs.mkdirSync(path.join(tmpDir, 'chats'), { recursive: true });
    let repo = path.join(tmpDir, 'repo');
    fs.mkdirSync(repo, { recursive: true });
    let sg = new StateGraph({
      snapshotPath: path.join(tmpDir, 'state.json'),
      walPath: path.join(tmpDir, 'state.wal'),
      chatsDir: path.join(tmpDir, 'chats'),
    });
    let simNow = 1_000_000_000;
    let clock = () => (simNow += 1);
    let idSeq = 0;
    let tasks = new Map();
    let taskSeq = 0;
    let proxy = {
      requestFromChild: async (server, method, payload = {}) => {
        if (server !== 'agent-pool') return { content: [{ type: 'text', text: 'ok' }] };
        let name = payload?.name;
        let args = payload?.arguments ?? {};
        if (name === 'delegate_task') {
          let id = `${(++taskSeq).toString().padStart(8, '0')}-0000-4000-8000-000000000000`;
          tasks.set(id, { id, status: 'running', chatId: args.chat_id ?? null, cwd: args.cwd ?? null, events: [], startedAt: simNow, updatedAt: simNow });
          return { content: [{ type: 'text', text: `Started task ${id}` }] };
        }
        if (name === 'list_tasks') return { content: [{ type: 'text', text: JSON.stringify({ tasks: [...tasks.values()] }) }] };
        if (name === 'release_slot') return { content: [{ type: 'text', text: 'released' }] };
        return { content: [{ type: 'text', text: '{}' }] };
      },
      chatWsServer: { taskChatMap: new Map() },
    };
    let service = createWorkflowBoardService({
      stateGraph: sg,
      now: clock,
      makeId: (prefix) => `${prefix}-${++idSeq}`,
      projectRoot: tmpDir,
      proxyManager: proxy,
      worktreeOps: {
        isGitRepo: async () => false,
        provisionWorktree: async () => ({ ok: false }),
        commitWorktree: async () => ({ ok: false }),
        mergeWorktree: async () => ({ ok: false }),
        removeWorktree: async () => ({ ok: true }),
        reapOrphanWorktrees: async () => [],
      },
      probeReleaseTests: async () => ({ available: false }),
      probeReleaseGate: SIM_RELEASE_GATE,
      changesetTouchesCode: () => false,
      defaultPrincipal: humanPrincipal({ transport: { channel: 'loopback' }, label: 'sim-human' }),
    });
    cleanups.push(async () => {
      await sg.flushChatWrites();
      sg.flush();
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });
    service.ensureBoard();

    // Map a running pool task to its card via the task record the service stamps, then pull that
    // card's next scripted outcome. Cards not in the script fall through to a passing filler.
    let applyOutcomes = (scripts) => {
      let applied = 0;
      for (let task of tasks.values()) {
        if (task.status !== 'running') continue;
        let stamped = sg.get(`tasks/${task.id}`);
        let cardId = stamped?.workflowCardId ?? stamped?.workflow?.cardId ?? null;
        let queue = cardId && scripts.has(cardId) ? scripts.get(cardId) : null;
        let key = queue && queue.length ? queue.shift() : 'ok_pass';
        let outcome = OUTCOMES[key] ?? OUTCOMES.ok_pass;
        task.status = outcome.status;
        task.updatedAt = simNow;
        task.completedAt = simNow;
        if (outcome.text) task.events = [{ text: outcome.text }];
        sg.merge(`tasks/${task.id}`, {
          status: outcome.status, updatedAt: simNow, completedAt: simNow,
          events: outcome.text ? [{ text: outcome.text }] : [],
        }, 'sim');
        applied += 1;
      }
      return applied;
    };

    let boardHash = () => JSON.stringify(
      service.getBoardProjection({}).cards
        .map(c => [c.id, c.columnId, c.lifecycle, c.waiting?.reason ?? null, Boolean(c.metadata?.escalation)]),
    );

    let nextTimer = () => {
      let candidates = [];
      for (let card of Object.values(sg.get('workflowCards') ?? {})) {
        let na = Number(card.metadata?.escalation?.nextAttemptAt);
        if (Number.isFinite(na) && na > simNow) candidates.push(na);
      }
      for (let entry of Object.values(sg.get('workflowQueueEntries') ?? {})) {
        let nb = Number(entry.notBefore ?? entry.not_before);
        if (Number.isFinite(nb) && nb > simNow) candidates.push(nb);
      }
      return candidates.length ? Math.min(...candidates) : null;
    };

    async function driveToQuiescence(scripts, { onTick } = {}) {
      let map = scripts instanceof Map ? scripts : new Map(Object.entries(scripts ?? {}));
      let lastHash = null;
      let idleJumps = 0;
      for (let i = 0; i < MAX_ITERATIONS; i++) {
        await service.reconcileTick.tickOnce();
        if (onTick) onTick(i);
        let applied = applyOutcomes(map);
        let hash = boardHash();
        if (hash === lastHash && !applied) {
          let at = nextTimer();
          simNow = (at ?? simNow) + HOUR_MS + 1;
          if (++idleJumps >= MAX_IDLE_JUMPS) break;
        } else {
          idleJumps = 0;
        }
        lastHash = hash;
      }
    }

    return { service, sg, driveToQuiescence, now: () => simNow };
  }

  function terminalColumns(service) {
    let board = service.getBoardProjection({}).board;
    return new Set(board.columns.filter(c => c.automation?.action === 'close').map(c => c.id));
  }

  // Every non-runtime card is terminal or human-parked; the runtime liveness audit sees no frozen card.
  function assertFleetLive(service, label) {
    let projection = service.getBoardProjection({});
    let terminals = terminalColumns(service);
    let humanLane = projection.board.columns.find(c => c.automation?.action === 'await_human')?.id;
    for (let card of projection.cards) {
      if (card.kind === 'runtime-task') continue;
      let ok = terminals.has(card.columnId)
        || (card.columnId === humanLane && card.metadata?.escalation);
      assert.ok(
        ok,
        `${label}: card ${card.id} not settled — column=${card.columnId} lifecycle=${card.lifecycle} `
        + `waiting=${JSON.stringify(card.waiting ?? null)}`,
      );
      if (terminals.has(card.columnId)) {
        assert.equal(card.waiting, null, `${label}: terminal card ${card.id} carries no waiting record`);
      }
    }
    let audit = service.auditBoardLiveness(DEFAULT_WORKFLOW_BOARD_ID);
    assert.equal(audit.frozen.length, 0, `${label}: liveness audit found frozen cards: ${JSON.stringify(audit.frozen)}`);
  }

  function makeCard(service, title, overrides = {}) {
    let { card } = service.createOrUpdateCard({
      title, body: 'Fleet fixture.', columnId: 'ready', projectId: 'sim', domain: 'backend',
      owner: 'orchestrator', assignedAgent: 'backend-engineer',
      acceptanceCriteria: ['Reaches a terminal'], actor: 'sim', ...overrides,
    });
    return card;
  }

  it('parallel independent fleet: three cards all reach the success terminal', async () => {
    let fleet = makeFleet();
    let a = makeCard(fleet.service, 'card-a');
    let b = makeCard(fleet.service, 'card-b');
    let c = makeCard(fleet.service, 'card-c');
    await fleet.driveToQuiescence({
      [a.id]: ['exec_ok', 'audit_pass'],
      [b.id]: ['exec_ok', 'audit_pass'],
      [c.id]: ['exec_ok', 'audit_pass'],
    });
    assertFleetLive(fleet.service, 'parallel');
    let terminals = terminalColumns(fleet.service);
    for (let id of [a.id, b.id, c.id]) {
      assert.ok(terminals.has(fleet.service.getCard(id).columnId), `${id} reached a terminal`);
    }
  });

  it('dependency chain: the downstream card waits (reason=dependency) until its upstream ships', async () => {
    let fleet = makeFleet();
    let up = makeCard(fleet.service, 'upstream');
    let down = makeCard(fleet.service, 'downstream');
    let link = fleet.service.linkDependency({ cardId: down.id, dependsOn: [up.id] });
    assert.equal(link.ok, true, 'dependency linked');

    let sawDependencyWait = false;
    await fleet.driveToQuiescence(
      {
        [up.id]: ['exec_ok', 'audit_pass'],
        [down.id]: ['exec_ok', 'audit_pass'],
      },
      {
        onTick: () => {
          let d = fleet.service.getBoardProjection({}).cards.find(c => c.id === down.id);
          let upCard = fleet.service.getCard(up.id);
          // While the upstream is not yet in a terminal, the downstream must not have run: it is
          // dependency-blocked and its single derived waiting reason says so.
          if (d && upCard && !terminalColumns(fleet.service).has(upCard.columnId)) {
            if (d.waiting?.reason === 'dependency') sawDependencyWait = true;
            assert.ok(
              !fleet.sg.get('workflowRuns') || !Object.values(fleet.sg.get('workflowRuns')).some(
                r => r.cardId === down.id && r.status === 'running',
              ),
              'downstream must not run before its upstream ships',
            );
          }
        },
      },
    );
    assert.ok(sawDependencyWait, 'the downstream card was observed waiting on its dependency');
    assertFleetLive(fleet.service, 'dependency');
    let terminals = terminalColumns(fleet.service);
    assert.ok(terminals.has(fleet.service.getCard(up.id).columnId), 'upstream terminal');
    assert.ok(terminals.has(fleet.service.getCard(down.id).columnId), 'downstream terminal');
  });

  it('decompose fan-out: parent auto-closes, both children run and reach a terminal', async () => {
    let fleet = makeFleet();
    let parent = makeCard(fleet.service, 'parent-idea');
    let decomposed = await fleet.service.decomposeWorkItem({
      cardId: parent.id,
      childItems: [
        { id: 'child-1', title: 'child one', columnId: 'ready', owner: 'orchestrator', acceptanceCriteria: ['done'] },
        { id: 'child-2', title: 'child two', columnId: 'ready', owner: 'orchestrator', acceptanceCriteria: ['done'] },
      ],
    });
    assert.equal(decomposed.ok, true, 'decompose succeeded');
    let terminals = terminalColumns(fleet.service);
    assert.ok(terminals.has(fleet.service.getCard(parent.id).columnId), 'parent auto-closed on decompose');

    await fleet.driveToQuiescence({
      'child-1': ['exec_ok', 'audit_pass'],
      'child-2': ['exec_ok', 'audit_pass'],
    });
    assertFleetLive(fleet.service, 'decompose');
    assert.ok(terminals.has(fleet.service.getCard('child-1').columnId), 'child-1 terminal');
    assert.ok(terminals.has(fleet.service.getCard('child-2').columnId), 'child-2 terminal');
  });

  it('mixed fleet with a rework straggler: everything still converges, none frozen', async () => {
    let fleet = makeFleet();
    let a = makeCard(fleet.service, 'clean');
    let b = makeCard(fleet.service, 'reworked');
    await fleet.driveToQuiescence({
      [a.id]: ['exec_ok', 'audit_pass'],
      [b.id]: ['exec_ok', 'audit_fail', 'exec_ok', 'audit_pass'],
    });
    assertFleetLive(fleet.service, 'mixed');
    let terminals = terminalColumns(fleet.service);
    assert.ok(terminals.has(fleet.service.getCard(a.id).columnId), 'clean card terminal');
    assert.ok(terminals.has(fleet.service.getCard(b.id).columnId), 'reworked card terminal');
  });
});
