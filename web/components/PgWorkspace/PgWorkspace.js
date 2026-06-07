import { Symbiote } from '@symbiotejs/symbiote';
import { LayoutTree, getRoute, navigate, parseQuery } from 'symbiote-ui/ui';
import { panelTypes, getHomeSections, getProjectSections, hasSection } from '../../router-registry.js';
import { getPortalRuntimeLayout } from '../../services/portal-runtime.js';
import { layoutMatchesSection } from '../../layout-policy.js';
import { persistLayout, readLayout } from '../../common/ui-state.js';
import tpl from './PgWorkspace.tpl.js';
import css from './PgWorkspace.css.js';

/**
 * PgWorkspace — isolated workspace container.
 *
 * Each instance owns its own `<layout-sidebar>` + `<panel-layout>`.
 * Only the **active** workspace reacts to `hashchange`; inactive ones
 * are frozen with `display:none` preserving full DOM state.
 *
 * The global LayoutRouter singleton (ROUTER PubSub) is shared —
 * but only the active workspace's sidebar is subscribed at any time.
 */
export class PgWorkspace extends Symbiote {
  init$ = {
    active: false,
  }

  /** Saved hash for this workspace (restored on re-activation) */
  lastHash = '';
  lastSection = '';
  _projectId = 'global';
  _sectionsInitialized = false;
  _wasActive = false;

  renderCallback() {
    // Read project-id from attribute
    this._projectId = this.getAttribute('project-id') || 'global';

    // Initial CSS
    this.hidden = true;
    this.style.width = '100%';
    this.style.height = '100%';

    // Register all panel types
    for (const [e, t] of Object.entries(panelTypes)) {
      this.ref.layout.registerPanelType(e, t);
    }

    // Disable automatic ROUTER/panel subscription in sidebar
    this.ref.sidebar.routerSync = false;

    this.ref.layout.sub?.('layoutTree', (tree) => {
      if (this._layoutStorageKey && tree) persistLayout(this._layoutStorageKey, tree);
      if (this.$.active) this._scheduleSubPanelSync();
    });

    this.ref.layout.addEventListener('layout-change', () => this._syncSubPanels());

    this.ref.sidebar.addEventListener('panel-close', (event) => {
      let panelId = event.detail?.panelId;
      if (panelId && typeof this.ref.layout.joinPanels === 'function') {
        this.ref.layout.joinPanels(panelId);
      }
    });

    this.ref.sidebar.addEventListener('sidebar-section-select', (event) => {
      event.preventDefault();
      let sectionId = event.detail?.sectionId || event.detail?.id;
      this._navigateSidebarSection(sectionId);
    });

    // Active state handler — core freeze/unfreeze logic
    this.sub('active', (val) => {
      this.hidden = !val;
      if (!val) {
        // Preserve the workspace route; do not overwrite it with another tab's hash.
        if (this._wasActive && typeof location !== 'undefined' && this._currentHashBelongsToWorkspace()) {
          this.lastHash = location.hash;
        }
        this.lastSection = '';
        return;
      }

      // Mark as having been active at least once
      let isFirstActivation = !this._wasActive;
      this._wasActive = true;

      // Activating: re-initialize sidebar sections
      this._initSections();

      // Restore saved hash or navigate to default
      if (!isFirstActivation && this.lastHash && this.lastHash !== '#') {
        if (location.hash !== this.lastHash) {
          history.replaceState(null, '', this.lastHash);
        }
        this._syncRouterFromHash();
      } else if (this._currentHashBelongsToWorkspace()) {
        this.lastHash = location.hash;
        this._syncRouterFromHash();
      } else {
        let defaultSection = this._projectId === 'global' ? 'dashboard' : 'explorer';
        if (this._projectId === 'global') {
          navigate(defaultSection);
        } else {
          navigate(defaultSection, '', { project: this._projectId });
        }
      }

      // Sync sidebar highlight with current route
      let route = getRoute();
      this.ref.sidebar.setActiveSection(route.panel);

      this._handleRoute();
    });

    // Listen to global ROUTER/panel and ONLY update sidebar if we are active
    this.sub('ROUTER/panel', (panel) => {
      if (!this.$.active) return;
      this.ref.sidebar.setActiveSection(panel);
    });

    // Only active workspace listens to hashchange
    window.addEventListener('hashchange', () => {
      if (!this.$.active) return;
      if (!this._currentHashBelongsToWorkspace()) return;
      this.lastHash = location.hash;
      this._handleRoute();
    });
  }

  disconnectedCallback() {
    clearTimeout(this._subPanelSyncTimer);
  }

  /**
   * (Re-)initialize sidebar with appropriate sections for this workspace type.
   * Each call to setSections() re-subscribes the sidebar to ROUTER/panel,
   * which is the mechanism that keeps the highlight in sync after tab switch.
   */
  _initSections() {
    let baseSections = this._projectId === 'global'
      ? getHomeSections()
      : getProjectSections();
    let sections = baseSections.map((section) => ({
      ...section,
      subPanels: this._getSubPanelsForSection(section.id),
    }));
    this.ref.sidebar.setSections(sections);
    this._sectionsInitialized = true;
  }

  /**
   * Force-sync the global ROUTER PubSub context from current location.hash.
   * This ensures sidebar highlight updates after hash restoration.
   */
  _syncRouterFromHash() {
    let raw = location.hash.replace(/^#/, '') || 'default';
    let qIdx = raw.indexOf('?');
    let pathPart = qIdx >= 0 ? raw.substring(0, qIdx) : raw;
    let queryPart = qIdx >= 0 ? raw.substring(qIdx + 1) : '';
    let slashIdx = pathPart.indexOf('/');
    let panel = slashIdx >= 0 ? pathPart.substring(0, slashIdx) : pathPart;
    let subpath = slashIdx >= 0 ? pathPart.substring(slashIdx + 1) : '';
    let globalParams = {};
    let query = parseQuery(queryPart);
    if (query.project) globalParams.project = query.project;

    if (this.$['ROUTER/panel'] !== panel) this.$['ROUTER/panel'] = panel;
    if (this.$['ROUTER/subpath'] !== subpath) this.$['ROUTER/subpath'] = subpath;
    if (this.$['ROUTER/query'] !== queryPart) this.$['ROUTER/query'] = queryPart;
    this.$['ROUTER/globalParams'] = globalParams;
  }

  _navigateSidebarSection(sectionId) {
    if (!sectionId || getRoute().panel === sectionId) return;
    if (this._projectId === 'global') {
      navigate(sectionId);
    } else {
      navigate(sectionId, '', { project: this._projectId });
    }
  }

  _currentHashBelongsToWorkspace() {
    let route = getRoute();
    let sections = this._projectId === 'global'
      ? getHomeSections()
      : getProjectSections();
    if (!sections.some((section) => section.id === route.panel)) return false;
    let projectId = parseQuery(route.query).project || 'global';
    return projectId === this._projectId;
  }

  _handleRoute() {
    let route = getRoute();
    let section = route.panel;

    if (hasSection(section) && section !== this.lastSection) {
      this.lastSection = section;
      let storageKey = `pg-layout-v4-${this._projectId}-${section}`;
      this._layoutStorageKey = storageKey;
      this.ref.layout.$['@storage-key'] = storageKey;

      let saved = readLayout(storageKey);
      if (!layoutMatchesSection(section, saved)) saved = null;
      if (saved) {
        try {
          this.ref.layout.setLayout(saved);
        } catch (err) {
          this._fallbackLayout(section);
        }
      } else {
        this._fallbackLayout(section);
      }
      this._scheduleSubPanelSync();
    }
  }

  _fallbackLayout(section) {
    let layout = getPortalRuntimeLayout(section, this._projectId === 'global' ? null : this._projectId);
    if (layout) this.ref.layout.setLayout(layout);
  }

  _getSubPanelsForSection(section) {
    let storageKey = `pg-layout-v4-${this._projectId}-${section}`;
    let fallback = getPortalRuntimeLayout(section, this._projectId === 'global' ? null : this._projectId);
    let tree = readLayout(storageKey);
    if (!layoutMatchesSection(section, tree, fallback)) tree = fallback;
    return LayoutTree.createSidebarSubPanels(tree, panelTypes);
  }

  _scheduleSubPanelSync() {
    clearTimeout(this._subPanelSyncTimer);
    this._subPanelSyncTimer = setTimeout(() => this._syncSubPanels(), 100);
  }

  _syncSubPanels() {
    if (!this.$.active) return;
    let section = getRoute().panel;
    if (!hasSection(section)) return;
    let panelNodes = Array.from(this.ref.layout.querySelectorAll('layout-node[node-type="panel"]'));
    let panels = panelNodes.map((panel, index) => {
      let nodeData = panel.$.nodeData || {};
      let panelType = nodeData.panelType || 'panel';
      let config = panelTypes[panelType] || {};
      return {
        title: config.title || panelType,
        icon: config.icon || 'dashboard',
        panelId: panel.$.nodeId,
        isMaster: index === 0,
      };
    });
    this.ref.sidebar.updateSubPanels(section, panels.length > 1 ? panels : []);
  }
}

PgWorkspace.template = tpl;
PgWorkspace.rootStyles = css;
PgWorkspace.reg('pg-workspace');
