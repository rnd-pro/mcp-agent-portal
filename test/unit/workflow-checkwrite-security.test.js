import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { checkPassed } from '../../src/iso/workflow-board.js';
import { StateGraph } from '../../src/node/state-graph.js';
import { createWorkflowBoardService } from '../../src/node/workflow-board-service.js';
import { agentPrincipal, daemonPrincipal, derivePrincipal } from '../../src/node/server/principal.js';

// Regression tests for the separated-duty check-writing closure (inv 33/47). These lock down two
// bypasses found by adversarial review: a floor-check classification gap (a non-object `checks`
// wrapper key) and an attacker-writable `executedBy` execution-attribution field.

describe('check-writing separated-duty (security regression)', () => {
  let dir;
  let sg;
  let n = 0;
  const human = derivePrincipal({ channel: 'loopback' }); // id: local-human, full caps incl. AUDIT
  const agent = agentPrincipal({ slug: 'backend-engineer', transport: { channel: 'mcp' } }); // no AUDIT

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'checkwrite-sec-'));
    sg = new StateGraph({
      snapshotPath: path.join(dir, 's.json'),
      walPath: path.join(dir, 's.wal'),
      chatsDir: path.join(dir, 'chats'),
      oldConfigPath: path.join(dir, 'no-old-config.json'),
    });
    n = 0;
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  function makeService() {
    let i = 0;
    return createWorkflowBoardService({
      stateGraph: sg,
      now: () => 1000 + (++i),
      makeId: (p) => `${p}-${++n}`,
      defaultPrincipal: human,
    });
  }

  function auditCard(svc) {
    return svc.createOrUpdateCard({
      title: 'T', projectId: 'p', domain: 'backend', owner: 'o',
      acceptanceCriteria: ['x'], columnId: 'quality-audit',
    }).card.id;
  }

  it('createOrUpdateCard returns ok:true on success', () => {
    let svc = makeService();
    let res = svc.createOrUpdateCard({ title: 'Ok', projectId: 'p', columnId: 'ideas' });
    assert.equal(res.ok, true);
  });

  it('an agent cannot self-grant a floor check via a non-object `checks` wrapper key', () => {
    let svc = makeService();
    let cardId = auditCard(svc);
    // The classifier must not be fooled into checks.write.basic by a nested non-object `checks`.
    let res = svc.createOrUpdateCard({ cardId, checks: { checks: 'x', audit: 'passed' } }, agent);
    assert.equal(res.ok, false, 'agent floor-check write must be blocked');
    assert.equal(res.status, 'blocked');
    assert.equal(sg.get(`workflowChecks/${cardId}`), undefined, 'no floor check may be persisted');
  });

  it('an agent cannot reach done by self-signing audit/hygiene (full kill-chain stays closed)', () => {
    let svc = makeService();
    let cardId = auditCard(svc);
    svc.createOrUpdateCard({ cardId, checks: { checks: 'x', audit: 'passed' } }, agent);
    let move = svc.requestTransition({ cardId, toColumnId: 'commit-publish', reason: 'go' }, agent);
    let status = move.status ?? move.result?.status;
    assert.notEqual(status, 'accepted', 'agent must not pass the audit gate to commit-publish');
  });

  it('a caller cannot wipe service-owned executedBy through metadata input', () => {
    let svc = makeService();
    let cardId = auditCard(svc);
    // Simulate the human having executed the card (the run path stamps principal.id).
    let card = sg.get(`workflowCards/${cardId}`);
    sg.commit([{ op: 'set', path: `workflowCards/${cardId}`, value: { ...card, metadata: { ...card.metadata, executedBy: [human.id] } } }], 'seed');

    svc.createOrUpdateCard({ cardId, metadata: { executedBy: [] } }, human);
    assert.deepEqual(sg.get(`workflowCards/${cardId}`).metadata.executedBy, [human.id], 'executedBy must survive a wipe attempt');

    // And the executor still cannot sign its own card's audit (separated duty).
    let sign = svc.createOrUpdateCard({ cardId, checks: { audit: 'passed' } }, human);
    assert.equal(sign.ok, false);
    assert.equal(sign.failures?.[0]?.gate, 'separated_duty');
  });

  it('the daemon cannot floor-sign a card it executed — daemon.bookkeeping does not bypass separated duty', () => {
    let svc = makeService();
    let cardId = auditCard(svc);
    let daemon = daemonPrincipal();
    // The daemon ran the card (its id stamped on executedBy by the run path).
    let card = sg.get(`workflowCards/${cardId}`);
    sg.commit([{ op: 'set', path: `workflowCards/${cardId}`, value: { ...card, metadata: { ...card.metadata, executedBy: [daemon.id] } } }], 'seed');

    // A daemon floor write maps to daemon.bookkeeping (DAEMON) for the capability gate, but it is still
    // a floor signature: the executedBy separated-duty constraint applies to it too.
    let sign = svc.createOrUpdateCard({ cardId, checks: { audit: 'passed' } }, daemon);
    assert.equal(sign.ok, false, 'the daemon may not sign the audit floor of a card it executed');
    assert.equal(sign.failures?.[0]?.gate, 'separated_duty');
    assert.equal(checkPassed(sg.get(`workflowChecks/${cardId}`)?.checks?.audit), false, 'no floor pass is persisted');

    // An explicit per-board waiver with a recorded approver authorizes the daemon self-sign.
    svc.updateWorkflowBoard(
      { automation: { daemonFloorSignWaiver: { approver: 'local-human' } } }, { gatedBy: 'board.control' },
    );
    let waived = svc.createOrUpdateCard({ cardId, checks: { audit: 'passed' } }, daemon);
    assert.equal(waived.ok, true, 'the waiver authorizes the daemon self-sign');
    assert.equal(checkPassed(sg.get(`workflowChecks/${cardId}`)?.checks?.audit), true, 'the waived floor pass is persisted');
  });
});
