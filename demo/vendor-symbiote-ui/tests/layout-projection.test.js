import { acquireCurrentTestFileLock } from './test-lock.js';
await acquireCurrentTestFileLock(import.meta.url);

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { autoTileXRPanels } from '../xr/layout-projection.js';

test('autoTileXRPanels tiles panels in arc layout', () => {
  const panels = [
    { id: 'p1', component: 'test-comp' },
    { id: 'p2', component: 'test-comp' }
  ];

  const tiled = autoTileXRPanels(panels, { layout: 'arc', radius: 2, eyeHeight: 1.55 });
  assert.equal(tiled.length, 2);
  assert.equal(tiled[0].id, 'p1');
  assert.equal(tiled[1].id, 'p2');

  // Verify arc positions are correct:
  // p1 should be to the left, p2 to the right
  assert.ok(tiled[0].layout.position[0] < 0);
  assert.ok(tiled[1].layout.position[0] > 0);
});

test('autoTileXRPanels tiles panels in grid layout', () => {
  const panels = [
    { id: 'p1' }, { id: 'p2' }, { id: 'p3' }
  ];

  const tiled = autoTileXRPanels(panels, { layout: 'grid', radius: 2, eyeHeight: 1.5 });
  assert.equal(tiled.length, 3);
  assert.equal(tiled[0].layout.rotation[0], 0);
  assert.equal(tiled[0].layout.rotation[1], 0);
  assert.equal(tiled[0].layout.rotation[2], 0);
});

test('autoTileXRPanels tiles panels in sphere layout', () => {
  const panels = [
    { id: 'p1' }, { id: 'p2' }
  ];

  const tiled = autoTileXRPanels(panels, { layout: 'sphere', radius: 1.6, eyeHeight: 1.5 });
  assert.equal(tiled.length, 2);
  assert.ok(tiled[0].layout.position[2] !== -1.6);
});

test('autoTileXRPanels preserves panel contract and comfort diagnostics', () => {
  const [panel] = autoTileXRPanels([
    {
      id: 'inspector',
      component: 'sn-inspector',
      importance: 8,
      minSize: [0.6, 0.4],
      preferredSize: [1.2, 0.8],
      collapsed: true,
      open: false,
      themeScope: 'workspace-dark',
      metadata: { source: 'host' },
    },
  ], { layout: 'arc', radius: 1.8 });

  assert.equal(panel.id, 'inspector');
  assert.equal(panel.importance, 8);
  assert.deepEqual(panel.minSize, [0.6, 0.4]);
  assert.deepEqual(panel.preferredSize, [1.2, 0.8]);
  assert.equal(panel.collapsed, true);
  assert.equal(panel.open, false);
  assert.equal(panel.themeScope, 'workspace-dark');
  assert.equal(panel.layout.themeScope, 'workspace-dark');
  assert.equal(panel.metadata.source, 'host');
  assert.equal(panel.poseComfort.panelId, 'inspector');
  assert.ok(['comfortable', 'warning'].includes(panel.poseComfort.status));
});

test('autoTileXRPanels spaces grid panels by preferred size to prevent overlap', () => {
  const panels = [
    { id: 'a', preferredSize: [1.2, 0.8] },
    { id: 'b', preferredSize: [1.2, 0.8] },
  ];

  const tiled = autoTileXRPanels(panels, { layout: 'grid', gap: 0.2 });
  const dx = Math.abs(tiled[0].layout.position[0] - tiled[1].layout.position[0]);

  assert.ok(dx >= 1.4);
});
