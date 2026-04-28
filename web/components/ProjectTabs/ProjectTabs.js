import { Symbiote } from '@symbiotejs/symbiote';
import { state as dashState, events as dashEvents, emit as dashEmit } from '../../dashboard-state.js';
import { panelTypes, getLayout } from '../../router-registry.js';
import css from './ProjectTabs.css.js';
import tpl from './ProjectTabs.tpl.js';

/**
 * ProjectTabs — browser-style tab bar for switching between project workspaces.
 *
 * Each tab owns a separate `panel-layout` instance inside `.app-content`.
 * Switching tabs shows/hides the corresponding layout.
 */
export class ProjectTabs extends Symbiote {
  init$ = {
    activeId: null,
  };

  /** @type {Map<string|null, HTMLElement>} projectId → panel-layout element */
  _layouts = new Map();

  renderCallback() {
    this._contentEl = document.querySelector('.app-content');
    this._initHomeLayout();
    this._renderTabs();

    dashEvents.addEventListener('projects-history-updated', () => this._renderTabs());
    dashEvents.addEventListener('active-project-changed', (e) => {
      let id = e.detail?.id || null;
      this.$.activeId = id;
      this._switchLayout(id);
      this._highlightActive();
    });

    // Home tab click
    let homeTab = this.querySelector('.tab[active]');
    homeTab?.addEventListener('click', () => {
      dashState.activeProjectId = null;
      dashEmit('active-project-changed', { id: null });
    });

    // Add button
    this.ref.addBtn.addEventListener('click', () => this._showAddDialog());
  }

  /** Create the "Home" layout (dashboard) */
  _initHomeLayout() {
    // Adopt existing #main-layout as the Home layout
    let existing = this._contentEl.querySelector('#main-layout');
    if (existing) {
      existing.dataset.tabId = 'home';
      this._layouts.set(null, existing);
    }
  }

  /** Create a panel-layout for a project tab */
  _createProjectLayout(projectId) {
    if (this._layouts.has(projectId)) return this._layouts.get(projectId);

    let layout = document.createElement('panel-layout');
    layout.setAttribute('storage-key', `pg-project-${projectId}`);
    layout.setAttribute('min-panel-size', '150');
    layout.dataset.tabId = projectId;
    layout.style.display = 'none';
    layout.style.width = '100%';
    layout.style.height = '100%';

    this._contentEl.appendChild(layout);

    // Register all panel types
    requestAnimationFrame(() => {
      for (let [name, config] of Object.entries(panelTypes)) {
        layout.registerPanelType(name, config);
      }

      // If no saved layout, use default project workspace layout
      if (!localStorage.getItem(`pg-project-${projectId}`)) {
        let defaultProjectLayout = getLayout('dashboard');
        if (defaultProjectLayout) layout.setLayout(defaultProjectLayout);
      }
    });

    this._layouts.set(projectId, layout);
    return layout;
  }

  /** Switch visible layout */
  _switchLayout(projectId) {
    // Ensure project layout exists
    if (projectId && !this._layouts.has(projectId)) {
      this._createProjectLayout(projectId);
    }

    // Hide all, show target
    for (let [id, el] of this._layouts) {
      el.style.display = (id === projectId) ? '' : 'none';
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

      // Ensure layout exists
      this._createProjectLayout(id);

      let btn = document.createElement('button');
      btn.className = 'tab';
      btn.dataset.id = id;
      if (proj.color) btn.style.setProperty('--tab-accent', proj.color);
      if (id === dashState.activeProjectId) btn.setAttribute('active', '');

      btn.innerHTML = `
        <span class="tab-dot"></span>
        <span>${proj.name}</span>
        <button class="tab-close" title="Close">×</button>
      `;

      btn.addEventListener('click', (e) => {
        if (e.target.closest('.tab-close')) return;
        dashState.activeProjectId = id;
        dashEmit('active-project-changed', { id, project: proj });
      });

      btn.querySelector('.tab-close').addEventListener('click', async (e) => {
        e.stopPropagation();
        await fetch('/api/projects/close', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id }),
        });
        dashState.openProjectIds = dashState.openProjectIds.filter(i => i !== id);

        // Remove the layout from DOM
        let layout = this._layouts.get(id);
        if (layout) {
          layout.remove();
          this._layouts.delete(id);
        }

        if (dashState.activeProjectId === id) {
          dashState.activeProjectId = null;
          dashEmit('active-project-changed', { id: null });
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
        ? !dashState.activeProjectId
        : tab.dataset.id === dashState.activeProjectId;
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
      let choice = prompt(`Open project:\n${names}\n\nOr enter a new path:`);
      if (!choice) return;

      let idx = parseInt(choice, 10) - 1;
      if (idx >= 0 && idx < available.length) {
        await this._openProject(available[idx].id, available[idx]);
      } else {
        await this._openNewProject(choice.trim());
      }
    } else {
      let pathStr = prompt('Enter project path:');
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
      dashState.activeProjectId = id;
      dashEmit('active-project-changed', { id, project: proj });
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
      dashState.activeProjectId = data.id;
      if (!dashState.openProjectIds.includes(data.id)) {
        dashState.openProjectIds.push(data.id);
      }
      dashEmit('active-project-changed', { id: data.id });
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
