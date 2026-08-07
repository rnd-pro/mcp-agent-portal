/**
 * io/read-file — Read file contents
 *
 * Reads a file from disk. Auto-parses JSON files.
 *
 * @module symbiote-engine/packs/io/read-file
 */

import { promises as fs } from 'fs';

export default {
  type: 'io/read-file',
  category: 'io',
  icon: 'file_open',

  driver: {
    description: 'Read file from disk (auto-parses JSON)',
    inputs: [{ name: 'path', type: 'string' }],
    outputs: [
      { name: 'content', type: 'string' },
      { name: 'parsed', type: 'any' },
      { name: 'error', type: 'string' },
    ],
    params: {
      encoding: { type: 'string', default: 'utf8', description: 'File encoding' },
    },
  },

  lifecycle: {
    validate: (inputs) => {
      if (!inputs.path) return false;
      return true;
    },


    cacheKey: null,

    execute: async (inputs, params) => {
      try {
        let content = await fs.readFile(inputs.path, params.encoding || 'utf8');

        let parsed = null;
        if (inputs.path.endsWith('.json')) {
          try {
            parsed = JSON.parse(content);
          } catch {

          }
        }

        return { content, parsed, error: null };
      } catch (err) {
        return { content: null, parsed: null, error: err.message };
      }
    },
  },
};
