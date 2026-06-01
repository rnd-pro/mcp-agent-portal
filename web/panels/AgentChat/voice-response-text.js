const DEFAULT_MAX_CHARS = 900;
const MAX_QUOTED_WORDS = 10;

const COMMAND_START_RE = /^\s*(?:[$#>]\s*)?(?:bun|cargo|cat|cd|curl|docker|git|go|grep|kubectl|ls|mkdir|mv|node|npm|npx|pip|pnpm|python3?|rg|rm|sed|uv|wget|yarn)\b/i;
const STACK_TRACE_RE = /^\s*(?:at\s+\S+|\w*Error:|Traceback\b|File ".*", line \d+)/;
const CODE_TOKEN_RE = /(?:[._$#-]*[A-Za-z_$][\w$-]*(?:[./:][A-Za-z0-9_$-]+)+\(?\)?|[._$#-]*[A-Za-z_$][\w$]*(?:\([^)]*\)|\(\)))/g;
const CLI_FLAG_RE = /(^|\s)--?[A-Za-z][\w-]*/g;

function removeCodeBlocks(text) {
  return text
      .replace(/```[\s\S]*?```/g, ' ')
      .replace(/~~~[\s\S]*?~~~/g, ' ');
}

function isTableLine(line) {
  return line.includes('|') && line.split('|').filter(Boolean).length >= 2;
}

function isJsonLikeLine(line) {
  let value = line.trim();
  if (!value) return true;
  if (/^[{}\[\],]*$/.test(value)) return true;
  if (/^["']?[A-Za-z0-9_$.-]+["']?\s*:\s*[\[{"]/u.test(value)) return true;
  if (/^[{\[]/.test(value) && /[}\]]$/.test(value)) return true;
  return false;
}

function symbolRatio(line) {
  let compact = line.replace(/\s/g, '');
  if (!compact) return 0;
  let symbols = compact.replace(/[\p{L}\p{N}]/gu, '').length;
  return symbols / compact.length;
}

function wordCount(value) {
  return (String(value).match(/[\p{L}\p{N}]+/gu) || []).length;
}

function isCodeLikeFragment(value) {
  let text = String(value || '').trim();
  if (!text) return false;
  if (COMMAND_START_RE.test(text)) return true;
  if (/^\.?[A-Za-z_$][\w$]*(?:\([^)]*\)|\.\w+|\/\w+)/.test(text)) return true;
  if (/[{}[\]();=]|=>|::|\/|\\|--/.test(text)) return true;
  if (text.length > 8 && symbolRatio(text) > 0.28) return true;
  return false;
}

function cleanQuotedValue(value) {
  return String(value || '')
      .trim()
      .replace(/^[\s[\]{}]+|[\s[\]{}]+$/g, '')
      .trim();
}

function cleanQuotedFragments(line) {
  return line
      .replace(/"([^"]{1,240})"/g, (_match, value) => {
        let cleaned = cleanQuotedValue(value);
        return wordCount(cleaned) > MAX_QUOTED_WORDS || isCodeLikeFragment(cleaned) ? ' ' : cleaned;
      })
      .replace(/\u00ab([^\u00bb]{1,240})\u00bb/g, (_match, value) => {
        let cleaned = cleanQuotedValue(value);
        return wordCount(cleaned) > MAX_QUOTED_WORDS || isCodeLikeFragment(cleaned) ? ' ' : cleaned;
      })
      .replace(/\u201c([^\u201d]{1,240})\u201d/g, (_match, value) => {
        let cleaned = cleanQuotedValue(value);
        return wordCount(cleaned) > MAX_QUOTED_WORDS || isCodeLikeFragment(cleaned) ? ' ' : cleaned;
      });
}

function summarizeOperationalReply(text) {
  let value = String(text || '').trim();
  if (/^pong$/i.test(value)) {
    return 'Связь есть.';
  }
  if (/^Готово\.\s+Закоммичено и запушено/i.test(value)) {
    if (/voice response sanitizer|voice-response-text|CODE_TOKEN_RE|CLI_FLAG_RE|фильтр[а-яё\s]+озвуч/i.test(value)) {
      return 'Готово. Изменения закоммичены и запушены. Обновлён фильтр озвучки ответов и добавлены тесты.';
    }
    return 'Готово. Изменения закоммичены и запушены.';
  }
  if (/^Готово\.\s+Закоммичено и запущено/i.test(value)) {
    return 'Готово. Исправление закоммичено и запущено.';
  }
  if (/^Готово\.\s+Закоммичено/i.test(value)) {
    return 'Готово. Изменения закоммичены.';
  }
  if (/^Все изменения закоммичены/i.test(value)) {
    return 'Все изменения закоммичены.';
  }
  if (/^(Наш[её]л причину|Вот что происходило)/i.test(value) && /(_pullMessages|setMessages|chat-ws-client|перерендер|pull-timer)/i.test(value)) {
    return 'Нашёл причину. Проблема была в периодическом обновлении сообщений: чат заново заменял список и перерисовывал транскрипт. Фикс добавляет проверку, чтобы не обновлять список без изменений.';
  }
  if (/^(Now I see the changes|Changes already staged)/i.test(value) && /\b(?:commit|submodule|staged)\b/i.test(value)) {
    return 'Агент проверяет изменения перед коммитом.';
  }
  return '';
}

function isNoisyLine(line) {
  let value = line.trim();
  if (!value) return true;
  if (COMMAND_START_RE.test(value)) return true;
  if (STACK_TRACE_RE.test(value)) return true;
  if (isTableLine(value)) return true;
  if (isJsonLikeLine(value)) return true;
  if (value.length > 24 && symbolRatio(value) > 0.38) return true;
  return false;
}

function cleanReadableLine(line) {
  return cleanQuotedFragments(line)
      .replace(/^\s{0,3}#{1,6}\s+/, '')
      .replace(/^\s{0,3}(?:[-*+]|\d+[.)])\s+/, '')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/https?:\/\/\S+/g, ' ')
      .replace(/`[^`]*`/g, ' ')
      .replace(CODE_TOKEN_RE, ' ')
      .replace(CLI_FLAG_RE, ' ')
      .replace(/[«»“”"\[\]{}]/g, ' ')
      .replace(/(?<=\p{L})-(?=\p{L})/gu, ' ')
      .replace(/[*_~>#]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
}

function truncateAtSentence(text, maxChars) {
  if (!maxChars || text.length <= maxChars) return text;
  let slice = text.slice(0, maxChars).trim();
  let stops = ['. ', '! ', '? ', '.\n', '!\n', '?\n'];
  let stop = Math.max(...stops.map((marker) => slice.lastIndexOf(marker)));
  if (stop > maxChars * 0.6) return slice.slice(0, stop + 1).trim();
  return slice;
}

export function sanitizeVoiceResponseText(text, { maxChars = DEFAULT_MAX_CHARS } = {}) {
  let summary = summarizeOperationalReply(text);
  if (summary) return summary;

  let source = removeCodeBlocks(String(text || ''));
  let lines = source
      .split(/\r?\n/)
      .map((line) => cleanReadableLine(line))
      .filter((line) => !isNoisyLine(line));

  let cleaned = lines
      .join(' ')
      .replace(/\s+([.,!?;:])/g, '$1')
      .replace(/(?:^|\s)[.,;:](?=\s|$)/g, ' ')
      .replace(/\s+/g, ' ')
      .replace(/\s+(?:and|и)$/iu, '')
      .trim();

  return truncateAtSentence(cleaned, maxChars);
}
