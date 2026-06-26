import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  branchAheadOfBase,
  cardWorktreeRoot,
  commitWorktree,
  isGitRepo,
  listWorktrees,
  mergeWorktree,
  provisionWorktree,
  reapOrphanWorktrees,
  resolveBaseRef,
} from '../../src/node/workflow-worktree.js';

// Real-git integration: provisions actual worktrees in throwaway repos and exercises the full
// commit → merge → cleanup lifecycle plus the conflict-abort path. Subtests are consolidated and each
// uses a single repo to keep the git-spawn count low — real `git` startup dominates this file's runtime
// and dilates under concurrent suite load, so fewer spawns keeps it clear of the per-test timeout.
describe('workflow worktree isolation (real git)', () => {
  let repoRoot;
  let worktreeRoot;

  function git(args, cwd = repoRoot) {
    return execFileSync('git', args, {
      cwd,
      encoding: 'utf-8',
      env: { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' },
    }).trim();
  }

  function writeFile(rel, contents, cwd = repoRoot) {
    fs.writeFileSync(path.join(cwd, rel), contents);
  }

  beforeEach(() => {
    repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'wt-repo-'));
    git(['init', '-q', '-b', 'main']);
    writeFile('a.txt', 'line1\nline2\n');
    writeFile('b.txt', 'beta\n');
    // Mirror reality: node_modules and the worktree root are gitignored.
    writeFile('.gitignore', 'node_modules/\n.agent-portal-worktrees/\n');
    git(['add', '-A']);
    git(['commit', '-qm', 'base']);
    worktreeRoot = cardWorktreeRoot(repoRoot);
  });

  afterEach(() => {
    fs.rmSync(repoRoot, { recursive: true, force: true });
  });

  it('provisions an isolated worktree off base — idempotent, main tree clean, node_modules linked', async () => {
    fs.mkdirSync(path.join(repoRoot, 'node_modules', 'left-pad'), { recursive: true });
    fs.writeFileSync(path.join(repoRoot, 'node_modules', 'left-pad', 'index.js'), 'module.exports=1;');

    assert.equal(await isGitRepo(repoRoot), true);
    assert.equal(await isGitRepo(os.tmpdir()), false);
    assert.equal(await resolveBaseRef(repoRoot), 'main');

    let prov = await provisionWorktree({ repoRoot, worktreeRoot, cardId: 'card-1' });
    assert.equal(prov.ok, true);
    assert.equal(prov.branch, 'agent-portal/card-1');
    assert.equal(prov.baseRef, 'main');
    assert.equal(prov.reused, false);
    // The worktree must NOT live under .git/ — an agent harness commonly blocks all writes to /.git/
    // paths, which would stop a worker writing into its own worktree.
    assert.ok(!prov.path.split(path.sep).includes('.git'), 'worktree checkout is not under .git/');
    assert.ok(fs.existsSync(path.join(prov.path, 'a.txt')), 'worktree has the checked-out tree');
    assert.equal(fs.lstatSync(path.join(prov.path, 'node_modules')).isSymbolicLink(), true);
    assert.ok(fs.existsSync(path.join(prov.path, 'node_modules', 'left-pad', 'index.js')), 'deps resolve through the link');
    // The node_modules SYMLINK dodges the `node_modules/` directory gitignore, so it is excluded
    // per-worktree: it must NOT show up as a change (else a no-op card would look dirty and the symlink
    // could be committed + merged into base).
    assert.equal(git(['status', '--porcelain'], prov.path), '', 'node_modules is excluded from the worktree');
    // The worktree checkout lives under .git, so the main working tree stays clean.
    assert.equal(git(['status', '--porcelain']), '', 'main tree is unaffected by the worktree');

    let again = await provisionWorktree({ repoRoot, worktreeRoot, cardId: 'card-1' });
    assert.equal(again.reused, true, 'second provision reuses the same worktree');
    assert.equal(path.resolve(again.path), path.resolve(prov.path));
  });

  it('isolates concurrent edits, merges clean, no-ops an empty commit, and reaps orphans', async () => {
    let c1 = await provisionWorktree({ repoRoot, worktreeRoot, cardId: 'card-1' });
    let c2 = await provisionWorktree({ repoRoot, worktreeRoot, cardId: 'card-2' });

    // An empty worktree commits nothing and is not ahead of base.
    let noop = await commitWorktree({ worktreePath: c1.path, message: 'noop' });
    assert.equal(noop.ok, true);
    assert.equal(noop.committed, false);
    assert.equal(await branchAheadOfBase({ repoRoot, branch: c1.branch, baseRef: 'main' }), 0);

    // Two cards edit DIFFERENT files — fully independent, both merge clean.
    writeFile('a.txt', 'line1-c1\nline2\n', c1.path);
    writeFile('b.txt', 'beta-c2\n', c2.path);
    let commit1 = await commitWorktree({ worktreePath: c1.path, message: 'card-1 work' });
    assert.equal(commit1.committed, true);
    assert.equal(await branchAheadOfBase({ repoRoot, branch: c1.branch, baseRef: 'main' }), 1);
    await commitWorktree({ worktreePath: c2.path, message: 'card-2 work' });

    let merge1 = await mergeWorktree({ repoRoot, branch: c1.branch, baseRef: 'main', message: 'merge card-1' });
    assert.equal(merge1.ok, true);
    assert.equal(merge1.merged, true);
    let merge2 = await mergeWorktree({ repoRoot, branch: c2.branch, baseRef: 'main', message: 'merge card-2' });
    assert.equal(merge2.ok, true);
    assert.equal(fs.readFileSync(path.join(repoRoot, 'a.txt'), 'utf-8'), 'line1-c1\nline2\n');
    assert.equal(fs.readFileSync(path.join(repoRoot, 'b.txt'), 'utf-8'), 'beta-c2\n');

    // The reaper removes worktrees + branches whose card is no longer live.
    let removed = await reapOrphanWorktrees({ repoRoot, worktreeRoot, liveCardIds: new Set(['card-1']) });
    assert.deepEqual(removed.map(r => r.cardId), ['card-2']);
    let remaining = await listWorktrees(repoRoot);
    assert.ok(remaining.some(wt => wt.branch === 'agent-portal/card-1'));
    assert.ok(!fs.existsSync(c2.path), 'reaped worktree is gone');
  });

  it('aborts a conflicting merge, restores the base tree, and keeps the worktree for a human', async () => {
    let c1 = await provisionWorktree({ repoRoot, worktreeRoot, cardId: 'card-1' });
    let c2 = await provisionWorktree({ repoRoot, worktreeRoot, cardId: 'card-2' });

    // Both edit the SAME line of a.txt — the second merge must conflict.
    writeFile('a.txt', 'line1-c1\nline2\n', c1.path);
    writeFile('a.txt', 'line1-c2\nline2\n', c2.path);
    await commitWorktree({ worktreePath: c1.path, message: 'card-1' });
    await commitWorktree({ worktreePath: c2.path, message: 'card-2' });

    assert.equal((await mergeWorktree({ repoRoot, branch: c1.branch, baseRef: 'main', message: 'merge c1' })).ok, true);
    let merge2 = await mergeWorktree({ repoRoot, branch: c2.branch, baseRef: 'main', message: 'merge c2' });
    assert.equal(merge2.ok, false);
    assert.equal(merge2.conflict, true);
    assert.deepEqual(merge2.conflictFiles, ['a.txt']);

    // After abort the base tree is restored (card-1's content) and clean — no half-merge stranded.
    assert.equal(git(['status', '--porcelain']), '');
    assert.equal(fs.readFileSync(path.join(repoRoot, 'a.txt'), 'utf-8'), 'line1-c1\nline2\n');
    // card-2's worktree is untouched, ready for a human to resolve.
    assert.equal(fs.readFileSync(path.join(c2.path, 'a.txt'), 'utf-8'), 'line1-c2\nline2\n');
  });
});
