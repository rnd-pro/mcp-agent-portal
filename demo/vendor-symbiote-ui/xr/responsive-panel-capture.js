/**
 * @file xr/responsive-panel-capture.js
 * @description Browser-only responsive recapture host for one rendered layout window.
 * Pure resize-context helpers remain evaluation-safe in Node.
 * @module symbiote-ui/xr/responsive-panel-capture
 */

import { captureSpatialWindowSnapshot } from './dom-spatial-capture.js';

export const RESPONSIVE_PANEL_RESIZE_VERSION = 'responsive-panel-resize-v1';

const ROUNDING_PRECISION = 1_000_000;

function roundMetric(value) {
  return Math.round(value * ROUNDING_PRECISION) / ROUNDING_PRECISION;
}

function requirePair(value, name) {
  if (!Array.isArray(value) || value.length !== 2) {
    throw new Error(`${name} requires [width, height], got ${JSON.stringify(value)}.`);
  }
  let pair = value.map(Number);
  if (!pair.every((entry) => Number.isFinite(entry) && entry > 0)) {
    throw new Error(`${name} requires positive finite width and height, got ${JSON.stringify(value)}.`);
  }
  return pair.map(roundMetric);
}

function requireRevision(value, name) {
  let revision = Number(value);
  if (!Number.isInteger(revision) || revision < 0) {
    throw new Error(`${name} requires a non-negative integer, got ${JSON.stringify(value)}.`);
  }
  return revision;
}

function freezeDeep(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (let entry of Object.values(value)) freezeDeep(entry);
  return Object.freeze(value);
}

function cloneSerializable(value, name) {
  if (value === undefined) return undefined;
  try {
    let clone = typeof structuredClone === 'function'
      ? structuredClone(value)
      : JSON.parse(JSON.stringify(value));
    return freezeDeep(clone);
  } catch {
    throw new Error(`${name} must be structured-clone serializable.`);
  }
}

function isLeafLayoutPanel(value) {
  return value?.tagName?.toLowerCase() === 'layout-node'
    && value.getAttribute?.('node-type') === 'panel';
}

function nextFrame(win) {
  return new Promise((resolve) => win.requestAnimationFrame(resolve));
}

async function settleDocument(doc) {
  await doc.fonts?.ready;
  await nextFrame(doc.defaultView);
  await nextFrame(doc.defaultView);
}

/**
 * @param {Array<number>} sizeMeters
 * @param {number} metersPerCssPixel
 * @returns {Array<number>}
 */
export function resolveResponsivePanelCssSize(sizeMeters, metersPerCssPixel) {
  let size = requirePair(sizeMeters, 'resolveResponsivePanelCssSize');
  let scale = Number(metersPerCssPixel);
  if (!Number.isFinite(scale) || scale <= 0) {
    throw new Error(
      'resolveResponsivePanelCssSize requires metersPerCssPixel to be a positive finite number.',
    );
  }
  return size.map((value) => roundMetric(value / scale));
}

/**
 * @param {Object} options
 * @returns {Object}
 */
export function createResponsivePanelResizeContext(options) {
  let panelId = String(options?.panelId || '');
  let layoutId = String(options?.layoutId || '');
  if (!panelId || !layoutId) {
    throw new Error('createResponsivePanelResizeContext requires panelId and layoutId.');
  }
  let metersPerCssPixel = Number(options.metersPerCssPixel);
  let sourceCssSize = requirePair(options.sourceCssSize, 'createResponsivePanelResizeContext sourceCssSize');
  let sourceSizeMeters = requirePair(
    options.sourceSizeMeters,
    'createResponsivePanelResizeContext sourceSizeMeters',
  );
  if (!Number.isFinite(metersPerCssPixel) || metersPerCssPixel <= 0) {
    throw new Error(
      'createResponsivePanelResizeContext requires metersPerCssPixel to be a positive finite number.',
    );
  }
  return freezeDeep({
    version: RESPONSIVE_PANEL_RESIZE_VERSION,
    panelId,
    layoutId,
    sourceSnapshot: cloneSerializable(
      options.sourceSnapshot,
      'createResponsivePanelResizeContext sourceSnapshot',
    ),
    sourceCssSize,
    targetCssSize: [...sourceCssSize],
    sourceSizeMeters,
    targetSizeMeters: [...sourceSizeMeters],
    metersPerCssPixel: roundMetric(metersPerCssPixel),
    themeRevision: requireRevision(options.themeRevision, 'createResponsivePanelResizeContext themeRevision'),
    dataRevision: requireRevision(options.dataRevision, 'createResponsivePanelResizeContext dataRevision'),
    componentState: cloneSerializable(
      options.componentState || {},
      'createResponsivePanelResizeContext componentState',
    ),
  });
}

/**
 * @param {Object} context
 * @param {Array<number>} sizeMeters
 * @returns {Object}
 */
export function updateResponsivePanelResizeTarget(context, sizeMeters) {
  if (context?.version !== RESPONSIVE_PANEL_RESIZE_VERSION) {
    throw new Error(
      `updateResponsivePanelResizeTarget requires a ${RESPONSIVE_PANEL_RESIZE_VERSION} context.`,
    );
  }
  let targetSizeMeters = requirePair(sizeMeters, 'updateResponsivePanelResizeTarget');
  return freezeDeep({
    ...context,
    targetSizeMeters,
    targetCssSize: resolveResponsivePanelCssSize(
      targetSizeMeters,
      context.metersPerCssPixel,
    ),
  });
}

/**
 * @param {Object} context
 * @param {Object} revisions
 * @returns {boolean}
 */
export function isResponsivePanelResizeContextStale(context, revisions) {
  if (context?.version !== RESPONSIVE_PANEL_RESIZE_VERSION) return true;
  return context.themeRevision !== Number(revisions?.themeRevision)
    || context.dataRevision !== Number(revisions?.dataRevision);
}

/**
 * @param {Element} panel
 * @returns {Object}
 */
export function captureResponsivePanelComponentState(panel) {
  if (!isLeafLayoutPanel(panel)) {
    throw new Error(
      'captureResponsivePanelComponentState requires a leaf layout-node[node-type="panel"].',
    );
  }
  let descendants = [...panel.querySelectorAll('*')];
  let form = [];
  let scroll = [];
  descendants.forEach((element, index) => {
    let tag = element.tagName.toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select') {
      form.push({
        index,
        value: String(element.value ?? ''),
        ...(tag === 'input' ? { checked: Boolean(element.checked) } : {}),
        ...(tag === 'select' ? { selectedIndex: Number(element.selectedIndex) } : {}),
      });
    }
    if (element.scrollLeft || element.scrollTop) {
      scroll.push({
        index,
        left: Number(element.scrollLeft) || 0,
        top: Number(element.scrollTop) || 0,
      });
    }
  });
  return { form, scroll };
}

function applyComponentState(panel, state) {
  let descendants = [...panel.querySelectorAll('*')];
  for (let entry of state?.form || []) {
    let element = descendants[entry.index];
    if (!element) continue;
    element.value = entry.value;
    if (entry.checked !== undefined) element.checked = entry.checked;
    if (entry.selectedIndex !== undefined) element.selectedIndex = entry.selectedIndex;
  }
  for (let entry of state?.scroll || []) {
    let element = descendants[entry.index];
    if (!element) continue;
    element.scrollLeft = entry.left;
    element.scrollTop = entry.top;
  }
}

function captureDocumentAttributes(sourcePanel) {
  let sourceDoc = sourcePanel.ownerDocument;
  let attributes = [];
  for (let attr of sourceDoc.documentElement.attributes) {
    if (attr.name === 'style') continue;
    attributes.push([attr.name, attr.value]);
  }
  let customProperties = [];
  let computed = sourceDoc.defaultView.getComputedStyle(sourcePanel);
  for (let name of computed) {
    if (name.startsWith('--')) {
      customProperties.push([name, computed.getPropertyValue(name)]);
    }
  }
  return { attributes, customProperties };
}

function applyDocumentAttributes(snapshot, targetDoc) {
  for (let [name, value] of snapshot.attributes) {
    targetDoc.documentElement.setAttribute(name, value);
  }
  for (let [name, value] of snapshot.customProperties) {
    targetDoc.documentElement.style.setProperty(name, value);
  }
}

function captureLayoutAttributes(sourcePanel) {
  let sourceLayout = sourcePanel.closest('panel-layout');
  if (!sourceLayout) return [];
  let attributes = [];
  for (let attr of sourceLayout.attributes) {
    if (attr.name === 'id' || attr.name === 'style') continue;
    attributes.push([attr.name, attr.value]);
  }
  return attributes;
}

function applyLayoutAttributes(attributes, targetLayout) {
  for (let [name, value] of attributes) {
    targetLayout.setAttribute(name, value);
  }
}

function captureDocumentStyles(sourceDoc) {
  let nodes = [];
  for (let node of sourceDoc.querySelectorAll('head style, head link[rel="stylesheet"]')) {
    if (node.tagName.toLowerCase() === 'style') {
      nodes.push({ type: 'style', text: node.textContent });
    } else {
      nodes.push({ type: 'link', href: node.href });
    }
  }
  let adopted = [];
  let inaccessible = 0;
  for (let sheet of sourceDoc.adoptedStyleSheets || []) {
    try {
      adopted.push([...sheet.cssRules].map((rule) => rule.cssText).join('\n'));
    } catch {
      inaccessible += 1;
    }
  }
  return { nodes, adopted, inaccessible };
}

function appendStyleSnapshot(targetDoc, snapshot) {
  if (snapshot.type === 'style') {
    let style = targetDoc.createElement('style');
    style.textContent = snapshot.text;
    targetDoc.head.append(style);
    return null;
  }
  let link = targetDoc.createElement('link');
  link.rel = 'stylesheet';
  link.href = snapshot.href;
  let settled = new Promise((resolve, reject) => {
    link.addEventListener('load', resolve, { once: true });
    link.addEventListener('error', () => {
      reject(new Error(`Responsive panel capture could not load stylesheet "${link.href}".`));
    }, { once: true });
  });
  targetDoc.head.append(link);
  return settled;
}

async function applyDocumentStyles(snapshot, targetDoc) {
  let loads = [];
  for (let node of snapshot.nodes) {
    let load = appendStyleSnapshot(targetDoc, node);
    if (load) loads.push(load);
  }
  for (let text of snapshot.adopted) {
    let style = targetDoc.createElement('style');
    style.textContent = text;
    targetDoc.head.append(style);
  }
  await Promise.all(loads);
  return {
    linked: loads.length,
    adopted: snapshot.adopted.length,
    inaccessible: snapshot.inaccessible,
  };
}

function createCaptureFrame(sourceDoc, sourceCssSize) {
  let frame = sourceDoc.createElement('iframe');
  frame.title = 'Responsive panel CSS measurement';
  frame.setAttribute('aria-hidden', 'true');
  frame.tabIndex = -1;
  frame.style.cssText = [
    'position:fixed',
    'inset:auto auto 0 -100000px',
    `width:${sourceCssSize[0]}px`,
    `height:${sourceCssSize[1]}px`,
    'border:0',
    'clip-path:inset(100%)',
    'pointer-events:none',
    'contain:strict',
  ].join(';');
  frame.srcdoc = [
    '<!doctype html><html><head><meta charset="utf-8"></head><body>',
    '<panel-layout><div class="layout-root" id="responsive-capture-root"></div></panel-layout>',
    '</body></html>',
  ].join('');
  return frame;
}

/**
 * @param {Element} sourcePanel
 * @param {Object} [options]
 * @returns {Promise<Object>}
 */
export async function prepareResponsivePanelCaptureHost(sourcePanel, options = {}) {
  if (!isLeafLayoutPanel(sourcePanel)) {
    throw new Error(
      'prepareResponsivePanelCaptureHost requires a leaf layout-node[node-type="panel"].',
    );
  }
  let sourceDoc = sourcePanel.ownerDocument;
  let sourceRect = sourcePanel.getBoundingClientRect();
  let sourceCssSize = requirePair(
    [sourceRect.width, sourceRect.height],
    'prepareResponsivePanelCaptureHost source panel size',
  );
  let componentState = options.componentState
    || captureResponsivePanelComponentState(sourcePanel);
  let sourcePanelClone = sourcePanel.cloneNode(true);
  let documentAttributes = captureDocumentAttributes(sourcePanel);
  let layoutAttributes = captureLayoutAttributes(sourcePanel);
  let stylesheetSnapshot = captureDocumentStyles(sourceDoc);
  let frame = createCaptureFrame(sourceDoc, sourceCssSize);
  let loaded = new Promise((resolve, reject) => {
    frame.addEventListener('load', resolve, { once: true });
    frame.addEventListener('error', () => {
      reject(new Error('Responsive panel capture iframe failed to initialize.'));
    }, { once: true });
  });
  try {
    sourceDoc.body.append(frame);
    await loaded;
    let targetDoc = frame.contentDocument;
    if (!targetDoc) {
      throw new Error('Responsive panel capture iframe is not same-origin readable.');
    }
    applyDocumentAttributes(documentAttributes, targetDoc);
    let stylesheetReport = await applyDocumentStyles(stylesheetSnapshot, targetDoc);
    let targetLayout = targetDoc.querySelector('panel-layout');
    let targetRoot = targetDoc.getElementById('responsive-capture-root');
    applyLayoutAttributes(layoutAttributes, targetLayout);
    targetDoc.documentElement.style.cssText += ';width:100%;height:100%;overflow:hidden;';
    targetDoc.body.style.cssText = 'margin:0;width:100%;height:100%;overflow:hidden;';
    targetLayout.style.cssText = 'display:block;width:100%;height:100%;overflow:hidden;';
    targetRoot.style.cssText = [
      'position:relative',
      'display:block',
      'box-sizing:border-box',
      'width:100%',
      'height:100%',
      'padding:0',
      'overflow:hidden',
    ].join(';');
    let targetPanel = targetDoc.importNode(sourcePanelClone, true);
    targetPanel.style.cssText += [
      ';position:absolute',
      'inset:0',
      'display:block',
      'width:100%',
      'height:100%',
      'min-width:0',
      'min-height:0',
      'max-width:none',
      'max-height:none',
      'flex:none',
    ].join(';');
    targetRoot.append(targetPanel);
    applyComponentState(targetPanel, componentState);
    await settleDocument(targetDoc);
    let disposed = false;
    return {
      version: RESPONSIVE_PANEL_RESIZE_VERSION,
      frame,
      panel: targetPanel,
      componentState,
      sourceCssSize,
      stylesheetReport,
      options: {
        route: options.route,
        themeScope: options.themeScope,
        surfaceSelectors: options.surfaceSelectors,
        textSelectors: options.textSelectors,
      },
      get disposed() {
        return disposed;
      },
      dispose() {
        if (disposed) return false;
        disposed = true;
        frame.remove();
        return true;
      },
    };
  } catch (error) {
    frame.remove();
    throw error;
  }
}

/**
 * @param {Object} host
 * @param {Array<number>} cssSize
 * @param {Object} [options]
 * @returns {Promise<Object>}
 */
export async function captureResponsivePanelSnapshot(host, cssSize, options = {}) {
  if (host?.version !== RESPONSIVE_PANEL_RESIZE_VERSION || host.disposed) {
    throw new Error('captureResponsivePanelSnapshot requires an active responsive capture host.');
  }
  let targetCssSize = requirePair(cssSize, 'captureResponsivePanelSnapshot cssSize');
  host.frame.style.width = `${targetCssSize[0]}px`;
  host.frame.style.height = `${targetCssSize[1]}px`;
  await settleDocument(host.panel.ownerDocument);
  let panelRect = host.panel.getBoundingClientRect();
  let actualCssSize = [
    roundMetric(panelRect.width),
    roundMetric(panelRect.height),
  ];
  if (Math.abs(actualCssSize[0] - targetCssSize[0]) > 0.5
    || Math.abs(actualCssSize[1] - targetCssSize[1]) > 0.5) {
    throw new Error(
      `Responsive panel CSS host resolved ${actualCssSize.join(' × ')} px, `
      + `expected ${targetCssSize.join(' × ')} px.`,
    );
  }
  let snapshot = captureSpatialWindowSnapshot(host.panel, {
    ...host.options,
    ...options,
  });
  return {
    version: RESPONSIVE_PANEL_RESIZE_VERSION,
    snapshot,
    sourceCssSize: [...host.sourceCssSize],
    targetCssSize,
    actualCssSize,
    componentState: host.componentState,
    stylesheets: { ...host.stylesheetReport },
  };
}
