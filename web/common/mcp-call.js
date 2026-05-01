/**
 * mcpCall — shared MCP tool invocation utility.
 *
 * Eliminates duplicated _mcpCall() across panels.
 * @param {string} serverName - MCP server name (e.g. 'agent-pool')
 * @param {string} toolName - Tool to call
 * @param {Object} [args={}] - Tool arguments
 * @returns {Promise<any>} Parsed result
 */
export async function mcpCall(serverName, toolName, args = {}) {
  let res = await fetch('/api/mcp-call', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      serverName,
      method: 'tools/call',
      params: { name: toolName, arguments: args },
    }),
  });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  let data = await res.json();
  if (data.isError) throw new Error(data.content?.[0]?.text || data.error || 'Tool error');
  let text = data.content?.[0]?.text || data.text || data.response;
  try { return JSON.parse(text); }
  catch { return text; }
}

export default mcpCall;
