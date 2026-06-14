import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path, { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  extractFinalAgentResponse,
  formatProviderFallbackMessage,
  isTerminalTaskNotificationType,
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
    assert.equal(isTerminalTaskNotificationType('event'), false);
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
    assert.match(source, /lastAgent\.streaming = false;/);
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
});
