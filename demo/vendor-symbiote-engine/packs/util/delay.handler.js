/**
 * util/delay — Pause pipeline execution
 *
 * Waits for specified milliseconds, then passes input value through.
 * Useful for rate limiting, animation timing, and API cooldowns.
 *
 * @module symbiote-engine/packs/util/delay
 */

export default {
  type: 'util/delay',
  category: 'util',
  icon: 'hourglass_empty',

  driver: {
    description: 'Pause execution for N milliseconds, pass value through',
    inputs: [{ name: 'value', type: 'any' }],
    outputs: [{ name: 'value', type: 'any' }],
    params: {
      ms: { type: 'int', default: 1000, description: 'Delay in milliseconds' },
    },
  },

  lifecycle: {
    validate: () => true,


    cacheKey: null,

    execute: async (inputs, params) => {
      await new Promise((resolve) => setTimeout(resolve, params.ms || 1000));
      return { value: inputs.value };
    },
  },
};
