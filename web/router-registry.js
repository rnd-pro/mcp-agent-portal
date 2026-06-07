/**
 * RouterRegistry — extensible section & panel registry for Agent Portal.
 * Sections are registered declaratively and can be added at runtime
 * (e.g. from marketplace plugins or dynamically discovered MCP servers).
 */
import {
  LayoutTree,
  registerSection,
  getSections,
  getHomeSections,
  getProjectSections,
  getSectionsForScope,
  getLayout,
  hasSection,
  withGlobalPanel,
} from 'symbiote-ui/ui';
import { tPortal } from './common/localization.js';

export {
  registerSection,
  getSections,
  getHomeSections,
  getProjectSections,
  getSectionsForScope,
  getLayout,
  hasSection,
  withChat,
};

// ── Panel Type Definitions ──────────────────────────────────────
// Each panel type maps an ID to a web component tag.
// New MCP servers can register their own panel types via registerPanelType().
export const panelTypes = {
  'file-tree':    { title: tPortal('text.files'),         icon: 'folder',        component: 'pg-file-tree' },
  'code-viewer':  { title: tPortal('text.code'),          icon: 'code',          component: 'pg-code-viewer' },
  'ctx-panel':    { title: tPortal('text.documentation'), icon: 'description',   component: 'pg-ctx-panel' },
  'dep-graph':    { title: tPortal('text.dependencies'),  icon: 'account_tree',  component: 'pg-dep-graph' },
  'graph-flows':  { title: tPortal('text.flows'),         icon: 'movie',         component: 'pg-graph-flows' },
  'health':       { title: tPortal('text.health'),        icon: 'analytics',     component: 'pg-health-panel' },
  'monitor':      { title: tPortal('text.liveMonitor'),   icon: 'monitor_heart', component: 'pg-ops-panel' },
  'runtime-control': { title: tPortal('text.runtime'),    icon: 'memory',        component: 'pg-runtime-control' },
  'spatial-layout': { title: tPortal('text.spatial'),     icon: 'view_in_ar',    component: 'pg-spatial-layout' },
  'settings':     { title: tPortal('text.settings'),      icon: 'settings',      component: 'pg-settings-panel' },
  'project-list': { title: tPortal('text.workspaces'),    icon: 'dashboard',     component: 'pg-project-list' },
  'action-board': { title: tPortal('text.actionBoard'),   icon: 'monitor_heart', component: 'pg-action-board' },
  'agent-chat':   { title: tPortal('text.chats'),         icon: 'smart_toy',     component: 'pg-agent-chat' },
  'marketplace':  { title: tPortal('text.marketplace'),   icon: 'storefront',    component: 'pg-marketplace' },
  'topology-panel':{ title: tPortal('text.topology'),     icon: 'hub',           component: 'topology-panel' },
  'tool-explorer':{ title: tPortal('text.toolExplorer'),  icon: 'build',         component: 'pg-tool-explorer' },
  'active-context':{title: tPortal('text.activeContext'), icon: 'data_object',   component: 'pg-active-context' },
  'active-tasks': { title: tPortal('text.activeTasks'),   icon: 'memory',        component: 'pg-active-tasks' },
  'pipeline-mgr': { title: tPortal('text.pipelines'),     icon: 'schema',        component: 'pg-pipeline-mgr' },
  'group-mgr':    { title: tPortal('text.resourceGroups'),icon: 'groups',        component: 'pg-group-manager' },
  'agent-portal-tree': { title: '.agent-portal', icon: 'folder',    component: 'pg-agent-portal-tree' },
  'agent-portal-library': { title: tPortal('text.openLibrary'), icon: 'public', component: 'pg-agent-portal-library' },
  'skill-mgr':    { title: tPortal('text.markdownEditor'), icon: 'edit_note', component: 'pg-skill-manager' },
  'skill-meta':   { title: tPortal('text.metadata'),      icon: 'tune',          component: 'pg-skill-metadata' },
  'peer-review':  { title: tPortal('text.peerReview'),    icon: 'forum',         component: 'pg-peer-review' },
  'workflow-exp': { title: tPortal('text.workflows'),     icon: 'account_tree',  component: 'pg-workflow-explorer' },
};

/**
 * Register a new panel type at runtime.
 * Used by MCP server plugins to inject their UI panels.
 */
export function registerPanelType(id, definition) {
  panelTypes[id] = definition;
}

/**
 * Helper to wrap layout with a global right-sidebar chat.
 * @param {Function} layoutFn
 * @param {boolean} [isExpanded=false]
 * @returns {Function}
 */
function withChat(layoutFn, isExpanded = false, options = {}) {
  return withGlobalPanel(layoutFn, 'agent-chat', {
    collapsed: !isExpanded,
    ratio: options.ratio ?? 0.65,
  });
}

// ── Core Sections ───────────────────────────────────────────────

registerSection('dashboard', {
  icon: 'forum', label: tPortal('text.chats'), order: 10, scope: 'home',
  layout: () => LayoutTree.createPanel('agent-chat')
});

registerSection('action-board', {
  icon: 'monitor_heart', label: tPortal('text.actionBoard'), order: 20, scope: 'home',
  layout: withChat(() => LayoutTree.createPanel('action-board'), false, { ratio: 0.78 })
});

registerSection('marketplace', {
  icon: 'storefront', label: tPortal('text.marketplace'), order: 25, scope: 'home',
  layout: withChat(() => LayoutTree.createPanel('marketplace'), false)
});

registerSection('topology', {
  icon: 'hub', label: tPortal('text.topology'), order: 27, scope: 'home',
  layout: withChat(() => LayoutTree.createPanel('topology-panel'), false)
});

registerSection('tool-explorer', {
  icon: 'build', label: tPortal('text.toolExplorer'), order: 28, scope: 'home',
  layout: withChat(() => LayoutTree.createPanel('tool-explorer'), false)
});

registerSection('orchestration', {
  icon: 'memory', label: tPortal('text.activeTasks'), order: 29, scope: 'home',
  layout: withChat(() => LayoutTree.createPanel('active-tasks'), false)
});

registerSection('workflows', {
  icon: 'account_tree', label: tPortal('text.workflows'), order: 29.1, scope: 'home',
  layout: withChat(() => LayoutTree.createPanel('workflow-exp'), false)
});

registerSection('pipelines', {
  icon: 'schema', label: tPortal('text.pipelines'), order: 29.2, scope: 'home',
  layout: withChat(() => LayoutTree.createPanel('pipeline-mgr'), false)
});

registerSection('resource-groups', {
  icon: 'view_kanban', label: tPortal('text.resourceGroups'), order: 29.5, scope: 'home',
  layout: withChat(() => LayoutTree.createPanel('group-mgr'), false)
});

registerSection('skills', {
  icon: 'school', label: tPortal('text.skills'), order: 30, scope: 'both',
  layout: withChat(() => LayoutTree.createSplit('horizontal',
    LayoutTree.createSplit('vertical',
      LayoutTree.createPanel('agent-portal-tree'),
      LayoutTree.createPanel('agent-portal-library'), 0.62
    ),
    LayoutTree.createSplit('horizontal',
      LayoutTree.createPanel('skill-mgr'),
      LayoutTree.createPanel('skill-meta'), 0.68
    ), 0.24
  ), false)
});

registerSection('peer-review', {
  icon: 'forum', label: tPortal('text.peerReview'), order: 31, scope: 'home',
  layout: withChat(() => LayoutTree.createPanel('peer-review'), false)
});

registerSection('explorer', {
  icon: 'folder_open', label: tPortal('text.explorer'), order: 30, scope: 'project',
  layout: withChat(() => LayoutTree.createSplit('horizontal',
    LayoutTree.createSplit('vertical',
      LayoutTree.createPanel('file-tree'),
      LayoutTree.createPanel('active-context'), 0.7
    ),
    LayoutTree.createSplit('horizontal',
      LayoutTree.createPanel('code-viewer'),
      LayoutTree.createPanel('ctx-panel'), 0.65
    ), 0.2), false)
});

registerSection('graph', {
  icon: 'developer_board', label: tPortal('text.graph'), order: 40, scope: 'project',
  layout: withChat(() => LayoutTree.createSplit('horizontal',
    LayoutTree.createPanel('file-tree'),
    LayoutTree.createSplit('horizontal',
      LayoutTree.createPanel('dep-graph'),
      LayoutTree.createPanel('graph-flows'), 0.78
    ), 0.18), false)
});

registerSection('follow', {
  icon: 'smart_toy', label: tPortal('text.follow'), order: 50, scope: 'project',
  layout: withChat(() => LayoutTree.createSplit('horizontal',
    LayoutTree.createPanel('file-tree'),
    LayoutTree.createSplit('vertical',
      LayoutTree.createSplit('horizontal',
        LayoutTree.createPanel('dep-graph'),
        LayoutTree.createPanel('code-viewer'), 0.65
      ),
      LayoutTree.createPanel('monitor'), 0.72
    ), 0.12), false)
});

registerSection('analysis', {
  icon: 'analytics', label: tPortal('text.analysis'), order: 60, scope: 'project',
  layout: withChat(() => LayoutTree.createPanel('health'), false)
});

registerSection('monitor', {
  icon: 'monitor_heart', label: tPortal('text.liveMonitor'), order: 70, scope: 'both',
  layout: withChat(() => LayoutTree.createPanel('monitor'), false)
});

registerSection('runtime', {
  icon: 'memory', label: tPortal('text.runtime'), order: 75, scope: 'both',
  layout: withChat(() => LayoutTree.createPanel('runtime-control'), false)
});

registerSection('spatial', {
  icon: 'view_in_ar', label: tPortal('text.spatial'), order: 77, scope: 'both',
  layout: withChat(() => LayoutTree.createPanel('spatial-layout'), false)
});

registerSection('settings', {
  icon: 'settings', label: tPortal('text.settings'), order: 100, scope: 'both',
  layout: withChat(() => LayoutTree.createPanel('settings'), false)
});

registerSection('agent-chat', {
  icon: 'smart_toy', label: tPortal('text.agentChat'), order: 20, scope: 'project',
  // Do not wrap the standalone chat in withChat, as it IS the chat.
  layout: () => LayoutTree.createPanel('agent-chat')
});
