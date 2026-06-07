import { Symbiote } from '@symbiotejs/symbiote';
import template from './ToolExplorer.tpl.js';
import cssLocal from './ToolExplorer.css.js';
import { sharedUiStyles as cssShared } from 'symbiote-ui/ui';
import './ToolServerItem.js';
import './ToolCard.js';

class ToolExplorer extends Symbiote {
  init$ = {
    selectedServerName: 'None',
    hasSelectedServer: false,
    servers: [],
    tools: [],
    serversEmptyText: '',
    mainEmptyText: 'Select a server to view tools',
    toolsEmptyText: '',
    onServerSelect: (e) => {
      let serverName = e.detail?.name
        || e.detail?.item?.name
        || e.currentTarget?.getRootNode?.().host?.$.name;
      if (serverName) this.selectServer(serverName);
    },
  };

  initCallback() {
    this.addEventListener('tool-server-item-select', this.$.onServerSelect);
    this.loadServers();
  }

  async loadServers() {
    try {
      let res = await fetch('/api/instances');
      if (!res.ok) throw new Error('Failed to fetch instances');
      let servers = await res.json();
      
      let runningServers = servers.filter(s => s.pid);
      
      if (!runningServers.length) {
        this.$.servers = [];
        this.$.serversEmptyText = 'No running servers';
        return;
      }
      
      this.$.serversEmptyText = '';
      this._renderServers(runningServers);
    } catch (err) {
      console.error('[ERROR] [tool-explorer] Failed to load servers:', err);
      this.$.servers = [];
      this.$.serversEmptyText = `Failed to load servers: ${err.message}`;
    }
  }

  _renderServers(servers) {
    this.$.servers = servers.map((server) => {
      let toolCount = server.toolCount ?? server.tool_count ?? server.tools?.length;
      let hasToolCount = toolCount !== undefined && toolCount !== null && toolCount !== '';
      return {
        name: server.name,
        toolCountText: hasToolCount ? `${toolCount} tools` : '',
        isActive: this.$.selectedServerName === server.name,
      };
    });
  }

  async selectServer(name) {
    this.$.selectedServerName = name;
    this.$.hasSelectedServer = true;
    this.$.servers = this.$.servers.map((server) => ({
      ...server,
      isActive: server.name === name,
    }));
    this.$.tools = [];
    this.$.toolsEmptyText = 'Loading tools...';
    
    try {
      let res = await fetch('/api/mcp-call', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ serverName: name, method: 'tools/list' })
      });
      if (!res.ok) throw new Error('Request failed');
      let result = await res.json();
      
      this._renderTools(result.tools || []);
    } catch (err) {
      this.$.tools = [];
      this.$.toolsEmptyText = `Failed to load tools: ${err.message}`;
    }
  }

  _renderTools(tools) {
    if (!tools.length) {
      this.$.tools = [];
      this.$.toolsEmptyText = 'No tools found for this server';
      return;
    }
    
    this.$.toolsEmptyText = '';
    this.$.tools = tools.map((tool) => ({
      name: tool.name,
      description: tool.description || 'No description provided.',
      schemaJson: JSON.stringify(tool.inputSchema || {}, null, 2),
    }));
  }
}

ToolExplorer.template = template;
ToolExplorer.rootStyles = cssShared + cssLocal;
ToolExplorer.reg('pg-tool-explorer');

export { ToolExplorer };
export default ToolExplorer;
