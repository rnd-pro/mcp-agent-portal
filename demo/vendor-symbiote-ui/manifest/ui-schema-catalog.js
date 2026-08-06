export let UI_SCHEMA_VERSIONS = [
  {
    version: 'component-descriptor-v1',
    path: 'schemas/component-descriptor-v1.json',
    description: 'JSON Schema for Symbiote Node component provider descriptors.',
  },
  {
    version: 'component-descriptor-v2',
    path: 'schemas/component-descriptor-v2.json',
    description: 'JSON Schema for Symbiote UI component descriptors with SSR and WebMCP metadata.',
  },
  {
    version: 'runtime-ui-v1',
    path: 'schemas/runtime-ui-v1.json',
    description: 'JSON Schema for runtime UI trees assembled from provider component descriptors.',
  },
  {
    version: 'product-context-v1',
    path: 'schemas/product-context-v1.json',
    description: 'JSON Schema for host-owned product context exposed to agents through WebMCP descriptors.',
  },
  {
    version: 'theme-rule-block-v1',
    path: 'schemas/theme-rule-block-v1.json',
    description: 'JSON Schema for composable theme source, cascade, semantic, and component alias blocks.',
  },
  {
    version: 'theme-recipe-v1',
    path: 'schemas/theme-recipe-v1.json',
    description: 'JSON Schema for relative Symbiote theme recipes, relation modifiers, and bounded token overrides.',
  },
  {
    version: 'agent-intent-v1',
    path: 'schemas/agent-intent-v1.json',
    description: 'JSON Schema for unified transaction-like agent intent sequences.',
  },
  {
    version: 'message-part-v1',
    path: 'schemas/message-part-v1.json',
    description: 'JSON Schema for agent chat message parts.',
  },
  {
    version: 'data-grid-v1',
    path: 'schemas/data-grid-v1.json',
    description: 'JSON Schema for Data Grid options, columns, and rows configuration.',
  },
  {
    version: 'chart-spec-v1',
    path: 'schemas/chart-spec-v1.json',
    description: 'JSON Schema for Chart Spec V1 configurations.',
  },
  {
    version: 'source-diff-v1',
    path: 'schemas/source-diff-v1.json',
    description: 'JSON Schema for Unified and Side-by-Side Diff datasets.',
  },
];

export let UI_SCHEMAS = {
  'component-descriptor-v1': {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $id: 'https://rnd-pro.github.io/symbiote-ui/schemas/component-descriptor-v1.json',
    title: 'Symbiote Node Component Descriptor',
    type: 'object',
    additionalProperties: false,
    required: ['tagName', 'className', 'module', 'specifier', 'importKind', 'category', 'description'],
    properties: {
      tagName: { type: 'string', pattern: '^[a-z][a-z0-9]*(-[a-z0-9]+)+$' },
      className: { type: 'string', minLength: 1 },
      module: { type: 'string', minLength: 1 },
      specifier: { type: 'string', minLength: 1 },
      exportName: { type: ['string', 'null'] },
      importKind: { enum: ['named', 'side-effect'] },
      category: { type: 'string', minLength: 1 },
      description: { type: 'string', minLength: 1 },
      internal: { type: 'boolean' },
      contract: { $ref: '#/$defs/componentContract' },
    },
    $defs: {
      componentContract: {
        type: 'object',
        additionalProperties: false,
        properties: {
          status: { enum: ['draft', 'stable'] },
          schemaVersion: { const: 'component-descriptor-v1' },
          dataSchema: { type: 'string' },
          capabilities: {
            type: 'array',
            items: { type: 'string', minLength: 1 },
            uniqueItems: true,
          },
          properties: {
            type: 'array',
            items: { $ref: '#/$defs/member' },
          },
          attributes: {
            type: 'array',
            items: { $ref: '#/$defs/member' },
          },
          methods: {
            type: 'array',
            items: { $ref: '#/$defs/member' },
          },
          events: {
            type: 'array',
            items: { $ref: '#/$defs/event' },
          },
          slots: {
            type: 'array',
            items: { $ref: '#/$defs/member' },
          },
          cssParts: {
            type: 'array',
            items: { $ref: '#/$defs/member' },
          },
          themeAliases: {
            type: 'array',
            items: { type: 'string', minLength: 1 },
            uniqueItems: true,
          },
          notes: { type: 'string' },
        },
      },
      member: {
        type: 'object',
        additionalProperties: false,
        required: ['name'],
        properties: {
          name: { type: 'string', minLength: 1 },
          type: { type: 'string' },
          description: { type: 'string' },
          required: { type: 'boolean' },
          readonly: { type: 'boolean' },
        },
      },
      event: {
        type: 'object',
        additionalProperties: false,
        required: ['name'],
        properties: {
          name: { type: 'string', minLength: 1 },
          description: { type: 'string' },
          detail: {
            type: 'array',
            items: { $ref: '#/$defs/member' },
          },
        },
      },
    },
  },
  'runtime-ui-v1': {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $id: 'https://rnd-pro.github.io/symbiote-ui/schemas/runtime-ui-v1.json',
    title: 'Symbiote Node Runtime UI Tree',
    type: 'object',
    additionalProperties: false,
    required: ['version', 'root'],
    properties: {
      version: { const: 'runtime-ui-v1' },
      metadata: { type: 'object', additionalProperties: true },
      componentRegistries: {
        type: 'array',
        items: { $ref: '#/$defs/componentRegistry' },
        uniqueItems: true,
      },
      theme: { $ref: '#/$defs/themeRef' },
      root: { $ref: '#/$defs/node' },
    },
    $defs: {
      componentRegistry: {
        type: 'object',
        additionalProperties: true,
        required: ['id'],
        properties: {
          id: { type: 'string', minLength: 1 },
          provider: { type: 'string', minLength: 1 },
          schema: { type: 'string', minLength: 1 },
        },
      },
      themeRef: {
        type: 'object',
        additionalProperties: false,
        properties: {
          name: { type: 'string' },
          overrides: { type: 'object', additionalProperties: { type: 'string' } },
        },
      },
      node: {
        type: 'object',
        additionalProperties: false,
        required: ['component'],
        properties: {
          id: { type: 'string' },
          component: { type: 'string', minLength: 1 },
          componentRegistry: { type: 'string', minLength: 1 },
          props: { type: 'object', additionalProperties: true },
          attrs: { type: 'object', additionalProperties: { type: ['string', 'number', 'boolean'] } },
          state: { $ref: '#/$defs/componentState' },
          layout: { $ref: '#/$defs/layout' },
          bindings: { type: 'object', additionalProperties: { type: 'string' } },
          events: { type: 'object', additionalProperties: { type: 'string' } },
          theme: { $ref: '#/$defs/themeRef' },
          children: {
            type: 'array',
            items: { $ref: '#/$defs/node' },
          },
        },
      },
      componentState: {
        type: 'object',
        additionalProperties: false,
        properties: {
          props: { type: 'object', additionalProperties: true },
          attrs: { type: 'object', additionalProperties: { type: ['string', 'number', 'boolean'] } },
          methods: {
            type: 'object',
            additionalProperties: {
              oneOf: [
                { type: 'array' },
                { type: 'string' },
                { type: 'number' },
                { type: 'boolean' },
                { type: 'object', additionalProperties: true },
                { type: 'null' },
              ],
            },
          },
        },
      },
      layout: {
        type: 'object',
        additionalProperties: false,
        properties: {
          direction: { enum: ['horizontal', 'vertical'] },
          weight: { type: 'number', minimum: 0 },
          rect: { $ref: '#/$defs/relativeRect' },
          area: { type: 'string', minLength: 1 },
        },
      },
      relativeRect: {
        type: 'object',
        additionalProperties: false,
        required: ['x', 'y', 'width', 'height'],
        properties: {
          x: { type: 'number', minimum: 0, maximum: 1 },
          y: { type: 'number', minimum: 0, maximum: 1 },
          width: { type: 'number', minimum: 0, maximum: 1 },
          height: { type: 'number', minimum: 0, maximum: 1 },
        },
      },
    },
  },
  'product-context-v1': {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $id: 'https://rnd-pro.github.io/symbiote-ui/schemas/product-context-v1.json',
    title: 'Symbiote UI Product Context',
    type: 'object',
    additionalProperties: false,
    required: ['version', 'product', 'views', 'componentRefs', 'entities', 'actions'],
    properties: {
      version: { const: 'product-context-v1' },
      schema: { const: 'https://rnd-pro.github.io/symbiote-ui/schemas/product-context-v1.json' },
      product: { $ref: '#/$defs/product' },
      agent: { $ref: '#/$defs/agent' },
      views: { type: 'array', items: { $ref: '#/$defs/view' } },
      componentRefs: { type: 'array', items: { $ref: '#/$defs/componentRef' } },
      entities: { type: 'array', items: { $ref: '#/$defs/entity' } },
      actions: { type: 'array', items: { $ref: '#/$defs/action' } },
      eventLog: { type: 'array', items: { $ref: '#/$defs/eventLogItem' } },
      webmcp: { $ref: '#/$defs/webmcp' },
      runtime: { $ref: '#/$defs/runtime' },
      metadata: { type: 'object', additionalProperties: true },
    },
    $defs: {
      idArray: {
        type: 'array',
        items: { type: 'string', minLength: 1 },
        uniqueItems: true,
      },
      product: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'name', 'category'],
        properties: {
          id: { type: 'string', minLength: 1 },
          name: { type: 'string', minLength: 1 },
          category: { type: 'string', minLength: 1 },
          description: { type: 'string' },
          url: { type: 'string' },
          metadata: { type: 'object', additionalProperties: true },
        },
      },
      agent: {
        type: 'object',
        additionalProperties: false,
        required: ['summary', 'usage'],
        properties: {
          summary: { type: 'string', minLength: 1 },
          usage: { type: 'string', minLength: 1 },
          audience: { type: 'string' },
          constraints: { $ref: '#/$defs/idArray' },
        },
      },
      view: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'label', 'route'],
        properties: {
          id: { type: 'string', minLength: 1 },
          label: { type: 'string', minLength: 1 },
          route: { type: 'string', minLength: 1 },
          description: { type: 'string' },
          componentRefs: { $ref: '#/$defs/idArray' },
          entityRefs: { $ref: '#/$defs/idArray' },
          actionRefs: { $ref: '#/$defs/idArray' },
          active: { type: 'boolean' },
          metadata: { type: 'object', additionalProperties: true },
        },
      },
      componentRef: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'component'],
        properties: {
          id: { type: 'string', minLength: 1 },
          component: { type: 'string', minLength: 1 },
          descriptor: { type: 'string' },
          schema: { type: 'string' },
          version: { type: 'string' },
          capabilities: { $ref: '#/$defs/idArray' },
          componentId: { type: 'string' },
          selector: { type: 'string' },
          viewId: { type: 'string' },
          role: { type: 'string' },
          description: { type: 'string' },
          entityRefs: { $ref: '#/$defs/idArray' },
          actionRefs: { $ref: '#/$defs/idArray' },
          metadata: { type: 'object', additionalProperties: true },
        },
      },
      entity: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'type', 'label'],
        properties: {
          id: { type: 'string', minLength: 1 },
          type: { type: 'string', minLength: 1 },
          label: { type: 'string', minLength: 1 },
          description: { type: 'string' },
          status: { type: 'string' },
          componentRefs: { $ref: '#/$defs/idArray' },
          actionRefs: { $ref: '#/$defs/idArray' },
          data: { type: 'object', additionalProperties: true },
          metadata: { type: 'object', additionalProperties: true },
        },
      },
      action: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'name', 'title', 'type', 'inputSchema'],
        properties: {
          id: { type: 'string', minLength: 1 },
          name: { type: 'string', minLength: 1 },
          title: { type: 'string', minLength: 1 },
          description: { type: 'string' },
          type: { type: 'string', minLength: 1 },
          inputSchema: { type: 'object', additionalProperties: true },
          componentRefs: { $ref: '#/$defs/idArray' },
          entityRefs: { $ref: '#/$defs/idArray' },
          viewRefs: { $ref: '#/$defs/idArray' },
          eventName: { type: 'string' },
          intent: { type: 'object', additionalProperties: true },
          permission: { type: 'string' },
          destructive: { type: 'boolean' },
          allowed: { type: 'boolean' },
          metadata: { type: 'object', additionalProperties: true },
        },
      },
      eventLogItem: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'type', 'title'],
        properties: {
          id: { type: 'string', minLength: 1 },
          type: { type: 'string', minLength: 1 },
          title: { type: 'string', minLength: 1 },
          detail: { type: 'string' },
          status: { type: 'string' },
          timestamp: { type: 'string' },
          viewId: { type: 'string' },
          actionId: { type: 'string' },
          entityId: { type: 'string' },
          componentRefId: { type: 'string' },
          data: { type: 'object', additionalProperties: true },
          metadata: { type: 'object', additionalProperties: true },
        },
      },
      runtime: {
        type: 'object',
        additionalProperties: false,
        properties: {
          activeViewId: { type: 'string' },
          activeSurfaceId: { type: 'string' },
          activeWindowId: { type: 'string' },
          activeTabId: { type: 'string' },
          locale: { type: 'string' },
          selectedEntityRefs: { $ref: '#/$defs/idArray' },
          safeActionRefs: { $ref: '#/$defs/idArray' },
          safeActions: { type: 'array', items: { $ref: '#/$defs/runtimeAction' } },
          collapsed: { type: 'object', additionalProperties: true },
          layoutPresets: { type: 'array', items: { $ref: '#/$defs/runtimeLayoutPreset' } },
          windows: { type: 'array', items: { $ref: '#/$defs/runtimeItem' } },
          tabs: { type: 'array', items: { $ref: '#/$defs/runtimeItem' } },
          surfaces: { type: 'array', items: { $ref: '#/$defs/runtimeItem' } },
          cues: { type: 'array', items: { $ref: '#/$defs/runtimeItem' } },
          focus: { type: 'array', items: { type: 'object', additionalProperties: true } },
          capabilities: { type: 'object', additionalProperties: true },
          enrichment: { type: 'array', items: { $ref: '#/$defs/runtimeEnrichment' } },
          hooks: { type: 'array', items: { $ref: '#/$defs/runtimeHook' } },
          recentInteractions: { type: 'array', items: { $ref: '#/$defs/runtimeLogItem' } },
          recentDataChanges: { type: 'array', items: { $ref: '#/$defs/runtimeLogItem' } },
          metadata: { type: 'object', additionalProperties: true },
        },
      },
      runtimeItem: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'kind', 'title'],
        properties: {
          id: { type: 'string', minLength: 1 },
          kind: { type: 'string', minLength: 1 },
          title: { type: 'string', minLength: 1 },
          role: { type: 'string' },
          component: { type: 'string' },
          viewId: { type: 'string' },
          resourceType: { type: 'string' },
          selector: { type: 'string' },
          summary: { type: 'string' },
          entityRefs: { $ref: '#/$defs/idArray' },
          actionRefs: { $ref: '#/$defs/idArray' },
          collapsed: { type: 'boolean' },
          layoutPresetId: { type: 'string' },
          target: { $ref: '#/$defs/runtimeTarget' },
          targetSemantics: { type: 'string' },
          state: { type: 'object', additionalProperties: true },
          metadata: { type: 'object', additionalProperties: true },
          children: { type: 'array', items: { $ref: '#/$defs/runtimeItem' } },
        },
      },
      runtimeTarget: {
        type: 'object',
        additionalProperties: false,
        properties: {
          id: { type: 'string' },
          kind: { type: 'string' },
          selector: { type: 'string' },
          component: { type: 'string' },
          viewId: { type: 'string' },
          entityRefs: { $ref: '#/$defs/idArray' },
          actionRefs: { $ref: '#/$defs/idArray' },
          semantics: { type: 'string' },
          metadata: { type: 'object', additionalProperties: true },
        },
      },
      runtimeLayoutPreset: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'label'],
        properties: {
          id: { type: 'string', minLength: 1 },
          label: { type: 'string', minLength: 1 },
          description: { type: 'string' },
          componentRefs: { $ref: '#/$defs/idArray' },
          viewRefs: { $ref: '#/$defs/idArray' },
          metadata: { type: 'object', additionalProperties: true },
        },
      },
      runtimeAction: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'title'],
        properties: {
          id: { type: 'string', minLength: 1 },
          name: { type: 'string' },
          title: { type: 'string', minLength: 1 },
          reason: { type: 'string' },
          componentRefs: { $ref: '#/$defs/idArray' },
          entityRefs: { $ref: '#/$defs/idArray' },
          viewRefs: { $ref: '#/$defs/idArray' },
          targetRefs: { $ref: '#/$defs/idArray' },
          safe: { type: 'boolean' },
          metadata: { type: 'object', additionalProperties: true },
        },
      },
      runtimeEnrichment: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'type', 'title'],
        properties: {
          id: { type: 'string', minLength: 1 },
          type: { type: 'string', minLength: 1 },
          title: { type: 'string', minLength: 1 },
          detail: { type: 'string' },
          source: { type: 'string' },
          componentRefs: { $ref: '#/$defs/idArray' },
          entityRefs: { $ref: '#/$defs/idArray' },
          viewRefs: { $ref: '#/$defs/idArray' },
          targetRefs: { $ref: '#/$defs/idArray' },
          actionRefs: { $ref: '#/$defs/idArray' },
          priority: { type: 'number' },
          metadata: { type: 'object', additionalProperties: true },
        },
      },
      runtimeHook: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'title', 'mode'],
        properties: {
          id: { type: 'string', minLength: 1 },
          title: { type: 'string', minLength: 1 },
          description: { type: 'string' },
          mode: { type: 'string', minLength: 1 },
          trigger: { type: 'object', additionalProperties: true },
          componentRefs: { $ref: '#/$defs/idArray' },
          entityRefs: { $ref: '#/$defs/idArray' },
          viewRefs: { $ref: '#/$defs/idArray' },
          targetRefs: { $ref: '#/$defs/idArray' },
          actionRefs: { $ref: '#/$defs/idArray' },
          safeActionRefs: { $ref: '#/$defs/idArray' },
          metadata: { type: 'object', additionalProperties: true },
        },
      },
      runtimeLogItem: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'type'],
        properties: {
          id: { type: 'string', minLength: 1 },
          type: { type: 'string', minLength: 1 },
          title: { type: 'string' },
          detail: { type: 'string' },
          timestamp: { type: 'string' },
          data: { type: 'object', additionalProperties: true },
        },
      },
      webmcp: {
        type: 'object',
        additionalProperties: false,
        required: ['mode', 'productDescription', 'toolNames', 'componentContext', 'actionPolicy', 'references'],
        properties: {
          mode: { enum: ['product-actions', 'described-only'] },
          productDescription: { type: 'string', minLength: 1 },
          toolNames: { $ref: '#/$defs/idArray' },
          componentContext: { type: 'string', minLength: 1 },
          actionPolicy: { type: 'string', minLength: 1 },
          references: {
            type: 'array',
            items: { type: 'string', format: 'uri' },
            uniqueItems: true,
          },
        },
      },
    },
  },
  'theme-recipe-v1': {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $id: 'https://rnd-pro.github.io/symbiote-ui/schemas/theme-recipe-v1.json',
    title: 'Symbiote Theme Recipe',
    type: 'object',
    additionalProperties: false,
    required: ['name', 'version', 'base', 'description', 'params', 'relations'],
    properties: {
      name: { type: 'string', pattern: '^[a-z][a-z0-9-]*$' },
      version: { const: 'theme-recipe-v1' },
      base: { const: 'default-provider' },
      description: { type: 'string', minLength: 1 },
      designRegisters: {
        type: 'array',
        items: { type: 'string', minLength: 1 },
        uniqueItems: true,
      },
      params: {
        type: 'object',
        additionalProperties: false,
        properties: {
          mode: { enum: ['dark', 'light'] },
          brightness: { type: 'number', minimum: 0, maximum: 100 },
          contrast: { type: 'number', minimum: 0, maximum: 100 },
          chroma: { type: 'number', minimum: 0, maximum: 100 },
          hue: { type: 'number', minimum: 0, maximum: 360 },
          pattern: { type: 'number', minimum: 0, maximum: 100 },
          outline: { type: 'number', minimum: 0, maximum: 100 },
          type: { type: 'number', minimum: 80, maximum: 130 },
          heading: { type: 'number', minimum: 80, maximum: 140 },
          density: { type: 'number', minimum: 75, maximum: 140 },
          motion: { type: 'number', minimum: 0, maximum: 200 },
        },
      },
      relations: {
        type: 'object',
        additionalProperties: {
          type: 'object',
          additionalProperties: { type: 'number' },
        },
      },
      overrides: {
        type: 'object',
        propertyNames: { pattern: '^--sn-[a-z0-9-]+$' },
        additionalProperties: {
          anyOf: [
            { type: 'string', maxLength: 180 },
            { type: 'number' },
          ],
        },
      },
    },
  },
  'theme-rule-block-v1': {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $id: 'https://rnd-pro.github.io/symbiote-ui/schemas/theme-rule-block-v1.json',
    title: 'Symbiote Node Theme Rule Block',
    type: 'object',
    additionalProperties: false,
    required: ['name', 'kind', 'description'],
    properties: {
      name: { type: 'string', minLength: 1 },
      theme: { type: 'string', minLength: 1 },
      kind: {
        enum: [
          'source-accent',
          'color-cascade',
          'geometry-cascade',
          'typography-cascade',
          'motion-effects',
          'semantic-alias',
          'component-alias',
        ],
      },
      description: { type: 'string', minLength: 1 },
      parameters: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['name', 'type', 'description'],
          properties: {
            name: { type: 'string', minLength: 1 },
            type: { type: 'string', minLength: 1 },
            description: { type: 'string', minLength: 1 },
            default: { type: 'string' },
            unit: { type: 'string' },
          },
        },
      },
      inputs: {
        type: 'array',
        items: { type: 'string', minLength: 1 },
        uniqueItems: true,
      },
      outputs: {
        type: 'array',
        items: { type: 'string', minLength: 1 },
        uniqueItems: true,
      },
      formula: { type: 'string' },
      derivations: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['output', 'expression'],
          properties: {
            output: { type: 'string', minLength: 1 },
            inputs: {
              type: 'array',
              items: { type: 'string', minLength: 1 },
              uniqueItems: true,
            },
            expression: { type: 'string', minLength: 1 },
            description: { type: 'string' },
          },
        },
      },
      appliesTo: {
        type: 'array',
        items: { type: 'string', minLength: 1 },
        uniqueItems: true,
      },
    },
  },
};

UI_SCHEMAS['agent-intent-v1'] = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'https://rnd-pro.github.io/symbiote-ui/schemas/agent-intent-v1.json',
  title: 'Symbiote UI Agent Intent Transaction',
  type: 'object',
  additionalProperties: false,
  required: ['version', 'intentId', 'operations'],
  properties: {
    version: { const: 'agent-intent-v1' },
    intentId: { type: 'string', minLength: 1 },
    description: { type: 'string' },
    metadata: { type: 'object', additionalProperties: true },
    dryRun: { type: 'boolean' },
    validateOnly: { type: 'boolean' },
    operations: {
      type: 'array',
      items: { $ref: '#/$defs/operation' },
      minItems: 1,
    },
  },
  $defs: {
    operation: {
      oneOf: [
        { $ref: '#/$defs/registerComponentOperation' },
        { $ref: '#/$defs/registerDriverOperation' },
        { $ref: '#/$defs/layoutOperation' },
        { $ref: '#/$defs/uiOperation' },
        { $ref: '#/$defs/themeOperation' },
        { $ref: '#/$defs/stateOperation' },
      ],
    },
    registerComponentOperation: {
      type: 'object',
      additionalProperties: false,
      required: ['type', 'params'],
      properties: {
        type: { const: 'register-component' },
        params: { $ref: '#/$defs/registerComponentParams' },
      },
    },
    registerComponentParams: {
      type: 'object',
      additionalProperties: false,
      required: ['tagName', 'code'],
      properties: {
        tagName: { $ref: '#/$defs/customElementName' },
        code: { type: 'string', minLength: 1 },
        options: {
          type: 'object',
          additionalProperties: false,
          properties: {
            exportName: { type: 'string', minLength: 1 },
            allowOverride: { type: 'boolean' },
            blockedKeywords: {
              type: 'array',
              items: { type: 'string', minLength: 1 },
              uniqueItems: true,
            },
          },
        },
      },
    },
    registerDriverOperation: {
      type: 'object',
      additionalProperties: false,
      required: ['type', 'params'],
      properties: {
        type: { const: 'register-driver' },
        params: { $ref: '#/$defs/registerDriverParams' },
      },
    },
    registerDriverParams: {
      type: 'object',
      additionalProperties: true,
      required: ['driverType'],
      properties: {
        driverType: { type: 'string', minLength: 1 },
        module: { type: 'string', minLength: 1 },
        handler: { type: 'string', minLength: 1 },
        description: { type: 'string' },
      },
    },
    layoutOperation: {
      type: 'object',
      additionalProperties: false,
      required: ['type', 'params'],
      properties: {
        type: { const: 'layout' },
        params: { $ref: '#/$defs/layoutParams' },
      },
    },
    layoutParams: {
      type: 'object',
      additionalProperties: false,
      required: ['action'],
      properties: {
        action: { $ref: '#/$defs/layoutAction' },
        options: { type: 'object', additionalProperties: true },
      },
    },
    layoutAction: {
      type: 'object',
      additionalProperties: false,
      required: ['type', 'panelType'],
      properties: {
        type: { enum: ['open-panel', 'close-ui-panel', 'remove-ui-panel'] },
        panelType: { type: 'string', minLength: 1 },
        component: { type: 'string', minLength: 1 },
        panel: { type: 'string', minLength: 1 },
        options: { type: 'object', additionalProperties: true },
      },
    },
    uiOperation: {
      type: 'object',
      additionalProperties: false,
      required: ['type', 'params'],
      properties: {
        type: { const: 'ui' },
        params: {
          oneOf: [
            { $ref: '#/$defs/uiCreateParams' },
            { $ref: '#/$defs/uiDestroyParams' },
          ],
        },
      },
    },
    uiCreateParams: {
      type: 'object',
      additionalProperties: false,
      required: ['action', 'node'],
      properties: {
        action: { const: 'create' },
        node: { $ref: '#/$defs/runtimeUiNode' },
        parentId: { type: 'string', minLength: 1 },
        targetSelector: { type: 'string', minLength: 1 },
        target: { type: 'string', minLength: 1 },
        options: { type: 'object', additionalProperties: true },
      },
    },
    uiDestroyParams: {
      type: 'object',
      additionalProperties: false,
      required: ['action', 'id'],
      properties: {
        action: { const: 'destroy' },
        id: { type: 'string', minLength: 1 },
        options: { type: 'object', additionalProperties: true },
      },
    },
    themeOperation: {
      type: 'object',
      additionalProperties: false,
      required: ['type', 'params'],
      properties: {
        type: { const: 'theme' },
        params: { $ref: '#/$defs/themeParams' },
      },
    },
    themeParams: {
      type: 'object',
      additionalProperties: false,
      required: ['targetSelector'],
      properties: {
        targetSelector: { type: 'string', minLength: 1 },
        target: { type: 'string', minLength: 1 },
        options: { $ref: '#/$defs/themeOptions' },
        presets: { $ref: '#/$defs/themePresets' },
      },
    },
    themeOptions: {
      type: 'object',
      additionalProperties: false,
      properties: {
        mode: { enum: ['dark', 'light'] },
        hue: { type: 'number', minimum: 0, maximum: 360 },
        chroma: { type: 'number', minimum: 0, maximum: 100 },
        brightness: { type: 'number', minimum: 0, maximum: 100 },
        contrast: { type: 'number', minimum: 0, maximum: 100 },
        pattern: { type: 'number', minimum: 0, maximum: 100 },
        density: { type: 'number', minimum: 75, maximum: 140 },
        outline: { type: 'number', minimum: 0, maximum: 100 },
        type: { type: 'number', minimum: 80, maximum: 130 },
        heading: { type: 'number', minimum: 80, maximum: 140 },
        motion: { type: 'number', minimum: 0, maximum: 200 },
      },
    },
    themePresets: {
      type: 'object',
      additionalProperties: false,
      properties: {
        color: { type: 'string', minLength: 1 },
        palette: { type: 'string', minLength: 1 },
        skin: { type: 'string', minLength: 1 },
        layout: { type: 'string', minLength: 1 },
        motion: { type: 'string', minLength: 1 },
      },
    },
    stateOperation: {
      type: 'object',
      additionalProperties: false,
      required: ['type', 'params'],
      properties: {
        type: { const: 'state' },
        params: { $ref: '#/$defs/stateParams' },
      },
    },
    stateParams: {
      type: 'object',
      additionalProperties: false,
      required: ['id', 'state'],
      properties: {
        id: { type: 'string', minLength: 1 },
        state: { $ref: '#/$defs/componentState' },
      },
    },
    runtimeUiNode: {
      type: 'object',
      additionalProperties: false,
      required: ['component'],
      properties: {
        id: { type: 'string' },
        component: { $ref: '#/$defs/customElementName' },
        componentRegistry: { type: 'string', minLength: 1 },
        props: { type: 'object', additionalProperties: true },
        attrs: { type: 'object', additionalProperties: { type: ['string', 'number', 'boolean'] } },
        state: { $ref: '#/$defs/componentState' },
        bindings: { type: 'object', additionalProperties: { type: 'string' } },
        events: { type: 'object', additionalProperties: { type: 'string' } },
        layout: { type: 'object', additionalProperties: true },
        theme: { type: 'object', additionalProperties: true },
        children: {
          type: 'array',
          items: { $ref: '#/$defs/runtimeUiNode' },
        },
      },
    },
    componentState: {
      type: 'object',
      additionalProperties: false,
      properties: {
        props: { type: 'object', additionalProperties: true },
        attrs: { type: 'object', additionalProperties: { type: ['string', 'number', 'boolean'] } },
        methods: {
          type: 'object',
          additionalProperties: {
            oneOf: [
              { type: 'array' },
              { type: 'string' },
              { type: 'number' },
              { type: 'boolean' },
              { type: 'object', additionalProperties: true },
              { type: 'null' },
            ],
          },
        },
      },
    },
    customElementName: {
      type: 'string',
      pattern: '^[a-z][a-z0-9]*(-[a-z0-9]+)+$',
    },
  },
};

UI_SCHEMAS['component-descriptor-v2'] = JSON.parse(JSON.stringify(UI_SCHEMAS['component-descriptor-v1']));
UI_SCHEMAS['component-descriptor-v2'].$id = 'https://rnd-pro.github.io/symbiote-ui/schemas/component-descriptor-v2.json';
UI_SCHEMAS['component-descriptor-v2'].title = 'Symbiote UI Component Descriptor';
UI_SCHEMAS['component-descriptor-v2'].properties.componentDescription = { type: 'string', minLength: 1 };
UI_SCHEMAS['component-descriptor-v2'].properties.agent = { $ref: '#/$defs/agentContext' };
UI_SCHEMAS['component-descriptor-v2'].$defs.agentContext = {
  type: 'object',
  additionalProperties: false,
  required: ['componentDescription', 'semanticRole', 'usage', 'dataOwnership', 'webmcp'],
  properties: {
    componentDescription: { type: 'string', minLength: 1 },
    semanticRole: { type: 'string', minLength: 1 },
    usage: { type: 'string', minLength: 1 },
    dataOwnership: { type: 'string', minLength: 1 },
    webmcp: { $ref: '#/$defs/webMcpAgentContext' },
  },
};
UI_SCHEMAS['component-descriptor-v2'].$defs.webMcpAgentContext = {
  type: 'object',
  additionalProperties: false,
  required: ['mode', 'toolNames', 'toolNaming', 'componentContext', 'bindVisibility', 'globalToolMode', 'references'],
  properties: {
    mode: { enum: ['explicit-descriptor', 'described-only'] },
    toolNames: {
      type: 'array',
      items: { type: 'string', minLength: 1 },
      uniqueItems: true,
    },
    toolNaming: { type: 'string', minLength: 1 },
    componentContext: { type: 'string', minLength: 1 },
    bindVisibility: { type: 'string', minLength: 1 },
    globalToolMode: { type: 'string', minLength: 1 },
    references: {
      type: 'array',
      items: { type: 'string', format: 'uri' },
      uniqueItems: true,
    },
  },
};
UI_SCHEMAS['component-descriptor-v2'].$defs.componentContract.properties.schemaVersion = { const: 'component-descriptor-v2' };
UI_SCHEMAS['component-descriptor-v2'].$defs.componentContract.properties.ssr = { $ref: '#/$defs/ssrContract' };
UI_SCHEMAS['component-descriptor-v2'].$defs.componentContract.properties.webmcp = { $ref: '#/$defs/webMcpContract' };
UI_SCHEMAS['component-descriptor-v2'].$defs.ssrContract = {
  type: 'object',
  additionalProperties: false,
  required: ['mode'],
  properties: {
    mode: { enum: ['node-safe', 'ssr-entry-safe', 'jsda-ssr-renderable', 'hydrate-only', 'client-only'] },
    importSafe: { type: 'boolean' },
    jsdaRenderable: { type: 'boolean' },
    requiresDom: { type: 'boolean' },
    browserApis: {
      type: 'array',
      items: { type: 'string', minLength: 1 },
      uniqueItems: true,
    },
    notes: { type: 'string' },
  },
};
UI_SCHEMAS['component-descriptor-v2'].$defs.webMcpContract = {
  type: 'object',
  additionalProperties: false,
  properties: {
    documentation: { type: 'string' },
    tools: {
      type: 'array',
      items: { $ref: '#/$defs/webMcpTool' },
      uniqueItems: true,
    },
  },
};
UI_SCHEMAS['component-descriptor-v2'].$defs.webMcpTool = {
  type: 'object',
  additionalProperties: false,
  required: ['name', 'description', 'inputSchema'],
  properties: {
    name: { type: 'string', minLength: 1 },
    description: { type: 'string', minLength: 1 },
    inputSchema: { type: 'object', additionalProperties: true },
    annotations: { type: 'object', additionalProperties: true },
    exposedTo: {
      type: 'array',
      items: { enum: ['agent', 'assistant', 'host'] },
      uniqueItems: true,
    },
    visibilityDeps: {
      type: 'array',
      items: { type: 'string', minLength: 1 },
      uniqueItems: true,
    },
  },
};

UI_SCHEMAS['message-part-v1'] = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'https://rnd-pro.github.io/symbiote-ui/schemas/message-part-v1.json',
  title: 'Symbiote Agent Message Part',
  type: 'object',
  required: ['type'],
  properties: {
    type: {
      type: 'string',
      enum: [
        'text',
        'text_delta',
        'stream_delta',
        'reasoning',
        'status',
        'tool_call',
        'tool_result',
        'source',
        'attachment',
        'artifact',
        'approval',
        'action',
        'retry',
        'cancel',
        'error',
        'cancelled'
      ]
    },
    text: { type: 'string' },
    name: { type: 'string' },
    id: { type: 'string' },
    args: { type: ['object', 'array', 'string', 'number', 'boolean', 'null'] },
    result: { type: ['object', 'array', 'string', 'number', 'boolean', 'null'] },
    status: { type: 'string' },
    title: { type: 'string' },
    url: { type: 'string' },
    mimeType: { type: 'string' },
    meta: { type: 'object', additionalProperties: true }
  },
  additionalProperties: false
};

UI_SCHEMAS['data-grid-v1'] = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'https://rnd-pro.github.io/symbiote-ui/schemas/data-grid-v1.json',
  title: 'DataGridOptionsV1',
  type: 'object',
  properties: {
    columns: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          key: { type: 'string' },
          label: { type: 'string' },
          align: { type: 'string', enum: ['start', 'center', 'end'] },
          sortable: { type: 'boolean' },
          sortDirection: { type: 'string', enum: ['asc', 'desc', 'none'] },
          visible: { type: 'boolean' },
          pinned: { type: 'string', enum: ['left', 'right', 'none'] },
          width: { type: ['string', 'number'] }
        },
        required: ['key']
      }
    },
    rows: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: ['string', 'number'] },
          cells: { type: 'object' },
          details: { type: 'string' },
          children: { type: 'array' }
        }
      }
    },
    selectionMode: {
      type: 'string',
      enum: ['none', 'single', 'multi']
    },
    emptyText: {
      type: 'string'
    }
  },
  additionalProperties: false
};

UI_SCHEMAS['chart-spec-v1'] = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'https://rnd-pro.github.io/symbiote-ui/schemas/chart-spec-v1.json',
  title: 'ChartSpecV1',
  type: 'object',
  properties: {
    title: { type: 'string' },
    type: { type: 'string', enum: ['bar', 'line', 'area', 'scatter', 'pie', 'mixed'] },
    xAxis: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: ['category', 'value'] },
        data: { type: 'array', items: { type: 'string' } }
      }
    },
    yAxis: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: ['value'] },
        min: { type: 'number' },
        max: { type: 'number' },
        label: { type: 'string' }
      }
    },
    series: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          type: { type: 'string', enum: ['bar', 'line', 'area', 'scatter', 'pie'] },
          data: { type: 'array', items: { type: 'number' } },
          color: { type: 'string' }
        },
        required: ['name', 'data']
      }
    },
    thresholds: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          value: { type: 'number' },
          label: { type: 'string' },
          color: { type: 'string' }
        },
        required: ['value']
      }
    },
    legend: {
      type: 'object',
      properties: {
        show: { type: 'boolean' },
        position: { type: 'string', enum: ['top', 'bottom'] }
      }
    },
    tooltip: {
      type: 'object',
      properties: {
        show: { type: 'boolean' }
      }
    }
  },
  required: ['series'],
  additionalProperties: false
};

UI_SCHEMAS['source-diff-v1'] = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'https://rnd-pro.github.io/symbiote-ui/schemas/source-diff-v1.json',
  title: 'SourceDiffV1',
  type: 'object',
  properties: {
    path: { type: 'string' },
    originalPath: { type: ['string', 'null'] },
    modifiedPath: { type: ['string', 'null'] },
    hunks: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          header: { type: 'string' },
          lines: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                type: { type: 'string', enum: ['addition', 'deletion', 'normal'] },
                originalLineNumber: { type: ['integer', 'null'] },
                modifiedLineNumber: { type: ['integer', 'null'] },
                content: { type: 'string' },
                diagnostics: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      severity: { type: 'string', enum: ['error', 'warning', 'info', 'hint'] },
                      message: { type: 'string' },
                      code: { type: 'string' }
                    },
                    required: ['severity', 'message'],
                    additionalProperties: false
                  }
                }
              },
              required: ['type', 'content']
            }
          }
        },
        required: ['header', 'lines']
      }
    }
  },
  required: ['path', 'hunks'],
  additionalProperties: false
};

export function listUiSchemaVersions() {
  return UI_SCHEMA_VERSIONS.map((schema) => schema.version);
}

export function getUiSchema(version) {
  return UI_SCHEMAS[version];
}
