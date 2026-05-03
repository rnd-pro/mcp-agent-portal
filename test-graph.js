import fs from 'fs';
import path from 'path';

// Mock bare imports for Node.js
import module from 'module';
const require = module.createRequire(import.meta.url);

// Override resolution
const _resolveFilename = require('module')._resolveFilename;
require('module')._resolveFilename = function(request, parent, isMain, options) {
  if (request === 'symbiote-node') {
    return path.resolve('./packages/symbiote-node/index.js');
  }
  return _resolveFilename.call(this, request, parent, isMain, options);
};

// Use dynamic import so the override applies
import('./web/services/skeleton-parser.js').then(async ({ buildStructuredGraph }) => {
  const skeleton = JSON.parse(fs.readFileSync('.agents/knowledge/example_skeleton.json', 'utf8') || '{}');
  try {
    buildStructuredGraph(skeleton);
    console.log("Graph built successfully!");
  } catch(e) {
    console.error("Error building graph:", e);
  }
}).catch(console.error);
