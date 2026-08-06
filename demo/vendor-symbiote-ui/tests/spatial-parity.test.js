import { acquireCurrentTestFileLock } from './test-lock.js';
await acquireCurrentTestFileLock(import.meta.url);

import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  SPATIAL_PARITY_VERSION,
  createSpatialParityReport,
} from '../xr/spatial-parity.js';
import { compileSpatialSnapshot } from '../xr/spatial-snapshot-compile.js';
import { createReferenceSnapshot } from './fixtures/spatial-snapshot-reference.js';

function compileReference() {
  return compileSpatialSnapshot(createReferenceSnapshot(), { planeWidth: 1.28 });
}

test('createSpatialParityReport accepts a faithful compiled scene', () => {
  let snapshot = createReferenceSnapshot();
  let compiled = compileReference();
  let report = createSpatialParityReport(snapshot, compiled);
  assert.equal(report.version, SPATIAL_PARITY_VERSION);
  assert.equal(report.ok, true, JSON.stringify(report, null, 2));
  assert.equal(report.geometry.tolerancePx, 2);
  assert.ok(report.geometry.maxErrorPx <= 2);
  assert.equal(report.geometry.unmatched.length, 0);
  assert.ok(report.geometry.panels.compared >= 3);
  assert.equal(report.geometry.resizers.compared, 2);
  assert.equal(report.text.mismatches.length, 0);
  assert.ok(report.text.compared >= 4);
  assert.equal(report.style.mismatches.length, 0);
  assert.equal(report.actions.total, 5);
  assert.equal(report.actions.mapped, 5);
  assert.deepEqual(report.actions.unmapped, []);
  assert.equal(report.diagnostics.unsupported.count, 1);
  assert.deepEqual(report.diagnostics.unsupported.features, ['text-input']);
  assert.equal(report.diagnostics.unknownVisible.count, 0);
});

test('createSpatialParityReport is deterministic across repeated runs', () => {
  let snapshot = createReferenceSnapshot();
  let compiled = compileReference();
  let a = JSON.stringify(createSpatialParityReport(snapshot, compiled));
  let b = JSON.stringify(createSpatialParityReport(snapshot, compiled));
  assert.equal(a, b);
});

test('createSpatialParityReport flags geometry drift beyond 2 CSS px', () => {
  let snapshot = createReferenceSnapshot();
  let compiled = compileReference();
  let project = compiled.panels.find((panel) => panel.id === 'panel:project');
  project.position[0] += 0.003; // 3 CSS px at scale 0.001
  for (let primitive of project.primitives) {
    if (primitive.spatialNodeId === 'panel:project') continue;
    primitive.bounds.x += 0.003;
  }
  let report = createSpatialParityReport(snapshot, compiled);
  assert.equal(report.ok, false);
  assert.ok(report.geometry.maxErrorPx > 2);
  assert.ok(report.geometry.panels.maxErrorPx > 2);
  assert.ok(report.geometry.failures.some((entry) => entry.nodeId === 'panel:project'));
});

test('createSpatialParityReport flags resizer edge drift', () => {
  let snapshot = createReferenceSnapshot();
  let compiled = compileReference();
  let resizer = compiled.panels.find((panel) => panel.id === 'split:main/resizer:0');
  resizer.position[0] += 0.0025;
  let report = createSpatialParityReport(snapshot, compiled);
  assert.equal(report.ok, false);
  assert.ok(report.geometry.resizers.maxErrorPx > 2);
});

test('createSpatialParityReport flags text mismatches with expected and actual', () => {
  let snapshot = createReferenceSnapshot();
  let compiled = compileReference();
  let title = compiled.panels
    .find((panel) => panel.id === 'panel:project')
    .primitives.find((primitive) => primitive.spatialNodeId === 'panel:project/title');
  title.text = 'Projekt';
  let report = createSpatialParityReport(snapshot, compiled);
  assert.equal(report.ok, false);
  assert.deepEqual(report.text.mismatches, [
    { nodeId: 'panel:project/title', expected: 'Project', actual: 'Projekt' },
  ]);
});

test('createSpatialParityReport flags resolved style mismatches', () => {
  let snapshot = createReferenceSnapshot();
  let compiled = compileReference();
  let surface = compiled.panels
    .find((panel) => panel.id === 'panel:project')
    .primitives.find((primitive) => primitive.spatialNodeId === 'panel:project');
  surface.style.background = 'rgb(0, 0, 0)';
  let report = createSpatialParityReport(snapshot, compiled);
  assert.equal(report.ok, false);
  assert.equal(report.style.mismatches.length, 1);
  assert.equal(report.style.mismatches[0].nodeId, 'panel:project');
});

test('createSpatialParityReport ignores zero-alpha CSS colors consistently with compilation', () => {
  let snapshot = createReferenceSnapshot();
  let panel = snapshot.nodes.find((node) => node.id === 'panel:project');
  panel.style['background-color'] = 'rgba(14, 36, 44, 0)';
  let compiled = compileSpatialSnapshot(snapshot, { planeWidth: 1.28 });
  let report = createSpatialParityReport(snapshot, compiled);
  assert.equal(report.style.mismatches.length, 0);
  assert.equal(report.ok, true, JSON.stringify(report, null, 2));
});

test('createSpatialParityReport names unmapped actions and unmatched nodes', () => {
  let snapshot = createReferenceSnapshot();
  let compiled = compileReference();
  let project = compiled.panels.find((panel) => panel.id === 'panel:project');
  project.primitives = project.primitives.filter(
    (primitive) => primitive.spatialNodeId !== 'panel:project/row:src',
  );
  let report = createSpatialParityReport(snapshot, compiled);
  assert.equal(report.ok, false);
  assert.deepEqual(report.actions.unmapped, [
    { nodeId: 'panel:project/row:src', actionId: 'select-row', targetId: 'src' },
  ]);
  assert.ok(report.geometry.unmatched.includes('panel:project/row:src'));
});

test('createSpatialParityReport supports an explicit tolerance override', () => {
  let snapshot = createReferenceSnapshot();
  let compiled = compileReference();
  let project = compiled.panels.find((panel) => panel.id === 'panel:project');
  project.position[0] += 0.0015; // 1.5 CSS px
  let strict = createSpatialParityReport(snapshot, compiled, { tolerancePx: 1 });
  assert.equal(strict.ok, false);
  let relaxed = createSpatialParityReport(snapshot, compiled, { tolerancePx: 2 });
  assert.equal(relaxed.ok, true);
});

test('createSpatialParityReport rejects a scene without snapshot provenance', () => {
  let snapshot = createReferenceSnapshot();
  let compiled = compileReference();
  delete compiled.spatialSnapshot;
  assert.throws(() => createSpatialParityReport(snapshot, compiled), /spatialSnapshot/);
});

test('createSpatialParityReport reports captured and compiled icon coverage', () => {
  let snapshot = createReferenceSnapshot();
  let compiled = compileReference();
  let report = createSpatialParityReport(snapshot, compiled);
  assert.deepEqual(report.icons, {
    captured: 2,
    compiled: 2,
    missing: [],
    mismatched: [],
  });
  assert.equal(report.ok, true, JSON.stringify(report.icons, null, 2));
});

test('createSpatialParityReport fails when a captured icon is missing from the scene', () => {
  let snapshot = createReferenceSnapshot();
  let compiled = compileReference();
  let project = compiled.panels.find((panel) => panel.id === 'panel:project');
  project.primitives = project.primitives.filter(
    (primitive) => primitive.spatialNodeId !== 'panel:project/row:src/icon:folder',
  );
  let report = createSpatialParityReport(snapshot, compiled);
  assert.equal(report.ok, false);
  assert.deepEqual(report.icons.missing, [
    { nodeId: 'panel:project/row:src/icon:folder', name: 'folder' },
  ]);
  assert.equal(report.icons.captured, 2);
  assert.equal(report.icons.compiled, 1);
});

test('createSpatialParityReport fails when a compiled icon glyph differs from the capture', () => {
  let snapshot = createReferenceSnapshot();
  let compiled = compileReference();
  let icon = compiled.panels
    .find((panel) => panel.id === 'panel:project')
    .primitives.find((primitive) => primitive.spatialNodeId === 'panel:project/row:src/icon:folder');
  icon.icon = 'close';
  let report = createSpatialParityReport(snapshot, compiled);
  assert.equal(report.ok, false);
  assert.deepEqual(report.icons.mismatched, [
    { nodeId: 'panel:project/row:src/icon:folder', expected: 'folder', actual: 'close' },
  ]);
});

test('createSpatialParityReport excludes icon nodes from text equality', () => {
  let snapshot = createReferenceSnapshot();
  let compiled = compileReference();
  let report = createSpatialParityReport(snapshot, compiled);
  assert.equal(report.text.compared, 6, 'only text-carrying nodes participate in text equality');
  assert.ok(
    !report.text.mismatches.some((entry) => entry.nodeId.includes('/icon:')),
    'icon nodes never appear as text mismatches',
  );
});
