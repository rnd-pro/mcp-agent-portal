import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { StateGraph } from '../../src/node/state-graph.js';
import {
  createWorkflowBoardService,
  scoreStageAgent,
  pickStageAgentFromPool,
  DEFAULT_STAGE_AGENT_SPECIALTIES,
} from '../../src/node/workflow-board-service.js';
import { humanPrincipal } from '../../src/node/server/principal.js';

// Smart stage-agent selection: a stage's connected pool (automation.agents) defines the candidate
// actions, and the orchestrator picks WHICH connected agent fits a given card by specialty. These
// cover the pure scorer/picker and the end-to-end chooseStageAgent precedence reached through
// orchestrateWorkItem (delegate:false so no real agent-pool task is ever spawned).

describe('stage-agent specialty scorer (pure)', () => {
  let pool = ['backend-engineer', 'ui-engineer', 'provider-engineer', 'tooling-engineer'];

  it('scores a slug by file path against its specialty rule', () => {
    assert.ok(
      scoreStageAgent('ui-engineer', {}, ['symbiote-ui/components/button.js']) > 0,
      'symbiote-ui path is a UI signal',
    );
    assert.ok(scoreStageAgent('ui-engineer', {}, ['app/styles/main.css']) > 0, '.css is a UI signal');
    assert.equal(
      scoreStageAgent('ui-engineer', {}, ['src/node/server/routes.js']),
      0,
      'a backend path is not a UI signal',
    );
  });

  it('scores domain and routingHints, with the file path weighted highest', () => {
    let byDomain = scoreStageAgent('provider-engineer', { domain: 'provider' }, []);
    let byHint = scoreStageAgent('provider-engineer', { routingHints: ['provider'] }, []);
    let byPath = scoreStageAgent('provider-engineer', {}, ['src/engine/openai.driver.js']);
    assert.ok(byDomain > 0 && byHint > 0 && byPath > 0);
    assert.ok(byPath > byDomain, 'a concrete file path outweighs a coarse domain label');
    assert.ok(byDomain > byHint, 'domain outweighs a single routing hint');
  });

  it('scores zero for a slug with no specialty rule (unknown agent)', () => {
    assert.equal(scoreStageAgent('release-manager', { domain: 'ui' }, ['app.css']), 0);
    assert.equal(scoreStageAgent('', { domain: 'ui' }, ['app.css']), 0);
  });

  it('picks the best-fitting engineer from the connected pool', () => {
    assert.equal(
      pickStageAgentFromPool(pool, { domain: 'ui' }, ['symbiote-ui/ui/card.js']),
      'ui-engineer',
    );
    assert.equal(
      pickStageAgentFromPool(pool, {}, ['packages/project-graph-mcp/src/index.js']),
      'tooling-engineer',
    );
    assert.equal(
      pickStageAgentFromPool(pool, { routingHints: ['driver'] }, ['src/engine/anthropic.driver.js']),
      'provider-engineer',
    );
    assert.equal(
      pickStageAgentFromPool(pool, { domain: 'backend' }, ['src/node/workflow-board-service.js']),
      'backend-engineer',
    );
  });

  it('returns null when no card signal scores, so the caller can fall back to the pool head', () => {
    assert.equal(pickStageAgentFromPool(pool, {}, []), null);
    assert.equal(pickStageAgentFromPool(pool, { domain: 'unmatched' }, ['notes.txt']), null);
  });

  it('only ever returns a slug present in the connected pool', () => {
    // ui-engineer is the strongest fit but absent from this pool — the picker must not invent it.
    let narrow = ['backend-engineer', 'provider-engineer'];
    let picked = pickStageAgentFromPool(narrow, { domain: 'ui' }, ['app.css']);
    assert.ok(picked === null || narrow.includes(picked));
    assert.notEqual(picked, 'ui-engineer');
  });

  it('honors an overridable specialty map without touching the default', () => {
    let custom = [{ slug: 'docs-writer', paths: [/\.md$/i], domains: ['docs'], hints: ['docs'] }];
    assert.equal(pickStageAgentFromPool(['docs-writer', 'backend-engineer'], {}, ['README.md'], custom), 'docs-writer');
    // The default map has no docs-writer rule, so the same card scores it zero there.
    assert.equal(scoreStageAgent('docs-writer', {}, ['README.md'], DEFAULT_STAGE_AGENT_SPECIALTIES), 0);
  });
});

describe('chooseStageAgent precedence (end-to-end via orchestrateWorkItem)', () => {
  let tmpDir;
  let sg;
  let now;
  let idSeq;
  let service;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'workflow-stage-routing-'));
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
    service.ensureBoard();
  });

  afterEach(async () => {
    await sg.flushChatWrites();
    sg.flush();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // Plant a card directly in the in-progress column, whose default automation pool is the four
  // engineers under test. orchestrateWorkItem with delegate:false records the chosen agent as the
  // run's leaseOwner without spawning a real task; force skips capacity/conflict pre-checks.
  function planInProgressCard(overrides = {}) {
    let created = service.createOrUpdateCard({
      title: `routing-${++idSeq}`,
      body: 'Stage routing fixture.',
      columnId: 'in-progress',
      projectId: 'agent-portal',
      owner: 'orchestrator',
      acceptanceCriteria: ['Routed to the right engineer'],
      ...overrides,
    });
    return created.card;
  }

  async function chosenAgentFor(card, args = {}) {
    let result = await service.orchestrateWorkItem({
      cardId: card.id,
      mode: 'manual',
      delegate: false,
      force: true,
      ...args,
    });
    assert.equal(result.ok, true, 'orchestrate resolved');
    return result.run.leaseOwner;
  }

  it('an explicit args.agent in the pool wins over every other signal', async () => {
    let card = planInProgressCard({ domain: 'ui', files: ['app.css'], assignedAgent: 'provider-engineer' });
    assert.equal(await chosenAgentFor(card, { agent: 'tooling-engineer' }), 'tooling-engineer');
  });

  it('card.assignedAgent in the pool wins over a specialty match when no explicit agent is given', async () => {
    let card = planInProgressCard({ domain: 'ui', files: ['app.css'], assignedAgent: 'provider-engineer' });
    assert.equal(await chosenAgentFor(card), 'provider-engineer');
  });

  it('with no explicit/assigned agent, selects the engineer matching the card domain', async () => {
    let card = planInProgressCard({ domain: 'ui' });
    assert.equal(await chosenAgentFor(card), 'ui-engineer');
  });

  it('with no explicit/assigned agent, selects the engineer matching the card files', async () => {
    let card = planInProgressCard({ files: ['packages/agent-pool-mcp/src/pool.js'] });
    assert.equal(await chosenAgentFor(card), 'tooling-engineer');
  });

  it('falls back to the first connected agent when no card signal scores', async () => {
    let card = planInProgressCard({ files: ['docs/notes.txt'] });
    assert.equal(await chosenAgentFor(card), 'backend-engineer');
  });
});
