import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { StateGraph } from '../../src/node/state-graph.js';
import {
  ORCHESTRATOR_META_TOOLS,
  handlePortalOrchestratorTool,
} from '../../src/node/proxy/portal-orchestrator-tools.js';

describe('portal orchestrator MCP tools', () => {
  let tmpDir;
  let sg;
  let internalCalls;
  let broadcasts;
  let proxyManager;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'portal-orchestrator-tools-'));
    sg = new StateGraph({
      snapshotPath: path.join(tmpDir, 'state.json'),
      walPath: path.join(tmpDir, 'state.wal'),
      chatsDir: path.join(tmpDir, 'chats'),
    });
    internalCalls = [];
    broadcasts = [];
    proxyManager = {
      getHealthStatus: () => ({
        'project-graph': { status: 'healthy' },
        'agent-pool': { status: 'healthy' },
      }),
      broadcastMonitor(event) {
        broadcasts.push(event);
      },
      chatWsServer: {
        taskChatMap: new Map(),
        unsubscribe(taskId) {
          this.unsubscribed = taskId;
        },
      },
      requestFromChild: async (serverName, method, params) => {
        internalCalls.push({ serverName, method, params });
        return { content: [{ type: 'text', text: `${params.name}:ok` }] };
      },
    };
  });

  afterEach(async () => {
    await sg.flushChatWrites();
    sg.flush();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('exposes Agent Portal control tools without raw Agent Pool tool names', () => {
    let names = ORCHESTRATOR_META_TOOLS.map(tool => tool.name);

    for (let name of [
      'list_chats',
      'get_chat',
      'get_chat_messages',
      'update_chat',
      'delete_chat',
      'set_chat_session',
      'cancel_chat_task',
      'finish_chat_task',
      'get_orchestrator_status',
    ]) {
      assert.ok(names.includes(name), `missing ${name}`);
    }

    for (let rawName of ['delegate_task', 'get_task_result', 'cancel_task', 'finish_task', 'list_tasks']) {
      assert.equal(names.includes(rawName), false, `must not expose raw ${rawName}`);
    }
  });

  it('lists and reads chats through Agent Portal state', async () => {
    let project = sg.addProject({ name: 'Project', path: tmpDir }, 'test');
    let chat = sg.createChat({ name: 'Main', projectId: project.id }, 'test');
    sg.appendChatMessage(chat.id, { role: 'user', text: 'First' });

    let listResult = await handlePortalOrchestratorTool(
      proxyManager,
      'list_chats',
      { projectId: project.id },
      'test',
      { stateGraph: sg },
    );
    let listed = JSON.parse(listResult.content[0].text);
    assert.deepEqual(listed.chats.map(item => item.id), [chat.id]);

    let getResult = await handlePortalOrchestratorTool(
      proxyManager,
      'get_chat',
      { chatId: chat.id, includeMessages: false },
      'test',
      { stateGraph: sg },
    );
    let loaded = JSON.parse(getResult.content[0].text);
    assert.equal(loaded.id, chat.id);
    assert.equal(loaded.messageCount, 1);
    assert.equal('messages' in loaded, false);
  });

  it('cancels pending chat tasks through the internal runtime without exposing child tools', async () => {
    let chat = sg.createChat({ name: 'Task chat' }, 'test');
    sg.updateChatTask(chat.id, 'task-123');
    proxyManager.chatWsServer.taskChatMap.set('task-123', chat.id);

    let result = await handlePortalOrchestratorTool(
      proxyManager,
      'cancel_chat_task',
      { chatId: chat.id },
      'test',
      { stateGraph: sg },
    );

    assert.equal(result.isError, undefined);
    assert.deepEqual(internalCalls, [{
      serverName: 'agent-pool',
      method: 'tools/call',
      params: {
        name: 'cancel_task',
        arguments: { task_id: 'task-123' },
      },
    }]);
    assert.equal(sg.getChat(chat.id).pendingTaskId, undefined);
    assert.equal(proxyManager.chatWsServer.taskChatMap.has('task-123'), false);
    assert.equal(proxyManager.chatWsServer.unsubscribed, 'task-123');
    assert.equal(broadcasts.some(event => event.params?.path === 'chats.updated'), true);
  });

  it('reports public MCP health separately from internal runtime health', async () => {
    let result = await handlePortalOrchestratorTool(
      proxyManager,
      'get_orchestrator_status',
      {},
      'test',
      { stateGraph: sg },
    );
    let status = JSON.parse(result.content[0].text);

    assert.deepEqual(status.publicServers, [
      { name: 'project-graph', status: 'healthy' },
    ]);
    assert.deepEqual(status.internalServers, [
      { name: 'agent-pool', status: 'healthy' },
    ]);
  });
});
