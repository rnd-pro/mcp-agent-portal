import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const symbioteNodeGraphUrl = pathToFileURL(resolve(repoRoot, 'packages', 'symbiote-node', 'graph', 'index.js')).href;
const loaderSource = `
export async function resolve(specifier, context, nextResolve) {
  if (specifier === 'symbiote-node/graph') {
    return { url: ${JSON.stringify(symbioteNodeGraphUrl)}, shortCircuit: true };
  }
  return nextResolve(specifier, context);
}
`;

register(`data:text/javascript,${encodeURIComponent(loaderSource)}`, import.meta.url);

const {
  buildCanvasGraphModelFromSkeleton,
  buildGraphModelFromSkeleton,
} = await import('../../web/services/project-graph-canvas-model.js?unit-test');
import {
  baseName,
  collectSkeletonFiles,
  dirOf,
  resolveImport,
} from '../../web/services/project-graph-skeleton-utils.js';

describe('canvas graph project model adapter', () => {
  it('builds a flat canvas model from project skeleton data', () => {
    const model = buildCanvasGraphModelFromSkeleton({
      n: {
        A: { f: 'src/app.js' },
        B: { f: 'src/lib/util.js' },
      },
      X: {
        'src/app.js': ['App'],
        'src/lib/util.js': ['format'],
      },
      I: {
        'src/app.js': ['./lib/util', 'symbiote-node'],
        'src/lib/util.js': ['./util'],
      },
      L: {
        'src/app.js': 48,
      },
      f: {
        './': ['package.json'],
        'src/': ['style.css'],
      },
      a: {
        'assets/': ['logo.svg'],
      },
    });

    const nodes = new Map(model.nodes.map((node) => [node.id, node]));

    assert.equal(nodes.get('src').isGroup, true);
    assert.equal(nodes.get('src/lib').parentId, 'src');
    assert.equal(nodes.get('src/app.js').type, 'action');
    assert.deepEqual(nodes.get('src/app.js').exports, ['App']);
    assert.equal(nodes.get('src/app.js').lines, 48);
    assert.equal(nodes.get('src/style.css').type, 'style');
    assert.equal(nodes.get('assets/logo.svg').type, 'asset');
    assert.equal(model.edges.length, 1);
    assert.equal(model.edges[0].from, 'src/app.js');
    assert.equal(model.edges[0].to, 'src/lib/util.js');
    assert.equal(model.edges[0].type, 'project.import');
  });

  it('builds the universal graph-model-v1 before projecting to canvas', () => {
    const graph = buildGraphModelFromSkeleton({
      f: {
        'src/': ['app.js', 'util.js'],
      },
      I: {
        'src/app.js': ['./util'],
      },
    });

    assert.equal(graph.version, 'graph-model-v1');
    assert.equal(graph.nodesById.get('src').kind, 'project.directory');
    assert.equal(graph.nodesById.get('src/app.js').kind, 'project.file.action');
    assert.equal(graph.edges[0].kind, 'project.import');
    assert.deepEqual(graph.views.canvas.roots, ['src']);
  });

  it('moves matching files under semantic cluster roots', () => {
    const model = buildCanvasGraphModelFromSkeleton({
      f: {
        'web/': ['dashboard.js'],
        'packages/core/': ['index.js'],
      },
    }, {
      clusters: [
        {
          id: 'portal-ui',
          label: 'Portal UI',
          color: '#abcdef',
          description: 'Browser layer',
          paths: ['web/'],
        },
      ],
    });

    const nodes = new Map(model.nodes.map((node) => [node.id, node]));

    assert.deepEqual(model.rootNodes, ['cluster:portal-ui', 'packages']);
    assert.equal(nodes.get('cluster:portal-ui').isSemanticCluster, true);
    assert.equal(nodes.get('cluster:portal-ui').color, '#abcdef');
    assert.equal(nodes.get('web/dashboard.js').parentId, 'cluster:portal-ui');
    assert.equal(nodes.has('web'), false);
    assert.equal(nodes.get('packages/core/index.js').parentId, 'packages/core');
  });

  it('deduplicates imports and skips self, bare, and unresolved imports', () => {
    const model = buildCanvasGraphModelFromSkeleton({
      f: {
        'src/': ['app.js', 'util.js'],
      },
      I: {
        'src/app.js': ['./util', './util', './missing', 'node:fs', 'external-package'],
        'src/util.js': ['./util'],
      },
    });

    assert.equal(model.edges.length, 1);
    assert.equal(model.edges[0].from, 'src/app.js');
    assert.equal(model.edges[0].to, 'src/util.js');
  });

  it('uses first matching semantic cluster when paths overlap', () => {
    const model = buildCanvasGraphModelFromSkeleton({
      f: {
        'web/components/': ['Panel.js'],
      },
    }, {
      clusters: [
        { id: 'web', label: 'Web', paths: ['web/'] },
        { id: 'components', label: 'Components', paths: ['web/components/'] },
      ],
    });

    const nodes = new Map(model.nodes.map((node) => [node.id, node]));

    assert.deepEqual(model.rootNodes, ['cluster:web']);
    assert.equal(nodes.get('web/components/Panel.js').parentId, 'cluster:web');
  });
});

describe('project graph skeleton utilities', () => {
  it('collects source, export, class, and asset files once', () => {
    const { files, assetFiles, classFiles } = collectSkeletonFiles({
      n: { Widget: { f: 'src/widget.js' } },
      X: { 'src/index.js': ['Widget'] },
      f: { 'src/': ['style.css'] },
      a: { 'assets/': ['logo.svg'] },
    });

    assert.deepEqual([...files].sort(), [
      'assets/logo.svg',
      'src/index.js',
      'src/style.css',
      'src/widget.js',
    ]);
    assert.deepEqual([...assetFiles], ['assets/logo.svg']);
    assert.deepEqual([...classFiles], ['src/widget.js']);
  });

  it('normalizes file names and resolves local imports', () => {
    const knownFiles = new Set([
      'src/app.js',
      'src/lib/util.js',
      'src/lib/index.js',
      'src/styles/main.css',
      'other/util.js',
    ]);

    assert.equal(dirOf('src/lib/util.js'), 'src/lib/');
    assert.equal(baseName('src/lib/util.js'), 'util.js');
    assert.equal(resolveImport('./lib/util', 'src/app.js', knownFiles), 'src/lib/util.js');
    assert.equal(resolveImport('./lib', 'src/app.js', knownFiles), 'src/lib/index.js');
    assert.equal(resolveImport('./styles/main.css', 'src/app.js', knownFiles), 'src/styles/main.css');
    assert.equal(resolveImport('missing', 'src/app.js', knownFiles), null);
    assert.equal(resolveImport('util.js', 'src/app.js', knownFiles), 'src/lib/util.js');
  });
});
