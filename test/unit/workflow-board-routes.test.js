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

describe('workflow board routes', () => {
  it('registers board, card, transition, event, and recovery handlers', async () => {
    let tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'workflow-board-routes-'));
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
    });

    try {
      for (let key of [
        'GET /api/workflow-board',
        'POST /api/workflow-board/cards',
        'POST /api/workflow-board/transition',
        'POST /api/workflow-board/orchestrate',
        'POST /api/workflow-board/control',
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
          actor: 'route-test',
        }),
        createRes,
      );
      let created = createRes.json();

      assert.equal(createRes.status, 200);
      assert.equal(created.ok, true);
      assert.equal(created.card.columnId, 'ideas');

      let boardRes = makeRes();
      await routes['GET /api/workflow-board'](
        makeReq('GET', '/api/workflow-board?projectId=project-alpha'),
        boardRes,
      );
      let board = boardRes.json();

      assert.equal(boardRes.status, 200);
      assert.equal(board.ok, true);
      assert.deepEqual(board.projection.cards.map(card => card.id), [created.card.id]);

      let transitionRes = makeRes();
      await routes['POST /api/workflow-board/transition'](
        makeReq('POST', '/api/workflow-board/transition', {
          cardId: created.card.id,
          fromColumnId: 'ideas',
          toColumnId: 'backlog',
          expectedVersion: created.card.version,
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
      assert.deepEqual(events.events.map(event => event.status), ['accepted']);

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
      assert.equal(importRes.json().count, 1);
    } finally {
      await sg.flushChatWrites();
      sg.flush();
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });
});
