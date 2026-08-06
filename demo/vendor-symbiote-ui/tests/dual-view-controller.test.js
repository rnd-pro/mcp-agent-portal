import { acquireCurrentTestFileLock } from './test-lock.js';
await acquireCurrentTestFileLock(import.meta.url);

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createDualViewController } from '../xr/dual-view-controller.js';

test('createDualViewController handles mode transitions and notifies subscribers', () => {
  const controller = createDualViewController();
  assert.equal(controller.getMode(), '2d');

  let lastState = null;
  const unsubscribe = controller.subscribe((state) => {
    lastState = state;
  });

  assert.ok(lastState);
  assert.equal(lastState.mode, '2d');

  // Change mode
  controller.enter3DPreview();
  assert.equal(controller.getMode(), '3d-preview');
  assert.equal(lastState.mode, '3d-preview');

  // Focus and select node
  controller.focusNode('n1');
  controller.selectNode('n2');
  assert.equal(lastState.focusedNodeId, 'n1');
  assert.equal(lastState.activeNodeId, 'n2');

  // Update positions
  controller.updateNodePosition('n1', [1, 2, 3]);
  assert.deepEqual(lastState.nodePositions.n1, [1, 2, 3]);
  assert.equal(lastState.lastMovedNodeId, 'n1');

  controller.pinNode('n1', [2, 3, 4]);
  assert.deepEqual(lastState.pinnedNodeIds, ['n1']);
  assert.deepEqual(lastState.nodePositions.n1, [2, 3, 4]);

  controller.showPanel('inspector');
  controller.setVisiblePanels(['inspector', 'chat']);
  assert.deepEqual(lastState.visiblePanelIds, ['inspector', 'chat']);

  controller.hidePanel('inspector');
  assert.deepEqual(lastState.visiblePanelIds, ['chat']);

  controller.unpinNode('n1');
  assert.deepEqual(lastState.pinnedNodeIds, []);

  assert.deepEqual(controller.getState().visiblePanelIds, ['chat']);

  unsubscribe();
  controller.destroy();
});
