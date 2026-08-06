import { acquireCurrentTestFileLock } from './test-lock.js';
await acquireCurrentTestFileLock(import.meta.url);

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  RESPONSIVE_PANEL_RESIZE_VERSION,
  createResponsivePanelResizeContext,
  isResponsivePanelResizeContextStale,
  resolveResponsivePanelCssSize,
  updateResponsivePanelResizeTarget,
} from '../xr/responsive-panel-capture.js';

let captureSource = readFileSync(
  new URL('../xr/responsive-panel-capture.js', import.meta.url),
  'utf8',
);

test('responsive panel resize resolves target CSS pixels from the immutable spatial scale', () => {
  assert.deepEqual(resolveResponsivePanelCssSize([0.8, 0.6], 0.0015), [
    533.333333,
    400,
  ]);
  assert.throws(
    () => resolveResponsivePanelCssSize([0.8, 0.6], 0),
    /metersPerCssPixel/,
  );
});

test('responsive panel resize context freezes source, theme, data, and component state', () => {
  let sourceSnapshot = { version: 'spatial-snapshot-v1' };
  let componentState = { form: [{ path: [1, 2], value: 'current' }], scroll: [] };
  let context = createResponsivePanelResizeContext({
    panelId: 'panel:source',
    layoutId: 'source-editor',
    sourceSnapshot,
    sourceCssSize: [826.203125, 646],
    sourceSizeMeters: [1.256655, 0.982566],
    metersPerCssPixel: 0.001521,
    themeRevision: 4,
    dataRevision: 9,
    componentState,
  });

  assert.equal(context.version, RESPONSIVE_PANEL_RESIZE_VERSION);
  assert.equal(context.panelId, 'panel:source');
  assert.equal(context.layoutId, 'source-editor');
  assert.notEqual(context.sourceSnapshot, sourceSnapshot);
  assert.deepEqual(context.sourceSnapshot, sourceSnapshot);
  assert.deepEqual(context.sourceCssSize, [826.203125, 646]);
  assert.deepEqual(context.targetCssSize, [826.203125, 646]);
  assert.deepEqual(context.sourceSizeMeters, [1.256655, 0.982566]);
  assert.deepEqual(context.targetSizeMeters, [1.256655, 0.982566]);
  assert.equal(context.themeRevision, 4);
  assert.equal(context.dataRevision, 9);
  assert.deepEqual(context.componentState, componentState);
  assert.equal(Object.isFrozen(context.componentState), true);
  assert.equal(Object.isFrozen(context.targetCssSize), true);

  let updated = updateResponsivePanelResizeTarget(context, [1.5, 0.75]);
  assert.deepEqual(updated.targetSizeMeters, [1.5, 0.75]);
  assert.deepEqual(updated.targetCssSize, [986.193294, 493.096647]);
  assert.deepEqual(context.targetSizeMeters, context.sourceSizeMeters, 'source context stays immutable');
});

test('responsive panel resize context detects stale theme or data revisions', () => {
  let context = createResponsivePanelResizeContext({
    panelId: 'panel:source',
    layoutId: 'source-editor',
    sourceSnapshot: {},
    sourceCssSize: [800, 600],
    sourceSizeMeters: [1.2, 0.9],
    metersPerCssPixel: 0.0015,
    themeRevision: 2,
    dataRevision: 5,
    componentState: {},
  });

  assert.equal(isResponsivePanelResizeContextStale(context, {
    themeRevision: 2,
    dataRevision: 5,
  }), false);
  assert.equal(isResponsivePanelResizeContextStale(context, {
    themeRevision: 3,
    dataRevision: 5,
  }), true);
  assert.equal(isResponsivePanelResizeContextStale(context, {
    themeRevision: 2,
    dataRevision: 6,
  }), true);
});

test('responsive panel host freezes DOM and CSS inputs before its first asynchronous boundary', () => {
  let prepareStart = captureSource.indexOf(
    'export async function prepareResponsivePanelCaptureHost',
  );
  let prepareEnd = captureSource.indexOf(
    'export async function captureResponsivePanelSnapshot',
  );
  let body = captureSource.slice(prepareStart, prepareEnd);
  let firstAwait = body.indexOf('await ');

  assert.ok(body.indexOf('sourcePanel.cloneNode(true)') > 0);
  assert.ok(body.indexOf('captureDocumentAttributes(sourcePanel)') > 0);
  assert.ok(body.indexOf('captureLayoutAttributes(sourcePanel)') > 0);
  assert.ok(body.indexOf('captureDocumentStyles(sourceDoc)') > 0);
  assert.ok(body.indexOf('sourcePanel.cloneNode(true)') < firstAwait);
  assert.ok(body.indexOf('captureDocumentStyles(sourceDoc)') < firstAwait);
});

test('responsive panel host removes its iframe on every preparation failure', () => {
  let prepareStart = captureSource.indexOf(
    'export async function prepareResponsivePanelCaptureHost',
  );
  let prepareEnd = captureSource.indexOf(
    'export async function captureResponsivePanelSnapshot',
  );
  let body = captureSource.slice(prepareStart, prepareEnd);

  assert.match(body, /try\s*\{[\s\S]*sourceDoc\.body\.append\(frame\)/);
  assert.match(body, /catch \(error\) \{\s*frame\.remove\(\);\s*throw error;/);
});
