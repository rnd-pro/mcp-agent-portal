// Release-tail probes — the autonomous board's substitute for an independent human's clean-diff /
// hygiene / test sign-off. Extracted from workflow-board-service.js: every function here is a pure,
// closure-free read-only probe of a card's working directory (git status + the project unit suite),
// so it composes as a standalone concern the service imports. No board state, no mutation.
import { execFile, execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

// Local trim-or-null: a probe only ever coerces a `cwd` path string, so it needs no object handling.
function textOrNull(value) {
  if (value === null || value === undefined) return null;
  let text = String(value).trim();
  return text.length ? text : null;
}

// Scratch/junk/secret-bearing path patterns that must never reach a published changeset. A release
// probe that finds any of these in the worktree fails the hygiene floor rather than shipping it.
const HYGIENE_OFFENDER_PATTERNS = [
  /(^|\/)\.env(\.|$)/i,
  /\.(pem|key|p12|pfx)$/i,
  /(^|\/)id_(rsa|ed25519|ecdsa|dsa)(\.|$)/,
  /(^|\/)(tmp|scratch|sandbox|\.scratch)(\/|$)/i,
  /\.(log|tmp|bak|orig|swp|swo)$/i,
  /(^|\/)[^/]+\.(tar|tar\.gz|tgz|zip)$/i,
  /(^|\/)\.DS_Store$/,
];

// Parse one `git status --porcelain` v1 line into its path. The format is two status chars + a
// space (3-char prefix) then the path; a rename is `orig -> dest`, so the destination is the path
// that actually lands in the tree.
function porcelainPath(line) {
  let body = line.slice(3);
  let arrow = body.lastIndexOf(' -> ');
  return (arrow === -1 ? body : body.slice(arrow + 4)).trim();
}

// A real working-tree probe for the autonomous release tail — the daemon's substitute for an
// independent human's clean-diff/hygiene sign-off. Runs read-only git in the card's working
// directory and reports whether there is a non-empty, junk-free changeset to ship. Fail-safe: a
// missing / non-git / unreadable cwd yields `{ available: false }` so the caller fails CLOSED (holds
// the card) instead of fabricating a pass. Never mutates the repo (status only).
export function probeReleaseGate(cwd) {
  let dir = textOrNull(cwd);
  if (!dir) return { available: false, reason: 'card has no working directory to probe' };
  let runGit = (args) => execFileSync('git', args, {
    cwd: dir, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 5000,
  });
  try {
    runGit(['rev-parse', '--is-inside-work-tree']);
  } catch {
    return { available: false, reason: `not a git work tree: ${dir}` };
  }
  let porcelain;
  try {
    porcelain = runGit(['status', '--porcelain']);
  } catch (err) {
    return { available: false, reason: `git status failed: ${err.message}` };
  }
  let changedPaths = porcelain.split('\n').filter(Boolean).map(porcelainPath).filter(Boolean);
  let offenders = changedPaths.filter(p => HYGIENE_OFFENDER_PATTERNS.some(re => re.test(p)));
  let changedFiles = changedPaths.length;
  return {
    available: true,
    changedFiles,
    changedPaths,
    offenders,
    hasDiff: changedFiles > 0,
    hygiene: offenders.length === 0,
    reason: changedFiles === 0
      ? 'working tree has no diff to ship'
      : offenders.length
        ? `hygiene offenders in worktree: ${offenders.join(', ')}`
        : `${changedFiles} changed path(s), no hygiene offenders`,
  };
}

// Documentation/prose paths whose change cannot affect the unit suite.
const DOC_PATH_PATTERN = /\.(md|markdown|mdx|txt|rst|adoc)$/i;

// Does a card's changeset include anything the unit suite could verify? The unit-test release gate is
// only meaningful for code; a docs/prose-only change (e.g. a new `docs/*.md`) has nothing for the suite
// to catch, so running the full, load-sensitive suite would only risk a FALSE hold under the live
// board's CPU contention. Conservative/fail-safe: an unreadable or non-doc changeset keeps the gate. The
// clean-diff + hygiene floor still gate every change regardless.
export function changesetTouchesCode(cwd) {
  let probe = probeReleaseGate(cwd);
  if (!probe.available || !probe.changedPaths.length) return true;
  return !probe.changedPaths.every(p => DOC_PATH_PATTERN.test(p) || p.startsWith('docs/'));
}

// Real test verification for the release gate (proof-contract: ship only what passes). The audit run's
// self-reported PASS marker is NOT trusted on its own — the project's unit suite is actually run against
// the (still uncommitted) work before it advances to the commit stage. Fail-closed: a failing or
// timed-out run blocks the advance. A project with no unit-test script is "nothing to verify"
// (available:false), so it is not blocked. Async + non-blocking (execFile, never execFileSync) so the
// reconcile awaits the child without freezing the event loop or the ownership heartbeat.
export async function probeReleaseTests(cwd) {
  let dir = textOrNull(cwd);
  if (!dir) return { available: false, reason: 'no working directory to verify' };
  let script;
  try {
    let pkg = JSON.parse(await fs.readFile(path.join(dir, 'package.json'), 'utf-8'));
    script = pkg?.scripts?.['test:unit'] ? 'test:unit' : (pkg?.scripts?.test ? 'test' : null);
  } catch {
    return { available: false, reason: 'no readable package.json to verify' };
  }
  if (!script) return { available: false, reason: 'no test script to verify' };
  // Run the gate suite in an ISOLATED state environment. A release gate must never touch the live
  // ~/.agent-portal snapshot: a test that builds an ownership-guarded StateGraph on the real state path
  // would claim the single-writer token, make THIS backend see `ownership-lost` and exit — a
  // self-inflicted restart-churn storm (the gate killing the server that launched it). Strip
  // PORTAL_BACKEND (no ownership guard in spawned test StateGraphs) and redirect every state + gateway
  // path to a throwaway temp dir so the run cannot read, write, or contend the production state.
  let isoDir = await fs.mkdtemp(path.join(os.tmpdir(), 'portal-release-test-'));
  let env = { ...process.env, PORTAL_STATE_DIR: isoDir, PORTAL_LOCAL_GATEWAY_DIR: isoDir };
  delete env.PORTAL_BACKEND;
  delete env.PORTAL_STATE_PATH;
  return await new Promise((resolve) => {
    let done = (result) => { fs.rm(isoDir, { recursive: true, force: true }).catch(() => {}); resolve(result); };
    execFile('npm', ['run', '--silent', script], {
      cwd: dir, timeout: 300_000, maxBuffer: 64 * 1024 * 1024, env,
    }, (err, stdout, stderr) => {
      if (err && err.code === 'ENOENT') return done({ available: false, reason: 'npm unavailable' });
      let out = `${stdout || ''}\n${stderr || ''}`;
      let failMatch = out.match(/^# fail (\d+)/m);
      let passMatch = out.match(/^# pass (\d+)/m);
      let failing = failMatch ? Number(failMatch[1]) : null;
      let timedOut = Boolean(err && err.killed);
      // Enumerate the failing TAP subtests by name (`not ok <n> - <name>`) so the expected-red gate can
      // verify that ONLY the specifically-declared tests are red — a blanket red-count is not enough to
      // ship, since a real regression must not ride along with an expected failure.
      let failingNames = [];
      for (let line of out.split('\n')) {
        let m = line.match(/^\s*not ok \d+\s*-\s*(.+?)\s*$/);
        if (m) failingNames.push(m[1]);
      }
      // Fail-closed: a non-zero exit (incl. timeout) OR a parsed failing-count > 0 fails the gate.
      let passed = !err && (failing === null || failing === 0);
      done({
        available: true,
        passed,
        failing,
        failingNames,
        // A timeout (or any non-zero exit with no parseable fail-count) leaves the red set UNKNOWN —
        // the expected-red gate must treat this as un-scopeable and never allow it through.
        enumerable: !timedOut && failing !== null,
        timedOut,
        passing: passMatch ? Number(passMatch[1]) : null,
        reason: passed
          ? `unit tests passed${passMatch ? ` (${passMatch[1]})` : ''}`
          : timedOut ? 'unit tests timed out'
            : `unit tests failed${failing != null ? ` (${failing} failing)` : ''}`,
      });
    });
  });
}
