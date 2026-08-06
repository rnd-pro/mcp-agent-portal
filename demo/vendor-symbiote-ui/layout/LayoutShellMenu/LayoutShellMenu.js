import Symbiote from '@symbiotejs/symbiote';
import { slotProcessor } from '@symbiotejs/symbiote/core/slotProcessor.js';
import { ensureMaterialSymbols } from '../../icons/MaterialSymbols.js';
import '../ProjectTabs/ProjectTabs.js';
import css from './LayoutShellMenu.css.js';
import tpl from './LayoutShellMenu.tpl.js';
import {
  createLayoutGroupModel,
  getActiveLayoutGroup,
  getHomeLayoutGroup,
} from './layout-groups.js';

const ICONS = ['add', 'folder_open', 'home', 'hub'];

function attr(el, name, fallback) {
  let value = el.getAttribute(name);
  return value === null || value === '' ? fallback : value;
}

function emit(el, type, detail = {}) {
  el.dispatchEvent(new CustomEvent(type, { bubbles: true, composed: true, detail }));
}

export class LayoutShellMenu extends Symbiote {
  init$ = {
    title: 'Workspace',
    titleIcon: 'hub',
    pathLabel: '',
    pathIcon: 'folder_open',
    activeId: null,
    tabs: [],
    groups: [],
    onSidebarSlotChange: () => this._syncSidebar(),
  };

  #groups = [];
  #homeGroupId = null;
  #sidebarSections = [];

  constructor() {
    super();
    this.templateProcessors.add(slotProcessor);
  }

  initCallback() {
    this.$.title = attr(this, 'title', this.$.title);
    this.$.titleIcon = attr(this, 'title-icon', this.$.titleIcon);
    this.$.pathLabel = attr(this, 'path-label', attr(this, 'project-path', this.$.pathLabel));
    this.$.pathIcon = attr(this, 'path-icon', this.$.pathIcon);
    ensureMaterialSymbols([this.$.titleIcon, this.$.pathIcon, ...ICONS]);
    this.addEventListener('project-tabs-home', this.#onTabsHome);
    this.addEventListener('project-tabs-add', this.#onTabsAdd);
    this.addEventListener('project-tabs-select', this.#onTabsSelect);
    this.addEventListener('project-tabs-close', this.#onTabsClose);
    this.addEventListener('sidebar-section-select', this.#onSidebarSelect);
  }

  renderCallback() {
    this.sub('tabs', () => this._syncTabs());
    this.sub('activeId', () => this._syncTabs());
  }

  setTabs(tabs = [], activeId = this.$.activeId) {
    this.$.activeId = activeId || null;
    this.$.tabs = Array.isArray(tabs) ? tabs : [];
    this._syncTabs();
  }

  setGroups(groups = [], activeId = this.$.activeId) {
    let model = createLayoutGroupModel(groups, activeId);
    this.#groups = model.groups;
    this.#homeGroupId = model.homeGroupId;
    this.#sidebarSections = model.sidebarSections;
    this.$.groups = this.#groups;
    this.$.activeId = model.activeId;
    this.$.tabs = model.tabs;
    ensureMaterialSymbols(this.#groups.flatMap((group) => [group.icon, group.sidebarIcon]));
    this._syncTabs();
    this._syncSidebar();
  }

  setActiveGroup(id) {
    let group = getActiveLayoutGroup(this.#groups, id);
    if (!group || group.disabled) return false;
    this.$.activeId = group.id;
    this.$.tabs = createLayoutGroupModel(this.#groups, group.id).tabs;
    this._syncTabs();
    this._syncSidebar();
    return true;
  }

  selectGroup(id, source = 'api') {
    let group = this.#groups.find((item) => item.id === id);
    if (!group || group.disabled) return false;
    this.setActiveGroup(group.id);
    emit(this, 'layout-group-change', { id: group.id, source, group });
    return true;
  }

  _syncTabs() {
    let home = getHomeLayoutGroup(this.#groups);
    this.ref.tabs?.setTabs?.(this.$.tabs, this.$.activeId, {
      homeId: this.#homeGroupId,
      homeIcon: home?.icon || 'home',
      homeLabel: home?.name || home?.label || '',
    });
  }

  _syncSidebar() {
    let sidebar = this.#getSidebar();
    if (!sidebar) return;
    sidebar.routerSync = false;
    sidebar.setSections?.(this.#sidebarSections);
    sidebar.setActiveSection?.(this.$.activeId);
  }

  #getSidebar() {
    let slotted = this.ref.sidebarSlot?.assignedElements?.({ flatten: true }) || [];
    return slotted.find((el) => el?.matches?.('layout-sidebar') || el?.tagName?.toLowerCase?.() === 'layout-sidebar')
      || this.querySelector(':scope > layout-sidebar[slot="sidebar"], :scope > [slot="sidebar"]');
  }

  #onTabsHome = () => {
    let home = getHomeLayoutGroup(this.#groups);
    if (home) this.selectGroup(home.id, 'tabs-home');
  };

  #onTabsAdd = () => {
    emit(this, 'layout-group-add', { source: 'tabs-add' });
  };

  #onTabsSelect = (event) => {
    this.selectGroup(event.detail?.id, 'tabs');
  };

  #onTabsClose = (event) => {
    let id = event.detail?.id;
    let group = this.#groups.find((item) => item.id === id);
    if (!group || group.disabled || !group.closeable) return;
    emit(this, 'layout-group-close', { id: group.id, source: 'tabs-close', group });
  };

  #onSidebarSelect = (event) => {
    let id = event.detail?.id || event.detail?.sectionId;
    if (!this.#groups.some((group) => group.id === id)) return;
    event.preventDefault?.();
    this.selectGroup(id, 'sidebar');
  };
}

LayoutShellMenu.template = tpl;
LayoutShellMenu.rootStyles = css;
LayoutShellMenu.reg('layout-shell-menu');

export default LayoutShellMenu;
