const TRANSACTION_FENCE_RE = /```([^\n`]*)\n([\s\S]*?)```/g;
const AGENT_ROLES = new Set(['agent', 'assistant']);

function parseJsonBlock(source) {
  try {
    return JSON.parse(source);
  } catch {
    return null;
  }
}

function transactionItems(value) {
  if (Array.isArray(value)) return value;
  return value && typeof value === 'object' ? [value] : [];
}

function isTransactionFence(info, payload) {
  const normalizedInfo = String(info || '').toLowerCase();
  if (normalizedInfo.includes('project-transaction-v1')) return true;
  return payload?.version === 'project-transaction-v1'
    || (Array.isArray(payload) && payload.some((item) => item?.version === 'project-transaction-v1'));
}

export function portalRuntimeProjectId(projectId = null) {
  return `agent-portal:${projectId || 'global'}`;
}

export function createTransactionApplyKey(projectId, transaction) {
  return `${portalRuntimeProjectId(projectId)}:${transaction.id}`;
}

export function normalizePortalProjectTransaction(transaction, projectId = null) {
  const targetProject = portalRuntimeProjectId(projectId);
  return {
    ...transaction,
    targetProject: transaction.targetProject === projectId ? targetProject : (transaction.targetProject || targetProject),
  };
}

export function extractProjectTransactionsFromMessages(messages = []) {
  const transactions = [];
  for (const message of messages || []) {
    if (!AGENT_ROLES.has(message?.role)) continue;
    const text = String(message.text || message.content || '');
    for (const match of text.matchAll(TRANSACTION_FENCE_RE)) {
      const payload = parseJsonBlock(match[2].trim());
      if (!isTransactionFence(match[1], payload)) continue;
      for (const item of transactionItems(payload)) {
        if (item?.version === 'project-transaction-v1' && item.id && Array.isArray(item.operations)) {
          transactions.push(item);
        }
      }
    }
  }
  return transactions;
}

export function createProjectTransactionEvent(projectId, transaction) {
  const detail = { projectId, transaction };
  if (typeof CustomEvent === 'function') {
    return new CustomEvent('agent-portal-project-transaction', { detail });
  }
  return { type: 'agent-portal-project-transaction', detail };
}

export function applyProjectTransactions({
  transactions,
  projectId = null,
  applied = new Set(),
  dispatch = (event) => document.dispatchEvent(event),
} = {}) {
  const appliedTransactions = [];
  for (const transaction of transactions || []) {
    const normalized = normalizePortalProjectTransaction(transaction, projectId);
    const key = createTransactionApplyKey(projectId, normalized);
    if (applied.has(key)) continue;
    dispatch(createProjectTransactionEvent(projectId, normalized));
    applied.add(key);
    appliedTransactions.push(normalized);
  }
  return appliedTransactions;
}

export function applyProjectTransactionsFromMessages(options = {}) {
  return applyProjectTransactions({
    ...options,
    transactions: extractProjectTransactionsFromMessages(options.messages),
  });
}
