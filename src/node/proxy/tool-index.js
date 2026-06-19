// @ctx tool-index.ctx
import { isPublicMcpToolServer } from './mcp-tool-visibility.js';

export const CHILD_TOOLS_LIST_TIMEOUT_MS = 5_000;

/**
 * ToolIndex — cached registry of all tools from all child MCP servers.
 * Supports keyword search, tag filtering, and server-based lookup.
 * Auto-refreshes when servers are added/removed.
 */

/** Builds and maintains an index of tools across all child MCP servers. */
export class ToolIndex {
  constructor() {
    /** @type {Map<string, { tool: object, server: string }>} name → entry */
    this.tools = new Map();
    /** @type {Map<string, string[]>} tag → tool names */
    this.tags = new Map();
    this.failures = [];
    this._ready = false;
  }

  /**
   * Rebuild the full tool index from all child servers.
   * @param {import('./mcp-proxy.js').MCPProxyManager} proxyManager
   */
  async rebuild(proxyManager) {
    this.tools.clear();
    this.failures = [];

    for (let serverName of proxyManager.servers.keys()) {
      if (!isPublicMcpToolServer(serverName)) continue;
      try {
        let response = await proxyManager.requestFromChild(
          serverName,
          'tools/list',
          {},
          CHILD_TOOLS_LIST_TIMEOUT_MS,
        );
        if (response?.tools) {
          for (let tool of response.tools) {
            this.tools.set(tool.name, { tool, server: serverName });
          }
        }
      } catch (err) {
        this.failures.push({
          server: serverName,
          message: err.message,
        });
      }
    }

    this._ready = true;
  }

  /**
   * Set user-defined tags from config.
   * @param {Record<string, string[]>} tagMap  e.g. { "code-analysis": ["get_skeleton", "get_complexity"] }
   */
  setTags(tagMap) {
    this.tags.clear();
    if (!tagMap) return;
    for (let [tag, toolNames] of Object.entries(tagMap)) {
      this.tags.set(tag, toolNames);
    }
  }

  /**
   * Search tools by keyword, tag, or server name.
   * @param {Object|{ query?: string, tag?: string, server?: string }} params
   * @returns {{ tools: { name: string, description: string, server: string }[], total: number }}
   */
  search(params = {}) {
    let { query, tag, server } = params;
    let results = [];

    // If searching by tag
    if (tag) {
      let tagTools = this.tags.get(tag);
      if (tagTools) {
        for (let name of tagTools) {
          let entry = this.tools.get(name);
          if (entry && isPublicMcpToolServer(entry.server)) {
            results.push({
              name,
              description: entry.tool.description || '',
              server: entry.server,
            });
          }
        }
      }
      return { tools: results, total: this.getPublicToolCount() };
    }

    // If filtering by server
    if (server) {
      for (let [name, entry] of this.tools) {
        if (entry.server === server && isPublicMcpToolServer(entry.server)) {
          results.push({
            name,
            description: entry.tool.description || '',
            server: entry.server,
          });
        }
      }
      return { tools: results, total: this.getPublicToolCount() };
    }

    // Keyword search (name + description)
    if (query) {
      let q = query.toLowerCase();
      for (let [name, entry] of this.tools) {
        if (!isPublicMcpToolServer(entry.server)) continue;
        let desc = (entry.tool.description || '').toLowerCase();
        if (name.toLowerCase().includes(q) || desc.includes(q)) {
          results.push({
            name,
            description: entry.tool.description || '',
            server: entry.server,
          });
        }
      }
      return { tools: results, total: this.getPublicToolCount() };
    }

    // No filter — return all (summary only)
    for (let [name, entry] of this.tools) {
      if (!isPublicMcpToolServer(entry.server)) continue;
      results.push({
        name,
        description: entry.tool.description || '',
        server: entry.server,
      });
    }
    return { tools: results, total: this.getPublicToolCount() };
  }

  /**
   * Get the full tool definition (with inputSchema) for a specific tool.
   * @param {string} name
   * @returns {{ tool: object, server: string } | null}
   */
  get(name) {
    let entry = this.tools.get(name) || null;
    if (!entry || !isPublicMcpToolServer(entry.server)) return null;
    return entry;
  }

  /**
   * Get list of available tags.
   * @returns {string[]}
   */
  getAvailableTags() {
    return [...this.tags.keys()];
  }

  /**
   * Get list of servers with tool counts.
   * @returns {{ name: string, toolCount: number }[]}
   */
  getServers() {
    let counts = new Map();
    for (let entry of this.tools.values()) {
      if (!isPublicMcpToolServer(entry.server)) continue;
      counts.set(entry.server, (counts.get(entry.server) || 0) + 1);
    }
    return [...counts.entries()].map(([name, toolCount]) => ({ name, toolCount }));
  }

  getPublicToolCount() {
    let count = 0;
    for (let entry of this.tools.values()) {
      if (isPublicMcpToolServer(entry.server)) count++;
    }
    return count;
  }

  get isReady() {
    return this._ready;
  }
}

export default ToolIndex;
