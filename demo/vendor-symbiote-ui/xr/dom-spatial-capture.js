/**
 * @file xr/dom-spatial-capture.js
 * @description Browser-only DOM/CSSOM measurement adapters that capture a bounded,
 * explicitly opted-in Symbiote subtree into a renderer-neutral `spatial-snapshot-v1`.
 * The module is evaluation-safe in Node: every DOM touch happens inside functions.
 * Not a generic DOM converter — only registered adapters, explicit text selectors,
 * and explicit surface selectors are captured; everything else becomes structured
 * diagnostics.
 * @module symbiote-ui/xr/dom-spatial-capture
 */

import { SPATIAL_ICON_NAME_PATTERN, normalizeSpatialSnapshot } from './spatial-snapshot.js';

export const SPATIAL_CAPTURE_COMPONENTS = Object.freeze(['layout-node', 'sn-tree-panel', 'source-editor']);

export const SPATIAL_ICON_SELECTOR = '.material-symbols-outlined, .sn-tree-icon, .sn-tree-toggle';

export const SPATIAL_BORDER_MAX_WIDTH_PX = 2;

export const SPATIAL_TREE_CONTROLS = Object.freeze([
  Object.freeze({ selector: '.sn-tree-panel-collapse', actionId: 'collapse-all', intent: 'sn-tree-panel-collapse' }),
]);

const UNSUPPORTED_TAG_FEATURES = Object.freeze({
  canvas: 'canvas',
  svg: 'svg',
  video: 'media',
  iframe: 'iframe',
  img: 'media',
});

const SURFACE_STYLE_KEYS = Object.freeze(['background-color']);
const CONTROL_STYLE_KEYS = Object.freeze(['background-color', 'color']);
const BADGE_STYLE_KEYS = Object.freeze(['background-color', 'color', 'font-size', 'font-weight', 'line-height']);
const FIELD_STYLE_KEYS = Object.freeze(['background-color', 'color', 'font-family', 'font-size', 'line-height']);
const BORDER_SIDES = Object.freeze(['top', 'right', 'bottom', 'left']);
const TEXT_STYLE_KEYS = Object.freeze([
  'color',
  'font-family',
  'font-size',
  'font-weight',
  'font-style',
  'line-height',
  'letter-spacing',
  'text-align',
  'direction',
  'white-space',
  'overflow',
  'text-overflow',
]);
const ICON_STYLE_KEYS = Object.freeze(['color', 'font-family', 'font-size', 'font-weight', 'font-style']);
const COLOR_STYLE_KEYS = Object.freeze(['background-color', 'color']);
const CANVAS_COLOR_SENTINELS = Object.freeze(['#010203', '#040506']);

/**
 * Creates a browser-native color normalizer that converts any browser-resolved CSS
 * color (including CSS Color 4 forms such as `oklch()`, `lab()`, or `color(...)`) into
 * a renderer-consumable `rgb()`/`rgba()` string. Conversion rasterizes a 1x1 Canvas 2D
 * tile in the default sRGB color space and reads the unpremultiplied pixels back, so
 * no custom CSS color parser is involved and alpha survives to 8-bit precision.
 * Values already in `rgb()`/`rgba()`/hex form pass through untouched. The factory is
 * evaluation-safe in Node: the canvas is created lazily inside the returned closure,
 * and without a usable document/2D context unconvertible values report `null`.
 *
 * @param {Document} doc - Document that owns the measured subtree.
 * @returns {(value: *) => (string|null)} Normalizer; `null` marks unconvertible input.
 */
export function createCanvasColorNormalizer(doc) {
  let context = null;
  let contextFailed = false;
  function resolveContext() {
    if (context || contextFailed) return context;
    let canvas = typeof doc?.createElement === 'function' ? doc.createElement('canvas') : null;
    if (canvas) {
      canvas.width = 1;
      canvas.height = 1;
      context = canvas.getContext?.('2d', { willReadFrequently: true }) || null;
    }
    contextFailed = !context;
    return context;
  }
  return (value) => {
    if (typeof value !== 'string') return null;
    let trimmed = value.trim();
    if (!trimmed) return null;
    if (/^(#|rgba?\()/i.test(trimmed)) return trimmed;
    let ctx2d = resolveContext();
    if (!ctx2d) return null;
    let parsed = false;
    for (let sentinel of CANVAS_COLOR_SENTINELS) {
      ctx2d.fillStyle = sentinel;
      ctx2d.fillStyle = trimmed;
      if (ctx2d.fillStyle !== sentinel) {
        parsed = true;
        break;
      }
    }
    if (!parsed) return null;
    ctx2d.clearRect(0, 0, 1, 1);
    ctx2d.fillRect(0, 0, 1, 1);
    let [r, g, b, a] = ctx2d.getImageData(0, 0, 1, 1).data;
    if (a === 255) return `rgb(${r}, ${g}, ${b})`;
    return `rgba(${r}, ${g}, ${b}, ${Math.round((a / 255) * 1000) / 1000})`;
  };
}

function isElement(value) {
  return Boolean(value) && typeof value === 'object' && typeof value.tagName === 'string'
    && typeof value.getBoundingClientRect === 'function';
}

function createCaptureContext(root, options) {
  let rootRect = root.getBoundingClientRect();
  return {
    doc: root.ownerDocument,
    rootRect,
    viewport: {
      width: rootRect.width,
      height: rootRect.height,
    },
    route: options.route,
    themeScope: options.themeScope,
    textSelectors: Array.isArray(options.textSelectors) ? [...options.textSelectors] : [],
    surfaceSelectors: Array.isArray(options.surfaceSelectors) ? [...options.surfaceSelectors] : [],
    surfaceTextDepth: 0,
    colorNormalizer: createCanvasColorNormalizer(root.ownerDocument),
    nodes: [],
    unsupported: [],
    unknownVisible: [],
    counters: new Map(),
    iconIds: new Set(),
    capturedIconElements: new Set(),
  };
}

function nextSequence(ctx, prefix) {
  let value = (ctx.counters.get(prefix) || 0) + 1;
  ctx.counters.set(prefix, value);
  return value;
}

function measureRect(ctx, element) {
  let rect = element.getBoundingClientRect();
  let width = rect.width;
  let height = rect.height;
  if (!(width > 0) || !(height > 0)) return null;
  return {
    x: rect.left - ctx.rootRect.left,
    y: rect.top - ctx.rootRect.top,
    width,
    height,
  };
}

function computedStyleOf(ctx, element) {
  let view = ctx.doc?.defaultView;
  return typeof view?.getComputedStyle === 'function' ? view.getComputedStyle(element) : null;
}

function readStyle(ctx, element, keys) {
  let computed = computedStyleOf(ctx, element);
  if (!computed) return undefined;
  let style = {};
  for (let key of keys) {
    let value = computed.getPropertyValue(key).trim();
    if (!value) continue;
    if (COLOR_STYLE_KEYS.includes(key)) {
      let normalized = ctx.colorNormalizer(value);
      if (normalized === null) {
        addUnsupported(ctx, 'unconvertible-color', element,
          `${key} "${value}" could not be converted to rgb()/rgba()`);
        continue;
      }
      value = normalized;
    }
    style[key] = value;
  }
  return Object.keys(style).length ? style : undefined;
}

function withStyle(node, style) {
  if (style !== undefined) node.style = style;
  return node;
}

function readUniformSolidBorder(ctx, element, nodeId) {
  let computed = computedStyleOf(ctx, element);
  if (!computed) return undefined;
  let widths = [];
  let styles = [];
  let colors = [];
  for (let side of BORDER_SIDES) {
    widths.push(computed.getPropertyValue(`border-${side}-width`).trim());
    styles.push(computed.getPropertyValue(`border-${side}-style`).trim());
    colors.push(computed.getPropertyValue(`border-${side}-color`).trim());
  }
  let parsed = widths.map((value) => Number.parseFloat(value));
  let maxWidth = Math.max(...parsed.map((value) => (Number.isFinite(value) ? value : 0)));
  if (!(maxWidth > 0)) return undefined;
  let uniform = parsed.every((value) => Number.isFinite(value) && value === parsed[0])
    && styles.every((value) => value === 'solid')
    && colors.every((value) => value && value === colors[0])
    && parsed[0] <= SPATIAL_BORDER_MAX_WIDTH_PX;
  if (!uniform) {
    ctx.unsupported.push({
      feature: 'partial-border',
      ...(nodeId ? { nodeId } : {}),
      detail: 'partial-side, non-solid, or over-threshold borders are not reproduced natively',
    });
    return undefined;
  }
  let normalized = ctx.colorNormalizer(colors[0]);
  if (normalized === null) {
    addUnsupported(ctx, 'unconvertible-color', element,
      `border-color "${colors[0]}" could not be converted to rgb()/rgba()`);
    return undefined;
  }
  return {
    'border-width': `${parsed[0]}px`,
    'border-style': 'solid',
    'border-color': normalized,
  };
}

function readChromeStyle(ctx, element, nodeId, keys = SURFACE_STYLE_KEYS) {
  let style = readStyle(ctx, element, keys) || {};
  let border = readUniformSolidBorder(ctx, element, nodeId);
  if (border) style = { ...style, ...border };
  return Object.keys(style).length ? style : undefined;
}

function addNode(ctx, node) {
  ctx.nodes.push(node);
  return node;
}

function addUnsupported(ctx, feature, element, detail) {
  ctx.unsupported.push({
    feature,
    ...(element?.id || element?.dataset?.panelId || element?.dataset?.treeId
      ? { nodeId: element.id || element.dataset.panelId || element.dataset.treeId }
      : {}),
    ...(detail ? { detail } : {}),
  });
}

function signatureOf(element) {
  let tag = element.tagName.toLowerCase();
  let className = typeof element.className === 'string' && element.className.trim()
    ? `.${element.className.trim().split(/\s+/)[0]}`
    : '';
  return `${tag}${className}`;
}

function recordUnknownVisible(ctx, element, detail) {
  ctx.unknownVisible.push({
    signature: signatureOf(element),
    ...(detail ? { detail } : {}),
  });
}

function hasOwnVisibleChrome(ctx, element) {
  let computed = computedStyleOf(ctx, element);
  if (!computed) return false;
  let background = computed.getPropertyValue('background-color').trim();
  if (background && background !== 'transparent' && background !== 'rgba(0, 0, 0, 0)') return true;
  let borderWidth = Number.parseFloat(computed.getPropertyValue('border-top-width'));
  return Number.isFinite(borderWidth) && borderWidth > 0;
}

function directTextOf(element) {
  let text = '';
  for (let child of element.childNodes) {
    if (child.nodeType === 3) text += child.textContent;
  }
  return text.trim();
}

function checkMotionDiagnostics(ctx, element) {
  let computed = computedStyleOf(ctx, element);
  if (!computed) return;
  let animation = computed.getPropertyValue('animation-name').trim();
  if (animation && animation !== 'none') {
    addUnsupported(ctx, 'animations/transitions', element, `animation "${animation}" is not reproduced`);
  }
}

function checkScrollDiagnostics(ctx, element, nodeId) {
  if (element.scrollHeight > element.clientHeight + 1 || element.scrollWidth > element.clientWidth + 1) {
    ctx.unsupported.push({
      feature: 'native-scrollbars',
      nodeId,
      detail: 'scrollable region; scroll position and native scrollbars are not reproduced',
    });
  }
}

function matchesSelectorList(selectors, element) {
  return selectors.some((selector) => {
    try {
      return element.matches(selector);
    } catch {
      return false;
    }
  });
}

function matchesIconSelector(element) {
  try {
    return typeof element.matches === 'function' && element.matches(SPATIAL_ICON_SELECTOR);
  } catch {
    return false;
  }
}

function textExcludingIcons(element) {
  let text = '';
  for (let child of element.childNodes || []) {
    if (child.nodeType === 3) {
      text += child.textContent;
      continue;
    }
    if (child.nodeType !== 1 || matchesIconSelector(child)) continue;
    text += textExcludingIcons(child);
  }
  return text.replace(/\s+/g, ' ').trim();
}

function uniqueChildId(ctx, parentId, key) {
  let base = `${parentId}/${key}`;
  let id = base;
  let suffix = 2;
  while (ctx.iconIds.has(id)) {
    id = `${base}:${suffix}`;
    suffix += 1;
  }
  ctx.iconIds.add(id);
  return id;
}

function iconNodeId(ctx, parentId, name) {
  return uniqueChildId(ctx, parentId, `icon:${name}`);
}

function captureIconElement(ctx, element, parentId, component) {
  if (ctx.capturedIconElements.has(element)) return;
  let rect = measureRect(ctx, element);
  let name = String(element.textContent || '').trim();
  if (!rect) return;
  if (!SPATIAL_ICON_NAME_PATTERN.test(name)) {
    addUnsupported(ctx, 'icon-glyph', element, `icon glyph "${name}" is not a Material Symbols ligature name`);
    return;
  }
  ctx.capturedIconElements.add(element);
  addNode(ctx, withStyle({
    id: iconNodeId(ctx, parentId, name),
    parentId,
    component,
    part: 'icon',
    rect,
    icon: { name },
  }, readStyle(ctx, element, ICON_STYLE_KEYS)));
}

function captureIconDescendants(ctx, container, parentId, component) {
  if (typeof container.querySelectorAll !== 'function') return;
  for (let icon of container.querySelectorAll(SPATIAL_ICON_SELECTOR)) {
    captureIconElement(ctx, icon, parentId, component);
  }
}

function captureTextElement(ctx, element, parentId) {
  let rect = measureRect(ctx, element);
  let text = textExcludingIcons(element);
  let textId = null;
  if (rect && text) {
    textId = `${parentId}/text:${nextSequence(ctx, `${parentId}/text`)}`;
    addNode(ctx, withStyle({
      id: textId,
      parentId,
      component: 'text',
      part: 'text',
      rect,
      text,
    }, readStyle(ctx, element, TEXT_STYLE_KEYS)));
  }
  captureIconDescendants(ctx, element, textId || parentId, 'icon');
}

function walkChildren(ctx, element, parentId) {
  for (let child of element.children) {
    walkElement(ctx, child, parentId);
  }
}

function captureSurfaceElement(ctx, element, parentId) {
  let rect = measureRect(ctx, element);
  if (!rect) return;
  checkMotionDiagnostics(ctx, element);
  let surfaceId = `${parentId}/surface:${nextSequence(ctx, `${parentId}/surface`)}`;
  addNode(ctx, withStyle({
    id: surfaceId,
    parentId,
    component: 'surface',
    part: 'surface',
    rect,
  }, readChromeStyle(ctx, element, surfaceId)));
  ctx.surfaceTextDepth += 1;
  walkChildren(ctx, element, surfaceId);
  ctx.surfaceTextDepth -= 1;
}

function walkElement(ctx, element, parentId) {
  let tag = element.tagName.toLowerCase();
  if (UNSUPPORTED_TAG_FEATURES[tag]) {
    addUnsupported(ctx, UNSUPPORTED_TAG_FEATURES[tag], element, `<${tag}> is not reproduced natively`);
    return;
  }
  let adapter = SPATIAL_CAPTURE_ADAPTERS[tag];
  if (adapter) {
    adapter.capture(element, ctx, parentId);
    return;
  }
  if (matchesIconSelector(element)) {
    captureIconElement(ctx, element, parentId, 'icon');
    return;
  }
  if (ctx.surfaceSelectors.length && matchesSelectorList(ctx.surfaceSelectors, element)) {
    captureSurfaceElement(ctx, element, parentId);
    return;
  }
  if (ctx.textSelectors.length && matchesSelectorList(ctx.textSelectors, element)) {
    captureTextElement(ctx, element, parentId);
    return;
  }
  checkMotionDiagnostics(ctx, element);
  if (!measureRect(ctx, element)) return;
  let hasChildren = element.children.length > 0;
  if (ctx.surfaceTextDepth > 0 && directTextOf(element)) {
    captureTextElement(ctx, element, parentId);
    return;
  }
  if (hasOwnVisibleChrome(ctx, element) || (!hasChildren && directTextOf(element))) {
    recordUnknownVisible(ctx, element, directTextOf(element).slice(0, 60) || undefined);
  }
  walkChildren(ctx, element, parentId);
}

function captureLayoutNode(element, ctx, parentId) {
  let nodeType = element.getAttribute('node-type');
  if (nodeType === 'split') {
    let splitView = element.querySelector(':scope > .split-view');
    if (!splitView) return;
    let direction = element.getAttribute('direction') || 'horizontal';
    let resizer = splitView.querySelector(':scope > .split-resizer');
    if (resizer) {
      let rect = measureRect(ctx, resizer);
      if (rect) {
        let id = `split:${direction}/resizer:${nextSequence(ctx, `resizer:${direction}`)}`;
        addNode(ctx, withStyle({
          id,
          parentId,
          component: 'layout-node',
          part: 'resizer',
          rect,
          state: { direction },
          actions: [{ id: 'drag-resizer', targetId: id, intent: 'layout-resize' }],
        }, readChromeStyle(ctx, resizer, id)));
      }
    }
    walkChildren(ctx, splitView, parentId);
    return;
  }
  if (nodeType !== 'panel') {
    walkChildren(ctx, element, parentId);
    return;
  }
  let panelComponent = element.querySelector(':scope > .panel-view > .panel-content > [data-panel-id]');
  let panelKey = panelComponent?.dataset?.panelId
    || panelComponent?.tagName?.toLowerCase()
    || `anonymous-${nextSequence(ctx, 'panel')}`;
  let panelId = `panel:${panelKey}`;
  let rect = measureRect(ctx, element);
  if (!rect) return;
  let collapsed = element.hasAttribute('collapsed') || element.hasAttribute('auto-collapsed');
  addNode(ctx, withStyle({
    id: panelId,
    parentId,
    component: 'layout-node',
    part: 'panel',
    rect,
    state: { collapsed },
  }, readChromeStyle(ctx, element, panelId)));

  let header = element.querySelector(':scope > .panel-view > .panel-header');
  if (header) {
    let headerRect = measureRect(ctx, header);
    if (headerRect) {
      addNode(ctx, withStyle({
        id: `${panelId}/header`,
        parentId: panelId,
        component: 'layout-node',
        part: 'header',
        rect: headerRect,
      }, readChromeStyle(ctx, header, `${panelId}/header`)));
    }
    let title = header.querySelector('.panel-title');
    if (title) {
      let titleRect = measureRect(ctx, title);
      let text = textExcludingIcons(title);
      if (titleRect && text) {
        addNode(ctx, withStyle({
          id: `${panelId}/title`,
          parentId: panelId,
          component: 'layout-node',
          part: 'title',
          rect: titleRect,
          text,
        }, readStyle(ctx, title, TEXT_STYLE_KEYS)));
      }
    }
    captureHeaderButtons(ctx, header, panelId);
  }
  if (collapsed) return;
  let content = element.querySelector(':scope > .panel-view > .panel-content');
  if (content) walkChildren(ctx, content, panelId);
}

export const SPATIAL_HEADER_CONTROLS = Object.freeze([
  Object.freeze({ selector: '.collapse-btn', actionId: 'toggle-collapse', intent: 'panel-collapse-toggle' }),
  Object.freeze({ selector: '.fullscreen-btn', actionId: 'toggle-fullscreen', intent: 'panel-fullscreen' }),
  Object.freeze({ selector: '.panel-menu-toggle', actionId: 'open-panel-menu', intent: 'panel-menu' }),
  Object.freeze({ selector: '.type-btn', actionId: 'open-type-menu', intent: 'panel-type-menu' }),
]);

/**
 * Resolves the live DOM header control selector for a captured header intent, so
 * native activation relays to the exact button the intent was captured from.
 *
 * @param {string} intent - Captured action intent.
 * @returns {string} DOM selector of the matching header control.
 */
export function resolveHeaderControlSelector(intent) {
  let control = SPATIAL_HEADER_CONTROLS.find((entry) => entry.intent === intent);
  if (!control) {
    throw new Error(
      `Unknown header control intent "${intent}". ` +
      `Supported: ${SPATIAL_HEADER_CONTROLS.map((entry) => entry.intent).join(', ')}.`,
    );
  }
  return control.selector;
}

function captureHeaderButtons(ctx, header, panelId) {
  for (let { selector, actionId, intent } of SPATIAL_HEADER_CONTROLS) {
    let button = header.querySelector(selector);
    if (!button) continue;
    let rect = measureRect(ctx, button);
    if (!rect) continue;
    let controlId = `${panelId}/control:${actionId}`;
    addNode(ctx, withStyle({
      id: controlId,
      parentId: panelId,
      component: 'layout-node',
      part: 'control',
      rect,
      actions: [{ id: actionId, targetId: panelId, intent }],
    }, readChromeStyle(ctx, button, controlId, CONTROL_STYLE_KEYS)));
    captureIconDescendants(ctx, button, controlId, 'layout-node');
  }
}

function captureChromeRow(ctx, element, parentId, id) {
  let rect = measureRect(ctx, element);
  if (!rect) return;
  addNode(ctx, withStyle({
    id: `${parentId}/${id}`,
    parentId,
    component: 'sn-tree-panel',
    part: 'surface',
    rect,
  }, readChromeStyle(ctx, element, `${parentId}/${id}`)));
}

function captureTreePanel(element, ctx, parentId) {
  let hostRect = measureRect(ctx, element);
  if (hostRect) {
    addNode(ctx, withStyle({
      id: `${parentId}/tree-host`,
      parentId,
      component: 'sn-tree-panel',
      part: 'surface',
      rect: hostRect,
    }, readChromeStyle(ctx, element, `${parentId}/tree-host`)));
  }
  let titleRow = element.querySelector('.sn-tree-panel-title');
  if (titleRow && !titleRow.hidden) {
    captureChromeRow(ctx, titleRow, parentId, 'tree-title-row');
    let rect = measureRect(ctx, titleRow);
    let text = textExcludingIcons(titleRow);
    if (rect && text) {
      let titleId = `${parentId}/tree-title`;
      addNode(ctx, withStyle({
        id: titleId,
        parentId,
        component: 'sn-tree-panel',
        part: 'title',
        rect,
        text,
      }, readStyle(ctx, titleRow, TEXT_STYLE_KEYS)));
      captureIconDescendants(ctx, titleRow, titleId, 'sn-tree-panel');
    }
  }
  let toolbar = element.querySelector('.sn-tree-panel-toolbar');
  if (toolbar) {
    captureChromeRow(ctx, toolbar, parentId, 'tree-toolbar');
    for (let { selector, actionId, intent } of SPATIAL_TREE_CONTROLS) {
      let button = toolbar.querySelector(selector);
      if (!button) continue;
      let rect = measureRect(ctx, button);
      if (!rect) continue;
      let controlId = `${parentId}/control:${actionId}`;
      addNode(ctx, withStyle({
        id: controlId,
        parentId,
        component: 'sn-tree-panel',
        part: 'control',
        rect,
        actions: [{ id: actionId, targetId: parentId, intent }],
      }, readChromeStyle(ctx, button, controlId, CONTROL_STYLE_KEYS)));
      captureIconDescendants(ctx, button, controlId, 'sn-tree-panel');
    }
    captureIconDescendants(ctx, toolbar, parentId, 'sn-tree-panel');
  }
  let filter = element.querySelector('.sn-tree-panel-filter');
  if (filter && measureRect(ctx, filter)) {
    let fieldId = `${parentId}/field:filter`;
    let proxyText = String(filter.value || '') || String(filter.placeholder || '');
    addNode(ctx, withStyle({
      id: fieldId,
      parentId,
      component: 'sn-tree-panel',
      part: 'field',
      rect: measureRect(ctx, filter),
      ...(proxyText ? { text: proxyText } : {}),
    }, readChromeStyle(ctx, filter, fieldId, FIELD_STYLE_KEYS)));
    ctx.unsupported.push({
      feature: 'text-input',
      nodeId: `${parentId}/filter`,
      detail: 'tree filter input; IME/editing is not reproduced natively',
    });
  }
  let rows = element.querySelectorAll('.sn-tree-row');
  for (let row of rows) {
    captureTreeRow(ctx, row, parentId);
  }
}

function captureTreeRow(ctx, row, parentId) {
  let rect = measureRect(ctx, row);
  if (!rect) return;
  let treeId = row.dataset?.treeId || `row-${nextSequence(ctx, `${parentId}/row`)}`;
  let rowId = `${parentId}/row:${treeId}`;
  addNode(ctx, withStyle({
    id: rowId,
    parentId,
    component: 'sn-tree-panel',
    part: 'row',
    rect,
    state: {
      selected: row.getAttribute('aria-selected') === 'true',
      expanded: row.getAttribute('aria-expanded') === 'true',
    },
    actions: [{ id: 'select-row', targetId: treeId, intent: 'sn-tree-select' }],
  }, readChromeStyle(ctx, row, rowId)));
  let toggle = row.querySelector('.sn-tree-toggle:not([hidden])');
  if (toggle) {
    let toggleRect = measureRect(ctx, toggle);
    if (toggleRect) {
      let controlId = `${rowId}/control:toggle-row`;
      addNode(ctx, withStyle({
        id: controlId,
        parentId: rowId,
        component: 'sn-tree-panel',
        part: 'control',
        rect: toggleRect,
        actions: [{ id: 'toggle-row', targetId: treeId, intent: 'sn-tree-toggle' }],
      }, readChromeStyle(ctx, toggle, controlId, CONTROL_STYLE_KEYS)));
      captureIconElement(ctx, toggle, controlId, 'sn-tree-panel');
    }
  }
  let rowIcon = row.querySelector('.sn-tree-icon');
  if (rowIcon && !rowIcon.hidden) {
    captureIconElement(ctx, rowIcon, rowId, 'sn-tree-panel');
  }
  let label = row.querySelector('.sn-tree-label');
  if (label) {
    let labelRect = measureRect(ctx, label);
    let text = textExcludingIcons(label);
    if (labelRect && text) {
      addNode(ctx, withStyle({
        id: `${rowId}/label`,
        parentId: rowId,
        component: 'sn-tree-panel',
        part: 'row-label',
        rect: labelRect,
        text,
      }, readStyle(ctx, label, TEXT_STYLE_KEYS)));
    }
  }
  if (typeof row.querySelectorAll === 'function') {
    for (let badge of row.querySelectorAll('.sn-tree-badge')) {
      let badgeRect = measureRect(ctx, badge);
      let text = String(badge.textContent || '').trim();
      if (!badgeRect || !text) continue;
      let badgeId = uniqueChildId(ctx, rowId, `badge:${text}`);
      addNode(ctx, withStyle({
        id: badgeId,
        parentId: rowId,
        component: 'sn-tree-panel',
        part: 'badge',
        rect: badgeRect,
        text,
      }, readChromeStyle(ctx, badge, badgeId, BADGE_STYLE_KEYS)));
    }
  }
}

function captureSourceEditor(element, ctx, parentId) {
  let textarea = element.querySelector('textarea');
  if (!textarea) return;
  let rect = measureRect(ctx, textarea);
  if (!rect) return;
  let editorId = `${parentId}/editor`;
  addNode(ctx, withStyle({
    id: editorId,
    parentId,
    component: 'source-editor',
    part: 'editor',
    rect,
    text: textarea.value,
    state: {
      language: element.getAttribute('data-language') || '',
      readOnly: textarea.readOnly,
    },
  }, readChromeStyle(ctx, textarea, editorId, [...TEXT_STYLE_KEYS, ...SURFACE_STYLE_KEYS])));
  ctx.unsupported.push({
    feature: 'ime-editing',
    nodeId: editorId,
    detail: 'caret, selection, and IME editing stay in the live DOM editor',
  });
  checkScrollDiagnostics(ctx, textarea, editorId);
}

const SPATIAL_CAPTURE_ADAPTERS = Object.freeze({
  'layout-node': Object.freeze({ capture: captureLayoutNode }),
  'sn-tree-panel': Object.freeze({ capture: captureTreePanel }),
  'source-editor': Object.freeze({ capture: captureSourceEditor }),
});

/**
 * Resolves the capture adapter registered for a custom element tag.
 *
 * @param {string} component - Custom element tag name.
 * @returns {{capture: Function}} Capture adapter.
 */
export function resolveSpatialAdapter(component) {
  let adapter = SPATIAL_CAPTURE_ADAPTERS[component];
  if (!adapter) {
    throw new Error(
      `Unknown spatial capture adapter "${component}". Supported: ${SPATIAL_CAPTURE_COMPONENTS.join(', ')}.`,
    );
  }
  return adapter;
}

function resolveCaptureRoot(root) {
  if (!isElement(root)) {
    throw new Error(
      'captureSpatialSnapshot requires a root element (the panel-layout element or an ancestor containing one).',
    );
  }
  if (root.tagName.toLowerCase() === 'panel-layout') return root;
  let nested = typeof root.querySelector === 'function' ? root.querySelector('panel-layout') : null;
  if (!nested) {
    throw new Error('captureSpatialSnapshot found no <panel-layout> subtree under the given root element.');
  }
  return nested;
}

/**
 * Captures the bounded `panel-layout` subtree under the given root into a normalized
 * `spatial-snapshot-v1` snapshot. Call only after custom elements, fonts, and two
 * animation frames have settled; settling is the caller's responsibility.
 *
 * @param {Element} root - `panel-layout` element or an ancestor containing one.
 * @param {Object} [options]
 * @param {string} [options.route] - Source route recorded in capture provenance.
 * @param {string} [options.themeScope] - Theme scope label.
 * @param {Array<string>} [options.textSelectors] - Extra explicit structural text selectors.
 * @param {Array<string>} [options.surfaceSelectors] - Explicit structural surface selectors;
 *   matched elements become `surface` nodes and their child text/icons stay captured.
 * @returns {Object} Normalized `spatial-snapshot-v1` snapshot.
 */
export function captureSpatialSnapshot(root, options = {}) {
  let captureRoot = resolveCaptureRoot(root);
  let ctx = createCaptureContext(captureRoot, options);
  walkChildren(ctx, captureRoot, null);
  return createSpatialSnapshot(ctx);
}

function createSpatialSnapshot(ctx) {
  return normalizeSpatialSnapshot({
    version: 'spatial-snapshot-v1',
    unit: 'css-pixel',
    coordinateSpace: 'capture-root-relative',
    capture: {
      viewport: ctx.viewport,
      ...(ctx.route !== undefined ? { route: ctx.route } : {}),
      ...(ctx.themeScope !== undefined ? { themeScope: ctx.themeScope } : {}),
    },
    nodes: ctx.nodes,
    diagnostics: {
      unsupported: ctx.unsupported,
      unknownVisible: ctx.unknownVisible,
    },
  });
}

/**
 * Captures one rendered leaf layout window using the window itself as the
 * root-relative CSS viewport.
 *
 * @param {Element} panel - Leaf `layout-node[node-type="panel"]`.
 * @param {Object} [options] - Same capture provenance and selector options as
 *   `captureSpatialSnapshot`.
 * @returns {Object} Normalized one-window `spatial-snapshot-v1`.
 */
export function captureSpatialWindowSnapshot(panel, options = {}) {
  if (!isElement(panel)
    || panel.tagName.toLowerCase() !== 'layout-node'
    || panel.getAttribute('node-type') !== 'panel') {
    throw new Error(
      'captureSpatialWindowSnapshot requires a leaf layout-node[node-type="panel"].',
    );
  }
  let ctx = createCaptureContext(panel, options);
  captureLayoutNode(panel, ctx, null);
  return createSpatialSnapshot(ctx);
}
