import { Symbiote } from '@symbiotejs/symbiote';
import { state as dashState, events as dashEvents, emit as dashEmit } from '../../dashboard-state.js';
import { navigate, getRoute, parseQuery } from 'symbiote-node';
import css from './ProjectTabs.css.js';
import tpl from './ProjectTabs.tpl.js';
import { uiPrompt } from '../../common/ui-dialogs.js';

/**
 * ProjectTabs — browser-style tab bar for switching between project workspaces.
 *
 * Unified routing: tab clicks navigate via URL ?project= param.
 * No multi-workspace DOM — a single sidebar + panel-layout is managed by app.js.
 */
export class ProjectTabs extends Symbiote {
  init$ = {
    activeId: null,
  };

  renderCallback() {
    this._renderTabs();

    dashEvents.addEventListener('projects-history-updated', () => this._renderTabs());
    dashEvents.addEventListener('active-project-changed', (e) => {
      let newId = e.detail?.id || null;
      if (newId === this.$.activeId) return;
      this.$.activeId = newId;
      this._highlightActive();
    });

    // Sync tab highlight from URL on hash change
    this.sub('ROUTER/query', () => {
      this._syncProjectFromRouter();
    });

    // Initial sync
    this._syncProjectFromRouter();

    // Home tab click
    let homeTab = this.querySelector('.tab:not([data-id])') || this.querySelector('.tab');
    homeTab?.addEventListener('click', () => {
      // Navigate to dashboard, clearing project param
      navigate('dashboard', '', { project: null });
    });

    // Add button
    this.ref.addBtn.addEventListener('click', () => this._showAddDialog());
  }

  _syncProjectFromRouter() {
    let route = getRoute();
    let globals = parseQuery(route.query || '');
    let projectId = globals.project || null;

    if (projectId !== this.$.activeId) {
      this.$.activeId = projectId;
      this._highlightActive();
    }
  }

  _renderTabs() {
    let container = this.ref.tabsContainer;
    container.innerHTML = '';

    let openIds = dashState.openProjectIds || [];
    let history = dashState.projectHistory || [];

    for (let id of openIds) {
      let proj = history.find(p => p.id === id);
      if (!proj) continue;

      let btn = document.createElement('button');
      btn.className = 'tab';
      btn.dataset.id = id;
      if (proj.color) btn.style.setProperty('--tab-accent', proj.color);
      if (id === this.$.activeId) btn.setAttribute('active', '');

      btn.innerHTML = `
        <span class="tab-dot"></span>
        <span>${proj.name}</span>
        <button class="tab-close" title="Close">×</button>
      `;

      btn.addEventListener('click', (e) => {
        if (e.target.closest('.tab-close')) return;
        // Navigate to project default section via URL
        let defaultSection = 'explorer';
        // If already on this project, keep current section
        let route = getRoute();
        let currentGlobals = parseQuery(route.query || '');
        if (currentGlobals.project === id) return;

        navigate(defaultSection, '', { project: id });
      });

      btn.querySelector('.tab-close').addEventListener('click', async (e) => {
        e.stopPropagation();
        await fetch('/api/projects/close', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id }),
        });

        dashState.openProjectIds = dashState.openProjectIds.filter(i => i !== id);

        if (this.$.activeId === id) {
          // Switch to Home
          navigate('dashboard', '', { project: null });
        }
        this._renderTabs();
      });

      container.appendChild(btn);
    }
  }

  _highlightActive() {
    let tabs = this.querySelectorAll('.tab');
    tabs.forEach(tab => {
      let isHome = !tab.dataset.id;
      let isActive = isHome
        ? !this.$.activeId
        : tab.dataset.id === this.$.activeId;
      if (isActive) tab.setAttribute('active', '');
      else tab.removeAttribute('active');
    });
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
      // Navigate via URL
      navigate('explorer', '', { project: id });
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
      // Navigate via URL
      navigate('explorer', '', { project: data.id });
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

ProjectTabs.template = tpl;
ProjectTabs.rootStyles = css;
ProjectTabs.reg('project-tabs');
