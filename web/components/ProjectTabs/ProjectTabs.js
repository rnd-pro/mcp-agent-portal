import { Symbiote } from '@symbiotejs/symbiote';
import { state as dashState, events as dashEvents, emit as dashEmit } from '../../dashboard-state.js';
import { setGlobalParam, parseQuery, getRoute } from 'symbiote-node';
import css from './ProjectTabs.css.js';
import tpl from './ProjectTabs.tpl.js';

/**
 * ProjectTabs — browser-style tab bar for switching between project workspaces.
 *
 * Uses a SINGLE panel-layout instance. The layout tree root is always:
 *   split(horizontal, [workspace], [globalChat], ratio)
 *
 * The `second` child (marked global:true) stays constant across tab switches.
 * Only the `first` child (workspace) is swapped per project.
 * All layout features (resize, collapse, fullscreen) work naturally.
 */
export class ProjectTabs extends Symbiote {
  init$ = {
    activeId: null,
  };

  /** @type {Map<string|null, object>} projectId → saved workspace subtree */
  _workspaceTrees = new Map();

  /** @type {HTMLElement|null} */
  _layout = null;

  renderCallback() {
    this._renderTabs();

    dashEvents.addEventListener('projects-history-updated', () => this._renderTabs());
    dashEvents.addEventListener('active-project-changed', (e) => {
      let newId = e.detail?.id || null;
      let oldId = this.$.activeId;
      if (newId === oldId) return;

      this._switchProject(oldId, newId);
      this.$.activeId = newId;
      this._highlightActive();
    });

    // Self-register with router: react to ?project= URL param changes
    this.sub('ROUTER/query', () => {
      this._syncProjectFromRouter();
    });

    // Initial sync
    this._syncProjectFromRouter();

    // Home tab click
    let homeTab = this.querySelector('.tab[active]');
    homeTab?.addEventListener('click', () => {
      dashState.activeProjectId = null;
      setGlobalParam('project', null);
      dashEmit('active-project-changed', { id: null });
    });

    // Add button
    this.ref.addBtn.addEventListener('click', () => this._showAddDialog());
  }

  _syncProjectFromRouter() {
    let route = getRoute();
    let globals = parseQuery(route.query || '');
    let projectId = globals.project || null;

    if (projectId && projectId !== dashState.activeProjectId) {
      dashState.activeProjectId = projectId;
      dashEmit('active-project-changed', { id: projectId, fromRoute: true });
    }
  }

  /** Get the main panel-layout element */
  _getLayout() {
    if (!this._layout) {
      this._layout = document.querySelector('#main-layout');
    }
    return this._layout;
  }

  /**
   * Switch workspace subtree when changing project tabs.
   * Saves current workspace tree, restores target's tree.
   * The global portion (chat) is never touched.
   */
  _switchProject(oldId, newId) {
    let layout = this._getLayout();
    if (!layout || !layout.$.layoutTree) return;

    let tree = layout.$.layoutTree;

    // Save current workspace subtree (tree.first) for old project
    if (tree.type === 'split' && tree.first) {
      this._workspaceTrees.set(oldId, JSON.parse(JSON.stringify(tree.first)));
    }

    // Restore workspace subtree for new project
    let savedWorkspace = this._workspaceTrees.get(newId);

    if (tree.type === 'split') {
      if (savedWorkspace) {
        tree.first = savedWorkspace;
      }
      // If no saved workspace for this project, keep current workspace
      // (user can rearrange as needed)

      // Trigger layout re-render
      layout.$.layoutTree = { ...tree };
      layout._saveLayout();
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
      if (id === dashState.activeProjectId) btn.setAttribute('active', '');

      btn.innerHTML = `
        <span class="tab-dot"></span>
        <span>${proj.name}</span>
        <button class="tab-close" title="Close">×</button>
      `;

      btn.addEventListener('click', (e) => {
        if (e.target.closest('.tab-close')) return;
        dashState.activeProjectId = id;
        setGlobalParam('project', id);
        dashEmit('active-project-changed', { id, project: proj });
      });

      btn.querySelector('.tab-close').addEventListener('click', async (e) => {
        e.stopPropagation();
        await fetch('/api/projects/close', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id }),
        });

        // Clean up saved tree
        this._workspaceTrees.delete(id);
        dashState.openProjectIds = dashState.openProjectIds.filter(i => i !== id);

        if (dashState.activeProjectId === id) {
          dashState.activeProjectId = null;
          setGlobalParam('project', null);
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
      setGlobalParam('project', id);
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
      setGlobalParam('project', data.id);
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
