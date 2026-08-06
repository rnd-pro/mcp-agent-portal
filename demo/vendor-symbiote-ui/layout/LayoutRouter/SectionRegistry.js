import * as LayoutTree from '../LayoutTree.js';

export const SECTION_SCOPES = Object.freeze({
  HOME: 'home',
  PROJECT: 'project',
  BOTH: 'both',
});

export class SectionRegistry {
  constructor() {
    this.sections = new Map();
    this.layouts = new Map();
  }

  registerSection(id, { icon, label, order = 100, scope = SECTION_SCOPES.BOTH, layout } = {}) {
    if (!id) throw new TypeError('Section id is required');
    let normalizedScope = normalizeSectionScope(scope);
    this.sections.set(id, { id, icon, label, order, scope: normalizedScope });
    if (layout) this.layouts.set(id, layout);
    return this.getSection(id);
  }

  getSection(id) {
    return this.sections.get(id) || null;
  }

  getSections(filter = {}) {
    let result = [...this.sections.values()];
    if (filter.scope) {
      result = result.filter((section) => sectionMatchesScope(section, filter.scope));
    }
    return result.sort((a, b) => a.order - b.order);
  }

  getHomeSections() {
    return this.getSections({ scope: SECTION_SCOPES.HOME });
  }

  getProjectSections() {
    return this.getSections({ scope: SECTION_SCOPES.PROJECT });
  }

  getSectionsForScope(projectIdOrScope) {
    let scope = projectIdOrScope === SECTION_SCOPES.HOME || projectIdOrScope === SECTION_SCOPES.PROJECT
      ? projectIdOrScope
      : projectIdOrScope
        ? SECTION_SCOPES.PROJECT
        : SECTION_SCOPES.HOME;
    return this.getSections({ scope });
  }

  getLayout(id) {
    let layout = this.layouts.get(id);
    return typeof layout === 'function' ? layout() : null;
  }

  hasSection(id) {
    return this.sections.has(id);
  }

  clear() {
    this.sections.clear();
    this.layouts.clear();
  }
}

export function createSectionRegistry() {
  return new SectionRegistry();
}

export function normalizeSectionScope(scope = SECTION_SCOPES.BOTH) {
  if (scope === SECTION_SCOPES.HOME || scope === SECTION_SCOPES.PROJECT || scope === SECTION_SCOPES.BOTH) {
    return scope;
  }
  return SECTION_SCOPES.BOTH;
}

export function sectionMatchesScope(section, scope) {
  let normalized = normalizeSectionScope(scope);
  return section?.scope === normalized || section?.scope === SECTION_SCOPES.BOTH;
}

export function withGlobalPanel(layoutFn, panelType, {
  direction = 'horizontal',
  ratio = 0.65,
  collapsed = true,
  global = true,
  behavior,
  splitBehavior,
  panelState = {},
} = {}) {
  return () => {
    let main = layoutFn();
    let panel = LayoutTree.createPanel(panelType, panelState, behavior);
    panel.global = global;
    panel.collapsed = collapsed;
    return LayoutTree.createSplit(direction, main, panel, ratio, splitBehavior);
  };
}

const defaultRegistry = createSectionRegistry();

export function registerSection(id, options) {
  return defaultRegistry.registerSection(id, options);
}

export function getSection(id) {
  return defaultRegistry.getSection(id);
}

export function getSections(filter) {
  return defaultRegistry.getSections(filter);
}

export function getHomeSections() {
  return defaultRegistry.getHomeSections();
}

export function getProjectSections() {
  return defaultRegistry.getProjectSections();
}

export function getSectionsForScope(projectIdOrScope) {
  return defaultRegistry.getSectionsForScope(projectIdOrScope);
}

export function getLayout(id) {
  return defaultRegistry.getLayout(id);
}

export function hasSection(id) {
  return defaultRegistry.hasSection(id);
}

export function clearSections() {
  defaultRegistry.clear();
}
