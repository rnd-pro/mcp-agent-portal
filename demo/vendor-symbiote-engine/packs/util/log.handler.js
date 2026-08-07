/**
 * util/log — Console logger passthrough
 *
 * Logs input value to console and passes it through unchanged.
 * Useful for debugging pipelines.
 *
 * @module symbiote-engine/packs/util/log */

export default {
  type: 'util/log',
  category: 'util',
  icon: 'terminal',

  driver: {
    description: 'Log value to console and pass through',
    inputs: [{ name: 'value', type: 'any' }],
    outputs: [{ name: 'value', type: 'any' }],
    params: {
      label: { type: 'string', default: '', description: 'Log label prefix' },
      level: {
        type: 'string',
        default: 'info',
        description: 'Log level: log | info | warn | error',
      },
    },
  },

  lifecycle: {
    validate: () => true,
    cacheKey: null,

    execute: async (inputs, params) => {
      let label = params.label ? `[${params.label}]` : '[symbiote-engine]';
      const method = params.level || 'info';

      let logFn = console[method] || console.log;
      logFn(
        label,
        typeof inputs.value === 'object' ? JSON.stringify(inputs.value, null, 2) : inputs.value
      );

      return { value: inputs.value };
    },
  },
};
