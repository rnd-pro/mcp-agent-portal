/**
 * transform/set — Field mapping and value assignment
 *
 * Sets fields on the output data object. Values can be:
 * - Static values: "hello"
 * - References to input fields: "={{fieldName}}"
 * - Simple expressions: "={{items.length}}"
 *
 * Like n8n's "Set" node — reshapes data between nodes.
 *
 * @module symbiote-engine/packs/transform/set
 */

export default {
  type: 'transform/set',
  category: 'transform',
  icon: 'edit_note',

  driver: {
    description: 'Set or map fields on the data object',
    inputs: [{ name: 'data', type: 'any' }],
    outputs: [{ name: 'data', type: 'any' }],
    params: {
      fields: {
        type: 'object',
        default: {},
        description: 'Map of fieldName → value or ={{expression}}',
      },
      keepOriginal: { type: 'boolean', default: true, description: 'Keep original input fields' },
    },
  },

  lifecycle: {
    execute: async (inputs, params) => {
      let inputData = inputs.data || {};
      let base = params.keepOriginal ? { ...inputData } : {};

      for (const [key, rawValue] of Object.entries(params.fields || {})) {
        if (typeof rawValue === 'string' && rawValue.startsWith('={{') && rawValue.endsWith('}}')) {

          let expr = rawValue.slice(3, -2).trim();

          let value = expr.split('.').reduce((obj, k) => {
            if (obj === null || obj === undefined) return undefined;
            return obj[k];
          }, inputData);
          base[key] = value;
        } else {

          base[key] = rawValue;
        }
      }

      return { data: base };
    },
  },
};
