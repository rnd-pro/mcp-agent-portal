import { LayoutTree } from 'symbiote-node/ui';
import { getLayout } from './router-registry.js';

export const sectionLayoutMigrations = {
  dashboard: {
    disallowedPanelTypes: new Set(['action-board']),
  },
  orchestration: {
    disallowedPanelTypes: new Set(['group-mgr', 'workflow-exp', 'pipeline-mgr']),
  },
  skills: {
    disallowedPanelTypes: new Set(['peer-review']),
    requiredPanelTypes: new Set(['agent-portal-tree', 'agent-portal-library', 'skill-meta']),
  },
};

export function layoutMatchesSection(sectionId, layoutTree, fallbackTree = getLayout(sectionId)) {
  if (!layoutTree) return false;
  let migration = sectionLayoutMigrations[sectionId];
  if (migration?.disallowedPanelTypes) {
    if (LayoutTree.hasAnyPanelType(layoutTree, migration.disallowedPanelTypes)) return false;
  }
  if (migration?.requiredPanelTypes) {
    if (!LayoutTree.hasEveryPanelType(layoutTree, migration.requiredPanelTypes)) return false;
  }
  let expectedPrimary = LayoutTree.getPrimaryPanelType(fallbackTree);
  if (!expectedPrimary) return true;
  return LayoutTree.collectPanelTypes(layoutTree, { includeGlobal: false }).includes(expectedPrimary);
}
