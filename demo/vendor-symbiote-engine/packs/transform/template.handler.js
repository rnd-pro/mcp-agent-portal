/**
 * transform/template — String template interpolation
 *
 * Replaces {{variable}} placeholders in template string with values from data object.
 * Supports nested access via dot notation: {{user.name}}.
 *
 * @module symbiote-engine/packs/transform/template
 */

export default {
  type: 'transform/template',
  category: 'transform',
  icon: 'text_snippet',

  driver: {
    description: 'Template interpolation — replace {{var}} with data values',
    inputs: [
      { name: 'template', type: 'string' },
      { name: 'data', type: 'any' },
    ],
    outputs: [
      { name: 'result', type: 'string' },
      { name: 'data', type: 'any' },
    ],
    params: {
      template: { type: 'textarea', default: '', description: 'Message template ({{var}} syntax)' },
      replyMarkup: {
        type: 'textarea',
        default: '',
        description: 'Inline keyboard JSON (Telegram reply_markup)',
      },
    },
  },

  lifecycle: {


    cacheKey: (inputs) => `tpl:${inputs.template}:${JSON.stringify(inputs.data)}`,

    execute: async (inputs, params) => {
      let template = params?.template || inputs.template;
      let { data } = inputs;

      let result = template.replace(/\{\{([^}]+)\}\}/g, (match, key) => {
        let trimmed = key.trim();

        let value = trimmed.split('.').reduce((obj, k) => {
          if (obj === null || obj === undefined) return undefined;
          return obj[k];
        }, data);

        if (value === undefined) {
          console.log(
            `🟡 [template] Missing variable "${trimmed}" in data keys: [${data ? Object.keys(data).join(', ') : 'NO DATA'}]`
          );
          return match;
        }
        if (typeof value === 'object') return JSON.stringify(value);
        return String(value);
      });


      let outputField = params?.outputField || 'text';
      let outputData = { ...(typeof data === 'object' ? data : {}), [outputField]: result };


      if (params?.replyMarkup) {
        try {
          outputData.reply_markup = JSON.parse(params.replyMarkup);
        } catch (e) {
          console.log('🟡 [template] Invalid replyMarkup JSON:', e.message);
        }
      }

      return {
        result,
        data: outputData,
      };
    },
  },
};
