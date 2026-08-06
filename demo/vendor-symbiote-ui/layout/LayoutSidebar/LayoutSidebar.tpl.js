/**
 * LayoutSidebar template
 * @module symbiote-ui/layout/LayoutSidebar
 */
import { html } from '@symbiotejs/symbiote';

export let sidebarTemplate = html`
  <div class="sb-header">
    <button class="sb-header-btn" ${{ onclick: 'onToggleEditMode' }}>
      <span class="material-symbols-outlined">tune</span>
    </button>
    <button
      class="sb-header-btn sb-reset-btn"
      ${{ onclick: 'onResetAllLayouts', title: 'resetAllTitle' }}
    >
      <span class="material-symbols-outlined">restart_alt</span>
    </button>
    <div class="sb-header-spacer"></div>
    <button class="sb-header-btn" ${{ onclick: 'onToggle' }}>
      <span class="material-symbols-outlined sb-collapse-icon">chevron_left</span>
    </button>
  </div>

  <div class="sb-sections" itemize="sections" item-tag="sidebar-section"></div>
  <div class="sb-resize-handle"></div>
`;
