/**
 * LayoutSidebar — collapsible workspace navigation with edit mode
 *
 * Normal mode: shows only visible sections
 * Edit mode: shows all sections with eye toggles and drag handles
 *
 * @module symbiote-ui/layout/LayoutSidebar
 */
import Symbiote from '@symbiotejs/symbiote';
import { ensureMaterialSymbols } from '../../icons/MaterialSymbols.js';
import { sidebarTemplate } from './LayoutSidebar.tpl.js';
import { sidebarStyles } from './LayoutSidebar.css.js';
import './SidebarSection.js';
import { translate } from '../../locale/index.js';

const STORAGE_KEY_COLLAPSED = 'sn-sidebar-collapsed';
const STORAGE_KEY_CONFIG = 'sn-sidebar-config';
const STORAGE_KEY_WIDTH = 'sn-sidebar-width';
const SIDEBAR_ICONS = ['chevron_left', 'restart_alt', 'tune'];

export class LayoutSidebar extends Symbiote {
  static isoMode = true;

  /**
   * When true (default), sidebar subscribes to ROUTER/panel PubSub
   * to auto-highlight active section. Set to false for multi-workspace
   * scenarios where the host manages active section programmatically.
   * @type {boolean}
   */
  routerSync = true;

  init$ = {
    '@disabled': false,
    '@sidebar-disabled': false,
    '@storage-key': '',
    activeSection: '',
    collapsed: false,
    editMode: false,
    sections: [],
    resetAllTitle: translate('layout.resetAll'),

    onToggle: () => {
      if (this.#isDisabled()) return;
      this.$.collapsed = !this.$.collapsed;
    },

    onToggleEditMode: () => {
      if (this.#isDisabled()) return;
      this.$.editMode = !this.$.editMode;
    },

    onResetAllLayouts: () => {
      this.resetConfig();
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem(this.#storageKey('width'));
      }
      this.#clearSidebarWidth();
      this.dispatchEvent(new CustomEvent('layout-sidebar-reset', {
        bubbles: true,
        composed: true,
        detail: {
          resetConfig: true,
          resetWidth: true,
        },
      }));
    },
  };

  /** @type {Array<{id: string, icon: string, label: string}>} */
  #allSections = [];

  renderCallback() {
    ensureMaterialSymbols(SIDEBAR_ICONS);
    this.#syncDisabled();

    this.sub('@disabled', () => this.#syncDisabled());
    this.sub('@sidebar-disabled', () => this.#syncDisabled());

    this.sub('collapsed', (val) => {
      this.toggleAttribute('collapsed', val);
    });
    this.sub('editMode', (val) => {
      this.toggleAttribute('edit-mode', val);
    });


    if (typeof localStorage !== 'undefined') {
      let stored = localStorage.getItem(this.#storageKey('collapsed'));
      if (stored === null || stored === 'true') {
        this.$.collapsed = true;
      }


      let savedWidth = localStorage.getItem(this.#storageKey('width'));
      if (savedWidth) this.#setSidebarWidth(savedWidth);
    }


    this.sub('collapsed', (val) => {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(this.#storageKey('collapsed'), String(val));

        if (val) {
          this.#clearSidebarWidth();
        } else {

          let w = localStorage.getItem(this.#storageKey('width'));
          if (w) {
            this.#setSidebarWidth(w);
          }
        }
      }
    });


    let handle = this.querySelector('.sb-resize-handle');
    if (handle) {
      let startX = 0;
      let startW = 0;

      let onMove = (e) => {
        let newWidth = Math.max(120, Math.min(600, startW + (e.clientX - startX)));
        this.#setSidebarWidth(newWidth);
        this.#setResizeActive(true);
      };

      let onUp = () => {
        handle.classList.remove('dragging');
        this.#setResizeActive(false);
        let w = this.offsetWidth;
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem(this.#storageKey('width'), w);
        }
        if (typeof document !== 'undefined') {
          document.removeEventListener('pointermove', onMove);
          document.removeEventListener('pointerup', onUp);
        }
      };

      handle.addEventListener('pointerdown', (e) => {
        if (this.#isDisabled()) return;
        e.preventDefault();
        e.stopPropagation();
        startX = e.clientX;
        startW = this.offsetWidth;
        handle.classList.add('dragging');
        if (typeof document !== 'undefined') {
          document.addEventListener('pointermove', onMove);
          document.addEventListener('pointerup', onUp);
        }
      });
    }
  }

  #isDisabled() {
    return (
      this.hasAttribute('disabled') ||
      this.hasAttribute('sidebar-disabled') ||
      this.$['@disabled'] === true ||
      this.$['@disabled'] === 'true' ||
      this.$['@sidebar-disabled'] === true ||
      this.$['@sidebar-disabled'] === 'true'
    );
  }

  #storageKey(kind) {
    let base = String(this.$['@storage-key'] || this.getAttribute('storage-key') || '').trim();
    if (base) return `${base}:${kind}`;
    if (kind === 'collapsed') return STORAGE_KEY_COLLAPSED;
    if (kind === 'config') return STORAGE_KEY_CONFIG;
    if (kind === 'width') return STORAGE_KEY_WIDTH;
    return `sn-sidebar-${kind}`;
  }

  #syncDisabled() {
    let disabled = this.#isDisabled();
    this.toggleAttribute('data-disabled', disabled);
    if (disabled) {
      this.setAttribute('aria-hidden', 'true');
    } else {
      this.removeAttribute('aria-hidden');
    }
    this.inert = disabled;
    if (disabled) {
      this.$.editMode = false;
      this.$.collapsed = true;
    }
  }

  /**
   * Configure sidebar sections
   * @param {Array<{id: string, icon: string, label: string, disabled?: boolean}>} items
   * @returns {void}
   */
  setSections(items) {
    this.#allSections = items;
    ensureMaterialSymbols(items.map((item) => item.icon));


    let savedConfig = this.#loadConfig();
    let ordered = items;

    if (savedConfig) {

      let orderMap = new Map(savedConfig.map((c, i) => [c.id, i]));
      ordered = [...items].sort((a, b) => {
        let ai = orderMap.get(a.id) ?? 999;
        let bi = orderMap.get(b.id) ?? 999;
        return ai - bi;
      });
    }

    this.#buildSections(ordered, savedConfig);


    if (this.routerSync) {
      this.sub('ROUTER/panel', (panel) => {
        this.$.sections = this.$.sections.map((s) => ({
          ...s,
          isActive: s.sectionId === panel,
        }));
      });
    }
  }

  /**
   * Programmatically set the active section (highlight).
   * Use in multi-workspace scenarios where routerSync is disabled.
   * @param {string} sectionId — section ID to mark active
   */
  setActiveSection(sectionId) {
    this.$.activeSection = sectionId || '';
    this.$.sections = this.$.sections.map((s) => ({
      ...s,
      isActive: s.sectionId === sectionId,
    }));
  }

  /**
   * Build sections array from ordered items + config
   * @param {Array<{id: string, icon: string, label: string, disabled?: boolean}>} items
   * @param {Array<{id: string, visible: boolean}>|null} config
   */
  #buildSections(items, config) {
    let visibilityMap = config ? new Map(config.map((c) => [c.id, c.visible])) : null;

    this.$.sections = items.map((item) => ({
      sectionId: item.id,
      icon: item.icon,
      label: item.label,
      isActive: false,
      isVisible: visibilityMap ? (visibilityMap.get(item.id) ?? true) : true,
      isDisabled: Boolean(item.disabled),
      isExpanded: false,
      subPanels: item.subPanels || [],
    }));
  }

  /**
   * Toggle visibility of a section
   * @param {string} sectionId
   * @returns {void}
   */
  toggleVisibility(sectionId) {
    this.$.sections = this.$.sections.map((s) => {
      if (s.sectionId !== sectionId) return s;
      return { ...s, isVisible: !s.isVisible };
    });
    this.#saveConfig();
  }

  /**
   * Move section by drag (swap positions)
   * @param {number} fromIndex
   * @param {number} toIndex
   */
  moveSection(fromIndex, toIndex) {
    let arr = [...this.$.sections];
    let [moved] = arr.splice(fromIndex, 1);
    arr.splice(toIndex, 0, moved);
    this.$.sections = arr;
    this.#saveConfig();
  }

  /**
   * Reset sections to default order and visibility
   */
  resetConfig() {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(this.#storageKey('config'));
    }
    this.#buildSections(this.#allSections, null);
  }

  /**
   * Save current section order and visibility
   */
  #saveConfig() {
    let config = this.$.sections.map((s) => ({
      id: s.sectionId,
      visible: s.isVisible,
    }));
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(this.#storageKey('config'), JSON.stringify(config));
    }
  }

  /**
   * Load saved section config
   * @returns {Array<{id: string, visible: boolean}>|null}
   */
  #loadConfig() {
    try {
      if (typeof localStorage !== 'undefined') {
        let raw = localStorage.getItem(this.#storageKey('config'));
        return raw ? JSON.parse(raw) : null;
      }
    } catch {
      return null;
    }
    return null;
  }

  /**
   * Update sub-panel list for a section
   * @param {string} sectionId
   * @param {Array<{title: string, icon: string}>} panels
   * @returns {void}
   */
  updateSubPanels(sectionId, panels) {
    this.$.sections = this.$.sections.map((s) => {
      if (s.sectionId !== sectionId) return s;
      return { ...s, subPanels: panels };
    });
  }

  /**
   * Mark sections as disabled (shown but not clickable)
   * @param {string[]} disabledIds - Section IDs to disable
   */
  setDisabledSections(disabledIds) {
    let disabledSet = new Set(disabledIds);
    this.$.sections = this.$.sections.map((s) => ({
      ...s,
      isDisabled: disabledSet.has(s.sectionId),
    }));
  }

  #setSidebarWidth(width) {
    let style = this.style;
    style.setProperty('width', `${width}px`);
    style.setProperty('min-width', `${width}px`);
  }

  #clearSidebarWidth() {
    let style = this.style;
    style.removeProperty('width');
    style.removeProperty('min-width');
  }

  #setResizeActive(active) {
    let style = this.style;
    if (active) {
      style.setProperty('transition', 'none');
    } else {
      style.removeProperty('transition');
    }
  }
}

LayoutSidebar.template = sidebarTemplate;
LayoutSidebar.rootStyles = sidebarStyles;
LayoutSidebar.reg('layout-sidebar');
