import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { StateGraph } from '../../src/node/state-graph.js';
import { createWorkflowBoardService } from '../../src/node/workflow-board-service.js';
import { humanPrincipal } from '../../src/node/server/principal.js';

// buildWorkItemPrompt returns + realization rollup (step 7): the orchestrator's re-engagement prompt
// must render the structured intermediate child returns (kind, detail, routed/terminal/hardInterrupt
// flags, one-line payload digest) AND a cheap idea-realization rollup keyed on rootCardId, both as the
// evidence for a realized-vs-redecompose call. The contract guidance must name `decompose` (another
// wave) as a legitimate re-engagement choice alongside rework/reject/needs_human.
describe('buildWorkItemPrompt — returns + idea-realization rollup (S7)', () => {
  let tmpDir;
  let sg;
  let now;
  let idSeq;
  let service;

  function makeProxy() {
    return {
      requestFromChild: async () => ({ content: [{ type: 'text', text: 'ok' }] }),
      chatWsServer: { taskChatMap: new Map() },
    };
  }

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'workflow-prompt-rollup-'));
    sg = new StateGraph({
      snapshotPath: path.join(tmpDir, 'state.json'),
      walPath: path.join(tmpDir, 'state.wal'),
      chatsDir: path.join(tmpDir, 'chats'),
    });
    now = 1000;
    idSeq = 0;
    service = createWorkflowBoardService({
      stateGraph: sg,
      now: () => now++,
      makeId: (prefix) => `${prefix}-${++idSeq}`,
      projectRoot: tmpDir,
      proxyManager: makeProxy(),
      defaultPrincipal: humanPrincipal({ transport: { channel: 'loopback' }, label: 'local-human' }),
    });
  });

  afterEach(async () => {
    await sg.flushChatWrites();
    sg.flush();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function plantCard(input) {
    return service.createOrUpdateCard({
      projectId: 'agent-portal',
      domain: 'backend',
      owner: 'orchestrator',
      acceptanceCriteria: ['Done when realized'],
      actor: 'test',
      ...input,
    }).card;
  }

  // Patch a card's metadata directly (returns inbox / rootCardId) without going through the gate.
  function setMetadata(cardId, metadata) {
    let card = service.getCard(cardId);
    sg.commit(
      [{ op: 'set', path: `workflowCards/${cardId}`, value: { ...card, metadata: { ...card.metadata, ...metadata } } }],
      'test:set-metadata',
    );
  }

  it('renders structured wake-driving returns with flags and a payload digest', () => {
    let parent = plantCard({ id: 'p1', title: 'Origin idea', columnId: 'ready' });
    setMetadata('p1', {
      returns: [
        {
          schema: 'workflow-return/v1', eventId: 'e1', kind: 'discovered', detail: 'found a sub-task',
          actionable: true, terminal: false, hardInterrupt: false, routed: true,
          correlationId: 'p1', payload: { area: 'auth', files: 3 },
        },
        // A soft progress return is not wake-driving — it must NOT appear in the block.
        {
          schema: 'workflow-return/v1', eventId: 'e2', kind: 'progress', detail: 'still working',
          actionable: false, terminal: false, hardInterrupt: false, routed: false, correlationId: 'p1',
        },
        // A consumed actionable return is no longer wake-driving — also excluded.
        {
          schema: 'workflow-return/v1', eventId: 'e3', kind: 'needs_decision', detail: 'old question',
          actionable: true, terminal: false, hardInterrupt: true, routed: true,
          correlationId: 'p1', consumedAt: 999,
        },
      ],
    });

    let prompt = service.buildWorkItemPrompt(service.getCard('p1'));
    assert.match(prompt, /Intermediate child returns \(1\)/, 'only the one wake-driving return is rendered');
    assert.match(prompt, /- discovered \[routed\]: found a sub-task — area=auth, files=3/);
    assert.doesNotMatch(prompt, /still working/, 'soft progress is not wake-driving');
    assert.doesNotMatch(prompt, /old question/, 'a consumed return is not rendered');
  });

  it('renders the idea-realization rollup keyed on rootCardId, bucketed by terminal status', () => {
    let root = plantCard({ id: 'root', title: 'Origin idea', columnId: 'ready' });
    // Children stamped with the same rootCardId, resting in distinct terminal/active columns.
    plantCard({ id: 'd1', title: 'Done child', columnId: 'done', parentCardId: 'root' });
    plantCard({ id: 'd2', title: 'Rejected child', columnId: 'rejected', parentCardId: 'root' });
    plantCard({ id: 'a1', title: 'Active child', columnId: 'in-progress', parentCardId: 'root' });
    for (let id of ['d1', 'd2', 'a1']) setMetadata(id, { rootCardId: 'root' });
    // A blocked child — lifecycle is a top-level field set directly (createOrUpdateCard normalizes it).
    plantCard({ id: 'b1', title: 'Blocked child', columnId: 'in-progress', parentCardId: 'root' });
    setMetadata('b1', { rootCardId: 'root' });
    let blocked = service.getCard('b1');
    sg.commit([{ op: 'set', path: 'workflowCards/b1', value: { ...blocked, lifecycle: 'blocked' } }], 'test:block');

    let prompt = service.buildWorkItemPrompt(service.getCard('root'));
    assert.match(prompt, /Idea-realization rollup for root root \(5 cards/);
    // active counts the root itself (resting in `ready`, a non-terminal column) plus the in-flight child.
    assert.match(prompt, /done: 1 {2}rejected: 1 {2}blocked: 1 {2}active: 2/);
  });

  it('omits the rollup for a lone card (no decomposed subtree)', () => {
    plantCard({ id: 'solo', title: 'Lone work item', columnId: 'ready' });
    let prompt = service.buildWorkItemPrompt(service.getCard('solo'));
    assert.doesNotMatch(prompt, /Idea-realization rollup/, 'a single-card idea gets no rollup');
  });

  it('the output contract names `decompose` as a re-engagement routing option', () => {
    plantCard({ id: 'c1', title: 'Work item', columnId: 'ready' });
    let prompt = service.buildWorkItemPrompt(service.getCard('c1'));
    assert.match(prompt, /`decompose`/, 'the contract surfaces decompose as a routing choice');
    assert.match(prompt, /idea-realization rollup/i, 'the contract points at the rollup as evidence');
  });
});
