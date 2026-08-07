/**
 * debug/inject — Manual data injection node.
 *
 * Provides a textarea for arbitrary JSON data and a Fire button
 * to push data downstream. Use for testing any part of a workflow
 * by connecting to the target node's input.
 *
 * @module symbiote-engine/packs/debug/inject
 */

export default {
  type: 'debug/inject',
  category: 'debug',
  icon: 'play_circle',

  driver: {
    description: 'Inject test data — connect to any node input for manual testing',
    capabilities: ['debug', 'trigger'],
    inputs: [],
    outputs: [{ name: 'data', type: 'exec' }],
    params: {
      label: { type: 'string', default: 'Test Data', description: 'Display label' },
      data: {
        type: 'textarea',
        default:
          '{\n  "status": "created",\n  "region": "RU",\n  "smsCount": 100,\n  "clientName": "Test Client"\n}',
        description: 'JSON payload to inject',
      },
    },
    /** Mark as fireable — UI shows ▶ Fire button */
    fireable: true,
  },

  lifecycle: {
    validate: (inputs, params) => {
      try {
        JSON.parse(params.data || '{}');
        return true;
      } catch {
        return false;
      }
    },

    async execute(inputs, params) {
      let payload;
      try {
        payload = JSON.parse(params.data || '{}');
      } catch {
        return { data: { error: 'Invalid JSON in inject data' } };
      }

      return { data: payload };
    },
  },
};
