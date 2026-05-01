import { Symbiote } from '@symbiotejs/symbiote';
import { getRoute, setDefaultPanel, navigate } from 'symbiote-node';
import { panelTypes, getHomeSections, getProjectSections, getLayout, hasSection } from '../../router-registry.js';
import { emit as dashEmit } from '../../dashboard-state.js';
import tpl from './PgWorkspace.tpl.js';

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
    this.style.display = 'none';
    this.style.width = '100%';
    this.style.height = '100%';

    // Register all panel types
    for (const [e, t] of Object.entries(panelTypes)) {
      this.ref.layout.registerPanelType(e, t);
    }

    // Disable automatic ROUTER/panel subscription in sidebar
    this.ref.sidebar.routerSync = false;

    // Active state handler — core freeze/unfreeze logic
    this.sub('active', (val) => {
      this.style.display = val ? 'flex' : 'none';
      if (!val) {
        // Only save hash if workspace was previously active (not initial sub fire)
        if (this._wasActive && typeof location !== 'undefined') {
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
      } else {
        // First activation — force navigate to default section
        let defaultSection = this._projectId === 'global' ? 'dashboard' : 'explorer';
        navigate(defaultSection);
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
      this.lastHash = location.hash;
      this._handleRoute();
    });
  }

  /**
   * (Re-)initialize sidebar with appropriate sections for this workspace type.
   * Each call to setSections() re-subscribes the sidebar to ROUTER/panel,
   * which is the mechanism that keeps the highlight in sync after tab switch.
   */
  _initSections() {
    let sections = this._projectId === 'global'
      ? getHomeSections()
      : getProjectSections();
    this.ref.sidebar.setSections(sections);
    this._sectionsInitialized = true;
  }

  /**
   * Force-sync the global ROUTER PubSub context from current location.hash.
   * This ensures sidebar highlight updates after hash restoration.
   */
  _syncRouterFromHash() {
    // Dispatch a synthetic hashchange to trigger LayoutRouter's internal syncFromHash()
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  }

  _handleRoute() {
    let route = getRoute();
    let section = route.panel;
    let subPath = route.subpath;

    if (hasSection(section) && section !== this.lastSection) {
      this.lastSection = section;
      let storageKey = `pg-layout-${this._projectId}-${section}`;
      this.ref.layout.$['@storage-key'] = storageKey;

      let saved = localStorage.getItem(storageKey);
      if (saved) {
        try {
          this.ref.layout.setLayout(JSON.parse(saved));
        } catch (err) {
          this._fallbackLayout(section);
        }
      } else {
        this._fallbackLayout(section);
      }
    }

    // Explorer file routing
    if (section === 'explorer' && subPath) {
      requestAnimationFrame(() => {
        dashEmit('file-selected', { path: subPath, fromRoute: true });
      });
    }
  }

  _fallbackLayout(section) {
    let layout = getLayout(section);
    if (layout) this.ref.layout.setLayout(layout);
  }
}

PgWorkspace.template = tpl;
PgWorkspace.reg('pg-workspace');
