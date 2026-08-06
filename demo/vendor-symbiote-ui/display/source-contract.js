const TOKEN_CSS_VARIABLES = {
  keyword: '--sn-syntax-keyword',
  kw: '--sn-syntax-keyword',
  string: '--sn-syntax-string',
  str: '--sn-syntax-string',
  comment: '--sn-syntax-comment',
  cm: '--sn-syntax-comment',
  function: '--sn-syntax-function',
  fn: '--sn-syntax-function',
  number: '--sn-syntax-number',
  num: '--sn-syntax-number',
  builtin: '--sn-syntax-builtin',
  bi: '--sn-syntax-builtin',
  property: '--sn-syntax-property',
  prop: '--sn-syntax-property',
  literal: '--sn-syntax-literal',
  lit: '--sn-syntax-literal',
  doc: '--sn-syntax-doc',
  docTag: '--sn-syntax-doc-tag',
  docType: '--sn-syntax-doc-type',
  template: '--sn-syntax-template',
  templateTag: '--sn-syntax-template-tag',
  templateAttr: '--sn-syntax-template-attr',
  templateBracket: '--sn-syntax-template-bracket',
  templateInterpolation: '--sn-syntax-template-interpolation',
  templateSelector: '--sn-syntax-template-selector',
  templateProperty: '--sn-syntax-template-property',
  templateValue: '--sn-syntax-template-value',
};

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function cleanString(value) {
  return value == null ? '' : String(value);
}

function toNullableLineNumber(value) {
  if (value == null) return null;
  let number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
}

function toTokenVariable(name) {
  let token = cleanString(name).trim();
  if (!token) return '';
  if (token.startsWith('--sn-')) return token;
  return TOKEN_CSS_VARIABLES[token] || '';
}

export function normalizeSourceAction(value, fallbackId = 'source-save') {
  if (!value) return null;
  if (typeof value === 'string') {
    let id = cleanString(value).trim();
    return id ? { id, label: id } : null;
  }

  let data = asObject(value);
  let id = cleanString(data.id || data.name || data.action || data.intent || fallbackId).trim();
  if (!id) return null;

  let action = {
    id,
    label: cleanString(data.label || data.title || id).trim() || id,
  };
  if (data.intent != null || data.event != null) {
    action.intent = cleanString(data.intent || data.event).trim() || id;
  }
  if (data.icon != null) action.icon = cleanString(data.icon).trim();
  if (data.disabled !== undefined) action.disabled = Boolean(data.disabled);
  if (data.payload !== undefined) action.payload = data.payload;
  if (data.metadata && Object.keys(asObject(data.metadata)).length > 0) {
    action.metadata = asObject(data.metadata);
  }
  return action;
}

export function normalizeSourceTokenMap(value) {
  return Object.fromEntries(
    Object.entries(asObject(value))
      .map(([key, token]) => [toTokenVariable(key), cleanString(token).trim()])
      .filter(([key, token]) => key && token)
  );
}

export function normalizeSourceSyntaxTheme(value, fallbackTokens = {}) {
  let tokens = normalizeSourceTokenMap(fallbackTokens);
  if (!value) return Object.keys(tokens).length > 0 ? { tokens } : null;
  if (typeof value === 'string') {
    let id = cleanString(value).trim();
    return id ? { id, tokens } : (Object.keys(tokens).length > 0 ? { tokens } : null);
  }

  let data = asObject(value);
  let theme = {};
  let id = cleanString(data.id || data.name || data.theme).trim();
  if (id) theme.id = id;
  let label = cleanString(data.label || data.title).trim();
  if (label) theme.label = label;

  let themeTokens = normalizeSourceTokenMap(Object.keys(tokens).length > 0 ? tokens : data.tokens);
  if (Object.keys(themeTokens).length > 0) theme.tokens = themeTokens;
  if (data.metadata && Object.keys(asObject(data.metadata)).length > 0) {
    theme.metadata = asObject(data.metadata);
  }
  return Object.keys(theme).length > 0 ? theme : null;
}

export function applySourceSyntaxTheme(target, theme) {
  if (!target?.style) return [];
  for (let variable of target.__snSourceSyntaxVariables || []) {
    target.style.removeProperty(variable);
  }
  let tokens = normalizeSourceTokenMap(theme?.tokens || theme);
  let variables = [];
  for (let [variable, value] of Object.entries(tokens)) {
    target.style.setProperty(variable, value);
    variables.push(variable);
  }
  target.__snSourceSyntaxVariables = variables;
  return variables;
}

export function normalizeDiffData(value) {
  if (!value || typeof value !== 'object') return null;
  let data = value;
  let normalizeDiagnostics = (diagnostics) => Array.isArray(diagnostics)
    ? diagnostics
        .filter((item) => item && typeof item === 'object')
        .map((item) => ({
          severity: ['error', 'warning', 'info', 'hint'].includes(item.severity) ? item.severity : 'info',
          message: String(item.message || item.label || ''),
          code: item.code != null ? String(item.code) : '',
        }))
    : [];
  return {
    path: String(data.path || data.modifiedPath || data.originalPath || ''),
    originalPath: data.originalPath ? String(data.originalPath) : null,
    modifiedPath: data.modifiedPath ? String(data.modifiedPath) : null,
    hunks: Array.isArray(data.hunks)
      ? data.hunks.map((hunk) => ({
          header: String(hunk.header || ''),
          lines: Array.isArray(hunk.lines)
            ? hunk.lines.map((line) => ({
                type: ['addition', 'deletion', 'normal'].includes(line.type) ? line.type : 'normal',
                originalLineNumber: toNullableLineNumber(line.originalLineNumber),
                modifiedLineNumber: toNullableLineNumber(line.modifiedLineNumber),
                content: String(line.content ?? ''),
                diagnostics: normalizeDiagnostics(line.diagnostics),
              }))
            : [],
        }))
      : [],
  };
}

export function normalizeReviewAction(value, fallbackId = 'review-accept') {
  if (!value) return null;
  if (typeof value === 'string') {
    let id = String(value).trim();
    return id ? { id, label: id } : null;
  }
  let data = value && typeof value === 'object' ? value : {};
  let id = String(data.id || data.action || data.intent || fallbackId).trim();
  return {
    id,
    label: String(data.label || data.title || id).trim() || id,
    intent: String(data.intent || id).trim(),
  };
}

export function parseGitDiffPatch(patchText) {
  if (!patchText) return null;
  let lines = patchText.split(/\r?\n/);
  let hunks = [];
  let currentHunk = null;
  let path = '';

  let originalLine = 0;
  let modifiedLine = 0;

  for (let line of lines) {
    if (line.startsWith('--- ') || line.startsWith('+++ ')) {
      let p = line.substring(4).trim();
      if (p.startsWith('a/') || p.startsWith('b/')) p = p.substring(2);
      if (p && p !== '/dev/null') path = p;
      continue;
    }

    if (line.startsWith('@@ ')) {
      let match = line.match(/^@@ -(\d+),?(\d*) \+(\d+),?(\d*) @@/);
      if (match) {
        originalLine = parseInt(match[1]);
        modifiedLine = parseInt(match[3]);
        currentHunk = {
          header: line,
          lines: [],
        };
        hunks.push(currentHunk);
      }
      continue;
    }

    if (!currentHunk) continue;

    if (line.startsWith('+')) {
      currentHunk.lines.push({
        type: 'addition',
        originalLineNumber: null,
        modifiedLineNumber: modifiedLine++,
        content: line.substring(1),
      });
    } else if (line.startsWith('-')) {
      currentHunk.lines.push({
        type: 'deletion',
        originalLineNumber: originalLine++,
        modifiedLineNumber: null,
        content: line.substring(1),
      });
    } else if (line.startsWith(' ')) {
      currentHunk.lines.push({
        type: 'normal',
        originalLineNumber: originalLine++,
        modifiedLineNumber: modifiedLine++,
        content: line.substring(1),
      });
    }
  }

  return {
    path,
    hunks,
  };
}
