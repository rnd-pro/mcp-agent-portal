import { Symbiote } from '@symbiotejs/symbiote';
import template from './ToolExplorer.tpl.js';
import css from './ToolExplorer.css.js';

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
        this.ref.serverList.innerHTML = `<div style="padding:10px; opacity:0.5; font-size:12px;">No running servers</div>`;
        return;
      }
      
      for (let server of runningServers) {
        let el = document.createElement('div');
        el.className = 'te-server-item';
        el.innerHTML = `<span class="material-symbols-outlined" style="font-size:16px">api</span> ${server.name}`;
        el.onclick = () => {
          this.shadowRoot.querySelectorAll('.te-server-item').forEach(e => e.removeAttribute('data-active'));
          el.setAttribute('data-active', 'true');
          this.selectServer(server.name);
        };
        this.ref.serverList.appendChild(el);
      }
    } catch (err) {
      console.error('🔴 [tool-explorer] Failed to load servers:', err);
    }
  }

  async selectServer(name) {
    this.$.selectedServerName = name;
    this.ref.toolsGrid.innerHTML = `<div class="te-empty">Loading tools...</div>`;
    
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
      this.ref.toolsGrid.innerHTML = `<div class="te-empty">Failed to load tools: ${err.message}</div>`;
    }
  }

  renderTools(tools) {
    let grid = this.ref.toolsGrid;
    grid.innerHTML = '';
    
    if (!tools.length) {
      grid.innerHTML = `<div class="te-empty">No tools found for this server</div>`;
      return;
    }
    
    for (let tool of tools) {
      let card = document.createElement('div');
      card.className = 'te-tool-card';
      
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
ToolExplorer.shadowStyles = css;
ToolExplorer.reg('pg-tool-explorer');

export { ToolExplorer };
export default ToolExplorer;
