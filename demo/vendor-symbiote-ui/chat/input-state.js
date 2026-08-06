/**
 * Chat composer input-state resolver.
 *
 * Pure shape + validation that decides whether the chat composer should be
 * disabled and which placeholder the host should render. It returns a stable
 * placeholder TOKEN (not localized text): the host maps the token to copy via
 * its own i18n layer.
 *
 * The caller passes already-resolved booleans. Resolving them (e.g. reading a
 * resource group from `adapterMeta._resourceGroupDefaults`, or translating the
 * token through `tPortal()`) stays host-side and is intentionally NOT part of
 * this module. Pure and dependency-free — safe in Node and the browser.
 *
 * @module symbiote-ui/chat/input-state
 */

/**
 * Placeholder tokens returned by {@link normalizeChatInputState}. The host
 * resolves each token to display copy through its own localization layer.
 *
 * @readonly
 * @enum {string}
 */
export const CHAT_INPUT_PLACEHOLDER_KEYS = Object.freeze({
  SUBAGENT: 'chat.placeholder.subagent',
  MISSING_MODEL: 'chat.placeholder.missingModel',
  MODEL_INFO: 'chat.placeholder.modelInfo',
  READY: 'chat.placeholder.ready',
});

/**
 * Decide composer disabled state and placeholder token from resolved inputs.
 *
 * Decision logic (mirrors the portal source, i18n + resource-group resolution
 * kept host-side):
 * - A subagent chat is always disabled with the `SUBAGENT` token.
 * - Otherwise disabled when a model is required but neither a model nor a
 *   resource group is selected; that case yields the `MISSING_MODEL` token.
 * - When enabled and `modelInfo` is present, the `MODEL_INFO` token is
 *   returned so the host can render the model summary line.
 * - Otherwise the `READY` token is returned.
 *
 * @param {Object} [input]
 * @param {boolean} [input.hasModel=false] - A model is selected.
 * @param {boolean} [input.hasGroup=false] - A resource group is selected.
 * @param {boolean} [input.isModelRequired=false] - The adapter requires a model.
 * @param {boolean} [input.isSubagent=false] - The chat is a read-only subagent view.
 * @param {string} [input.modelInfo=''] - Pre-formatted, non-localized model summary
 *   (e.g. "openai / gpt-4o"); only affects placeholder selection, never content.
 * @returns {{ disabled: boolean, placeholderKey: string }} Composer state and
 *   placeholder token from {@link CHAT_INPUT_PLACEHOLDER_KEYS}.
 */
export function normalizeChatInputState({
  hasModel = false,
  hasGroup = false,
  isModelRequired = false,
  isSubagent = false,
  modelInfo = '',
} = {}) {
  if (isSubagent) {
    return { disabled: true, placeholderKey: CHAT_INPUT_PLACEHOLDER_KEYS.SUBAGENT };
  }

  let disabled = Boolean(isModelRequired) && !hasModel && !hasGroup;

  let placeholderKey;
  if (disabled) {
    placeholderKey = CHAT_INPUT_PLACEHOLDER_KEYS.MISSING_MODEL;
  } else if (String(modelInfo || '').trim()) {
    placeholderKey = CHAT_INPUT_PLACEHOLDER_KEYS.MODEL_INFO;
  } else {
    placeholderKey = CHAT_INPUT_PLACEHOLDER_KEYS.READY;
  }

  return { disabled, placeholderKey };
}
