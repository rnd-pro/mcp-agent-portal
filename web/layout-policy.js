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
  let migration = sectionLayoutMigrations[sectionId] || {};
  let expectedPrimary = fallbackTree ? LayoutTree.getPrimaryPanelType(fallbackTree) : null;
  return LayoutTree.matchesSection(layoutTree, {
    disallowedPanelTypes: migration.disallowedPanelTypes,
    requiredPanelTypes: migration.requiredPanelTypes,
    expectedPrimary: expectedPrimary || undefined,
  });
}

