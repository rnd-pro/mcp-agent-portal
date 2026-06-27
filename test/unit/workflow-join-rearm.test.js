import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { DEFAULT_WORKFLOW_BOARD_ID } from '../../src/iso/workflow-board.js';
import { StateGraph } from '../../src/node/state-graph.js';
import { createWorkflowBoardService } from '../../src/node/workflow-board-service.js';
import { humanPrincipal } from '../../src/node/server/principal.js';

// Re-armable per-wave join (S6). decomposeWorkItem advances the parent's monotonic decomposeWaveSeq
// and stamps it on the wave's children; materializeJoinCard threads the seq onto the join card; the
// orchestrate reuse guard reuses a join only within the SAME wave, so a later wave mints a fresh join
// (own ownerNotifiedAt=unset) and the owner is woken once per wave.
describe('workflow board re-armable per-wave join', () => {
  let tmpDir;
  let sg;
  let now;
  let idSeq;
  let service;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'workflow-join-rearm-'));
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
      defaultPrincipal: humanPrincipal({ transport: { channel: 'loopback' }, label: 'local-human' }),
    });
  });

  afterEach(async () => {
    await sg.flushChatWrites();
    sg.flush();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function makeOwner(id) {
    let created = service.createOrUpdateCard({
      id,
      title: 'Origin idea',
      projectId: 'agent-portal',
      domain: 'orchestration',
      columnId: 'backlog',
      owner: 'orchestrator',
      acceptanceCriteria: ['x'],
      actor: 'test',
    });
    return created.card;
  }

  it('bumps decomposeWaveSeq monotonically and stamps the wave on each child', () => {
    let parent = makeOwner('rearm-owner');
    let waveOne = service.decomposeWorkItem({
      cardId: parent.id, actor: 'test',
      childItems: [{ title: 'W1 child', owner: 'backend-engineer', acceptanceCriteria: ['y'] }],
    });
    assert.equal(waveOne.children[0].metadata.waveSeq, 1, 'first wave children carry waveSeq 1');
    assert.equal(
      service.getCard(parent.id).metadata.decomposeWaveSeq, 1,
      'the parent metadata records the first wave even though it auto-closed',
    );

    // The auto-closed parent is re-decomposed (a second wave). The seq survives the close metadata
    // write and strictly increments; closes never reset the counter.
    let waveTwo = service.decomposeWorkItem({
      cardId: parent.id, actor: 'test',
      childItems: [{ title: 'W2 child', owner: 'backend-engineer', acceptanceCriteria: ['z'] }],
    });
    assert.equal(waveTwo.children[0].metadata.waveSeq, 2, 'second wave children carry waveSeq 2');
    assert.equal(
      service.getCard(parent.id).metadata.decomposeWaveSeq, 2,
      'the seq strictly increments across a closed+re-decomposed parent',
    );
  });

  it('advances the seq even when the parent does not close (decompositionClosesParent off)', () => {
    service.updateWorkflowBoard(
      { automation: { decompositionClosesParent: false } }, { gatedBy: 'board.control' },
    );
    let parent = makeOwner('rearm-noclose');
    let waveOne = service.decomposeWorkItem({
      cardId: parent.id, actor: 'test',
      childItems: [{ title: 'W1 child', owner: 'backend-engineer', acceptanceCriteria: ['y'] }],
    });
    assert.equal(waveOne.parentClosed, false, 'the parent stays in place');
    assert.equal(waveOne.children[0].metadata.waveSeq, 1);
    assert.equal(
      service.getCard(parent.id).metadata.decomposeWaveSeq, 1,
      'the seq is persisted even on a non-closing decompose so it stays continuous',
    );
    let waveTwo = service.decomposeWorkItem({
      cardId: parent.id, actor: 'test',
      childItems: [{ title: 'W2 child', owner: 'backend-engineer', acceptanceCriteria: ['z'] }],
    });
    assert.equal(waveTwo.children[0].metadata.waveSeq, 2, 'a non-closing parent still advances the wave');
  });

  it('materializeJoinCard stamps the owner live waveSeq, and an explicit option overrides it', () => {
    service.createOrUpdateCard({
      id: 'jm-a', title: 'Member A', projectId: 'agent-portal', domain: 'backend',
      columnId: 'backlog', owner: 'orchestrator', acceptanceCriteria: ['Done'], actor: 'test',
    });
    let owner = service.createOrUpdateCard({
      id: 'jr-owner', title: 'Owner', projectId: 'agent-portal', domain: 'orchestration',
      columnId: 'backlog', owner: 'orchestrator', acceptanceCriteria: ['x'], actor: 'test',
      metadata: { decomposeWaveSeq: 3 },
    });
    assert.equal(owner.card.metadata.decomposeWaveSeq, 3);
    let board = sg.get(`workflowBoards/${DEFAULT_WORKFLOW_BOARD_ID}`);

    let inherited = service.materializeJoinCard(board, {
      mode: 'join', members: ['jm-a'], onFailure: 'fail_fast', joinPolicy: { type: 'any' },
    }, 'jr-owner');
    assert.equal(inherited.metadata.waveSeq, 3, 'the join inherits the owner live decomposeWaveSeq');

    let overridden = service.materializeJoinCard(board, {
      mode: 'join', members: ['jm-a'], onFailure: 'fail_fast', joinPolicy: { type: 'any' },
    }, 'jr-owner', undefined, { waveSeq: 7 });
    assert.equal(overridden.metadata.waveSeq, 7, 'an explicit waveSeq option wins over the owner default');

    let neverDecomposed = service.materializeJoinCard(board, {
      mode: 'join', members: ['jm-a'], onFailure: 'fail_fast', joinPolicy: { type: 'any' },
    }, 'jm-a');
    assert.equal(neverDecomposed.metadata.waveSeq, 0, 'a never-decomposed owner keeps waveSeq 0');
  });
});
