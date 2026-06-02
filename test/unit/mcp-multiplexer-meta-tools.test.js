import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { META_TOOLS } from '../../src/node/proxy/mcp-multiplexer.js';

const ROOT = path.resolve(new URL('../..', import.meta.url).pathname);

test('resume_chat meta-tool exposes structured context controls', () => {
  let resumeChat = META_TOOLS.find(tool => tool.name === 'resume_chat');
  let properties = resumeChat.inputSchema.properties;

  assert.deepEqual(properties.context_mode.enum, ['auto', 'off']);
  assert.equal(properties.files.type, 'array');
  assert.equal(properties.files.items.type, 'string');
});

test('portal chat meta-tools default pool chats to orchestrator', () => {
  let source = fs.readFileSync(path.join(ROOT, 'src/node/proxy/mcp-multiplexer.js'), 'utf8');

  assert.match(source, /const DEFAULT_CHAT_AGENT = 'orchestrator';/);
  assert.match(source, /chat\.agent \|\| DEFAULT_CHAT_AGENT/);
  assert.match(source, /\(args\.adapter \|\| 'pool'\) === 'pool' \? DEFAULT_CHAT_AGENT : null/);
});
