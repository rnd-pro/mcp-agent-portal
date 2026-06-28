import { fetchWorkflowBoard } from '../../services/workflow-board.js';
import {
  summarizeGoalWorkflowBoard,
  formatGoalWorkflowSummary,
} from 'symbiote-ui/chat/workflow-summary.js';

export { summarizeGoalWorkflowBoard, formatGoalWorkflowSummary };

function normalizeText(value, fallback = '') {
  let text = String(value ?? '').replace(/\s+/g, ' ').trim();
  return text || fallback;
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
