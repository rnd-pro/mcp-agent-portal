import { strict as assert } from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import { getAgentChatInputState } from '../../web/panels/AgentChat/input-state.js';

const ROOT = path.resolve(new URL('../..', import.meta.url).pathname);

describe('agent chat input state', () => {
  it('disables direct user input for sub-agent chats', () => {
    let state = getAgentChatInputState({
      adapter: 'pool',
      chatParams: { model: 'gpt-5.1' },
      isSubagentChat: true,
    });

    assert.equal(state.disabled, true);
    assert.equal(state.placeholder, 'This sub-agent chat is controlled by the orchestrator.');
  });

  it('keeps regular project chats writable when required params are present', () => {
    let state = getAgentChatInputState({
      adapter: 'pool',
      chatParams: { model: 'gpt-5.1' },
      isSubagentChat: false,
    });

    assert.equal(state.disabled, false);
    assert.equal(state.placeholder, 'Ask anything, @ to mention, / for workflows');
  });

  it('keeps the model requirement for regular pool chats', () => {
    let state = getAgentChatInputState({
      adapter: 'pool',
      chatParams: {},
      isSubagentChat: false,
    });

    assert.equal(state.disabled, true);
    assert.equal(state.placeholder, 'Select a model to start...');
  });

  it('derives sub-agent state from parentChatId without leaking it into adapter params', () => {
    let source = fs.readFileSync(path.join(ROOT, 'web/panels/AgentChat/AgentChat.js'), 'utf8');

    assert.match(source, /this\.\$\.isSubagentChat = Boolean\(chat\.parentChatId\);/);
    assert.match(source, /baseProps = \[[^\]]*'parentChatId'/);
    assert.match(source, /if \(this\.\$\.isInputDisabled\) return;/);
  });
});
