/**
 * @fileoverview SSR-safe layout primitives.
 *
 * This entrypoint exposes pure layout tree, routing, and section registry
 * helpers. Browser custom elements are exposed from `symbiote-ui/ui`.
 */

export * as LayoutTree from './LayoutTree.js';
export {
  closeUiPanel,
  findPanel,
  findPanelByType,
  hasLayoutBehaviorMetadata,
  layoutHasBehaviorMetadata,
  openPanel,
  removeUiPanel,
  resolveLayoutMinSize,
  resolveMobileDrawerLayout,
  resolveResponsiveLayoutState,
} from './LayoutTree.js';
export {
  buildHash,
  buildQuery,
  configureRouter,
  getRoute,
  getRouterBasePath,
  getRouterMode,
  navigate,
  parseQuery,
  registerGlobalParam,
  setDefaultPanel,
  setGlobalParam,
  updateParams,
} from './LayoutRouter/LayoutRouter.js';
export {
  setupPanelRouting,
  syncWithRouter,
} from './LayoutRouter/routerSync.js';
export {
  SECTION_SCOPES,
  SectionRegistry,
  createSectionRegistry,
  normalizeSectionScope,
  sectionMatchesScope,
  withGlobalPanel,
  registerSection,
  getSection,
  getSections,
  getHomeSections,
  getProjectSections,
  getSectionsForScope,
  getLayout,
  hasSection,
  clearSections,
} from './LayoutRouter/SectionRegistry.js';
export {
  createLayoutGroupModel,
  createLayoutGroupSections,
  createLayoutGroupTabs,
  getActiveLayoutGroup,
  getHomeLayoutGroup,
  normalizeLayoutGroup,
  normalizeLayoutGroups,
} from './LayoutShellMenu/layout-groups.js';
export {
  DEFAULT_LAYOUT_LIFECYCLE_SELECTOR,
  resumeLayoutSubtree,
  suspendLayoutSubtree,
} from './lifecycle.js';
