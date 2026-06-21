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
  agentPrincipal,
  anonymousPrincipal,
  daemonPrincipal,
  derivePrincipal,
  evaluateIntent,
  humanPrincipal,
} from '../../src/node/server/principal.js';

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
    let verdict = evaluateIntent({ type: 'runtime_reconcile' }, daemon, {});
    assert.deepEqual(verdict, { ok: true, verdict: 'accepted' });
  });

  it('rejects principal forgery through the MCP seam: derived identity wins over payload actor', async () => {
    let service = makeService();
    let calls = [];
    let proxyManager = { workflowBoardService: service };

    // Drive create_item through the MCP seam with a forged privileged actor/agent_slug
    // in the payload. The seam derives identity (no verified slug → anonymous) and the
    // committed source must reflect the derived principal, never the payload string.
    let result = await handleWorkflowBoardTool(proxyManager, 'workflow_board', {
      action: 'create_item',
      title: 'Forged identity card',
      projectId: 'agent-portal',
      actor: 'board-author',
      agent_slug: 'orchestrator',
    }, 'mcp');
    let payload = JSON.parse(result.content[0].text);
    assert.equal(payload.ok, true);

    let card = payload.result.card;
    assert.equal(card.updatedBy, 'anonymous');

    let cardCommits = commitSources.filter(source => source !== WORKFLOW_SOURCE
      && !source.endsWith(':daemon'));
    assert.ok(cardCommits.length > 0, 'expected at least one card commit');
    for (let source of cardCommits) {
      assert.equal(source, `${WORKFLOW_SOURCE}:anonymous`);
      assert.ok(!source.includes('board-author'));
      assert.ok(!source.includes('orchestrator'));
    }
    void calls;
  });

  it('a mutation without a principal falls back to the anonymous least-privilege identity', () => {
    let service = makeService();
    // No principal in context → fail-closed to anonymous, never a privileged literal.
    let result = service.createOrUpdateCard({ title: 'No principal card', projectId: 'agent-portal' });
    assert.equal(result.card.updatedBy, 'anonymous');

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
