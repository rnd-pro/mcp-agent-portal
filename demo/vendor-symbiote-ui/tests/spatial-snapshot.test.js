import { acquireCurrentTestFileLock } from './test-lock.js';
await acquireCurrentTestFileLock(import.meta.url);

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import Ajv2020 from 'ajv/dist/2020.js';
import {
  SPATIAL_ICON_NAME_PATTERN,
  SPATIAL_SNAPSHOT_VERSION,
  normalizeSpatialSnapshot,
  validateSpatialSnapshot,
} from '../xr/spatial-snapshot.js';

function createRawSnapshot() {
  return {
    version: SPATIAL_SNAPSHOT_VERSION,
    unit: 'css-pixel',
    coordinateSpace: 'capture-root-relative',
    capture: {
      viewport: { width: 1280, height: 800 },
      route: 'multi-agent-dev/source-editor',
      themeScope: 'default-provider',
    },
    nodes: [
      {
        id: 'panel:project',
        parentId: null,
        component: 'layout-node',
        part: 'panel',
        rect: { x: 0, y: 0, width: 266, height: 800 },
        style: { 'background-color': 'rgb(32, 32, 32)' },
        state: { collapsed: false },
      },
      {
        id: 'panel:project/title',
        parentId: 'panel:project',
        component: 'layout-node',
        part: 'title',
        rect: { x: 10, y: 8, width: 180, height: 18 },
        style: { 'color': 'rgb(240, 240, 240)', 'font-size': '13px' },
        text: 'Project',
      },
      {
        id: 'panel:project/row:src',
        parentId: 'panel:project',
        component: 'sn-tree-panel',
        part: 'row',
        rect: { x: 8, y: 40, width: 250, height: 28 },
        style: { 'color': 'rgb(240, 240, 240)' },
        text: 'src',
        state: { selected: false, expanded: true },
        actions: [{ id: 'select-row', targetId: 'src', intent: 'sn-tree-select' }],
      },
    ],
    diagnostics: {
      unsupported: [{ feature: 'text-input', nodeId: 'panel:project/filter', detail: 'filter input' }],
      unknownVisible: [],
    },
  };
}

test('exposes the spatial-snapshot-v1 version constant', () => {
  assert.equal(SPATIAL_SNAPSHOT_VERSION, 'spatial-snapshot-v1');
});

test('normalizeSpatialSnapshot returns a canonical serializable snapshot', () => {
  let normalized = normalizeSpatialSnapshot(createRawSnapshot());
  let roundTripped = JSON.parse(JSON.stringify(normalized));
  assert.deepEqual(roundTripped, normalized);
  assert.equal(normalized.version, 'spatial-snapshot-v1');
  assert.equal(normalized.unit, 'css-pixel');
  assert.equal(normalized.coordinateSpace, 'capture-root-relative');
  assert.equal(normalized.nodes.length, 3);
});

test('normalizeSpatialSnapshot is deterministic for equivalent input orderings', () => {
  let first = createRawSnapshot();
  let second = createRawSnapshot();
  second.nodes[0].style = {
    'background-color': 'rgb(32, 32, 32)',
  };
  second.nodes[1].style = {
    'font-size': '13px',
    'color': 'rgb(240, 240, 240)',
  };
  let a = JSON.stringify(normalizeSpatialSnapshot(first));
  let b = JSON.stringify(normalizeSpatialSnapshot(second));
  assert.equal(a, b);
});

test('normalizeSpatialSnapshot rounds geometry deterministically', () => {
  let raw = createRawSnapshot();
  raw.nodes[0].rect = { x: 0.1234567891, y: 0, width: 266.0000004, height: 800 };
  let normalized = normalizeSpatialSnapshot(raw);
  assert.equal(normalized.nodes[0].rect.x, 0.123457);
  assert.equal(normalized.nodes[0].rect.width, 266);
});

test('normalizeSpatialSnapshot defaults missing diagnostics and optional fields', () => {
  let raw = createRawSnapshot();
  delete raw.diagnostics;
  let normalized = normalizeSpatialSnapshot(raw);
  assert.deepEqual(normalized.diagnostics, { unsupported: [], unknownVisible: [] });
  assert.equal(normalized.nodes[1].actions, undefined);
  assert.equal(normalized.nodes[0].text, undefined);
});

test('normalizeSpatialSnapshot rejects a wrong version with supported options', () => {
  let raw = createRawSnapshot();
  raw.version = 'spatial-snapshot-v0';
  assert.throws(() => normalizeSpatialSnapshot(raw), /spatial-snapshot-v1/);
});

test('normalizeSpatialSnapshot rejects duplicate node ids', () => {
  let raw = createRawSnapshot();
  raw.nodes.push({ ...raw.nodes[1] });
  assert.throws(() => normalizeSpatialSnapshot(raw), /Duplicate spatial snapshot node id/);
});

test('normalizeSpatialSnapshot rejects unknown parent references', () => {
  let raw = createRawSnapshot();
  raw.nodes[1].parentId = 'panel:missing';
  assert.throws(() => normalizeSpatialSnapshot(raw), /unknown parent/);
});

test('normalizeSpatialSnapshot rejects non-positive boxes', () => {
  let raw = createRawSnapshot();
  raw.nodes[0].rect = { x: 0, y: 0, width: 0, height: 800 };
  assert.throws(() => normalizeSpatialSnapshot(raw), /positive/);
});

test('normalizeSpatialSnapshot rejects actions without stable target identity', () => {
  let raw = createRawSnapshot();
  raw.nodes[2].actions = [{ id: 'select-row' }];
  assert.throws(() => normalizeSpatialSnapshot(raw), /targetId/);
});

test('validateSpatialSnapshot reports errors without throwing', () => {
  let raw = createRawSnapshot();
  raw.nodes[0].rect = { x: 0, y: 0, width: -4, height: 800 };
  raw.nodes.push({ ...raw.nodes[1] });
  let report = validateSpatialSnapshot(raw);
  assert.equal(report.valid, false);
  assert.ok(report.errors.length >= 2, `expected multiple errors, got ${report.errors.length}`);
  assert.ok(report.errors.every((error) => typeof error === 'string'));
});

test('validateSpatialSnapshot accepts a normalized snapshot', () => {
  let normalized = normalizeSpatialSnapshot(createRawSnapshot());
  let report = validateSpatialSnapshot(normalized);
  assert.deepEqual(report, { valid: true, errors: [] });
});

test('schemas/spatial-snapshot-v1.json validates a normalized snapshot via Ajv', async () => {
  let schema = JSON.parse(await readFile(new URL('../schemas/spatial-snapshot-v1.json', import.meta.url), 'utf8'));
  let ajv = new Ajv2020({ allErrors: true, strict: true });
  let validate = ajv.compile(schema);
  let normalized = normalizeSpatialSnapshot(createRawSnapshot());
  let valid = validate(normalized);
  assert.equal(valid, true, JSON.stringify(validate.errors, null, 2));
});

test('schemas/spatial-snapshot-v1.json rejects invalid snapshots via Ajv', async () => {
  let schema = JSON.parse(await readFile(new URL('../schemas/spatial-snapshot-v1.json', import.meta.url), 'utf8'));
  let ajv = new Ajv2020({ allErrors: true, strict: true });
  let validate = ajv.compile(schema);
  let raw = createRawSnapshot();
  raw.nodes[0].rect = { x: 0, y: 0, width: -2, height: 800 };
  assert.equal(validate(normalizeSpatialSnapshotSafe(raw)), false);
});

function normalizeSpatialSnapshotSafe(raw) {
  let clone = JSON.parse(JSON.stringify(raw));
  return clone;
}

test('spatial snapshot modules stay Node-safe without a DOM', () => {
  assert.equal(typeof document, 'undefined');
  assert.equal(typeof normalizeSpatialSnapshot, 'function');
  assert.equal(typeof validateSpatialSnapshot, 'function');
});

function createIconNode(overrides = {}) {
  return {
    id: 'panel:project/icon:folder',
    parentId: 'panel:project',
    component: 'layout-node',
    part: 'icon',
    rect: { x: 10, y: 30, width: 16, height: 16 },
    icon: { name: 'folder' },
    ...overrides,
  };
}

test('exposes the Material Symbols ligature name pattern', () => {
  assert.equal(SPATIAL_ICON_NAME_PATTERN.test('expand_more'), true);
  assert.equal(SPATIAL_ICON_NAME_PATTERN.test('folder_open2'), true);
  assert.equal(SPATIAL_ICON_NAME_PATTERN.test('Not A Glyph'), false);
  assert.equal(SPATIAL_ICON_NAME_PATTERN.test(''), false);
  assert.equal(SPATIAL_ICON_NAME_PATTERN.test('ArrowDropDown'), false);
});

test('normalizeSpatialSnapshot preserves validated icon descriptors on icon nodes', () => {
  let raw = createRawSnapshot();
  raw.nodes.push(createIconNode());
  let normalized = normalizeSpatialSnapshot(raw);
  let icon = normalized.nodes.find((node) => node.part === 'icon');
  assert.deepEqual(icon.icon, { name: 'folder' });
  assert.equal(icon.text, undefined, 'icon nodes never carry text');
});

test('normalizeSpatialSnapshot rejects icon nodes that also carry text', () => {
  let raw = createRawSnapshot();
  raw.nodes.push(createIconNode({ text: 'folder' }));
  assert.throws(() => normalizeSpatialSnapshot(raw), /both icon and text/);
});

test('normalizeSpatialSnapshot requires an icon descriptor on part "icon" nodes', () => {
  let raw = createRawSnapshot();
  let node = createIconNode();
  delete node.icon;
  raw.nodes.push(node);
  assert.throws(() => normalizeSpatialSnapshot(raw), /requires an icon \{ name \} descriptor/);
});

test('normalizeSpatialSnapshot requires icon descriptors only on part "icon" nodes', () => {
  let raw = createRawSnapshot();
  raw.nodes.push(createIconNode({ part: 'control' }));
  assert.throws(() => normalizeSpatialSnapshot(raw), /icon descriptor requires part "icon"/);
});

test('normalizeSpatialSnapshot rejects invalid Material Symbols ligature names', () => {
  let raw = createRawSnapshot();
  raw.nodes.push(createIconNode({ icon: { name: 'Not A Glyph' } }));
  assert.throws(() => normalizeSpatialSnapshot(raw), /ligature/);
});

test('validateSpatialSnapshot reports icon contract violations without throwing', () => {
  let raw = createRawSnapshot();
  raw.nodes.push(createIconNode({ text: 'folder' }));
  let report = validateSpatialSnapshot(raw);
  assert.equal(report.valid, false);
  assert.ok(report.errors.some((error) => error.includes('both icon and text')));
});

test('schemas/spatial-snapshot-v1.json validates icon nodes and enforces the icon contract', async () => {
  let schema = JSON.parse(await readFile(new URL('../schemas/spatial-snapshot-v1.json', import.meta.url), 'utf8'));
  let ajv = new Ajv2020({ allErrors: true, strict: true });
  let validate = ajv.compile(schema);

  let valid = createRawSnapshot();
  valid.nodes.push(createIconNode());
  assert.equal(validate(valid), true, JSON.stringify(validate.errors, null, 2));

  let withText = createRawSnapshot();
  withText.nodes.push(createIconNode({ text: 'folder' }));
  assert.equal(validate(withText), false, 'icon nodes must not carry text');

  let wrongPart = createRawSnapshot();
  wrongPart.nodes.push(createIconNode({ part: 'control' }));
  assert.equal(validate(wrongPart), false, 'icon descriptors require part "icon"');

  let missingIcon = createRawSnapshot();
  let node = createIconNode();
  delete node.icon;
  missingIcon.nodes.push(node);
  assert.equal(validate(missingIcon), false, 'part "icon" requires an icon descriptor');

  let badName = createRawSnapshot();
  badName.nodes.push(createIconNode({ icon: { name: 'Not A Glyph' } }));
  assert.equal(validate(badName), false, 'icon names must be Material Symbols ligatures');
});
