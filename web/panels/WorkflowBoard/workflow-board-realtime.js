const FULL_RELOAD_KEYS = new Set([
  'workflowCards',
  'workflowRuns',
  'workflowLeases',
  'workflowTransitions',
]);

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function collectionValues(value) {
  if (Array.isArray(value)) return value;
  if (value && typeof value === 'object') return Object.values(value);
  return [];
}

function normalizeText(value) {
  return String(value ?? '').trim();
}

function entityRefs(value = {}) {
  return value.entityRefs || value.entity_refs || value.refs || {};
}

function entityProjectId(value = {}) {
  return normalizeText(value.projectId || value.project_id || entityRefs(value).projectId || entityRefs(value).project_id);
}

function entityGoalId(value = {}) {
  return normalizeText(value.goalId || value.goal_id || entityRefs(value).goalId || entityRefs(value).goal_id);
}

function entityChatId(value = {}) {
  return normalizeText(value.chatId || value.chat_id || entityRefs(value).chatId || entityRefs(value).chat_id);
}

function entityBoardId(value = {}) {
  return normalizeText(value.boardId || value.board_id || value.workflowBoardId || value.workflow_board_id);
}

function entityCardId(value = {}) {
  return normalizeText(value.cardId || value.card_id || value.workflowCardId || value.workflow_card_id);
}

function boardIds(board = {}) {
  return new Set([
    normalizeText(board.boardId),
    normalizeText(board.id),
  ].filter(Boolean));
}

function boardCardIds(board = {}) {
  return new Set(asArray(board.cards).map(card => normalizeText(card?.id)).filter(Boolean));
}

function boardVisibleCardIds(board = {}, scope = {}) {
  let goalId = normalizeText(scope.goalId);
  let chatId = normalizeText(scope.chatId);
  return new Set(asArray(board.cards)
    .filter(card => !goalId || entityGoalId(card) === goalId)
    .filter(card => !chatId || entityChatId(card) === chatId)
    .map(card => normalizeText(card?.id))
    .filter(Boolean));
}

function scopeAllowsEntity(value = {}, scope = {}) {
  let projectId = normalizeText(scope.projectId);
  let goalId = normalizeText(scope.goalId);
  let chatId = normalizeText(scope.chatId);
  let valueProjectId = entityProjectId(value);
  let valueGoalId = entityGoalId(value);
  let valueChatId = entityChatId(value);
  if (projectId && valueProjectId && valueProjectId !== projectId) return false;
  if (goalId && valueGoalId && valueGoalId !== goalId) return false;
  if (chatId && valueChatId && valueChatId !== chatId) return false;
  return true;
}

function entityMatchesBoard(value = {}, board = {}, scope = {}) {
  if (!scopeAllowsEntity(value, scope)) return false;
  let ids = boardIds(board);
  let valueBoardId = entityBoardId(value);
  if (valueBoardId && ids.size && !ids.has(valueBoardId)) return false;
  let cardId = entityCardId(value);
  if (cardId && boardCardIds(board).has(cardId)) return true;
  if (valueBoardId && ids.has(valueBoardId)) return true;
  let projectId = normalizeText(scope.projectId || board.projectId);
  return Boolean(projectId && entityProjectId(value) === projectId);
}

function boardCardMissingFromCollection(value, board = {}, scope = {}) {
  let collectionIds = new Set(collectionValues(value).map(item => normalizeText(item?.id)).filter(Boolean));
  for (let card of asArray(board.cards)) {
    let id = normalizeText(card?.id);
    if (!id || card.metadata?.runtimeOnly || card.raw?.metadata?.runtimeOnly) continue;
    if (!scopeAllowsEntity(card, scope)) continue;
    if (!collectionIds.has(id)) return true;
  }
  return false;
}

function boardLeaseMissingFromCollection(value, board = {}, scope = {}) {
  let leases = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  for (let card of asArray(board.cards)) {
    let id = normalizeText(card?.id);
    if (!id || !card.lease || !scopeAllowsEntity(card, scope)) continue;
    if (!leases[id]) return true;
  }
  return false;
}

function isWorkflowRuntimeTask(task = {}) {
  return normalizeText(task.kind) === 'workflow-runtime-task'
    || Boolean(task.workflowBoardId || task.workflow_board_id)
    || Boolean(task.workflowCardId || task.workflow_card_id)
    || Boolean(task.workflowRunId || task.workflow_run_id);
}

function taskDecision(value, board = {}, scope = {}) {
  let visibleCardIds = boardVisibleCardIds(board, scope);
  let allCardIds = boardCardIds(board);
  let ids = boardIds(board);
  let sawStatusTask = false;
  for (let task of collectionValues(value)) {
    if (!isWorkflowRuntimeTask(task) || !scopeAllowsEntity(task, scope)) continue;
    let taskBoardId = entityBoardId(task);
    if (taskBoardId && ids.size && !ids.has(taskBoardId)) continue;
    let cardId = entityCardId(task);
    if (cardId && visibleCardIds.has(cardId)) {
      sawStatusTask = true;
      continue;
    }
    if (cardId && allCardIds.has(cardId)) continue;
    if (taskBoardId && ids.has(taskBoardId)) return 'full';
    if (entityProjectId(task) && normalizeText(scope.projectId) === entityProjectId(task)) return 'full';
  }
  return sawStatusTask ? 'status' : 'skip';
}

function fullReloadCollectionDecision(key, value, board = {}, scope = {}) {
  if (key === 'workflowCards' && boardCardMissingFromCollection(value, board, scope)) return 'full';
  if (key === 'workflowLeases' && boardLeaseMissingFromCollection(value, board, scope)) return 'full';
  return collectionValues(value).some(item => entityMatchesBoard(item, board, scope)) ? 'full' : 'skip';
}

export function decideWorkflowBoardRealtimeRefresh({ key = '', value = {}, board = null, scope = {} } = {}) {
  if (!board) return FULL_RELOAD_KEYS.has(key) ? 'full' : 'skip';
  if (key === 'tasks') return taskDecision(value, board, scope);
  if (FULL_RELOAD_KEYS.has(key)) return fullReloadCollectionDecision(key, value, board, scope);
  return 'skip';
}
