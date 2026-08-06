/**
 * SidebarSection template
 * @module symbiote-ui/layout/LayoutSidebar/SidebarSection.tpl
 */
import { html } from '@symbiotejs/symbiote';

export let sidebarSectionTemplate = html`
  <div class="sec-drag-handle">
    <span class="material-symbols-outlined">drag_indicator</span>
  </div>
  <div class="sec-item" ${{ '@data-section-id': 'sectionId' }}>
    <span class="material-symbols-outlined sec-icon" ${{ textContent: 'icon' }}></span>
    <span class="sec-label" ${{ textContent: 'label' }}></span>
    <span class="material-symbols-outlined sec-expand">chevron_right</span>
  </div>
  <button class="sec-eye">
    <span class="material-symbols-outlined" ${{ textContent: 'eyeIcon' }}></span>
  </button>
  <div class="sec-sub-panels" itemize="subPanels" item-tag="sidebar-sub-item"></div>
`;
