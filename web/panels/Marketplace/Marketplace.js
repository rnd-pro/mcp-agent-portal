import { Symbiote } from '@symbiotejs/symbiote';
import template from './Marketplace.tpl.js';
import css from './Marketplace.css.js';

/**
 * MCP Marketplace — shows all registered MCP servers from agent-portal.json,
 * their status (running/stopped), tool count, and allows enable/disable.
 * 
 * Data source: /api/instances (lists all child MCP servers from MCPProxyManager)
 * + /api/marketplace (extended info: tools count, descriptions)
 */
const MCP_ICONS = {
  'agent-pool': '🤖',
  'project-graph': '📊',
  'browser-x': '🌐',
  'terminal-x': '🖥️',
  'context-x': '📝',
  'crypto': '📈',
  'jira': '🎫',
};

const MCP_DESCRIPTIONS = {
  'agent-pool': 'Multi-agent task delegation, scheduling, pipelines, and peer review',
  'project-graph': 'AST-based codebase analysis, navigation, and documentation',
  'browser-x': 'Browser automation and web page interaction',
  'terminal-x': 'Terminal session management and command execution',
  'context-x': 'Contextual memory and knowledge management',
  'crypto': 'Cryptocurrency market data and trading signals',
  'jira': 'Jira project management integration',
};

const MCP_COLORS = {
  'agent-pool': 'linear-gradient(135deg, #a78bfa, #7c3aed)',
  'project-graph': 'linear-gradient(135deg, #4a9eff, #2563eb)',
  'browser-x': 'linear-gradient(135deg, #34d399, #059669)',
  'terminal-x': 'linear-gradient(135deg, #f59e0b, #d97706)',
  'context-x': 'linear-gradient(135deg, #f472b6, #db2777)',
  'crypto': 'linear-gradient(135deg, #22d3ee, #0891b2)',
  'jira': 'linear-gradient(135deg, #60a5fa, #3b82f6)',
};

class Marketplace extends Symbiote {
  
  init$ = {
    serverCount: 0,
  };

  initCallback() {
    this.loadServers();
  }

  async loadServers() {
    try {
      let res = await fetch('/api/marketplace');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      let data = await res.json();
      
      let installedArray = Object.entries(data.installed).map(([name, def]) => ({ name, ...def }));
      this.$.serverCount = installedArray.length;
      
      this.renderInstalled(installedArray);
      this.renderAvailable(data.available, installedArray);
    } catch (err) {
      console.error('🔴 [marketplace] Failed to load servers:', err);
      this.ref.installedGrid.innerHTML = `<div class="mp-empty">Failed to load MCP servers</div>`;
      this.ref.availableGrid.innerHTML = '';
    }
  }

  async installServer(name, def) {
    if (!confirm(`Install ${name}? This will restart the portal.`)) return;
    try {
      await fetch('/api/marketplace/install', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, def })
      });
      alert('Installation requested. The portal is restarting...');
      setTimeout(() => window.location.reload(), 2000);
    } catch (err) {
      alert('Install failed: ' + err.message);
    }
  }

  async removeServer(name) {
    if (!confirm(`Remove ${name}? This will restart the portal.`)) return;
    try {
      await fetch('/api/marketplace/remove', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name })
      });
      alert('Removal requested. The portal is restarting...');
      setTimeout(() => window.location.reload(), 2000);
    } catch (err) {
      alert('Remove failed: ' + err.message);
    }
  }

  createCardHTML(key, server, actionHtml) {
    let icon = MCP_ICONS[key] || '⚡';
    let desc = MCP_DESCRIPTIONS[key] || server.description || `MCP server: ${server.command} ${(server.args || []).join(' ')}`;
    let color = MCP_COLORS[key] || 'linear-gradient(135deg, #6b7280, #4b5563)';
    
    return `
      <div class="mp-card-header">
        <div class="mp-card-icon" style="background:${color}">${icon}</div>
        <div>
          <div class="mp-card-title">${key}</div>
        </div>
      </div>
      <div class="mp-card-desc">${desc}</div>
      <div class="mp-card-footer">
        ${actionHtml}
      </div>
    `;
  }

  renderInstalled(servers) {
    let grid = this.ref.installedGrid;
    grid.innerHTML = '';

    if (!servers.length) {
      grid.innerHTML = `<div class="mp-empty"><span>No MCP servers configured</span></div>`;
      return;
    }

    for (const server of servers) {
      let card = document.createElement('div');
      card.className = 'mp-card';
      let actionHtml = `
        <div class="mp-card-status">
          <span class="mp-status-dot" data-active="true"></span> Installed
        </div>
        <button class="mp-card-toggle" data-action="remove" data-name="${server.name}">Remove</button>
      `;
      card.innerHTML = this.createCardHTML(server.name, server, actionHtml);
      
      let btn = card.querySelector('.mp-card-toggle');
      btn.onclick = () => this.removeServer(server.name);
      
      grid.appendChild(card);
    }
  }

  renderAvailable(availableServers, installedServers) {
    let grid = this.ref.availableGrid;
    grid.innerHTML = '';
    
    let installedNames = new Set(installedServers.map(s => s.name));

    for (const server of availableServers) {
      if (installedNames.has(server.name)) continue;

      const card = document.createElement('div');
      card.className = 'mp-card';
      const actionHtml = `
        <div class="mp-card-status">
          <span class="mp-status-dot" data-active="false"></span> Available
        </div>
        <button class="mp-card-toggle" data-action="install" data-name="${server.name}">Install</button>
      `;
      card.innerHTML = this.createCardHTML(server.name, server, actionHtml);
      
      const btn = card.querySelector('.mp-card-toggle');
      btn.onclick = () => this.installServer(server.name, server);
      
      grid.appendChild(card);
    }
  }
}

Marketplace.template = template;
Marketplace.shadowStyles = css;
Marketplace.reg('pg-marketplace');

export { Marketplace };
export default Marketplace;
