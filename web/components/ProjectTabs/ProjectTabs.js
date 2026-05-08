import { Symbiote } from '@symbiotejs/symbiote';
import { state as dashState, events as dashEvents, emit as dashEmit } from '../../dashboard-state.js';
import { navigate, getRoute, parseQuery } from 'symbiote-node';
import css from './ProjectTabs.css.js';
import tpl from './ProjectTabs.tpl.js';
import { uiPrompt } from '../../common/ui-dialogs.js';

export class ProjectTabs extends Symbiote {
  init$ = {
    activeId: null,
    tabs: [],
    onHomeClick: () => {
      navigate('dashboard', '', { project: null });
    },
    onAddClick: () => {
      this._showAddDialog();
    }
  };

  renderCallback() {
    this._renderTabs();

    dashEvents.addEventListener('projects-history-updated', () => this._renderTabs());
    dashEvents.addEventListener('active-project-changed', (e) => {
      let newId = e.detail?.id || null;
      if (newId === this.$.activeId) return;
      this.$.activeId = newId;
      this._renderTabs();
    });

    this.sub('ROUTER/query', () => {
      this._syncProjectFromRouter();
    });

    this._syncProjectFromRouter();

    this.addEventListener('tab-closed', (e) => {
      if (this.$.activeId === e.detail.id) {
        navigate('dashboard', '', { project: null });
      }
      this._renderTabs();
    });
  }

  _syncProjectFromRouter() {
    let route = getRoute();
    let globals = parseQuery(route.query || '');
    let projectId = globals.project || null;

    if (projectId !== this.$.activeId) {
      this.$.activeId = projectId;
      this._renderTabs();
    }
  }

  _renderTabs() {
    let openIds = dashState.openProjectIds || [];
    let history = dashState.projectHistory || [];
    let newTabs = [];
    let activeColor = null;

    for (let id of openIds) {
      let proj = history.find(p => p.id === id);
      if (!proj) continue;

      if (id === this.$.activeId) activeColor = proj.color;

      newTabs.push({
        id,
        name: proj.name,
        color: proj.color,
        isActive: id === this.$.activeId,
      });
    }
    
    this.$.tabs = newTabs;

    // Update dynamic favicon
    let link = document.querySelector("link[rel*='icon']") || document.createElement('link');
    link.type = 'image/svg+xml';
    link.rel = 'shortcut icon';
    if (!activeColor) {
      link.href = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="40" fill="%234c8bf5" /></svg>';
    } else {
      let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="${encodeURIComponent(activeColor)}"><path d="M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"/></svg>`;
      link.href = 'data:image/svg+xml,' + svg;
    }
    document.head.appendChild(link);
  }

  async _showAddDialog() {
    let history = dashState.projectHistory || [];
    let openIds = new Set(dashState.openProjectIds || []);
    let available = history.filter(p => !openIds.has(p.id));

    if (available.length > 0) {
      let names = available.map((p, i) => `${i + 1}. ${p.name} (${p.path})`).join('\n');
      let choice = await uiPrompt(`Open project:\n${names}\n\nOr enter a new path:`);
      if (!choice) return;

      let idx = parseInt(choice, 10) - 1;
      if (idx >= 0 && idx < available.length) {
        await this._openProject(available[idx].id, available[idx]);
      } else {
        await this._openNewProject(choice.trim());
      }
    } else {
      let pathStr = await uiPrompt('Enter project path:');
      if (pathStr) await this._openNewProject(pathStr.trim());
    }
  }

  async _openProject(id, proj) {
    let res = await fetch('/api/projects/open', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: proj.name, path: proj.path }),
    });
    let data = await res.json();
    if (data.ok) {
      if (!dashState.openProjectIds.includes(id)) {
        dashState.openProjectIds.push(id);
      }
      navigate('agent-chat', '', { project: id });
      this._renderTabs();
    }
  }

  async _openNewProject(projectPath) {
    let name = projectPath.split('/').pop() || projectPath;
    let res = await fetch('/api/projects/open', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, path: projectPath }),
    });
    let data = await res.json();
    if (data.ok) {
      await this._fetchHistory();
      if (!dashState.openProjectIds.includes(data.id)) {
        dashState.openProjectIds.push(data.id);
      }
      navigate('agent-chat', '', { project: data.id });
      this._renderTabs();
    }
  }

  async _fetchHistory() {
    try {
      let res = await fetch('/api/projects/history');
      let data = await res.json();
      dashState.projectHistory = data.projects || [];
      dashState.openProjectIds = data.activeIds || [];
      dashEmit('projects-history-updated', dashState.projectHistory);
    } catch (err) {
      console.error('[ProjectTabs] fetch history error:', err);
    }
  }
}

import { html } from '@symbiotejs/symbiote';

class ProjectTabItem extends Symbiote {
  init$ = {
    id: '',
    name: '',
    color: '',
    isActive: false,
    onClick: (e) => {
      if (e.target.closest('.tab-close')) return;
      let defaultSection = 'agent-chat';
      let route = getRoute();
      let currentGlobals = parseQuery(route.query || '');
      if (currentGlobals.project === this.$.id) return;
      navigate(defaultSection, '', { project: this.$.id });
    },
    onCloseClick: async (e) => {
      e.stopPropagation();
      await fetch('/api/projects/close', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: this.$.id }),
      });
      dashState.openProjectIds = dashState.openProjectIds.filter(i => i !== this.$.id);
      this.dispatchEvent(new CustomEvent('tab-closed', { bubbles: true, composed: true, detail: { id: this.$.id } }));
    }
  };

  renderCallback() {
    this.sub('color', (c) => {
      if (c) this.style.setProperty('--tab-accent', c);
      else this.style.removeProperty('--tab-accent');
    });
    this.sub('isActive', (val) => {
      this.toggleAttribute('active', val);
    });
    this.onclick = this.$.onClick;
  }
}

ProjectTabItem.template = html`
  <span class="material-symbols-outlined" style="color: var(--tab-accent, var(--sn-node-selected, #4c8bf5));">folder</span>
  <span ${{textContent: 'name'}}></span>
  <button class="tab-close" title="Close" ${{onclick: 'onCloseClick'}}>×</button>
`;
ProjectTabItem.reg('project-tab-item');

ProjectTabs.template = tpl;
ProjectTabs.rootStyles = css;
ProjectTabs.reg('project-tabs');
