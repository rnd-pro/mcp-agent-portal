function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function cleanString(value) {
  if (value == null) return '';
  return String(value);
}

function firstString(...values) {
  for (let value of values) {
    if (typeof value === 'string') return value;
  }
  return '';
}

function firstOptionalString(...values) {
  for (let value of values) {
    if (typeof value === 'string') return value;
  }
  return undefined;
}

function normalizeDiagnostics(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((diagnostic) => {
      let data = asObject(diagnostic);
      let message = cleanString(data.message || data.text || data.ruleId);
      if (!message) return null;
      return {
        ...data,
        message,
        severity: cleanString(data.severity || data.level || 'info'),
      };
    })
    .filter(Boolean);
}

function normalizeSourceAction(value) {
  if (!value) return null;
  if (typeof value === 'string') {
    let id = cleanString(value).trim();
    return id ? { id, label: id } : null;
  }

  let data = asObject(value);
  let id = cleanString(data.id || data.name || data.action || data.intent || 'save').trim();
  if (!id) return null;

  let action = {
    id,
    label: cleanString(data.label || data.title || id).trim() || id,
  };
  if (data.intent != null || data.event != null) {
    action.intent = cleanString(data.intent || data.event).trim() || id;
  }
  if (data.disabled !== undefined) action.disabled = Boolean(data.disabled);
  if (data.payload !== undefined) action.payload = data.payload;
  if (data.metadata && Object.keys(asObject(data.metadata)).length > 0) {
    action.metadata = asObject(data.metadata);
  }
  return action;
}

function normalizeTokenMap(value) {
  let tokens = asObject(value);
  return Object.fromEntries(
    Object.entries(tokens)
      .map(([key, token]) => [cleanString(key).trim(), cleanString(token).trim()])
      .filter(([key, token]) => key && token)
  );
}

function normalizeSyntaxTheme(value, fallbackTokens = {}) {
  let tokens = normalizeTokenMap(fallbackTokens);
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

  let themeTokens = normalizeTokenMap(Object.keys(tokens).length > 0 ? tokens : data.tokens);
  if (Object.keys(themeTokens).length > 0) theme.tokens = themeTokens;
  if (data.metadata && Object.keys(asObject(data.metadata)).length > 0) {
    theme.metadata = asObject(data.metadata);
  }
  return Object.keys(theme).length > 0 ? theme : null;
}

export function normalizeSourceDocument(rawDocument = {}) {
  let data = asObject(rawDocument);
  let path = cleanString(data.path || data.id || data.uri).trim();
  if (!path) throw new Error('source document path is required');

  let content = firstString(data.content, data.code, data.text, data.raw, data.rawContent);
  let raw = firstString(data.raw, data.rawContent, content);
  let language = cleanString(data.language || data.lang || 'text').trim() || 'text';
  let document = {
    path,
    language,
    content,
    raw,
    readOnly: Boolean(data.readOnly ?? data.readonly),
    dirty: Boolean(data.dirty),
    diagnostics: normalizeDiagnostics(data.diagnostics),
  };

  if (data.readable !== undefined || data.isReadable !== undefined) {
    document.readable = Boolean(data.readable ?? data.isReadable);
  }
  if (data.expanded !== undefined) document.expanded = Boolean(data.expanded);
  if (data.statsText != null) document.statsText = cleanString(data.statsText);
  if (data.title != null) document.title = cleanString(data.title);
  if (data.description != null) document.description = cleanString(data.description);

  let saveAction = normalizeSourceAction(data.saveAction || data.save);
  if (saveAction) document.saveAction = saveAction;

  let syntaxTokens = normalizeTokenMap(data.syntaxTokens || data.syntaxTheme?.tokens);
  if (Object.keys(syntaxTokens).length > 0) document.syntaxTokens = syntaxTokens;

  let syntaxTheme = normalizeSyntaxTheme(data.syntaxTheme, syntaxTokens);
  if (syntaxTheme) document.syntaxTheme = syntaxTheme;

  let metadata = asObject(data.metadata);
  if (Object.keys(metadata).length > 0) document.metadata = metadata;
  return document;
}

export function createSourceDocument(rawPayload = {}, options = {}) {
  let payload = asObject(rawPayload);
  let document = {
    ...payload,
    ...options,
    path: options.path ?? payload.path,
    language: options.language ?? options.lang ?? payload.language ?? payload.lang,
    content: firstString(options.content, payload.content, payload.code, payload.text, payload.compressed),
  };
  let raw = firstOptionalString(options.raw, options.rawContent, payload.raw, payload.rawContent);
  if (raw !== undefined) document.raw = raw;
  return normalizeSourceDocument(document);
}
