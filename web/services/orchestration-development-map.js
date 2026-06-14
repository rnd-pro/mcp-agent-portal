function appendParam(params, key, value) {
  let text = String(value || '').trim();
  if (text) params.set(key, text);
}

export function normalizeDevelopmentMap(value = null) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  if (value.schemaVersion !== 1) return null;
  return value;
}

export async function fetchDevelopmentMap({ chatId = '', taskId = '' } = {}) {
  let params = new URLSearchParams();
  appendParam(params, 'chatId', chatId);
  appendParam(params, 'taskId', taskId);
  let suffix = params.toString() ? `?${params.toString()}` : '';
  let response = await fetch(`/api/agent-portal/development-map${suffix}`);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  let payload = await response.json();
  if (payload.error) throw new Error(payload.error);
  return normalizeDevelopmentMap(payload.developmentMap);
}

export default fetchDevelopmentMap;
