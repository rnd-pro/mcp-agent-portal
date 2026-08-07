/**
 * flow/wait-all — Barrier node
 *
 * Waits for all non-null inputs and merges them into a single object.
 * Acts as a synchronization point for parallel branches.
 *
 * @module symbiote-engine/packs/flow/wait-all
 */

export default {
  type: 'flow/wait-all',
  category: 'flow',
  icon: 'join',

  driver: {
    description: 'Barrier — merge all inputs into one object',
    inputs: [
      { name: 'a', type: 'any' },
      { name: 'b', type: 'any' },
      { name: 'c', type: 'any' },
    ],
    outputs: [{ name: 'output', type: 'object' }],
    params: {},
  },

  lifecycle: {
    execute: (inputs) => {
      let output = {};
      for (const [key, val] of Object.entries(inputs)) {
        if (val != null) {
          output[key] = val;
        }
      }
      return { output };
    },
  },
};
