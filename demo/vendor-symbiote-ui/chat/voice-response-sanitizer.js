/**
 * Voice response text sanitizer.
 *
 * Reduces an agent's textual reply to readable prose suitable for text-to-speech:
 * strips code blocks, shell commands, stack traces, tables, JSON, URLs, inline
 * code, markdown decoration, and over-long quoted fragments, then truncates at a
 * sentence boundary. Pure and dependency-free — safe in Node and the browser.
 *
 * Domain-specific canned summaries (e.g. a product's operational replies) are NOT
 * baked in: pass an optional `summarize` function to short-circuit with your own
 * phrasing. The library ships only the general filter.
 *
 * @module symbiote-ui/chat/voice-response-sanitizer
 */

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
  let replace = (_match, value) => {
    let cleaned = cleanQuotedValue(value);
    return wordCount(cleaned) > MAX_QUOTED_WORDS || isCodeLikeFragment(cleaned) ? ' ' : cleaned;
  };
  return line
      .replace(/"([^"]{1,240})"/g, replace)
      .replace(/«([^»]{1,240})»/g, replace)
      .replace(/“([^”]{1,240})”/g, replace);
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
      .replace(/[—–]/g, ' ')
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

/**
 * Sanitize agent text for speech synthesis.
 *
 * @param {string} text - Raw agent reply (markdown/code/prose).
 * @param {Object} [options]
 * @param {number} [options.maxChars=900] - Truncate the result at a sentence
 *   boundary near this length.
 * @param {(text: string) => string} [options.summarize] - Optional hook for
 *   domain-specific canned summaries. If it returns a non-empty string, that
 *   string is returned verbatim and no further filtering is applied.
 * @returns {string} Readable prose for TTS.
 */
export function sanitizeVoiceResponseText(text, { maxChars = DEFAULT_MAX_CHARS, summarize } = {}) {
  if (typeof summarize === 'function') {
    let summary = summarize(text);
    if (summary) return String(summary);
  }

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
