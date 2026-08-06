import Symbiote, { html } from '@symbiotejs/symbiote';
import css from './ProjectTabs.css.js';
import tpl from './ProjectTabs.tpl.js';
import { translate } from '../../locale/index.js';

function emit(el, type, detail = {}) {
  el.dispatchEvent(new CustomEvent(type, { bubbles: true, composed: true, detail }));
}

export class ProjectTabs extends Symbiote {
  init$ = {
    activeId: null,
    homeId: null,
    isHomeActive: true,
    homeSelectedAttr: 'true',
    homeTabIndexAttr: '0',
    homeTabIdAttr: 'home',
    tabs: [],
    homeIcon: 'home',
    homeLabel: translate('tabs.home'),
    addTitle: translate('tabs.openProject'),
    onHomeClick: () => emit(this, 'project-tabs-home'),
    onAddClick: () => emit(this, 'project-tabs-add'),
  };

  #onKeydown = (e) => {
    const tabs = this.getTabsElements();
    if (tabs.length === 0) return;

    const activeEl = document.activeElement;
    let index = tabs.indexOf(activeEl);
    if (index === -1) {
      const item = activeEl?.closest('project-tab-item');
      index = tabs.indexOf(item);
    }
    if (index === -1) return;

    let nextIndex = index;
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      nextIndex = (index + 1) % tabs.length;
      tabs[nextIndex].focus();
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      nextIndex = (index - 1 + tabs.length) % tabs.length;
      tabs[nextIndex].focus();
    } else if (e.key === 'Home') {
      e.preventDefault();
      tabs[0].focus();
    } else if (e.key === 'End') {
      e.preventDefault();
      tabs[tabs.length - 1].focus();
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      const currentTab = tabs[index];
      if (currentTab && currentTab.tagName === 'PROJECT-TAB-ITEM' && currentTab.$.closeable && !currentTab.$.disabled) {
        e.preventDefault();
        emit(currentTab, 'project-tabs-close', { id: currentTab.$.id });
      }
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      const currentTab = tabs[index];
      if (currentTab) {
        if (currentTab.classList.contains('tab')) {
          emit(this, 'project-tabs-home');
        } else if (!currentTab.$.disabled) {
          emit(currentTab, 'project-tabs-select', { id: currentTab.$.id });
        }
      }
    }
  };

  getTabsElements() {
    const homeTab = this.querySelector('.tab');
    const items = Array.from(this.querySelectorAll('project-tab-item'));
    return [homeTab, ...items].filter(Boolean);
  }

  connectedCallback() {
    super.connectedCallback?.();
    this.addEventListener('keydown', this.#onKeydown);
  }

  disconnectedCallback() {
    this.removeEventListener('keydown', this.#onKeydown);
    super.disconnectedCallback?.();
  }

  renderCallback() {
    this.sub('activeId', (id) => this.setAttribute('active-id', id || ''));
    this.sub('isHomeActive', (isHomeActive) => {
      this.$.homeSelectedAttr = isHomeActive ? 'true' : 'false';
      this.$.homeTabIndexAttr = isHomeActive ? '0' : '-1';
    });
    this.sub('homeId', (id) => { this.$.homeTabIdAttr = id || 'home'; });
  }

  setTabs(tabs = [], activeId = this.$.activeId, options = {}) {
    if (Object.hasOwn(options, 'homeId')) {
      this.$.homeId = options.homeId || null;
    }
    if (Object.hasOwn(options, 'homeLabel')) {
      this.$.homeLabel = options.homeLabel || translate('tabs.home');
    }
    if (Object.hasOwn(options, 'homeIcon')) {
      this.$.homeIcon = options.homeIcon || 'home';
    }
    this.$.activeId = activeId || null;
    this.$.isHomeActive = !this.$.activeId || this.$.activeId === this.$.homeId;

    this.$.tabs = tabs.map((tab, index) => ({
      ...tab,
      id: tab.id,
      name: tab.name || tab.id,
      color: tab.color || tab.accent || `var(--sn-tab-accent-${index % 6})`,
      icon: tab.icon || 'folder',
      closeable: tab.closeable === true,
      disabled: Boolean(tab.disabled),
      isActive: tab.id === this.$.activeId,
    }));
  }
}

class ProjectTabItem extends Symbiote {
  init$ = {
    id: '',
    name: '',
    color: '',
    icon: 'folder',
    closeable: true,
    disabled: false,
    isActive: false,
    closeTitle: translate('tabs.close'),
    onClick: (e) => {
      if (e.target.closest('.tab-close')) return;
      if (this.$.disabled) return;
      emit(this, 'project-tabs-select', { id: this.$.id });
    },
    onCloseClick: (e) => {
      e.stopPropagation();
      if (this.$.disabled || !this.$.closeable) return;
      emit(this, 'project-tabs-close', { id: this.$.id });
    },
  };

  renderCallback() {
    this.setAttribute('role', 'tab');
    this.sub('id', (id) => {
      if (id) this.setAttribute('data-tab-id', id);
      else this.removeAttribute('data-tab-id');
    });
    this.sub('color', (color) => {
      if (color) this.style.setProperty('--tab-accent', color);
      else this.style.removeProperty('--tab-accent');
    });
    this.sub('isActive', (value) => {
      this.toggleAttribute('active', value);
      this.setAttribute('aria-selected', value ? 'true' : 'false');
      const tabIdx = (value && !this.$.disabled) ? 0 : -1;
      this.setAttribute('tabindex', String(tabIdx));
      this.tabIndex = tabIdx;
    });
    this.sub('disabled', (value) => {
      this.toggleAttribute('disabled', value);
      this.setAttribute('aria-disabled', value ? 'true' : 'false');
      if (value) {
        this.setAttribute('tabindex', '-1');
        this.tabIndex = -1;
      }
    });
    this.onclick = this.$.onClick;
  }
}

ProjectTabItem.template = html`
  <span class="tab-lead">
    <span class="material-symbols-outlined" ${{ textContent: 'icon' }}></span>
    <button class="tab-close" ${{ title: 'closeTitle', 'aria-label': 'closeTitle', onclick: 'onCloseClick', '@hidden': '!closeable' }}>×</button>
  </span>
  <span ${{ textContent: 'name' }}></span>
`;

ProjectTabItem.reg('project-tab-item');

ProjectTabs.template = tpl;
ProjectTabs.rootStyles = css;
ProjectTabs.reg('project-tabs');

export default ProjectTabs;
