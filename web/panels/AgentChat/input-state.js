import { tPortal } from '../../common/localization.js';

export function getAgentChatInputState({
  adapter = 'pool',
  chatParams = {},
  isSubagentChat = false,
  adapterMeta = null,
} = {}) {
  if (isSubagentChat) {
    return {
      disabled: true,
      placeholder: tPortal('chat.placeholder.subagent'),
    };
  }

  let hasGroup = chatParams?.resource_group && chatParams.resource_group !== 'none';
  let isModelRequired = adapter === 'pool' || adapter === 'opencode';
  let hasModel = Boolean(chatParams?.model);
  let disabled = isModelRequired && !hasModel && !hasGroup;

  // Build model info string for placeholder
  let modelInfo = '';
  if (hasGroup && adapterMeta?._resourceGroupDefaults?.groups) {
    let group = adapterMeta._resourceGroupDefaults.groups.find(g => g.name === chatParams.resource_group);
    if (group) {
      let shortModel = group.model ? group.model.split('/').pop() : '';
      modelInfo = shortModel ? `${group.provider} / ${shortModel}` : group.provider;
    }
  } else if (chatParams?.model) {
    let shortModel = chatParams.model.split('/').pop();
    let provider = chatParams?.provider || adapter;
    modelInfo = `${provider} / ${shortModel}`;
  }

  let placeholder;
  if (disabled) {
    placeholder = tPortal('chat.placeholder.missingModel');
  } else if (modelInfo) {
    placeholder = `${modelInfo}  ·  @ mentions, / workflows`;
  } else {
    placeholder = tPortal('chat.placeholder.ready');
  }

  return { disabled, placeholder };
}
