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
import { TaskRouter } from '../../src/node/proxy/task-router.js';

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
      stateGraph: sg,
      getHealthStatus: () => ({
        'project-graph': { status: 'healthy' },
        'agent-pool': { status: 'healthy' },
      }),
      getMcpClientSummary: () => ({
        schemaVersion: 1,
        total: 2,
        initialized: 1,
        quiet: 0,
        lastActivityAt: 456,
        transports: { mcpWs: 2 },
        clients: [{
          id: 'mcp-1',
          transport: 'mcp-ws',
          initialized: true,
          clientName: 'codex-managed',
          lastMethod: 'tools/call',
          rootCount: 1,
          connectedAt: 123,
          lastActivityAt: 456,
        }],
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
        if (params.name === 'list_tasks') {
          return { content: [{ type: 'text', text: JSON.stringify({ tasks: [], staleProcesses: [] }) }] };
        }
        return { content: [{ type: 'text', text: `${params.name}:ok` }] };
      },
    };
    proxyManager.taskRouter = new TaskRouter(proxyManager);
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
      'get_chat_task_result',
      'get_development_map',
      'cancel_chat_task',
      'finish_chat_task',
      'get_orchestrator_status',
      'workflow_board',
    ]) {
      assert.ok(names.includes(name), `missing ${name}`);
    }

    for (let rawName of [
      'delegate_task',
      'get_task_result',
      'cancel_task',
      'finish_task',
      'list_tasks',
      'list_workflow_boards',
      'get_workflow_board',
      'request_workflow_transition',
      'claim_work_item',
      'release_work_item',
      'resume_work_item',
      'import_workflow_work_items',
      'export_workflow_work_item',
    ]) {
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

  it('lists only chats with live runtime tasks when active_only is set', async () => {
    let stale = sg.createChat({ name: 'Stale task chat' }, 'test');
    let running = sg.createChat({ name: 'Running task chat' }, 'test');
    let idle = sg.createChat({ name: 'Idle chat' }, 'test');
    sg.updateChatTask(stale.id, 'task-stale');
    sg.updateChatTask(running.id, 'task-running');
    proxyManager.requestFromChild = async (serverName, method, params) => {
      internalCalls.push({ serverName, method, params });
      if (params.name === 'list_tasks') {
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              tasks: [{ id: 'task-running', status: 'running', chatId: running.id }],
              staleProcesses: [],
            }),
          }],
        };
      }
      return { content: [{ type: 'text', text: `${params.name}:ok` }] };
    };

    let result = await handlePortalOrchestratorTool(
      proxyManager,
      'list_chats',
      { active_only: true },
      'test',
      { stateGraph: sg },
    );
    let listed = JSON.parse(result.content[0].text);

    assert.deepEqual(listed.chats.map(chat => chat.id), [running.id]);
    assert.equal(listed.chats.some(chat => chat.id === stale.id), false);
    assert.equal(listed.chats.some(chat => chat.id === idle.id), false);
  });

  it('sets chat sessions without echoing the session value to MCP callers', async () => {
    let chat = sg.createChat({ name: 'Session chat' }, 'test');

    let result = await handlePortalOrchestratorTool(
      proxyManager,
      'set_chat_session',
      { chatId: chat.id, sessionId: 'secret-session-id' },
      'test',
      { stateGraph: sg },
    );
    let payload = JSON.parse(result.content[0].text);

    assert.equal(payload.ok, true);
    assert.equal(payload.chatId, chat.id);
    assert.equal(payload.hasSession, true);
    assert.equal('sessionId' in payload, false);
    assert.equal(JSON.stringify(payload).includes('secret-session-id'), false);
    assert.equal(sg.getChat(chat.id).sessionId, 'secret-session-id');
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

  it('routes the single workflow_board MCP tool through the workflow service', async () => {
    let calls = [];
    let workflowService = {
      requestWorkflowTransition: async (args, context) => {
        calls.push({ args, context });
        return {
          ok: true,
          status: 'blocked',
          gateResult: { ok: false, failures: [{ gate: 'version_conflict' }] },
          rollbackColumnId: args.fromColumnId,
        };
      },
    };

    let result = await handlePortalOrchestratorTool(
      proxyManager,
      'workflow_board',
      {
        action: 'transition',
        boardId: 'agent-workflow-default',
        cardId: 'card-1',
        fromColumnId: 'ready',
        toColumnId: 'in-progress',
        expectedVersion: 7,
      },
      'test',
      { stateGraph: sg, workflowService },
    );
    let payload = JSON.parse(result.content[0].text);

    assert.equal(result.isError, undefined);
    assert.equal(payload.action, 'transition');
    assert.equal(payload.result.status, 'blocked');
    assert.equal(payload.result.rollbackColumnId, 'ready');
    assert.equal(payload.next.recommendedAction, 'update_item');
    assert.equal(calls[0].args.boardId, 'agent-workflow-default');
    assert.equal(calls[0].args.cardId, 'card-1');
    assert.equal(calls[0].args.expectedVersion, 7);
    assert.equal(calls[0].context.toolName, 'workflow_board');
    assert.equal(calls[0].context.action, 'transition');
  });

  it('updates pending chat task bindings for orchestrator recovery', async () => {
    let chat = sg.createChat({ name: 'Recovered task chat' }, 'test');

    let attachResult = await handlePortalOrchestratorTool(
      proxyManager,
      'update_chat',
      { chatId: chat.id, pendingTaskId: 'task-recovered' },
      'test',
      { stateGraph: sg },
    );
    assert.equal(attachResult.isError, undefined);
    assert.equal(sg.getChat(chat.id).pendingTaskId, 'task-recovered');

    let clearResult = await handlePortalOrchestratorTool(
      proxyManager,
      'update_chat',
      { chatId: chat.id, pendingTaskId: '' },
      'test',
      { stateGraph: sg },
    );
    assert.equal(clearResult.isError, undefined);
    assert.equal(sg.getChat(chat.id).pendingTaskId, undefined);
  });

  it('reads pending chat task results through the internal runtime', async () => {
    let chat = sg.createChat({ name: 'Result chat' }, 'test');
    let child = sg.createChat({ name: 'Child result chat', parentChatId: chat.id }, 'test');
    sg.updateChatSession(chat.id, 'secret-session-id');
    sg.updateChatTask(chat.id, 'task-result');
    sg.set('tasks/task-result', {
      status: 'running',
      chatId: chat.id,
      sessionId: 'secret-session-id',
      startedAt: Date.now() - 100,
      elapsedMs: 100,
      events: [{
        type: 'tool_use',
        name: 'read_file',
        arguments: { path: 'src/node/proxy/orchestration-development-map.js' },
        ts: Date.now() - 90,
      }],
    }, 'test');
    sg.set('tasks/task-child', {
      status: 'running',
      chatId: child.id,
      parentId: 'task-result',
      startedAt: Date.now() - 50,
      elapsedMs: 50,
      events: [],
    }, 'test');
    let localPath = ['', 'Users', 'example', 'private'].join('/');
    let sessionValue = ['session', 'value', '12345'].join('-');
    let tokenField = ['tok', 'en'].join('');
    let localPathPattern = new RegExp(['', 'Users', 'example'].join('/'));
    sg.appendChatMessage(chat.id, {
      role: 'agent',
      taskId: 'task-result',
      ts: 1234,
      text: `Final answer from ${localPath} with ${tokenField}=${sessionValue}.`,
      streaming: false,
    });

    let result = await handlePortalOrchestratorTool(
      proxyManager,
      'get_chat_task_result',
      { chatId: chat.id },
      'test',
      { stateGraph: sg },
    );

    assert.equal(result.isError, undefined);
    assert.deepEqual(internalCalls, [
      {
        serverName: 'agent-pool',
        method: 'tools/call',
        params: {
          name: 'get_task_result',
          arguments: { task_id: 'task-result' },
        },
      },
      {
        serverName: 'agent-pool',
        method: 'tools/call',
        params: {
          name: 'list_tasks',
          arguments: {},
        },
      },
    ]);
    let payload = JSON.parse(result.content[0].text);
    assert.equal(payload.ok, true);
    assert.equal(payload.chatId, chat.id);
    assert.equal(payload.taskId, 'task-result');
    assert.equal(payload.developmentMap.primaryTaskId, 'task-result');
    assert.equal(payload.developmentMap.schemaVersion, 1);
    assert.equal(payload.developmentMap.subagentMap.schemaVersion, 1);
    assert.equal(Array.isArray(payload.developmentMap.subagentMap.nodes), true);
    assert.equal(payload.developmentMap.subagentMap.nodes.length, 2);
    assert.equal(payload.developmentMap.subagentMap.edges[0].from, chat.id);
    assert.equal(payload.developmentMap.subagentMap.edges[0].to, child.id);
    assert.equal(payload.developmentMap.usage.subagents, 1);
    assert.equal(payload.developmentMap.usage.totalTaskElapsedMs, 150);
    assert.equal(payload.developmentMap.activityMap.schemaVersion, 1);
    assert.equal(payload.developmentMap.activityMap.nodes.length, 2);
    assert.equal(payload.developmentMap.activityMap.summary.runningTasks, 2);
    assert.equal(payload.developmentMap.activityMap.summary.totalTaskElapsedMs, 150);
    assert.equal(payload.developmentMap.activityMap.summary.liveness.coldStartTaskCount, 1);
    assert.equal(payload.developmentMap.activityMap.summary.liveness.warningTaskCount, 0);
    assert.equal(payload.developmentMap.activityMap.subagents[0].chatId, child.id);
    assert.equal(payload.developmentMap.activityMap.subagents[0].parentChatId, chat.id);
    assert.equal(payload.developmentMap.taskMap.byId['task-result'].toolCount, 1);
    assert.equal(payload.developmentMap.taskMap.byId['task-result'].liveness.state, 'active');
    assert.equal(payload.developmentMap.taskMap.byId['task-child'].liveness.state, 'cold_start');
    assert.equal(payload.developmentMap.requestedTask.found, true);
    assert.equal(payload.developmentMap.requestedTask.status, 'running');
    assert.equal(payload.developmentMap.requestedTask.terminalStatus, false);
    assert.equal(payload.developmentMap.requestedTask.resultUnavailableReason, null);
    assert.equal(payload.developmentMap.toolMap.byTaskId['task-result'].latestTool.name, 'read_file');
    assert.equal(payload.developmentMap.activityMap.latestTools[0].name, 'read_file');
    assert.equal(Array.isArray(payload.developmentMap.promptHints), true);
    assert.equal(Array.isArray(payload.developmentMap.promptHintMap.hints), true);
    assert.equal(Array.isArray(payload.developmentMap.activityMap.promptHints), true);
    assert.equal(
      payload.developmentMap.promptHintMap.hints.some((hint) => hint.tool === 'get_chat_task_result'),
      true,
    );
    assert.equal(payload.finalAgentMessage.hasText, true);
    assert.equal(payload.finalAgentMessage.source, 'chat');
    assert.equal(payload.finalAgentMessage.match, 'taskId');
    assert.equal(payload.finalAgentMessage.messageIndex, 0);
    assert.equal(Number.isFinite(payload.finalAgentMessage.ts), true);
    assert.match(payload.finalAgentMessage.text, /Final answer/);
    assert.doesNotMatch(payload.finalAgentMessage.text, localPathPattern);
    assert.doesNotMatch(payload.finalAgentMessage.text, new RegExp(sessionValue));
    assert.equal(payload.runtime.contentCount, 1);
    assert.equal('textPreview' in payload.runtime, false);
    assert.equal('taskResult' in payload, false);
    assert.equal('content' in payload, false);
    assert.equal(JSON.stringify(payload.developmentMap).includes('secret-session-id'), false);
  });

  it('reconciles completed internal task results into chat state', async () => {
    let chat = sg.createChat({ name: 'Completed result chat' }, 'test');
    sg.updateChatTask(chat.id, 'task-complete');
    sg.set('tasks/task-complete', {
      status: 'running',
      chatId: chat.id,
      startedAt: Date.now() - 1000,
      events: [],
    }, 'test');
    proxyManager.requestFromChild = async (serverName, method, params) => {
      internalCalls.push({ serverName, method, params });
      if (params.name === 'get_task_result') {
        return {
          content: [{
            type: 'text',
            text: [
              '# Task Result',
              '## Agent Response',
              'Completed from runtime.',
              '',
              '---',
              '## Stats',
              '- Exit code: 0',
            ].join('\n'),
          }, {
            type: 'text',
            text: '__RESULT_JSON__:{"toolCalls":[],"toolResults":[]}',
          }],
        };
      }
      if (params.name === 'list_tasks') {
        return { content: [{ type: 'text', text: JSON.stringify({ tasks: [], staleProcesses: [] }) }] };
      }
      return { content: [{ type: 'text', text: `${params.name}:ok` }] };
    };

    let result = await handlePortalOrchestratorTool(
      proxyManager,
      'get_chat_task_result',
      { chatId: chat.id },
      'test',
      { stateGraph: sg },
    );
    let payload = JSON.parse(result.content[0].text);

    assert.equal(sg.getChat(chat.id).pendingTaskId, undefined);
    assert.equal(payload.finalAgentMessage.hasText, true);
    assert.equal(payload.finalAgentMessage.match, 'taskId');
    assert.equal(payload.finalAgentMessage.text, 'Completed from runtime.');
    assert.equal(sg.getChat(chat.id).lastTaskStatus, 'done');
    assert.equal(sg.get('tasks/task-complete').status, 'done');
    assert.equal(payload.developmentMap.usage.runningTasks, 0);
    assert.equal(payload.developmentMap.taskMap.byId['task-complete'].status, 'done');
    assert.equal(payload.developmentMap.taskMap.terminalIds.includes('task-complete'), true);
    assert.equal(payload.developmentMap.requestedTask.found, true);
    assert.equal(payload.developmentMap.requestedTask.id, 'task-complete');
    assert.equal(payload.developmentMap.requestedTask.status, 'done');
    assert.equal(payload.developmentMap.requestedTask.terminalStatus, true);
    assert.equal(payload.developmentMap.requestedTask.resultUnavailableReason, 'task_terminal');
  });

  it('replaces short task placeholders with completed runtime results', async () => {
    let chat = sg.createChat({ name: 'Placeholder result chat' }, 'test');
    sg.updateChatTask(chat.id, 'task-placeholder');
    sg.set('tasks/task-placeholder', {
      status: 'running',
      chatId: chat.id,
      startedAt: Date.now() - 1000,
      events: [],
    }, 'test');
    sg.appendChatMessage(chat.id, {
      role: 'agent',
      taskId: 'task-placeholder',
      text: 'I now have a complete picture. Here is my audit report.',
      streaming: false,
    });
    proxyManager.requestFromChild = async (serverName, method, params) => {
      internalCalls.push({ serverName, method, params });
      if (params.name === 'get_task_result') {
        return {
          content: [{
            type: 'text',
            text: [
              '# Task Result',
              '## Agent Response',
              'Detailed audit body with actionable findings.',
              '',
              '---',
              '## Stats',
              '- Exit code: 0',
            ].join('\n'),
          }, {
            type: 'text',
            text: '__RESULT_JSON__:{"toolCalls":[],"toolResults":[]}',
          }],
        };
      }
      if (params.name === 'list_tasks') {
        return { content: [{ type: 'text', text: JSON.stringify({ tasks: [], staleProcesses: [] }) }] };
      }
      return { content: [{ type: 'text', text: `${params.name}:ok` }] };
    };

    let result = await handlePortalOrchestratorTool(
      proxyManager,
      'get_chat_task_result',
      { chatId: chat.id },
      'test',
      { stateGraph: sg },
    );
    let payload = JSON.parse(result.content[0].text);
    let messages = sg.getChat(chat.id).messages.filter(message => message.role === 'agent');

    assert.equal(payload.finalAgentMessage.text, 'Detailed audit body with actionable findings.');
    assert.equal(messages.length, 1);
    assert.equal(messages[0].text, 'Detailed audit body with actionable findings.');
    assert.equal(sg.getChat(chat.id).lastTaskStatus, 'done');
    assert.equal(sg.get('tasks/task-placeholder').status, 'done');
  });

  it('flags generic final text when runtime activity shows real work happened', async () => {
    let chat = sg.createChat({ name: 'Generic final result chat' }, 'test');
    sg.updateChatTask(chat.id, 'task-generic-final');
    sg.set('tasks/task-generic-final', {
      status: 'running',
      chatId: chat.id,
      startedAt: Date.now() - 1000,
      events: [],
    }, 'test');
    proxyManager.requestFromChild = async (serverName, method, params) => {
      internalCalls.push({ serverName, method, params });
      if (params.name === 'get_task_result') {
        return {
          content: [{
            type: 'text',
            text: [
              '# Task Result',
              '## Agent Response',
              'Done.',
              '',
              '---',
              '## Tools Used (1)',
              '',
              '- **Read**',
              '',
              '---',
              '## Stats',
              '- Exit code: 0',
            ].join('\n'),
          }, {
            type: 'text',
            text: `__RESULT_JSON__:${JSON.stringify({
              response: 'Done.',
              exitCode: 0,
              totalEvents: 27,
              toolCalls: [{ name: 'Read', args: { file_path: 'checklist.md' } }],
              toolResults: [{ status: 'ok' }],
            })}`,
          }],
        };
      }
      if (params.name === 'list_tasks') {
        return { content: [{ type: 'text', text: JSON.stringify({ tasks: [], staleProcesses: [] }) }] };
      }
      return { content: [{ type: 'text', text: `${params.name}:ok` }] };
    };

    let result = await handlePortalOrchestratorTool(
      proxyManager,
      'get_chat_task_result',
      { chatId: chat.id },
      'test',
      { stateGraph: sg },
    );
    let payload = JSON.parse(result.content[0].text);

    assert.equal(payload.finalAgentMessage.hasText, true);
    assert.equal(payload.finalAgentMessage.text, 'Done.');
    assert.equal(payload.finalAgentMessage.quality.state, 'weak-generic');
    assert.equal(payload.finalAgentMessage.quality.reason, 'generic-final-with-runtime-activity');
    assert.equal(payload.finalAgentMessage.quality.toolCallCount, 1);
    assert.equal(payload.finalAgentMessage.quality.totalEvents, 27);
  });

  it('flags missing required completion proof final marker', async () => {
    let chat = sg.createChat({ name: 'Missing proof marker result chat' }, 'test');
    sg.updateChatTask(chat.id, 'task-missing-proof');
    sg.set('tasks/task-missing-proof', {
      status: 'running',
      chatId: chat.id,
      prompt: 'Finish the audit and end with COMPLETION_PROOF:*',
      startedAt: Date.now() - 1000,
      events: [],
    }, 'test');
    proxyManager.requestFromChild = async (serverName, method, params) => {
      internalCalls.push({ serverName, method, params });
      if (params.name === 'get_task_result') {
        return {
          content: [{
            type: 'text',
            text: [
              '# Task Result',
              '## Agent Response',
              'All requirements are covered.',
            ].join('\n'),
          }, {
            type: 'text',
            text: `__RESULT_JSON__:${JSON.stringify({
              response: 'All requirements are covered.',
              exitCode: 0,
              totalEvents: 9,
              toolCalls: [{ name: 'Read', args: { file_path: 'checklist.md' } }],
              toolResults: [{ status: 'ok' }],
            })}`,
          }],
        };
      }
      if (params.name === 'list_tasks') {
        return { content: [{ type: 'text', text: JSON.stringify({ tasks: [], staleProcesses: [] }) }] };
      }
      return { content: [{ type: 'text', text: `${params.name}:ok` }] };
    };

    let result = await handlePortalOrchestratorTool(
      proxyManager,
      'get_chat_task_result',
      { chatId: chat.id },
      'test',
      { stateGraph: sg },
    );
    let payload = JSON.parse(result.content[0].text);

    assert.equal(payload.finalAgentMessage.quality.state, 'weak-missing-marker');
    assert.equal(payload.finalAgentMessage.quality.reason, 'completion-proof-marker-missing');
    assert.equal(payload.finalAgentMessage.quality.requiredMarker, 'COMPLETION_PROOF');
  });

  it('flags required completion proof marker that is not the final line', async () => {
    let chat = sg.createChat({ name: 'Non-final proof marker result chat' }, 'test');
    sg.updateChatTask(chat.id, 'task-non-final-proof');
    sg.set('tasks/task-non-final-proof', {
      status: 'done',
      chatId: chat.id,
      prompt: 'Finish the audit and end with COMPLETION_PROOF:*',
    }, 'test');
    sg.appendChatMessage(chat.id, {
      role: 'agent',
      taskId: 'task-non-final-proof',
      text: [
        'All requirements are covered.',
        'COMPLETION_PROOF:PASS',
        'Extra trailing explanation.',
      ].join('\n'),
      streaming: false,
    });
    proxyManager.requestFromChild = async (serverName, method, params) => {
      internalCalls.push({ serverName, method, params });
      if (params.name === 'get_task_result') {
        return { isError: true, content: [{ type: 'text', text: 'runtime result unavailable' }] };
      }
      if (params.name === 'list_tasks') {
        return { content: [{ type: 'text', text: JSON.stringify({ tasks: [], staleProcesses: [] }) }] };
      }
      return { content: [{ type: 'text', text: `${params.name}:ok` }] };
    };

    let result = await handlePortalOrchestratorTool(
      proxyManager,
      'get_chat_task_result',
      { chatId: chat.id, taskId: 'task-non-final-proof' },
      'test',
      { stateGraph: sg },
    );
    let payload = JSON.parse(result.content[0].text);

    assert.equal(payload.finalAgentMessage.quality.state, 'weak-missing-marker');
    assert.equal(payload.finalAgentMessage.quality.reason, 'completion-proof-marker-not-final');
    assert.equal(payload.finalAgentMessage.quality.markerLine, 'COMPLETION_PROOF:PASS');
    assert.equal(payload.finalAgentMessage.lastLine, 'Extra trailing explanation.');
  });

  it('flags completion proof pass when the latest TodoWrite still has incomplete items', async () => {
    let chat = sg.createChat({ name: 'Todo inconsistent proof result chat' }, 'test');
    sg.updateChatTask(chat.id, 'task-todo-inconsistent');
    sg.set('tasks/task-todo-inconsistent', {
      status: 'running',
      chatId: chat.id,
      prompt: 'Finish the audit and end with COMPLETION_PROOF:*',
      startedAt: Date.now() - 1000,
      events: [],
    }, 'test');
    let response = [
      'All requirements are covered.',
      '',
      'COMPLETION_PROOF:PASS',
    ].join('\n');
    proxyManager.requestFromChild = async (serverName, method, params) => {
      internalCalls.push({ serverName, method, params });
      if (params.name === 'get_task_result') {
        return {
          content: [{
            type: 'text',
            text: [
              '# Task Result',
              '## Agent Response',
              response,
            ].join('\n'),
          }, {
            type: 'text',
            text: `__RESULT_JSON__:${JSON.stringify({
              response,
              exitCode: 0,
              totalEvents: 11,
              toolCalls: [{
                name: 'TodoWrite',
                arguments: {
                  todos: [
                    { content: 'Verify files', status: 'completed' },
                    { content: 'Produce final proof', status: 'in_progress' },
                  ],
                },
              }],
              toolResults: [{ status: 'ok' }],
            })}`,
          }],
        };
      }
      if (params.name === 'list_tasks') {
        return { content: [{ type: 'text', text: JSON.stringify({ tasks: [], staleProcesses: [] }) }] };
      }
      return { content: [{ type: 'text', text: `${params.name}:ok` }] };
    };

    let result = await handlePortalOrchestratorTool(
      proxyManager,
      'get_chat_task_result',
      { chatId: chat.id },
      'test',
      { stateGraph: sg },
    );
    let payload = JSON.parse(result.content[0].text);

    assert.equal(payload.finalAgentMessage.quality.state, 'weak-todo-inconsistent');
    assert.equal(payload.finalAgentMessage.quality.reason, 'completion-proof-pass-with-incomplete-todos');
    assert.equal(payload.finalAgentMessage.quality.incompleteTodoCount, 1);
    assert.deepEqual(payload.finalAgentMessage.quality.incompleteTodoStatuses, ['in_progress']);
  });

  it('flags intro-only final text when runtime activity shows real work happened', async () => {
    let chat = sg.createChat({ name: 'Intro-only final result chat' }, 'test');
    sg.updateChatTask(chat.id, 'task-intro-only-final');
    sg.set('tasks/task-intro-only-final', {
      status: 'running',
      chatId: chat.id,
      startedAt: Date.now() - 1000,
      events: [],
    }, 'test');
    proxyManager.requestFromChild = async (serverName, method, params) => {
      internalCalls.push({ serverName, method, params });
      if (params.name === 'get_task_result') {
        return {
          content: [{
            type: 'text',
            text: [
              '# Task Result',
              '## Agent Response',
              'Now I have all the evidence. Here is the completion-gap audit.',
              '',
              '---',
              '## Tools Used (2)',
              '',
              '- **Read**',
              '- **Bash**',
              '',
              '---',
              '## Stats',
              '- Exit code: 0',
            ].join('\n'),
          }, {
            type: 'text',
            text: `__RESULT_JSON__:${JSON.stringify({
              response: 'Now I have all the evidence. Here is the completion-gap audit.',
              exitCode: 0,
              totalEvents: 31,
              toolCalls: [
                { name: 'Read', args: { file_path: 'checklist.md' } },
                { name: 'Bash', args: { command: 'npm test' } },
              ],
              toolResults: [{ status: 'ok' }, { status: 'ok' }],
            })}`,
          }],
        };
      }
      if (params.name === 'list_tasks') {
        return { content: [{ type: 'text', text: JSON.stringify({ tasks: [], staleProcesses: [] }) }] };
      }
      return { content: [{ type: 'text', text: `${params.name}:ok` }] };
    };

    let result = await handlePortalOrchestratorTool(
      proxyManager,
      'get_chat_task_result',
      { chatId: chat.id },
      'test',
      { stateGraph: sg },
    );
    let payload = JSON.parse(result.content[0].text);

    assert.equal(payload.finalAgentMessage.hasText, true);
    assert.equal(payload.finalAgentMessage.text, 'Now I have all the evidence. Here is the completion-gap audit.');
    assert.equal(payload.finalAgentMessage.quality.state, 'weak-intro-only');
    assert.equal(payload.finalAgentMessage.quality.reason, 'intro-only-final-with-runtime-activity');
    assert.equal(payload.finalAgentMessage.quality.toolCallCount, 2);
    assert.equal(payload.finalAgentMessage.quality.totalEvents, 31);
  });

  it('flags intro-only final audit text even when runtime result is unavailable', async () => {
    let chat = sg.createChat({ name: 'Intro-only unavailable result chat' }, 'test');
    sg.updateChatTask(chat.id, 'task-intro-unavailable');
    sg.set('tasks/task-intro-unavailable', {
      status: 'done',
      chatId: chat.id,
    }, 'test');
    sg.appendChatMessage(chat.id, {
      role: 'agent',
      text: 'Here is the requirement-by-requirement completion-proof audit for the 24h Public Runtime Package Construction cycle.',
      taskId: 'task-intro-unavailable',
      streaming: false,
    });
    proxyManager.requestFromChild = async (serverName, method, params) => {
      internalCalls.push({ serverName, method, params });
      if (params.name === 'get_task_result') {
        return { isError: true, content: [{ type: 'text', text: 'runtime result unavailable' }] };
      }
      if (params.name === 'list_tasks') {
        return { content: [{ type: 'text', text: JSON.stringify({ tasks: [], staleProcesses: [] }) }] };
      }
      return { content: [{ type: 'text', text: `${params.name}:ok` }] };
    };

    let result = await handlePortalOrchestratorTool(
      proxyManager,
      'get_chat_task_result',
      { chatId: chat.id, taskId: 'task-intro-unavailable' },
      'test',
      { stateGraph: sg },
    );
    let payload = JSON.parse(result.content[0].text);

    assert.equal(payload.ok, true);
    assert.equal(payload.runtime.isError, true);
    assert.equal(payload.finalAgentMessage.hasText, true);
    assert.equal(payload.finalAgentMessage.quality.state, 'weak-intro-only');
    assert.equal(payload.finalAgentMessage.quality.reason, 'intro-only-final');
    assert.equal(payload.finalAgentMessage.quality.toolCallCount, 0);
    assert.equal(payload.finalAgentMessage.quality.totalEvents, 0);
  });

  it('flags compile-the-audit preface as intro-only when runtime activity exists', async () => {
    let chat = sg.createChat({ name: 'Compile preface result chat' }, 'test');
    sg.updateChatTask(chat.id, 'task-compile-preface');
    sg.set('tasks/task-compile-preface', {
      status: 'done',
      chatId: chat.id,
    }, 'test');
    sg.appendChatMessage(chat.id, {
      role: 'agent',
      text: 'Now I have all the evidence. Let me compile the completion-proof audit.',
      taskId: 'task-compile-preface',
      streaming: false,
    });
    proxyManager.requestFromChild = async (serverName, method, params) => {
      internalCalls.push({ serverName, method, params });
      if (params.name === 'get_task_result') {
        let response = 'Now I have all the evidence. Let me compile the completion-proof audit.';
        return {
          content: [
            { type: 'text', text: response },
            {
              type: 'text',
              text: `__RESULT_JSON__:${JSON.stringify({
                response,
                exitCode: 0,
                totalEvents: 22,
                toolCalls: [
                  { name: 'Read', args: { file_path: 'checklist.md' } },
                  { name: 'Bash', args: { command: 'npm pack --dry-run' } },
                ],
                toolResults: [],
              })}`,
            },
          ],
        };
      }
      if (params.name === 'list_tasks') {
        return { content: [{ type: 'text', text: JSON.stringify({ tasks: [], staleProcesses: [] }) }] };
      }
      return { content: [{ type: 'text', text: `${params.name}:ok` }] };
    };

    let result = await handlePortalOrchestratorTool(
      proxyManager,
      'get_chat_task_result',
      { chatId: chat.id, taskId: 'task-compile-preface' },
      'test',
      { stateGraph: sg },
    );
    let payload = JSON.parse(result.content[0].text);

    assert.equal(payload.finalAgentMessage.hasText, true);
    assert.equal(payload.finalAgentMessage.quality.state, 'weak-intro-only');
    assert.equal(payload.finalAgentMessage.quality.reason, 'intro-only-final-with-runtime-activity');
    assert.equal(payload.finalAgentMessage.quality.toolCallCount, 2);
    assert.equal(payload.finalAgentMessage.quality.totalEvents, 22);
  });

  it('flags progress-log final text when terminal tasks still describe pending work', async () => {
    let chat = sg.createChat({ name: 'Progress log result chat' }, 'test');
    sg.updateChatTask(chat.id, 'task-progress-log');
    sg.set('tasks/task-progress-log', {
      status: 'done',
      chatId: chat.id,
    }, 'test');
    let response = [
      'I\u2019ll keep this as a read-only orchestration pass.',
      'The context/checklist confirm this is still a 0.3.0-alpha.2 package.',
      'The evidence scan is slower than expected. I\u2019m giving it one more interval.',
      'That rg process is still not yielding output after a minute, so I\u2019m stopping that scan.',
      'The targeted tests passed. Two rg probes are still slow/hung; ' +
      'I\u2019ll stop them if they do not return promptly.',
    ].join('\n');
    sg.appendChatMessage(chat.id, {
      role: 'agent',
      text: response,
      taskId: 'task-progress-log',
      streaming: false,
    });
    proxyManager.requestFromChild = async (serverName, method, params) => {
      internalCalls.push({ serverName, method, params });
      if (params.name === 'get_task_result') {
        return {
          content: [
            { type: 'text', text: response },
            {
              type: 'text',
              text: `__RESULT_JSON__:${JSON.stringify({
                response,
                exitCode: 0,
                totalEvents: 44,
                toolCalls: [
                  { name: 'Read', args: { file_path: 'checklist.md' } },
                  { name: 'Bash', args: { command: 'node --test' } },
                ],
                toolResults: [],
              })}`,
            },
          ],
        };
      }
      if (params.name === 'list_tasks') {
        return { content: [{ type: 'text', text: JSON.stringify({ tasks: [], staleProcesses: [] }) }] };
      }
      return { content: [{ type: 'text', text: `${params.name}:ok` }] };
    };

    let result = await handlePortalOrchestratorTool(
      proxyManager,
      'get_chat_task_result',
      { chatId: chat.id, taskId: 'task-progress-log' },
      'test',
      { stateGraph: sg },
    );
    let payload = JSON.parse(result.content[0].text);

    assert.equal(payload.finalAnswerReady, false);
    assert.equal(payload.finalAgentMessage.hasText, true);
    assert.equal(payload.finalAgentMessage.quality.state, 'weak-progress-log');
    assert.equal(payload.finalAgentMessage.quality.reason, 'progress-log-final-with-runtime-activity');
    assert.equal(payload.finalAgentMessage.quality.toolCallCount, 2);
    assert.equal(payload.finalAgentMessage.quality.totalEvents, 44);
    assert.equal(
      payload.developmentMap.promptHintMap.hints.some((hint) => hint.id === 'repair-final-answer'),
      true,
    );
    assert.equal(
      payload.developmentMap.promptHintMap.hints.some((hint) => hint.id === 'close-stage'),
      false,
    );
    assert.equal(payload.developmentMap.promptHintMap.hints[0].priority, 'high');
  });

  it('flags heading-only final audit text when runtime activity shows real work happened', async () => {
    let chat = sg.createChat({ name: 'Heading-only result chat' }, 'test');
    sg.updateChatTask(chat.id, 'task-heading');
    sg.set('tasks/task-heading', {
      status: 'done',
      chatId: chat.id,
    }, 'test');
    sg.appendChatMessage(chat.id, {
      role: 'agent',
      text: [
        '## Final Closure Audit -- 24h Public Runtime Package Construction Cycle',
        '',
        '**Scope:** Parent branch `main`, HEAD `abc123`.',
      ].join('\n'),
      taskId: 'task-heading',
      streaming: false,
    });
    proxyManager.requestFromChild = async (serverName, method, params) => {
      internalCalls.push({ serverName, method, params });
      if (params.name === 'get_task_result') {
        let response = [
          '## Final Closure Audit -- 24h Public Runtime Package Construction Cycle',
          '',
          '**Scope:** Parent branch `main`, HEAD `abc123`.',
        ].join('\n');
        return {
          content: [
            {
              type: 'text',
              text: response,
            },
            {
              type: 'text',
              text: `__RESULT_JSON__:${JSON.stringify({
                response,
                exitCode: 0,
                totalEvents: 7,
                toolCalls: [
                  { name: 'Read', args: { file_path: 'checklist.md' } },
                  { name: 'Bash', args: { command: 'git status --short' } },
                ],
                toolResults: [{ status: 'ok' }, { status: 'ok' }],
              })}`,
            },
          ],
        };
      }
      if (params.name === 'list_tasks') {
        return { content: [{ type: 'text', text: JSON.stringify({ tasks: [], staleProcesses: [] }) }] };
      }
      return { content: [{ type: 'text', text: `${params.name}:ok` }] };
    };

    let result = await handlePortalOrchestratorTool(
      proxyManager,
      'get_chat_task_result',
      { chatId: chat.id },
      'test',
      { stateGraph: sg },
    );
    let payload = JSON.parse(result.content[0].text);

    assert.equal(payload.finalAgentMessage.hasText, true);
    assert.equal(payload.finalAgentMessage.quality.state, 'weak-heading-only');
    assert.equal(payload.finalAgentMessage.quality.reason, 'heading-only-final');
  });

  it('uses ExitPlanMode content when plan-mode final agent text only references the plan', async () => {
    let chat = sg.createChat({ name: 'Plan mode result chat' }, 'test');
    sg.updateChatTask(chat.id, 'task-plan');
    sg.set('tasks/task-plan', {
      status: 'done',
      chatId: chat.id,
    }, 'test');
    let localPath = ['', 'Users', 'example', 'private', 'plan.md'].join('/');
    let sessionValue = ['session', 'value', 'plan'].join('-');
    let localPathPattern = new RegExp(['', 'Users', 'example'].join('/'));
    sg.appendChatMessage(chat.id, {
      role: 'tool',
      name: 'ExitPlanMode',
      taskId: 'task-plan',
      input: {
        plan: `# Plan\n\nApply the projection fix from ${localPath} with session_id=${sessionValue}. ${'x'.repeat(5000)}`,
      },
      streaming: false,
    });
    sg.appendChatMessage(chat.id, {
      role: 'agent',
      text: 'The plan is presented above. Ready to apply when confirmed.',
      taskId: 'task-plan',
      streaming: false,
    });

    let result = await handlePortalOrchestratorTool(
      proxyManager,
      'get_chat_task_result',
      { chatId: chat.id, taskId: 'task-plan' },
      'test',
      { stateGraph: sg },
    );
    let payload = JSON.parse(result.content[0].text);

    assert.equal(payload.finalAgentMessage.hasText, true);
    assert.equal(payload.finalAgentMessage.source, 'chat');
    assert.equal(payload.finalAgentMessage.match, 'taskId-exit-plan');
    assert.equal(payload.finalAgentMessage.quality.state, 'weak-exit-plan');
    assert.equal(payload.finalAgentMessage.quality.reason, 'exit-plan-mode-final');
    assert.equal(payload.finalAgentMessage.truncated, true);
    assert.equal(payload.finalAgentMessage.text.length <= 4000, true);
    assert.match(payload.finalAgentMessage.text, /Apply the projection fix/);
    assert.doesNotMatch(payload.finalAgentMessage.text, /presented above/);
    assert.doesNotMatch(payload.finalAgentMessage.text, localPathPattern);
    assert.doesNotMatch(payload.finalAgentMessage.text, new RegExp(sessionValue));
  });

  it('prefers task-scoped ordinary final with proof marker over ExitPlanMode when both exist', async () => {
    let chat = sg.createChat({ name: 'Ordinary final outranks ExitPlan chat' }, 'test');
    sg.updateChatTask(chat.id, 'task-ordinary-outranks');
    sg.set('tasks/task-ordinary-outranks', {
      status: 'running',
      chatId: chat.id,
      prompt: 'Finish and end with COMPLETION_PROOF:*',
      startedAt: Date.now() - 1000,
      events: [],
    }, 'test');
    let ordinaryText = [
      'Findings are ready.',
      '',
      '1. Defect D1 fixed.',
      '2. Tests added.',
      '',
      'COMPLETION_PROOF:PASS',
    ].join('\n');
    sg.appendChatMessage(chat.id, {
      role: 'tool',
      name: 'ExitPlanMode',
      taskId: 'task-ordinary-outranks',
      input: { plan: 'ExitPlan: apply projection fix.' },
      streaming: false,
    });
    sg.appendChatMessage(chat.id, {
      role: 'agent',
      text: ordinaryText,
      taskId: 'task-ordinary-outranks',
      streaming: false,
    });
    proxyManager.requestFromChild = async (serverName, method, params) => {
      internalCalls.push({ serverName, method, params });
      if (params.name === 'get_task_result') {
        return {
          content: [{
            type: 'text',
            text: ordinaryText,
          }, {
            type: 'text',
            text: `__RESULT_JSON__:${JSON.stringify({
              response: ordinaryText,
              exitCode: 0,
              totalEvents: 20,
              toolCalls: [
                { name: 'TodoWrite', arguments: { todos: [{ content: 'Fix D1', status: 'completed' }] } },
              ],
            })}`,
          }],
        };
      }
      if (params.name === 'list_tasks') {
        return { content: [{ type: 'text', text: JSON.stringify({ tasks: [], staleProcesses: [] }) }] };
      }
      return { content: [{ type: 'text', text: `${params.name}:ok` }] };
    };

    let result = await handlePortalOrchestratorTool(
      proxyManager,
      'get_chat_task_result',
      { chatId: chat.id },
      'test',
      { stateGraph: sg },
    );
    let payload = JSON.parse(result.content[0].text);

    assert.equal(payload.finalAnswerReady, true);
    assert.equal(payload.finalAgentMessage.hasText, true);
    assert.equal(payload.finalAgentMessage.match, 'taskId');
    assert.equal(payload.finalAgentMessage.quality.state, 'ok');
    assert.match(payload.finalAgentMessage.text, /Findings are ready/);
    assert.match(payload.finalAgentMessage.tail, /COMPLETION_PROOF:PASS/);
  });

  it('does not reconcile internal task results while still running', async () => {
    let chat = sg.createChat({ name: 'Running result chat' }, 'test');
    sg.updateChatTask(chat.id, 'task-running');
    sg.set('tasks/task-running', {
      status: 'running',
      chatId: chat.id,
      events: [],
    }, 'test');
    proxyManager.requestFromChild = async (serverName, method, params) => {
      internalCalls.push({ serverName, method, params });
      if (params.name === 'get_task_result') {
        return { content: [{ type: 'text', text: '[RUN] Task is still running.' }] };
      }
      if (params.name === 'list_tasks') {
        return { content: [{ type: 'text', text: JSON.stringify({ tasks: [], staleProcesses: [] }) }] };
      }
      return { content: [{ type: 'text', text: `${params.name}:ok` }] };
    };

    let result = await handlePortalOrchestratorTool(
      proxyManager,
      'get_chat_task_result',
      { chatId: chat.id },
      'test',
      { stateGraph: sg },
    );
    let payload = JSON.parse(result.content[0].text);

    assert.equal(sg.getChat(chat.id).pendingTaskId, 'task-running');
    assert.equal(payload.finalAgentMessage.hasText, false);
  });

  it('does not use a stale chat agent message for another running task', async () => {
    let chat = sg.createChat({ name: 'Stale running result chat' }, 'test');
    sg.updateChatTask(chat.id, 'task-old');
    sg.appendChatMessage(chat.id, {
      role: 'agent',
      text: 'Old task final answer.',
      taskId: 'task-old',
      streaming: false,
    });
    sg.updateChatTask(chat.id, 'task-running');
    sg.set('tasks/task-running', {
      status: 'running',
      chatId: chat.id,
      events: [],
    }, 'test');
    proxyManager.requestFromChild = async (serverName, method, params) => {
      internalCalls.push({ serverName, method, params });
      if (params.name === 'get_task_result') {
        return { content: [{ type: 'text', text: '[RUN] Task is still running.' }] };
      }
      if (params.name === 'list_tasks') {
        return { content: [{ type: 'text', text: JSON.stringify({ tasks: [], staleProcesses: [] }) }] };
      }
      return { content: [{ type: 'text', text: `${params.name}:ok` }] };
    };

    let result = await handlePortalOrchestratorTool(
      proxyManager,
      'get_chat_task_result',
      { chatId: chat.id, taskId: 'task-running' },
      'test',
      { stateGraph: sg },
    );
    let payload = JSON.parse(result.content[0].text);

    assert.equal(payload.finalAgentMessage.hasText, false);
    assert.equal(payload.finalAgentMessage.match, null);
    assert.equal(payload.finalAgentMessage.taskId, 'task-running');
  });

  it('does not clear a newer pending task when reconciling an older task result', async () => {
    let chat = sg.createChat({ name: 'Restarted result chat' }, 'test');
    sg.updateChatTask(chat.id, 'task-old');
    sg.updateChatTask(chat.id, 'task-new');
    sg.set('tasks/task-old', {
      status: 'running',
      chatId: chat.id,
      events: [],
    }, 'test');
    proxyManager.requestFromChild = async (serverName, method, params) => {
      internalCalls.push({ serverName, method, params });
      if (params.name === 'get_task_result') {
        return {
          content: [{
            type: 'text',
            text: [
              '# Task Result',
              '## Agent Response',
              'Old completion.',
              '',
              '---',
              '## Stats',
              '- Exit code: 0',
            ].join('\n'),
          }],
        };
      }
      if (params.name === 'list_tasks') {
        return { content: [{ type: 'text', text: JSON.stringify({ tasks: [], staleProcesses: [] }) }] };
      }
      return { content: [{ type: 'text', text: `${params.name}:ok` }] };
    };

    let result = await handlePortalOrchestratorTool(
      proxyManager,
      'get_chat_task_result',
      { chatId: chat.id, taskId: 'task-old' },
      'test',
      { stateGraph: sg },
    );
    let payload = JSON.parse(result.content[0].text);

    assert.equal(sg.getChat(chat.id).pendingTaskId, 'task-new');
    assert.equal(payload.finalAgentMessage.hasText, false);
  });

  it('returns an explicit development map without exposing raw Agent Pool tools', async () => {
    let root = sg.createChat({ name: 'Root orchestration', agent: 'orchestrator' }, 'test');
    let child = sg.createChat({
      name: 'Child chain',
      parentChatId: root.id,
      agent: 'backend-engineer',
      resource_group: 'implementation',
    }, 'test');
    sg.updateChatTask(root.id, 'task-root');
    sg.updateChatTask(child.id, 'task-child');
    proxyManager.requestFromChild = async (serverName, method, params) => {
      internalCalls.push({ serverName, method, params });
      if (params.name === 'list_tasks') {
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              tasks: [{
                id: 'task-root',
                chatId: root.id,
                status: 'running',
                agentSlug: 'orchestrator',
                resourceGroup: 'reasoning-heavy',
                elapsedMs: 1200,
                events: [{
                  type: 'tool_use',
                  tool_id: 'tool-shell',
                  name: 'shell',
                  arguments: { command: 'node --test', token: 'secret-session-id' },
                  ts: 1000,
                }, {
                  type: 'tool_result',
                  tool_id: 'tool-shell',
                  status: 'success',
                  output: 'ok secret-session-id',
                  ts: 1250,
                }],
              }, {
                id: 'task-child',
                chatId: child.id,
                parentId: 'task-root',
                status: 'running',
                agentSlug: 'backend-engineer',
                resourceGroup: 'implementation',
                elapsedMs: 800,
                events: [],
              }],
              staleProcesses: [],
            }),
          }],
        };
      }
      return {
        content: [{
          type: 'text',
          text: `__EVENTS__:${JSON.stringify([{
            type: 'tool_use',
            tool_id: 'runtime-tool',
            tool_name: 'mcp_project_graph_get_skeleton',
            parameters: { query: 'secret-session-id' },
            timestamp: 1300,
          }, {
            type: 'tool_result',
            tool_id: 'runtime-tool',
            status: 'success',
            timestamp: 1500,
          }])}`,
        }],
      };
    };

    let result = await handlePortalOrchestratorTool(
      proxyManager,
      'get_development_map',
      { chatId: root.id, taskId: 'task-root' },
      'test',
      { stateGraph: sg },
    );
    let payload = JSON.parse(result.content[0].text);

    assert.equal(result.isError, undefined);
    assert.equal(payload.ok, true);
    assert.equal(payload.chatId, root.id);
    assert.equal(payload.taskId, 'task-root');
    assert.equal(payload.runtimeIncluded, false);
    assert.deepEqual(internalCalls.map(call => call.params.name), ['list_tasks']);
    assert.equal(payload.developmentMap.schemaVersion, 1);
    assert.equal(payload.developmentMap.subagents[0].chatId, child.id);
    assert.equal(payload.developmentMap.subagentMap.tree[0].children[0].chatId, child.id);
    assert.equal(payload.developmentMap.activityMap.subagents[0].chatId, child.id);
    assert.equal(payload.developmentMap.latestTools[0].name, 'shell');
    assert.equal(payload.developmentMap.latestTools[0].usageMs, 250);
    assert.equal(payload.developmentMap.latestTools[0].timingSource, 'tool_result');
    assert.equal(payload.developmentMap.requestedTask.found, true);
    assert.equal(payload.developmentMap.requestedTask.id, 'task-root');
    assert.equal(payload.developmentMap.requestedTask.status, 'running');
    assert.equal(payload.developmentMap.toolMap.byChatId[root.id].latestTool.name, 'shell');
    assert.equal(payload.developmentMap.promptHintMap.hints.some((hint) => hint.tool === 'resume_chat'), true);
    assert.equal(payload.developmentMap.activityMap.promptHints.some((hint) => hint.tool === 'create_chat'), true);
    assert.equal(JSON.stringify(payload).includes('secret-session-id'), false);

    internalCalls = [];
    let runtimeResult = await handlePortalOrchestratorTool(
      proxyManager,
      'get_development_map',
      { chatId: root.id, taskId: 'task-root', includeTaskResult: true },
      'test',
      { stateGraph: sg },
    );
    let runtimePayload = JSON.parse(runtimeResult.content[0].text);

    assert.equal(runtimePayload.runtimeIncluded, true);
    assert.deepEqual(internalCalls.map(call => call.params.name), ['list_tasks', 'get_task_result']);
    assert.equal(runtimePayload.developmentMap.latestTools[0].name, 'mcp_project_graph_get_skeleton');
    assert.equal(runtimePayload.developmentMap.latestTools[0].usageMs, 200);
    assert.equal(runtimePayload.developmentMap.runtime.eventCount, 2);
    assert.equal(JSON.stringify(runtimePayload).includes('secret-session-id'), false);
  });

  it('falls back to the latest chat agent message and infers chat scope from task state', async () => {
    let chat = sg.createChat({ name: 'Fallback result chat' }, 'test');
    sg.updateChatTask(chat.id, 'task-fallback');
    sg.set('tasks/task-fallback', {
      status: 'done',
      chatId: chat.id,
    }, 'test');
    let localPath = ['', 'Users', 'example', 'private'].join('/');
    let sessionValue = ['session', 'value', '12345'].join('-');
    let sessionField = ['session', 'id'].join('_');
    let localPathPattern = new RegExp(['', 'Users', 'example'].join('/'));
    sg.appendChatMessage(chat.id, {
      role: 'agent',
      text: `Fallback synthesis from ${localPath} with ${sessionField}=${sessionValue} ${'x'.repeat(5000)}`,
      streaming: false,
    });

    let scopedResult = await handlePortalOrchestratorTool(
      proxyManager,
      'get_chat_task_result',
      { chatId: chat.id },
      'test',
      { stateGraph: sg },
    );
    let scopedPayload = JSON.parse(scopedResult.content[0].text);

    assert.equal(scopedPayload.finalAgentMessage.hasText, true);
    assert.equal(scopedPayload.finalAgentMessage.source, 'chat');
    assert.equal(scopedPayload.finalAgentMessage.match, 'latest-agent');
    assert.equal(scopedPayload.finalAgentMessage.truncated, true);
    assert.equal(scopedPayload.finalAgentMessage.text.length <= 4000, true);
    assert.equal(scopedPayload.finalAgentMessage.tail.length <= 1000, true);
    assert.equal(scopedPayload.finalAgentMessage.lastLine.length > 0, true);
    assert.match(scopedPayload.finalAgentMessage.text, /Fallback synthesis/);
    assert.doesNotMatch(scopedPayload.finalAgentMessage.text, localPathPattern);
    assert.doesNotMatch(scopedPayload.finalAgentMessage.text, new RegExp(sessionValue));
    assert.equal('content' in scopedPayload, false);
    assert.equal('taskResult' in scopedPayload, false);

    proxyManager.requestFromChild = async (serverName, method, params) => {
      internalCalls.push({ serverName, method, params });
      if (params.name === 'list_tasks') {
        return { content: [{ type: 'text', text: JSON.stringify({ tasks: [], staleProcesses: [] }) }] };
      }
      return { isError: true, content: [{ type: 'text', text: 'runtime result unavailable' }] };
    };

    let unscopedResult = await handlePortalOrchestratorTool(
      proxyManager,
      'get_chat_task_result',
      { taskId: 'task-fallback' },
      'test',
      { stateGraph: sg },
    );
    let unscopedPayload = JSON.parse(unscopedResult.content[0].text);

    assert.equal(unscopedPayload.ok, true);
    assert.equal(unscopedPayload.runtime.isError, true);
    assert.equal(unscopedPayload.chatId, chat.id);
    assert.equal(unscopedPayload.finalAgentMessage.hasText, true);
    assert.equal(unscopedPayload.finalAgentMessage.source, 'chat');
    assert.equal(unscopedPayload.finalAgentMessage.match, 'latest-agent');
    assert.equal(unscopedPayload.finalAgentMessage.chatId, chat.id);
    assert.equal(unscopedPayload.finalAgentMessage.taskId, 'task-fallback');
    assert.match(unscopedPayload.finalAgentMessage.text, /Fallback synthesis/);
    assert.doesNotMatch(unscopedPayload.finalAgentMessage.text, localPathPattern);
    assert.doesNotMatch(unscopedPayload.finalAgentMessage.text, new RegExp(sessionValue));
  });

  it('surfaces internal task-state read failures in orchestrator status', async () => {
    proxyManager.requestFromChild = async (serverName, method, params, timeoutMs) => {
      internalCalls.push({ serverName, method, params, timeoutMs });
      if (params.name === 'list_tasks') throw new Error('list_tasks unavailable');
      return { content: [{ type: 'text', text: `${params.name}:ok` }] };
    };

    let result = await handlePortalOrchestratorTool(
      proxyManager,
      'get_orchestrator_status',
      {},
      'test',
      { stateGraph: sg },
    );
    let status = JSON.parse(result.content[0].text);

    assert.equal(status.developmentMap.stateError, 'list_tasks unavailable');
    assert.deepEqual(status.staleProcesses, { count: 0, taskIds: [] });
    assert.equal(internalCalls[0].timeoutMs, 5000);
  });

  it('does not count unknown task status as active in orchestrator status', async () => {
    sg.set('tasks/task-unknown', { status: 'unknown' }, 'test');

    let result = await handlePortalOrchestratorTool(
      proxyManager,
      'get_orchestrator_status',
      {},
      'test',
      { stateGraph: sg },
    );
    let status = JSON.parse(result.content[0].text);

    assert.equal(status.tasks.total, 1);
    assert.equal(status.tasks.active, 0);
    assert.equal(status.developmentMap.usage.runningTasks, 0);
    assert.equal(status.developmentMap.taskMap.runningIds.length, 0);
  });

  it('does not count stale pending chat task bindings as active in orchestrator status', async () => {
    let stale = sg.createChat({ name: 'Stale status chat' }, 'test');
    let running = sg.createChat({ name: 'Running status chat' }, 'test');
    sg.updateChatTask(stale.id, 'task-stale');
    sg.updateChatTask(running.id, 'task-running');
    proxyManager.requestFromChild = async (serverName, method, params) => {
      internalCalls.push({ serverName, method, params });
      if (params.name === 'list_tasks') {
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              tasks: [{ id: 'task-running', status: 'running', chatId: running.id }],
              staleProcesses: [],
            }),
          }],
        };
      }
      return { content: [{ type: 'text', text: `${params.name}:ok` }] };
    };

    let result = await handlePortalOrchestratorTool(
      proxyManager,
      'get_orchestrator_status',
      {},
      'test',
      { stateGraph: sg },
    );
    let status = JSON.parse(result.content[0].text);

    assert.equal(status.chats.total, 2);
    assert.equal(status.chats.active, 1);
    assert.equal(status.tasks.active, 0);
    assert.equal(status.developmentMap.usage.runningTasks, 1);
  });

  it('summarizes stale processes without exposing raw process metadata', async () => {
    proxyManager.requestFromChild = async (serverName, method, params) => {
      internalCalls.push({ serverName, method, params });
      if (params.name === 'list_tasks') {
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              tasks: [],
              staleProcesses: [{ pid: 12345, taskId: 'task-stale', command: 'secret command' }],
              systemLoad: {
                total: 4,
                ours: 2,
                external: 1,
                cpu: {
                  count: 8,
                  loadAvg1m: 3.2,
                  loadRatio1m: 0.4,
                },
                memory: {
                  totalBytes: 16000000000,
                  freeBytes: 4000000000,
                  usedRatio: 0.75,
                },
                capacity: {
                  state: 'busy',
                  recommendedMaxParallelTasks: 4,
                  runningTaskCount: 0,
                  trackedChildCount: 2,
                },
              },
            }),
          }],
        };
      }
      return { content: [{ type: 'text', text: `${params.name}:ok` }] };
    };

    let result = await handlePortalOrchestratorTool(
      proxyManager,
      'get_orchestrator_status',
      {},
      'test',
      { stateGraph: sg },
    );
    let status = JSON.parse(result.content[0].text);

    assert.deepEqual(status.staleProcesses, { count: 1, taskIds: ['task-stale'] });
    assert.equal(status.systemLoad.available, true);
    assert.equal(status.systemLoad.cpu.loadRatio1m, 0.4);
    assert.equal(status.systemLoad.memory.usedRatio, 0.75);
    assert.equal(status.systemLoad.capacity.recommendedMaxParallelTasks, 4);
    assert.deepEqual(status.systemLoad, status.developmentMap.system);
    assert.equal(status.mcpClients.total, 2);
    assert.equal(status.mcpClients.initialized, 1);
    assert.equal(status.mcpClients.clients[0].clientName, 'codex-managed');
    assert.equal(JSON.stringify(status.staleProcesses).includes('12345'), false);
    assert.equal(JSON.stringify(status.staleProcesses).includes('secret command'), false);
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
