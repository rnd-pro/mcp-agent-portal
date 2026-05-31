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
    assert.equal(state.placeholder, 'pool / gpt-5.1  ·  @ mentions, / workflows');
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

  it('keeps quick-start chat routing and protected send payload fields intact', () => {
    let agentChat = fs.readFileSync(path.join(ROOT, 'web/panels/AgentChat/AgentChat.js'), 'utf8');
    let wsClient = fs.readFileSync(path.join(ROOT, 'web/services/chat-ws-client.js'), 'utf8');

    assert.match(agentChat, /let projectId = dashState\.activeProjectId \|\| routeParams\.project \|\| null;/);
    assert.match(agentChat, /let sendParams = this\._getChatSendParams\(\);/);
    assert.match(agentChat, /let persistedParams = this\._getPersistedChatParams\(sendParams\);/);
    assert.match(agentChat, /let createPayload = \{ \.\.\.persistedParams, adapter, projectId, name \};/);
    assert.match(agentChat, /if \(changedParams\) \{[\s\S]*sendParams = this\._getChatSendParams\(\);[\s\S]*persistedParams = this\._getPersistedChatParams\(sendParams\);[\s\S]*\}/);
    assert.match(agentChat, /if \(chatId\) \{[\s\S]*\/api\/chats\/update[\s\S]*this\._getPersistedChatParams\(currentParams\)/);
    assert.match(agentChat, /let payload = \{ \.\.\.sendParams, type: adapter, prompt \};/);
    assert.match(agentChat, /delete params\.prompt;/);
    assert.match(agentChat, /if \(params\.resource_group && params\.resource_group !== 'none'\) \{[\s\S]*delete params\.provider;[\s\S]*delete params\.model;[\s\S]*\}/);
    assert.match(agentChat, /if \(hasResourceGroup && \(key === 'provider' \|\| key === 'model'\)\) continue;/);
    assert.match(agentChat, /result\.provider = null;[\s\S]*result\.model = null;/);
    assert.match(wsClient, /let params = \{ \.\.\.chatParams, chatId, prompt \};/);
  });

  it('keeps a visible voice preview when recording cannot start or produce text', () => {
    let source = fs.readFileSync(path.join(ROOT, 'web/panels/AgentChat/AgentChat.js'), 'utf8');

    assert.match(source, /_showVoicePreview\('recording'\);\s+this\._startVoiceUiTimer\(\);\s+await this\._audioRecorder\.start\(\);/);
    assert.match(source, /_ensureVoicePreview\(mode = 'recording'\)/);
    assert.match(source, /_startVoiceUiTimer\(\)/);
    assert.match(source, /_formatVoiceElapsed\(elapsed = 0\)/);
    assert.match(source, /status: this\._formatVoiceElapsed\(seconds\)/);
    assert.match(source, /text: this\._voiceInterimText \|\| ''/);
    assert.equal(source.includes("composer.querySelector('.composer-body:not(.voice-preview)')"), true);
    assert.match(source, /chat-composer-voice-approve', \(\) => this\._stopRecording\(\{ autoSend: true \}\)/);
    assert.match(source, /async _stopRecording\(\{ autoSend = false \} = \{\}\)/);
    assert.match(source, /if \(autoSend\) \{\s+this\._removeVoicePreview\(\);\s+this\.ref\.composer\?\.setValue\?\.\(text\);/);
    assert.equal(source.includes('composer.parentElement.insertBefore(preview, composer)'), false);
    assert.match(source, /_showVoiceError\(message\)/);
    assert.match(source, /this\._showVoiceError\('Microphone access denied\. Check browser microphone permissions\.'\);/);
    assert.match(source, /this\._showVoiceError\('No speech detected\. Try again\.'\);/);
    assert.match(source, /this\._showVoiceError\('Transcription failed\. Try again\.'\);/);
  });
});
