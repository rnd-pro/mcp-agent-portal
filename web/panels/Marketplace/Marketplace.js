import { Symbiote } from '@symbiotejs/symbiote';
import template from './Marketplace.tpl.js';
import css from './Marketplace.css.js';

/**
 * MCP Marketplace — curated catalog with categories, hot install/remove,
 * and custom server registration.
 *
 * API: /api/marketplace (GET), /api/marketplace/install (POST),
 *      /api/marketplace/install-custom (POST), /api/marketplace/remove (POST)
 */

let CATEGORY_META = {
  'rnd-pro':   { label: 'RND-PRO',   icon: '🔬', gradient: 'linear-gradient(135deg, #a78bfa, #7c3aed)' },
  'official':  { label: 'Official',   icon: '✅', gradient: 'linear-gradient(135deg, #4a9eff, #2563eb)' },
  'google':    { label: 'Google',     icon: '🔍', gradient: 'linear-gradient(135deg, #34d399, #059669)' },
  'community': { label: 'Community',  icon: '🌐', gradient: 'linear-gradient(135deg, #f59e0b, #d97706)' },
};

let ICON_MAP = {
  'project-graph': '📊', 'agent-pool': '🤖', 'filesystem': '📁',
  'github': '🐙', 'slack': '💬', 'postgres': '🐘', 'sqlite': '💾',
  'memory': '🧠', 'puppeteer': '🎭', 'brave-search': '🔍', 'fetch': '🌐',
  'sequential-thinking': '🧩', 'google-maps': '🗺️', 'gdrive': '📂',
  'docker': '🐳', 'git': '📝', 'sentry': '🐛', 'linear': '📋',
};

class Marketplace extends Symbiote {

  init$ = {
    serverCount: 0,
  };

  initCallback() {
    this._setupTabs();
    this._setupSearch();
    this._setupCustomForm();
    this.loadServers();
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
      let cards = this.shadowRoot.querySelectorAll('.mp-card');
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
      console.error('🔴 [marketplace] Failed to load:', err);
      this.ref.installedGrid.innerHTML = `<div class="mp-empty">Failed to load MCP servers</div>`;
    }
  }

  _createCard(key, server, actionHtml) {
    let icon = ICON_MAP[key] || '⚡';
    let desc = server.description || `${server.command} ${(server.args || []).join(' ')}`;
    let gradient = CATEGORY_META[server.category]?.gradient || 'linear-gradient(135deg, #6b7280, #4b5563)';

    let card = document.createElement('div');
    card.className = 'mp-card';
    card.innerHTML = `
      <div class="mp-card-header">
        <div class="mp-card-icon" style="background:${gradient}">${icon}</div>
        <div>
          <div class="mp-card-title">${key}</div>
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
      grid.innerHTML = `<div class="mp-empty"><span class="material-symbols-outlined">inventory_2</span><span>No MCP servers installed</span></div>`;
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

      let meta = CATEGORY_META[catKey] || { label: catKey, icon: '📦' };

      let section = document.createElement('div');
      section.className = 'mp-category';
      section.innerHTML = `
        <div class="mp-category-header">
          <span class="mp-category-label">${meta.icon} ${meta.label}</span>
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
    if (!confirm(`Remove "${name}"? The server will be stopped immediately.`)) return;
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
}

Marketplace.template = template;
Marketplace.shadowStyles = css;
Marketplace.reg('pg-marketplace');

export { Marketplace };
export default Marketplace;
