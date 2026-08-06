import { acquireCurrentTestFileLock } from './test-lock.js';
await acquireCurrentTestFileLock(import.meta.url);

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const canvasRendererSource = new URL('../canvas/CanvasConnectionRenderer.js', import.meta.url);
const portalBridgeSource = new URL(
  '../layout/CrossLayoutPortalBridge/CrossLayoutPortalBridge.js',
  import.meta.url
);

test('canvas connection renderer does not run an idle animation loop', async () => {
  const source = await readFile(canvasRendererSource, 'utf8');
  const constructorBlock = source.match(/constructor\(config = \{\}\) \{([\s\S]*?)\n  \}/)?.[1] || '';
  const renderLoopBlock = source.match(/#renderLoop = \(\) => \{([\s\S]*?)\n  \};/)?.[1] || '';

  assert.doesNotMatch(constructorBlock, /requestAnimationFrame\(this\.#renderLoop\)/);
  assert.doesNotMatch(renderLoopBlock, /requestAnimationFrame\(this\.#renderLoop\)/);
  assert.match(source, /if \(hasFlowing\) this\.#scheduleRenderLoop\(\);/);
  assert.match(source, /else this\.#stopRenderLoop\(\);/);
});

test('canvas connection renderer initializes sizing after DOM attachment', async () => {
  const source = await readFile(canvasRendererSource, 'utf8');
  const redrawBlock = source.match(/redraw\(\) \{([\s\S]*?)\n  \}/)?.[1] || '';

  assert.match(source, /#resizeParent;/);
  assert.match(source, /#resizeCanvas\(width, height\)/);
  assert.match(redrawBlock, /this\.#initResizeObserver\(\);/);
});

test('canvas flowing state changes explicitly redraw the renderer', async () => {
  const source = await readFile(canvasRendererSource, 'utf8');
  const setFlowingBlock = source.match(/setFlowing\(connId, active\) \{([\s\S]*?)\n  \}/)?.[1] || '';
  const setAllFlowingBlock = source.match(/setAllFlowing\(active\) \{([\s\S]*?)\n  \}/)?.[1] || '';

  assert.match(setFlowingBlock, /this\.redraw\(\);/);
  assert.match(setAllFlowingBlock, /if \(changed\) this\.redraw\(\);/);
});

test('portal bridge avoids document-wide attribute mutation redraws', async () => {
  const source = await readFile(portalBridgeSource, 'utf8');
  const observeBlock = source.match(/#mutationObserver\.observe\(document\.documentElement, \{([\s\S]*?)\n    \}\);/)?.[1] || '';

  assert.doesNotMatch(observeBlock, /attributes:\s*true/);
  assert.match(observeBlock, /childList:\s*true/);
  assert.match(observeBlock, /subtree:\s*true/);
});
