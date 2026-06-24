import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { StateGraph } from '../../src/node/state-graph.js';
import { createWorkflowBoardRoutes } from '../../src/node/server/routes/workflow-board-routes.js';

function makeReq(method, url, body) {
  let req = new EventEmitter();
  req.method = method;
  req.url = url;
  // Same-uid loopback request: the route seam derives the bootstrap local-human principal
  // (board-author caps) from this, so mutating route handlers pass the S6 capability gate.
  req.socket = { remoteAddress: '127.0.0.1' };
  req.headers = {};
  req.destroy = (err) => req.emit('error', err);
  process.nextTick(() => {
    if (body !== undefined) req.emit('data', JSON.stringify(body));
    req.emit('end');
  });
  return req;
}

function makeRes() {
  return {
    status: null,
    headers: null,
    body: '',
    writeHead(status, headers) {
      this.status = status;
      this.headers = headers;
    },
    end(body = '') {
      this.body = body;
    },
    json() {
      return JSON.parse(this.body);
    },
  };
}

async function writeRouteWorkItemSeed(root, projectId, fileName, frontmatter) {
  let dir = path.join(root, '.agent-portal', 'workspace', projectId, 'plans', 'work-items');
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, fileName), `---\n${frontmatter.trim()}\n---\n\nRoute seed body.\n`, 'utf8');
}

describe('workflow board routes', () => {
  it('registers board, card, transition, event, and recovery handlers', async () => {
    let oldMemoryRoot = process.env.AGENT_PORTAL_MEMORY_ROOT;
    let tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'workflow-board-routes-'));
    process.env.AGENT_PORTAL_MEMORY_ROOT = path.join(tmpDir, '.agent-portal');
    let sg = new StateGraph({
      snapshotPath: path.join(tmpDir, 'state.json'),
      walPath: path.join(tmpDir, 'state.wal'),
      chatsDir: path.join(tmpDir, 'chats'),
    });
    let routes = createWorkflowBoardRoutes({
      stateGraph: sg,
      now: () => 2000,
      makeId: (prefix) => `${prefix}-route`,
      projectRoot: tmpDir,
      proxyManager: {
        requestFromChild: async () => ({
          content: [{
            type: 'text',
            text: JSON.stringify({
              tasks: [{
                id: 'task-route-orphan',
                kind: 'workflow-runtime-task',
                status: 'running',
                prompt: 'Route runtime task',
                projectId: 'project-alpha',
                workflowBoardId: 'agent-workflow-default',
                workflowCardId: 'route-missing-work-item',
                startedAt: 2100,
                events: [{ type: 'message', text: 'route event', ts: 2101 }],
              }, {
                id: 'task-route-chat-only',
                status: 'running',
                prompt: 'Route chat exchange',
                projectId: 'project-alpha',
                chatId: 'chat-route',
                startedAt: 2150,
              }],
            }),
          }],
        }),
      },
    });

    try {
      await writeRouteWorkItemSeed(tmpDir, 'project-alpha', 'work-item-route-seed.md', `
schema: agent-workflow-card/v1
id: work-item-route-seed
project_id: project-alpha
title: Route seed work item
seed_board: agent-workflow-default
seed_column: backlog
`);

      for (let key of [
        'GET /api/workflow-board',
        'GET /api/workflow-board/boards',
        'POST /api/workflow-board/cards',
        'POST /api/workflow-board/cards/update',
        'POST /api/workflow-board/cards/comment',
        'GET /api/workflow-board/cards/comments',
        'POST /api/workflow-board/cards/reply',
        'POST /api/workflow-board/decompose',
        'POST /api/workflow-board/transition',
        'POST /api/workflow-board/enqueue',
        'POST /api/workflow-board/dependencies/link',
        'POST /api/workflow-board/dependencies/unlink',
        'POST /api/workflow-board/columns/define',
        'POST /api/workflow-board/transitions/define',
        'POST /api/workflow-board/gates/define',
        'POST /api/workflow-board/orchestrate',
        'POST /api/workflow-board/control',
        'POST /api/workflow-board/delete',
        'POST /api/workflow-board/columns/update',
        'POST /api/workflow-board/automation',
        'GET /api/workflow-board/events',
        'GET /api/workflow-board/recovery',
        'POST /api/workflow-board/recovery/reconcile',
        'POST /api/workflow-board/markdown/import',
        'POST /api/workflow-board/markdown/export',
      ]) {
        assert.equal(typeof routes[key], 'function', `missing ${key}`);
      }

      let createRes = makeRes();
      await routes['POST /api/workflow-board/cards'](
        makeReq('POST', '/api/workflow-board/cards', {
          title: 'Route card',
          projectId: 'project-alpha',
          domain: 'backend',
          columnId: 'ideas',
          entityRefs: { goalId: 'goal-route', chatId: 'chat-route-workflow' },
          actor: 'route-test',
        }),
        createRes,
      );
      let created = createRes.json();

      assert.equal(createRes.status, 200);
      assert.equal(created.ok, true);
      assert.equal(created.card.columnId, 'ideas');

      let boardsRes = makeRes();
      await routes['GET /api/workflow-board/boards'](
        makeReq('GET', '/api/workflow-board/boards?projectId=project-alpha'),
        boardsRes,
      );
      let boards = boardsRes.json();

      assert.equal(boardsRes.status, 200);
      assert.equal(boards.ok, true);
      assert.equal(boards.boards.some(board => board.id === 'agent-workflow-default'), true);

      let updateRes = makeRes();
      await routes['POST /api/workflow-board/cards/update'](
        makeReq('POST', '/api/workflow-board/cards/update', {
          cardId: created.card.id,
          expectedVersion: created.card.version,
          patch: { priority: 'high' },
          actor: 'route-test',
        }),
        updateRes,
      );
      let updated = updateRes.json();

      assert.equal(updateRes.status, 200);
      assert.equal(updated.ok, true);
      assert.equal(updated.card.priority, 'high');
      assert.equal(updated.card.version, created.card.version + 1);

      // This route plumbing test reuses the decomposed parent for a later transition, so opt out of
      // the close-on-decompose default here (that semantic is covered by the board model test).
      await routes['POST /api/workflow-board/automation'](
        makeReq('POST', '/api/workflow-board/automation', {
          boardId: 'agent-workflow-default',
          automation: { decompositionClosesParent: false },
          actor: 'route-test',
        }),
        makeRes(),
      );

      let decomposeRes = makeRes();
      await routes['POST /api/workflow-board/decompose'](
        makeReq('POST', '/api/workflow-board/decompose', {
          cardId: created.card.id,
          expectedVersion: updated.card.version,
          childItems: [{
            id: 'card-route-child',
            title: 'Route child card',
            owner: 'route-agent',
            acceptanceCriteria: ['Child route works'],
          }],
          actor: 'route-test',
          reason: 'Split route card into child work.',
        }),
        decomposeRes,
      );
      let decomposed = decomposeRes.json();

      assert.equal(decomposeRes.status, 200);
      assert.equal(decomposed.ok, true);
      assert.deepEqual(decomposed.result.childCardIds, ['card-route-child']);
      assert.equal(decomposed.result.children[0].parentCardId, created.card.id);

      let boardRes = makeRes();
      await routes['GET /api/workflow-board'](
        makeReq('GET', '/api/workflow-board?projectId=project-alpha'),
        boardRes,
      );
      let board = boardRes.json();

      assert.equal(boardRes.status, 200);
      assert.equal(board.ok, true);
      assert.deepEqual(board.projection.cards.map(card => card.id), [
        created.card.id,
        'card-route-child',
        'runtime-task-route-orphan',
      ]);
      assert.deepEqual(
        board.projection.cards.find(card => card.id === created.card.id).childCardIds,
        ['card-route-child'],
      );
      assert.equal(
        board.projection.cards.some(card => card.id === 'work-item-route-seed'),
        false,
      );
      assert.equal(board.projection.cards.find(card => card.id === 'runtime-task-route-orphan').events.length, 1);
      assert.equal(board.projection.cards.some(card => card.id === 'runtime-task-route-chat-only'), false);

      let importingBoardRes = makeRes();
      await routes['GET /api/workflow-board'](
        makeReq('GET', '/api/workflow-board?projectId=project-alpha&importMarkdown=true'),
        importingBoardRes,
      );
      let importingBoard = importingBoardRes.json();
      assert.equal(importingBoardRes.status, 200);
      assert.equal(
        importingBoard.projection.cards.find(card => card.id === 'work-item-route-seed').columnId,
        'backlog',
      );

      let columnRes = makeRes();
      await routes['POST /api/workflow-board/columns/update'](
        makeReq('POST', '/api/workflow-board/columns/update', {
          columnId: 'ready',
          expectedVersion: board.projection.board.version,
          patch: {
            automation: {
              mode: 'gated',
              agents: ['route-agent'],
              parallelLimit: 2,
            },
          },
          actor: 'route-test',
        }),
        columnRes,
      );
      let columnUpdate = columnRes.json();

      assert.equal(columnRes.status, 200);
      assert.equal(columnUpdate.ok, true);
      assert.equal(columnUpdate.result.column.automation.mode, 'gated');
      assert.deepEqual(columnUpdate.result.column.automation.agents, ['route-agent']);

      let boardAutomationRes = makeRes();
      await routes['POST /api/workflow-board/automation'](
        makeReq('POST', '/api/workflow-board/automation', {
          boardId: 'agent-workflow-default',
          patch: {
            mode: 'manual',
            automation: {
              pickup: 'manual',
              globalParallelLimit: 3,
              fallbackAgents: ['route-agent'],
            },
          },
          actor: 'route-test',
          reason: 'Route board automation update',
        }),
        boardAutomationRes,
      );
      let boardAutomation = boardAutomationRes.json();

      assert.equal(boardAutomationRes.status, 200);
      assert.equal(boardAutomation.ok, true);
      assert.equal(boardAutomation.result.board.mode, 'manual');
      assert.equal(boardAutomation.result.board.automation.pickup, 'manual');
      assert.equal(boardAutomation.result.board.automation.globalParallelLimit, 3);
      assert.equal(boardAutomation.result.event.eventType, 'board_update');

      let filteredBoardRes = makeRes();
      await routes['GET /api/workflow-board'](
        makeReq('GET', '/api/workflow-board?projectId=project-alpha&goalId=goal-route&chatId=chat-route-workflow'),
        filteredBoardRes,
      );
      let filteredBoard = filteredBoardRes.json();

      assert.equal(filteredBoardRes.status, 200);
      assert.deepEqual(filteredBoard.projection.cards.map(card => card.id), [created.card.id]);
      assert.equal(filteredBoard.projection.scope.goalId, 'goal-route');
      assert.equal(filteredBoard.projection.scope.chatId, 'chat-route-workflow');

      let transitionRes = makeRes();
      await routes['POST /api/workflow-board/transition'](
        makeReq('POST', '/api/workflow-board/transition', {
          cardId: created.card.id,
          fromColumnId: 'ideas',
          toColumnId: 'backlog',
          expectedVersion: filteredBoard.projection.cards[0].version,
          actor: 'route-test',
          reason: 'Classified',
        }),
        transitionRes,
      );
      let transition = transitionRes.json();

      assert.equal(transitionRes.status, 200);
      assert.equal(transition.ok, true);
      assert.equal(transition.result.status, 'accepted');
      assert.equal(transition.result.card.columnId, 'backlog');

      await routes['POST /api/workflow-board/cards'](
        makeReq('POST', '/api/workflow-board/cards', {
          title: 'Needs resume',
          projectId: 'project-alpha',
          columnId: 'in-progress',
          recoveryFlags: ['needs_resume'],
          actor: 'route-test',
        }),
        makeRes(),
      );

      let eventsRes = makeRes();
      await routes['GET /api/workflow-board/events'](
        makeReq('GET', `/api/workflow-board/events?cardId=${created.card.id}`),
        eventsRes,
      );
      let events = eventsRes.json();

      assert.equal(eventsRes.status, 200);
      assert.equal(events.ok, true);
      assert.deepEqual(events.events.map(event => event.eventType), ['decomposition', 'transition']);
      assert.deepEqual(events.events.map(event => event.status), ['accepted', 'accepted']);

      let boardEventsRes = makeRes();
      await routes['GET /api/workflow-board/events'](
        makeReq('GET', '/api/workflow-board/events?eventType=board_update'),
        boardEventsRes,
      );
      let boardEvents = boardEventsRes.json();

      assert.equal(boardEventsRes.status, 200);
      assert.equal(boardEvents.events.some(event => event.eventType === 'board_update'), true);

      let recoveryRes = makeRes();
      await routes['GET /api/workflow-board/recovery'](
        makeReq('GET', '/api/workflow-board/recovery?projectId=project-alpha'),
        recoveryRes,
      );
      let recovery = recoveryRes.json();

      assert.equal(recoveryRes.status, 200);
      assert.equal(recovery.ok, true);
      assert.equal(recovery.recovery.summary.needsResume, 1);

      let readyRes = makeRes();
      await routes['POST /api/workflow-board/cards'](
        makeReq('POST', '/api/workflow-board/cards', {
          title: 'Ready route card',
          projectId: 'project-alpha',
          domain: 'backend',
          columnId: 'ready',
          owner: 'orchestrator',
          acceptanceCriteria: ['route orchestration works'],
          actor: 'route-test',
        }),
        readyRes,
      );
      let ready = readyRes.json();

      let orchestrateRes = makeRes();
      await routes['POST /api/workflow-board/orchestrate'](
        makeReq('POST', '/api/workflow-board/orchestrate', {
          cardId: ready.card.id,
          actor: 'route-test',
          delegate: false,
        }),
        orchestrateRes,
      );
      let orchestrated = orchestrateRes.json();
      assert.equal(orchestrateRes.status, 200);
      assert.equal(orchestrated.ok, true);
      assert.equal(orchestrated.result.run.status, 'requested');

      let boardPauseRes = makeRes();
      await routes['POST /api/workflow-board/automation'](
        makeReq('POST', '/api/workflow-board/automation', {
          boardId: 'agent-workflow-default',
          action: 'pause',
          projectId: 'project-alpha',
          actor: 'route-test',
          reason: 'Route pause all active runs',
        }),
        boardPauseRes,
      );
      let boardPause = boardPauseRes.json();

      assert.equal(boardPauseRes.status, 200);
      assert.equal(boardPause.ok, true);
      assert.equal(boardPause.result.board.mode, 'paused');
      assert.equal(boardPause.result.affectedCardIds.includes(ready.card.id), true);

      let boardControlEventsRes = makeRes();
      await routes['GET /api/workflow-board/events'](
        makeReq('GET', '/api/workflow-board/events?eventType=board_control'),
        boardControlEventsRes,
      );
      let boardControlEvents = boardControlEventsRes.json();

      assert.equal(boardControlEventsRes.status, 200);
      assert.equal(boardControlEvents.events.some(event => event.eventType === 'board_control'), true);

      let controlRes = makeRes();
      await routes['POST /api/workflow-board/control'](
        makeReq('POST', '/api/workflow-board/control', {
          cardId: ready.card.id,
          action: 'pause',
          actor: 'route-test',
        }),
        controlRes,
      );
      assert.equal(controlRes.status, 200);
      assert.equal(controlRes.json().result.card.recoveryFlags.includes('blocked'), true);

      let reconcileRes = makeRes();
      await routes['POST /api/workflow-board/recovery/reconcile'](
        makeReq('POST', '/api/workflow-board/recovery/reconcile', {
          projectId: 'project-alpha',
          actor: 'route-test',
          force: true,
        }),
        reconcileRes,
      );
      assert.equal(reconcileRes.status, 200);
      assert.equal(reconcileRes.json().ok, true);

      let exportRes = makeRes();
      await routes['POST /api/workflow-board/markdown/export'](
        makeReq('POST', '/api/workflow-board/markdown/export', {
          cardId: ready.card.id,
          projectId: 'project-alpha',
          actor: 'route-test',
        }),
        exportRes,
      );
      assert.equal(exportRes.status, 200);
      assert.equal(exportRes.json().ok, true);

      let importRes = makeRes();
      await routes['POST /api/workflow-board/markdown/import'](
        makeReq('POST', '/api/workflow-board/markdown/import', {
          projectId: 'project-alpha',
          actor: 'route-test',
        }),
        importRes,
      );
      assert.equal(importRes.status, 200);
      let imported = importRes.json();
      assert.equal(imported.count, 0);
      assert.equal(imported.skipped.some(item => item.cardId === ready.card.id), true);
      assert.equal(imported.skipped.some(item => item.cardId === 'work-item-route-seed'), true);
    } finally {
      await sg.flushChatWrites();
      sg.flush();
      if (oldMemoryRoot === undefined) delete process.env.AGENT_PORTAL_MEMORY_ROOT;
      else process.env.AGENT_PORTAL_MEMORY_ROOT = oldMemoryRoot;
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });

  it('serves the WS-C surface routes (enqueue, dependencies, board-policy authoring) as the loopback board-author', async () => {
    let oldMemoryRoot = process.env.AGENT_PORTAL_MEMORY_ROOT;
    let tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'workflow-board-routes-wsc-'));
    process.env.AGENT_PORTAL_MEMORY_ROOT = path.join(tmpDir, '.agent-portal');
    let sg = new StateGraph({
      snapshotPath: path.join(tmpDir, 'state.json'),
      walPath: path.join(tmpDir, 'state.wal'),
      chatsDir: path.join(tmpDir, 'chats'),
    });
    let seq = 0;
    let routes = createWorkflowBoardRoutes({
      stateGraph: sg,
      now: () => 3000 + (seq += 1),
      makeId: (prefix) => `${prefix}-wsc-${seq}`,
      projectRoot: tmpDir,
    });

    let call = async (key, method, url, body) => {
      let res = makeRes();
      await routes[key](makeReq(method, url, body), res);
      return res;
    };

    try {
      // Two cards for a dependency edge.
      let upRes = await call('POST /api/workflow-board/cards', 'POST', '/api/workflow-board/cards', {
        id: 'route-up', title: 'Upstream', projectId: 'project-alpha', domain: 'backend',
        columnId: 'ready', owner: 'orchestrator', acceptanceCriteria: ['Done'],
      });
      assert.equal(upRes.json().ok, true);
      let downRes = await call('POST /api/workflow-board/cards', 'POST', '/api/workflow-board/cards', {
        id: 'route-down', title: 'Downstream', projectId: 'project-alpha', domain: 'backend',
        columnId: 'backlog', owner: 'orchestrator', acceptanceCriteria: ['Done'],
      });
      assert.equal(downRes.json().ok, true);

      // link → blocked, then unlink.
      let linkRes = await call('POST /api/workflow-board/dependencies/link', 'POST', '/api/workflow-board/dependencies/link', {
        cardId: 'route-down', dependsOn: ['route-up'],
      });
      assert.equal(linkRes.status, 200);
      assert.equal(linkRes.json().result.ok, true);
      assert.equal(linkRes.json().result.lifecycle, 'blocked');

      let unlinkRes = await call('POST /api/workflow-board/dependencies/unlink', 'POST', '/api/workflow-board/dependencies/unlink', {
        cardId: 'route-down', dependsOn: ['route-up'],
      });
      assert.equal(unlinkRes.json().result.ok, true);
      assert.deepEqual(unlinkRes.json().result.dependsOn, []);

      // enqueue the ready card.
      let enqRes = await call('POST /api/workflow-board/enqueue', 'POST', '/api/workflow-board/enqueue', {
        cardId: 'route-up',
      });
      assert.equal(enqRes.status, 200);
      assert.equal(enqRes.json().result.ok, true);
      assert.equal(enqRes.json().result.lifecycle, 'queued');
      assert.ok(enqRes.json().result.admissionId);

      // Board-policy authoring: re-gate an existing forward edge (idempotent, stays valid).
      let gateRes = await call('POST /api/workflow-board/gates/define', 'POST', '/api/workflow-board/gates/define', {
        from: 'quality-audit', to: 'commit-publish', gates: ['audit_pass_or_explicit_waiver'],
      });
      assert.equal(gateRes.status, 200);
      assert.equal(gateRes.json().result.ok, true);

      // A lone new non-terminal column is rejected by the graph validator (dead-end).
      let badColRes = await call('POST /api/workflow-board/columns/define', 'POST', '/api/workflow-board/columns/define', {
        columnId: 'route-orphan', title: 'Orphan',
      });
      assert.equal(badColRes.status, 200);
      assert.equal(badColRes.json().result.ok, false);
      assert.equal(badColRes.json().result.failures[0].gate, 'invalid_board_graph');
    } finally {
      await sg.flushChatWrites();
      sg.flush();
      if (oldMemoryRoot === undefined) delete process.env.AGENT_PORTAL_MEMORY_ROOT;
      else process.env.AGENT_PORTAL_MEMORY_ROOT = oldMemoryRoot;
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });

  it('serves the Axis C collaboration routes (comment, list, reply) as the loopback human', async () => {
    let oldMemoryRoot = process.env.AGENT_PORTAL_MEMORY_ROOT;
    let tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'workflow-board-routes-axisc-'));
    process.env.AGENT_PORTAL_MEMORY_ROOT = path.join(tmpDir, '.agent-portal');
    let sg = new StateGraph({
      snapshotPath: path.join(tmpDir, 'state.json'),
      walPath: path.join(tmpDir, 'state.wal'),
      chatsDir: path.join(tmpDir, 'chats'),
    });
    let seq = 0;
    let routes = createWorkflowBoardRoutes({
      stateGraph: sg,
      now: () => 4000 + (seq += 1),
      makeId: (prefix) => `${prefix}-axisc-${seq}`,
      projectRoot: tmpDir,
    });

    let call = async (key, method, url, body) => {
      let res = makeRes();
      await routes[key](makeReq(method, url, body), res);
      return res;
    };

    try {
      let cardRes = await call('POST /api/workflow-board/cards', 'POST', '/api/workflow-board/cards', {
        id: 'route-collab', title: 'Collab card', projectId: 'project-alpha', domain: 'backend',
        columnId: 'backlog', owner: 'orchestrator', acceptanceCriteria: ['Done'],
      });
      assert.equal(cardRes.json().ok, true);

      // Post an auditable comment. Attribution is server-derived from the loopback human; the body
      // never supplies identity.
      let commentRes = await call('POST /api/workflow-board/cards/comment', 'POST', '/api/workflow-board/cards/comment', {
        cardId: 'route-collab', body: 'Looks good, one question on scope.', author: 'spoofed-should-be-ignored',
      });
      assert.equal(commentRes.status, 200);
      assert.equal(commentRes.json().ok, true);
      assert.equal(commentRes.json().comment.kind, 'comment');
      assert.equal(commentRes.json().comment.body, 'Looks good, one question on scope.');
      assert.ok(commentRes.json().comment.author, 'comment carries a server-derived author');
      assert.notEqual(commentRes.json().comment.author, 'spoofed-should-be-ignored');

      // The bounded display cache reflects the post (oldest first).
      let listRes = await call('GET /api/workflow-board/cards/comments', 'GET', '/api/workflow-board/cards/comments?cardId=route-collab');
      assert.equal(listRes.status, 200);
      assert.equal(listRes.json().ok, true);
      assert.equal(listRes.json().comments.length, 1);
      assert.equal(listRes.json().comments[0].body, 'Looks good, one question on scope.');

      // Each comment is one durable audit event in the board log.
      let eventsRes = await call('GET /api/workflow-board/events', 'GET', '/api/workflow-board/events?cardId=route-collab');
      assert.equal(eventsRes.json().events.some(event => event.eventType === 'comment'), true);

      // A human reply mints a routed return into the inbox (human→orchestrator path).
      let replyRes = await call('POST /api/workflow-board/cards/reply', 'POST', '/api/workflow-board/cards/reply', {
        cardId: 'route-collab', body: 'Proceed with the narrower scope.',
      });
      assert.equal(replyRes.status, 200);
      assert.equal(replyRes.json().ok, true);
      assert.equal(replyRes.json().comment.kind, 'reply');
      assert.ok(replyRes.json().returnEventId, 'reply produces a routed return into the inbox');

      // Unknown card is a clean 200 with ok:false, not a thrown 400.
      let missingRes = await call('GET /api/workflow-board/cards/comments', 'GET', '/api/workflow-board/cards/comments?cardId=nope');
      assert.equal(missingRes.status, 200);
      assert.equal(missingRes.json().ok, false);
      assert.equal(missingRes.json().error, 'card_not_found');
    } finally {
      await sg.flushChatWrites();
      sg.flush();
      if (oldMemoryRoot === undefined) delete process.env.AGENT_PORTAL_MEMORY_ROOT;
      else process.env.AGENT_PORTAL_MEMORY_ROOT = oldMemoryRoot;
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });
});
