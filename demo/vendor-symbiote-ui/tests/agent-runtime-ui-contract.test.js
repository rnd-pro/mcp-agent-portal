import { acquireCurrentTestFileLock } from './test-lock.js';
await acquireCurrentTestFileLock(import.meta.url);

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseHTML } from 'linkedom';
import { test } from 'node:test';

class TestCSSStyleSheet {
  replaceSync(text) {
    this.cssText = text;
  }
}

function installSsrDom() {
  let { window } = parseHTML('<!doctype html><html><body></body></html>');
  let baseGetComputedStyle = window.getComputedStyle?.bind(window);
  Object.assign(globalThis, {
    window,
    document: window.document,
    HTMLElement: window.HTMLElement,
    Element: window.Element,
    customElements: window.customElements,
    Node: window.Node,
    Event: window.Event,
    CustomEvent: window.CustomEvent,
    MutationObserver: window.MutationObserver,
    CSSStyleSheet: TestCSSStyleSheet,
    getComputedStyle: (el) => {
      let computed = baseGetComputedStyle?.(el) || {};
      return {
        ...computed,
        transitionDuration: computed.transitionDuration || '0s',
        getPropertyValue: (name) => computed.getPropertyValue?.(name) || '',
      };
    },
    requestAnimationFrame: (cb) => setTimeout(cb, 0),
    cancelAnimationFrame: (id) => clearTimeout(id),
  });
  window.document.adoptedStyleSheets = [];
  Object.defineProperty(window.HTMLElement.prototype, 'adoptedStyleSheets', {
    configurable: true,
    get() {
      return this.__symbioteSsrSheets || [];
    },
    set(value) {
      this.__symbioteSsrSheets = value;
    },
  });

  let HTMLTextAreaElement = window.HTMLTextAreaElement || window.HTMLElement;
  if (HTMLTextAreaElement) {
    Object.defineProperty(HTMLTextAreaElement.prototype, 'selectionStart', {
      configurable: true,
      get() {
        return this._selectionStart ?? 0;
      },
      set(val) {
        this._selectionStart = val;
      },
    });
    Object.defineProperty(HTMLTextAreaElement.prototype, 'selectionEnd', {
      configurable: true,
      get() {
        return this._selectionEnd ?? 0;
      },
      set(val) {
        this._selectionEnd = val;
      },
    });
    HTMLTextAreaElement.prototype.setSelectionRange = function (start, end) {
      this.selectionStart = start;
      this.selectionEnd = end;
    };
  }

  Object.defineProperty(window.HTMLElement.prototype, 'scrollHeight', {
    configurable: true,
    get() {
      return this._scrollHeight ?? (this.value ? 250 : 24);
    },
    set(val) {
      this._scrollHeight = val;
    },
  });
  Object.defineProperty(window.HTMLElement.prototype, 'scrollTop', {
    configurable: true,
    get() {
      return this._scrollTop ?? 0;
    },
    set(val) {
      this._scrollTop = val;
    },
  });

  return window;
}

installSsrDom();

const { toChatMessageItem, normalizeChatMessagePart, MESSAGE_PART_KINDS } = await import('../chat/message-model.js');
await import('../chat/ChatMessageItem/ChatMessageItem.js');
const { ChatTranscript } = await import('../chat/ChatTranscript/ChatTranscript.js');
await import('../chat/ChatWorkspace/ChatWorkspace.js');

async function nextRenderTick() {
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
}

function messageItemText(item) {
  return (item.shadowRoot || item).textContent.trim();
}

test('message-part model normalization works', () => {
  assert.equal(MESSAGE_PART_KINDS.TEXT, 'text');
  assert.equal(MESSAGE_PART_KINDS.APPROVAL, 'approval');

  let textPart = normalizeChatMessagePart({ type: 'text', content: 'hello' });
  assert.equal(textPart.type, 'text');
  assert.equal(textPart.text, 'hello');

  let streamPart = normalizeChatMessagePart({ type: 'stream_delta', content: 'world' });
  assert.equal(streamPart.type, 'text_delta');
  assert.equal(streamPart.text, 'world');

  let toolPart = normalizeChatMessagePart({ type: 'tool_call', arguments: '{"limit":0}', output: false });
  assert.deepEqual(toolPart.args, { limit: 0 });
  assert.equal(toolPart.result, false);

  let item1 = toChatMessageItem({ role: 'assistant', text: 'hi' });
  assert.equal(item1.parts.length, 1);
  assert.equal(item1.parts[0].type, 'text');
  assert.equal(item1.parts[0].text, 'hi');

  let itemWithZeroText = toChatMessageItem({ role: 'assistant', text: 0 });
  assert.equal(itemWithZeroText.text, 0);
  assert.equal(itemWithZeroText.parts[0].text, 0);

  let item2 = toChatMessageItem({ role: 'tool', name: 'my_tool', input: { arg: 1 }, result: { ok: true } });
  assert.equal(item2.parts.length, 2);
  assert.equal(item2.parts[0].type, 'tool_call');
  assert.equal(item2.parts[0].name, 'my_tool');
  assert.deepEqual(item2.parts[0].args, { arg: 1 });
  assert.equal(item2.parts[1].type, 'tool_result');
  assert.equal(item2.parts[1].name, 'my_tool');
  assert.deepEqual(item2.parts[1].result, { ok: true });

  let item3 = toChatMessageItem({ role: 'thinking', text: 'thinking...', status: 'loading' });
  assert.equal(item3.parts.length, 1);
  assert.equal(item3.parts[0].type, 'reasoning');
  assert.equal(item3.parts[0].text, 'thinking...');
  assert.equal(item3.parts[0].status, 'loading');

  let item4 = toChatMessageItem({
    role: 'board',
    cardItems: [{ id: '1', title: 'Task 1', status: 'running', statusText: 'working' }]
  });
  assert.equal(item4.parts.length, 1);
  assert.equal(item4.parts[0].type, 'status');
  assert.equal(item4.parts[0].id, '1');
  assert.equal(item4.parts[0].title, 'Task 1');
  assert.equal(item4.parts[0].status, 'running');
  assert.equal(item4.parts[0].text, 'working');
});

test('message parts rendering works', async () => {
  let el = document.createElement('chat-message-item');
  document.body.append(el);

  el.set$({
    role: 'agent',
    done: true,
    parts: [
      { type: 'text', text: 'Here is the result:' },
      { type: 'reasoning', text: 'Still checking', status: 'active' },
      { type: 'reasoning', text: 'I need to check the data first', status: 'done' },
      { type: 'tool_call', name: 'fetch_data', args: { limit: 5 }, id: 'call-1' },
      { type: 'tool_result', name: 'fetch_data', result: { data: [1, 2] }, id: 'call-1' },
      { type: 'source', url: 'https://example.com/doc', title: 'Reference Doc' },
      { type: 'attachment', url: 'https://example.com/image.png', mimeType: 'image/png', title: 'Screenshot' },
      { type: 'artifact', text: 'return "hello";', title: 'Script' },
      { type: 'approval', text: 'Permit action?', id: 'app-1' },
      { type: 'action', title: 'Retry action', id: 'act-1' },
      { type: 'error', text: 'Failed execution' }
    ]
  });

  await nextRenderTick();

  let root = el.shadowRoot || el;
  assert.equal(root.querySelector('.msg-content')?.textContent.trim(), 'Here is the result:');
  assert.match(root.querySelector('.work-summary-wrap')?.textContent || '', /I need to check the data first/);
  let toolCards = root.querySelectorAll('.tool-card');
  assert.equal(toolCards.length, 1);
  assert.equal(toolCards[0].querySelector('.tool-name')?.textContent, 'fetch_data');
  let toolSections = toolCards[0].querySelectorAll('.tool-section');
  assert.equal(toolSections.length, 2);
  assert.match(toolSections[0].textContent || '', /"limit": 5/);
  assert.match(toolSections[1].textContent || '', /"data": \[/);
  assert.equal(root.querySelector('.source-badge a')?.textContent, 'Reference Doc');
  assert.equal(root.querySelector('.attachment-title')?.textContent, 'Screenshot');
  assert.equal(root.querySelector('.artifact-title')?.textContent, 'Script');
  assert.match(root.querySelector('.approval-card')?.textContent || '', /Permit action\?/);
  assert.match(root.querySelector('.action-card')?.textContent || '', /Retry action/);
  assert.match(root.querySelector('.error-card')?.textContent || '', /Failed execution/);
  assert.doesNotMatch(root.textContent || '', /chat\.message\./);

  el.remove();
});

test('only the latest tool message opens its paired tool details', async () => {
  let first = document.createElement('chat-message-item');
  let latest = document.createElement('chat-message-item');
  document.body.append(first, latest);

  first.set$({
    role: 'tool',
    isLatestTool: false,
    parts: [
      { type: 'tool_call', name: 'read_file', args: { path: 'old.js' } },
      { type: 'tool_result', name: 'read_file', result: 'ok' },
    ],
  });
  latest.set$({
    role: 'tool',
    isLatestTool: true,
    parts: [
      { type: 'tool_call', name: 'write_file', args: { path: 'new.js' } },
      { type: 'tool_result', name: 'write_file', result: 'ok' },
    ],
  });

  await nextRenderTick();

  let firstRoot = first.shadowRoot || first;
  let latestRoot = latest.shadowRoot || latest;
  let firstCards = firstRoot.querySelectorAll('.tool-card');
  let latestCards = latestRoot.querySelectorAll('.tool-card');

  assert.equal(firstCards.length, 1);
  assert.equal(latestCards.length, 1);
  assert.equal(firstCards[0].hasAttribute('open'), false);
  assert.equal(latestCards[0].hasAttribute('open'), true);
  assert.match(latestCards[0].textContent || '', /new\.js/);
  assert.match(latestCards[0].textContent || '', /ok/);

  first.remove();
  latest.remove();
});

test('adjacent unnamed tool results stay inside the previous tool card', async () => {
  let el = document.createElement('chat-message-item');
  document.body.append(el);

  el.set$({
    role: 'tool',
    isLatestTool: true,
    parts: [
      { type: 'tool_call', name: 'mcp_tool', args: { goalId: 'goal-1' } },
      { type: 'tool_result', result: { ok: true } },
    ],
  });

  await nextRenderTick();

  let root = el.shadowRoot || el;
  let message = root.querySelector('.message.tool');
  let cards = message.querySelectorAll(':scope > details.tool-card');
  let sections = cards[0].querySelectorAll('.tool-section');

  assert.equal(cards.length, 1);
  assert.equal(cards[0].hasAttribute('open'), true);
  assert.equal(sections.length, 2);
  assert.match(sections[0].textContent || '', /goal-1/);
  assert.match(sections[1].textContent || '', /ok/);

  el.remove();
});

test('legacy tool messages render one paired full-width card in transcripts', async () => {
  let transcript = document.createElement('chat-transcript');
  document.body.append(transcript);

  transcript.setMessageItems([
    toChatMessageItem({
      role: 'tool',
      name: 'mcp_tool',
      input: { goalId: 'goal-1' },
      result: { ok: true },
    }, { isLatestTool: true }),
  ]);

  await nextRenderTick();

  let item = transcript.querySelector('chat-message-item');
  let root = item.shadowRoot || item;
  let message = root.querySelector('.message.tool');
  let cards = message.querySelectorAll(':scope > details.tool-card');
  let sections = cards[0].querySelectorAll('.tool-section');

  assert.equal(cards.length, 1);
  assert.equal(cards[0].hasAttribute('open'), true);
  assert.equal(sections.length, 2);
  assert.match(sections[0].textContent || '', /goal-1/);
  assert.match(sections[1].textContent || '', /ok/);

  transcript.remove();
});

test('tool message cards use a vertical full-width layout', async () => {
  let source = await readFile(
    new URL('../chat/ChatMessageItem/ChatMessageItem.css.js', import.meta.url),
    'utf8',
  );

  assert.match(source, /\.message\.tool\s*\{[^}]*flex-direction:\s*column/s);
  assert.match(source, /\.tool-card\s*\{[^}]*width:\s*100%/s);
});

test('approval and action events are dispatched properly', async () => {
  let transcriptSource = await readFile(new URL('../chat/ChatTranscript/ChatTranscript.js', import.meta.url), 'utf8');
  assert.match(transcriptSource, /new CustomEvent\(type, \{ bubbles: true, composed: true, cancelable: true, detail \}\)/);

  let transcript = document.createElement('chat-transcript');
  document.body.append(transcript);

  transcript.setMessageItems([
    toChatMessageItem({
      role: 'agent',
      parts: [
        { type: 'approval', text: 'Permit action?', id: 'app-1' },
        { type: 'action', title: 'Retry action', id: 'act-1' }
      ]
    })
  ]);

  await nextRenderTick();

  let approvalPromise = new Promise((resolve) => {
    transcript.addEventListener('chat-approval', (event) => {
      resolve({ ...event.detail, event });
    });
  });

  let approveBtn = transcript.querySelector('.approval-btn.approve');
  assert.ok(approveBtn);
  approveBtn.click();

  let approvalDetail = await approvalPromise;
  assert.equal(approvalDetail.id, 'app-1');
  assert.equal(approvalDetail.action, 'approve');
  assert.equal(approvalDetail.event.cancelable, true);
  assert.equal(approvalDetail.event.bubbles, true);

  let actionPromise = new Promise((resolve) => {
    transcript.addEventListener('chat-action', (event) => {
      event.preventDefault();
      resolve({ ...event.detail, event });
    });
  });

  let actBtn = transcript.querySelector('.action-btn');
  assert.ok(actBtn);
  actBtn.click();

  let actionDetail = await actionPromise;
  assert.equal(actionDetail.id, 'act-1');
  assert.equal(actionDetail.action, 'action');
  assert.equal(actionDetail.event.cancelable, true);
  assert.equal(actionDetail.event.bubbles, true);
  assert.equal(actionDetail.event.defaultPrevented, true);

  transcript.remove();
});

test('dual-channel display and llmContent pass through normalization', () => {
  let part = normalizeChatMessagePart({
    type: 'text',
    text: 'plain',
    display: { text: 'Curated card', metaHtml: '<span>m</span>', componentTag: 'x-card', props: { a: 1 } },
    llmContent: 'compact for model',
    payload: { changeId: 'c-1' },
    action: 'change-status',
  });
  assert.equal(part.text, 'plain');
  assert.equal(part.display.text, 'Curated card');
  assert.equal(part.display.metaHtml, '<span>m</span>');
  assert.equal(part.display.componentTag, 'x-card');
  assert.deepEqual(part.display.props, { a: 1 });
  assert.equal(part.llmContent, 'compact for model');
  assert.deepEqual(part.payload, { changeId: 'c-1' });
  assert.equal(part.action, 'change-status');

  let plain = normalizeChatMessagePart({ type: 'text', text: 'hi' });
  assert.equal(plain.display, null);
  assert.equal(plain.llmContent, '');
  assert.equal(plain.payload, null);
});

test('serializeTranscript prefers llmContent then part text', async () => {
  let { serializeTranscript } = await import('../chat/message-model.js');
  let out = serializeTranscript([
    { role: 'user', text: 'hello' },
    { role: 'assistant', parts: [
      { type: 'text', text: 'visible answer', llmContent: 'compact answer' },
      { type: 'confirm', text: 'Confirm?', id: 'c-1' },
    ] },
    { role: 'assistant', llmContent: 'whole-message compact' },
  ]);
  assert.match(out, /hello/);
  assert.match(out, /compact answer/);
  assert.doesNotMatch(out, /visible answer/);
  assert.match(out, /whole-message compact/);
});

test('display.text renders a curated card while plain text is unchanged', async () => {
  let curated = document.createElement('chat-message-item');
  let plain = document.createElement('chat-message-item');
  document.body.append(curated, plain);

  curated.set$({ role: 'agent', parts: [{ type: 'text', text: 'raw', display: { text: 'Curated body', metaHtml: '<span class="meta-chip">ok</span>' } }] });
  plain.set$({ role: 'agent', parts: [{ type: 'text', text: 'raw plain' }] });

  await nextRenderTick();

  let curatedRoot = curated.shadowRoot || curated;
  let plainRoot = plain.shadowRoot || plain;
  assert.ok(curatedRoot.querySelector('.display-card'));
  assert.match(curatedRoot.querySelector('.display-card-body')?.textContent || '', /Curated body/);
  assert.ok(curatedRoot.querySelector('.display-card-meta .meta-chip'));
  assert.equal(curatedRoot.querySelector('.msg-content'), null);
  assert.equal(plainRoot.querySelector('.display-card'), null);
  assert.match(plainRoot.querySelector('.msg-content')?.textContent || '', /raw plain/);

  curated.remove();
  plain.remove();
});

test('confirm part renders an inline pill and emits confirm/cancel events', async () => {
  let itemSource = await readFile(new URL('../chat/ChatMessageItem/ChatMessageItem.js', import.meta.url), 'utf8');
  assert.match(itemSource, /bubbles:\s*true,\s*composed:\s*true/);

  let el = document.createElement('chat-message-item');
  document.body.append(el);
  el.set$({
    role: 'agent',
    parts: [{ type: 'confirm', title: 'Apply status change', text: 'Move to Done?', id: 'chg-1', payload: { to: 'done' } }],
  });

  await nextRenderTick();

  let root = el.shadowRoot || el;
  let pill = root.querySelector('.confirm-pill');
  assert.ok(pill);
  assert.match(pill.textContent || '', /Apply status change/);
  assert.match(pill.textContent || '', /Move to Done\?/);
  assert.doesNotMatch(root.textContent || '', /chat\.message\./);

  let confirmPromise = new Promise((resolve) => {
    el.addEventListener('chat-message-confirm', (event) => resolve({ ...event.detail, event }));
  });
  root.querySelector('.confirm-btn.confirm').click();
  let confirmDetail = await confirmPromise;
  assert.equal(confirmDetail.id, 'chg-1');
  assert.equal(confirmDetail.action, 'confirm');
  assert.deepEqual(confirmDetail.payload, { to: 'done' });
  assert.equal(confirmDetail.event.bubbles, true);

  el.remove();

  let cancelEl = document.createElement('chat-message-item');
  document.body.append(cancelEl);
  cancelEl.set$({
    role: 'agent',
    parts: [{ type: 'confirm', title: 'Apply status change', text: 'Move to Done?', id: 'chg-1', payload: { to: 'done' } }],
  });

  await nextRenderTick();

  let cancelRoot = cancelEl.shadowRoot || cancelEl;
  let cancelPromise = new Promise((resolve) => {
    cancelEl.addEventListener('chat-message-cancel', (event) => resolve({ ...event.detail, event }));
  });
  cancelRoot.querySelector('.confirm-btn.cancel').click();
  let cancelDetail = await cancelPromise;
  assert.equal(cancelDetail.id, 'chg-1');
  assert.equal(cancelDetail.action, 'cancel');
  assert.deepEqual(cancelDetail.payload, { to: 'done' });
  assert.equal(cancelDetail.event.bubbles, true);

  cancelEl.remove();
});

test('tool-result envelope normalizes summary/warnings and keeps raw results back-compatible', () => {
  let envelopePart = normalizeChatMessagePart({
    type: 'tool_result',
    name: 'apply_change',
    result: {
      _kind: 'tool-result/v1',
      summary: 'Moved card to Done',
      warnings: ['column was near WIP limit'],
      data: { id: 'card-1', status: 'done' },
    },
  });
  assert.equal(envelopePart.summary, 'Moved card to Done');
  assert.deepEqual(envelopePart.warnings, ['column was near WIP limit']);
  assert.deepEqual(envelopePart.result, { id: 'card-1', status: 'done' });

  let rawPart = normalizeChatMessagePart({
    type: 'tool_result',
    name: 'apply_change',
    result: { id: 'card-1', status: 'done' },
  });
  assert.equal(rawPart.summary, '');
  assert.deepEqual(rawPart.warnings, []);
  assert.deepEqual(rawPart.result, { id: 'card-1', status: 'done' });

  let legacyItem = toChatMessageItem({
    role: 'tool',
    name: 'apply_change',
    result: { _kind: 'tool-result/v1', summary: 'Saved', warnings: ['stale read'], data: { ok: true } },
  });
  let legacyResult = legacyItem.parts.find((p) => p.type === 'tool_result');
  assert.equal(legacyResult.summary, 'Saved');
  assert.deepEqual(legacyResult.warnings, ['stale read']);
  assert.deepEqual(legacyResult.result, { ok: true });
});

test('tool_result envelope renders a prominent summary, warning list, and collapsed data', async () => {
  let el = document.createElement('chat-message-item');
  document.body.append(el);

  el.set$({
    role: 'tool',
    isLatestTool: true,
    parts: [
      normalizeChatMessagePart({
        type: 'tool_result',
        name: 'apply_change',
        result: {
          _kind: 'tool-result/v1',
          summary: 'Moved card to Done',
          warnings: ['column was near WIP limit', 'assignee unchanged'],
          data: { id: 'card-1', status: 'done' },
        },
      }),
    ],
  });

  await nextRenderTick();

  let root = el.shadowRoot || el;
  let card = root.querySelector('.tool-card');
  assert.ok(card);
  assert.equal(card.tagName.toLowerCase(), 'details');
  assert.match(root.querySelector('.tool-result-summary')?.textContent || '', /Moved card to Done/);
  let warnings = root.querySelectorAll('.tool-warning');
  assert.equal(warnings.length, 2);
  assert.match(warnings[0].textContent || '', /near WIP limit/);
  assert.ok(warnings[0].querySelector('.tool-warning-icon'));
  let resultSection = card.querySelector('.tool-section .tool-code');
  assert.match(resultSection?.textContent || '', /"status": "done"/);
  assert.doesNotMatch(root.textContent || '', /tool-result\/v1/);

  el.remove();
});

test('raw (non-envelope) tool_result renders unchanged', async () => {
  let el = document.createElement('chat-message-item');
  document.body.append(el);

  el.set$({
    role: 'tool',
    isLatestTool: true,
    parts: [{ type: 'tool_result', name: 'apply_change', result: { id: 'card-1', status: 'done' } }],
  });

  await nextRenderTick();

  let root = el.shadowRoot || el;
  assert.equal(root.querySelector('.tool-result-summary'), null);
  assert.equal(root.querySelectorAll('.tool-warning').length, 0);
  assert.match(root.querySelector('.tool-code')?.textContent || '', /"status": "done"/);

  el.remove();
});

test('confirm part becomes decided and disables buttons after a click', async () => {
  let el = document.createElement('chat-message-item');
  document.body.append(el);
  el.set$({
    role: 'agent',
    parts: [{ type: 'confirm', title: 'Apply status change', text: 'Move to Done?', id: 'chg-2', payload: { to: 'done' } }],
  });

  await nextRenderTick();

  let root = el.shadowRoot || el;
  let confirmBtn = root.querySelector('.confirm-btn.confirm');
  let cancelBtn = root.querySelector('.confirm-btn.cancel');
  assert.equal(confirmBtn.disabled, false);
  assert.equal(cancelBtn.disabled, false);

  let confirmEvents = 0;
  el.addEventListener('chat-message-confirm', (event) => {
    confirmEvents += 1;
    assert.equal(event.detail.id, 'chg-2');
    assert.equal(event.detail.action, 'confirm');
    assert.deepEqual(event.detail.payload, { to: 'done' });
  });

  confirmBtn.click();
  await nextRenderTick();

  assert.equal(confirmEvents, 1);
  let pill = root.querySelector('.confirm-pill');
  assert.ok(pill.classList.contains('resolved'));
  assert.equal(pill.getAttribute('data-resolved'), 'confirm');
  let resolvedConfirm = root.querySelector('.confirm-btn.confirm');
  let resolvedCancel = root.querySelector('.confirm-btn.cancel');
  assert.equal(resolvedConfirm.disabled, true);
  assert.equal(resolvedCancel.disabled, true);
  assert.ok(resolvedConfirm.classList.contains('is-chosen'));

  resolvedConfirm.click();
  await nextRenderTick();
  assert.equal(confirmEvents, 1);

  el.remove();
});

test('confirm part renders decided state directly from a resolved field', async () => {
  let el = document.createElement('chat-message-item');
  document.body.append(el);
  el.set$({
    role: 'agent',
    parts: [{ type: 'confirm', title: 'Apply change', id: 'chg-3', resolved: 'cancel' }],
  });

  await nextRenderTick();

  let root = el.shadowRoot || el;
  let pill = root.querySelector('.confirm-pill');
  assert.ok(pill.classList.contains('resolved'));
  assert.equal(pill.getAttribute('data-resolved'), 'cancel');
  assert.equal(root.querySelector('.confirm-btn.confirm').disabled, true);
  assert.ok(root.querySelector('.confirm-btn.cancel').classList.contains('is-chosen'));

  el.remove();
});

test('ChatTranscript stream auto-pin behavior works', async () => {
  let transcript = document.createElement('chat-transcript');
  document.body.append(transcript);

  let scrollToBottomCalls = 0;
  transcript.scrollToBottom = () => {
    scrollToBottomCalls += 1;
  };

  transcript.isAtBottom = () => true;

  transcript.setMessageItems([
    toChatMessageItem({ role: 'user', text: 'hello' })
  ]);

  await nextRenderTick();
  assert.equal(scrollToBottomCalls, 1);

  scrollToBottomCalls = 0;
  transcript.isAtBottom = () => false;

  transcript.setMessageItems([
    toChatMessageItem({ role: 'user', text: 'hello' }),
    toChatMessageItem({ role: 'agent', text: 'hi' })
  ]);

  await nextRenderTick();
  assert.equal(scrollToBottomCalls, 0);

  transcript.remove();
});

test('ChatTranscript message windows can replace and prepend without using host chat state', async () => {
  let transcript = document.createElement('chat-transcript');
  document.body.append(transcript);

  transcript.replaceMessageWindow([
    toChatMessageItem({ role: 'assistant', text: 'message-2' }),
    toChatMessageItem({ role: 'assistant', text: 'message-3' }),
  ], {
    startIndex: 2,
    totalItems: 5,
  });

  await nextRenderTick();
  assert.deepEqual(
    Array.from(transcript.querySelectorAll('chat-message-item')).map(messageItemText),
    ['message-2', 'message-3'],
  );
  assert.deepEqual(transcript.getMessageWindow(), {
    startIndex: 2,
    count: 2,
    totalItems: 5,
    hasOlder: true,
    hasNewer: true,
  });

  transcript.prependMessageItems([
    toChatMessageItem({ role: 'user', text: 'message-0' }),
    toChatMessageItem({ role: 'user', text: 'message-1' }),
  ], {
    startIndex: 0,
    totalItems: 5,
    hasOlder: false,
    hasNewer: true,
  });

  await nextRenderTick();
  assert.deepEqual(
    Array.from(transcript.querySelectorAll('chat-message-item')).map(messageItemText),
    ['message-0', 'message-1', 'message-2', 'message-3'],
  );
  assert.deepEqual(transcript.getMessageWindow(), {
    startIndex: 0,
    count: 4,
    totalItems: 5,
    hasOlder: false,
    hasNewer: true,
  });

  transcript.setMessageItems([
    toChatMessageItem({ role: 'assistant', text: 'full-reset' }),
  ]);
  assert.deepEqual(transcript.getMessageWindow(), {
    startIndex: 0,
    count: 1,
    totalItems: 1,
    hasOlder: false,
    hasNewer: false,
  });

  transcript.remove();
});

test('ChatWorkspace forwards transcript window APIs and load older events', async () => {
  let workspace = document.createElement('chat-workspace');
  document.body.append(workspace);
  await nextRenderTick();

  workspace.replaceMessageWindow([
    toChatMessageItem({ role: 'assistant', text: 'workspace-message-1' }),
  ], {
    startIndex: 1,
    totalItems: 3,
  });

  await nextRenderTick();
  assert.deepEqual(workspace.getMessageWindow(), {
    startIndex: 1,
    count: 1,
    totalItems: 3,
    hasOlder: true,
    hasNewer: true,
  });

  workspace.prependMessages([
    toChatMessageItem({ role: 'user', text: 'workspace-message-0' }),
  ], {
    startIndex: 0,
    totalItems: 3,
  });

  await nextRenderTick();
  assert.deepEqual(
    Array.from(workspace.getTranscript().querySelectorAll('chat-message-item')).map(messageItemText),
    ['workspace-message-0', 'workspace-message-1'],
  );

  let eventPromise = new Promise((resolve) => {
    workspace.addEventListener('chat-workspace-load-older', (event) => resolve(event.detail));
  });
  workspace.getTranscript().dispatchEvent(new CustomEvent('chat-transcript-load-older', {
    bubbles: true,
    composed: true,
    detail: { fromIndex: 0 },
  }));

  let detail = await eventPromise;
  assert.equal(detail.fromIndex, 0);
  assert.equal(detail.sourceEvent, 'chat-transcript-load-older');

  workspace.remove();
});

test('actions and embed parts normalize to forward-compatible shapes', () => {
  assert.equal(MESSAGE_PART_KINDS.ACTIONS, 'actions');
  assert.equal(MESSAGE_PART_KINDS.EMBED, 'embed');

  let actionsPart = normalizeChatMessagePart({
    type: 'actions',
    id: 'act-1',
    payload: { ref: 'r-1' },
    actions: [
      { id: 'approve', label: 'Approve', icon: 'check', variant: 'primary' },
      { id: 'open', title: 'Open panel' },
      { label: 'missing id' },
      { id: 'no-label' },
      'not-an-object',
    ],
  });
  assert.equal(actionsPart.type, 'actions');
  assert.equal(actionsPart.id, 'act-1');
  assert.deepEqual(actionsPart.payload, { ref: 'r-1' });
  assert.deepEqual(actionsPart.actions, [
    { id: 'approve', label: 'Approve', icon: 'check', variant: 'primary' },
    { id: 'open', label: 'Open panel', icon: '', variant: '' },
  ]);

  let embedPart = normalizeChatMessagePart({ type: 'embed', key: 'live-1', title: 'Live widget' });
  assert.equal(embedPart.type, 'embed');
  assert.equal(embedPart.key, 'live-1');
  assert.equal(embedPart.title, 'Live widget');
});

test('actions part renders buttons and emits chat-message-action with the right actionId', async () => {
  let el = document.createElement('chat-message-item');
  document.body.append(el);
  el.set$({
    role: 'agent',
    parts: [{
      type: 'actions',
      id: 'act-1',
      payload: { ref: 'r-1' },
      actions: [
        { id: 'approve', label: 'Approve', icon: 'check', variant: 'primary' },
        { id: 'snooze', label: 'Snooze' },
      ],
    }],
  });

  await nextRenderTick();

  let root = el.shadowRoot || el;
  let card = root.querySelector('.actions-card');
  assert.ok(card);
  assert.equal(card.dataset.actionsId, 'act-1');
  let buttons = card.querySelectorAll('.action-btn-group');
  assert.equal(buttons.length, 2);
  assert.equal(buttons[0].dataset.actionId, 'approve');
  assert.equal(buttons[0].dataset.variant, 'primary');
  assert.match(buttons[0].textContent || '', /Approve/);
  assert.equal(buttons[1].dataset.actionId, 'snooze');

  let actionPromise = new Promise((resolve) => {
    el.addEventListener('chat-message-action', (event) => resolve({ ...event.detail, event }));
  });
  buttons[1].click();
  let actionDetail = await actionPromise;
  assert.equal(actionDetail.id, 'act-1');
  assert.equal(actionDetail.actionId, 'snooze');
  assert.deepEqual(actionDetail.payload, { ref: 'r-1' });
  assert.equal(actionDetail.event.bubbles, true);

  el.remove();
});

test('embed part exposes a keyed slot and surfaces it through embeds-ready events', async () => {
  let workspace = document.createElement('chat-workspace');
  document.body.append(workspace);
  await nextRenderTick();

  let workspacePromise = new Promise((resolve) => {
    workspace.addEventListener('chat-workspace-embeds-ready', (event) => resolve(event.detail));
  });

  workspace.setMessages([
    toChatMessageItem({
      role: 'assistant',
      parts: [
        { type: 'text', text: 'here is a widget' },
        { type: 'embed', key: 'live-widget-1', title: 'Live widget' },
      ],
    }),
  ]);

  let workspaceDetail = await workspacePromise;
  let forwarded = (workspaceDetail.embeds || []).find((entry) => entry.key === 'live-widget-1');
  assert.ok(forwarded, 'workspace embeds-ready carries the keyed slot');
  assert.equal(workspaceDetail.sourceEvent, 'chat-transcript-embeds-ready');

  let slot = workspace.getTranscript().querySelector('[data-embed-key="live-widget-1"]');
  assert.ok(slot);
  assert.equal(slot.dataset.embedKey, 'live-widget-1');
  assert.equal(forwarded.slot, slot);

  workspace.remove();
});

test('chat composer programmatic updates and background pulse behavior', async () => {
  let workspace = document.createElement('chat-workspace');
  document.body.append(workspace);
  await nextRenderTick();

  let composer = workspace.getComposer();
  let textarea = composer.getInputElement();

  // Initially background should not have triggered animation
  let triggeredEvents = [];
  workspace.addEventListener('chat-workspace-background-change', (event) => {
    triggeredEvents.push(event.detail);
  });
  let composerInputEvents = 0;
  let nativeChangeEvents = 0;
  let nativeInputEvents = 0;
  composer.addEventListener('chat-composer-input', () => composerInputEvents += 1);
  textarea.addEventListener('change', () => nativeChangeEvents += 1);
  textarea.addEventListener('input', () => nativeInputEvents += 1);

  textarea.blur();
  assert.ok(document.activeElement !== textarea);

  let longText = 'a\n'.repeat(50) + 'suffix';
  workspace.setComposerState({ value: longText });

  await nextRenderTick();

  assert.equal(textarea.value, longText);
  assert.equal(textarea.selectionStart, longText.length);
  assert.equal(textarea.selectionEnd, longText.length);
  assert.equal(textarea.style.height, '200px');
  assert.equal(textarea.scrollTop, textarea.scrollHeight);
  assert.ok(document.activeElement !== textarea);
  assert.equal(composerInputEvents, 0);
  assert.equal(nativeChangeEvents, 0);
  assert.equal(nativeInputEvents, 0);
  assert.ok(triggeredEvents.length > 0);
  assert.equal(triggeredEvents[triggeredEvents.length - 1].state, 'trigger');

  triggeredEvents = [];

  workspace.setComposerState({ value: longText });
  await nextRenderTick();
  assert.equal(triggeredEvents.length, 0);

  workspace.setComposerState({ value: '' });
  await nextRenderTick();
  assert.equal(triggeredEvents.length, 0);

  textarea.value = 'user typed text';
  textarea.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
  await nextRenderTick();
  assert.equal(composer.$.value, 'user typed text');
  assert.equal(composerInputEvents, 1);
  assert.equal(nativeInputEvents, 1);
  assert.ok(triggeredEvents.length > 0);
  assert.equal(triggeredEvents[triggeredEvents.length - 1].state, 'trigger');

  triggeredEvents = [];

  composer.setSending(true);
  workspace.setComposerState({ value: 'another draft change' });
  await nextRenderTick();
  assert.equal(triggeredEvents.length, 0);

  composer.dispatchEvent(new CustomEvent('chat-composer-input', {
    bubbles: true,
    composed: true,
    detail: { value: 'user typed text 2', selectionStart: 17 },
  }));
  await nextRenderTick();
  assert.equal(triggeredEvents.length, 0);

  workspace.remove();
});
