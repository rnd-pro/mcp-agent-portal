export const CHAT_TITLE_MAX_WORDS = 8;
export const CHAT_TITLE_MAX_LENGTH = 72;

const DEFAULT_TAG_NAME = 'chat-title';

function normalizeLimit(value, fallback) {
  let limit = Number(value);
  return Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : fallback;
}

export function sanitizeChatTitle(value = '', options = {}) {
  let maxWords = normalizeLimit(options.maxWords, CHAT_TITLE_MAX_WORDS);
  let maxLength = normalizeLimit(options.maxLength, CHAT_TITLE_MAX_LENGTH);
  let title = String(value || '')
    .replace(/[`*_#[\](){}<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^["'«“]+|["'»”]+$/g, '')
    .trim();

  if (!title) return '';

  title = title
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, maxWords)
    .join(' ')
    .slice(0, maxLength)
    .trim();

  return title.replace(/[.,;:!?-]+$/g, '').trim();
}

export function extractChatTitleFromAgentText(text = '', options = {}) {
  let source = String(text || '');
  let tagName = String(options.tagName || DEFAULT_TAG_NAME).replace(/[^\w-]/g, '') || DEFAULT_TAG_NAME;
  let pattern = new RegExp(`(?:^|\\n)\\s*<${tagName}>\\s*([^<\\n]+?)\\s*<\\/${tagName}>\\s*(?=\\n|$)`, 'i');
  let match = source.match(pattern);
  if (!match) {
    return { title: '', text: source, changed: false };
  }

  let title = sanitizeChatTitle(match[1], options);
  let cleanText = source
    .replace(match[0], '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return {
    title,
    text: cleanText,
    changed: cleanText !== source,
  };
}
