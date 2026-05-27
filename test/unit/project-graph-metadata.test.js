import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildSemanticGroups,
  findClusterForPath,
  normalizeProjectGraphMetadata,
  pathMatchesPattern,
  validateProjectGraphMetadata,
} from 'symbiote-node/graph';

describe('project graph metadata', () => {
  it('normalizes clusters and filters unusable entries', () => {
    const metadata = normalizeProjectGraphMetadata({
      clusters: [
        { label: 'Web UI', color: '#7cc7ff', paths: ['web/'] },
        { label: 'No Paths' },
        { id: 'bad-color', color: 'url(javascript:alert(1))', paths: ['src/'] },
      ],
    });

    assert.equal(metadata.clusters.length, 2);
    assert.equal(metadata.clusters[0].id, 'web-ui');
    assert.equal(metadata.clusters[0].color, '#7cc7ff');
    assert.equal(metadata.clusters[1].color, 'var(--sn-graph-cluster-2)');
  });

  it('accepts symbiote-node graph theme token references for cluster colors', () => {
    const metadata = normalizeProjectGraphMetadata({
      clusters: [
        { label: 'Theme Token', color: 'var(--sn-graph-cluster-4)', paths: ['packages/'] },
      ],
    });

    assert.equal(metadata.clusters[0].color, 'var(--sn-graph-cluster-4)');
  });

  it('matches exact paths, directories, and globs', () => {
    assert.equal(pathMatchesPattern('web/panels/dep-graph.js', 'web/'), true);
    assert.equal(pathMatchesPattern('web/panels/dep-graph.js', 'web/panels'), true);
    assert.equal(pathMatchesPattern('web/panels/dep-graph.js', 'web/**/*.js'), true);
    assert.equal(pathMatchesPattern('src/node/server/api-routes.js', 'web/'), false);
  });

  it('normalizes singular MCP-compatible match fields', () => {
    const metadata = normalizeProjectGraphMetadata({
      clusters: [
        { label: 'One', path: 'web/' },
        { label: 'Two', pattern: ['src/**/*.js'] },
        { label: 'Three', node: 'packages/project-graph-mcp/' },
        { label: 'Four', match: 'test/' },
      ],
    });

    assert.deepEqual(metadata.clusters.map((cluster) => cluster.paths), [
      ['web/'],
      ['src/**/*.js'],
      ['packages/project-graph-mcp/'],
      ['test/'],
    ]);
  });

  it('validates and normalizes metadata through the provider contract', () => {
    const fixture = {
      version: 1,
      clusters: [
        { label: 'One', path: 'web/' },
        { label: 'Two', pattern: ['src/**/*.js'] },
        { label: 'Three', node: 'packages/project-graph-mcp/' },
        { label: 'Themed', color: 'var(--sn-graph-cluster-4)', match: 'test/' },
      ],
      stories: [{ id: 'flow', beats: [{ id: 'entry', nodes: ['web/app.js'] }] }],
      hiddenNodes: ['vendor/'],
    };

    assert.deepEqual(
      normalizeProjectGraphMetadata(fixture),
      validateProjectGraphMetadata(fixture),
    );
  });

  it('rejects invalid metadata before normalization', () => {
    assert.throws(
      () => validateProjectGraphMetadata({ clusters: [{ label: 'Missing Paths' }] }),
      /clusters\[0\] must define at least one path/,
    );
    assert.throws(
      () => validateProjectGraphMetadata({ stories: [{ id: 'bad', beats: [{ nodes: [123] }] }] }),
      /beats\[0\]\.nodes/,
    );
  });

  it('normalizes stories and story beats', () => {
    const metadata = normalizeProjectGraphMetadata({
      stories: [
        {
          label: 'Compact Flow',
          description: 'How compact reaches project-graph',
          beats: [
            {
              label: 'UI Request',
              narrative: 'The browser asks for a compact file.',
              nodes: ['web/app.js'],
              edges: ['web/app.js->src/node/server/api-routes.js'],
              cluster: 'web-dashboard',
              path: 'web/app.js',
            },
          ],
        },
        { label: 'Empty Flow', beats: [] },
      ],
    });

    assert.equal(metadata.stories.length, 1);
    assert.equal(metadata.stories[0].id, 'compact-flow');
    assert.deepEqual(metadata.stories[0].beats[0], {
      id: 'ui-request',
      label: 'UI Request',
      narrative: 'The browser asks for a compact file.',
      nodes: ['web/app.js'],
      edges: ['web/app.js->src/node/server/api-routes.js'],
      clusterId: 'web-dashboard',
      focusPath: 'web/app.js',
    });
  });

  it('builds first-match semantic groups from file maps', () => {
    const fileMap = new Map([
      ['web/app.js', 'n1'],
      ['web/panels/dep-graph.js', 'n2'],
      ['src/node/server/api-routes.js', 'n3'],
    ]);
    const metadata = normalizeProjectGraphMetadata({
      clusters: [
        { id: 'web', paths: ['web/'] },
        { id: 'backend', paths: ['src/node/'] },
      ],
    });

    assert.deepEqual(buildSemanticGroups(fileMap, metadata), {
      'cluster:web': ['n1', 'n2'],
      'cluster:backend': ['n3'],
    });
    assert.equal(findClusterForPath('src/node/server/api-routes.js', metadata).id, 'backend');
  });
});
