/**
 * io/write-file — Write content to file
 *
 * Writes string or JSON content to disk. Creates directories if needed.
 *
 * @module symbiote-engine/packs/io/write-file
 */

import { promises as fs } from 'fs';
import path from 'path';

export default {
  type: 'io/write-file',
  category: 'io',
  icon: 'save',

  driver: {
    description: 'Write content to file (auto-creates directories)',
    inputs: [
      { name: 'path', type: 'string' },
      { name: 'content', type: 'any' },
    ],
    outputs: [
      { name: 'success', type: 'boolean' },
      { name: 'path', type: 'string' },
      { name: 'error', type: 'string' },
    ],
    params: {
      encoding: { type: 'string', default: 'utf8', description: 'File encoding' },
      pretty: { type: 'boolean', default: true, description: 'Pretty-print JSON' },
    },
  },

  lifecycle: {
    validate: (inputs) => {
      if (!inputs.path) return false;
      if (inputs.content === undefined || inputs.content === null) return false;
      return true;
    },

    cacheKey: null,

    execute: async (inputs, params) => {
      try {
        await fs.mkdir(path.dirname(inputs.path), { recursive: true });

        let data;
        if (typeof inputs.content === 'object') {
          data = JSON.stringify(inputs.content, null, params.pretty ? 2 : 0);
        } else {
          data = String(inputs.content);
        }

        await fs.writeFile(inputs.path, data, params.encoding || 'utf8');

        return { success: true, path: inputs.path, error: null };
      } catch (err) {
        return { success: false, path: inputs.path, error: err.message };
      }
    },
  },
};
