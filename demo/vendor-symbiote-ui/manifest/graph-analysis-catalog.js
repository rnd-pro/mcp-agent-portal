import {
  GRAPH_LAYOUT_QUALITY_DEFAULT_POLICY,
  GRAPH_LAYOUT_QUALITY_NUMERIC_DOMAIN,
} from '../graph/layout-quality.js';

export { GRAPH_LAYOUT_QUALITY_DEFAULT_POLICY, GRAPH_LAYOUT_QUALITY_NUMERIC_DOMAIN };

let graphLayoutQualityRuleDefinitions = [
  {
    id: 'policy.invalid',
    severity: 'error',
    effect: 'incomplete',
    description: 'Pass policy as an object or omit it to use defaults.',
  },
  {
    id: 'policy.unknown-field',
    severity: 'error',
    effect: 'incomplete',
    description: 'Remove policy fields that are not published by this operation.',
  },
  {
    id: 'policy.invalid-field',
    severity: 'error',
    effect: 'incomplete',
    description: 'Use the published numeric range and type for every policy field.',
  },
  {
    id: 'input.invalid-version',
    severity: 'error',
    effect: 'incomplete',
    description: 'Use the graph-layout-snapshot-v1 input version.',
  },
  {
    id: 'input.invalid-nodes',
    severity: 'error',
    effect: 'incomplete',
    description: 'Provide nodes as an array, including an empty array for an empty layout.',
  },
  {
    id: 'input.invalid-edges',
    severity: 'error',
    effect: 'incomplete',
    description: 'Provide edges as an array or omit the field.',
  },
  {
    id: 'node.invalid-id',
    severity: 'error',
    effect: 'incomplete',
    description: 'Give every node a non-empty string ID without surrounding whitespace.',
  },
  {
    id: 'node.duplicate-id',
    severity: 'error',
    effect: 'incomplete',
    description: 'Make node IDs unique; all occurrences of a duplicate ID are skipped.',
  },
  {
    id: 'node.invalid-geometry',
    severity: 'error',
    effect: 'incomplete',
    description: 'Use node bounds inside the numeric domain with representable right and bottom extents.',
  },
  {
    id: 'parent.invalid',
    severity: 'error',
    effect: 'incomplete',
    description: 'Use a non-empty parentId that references an existing node, or omit it.',
  },
  {
    id: 'parent.cycle',
    severity: 'error',
    effect: 'incomplete',
    description: 'Remove self-parenting and cycles from the parent hierarchy.',
  },
  {
    id: 'parent.too-distant',
    severity: 'warning',
    effect: 'warn',
    description: 'Move a node closer to its parent or increase maxParentDistanceRatio.',
  },
  {
    id: 'baseline.invalid',
    severity: 'error',
    effect: 'incomplete',
    description: 'Provide baseline.nodes in a published array or ID-map shape with numeric-domain and representable bounds.',
  },
  {
    id: 'baseline.duplicate-id',
    severity: 'error',
    effect: 'incomplete',
    description: 'Make baseline node IDs unique; all duplicate occurrences are skipped.',
  },
  {
    id: 'edge.invalid-id',
    severity: 'error',
    effect: 'incomplete',
    description: 'Give every edge a non-empty string ID without surrounding whitespace.',
  },
  {
    id: 'edge.duplicate-id',
    severity: 'error',
    effect: 'incomplete',
    description: 'Make edge IDs unique; all occurrences of a duplicate ID are skipped.',
  },
  {
    id: 'edge.invalid-endpoint',
    severity: 'error',
    effect: 'incomplete',
    description: 'Reference two distinct existing nodes from sourceId and targetId.',
  },
  {
    id: 'edge.invalid-points',
    severity: 'error',
    effect: 'incomplete',
    description: 'Provide at least two route points inside the numeric domain with a representable normalized length.',
  },
  {
    id: 'edge.too-long',
    severity: 'warning',
    effect: 'warn',
    description: 'Shorten the route or increase maxEdgeLengthRatio.',
  },
  {
    id: 'edge.node-intersection',
    severity: 'error',
    effect: 'fail',
    description: 'Route the edge outside the interior of unrelated node bounds.',
  },
  {
    id: 'edge.crossing',
    severity: 'warning',
    effect: 'warn',
    description: 'Reroute either edge to remove the remote crossing.',
  },
  {
    id: 'layout.analysis-budget-exceeded',
    severity: 'error',
    effect: 'incomplete',
    description: 'Increase maxPairChecks or reduce the audited layout size.',
  },
  {
    id: 'layout.numeric-underflow',
    severity: 'error',
    effect: 'incomplete',
    description: 'Adjust geometry scale so every non-zero derived value remains representable in IEEE-754.',
  },
  {
    id: 'node.overlap',
    severity: 'error',
    effect: 'fail',
    description: 'Reduce node intersection area below overlapTolerance.',
  },
  {
    id: 'node.too-distant',
    severity: 'warning',
    effect: 'warn',
    description: 'Move the node closer to its nearest neighbor or increase the ratio limit.',
  },
  {
    id: 'viewport.invalid',
    severity: 'error',
    effect: 'incomplete',
    description: 'Use positive viewport dimensions and padding smaller than half each dimension.',
  },
  {
    id: 'viewport.node-too-small',
    severity: 'warning',
    effect: 'warn',
    description: 'Increase viewport space or reduce graph spread so nodes remain readable.',
  },
  {
    id: 'layout.unstable',
    severity: 'warning',
    effect: 'warn',
    description: 'Keep relative node movement within maxStabilityShiftRatio.',
  },
];

let rulePayloads = {
  'policy.invalid': {
    actual: { type: ['string', 'null'], unit: 'input-value', description: 'Received policy type or null.' },
    limit: { type: 'string', unit: 'expected-shape', description: 'Required policy shape.' },
  },
  'policy.unknown-field': {
    actual: { type: 'string', unit: 'field-name', description: 'Unknown policy field.' },
    limit: { type: 'string', unit: 'field-list', description: 'Comma-separated allowed fields.' },
  },
  'policy.invalid-field': {
    actual: { type: 'json-value', unit: 'input-value', description: 'Rejected field value.' },
    limit: { type: 'string', unit: 'expected-range', description: 'Required type and numeric range.' },
  },
  'input.invalid-version': {
    actual: { type: 'json-value', unit: 'version', description: 'Received snapshot version.' },
    limit: { type: 'string', unit: 'version', description: 'Required snapshot version.' },
  },
  'input.invalid-nodes': {
    actual: { type: 'json-value', unit: 'input-value', description: 'Received nodes value.' },
    limit: { type: 'string', unit: 'expected-shape', description: 'Required nodes collection shape.' },
  },
  'input.invalid-edges': {
    actual: { type: 'json-value', unit: 'input-value', description: 'Received edges value.' },
    limit: { type: 'string', unit: 'expected-shape', description: 'Required edges collection shape.' },
  },
  'node.invalid-id': {
    actual: { type: 'json-value', unit: 'identifier', description: 'Rejected node ID.' },
    limit: { type: 'string', unit: 'expected-shape', description: 'Required node ID contract.' },
  },
  'node.duplicate-id': {
    actual: { type: 'integer', unit: 'occurrences', description: 'Number of occurrences.' },
    limit: { type: 'integer', unit: 'occurrences', description: 'Maximum allowed occurrences.' },
  },
  'node.invalid-geometry': {
    actual: { type: 'json-value', unit: 'bounds', description: 'Rejected node bounds.' },
    limit: { type: 'string', unit: 'expected-shape', description: 'Required bounds contract.' },
  },
  'parent.invalid': {
    actual: { type: 'json-value', unit: 'identifier', description: 'Malformed or missing parent ID.' },
    limit: { type: 'string', unit: 'expected-shape', description: 'Required parent reference contract.' },
  },
  'parent.cycle': {
    actual: { type: 'array', items: 'string', unit: 'node-ids', description: 'Nodes in the cycle.' },
    limit: { type: 'string', unit: 'expected-structure', description: 'Required hierarchy structure.' },
  },
  'parent.too-distant': {
    actual: { type: 'number', unit: 'normalization-ratio', description: 'Parent-child center distance ratio.' },
    limit: { type: 'number', unit: 'normalization-ratio', policyField: 'maxParentDistanceRatio' },
  },
  'baseline.invalid': {
    actual: { type: 'json-value', unit: 'input-value', description: 'Rejected baseline value.' },
    limit: { type: 'string', unit: 'expected-shape', description: 'Required baseline shape or geometry.' },
  },
  'baseline.duplicate-id': {
    actual: { type: 'integer', unit: 'occurrences', description: 'Number of baseline occurrences.' },
    limit: { type: 'integer', unit: 'occurrences', description: 'Maximum allowed occurrences.' },
  },
  'edge.invalid-id': {
    actual: { type: 'json-value', unit: 'identifier', description: 'Rejected edge ID.' },
    limit: { type: 'string', unit: 'expected-shape', description: 'Required edge ID contract.' },
  },
  'edge.duplicate-id': {
    actual: { type: 'integer', unit: 'occurrences', description: 'Number of occurrences.' },
    limit: { type: 'integer', unit: 'occurrences', description: 'Maximum allowed occurrences.' },
  },
  'edge.invalid-endpoint': {
    actual: {
      type: 'object',
      unit: 'node-ids',
      description: 'Resolved sourceId and targetId.',
      schema: {
        type: 'object',
        additionalProperties: false,
        required: ['sourceId', 'targetId'],
        properties: {
          sourceId: { type: ['string', 'null'] },
          targetId: { type: ['string', 'null'] },
        },
      },
    },
    limit: { type: 'string', unit: 'expected-reference', description: 'Required endpoint contract.' },
  },
  'edge.invalid-points': {
    actual: { type: 'json-value', unit: 'route-points', description: 'Rejected route points.' },
    limit: { type: 'string', unit: 'expected-shape', description: 'Required route-point contract.' },
  },
  'edge.too-long': {
    actual: { type: 'number', unit: 'normalization-ratio', description: 'Route length ratio.' },
    limit: { type: 'number', unit: 'normalization-ratio', policyField: 'maxEdgeLengthRatio' },
  },
  'edge.node-intersection': {
    actual: { type: 'integer', unit: 'intersection', description: 'Detected interior intersection.' },
    limit: { type: 'integer', unit: 'intersection', description: 'Allowed interior intersections.' },
  },
  'edge.crossing': {
    actual: { type: 'integer', unit: 'crossing', description: 'Detected remote crossing.' },
    limit: { type: 'integer', unit: 'crossing', description: 'Allowed remote crossings per edge pair.' },
  },
  'layout.analysis-budget-exceeded': {
    actual: {
      type: 'integer',
      unit: 'primitive-geometry-comparisons',
      description: 'Required worst-case primitive geometry comparisons.',
    },
    limit: {
      type: 'integer',
      unit: 'primitive-geometry-comparisons',
      policyField: 'maxPairChecks',
    },
  },
  'layout.numeric-underflow': {
    actual: {
      type: 'object',
      unit: 'derived-metric',
      description: 'Non-zero derived value whose IEEE-754 materialization collapsed to zero.',
      schema: {
        type: 'object',
        additionalProperties: false,
        required: ['metric', 'operands', 'roundedValue'],
        properties: {
          metric: {
            enum: [
              'node-overlap-area',
              'edge-length-ratio',
              'edge-average-length-ratio',
              'implicit-edge-center-route',
              'nearest-neighbor-ratio',
              'nearest-neighbor-average-ratio',
              'parent-distance-ratio',
              'parent-average-distance-ratio',
              'viewport-fit-scale',
              'viewport-rendered-node-size',
              'stability-shift-ratio',
              'stability-translation-x',
              'stability-translation-y',
              'stability-average-shift-ratio',
            ],
          },
          operands: {
            type: 'array',
            minItems: 2,
            items: { type: 'number', exclusiveMinimum: 0 },
            description: 'Positive source magnitudes plus the normalization scale or aggregate divisor.',
          },
          roundedValue: { const: 0 },
        },
      },
    },
    limit: {
      type: 'string',
      unit: 'numeric-contract',
      description: 'Required representability of a non-zero derived value.',
    },
  },
  'node.overlap': {
    actual: { type: 'number', unit: 'square-layout-units', description: 'Node intersection area.' },
    limit: { type: 'number', unit: 'square-layout-units', policyField: 'overlapTolerance' },
  },
  'node.too-distant': {
    actual: { type: 'number', unit: 'normalization-ratio', description: 'Nearest-neighbor distance ratio.' },
    limit: { type: 'number', unit: 'normalization-ratio', policyField: 'maxNearestNeighborDistanceRatio' },
  },
  'viewport.invalid': {
    actual: { type: 'json-value', unit: 'viewport', description: 'Rejected viewport value.' },
    limit: { type: 'string', unit: 'expected-shape', description: 'Required viewport geometry.' },
  },
  'viewport.node-too-small': {
    actual: { type: 'number', unit: 'viewport-units', description: 'Rendered minimum node dimension.' },
    limit: { type: 'number', unit: 'viewport-units', policyField: 'minRenderedNodeSize' },
  },
  'layout.unstable': {
    actual: { type: 'number', unit: 'normalization-ratio', description: 'Translation-aligned shift ratio.' },
    limit: { type: 'number', unit: 'normalization-ratio', policyField: 'maxStabilityShiftRatio' },
  },
};

function payloadValueSchema(descriptor) {
  if (descriptor.schema) return descriptor.schema;
  if (descriptor.type === 'json-value') return { $ref: '#/$defs/jsonValue' };
  let schema = { type: descriptor.type };
  if (descriptor.type === 'number' || descriptor.type === 'integer') schema.minimum = 0;
  if (descriptor.items) schema.items = { type: descriptor.items };
  return schema;
}

export const GRAPH_LAYOUT_QUALITY_RULES = graphLayoutQualityRuleDefinitions.map((rule) => ({
  ...rule,
  payload: {
    actual: {
      ...rulePayloads[rule.id].actual,
      schema: payloadValueSchema(rulePayloads[rule.id].actual),
    },
    limit: {
      ...rulePayloads[rule.id].limit,
      schema: payloadValueSchema(rulePayloads[rule.id].limit),
    },
  },
}));

export const GRAPH_LAYOUT_QUALITY_POLICY_FIELDS = {
  maxEdgeLengthRatio: {
    type: 'number',
    minimum: 0,
    default: GRAPH_LAYOUT_QUALITY_DEFAULT_POLICY.maxEdgeLengthRatio,
    description: 'Maximum route length divided by the normalization unit.',
  },
  maxNearestNeighborDistanceRatio: {
    type: 'number',
    minimum: 0,
    default: GRAPH_LAYOUT_QUALITY_DEFAULT_POLICY.maxNearestNeighborDistanceRatio,
    description: 'Maximum nearest-neighbor center distance divided by the normalization unit.',
  },
  maxParentDistanceRatio: {
    type: 'number',
    minimum: 0,
    default: GRAPH_LAYOUT_QUALITY_DEFAULT_POLICY.maxParentDistanceRatio,
    description: 'Maximum parent-child center distance divided by the normalization unit.',
  },
  maxStabilityShiftRatio: {
    type: 'number',
    minimum: 0,
    default: GRAPH_LAYOUT_QUALITY_DEFAULT_POLICY.maxStabilityShiftRatio,
    description: 'Maximum translation-aligned baseline shift divided by the normalization unit.',
  },
  minRenderedNodeSize: {
    type: 'number',
    minimum: 0,
    default: GRAPH_LAYOUT_QUALITY_DEFAULT_POLICY.minRenderedNodeSize,
    description: 'Minimum node width or height after fit-to-viewport scaling, in viewport units.',
  },
  overlapTolerance: {
    type: 'number',
    minimum: 0,
    default: GRAPH_LAYOUT_QUALITY_DEFAULT_POLICY.overlapTolerance,
    description: 'Maximum allowed node intersection area in squared layout units.',
  },
  maxPairChecks: {
    type: 'integer',
    minimum: 0,
    maximum: Number.MAX_SAFE_INTEGER,
    default: GRAPH_LAYOUT_QUALITY_DEFAULT_POLICY.maxPairChecks,
    description: 'Maximum worst-case primitive geometry comparisons reserved for deterministic checks.',
  },
  idealEdgeLength: {
    type: ['number', 'null'],
    minimum: GRAPH_LAYOUT_QUALITY_NUMERIC_DOMAIN.sizeMinimum,
    maximum: GRAPH_LAYOUT_QUALITY_NUMERIC_DOMAIN.sizeMaximum,
    default: GRAPH_LAYOUT_QUALITY_DEFAULT_POLICY.idealEdgeLength,
    description: 'Absolute normalization unit inside the numeric domain, or null to use median node diagonal.',
  },
};

let nonNegativeNumber = { type: 'number', minimum: 0 };
let nonNegativeInteger = { type: 'integer', minimum: 0 };
let positiveNumber = { type: 'number', exclusiveMinimum: 0 };
let stringId = {
  type: 'string',
  minLength: 1,
  pattern: '^\\S(?:[\\s\\S]*\\S)?$',
  description: 'Canonical ID without leading or trailing whitespace.',
};
let inputCoordinate = {
  type: 'number',
  minimum: -GRAPH_LAYOUT_QUALITY_NUMERIC_DOMAIN.coordinateMaximum,
  maximum: GRAPH_LAYOUT_QUALITY_NUMERIC_DOMAIN.coordinateMaximum,
};
let inputDimension = {
  type: 'number',
  minimum: GRAPH_LAYOUT_QUALITY_NUMERIC_DOMAIN.sizeMinimum,
  maximum: GRAPH_LAYOUT_QUALITY_NUMERIC_DOMAIN.sizeMaximum,
};
let inputNonNegativeSize = {
  type: 'number',
  minimum: 0,
  maximum: GRAPH_LAYOUT_QUALITY_NUMERIC_DOMAIN.sizeMaximum,
};
let ruleIds = GRAPH_LAYOUT_QUALITY_RULES.map((rule) => rule.id);
let ruleIdsByEffect = Object.fromEntries(['warn', 'fail', 'incomplete'].map((effect) => [
  effect,
  GRAPH_LAYOUT_QUALITY_RULES.filter((rule) => rule.effect === effect).map((rule) => rule.id),
]));
let resolvedPolicyKeys = Object.keys(GRAPH_LAYOUT_QUALITY_DEFAULT_POLICY);

export const GRAPH_LAYOUT_QUALITY_REPORT_INVARIANTS = Object.freeze({
  statusPrecedence: Object.freeze(['incomplete', 'fail', 'warn', 'pass']),
  collectionConservation: 'total === analyzedIds.length + skippedCount',
  unidentifiedSubset: '0 <= unidentifiedCount <= skippedCount',
  checkCoverage: 'status=complete means every required entity pair was evaluated; status=skipped-budget means none were evaluated',
  findingContract: 'ruleId determines severity and the actual/limit payload schemas',
});

export const GRAPH_LAYOUT_QUALITY_SCHEMA = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'https://rnd-pro.github.io/symbiote-ui/schemas/graph-layout-quality-v1.json',
  title: 'Symbiote Graph Layout Quality Report',
  description: 'Deterministic quality report for a settled 2D graph layout.',
  type: 'object',
  additionalProperties: false,
  required: [
    'version', 'status', 'pass', 'complete', 'normalization', 'policy',
    'metrics', 'coverage', 'findings',
  ],
  properties: {
    version: { const: 'graph-layout-quality-v1' },
    status: {
      enum: ['pass', 'warn', 'fail', 'incomplete'],
      description: 'Overall audit outcome; incomplete takes precedence over fail and warn.',
    },
    pass: {
      type: 'boolean',
      description: 'True only when analysis is complete and has no objective failure.',
    },
    complete: {
      type: 'boolean',
      description: 'False when input, numeric representability, or deterministic coverage was incomplete.',
    },
    normalization: { $ref: '#/$defs/normalization' },
    policy: { $ref: '#/$defs/resolvedPolicy' },
    metrics: { $ref: '#/$defs/metrics' },
    coverage: { $ref: '#/$defs/coverage' },
    findings: { type: 'array', items: { $ref: '#/$defs/finding' } },
  },
  allOf: [
    {
      if: { properties: { status: { const: 'pass' } } },
      then: {
        properties: {
          pass: { const: true },
          complete: { const: true },
          findings: { type: 'array', maxItems: 0 },
        },
      },
    },
    {
      if: { properties: { status: { const: 'warn' } } },
      then: {
        properties: {
          pass: { const: true },
          complete: { const: true },
          findings: {
            type: 'array',
            minItems: 1,
            items: {
              type: 'object',
              properties: { ruleId: { enum: ruleIdsByEffect.warn } },
            },
          },
        },
      },
    },
    {
      if: { properties: { status: { const: 'fail' } } },
      then: {
        properties: {
          pass: { const: false },
          complete: { const: true },
          findings: {
            type: 'array',
            minItems: 1,
            items: {
              type: 'object',
              properties: {
                ruleId: { enum: [...ruleIdsByEffect.warn, ...ruleIdsByEffect.fail] },
              },
            },
            contains: {
              type: 'object',
              properties: { ruleId: { enum: ruleIdsByEffect.fail } },
            },
            minContains: 1,
          },
        },
      },
    },
    {
      if: { properties: { status: { const: 'incomplete' } } },
      then: {
        properties: {
          pass: { const: false },
          complete: { const: false },
          findings: {
            type: 'array',
            minItems: 1,
            contains: {
              type: 'object',
              properties: { ruleId: { enum: ruleIdsByEffect.incomplete } },
            },
            minContains: 1,
          },
        },
      },
    },
    {
      if: {
        properties: {
          coverage: {
            type: 'object',
            required: ['checks'],
            properties: {
              checks: {
                type: 'object',
                anyOf: ['nodePairs', 'edgeNodePairs', 'edgePairs'].map((key) => ({
                  type: 'object',
                  required: [key],
                  properties: {
                    [key]: {
                      type: 'object',
                      required: ['status'],
                      properties: { status: { const: 'skipped-budget' } },
                    },
                  },
                })),
              },
            },
          },
        },
      },
      then: {
        properties: {
          status: { const: 'incomplete' },
          findings: {
            type: 'array',
            contains: {
              type: 'object',
              properties: { ruleId: { const: 'layout.analysis-budget-exceeded' } },
            },
            minContains: 1,
          },
        },
      },
    },
  ],
  $defs: {
    point: {
      type: 'object',
      additionalProperties: false,
      required: ['x', 'y'],
      properties: { x: { type: 'number' }, y: { type: 'number' } },
    },
    bounds: {
      type: 'object',
      additionalProperties: false,
      required: ['x', 'y', 'width', 'height'],
      properties: {
        x: { type: 'number' },
        y: { type: 'number' },
        width: positiveNumber,
        height: positiveNumber,
      },
    },
    inputPoint: {
      type: 'object',
      additionalProperties: false,
      required: ['x', 'y'],
      properties: { x: inputCoordinate, y: inputCoordinate },
    },
    inputBounds: {
      type: 'object',
      additionalProperties: false,
      description: 'Bounds must also satisfy x + width > x and y + height > y in IEEE-754 arithmetic; violations are reported as incomplete semantic findings.',
      required: ['x', 'y', 'width', 'height'],
      properties: {
        x: inputCoordinate,
        y: inputCoordinate,
        width: inputDimension,
        height: inputDimension,
      },
    },
    node: {
      type: 'object',
      additionalProperties: false,
      required: ['id', 'bounds'],
      properties: {
        id: stringId,
        parentId: stringId,
        bounds: { $ref: '#/$defs/inputBounds' },
      },
    },
    edge: {
      type: 'object',
      additionalProperties: false,
      required: ['id', 'sourceId', 'targetId'],
      properties: {
        id: stringId,
        sourceId: stringId,
        targetId: stringId,
        points: {
          type: 'array',
          minItems: 2,
          items: { $ref: '#/$defs/inputPoint' },
        },
      },
    },
    baselineArrayNode: {
      oneOf: [
        {
          type: 'object',
          additionalProperties: false,
          required: ['id', 'bounds'],
          properties: { id: stringId, bounds: { $ref: '#/$defs/inputBounds' } },
        },
        {
          type: 'object',
          additionalProperties: false,
          required: ['id', 'x', 'y', 'width', 'height'],
          properties: {
            id: stringId,
            x: inputCoordinate,
            y: inputCoordinate,
            width: inputDimension,
            height: inputDimension,
          },
        },
      ],
    },
    baselineMapNode: {
      oneOf: [
        { $ref: '#/$defs/inputBounds' },
        {
          type: 'object',
          additionalProperties: false,
          required: ['bounds'],
          properties: { bounds: { $ref: '#/$defs/inputBounds' } },
        },
      ],
    },
    inputPolicy: {
      type: 'object',
      additionalProperties: false,
      properties: GRAPH_LAYOUT_QUALITY_POLICY_FIELDS,
    },
    resolvedPolicy: {
      type: 'object',
      additionalProperties: false,
      required: resolvedPolicyKeys,
      properties: GRAPH_LAYOUT_QUALITY_POLICY_FIELDS,
    },
    input: {
      type: 'object',
      additionalProperties: false,
      required: ['version', 'nodes'],
      properties: {
        version: { const: 'graph-layout-snapshot-v1' },
        nodes: { type: 'array', items: { $ref: '#/$defs/node' } },
        edges: { type: 'array', items: { $ref: '#/$defs/edge' } },
        viewport: {
          type: 'object',
          additionalProperties: false,
          required: ['width', 'height'],
          properties: {
            width: inputDimension,
            height: inputDimension,
            padding: {
              ...inputNonNegativeSize,
              description: 'Must be smaller than half of both viewport dimensions.',
            },
          },
        },
        baseline: {
          type: 'object',
          additionalProperties: false,
          required: ['nodes'],
          properties: {
            nodes: {
              anyOf: [
                {
                  type: 'array',
                  items: { $ref: '#/$defs/baselineArrayNode' },
                },
                {
                  type: 'object',
                  propertyNames: stringId,
                  additionalProperties: { $ref: '#/$defs/baselineMapNode' },
                },
              ],
            },
          },
        },
        policy: { $ref: '#/$defs/inputPolicy' },
      },
    },
    normalization: {
      type: 'object',
      additionalProperties: false,
      required: ['basis', 'unit'],
      properties: {
        basis: {
          enum: [
            'empty-layout-default',
            'median-node-diagonal',
            'ideal-edge-length-override',
          ],
        },
        unit: positiveNumber,
      },
    },
    nodeMetrics: {
      type: 'object',
      additionalProperties: false,
      required: ['total', 'analyzed', 'overlaps'],
      properties: {
        total: nonNegativeInteger,
        analyzed: nonNegativeInteger,
        overlaps: nonNegativeInteger,
      },
    },
    edgeMetrics: {
      type: 'object',
      additionalProperties: false,
      required: [
        'total', 'analyzed', 'nodeIntersections', 'crossings',
        'averageLengthRatio', 'maxLengthRatio',
      ],
      properties: {
        total: nonNegativeInteger,
        analyzed: nonNegativeInteger,
        nodeIntersections: nonNegativeInteger,
        crossings: nonNegativeInteger,
        averageLengthRatio: nonNegativeNumber,
        maxLengthRatio: nonNegativeNumber,
      },
    },
    viewportMetrics: {
      oneOf: [
        {
          type: 'object',
          additionalProperties: false,
          required: ['provided', 'fitScale', 'minRenderedNodeSize'],
          properties: {
            provided: { const: false },
            fitScale: { type: 'null' },
            minRenderedNodeSize: { type: 'null' },
          },
        },
        {
          type: 'object',
          additionalProperties: false,
          required: [
            'provided', 'width', 'height', 'padding', 'fitScale',
            'minRenderedNodeSize',
          ],
          properties: {
            provided: { const: true },
            width: positiveNumber,
            height: positiveNumber,
            padding: nonNegativeNumber,
            fitScale: { type: 'number', minimum: 0, maximum: 1 },
            minRenderedNodeSize: {
              anyOf: [nonNegativeNumber, { type: 'null' }],
            },
          },
        },
      ],
    },
    metrics: {
      type: 'object',
      additionalProperties: false,
      required: [
        'nodes', 'edges', 'bounds', 'nearestNeighborDistance',
        'viewport', 'locality', 'stability',
      ],
      properties: {
        nodes: { $ref: '#/$defs/nodeMetrics' },
        edges: { $ref: '#/$defs/edgeMetrics' },
        bounds: {
          anyOf: [{ $ref: '#/$defs/bounds' }, { type: 'null' }],
        },
        nearestNeighborDistance: {
          type: 'object',
          additionalProperties: false,
          required: ['count', 'averageRatio', 'maxRatio'],
          properties: {
            count: nonNegativeInteger,
            averageRatio: nonNegativeNumber,
            maxRatio: nonNegativeNumber,
          },
        },
        viewport: { $ref: '#/$defs/viewportMetrics' },
        locality: {
          type: 'object',
          additionalProperties: false,
          required: ['count', 'averageDistanceRatio'],
          properties: {
            count: nonNegativeInteger,
            averageDistanceRatio: nonNegativeNumber,
          },
        },
        stability: {
          type: 'object',
          additionalProperties: false,
          required: [
            'count', 'translation', 'averageShiftRatio', 'maxShiftRatio',
          ],
          properties: {
            count: nonNegativeInteger,
            translation: { $ref: '#/$defs/point' },
            averageShiftRatio: nonNegativeNumber,
            maxShiftRatio: nonNegativeNumber,
          },
        },
      },
    },
    coverageCollection: {
      type: 'object',
      additionalProperties: false,
      description: 'Entity coverage; skippedIds contains only canonical IDs, while counts include malformed and duplicate entries.',
      required: [
        'total', 'analyzedIds', 'skippedIds', 'skippedCount', 'unidentifiedCount',
      ],
      properties: {
        total: nonNegativeInteger,
        analyzedIds: { type: 'array', uniqueItems: true, items: stringId },
        skippedIds: { type: 'array', uniqueItems: true, items: stringId },
        skippedCount: {
          ...nonNegativeInteger,
          description: 'Total skipped input entries, including every duplicate occurrence.',
        },
        unidentifiedCount: {
          ...nonNegativeInteger,
          description: 'Skipped entries that had no canonical ID and therefore do not appear in skippedIds.',
        },
      },
      allOf: [{
        if: { properties: { total: { const: 0 } } },
        then: {
          properties: {
            analyzedIds: { type: 'array', maxItems: 0 },
            skippedIds: { type: 'array', maxItems: 0 },
            skippedCount: { type: 'integer', const: 0 },
            unidentifiedCount: { type: 'integer', const: 0 },
          },
        },
      }],
    },
    checkCounter: {
      type: 'object',
      additionalProperties: false,
      required: ['required', 'status', 'budgetCost'],
      properties: {
        required: nonNegativeInteger,
        status: { enum: ['complete', 'skipped-budget'] },
        budgetCost: {
          ...nonNegativeInteger,
          description: 'Worst-case primitive geometry comparisons required for this check family.',
        },
      },
      allOf: [{
        if: { properties: { status: { const: 'skipped-budget' } } },
        then: { properties: { required: { type: 'integer', minimum: 1 } } },
      }],
    },
    coverage: {
      type: 'object',
      additionalProperties: false,
      required: ['nodes', 'edges', 'baseline', 'checks'],
      properties: {
        nodes: { $ref: '#/$defs/coverageCollection' },
        edges: { $ref: '#/$defs/coverageCollection' },
        baseline: { $ref: '#/$defs/coverageCollection' },
        checks: {
          type: 'object',
          additionalProperties: false,
          required: ['nodePairs', 'edgeNodePairs', 'edgePairs'],
          properties: {
            nodePairs: { $ref: '#/$defs/checkCounter' },
            edgeNodePairs: { $ref: '#/$defs/checkCounter' },
            edgePairs: { $ref: '#/$defs/checkCounter' },
          },
        },
      },
    },
    finding: {
      type: 'object',
      additionalProperties: false,
      required: ['id', 'ruleId', 'severity', 'actual', 'limit', 'message'],
      properties: {
        id: stringId,
        ruleId: { enum: ruleIds },
        severity: { enum: ['error', 'warning'] },
        nodeIds: { type: 'array', uniqueItems: true, items: stringId },
        edgeIds: { type: 'array', uniqueItems: true, items: stringId },
        actual: { $ref: '#/$defs/jsonValue' },
        limit: { $ref: '#/$defs/jsonValue' },
        message: { type: 'string', minLength: 1 },
      },
      allOf: GRAPH_LAYOUT_QUALITY_RULES.map((rule) => ({
        if: {
          required: ['ruleId'],
          properties: { ruleId: { const: rule.id } },
        },
        then: {
          properties: {
            severity: { const: rule.severity },
            actual: rule.payload.actual.schema,
            limit: rule.payload.limit.schema,
          },
        },
      })),
    },
    jsonValue: {
      anyOf: [
        { type: 'null' },
        { type: 'boolean' },
        { type: 'number' },
        { type: 'string' },
        { type: 'array', items: { $ref: '#/$defs/jsonValue' } },
        {
          type: 'object',
          additionalProperties: { $ref: '#/$defs/jsonValue' },
        },
      ],
    },
  },
};

export const GRAPH_ANALYSIS_CATALOG = [
  {
    id: 'graph.layout.audit',
    title: 'Audit graph layout quality',
    description: 'Analyze settled graph geometry without mutating graph or viewport state.',
    function: 'analyzeGraphLayout',
    specifier: 'symbiote-ui/graph',
    runtime: 'node-safe',
    inputVersion: 'graph-layout-snapshot-v1',
    reportVersion: 'graph-layout-quality-v1',
    schemas: {
      input: 'schemas/graph-layout-quality-v1.json#/$defs/input',
      output: 'schemas/graph-layout-quality-v1.json',
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    statusSemantics: {
      pass: 'Analysis completed without objective failures or warnings.',
      warn: 'Analysis completed; one or more non-blocking quality rules need attention.',
      fail: 'Analysis completed and found an objective overlap or node-route intersection.',
      incomplete: 'Input, numeric representability, or deterministic coverage was incomplete; the layout must not be accepted.',
    },
    rules: GRAPH_LAYOUT_QUALITY_RULES,
    defaultPolicy: GRAPH_LAYOUT_QUALITY_DEFAULT_POLICY,
    policyFields: GRAPH_LAYOUT_QUALITY_POLICY_FIELDS,
    numericDomain: GRAPH_LAYOUT_QUALITY_NUMERIC_DOMAIN,
    reportInvariants: GRAPH_LAYOUT_QUALITY_REPORT_INVARIANTS,
    cli: {
      command: 'layout-audit',
      usage: 'symbiote-ui layout-audit <graph-layout-snapshot.json>',
    },
  },
];

export function listGraphAnalysisOperations() {
  return structuredClone(GRAPH_ANALYSIS_CATALOG);
}

export function getGraphAnalysisOperation(id) {
  let operation = GRAPH_ANALYSIS_CATALOG.find((item) => item.id === id);
  if (!operation) {
    let available = GRAPH_ANALYSIS_CATALOG.map((item) => item.id).join(', ');
    throw new Error(`Unknown graph analysis operation "${id}". Available operations: ${available}`);
  }
  return structuredClone(operation);
}
