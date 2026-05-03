import { Symbiote } from '@symbiotejs/symbiote';
import template from './ToolExplorer.tpl.js';
import cssLocal from './ToolExplorer.css.js';
import cssShared from '../../common/ui-shared.css.js';

class ToolExplorer extends Symbiote {
  init$ = {
    selectedServerName: 'None',
  };

  initCallback() {
    this.loadServers();
  }

  async loadServers() {
    try {
      let res = await fetch('/api/instances');
      if (!res.ok) throw new Error('Failed to fetch instances');
      let servers = await res.json();
      
      this.ref.serverList.innerHTML = '';
      
      let runningServers = servers.filter(s => s.pid);
      
      if (!runningServers.length) {
        this.ref.serverList.innerHTML = `<div class="ui-empty-state">No running servers</div>`;
        return;
      }
      
      for (let server of runningServers) {
        let el = document.createElement('div');
        el.className = 'ui-item';
        el.innerHTML = `<div class="ui-item-title" style="display:flex;align-items:center;gap:6px"><span class="material-symbols-outlined" style="font-size:16px">api</span> ${server.name}</div>`;
        el.onclick = () => {
          this.shadowRoot.querySelectorAll('.ui-item').forEach(e => e.classList.remove('active'));
          el.classList.add('active');
          this.selectServer(server.name);
        };
        this.ref.serverList.appendChild(el);
      }
    } catch (err) {
      console.error('[ERROR] [tool-explorer] Failed to load servers:', err);
    }
  }

  async selectServer(name) {
    this.$.selectedServerName = name;
    this.ref.toolsGrid.innerHTML = `<div class="ui-empty-state">Loading tools...</div>`;
    
    try {
      let res = await fetch('/api/mcp-call', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ serverName: name, method: 'tools/list' })
      });
      if (!res.ok) throw new Error('Request failed');
      let result = await res.json();
      
      this.renderTools(result.tools || []);
    } catch (err) {
      this.ref.toolsGrid.innerHTML = `<div class="ui-empty-state">Failed to load tools: ${err.message}</div>`;
    }
  }

  renderTools(tools) {
    let grid = this.ref.toolsGrid;
    grid.innerHTML = '';
    
    if (!tools.length) {
      grid.innerHTML = `<div class="ui-empty-state">No tools found for this server</div>`;
      return;
    }
    
    for (let tool of tools) {
      let card = document.createElement('div');
      card.className = 'ui-card';
      
      let schemaJson = JSON.stringify(tool.inputSchema || {}, null, 2);
      
      card.innerHTML = `
        <div class="te-tool-name">${tool.name}</div>
        <div class="te-tool-desc">${tool.description || 'No description provided.'}</div>
        <div>
          <div class="te-schema-title">Input Schema</div>
          <div class="te-schema-block">${schemaJson}</div>
        </div>
      `;
      grid.appendChild(card);
    }
  }
}

ToolExplorer.template = template;
ToolExplorer.rootStyles = cssShared + cssLocal;
ToolExplorer.reg('pg-tool-explorer');

export { ToolExplorer };
export default ToolExplorer;
