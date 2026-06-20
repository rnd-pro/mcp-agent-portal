import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { StateGraph } from '../../src/node/state-graph.js';
import {
  buildDevelopmentMap,
  compactDevelopmentMap,
  parseTaskStateResult,
} from '../../src/node/proxy/orchestration-development-map.js';

describe('orchestration development map', () => {
  let tmpDir;
  let sg;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'orchestration-map-'));
    sg = new StateGraph({
      snapshotPath: path.join(tmpDir, 'state.json'),
      walPath: path.join(tmpDir, 'state.wal'),
      chatsDir: path.join(tmpDir, 'chats'),
    });
  });

  afterEach(async () => {
    await sg.flushChatWrites();
    sg.flush();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('summarizes subagent map, tasks, latest tools, usage, and prompt hints', () => {
    let root = sg.createChat({ name: 'Root', agent: 'orchestrator' }, 'test');
    let child = sg.createChat({
      name: 'Backend chain',
      parentChatId: root.id,
      agent: 'backend-engineer',
      resource_group: 'implementation',
      approval_mode: 'auto_edit',
    }, 'test');
    sg.updateChatSession(root.id, 'secret-session-id');
    sg.updateChatTask(root.id, 'task-root');
    sg.updateChatTask(child.id, 'task-child');

    let now = Date.now();
    let secret = 'secret-session-id';
    sg.set('tasks/task-root', {
      status: 'running',
      chatId: root.id,
      agentSlug: 'orchestrator',
      sessionId: secret,
      startedAt: now - 5000,
      prompt: `${secret} Coordinate feature work`,
      events: [{
        type: 'tool_use',
        name: 'read_file',
        arguments: { file_path: '/tmp/project/src/runtime/dispatch.js' },
        ts: '2026-06-14T09:59:00.000Z',
      }, {
        type: 'tool_use',
        name: 'shell',
        arguments: { command: `curl -H "Authorization: Bearer ${secret}" https://secret.example.test/path` },
        ts: '2026-06-14T09:59:30.000Z',
      }, {
        type: 'tool_use',
        name: 'fetch_url',
        arguments: { url: `https://user:${secret}@secret.example.test/private` },
        ts: '2026-06-14T09:59:40.000Z',
      }],
    }, 'test');
    sg.set('tasks/task-child', {
      status: 'running',
      chatId: child.id,
      parentId: 'task-root',
      agentSlug: 'backend-engineer',
      startedAt: now - 4000,
      prompt: 'Implement backend slice',
      events: [],
    }, 'test');

    let taskResult = {
      content: [
        {
          type: 'text',
          text: '[RUN] Task is still running.\n\n[INFO] **Check with `get_task_result` after doing useful work.**',
        },
        {
          type: 'text',
          text: `__EVENTS__:${JSON.stringify([
            {
              type: 'tool_use',
              tool_id: 'tool-1',
              tool_name: 'mcp_project_graph_get_skeleton',
              parameters: { query: secret },
              timestamp: '2026-06-14T10:00:00.000Z',
            },
            {
              type: 'tool_result',
              tool_id: 'tool-1',
              status: 'success',
              output: 'ok',
              timestamp: '2026-06-14T10:00:02.000Z',
            },
            {
              type: 'tool_use',
              tool_id: 'tool-old',
              tool_name: 'old_runtime_tool',
              timestamp: '2026-06-14T09:00:00.000Z',
            },
          ])}`,
        },
        {
          type: 'text',
          text: `__RESULT_JSON__:${JSON.stringify({
            response: `${secret} ${'Long final response '.repeat(120)}`,
            sessionId: secret,
            toolCalls: [{ name: 'shell' }],
            toolResults: [{ output: 'ok' }],
            stats: { total_tokens: 123 },
          })}`,
        },
      ],
    };

    let map = buildDevelopmentMap({
      sg,
      chatId: root.id,
      taskId: 'task-root',
      taskResult,
      taskState: {
        tasks: [{
          id: 'task-root',
          status: 'running',
          chatId: root.id,
          elapsedMs: 5000,
          trackedChildren: [{ pid: 123, label: 'codex', elapsedMs: 3000 }],
        }, {
          id: 'task-child',
          status: 'running',
          chatId: child.id,
          elapsedMs: 4000,
        }],
        staleProcesses: [],
        systemLoad: {
          total: 4,
          ours: 2,
          external: 1,
          cpu: {
            count: 8,
            loadAvg1m: 3.2,
            loadAvg5m: 2.4,
            loadAvg15m: 2,
            loadRatio1m: 0.4,
          },
          memory: {
            totalBytes: 16000000000,
            freeBytes: 4000000000,
            usedRatio: 0.75,
          },
          process: {
            trackedChildren: 2,
          },
          capacity: {
            state: 'busy',
            reason: 'external_agents',
            recommendedMaxParallelTasks: 4,
            runningTaskCount: 2,
            staleProcessCount: 0,
            trackedChildCount: 2,
          },
          warning: `System load references ${secret}`,
        },
      },
    });

    assert.equal(map.rootChatId, root.id);
    assert.equal(map.schemaVersion, 1);
    assert.equal(map.primaryTaskId, 'task-root');
    assert.equal(JSON.stringify(map).includes('secret-session-id'), false);
    assert.deepEqual(map.subagents.map((item) => item.chatId), [child.id]);
    assert.equal(map.subagents[0].parentChatId, root.id);
    assert.deepEqual(map.subagents[0].taskIds, ['task-child']);
    assert.equal(map.subagents[0].runningTaskCount, 1);
    assert.equal(map.subagents[0].latestTool, null);
    assert.equal(map.subagentMap.rootChatId, root.id);
    assert.equal(map.subagentMap.schemaVersion, 1);
    assert.deepEqual(
      map.subagentMap.nodes.map((node) => node.chatId).sort(),
      [child.id, root.id].sort(),
    );
    assert.deepEqual(map.subagentMap.edges, [{
      from: root.id,
      to: child.id,
      kind: 'agent.delegates',
    }]);
    assert.equal(map.subagentMap.tree.length, 1);
    assert.equal(map.subagentMap.tree[0].chatId, root.id);
    assert.equal(map.subagentMap.tree[0].children[0].chatId, child.id);
    assert.deepEqual(map.tasks.map((item) => item.id).sort(), ['task-child', 'task-root']);
    assert.equal(map.latestTools[0].name, 'mcp_project_graph_get_skeleton');
    assert.equal(map.latestTools.some((tool) => tool.name === 'old_runtime_tool'), true);
    assert.equal(map.latestTools.some((tool) => tool.name === 'shell'), true);
    assert.equal(map.latestTools[0].usedAt, '2026-06-14T10:00:00.000Z');
    assert.equal(map.latestTools[0].completedAt, '2026-06-14T10:00:02.000Z');
    assert.equal(map.latestTools[0].durationMs, 2000);
    assert.equal(map.latestTools[0].elapsedMs, 2000);
    assert.equal(map.latestTools[0].usageMs, 2000);
    assert.equal(map.latestTools[0].detailKind, 'query');
    assert.equal(map.latestTools[0].detailLabel, '[query]');
    assert.equal(map.latestTools[0].timingSource, 'tool_result');
    assert.equal(map.latestTools.some((tool) => tool.name === 'read_file'), true);
    assert.equal(map.latestTools.find((tool) => tool.name === 'read_file').status, 'done');
    assert.equal(map.latestTools.find((tool) => tool.name === 'read_file').timingSource, 'event_superseded');
    assert.equal(
      map.latestTools.find((tool) => tool.name === 'read_file').resultUnavailableReason,
      'superseded_by_later_event',
    );
    assert.equal(map.latestTools.find((tool) => tool.name === 'shell').detailLabel, '[command]');
    assert.equal(map.latestTools.find((tool) => tool.name === 'fetch_url').detailLabel, 'secret.example.test');
    assert.equal(map.tasks.find((task) => task.id === 'task-root').hasPrompt, true);
    assert.equal(map.tasks.find((task) => task.id === 'task-root').trackedChildCount, 1);
    assert.equal('prompt' in map.tasks.find((task) => task.id === 'task-root'), false);
    assert.equal('pid' in map.tasks.find((task) => task.id === 'task-root'), false);
    assert.equal('trackedChildren' in map.tasks.find((task) => task.id === 'task-root'), false);
    assert.equal(map.taskMap.schemaVersion, 1);
    assert.deepEqual(map.taskMap.runningIds.sort(), ['task-child', 'task-root']);
    assert.equal(map.taskMap.byId['task-root'].latestTool.name, 'mcp_project_graph_get_skeleton');
    assert.equal(map.taskMap.byId['task-root'].toolCount, 5);
    assert.deepEqual(map.taskMap.edges, [{
      from: 'task-root',
      to: 'task-child',
      kind: 'task.delegates',
    }]);
    assert.equal(map.toolMap.schemaVersion, 1);
    assert.equal(map.toolMap.byTaskId['task-root'].latestTool.name, 'mcp_project_graph_get_skeleton');
    assert.equal(map.toolMap.byTaskId['task-root'].tools.length, 5);
    assert.equal(map.toolMap.byTaskId['task-root'].totalDurationMs, 2000);
    assert.equal(map.toolMap.byTaskId['task-root'].totalUsageMs >= 2000, true);
    assert.equal(map.toolMap.byChatId[root.id].latestTool.name, 'mcp_project_graph_get_skeleton');
    assert.equal(map.toolMap.byChatId[root.id].tools.length, 5);
    assert.equal(map.toolMap.byChatId[child.id].toolCount, 0);
    assert.equal(map.delegationGraph.schemaVersion, 1);
    assert.equal(map.delegationGraph.edges.some((edge) => edge.kind === 'agent.delegates'), true);
    assert.equal(map.delegationGraph.edges.some((edge) => edge.kind === 'task.delegates'), true);
    assert.equal(map.delegationGraph.nodes.some((node) => node.id === root.id && node.type === 'chat'), true);
    assert.equal(map.delegationGraph.nodes.some((node) => node.id === 'task-root' && node.type === 'task'), true);
    assert.equal(map.activityTimeline.schemaVersion, 1);
    assert.equal(map.activityTimeline.events.length > 0, true);
    assert.equal(map.activityTimeline.events[0].at >= map.activityTimeline.events.at(-1).at, true);
    assert.equal(map.system.available, true);
    assert.equal(map.system.agents.external, 1);
    assert.equal(map.system.cpu.count, 8);
    assert.equal(map.system.memory.usedRatio, 0.75);
    assert.equal(map.system.capacity.state, 'busy');
    assert.equal(map.system.capacity.recommendedMaxParallelTasks, 4);
    assert.equal(map.system.warning.includes(secret), false);
    assert.equal(map.subagentMap.nodes[0].latestTool.name, 'mcp_project_graph_get_skeleton');
    assert.equal(map.subagentMap.nodes[0].toolCount, 5);
    assert.equal(map.usage.runningTasks, 2);
    assert.equal(map.usage.totalTasks, 2);
    assert.equal(map.usage.subagents, 1);
    assert.equal(map.usage.toolUses, 5);
    assert.equal(map.usage.toolDurationMs, 2000);
    assert.equal(map.usage.toolUsageMs >= 2000, true);
    assert.equal(map.usage.totalTaskElapsedMs, 9000);
    assert.equal(map.usage.capacity.state, 'busy');
    assert.equal(map.activityMap.summary.capacity.state, 'busy');
    assert.equal(map.activityMap.system.capacity.state, 'busy');
    assert.equal(map.usage.tokens, 123);
    assert.equal(map.usage.liveness.zeroEventTaskCount, 1);
    assert.equal(map.taskMap.byId['task-root'].liveness.eventCount, 3);
    assert.equal(map.taskMap.byId['task-child'].liveness.state, 'cold_start');
    assert.equal(map.activityMap.schemaVersion, 1);
    assert.equal(map.activityMap.rootChatId, root.id);
    assert.equal(map.activityMap.primaryTaskId, 'task-root');
    assert.equal(map.activityMap.nodes.length, 2);
    assert.equal(map.activityMap.subagents.length, 1);
    assert.deepEqual(map.activityMap.edges, map.subagentMap.edges);
    assert.equal(map.activityMap.summary.runningTasks, 2);
    assert.equal(map.activityMap.summary.totalTaskElapsedMs, 9000);
    assert.equal(map.activityMap.summary.toolUsageMs >= 2000, true);
    assert.equal(map.activityMap.summary.liveness.coldStartTaskCount, 1);
    assert.equal(map.activityMap.latestTools[0].name, 'mcp_project_graph_get_skeleton');
    assert.equal(map.activityMap.latestTools[0].usageMs, 2000);
    assert.equal(map.activityMap.latestTools[0].detailKind, 'query');
    assert.equal(map.activityMap.latestTools[0].detailLabel, '[query]');
    assert.equal(map.activityMap.latestTools[0].timingSource, 'tool_result');
    let rootActivity = map.activityMap.nodes.find((node) => node.chatId === root.id);
    assert.equal(rootActivity.status, 'running');
    assert.equal(rootActivity.latestTask.id, 'task-root');
    assert.equal(rootActivity.latestTool.name, 'mcp_project_graph_get_skeleton');
    assert.equal(rootActivity.toolCount, 5);
    let childActivity = map.activityMap.subagents.find((node) => node.chatId === child.id);
    assert.equal(childActivity.parentChatId, root.id);
    assert.equal(childActivity.agent, 'backend-engineer');
    assert.equal(childActivity.status, 'running');
    assert.equal(childActivity.totalElapsedMs, 4000);
    assert.equal(childActivity.liveness.state, 'cold_start');
    assert.equal(
      map.activityMap.promptHints.some((hint) => hint.tool === 'get_chat_task_result'),
      true,
    );
    assert.equal(JSON.stringify(map.activityMap).includes(secret), false);
    assert.equal(JSON.stringify(map).includes(secret), false);
    assert.equal(map.runtime.eventCount, 3);
    assert.equal(map.runtime.contentCount, 3);
    assert.equal('content' in map.runtime, false);
    assert.equal('parsedResult' in map.runtime, false);
    assert.equal('textPreview' in map.runtime, false);
    assert.equal(map.runtime.parsedResultSummary.toolCallCount, 1);
    assert.equal(map.runtime.parsedResultSummary.toolResultCount, 1);
    assert.equal('responsePreview' in map.runtime.parsedResultSummary, false);
    assert.equal(JSON.stringify(map.runtime).includes(secret), false);
    assert.equal(map.promptHintMap.schemaVersion, 1);
    assert.equal(Array.isArray(map.promptHintMap.hints), true);
    assert.equal(map.promptHintMap.hints.length <= 8, true);
    assert.deepEqual(
      map.promptHintMap.hints.find((hint) => hint.id === 'poll-current-task').arguments,
      { chatId: root.id, taskId: 'task-root' },
    );
    assert.equal(
      map.promptHintMap.hints.find((hint) => hint.id === 'poll-current-task').tool,
      'get_chat_task_result',
    );
    assert.equal(
      map.promptHintMap.hints.find((hint) => hint.id === 'continue-chat').tool,
      'resume_chat',
    );
    assert.equal(
      map.promptHintMap.hints.find((hint) => hint.id === 'create-child-subagent')
        .arguments.parentChatId,
      root.id,
    );
    assert.equal(
      map.promptHintMap.hints.find((hint) => hint.id === 'review-latest-tool').taskId,
      'task-root',
    );
    assert.ok(
      map.promptHintMap.hints.find((hint) => hint.id === 'aggregate-subagents')
        .prompt.includes('1 subagent'),
    );
    assert.ok(map.promptHints.some((hint) => hint.includes('get_chat_task_result')));
    assert.ok(map.promptHints.some((hint) => hint.includes('resume_chat')));
    assert.ok(map.promptHints.some((hint) => hint.includes('parentChatId')));
    assert.equal(JSON.stringify(map).includes('Agent Pool'), false);
    assert.equal(JSON.stringify(map).includes('agent-pool'), false);
  });

  it('routes active goal prompt hints through workflow board work items', () => {
    let root = sg.createChat({
      name: 'Goal Root',
      agent: 'orchestrator',
      projectId: 'symbiote-workspace',
      goalIntentActive: true,
    }, 'test');
    let goal = sg.createChatGoal({
      chatId: root.id,
      projectId: 'symbiote-workspace',
      title: 'Board governed work',
    }, 'test');

    let map = buildDevelopmentMap({
      sg,
      chatId: root.id,
      taskState: { tasks: [], staleProcesses: [] },
    });
    let createHint = map.promptHintMap.hints.find((hint) => hint.id === 'create-workflow-item');
    let readyHint = map.promptHintMap.hints.find((hint) => hint.id === 'start-ready-workflow-item');

    assert.equal(createHint.tool, 'workflow_board');
    assert.equal(createHint.arguments.action, 'create_item');
    assert.equal(createHint.arguments.projectId, 'symbiote-workspace');
    assert.equal(createHint.arguments.entityRefs.chatId, root.id);
    assert.equal(createHint.arguments.entityRefs.goalId, goal.id);
    assert.equal(readyHint.tool, 'workflow_board');
    assert.equal(readyHint.arguments.action, 'transition');
    assert.equal(readyHint.arguments.toColumnId, 'ready');
    assert.equal(map.promptHintMap.hints.some((hint) => hint.id === 'continue-chat'), false);
    assert.equal(map.promptHintMap.hints.some((hint) => hint.tool === 'resume_chat'), false);
    assert.ok(map.promptHints.some((hint) => hint.includes('workflow_board')));
    assert.equal(JSON.stringify(map).includes('agent-pool'), false);
  });

  it('parses bounded runtime task state from internal list responses', () => {
    let result = {
      content: [{
        type: 'text',
        text: `${JSON.stringify({
          tasks: [{ id: 'task-1', status: 'running' }],
          staleProcesses: [{ pid: 100, taskId: 'old' }],
          systemLoad: { capacity: { state: 'available' } },
        })}\n\n---\nActive tasks footer`,
      }],
    };

    assert.deepEqual(parseTaskStateResult(result), {
      tasks: [{ id: 'task-1', status: 'running' }],
      staleProcesses: [{ pid: 100, taskId: 'old' }],
      systemLoad: { capacity: { state: 'available' } },
    });
    assert.deepEqual(parseTaskStateResult({ content: [{ type: 'text', text: 'not-json' }] }), {
      tasks: [],
      staleProcesses: [],
    });
  });

  it('labels runtime prompt hints as Agent Portal surface data', () => {
    let root = sg.createChat({ name: 'Root', agent: 'orchestrator' }, 'test');
    sg.updateChatTask(root.id, 'task-root');
    sg.set('tasks/task-root', {
      status: 'running',
      chatId: root.id,
      agentSlug: 'orchestrator',
      resourceGroup: 'orchestration-readonly',
      startedAt: Date.now() - 1000,
      prompt: 'Run audit',
      events: [],
    }, 'test');

    let taskResult = {
      content: [{
        type: 'text',
        text: '[RUN] Task is still running.\n\n[INFO] **Check with `get_task_result` after doing useful work.**',
      }],
    };

    let map = buildDevelopmentMap({
      sg,
      chatId: root.id,
      taskId: 'task-root',
      taskResult,
    });
    let hint = map.promptHintMap.hints.find((item) => item.id === 'runtime-coaching');

    assert.equal(hint.label, 'Agent Portal runtime hint');
    assert.equal(hint.source, 'agent-portal');
    assert.equal(hint.reason.includes('Agent Pool'), false);
    assert.equal(JSON.stringify(map.promptHints).includes(['Agent', 'Pool', 'runtime', 'hint'].join(' ')), false);
    assert.equal(JSON.stringify(map.promptHintMap).includes('Agent Pool'), false);
    assert.equal(JSON.stringify(map.promptHintMap).includes('agent-pool'), false);
    assert.equal(JSON.stringify(map.activityMap.promptHints).includes('Agent Pool'), false);
    assert.equal(JSON.stringify(map.activityMap.promptHints).includes('agent-pool'), false);
  });

  it('classifies running task liveness for cold, no-event, and quiet tasks', () => {
    let root = sg.createChat({ name: 'Root', agent: 'orchestrator' }, 'test');
    let child = sg.createChat({ name: 'Quiet chain', parentChatId: root.id, agent: 'backend-engineer' }, 'test');
    let now = Date.now();

    sg.set('tasks/task-cold', {
      status: 'running',
      chatId: root.id,
      agentSlug: 'orchestrator',
      startedAt: now - 5000,
      elapsedMs: 5000,
      events: [],
    }, 'test');
    sg.set('tasks/task-no-events', {
      status: 'running',
      chatId: root.id,
      agentSlug: 'orchestrator',
      startedAt: now - 70000,
      elapsedMs: 70000,
      events: [],
    }, 'test');
    sg.set('tasks/task-quiet', {
      status: 'running',
      chatId: child.id,
      parentId: 'task-cold',
      agentSlug: 'backend-engineer',
      startedAt: now - 120000,
      lastEventAt: now - 90000,
      elapsedMs: 120000,
      eventCount: 2,
      events: [{
        type: 'tool_use',
        name: 'read_file',
        arguments: { path: 'src/node/proxy/orchestration-development-map.js' },
        ts: now - 90000,
      }],
    }, 'test');

    let map = buildDevelopmentMap({ sg, chatId: root.id, taskId: 'task-cold' });

    assert.equal(map.taskMap.byId['task-cold'].liveness.state, 'cold_start');
    assert.equal(map.taskMap.byId['task-cold'].liveness.severity, 'info');
    assert.equal(map.taskMap.byId['task-cold'].liveness.thresholdMs, 15000);
    assert.equal(map.taskMap.byId['task-no-events'].liveness.state, 'no_events');
    assert.equal(map.taskMap.byId['task-no-events'].liveness.severity, 'warning');
    assert.equal(map.taskMap.byId['task-no-events'].liveness.thresholdMs, 15000);
    assert.equal(map.taskMap.byId['task-quiet'].liveness.state, 'quiet');
    assert.equal(map.taskMap.byId['task-quiet'].liveness.severity, 'warning');
    assert.equal(map.taskMap.byId['task-quiet'].liveness.thresholdMs, 60000);
    assert.equal(map.usage.liveness.warningTaskCount, 2);
    assert.equal(map.usage.liveness.zeroEventTaskCount, 2);
    assert.equal(map.usage.liveness.noEventTaskCount, 1);
    assert.equal(map.usage.liveness.coldStartTaskCount, 1);
    assert.equal(map.usage.liveness.quietTaskCount, 1);
    assert.equal(map.activityMap.summary.liveness.warningTaskCount, 2);
    assert.equal(map.activityMap.summary.liveness.quietTaskCount, 1);
    assert.equal(map.activityMap.nodes.find((node) => node.chatId === root.id).liveness.warningTaskCount, 1);
    assert.equal(map.activityMap.subagents[0].liveness.state, 'quiet');
    assert.equal(map.activityMap.subagents[0].latestTask.liveness.state, 'quiet');
  });

  it('uses task state timing for runtime-only terminal tool events', () => {
    let root = sg.createChat({ name: 'Root', agent: 'orchestrator' }, 'test');
    sg.updateChatTask(root.id, 'task-runtime');
    let completedAt = 7000;
    let taskResult = {
      content: [{
        type: 'text',
        text: `__EVENTS__:${JSON.stringify([{
          type: 'tool_use',
          name: 'shell',
          parameters: { command: 'npm test' },
          ts: 3000,
        }])}`,
      }],
    };

    let map = buildDevelopmentMap({
      sg,
      chatId: root.id,
      taskId: 'task-runtime',
      taskResult,
      taskState: {
        tasks: [{
          id: 'task-runtime',
          status: 'done',
          chatId: root.id,
          startedAt: 1000,
          completedAt,
          elapsedMs: 6000,
        }],
        staleProcesses: [],
      },
    });

    assert.equal(map.latestTools[0].name, 'shell');
    assert.equal(map.latestTools[0].status, 'done');
    assert.equal(map.latestTools[0].timingSource, 'task_completed');
    assert.equal(map.latestTools[0].usageMs, 4000);
    assert.equal(map.latestTools[0].estimatedCompletedAt, completedAt);
    assert.equal(map.latestTools[0].resultSummary, null);
    assert.equal(map.latestTools[0].resultUnavailableReason, 'not_reported_by_runner');
  });

  it('keeps completed result tool calls visible when event cache is empty', () => {
    let root = sg.createChat({ name: 'Root', agent: 'orchestrator' }, 'test');
    sg.updateChatTask(root.id, 'task-result-only');
    let taskResult = {
      content: [{
        type: 'text',
        text: `__RESULT_JSON__:${JSON.stringify({
          toolCalls: [{ name: 'shell', arguments: { command: 'npm test' } }],
          toolResults: [{ status: 'success', output: 'ok' }],
          stats: { total_tokens: 7 },
        })}`,
      }],
    };

    let map = buildDevelopmentMap({
      sg,
      chatId: root.id,
      taskId: 'task-result-only',
      taskResult,
      taskState: {
        tasks: [{
          id: 'task-result-only',
          status: 'done',
          chatId: root.id,
          startedAt: 1000,
          completedAt: 5000,
          elapsedMs: 4000,
        }],
        staleProcesses: [],
      },
    });

    assert.equal(map.latestTools[0].name, 'shell');
    assert.equal(map.latestTools[0].status, 'success');
    assert.equal(map.latestTools[0].timingSource, 'runtime_result');
    assert.equal(map.latestTools[0].usageMs, null);
    assert.equal(map.latestTools[0].resultSummary, 'ok');
    assert.equal(map.latestTools[0].resultUnavailableReason, null);
    assert.equal(map.toolMap.byTaskId['task-result-only'].toolCount, 1);
    assert.equal(map.toolMap.byTaskId['task-result-only'].latestTool.resultSummary, 'ok');
    assert.equal(map.usage.tokens, 7);
  });

  it('exposes task state read errors in the development map', () => {
    let map = buildDevelopmentMap({
      sg,
      taskState: {
        tasks: [],
        staleProcesses: [],
        error: 'list_tasks failed',
      },
    });

    assert.equal(map.stateError, 'list_tasks failed');
    assert.equal(map.usage.runningTasks, 0);
  });

  it('pairs adjacent unkeyed tool results for tool usage timing', () => {
    let root = sg.createChat({ name: 'Root', agent: 'orchestrator' }, 'test');
    sg.updateChatTask(root.id, 'task-running');
    sg.set('tasks/task-running', {
      status: 'running',
      chatId: root.id,
      agentSlug: 'orchestrator',
      startedAt: 1000,
      prompt: 'Audit tool timings',
      events: [{
        type: 'tool_use',
        name: 'shell',
        arguments: { command: 'node --test' },
        ts: 2000,
      }, {
        type: 'tool_result',
        status: 'success',
        output: 'ok',
        ts: 3500,
      }],
    }, 'test');

    let map = buildDevelopmentMap({ sg, chatId: root.id, taskId: 'task-running' });

    assert.equal(map.latestTools[0].name, 'shell');
    assert.equal(map.latestTools[0].status, 'success');
    assert.equal(map.latestTools[0].durationMs, 1500);
    assert.equal(map.latestTools[0].elapsedMs, 1500);
    assert.equal(map.latestTools[0].usageMs, 1500);
    assert.equal(map.latestTools[0].timingSource, 'tool_result');
    assert.equal(map.latestTools[0].resultSummary, 'ok');
    assert.equal(map.latestTools[0].resultUnavailableReason, null);
    assert.equal(map.usage.toolDurationMs, 1500);
    assert.equal(map.usage.toolUsageMs, 1500);
  });

  it('does not count superseded running tool events as active tools', () => {
    let root = sg.createChat({ name: 'Root', agent: 'orchestrator' }, 'test');
    sg.updateChatTask(root.id, 'task-stream');
    sg.set('tasks/task-stream', {
      status: 'running',
      chatId: root.id,
      agentSlug: 'orchestrator',
      startedAt: 1000,
      prompt: 'Audit live tool telemetry',
      events: [{
        type: 'tool_use',
        name: 'Read',
        arguments: { file_path: '/tmp/project/src/node/server.js' },
        ts: 2000,
      }, {
        type: 'message',
        role: 'assistant',
        content: 'Read complete, checking tests.',
        ts: 2600,
      }, {
        type: 'tool_use',
        name: 'Bash',
        arguments: { command: 'node --test' },
        ts: 3000,
      }],
    }, 'test');

    let map = buildDevelopmentMap({ sg, chatId: root.id, taskId: 'task-stream' });
    let taskTools = map.toolMap.byTaskId['task-stream'].tools;
    let readTool = taskTools.find((tool) => tool.name === 'Read');
    let bashTool = taskTools.find((tool) => tool.name === 'Bash');

    assert.equal(map.taskMap.byId['task-stream'].runningToolCount, 1);
    assert.equal(map.toolMap.byTaskId['task-stream'].runningToolCount, 1);
    assert.equal(map.subagentMap.nodes[0].runningToolCount, 1);
    assert.equal(readTool.status, 'done');
    assert.equal(readTool.estimatedCompletedAt, 2600);
    assert.equal(readTool.elapsedMs, 600);
    assert.equal(readTool.timingSource, 'event_superseded');
    assert.equal(readTool.resultUnavailableReason, 'superseded_by_later_event');
    assert.equal(bashTool.status, 'running');
    assert.equal(bashTool.timingSource, 'running_elapsed');
  });

  it('estimates terminal task tool usage instead of hiding timing', () => {
    let root = sg.createChat({ name: 'Root', agent: 'orchestrator' }, 'test');
    let startedAt = 2000;
    let completedAt = 7000;
    sg.updateChatTask(root.id, 'task-done');
    sg.set('tasks/task-done', {
      status: 'done',
      chatId: root.id,
      agentSlug: 'orchestrator',
      startedAt,
      completedAt,
      prompt: 'Finished audit',
      events: [{
        type: 'tool_use',
        name: 'shell',
        arguments: { command: 'sed -n 1,20p file.js' },
        ts: 3000,
      }],
    }, 'test');

    let map = buildDevelopmentMap({ sg, chatId: root.id, taskId: 'task-done' });

    assert.equal(map.latestTools[0].name, 'shell');
    assert.equal(map.latestTools[0].status, 'done');
    assert.equal(map.latestTools[0].durationMs, null);
    assert.equal(map.latestTools[0].elapsedMs, 4000);
    assert.equal(map.latestTools[0].usageMs, 4000);
    assert.equal(map.latestTools[0].timingSource, 'task_completed');
    assert.equal(map.latestTools[0].estimatedCompletedAt, completedAt);
    assert.equal(map.usage.toolDurationMs, 0);
    assert.equal(map.usage.toolUsageMs, 4000);
    assert.equal(map.taskMap.byId['task-done'].toolUsageMs, 4000);
    assert.equal(map.promptHintMap.hints.find((hint) => hint.id === 'review-latest-tool').priority, 'normal');
  });

  it('propagates resource group diagnostics from task error into development map', () => {
    let root = sg.createChat({ name: 'Root', agent: 'orchestrator' }, 'test');
    sg.updateChatTask(root.id, 'task-root');

    let taskResult = {
      isError: true,
      content: [{
        type: 'text',
        text: `❌ Resource group \`nonexistent\` not found.

Available resource groups (2):
  - \`orchestration-readonly\` (capacity: 0/3)
  - \`reasoning-heavy\` (capacity: 1/2)`,
      }],
    };

    let map = buildDevelopmentMap({
      sg,
      chatId: root.id,
      taskId: 'task-root',
      taskResult,
      taskState: {
        tasks: [{ id: 'task-root', status: 'done', chatId: root.id }],
        staleProcesses: [],
      },
    });

    assert.equal(map.resourceGroups.errorKind, 'not_found');
    assert.equal(map.resourceGroups.groupName, 'nonexistent');
    assert.equal(map.resourceGroups.availableCount, 2);
    assert.deepEqual(map.resourceGroups.availableGroups[0], { name: 'orchestration-readonly', capacity: { active: 0, max: 3 } });
    assert.equal(JSON.stringify(map.resourceGroups).includes('agent-pool'), false);
    assert.equal(JSON.stringify(map.resourceGroups).includes('Agent Pool'), false);
  });

  it('returns null resourceGroups for normal task results without resource group errors', () => {
    let root = sg.createChat({ name: 'Root', agent: 'orchestrator' }, 'test');

    let map = buildDevelopmentMap({
      sg,
      chatId: root.id,
      taskResult: {
        content: [{ type: 'text', text: 'Task delegated successfully' }],
      },
    });

    assert.equal(map.resourceGroups, null);
  });

  it('propagates at-capacity resource group state into development map', () => {
    let root = sg.createChat({ name: 'Root', agent: 'orchestrator' }, 'test');

    let taskResult = {
      isError: true,
      content: [{
        type: 'text',
        text: `⚠️ Resource group \`reasoning-heavy\` is at capacity (2/2 active tasks). Wait for an existing task in this group to complete, or use an available alternative.

Available resource groups (1):
  - \`implementation\` (capacity: 2/4)`,
      }],
    };

    let map = buildDevelopmentMap({
      sg,
      chatId: root.id,
      taskResult,
      taskState: {
        tasks: [],
        staleProcesses: [],
      },
    });

    assert.equal(map.resourceGroups.errorKind, 'at_capacity');
    assert.equal(map.resourceGroups.groupName, 'reasoning-heavy');
    assert.deepEqual(map.resourceGroups.capacity, { active: 2, max: 2 });
    assert.equal(map.resourceGroups.availableCount, 1);
    assert.deepEqual(map.resourceGroups.availableGroups[0], { name: 'implementation', capacity: { active: 2, max: 4 } });
    assert.equal(JSON.stringify(map.resourceGroups).includes('agent-pool'), false);
  });

  it('exposes requestedTask lifecycle state: found, terminal, and liveness', () => {
    let root = sg.createChat({ name: 'Root', agent: 'orchestrator' }, 'test');
    sg.updateChatTask(root.id, 'task-done');
    sg.set('tasks/task-done', {
      status: 'done',
      chatId: root.id,
      agentSlug: 'orchestrator',
      startedAt: Date.now() - 10000,
      completedAt: Date.now() - 2000,
      elapsedMs: 8000,
      events: [],
    }, 'test');

    let map = buildDevelopmentMap({ sg, chatId: root.id, taskId: 'task-done' });

    assert.equal(map.requestedTask.found, true);
    assert.equal(map.requestedTask.id, 'task-done');
    assert.equal(map.requestedTask.status, 'done');
    assert.equal(map.requestedTask.terminalStatus, true);
    assert.equal(map.requestedTask.unavailableReason, null);
    assert.equal(map.requestedTask.resultUnavailableReason, 'task_terminal');
    assert.equal(map.requestedTask.liveness.state, 'terminal');
    assert.equal(map.requestedTask.liveness.severity, 'normal');
  });

  it('exposes requestedTask as not_found when task row is missing after TTL or never existed', () => {
    let root = sg.createChat({ name: 'Root', agent: 'orchestrator' }, 'test');

    let map = buildDevelopmentMap({ sg, chatId: root.id, taskId: 'task-gone' });

    assert.equal(map.requestedTask.found, false);
    assert.equal(map.requestedTask.id, 'task-gone');
    assert.equal(map.requestedTask.status, null);
    assert.equal(map.requestedTask.terminalStatus, null);
    assert.equal(map.requestedTask.unavailableReason, 'not_found');
    assert.equal(map.requestedTask.resultUnavailableReason, 'no_task_row');
    assert.equal(map.requestedTask.liveness, null);
  });

  it('treats lost task status as terminal and not running', () => {
    let root = sg.createChat({ name: 'Root', agent: 'orchestrator' }, 'test');
    sg.updateChatTask(root.id, 'task-lost');
    sg.set('tasks/task-lost', {
      status: 'lost',
      chatId: root.id,
      agentSlug: 'backend-engineer',
      startedAt: Date.now() - 50000,
      elapsedMs: 50000,
      events: [],
    }, 'test');

    let map = buildDevelopmentMap({ sg, chatId: root.id, taskId: 'task-lost' });

    assert.equal(map.requestedTask.found, true);
    assert.equal(map.requestedTask.terminalStatus, true);
    assert.equal(map.requestedTask.liveness.state, 'terminal');
    assert.equal(map.usage.runningTasks, 0);
    assert.equal(map.usage.totalTasks, 1);
    assert.equal(map.usage.completedTasks, 1);
    assert.equal(map.taskMap.runningIds.length, 0);
    assert.equal(map.taskMap.terminalIds.length, 1);
    assert.equal(map.taskMap.terminalIds[0], 'task-lost');
    assert.equal(map.taskMap.byId['task-lost'].liveness.state, 'terminal');
  });

  it('does not emit a failed-task recovery hint for lost tasks with terminal agent markers', () => {
    let root = sg.createChat({ name: 'Root', agent: 'orchestrator' }, 'test');
    sg.updateChatTask(root.id, 'task-lost');
    sg.set('tasks/task-lost', {
      status: 'lost',
      chatId: root.id,
      agentSlug: 'orchestrator',
      startedAt: Date.now() - 50000,
      completedAt: Date.now() - 1000,
      elapsedMs: 49000,
      events: [],
    }, 'test');
    sg.appendChatMessage(root.id, {
      role: 'agent',
      taskId: 'task-lost',
      streaming: false,
      text: 'Verified planning evidence is recorded.\n\nROOT_1_0_PLAN:PASS',
    });

    let map = buildDevelopmentMap({ sg, chatId: root.id, taskId: 'task-lost' });

    assert.equal(map.requestedTask.status, 'lost');
    assert.equal(map.requestedTask.terminalStatus, true);
    assert.equal(
      map.promptHintMap.hints.some((hint) => hint.id === 'recover-failed-task'),
      false,
    );
    assert.equal(map.promptHintMap.hints.some((hint) => hint.id === 'close-stage'), true);
  });

  it('surfaces stale processes summary without raw process metadata', () => {
    let root = sg.createChat({ name: 'Root', agent: 'orchestrator' }, 'test');

    let map = buildDevelopmentMap({
      sg,
      chatId: root.id,
      taskState: {
        tasks: [],
        staleProcesses: [
          { pid: 9999, taskId: 'task-stale-1', command: 'sensitive command' },
          { pid: 8888, taskId: 'task-stale-2' },
          { pid: 7777, command: 'orphan' },
        ],
      },
    });

    assert.deepEqual(map.staleProcesses, { count: 3, taskIds: ['task-stale-1', 'task-stale-2'] });
    assert.equal(JSON.stringify(map.staleProcesses).includes('9999'), false);
    assert.equal(JSON.stringify(map.staleProcesses).includes('sensitive command'), false);
    assert.equal(JSON.stringify(map.staleProcesses).includes('8888'), false);
  });

  it('reports empty stale processes when none are present', () => {
    let root = sg.createChat({ name: 'Root', agent: 'orchestrator' }, 'test');

    let map = buildDevelopmentMap({
      sg,
      chatId: root.id,
      taskState: { tasks: [], staleProcesses: [] },
    });

    assert.deepEqual(map.staleProcesses, { count: 0, taskIds: [] });
  });

  it('reports empty stale processes when taskState is not provided', () => {
    let root = sg.createChat({ name: 'Root', agent: 'orchestrator' }, 'test');

    let map = buildDevelopmentMap({ sg, chatId: root.id });

    assert.deepEqual(map.staleProcesses, { count: 0, taskIds: [] });
  });

  it('omits idle root probe chats from unscoped development maps', () => {
    let root = sg.createChat({
      name: 'Active root',
      agent: 'orchestrator',
      projectId: 'project-1',
      activeGoalId: 'goal-1',
    }, 'test');
    let child = sg.createChat({
      name: 'Child scope',
      parentChatId: root.id,
      agent: 'tooling-engineer',
    }, 'test');
    let sessionRoot = sg.createChat({ name: 'Session root', agent: 'orchestrator' }, 'test');
    sg.updateChatSession(sessionRoot.id, 'session-id');
    let probe = sg.createChat({
      name: 'Resource group error test',
      agent: 'orchestrator',
      resource_group: 'missing-group',
    }, 'test');
    sg.appendChatMessage(probe.id, {
      role: 'user',
      text: 'Try unavailable resource group',
    });

    let map = buildDevelopmentMap({ sg, taskState: { tasks: [], staleProcesses: [] } });
    let ids = map.subagentMap.nodes.map((node) => node.chatId);

    assert.equal(ids.includes(root.id), true);
    assert.equal(ids.includes(child.id), true);
    assert.equal(ids.includes(sessionRoot.id), true);
    assert.equal(ids.includes(probe.id), false);
    assert.equal(map.promptHintMap.hints.some((hint) => hint.id === 'aggregate-subagents'), true);
    assert.equal(
      map.promptHintMap.hints
        .find((hint) => hint.id === 'aggregate-subagents')
        .prompt.includes('Resource group error test'),
      false,
    );

    let scoped = buildDevelopmentMap({ sg, chatId: probe.id, taskState: { tasks: [], staleProcesses: [] } });
    assert.equal(scoped.subagentMap.nodes.some((node) => node.chatId === probe.id), true);
  });

  it('classifies unknown task status as warning liveness instead of running', () => {
    let root = sg.createChat({ name: 'Root', agent: 'orchestrator' }, 'test');
    sg.updateChatTask(root.id, 'task-unknown');
    sg.set('tasks/task-unknown', {
      status: 'unknown',
      chatId: root.id,
    }, 'test');

    let map = buildDevelopmentMap({ sg, chatId: root.id, taskId: 'task-unknown' });

    assert.equal(map.requestedTask.found, true);
    assert.equal(map.requestedTask.terminalStatus, false);
    assert.equal(map.requestedTask.liveness.state, 'unknown');
    assert.equal(map.requestedTask.liveness.severity, 'warning');
    assert.equal(map.usage.runningTasks, 0);
    assert.equal(map.activityMap.summary.runningTasks, 0);
    assert.equal(map.activityMap.nodes[0].liveness.state, 'unknown');
    assert.equal(map.activityMap.nodes[0].liveness.severity, 'warning');
    assert.equal(map.activityMap.nodes[0].liveness.unknownTaskCount, 1);
    assert.equal(map.system.capacity.runningTaskCount, 0);
    assert.equal(map.taskMap.runningIds.length, 0);
  });

  it('bounds stale process task ids while preserving total count', () => {
    let root = sg.createChat({ name: 'Root', agent: 'orchestrator' }, 'test');
    let staleProcesses = Array.from({ length: 25 }, (_, index) => ({
      pid: 1000 + index,
      taskId: `task-stale-${index}`,
      command: `secret command ${index}`,
    }));

    let map = buildDevelopmentMap({
      sg,
      chatId: root.id,
      taskState: { tasks: [], staleProcesses },
    });

    assert.equal(map.staleProcesses.count, 25);
    assert.equal(map.staleProcesses.taskIds.length, 20);
    assert.equal(map.staleProcesses.taskIds[0], 'task-stale-0');
    assert.equal(map.staleProcesses.taskIds[19], 'task-stale-19');
    assert.equal(JSON.stringify(map.staleProcesses).includes('secret command'), false);
    assert.equal(JSON.stringify(map.staleProcesses).includes('1000'), false);
  });
});

describe('compactDevelopmentMap', () => {
  function bigMap() {
    let tasks = Array.from({ length: 30 }, (_, i) => ({
      id: `task-${i}`,
      chatId: `chat-${i}`,
      status: i < 3 ? 'running' : 'completed',
      title: `Task ${i}`,
      startedAt: i,
      updatedAt: i,
      completedAt: i,
      durationMs: i,
      bulky: 'x'.repeat(5000),
    }));
    return {
      schemaVersion: 1,
      stateError: null,
      rootChatId: null,
      primaryTaskId: null,
      subagents: Array.from({ length: 25 }, (_, i) => ({ id: `sub-${i}` })),
      subagentMap: { nodes: [], tree: { huge: 'y'.repeat(20000) }, edges: [] },
      tasks,
      taskMap: { huge: 'z'.repeat(20000) },
      latestTools: [{ name: 'navigate' }, { name: 'analyze' }],
      toolMap: { huge: 'w'.repeat(20000) },
      delegationGraph: { huge: 'd'.repeat(20000) },
      activityTimeline: Array.from({ length: 100 }, (_, i) => ({ i })),
      activityMap: { huge: 'a'.repeat(20000) },
      system: { state: 'ok' },
      usage: { totalTasks: 30 },
      promptHintMap: { huge: 'p'.repeat(20000) },
      promptHints: Array.from({ length: 12 }, (_, i) => `hint ${i}`),
      runtime: { running: 3 },
      resourceGroups: { review: { state: 'available' } },
    };
  }

  it('drops heavy nested structures and keeps small summaries', () => {
    let compact = compactDevelopmentMap(bigMap());
    assert.equal(compact.compact, true);
    assert.equal(compact.subagentMap, undefined);
    assert.equal(compact.taskMap, undefined);
    assert.equal(compact.toolMap, undefined);
    assert.equal(compact.activityMap, undefined);
    assert.equal(compact.delegationGraph, undefined);
    assert.equal(compact.activityTimeline, undefined);
    assert.equal(compact.promptHintMap, undefined);
    assert.deepEqual(compact.system, { state: 'ok' });
    assert.deepEqual(compact.usage, { totalTasks: 30 });
    assert.deepEqual(compact.runtime, { running: 3 });
    assert.deepEqual(compact.resourceGroups, { review: { state: 'available' } });
  });

  it('caps task list, exposes accurate counts, and bounds prompt hints', () => {
    let compact = compactDevelopmentMap(bigMap());
    assert.equal(compact.tasks.length, 12);
    assert.equal(compact.counts.tasks, 30);
    assert.equal(compact.counts.subagents, 25);
    assert.equal(compact.counts.runningTasks, 3);
    assert.equal(compact.counts.latestTools, 2);
    assert.equal(compact.promptHints.length, 6);
    assert.equal('bulky' in compact.tasks[0], false);
    assert.equal(typeof compact.detailHint, 'string');
  });

  it('produces output far smaller than the full map', () => {
    let full = bigMap();
    let compact = compactDevelopmentMap(full);
    let fullSize = JSON.stringify(full).length;
    let compactSize = JSON.stringify(compact).length;
    assert.ok(compactSize < fullSize / 10, `expected heavy reduction, got ${compactSize} vs ${fullSize}`);
  });

  it('is null-safe for malformed input', () => {
    assert.deepEqual(compactDevelopmentMap(null), null);
    let compact = compactDevelopmentMap({});
    assert.equal(compact.compact, true);
    assert.equal(compact.tasks.length, 0);
    assert.equal(compact.counts.tasks, 0);
  });
});
