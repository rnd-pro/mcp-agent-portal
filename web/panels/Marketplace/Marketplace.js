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
      const res = await fetch('/api/instances');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const servers = await res.json();
      this.$.serverCount = servers.length;
      this.renderCards(servers);
    } catch (err) {
      console.error('[marketplace] Failed to load servers:', err);
      this.ref.grid.innerHTML = `
        <div class="mp-empty">
          <span class="material-symbols-outlined">cloud_off</span>
          <span>Failed to load MCP servers</span>
        </div>
      `;
    }
  }

  renderCards(servers) {
    const grid = this.ref.grid;
    grid.innerHTML = '';

    if (!servers.length) {
      grid.innerHTML = `
        <div class="mp-empty">
          <span class="material-symbols-outlined">inventory_2</span>
          <span>No MCP servers configured</span>
          <span style="font-size:11px">Add servers to ~/.gemini/agent-portal.json</span>
        </div>
      `;
      return;
    }

    for (const server of servers) {
      const key = server.name;
      const icon = MCP_ICONS[key] || '⚡';
      const desc = MCP_DESCRIPTIONS[key] || `MCP server: ${server.command} ${(server.args || []).join(' ')}`;
      const color = MCP_COLORS[key] || 'linear-gradient(135deg, #6b7280, #4b5563)';
      const isActive = !!server.pid;

      const card = document.createElement('div');
      card.className = 'mp-card';
      card.innerHTML = `
        <div class="mp-card-header">
          <div class="mp-card-icon" style="background:${color}">${icon}</div>
          <div>
            <div class="mp-card-title">${key}</div>
            <div class="mp-card-version">PID: ${server.pid || '—'}</div>
          </div>
        </div>
        <div class="mp-card-desc">${desc}</div>
        <div class="mp-card-footer">
          <div class="mp-card-status">
            <span class="mp-status-dot" data-active="${isActive}"></span>
            ${isActive ? 'Running' : 'Stopped'}
          </div>
          <button class="mp-card-toggle">${isActive ? 'Configure' : 'Start'}</button>
        </div>
      `;
      grid.appendChild(card);
    }
  }
}

Marketplace.template = template;
Marketplace.shadowStyles = css;
Marketplace.reg('pg-marketplace');
