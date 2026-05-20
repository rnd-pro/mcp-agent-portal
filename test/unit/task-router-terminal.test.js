import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path, { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { isTerminalTaskNotificationType } from '../../src/node/proxy/task-router.js';

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
});
