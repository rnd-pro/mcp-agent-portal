import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { StateGraph } from '../../src/node/state-graph.js';
import {
  buildDevelopmentMap,
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
    sg.set('tasks/task-root', {
      status: 'running',
      chatId: root.id,
      agentSlug: 'orchestrator',
      sessionId: 'secret-session-id',
      startedAt: now - 5000,
      prompt: 'Coordinate feature work',
      events: [{
        type: 'tool_use',
        name: 'read_file',
        arguments: { file_path: '/tmp/project/src/runtime/dispatch.js' },
        ts: '2026-06-14T09:59:00.000Z',
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
              parameters: { query: 'dispatch' },
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
            response: `${'Long final response '.repeat(120)}secret-session-id`,
            sessionId: 'secret-session-id',
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
    assert.equal(map.latestTools[0].timingSource, 'tool_result');
    assert.equal(map.latestTools.some((tool) => tool.name === 'read_file'), true);
    assert.equal(
      map.latestTools.find((tool) => tool.name === 'read_file').status,
      'running',
    );
    assert.equal(map.taskMap.schemaVersion, 1);
    assert.deepEqual(map.taskMap.runningIds.sort(), ['task-child', 'task-root']);
    assert.equal(map.taskMap.byId['task-root'].latestTool.name, 'mcp_project_graph_get_skeleton');
    assert.equal(map.taskMap.byId['task-root'].toolCount, 4);
    assert.deepEqual(map.taskMap.edges, [{
      from: 'task-root',
      to: 'task-child',
      kind: 'task.delegates',
    }]);
    assert.equal(map.toolMap.schemaVersion, 1);
    assert.equal(map.toolMap.byTaskId['task-root'].latestTool.name, 'mcp_project_graph_get_skeleton');
    assert.equal(map.toolMap.byTaskId['task-root'].tools.length, 4);
    assert.equal(map.toolMap.byTaskId['task-root'].totalDurationMs, 2000);
    assert.equal(map.toolMap.byTaskId['task-root'].totalUsageMs >= 2000, true);
    assert.equal(map.toolMap.byChatId[root.id].latestTool.name, 'mcp_project_graph_get_skeleton');
    assert.equal(map.toolMap.byChatId[root.id].tools.length, 4);
    assert.equal(map.toolMap.byChatId[child.id].toolCount, 0);
    assert.equal(map.subagentMap.nodes[0].latestTool.name, 'mcp_project_graph_get_skeleton');
    assert.equal(map.subagentMap.nodes[0].toolCount, 4);
    assert.equal(map.usage.runningTasks, 2);
    assert.equal(map.usage.totalTasks, 2);
    assert.equal(map.usage.subagents, 1);
    assert.equal(map.usage.toolUses, 4);
    assert.equal(map.usage.toolDurationMs, 2000);
    assert.equal(map.usage.toolUsageMs >= 2000, true);
    assert.equal(map.usage.totalTaskElapsedMs, 9000);
    assert.equal(map.usage.tokens, 123);
    assert.equal(map.runtime.eventCount, 3);
    assert.equal(map.runtime.contentCount, 3);
    assert.equal('content' in map.runtime, false);
    assert.equal('parsedResult' in map.runtime, false);
    assert.equal(map.runtime.parsedResultSummary.toolCallCount, 1);
    assert.equal(map.runtime.parsedResultSummary.toolResultCount, 1);
    assert.ok(map.runtime.parsedResultSummary.responsePreview.length <= 1200);
    assert.equal(JSON.stringify(map.runtime).includes('secret-session-id'), false);
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
  });

  it('parses bounded runtime task state from internal list responses', () => {
    let result = {
      content: [{
        type: 'text',
        text: `${JSON.stringify({
          tasks: [{ id: 'task-1', status: 'running' }],
          staleProcesses: [{ pid: 100, taskId: 'old' }],
        })}\n\n---\nActive tasks footer`,
      }],
    };

    assert.deepEqual(parseTaskStateResult(result), {
      tasks: [{ id: 'task-1', status: 'running' }],
      staleProcesses: [{ pid: 100, taskId: 'old' }],
    });
    assert.deepEqual(parseTaskStateResult({ content: [{ type: 'text', text: 'not-json' }] }), {
      tasks: [],
      staleProcesses: [],
    });
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
    assert.equal(map.toolMap.byTaskId['task-result-only'].toolCount, 1);
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
    assert.equal(map.usage.toolDurationMs, 1500);
    assert.equal(map.usage.toolUsageMs, 1500);
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
});
