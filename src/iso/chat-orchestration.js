export const DEFAULT_CHAT_AGENT = 'orchestrator';

export function isPoolChatAdapter(adapter = 'pool') {
  return (adapter || 'pool') === 'pool';
}

export function resolveChatCreationAgent(opts = {}) {
  if (!isPoolChatAdapter(opts.adapter || 'pool')) return null;
  let parentChatId = opts.parentChatId || opts.parent_chat_id || null;
  if (parentChatId) return opts.agent || opts.agent_slug || DEFAULT_CHAT_AGENT;
  return DEFAULT_CHAT_AGENT;
}

export function resolveChatDelegationAgent({ explicitAgent = null, contextChat = null } = {}) {
  if (contextChat?.parentChatId) {
    return explicitAgent || contextChat.agent || DEFAULT_CHAT_AGENT;
  }
  return DEFAULT_CHAT_AGENT;
}
