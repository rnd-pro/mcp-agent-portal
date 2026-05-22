import { Symbiote } from '@symbiotejs/symbiote';
import template from './Marketplace.tpl.js';
import { uiConfirm } from 'symbiote-node/ui';
import cssLocal from './Marketplace.css.js';
import { sharedUiStyles as cssShared } from 'symbiote-node/ui';
import './McpServerCard.js';
import './McpCatalogSection.js';
import './ContextCard.js';

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

function makeEmptyState(message, iconName = '') {
  let node = document.createElement('sn-empty-state');

  if (!iconName) {
    node.textContent = message;
    return node;
  }

  let icon = document.createElement('span');
  icon.className = 'material-symbols-outlined';
  icon.textContent = iconName;

  let text = document.createElement('span');
  text.textContent = message;
  node.replaceChildren(icon, text);
  return node;
}

class Marketplace extends Symbiote {

  init$ = {
    serverCount: 0,
    installedItems: [],
    catalogSections: [],
    contextItems: [],
    onServerAction: (e) => {
      let host = this._getItemHost(e, 'mp-server-card');
      if (!host) return;
      let btn = this._getEventButton(e);
      if (host.$.action === 'remove') {
        this._removeServer(host.$.name, host, btn);
      } else {
        this._installFromCatalog(host.$.name, btn, host);
      }
    },
    onContextInstall: (e) => {
      let host = this._getItemHost(e, 'mp-context-card');
      let btn = this._getEventButton(e);
      if (!host || !btn) return;
      this._installContextItem(host.$.description, btn.dataset.dest, btn, host);
    },
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
      let cards = [
        ...this.shadowRoot.querySelectorAll('mp-server-card, mp-context-card'),
        ...[...this.shadowRoot.querySelectorAll('mp-catalog-section')]
          .flatMap(section => [...(section.shadowRoot?.querySelectorAll('mp-server-card') || [])]),
      ];
      for (let card of cards) {
        let text = (card.shadowRoot?.textContent || card.textContent).toLowerCase();
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
      this.$.installedItems = [];
      this.ref.installedGrid.replaceChildren(makeEmptyState('Failed to load MCP servers'));
    }
  }

  _getSourceHost(source) {
    if (!source) return '';
    try {
      return new URL(source).hostname;
    } catch {
      return '';
    }
  }

  _toServerItem(key, server, isInstalled) {
    let icon = ICON_MAP[key] || 'bolt';
    let desc = server.description || `${server.command} ${(server.args || []).join(' ')}`;
    let gradient = CATEGORY_META[server.category]?.gradient || 'linear-gradient(135deg, #6b7280, #4b5563)';

    return {
      name: key,
      description: desc,
      icon,
      gradient,
      sourceHost: this._getSourceHost(server.source),
      envHint: server.envHint ? `Requires: ${server.envHint.join(', ')}` : '',
      status: isInstalled ? 'Running' : 'Available',
      action: isInstalled ? 'remove' : 'install',
      actionLabel: isInstalled ? 'Remove' : 'Install',
      isInstalled: isInstalled ? 'true' : 'false',
    };
  }

  _renderInstalled(servers) {
    if (!servers.length) {
      this.$.installedItems = [];
      let grid = this.ref.installedGrid;
      grid.replaceChildren(makeEmptyState('No MCP servers installed', 'inventory_2'));
      return;
    }

    this.ref.installedGrid.replaceChildren();
    this.$.installedItems = servers.map(server => this._toServerItem(server.name, server, true));
  }

  _renderCatalog() {
    let order = ['rnd-pro', 'official', 'google', 'community'];
    let sections = [];

    for (let catKey of order) {
      let servers = this._categories[catKey];
      if (!servers || !servers.length) continue;

      // Filter out already installed
      let available = servers.filter(s => !this._installedNames.has(s.name));
      if (!available.length) continue;

      let meta = CATEGORY_META[catKey] || { label: catKey, icon: 'inventory_2' };
      sections.push({
        categoryLabel: meta.label,
        categoryIcon: meta.icon,
        badgeClass: `mp-category-badge mp-badge-${catKey}`,
        count: available.length,
        catalogItems: available.map(server => this._toServerItem(server.name, server, false)),
      });
    }

    this.ref.catalogContent.replaceChildren();
    this.$.catalogSections = sections;
  }

  _getEventButton(e) {
    return e.target?.closest?.('sn-button,button')
      || e.composedPath?.().find(el => ['SN-BUTTON', 'BUTTON'].includes(el?.tagName));
  }

  _getItemHost(e, tagName) {
    let lowerTag = tagName.toLowerCase();
    return e.composedPath?.().find(el => el?.tagName?.toLowerCase() === lowerTag)
      || e.target?.closest?.(lowerTag)
      || e.target?.getRootNode?.().host;
  }

  async _installFromCatalog(name, btn, card) {
    if (!btn) return;
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
      card.classList.add('mp-card-installed');
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

  async _removeServer(name, card, btn = null) {
    if (!(await uiConfirm(`Remove "${name}"? The server will be stopped immediately.`))) return;
    btn ||= card.shadowRoot?.querySelector('.mp-card-toggle');
    if (!btn) return;
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

      card.classList.add('mp-card-removing');
      setTimeout(() => {
        card.remove();
        this.$.installedItems = this.$.installedItems.filter(item => item.name !== name);
        if (!this.$.installedItems.length) {
          this._renderInstalled([]);
        }
      }, 300);
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
    this.$.contextItems = [];
    this.ref.contextGrid.replaceChildren(makeEmptyState(
      'Open Memory marketplace is not connected. Use project skills and workflows from .agent-portal.',
    ));
  }

  _renderContextItems(paths) {
    if (!paths || paths.length === 0) {
      this.$.contextItems = [];
      this.ref.contextGrid.replaceChildren(makeEmptyState('No context items found in open memory'));
      return;
    }

    this.ref.contextGrid.replaceChildren();
    this.$.contextItems = paths.map((p) => {
      // e.g. "rules/core-workflow.md"
      let parts = p.split('/');
      let category = parts.length > 1 ? parts[0] : 'general';
      let filename = parts.pop();
      let icon = category === 'rules' ? 'description' : category === 'workflows' ? 'sync' : category === 'templates' ? 'insert_drive_file' : 'lightbulb';

      return {
        title: filename,
        description: p,
        type: category,
        icon,
        status: '',
        isError: false,
      };
    });
  }

  async _installContextItem(itemPath, destination, btn, card) {
    let originalNodes = [...btn.childNodes];
    let spinner = document.createElement('span');
    spinner.className = 'mp-spinner';
    btn.replaceChildren(spinner);
    btn.disabled = true;
    card.$.status = '';
    card.$.isError = false;
    
    try {
      // If destination is project, we need the active project's path.
      // The Agent Portal has global selectedProject. Wait, we can fetch it via API or just send empty and let backend fail if missing.
      // Let's get the active project from the URL or state.
      let activeProject = document.querySelector('agent-portal-app').$.activeProject;
      let projectPath = activeProject ? activeProject.path : '';
      
      if (destination === 'project' && !projectPath) {
        throw new Error('No active project selected to install into.');
      }
      
      throw new Error('Open Memory installation is no longer available.');
      
    } catch (err) {
      console.error(err);
      card.$.status = `Error: ${err.message}`;
      card.$.isError = true;
    } finally {
      btn.replaceChildren(...originalNodes);
      btn.disabled = false;
    }
  }
}

Marketplace.template = template;
Marketplace.rootStyles = cssShared + cssLocal;
Marketplace.reg('pg-marketplace');

export { Marketplace };
export default Marketplace;
