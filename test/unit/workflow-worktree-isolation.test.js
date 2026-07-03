import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { DEFAULT_WORKFLOW_BOARD_ID } from '../../src/iso/workflow-board.js';
import { StateGraph } from '../../src/node/state-graph.js';
import { createWorkflowBoardService } from '../../src/node/workflow-board-service.js';
import { humanPrincipal } from '../../src/node/server/principal.js';

// A captured-call stub for the worktree git ops, so these tests exercise the SERVICE's orchestration of
// the worktree lifecycle (provision on dispatch, commit+merge+cleanup at publish, conflict park, reaper)
// without spawning real git — the real git behavior is covered by workflow-worktree.test.js.
function makeWorktreeStub(overrides = {}) {
  let calls = [];
  let base = {
    isGitRepo: async () => true,
    provisionWorktree: async ({ cardId, repoRoot, worktreeRoot }) => {
      calls.push({ op: 'provision', cardId, repoRoot, worktreeRoot });
      return {
        ok: true, path: `/wt/${cardId}`, branch: `agent-portal/${cardId}`,
        baseRef: 'main', baseSha: 'deadbeef', reused: false,
      };
    },
    commitWorktree: async ({ worktreePath }) => {
      calls.push({ op: 'commit', worktreePath });
      return { ok: true, committed: true, sha: 'c0ffee' };
    },
    mergeWorktree: async ({ branch }) => {
      calls.push({ op: 'merge', branch });
      return { ok: true, merged: true };
    },
    removeWorktree: async ({ worktreePath, branch }) => {
      calls.push({ op: 'remove', worktreePath, branch });
      return { ok: true };
    },
    reapOrphanWorktrees: async () => { calls.push({ op: 'reap' }); return []; },
  };
  return { stub: { ...base, ...overrides }, calls };
}

describe('per-card worktree isolation (service wiring)', () => {
  let tmpDir;
  let sg;
  let now;
  let idSeq;
  let calls;
  let stub;
  let service;
  let ledgerCalls;

  function makeLedgerProxy() {
    ledgerCalls = [];
    let taskSeq = 0;
    return {
      requestFromChild: async (server, _method, payload) => {
        ledgerCalls.push({ server, payload });
        if (server !== 'agent-pool') return { content: [{ type: 'text', text: 'ok' }] };
        let taskId = `${(++taskSeq).toString().padStart(8, '0')}-0000-4000-8000-000000000000`;
        return { content: [{ type: 'text', text: `Started task ${taskId}` }] };
      },
      chatWsServer: { taskChatMap: new Map() },
    };
  }

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wt-isolation-'));
    sg = new StateGraph({
      snapshotPath: path.join(tmpDir, 'state.json'),
      walPath: path.join(tmpDir, 'state.wal'),
      chatsDir: path.join(tmpDir, 'chats'),
    });
    now = 1000;
    idSeq = 0;
    ({ stub, calls } = makeWorktreeStub());
    service = createWorkflowBoardService({
      stateGraph: sg,
      now: () => now++,
      makeId: (prefix) => `${prefix}-${++idSeq}`,
      projectRoot: tmpDir,
      proxyManager: makeLedgerProxy(),
      defaultPrincipal: humanPrincipal({ transport: { channel: 'loopback' }, label: 'local-human' }),
      worktreeOps: stub,
      probeReleaseTests: async () => ({ available: false }),
    });
  });

  afterEach(async () => {
    await sg.flushChatWrites();
    sg.flush();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function autonomous() {
    // publishMode after_audit delegates the publish (commit + merge + close) to the board's autonomous tail.
    service.updateWorkflowBoard(
      { mode: 'autonomous', automation: { publishMode: 'after_audit' } }, { gatedBy: 'board.control' },
    );
  }

  function createCard(id, columnId, extra = {}) {
    return service.createOrUpdateCard({
      id,
      title: `Card ${id}`,
      body: 'Work item.',
      columnId,
      projectId: 'agent-portal',
      domain: 'backend',
      owner: 'orchestrator',
      assignedAgent: 'backend-engineer',
      acceptanceCriteria: ['Done'],
      actor: 'test',
      ...extra,
    }).card;
  }

  function lastDelegateCwd() {
    let call = ledgerCalls.filter(c => c.server === 'agent-pool' && c.payload?.name === 'delegate_task').at(-1);
    return call?.payload?.arguments?.cwd ?? null;
  }

  function lastDelegateArgs() {
    let call = ledgerCalls.filter(c => c.server === 'agent-pool' && c.payload?.name === 'delegate_task').at(-1);
    return call?.payload?.arguments ?? null;
  }

  // Plant a card already in commit-publish with its floor checks signed and an isolated worktree, mirroring
  // a card the release tail is about to publish.
  function plantPublishCard(id, { worktree = true } = {}) {
    createCard(id, 'in-progress', { assignedAgent: 'release-manager' });
    // Sign the audit/cleanDiff/hygiene floor as an independent reviewer (AUDIT-capable human principal).
    let reviewer = humanPrincipal({ id: 'code-reviewer', label: 'code-reviewer' });
    service.createOrUpdateCard({ cardId: id, checks: { audit: 'passed', cleanDiff: 'passed', hygiene: 'passed' } }, reviewer);
    let card = service.getCard(id);
    let metadata = { ...card.metadata };
    if (worktree) {
      metadata.worktree = {
        path: `/wt/${id}`, branch: `agent-portal/${id}`, baseRef: 'main', baseSha: 'deadbeef',
        repoRoot: tmpDir, provisionedAt: 900,
      };
    }
    sg.commit([
      { op: 'set', path: `workflowCards/${id}`, value: { ...card, columnId: 'commit-publish', lifecycle: 'idle', metadata } },
      { op: 'set', path: `workflowRuns/run-${id}`, value: {
        schema: 'workflow-run/v1', id: `run-${id}`, boardId: DEFAULT_WORKFLOW_BOARD_ID, cardId: id,
        status: 'completed', taskIds: [`task-${id}`], startedAt: 900, updatedAt: 950, completedAt: 950, leaseOwner: 'code-reviewer',
      } },
    ], 'test:plant-publish');
    return id;
  }

  function drive() {
    return service.reconcileWorkflowRuntimeTasks(
      { boardId: DEFAULT_WORKFLOW_BOARD_ID }, new Map(), { drive: true },
    );
  }

  it('provisions a worktree on dispatch and routes the run cwd into it', async () => {
    autonomous();
    let baseFile = path.join(tmpDir, 'src/x.js');
    let card = createCard('exec-1', 'in-progress', { files: [baseFile] });
    assert.equal(card.metadata?.worktree, undefined, 'no worktree before the first run');

    await service.orchestrateWorkItem({ cardId: 'exec-1', force: true });

    assert.ok(calls.some(c => c.op === 'provision' && c.cardId === 'exec-1'), 'provisionWorktree was called');
    let after = service.getCard('exec-1');
    assert.equal(after.metadata.worktree.path, '/wt/exec-1', 'the worktree record is persisted on the card');
    assert.equal(after.metadata.worktree.branch, 'agent-portal/exec-1');
    assert.equal(lastDelegateCwd(), '/wt/exec-1', 'the delegated run executes in the worktree, not the shared tree');
    let delegateArgs = lastDelegateArgs();
    assert.deepEqual(delegateArgs.files, ['/wt/exec-1/src/x.js'], 'file hints point at the worktree copy');
    assert.equal(delegateArgs.prompt.includes(`- /wt/exec-1/src/x.js`), true, 'prompt ownership scope points at the worktree copy');
    assert.equal(delegateArgs.prompt.includes(baseFile), false, 'prompt does not hand the worker a base-tree edit target');
  });

  it('provisions a worktree for the orchestrate stage too (work runs from the orchestrate column)', async () => {
    autonomous();
    createCard('orch-1', 'ready', { files: ['src/y.js'] });

    await service.orchestrateWorkItem({ cardId: 'orch-1', force: true });

    assert.ok(calls.some(c => c.op === 'provision' && c.cardId === 'orch-1'),
      'a card worked from the orchestrate column gets its worktree, so the work runs isolated');
    assert.equal(service.getCard('orch-1').metadata.worktree.path, '/wt/orch-1');
    assert.equal(lastDelegateCwd(), '/wt/orch-1');
  });

  it('does NOT provision a worktree outside autonomous mode (shared-tree fallback)', async () => {
    service.updateWorkflowBoard({ mode: 'armed' }, { gatedBy: 'board.control' });
    createCard('exec-armed', 'in-progress', { files: ['src/x.js'] });

    await service.orchestrateWorkItem({ cardId: 'exec-armed', force: true });

    assert.equal(calls.some(c => c.op === 'provision'), false, 'no worktree provisioned in armed mode');
    assert.equal(service.getCard('exec-armed').metadata?.worktree, undefined);
    assert.equal(lastDelegateCwd(), tmpDir, 'the run uses the shared project tree');
  });

  it('does NOT provision when isolation is disabled per board', async () => {
    service.updateWorkflowBoard({ mode: 'autonomous', automation: { worktreeIsolation: false } }, { gatedBy: 'board.control' });
    createCard('exec-off', 'in-progress', { files: ['src/x.js'] });

    await service.orchestrateWorkItem({ cardId: 'exec-off', force: true });

    assert.equal(calls.some(c => c.op === 'provision'), false, 'isolation off → no worktree');
    assert.equal(lastDelegateCwd(), tmpDir);
  });

  it('commits + merges the worktree and closes the card at publish, then removes the tree', async () => {
    autonomous();
    plantPublishCard('pub-ok');

    let result = await drive();

    let card = service.getCard('pub-ok');
    assert.equal(card.columnId, 'done', 'a clean merge closes the card to done');
    assert.equal(card.metadata?.worktree, undefined, 'the worktree pointer is cleared on the closed card');
    assert.deepEqual(
      calls.filter(c => ['commit', 'merge', 'remove'].includes(c.op)).map(c => c.op),
      ['commit', 'merge', 'remove'],
      'commit → merge → remove ran in order',
    );
    assert.ok(result.releaseTail.merged.some(m => m.cardId === 'pub-ok'), 'the merge is reported');
    assert.ok(result.releaseTail.closed.includes('pub-ok'));
  });

  it('parks the card in the decision lane on a merge conflict, keeping the worktree for a human', async () => {
    ({ stub, calls } = makeWorktreeStub({
      mergeWorktree: async ({ branch }) => {
        calls.push({ op: 'merge', branch });
        return { ok: false, conflict: true, detail: 'merge conflict in: src/x.js', conflictFiles: ['src/x.js'] };
      },
    }));
    // Rebuild the service with the conflict stub.
    service = createWorkflowBoardService({
      stateGraph: sg, now: () => now++, makeId: (prefix) => `${prefix}-${++idSeq}`,
      projectRoot: tmpDir, proxyManager: makeLedgerProxy(),
      defaultPrincipal: humanPrincipal({ transport: { channel: 'loopback' }, label: 'local-human' }),
      worktreeOps: stub, probeReleaseTests: async () => ({ available: false }),
    });
    autonomous();
    plantPublishCard('pub-conflict');

    let result = await drive();

    let card = service.getCard('pub-conflict');
    assert.equal(card.columnId, 'needs-decision', 'a conflict parks the card in the human-decision lane');
    assert.equal(card.metadata.escalation.kind, 'needs_decision');
    assert.ok(card.metadata.worktree, 'the worktree is kept so a human can resolve it');
    assert.equal(card.metadata.worktree.branch, 'agent-portal/pub-conflict');
    assert.deepEqual(card.metadata.mergeConflict.files, ['src/x.js']);
    assert.equal(calls.some(c => c.op === 'remove'), false, 'the worktree is NOT removed on a conflict');
    assert.ok(result.releaseTail.conflicted.some(c => c.cardId === 'pub-conflict'));
  });

  it('reaps the worktree of a rejected card on the next drive pass', async () => {
    autonomous();
    let card = createCard('rej-1', 'in-progress');
    let metadata = {
      ...card.metadata,
      worktree: { path: '/wt/rej-1', branch: 'agent-portal/rej-1', baseRef: 'main', repoRoot: tmpDir, provisionedAt: 900 },
    };
    sg.commit([
      { op: 'set', path: `workflowCards/rej-1`, value: { ...card, columnId: 'rejected', lifecycle: 'idle', metadata } },
      { op: 'set', path: `workflowRuns/run-rej-1`, value: {
        schema: 'workflow-run/v1', id: 'run-rej-1', boardId: DEFAULT_WORKFLOW_BOARD_ID, cardId: 'rej-1',
        status: 'completed', taskIds: ['task-rej-1'], startedAt: 900, updatedAt: 950, completedAt: 950,
      } },
    ], 'test:plant-rejected');

    await drive();

    assert.ok(calls.some(c => c.op === 'remove' && c.branch === 'agent-portal/rej-1'), 'the rejected worktree is removed');
    assert.equal(service.getCard('rej-1').metadata?.worktree, undefined, 'the worktree pointer is cleared');
  });

  it('lets two same-file cards run in parallel under isolation (no file-scope block)', async () => {
    autonomous();
    // Card A is already running in its own worktree on src/shared.js.
    let a = createCard('par-a', 'in-progress', { files: ['src/shared.js'] });
    let aMeta = {
      ...a.metadata,
      worktree: { path: '/wt/par-a', branch: 'agent-portal/par-a', baseRef: 'main', repoRoot: tmpDir, provisionedAt: 900 },
    };
    sg.commit([
      { op: 'set', path: `workflowCards/par-a`, value: { ...a, columnId: 'in-progress', lifecycle: 'running', metadata: aMeta } },
      { op: 'set', path: `workflowRuns/run-par-a`, value: {
        schema: 'workflow-run/v1', id: 'run-par-a', boardId: DEFAULT_WORKFLOW_BOARD_ID, cardId: 'par-a',
        status: 'running', taskIds: ['task-par-a'], startedAt: 900, updatedAt: 950,
      } },
    ], 'test:plant-running-a');

    // Card B wants the SAME file. Under isolation it must start anyway — no shared-tree clobber.
    createCard('par-b', 'in-progress', { files: ['src/shared.js'] });
    let res = await service.orchestrateWorkItem({ cardId: 'par-b' });
    assert.equal(res.ok, true, 'card B starts despite overlapping files with running card A');
    assert.ok(calls.some(c => c.op === 'provision' && c.cardId === 'par-b'), 'card B gets its own worktree');
  });

  it('STILL blocks two same-file cards when isolation is disabled (shared tree)', async () => {
    service.updateWorkflowBoard({ mode: 'autonomous', automation: { worktreeIsolation: false } }, { gatedBy: 'board.control' });
    let a = createCard('shr-a', 'in-progress', { files: ['src/shared.js'] });
    sg.commit([
      { op: 'set', path: `workflowCards/shr-a`, value: { ...a, columnId: 'in-progress', lifecycle: 'running' } },
      { op: 'set', path: `workflowRuns/run-shr-a`, value: {
        schema: 'workflow-run/v1', id: 'run-shr-a', boardId: DEFAULT_WORKFLOW_BOARD_ID, cardId: 'shr-a',
        status: 'running', taskIds: ['task-shr-a'], startedAt: 900, updatedAt: 950,
      } },
    ], 'test:plant-running-shr-a');

    createCard('shr-b', 'in-progress', { files: ['src/shared.js'] });
    await assert.rejects(
      () => service.orchestrateWorkItem({ cardId: 'shr-b' }),
      /file scope/i,
      'without isolation, the shared-tree file-scope block still serializes same-file cards',
    );
  });

  it('blocks a same-file card whose provision already failed (known degraded — shared tree)', async () => {
    autonomous();
    let a = createCard('deg-a', 'in-progress', { files: ['src/shared.js'] });
    let b = createCard('deg-b', 'in-progress', { files: ['src/shared.js'] });
    sg.commit([
      { op: 'set', path: `workflowCards/deg-a`, value: { ...a, columnId: 'in-progress', lifecycle: 'running' } },
      { op: 'set', path: `workflowRuns/run-deg-a`, value: {
        schema: 'workflow-run/v1', id: 'run-deg-a', boardId: DEFAULT_WORKFLOW_BOARD_ID, cardId: 'deg-a',
        status: 'running', taskIds: ['task-deg-a'], startedAt: 900, updatedAt: 950,
      } },
      // Card B's provision failed earlier: it is KNOWN to run in the shared tree, so "will isolate"
      // must not skip the blocker for it.
      { op: 'set', path: `workflowCards/deg-b`, value: {
        ...b, metadata: { ...b.metadata, worktreeError: { reason: 'git worktree add failed', at: 900 } },
      } },
    ], 'test:plant-degraded');

    await assert.rejects(
      () => service.orchestrateWorkItem({ cardId: 'deg-b' }),
      /file scope/i,
      'a degraded-isolation card serializes on file overlap with a running shared-tree peer',
    );
  });

  it('blocks a same-file card in a non-git repo even with isolation enabled (cannot isolate)', async () => {
    stub.isGitRepo = async () => false;
    autonomous();
    let a = createCard('ngit-a', 'in-progress', { files: ['src/shared.js'] });
    sg.commit([
      { op: 'set', path: `workflowCards/ngit-a`, value: { ...a, columnId: 'in-progress', lifecycle: 'running' } },
      { op: 'set', path: `workflowRuns/run-ngit-a`, value: {
        schema: 'workflow-run/v1', id: 'run-ngit-a', boardId: DEFAULT_WORKFLOW_BOARD_ID, cardId: 'ngit-a',
        status: 'running', taskIds: ['task-ngit-a'], startedAt: 900, updatedAt: 950,
      } },
    ], 'test:plant-running-ngit-a');

    createCard('ngit-b', 'in-progress', { files: ['src/shared.js'] });
    await assert.rejects(
      () => service.orchestrateWorkItem({ cardId: 'ngit-b' }),
      /file scope/i,
      'a non-git project can never isolate, so same-file cards serialize',
    );
  });

  // Operational metadata (worktree pointer, escalation, dependency block…) is service-owned: it is
  // written only by the worktree/escalation/dependency paths. A caller's card write must neither wipe
  // it (a dropped worktree pointer makes the publish tail skip commit/merge, then the reaper deletes
  // uncommitted work).
  describe('service-owned worktree metadata survives caller writes', () => {
    it('a metadata patch does not wipe the worktree pointer', () => {
      plantPublishCard('card-keep', { worktree: true });
      let updated = service.createOrUpdateCard({
        cardId: 'card-keep', metadata: { note: 'caller annotation' },
      }).card;
      assert.equal(updated.metadata.note, 'caller annotation', 'caller metadata still lands');
      assert.equal(updated.metadata.worktree?.branch, 'agent-portal/card-keep', 'worktree pointer survives');
    });

    it('a caller cannot set the worktree pointer through metadata input', () => {
      createCard('card-forge', 'backlog');
      let forged = service.createOrUpdateCard({
        cardId: 'card-forge',
        metadata: { worktree: { path: '/evil', branch: 'x', baseRef: 'main' } },
      }).card;
      assert.equal(forged.metadata.worktree, undefined, 'worktree pointer cannot be forged by a card write');

      // And on CREATE a non-daemon caller cannot seed it either.
      let seeded = service.createOrUpdateCard({
        id: 'card-seeded', title: 'Seeded', columnId: 'backlog', actor: 'test',
        metadata: { worktree: { path: '/evil', branch: 'x', baseRef: 'main' } },
      }).card;
      assert.equal(seeded.metadata.worktree, undefined, 'worktree pointer cannot be seeded by a caller');
    });
  });

  // The per-project working directory is captured onto the card at intake (createWorkItem →
  // createOrUpdateCard → normalizeWorkflowCardInput) so a card carrying a `cwd` reaches its own repo.
  describe('cwd capture at intake', () => {
    it('persists args.cwd onto the card through createWorkItem', async () => {
      // Park the board out of autonomous mode so create just persists (no auto-orchestrate dispatch).
      service.updateWorkflowBoard({ mode: 'armed' }, { gatedBy: 'board.control' });
      let extRepo = fs.mkdtempSync(path.join(os.tmpdir(), 'wt-intake-'));
      let result = await service.createWorkItem({
        title: 'External card', columnId: 'backlog', cwd: extRepo, actor: 'test',
      }, { gatedBy: 'card.write' });
      assert.equal(result.ok, true);
      assert.equal(result.card.cwd, extRepo, 'cwd survives createWorkItem onto card.cwd');
      assert.equal(service.getCard(result.card.id).cwd, extRepo, 'and is persisted in the graph');
      fs.rmSync(extRepo, { recursive: true, force: true });
    });

    it('accepts the working_directory / workingDirectory aliases', () => {
      let snake = service.createOrUpdateCard({ id: 'cwd-snake', title: 'A', columnId: 'backlog', working_directory: '/repo/a' }).card;
      assert.equal(snake.cwd, '/repo/a');
      let camel = service.createOrUpdateCard({ id: 'cwd-camel', title: 'B', columnId: 'backlog', workingDirectory: '/repo/b' }).card;
      assert.equal(camel.cwd, '/repo/b');
    });
  });

  // The base repo a card's worktree is cut from, and where its run executes, follow a fixed precedence:
  //   metadata.worktree.repoRoot > card.cwd > resolveRepoForProject(projectId) > projectRoot.
  // These cover each rung. A card with no cwd and no project-path registration must fall back to
  // projectRoot byte-for-byte (the single-repo default).
  describe('cardBaseRepo / cardWorkingDir repo precedence', () => {
    function lastProvision() {
      return calls.filter(c => c.op === 'provision').at(-1) ?? null;
    }

    it('uses the board projectRoot when a card carries neither cwd nor a registered project path', async () => {
      autonomous();
      createCard('base-default', 'in-progress', { files: ['src/x.js'] });

      await service.orchestrateWorkItem({ cardId: 'base-default', force: true });

      assert.equal(lastProvision().repoRoot, tmpDir, 'no cwd / no project path → the board project root');
      assert.equal(lastDelegateCwd(), '/wt/base-default', 'the run executes in the worktree cut from that root');
    });

    it('cuts the worktree from the card cwd when set (an external project repo)', async () => {
      autonomous();
      let extRepo = fs.mkdtempSync(path.join(os.tmpdir(), 'wt-ext-'));
      createCard('base-cwd', 'in-progress', { files: ['src/x.js'], cwd: extRepo });

      await service.orchestrateWorkItem({ cardId: 'base-cwd', force: true });

      assert.equal(lastProvision().repoRoot, extRepo, 'card.cwd is the base repo');
      fs.rmSync(extRepo, { recursive: true, force: true });
    });

    it('resolves the base repo from the registered project path when only projectId travels', async () => {
      autonomous();
      let projRepo = fs.mkdtempSync(path.join(os.tmpdir(), 'wt-proj-'));
      sg.commit([{ op: 'set', path: 'projects/proj-x', value: { name: 'Proj X', path: projRepo } }], 'test:register-project');
      createCard('base-proj', 'in-progress', { files: ['src/x.js'], projectId: 'proj-x' });

      await service.orchestrateWorkItem({ cardId: 'base-proj', force: true });

      assert.equal(lastProvision().repoRoot, projRepo, 'projectId → projects/<id>.path is the base repo');
      fs.rmSync(projRepo, { recursive: true, force: true });
    });

    it('prefers card cwd over the registered project path', async () => {
      autonomous();
      let projRepo = fs.mkdtempSync(path.join(os.tmpdir(), 'wt-proj-'));
      let cwdRepo = fs.mkdtempSync(path.join(os.tmpdir(), 'wt-cwd-'));
      sg.commit([{ op: 'set', path: 'projects/proj-y', value: { name: 'Proj Y', path: projRepo } }], 'test:register-project');
      createCard('base-cwd-wins', 'in-progress', { files: ['src/x.js'], projectId: 'proj-y', cwd: cwdRepo });

      await service.orchestrateWorkItem({ cardId: 'base-cwd-wins', force: true });

      assert.equal(lastProvision().repoRoot, cwdRepo, 'explicit cwd outranks the project-path fallback');
      fs.rmSync(projRepo, { recursive: true, force: true });
      fs.rmSync(cwdRepo, { recursive: true, force: true });
    });

    it('falls back to projectRoot when the card projectId has no registered path (resolveRepoForProject → null)', async () => {
      autonomous();
      createCard('base-unknown-proj', 'in-progress', { files: ['src/x.js'], projectId: 'never-registered' });

      await service.orchestrateWorkItem({ cardId: 'base-unknown-proj', force: true });

      assert.equal(lastProvision().repoRoot, tmpDir, 'an unknown projectId leaves the projectRoot default unchanged');
    });
  });
});
