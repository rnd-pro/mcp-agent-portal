import { tPortal } from '../../common/localization.js';
import {
  normalizeChatInputState,
  CHAT_INPUT_PLACEHOLDER_KEYS,
} from 'symbiote-ui/chat/input-state.js';

export function getAgentChatInputState({
  adapter = 'pool',
  chatParams = {},
  isSubagentChat = false,
  adapterMeta = null,
} = {}) {
  let hasGroup = Boolean(chatParams?.resource_group && chatParams.resource_group !== 'none');
  let isModelRequired = adapter === 'pool' || adapter === 'opencode';
  let hasModel = Boolean(chatParams?.model);

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

  let { disabled, placeholderKey } = normalizeChatInputState({
    hasModel,
    hasGroup,
    isModelRequired,
    isSubagent: isSubagentChat,
    modelInfo,
  });

  let placeholder;
  if (placeholderKey === CHAT_INPUT_PLACEHOLDER_KEYS.MODEL_INFO) {
    placeholder = `${modelInfo}  ·  @ mentions, / workflows`;
  } else {
    placeholder = tPortal(placeholderKey);
  }

  return { disabled, placeholder };
}
