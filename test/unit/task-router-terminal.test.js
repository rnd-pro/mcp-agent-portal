import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path, { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { StateGraph } from '../../src/node/state-graph.js';
import {
  extractFinalAgentResponse,
  formatProviderFallbackMessage,
  isTerminalTaskNotificationType,
  TaskRouter,
} from '../../src/node/proxy/task-router.js';
import { ChatWsServer } from '../../src/node/proxy/chat-ws-server.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TASK_ROUTER_PATH = resolve(__dirname, '../../src/node/proxy/task-router.js');
const WS_OPEN = 1;

function createWsClient() {
  return {
    readyState: WS_OPEN,
    messages: [],
    send(data) {
      this.messages.push(JSON.parse(data));
    },
  };
}

describe('TaskRouter terminal lifecycle handling', () => {
  it('treats cancelled as a terminal task notification', () => {
    assert.equal(isTerminalTaskNotificationType('done'), true);
    assert.equal(isTerminalTaskNotificationType('error'), true);
    assert.equal(isTerminalTaskNotificationType('cancelled'), true);
    assert.equal(isTerminalTaskNotificationType('lost'), true);
    assert.equal(isTerminalTaskNotificationType('event'), false);
  });

  it('normalizes terminal task notifications into terminal StateGraph status', () => {
    let source = fs.readFileSync(TASK_ROUTER_PATH, 'utf8');

    assert.match(source, /function terminalStatusForType\(type\)/);
    assert.match(source, /if \(type === 'done'\) return 'done';/);
    assert.match(source, /if \(type === 'error'\) return 'error';/);
    assert.match(source, /if \(type === 'cancelled'\) return 'cancelled';/);
    assert.match(source, /if \(type === 'lost'\) return 'lost';/);
    assert.match(source, /taskUpdate\.status = terminalStatusForType\(type\);/);
    assert.match(source, /taskUpdate\.completedAt = taskUpdate\.completedAt \|\| Date\.now\(\);/);
  });

  it('finalizes cancelled tasks without fetching a final result report', () => {
    let source = fs.readFileSync(TASK_ROUTER_PATH, 'utf8');

    assert.match(source, /if \(type === 'cancelled'\) \{\n\s+this\._finalizeCancelledTask/);
    assert.match(source, /status: 'cancelled'/);
    assert.match(source, /sg\.updateChatTask\(chatId, null, \{ expectedTaskId: taskId \}\)/);
    assert.match(source, /sg\.updateChat\(chatId, \{ lastTaskStatus: 'cancelled' \}\)/);
  });

  it('uses nullish fallbacks for falsy task result payload fields', () => {
    let source = fs.readFileSync(TASK_ROUTER_PATH, 'utf8');

    assert.match(source, /let result = data\.output \?\? data\.status \?\? '';/);
    assert.match(source, /result: tRes \? \(tRes\.output \?\? tRes\.status\) : null,/);
    assert.doesNotMatch(source, /data\.output \|\| data\.status/);
    assert.doesNotMatch(source, /tRes\.output \|\| tRes\.status/);
  });

  it('preserves tool correlation and timing fields in cached task events', () => {
    let source = fs.readFileSync(TASK_ROUTER_PATH, 'utf8');

    assert.match(source, /function eventTimestamp\(event = \{\}\)/);
    assert.match(source, /ts: eventTimestamp\(data\),/);
    for (let field of [
      'tool_id',
      'tool_use_id',
      'call_id',
      'durationMs',
      'elapsedMs',
      'duration_ms',
      'elapsed_ms',
      'startedAt',
      'completedAt',
    ]) {
      assert.match(source, new RegExp(`'${field}'`));
    }
    assert.match(source, /if \(data\.toolCall\?\.id && summary\.id === undefined\) summary\.id = data\.toolCall\.id;/);
    assert.match(source, /if \(data\.tool_call\?\.id && summary\.id === undefined\) summary\.id = data\.tool_call\.id;/);
    assert.match(source, /if \(data\.part\?\.id && summary\.id === undefined\) summary\.id = data\.part\.id;/);
  });

  it('extracts the final agent response without terminal report sections', () => {
    let text = [
      '# Task Result',
      'Prompt echo that must not be rendered.',
      '## Agent Response',
      'pong',
      '',
      '---',
      '## Stats',
      '- Exit code: 0',
    ].join('\n');

    assert.equal(extractFinalAgentResponse(text), 'pong');
  });

  it('keeps markdown separators that introduce a closure packet', () => {
    let text = [
      '# Task Result',
      '## Agent Response',
      'Now I have all the evidence I need.',
      '',
      '---',
      '',
      '## Workflow Kanban MVP Closure Audit',
      '',
      'All acceptance criteria are covered.',
      '',
      'WORKFLOW_KANBAN_MVP_CLOSURE_AUDIT:PASS',
      'WORKFLOW_RESULT: completed',
      '',
      '---',
      '## Stats',
      '- Exit code: 0',
    ].join('\n');

    assert.equal(
      extractFinalAgentResponse(text),
      [
        'Now I have all the evidence I need.',
        '',
        '---',
        '',
        '## Workflow Kanban MVP Closure Audit',
        '',
        'All acceptance criteria are covered.',
        '',
        'WORKFLOW_KANBAN_MVP_CLOSURE_AUDIT:PASS',
        'WORKFLOW_RESULT: completed',
      ].join('\n'),
    );
  });

  it('removes progress preface when a closure packet follows it', () => {
    let text = [
      '# Task Result',
      '## Agent Response',
      'I’ll read the board projection first.',
      'I’m checking the latest task evidence before writing the packet.',
      'completed',
      '',
      '**Workflow QA Classification**',
      'card-1: PASS.',
      '',
      'WORKFLOW_RESULT: completed',
      '',
      '---',
      '## Stats',
      '- Exit code: 0',
    ].join('\n');

    assert.equal(
      extractFinalAgentResponse(text),
      [
        '**Workflow QA Classification**',
        'card-1: PASS.',
        '',
        'WORKFLOW_RESULT: completed',
      ].join('\n'),
    );
  });

  it('keeps agent failure diagnostics before the terminal stats section', () => {
    let text = [
      '## [ERR] Agent Failed (exit code 1)',
      '',
      'The agent process terminated without producing a response.',
      '',
      '---',
      '',
      '### Errors',
      '',
      'Error loading config.toml: url is not supported for stdio',
      '',
      '---',
      '',
      '### Recovery',
      '',
      'Retry after fixing MCP configuration.',
      '',
      '---',
      '',
      '## Stats',
      '',
      '- Exit code: 1',
    ].join('\n');

    let body = extractFinalAgentResponse(text);
    assert.match(body, /Agent Failed/);
    assert.match(body, /url is not supported for stdio/);
    assert.match(body, /Retry after fixing MCP configuration/);
    assert.doesNotMatch(body, /## Stats/);
  });

  it('formats provider fallback events as persistent chat messages', () => {
    assert.equal(
      formatProviderFallbackMessage({
        from: { provider: 'claude', model: 'deepseek/deepseek-v4-pro' },
        to: { provider: 'codex', model: 'default' },
        reason: 'exit code 1',
      }),
      'Provider fallback: claude/deepseek/deepseek-v4-pro -> codex/default. Reason: exit code 1',
    );

    let source = fs.readFileSync(TASK_ROUTER_PATH, 'utf8');
    assert.match(source, /case 'provider_fallback':/);
    assert.match(source, /msgs\.push\(\{ role: 'system', text \}\);/);
  });

  it('replaces streaming agent text with the normalized final response', () => {
    let source = fs.readFileSync(TASK_ROUTER_PATH, 'utf8');

    assert.match(source, /let body = extractFinalAgentResponse\(text\);/);
    assert.match(source, /lastAgent\.text = body \|\| lastAgent\.text;/);
    assert.match(source, /lastAgent\.taskId = taskId;/);
    assert.match(source, /lastAgent\.streaming = false;/);
  });

  it('tags persisted agent, tool, and completion messages with task id', () => {
    let source = fs.readFileSync(TASK_ROUTER_PATH, 'utf8');

    assert.match(source, /msgs\[lastIdx\] = \{ \.\.\.last, text, taskId \};/);
    assert.match(source, /msgs\.push\(\{ role: 'agent', text, taskId, streaming: true \}\);/);
    assert.match(source, /msgs\.push\(\{ role: 'agent', text: body, taskId, streaming: false \}\);/);
    assert.match(source, /role: 'tool',\n\s+taskId,/);
    assert.match(source, /resultSummary: summarizeToolResult/);
    assert.match(source, /resultUnavailableReason: missingToolResultReason/);
    assert.match(source, /role: 'thinking',\n\s+taskId,/);
  });

  it('broadcasts live terminal events after final result persistence', () => {
    let source = fs.readFileSync(TASK_ROUTER_PATH, 'utf8');
    let terminalBranch = source.slice(
      source.indexOf('let method = type ==='),
      source.indexOf('}).catch(err => {', source.indexOf('let method = type ===')),
    );

    assert.ok(terminalBranch.indexOf('this._persistFinalTaskResult') > -1);
    assert.ok(terminalBranch.indexOf("broadcastTaskEvent(taskId, method") > -1);
    assert.ok(
      terminalBranch.indexOf('this._persistFinalTaskResult')
        < terminalBranch.indexOf("broadcastTaskEvent(taskId, method"),
      'project transactions must be persisted and broadcast before chat.done/chat.error closes the client listener',
    );
  });

  it('broadcasts task events with the subscribed chat id when params are omitted', () => {
    let server = new ChatWsServer({ projectRoot: process.cwd() });
    let client = createWsClient();

    server.subscribe('task-1', client, 'chat-1');
    server.broadcastTaskEvent('task-1', 'chat.ping');

    assert.deepEqual(client.messages, [{
      method: 'chat.ping',
      params: { chatId: 'chat-1' },
    }]);
  });

  it('preserves an explicit event chat id when broadcasting task events', () => {
    let server = new ChatWsServer({ projectRoot: process.cwd() });
    let client = createWsClient();

    server.subscribe('task-1', client, 'subscribed-chat');
    server.broadcastTaskEvent('task-1', 'chat.meta', {
      chatId: 'event-chat',
      tokenCount: 3,
    });

    assert.deepEqual(client.messages, [{
      method: 'chat.meta',
      params: {
        chatId: 'event-chat',
        tokenCount: 3,
      },
    }]);
  });

  it('classifies lost as a terminal notification and normalizes status even without meta', () => {
    let source = fs.readFileSync(TASK_ROUTER_PATH, 'utf8');

    assert.match(source, /'lost'/);
    assert.match(source, /const TERMINAL_TYPES = new Set\(\['done', 'error', 'cancelled', 'lost'\]\);/);
    assert.match(source, /if \(type === 'lost'\) return 'lost';/);
    assert.match(source, /if \(isTerminalTaskNotificationType\(type\)\) \{/);
    assert.match(source, /taskUpdate\.completedAt = taskUpdate\.completedAt \|\| Date\.now\(\);/);
  });

  it('sets terminal StateGraph status from notification type when meta is absent', () => {
    let tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'task-router-terminal-'));
    let sg = new StateGraph({
      snapshotPath: path.join(tmpDir, 'state.json'),
      walPath: path.join(tmpDir, 'state.wal'),
      chatsDir: path.join(tmpDir, 'chats'),
    });
    let router = new TaskRouter({
      stateGraph: sg,
      chatWsServer: {
        taskChatMap: new Map(),
        chatSubscriptions: new Map(),
      },
    });

    try {
      sg.set('tasks/task-lost-no-meta', { status: 'running', events: [] }, 'test');

      router.route({
        params: {
          taskId: 'task-lost-no-meta',
          type: 'lost',
          data: {},
        },
      });

      let task = sg.get('tasks/task-lost-no-meta');
      assert.equal(task.status, 'lost');
      assert.equal(task.type, 'lost');
      assert.equal(Number.isFinite(task.completedAt), true);
    } finally {
      sg.flush();
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
