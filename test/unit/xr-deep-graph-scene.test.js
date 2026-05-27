import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const symbioteNodeUrl = pathToFileURL(resolve(repoRoot, 'packages', 'symbiote-node', 'index.js')).href;
const symbioteNodeXrUrl = pathToFileURL(resolve(repoRoot, 'packages', 'symbiote-node', 'xr', 'index.js')).href;
const loaderSource = `
export async function resolve(specifier, context, nextResolve) {
  if (specifier === 'symbiote-node') {
    return { url: ${JSON.stringify(symbioteNodeUrl)}, shortCircuit: true };
  }
  if (specifier === 'symbiote-node/xr') {
    return { url: ${JSON.stringify(symbioteNodeXrUrl)}, shortCircuit: true };
  }
  return nextResolve(specifier, context);
}
`;

register(`data:text/javascript,${encodeURIComponent(loaderSource)}`, import.meta.url);

const {
  createPortalXRDeepGraphScene,
} = await import('../../web/services/xr-deep-graph-scene.js?unit-test');

describe('portal XR deep graph adapter', () => {
  it('projects project skeleton data through graph-model-v1 into the Symbiote XR scene contract', () => {
    let result = createPortalXRDeepGraphScene({
      f: {
        'src/': ['app.js', 'util.js'],
      },
      I: {
        'src/app.js': ['./util'],
      },
    }, {
      projectId: 'agent-portal',
      focusPath: 'src/app.js',
    });

    assert.equal(result.version, 'agent-portal-xr-deep-graph-adapter-v1');
    assert.equal(result.graphModel.version, 'graph-model-v1');
    assert.equal(result.scene.version, 'xr-deep-graph-v1');
    assert.equal(result.preview.version, 'xr-deep-graph-preview-v1');
    assert.equal(result.preview.nodes.length, 3);
    assert.equal(result.preview.edges.length, 1);
    assert.equal(result.preview.nodes[0].id, 'src/app.js');
    assert.deepEqual([result.preview.edges[0].from, result.preview.edges[0].to], ['src/app.js', 'src/util.js']);
    assert.deepEqual(result.preview.focus, {
      nodeId: 'src/app.js',
      visible: true,
      edges: {
        visible: 1,
        source: 1,
      },
    });
    assert.equal(result.previewSummary.version, 'xr-deep-graph-preview-summary-v1');
    assert.equal(result.previewSummary.status, 'complete');
    assert.equal(result.previewSummary.nodes.visible, 3);
    assert.equal(result.previewSummary.edges.visible, 1);
    assert.deepEqual(result.previewSummary.focus, result.preview.focus);
    assert.match(result.preview.nodes[0].transform, /translate3d/);
    assert.equal(result.scene.edges.length, 1);
    assert.equal(result.scene.edges[0].from, 'src/app.js');
    assert.equal(result.scene.edges[0].to, 'src/util.js');
    assert.equal(result.focus.ok, true);
    assert.equal(result.focus.nodeId, 'src/app.js');
    assert.equal(result.diagnostics.projectId, 'agent-portal');
    assert.equal(result.diagnostics.version, 'xr-deep-graph-diagnostics-v1');
    assert.equal(result.diagnostics.nodeCount, 3);
    assert.equal(result.diagnostics.edgeCount, 1);
    assert.equal(result.diagnostics.connectedNodeCount, 2);
    assert.equal(result.diagnostics.orphanNodeCount, 1);
    assert.deepEqual(result.diagnostics.edgeTypes, { 'project.import': 1 });
    assert.equal(result.diagnostics.focusNodeId, 'src/app.js');
    assert.deepEqual(result.diagnostics.focus, {
      nodeId: 'src/app.js',
      found: true,
      depth: 1,
      incoming: 0,
      outgoing: 1,
    });
    assert.equal(result.diagnostics.graphVersion, 'graph-model-v1');
  });

  it('keeps missing focus as data without breaking scene creation', () => {
    let result = createPortalXRDeepGraphScene({
      f: {
        './': ['README.md'],
      },
    }, {
      focusPath: 'missing.js',
    });

    assert.equal(result.focus, null);
    assert.equal(result.diagnostics.focusNodeId, null);
    assert.equal(result.scene.diagnostics.nodeCount, 1);
  });
});
