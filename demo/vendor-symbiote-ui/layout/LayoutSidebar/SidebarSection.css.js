/**
 * SidebarSection styles
 *
 * Component-level styles currently live in LayoutSidebar.css.js
 * due to deep parent-context coupling (layout-sidebar[edit-mode],
 * layout-sidebar[collapsed] scoping). Move here when refactoring
 * context-dependent selectors into component state attributes.
 *
 * @module symbiote-ui/layout/LayoutSidebar/SidebarSection.css
 */
import { css } from '@symbiotejs/symbiote';

export let styles = css`
  sidebar-section {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    position: relative;
  }
`;
