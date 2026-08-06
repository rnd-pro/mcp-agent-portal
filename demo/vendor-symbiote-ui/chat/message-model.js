import { escapeHtml, formatElapsed } from '../display/markdown-formatter.js';
import { translate } from '../locale/index.js';

export function buildSessionMetaHtml(text) {
  if (!text) return '';
  let chips = [];
  let modeMatch = text.match(/- Mode:\s*(.+)/i);
  if (modeMatch) {
    let mode = modeMatch[1].trim();
    let iconName = mode === 'yolo' ? 'bolt' : mode === 'plan' ? 'lock' : 'settings';
    chips.push(`<span class="meta-chip"><span class="material-symbols-outlined meta-chip-icon">${iconName}</span> ${escapeHtml(mode)}</span>`);
  }
  let exitMatch = text.match(/- Exit code:\s*(\d+)/i);
  if (exitMatch) {
    let code = parseInt(exitMatch[1]);
    let cls = code === 0 ? 'meta-ok' : 'meta-err';
    chips.push(`<span class="meta-chip ${cls}">${escapeHtml(translate('chat.meta.exit', { code }))}</span>`);
  }
  let sidMatch = text.match(/- Session ID:\s*`([^`]+)`/i);
  if (sidMatch) {
    chips.push(`<span class="meta-chip meta-sid" title="${escapeHtml(sidMatch[1])}">${escapeHtml(sidMatch[1].substring(0, 12))}...</span>`);
  }
  let tokensMatch = text.match(/- Tokens:\s*(\d+)/i);
  if (tokensMatch) {
    chips.push(`<span class="meta-chip meta-info" title="${escapeHtml(translate('chat.meta.tokens'))}">${tokensMatch[1]} tks</span>`);
  }
  let costMatch = text.match(/- Cost:\s*\$?([\d.]+)/i);
  if (costMatch) {
    chips.push(`<span class="meta-chip meta-info" title="${escapeHtml(translate('chat.meta.cost'))}">$${costMatch[1]}</span>`);
  }
  return chips.join('');
}

export function buildWorkMetaHtml(meta) {
  if (!meta) return '';
  let items = [];
  if (meta.mode) {
    let iconName = meta.mode === 'yolo' ? 'bolt' : 'settings';
    items.push(`<span class="meta-chip"><span class="material-symbols-outlined meta-chip-icon">${iconName}</span> ${escapeHtml(meta.mode)}</span>`);
  }
  if (meta.exitCode != null) {
    let cls = meta.exitCode === 0 ? 'meta-ok' : 'meta-err';
    items.push(`<span class="meta-chip ${cls}">${escapeHtml(translate('chat.meta.exit', { code: meta.exitCode }))}</span>`);
  }
  if (meta.sessionId) {
    items.push(`<span class="meta-chip meta-sid" title="${escapeHtml(meta.sessionId)}">${escapeHtml(meta.sessionId.substring(0, 16))}...</span>`);
  }
  if (meta.tools) {
    let key = meta.tools > 1 ? 'chat.meta.toolCalls' : 'chat.meta.toolCall';
    items.push(`<span class="meta-chip">${escapeHtml(translate(key, { count: meta.tools }))}</span>`);
  }
  if (meta.tokens != null) items.push(`<span class="meta-chip meta-info">${meta.tokens} tks</span>`);
  if (meta.cost != null) items.push(`<span class="meta-chip meta-info">$${meta.cost.toFixed(4)}</span>`);
  if (meta.errors) items.push(`<span class="meta-chip meta-err">${escapeHtml(meta.errors)}</span>`);
  return items.join('');
}

export function findPreviousAgentText(messages, fromIndex) {
  for (let i = fromIndex - 1; i >= 0; i--) {
    let msg = messages[i];
    if (normalizeChatMessageRole(msg?.role) === 'agent' && typeof msg.text === 'string' && msg.text.trim()) return msg.text;
    if (msg?.role === 'user') break;
  }
  return '';
}

export function normalizeChatMessageRole(role = '') {
  return role === 'assistant' ? 'agent' : role;
}

function compactText(value, maxLength = 96) {
  let text = String(value ?? '').replace(/\s+/g, ' ').trim();
  if (!text) return '';
  return text.length > maxLength ? `${text.slice(0, maxLength - 3)}...` : text;
}

export function summarizeToolInput(input) {
  if (input == null) return '';
  if (typeof input === 'string') return compactText(input);
  if (typeof input !== 'object') return compactText(input);
  for (let key of ['command', 'description', 'prompt', 'question', 'path', 'file', 'name']) {
    if (typeof input[key] === 'string' && input[key].trim()) return compactText(input[key]);
  }
  return compactText(JSON.stringify(input));
}

export function buildWorkSummaryHtml(msg, copyText) {
  let metaHtml = buildWorkMetaHtml(msg?.meta);
  let bodyHtml = metaHtml ? `<div class="work-body">${metaHtml}</div>` : '';
  let copyBtn = copyText
    ? `<button class="work-copy-btn" type="button" title="${escapeHtml(translate('chat.message.copyResponse'))}" data-copy-text="${escapeHtml(copyText)}"><span class="material-symbols-outlined">content_copy</span></button>`
    : '';
  let elapsed = formatElapsed(msg?.elapsed || 0);
  return `<div class="work-summary-wrap"><details class="work-summary"><summary><span class="material-symbols-outlined work-summary-icon">check_circle</span>${escapeHtml(translate('chat.message.workedFor', { elapsed }))}${copyBtn}</summary>${bodyHtml}</details></div>`;
}

export const MESSAGE_PART_KINDS = {
  TEXT: 'text',
  TEXT_DELTA: 'text_delta',
  STREAM_DELTA: 'stream_delta',
  REASONING: 'reasoning',
  STATUS: 'status',
  TOOL_CALL: 'tool_call',
  TOOL_RESULT: 'tool_result',
  SOURCE: 'source',
  ATTACHMENT: 'attachment',
  ARTIFACT: 'artifact',
  APPROVAL: 'approval',
  ACTION: 'action',
  ACTIONS: 'actions',
  EMBED: 'embed',
  CONFIRM: 'confirm',
  RETRY: 'retry',
  CANCEL: 'cancel',
  ERROR: 'error',
  CANCELLED: 'cancelled',
};

const TOOL_RESULT_ENVELOPE_KIND = 'tool-result/v1';

function isToolResultEnvelope(value) {
  return Boolean(value)
    && typeof value === 'object'
    && !Array.isArray(value)
    && value._kind === TOOL_RESULT_ENVELOPE_KIND;
}

function normalizeEnvelopeWarnings(warnings) {
  if (warnings == null) return [];
  let list = Array.isArray(warnings) ? warnings : [warnings];
  let result = [];
  for (let entry of list) {
    if (entry == null) continue;
    result.push(typeof entry === 'string' ? entry : String(entry));
  }
  return result;
}

function normalizeDisplayPayload(display) {
  if (!display || typeof display !== 'object') return null;
  let next = {};
  if (typeof display.text === 'string') next.text = display.text;
  if (typeof display.metaHtml === 'string') next.metaHtml = display.metaHtml;
  if (typeof display.componentTag === 'string') next.componentTag = display.componentTag;
  if (display.props && typeof display.props === 'object') next.props = display.props;
  return next;
}

function normalizeMessageActions(actions) {
  if (!Array.isArray(actions)) return [];
  let result = [];
  for (let entry of actions) {
    if (!entry || typeof entry !== 'object') continue;
    let id = entry.id != null ? String(entry.id) : '';
    let label = entry.label ?? entry.title ?? entry.text ?? '';
    label = label != null ? String(label) : '';
    if (!id || !label) continue;
    result.push({
      id,
      label,
      icon: entry.icon != null ? String(entry.icon) : '',
      variant: entry.variant != null ? String(entry.variant) : '',
    });
  }
  return result;
}

export function normalizeChatMessagePart(part) {
  if (!part || typeof part !== 'object') {
    return {
      type: 'text',
      text: typeof part === 'string' ? part : String(part ?? ''),
      name: '',
      id: '',
      args: null,
      result: null,
      summary: '',
      warnings: [],
      status: '',
      resolved: '',
      title: '',
      url: '',
      mimeType: '',
      meta: {},
      display: null,
      llmContent: '',
      payload: null,
      action: '',
      actions: [],
      key: '',
    };
  }

  let type = part.type ?? part.kind ?? 'text';
  if (type === 'stream_delta') {
    type = 'text_delta';
  }

  let args = part.args ?? part.arguments ?? part.input ?? null;
  if (type === 'tool_call' && typeof args === 'string') {
    try {
      args = JSON.parse(args);
    } catch {}
  }

  let result = part.result ?? part.output ?? null;
  let summary = '';
  let warnings = [];
  if (type === 'tool_result' && isToolResultEnvelope(result)) {
    summary = typeof result.summary === 'string' ? result.summary : '';
    warnings = normalizeEnvelopeWarnings(result.warnings);
    result = result.data ?? null;
  }

  return {
    type,
    text: part.text ?? part.content ?? part.value ?? '',
    name: part.name ?? '',
    id: part.id ?? part.toolCallId ?? part.tool_call_id ?? '',
    args,
    result,
    summary,
    warnings,
    status: part.status ?? '',
    resolved: part.resolved ?? '',
    title: part.title ?? part.label ?? '',
    url: part.url ?? part.href ?? '',
    mimeType: part.mimeType ?? part.mime ?? part.contentType ?? '',
    meta: part.meta && typeof part.meta === 'object' ? part.meta : {},
    display: normalizeDisplayPayload(part.display),
    llmContent: typeof part.llmContent === 'string' ? part.llmContent : '',
    payload: part.payload ?? null,
    action: part.action ?? '',
    actions: type === 'actions' ? normalizeMessageActions(part.actions) : [],
    key: type === 'embed' ? String(part.key ?? part.slot ?? '') : '',
  };
}

export function partTranscriptText(part) {
  if (!part || typeof part !== 'object') return typeof part === 'string' ? part : '';
  if (typeof part.llmContent === 'string' && part.llmContent) return part.llmContent;
  if (typeof part.text === 'string' && part.text) return part.text;
  if (part.display && typeof part.display.text === 'string') return part.display.text;
  return '';
}

export function serializeTranscript(messages = [], options = {}) {
  let separator = typeof options.separator === 'string' ? options.separator : '\n\n';
  let source = Array.isArray(messages) ? messages : [];
  let lines = [];
  for (let msg of source) {
    if (typeof msg?.llmContent === 'string' && msg.llmContent) {
      lines.push(msg.llmContent);
      continue;
    }
    let parts = Array.isArray(msg?.parts) ? msg.parts : null;
    if (parts) {
      let partText = parts.map(partTranscriptText).filter(Boolean).join(separator);
      if (partText) {
        lines.push(partText);
        continue;
      }
    }
    let text = msg?.text ?? msg?.content ?? '';
    if (text !== '' && text != null) lines.push(String(text));
  }
  return lines.join(separator);
}

export function toChatMessageItem(msg, options = {}) {
  let role = normalizeChatMessageRole(msg?.role ?? msg?.type);
  let parts = [];
  if (Array.isArray(msg?.parts)) {
    parts = msg.parts.map(normalizeChatMessagePart);
  } else {
    if (role === 'tool') {
      if (msg?.name || msg?.input != null) {
        parts.push({
          type: 'tool_call',
          name: msg.name || 'tool',
          args: msg.input,
          id: msg.id || '',
          text: '',
          result: null,
          summary: '',
          warnings: [],
          status: '',
          resolved: '',
          title: '',
          url: '',
          mimeType: '',
          meta: {},
          display: null,
          llmContent: '',
          payload: null,
          action: '',
        });
      }
      if (msg?.result != null) {
        parts.push(normalizeChatMessagePart({
          type: 'tool_result',
          name: msg.name || 'tool',
          result: msg.result,
          id: msg.id || '',
        }));
      }
    } else if (role === 'thinking') {
      parts.push({
        type: 'reasoning',
        text: msg?.text || msg?.content || '',
        status: msg?.status || '',
        resolved: '',
        name: '',
        id: '',
        args: null,
        result: null,
        summary: '',
        warnings: [],
        title: '',
        url: '',
        mimeType: '',
        meta: {},
        display: null,
        llmContent: '',
        payload: null,
        action: '',
      });
    } else if (role === 'board') {
      let cardItems = Array.isArray(msg?.cardItems) ? msg.cardItems : [];
      for (let card of cardItems) {
        parts.push({
          type: 'status',
          id: card.id || '',
          title: card.title || '',
          status: card.status || '',
          resolved: '',
          text: card.statusText || '',
          name: '',
          args: null,
          result: null,
          summary: '',
          warnings: [],
          url: '',
          mimeType: '',
          meta: {},
          display: null,
          llmContent: '',
          payload: null,
          action: '',
        });
      }
    } else {
      let textVal = msg?.text ?? msg?.content ?? '';
      if (textVal !== '' || options.isLatestStreaming) {
        parts.push({
          type: options.isLatestStreaming ? 'text_delta' : 'text',
          text: textVal,
          name: '',
          id: '',
          args: null,
          result: null,
          summary: '',
          warnings: [],
          status: '',
          resolved: '',
          title: '',
          url: '',
          mimeType: '',
          meta: {},
          display: null,
          llmContent: '',
          payload: null,
          action: '',
        });
      }
    }
  }

  return {
    type: normalizeChatMessageRole(msg?.type ?? role),
    role,
    text: msg?.text ?? msg?.content ?? '',
    isStreaming: Boolean(options.isLatestStreaming),
    isLatestTool: Boolean(options.isLatestTool),
    name: msg?.name ?? '',
    input: msg?.input ?? null,
    result: msg?.result ?? null,
    done: Boolean(msg?.done),
    elapsedText: formatElapsed(msg?.elapsed || 0),
    status: msg?.status || '',
    icon: msg?.icon ?? '',
    metaHtml: buildWorkMetaHtml(msg?.meta),
    cardItems: Array.isArray(msg?.cardItems) ? msg.cardItems : [],
    workSummaryHtml: '',
    copyText: '',
    parts,
  };
}

export function buildChatMessageItems(messages = [], options = {}) {
  let source = Array.isArray(messages) ? messages : [];
  let hasActiveStream = Boolean(options.hasActiveStream);
  let items = [];
  let streamingBoards = [];
  let lastAgentItem = null;
  let lastStreamingIndex = -1;
  let lastToolIndex = -1;

  for (let i = 0; i < source.length; i++) {
    let msg = source[i];
    if (msg?.streaming) lastStreamingIndex = i;
    if (normalizeChatMessageRole(msg?.role) === 'tool') lastToolIndex = i;
  }

  for (let i = 0; i < source.length; i++) {
    let msg = source[i];
    let role = normalizeChatMessageRole(msg?.role);
    let isLatestStreaming = hasActiveStream && i === lastStreamingIndex && Boolean(msg?.streaming);

    if (role === 'thinking' && msg.done) {
      let copyText = findPreviousAgentText(source, i);
      if (lastAgentItem) {
        lastAgentItem.workSummaryHtml = buildWorkSummaryHtml(msg, copyText);
        continue;
      }
    }

    let item = toChatMessageItem(msg, {
      isLatestStreaming,
      isLatestTool: i === lastToolIndex,
    });
    if (role === 'thinking' && msg.done) {
      item.copyText = findPreviousAgentText(source, i);
    }
    items.push(item);

    if (role === 'agent') lastAgentItem = item;
    if (role === 'board' && item.isStreaming && item.cardItems?.length) {
      streamingBoards.push(item.cardItems.map((card) => card.id).filter(Boolean));
    }
  }

  return { items, streamingBoards };
}
