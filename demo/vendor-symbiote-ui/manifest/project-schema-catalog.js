export let PROJECT_SCHEMA_VERSIONS = [
  {
    version: 'project-package-v1',
    path: 'schemas/project-package-v1.json',
    description: 'JSON Schema for portable Symbiote project packages that assemble graphs, layouts, themes, packs, and agent rules.',
  },
  {
    version: 'project-transaction-v1',
    path: 'schemas/project-transaction-v1.json',
    description: 'JSON Schema for safe agent-authored project graph, layout, and theme mutations.',
  },
];

export let PROJECT_SCHEMAS = {
  'project-package-v1': {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $id: 'https://rnd-pro.github.io/symbiote-ui/schemas/project-package-v1.json',
    title: 'Symbiote Project Package',
    type: 'object',
    additionalProperties: false,
    required: ['version', 'id', 'entry', 'graphs', 'layouts', 'themes'],
    properties: {
      version: { const: 'project-package-v1' },
      id: { type: 'string', minLength: 1 },
      name: { type: 'string' },
      entry: { $ref: '#/$defs/entry' },
      packs: {
        type: 'array',
        items: { $ref: '#/$defs/pack' },
        uniqueItems: true,
      },
      graphs: {
        type: 'object',
        minProperties: 1,
        additionalProperties: { $ref: 'graph-model-v1.json' },
      },
      layouts: {
        type: 'object',
        minProperties: 1,
        additionalProperties: { $ref: 'runtime-ui-v1.json' },
      },
      themes: {
        type: 'object',
        minProperties: 1,
        additionalProperties: { $ref: '#/$defs/themeRef' },
      },
      dataSources: {
        type: 'object',
        additionalProperties: { $ref: '#/$defs/dataSource' },
      },
      agents: { $ref: '#/$defs/agents' },
    },
    $defs: {
      entry: {
        type: 'object',
        additionalProperties: false,
        required: ['graph', 'layout', 'theme'],
        properties: {
          graph: { type: 'string', minLength: 1 },
          layout: { type: 'string', minLength: 1 },
          theme: { type: 'string', minLength: 1 },
        },
      },
      pack: {
        type: 'object',
        additionalProperties: true,
        required: ['id'],
        properties: {
          id: { type: 'string', minLength: 1 },
          kind: {
            enum: ['provider', 'domain-pack', 'data-provider', 'automation-pack', 'theme-pack'],
          },
          version: { type: 'string' },
        },
      },
      themeRef: {
        type: 'object',
        additionalProperties: true,
        properties: {
          extends: { type: 'string', minLength: 1 },
          modifiers: {
            type: 'object',
            additionalProperties: {
              type: ['number', 'string', 'boolean'],
            },
          },
        },
      },
      dataSource: {
        type: 'object',
        additionalProperties: true,
        required: ['kind'],
        properties: {
          kind: { type: 'string', minLength: 1 },
          graph: { type: 'string', minLength: 1 },
          schema: { type: 'string', minLength: 1 },
        },
      },
      agents: {
        type: 'object',
        additionalProperties: false,
        properties: {
          rules: {
            type: 'array',
            items: { type: 'string', minLength: 1 },
            uniqueItems: true,
          },
          allowedTransactions: {
            type: 'array',
            items: { type: 'string', minLength: 1 },
            uniqueItems: true,
          },
        },
      },
    },
  },
  'project-transaction-v1': {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $id: 'https://rnd-pro.github.io/symbiote-ui/schemas/project-transaction-v1.json',
    title: 'Symbiote Project Transaction',
    type: 'object',
    additionalProperties: false,
    required: ['version', 'id', 'operations'],
    properties: {
      version: { const: 'project-transaction-v1' },
      id: { type: 'string', minLength: 1 },
      targetProject: { type: 'string' },
      operations: {
        type: 'array',
        items: { $ref: '#/$defs/operation' },
        minItems: 1,
      },
      metadata: {
        type: 'object',
        additionalProperties: true,
      },
    },
    $defs: {
      operation: {
        oneOf: [
          { $ref: '#/$defs/graphAddNodeOperation' },
          { $ref: '#/$defs/graphAddEdgeOperation' },
          { $ref: '#/$defs/layoutAddPanelOperation' },
          { $ref: '#/$defs/layoutSetRootOperation' },
          { $ref: '#/$defs/layoutUpdateNodeOperation' },
          { $ref: '#/$defs/themeSetModifierOperation' },
        ],
      },
      graphAddNodeOperation: {
        type: 'object',
        additionalProperties: true,
        required: ['type', 'graph', 'node'],
        properties: {
          type: { const: 'graph.addNode' },
          graph: { type: 'string', minLength: 1 },
          node: { $ref: 'graph-model-v1.json#/$defs/node' },
        },
      },
      graphAddEdgeOperation: {
        type: 'object',
        additionalProperties: true,
        required: ['type', 'graph', 'edge'],
        properties: {
          type: { const: 'graph.addEdge' },
          graph: { type: 'string', minLength: 1 },
          edge: { $ref: 'graph-model-v1.json#/$defs/edge' },
        },
      },
      layoutAddPanelOperation: {
        type: 'object',
        additionalProperties: true,
        required: ['type', 'layout', 'panel'],
        properties: {
          type: { const: 'layout.addPanel' },
          layout: { type: 'string', minLength: 1 },
          parentId: { type: 'string', minLength: 1 },
          panel: { $ref: 'runtime-ui-v1.json#/$defs/node' },
        },
      },
      layoutSetRootOperation: {
        type: 'object',
        additionalProperties: true,
        required: ['type', 'layout', 'root'],
        properties: {
          type: { const: 'layout.setRoot' },
          layout: { type: 'string', minLength: 1 },
          root: { $ref: 'runtime-ui-v1.json#/$defs/node' },
        },
      },
      layoutUpdateNodeOperation: {
        type: 'object',
        additionalProperties: true,
        required: ['type', 'layout', 'nodeId', 'patch'],
        properties: {
          type: { const: 'layout.updateNode' },
          layout: { type: 'string', minLength: 1 },
          nodeId: { type: 'string', minLength: 1 },
          patch: {
            type: 'object',
            additionalProperties: false,
            minProperties: 1,
            properties: {
              layout: {
                type: 'object',
                additionalProperties: false,
                minProperties: 1,
                properties: {
                  rect: { type: 'object', additionalProperties: true },
                  weight: { type: 'number' },
                },
              },
              props: { type: 'object', additionalProperties: true },
              attrs: { type: 'object', additionalProperties: true },
            },
          },
        },
      },
      themeSetModifierOperation: {
        type: 'object',
        additionalProperties: true,
        required: ['type', 'theme', 'name', 'value'],
        properties: {
          type: { const: 'theme.setModifier' },
          theme: { type: 'string', minLength: 1 },
          name: { type: 'string', minLength: 1 },
          value: { type: ['number', 'string', 'boolean'] },
        },
      },
    },
  },
};

export function listProjectSchemaVersions() {
  return PROJECT_SCHEMA_VERSIONS.map((schema) => schema.version);
}

export function getProjectSchema(version = 'project-package-v1') {
  return PROJECT_SCHEMAS[version];
}

export function listProjectSchemas() {
  return PROJECT_SCHEMA_VERSIONS.map((schema) => ({
    ...schema,
    ...getProjectSchema(schema.version),
  }));
}
