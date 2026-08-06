import { acquireCurrentTestFileLock } from './test-lock.js';
await acquireCurrentTestFileLock(import.meta.url);

import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  CHAT_TITLE_MAX_LENGTH,
  CHAT_TITLE_MAX_WORDS,
  extractChatTitleFromAgentText,
  sanitizeChatTitle,
} from '../chat/chat-title.js';

test('sanitizeChatTitle strips markup and enforces title limits', () => {
  assert.equal(CHAT_TITLE_MAX_WORDS, 8);
  assert.equal(CHAT_TITLE_MAX_LENGTH, 72);
  assert.equal(
    sanitizeChatTitle(' "**Build [dynamic] layout, quickly!!!**" '),
    'Build dynamic layout, quickly'
  );
  assert.equal(
    sanitizeChatTitle(' «Граф проекта» '),
    'Граф проекта'
  );
  assert.equal(
    sanitizeChatTitle('one two three four five six seven eight nine ten'),
    'one two three four five six seven eight'
  );
});

test('extractChatTitleFromAgentText removes only standalone title tag', () => {
  const result = extractChatTitleFromAgentText([
    'Here is the generated UI.',
    '',
    '<chat-title> Agent composed dashboard! </chat-title>',
  ].join('\n'));

  assert.deepEqual(result, {
    title: 'Agent composed dashboard',
    text: 'Here is the generated UI.',
    changed: true,
  });

  assert.equal(
    extractChatTitleFromAgentText('<chat-title>«Русский заголовок»</chat-title>').title,
    'Русский заголовок'
  );
});

test('extractChatTitleFromAgentText leaves ordinary content unchanged', () => {
  const source = 'Inline <chat-title>not a separate tag</chat-title> content.';
  assert.deepEqual(extractChatTitleFromAgentText(source), {
    title: '',
    text: source,
    changed: false,
  });
});

test('chat title helpers are exported from public entrypoints', async () => {
  const [root, ui] = await Promise.all([
    import('../index.js'),
    import('../ui/index.js'),
  ]);

  assert.equal(root.extractChatTitleFromAgentText, extractChatTitleFromAgentText);
  assert.equal(root.sanitizeChatTitle, sanitizeChatTitle);
  assert.equal(ui.extractChatTitleFromAgentText, extractChatTitleFromAgentText);
  assert.equal(ui.sanitizeChatTitle, sanitizeChatTitle);
});
