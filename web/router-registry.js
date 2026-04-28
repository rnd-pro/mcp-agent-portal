/**
 * RouterRegistry — extensible section & panel registry for Agent Portal.
 * Sections are registered declaratively and can be added at runtime
 * (e.g. from marketplace plugins or dynamically discovered MCP servers).
 */
import { LayoutTree } from 'symbiote-node';

// ── Panel Type Definitions ──────────────────────────────────────
// Each panel type maps an ID to a web component tag.
// New MCP servers can register their own panel types via registerPanelType().
export const panelTypes = {
  'file-tree':    { title: 'Files',         icon: 'folder',        component: 'pg-file-tree' },
  'code-viewer':  { title: 'Code',          icon: 'code',          component: 'pg-code-viewer' },
  'ctx-panel':    { title: 'Documentation', icon: 'description',   component: 'pg-ctx-panel' },
  'dep-graph':    { title: 'Dependencies',  icon: 'account_tree',  component: 'pg-dep-graph' },
  'health':       { title: 'Health',        icon: 'analytics',     component: 'pg-health-panel' },
  'monitor':      { title: 'Live Monitor',  icon: 'monitor_heart', component: 'pg-live-monitor' },
  'settings':     { title: 'Settings',      icon: 'settings',      component: 'pg-settings-panel' },
  'project-list': { title: 'Servers',       icon: 'dashboard',     component: 'pg-project-list' },
  'action-board': { title: 'Action Board',  icon: 'monitor_heart', component: 'pg-action-board' },
  'agent-chat':   { title: 'Agent Chat',    icon: 'smart_toy',     component: 'pg-agent-chat' },
  'marketplace':  { title: 'Marketplace',   icon: 'storefront',    component: 'pg-marketplace' },
  'topology-panel':{ title: 'Topology',     icon: 'hub',           component: 'topology-panel' },
  'tool-explorer':{ title: 'Tool Explorer', icon: 'build',         component: 'pg-tool-explorer' },
  'chat-list':    { title: 'Chats',         icon: 'forum',         component: 'pg-chat-list' },
};

/**
 * Register a new panel type at runtime.
 * Used by MCP server plugins to inject their UI panels.
 */
export function registerPanelType(id, definition) {
  panelTypes[id] = definition;
}

// ── Section Registry ────────────────────────────────────────────
const _sections = new Map();
const _layouts = new Map();

/**
 * Register a navigation section.
 * @param {string} id — URL hash fragment (e.g. 'dashboard', 'chat')
 * @param {Object} opts
 * @param {string} opts.icon — Material Symbols icon name
 * @param {string} opts.label — Sidebar label
 * @param {number} [opts.order=100] — Sort order in sidebar
 * @param {Function} opts.layout — Factory returning LayoutTree node
 */
export function registerSection(id, { icon, label, order = 100, layout }) {
  _sections.set(id, { id, icon, label, order });
  if (layout) _layouts.set(id, layout);
}

/** Get sorted sections array for sidebar */
export function getSections() {
  return [..._sections.values()].sort((a, b) => a.order - b.order);
}

/** Get layout tree for a section */
export function getLayout(id) {
  const fn = _layouts.get(id);
  return fn ? fn() : null;
}

/** Check if section exists */
export function hasSection(id) {
  return _sections.has(id);
}

// ── Core Sections ───────────────────────────────────────────────

registerSection('dashboard', {
  icon: 'dashboard', label: 'Dashboard', order: 10,
  layout: () => {
    let workspace = LayoutTree.createSplit('horizontal',
      LayoutTree.createPanel('project-list'),
      LayoutTree.createPanel('action-board'), 0.35
    );
    let chat = LayoutTree.createSplit('vertical',
      LayoutTree.createPanel('chat-list'),
      LayoutTree.createPanel('agent-chat'), 0.35
    );
    chat.global = true;
    return LayoutTree.createSplit('horizontal', workspace, chat, 0.65);
  }
});

registerSection('marketplace', {
  icon: 'storefront', label: 'Marketplace', order: 25,
  layout: () => LayoutTree.createPanel('marketplace')
});

registerSection('topology', {
  icon: 'hub', label: 'Topology', order: 27,
  layout: () => LayoutTree.createPanel('topology-panel')
});

registerSection('tool-explorer', {
  icon: 'build', label: 'Tool Explorer', order: 28,
  layout: () => LayoutTree.createPanel('tool-explorer')
});

registerSection('explorer', {
  icon: 'folder_open', label: 'Explorer', order: 30,
  layout: () => LayoutTree.createSplit('horizontal',
    LayoutTree.createPanel('file-tree'),
    LayoutTree.createSplit('horizontal',
      LayoutTree.createPanel('code-viewer'),
      LayoutTree.createPanel('ctx-panel'), 0.65
    ), 0.2)
});

registerSection('graph', {
  icon: 'developer_board', label: 'Graph', order: 40,
  layout: () => LayoutTree.createSplit('horizontal',
    LayoutTree.createPanel('file-tree'),
    LayoutTree.createPanel('dep-graph'), 0.18)
});

registerSection('follow', {
  icon: 'smart_toy', label: 'Follow', order: 50,
  layout: () => LayoutTree.createSplit('horizontal',
    LayoutTree.createPanel('file-tree'),
    LayoutTree.createSplit('vertical',
      LayoutTree.createSplit('horizontal',
        LayoutTree.createPanel('dep-graph'),
        LayoutTree.createPanel('code-viewer'), 0.65
      ),
      LayoutTree.createPanel('monitor'), 0.72
    ), 0.12)
});

registerSection('analysis', {
  icon: 'analytics', label: 'Analysis', order: 60,
  layout: () => LayoutTree.createPanel('health')
});

registerSection('monitor', {
  icon: 'monitor_heart', label: 'Monitor', order: 70,
  layout: () => LayoutTree.createPanel('monitor')
});

registerSection('settings', {
  icon: 'settings', label: 'Settings', order: 100,
  layout: () => LayoutTree.createPanel('settings')
});
