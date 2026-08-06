import { acquireCurrentTestFileLock } from './test-lock.js';
await acquireCurrentTestFileLock(import.meta.url);

import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  SPATIAL_VISUAL_PARITY_ISSUES,
  SPATIAL_VISUAL_PARITY_VERSION,
  createSpatialVisualParityReport,
} from '../xr/spatial-visual-parity.js';
import { createThreeNativePanelRenderer } from '../xr/three-native-panel-renderer.js';
import { compileSpatialSnapshot } from '../xr/spatial-snapshot-compile.js';
import { createReferenceSnapshot } from './fixtures/spatial-snapshot-reference.js';

const TOGGLE_HIT_NODE_ID = 'panel:project/row:src/control:toggle-row';

function createFakeObject3D() {
  return {
    children: [],
    parent: null,
    userData: {},
    position: { set() {} },
    scale: { set() {} },
    rotation: { z: 0 },
    visible: true,
    add(child) {
      child.parent = this;
      this.children.push(child);
    },
    remove(child) {
      this.children = this.children.filter((entry) => entry !== child);
      child.parent = null;
    },
    traverse(fn) {
      fn(this);
      for (let child of [...this.children]) child.traverse(fn);
    },
  };
}

function createFakeThree() {
  let THREE = { REVISION: '0.180.0', LinearFilter: 1006, SRGBColorSpace: 'srgb' };
  THREE.Group = function () {
    return createFakeObject3D();
  };
  THREE.Mesh = function (geometry, material) {
    let mesh = createFakeObject3D();
    mesh.geometry = geometry;
    mesh.material = material;
    return mesh;
  };
  THREE.PlaneGeometry = function () {
    return { dispose() {} };
  };
  THREE.MeshBasicMaterial = function (options = {}) {
    return {
      color: { value: null, set(value) { this.value = value; } },
      opacity: 1,
      transparent: false,
      map: null,
      ...options,
      dispose() {},
    };
  };
  THREE.CanvasTexture = function () {
    return { needsUpdate: false, dispose() {} };
  };
  return THREE;
}

function createFakeCanvas() {
  let ctx = {
    font: '',
    fillStyle: '',
    textAlign: '',
    textBaseline: '',
    clearRect() {},
    save() {},
    restore() {},
    beginPath() {},
    rect() {},
    clip() {},
    fillText() {},
    measureText: (text) => ({ width: String(text).length * 10 }),
  };
  return { width: 0, height: 0, getContext: () => ctx };
}

function createTestTheme() {
  return {
    version: 'native-panel-theme-v1',
    themeScope: 'test',
    revision: 1,
    roles: {
      surface: 'rgb(10, 10, 10)',
      'surface-raised': 'rgb(20, 20, 20)',
      'surface-sunken': 'rgb(5, 5, 5)',
      text: 'rgb(240, 240, 240)',
      'text-dim': 'rgb(153, 153, 153)',
      outline: 'rgb(60, 60, 60)',
      accent: 'rgb(76, 139, 245)',
    },
    metrics: { fontSize: 13, labelSize: 11, radius: 6, density: 1 },
  };
}

function createFaithfulAppearance({ border = false } = {}) {
  let renderer = createThreeNativePanelRenderer(createFakeThree(), {
    createCanvas: () => createFakeCanvas(),
  });
  let snapshot = createReferenceSnapshot();
  if (border) {
    let project = snapshot.nodes.find((node) => node.id === 'panel:project');
    project.style = {
      ...project.style,
      'border-width': '1px',
      'border-style': 'solid',
      'border-color': 'rgb(60, 60, 60)',
    };
  }
  let compiled = compileSpatialSnapshot(snapshot, { planeWidth: 1.28 });
  renderer.mount(compiled, { theme: createTestTheme() });
  let appearance = renderer.getAppearanceReport();
  renderer.dispose();
  return { snapshot, appearance };
}

test('createSpatialVisualParityReport accepts a faithful renderer appearance sample', () => {
  let { snapshot, appearance } = createFaithfulAppearance();
  assert.equal(appearance.version, 'native-panel-appearance-v1');
  let report = createSpatialVisualParityReport(snapshot, appearance);
  assert.equal(report.version, SPATIAL_VISUAL_PARITY_VERSION);
  assert.equal(report.ok, true, JSON.stringify(report.issues, null, 2));
  assert.deepEqual(report.issues, []);
  assert.equal(report.coverage.missing.length, 0);
  assert.equal(report.coverage.nodes, snapshot.nodes.length);
  assert.equal(report.unknownVisible.count, 0);
  assert.deepEqual(report.informational.unsupported.features, ['text-input']);
});

test('createSpatialVisualParityReport is deterministic across repeated runs', () => {
  let { snapshot, appearance } = createFaithfulAppearance();
  let a = JSON.stringify(createSpatialVisualParityReport(snapshot, appearance));
  let b = JSON.stringify(createSpatialVisualParityReport(snapshot, appearance));
  assert.equal(a, b);
});

test('createSpatialVisualParityReport fails an expected-transparent control rendered opaque', () => {
  let { snapshot, appearance } = createFaithfulAppearance();
  let hit = appearance.primitives.find(
    (entry) => entry.spatialNodeId === TOGGLE_HIT_NODE_ID && entry.kind === 'control',
  );
  assert.ok(hit, 'expected the toggle hit entry');
  assert.equal(hit.visible, false, 'faithful sample keeps the transparent hit invisible at neutral state');
  hit.opacity = 0.4;
  hit.visible = true;
  let report = createSpatialVisualParityReport(snapshot, appearance);
  assert.equal(report.ok, false);
  let issue = report.issues.find((entry) => entry.id === SPATIAL_VISUAL_PARITY_ISSUES.EXPECTED_TRANSPARENT_OPAQUE);
  assert.ok(issue, 'expected an expected-transparent-opaque issue');
  assert.equal(issue.nodeId, TOGGLE_HIT_NODE_ID);
});

test('createSpatialVisualParityReport fails a non-transparent surface style mismatch', () => {
  let { snapshot, appearance } = createFaithfulAppearance();
  let surface = appearance.primitives.find(
    (entry) => entry.spatialNodeId === 'panel:project' && entry.kind === 'surface',
  );
  surface.color = 'rgb(1, 2, 3)';
  let report = createSpatialVisualParityReport(snapshot, appearance);
  assert.equal(report.ok, false);
  let issue = report.issues.find((entry) => entry.id === SPATIAL_VISUAL_PARITY_ISSUES.SURFACE_STYLE_MISMATCH);
  assert.ok(issue, 'expected a surface-style-mismatch issue');
  assert.equal(issue.nodeId, 'panel:project');
  assert.equal(issue.expected, 'rgb(32, 32, 32)');
});

test('createSpatialVisualParityReport fails missing and wrong-width borders', () => {
  let { snapshot, appearance } = createFaithfulAppearance({ border: true });
  let border = appearance.primitives.find(
    (entry) => entry.spatialNodeId === 'panel:project' && entry.border,
  );
  assert.ok(border, 'expected the project surface border entry');
  border.border = null;
  let missing = createSpatialVisualParityReport(snapshot, appearance);
  assert.equal(missing.ok, false);
  assert.ok(missing.issues.some((entry) => entry.nodeId === 'panel:project'));

  ({ snapshot, appearance } = createFaithfulAppearance({ border: true }));
  border = appearance.primitives.find(
    (entry) => entry.spatialNodeId === 'panel:project' && entry.border,
  );
  border.border.width *= 2;
  let wrongWidth = createSpatialVisualParityReport(snapshot, appearance);
  assert.equal(wrongWidth.ok, false);
  let issue = wrongWidth.issues.find((entry) => entry.nodeId === 'panel:project');
  assert.deepEqual(issue.expected, { color: 'rgb(60, 60, 60)', width: 1 });
  assert.deepEqual(issue.actual, { color: 'rgb(60, 60, 60)', width: 2 });
});

test('createSpatialVisualParityReport fails text and icon color mismatches', () => {
  let { snapshot, appearance } = createFaithfulAppearance();
  let title = appearance.primitives.find(
    (entry) => entry.spatialNodeId === 'panel:project/title' && entry.kind === 'label',
  );
  title.color = 'rgb(0, 0, 0)';
  let icon = appearance.primitives.find(
    (entry) => entry.spatialNodeId === 'panel:project/row:src/icon:folder' && entry.kind === 'icon',
  );
  icon.color = 'rgb(255, 255, 255)';
  let report = createSpatialVisualParityReport(snapshot, appearance);
  assert.equal(report.ok, false);
  let textIssue = report.issues.find((entry) => entry.id === SPATIAL_VISUAL_PARITY_ISSUES.TEXT_COLOR_MISMATCH);
  assert.ok(textIssue, 'expected a text-color-mismatch issue');
  assert.equal(textIssue.nodeId, 'panel:project/title');
  let iconIssue = report.issues.find((entry) => entry.id === SPATIAL_VISUAL_PARITY_ISSUES.ICON_COLOR_MISMATCH);
  assert.ok(iconIssue, 'expected an icon-color-mismatch issue');
  assert.equal(iconIssue.nodeId, 'panel:project/row:src/icon:folder');
});

test('createSpatialVisualParityReport fails missing renderer coverage with the uncovered node id', () => {
  let { snapshot, appearance } = createFaithfulAppearance();
  appearance.primitives = appearance.primitives.filter(
    (entry) => entry.spatialNodeId !== 'panel:source/editor',
  );
  let report = createSpatialVisualParityReport(snapshot, appearance);
  assert.equal(report.ok, false);
  let issue = report.issues.find((entry) => entry.id === SPATIAL_VISUAL_PARITY_ISSUES.MISSING_RENDERER_COVERAGE);
  assert.ok(issue, 'expected a missing-renderer-coverage issue');
  assert.equal(issue.nodeId, 'panel:source/editor');
  assert.ok(report.coverage.missing.includes('panel:source/editor'));
});

test('createSpatialVisualParityReport fails unknown visible capture boxes', () => {
  let { snapshot, appearance } = createFaithfulAppearance();
  snapshot.diagnostics.unknownVisible.push({ signature: 'div.promo-banner', detail: 'SALE' });
  let report = createSpatialVisualParityReport(snapshot, appearance);
  assert.equal(report.ok, false);
  let issue = report.issues.find((entry) => entry.id === SPATIAL_VISUAL_PARITY_ISSUES.UNKNOWN_VISIBLE_BOX);
  assert.ok(issue, 'expected an unknown-visible-box issue');
  assert.equal(issue.signature, 'div.promo-banner');
  assert.equal(report.unknownVisible.count, 1);
});

test('createSpatialVisualParityReport keeps unsupported interactions informational', () => {
  let { snapshot, appearance } = createFaithfulAppearance();
  let report = createSpatialVisualParityReport(snapshot, appearance);
  assert.equal(report.ok, true);
  assert.equal(report.informational.unsupported.count, 1);
  assert.deepEqual(report.informational.unsupported.features, ['text-input']);
  assert.ok(
    !report.issues.some((entry) => entry.id === 'text-input'),
    'unsupported interactions never become failing issues',
  );
});

test('createSpatialVisualParityReport rejects a non appearance report input', () => {
  let { snapshot } = createFaithfulAppearance();
  assert.throws(
    () => createSpatialVisualParityReport(snapshot, { version: 'spatial-parity-v1' }),
    /native-panel-appearance-v1/,
  );
});
