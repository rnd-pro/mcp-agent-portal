import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const symbioteNodeUrl = pathToFileURL(resolve(repoRoot, 'packages', 'symbiote-node', 'index.js')).href;
const loaderSource = `
export async function resolve(specifier, context, nextResolve) {
  if (specifier === 'symbiote-node') {
    return { url: ${JSON.stringify(symbioteNodeUrl)}, shortCircuit: true };
  }
  return nextResolve(specifier, context);
}
`;

register(`data:text/javascript,${encodeURIComponent(loaderSource)}`, import.meta.url);

const {
  buildFileGraph,
  buildStructuredGraph,
} = await import('../../web/services/skeleton-parser.js?unit-test');

describe('project graph skeleton parser', () => {
  it('buildFileGraph skips external, missing, duplicate, and self imports', () => {
    const graph = buildFileGraph({
      f: {
        'src/': ['app.js', 'util.js'],
      },
      I: {
        'src/app.js': ['./util', './util', './missing', 'node:fs', 'external-package'],
        'src/util.js': ['./util'],
      },
    });

    assert.equal(graph.fileMap.size, 2);
    assert.equal(graph.editor.getConnections().length, 1);

    const [connection] = graph.editor.getConnections();
    assert.equal(graph.idToPath.get(connection.from), 'src/app.js');
    assert.equal(graph.idToPath.get(connection.to), 'src/util.js');
  });

  it('buildStructuredGraph skips invalid imports without failing', () => {
    const graph = buildStructuredGraph({
      X: {
        'src/app.js': ['App'],
        'src/util.js': ['format'],
      },
      L: {
        App: 'App',
        format: 'format',
      },
      f: {
        'src/': ['app.js', 'util.js'],
      },
      I: {
        'src/app.js': ['./util', './missing', 'node:path', 'external-package'],
        'src/util.js': ['./util'],
      },
    });

    assert.equal(graph.fileMap.size, 2);
    assert.equal(graph.dirFiles.get('src/').length, 2);
    assert.ok(graph.symbolMap.size >= 2);
  });
});
