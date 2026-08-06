import { acquireCurrentTestFileLock } from './test-lock.js';
await acquireCurrentTestFileLock(import.meta.url);

import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  SPATIAL_CAPTURE_COMPONENTS,
  SPATIAL_HEADER_CONTROLS,
  SPATIAL_ICON_SELECTOR,
  captureSpatialSnapshot,
  captureSpatialWindowSnapshot,
  createCanvasColorNormalizer,
  resolveHeaderControlSelector,
  resolveSpatialAdapter,
} from '../xr/dom-spatial-capture.js';

test('dom-spatial-capture evaluates safely in Node without a DOM', () => {
  assert.equal(typeof document, 'undefined');
  assert.deepEqual([...SPATIAL_CAPTURE_COMPONENTS].sort(), [
    'layout-node',
    'sn-tree-panel',
    'source-editor',
  ]);
});

test('resolveSpatialAdapter returns adapters for registered components', () => {
  for (let component of SPATIAL_CAPTURE_COMPONENTS) {
    let adapter = resolveSpatialAdapter(component);
    assert.equal(typeof adapter.capture, 'function');
  }
});

test('resolveSpatialAdapter throws with supported options on unknown components', () => {
  assert.throws(
    () => resolveSpatialAdapter('marquee'),
    /Unknown spatial capture adapter "marquee"\. Supported: layout-node, sn-tree-panel, source-editor\./,
  );
});

test('captureSpatialSnapshot requires an element root', () => {
  assert.throws(() => captureSpatialSnapshot(null), /root element/);
  assert.throws(() => captureSpatialSnapshot({}), /root element/);
});

function createFakeColorContext(conversions) {
  let fill = null;
  let drawn = [0, 0, 0, 0];
  return {
    get fillStyle() {
      return fill;
    },
    set fillStyle(value) {
      if (conversions.has(value)) fill = value;
    },
    clearRect() {
      drawn = [0, 0, 0, 0];
    },
    fillRect() {
      drawn = conversions.get(fill) || [0, 0, 0, 0];
    },
    getImageData() {
      return { data: [...drawn] };
    },
  };
}

function createFakeDocument(conversions) {
  return {
    defaultView: {
      getComputedStyle(element) {
        return { getPropertyValue: (key) => element.__styles?.[key] || '' };
      },
    },
    createElement(tag) {
      assert.equal(tag, 'canvas');
      return {
        width: 0,
        height: 0,
        getContext(kind) {
          assert.equal(kind, '2d');
          return createFakeColorContext(conversions);
        },
      };
    },
  };
}

function fakeElement(doc, options) {
  let {
    tag,
    rect,
    attrs = {},
    queries = {},
    queriesAll = {},
    children = [],
    childNodes = [],
    styles = {},
    text = '',
    dataset = {},
    matches,
    hidden = false,
  } = options;
  return {
    tagName: tag.toUpperCase(),
    ownerDocument: doc,
    dataset,
    children,
    childNodes,
    hidden,
    nodeType: 1,
    textContent: text,
    __styles: styles,
    getBoundingClientRect: () => rect,
    getAttribute: (name) => (name in attrs ? attrs[name] : null),
    hasAttribute: (name) => name in attrs,
    querySelector: (selector) => queries[selector] || null,
    querySelectorAll: (selector) => queriesAll[selector] || [],
    matches: matches || (() => false),
  };
}

const SENTINEL_CONVERSIONS = Object.freeze([
  ['#010203', [1, 2, 3, 255]],
  ['#040506', [4, 5, 6, 255]],
]);

test('header controls assign distinct stable intents to the panel menu and type buttons', () => {
  let bySelector = new Map(SPATIAL_HEADER_CONTROLS.map((control) => [control.selector, control]));
  assert.deepEqual(bySelector.get('.panel-menu-toggle'), {
    selector: '.panel-menu-toggle',
    actionId: 'open-panel-menu',
    intent: 'panel-menu',
  });
  assert.deepEqual(bySelector.get('.type-btn'), {
    selector: '.type-btn',
    actionId: 'open-type-menu',
    intent: 'panel-type-menu',
  });
  let intents = SPATIAL_HEADER_CONTROLS.map((control) => control.intent);
  assert.equal(new Set(intents).size, intents.length, 'header control intents must be unique');
});

test('resolveHeaderControlSelector maps every header intent to its own DOM control', () => {
  assert.equal(resolveHeaderControlSelector('panel-collapse-toggle'), '.collapse-btn');
  assert.equal(resolveHeaderControlSelector('panel-fullscreen'), '.fullscreen-btn');
  assert.equal(resolveHeaderControlSelector('panel-menu'), '.panel-menu-toggle');
  assert.equal(resolveHeaderControlSelector('panel-type-menu'), '.type-btn');
  assert.throws(
    () => resolveHeaderControlSelector('sn-tree-select'),
    /Unknown header control intent "sn-tree-select"\. Supported: /,
  );
});

test('canvas color normalizer converts CSS Color 4 values to rgb()/rgba() preserving alpha', () => {
  let conversions = new Map([
    ...SENTINEL_CONVERSIONS,
    ['oklch(0.7 0.1 200)', [64, 138, 171, 255]],
    ['oklch(0.6 0.2 30 / 0.5)', [200, 100, 50, 128]],
    ['lab(50% 20 30)', [150, 90, 60, 255]],
    ['transparent', [0, 0, 0, 0]],
  ]);
  let normalize = createCanvasColorNormalizer(createFakeDocument(conversions));
  assert.equal(normalize('oklch(0.7 0.1 200)'), 'rgb(64, 138, 171)');
  assert.equal(normalize('oklch(0.6 0.2 30 / 0.5)'), 'rgba(200, 100, 50, 0.502)');
  assert.equal(normalize('lab(50% 20 30)'), 'rgb(150, 90, 60)');
  assert.equal(normalize('transparent'), 'rgba(0, 0, 0, 0)');
});

test('canvas color normalizer passes rgb()/hex through and reports unconvertible values as null', () => {
  let normalize = createCanvasColorNormalizer(createFakeDocument(new Map(SENTINEL_CONVERSIONS)));
  assert.equal(normalize('rgb(1, 2, 3)'), 'rgb(1, 2, 3)');
  assert.equal(normalize('rgba(1, 2, 3, 0.5)'), 'rgba(1, 2, 3, 0.5)');
  assert.equal(normalize('#AABBCC'), '#AABBCC');
  assert.equal(normalize('var(--sn-sys-accent)'), null);
  assert.equal(normalize(''), null);
  assert.equal(normalize(null), null);
});

test('canvas color normalizer without a document fast-paths rgb and nulls unconvertible colors', () => {
  let normalize = createCanvasColorNormalizer(null);
  assert.equal(normalize('rgb(1, 2, 3)'), 'rgb(1, 2, 3)');
  assert.equal(normalize('#aabbcc'), '#aabbcc');
  assert.equal(normalize('oklch(0.7 0.1 200)'), null);
});

function createFakePanelLayout(doc) {
  let collapseBtn = fakeElement(doc, {
    tag: 'button',
    rect: { left: 720, top: 4, width: 20, height: 20 },
    styles: { 'background-color': 'oklch(0.7 0.1 200)', 'color': 'rgb(255, 255, 255)' },
  });
  let fullscreenBtn = fakeElement(doc, {
    tag: 'button',
    rect: { left: 744, top: 4, width: 20, height: 20 },
    styles: { 'background-color': 'var(--unresolved-token)' },
  });
  let menuToggle = fakeElement(doc, {
    tag: 'button',
    rect: { left: 768, top: 4, width: 20, height: 20 },
  });
  let typeBtn = fakeElement(doc, {
    tag: 'button',
    rect: { left: 696, top: 4, width: 20, height: 20 },
  });
  let title = fakeElement(doc, {
    tag: 'span',
    rect: { left: 8, top: 4, width: 120, height: 20 },
    text: 'Project',
    childNodes: [{ nodeType: 3, textContent: 'Project' }],
    styles: { 'color': 'oklch(0.6 0.2 30 / 0.5)', 'font-size': '13px' },
  });
  let header = fakeElement(doc, {
    tag: 'div',
    rect: { left: 0, top: 0, width: 800, height: 28 },
    styles: { 'background-color': 'oklch(0.4 0.05 250)' },
    queries: {
      '.panel-title': title,
      '.collapse-btn': collapseBtn,
      '.fullscreen-btn': fullscreenBtn,
      '.panel-menu-toggle': menuToggle,
      '.type-btn': typeBtn,
    },
  });
  let panelComponent = { tagName: 'PROJECT-PANEL', dataset: { panelId: 'project' } };
  let content = fakeElement(doc, {
    tag: 'div',
    rect: { left: 0, top: 28, width: 800, height: 572 },
    children: [],
  });
  let layoutNode = fakeElement(doc, {
    tag: 'layout-node',
    rect: { left: 0, top: 0, width: 800, height: 600 },
    attrs: { 'node-type': 'panel' },
    styles: { 'background-color': 'rgb(32, 32, 32)' },
    queries: {
      ':scope > .panel-view > .panel-content > [data-panel-id]': panelComponent,
      ':scope > .panel-view > .panel-header': header,
      ':scope > .panel-view > .panel-content': content,
    },
  });
  return fakeElement(doc, {
    tag: 'panel-layout',
    rect: { left: 0, top: 0, width: 800, height: 600 },
    children: [layoutNode],
  });
}

test('captureSpatialWindowSnapshot captures exactly one leaf layout window', () => {
  let doc = createFakeDocument(new Map(SENTINEL_CONVERSIONS));
  let layout = createFakePanelLayout(doc);
  let snapshot = captureSpatialWindowSnapshot(layout.children[0], {
    route: 'multi-agent-dev/source-editor',
    themeScope: 'global',
  });

  assert.deepEqual(snapshot.capture.viewport, { width: 800, height: 600 });
  assert.equal(snapshot.capture.route, 'multi-agent-dev/source-editor');
  assert.equal(snapshot.capture.themeScope, 'global');
  assert.equal(snapshot.nodes.filter((node) => node.part === 'panel').length, 1);
  assert.equal(snapshot.nodes.find((node) => node.part === 'panel').id, 'panel:project');
  assert.throws(
    () => captureSpatialWindowSnapshot(layout),
    /leaf layout-node\[node-type="panel"\]/,
  );
});

test('captureSpatialSnapshot assigns distinct intents to panel menu and type button controls', () => {
  let doc = createFakeDocument(new Map(SENTINEL_CONVERSIONS));
  let snapshot = captureSpatialSnapshot(createFakePanelLayout(doc));
  let byId = new Map(snapshot.nodes.map((node) => [node.id, node]));

  let menuControl = byId.get('panel:project/control:open-panel-menu');
  assert.ok(menuControl, 'panel menu control is captured');
  assert.deepEqual(menuControl.actions, [{ id: 'open-panel-menu', targetId: 'panel:project', intent: 'panel-menu' }]);

  let typeControl = byId.get('panel:project/control:open-type-menu');
  assert.ok(typeControl, 'type menu control is captured');
  assert.deepEqual(typeControl.actions, [{ id: 'open-type-menu', targetId: 'panel:project', intent: 'panel-type-menu' }]);

  let collapseControl = byId.get('panel:project/control:toggle-collapse');
  assert.deepEqual(collapseControl.actions, [{ id: 'toggle-collapse', targetId: 'panel:project', intent: 'panel-collapse-toggle' }]);
  let fullscreenControl = byId.get('panel:project/control:toggle-fullscreen');
  assert.deepEqual(fullscreenControl.actions, [{ id: 'toggle-fullscreen', targetId: 'panel:project', intent: 'panel-fullscreen' }]);
});

test('captureSpatialSnapshot normalizes CSS Color 4 styles to rgb()/rgba() and diagnoses unconvertible colors', () => {
  let conversions = new Map([
    ...SENTINEL_CONVERSIONS,
    ['oklch(0.7 0.1 200)', [64, 138, 171, 255]],
    ['oklch(0.6 0.2 30 / 0.5)', [200, 100, 50, 128]],
    ['oklch(0.4 0.05 250)', [70, 72, 80, 255]],
  ]);
  let doc = createFakeDocument(conversions);
  let snapshot = captureSpatialSnapshot(createFakePanelLayout(doc));
  for (let node of snapshot.nodes) {
    for (let value of Object.values(node.style || {})) {
      assert.ok(!value.includes('oklch('), `no oklch() style survives capture on "${node.id}"`);
      assert.ok(!value.includes('var('), `no unresolved var() style survives capture on "${node.id}"`);
    }
  }

  let byId = new Map(snapshot.nodes.map((node) => [node.id, node]));
  assert.equal(byId.get('panel:project/header').style['background-color'], 'rgb(70, 72, 80)');
  assert.equal(byId.get('panel:project/title').style.color, 'rgba(200, 100, 50, 0.502)');
  assert.equal(byId.get('panel:project/control:toggle-collapse').style['background-color'], 'rgb(64, 138, 171)');
  assert.equal(
    byId.get('panel:project/control:toggle-fullscreen').style?.['background-color'],
    undefined,
    'unconvertible color is dropped instead of forwarded to the renderer',
  );

  let colorDiagnostics = snapshot.diagnostics.unsupported.filter((entry) => entry.feature === 'unconvertible-color');
  assert.equal(colorDiagnostics.length, 1);
  assert.match(colorDiagnostics[0].detail, /background-color/);
  assert.match(colorDiagnostics[0].detail, /var\(--unresolved-token\)/);
});

function fakeTextNode(text) {
  return { nodeType: 3, textContent: text };
}

function fakeIconElement(doc, options) {
  let { rect, name, styles = {}, tag = 'span' } = options;
  return fakeElement(doc, {
    tag,
    rect,
    text: name,
    styles: {
      color: 'rgb(180, 180, 180)',
      'font-family': "'Material Symbols Outlined'",
      'font-size': '16px',
      'font-weight': '400',
      ...styles,
    },
    childNodes: [fakeTextNode(name)],
    matches: (selector) => selector === SPATIAL_ICON_SELECTOR,
  });
}

function createHeaderIconPanelLayout(doc, options = {}) {
  let collapseIcon = fakeIconElement(doc, {
    rect: { left: 722, top: 6, width: 16, height: 16 },
    name: 'unfold_less',
  });
  let collapseBtn = fakeElement(doc, {
    tag: 'button',
    rect: { left: 720, top: 4, width: 20, height: 20 },
    queriesAll: { [SPATIAL_ICON_SELECTOR]: [collapseIcon] },
  });
  let panelIcon = fakeIconElement(doc, {
    rect: { left: 698, top: 6, width: 16, height: 16 },
    name: 'folder',
  });
  let dropdownIcon = fakeIconElement(doc, {
    rect: { left: 758, top: 6, width: 14, height: 16 },
    name: 'arrow_drop_down',
  });
  let title = fakeElement(doc, {
    tag: 'span',
    rect: { left: 716, top: 4, width: 40, height: 20 },
    text: 'Project',
    childNodes: [fakeTextNode('Project')],
    styles: options.titleStyles || { color: 'rgb(240, 240, 240)', 'font-size': '13px' },
  });
  let typeBtn = fakeElement(doc, {
    tag: 'button',
    rect: { left: 696, top: 4, width: 80, height: 20 },
    queries: { '.panel-title': title },
    queriesAll: { [SPATIAL_ICON_SELECTOR]: [panelIcon, dropdownIcon] },
  });
  let header = fakeElement(doc, {
    tag: 'div',
    rect: { left: 0, top: 0, width: 800, height: 28 },
    queries: {
      '.panel-title': title,
      '.collapse-btn': collapseBtn,
      '.type-btn': typeBtn,
    },
  });
  let panelComponent = { tagName: 'PROJECT-PANEL', dataset: { panelId: 'project' } };
  let content = fakeElement(doc, {
    tag: 'div',
    rect: { left: 0, top: 28, width: 800, height: 572 },
    children: options.contentChildren || [],
  });
  let layoutNode = fakeElement(doc, {
    tag: 'layout-node',
    rect: { left: 0, top: 0, width: 800, height: 600 },
    attrs: { 'node-type': 'panel' },
    queries: {
      ':scope > .panel-view > .panel-content > [data-panel-id]': panelComponent,
      ':scope > .panel-view > .panel-header': header,
      ':scope > .panel-view > .panel-content': content,
    },
  });
  return fakeElement(doc, {
    tag: 'panel-layout',
    rect: { left: 0, top: 0, width: 800, height: 600 },
    children: [layoutNode],
  });
}

const UNIFORM_BORDER_STYLES = Object.freeze({
  'border-top-width': '1px',
  'border-right-width': '1px',
  'border-bottom-width': '1px',
  'border-left-width': '1px',
  'border-top-style': 'solid',
  'border-right-style': 'solid',
  'border-bottom-style': 'solid',
  'border-left-style': 'solid',
  'border-top-color': 'rgb(60, 60, 60)',
  'border-right-color': 'rgb(60, 60, 60)',
  'border-bottom-color': 'rgb(60, 60, 60)',
  'border-left-color': 'rgb(60, 60, 60)',
});

const BOTTOM_BORDER_STYLES = Object.freeze({
  'border-bottom-width': '1px',
  'border-bottom-style': 'solid',
  'border-bottom-color': 'rgb(60, 60, 60)',
});

function fakeBadgeElement(doc, options) {
  let { rect, text } = options;
  return fakeElement(doc, {
    tag: 'span',
    rect,
    text,
    childNodes: [fakeTextNode(text)],
    styles: {
      'background-color': 'rgb(40, 60, 90)',
      'color': 'rgb(153, 153, 153)',
      'font-size': '11px',
    },
  });
}

function createTreePanelLayout(doc, options = {}) {
  let titleIcon = fakeIconElement(doc, {
    rect: { left: 8, top: 38, width: 18, height: 18 },
    name: 'folder',
  });
  let titleRow = fakeElement(doc, {
    tag: 'div',
    rect: { left: 8, top: 36, width: 200, height: 24 },
    text: 'folder Project tree',
    childNodes: [titleIcon, fakeTextNode(' Project tree')],
    styles: { ...BOTTOM_BORDER_STYLES },
    queriesAll: { [SPATIAL_ICON_SELECTOR]: [titleIcon] },
  });
  let toolbarIcon = fakeIconElement(doc, {
    rect: { left: 270, top: 66, width: 18, height: 18 },
    name: 'unfold_less',
  });
  let toolbarIcons = [toolbarIcon, ...(options.extraToolbarIcons || [])];
  let collapseButton = fakeElement(doc, {
    tag: 'sn-button',
    rect: { left: 266, top: 64, width: 26, height: 24 },
    styles: { 'background-color': 'rgb(20, 20, 20)', ...UNIFORM_BORDER_STYLES },
    queriesAll: { [SPATIAL_ICON_SELECTOR]: [toolbarIcon] },
  });
  let toolbar = fakeElement(doc, {
    tag: 'div',
    rect: { left: 0, top: 64, width: 300, height: 28 },
    styles: { ...BOTTOM_BORDER_STYLES },
    queries: { '.sn-tree-panel-collapse': collapseButton },
    queriesAll: { [SPATIAL_ICON_SELECTOR]: toolbarIcons },
  });
  let filter = fakeElement(doc, {
    tag: 'input',
    rect: { left: 4, top: 64, width: 220, height: 24 },
    styles: {
      'background-color': 'rgb(20, 20, 20)',
      'color': 'rgb(153, 153, 153)',
      'font-size': '12px',
      ...UNIFORM_BORDER_STYLES,
    },
  });
  filter.value = options.filterValue ?? '';
  filter.placeholder = 'Filter project files';
  let toggle = fakeIconElement(doc, {
    tag: 'button',
    rect: { left: 4, top: 100, width: 20, height: 20 },
    name: 'expand_more',
  });
  let rowIcon = fakeIconElement(doc, {
    rect: { left: 28, top: 100, width: 20, height: 20 },
    name: 'folder_open',
  });
  let label = fakeElement(doc, {
    tag: 'span',
    rect: { left: 52, top: 100, width: 100, height: 20 },
    text: 'src',
    childNodes: [fakeTextNode('src')],
    styles: { color: 'rgb(240, 240, 240)', 'font-size': '12px' },
  });
  let badges = options.badges === undefined
    ? [
      fakeBadgeElement(doc, { rect: { left: 156, top: 102, width: 40, height: 16 }, text: 'graph' }),
      fakeBadgeElement(doc, { rect: { left: 200, top: 102, width: 36, height: 16 }, text: 'voice' }),
    ]
    : options.badges;
  let row = fakeElement(doc, {
    tag: 'div',
    rect: { left: 0, top: 96, width: 300, height: 28 },
    dataset: { treeId: 'src' },
    attrs: { 'aria-selected': 'true', 'aria-expanded': 'true' },
    queries: {
      '.sn-tree-toggle:not([hidden])': toggle,
      '.sn-tree-icon': rowIcon,
      '.sn-tree-label': label,
    },
    queriesAll: { '.sn-tree-badge': badges },
  });
  let tree = fakeElement(doc, {
    tag: 'sn-tree-panel',
    rect: { left: 0, top: 28, width: 300, height: 500 },
    styles: { 'background-color': 'rgb(24, 24, 24)', ...UNIFORM_BORDER_STYLES },
    queries: {
      '.sn-tree-panel-title': titleRow,
      '.sn-tree-panel-toolbar': toolbar,
      '.sn-tree-panel-filter': filter,
    },
    queriesAll: { '.sn-tree-row': [row] },
  });
  return createHeaderIconPanelLayout(doc, { contentChildren: [tree] });
}

test('captureSpatialSnapshot captures bounded header glyphs as icon nodes under their owning controls', () => {
  let doc = createFakeDocument(new Map(SENTINEL_CONVERSIONS));
  let snapshot = captureSpatialSnapshot(createHeaderIconPanelLayout(doc));
  let byId = new Map(snapshot.nodes.map((node) => [node.id, node]));

  let collapseIcon = byId.get('panel:project/control:toggle-collapse/icon:unfold_less');
  assert.ok(collapseIcon, 'collapse glyph is captured as an icon node');
  assert.equal(collapseIcon.part, 'icon');
  assert.equal(collapseIcon.parentId, 'panel:project/control:toggle-collapse');
  assert.equal(collapseIcon.component, 'layout-node');
  assert.deepEqual(collapseIcon.icon, { name: 'unfold_less' });
  assert.deepEqual(collapseIcon.rect, { x: 722, y: 6, width: 16, height: 16 });
  assert.equal(collapseIcon.style.color, 'rgb(180, 180, 180)');
  assert.equal(collapseIcon.style['font-family'], "'Material Symbols Outlined'");
  assert.equal(collapseIcon.text, undefined, 'icon nodes never carry text');

  let typeIcons = snapshot.nodes.filter(
    (node) => node.part === 'icon' && node.parentId === 'panel:project/control:open-type-menu',
  );
  assert.deepEqual(
    typeIcons.map((node) => node.icon.name).sort(),
    ['arrow_drop_down', 'folder'],
    'both type button glyphs become icon nodes',
  );

  for (let node of snapshot.nodes) {
    assert.ok(
      !node.text || !/unfold_less|arrow_drop_down/.test(node.text),
      `no literal ligature word leaks into text on "${node.id}"`,
    );
  }
});

test('captureSpatialSnapshot captures tree glyphs as icons and keeps titles/labels free of ligature words', () => {
  let doc = createFakeDocument(new Map(SENTINEL_CONVERSIONS));
  let snapshot = captureSpatialSnapshot(createTreePanelLayout(doc));
  let byId = new Map(snapshot.nodes.map((node) => [node.id, node]));

  let title = byId.get('panel:project/tree-title');
  assert.equal(title.text, 'Project tree', 'tree title excludes the icon descendant ligature');

  let titleIcon = byId.get('panel:project/tree-title/icon:folder');
  assert.ok(titleIcon, 'tree title glyph becomes an icon node under the title');
  assert.equal(titleIcon.part, 'icon');
  assert.equal(titleIcon.component, 'sn-tree-panel');
  assert.deepEqual(titleIcon.icon, { name: 'folder' });

  let toolbarIcon = byId.get('panel:project/control:collapse-all/icon:unfold_less');
  assert.ok(toolbarIcon, 'tree toolbar glyph becomes an icon node under the collapse control');
  assert.equal(toolbarIcon.parentId, 'panel:project/control:collapse-all');

  let toggleIcon = byId.get('panel:project/row:src/control:toggle-row/icon:expand_more');
  assert.ok(toggleIcon, 'row toggle glyph becomes an icon node under its owning control');
  assert.equal(toggleIcon.parentId, 'panel:project/row:src/control:toggle-row');
  assert.deepEqual(toggleIcon.icon, { name: 'expand_more' });

  let rowIcon = byId.get('panel:project/row:src/icon:folder_open');
  assert.ok(rowIcon, 'row glyph becomes an icon node under the row');
  assert.equal(rowIcon.parentId, 'panel:project/row:src');

  assert.equal(byId.get('panel:project/row:src/label').text, 'src');
  for (let node of snapshot.nodes) {
    assert.ok(
      !node.text || !/expand_more|folder_open|unfold_less/.test(node.text),
      `no literal ligature word leaks into text on "${node.id}"`,
    );
  }
});

test('captureSpatialSnapshot reports invalid icon glyphs as diagnostics instead of nodes', () => {
  let doc = createFakeDocument(new Map(SENTINEL_CONVERSIONS));
  let invalid = fakeIconElement(doc, {
    rect: { left: 292, top: 66, width: 18, height: 18 },
    name: 'Not A Glyph',
  });
  let snapshot = captureSpatialSnapshot(createTreePanelLayout(doc, { extraToolbarIcons: [invalid] }));
  assert.ok(
    !snapshot.nodes.some((node) => node.icon?.name === 'Not A Glyph'),
    'invalid ligature names never become icon nodes',
  );
  let glyphDiagnostics = snapshot.diagnostics.unsupported.filter((entry) => entry.feature === 'icon-glyph');
  assert.equal(glyphDiagnostics.length, 1);
  assert.match(glyphDiagnostics[0].detail, /Not A Glyph/);
});

test('captureSpatialSnapshot captures the exact renderer-consumed text metrics', () => {
  let doc = createFakeDocument(new Map(SENTINEL_CONVERSIONS));
  let titleStyles = {
    color: 'rgb(240, 240, 240)',
    'font-family': 'Inter, sans-serif',
    'font-size': '13px',
    'font-weight': '600',
    'font-style': 'italic',
    'line-height': '18px',
    'letter-spacing': '0.02em',
    'text-align': 'center',
    direction: 'ltr',
    'white-space': 'nowrap',
    overflow: 'hidden',
    'text-overflow': 'ellipsis',
  };
  let snapshot = captureSpatialSnapshot(createHeaderIconPanelLayout(doc, { titleStyles }));
  let title = snapshot.nodes.find((node) => node.id === 'panel:project/title');
  assert.deepEqual(title.style, titleStyles);
});

test('captureSpatialSnapshot captures walked content glyphs as icons and excludes them from structural text', () => {
  let doc = createFakeDocument(new Map(SENTINEL_CONVERSIONS));
  let inlineIcon = fakeIconElement(doc, {
    rect: { left: 46, top: 40, width: 16, height: 16 },
    name: 'info',
  });
  let intro = fakeElement(doc, {
    tag: 'p',
    rect: { left: 8, top: 36, width: 300, height: 24 },
    text: 'Hello info world',
    childNodes: [fakeTextNode('Hello '), inlineIcon, fakeTextNode(' world')],
    matches: (selector) => selector === '.intro',
    queriesAll: { [SPATIAL_ICON_SELECTOR]: [inlineIcon] },
  });
  let snapshot = captureSpatialSnapshot(
    createHeaderIconPanelLayout(doc, { contentChildren: [intro] }),
    { textSelectors: ['.intro'] },
  );

  let text = snapshot.nodes.find((node) => node.part === 'text');
  assert.equal(text.text, 'Hello world', 'structural text excludes icon descendant ligatures');

  let icon = snapshot.nodes.find((node) => node.part === 'icon' && node.icon?.name === 'info');
  assert.ok(icon, 'walked content glyph becomes an icon node');
  assert.equal(icon.parentId, text.id, 'inline glyph is owned by its structural text node');
  assert.deepEqual(icon.icon, { name: 'info' });
});

test('captureSpatialSnapshot captures tree host chrome as surface nodes with border evidence', () => {
  let doc = createFakeDocument(new Map(SENTINEL_CONVERSIONS));
  let snapshot = captureSpatialSnapshot(createTreePanelLayout(doc));
  let byId = new Map(snapshot.nodes.map((node) => [node.id, node]));

  let host = byId.get('panel:project/tree-host');
  assert.ok(host, 'tree host chrome is captured');
  assert.equal(host.part, 'surface');
  assert.equal(host.component, 'sn-tree-panel');
  assert.equal(host.style['background-color'], 'rgb(24, 24, 24)');
  assert.equal(host.style['border-width'], '1px');
  assert.equal(host.style['border-style'], 'solid');
  assert.equal(host.style['border-color'], 'rgb(60, 60, 60)');

  let titleRow = byId.get('panel:project/tree-title-row');
  assert.ok(titleRow, 'tree title row chrome is captured');
  assert.equal(titleRow.part, 'surface');
  assert.equal(titleRow.style, undefined, 'partial-side borders never become border evidence');

  let toolbar = byId.get('panel:project/tree-toolbar');
  assert.ok(toolbar, 'tree toolbar chrome is captured');
  assert.equal(toolbar.part, 'surface');

  let partialBorders = snapshot.diagnostics.unsupported.filter((entry) => entry.feature === 'partial-border');
  assert.ok(
    partialBorders.some((entry) => entry.nodeId === 'panel:project/tree-title-row')
      && partialBorders.some((entry) => entry.nodeId === 'panel:project/tree-toolbar'),
    'partial-side dividers surface as informational partial-border diagnostics',
  );

  let collapse = byId.get('panel:project/control:collapse-all');
  assert.ok(collapse, 'tree collapse button is captured as a control');
  assert.equal(collapse.part, 'control');
  assert.deepEqual(collapse.actions, [
    { id: 'collapse-all', targetId: 'panel:project', intent: 'sn-tree-panel-collapse' },
  ]);
  assert.equal(collapse.style['background-color'], 'rgb(20, 20, 20)');
  assert.equal(collapse.style['border-color'], 'rgb(60, 60, 60)');
});

test('captureSpatialSnapshot captures tree badges as provider-generic badge nodes', () => {
  let doc = createFakeDocument(new Map(SENTINEL_CONVERSIONS));
  let snapshot = captureSpatialSnapshot(createTreePanelLayout(doc));
  let byId = new Map(snapshot.nodes.map((node) => [node.id, node]));

  let badge = byId.get('panel:project/row:src/badge:graph');
  assert.ok(badge, 'row badge is captured');
  assert.equal(badge.part, 'badge');
  assert.equal(badge.component, 'sn-tree-panel');
  assert.equal(badge.parentId, 'panel:project/row:src');
  assert.equal(badge.text, 'graph');
  assert.equal(badge.style['background-color'], 'rgb(40, 60, 90)');
  assert.equal(badge.style.color, 'rgb(153, 153, 153)');
  assert.ok(byId.get('panel:project/row:src/badge:voice'), 'second badge keeps a distinct node');
});

test('captureSpatialSnapshot captures the tree filter as a field proxy and keeps text-input unsupported', () => {
  let doc = createFakeDocument(new Map(SENTINEL_CONVERSIONS));
  let snapshot = captureSpatialSnapshot(createTreePanelLayout(doc));
  let byId = new Map(snapshot.nodes.map((node) => [node.id, node]));

  let field = byId.get('panel:project/field:filter');
  assert.ok(field, 'filter input is captured as a field proxy');
  assert.equal(field.part, 'field');
  assert.equal(field.text, 'Filter project files', 'empty input proxies its placeholder text');
  assert.equal(field.style['background-color'], 'rgb(20, 20, 20)');
  assert.equal(field.style['border-width'], '1px');
  assert.equal(field.style['border-color'], 'rgb(60, 60, 60)');
  assert.equal(field.actions, undefined, 'field proxy is not interactive');

  let textInput = snapshot.diagnostics.unsupported.filter((entry) => entry.feature === 'text-input');
  assert.equal(textInput.length, 1, 'text-input stays an unsupported interaction');
  assert.equal(textInput[0].nodeId, 'panel:project/filter');

  let filled = captureSpatialSnapshot(createTreePanelLayout(doc, { filterValue: 'graph' }));
  assert.equal(
    filled.nodes.find((node) => node.id === 'panel:project/field:filter').text,
    'graph',
    'a non-empty filter proxies its current value',
  );
});

test('captureSpatialSnapshot excludes borders above the named width threshold', () => {
  let doc = createFakeDocument(new Map(SENTINEL_CONVERSIONS));
  let wide = Object.fromEntries(
    Object.entries(UNIFORM_BORDER_STYLES).map(([key, value]) => [key, key.endsWith('-width') ? '4px' : value]),
  );
  let panel = fakeElement(doc, {
    tag: 'section',
    rect: { left: 8, top: 40, width: 280, height: 120 },
    styles: { 'background-color': 'rgb(34, 34, 34)', ...wide },
    matches: (selector) => selector === '.wide-panel',
    children: [],
    childNodes: [],
  });
  let snapshot = captureSpatialSnapshot(
    createHeaderIconPanelLayout(doc, { contentChildren: [panel] }),
    { surfaceSelectors: ['.wide-panel'] },
  );
  let surface = snapshot.nodes.find((node) => node.part === 'surface');
  assert.ok(surface, 'opted-in surface is captured');
  assert.equal(surface.style['background-color'], 'rgb(34, 34, 34)');
  assert.equal(surface.style['border-width'], undefined, 'over-threshold borders are excluded');
  let borderDiagnostics = snapshot.diagnostics.unsupported.filter((entry) => entry.feature === 'partial-border');
  assert.equal(borderDiagnostics.length, 1);
  assert.match(borderDiagnostics[0].detail, /not reproduced/);
});

test('captureSpatialSnapshot captures opted-in structural surfaces without dropping child text or icons', () => {
  let doc = createFakeDocument(new Map(SENTINEL_CONVERSIONS));
  let introIcon = fakeIconElement(doc, {
    rect: { left: 16, top: 48, width: 20, height: 20 },
    name: 'code',
  });
  let strong = fakeElement(doc, {
    tag: 'strong',
    rect: { left: 44, top: 46, width: 120, height: 16 },
    text: 'Source editor',
    childNodes: [fakeTextNode('Source editor')],
    styles: { color: 'rgb(240, 240, 240)', 'font-size': '13px' },
  });
  let span = fakeElement(doc, {
    tag: 'span',
    rect: { left: 44, top: 64, width: 180, height: 14 },
    text: 'One focused panel',
    childNodes: [fakeTextNode('One focused panel')],
    styles: { color: 'rgb(153, 153, 153)', 'font-size': '12px' },
  });
  let textWrap = fakeElement(doc, {
    tag: 'div',
    rect: { left: 44, top: 44, width: 200, height: 40 },
    children: [strong, span],
    childNodes: [strong, span],
  });
  let intro = fakeElement(doc, {
    tag: 'header',
    rect: { left: 8, top: 40, width: 280, height: 56 },
    styles: { 'background-color': 'rgb(39, 39, 39)', ...UNIFORM_BORDER_STYLES },
    matches: (selector) => selector === '.project-panel-intro',
    children: [introIcon, textWrap],
    childNodes: [introIcon, textWrap],
  });
  let filesPanel = fakeElement(doc, {
    tag: 'section',
    rect: { left: 0, top: 28, width: 300, height: 500 },
    styles: { 'background-color': 'rgb(34, 34, 34)' },
    matches: (selector) => selector === '.project-files-panel',
    children: [intro],
    childNodes: [intro],
  });
  let snapshot = captureSpatialSnapshot(
    createHeaderIconPanelLayout(doc, { contentChildren: [filesPanel] }),
    { surfaceSelectors: ['.project-files-panel', '.project-panel-intro'] },
  );
  let byId = new Map(snapshot.nodes.map((node) => [node.id, node]));

  let outer = byId.get('panel:project/surface:1');
  assert.ok(outer, 'outer structural surface is captured');
  assert.equal(outer.part, 'surface');
  assert.equal(outer.style['background-color'], 'rgb(34, 34, 34)');

  let nested = byId.get('panel:project/surface:1/surface:1');
  assert.ok(nested, 'nested structural surface is captured');
  assert.equal(nested.parentId, outer.id);
  assert.equal(nested.style['border-color'], 'rgb(60, 60, 60)');

  let icon = byId.get(`${nested.id}/icon:code`);
  assert.ok(icon, 'surface child icon is captured');
  assert.equal(icon.part, 'icon');

  let texts = snapshot.nodes.filter((node) => node.part === 'text' && node.parentId === nested.id);
  assert.deepEqual(
    texts.map((node) => node.text).sort(),
    ['One focused panel', 'Source editor'],
    'surface child text is captured as text nodes',
  );
  assert.deepEqual(snapshot.diagnostics.unknownVisible, [], 'opted-in surfaces leave no unknown visible boxes');
});

test('captureSpatialSnapshot keeps visible unmatched elements as unknown visible diagnostics', () => {
  let doc = createFakeDocument(new Map(SENTINEL_CONVERSIONS));
  let promo = fakeElement(doc, {
    tag: 'div',
    rect: { left: 8, top: 40, width: 280, height: 40 },
    styles: { 'background-color': 'rgb(90, 20, 20)' },
    children: [],
    childNodes: [],
  });
  let snapshot = captureSpatialSnapshot(
    createHeaderIconPanelLayout(doc, { contentChildren: [promo] }),
    { surfaceSelectors: ['.project-files-panel'] },
  );
  assert.equal(snapshot.diagnostics.unknownVisible.length, 1);
  assert.equal(snapshot.diagnostics.unknownVisible[0].signature, 'div');
});
