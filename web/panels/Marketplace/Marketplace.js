import { Symbiote } from '@symbiotejs/symbiote';
import { mcpCall } from '../../common/mcp-call.js';
import template from './Marketplace.tpl.js';
import { uiConfirm } from '../../common/ui-dialogs.js';
import cssLocal from './Marketplace.css.js';
import cssShared from '../../common/ui-shared.css.js';

/**
 * MCP Marketplace — curated catalog with categories, hot install/remove,
 * and custom server registration.
 *
 * API: /api/marketplace (GET), /api/marketplace/install (POST),
 *      /api/marketplace/install-custom (POST), /api/marketplace/remove (POST)
 */

let CATEGORY_META = {
  'rnd-pro':   { label: 'RND-PRO',   icon: 'science', gradient: 'linear-gradient(135deg, #a78bfa, #7c3aed)' },
  'google':    { label: 'Google',     icon: 'search', gradient: 'linear-gradient(135deg, #34d399, #059669)' },
  'official':  { label: 'Official',   icon: 'check_circle', gradient: 'linear-gradient(135deg, #4a9eff, #2563eb)' },
  '3rd-party': { label: '3rd Party',  icon: 'extension', gradient: 'linear-gradient(135deg, #a855f7, #7e22ce)' },
  'community': { label: 'Community',  icon: 'public', gradient: 'linear-gradient(135deg, #f59e0b, #d97706)' },
};

let ICON_MAP = {
  'project-graph': 'bar_chart', 'agent-pool': 'smart_toy', 'filesystem': 'folder',
  'github': 'code', 'slack': 'chat', 'postgres': 'database', 'sqlite': 'dataset',
  'memory': 'memory', 'puppeteer': 'smart_display', 'brave-search': 'search', 'fetch': 'public',
  'sequential-thinking': 'account_tree', 'google-maps': 'map', 'gdrive': 'folder_open',
  'docker': 'directions_boat', 'git': 'edit', 'sentry': 'bug_report', 'linear': 'assignment',
};

class Marketplace extends Symbiote {

  init$ = {
    serverCount: 0,
  };

  initCallback() {
    this._setupModeToggle();
    this._setupTabs();
    this._setupSearch();
    this._setupCustomForm();
    this.loadServers();
    this.loadOpenMemory();
  }

  _setupModeToggle() {
    let btns = this.ref.modeToggle.querySelectorAll('button');
    for (let btn of btns) {
      btn.onclick = () => {
        for (let b of btns) b.classList.remove('active');
        btn.classList.add('active');
        
        let mode = btn.dataset.mode;
        this.ref.serversSection.hidden = mode !== 'servers';
        this.ref.contextSection.hidden = mode !== 'context';
      };
    }
  }

  _setupTabs() {
    let tabs = this.ref.tabBar.querySelectorAll('.mp-tab');
    for (let tab of tabs) {
      tab.onclick = () => {
        for (let t of tabs) t.classList.remove('active');
        tab.classList.add('active');
        let target = tab.dataset.tab;
        this.ref.installedTab.hidden = target !== 'installed';
        this.ref.catalogTab.hidden = target !== 'catalog';
        this.ref.customTab.hidden = target !== 'custom';
        this.ref.searchBar.hidden = target === 'custom';
      };
    }
  }

  _setupSearch() {
    this.ref.searchInput.oninput = () => {
      let q = this.ref.searchInput.value.toLowerCase();
      let cards = this.shadowRoot.querySelectorAll('.ui-card');
      for (let card of cards) {
        let text = card.textContent.toLowerCase();
        card.hidden = !text.includes(q);
      }
    };
  }

  _setupCustomForm() {
    this.ref.customInstallBtn.onclick = () => this._installCustom();
  }

  async loadServers() {
    try {
      let res = await fetch('/api/marketplace');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      let data = await res.json();

      let installedArray = Object.entries(data.installed).map(([name, def]) => ({ name, ...def }));
      this.$.serverCount = installedArray.length;
      this._installedNames = new Set(installedArray.map(s => s.name));
      this._registry = data.available || [];
      this._categories = data.categories || {};

      this._renderInstalled(installedArray);
      this._renderCatalog();
    } catch (err) {
      console.error('[ERROR] [marketplace] Failed to load:', err);
      this.ref.installedGrid.innerHTML = `<div class="ui-empty-state">Failed to load MCP servers</div>`;
    }
  }

  _createCard(key, server, actionHtml) {
    let icon = ICON_MAP[key] || 'bolt';
    let desc = server.description || `${server.command} ${(server.args || []).join(' ')}`;
    let gradient = CATEGORY_META[server.category]?.gradient || 'linear-gradient(135deg, #6b7280, #4b5563)';

    let card = document.createElement('div');
    card.className = 'ui-card';
    card.innerHTML = `
      <div class="mp-card-header">
        <div class="mp-card-icon" style="background:${gradient}"><span class="material-symbols-outlined">${icon}</span></div>
        <div>
          <div class="ui-card-title" style="margin-bottom:0">${key}</div>
          ${server.source ? `<div class="mp-card-source">${new URL(server.source).hostname}</div>` : ''}
        </div>
      </div>
      <div class="mp-card-desc">${desc}</div>
      ${server.envHint ? `<div class="mp-card-env">Requires: ${server.envHint.join(', ')}</div>` : ''}
      <div class="mp-card-footer">
        ${actionHtml}
      </div>
    `;
    return card;
  }

  _renderInstalled(servers) {
    let grid = this.ref.installedGrid;
    grid.innerHTML = '';

    if (!servers.length) {
      grid.innerHTML = `<div class="ui-empty-state"><span class="material-symbols-outlined" style="margin-right:8px">inventory_2</span><span>No MCP servers installed</span></div>`;
      return;
    }

    for (let server of servers) {
      let actionHtml = `
        <div class="mp-card-status">
          <span class="mp-status-dot" data-active="true"></span> Running
        </div>
        <button class="mp-card-toggle" data-action="remove">Remove</button>
      `;
      let card = this._createCard(server.name, server, actionHtml);
      card.querySelector('.mp-card-toggle').onclick = () => this._removeServer(server.name, card);
      grid.appendChild(card);
    }
  }

  _renderCatalog() {
    let container = this.ref.catalogContent;
    container.innerHTML = '';
    let order = ['rnd-pro', 'official', 'google', 'community'];

    for (let catKey of order) {
      let servers = this._categories[catKey];
      if (!servers || !servers.length) continue;

      // Filter out already installed
      let available = servers.filter(s => !this._installedNames.has(s.name));
      if (!available.length) continue;

      let meta = CATEGORY_META[catKey] || { label: catKey, icon: 'inventory_2' };

      let section = document.createElement('div');
      section.className = 'mp-category';
      section.innerHTML = `
        <div class="mp-category-header">
           <span class="mp-category-label"><span class="material-symbols-outlined" style="font-size:14px;vertical-align:middle;margin-right:4px">${meta.icon}</span>${meta.label}</span>
          <span class="mp-category-badge mp-badge-${catKey}">${available.length}</span>
        </div>
      `;

      let grid = document.createElement('div');
      grid.className = 'mp-category-grid';

      for (let server of available) {
        let actionHtml = `
          <div class="mp-card-status">
            <span class="mp-status-dot" data-active="false"></span> Available
          </div>
          <button class="mp-card-toggle" data-action="install">Install</button>
        `;
        let card = this._createCard(server.name, server, actionHtml);
        card.querySelector('.mp-card-toggle').onclick = (e) => this._installFromCatalog(server.name, e.target, card);
        grid.appendChild(card);
      }

      section.appendChild(grid);
      container.appendChild(section);
    }
  }

  async _installFromCatalog(name, btn, card) {
    btn.disabled = true;
    btn.textContent = 'Installing...';
    try {
      let res = await fetch('/api/marketplace/install', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      let data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Install failed');

      // Hot success — update UI
      btn.textContent = '✓ Installed';
      card.style.opacity = '0.5';
      this._installedNames.add(name);
      this.$.serverCount = this._installedNames.size;
      // Refresh installed tab
      this.loadServers();
    } catch (err) {
      btn.disabled = false;
      btn.textContent = 'Install';
      alert('Install failed: ' + err.message);
    }
  }

  async _removeServer(name, card) {
    if (!(await uiConfirm(`Remove "${name}"? The server will be stopped immediately.`))) return;
    let btn = card.querySelector('.mp-card-toggle');
    btn.disabled = true;
    btn.textContent = 'Removing...';
    try {
      let res = await fetch('/api/marketplace/remove', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      let data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Remove failed');

      card.style.transform = 'scale(0.95)';
      card.style.opacity = '0';
      card.style.transition = 'all 0.3s';
      setTimeout(() => card.remove(), 300);
      this._installedNames.delete(name);
      this.$.serverCount = this._installedNames.size;
      // Re-render catalog to show it as available again
      this._renderCatalog();
    } catch (err) {
      btn.disabled = false;
      btn.textContent = 'Remove';
      alert('Remove failed: ' + err.message);
    }
  }

  async _installCustom() {
    let name = this.ref.customName.value.trim();
    let command = this.ref.customCommand.value.trim();
    let argsStr = this.ref.customArgs.value.trim();
    let envStr = this.ref.customEnv.value.trim();

    let status = this.ref.customStatus;
    status.className = 'mp-form-status';
    status.textContent = '';

    if (!name || !command) {
      status.className = 'mp-form-status error';
      status.textContent = 'Name and command are required.';
      return;
    }

    let args = argsStr ? argsStr.split(',').map(a => a.trim()).filter(Boolean) : [];
    let env = {};
    if (envStr) {
      for (let line of envStr.split('\n')) {
        let eq = line.indexOf('=');
        if (eq > 0) env[line.slice(0, eq).trim()] = line.slice(eq + 1).trim();
      }
    }

    let btn = this.ref.customInstallBtn;
    btn.disabled = true;

    try {
      let body = { name, command, args };
      if (Object.keys(env).length) body.env = env;

      let res = await fetch('/api/marketplace/install-custom', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      let data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Install failed');

      status.className = 'mp-form-status success';
      status.textContent = `✓ "${name}" installed and started.`;
      this.ref.customName.value = '';
      this.ref.customCommand.value = '';
      this.ref.customArgs.value = '';
      this.ref.customEnv.value = '';
      this._installedNames.add(name);
      this.$.serverCount = this._installedNames.size;
      this.loadServers();
    } catch (err) {
      status.className = 'mp-form-status error';
      status.textContent = err.message;
    } finally {
      btn.disabled = false;
    }
  }
  async loadOpenMemory() {
    try {
      this.ref.contextGrid.innerHTML = '<div class="ui-empty-state">Loading open memory...</div>';
      
      let data = await mcpCall('context-x', 'list_open_memory');
      let text = typeof data === 'string' ? data : (data && data.content ? data.content[0].text : '');
      
      if (text) {
        let lines = text.split('\n').filter(l => l && !l.startsWith('Available'));
        this._renderContextItems(lines);
      } else if (Array.isArray(data)) {
        this._renderContextItems(data);
      } else {
        throw new Error('Invalid response format');
      }
    } catch (err) {
      console.error('[ERROR] [marketplace] Failed to load open memory:', err);
      this.ref.contextGrid.innerHTML = `<div class="ui-empty-state" style="color:#f87171">Failed to load open memory: ${err.message}. Make sure context-x-mcp is installed and running.</div>`;
    }
  }

  _renderContextItems(paths) {
    this.ref.contextGrid.innerHTML = '';
    
    if (!paths || paths.length === 0) {
      this.ref.contextGrid.innerHTML = '<div class="ui-empty-state">No context items found in open memory</div>';
      return;
    }

    for (let p of paths) {
      // e.g. "rules/core-workflow.md"
      let parts = p.split('/');
      let category = parts.length > 1 ? parts[0] : 'general';
      let filename = parts.pop();
      let icon = category === 'rules' ? 'description' : category === 'workflows' ? 'sync' : category === 'templates' ? 'insert_drive_file' : 'lightbulb';
      
      let card = document.createElement('div');
      card.className = 'ui-card';
      card.innerHTML = `
        <div class="mp-card-header">
          <div class="mp-card-title">
            <span class="mp-card-icon" style="width:auto;height:auto;"><span class="material-symbols-outlined" style="font-size:16px">${icon}</span></span>
            <span style="word-break:break-all">${filename}</span>
          </div>
          <span class="ui-badge info">${category}</span>
        </div>
        <div class="mp-card-desc" style="font-family:monospace; font-size:11px; margin-bottom:12px;">${p}</div>
        <div class="mp-card-actions" style="display:flex; gap:8px;">
          <button class="ui-btn" style="flex:1" data-path="${p}" data-dest="project">
            <span class="material-symbols-outlined" style="font-size:16px;">download</span> Project
          </button>
          <button class="ui-btn primary" style="flex:1" data-path="${p}" data-dest="team">
            <span class="material-symbols-outlined" style="font-size:16px;">group</span> Team
          </button>
        </div>
        <div class="mp-form-status" style="margin-top:8px; font-size:11px;"></div>
      `;
      
      let btns = card.querySelectorAll('button');
      let statusDiv = card.querySelector('.mp-form-status');
      
      for (let btn of btns) {
        btn.onclick = () => this._installContextItem(btn.dataset.path, btn.dataset.dest, btn, statusDiv);
      }
      
      this.ref.contextGrid.appendChild(card);
    }
  }

  async _installContextItem(itemPath, destination, btn, statusDiv) {
    let originalHtml = btn.innerHTML;
    btn.innerHTML = `<span class="mp-spinner"></span>`;
    btn.disabled = true;
    statusDiv.textContent = '';
    statusDiv.style.color = 'inherit';
    
    try {
      // If destination is project, we need the active project's path.
      // The Agent Portal has global selectedProject. Wait, we can fetch it via API or just send empty and let backend fail if missing.
      // Let's get the active project from the URL or state.
      let activeProject = document.querySelector('agent-portal-app').$.activeProject;
      let projectPath = activeProject ? activeProject.path : '';
      
      if (destination === 'project' && !projectPath) {
        throw new Error('No active project selected to install into.');
      }
      
      let res = await mcpCall('context-x', 'install_memory_item', { itemPath, destination, projectPath });
      
      if (res.isError) {
        throw new Error(res.content[0].text);
      }
      
      statusDiv.innerHTML = 'Installed <span class="material-symbols-outlined" style="font-size:14px;vertical-align:middle">check_circle</span>';
      statusDiv.style.color = '#10b981';
      setTimeout(() => { statusDiv.textContent = ''; }, 3000);
      
    } catch (err) {
      console.error(err);
      statusDiv.textContent = `Error: ${err.message}`;
      statusDiv.style.color = '#ef4444';
    } finally {
      btn.innerHTML = originalHtml;
      btn.disabled = false;
    }
  }
}

Marketplace.template = template;
Marketplace.rootStyles = cssShared + cssLocal;
Marketplace.reg('pg-marketplace');

export { Marketplace };
export default Marketplace;
