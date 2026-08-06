import { normalizeProjectPackage } from './project-package.js';
import { applyProjectTransaction, normalizeProjectTransaction } from './project-transaction.js';

let runtimeIdCounter = 0;

function nextTransactionId(prefix) {
  runtimeIdCounter += 1;
  return `${prefix}:${runtimeIdCounter}`;
}

function assertTargetProject(project, transaction) {
  if (transaction.targetProject && transaction.targetProject !== project.id) {
    throw new Error(`transaction target "${transaction.targetProject}" does not match project "${project.id}"`);
  }
}

export function createProjectRuntime(rawProject, options = {}) {
  let project = normalizeProjectPackage(rawProject);
  const listeners = new Set();

  function notify(transaction) {
    const event = { project, transaction };
    for (const listener of listeners) listener(event);
    options.onChange?.(event);
  }

  return {
    getProject() {
      return project;
    },

    getGraph(id = project.entry.graph) {
      return project.graphs[id];
    },

    getLayout(id = project.entry.layout) {
      return project.layouts[id];
    },

    getTheme(id = project.entry.theme) {
      return project.themes[id];
    },

    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    applyTransaction(rawTransaction) {
      const transaction = normalizeProjectTransaction(rawTransaction);
      assertTargetProject(project, transaction);
      project = applyProjectTransaction(project, transaction);
      notify(transaction);
      return project;
    },

    addGraphNode(graph, node, id = nextTransactionId('tx:add-node')) {
      return this.applyTransaction({
        version: 'project-transaction-v1',
        id,
        targetProject: project.id,
        operations: [{ type: 'graph.addNode', graph, node }],
      });
    },

    addGraphEdge(graph, edge, id = nextTransactionId('tx:add-edge')) {
      return this.applyTransaction({
        version: 'project-transaction-v1',
        id,
        targetProject: project.id,
        operations: [{ type: 'graph.addEdge', graph, edge }],
      });
    },

    addLayoutPanel(layout, panel, options = {}) {
      return this.applyTransaction({
        version: 'project-transaction-v1',
        id: options.id || nextTransactionId('tx:add-panel'),
        targetProject: project.id,
        operations: [{
          type: 'layout.addPanel',
          layout,
          parentId: options.parentId,
          panel,
        }],
      });
    },

    setLayoutRoot(layout, root, id = nextTransactionId('tx:set-root')) {
      return this.applyTransaction({
        version: 'project-transaction-v1',
        id,
        targetProject: project.id,
        operations: [{ type: 'layout.setRoot', layout, root }],
      });
    },

    updateLayoutNode(layout, nodeId, patch, options = {}) {
      return this.applyTransaction({
        version: 'project-transaction-v1',
        id: options.id || nextTransactionId('tx:update-node'),
        targetProject: project.id,
        operations: [{ type: 'layout.updateNode', layout, nodeId, patch }],
      });
    },

    setThemeModifier(theme, name, value, id = nextTransactionId('tx:set-theme')) {
      return this.applyTransaction({
        version: 'project-transaction-v1',
        id,
        targetProject: project.id,
        operations: [{ type: 'theme.setModifier', theme, name, value }],
      });
    },
  };
}
