import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {
  MCPMultiplexer,
  META_TOOLS,
  extractTaskIdFromDelegateResult,
  summarizeDelegateArgs,
} from '../../src/node/proxy/mcp-multiplexer.js';

const ROOT = path.resolve(new URL('../..', import.meta.url).pathname);

test('resume_chat meta-tool exposes structured context controls', () => {
  let resumeChat = META_TOOLS.find(tool => tool.name === 'resume_chat');
  let properties = resumeChat.inputSchema.properties;

  assert.deepEqual(properties.context_mode.enum, ['auto', 'off']);
  assert.equal(properties.files.type, 'array');
  assert.equal(properties.files.items.type, 'string');
  assert.equal(properties.goalMessageIds.type, 'array');
  assert.equal(properties.goalMessageIds.items.type, 'string');
  assert.equal(properties.goal_message_ids.type, 'array');
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
  assert.doesNotMatch(source, /\nsession_id: delegateArgs\.session_id/);
});

test('portal chat meta-tools default pool chats to orchestrator', () => {
  let source = fs.readFileSync(path.join(ROOT, 'src/node/proxy/mcp-multiplexer.js'), 'utf8');
  let routingSource = fs.readFileSync(path.join(ROOT, 'src/node/proxy/chat-delegate-routing.js'), 'utf8');
  let orchestrationSource = fs.readFileSync(path.join(ROOT, 'src/iso/chat-orchestration.js'), 'utf8');

  assert.match(source, /prepareDelegateTaskCall,[\s\S]*resolveChatCreationAgent/);
  assert.match(orchestrationSource, /export const DEFAULT_CHAT_AGENT = 'orchestrator';/);
  assert.match(routingSource, /next\.agent_slug = resolveChatDelegationAgent\(\{ explicitAgent, contextChat \}\)/);
  assert.match(source, /agent: resolveChatCreationAgent\(args\)/);
  assert.match(source, /provider: resourceGroup && resourceGroup !== 'none' \? null : \(args\.provider \|\| null\)/);
  assert.match(source, /model: resourceGroup && resourceGroup !== 'none' \? null : \(args\.model \|\| null\)/);
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
    requestFromChild: async (_serverName, _method, params) => {
      if (params.name === 'list_tasks') {
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              tasks: [],
              staleProcesses: [{ pid: 23456, taskId: 'task-stale', command: 'secret command' }],
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
  assert.equal(status.developmentMap.schemaVersion, 1);
  assert.equal(status.developmentMap.activityMap.schemaVersion, 1);
  assert.deepEqual(status.developmentMap.activityMap.nodes, []);
  assert.deepEqual(status.developmentMap.activityMap.latestTools, []);
  assert.equal(status.developmentMap.subagentMap.schemaVersion, 1);
  assert.deepEqual(status.developmentMap.subagentMap.nodes, []);
  assert.equal(status.developmentMap.taskMap.schemaVersion, 1);
  assert.equal(status.developmentMap.toolMap.schemaVersion, 1);
  assert.equal(Array.isArray(status.developmentMap.latestTools), true);
  assert.equal(status.developmentMap.usage.runningTasks, 0);
  assert.equal(status.developmentMap.usage.toolUses, 0);
  assert.equal(status.developmentMap.usage.liveness.state, 'idle');
  assert.equal(status.developmentMap.usage.liveness.warningTaskCount, 0);
  assert.equal(status.developmentMap.activityMap.summary.liveness.state, 'idle');
  assert.equal(status.developmentMap.promptHintMap.schemaVersion, 1);
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
    requestFromChild: async () => {
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
