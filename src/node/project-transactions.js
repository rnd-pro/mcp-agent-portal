import { normalizeProjectTransaction } from 'symbiote-node/graph';

const TRANSACTION_FENCE_RE = /```([^\n`]*)\n([\s\S]*?)```/g;

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

function isTransactionPayload(info, payload) {
  const normalizedInfo = String(info || '').toLowerCase();
  if (normalizedInfo.includes('project-transaction-v1')) return true;
  return payload?.version === 'project-transaction-v1'
    || (Array.isArray(payload) && payload.some((item) => item?.version === 'project-transaction-v1'));
}

function collectTransactionPayloads(value, transactions = []) {
  if (!value || typeof value !== 'object') return transactions;
  if (Array.isArray(value)) {
    for (const item of value) collectTransactionPayloads(item, transactions);
    return transactions;
  }
  if (value.version === 'project-transaction-v1') {
    transactions.push(value);
    return transactions;
  }
  for (const nested of Object.values(value)) {
    collectTransactionPayloads(nested, transactions);
  }
  return transactions;
}

export function portalRuntimeProjectId(projectId = null) {
  return `agent-portal:${projectId || 'global'}`;
}

export function createPortalTransactionKey(projectId, transaction) {
  return `${portalRuntimeProjectId(projectId)}:${transaction.id}`;
}

export function extractProjectTransactionsFromText(text = '') {
  const transactions = [];
  for (const match of String(text || '').matchAll(TRANSACTION_FENCE_RE)) {
    const payload = parseJsonBlock(match[2].trim());
    if (!isTransactionPayload(match[1], payload)) continue;
    for (const item of transactionItems(payload)) {
      if (item?.version === 'project-transaction-v1') transactions.push(item);
    }
  }
  return transactions;
}

export function extractProjectTransactionsFromResult(parsedResult = null) {
  const transactions = collectTransactionPayloads(parsedResult);
  if (typeof parsedResult?.response === 'string') {
    transactions.push(...extractProjectTransactionsFromText(parsedResult.response));
  }
  return transactions;
}

export function normalizePortalProjectTransaction(transaction, projectId = null) {
  const expectedTarget = portalRuntimeProjectId(projectId);
  const normalized = normalizeProjectTransaction(transaction);
  const rawTarget = normalized.targetProject;
  if (rawTarget && rawTarget !== projectId && rawTarget !== expectedTarget) {
    throw new Error(`project transaction "${normalized.id}" targets "${rawTarget}", expected "${expectedTarget}"`);
  }
  return {
    ...normalized,
    targetProject: expectedTarget,
  };
}

export function extractPortalProjectTransactions({
  text = '',
  parsedResult = null,
  projectId = null,
  applied = new Set(),
} = {}) {
  const accepted = [];
  const rejected = [];
  const rawTransactions = [
    ...extractProjectTransactionsFromText(text),
    ...extractProjectTransactionsFromResult(parsedResult),
  ];

  for (const rawTransaction of rawTransactions) {
    try {
      const transaction = normalizePortalProjectTransaction(rawTransaction, projectId);
      const key = createPortalTransactionKey(projectId, transaction);
      if (applied.has(key)) continue;
      applied.add(key);
      accepted.push(transaction);
    } catch (error) {
      rejected.push({
        id: rawTransaction?.id || null,
        error: error.message,
      });
    }
  }

  return { accepted, rejected };
}
