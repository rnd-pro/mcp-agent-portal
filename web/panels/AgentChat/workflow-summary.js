import { fetchWorkflowBoard } from '../../services/workflow-board.js';

const ACTIVE_COLUMN_IDS = new Set(['ready', 'in-progress', 'quality-audit', 'commit-publish']);
const RECOVERY_FLAG_KEYS = new Set([
  'needs_resume',
  'needs-audit',
  'needs_audit',
  'recovering',
  'stale',
  'lost',
  'blocked',
]);

function normalizeText(value, fallback = '') {
  let text = String(value ?? '').replace(/\s+/g, ' ').trim();
  return text || fallback;
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeFlag(value) {
  return normalizeText(value).toLowerCase();
}

function cardMatchesWorkflowRef(card = {}, filters = {}) {
  let refs = card.entityRefs || {};
  let goalId = normalizeText(filters.goalId || filters.goal_id);
  let chatId = normalizeText(filters.chatId || filters.chat_id);

  if (goalId && refs.goalId !== goalId) return false;
  if (chatId && refs.chatId !== chatId) return false;
  return Boolean(goalId || chatId);
}

function cardNeedsRecovery(card = {}) {
  return asArray(card.flags).some(flag => RECOVERY_FLAG_KEYS.has(normalizeFlag(flag)));
}

function cardBlocked(card = {}) {
  if (normalizeText(card.blocker)) return true;
  return asArray(card.flags).some(flag => normalizeFlag(flag) === 'blocked');
}

function latestCard(cards = []) {
  let activeCards = cards.filter(card => card.columnId !== 'done');
  let candidates = activeCards.length ? activeCards : cards;
  return [...candidates].sort((a, b) => {
    let aTime = Date.parse(a.updatedAt || a.createdAt || '') || 0;
    let bTime = Date.parse(b.updatedAt || b.createdAt || '') || 0;
    if (aTime !== bTime) return bTime - aTime;
    return normalizeText(a.id).localeCompare(normalizeText(b.id));
  })[0] || null;
}

export function summarizeGoalWorkflowBoard(board = {}, filters = {}) {
  let cards = asArray(board.cards).filter(card => cardMatchesWorkflowRef(card, filters));
  let columns = asArray(board.columns);
  let columnById = new Map(columns.map(column => [column.id, column]));
  let current = latestCard(cards);
  let stageColumn = current ? columnById.get(current.columnId) : null;

  return {
    goalId: normalizeText(filters.goalId || filters.goal_id),
    chatId: normalizeText(filters.chatId || filters.chat_id),
    projectId: normalizeText(filters.projectId || filters.project_id),
    cards,
    cardCount: cards.length,
    active: cards.filter(card => ACTIVE_COLUMN_IDS.has(card.columnId)).length,
    blocked: cards.filter(cardBlocked).length,
    recovery: cards.filter(cardNeedsRecovery).length,
    done: cards.filter(card => card.columnId === 'done').length,
    stageColumnId: current?.columnId || '',
    stageLabel: stageColumn?.title || current?.columnId || '',
  };
}

export function formatGoalWorkflowSummary(summary = {}, labels = {}) {
  if (!summary.cardCount) return '';
  let cardLabel = summary.cardCount === 1
    ? normalizeText(labels.cardSingular, 'card')
    : normalizeText(labels.cardPlural, 'cards');
  let parts = [
    summary.stageLabel || 'Workflow',
    `${summary.cardCount} ${cardLabel}`,
  ];
  if (summary.active) parts.push(`${summary.active} ${normalizeText(labels.active, 'active')}`);
  if (summary.blocked) parts.push(`${summary.blocked} ${normalizeText(labels.blocked, 'blocked')}`);
  if (summary.recovery) parts.push(`${summary.recovery} ${normalizeText(labels.recovery, 'recovery')}`);
  if (summary.done && summary.done === summary.cardCount) {
    parts.push(normalizeText(labels.done, 'done'));
  }
  return parts.join(' | ');
}

export function buildGoalWorkflowBoardHash(filters = {}) {
  let params = new URLSearchParams();
  let projectId = normalizeText(filters.projectId || filters.project_id);
  let goalId = normalizeText(filters.goalId || filters.goal_id);
  let chatId = normalizeText(filters.chatId || filters.chat_id);
  if (projectId) params.set('project', projectId);
  if (goalId) params.set('goal', goalId);
  if (chatId) params.set('chat', chatId);
  let query = params.toString();
  return query ? `#workflow-board?${query}` : '#workflow-board';
}

export async function fetchGoalWorkflowSummary(filters = {}, options = {}) {
  let board = await fetchWorkflowBoard({
    projectId: filters.projectId || filters.project_id,
    goalId: filters.goalId || filters.goal_id,
    chatId: filters.chatId || filters.chat_id,
  }, options);
  return summarizeGoalWorkflowBoard(board, filters);
}
