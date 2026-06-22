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
  'dep-graph': {
    title: tPortal('text.dependencies'),
    icon: 'account_tree',
    component: 'pg-dep-graph',
    attributes: { mode: false, embedded: false, 'locked-mode': false },
  },
  'agent-process-graph': {
    title: tPortal('text.agentProcessGraph'),
    icon: 'account_tree',
    component: 'pg-agent-process-graph',
  },
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
  'workflow-board': { title: tPortal('text.workflowBoard'), icon: 'view_kanban', component: 'pg-workflow-board' },
  'workflow-card-inspector': { title: tPortal('text.cardInspector'), icon: 'manage_search', component: 'pg-workflow-card-inspector' },
  'pipeline-mgr': { title: tPortal('text.pipelines'),     icon: 'schema',        component: 'pg-pipeline-mgr' },
  'group-mgr':    { title: tPortal('text.resourceGroups'),icon: 'groups',        component: 'pg-group-manager' },
  'theme-editor': { title: tPortal('text.theme'),         icon: 'palette',       component: 'pg-theme-editor-panel' },
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

const panelBehavior = {
  navigation: {
    importance: 78,
    minInlineSize: 220,
    minBlockSize: 220,
    collapse: 'manual',
    overflow: 'scroll-block',
    responsiveMode: 'stack',
    responsiveBreakpoint: 760,
  },
  primary: {
    importance: 95,
    minInlineSize: 520,
    minBlockSize: 320,
    collapse: 'never',
    overflow: 'scroll-inline',
    responsiveMode: 'scroll-inline',
    responsiveBreakpoint: 860,
  },
  secondary: {
    importance: 68,
    minInlineSize: 320,
    minBlockSize: 260,
    collapse: 'auto',
    overflow: 'scroll-block',
    responsiveMode: 'stack',
    responsiveBreakpoint: 760,
  },
  board: {
    importance: 88,
    minInlineSize: 480,
    minBlockSize: 320,
    collapse: 'never',
    overflow: 'scroll-inline',
    responsiveMode: 'scroll-inline',
    responsiveBreakpoint: 860,
  },
  chat: {
    importance: 42,
    minInlineSize: 360,
    minBlockSize: 320,
    collapse: 'manual',
    overflow: 'scroll-block',
    responsiveMode: 'stack',
    responsiveBreakpoint: 760,
  },
  agentProcessGraph: {
    importance: 38,
    minInlineSize: 320,
    minBlockSize: 320,
    collapse: 'manual',
    overflow: 'scroll-block',
    responsiveMode: 'stack',
    responsiveBreakpoint: 760,
  },
};

const splitBehavior = {
  workspace: {
    importance: 100,
    minInlineSize: 760,
    minBlockSize: 460,
    collapse: 'never',
    overflow: 'scroll-inline',
    responsiveMode: 'scroll-inline',
    responsiveBreakpoint: 900,
  },
  stack: {
    importance: 85,
    minInlineSize: 620,
    minBlockSize: 520,
    collapse: 'never',
    overflow: 'scroll-block',
    responsiveMode: 'stack',
    responsiveBreakpoint: 760,
  },
  chatDock: {
    importance: 90,
    minInlineSize: 820,
    minBlockSize: 460,
    collapse: 'never',
    overflow: 'scroll-inline',
    responsiveMode: 'scroll-inline',
    responsiveBreakpoint: 900,
  },
};

function panel(panelType, behavior = 'primary', options = {}) {
  let node = LayoutTree.createPanel(panelType, {}, panelBehavior[behavior] || behavior);
  if (Object.prototype.hasOwnProperty.call(options, 'collapsed')) {
    node.collapsed = Boolean(options.collapsed);
  }
  return node;
}

function split(direction, first, second, ratio, behavior = 'workspace') {
  return LayoutTree.createSplit(direction, first, second, ratio, splitBehavior[behavior] || behavior);
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
    behavior: panelBehavior.chat,
    splitBehavior: options.splitBehavior || splitBehavior.chatDock,
  });
}

// ── Core Sections ───────────────────────────────────────────────

registerSection('dashboard', {
  icon: 'forum', label: tPortal('text.chats'), order: 10, scope: 'home',
  layout: () => panel('agent-chat', 'chat')
});

registerSection('action-board', {
  icon: 'monitor_heart', label: tPortal('text.actionBoard'), order: 20, scope: 'home',
  layout: withChat(() => panel('action-board', 'board'), false, { ratio: 0.78 })
});

registerSection('marketplace', {
  icon: 'storefront', label: tPortal('text.marketplace'), order: 25, scope: 'home',
  layout: withChat(() => panel('marketplace', 'board'), false)
});

registerSection('topology', {
  icon: 'hub', label: tPortal('text.topology'), order: 27, scope: 'home',
  layout: withChat(() => panel('topology-panel', 'primary'), false)
});

registerSection('tool-explorer', {
  icon: 'build', label: tPortal('text.toolExplorer'), order: 28, scope: 'home',
  layout: withChat(() => panel('tool-explorer', 'primary'), false)
});

registerSection('orchestration', {
  icon: 'memory', label: tPortal('text.activeTasks'), order: 29, scope: 'home',
  layout: withChat(() => panel('active-tasks', 'board'), false)
});

registerSection('workflow-board', {
  icon: 'view_kanban', label: tPortal('text.workflowBoard'), order: 29.05, scope: 'both',
  layout: withChat(
    () => split('horizontal',
      panel('workflow-board', 'board'),
      panel('workflow-card-inspector', 'secondary'),
      0.7,
      'workspace',
    ),
    false,
    { ratio: 0.82 },
  )
});

registerSection('workflows', {
  icon: 'account_tree', label: tPortal('text.workflows'), order: 29.1, scope: 'home',
  layout: withChat(() => panel('workflow-exp', 'primary'), false)
});

registerSection('pipelines', {
  icon: 'schema', label: tPortal('text.pipelines'), order: 29.2, scope: 'home',
  layout: withChat(() => panel('pipeline-mgr', 'primary'), false)
});

registerSection('resource-groups', {
  icon: 'view_kanban', label: tPortal('text.resourceGroups'), order: 29.5, scope: 'home',
  layout: withChat(() => panel('group-mgr', 'board'), false)
});

registerSection('skills', {
  icon: 'school', label: tPortal('text.skills'), order: 30, scope: 'both',
  layout: withChat(() => split('horizontal',
    split('vertical',
      panel('agent-portal-tree', 'navigation'),
      panel('agent-portal-library', 'navigation'), 0.62, 'stack'
    ),
    split('horizontal',
      panel('skill-mgr', 'primary'),
      panel('skill-meta', 'secondary'), 0.68
    ), 0.24
  ), false)
});

registerSection('peer-review', {
  icon: 'forum', label: tPortal('text.peerReview'), order: 31, scope: 'home',
  layout: withChat(() => panel('peer-review', 'primary'), false)
});

registerSection('explorer', {
  icon: 'folder_open', label: tPortal('text.explorer'), order: 30, scope: 'project',
  layout: withChat(() => split('horizontal',
    split('vertical',
      panel('file-tree', 'navigation'),
      panel('active-context', 'secondary'), 0.7, 'stack'
    ),
    split('horizontal',
      panel('code-viewer', 'primary'),
      panel('ctx-panel', 'secondary'), 0.65
    ), 0.2), false)
});

registerSection('graph', {
  icon: 'developer_board', label: tPortal('text.graph'), order: 40, scope: 'project',
  layout: withChat(() => split('horizontal',
    panel('file-tree', 'navigation'),
    split('horizontal',
      panel('dep-graph', 'primary'),
      panel('graph-flows', 'secondary'), 0.78
    ), 0.18), false)
});

registerSection('follow', {
  icon: 'smart_toy', label: tPortal('text.follow'), order: 50, scope: 'project',
  layout: withChat(() => split('horizontal',
    panel('file-tree', 'navigation'),
    split('vertical',
      split('horizontal',
        panel('dep-graph', 'primary'),
        panel('code-viewer', 'primary'), 0.65
      ),
      panel('monitor', 'secondary'), 0.72, 'stack'
    ), 0.12), false)
});

registerSection('analysis', {
  icon: 'analytics', label: tPortal('text.analysis'), order: 60, scope: 'project',
  layout: withChat(() => panel('health', 'primary'), false)
});

registerSection('monitor', {
  icon: 'monitor_heart', label: tPortal('text.liveMonitor'), order: 70, scope: 'both',
  layout: withChat(() => panel('monitor', 'primary'), false)
});

registerSection('runtime', {
  icon: 'memory', label: tPortal('text.runtime'), order: 75, scope: 'both',
  layout: withChat(() => panel('runtime-control', 'primary'), false)
});

registerSection('spatial', {
  icon: 'view_in_ar', label: tPortal('text.spatial'), order: 77, scope: 'both',
  layout: withChat(() => panel('spatial-layout', 'primary'), false)
});

registerSection('settings', {
  icon: 'settings', label: tPortal('text.settings'), order: 100, scope: 'both',
  layout: withChat(() => panel('settings', 'secondary'), false)
});

registerSection('agent-chat', {
  icon: 'smart_toy', label: tPortal('text.agentChat'), order: 20, scope: 'project',
  layout: () => split('horizontal',
    panel('agent-chat', 'chat'),
    panel('agent-process-graph', 'agentProcessGraph', { collapsed: true }),
    0.72,
    'chatDock'
  )
});
