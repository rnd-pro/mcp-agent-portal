import { Symbiote } from '@symbiotejs/symbiote';
import { state as dashState, events as dashEvents, emit as dashEmit } from '../../dashboard-state.js';
import css from './ProjectTabs.css.js';
import tpl from './ProjectTabs.tpl.js';

export class ProjectTabs extends Symbiote {
  init$ = {
    activeId: null,
  };

  renderCallback() {
    this._renderTabs();

    dashEvents.addEventListener('projects-history-updated', () => this._renderTabs());
    dashEvents.addEventListener('active-project-changed', (e) => {
      this.$.activeId = e.detail?.id || null;
      this._highlightActive();
    });

    // Home tab click
    let homeTab = this.shadowRoot.querySelector('.tab[active]');
    homeTab?.addEventListener('click', () => {
      dashState.activeProjectId = null;
      dashEmit('active-project-changed', { id: null });
    });

    // Add button
    this.ref.addBtn.addEventListener('click', () => this._showAddDialog());
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
    let tabs = this.shadowRoot.querySelectorAll('.tab');
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
      // Show quick picker from history
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
      // Refresh history
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
