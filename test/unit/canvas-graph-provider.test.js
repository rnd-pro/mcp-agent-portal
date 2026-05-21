import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

describe('CanvasGraph provider integration', () => {
  it('uses the symbiote-node canvas graph tag without a portal wrapper', async () => {
    const [appSource, templateSource, shellSource] = await Promise.all([
      readFile(resolve(repoRoot, 'web', 'app.js'), 'utf8'),
      readFile(resolve(repoRoot, 'web', 'panels', 'dep-graph-template.js'), 'utf8'),
      readFile(resolve(repoRoot, 'packages', 'symbiote-node', 'canvas', 'GraphExplorerShell', 'GraphExplorerShell.js'), 'utf8'),
    ]);

    assert.doesNotMatch(appSource, /components\/CanvasGraph\/CanvasGraph\.js/);
    assert.match(templateSource, /<canvas-graph\b/);
    assert.doesNotMatch(templateSource, /pg-canvas-graph/);
    assert.match(shellSource, /querySelector\('canvas-graph'\)/);
    assert.doesNotMatch(shellSource, /pg-canvas-graph/);
  });
});
