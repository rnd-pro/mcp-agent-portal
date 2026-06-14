export const INTERNAL_MCP_TOOL_SERVERS = new Set(['agent-pool']);

export const INTERNAL_MCP_TOOL_NAMES = new Set([
  'get_usage_guide',
  'delegate_task',
  'delegate_task_readonly',
  'mcp_agent-portal_delegate_task',
  'mcp_agent-portal_delegate_task_readonly',
  'consult_peer',
  'get_task_result',
  'cancel_task',
  'finish_task',
  'list_sessions',
  'list_tasks',
  'resolve_context',
  'list_skills',
  'get_skill_content',
  'create_skill',
  'delete_skill',
  'install_skill',
  'schedule_task',
  'list_schedules',
  'cancel_schedule',
  'get_scheduled_results',
  'create_pipeline',
  'run_pipeline',
  'list_pipelines',
  'get_pipeline_status',
  'cancel_pipeline',
  'signal_step_complete',
  'bounce_back',
  'create_group',
  'list_groups',
  'delete_group',
  'delegate_to_group',
  'send_message',
  'get_messages',
  'save_script',
  'list_scripts',
  'track_files',
  'untrack_files',
  'get_tracked_files',
  'list_workflows',
  'search_by_tags',
  'get_workflow_content',
  'get_board_state',
]);

export function isPublicMcpToolServer(serverName = '') {
  return !INTERNAL_MCP_TOOL_SERVERS.has(String(serverName || ''));
}

export function isInternalMcpToolName(name = '') {
  return INTERNAL_MCP_TOOL_NAMES.has(String(name || ''));
}

export function filterPublicMcpTools(tools = []) {
  return tools.filter(tool => !isInternalMcpToolName(tool?.name));
}

export function splitMcpHealthStatus(health = {}) {
  let publicHealth = {};
  let internalHealth = {};
  for (let [name, status] of Object.entries(health || {})) {
    if (isPublicMcpToolServer(name)) publicHealth[name] = status;
    else internalHealth[name] = status;
  }
  return { publicHealth, internalHealth };
}

export function internalMcpToolBlockedResult(name = '') {
  return {
    content: [{
      type: 'text',
      text: `Agent Pool tool \`${name}\` is internal to Agent Portal. Use Agent Portal chat orchestration tools such as \`create_chat\` and \`resume_chat\` instead.`,
    }],
    isError: true,
  };
}
