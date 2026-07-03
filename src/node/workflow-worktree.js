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
    if (!existing) await fs.symlink(source, target, 'dir');
    // The repo's `.gitignore` matches `node_modules/` (a directory) but the worktree's node_modules is a
    // SYMLINK (a file), which that pattern does NOT match — so without help `git add -A` would stage the
    // symlink and `git status` would count it as a change. Exclude it per-worktree so it is invisible to
    // both the commit and the clean-diff probe.
    await excludeInWorktree(worktreePath, 'node_modules');
    return true;
  } catch {
    return false;
  }
}

// A fresh worktree checks out gitlinks as empty directories: without their submodules a card whose
// tests import a submodule path fails ERR_MODULE_NOT_FOUND, pushing workers into copy-in workarounds
// that then leak into the auto-commit. Populate them from the shared object store ($GIT_COMMON_DIR/
// modules — already cloned for the main checkout, so no network). Best-effort like linkNodeModules:
// a repo without submodules is a fast no-op, a failure degrades to the old behavior.
async function initSubmodules(worktreePath) {
  let hasModules = await fs.access(path.join(worktreePath, '.gitmodules')).then(() => true, () => false);
  if (!hasModules) return false;
  // A linked worktree gets its own submodule gitdirs, so this clones from the recorded URLs. file://
  // must be re-allowed for locally-pathed submodules: the same .gitmodules is already trusted and
  // initialized in the main checkout this worktree was cut from.
  let res = await git(
    ['-c', 'protocol.file.allow=always', 'submodule', 'update', '--init', '--recursive'],
    worktreePath, { timeout: 300_000 },
  );
  return res.ok;
}

// Append an entry to a worktree's local git exclude file (idempotent, best-effort).
async function excludeInWorktree(worktreePath, entry) {
  let res = await git(['rev-parse', '--git-path', 'info/exclude'], worktreePath, { timeout: 5000 });
  let rel = res.ok ? res.stdout.trim() : '';
  if (!rel) return;
  let excludePath = path.isAbsolute(rel) ? rel : path.join(worktreePath, rel);
  try {
    let current = await fs.readFile(excludePath, 'utf-8').catch(() => '');
    if (current.split('\n').some(line => line.trim() === entry)) return;
    await fs.mkdir(path.dirname(excludePath), { recursive: true });
    await fs.appendFile(excludePath, `${current && !current.endsWith('\n') ? '\n' : ''}${entry}\n`);
  } catch {
    // best-effort; commitWorktree also excludes node_modules defensively
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
      await initSubmodules(existing.path);
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
  await initSubmodules(worktreePath);
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
  // Keep the node_modules symlink out of the commit. The directory-only `.gitignore` pattern does not
  // match a symlink, so ensure the git-exclude lists it, then a PLAIN `git add -A` skips it. (An explicit
  // `:(exclude)node_modules` pathspec is NOT usable here: once node_modules is excluded, git errors that
  // the explicitly-named path is ignored — plain `add -A` silently skips ignored paths, which is what we
  // want.)
  await excludeInWorktree(worktreePath, 'node_modules');
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
// A failed count is NOT "nothing to merge": conflating them lets the publish tail delete a branch
// that still holds unmerged commits. Resolves { ok:true, count } or { ok:false, detail }.
export async function branchAheadOfBase({ repoRoot, branch, baseRef }) {
  if (!baseRef) return { ok: false, count: null, detail: 'no base ref to count against' };
  let res = await git(['rev-list', '--count', `${baseRef}..${branch}`], repoRoot, { timeout: 10_000 });
  if (!res.ok) {
    return { ok: false, count: null, detail: `git rev-list ${baseRef}..${branch} failed: ${(res.stderr || res.stdout || '').trim() || 'unknown error'}` };
  }
  return { ok: true, count: Number(res.stdout.trim()) || 0 };
}

// Merge the card branch into the base ref in the main repo. A clean merge resolves
// { ok:true, merged }. A conflict aborts the merge (restoring the base tree) and resolves
// { ok:false, conflict:true, detail } so the caller can escalate to a human with the worktree intact.
// Any failure to even COUNT what needs merging (renamed/deleted base ref, rev-list timeout) also
// resolves { ok:false } — never "nothing to merge" — so the caller parks the card with the branch
// intact instead of publishing a false success and deleting committed work.
export async function mergeWorktree({ repoRoot, branch, baseRef, message, committer = DEFAULT_COMMITTER }) {
  if (!repoRoot || !branch) return { ok: false, conflict: false, detail: 'merge requires repoRoot and branch' };
  // Crash-retry: a prior pass already merged and deleted the branch, then died before closing the card.
  // A missing branch is the ONLY case where "nothing to merge" may be inferred from an unanswerable
  // ahead-count.
  if (!(await branchExists(repoRoot, branch))) {
    return { ok: true, merged: false, detail: 'card branch no longer exists (already merged and removed)' };
  }
  let ahead = await branchAheadOfBase({ repoRoot, branch, baseRef });
  if (!ahead.ok) return { ok: false, conflict: false, detail: `cannot determine commits ahead of base: ${ahead.detail}` };
  if (ahead.count === 0) return { ok: true, merged: false, detail: 'branch has no commits ahead of base' };
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

// Per-card worktree checkouts live here. NOT under `.git/`: an IDE/agent harness commonly blocks all
// writes to any `/.git/` path as a sensitive-file guard, which would stop a worker from writing into its
// own worktree. A gitignored top-level dir keeps the checkouts out of `git status` while staying inside
// the project root (so the worker, whose cwd is the worktree, can write freely) and off the `.git/` path.
export function cardWorktreeRoot(repoRoot) {
  return path.join(repoRoot, '.agent-portal-worktrees');
}

export const __testing = { sanitizeToken, worktreePathFor, branchFor };
