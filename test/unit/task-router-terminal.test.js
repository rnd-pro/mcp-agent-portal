import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path, { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  extractFinalAgentResponse,
  isTerminalTaskNotificationType,
} from '../../src/node/proxy/task-router.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TASK_ROUTER_PATH = resolve(__dirname, '../../src/node/proxy/task-router.js');

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
    assert.match(source, /sg\.updateChatTask\(chatId, null\)/);
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
});
