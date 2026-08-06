import { acquireCurrentTestFileLock } from './test-lock.js';
await acquireCurrentTestFileLock(import.meta.url);

import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  SPATIAL_SNAPSHOT_COMPILE_DEFAULTS,
  compileSpatialSnapshot,
  resolveSpatialSnapshotScale,
} from '../xr/spatial-snapshot-compile.js';
import { NATIVE_PANEL_LAYOUT_VERSION } from '../xr/native-panel-layout.js';
import { createReferenceSnapshot } from './fixtures/spatial-snapshot-reference.js';

function primitivesOf(compiled, panelId) {
  let panel = compiled.panels.find((entry) => entry.id === panelId);
  assert.ok(panel, `expected compiled panel "${panelId}"`);
  return panel.primitives;
}

test('resolveSpatialSnapshotScale derives meters per CSS pixel from the viewport', () => {
  let snapshot = createReferenceSnapshot();
  let scale = resolveSpatialSnapshotScale(snapshot, { planeWidth: 1.28 });
  assert.equal(scale, 0.001);
  assert.equal(SPATIAL_SNAPSHOT_COMPILE_DEFAULTS.planeWidth, 1.9);
});

test('compileSpatialSnapshot emits a native-panel-layout-v1 scene', () => {
  let compiled = compileSpatialSnapshot(createReferenceSnapshot(), { planeWidth: 1.28 });
  assert.equal(compiled.version, NATIVE_PANEL_LAYOUT_VERSION);
  assert.deepEqual(compiled.layers, ['surface', 'content', 'controls', 'focus']);
  assert.equal(compiled.spatialSnapshot.scale, 0.001);
  assert.deepEqual(compiled.spatialSnapshot.viewport, { width: 1280, height: 800 });
  assert.equal(compiled.spatialSnapshot.route, 'multi-agent-dev/source-editor');
});

test('compileSpatialSnapshot places panels from measured boxes, never declared ratios', () => {
  let compiled = compileSpatialSnapshot(createReferenceSnapshot(), { planeWidth: 1.28 });
  let project = compiled.panels.find((panel) => panel.id === 'panel:project');
  assert.deepEqual(project.position, [-0.48, 0, 0]);
  assert.deepEqual(project.size, [0.32, 0.8]);
  assert.equal(project.family, 'spatial-snapshot');
  assert.equal(project.metadata.spatialNodeId, 'panel:project');
  let source = compiled.panels.find((panel) => panel.id === 'panel:source');
  assert.ok(Math.abs(source.position[0] - (326 + 253 - 640) * 0.001) < 1e-9);
});

test('compileSpatialSnapshot compiles resizers into thin interactive panels', () => {
  let compiled = compileSpatialSnapshot(createReferenceSnapshot(), { planeWidth: 1.28 });
  let resizer = compiled.panels.find((panel) => panel.id === 'split:main/resizer:0');
  assert.ok(resizer, 'expected a compiled resizer panel');
  assert.equal(resizer.panelType, 'split-resizer');
  assert.deepEqual(resizer.size, [0.006, 0.8]);
  let hit = resizer.primitives.find((primitive) => primitive.hit);
  assert.equal(hit.hit.actionId, 'drag-resizer');
  assert.equal(hit.hit.targetId, 'split:main/resizer:0');
  assert.equal(hit.hit.intent, 'layout-resize');
});

test('compileSpatialSnapshot keeps text, resolved styles, and action provenance', () => {
  let compiled = compileSpatialSnapshot(createReferenceSnapshot(), { planeWidth: 1.28 });
  let title = primitivesOf(compiled, 'panel:project')
    .find((primitive) => primitive.spatialNodeId === 'panel:project/title');
  assert.equal(title.kind, 'label');
  assert.equal(title.text, 'Project');
  assert.equal(title.style.color, 'rgb(240, 240, 240)');
  assert.equal(title.style.font.size, '13px');

  let surface = primitivesOf(compiled, 'panel:project')
    .find((primitive) => primitive.spatialNodeId === 'panel:project');
  assert.equal(surface.kind, 'surface');
  assert.equal(surface.layer, 'surface');
  assert.equal(surface.style.background, 'rgb(32, 32, 32)');

  let rowHit = primitivesOf(compiled, 'panel:project')
    .find((primitive) => primitive.spatialNodeId === 'panel:project/row:src' && primitive.hit);
  assert.equal(rowHit.layer, 'controls');
  assert.deepEqual(rowHit.hit, {
    id: 'panel:project/row:src/hit/select-row',
    actionId: 'select-row',
    targetId: 'src',
    intent: 'sn-tree-select',
  });

  let editor = primitivesOf(compiled, 'panel:source')
    .find((primitive) => primitive.spatialNodeId === 'panel:source/editor');
  assert.equal(editor.kind, 'label');
  assert.equal(editor.multiline, true);
  assert.equal(editor.text, 'const a = 1;\nconst b = 2;');

  let save = primitivesOf(compiled, 'panel:source')
    .find((primitive) => primitive.spatialNodeId === 'panel:source/control:save' && primitive.hit);
  assert.equal(save.kind, 'control');
  assert.equal(save.text, 'Save');
  assert.equal(save.style.background, 'rgb(76, 139, 245)');
});

test('compileSpatialSnapshot wires measured window headers into the native drag-panel contract', () => {
  let compiled = compileSpatialSnapshot(createReferenceSnapshot(), { planeWidth: 1.28 });
  let header = primitivesOf(compiled, 'panel:project')
    .find((primitive) => primitive.spatialNodeId === 'panel:project/header');
  assert.deepEqual(header.hit, {
    id: 'panel:project/header/hit/drag-panel',
    actionId: 'drag-panel',
    targetId: 'panel:project',
    intent: 'panel-drag',
  });
});

test('compileSpatialSnapshot converts panel-relative bounds to meters', () => {
  let compiled = compileSpatialSnapshot(createReferenceSnapshot(), { planeWidth: 1.28 });
  let title = primitivesOf(compiled, 'panel:project')
    .find((primitive) => primitive.spatialNodeId === 'panel:project/title');
  // title center px (100, 17); panel center px (160, 400) → local ( -60px, +383px ) → meters
  assert.ok(Math.abs(title.bounds.x - (-0.06)) < 1e-6);
  assert.ok(Math.abs(title.bounds.y - 0.383) < 1e-6);
  assert.ok(Math.abs(title.bounds.width - 0.18) < 1e-6);
  assert.ok(Math.abs(title.bounds.height - 0.018) < 1e-6);
});

test('compileSpatialSnapshot assigns finite layer depths compatible with the renderer', () => {
  let compiled = compileSpatialSnapshot(createReferenceSnapshot(), { planeWidth: 1.28 });
  for (let panel of compiled.panels) {
    let byLayer = new Map();
    for (let primitive of panel.primitives) {
      assert.ok(Number.isFinite(primitive.z), `primitive "${primitive.id}" needs a finite z`);
      let list = byLayer.get(primitive.layer) || [];
      list.push(primitive.z);
      byLayer.set(primitive.layer, list);
    }
    for (let [layer, depths] of byLayer) {
      assert.equal(new Set(depths).size, depths.length, `duplicate z in layer "${layer}"`);
    }
  }
});

test('compileSpatialSnapshot keeps one spatial window per leaf panel and resizers as layout controls', () => {
  let snapshot = createReferenceSnapshot();
  let compiled = compileSpatialSnapshot(snapshot, { planeWidth: 1.28 });
  let panelNodeIds = snapshot.nodes.filter((node) => node.part === 'panel').map((node) => node.id);
  let resizerNodeIds = snapshot.nodes.filter((node) => node.part === 'resizer').map((node) => node.id);
  assert.equal(panelNodeIds.length, 3);
  assert.equal(resizerNodeIds.length, 2);

  assert.equal(compiled.counts.windows, 3);
  assert.equal(compiled.counts.layoutControls, 2);
  assert.equal(compiled.counts.panels, 5);

  let windows = compiled.panels.filter((panel) => panel.role === 'window');
  let layoutControls = compiled.panels.filter((panel) => panel.role === 'layout-control');
  assert.deepEqual(windows.map((panel) => panel.id).sort(), [...panelNodeIds].sort());
  assert.deepEqual(layoutControls.map((panel) => panel.id).sort(), [...resizerNodeIds].sort());
  assert.equal(new Set(windows.map((panel) => panel.id)).size, windows.length);
  for (let window of windows) {
    assert.equal(window.metadata.spatialNodeId, window.id);
    assert.ok(panelNodeIds.includes(window.metadata.spatialNodeId));
    let foreign = window.primitives.filter(
      (primitive) => primitive.spatialNodeId && !primitive.spatialNodeId.startsWith(`${window.id}/`)
        && primitive.spatialNodeId !== window.id,
    );
    assert.deepEqual(foreign, [], `window "${window.id}" must own only its own subtree primitives`);
  }
  for (let control of layoutControls) {
    assert.equal(control.panelType, 'split-resizer');
    let hits = control.primitives.filter((primitive) => primitive.hit);
    assert.ok(hits.length > 0, `layout control "${control.id}" keeps its drag hit`);
    assert.ok(hits.every((primitive) => primitive.hit.intent === 'layout-resize'));
  }
});

test('compileSpatialSnapshot keeps nested window content out of the ancestor window', () => {
  let compiled = compileSpatialSnapshot({
    version: 'spatial-snapshot-v1',
    unit: 'css-pixel',
    coordinateSpace: 'capture-root-relative',
    capture: { viewport: { width: 800, height: 600 } },
    nodes: [
      {
        id: 'panel:outer',
        parentId: null,
        component: 'layout-node',
        part: 'panel',
        rect: { x: 0, y: 0, width: 800, height: 600 },
        style: { 'background-color': 'rgb(32, 32, 32)' },
      },
      {
        id: 'panel:outer/title',
        parentId: 'panel:outer',
        component: 'layout-node',
        part: 'title',
        rect: { x: 10, y: 8, width: 120, height: 18 },
        style: { color: 'rgb(240, 240, 240)', 'font-size': '13px' },
        text: 'Outer',
      },
      {
        id: 'panel:outer/panel:nested',
        parentId: 'panel:outer',
        component: 'layout-node',
        part: 'panel',
        rect: { x: 20, y: 40, width: 300, height: 200 },
        style: { 'background-color': 'rgb(40, 40, 40)' },
      },
      {
        id: 'panel:outer/panel:nested/title',
        parentId: 'panel:outer/panel:nested',
        component: 'layout-node',
        part: 'title',
        rect: { x: 30, y: 48, width: 120, height: 18 },
        style: { color: 'rgb(240, 240, 240)', 'font-size': '13px' },
        text: 'Nested',
      },
      {
        id: 'panel:outer/panel:nested/icon:star',
        parentId: 'panel:outer/panel:nested',
        component: 'layout-node',
        part: 'icon',
        rect: { x: 260, y: 48, width: 20, height: 20 },
        style: {
          color: 'rgb(153, 153, 153)',
          'font-family': "'Material Symbols Outlined'",
          'font-size': '20px',
        },
        icon: { name: 'star' },
      },
    ],
  }, { planeWidth: 0.8 });
  assert.equal(compiled.counts.windows, 2);
  let nested = compiled.panels.find((panel) => panel.id === 'panel:outer/panel:nested');
  assert.ok(nested, 'expected the nested window');
  let nestedNodeIds = nested.primitives.map((primitive) => primitive.spatialNodeId);
  assert.ok(nestedNodeIds.includes('panel:outer/panel:nested/title'));
  assert.ok(nestedNodeIds.includes('panel:outer/panel:nested/icon:star'));
  let outer = compiled.panels.find((panel) => panel.id === 'panel:outer');
  assert.ok(outer, 'expected the outer window');
  let leaked = outer.primitives.filter(
    (primitive) => primitive.spatialNodeId?.startsWith('panel:outer/panel:nested'),
  );
  assert.deepEqual(leaked, [], 'nested window content must not duplicate into the outer window');
});

test('compileSpatialSnapshot rejects unknown parts with supported options', () => {
  let snapshot = createReferenceSnapshot();
  snapshot.nodes[2] = { ...snapshot.nodes[2], part: 'carousel' };
  assert.throws(
    () => compileSpatialSnapshot(snapshot, { planeWidth: 1.28 }),
    /Unknown spatial snapshot part "carousel"\. Supported:/,
  );
});

test('compileSpatialSnapshot rejects invalid snapshots and invalid plane width', () => {
  let snapshot = createReferenceSnapshot();
  snapshot.nodes = [];
  assert.throws(() => compileSpatialSnapshot(snapshot), /non-empty nodes array/);
  assert.throws(
    () => compileSpatialSnapshot(createReferenceSnapshot(), { planeWidth: 0 }),
    /positive finite/,
  );
});

test('compileSpatialSnapshot is deterministic across repeated compiles', () => {
  let a = compileSpatialSnapshot(createReferenceSnapshot(), { planeWidth: 1.28 });
  let b = compileSpatialSnapshot(createReferenceSnapshot(), { planeWidth: 1.28 });
  assert.equal(JSON.stringify(a), JSON.stringify(b));
});

test('compileSpatialSnapshot compiles icon nodes into content-layer icon primitives with source CSS pixels', () => {
  let compiled = compileSpatialSnapshot(createReferenceSnapshot(), { planeWidth: 1.28 });
  let icon = primitivesOf(compiled, 'panel:project')
    .find((primitive) => primitive.spatialNodeId === 'panel:project/row:src/icon:folder');
  assert.ok(icon, 'expected a compiled icon primitive');
  assert.equal(icon.kind, 'icon');
  assert.equal(icon.layer, 'content');
  assert.equal(icon.themeRole, 'text');
  assert.equal(icon.icon, 'folder');
  assert.equal(icon.text, undefined, 'icon primitives never carry text');
  assert.deepEqual(icon.sourcePixels, { width: 20, height: 20 });
  assert.equal(icon.style.font.family, "'Material Symbols Outlined'");
  assert.equal(icon.style.font.size, '20px');
  assert.ok(compiled.counts.byKind.icon >= 2, 'icon primitives are counted by kind');
});

test('compileSpatialSnapshot keeps icon primitives above their owning control or surface', () => {
  let compiled = compileSpatialSnapshot(createReferenceSnapshot(), { planeWidth: 1.28 });
  let primitives = primitivesOf(compiled, 'panel:project');

  let toggle = primitives.find(
    (primitive) => primitive.spatialNodeId === 'panel:project/row:src/control:toggle-row'
      && primitive.kind === 'control',
  );
  let toggleIcon = primitives.find(
    (primitive) => primitive.spatialNodeId === 'panel:project/row:src/control:toggle-row/icon:expand_more',
  );
  assert.ok(toggleIcon, 'expected the toggle glyph icon primitive');
  assert.ok(toggleIcon.z > toggle.z, 'toggle glyph renders above its owning control');

  let rowSurface = primitives.find(
    (primitive) => primitive.spatialNodeId === 'panel:project/row:src' && primitive.kind === 'surface',
  );
  let rowIcon = primitives.find(
    (primitive) => primitive.spatialNodeId === 'panel:project/row:src/icon:folder',
  );
  assert.ok(rowSurface, 'expected the row surface primitive');
  assert.ok(rowIcon.z > rowSurface.z, 'row glyph renders above its owning surface');
});

function createChromeSnapshot(nodes) {
  return {
    version: 'spatial-snapshot-v1',
    unit: 'css-pixel',
    coordinateSpace: 'capture-root-relative',
    capture: { viewport: { width: 1280, height: 800 } },
    nodes: [
      {
        id: 'panel:project',
        parentId: null,
        component: 'layout-node',
        part: 'panel',
        rect: { x: 0, y: 0, width: 320, height: 800 },
        style: { 'background-color': 'rgb(32, 32, 32)' },
      },
      ...nodes,
    ],
  };
}

function chromeNode(overrides) {
  return {
    parentId: 'panel:project',
    component: 'sn-tree-panel',
    rect: { x: 8, y: 40, width: 100, height: 20 },
    ...overrides,
  };
}

test('compileSpatialSnapshot compiles a chromeless control as a transparent hit, not a button', () => {
  let compiled = compileSpatialSnapshot(createChromeSnapshot([
    chromeNode({
      id: 'panel:project/control:toggle-collapse',
      part: 'control',
      actions: [{ id: 'toggle-collapse', targetId: 'panel:project', intent: 'panel-collapse-toggle' }],
    }),
  ]), { planeWidth: 1.28 });
  let primitives = primitivesOf(compiled, 'panel:project')
    .filter((primitive) => primitive.spatialNodeId === 'panel:project/control:toggle-collapse');
  assert.equal(primitives.length, 1);
  assert.equal(primitives[0].kind, 'control');
  assert.equal(primitives[0].control, 'hit', 'chromeless control compiles to a transparent hit region');
  assert.equal(primitives[0].style, undefined, 'transparent hit carries no visible style');
  assert.deepEqual(primitives[0].hit, {
    id: 'panel:project/control:toggle-collapse/hit/toggle-collapse',
    actionId: 'toggle-collapse',
    targetId: 'panel:project',
    intent: 'panel-collapse-toggle',
  });
});

test('compileSpatialSnapshot keeps controls with background or border chrome as buttons', () => {
  let compiled = compileSpatialSnapshot(createChromeSnapshot([
    chromeNode({
      id: 'panel:project/control:save',
      part: 'control',
      style: { 'background-color': 'rgb(76, 139, 245)', 'color': 'rgb(255, 255, 255)' },
      text: 'Save',
      actions: [{ id: 'save', targetId: 'save', intent: 'source-editor-save' }],
    }),
    chromeNode({
      id: 'panel:project/control:collapse-all',
      part: 'control',
      style: {
        'border-width': '1px',
        'border-style': 'solid',
        'border-color': 'rgb(60, 60, 60)',
      },
      actions: [{ id: 'collapse-all', targetId: 'panel:project', intent: 'sn-tree-panel-collapse' }],
    }),
  ]), { planeWidth: 1.28 });
  let save = primitivesOf(compiled, 'panel:project')
    .find((primitive) => primitive.spatialNodeId === 'panel:project/control:save' && primitive.kind === 'control');
  assert.equal(save.control, 'button', 'background chrome stays a visible button');
  assert.equal(save.style.background, 'rgb(76, 139, 245)');
  let bordered = primitivesOf(compiled, 'panel:project')
    .find((primitive) => primitive.spatialNodeId === 'panel:project/control:collapse-all' && primitive.kind === 'control');
  assert.equal(bordered.control, 'button', 'uniform border chrome stays a visible button');
  assert.deepEqual(bordered.style.border, { width: 0.001, color: 'rgb(60, 60, 60)' });
});

test('compileSpatialSnapshot treats zero-alpha borders as chromeless controls', () => {
  let compiled = compileSpatialSnapshot(createChromeSnapshot([
    chromeNode({
      id: 'panel:project/control:collapse-all',
      part: 'control',
      style: {
        'border-width': '1px',
        'border-style': 'solid',
        'border-color': 'rgba(158, 158, 158, 0)',
        color: 'rgb(172, 172, 172)',
      },
      actions: [{ id: 'collapse-all', targetId: 'panel:project', intent: 'sn-tree-panel-collapse' }],
    }),
  ]), { planeWidth: 1.28 });
  let control = primitivesOf(compiled, 'panel:project')
    .find((primitive) => primitive.spatialNodeId === 'panel:project/control:collapse-all');
  assert.equal(control.control, 'hit');
  assert.equal(control.style, undefined);
});

test('compileSpatialSnapshot keeps a zero-alpha surface base transparent', () => {
  let compiled = compileSpatialSnapshot(createChromeSnapshot([
    chromeNode({
      id: 'panel:project/surface:transparent',
      part: 'surface',
      style: {
        'background-color': 'rgba(14, 36, 44, 0)',
        'border-width': '1px',
        'border-style': 'solid',
        'border-color': 'rgb(60, 60, 60)',
      },
    }),
  ]), { planeWidth: 1.28 });
  let surface = primitivesOf(compiled, 'panel:project')
    .find((primitive) => primitive.spatialNodeId === 'panel:project/surface:transparent');
  assert.equal(surface.transparent, true);
  assert.equal(surface.style.background, undefined);
  assert.deepEqual(surface.style.border, { width: 0.001, color: 'rgb(60, 60, 60)' });
});

test('compileSpatialSnapshot compiles badge nodes into surface and label primitives', () => {
  let compiled = compileSpatialSnapshot(createChromeSnapshot([
    chromeNode({
      id: 'panel:project/row:src/badge:graph',
      part: 'badge',
      style: { 'background-color': 'rgb(40, 60, 90)', 'color': 'rgb(153, 153, 153)', 'font-size': '11px' },
      text: 'graph',
    }),
  ]), { planeWidth: 1.28 });
  let primitives = primitivesOf(compiled, 'panel:project')
    .filter((primitive) => primitive.spatialNodeId === 'panel:project/row:src/badge:graph');
  let surface = primitives.find((primitive) => primitive.kind === 'surface');
  assert.ok(surface, 'badge compiles a surface primitive');
  assert.equal(surface.layer, 'content');
  assert.equal(surface.style.background, 'rgb(40, 60, 90)');
  let label = primitives.find((primitive) => primitive.kind === 'label');
  assert.ok(label, 'badge compiles a label primitive');
  assert.equal(label.text, 'graph');
  assert.equal(label.style.color, 'rgb(153, 153, 153)');
  assert.equal(new Set(primitives.map((primitive) => primitive.id)).size, primitives.length);
});

test('compileSpatialSnapshot compiles field nodes into a sunken bordered surface and proxy label', () => {
  let compiled = compileSpatialSnapshot(createChromeSnapshot([
    chromeNode({
      id: 'panel:project/field:filter',
      part: 'field',
      rect: { x: 8, y: 64, width: 220, height: 26 },
      style: {
        'background-color': 'rgb(20, 20, 20)',
        'color': 'rgb(153, 153, 153)',
        'font-size': '12px',
        'border-width': '1px',
        'border-style': 'solid',
        'border-color': 'rgb(60, 60, 60)',
      },
      text: 'Filter project files',
    }),
  ]), { planeWidth: 1.28 });
  let primitives = primitivesOf(compiled, 'panel:project')
    .filter((primitive) => primitive.spatialNodeId === 'panel:project/field:filter');
  let surface = primitives.find((primitive) => primitive.kind === 'surface');
  assert.ok(surface, 'field compiles a surface primitive');
  assert.equal(surface.themeRole, 'surface-sunken');
  assert.equal(surface.style.background, 'rgb(20, 20, 20)');
  assert.deepEqual(surface.style.border, { width: 0.001, color: 'rgb(60, 60, 60)' });
  let label = primitives.find((primitive) => primitive.kind === 'label');
  assert.ok(label, 'field compiles a proxy label');
  assert.equal(label.text, 'Filter project files');
  assert.equal(label.multiline, undefined, 'field proxy text stays single-line');
  assert.equal(new Set(primitives.map((primitive) => primitive.id)).size, primitives.length);
});

test('compileSpatialSnapshot compiles surface nodes and marks evidence-free surfaces transparent', () => {
  let compiled = compileSpatialSnapshot(createChromeSnapshot([
    chromeNode({
      id: 'panel:project/surface:1',
      part: 'surface',
      style: {
        'background-color': 'rgb(39, 39, 39)',
        'border-width': '1px',
        'border-style': 'solid',
        'border-color': 'rgb(60, 60, 60)',
      },
    }),
    chromeNode({
      id: 'panel:project/tree-toolbar',
      part: 'surface',
      rect: { x: 0, y: 64, width: 300, height: 28 },
    }),
  ]), { planeWidth: 1.28 });
  let visible = primitivesOf(compiled, 'panel:project')
    .find((primitive) => primitive.spatialNodeId === 'panel:project/surface:1');
  assert.equal(visible.kind, 'surface');
  assert.equal(visible.transparent, undefined, 'surface with background/border evidence renders visibly');
  assert.equal(visible.style.background, 'rgb(39, 39, 39)');
  assert.deepEqual(visible.style.border, { width: 0.001, color: 'rgb(60, 60, 60)' });
  let transparent = primitivesOf(compiled, 'panel:project')
    .find((primitive) => primitive.spatialNodeId === 'panel:project/tree-toolbar');
  assert.equal(transparent.kind, 'surface');
  assert.equal(transparent.transparent, true, 'surface without visible evidence compiles transparent');
  assert.equal(transparent.style, undefined);
});

test('compileSpatialSnapshot rejects unknown parts listing the new chrome parts', () => {
  let snapshot = createChromeSnapshot([
    chromeNode({ id: 'panel:project/odd', part: 'carousel' }),
  ]);
  assert.throws(
    () => compileSpatialSnapshot(snapshot, { planeWidth: 1.28 }),
    /Unknown spatial snapshot part "carousel"\. Supported: .*badge.*field.*surface/,
  );
});

test('compileSpatialSnapshot preserves source CSS pixels and exact font style on measured label primitives', () => {
  let compiled = compileSpatialSnapshot(createReferenceSnapshot(), { planeWidth: 1.28 });
  let title = primitivesOf(compiled, 'panel:project')
    .find((primitive) => primitive.spatialNodeId === 'panel:project/title');
  assert.deepEqual(title.sourcePixels, { width: 180, height: 18 });
  assert.equal(title.style.font.size, '13px');
  assert.equal(title.style.font.weight, '600');
  assert.equal(title.style.font.family, 'Inter, sans-serif');
  assert.equal(title.style.font.letterSpacing, '0.01em');
  assert.equal(title.style.direction, 'ltr');

  let editor = primitivesOf(compiled, 'panel:source')
    .find((primitive) => primitive.spatialNodeId === 'panel:source/editor');
  assert.deepEqual(editor.sourcePixels, { width: 506, height: 760 });
  assert.equal(editor.style.font.lineHeight, '16px');
});
