import { acquireCurrentTestFileLock } from './test-lock.js';
await acquireCurrentTestFileLock(import.meta.url);

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createThreeNativePanelRenderer } from '../xr/three-native-panel-renderer.js';
import { compileSpatialSnapshot } from '../xr/spatial-snapshot-compile.js';
import {
  compileNativePanelPrimitives,
  projectXRPanelsToPlane,
  resizeNativePanelScene,
} from '../xr/native-panel-layout.js';
import { createReferenceSnapshot } from './fixtures/spatial-snapshot-reference.js';

const TITLE_PRIMITIVE_ID = 'panel:project/content/panel:project/title';
const EDITOR_PRIMITIVE_ID = 'panel:source/content/panel:source/editor';
const ROW_ICON_PRIMITIVE_ID = 'panel:project/content/panel:project/row:src/icon:folder';
const TOGGLE_ICON_PRIMITIVE_ID = 'panel:project/content/panel:project/row:src/control:toggle-row/icon:expand_more';

function createFakeObject3D(kind) {
  return {
    kind3d: kind,
    children: [],
    parent: null,
    userData: {},
    position: { x: 0, y: 0, z: 0, set(x, y, z) { this.x = x; this.y = y; this.z = z; } },
    scale: { x: 1, y: 1, z: 1, set(x, y, z) { this.x = x; this.y = y; this.z = z; } },
    rotation: { x: 0, y: 0, z: 0 },
    visible: true,
    add(child) {
      child.parent = this;
      this.children.push(child);
    },
    remove(child) {
      this.children = this.children.filter((entry) => entry !== child);
      child.parent = null;
    },
    removeFromParent() {
      this.parent?.remove(this);
    },
    clear() {
      for (let child of [...this.children]) this.remove(child);
    },
    traverse(fn) {
      fn(this);
      for (let child of [...this.children]) child.traverse(fn);
    },
  };
}

function createFakeThree() {
  let THREE = {
    REVISION: '0.180.0',
    LinearFilter: 1006,
    SRGBColorSpace: 'srgb',
  };
  THREE.Group = function () {
    return createFakeObject3D('Group');
  };
  THREE.Mesh = function (geometry, material) {
    let mesh = createFakeObject3D('Mesh');
    mesh.geometry = geometry;
    mesh.material = material;
    return mesh;
  };
  THREE.PlaneGeometry = function (width, height) {
    return { width, height, disposed: false, dispose() { this.disposed = true; } };
  };
  THREE.MeshBasicMaterial = function (options = {}) {
    return {
      color: { value: null, set(value) { this.value = value; } },
      opacity: 1,
      transparent: false,
      map: null,
      ...options,
      disposed: false,
      dispose() { this.disposed = true; },
    };
  };
  THREE.CanvasTexture = function (canvas) {
    return {
      image: canvas,
      needsUpdate: false,
      minFilter: null,
      magFilter: null,
      generateMipmaps: true,
      anisotropy: 1,
      colorSpace: '',
      disposed: false,
      dispose() { this.disposed = true; },
    };
  };
  return THREE;
}

function createFakeCanvas(options = {}) {
  let { supportsLetterSpacing = true, supportsDirection = true } = options;
  let ctx = {
    font: '',
    fillStyle: '',
    textAlign: '',
    textBaseline: '',
    fills: [],
    clearRect() {},
    save() {},
    restore() {},
    beginPath() {},
    closePath() {},
    moveTo() {},
    lineTo() {},
    arcTo() {},
    arc() {},
    translate() {},
    rotate() {},
    scale() {},
    fill() {},
    stroke() {},
    rect() {},
    clip() {},
    fillText(text, x, y) {
      this.fills.push({ text: String(text), x, y, font: this.font, fillStyle: this.fillStyle });
    },
    measureText(text) {
      return { width: String(text).length * 10 };
    },
  };
  if (supportsLetterSpacing) ctx.letterSpacing = '0px';
  if (supportsDirection) ctx.direction = 'ltr';
  return {
    width: 0,
    height: 0,
    ctx,
    getContext(kind) {
      assert.equal(kind, '2d');
      return ctx;
    },
  };
}

function createTestTheme(overrides = {}) {
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
      success: 'rgb(76, 175, 80)',
      warning: 'rgb(255, 152, 0)',
      danger: 'rgb(244, 67, 54)',
      ...(overrides.roles || {}),
    },
    metrics: { fontSize: 13, labelSize: 11, radius: 6, density: 1 },
    ...overrides,
  };
}

function createRendererHarness(options = {}) {
  let THREE = createFakeThree();
  let created = [];
  let renderer = createThreeNativePanelRenderer(THREE, {
    createCanvas: () => {
      let canvas = createFakeCanvas(options.canvas || {});
      created.push(canvas);
      return canvas;
    },
    ...(options.renderer || {}),
  });
  let canvasOf = (primitiveId) => renderer.getPrimitiveObject(primitiveId)?.material?.map?.image || null;
  return { THREE, renderer, created, canvasOf };
}

function compileFixture() {
  return compileSpatialSnapshot(createReferenceSnapshot(), { planeWidth: 1.28 });
}

function compileBorderedFixture() {
  let snapshot = createReferenceSnapshot();
  let project = snapshot.nodes.find((node) => node.id === 'panel:project');
  project.style = {
    ...project.style,
    'border-width': '1px',
    'border-style': 'solid',
    'border-color': 'rgb(60, 60, 60)',
  };
  return compileSpatialSnapshot(snapshot, { planeWidth: 1.28 });
}

function mountFixture(renderer, theme = createTestTheme()) {
  let compiled = compileFixture();
  renderer.mount(compiled, { theme });
  return compiled;
}

test('renderer sizes measured label textures from source CSS pixels times bounded DPR', () => {
  let { renderer } = createRendererHarness({ renderer: { texturePixelRatio: 2 } });
  mountFixture(renderer);
  let report = renderer.getTextQualityReport();
  assert.equal(report.version, 'native-panel-text-quality-v1');
  let title = report.textures.find((entry) => entry.primitiveId === TITLE_PRIMITIVE_ID);
  assert.equal(title.policy, 'measured-source-css');
  assert.deepEqual(title.sourceCss, { width: 180, height: 18 });
  assert.equal(title.width, 360);
  assert.equal(title.height, 36);
  assert.ok(Math.abs(title.pixelsPerMeter - 2000) < 1e-6, `expected 2000 px/m, got ${title.pixelsPerMeter}`);
});

test('renderer uses the explicit fallback meter-density policy without source CSS pixels', () => {
  let { renderer } = createRendererHarness();
  let projected = projectXRPanelsToPlane(
    [{ id: 'p1', relativeRect: { x: 0, y: 0, width: 1, height: 1 } }],
    { planeWidth: 1, planeHeight: 1, gap: 0 },
  );
  let compiled = compileNativePanelPrimitives(projected.panels, {
    p1: { family: 'list-table', title: 'P1', rows: [] },
  });
  renderer.mount(compiled, { theme: createTestTheme() });
  let report = renderer.getTextQualityReport();
  let title = report.textures.find((entry) => entry.primitiveId === 'p1/content/title');
  assert.equal(title.policy, 'fallback-meter-policy');
  assert.equal(title.sourceCss, null);
  let primitive = compiled.panels[0].primitives.find((entry) => entry.id === 'p1/content/title');
  assert.equal(title.width, Math.max(2, Math.round(primitive.bounds.width * 1200)));
  assert.equal(title.height, Math.max(2, Math.round(primitive.bounds.height * 1200)));
});

test('renderer clamps measured texture dimensions to the configured maximum', () => {
  let { renderer } = createRendererHarness({
    renderer: { texturePixelRatio: 2, maxTextureSize: 256 },
  });
  mountFixture(renderer);
  let report = renderer.getTextQualityReport();
  let title = report.textures.find((entry) => entry.primitiveId === TITLE_PRIMITIVE_ID);
  assert.equal(title.width, 256);
  assert.equal(title.height, 26);
  assert.ok(title.width <= 256 && title.height <= 256);
});

test('renderer configures generated textures for linear sampling without mipmaps in sRGB', () => {
  let { THREE, renderer } = createRendererHarness({ renderer: { anisotropy: 16 } });
  mountFixture(renderer);
  for (let primitiveId of [TITLE_PRIMITIVE_ID, ROW_ICON_PRIMITIVE_ID]) {
    let texture = renderer.getPrimitiveObject(primitiveId).material.map;
    assert.equal(texture.minFilter, THREE.LinearFilter, `${primitiveId} minFilter`);
    assert.equal(texture.magFilter, THREE.LinearFilter, `${primitiveId} magFilter`);
    assert.equal(texture.generateMipmaps, false, `${primitiveId} generateMipmaps`);
    assert.equal(texture.colorSpace, THREE.SRGBColorSpace, `${primitiveId} colorSpace`);
    assert.equal(texture.anisotropy, 8, 'host anisotropy is capped at 8');
  }
  let report = renderer.getTextQualityReport();
  assert.equal(report.sampling.minFilter, 'LinearFilter');
  assert.equal(report.sampling.magFilter, 'LinearFilter');
  assert.equal(report.sampling.mipmaps, false);
  assert.equal(report.sampling.colorSpace, 'srgb');
  assert.equal(report.sampling.anisotropy, 8);
});

test('renderer reports font failure and icon glyph misses as diagnostics', () => {
  let { renderer } = createRendererHarness({
    renderer: { fonts: { check: () => false } },
  });
  mountFixture(renderer);
  let report = renderer.getTextQualityReport();
  assert.equal(report.fonts.ready, false);
  let missedGlyphs = report.glyphMisses.map((entry) => entry.glyph).sort();
  assert.deepEqual(missedGlyphs, ['expand_more', 'folder']);
  let title = report.textures.find((entry) => entry.primitiveId === TITLE_PRIMITIVE_ID);
  assert.equal(title.fontReady, false);
});

test('renderer builds, theme-updates, and disposes icon planes', () => {
  let { renderer, canvasOf } = createRendererHarness();
  mountFixture(renderer);
  let mesh = renderer.getPrimitiveObject(ROW_ICON_PRIMITIVE_ID);
  assert.ok(mesh, 'icon primitive has a rendered object');
  assert.equal(mesh.userData.kind, 'icon');
  let canvas = canvasOf(ROW_ICON_PRIMITIVE_ID);
  assert.ok(canvas, 'icon plane owns a raster canvas');
  assert.equal(canvas.ctx.fills.length, 1);
  assert.equal(canvas.ctx.fills[0].text, 'folder');
  assert.match(canvas.ctx.fills[0].font, /Material Symbols Outlined/);
  assert.equal(canvas.ctx.fills[0].fillStyle, 'rgb(153, 153, 153)');

  renderer.updateTheme(createTestTheme({ revision: 2 }));
  assert.equal(canvas.ctx.fills.length, 2, 'theme update redraws the icon texture');

  let texture = mesh.material.map;
  renderer.dispose();
  assert.equal(texture.disposed, true, 'dispose releases the icon texture');
});

test('renderer draws measured labels with the exact captured font metrics', () => {
  let { renderer, canvasOf } = createRendererHarness({ renderer: { texturePixelRatio: 2 } });
  mountFixture(renderer);
  let titleCanvas = canvasOf(TITLE_PRIMITIVE_ID);
  assert.match(titleCanvas.ctx.fills[0].font, /^italic 600 26px Inter, sans-serif$/);
  assert.equal(titleCanvas.ctx.letterSpacing, '0.01em');
  assert.equal(titleCanvas.ctx.direction, 'ltr');

  let editorCanvas = canvasOf('panel:source/content/panel:source/editor');
  assert.ok(editorCanvas.ctx.fills.length >= 2, 'multiline editor draws every line');
  let [first, second] = editorCanvas.ctx.fills;
  assert.equal(second.y - first.y, 32, 'captured 16px line-height at DPR 2 drives line spacing');
});

test('renderer reports unsupported Canvas2D controls as data', () => {
  let { renderer } = createRendererHarness({
    canvas: { supportsLetterSpacing: false, supportsDirection: false },
  });
  mountFixture(renderer);
  let report = renderer.getTextQualityReport();
  assert.ok(report.unsupportedControls.includes('letter-spacing'));
  assert.ok(report.unsupportedControls.includes('direction'));
});

test('renderer truncates single-line labels with ellipsis when text-overflow demands it', () => {
  let { renderer, canvasOf } = createRendererHarness({ renderer: { texturePixelRatio: 2 } });
  let compiled = compileFixture();
  let title = compiled.panels
    .find((panel) => panel.id === 'panel:project')
    .primitives.find((primitive) => primitive.id === TITLE_PRIMITIVE_ID);
  title.text = 'A very long project title that cannot fit';
  title.style.textOverflow = 'ellipsis';
  renderer.mount(compiled, { theme: createTestTheme() });
  let fill = canvasOf(TITLE_PRIMITIVE_ID).ctx.fills[0];
  assert.ok(fill.text.endsWith('…'), `expected an ellipsis-truncated draw, got "${fill.text}"`);
  assert.ok(fill.text.length < title.text.length);
});

test('renderer fits center-aligned ellipsis labels against the symmetric inset width', () => {
  let { renderer, canvasOf } = createRendererHarness({ renderer: { texturePixelRatio: 2 } });
  let compiled = compileFixture();
  let title = compiled.panels
    .find((panel) => panel.id === 'panel:project')
    .primitives.find((primitive) => primitive.id === TITLE_PRIMITIVE_ID);
  title.align = 'center';
  title.text = 'A very long project title that cannot fit';
  title.style.textOverflow = 'ellipsis';
  renderer.mount(compiled, { theme: createTestTheme() });
  let canvas = canvasOf(TITLE_PRIMITIVE_ID);
  let fill = canvas.ctx.fills[0];
  assert.equal(canvas.ctx.textAlign, 'center');
  assert.equal(fill.x, 180);
  assert.ok(fill.text.length > 2, `center ellipsis must not collapse, got "${fill.text}"`);
  assert.equal(fill.text, 'A very long project title that ca…');
});

test('renderer fits end-aligned ellipsis labels against the left-side width', () => {
  let { renderer, canvasOf } = createRendererHarness({ renderer: { texturePixelRatio: 2 } });
  let compiled = compileFixture();
  let title = compiled.panels
    .find((panel) => panel.id === 'panel:project')
    .primitives.find((primitive) => primitive.id === TITLE_PRIMITIVE_ID);
  title.align = 'end';
  title.text = 'A very long project title that cannot fit';
  title.style.textOverflow = 'ellipsis';
  renderer.mount(compiled, { theme: createTestTheme() });
  let canvas = canvasOf(TITLE_PRIMITIVE_ID);
  let fill = canvas.ctx.fills[0];
  assert.equal(canvas.ctx.textAlign, 'right');
  assert.equal(fill.x, 352);
  assert.ok(fill.text.length > 2, `end ellipsis must not collapse, got "${fill.text}"`);
  assert.equal(fill.text, 'A very long project title that ca…');
});

test('refreshAppearance preserves window object identity and redraws textures when bounds match', () => {
  let { renderer, canvasOf } = createRendererHarness();
  mountFixture(renderer);
  let groupBefore = renderer.group.children.find((group) => group.userData.panelId === 'panel:project');
  let meshBefore = renderer.getPrimitiveObject(TITLE_PRIMITIVE_ID);
  let buildsBefore = renderer.getDiagnostics().builds;
  let fillsBefore = canvasOf(TITLE_PRIMITIVE_ID).ctx.fills.length;

  let compiled2 = compileFixture();
  let title2 = compiled2.panels
    .find((panel) => panel.id === 'panel:project')
    .primitives.find((primitive) => primitive.id === TITLE_PRIMITIVE_ID);
  title2.style.color = 'rgb(1, 2, 3)';
  let result = renderer.refreshAppearance(compiled2, { theme: createTestTheme({ revision: 2 }) });

  assert.equal(result.ok, true);
  assert.ok(result.refreshed.primitives > 0);
  assert.equal(
    renderer.group.children.find((group) => group.userData.panelId === 'panel:project'),
    groupBefore,
    'window group object identity is preserved',
  );
  assert.equal(renderer.getPrimitiveObject(TITLE_PRIMITIVE_ID), meshBefore, 'primitive object identity is preserved');
  assert.equal(renderer.getDiagnostics().builds, buildsBefore, 'no rebuild happened');
  let fills = canvasOf(TITLE_PRIMITIVE_ID).ctx.fills;
  assert.ok(fills.length > fillsBefore, 'textures redraw on appearance refresh');
  assert.equal(fills.at(-1).fillStyle, 'rgb(1, 2, 3)', 'redraw uses the refreshed resolved color');
});

test('refreshAppearance rejects changed bounds and typography with a geometry-invalidated result', () => {
  let { renderer } = createRendererHarness();
  mountFixture(renderer);
  let buildsBefore = renderer.getDiagnostics().builds;

  let moved = compileFixture();
  moved.panels.find((panel) => panel.id === 'panel:project').position[0] += 0.01;
  let result = renderer.refreshAppearance(moved, { theme: createTestTheme() });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'geometry-invalidated');
  assert.ok(result.changed.includes('panel:project'));
  assert.equal(renderer.getDiagnostics().builds, buildsBefore, 'rejected refresh never rebuilds');

  let retyped = compileFixture();
  let title = retyped.panels
    .find((panel) => panel.id === 'panel:project')
    .primitives.find((primitive) => primitive.id === TITLE_PRIMITIVE_ID);
  title.style.font.size = '14px';
  let typography = renderer.refreshAppearance(retyped, { theme: createTestTheme() });
  assert.equal(typography.ok, false);
  assert.equal(typography.reason, 'geometry-invalidated');
  assert.ok(typography.changed.includes(TITLE_PRIMITIVE_ID));

  let removed = compileFixture();
  removed.panels.find((panel) => panel.id === 'panel:project').primitives = removed.panels
    .find((panel) => panel.id === 'panel:project')
    .primitives.filter((primitive) => primitive.id !== TITLE_PRIMITIVE_ID);
  let missing = renderer.refreshAppearance(removed, { theme: createTestTheme() });
  assert.equal(missing.ok, false);
  assert.ok(missing.changed.includes(TITLE_PRIMITIVE_ID));

  let addedBorder = compileBorderedFixture();
  let bordered = addedBorder.panels.flatMap((panel) => panel.primitives)
    .find((primitive) => primitive.style?.border);
  assert.ok(bordered, 'fixture includes a bordered primitive');
  let added = renderer.refreshAppearance(addedBorder, { theme: createTestTheme() });
  assert.equal(added.ok, false);
  assert.equal(added.reason, 'geometry-invalidated');
  assert.ok(added.changed.includes(bordered.id));

  let { renderer: borderedRenderer } = createRendererHarness();
  borderedRenderer.mount(compileBorderedFixture(), { theme: createTestTheme() });
  let widenedBorder = compileBorderedFixture();
  bordered = widenedBorder.panels.flatMap((panel) => panel.primitives)
    .find((primitive) => primitive.style?.border);
  bordered.style.border.width += 1;
  let changedBorder = borderedRenderer.refreshAppearance(widenedBorder, { theme: createTestTheme() });
  assert.equal(changedBorder.ok, false);
  assert.equal(changedBorder.reason, 'geometry-invalidated');
  assert.ok(changedBorder.changed.includes(bordered.id));

  let removedBorder = compileBorderedFixture();
  let formerlyBordered = removedBorder.panels.flatMap((panel) => panel.primitives)
    .find((primitive) => primitive.style?.border);
  formerlyBordered.style.border = null;
  let missingBorder = borderedRenderer.refreshAppearance(removedBorder, { theme: createTestTheme() });
  assert.equal(missingBorder.ok, false);
  assert.equal(missingBorder.reason, 'geometry-invalidated');
  assert.ok(missingBorder.changed.includes(formerlyBordered.id));
});

test('refreshTextures performs one explicit quality redraw when fonts become ready late', () => {
  let fonts = { check: () => false };
  let { renderer, canvasOf } = createRendererHarness({ renderer: { fonts } });
  mountFixture(renderer);
  assert.equal(renderer.getTextQualityReport().fonts.ready, false);

  fonts.check = () => true;
  let fillsBefore = canvasOf(ROW_ICON_PRIMITIVE_ID).ctx.fills.length;
  renderer.refreshTextures();
  let report = renderer.getTextQualityReport();
  assert.equal(report.fonts.ready, true);
  assert.deepEqual(report.glyphMisses, []);
  assert.ok(canvasOf(ROW_ICON_PRIMITIVE_ID).ctx.fills.length > fillsBefore, 'quality refresh redraws textures');
});

test('renderer reports icon coverage and a texture memory estimate', () => {
  let { renderer } = createRendererHarness({ renderer: { texturePixelRatio: 2 } });
  mountFixture(renderer);
  let report = renderer.getTextQualityReport();
  assert.deepEqual(report.icons, { captured: 2, compiled: 2, drawn: 2, coverage: 1 });
  assert.equal(report.memory.textures, report.textures.length);
  let expectedBytes = report.textures.reduce((sum, entry) => sum + entry.width * entry.height * 4, 0);
  assert.equal(report.memory.bytes, expectedBytes);
});

test('renderer renders chromeless captured controls as transparent hit materials', () => {
  let { renderer } = createRendererHarness();
  mountFixture(renderer);
  let hitId = 'panel:project/controls/panel:project/row:src/control:toggle-row#toggle-row';
  let mesh = renderer.getPrimitiveObject(hitId);
  assert.ok(mesh, 'transparent toggle control has a rendered hit mesh');
  assert.equal(mesh.material.transparent, true);
  assert.equal(mesh.material.opacity, 0, 'hit material is invisible at neutral state');
});

test('renderer previews a larger shell without scaling mounted content', () => {
  let { renderer } = createRendererHarness();
  let compiled = mountFixture(renderer);
  let panel = compiled.panels.find((candidate) => candidate.id === 'panel:project');
  let panelObject = renderer.getPanelObject(panel.id);
  let content = panelObject.children.find((child) => child.userData.kind === 'native-panel-content');

  assert.deepEqual([content.scale.x, content.scale.y, content.scale.z], [1, 1, 1]);
  assert.equal(renderer.previewPanelSize(panel.id, [panel.size[0] + 0.2, panel.size[1] + 0.1]), true);
  let preview = panelObject.children.find((child) => child.userData.kind === 'window-resize-preview');
  assert.ok(preview, 'preview adds an empty themed shell behind existing content');
  assert.equal(preview.geometry.width, panel.size[0] + 0.2);
  assert.equal(preview.geometry.height, panel.size[1] + 0.1);
  assert.deepEqual([content.scale.x, content.scale.y, content.scale.z], [1, 1, 1]);
  assert.deepEqual(renderer.getDiagnostics().resizePreviews, {
    [panel.id]: [panel.size[0] + 0.2, panel.size[1] + 0.1],
  });

  assert.equal(renderer.cancelPanelSizePreview(panel.id), true);
  assert.equal(
    panelObject.children.some((child) => child.userData.kind === 'window-resize-preview'),
    false,
  );
  assert.deepEqual(renderer.getDiagnostics().resizePreviews, {});
});

test('renderer preview hides old content outside a smaller shell and restores it on cancel', () => {
  let { renderer } = createRendererHarness();
  let compiled = mountFixture(renderer);
  let panel = compiled.panels.find((candidate) => candidate.id === 'panel:project');
  let panelObject = renderer.getPanelObject(panel.id);
  let content = panelObject.children.find((child) => child.userData.kind === 'native-panel-content');
  let visibleBefore = [];
  content.traverse((object) => {
    if (object.userData?.primitiveId && object.visible !== false) visibleBefore.push(object);
  });

  assert.equal(renderer.previewPanelSize(panel.id, [panel.size[0] * 0.5, panel.size[1] * 0.5]), true);
  assert.ok(renderer.getDiagnostics().resizePreviewHidden[panel.id] > 0);
  assert.ok(visibleBefore.some((object) => object.visible === false));

  assert.equal(renderer.cancelPanelSizePreview(panel.id), true);
  assert.ok(visibleBefore.every((object) => object.visible !== false));
  assert.deepEqual(renderer.getDiagnostics().resizePreviewHidden, {});
});

test('renderer atomically replaces one panel while preserving sibling objects and presentation transform', () => {
  let { renderer } = createRendererHarness();
  let compiled = mountFixture(renderer);
  let target = compiled.panels.find((panel) => panel.id === 'panel:source');
  let sibling = compiled.panels.find((panel) => panel.id === 'panel:project');
  let targetObject = renderer.getPanelObject(target.id);
  let siblingObject = renderer.getPanelObject(sibling.id);
  targetObject.position.set(0.42, -0.17, 0.03);
  targetObject.userData.pinned = true;
  targetObject.visible = false;

  let replacement = {
    ...target,
    size: [target.size[0] + 0.2, target.size[1]],
    primitives: target.primitives.map((primitive) => ({
      ...primitive,
      bounds: { ...primitive.bounds },
    })),
  };
  let nextScene = {
    ...compiled,
    panels: compiled.panels.map((panel) => panel.id === target.id ? replacement : panel),
  };
  let result = renderer.replacePanel(nextScene, target.id);
  let nextTargetObject = renderer.getPanelObject(target.id);

  assert.deepEqual(result, {
    ok: true,
    panelId: target.id,
    preservedTransform: true,
  });
  assert.notEqual(nextTargetObject, targetObject);
  assert.equal(renderer.getPanelObject(sibling.id), siblingObject);
  assert.deepEqual(
    [nextTargetObject.position.x, nextTargetObject.position.y, nextTargetObject.position.z],
    [0.42, -0.17, 0.03],
  );
  assert.equal(nextTargetObject.userData.pinned, true);
  assert.equal(nextTargetObject.visible, false);
  assert.equal(targetObject.parent, null);
  assert.equal(renderer.getDiagnostics().panelReplacements, 1);
  assert.deepEqual(renderer.getDiagnostics().resizePreviews, {});
});

test('renderer replacement failure leaves the committed scene and registries intact', () => {
  let { renderer } = createRendererHarness();
  let compiled = mountFixture(renderer);
  let target = compiled.panels.find((panel) => panel.id === 'panel:source');
  let sibling = compiled.panels.find((panel) => panel.id === 'panel:project');
  let targetObject = renderer.getPanelObject(target.id);
  let siblingObject = renderer.getPanelObject(sibling.id);
  let before = renderer.getDiagnostics();
  let invalidPanel = {
    ...target,
    primitives: [
      ...target.primitives,
      {
        ...target.primitives[0],
        id: `${target.id}/invalid-layer`,
        layer: 'missing',
      },
    ],
  };
  let invalidScene = {
    ...compiled,
    panels: compiled.panels.map((panel) => panel.id === target.id ? invalidPanel : panel),
  };

  assert.throws(() => renderer.replacePanel(invalidScene, target.id));
  assert.equal(renderer.getPanelObject(target.id), targetObject);
  assert.equal(renderer.getPanelObject(sibling.id), siblingObject);
  assert.equal(targetObject.parent, renderer.group);
  assert.equal(renderer.getDiagnostics().panelReplacements, before.panelReplacements);
  assert.equal(renderer.getDiagnostics().panels, before.panels);
  assert.equal(renderer.getDiagnostics().primitives, before.primitives);
});

test('committed reflow rerasterizes measured text at the original pixels per meter', () => {
  let { renderer } = createRendererHarness({ renderer: { texturePixelRatio: 2 } });
  let compiled = mountFixture(renderer);
  let panel = compiled.panels.find((candidate) => candidate.id === 'panel:source');
  let before = renderer.getTextQualityReport().textures
    .find((entry) => entry.primitiveId === EDITOR_PRIMITIVE_ID);
  let resized = resizeNativePanelScene(compiled, panel.id, [panel.size[0] * 1.5, panel.size[1]]);

  renderer.mount(resized, { theme: createTestTheme() });
  let after = renderer.getTextQualityReport().textures
    .find((entry) => entry.primitiveId === EDITOR_PRIMITIVE_ID);
  assert.equal(after.pixelsPerMeter, before.pixelsPerMeter);
  assert.equal(after.height, before.height);
  assert.ok(after.width > before.width, 'the wider label owns a newly sized raster canvas');
});

test('committed shrink omits hidden overflow from textures and hit targets', () => {
  let { renderer } = createRendererHarness({ renderer: { texturePixelRatio: 2 } });
  let compiled = mountFixture(renderer);
  let panel = compiled.panels.find((candidate) => candidate.id === 'panel:project');
  let resized = resizeNativePanelScene(compiled, panel.id, [0.01, 0.01]);
  let nextPanel = resized.panels.find((candidate) => candidate.id === panel.id);
  let hidden = nextPanel.primitives.find((primitive) => primitive.visible === false);

  assert.ok(hidden, 'small panels identify overflow primitives');
  renderer.mount(resized, { theme: createTestTheme() });
  assert.equal(renderer.getPrimitiveObject(hidden.id)?.visible, false);
  assert.equal(
    renderer.getInteractiveObjects().some((object) => object.userData.primitiveId === hidden.id),
    false,
  );
  assert.equal(
    renderer.getTextQualityReport().textures.some((entry) => entry.primitiveId === hidden.id),
    false,
  );
});

test('renderer exposes a renderer-neutral native-panel-appearance-v1 report', () => {
  let { renderer } = createRendererHarness();
  mountFixture(renderer);
  let report = renderer.getAppearanceReport();
  assert.equal(report.version, 'native-panel-appearance-v1');
  assert.equal(report.panels, 5);
  assert.ok(Array.isArray(report.primitives));
  assert.equal(JSON.parse(JSON.stringify(report)).primitives.length, report.primitives.length,
    'the appearance report is plain JSON without THREE objects');

  let byNode = new Map();
  for (let entry of report.primitives) {
    if (!byNode.has(entry.spatialNodeId)) byNode.set(entry.spatialNodeId, []);
    byNode.get(entry.spatialNodeId).push(entry);
  }
  let panelSurface = byNode.get('panel:project').find((entry) => entry.kind === 'surface');
  assert.equal(panelSurface.visible, true);
  assert.equal(panelSurface.color, 'rgb(32, 32, 32)');
  assert.equal(panelSurface.opacity, 1);
  assert.equal(panelSurface.resolvedStyle, true);

  let toggleHit = byNode.get('panel:project/row:src/control:toggle-row')
    .find((entry) => entry.kind === 'control');
  assert.equal(toggleHit.control, 'hit');
  assert.equal(toggleHit.visible, false);
  assert.equal(toggleHit.transparent, true);
  assert.equal(toggleHit.opacity, 0);

  let saveButton = byNode.get('panel:source/control:save')
    .find((entry) => entry.kind === 'control');
  assert.equal(saveButton.control, 'button');
  assert.equal(saveButton.visible, true);
  assert.equal(saveButton.color, 'rgb(76, 139, 245)');
  let saveLabel = byNode.get('panel:source/control:save')
    .find((entry) => entry.kind === 'label');
  assert.equal(saveLabel.color, 'rgb(255, 255, 255)');

  let title = byNode.get('panel:project/title').find((entry) => entry.kind === 'label');
  assert.equal(title.color, 'rgb(240, 240, 240)');
  assert.equal(title.visible, true);
  let icon = byNode.get('panel:project/row:src/icon:folder').find((entry) => entry.kind === 'icon');
  assert.equal(icon.color, 'rgb(153, 153, 153)');

  for (let entry of report.primitives) {
    assert.equal(typeof entry.id, 'string');
    assert.ok(!('material' in entry) && !('mesh' in entry) && !('object' in entry),
      `entry "${entry.id}" carries no renderer object references`);
  }
});

test('appearance report samples the neutral state and reports hovered/selected ids separately', () => {
  let { renderer } = createRendererHarness();
  mountFixture(renderer);
  let hitId = 'panel:project/controls/panel:project/row:src/control:toggle-row#toggle-row';
  renderer.setHovered(hitId);
  let mesh = renderer.getPrimitiveObject(hitId);
  assert.equal(mesh.material.opacity, 0.2, 'hover raises the hit affordance opacity');

  let report = renderer.getAppearanceReport();
  assert.equal(report.hovered, hitId, 'hovered id is reported separately');
  assert.equal(report.selected, null);
  let entry = report.primitives.find((candidate) => candidate.id === hitId);
  assert.equal(entry.opacity, 0, 'comparator evidence is a neutral-state sample');
  assert.equal(entry.visible, false);
  assert.equal(mesh.material.opacity, 0.2, 'sampling restores the live interaction state');
});
