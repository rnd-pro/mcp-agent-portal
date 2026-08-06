/**
 * Transaction Parser — extract project-transaction-v1 blocks from chat messages.
 *
 * Parses fenced code blocks in agent messages to find structured
 * project transaction payloads.
 */

const TRANSACTION_FENCE_RE = /```([^\n`]*)\n([\s\S]*?)```/g
const AGENT_ROLES = new Set(['agent', 'assistant'])

function parseJsonBlock(source) {
  try {
    return JSON.parse(source)
  } catch {
    return null
  }
}

function transactionItems(value) {
  if (Array.isArray(value)) return value
  return value && typeof value === 'object' ? [value] : []
}

function isTransactionFence(info, payload) {
  const normalizedInfo = String(info || '').toLowerCase()
  if (normalizedInfo.includes('project-transaction-v1')) return true
  return payload?.version === 'project-transaction-v1'
    || (Array.isArray(payload) && payload.some((item) => item?.version === 'project-transaction-v1'))
}

/**
 * Extract project-transaction-v1 items from an array of chat messages.
 *
 * Scans agent/assistant messages for fenced code blocks containing
 * valid project-transaction-v1 JSON payloads.
 *
 * @param {Array<{role: string, text?: string, content?: string}>} [messages=[]]
 * @returns {Array<object>} Extracted transaction objects
 */
export function extractProjectTransactionsFromMessages(messages = []) {
  const transactions = []
  for (const message of messages || []) {
    if (!AGENT_ROLES.has(message?.role)) continue
    const text = String(message.text || message.content || '')
    for (const match of text.matchAll(TRANSACTION_FENCE_RE)) {
      const payload = parseJsonBlock(match[2].trim())
      if (!isTransactionFence(match[1], payload)) continue
      for (const item of transactionItems(payload)) {
        if (item?.version === 'project-transaction-v1' && item.id && Array.isArray(item.operations)) {
          transactions.push(item)
        }
      }
    }
  }
  return transactions
}
