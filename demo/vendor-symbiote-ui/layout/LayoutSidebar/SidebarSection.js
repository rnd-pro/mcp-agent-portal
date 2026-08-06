/**
 * SidebarSection — itemize sub-component for sidebar section items
 *
 * Renders a master panel entry with icon, label.
 * Edit mode: shows visibility toggle + drag handle.
 * Shows sub-panel list with close buttons for non-master panels.
 *
 * @module symbiote-ui/layout/LayoutSidebar/SidebarSection
 */
import Symbiote, { html } from '@symbiotejs/symbiote';
import { ensureMaterialSymbols } from '../../icons/MaterialSymbols.js';
import { sidebarSectionTemplate } from './SidebarSection.tpl.js';
import { styles } from './SidebarSection.css.js';
import { navigate } from '../LayoutRouter/LayoutRouter.js';

const SIDEBAR_SECTION_ICONS = ['chevron_right', 'close', 'drag_indicator', 'visibility', 'visibility_off'];

export class SidebarSection extends Symbiote {
  static isoMode = true;

  init$ = {
    sectionId: '',
    icon: 'dashboard',
    label: '',
    isActive: false,
    isVisible: true,
    isDisabled: false,
    eyeIcon: 'visibility',
    hasSubPanels: false,
    isExpanded: false,
    subPanels: [],

    onSectionClick: () => {
      if (!this.$.isVisible || this.$.isDisabled) return;
      let sectionId = this.#getSectionId();
      if (!sectionId) return;
      let sidebar = this.closest('layout-sidebar');
      let event = new CustomEvent('sidebar-section-select', {
        bubbles: true,
        composed: true,
        cancelable: true,
        detail: {
          id: sectionId,
          sectionId,
        },
      });
      let shouldNavigate = this.dispatchEvent(event);
      if (!shouldNavigate || sidebar?.routerSync === false) return;
      navigate(sectionId);
    },

    onExpandToggle: (e) => {
      e.stopPropagation();
      if (!this.$.hasSubPanels) return;
      this.$.isExpanded = !this.$.isExpanded;
    },

    onToggleVisibility: (e) => {
      e.stopPropagation();
      let sidebar = this.closest('layout-sidebar');
      if (sidebar) sidebar.toggleVisibility(this.#getSectionId());
    },
  };

  renderCallback() {
    ensureMaterialSymbols(['close', 'drag_indicator', 'expand_more', 'visibility', 'visibility_off', this.$.icon]);
    this.sub('icon', (icon) => ensureMaterialSymbols([icon]));
    this.#bindSectionControls();

    this.sub('sectionId', (id) => {
      if (id) {
        this.dataset.sectionId = String(id);
      } else {
        this.removeAttribute('data-section-id');
      }
    });

    this.sub('isActive', (val) => {
      this.toggleAttribute('data-active', val);
    });

    this.sub('isExpanded', (val) => {
      this.toggleAttribute('data-expanded', val);
    });

    this.sub('isVisible', (val) => {
      this.toggleAttribute('data-hidden', !val);
      this.$.eyeIcon = val ? 'visibility' : 'visibility_off';
      ensureMaterialSymbols([this.$.eyeIcon]);
    });

    this.sub('isDisabled', (val) => {
      this.toggleAttribute('data-disabled', val);
    });

    this.sub('subPanels', (panels) => {
      let has = panels && panels.length > 0;
      this.$.hasSubPanels = has;
      this.toggleAttribute('data-has-sub', has);

      if (!has) this.$.isExpanded = false;
    });


    this.setAttribute('draggable', 'true');

    this.addEventListener('dragstart', (e) => {
      let sidebar = this.closest('layout-sidebar');
      if (!sidebar?.hasAttribute('edit-mode')) {
        e.preventDefault();
        return;
      }
      let sections = Array.from(this.parentElement.children);
      let idx = sections.indexOf(this);
      e.dataTransfer.setData('text/plain', String(idx));
      e.dataTransfer.effectAllowed = 'move';
      this.setAttribute('data-dragging', '');
    });

    this.addEventListener('dragend', () => {
      this.removeAttribute('data-dragging');
    });

    this.addEventListener('dragover', (e) => {
      let sidebar = this.closest('layout-sidebar');
      if (!sidebar?.hasAttribute('edit-mode')) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      this.setAttribute('data-dragover', '');
    });

    this.addEventListener('dragleave', () => {
      this.removeAttribute('data-dragover');
    });

    this.addEventListener('drop', (e) => {
      e.preventDefault();
      this.removeAttribute('data-dragover');
      let sidebar = this.closest('layout-sidebar');
      if (!sidebar?.hasAttribute('edit-mode')) return;

      let fromIdx = parseInt(e.dataTransfer.getData('text/plain'), 10);
      let sections = Array.from(this.parentElement.children);
      let toIdx = sections.indexOf(this);
      if (fromIdx !== toIdx) {
        sidebar.moveSection(fromIdx, toIdx);
      }
    });
  }

  #bindSectionControls() {
    if (this._sectionControlsBound) return;
    let item = this.querySelector('.sec-item');
    if (!item) return;

    item.addEventListener('click', this.$.onSectionClick);
    this.querySelector('.sec-expand')?.addEventListener('click', this.$.onExpandToggle);
    this.querySelector('.sec-eye')?.addEventListener('click', this.$.onToggleVisibility);
    this._sectionControlsBound = true;
  }

  #getSectionId() {
    return this.$.sectionId || this.dataset.sectionId || this.querySelector('.sec-item')?.dataset.sectionId || '';
  }
}

SidebarSection.template = sidebarSectionTemplate;
SidebarSection.rootStyles = styles;
SidebarSection.reg('sidebar-section');

/**
 * SidebarSubItem — sub-panel entry inside a section
 * Shows close button for non-master panels (isMaster=false)
 */
export class SidebarSubItem extends Symbiote {
  static isoMode = true;

  init$ = {
    title: '',
    icon: 'web_asset',
    panelId: '',
    isMaster: false,

    onClose: (e) => {
      e.stopPropagation();
      let panelId = this.$.panelId;
      if (!panelId) return;


      let sidebar = this.closest('layout-sidebar');
      if (sidebar) {
        sidebar.dispatchEvent(
          new CustomEvent('panel-close', {
            bubbles: true,
            detail: { panelId },
          })
        );
      }
    },
  };

  renderCallback() {
    ensureMaterialSymbols(['close', this.$.icon]);
    this.sub('icon', (icon) => ensureMaterialSymbols([icon]));
    this.#bindSubItemControls();

    this.sub('isMaster', (val) => {
      this.toggleAttribute('data-master', val);
    });
  }

  #bindSubItemControls() {
    if (this._subItemControlsBound) return;
    let close = this.querySelector('.sub-panel-close');
    if (!close) return;

    close.addEventListener('click', this.$.onClose);
    this._subItemControlsBound = true;
  }
}

SidebarSubItem.template = html`
  <div class="sub-panel-item">
    <span class="material-symbols-outlined" ${{ textContent: 'icon' }}></span>
    <span ${{ textContent: 'title' }}></span>
    <button class="sub-panel-close">
      <span class="material-symbols-outlined">close</span>
    </button>
  </div>
`;

SidebarSubItem.reg('sidebar-sub-item');
