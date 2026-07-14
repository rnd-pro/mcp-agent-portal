let CLAUDE_REASONING_EFFORTS = ['default', 'low', 'medium', 'high', 'xhigh', 'max'];

export function cloneLoadedGroups(groups) {
  if (!Array.isArray(groups)) return [];
  return groups.map(group => ({
    ...group,
    profiles: Array.isArray(group.profiles) ? group.profiles.map(profile => ({ ...profile })) : [],
  }));
}

export function visibleCodexModels(models) {
  if (!Array.isArray(models)) return [];
  return models.filter(model => model && typeof model.id === 'string' && model.id && !model.hidden);
}

export function providerModelIds({ provider, apiDefaults = [], fallbackDefaults = [], userModels = [], codexModels = [] }) {
  let discovered = provider === 'codex' ? visibleCodexModels(codexModels).map(model => model.id) : [];
  let normalizedDefaults = apiDefaults
    .map(model => typeof model === 'string' ? model : model?.id)
    .filter(Boolean);
  return [...new Set([...normalizedDefaults, ...fallbackDefaults, ...userModels, ...discovered])];
}

export function modelReasoningEfforts(provider, modelId, codexModels = []) {
  if (provider === 'claude') return [...CLAUDE_REASONING_EFFORTS];
  if (provider !== 'codex') return [];
  let visibleModels = visibleCodexModels(codexModels);
  let model = visibleModels.find(item => item.id === modelId)
    || (modelId === 'default' ? visibleModels.find(item => item.isDefault) : null);
  if (!model || !Array.isArray(model.supportedReasoningEfforts)) return ['default'];
  let efforts = model.supportedReasoningEfforts
    .map(option => option?.reasoningEffort)
    .filter(value => typeof value === 'string' && value);
  return [...new Set(['default', ...efforts])];
}

export function modelServiceTiers(provider, modelId, codexModels = []) {
  if (provider !== 'codex') return [];
  let visibleModels = visibleCodexModels(codexModels);
  let model = visibleModels.find(item => item.id === modelId)
    || (modelId === 'default' ? visibleModels.find(item => item.isDefault) : null);
  if (!model || !Array.isArray(model.serviceTiers)) return ['default'];
  let tiers = model.serviceTiers
    .map(tier => tier?.id)
    .filter(value => typeof value === 'string' && value);
  return [...new Set(['default', ...tiers])];
}

export function reconcileModelSetting(value, options) {
  if (!Array.isArray(options) || options.length === 0) return '';
  let normalized = typeof value === 'string' ? value.trim() : '';
  if (normalized && options.includes(normalized)) return normalized;
  return options.includes('default') ? 'default' : options[0];
}

export function profileSettingSummary(profile = {}) {
  let details = [];
  let reasoning = profile.reasoningEffort ?? profile.reasoning_effort;
  let serviceTier = profile.serviceTier ?? profile.service_tier;
  if (reasoning && reasoning !== 'default') details.push(`effort ${reasoning}`);
  if (serviceTier && serviceTier !== 'default') details.push(`tier ${serviceTier}`);
  return details.join(' · ');
}
