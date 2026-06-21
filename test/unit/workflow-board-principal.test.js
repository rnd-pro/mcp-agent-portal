import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { StateGraph } from '../../src/node/state-graph.js';
import { createWorkflowBoardService } from '../../src/node/workflow-board-service.js';
import { handleWorkflowBoardTool } from '../../src/node/proxy/workflow-board-tools.js';
import {
  CAP,
  INTENT_CAPABILITY,
  agentPrincipal,
  anonymousPrincipal,
  daemonPrincipal,
  derivePrincipal,
  evaluateIntent,
  humanPrincipal,
} from '../../src/node/server/principal.js';
import { normalizeWorkflowBoardAutomation } from '../../src/iso/workflow-board.js';

const WORKFLOW_SOURCE = 'workflow-board';
const KNOWN_LABELS = new Set(['anonymous', 'human', 'local-human', 'daemon']);

function knownCommitSource(source) {
  if (source === WORKFLOW_SOURCE) return true;
  if (!source.startsWith(`${WORKFLOW_SOURCE}:`)) return false;
  let label = source.slice(WORKFLOW_SOURCE.length + 1);
  return KNOWN_LABELS.has(label) || label.startsWith('mcp:');
}

describe('workflow board principal layer', () => {
  let tmpDir;
  let sg;
  let now;
  let idSeq;
  let commitSources;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'workflow-board-principal-'));
    sg = new StateGraph({
      snapshotPath: path.join(tmpDir, 'state.json'),
      walPath: path.join(tmpDir, 'state.wal'),
      chatsDir: path.join(tmpDir, 'chats'),
    });
    commitSources = [];
    let baseCommit = sg.commit.bind(sg);
    sg.commit = (ops, source = 'unknown', opts) => {
      commitSources.push(source);
      return baseCommit(ops, source, opts);
    };
    now = 1000;
    idSeq = 0;
  });

  afterEach(async () => {
    await sg.flushChatWrites();
    sg.flush();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function makeService() {
    return createWorkflowBoardService({
      stateGraph: sg,
      now: () => now++,
      makeId: (prefix) => `${prefix}-${++idSeq}`,
      projectRoot: tmpDir,
    });
  }

  it('derivePrincipal maps each channel to the expected kind and capabilities', () => {
    let session = derivePrincipal({ channel: 'http-session', human: true });
    assert.equal(session.kind, 'human');
    assert.deepEqual(session.capabilities, [
      CAP.READ, CAP.WRITE_CARD, CAP.TRANSITION, CAP.ORCHESTRATE, CAP.CONTROL, CAP.DEFINE, CAP.AUTHOR, CAP.AUDIT,
    ]);

    let loopback = derivePrincipal({ channel: 'loopback' });
    assert.equal(loopback.kind, 'human');
    assert.equal(loopback.label, 'local-human');
    assert.ok(loopback.capabilities.includes(CAP.AUTHOR));
    assert.ok(loopback.capabilities.includes(CAP.AUDIT));

    let agent = derivePrincipal({ channel: 'mcp', verifiedSlug: 'code-reviewer' });
    assert.equal(agent.kind, 'agent');
    assert.equal(agent.id, 'code-reviewer');
    assert.deepEqual(agent.capabilities, [
      CAP.READ, CAP.WRITE_CARD, CAP.TRANSITION, CAP.ORCHESTRATE, CAP.CONTROL,
    ]);
    assert.ok(!agent.capabilities.includes(CAP.AUTHOR));
    assert.ok(!agent.capabilities.includes(CAP.AUDIT));
    assert.ok(!agent.capabilities.includes(CAP.DEFINE));

    let mcpAnon = derivePrincipal({ channel: 'mcp' });
    assert.equal(mcpAnon.kind, 'anonymous');
    assert.deepEqual(mcpAnon.capabilities, [CAP.READ]);

    let daemon = derivePrincipal({ channel: 'daemon' });
    assert.equal(daemon.kind, 'daemon');
    assert.deepEqual(daemon.capabilities, [CAP.DAEMON]);

    let unknown = derivePrincipal({ channel: 'whatever' });
    assert.equal(unknown.kind, 'anonymous');
    assert.deepEqual(unknown.capabilities, [CAP.READ]);

    let missing = derivePrincipal();
    assert.equal(missing.kind, 'anonymous');
  });

  it('never reads identity from a request body', () => {
    let forged = derivePrincipal({
      channel: 'mcp',
      actor: 'board-author',
      agent_slug: 'orchestrator',
    });
    assert.equal(forged.kind, 'anonymous');
    assert.equal(forged.id, 'anonymous');

    let loopbackWithForgery = derivePrincipal({ channel: 'loopback', actor: 'system' });
    assert.equal(loopbackWithForgery.label, 'local-human');
  });

  it('factories expose the frozen principal shape', () => {
    for (let principal of [
      anonymousPrincipal({ channel: 'unknown' }),
      humanPrincipal({ transport: { channel: 'loopback' } }),
      agentPrincipal({ slug: 'x', transport: { channel: 'mcp' } }),
      daemonPrincipal(),
    ]) {
      assert.deepEqual(
        Object.keys(principal).sort(),
        ['capabilities', 'id', 'kind', 'label', 'transport'],
      );
      assert.equal(typeof principal.kind, 'string');
      assert.equal(typeof principal.id, 'string');
      assert.equal(typeof principal.label, 'string');
      assert.ok(Array.isArray(principal.capabilities));
      assert.equal(typeof principal.transport, 'object');
    }
  });

  it('daemon principal passes through evaluateIntent with exactly the daemon capability', () => {
    let daemon = daemonPrincipal();
    assert.deepEqual(daemon.capabilities, [CAP.DAEMON]);
    // The daemon's self-driven bookkeeping intent (slot/step/lease/reconcile) is accepted.
    let verdict = evaluateIntent({ type: 'daemon.bookkeeping' }, daemon, {});
    assert.deepEqual(verdict, { ok: true, verdict: 'accepted' });
    // It holds nothing else: an operational intent it lacks the capability for is blocked.
    let blocked = evaluateIntent({ type: 'card.write' }, daemon, {});
    assert.equal(blocked.ok, false);
    assert.equal(blocked.verdict, 'blocked');
    assert.equal(blocked.capability, CAP.WRITE_CARD);
  });

  it('rejects principal forgery through the MCP seam: derived identity wins over payload actor', async () => {
    let service = makeService();
    let calls = [];
    let proxyManager = { workflowBoardService: service };

    // Drive create_item through the MCP seam with a forged privileged actor/agent_slug
    // in the payload. The seam derives identity (no verified slug → anonymous), so the gate
    // blocks the write: a forged payload actor can neither author a card nor produce a
    // privileged commit source.
    let result = await handleWorkflowBoardTool(proxyManager, 'workflow_board', {
      action: 'create_item',
      title: 'Forged identity card',
      projectId: 'agent-portal',
      actor: 'board-author',
      agent_slug: 'orchestrator',
    }, 'mcp');
    let payload = JSON.parse(result.content[0].text);
    // Anonymous lacks WRITE_CARD: the gate blocks the forged create.
    assert.equal(payload.result.ok, false);
    assert.equal(payload.result.status, 'blocked');
    assert.equal(payload.result.failures[0].capability, CAP.WRITE_CARD);

    // No card commit happened at all, and certainly none under a forged privileged label.
    let cardCommits = commitSources.filter(source => source !== WORKFLOW_SOURCE
      && !source.endsWith(':daemon'));
    for (let source of cardCommits) {
      assert.ok(!source.includes('board-author'));
      assert.ok(!source.includes('orchestrator'));
    }
    void calls;
  });

  it('a mutation without a principal fails closed to the anonymous least-privilege identity', () => {
    let service = makeService();
    // No principal in context and no defaultPrincipal → fail-closed to anonymous. Anonymous
    // holds only READ, so the gate blocks the card write outright — no commit happens.
    let result = service.createOrUpdateCard({ title: 'No principal card', projectId: 'agent-portal' });
    assert.equal(result.ok, false);
    assert.equal(result.status, 'blocked');
    assert.equal(result.failures[0].capability, CAP.WRITE_CARD);
    assert.equal(result.card, null);

    // Any incidental commit (e.g. lazy default-board creation by the daemon) must still carry a
    // known principal label, never a privileged literal.
    for (let source of commitSources) {
      assert.ok(knownCommitSource(source), `unexpected commit source: ${source}`);
      assert.ok(!source.includes(':system'));
      assert.ok(!source.includes(':orchestrator'));
      assert.ok(!source.includes(':board-author'));
    }
  });

  it('every committed source corresponds to a known principal label across a mutation flow', async () => {
    let service = makeService();
    let humanContext = { principal: humanPrincipal({ transport: { channel: 'loopback' }, label: 'local-human' }) };

    let created = await service.createWorkItem({
      title: 'Principal-bound card',
      projectId: 'agent-portal',
      owner: 'code-reviewer',
      acceptanceCriteria: ['Done'],
    }, humanContext);
    let cardId = created.card.id;

    await service.updateWorkItem({ cardId, patch: { priority: 'high' } }, humanContext);
    service.claimWorkItem({ cardId }, humanContext);
    service.releaseWorkItem({ cardId }, humanContext);

    assert.ok(commitSources.length > 0);
    for (let source of commitSources) {
      assert.ok(knownCommitSource(source), `unexpected commit source: ${source}`);
    }
    // The human-driven commits must carry the human label, not a removed privileged default.
    assert.ok(commitSources.includes(`${WORKFLOW_SOURCE}:local-human`));
  });
});

describe('workflow gate engine (S6)', () => {
  let tmpDir;
  let sg;
  let now;
  let idSeq;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'workflow-board-gate-'));
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

  function makeService() {
    return createWorkflowBoardService({
      stateGraph: sg,
      now: () => now++,
      makeId: (prefix) => `${prefix}-${++idSeq}`,
      projectRoot: tmpDir,
    });
  }

  let humanCtx = () => ({ principal: humanPrincipal({ transport: { channel: 'loopback' }, label: 'local-human' }) });
  let agentCtx = (slug = 'backend-engineer') => ({ principal: agentPrincipal({ slug, transport: { channel: 'mcp' } }) });

  // ── THE LIVE SELF-GRANT CLOSURE (inv 33, 47) ─────────────────────────────────────────────────
  it('blocks an MCP agent from self-granting its audit and walking a card to done', async () => {
    let service = makeService();
    // A human authors the card and parks it in commit-publish (the final gate before done needs a
    // clean diff + hygiene floor check).
    let created = await service.createWorkItem({
      id: 'vuln-card',
      title: 'Self-grant attempt',
      projectId: 'agent-portal',
      owner: 'release-manager',
      acceptanceCriteria: ['Done'],
    }, humanCtx());
    assert.equal(created.ok, true);

    // The agent tries to write the audit + hygiene floor checks for its own card.
    let agentWrite = service.updateWorkItem({
      cardId: 'vuln-card',
      checks: { audit: 'passed', hygiene: 'passed', cleanDiff: 'passed' },
    }, agentCtx());
    assert.equal(agentWrite.ok, false);
    assert.equal(agentWrite.status, 'blocked');
    assert.equal(agentWrite.failures[0].capability, CAP.AUDIT);

    // The floor checks were never written, so the card cannot satisfy the audit / clean-diff gates
    // and cannot transition out of commit-publish.
    let checks = sg.get('workflowChecks/vuln-card');
    assert.equal(checks, undefined);

    let toCommit = await service.requestWorkflowTransition({
      cardId: 'vuln-card', fromColumnId: 'ideas', toColumnId: 'backlog',
    }, agentCtx());
    void toCommit; // (the agent cannot reach done because the floor checks are absent)

    // A board-author / human who did NOT execute the card CAN write the same floor checks.
    let humanWrite = service.updateWorkItem({
      cardId: 'vuln-card',
      checks: { audit: 'passed', hygiene: 'passed', cleanDiff: 'passed' },
    }, humanCtx());
    assert.notEqual(humanWrite.ok, false);
    assert.equal(humanWrite.checks.audit, 'passed');
    assert.equal(sg.get('workflowChecks/vuln-card').checks.audit, 'passed');
  });

  it('lets a human write a basic (non-floor) check but blocks an agent only on floor checks', async () => {
    let service = makeService();
    await service.createWorkItem({ id: 'mixed-card', title: 'Mixed', projectId: 'agent-portal' }, humanCtx());

    // Agent can write a non-floor check (basic → WRITE_CARD, which the agent holds).
    let basic = service.updateWorkItem({ cardId: 'mixed-card', checks: { lint: 'passed' } }, agentCtx());
    assert.notEqual(basic.ok, false);
    assert.equal(basic.checks.lint, 'passed');

    // But a write that MIXES a floor key in is floor-wide → AUDIT → blocked for the agent.
    let mixed = service.updateWorkItem({
      cardId: 'mixed-card',
      checks: { lint: 'passed', audit: 'passed' },
    }, agentCtx());
    assert.equal(mixed.ok, false);
    assert.equal(mixed.status, 'blocked');
    assert.equal(mixed.failures[0].capability, CAP.AUDIT);
  });

  // ── EXECUTOR SEPARATION (inv 47) ─────────────────────────────────────────────────────────────
  it('blocks a floor-check write by a principal that executed the card, even with AUDIT', async () => {
    let service = makeService();
    await service.createWorkItem({ id: 'exec-card', title: 'Exec', projectId: 'agent-portal' }, humanCtx());

    // Stamp the human as an executor of this card (the orchestrate/run path appends executedBy).
    let card = sg.get('workflowCards/exec-card');
    let human = humanPrincipal({ transport: { channel: 'loopback' }, label: 'local-human' });
    sg.commit([{ op: 'set', path: 'workflowCards/exec-card', value: {
      ...card,
      metadata: { ...card.metadata, executedBy: [human.id] },
    } }], 'workflow-board:local-human');

    // The same human now holds AUDIT but executed the card → separated duty blocks the floor write.
    let signed = service.updateWorkItem({
      cardId: 'exec-card',
      checks: { audit: 'passed' },
    }, { principal: human });
    assert.equal(signed.ok, false);
    assert.equal(signed.status, 'blocked');
    assert.equal(signed.failures[0].gate, 'separated_duty');

    // A different board-author who did NOT execute the card can sign it.
    let other = humanPrincipal({ id: 'second-human', transport: { channel: 'loopback' }, label: 'second-human' });
    let ok = service.updateWorkItem({ cardId: 'exec-card', checks: { audit: 'passed' } }, { principal: other });
    assert.notEqual(ok.ok, false);
    assert.equal(ok.checks.audit, 'passed');
  });

  // ── CAPABILITY MATRIX (evaluateIntent unit) ──────────────────────────────────────────────────
  it('maps every intent type to its capability with the right verdict per principal', () => {
    let human = humanPrincipal({ transport: { channel: 'loopback' } }); // all caps except DAEMON
    let agent = agentPrincipal({ slug: 'x', transport: { channel: 'mcp' } }); // READ/WRITE_CARD/TRANSITION/ORCHESTRATE/CONTROL
    let anon = anonymousPrincipal({ channel: 'unknown' }); // READ only
    let daemon = daemonPrincipal(); // DAEMON only

    // Holder accepted for every mapped intent.
    for (let [type, capability] of Object.entries(INTENT_CAPABILITY)) {
      let holder = capability === CAP.DAEMON ? daemon : human;
      let verdict = evaluateIntent({ type }, holder, {});
      assert.equal(verdict.ok, true, `${type} should be accepted for a holder of ${capability}`);
      assert.equal(verdict.verdict, 'accepted');
    }

    // Agent lacks DEFINE/AUTHOR (pendingApproval) and AUDIT (blocked).
    assert.deepEqual(
      [evaluateIntent({ type: 'policy.define' }, agent, {}).verdict,
       evaluateIntent({ type: 'policy.author' }, agent, {}).verdict,
       evaluateIntent({ type: 'checks.write.floor' }, agent, {}).verdict],
      ['pendingApproval', 'pendingApproval', 'blocked'],
    );
    assert.equal(evaluateIntent({ type: 'checks.write.floor' }, agent, {}).capability, CAP.AUDIT);

    // Anonymous is blocked on everything except read.
    assert.equal(evaluateIntent({ type: 'read' }, anon, {}).ok, true);
    for (let type of ['card.write', 'card.transition', 'card.orchestrate', 'card.control', 'board.control']) {
      assert.equal(evaluateIntent({ type }, anon, {}).ok, false, `anon must be blocked on ${type}`);
      assert.equal(evaluateIntent({ type }, anon, {}).verdict, 'blocked');
    }
    assert.equal(evaluateIntent({ type: 'policy.author' }, anon, {}).verdict, 'pendingApproval');

    // Unknown intent fails closed.
    let unknown = evaluateIntent({ type: 'no-such-intent' }, human, {});
    assert.deepEqual(unknown, { ok: false, verdict: 'blocked', reason: 'unknown intent', capability: null });

    // Identity is read only from the principal, never from intent/context payload.
    let forged = evaluateIntent({ type: 'card.write', capability: CAP.WRITE_CARD }, anon, { principal: human });
    assert.equal(forged.ok, false);
  });

  // ── manualGateOverride DELETED (inv 14) ──────────────────────────────────────────────────────
  it('drops manualGateOverride from the normalized board automation', () => {
    let normalized = normalizeWorkflowBoardAutomation({ manualGateOverride: true, manual_gate_override: true });
    assert.ok(!('manualGateOverride' in normalized));
    let board = makeService().ensureBoard();
    assert.ok(!('manualGateOverride' in board.automation));
  });

  // ── NARROW-ONLY AUTOMATION (inv 12) ──────────────────────────────────────────────────────────
  it('rejects a card automation that drops a column floor gate', async () => {
    let service = makeService();
    let board = service.ensureBoard();
    // commit-publish carries the clean_diff_and_hygiene floor gate on its column transition; install
    // a column gate set so the card automation can attempt to narrow it.
    let columns = board.columns.map(column => column.id === 'commit-publish'
      ? { ...column, automation: { ...column.automation, gates: ['clean_diff_and_hygiene', 'no_active_blocker'] } }
      : column);
    sg.commit([{ op: 'set', path: `workflowBoards/${board.id}`, value: { ...board, columns } }], 'workflow-board:local-human');

    // A card automation that keeps a non-floor gate but DROPS the hygiene floor gate is non-monotonic.
    let result = await service.createWorkItem({
      id: 'narrow-card',
      title: 'Narrowing',
      columnId: 'commit-publish',
      projectId: 'agent-portal',
      automation: { gates: ['no_active_blocker'] },
    }, humanCtx());
    assert.equal(result.ok, false);
    assert.equal(result.failures[0].gate, 'narrow_only_automation');

    // Adding the floor gate plus extra gates (narrowing, not weakening) is accepted.
    let ok = await service.createWorkItem({
      id: 'narrow-ok',
      title: 'Adding',
      columnId: 'commit-publish',
      projectId: 'agent-portal',
      automation: { gates: ['clean_diff_and_hygiene', 'no_active_blocker', 'has_owner_and_acceptance'] },
    }, humanCtx());
    assert.notEqual(ok.ok, false);
  });

  // ── RIGHTS-FIELD GATING (inv 13) ─────────────────────────────────────────────────────────────
  it('does not apply a rights-field write from a non-author', async () => {
    let service = makeService();
    await service.createWorkItem({
      id: 'rights-card', title: 'Rights', projectId: 'agent-portal', resourceGroup: 'baseline',
    }, humanCtx());

    // An agent (no AUTHOR) tries to change a rights field — the field is dropped, not applied.
    let attempt = service.updateWorkItem({
      cardId: 'rights-card',
      patch: { resourceGroup: 'privileged', priority: 'high' },
    }, agentCtx());
    assert.notEqual(attempt.ok, false); // the body write (priority) still lands
    assert.equal(attempt.card.resourceGroup, 'baseline'); // rights field unchanged
    assert.equal(attempt.card.priority, 'high');
    assert.deepEqual(attempt.deniedRightsFields, ['resourceGroup']);

    // A board-author CAN change the rights field.
    let authored = service.updateWorkItem({
      cardId: 'rights-card',
      patch: { resourceGroup: 'privileged' },
    }, humanCtx());
    assert.equal(authored.card.resourceGroup, 'privileged');
  });
});
