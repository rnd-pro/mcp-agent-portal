import { createProjectRuntime } from 'symbiote-node/graph';

function sectionNode(section) {
  return {
    id: `section:${section.id}`,
    kind: 'ui.section',
    label: section.label || section.id,
    params: { section: section.id, scope: section.scope || 'both' },
    design: { component: 'panel-layout', themeScope: `section.${section.id}` },
  };
}

function normalizeLayoutRecord(layouts) {
  return Object.fromEntries(
    Object.entries(layouts || {}).map(([id, root]) => [
      id,
      {
        version: 'runtime-ui-v1',
        componentRegistries: [
          { id: 'symbiote-node/ui', provider: 'symbiote-node' },
          { id: 'agent-portal/runtime-layouts', provider: 'agent-portal' },
        ],
        root,
      },
    ])
  );
}

export function buildPortalProjectPackage({
  id,
  sections,
  layouts,
  entryLayout,
  theme = 'default',
}) {
  let sectionList = Array.isArray(sections) ? sections : [];
  let layoutRecords = normalizeLayoutRecord(layouts);
  let firstLayout = entryLayout || sectionList[0]?.id || Object.keys(layoutRecords)[0] || 'main';

  return {
    version: 'project-package-v1',
    id,
    name: id,
    entry: { graph: 'sections', layout: firstLayout, theme },
    packs: [
      { id: 'symbiote-node/ui', kind: 'provider' },
      { id: 'agent-portal/runtime-layouts', kind: 'domain-pack' },
    ],
    graphs: {
      sections: {
        version: 'graph-model-v1',
        nodes: sectionList.map(sectionNode),
      },
    },
    layouts: layoutRecords,
    themes: {
      [theme]: {
        extends: 'symbiote-default',
        modifiers: { density: 1 },
      },
    },
    agents: {
      allowedTransactions: ['graph.addNode', 'graph.addEdge', 'layout.addPanel', 'layout.setRoot', 'layout.updateNode', 'theme.setModifier'],
    },
  };
}

export function createPortalProjectRuntime(config) {
  return createProjectRuntime(buildPortalProjectPackage(config));
}

export function getTransactionLayoutRoots(project, transaction) {
  return (transaction.operations || [])
    .filter((operation) => operation.type?.startsWith('layout.'))
    .map((operation) => [operation.layout, project.layouts?.[operation.layout]?.root])
    .filter(([, root]) => Boolean(root));
}
