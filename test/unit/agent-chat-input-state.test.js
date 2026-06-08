import { strict as assert } from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import { getAgentChatInputState } from '../../web/panels/AgentChat/input-state.js';
import {
  defaultVoiceActionCommandPhrases,
  defaultWakeCommandPhrases,
  extractChatTitleFromAgentText,
  matchVoiceCommandAtEnd,
  matchVoiceCommandInText,
  normalizeVoiceCommandSettings,
  normalizeWakeCommandPhrase,
  parseVoiceCommandList,
  wakeCommandCandidates,
} from 'symbiote-ui/ui';
import {
  buildChatTitleRequestNote,
} from '../../web/panels/AgentChat/chat-title.js';

const ROOT = path.resolve(new URL('../..', import.meta.url).pathname);

describe('agent chat input state', () => {
  it('uses ok agent as the shared wake command default', () => {
    assert.deepEqual(defaultWakeCommandPhrases(), {
      en: 'Okay Agent',
      ru: "О'кей Агент",
      es: 'Okey Agente',
    });
    assert.equal(normalizeWakeCommandPhrase('voice input', 'en'), 'Okay Agent');
    assert.equal(normalizeWakeCommandPhrase('голосовой ввод', 'ru'), "О'кей Агент");
    assert.equal(normalizeWakeCommandPhrase('entrada de voz', 'es'), 'Okey Agente');
    assert.equal(normalizeWakeCommandPhrase("О'кей Агент", 'en'), 'Okay Agent');
    assert.equal(normalizeWakeCommandPhrase("О'кей Агент", 'es'), 'Okey Agente');
    assert.equal(normalizeWakeCommandPhrase('assistant start', 'en'), 'assistant start');
    assert.equal(matchVoiceCommandInText('okay agent', wakeCommandCandidates(defaultWakeCommandPhrases(), 'en')).matched, true);
    assert.equal(matchVoiceCommandInText('hey agent', wakeCommandCandidates({ en: 'Okay Agent, Hey Agent' }, 'en')).matched, true);
    assert.equal(matchVoiceCommandInText('hola agente', wakeCommandCandidates({ es: 'Okey Agente, Hola Agente' }, 'es')).matched, true);
    assert.equal(normalizeWakeCommandPhrase('voice input, hey agent', 'en'), 'Okay Agent, hey agent');
    assert.deepEqual(defaultVoiceActionCommandPhrases().cancel.ru, ['отмена', 'стоп']);
    assert.deepEqual(defaultVoiceActionCommandPhrases().delete.ru, ['удали', 'удалить', 'очистить']);
    assert.deepEqual(parseVoiceCommandList('отмена=стоп'), ['отмена', 'стоп']);
    assert.deepEqual(parseVoiceCommandList('cancel, stop'), ['cancel', 'stop']);
    assert.deepEqual(parseVoiceCommandList(['удали'], defaultVoiceActionCommandPhrases().delete.ru), ['удали']);
    assert.deepEqual(normalizeVoiceCommandSettings({ actionCommands: { cancel: { ru: 'отмена=стоп' } } }).actionCommands.cancel.ru, ['отмена', 'стоп']);
    assert.deepEqual(
      matchVoiceCommandAtEnd('Проверочный текст СТОП', [{ action: 'cancel', phrase: 'стоп' }]),
      { action: 'cancel', phrase: 'стоп', matched: true, text: 'Проверочный текст' },
    );
    assert.deepEqual(
      matchVoiceCommandAtEnd('Проверочный текст очистить', defaultVoiceActionCommandPhrases().delete.ru.map((phrase) => ({ action: 'delete', phrase }))),
      { action: 'delete', phrase: 'очистить', matched: true, text: 'Проверочный текст' },
    );
    assert.equal(matchVoiceCommandInText("ну О'КЕЙ АГЕНТ давай", ["О'кей Агент"]).matched, true);
  });

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
    assert.match(source, /onPulledChat: \(chat, detail\) => this\._handlePulledChat\(chat, detail\),/);
    assert.match(source, /dashEvents\.addEventListener\('chat-updated', \(e\) => \{[\s\S]*this\._handleExternalChatUpdate\(e\.detail\);/);
    assert.match(source, /_handleExternalChatUpdate\(detail = \{\}\)/);
    assert.match(source, /if \(!chatId \|\| chatId !== activeChatId \|\| this\._isSending\) return;/);
    assert.match(source, /clearTimeout\(this\._externalChatUpdateTimer\);/);
    assert.match(source, /this\._refreshExternalChat\(chatId\);/);
    assert.match(source, /async _refreshExternalChat\(chatId\)/);
    assert.match(source, /this\._cleanLoadedMessages\(chat\.messages \|\| \[\]\)/);
    assert.match(source, /_setLoadedChatParams\(chat\)/);
    assert.match(source, /this\._loadingChatState = true;/);
    assert.match(source, /if \(chatId && !this\._loadingChatState\) \{/);
  });

  it('keeps quick-start chat routing and protected send payload fields intact', () => {
    let agentChat = fs.readFileSync(path.join(ROOT, 'web/panels/AgentChat/AgentChat.js'), 'utf8');
    let wsClient = fs.readFileSync(path.join(ROOT, 'web/services/chat-ws-client.js'), 'utf8');

    assert.match(agentChat, /let projectId = dashState\.activeProjectId \|\| routeParams\.project \|\| null;/);
    assert.match(agentChat, /let sendParams = this\._getChatSendParams\(\);/);
    assert.match(agentChat, /let persistedParams = this\._getPersistedChatParams\(sendParams\);/);
    assert.match(agentChat, /let requestChatTitle = !chatId;/);
    assert.match(agentChat, /let createPayload = \{ \.\.\.persistedParams, adapter, projectId, name \};/);
    assert.match(agentChat, /this\._pendingAgentTitleChatId = chatId;/);
    assert.match(agentChat, /if \(changedParams\) \{[\s\S]*sendParams = this\._getChatSendParams\(\);[\s\S]*persistedParams = this\._getPersistedChatParams\(sendParams\);[\s\S]*\}/);
    assert.match(agentChat, /if \(chatId\) \{[\s\S]*\/api\/chats\/update[\s\S]*this\._getPersistedChatParams\(currentParams\)/);
    assert.match(agentChat, /let agentPrompt = this\._buildAgentPrompt\(prompt, \{ voiceTranscribed, requestChatTitle \}\);/);
    assert.match(agentChat, /buildChatTitleRequestNote\(getLocalization\(\)\.locale\)/);
    assert.match(agentChat, /extractChatTitleFromAgentText\(messages\[index\]\.text\)/);
    assert.match(agentChat, /this\._saveAgentGeneratedChatTitle\(chatId, parsed\.title, nextMessages\);/);
    assert.match(agentChat, /let payload = \{ \.\.\.sendParams, type: adapter, prompt: agentPrompt \};/);
    assert.match(agentChat, /this\._wsClient\.send\(chatId, agentPrompt, sendParams, this\._sessionId\)/);
    assert.match(agentChat, /const DEFAULT_POOL_AGENT = 'orchestrator';/);
    assert.match(agentChat, /meta\.pool\.parameters\.filter\(p => p\.id !== 'agent'\)/);
    assert.match(agentChat, /params = this\._normalizePoolChatParams\(params\);/);
    assert.match(agentChat, /delete params\.prompt;/);
    assert.match(agentChat, /if \(params\.resource_group && params\.resource_group !== 'none'\) \{[\s\S]*delete params\.provider;[\s\S]*delete params\.model;[\s\S]*\}/);
    assert.match(agentChat, /if \(hasResourceGroup && \(key === 'provider' \|\| key === 'model'\)\) continue;/);
    assert.match(agentChat, /result\.provider = null;[\s\S]*result\.model = null;/);
    assert.match(wsClient, /let params = \{ \.\.\.chatParams, chatId, prompt \};/);
    assert.match(wsClient, /case 'chat\.done': \{[\s\S]*this\._pullMessages\(chatId, \{ final: true \}\)\.then\(\(\) => \{[\s\S]*dashEmit\("chats-updated"\);[\s\S]*\}\)\.catch\(\(\) => \{[\s\S]*dashEmit\("chats-updated"\);[\s\S]*\}\)\.finally\(\(\) => \{[\s\S]*if \(this\.opts\.onDone\) this\.opts\.onDone\(\);[\s\S]*resolve\(''\);/);
    assert.match(wsClient, /resume\(chatId, taskId\) \{[\s\S]*case 'chat\.done': \{[\s\S]*this\._pullMessages\(chatId, \{ final: true \}\)\.then\(\(\) => \{[\s\S]*dashEmit\("chats-updated"\);[\s\S]*\}\)\.catch\(\(\) => \{[\s\S]*dashEmit\("chats-updated"\);[\s\S]*\}\)\.finally\(\(\) => \{[\s\S]*this\.opts\.onDone\(\);/);
  });

  it('extracts an agent generated title from the first final reply', () => {
    let note = buildChatTitleRequestNote('ru');
    let parsed = extractChatTitleFromAgentText([
      'Готово. Я настроил синхронизацию.',
      '',
      '<chat-title>Синхронизация чатов</chat-title>',
    ].join('\n'));
    let compact = extractChatTitleFromAgentText(
      'Done.\n<chat-title>**Very long generated chat title with many extra words after limit**</chat-title>'
    );

    assert.match(note, /<chat-title>Короткое название<\/chat-title>/);
    assert.match(note, /первое сообщение нового чата/);
    assert.equal(parsed.title, 'Синхронизация чатов');
    assert.equal(parsed.text, 'Готово. Я настроил синхронизацию.');
    assert.equal(parsed.changed, true);
    assert.equal(compact.title, 'Very long generated chat title with many extra');
  });

  it('keeps a visible voice preview when recording cannot start or produce text', () => {
    let source = fs.readFileSync(path.join(ROOT, 'web/panels/AgentChat/AgentChat.js'), 'utf8');
    let template = fs.readFileSync(path.join(ROOT, 'web/panels/AgentChat/AgentChat.tpl.js'), 'utf8');
    let styles = fs.readFileSync(path.join(ROOT, 'web/panels/AgentChat/AgentChat.css.js'), 'utf8');

    assert.match(template, /<chat-workspace[\s\S]*sidebar="hidden"/);
    assert.equal(template.includes('<chat-composer'), false, 'AgentChat must not assemble composer directly');
    assert.equal(template.includes('<chat-transcript'), false, 'AgentChat must not assemble transcript directly');
    assert.equal(template.includes('<cell-bg'), false, 'AgentChat must not assemble animated background directly');
    assert.equal(template.includes('chatView'), false, 'AgentChat must not own chat empty-state view refs');
    assert.equal(fs.existsSync(path.join(ROOT, 'web/panels/AgentChat/ChatMessageItem.js')), false, 'AgentChat must not keep ChatMessageItem re-export shims');
    assert.equal(styles.includes('.chat-view'), false, 'AgentChat must not keep product-local chat view CSS');
    assert.equal(styles.includes('chat-composer .composer-body'), false, 'AgentChat must leave composer internals to symbiote-ui');
    assert.match(source, /_getWorkspace\(\)/);
    assert.match(source, /_getWorkspace\(\)\?\.setComposerState\?\.\(\{/);
    assert.match(source, /_getWorkspace\(\)\?\.setEmpty\?\.\(!hasMessages\)/);
    assert.match(source, /chat-workspace-input/);
    assert.match(source, /chat-workspace-key/);
    assert.match(source, /chat-workspace-submit/);
    assert.match(source, /chat-workspace-send/);
    assert.match(source, /chat-workspace-voice-intent/);
    assert.match(source, /chat-workspace-footer-intent/);
    assert.match(source, /chat-workspace-context-intent/);
    assert.match(source, /_buildVoiceControlsConfig\(\)/);
    assert.match(source, /_getWorkspace\(\)\?\.setVoiceControls\?\.\(this\._buildVoiceControlsConfig\(\)\)/);
    assert.match(source, /suspendLayout\(\)/);
    assert.match(source, /resumeLayout\(\)/);
    assert.match(source, /this\._voiceController\.stopWake\(\);/);
    assert.match(source, /this\._voiceController\.cancelSpeech\(\);/);
    assert.match(source, /if \(this\._resumeWakeAfterLayoutSuspend && this\._wakeModeEnabled\) \{/);
    assert.match(source, /composerFooterControls: \[\]/);
    assert.match(source, /footerControls: this\.\$\.composerFooterControls \|\| \[\]/);
    assert.match(source, /if \(detail\.sourceEvent === 'chat-composer-footer-control-change'\) return;/);
    assert.match(source, /if \(detail\.id === 'settings'\) \{/);
    assert.equal(source.includes('composerFooterHtml'), false);
    assert.equal(source.includes('footerHtml: this.$.composerFooterHtml'), false);
    assert.equal(source.includes('setFooterHtml'), false);
    assert.match(source, /let controls = paramsToMap\.map\(p => \{/);
    assert.match(source, /let priority = this\._composerParamPriorityValue\(p\.id\);/);
    assert.match(source, /kind: 'select'/);
    assert.match(source, /kind: 'checkbox'/);
    assert.match(source, /id: 'settings'/);
    assert.match(source, /this\.\$\.composerFooterControls = controls;/);
    assert.match(source, /this\.\$\.composerFooterControls = \[\];/);
    assert.match(source, /_composerParamPriorityValue\(paramId\)/);
    assert.equal(source.includes("composer.querySelector('.composer-body:not(.voice-preview)')"), false);
    assert.equal(source.includes("querySelector('.voice-preview-body')"), false);
    assert.equal(source.includes('document.createElement(\'button\')'), false);
    assert.equal(source.includes('_micBtn'), false);
    assert.equal(source.includes('_wakeBtn'), false);
    assert.equal(source.includes('_voiceResponseBtn'), false);
    assert.equal(source.includes('_voiceCommandBtn'), false);
    assert.equal(source.includes('_voiceLanguageBtn'), false);
    assert.equal(source.includes('btn-mic'), false);
    assert.equal(source.includes('btn-wake-listen'), false);
    assert.equal(source.includes('btn-voice-response'), false);
    assert.equal(source.includes('btn-voice-command'), false);
    assert.equal(source.includes('btn-voice-language'), false);
    assert.match(source, /_showVoicePreview\('recording'\);\s+this\._startVoiceUiTimer\(\);\s+this\._audioRecorder\.setLanguage\(this\._voiceRecognitionLanguage\(\)\);\s+await this\._audioRecorder\.start\(\);/);
    assert.match(source, /_ensureVoicePreview\(mode = 'recording'\)/);
    assert.match(source, /_startVoiceUiTimer\(\)/);
    assert.match(source, /_formatVoiceElapsed\(elapsed = 0\)/);
    assert.match(source, /status: this\._formatVoiceElapsed\(seconds\)/);
    assert.match(source, /text: this\._voiceInterimText \|\| ''/);
    assert.match(source, /case 'chat-composer-voice-approve':\s+this\._stopRecording\(\{ autoSend: true \}\);/);
    assert.match(source, /async _stopRecording\(\{ autoSend = false, textOverride = '' \} = \{\}\)/);
    assert.match(source, /if \(autoSend\) \{\s+this\._removeVoicePreview\(\);\s+this\._getComposer\(\)\?\.setValue\?\.\(text\);/);
    assert.match(source, /this\._sendMessage\(\{ voiceTranscribed: true \}\);/);
    assert.match(source, /_voiceTranscriptionPromptNote\(\)/);
    assert.match(source, /return tPortal\('settings\.voice\.transcriptionNote'\);/);
    assert.match(source, /_buildAgentPrompt\(prompt, \{ voiceTranscribed = false, requestChatTitle = false \} = \{\}\)/);
    assert.match(source, /if \(voiceTranscribed\) parts\.push\(this\._voiceTranscriptionPromptNote\(\)\);/);
    assert.match(source, /if \(requestChatTitle\) \{/);
    assert.match(source, /_extractVoiceCommandText\(text = ''\)/);
    assert.match(source, /_loadVoiceInputSettings\(\)/);
    assert.match(source, /mergeServerVoiceSettings/);
    assert.match(source, /normalizeVoiceCommandSettings\(settings\?\.voiceInput\)/);
    assert.match(source, /_defaultVoiceCommandPhrases\(\)/);
    assert.match(source, /_defaultVoiceActionPhrases\(\)/);
    assert.match(source, /defaultVoiceActionCommandPhrases\(\)/);
    assert.match(source, /this\._voiceActionCommandPhrases = commandSettings\.actionCommands/);
    assert.match(source, /_defaultWakeCommandPhrases\(\)/);
    assert.match(source, /_matchesWakeCommand\(text = ''\)/);
    assert.match(source, /wakeListen: \{/);
    assert.match(source, /commandText: this\._wakeModeEnabled \? tPortal\('settings\.voice\.sayCommand', \{ command \}\) : ''/);
    assert.match(source, /response: \{/);
    assert.match(source, /command: \{/);
    assert.match(source, /language: \{/);
    assert.match(source, /this\._audioRecorder\.onStateChange = \(\) => \{[\s\S]*this\._syncVoiceControls\(\);/);
    assert.match(source, /VoiceController\.hasSpeechSynthesis/);
    assert.doesNotMatch(source, /_wakeRecognition/);
    assert.match(source, /_toggleVoiceResponseMode\(\)/);
    assert.match(source, /_syncVoiceCommandButton\(\)/);
    assert.match(source, /_voiceCommandHints\(\)/);
    assert.match(source, /_extractVoiceCommandAction\(text = ''\)/);
    assert.match(source, /matchVoiceCommandAtEnd\(value, candidates\)/);
    assert.match(source, /_getWakeCommandCandidates\(\)/);
    assert.match(source, /wakeCommandCandidates\(this\._wakeCommandPhrases \|\| this\._defaultWakeCommandPhrases\(\), this\._voiceCommandLocale\(\)\)/);
    assert.match(source, /matchVoiceCommandInText\(text, this\._getWakeCommandCandidates\(\)\)\.matched/);
    assert.match(source, /from 'symbiote-ui\/ui';/);
    assert.match(source, /new VoiceRuntime\(\)/);
    assert.match(source, /blobToBase64\(result\.blob\)/);
    assert.equal(source.includes('../../common/voice-input-defaults.js'), false);
    assert.equal(source.includes('../../services/audio-recorder.js'), false);
    assert.doesNotMatch(source, /_escapeRegExp/);
    assert.match(source, /command\.matched && !this\._voiceCommandHandling && !this\._voiceCommandTriggered/);
    assert.match(source, /_handleVoiceCommandAction\(command\)/);
    assert.match(source, /_speakPendingAgentResponse\(\)/);
    assert.match(source, /_saveVoiceInputModeSettings\(\)/);
    assert.match(source, /this\._voiceResponseLastAgentKey = current\?\.key \|\| ''/);
    assert.match(source, /if \(!this\._wakeModeEnabled \|\| !this\._voiceResponseEnabled \|\| this\._isSending\) return;/);
    assert.match(source, /_setSending\(active, \{ speak = true \} = \{\}\)/);
    assert.match(source, /if \(!active && speak\) this\._speakPendingAgentResponse\(\);/);
    assert.match(source, /this\._setSending\(false, \{ speak: false \}\);/);
    assert.match(source, /onError: \(_errText\) => \{[\s\S]*this\._setSending\(false, \{ speak: false \}\);/);
    assert.doesNotMatch(source, /sub\('messages'[\s\S]{0,240}_speakPendingAgentResponse\(\)/);
    assert.match(source, /_snapshotVoiceResponseBaseline\(\)/);
    assert.match(source, /this\._snapshotVoiceResponseBaseline\(\);\s+this\.\$\.messages = \[\.\.\.this\.\$\.messages, \{ role: 'user', text: prompt \}\];/);
    assert.match(source, /function sameChatMessages\(next = \[\], current = \[\]\)/);
    assert.match(source, /JSON\.stringify\(message\) === JSON\.stringify\(current\[index\]\)/);
    assert.doesNotMatch(source, /m\.text === cur\[i\]\?\.text && m\.role === cur\[i\]\?\.role/);
    assert.match(source, /let command = this\._getWakeCommandPhrase\(\);/);
    assert.match(source, /tPortal\('settings\.voice\.sayCommand', \{ command \}\)/);
    assert.match(source, /_normalizeVoiceLanguageMode\(mode = 'auto'\)/);
    assert.match(source, /_voiceRecognitionLanguage\(\)/);
    assert.match(source, /_voiceCommandLocale\(\)/);
    assert.match(source, /_autoVoiceLocale\(\)/);
    assert.match(source, /_setVoiceLanguageMode\(mode\)/);
    assert.match(source, /case 'chat-composer-voice-language-change':\s+this\._setVoiceLanguageMode\(detail\.mode\);/);
    assert.match(source, /this\._syncVoiceLanguageButton\(\);/);
    assert.match(source, /let recognitionAvailable = Boolean\(this\._audioRecorder\.hasSpeechRecognition\);/);
    assert.match(source, /_voiceControlActive\(\) \{/);
    assert.match(source, /return this\._wakeModeEnabled \|\| \['starting', 'recording'\]\.includes\(this\._audioRecorder\.state\);/);
    assert.match(source, /let active = this\._voiceControlActive\(\);/);
    assert.match(source, /visible: recognitionAvailable && active/);
    assert.match(source, /this\._audioRecorder\.restartSpeechRecognition\(language\);/);
    assert.match(source, /let locale = this\._voiceCommandLocale\(\);/);
    assert.match(source, /getLanguage: \(\) => this\._voiceRecognitionLanguage\(\),/);
    assert.match(source, /onSpeechEnd: \(\) => \{[\s\S]*this\._resumeWakeListeningAfterRecording\(\);[\s\S]*this\._syncVoiceResponseButton\(\);/);
    assert.match(source, /error === 'not-supported'[\s\S]*Continuous listening requires browser speech recognition\./);
    assert.match(source, /\['not-allowed', 'service-not-allowed', 'not-supported', 'start-failed'\]\.includes\(error\)/);
    assert.match(source, /this\._audioRecorder\.setLanguage\(this\._voiceRecognitionLanguage\(\)\);/);
    assert.match(source, /this\._syncWakeButton\(\);[\s\S]*this\._audioRecorder\.setLanguage\(language\);[\s\S]*restartSpeechRecognition\(language\);[\s\S]*if \(this\._wakeModeEnabled && !this\._wakePausedForRecording\) \{\s+this\._restartWakeListening\(\);/);
    assert.match(source, /_restartWakeListening\(\)/);
    assert.match(source, /_triggerVoiceInputFromWake\(\)/);
    assert.match(source, /this\._toggleRecording\(\{ reloadSettings: false \}\);/);
    assert.match(source, /async _toggleRecording\(\{ reloadSettings = true \} = \{\}\)/);
    assert.match(source, /if \(reloadSettings\) \{\s+await this\._loadVoiceInputSettings\(\);\s+\} else \{\s+this\._syncVoiceLanguageButton\(\);/);
    assert.doesNotMatch(source, /new RegExp\(`\(\?:\[\\\\s,\.;:!\?\]\+\|\^\)\(\$\{command\}\)/);
    assert.match(source, /command\.action === 'cancel'/);
    assert.match(source, /command\.action === 'delete'/);
    assert.match(source, /restartSpeechRecognition\(this\._voiceRecognitionLanguage\(\), \{ initialText: '' \}\)/);
    assert.match(source, /command\.action === 'off'/);
    assert.match(source, /this\._stopWakeListening\(\{ disableMode: true \}\);/);
    assert.match(source, /await this\._stopRecording\(\{ autoSend: true, textOverride: command\.text \}\)/);
    assert.match(source, /async _sendMessage\(\{ voiceTranscribed = false \} = \{\}\) \{[\s\S]*if \(this\._isSending\) return;/);
    assert.equal(source.includes('composer.parentElement.insertBefore(preview, composer)'), false);
    assert.match(source, /_showVoiceError\(message\)/);
    assert.match(source, /_isMicrophonePermissionPrompt\(\)/);
    assert.match(source, /tPortal\('settings\.voice\.refreshAfterPermission'\)/);
    assert.match(source, /this\._voicePermissionPromptBeforeStart/);
    assert.equal(source.includes('Microphone access denied. Check browser microphone permissions.'), true);
    assert.equal(source.includes('No speech detected. Try again.'), true);
    assert.match(source, /this\._showVoiceError\('Transcription failed\. Try again\.'\);/);

    let settingsSource = fs.readFileSync(path.join(ROOT, 'web/panels/SettingsPanel/SettingsPanel.js'), 'utf8');
    assert.match(settingsSource, /sendByCommandEnabled: Boolean\(current\.sendByCommandEnabled\)/);
    assert.match(settingsSource, /voiceResponseEnabled: Boolean\(current\.voiceResponseEnabled\)/);
    assert.match(settingsSource, /languageMode: \['auto', 'ru', 'es', 'en'\]\.includes\(current\.languageMode\)/);
    assert.match(settingsSource, /normalizeVoiceCommandSettings\(raw\)/);
    assert.match(settingsSource, /this\.ref\.voiceCancelCommandRuInput\.value/);
    assert.match(settingsSource, /this\.ref\.voiceDeleteCommandRuInput\.value/);
    assert.match(settingsSource, /this\.ref\.voiceOffCommandRuInput\.value/);
    assert.match(settingsSource, /\.\.\.normalizeVoiceCommandSettings\(\{/);
    assert.doesNotMatch(settingsSource, /defaultVoiceCommands/);
    assert.doesNotMatch(settingsSource, /parseVoiceCommandList/);
    assert.doesNotMatch(settingsSource, /normalizeWakeCommandPhrase/);

    assert.equal(fs.existsSync(path.join(ROOT, 'web/services/audio-recorder.js')), false);
  });
});
