// @ctx tool-index.ctx
/**
 * ToolIndex — cached registry of all tools from all child MCP servers.
 * Supports keyword search, tag filtering, and server-based lookup.
 * Auto-refreshes when servers are added/removed.
 */

export class ToolIndex {
  constructor() {
    /** @type {Map<string, { tool: object, server: string }>} name → entry */
    this.tools = new Map();
    /** @type {Map<string, string[]>} tag → tool names */
    this.tags = new Map();
    this._ready = false;
  }

  /**
   * Rebuild the full tool index from all child servers.
   * @param {import('./mcp-proxy.js').MCPProxyManager} proxyManager
   */
  async rebuild(proxyManager) {
    this.tools.clear();

    for (let serverName of proxyManager.servers.keys()) {
      try {
        let response = await proxyManager.requestFromChild(serverName, 'tools/list', {});
        if (response?.tools) {
          for (let tool of response.tools) {
            this.tools.set(tool.name, { tool, server: serverName });
          }
        }
      } catch (err) {
        console.error(`🟡 [ToolIndex] Failed to index tools from "${serverName}":`, err.message);
      }
    }

    this._ready = true;
    console.error(`✅ [ToolIndex] Indexed ${this.tools.size} tools from ${proxyManager.servers.size} servers`);
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
   * @param {{ query?: string, tag?: string, server?: string }} params
   * @returns {{ tools: { name: string, description: string, server: string }[] }}
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
          if (entry) {
            results.push({
              name,
              description: entry.tool.description || '',
              server: entry.server,
            });
          }
        }
      }
      return { tools: results, total: this.tools.size };
    }

    // If filtering by server
    if (server) {
      for (let [name, entry] of this.tools) {
        if (entry.server === server) {
          results.push({
            name,
            description: entry.tool.description || '',
            server: entry.server,
          });
        }
      }
      return { tools: results, total: this.tools.size };
    }

    // Keyword search (name + description)
    if (query) {
      let q = query.toLowerCase();
      for (let [name, entry] of this.tools) {
        let desc = (entry.tool.description || '').toLowerCase();
        if (name.toLowerCase().includes(q) || desc.includes(q)) {
          results.push({
            name,
            description: entry.tool.description || '',
            server: entry.server,
          });
        }
      }
      return { tools: results, total: this.tools.size };
    }

    // No filter — return all (summary only)
    for (let [name, entry] of this.tools) {
      results.push({
        name,
        description: entry.tool.description || '',
        server: entry.server,
      });
    }
    return { tools: results, total: this.tools.size };
  }

  /**
   * Get the full tool definition (with inputSchema) for a specific tool.
   * @param {string} name
   * @returns {{ tool: object, server: string } | null}
   */
  get(name) {
    return this.tools.get(name) || null;
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
      counts.set(entry.server, (counts.get(entry.server) || 0) + 1);
    }
    return [...counts.entries()].map(([name, toolCount]) => ({ name, toolCount }));
  }

  get isReady() {
    return this._ready;
  }
}

export default ToolIndex;
