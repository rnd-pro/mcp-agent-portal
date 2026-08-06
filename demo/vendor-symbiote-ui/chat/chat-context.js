/**
 * Chat Context — generic keyed context management with pluggable type handlers.
 *
 * Provides context item normalization, merge-by-key, removal, and serialization.
 * Applications register custom type handlers for domain-specific context types.
 *
 * Built-in: 'file' type handler.
 */

function shortName(fullPath) {
  let clean = String(fullPath || '')
  let trimmed = clean.endsWith('/') ? clean.slice(0, -1) : clean
  return (trimmed.split('/').pop() || clean) + (clean.endsWith('/') ? '/' : '')
}

/** Built-in file type handler. */
export const FILE_TYPE_HANDLER = {
  normalize(input) {
    let path = String(input.path || '').trim()
    return {
      type: 'file',
      key: `file:${path}`,
      path,
      name: input.name || shortName(path),
      title: path,
      icon: path.endsWith('/') ? 'folder' : 'description',
      source: input.source || 'manual',
    }
  },
  contextKey(item) {
    return item.key || `file:${item.path}`
  },
  formatPayload(item) {
    return {
      type: 'file',
      path: item.path,
      source: item.source,
    }
  },
}

const DEFAULT_TYPE_HANDLERS = {
  file: FILE_TYPE_HANDLER,
}

function _resolveHandler(type, typeHandlers) {
  return typeHandlers[type] || typeHandlers.file || FILE_TYPE_HANDLER
}

function _contextKey(item, typeHandlers) {
  if (item.key) return String(item.key)
  let handler = _resolveHandler(item.type || 'file', typeHandlers)
  if (handler.contextKey) return handler.contextKey(item)
  if (item.path) return `file:${item.path}`
  return `${item.type || 'context'}:${item.name || item.title || ''}`
}

/**
 * Normalize a context item using the appropriate type handler.
 *
 * @param {object} [input={}]
 * @param {object} [typeHandlers] - Map of type name to handler object.
 * @returns {object} Normalized context item with a `key` property.
 */
export function normalizeAttachedContextItem(input = {}, typeHandlers = DEFAULT_TYPE_HANDLERS) {
  let type = input.type || 'file'
  let handler = _resolveHandler(type, typeHandlers)
  return handler.normalize(input)
}

/**
 * Add or replace a context item by key.
 *
 * @param {Array} [current=[]] - Current context items.
 * @param {object} [input={}] - Raw input to normalize and merge.
 * @param {object} [typeHandlers] - Map of type name to handler object.
 * @returns {Array} Updated context items.
 */
export function mergeAttachedContext(current = [], input = {}, typeHandlers = DEFAULT_TYPE_HANDLERS) {
  let item = normalizeAttachedContextItem(input, typeHandlers)
  let key = _contextKey(item, typeHandlers)
  if (!key || key.endsWith(':')) return current
  let withoutExisting = current.filter((ctx) => _contextKey(ctx, typeHandlers) !== key)
  return [...withoutExisting, item]
}

/**
 * Remove a context item by key.
 *
 * @param {Array} [current=[]] - Current context items.
 * @param {string} key - Key of the item to remove.
 * @param {object} [typeHandlers] - Map of type name to handler object.
 * @returns {Array} Updated context items.
 */
export function removeAttachedContext(current = [], key, typeHandlers = DEFAULT_TYPE_HANDLERS) {
  return current.filter((ctx) => _contextKey(ctx, typeHandlers) !== key)
}

/**
 * Serialize context items into an attached context block string.
 *
 * @param {Array} [context=[]] - Context items to serialize.
 * @param {object} [typeHandlers] - Map of type name to handler object.
 * @returns {string} Serialized context block, or empty string if no items.
 */
export function formatAttachedContextBlock(context = [], typeHandlers = DEFAULT_TYPE_HANDLERS) {
  let items = context
    .map((c) => normalizeAttachedContextItem(c, typeHandlers))
    .filter((item) => !_contextKey(item, typeHandlers).endsWith(':'))
  if (items.length === 0) return ''

  let payload = items.map((item) => {
    let handler = _resolveHandler(item.type || 'file', typeHandlers)
    if (handler.formatPayload) return handler.formatPayload(item)
    return {
      type: 'file',
      path: item.path,
      source: item.source,
    }
  })

  return `[Attached Context]\n${JSON.stringify(payload, null, 2)}\n\n`
}
