import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { StateGraph } from '../../src/node/state-graph.js';
import { createWorkflowBoardService } from '../../src/node/workflow-board-service.js';
import { humanPrincipal } from '../../src/node/server/principal.js';

// Board chain simulation: drive the REAL reconcile tick (the exact production cycle) over the
// default autonomous board with a virtual clock and a simulated agent-pool, enumerating worker
// outcome CHAINS (exec ok/fail/lost/blocked × audit pass/fail/silent/error × human reply/no-reply).
// Each chain runs to quiescence — ticks until the state stops changing even after fast-forwarding
// past every backoff/stale timer — then asserts the board's core liveness property:
//
//   every card ends in a terminal column, or parked for a human with a live escalation —
//   NEVER silently frozen in an active column with no driver left.
//
// This is the executable form of the occupancy guarantee `escalateStaleCards` promises; a chain
// that quiesces "frozen" is a real stall bug, the class the AU01–AU21 audit hunted by hand.

const MAX_ITERATIONS = 60;
const MAX_IDLE_JUMPS = 6;
const HOUR_MS = 60 * 60 * 1000;

// Worker-outcome alphabet. `writeFile` simulates real produced work (an uncommitted doc change in
// the card's repo) so the release tail's clean-diff probe sees a shippable, test-exempt changeset.
const OUTCOMES = {
  exec_ok: { status: 'completed', text: 'Work complete.\nWORKFLOW_RESULT: completed', writeFile: true },
  exec_fail: { status: 'failed', text: 'Build exploded halfway through.' },
  exec_lost: { status: 'lost', text: null },
  exec_block_human: {
    status: 'failed',
    text: 'WORKFLOW_RESULT: blocked\nESCALATION_KIND: needs_human\nESCALATION_DETAIL: Which API version should this target?',
  },
  exec_block_decision: {
    status: 'failed',
    text: 'WORKFLOW_RESULT: blocked\nESCALATION_KIND: needs_decision\nESCALATION_DETAIL: Two acceptance criteria conflict.',
  },
  audit_pass: { status: 'completed', text: 'Reviewed every criterion.\nCOMPLETION_PROOF: PASS' },
  audit_fail: { status: 'completed', text: 'Criterion 2 unmet.\nCOMPLETION_PROOF: FAIL (missing coverage)' },
  audit_silent: { status: 'completed', text: 'Looks plausible overall.' },
  audit_error: { status: 'failed', text: 'Auditor crashed before reaching a verdict.' },
  // Filler once a script is exhausted: complete the stage affirmatively so the chain drains.
  ok_pass: { status: 'completed', text: 'Work complete.\nCOMPLETION_PROOF: PASS', writeFile: true },
};

function makeSimPool(clock) {
  let tasks = new Map();
  let seq = 0;
  let proxy = {
    requestFromChild: async (server, method, payload = {}) => {
      if (server !== 'agent-pool') return { content: [{ type: 'text', text: 'ok' }] };
      let name = payload?.name;
      let args = payload?.arguments ?? {};
      if (name === 'delegate_task') {
        let id = `${(++seq).toString().padStart(8, '0')}-0000-4000-8000-000000000000`;
        tasks.set(id, {
          id,
          status: 'running',
          chatId: args.chat_id ?? null,
          cwd: args.cwd ?? null,
          events: [],
          startedAt: clock(),
          updatedAt: clock(),
        });
        return { content: [{ type: 'text', text: `Started task ${id}` }] };
      }
      if (name === 'list_tasks') {
        return { content: [{ type: 'text', text: JSON.stringify({ tasks: [...tasks.values()] }) }] };
      }
      if (name === 'release_slot') return { content: [{ type: 'text', text: 'released' }] };
      return { content: [{ type: 'text', text: '{}' }] };
    },
    chatWsServer: { taskChatMap: new Map() },
  };
  return { proxy, tasks };
}

function initGitRepo(root) {
  fs.mkdirSync(root, { recursive: true });
  let git = (args) => execFileSync('git', args, { cwd: root, stdio: 'ignore' });
  git(['init', '-q']);
  git(['config', 'user.email', 'sim@test.local']);
  git(['config', 'user.name', 'Board Sim']);
  fs.writeFileSync(path.join(root, 'README.md'), 'sim fixture\n');
  git(['add', '.']);
  git(['commit', '-q', '-m', 'init']);
  return root;
}

describe('workflow board chain simulation (liveness to quiescence)', () => {
  let cleanups = [];

  afterEach(async () => {
    for (let fn of cleanups.splice(0)) await fn();
  });

  async function runChain(script, { reply = false, filler = 'ok_pass' } = {}) {
    let tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'workflow-chain-sim-'));
    fs.mkdirSync(path.join(tmpDir, 'chats'), { recursive: true });
    let repo = initGitRepo(path.join(tmpDir, 'repo'));
    let sg = new StateGraph({
      snapshotPath: path.join(tmpDir, 'state.json'),
      walPath: path.join(tmpDir, 'state.wal'),
      chatsDir: path.join(tmpDir, 'chats'),
    });
    let simNow = 1_000_000_000;
    let clock = () => (simNow += 1);
    let idSeq = 0;
    let pool = makeSimPool(() => simNow);
    let service = createWorkflowBoardService({
      stateGraph: sg,
      now: clock,
      makeId: (prefix) => `${prefix}-${++idSeq}`,
      projectRoot: tmpDir,
      proxyManager: pool.proxy,
      // Shared-tree model: no real worktree lifecycle; the clean-diff probe runs on the card's repo.
      worktreeOps: {
        isGitRepo: async () => false,
        provisionWorktree: async () => ({ ok: false }),
        commitWorktree: async () => ({ ok: false }),
        mergeWorktree: async () => ({ ok: false }),
        removeWorktree: async () => ({ ok: true }),
        reapOrphanWorktrees: async () => [],
      },
      probeReleaseTests: async () => ({ available: false }),
      defaultPrincipal: humanPrincipal({ transport: { channel: 'loopback' }, label: 'sim-human' }),
    });
    cleanups.push(async () => {
      await sg.flushChatWrites();
      sg.flush();
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    service.ensureBoard();
    let { card } = service.createOrUpdateCard({
      title: 'Chain card',
      body: 'Simulated work item.',
      columnId: 'ready',
      projectId: 'sim',
      domain: 'backend',
      owner: 'orchestrator',
      assignedAgent: 'backend-engineer',
      acceptanceCriteria: ['Chain reaches a terminal or a human'],
      cwd: repo,
      actor: 'sim',
    });

    let queue = [...script];
    let repliesLeft = reply ? 1 : 0;
    let outcomesApplied = [];
    let lastHash = null;
    let idleJumps = 0;

    let applyOutcome = (task) => {
      let outcome = OUTCOMES[queue.shift() ?? filler];
      task.status = outcome.status;
      task.updatedAt = simNow;
      task.completedAt = simNow;
      if (outcome.text) task.events = [{ text: outcome.text }];
      // The reconcile tick reads task state from the STATE GRAPH task record (the task-router's
      // production write path), not from agent-pool list_tasks — mirror the outcome there.
      sg.merge(`tasks/${task.id}`, {
        status: outcome.status,
        updatedAt: simNow,
        completedAt: simNow,
        events: outcome.text ? [{ text: outcome.text }] : [],
      }, 'sim');
      if (outcome.writeFile && task.cwd) {
        fs.mkdirSync(path.join(task.cwd, 'docs'), { recursive: true });
        fs.writeFileSync(path.join(task.cwd, 'docs', `sim-${outcomesApplied.length}.md`), 'change\n');
      }
      outcomesApplied.push(outcome);
    };

    let stateHash = () => {
      let live = service.getCard(card.id);
      let runs = Object.values(sg.get('workflowRuns') ?? {}).map(run => [run.id, run.status]);
      let queueEntries = Object.values(sg.get('workflowQueueEntries') ?? {}).map(e => [e.cardId, e.phase ?? 'queued']);
      let taskStates = [...pool.tasks.values()].map(t => [t.id, t.status]);
      return JSON.stringify([live.version, live.columnId, live.lifecycle, live.metadata?.escalation ?? null, runs, queueEntries, taskStates]);
    };

    let nextTimer = () => {
      let live = service.getCard(card.id);
      let candidates = [];
      let nextAttemptAt = Number(live.metadata?.escalation?.nextAttemptAt);
      if (Number.isFinite(nextAttemptAt) && nextAttemptAt > simNow) candidates.push(nextAttemptAt);
      for (let entry of Object.values(sg.get('workflowQueueEntries') ?? {})) {
        let notBefore = Number(entry.notBefore ?? entry.not_before);
        if (Number.isFinite(notBefore) && notBefore > simNow) candidates.push(notBefore);
      }
      return candidates.length ? Math.min(...candidates) : null;
    };

    for (let i = 0; i < MAX_ITERATIONS; i++) {
      await service.reconcileTick.tickOnce();
      let applied = false;
      for (let task of pool.tasks.values()) {
        if (task.status === 'running') { applyOutcome(task); applied = true; }
      }
      if (!applied && repliesLeft > 0) {
        let live = service.getCard(card.id);
        let escalation = live.metadata?.escalation;
        if (escalation && (escalation.kind === 'needs_human' || escalation.kind === 'needs_decision')) {
          let replied = service.replyToCard({ cardId: card.id, body: 'Target the v2 API.', resolve: true, actor: 'sim-human' });
          assert.equal(replied.ok, true, 'human reply lands');
          repliesLeft -= 1;
          applied = true;
        }
      }
      let hash = stateHash();
      if (hash === lastHash && !applied) {
        let at = nextTimer();
        simNow = (at ?? simNow) + HOUR_MS + 1;
        idleJumps += 1;
        if (idleJumps >= MAX_IDLE_JUMPS) break;
      } else {
        idleJumps = 0;
      }
      lastHash = hash;
    }

    return { service, sg, cardId: card.id, pool, outcomesApplied };
  }

  // Quiescence classifier: the liveness verdict for a card once nothing moves any more.
  function classify(service, sg, cardId) {
    let projection = service.getBoardProjection({});
    let board = projection.board;
    let card = projection.cards.find(item => item.id === cardId);
    let closeColumns = new Map(board.columns
      .filter(column => column.automation?.action === 'close')
      .map(column => [column.id, column.automation?.closeKind ?? 'success']));
    let decisionColumnId = board.columns.find(column => column.automation?.action === 'await_human')?.id;
    if (closeColumns.has(card.columnId)) {
      return { state: 'terminal', closeKind: closeColumns.get(card.columnId), card };
    }
    if (card.columnId === decisionColumnId && card.metadata?.escalation) {
      return { state: 'parked', card };
    }
    return { state: 'frozen', card };
  }

  function assertLive(result, label) {
    let verdict = classify(result.service, result.sg, result.cardId);
    assert.notEqual(
      verdict.state,
      'frozen',
      `${label}: card must reach a terminal or a human, got frozen in `
      + `${verdict.card.columnId} (lifecycle=${verdict.card.lifecycle}, `
      + `flags=${JSON.stringify(verdict.card.recoveryFlags)}, `
      + `escalation=${JSON.stringify(verdict.card.metadata?.escalation ?? null)})`,
    );
    let runs = Object.values(result.sg.get('workflowRuns') ?? {});
    assert.ok(runs.length <= 128, `${label}: run count ${runs.length} stays under the convergence cap`);
    if (verdict.state === 'terminal') {
      assert.equal(result.sg.get(`workflowLeases/${result.cardId}`), undefined, `${label}: a terminal card holds no lease`);
    }
    return verdict;
  }

  it('happy chain: exec ok → audit pass → autonomous publish reaches the success terminal', async () => {
    let result = await runChain(['exec_ok', 'audit_pass']);
    let verdict = assertLive(result, 'happy');
    assert.equal(verdict.state, 'terminal');
    assert.equal(verdict.closeKind, 'success');
  });

  it('rework chain: audit fail routes back, second pass ships', async () => {
    let result = await runChain(['exec_ok', 'audit_fail', 'exec_ok', 'audit_pass']);
    let verdict = assertLive(result, 'rework');
    assert.equal(verdict.state, 'terminal');
    assert.equal(verdict.closeKind, 'success');
  });

  it('exhaustion chain: repeated audit failures end at a human or a terminal, never frozen', async () => {
    let result = await runChain([
      'exec_ok', 'audit_fail', 'exec_ok', 'audit_fail',
      'exec_ok', 'audit_fail', 'exec_ok', 'audit_fail',
      'exec_ok', 'audit_fail',
    ]);
    let verdict = assertLive(result, 'exhaustion');
    assert.notEqual(verdict.closeKind, 'success', 'a never-passing card must not ship');
  });

  it('lost-run chain: a resumable interruption re-orchestrates and still ships', async () => {
    let result = await runChain(['exec_lost', 'exec_ok', 'audit_pass']);
    let verdict = assertLive(result, 'lost-run');
    assert.equal(verdict.state, 'terminal');
    assert.equal(verdict.closeKind, 'success');
  });

  it('hard-failure chain: a failed exec run still converges through audit', async () => {
    let result = await runChain(['exec_fail', 'audit_fail', 'exec_ok', 'audit_pass']);
    assertLive(result, 'hard-failure');
  });

  it('silent-audit chain: a verdict-less audit is not a pass; shipping needs extra verified cycles', async () => {
    let result = await runChain(['exec_ok', 'audit_silent']);
    let verdict = assertLive(result, 'silent-audit');
    // A silent audit must not DIRECTLY advance the card: if the two scripted outcomes had been
    // enough to ship, no filler outcome would have been consumed.
    assert.ok(
      result.outcomesApplied.length > 2,
      'a verdict-less audit forces extra re-engagement cycles before any terminal',
    );
    if (verdict.state === 'terminal' && verdict.closeKind === 'success') {
      let last = result.outcomesApplied[result.outcomesApplied.length - 1];
      assert.match(last.text ?? '', /COMPLETION_PROOF: PASS/, 'only an explicit later PASS ships the card');
    }
  });

  it('audit-crash chain: an errored audit run converges', async () => {
    let result = await runChain(['exec_ok', 'audit_error', 'exec_ok', 'audit_pass']);
    assertLive(result, 'audit-crash');
  });

  it('needs_human chain without a reply parks for the human and stays parked', async () => {
    let result = await runChain(['exec_block_human']);
    let verdict = assertLive(result, 'needs_human/no-reply');
    assert.equal(verdict.state, 'parked', 'a human question with no answer waits in the decision lane');
  });

  it('needs_human chain with a resolving reply resumes and ships', async () => {
    let result = await runChain(['exec_block_human', 'exec_ok', 'audit_pass'], { reply: true });
    let verdict = assertLive(result, 'needs_human/replied');
    assert.equal(verdict.state, 'terminal');
    assert.equal(verdict.closeKind, 'success');
  });

  it('needs_decision chain re-engages after backoff and ships', async () => {
    let result = await runChain(['exec_block_decision', 'exec_ok', 'audit_pass']);
    let verdict = assertLive(result, 'needs_decision/recovers');
    assert.equal(verdict.state, 'terminal');
    assert.equal(verdict.closeKind, 'success');
  });

  it('perma-blocked chain: endless needs_decision blocks with a truthful auditor retire the card, never freeze or ship it', async () => {
    // Filler audit_fail = a truthful auditor: the work really is half-done, so any audit run the
    // board interleaves reports FAIL instead of laundering the unresolved block into a ship.
    let result = await runChain([
      'exec_block_decision', 'exec_block_decision', 'exec_block_decision',
      'exec_block_decision', 'exec_block_decision', 'exec_block_decision',
      'exec_block_decision',
    ], { filler: 'audit_fail' });
    let verdict = assertLive(result, 'perma-blocked');
    assert.notEqual(verdict.closeKind, 'success', 'a never-unblocked card must not ship');
  });
});
