/**
 * flow/loop — Iteration node
 *
 * Iterates over an array, executing a body function for each item.
 * The bodyType param specifies which registered node type to execute per item.
 *
 * @module symbiote-engine/packs/flow/loop
 */

import { getNodeType } from '../../Registry.js';

export default {
  type: 'flow/loop',
  category: 'flow',
  icon: 'loop',

  driver: {
    description: 'Iterate over array — execute body per item',
    inputs: [{ name: 'items', type: 'array' }],
    outputs: [{ name: 'results', type: 'array' }],
    params: {
      bodyType: { type: 'string', default: '', description: 'Node type to execute per item' },
    },
  },

  lifecycle: {
    validate: (inputs) => Array.isArray(inputs.items),
    execute: async (inputs, params) => {
      let { items } = inputs;
      let { bodyType } = params;
      let results = [];

      if (!bodyType) {

        return { results: items };
      }

      let typeDef = getNodeType(bodyType);
      let executeFn = typeDef?.lifecycle?.execute || typeDef?.process;

      if (!executeFn) {
        return { results: items };
      }

      for (let i = 0; i < items.length; i++) {
        let itemInput = { value: items[i], index: i, total: items.length };
        let itemResult = await executeFn(itemInput, params);
        results.push(itemResult);
      }

      return { results };
    },
  },
};
