import { extractProjectTransactionsFromMessages } from 'symbiote-ui/graph';

export { extractProjectTransactionsFromMessages };

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
