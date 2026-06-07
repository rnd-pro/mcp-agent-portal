import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const symbioteUiGraphUrl = pathToFileURL(resolve(repoRoot, 'node_modules', 'symbiote-ui', 'graph', 'index.js')).href;
const loaderSource = `
export async function resolve(specifier, context, nextResolve) {
  if (specifier === 'symbiote-ui/graph') {
    return { url: ${JSON.stringify(symbioteUiGraphUrl)}, shortCircuit: true };
  }
  return nextResolve(specifier, context);
}
`;

register(`data:text/javascript,${encodeURIComponent(loaderSource)}`, import.meta.url);

const {
  buildPortalProjectPackage,
  createPortalProjectRuntime,
  getTransactionLayoutRoots,
} = await import('../../web/services/project-runtime-package.js?unit-test');

const sections = [
  { id: 'dashboard', label: 'Dashboard', scope: 'home' },
  { id: 'graph', label: 'Graph', scope: 'project' },
];

const layouts = {
  dashboard: { component: 'panel-layout', children: [{ component: 'pg-project-list' }] },
  graph: { component: 'panel-layout', children: [{ component: 'pg-dep-graph' }] },
};

describe('portal project runtime package adapter', () => {
  it('builds a project-package-v1 from router sections and layout roots', () => {
    const project = buildPortalProjectPackage({
      id: 'agent-portal:test',
      sections,
      layouts,
      entryLayout: 'graph',
    });

    assert.equal(project.version, 'project-package-v1');
    assert.equal(project.entry.graph, 'sections');
    assert.equal(project.entry.layout, 'graph');
    assert.equal(project.graphs.sections.nodes[0].kind, 'ui.section');
    assert.equal(project.layouts.graph.componentRegistries[0].id, 'symbiote-ui/ui');
    assert.equal(project.layouts.graph.componentRegistries[1].id, 'agent-portal/runtime-layouts');
    assert.equal(project.layouts.graph.root.children[0].component, 'pg-dep-graph');
    assert.deepEqual(project.agents.allowedTransactions, [
      'graph.addNode',
      'graph.addEdge',
      'layout.addPanel',
      'layout.setRoot',
      'layout.updateNode',
      'theme.setModifier',
    ]);
  });

  it('creates a runtime that applies layout and theme transactions', () => {
    const runtime = createPortalProjectRuntime({
      id: 'agent-portal:test',
      sections,
      layouts,
      entryLayout: 'dashboard',
    });

    runtime.addLayoutPanel('dashboard', { id: 'chat', component: 'pg-agent-chat' });
    runtime.setThemeModifier('default', 'density', 0.9);

    assert.equal(runtime.getLayout('dashboard').root.children[1].component, 'pg-agent-chat');
    assert.equal(runtime.getTheme('default').modifiers.density, 0.9);
  });

  it('applies layout.updateNode transactions through the runtime package', () => {
    const runtime = createPortalProjectRuntime({
      id: 'agent-portal:test',
      sections,
      layouts: {
        dashboard: {
          id: 'root',
          component: 'panel-layout',
          children: [{ id: 'main', component: 'pg-project-list', layout: { rect: { x: 0, y: 0, width: 1, height: 1 } } }],
        },
      },
      entryLayout: 'dashboard',
    });

    runtime.updateLayoutNode('dashboard', 'main', {
      layout: { rect: { x: 0.1, y: 0, width: 0.9, height: 1 } },
    }, { id: 'tx:update-main' });

    assert.deepEqual(runtime.getLayout('dashboard').root.children[0].layout.rect, { x: 0.1, y: 0, width: 0.9, height: 1 });
  });

  it('selects updated layout roots for product persistence after transactions', () => {
    const runtime = createPortalProjectRuntime({
      id: 'agent-portal:test',
      sections,
      layouts,
      entryLayout: 'dashboard',
    });
    const transaction = {
      version: 'project-transaction-v1',
      id: 'tx:add-panel',
      operations: [
        {
          type: 'layout.addPanel',
          layout: 'dashboard',
          panel: { id: 'events', component: 'sn-list-item' },
        },
        {
          type: 'theme.setModifier',
          theme: 'default',
          name: 'density',
          value: 0.95,
        },
      ],
    };

    const project = runtime.applyTransaction(transaction);

    assert.deepEqual(
      getTransactionLayoutRoots(project, transaction),
      [['dashboard', project.layouts.dashboard.root]]
    );
  });
});
