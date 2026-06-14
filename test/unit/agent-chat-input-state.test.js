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
    assert.match(source, /let chat = await this\._fetchChatMeta\(chatId\);/);
    assert.match(source, /let page = await this\._fetchMessagePage\(chatId\);/);
    assert.match(source, /_setLoadedChatParams\(chat\)/);
    assert.match(source, /this\._loadingChatState = true;/);
    assert.match(source, /if \(chatId && !this\._loadingChatState\) \{/);
  });

  it('loads large chats through message windows instead of full transcript pulls', () => {
    let agentChat = fs.readFileSync(path.join(ROOT, 'web/panels/AgentChat/AgentChat.js'), 'utf8');
    let wsClient = fs.readFileSync(path.join(ROOT, 'web/services/chat-ws-client.js'), 'utf8');

    assert.match(agentChat, /const CHAT_MESSAGE_PAGE_LIMIT = 100;/);
    assert.match(agentChat, /messageWindow: null/);
    assert.match(agentChat, /pullMessages: \(chatId, detail\) => this\._pullVisibleMessageWindow\(chatId, detail\),/);
    assert.match(agentChat, /chat-workspace-load-older/);
    assert.match(agentChat, /body: JSON\.stringify\(\{ id: chatId, includeMessages: false \}\)/);
    assert.match(agentChat, /fetch\('\/api\/chats\/messages\/page'/);
    assert.match(agentChat, /workspace\.replaceMessageWindow\(items, messageWindow\)/);
    assert.match(agentChat, /workspace\.prependMessages\(items, nextWindow\)/);
    assert.match(agentChat, /'messageCount'/);
    assert.match(agentChat, /let fullChat = await this\._fetchFullChat\(chatId\);/);
    assert.match(agentChat, /messagesToPersist = this\._applyAgentGeneratedChatTitle\(chatId, \[\.\.\.fullMessages, \.\.\.generatedMessages\]\);/);
    assert.match(wsClient, /pullMessages: \(chatId, \{ final \}\) => Promise<void>/);
    assert.match(wsClient, /if \(this\.opts\.pullMessages\) \{[\s\S]*await this\.opts\.pullMessages\(chatId, detail\);[\s\S]*return;[\s\S]*\}/);
    assert.match(wsClient, /dashEmit\("chat-live-updated", \{[\s\S]*source: "pull"/);
  });

  it('cleans chat websocket timers and listeners on terminal events', () => {
    let wsClient = fs.readFileSync(path.join(ROOT, 'web/services/chat-ws-client.js'), 'utf8');

    assert.match(wsClient, /let timeout = null;/);
    assert.match(wsClient, /let cleanup = \(\) => \{[\s\S]*clearTimeout\(timeout\);[\s\S]*ws\.removeEventListener\('message', onMessage\);[\s\S]*ws\.removeEventListener\('close', onClose\);/);
    assert.match(wsClient, /case 'chat\.done': \{[\s\S]*cleanup\(\);[\s\S]*this\.opts\.onBackgroundToggle\(false\);/);
    assert.match(wsClient, /case 'chat\.error': \{[\s\S]*cleanup\(\);[\s\S]*this\.opts\.onBackgroundToggle\(false\);/);
    assert.match(wsClient, /timeout = setTimeout\(\(\) => \{[\s\S]*cleanup\(\);[\s\S]*this\.opts\.onBackgroundToggle\(false\);/);
    assert.match(wsClient, /resume\(chatId, taskId\) \{[\s\S]*ws\.addEventListener\('message', onMessage\);[\s\S]*if \(ws\.readyState === WebSocket\.OPEN\) \{/);
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
    assert.match(agentChat, /let agentPrompt = this\._buildAgentPrompt\(prompt, \{ voiceTranscribed, requestChatTitle, queuedGoalMessages \}\);/);
    assert.match(agentChat, /buildChatTitleRequestNote\(getLocalization\(\)\.locale\)/);
    assert.match(agentChat, /extractChatTitleFromAgentText\(messages\[index\]\.text\)/);
    assert.match(agentChat, /this\._saveAgentGeneratedChatTitle\(chatId, parsed\.title, nextMessages\);/);
    assert.match(agentChat, /let payload = \{ \.\.\.sendParams, type: adapter, prompt: agentPrompt \};/);
    assert.match(agentChat, /this\._wsClient\.send\(chatId, agentPrompt, sendParams, this\._sessionId\)/);
    assert.match(agentChat, /const DEFAULT_POOL_AGENT = 'orchestrator';/);
    assert.match(agentChat, /meta\.pool\.parameters\.filter\(p => p\.id !== 'agent'\)/);
    assert.match(agentChat, /_getResourceGroupDefaultApprovalMode\(groupName\)/);
    assert.match(agentChat, /this\.\$\.adapterMeta\?\._resourceGroupDefaults\?\.groups/);
    assert.match(agentChat, /updatedParams\.approval_mode = this\._getResourceGroupDefaultApprovalMode\(updatedParams\.resource_group\)/);
    assert.match(agentChat, /updatedParams\.approval_mode = this\._getResourceGroupDefaultApprovalMode\(val\) \|\| updatedParams\.approval_mode;/);
    assert.match(agentChat, /params = this\._normalizePoolChatParams\(params\);/);
    assert.match(agentChat, /delete params\.prompt;/);
    assert.match(agentChat, /if \(params\.resource_group && params\.resource_group !== 'none'\) \{[\s\S]*delete params\.provider;[\s\S]*delete params\.model;[\s\S]*\}/);
    assert.match(agentChat, /if \(hasResourceGroup && \(key === 'provider' \|\| key === 'model'\)\) continue;/);
    assert.match(agentChat, /result\.provider = null;[\s\S]*result\.model = null;/);
    assert.match(wsClient, /let params = \{ \.\.\.chatParams, chatId, prompt \};/);
    assert.match(wsClient, /dashEmit\("chat-live-updated", \{[\s\S]*source: "meta"/);
    assert.match(wsClient, /case 'chat\.done': \{[\s\S]*this\._pullMessages\(chatId, \{ final: true \}\)\.then\(\(\) => \{[\s\S]*dashEmit\("chats-updated"\);[\s\S]*\}\)\.catch\(\(\) => \{[\s\S]*dashEmit\("chats-updated"\);[\s\S]*\}\)\.finally\(\(\) => \{[\s\S]*if \(this\.opts\.onDone\) this\.opts\.onDone\(msg\.params \|\| \{\}\);[\s\S]*resolve\(''\);/);
    assert.match(wsClient, /resume\(chatId, taskId\) \{[\s\S]*case 'chat\.done': \{[\s\S]*this\._pullMessages\(chatId, \{ final: true \}\)\.then\(\(\) => \{[\s\S]*dashEmit\("chats-updated"\);[\s\S]*\}\)\.catch\(\(\) => \{[\s\S]*dashEmit\("chats-updated"\);[\s\S]*\}\)\.finally\(\(\) => \{[\s\S]*this\.opts\.onDone\(msg\.params \|\| \{\}\);/);
  });

  it('wires chat goal intent through composer controls and lifecycle UI', () => {
    let agentChat = fs.readFileSync(path.join(ROOT, 'web/panels/AgentChat/AgentChat.js'), 'utf8');
    let template = fs.readFileSync(path.join(ROOT, 'web/panels/AgentChat/AgentChat.tpl.js'), 'utf8');
    let styles = fs.readFileSync(path.join(ROOT, 'web/panels/AgentChat/AgentChat.css.js'), 'utf8');
    let chatContext = fs.readFileSync(path.join(ROOT, 'web/services/chat-context.js'), 'utf8');
    let wsClient = fs.readFileSync(path.join(ROOT, 'web/services/chat-ws-client.js'), 'utf8');
    let wsServer = fs.readFileSync(path.join(ROOT, 'src/node/proxy/chat-ws-server.js'), 'utf8');

    assert.match(agentChat, /activeGoal: null/);
    assert.match(agentChat, /goalModeActive: false/);
    assert.match(agentChat, /goalQueueNowTitle: tPortal\('chat\.goal\.queueNow'\)/);
    assert.match(agentChat, /isComposerActionMenuOpen: false/);
    assert.match(agentChat, /leadingControls: this\._buildComposerLeadingControls\(\)/);
    assert.match(agentChat, /_handleWorkspaceLeadingIntent\(/);
    assert.match(agentChat, /detail\.anchorRect \|\| null/);
    assert.match(agentChat, /_positionComposerActionMenu\(anchorRect = null\)/);
    assert.match(agentChat, /layoutOverlayStack/);
    assert.match(agentChat, /_syncOverlayStackLayout\(\)/);
    assert.match(agentChat, /element: menu/);
    assert.match(agentChat, /caretTarget: menuAnchor/);
    assert.match(agentChat, /caretProperty: '--composer-action-menu-caret-left'/);
    assert.match(agentChat, /workspace\.setOverlayStackReserve\?\.\(result\.reserveBlockSize \|\| 0\)/);
    assert.match(agentChat, /setOverlayStackReserve/);
    assert.doesNotMatch(agentChat, /measureOverlayStackReserve/);
    assert.doesNotMatch(agentChat, /--composer-action-menu-left/);
    assert.doesNotMatch(agentChat, /--composer-action-menu-top/);
    assert.doesNotMatch(agentChat, /fallbackMenuWidth/);
    assert.match(agentChat, /id: 'actions'/);
    assert.match(agentChat, /icon: 'add'/);
    assert.match(agentChat, /_toggleComposerActionMenu\(anchorRect = null\)/);
    assert.match(agentChat, /onComposerActionClick\(event\)/);
    assert.match(agentChat, /_syncActionMenuDom\(\)/);
    assert.match(agentChat, /item\.setAttribute\('aria-pressed', active \? 'true' : 'false'\)/);
    assert.match(agentChat, /switchEl\.dataset\.active = active \? 'true' : 'false'/);
    assert.match(agentChat, /_handleGoalControl\(\)/);
    assert.match(agentChat, /_setGoalIntentActive\(!this\._isGoalIntentActive\(\)\)/);
    assert.match(agentChat, /goalIntentActive/);
    assert.match(agentChat, /formatChatGoalIntentPromptBlock\(/);
    assert.match(agentChat, /formatChatGoalQueuePromptBlock\(/);
    assert.match(agentChat, /toChatGoalContextItem\(goal\)/);
    assert.match(agentChat, /_handlePulledChat\(chat, detail = \{\}\)[\s\S]*this\.\$\.activeGoal = chat\.activeGoal \|\| null/);
    assert.match(agentChat, /_goalQueueMode\(\)/);
    assert.match(agentChat, /_setGoalQueueMode\(mode/);
    assert.match(agentChat, /_handleInFlightGoalMessage/);
    assert.match(agentChat, /_recordGoalQueueMessage/);
    assert.match(agentChat, /_dispatchNextQueuedGoalMessage/);
    assert.match(agentChat, /\/api\/goals\/queue\/apply/);
    assert.match(agentChat, /promptOverride/);
    assert.match(agentChat, /restartTaskId/);
    assert.match(agentChat, /this\._wsClient\.restart\(chatId, agentPrompt, sendParams, this\._sessionId, restartTaskId\)/);
    assert.match(agentChat, /delete params\.goalQueueMode;/);
    assert.match(agentChat, /'goalQueueMode'/);
    assert.match(agentChat, /pause: '\/api\/goals\/pause'/);
    assert.match(agentChat, /resume: '\/api\/goals\/resume'/);
    assert.match(agentChat, /stop: '\/api\/goals\/stop'/);
    assert.match(agentChat, /delete: '\/api\/goals\/delete'/);
    assert.doesNotMatch(agentChat, /_openGoalPicker\(/);
    assert.doesNotMatch(agentChat, /_createGoalFromInput\(/);
    assert.doesNotMatch(agentChat, /fetch\('\/api\/goals\/select'/);
    assert.equal(agentChat.includes('{{goal'), false);
    assert.match(template, /class="composer-action-menu"/);
    assert.match(template, /data-action="goal"/);
    assert.match(template, /data-action="planning"/);
    assert.match(template, /aria-pressed="false"/);
    assert.match(template, /class="composer-action-switch" data-active="false"/);
    assert.match(template, /class="goal-status"/);
    assert.match(template, /data-goal-action="pause"/);
    assert.match(template, /data-goal-action="resume"/);
    assert.match(template, /data-goal-action="stop"/);
    assert.match(template, /data-goal-action="delete"/);
    assert.match(template, /data-goal-action="queue-goal"/);
    assert.match(template, /data-goal-action="queue-after"/);
    assert.match(template, /data-goal-action="clear-queue"/);
    assert.doesNotMatch(template, /goal-picker/);
    assert.match(styles, /\.composer-action-menu[\s\S]*position: fixed/);
    assert.match(styles, /\.composer-action-menu\[data-overlay-stack-item\]\s*\{[\s\S]*transform: none;/);
    assert.match(styles, /\.goal-status[\s\S]*position: fixed/);
    assert.match(styles, /--sn-overlay-stack-gap/);
    assert.match(styles, /\.goal-status-queue/);
    assert.match(styles, /\.goal-status-action\.mode\[data-active="true"\]/);
    assert.doesNotMatch(styles, /--composer-action-menu-left/);
    assert.doesNotMatch(styles, /--composer-action-menu-top/);
    assert.match(styles, /var\(--sn-panel-bg\)/);
    assert.match(styles, /--composer-action-menu-inline-size[\s\S]*--sn-layout-menu-row-label-width/);
    assert.match(styles, /--composer-action-menu-inline-size[\s\S]*--sn-layout-menu-action-height/);
    assert.match(styles, /calc\(\(var\(--sn-layout-menu-row-label-width, 66px\) \* 3\) \+ \(var\(--sn-layout-menu-action-height, 28px\) \* 2\)\)/);
    assert.match(styles, /--sn-layout-menu-row-height/);
    assert.match(styles, /--sn-layout-menu-action-size/);
    assert.match(styles, /--sn-layout-menu-icon-size/);
    assert.match(styles, /--sn-panel-shadow/);
    assert.match(styles, /composer-action-menu::after/);
    assert.doesNotMatch(agentChat, /_positionGoalStatus/);
    assert.doesNotMatch(styles, /--composer-goal-status-left/);
    assert.doesNotMatch(styles, /--composer-goal-status-top/);
    assert.doesNotMatch(styles, /inline-size: min\(360px/);
    assert.doesNotMatch(styles, /min-block-size: 50px/);
    assert.doesNotMatch(styles, /grid-template-columns: 24px minmax\(0, 1fr\) 44px/);
    assert.doesNotMatch(styles, /var\(--sn-layout-menu-action-height, 28px\) \* 8/);
    assert.doesNotMatch(styles, /var\(--sn-layout-menu-gap, 4px\) \* 5/);
    assert.doesNotMatch(styles, /\* 1\.615/);
    assert.doesNotMatch(styles, /\* 1\.375/);
    assert.doesNotMatch(agentChat, /labelWidth \* 2\) \+ \(actionHeight \* 8/);
    assert.doesNotMatch(styles, /background: color-mix\(in srgb, var\(--sn-bg\) 94%, black\)/);
    assert.match(chatContext, /const GOAL_TYPE_HANDLER/);
    assert.match(chatContext, /'goal': GOAL_TYPE_HANDLER/);

    assert.match(wsClient, /restart\(chatId, prompt, chatParams, sessionId, taskId\)/);
    assert.match(wsClient, /method: 'chat\.restart'/);
    assert.match(wsServer, /msg\.method === 'chat\.restart'/);
    assert.match(wsServer, /async _handleChatRestart\(ws, params\)/);
    assert.match(wsServer, /name: 'cancel_task'[\s\S]*await this\._handleChatSend\(ws, params\);/);
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
    assert.match(source, /for \(let p of paramsToMap\) \{/);
    assert.match(source, /if \(p\.type === 'select' && Array\.isArray\(p\.options\)\) \{/);
    assert.match(source, /p\.id === 'resource_group'/);
    assert.match(source, /p\.id === 'model'/);
    assert.match(source, /currentParams\[p\.id\] = paramValue;/);
    assert.match(source, /Adapter\/resource defaults belong to the chat payload; the composer only keeps compact entry points\./);
    assert.match(source, /leadingControls: this\._buildComposerLeadingControls\(\)/);
    assert.match(source, /this\.\$\.composerFooterControls = this\._buildComposerFooterControls\(\{ settings: true \}\);/);
    assert.match(source, /_buildComposerFooterControls\(\{ settings = true \} = \{\}\)/);
    assert.match(source, /className: 'composer-settings-btn'/);
    assert.equal(source.includes('composer-param'), false);
    assert.equal(source.includes('_composerParamPriorityValue'), false);
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
    assert.match(source, /_buildAgentPrompt\(prompt, \{ voiceTranscribed = false, requestChatTitle = false, queuedGoalMessages = \[\] \} = \{\}\)/);
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
    assert.match(source, /onError: \(_errText, detail = \{\}\) => \{[\s\S]*this\._setSending\(false, \{ speak: false \}\);/);
    assert.doesNotMatch(source, /sub\('messages'[\s\S]{0,240}_speakPendingAgentResponse\(\)/);
    assert.match(source, /_snapshotVoiceResponseBaseline\(\)/);
    assert.match(source, /this\._snapshotVoiceResponseBaseline\(\);\s+this\._appendVisibleMessages\(\[\{ role: 'user', text: prompt \}\], \{ persisted: true \}\);/);
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
    assert.match(source, /isTerminalWakeError,/);
    assert.match(source, /voiceStartErrorMessage,/);
    assert.match(source, /voiceWakeStartErrorMessage,/);
    assert.match(source, /if \(isTerminalWakeError\(error\)\) \{/);
    assert.match(source, /this\._showVoiceError\(voiceWakeStartErrorMessage\(error\)\);/);
    assert.doesNotMatch(source, /_voiceMicrophoneDeniedMessage\(\)/);
    assert.doesNotMatch(source, /_voiceStartErrorMessage\(wasMicrophonePrompt = false\)/);
    assert.doesNotMatch(source, /_voiceWakeStartErrorMessage\(error = ''\)/);
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
    assert.match(source, /async _sendMessage\(\{ voiceTranscribed = false, restartTaskId = '', queuedGoalMessages = \[\], promptOverride = '' \} = \{\}\) \{[\s\S]*if \(this\._isSending && !restartTaskId\) \{[\s\S]*await this\._handleInFlightGoalMessage\(\{ voiceTranscribed \}\);/);
    assert.equal(source.includes('composer.parentElement.insertBefore(preview, composer)'), false);
    assert.match(source, /_showVoiceError\(message\)/);
    assert.match(source, /_isMicrophonePermissionPrompt\(\)/);
    assert.match(source, /tPortal\('settings\.voice\.refreshAfterPermission'\)/);
    assert.match(source, /this\._voicePermissionPromptBeforeStart/);
    assert.match(source, /let message = voiceStartErrorMessage\(\{\s+wasMicrophonePrompt,\s+permissionRefreshMessage: this\._voicePermissionRefreshMessage\(\),\s+\}\);/);
    assert.equal(source.includes('Microphone access denied. Check browser microphone permissions.'), false);
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
