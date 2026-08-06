/**
 * Goal workflow board summarizer.
 *
 * Reduces a kanban-style workflow board (columns plus cards) to a compact
 * progress summary for a single goal/chat, then formats that summary as a short
 * human-readable status line. Pure and dependency-free — safe in Node and the
 * browser.
 *
 * Board fetching and navigation are NOT included: the service-coupled
 * `fetchGoalWorkflowSummary` (board transport) and `buildGoalWorkflowBoardHash`
 * (portal hash route) stay portal-side. This library ships only the reduction
 * and formatting.
 *
 * @module symbiote-ui/chat/workflow-summary
 */

const ACTIVE_COLUMN_IDS = Object.freeze(
  new Set(['ready', 'in-progress', 'quality-audit', 'commit-publish'])
);

const RECOVERY_FLAG_KEYS = Object.freeze(
  new Set([
    'needs_resume',
    'needs-audit',
    'needs_audit',
    'recovering',
    'stale',
    'lost',
    'blocked',
  ])
);

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
  return asArray(card.flags).some((flag) => RECOVERY_FLAG_KEYS.has(normalizeFlag(flag)));
}

function cardBlocked(card = {}) {
  if (normalizeText(card.blocker)) return true;
  return asArray(card.flags).some((flag) => normalizeFlag(flag) === 'blocked');
}

function latestCard(cards = []) {
  let activeCards = cards.filter((card) => card.columnId !== 'done');
  let candidates = activeCards.length ? activeCards : cards;
  return (
    [...candidates].sort((a, b) => {
      let aTime = Date.parse(a.updatedAt || a.createdAt || '') || 0;
      let bTime = Date.parse(b.updatedAt || b.createdAt || '') || 0;
      if (aTime !== bTime) return bTime - aTime;
      return normalizeText(a.id).localeCompare(normalizeText(b.id));
    })[0] || null
  );
}

/**
 * Reduce a workflow board to a goal/chat-scoped progress summary.
 *
 * Cards are filtered to the goal and/or chat named by `filters`; with no
 * goal/chat filter no cards match. The summary counts active, blocked, recovery,
 * and done cards and identifies the most recently updated non-done card as the
 * current stage.
 *
 * @param {Object} [board] - Board with `columns` and `cards` arrays. Each card
 *   may carry `columnId`, `entityRefs.goalId`/`entityRefs.chatId`, `flags`,
 *   `blocker`, `updatedAt`/`createdAt`, and `id`.
 * @param {Object} [filters] - Scope filters. Accepts camelCase or snake_case:
 *   `goalId`/`goal_id`, `chatId`/`chat_id`, `projectId`/`project_id`.
 * @returns {{
 *   goalId: string,
 *   chatId: string,
 *   projectId: string,
 *   cards: Array<Object>,
 *   cardCount: number,
 *   active: number,
 *   blocked: number,
 *   recovery: number,
 *   done: number,
 *   stageColumnId: string,
 *   stageLabel: string,
 * }} Goal workflow summary.
 */
export function summarizeGoalWorkflowBoard(board = {}, filters = {}) {
  let cards = asArray(board.cards).filter((card) => cardMatchesWorkflowRef(card, filters));
  let columns = asArray(board.columns);
  let columnById = new Map(columns.map((column) => [column.id, column]));
  let current = latestCard(cards);
  let stageColumn = current ? columnById.get(current.columnId) : null;

  return {
    goalId: normalizeText(filters.goalId || filters.goal_id),
    chatId: normalizeText(filters.chatId || filters.chat_id),
    projectId: normalizeText(filters.projectId || filters.project_id),
    cards,
    cardCount: cards.length,
    active: cards.filter((card) => ACTIVE_COLUMN_IDS.has(card.columnId)).length,
    blocked: cards.filter(cardBlocked).length,
    recovery: cards.filter(cardNeedsRecovery).length,
    done: cards.filter((card) => card.columnId === 'done').length,
    stageColumnId: current?.columnId || '',
    stageLabel: stageColumn?.title || current?.columnId || '',
  };
}

/**
 * Format a goal workflow summary as a short status line.
 *
 * Returns an empty string when the summary has no cards. Otherwise builds a
 * pipe-separated line beginning with the stage label and card count, then
 * appends active, blocked, and recovery counts when non-zero, and a done marker
 * when every card is done. Count nouns and state words are supplied via
 * `labels` for localization.
 *
 * @param {Object} [summary] - Summary from {@link summarizeGoalWorkflowBoard}.
 * @param {Object} [labels] - Localized labels: `cardSingular`, `cardPlural`,
 *   `active`, `blocked`, `recovery`, `done`.
 * @returns {string} Single-line status text, or '' when there are no cards.
 */
export function formatGoalWorkflowSummary(summary = {}, labels = {}) {
  if (!summary.cardCount) return '';
  let cardLabel =
    summary.cardCount === 1
      ? normalizeText(labels.cardSingular, 'card')
      : normalizeText(labels.cardPlural, 'cards');
  let parts = [summary.stageLabel || 'Workflow', `${summary.cardCount} ${cardLabel}`];
  if (summary.active) parts.push(`${summary.active} ${normalizeText(labels.active, 'active')}`);
  if (summary.blocked) parts.push(`${summary.blocked} ${normalizeText(labels.blocked, 'blocked')}`);
  if (summary.recovery) {
    parts.push(`${summary.recovery} ${normalizeText(labels.recovery, 'recovery')}`);
  }
  if (summary.done && summary.done === summary.cardCount) {
    parts.push(normalizeText(labels.done, 'done'));
  }
  return parts.join(' | ');
}
