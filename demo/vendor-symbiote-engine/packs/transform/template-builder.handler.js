/**
 * transform/template-builder — Visual template builder with dynamic field discovery
 *
 * Combines UE Blueprint "Format Text" pattern (auto-pin from {placeholders})
 * with n8n live preview and ComfyUI inline editing.
 *
 * Parses {placeholder} syntax in template string, resolves values from
 * upstream data, and produces interpolated text output.
 *
 * @module symbiote-engine/packs/transform/template-builder */

/**
 * Extract placeholder names from template string.
 * Supports both {var} and {{var}} syntax.
 *
 * @param {string} template
 * @returns {string[]} Unique placeholder names
 */
function extractPlaceholders(template) {
  if (!template) return [];
  let matches = new Set();

  let regex = /\{\{?([^{}]+)\}?\}/g;
  let m;
  while ((m = regex.exec(template)) !== null) {
    matches.add(m[1].trim());
  }
  return [...matches];
}

/**
 * Resolve a dot-notation path in an object.
 *
 * @param {Object} obj - Data object
 * @param {string} path - Dot-separated path (e.g., 'user.name')
 * @returns {*} Resolved value or undefined
 */
function resolvePath(obj, path) {
  return path.split('.').reduce((o, k) => {
    if (o === null || o === undefined) return undefined;
    return o[k];
  }, obj);
}

export default {
  type: 'transform/template-builder',
  category: 'transform',
  icon: 'edit_note',

  driver: {
    description:
      'Visual template builder — write text with {placeholders}, auto-discovers input fields',
    inputs: [
      { name: 'data', type: 'any', description: 'Input data object with fields to interpolate' },
    ],
    outputs: [
      { name: 'text', type: 'string', description: 'Interpolated text result' },
      { name: 'data', type: 'any', description: 'Full data context with text field added' },
    ],
    params: {
      template: {
        type: 'textarea',
        default: '',
        description: 'Template with {placeholder} syntax. Fields auto-create input pins.',
      },
      outputField: {
        type: 'string',
        default: 'text',
        description: 'Field name for the interpolated text in output data',
      },
    },

    /**
     * Dynamic outputs metadata — called by Inspector to show available placeholders.
     *
     * @param {Object} params - Current node params
     * @returns {{ placeholders: string[] }}
     */
    meta: (params) => ({
      placeholders: extractPlaceholders(params?.template),
    }),
  },

  lifecycle: {
    cacheKey: (inputs, params) => `tpl-builder:${params?.template}:${JSON.stringify(inputs.data)}`,

    /**
     * Execute template interpolation.
     *
     * @param {{ data: Object }} inputs - Upstream data
     * @param {{ template: string, outputField: string }} params - Node params
     * @returns {{ text: string, data: Object }}
     */
    execute: async (inputs, params) => {
      let template = params?.template;
      if (!template) {
        console.log('🟡 [template-builder] Empty template');
        return { text: '', data: inputs.data ?? {} };
      }

      let data = inputs.data ?? {};
      let placeholders = extractPlaceholders(template);


      let text = template.replace(/\{\{?([^{}]+)\}?\}/g, (match, key) => {
        let trimmed = key.trim();
        let value = resolvePath(data, trimmed);

        if (value === undefined) {
          console.log(
            `🟡 [template-builder] Missing field "${trimmed}" — available: [${Object.keys(data).join(', ')}]`
          );
          return match;
        }
        if (typeof value === 'object') return JSON.stringify(value);
        return String(value);
      });


      let resolved = placeholders.filter((p) => resolvePath(data, p) !== undefined);
      let missing = placeholders.filter((p) => resolvePath(data, p) === undefined);
      if (missing.length) {
        console.log(
          `🟡 [template-builder] ${resolved.length}/${placeholders.length} fields resolved, missing: [${missing.join(', ')}]`
        );
      }

      let outputField = params?.outputField ?? 'text';
      return {
        text,
        data: { ...(typeof data === 'object' ? data : {}), [outputField]: text },
      };
    },
  },
};


export { extractPlaceholders };
