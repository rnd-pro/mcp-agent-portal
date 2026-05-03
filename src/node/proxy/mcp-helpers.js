/**
 * Shared MCP proxy helpers.
 */

/**
 * Fetch the final task result from the agent-pool.
 * @param {object} mcpProxy
 * @param {string} taskId
 * @returns {Promise<any>}
 */
export async function fetchTaskResult(mcpProxy, taskId) {
  return mcpProxy.requestFromChild('agent-pool', 'tools/call', {
    name: 'get_task_result',
    arguments: { task_id: taskId },
  });
}

export default { fetchTaskResult };
