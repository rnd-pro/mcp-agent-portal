# Autonomous board: per-card worktree isolation

In autonomous mode, the workflow board can take a card from execute through audit
to publish without a human. To keep concurrent cards from clobbering one shared
working tree, each file-mutating card runs in its own git worktree on a dedicated
branch. The board owns the full lifecycle: provision → commit → merge → remove.

Implemented in `src/node/workflow-worktree.js`; wired into the board by
`src/node/workflow-board-service.js`.

## One worktree + branch per card

Before a card's first file-mutating run is dispatched, the board provisions
(or reuses) a worktree for it:

- The branch is `agent-portal/<cardId>`, cut from the repo's current base ref
  (its branch, or HEAD sha when detached).
- The worktree is checked out under `.git/agent-portal-worktrees/<cardId>` —
  untracked and outside the source tree.
- The base repo's `node_modules` is symlinked into the worktree so the release
  gate and the worker see the installed dependency tree (the link is gitignored).

Provisioning is idempotent: the execute, audit, and publish stages all run
against the same worktree, and a re-run or restart re-attaches to it rather than
failing on a duplicate. Every run and release-gate probe for the card executes
in its worktree instead of the shared project tree, so a finished-but-uncommitted
card holds its changes in its own tree, invisible to peers. Independent cards run
fully in parallel; any real overlap surfaces — serialized — at merge time.

Isolation applies in autonomous mode on a git repo for mutating stages. A
non-git repo or non-autonomous board falls back to the shared working tree, and
a board can opt out via `automation.worktreeIsolation: false`. A provision
failure degrades transparently — it is recorded on the card and the run falls
back to the shared tree rather than crashing the reconcile pass.

## Commit and merge on publish

When an autonomous card reaches publish, the board commits and merges its work
back to base, then closes the card:

1. `commitWorktree` stages everything (`git add -A`) and commits it onto the
   card branch. "Nothing to commit" is a benign no-op.
2. `mergeWorktree` merges the card branch into the base ref in the main repo
   with `--no-ff`.
3. On a clean merge, the worktree and its branch are removed and the card's
   worktree pointer is cleared before it closes.

A non-isolated card skips straight to close, leaving its uncommitted changes for
a human exactly as before.

## Merge conflict parks the card

A merge conflict is the one case the board will not self-resolve. The in-progress
merge is aborted (`git merge --abort`), restoring the base tree so it is never
left half-merged. The card then parks in the **needs-decision** lane with the
conflict detail (branch, base ref, conflicting files) recorded on its metadata.
The worktree and branch are kept intact so a human can resolve the conflict in
place. The board never force-merges.

## Reaping each drive pass

`reconcileWorktreeCleanup` runs every drive pass (best-effort, idempotent) and
reclaims worktrees that should no longer exist, from two sources:

- A **terminal** card (done or rejected) still holding a worktree pointer — its
  work is finished or discarded, so the worktree and branch are removed and the
  pointer cleared. This covers the reject path and backstops a done card whose
  publish-time cleanup did not run.
- A worktree whose card was **deleted** outright, leaving no metadata to drive
  the case above — swept by the `agent-portal/` branch prefix against the set of
  cards that may still legitimately own a worktree, and only within the managed
  worktree root.

A still-running terminal card is left alone until its run ends.
