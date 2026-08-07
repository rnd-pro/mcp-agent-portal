/**
 * data/prompt-loader — Dynamic Markdown template assembly
 *
 * Loads and processes MD prompt templates with variable substitution
 * and recursive file includes. Supports {{VARIABLE}} placeholders and
 * {{file.md}} file includes.
 *
 * Ported from Mr-Computer/automations/argentine-spanish-bot/src/utils/prompt-loader.js
 *
 * @module symbiote-engine/packs/data/prompt-loader
 */

import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

/**
 * Process template with variables and file includes
 * @param {string} template - Template string
 * @param {Object} context - Variables to substitute
 * @param {string} baseDir - Base directory for relative includes
 * @returns {Promise<string>}
 */
async function processTemplate(template, context, baseDir) {
  let result = template;


  let fileIncludeRegex = /\{\{([a-zA-Z0-9_\-\/\.]+\.md)\}\}/g;
  let match;

  while ((match = fileIncludeRegex.exec(result)) !== null) {
    let filePath = match[1];
    let fullMatch = match[0];

    try {
      let includeContent = await readFile(path.join(baseDir, filePath), 'utf-8');

      includeContent = await processTemplate(
        includeContent,
        context,
        path.dirname(path.join(baseDir, filePath))
      );
      result = result.replace(fullMatch, includeContent);
    } catch {

    }
  }


  let variableRegex = /\{\{([A-Z_][A-Z0-9_]*)\}\}/g;

  result = result.replace(variableRegex, (fullMatch, varName) => {
    if (Object.hasOwn(context, varName)) {
      let value = context[varName];
      if (typeof value === 'string') return value;
      if (typeof value === 'number' || typeof value === 'boolean') return String(value);
      if (Array.isArray(value)) return value.join('\n');
      if (typeof value === 'object' && value !== null) return JSON.stringify(value, null, 2);
      return String(value);
    }
    return fullMatch;
  });

  return result;
}

/**
 * Validate prompt template — check for missing variables
 * @param {string} template
 * @param {Object} context
 * @returns {Array<string>}
 */
function validatePromptTemplate(template, context) {
  let variableRegex = /\{\{([A-Z_][A-Z0-9_]*)\}\}/g;
  let missing = [];
  let match;
  while ((match = variableRegex.exec(template)) !== null) {
    let varName = match[1];
    if (!Object.hasOwn(context, varName)) missing.push(varName);
  }
  return [...new Set(missing)];
}

/**
 * List available prompt templates in directory
 * @param {string} dir
 * @returns {Promise<Array<string>>}
 */
async function listPromptTemplates(dir) {
  try {
    let entries = await readdir(dir, { recursive: true });
    return entries.filter((e) => e.endsWith('.md'));
  } catch {
    return [];
  }
}


export default {
  type: 'data/prompt-loader',
  category: 'data',
  icon: 'article',

  driver: {
    description:
      'Dynamic Markdown template assembly with {{VARIABLE}} substitution and {{file.md}} includes',
    inputs: [{ name: 'template', type: 'string' }],
    outputs: [
      { name: 'result', type: 'any' },
      { name: 'error', type: 'string' },
    ],
    params: {
      operation: {
        type: 'string',
        default: 'load',
        description: 'Operation: load | load-multi | validate | list',
      },
      context: { type: 'any', default: {}, description: 'Variables map for template substitution' },
      baseDir: { type: 'string', default: '.', description: 'Base directory for file includes' },

      templates: { type: 'any', default: null, description: 'Map of {name: path} for load-multi' },

      filePath: {
        type: 'string',
        default: null,
        description: 'Path to template file (alternative to template input)',
      },
    },
  },

  lifecycle: {
    validate: (inputs, params) => {
      let op = params.operation;
      if (op === 'list') return typeof params.baseDir === 'string';
      if (op === 'load-multi')
        return typeof params.templates === 'object' && params.templates !== null;
      if (op === 'validate') return typeof inputs.template === 'string';

      return typeof inputs.template === 'string' || typeof params.filePath === 'string';
    },

    cacheKey: (inputs, params) => {
      if (params.operation === 'list') return `prompt-list:${params.baseDir}`;
      return null;
    },

    execute: async (inputs, params) => {
      let { operation, context, baseDir } = params;

      try {
        let opMap = {
          load: async () => {
            let template = inputs.template;
            let resolvedBase = baseDir;

            if (!template && params.filePath) {
              let fullPath = path.isAbsolute(params.filePath)
                ? params.filePath
                : path.join(baseDir, params.filePath);
              template = await readFile(fullPath, 'utf-8');
              resolvedBase = path.dirname(fullPath);
            }

            let processed = await processTemplate(template, context, resolvedBase);
            return { result: { content: processed, variablesUsed: Object.keys(context) } };
          },
          'load-multi': async () => {
            let entries = Object.entries(params.templates);
            let results = {};
            for (const [name, templatePath] of entries) {
              let fullPath = path.isAbsolute(templatePath)
                ? templatePath
                : path.join(baseDir, templatePath);
              let raw = await readFile(fullPath, 'utf-8');
              results[name] = await processTemplate(raw, context, path.dirname(fullPath));
            }
            return { result: { templates: results, count: entries.length } };
          },
          validate: () => {
            let missing = validatePromptTemplate(inputs.template, context);
            return {
              result: {
                valid: missing.length === 0,
                missing,
                totalVariables: (inputs.template.match(/\{\{([A-Z_][A-Z0-9_]*)\}\}/g) || []).length,
              },
            };
          },
          list: async () => {
            let templates = await listPromptTemplates(baseDir);
            return { result: { templates, count: templates.length, baseDir } };
          },
        };

        if (opMap[operation]) {
          return await opMap[operation]();
        } else {
          return { error: `Unknown operation: ${operation}` };
        }
      } catch (err) {
        return { error: `prompt-loader ${operation} failed: ${err.message}` };
      }
    },
  },
};
