export const GOAL_META_TOOLS = [
  {
    name: 'create_goal',
    description: 'Create a chat goal for Agent Portal. Orchestrators use this to define the current objective, context, and scenarios for a chat.',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Short goal title.' },
        description: { type: 'string', description: 'Optional goal details.' },
        chatId: { type: 'string', description: 'Chat ID to bind the goal to. Optional when the MCP session is chat-scoped.' },
        chat_id: { type: 'string', description: 'Alias for chatId.' },
        projectId: { type: 'string', description: 'Project ID for project-scoped goals. Optional; inferred from chat when possible.' },
        context: { type: 'array', items: { type: 'string' }, description: 'Durable context labels or facts attached to the goal.' },
        scenarios: { type: 'array', items: { type: 'string' }, description: 'Goal scenarios or workflows to keep in scope.' },
      },
      required: ['title'],
    },
  },
  {
    name: 'pause_goal',
    description: 'Pause a chat goal while keeping it attached to its chat.',
    inputSchema: {
      type: 'object',
      properties: {
        goalId: { type: 'string', description: 'Goal ID.' },
        goal_id: { type: 'string', description: 'Alias for goalId.' },
        reason: { type: 'string', description: 'Optional pause note.' },
      },
      required: ['goalId'],
    },
  },
  {
    name: 'resume_goal',
    description: 'Resume a paused chat goal and make it active.',
    inputSchema: {
      type: 'object',
      properties: {
        goalId: { type: 'string', description: 'Goal ID.' },
        goal_id: { type: 'string', description: 'Alias for goalId.' },
      },
      required: ['goalId'],
    },
  },
  {
    name: 'stop_goal',
    description: 'Stop a chat goal by marking it completed.',
    inputSchema: {
      type: 'object',
      properties: {
        goalId: { type: 'string', description: 'Goal ID.' },
        goal_id: { type: 'string', description: 'Alias for goalId.' },
        reason: { type: 'string', description: 'Optional stop note.' },
      },
      required: ['goalId'],
    },
  },
  {
    name: 'block_goal',
    description: 'Mark a chat goal as blocked with a concrete reason.',
    inputSchema: {
      type: 'object',
      properties: {
        goalId: { type: 'string', description: 'Goal ID.' },
        goal_id: { type: 'string', description: 'Alias for goalId.' },
        reason: { type: 'string', description: 'Why the goal is blocked.' },
      },
      required: ['goalId', 'reason'],
    },
  },
  {
    name: 'complete_goal',
    description: 'Mark a chat goal as completed.',
    inputSchema: {
      type: 'object',
      properties: {
        goalId: { type: 'string', description: 'Goal ID.' },
        goal_id: { type: 'string', description: 'Alias for goalId.' },
        reason: { type: 'string', description: 'Optional completion note.' },
      },
      required: ['goalId'],
    },
  },
  {
    name: 'delete_goal',
    description: 'Delete a chat goal and clear it from the owning chat.',
    inputSchema: {
      type: 'object',
      properties: {
        goalId: { type: 'string', description: 'Goal ID.' },
        goal_id: { type: 'string', description: 'Alias for goalId.' },
      },
      required: ['goalId'],
    },
  },
  {
    name: 'enqueue_goal_message',
    description: 'Queue a user message for a chat goal. Use delivery "goal" for an immediate restart request and "after" for FIFO after the current run.',
    inputSchema: {
      type: 'object',
      properties: {
        goalId: { type: 'string', description: 'Goal ID.' },
        goal_id: { type: 'string', description: 'Alias for goalId.' },
        text: { type: 'string', description: 'User message to queue.' },
        delivery: { type: 'string', enum: ['goal', 'after'], description: 'Queue delivery mode.' },
      },
      required: ['goalId', 'text'],
    },
  },
  {
    name: 'list_goal_messages',
    description: 'List queued messages for a chat goal.',
    inputSchema: {
      type: 'object',
      properties: {
        goalId: { type: 'string', description: 'Goal ID.' },
        goal_id: { type: 'string', description: 'Alias for goalId.' },
        delivery: { type: 'string', enum: ['goal', 'after'], description: 'Optional delivery filter.' },
        status: { type: 'string', enum: ['queued', 'applied', 'discarded'], description: 'Optional status filter.' },
      },
      required: ['goalId'],
    },
  },
  {
    name: 'mark_goal_message_applied',
    description: 'Mark one queued goal message as applied.',
    inputSchema: {
      type: 'object',
      properties: {
        goalId: { type: 'string', description: 'Goal ID.' },
        goal_id: { type: 'string', description: 'Alias for goalId.' },
        messageId: { type: 'string', description: 'Queued message ID.' },
        message_id: { type: 'string', description: 'Alias for messageId.' },
      },
      required: ['goalId', 'messageId'],
    },
  },
  {
    name: 'clear_goal_messages',
    description: 'Clear queued messages for a chat goal.',
    inputSchema: {
      type: 'object',
      properties: {
        goalId: { type: 'string', description: 'Goal ID.' },
        goal_id: { type: 'string', description: 'Alias for goalId.' },
        status: { type: 'string', enum: ['queued', 'applied', 'discarded'], description: 'Optional status filter.' },
      },
      required: ['goalId'],
    },
  },
  {
    name: 'get_goal',
    description: 'Get one Agent Portal chat goal by ID.',
    inputSchema: {
      type: 'object',
      properties: {
        goalId: { type: 'string', description: 'Goal ID.' },
        goal_id: { type: 'string', description: 'Alias for goalId.' },
      },
      required: ['goalId'],
    },
  },
  {
    name: 'list_goals',
    description: 'List Agent Portal chat goals, optionally filtered by chat, project, or status.',
    inputSchema: {
      type: 'object',
      properties: {
        chatId: { type: 'string', description: 'Filter by chat ID.' },
        chat_id: { type: 'string', description: 'Alias for chatId.' },
        projectId: { type: 'string', description: 'Filter by project ID.' },
        project_id: { type: 'string', description: 'Alias for projectId.' },
        status: { type: 'string', enum: ['active', 'paused', 'blocked', 'completed'], description: 'Filter by goal status.' },
      },
    },
  },
  {
    name: 'select_goal',
    description: 'Select or clear the active goal for a chat.',
    inputSchema: {
      type: 'object',
      properties: {
        chatId: { type: 'string', description: 'Chat ID.' },
        chat_id: { type: 'string', description: 'Alias for chatId.' },
        goalId: { type: 'string', description: 'Goal ID to select. Omit or pass empty to clear.' },
        goal_id: { type: 'string', description: 'Alias for goalId.' },
      },
      required: ['chatId'],
    },
  },
];

export function isPortalGoalTool(toolName) {
  return GOAL_META_TOOLS.some((tool) => tool.name === toolName);
}

function textResult(value) {
  let text = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
  return { content: [{ type: 'text', text }] };
}

function broadcastGoal(proxyManager, goal) {
  proxyManager?.broadcastMonitor?.({
    jsonrpc: '2.0',
    method: 'patch',
    params: { path: 'goals.updated', value: goal },
  });
  if (goal?.chatId) {
    proxyManager?.broadcastMonitor?.({
      jsonrpc: '2.0',
      method: 'patch',
      params: { path: 'chats.updated', value: goal.chatId },
    });
  }
}

function broadcastChat(proxyManager, chatId) {
  if (!chatId) return;
  proxyManager?.broadcastMonitor?.({
    jsonrpc: '2.0',
    method: 'patch',
    params: { path: 'chats.updated', value: chatId },
  });
}

export async function handlePortalGoalTool(proxyManager, toolName, args = {}, source = 'mcp') {
  let { getStateGraph } = await import('../state-graph.js');
  let sg = getStateGraph();

  if (toolName === 'create_goal') {
    if (!args.title) return { ...textResult('Missing title.'), isError: true };
    let goal = sg.createChatGoal({
      ...args,
      chatId: args.chatId || args.chat_id || null,
      projectId: args.projectId || args.project_id || null,
      createdBy: source,
    }, source);
    broadcastGoal(proxyManager, goal);
    return textResult({ ok: true, goal });
  }

  if (toolName === 'block_goal') {
    let goalId = args.goalId || args.goal_id;
    if (!goalId || !args.reason) return { ...textResult('Missing goalId or reason.'), isError: true };
    let goal = sg.updateChatGoal(goalId, { status: 'blocked', reason: args.reason, updatedBy: source }, source);
    if (!goal) return { ...textResult(`Goal not found: ${goalId}`), isError: true };
    broadcastGoal(proxyManager, goal);
    return textResult({ ok: true, goal });
  }

  if (toolName === 'pause_goal') {
    let goalId = args.goalId || args.goal_id;
    if (!goalId) return { ...textResult('Missing goalId.'), isError: true };
    let goal = sg.updateChatGoal(goalId, { status: 'paused', reason: args.reason || '', updatedBy: source }, source);
    if (!goal) return { ...textResult(`Goal not found: ${goalId}`), isError: true };
    broadcastGoal(proxyManager, goal);
    return textResult({ ok: true, goal });
  }

  if (toolName === 'resume_goal') {
    let goalId = args.goalId || args.goal_id;
    if (!goalId) return { ...textResult('Missing goalId.'), isError: true };
    let goal = sg.updateChatGoal(goalId, { status: 'active', updatedBy: source }, source);
    if (!goal) return { ...textResult(`Goal not found: ${goalId}`), isError: true };
    broadcastGoal(proxyManager, goal);
    return textResult({ ok: true, goal });
  }

  if (toolName === 'stop_goal') {
    let goalId = args.goalId || args.goal_id;
    if (!goalId) return { ...textResult('Missing goalId.'), isError: true };
    let goal = sg.updateChatGoal(goalId, { status: 'completed', reason: args.reason || '', updatedBy: source }, source);
    if (!goal) return { ...textResult(`Goal not found: ${goalId}`), isError: true };
    broadcastGoal(proxyManager, goal);
    return textResult({ ok: true, goal });
  }

  if (toolName === 'complete_goal') {
    let goalId = args.goalId || args.goal_id;
    if (!goalId) return { ...textResult('Missing goalId.'), isError: true };
    let goal = sg.updateChatGoal(goalId, { status: 'completed', reason: args.reason || '', updatedBy: source }, source);
    if (!goal) return { ...textResult(`Goal not found: ${goalId}`), isError: true };
    broadcastGoal(proxyManager, goal);
    return textResult({ ok: true, goal });
  }

  if (toolName === 'delete_goal') {
    let goalId = args.goalId || args.goal_id;
    if (!goalId) return { ...textResult('Missing goalId.'), isError: true };
    let goal = sg.deleteChatGoal(goalId, source);
    if (!goal) return { ...textResult(`Goal not found: ${goalId}`), isError: true };
    broadcastGoal(proxyManager, goal);
    return textResult({ ok: true, goal });
  }

  if (toolName === 'enqueue_goal_message') {
    let goalId = args.goalId || args.goal_id;
    if (!goalId || !args.text) return { ...textResult('Missing goalId or text.'), isError: true };
    let result = sg.enqueueChatGoalMessage(goalId, {
      text: args.text,
      delivery: args.delivery || 'after',
      createdBy: source,
    }, source);
    if (!result) return { ...textResult(`Goal not found or message empty: ${goalId}`), isError: true };
    broadcastGoal(proxyManager, result.goal);
    return textResult({ ok: true, goal: result.goal, message: result.item });
  }

  if (toolName === 'list_goal_messages') {
    let goalId = args.goalId || args.goal_id;
    if (!goalId) return { ...textResult('Missing goalId.'), isError: true };
    let messages = sg.listChatGoalQueue(goalId, {
      delivery: args.delivery || null,
      status: args.status || 'queued',
    });
    if (!messages) return { ...textResult(`Goal not found: ${goalId}`), isError: true };
    return textResult({ ok: true, messages });
  }

  if (toolName === 'mark_goal_message_applied') {
    let goalId = args.goalId || args.goal_id;
    let messageId = args.messageId || args.message_id;
    if (!goalId || !messageId) return { ...textResult('Missing goalId or messageId.'), isError: true };
    let result = sg.updateChatGoalQueueMessage(goalId, messageId, { status: 'applied' }, source);
    if (!result) return { ...textResult(`Queued goal message not found: ${messageId}`), isError: true };
    broadcastGoal(proxyManager, result.goal);
    return textResult({ ok: true, goal: result.goal, message: result.item });
  }

  if (toolName === 'clear_goal_messages') {
    let goalId = args.goalId || args.goal_id;
    if (!goalId) return { ...textResult('Missing goalId.'), isError: true };
    let result = sg.clearChatGoalQueue(goalId, { status: args.status || 'queued' }, source);
    if (!result) return { ...textResult(`Goal not found: ${goalId}`), isError: true };
    broadcastGoal(proxyManager, result.goal);
    return textResult({ ok: true, goal: result.goal, cleared: result.cleared });
  }

  if (toolName === 'get_goal') {
    let goalId = args.goalId || args.goal_id;
    if (!goalId) return { ...textResult('Missing goalId.'), isError: true };
    let goal = sg.getChatGoal(goalId);
    if (!goal) return { ...textResult(`Goal not found: ${goalId}`), isError: true };
    return textResult({ ok: true, goal });
  }

  if (toolName === 'list_goals') {
    return textResult({
      ok: true,
      goals: sg.listChatGoals({
        chatId: args.chatId || args.chat_id || null,
        projectId: args.projectId || args.project_id || null,
        status: args.status || null,
      }),
    });
  }

  if (toolName === 'select_goal') {
    let chatId = args.chatId || args.chat_id;
    if (!chatId) return { ...textResult('Missing chatId.'), isError: true };
    let goalId = args.goalId || args.goal_id || null;
    let goal = sg.selectChatGoal(chatId, goalId, source);
    if (goal) broadcastGoal(proxyManager, goal);
    else broadcastChat(proxyManager, chatId);
    return textResult({ ok: true, goal });
  }

  return { ...textResult(`Unknown goal tool: ${toolName}`), isError: true };
}
