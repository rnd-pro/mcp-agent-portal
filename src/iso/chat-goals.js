export const CHAT_GOAL_STATUSES = Object.freeze(['active', 'paused', 'blocked', 'completed']);
export const CHAT_GOAL_QUEUE_DELIVERIES = Object.freeze(['goal', 'after']);
export const CHAT_GOAL_QUEUE_STATUSES = Object.freeze(['queued', 'applied', 'discarded']);

const STATUS_ALIASES = {
  done: 'completed',
  complete: 'completed',
  completed: 'completed',
  finished: 'completed',
  stop: 'completed',
  stopped: 'completed',
  pause: 'paused',
  paused: 'paused',
  blocked: 'blocked',
  active: 'active',
  open: 'active',
  resume: 'active',
  resumed: 'active',
};

const QUEUE_DELIVERY_ALIASES = {
  goal: 'goal',
  now: 'goal',
  immediate: 'goal',
  restart: 'goal',
  active: 'goal',
  after: 'after',
  queued: 'after',
  queue: 'after',
  later: 'after',
  next: 'after',
};

const QUEUE_STATUS_ALIASES = {
  queued: 'queued',
  pending: 'queued',
  active: 'queued',
  applied: 'applied',
  sent: 'applied',
  done: 'applied',
  discarded: 'discarded',
  deleted: 'discarded',
  cleared: 'discarded',
};

function cleanString(value = '') {
  return String(value || '').trim();
}

function normalizeStringList(values = []) {
  let list = Array.isArray(values) ? values : [values];
  return [...new Set(list.map(cleanString).filter(Boolean))];
}

function normalizeScenarioList(values = []) {
  let list = Array.isArray(values) ? values : [values];
  return [...new Set(list.map((item) => {
    if (item && typeof item === 'object') {
      return cleanString(item.title || item.name || item.description || item.id);
    }
    return cleanString(item);
  }).filter(Boolean))];
}

export function normalizeChatGoalStatus(status = 'active') {
  return STATUS_ALIASES[cleanString(status).toLowerCase()] || 'active';
}

export function normalizeChatGoalQueueDelivery(delivery = 'after') {
  return QUEUE_DELIVERY_ALIASES[cleanString(delivery).toLowerCase()] || 'after';
}

export function normalizeChatGoalQueueStatus(status = 'queued') {
  return QUEUE_STATUS_ALIASES[cleanString(status).toLowerCase()] || 'queued';
}

export function normalizeChatGoalInput(input = {}) {
  return {
    title: cleanString(input.title || input.name || 'Untitled goal'),
    description: cleanString(input.description || input.details || ''),
    status: normalizeChatGoalStatus(input.status),
    context: normalizeStringList(input.context),
    scenarios: normalizeScenarioList(input.scenarios || input.scenario),
  };
}

export function formatChatGoalPromptBlock(goal = null) {
  if (!goal?.id || !goal?.title) return '';
  let payload = {
    id: goal.id,
    title: goal.title,
    status: normalizeChatGoalStatus(goal.status),
  };
  if (goal.description) payload.description = goal.description;
  if (Array.isArray(goal.context) && goal.context.length) payload.context = goal.context;
  if (Array.isArray(goal.scenarios) && goal.scenarios.length) payload.scenarios = goal.scenarios;
  return `[Active Goal]\n${JSON.stringify(payload, null, 2)}`;
}

export function formatChatGoalIntentPromptBlock({ chatId = '', projectId = '' } = {}) {
  let payload = {
    mode: 'goal-intent',
    instruction: 'Goal mode is enabled. If no active goal is bound to this chat, create and name one with create_goal. Treat this prompt as part of that goal.',
  };
  if (chatId) payload.chatId = chatId;
  if (projectId) payload.projectId = projectId;
  return `[Goal Intent]\n${JSON.stringify(payload, null, 2)}`;
}

export function normalizeChatGoalQueueMessage(input = {}) {
  return {
    id: cleanString(input.id),
    text: cleanString(input.text || input.prompt || input.message),
    delivery: normalizeChatGoalQueueDelivery(input.delivery || input.mode || input.target),
    status: normalizeChatGoalQueueStatus(input.status),
    createdBy: cleanString(input.createdBy || input.created_by || ''),
    updatedBy: cleanString(input.updatedBy || input.updated_by || ''),
    createdAt: Number(input.createdAt || 0) || 0,
    updatedAt: Number(input.updatedAt || 0) || 0,
    appliedAt: Number(input.appliedAt || 0) || 0,
    discardedAt: Number(input.discardedAt || 0) || 0,
  };
}

export function filterChatGoalQueue(goal = null, filters = {}) {
  let queue = Array.isArray(goal?.queue) ? goal.queue : [];
  let delivery = filters.delivery ? normalizeChatGoalQueueDelivery(filters.delivery) : null;
  let status = filters.status ? normalizeChatGoalQueueStatus(filters.status) : null;
  return queue
    .map(normalizeChatGoalQueueMessage)
    .filter((item) => item.id && item.text)
    .filter((item) => !delivery || item.delivery === delivery)
    .filter((item) => !status || item.status === status);
}

export function formatChatGoalQueuePromptBlock(goal = null, messages = []) {
  let queue = Array.isArray(messages) ? messages.map(normalizeChatGoalQueueMessage) : [];
  queue = queue.filter((item) => item.id && item.text);
  if (!goal?.id || queue.length === 0) return '';
  let payload = {
    goalId: goal.id,
    goalTitle: goal.title || 'Goal',
    instruction: 'Apply these queued user messages to the active goal now. They supersede the currently running provider turn if the chat was restarted.',
    messages: queue.map((item) => ({
      id: item.id,
      delivery: item.delivery,
      text: item.text,
    })),
  };
  return `[Goal Queue]\n${JSON.stringify(payload, null, 2)}`;
}

export function buildPromptWithChatGoal(prompt = '', goal = null) {
  let goalBlock = formatChatGoalPromptBlock(goal);
  let body = String(prompt || '');
  if (!goalBlock || body.includes('[Active Goal]')) return body;
  return `${goalBlock}\n\n${body}`;
}

export function toChatGoalContextItem(goal = null) {
  if (!goal?.id) return null;
  let title = goal.title || 'Goal';
  return {
    type: 'goal',
    key: `goal:${goal.id}`,
    goalId: goal.id,
    name: title,
    title: `Goal: ${title}`,
    icon: 'flag',
    status: normalizeChatGoalStatus(goal.status),
  };
}
