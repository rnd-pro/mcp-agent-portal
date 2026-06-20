import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  MCPMultiplexer,
  META_TOOLS,
  extractTaskIdFromDelegateResult,
  resumeChatTool,
  summarizeDelegateArgs,
} from '../../src/node/proxy/mcp-multiplexer.js';
import {
  parseResourceGroupDiagnostics,
} from '../../src/node/proxy/chat-delegate-routing.js';
import { StateGraph } from '../../src/node/state-graph.js';

const ROOT = path.resolve(new URL('../..', import.meta.url).pathname);

test('MCP proxy client telemetry summarizes live clients without root paths', async () => {
  let tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'portal-mcp-client-telemetry-'));
  let originalConfigPath = process.env.PORTAL_CONFIG_PATH;
  process.env.PORTAL_CONFIG_PATH = path.join(tmpDir, 'agent-portal.json');

  try {
    let { MCPProxyManager } = await import(`../../src/node/proxy/mcp-proxy.js?test=${Date.now()}`);
    let manager = new MCPProxyManager(tmpDir);
    let ws = {};

    manager.trackMcpClient(ws);
    manager.markMcpClientInitialized(ws, {
      params: {
        clientInfo: { name: 'codex-managed\ntransport' },
        roots: [{ uri: 'file:///private/project/root' }],
      },
    });

    let summary = manager.getMcpClientSummary(Date.now() + 130000);

    assert.equal(summary.schemaVersion, 1);
    assert.equal(summary.total, 1);
    assert.equal(summary.initialized, 1);
    assert.equal(summary.quiet, 1);
    assert.equal(summary.transports.mcpWs, 1);
    assert.equal(summary.clients[0].clientName, 'codex-managed transport');
    assert.equal(summary.clients[0].rootCount, 1);
    assert.equal(summary.clients[0].lastMethod, 'initialize');
    assert.equal(JSON.stringify(summary).includes('/private/project/root'), false);

    manager.untrackMcpClient(ws);
    assert.equal(manager.getMcpClientSummary().total, 0);
  } finally {
    if (originalConfigPath === undefined) delete process.env.PORTAL_CONFIG_PATH;
    else process.env.PORTAL_CONFIG_PATH = originalConfigPath;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('resume_chat meta-tool exposes structured context controls', () => {
  let resumeChat = META_TOOLS.find(tool => tool.name === 'resume_chat');
  let properties = resumeChat.inputSchema.properties;

  assert.deepEqual(properties.context_mode.enum, ['auto', 'off']);
  assert.equal(properties.files.type, 'array');
  assert.equal(properties.files.items.type, 'string');
  assert.equal(properties.goalMessageIds.type, 'array');
  assert.equal(properties.goalMessageIds.items.type, 'string');
  assert.equal(properties.goal_message_ids.type, 'array');
  assert.equal(properties.workflow_bypass_reason.type, 'string');
  assert.equal(properties.workflowBypassReason.type, 'string');
});

test('resume_chat extracts full UUID task IDs from delegate_task results', () => {
  let taskId = '12345678-1234-4abc-8def-123456789abc';
  let result = {
    content: [{
      type: 'text',
      text: `🧠 Task delegated\n\n- **Task ID**: \`${taskId}\`\n\nUse get_task_result later.`,
    }],
  };

  assert.equal(extractTaskIdFromDelegateResult(result), taskId);
});

test('resume_chat delegate summary is bounded and hides raw session data', () => {
  let summary = summarizeDelegateArgs({
    prompt: `${'Investigate '.repeat(40)}secret-session-id`,
    timeout: 600,
    cwd: '/tmp/private-project',
    chat_id: 'chat-1',
    agent_slug: 'orchestrator',
    resource_group: 'orchestration-readonly',
    approval_mode: 'plan',
    provider: 'codex',
    model: 'gpt-test',
    context_mode: 'auto',
    session_id: 'secret-session-id',
    files: ['a.js', 'b.js', 'c.js', 'd.js', 'e.js', 'f.js'],
    goalQueueMessages: [{ id: 'msg-1' }],
  });

  assert.equal(summary.chatId, 'chat-1');
  assert.equal(summary.hasSession, true);
  assert.equal(summary.hasCwd, true);
  assert.equal(summary.fileCount, 6);
  assert.deepEqual(summary.filesPreview, ['a.js', 'b.js', 'c.js', 'd.js', 'e.js']);
  assert.equal(summary.goalQueueMessageCount, 1);
  assert.equal(summary.promptPreview.length <= 180, true);
  assert.equal(JSON.stringify(summary).includes('secret-session-id'), false);
  assert.equal('cwd' in summary, false);
  assert.equal('session_id' in summary, false);
});

test('resume_chat injects the active chat goal into delegated prompts only', () => {
  let source = fs.readFileSync(path.join(ROOT, 'src/node/proxy/mcp-multiplexer.js'), 'utf8');

  assert.match(source, /import \{[\s\S]*prepareDelegateTaskCall,[\s\S]*\} from '\.\/chat-delegate-routing\.js';/);
  assert.match(source, /sg\.appendChatMessage\(chatId, \{ role: 'user', text: prompt \}\);/);
  assert.match(source, /sg\.updateChatGoalQueueMessage\(activeGoalId, messageId, \{ status: 'applied' \}, 'mcp'\)/);
  assert.match(source, /if \(goalQueueMessages\.length\) delegateArgs\.goalQueueMessages = goalQueueMessages;/);
  assert.match(source, /prepareDelegateTaskCall\(proxyManager, 'delegate_task', delegateArgs/);
  assert.match(source, /delegateSummary: summarizeDelegateArgs\(delegateArgs\)/);
  assert.match(source, /delegationPolicy: prepared\.delegationPolicy \|\| null/);
  assert.doesNotMatch(source, /\nsession_id: delegateArgs\.session_id/);
});

test('resume_chat blocks active goal task delegation until it is routed through workflow_board', async () => {
  let tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'resume-chat-workflow-required-'));
  let sg;
  try {
    sg = new StateGraph({
      snapshotPath: path.join(tmpDir, 'state.json'),
      walPath: path.join(tmpDir, 'state.wal'),
      chatsDir: path.join(tmpDir, 'chats'),
    });
    let chat = sg.createChat({
      name: 'Goal workflow chat',
      adapter: 'pool',
      agent: 'orchestrator',
      projectId: 'symbiote-workspace',
      goalIntentActive: true,
    }, 'test');
    let goal = sg.createChatGoal({
      chatId: chat.id,
      projectId: 'symbiote-workspace',
      title: 'Build through board',
    }, 'test');
    let proxyManager = {
      projectRoot: ROOT,
      stateGraph: sg,
      broadcastMonitor() {},
      requestFromChild: async () => {
        throw new Error('direct delegate_task should not run');
      },
    };

    let result = await resumeChatTool(proxyManager, {
      chatId: chat.id,
      prompt: 'Implement a board-governed task',
      files: ['src/node/proxy/mcp-multiplexer.js'],
    });
    let payload = JSON.parse(result.content[0].text);

    assert.equal(result.isError, true);
    assert.equal(payload.ok, false);
    assert.equal(payload.taskId, null);
    assert.match(payload.error, /workflow_board/);
    assert.equal(payload.workflowRouting.required, true);
    assert.equal(payload.workflowRouting.status, 'blocked_direct_task');
    assert.equal(payload.workflowRouting.next.createItem.tool, 'workflow_board');
    assert.equal(payload.workflowRouting.next.createItem.arguments.action, 'create_item');
    assert.equal(payload.workflowRouting.next.createItem.arguments.projectId, 'symbiote-workspace');
    assert.equal(payload.workflowRouting.next.createItem.arguments.entityRefs.chatId, chat.id);
    assert.equal(payload.workflowRouting.next.createItem.arguments.entityRefs.goalId, goal.id);
    assert.deepEqual(payload.workflowRouting.next.createItem.arguments.entityRefs.files, ['src/node/proxy/mcp-multiplexer.js']);
    assert.equal(payload.workflowRouting.next.transitionToReady.arguments.action, 'transition');
    assert.equal(payload.workflowRouting.next.transitionToReady.arguments.toColumnId, 'ready');
    assert.equal(sg.getChat(chat.id).messages.length, 0);
  } finally {
    await sg?.flushChatWrites?.();
    sg?.flush?.();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('resume_chat records explicit workflow bypass metadata for active goal direct tasks', async () => {
  let tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'resume-chat-workflow-bypass-'));
  let sg;
  try {
    let taskId = '33333333-3333-4333-8333-333333333333';
    sg = new StateGraph({
      snapshotPath: path.join(tmpDir, 'state.json'),
      walPath: path.join(tmpDir, 'state.wal'),
      chatsDir: path.join(tmpDir, 'chats'),
    });
    let chat = sg.createChat({
      name: 'Goal bypass chat',
      adapter: 'pool',
      agent: 'orchestrator',
      projectId: 'symbiote-workspace',
      goalIntentActive: true,
    }, 'test');
    let goal = sg.createChatGoal({
      chatId: chat.id,
      projectId: 'symbiote-workspace',
      title: 'Bypass only with audit',
    }, 'test');
    let calls = [];
    let proxyManager = {
      projectRoot: ROOT,
      stateGraph: sg,
      chatWsServer: { taskChatMap: new Map() },
      broadcastMonitor() {},
      requestFromChild: async (_serverName, _method, params) => {
        if (params.name === 'list_tasks') {
          return { content: [{ type: 'text', text: JSON.stringify({ tasks: [], staleProcesses: [] }) }] };
        }
        calls.push(params);
        return { content: [{ type: 'text', text: `Task delegated: ${taskId}` }] };
      },
    };

    let result = await resumeChatTool(proxyManager, {
      chatId: chat.id,
      prompt: 'Run diagnostic without a board card',
      workflow_bypass_reason: 'One-off transport diagnostic, not project implementation work.',
    });
    let payload = JSON.parse(result.content[0].text);
    let task = sg.get(`tasks/${taskId}`);

    assert.equal(result.isError, undefined);
    assert.equal(payload.ok, true);
    assert.equal(payload.taskId, taskId);
    assert.equal(payload.workflowRouting.required, true);
    assert.equal(payload.workflowRouting.status, 'bypassed');
    assert.equal(payload.workflowRouting.bypassReason, 'One-off transport diagnostic, not project implementation work.');
    assert.equal(payload.workflowRouting.goalId, goal.id);
    assert.equal(calls.length, 1);
    assert.equal(task.workflowRouting.status, 'bypassed');
    assert.equal(task.workflowRouting.reason, 'One-off transport diagnostic, not project implementation work.');
    assert.equal(task.workflowRouting.expectedRoute, 'workflow_board');
    assert.equal(sg.getChat(chat.id).pendingTaskId, taskId);
  } finally {
    await sg?.flushChatWrites?.();
    sg?.flush?.();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('portal chat meta-tools default pool chats to orchestrator', () => {
  let source = fs.readFileSync(path.join(ROOT, 'src/node/proxy/mcp-multiplexer.js'), 'utf8');
  let routingSource = fs.readFileSync(path.join(ROOT, 'src/node/proxy/chat-delegate-routing.js'), 'utf8');
  let orchestrationSource = fs.readFileSync(path.join(ROOT, 'src/iso/chat-orchestration.js'), 'utf8');

  assert.match(source, /prepareDelegateTaskCall,[\s\S]*resolveChatCreationAgent/);
  assert.match(orchestrationSource, /export const DEFAULT_CHAT_AGENT = 'orchestrator';/);
  assert.match(routingSource, /next\.agent_slug = resolveChatDelegationAgent\(\{ explicitAgent, contextChat \}\)/);
  assert.match(source, /normalizeResourceGroup\(args\.resource_group\)/);
  assert.match(source, /agent: resolveChatCreationAgent\(args\)/);
  assert.match(source, /provider: resourceGroup \? null : \(args\.provider \|\| null\)/);
  assert.match(source, /model: resourceGroup \? null : \(args\.model \|\| null\)/);
  assert.match(source, /resource_group: resourceGroup/);
});

test('portal goal meta-tools expose orchestrator lifecycle controls', () => {
  let toolNames = META_TOOLS.map(tool => tool.name);
  for (let name of ['create_goal', 'pause_goal', 'resume_goal', 'stop_goal', 'block_goal', 'complete_goal', 'delete_goal', 'enqueue_goal_message', 'list_goal_messages', 'mark_goal_message_applied', 'clear_goal_messages', 'get_goal', 'list_goals', 'select_goal']) {
    assert.ok(toolNames.includes(name), `missing ${name}`);
  }

  let createGoal = META_TOOLS.find(tool => tool.name === 'create_goal');
  assert.equal(createGoal.inputSchema.properties.title.type, 'string');
  assert.equal(createGoal.inputSchema.properties.chatId.type, 'string');
  assert.equal(createGoal.inputSchema.properties.context.type, 'array');
  assert.equal(createGoal.inputSchema.properties.scenarios.type, 'array');
  assert.deepEqual(createGoal.inputSchema.required, ['title']);

  let blockGoal = META_TOOLS.find(tool => tool.name === 'block_goal');
  assert.deepEqual(blockGoal.inputSchema.required, ['goalId', 'reason']);

  let completeGoal = META_TOOLS.find(tool => tool.name === 'complete_goal');
  assert.deepEqual(completeGoal.inputSchema.required, ['goalId']);

  let pauseGoal = META_TOOLS.find(tool => tool.name === 'pause_goal');
  assert.deepEqual(pauseGoal.inputSchema.required, ['goalId']);

  let resumeGoal = META_TOOLS.find(tool => tool.name === 'resume_goal');
  assert.deepEqual(resumeGoal.inputSchema.required, ['goalId']);

  let deleteGoal = META_TOOLS.find(tool => tool.name === 'delete_goal');
  assert.deepEqual(deleteGoal.inputSchema.required, ['goalId']);

  let listGoal = META_TOOLS.find(tool => tool.name === 'list_goals');
  assert.deepEqual(listGoal.inputSchema.properties.status.enum, ['active', 'paused', 'blocked', 'completed']);

  let enqueueGoalMessage = META_TOOLS.find(tool => tool.name === 'enqueue_goal_message');
  assert.deepEqual(enqueueGoalMessage.inputSchema.required, ['goalId', 'text']);
  assert.deepEqual(enqueueGoalMessage.inputSchema.properties.delivery.enum, ['goal', 'after']);

  let listGoalMessages = META_TOOLS.find(tool => tool.name === 'list_goal_messages');
  assert.deepEqual(listGoalMessages.inputSchema.properties.status.enum, ['queued', 'applied', 'discarded']);

  let markGoalMessageApplied = META_TOOLS.find(tool => tool.name === 'mark_goal_message_applied');
  assert.deepEqual(markGoalMessageApplied.inputSchema.required, ['goalId', 'messageId']);
});

test('portal orchestrator meta-tools expose control without raw agent-pool tools', () => {
  let toolNames = META_TOOLS.map(tool => tool.name);

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
  ]) {
    assert.ok(toolNames.includes(name), `missing ${name}`);
  }

  for (let rawName of [
    'delegate_task',
    'delegate_task_readonly',
    'get_task_result',
    'cancel_task',
    'finish_task',
    'list_tasks',
  ]) {
    assert.equal(toolNames.includes(rawName), false, `must not expose raw ${rawName}`);
  }
});

test('get_portal_status separates public servers from internal runtime health', async () => {
  let ideMessages = [];
  let ws = { send: msg => ideMessages.push(JSON.parse(msg)) };
  let proxyManager = {
    servers: new Map(),
    broadcastMonitor() {},
    stateGraph: {
      listChats: () => [],
      listChatGoals: () => [],
      get: () => ({}),
    },
    getHealthStatus: () => ({
      'project-graph': { status: 'healthy' },
      'agent-pool': { status: 'healthy' },
    }),
    getMcpClientSummary: () => ({
      schemaVersion: 1,
      total: 2,
      initialized: 1,
      quiet: 1,
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
    requestFromChild: async (_serverName, _method, params) => {
      if (params.name === 'list_tasks') {
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              tasks: [],
              staleProcesses: [{ pid: 23456, taskId: 'task-stale', command: 'secret command' }],
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
    },
  };
  let multiplexer = new MCPMultiplexer(proxyManager, ws);
  multiplexer.toolIndex.tools.set('get_skeleton', {
    server: 'project-graph',
    tool: { name: 'get_skeleton', description: 'Get project skeleton' },
  });
  multiplexer.toolIndex.tools.set('delegate_task', {
    server: 'agent-pool',
    tool: { name: 'delegate_task', description: 'Delegate task' },
  });
  multiplexer.toolIndex._ready = true;

  await multiplexer._handleToolCall({
    jsonrpc: '2.0',
    id: 41,
    method: 'tools/call',
    params: {
      name: 'get_portal_status',
      arguments: {},
    },
  });

  let status = JSON.parse(ideMessages[0].result.content[0].text);
  assert.deepEqual(status.servers, [{ name: 'project-graph', toolCount: 1 }]);
  assert.deepEqual(status.health, { 'project-graph': { status: 'healthy' } });
  assert.deepEqual(status.internalHealth, { 'agent-pool': { status: 'healthy' } });
  assert.equal(status.totalTools, 1);
  // get_portal_status returns a bounded compact development map by default
  assert.equal(status.developmentMap.compact, true);
  assert.equal(status.developmentMap.schemaVersion, 1);
  assert.equal(status.developmentMap.subagentMap, undefined);
  assert.equal(status.developmentMap.taskMap, undefined);
  assert.equal(status.developmentMap.toolMap, undefined);
  assert.equal(status.developmentMap.activityMap, undefined);
  assert.equal(Array.isArray(status.developmentMap.latestTools), true);
  assert.equal(status.developmentMap.usage.runningTasks, 0);
  assert.equal(status.developmentMap.usage.toolUses, 0);
  assert.equal(status.developmentMap.counts.runningTasks, 0);
  assert.equal(status.developmentMap.usage.liveness.state, 'idle');
  assert.equal(status.developmentMap.usage.liveness.warningTaskCount, 0);
  assert.equal(status.systemLoad.available, true);
  assert.equal(status.systemLoad.cpu.loadRatio1m, 0.4);
  assert.equal(status.systemLoad.memory.usedRatio, 0.75);
  assert.equal(status.systemLoad.capacity.recommendedMaxParallelTasks, 4);
  assert.deepEqual(status.systemLoad, status.developmentMap.system);
  assert.equal(status.mcpClients.total, 2);
  assert.equal(status.mcpClients.initialized, 1);
  assert.equal(status.mcpClients.clients[0].clientName, 'codex-managed');
  assert.equal(JSON.stringify(status.mcpClients).includes('/private'), false);
  assert.deepEqual(status.staleProcesses, { count: 1, taskIds: ['task-stale'] });
  assert.equal(JSON.stringify(status.staleProcesses).includes('23456'), false);
  assert.equal(JSON.stringify(status.staleProcesses).includes('secret command'), false);
});

test('get_portal_status surfaces internal task-state read failures', async () => {
  let ideMessages = [];
  let ws = { send: msg => ideMessages.push(JSON.parse(msg)) };
  let proxyManager = {
    servers: new Map(),
    broadcastMonitor() {},
    stateGraph: {
      listChats: () => [],
      listChatGoals: () => [],
      get: () => ({}),
    },
    getHealthStatus: () => ({
      'project-graph': { status: 'healthy' },
      'agent-pool': { status: 'healthy' },
    }),
    requestFromChild: async (serverName, method, params, timeoutMs) => {
      assert.equal(serverName, 'agent-pool');
      assert.equal(params.name, 'list_tasks');
      assert.equal(timeoutMs, 5000);
      throw new Error('list_tasks unavailable');
    },
  };
  let multiplexer = new MCPMultiplexer(proxyManager, ws);
  multiplexer.toolIndex.tools.set('get_skeleton', {
    server: 'project-graph',
    tool: { name: 'get_skeleton', description: 'Get project skeleton' },
  });
  multiplexer.toolIndex._ready = true;

  await multiplexer._handleToolCall({
    jsonrpc: '2.0',
    id: 42,
    method: 'tools/call',
    params: {
      name: 'get_portal_status',
      arguments: {},
    },
  });

  let status = JSON.parse(ideMessages[0].result.content[0].text);
  assert.equal(status.developmentMap.stateError, 'list_tasks unavailable');
});

test('get_portal_status returns degraded status when tool index rebuild stalls', async () => {
  let ideMessages = [];
  let ws = { send: msg => ideMessages.push(JSON.parse(msg)) };
  let proxyManager = {
    servers: new Map([['project-graph', {}], ['agent-pool', {}]]),
    broadcastMonitor() {},
    stateGraph: {
      listChats: () => [],
      listChatGoals: () => [],
      get: () => ({}),
    },
    getHealthStatus: () => ({
      'project-graph': { status: 'healthy' },
      'agent-pool': { status: 'healthy' },
    }),
    requestFromChild: async (serverName, method, params) => {
      if (serverName === 'project-graph' && method === 'tools/list') {
        return new Promise(() => {});
      }
      if (params?.name === 'list_tasks') {
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({ tasks: [], staleProcesses: [] }),
          }],
        };
      }
      return { content: [{ type: 'text', text: 'ok' }] };
    },
  };
  let multiplexer = new MCPMultiplexer(proxyManager, ws);
  multiplexer._indexTimeoutMs = 25;

  let started = Date.now();
  await multiplexer._handleToolCall({
    jsonrpc: '2.0',
    id: 43,
    method: 'tools/call',
    params: {
      name: 'get_portal_status',
      arguments: {},
    },
  });

  let status = JSON.parse(ideMessages[0].result.content[0].text);
  assert.equal(Date.now() - started < 1000, true);
  assert.equal(status.toolIndex.ready, false);
  assert.equal(status.toolIndex.current, false);
  assert.match(status.toolIndex.error, /Tool index rebuild timed out after 25ms/);
  assert.equal(status.developmentMap.stateError, null);
});

test('nested agent-pool delegate_task is blocked as an external MCP tool', async () => {
  let ideMessages = [];
  let childMessages = [];
  let ws = { send: msg => ideMessages.push(JSON.parse(msg)) };
  let proxyManager = {
    servers: new Map([['agent-pool', {}]]),
    broadcastMonitor() {},
    sendToChild(serverName, msg) {
      childMessages.push({ serverName, msg });
    },
  };
  let multiplexer = new MCPMultiplexer(proxyManager, ws);
  multiplexer.toolIndex.tools.set('delegate_task', {
    server: 'agent-pool',
    tool: { name: 'delegate_task', description: 'Delegate task' },
  });
  let args = {};
  Object.defineProperty(args, 'prompt', {
    enumerable: true,
    get() {
      throw new Error('prompt unavailable');
    },
  });

  await multiplexer._handleToolCall({
    jsonrpc: '2.0',
    id: 42,
    method: 'tools/call',
    params: {
      name: 'call_tool',
      arguments: {
        name: 'delegate_task',
        arguments: args,
      },
    },
  });

  assert.equal(childMessages.length, 0);
  assert.equal(ideMessages.length, 1);
  assert.equal(ideMessages[0].id, 42);
  assert.equal(ideMessages[0].result.isError, true);
  assert.match(ideMessages[0].result.content[0].text, /Agent Pool tool `delegate_task` is internal to Agent Portal/);
});

test('discover_tools hides agent-pool tools from external MCP callers', async () => {
  let ideMessages = [];
  let ws = { send: msg => ideMessages.push(JSON.parse(msg)) };
  let proxyManager = {
    servers: new Map(),
    broadcastMonitor() {},
    getHealthStatus: () => ({}),
  };
  let multiplexer = new MCPMultiplexer(proxyManager, ws);
  multiplexer.toolIndex.tools.set('delegate_task', {
    server: 'agent-pool',
    tool: { name: 'delegate_task', description: 'Delegate task' },
  });
  multiplexer.toolIndex.tools.set('get_skeleton', {
    server: 'project-graph',
    tool: { name: 'get_skeleton', description: 'Get project skeleton' },
  });
  multiplexer.toolIndex._ready = true;

  await multiplexer._handleToolCall({
    jsonrpc: '2.0',
    id: 43,
    method: 'tools/call',
    params: {
      name: 'discover_tools',
      arguments: {},
    },
  });

  let payload = JSON.parse(ideMessages[0].result.content[0].text);
  assert.deepEqual(payload.tools.map(tool => tool.name), ['get_skeleton']);
  assert.equal(payload.total, 1);
});

test('delegate readonly tool responses broadcast nested child task events', () => {
  let ideMessages = [];
  let events = [];
  let ws = { send: msg => ideMessages.push(JSON.parse(msg)) };
  let proxyManager = {
    servers: new Map([['agent-pool', {}]]),
    multiplexerCallbacks: new Set(),
    broadcastMonitor() {},
    chatWsServer: {
      taskChatMap: new Map([['main-task', 'chat-1']]),
      broadcastTaskEvent(taskId, method, params) {
        events.push({ taskId, method, params });
      },
    },
  };
  let multiplexer = new MCPMultiplexer(proxyManager, ws);
  multiplexer.requestMap.set(7, {
    originalId: 70,
    toolName: 'delegate_task_readonly',
    toolArgs: { chat_id: 'chat-1' },
  });

  multiplexer.handleChildMessage('agent-pool', {
    jsonrpc: '2.0',
    id: 7,
    result: {
      content: [{
        type: 'text',
        text: 'Delegated task: 11111111-2222-4333-8444-555555555555',
      }],
    },
  });

  assert.equal(events.length, 1);
  assert.equal(events[0].taskId, 'main-task');
  assert.equal(events[0].method, 'chat.delegated');
  assert.equal(events[0].params.taskId, '11111111-2222-4333-8444-555555555555');
  assert.equal(events[0].params.chatId, 'chat-1');
  assert.equal(ideMessages[0].id, 70);
});

test('raw agent-pool notifications are not forwarded to external MCP clients', () => {
  let ideMessages = [];
  let ws = { send: msg => ideMessages.push(JSON.parse(msg)) };
  let proxyManager = {
    servers: new Map([['agent-pool', {}], ['project-graph', {}]]),
    multiplexerCallbacks: new Set(),
    broadcastMonitor() {},
  };
  let multiplexer = new MCPMultiplexer(proxyManager, ws);

  multiplexer.handleChildMessage('agent-pool', {
    jsonrpc: '2.0',
    method: 'notifications/message',
    params: { message: 'internal task event' },
  });
  assert.equal(ideMessages.length, 0);

  multiplexer.handleChildMessage('project-graph', {
    jsonrpc: '2.0',
    method: 'notifications/tools/list_changed',
    params: {},
  });
  assert.equal(ideMessages.length, 1);
});

test('resume_chat error field keys include resourceGroupDiagnostics for registration', () => {
  let source = fs.readFileSync(path.join(ROOT, 'src/node/proxy/mcp-multiplexer.js'), 'utf8');

  assert.match(source, /parseResourceGroupDiagnostics\b/);
  assert.match(source, /resourceGroupDiagnostics,/);
  assert.match(source, /developmentMap: buildDevelopmentMap\(/);
});

test('parseResourceGroupDiagnostics surfaces sanitized not_found group capacity info', () => {
  let errorText = `❌ Resource group \`nonexistent\` not found.

Available resource groups (2):
  - \`orchestration-readonly\` (provider: codex, model: gpt-5, capacity: 0/3)
  - \`reasoning-heavy\` (provider: opencode, model: deepseek/deepseek-v4-pro, capacity: 1/2)`;

  let diagnostics = parseResourceGroupDiagnostics(errorText);

  assert.equal(diagnostics.errorKind, 'not_found');
  assert.equal(diagnostics.groupName, 'nonexistent');
  assert.equal(diagnostics.availableCount, 2);
  assert.equal(JSON.stringify(diagnostics).includes('agent-pool'), false);
  assert.equal(JSON.stringify(diagnostics).includes('Agent Pool'), false);
  assert.equal(JSON.stringify(diagnostics).includes('session'), false);

  assert.equal(diagnostics.availableGroups[0].name, 'orchestration-readonly');
  assert.equal(diagnostics.availableGroups[0].capacity.active, 0);
  assert.equal(diagnostics.availableGroups[0].capacity.max, 3);

  assert.equal(diagnostics.availableGroups[1].capacity.active, 1);
  assert.equal(diagnostics.availableGroups[1].capacity.max, 2);
});

test('parseResourceGroupDiagnostics surfaces sanitized at_capacity group info', () => {
  let errorText = `⚠️ Resource group \`reasoning-heavy\` is at capacity (2/2 active tasks). Wait for an existing task in this group to complete, or use an available alternative.

Available resource groups (1):
  - \`implementation\` (provider: opencode, model: default, capacity: 2/4)`;

  let diagnostics = parseResourceGroupDiagnostics(errorText);

  assert.equal(diagnostics.errorKind, 'at_capacity');
  assert.equal(diagnostics.groupName, 'reasoning-heavy');
  assert.deepEqual(diagnostics.capacity, { active: 2, max: 2 });
  assert.equal(diagnostics.availableCount, 1);
  assert.equal(JSON.stringify(diagnostics).includes('agent-pool'), false);
  assert.equal(JSON.stringify(diagnostics).includes('Agent Pool'), false);

  assert.equal(diagnostics.availableGroups[0].name, 'implementation');
  assert.equal(diagnostics.availableGroups[0].capacity.active, 2);
});

test('get_portal_status development map propagates resourceGroups from task errors', async () => {
  let ideMessages = [];
  let ws = { send: msg => ideMessages.push(JSON.parse(msg)) };
  let proxyManager = {
    servers: new Map(),
    broadcastMonitor() {},
    stateGraph: {
      listChats: () => [],
      listChatGoals: () => [],
      get: () => ({}),
    },
    getHealthStatus: () => ({
      'project-graph': { status: 'healthy' },
      'agent-pool': { status: 'healthy' },
    }),
    requestFromChild: async (_serverName, _method, params) => {
      if (params.name === 'list_tasks') {
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              tasks: [],
              staleProcesses: [],
            }),
          }],
        };
      }
      return { content: [{ type: 'text', text: `${params.name}:ok` }] };
    },
  };
  let multiplexer = new MCPMultiplexer(proxyManager, ws);
  multiplexer.toolIndex.tools.set('get_skeleton', {
    server: 'project-graph',
    tool: { name: 'get_skeleton', description: 'Get project skeleton' },
  });
  multiplexer.toolIndex._ready = true;

  await multiplexer._handleToolCall({
    jsonrpc: '2.0',
    id: 44,
    method: 'tools/call',
    params: {
      name: 'get_portal_status',
      arguments: {},
    },
  });

  let status = JSON.parse(ideMessages[0].result.content[0].text);
  assert.equal(status.developmentMap.schemaVersion, 1);
  assert.equal(status.developmentMap.resourceGroups, null);
});

test('resume_chat error preserves resourceGroupDiagnostics alongside delegateSummary', () => {
  let source = fs.readFileSync(path.join(ROOT, 'src/node/proxy/mcp-multiplexer.js'), 'utf8');

  assert.match(source, /resourceGroupDiagnostics,\s*\n\s*routing:/);
  assert.match(source, /delegateSummary:\s*summarizeDelegateArgs\(delegateArgs\)/);
  assert.match(source, /delegationPolicy:\s*prepared\.delegationPolicy/);
  assert.doesNotMatch(source, /\nresourceGroupDiagnostics:\s*[a-z_]+\.get/);
});

test('resume_chat error response includes structured resource group diagnostics', async () => {
  let tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'resume-chat-rg-'));
  let previousEnv = {
    PORTAL_STATE_DIR: process.env.PORTAL_STATE_DIR,
    PORTAL_STATE_PATH: process.env.PORTAL_STATE_PATH,
    PORTAL_WAL_PATH: process.env.PORTAL_WAL_PATH,
    PORTAL_CHATS_DIR: process.env.PORTAL_CHATS_DIR,
  };
  process.env.PORTAL_STATE_DIR = tmpDir;
  process.env.PORTAL_STATE_PATH = path.join(tmpDir, 'state.json');
  process.env.PORTAL_WAL_PATH = path.join(tmpDir, 'state.wal');
  process.env.PORTAL_CHATS_DIR = path.join(tmpDir, 'chats');

  try {
    let { getStateGraph } = await import('../../src/node/state-graph.js');
    let sg = getStateGraph();
    let chat = sg.createChat({
      name: 'Resource group error test',
      adapter: 'pool',
      agent: 'orchestrator',
      resource_group: 'missing-group',
    }, 'test');

    let proxyManager = {
      projectRoot: ROOT,
      broadcastMonitor() {},
      requestFromChild: async (_serverName, _method, params) => {
        if (params.name === 'list_tasks') {
          return { content: [{ type: 'text', text: JSON.stringify({ tasks: [], staleProcesses: [] }) }] };
        }
        assert.equal(params.name, 'delegate_task');
        return {
          isError: true,
          content: [{
            type: 'text',
            text: `❌ Resource group \`missing-group\` not found.

Available resource groups (1):
  - \`orchestration-readonly\` (provider: codex, model: gpt-5, capacity: 0/3)`,
          }],
        };
      },
    };

    let result = await resumeChatTool(proxyManager, {
      chatId: chat.id,
      prompt: 'Try unavailable resource group',
      resource_group: 'missing-group',
    });
    let payload = JSON.parse(result.content[0].text);

    assert.equal(result.isError, true);
    assert.equal(payload.ok, false);
    assert.equal(payload.chatId, chat.id);
    assert.equal(payload.taskId, null);
    assert.match(payload.error, /Resource group `missing-group` not found/);
    assert.equal(payload.delegateSummary.resourceGroup, 'missing-group');
    assert.equal(payload.resourceGroupDiagnostics.errorKind, 'not_found');
    assert.equal(payload.resourceGroupDiagnostics.groupName, 'missing-group');
    assert.equal(payload.resourceGroupDiagnostics.availableGroups[0].name, 'orchestration-readonly');
    assert.deepEqual(payload.resourceGroupDiagnostics.availableGroups[0].capacity, { active: 0, max: 3 });
    assert.equal(JSON.stringify(payload.resourceGroupDiagnostics).includes('agent-pool'), false);
    assert.equal(JSON.stringify(payload).includes('session_id'), false);
    assert.equal(payload.developmentMap.resourceGroups.errorKind, 'not_found');
  } finally {
    for (let [key, value] of Object.entries(previousEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
