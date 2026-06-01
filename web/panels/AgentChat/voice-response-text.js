const DEFAULT_MAX_CHARS = 900;

const COMMAND_START_RE = /^\s*(?:[$#>]\s*)?(?:bun|cargo|cat|cd|curl|docker|git|go|grep|kubectl|ls|mkdir|mv|node|npm|npx|pip|pnpm|python3?|rg|rm|sed|uv|wget|yarn)\b/i;
const STACK_TRACE_RE = /^\s*(?:at\s+\S+|\w*Error:|Traceback\b|File ".*", line \d+)/;

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
  return line
      .replace(/^\s{0,3}#{1,6}\s+/, '')
      .replace(/^\s{0,3}(?:[-*+]|\d+[.)])\s+/, '')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/https?:\/\/\S+/g, ' ')
      .replace(/`[^`]*`/g, ' ')
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
  let source = removeCodeBlocks(String(text || ''));
  let lines = source
      .split(/\r?\n/)
      .map((line) => cleanReadableLine(line))
      .filter((line) => !isNoisyLine(line));

  let cleaned = lines
      .join(' ')
      .replace(/\s+/g, ' ')
      .replace(/\s+(?:and|и)$/iu, '')
      .trim();

  return truncateAtSentence(cleaned, maxChars);
}
