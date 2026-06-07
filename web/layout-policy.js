import { LayoutTree } from 'symbiote-ui/ui';
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

function hasResponsiveBehavior(behavior) {
  return behavior
    && typeof behavior.importance === 'number'
    && typeof behavior.minInlineSize === 'number'
    && typeof behavior.minBlockSize === 'number'
    && ['auto', 'manual', 'never'].includes(behavior.collapse)
    && ['collapse', 'scroll-inline', 'scroll-block', 'scroll'].includes(behavior.overflow)
    && ['preserve', 'stack', 'scroll-inline'].includes(behavior.responsiveMode);
}

export function layoutHasBehaviorMetadata(layoutTree) {
  if (!layoutTree || !hasResponsiveBehavior(layoutTree.behavior)) return false;
  if (layoutTree.type !== 'split') return true;
  return layoutHasBehaviorMetadata(layoutTree.first) && layoutHasBehaviorMetadata(layoutTree.second);
}

export function layoutMatchesSection(sectionId, layoutTree, fallbackTree = getLayout(sectionId)) {
  if (!layoutTree) return false;
  if (!layoutHasBehaviorMetadata(layoutTree)) return false;
  let migration = sectionLayoutMigrations[sectionId] || {};
  let expectedPrimary = fallbackTree ? LayoutTree.getPrimaryPanelType(fallbackTree) : null;
  return LayoutTree.matchesSection(layoutTree, {
    disallowedPanelTypes: migration.disallowedPanelTypes,
    requiredPanelTypes: migration.requiredPanelTypes,
    expectedPrimary: expectedPrimary || undefined,
  });
}
