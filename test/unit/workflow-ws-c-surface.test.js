import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { DEFAULT_WORKFLOW_BOARD_ID } from '../../src/iso/workflow-board.js';
import { StateGraph } from '../../src/node/state-graph.js';
import { createWorkflowBoardService } from '../../src/node/workflow-board-service.js';
import { handleWorkflowBoardTool } from '../../src/node/proxy/workflow-board-tools.js';
import { humanPrincipal } from '../../src/node/server/principal.js';

// WS-C surface (S9): the public board-policy authoring + queue + dependency actions, and the S5
// column-authority carry-over that lets a card land in a define_column-added column. These drive the
// service both in-process (explicit board-author principal) and through the MCP
// `handleWorkflowBoardTool` seam (server-derived identity; a forged payload `actor` must be ignored).
//
// Note: every define_* re-validates the transition graph and rejects an invalid result, so a NEW
// non-terminal column cannot be committed as a graph dead-end. The realistic authoring order adds the
// new column's outbound edge first (an edge to a not-yet-present column is harmlessly dropped until
// the column exists), then the column, then its inbound edge — each step staying valid.
describe('workflow WS-C surface (S9)', () => {
  let tmpDir;
  let sg;
  let now;
  let idSeq;
  let service;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'workflow-ws-c-'));
    sg = new StateGraph({
      snapshotPath: path.join(tmpDir, 'state.json'),
      walPath: path.join(tmpDir, 'state.wal'),
      chatsDir: path.join(tmpDir, 'chats'),
    });
    now = 1000;
    idSeq = 0;
    // The trusted local human owns board-author (DEFINE/AUTHOR) caps — the same harness the
    // scheduler/dependency tests use for in-process driving.
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

  function makeCard(id, overrides = {}) {
    let created = service.createOrUpdateCard({
      id,
      title: overrides.title ?? `Card ${id}`,
      body: 'Durable body.',
      columnId: overrides.columnId ?? 'backlog',
      projectId: 'agent-portal',
      domain: 'backend',
      owner: 'orchestrator',
      acceptanceCriteria: ['Done'],
      ...overrides,
    });
    assert.equal(created.ok ?? true, true, `card ${id} created`);
    return created.card;
  }

  // Insert a custom non-terminal column between `ready` and `in-progress`, keeping the graph valid at
  // every committed step. Returns once the column and both edges are live.
  function insertDesignReview() {
    let outbound = service.defineWorkflowTransition({
      from: 'design-review',
      to: 'in-progress',
      gates: ['no_active_blocker'],
    });
    assert.equal(outbound.ok, true, 'outbound edge committed (column absent → edge dropped, graph valid)');
    let column = service.defineWorkflowColumn({
      columnId: 'design-review',
      title: 'Design Review',
      after: 'ready',
      automation: { trigger: 'on_enter', action: 'audit', mode: 'gated', agents: ['code-reviewer'] },
    });
    assert.equal(column.ok, true, 'column committed (now has a live outbound edge)');
    let inbound = service.defineWorkflowTransition({
      from: 'ready',
      to: 'design-review',
      gates: ['has_owner_and_acceptance'],
    });
    assert.equal(inbound.ok, true, 'inbound edge committed');
    return column;
  }

  // ── §4 column authority + define_column round trip ────────────────────────────────────────────

  it('define_column adds a column a card can then be created in (S5 carry-over)', () => {
    // Before the column exists, a card in it is rejected by the board-driven check (the iso normalizer
    // is board-agnostic; the board owns the authority).
    assert.throws(
      () => service.createOrUpdateCard({ title: 'Early', projectId: 'agent-portal', columnId: 'design-review' }),
      /Unknown workflow column "design-review"/,
    );

    insertDesignReview();
    assert.ok(
      service.ensureBoard(DEFAULT_WORKFLOW_BOARD_ID).columns.some(column => column.id === 'design-review'),
    );

    // The column now holds cards: the same create that threw above now succeeds.
    let card = makeCard('card-review', { columnId: 'design-review' });
    assert.equal(card.columnId, 'design-review');
  });

  it('define_transition into a custom column validates; an invalid graph is rejected with the validator error', () => {
    insertDesignReview();
    assert.ok(
      service.ensureBoard(DEFAULT_WORKFLOW_BOARD_ID).transitions
        .some(t => t.from === 'ready' && t.to === 'design-review'),
    );

    // An invalid graph is REJECTED without committing: a lone new non-terminal column is a dead-end
    // (no outbound forward edge), which the validator rejects.
    let invalid = service.defineWorkflowColumn({ columnId: 'orphan', title: 'Orphan' });
    assert.equal(invalid.ok, false);
    assert.equal(invalid.status, 'blocked');
    assert.equal(invalid.failures[0].gate, 'invalid_board_graph');
    assert.equal(invalid.failures[0].code, 'dead_end_column');
    // No commit for the rejected column.
    assert.equal(
      service.ensureBoard(DEFAULT_WORKFLOW_BOARD_ID).columns.some(column => column.id === 'orphan'),
      false,
    );

    // A terminal column without an audit dominator is also rejected (audit/hygiene floor properties).
    let outbound = service.defineWorkflowTransition({ from: 'backlog', to: 'archived', gates: ['clean_diff_and_hygiene'] });
    assert.equal(outbound.ok, true);
    let terminal = service.defineWorkflowColumn({
      columnId: 'archived',
      title: 'Archived',
      automation: { trigger: 'manual', action: 'close', mode: 'manual' },
    });
    assert.equal(terminal.ok, false);
    assert.equal(terminal.failures[0].gate, 'invalid_board_graph');
    assert.equal(terminal.failures[0].code, 'audit_not_dominating');
  });

  it('define_gate rejects a floor-weakening redefinition on a forward edge', () => {
    // quality-audit -> commit-publish carries the audit floor gate. Dropping it is non-monotonic.
    let weakened = service.defineWorkflowGate({
      from: 'quality-audit',
      to: 'commit-publish',
      gates: ['no_active_blocker'],
    });
    assert.equal(weakened.ok, false);
    assert.equal(weakened.failures[0].gate, 'floor_gate_monotonic');

    // Re-supplying the floor gate (narrowing with an extra gate) is accepted.
    let narrowed = service.defineWorkflowGate({
      from: 'quality-audit',
      to: 'commit-publish',
      gates: ['audit_pass_or_explicit_waiver', 'no_active_blocker'],
    });
    assert.equal(narrowed.ok, true);
    assert.deepEqual(narrowed.transition.gates, ['audit_pass_or_explicit_waiver', 'no_active_blocker']);
  });

  it('define_transition rejects an unknown gate from the closed vocabulary', () => {
    assert.throws(
      () => service.defineWorkflowTransition({ from: 'backlog', to: 'ready', gates: ['totally_made_up'] }),
      /Unknown workflow gate "totally_made_up"/,
    );
  });

  // ── Capability gating on the authoring surface ────────────────────────────────────────────────

  it('an agent principal gets pendingApproval on define_*; a board-author succeeds', async () => {
    // Agent identity is server-derived from a verified slug (MCP seam). Agents lack DEFINE, so a
    // policy.define edit is held for approval — never silently applied. The forged payload `actor`
    // claiming a privileged label is ignored.
    let proxyManager = { workflowBoardService: service };
    let asAgent = (args) => handleWorkflowBoardTool(
      proxyManager,
      'workflow_board',
      { ...args, actor: 'board-author' },
      'mcp',
      { context: { verifiedSlug: 'code-reviewer' } },
    );

    for (let args of [
      { action: 'define_column', columnId: 'ready', title: 'Renamed Ready' },
      { action: 'define_transition', from: 'backlog', to: 'ready', gates: ['has_owner_and_acceptance'] },
      { action: 'define_gate', from: 'quality-audit', to: 'commit-publish', gates: ['audit_pass_or_explicit_waiver'] },
    ]) {
      let payload = JSON.parse((await asAgent(args)).content[0].text);
      assert.equal(payload.result.ok, false, `${args.action} held`);
      assert.equal(payload.result.status, 'pendingApproval', `${args.action} pendingApproval`);
    }
    // No agent-authored rename landed: the column title is unchanged (the default 'Tasks').
    assert.equal(
      service.ensureBoard(DEFAULT_WORKFLOW_BOARD_ID).columns.find(column => column.id === 'ready').title,
      'Tasks',
    );

    // The board-author (in-process human principal) succeeds at the same edit (idempotent re-gate of
    // an existing forward edge).
    let authored = service.defineWorkflowGate({
      from: 'quality-audit',
      to: 'commit-publish',
      gates: ['audit_pass_or_explicit_waiver'],
    });
    assert.equal(authored.ok, true);
  });

  // ── delete_column ─────────────────────────────────────────────────────────────────────────────

  it('delete_column removes the column and every transition that references it, bumping the version', () => {
    insertDesignReview();
    let before = service.ensureBoard(DEFAULT_WORKFLOW_BOARD_ID);
    assert.ok(before.transitions.some(t => t.to === 'design-review'));
    assert.ok(before.transitions.some(t => t.from === 'design-review'));

    let deleted = service.deleteWorkflowColumn({ columnId: 'design-review' });
    assert.equal(deleted.ok, true);
    assert.equal(deleted.column.id, 'design-review');
    // Both touching edges are reported as removed.
    let removedKeys = deleted.removedTransitions.map(t => `${t.from}->${t.to}`).sort();
    assert.deepEqual(removedKeys, ['design-review->in-progress', 'ready->design-review']);

    let after = service.ensureBoard(DEFAULT_WORKFLOW_BOARD_ID);
    assert.equal(after.columns.some(column => column.id === 'design-review'), false);
    assert.equal(after.transitions.some(t => t.from === 'design-review' || t.to === 'design-review'), false);
    assert.equal(after.version, before.version + 1);
  });

  it('delete_column rejects (no mutation) while a live card occupies the column', () => {
    insertDesignReview();
    let card = makeCard('occupant', { columnId: 'design-review' });

    let rejected = service.deleteWorkflowColumn({ columnId: 'design-review' });
    assert.equal(rejected.ok, false);
    assert.equal(rejected.status, 'blocked');
    assert.equal(rejected.failures[0].gate, 'column_occupied');
    assert.deepEqual(rejected.failures[0].cardIds, [card.id]);

    // The column and its edges are untouched by the rejected delete.
    let board = service.ensureBoard(DEFAULT_WORKFLOW_BOARD_ID);
    assert.ok(board.columns.some(column => column.id === 'design-review'));
    assert.ok(board.transitions.some(t => t.to === 'design-review'));
  });

  it('delete_column rejects with the validator error when removal would break the graph', () => {
    // Removing `in-progress` strands `quality-audit`: every forward path into it ran through
    // in-progress, so the remaining graph fails reachability/dead-end validation and is not persisted.
    let rejected = service.deleteWorkflowColumn({ columnId: 'in-progress' });
    assert.equal(rejected.ok, false);
    assert.equal(rejected.status, 'blocked');
    assert.equal(rejected.failures[0].gate, 'invalid_board_graph');

    // No commit: the column survives the rejected delete.
    assert.ok(service.ensureBoard(DEFAULT_WORKFLOW_BOARD_ID).columns.some(column => column.id === 'in-progress'));
  });

  it('a non-DEFINE principal is held (pendingApproval) on delete_column', async () => {
    insertDesignReview();
    let proxyManager = { workflowBoardService: service };
    let payload = JSON.parse((await handleWorkflowBoardTool(
      proxyManager,
      'workflow_board',
      { action: 'delete_column', columnId: 'design-review', actor: 'board-author' },
      'mcp',
      { context: { verifiedSlug: 'code-reviewer' } },
    )).content[0].text);
    assert.equal(payload.result.ok, false);
    assert.equal(payload.result.status, 'pendingApproval');

    // The held edit did not land: the column is still present.
    assert.ok(service.ensureBoard(DEFAULT_WORKFLOW_BOARD_ID).columns.some(column => column.id === 'design-review'));
  });

  // ── Dependencies + enqueue for a card-writer ──────────────────────────────────────────────────

  it('link_dependency works for a card-writer and blocks the dependent', () => {
    let upstream = makeCard('dep-up');
    let downstream = makeCard('dep-down');
    let linked = service.linkDependency({ cardId: downstream.id, dependsOn: [upstream.id] });
    assert.equal(linked.ok, true);
    assert.equal(linked.dependsOn[0].cardId, upstream.id);
    assert.equal(linked.lifecycle, 'blocked');

    let unlinked = service.unlinkDependency({ cardId: downstream.id, dependsOn: [upstream.id] });
    assert.equal(unlinked.ok, true);
    assert.deepEqual(unlinked.dependsOn, []);
  });

  it('enqueue admits a card through the MCP tool handler (lifecycle queued, admissionId present)', async () => {
    let card = makeCard('enq-card', { columnId: 'ready', priority: 'normal' });
    let proxyManager = { workflowBoardService: service };
    // Drive enqueue through the MCP seam as a verified agent (holds TRANSITION → enqueue admission).
    // The forged payload `actor` is ignored; identity is server-derived from the verified slug.
    let result = await handleWorkflowBoardTool(
      proxyManager,
      'workflow_board',
      { action: 'enqueue', cardId: card.id, actor: 'someone-else' },
      'mcp',
      { context: { verifiedSlug: 'orchestrator' } },
    );
    let payload = JSON.parse(result.content[0].text);
    assert.equal(payload.result.ok, true);
    assert.equal(payload.result.lifecycle, 'queued');
    assert.ok(payload.result.admissionId, 'admissionId present');

    // The durable card lifecycle is queued.
    assert.equal(sg.get(`workflowCards/${card.id}`).lifecycle, 'queued');
  });

  it('queue is a read-only projection surfacing queue/telemetry and per-card lifecycle', async () => {
    let card = makeCard('queue-card', { columnId: 'ready' });
    service.enqueueWorkflowCard({ cardId: card.id });
    let proxyManager = { workflowBoardService: service };
    let result = await handleWorkflowBoardTool(
      proxyManager,
      'workflow_board',
      { action: 'queue', boardId: DEFAULT_WORKFLOW_BOARD_ID },
      'mcp',
    );
    let payload = JSON.parse(result.content[0].text);
    assert.equal(payload.ok, true);
    let projection = payload.result.projection;
    assert.ok(projection.queue, 'queue projection present');
    assert.ok(projection.telemetry, 'telemetry projection present');
    let projected = projection.cards.find(c => c.id === card.id);
    assert.equal(projected.lifecycle, 'queued');
  });
});
