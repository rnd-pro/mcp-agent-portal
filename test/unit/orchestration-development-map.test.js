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
    sg.updateChatTask(root.id, 'task-root');
    sg.updateChatTask(child.id, 'task-child');

    let now = Date.now();
    sg.set('tasks/task-root', {
      status: 'running',
      chatId: root.id,
      agentSlug: 'orchestrator',
      startedAt: now - 5000,
      prompt: 'Coordinate feature work',
      events: [{
        type: 'tool_use',
        name: 'read_file',
        arguments: { file_path: '/tmp/project/src/runtime/dispatch.js' },
        ts: now - 3000,
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
        }],
        staleProcesses: [],
      },
    });

    assert.equal(map.rootChatId, root.id);
    assert.equal(map.primaryTaskId, 'task-root');
    assert.deepEqual(map.subagents.map((item) => item.chatId), [child.id]);
    assert.equal(map.subagents[0].parentChatId, root.id);
    assert.deepEqual(map.subagents[0].taskIds, ['task-child']);
    assert.equal(map.subagents[0].runningTaskCount, 1);
    assert.equal(map.subagents[0].latestTool, null);
    assert.equal(map.subagentMap.rootChatId, root.id);
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
    assert.equal(map.latestTools[0].usedAt, '2026-06-14T10:00:00.000Z');
    assert.equal(map.latestTools[0].durationMs, 2000);
    assert.equal(map.latestTools.some((tool) => tool.name === 'read_file'), true);
    assert.equal(map.usage.runningTasks, 2);
    assert.equal(map.usage.totalTasks, 2);
    assert.equal(map.usage.subagents, 1);
    assert.equal(map.usage.toolUses, 2);
    assert.equal(map.usage.toolUsageMs, 2000);
    assert.equal(map.usage.totalTaskElapsedMs, 9000);
    assert.equal(map.usage.tokens, 123);
    assert.equal(map.runtime.eventCount, 2);
    assert.equal(map.runtime.contentCount, 3);
    assert.equal('content' in map.runtime, false);
    assert.equal('parsedResult' in map.runtime, false);
    assert.equal(map.runtime.parsedResultSummary.toolCallCount, 1);
    assert.equal(map.runtime.parsedResultSummary.toolResultCount, 1);
    assert.ok(map.runtime.parsedResultSummary.responsePreview.length <= 1200);
    assert.equal(JSON.stringify(map.runtime).includes('secret-session-id'), false);
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
});
