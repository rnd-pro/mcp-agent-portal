/**
 * flow/switch — Multi-branch routing node
 *
 * Routes data to one of N case outputs based on value match.
 * Falls back to 'default' output if no case matches.
 *
 * @module symbiote-engine/packs/flow/switch
 */

export default {
  type: 'flow/switch',
  category: 'flow',
  icon: 'alt_route',

  driver: {
    description: 'Multi-branch routing by value match',
    inputs: [
      { name: 'value', type: 'any' },
      { name: 'data', type: 'any' },
    ],
    outputs: [{ name: 'default', type: 'any' }],
    params: {
      cases: { type: 'object', default: {}, description: 'Map of value → output name' },
    },
  },

  lifecycle: {
    validate: (inputs) => inputs.data !== undefined,
    execute: (inputs, params) => {
      let { data } = inputs;

      let value =
        inputs.value !== undefined
          ? inputs.value
          : params.field && data
            ? data[params.field]
            : undefined;
      let cases = params.cases;
      let hasCases = cases && Object.keys(cases).length > 0;
      let result = { default: null };

      if (hasCases) {

        for (const outputName of Object.values(cases)) {
          result[outputName] = null;
        }
        let stringValue = String(value);
        let matchedOutput = cases[stringValue];
        if (matchedOutput) {
          result[matchedOutput] = data;
          result.dynamicOutputs = Object.values(cases);
        } else {
          result.default = data;
        }
      } else {

        let outputName = String(value);
        result[outputName] = data;
        result.dynamicOutputs = [outputName];
      }

      return result;
    },
  },
};
