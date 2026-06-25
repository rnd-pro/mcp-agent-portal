import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';

// Per-card git worktree isolation for the autonomous workflow board. Each file-mutating card runs in
// its own git worktree on a dedicated branch cut from the base ref, so concurrent cards never share an
// uncommitted working tree. The board commits the worktree to its branch, merges it back into the base,
// and removes the worktree — all autonomously in autonomous mode. With isolation in force, the
// file-scope blocker only has to reserve files for a RUNNING run; a finished-but-uncommitted card holds
// its changes in its OWN tree, invisible to peers, so independent cards run fully in parallel and any
// real overlap surfaces (serialized) at merge time as a conflict the board escalates to a human.
//
// All operations are async (execFile, never execFileSync) so a slow checkout/merge on a large repo
// never freezes the reconcile loop or the single-writer ownership heartbeat. Every helper resolves to a
// structured result instead of throwing, so a transient git failure degrades a single card rather than
// crashing a reconcile pass.

const DEFAULT_BRANCH_PREFIX = 'agent-portal';
const DEFAULT_COMMITTER = { name: 'Agent Portal', email: 'agent-portal@localhost' };

// Reduce a card id (already `card-<hex>` in practice) to a path/branch-safe token. Defensive only.
function sanitizeToken(value) {
  return String(value ?? '').trim().replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^[-.]+/, '') || 'card';
}

// git reports worktree paths as canonical realpaths (e.g. macOS resolves /var → /private/var). Resolve
// our computed paths the same way before comparing, so reuse-detection and the orphan-reaper containment
// check work even when the repo lives under a symlinked path. Falls back to a plain resolve when the
// path does not exist yet (nothing to match against in that case).
async function realpathOrResolve(p) {
  try {
    return await fs.realpath(p);
  } catch {
    return path.resolve(p);
  }
}

function git(args, cwd, { timeout = 120_000 } = {}) {
  return new Promise((resolve) => {
    execFile('git', args, {
      cwd, encoding: 'utf-8', maxBuffer: 64 * 1024 * 1024, timeout,
    }, (error, stdout, stderr) => {
      resolve({
        ok: !error,
        code: error?.code ?? 0,
        killed: Boolean(error?.killed),
        stdout: stdout || '',
        stderr: stderr || '',
        error: error || null,
      });
    });
  });
}

export async function isGitRepo(dir) {
  if (!dir) return false;
  let probe = await git(['rev-parse', '--is-inside-work-tree'], dir, { timeout: 5000 });
  return probe.ok && probe.stdout.trim() === 'true';
}

// The base ref a card branch is cut from: the repo's current branch, or its HEAD sha when detached.
export async function resolveBaseRef(repoRoot) {
  let branch = await git(['rev-parse', '--abbrev-ref', 'HEAD'], repoRoot, { timeout: 5000 });
  let name = branch.ok ? branch.stdout.trim() : '';
  if (name && name !== 'HEAD') return name;
  let sha = await git(['rev-parse', 'HEAD'], repoRoot, { timeout: 5000 });
  return sha.ok ? sha.stdout.trim() : null;
}

function worktreePathFor(worktreeRoot, cardId) {
  return path.join(worktreeRoot, sanitizeToken(cardId));
}

function branchFor(branchPrefix, cardId) {
  return `${branchPrefix}/${sanitizeToken(cardId)}`;
}

async function branchExists(repoRoot, branch) {
  let ref = await git(['show-ref', '--verify', '--quiet', `refs/heads/${branch}`], repoRoot, { timeout: 5000 });
  return ref.ok;
}

// Parse `git worktree list --porcelain` into [{ path, branch, head }].
export async function listWorktrees(repoRoot) {
  let res = await git(['worktree', 'list', '--porcelain'], repoRoot, { timeout: 10_000 });
  if (!res.ok) return [];
  let entries = [];
  let current = null;
  for (let line of res.stdout.split('\n')) {
    if (line.startsWith('worktree ')) {
      if (current) entries.push(current);
      current = { path: line.slice('worktree '.length).trim(), branch: null, head: null };
    } else if (line.startsWith('HEAD ') && current) {
      current.head = line.slice('HEAD '.length).trim();
    } else if (line.startsWith('branch ') && current) {
      current.branch = line.slice('branch '.length).trim().replace(/^refs\/heads\//, '');
    }
  }
  if (current) entries.push(current);
  return entries;
}

// node_modules is gitignored, so a fresh worktree checks out the source but not its installed deps —
// `npm run test:unit` and any tooling the worker runs would fail. Symlink the base repo's node_modules
// into the worktree so the release gate and the agent see the same installed dependency tree. The link
// is gitignored, so it never appears in the card's changeset. Best-effort: a missing base node_modules
// or a platform without symlink support is not fatal (a card that needs deps will surface a test failure
// through the normal gate, not a silent pass).
async function linkNodeModules(repoRoot, worktreePath) {
  let source = path.join(repoRoot, 'node_modules');
  let target = path.join(worktreePath, 'node_modules');
  try {
    await fs.access(source);
  } catch {
    return false;
  }
  try {
    let existing = await fs.lstat(target).catch(() => null);
    if (existing) return existing.isSymbolicLink();
    await fs.symlink(source, target, 'dir');
    return true;
  } catch {
    return false;
  }
}

// Provision (or reuse) a worktree + branch for a card. Idempotent: a second call for the same card
// returns the existing worktree. Returns { ok, path, branch, baseRef, baseSha, reused } or
// { ok:false, error }.
export async function provisionWorktree({
  repoRoot, worktreeRoot, cardId, branchPrefix = DEFAULT_BRANCH_PREFIX,
}) {
  if (!repoRoot || !worktreeRoot || !cardId) {
    return { ok: false, error: 'provisionWorktree requires repoRoot, worktreeRoot and cardId' };
  }
  let worktreePath = worktreePathFor(worktreeRoot, cardId);
  let branch = branchFor(branchPrefix, cardId);

  // Reuse an already-registered worktree (by branch — unique per card — or by realpath) so a re-run /
  // restart attaches to the card's existing tree instead of failing on a duplicate add.
  let registered = await listWorktrees(repoRoot);
  let wantPath = await realpathOrResolve(worktreePath);
  let existing = null;
  for (let wt of registered) {
    if (wt.branch === branch || (await realpathOrResolve(wt.path)) === wantPath) { existing = wt; break; }
  }
  if (existing) {
    let onDisk = await fs.stat(existing.path).catch(() => null);
    if (onDisk?.isDirectory()) {
      await linkNodeModules(repoRoot, existing.path);
      let baseRef = await resolveBaseRef(repoRoot);
      let baseSha = (await git(['rev-parse', 'HEAD'], repoRoot, { timeout: 5000 })).stdout.trim() || null;
      return { ok: true, path: await realpathOrResolve(existing.path), branch, baseRef, baseSha, reused: true };
    }
    // Registered but the directory is gone — prune the stale admin record before recreating.
    await git(['worktree', 'prune'], repoRoot, { timeout: 10_000 });
  }

  let baseRef = await resolveBaseRef(repoRoot);
  if (!baseRef) return { ok: false, error: 'cannot resolve base ref (no commits / not a git repo)' };
  let baseSha = (await git(['rev-parse', 'HEAD'], repoRoot, { timeout: 5000 })).stdout.trim() || null;

  try {
    await fs.mkdir(worktreeRoot, { recursive: true });
  } catch (err) {
    return { ok: false, error: `cannot create worktree root: ${err.message}` };
  }

  let add = (await branchExists(repoRoot, branch))
    ? await git(['worktree', 'add', worktreePath, branch], repoRoot)
    : await git(['worktree', 'add', '-b', branch, worktreePath, baseRef], repoRoot);
  if (!add.ok) {
    return { ok: false, error: `git worktree add failed: ${(add.stderr || add.stdout || '').trim()}` };
  }
  await linkNodeModules(repoRoot, worktreePath);
  return { ok: true, path: await realpathOrResolve(worktreePath), branch, baseRef, baseSha, reused: false };
}

// Stage and commit everything in the worktree onto its branch. "Nothing to commit" is a benign no-op
// (the work was already committed). Returns { ok, committed, sha, reason }.
export async function commitWorktree({ worktreePath, message, committer = DEFAULT_COMMITTER }) {
  if (!worktreePath) return { ok: false, committed: false, reason: 'no worktree path' };
  // Idempotent on a removed worktree: if a prior pass already committed + merged + removed the tree and
  // then crashed before the card was marked done, the re-entry finds no directory — treat it as "already
  // committed" so merge (already-up-to-date) and close can still complete instead of wedging the card.
  try {
    await fs.access(worktreePath);
  } catch {
    return { ok: true, committed: false, reason: 'worktree already removed' };
  }
  let add = await git(['add', '-A'], worktreePath);
  if (!add.ok) return { ok: false, committed: false, reason: `git add failed: ${(add.stderr || '').trim()}` };
  let status = await git(['status', '--porcelain'], worktreePath, { timeout: 10_000 });
  if (status.ok && status.stdout.trim() === '') {
    let head = await git(['rev-parse', 'HEAD'], worktreePath, { timeout: 5000 });
    return { ok: true, committed: false, sha: head.stdout.trim() || null, reason: 'nothing to commit' };
  }
  let commit = await git([
    '-c', `user.name=${committer.name}`,
    '-c', `user.email=${committer.email}`,
    'commit', '-m', message || 'Agent Portal: autonomous card commit',
  ], worktreePath);
  if (!commit.ok) {
    return { ok: false, committed: false, reason: `git commit failed: ${(commit.stderr || commit.stdout || '').trim()}` };
  }
  let head = await git(['rev-parse', 'HEAD'], worktreePath, { timeout: 5000 });
  return { ok: true, committed: true, sha: head.stdout.trim() || null };
}

// Count commits on the card branch ahead of the base ref — whether there is anything to merge.
export async function branchAheadOfBase({ repoRoot, branch, baseRef }) {
  if (!baseRef) return 0;
  let res = await git(['rev-list', '--count', `${baseRef}..${branch}`], repoRoot, { timeout: 10_000 });
  return res.ok ? Number(res.stdout.trim()) || 0 : 0;
}

// Merge the card branch into the base ref in the main repo. A clean merge resolves
// { ok:true, merged }. A conflict aborts the merge (restoring the base tree) and resolves
// { ok:false, conflict:true, detail } so the caller can escalate to a human with the worktree intact.
export async function mergeWorktree({ repoRoot, branch, baseRef, message, committer = DEFAULT_COMMITTER }) {
  if (!repoRoot || !branch) return { ok: false, conflict: false, detail: 'merge requires repoRoot and branch' };
  let ahead = await branchAheadOfBase({ repoRoot, branch, baseRef });
  if (ahead === 0) return { ok: true, merged: false, detail: 'branch has no commits ahead of base' };
  let merge = await git([
    '-c', `user.name=${committer.name}`,
    '-c', `user.email=${committer.email}`,
    'merge', '--no-ff', '-m', message || `Agent Portal: merge ${branch}`, branch,
  ], repoRoot);
  if (merge.ok) return { ok: true, merged: true };
  // A conflict (or any merge that left MERGE_HEAD behind) must be aborted so the base tree is restored
  // and never left half-merged. Detect an in-progress merge and abort it.
  let inProgress = await git(['rev-parse', '-q', '--verify', 'MERGE_HEAD'], repoRoot, { timeout: 5000 });
  let conflictFiles = [];
  if (inProgress.ok) {
    let diff = await git(['diff', '--name-only', '--diff-filter=U'], repoRoot, { timeout: 10_000 });
    if (diff.ok) conflictFiles = diff.stdout.split('\n').map(s => s.trim()).filter(Boolean);
    await git(['merge', '--abort'], repoRoot, { timeout: 30_000 });
  }
  let detail = conflictFiles.length
    ? `merge conflict in: ${conflictFiles.join(', ')}`
    : `merge failed: ${(merge.stderr || merge.stdout || '').trim() || 'unknown error'}`;
  return { ok: false, conflict: conflictFiles.length > 0, detail, conflictFiles };
}

// Remove a card's worktree and (by default) delete its branch. Best-effort and idempotent: a missing
// worktree or branch is fine. Returns { ok } — a failure is logged by the caller, not thrown.
export async function removeWorktree({ repoRoot, worktreePath, branch, deleteBranch = true }) {
  if (worktreePath) {
    await git(['worktree', 'remove', worktreePath, '--force'], repoRoot, { timeout: 30_000 });
    await fs.rm(worktreePath, { recursive: true, force: true }).catch(() => {});
  }
  await git(['worktree', 'prune'], repoRoot, { timeout: 10_000 });
  if (deleteBranch && branch) {
    await git(['branch', '-D', branch], repoRoot, { timeout: 10_000 });
  }
  return { ok: true };
}

// Remove worktrees/branches under our prefix whose card is no longer live (deleted, or terminal/done
// with no live run). `liveCardIds` is the set of ids that may still legitimately own a worktree.
export async function reapOrphanWorktrees({
  repoRoot, worktreeRoot, liveCardIds, branchPrefix = DEFAULT_BRANCH_PREFIX,
}) {
  let live = liveCardIds instanceof Set ? liveCardIds : new Set(liveCardIds || []);
  let prefix = `${branchPrefix}/`;
  let removed = [];
  let managedRoot = worktreeRoot ? await realpathOrResolve(worktreeRoot) : null;
  for (let wt of await listWorktrees(repoRoot)) {
    if (!wt.branch || !wt.branch.startsWith(prefix)) continue;
    // Only reap worktrees we provisioned under the managed root.
    if (managedRoot) {
      let real = await realpathOrResolve(wt.path);
      if (real !== managedRoot && !real.startsWith(managedRoot + path.sep)) continue;
    }
    let cardId = wt.branch.slice(prefix.length);
    if (live.has(cardId)) continue;
    await removeWorktree({ repoRoot, worktreePath: wt.path, branch: wt.branch });
    removed.push({ cardId, path: wt.path, branch: wt.branch });
  }
  return removed;
}

export function cardWorktreeRoot(repoRoot) {
  return path.join(repoRoot, '.git', 'agent-portal-worktrees');
}

export const __testing = { sanitizeToken, worktreePathFor, branchFor };
