import { tPortal } from '../../common/localization.js';

export function getAgentChatInputState({
  adapter = 'pool',
  chatParams = {},
  isSubagentChat = false,
} = {}) {
  if (isSubagentChat) {
    return {
      disabled: true,
      placeholder: tPortal('chat.placeholder.subagent'),
    };
  }

  let isModelRequired = adapter === 'pool' || adapter === 'opencode';
  let hasModel = Boolean(chatParams?.model);
  let disabled = isModelRequired && !hasModel;

  return {
    disabled,
    placeholder: disabled
      ? tPortal('chat.placeholder.missingModel')
      : tPortal('chat.placeholder.ready'),
  };
}
