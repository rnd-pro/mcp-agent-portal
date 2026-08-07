/**
 * transform/json-parse — Parse JSON string to object
 *
 * Safely parses JSON input. Returns error instead of throwing.
 *
 * @module symbiote-engine/packs/transform/json-parse
 */

export default {
  type: 'transform/json-parse',
  category: 'transform',
  icon: 'data_object',

  driver: {
    description: 'Parse JSON string to object',
    inputs: [{ name: 'input', type: 'string' }],
    outputs: [
      { name: 'result', type: 'any' },
      { name: 'error', type: 'string' },
    ],
    params: {},
  },

  lifecycle: {
    validate: (inputs) => {
      if (inputs.input === undefined || inputs.input === null) return false;
      return true;
    },

    cacheKey: (inputs) => `json:${inputs.input}`,

    execute: async (inputs) => {
      try {
        let result = JSON.parse(inputs.input);
        return { result, error: null };
      } catch (err) {
        return { result: null, error: err.message };
      }
    },
  },
};
