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
    assert.match(source, /async _stopRecording\(\{ autoSend = false, textOverride = '' \} = \{\}\)/);
    assert.match(source, /if \(autoSend\) \{\s+this\._removeVoicePreview\(\);\s+this\.ref\.composer\?\.setValue\?\.\(text\);/);
    assert.match(source, /_extractVoiceCommandText\(text = ''\)/);
    assert.match(source, /_loadVoiceInputSettings\(\)/);
    assert.match(source, /settings\?\.voiceInput\?\.sendCommands/);
    assert.match(source, /settings\?\.voiceInput\?\.wakeCommands/);
    assert.match(source, /settings\?\.voiceInput\?\.sendByCommandEnabled/);
    assert.match(source, /settings\?\.voiceInput\?\.voiceResponseEnabled/);
    assert.match(source, /settings\?\.voiceInput\?\.sendCommand/);
    assert.match(source, /_defaultVoiceCommandPhrases\(\)/);
    assert.match(source, /_defaultWakeCommandPhrases\(\)/);
    assert.match(source, /_matchesWakeCommand\(text = ''\)/);
    assert.match(source, /btn-wake-listen/);
    assert.match(source, /btn-voice-response/);
    assert.match(source, /speechSynthesis/);
    assert.match(source, /_toggleVoiceResponseMode\(\)/);
    assert.match(source, /_speakPendingAgentResponse\(\)/);
    assert.match(source, /_saveVoiceInputModeSettings\(\)/);
    assert.match(source, /this\._voiceResponseLastAgentKey = current\?\.key \|\| ''/);
    assert.match(source, /_setSending\(active, \{ speak = true \} = \{\}\)/);
    assert.match(source, /if \(!active && speak\) this\._speakPendingAgentResponse\(\);/);
    assert.match(source, /this\._setSending\(false, \{ speak: false \}\);/);
    assert.doesNotMatch(source, /sub\('messages'[\s\S]{0,240}_speakPendingAgentResponse\(\)/);
    assert.match(source, /this\._micBtn\.hidden = this\._wakeModeEnabled/);
    assert.match(source, /_triggerVoiceInputFromWake\(\)/);
    assert.equal(source.includes("new RegExp(`(?:[\\\\s,.;:!?]+|^)(${command})[\\\\s,.;:!?]*$`, 'iu')"), true);
    assert.match(source, /chat-composer-voice-command-toggle', \(\) => this\._toggleVoiceCommandMode\(\)/);
    assert.match(source, /this\._stopRecording\(\{ autoSend: true, textOverride: command\.text \}\)/);
    assert.match(source, /this\._micBtn\?\.classList\.remove\('recording', 'processing'\);/);
    assert.equal(source.includes('composer.parentElement.insertBefore(preview, composer)'), false);
    assert.match(source, /_showVoiceError\(message\)/);
    assert.match(source, /this\._showVoiceError\('Microphone access denied\. Check browser microphone permissions\.'\);/);
    assert.match(source, /this\._showVoiceError\('No speech detected\. Try again\.'\);/);
    assert.match(source, /this\._showVoiceError\('Transcription failed\. Try again\.'\);/);

    let settingsSource = fs.readFileSync(path.join(ROOT, 'web/panels/SettingsPanel/SettingsPanel.js'), 'utf8');
    assert.match(settingsSource, /sendByCommandEnabled: Boolean\(current\.sendByCommandEnabled\)/);
    assert.match(settingsSource, /voiceResponseEnabled: Boolean\(current\.voiceResponseEnabled\)/);
  });
});
