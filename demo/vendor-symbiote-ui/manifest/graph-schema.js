import { GRAPH_LAYOUT_QUALITY_VERSION } from '../graph/layout-quality.js';
import { GRAPH_LAYOUT_QUALITY_SCHEMA } from './graph-analysis-catalog.js';

export let GRAPH_SCHEMA_VERSIONS = [
  {
    version: 'v1',
    path: 'schemas/graph-v1.json',
    description: 'JSON Schema for Symbiote Node graph/workflow documents.',
  },
  {
    version: 'graph-model-v1',
    path: 'schemas/graph-model-v1.json',
    description: 'JSON Schema for universal graph models shared by UI, workflow, automation, and media projects.',
  },
  {
    version: 'media-descriptor-v1',
    path: 'schemas/media-descriptor-v1.json',
    description: 'JSON Schema for the normalized graph media descriptor activated by the browser media host.',
  },
  {
    version: GRAPH_LAYOUT_QUALITY_VERSION,
    path: 'schemas/graph-layout-quality-v1.json',
    description: 'JSON Schema for deterministic, agent-readable graph layout quality reports and audit inputs.',
  },
];

export let GRAPH_SCHEMAS = {
  v1: {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $id: 'https://rnd-pro.github.io/symbiote-ui/schemas/graph-v1.json',
    title: 'Symbiote Node Graph',
    type: 'object',
    additionalProperties: false,
    required: ['version', 'nodes', 'connections'],
    properties: {
      version: { const: 'v1' },
      metadata: {
        type: 'object',
        additionalProperties: true,
        properties: {
          name: { type: 'string' },
          description: { type: 'string' },
          createdAt: { type: 'string' },
          updatedAt: { type: 'string' },
        },
      },
      nodes: {
        type: 'array',
        items: { $ref: '#/$defs/node' },
        uniqueItems: true,
      },
      connections: {
        type: 'array',
        items: { $ref: '#/$defs/connection' },
        uniqueItems: true,
      },
      frames: {
        type: 'array',
        items: { $ref: '#/$defs/frame' },
      },
    },
    $defs: {
      media: {
        type: 'object',
        additionalProperties: false,
        required: ['kind', 'activation'],
        properties: {
          kind: { type: 'string', minLength: 1 },
          poster: { type: 'string' },
          alt: { type: 'string' },
          fit: { enum: ['contain', 'cover'] },
          activation: {
            type: 'object',
            additionalProperties: true,
            required: ['provider'],
            properties: {
              provider: { type: 'string', minLength: 1 },
            },
          },
          targetIds: {
            type: 'array',
            items: { type: 'string', minLength: 1 },
            uniqueItems: true,
          },
        },
      },
      point: {
        type: 'object',
        required: ['x', 'y'],
        properties: {
          x: { type: 'number' },
          y: { type: 'number' },
        },
        additionalProperties: false,
      },
      node: {
        type: 'object',
        required: ['id', 'type'],
        additionalProperties: true,
        properties: {
          id: { type: 'string', minLength: 1 },
          type: { type: 'string', minLength: 1 },
          label: { type: 'string' },
          position: { $ref: '#/$defs/point' },
          size: { $ref: '#/$defs/point' },
          params: {
            type: 'object',
            additionalProperties: true,
            properties: {
              media: { $ref: '#/$defs/media' },
            },
          },
          inputs: { type: 'array', items: { type: 'string' } },
          outputs: { type: 'array', items: { type: 'string' } },
        },
      },
      connection: {
        type: 'object',
        required: ['id', 'source', 'target'],
        additionalProperties: false,
        properties: {
          id: { type: 'string', minLength: 1 },
          kind: { type: 'string', minLength: 1 },
          direction: { type: 'string', enum: ['none', 'forward', 'reverse', 'both'] },
          design: {
            type: 'object',
            additionalProperties: true,
            properties: {
              marker: {
                type: 'object',
                additionalProperties: true,
                properties: {
                  role: { type: 'string', enum: ['none', 'flow', 'gate'] },
                },
              },
            },
          },
          source: { $ref: '#/$defs/endpoint' },
          target: { $ref: '#/$defs/endpoint' },
          label: { type: 'string' },
          metadata: { type: 'object', additionalProperties: true },
        },
      },
      endpoint: {
        type: 'object',
        required: ['nodeId', 'socket'],
        additionalProperties: false,
        properties: {
          nodeId: { type: 'string', minLength: 1 },
          socket: { type: 'string', minLength: 1 },
        },
      },
      frame: {
        type: 'object',
        required: ['id'],
        additionalProperties: true,
        properties: {
          id: { type: 'string', minLength: 1 },
          label: { type: 'string' },
          nodeIds: { type: 'array', items: { type: 'string' } },
        },
      },
    },
  },
  'graph-model-v1': {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $id: 'https://rnd-pro.github.io/symbiote-ui/schemas/graph-model-v1.json',
    title: 'Symbiote Graph Model',
    type: 'object',
    additionalProperties: false,
    required: ['version', 'nodes'],
    properties: {
      version: { const: 'graph-model-v1' },
      metadata: {
        type: 'object',
        additionalProperties: true,
      },
      nodes: {
        type: 'array',
        items: { $ref: '#/$defs/node' },
        uniqueItems: true,
      },
      edges: {
        type: 'array',
        items: { $ref: '#/$defs/edge' },
        uniqueItems: true,
      },
      groups: {
        type: 'array',
        items: { $ref: '#/$defs/group' },
        uniqueItems: true,
      },
      views: {
        type: 'object',
        additionalProperties: { $ref: '#/$defs/view' },
      },
      theme: { $ref: '#/$defs/themeRef' },
    },
    $defs: {
      media: {
        type: 'object',
        additionalProperties: false,
        required: ['kind', 'activation'],
        properties: {
          kind: { type: 'string', minLength: 1 },
          poster: { type: 'string' },
          alt: { type: 'string' },
          fit: { enum: ['contain', 'cover'] },
          activation: {
            type: 'object',
            additionalProperties: true,
            required: ['provider'],
            properties: {
              provider: { type: 'string', minLength: 1 },
            },
          },
          targetIds: {
            type: 'array',
            items: { type: 'string', minLength: 1 },
            uniqueItems: true,
          },
        },
      },
      layout: {
        type: 'object',
        additionalProperties: true,
        properties: {
          x: { type: 'number' },
          y: { type: 'number' },
          w: { type: 'number' },
          h: { type: 'number' },
          basis: { type: 'string' },
        },
      },
      port: {
        type: 'object',
        required: ['name'],
        additionalProperties: true,
        properties: {
          name: { type: 'string', minLength: 1 },
          type: { type: 'string', minLength: 1 },
          required: { type: 'boolean' },
          label: { type: 'string' },
        },
      },
      flow: {
        type: 'object',
        additionalProperties: true,
        properties: {
          inputs: {
            type: 'array',
            items: { $ref: '#/$defs/port' },
          },
          outputs: {
            type: 'array',
            items: { $ref: '#/$defs/port' },
          },
        },
      },
      design: {
        type: 'object',
        additionalProperties: true,
        properties: {
          component: { type: 'string', minLength: 1 },
          variant: { type: 'string', minLength: 1 },
          themeScope: { type: 'string', minLength: 1 },
          layout: { $ref: '#/$defs/layout' },
        },
      },
      node: {
        type: 'object',
        additionalProperties: true,
        required: ['id', 'kind'],
        properties: {
          id: { type: 'string', minLength: 1 },
          kind: { type: 'string', minLength: 1 },
          label: { type: 'string' },
          parentId: { type: 'string', minLength: 1 },
          flow: { $ref: '#/$defs/flow' },
          params: {
            type: 'object',
            additionalProperties: true,
            properties: {
              media: { $ref: '#/$defs/media' },
            },
          },
          design: { $ref: '#/$defs/design' },
          children: {
            type: 'array',
            items: { type: 'string', minLength: 1 },
          },
          state: { type: 'object', additionalProperties: true },
          themeScope: { type: 'string', minLength: 1 },
          metadata: { type: 'object', additionalProperties: true },
        },
      },
      endpoint: {
        type: 'object',
        required: ['nodeId', 'port'],
        additionalProperties: true,
        properties: {
          nodeId: { type: 'string', minLength: 1 },
          port: { type: 'string', minLength: 1 },
        },
      },
      edge: {
        type: 'object',
        additionalProperties: true,
        required: ['source', 'target'],
        properties: {
          id: { type: 'string', minLength: 1 },
          kind: { type: 'string', minLength: 1 },
          direction: { type: 'string', enum: ['none', 'forward', 'reverse', 'both'] },
          design: {
            type: 'object',
            additionalProperties: true,
            properties: {
              marker: {
                type: 'object',
                additionalProperties: true,
                properties: {
                  role: { type: 'string', enum: ['none', 'flow', 'gate'] },
                },
              },
            },
          },
          label: { type: 'string' },
          source: { $ref: '#/$defs/endpoint' },
          target: { $ref: '#/$defs/endpoint' },
          params: { type: 'object', additionalProperties: true },
          metadata: { type: 'object', additionalProperties: true },
        },
      },
      group: {
        type: 'object',
        required: ['id'],
        additionalProperties: true,
        properties: {
          id: { type: 'string', minLength: 1 },
          label: { type: 'string' },
          nodeIds: {
            type: 'array',
            items: { type: 'string', minLength: 1 },
          },
          themeScope: { type: 'string', minLength: 1 },
        },
      },
      view: {
        type: 'object',
        additionalProperties: true,
        properties: {
          kind: { type: 'string', minLength: 1 },
          roots: {
            type: 'array',
            items: { type: 'string', minLength: 1 },
          },
          groups: {
            type: 'array',
            items: { $ref: '#/$defs/group' },
          },
        },
      },
      themeRef: {
        type: 'object',
        additionalProperties: true,
        properties: {
          scope: { type: 'string', minLength: 1 },
          extends: { type: 'string', minLength: 1 },
          modifiers: {
            type: 'object',
            additionalProperties: {
              type: ['number', 'string', 'boolean'],
            },
          },
        },
      },
    },
  },
};

GRAPH_SCHEMAS['media-descriptor-v1'] = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'https://rnd-pro.github.io/symbiote-ui/schemas/media-descriptor-v1.json',
  title: 'Symbiote Media Descriptor',
  type: 'object',
  additionalProperties: false,
  required: ['kind', 'activation'],
  properties: {
    kind: { type: 'string', minLength: 1 },
    poster: { type: 'string' },
    alt: { type: 'string' },
    fit: { enum: ['contain', 'cover'] },
    activation: {
      type: 'object',
      additionalProperties: true,
      required: ['provider'],
      properties: {
        provider: { type: 'string', minLength: 1 },
      },
    },
    targetIds: {
      type: 'array',
      items: { type: 'string', minLength: 1 },
      uniqueItems: true,
    },
  },
};

GRAPH_SCHEMAS[GRAPH_LAYOUT_QUALITY_VERSION] = GRAPH_LAYOUT_QUALITY_SCHEMA;

export function listGraphVersions() {
  return GRAPH_SCHEMA_VERSIONS.map((schema) => schema.version);
}

export function getGraphSchema(version = 'v1') {
  return GRAPH_SCHEMAS[version];
}

export function listGraphSchemas() {
  return GRAPH_SCHEMA_VERSIONS.map((schema) => ({
    ...schema,
    ...getGraphSchema(schema.version),
  }));
}
