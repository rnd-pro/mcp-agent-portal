import { acquireCurrentTestFileLock } from './test-lock.js';
await acquireCurrentTestFileLock(import.meta.url);

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import {
  DEFAULT_LAYOUT_BEHAVIOR,
  RUNTIME_SPLIT_RATIO,
  applyPriorityCompression,
  branchFitsExpandedState,
  clearPriorityCompression,
  closeUiPanel,
  createPanel,
  createSplit,
  duplicatePanel,
  findPanelByType,
  findNode,
  getBehaviorImportance,
  getNodeBehavior,
  hasLayoutBehaviorMetadata,
  joinPanels,
  resizeSplit,
  layoutHasBehaviorMetadata,
  normalizeLayoutBehavior,
  openPanel,
  removeUiPanel,
  resolveMobileDrawerLayout,
  resolveLayoutMinSize,
  resolveResponsiveLayoutState,
  setNodeBehavior,
} from '../layout/LayoutTree.js';
import { withGlobalPanel } from '../layout/LayoutRouter/SectionRegistry.js';
import {
  DEFAULT_WHEEL_ZOOM_SENSITIVITY,
  resolveWheelZoomDelta,
  resolveWheelZoomFactor,
} from '../interactions/Zoom.js';
import { bringOverlayToFront, layoutOverlayStack, resetOverlayStack } from '../ui/overlay-stack.js';

const layoutNodeStyles = new URL('../layout/LayoutNode/LayoutNode.css.js', import.meta.url);
const layoutNodeTemplate = new URL('../layout/LayoutNode/LayoutNode.tpl.js', import.meta.url);
const layoutNodeSource = new URL('../layout/LayoutNode/LayoutNode.js', import.meta.url);
const layoutSource = new URL('../layout/Layout/Layout.js', import.meta.url);
const layoutStyles = new URL('../layout/Layout/Layout.css.js', import.meta.url);
const layoutTemplate = new URL('../layout/Layout/Layout.tpl.js', import.meta.url);
const canvasGraphSource = new URL('../canvas/CanvasGraph/CanvasGraph.js', import.meta.url);
const canvasGraphViewportSource = new URL('../canvas/CanvasGraph/CanvasGraphViewport.js', import.meta.url);
const nodeCanvasStyles = new URL('../canvas/NodeCanvas/NodeCanvas.css.js', import.meta.url);
const canvasViewportSource = new URL('../canvas/CanvasViewport.js', import.meta.url);
const cascadeThemeSource = new URL('../themes/cascade-theme.js', import.meta.url);
const defaultProviderThemeSource = new URL('../themes/default-provider.js', import.meta.url);
const defaultDarkThemeSource = new URL('../themes/default-dark.js', import.meta.url);
const componentRegistrySource = new URL('../manifest/component-registry.js', import.meta.url);
const customElementsSource = new URL('../custom-elements.json', import.meta.url);

function createOverlayProbe({ width, height }) {
  let attrs = new Map();
  let style = {
    left: '0px',
    top: '0px',
    setProperty(name, value) {
      this[name] = value;
    },
    removeProperty(name) {
      delete this[name];
    },
  };
  return {
    hidden: false,
    offsetWidth: width,
    offsetHeight: height,
    style,
    setAttribute(name, value = '') {
      attrs.set(name, String(value));
    },
    removeAttribute(name) {
      attrs.delete(name);
    },
    hasAttribute(name) {
      return attrs.has(name);
    },
    getAttribute(name) {
      return attrs.get(name) || null;
    },
    getBoundingClientRect() {
      let left = Number.parseFloat(style.left) || 0;
      let top = Number.parseFloat(style.top) || 0;
      return { left, top, right: left + width, bottom: top + height, width, height };
    },
  };
}

test('overlay stack layers transient surfaces above an anchor and reports scroll reserve', () => {
  let previousWindow = globalThis.window;
  globalThis.window = { innerWidth: 800, innerHeight: 600 };
  try {
    let anchor = {
      getBoundingClientRect() {
        return { left: 300, top: 500, right: 500, bottom: 540, width: 200, height: 40 };
      },
    };
    let first = createOverlayProbe({ width: 120, height: 40 });
    let second = createOverlayProbe({ width: 180, height: 60 });
    let reserveTarget = { style: { setProperty(name, value) { this[name] = value; } } };

    let result = layoutOverlayStack({
      anchor,
      overlays: [first, second],
      container: { left: 0, top: 0, right: 800, bottom: 600, width: 800, height: 600 },
      reserveTarget,
      gap: 8,
      viewportGutter: 16,
    });

    assert.equal(result.visible, 2);
    assert.equal(first.style.top, '452px');
    assert.equal(first.style.left, '340px');
    assert.equal(second.style.top, '384px');
    assert.equal(second.style.left, '310px');
    assert.equal(result.reserveBlockSize, 116);
    assert.equal(reserveTarget.style['--sn-chat-overlay-stack-reserve'], '116px');
    assert.equal(first.getAttribute('data-overlay-stack-index'), '0');
    assert.equal(second.getAttribute('data-overlay-stack-index'), '1');
  } finally {
    if (previousWindow) globalThis.window = previousWindow;
    else delete globalThis.window;
  }
});

test('overlay stack keeps local canvas overlays below global popovers', () => {
  let previousGetComputedStyle = globalThis.getComputedStyle;
  globalThis.getComputedStyle = (element) => ({
    getPropertyValue(name) {
      return element.cssProps?.[name] || '';
    },
  });

  try {
    resetOverlayStack();
    let themePopover = createOverlayProbe({ width: 320, height: 240 });
    themePopover.cssProps = {
      '--sn-overlay-z-tier': 'global',
      '--sn-overlay-z-base': '20030',
    };
    let quickToolbar = createOverlayProbe({ width: 160, height: 48 });
    quickToolbar.cssProps = {
      '--sn-overlay-z-tier': 'local',
      '--sn-overlay-z-base': '12000',
    };

    let themeZ = bringOverlayToFront(themePopover);
    for (let i = 0; i < 12; i += 1) {
      bringOverlayToFront(quickToolbar);
    }

    assert.equal(themePopover.getAttribute('data-overlay-tier'), 'global');
    assert.equal(quickToolbar.getAttribute('data-overlay-tier'), 'local');
    assert.ok(Number.parseInt(quickToolbar.style.zIndex, 10) < themeZ);

    let nextThemeZ = bringOverlayToFront(themePopover);
    assert.ok(nextThemeZ > themeZ);
    assert.ok(Number.parseInt(quickToolbar.style.zIndex, 10) < nextThemeZ);
  } finally {
    resetOverlayStack();
    if (previousGetComputedStyle) globalThis.getComputedStyle = previousGetComputedStyle;
    else delete globalThis.getComputedStyle;
  }
});

test('overlay stack supports per-item anchors and caret alignment', () => {
  let previousWindow = globalThis.window;
  globalThis.window = { innerWidth: 800, innerHeight: 600 };
  try {
    let composer = {
      getBoundingClientRect() {
        return { left: 300, top: 500, right: 700, bottom: 540, width: 400, height: 40 };
      },
    };
    let trigger = {
      getBoundingClientRect() {
        return { left: 308, top: 510, right: 340, bottom: 542, width: 32, height: 32 };
      },
    };
    let menu = createOverlayProbe({ width: 120, height: 40 });
    let status = createOverlayProbe({ width: 200, height: 60 });

    let result = layoutOverlayStack({
      anchor: composer,
      overlays: [
        {
          element: menu,
          anchor: trigger,
          align: 'start',
          inlineOffset: -4,
          caretTarget: trigger,
          caretProperty: '--menu-caret-left',
        },
        status,
      ],
      container: { left: 0, top: 0, right: 800, bottom: 600, width: 800, height: 600 },
      gap: 8,
      viewportGutter: 16,
    });

    assert.equal(result.visible, 2);
    assert.equal(menu.style.top, '452px');
    assert.equal(menu.style.left, '304px');
    assert.equal(menu.style['--menu-caret-left'], '20px');
    assert.equal(status.style.top, '384px');
    assert.equal(status.style.left, '400px');
    assert.equal(result.reserveBlockSize, 116);

    menu.hidden = true;
    let hiddenResult = layoutOverlayStack({
      anchor: composer,
      overlays: [
        {
          element: menu,
          anchor: trigger,
          align: 'start',
          inlineOffset: -4,
          caretTarget: trigger,
          caretProperty: '--menu-caret-left',
        },
        status,
      ],
      container: { left: 0, top: 0, right: 800, bottom: 600, width: 800, height: 600 },
      gap: 8,
      viewportGutter: 16,
    });

    assert.equal(hiddenResult.visible, 1);
    assert.equal(menu.hasAttribute('data-overlay-stack-item'), false);
    assert.equal(menu.style.top, undefined);
    assert.equal(menu.style.left, undefined);
    assert.equal(status.getAttribute('data-overlay-stack-index'), '0');
  } finally {
    if (previousWindow) globalThis.window = previousWindow;
    else delete globalThis.window;
  }
});

test('layout node panel header adapts without overlapping actions', async () => {
  let [styles, template] = await Promise.all([
    readFile(layoutNodeStyles, 'utf8'),
    readFile(layoutNodeTemplate, 'utf8'),
  ]);

  assert.match(template, /class="panel-actions"/);
  assert.match(template, /class="panel-menu-action-label"/);
  assert.match(styles, /\.panel-view\s*\{[\s\S]*?container-type: inline-size;[\s\S]*?container-name: layout-panel;/);
  assert.match(styles, /\.panel-header\s*\{[\s\S]*?box-sizing: border-box;[\s\S]*?display: grid;[\s\S]*?grid-template-columns: minmax\(0, 1fr\) auto minmax\(0, 1fr\);[\s\S]*?block-size: var\(--sn-layout-header-block-size,/);
  assert.match(styles, /\.type-btn\s*\{[\s\S]*?grid-column: 1;[\s\S]*?overflow: hidden;/);
  assert.match(styles, /\.panel-menu-toggle\s*\{[\s\S]*?grid-column: 2;[\s\S]*?position: static;[\s\S]*?transform: none;/);
  assert.match(styles, /\.panel-actions\s*\{[\s\S]*?grid-column: 3;[\s\S]*?justify-content: flex-end;[\s\S]*?overflow: hidden;/);
  assert.match(styles, /\.panel-title\s*\{[\s\S]*?font-size: var\(--sn-layout-header-title-size, var\(--sn-layout-header-button-size, 0\.75rem\)\);[\s\S]*?line-height: var\(--sn-layout-header-title-line-height, 1\.2\);/);
  assert.match(styles, /\.panel-content\s*\{[\s\S]*?box-sizing: border-box;[\s\S]*?min-inline-size: 0;[\s\S]*?min-block-size: 0;/);
  assert.match(styles, /\.panel-content > sn-card\s*\{[\s\S]*?--sn-card-bg: var\(--sn-layout-panel-card-bg, transparent\);[\s\S]*?--sn-card-border: var\(--sn-layout-panel-card-border, transparent\);[\s\S]*?--sn-card-radius: var\(--sn-layout-panel-card-radius, 0\);[\s\S]*?box-sizing: border-box;[\s\S]*?inline-size: var\(--sn-layout-panel-card-inline-size, 100%\);[\s\S]*?min-block-size: var\(--sn-layout-panel-card-min-block-size, 100%\);/);
  assert.match(styles, /\.panel-menu-rows\s*\{[\s\S]*?gap: var\(--sn-layout-menu-section-gap,/);
  assert.match(styles, /\.panel-menu-row\s*\{[\s\S]*?grid-template-columns: minmax\(0, 1fr\);[\s\S]*?min-block-size: calc\(var\(--sn-layout-menu-row-height,/);
  assert.match(styles, /\.panel-menu-row\s*\{[\s\S]*?border: 1px solid color-mix\(in oklab, var\(--sn-layout-border\) 62%, transparent\);[\s\S]*?border-radius: var\(--sn-layout-menu-section-radius,/);
  assert.doesNotMatch(styles, /\.panel-menu-row\s*\{[\s\S]*?height: calc\(var\(--sn-layout-menu-row-height,/);
  assert.match(styles, /\.panel-menu-row-label\s*\{[\s\S]*?border-block-end: 1px solid color-mix\(in oklab, var\(--sn-layout-border\) 58%, transparent\);[\s\S]*?font-weight: 600;/);
  assert.match(styles, /\.panel-menu-actions\s*\{[\s\S]*?flex-wrap: wrap;[\s\S]*?overflow: hidden;/);
  assert.match(styles, /\.panel-menu-action-label\s*\{[\s\S]*?text-overflow: ellipsis;/);
  assert.match(styles, /@container layout-panel \(max-width: 360px\) \{[\s\S]*?\.panel-menu-action-label \{[\s\S]*?display: none;/);
  assert.match(styles, /@container layout-panel \(max-width: 280px\) \{[\s\S]*?\.panel-menu-row-label \{[\s\S]*?min-block-size: var\(--sn-layout-menu-section-label-compact-height,/);
  assert.match(styles, /@container layout-panel \(max-width: 360px\) \{[\s\S]*?\.panel-title \{[\s\S]*?display: none;/);
  assert.match(styles, /@container layout-panel \(max-width: 260px\) \{[\s\S]*?\.dropdown-arrow \{[\s\S]*?display: none;/);
  assert.match(styles, /@container layout-panel \(max-width: 220px\) \{[\s\S]*?\.fullscreen-btn \{[\s\S]*?display: none;/);
  assert.match(styles, /&\[collapsed\]\[collapse-dir='vertical'\]\s*\{[\s\S]*?\.panel-actions\s*\{[\s\S]*?position:\s*absolute;[\s\S]*?inset:\s*0;[\s\S]*?block-size:\s*100%;/);
  assert.match(styles, /&\[collapsed\]\[collapse-dir='vertical'\]\s*\{[\s\S]*?\.collapse-btn\s*\{[\s\S]*?inset:\s*0;[\s\S]*?inline-size:\s*100%;[\s\S]*?block-size:\s*100%;/);
  assert.match(styles, /&\[collapsed\]\[collapse-dir='horizontal'\]\s*\{[\s\S]*?\.panel-actions\s*\{[\s\S]*?position:\s*absolute;[\s\S]*?inset:\s*0;[\s\S]*?block-size:\s*100%;/);
  assert.match(styles, /&\[collapsed\]\[collapse-dir='horizontal'\]\s*\{[\s\S]*?\.collapse-btn\s*\{[\s\S]*?inline-size:\s*100%;[\s\S]*?block-size:\s*100%;/);
  assert.match(styles, /&\[collapsed\]\[collapse-dir='horizontal'\]\s*\{[\s\S]*?\.type-btn\s*\{[\s\S]*?block-size:\s*var\(--sn-layout-header-block-size,/);
  assert.match(styles, /&\[collapsed\]\[collapse-dir='horizontal'\]\s*\{[\s\S]*?\.panel-icon\s*\{[\s\S]*?font-size:\s*var\(--sn-layout-header-icon-size,\s*16px\);/);
  let menuBlock = styles.slice(styles.indexOf('    .panel-menu-toggle {'), styles.indexOf('    .panel-actions {'));
  assert.doesNotMatch(menuBlock, /position: absolute;/);
});

test('layout node collapsed icon points toward expansion side', async () => {
  let [source, layout] = await Promise.all([
    readFile(layoutNodeSource, 'utf8'),
    readFile(layoutSource, 'utf8'),
  ]);

  assert.match(source, /collapseSlot: 'first'/);
  // The slot is derived from the node's visual outer edges so a collapsed ear row
  // (rendered perpendicular to its logical axis) still points its chevron the way it
  // actually opens.
  assert.match(source, /this\.\$\.collapseSlot = atSecondEdge \? 'second' : 'first'/);
  assert.match(source, /this\.\#syncHostAttribute\('collapse-side', this\.\$\.collapseSlot\)/);
  assert.match(source, /if \(this\.\$\.isCollapsed\) return isFirst \? 'chevron_right' : 'chevron_left';/);
  assert.match(source, /return isFirst \? 'chevron_left' : 'chevron_right';/);
  assert.match(source, /if \(this\.\$\.isCollapsed\) return isFirst \? 'expand_more' : 'expand_less';/);
  assert.match(source, /return isFirst \? 'expand_less' : 'expand_more';/);
  assert.match(layout, /node\._syncCollapsePresentation\?\.\(\)/);
  assert.doesNotMatch(source, /this\.\$\.isCollapsed\)[\s\S]{0,120}this\.\$\.collapseIcon = 'chevron_right'/);
});

test('layout keeps manually expanded auto panels from being immediately auto-collapsed', async () => {
  let layout = await readFile(layoutSource, 'utf8');

  assert.match(
    layout,
    /LayoutTree\.updateNode\(tree, panelId, \{\s*collapsed,\s*autoCollapsed: false,\s*manualExpanded: !collapsed,/,
  );
  assert.match(layout, /if \(node\.manualExpanded\) return false;/);
  assert.match(layout, /node\.manualExpanded = false;/);
});

test('layout behavior normalizes responsive collapse and overflow policy', () => {
  let behavior = normalizeLayoutBehavior({
    importance: 200,
    minInlineSize: 360,
    minBlockSize: 240,
    collapse: 'never',
    overflow: 'scroll-inline',
    responsiveMode: 'swipe',
    responsiveBreakpoint: 640,
    mobileDock: 'end',
    swipeControl: 'edge',
    drawerHoverOpen: true,
  });

  assert.equal(behavior.importance, 100);
  assert.equal(behavior.minInlineSize, 360);
  assert.equal(behavior.minBlockSize, 240);
  assert.equal(behavior.collapse, 'never');
  assert.equal(behavior.overflow, 'scroll-inline');
  assert.equal(behavior.responsiveMode, 'swipe');
  assert.equal(behavior.responsiveBreakpoint, 640);
  assert.equal(behavior.mobileDock, 'end');
  assert.equal(behavior.swipeControl, 'edge');
  assert.equal(behavior.drawerHoverOpen, true);
  assert.equal(hasLayoutBehaviorMetadata(behavior), true);
  assert.equal(hasLayoutBehaviorMetadata({ ...behavior, overflow: 'invalid' }), false);
  assert.equal(hasLayoutBehaviorMetadata({ ...behavior, mobileDock: 'invalid' }), false);
  assert.equal(hasLayoutBehaviorMetadata({ ...behavior, swipeControl: 'invalid' }), false);
});

test('layout behavior accepts rail drawer controls with optional hover open', () => {
  let behavior = normalizeLayoutBehavior({
    responsiveMode: 'drawer',
    mobileDock: 'start',
    swipeControl: 'rail',
    drawerHoverOpen: true,
  });

  assert.equal(behavior.swipeControl, 'rail');
  assert.equal(behavior.drawerHoverOpen, true);
  assert.equal(hasLayoutBehaviorMetadata(behavior), true);

  let fallback = normalizeLayoutBehavior({ swipeControl: 'rail', drawerHoverOpen: true });
  let inherited = normalizeLayoutBehavior({}, fallback);
  assert.equal(inherited.swipeControl, 'rail');
  assert.equal(inherited.drawerHoverOpen, true);
});

test('layout behavior metadata predicate validates complete layout trees', () => {
  let nav = createPanel('navigation', {}, { importance: 80, minInlineSize: 220 });
  let main = createPanel('main', {}, { importance: 95, minInlineSize: 520, collapse: 'never' });
  let complete = createSplit('horizontal', nav, main, 0.3, { responsiveMode: 'scroll-inline' });

  assert.equal(layoutHasBehaviorMetadata(complete), true);

  let incompletePanel = createPanel('legacy');
  let incomplete = createSplit('horizontal', nav, incompletePanel, 0.4, { responsiveMode: 'stack' });
  assert.equal(layoutHasBehaviorMetadata(incomplete), false);
  assert.equal(layoutHasBehaviorMetadata(null), false);
});

test('layout tree duplicates panel metadata for explicit menu duplicate action', () => {
  let theme = createPanel('theme', { view: 'full' }, { importance: 80, collapse: 'manual' });
  let graph = createPanel('graph');
  let root = createSplit('horizontal', theme, graph, 0.4);
  let duplicated = duplicatePanel(root, theme.id, 'vertical', 0.5);
  let parent = findNode(duplicated, theme.id);

  assert.equal(parent.panelType, 'theme');
  assert.equal(parent.panelState.view, 'full');
  assert.equal(getNodeBehavior(parent).importance, 80);
  assert.equal(getNodeBehavior(parent).collapse, 'manual');
});

test('layout tree stores behavior per insertion point', () => {
  let graph = createPanel('graph', {}, { importance: 95, minInlineSize: 420 });
  let chat = createPanel('chat', {}, { importance: 25, collapse: 'auto' });
  let root = createSplit('horizontal', graph, chat, 0.62, { responsiveMode: 'scroll-inline' });

  assert.equal(getBehaviorImportance(graph), 95);
  assert.equal(getNodeBehavior(chat).importance, 25);
  assert.equal(getNodeBehavior(root).responsiveMode, 'scroll-inline');

  assert.equal(setNodeBehavior(root, chat.id, { importance: 5, collapse: 'never' }), true);
  assert.equal(getNodeBehavior(chat).importance, 5);
  assert.equal(getNodeBehavior(chat).collapse, 'never');
  assert.equal(getNodeBehavior(chat).minBlockSize, DEFAULT_LAYOUT_BEHAVIOR.minBlockSize);
});

test('layout behavior resolves responsive state and scroll fallback axes', () => {
  let wide = resolveResponsiveLayoutState(
    {
      collapse: 'auto',
      overflow: 'collapse',
      responsiveMode: 'stack',
      responsiveBreakpoint: 640,
      minInlineSize: 300,
      minBlockSize: 180,
    },
    { inlineSize: 900, blockSize: 520, layoutMinSize: { inlineSize: 740, blockSize: 360 } }
  );

  assert.equal(wide.responsiveActive, false);
  assert.equal(wide.effectiveResponsiveMode, 'preserve');
  assert.equal(wide.collapseAllowed, true);
  assert.equal(wide.scrollInline, false);
  assert.equal(wide.scrollBlock, false);

  let state = resolveResponsiveLayoutState(
    {
      collapse: 'auto',
      overflow: 'collapse',
      responsiveMode: 'scroll-inline',
      responsiveBreakpoint: 640,
      minInlineSize: 320,
      minBlockSize: 180,
    },
    {
      inlineSize: 520,
      blockSize: 420,
      layoutMinSize: { inlineSize: 940, blockSize: 360 },
    }
  );

  assert.equal(state.responsiveActive, true);
  assert.equal(state.effectiveResponsiveMode, 'scroll-inline');
  assert.equal(state.collapseAllowed, false);
  assert.equal(state.scrollInline, true);
  assert.equal(state.scrollBlock, false);
  assert.equal(state.cssVars['--sn-layout-overflow-inline-size'], '940px');
  assert.equal(state.cssVars['--sn-layout-overflow-block-size'], '420px');
  assert.equal(state.cssVars['--sn-layout-responsive-panel-min-block-size'], '180px');

  let stack = resolveResponsiveLayoutState(
    { collapse: 'auto', overflow: 'collapse', responsiveMode: 'stack', responsiveBreakpoint: 640 },
    { inlineSize: 480, blockSize: 300, layoutMinSize: { inlineSize: 900, blockSize: 760 } }
  );

  assert.equal(stack.responsiveActive, true);
  assert.equal(stack.effectiveResponsiveMode, 'stack');
  assert.equal(stack.collapseAllowed, false);
  assert.equal(stack.scrollInline, false);
  assert.equal(stack.scrollBlock, true);

  let stackedInlineScroll = resolveResponsiveLayoutState(
    { collapse: 'auto', overflow: 'scroll-inline', responsiveMode: 'stack', responsiveBreakpoint: 640 },
    { inlineSize: 480, blockSize: 300, layoutMinSize: { inlineSize: 900, blockSize: 760 } }
  );

  assert.equal(stackedInlineScroll.responsiveActive, true);
  assert.equal(stackedInlineScroll.effectiveResponsiveMode, 'stack');
  assert.equal(stackedInlineScroll.collapseAllowed, false);
  assert.equal(stackedInlineScroll.scrollInline, true);
  assert.equal(stackedInlineScroll.scrollBlock, true);
  assert.equal(stackedInlineScroll.cssVars['--sn-layout-overflow-inline-size'], '900px');
  assert.equal(stackedInlineScroll.cssVars['--sn-layout-overflow-block-size'], '760px');

  let blockScroll = resolveResponsiveLayoutState(
    { collapse: 'never', overflow: 'scroll-block', responsiveMode: 'preserve' },
    { inlineSize: 900, blockSize: 300, layoutMinSize: { inlineSize: 500, blockSize: 760 } }
  );

  assert.equal(blockScroll.responsiveActive, false);
  assert.equal(blockScroll.collapseAllowed, false);
  assert.equal(blockScroll.scrollInline, false);
  assert.equal(blockScroll.scrollBlock, true);
  assert.equal(blockScroll.cssVars['--sn-layout-overflow-inline-size'], '900px');
  assert.equal(blockScroll.cssVars['--sn-layout-overflow-block-size'], '760px');

  let bothAxes = resolveResponsiveLayoutState(
    { collapse: 'never', overflow: 'scroll' },
    { inlineSize: 300, blockSize: 200, layoutMinSize: { inlineSize: 640, blockSize: 480 } }
  );

  assert.equal(bothAxes.scrollInline, true);
  assert.equal(bothAxes.scrollBlock, true);
  assert.equal(bothAxes.collapseAllowed, false);

  let drawer = resolveResponsiveLayoutState(
    { collapse: 'auto', overflow: 'collapse', responsiveMode: 'drawer', responsiveBreakpoint: 760 },
    { inlineSize: 390, blockSize: 760, layoutMinSize: { inlineSize: 1060, blockSize: 420 } }
  );

  assert.equal(drawer.responsiveActive, true);
  assert.equal(drawer.effectiveResponsiveMode, 'drawer');
  assert.equal(drawer.drawerActive, true);
  assert.equal(drawer.collapseAllowed, false);
  assert.equal(drawer.scrollInline, false);
  assert.equal(drawer.scrollBlock, false);

  let swipe = resolveResponsiveLayoutState(
    { collapse: 'auto', overflow: 'collapse', responsiveMode: 'swipe', responsiveBreakpoint: 760 },
    { inlineSize: 390, blockSize: 760, layoutMinSize: { inlineSize: 1060, blockSize: 420 } }
  );

  assert.equal(swipe.responsiveActive, true);
  assert.equal(swipe.effectiveResponsiveMode, 'swipe');
  assert.equal(swipe.drawerActive, true);
  assert.equal(swipe.collapseAllowed, false);
});

test('layout tree resolves mobile drawer docks without product panel names', () => {
  let materials = createPanel('materials', {}, { importance: 60, mobileDock: 'start' });
  let content = createPanel('content', {}, { importance: 100, mobileDock: 'primary' });
  let graph = createPanel('graph', {}, { importance: 80, mobileDock: 'end', swipeControl: 'edge' });
  let theme = createPanel('theme', {}, { importance: 70, mobileDock: 'end' });
  let root = createSplit(
    'horizontal',
    materials,
    createSplit('horizontal', content, createSplit('vertical', graph, theme, 0.5), 0.55),
    0.24,
    { responsiveMode: 'drawer' }
  );
  let projection = resolveMobileDrawerLayout(root);

  assert.equal(projection.primaryPanelId, content.id);
  assert.deepEqual(projection.startPanelIds, [materials.id]);
  assert.deepEqual(projection.endPanelIds, [graph.id, theme.id]);
  assert.equal(projection.panels.find((panel) => panel.id === materials.id).dock, 'start');
  assert.equal(projection.panels.find((panel) => panel.id === content.id).dock, 'primary');
  assert.equal(projection.panels.find((panel) => panel.id === graph.id).dock, 'end');
  assert.equal(projection.panels.find((panel) => panel.id === graph.id).swipeControl, 'edge');
  assert.equal(projection.panels.find((panel) => panel.id === theme.id).dock, 'end');

  let rail = createPanel('rail', {}, { importance: 55, mobileDock: 'start', swipeControl: 'rail', drawerHoverOpen: true });
  let railProjection = resolveMobileDrawerLayout(createSplit('horizontal', rail, content, 0.25));
  let railPanel = railProjection.panels.find((panel) => panel.id === rail.id);
  assert.equal(railPanel.swipeControl, 'rail');
  assert.equal(railPanel.drawerHoverOpen, true);

  let autoRoot = createSplit(
    'horizontal',
    createPanel('tree', {}, { importance: 40 }),
    createSplit(
      'horizontal',
      createPanel('reader', {}, { importance: 95 }),
      createPanel('map', {}, { importance: 70 }),
      0.6
    ),
    0.25,
    { responsiveMode: 'drawer' }
  );
  let autoProjection = resolveMobileDrawerLayout(autoRoot);

  assert.equal(autoProjection.panels.map((panel) => panel.dock).join(','), 'start,primary,end');
  assert.equal(autoProjection.primaryPanelId, autoProjection.panels[1].id);
});

test('panel layout drawer mode has gesture, theme, and metadata contracts', async () => {
  let [layout, layoutNode, styles, template, nodeStyles, registry, customElements] = await Promise.all([
    readFile(layoutSource, 'utf8'),
    readFile(layoutNodeSource, 'utf8'),
    readFile(layoutStyles, 'utf8'),
    readFile(layoutTemplate, 'utf8'),
    readFile(layoutNodeStyles, 'utf8'),
    readFile(componentRegistrySource, 'utf8'),
    readFile(customElementsSource, 'utf8'),
  ]);

  assert.match(layout, /setPointerCapture/);
  assert.match(layout, /releasePointerCapture/);
  assert.match(layout, /pointercancel/);
  assert.match(layout, /drawer-mode-active/);
  assert.match(layout, /resolveMobileDrawerLayout/);
  assert.match(layout, /drawer-start-open/);
  assert.match(layout, /drawer-end-open/);
  assert.match(layout, /drawerStartPanelId/);
  assert.match(layout, /drawerEndPanelId/);
  assert.match(layout, /drawer-active-panel/);
  assert.match(layout, /dataset\.drawerPanelId/);
  assert.match(layout, /_onDrawerRailPointerDown/);
  assert.match(layout, /_onDrawerRailHover/);
  assert.match(layout, /_isDrawerContentSwipeBlocked\(target\)[\s\S]*?\.split-resizer/);
  assert.match(layoutNode, /addEventListener\('pointerdown', this\._onSplitResizerPointerDown\)/);
  assert.match(layoutNode, /removeEventListener\('pointerdown', this\._onSplitResizerPointerDown\)/);
  assert.match(layoutNode, /_onSplitResizerPointerDown = \(event\) => {[\s\S]*?resizer\.closest\('layout-node'\) !== this[\s\S]*?this\._startResize\(event\);/);
  assert.match(layoutNode, /_clearRuntimeSplitRatio\(\) {[\s\S]*?delete this\.\$\.nodeData\[LayoutTree\.RUNTIME_SPLIT_RATIO\];/);
  assert.match(layoutNode, /_startResize\(e\)[\s\S]*?e\.stopPropagation\(\);/);
  assert.match(layoutNode, /_startResize\(e\)[\s\S]*?this\._clearRuntimeSplitRatio\(\);[\s\S]*?this\.\$\.ratio = newRatio;/);
  assert.doesNotMatch(template, /onpointerdown:\s*'onResizerDown'/);
  assert.match(layout, /drawer-rail-collapsed/);
  assert.match(layout, /_scheduleDrawerRailPeek/);
  assert.match(layout, /drawer-rail-peeking/);
  assert.match(layout, /drawerHoverOpen/);
  assert.match(layout, /dataset\.swipeControl/);
  assert.doesNotMatch(layout, /_renderDrawerHandleStack/);
  assert.doesNotMatch(layout, /_syncDrawerHandleState/);
  assert.doesNotMatch(template, /layout-drawer-handle/);
  assert.match(styles, /\[drawer-mode-active\]/);
  assert.doesNotMatch(styles, /layout-drawer-handle/);
  assert.match(styles, /layout-node\[drawer-rail\]\[drawer-rail-collapsed\]/);
  assert.match(styles, /--sn-layout-drawer-rail-peek-distance:\s*20px/);
  assert.match(styles, /layout-node\[node-type='panel'\]\s*\{[\s\S]*?background-clip:\s*padding-box;[\s\S]*?isolation:\s*isolate;[\s\S]*?backface-visibility:\s*hidden;[\s\S]*?-webkit-backface-visibility:\s*hidden;[\s\S]*?transform:\s*translate3d\(var\(--sn-layout-drawer-translate,\s*0\),\s*0,\s*0\);/);
  assert.match(styles, /&\[drawer-mode-active\]\s*\{[\s\S]*?layout-node \.type-btn\s*\{[\s\S]*?display:\s*none !important;/);
  assert.match(styles, /layout-node\[mobile-dock='start'\],[\s\S]*?layout-node\[mobile-dock='end'\]\s*\{[\s\S]*?contain:\s*layout paint style;[\s\S]*?will-change:\s*transform;/);
  assert.match(styles, /layout-node\[drawer-expanded\]\s*\{[\s\S]*?\.panel-view\s*\{[\s\S]*?background:\s*inherit;[\s\S]*?isolation:\s*isolate;[\s\S]*?\.panel-content\s*\{[\s\S]*?background:\s*inherit;/);
  assert.match(styles, /layout-node\[drawer-dragging\]\s*\{[\s\S]*?transition:\s*none;[\s\S]*?will-change:\s*transform;/);
  assert.match(styles, /&\[drawer-dragging\]\s*\{[\s\S]*?layout-node\[mobile-dock='start'\],[\s\S]*?layout-node\[mobile-dock='end'\]\s*\{[\s\S]*?transition:\s*none;/);
  assert.match(styles, /min-block-size:\s*var\(--sn-layout-drawer-min-block-size,\s*inherit\)/);
  assert.match(styles, /inset:\s*0;/);
  assert.match(styles, /--sn-layout-drawer-translate:\s*-100%/);
  assert.match(styles, /--sn-layout-drawer-translate:\s*100%/);
  assert.match(styles, /transform:\s*translate3d\(var\(--sn-layout-drawer-translate\),\s*0,\s*0\)/);
  assert.match(styles, /\[drawer-mode-active\]\[drawer-start-open\]\s+layout-node\[mobile-dock='start'\]/);
  assert.match(styles, /\[drawer-mode-active\]\[drawer-end-open\]\s+layout-node\[mobile-dock='end'\]/);
  assert.match(layout, /--sn-layout-drawer-translate/);
  assert.match(layout, /function drawerTranslateTransform\(value\)/);
  assert.match(layout, /translate3d\(\$\{value\}, 0, 0\)/);
  assert.match(layout, /setImportantStylePropertyIfChanged\(node\.style,\s*'transform'/);
  assert.doesNotMatch(layout, /_setDrawerHandleVisualState/);
  assert.doesNotMatch(layout, /_applyDrawerHandleProgress/);
  assert.doesNotMatch(layout, /_getDrawerHandleOpenOffset/);
  assert.match(layout, /_setDrawerGestureDragging\(gesture\)/);
  assert.match(layout, /this\._setDrawerGestureDragging\(this\._drawerGesture\)/);
  assert.match(layout, /this\._setDrawerGestureDragging\(gesture\);\s*this\._captureDrawerGesturePointer\(gesture\)/);
  assert.match(layout, /node\.setAttribute\('drawer-dragging', ''\);\s*if \(rail\)/);
  assert.match(layout, /_setDrawerNodeExpanded/);
  assert.match(layout, /_restoreDrawerNodeCollapseState/);
  assert.match(layout, /drawer-expanded/);
  assert.match(layout, /_clearDrawerDrag\('all'\)/);
  assert.doesNotMatch(styles, /--sn-layout-drawer-handle/);
  assert.match(layout, /inset-inline-start/);
  assert.match(layout, /inset-inline-end/);
  assert.doesNotMatch(layout, /open \? 'var\(--sn-layout-drawer-size\)'/);
  assert.match(styles, /box-sizing:\s*border-box/);
  assert.match(styles, /touch-action:\s*pan-y;/);
  assert.match(styles, /overscroll-behavior:\s*contain;/);
  assert.match(styles, /--sn-layout-drawer-bg/);
  assert.match(styles, /--sn-layout-drawer-shadow/);
  assert.match(styles, /box-shadow:\s*var\(--sn-layout-drawer-shadow,\s*var\(--sn-shadow-xl\)\)/);
  assert.match(styles, /--sn-layout-drawer-backdrop-bg,\s*transparent/);
  assert.match(styles, /--sn-layout-drawer-backdrop-filter,\s*none/);
  assert.match(styles, /layout-node\[drawer-expanded\]/);
  assert.match(styles, /\.panel-content\s*\{[\s\S]*?display:\s*block !important;/);
  assert.match(styles, /layout-node\[drawer-expanded\]\s*\{[\s\S]*?\.type-btn,[\s\S]*?\.collapse-btn\s*\{[\s\S]*?display:\s*none !important;/);
  assert.doesNotMatch(styles, /--sn-layout-drawer-handle-shadow/);
  assert.doesNotMatch(styles, /--sn-layout-drawer-backdrop-bg,\s*color-mix/);
  assert.doesNotMatch(styles, /--sn-layout-drawer-backdrop-filter,\s*blur/);
  assert.match(styles, /prefers-reduced-motion:\s*reduce/);
  assert.match(layout, /_syncFullscreenBounds/);
  assert.match(layout, /fullscreen-active/);
  assert.match(layout, /setAttributeIfChanged\(this,\s*'fullscreen-active',\s*'true'\)/);
  assert.match(layout, /this\._clearDrawerProjection\(\);/);
  assert.match(layout, /removeAttribute\('drawer-mode-active'\)/);
  assert.match(layout, /--sn-layout-fullscreen-host-top', '0px'/);
  assert.match(styles, /\.fullscreen-tab-bar\s*\{[\s\S]*?top:\s*0;/);
  assert.match(styles, /height:\s*var\(--sn-fullscreen-tab-bar-height,\s*32px\)/);
  assert.match(styles, /--sn-fullscreen-tab-bar-bg,\s*var\(--sn-sys-surface\)/);
  assert.match(styles, /--sn-fullscreen-tab-bg,\s*transparent/);
  assert.match(styles, /--sn-fullscreen-tab-hover-bg,\s*var\(--sn-node-header-bg\)/);
  assert.match(styles, /--sn-fullscreen-tab-active-bg,\s*var\(--sn-node-header-bg\)/);
  assert.match(styles, /z-index:\s*var\(--sn-fullscreen-tab-bar-z,\s*30020\)/);
  assert.match(styles, /\[fullscreen-active\]\s*\{[\s\S]*?\.layout-drawer-backdrop\s*\{[\s\S]*?display:\s*none !important;/);
  assert.ok(
    styles.lastIndexOf('layout-node[fullscreen]') > styles.indexOf("layout-node[mobile-dock='start'],"),
    'drawer-mode fullscreen override must be after start/end drawer sizing'
  );
  assert.match(nodeStyles, /--sn-layout-fullscreen-host-top/);
  assert.match(nodeStyles, /--sn-fullscreen-tab-bar-height,\s*32px/);
  assert.match(nodeStyles, /--sn-layout-fullscreen-host-bottom/);
  assert.match(nodeStyles, /z-index:\s*var\(--sn-fullscreen-panel-z,\s*30010\) !important;/);
  assert.match(nodeStyles, /layout-node\s*\{[\s\S]*?&\[fullscreen\]\s*\{[\s\S]*?height:\s*auto !important;/);
  assert.match(nodeStyles, /&\[fullscreen\]\s*\{[\s\S]*?border-radius:\s*0 !important;/);
  assert.match(registry, /mobile-drawer/);
  assert.match(registry, /mobile-swipe-mode/);
  assert.doesNotMatch(registry, /swipe-island-control/);
  assert.doesNotMatch(registry, /multi-drawer-handles/);
  assert.match(registry, /drawer-start-panel-id/);
  assert.match(registry, /drawer-end-panel-id/);
  assert.match(registry, /drawer/);
  assert.match(registry, /mobileDock/);
  assert.match(registry, /swipeControl/);
  assert.match(registry, /--sn-fullscreen-tab-bar-bg/);
  assert.match(registry, /--sn-fullscreen-tab-active-bg/);
  assert.match(customElements, /mobile-drawer/);
  assert.match(customElements, /mobile-swipe-mode/);
  assert.doesNotMatch(customElements, /swipe-island-control/);
  assert.match(customElements, /drawer/);
  assert.match(customElements, /swipe/);
  assert.match(customElements, /mobileDock/);
  assert.match(customElements, /swipeControl/);
  assert.match(customElements, /--sn-fullscreen-tab-bar-bg/);
  assert.match(customElements, /--sn-fullscreen-tab-active-bg/);
  assert.doesNotMatch(customElements, /--sn-layout-drawer-handle/);
});

test('fullscreen tab layer stays above floating toolbars in theme defaults', async () => {
  let [cascadeTheme, defaultProvider, defaultDark] = await Promise.all([
    readFile(cascadeThemeSource, 'utf8'),
    readFile(defaultProviderThemeSource, 'utf8'),
    readFile(defaultDarkThemeSource, 'utf8'),
  ]);

  for (let source of [cascadeTheme, defaultProvider, defaultDark]) {
    assert.match(source, /--sn-fullscreen-panel-z['"]:\s*['"]30010['"]/);
    assert.match(source, /--sn-fullscreen-tab-bar-z['"]:\s*['"]30020['"]/);
  }
  assert.match(cascadeTheme, /--sn-fullscreen-tab-bar-height['"]:\s*densityToken\(32\)/);
  assert.match(cascadeTheme, /--sn-fullscreen-tab-active-height['"]:\s*densityToken\(33\)/);
});

test('canvas graph fit clamps padding for narrow viewports', async () => {
  let source = await readFile(canvasGraphSource, 'utf8');
  let viewportSource = await readFile(canvasGraphViewportSource, 'utf8');
  let styles = await readFile(new URL('../canvas/CanvasGraph/CanvasGraph.css.js', import.meta.url), 'utf8');

  assert.match(source, /resolveCanvasGraphViewportFit/);
  assert.match(viewportSource, /function resolveFitPadding/);
  assert.match(viewportSource, /minSide \* 0\.32/);
  assert.match(viewportSource, /resolveFrameFitZoom\(frame,\s*rect,\s*fitPadding\)/);
  assert.match(viewportSource, /Math\.max\(1,\s*rect\.width - padding \* 2\)/);
  assert.match(styles, /touch-action:\s*none;/);
  assert.match(source, /_activePointers = new Map/);
  assert.match(source, /_startPinchGesture/);
  assert.match(source, /_applyPinchGesture/);
  assert.match(source, /this\.zoom = nextZoom/);
  assert.match(source, /this\._targetZoom = nextZoom/);
  assert.match(source, /pointercancel/);
});

test('node canvas declares touch ownership for mobile drawer gestures', async () => {
  let styles = await readFile(nodeCanvasStyles, 'utf8');

  assert.match(styles, /node-canvas\s*\{[\s\S]*?touch-action:\s*none;/);
  assert.match(styles, /node-canvas\s*\{[\s\S]*?user-select:\s*none;/);
  assert.match(styles, /\.canvas-container\s*\{[\s\S]*?touch-action:\s*none;/);
  assert.match(styles, /\[data-flow-scroll='vertical'\]\s*\{[\s\S]*?touch-action:\s*pan-y;/);
  assert.match(styles, /\[data-flow-scroll='horizontal'\]\s*\{[\s\S]*?touch-action:\s*pan-x;/);
});

test('canvas graph wheel zoom uses deltaMode-aware half-strength scaling', async () => {
  let source = await readFile(canvasGraphSource, 'utf8');
  let viewportSource = await readFile(canvasGraphViewportSource, 'utf8');

  assert.equal(DEFAULT_WHEEL_ZOOM_SENSITIVITY, 0.5);
  assert.match(source, /resolveWheelZoomFactor\(event\)/);
  assert.doesNotMatch(source, /e\.deltaY > 0 \? 0\.92 : 1\.08/);
  assert.match(viewportSource, /export const MAX_ZOOM_OUT_FIT_MULTIPLIER = 4;/);
  assert.match(source, /_resolveMinZoom\(rect[\s\S]*return resolveCanvasGraphMinZoom\(\{/);
  assert.match(source, /_clampZoom\(targetZoom \* factor,\s*rect\)/);
  assert.match(source, /_clampZoom\(this\._pinchGesture\.zoom \* \(distance \/ this\._pinchGesture\.distance\),\s*rect\)/);
  assert.doesNotMatch(source, /this\._targetZoom = Math\.max\(0\.02,\s*Math\.min\(5,\s*this\._targetZoom \* factor\)\)/);

  let pixelWheel = { deltaY: 120, deltaMode: 0, ctrlKey: false };
  let trackpadWheel = { deltaY: 10, deltaMode: 0, ctrlKey: false };
  let lineWheel = { deltaY: 3, deltaMode: 1, ctrlKey: false };
  let pageWheel = { deltaY: 1, deltaMode: 2, ctrlKey: false };

  assert.equal(resolveWheelZoomDelta(pixelWheel), -0.12);
  assert.ok(Math.abs(resolveWheelZoomDelta(lineWheel) + 0.075) < Number.EPSILON);
  assert.equal(resolveWheelZoomDelta(pageWheel), -0.5);
  assert.equal(resolveWheelZoomDelta(pixelWheel, 1), resolveWheelZoomDelta(pixelWheel) * 2);
  assert.ok(resolveWheelZoomFactor(trackpadWheel) > 0.99);
  assert.ok(resolveWheelZoomFactor(pixelWheel) < 0.93);
});

function withCanvasGraphGlobals(run) {
  return (async () => {
    let { parseHTML } = await import('linkedom');
    let { window } = parseHTML('<html><body></body></html>');
    let globalKeys = [
      'window',
      'document',
      'HTMLElement',
      'customElements',
      'CustomEvent',
      'Event',
      'EventTarget',
      'Node',
      'CSSStyleSheet',
    ];
    let descriptors = new Map(
      globalKeys.map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]),
    );
    for (let key of globalKeys.slice(0, -1)) {
      Object.defineProperty(globalThis, key, {
        configurable: true,
        value: window[key] || window,
      });
    }
    Object.defineProperty(globalThis, 'CSSStyleSheet', {
      configurable: true,
      value: class CSSStyleSheet { replaceSync() {} },
    });
    try {
      let { CanvasGraph } = await import('../canvas/CanvasGraph/CanvasGraph.js');
      return await run(CanvasGraph);
    } finally {
      for (let key of globalKeys) {
        let descriptor = descriptors.get(key);
        if (descriptor) Object.defineProperty(globalThis, key, descriptor);
        else delete globalThis[key];
      }
    }
  })();
}

test('CanvasGraph applies pointer-relative wheel zoom through one public path', async () => {
  await withCanvasGraphGlobals((CanvasGraph) => {
    let graph = Object.create(CanvasGraph.prototype);
    let wakeCount = 0;
    let clampCalls = [];
    let rect = { left: 40, top: 20, width: 800, height: 600 };
    graph.canvas = { getBoundingClientRect: () => rect };
    graph._targetZoom = 0.5;
    graph._zoomAnchor = null;
    graph._clampZoom = (zoom, targetRect) => {
      clampCalls.push({ zoom, rect: targetRect });
      return Math.max(0.25, Math.min(2, zoom));
    };
    graph._wakeLoop = () => { wakeCount += 1; };
    let event = { clientX: 240, clientY: 120, deltaY: -120, deltaMode: 0 };
    let factor = resolveWheelZoomFactor(event);

    assert.equal(graph.applyWheelZoom(event), true);
    assert.equal(graph._targetZoom, Math.max(0.25, Math.min(2, 0.5 * factor)));
    assert.deepEqual(graph._zoomAnchor, { mx: 200, my: 100 });
    assert.equal(wakeCount, 1);
    assert.deepEqual(clampCalls[0].rect, rect);
    assert.equal(graph.applyWheelZoom({ clientX: 0, clientY: 0, deltaY: Number.NaN }), false);
  });
});

test('CanvasGraph canvas wheel listener delegates to the public zoom path', async () => {
  await withCanvasGraphGlobals((CanvasGraph) => {
    let graph = Object.create(CanvasGraph.prototype);
    let listeners = {};
    graph.canvas = {
      addEventListener(type, fn) { (listeners[type] ||= []).push(fn); },
      setPointerCapture() {},
      style: {},
    };
    graph._activePointers = new Map();
    let wheelCalls = [];
    graph.applyWheelZoom = (event) => { wheelCalls.push(event); };
    graph.bindEvents();
    let event = { preventDefault() {} };

    listeners.wheel[0](event);

    assert.equal(wheelCalls.length, 1);
    assert.equal(wheelCalls[0], event);
  });
});

function makeActivationGraph(CanvasGraph) {
  let graph = Object.create(CanvasGraph.prototype);
  graph.nodeMap = new Map([
    ['alpha', { id: 'alpha' }],
    ['beta', { id: 'beta' }],
  ]);
  graph.activeNode = null;
  graph.nextActiveNode = null;
  graph.deactivating = false;
  graph.dragNode = null;
  graph.isPanning = false;
  graph._infoPanel = { nodeId: null, lines: [], totalExtent: 0, totalExtentY: 0, _centeredForNode: null };
  graph._transitionMarkers = [];
  graph.zoom = 0.5;
  graph.panX = 120;
  graph.panY = -40;
  graph._targetZoom = 0.5;
  graph._targetPanX = null;
  graph._targetPanY = null;
  graph.markerCalls = 0;
  graph._queueTransitionMarker = () => { graph.markerCalls += 1; return null; };
  graph._setHoverAction = () => {};
  graph.updateInteractionDepths = () => {};
  graph._wakeLoop = () => {};
  return graph;
}

test('CanvasGraph.activateNode sets active state immediately without moving the viewport', async () => {
  await withCanvasGraphGlobals((CanvasGraph) => {
    let graph = makeActivationGraph(CanvasGraph);
    assert.equal(graph.activateNode('missing'), false);
    assert.equal(graph.activateNode(''), false);
    assert.equal(graph.activeNode, null);

    graph._targetPanX = 900;
    graph._targetPanY = 700;
    graph._targetZoom = 1.4;
    graph._transitionMarkers = [{ pendingActivation: 'beta', pendingViewport: { panX: 1 } }];
    let viewportBefore = { zoom: graph.zoom, panX: graph.panX, panY: graph.panY };
    assert.equal(graph.activateNode('alpha'), true);
    assert.equal(graph.activeNode?.id, 'alpha');
    assert.deepEqual({ zoom: graph.zoom, panX: graph.panX, panY: graph.panY }, viewportBefore);
    assert.equal(graph._targetPanX, null);
    assert.equal(graph._targetPanY, null);
    assert.equal(graph._targetZoom, graph.zoom);
    assert.equal(graph.markerCalls, 0);
    assert.equal(graph._transitionMarkers.length, 0);
    assert.equal(graph._infoPanel._centeredForNode, 'alpha');

    assert.equal(graph.activateNode('beta'), true);
    assert.equal(graph.activeNode?.id, 'beta');
    assert.equal(graph.markerCalls, 0);
    assert.deepEqual({ zoom: graph.zoom, panX: graph.panX, panY: graph.panY }, viewportBefore);
    assert.equal(graph._infoPanel._centeredForNode, 'beta');

    assert.equal(graph.activateNode('beta'), true);
    assert.equal(graph.markerCalls, 0);

    graph.activeNode = graph.nodeMap.get('alpha');
    assert.equal(graph.activateNode('beta', { marker: true }), true);
    assert.equal(graph.markerCalls, 1);
  });
});

test('CanvasGraph.activateNode is a viewport-free delegation to the private activation path', async () => {
  let source = await readFile(canvasGraphSource, 'utf8');

  assert.match(source, /activateNode\(nodeId, \{ transition = false, marker = false \} = \{\}\) \{/);
  assert.match(source, /let id = String\(nodeId \|\| ''\)\.trim\(\);/);
  assert.match(source, /this\._cancelViewportGestureTarget\(\);/);
  assert.match(source, /!item\?\.pendingActivation && !item\?\.pendingViewport/);
  assert.match(source, /let activated = this\._activateNode\(id, \{ transition, marker \}\);/);
  assert.match(source, /this\._infoPanel\._centeredForNode = id;/);
  assert.match(source, /return activated;/);
});

test('node canvas fit view avoids microscopic startup zoom', async () => {
  let source = await readFile(canvasViewportSource, 'utf8');

  assert.match(source, /const NODE_CANVAS_MIN_FIT_ZOOM = 0\.08;/);
  assert.match(source, /const NODE_CANVAS_MIN_FIT_VIEWPORT_SIZE = 48;/);
  assert.match(source, /resolveFitPadding\(padding, viewport\)/);
  assert.match(source, /resolveFitPadding\(80, viewport\)/);
  assert.doesNotMatch(source, /Math\.max\(0\.001,\s*Math\.min\(scaleX,\s*scaleY,\s*1\.5\)\)/);
  assert.doesNotMatch(source, /minZoom = 0\.001/);
});

test('node canvas single-node focus uses viewport transition by default', async () => {
  let source = await readFile(canvasViewportSource, 'utf8');

  assert.match(source, /flyToNode\(nodeId, options = {}\) {/);
  assert.match(source, /#resolveViewportTransitionDuration\(options = \{\}, fallback = 520\)/);
  assert.match(source, /let clock = options\.transitionClock \|\| createFocusTransitionClock\(options\.transitionStartTime\);/);
  assert.match(source, /let elapsed = now - clock\.resolveStart\(now\);/);
  assert.match(source, /#resolveFitTarget\(bounds,/);
  assert.match(source, /viewportRouteFitBounds/);
  assert.match(source, /resolveCanvasGraphCameraArc\(\{/);
  assert.match(source, /this\.#canvas\._getNodeGraphCenter\?\.\(options\.viewportTargetNodeId\)/);
  assert.match(source, /this\.#setViewportTransform\(lastViewport\);/);
  assert.doesNotMatch(source, /pointAtRouteProgress/);
  assert.doesNotMatch(source, /viewportRouteTravelEnd/);
  assert.doesNotMatch(source, /interpolatePoint/);
  assert.match(source, /viewportRouteCenter: \{ x: visibleWidth \/ 2, y: canvasRect\.height \/ 2 \}/);
  assert.match(source, /if \(shouldSelect\) this\.#canvas\.selectNode\(selectId\);\s*this\.#animateViewportTo\(\{\s*zoom,\s*panX: newPanX,\s*panY: newPanY,\s*\}, \{\s*\.\.\.options,/);
  assert.match(source, /options\.transition === false \|\| options\.animate === false/);
});

test('layout minimum size estimate follows split direction and node behavior', () => {
  let graph = createPanel('graph', {}, { minInlineSize: 420, minBlockSize: 260 });
  let chat = createPanel('chat', {}, { minInlineSize: 320, minBlockSize: 280 });
  let inspector = createPanel('inspector', {}, { minInlineSize: 280, minBlockSize: 360 });
  let right = createSplit('vertical', chat, inspector, 0.5);
  let root = createSplit('horizontal', graph, right, 0.55);

  let size = resolveLayoutMinSize(root);

  assert.equal(Math.round(size.inlineSize), 764);
  assert.equal(size.blockSize, 720);

  chat.collapsed = true;
  let collapsedSize = resolveLayoutMinSize(root);

  assert.equal(Math.round(collapsedSize.inlineSize), 764);
  assert.equal(collapsedSize.blockSize, 720);
});

test('layout minimum size estimate respects split ratios', () => {
  let primary = createPanel('primary', {}, { minInlineSize: 520, minBlockSize: 240 });
  let side = createPanel('side', {}, { minInlineSize: 300, minBlockSize: 220 });
  let root = createSplit('horizontal', primary, side, 0.68);
  let size = resolveLayoutMinSize(root);

  assert.equal(Math.round(size.inlineSize), 938);
  assert.equal(size.blockSize, 240);

  let top = createPanel('top', {}, { minInlineSize: 260, minBlockSize: 280 });
  let bottom = createPanel('bottom', {}, { minInlineSize: 280, minBlockSize: 360 });
  let vertical = createSplit('vertical', top, bottom, 0.44);
  let verticalSize = resolveLayoutMinSize(vertical);

  assert.equal(verticalSize.inlineSize, 280);
  assert.equal(Math.round(verticalSize.blockSize), 643);
});

test('layout tree opens and closes UI-invoked panels without owning host layout policy', () => {
  let root = createPanel('graph', {}, { importance: 90 });
  let opened = openPanel(root, 'theme', {
    behavior: { importance: 100, collapse: 'manual', minInlineSize: 320 },
    direction: 'horizontal',
    panelState: { storageKey: 'symbiote-ui:test-theme' },
    ratio: 0.66,
    source: 'theme-widget',
    uiInvoked: true,
  });

  assert.equal(opened.created, true);
  assert.equal(opened.root.type, 'split');
  assert.equal(opened.root.direction, 'horizontal');
  assert.equal(opened.root.ratio, 0.66);
  assert.equal(opened.panel.panelType, 'theme');
  assert.equal(opened.panel.panelState.uiInvoked, true);
  assert.equal(opened.panel.panelState.source, 'theme-widget');
  assert.equal(opened.panel.panelState.storageKey, 'symbiote-ui:test-theme');
  assert.equal(getNodeBehavior(opened.panel).importance, 100);
  assert.equal(getNodeBehavior(opened.panel).collapse, 'manual');

  let reused = openPanel(opened.root, 'theme', {
    source: 'theme-widget',
    uiInvoked: true,
  });
  assert.equal(reused.created, false);
  assert.equal(reused.panel.id, opened.panel.id);

  let closed = closeUiPanel(reused.root, 'theme');
  assert.equal(closed.closed, true);
  assert.equal(closed.removed, false);
  assert.equal(findPanelByType(closed.root, 'theme').collapsed, true);
  assert.equal(findPanelByType(closed.root, 'theme').panelState.closed, true);
  assert.equal(findPanelByType(closed.root, 'graph').panelType, 'graph');

  let reopened = openPanel(closed.root, 'theme', {
    source: 'theme-widget',
    uiInvoked: true,
  });
  assert.equal(reopened.created, false);
  assert.equal(reopened.panel.id, opened.panel.id);
  assert.equal(reopened.panel.collapsed, false);
  assert.equal(reopened.panel.panelState.closed, false);
});

test('global panel helper preserves panel and split behavior contracts', () => {
  let createLayout = withGlobalPanel(
    () => createPanel('main', {}, { importance: 60, minInlineSize: 320 }),
    'agent-chat',
    {
      behavior: { importance: 95, collapse: 'manual', minInlineSize: 360 },
      splitBehavior: { overflow: 'scroll-inline', responsiveMode: 'scroll-inline' },
      panelState: { source: 'global-chat', removable: true },
      ratio: 0.72,
    },
  );

  let root = createLayout();
  assert.equal(root.type, 'split');
  assert.equal(root.ratio, 0.72);
  assert.equal(root.behavior.overflow, 'scroll-inline');
  assert.equal(root.second.panelType, 'agent-chat');
  assert.equal(root.second.panelState.source, 'global-chat');
  assert.equal(root.second.panelState.removable, true);
  assert.equal(getNodeBehavior(root.second).importance, 95);
  assert.equal(getNodeBehavior(root.second).collapse, 'manual');
  assert.equal(getNodeBehavior(root.second).minInlineSize, 360);
});

test('layout tree removeUiPanel restores captured host layout for the last temporary panel', () => {
  let graph = createPanel('graph');
  let ui = createPanel('ui');
  let chat = createPanel('chat');
  let hostRoot = createSplit(
    'horizontal',
    graph,
    createSplit('vertical', ui, chat, 0.48),
    0.58
  );
  let opened = openPanel(hostRoot, 'theme', {
    source: 'theme-widget',
    uiInvoked: true,
    ratio: 0.66,
  });

  let removed = removeUiPanel(opened.root, 'theme', { fallbackRoot: hostRoot });

  assert.equal(removed.removed, true);
  assert.equal(removed.restored, true);
  assert.equal(removed.root.id, hostRoot.id);
  assert.equal(removed.root.ratio, 0.58);
  assert.equal(removed.root.second.ratio, 0.48);
  assert.equal(findPanelByType(removed.root, 'theme'), null);
});

test('layout tree expands promoted survivor after panel removal', () => {
  let graph = createPanel('graph');
  let chat = createPanel('chat');
  let inspector = createPanel('inspector');
  let root = createSplit(
    'horizontal',
    createSplit('vertical', graph, chat, 0.55),
    inspector,
    0.64
  );

  inspector.collapsed = true;
  inspector.autoCollapsed = true;

  let promotedPanel = joinPanels(root, root.first.id);

  assert.equal(promotedPanel.id, inspector.id);
  assert.equal(promotedPanel.collapsed, false);
  assert.equal(promotedPanel.autoCollapsed, false);

  let canvas = createPanel('canvas');
  let toolbar = createPanel('toolbar');
  let status = createPanel('status');
  let branch = createSplit('vertical', toolbar, status, 0.5);
  let nested = createSplit('horizontal', canvas, branch, 0.7);

  toolbar.collapsed = true;
  toolbar.autoCollapsed = true;
  status.collapsed = true;

  let promotedBranch = joinPanels(nested, canvas.id);

  assert.equal(promotedBranch.id, branch.id);
  assert.equal(toolbar.collapsed, false);
  assert.equal(toolbar.autoCollapsed, false);
  assert.equal(status.collapsed, true);
});

test('layout tree closeUiPanel refuses to remove host-owned panels', () => {
  let root = createSplit(
    'horizontal',
    createPanel('theme', { source: 'host-layout' }),
    createPanel('graph'),
    0.5
  );

  let result = closeUiPanel(root, 'theme');

  assert.equal(result.removed, false);
  assert.equal(result.closed, false);
  assert.equal(findPanelByType(result.root, 'theme').panelState.source, 'host-layout');
});

test('layout tree removeUiPanel can restore host layout when temporary panel is root', () => {
  let hostRoot = createSplit(
    'horizontal',
    createPanel('graph'),
    createPanel('chat'),
    0.58
  );
  let temporaryRoot = createPanel('theme', {
    source: 'theme-widget',
    uiInvoked: true,
  });

  let result = removeUiPanel(temporaryRoot, 'theme', { fallbackRoot: hostRoot });

  assert.equal(result.removed, true);
  assert.equal(result.restored, true);
  assert.equal(result.root.type, 'split');
  assert.equal(result.root.ratio, 0.58);
  assert.equal(findPanelByType(result.root, 'graph').panelType, 'graph');
  assert.equal(findPanelByType(result.root, 'chat').panelType, 'chat');
  assert.equal(findPanelByType(result.root, 'theme'), null);
});

test('layout tree opens UI-invoked panels separately from host-owned panels of the same type', () => {
  let root = createSplit(
    'horizontal',
    createPanel('theme', { source: 'host-layout' }),
    createPanel('graph'),
    0.5
  );
  let opened = openPanel(root, 'theme', {
    source: 'theme-widget',
    uiInvoked: true,
  });

  assert.equal(opened.created, true);
  assert.notEqual(opened.panel.panelState.source, 'host-layout');
  assert.equal(opened.panel.panelState.source, 'theme-widget');
  assert.equal(findPanelByType(opened.root, 'theme', { uiInvoked: false }).panelState.source, 'host-layout');
  assert.equal(findPanelByType(opened.root, 'theme', { uiInvoked: true }).panelState.source, 'theme-widget');

  let closed = closeUiPanel(opened.root, 'theme');
  assert.equal(closed.closed, true);
  assert.equal(closed.removed, false);
  assert.equal(findPanelByType(closed.root, 'theme', { uiInvoked: false }).panelState.source, 'host-layout');
  assert.equal(findPanelByType(closed.root, 'theme', { uiInvoked: true }).panelState.closed, true);

  let removed = removeUiPanel(closed.root, 'theme');
  assert.equal(removed.removed, true);
  assert.equal(findPanelByType(removed.root, 'theme').panelState.source, 'host-layout');
});

test('layout restore guard rejects expanded states that would immediately collapse again', () => {
  let graph = createPanel('graph', {}, { minInlineSize: 650, minBlockSize: 260 });
  let inspector = createPanel('inspector', {}, { minInlineSize: 300, minBlockSize: 220 });
  let root = createSplit('horizontal', graph, inspector, 0.68);

  inspector.collapsed = true;
  inspector.autoCollapsed = true;

  assert.equal(
    branchFitsExpandedState(root, 900, 420, { restoringNodeId: inspector.id }),
    false
  );
  assert.equal(
    branchFitsExpandedState(root, 1160, 420, { restoringNodeId: inspector.id }),
    true
  );

  assert.equal(
    branchFitsExpandedState(root, 1120, 420, {
      restoringNodeId: inspector.id,
      stableFactor: 1,
      restoreFactor: 1.25,
    }),
    false
  );
});

test('priority compression shrinks lower-importance wide panels before auto-collapse', () => {
  let tree = createPanel('tree', {}, {
    importance: 82,
    minInlineSize: 200,
    collapse: 'auto',
  });
  let details = createPanel('details', {}, {
    importance: 100,
    minInlineSize: 320,
    collapse: 'never',
  });
  let graph = createPanel('graph', {}, {
    importance: 70,
    minInlineSize: 320,
    collapse: 'auto',
  });
  let content = createSplit('horizontal', details, graph, 0.32);
  let root = createSplit('horizontal', tree, content, 0.22, {
    minInlineSize: 960,
  });

  assert.equal(
    applyPriorityCompression(root, { inlineSize: 960 }),
    true
  );
  assert.ok(Math.abs(root[RUNTIME_SPLIT_RATIO] - 1 / 3) < 0.01);
  assert.ok(Math.abs(content[RUNTIME_SPLIT_RATIO] - 0.5) < 0.01);
  assert.equal(JSON.stringify(root).includes('runtimeSplitRatio'), false);

  assert.equal(clearPriorityCompression(root), true);
  assert.equal(root[RUNTIME_SPLIT_RATIO], undefined);
  assert.equal(content[RUNTIME_SPLIT_RATIO], undefined);

  assert.equal(
    applyPriorityCompression(root, { inlineSize: 1300 }),
    false
  );
});

test('locked split ratio survives priority compression and explicit resize', () => {
  let tree = createPanel('tree', {}, { importance: 82, minInlineSize: 200 });
  let details = createPanel('details', {}, { importance: 100, minInlineSize: 320 });
  let graph = createPanel('graph', {}, { importance: 70, minInlineSize: 320 });
  let content = createSplit('horizontal', details, graph, 0.5, undefined, { lockRatio: true });
  let root = createSplit('horizontal', tree, content, 0.22, { minInlineSize: 960 });

  assert.equal(applyPriorityCompression(root, { inlineSize: 960 }), true);
  assert.ok(root[RUNTIME_SPLIT_RATIO] !== undefined);
  assert.equal(content[RUNTIME_SPLIT_RATIO], undefined);
  assert.equal(content.lockRatio, true);

  resizeSplit(root, content.id, 0.6);
  assert.equal(clearPriorityCompression(root), true);
  assert.equal(applyPriorityCompression(root, { inlineSize: 960 }), false);
  assert.equal(content.ratio, 0.6);
  assert.equal(content[RUNTIME_SPLIT_RATIO], undefined);

  content[RUNTIME_SPLIT_RATIO] = 0.4;
  assert.equal(applyPriorityCompression(root, { inlineSize: 960 }), true);
  assert.equal(content[RUNTIME_SPLIT_RATIO], undefined);
  assert.equal(JSON.parse(JSON.stringify(content)).lockRatio, true);
});

test('panel layout drawer API and rail gestures open and close drawer panels without built-in handles', async () => {
  let { parseHTML } = await import('linkedom');
  let { window } = parseHTML('<!doctype html><html><body></body></html>');
  let TestCSSStyleSheet = class {
    replaceSync(text) { this.cssText = text; }
  };
  Object.assign(globalThis, {
    window,
    document: window.document,
    HTMLElement: window.HTMLElement,
    Element: window.Element,
    customElements: window.customElements,
    Node: window.Node,
    Event: window.Event,
    CustomEvent: window.CustomEvent,
    MutationObserver: window.MutationObserver,
    CSSStyleSheet: TestCSSStyleSheet,
    getComputedStyle: window.getComputedStyle || (() => ({ transitionDuration: '0s', animationDuration: '0s' })),
  });
  window.document.adoptedStyleSheets = [];

  // Mock getPropertyPriority for linkedom's style object
  const div = window.document.createElement('div');
  const StyleProto = Object.getPrototypeOf(div.style);
  StyleProto.getPropertyPriority = StyleProto.getPropertyPriority || (() => '');

  // Import Layout
  await import('../layout/Layout/Layout.js');
  await import('../layout/LayoutNode/LayoutNode.js');

  const layout = document.createElement('panel-layout');
  document.body.append(layout);

  layout.getBoundingClientRect = () => ({
    width: 300,
    height: 600,
    top: 0,
    left: 0,
    bottom: 600,
    right: 300,
  });

  layout.$.layoutBehavior = {
    responsiveMode: 'drawer',
    responsiveBreakpoint: 720,
  };

  layout.registerPanelType('materials', { title: 'Materials', icon: 'folder', behavior: { minInlineSize: 320, minBlockSize: 240, responsiveMode: 'drawer' } });
  layout.registerPanelType('graph', { title: 'Graph', icon: 'hub', behavior: { minInlineSize: 640, minBlockSize: 480 } });

  layout.setLayout(createSplit(
    'horizontal',
    createPanel('graph'),
    createPanel('materials', { mobileDock: 'end' }),
    0.5
  ));

  // Trigger next layout cycle
  layout._applyResponsiveLayout();
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));

  // Verify it is in drawer-mode-active
  assert.equal(layout.hasAttribute('drawer-mode-active'), true);

  assert.equal(layout.querySelector('.layout-drawer-handle-stack-end'), null);
  assert.equal(layout.querySelector('.layout-drawer-handle'), null);

  layout.openDrawer('end');
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(layout.$.drawerEndOpen, true);
  assert.equal(layout.hasAttribute('drawer-end-open'), true);
  assert.equal(layout.querySelector('layout-node[mobile-dock="end"]')?.hasAttribute('drawer-open'), true);

  layout.closeDrawer('end');
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(layout.$.drawerEndOpen, false);
  assert.equal(layout.hasAttribute('drawer-end-open'), false);
  assert.equal(layout._drawerGesture ?? null, null);

  const railLayout = document.createElement('panel-layout');
  document.body.append(railLayout);
  railLayout.getBoundingClientRect = () => ({
    width: 300,
    height: 600,
    top: 0,
    left: 0,
    bottom: 600,
    right: 300,
  });
  railLayout.$.layoutBehavior = {
    responsiveMode: 'drawer',
    responsiveBreakpoint: 720,
    swipeControl: 'rail',
    drawerHoverOpen: true,
  };
  railLayout.registerPanelType('nav', {
    title: 'Navigation',
    icon: 'folder',
    behavior: { mobileDock: 'start', swipeControl: 'rail', drawerHoverOpen: true },
  });
  railLayout.registerPanelType('main', {
    title: 'Main',
    icon: 'article',
    behavior: { mobileDock: 'primary', minInlineSize: 320, minBlockSize: 240 },
  });
  railLayout.registerPanelType('tools', {
    title: 'Tools',
    icon: 'hub',
    behavior: { mobileDock: 'end', swipeControl: 'rail' },
  });
  railLayout.setLayout(createSplit(
    'horizontal',
    createPanel('nav'),
    createSplit('horizontal', createPanel('main'), createPanel('tools'), 0.8),
    0.25
  ));
  railLayout._applyResponsiveLayout();
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(railLayout.hasAttribute('drawer-mode-active'), true);
  assert.equal(railLayout.querySelector('.layout-drawer-handle-stack-start'), null);
  assert.equal(railLayout._drawerRailPeekPlayed, true);
  assert.ok(railLayout._drawerRailPeekTimer);

  let railNode = railLayout.querySelector('layout-node[drawer-rail][drawer-rail-collapsed][data-drawer-dock="start"]');
  assert.ok(railNode);
  assert.equal(railNode.dataset.swipeControl, 'rail');
  assert.equal(railNode.hasAttribute('drawer-hover-open'), true);
  let endRailPeekNode = railLayout.querySelector('layout-node[drawer-rail][drawer-rail-collapsed][data-drawer-dock="end"]');
  assert.ok(endRailPeekNode);
  railLayout._runDrawerRailPeek();
  assert.equal(railNode.hasAttribute('drawer-rail-peeking'), true);
  assert.match(railNode.style.getPropertyValue('transform'), /--sn-layout-drawer-rail-peek-distance/);
  assert.equal(endRailPeekNode.hasAttribute('drawer-rail-peeking'), true);
  assert.match(endRailPeekNode.style.getPropertyValue('transform'), /calc\(/);
  railLayout._clearDrawerRailPeek();
  assert.equal(railNode.hasAttribute('drawer-rail-peeking'), false);
  assert.equal(endRailPeekNode.hasAttribute('drawer-rail-peeking'), false);
  assert.equal(railNode.style.getPropertyValue('transform'), 'translate3d(0px, 0, 0)');
  assert.equal(endRailPeekNode.style.getPropertyValue('transform'), 'translate3d(0px, 0, 0)');

  const railClickDown = new Event('pointerdown', { bubbles: true });
  railClickDown.pointerId = 3;
  railClickDown.button = 0;
  railClickDown.clientX = 12;
  railClickDown.preventDefault = () => {};
  railNode.dispatchEvent(railClickDown);

  const railClickUp = new Event('pointerup');
  railClickUp.pointerId = 3;
  railClickUp.clientX = 12;
  railClickUp.preventDefault = () => {};
  railLayout.dispatchEvent(railClickUp);

  assert.equal(railLayout.$.drawerStartOpen, true);
  assert.equal(railLayout.hasAttribute('drawer-start-open'), true);
  railNode.dispatchEvent(new CustomEvent('panel-collapse-toggle', {
    bubbles: true,
    composed: true,
    detail: { panelId: railNode.$.nodeId, collapsed: true },
  }));
  assert.equal(railLayout.$.drawerStartOpen, true);

  let endRailNode = railLayout.querySelector('layout-node[drawer-rail][drawer-rail-collapsed][data-drawer-dock="end"]');
  assert.ok(endRailNode);
  const oppositeRailDown = new Event('pointerdown', { bubbles: true });
  oppositeRailDown.pointerId = 9;
  oppositeRailDown.button = 0;
  oppositeRailDown.clientX = 288;
  oppositeRailDown.preventDefault = () => {};
  endRailNode.dispatchEvent(oppositeRailDown);

  const oppositeRailUp = new Event('pointerup');
  oppositeRailUp.pointerId = 9;
  oppositeRailUp.clientX = 288;
  oppositeRailUp.preventDefault = () => {};
  railLayout.dispatchEvent(oppositeRailUp);
  assert.equal(railLayout.$.drawerStartOpen, false);
  assert.equal(railLayout.$.drawerEndOpen, false);
  endRailNode.dispatchEvent(new CustomEvent('panel-collapse-toggle', {
    bubbles: true,
    composed: true,
    detail: { panelId: endRailNode.$.nodeId, collapsed: false },
  }));
  assert.equal(railLayout.$.drawerEndOpen, false);

  railLayout.closeDrawer('start');
  railNode = railLayout.querySelector('layout-node[drawer-rail][drawer-rail-collapsed][data-drawer-dock="start"]');
  assert.ok(railNode);

  railNode.dispatchEvent(new CustomEvent('panel-collapse-toggle', {
    bubbles: true,
    composed: true,
    detail: { panelId: railNode.$.nodeId, collapsed: false },
  }));
  assert.equal(railLayout.$.drawerStartOpen, true);
  let drawerClickTarget = document.createElement('div');
  railNode.append(drawerClickTarget);
  let drawerClick = new Event('click', { bubbles: true, cancelable: true });
  drawerClickTarget.dispatchEvent(drawerClick);
  assert.equal(drawerClick.defaultPrevented, true);
  railLayout._drawerClickSuppressUntil = 0;

  railLayout.closeDrawer('start');
  railNode = railLayout.querySelector('layout-node[drawer-rail][drawer-rail-collapsed][data-drawer-dock="start"]');
  const railTouchDown = new Event('pointerdown', { bubbles: true });
  railTouchDown.pointerId = 6;
  railTouchDown.pointerType = 'touch';
  railTouchDown.button = 0;
  railTouchDown.clientX = 12;
  railTouchDown.preventDefault = () => {};
  railNode.dispatchEvent(railTouchDown);

  const railTouchMove = new Event('pointermove');
  railTouchMove.pointerId = 6;
  railTouchMove.pointerType = 'touch';
  railTouchMove.clientX = 22;
  railTouchMove.preventDefault = () => {};
  railLayout.dispatchEvent(railTouchMove);

  const railTouchUp = new Event('pointerup');
  railTouchUp.pointerId = 6;
  railTouchUp.pointerType = 'touch';
  railTouchUp.clientX = 22;
  railTouchUp.preventDefault = () => {};
  railLayout.dispatchEvent(railTouchUp);

  assert.equal(railLayout.$.drawerStartOpen, true);
  railNode.dispatchEvent(new CustomEvent('panel-collapse-toggle', {
    bubbles: true,
    composed: true,
    detail: { panelId: railNode.$.nodeId, collapsed: true },
  }));
  assert.equal(railLayout.$.drawerStartOpen, true);

  railLayout.closeDrawer('start');
  railNode = railLayout.querySelector('layout-node[drawer-rail][drawer-rail-collapsed][data-drawer-dock="start"]');
  const railHover = new Event('pointerover', { bubbles: true });
  railHover.pointerType = 'mouse';
  railHover.preventDefault = () => {};
  railNode.dispatchEvent(railHover);
  assert.equal(railLayout.$.drawerStartOpen, true);

  railLayout.closeDrawer('start');
  railNode = railLayout.querySelector('layout-node[drawer-rail][drawer-rail-collapsed][data-drawer-dock="start"]');
  const railSwipeDown = new Event('pointerdown', { bubbles: true });
  railSwipeDown.pointerId = 4;
  railSwipeDown.button = 0;
  railSwipeDown.clientX = 8;
  railSwipeDown.preventDefault = () => {};
  railNode.dispatchEvent(railSwipeDown);

  const railSwipeMove = new Event('pointermove');
  railSwipeMove.pointerId = 4;
  railSwipeMove.clientX = 220;
  railSwipeMove.preventDefault = () => {};
  railLayout.dispatchEvent(railSwipeMove);

  const railSwipeUp = new Event('pointerup');
  railSwipeUp.pointerId = 4;
  railSwipeUp.clientX = 260;
  railSwipeUp.preventDefault = () => {};
  railLayout.dispatchEvent(railSwipeUp);
  assert.equal(railLayout.$.drawerStartOpen, true);

  railLayout.openDrawer('start');
  railNode = railLayout.querySelector('layout-node[drawer-rail][drawer-expanded][data-drawer-dock="start"]');
  assert.ok(railNode);

  const drawerContentJitterDown = new Event('pointerdown', { bubbles: true });
  drawerContentJitterDown.pointerId = 7;
  drawerContentJitterDown.pointerType = 'touch';
  drawerContentJitterDown.button = 0;
  drawerContentJitterDown.clientX = 220;
  drawerContentJitterDown.clientY = 80;
  railNode.dispatchEvent(drawerContentJitterDown);

  const drawerContentJitterMove = new Event('pointermove');
  drawerContentJitterMove.pointerId = 7;
  drawerContentJitterMove.pointerType = 'touch';
  drawerContentJitterMove.clientX = 214;
  drawerContentJitterMove.clientY = 84;
  drawerContentJitterMove.preventDefault = () => {};
  railLayout.dispatchEvent(drawerContentJitterMove);

  const drawerContentJitterUp = new Event('pointerup');
  drawerContentJitterUp.pointerId = 7;
  drawerContentJitterUp.pointerType = 'touch';
  drawerContentJitterUp.clientX = 214;
  drawerContentJitterUp.clientY = 84;
  railLayout.dispatchEvent(drawerContentJitterUp);
  assert.equal(railLayout.$.drawerStartOpen, true);

  railNode = railLayout.querySelector('layout-node[drawer-rail][drawer-expanded][data-drawer-dock="start"]');
  const drawerContentSwipeDown = new Event('pointerdown', { bubbles: true });
  drawerContentSwipeDown.pointerId = 8;
  drawerContentSwipeDown.pointerType = 'touch';
  drawerContentSwipeDown.button = 0;
  drawerContentSwipeDown.clientX = 220;
  drawerContentSwipeDown.clientY = 80;
  railNode.dispatchEvent(drawerContentSwipeDown);

  const drawerContentSwipeMove = new Event('pointermove');
  drawerContentSwipeMove.pointerId = 8;
  drawerContentSwipeMove.pointerType = 'touch';
  drawerContentSwipeMove.clientX = 40;
  drawerContentSwipeMove.clientY = 88;
  drawerContentSwipeMove.preventDefault = () => {};
  railLayout.dispatchEvent(drawerContentSwipeMove);

  const drawerContentSwipeUp = new Event('pointerup');
  drawerContentSwipeUp.pointerId = 8;
  drawerContentSwipeUp.pointerType = 'touch';
  drawerContentSwipeUp.clientX = 24;
  drawerContentSwipeUp.clientY = 90;
  drawerContentSwipeUp.preventDefault = () => {};
  railLayout.dispatchEvent(drawerContentSwipeUp);
  assert.equal(railLayout.$.drawerStartOpen, false);

  let primaryNode = railLayout.querySelector('layout-node[drawer-primary]');
  assert.ok(primaryNode);
  const primaryStartSwipeDown = new Event('pointerdown', { bubbles: true });
  primaryStartSwipeDown.pointerId = 10;
  primaryStartSwipeDown.pointerType = 'touch';
  primaryStartSwipeDown.button = 0;
  primaryStartSwipeDown.clientX = 120;
  primaryStartSwipeDown.clientY = 240;
  primaryNode.dispatchEvent(primaryStartSwipeDown);

  const primaryStartSwipeMove = new Event('pointermove');
  primaryStartSwipeMove.pointerId = 10;
  primaryStartSwipeMove.pointerType = 'touch';
  primaryStartSwipeMove.clientX = 270;
  primaryStartSwipeMove.clientY = 248;
  primaryStartSwipeMove.preventDefault = () => {};
  railLayout.dispatchEvent(primaryStartSwipeMove);

  const primaryStartSwipeUp = new Event('pointerup');
  primaryStartSwipeUp.pointerId = 10;
  primaryStartSwipeUp.pointerType = 'touch';
  primaryStartSwipeUp.clientX = 292;
  primaryStartSwipeUp.clientY = 250;
  primaryStartSwipeUp.preventDefault = () => {};
  railLayout.dispatchEvent(primaryStartSwipeUp);
  assert.equal(railLayout.$.drawerStartOpen, true);
  assert.equal(railLayout.$.drawerEndOpen, false);

  railLayout.closeDrawer('start');
  primaryNode = railLayout.querySelector('layout-node[drawer-primary]');
  const primaryEndSwipeDown = new Event('pointerdown', { bubbles: true });
  primaryEndSwipeDown.pointerId = 11;
  primaryEndSwipeDown.pointerType = 'touch';
  primaryEndSwipeDown.button = 0;
  primaryEndSwipeDown.clientX = 180;
  primaryEndSwipeDown.clientY = 240;
  primaryNode.dispatchEvent(primaryEndSwipeDown);

  const primaryEndSwipeMove = new Event('pointermove');
  primaryEndSwipeMove.pointerId = 11;
  primaryEndSwipeMove.pointerType = 'touch';
  primaryEndSwipeMove.clientX = 40;
  primaryEndSwipeMove.clientY = 248;
  primaryEndSwipeMove.preventDefault = () => {};
  railLayout.dispatchEvent(primaryEndSwipeMove);

  const primaryEndSwipeUp = new Event('pointerup');
  primaryEndSwipeUp.pointerId = 11;
  primaryEndSwipeUp.pointerType = 'touch';
  primaryEndSwipeUp.clientX = 8;
  primaryEndSwipeUp.clientY = 250;
  primaryEndSwipeUp.preventDefault = () => {};
  railLayout.dispatchEvent(primaryEndSwipeUp);
  assert.equal(railLayout.$.drawerStartOpen, false);
  assert.equal(railLayout.$.drawerEndOpen, true);

  railLayout.closeDrawer('end');
  primaryNode = railLayout.querySelector('layout-node[drawer-primary]');
  const primaryVerticalDown = new Event('pointerdown', { bubbles: true });
  primaryVerticalDown.pointerId = 12;
  primaryVerticalDown.pointerType = 'touch';
  primaryVerticalDown.button = 0;
  primaryVerticalDown.clientX = 140;
  primaryVerticalDown.clientY = 120;
  primaryNode.dispatchEvent(primaryVerticalDown);

  let verticalPrevented = false;
  const primaryVerticalMove = new Event('pointermove');
  primaryVerticalMove.pointerId = 12;
  primaryVerticalMove.pointerType = 'touch';
  primaryVerticalMove.clientX = 146;
  primaryVerticalMove.clientY = 250;
  primaryVerticalMove.preventDefault = () => { verticalPrevented = true; };
  railLayout.dispatchEvent(primaryVerticalMove);

  const primaryVerticalUp = new Event('pointerup');
  primaryVerticalUp.pointerId = 12;
  primaryVerticalUp.pointerType = 'touch';
  primaryVerticalUp.clientX = 146;
  primaryVerticalUp.clientY = 250;
  railLayout.dispatchEvent(primaryVerticalUp);
  assert.equal(verticalPrevented, false);
  assert.equal(railLayout._drawerGesture, null);
  assert.equal(railLayout.$.drawerStartOpen, false);
  assert.equal(railLayout.$.drawerEndOpen, false);

  const primaryTapDown = new Event('pointerdown', { bubbles: true });
  primaryTapDown.pointerId = 13;
  primaryTapDown.pointerType = 'touch';
  primaryTapDown.button = 0;
  primaryTapDown.clientX = 160;
  primaryTapDown.clientY = 180;
  primaryNode.dispatchEvent(primaryTapDown);
  const primaryTapUp = new Event('pointerup');
  primaryTapUp.pointerId = 13;
  primaryTapUp.pointerType = 'touch';
  primaryTapUp.clientX = 160;
  primaryTapUp.clientY = 180;
  railLayout.dispatchEvent(primaryTapUp);
  assert.equal(railLayout._drawerGesture, null);
  assert.equal(railLayout.$.drawerStartOpen, false);
  assert.equal(railLayout.$.drawerEndOpen, false);

  const linkInPrimary = document.createElement('a');
  linkInPrimary.href = '#blocked';
  linkInPrimary.textContent = 'Blocked link';
  primaryNode.append(linkInPrimary);
  const primaryLinkDown = new Event('pointerdown', { bubbles: true });
  primaryLinkDown.pointerId = 14;
  primaryLinkDown.pointerType = 'touch';
  primaryLinkDown.button = 0;
  primaryLinkDown.clientX = 180;
  primaryLinkDown.clientY = 220;
  linkInPrimary.dispatchEvent(primaryLinkDown);
  assert.equal(railLayout._drawerGesture, null);
  const primaryLinkMove = new Event('pointermove');
  primaryLinkMove.pointerId = 14;
  primaryLinkMove.pointerType = 'touch';
  primaryLinkMove.clientX = 20;
  primaryLinkMove.clientY = 225;
  primaryLinkMove.preventDefault = () => {};
  railLayout.dispatchEvent(primaryLinkMove);
  assert.equal(railLayout.$.drawerStartOpen, false);
  assert.equal(railLayout.$.drawerEndOpen, false);

  railLayout.openDrawer('start');
  railNode = railLayout.querySelector('layout-node[drawer-rail][drawer-expanded][data-drawer-dock="start"]');
  const canvasInDrawer = document.createElement('canvas');
  railNode.append(canvasInDrawer);
  const drawerCanvasDown = new Event('pointerdown', { bubbles: true });
  drawerCanvasDown.pointerId = 15;
  drawerCanvasDown.pointerType = 'touch';
  drawerCanvasDown.button = 0;
  drawerCanvasDown.clientX = 120;
  drawerCanvasDown.clientY = 220;
  canvasInDrawer.dispatchEvent(drawerCanvasDown);
  assert.equal(railLayout._drawerGesture, null);
  assert.equal(railLayout.$.drawerStartOpen, true);

  railLayout.closeDrawer('start');
  primaryNode = railLayout.querySelector('layout-node[drawer-primary]');
  const primaryCancelDown = new Event('pointerdown', { bubbles: true });
  primaryCancelDown.pointerId = 16;
  primaryCancelDown.pointerType = 'touch';
  primaryCancelDown.button = 0;
  primaryCancelDown.clientX = 120;
  primaryCancelDown.clientY = 240;
  primaryNode.dispatchEvent(primaryCancelDown);
  const primaryCancelMove = new Event('pointermove');
  primaryCancelMove.pointerId = 16;
  primaryCancelMove.pointerType = 'touch';
  primaryCancelMove.clientX = 260;
  primaryCancelMove.clientY = 246;
  primaryCancelMove.preventDefault = () => {};
  railLayout.dispatchEvent(primaryCancelMove);
  assert.ok(railLayout._drawerGesture);
  const primaryCancel = new Event('pointercancel');
  primaryCancel.pointerId = 16;
  primaryCancel.pointerType = 'touch';
  railLayout.dispatchEvent(primaryCancel);
  assert.equal(railLayout._drawerGesture, null);
  assert.equal(railLayout.$.drawerStartOpen, false);
  assert.equal(railLayout.$.drawerEndOpen, false);

  layout.remove();
  railLayout.remove();
});
