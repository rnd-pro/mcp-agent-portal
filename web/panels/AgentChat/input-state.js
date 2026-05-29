const SUBAGENT_PLACEHOLDER = 'This sub-agent chat is controlled by the orchestrator.';
const MISSING_MODEL_PLACEHOLDER = 'Select a model to start...';
const READY_PLACEHOLDER = 'Ask anything, @ to mention, / for workflows';

export function getAgentChatInputState({
  adapter = 'pool',
  chatParams = {},
  isSubagentChat = false,
} = {}) {
  if (isSubagentChat) {
    return {
      disabled: true,
      placeholder: SUBAGENT_PLACEHOLDER,
    };
  }

  let isModelRequired = adapter === 'pool' || adapter === 'opencode';
  let hasModel = Boolean(chatParams?.model);
  let disabled = isModelRequired && !hasModel;

  return {
    disabled,
    placeholder: disabled ? MISSING_MODEL_PLACEHOLDER : READY_PLACEHOLDER,
  };
}
